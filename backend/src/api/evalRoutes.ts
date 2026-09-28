import { Router } from "express";
import type { Container } from "../container.js";
import { SCENARIOS } from "../evaluation/scenarios/index.js";

export function evalRoutes(c: Container): Router {
  const r = Router();

  r.get("/scenarios", (_req, res) => {
    res.json({
      scenarios: SCENARIOS.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    });
  });

  r.post("/evaluate", async (_req, res) => {
    try {
      const report = await c.evaluationLoop.runOnce(SCENARIOS);
      res.json({ report, policy: c.policyRepo.getPolicy() });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "eval failed",
      });
    }
  });

  r.post("/self-improve", async (_req, res) => {
    try {
      const report = await c.evaluationLoop.runFullLoop(SCENARIOS);
      res.json({ report, policy: c.policyRepo.getPolicy() });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "self-improve failed",
      });
    }
  });

  r.get("/policy", (_req, res) => {
    res.json(c.policyRepo.getPolicy());
  });

  r.post("/policy/reset", (_req, res) => {
    c.policyRepo.clearImprovements();
    res.json({ ok: true, policy: c.policyRepo.getPolicy() });
  });

  return r;
}
