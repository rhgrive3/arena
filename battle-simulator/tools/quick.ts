// Quick look at one or more stages: hand-written armies against them, on three seeds, in a named layout.
// Usage: tsx tools/quick.ts <stage> [layout] '<army>' '<army>' ...   (army = "kind:n kind:n")
import { DEFS, STAGES, armyCost, fightStage, type Army, type Layout } from "./balance-lib";
import type { UnitKind } from "../src/game/units";
const [idS, ...rest] = process.argv.slice(2);
const layouts = ["ranks", "wide", "clump", "back", "line"];
const layout = (layouts.includes(rest[0]) ? rest.shift() : "ranks") as Layout;
const stage = STAGES[Number(idS) - 1];
const parse = (s: string): Army => s.trim().split(/\s+/).map(t => { const [k, n] = t.split(/[:x]/); return [k as UnitKind, Number(n)]; });
console.log(`#${stage.id} ${stage.name} budget ${stage.budget} enemies ${stage.enemies.reduce((n, g) => n + g.count, 0)}`);
for (const a of rest) {
  const army = parse(a);
  for (const [k] of army) if (!DEFS[k]) throw new Error(`unknown kind ${k}`);
  const res = [7, 1, 2].map(seed => { const o = fightStage(stage, army, layout, seed, false); return `${o.win ? "WIN " : "lose"} ${o.left}v${o.enemyLeft} t${Math.round(o.time)}`; });
  console.log(`${String(armyCost(army)).padStart(5)} ${a.padEnd(50)} ${res.join(" | ")}`);
}
