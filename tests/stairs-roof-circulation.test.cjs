const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function engine() {
  const context = { console, Math, JSON };
  context.window = context;
  vm.createContext(context);
  for (const file of ['houseDataCore.js', 'projectLoader.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
  }
  return context;
}
const { HouseAuto, normalizeHouseData } = engine();
const plain = value => JSON.parse(JSON.stringify(value)); // objets du contexte vm → objets du test
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------------------------- escaliers
const well = { level: 1, xMin: 0, xMax: 4, zMin: 0, zMax: 3 };

for (const stairType of ['return', 'straight', 'quarter', 'winder', 'helical']) {
  for (const dir of ['-x', '+x', '-z', '+z']) {
    test(`Escalier ${stairType} ${dir} : 16 marches qui montent, toutes dans la trémie`, () => {
      const s = { ...well, stairType, dir, ...(dir.endsWith('z') ? { xMax: 3, zMax: 4 } : {}) };
      if (stairType === 'straight') Object.assign(s, dir.endsWith('x') ? { xMax: 4, zMax: 1.2 } : { xMax: 1.2, zMax: 4 });
      assert.ok(HouseAuto.stairFits(s), 'trémie suffisante');
      const g = plain(HouseAuto.stairGeometry(s, 3));
      const treads = g.flights.flatMap(f => f.treads);
      assert.equal(treads.length, 16);
      treads.forEach((r, i) => {
        assert.ok(near(r.y, (i + 1) * 3 / 16), `marche ${i + 1}`);
        assert.ok(r.xMin >= s.xMin - 1e-6 && r.xMax <= s.xMax + 1e-6 && r.zMin >= s.zMin - 1e-6 && r.zMax <= s.zMax + 1e-6, `marche ${i + 1} hors trémie`);
      });
      const ys = g.path.map(p => p.y);
      assert.deepEqual([...ys].sort((a, b) => a - b), ys, 'trajectoire montante');
      assert.ok(near(ys[0], 0) && near(ys[ys.length - 1], 3));
      // Pied et arrivée hors du vide de la trémie (on y accède depuis une pièce).
      const outside = p => p.x < s.xMin || p.x > s.xMax || p.z < s.zMin || p.z > s.zMax;
      assert.ok(outside(g.bottom), 'pied hors trémie');
      if (stairType !== 'return') assert.ok(outside(g.top), 'arrivée hors trémie');
      // Marches tournantes : chaque polygone reste dans la trémie.
      treads.filter(r => r.poly).forEach(r => r.poly.forEach(([x, z]) => assert.ok(x >= s.xMin - 1e-6 && x <= s.xMax + 1e-6 && z >= s.zMin - 1e-6 && z <= s.zMax + 1e-6, 'sommet hors trémie')));
      if (stairType === 'winder') assert.equal(treads.filter(r => r.poly).length, 3, 'trois marches dansantes');
      if (stairType === 'helical') assert.equal(treads.filter(r => r.poly).length, 16, 'seize secteurs');
      // La visite libre retrouve la hauteur de chaque marche.
      treads.forEach(r => {
        // Point de mesure : barycentre (une marche dansante triangulaire ne contient pas le centre de son emprise).
        const cx = r.poly ? r.poly.reduce((sum, p) => sum + p[0], 0) / r.poly.length : (r.xMin + r.xMax) / 2;
        const cz = r.poly ? r.poly.reduce((sum, p) => sum + p[1], 0) / r.poly.length : (r.zMin + r.zMax) / 2;
        const hit = HouseAuto.stairFloorAt(s, cx, cz, 3, 0);
        assert.ok(hit && near(hit.y, r.y), `hauteur sous la marche à ${r.y}`);
      });
    });
  }
}

test('Escalier à retour par défaut : géométrie identique à l’escalier historique des Vérandas', () => {
  const s = { level: 1, xMin: -5.7, xMax: -2.75, zMin: -1.7, zMax: 0.4 };
  const g = plain(HouseAuto.stairGeometry(s, 3));
  const width = (s.zMax - s.zMin - 0.12) / 2, tread = (s.xMax - s.xMin - 0.84) / 8;
  g.flights[0].treads.forEach((r, i) => {
    assert.ok(near((r.xMin + r.xMax) / 2, s.xMax - (i + 0.5) * tread));
    assert.ok(near((r.zMin + r.zMax) / 2, s.zMax - width / 2));
  });
  assert.ok(near(g.bottom.x, s.xMax + 0.42) && near(g.top.x, s.xMax + 0.55));
});

test('Trémies trop petites refusées selon le type', () => {
  assert.equal(HouseAuto.stairFits({ level: 1, xMin: 0, xMax: 3, zMin: 0, zMax: 1, stairType: 'straight' }), false, 'droit trop court');
  assert.equal(HouseAuto.stairFits({ level: 1, xMin: 0, xMax: 2, zMin: 0, zMax: 2, stairType: 'quarter' }), false, 'quart tournant trop étroit');
  assert.equal(HouseAuto.stairFits({ level: 1, xMin: 0, xMax: 4, zMin: 0, zMax: 1.1, stairType: 'straight' }), true);
});

// ---------------------------------------------------------------------------------------------- toiture
const box = (rooms, extra = {}) => {
  const walls = [];
  rooms.forEach(r => {
    const { xMin, xMax, zMin, zMax } = r.bounds;
    walls.push({ from: [xMin, zMin], to: [xMax, zMin], type: 'ext', thick: 0.25, openings: [] }, { from: [xMax, zMin], to: [xMax, zMax], type: 'ext', thick: 0.25, openings: [] },
      { from: [xMax, zMax], to: [xMin, zMax], type: 'ext', thick: 0.25, openings: [] }, { from: [xMin, zMax], to: [xMin, zMin], type: 'ext', thick: 0.25, openings: [] });
  });
  const data = { meta: { name: 'T' }, config: { wallHeight: 2.8, floorHeight: 3, ...extra.config }, walls, rooms, canopies: extra.canopies || [] };
  normalizeHouseData(data);
  return data;
};

test('Sans toiture tracée, le défaut est un toit-terrasse : aucun volume inventé', () => {
  const [roof] = plain(HouseAuto.autoRoof(box([{ id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 12, zMin: 0, zMax: 8 }, habitable: true }])));
  assert.equal(roof.type, 'slab');
  assert.ok(roof.auto && roof.y === 2.8);
});

