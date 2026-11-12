// The outland rules: flight, parry, harpoon line, fan wind, volleys, snake arrows, garrisons, moved deployment ground.
// Each test pins one physical rule, not a tuned number.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { BattleSimulation, FIXED_STEP, FLY_ALTITUDE, GUARD_WAKE, TOKEN_LIMIT, type CombatUnit } from "../src/game/simulation";
import { DEFS, DEPLOY, TOKEN_KINDS, type UnitKind } from "../src/game/units";
import { DEFAULT_DEPLOY, EXPEDITION_RATIO, KIND_CAP, STAGES, enemyCost, stageLabel, stagePositions } from "../src/game/campaign";

function empty(seed = 2026) {
  const sim = new BattleSimulation(seed);
  sim.reset(false);
  return sim;
}
function run(sim: BattleSimulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) sim.advance(FIXED_STEP);
}
/** A unit that stands still and never attacks. */
function dummy(s: BattleSimulation, team: 0 | 1, kind: UnitKind, x: number, z: number, hp = 5000) {
  const u = s.spawn(team, kind, x, z);
  u.hp = u.maxHp = hp;
  u.order = "hold";
  u.cooldown = 1e9;
  return u;
}
const lost = (u: CombatUnit) => u.maxHp - u.hp;

test("flight: blades cannot reach a flyer, long weapons and shots can, and a flyer knocked down is fair game", () => {
  for (const [kind, reaches] of [["swordsman", false], ["orc", false], ["monk", false], ["spear", true], ["halberdier", true], ["knight", true], ["giant", true]] as [UnitKind, boolean][]) {
    const s = empty();
    const v = dummy(s, 1, "valkyrie", 2, 0);
    const a = s.spawn(0, kind, 0, 0);
    a.order = "attack"; a.targetId = v.id;
    s.begin();
    run(s, 6);
    assert.equal(lost(v) > 0, reaches, `${kind} ${reaches ? "reaches" : "cannot reach"} a flyer`);
  }
  // A swordsman left alone with a flyer does not even pick it as a target.
  const s = empty();
  const v = dummy(s, 1, "valkyrie", 6, 0);
  const sw = s.spawn(0, "swordsman", 0, 0);
  s.begin();
  run(s, 2);
  assert.equal(sw.targetId, null);
  assert.ok(sw.position.x < 0.5, "and does not chase it");
  // Knocked out of the sky, the same flyer can be cut down.
  v.downTime = 3;
  assert.equal(s.isFlying(v), false);
  run(s, 2.5);
  assert.ok(lost(v) > 0, "a grounded flyer is hit by a sword");
});

test("flight: arrows aimed at a flyer hit it at altitude, and arrows aimed at the ground pass underneath", () => {
  const s = empty();
  const v = dummy(s, 1, "valkyrie", 14, 0);
  const archer = dummy(s, 0, "archer", 0, 0);
  s.begin();
  assert.equal(s.altitude(v), FLY_ALTITUDE);
  s.fire(archer, v);
  run(s, 1.2);
  assert.ok(lost(v) > 0, "an aimed arrow reaches the flyer");

  const s2 = empty();
  const over = dummy(s2, 1, "valkyrie", 7, 0);
  const foot = dummy(s2, 1, "orc", 14, 0);
  const archer2 = dummy(s2, 0, "archer", 0, 0);
  s2.begin();
  s2.fire(archer2, foot);
  run(s2, 1.2);
  assert.equal(lost(over), 0, "the flyer above the line of fire is untouched");
  assert.ok(lost(foot) > 0);
});

test("flight: flyers pass over ground troops and rocks instead of pushing through them", () => {
  const s = empty();
  s.sceneIndex = 2; // rock of radius 8 at (0, -18)
  const v = s.spawn(0, "valkyrie", -14, -18);
  const prey = dummy(s, 1, "archer", 14, -18);
  for (let z = -22; z <= -14; z += 1.4) dummy(s, 1, "guardian", -11, z);
  v.order = "attack"; v.targetId = prey.id;
  s.begin();
  s.engaged = true;
  run(s, 5.5);
  assert.ok(lost(prey) > 0 || prey.dead, "the flyer crossed a wall of bodies and a rock in a straight line");
});

