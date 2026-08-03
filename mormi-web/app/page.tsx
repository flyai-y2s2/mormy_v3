"use client";

import { useEffect, useRef, useState } from "react";
import { Stage } from "@/components/Stage";
import { ClosedBook, OpenBook } from "@/components/DictionaryBook";
import { FractionPizza, FractionCards } from "@/components/FractionPizza";
import { StarNote } from "@/components/StarNote";
import { withObject } from "@/lib/korean";
import type { Mood } from "@/components/Mormi";

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
  | "none";

type Effect =
  | { type: "eye_widen" }
  | { type: "notebook_write"; text: string; coauthored?: boolean }
  | { type: "stamp" }
  | { type: "dictionary_open"; concept: string }
  | {
      type: "visual";
      kind: "pizza";
      compare: number[];
      shade?: number;
      shades?: number[];
    }
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
  bubbles?: string[];
  dictation?: string;
  /** 서버가 되돌려준 세션 상태 — 다음 요청에 그대로 실어 보낸다 (서버리스 대응) */
  state?: unknown;
  profile?: unknown;
  pastNotes?: { text: string; day: number; coauthored?: boolean }[];
  deskCards?: string[];
  prepVisual?: { compare: number[]; shade?: number; shades?: number[] };
  report: { grade: string; note: string }[];
  elapsedSec: number;
  error?: string;
}

type Visual = Extract<Effect, { type: "visual" }>;

const COVER_ICON: Record<string, string> = {
  별: "⭐",
  로켓: "🚀",
  공룡: "🦕",
  고양이: "🐱",
};

