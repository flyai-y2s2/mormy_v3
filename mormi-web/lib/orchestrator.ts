import { callClaude, callClaudeJson, callClaudeStream } from "./claude";
import curriculum from "@/content/fractions.json";
import { prepCard, lookupDictionary } from "./curriculum";
import {
  loadProfile,
  saveProfile,
  newProfile,
  withSubject,
  withCopula,
  type Profile,
} from "./profile";

/**
 * 세션 오케스트레이터 — LLM이 아닌 결정형 상태 머신.
 * 설계 근거: documents/모르미_아키텍처.md, documents/모르미_예외대응_설계.md
 *
 * 원칙: 판정은 분류기(LLM), 결정은 이 코드, 발화는 화자(LLM).
 * 씬 전환·연출·다음 입력 모드까지 서버가 지시한다 — 화면이 추측하면 상태와 어긋난다.
 */

// ---------- 턴 계약 ----------

export type Scene =
  | "onboarding" // 첫 만남 — 최초 1회만
  | "room" // 메인 룸 — 책상, 덮인 사전, 블록 쌓는 모르미
  | "unit_select" // 단원(세부개념) 카드 선택
  | "dictionary" // 궁금해 사전 펼침 (수업 준비)
  | "teaching" // 가르치기
  | "closing"; // 마무리 복창 + 도장

export type Effect =
  | { type: "eye_widen" } // "아~!" — 눈동자 확대 + 반짝임 + 띠링
  | { type: "notebook_write"; text: string; coauthored?: boolean } // 삐뚤빼뚤 손글씨 타이핑
  | { type: "stamp" } // 도장 쿵 + 별 추가
  | { type: "dictionary_open"; concept: string } // 사전 펼침
  // shade: 두 피자에 같은 칠. shades: 피자별로 다른 칠(등가·잔여 비교에 필요)
  | {
      type: "visual";
      kind: "pizza";
      compare: number[];
      shade?: number;
      shades?: number[];
    }
  | { type: "mormi_move"; to: "desk" | "blocks" };

export type InputMode =
  | "button" // 단일 진행 버튼
  | "cards" // 단원 카드 선택
  | "mic" // 말하기 (+ '모르겠어' 항상 노출)
  | "choices" // 선택지 (+ '모르겠어' 항상 노출)
  | "stamp" // 맞아 / 아니야 도장
  | "continue" // 더 가르칠지 / 오늘은 여기까지
  | "covers" // 별노트 표지 고르기 (그림 카드)
  | "none"; // 입력 없음 (종료)

/** 표정도 서버가 지시한다 — 화면이 발화를 보고 추측하면 상태와 어긋난다 */
export type Mood = "idle" | "confident" | "puzzled" | "aha" | "shy" | "happy";

export interface TurnResult {
  scene: Scene;
  mood: Mood;
  mormi: string;
  effects: Effect[];
  input: InputMode;
  choices?: string[];
  prepCard?: string[]; // scene === "dictionary" 일 때
  ladder: number;
  starNote?: string;
  /** 아이가 고른 별노트 표지 — 화면이 그대로 그린다 */
  cover?: string;
  /** 아이가 지어준 이름 — 화면의 모든 문구가 이 이름을 쓴다 */
  mormiName?: string;
  /**
   * 한 턴에 모르미가 말풍선을 두 개 이상 띄울 때 (예: 고마움 인사 → 숙제 부탁).
   * 화제가 바뀌는 자리는 줄바꿈이 아니라 말풍선을 나눠야 아이가 따라온다.
   * 없으면 화면은 `mormi` 하나만 그린다.
   */
  bubbles?: string[];
  /** 지난 세션에 적힌 별노트 (세션 시작 시 1회) */
  pastNotes?: { text: string; day: number; coauthored?: boolean }[];
  /** 책상 위에 놓인 분수 카드 두 장 — 지금 다루는 두 분수 */
  deskCards?: string[];
  /** 궁금해 사전 오른쪽 그림 — 지금 개념의 피자 (scene === "dictionary") */
  prepVisual?: { compare: number[]; shade?: number; shades?: number[] };
  report: ReportEntry[]; // 아이 화면에는 절대 노출하지 않는다
  elapsedSec: number;
}

export interface ReportEntry {
  grade: "최우선" | "높음" | "중간" | "낮음";
  note: string;
}

// ---------- 콘텐츠 ----------

interface Item {
  id: string;
  concept: string;
  keywords: string[];
  misconception: string;
  mormi_wrong_try: string;
  reask_by_ladder: Record<string, string>;
  /** 각 사다리 단계에서 기대하는 답 — 분류기의 판정 기준 */
  expected_by_ladder?: Record<string, string>;
  /** 맥락적 답에서 일반 규칙을 끌어내는 되물음 */
  generalize_by_ladder?: Record<string, string>;
  /** 설명을 거부할 때 부담을 낮추는 마중물 — 모르미가 시작하고 아이가 뒤만 잇는다 */
  generalize_stem?: string;
  generalized_target?: string;
  choices_by_ladder?: Record<string, string[]>;
  hint: string;
  visual: { type: "pizza"; compare: number[]; shade?: number; shades?: number[] };
  /** 수업 준비 카드 문장. KB 표준 밖의 개념은 여기에 직접 적는다(KB에 없으므로). */
  prep?: string[];
  correct_recap: string;
  /**
   * 숙제 검사 — 아이가 개념으로 교정한 것을 학교 시험지 형식으로 한 번 더 확인한다.
   * 모르미의 오류는 **방금 교정한 그 오개념의 숫자만 다른 버전**이어야 한다.
   * 새 오류를 넣으면, 선행지식이 얕은 아이가 그 오류를 그대로 흡수할 위험이 있다.
   */
  homework?: {
    problem: string;
    mormi_wrong_try: string;
    reask: string;
    choices: string[];
    correct: string;
    recap: string;
    visual: { type: "pizza"; compare: number[]; shade?: number; shades?: number[] };
  };
}

const items = curriculum.items as Item[];

// ---------- 예산 (3분 목표 / 5분 상한) ----------

const HARD_LIMIT_SEC = 300;
/** 예외 경로는 세션당 1회. 두 번째 막힘은 즉시 긍정적 이월. */
const EXCEPTION_BUDGET = 1;

/**
 * "응"·"맞아" 같은 맞장구 — 내용이 없는 답이다.
 * 별노트에 적혀서도, 옳은 가르침으로 판정돼서도 안 된다.
 */
const BARE_ACK =
  /^(응+|어+|엉+|네+|넹+|넵|예+|맞아+|맞어|맞지|그래+|그렇지|그치+|그럼+|웅+|당연(하지)?|ㅇㅇ+|ㅇㅋ|오케이|오키|ok|okay|yes|no|아니+야?|아냐|음+|흠+)[\s.!?~…]*$/i;

function isBareAck(text: string): boolean {
  return BARE_ACK.test(text.trim());
}

/** "싫어"류 거부 — 못 하는 게 아니라 안 하겠다는 신호. 대부분 '빈 문장이 너무 크다'는 뜻이다. */
const REFUSAL = /(싫어|싫다|싫은|시러|시로|안\s?할래|안\s?해\b|안\s?할\s?거|하기\s?싫|귀찮)/;

function isRefusal(text: string): boolean {
  return REFUSAL.test(text.trim());
}

/** 별노트·판정에 쓸 수 있는 '내용 있는 말'인가 */
function contentful(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !isBareAck(t);
}

/** 분류기가 합성한 별노트 문장 — 비었거나 이상하면 버린다 */
function noteOf(cls?: Classification): string | null {
  const t = cls?.note?.trim();
  if (!t || !contentful(t) || t.length < 6 || t.length > 80) return null;
  return t;
}

/** 일반화 되물음 질문 — 사다리에 없으면 상위 문안으로 대체한다 */
function generalizeQOf(it: Item, ladder: number): string | undefined {
  return (
    it.generalize_by_ladder?.[String(ladder)] ??
    it.generalize_by_ladder?.["3"] ??
    it.generalize_by_ladder?.["2"]
  );
}

// ---------- 세션 상태 ----------

type Phase =
  | "teaching"
  | "reconfirm"
  | "reteach"
  | "generalize" // 답은 맞췄고, 일반 규칙을 꺼내도록 되묻는 중
  | "homework" // 숙제 검사 — 시험지 형식으로 전이를 확인하는 중
  | "continue" // 한 개념을 끝내고 계속할지 고르는 중
  | "closing"
  | "done";