test("parry: a swordmaster cuts one frontal arrow at a time; blasts, bullets, magic and shots from behind get through", () => {
  const shoot = (shooter: UnitKind, from: number, n = 1) => {
    const s = empty();
    const sam = dummy(s, 1, "samurai", 0, 0);
    sam.facing = Math.PI / 2; // facing +x
    const a = dummy(s, 0, shooter, from, 0);
    const b = dummy(s, 0, shooter, from, 1.2);
    s.begin();
    s.fire(a, sam);
    if (n > 1) s.fire(b, sam);
    run(s, 2.5);
    return lost(sam);
  };
  assert.equal(shoot("archer", 12), 0, "a single arrow from the front is cut down");
  assert.equal(shoot("crossbow", 12), 0, "so is a quarrel");
  assert.equal(shoot("javelin", 9), 0, "and a javelin");
  assert.ok(shoot("archer", 12, 2) > 0, "two arrows at once: only one is cut");
  assert.ok(shoot("archer", -12) > 0, "an arrow in the back is not seen");
  assert.ok(shoot("pirate", 12) > 0, "a bullet cannot be cut");
  assert.ok(shoot("mage", 12) > 0, "nor can magic");
  assert.ok(shoot("bomber", 10) > 0, "nor a bomb");
});

test("harpoon: light bodies are dragged deep toward the thrower, heavy ones stay put but are still wounded", () => {
  const s = empty();
  const h = s.spawn(0, "harpooner", 0, 0);
  const light = dummy(s, 1, "guardian", 15, 0);
  light.facing = -Math.PI / 2;
  s.begin();
  s.fire(h, light);
  run(s, 3);
  assert.ok(light.position.x < 7, `the shield bearer was hauled out of line (now at x=${light.position.x.toFixed(1)})`);
  assert.ok(light.position.x > 1.5, "but not onto the thrower");

  const s2 = empty();
  const h2 = s2.spawn(0, "harpooner", 0, 0);
  const heavy = dummy(s2, 1, "giant", 15, 0);
  s2.begin();
  s2.fire(h2, heavy);
  run(s2, 3);
  assert.ok(heavy.position.x > 13, "a giant is too heavy to drag");
  assert.ok(lost(heavy) > 0);
  for (const k of ["troll", "giant", "tank", "catapult", "mammoth"] as UnitKind[]) assert.ok(DEFS.harpooner.pull! / DEFS[k].mass <= 2.6, `${k} cannot be lifted`);
  for (const k of ["guardian", "archer", "knight", "paladin", "robot"] as UnitKind[]) assert.ok(DEFS.harpooner.pull! / DEFS[k].mass > 2.6, `${k} can be lifted`);
});

test("fan wind: the gust shoves everyone in the cone in front of the bearer and nobody behind", () => {
  const s = empty();
  const fan = s.spawn(0, "fanbearer", 0, 0);
  const front = dummy(s, 1, "orc", 5, 0), wide = dummy(s, 1, "orc", 4, 3), behind = dummy(s, 1, "orc", -3, 0);
  const shield = dummy(s, 1, "guardian", 5, -2);
  shield.facing = -Math.PI / 2;
  fan.order = "attack"; fan.targetId = front.id;
  s.begin();
  run(s, 2.2);
  assert.ok(front.position.x > 6 && wide.position.x > 4.6, "units in the cone are pushed away");
  assert.ok(shield.position.x > 5.5, "a shield does not stop wind");
  assert.ok(Math.abs(behind.position.x + 3) < 0.6, "units behind the bearer are not moved");
});

