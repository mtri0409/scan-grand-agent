import { TOOL_DEFINITIONS } from "./definitions.js";
import { ToolMessage, type BaseMessage } from "../messages.js";
import { GraphStateType } from "../state.js";

async function executeTools(state: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }> {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "ai" || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return { messages: [] };
  }

  const toolMessages: BaseMessage[] = [];
  for (const call of lastMessage.tool_calls) {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === call.name);
    if (!tool) {
      toolMessages.push(
        ToolMessage({
          content: `Không tìm thấy tool: ${call.name}`,
          tool_call_id: call.id,
          name: call.name,
        })
      );
      continue;
    }
    try {
      const result = await tool.invoke(call.args);
      toolMessages.push(
        ToolMessage({
          content: String(result),
          tool_call_id: call.id,
          name: call.name,
        })
      );
    } catch (err: any) {
      toolMessages.push(
        ToolMessage({
          content: `Lỗi khi gọi tool ${call.name}: ${err?.message || String(err)}`,
          tool_call_id: call.id,
          name: call.name,
        })
      );
    }
  }

  return { messages: toolMessages };
}

export async function toolsNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  return executeTools(state);
}

export const toolNode = { tools: TOOL_DEFINITIONS };
export type ToolNodeType = typeof toolNode;
