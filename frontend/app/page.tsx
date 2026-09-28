import { Chat } from "../components/Chat";
import { EvalPanel } from "../components/EvalPanel";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          Self-Improving Patient Appointment Agent
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Chat with the agent, then run the evaluation and self-improvement loop
          to see failures detected, improvements generated, and scores updated —
          all without regressing previously passing scenarios.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <Chat />
        <EvalPanel />
      </div>
    </main>
  );
}
