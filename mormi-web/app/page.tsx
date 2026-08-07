"use client";

import { useEffect, useRef, useState } from "react";
import { Stage } from "@/components/Stage";
import { OpenBook } from "@/components/DictionaryBook";
import { FractionText } from "@/components/FractionText";
import { LearningVisual } from "@/components/LearningVisual";
import { LifeThemeHome } from "@/components/LifeThemeHome";
import { CafeStageMap, type CafeStageSummary } from "@/components/CafeStageMap";
import { StarNote } from "@/components/StarNote";
import { DemoLogin } from "@/components/DemoLogin";
import { ProblemBoard, type ProblemView } from "@/components/ProblemBoard";
import { track, trackTurnDiff } from "@/lib/analytics";
import {
  accountProfileKey,
  createDemoAccount,
  readDemoAccounts,
  starterProfile,
  writeDemoAccounts,
  type DemoAccount,
} from "@/lib/demo-accounts";
import type { Mood } from "@/components/Mormi";
import type { LearningVisual as LearningVisualSpec } from "@/lib/learning-visual";

type Scene =
  | "onboarding"
  | "room"
  | "unit_select"
  | "dictionary"
  | "teaching"
  | "closing";
type InputMode =
  | "button"
  | "cards"
  | "mic"
  | "choices"
  | "stamp"
  | "continue"
  | "covers"
  | "bye"
  | "none";

type Effect =
  | { type: "eye_widen" }
  | { type: "notebook_write"; text: string; coauthored?: boolean }
  | { type: "stamp" }
  | { type: "dictionary_open"; concept: string }
  | { type: "visual"; visual: LearningVisualSpec }
  | { type: "mormi_move"; to: "desk" | "blocks" };

interface Turn {
  scene: Scene;
  mood: Mood;
  mormi: string;
  effects: Effect[];
  input: InputMode;
  choices?: string[];
  prepCard?: string[];
  ladder: number;
  starNote?: string;
  cover?: string;
  mormiName?: string;
  childName?: string;
  nameTarget?: "child" | "mormi";
  bubbles?: string[];
  /** 사전으로 이미 재확인한 뒤 — '아니야'를 다시 내주지 않는다 */
  agreeOnly?: boolean;
  dictation?: string;
  /** 서버가 되돌려준 세션 상태 — 다음 요청에 그대로 실어 보낸다 (서버리스 대응) */
  state?: unknown;
  profile?: unknown;
  pastNotes?: { text: string; day: number; coauthored?: boolean }[];
  deskCards?: string[];
  prepVisual?: LearningVisualSpec;
  stages?: CafeStageSummary[];
  problem?: ProblemView;
  report: { grade: string; note: string }[];
  elapsedSec: number;
  error?: string;
}

type Visual = Extract<Effect, { type: "visual" }>;
type DialogueEntry = { role: "mormi" | "child"; text: string };
type NoteEntry = { text: string; coauthored?: boolean };

type SpeechRecognitionResultEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const COVER_ICON: Record<string, string> = {
  별: "⭐",
  로켓: "🚀",
  공룡: "🦕",
  고양이: "🐱",
};

