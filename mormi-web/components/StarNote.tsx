"use client";

import { useEffect, useState } from "react";

/**
 * 별노트 — 모르미의 수첩.
 * 아이가 한 말이 삐뚤빼뚤한 손글씨로 그대로 적힌다.
 * 성장의 원인이 '아이의 문장'임을 눈에 보이게 남기는 장치.
 */
export function StarNote({
  notes,
  typing,
  cover = "별",
  past = [],
}: {
  notes: { text: string; coauthored?: boolean }[];
  typing?: string | null;
  /** 아이가 첫 만남에서 고른 표지 */
  cover?: string;
  /** 지난 세션에 적힌 기록 — 누적이 눈에 보여야 가르칠 이유가 남는다 */
  past?: { text: string; day: number; coauthored?: boolean }[];
}) {
  return (
    <div className="rounded-2xl border-2 border-[#d9b98a] bg-[#fffdf5] p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#8a6d3f]">
        <span className="text-base leading-none">{COVER[cover] ?? <Star />}</span>{" "}
        별노트
      </h2>

      {notes.length === 0 && past.length === 0 && !typing && (
        <p className="text-xs text-stone-400">
          네가 가르쳐준 말이 여기에 적혀요
        </p>
      )}

      <ul className="space-y-3">
        {past.map((n, i) => (
          <Entry key={`p${i}`} text={n.text} day={n.day} coauthored={n.coauthored} faded />
        ))}
        {notes.map((n, i) => (
          <Entry key={i} text={n.text} coauthored={n.coauthored} />
        ))}
        {typing && <Entry text={typing} animate />}
      </ul>
    </div>
  );
}

function Entry({
  text,
  animate,
  day,
  faded,
  coauthored,
}: {
  text: string;
  animate?: boolean;
  day?: number;
  faded?: boolean;
  coauthored?: boolean;
}) {
  const shown = useTyped(text, animate);
  return (
    <li className="border-b border-dashed border-[#e3d3b3] pb-2 last:border-0">
      <p
        className={`font-hand text-[19px] leading-snug ${faded ? "text-[#8b96ab]" : "text-[#3f4d68]"}`}
        style={{ transform: "rotate(-0.6deg)" }}
      >
        {shown}
        {animate && shown.length < text.length && (
          <span style={{ animation: "hand-caret .8s infinite" }}>|</span>
        )}
      </p>
      <p className="mt-0.5 font-hand text-[15px] text-[#b08b52]">
        — {coauthored ? "같이 완성함" : "네가 알려줌"}{day ? ` (${day}일째)` : ""}
      </p>
    </li>
  );
}

/** 손글씨가 한 글자씩 적히는 연출 */
function useTyped(text: string, animate?: boolean) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, 55);
    return () => clearInterval(id);
  }, [text, animate]);
  return text.slice(0, n);
}

const COVER: Record<string, string> = {
  별: "⭐",
  로켓: "🚀",
  공룡: "🦕",
  고양이: "🐱",
};

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f2b544" aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.8-5 4.8 1.3 6.8L12 17.5 5.9 20.7 7.2 13.9 2.2 9.1l6.9-.8z" />
    </svg>
  );
}
