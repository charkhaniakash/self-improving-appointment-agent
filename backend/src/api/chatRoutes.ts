import { Router } from "express";
import type { Container } from "../container.js";
import type { ChatMessage } from "../types/agent.js";

export function chatRoutes(c: Container): Router {
  const r = Router();

  r.post("/chat", async (req, res) => {
    const body = req.body as {
      message?: string;
      history?: ChatMessage[];
    };
    if (!body?.message) {
      res.status(400).json({ error: "message required" });
      return;
    }
    try {
      const result = await c.chatAgent.processTurn(
        body.message,
        body.history ?? [],
      );
      res.json({
        reply: result.reply,
        toolCalls: result.toolCalls,
        messages: result.messages,
      });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "chat failed",
      });
    }
  });

  r.get("/appointments", (_req, res) => {
    res.json({ appointments: c.appointmentRepo.list() });
  });

  r.post("/appointments/reset", (_req, res) => {
    c.appointmentRepo.reset();
    res.json({ ok: true });
  });

  return r;
}
