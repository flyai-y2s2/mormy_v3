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
} from "@/lib/orchestrator";

export const maxDuration = 120;

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
    const { sessionId, turn } = startSession();
    return NextResponse.json({ sessionId, ...turn });
  }

  // 데모에서 첫 만남을 다시 보여주기 위한 초기화 (아이 화면에는 노출하지 않는다)
  if (body.action === "reset") {
    resetProfile();
    return NextResponse.json({ ok: true });
  }

  const state = getSession(body.sessionId);
  if (!state) {
    return NextResponse.json({ error: "세션이 없습니다" }, { status: 404 });
  }

  try {
    switch (body.action) {
      case "onboard":
        return NextResponse.json(await onboard(state, String(body.childText ?? "")));
      case "begin":
        return NextResponse.json(await beginSession(state));
      case "selectUnit":
        return NextResponse.json(selectUnit(state, String(body.concept ?? "")));
      case "ready":
        return NextResponse.json(readyToTeach(state));
      case "accept":
        return NextResponse.json(askQuestion(state));
      case "continueTeaching":
        return NextResponse.json(await continueTeaching(state));
      case "finishTeaching":
        return NextResponse.json(await finishTeaching(state));
      case "stamp":
        return NextResponse.json(finishSession(state));
      case "turn":
        return NextResponse.json(
          await processTurn(
            state,
            String(body.childText ?? ""),
            Boolean(body.dontKnow),
            Boolean(body.viaTap),
          ),
        );
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("session error:", e);
    return NextResponse.json(
      { error: "모르미가 잠깐 생각이 멈췄어요. 다시 말해주세요!" },
      { status: 500 },
    );
  }
}
