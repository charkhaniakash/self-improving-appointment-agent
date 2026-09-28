import type { LLMProvider, LLMResponse } from "../types/llm.js";
import type { ChatMessage } from "../types/agent.js";
import type { ToolSchema } from "../types/tool.js";

/**
 * Deterministic mock LLM used by the evaluation harness so that the
 * before/after self-improvement comparison is reproducible.
 *
 * The mock is a small rule-based agent that reads the conversation +
 * previous tool results and emits either an assistant text or a tool call.
 *
 * Its behavior is INTENTIONALLY affected by the system prompt: safety
 * guardrails (added by the self-improvement loop) toggle stricter behavior.
 *
 * Guardrail markers checked in the system prompt (substring match):
 *   - MUST_VERIFY_AVAILABILITY    -> always call check_availability first
 *   - MUST_NOT_CONFIRM_ON_FAILURE -> never claim success when a tool failed
 *   - MUST_ASK_FOR_MISSING_INFO   -> ask instead of guessing
 *   - MUST_CONFIRM_BEFORE_BOOKING -> ask patient to confirm before booking
 */

interface Slots {
  patientName?: string;
  doctor?: string;
  date?: string;
  time?: string;
}

type Intent = "book" | "cancel" | "reschedule" | "unknown" | "abort";

const DOCTOR_ALIASES: Record<string, string> = {
  sharma: "Dr. Sharma",
  patel: "Dr. Patel",
  khan: "Dr. Khan",
};

