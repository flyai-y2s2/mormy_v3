"use client";

import { useEffect, useState } from "react";
import { withSubject } from "@/lib/korean";

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
  childName,
}: {
  notes: { text: string; coauthored?: boolean }[];
  typing?: string | null;
  /** 아이 이름 — 노트의 주인이 누구인지 이름으로 남긴다 */
  childName?: string;
  /** 아이가 첫 만남에서 고른 표지 */
  cover?: string;
  /** 지난 세션에 적힌 기록 — 누적이 눈에 보여야 가르칠 이유가 남는다 */
  past?: { text: string; day: number; coauthored?: boolean }[];
}) {
  // "네가"보다 이름으로 불러야 노트가 '내 것'으로 남는다. 조사는 받침으로 고른다.
  const by = childName ? withSubject(childName) : "네가";
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[#d9b98a] bg-[#fffdf5]">
      <h2 className="flex items-center gap-1.5 px-4 pb-2 pt-4 text-sm font-medium text-[#8a6d3f]">
        <span className="text-base leading-none">{COVER[cover] ?? <Star />}</span>{" "}
        별노트
      </h2>

      {/*
        속지 — 리갈패드. 가로 괘선 간격(26px)과 글줄(leading-[26px])을 맞추고,
        빨간 세로선(30px) 오른쪽에서 글이 시작되도록 padding 을 둔다.
      */}
      <div className="paper-ruled min-h-[104px] pb-4 pl-[38px] pr-4">
        {notes.length === 0 && past.length === 0 && !typing && (
          <p className="pt-[3px] text-xs leading-[26px] text-stone-400">
            네가 가르쳐준 말이 여기에 적혀요
          </p>
        )}

        <ul>
          {past.map((n, i) => (
            <Entry
              key={`p${i}`}
              text={n.text}
              day={n.day}
              coauthored={n.coauthored}
              by={by}
              faded
            />
          ))}
          {notes.map((n, i) => (
            <Entry key={i} text={n.text} coauthored={n.coauthored} by={by} />
          ))}
          {typing && <Entry text={typing} animate by={by} />}
        </ul>
      </div>
    </div>
  );
}

function Entry({
  text,
  animate,
  day,
  faded,
  coauthored,
  by = "네가",
}: {
  text: string;
  animate?: boolean;
  day?: number;
  faded?: boolean;
  coauthored?: boolean;
  /** 노트를 남긴 사람 — "승은이가" 처럼 조사가 붙은 형태로 받는다 */
  by?: string;
}) {
  const shown = useTyped(text, animate);
  // 글줄을 괘선(26px)에 앉힌다 — 구분선 없이도 리갈패드 줄이 항목을 나눠 준다.
  return (
    <li>
      <p
        className={`font-hand text-[20px] leading-[26px] ${faded ? "text-[#7e8aa2]" : "text-[#26355c]"}`}
        style={{ transform: "rotate(-0.4deg)" }}
      >
        {shown}
        {animate && shown.length < text.length && (
          <span style={{ animation: "hand-caret .8s infinite" }}>|</span>
        )}
      </p>
      <p className="font-hand text-[15px] leading-[26px] text-[#8f6d33]">
        — {coauthored ? "같이 완성함" : `${by} 알려줌`}{day ? ` (${day}일째)` : ""}
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
