import { useEffect, useRef } from "react";
import { Mormi, type Mood } from "./Mormi";
import { FractionText } from "./FractionText";

/** 아이가 늘 같은 방에서 모르미를 만난다는 관계 설정을 유지하는 공통 무대. */
export function Stage({
  atDesk,
  mood = "idle",
  writing = false,
  noteIcon = "⭐",
  characterAlign = "center",
  dialogue = [],
  speaking = false,
  showStep = false,
  children,
}: {
  atDesk: boolean;
  mood?: Mood;
  writing?: boolean;
  noteIcon?: string;
  characterAlign?: "center" | "left";
  dialogue?: { role: "mormi" | "child"; text: string }[];
  speaking?: boolean;
  showStep?: boolean;
  children?: React.ReactNode;
}) {
  const roomHeight = Math.min(400, Math.max(260, 220 + dialogue.length * 54));
  const hasDialogue = dialogue.length > 0;
  const dialogueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = dialogueRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [dialogue]);

  return (
    <div
      className={`mormi-room relative shrink-0 overflow-hidden transition-[height] duration-300 ${atDesk ? "is-learning" : "is-welcome"}`}
      style={{ height: roomHeight }}
    >
      <div className="stage-aura" aria-hidden="true" />
      <div className="stage-floor" aria-hidden="true" />
      {showStep && (
        <div className="stage-step-heading step-heading">
          <span className="step-heading__number">2</span>
          <strong>모르미의 질문을 봐요</strong>
        </div>
      )}

      <div
        className={`stage-character ${hasDialogue || characterAlign === "left" ? "is-left" : "is-center"}`}
        style={
          hasDialogue || characterAlign === "left"
            ? { left: atDesk ? "23%" : "21%" }
            : { left: "50%" }
        }
      >
        <div className="stage-character__shadow" aria-hidden="true" />
        <Mormi mood={mood} size={atDesk ? 196 : hasDialogue ? 190 : 250} />
      </div>

      {dialogue.length > 0 && (
        <div
          className={`stage-dialogue ${atDesk ? "is-desk" : "is-room"}`}
          ref={dialogueRef}
          role="log"
          aria-live="polite"
          aria-label="모르미와 나의 대화"
        >
          {dialogue.map((entry, index) => (
            <div
              className={entry.role === "child" ? "stage-child-speech" : `stage-speech ${speaking && index === dialogue.length - 1 ? "is-speaking" : ""}`}
              key={`${entry.role}-${index}-${entry.text}`}
            >
              <span className="stage-dialogue__speaker">{entry.role === "child" ? "내가 한 말" : "모르미"}</span>
              <span><FractionText text={entry.text} /></span>
              {speaking && index === dialogue.length - 1 && entry.role === "mormi" && (
                <span className="stage-speech__caret" aria-hidden="true">▍</span>
              )}
            </div>
          ))}
        </div>
      )}

      {children && <div className="stage-extra">{children}</div>}

      {writing && (
        <WritingNote
          icon={noteIcon}
          style={{ left: "28%", bottom: 18 }}
        />
      )}
    </div>
  );
}

function WritingNote({ icon, style }: { icon: string; style: React.CSSProperties }) {
  return (
    <div className="anim-note-pop absolute z-10" style={style}>
      <div className="relative h-[62px] w-[90px] -rotate-2 rounded-[10px] border-2 border-[#d8b278] bg-[#fffdf5] shadow-lg">
        <div className="absolute -top-[5px] left-0 flex w-full justify-evenly">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-[9px] w-[3px] rounded-full bg-[#8b6846]" />)}
        </div>
        <span className="absolute -left-2 -top-3 text-[16px] drop-shadow-sm">{icon}</span>
        <div className="absolute left-3 right-3 top-[18px] space-y-[9px]">
          {[0, .6, 1.2].map((delay) => <div key={delay} className="anim-ink h-[2px] rounded bg-[#7e9db3]/65" style={{ animationDelay: `${delay}s` }} />)}
        </div>
        <div className="anim-scribble absolute bottom-[10px] left-[17px] h-[28px] w-[5px] rounded-t bg-[#f2b544]" />
      </div>
    </div>
  );
}
