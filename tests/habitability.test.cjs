const assert = require('node:assert/strict');
const { test } = require('node:test');
const Habitability = require('../js/habitability.js');

// Maison de 10 × 8 m : un séjour (5 × 8) et une salle d'eau (5 × 4) ; murs de 20 cm.
const house = (overrides = {}) => ({
  config: { wallHeight: 2.6, ...overrides.config },
  walls: [
    { from: [0, 0], to: [10, 0], type: 'ext', thick: 0.2, openings: [
      { type: 'door', at: 2, w: overrides.doorWidth ?? 0.95, h: 2.1 },
      { type: 'window', at: 4, w: overrides.windowWidth ?? 2.4, h: 1.5 } // 3,6 m² pour 40 m² : 9 % par défaut
    ] },
    { from: [10, 0], to: [10, 8], type: 'ext', thick: 0.2, openings: overrides.bathWindow ? [{ type: 'window', at: 2, w: 0.6, h: 0.6 }] : [] },
    { from: [10, 8], to: [0, 8], type: 'ext', thick: 0.2 },
    { from: [0, 8], to: [0, 0], type: 'ext', thick: 0.2 },
    { from: [5, 0], to: [5, 8], type: 'int', thick: 0.1 }
  ],
  rooms: [
    { id: 'sejour', name: 'SÉJOUR', habitable: true, bounds: { xMin: 0.1, xMax: 4.95, zMin: 0.1, zMax: 7.9 } },
    { id: 'eau', name: 'SALLE D’EAU', habitable: true, bounds: { xMin: 5.05, xMax: 9.9, zMin: 0.1, zMax: 4 } },
    { id: 'hall', name: 'Dégagement', habitable: true, bounds: { xMin: 5.05, xMax: 9.9, zMin: 4, zMax: 7.9 } }
  ]
});
const codes = project => Habitability.check(project).map(w => w.code).sort();

test('Une maison conforme ne lève aucun avertissement', () => {
  assert.deepEqual(codes(house({ windowWidth: 3, bathWindow: true })), []);
});

test('Porte extérieure étroite, plafond bas, séjour sombre et salle d’eau aveugle sont signalés', () => {
  const warnings = Habitability.check(house({ doorWidth: 0.8, config: { wallHeight: 2.3 } }));
  assert.deepEqual(warnings.map(w => w.code).sort(), ['hauteur', 'lumiere', 'porte', 'ventilation']);
  const light = warnings.find(w => w.code === 'lumiere');
  assert.equal(light.target.obj.id, 'sejour', 'l’avertissement désigne la pièce à corriger');
  assert.match(light.message, /9,5 % de surface vitrée/);
  assert.equal(warnings.find(w => w.code === 'porte').target.kind, 'opening');
});

test('Les circulations ne sont pas soumises à la règle d’éclairage et un projet vide ne plante pas', () => {
  assert.ok(!Habitability.check(house()).some(w => w.target?.obj?.id === 'hall'));
  assert.deepEqual(Habitability.check({}), []);
  assert.deepEqual(Habitability.check({ walls: [{ from: [0, 0], to: [0, 0] }], rooms: [{ name: 'x' }] }), []);
});

test('Paliers et escaliers sont des circulations : pas d’exigence d’éclairement de pièce de vie', () => {
  const H = require('../js/habitability.js');
  const verandas = require('../projects/residence-verandas/project.json');
  const lighting = H.check(verandas).filter(w => w.code === 'lumiere').map(w => w.message);
  assert.ok(lighting.length > 0, 'les vraies pièces de vie restent contrôlées');
  assert.ok(!lighting.some(m => /^Palier|^Escalier/.test(m)), lighting.join(' | '));
});
