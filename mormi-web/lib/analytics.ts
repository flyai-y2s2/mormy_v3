/**
 * 계측 (PostHog) — 구조 데이터만 보낸다.
 *
 * 아동 대상 서비스이므로 절대 싣지 않는 것:
 *   아이 이름 · 아이 발화 원문 · 별노트 문장 · 모르미 발화 텍스트.
 * 싣는 것: 단원 id(개념 식별자) · 사다리 숫자 · 횟수 · 소요 ms · boolean 플래그.
 *
 * NEXT_PUBLIC_POSTHOG_KEY 가 없으면 posthog 가 초기화되지 않으므로
 * 아래 함수들은 전부 조용한 no-op 이 된다 — 앱 동작에는 영향이 없다.
 */
import posthog from "posthog-js";

/** 계측이 학습을 막는 일은 없어야 한다 — 어떤 실패도 삼킨다. */
export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (!posthog.__loaded) return;
    posthog.capture(event, props);
  } catch {
    /* 계측 실패는 조용히 넘어간다 */
  }
}

/**
 * 서버가 왕복시키는 세션 상태의 느슨한 관찰용 인터페이스.
 * lib/orchestrator.ts 의 SessionState 를 import 하지 않는 이유: 계측이 상태
 * 스키마에 결합되면 상태가 바뀔 때마다 빌드가 깨진다. 전부 optional 로 읽고,
 * 필드가 없으면 그 이벤트만 판정되지 않는다.
 */
interface TurnStateView {
  learnedIds?: string[];
  carriedIds?: string[];
  taughtRecaps?: string[];
  clarifyCount?: number;
  offTopicCount?: number;
  exceptionCount?: number;
  homeworkAsked?: boolean;
  homeworkTries?: number;
  dictationText?: string | null;
  generalizedNote?: { coauthored: boolean } | null;
  generalizeChoiceCorrect?: boolean;
  ladder?: number;
  phase?: string;
  scene?: string;
  itemId?: string | null;
  onboardStep?: number;
}

function view(raw: unknown): TurnStateView {
  return raw && typeof raw === "object" ? (raw as TurnStateView) : {};
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function count(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/** next 에만 있는 id 들 (배열이 append-only 라는 전제 — 상태 머신이 그렇게 쓴다) */
function added(prev: unknown, next: unknown): string[] {
  const before = list(prev);
  const after = list(next);
  return after.slice(before.length);
}

/**
 * 한 턴의 요청 전/후 상태를 비교해 무슨 일이 있었는지 이벤트로 남긴다.
 *
 * 판정 근거를 전부 상태 diff 로 두는 이유: 화면은 서버가 무엇을 결정했는지
 * 모른다(모르미 발화를 보고 추측하면 상태와 어긋난다). 상태 변화만이
 * '단원을 끝냈다 / 이월했다 / 사다리가 내려갔다'의 정직한 근거다.
 *
 * @param prev 요청 직전 stateRef.current
 * @param next 응답이 실어 보낸 state
 */
export function trackTurnDiff(
  action: string,
  prev: unknown,
  next: unknown,
  extra: {
    ms: number;
    firstTokenMs: number | null;
    viaTap?: boolean;
    dontKnow?: boolean;
  },
) {
  const p = view(prev);
  const n = view(next);
  const unit = n.itemId ?? p.itemId ?? null;

  track("turn", {
    action,
    ms: extra.ms,
    first_token_ms: extra.firstTokenMs,
    ladder: n.ladder,
    scene: n.scene,
    phase: n.phase,
    via_tap: !!extra.viaTap,
    dont_know: !!extra.dontKnow,
  });

  // 오늘 끝낸 개념 — learnedIds 에 새로 붙은 id
  for (const id of added(p.learnedIds, n.learnedIds)) {
    track("unit_completed", { unit: id });
  }

  // 이월 — carriedIds 에 새로 붙은 id.
  // 같은 턴에 taughtRecaps 도 늘었으면 '사전 따라 읽기로 확정하고 이월'이라
  // 순수 이월과 구분한다(아이가 문장을 산출한 이월이다).
  const carried = added(p.carriedIds, n.carriedIds);
  const recapGrew = list(n.taughtRecaps).length > list(p.taughtRecaps).length;
  for (const id of carried) {
    track(recapGrew ? "unit_completed_dictation" : "unit_carried", { unit: id });
  }

  // 사다리 하강 — 같은 개념 안에서 표현 수준이 내려갔을 때만 (개념이 바뀌면
  // 사다리가 3으로 리셋되므로 개념 전환을 하강으로 오독하면 안 된다)
  if (
    p.itemId != null &&
    n.itemId != null &&
    p.itemId === n.itemId &&
    count(n.ladder) < count(p.ladder)
  ) {
    track("ladder_down", { unit: n.itemId, from: p.ladder, to: n.ladder });
  }

  if (count(n.clarifyCount) > count(p.clarifyCount)) track("clarify_used", { unit });
  if (count(n.offTopicCount) > count(p.offTopicCount)) track("off_topic", { unit });
  if (count(n.exceptionCount) > count(p.exceptionCount))
    track("exception_path", { unit });

  // 숙제 검사 — 제시는 플래그가 켜지는 순간, 결과는 phase 가 homework 를 떠나는 순간
  if (!p.homeworkAsked && n.homeworkAsked === true) track("homework_shown", { unit });
  if (p.phase === "homework" && n.phase !== "homework") {
    track("homework_result", {
      tries: n.homeworkTries,
      correct: count(n.homeworkTries) === 0,
    });
  }

  // 일반화 — phase 가 generalize 를 떠나는 순간의 결과로 판정한다
  if (p.phase === "generalize" && n.phase !== "generalize") {
    const outcome = n.generalizedNote
      ? n.generalizedNote.coauthored
        ? "coauthored"
        : "self"
      : n.generalizeChoiceCorrect
        ? "choice_only"
        : "none";
    track("generalize_result", { outcome, unit });
  }

  // 첫 만남
  if (count(n.onboardStep) > count(p.onboardStep)) {
    track("onboarding_step", { step: n.onboardStep });
  }
  if (p.scene === "onboarding" && n.scene === "room") track("onboarding_completed");

  // 사전 따라 읽기 시작 — 이월 직전의 마지막 경로에 들어섰다
  if (!p.dictationText && !!n.dictationText) track("dictation_started", { unit });
}
