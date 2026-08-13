import { GraphStateType } from "../state.js";
import { AIMessage, HumanMessage } from "../messages.js";
import { interrupt } from "@langchain/langgraph";
import { logStep } from "../logger.js";

const CLARIFY_QUESTION =
  "Bạn đã có tên/link grant cụ thể muốn scan, hay muốn mình tìm giúp các grant đang có trên thị trường theo một chủ đề nào đó?";

export async function askModeClarifyNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  logStep("ask_mode_clarify", "enter", { messages: state.messages.length });
  logStep("ask_mode_clarify", "invoking interrupt", CLARIFY_QUESTION);
  const answer = interrupt({
    question: CLARIFY_QUESTION,
  }) as string;

  logStep("ask_mode_clarify", "raw answer", answer);

  return {
    humanAnswer: answer,
    messages: [HumanMessage(answer)],
  };
}
