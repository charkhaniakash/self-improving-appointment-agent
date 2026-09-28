import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import type { AgentService } from "../agent/AgentService.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { Evaluator } from "./RubricEvaluator.js";
import type {
  EvaluationReport,
  Scenario,
  ScenarioResult,
} from "../types/evaluation.js";

export class ScenarioRunner {
  constructor(
    private readonly agent: AgentService,
    private readonly tools: ToolRegistry,
    private readonly repo: AppointmentRepository,
    private readonly evaluator: Evaluator,
  ) {}

  async run(scenarios: Scenario[]): Promise<EvaluationReport> {
    const results: ScenarioResult[] = [];
    for (const s of scenarios) {
      results.push(await this.runOne(s));
    }
    const passedCount = results.filter((r) => r.passed).length;
    const overallScore =
      results.reduce((sum, r) => sum + (r.passed ? 1 : 0), 0) /
      Math.max(results.length, 1);
    return {
      results,
      overallScore,
      passedCount,
      totalCount: results.length,
    };
  }

  async runOne(scenario: Scenario): Promise<ScenarioResult> {
    this.repo.reset();
    this.tools.clearFailures();

    if (scenario.setup) {
      await scenario.setup({
        seedAppointment: async (a) => {
          this.repo.create(a);
        },
      });
    }
    if (scenario.toolFailures) {
      this.tools.setFailures(scenario.toolFailures);
    }

    const trace = await this.agent.runConversation(
      scenario.turns.map((t) => t.patient),
    );

    const finalReply =
      [...trace.messages].reverse().find((m) => m.role === "assistant")
        ?.content ?? "";

    const result = this.evaluator.evaluate(
      scenario,
      trace,
      finalReply,
      this.repo,
    );

    this.tools.clearFailures();
    return result;
  }
}
