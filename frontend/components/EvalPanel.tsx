"use client";

import { useState } from "react";
import { api } from "../lib/api";

interface CriterionResult {
  name: string;
  passed: boolean;
  detail?: string;
}
interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  score: number;
  criteria: CriterionResult[];
  finalReply: string;
}
interface Report {
  results: ScenarioResult[];
  overallScore: number;
  passedCount: number;
  totalCount: number;
}
interface RegressionReport {
  before: Report;
  after: Report;
  improvement: number;
  previouslyPassingStillPassing: number;
  previouslyPassingTotal: number;
  regressed: string[];
  newImprovements: Array<{
    id: string;
    failure: string;
    rule: string;
    sourceScenario: string;
  }>;
}

function ScoreBar({ label, report }: { label: string; report: Report }) {
  const pct = Math.round(report.overallScore * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono">
          {pct}% ({report.passedCount}/{report.totalCount})
        </span>
      </div>
      <div className="h-2 rounded bg-slate-700 overflow-hidden">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ScenarioList({ report }: { report: Report }) {
  return (
    <ul className="space-y-1 text-sm">
      {report.results.map((r) => (
        <li key={r.scenarioId} className="flex items-start gap-2">
          <span
            className={`mt-1 inline-block h-2 w-2 rounded-full ${
              r.passed ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <div className="flex-1">
            <div>
              <span className="font-mono text-xs text-slate-400">
                {r.scenarioId}
              </span>{" "}
              {r.scenarioName}
            </div>
            {!r.passed && (
              <ul className="text-xs text-rose-300 mt-0.5 pl-2">
                {r.criteria
                  .filter((c) => !c.passed)
                  .map((c, i) => (
                    <li key={i}>· {c.name}{c.detail ? `: ${c.detail}` : ""}</li>
                  ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EvalPanel() {
  const [loop, setLoop] = useState<RegressionReport | null>(null);
  const [single, setSingle] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"single" | "loop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runEval = async () => {
    setBusy("single");
    setError(null);
    try {
      const res = await api.evaluate();
      setSingle(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "eval failed");
    } finally {
      setBusy(null);
    }
  };

  const runLoop = async () => {
    setBusy("loop");
    setError(null);
    try {
      const res = await api.selfImprove();
      setLoop(res.report);
      setSingle(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "loop failed");
    } finally {
      setBusy(null);
    }
  };

  const resetPolicy = async () => {
    await api.resetPolicy();
    setLoop(null);
    setSingle(null);
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Evaluation & self-improvement</h2>
        <div className="flex gap-2">
          <button
            onClick={runEval}
            disabled={busy !== null}
            className="text-xs rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 disabled:opacity-50"
          >
            {busy === "single" ? "Running…" : "Run evaluation"}
          </button>
          <button
            onClick={runLoop}
            disabled={busy !== null}
            className="text-xs rounded bg-blue-600 hover:bg-blue-500 px-2 py-1 disabled:opacity-50"
          >
            {busy === "loop" ? "Running…" : "Run self-improvement loop"}
          </button>
          <button
            onClick={resetPolicy}
            className="text-xs rounded bg-slate-700 hover:bg-slate-600 px-2 py-1"
          >
            Reset policy
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded bg-rose-600/20 border border-rose-600/50 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {single && (
        <div>
          <ScoreBar label="Current score" report={single} />
          <ScenarioList report={single} />
        </div>
      )}

      {loop && (
        <div className="space-y-4">
          <div>
            <ScoreBar label="Before improvements" report={loop.before} />
            <ScoreBar label="After improvements" report={loop.after} />
            <div className="text-sm mt-2">
              Delta:{" "}
              <span className="font-mono text-emerald-300">
                +{loop.improvement.toFixed(1)} pts
              </span>{" "}
              · Previously passing:{" "}
              <span className="font-mono">
                {loop.previouslyPassingStillPassing}/
                {loop.previouslyPassingTotal}
              </span>{" "}
              · Regression:{" "}
              <span
                className={
                  loop.regressed.length === 0
                    ? "text-emerald-300"
                    : "text-rose-300"
                }
              >
                {loop.regressed.length === 0
                  ? "PASSED"
                  : `FAILED (${loop.regressed.join(", ")})`}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-xs uppercase text-slate-400 mb-2">Before</div>
              <ScenarioList report={loop.before} />
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-xs uppercase text-slate-400 mb-2">After</div>
              <ScenarioList report={loop.after} />
            </div>
          </div>

          {loop.newImprovements.length > 0 && (
            <div>
              <div className="text-xs uppercase text-slate-400 mb-2">
                Generated improvements
              </div>
              <ul className="space-y-2 text-sm">
                {loop.newImprovements.map((imp) => (
                  <li
                    key={imp.id}
                    className="rounded border border-emerald-600/40 bg-emerald-600/10 p-2"
                  >
                    <div className="font-mono text-xs text-emerald-300">
                      {imp.id} · source: {imp.sourceScenario}
                    </div>
                    <div className="text-xs mt-1 text-slate-300">
                      <strong>Failure:</strong> {imp.failure}
                    </div>
                    <div className="text-xs mt-1 text-slate-200">
                      <strong>Rule:</strong> {imp.rule}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
