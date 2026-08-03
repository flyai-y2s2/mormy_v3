import { Mormi, type Mood } from "./Mormi";

/**
 * 무대 — 유저(선생님) 1인칭 시점의 방과 책상.
 * 모든 씬이 이 무대를 공유한다. 모르미가 같은 방에 계속 있다는 연속성이
 * '동생을 돌본다'는 관계의 바탕이 된다.
 *
 * room 씬에서는 모르미가 바닥에서 블록을 쌓고,
 * 그 외 씬에서는 책상 맞은편에 앉는다.
 */
export function Stage({
  atDesk,
  mood = "idle",
  writing = false,
  noteIcon = "⭐",
  children,
}: {
  atDesk: boolean;
  mood?: Mood;
  /** 별노트에 적는 중 — 모르미가 품에서 노트를 꺼내 끄적인다 */
  writing?: boolean;
  /** 노트 표지 그림 — 첫 만남에서 아이가 고른 것 */
  noteIcon?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative h-[300px] shrink-0 overflow-hidden rounded-t-2xl bg-[#fbf1dd]">
      {/* 벽 무늬 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,#fff8ea,transparent_62%)]" />
      {/* 창문 */}
      <div className="absolute left-6 top-7 h-16 w-20 rounded-md border-4 border-[#e4cfa7] bg-[#dff1f7]">
        <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-[#e4cfa7]" />
      </div>
      {/* 벽에 붙은 그림 */}
      <div className="absolute right-8 top-8 h-14 w-14 rotate-3 rounded-md border-4 border-[#e4cfa7] bg-[#fde8c8]" />

      {/* 바닥 */}
      <div className="absolute bottom-0 h-[46%] w-full bg-[#f0dcbc]" />

      {/* 모르미 — 책상 맞은편에 앉거나, 바닥에서 블록놀이 */}
      <div
        className="absolute transition-all duration-700 ease-out"
        style={
          atDesk
            ? // 하반신이 책상에 가려져야 '맞은편에 앉은' 것으로 읽힌다
              { left: "50%", bottom: 56, transform: "translateX(-50%)" }
            : { left: "16%", bottom: 82, transform: "translateX(-50%) scale(0.82)" }
        }
      >
        <Mormi mood={mood} size={atDesk ? 156 : 128} />
      </div>

      {!atDesk && <Blocks />}

      {/* 책상 — 1인칭이므로 화면 앞쪽으로 튀어나온다 */}
      <div className="absolute bottom-0 w-full">
        <div className="h-3 bg-[#c99a5c]" />
        <div className="relative flex h-[86px] items-center justify-center gap-4 bg-[#e0b07a] px-6">
          {children}
        </div>
      </div>

      {/* 별노트에 적는 중 — 모르미 가슴께에서 나와 책상(또는 바닥) 위에 놓인다 */}
      {writing && (
        <WritingNote
          icon={noteIcon}
          style={
            atDesk
              ? { left: "36%", bottom: 44 } // 책상 중앙의 사전과 겹치지 않게 왼쪽
              : { left: "30%", bottom: 96 }
          }
        />
      )}
    </div>
  );
}

/**
 * 끄적끄적 적히는 중인 별노트.
 * 표지 그림(아이가 고른 것)이 모서리에 보이고, 연필이 줄을 따라 왕복하며
 * 잉크 선이 차오른다. 실제 문장은 오른쪽 별노트 패널에 동시에 타이핑된다.
 */
function WritingNote({
  icon,
  style,
}: {
  icon: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="anim-note-pop absolute z-10" style={style}>
      <div
        className="relative h-[58px] w-[84px] rounded-md border-2 border-[#d9b98a] bg-[#fffdf5] shadow-md"
        style={{ transform: "rotate(-2deg)" }}
      >
        {/* 스프링 제본 */}
        <div className="absolute -top-[5px] left-0 flex w-full justify-evenly">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-[8px] w-[3px] rounded-full bg-[#b08b52]" />
          ))}
        </div>
        {/* 표지 그림 — 아이가 고른 것 */}
        <span className="absolute -left-2 -top-3 text-[15px] drop-shadow-sm">
          {icon}
        </span>
        {/* 차오르는 잉크 선 */}
        <div className="absolute left-2.5 right-2.5 top-[16px] space-y-[9px]">
          {[0, 0.6, 1.2].map((delay) => (
            <div
              key={delay}
              className="anim-ink h-[2px] rounded bg-[#8fa3c4]/70"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>
        {/* 연필 */}
        <div
          className="anim-scribble absolute bottom-[10px] left-[14px]"
          style={{ transformOrigin: "bottom left" }}
        >
          <div className="h-[26px] w-[5px] rounded-t-sm bg-[#f2b544]">
            <div
              className="absolute -bottom-[6px] left-0 h-0 w-0"
              style={{
                borderLeft: "2.5px solid transparent",
                borderRight: "2.5px solid transparent",
                borderTop: "7px solid #6b5537",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 쌓다 무너지는 블록 — 대사 없이 '서툰 동생'을 보여주는 장치.
 * 아래 칸부터 차례로 올라가고 다 같이 무너진다.
 */
function Blocks() {
  const colors = ["#f0a04b", "#7fc4d6", "#f2cd5c", "#e88b8b"];
  return (
    <div className="absolute bottom-[116px] left-[31%] flex flex-col-reverse items-center gap-[3px]">
      {colors.map((c, i) => (
        <div
          key={c}
          className="anim-block h-6 w-11 rounded-[3px] shadow-sm"
          style={{ background: c, animationDelay: `${i * 0.42}s` }}
        />
      ))}
    </div>
  );
}
