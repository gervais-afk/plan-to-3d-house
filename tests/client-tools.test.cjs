const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const file = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const model = runInNewContext([
  'const window = {}; const location = { search: "" }; const localStorage = { getItem: () => null };',
  'class XMLHttpRequest { open() {} send() {} status = 404; }',
  file('js/data.js'), file('js/projectLoader.js'), file('js/solarStudy.js'),
  '({ HouseAuto, SolarStudy, normalizeHouseData, roomContains, config: HOUSE_DATA.config });'
].join('\n'), { URLSearchParams, console: { warn() {} } });

const { HouseAuto, SolarStudy, normalizeHouseData, roomContains, config } = model;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);

test('Le soleil passe de l’est à l’ouest ; le midi est haut et le soir allume les lampes', () => {
  const morning = SolarStudy.sample(7), noon = SolarStudy.sample(13), evening = SolarStudy.sample(19), night = SolarStudy.sample(20);
  assert.ok(morning.x > 0.9 && morning.warmth > 0.5 && morning.dusk === 0);
  assert.ok(noon.y > 0.9 && noon.warmth === 0 && noon.light === 1);
  assert.ok(evening.x < -0.9 && evening.y < morning.y && evening.dusk > 0.5);
  assert.ok(night.light === 0 && night.dusk === 1);
  assert.equal(SolarStudy.format(7.25), '07h15');
  assert.equal(SolarStudy.sample(22).dusk, 1);
});

test('Le nord optionnel oriente le soleil dans le même repère que le plan', () => {
  const data = { config: { northDegrees: -270 } };
  const north = HouseAuto.northAngle(data);
  assert.equal(north, 90);
  const initial = SolarStudy.sample(7), rotated = SolarStudy.sample(7, north);
  near(rotated.x, -initial.z);
  near(rotated.z, initial.x);
  near(rotated.y, initial.y);
});

test('La façade utilise la normale vers l’extérieur même après inversion du mur et à l’étage', () => {
  const wall = { from: [8, 11], to: [12, 11], level: 1, type: 'ext', thick: 0.24 };
  const data = {
    config: { ...config }, walls: [wall], rooms: [
      { id: 'upper', name: 'Étage', level: 1, bounds: { xMin: 8, xMax: 12, zMin: 11, zMax: 15 }, habitable: true },
      { id: 'lower', name: 'RDC', level: 0, bounds: { xMin: 8, xMax: 12, zMin: 7, zMax: 11 }, habitable: true }
    ]
  };
  normalizeHouseData(data);
  assert.equal(HouseAuto.exteriorSide(data, wall), -1);
  [wall.from, wall.to] = [wall.to, wall.from];
  assert.equal(HouseAuto.exteriorSide(data, wall), 1);
});

test('Les surfaces et cadrages dérivent du polygone normalisé, pas de la surface saisie', () => {
  const data = JSON.parse(file('projects/test-l/project.json'));
  data.config = { ...config, ...data.config };
  data.rooms[0].surface = '999 m²';
  normalizeHouseData(data);
  HouseAuto.complete(data);
  const room = data.rooms[0];
  assert.equal(room.area, 62);
  assert.equal(data.totals.habitable, 80);
  assert.ok(roomContains(room, room.center.x, room.center.z));
  const { cam } = HouseAuto.roomPose(data, room);
  assert.ok(roomContains(room, cam.x, cam.z));
  assert.ok(data.dimensions.length > 0);
  assert.ok(data.renderShots.some(shot => shot.room === room.id));
});
