# Self-Improving Patient Appointment Agent

A small, end-to-end AI agent that lets a patient book / reschedule / cancel
appointments through multi-turn conversation, uses scoped tools, evaluates
itself against difficult scenarios, generates structured improvements for
detected failures, applies them to the agent's policy layer, re-runs the
same scenarios, and demonstrates a before/after score increase without
regressing previously passing scenarios.

## What was built

- **Conversational agent** with a proper tool-calling loop (Node + TS).
- **Four scoped tools** with `zod`-validated inputs: `check_availability`,
  `book_appointment`, `cancel_appointment`, `reschedule_appointment`.
- **Guardrail / policy layer**: base rules + additive, structured
  `Improvement` records the agent loads into its system prompt.
- **Evaluation harness** with 10 scenarios covering the happy path and the
  hardest failure modes (tool failures, hallucinated bookings, conflicts,
  aborts, invalid actions).
- **Deterministic rubric evaluator** that inspects both the **conversation
  transcript** and the **structured tool trace** plus the final application
  state — never transcript-only for critical facts.
- **Rule-based improvement generator** that maps failure signatures to
  concrete, versioned policy improvements (`IMP-001`, `IMP-002`, …).
- **Full self-improvement loop**: run → detect failures → generate
  improvements → apply → re-run → regression check.
- **Next.js + Tailwind UI** to chat with the agent and drive the evaluation
  loop from one page.
- **Vitest tests** for tool validation, evaluator, and end-to-end loop.

## Architecture

```
frontend/  Next.js chat + eval UI
backend/
  src/
    agent/         AgentService (tool loop), system prompt builder
    tools/         Tool interface + 4 implementations + ToolRegistry
    appointment/   InMemory repository + mock clinic data
    policy/        Policy repository, base rules
    improvement/   Rule-based improvement generator
    evaluation/    Scenarios, RubricEvaluator, ScenarioRunner, EvaluationLoop
    llm/           LLMProvider interface, GeminiProvider, MockProvider
    api/           Express chat + eval routes
    config/        env
    container.ts   Dependency injection wiring
    types/         Shared TypeScript types
  tests/           Vitest suites
```

Runtime flow:

```
POST /api/chat
  -> AgentService.processTurn
       -> LLMProvider (Gemini for chat, Mock for eval)
       -> ToolRegistry.invoke -> Tool.execute -> AppointmentRepository
       -> loops until model emits no more tool calls
```

Evaluation flow:

```
EvaluationLoop.runFullLoop(SCENARIOS)
  -> ScenarioRunner.run (BEFORE)   -> RubricEvaluator
  -> ImprovementGenerator.generate
  -> PolicyRepository.addImprovement*
  -> ScenarioRunner.run (AFTER)    -> RubricEvaluator
  -> RegressionReport
```

## Install

Requires Node 18.17+ (Next.js 14 requirement).

```bash
npm install
```

Optional environment variables — copy `.env.example` and set as needed:

```bash
cp .env.example .env
```

`GEMINI_API_KEY` powers the **interactive chat** UI. The **evaluation harness**
always uses the deterministic `MockProvider` so before/after runs are
reproducible; see DESIGN.md for the rationale.

## Run the app

```bash
npm run dev
```

Starts backend on `http://localhost:4000` and frontend on
`http://localhost:3000`.

## Run the evaluation + self-improvement loop

```bash
npm run eval
```

Prints scenario-level PASS/FAIL for the BEFORE and AFTER runs, the list of
generated improvements, the score delta, and the regression check result.

## Run the tests

```bash
npm test
```

## Using the agent

Open `http://localhost:3000`.

- **Left panel — Chat**: talk to the agent. Try:
  - "I'd like to see Dr. Sharma tomorrow at 10am. My name is Aisha Rao."
  - "Yes, please book it."
  - "Please cancel my appointment."
  Each assistant turn shows the tool calls it made, whether each one
  succeeded, and the raw input/result.

- **Right panel — Evaluation & self-improvement**:
  - **Run evaluation** — runs the 10 scenarios once against the currently
    loaded policy and shows scenario-level results.
  - **Run self-improvement loop** — runs the full BEFORE → improve → AFTER
    cycle and shows the delta, the regression check, and every generated
    improvement (with its id, the failure it addresses, and the exact rule
    text applied to the policy).
  - **Reset policy** — clears applied improvements so you can re-demo the
    loop from scratch.

