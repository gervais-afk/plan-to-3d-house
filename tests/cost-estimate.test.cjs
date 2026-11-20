const assert = require('node:assert/strict');
const { test } = require('node:test');
const CostEstimate = require('../js/costEstimate.js');
const villa = require('../projects/villa-serena/project.json');

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

// Boîte de 10 × 8 m, hauteur 3 m : 36 m de mur extérieur de 25 cm, une cloison de 15 cm de 8 m.
const box = {
  config: { wallHeight: 3 },
  walls: [
    { from: [0, 0], to: [10, 0], type: 'ext', thick: 0.25, openings: [{ type: 'door', w: 1, h: 2 }, { type: 'window', w: 1.5, h: 1 }] },
    { from: [10, 0], to: [10, 8], type: 'ext', thick: 0.25 },
    { from: [10, 8], to: [0, 8], type: 'ext', thick: 0.25, openings: [{ type: 'bay', w: 2, h: 2 }] },
    { from: [0, 8], to: [0, 0], type: 'ext', thick: 0.25 },
    { from: [5, 0], to: [5, 8], type: 'int', thick: 0.15, openings: [{ type: 'open', w: 1, h: 2 }] }
  ],
  rooms: [
    { id: 'sejour', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 8 }, habitable: true },
    { id: 'chambre', poly: [[5, 0], [10, 0], [10, 8], [5, 8]], habitable: true },
    { id: 'porche', bounds: { xMin: 0, xMax: 4, zMin: -2, zMax: 0 }, habitable: false }
  ]
};

test('Le métré vient de la géométrie : surfaces, linéaires, ouvertures et parpaings', () => {
  const q = CostEstimate.quantities(box);
  near(q.habitable, 80);
  near(q.annexes, 8);
  near(q.extLength, 36);
  near(q.intLength, 8);
  near(q.wallGross, 44 * 3);
  near(q.openingArea, 2 + 1.5 + 4 + 2);
  near(q.wall20, 36 * 3 - 7.5);
  near(q.wall15, 8 * 3 - 2);
  assert.deepEqual([q.doors, q.windows, q.bays, q.passages, q.levels], [1, 1, 1, 1, 1]);

  const e = CostEstimate.estimate(box, {});
  const [p20, p15] = e.materials;
  assert.equal(p20.count, Math.ceil((36 * 3 - 7.5) * 12.5 * 1.05));
  assert.equal(p15.count, Math.ceil(22 * 12.5 * 1.05));
  assert.equal(p15.cost, p15.count * 365);
  assert.equal(p20.sourced, false, 'le prix du parpaing de 20 reste à confirmer');
});

test('L’estimation suit le standing, les annexes à 50 %, les imprévus et la taxe de permis par ville', () => {
  const douala = CostEstimate.estimate(box, { standing: 'moyen', city: 'douala' });
  near(douala.reference, 80 + 8 * 0.5);
  const works = 84 * 290000;
  near(douala.lots[0].mid + douala.lots[1].mid, works);
  near(douala.lots[0].mid, works * 0.55);
  near(douala.lots[2].mid, works * 0.10);
  near(douala.lots[3].mid, 84 * 2500);
  near(douala.total.mid, works * 1.10 + 84 * 2500);
  assert.ok(douala.total.low < douala.total.mid && douala.total.mid < douala.total.high);
  near(douala.total.low, works * 1.10 * 0.9 + 84 * 2500);

  const yaounde = CostEstimate.estimate(box, { standing: 'moyen', city: 'yaounde' });
  near(yaounde.lots[3].mid, works * 0.01);
  const other = CostEstimate.estimate(box, { city: 'autre', permitOther: 750000 });
  near(other.lots[3].mid, 750000);

  const custom = CostEstimate.estimate(box, { perM2: 310000 });
  near(custom.lots[0].mid + custom.lots[1].mid, 84 * 310000);
  assert.ok(CostEstimate.estimate(box, { standing: 'haut' }).total.mid > douala.total.mid);
});

test('Les réglages aberrants reprennent les valeurs par défaut au lieu de fausser le chiffrage', () => {
  const s = CostEstimate.settings({ standing: '__proto__', city: 'paris', perM2: -5, grossShare: 4, contingency: Number.NaN, blockPrice15: 'cher' });
  assert.equal(s.standing, 'moyen');
  assert.equal(s.city, 'douala');
  assert.equal(s.perM2, null);
  assert.equal(s.grossShare, 0.9);
  assert.equal(s.contingency, 0.10);
  assert.equal(s.blockPrice15, 365);
  assert.equal(CostEstimate.estimate({}, {}).total.mid, 0);
  assert.match(CostEstimate.formatXAF(31449600), /^31\s450\s000 FCFA$/u);
});

test('Villa Serena : la surface de référence suit le métré et le total reste dans les ratios publiés', () => {
  const e = CostEstimate.estimate(villa, { standing: 'moyen', city: 'douala' });
  assert.ok(e.quantities.habitable > 100 && e.quantities.habitable < 115);
  assert.ok(e.quantities.extLength > 30);
  const perM2 = (e.lots[0].mid + e.lots[1].mid) / e.reference;
  near(perM2, 290000, 1e-3);
  assert.ok(e.total.mid > 30e6 && e.total.mid < 45e6, `total ${e.total.mid}`);
});
