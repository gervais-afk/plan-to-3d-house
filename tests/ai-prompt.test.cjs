const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AiPrompt = require('../js/aiPrompt.js');

// SolarStudy est un script navigateur (sans module.exports) : on l'évalue dans un contexte isolé.
const solarContext = {};
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '../js/solarStudy.js'), 'utf8')}\nthis.SolarStudy = SolarStudy;`, solarContext);
const { SolarStudy } = solarContext;

const sejour = { id: 'r3', name: 'Séjour véranda', floorType: 'tiles' };
const FIDELITY = /Preserve the original camera viewpoint, crop, perspective/;

test('Le socle de fidélité géométrique est toujours en tête du prompt', () => {
  for (const kind of ['interior', 'exterior']) {
    const { prompt } = AiPrompt.build({ kind, room: sejour });
    assert.match(prompt, FIDELITY);
    assert.ok(prompt.indexOf('Preserve') < 200, 'la contrainte de fidélité ouvre le prompt');
    assert.doesNotMatch(prompt, /non-contractual|illustrative render/i);
    assert.match(prompt, /watermarks/);
  }
  assert.match(AiPrompt.build({ kind: 'plan2d' }).prompt, /exact geometry of all walls/);
});

test('La pièce et la finition choisie par le client apparaissent dans le prompt et les tags', () => {
  const { prompt, tags } = AiPrompt.build({ kind: 'interior', room: sejour, finishes: { floor: 'oak' } });
  assert.match(prompt, /living room/);
  assert.match(prompt, /Séjour véranda/);
  assert.match(prompt, /light natural oak parquet/);
  assert.match(prompt, /off-white ceiling/);
  assert.equal(tags.floor, 'oak');
  assert.equal(tags.use, 'living');
  assert.equal(tags.room, 'r3');
});

test('Sans choix du client, le sol vient du modèle (room.floorType)', () => {
  const { prompt, tags } = AiPrompt.build({ kind: 'interior', room: { id: 'r1', name: 'Cuisine', floorType: 'stone' } });
  assert.match(prompt, /kitchen/);
  assert.match(prompt, /limestone/);
  assert.equal(tags.floor, 'stone');
});

test('Le matin la lumière vient de l’est, le soir de l’ouest', () => {
  const morning = AiPrompt.sunAt(8, null, SolarStudy);
  const evening = AiPrompt.sunAt(17.5, null, SolarStudy);
  assert.match(AiPrompt.build({ kind: 'interior', room: sejour, sun: morning }).prompt, /from the (north-|south-)?east/);
  assert.match(AiPrompt.build({ kind: 'interior', room: sejour, sun: evening }).prompt, /from the (north-|south-)?west/);
});

test('Avec une géolocalisation, le soleil réel (NOAA) pilote la direction et la nuit', () => {
  const douala = { lat: 4.05, lon: 9.7, utc: 1, date: '2026-11-22', north: 0 };
  const morning = AiPrompt.sunAt(8, douala, SolarStudy);
  assert.ok(morning.azimuth > 90 && morning.azimuth < 135, `azimut du matin ${morning.azimuth}`);
  const night = AiPrompt.sunAt(21, douala, SolarStudy);
  assert.ok(night.altitude < 0);
  assert.match(AiPrompt.build({ kind: 'exterior', sun: night }).prompt, /Blue-hour/);
});

test('Le prompt est identique pour les mêmes données', () => {
  const input = { kind: 'interior', room: sejour, finishes: { floor: 'tile' }, sun: AiPrompt.sunAt(16, null, SolarStudy), city: 'yaounde', planVersion: 'abc' };
  assert.deepEqual(AiPrompt.build(input), AiPrompt.build(structuredClone(input)));
});

test('Aucune finition ni ville inconnue n’est inventée', () => {
  const { prompt, tags } = AiPrompt.build({ kind: 'exterior', finishes: { floor: 'marbre-or', facade: 'titane' }, city: 'paris' });
  assert.doesNotMatch(prompt, /marbre-or|titane|paris/i);
  assert.equal(tags.facade, null);
  assert.equal(tags.city, null);
  // Sans finition choisie, la couleur de la façade de référence est conservée (pas d'enduit imposé).
  assert.match(prompt, /facade colour and finish exactly as in the reference/);
  assert.doesNotMatch(prompt, /warm mineral render/);
});

test('La façade choisie et le climat local pilotent un rendu extérieur', () => {
  const { prompt, tags } = AiPrompt.build({ kind: 'exterior', finishes: { facade: 'timber' }, city: 'douala' });
  assert.match(prompt, /timber cladding/);
  assert.match(prompt, /Douala/);
  assert.match(prompt, /palm|mango/i);
  assert.equal(tags.city, 'douala');
});

test('La version du plan change dès que la géométrie change', () => {
  const plan = { walls: [{ from: [0, 0], to: [5, 0] }], rooms: [{ id: 'a', bounds: { xMin: 0 }, level: 0 }] };
  const moved = structuredClone(plan); moved.walls[0].to = [5.2, 0];
  assert.equal(AiPrompt.planVersion(plan), AiPrompt.planVersion(structuredClone(plan)));
  assert.notEqual(AiPrompt.planVersion(plan), AiPrompt.planVersion(moved));
  assert.match(AiPrompt.planVersion(plan), /^[0-9a-f]{8}$/);
});

test('Rendu extérieur : arbres, ombres et ouvertures protégés (écarts constatés lors d’essais réels)', () => {
  const { prompt } = AiPrompt.build({ kind: 'exterior', city: 'douala' });
  assert.match(prompt, /do not remove, add or move trees/);
  assert.match(prompt, /every shadow must be cast by an object visible/);
  assert.match(prompt, /open bay stays open, a door stays a door/);
  assert.match(prompt, /Do not place furniture, beds, rugs, lamps or curtains outdoors/);
});
