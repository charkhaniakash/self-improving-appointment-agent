import { env } from "./config/env.js";
import { InMemoryAppointmentRepository } from "./appointment/InMemoryAppointmentRepository.js";
import { InMemoryPolicyRepository } from "./policy/InMemoryPolicyRepository.js";
import { CheckAvailabilityTool } from "./tools/CheckAvailabilityTool.js";
import { BookAppointmentTool } from "./tools/BookAppointmentTool.js";
import { CancelAppointmentTool } from "./tools/CancelAppointmentTool.js";
import { RescheduleAppointmentTool } from "./tools/RescheduleAppointmentTool.js";
import { ToolRegistry } from "./tools/ToolRegistry.js";
import { GeminiProvider } from "./llm/GeminiProvider.js";
import { MockProvider } from "./llm/MockProvider.js";
import { AgentService } from "./agent/AgentService.js";
import { RubricEvaluator } from "./evaluation/RubricEvaluator.js";
import { ScenarioRunner } from "./evaluation/ScenarioRunner.js";
import { RuleBasedImprovementGenerator } from "./improvement/RuleBasedImprovementGenerator.js";
import { EvaluationLoop } from "./evaluation/EvaluationLoop.js";
import type { LLMProvider } from "./types/llm.js";

export interface Container {
  appointmentRepo: InMemoryAppointmentRepository;
  policyRepo: InMemoryPolicyRepository;
  toolRegistry: ToolRegistry;
  chatAgent: AgentService;
  evalAgent: AgentService;
  evaluationLoop: EvaluationLoop;
  scenarioRunner: ScenarioRunner;
}

/**
 * Wires all dependencies. The chat-time agent uses the real Gemini provider
 * (falling back to Mock if no API key is set); the evaluation-time agent
 * always uses the deterministic MockProvider so before/after comparisons
 * are reproducible.
 */
export function createContainer(): Container {
  const appointmentRepo = new InMemoryAppointmentRepository();
  const policyRepo = new InMemoryPolicyRepository();

  const tools = [
    new CheckAvailabilityTool(appointmentRepo),
    new BookAppointmentTool(appointmentRepo),
    new CancelAppointmentTool(appointmentRepo),
    new RescheduleAppointmentTool(appointmentRepo),
  ];
  const toolRegistry = new ToolRegistry(tools as never);

  const chatProvider: LLMProvider = env.geminiApiKey
    ? new GeminiProvider(env.geminiApiKey, env.geminiModel)
    : new MockProvider();

  const chatAgent = new AgentService(chatProvider, toolRegistry, policyRepo);

  // Separate registry for eval so injected failures never leak into chat.
  const evalTools = [
    new CheckAvailabilityTool(appointmentRepo),
    new BookAppointmentTool(appointmentRepo),
    new CancelAppointmentTool(appointmentRepo),
    new RescheduleAppointmentTool(appointmentRepo),
  ];
  const evalRegistry = new ToolRegistry(evalTools as never);
  const evalAgent = new AgentService(new MockProvider(), evalRegistry, policyRepo);

  const evaluator = new RubricEvaluator();
  const scenarioRunner = new ScenarioRunner(
    evalAgent,
    evalRegistry,
    appointmentRepo,
    evaluator,
  );
  const improver = new RuleBasedImprovementGenerator();
  const evaluationLoop = new EvaluationLoop(scenarioRunner, policyRepo, improver);

  return {
    appointmentRepo,
    policyRepo,
    toolRegistry,
    chatAgent,
    evalAgent,
    evaluationLoop,
    scenarioRunner,
  };
}
