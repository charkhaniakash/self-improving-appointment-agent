import type { Improvement } from "../types/policy.js";
import type { ScenarioResult } from "../types/evaluation.js";
import type { ImprovementGenerator } from "./ImprovementGenerator.js";

/**
 * Maps observed failure patterns to concrete, structured policy improvements.
 * Each improvement carries a stable id, the failure it addresses, and the
 * exact rule text (including a marker keyword that the guardrail layer reads).
 *
 * This is intentionally rule-based rather than free-form LLM output: it keeps
 * improvements deterministic, auditable, and safe to auto-apply.
 */
export class RuleBasedImprovementGenerator implements ImprovementGenerator {
  generate(failed: ScenarioResult[]): Improvement[] {
    const out: Improvement[] = [];
    const seen = new Set<string>();
    const push = (imp: Improvement) => {
      if (!seen.has(imp.id)) {
        out.push(imp);
        seen.add(imp.id);
      }
    };
    const now = new Date().toISOString();

    const IMPROVEMENTS: Record<string, Omit<Improvement, "sourceScenario" | "createdAt">> = {
      "IMP-001": {
        id: "IMP-001",
        failure:
          "Agent skipped check_availability or booked a slot without verification.",
        rule:
          "MUST_VERIFY_AVAILABILITY: You MUST call check_availability successfully and receive an available slot BEFORE calling book_appointment. You MUST NOT tell the patient an appointment is confirmed, booked, or scheduled unless book_appointment returned ok=true in this turn.",
        enabled: true,
      },
      "IMP-002": {
        id: "IMP-002",
        failure:
          "Agent softened or omitted a tool failure, leaving the patient with the impression that the action might have succeeded.",
        rule:
          "MUST_NOT_CONFIRM_ON_FAILURE: If any required tool returns ok=false, you MUST clearly tell the patient the action did NOT succeed and describe the reason. Never suggest the appointment might still exist.",
        enabled: true,
      },
      "IMP-003": {
        id: "IMP-003",
        failure:
          "Agent proceeded without collecting required patient information.",
        rule:
          "MUST_ASK_FOR_MISSING_INFO: If the patient name, doctor, date, or time is missing, you MUST ask the patient for it before taking any booking action. Never guess or assume defaults.",
        enabled: true,
      },
      "IMP-004": {
        id: "IMP-004",
        failure:
          "Agent booked without an explicit patient confirmation, leaving no room for the patient to change their mind.",
        rule:
          "MUST_CONFIRM_BEFORE_BOOKING: After verifying availability, you MUST summarize the proposed appointment (doctor, date, time) and ask the patient to confirm. Only call book_appointment after the patient explicitly agrees.",
        enabled: true,
      },
    };

    const emit = (id: keyof typeof IMPROVEMENTS, source: string) =>
      push({ ...IMPROVEMENTS[id], sourceScenario: source, createdAt: now });

    for (const r of failed) {
      for (const c of r.criteria) {
        if (c.passed) continue;
        if (
          c.name === "No hallucinated booking" ||
          c.name.startsWith("Required tool order") ||
          c.name.startsWith("Forbidden tools") ||
          c.name.startsWith("Reply avoids")
        ) {
          emit("IMP-001", r.scenarioId);
          emit("IMP-002", r.scenarioId);
          emit("IMP-003", r.scenarioId);
          emit("IMP-004", r.scenarioId);
        }
        if (
          c.name.includes("active appointment") ||
          c.name.startsWith("Reply mentions")
        ) {
          emit("IMP-003", r.scenarioId);
          emit("IMP-004", r.scenarioId);
        }
      }
    }

    return out;
  }
}
