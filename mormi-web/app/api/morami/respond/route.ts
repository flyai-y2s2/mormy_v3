type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
type MoramiEvent = "session_start" | "drill_correct" | "drill_retry" | "teach_prompt" | "teach_correct" | "teach_retry" | "homework_correct" | "session_complete";

type TurnRequest = {
  sessionId?: string;
  event?: MoramiEvent;
  ladderLevel?: number;
  misconception?: string;
  learnedLine?: string;
  fallbackDialogue?: string;
};

type TurnResponse = {
  dialogue: string;
  expression: Expression;
  source: "openai" | "mock";
};

const allowedExpressions = new Set<Expression>(["calm", "happy", "confused", "surprised", "bright", "celebrate"]);

function mockTurn(input: TurnRequest): TurnResponse {
  const learned = input.learnedLine || "차근차근 생각하면 되는구나!";
  const turns: Record<MoramiEvent, Omit<TurnResponse, "source">> = {
    session_start: { dialogue: input.fallbackDialogue || "새로운 문제구나! 무엇부터 보면 좋을까?", expression: "surprised" },
    drill_correct: { dialogue: input.fallbackDialogue || "아하, 차근차근 생각하면 되는구나!", expression: "happy" },
    drill_retry: { dialogue: input.fallbackDialogue || "어디부터 다시 살펴보면 좋을까?", expression: "confused" },
    teach_prompt: { dialogue: input.fallbackDialogue || "내가 조금 헷갈렸어. 지우가 고쳐 줄래?", expression: "confused" },
    teach_correct: { dialogue: `아, 그렇구나! ${learned}`, expression: "happy" },
    teach_retry: { dialogue: input.fallbackDialogue || "거의 알 것 같아. 한 단계 더 쉽게 알려 줄래?", expression: "confused" },
    homework_correct: { dialogue: "우와, 숫자가 바뀌어도 찾아냈네! 덕분에 숙제 끝!", expression: "celebrate" },
    session_complete: { dialogue: "오늘도 나를 가르쳐 줘서 고마워!", expression: "celebrate" },
  };
  return { ...(turns[input.event || "session_start"]), source: "mock" };
}

function outputText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const response = data as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return null;
}

export async function POST(request: Request) {
  let input: TurnRequest;
  try {
    input = await request.json() as TurnRequest;
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const fallback = mockTurn(input);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json(fallback);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
        instructions: [
          "너는 초등 저학년 아이에게 배우는 캐릭터 모르미다.",
          "아이를 채점하거나 평가하지 말고, 아이가 너를 가르쳤다는 느낌을 준다.",
          "한국어 한두 문장, 45자 이내로 말한다. 이모지와 O/X와 부정적인 표현은 쓰지 않는다.",
          "expression은 calm, happy, confused, surprised, bright, celebrate 중 하나만 쓴다.",
        ].join(" "),
        input: JSON.stringify(input),
        text: {
          format: {
            type: "json_schema",
            name: "morami_turn",
            strict: true,
            schema: {
              type: "object",
              properties: {
                dialogue: { type: "string" },
                expression: { type: "string", enum: ["calm", "happy", "confused", "surprised", "bright", "celebrate"] },
              },
              required: ["dialogue", "expression"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) return Response.json(fallback);
    const parsed = JSON.parse(outputText(await response.json()) || "null") as { dialogue?: string; expression?: Expression } | null;
    if (!parsed?.dialogue || !parsed.expression || !allowedExpressions.has(parsed.expression)) return Response.json(fallback);
    return Response.json({ dialogue: parsed.dialogue.slice(0, 90), expression: parsed.expression, source: "openai" } satisfies TurnResponse);
  } catch {
    return Response.json(fallback);
  }
}
