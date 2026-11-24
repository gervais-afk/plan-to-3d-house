const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../js/costEstimate.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const wall = (from, to, level = 0) => ({ from, to, level, type: 'ext', thick: 0.25 });
const rectangle = {
  config: { wallHeight: 3 },
  walls: [wall([0, 0], [10, 0]), wall([10, 0], [10, 8]),
    wall([10, 8], [0, 8]), wall([0, 8], [0, 0])]
};

test('BA rectangle : volumes bruts, deux chaînages et pertes de 5 %', () => {
  const r = C.reinforcedConcrete(rectangle);
  assert.equal(r.columnCount, 4);
  near(r.footingLength, 36);
  near(r.volumes.footings, 5.4);
  near(r.volumes.columns, 0.48);
  near(r.volumes.beams, 2.88);
  near(r.concreteNet, 8.76);
  near(r.concreteOrder, 9.198);
});

test('HA : masses, recouvrements, cadres à leur axe, crochets et barres de 12 m', () => {
  const r = C.reinforcedConcrete(rectangle);
  const [ha12, ha10, ha6] = r.steel;
  near(C.steelKgPerMeter(12), 144 / 162);
  near(ha12.length, 4 * 4 * 3.4);
  near(ha10.length, 2 * 4 * (2 * 10.4 + 2 * 8.4));
  assert.equal(r.columnStirrups, 64);
  assert.equal(r.beamStirrups, 2 * (2 * 51 + 2 * 41));
  near(ha6.length, (64 + 368) * (2 * (0.4 - 0.1 - 0.012) + 0.12));
  for (const steel of r.steel) {
    assert.equal(steel.bars, Math.ceil(steel.length * 1.1 / 12));
    near(steel.massKg, steel.length * steel.diameter ** 2 / 162);
  }
  const long = C.reinforcedConcrete({ walls: [wall([0, 0], [25, 0])] });
  near(long.steel[1].length, 2 * 4 * (25 + 0.4 + 2 * 0.4));
});

test('Jonctions T/X, doublons et découpes colinéaires : pas de faux poteaux ou linéaires', () => {
  const t = { ...rectangle, walls: [...rectangle.walls, { ...wall([5, 0], [5, 8]), type: 'int' }] };
  const r = C.reinforcedConcrete(t);
  assert.equal(r.columnCount, 6);
  near(r.totalLength, 44);
  near(r.footingLength, 36);
  const duplicated = C.reinforcedConcrete({ ...t, walls: [...t.walls, ...t.walls.map(w => ({ ...w, from: w.to, to: w.from }))] });
  assert.deepEqual(duplicated.volumes, r.volumes);
  assert.deepEqual(duplicated.steel, r.steel);
  const split = C.reinforcedConcrete({ ...rectangle, walls: [
    wall([0, 0], [5, 0]), wall([5, 0], [10, 0]), ...rectangle.walls.slice(1)
  ] });
  assert.equal(split.columnCount, 4);
  assert.deepEqual(split.steel, C.reinforcedConcrete(rectangle).steel);
  const x = C.reinforcedConcrete({ walls: [wall([-2, 0], [2, 0]), wall([0, -2], [0, 2])] });
  assert.equal(x.columnCount, 1);
  near(x.totalLength, 8);
});

test('Niveaux : poteaux distincts et semelles uniquement au niveau choisi', () => {
  const r = C.reinforcedConcrete({ ...rectangle, walls: [
    ...rectangle.walls, ...rectangle.walls.map(w => ({ ...w, level: 1 }))
  ] });
  assert.equal(r.columnCount, 8);
  near(r.totalLength, 72);
  near(r.footingLength, 36);
  near(r.volumes.footings, 5.4);
  assert.equal(C.reinforcedConcrete(rectangle, { foundationLevel: -1 }).footingLength, 0);
});

test('Matériaux et CSV : nouveaux postes explicites, sans addition au budget au m²', () => {
  const project = { ...rectangle, rooms: [{ poly: [[0, 0], [10, 0], [10, 8], [0, 8]], habitable: true }] };
  const e = C.estimate(project);
  const old = C.estimate(project, { structure: { enabled: false } });
  assert.deepEqual(e.total, old.total);
  assert.deepEqual(e.overall, old.overall);
  const added = e.materials.filter(m => m.id.startsWith('ba-') || m.id.startsWith('ha-'));
  assert.equal(added.length, 6);
  for (const m of added) {
    assert.equal(m.count, m.quantity);
    assert.equal(m.cost, m.quantity * m.unitPrice);
    assert.equal(m.sourced, false);
  }
  near(added.filter(m => m.unit === 'm³').reduce((n, m) => n + m.quantity, 0), e.structure.concreteOrder);
  const csv = C.bordereauCSV(e);
  for (const text of ['Semelles', 'Poteaux', 'Chaînages', 'HA 12', 'HA 10', 'HA 6', 'ingénieur', 'semelles, dalles']) assert.ok(csv.includes(text), text);
  assert.equal(old.materials.some(m => /^ba-|^ha-/.test(m.id)), false);
  const custom = C.estimate(project, { structure: { stirrupDiameter: 8, ha12Price: 9000, concretePrice: 80000 } });
  assert.equal(custom.materials.find(m => m.id === 'ha-12').unitPrice, 9000);
  assert.ok(custom.materials.find(m => m.id === 'ha-8'));
});

test('Entrées vides/invalides et compatibilité navigateur sans module.exports', () => {
  const empty = C.reinforcedConcrete({ walls: [null, {}, wall([NaN, 0], [1, 0]), wall([0, 0], [0, 0])] });
  assert.equal(empty.concreteOrder, 0);
  assert.ok(empty.steel.every(s => s.bars === 0));
  const normalized = C.settings({ structure: { concretePrice: NaN, lapLength: 99, cover: 12, stirrupSpacing: 0 } });
  assert.equal(normalized.structure.concretePrice, 75000);
  assert.ok(normalized.structure.lapLength < 12);
  assert.ok(C.reinforcedConcrete(rectangle, normalized.structure).steel.every(s => Number.isFinite(s.length) && s.length >= 0));
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../js/costEstimate.js'), 'utf8') + '\nglobalThis.result = CostEstimate.estimate({});', context);
  assert.equal(context.result.structure.concreteOrder, 0);
});