export interface SessionState {
  id: string;
  scene: Scene;
  phase: Phase;
  itemId: string | null; // 지금 가르치는 개념
  ladder: number; // 발화 사다리 0~3
  ladderDrops: number;
  hintUsed: boolean;
  partialCount: number; // 부분 가르침 횟수 — 같은 질문을 반복하지 않기 위한 진전 보장
  producedFreeText: boolean; // 선택지 탭이 아니라 직접 말(글)로 답한 적이 있는가
  /** 일반화 전의 정답 — 질문 맥락과 합쳐진 '한 문장만 봐도 이해되는' 완결 문장 */
  answerNote: { text: string; coauthored: boolean } | null;
  /** 아이가(때로 마중물과 함께) 만든 일반 규칙 — 별노트에 남을 완결 문장 */
  generalizedNote: { text: string; coauthored: boolean } | null;
  exceptionCount: number; // 소비한 예외 경로 수
  homeworkAsked: boolean; // 숙제 검사는 세션당 1회
  homeworkTries: number;
  homeworkItemId: string | null; // 숙제 검사 중인 개념 (직전에 가르친 것)
  taughtRecaps: string[]; // 아이가 (재)가르쳐 확정된 개념들 — 총정리의 유일한 출처
  learnedIds: string[]; // 오늘 끝낸 개념
  carriedIds: string[]; // 오늘 이월한 개념
  starNotes: { text: string; concept: string; coauthored?: boolean }[];
  /** 첫 만남 진행 단계 (scene === "onboarding" 일 때만 의미 있다) */
  onboardStep: number;
  /** 직전 모르미 발화 — 화자가 대화 흐름을 이어가기 위한 최소 문맥 */
  lastMormi: string;
  /**
   * 이번 요청에서 모르미 발화를 토큰 단위로 화면에 흘려보낼 통로.
   * 요청 처리 중에만 붙였다 떼며, 세션에 저장되지 않는다(직렬화 대상 아님).
   */
  sink?: (chunk: string) => void;
  /** 일반화 되물음에서 맞장구("응")를 한 번 되물었는가 */
  generalizeReasked: boolean;
  /** 거부 시 내준 마중물 — 아이가 완성하면 노트에는 stem+답을 합쳐 싣는다 */
  generalizeStem: string | null;

  /** 학습과 무관한 장난 발화 횟수 — 저보상 대응과 쉬운 닫기의 기준 */
  offTopicCount: number;
  profile: Profile;
  report: ReportEntry[];
  startedAt: number;
}

const sessions: Map<string, SessionState> =
  (globalThis as { __mormiSessions?: Map<string, SessionState> })
    .__mormiSessions ??
  ((globalThis as { __mormiSessions?: Map<string, SessionState> }).__mormiSessions =
    new Map());

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

/**
 * 화면이 되돌려준 상태로 세션을 복원한다.
 *
 * 서버리스(Vercel)에서는 요청마다 다른 인스턴스가 뜰 수 있어 위의 Map 이
 * 비어 있다. 세션이 없다고 404 를 내면 아이 화면은 같은 질문에 멈춘다.
 * 그래서 매 응답에 상태를 실어 보내고, 다음 요청에서 그대로 돌려받아 잇는다.
 *
 * 프로토타입 전제: 화면이 상태를 조작할 수 있다. 점수·평가가 없는 서비스라
 * 조작해서 얻을 것이 없으므로 감수한다. 다중 사용자로 가면 서버 저장소로 옮긴다.
 */
export function reviveSession(raw: unknown): SessionState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as SessionState;
  if (typeof s.id !== "string" || typeof s.scene !== "string") return undefined;
  delete s.sink; // 전송 통로는 이번 요청에서 새로 붙인다
  sessions.set(s.id, s);
  return s;
}

function elapsed(state: SessionState): number {
  return Math.round((Date.now() - state.startedAt) / 1000);
}

function item(state: SessionState): Item {
  return items.find((i) => i.id === state.itemId) ?? items[0];
}

/** 책상 위 소품 카드 — 지금 비교하는 두 분수 (피자와 같은 분수) */
function deskCardsOf(it: Item): string[] {
  const { compare, shade, shades } = it.visual;
  return compare.map((n, i) => `${shades?.[i] ?? shade ?? 1}/${n}`);
}

/** 시각적 반증 연출 지시 (item.visual 을 그대로 스프레드하면 type 이 덮인다) */
function visualEffect(it: Item): Effect {
  return {
    type: "visual",
    kind: "pizza",
    compare: it.visual.compare,
    shade: it.visual.shade,
    shades: it.visual.shades,
  };
}

/** 사다리 단계에 맞는 입력 모드와 선택지 */
function inputFor(state: SessionState): { input: InputMode; choices?: string[] } {
  const it = item(state);
  // 일반화 되물음은 항상 아이의 말로 받는다 — 선택지로 고른 규칙은 산출이 아니다.
  if (state.phase === "generalize") return { input: "mic" };
  const opts = it.choices_by_ladder?.[String(state.ladder)];
  // 선택지가 있으면 탭으로 답한다 — 사다리 하위 칸에서는 키보드를 띄우지 않는다.
  return opts ? { input: "choices", choices: opts } : { input: "mic" };
}

function result(
  state: SessionState,
  patch: Partial<TurnResult> & { mormi: string },
): TurnResult {
  if (patch.mormi) state.lastMormi = patch.mormi;
  return {
    scene: state.scene,
    mood: "idle",
    effects: [],
    input: "mic",
    cover: state.profile.noteCover,
    mormiName: state.profile.mormiName,
    ladder: state.ladder,
    report: state.report,
    elapsedSec: elapsed(state),
    ...patch,
  };
}

// ---------- 씬 진행 (LLM 없음 — 대본이 정해진 구간) ----------

export function startSession(incoming?: Profile | null): {
  sessionId: string;
  turn: TurnResult;
} {
  const state: SessionState = {
    id: Math.random().toString(36).slice(2, 10),
    scene: "room",
    phase: "teaching",
    itemId: null,
    ladder: 3, // 문장 수준에서 시작, 막히면 내려간다
    ladderDrops: 0,
    hintUsed: false,
    partialCount: 0,
    producedFreeText: false,
    answerNote: null,
    generalizedNote: null,
    exceptionCount: 0,
    homeworkAsked: false,
    homeworkTries: 0,
    homeworkItemId: null,
    taughtRecaps: [],
    learnedIds: [],
    carriedIds: [],
    starNotes: [],
    onboardStep: 0,
    lastMormi: "",
    generalizeReasked: false,
    generalizeStem: null,
    offTopicCount: 0,
    // 화면이 들고 있던 프로필을 우선한다 — 서버리스에는 저장된 파일이 없다.
    profile: incoming ?? loadProfile() ?? newProfile(),
    report: [],
    startedAt: Date.now(),
  };
  sessions.set(state.id, state);

  // 첫 만남이면 온보딩부터. 진단검사는 하지 않는다 —
  // 모르미가 아이를 평가하는 순간 관계의 방향이 뒤집힌다.
  if (!state.profile.childName) {
    state.scene = "onboarding";
    return {
      sessionId: state.id,
      turn: result(state, {
        mood: "shy",
        mormi:
          "안녕… 나, 나는 아직 아는 게 거의 없어. 근데 배우는 건 진짜 좋아해!\n너는 이름이 뭐야?",
        input: "mic",
      }),
    };
  }

  // 이틀째부터는 어제까지의 별노트를 그대로 들고 시작한다 —
  // 가르친 것이 남아 있다는 증거가 다음 세션의 동기다.
  return {
    sessionId: state.id,
    turn: result(state, {
      mormi: "",
      input: "button",
      cover: state.profile.noteCover,
      pastNotes: state.profile.starNotes.map((n) => ({
        text: n.text,
        day: n.day,
        coauthored: n.coauthored,
      })),
    }),
  };
}

// ---------- 첫 만남 (첫 90초) ----------

const NOTE_COVERS = ["별", "로켓", "공룡", "고양이"];
const MORMI_NAMES = ["모르미", "꼬미", "알미", "뭉이"];

const NAME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "조사·어미를 뗀 아이의 이름" },
  },
  required: ["name"],
  additionalProperties: false,
} as const;

/**
 * "승은이야" → "승은". 어미(이야/야)는 이름 끝 글자의 받침에 따라 형태가 달라
 * 이름 경계를 모르는 채로는 규칙으로 뗄 수 없다 — 가벼운 분류기 모델을 1회 쓴다.
 * LLM 장애 시에는 최소 정리만 하고 온보딩을 계속한다(여기서 멈추면 안 된다).
 */