test('Style « 4 pans » : faîtage dans le sens long, posé sur les murs, avec débord', () => {
  const data = box([{ id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 12, zMin: 0, zMax: 8 }, habitable: true }], { config: { roofStyle: 'hip' } });
  const [roof] = plain(HouseAuto.autoRoof(data));
  assert.equal(roof.type, 'hip');
  assert.equal(roof.y, 2.8);
  assert.ok(roof.auto);
  const ridge = roof.vertices.filter(v => v[1] > 0);
  assert.equal(ridge.length, 2);
  assert.ok(near(ridge[0][2], ridge[1][2]), 'faîtage parallèle à X (maison plus large que profonde)');
  assert.ok(roof.xMin < -0.5 && roof.xMax > 12.5, 'débord de toit');
});

test('Emprise en L : toit-terrasse par volume, pas un 4 pans au-dessus du vide', () => {
  const data = box([
    { id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 4 }, habitable: true },
    { id: 'b', name: 'CHAMBRE', bounds: { xMin: 0, xMax: 4, zMin: 4, zMax: 10 }, habitable: true }
  ]);
  const roofs = plain(HouseAuto.autoRoof(data));
  const slabs = roofs.filter(r => !r.parapet);
  assert.equal(slabs.length, 2);
  assert.ok(roofs.every(r => r.type === 'slab' && r.auto));
  assert.ok(roofs.some(r => r.parapet), 'avec acrotère');
});

test('Toiture déjà tracée, style « aucune » ou terrasse ouverte : rien n’est ajouté', () => {
  const rooms = [{ id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 }, habitable: true }];
  assert.equal(HouseAuto.autoRoof(box(rooms, { canopies: [{ type: 'hip', level: 0, xMin: -0.5, xMax: 10.5, zMin: -0.5, zMax: 8.5, rise: 2 }] })).length, 0);
  assert.equal(HouseAuto.autoRoof(box(rooms, { config: { roofStyle: 'none' } })).length, 0);
  assert.equal(plain(HouseAuto.autoRoof(box(rooms, { config: { roofStyle: 'flat' } })))[0].type, 'slab');
  const terrace = box([...rooms, { id: 't', name: 'TERRASSE', bounds: { xMin: 10, xMax: 14, zMin: 0, zMax: 8 }, habitable: false }]);
  const [roof] = plain(HouseAuto.autoRoof(terrace));
  assert.ok(roof.xMax < 11.5, 'la terrasse n’est pas couverte');
});

