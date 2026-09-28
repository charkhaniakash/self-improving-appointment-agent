# Self-Improving Patient Appointment Agent

A small, end-to-end AI agent that lets a patient book / reschedule / cancel
appointments through multi-turn conversation, uses scoped tools, evaluates
itself against difficult scenarios, generates structured improvements for
detected failures, applies them to the agent's policy layer, re-runs the
same scenarios, and demonstrates a before/after score increase without
regressing previously passing scenarios.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18.17+** (required for Next.js 14)
- **npm** (comes with Node.js)
- **Gemini API Key** (optional - app works with Mock LLM if not provided)

### Step 1: Get a Gemini API Key (Optional but Recommended)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Get API Key"** or **"Create API Key"**
3. Copy the API key (starts with `AIza...`)

> **Note:** The app will work without an API key, but the chat will use a simple Mock LLM instead of Gemini. The evaluation system always uses the Mock LLM for reproducibility.

### Step 2: Set Up Environment Variables

**Create a `.env` file in the project root:**

```bash
cp .env.example .env
```

**Edit `.env` and add your Gemini API key:**

```bash
# Required for interactive chat (Gemini LLM)
GEMINI_API_KEY=your_actual_api_key_here

# Optional - defaults shown below
GEMINI_MODEL=gemini-2.0-flash-exp
BACKEND_PORT=4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

> ⚠️ **Important:** Replace `your_actual_api_key_here` with your real API key from Google AI Studio.

### Step 3: Install Dependencies

```bash
npm install
```

This installs all dependencies for both backend and frontend workspaces.

### Step 4: Run the Application

```bash
npm run dev
```

This starts:
- **Backend** on `http://localhost:4000`
- **Frontend** on `http://localhost:3000`

Open `http://localhost:3000` in your browser to use the app.

### Step 5: Run the Self-Improvement Evaluation (Optional)

To see the self-improvement loop in action via CLI:

```bash
npm run eval
```

This demonstrates the core feature: automatic testing, improvement generation, and before/after scoring.

---

## 📦 What Was Built

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

---

## 🏗️ Architecture

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

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend in development mode |
| `npm run eval` | Run the self-improvement evaluation loop (CLI) |
| `npm test` | Run all unit tests with Vitest |
| `npm run build` | Build both backend and frontend for production |

## 🧪 Testing the App

### Run All Tests

```bash
npm test
```

This runs the Vitest test suites:
- **tools.test.ts** - Tool validation, booking conflicts, cancellation, rescheduling
- **guardrails.test.ts** - Safety checks (no hallucinated bookings, forbidden tools)
- **evaluation.test.ts** - End-to-end self-improvement loop validation

## 💬 Using the Agent

Open `http://localhost:3000` in your browser.

### Left Panel - Chat Interface

Talk to the appointment booking agent. Try these examples:

**Example 1: Book an Appointment**
```
You: I'd like to see Dr. Sharma tomorrow at 10am. My name is Aisha Rao.
Bot: Dr. Sharma has an opening tomorrow, September 29th, at 10:00 AM. 
     Would you like to book this appointment?
You: Yes
Bot: Your appointment with Dr. Sharma on September 29th at 10:00 AM has been booked.
```

**Example 2: Cancel an Appointment**
```
You: Please cancel my appointment.
Bot: Your appointment has been cancelled.
```

**Example 3: Reschedule**
```
You: I need to reschedule to September 30th at 11am.
Bot: Your appointment has been rescheduled to September 30th at 11:00 AM.
```

Each assistant turn shows:
- The tool calls it made (e.g., `check_availability`, `book_appointment`)
- Whether each tool call succeeded (`ok` or `error`)
- The raw input/output data from each tool

### Right Panel - Evaluation & Self-Improvement

This panel is for **demonstrating** the self-improvement feature (not for regular users).

**Three Buttons:**

1. **"Run evaluation"** - Tests the agent with 10 scenarios and shows current score
2. **"Run self-improvement loop"** - The main demo feature:
   - Runs 10 test scenarios (BEFORE score)
   - Analyzes failures and generates improvement rules
   - Applies the rules to the agent's policy
   - Runs the same 10 scenarios again (AFTER score)
   - Shows improvement delta and regression check
3. **"Reset policy"** - Clears all improvements to restart the demo

**What You'll See:**
- **Before/After scores** with visual progress bars
- **Generated improvements** with rule IDs and descriptions
- **Scenario results** showing which tests passed/failed
- **Regression status** (ensures no previously passing tests broke)

---

## 📈 Scoring

Each scenario declares a set of criteria (required tool ordering, forbidden
tools, final application state, no-hallucinated-booking, must-contain /
must-not-contain in the final reply). A scenario passes only if **every**
criterion passes. Overall score is `passed / total`. The critical
`noHallucinatedBooking` check is deterministic and inspects the tool trace
directly — not the transcript alone.

---

## ⚙️ How Self-Improvement Works

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

## 🔧 Troubleshooting

### Issue: "Cannot find module" errors
**Solution:** Make sure you ran `npm install` from the project root.

### Issue: Port 4000 already in use
**Solution:** Either stop the process using port 4000, or change the port in `.env`:
```bash
BACKEND_PORT=4001
```

### Issue: Gemini API errors
**Solution:**
- Verify your API key is correct in `.env`
- Check you have API quota remaining at [Google AI Studio](https://aistudio.google.com/)
- The app will automatically fall back to Mock LLM if Gemini fails

### Issue: Frontend doesn't connect to backend
**Solution:** Make sure both are running:
```bash
# Check backend is running
curl http://localhost:4000/health
# Should return: {"ok":true}

# If not, restart:
npm run dev
```

---

## 📊 Example Before/After Result

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

---

## 🧪 Testing Instructions

`npm test` runs the Vitest suites in `backend/tests`:

- `tools.test.ts` — tool validation, double-booking rejection, cancel /
  reschedule, injected tool failures.
- `guardrails.test.ts` — the `RubricEvaluator`'s critical safety checks
  (hallucinated-booking detection, forbidden-tool tolerance for failed
  attempts).
- `evaluation.test.ts` — end-to-end loop: score improves, no regressions,
  every generated improvement is well-formed.

---

## 🎯 Design Decisions

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

---

## ⚠️ Limitations

- Appointment data is in-memory; server restart clears it.
- Improvements persist only in memory (a `PolicyRepository` implementation
  backed by a JSON file could swap in behind the same interface).
- The chat and eval loops share one appointment repository; the eval
  harness resets it between scenarios, but if you evaluate while chatting
  the chat state will also reset.
- The Gemini path is exercised by the interactive UI; the evaluation
  harness always uses `MockProvider` for reproducibility.
