import type { ToolCallRecord } from "./tool.js";

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  messages: ChatMessage[];
}

export interface ConversationTrace {
  messages: ChatMessage[];
  toolCalls: ToolCallRecord[];
}