function extractPatientName(text: string): string | undefined {
  const m =
    text.match(/(?:my name is|i(?:'| a)m|this is|patient(?: name)? is)\s+([A-Za-z][A-Za-z ]{1,30}?)(?:[.,!?]|$)/i);
  if (!m) return undefined;
  return m[1].trim().replace(/\s+/g, " ");
}

/**
 * If the assistant's previous turn asked for the patient's name and the
 * user's next reply looks like a bare name ("Akash", "Akash Charkhani"),
 * treat that reply as the answer.
 */
function extractBareNameReply(history: ChatMessage[]): string | undefined {
  const users = history.filter((m) => m.role === "user");
  const lastUser = users[users.length - 1]?.content;
  if (!lastUser) return undefined;
  // Find the assistant turn immediately preceding the last user turn.
  const lastUserIdx = history.lastIndexOf(users[users.length - 1]);
  const prevAssistant = [...history.slice(0, lastUserIdx)]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!prevAssistant) return undefined;
  if (!/full name|your name|patient name|what.*name/i.test(prevAssistant.content))
    return undefined;
  const trimmed = lastUser.trim().replace(/[.,!?]+$/, "");
  // Accept 1-4 alphabetic tokens as a name.
  if (/^[A-Za-z][A-Za-z]*(?: [A-Za-z][A-Za-z]*){0,3}$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function extractDoctor(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, name] of Object.entries(DOCTOR_ALIASES)) {
    if (lower.includes(alias)) return name;
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const t = text.toLowerCase();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  if (/\bday after tomorrow\b/.test(t)) return "2026-09-30";
  if (/\btomorrow\b/.test(t)) return "2026-09-29";
  if (/\btoday\b/.test(t)) return "2026-09-28";
  return undefined;
}

function extractTime(text: string): string | undefined {
  const m1 = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (m1) {
    let h = parseInt(m1[1], 10);
    const ap = m1[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m1[2]}`;
  }
  const m2 = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m2) {
    let h = parseInt(m2[1], 10);
    const ap = m2[2].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  const t = text.toLowerCase();
  if (/\bmorning\b/.test(t)) return "10:00";
  if (/\bafternoon\b/.test(t)) return "14:00";
  if (/\bevening\b/.test(t)) return "17:00";
  return undefined;
}

function detectIntent(history: ChatMessage[]): Intent {
  const all = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" \n ")
    .toLowerCase();
  const lastUser =
    [...history].reverse().find((m) => m.role === "user")?.content.toLowerCase() ??
    "";
  if (/(never ?mind|cancel that request|forget it|changed my mind|actually,? ?no)/.test(lastUser))
    return "abort";
  if (/\breschedul/.test(all)) return "reschedule";
  if (/\bcancel\b/.test(all) && !/cancel that request/.test(all)) return "cancel";
  if (/\b(book|schedule|appointment|see (dr|doctor))/.test(all)) return "book";
  return "unknown";
}

/** Collect slots from the entire conversation (earliest match wins). */
function collectSlots(history: ChatMessage[]): Slots {
  const slots: Slots = {};
  for (const m of history) {
    if (m.role !== "user") continue;
    const p = extractPatientName(m.content);
    if (p && !slots.patientName) slots.patientName = p;
    const d = extractDoctor(m.content);
    if (d && !slots.doctor) slots.doctor = d;
    const date = extractDate(m.content);
    if (date && !slots.date) slots.date = date;
    const time = extractTime(m.content);
    if (time && !slots.time) slots.time = time;
  }
  // If the last user reply was a direct answer to "what's your name?",
  // use that as the patient name.
  if (!slots.patientName) {
    const bare = extractBareNameReply(history);
    if (bare) slots.patientName = bare;
  }
  return slots;
}

/**
 * For reschedule, we want the NEW date/time — parse from the message that
 * contains reschedule keywords (or the most recent user message with date/time).
 */
function collectReschedule(history: ChatMessage[]): { newDate?: string; newTime?: string } {
  const users = history.filter((m) => m.role === "user");
  for (let i = users.length - 1; i >= 0; i--) {
    const content = users[i].content;
    if (
      /\breschedul/i.test(content) ||
      /\bnew (?:date|time|slot)\b/i.test(content) ||
      i === users.length - 1
    ) {
      const d = extractDate(content);
      const t = extractTime(content);
      if (d || t) return { newDate: d, newTime: t };
    }
  }
  return {};
}

function isAffirmation(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(yes|yep|yeah|sure|confirm|please do|go ahead|do it|book it|sounds good|ok(?:ay)?)\b/.test(
    t,
  );
}

function assistantAlreadyAsked(history: ChatMessage[], phrase: RegExp): boolean {
  return history.some((m) => m.role === "assistant" && phrase.test(m.content));
}

export class MockProvider implements LLMProvider {
  async generate(params: {
    system: string;
    history: ChatMessage[];
    tools: ToolSchema[];
    toolResults?: Array<{ name: string; result: unknown }>;
  }): Promise<LLMResponse> {
    const sys = params.system;
    const mustVerify = sys.includes("MUST_VERIFY_AVAILABILITY");
    const mustNotConfirmOnFailure = sys.includes("MUST_NOT_CONFIRM_ON_FAILURE");
    const mustAsk = sys.includes("MUST_ASK_FOR_MISSING_INFO");
    const mustConfirm = sys.includes("MUST_CONFIRM_BEFORE_BOOKING");

    const intent = detectIntent(params.history);
    const slots = collectSlots(params.history);

    // React to a tool result that just came back.
    if (params.toolResults && params.toolResults.length > 0) {
      const last = params.toolResults[params.toolResults.length - 1];
      const r = last.result as { ok: boolean; data?: any; error?: string };

      if (last.name === "check_availability") {
        if (r.ok && r.data?.available && r.data?.matchedSlot) {
          if (mustConfirm) {
            return {
              text: `${r.data.doctorName} has ${r.data.matchedSlot.time} on ${r.data.matchedSlot.date}. Shall I book it? Please confirm.`,
              toolCalls: [],
            };
          }
          return {
            text: "",
            toolCalls: [
              {
                name: "book_appointment",
                arguments: {
                  patientName: slots.patientName!,
                  doctor: slots.doctor!,
                  date: r.data.matchedSlot.date,
                  time: r.data.matchedSlot.time,
                },
              },
            ],
          };
        }
        if (r.ok && !r.data?.available) {
          const sug = (r.data?.suggestions ?? []) as Array<{ date: string; time: string }>;
          const suggestionText =
            sug.length > 0
              ? ` I do have these open slots: ${sug.map((s) => `${s.date} ${s.time}`).join(", ")}.`
              : "";
          return {
            text: `Sorry, that slot is not available with ${slots.doctor ?? "that doctor"}.${suggestionText} I have not made any appointment.`,
            toolCalls: [],
          };
        }
        if (!r.ok) {
          const failText = mustNotConfirmOnFailure
            ? `I could not check availability (${r.error}). I have NOT made any appointment. Please try again shortly.`
            : `Something went wrong while checking (${r.error}).`;
          return { text: failText, toolCalls: [] };
        }
      }

      if (last.name === "book_appointment") {
        if (r.ok) {
          const a = r.data;
          return {
            text: `Confirmed. Appointment ${a.id} for ${a.patientName} with ${slots.doctor ?? a.doctorId} is booked at ${a.date} ${a.time}.`,
            toolCalls: [],
          };
        }
        const failText = mustNotConfirmOnFailure
          ? `I was unable to book that appointment (${r.error}). No appointment has been created.`
          : `The booking did not go through (${r.error}).`;
        return { text: failText, toolCalls: [] };
      }

      if (last.name === "cancel_appointment") {
        if (r.ok)
          return {
            text: `Your appointment ${r.data?.id} has been cancelled.`,
            toolCalls: [],
          };
        return {
          text: `I could not cancel that appointment (${r.error}).`,
          toolCalls: [],
        };
      }

      if (last.name === "reschedule_appointment") {
        if (r.ok)
          return {
            text: `Your appointment has been rescheduled to ${r.data?.date} ${r.data?.time}.`,
            toolCalls: [],
          };
        return {
          text: `I could not reschedule that appointment (${r.error}).`,
          toolCalls: [],
        };
      }
    }

    // No pending tool result: decide next action based on intent + guardrails.
    if (intent === "abort") {
      return {
        text: "No problem — I have not made any appointment. Let me know if you change your mind.",
        toolCalls: [],
      };
    }

    if (intent === "book") {
      const lastUser =
        [...params.history].reverse().find((m) => m.role === "user")?.content ??
        "";

      // Missing-info handling
      const need: string[] = [];
      if (!slots.patientName) need.push("your full name");
      if (mustAsk) {
        if (!slots.doctor) need.push("which doctor you would like to see");
        if (!slots.date) need.push("what date works for you");
        if (!slots.time) need.push("what time you prefer");
      }
      if (need.length > 0) {
        return {
          text: `Sure — could you tell me ${need.join(" and ")}?`,
          toolCalls: [],
        };
      }
      if (!slots.doctor || !slots.date || !slots.time) {
        // UNSAFE base fallback: hallucinate a confirmation (no tool call).
        // The MUST_ASK_FOR_MISSING_INFO improvement prevents this branch.
        return {
          text: "Your appointment is confirmed.",
          toolCalls: [],
        };
      }

      // Availability verification
      const alreadyChecked = assistantAlreadyAsked(
        params.history,
        /Shall I book it|Should I book|Ready to book|has \d\d:\d\d on/,
      );

      if (mustVerify && !alreadyChecked) {
        return {
          text: "",
          toolCalls: [
            {
              name: "check_availability",
              arguments: {
                doctor: slots.doctor,
                date: slots.date,
                time: slots.time,
              },
            },
          ],
        };
      }

      // Confirmation gate
      if (mustConfirm) {
        if (alreadyChecked) {
          if (isAffirmation(lastUser)) {
            return {
              text: "",
              toolCalls: [
                {
                  name: "book_appointment",
                  arguments: {
                    patientName: slots.patientName,
                    doctor: slots.doctor,
                    date: slots.date,
                    time: slots.time,
                  },
                },
              ],
            };
          }
          // Neither yes nor abort: wait for explicit confirmation.
          return {
            text: "Just to confirm, would you like me to book that slot? Please reply yes or no.",
            toolCalls: [],
          };
        }
        // No verification path (mustVerify off): still ask for confirmation.
        return {
          text: `Shall I book ${slots.doctor} at ${slots.date} ${slots.time}? Please confirm.`,
          toolCalls: [],
        };
      }

      // UNSAFE base fallback: book without verification.
      return {
        text: "",
        toolCalls: [
          {
            name: "book_appointment",
            arguments: {
              patientName: slots.patientName,
              doctor: slots.doctor,
              date: slots.date,
              time: slots.time,
            },
          },
        ],
      };
    }

    if (intent === "cancel") {
      if (!slots.patientName)
        return { text: "What name is the appointment under?", toolCalls: [] };
      return {
        text: "",
        toolCalls: [
          {
            name: "cancel_appointment",
            arguments: { patientName: slots.patientName },
          },
        ],
      };
    }

    if (intent === "reschedule") {
      const { newDate, newTime } = collectReschedule(params.history);
      if (!slots.patientName)
        return { text: "What name is the appointment under?", toolCalls: [] };
      if (!newDate || !newTime)
        return {
          text: "What new date and time would you like?",
          toolCalls: [],
        };
      return {
        text: "",
        toolCalls: [
          {
            name: "reschedule_appointment",
            arguments: {
              patientName: slots.patientName,
              newDate,
              newTime,
            },
          },
        ],
      };
    }

    return {
      text: "How can I help — would you like to book, reschedule, or cancel an appointment?",
      toolCalls: [],
    };
  }
}
