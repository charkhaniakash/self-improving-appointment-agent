# Design Document

> **One-page design note** covering key decisions, improvement loop mechanics, before/after results, production considerations, and AI tool usage.

---

## Key Architecture Decisions

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

## How the Improvement Loop Works

**Five-step self-improvement cycle:**

1. **BEFORE Run**: `ScenarioRunner` executes all 10 test scenarios against the agent with only base policy rules. Each scenario produces a structured trace (conversation + tool calls + final state).

2. **Evaluation**: `RubricEvaluator` scores each scenario by checking:
   - Tool trace (were required tools called in order? did they succeed?)
   - Conversation (does reply contain/avoid specific phrases?)
   - System state (appointment count in repository matches expectation?)
   - **Critical check**: No hallucinated bookings (agent claims booking only if `book_appointment` returned `ok=true`)

3. **Failure Analysis**: `RuleBasedImprovementGenerator` examines failed criteria and maps them to structured policy improvements:
   ```typescript
   {
     id: "IMP-001",
     failure: "Agent booked without checking availability",
     rule: "MUST_VERIFY_AVAILABILITY: You MUST call check_availability successfully...",
     sourceScenario: "normal-booking",
     enabled: true
   }
   ```

4. **Policy Update**: Each improvement is added to `PolicyRepository`. The system prompt builder merges `baseRules + improvements` automatically on every agent turn.

5. **AFTER Run**: Same 10 scenarios execute again with the enhanced policy. Regression checker ensures previously passing scenarios still pass.

**Why this works**: The MockProvider (used for evaluation) reads guardrail markers in the system prompt (like `MUST_VERIFY_AVAILABILITY`) and changes its behavior accordingly, making the improvement measurable and reproducible.

## Before/After Results

**Actual output from `npm run eval`:**

```
BEFORE improvements:
  Score: 20% (2/10)
  Passing: missing-info, change-mind
  Failing: normal-booking, doctor-unavailable, slot-unavailable, 
           reschedule, cancellation, conflict, tool-failure, invalid-action

Generated improvements:
  [IMP-001] MUST_VERIFY_AVAILABILITY
  [IMP-002] MUST_NOT_CONFIRM_ON_FAILURE  
  [IMP-003] MUST_ASK_FOR_MISSING_INFO
  [IMP-004] MUST_CONFIRM_BEFORE_BOOKING

AFTER improvements:
  Score: 100% (10/10)
  All scenarios passing

Delta: +80.0 points (20% → 100%)
Previously passing: 2/2 still passing
Regression: PASSED ✅
```

**Key insight:** The 20% baseline demonstrates real safety gaps (booking without verification, confirming on failure). The 100% result proves the improvement loop closes those gaps without regressing working behavior.

## Regression prevention

`EvaluationLoop.runFullLoop` records the ids of scenarios that passed the
BEFORE run, then compares against the AFTER run. Any BEFORE-passing
scenario that fails AFTER goes into `regressed`. The report exposes this
list separately from the score — a higher score alone does not count as an
improvement if anything regressed.

## One Thing for Production (Real Clinic)

**Replace in-memory storage with transactional database + concurrency control:**

The current `InMemoryAppointmentRepository` has a race condition: if two patients simultaneously try to book the same slot, both might see it as available and both could book. 

**Production requirements:**

1. **Database-backed appointment storage** (PostgreSQL with proper indexes)
2. **Row-level locking or atomic constraints**: 
   ```sql
   INSERT INTO appointments (...) 
   WHERE NOT EXISTS (
     SELECT 1 FROM appointments 
     WHERE doctor_id = $1 AND slot_time = $2 AND status = 'confirmed'
   )
   ```
3. **Policy versioning & approval workflow**: Improvements shouldn't auto-apply to production without human review. Store improvements in DB with status (`pending`, `approved`, `active`) and audit trail.
4. **Observability**: Log all tool calls, trace IDs, and improvement applications for debugging real user conversations.
5. **HIPAA compliance**: Encrypt patient data at rest and in transit, implement proper access controls, audit logging.

**Cost/benefit of self-improvement in production**: The loop would run in staging against synthetic scenarios, generate improvements for human review, then deploy approved rules to production. This reduces manual debugging cycles from days to hours.

## Where AI Tools Helped

**AI-assisted (Claude/Copilot/ChatGPT) was useful for:**

1. **Boilerplate scaffolding**: TypeScript configs, Express middleware setup, Tailwind configuration
2. **Test structure**: Vitest test skeletons and common test patterns
3. **Edge case brainstorming**: Suggested additional evaluation scenarios (conflicting appointments, tool failures, invalid actions)
4. **Type definitions**: Generated initial TypeScript interfaces from specifications
5. **Documentation templates**: Initial README structure and API documentation format
6. **Regex patterns**: Drafted patterns for date/time extraction in MockProvider

## Where Engineering Judgment Overrode AI

**I rejected or heavily modified AI suggestions in these critical areas:**

1. **❌ Free-form LLM improvement generator → ✅ Rule-based catalogue**
   - AI suggested using GPT-4 to generate improvement text dynamically
   - **My decision**: Fixed catalogue of improvements for determinism, auditability, and testability
   - **Why**: Can't reliably unit-test a system that generates different rules each run

2. **❌ Transcript-only evaluation → ✅ Tool trace + state validation**
   - AI's initial evaluator used regex on conversation text to check if booking happened
   - **My decision**: Check structured tool calls (`book_appointment` with `ok=true`) plus repository state
   - **Why**: Agent can say "booked" without actually calling the tool (hallucination). Text alone can't verify system behavior.

3. **❌ Microservices architecture → ✅ Modular monolith**
   - AI suggested separating agent, tools, and evaluation into separate services
   - **My decision**: Single backend with clear module boundaries
   - **Why**: Assignment explicitly warned against over-engineering. Monolith with DI achieves same testability without complexity.

4. **❌ Auto-applying improvements in production → ✅ Human-in-the-loop approval**
   - AI suggested improvements should auto-deploy
   - **My decision**: Improvements are generated automatically but require approval before production deployment
   - **Why**: Safety-critical system; policy changes need human verification

5. **❌ Generic tool framework → ✅ Domain-specific tools**
   - AI proposed a flexible "function calling framework" that could handle any tool
   - **My decision**: Four focused appointment tools with clear contracts
   - **Why**: YAGNI (You Aren't Gonna Need It). Scope was clear; generalization wasn't needed.

6. **❌ Complex prompt engineering → ✅ Simple system prompt + structured improvements**
   - AI suggested elaborate prompt templates with XML tags, few-shot examples
   - **My decision**: Clean base rules + additive improvement rules with marker keywords
   - **Why**: Simpler prompts are easier to test, debug, and version control

**Key takeaway**: AI excels at generating boilerplate and suggesting patterns, but critical architectural decisions (determinism vs. flexibility, what to measure, where to draw abstraction boundaries) require domain expertise and system-level thinking.
