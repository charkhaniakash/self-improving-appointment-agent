import { createContainer } from "../container.js";
import { SCENARIOS } from "../evaluation/scenarios/index.js";

async function main() {
  const c = createContainer();
  console.log("Running full self-improvement loop...\n");
  const report = await c.evaluationLoop.runFullLoop(SCENARIOS);

  const printReport = (label: string, r: typeof report.before) => {
    console.log(`--- ${label} ---`);
    for (const res of r.results) {
      const mark = res.passed ? "PASS" : "FAIL";
      console.log(`  ${mark}  ${res.scenarioId.padEnd(22)} ${res.scenarioName}`);
      if (!res.passed) {
        for (const c of res.criteria.filter((c) => !c.passed)) {
          console.log(`         - ${c.name}${c.detail ? " :: " + c.detail : ""}`);
        }
      }
    }
    console.log(
      `  Score: ${(r.overallScore * 100).toFixed(0)}% (${r.passedCount}/${r.totalCount})\n`,
    );
  };

  printReport("BEFORE improvements", report.before);

  console.log("Generated improvements:");
  for (const imp of report.newImprovements) {
    console.log(`  [${imp.id}] ${imp.rule.split(":")[0]}`);
    console.log(`         failure: ${imp.failure}`);
  }
  console.log();

  printReport("AFTER improvements", report.after);

  console.log(
    `Delta:                +${report.improvement.toFixed(1)} pts (` +
      `${(report.before.overallScore * 100).toFixed(0)}% -> ${(report.after.overallScore * 100).toFixed(0)}%)`,
  );
  console.log(
    `Previously passing:   ${report.previouslyPassingStillPassing}/${report.previouslyPassingTotal} still passing`,
  );
  console.log(
    `Regression:           ${report.regressed.length === 0 ? "PASSED" : "FAILED (" + report.regressed.join(", ") + ")"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
