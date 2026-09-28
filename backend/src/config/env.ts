import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from backend/ first (if present), then fall back to the repo root
// so `npm run dev -w backend` picks up the top-level .env you probably created.
for (const p of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

export const env = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  port: Number(process.env.BACKEND_PORT ?? 4000),
};