test("fan wind: arrows and bombs flying into the fan are thrown back at the shooters; bullets and magic are not", () => {
  const volley = (shooter: UnitKind, fanFacing: number) => {
    const s = empty();
    const fan = dummy(s, 1, "fanbearer", 0, 0);
    fan.facing = fanFacing;
    const victim = dummy(s, 1, "orc", -4, 0);
    const a = dummy(s, 0, shooter, 14, 0);
    const mates: CombatUnit[] = [];
    for (let x = 10; x <= 26; x += 2) for (const z of [-1.2, 1.2]) mates.push(dummy(s, 0, "orc", x, z));
    s.begin();
    s.fire(a, victim);
    run(s, 3);
    return { victim: lost(victim) + lost(fan), own: lost(a) + mates.reduce((n, m) => n + lost(m), 0) };
  };
  const faced = volley("archer", Math.PI / 2);
  assert.equal(faced.victim, 0, "the arrow never arrives");
  assert.ok(faced.own > 0, "it comes back and hits the shooter's side");
  assert.ok(volley("archer", -Math.PI / 2).victim > 0, "a fan facing the other way turns nothing");
  assert.ok(volley("bomber", Math.PI / 2).own > 0, "a bomb is blown back too");
  assert.ok(volley("pirate", Math.PI / 2).victim > 0, "a bullet goes straight through the wind");
  assert.ok(volley("mage", Math.PI / 2).victim > 0, "magic is not wind-borne");
});

test("volley: a rocket cart looses its whole rack at once, scattered around the aiming point", () => {
  const s = empty();
  const cart = s.spawn(0, "hwacha", 0, 0);
  const target = dummy(s, 1, "orc", 26, 0);
  s.begin();
  s.fire(cart, target);
  assert.equal(s.projectiles.length, DEFS.hwacha.burst);
  const around: CombatUnit[] = [];
  for (let i = 0; i < 12; i++) around.push(dummy(s, 1, "zombie", 26 + Math.cos(i) * 2.4, Math.sin(i) * 2.4));
  run(s, 2.5);
  const hitCount = [target, ...around].filter(u => lost(u) > 0).length;
  assert.ok(hitCount >= 4, `the volley lands on a crowd, not one man (${hitCount} hit)`);
  // Shields shrug the same volley off.
  const s2 = empty();
  const cart2 = s2.spawn(0, "hwacha", 0, 0);
  const wall = dummy(s2, 1, "guardian", 26, 0);
  wall.facing = -Math.PI / 2;
  s2.begin();
  for (let i = 0; i < 3; i++) s2.fire(cart2, wall);
  run(s2, 2.5);
  assert.ok(lost(wall) < 3 * DEFS.hwacha.burst! * DEFS.hwacha.dmg * 0.4, "most of it is stopped by the shield");
  assert.ok(DEFS.hwacha.minRange! > 0);
});

test("snake arrows: every hit leaves a snake at the victim's feet, the snake pins shooters, and it is gone in seconds", () => {
  const s = empty();
  const charmer = s.spawn(0, "snakearcher", 0, 0);
  charmer.order = "hold"; charmer.cooldown = 1e9;
  const victim = dummy(s, 1, "archer", 15, 0);
  victim.cooldown = 0; // a working archer
  s.begin();
  s.fire(charmer, victim);
  run(s, 1.0);
  const snakes = () => s.units.filter(u => u.kind === "snake" && !u.dead);
  assert.equal(snakes().length, 1);
  assert.equal(snakes()[0].team, 0);
  assert.ok(Math.hypot(snakes()[0].position.x - victim.position.x, snakes()[0].position.z - victim.position.z) < 3);
  run(s, 0.6);
  assert.equal(victim.sidearm, true, "the archer has dropped the bow to deal with the snake");
  run(s, DEFS.snake.life! + 0.5);
  assert.equal(snakes().length, 0, "the snake has expired");
  assert.equal(s.kills[1], 0, "and its passing is nobody's kill");

  // Snakes have their own limit and never use up the army's places.
  const s2 = empty();
  const c2 = s2.spawn(0, "snakearcher", 0, 0);
  const v2 = dummy(s2, 1, "giant", 12, 0);
  s2.begin();
  for (let i = 0; i < TOKEN_LIMIT + 10; i++) { s2.fire(c2, v2); run(s2, 0.12); }
  assert.ok(s2.tokens(0) <= TOKEN_LIMIT);
  assert.ok(s2.tokens(0) >= TOKEN_LIMIT - 4, "the limit is actually reached");
});

