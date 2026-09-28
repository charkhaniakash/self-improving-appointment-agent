import type { Improvement } from "../types/policy.js";
import type { ScenarioResult } from "../types/evaluation.js";

export interface ImprovementGenerator {
  generate(failed: ScenarioResult[]): Improvement[];
}
