import { GraphStateType } from "../state.js";
import { openai, DEFAULT_MODEL } from "../llm.js";
import { AIMessage, ToolMessage, isAIMessage, type BaseMessage, type ToolCall, SystemMessage } from "../messages.js";
import { toolNode } from "./tools.js";
import { buildSystemPrompt } from "./instructions.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

function toOpenAIMessages(messages: BaseMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === "system") return { role: "system", content: m.content };
    if (m.role === "human") return { role: "user", content: m.content };
    if (m.role === "ai") {
      const toolCalls =
        m.tool_calls?.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        })) ?? [];
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: toolCalls,
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.tool_call_id ?? "",
      };
    }
    return { role: "user", content: m.content };
  });
}

function ensureSystemMessage(messages: BaseMessage[]): BaseMessage[] {
  const systemPrompt = buildSystemPrompt();
  if (messages.length > 0 && messages[0].role === "system") {
    if (messages[0].content === systemPrompt) {
      return messages;
    }
    return [SystemMessage(systemPrompt), ...messages.slice(1)];
  }
  return [SystemMessage(systemPrompt), ...messages];
}

export async function agentNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const messages = ensureSystemMessage(state.messages);
  const tools: ChatCompletionTool[] = toolNode.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: toOpenAIMessages(messages),
    tools,
    tool_choice: "auto",
    temperature: 0,
  });

  const choice = response.choices[0];
  const message = choice.message;

  const toolCalls: ToolCall[] =
    message.tool_calls
      ?.filter((tc): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        type: "tool_call",
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })) ?? [];

  const aiMessage = AIMessage({
    content: message.content ?? "",
    tool_calls: toolCalls,
  });

  return { messages: [aiMessage] };
}
