import type { ChatMessage } from "./agent.js";
import type { ToolSchema } from "./tool.js";

export interface LLMToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  /** Assistant text (may be empty if only calling tools). */
  text: string;
  /** Tool calls the model asked to execute. */
  toolCalls: LLMToolCall[];
}

export interface LLMProvider {
  generate(params: {
    system: string;
    history: ChatMessage[];
    tools: ToolSchema[];
    toolResults?: Array<{ name: string; result: unknown }>;
  }): Promise<LLMResponse>;
}
