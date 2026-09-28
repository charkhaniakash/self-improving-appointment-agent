import { z } from "zod";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema for LLM
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface Tool<I = unknown, O = unknown> {
  readonly schema: ToolSchema;
  readonly inputSchema: z.ZodType<I>;
  execute(input: I): Promise<ToolResult<O>>;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: ToolResult;
  timestamp: string;
}