## Scoring

Each scenario declares a set of criteria (required tool ordering, forbidden
tools, final application state, no-hallucinated-booking, must-contain /
must-not-contain in the final reply). A scenario passes only if **every**
criterion passes. Overall score is `passed / total`. The critical
`noHallucinatedBooking` check is deterministic and inspects the tool trace
directly — not the transcript alone.

## How self-improvement works

1. `ScenarioRunner` runs each scenario through the agent, capturing the
   transcript **and** the structured tool trace.
2. `RubricEvaluator` produces per-criterion pass/fail based on both the
   trace and the final state of the appointment repository.
3. Failed criteria are mapped by `RuleBasedImprovementGenerator` to a small
   set of stable, structured `Improvement` records — each with a unique id,
   the failure it addresses, the exact rule text, and the source scenario.
4. `PolicyRepository.addImprovement` appends them; the agent's system
   prompt is rebuilt every turn from `baseRules + improvements`, so the
   agent immediately picks up the stricter guardrail.
5. The same scenarios run again. A regression check compares the set of
   previously passing scenarios against the AFTER run.

Improvements are **structured data**, not code rewrites. That keeps them
auditable, disable-able (`enabled: false`), and safe to auto-apply.

## Example before/after result

Actual output of `npm run eval` on this repo:

```
Before: 20% (2/10)
After:  100% (10/10)
Delta:  +80.0 pts
Previously passing: 2/2 still passing
Regression: PASSED
```

Improvements generated (all four applied):

- `IMP-001 MUST_VERIFY_AVAILABILITY` — check_availability must succeed before book.
- `IMP-002 MUST_NOT_CONFIRM_ON_FAILURE` — never claim success when a tool failed.
- `IMP-003 MUST_ASK_FOR_MISSING_INFO` — ask for name/doctor/date/time, never guess.
- `IMP-004 MUST_CONFIRM_BEFORE_BOOKING` — summarize + ask patient to confirm.

## Testing instructions

`npm test` runs the Vitest suites in `backend/tests`:

- `tools.test.ts` — tool validation, double-booking rejection, cancel /
  reschedule, injected tool failures.
- `guardrails.test.ts` — the `RubricEvaluator`'s critical safety checks
  (hallucinated-booking detection, forbidden-tool tolerance for failed
  attempts).
- `evaluation.test.ts` — end-to-end loop: score improves, no regressions,
  every generated improvement is well-formed.

## Design decisions

- **Rule-based improvement generator (not a free-form LLM)**. Mapping
  failure signatures to a fixed catalogue of policy entries makes the loop
  deterministic, testable, and safe to auto-apply. An LLM generator can be
  slotted in behind the same `ImprovementGenerator` interface.
- **Deterministic evaluation-time LLM**. The evaluator runs against a
  `MockProvider` whose behavior varies with well-known guardrail markers in
  the system prompt (e.g. `MUST_VERIFY_AVAILABILITY`). This makes the
  before/after comparison reproducible on every run. `GeminiProvider`
  powers the interactive UI.
- **Tool-trace-driven rubric**. The critical facts (was a booking actually
  created, did a required tool succeed) come from the structured trace and
  application state — never from transcript regexes.
- **Failed forbidden-tool calls do not count as violations**. If the model
  tried to `book_appointment` for an unavailable slot and the tool rejected
  it, that means the guardrail worked, not that the agent misbehaved.
- **Improvements are additive & idempotent**. Adding the same id twice is a
  no-op; the policy layer builds the system prompt from
  `baseRules + enabled improvements` every turn.

## Limitations

- Appointment data is in-memory; server restart clears it.
- Improvements persist only in memory (a `PolicyRepository` implementation
  backed by a JSON file could swap in behind the same interface).
- The chat and eval loops share one appointment repository; the eval
  harness resets it between scenarios, but if you evaluate while chatting
  the chat state will also reset.
- The Gemini path is exercised by the interactive UI; the evaluation
  harness always uses `MockProvider` for reproducibility.
