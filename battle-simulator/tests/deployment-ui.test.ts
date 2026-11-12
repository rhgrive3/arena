import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulation } from '../src/game/simulation';
import { STAGES } from '../src/game/campaign';
import { DEFS, SANDBOX_BUDGET } from '../src/game/units';

test('removing a paid deployment refunds only its army and keeps undo valid', () => {
  const sim = new BattleSimulation();
  sim.setupSandbox();
  sim.clearUnits();
  sim.deploy('spear', -25, 0, 3, 0);
  sim.deploy('archer', 25, 0, 2, 1);
  const ids = sim.units.filter(unit => unit.team === 0).map(unit => unit.id);
  assert.equal(sim.removeDeployed(ids), 3);
  assert.equal(sim.gold[0], SANDBOX_BUDGET);
  assert.equal(sim.gold[1], SANDBOX_BUDGET - DEFS.archer.cost * 2);
  assert.equal(sim.count(0), 0);
  assert.equal(sim.count(1), 2);
  assert.equal(sim.undoDeploy(), true);
  assert.equal(sim.count(1), 0);
  assert.equal(sim.gold[1], SANDBOX_BUDGET);
});

test('removing free sandbox demonstration troops never generates extra gold', () => {
  const sim = new BattleSimulation();
  sim.setupSandbox();
  sim.removeDeployed(sim.units.map(unit => unit.id));
  assert.deepEqual(sim.gold, [SANDBOX_BUDGET, SANDBOX_BUDGET]);
  assert.equal(sim.count(0) + sim.count(1), 0);
});

test('story enemies cannot be removed, player deployments are fully refunded', () => {
  const sim = new BattleSimulation();
  sim.setupStage(STAGES[0], 0);
  const enemyCount = sim.count(1);
  sim.deploy('spear', -25, 0, 5, 0);
  assert.equal(sim.removeDeployed(sim.units.map(unit => unit.id)), 5);
  assert.equal(sim.count(1), enemyCount);
  assert.equal(sim.gold[0], STAGES[0].budget);
  assert.equal(sim.count(0), 0);
  assert.equal(sim.canUndo, false);
});

test('units cannot be removed after battle has started', () => {
  const sim = new BattleSimulation();
  sim.setupSandbox();
  const count = sim.units.length;
  sim.begin();
  assert.equal(sim.removeDeployed(sim.units.map(unit => unit.id)), 0);
  assert.equal(sim.units.length, count);
});