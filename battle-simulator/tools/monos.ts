// Fast design check for one stage: which no-thought armies win, and how many random mixes win.
// Stages without a per-kind limit are tried with every single-kind army; stages with one are tried with stacks of heavy pieces.
// Usage: tsx tools/monos.ts <stage> [randomSamples]
import { BRUTES, DEFS, STAGES, fightStage, mono, stack, unlockedThrough, type Army, type Layout } from "./balance-lib";
import { randomArmy } from "./random-army";
const stage = STAGES[Number(process.argv[2]) - 1];
const open = unlockedThrough(stage.id - 1);
const samples = Number(process.argv[3] ?? 0);
const LAYOUTS: Layout[] = ["ranks", "wide", "clump", "back"];
const fmt = (a: Army) => a.map(([k, n]) => `${k}x${n}`).join("+");
const armies: Army[] = stage.kindCap
  ? BRUTES.map(list => stack(list.filter(k => open.includes(k)), stage.budget, stage.kindCap))
  : open.map(k => mono(k, stage.budget));
const wins: string[] = [];
for (const army of armies) {
  if (!army.length || !army[0][1]) continue;
  const res = LAYOUTS.map(l => fightStage(stage, army, l, 7));
  const won = LAYOUTS.filter((_, i) => res[i].win);
  if (won.length) wins.push(`${fmt(army)}(${won.join("/")})`);
  else if (process.env.V) wins.push(`[${fmt(army)}: ${Math.min(...res.map(r => r.enemyLeft))} left]`);
}
const cost = stage.enemies.reduce((s, e) => s + DEFS[e.kind].cost * e.count, 0);
let line = `#${stage.id} ${stage.name} budget ${stage.budget}/${cost} n=${stage.enemies.reduce((s, e) => s + e.count, 0)} | no-thought wins: ${wins.join(" ") || "none"}`;
if (samples) {
  let w = 0; const ex: string[] = [];
  for (let i = 0; i < samples; i++) {
    const a = randomArmy(open, stage.budget, i + stage.id * 1000, stage.kindCap);
    if (fightStage(stage, a, "ranks", 7).win) { w++; if (ex.length < 4) ex.push(a.map(([k, n]) => `${k}x${n}`).join(" ")); }
  }
  line += ` | random ${w}/${samples}${ex.length ? "\n     " + ex.join("\n     ") : ""}`;
}
console.log(line);
