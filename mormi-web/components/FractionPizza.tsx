import { FractionText, StackedFraction } from "./FractionText";

/**
 * 시각적 반증 — n등분한 원에서 shade개 조각을 칠해 보여준다.
 * 교정하는 주체는 모르미가 아니라 이 그림(증거)이다.
 */
export function FractionPizza({
  n,
  shade = 1,
  size = 112,
}: {
  n: number;
  shade?: number;
  size?: number;
}) {
  const r = 46;
  const c = 52;
  const slices = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    slices.push(
      <path
        key={i}
        d={`M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`}
        fill={i < shade ? "#f28f79" : "#fff5df"}
        stroke="#a85e4d"
        strokeWidth="1.6"
      />,
    );
  }
  return (
    <div className="fraction-pizza flex flex-col items-center gap-0.5" style={{ width: size }}>
      <svg viewBox="0 0 104 104" width="100%" aria-hidden="true">
        {slices}
      </svg>
      <span className="rounded-full bg-[#fff0e9] px-2.5 py-1 text-[14px] text-[#915044]">
        <StackedFraction numerator={shade} denominator={n} />
      </span>
    </div>
  );
}

/** 책상에 놓인 분수 카드 두 장 — 모르미가 짚으며 묻는 소품 */
export function FractionCards({ labels }: { labels: string[] }) {
  return (
    <div className="flex gap-3">
      {labels.map((l, i) => (
        <div
          key={l}
          className="flex h-14 w-12 items-center justify-center rounded-lg border-2 border-[#dbc49c] bg-[#fffdf7] text-lg text-[#3d4741] shadow-md"
          style={{ transform: `rotate(${i === 0 ? -4 : 3}deg)` }}
        >
          <FractionText text={l} />
        </div>
      ))}
    </div>
  );
}