test("tokens: a snake cannot be bought, sits in no tab, and is the only such kind", () => {
  assert.deepEqual(TOKEN_KINDS, ["snake"]);
  assert.ok(!DEPLOY.includes("snake"));
  const s = new BattleSimulation(1);
  s.setupSandbox();
  assert.deepEqual(s.deploy("snake", -20, 30), { count: 0, reason: "locked" });
});

test("skirmisher: a ninja keeps throwing with an enemy on top of it, where an archer is reduced to a knife", () => {
  const dealt = (kind: UnitKind) => {
    const s = empty();
    const t = dummy(s, 1, "orc", 3, 0);
    const u = s.spawn(0, kind, 0, 0);
    u.order = "hold";
    s.begin();
    run(s, 4);
    return lost(t);
  };
  assert.ok(dealt("ninja") > dealt("archer") * 3);
});

test("garrison: stands still until an enemy comes close, and when one member is hurt the whole garrison turns out", () => {
  const stage = STAGES[22]; // 蛇の巣: three nests under one alarm
  const s = new BattleSimulation(3);
  s.setupStage(stage, 22);
  const guards = s.units.filter(u => u.guard);
  assert.ok(guards.length >= 20);
  const start = new Map(guards.map(u => [u.id, u.position.clone()]));
  const free = s.units.filter(u => u.team === 1 && !u.guard);
  assert.ok(free.length > 0, "some of the enemy is not in garrison");
  s.spawn(0, "orc", -70, 45); // far from everything
  s.begin();
  run(s, 4);
  for (const u of guards) assert.ok(u.position.distanceTo(start.get(u.id)!) < 0.6, "garrison holds its ground");
  assert.ok(free.some(u => u.position.x < 8), "the free troops advance");
  // One wound anywhere wakes all three nests.
  s.damage(guards[0], 5, 0, new Vector3(-10, 0, 0));
  assert.ok(guards.every(u => u.guard === 0 && u.order === "auto"));
  run(s, 3);
  assert.ok(guards.filter(u => !u.dead && u.position.distanceTo(start.get(u.id)!) > 2).length > guards.length / 2, "and they come out");

  // Coming close does the same.
  const s2 = empty();
  const g = s2.spawn(1, "hoplite", 0, 0);
  g.guard = 7; g.order = "hold";
  const far = s2.spawn(1, "hoplite", 40, 0);
  far.guard = 7; far.order = "hold";
  const walker = s2.spawn(0, "swordsman", -(GUARD_WAKE + 6), 0);
  s2.begin();
  run(s2, 0.5);
  assert.equal(far.guard, 7);
  run(s2, 4);
  assert.equal(g.guard, 0);
  assert.equal(far.guard, 0, "the alarm reaches the far member too");
  void walker;
});

test("deployment ground: outland stages can move it, split it or shrink it, and only that ground accepts units", () => {
  const sim = new BattleSimulation(1);
  sim.setupStage(STAGES[0], 0);
  assert.equal(sim.deployZones, DEFAULT_DEPLOY);
  assert.equal(sim.isDeployPosition(-20, 0), true);
  assert.equal(sim.isDeployPosition(20, 0), false);

  const split = STAGES[26]; // 風の砦
  sim.setupStage(split, 26);
  assert.equal(split.deploy!.length, 2);
  assert.equal(sim.isDeployPosition(-50, 10), true);
  assert.equal(sim.isDeployPosition(50, -10), true, "the far side is open too");
  assert.equal(sim.isDeployPosition(0, 0), false, "the fort itself is not");
  assert.equal(sim.deploy("spear", 50, 0).count, 1);
  assert.equal(sim.deploy("spear", 0, 20).reason, "zone");

  const pocket = STAGES[29]; // 四面楚歌
  sim.setupStage(pocket, 29);
  assert.equal(sim.isDeployPosition(0, 0), true);
  assert.equal(sim.isDeployPosition(-30, 0), false);
  // Enemies stand on every side of the pocket and face it.
  const sides = { n: 0, s: 0, e: 0, w: 0 };
  for (const u of sim.units) {
    if (u.team !== 1) continue;
    if (u.position.z < -20) sides.n++; else if (u.position.z > 20) sides.s++; else if (u.position.x > 20) sides.e++; else if (u.position.x < -20) sides.w++;
    const toCentre = Math.atan2(-u.position.x, -u.position.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(toCentre - u.facing), Math.cos(toCentre - u.facing))) < 0.01, "every enemy faces the pocket");
  }
  assert.ok(sides.n >= 5 && sides.s >= 5 && sides.e >= 5 && sides.w >= 5, JSON.stringify(sides));
  sim.reset(false);
  assert.equal(sim.deployZones, DEFAULT_DEPLOY, "leaving the stage restores the usual ground");
});

