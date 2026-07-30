import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic Messages API 호출 래퍼.
 * 키는 .env.local 의 ANTHROPIC_API_KEY 에서 읽는다 (SDK가 환경변수를 자동으로 사용).
 *
 * 역할별 모델은 비용·지연·품질 균형으로 선정한다:
 *  - classifier 매 턴 호출 + 단순 6종 분류 → 가장 싸고 빠른 Haiku
 *  - speaker    아이가 읽는 발화. 페르소나 제약 준수가 품질의 핵심 → Sonnet, effort 낮게(지연 최소)
 *  - vision     세션당 1회 → Sonnet
 *  - reporter   세션 후 배치 1회, 교사가 읽는 글 → Sonnet, effort 중간
 */

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[claude] ANTHROPIC_API_KEY 가 비어 있습니다. .env.local 에 키를 넣고 서버를 다시 시작하세요.",
  );
}

// 아이와의 턴 중간에 일시 과부하(529)로 죽지 않도록 재시도를 넉넉히 둔다.
const client = new Anthropic({ maxRetries: 5 });

export type ClaudeRole = "speaker" | "classifier" | "vision" | "reporter";

type Effort = "low" | "medium" | "high";

const CONFIG: Record<ClaudeRole, { model: string; effort?: Effort; maxTokens: number }> = {
  // Haiku 4.5 는 effort 파라미터를 지원하지 않으므로 지정하지 않는다.
  classifier: { model: "claude-haiku-4-5", maxTokens: 512 },
  speaker: { model: "claude-sonnet-5", effort: "low", maxTokens: 1024 },
  vision: { model: "claude-sonnet-5", effort: "low", maxTokens: 1024 },
  reporter: { model: "claude-sonnet-5", effort: "medium", maxTokens: 2048 },
};

/** 응답에서 텍스트 블록만 이어 붙인다 (content 는 판별 유니온) */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function guard(message: Anthropic.Message, role: ClaudeRole): void {
  if (message.stop_reason === "refusal") {
    throw new Error(`[${role}] 모델이 응답을 거절했습니다`);
  }
  if (message.stop_reason === "max_tokens") {
    console.warn(`[${role}] max_tokens 로 잘렸습니다 — 한도를 늘리세요`);
  }
}

/** 자유 텍스트 한 덩이를 받는 호출 (모르미 발화) */
export async function callClaude(role: ClaudeRole, prompt: string): Promise<string> {
  const { model, effort, maxTokens } = CONFIG[role];
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(effort ? { output_config: { effort } } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  guard(message, role);
  return textOf(message);
}

/**
 * 스키마에 맞는 JSON을 받는 호출 (발화 분류).
 * 구조화 출력을 쓰면 응답이 스키마를 만족하도록 강제되므로,
 * 코드 펜스를 벗겨내거나 파싱 실패를 처리할 필요가 없다.
 */
export async function callClaudeJson<T>(
  role: ClaudeRole,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const { model, effort, maxTokens } = CONFIG[role];
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    output_config: {
      ...(effort ? { effort } : {}),
      format: { type: "json_schema", schema },
    },
    messages: [{ role: "user", content: prompt }],
  });
  guard(message, role);
  return JSON.parse(textOf(message)) as T;
}
