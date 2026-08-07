import { FractionText } from "./FractionText";
import { LearningVisual } from "./LearningVisual";
import type { LearningVisual as LearningVisualSpec } from "@/lib/learning-visual";

/** 책상 위에 덮여 있는 궁금해 사전 (room·teaching 씬) */
export function ClosedBook({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="relative h-14 w-24 -rotate-3 rounded-r-lg rounded-l-sm bg-[#8062a6] shadow-[0_6px_12px_rgba(52,35,72,.24)] disabled:cursor-default"
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

/** 중앙에 뜨는 궁금해 사전. 한 화면에는 규칙 하나만 보여준다. */
export function OpenBook({
  concepts,
  visual,
}: {
  concepts: string[];
  visual?: LearningVisualSpec;
}) {
  const rule = concepts[0] ?? "규칙을 그림으로 다시 살펴봐요.";
  return (
    <section
      className="dictionary-popup"
      role="dialog"
      aria-labelledby="dictionary-title"
    >
      <div className="dictionary-popup__handle" aria-hidden="true" />
      <p id="dictionary-title" className="dictionary-popup__title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5c3.2-.7 5.9 0 8 2v12c-2.1-2-4.8-2.7-8-2V5.5Zm16 0c-3.2-.7-5.9 0-8 2v12c2.1-2 4.8-2.7 8-2V5.5Z" />
        </svg>
        궁금해 사전
      </p>
      <p className="dictionary-popup__rule">
        <FractionText text={rule} />
      </p>
      <div className="dictionary-popup__visual">
        {visual ? (
          <LearningVisual visual={visual} />
        ) : (
          <span className="text-sm text-stone-400">그림으로 확인해요</span>
        )}
      </div>
    </section>
  );
}