test('Les Vérandas gardent leur toiture dessinée', () => {
  const data = plain(require('../projects/residence-verandas/project.json'));
  normalizeHouseData(data);
  assert.equal(HouseAuto.autoRoof(data).length, 0);
});

// ---------------------------------------------------------------------------------------------- circulation
test('Vérandas : le dégagement non dessiné relie salle d’eau et chambre invités à l’entrée', () => {
  const data = plain(require('../projects/residence-verandas/project.json'));
  const d = plain(HouseAuto.diagnose(data));
  assert.deepEqual(d.unreachable, [], 'plus aucune pièce isolée');
  const ground = d.voids.filter(v => v.level === 0);
  assert.equal(ground.length, 1, 'un dégagement reconstitué au RDC');
  assert.ok(ground[0].area > 0.5 && ground[0].area < 4, `surface ${ground[0].area}`);
  // Dans le parcours, la chambre invités est atteinte par un seuil, pas par un saut.
  normalizeHouseData(data); delete data.tourWaypoints;
  HouseAuto.complete(data);
  const tour = plain(data.tourWaypoints);
  const view = tour.findIndex(w => w.room === 'r0');
  assert.ok(view > 0 && tour[view - 1].label === 'Chambre invités' && !tour[view - 1].room, 'seuil franchi avant la vue');
});

test('Un vide ouvert sur le jardin n’est pas pris pour un couloir', () => {
  const data = box([{ id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 }, habitable: true }]);
  data.walls[2].openings.push({ type: 'door', at: 3, w: 0.95, h: 2.1, entry: true });
  normalizeHouseData(data);
  assert.equal(HouseAuto.inferCirculation(data).length, 0);
});

test('Le diagnostic signale une pièce sans porte', () => {
  const data = box([
    { id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 }, habitable: true },
    { id: 'b', name: 'CELLIER', bounds: { xMin: 6, xMax: 9, zMin: 0, zMax: 5 }, habitable: true }
  ]);
  data.walls[2].openings.push({ type: 'door', at: 3, w: 0.95, h: 2.1, entry: true });
  const d = plain(HouseAuto.diagnose(data));
  assert.deepEqual(d.unreachable.map(r => r.id), ['b']);
});

test('Toit-terrasse : acrotère sur les bords libres, jamais sur un bord partagé entre deux volumes', () => {
  const data = box([
    { id: 'a', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 }, habitable: true },
    { id: 'b', name: 'CHAMBRE', bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 5 }, habitable: true }
  ]);
  const roofs = plain(HouseAuto.autoRoof(data));
  const walls = roofs.filter(r => r.parapet);
  assert.ok(walls.length >= 4, 'muret sur le pourtour');
  assert.ok(walls.every(w => w.thick === 0.45 && Math.min(w.xMax - w.xMin, w.zMax - w.zMin) <= 0.151), 'muret 45 × 15 cm');
  // Aucun muret ne coupe la jonction des deux volumes (x ≈ 6).
  assert.ok(!walls.some(w => w.xMax - w.xMin < 0.2 && Math.abs((w.xMin + w.xMax) / 2 - 6) < 0.6), 'pas d’acrotère au milieu du toit');
  const slab = roofs.find(r => !r.parapet);
  assert.ok(walls.every(w => w.y === slab.y + slab.thick), 'posé sur la dalle');
});

test('Les projets d’essai couvrent les cinq types d’escaliers sauf le retour (déjà aux Vérandas)', () => {
  const { STAIRS, house } = require('../tools/generate-stair-test-projects.cjs');
  assert.deepEqual(STAIRS.map(s => s.stair.stairType).sort(), ['helical', 'quarter', 'straight', 'winder']);
  for (const spec of STAIRS) {
    const data = plain(house(spec));
    assert.ok(HouseAuto.stairFits(data.stairwells[0]), spec.slug);
    const d = plain(HouseAuto.diagnose(data));
    assert.deepEqual(d.unreachable, [], spec.slug + ' : toutes les pièces reliées');
    normalizeHouseData(data); HouseAuto.complete(data);
    assert.equal(plain(data.tourWaypoints).filter(w => w.stair).length, 3, spec.slug + ' : le parcours prend l’escalier');
  }
});
