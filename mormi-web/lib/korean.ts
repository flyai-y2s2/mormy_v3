/**
 * 한글 조사·음절 유틸 — 서버와 화면이 함께 쓴다.
 *
 * profile.ts 는 `fs` 를 쓰기 때문에 클라이언트 컴포넌트가 import 할 수 없다.
 * 순수 계산만 하는 이 함수들을 따로 두어 양쪽에서 안전하게 쓴다.
 *
 * 완성형 한글 음절: 0xAC00 + (초성*21 + 중성)*28 + 종성
 * 종성이 0이면 받침이 없다.
 */

/** 받침이 있는 음절인가 (한글이 아니면 false) */
function hasFinalConsonant(name: string): boolean {
  const code = name.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}

/**
 * 이름 + 주격 조사. 받침이 있으면 "이가", 없으면 "가".
 * 아이 이름을 틀린 조사로 부르면 "내 이름을 아는 존재"라는 느낌이 깨진다.
 */
export function withSubject(name: string): string {
  return hasFinalConsonant(name) ? `${name}이가` : `${name}가`;
}

/** 이름 + 서술격 조사. 받침이 있으면 "이야", 없으면 "야". */
export function withCopula(name: string): string {
  return hasFinalConsonant(name) ? `${name}이야` : `${name}야`;
}

/** 이름 + 동반격 조사. 받침이 있으면 "이랑", 없으면 "랑". */
export function withCompanion(name: string): string {
  return hasFinalConsonant(name) ? `${name}이랑` : `${name}랑`;
}

/** 말 + 목적격 조사. 받침이 있으면 "을", 없으면 "를". */
export function withObject(word: string): string {
  return hasFinalConsonant(word) ? `${word}을` : `${word}를`;
}

// ---------- 이름 잘못 듣기 ----------

const V_SWAP: Record<number, number> = {
  0: 4, // ㅏ → ㅓ
  4: 0,
  1: 5, // ㅐ → ㅔ
  5: 1,
  2: 6, // ㅑ → ㅕ
  6: 2,
  8: 13, // ㅗ → ㅜ
  13: 8,
  12: 17, // ㅛ → ㅠ
  17: 12,
  18: 20, // ㅡ → ㅣ
  20: 18,
};

/**
 * 무작위 오타가 아니라 **잘못 들은 것처럼** 모음 하나만 바꾼다
 * ("지우"→"지오", "하늘"→"하닐"). 놀리는 느낌이 나면 안 된다.
 * 한글이 아니면 null — 억지로 틀리면 놀림이 된다.
 */
export function mishear(name: string): string | null {
  const chars = [...name.trim()];
  for (let i = chars.length - 1; i >= 0; i--) {
    const code = chars[i].charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) continue; // 완성형 한글 음절이 아니다
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    const jong = code % 28;
    const swapped = V_SWAP[jung];
    if (swapped === undefined) continue;
    chars[i] = String.fromCharCode(0xac00 + (cho * 21 + swapped) * 28 + jong);
    return chars.join("");
  }
  return null;
}
