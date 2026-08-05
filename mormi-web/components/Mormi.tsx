import Image from "next/image";

/**
 * 모르미 캐릭터.
 * 오케스트레이터가 보내는 mood 계약은 그대로 유지하고, 표현만 3D 토이 에셋으로 바꾼다.
 */
export type Mood = "idle" | "confident" | "puzzled" | "aha" | "shy" | "happy";

const IMAGE_BY_MOOD: Record<Mood, string> = {
  idle: "/characters/mormi-idle.png",
  confident: "/characters/mormi-happy.png",
  puzzled: "/characters/mormi-puzzled.png",
  aha: "/characters/mormi-happy.png",
  shy: "/characters/mormi-puzzled.png",
  happy: "/characters/mormi-happy.png",
};

export function Mormi({
  mood = "idle",
  size = 150,
  bob = true,
}: {
  mood?: Mood;
  size?: number;
  bob?: boolean;
}) {
  return (
    <div
      className={`mormi-figure relative shrink-0 ${bob ? "anim-bob" : ""}`}
      data-mood={mood}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-x-[18%] bottom-[5%] h-[11%] rounded-full bg-[#6b4c35]/15 blur-md" />
      <Image
        src={IMAGE_BY_MOOD[mood]}
        alt="모르미"
        fill
        sizes={`${size}px`}
        className="relative object-contain drop-shadow-[0_14px_18px_rgba(76,56,40,.16)]"
        priority={size >= 120}
      />
      {mood === "aha" && (
        <span className="anim-spark absolute right-[3%] top-[13%] text-2xl text-[#f3b83f]" aria-hidden>✦</span>
      )}
    </div>
  );
}

export default Mormi;
