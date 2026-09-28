import type { ScenarioRunner } from "./ScenarioRunner.js";
import type { PolicyRepository } from "../policy/PolicyRepository.js";
import type { ImprovementGenerator } from "../improvement/ImprovementGenerator.js";
import type {
  EvaluationReport,
  RegressionReport,
  Scenario,
} from "../types/evaluation.js";

export class EvaluationLoop {
  constructor(
    private readonly runner: ScenarioRunner,
    private readonly policyRepo: PolicyRepository,
    private readonly improver: ImprovementGenerator,
  ) {}

  /**
   * Run scenarios once, detect failures, generate improvements, apply them,
   * re-run scenarios, and compute a regression report.
   */
  async runFullLoop(scenarios: Scenario[]): Promise<RegressionReport> {
    // Reset policy so the "before" run is reproducible.
    this.policyRepo.clearImprovements();

    const before = await this.runner.run(scenarios);
    const failed = before.results.filter((r) => !r.passed);
    const newImprovements = this.improver.generate(failed);
    for (const imp of newImprovements) this.policyRepo.addImprovement(imp);

    const after = await this.runner.run(scenarios);

    const previouslyPassing = before.results
      .filter((r) => r.passed)
      .map((r) => r.scenarioId);
    const afterById = new Map(after.results.map((r) => [r.scenarioId, r]));
    const regressed = previouslyPassing.filter(
      (id) => !afterById.get(id)?.passed,
    );
    const previouslyPassingStillPassing =
      previouslyPassing.length - regressed.length;

    return {
      before,
      after,
      improvement: (after.overallScore - before.overallScore) * 100,
      previouslyPassingStillPassing,
      previouslyPassingTotal: previouslyPassing.length,
      regressed,
      newImprovements,
    };
  }

  /** Convenience: just run scenarios once with whatever policy is loaded. */
  async runOnce(scenarios: Scenario[]): Promise<EvaluationReport> {
    return this.runner.run(scenarios);
  }
}
