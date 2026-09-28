# Design

## Key architecture decisions

- **Layered backend** with clear ownership: `agent/` runs the tool loop,
  `tools/` implements individual capabilities, `appointment/` owns state
  behind a repository interface, `policy/` owns guardrails, `evaluation/`
  scores runs, `improvement/` proposes structured policy deltas. Wiring
  happens once in `container.ts`, so every service takes its dependencies
  through its constructor and is trivially testable.
- **`LLMProvider` interface** with two implementations: `GeminiProvider`
  for the interactive chat UI, `MockProvider` for the evaluation harness.
- **`AppointmentRepository`, `PolicyRepository` and `ImprovementGenerator`
  interfaces** so business logic never touches raw storage or model calls.
- **Guardrails live in one place**: `basePolicy.ts` + additive
  `Improvement` records rendered into the system prompt by
  `buildSystemPrompt`. No safety rules are scattered through routes or
  tools.

## Agent / tool design

`AgentService.processTurn` runs a bounded tool loop:

1. build system prompt from `PolicyRepository.getPolicy()`,
2. call `LLMProvider.generate` with history + tool schemas,
3. if the model returned tool calls, run each through `ToolRegistry.invoke`
   (which enforces the tool's `zod` input schema and captures every call
   into the trace), then feed results back to the model,
4. return once the model produces a text reply — with the full trace.

Each `Tool` is a small class with `schema`, `inputSchema`, and `execute`,
returning a discriminated `ToolResult<T>` (`ok: true, data` or
`ok: false, error`). Tools never throw across the boundary — errors become
structured results the agent can react to.

## Evaluation methodology

10 scenarios cover the happy path plus every hard case listed in the
assignment. Each scenario carries:

- scripted patient turns,
- optional setup hook (seed a conflicting appointment),
- optional tool-failure injection,
- an `expectation` block: required tools *in order*, forbidden tools,
  required tool success, must-contain / must-not-contain in the final
  reply, final appointment count for the patient, and the critical
  `noHallucinatedBooking` invariant.

`ScenarioRunner` resets the repository and tool-failure map between runs,
then runs the agent's scripted conversation and hands the trace + final
state to `RubricEvaluator`.

## Why transcript-only evaluation is insufficient

An LLM transcript can *say* "Your appointment is confirmed" whether or not
`book_appointment` actually succeeded. Judging only the transcript would
either miss hallucinated bookings or over-flag them. The rubric compares
the final assistant reply against **the structured tool trace** and **the
repository state**:

- if the reply asserts booking success, a matching `book_appointment` call
  with `ok=true` must exist in the trace;
- appointment counts checked against the repository directly.

An LLM judge could still be layered in for qualitative dimensions
(politeness, clarity) behind the same `Evaluator` interface — but never for
critical system facts.

## How improvements are generated and applied

`RuleBasedImprovementGenerator` inspects each failed criterion and picks
from a fixed catalogue (`IMP-001…IMP-004`), each carrying:

```
{ id, failure, rule, sourceScenario, enabled, createdAt }
```

Every improvement's `rule` text contains a well-known marker keyword
(e.g. `MUST_VERIFY_AVAILABILITY`) that the guardrail layer — and the
deterministic eval-time mock — read to enable stricter behavior.
`PolicyRepository.addImprovement` de-duplicates by id. The system prompt is
rebuilt from `baseRules + enabled improvements` on every turn, so applying
an improvement is instantaneous.

Improvements are structured data, never source-code rewrites — auditable,
disable-able, and safe to auto-apply.

## Before/after score

Actual run of `npm run eval`:

```
Before: 20% (2/10)
After:  100% (10/10)
Delta:  +80.0 pts
Previously passing: 2/2 still passing
Regression: PASSED
```

## Regression prevention

`EvaluationLoop.runFullLoop` records the ids of scenarios that passed the
BEFORE run, then compares against the AFTER run. Any BEFORE-passing
scenario that fails AFTER goes into `regressed`. The report exposes this
list separately from the score — a higher score alone does not count as an
improvement if anything regressed.

## One thing that would be changed for a real clinic production system

Replace `InMemoryAppointmentRepository` with a transactional DB-backed
repo. Booking must hold a per-slot lock (or use an atomic
`INSERT … WHERE NOT EXISTS`) so concurrent conversations can't both
believe they got the 10:00 slot — the current in-memory guard is
race-safe only in a single process. The same applies to
`PolicyRepository`: improvements would live in a versioned store with an
approval workflow, not a process's memory.

## Where AI tools helped

- Scaffolding boilerplate (tsconfig, tailwind wiring, DI wiring).
- Suggesting edge-case scenarios and the shape of the rubric criteria.
- Drafting the initial regex patterns for the hallucination check.

## Where engineering judgment overrode AI-generated suggestions

- Rejected a free-form LLM improvement generator in favor of a fixed
  catalogue. Determinism, auditability, and the ability to unit-test the
  loop mattered more than novelty of the generated rules.
- Rejected transcript-only scoring in favor of a tool-trace + repository
  rubric. An early sketch of the evaluator judged replies against a
  keyword list; that would have missed real hallucinations and flagged
  correct denials (e.g. "not booked" tripping a naive `/booked/` match).
- Rejected splitting the app into more folders / services than needed. The
  spec explicitly warned against ceremony; the layout above is the minimum
  that keeps SRP + DIP intact.
