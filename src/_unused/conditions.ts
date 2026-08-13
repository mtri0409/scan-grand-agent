import { GraphStateType } from "../state.js";

export function shouldContinue(state: GraphStateType): "tools" | "__end__" {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "ai") return "__end__";
  if (Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  return "__end__";
}
