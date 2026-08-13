import { GraphStateType } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage } from "../messages.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { generateRunTimestamp } from "../utils.js";
import { logStep } from "../logger.js";

const CLASSIFY_PROMPT = `Bạn là router cho skill scan-grant-vnf. Phân loại ý định của user vào 1 trong 3 loại:
- A: user đã nêu TÊN hoặc LINK một chương trình tài trợ / grant / competition / accelerator cụ thể.
- B: user chưa có tên grant cụ thể, muốn quét thị trường / tìm grant theo chủ đề/lĩnh vực/khu vực.
- unclear: input mơ hồ, không có tên/link/chủ đề rõ ràng.

Nếu mode là A, trích xuất thêm tên chương trình và URL (chỉ nếu user thực sự cung cấp link trong input; nếu chỉ nêu tên thì để null).
Nếu mode là B, trích xuất chủ đề tìm kiếm.

Trả về JSON chính xác:
{
  "mode": "A" | "B" | "unclear",
  "reason": "...",
  "grantName": "tên chương trình (nếu mode A)",
  "grantUrl": "https://... hoặc null (nếu mode A)",
  "topic": "chủ đề tìm kiếm (nếu mode B)"
}
Không thêm nội dung ngoài JSON.`;

function toOpenAIMessages(messages: any[]): ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: m.role === "human" ? "user" : m.role === "ai" ? "assistant" : m.role,
    content: m.content ?? "",
  })) as ChatCompletionMessageParam[];
}

function isUrlProvidedByUser(url: string | null | undefined, userContent: string): boolean {
  if (!url || !url.trim().startsWith("http")) return false;
  return userContent.includes(url.trim());
}

export async function classifyModeNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("classify_mode", "enter", { messages: state.messages.length });
  const lastUser = [...state.messages].reverse().find((m) => m.role === "human");
  if (!lastUser) {
    logStep("classify_mode", "no human message");
    return {
      mode: "unclear",
      chatComplement: "Không tìm thấy yêu cầu user để phân loại chế độ.",
    };
  }

  logStep("classify_mode", "analyze last human", lastUser.content);

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: CLASSIFY_PROMPT },
      { role: "user", content: lastUser.content },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  let parsed: { mode?: string; reason?: string; grantName?: string; grantUrl?: string | null; topic?: string } = {};
  try {
    const text = response.choices[0].message.content ?? "{}";
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  const mode = ["A", "B", "unclear"].includes(parsed.mode ?? "")
    ? (parsed.mode as "A" | "B" | "unclear")
    : "unclear";

  const updates: Partial<GraphStateType> = {
    mode,
    runTimestamp: generateRunTimestamp(),
    chatComplement: `classify_mode: ${mode} — ${parsed.reason ?? "không có lý do"}`,
    messages: [AIMessage({ content: `classify_mode: ${mode}` })],
  };

  if (mode === "A") {
    const providedUrl = isUrlProvidedByUser(parsed.grantUrl, lastUser.content) ? parsed.grantUrl : "";
    updates.currentGrant = {
      name: parsed.grantName ?? lastUser.content,
      sponsor: "",
      field: "",
      funding: "",
      deadline: "",
      geography: "",
      website: providedUrl ?? "",
      sourceNote: providedUrl ? "User cung cấp link" : "Chỉ nêu tên",
    };
  }

  if (mode === "B") {
    updates.topic = parsed.topic ?? lastUser.content;
  }

  logStep("classify_mode", "exit", { mode, topic: updates.topic ?? undefined, grant: updates.currentGrant?.name ?? undefined });

  return updates;
}
