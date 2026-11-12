// Which single-kind armies beat which, at equal budget: rows are every kind, columns the kinds named on the command line.
// Usage: tsx tools/versus.ts <cols,comma> [budget]
import { DEFS, duel, mono } from "./balance-lib";
import type { UnitKind } from "../src/game/units";
const cols = process.argv[2].split(",") as UnitKind[];
const budget = Number(process.argv[3] ?? 3000);
console.log("row beats col (W) at budget", budget, "\n" + " ".repeat(13) + cols.map(c => c.slice(0, 6).padEnd(7)).join(""));
for (const a of Object.keys(DEFS) as UnitKind[]) {
  if (DEFS[a].token) continue;
  let line = a.padEnd(13);
  for (const b of cols) line += (a === b ? "." : duel(mono(a, budget), mono(b, budget), 1).win ? "W" : "-").padEnd(7);
  console.log(line);
}
