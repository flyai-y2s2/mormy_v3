import { FractionPizza } from "./FractionPizza";
import { FractionText } from "./FractionText";

export interface ProblemView {
  eyebrow: string;
  title: string;
  prompt: string;
  hint?: string;
  visual: { compare: number[]; shade?: number; shades?: number[] };
}

/** 해결되기 전까지 화면 중앙에 남는 문제판. 그림은 풀이 근거로 사용한다. */
export function ProblemBoard({ problem, onHint }: { problem: ProblemView; onHint?: () => void }) {
  return (
    <section className="problem-board" aria-labelledby="problem-title">
      <header className="problem-board__header">
        <div className="step-heading">
          <span className="step-heading__number">1</span>
          <strong>문제를 봐요</strong>
        </div>
        <span className="problem-board__eyebrow">{problem.eyebrow}</span>
      </header>
      <div className="problem-board__body">
        <div className="problem-board__copy">
          <h2 id="problem-title" className="problem-board__title">{problem.title}</h2>
          <p className="problem-board__prompt"><FractionText text={problem.prompt} /></p>
        </div>
        <div className="problem-board__visual" aria-label="문제를 푸는 데 사용하는 분수 그림">
          {problem.visual.compare.map((n, index) => (
            <FractionPizza
              key={`${n}-${index}`}
              n={n}
              shade={problem.visual.shades?.[index] ?? problem.visual.shade ?? 1}
              size={82}
            />
          ))}
        </div>
      </div>
      {problem.hint && onHint && (
        <div className="problem-board__tools">
          <button className="dictionary-hint-button" onClick={onHint}>
            <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5.5c3.2-.7 5.9 0 8 2v12c-2.1-2-4.8-2.7-8-2V5.5Zm16 0c-3.2-.7-5.9 0-8 2v12c2.1-2 4.8-2.7 8-2V5.5Z" />
            </svg>
            <span>궁금해 사전</span>
            <small>힌트 보기</small>
          </button>
        </div>
      )}
    </section>
  );
}
