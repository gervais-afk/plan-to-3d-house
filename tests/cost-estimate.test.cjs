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
  assert.equal(p20.quantity, Math.ceil((36 * 3 - 7.5) * 12.5 * 1.05));
  assert.equal(p15.quantity, Math.ceil(22 * 12.5 * 1.05));
  assert.equal(p15.cost, p15.quantity * 365);
  assert.equal(p20.unitPrice, 425);
  assert.match(p20.source, /Spécifications techniques/);
});

test('Profils de prix : fourchette ECS publiée, indice des Spécifications × coefficient de ville, TVA facultative', () => {
  const ref = 84; // 80 m² habitables + 8 m² d'annexes à 50 %
  const ecs = CostEstimate.estimate(box, { profile: 'ecs', standing: 'moyen' });
  near(ecs.lots[0].low + ecs.lots[1].low, ref * 170000);
  near(ecs.lots[0].high + ecs.lots[1].high, ref * 220000);
  const douala = CostEstimate.estimate(box, { profile: 'spec', city: 'douala' });
  near(douala.perM2, 380000);
  assert.match(douala.rate.label, /HT/);
  const maroua = CostEstimate.estimate(box, { profile: 'spec', city: 'maroua', standing: 'haut', vat: true });
  near(maroua.perM2, 380000 * 1.35 * 1.13 * 1.1925, 1e-3);
  assert.match(maroua.rate.label, /TVA 19,25 % incluse/);
  // Un standing inconnu du profil reprend le standing par défaut de ce profil.
  assert.equal(CostEstimate.settings({ profile: 'ecs', standing: 'tres-haut' }).standing, 'moyen');
  assert.equal(CostEstimate.settings({ profile: 'spec', standing: 'moyen' }).standing, 'standard');
  // Une ville sans règle de permis connue retient la taxe saisie à la main.
  near(CostEstimate.estimate(box, { city: 'garoua', permitOther: 300000 }).lots[3].mid, 300000);
});

test('Bordereau d’achats : carrelage avec chutes, couverture selon le type, export CSV pour tableur', () => {
  const tiled = { ...box, rooms: box.rooms.map(r => (r.id === 'sejour' ? { ...r, floorType: 'tiles' } : r)) };
  const e = CostEstimate.estimate(tiled, { tileFormat: '60x60', roofType: 'aluzinc' });
  const tile = e.materials.find(m => m.id === 'carrelage');
  const roof = e.materials.find(m => m.id === 'couverture');
  near(tile.quantity, 44);          // 40 m² carrelés + 10 % de chutes
  assert.equal(tile.unitPrice, 16500);
  near(roof.quantity, 88);          // toutes les pièces du dernier niveau, annexes comprises
  assert.equal(roof.unitPrice, 7200 + 9500);
  const csv = CostEstimate.bordereauCSV(e, 'Maison ; test');
  assert.ok(csv.startsWith('﻿'), 'BOM pour un affichage correct des accents dans Excel');
  assert.match(csv, /^﻿Projet;"Maison ; test"/);
  assert.match(csv, /Carrelage grand format 60 × 60[^;]*;44;m²;16500;726000;/);
});

test('Budget global : études, extérieurs et terrain en fourchette, séparés de l’enveloppe travaux', () => {
  const none = CostEstimate.estimate(box, { studies: false, exterior: false });
  assert.equal(none.overall, null);
  const all = CostEstimate.estimate(box, { land: true, plotArea: 300, landZone: 'centre' });
  const works = all.lots[0].low + all.lots[1].low;
  const [studies, exterior, land] = all.annexes;
  assert.deepEqual([studies.low, studies.high], [2000000, 5000000]);
  near(exterior.low, works * 0.05);
  assert.deepEqual([land.low, land.high], [300 * 30000, 300 * 100000]);
  near(all.overall.low, all.total.low + studies.low + exterior.low + land.low);
  assert.equal(all.total.mid, CostEstimate.estimate(box, {}).total.mid, 'les annexes ne modifient pas l’enveloppe travaux');
  // Bornes : une fourchette inversée est remise dans l'ordre.
  const s = CostEstimate.settings({ studiesLow: 4e6, studiesHigh: 1e6, exteriorLow: 0.2, exteriorHigh: 0.05 });
  assert.ok(s.studiesHigh >= s.studiesLow && s.exteriorHigh >= s.exteriorLow);
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
  // La villa évolue dans l'éditeur (plain-pied puis R+1) : on contrôle des ratios, pas une surface figée.
  assert.ok(e.quantities.habitable > 50, `habitable ${e.quantities.habitable}`);
  assert.ok(e.reference >= e.quantities.habitable, 'la référence inclut les annexes pondérées');
  assert.ok(e.quantities.extLength > 30);
  const perM2 = (e.lots[0].mid + e.lots[1].mid) / e.reference;
  near(perM2, 290000, 1e-3);
  // Total = travaux + imprévus + permis : entre 1 et 1,25 fois le prix des travaux au m².
  const totalPerM2 = e.total.mid / e.reference;
  assert.ok(totalPerM2 > 290000 && totalPerM2 < 290000 * 1.25, `total ${e.total.mid} (${Math.round(totalPerM2)} FCFA/m²)`);
});
