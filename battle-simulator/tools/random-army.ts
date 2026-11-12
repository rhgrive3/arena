// A random mixed army (2-4 kinds, random budget shares) from the kinds a player has unlocked. Deterministic per seed.
import { DEFS, type Army } from "./balance-lib";
import type { UnitKind } from "../src/game/units";

export function randomArmy(open: UnitKind[], budget: number, seed: number, cap = 50): Army {
  let rs = (seed * 2654435761) >>> 0;
  const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
  for (let i = 0; i < 4; i++) rnd();
  // Under a per-kind limit an army needs more kinds to spend its money.
  const n = cap < 50 ? 5 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 3);
  const pool = open.filter(k => DEFS[k].cost <= budget && !DEFS[k].token);
  const picks: UnitKind[] = [];
  while (picks.length < Math.min(n, pool.length)) {
    const k = pool[Math.floor(rnd() * pool.length)];
    if (!picks.includes(k)) picks.push(k);
  }
  const w = picks.map(() => 0.3 + rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  const counts = picks.map((k, i) => Math.min(cap, Math.floor((budget * w[i] / sum) / DEFS[k].cost)));
  let left = budget - picks.reduce((s, k, i) => s + counts[i] * DEFS[k].cost, 0);
  for (let guard = 0; guard < 60; guard++) {
    const fit = picks.map((k, i) => [k, i] as const).filter(([k, i]) => DEFS[k].cost <= left && counts[i] < cap);
    if (!fit.length) break;
    const [k, i] = fit[Math.floor(rnd() * fit.length)];
    counts[i]++; left -= DEFS[k].cost;
  }
  let total = counts.reduce((a, b) => a + b, 0);
  while (total > 50) { const i = counts.indexOf(Math.max(...counts)); counts[i]--; total--; }
  return picks.map((k, i) => [k, counts[i]] as [UnitKind, number]).filter(([, c]) => c > 0);
}
