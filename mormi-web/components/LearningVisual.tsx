import { FractionPizza } from "./FractionPizza";
import type { LearningVisual as LearningVisualSpec } from "@/lib/learning-visual";

const WON = new Intl.NumberFormat("ko-KR");

export function LearningVisual({
  visual,
  compact = false,
}: {
  visual: LearningVisualSpec;
  compact?: boolean;
}) {
  if (visual.type === "pizza") {
    return (
      <div className="fraction-visual" aria-label="분수 그림">
        {visual.compare.map((n, index) => (
          <FractionPizza
            key={`${n}-${index}`}
            n={n}
            shade={visual.shades?.[index] ?? visual.shade ?? 1}
            size={compact ? 70 : 82}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`money-visual ${compact ? "is-compact" : ""}`} aria-label="가격과 돈 그림">
      <div className="money-visual__items">
        {visual.items.map((item) => (
          <div className="menu-price-card" key={`${item.label}-${item.price}`}>
            <span className="menu-price-card__emoji" aria-hidden="true">{item.emoji}</span>
            <span className="menu-price-card__label">{item.label}</span>
            <strong>{WON.format(item.price)}원</strong>
          </div>
        ))}
      </div>
      {(visual.wallet || visual.payment || visual.total || visual.change) && (
        <div className="money-visual__cash">
          {visual.wallet && <span><small>가진 돈</small><strong>{WON.format(visual.wallet)}원</strong></span>}
          {visual.total && <span><small>모두</small><strong>{WON.format(visual.total)}원</strong></span>}
          {visual.payment && <span><small>낸 돈</small><strong>{WON.format(visual.payment)}원</strong></span>}
          {visual.change !== undefined && <span><small>거스름돈</small><strong>{WON.format(visual.change)}원</strong></span>}
        </div>
      )}
    </div>
  );
}
