import { FractionPizza } from "./FractionPizza";

/** 책상 위에 덮여 있는 궁금해 사전 (room·teaching 씬) */
export function ClosedBook({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="relative h-14 w-24 -rotate-3 rounded-r-md rounded-l-sm bg-[#8f6fb5] shadow-md disabled:cursor-default"
      aria-label="궁금해 사전"
    >
      <span className="absolute left-0 top-0 h-full w-2 rounded-l-sm bg-[#7a5aa0]" />
      <span className="absolute inset-x-4 top-3 h-[3px] rounded bg-[#e8dcf7]/70" />
      <span className="absolute left-4 top-6 h-[3px] w-8 rounded bg-[#e8dcf7]/50" />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#efe6fb]">
        궁금해 사전
      </span>
    </button>
  );
}

/**
 * 펼쳐진 궁금해 사전 — 왼쪽 개념 / 오른쪽 그림 2단.
 * 내용은 교과 데이터에서 추출한 개념 문장만 쓴다. 사전은 지어내지 않는다.
 */
export function OpenBook({
  concepts,
  visual,
}: {
  concepts: string[];
  visual?: { compare: number[]; shade?: number; shades?: number[] };
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border-2 border-[#7a5aa0] bg-[#fffdf7] shadow-lg">
      <div className="w-[58%] space-y-2 border-r-2 border-dashed border-[#d8c6ec] p-4">
        <p className="text-[11px] font-medium text-[#7a5aa0]">궁금해 사전</p>
        <ul className="space-y-1.5">
          {concepts.map((c, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-stone-700">
              · {c}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-1 items-center justify-center gap-3 p-3">
        {visual ? (
          visual.compare.map((n, i) => (
            <FractionPizza
              key={n}
              n={n}
              shade={visual.shades?.[i] ?? visual.shade ?? 1}
              size={74}
            />
          ))
        ) : (
          <span className="text-xs text-stone-400">그림</span>
        )}
      </div>
    </div>
  );
}
