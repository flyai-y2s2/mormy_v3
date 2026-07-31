import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

/**
 * 아이 프로필 — 세션 사이를 넘어 남는 유일한 상태.
 *
 * 이 파일이 필요한 이유: 모르미는 "아이가 가르쳐준 것만" 기억한다.
 * 그 기억이 세션 종료와 함께 사라지면, 이틀째 오프닝("어제 네가 알려준 거
 * 혼자 해봤어")이 성립하지 않는다. 프로테제 효과는 가르친 것이 남아 있다는
 * 증거를 아이가 눈으로 확인할 때 강해진다.
 *
 * 프로토타입이라 아이 한 명 = 파일 하나다. 다중 사용자는 DB로 옮긴다.
 */

export interface StarNoteEntry {
  /** 아이가 한 말 그대로 — 모르미가 요약하거나 다듬지 않는다 */
  text: string;
  concept: string;
  day: number;
  /** 마중물(모르미의 질문 어절) + 아이의 완성으로 만들어진 문장 — "네가 알려줌"이 아니라 "네가 완성해줌" */
  coauthored?: boolean;
}

export interface Profile {
  childName: string;
  mormiName: string; // 아이가 지어준 이름
  noteCover: string; // 아이가 고른 별노트 표지
  sessionCount: number;
  starNotes: StarNoteEntry[];
  learnedIds: string[];
}

// 서버리스(Vercel)에서는 배포 디렉터리가 읽기 전용이고 인스턴스도 요청마다 바뀐다.
// 그래서 이 파일 저장은 '로컬 개발 편의' 용도일 뿐, 프로필의 진짜 보관처는
// 브라우저(localStorage)다 — 화면이 프로필을 들고 다니며 매 요청에 실어 보낸다.
const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "profile.json");

export function loadProfile(): Profile | null {
  try {
    if (!existsSync(FILE)) return null;
    return JSON.parse(readFileSync(FILE, "utf-8")) as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile): void {
  // 읽기 전용 파일시스템에서 던지면 세션이 통째로 500 이 된다. 저장은 최선 노력이다.
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(p, null, 2), "utf-8");
  } catch {
    /* 서버리스 환경 — 프로필은 화면이 보관한다 */
  }
}

export function resetProfile(): void {
  try {
    if (existsSync(FILE)) writeFileSync(FILE, "null", "utf-8");
  } catch {
    /* 서버리스 환경 — 화면이 자기 쪽 프로필을 지운다 */
  }
}

export function newProfile(): Profile {
  return {
    childName: "",
    mormiName: "모르미",
    noteCover: "star",
    sessionCount: 0,
    starNotes: [],
    learnedIds: [],
  };
}

// 한글 조사·음절 유틸은 화면에서도 쓰므로 fs 를 타지 않는 모듈에 둔다.
export { withSubject, withCopula, mishear } from "./korean";
