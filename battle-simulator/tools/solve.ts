// Finds mixed armies that beat each stage on three seeds and prints them as reference solutions.
// Usage: tsx tools/solve.ts [stageIds] [samples] [want]
import { DEFS, STAGES, armyCost, fightStage, unlockedThrough, type Army } from "./balance-lib";
import { randomArmy } from "./random-army";

const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
const samples = Number(process.argv[3] ?? 150);
const want = Number(process.argv[4] ?? 3);
export const SEEDS = [7, 1, 2];

for (const stage of STAGES) {
  if (only && !only.has(stage.id)) continue;
  const open = unlockedThrough(stage.id - 1).filter(k => DEFS[k].cost <= stage.budget);
  const found: Army[] = [];
  let tried = 0, first = 0;
  for (; tried < samples && found.length < want; tried++) {
    const army = randomArmy(open, stage.budget, tried + stage.id * 7919, stage.kindCap);
    if (army.length < 2) continue;
    if (!fightStage(stage, army, "ranks", SEEDS[0]).win) continue;
    first++;
    if (!SEEDS.slice(1).every(seed => fightStage(stage, army, "ranks", seed).win)) continue;
    const key = (a: Army) => a.map(([k]) => k).sort().join("+");
    if (found.some(f => key(f) === key(army))) continue;
    found.push(army);
  }
  console.log(`  ${stage.id}: ${JSON.stringify(found)}, // ${first}/${tried} sampled armies won; cost ${found.map(armyCost).join("/")} of ${stage.budget}`);
}
