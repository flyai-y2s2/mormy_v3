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
export function ProblemBoard({ problem }: { problem: ProblemView }) {
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
    </section>
  );
}