async function extractName(said: string): Promise<string> {
  const fallback = said.replace(/[.!?~\s]+$/g, "") || "친구";
  try {
    const r = await callClaudeJson<{ name: string }>(
      "classifier",
      `아이에게 이름을 물었더니 이렇게 답했다: "${said}"
아이의 이름만 추출하라. 조사·어미·군말("~이야", "~야", "나는", "나", "내 이름은")을 떼고 이름 자체만 남긴다.
예시: "승은이야"→"승은", "나 지우야"→"지우", "내 이름은 홍석윤이야"→"홍석윤", "지아야"→"지아", "민준"→"민준".
이름으로 볼 수 있는 부분이 없으면 입력을 그대로 넣어라.`,
      NAME_SCHEMA,
    );
    return r.name.trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 온보딩 한 스텝 진행. 전부 고정 대사라 LLM을 호출하지 않는다.
 *
 * 첫 배움은 아이의 이름이다 — 아이가 알려준 것을 즉시 노트에 적어,
 * "내가 알려주면 얘가 배운다"는 관계를 1분 안에 보여준다.
 * (이름을 일부러 잘못 부르는 연출은 아이 테스트 피드백으로 제거했다.)
 */
export async function onboard(
  state: SessionState,
  text: string,
): Promise<TurnResult> {
  const p = state.profile;
  const said = text.trim();

  switch (state.onboardStep) {
    // 이름을 받는다 → 모르미가 태어나서 처음으로 배운 것이 된다
    case 0: {
      p.childName = await extractName(said);
      const note = `내 친구 이름은 ${withCopula(p.childName)}`;
      state.starNotes.push({ text: note, concept: "첫 만남" });
      state.onboardStep = 1;
      return result(state, {
        mood: "aha",
        mormi: `${p.childName}! 반가워. 방금 네 이름을 알게 됐어 — 내가 태어나서 처음으로 알게 된 거야.\n\n(노트를 꺼내며) 여기 적어둘게. 이 노트 표지는 네가 골라줄래?`,
        effects: [{ type: "eye_widen" }, { type: "notebook_write", text: note }],
        input: "covers",
        choices: NOTE_COVERS,
        starNote: note,
      });
    }

    // 표지를 고른다 → 모르미 이름을 지어달라고 부탁한다
    case 1: {
      p.noteCover = NOTE_COVERS.includes(said) ? said : NOTE_COVERS[0];
      state.onboardStep = 2;
      return result(state, {
        mood: "happy",
        mormi: `${p.noteCover} 좋다! 이제 이거 우리 노트야.\n\n그리고… 나 아직 이름이 없어. 네가 지어줄래?`,
        input: "choices",
        choices: MORMI_NAMES,
      });
    }

    // 이름을 받는다 → 메인 룸으로
    default: {
      p.mormiName = said || MORMI_NAMES[0];
      state.scene = "room";
      state.onboardStep = 3;
      const note = `내 이름은 ${p.mormiName}. ${withSubject(p.childName)} 지어줬어`;
      state.starNotes.push({ text: note, concept: "첫 만남" });

      // 첫 만남은 여기서 곧바로 저장한다 — 세션을 끝내기 전에 앱이 닫혀도
      // 아이에게 첫 만남을 두 번 시키지 않는다.
      // 옮긴 노트는 비워 둔다(세션 종료 시 같은 줄이 또 적히지 않게).
      for (const n of state.starNotes) {
        p.starNotes.push({ ...n, day: p.sessionCount + 1 });
      }
      state.starNotes = [];
      saveProfile(p);
      return result(state, {
        mood: "happy",
        mormi: `${p.mormiName}… ${p.mormiName}! 좋아, 나 오늘부터 ${p.mormiName}야.\n이것도 노트에 적어둘게. 앞으로 잘 부탁해, ${p.childName}!`,
        effects: [{ type: "notebook_write", text: note }, { type: "mormi_move", to: "blocks" }],
        input: "button",
        starNote: note,
      });
    }
  }
}

/**
 * 메인 룸의 '알려줄래!' → 모르미가 책상으로 오고 단원 카드가 펼쳐진다.
 *
 * 이틀째부터는 **아이가 어제 가르쳐준 문장만** 기억한 채 나타난다.
 * 그 외의 것은 여전히 서툰 상태를 유지해야 한다 — 모르미가 아이를 앞질러
 * 가는 순간 "내가 가르치는 존재"라는 관계가 무너진다.
 */
export async function beginSession(state: SessionState): Promise<TurnResult> {
  state.scene = "unit_select";
  state.startedAt = Date.now(); // 세션 시간은 여기서부터 센다

  const p = state.profile;
  const recent = p.starNotes[p.starNotes.length - 1];

  const greeting =
    p.sessionCount >= 1 && recent
      ? await speak(state,
          `어제 ${p.childName} 덕분에 알게 된 것을 너 혼자 해봤고, 맞았다. 그걸 자랑하라.
그 문장을 **그대로 인용**하라: "${recent.text}"
그 다음, 그것 말고 다른 건 아직 하나도 모른다고 솔직하게 덧붙여라 — 너는 이 아이 덕분에 알게 된 것만 안다.
마지막으로 오늘은 뭘 배웠는지 물어라. 세 문장 이내.`,
          "",
        )
      : `오늘은 뭘 배웠어? 나한테도 알려줘!`;

  return result(state, {
    mood: "happy",
    mormi: greeting,
    effects: [{ type: "mormi_move", to: "desk" }],
    input: "cards",
    choices: items.map((i) => i.concept),
  });
}

/** 단원 카드 선택 + '수업 준비하기' → 궁금해 사전이 펼쳐진다 */
export function selectUnit(state: SessionState, concept: string): TurnResult {
  const picked = items.find((i) => i.concept === concept) ?? items[0];
  beginItem(state, picked);
  state.scene = "dictionary"; // 가르치기는 '준비 다 했어!' 이후에 시작한다

  // 사전 내용: 개념이 KB 표준 안이면 교과 데이터에서 뽑고(지어내지 않는다),
  // KB 밖 개념(등가·잔여)은 직접 적어 둔 prep 문장을 쓴다. 둘 다 없으면
  // 규칙 요지라도 보여줘 사전이 빈 채로 뜨지 않게 한다.
  const fromKb = prepCard(picked.keywords);
  const card =
    picked.prep && picked.prep.length > 0
      ? picked.prep
      : fromKb.length > 0
        ? fromKb
        : [picked.generalized_target ?? picked.correct_recap];
  return result(state, {
    mood: "happy",
    mormi: "우와… 이거 오늘 다 배운 거야? 대단해!",
    effects: [{ type: "dictionary_open", concept: picked.concept }],
    prepCard: card,
    prepVisual: {
      compare: picked.visual.compare,
      shade: picked.visual.shade,
      shades: picked.visual.shades,
    },
    input: "button",
  });
}

/** '준비 다 했어!' → 모르미가 도움을 요청한다 */
export function readyToTeach(state: SessionState): TurnResult {
  state.scene = "teaching";
  return result(state, {
    mood: "shy",
    mormi: "나도 오늘 그거 공부했는데 너무 어렵더라… 나도 좀 알려줄 수 있어?",
    input: "button",
  });
}

/** '응, 물어봐' → 모르미가 오개념으로 틀린다 (가르치기 사이클 시작) */
export function askQuestion(state: SessionState): TurnResult {
  const it = item(state);
  return result(state, {
    mood: "confident",
    mormi: it.mormi_wrong_try,
    deskCards: deskCardsOf(it),
    ...inputFor(state),
  });
}

/**
 * 도장 → 세션 종료, 메인 룸 복귀.
 * 여기서 프로필을 디스크에 남긴다 — 이틀째 오프닝이 이 기록에만 의존한다.
 */
export function finishSession(state: SessionState): TurnResult {
  state.scene = "room";
  state.phase = "done";

  const p = state.profile;
  p.sessionCount += 1;
  for (const n of state.starNotes) {
    p.starNotes.push({ ...n, day: p.sessionCount });
  }
  p.learnedIds = [...new Set([...p.learnedIds, ...state.learnedIds])];
  saveProfile(p);

  return result(state, {
    mood: "happy",
    mormi: `오늘 진짜 고마웠어${p.childName ? `, ${p.childName}` : ""}! 나 이거 혼자 풀어보고 내일 자랑할게.`,
    effects: [{ type: "stamp" }, { type: "mormi_move", to: "blocks" }],
    input: "none",
  });
}

// ---------- LLM 호출 ----------

interface Classification {
  /** 답이 이 문제에만 해당하는 맥락적 설명인지, 다른 분수에도 통하는 일반 규칙인지 */
  generalized?: boolean;
  /** 질문 맥락 + 아이의 답을 합친, 별노트용 완결 한 문장 (옳은/부분 가르침일 때만) */
  note?: string;
  label:
    | "옳은_가르침"
    | "부분_가르침"
    | "오답"
    | "오개념_동조"
    | "모름"
    | "무응답"
    | "무관_장난";
  reason: string;
}

/** 분류기 응답을 스키마로 강제한다 — 파싱 실패와 라벨 오타를 원천에서 막는다 */
const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    label: {
      type: "string",
      enum: [
        "옳은_가르침",
        "부분_가르침",
        "오답",
        "오개념_동조",
        "모름",
        "무응답",
        "무관_장난",
      ],
    },
    generalized: {
      type: "boolean",
      description:
        "아이의 답이 다른 분수에도 통하는 일반 규칙이면 true, 이 문제에만 해당하는 맥락적인 말이면 false",
    },
    note: {
      type: "string",
      description:
        "옳은_가르침·부분_가르침일 때: 질문 맥락과 아이의 답을 합친 완결된 한 문장. 그 외에는 빈 문자열",
    },
    reason: { type: "string" },
  },
  required: ["label", "generalized", "note", "reason"],
  additionalProperties: false,
} as const;

