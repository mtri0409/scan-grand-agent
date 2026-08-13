import { GraphStateType } from "../state.js";
import { HumanMessage } from "../messages.js";
import { interrupt } from "@langchain/langgraph";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { logStep } from "../logger.js";

type ParsedSelection = {
  selectedCandidates?: string[];
  reason?: string;
};

const SELECTION_QUESTION =
  "Bạn chọn candidate nào để deep-scan? Hãy trả lời tự nhiên theo ý bạn.";

function formatCandidates(state: GraphStateType): string {
  return state.candidates
    .map((c, idx) => `${idx + 1}. ${c.name} | ${c.sponsor || "N/A"} | ${c.funding || "N/A"} | ${c.deadline || "N/A"}`)
    .join("\n");
}

async function parseSelectionWithLLM(state: GraphStateType, answer: string): Promise<ParsedSelection> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Bạn là bộ phân tích lựa chọn candidate. Nhiệm vụ: đọc câu trả lời tự nhiên của user và danh sách candidate hiện có, rồi trả về JSON chính xác với selectedCandidates là mảng các STT hoặc tên candidate phù hợp nhất. Không ép user theo mẫu nhập. Nếu user từ chối chọn, trả selectedCandidates là []. Nếu không chắc, trả []. Chỉ trả JSON."
      },
      {
        role: "user",
        content: [
          `Câu trả lời user: ${answer}`,
          "",
          "Danh sách candidate:",
          formatCandidates(state),
          "",
          "Yêu cầu output JSON:",
          '{"selectedCandidates":["1","2"],"reason":"..."}',
        ].join("\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as ParsedSelection;
  } catch {
    return {};
  }
}

export async function waitForSelectionNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("wait_for_selection", "enter", {
    candidates: state.candidates.map((c, idx) => ({ stt: idx + 1, name: c.name })),
  });
  const answer = interrupt({
    question: SELECTION_QUESTION,
  }) as string;

  logStep("wait_for_selection", "raw answer", answer);
  const parsed = await parseSelectionWithLLM(state, answer);
  const selected = Array.isArray(parsed.selectedCandidates)
    ? parsed.selectedCandidates.map((s) => String(s).trim()).filter(Boolean)
    : [];
  logStep("wait_for_selection", "parsed", parsed);
  logStep("wait_for_selection", "selected", selected);

  return {
    humanAnswer: answer,
    selectedCandidates: selected,
    selectedCandidateQueue: selected,
    messages: [HumanMessage(answer)],
  };
}
