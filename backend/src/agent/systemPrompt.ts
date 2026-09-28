import type { Policy } from "../types/policy.js";
import { DOCTORS } from "../appointment/clinicData.js";

export function buildSystemPrompt(policy: Policy): string {
  const rules = policy.baseRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const improvements =
    policy.improvements.length === 0
      ? ""
      : `\n\nADDITIONAL SAFETY RULES (from self-improvement, MUST be followed):\n` +
        policy.improvements
          .map((imp, i) => `${i + 1}. [${imp.id}] ${imp.rule}`)
          .join("\n");

  const doctorList = DOCTORS.map(
    (d) => `- ${d.name} (${d.id}) — ${d.specialty}`,
  ).join("\n");

  return `You are the clinic appointment agent.

Base rules:
${rules}${improvements}

Known doctors:
${doctorList}

Today's date is 2026-09-28. Interpret "tomorrow" as 2026-09-29.

Always prefer calling a tool over guessing.`;
}