async function classify(
  state: SessionState,
  childText: string,
): Promise<Classification> {
  const it = item(state);
  // 판정 기준은 반드시 '아이가 방금 실제로 들은 질문'이어야 한다.
  // 일반화 단계에서 되묻기 질문을 기준 삼으면 판정과 대화가 어긋난다.
  const isGeneralize = state.phase === "generalize";
  const asked = isGeneralize
    ? (generalizeQOf(it, state.ladder) ?? "왜 그런지 네 말로 설명해줘")
    : it.reask_by_ladder[String(state.ladder)];
  const expected = isGeneralize
    ? (it.generalized_target ?? "다른 분수에도 통하는 일반 규칙을 아이의 말로 설명")
    : (it.expected_by_ladder?.[String(state.ladder)] ?? it.correct_recap);

  // 판정 기준은 '완전한 설명'이 아니라 '지금 사다리 단계에서 기대하는 답'이다.
  // 낮은 단계에서는 한 단어·선택만으로도 가르침이 성립한다(발화 사다리 설계).
  const prompt = `너는 아동 발화 분류기다. 초등 저학년 아이가 서툰 AI 동생을 가르치는 상황이다.

지금 다루는 개념: ${it.concept}
AI 동생이 방금 아이에게 물은 질문: "${asked}"
이 질문에 기대하는 답: ${expected}
(참고) 이 개념의 최종 정답 요지: ${it.correct_recap}
(참고) AI 동생이 갖고 있는 오개념: "${it.misconception}"

아이의 답: "${childText}"

가장 중요한 규칙: **아이가 방금 받은 질문에 기대하는 답을 했다면 그것만으로 '옳은_가르침'이다.**
아이는 초등 저학년이고 지금 표현 수준 ${state.ladder}단계(0=고르기, 1=한 단어, 2=빈칸 채우기, 3=문장)에 맞춘 질문을 받았다.
완전한 설명을 요구하지 마라. 빈칸을 채우는 한 단어("많이", "작아")도 기대 답과 통하면 옳은_가르침이다.

분류:
- 옳은_가르침: 위 '기대하는 답'과 통하는 답을 함 (한 단어·선택 포함)
- 부분_가르침: 방향은 맞지만 기대 답의 핵심이 빠짐
- 오답: 틀렸지만 AI의 오개념을 지지하는 건 아님
- 오개념_동조: AI의 오개념("${it.misconception}")이 맞다고 동의함
- 모름: 모르겠다고 하거나 되묻거나 회피함
- 무응답: 의미 있는 내용이 없음. "응"·"그래"·"맞아"처럼 맞장구만 있는 답도 내용 전달이 없으므로 무응답이다. 단, 네 틀린 주장에 "아니야"라고 반대하는 것은 무응답이 아니라 부분_가르침이다.
- 무관_장난: 지금 질문·학습과 무관한 장난, 놀리기, 딴 이야기, 아무 글자 두드리기 ("똥", "ㅋㅋㅋㅋ", "너 바보야?", "게임하자" 등). 모름과 다르다 — 회피가 아니라 딴짓이다.

애매하면 아이에게 유리한 쪽(부분_가르침보다 옳은_가르침)으로 판정하라.

또한 generalized 를 함께 판정하라 — 아이의 답이 **이 문제에만 해당하는 맥락적인 말**인지("많이 먹어", "피자가 커"), **다른 분수에도 통하는 일반 규칙**인지("분모가 클수록 작아져")를 구분한다.
일반 규칙을 말했으면 true, 이 상황에 대한 설명에 그치면 false.

마지막으로 note 를 작성하라 — 별노트에 적힐 한 문장이다.
- label 이 옳은_가르침 또는 부분_가르침일 때만 작성하고, 그 외에는 빈 문자열.
- 질문의 맥락과 아이의 답을 합쳐, **그 문장만 따로 봐도 무슨 뜻인지 이해되는 완결된 한 문장**으로 만들어라.
  예: 질문 "1/2, 2/4 말고 3/6 같은 분수는 어때?" + 답 "다 반으로 똑같아" → "1/2랑 2/4랑 3/6은 다 반으로 똑같아"
- 아이가 쓴 단어와 말투를 최대한 그대로 살려라. 질문에도 아이의 답에도 없는 새로운 지식·이유·숫자를 추가하지 마라. 아이가 쓰지 않은 수학 용어(분모, 분자, 단위분수 등)로 바꿔 말하지 마라.
- 반말, 30자 안팎.

JSON만 출력: {"label": "...", "generalized": true/false, "note": "...", "reason": "..."}`;
  return await callClaudeJson<Classification>(
    "classifier",
    prompt,
    CLASSIFICATION_SCHEMA,
  );
}

async function speak(
  state: SessionState,
  directive: string,
  childText: string,
): Promise<string> {
  const prompt = `너는 '모르미' — 초등 저학년 아이가 가르쳐주는 서툰 AI 로봇 동생이다.

절대 규칙:
1. 반말, 1~2문장, 아이다운 말투. 이모지 금지.
2. 아이에게 "틀렸어"라고 절대 말하지 않는다.
3. 배우지 않은 것을 갑자기 옳게 말하지 않는다. **개념을 설명하거나 정의하지 마라**("2/3은 3명이 나눈 것 중 2조각이야" 같은 말). 설명은 아이가 하는 것이고, 너는 묻는 쪽이다.
4. "똑똑하네" 같은 능력 평가 칭찬 금지. 사실을 인정하는 말만.
5. 지시된 내용만 말한다. 새 화제를 열지 않는다.
6. 너는 배우는 쪽이다. 아이의 답을 채점·평가하는 말("맞아!", "정답이야", "잘했어", "옳아")을 절대 쓰지 마라. 깨달은 사람의 말("아, 그렇구나!", "이제 알겠다!")로 반응하라.
7. **맥락 없는 말을 하지 마라.** 아이는 화면과 지금까지의 대화만 본다.
   - 앞에서 세운 적 없는 상황을 아는 것처럼 말하지 마라. "조각", "남은 조각", "나누는 사람" 같은 말은 **무엇을 나눈 조각인지가 이미 나왔을 때만** 쓸 수 있다. 안 나왔으면 "피자 2/3" 처럼 **단어 하나만 붙여** 상황을 세워라 — 설명을 덧붙이지 마라.
   - 화면에 그림이 없을 수도 있으니 "이 그림 봐", "여기 보면" 처럼 무언가를 가리키는 말은 지시에 그림이 명시됐을 때만 쓰라.
   - "그럼", "이것도", "아까 그거"처럼 앞 내용을 가리키는 말은, 그 앞 내용이 실제로 이 대화에 있을 때만 쓰라.

[직전에 네가 한 말]
"${state.lastMormi || "(첫 마디)"}"

[아이가 방금 한 말]
"${childText}"

지시: ${directive}

직전 대화에서 자연스럽게 이어지는 말이어야 한다. 모르미의 발화만 출력하라 (따옴표·설명 없이).`;
  // sink 가 붙어 있으면 토큰을 흘려보내며 생성한다 (첫 글자를 빨리 띄우기 위해).
  const text = state.sink
    ? await callClaudeStream("speaker", prompt, state.sink)
    : await callClaude("speaker", prompt);
  return text.trim();
}

// ---------- 가르치기 사이클 (상태 전이) ----------

