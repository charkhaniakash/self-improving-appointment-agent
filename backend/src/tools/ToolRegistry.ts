import type { Tool, ToolCallRecord, ToolResult } from "../types/tool.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool<unknown, unknown>>();
  /** Optional failure injection for evaluation scenarios: name -> error string. */
  private failures: Record<string, string> = {};

  constructor(tools: Tool<unknown, unknown>[] = []) {
    for (const t of tools) this.register(t);
  }

  register(tool: Tool<unknown, unknown>): void {
    this.tools.set(tool.schema.name, tool);
  }

  get(name: string): Tool<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  list(): Tool<unknown, unknown>[] {
    return [...this.tools.values()];
  }

  setFailures(failures: Record<string, string>): void {
    this.failures = { ...failures };
  }

  clearFailures(): void {
    this.failures = {};
  }

  async invoke(name: string, args: unknown): Promise<ToolCallRecord> {
    const timestamp = new Date().toISOString();
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        name,
        input: args,
        result: { ok: false, error: `Unknown tool: ${name}` },
        timestamp,
      };
    }
    if (this.failures[name]) {
      return {
        name,
        input: args,
        result: { ok: false, error: this.failures[name] },
        timestamp,
      };
    }
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        name,
        input: args,
        result: {
          ok: false,
          error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        },
        timestamp,
      };
    }
    let result: ToolResult;
    try {
      result = await tool.execute(parsed.data);
    } catch (e) {
      result = {
        ok: false,
        error: e instanceof Error ? e.message : "Tool execution failed",
      };
    }
    return { name, input: parsed.data, result, timestamp };
  }
}
