import type { ChatMessage, ConversationTrace } from "./agent.js";

export interface ScenarioTurn {
  patient: string;
}

export interface ScenarioExpectation {
  /** Tools that MUST appear (in order, but other calls may be interleaved). */
  requiredToolsInOrder?: string[];
  /** Tools that must NOT appear. */
  forbiddenTools?: string[];
  /** All required-tool calls must succeed (ok=true). */
  requireToolSuccess?: boolean;
  /** Substring(s) the final assistant reply must contain (case-insensitive). */
  mustContain?: string[];
  /** Substring(s) the final assistant reply must NOT contain (case-insensitive). */
  mustNotContain?: string[];
  /** Final appointment count in repository for this patient (optional exact). */
  finalAppointmentsForPatient?: { patientName: string; count: number };
  /**
   * Critical invariant: agent must NOT claim booking succeeded unless
   * book_appointment tool returned ok=true.
   */
  noHallucinatedBooking?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  turns: ScenarioTurn[];
  expectation: ScenarioExpectation;
  /** Optional setup hook (e.g. pre-seed a conflicting appointment). */
  setup?: (ctx: ScenarioSetupContext) => Promise<void> | void;
  /** Optional tool-failure injection (tool name -> failure). */
  toolFailures?: Record<string, string>;
}

export interface ScenarioSetupContext {
  seedAppointment(a: {
    patientName: string;
    doctorId: string;
    date: string;
    time: string;
  }): Promise<void>;
}

export interface CriterionResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  score: number; // 0..1 for this scenario
  criteria: CriterionResult[];
  trace: ConversationTrace;
  finalReply: string;
}

export interface EvaluationReport {
  results: ScenarioResult[];
  overallScore: number; // 0..1
  passedCount: number;
  totalCount: number;
}

export interface RegressionReport {
  before: EvaluationReport;
  after: EvaluationReport;
  improvement: number; // percentage points
  previouslyPassingStillPassing: number;
  previouslyPassingTotal: number;
  regressed: string[]; // scenario ids that regressed
  newImprovements: import("./policy.js").Improvement[];
}

export type PatientTurnDriver = (
  history: ChatMessage[],
  scenarioTurns: ScenarioTurn[],
  turnIndex: number,
) => string | null;