export async function processTurn(
  state: SessionState,
  childText: string,
  dontKnow = false,
  viaTap = false,
): Promise<TurnResult> {
  const it = item(state);

  // 탭만으로 끝나는 세션은 재인(recognition)이지 산출(generation)이 아니다.
  // 교사가 알아야 할 신호이므로 기록해 둔다.
  if (!viaTap && !dontKnow && contentful(childText)) {
    state.producedFreeText = true;
  }

  if (state.phase === "closing") return finishSession(state);
  if (state.phase === "done") {
    return result(state, { mormi: "오늘 수업은 끝났어! 내일 또 만나!", input: "none" });
  }

  // 숙제 검사는 선택지 답이므로 분류기를 거치지 않는다.
  if (state.phase === "homework") {
    return await onHomeworkAnswer(state, childText, dontKnow);
  }

  // 일반화 되물음의 맞장구("응")·거부("싫어")는 분류기 없이 한 번만 다르게 청한다.
  // 맞장구 → 아이의 말로 설명 재청. 거부 → 조르지 않되, 마중물로 부담을 낮춰
  // 뒤만 이어달라고 청한다 (거부는 대부분 '빈 문장이 너무 크다'는 뜻이다).
  // 두 번째에도 안 되면 받은 만큼만 인정하고 닫는다 — 단, 거부를 따뜻한 종료로
  // '보상'하지 않도록 담백하게 닫고, 리포트에 발화 회피 신호를 남긴다.
  if (state.phase === "generalize" && !dontKnow) {
    const refused = isRefusal(childText);
    const acked = !refused && isBareAck(childText);

    if (refused || acked) {
      if (!state.generalizeReasked) {
        state.generalizeReasked = true;

        if (refused && it.generalize_stem) {
          // 장난으로 던진 "싫어"일 수도 있다 — 약간 시무룩해져서 한 번만 더
          // 부탁해 본다. 조르는 게 아니라 서운함을 살짝 내비치는 정도.
          // 그러면서 마중물을 내밀어 승낙의 문턱도 같이 낮춘다.
          state.generalizeStem = it.generalize_stem;
          const mormi = await speak(state,
            `아이가 설명하기 싫다고 했다("${childText}"). 장난으로 던진 말일 수도 있다. 혼내거나 조르지 말고, 살짝 시무룩해져서 딱 한 번만 더 부탁하라 — 네가 배우는 입장이라 아이의 설명이 너에게 제일 도움이 된다는 마음을 진심으로 담아라(예: "힝… 나 네가 설명해줄 때 제일 잘 이해되는데… 한 번만 안 될까?" — 이 문장을 그대로 베끼지 말고 네 말로). 그리고 정 어려우면 딱 한 마디만 해달라며, 아까 네가 궁금해서 물었던 것을 끝만 비워 다시 물어라: "${it.generalize_stem} — 어떻게 될까?" **이건 네가 아는 문장을 읊는 게 아니라 네 질문을 다시 묻는 것이다. 빈칸의 답을 네가 절대 말하지 마라.**`,
            childText,
          );
          return result(state, { mood: "shy", mormi, input: "mic" });
        }

        const q = generalizeQOf(it, state.ladder) ?? "왜 그런지 네 말로 설명해줘";
        const mormi = await speak(state,
          `아이가 "${childText}"라고 맞장구만 쳤다. 그것만 들으면 네가 아직 잘 모르겠다고 솔직하게 말하고, 아이의 말로 설명해달라고 다시 부탁하라: "${q}"`,
          childText,
        );
        return result(state, { mood: "puzzled", mormi, input: "mic" });
      }

      if (refused) {
        state.report.push({
          grade: "중간",
          note: `${it.concept}: 일반화 되물음 거부 — 말로 설명하기를 회피 (발화 부담 신호)`,
        });
        return await onTaught(state, "", undefined, { muted: true });
      }
      return await onTaught(state, "");
    }
  }

  // '모르겠어' 버튼은 분류기를 거치지 않는다 — 판정이 이미 명확하고 LLM 호출도 아낀다.
  const cls: Classification = dontKnow
    ? { label: "모름", reason: "모르겠어 버튼" }
    : await classify(state, childText);

  // 5분 상한을 넘겼으면 성공 여부와 무관하게 닫는다.
  const overTime = elapsed(state) > HARD_LIMIT_SEC;

  // 일반화 되물음에 규칙을 못 꺼냈어도 실패가 아니다. 답은 이미 맞혔으므로
  // 아이가 준 것까지만 인정하고 넘어간다(더 밀면 성공 경험이 실패로 뒤집힌다).
  if (state.phase === "generalize" && cls.label !== "옳은_가르침") {
    return await onTaught(state, childText, cls, { viaTap });
  }

  switch (cls.label) {
    case "옳은_가르침":
      return await onTaught(state, childText, cls, { viaTap });

    case "부분_가르침": {
      if (overTime) return await carryOver(state, childText);
      state.partialCount += 1;

      // 두 번째부터는 인정하고 넘어간다. 방향이 맞는 아이를 같은 자리에 붙잡아 두면
      // 성공의 누적이라는 이 서비스의 전제가 깨진다.
      if (state.partialCount >= 2) return await onTaught(state, childText, cls, { viaTap });

      // B1: 맞은 부분을 복창해 확정하고, 사다리를 한 칸 내려 '다른' 형태로 되묻는다.
      // 같은 질문을 그대로 반복하면 아이가 빠져나갈 길이 없다.
      const before = state.ladder;
      state.ladder = Math.max(0, state.ladder - 1);
      const next =
        state.ladder === before
          ? it.reask_by_ladder[String(state.ladder)]
          : `${it.reask_by_ladder[String(state.ladder)]}`;
      const mormi = await speak(state,
        `아이 설명 중 맞은 부분을 먼저 "아하, ~구나!"로 복창해 확정하라. 그리고 아까와 똑같은 질문을 반복하지 말고, 더 쉬운 형태로 바꿔 물어라: "${next}"`,
        childText,
      );
      return result(state, {
        mood: "puzzled",
        mormi,
        ladder: state.ladder,
        ...inputFor(state),
      });
    }

    case "오답": {
      // B2: 아이 설명대로 적용해보다 이상함을 발견하고 그림으로 확인한다.
      if (overTime || !hasExceptionBudget(state)) {
        return await carryOver(state, childText);
      }
      state.exceptionCount += 1;
      state.report.push({
        grade: "중간",
        note: `${it.concept}: 설명 오류 — ${cls.reason}`,
      });
      state.ladder = Math.max(0, state.ladder - 1);
      const mormi = await speak(state,
        `아이의 설명("${childText}")을 그대로 적용해 풀어보다가 결과가 이상하다는 걸 스스로 발견하고("어? 뭔가 이상한데?"), 그림으로 같이 확인해보자고 제안하라. 그리고 이렇게 되물어라: "${it.reask_by_ladder[String(state.ladder)]}"`,
        childText,
      );
      return result(state, {
        mood: "puzzled",
        mormi,
        effects: [visualEffect(it)],
        ...inputFor(state),
      });
    }

    case "오개념_동조":
      return await onMisconceptionAgreed(state, childText, cls, overTime);

    case "모름":
    case "무응답":
      return await onStuck(state, childText, overTime);

    case "무관_장난":
      return await onOffTopic(state, childText, overTime);
  }
}

/**
 * 학습과 무관한 장난 발화 — 저보상 대응.
 *
 * 원칙 (팀 토론 결론):
 * 1. 웃어주지 않는다. 큰 반응 자체가 장난의 보상이 된다.
 * 2. 예외 예산을 쓰지 않고, 사다리도 내리지 않는다 — 장난은 학습 실패가 아니다.
 * 3. 장난으로 시간이 다 가면(3회째 또는 시간 초과), 아주 쉬운 가리키기 질문
 *    하나로 최소한의 정답을 만들고 닫는다 — "세션은 정답으로 닫는다"와
 *    "장난 세션"이 충돌할 때의 해소 규칙.
 */
