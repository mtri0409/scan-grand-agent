import { GraphStateType } from "../state.js";
import { AIMessage } from "../messages.js";
import { logStep } from "../logger.js";

/**
 * Node xử lý khi vượt quá max QA retry hoặc gặp lỗi không tự sửa được.
 */
export async function reportErrorNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("report_error", "enter", { retries: state.qaRetryCount, errors: state.qaResult?.errors ?? [] });
  return {
    chatComplement: `Báo cáo lỗi: QA không pass sau ${state.qaRetryCount} lần thử. Lỗi: ${state.qaResult?.errors.join("; ") ?? "không rõ"}`,
    messages: [AIMessage({ content: "Lỗi QA — cần can thiệp thủ công." })],
  };
}
