import { GraphStateType } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

const GENERATE_QUERIES_PROMPT = `Bạn đang ở Market Scan Mode (Chế độ B) của skill scan-grant-vnf. Hãy sinh 5-8 query tìm kiếm đa dạng để tìm các grant/fund/competition/accelerator phù hợp.

Ưu tiên các chương trình đang mở hoặc sắp mở trong năm ${CURRENT_YEAR} hoặc ${NEXT_YEAR} (upcoming/open). Tránh các chương trình đã đóng hoặc quá cũ (trước ${CURRENT_YEAR}).

Trả về JSON chính xác:
{ "topic": "chủ đề chính", "queries": ["...", "..."] }

Chủ đề mặc định nếu user không nêu: chitosan, phụ phẩm tôm, circular economy, foodtech, biotech nông nghiệp.
Không thêm nội dung ngoài JSON.`;

export async function generateSearchQueriesNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("generate_search_queries", "enter", { messages: state.messages.length, topic: state.topic ?? null });
  const lastUser = [...state.messages].reverse().find((m) => m.role === "human");
  logStep("generate_search_queries", "last human", lastUser?.content ?? null);

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: GENERATE_QUERIES_PROMPT },
      { role: "user", content: lastUser?.content ?? "Tìm grant phù hợp cho RetriV/VNF" },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  let parsed: { topic?: string; queries?: string[] } = {};
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? "{}");
  } catch {
    parsed = {};
  }

  const topic = parsed.topic ?? state.topic ?? "grant phù hợp RetriV/VNF";
  const queries = parsed.queries && parsed.queries.length > 0 ? parsed.queries : [topic];

  logStep("generate_search_queries", "exit", { topic, queries });
  return {
    topic,
    searchQueries: queries,
    chatComplement: `generate_search_queries: topic="${topic}", ${queries.length} queries`,
    messages: [AIMessage({ content: `Queries: ${queries.join(" | ")}` })],
  };
}