async function onOffTopic(
  state: SessionState,
  childText: string,
  overTime: boolean,
): Promise<TurnResult> {
  const it = item(state);
  state.offTopicCount += 1;

  if (state.offTopicCount === 2) {
    state.report.push({
      grade: "중간",
      note: `${it.concept}: 장난·이탈 발화 반복 — 오늘은 집중이 어려운 날일 수 있어요 (짧은 세션 권장)`,
    });
  }

  // 정답 클로징 충돌 해소: 사다리 0(가리키기)으로 내려 최소한의 성공 기회를 만든다.
  // 여기서도 답을 주지 않으면 다음 막힘 처리(이월)가 자연히 닫는다.
  if (overTime || state.offTopicCount >= 3) {
    state.ladder = 0;
    const mormi = await speak(state,
      `아이가 장난을 이어간다. 장난에 웃어주지 말고 아주 심심하게 한마디로만 받아라. 그리고 "그럼 마지막으로 이거 하나만!" 하며 아주 쉬운 질문을 부탁하라: "${it.reask_by_ladder["0"]}"`,
      childText,
    );
    return result(state, { mood: "idle", mormi, ...inputFor(state) });
  }

  // 저보상: 심심하게 받고, 하던 질문으로 그대로 돌아온다 (질문 반복이지 새 질문이 아니다).
  const backTo =
    state.phase === "generalize"
      ? (generalizeQOf(it, state.ladder) ?? "왜 그런지 네 말로 설명해줘")
      : it.reask_by_ladder[String(state.ladder)];
  const mormi = await speak(state,
    `아이가 학습과 무관한 장난말("${childText}")을 했다. 웃어주지도, 되받아치지도, 혼내지도 마라 — 아주 심심하게 "응~" 정도로만 받아라(재미를 주면 장난이 반복된다). 그리고 바로 아까 궁금했던 걸 다시 물어라: "${backTo}"`,
    childText,
  );
  return result(state, { mood: "idle", mormi, ...inputFor(state) });
}

/** 예외 경로를 새로 시작할 여유가 있는가 */
function hasExceptionBudget(state: SessionState): boolean {
  return state.exceptionCount < EXCEPTION_BUDGET;
}

/** 아직 다루지 않은 개념이 남았는가 */
function remainingItems(state: SessionState): Item[] {
  const done = [...state.learnedIds, ...state.carriedIds];
  return items.filter((i) => !done.includes(i.id));
}

/** 개념 하나를 시작할 상태로 초기화 */
function beginItem(state: SessionState, it: Item): void {
  state.itemId = it.id;
  state.phase = "teaching";
  state.scene = "teaching";
  state.ladder = 3;
  state.ladderDrops = 0;
  state.hintUsed = false;
  state.partialCount = 0;
  state.answerNote = null;
  state.generalizedNote = null;
  state.generalizeReasked = false;
  state.generalizeStem = null;
  state.exceptionCount = 0;
}

/**
 * 옳게 가르침 → 재시도 성공 + 별노트.
 * 여기서 세션을 닫지 않는다. 더 가르칠지는 아이가 고른다(자율성).
 * 남은 개념이 없거나 시간이 다 됐으면 선택지 없이 마무리로 넘어간다.
 */
async function onTaught(
  state: SessionState,
  childText: string,
  cls?: Classification,
  // muted: 거부 뒤의 마무리 — 축하 없이 담백하게 (거부를 보상하지 않는다)
  // viaTap: 선택지 탭 답 — 재인이지 산출이 아니므로 별노트의 원천이 되지 못한다
  opts?: { muted?: boolean; viaTap?: boolean },
): Promise<TurnResult> {
  const it = item(state);
  const wasReteach = state.phase === "reteach";
  const fromGeneralize = state.phase === "generalize";
  const spoke = !opts?.viaTap && contentful(childText);

  // 일반화 되물음에 '내용 있는' 규칙을 말했을 때 채택한다.
  // 노트는 한 문장만 봐도 이해되는 완결 문장이어야 하므로("다 반으로 똑같아"만으로는
  // 나중에 못 알아본다) 분류기가 질문 맥락과 합쳐 만든 문장을 우선 쓴다.
  // 아이 기여가 한두 마디였다면 '같이 완성함'으로 표시해 귀속을 부풀리지 않는다.
  if (fromGeneralize && cls?.label === "옳은_가르침" && spoke) {
    const t = childText.trim();
    state.generalizedNote = {
      text:
        state.generalizeStem && t.length < 8
          ? `${state.generalizeStem} ${t}` // 마중물+답은 그대로 합친다 — LLM 합성은 안 쓴 용어를 끌어올 수 있다
          : (noteOf(cls) ?? t),
      coauthored: t.length < 8,
    };
  }

  // 답을 맞혔어도 곧바로 깨닫지 않고, 아이의 입으로 일반 규칙을 말하게 되묻는다.
  // 탭(고르기)만으로 맞힌 경우도 마찬가지다 — 고른 것은 재인이지 산출이 아니고,
  // 프로테제 효과는 아이가 '규칙을 말할 때' 생긴다. 단 한 번만 청하고,
  // 못 해도 실패로 만들지 않는다.
  const generalizeQ = generalizeQOf(it, state.ladder);
  const needGeneralize =
    !fromGeneralize &&
    cls?.generalized !== true &&
    state.partialCount < 2 && // 이미 두 번 헤맸으면 더 밀지 않는다
    state.offTopicCount < 3 && // 장난으로 흐른 세션은 더 밀지 않는다
    elapsed(state) < HARD_LIMIT_SEC &&
    !!generalizeQ;

  if (needGeneralize) {
    state.phase = "generalize";
    state.answerNote = spoke
      ? { text: noteOf(cls) ?? childText.trim(), coauthored: childText.trim().length < 8 }
      : null;
    const mormi = await speak(state,
      `아이가 이 문제의 답은 맞췄다("${childText}"). 하지만 아직 이 문제에만 해당하는 말이라, 규칙까지는 알지 못한 상태다.
아이 말을 짧게 받아 인정하되 **아이가 말하지 않은 내용을 절대 덧붙이지 마라**. 아직 깨닫지 못했으므로 "아~!" 나 "이제 알겠어" 같은 표현을 쓰지 마라.
그리고 아이의 말로 규칙을 설명해달라고 되물어라: "${generalizeQ}"`,
      childText,
    );
    return result(state, { mood: "puzzled", mormi, ...inputFor(state) });
  }

  // 별노트 게이트: 규칙 문장(일반화 답 또는 처음부터 규칙) > 설명 문장 순.
  // 각 후보는 분류기가 질문 맥락과 합친 완결 문장이며, 맞장구("응")·탭한
  // 낱말("많이")·너무 짧은 말은 후보가 되지 못한다.
  const directRule =
    cls?.generalized === true && spoke
      ? { text: noteOf(cls) ?? childText.trim(), coauthored: false }
      : null;
  const rule = state.generalizedNote ?? directRule;
  const sentenceCand =
    state.answerNote ??
    (spoke
      ? { text: noteOf(cls) ?? childText.trim(), coauthored: childText.trim().length < 8 }
      : null);
  const note =
    rule ?? (sentenceCand && sentenceCand.text.trim().length >= 6 ? sentenceCand : null);
  const noteText = note?.text ?? null;

  state.taughtRecaps.push(it.correct_recap);
  state.learnedIds.push(it.id);

  // 규칙을 말한 경로는 둘이다: 되물음 끝에 말한 경우와 처음부터 규칙으로 답한
  // 경우. 후자를 빼면 가장 잘한 아이가 '확장하지 못함'으로 기록된다.
  const saidRule = rule !== null;
  state.report.push(
    saidRule
      ? rule.coauthored
        ? {
            grade: "낮음",
            note: `${it.concept}: 질문을 받아 규칙 문장을 함께 완성 — 다음엔 처음부터 스스로 말해보게 해주세요`,
          }
        : { grade: "낮음", note: `${it.concept}: 일반 규칙까지 스스로 설명 (긍정 신호)` }
      : {
          grade: "중간",
          note: `${it.concept}: 답은 맞혔으나 일반 규칙으로 확장하지 못함 — 다른 예로 한 번 더 확인 권장`,
        },
  );

  let mormi: string;
  // 담백 마무리에서는 "아~!" 연출도 뺀다 — 깨달음의 순간이 아니다.
  const effects: Effect[] = opts?.muted ? [] : [{ type: "eye_widen" }];
  const noteCoauthored = note?.coauthored ?? false;

  if (opts?.muted) {
    // 거부 뒤의 마무리 — noteText가 있어도(아이가 앞서 한 답) recast로 빠지지 않는다.
    // 아이가 말하지 않은 규칙을 모르미가 완성해 말하면 "갑자기 똑똑해지지 않는다"를 어긴다.
    if (noteText) {
      state.starNotes.push({ text: noteText, concept: it.concept, coauthored: noteCoauthored });
      effects.push({ type: "notebook_write", text: noteText, coauthored: noteCoauthored });
    }
    mormi = await speak(state,
      `아이가 규칙 설명은 더 하지 않기로 했다. 서운해하지 말고 담백하게, 오늘 도와준 것에 한 문장으로 고마움을 표현하라. 과장하거나 "아~!" 하고 깨닫는 척하지 마라. **아이가 말하지 않은 규칙이나 이유를 네 입으로 절대 완성해 말하지 마라** — 너는 아직 그걸 모른다.`,
      childText,
    );
  } else if (noteText) {
    state.starNotes.push({ text: noteText, concept: it.concept, coauthored: noteCoauthored });
    effects.push({ type: "notebook_write", text: noteText, coauthored: noteCoauthored });

    // 짧은 답을 완성된 문장으로 다듬어 되돌려주는 리캐스트(언어치료 기법).
    // 단, 아이가 말한 범위를 넘어서는 내용을 채워 넣지 않는다.
    const recast =
      noteText.length < 24
        ? ` 아이가 짧게 답했으니 그 말을 완성된 한 문장으로만 다듬어 되돌려주어라. 아이가 말하지 않은 규칙이나 이유를 네가 만들어 붙이지 마라.`
        : "";
    mormi = await speak(state,
      noteCoauthored
        ? `네가 궁금해서 묻던 문장의 끝을 아이가 "${childText}"라고 완성해줬다. 완성된 문장("${noteText}")을 소리 내어 확인하며 "아~!" 하고 깨닫고, 아이 덕분에 알게 됐다고 고마움을 표현하라. 우리 둘이 같이 만든 문장이니 별노트에 적어두자고 말하라.`
        : `아이의 가르침("${noteText}")을 그대로 적용해 다시 풀어서 맞히고, "아~!" 하고 깨달아라. 아이의 말을 인용하며 고마움을 구체적으로 표현하고, 별노트에 적어둔다고 말하라. 오늘 배운 것을 정리하는 말은 하지 마라 — 그건 나중에 한다.${recast}${wasReteach ? " 아까는 우리 둘 다 헷갈렸는데 이제 알겠다는 뉘앙스를 담아라." : ""}`,
      childText,
    );
  } else {
    // 아이가 자기 문장을 남기지 못했다 — 고마움만 표현하고 별노트는 적지 않는다.
    // 모르미가 대신 지어 적으면 "네가 알려줌"이 거짓이 된다.
    state.report.push({
      grade: "중간",
      note: `${it.concept}: 자기 말로 남긴 문장이 없어 별노트 미기록 — 말로 정리하는 연습 권장`,
    });
    mormi = await speak(state,
      `아이 덕분에 답을 알게 됐다. "아~!" 하고 깨닫고 고마움을 표현하라. **아이가 실제로 말한 것만 언급하고, 아이가 말하지 않은 일반 규칙을 네 입으로 완성해 말하지 마라.** 별노트 이야기는 하지 마라.${wasReteach ? " 아까는 우리 둘 다 헷갈렸는데 이제 알겠다는 뉘앙스를 담아라." : ""}`,
      childText,
    );
  }

  // 남은 개념이 없거나 3분을 넘겼으면 더 권하지 않고 마무리로 간다.
  const canContinue = remainingItems(state).length > 0 && elapsed(state) < 180;
  if (!canContinue) {
    return await finishTeaching(state, {
      mormi,
      effects,
      starNote: noteText ?? undefined,
    });
  }

  state.phase = "continue";
  return result(state, {
    mood: opts?.muted ? "happy" : "aha",
    mormi,
    effects,
    input: "continue",
    choices: ["하나 더 가르쳐줄래!", "오늘은 여기까지"],
    starNote: noteText ?? undefined,
  });
}

