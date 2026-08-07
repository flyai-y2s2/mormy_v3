import { Mormi } from "./Mormi";

export type CafeStageSummary = {
  id: string;
  concept: string;
  unlocked: boolean;
  completed: boolean;
  final?: boolean;
};

const STAGE_META = [
  { icon: "🪙", title: "메뉴를 골라요", skill: "가격 비교" },
  { icon: "🧾", title: "모두 얼마일까?", skill: "가격 더하기" },
  { icon: "💵", title: "돈을 받아요", skill: "거스름돈 빼기" },
  { icon: "⭐", title: "모르미랑 카페 가기", skill: "카페 리믹스" },
] as const;

export function CafeStageMap({
  name,
  stages,
  busy,
  onSelect,
}: {
  name: string;
  stages: CafeStageSummary[];
  busy: boolean;
  onSelect: (concept: string) => void;
}) {
  return (
    <section className="cafe-map" aria-labelledby="cafe-map-title">
      <header className="cafe-map__header">
        <div>
          <span className="cafe-map__kicker">☕ 첫 번째 이야기</span>
          <h1 id="cafe-map-title">카페에 가요</h1>
          <p>아래에서부터 하나씩 해봐요.</p>
        </div>
        <div className="cafe-map__friend">
          <div className="cafe-map__speech"><strong>혼자 주문해 보고 싶어!</strong><span>옆에서 도와줄래?</span></div>
          <Mormi mood="happy" size={170} name={name} />
        </div>
      </header>

      <ol className="cafe-stage-path">
        {stages.map((stage, index) => {
          const meta = STAGE_META[index] ?? STAGE_META[0];
          return (
            <li key={stage.id} className={stage.final ? "is-final" : ""}>
              <button
                type="button"
                className={`cafe-stage ${stage.completed ? "is-complete" : ""} ${!stage.unlocked ? "is-locked" : ""}`}
                disabled={busy || !stage.unlocked}
                onClick={() => onSelect(stage.concept)}
              >
                <span className="cafe-stage__number">{stage.completed ? "✓" : stage.unlocked ? index + 1 : "🔒"}</span>
                <span className="cafe-stage__icon" aria-hidden="true">{meta.icon}</span>
                <span className="cafe-stage__copy"><strong>{meta.title}</strong><small>{meta.skill}</small></span>
                <span className="cafe-stage__state">{stage.completed ? "다시 하기" : stage.unlocked ? "시작하기" : "앞 단계를 먼저 해요"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
