import type { LLMProvider } from "../types/llm.js";
import type { PolicyRepository } from "../policy/PolicyRepository.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type {
  AgentTurnResult,
  ChatMessage,
  ConversationTrace,
} from "../types/agent.js";
import type { ToolCallRecord } from "../types/tool.js";
import { buildSystemPrompt } from "./systemPrompt.js";

export class AgentService {
  private readonly maxToolIterations = 6;

  constructor(
    private readonly llm: LLMProvider,
    private readonly tools: ToolRegistry,
    private readonly policyRepo: PolicyRepository,
  ) {}

  /**
   * Runs one patient message through the tool loop and returns the assistant
   * reply plus any tool call records for this turn.
   */
  async processTurn(
    userMessage: string,
    history: ChatMessage[],
  ): Promise<AgentTurnResult> {
    const system = buildSystemPrompt(this.policyRepo.getPolicy());
    const workingHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: userMessage },
    ];
    const toolCalls: ToolCallRecord[] = [];
    const toolSchemas = this.tools.list().map((t) => t.schema);
    let toolResults: Array<{ name: string; result: unknown }> | undefined;

    for (let i = 0; i < this.maxToolIterations; i++) {
      const resp = await this.llm.generate({
        system,
        history: workingHistory,
        tools: toolSchemas,
        toolResults,
      });

      if (resp.toolCalls.length === 0) {
        const reply = resp.text || "(no response)";
        workingHistory.push({ role: "assistant", content: reply });
        return { reply, toolCalls, messages: workingHistory };
      }

      toolResults = [];
      for (const call of resp.toolCalls) {
        const rec = await this.tools.invoke(call.name, call.arguments);
        toolCalls.push(rec);
        toolResults.push({ name: rec.name, result: rec.result });
      }
    }

    const reply =
      "I ran into a loop trying to help. Could you rephrase what you need?";
    workingHistory.push({ role: "assistant", content: reply });
    return { reply, toolCalls, messages: workingHistory };
  }

  /**
   * Runs a full multi-turn conversation from a script of patient messages,
   * returning the complete trace. Used by the evaluation harness.
   */
  async runConversation(patientTurns: string[]): Promise<ConversationTrace> {
    let history: ChatMessage[] = [];
    const allToolCalls: ToolCallRecord[] = [];
    for (const t of patientTurns) {
      const res = await this.processTurn(t, history);
      history = res.messages;
      allToolCalls.push(...res.toolCalls);
    }
    return { messages: history, toolCalls: allToolCalls };
  }
}
