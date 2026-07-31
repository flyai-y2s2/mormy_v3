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
  finishSession,
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
 *  stamp      '맞아' 도장                        → 세션 종료
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "start") {
    // 화면이 보관하던 프로필을 함께 받는다 (서버리스에는 저장된 파일이 없다)
    const { sessionId, turn } = startSession(body.profile ?? null);
    const state = getSession(sessionId);
    return NextResponse.json({ sessionId, ...turn, state, profile: state?.profile });
  }

  // 데모에서 첫 만남을 다시 보여주기 위한 초기화 (아이 화면에는 노출하지 않는다)
  if (body.action === "reset") {
    resetProfile();
    return NextResponse.json({ ok: true });
  }

  // 서버 메모리에 없으면 화면이 되돌려준 상태로 복원한다 (서버리스 대응)
  const state = getSession(body.sessionId) ?? reviveSession(body.state);
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
        return Promise.resolve(finishSession(state));
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