/** 모르미 말풍선. caret 은 아직 말하는 중이라는 표시 */
function Bubble({ text, caret }: { text: string; caret?: boolean }) {
  return (
    <div className="flex justify-start">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border-2 border-[#e0c69a] bg-[#fffdf6] px-4 py-2.5 text-[15px] leading-relaxed text-stone-800">
        {text}
        {caret && (
          <span
            className="ml-0.5 inline-block text-[#c9a06a]"
            style={{ animation: "hand-caret .8s infinite" }}
          >
            ▍
          </span>
        )}
      </p>
    </div>
  );
}

export default function Home() {
  const [sid, setSid] = useState<string | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  const [prepCard, setPrepCard] = useState<string[]>([]);
  const [visual, setVisual] = useState<Visual | null>(null);
  const [dictCard, setDictCard] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ text: string; coauthored?: boolean }[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const [childSaid, setChildSaid] = useState<string | null>(null);
  const [past, setPast] = useState<{ text: string; day: number; coauthored?: boolean }[]>([]);
  const [deskCards, setDeskCards] = useState<string[]>(["1/3", "1/4"]);
  // 아직 생성 중인 모르미 발화 (SSE 로 들어오는 중)
  const [streaming, setStreaming] = useState<string | null>(null);
  // 서버 요청이 실패했는가 — 조용히 넘어가지 않고 아이에게 알린다
  const [failed, setFailed] = useState(false);
  const [prepVisual, setPrepVisual] =
    useState<Turn["prepVisual"]>(undefined);
  const timer = useRef<number | null>(null);
  // 세션 상태는 화면이 보관한다 — 서버리스에서는 서버 메모리가 요청마다 비워진다.
  const stateRef = useRef<unknown>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // 메인 룸이 곧 시작 상태다 — 세션 생성에 별도 클릭을 요구하지 않는다.
  useEffect(() => {
    void newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      return;
    }

    setBusy(false);
    setStreaming(null);
    if (data.sessionId) setSid(data.sessionId);
    if (data.state) stateRef.current = data.state;
    // 프로필은 브라우저가 보관한다 — 다음 방문(이틀째)에 서버로 되돌려준다.
    if (data.profile) {
      try {
        localStorage.setItem("mormi.profile", JSON.stringify(data.profile));
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
            setNotes((n) => [...n, { text, coauthored }]);
            setTyping(null);
          },
          text.length * 55 + 700,
        );
      }
    }
    if (data.prepCard) setPrepCard(data.prepCard);
    if (data.prepVisual) setPrepVisual(data.prepVisual);
    if (data.deskCards) setDeskCards(data.deskCards);
  }

  async function newSession() {
    setPrepCard([]);
    setVisual(null);
    setDictCard(null);
    setNotes([]);
    setTyping(null);
    setStamped(false);
    setChildSaid(null);
    setPast([]);
    setStreaming(null);
    setFailed(false);
    setSid(null);
    let saved: unknown = null;
    try {
      const raw = localStorage.getItem("mormi.profile");
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
    if (data.pastNotes) setPast(data.pastNotes);
  }

  /** viaTap: 선택지를 눌러서 답했는지 (직접 산출과 구분해 서버에 기록) */
  function say(childText: string, dontKnow = false, viaTap = false) {
    setChildSaid(dontKnow ? "모르겠어…" : childText);
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

  /** 데모용 — 프로필을 지우고 첫 만남부터 다시 본다 */
  async function resetAll() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    try {
      localStorage.removeItem("mormi.profile");
    } catch {
      /* 무시 */
    }
    stateRef.current = null;
    await newSession();
  }

  const scene = turn?.scene ?? "room";
  const input = turn?.input ?? "button";
  const onboarding = scene === "onboarding";
  // 아이가 지어준 이름을 화면 문구가 그대로 쓴다
  const name = turn?.mormiName ?? "모르미";
  const atDesk = scene !== "room" && !onboarding;
  // 사전 문장 따라 하기 — 안내 문구는 입력 방식에 따라 화면이 고른다.
  // (음성 모드가 생기면 "따라 읽어볼까?" 로 바뀐다)
  const dictation = turn?.dictation;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-start gap-4 p-4">
      <div className="flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#e0c69a] bg-white shadow-sm">
        {/* 무대 — 방과 책상, 모르미 */}
        <div className="relative">
          <Stage
            atDesk={atDesk}
            mood={turn?.mood ?? "idle"}
            writing={typing !== null}
            noteIcon={COVER_ICON[turn?.cover ?? ""] ?? "⭐"}
          >
            {scene === "teaching" && !visual && (
              <>
                <ClosedBook />
                <FractionCards labels={deskCards} />
              </>
            )}
            {(scene === "room" || scene === "unit_select" || onboarding) && (
              <ClosedBook />
            )}
            {scene === "closing" && (
              <div className="relative">
                <ClosedBook />
                {stamped && (
                  <span className="anim-stamp absolute -right-3 -top-4 rounded-full border-[3px] border-[#d9534f] px-2 py-1 text-[11px] font-medium text-[#d9534f]">
                    잘했어요
                  </span>
                )}
              </div>
            )}
          </Stage>

          {/* 펼쳐진 사전 — 무대 위에 겹쳐 놓는다 */}
          {scene === "dictionary" && prepCard.length > 0 && (
            <div className="absolute bottom-2 left-1/2 w-[80%] -translate-x-1/2">
              <OpenBook concepts={prepCard} visual={prepVisual} />
            </div>
          )}

          {/* 시각적 반증 — 교정하는 주체는 모르미가 아니라 이 그림이다 */}
          {visual && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-end gap-5 rounded-xl border-2 border-[#d9b98a] bg-white/95 px-6 py-3 shadow-lg">
              {visual.compare.map((n, i) => (
                <FractionPizza
                  key={n}
                  n={n}
                  shade={visual.shades?.[i] ?? visual.shade ?? 1}
                  size={86}
                />
              ))}
            </div>
          )}
        </div>

        {/* 대화 */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4 text-center [&>*]:text-left">
          {!sid && (
            <p className="pt-6 text-sm text-stone-400">{name}를 부르고 있어요…</p>
          )}
          {childSaid && (
            <div className="flex justify-end">
              <p className="max-w-[78%] rounded-2xl rounded-br-sm bg-[#5ec9b0] px-4 py-2 text-[15px] text-white">
                {childSaid}
              </p>
            </div>
          )}
          {/*
            생성 중이면 지금까지 온 글자를 그대로 보여준다 (스트리밍).
            끝났으면 서버가 나눠준 말풍선들을 각각 띄운다 — 화제가 바뀌는
            자리를 줄바꿈으로 이으면 아이가 한 덩어리로 읽는다.
            응답 대기 중 이전 발화를 숨기는 이유: 아이 말 아래 지난 말이
            남으면 순서가 뒤바뀐 것으로 읽힌다.
          */}
          {streaming !== null ? (
            <Bubble text={streaming} caret />
          ) : (
            !busy &&
            (turn?.bubbles ?? (turn?.mormi ? [turn.mormi] : [])).map((b, i) => (
              <Bubble key={i} text={b} />
            ))
          )}
          {dictCard && scene !== "dictionary" && (
            <p className="mx-auto max-w-md rounded-xl border-2 border-[#c3aede] bg-[#f7f2fd] px-4 py-2.5 text-[13px] text-[#5c4a7d]">
              궁금해 사전 — {dictCard}
            </p>
          )}
          {/* 실패를 조용히 넘기지 않는다 — 아이 눈에는 모르미가 같은 질문만 반복하는 것으로 보인다 */}
          {failed && (
            <>
              <Bubble text="어… 나 갑자기 멍해졌어. 방금 거 한 번만 다시 말해줄래?" />
              <div className="flex justify-start">
                <button
                  onClick={() => childSaid && say(childSaid, childSaid === "모르겠어…")}
                  className="rounded-full border-2 border-[#c9a06a] px-4 py-1.5 text-[13px] text-stone-600 hover:bg-[#fffaf0]"
                >
                  다시 보내기
                </button>
              </div>
            </>
          )}
          {busy && streaming === null && (
            <p className="text-sm text-stone-400">{name}가 생각하는 중…</p>
          )}
        </div>

        {/* 입력 — 모드는 서버가 지정한다 */}
        <div className="border-t-2 border-[#f0e2c8] bg-[#fffdf7] p-3">
          {input === "button" && (
            <button
              onClick={() =>
                post({
                  action:
                    scene === "room"
                      ? "begin"
                      : scene === "dictionary"
                        ? "ready"
                        : "accept",
                })
              }
              disabled={busy || !sid}
              className="w-full rounded-full bg-[#5ec9b0] py-3.5 text-[15px] text-white shadow-sm hover:bg-[#4fb69e] disabled:opacity-40"
            >
              {scene === "room"
                ? `오늘 공부한 내용을 ${name}에게 알려줄래!`
                : scene === "dictionary"
                  ? "준비 다 했어!"
                  : "응, 물어봐"}
            </button>
          )}

          {input === "cards" && (
            <div className="flex flex-wrap gap-2">
              {turn?.choices?.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    // 아이 말풍선을 이번 선택으로 갱신한다. 안 하면 직전 단계의
                    // 대답("모르미")이 남아 모르미 반응과 어긋나 보인다.
                    setChildSaid(`오늘은 ${withObject(c)} 배웠어!`);
                    void post({ action: "selectUnit", concept: c });
                  }}
                  disabled={busy}
                  className="flex-1 rounded-xl border-2 border-[#c9a06a] bg-white px-4 py-3.5 text-[15px] text-stone-700 hover:bg-[#fffaf0]"
                >
                  {c}
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
              <div className="flex gap-3">
                {turn?.choices?.map((c) => (
                  <button
                    key={c}
                    onClick={() => say(c, false, true)}
                    disabled={busy}
                    className="flex-1 rounded-2xl border-2 border-[#5ec9b0] bg-white py-6 text-[22px] text-[#2f7f6d] shadow-sm transition-transform active:scale-95 hover:bg-[#f2fbf8] disabled:opacity-40"
                  >
                    {c}
                  </button>
                ))}
              </div>
              {/* 첫 만남의 선택지(작명)에는 '모르겠어'가 없다 — 틀릴 수 있는 질문이 아니다 */}
              {!onboarding && (
                <button
                  onClick={() => say("", true)}
                  disabled={busy}
                  className="w-full rounded-full border-2 border-stone-300 py-2.5 text-sm text-stone-500 hover:bg-stone-50"
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
                  className="flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 border-[#c9a06a] bg-white py-3 transition-transform active:scale-95 hover:bg-[#fffaf0] disabled:opacity-40"
                >
                  <span className="text-3xl">{COVER_ICON[c] ?? "⭐"}</span>
                  <span className="text-[13px] text-stone-600">{c}</span>
                </button>
              ))}
            </div>
          )}

          {/* 문장 수준(사다리 3단계)에서만 직접 말하기 — 지금은 타이핑, 나중에 음성 */}
          {input === "mic" && dictation && (
            <p className="mb-2 rounded-xl border-2 border-dashed border-[#c3aede] bg-[#f7f2fd] px-3 py-2 text-[13px] text-[#5c4a7d]">
              📖 사전 속 문장을 그대로 따라 써보자
            </p>
          )}
          {input === "mic" && (
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // 한글 조합 중 Enter는 확정 키다 — 여기서 보내면 마지막 글자가 잘린다
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                }}
                disabled={busy}
                placeholder={
                  onboarding
                    ? "이름을 알려주세요…"
                    : dictation
                      ? "사전 속 문장을 따라 써보세요…"
                      : `${name}에게 가르쳐 주세요…`
                }
                className="min-w-0 flex-1 rounded-full border-2 border-[#e0c69a] px-4 py-3 text-[16px] outline-none focus:border-[#5ec9b0]"
              />
              {/* 아이패드 화상 키보드에는 Enter가 눈에 띄지 않는다 — 보내기 버튼을 항상 둔다 */}
              <button
                onClick={submit}
                disabled={busy || !text.trim()}
                className="shrink-0 rounded-full bg-[#5ec9b0] px-5 py-3 text-[15px] text-white hover:bg-[#4fb69e] disabled:opacity-30"
              >
                말했어!
              </button>
              {!onboarding && (
                <button
                  onClick={() => say("", true)}
                  disabled={busy}
                  className="shrink-0 rounded-full border-2 border-stone-300 px-4 py-3 text-sm text-stone-500 hover:bg-stone-50"
                >
                  모르겠어
                </button>
              )}
            </div>
          )}

          {/* 한 개념을 끝낸 뒤 — 더 가르칠지는 아이가 고른다 */}
          {input === "continue" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setChildSaid("하나 더 가르쳐줄래!");
                  void post({ action: "continueTeaching" });
                }}
                disabled={busy}
                className="flex-1 rounded-full bg-[#5ec9b0] py-3.5 text-[15px] text-white hover:bg-[#4fb69e]"
              >
                하나 더 가르쳐줄래!
              </button>
              <button
                onClick={() => {
                  setChildSaid("오늘은 여기까지");
                  void post({ action: "finishTeaching" });
                }}
                disabled={busy}
                className="rounded-full border-2 border-[#c9a06a] px-6 py-3.5 text-[15px] text-stone-600 hover:bg-[#fffaf0]"
              >
                오늘은 여기까지
              </button>
            </div>
          )}

          {input === "stamp" && (
            <div className="flex gap-2">
              <button
                onClick={() => post({ action: "stamp" })}
                disabled={busy}
                className="flex-1 rounded-full bg-[#5ec9b0] py-3.5 text-[15px] text-white hover:bg-[#4fb69e]"
              >
                맞아! (도장 찍기)
              </button>
              <button
                onClick={() => post({ action: "stamp" })}
                disabled={busy}
                className="rounded-full border-2 border-stone-300 px-6 py-3.5 text-sm text-stone-500"
              >
                아니야
              </button>
            </div>
          )}

          {input === "none" && (
            <button
              onClick={newSession}
              className="w-full rounded-full border-2 border-[#c9a06a] py-3.5 text-[15px] text-stone-600 hover:bg-[#fffaf0]"
            >
              오늘 가르친 것 {notes.length}개 · 다시 가르치기
            </button>
          )}
        </div>
      </div>

      {/* 별노트 + 진단 (진단은 교사용이며 실제 아이 화면에는 노출하지 않는다) */}
      <aside className="hidden w-64 shrink-0 flex-col gap-3 lg:flex">
        <div className="flex items-center gap-2">
          <button
            onClick={newSession}
            className="rounded-full bg-[#e0b07a] px-4 py-1.5 text-sm text-white hover:bg-[#d09f68]"
          >
            {sid ? "새 세션" : "세션 시작"}
          </button>
          <button
            onClick={resetAll}
            title="프로필을 지우고 첫 만남부터 다시 본다 (데모용)"
            className="rounded-full border border-stone-300 px-3 py-1.5 text-[12px] text-stone-500 hover:bg-stone-50"
          >
            첫 만남부터
          </button>
        </div>
        {turn && (
          <span className="text-[11px] text-stone-400">
            {scene} · 사다리 {turn.ladder} · {turn.elapsedSec}초
          </span>
        )}

        <StarNote
          notes={notes}
          typing={typing}
          cover={turn?.cover}
          past={past}
          childName={turn?.childName}
        />

        {turn && turn.report.length > 0 && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <h2 className="mb-1.5 text-[11px] font-medium text-stone-500">
              진단 기록 (교사용 · 아이 비노출)
            </h2>
            <ul className="space-y-1">
              {turn.report.map((r, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-stone-600">
                  <span className="font-medium">[{r.grade}]</span> {r.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
