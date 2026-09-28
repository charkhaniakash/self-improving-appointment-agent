const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: { ok: boolean; data?: unknown; error?: string };
  timestamp: string;
}

export interface ChatResponse {
  reply: string;
  toolCalls: ToolCallRecord[];
  messages: ChatMessage[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  chat: (message: string, history: ChatMessage[]) =>
    post<ChatResponse>("/api/chat", { message, history }),
  appointments: () => get<{ appointments: unknown[] }>("/api/appointments"),
  resetAppointments: () => post<{ ok: boolean }>("/api/appointments/reset", {}),
  evaluate: () => post<any>("/api/evaluate", {}),
  selfImprove: () => post<any>("/api/self-improve", {}),
  policy: () => get<any>("/api/policy"),
  resetPolicy: () => post<any>("/api/policy/reset", {}),
};
