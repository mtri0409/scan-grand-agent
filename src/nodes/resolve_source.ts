import { GraphStateType } from "../state.js";
import { HumanMessage } from "../messages.js";
import { interrupt } from "@langchain/langgraph";
import { logStep } from "../logger.js";

const SOURCE_QUESTION =
  "Bạn chỉ nêu tên chương trình. Bạn muốn tôi tự tìm website chính thức hay bạn sẽ gửi link cụ thể? (trả lời 'tự tìm' hoặc dán link)";

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function wantsAutoFind(text: string): boolean {
  if (extractFirstUrl(text)) return false;

  const normalized = text.toLowerCase().trim();
  const autoHints = [
    "tự tìm",
    "tự động",
    "tìm đi",
    "tìm giúp",
    "tìm hộ",
    "tìm luôn",
    "không có link",
    "chưa có link",
    "không",
    "no link",
    "auto",
    "find it",
    "tìm",
  ];
  return autoHints.some((h) => normalized.includes(h));
}

export async function resolveSourceNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("resolve_source", "enter", { currentGrant: state.currentGrant?.name ?? null, website: state.currentGrant?.website ?? null });
  const grant = state.currentGrant;
  if (grant?.website && grant.website.trim().startsWith("http")) {
    // User đã cung cấp link — không cần interrupt.
    logStep("resolve_source", "skip interrupt, website already present", grant.website);
    return {
      pendingHumanQuestion: null,
      messages: [],
    };
  }

  logStep("resolve_source", "invoking interrupt", SOURCE_QUESTION);
  const answer = interrupt({
    question: SOURCE_QUESTION,
  }) as string;

  logStep("resolve_source", "raw answer", answer);

  const website = extractFirstUrl(answer) ?? "";
  const autoFind = wantsAutoFind(answer);

  return {
    humanAnswer: answer,
    currentGrant: grant
      ? {
          ...grant,
          website,
          sourceNote: website
            ? "User cung cấp link"
            : autoFind
            ? "Claude tự tìm website chính thức"
            : "Cần Claude tìm website chính thức",
        }
      : undefined,
    messages: [HumanMessage(answer)],
  };
}