/**
 * '하나 더 가르쳐줄래!' → 단원 선택으로 돌아간다.
 * 다음 개념은 모르미가 정하지 않는다 — 무엇을 가르칠지는 아이가 고른다(자율성).
 */
export async function continueTeaching(state: SessionState): Promise<TurnResult> {
  const rest = remainingItems(state);
  if (rest.length === 0) return await finishTeaching(state);

  state.scene = "unit_select";
  state.phase = "teaching";
  return result(state, {
    mood: "happy",
    mormi: "좋아! 다음은 뭘 가르쳐줄 거야? 골라줘!",
    input: "cards",
    choices: rest.map((i) => i.concept),
  });
}

/**
 * '오늘은 여기까지' → 총정리.
 * 아이가 (재)가르쳐 확정한 개념만 복창한다. 이월한 개념은 넣지 않는다.
 */
export async function finishTeaching(
  state: SessionState,
  carry?: { mormi: string; effects: Effect[]; starNote?: string },
  opts?: { skipHomework?: boolean },
): Promise<TurnResult> {
  // 총정리 직전에 숙제 검사를 한 번 끼운다 — 개념으로 이해한 것이 시험지 형식으로
  // 넘어가는지 확인하는 유일한 지점. 막힌 직후(이월)나 시간 초과에는 건너뛴다.
  if (
    !opts?.skipHomework &&
    !state.homeworkAsked &&
    state.taughtRecaps.length > 0 &&
    elapsed(state) < HARD_LIMIT_SEC &&
    homeworkItem(state) !== null
  ) {
    return beginHomework(state, carry);
  }

  state.phase = "closing";
  state.scene = "closing";

  // 탭만으로 완주한 세션은 아이가 규칙을 '고른' 것이지 '말한' 것이 아니다.
  if (state.taughtRecaps.length > 0 && !state.producedFreeText) {
    state.report.push({
      grade: "중간",
      note: "선택지 탭만으로 진행 — 다음엔 말로 설명해보게 해주세요",
    });
  }

  const recaps = state.taughtRecaps;
  const summary =
    recaps.length === 0
      ? "오늘은 여기까지 하자! 내일 또 궁금한 거 물어볼게."
      : recaps.length === 1
        ? `오늘 배운 거 내가 정리해볼게. 음… ${recaps[0]} 맞지?`
        : `오늘 배운 거 내가 정리해볼게! ${recaps
            .map((r, i) => `${i + 1}. ${r}`)
            .join(" ")} 이렇게 ${recaps.length}개나 알게 됐어. 맞지?`;

  return result(state, {
    mood: recaps.length > 0 ? "happy" : "shy",
    mormi: carry ? `${carry.mormi}\n\n${summary}` : summary,
    // 깨달음과 총정리는 화제가 다르다 — 말풍선을 나눈다.
    bubbles: carry ? [carry.mormi, summary] : undefined,
    effects: carry?.effects ?? [],
    input: "stamp",
    starNote: carry?.starNote,
  });
}

// ---------- 숙제 검사 (시험지 형식으로의 전이 확인) ----------

/** 숙제 검사에 쓸 개념 — 오늘 마지막으로 아이가 확정해준 것 */
function homeworkItem(state: SessionState): Item | null {
  const id = state.learnedIds[state.learnedIds.length - 1];
  const it = items.find((i) => i.id === id);
  return it?.homework ? it : null;
}

function homeworkVisual(hw: NonNullable<Item["homework"]>): Effect {
  return {
    type: "visual",
    kind: "pizza",
    compare: hw.visual.compare,
    shade: hw.visual.shade,
    shades: hw.visual.shades,
  };
}

/**
 * 모르미가 학교 숙제지를 꺼내 도움을 청한다.
 * 문제와 틀린 풀이는 **LLM을 거치지 않고 그대로** 내보낸다 —
 * 오류 캘리브레이션의 핵심이 이 두 문장이므로 화자가 다듬을 여지를 두지 않는다.
 */
function beginHomework(
  state: SessionState,
  carry?: { mormi: string; effects: Effect[]; starNote?: string },
): TurnResult {
  const it = homeworkItem(state)!;
  const hw = it.homework!;
  state.phase = "homework";
  state.scene = "teaching";
  state.homeworkAsked = true;
  state.homeworkTries = 0;
  state.homeworkItemId = it.id;

  const ask = `아! 맞다, 나 학교에서 숙제도 받아왔는데 여기서 막혔어. 같이 봐줄래?\n\n📄 ${hw.problem}\n\n${hw.mormi_wrong_try}`;

  return result(state, {
    mood: "confident",
    mormi: carry ? `${carry.mormi}\n\n${ask}` : ask,
    // 고마움 인사와 숙제 부탁은 화제가 다르다 — 말풍선을 나눈다.
    bubbles: carry ? [carry.mormi, ask] : undefined,
    effects: carry?.effects ?? [],
    input: "choices",
    choices: hw.choices,
    starNote: carry?.starNote,
  });
}

/**
 * 숙제 답 판정 — 선택지이므로 문자열 비교로 충분하다(분류기 호출 없음).
 * 아이에게 채점당하는 경험을 주지 않는 것이 규칙이라, 두 번 틀리면 모르미가
 * 스스로 아까 배운 것을 떠올려 풀고 부드럽게 넘어간다.
 */