test("expedition rules: outland stages cap every kind and give a smaller share of the enemy's cost", () => {
  for (const stage of STAGES) {
    const outland = stage.id >= 22;
    assert.equal(stage.kindCap, outland ? KIND_CAP : undefined, `stage ${stage.id}`);
    if (outland) assert.ok(Math.abs(stage.budget - enemyCost(stage) * EXPEDITION_RATIO) <= 12.5, `stage ${stage.id} budget follows the expedition ratio`);
  }
  const sim = new BattleSimulation(1);
  sim.setupStage(STAGES[21], 21);
  let placed = 0;
  for (let i = 0; i < 4; i++) placed += sim.deploy("spear", -30, -30 + i * 12, 5).count;
  assert.equal(placed, KIND_CAP);
  assert.equal(sim.deploy("spear", -30, 30).reason, "kindcap");
  assert.equal(sim.deploy("archer", -40, 0).count, 1, "another kind is still welcome");
  // The rule belongs to the stage, not to the simulation.
  sim.setupStage(STAGES[0], 0);
  assert.equal(sim.kindCap, 0);
});

test("outland campaign: nine stages in two new chapters, every one a different shape", () => {
  const outland = STAGES.filter(s => s.id >= 22);
  assert.equal(outland.length, 9);
  assert.deepEqual(outland.map(stageLabel), ["5-1", "5-2", "5-3", "5-4", "5-5", "6-1", "6-2", "6-3", "6-4"]);
  assert.equal(stageLabel(STAGES[20]), "4-6");
  // A coarse fingerprint of where the enemy stands relative to the player's ground: no two stages share one.
  const prints = new Set<string>();
  for (const stage of outland) {
    const zones = stage.deploy ?? DEFAULT_DEPLOY;
    const cx = zones.reduce((n, r) => n + (r.x0 + r.x1) / 2, 0) / zones.length, cz = zones.reduce((n, r) => n + (r.z0 + r.z1) / 2, 0) / zones.length;
    const octants = new Array(8).fill(0);
    let n = 0, guards = 0, reach = 0;
    for (const g of stage.enemies) for (const p of stagePositions(g)) {
      octants[Math.floor(((Math.atan2(p.z - cz, p.x - cx) + Math.PI) / (Math.PI * 2)) * 8) % 8]++;
      n++;
      reach += Math.hypot(p.x - cx, p.z - cz);
      if (g.guard) guards++;
    }
    const print = [zones.length, zones.map(r => `${r.x0},${r.x1},${r.z0},${r.z1}`).join(";"), octants.map(c => Math.round((c / n) * 4)).join(""), Math.round((guards / n) * 3), Math.round(reach / n / 12)].join("|");
    assert.ok(!prints.has(print), `stage ${stage.id} repeats another stage's shape (${print})`);
    prints.add(print);
    // Every stage introduces its own new kind and hands it over on victory.
    assert.equal(stage.unlock.length, 1);
    assert.equal(DEFS[stage.unlock[0]].faction, "outland");
    assert.ok(stage.enemies.some(g => g.kind === stage.unlock[0]), `stage ${stage.id} shows ${stage.unlock[0]} before giving it`);
  }
});
