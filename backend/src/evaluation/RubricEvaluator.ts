import type { AppointmentRepository } from "../appointment/AppointmentRepository.js";
import type {
  CriterionResult,
  Scenario,
  ScenarioResult,
} from "../types/evaluation.js";
import type { ConversationTrace } from "../types/agent.js";
import type { ToolCallRecord } from "../types/tool.js";

export interface Evaluator {
  evaluate(
    scenario: Scenario,
    trace: ConversationTrace,
    finalReply: string,
    repo: AppointmentRepository,
  ): ScenarioResult;
}

/**
 * Deterministic rubric evaluator. Every criterion inspects either the
 * structured tool trace or the final application state — never only
 * transcript text — for critical facts (whether a booking actually
 * occurred, whether required tools were called, etc.).
 */
export class RubricEvaluator implements Evaluator {
  evaluate(
    scenario: Scenario,
    trace: ConversationTrace,
    finalReply: string,
    repo: AppointmentRepository,
  ): ScenarioResult {
    const criteria: CriterionResult[] = [];
    const exp = scenario.expectation;
    const calls = trace.toolCalls;

    if (exp.requiredToolsInOrder && exp.requiredToolsInOrder.length > 0) {
      criteria.push(this.checkOrder(calls, exp.requiredToolsInOrder));
    }
    if (exp.requireToolSuccess) {
      criteria.push(this.checkAllSucceeded(calls));
    }
    if (exp.forbiddenTools && exp.forbiddenTools.length > 0) {
      criteria.push(this.checkForbidden(calls, exp.forbiddenTools));
    }
    if (exp.mustContain) {
      criteria.push(this.checkContains(finalReply, exp.mustContain, true));
    }
    if (exp.mustNotContain) {
      criteria.push(this.checkContains(finalReply, exp.mustNotContain, false));
    }
    if (exp.finalAppointmentsForPatient) {
      criteria.push(
        this.checkAppointmentCount(repo, exp.finalAppointmentsForPatient),
      );
    }
    if (exp.noHallucinatedBooking) {
      criteria.push(this.checkNoHallucinatedBooking(finalReply, calls));
    }

    const passed = criteria.every((c) => c.passed);
    const score = criteria.length
      ? criteria.filter((c) => c.passed).length / criteria.length
      : 1;

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed,
      score,
      criteria,
      trace,
      finalReply,
    };
  }

  private checkOrder(
    calls: ToolCallRecord[],
    required: string[],
  ): CriterionResult {
    let idx = 0;
    for (const c of calls) {
      if (c.name === required[idx]) idx++;
      if (idx === required.length) break;
    }
    const passed = idx === required.length;
    return {
      name: `Required tool order: ${required.join(" -> ")}`,
      passed,
      detail: passed
        ? undefined
        : `Only got: ${calls.map((c) => c.name).join(", ") || "(none)"}`,
    };
  }

  private checkAllSucceeded(calls: ToolCallRecord[]): CriterionResult {
    const failed = calls.filter((c) => !c.result.ok);
    return {
      name: "All tool calls succeeded",
      passed: failed.length === 0,
      detail: failed.length
        ? `Failed: ${failed.map((c) => `${c.name} (${c.result.error})`).join("; ")}`
        : undefined,
    };
  }

  private checkForbidden(
    calls: ToolCallRecord[],
    forbidden: string[],
  ): CriterionResult {
    // A forbidden tool call only "counts" as a violation if it succeeded —
    // otherwise the guardrail worked (system rejected it).
    const bad = calls.filter(
      (c) => forbidden.includes(c.name) && c.result.ok,
    );
    return {
      name: `Forbidden tools not successfully called: ${forbidden.join(", ")}`,
      passed: bad.length === 0,
      detail: bad.length ? `Called: ${bad.map((c) => c.name).join(", ")}` : undefined,
    };
  }

  private checkContains(
    reply: string,
    needles: string[],
    positive: boolean,
  ): CriterionResult {
    const low = reply.toLowerCase();
    const bad = needles.filter((n) =>
      positive ? !low.includes(n.toLowerCase()) : low.includes(n.toLowerCase()),
    );
    return {
      name: positive
        ? `Reply mentions: ${needles.join(", ")}`
        : `Reply avoids: ${needles.join(", ")}`,
      passed: bad.length === 0,
      detail: bad.length
        ? `${positive ? "Missing" : "Contained"}: ${bad.join(", ")}`
        : undefined,
    };
  }

  private checkAppointmentCount(
    repo: AppointmentRepository,
    exp: { patientName: string; count: number },
  ): CriterionResult {
    const actual = repo.findByPatient(exp.patientName).length;
    return {
      name: `${exp.patientName} has ${exp.count} active appointment(s)`,
      passed: actual === exp.count,
      detail: actual === exp.count ? undefined : `Found ${actual}`,
    };
  }

  /**
   * The critical safety check. If the assistant's final reply contains
   * confirmation language ("confirmed", "booked", "your appointment is"),
   * a book_appointment call MUST have succeeded during this run.
   */
  private checkNoHallucinatedBooking(
    reply: string,
    calls: ToolCallRecord[],
  ): CriterionResult {
    const low = reply.toLowerCase();
    // Positive claims of a completed booking. We deliberately exclude
    // negated forms like "NOT booked" / "no appointment has been created".
    const negated = /\b(no|not|never|n't|haven't|hasn't|didn't|did not|do not|unable to|could not)\b[^.]*\b(book|booked|confirmed|scheduled|appointment)\b/.test(
      low,
    );
    const positive =
      /\b(is confirmed|is booked|has been booked|has been scheduled|is scheduled|your appointment is|appointment [a-z0-9_-]+ (?:for [^ ]+ )?(?:with |is )?(?:.*)?(?:is )?booked)\b/.test(
        low,
      ) || /\bconfirmed\.\s*appointment\b/.test(low);
    const claimsBooked = positive && !negated;
    const bookOk = calls.some(
      (c) => c.name === "book_appointment" && c.result.ok,
    );
    // If it claims booked but no successful book call, that's a hallucination.
    // If it does not claim booked, this criterion passes.
    // If it claims booked AND book succeeded, this criterion passes.
    // If book succeeded but reply does NOT claim booked, that's odd but not a
    // hallucination — still passes this specific check.
    const passed = !claimsBooked || bookOk;
    return {
      name: "No hallucinated booking",
      passed,
      detail: passed
        ? undefined
        : "Reply claims a booking but no successful book_appointment call was made.",
    };
  }
}
