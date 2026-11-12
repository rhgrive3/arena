// Re-checks the reference armies in tests/solutions.ts: every answer must win on all three seeds. Usage: tsx tools/check-solutions.ts [stageIds]
import { STAGES, armyCost, fightStage } from "./balance-lib";
import { SOLUTIONS } from "../tests/solutions";
const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
for (const stage of STAGES) {
  if (only && !only.has(stage.id)) continue;
  const res = (SOLUTIONS[stage.id] ?? []).map(a => [7, 1, 2].map(seed => (fightStage(stage, a, "ranks", seed).win ? "W" : "-")).join("") + ` (${armyCost(a)}/${stage.budget})`);
  console.log(`${stage.id}: ${res.join("  ")}${res.every(r => r.startsWith("WWW")) && res.length >= 2 ? "" : "   <-- BROKEN"}`);
}
