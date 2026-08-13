export interface BaseMessage {
  role: "system" | "human" | "ai" | "tool";
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "tool_call";
  name: string;
  args: Record<string, unknown>;
}

export function SystemMessage(content: string): BaseMessage {
  return { role: "system", content };
}

export function HumanMessage(content: string): BaseMessage {
  return { role: "human", content };
}

export function AIMessage(fields: { content: string; tool_calls?: ToolCall[] }): BaseMessage {
  return { role: "ai", content: fields.content, tool_calls: fields.tool_calls };
}

export function ToolMessage(fields: { content: string; tool_call_id: string; name?: string }): BaseMessage {
  return { role: "tool", content: fields.content, tool_call_id: fields.tool_call_id, name: fields.name };
}

export function isAIMessage(message: BaseMessage): boolean {
  return message.role === "ai";
}

export function getMessageType(message: BaseMessage): string {
  return message.role;
}
