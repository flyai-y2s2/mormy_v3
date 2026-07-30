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
        fill={i < shade ? "#f5a524" : "#fdf0d5"}
        stroke="#b4741a"
        strokeWidth="1.6"
      />,
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: size }}>
      <svg viewBox="0 0 104 104" width="100%" aria-label={`${shade}/${n}`}>
        {slices}
      </svg>
      <span className="text-[13px] font-medium text-[#8a5a12]">
        {shade}/{n}
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
          className="flex h-14 w-12 items-center justify-center rounded-md border-2 border-[#c9a06a] bg-white text-lg font-medium text-stone-700 shadow-sm"
          style={{ transform: `rotate(${i === 0 ? -4 : 3}deg)` }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}
