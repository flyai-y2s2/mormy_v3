/**
 * 모르미 캐릭터.
 * 표정은 시나리오의 연출 지점과 대응한다:
 *   confident 자신만만하게 틀리는 순간 (웃음 포인트)
 *   puzzled   되묻는 순간
 *   aha       "아~!" 깨닫는 순간 (세션의 감정 정점)
 *   shy       비난을 흡수하는 순간 ("내가 이상하게 물어봤지?")
 */

export type Mood = "idle" | "confident" | "puzzled" | "aha" | "shy" | "happy";

const BODY = "#5ec9b0";
const BODY_DARK = "#3aa892";
const CHEEK = "#f7a8a0";

export function Mormi({
  mood = "idle",
  size = 150,
  bob = true,
}: {
  mood?: Mood;
  size?: number;
  bob?: boolean;
}) {
  const tilt = mood === "puzzled" ? -8 : mood === "shy" ? 6 : 0;

  return (
    <div className={bob ? "anim-bob" : undefined} style={{ width: size }}>
      <svg viewBox="0 0 120 130" width="100%" role="img" aria-label="모르미">
        <g transform={`rotate(${tilt} 60 70)`} style={{ transition: "transform .4s" }}>
          {/* 안테나 */}
          <line x1="60" y1="18" x2="60" y2="8" stroke={BODY_DARK} strokeWidth="3" />
          <circle
            cx="60"
            cy="6"
            r="5"
            fill={mood === "aha" ? "#ffd45e" : BODY_DARK}
            style={{ transition: "fill .3s" }}
          />

          {/* 몸통 */}
          <rect x="36" y="86" width="48" height="34" rx="12" fill={BODY} />
          <rect x="48" y="96" width="24" height="14" rx="5" fill="#e8fbf5" />
          {/* 팔 */}
          <rect x="24" y="92" width="12" height="9" rx="4" fill={BODY_DARK} />
          <rect x="84" y="92" width="12" height="9" rx="4" fill={BODY_DARK} />

          {/* 머리 */}
          <rect x="18" y="18" width="84" height="70" rx="26" fill={BODY} />
          {/* 얼굴 판 */}
          <rect x="26" y="28" width="68" height="50" rx="20" fill="#f4fffb" />

          <Eyes mood={mood} />
          <Mouth mood={mood} />

          {/* 볼 */}
          <circle
            cx="34"
            cy="62"
            r={mood === "shy" ? 7 : 5}
            fill={CHEEK}
            opacity={mood === "shy" ? 0.85 : 0.55}
            style={{ transition: "all .3s" }}
          />
          <circle
            cx="86"
            cy="62"
            r={mood === "shy" ? 7 : 5}
            fill={CHEEK}
            opacity={mood === "shy" ? 0.85 : 0.55}
            style={{ transition: "all .3s" }}
          />
        </g>

        {/* "아~!" 반짝임 */}
        {mood === "aha" && (
          <g className="anim-sparkle">
            <Spark x={16} y={22} r={7} />
            <Spark x={104} y={18} r={9} />
            <Spark x={96} y={44} r={5} />
          </g>
        )}
      </svg>
    </div>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  // 아하 순간에 눈동자가 커진다 — 연출의 핵심
  const r = mood === "aha" ? 11 : mood === "confident" ? 6 : 8;
  const pupil = mood === "aha" ? 6 : 4;

  if (mood === "confident") {
    // 뿌듯하게 반쯤 감은 눈 (^ ^)
    return (
      <g stroke="#2f3b38" strokeWidth="3.4" fill="none" strokeLinecap="round">
        <path d="M36 54 Q44 46 52 54" />
        <path d="M68 54 Q76 46 84 54" />
      </g>
    );
  }

  if (mood === "shy") {
    return (
      <g stroke="#2f3b38" strokeWidth="3.4" fill="none" strokeLinecap="round">
        <path d="M36 52 Q44 58 52 52" />
        <path d="M68 52 Q76 58 84 52" />
      </g>
    );
  }

  return (
    <g style={{ transition: "all .3s" }}>
      <circle cx="44" cy="52" r={r} fill="#fff" stroke="#2f3b38" strokeWidth="2" />
      <circle cx="76" cy="52" r={mood === "puzzled" ? r - 2 : r} fill="#fff" stroke="#2f3b38" strokeWidth="2" />
      <circle cx="44" cy="53" r={pupil} fill="#2f3b38" />
      <circle cx="76" cy="53" r={pupil} fill="#2f3b38" />
      {mood === "aha" && (
        <>
          <circle cx="41" cy="49" r="2.6" fill="#fff" />
          <circle cx="73" cy="49" r="2.6" fill="#fff" />
        </>
      )}
      {mood === "puzzled" && (
        <path
          d="M68 38 Q76 34 84 39"
          stroke="#2f3b38"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const d =
    mood === "aha"
      ? "M52 66 Q60 78 68 66"
      : mood === "happy" || mood === "confident"
        ? "M52 66 Q60 74 68 66"
        : mood === "shy"
          ? "M54 69 Q60 66 66 69"
          : mood === "puzzled"
            ? "M53 69 L67 67"
            : "M54 68 Q60 72 66 68";
  return (
    <path
      d={d}
      stroke="#2f3b38"
      strokeWidth="3"
      fill={mood === "aha" ? "#2f3b38" : "none"}
      strokeLinecap="round"
      style={{ transition: "all .3s" }}
    />
  );
}

function Spark({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      d={`M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z`}
      fill="#ffd45e"
    />
  );
}
