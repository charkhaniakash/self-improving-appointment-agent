import type { Improvement, Policy } from "../types/policy.js";

export interface PolicyRepository {
  getPolicy(): Policy;
  addImprovement(imp: Improvement): void;
  removeImprovement(id: string): void;
  clearImprovements(): void;
  listImprovements(): Improvement[];
}
