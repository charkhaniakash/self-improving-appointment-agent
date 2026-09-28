"use client";

import { useState } from "react";
import { api, type ChatMessage, type ToolCallRecord } from "../lib/api";

interface Bubble {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
}

export function Chat() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim() || loading) return;
    const message = input;
    setInput("");
    setBubbles((b) => [...b, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await api.chat(message, history);
      setHistory(res.messages);
      setBubbles((b) => [
        ...b,
        { role: "assistant", content: res.reply, toolCalls: res.toolCalls },
      ]);
    } catch (e) {
      setBubbles((b) => [
        ...b,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "failed"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    setHistory([]);
    setBubbles([]);
    await api.resetAppointments();
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col h-[70vh]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Chat with the appointment agent</h2>
        <button
          onClick={reset}
          className="text-xs rounded bg-slate-700 hover:bg-slate-600 px-2 py-1"
        >
          Reset conversation
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {bubbles.length === 0 && (
          <p className="text-slate-400 text-sm">
            Try: <em>"I'd like to see Dr. Sharma tomorrow at 10am. My name is Aisha Rao."</em>
          </p>
        )}
        {bubbles.map((b, i) => (
          <div
            key={i}
            className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                b.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              <div className="whitespace-pre-wrap">{b.content}</div>
              {b.toolCalls && b.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  {b.toolCalls.map((tc, j) => (
                    <div
                      key={j}
                      className={`rounded border px-2 py-1 ${
                        tc.result.ok
                          ? "border-emerald-600/50 bg-emerald-600/10"
                          : "border-rose-600/50 bg-rose-600/10"
                      }`}
                    >
                      <div className="font-mono">
                        <span className="text-emerald-300">tool</span>:{" "}
                        {tc.name}{" "}
                        <span className={tc.result.ok ? "text-emerald-300" : "text-rose-300"}>
                          {tc.result.ok ? "ok" : "fail"}
                        </span>
                      </div>
                      <div className="opacity-80 truncate">
                        input: {JSON.stringify(tc.input)}
                      </div>
                      <div className="opacity-80 truncate">
                        {tc.result.ok
                          ? `data: ${JSON.stringify(tc.result.data)}`
                          : `error: ${tc.result.error}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-slate-400">agent thinking…</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type your message…"
          className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
