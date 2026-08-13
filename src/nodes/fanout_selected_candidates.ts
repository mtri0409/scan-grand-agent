import { GraphStateType, GrantCandidate } from "../state.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

export async function fanoutSelectedCandidatesNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const queue = state.selectedCandidateQueue ?? state.selectedCandidates ?? [];
  logStep("fanout_selected_candidates", "enter", { queue });
  if (queue.length === 0) {
    return {
      chatComplement: "Không có candidate nào được chọn để deep-scan.",
      messages: [AIMessage({ content: "Không có candidate nào được chọn. Kết thúc tại Excel A." })],
    };
  }

  // Map STT/tên → candidate.
  let chosen: GrantCandidate | undefined;
  let chosenIndex = -1;
  for (let i = 0; i < queue.length; i += 1) {
    const token = queue[i];
    const trimmed = token.trim();
    const byStt = state.candidates[Number(trimmed) - 1];
    if (byStt) {
      chosen = byStt;
      chosenIndex = i;
      break;
    }
    const byName = state.candidates.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (byName) {
      chosen = byName;
      chosenIndex = i;
      break;
    }
  }

  if (!chosen) {
    logStep("fanout_selected_candidates", "no valid selection", { queue });
    return {
      chatComplement: "Không xác định được candidate từ lựa chọn user.",
      messages: [AIMessage({ content: "Không xác định được candidate từ lựa chọn user." })],
      selectedCandidateQueue: [],
    };
  }

  const remaining = queue.slice(chosenIndex + 1);
  // Node này chuẩn bị candidate đầu tiên; phần còn lại sẽ được xử lý sau khi xong 1 vòng QA.
  logStep("fanout_selected_candidates", "resolved", {
    chosen: chosen.name,
    remaining,
  });
  return {
    currentGrant: chosen,
    selectedCandidateQueue: remaining,
    // Reset QA state cho từng candidate để retry counter không kế thừa giữa các candidate.
    qaRetryCount: 0,
    qaResult: undefined,
    chatComplement: `fanout_selected_candidates: ${queue.length} candidate(s) được chọn — bắt đầu với ${chosen.name}`,
    messages: [AIMessage({ content: `Deep-scan candidate: ${chosen.name}` })],
  };
}
