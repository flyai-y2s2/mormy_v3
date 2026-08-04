// 런타임 조회는 폐지 — 사전 문장은 콘텐츠에 고정 큐레이션(prep). 이 파일은 KB 소싱 풀로만 남긴다.
import kb from "@/content/curriculum/4수01-11.json";

/**
 * 커리큘럼 지식베이스 — AI Hub 「교과 단계별 교과 데이터」에서 추출.
 * scripts/build_curriculum.py 로 생성한다.
 *
 * 교안 카드(수업 준비)와 궁금해 사전(정답의 최종 보루)의 근거가 되며,
 * 사전이 내용을 지어내지 않도록 여기 있는 문장만 사용한다.
 */

interface Concept {
  text: string;
  source: string;
}
interface DictEntry {
  q: string;
  a: string;
  source: string;
}

const concepts = kb.concepts as Concept[];
const dictionary = kb.dictionary as DictEntry[];

export const standard = kb.standard;
export const standardText = kb.standard_text;

/**
 * 교안 카드 — 아이가 '가르칠 사람'으로서 훑는 핵심 정리 (수업 준비 단계).
 * 1분 안에 훑을 분량이어야 하므로 2문장으로 제한한다.
 */
export function prepCard(keywords: string[]): string[] {
  return rank(concepts, keywords, (c) => c.text)
    .slice(0, 2)
    .map((c) => c.text);
}

/** 궁금해 사전 — 개념 문장 + 교과 QA 근거를 함께 반환 */
export function lookupDictionary(keywords: string[]): {
  concept: string | null;
  qa: DictEntry | null;
} {
  const c = rank(concepts, keywords, (x) => x.text)[0] ?? null;
  const q = rank(dictionary, keywords, (x) => `${x.q} ${x.a}`)[0] ?? null;
  return { concept: c ? c.text : null, qa: q };
}

/**
 * 키워드 적합도로 정렬하되, 특정 사례("가장 큰 단위분수는 1/3입니다")보다
 * 일반 규칙("분모가 클수록 작은 분수입니다")을 앞세운다.
 * 교안 카드는 규칙을 알려주는 자리이지 답을 알려주는 자리가 아니다.
 */
function rank<T>(items: T[], keywords: string[], text: (t: T) => string): T[] {
  return items
    .map((item) => {
      const s = text(item);
      const hits = keywords.reduce((n, k) => (s.includes(k) ? n + 1 : n), 0);
      const digitRatio =
        [...s].filter((c) => c >= "0" && c <= "9").length / Math.max(s.length, 1);
      return { item, score: hits - digitRatio * 4 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