export default function Home() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<DemoAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState<string | null>(null);

  const [prepCard, setPrepCard] = useState<string[]>([]);
  const [visual, setVisual] = useState<Visual | null>(null);
  const [dictCard, setDictCard] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [draftNotes, setDraftNotes] = useState<NoteEntry[]>([]);
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [savingNotePreview, setSavingNotePreview] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const [dialogueHistory, setDialogueHistory] = useState<DialogueEntry[]>([]);
  const [past, setPast] = useState<{ text: string; day: number; coauthored?: boolean }[]>([]);
  // 아직 생성 중인 모르미 발화 (SSE 로 들어오는 중)
  const [streaming, setStreaming] = useState<string | null>(null);
  // 서버 요청이 실패했는가 — 조용히 넘어가지 않고 아이에게 알린다
  const [failed, setFailed] = useState(false);
  const [prepVisual, setPrepVisual] =
    useState<Turn["prepVisual"]>(undefined);
  const timer = useRef<number | null>(null);
  const activeAccountRef = useRef<DemoAccount | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // 세션 상태는 화면이 보관한다 — 서버리스에서는 서버 메모리가 요청마다 비워진다.
  const stateRef = useRef<unknown>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => () => speechRecognitionRef.current?.abort(), []);

  // 시연용 계정 목록만 먼저 읽는다. 계정을 고른 뒤에 세션을 만든다.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setAccounts(readDemoAccounts());
      setAuthReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * 서버에 한 턴을 요청한다.
   *
   * 모르미 발화는 SSE로 흘러들어와 완성되기 전부터 화면에 뜬다 — 아이는
   * 5초짜리 "생각하는 중…"을 기다려주지 않는다.
   * 실패하면 반드시 화면에 알린다. 조용히 넘어가면 아이 눈에는 모르미가
   * 같은 질문만 반복하는 것으로 보인다.
   */
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setStreaming(null);
    setFailed(false);
    setShowHint(false);

    // 계측 — 요청 직전 상태를 떠 둔다. 응답 상태와 비교하는 것만이
    // '무슨 일이 있었는지'의 정직한 근거다 (아이 말은 절대 싣지 않는다).
    const prevState = stateRef.current;
    const action = String(body.action ?? "");
    const t0 = performance.now();
    let firstTokenMs: number | null = null;

    let data: (Turn & { sessionId?: string }) | null = null;
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, state: stateRef.current, stream: true, ...body }),
      });

      if (!res.body) throw new Error("no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(raw)?.[1];
          const payload = /data: ([\s\S]*)/.exec(raw)?.[1];
          if (!ev || payload === undefined) continue;
          if (ev === "token") {
            // 첫 글자가 뜨기까지 걸린 시간 — 아이가 실제로 기다린 시간이다
            if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
            acc += JSON.parse(payload) as string;
            setStreaming(acc);
          } else if (ev === "done") {
            data = JSON.parse(payload) as Turn;
          } else if (ev === "error") {
            throw new Error(JSON.parse(payload) as string);
          }
        }
      }
      if (!data) throw new Error("no done event");
    } catch {
      // 아이에게는 모르미의 말로 알리고, 다시 말해볼 수 있게 둔다.
      setBusy(false);
      setStreaming(null);
      setFailed(true);
      track("turn_failed", { action });
      return;
    }

    setBusy(false);
    setStreaming(null);
    if (data.sessionId) setSid(data.sessionId);
    if (data.state) stateRef.current = data.state;

    const newMormiMessages = (data.bubbles?.length ? data.bubbles : [data.mormi])
      .filter(Boolean)
      .map((message) => ({ role: "mormi" as const, text: message }));
    if (newMormiMessages.length > 0) {
      setDialogueHistory((history) => [...history, ...newMormiMessages]);
    }

    // 상태 diff 로 이번 턴에 무슨 일이 있었는지 남긴다.
    // childText 는 어떤 형태로도 넘기지 않는다 — 구조 플래그만 전달한다.
    trackTurnDiff(action, prevState, data.state, {
      ms: Math.round(performance.now() - t0),
      firstTokenMs,
      viaTap: Boolean(body.viaTap),
      dontKnow: Boolean(body.dontKnow),
    });
    // 프로필은 브라우저가 보관한다 — 다음 방문(이틀째)에 서버로 되돌려준다.
    if (data.profile) {
      try {
        const account = activeAccountRef.current;
        if (account) {
          localStorage.setItem(accountProfileKey(account.id), JSON.stringify(data.profile));
        }
      } catch {
        /* 저장 불가 환경 — 이번 세션 안에서는 정상 동작한다 */
      }
    }
    setTurn(data);

    // 시각 반증·사전 카드는 그 턴에만 유효한 연출이다. 매 턴 비우고 지시받은 것만 켠다.
    setVisual(null);
    setDictCard(null);

    // 연출은 서버가 준 지시만 실행한다.
    for (const e of data.effects ?? []) {
      if (e.type === "visual") setVisual(e);
      if (e.type === "dictionary_open") setDictCard(e.concept);
      if (e.type === "stamp") setStamped(true);
      if (e.type === "notebook_write") {
        const { text, coauthored } = e;
        setTyping(text);
        timer.current = window.setTimeout(
          () => {
            const addOnce = (items: NoteEntry[]) =>
              items.some((note) => note.text === text)
                ? items
                : [...items, { text, coauthored }];
            // 학습 중 만든 문장은 마지막 확인 전까지 임시 보관한다.
            // 온보딩 기록은 이미 확정된 프로필 정보라 기존처럼 바로 남긴다.
            if (data.scene === "teaching" || data.scene === "closing") {
              setDraftNotes(addOnce);
            } else {
              setNotes(addOnce);
            }
            setTyping(null);
          },
          text.length * 55 + 700,
        );
      }
    }
    if (data.prepCard) setPrepCard(data.prepCard);
    if (data.prepVisual) setPrepVisual(data.prepVisual);
  }

  async function newSession(account = activeAccountRef.current) {
    if (!account) return;
    setPrepCard([]);
    setVisual(null);
    setDictCard(null);
    setNotes([]);
    setDraftNotes([]);
    setShowNotePreview(false);
    setSavingNotePreview(false);
    setTyping(null);
    setStamped(false);
    setDialogueHistory([]);
    setPast([]);
    setStreaming(null);
    setFailed(false);
    setShowHint(false);
    setSid(null);
    let saved: unknown = null;
    try {
      const raw = localStorage.getItem(accountProfileKey(account.id));
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* 저장소를 못 읽으면 첫 만남부터 시작한다 */
    }
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", profile: saved }),
    });
    const data: Turn & { sessionId: string } = await res.json();
    stateRef.current = data.state ?? null;
    setSid(data.sessionId);
    setTurn(data);
    const firstMessages = (data.bubbles?.length ? data.bubbles : [data.mormi])
      .filter(Boolean)
      .map((message) => ({ role: "mormi" as const, text: message }));
    setDialogueHistory(firstMessages);
    if (data.pastNotes) setPast(data.pastNotes);
    // 지난 별노트가 있으면 이틀째 이후의 방문이다
    track("session_started", { day2: (data.pastNotes?.length ?? 0) > 0 });
  }

  async function login(account: DemoAccount) {
    activeAccountRef.current = account;
    setShowNotes(false);
    setShowHint(false);
    // 계정만 먼저 열면 세션 응답이 오기 전의 빈 공부방이 한 프레임 보인다.
    // 로그인 화면을 유지하다가 첫 장면이 모두 준비된 뒤 한 번에 전환한다.
    await newSession(account);
    setActiveAccount(account);
  }

  async function createAccount(name: string, avatar: string) {
    const account = createDemoAccount(name, avatar);
    const next = [...accounts, account];
    writeDemoAccounts(next);
    localStorage.setItem(accountProfileKey(account.id), JSON.stringify(starterProfile(name)));
    setAccounts(next);
    await login(account);
  }

  function logout() {
    activeAccountRef.current = null;
    stateRef.current = null;
    setActiveAccount(null);
    setSid(null);
    setTurn(null);
    setDialogueHistory([]);
    setShowNotes(false);
    setShowHint(false);
    setDraftNotes([]);
    setShowNotePreview(false);
    setSavingNotePreview(false);
  }

  /** viaTap: 선택지를 눌러서 답했는지 (직접 산출과 구분해 서버에 기록) */
  function say(childText: string, dontKnow = false, viaTap = false) {
    const visibleText = dontKnow ? "모르겠어…" : childText;
    if (visibleText) {
      setDialogueHistory((history) => [...history, { role: "child", text: visibleText }]);
    }
    // 온보딩은 가르치기 사이클이 아니라 별도 스텝 머신을 탄다.
    if (turn?.scene === "onboarding") {
      void post({ action: "onboard", childText });
      return;
    }
    void post({ action: "turn", childText, dontKnow, viaTap });
  }

  function submit() {
    const t = text.trim();
    if (!t || busy) return;
    say(t);
    setText("");
  }

  function toggleSpeechInput() {
    if (listening) {
      speechRecognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechMessage("이 브라우저에서는 음성 입력을 쓸 수 없어요.");
      track("voice_input_unavailable");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setSpeechMessage("듣고 있어요. 천천히 말해 주세요.");
      track("voice_input_started");
    };
    recognition.onresult = (event) => {
      let transcript = "";
      let finalTranscript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        transcript += result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += result[0]?.transcript ?? "";
      }
      setText(transcript.trim());
      if (finalTranscript.trim()) {
        setSpeechMessage("잘 들었어요. 글을 확인하고 보내 주세요.");
        track("voice_input_completed");
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setSpeechMessage("잘 듣지 못했어요. 다시 눌러 말해 주세요.");
      track("voice_input_failed");
    };
    recognition.onend = () => {
      setListening(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
  }

  /** 데모용 — 프로필을 지우고 첫 만남부터 다시 본다 */
  async function resetAll() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    try {
      const account = activeAccountRef.current;
      if (account) {
        localStorage.setItem(
          accountProfileKey(account.id),
          JSON.stringify(starterProfile(account.name)),
        );
      }
    } catch {
      /* 무시 */
    }
    stateRef.current = null;
    // 데모에서 첫 만남을 다시 보는 경우다 — 분석에서 걸러내기 위한 표식
    track("profile_reset");
    await newSession();
  }

  if (!authReady) {
    return <main className="login-shell"><p className="text-sm text-stone-400">계정을 불러오고 있어요…</p></main>;
  }

  if (!activeAccount) {
    return <DemoLogin accounts={accounts} onSelect={login} onCreate={createAccount} />;
  }

  const scene = turn?.scene ?? "room";
  const input = turn?.input ?? "button";
  const onboarding = scene === "onboarding";
  // 아이가 지어준 이름을 화면 문구가 그대로 쓴다
  const name = turn?.mormiName || "모르미";
  const atDesk = scene !== "room" && !onboarding;
  // 사전 문장 따라 하기 — 안내 문구는 입력 방식에 따라 화면이 고른다.
  // (음성 모드가 생기면 "따라 읽어볼까?" 로 바뀐다)
  const dictation = turn?.dictation;
  const stageDialogue: DialogueEntry[] = busy || streaming || failed
    ? [
        ...dialogueHistory,
        {
          role: "mormi",
          text: failed ? "잠깐 멍해졌어. 다시 말해 줄래?" : streaming ?? "곰곰이 생각하는 중…",
        },
      ]
    : dialogueHistory;
  const showConversation =
    !sid || Boolean(dictCard && scene !== "dictionary");
  const inputGuide = input === "choices"
    ? "답을 눌러요"
    : input === "mic"
      ? "내 답을 알려줘요"
      : input === "continue"
        ? "다음 활동을 골라요"
        : "버튼을 눌러요";
  const answerInputLabel = onboarding
    ? turn?.nameTarget === "mormi"
      ? "모르미 이름을 직접 정해요"
      : "내 이름을 알려줘요"
    : "글로 쓰거나 말로 알려줘요";
  const notePreviewItems = [
    ...draftNotes,
    ...(typing ? [{ text: typing }] : []),
    ...(turn?.starNote ? [{ text: turn.starNote }] : []),
  ].filter(
    (note, index, items) =>
      items.findIndex((candidate) => candidate.text === note.text) === index,
  );
  const cafeStages: CafeStageSummary[] = turn?.stages ?? (turn?.choices ?? []).map((concept, index) => ({
    id: `cafe-stage-${index + 1}`,
    concept,
    unlocked: index === 0,
    completed: false,
    final: index === 3,
  }));

  async function confirmNotePreview() {
    if (savingNotePreview) return;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setNotes((current) => {
      const next = [...current];
      for (const note of notePreviewItems) {
        if (!next.some((item) => item.text === note.text)) next.push(note);
      }
      return next;
    });
    setDraftNotes([]);
    setTyping(null);
    setSavingNotePreview(true);
    track("session_closed", { agree: true, notePreview: true });
    await post({ action: "stamp", agree: true });
    setSavingNotePreview(false);
    setShowNotePreview(false);
  }

  return (
    <div className="learning-app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand__mark" aria-hidden="true">M</span>
          <div><strong>{name}</strong><span>나와 함께하는 생활연습</span></div>
        </div>
        <nav className="app-account" aria-label="계정 메뉴">
          <button className="header-pill" onClick={() => setShowNotes(true)}>
            <StarNoteIcon />
            <span>별노트</span>
            <strong>{past.length + notes.length}</strong>
          </button>
          <button className="account-pill" onClick={logout} title="다른 계정 선택">
            <span className="account-pill__avatar"><ProfileLeafIcon /></span><strong>{activeAccount.name}</strong><small>바꾸기</small>
          </button>
        </nav>
      </header>

      <main className="mormy-shell flex w-full flex-1 items-start">
      {scene === "room" ? (
        <LifeThemeHome
          name={name}
          childName={activeAccount.name}
          busy={busy || !sid}
          onCafe={() => {
            setDialogueHistory([]);
            track("life_theme_selected", { theme: "cafe" });
            void post({ action: "begin" });
          }}
        />
      ) : scene === "unit_select" ? (
        <CafeStageMap
          name={name}
          stages={cafeStages}
          busy={busy}
          onSelect={(concept) => {
            setDialogueHistory([]);
            track("life_stage_selected", { concept });
            void post({ action: "selectUnit", concept });
          }}
        />
      ) : (
      <div className={`lesson-frame scene-${scene} relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {turn?.problem && (
          <div className="problem-slot">
            <ProblemBoard
              problem={turn.problem}
              onHint={() => {
                setShowHint(true);
                track("hint_opened");
              }}
            />
          </div>
        )}

        <div className="lesson-workspace">
        <div className="lesson-stage-column">
        {/* 사전은 무대를 덮지 않고 한 장의 큰 학습 카드로 보여 준다. */}
        {scene === "dictionary" && prepCard.length > 0 ? (
          <div className="dictionary-stage">
            <OpenBook concepts={prepCard} visual={prepVisual} />
          </div>
        ) : (
        <div className="relative">
          <Stage
            atDesk={atDesk}
            mood={turn?.mood ?? "idle"}
            writing={typing !== null}
            noteIcon={COVER_ICON[turn?.cover ?? ""] ?? "⭐"}
            characterAlign="center"
            dialogue={stageDialogue}
            speaking={streaming !== null}
            showStep={scene === "teaching"}
            characterName={name}
          >
            {scene === "closing" && (
              stamped ? (
                <span className="anim-stamp rounded-full border-[3px] border-[#d9534f] bg-[#fffdf7] px-3 py-2 text-[12px] font-medium text-[#d9534f]">
                  잘했어요
                </span>
              ) : null
            )}
          </Stage>

          {/* 시각적 반증 — 교정하는 주체는 모르미가 아니라 이 그림이다 */}
          {visual && !turn?.problem && (
            <div className="stage-learning-visual">
              <LearningVisual visual={visual.visual} compact />
            </div>
          )}
        </div>
        )}

        {/* 사전 안내와 재시도 버튼만 남긴다. 실제 대화는 모두 캐릭터 옆에 이어 붙는다. */}
        {showConversation && <div className="conversation-panel space-y-3 overflow-y-auto px-5 py-3 text-center sm:px-7 [&>*]:text-left">
          {!sid && (
            <p className="pt-6 text-sm text-stone-400">{name}를 부르고 있어요…</p>
          )}
          {dictCard && scene !== "dictionary" && (
            <p className="mx-auto max-w-md rounded-2xl border border-[#ead7a2] bg-[#fff8df] px-4 py-3 text-[14px] leading-6 text-[#7d622b]">
              <span className="mr-2 rounded-full bg-[#f6c85f] px-2 py-1 text-[11px]">궁금해 사전</span><FractionText text={dictCard} />
            </p>
          )}
        </div>}
        </div>

        {/* 입력 — 모드는 서버가 지정한다 */}
        <div className="input-dock relative z-40 p-4 sm:p-5">
          {scene === "teaching" && input !== "none" && (
            <div className="input-step-heading step-heading">
              <span className="step-heading__number">3</span>
              <strong>{inputGuide}</strong>
            </div>
          )}
          {input === "button" && (
            <button
              onClick={() => {
                const action =
                  scene === "dictionary"
                    ? "ready"
                    : "accept";
                // '응, 물어봐' — 여기서부터 실제 가르치기가 시작된다.
                // 정확한 단원 id 는 서버 diff 이벤트가 실어준다.
                if (action === "accept") {
                  // 준비 단계 문장까지 모두 쌓이면 실제 문제 대화가 묻힌다.
                  // 문제를 시작하는 순간부터의 대화만 스크롤 기록으로 남긴다.
                  setDialogueHistory([]);
                  track("unit_started");
                }
                void post({ action });
              }}
              disabled={busy || !sid}
              className="primary-action w-full py-4 text-[18px] font-bold"
            >
              {scene === "dictionary" ? "카페 미션 시작하기" : "문제 풀기"}
            </button>
          )}

          {input === "cards" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {turn?.choices?.map((c, index) => (
                <button
                  key={c}
                  onClick={() => {
                    setDialogueHistory([]);
                    track("unit_selected", { unit: c });
                    void post({ action: "selectUnit", concept: c });
                  }}
                  disabled={busy}
                  className="choice-card group flex min-h-[104px] flex-col items-start justify-center px-5 py-4 text-left"
                >
                  <span className="level-chip mb-2">3학년 {index + 1}단계</span>
                  <span className="text-[16px] text-[#29352f]">{c}</span>
                </button>
              ))}
            </div>
          )}

          {/*
            사다리 하위 칸(가리키기·한 단어·빈칸)은 탭으로만 답한다.
            글씨를 쓰기 어려운 아이에게 키보드를 띄우는 것 자체가 진입 장벽이라,
            선택지가 있는 동안에는 입력창을 함께 두지 않는다.
          */}
          {input === "choices" && (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {turn?.choices?.map((c) => (
                  <button
                    key={c}
                    onClick={() => say(c, false, true)}
                    disabled={busy}
                    className={`choice-card min-h-[82px] px-4 py-5 text-[21px] disabled:opacity-40 ${onboarding && c === "직접 정할래" ? "onboarding-custom-name" : ""}`}
                  >
                    <FractionText text={c} />
                  </button>
                ))}
              </div>
              {/* 첫 만남의 선택지(작명)에는 '모르겠어'가 없다 — 틀릴 수 있는 질문이 아니다 */}
              {!onboarding && (
                <button
                  onClick={() => say("", true)}
                  disabled={busy}
                  className="secondary-action w-full py-3 text-sm"
                >
                  모르겠어
                </button>
              )}
            </div>
          )}

          {/* 별노트 표지 고르기 — 3초짜리 선택이 '내 노트'라는 소유감을 만든다 */}
          {input === "covers" && (
            <div className="flex gap-2">
              {turn?.choices?.map((c) => (
                <button
                  key={c}
                  onClick={() => say(c, false, true)}
                  disabled={busy}
                  className="choice-card flex flex-1 flex-col items-center gap-1 py-4 disabled:opacity-40"
                >
                  <span className="text-3xl">{COVER_ICON[c] ?? "⭐"}</span>
                  <span className="text-[13px] text-stone-600">{c}</span>
                </button>
              ))}
            </div>
          )}

          {/* 문장 수준에서는 글과 음성 중 편한 방법을 고른다. 음성 결과도
              먼저 글로 보여 주고, 아이가 확인한 뒤 보내도록 한다. */}
          {input === "mic" && dictation && (
            <p className="mb-3 rounded-2xl border border-dashed border-[#d4b9e5] bg-[#f8f2fc] px-4 py-3 text-[13px] text-[#67547e]">
              사전 속 문장을 짧게 따라 써보자
            </p>
          )}
          {input === "mic" && (
            <div className="answer-composer">
              <label className="answer-composer__label" htmlFor="child-answer">{answerInputLabel}</label>
              <div className="answer-composer__main">
                <input
                  id="child-answer"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSpeechMessage(null);
                  }}
                  onKeyDown={(e) => {
                    // 한글 조합 중 Enter는 확정 키다 — 여기서 보내면 마지막 글자가 잘린다
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                  }}
                  disabled={busy}
                  placeholder={
                    onboarding
                      ? turn?.nameTarget === "mormi"
                        ? "모르미 이름을 써요…"
                        : "내 이름을 알려줘요…"
                      : dictation
                        ? "사전 문장을 따라 써요…"
                        : "여기에 답을 써요…"
                  }
                />
                <button
                  type="button"
                  onClick={toggleSpeechInput}
                  disabled={busy}
                  aria-pressed={listening}
                  className={`voice-input-button ${listening ? "is-listening" : ""}`}
                >
                  <MicrophoneIcon />
                  <span>{listening ? "듣는 중…" : "말로 답하기"}</span>
                </button>
              </div>
              {speechMessage && (
                <p className="speech-input-status" role="status">{speechMessage}</p>
              )}
              <div className="answer-composer__actions">
                {/* 아이패드 화상 키보드에는 Enter가 눈에 띄지 않는다 — 보내기 버튼을 항상 둔다 */}
                <button
                  onClick={submit}
                  disabled={busy || !text.trim()}
                  className="primary-action"
                >
                  답 보내기
                </button>
                {!onboarding && (
                  <button
                    onClick={() => say("", true)}
                    disabled={busy}
                    className="secondary-action"
                  >
                    모르겠어
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 한 개념을 끝낸 뒤 — 더 가르칠지는 아이가 고른다 */}
          {input === "continue" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDialogueHistory((history) => [...history, { role: "child", text: "하나 더 가르쳐줄래!" }]);
                  track("continue_more");
                  void post({ action: "continueTeaching" });
                }}
                disabled={busy}
                className="primary-action flex-1 py-3.5 text-[15px]"
              >
                하나 더 가르쳐줄래!
              </button>
              <button
                onClick={() => {
                  setDialogueHistory((history) => [...history, { role: "child", text: "오늘은 여기까지" }]);
                  track("continue_finish");
                  void post({ action: "finishTeaching" });
                }}
                disabled={busy}
                className="secondary-action px-6 py-3.5 text-[15px]"
              >
                오늘은 여기까지
              </button>
            </div>
          )}

          {input === "stamp" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  track("note_preview_opened", { count: notePreviewItems.length });
                  setShowNotePreview(true);
                }}
                disabled={busy}
                className="primary-action flex-1 py-3.5 text-[15px]"
              >
                맞아! (도장 찍기)
              </button>
              {/*
                사전으로 이미 재확인한 뒤에는 '아니야'를 내주지 않는다.
                판정은 사전이 했고, 같은 부정을 계속 받으면 세션이 닫히지 않는다.
              */}
              {!turn?.agreeOnly && (
                <button
                  onClick={() => {
                    track("recap_challenged");
                    void post({ action: "stamp", agree: false });
                  }}
                  disabled={busy}
                  className="secondary-action px-6 py-3.5 text-sm"
                >
                  아니야
                </button>
              )}
            </div>
          )}

          {/*
            가르친 것이 없는 세션 — 확인할 복창이 없으니 도장도 없다.
            인사만 하고 닫는다.
          */}
          {input === "bye" && (
            <button
              onClick={() => {
                track("session_closed", { taught: false });
                void post({ action: "stamp" });
              }}
              disabled={busy}
              className="primary-action w-full py-3.5 text-[15px]"
            >
              내일 또 만나!
            </button>
          )}

          {input === "none" && (
            <button
              onClick={() => void newSession()}
              className="secondary-action w-full py-3.5 text-[15px]"
            >
              오늘 가르친 것 {notes.length}개 · 다시 가르치기
            </button>
          )}
        </div>
        </div>
      </div>
      )}
      </main>

      {showNotes && (
        <div className="notes-backdrop" role="dialog" aria-modal="true" aria-label="별노트">
          <div className="notes-modal">
            <header>
              <div><span className="notes-modal__icon"><StarNoteIcon /></span><div><strong>{activeAccount.name}의 별노트</strong><p>{name}에게 알려준 말이 여기에 남아요.</p></div></div>
              <button onClick={() => setShowNotes(false)} aria-label="별노트 닫기">×</button>
            </header>
            <StarNote
              notes={notes}
              typing={typing}
              cover={turn?.cover}
              past={past}
              childName={turn?.childName}
            />
            <div className="notes-modal__actions">
              <button className="secondary-action px-4 py-2.5 text-[13px]" onClick={resetAll}>이 계정 처음부터</button>
              <button className="primary-action px-5 py-2.5 text-[13px]" onClick={() => setShowNotes(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {showNotePreview && (
        <div className="notes-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-preview-title">
          <section className="notes-modal note-preview-modal">
            <header>
              <div>
                <span className="notes-modal__icon"><StarNoteIcon /></span>
                <div>
                  <strong id="note-preview-title">별노트에 이렇게 적을게요</strong>
                  <p>{name}가 오늘 배운 내용이에요.</p>
                </div>
              </div>
            </header>

            {notePreviewItems.length > 0 ? (
              <ul className="note-preview-list">
                {notePreviewItems.map((note) => (
                  <li key={note.text}>
                    <span><StarNoteIcon /></span>
                    <p><FractionText text={note.text} /></p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note-preview-empty">오늘은 새로 적을 문장이 없어요.</p>
            )}

            <div className="notes-modal__actions">
              <button
                className="secondary-action px-4 py-2.5 text-[13px]"
                onClick={() => setShowNotePreview(false)}
                disabled={savingNotePreview}
              >
                조금 더 볼래
              </button>
              <button
                className="primary-action px-5 py-2.5 text-[13px]"
                onClick={() => void confirmNotePreview()}
                disabled={savingNotePreview}
              >
                {savingNotePreview ? "별노트에 넣는 중…" : notePreviewItems.length > 0 ? "별노트에 넣고 마치기" : "오늘 공부 마치기"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showHint && turn?.problem?.hint && (
        <div className="hint-backdrop" onClick={() => setShowHint(false)}>
          <section
            className="hint-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hint-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="hint-modal__close" onClick={() => setShowHint(false)} aria-label="힌트 닫기">×</button>
            <div className="hint-modal__icon"><BookHintIcon /></div>
            <p className="hint-modal__label">궁금해 사전</p>
            <h2 id="hint-title">힌트를 살짝 볼까요?</h2>
            <p className="hint-modal__text"><FractionText text={turn.problem.hint} /></p>
            <button className="primary-action w-full py-3" onClick={() => setShowHint(false)}>다시 생각해 볼게!</button>
          </section>
        </div>
      )}
    </div>
  );
}

function StarNoteIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8L12 3Z" />
    </svg>
  );
}

function ProfileLeafIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 11c0-4 2.7-6.5 7-7 0 4.1-2.2 6.8-7 7Zm0 0C9.7 7.7 7 6.6 4 7c.3 3.8 2.7 5.5 8 4Z" />
      <path d="M12 10v10" />
    </svg>
  );
}

function BookHintIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5c3.2-.7 5.9 0 8 2v12c-2.1-2-4.8-2.7-8-2V5.5Zm16 0c-3.2-.7-5.9 0-8 2v12c2.1-2 4.8-2.7 8-2V5.5Z" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3" width="8" height="12" rx="4" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}
