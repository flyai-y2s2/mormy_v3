import { NextRequest, NextResponse } from "next/server";
import { resetProfile } from "@/lib/profile";
import {
  startSession,
  onboard,
  beginSession,
  selectUnit,
  readyToTeach,
  askQuestion,
  continueTeaching,
  finishTeaching,
  stampSession,
  getSession,
  processTurn,
  reviveSession,
  type TurnResult,
} from "@/lib/orchestrator";

// Vercel Hobby 플랜의 함수 실행 상한이 60초다. 이보다 크게 잡으면 배포가 거부된다.
export const maxDuration = 60;

const ERROR_MESSAGE = "모르미가 잠깐 생각이 멈췄어요. 다시 말해주세요!";

/** switch 의 기본 분기를 400 으로 내려보내기 위한 표식 */
class UnknownAction extends Error {}

/**
 * 세션 API — 액션은 시나리오의 버튼과 1:1로 대응한다.
 *
 *  start      세션 생성                        → scene: onboarding (첫 만남) 또는 room
 *  onboard    첫 만남 진행 (이름·표지·작명)     → scene: onboarding → room
 *  reset      프로필 삭제 (데모용 — 첫 만남 재현)
 *  begin      '오늘 공부한 내용을 알려줄래!'    → scene: unit_select
 *  selectUnit 단원 카드 + '수업 준비하기'       → scene: dictionary
 *  ready      '준비 다 했어!'                   → 도움 요청
 *  accept     '응, 물어봐'                      → 모르미 오개념 발화
 *  turn       말하기 / 선택지 / '모르겠어'       → 가르치기 사이클
 *  continueTeaching '하나 더 가르쳐줄래!'        → 다음 개념
 *  finishTeaching   '오늘은 여기까지'            → 총정리
 *  stamp      '맞아'/'아니야' 도장                → 세션 종료 (아니야 1회는 사전 재확인)
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "start") {
    // 화면이 profile 키를 보냈는지 자체가 의미다 — null 은 "첫 만남부터"라는 뜻이므로
    // 서버 파일로 되살리지 않는다.
    const sent = Object.prototype.hasOwnProperty.call(body, "profile");
    const { sessionId, turn } = startSession(sent ? (body.profile ?? null) : undefined);
    const state = getSession(sessionId);
    return NextResponse.json({ sessionId, ...turn, state, profile: state?.profile });
  }

  // 데모에서 첫 만남을 다시 보여주기 위한 초기화 (아이 화면에는 노출하지 않는다)
  if (body.action === "reset") {
    resetProfile();
    return NextResponse.json({ ok: true });
  }

  // 상태의 주인은 화면이다 — 화면이 보낸 상태를 서버 메모리보다 우선한다.
  // 화면은 '성공한 턴'의 상태만 보관하므로, 응답이 중간에 실패한 턴을
  // 다시 보내도 깨끗한 기저에서 재실행된다. 서버 메모리를 우선하면
  // 실패한 턴이 이미 변이시킨 상태(소진된 예산·내려간 사다리) 위에서
  // 같은 턴이 한 번 더 실행되어, 몇 번의 재시도만으로 세션이 닫혀 버린다.
  const state = reviveSession(body.state) ?? getSession(body.sessionId);
  if (!state) {
    return NextResponse.json({ error: "세션이 없습니다" }, { status: 404 });
  }

  // 응답에는 항상 상태를 실어 보낸다 — 다음 요청이 이걸 되돌려주며 세션을 잇는다.
  const withState = (turn: TurnResult) => ({
    ...turn,
    state,
    profile: state.profile,
  });

  const run = (): Promise<TurnResult> => {
    switch (body.action) {
      case "onboard":
        return onboard(state, String(body.childText ?? ""));
      case "begin":
        return beginSession(state);
      case "selectUnit":
        return Promise.resolve(selectUnit(state, String(body.concept ?? "")));
      case "ready":
        return Promise.resolve(readyToTeach(state));
      case "accept":
        return Promise.resolve(askQuestion(state));
      case "continueTeaching":
        return continueTeaching(state);
      case "finishTeaching":
        return finishTeaching(state);
      case "stamp":
        // agree 를 보내지 않는 구클라이언트는 '맞아'로 본다 — 세션은 닫혀야 한다.
        return stampSession(state, body.agree !== false);
      case "turn":
        return processTurn(
          state,
          String(body.childText ?? ""),
          Boolean(body.dontKnow),
          Boolean(body.viaTap),
        );
      default:
        throw new UnknownAction();
    }
  };

  // 화면이 스트리밍을 원하면 SSE로, 아니면 기존처럼 JSON 한 덩이로 응답한다.
  // (curl·테스트 스크립트는 그대로 JSON을 받는다)
  if (!body.stream) {
    try {
      return NextResponse.json(withState(await run()));
    } catch (e) {
      if (e instanceof UnknownAction) {
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
      }
      console.error("session error:", e);
      return NextResponse.json({ error: ERROR_MESSAGE }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      // 모르미 발화가 생성되는 대로 흘려보낸다 — 첫 글자를 빨리 띄우기 위해.
      state.sink = (chunk) => send("token", chunk);
      try {
        send("done", withState(await run()));
      } catch (e) {
        console.error("session error:", e);
        send("error", ERROR_MESSAGE);
      } finally {
        // sink 는 이번 요청에서만 유효하다. 남겨두면 다음 요청이 끊긴 연결에 쓴다.
        delete state.sink;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 프록시가 SSE를 버퍼링하면 스트리밍 효과가 사라진다.
      "X-Accel-Buffering": "no",
    },
  });
}