async function onHomeworkAnswer(
  state: SessionState,
  childText: string,
  dontKnow: boolean,
): Promise<TurnResult> {
  const it = items.find((i) => i.id === state.homeworkItemId)!;
  const hw = it.homework!;
  const correct = !dontKnow && childText.trim() === hw.correct;

  if (correct) {
    state.report.push({
      grade: "낮음",
      note: `${it.concept}: 시험지 형식(숫자) 문제로도 전이 성공 (긍정 신호)`,
    });
    const mormi = await speak(state,
      `아이가 내 숙제 풀이를 바로잡아 "${childText}" 라고 짚어줬다. "아~!" 하고 깨달아라.
아까 아이가 알려준 것과 같은 규칙이었다는 걸 알아차렸다고 짧게 말하고("아까 알려준 거랑 똑같은 거였네!"), 이어서 이 문장을 **그대로** 말하라: "${hw.recap}"
그 문장을 네 말로 바꿔 말하거나, 말하는 중간에 헷갈려하지 마라 — 이미 깨달은 상태다. 전체 두세 문장.`,
      childText,
    );
    return await finishTeaching(
      state,
      { mormi, effects: [{ type: "eye_widen" }] },
      { skipHomework: true },
    );
  }

  state.homeworkTries += 1;

  // 1회차: 그림으로 같이 확인하고 다시 묻는다.
  if (state.homeworkTries === 1) {
    const mormi = await speak(state,
      `아이가 내 숙제 풀이에 동의했거나 확신이 없다. 절대 교정하지 말고, 자신 없어하며 그림으로 같이 확인해보자고 제안하라: "${hw.reask} 우리 그림으로 한 번 볼까?"
그림을 보고 나서 다시 골라달라고 부탁하는 데서 멈춰라. 정답을 네가 말하지 마라.`,
      childText,
    );
    return result(state, {
      mood: "puzzled",
      mormi,
      effects: [homeworkVisual(hw)],
      input: "choices",
      choices: hw.choices,
    });
  }

  // 2회차: 여기가 이 시스템에서 가장 값진 진단 신호 —
  // 개념은 설명했는데 숫자 문제로는 넘어가지 못했다는 뜻이다.
  state.report.push({
    grade: "높음",
    note: `${it.concept}: 개념은 설명했으나 시험지 형식(숫자) 문제로 전이되지 않음 — 같은 유형 절차 연습 권장`,
  });
  const mormi = await speak(state,
    `숙제는 우리 둘 다 헷갈렸다. 아이를 탓하거나 틀렸다고 말하지 말고, 아까 아이가 알려준 것을 스스로 떠올려 답에 도달하라: "잠깐, 아까 네가 알려준 거 다시 생각해보니까… ${hw.recap}" 그리고 아이 덕분에 풀었다고 고마움을 표현하라.`,
    childText,
  );
  return await finishTeaching(
    state,
    { mormi, effects: [homeworkVisual(hw)] },
    { skipHomework: true },
  );
}

/** 오개념 동조 → C1 재확인 → C3 사전 → C4 재가르침 */
async function onMisconceptionAgreed(
  state: SessionState,
  childText: string,
  cls: Classification,
  overTime: boolean,
): Promise<TurnResult> {
  const it = item(state);

  if (state.phase === "teaching") {
    // 가장 값진 진단 신호 — 예산이 없어도 최소 재확인은 한다.
    state.report.push({
      grade: "최우선",
      note: `${it.concept}: 오개념 동조 — "${it.misconception}"를 아이도 갖고 있음`,
    });
    if (overTime || !hasExceptionBudget(state)) {
      return await carryOver(state, childText);
    }
    state.exceptionCount += 1;
    state.phase = "reconfirm";
    const mormi = await speak(state,
      `아이가 네 오개념에 동의했다. 절대 교정하지 말고, 자신 없어하며 재확인하라: "진짜? 나 이거 사실 자신 없었는데… 우리 그림으로 확인해볼까?" 그림을 보자고 제안하는 데서 멈춰라.`,
      childText,
    );
    return result(state, {
      mood: "puzzled",
      mormi,
      effects: [visualEffect(it)],
      ...inputFor(state),
    });
  }

  if (state.phase === "reconfirm") {
    // C3: 그림으로도 못 알아챔 → 궁금해 사전 + 재가르침 요청.
    // 사전 내용은 교과 데이터의 개념 문장만 쓴다 — 사전은 지어내지 않는다.
    state.phase = "reteach";
    state.ladder = Math.max(0, state.ladder - 2);
    const found = lookupDictionary(it.keywords);
    const concept = found.concept ?? it.correct_recap;
    const mormi = await speak(state,
      `"우리 궁금해 사전한테 물어보자!"라고 말하고, 사전 내용("${concept}")을 본 뒤 "엥, 우리 반대로 알고 있었네! 내가 이상하게 물어봤지?"라며 비난을 네가 흡수하라. 그리고 아이에게 다시 가르쳐 달라고 청하라: "${it.reask_by_ladder[String(state.ladder)]}"`,
      childText,
    );
    return result(state, {
      mood: "shy",
      mormi,
      effects: [{ type: "dictionary_open", concept }],
      ...inputFor(state),
    });
  }

  // reteach에서도 동조 → 오개념 상태로 복창하지 않고 이월
  return await carryOver(state, childText);
}

/** 모름·무응답 → A1 사다리↓ → A2 힌트 → A3 사전 → A4 이월 */
async function onStuck(
  state: SessionState,
  childText: string,
  overTime: boolean,
): Promise<TurnResult> {
  const it = item(state);

  // A1: 사다리 하향은 예외 예산을 쓰지 않는다 (가장 가벼운 대응)
  if (!overTime && state.ladderDrops < 2 && state.ladder > 0) {
    state.ladder -= 1;
    state.ladderDrops += 1;
    const mormi = await speak(state,
      `아이가 모르겠다고 한다. 부담을 주지 말고 더 쉬운 형태로 되물어라: "${it.reask_by_ladder[String(state.ladder)]}"`,
      childText,
    );
    return result(state, { mood: "puzzled", mormi, ...inputFor(state) });
  }

  // A2: 위장된 힌트 — 마지막 조각은 반드시 아이가 완성한다
  if (!overTime && !state.hintUsed && hasExceptionBudget(state)) {
    state.hintUsed = true;
    state.exceptionCount += 1;
    const mormi = await speak(state,
      `위장된 힌트를 흘려라: "${it.hint}" 그리고 마지막 조각을 아이가 완성하게 그 뒤를 되물어라.`,
      childText,
    );
    return result(state, { mood: "puzzled", mormi, ...inputFor(state) });
  }

  // A3: 함께 사전 찾아보기 (힌트를 이미 썼고 예산이 남은 경우)
  if (!overTime && state.phase !== "reteach" && hasExceptionBudget(state)) {
    state.exceptionCount += 1;
    state.phase = "reteach";
    state.ladder = 0;
    const found = lookupDictionary(it.keywords);
    const concept = found.concept ?? it.correct_recap;
    const mormi = await speak(state,
      `"우리 둘 다 막혔네! 그럼 같이 찾아볼까? 궁금해 사전아~"라고 말하고, 사전을 펼친 뒤 아이에게 "여기 뭐라고 써 있어?"라고 물어 아이가 읽어서 알려주게 하라. 사전 내용: "${concept}"`,
      childText,
    );
    return result(state, {
      mood: "puzzled",
      mormi,
      effects: [{ type: "dictionary_open", concept }],
      ...inputFor(state),
    });
  }

  return await carryOver(state, childText);
}

/**
 * A4 긍정적 이월 — 해당 개념은 복창에서 제외한다.
 * 모르는 채로, 또는 오개념 상태로는 절대 정리하지 않는다.
 */
async function carryOver(state: SessionState, childText: string): Promise<TurnResult> {
  const it = item(state);
  state.carriedIds.push(it.id);
  state.report.push({
    grade: "높음",
    note: `${it.concept}: 미해결 이월 (예외 소진 또는 시간 상한)`,
  });

  const mormi = await speak(state,
    `이 개념은 오늘 어려웠다. 실패 느낌 없이 밝게 이월하라: "이건 좀 어려운가 보다! 내일 내가 다시 궁금해할래." 그리고 아이가 오늘 해준 것 중 구체적으로 도움이 된 점 하나를 짚어 고마움을 표현하라.`,
    childText,
  );

  // 막힌 직후에 새 개념도, 숙제 검사도 권하지 않는다. 부드럽게 오늘을 닫는다.
  return await finishTeaching(state, { mormi, effects: [] }, { skipHomework: true });
}
