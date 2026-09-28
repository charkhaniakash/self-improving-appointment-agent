import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { createContainer } from "./container.js";
import { chatRoutes } from "./api/chatRoutes.js";
import { evalRoutes } from "./api/evalRoutes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const container = createContainer();

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", chatRoutes(container));
app.use("/api", evalRoutes(container));

app.listen(env.port, () => {
  const provider = env.geminiApiKey ? "Gemini" : "Mock (no GEMINI_API_KEY set)";
  console.log(
    `[backend] listening on http://localhost:${env.port} (chat LLM: ${provider})`,
  );
});
