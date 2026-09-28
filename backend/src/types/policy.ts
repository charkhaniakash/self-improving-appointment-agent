export interface Improvement {
  id: string;
  failure: string;
  rule: string;
  sourceScenario: string;
  enabled: boolean;
  createdAt: string;
}

export interface Policy {
  baseRules: string[];
  improvements: Improvement[];
}
