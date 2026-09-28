import { describe, it, expect } from "vitest";
import { createContainer } from "../src/container.js";
import { SCENARIOS } from "../src/evaluation/scenarios/index.js";

describe("Self-improvement loop", () => {
  it(
    "improves overall score and does not regress previously passing scenarios",
    async () => {
      const c = createContainer();
      const report = await c.evaluationLoop.runFullLoop(SCENARIOS);

      expect(report.after.overallScore).toBeGreaterThan(
        report.before.overallScore,
      );
      expect(report.regressed).toEqual([]);
      expect(report.previouslyPassingStillPassing).toBe(
        report.previouslyPassingTotal,
      );
      expect(report.newImprovements.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it("detects at least one failure on the base (pre-improvement) run", async () => {
    const c = createContainer();
    c.policyRepo.clearImprovements();
    const before = await c.scenarioRunner.run(SCENARIOS);
    expect(before.results.some((r) => !r.passed)).toBe(true);
  });

  it("generated improvements are structured and stable", async () => {
    const c = createContainer();
    const report = await c.evaluationLoop.runFullLoop(SCENARIOS);
    for (const imp of report.newImprovements) {
      expect(imp.id).toMatch(/^IMP-\d+$/);
      expect(imp.rule.length).toBeGreaterThan(10);
      expect(imp.sourceScenario).toBeTruthy();
      expect(imp.enabled).toBe(true);
    }
  });
});
