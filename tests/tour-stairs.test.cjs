const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Le moteur de parcours (projectLoader.js) et la normalisation (houseDataCore.js) sont des scripts navigateur.
function engine() {
  const context = { window: {}, console, Math, JSON };
  context.window = context;
  vm.createContext(context);
  for (const file of ['houseDataCore.js', 'projectLoader.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  }
  return context;
}
const { HouseAuto, normalizeHouseData } = engine();

function tourOf(project) {
  const data = JSON.parse(JSON.stringify(project));
  delete data.tourWaypoints; delete data.renderShots;
  normalizeHouseData(data);
  HouseAuto.complete(data);
  return { data, tour: data.tourWaypoints };
}

const verandas = require('../projects/residence-verandas/project.json');

test('Les Vérandas : le parcours monte à l’étage par l’escalier, marche après marche', () => {
  const { data, tour } = tourOf(verandas);
  const fh = data.config.floorHeight;
  const stairIdx = tour.map((wp, i) => wp.stair ? i : -1).filter(i => i >= 0);
  assert.equal(stairIdx.length, 3, 'pied, palier, arrivée');
  const climb = Array.from(stairIdx, i => tour[i].pos[1]); // tableau du contexte de test (pas celui du vm)
  assert.deepEqual([...climb].sort((a, b) => a - b), climb, 'la caméra monte sans redescendre');
  assert.ok(Math.abs(climb[0] - 1.65) < 1e-6 && Math.abs(climb[climb.length - 1] - (fh + 1.65)) < 1e-6);
  // Aucune pièce de l'étage n'est visitée avant d'avoir pris l'escalier.
  const upperRooms = new Set(data.rooms.filter(r => r.level === 1).map(r => r.id));
  const firstUpper = tour.findIndex(wp => upperRooms.has(wp.room));
  assert.ok(firstUpper > stairIdx[0], 'étage après la montée');
  // Les caméras d'une pièce sont à hauteur d'yeux de son propre niveau.
  for (const wp of tour.filter(w => w.room)) {
    const level = data.rooms.find(r => r.id === wp.room).level;
    assert.ok(Math.abs(wp.pos[1] - (level * fh + 1.65)) < 1e-6, `${wp.label} à ${wp.pos[1]}`);
  }
});

test('Les Vérandas : l’escalier a ses deux extrémités dans des pièces réelles', () => {
  const data = JSON.parse(JSON.stringify(verandas));
  normalizeHouseData(data);
  const [edge] = HouseAuto.stairEdges(data);
  assert.ok(edge, 'un passage par escalier');
  const levels = [edge.a, edge.b].map(id => data.rooms.find(r => r.id === id).level).sort();
  assert.deepEqual(levels, [0, 1]);
});

// Plain-pied minimal, comme après l'import d'un PDF : deux pièces, une porte d'entrée, une porte intérieure.
const plainPied = {
  meta: { name: 'Test plain-pied' }, config: { wallHeight: 2.8, floorHeight: 3 },
  walls: [
    { from: [0, 0], to: [10, 0], type: 'ext', thick: 0.25, openings: [{ type: 'window', at: 3, w: 1.2, h: 1.25, sill: 0.95 }] },
    { from: [10, 0], to: [10, 6], type: 'ext', thick: 0.25, openings: [] },
    { from: [10, 6], to: [0, 6], type: 'ext', thick: 0.25, openings: [{ type: 'door', at: 7, w: 0.95, h: 2.1, entry: true }] },
    { from: [0, 6], to: [0, 0], type: 'ext', thick: 0.25, openings: [] },
    { from: [5, 0], to: [5, 6], type: 'int', thick: 0.15, openings: [{ type: 'door', at: 3, w: 0.85, h: 2.1 }] }
  ],
  rooms: [
    { id: 'sejour', name: 'SÉJOUR', bounds: { xMin: 0.12, xMax: 4.92, zMin: 0.12, zMax: 5.88 }, habitable: true },
    { id: 'chambre', name: 'CHAMBRE', bounds: { xMin: 5.08, xMax: 9.88, zMin: 0.12, zMax: 5.88 }, habitable: true }
  ]
};

test('Plain-pied sans escalier : parcours complet au rez-de-chaussée, sans étape d’escalier', () => {
  const { tour } = tourOf(plainPied);
  assert.equal(tour.filter(wp => wp.stair).length, 0);
  const visited = tour.filter(wp => wp.room).map(wp => wp.room);
  assert.deepEqual([...new Set(visited)].sort(), ['chambre', 'sejour']);
  assert.ok(tour.filter(wp => wp.pos[1] < 3).every(wp => Math.abs(wp.pos[1] - 1.65) < 1e-6), 'tout à hauteur d’yeux du RDC');
});

test('Une trémie trop petite ne crée ni escalier ni passage impossible', () => {
  assert.equal(HouseAuto.stairFits({ level: 1, xMin: 0, xMax: 1.5, zMin: 0, zMax: 2 }), false);
  assert.equal(HouseAuto.stairFits({ level: 1, xMin: 0, xMax: 3, zMin: 0, zMax: 2.1 }), true);
  const project = JSON.parse(JSON.stringify(plainPied));
  project.stairwells = [{ level: 1, xMin: 1, xMax: 2, zMin: 1, zMax: 2 }];
  normalizeHouseData(project);
  assert.equal(HouseAuto.stairEdges(project).length, 0);
});

test('Une porte de balcon à l’étage ne relie pas l’étage au jardin', () => {
  const project = JSON.parse(JSON.stringify(plainPied));
  project.walls.push({ from: [0, 0], to: [10, 0], type: 'ext', thick: 0.25, level: 1, openings: [{ type: 'door', at: 5, w: 0.9, h: 2.1 }] });
  project.rooms.push({ id: 'chambre-haute', name: 'CHAMBRE HAUTE', level: 1, bounds: { xMin: 0.12, xMax: 9.88, zMin: 0.12, zMax: 5.88 }, habitable: true });
  const { tour } = tourOf(project);
  // Sans escalier, la pièce de l'étage reste atteignable (en fin de visite) mais aucun seuil ne passe par le jardin.
  const doorSteps = tour.filter(wp => !wp.room && wp.label === 'CHAMBRE HAUTE');
  assert.equal(doorSteps.length, 0, 'pas de chemin fictif par l’extérieur');
});

test('L’empreinte du plan change dès qu’une porte bouge, pas autrement', () => {
  const a = JSON.parse(JSON.stringify(plainPied)), b = JSON.parse(JSON.stringify(plainPied));
  assert.equal(HouseAuto.geometryVersion(a), HouseAuto.geometryVersion(b));
  b.walls[4].openings[0].at = 3.4;
  assert.notEqual(HouseAuto.geometryVersion(a), HouseAuto.geometryVersion(b));
  const c = JSON.parse(JSON.stringify(plainPied)); c.meta.name = 'Autre nom';
  assert.equal(HouseAuto.geometryVersion(a), HouseAuto.geometryVersion(c), 'le nom ne compte pas');
  assert.match(HouseAuto.geometryVersion(a), /^[0-9a-f]{8}$/);
});

test('L’escalier 3D n’est plus réservé à un seul projet', () => {
  const scene = fs.readFileSync(path.join(__dirname, '../js/scene.js'), 'utf8');
  assert.doesNotMatch(scene, /slug === 'residence-verandas' && HOUSE_DATA\.stairwells/);
  assert.match(scene, /stairFits/);
});
