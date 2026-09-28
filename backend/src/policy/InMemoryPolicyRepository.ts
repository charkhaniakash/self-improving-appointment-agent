import type { PolicyRepository } from "./PolicyRepository.js";
import type { Improvement, Policy } from "../types/policy.js";
import { BASE_RULES } from "./basePolicy.js";

export class InMemoryPolicyRepository implements PolicyRepository {
  private improvements: Improvement[] = [];

  getPolicy(): Policy {
    return {
      baseRules: [...BASE_RULES],
      improvements: this.improvements.filter((i) => i.enabled),
    };
  }

  addImprovement(imp: Improvement): void {
    if (this.improvements.some((i) => i.id === imp.id)) return;
    this.improvements.push(imp);
  }

  removeImprovement(id: string): void {
    this.improvements = this.improvements.filter((i) => i.id !== id);
  }

  clearImprovements(): void {
    this.improvements = [];
  }

  listImprovements(): Improvement[] {
    return [...this.improvements];
  }
}
