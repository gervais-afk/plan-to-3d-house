const assert = require('node:assert/strict');
const { test } = require('node:test');
const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
const Premium = require('../js/clientBrochurePremium.js');
const villa = require('../projects/villa-serena/project.json');

/** Génère le catalogue sans téléchargement ; collecte le texte, les couleurs, les images placées et les propriétés. */
async function render(project, options = {}, studio = null) {
  const written = [], fills = new Set(), placedImages = [];
  let properties = null;
  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const text = this.text.bind(this), fill = this.setFillColor.bind(this);
      const addImage = this.addImage.bind(this), setProps = this.setProperties.bind(this);
      this.text = (value, ...rest) => { written.push(...(Array.isArray(value) ? value : [value])); return text(value, ...rest); };
      this.setFillColor = (...c) => { fills.add(typeof c[0] === 'string' ? c[0].toLowerCase() : '#' + c.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('')); return fill(...c); };
      this.addImage = (img, fmt, x, y, w, h, ...rest) => { placedImages.push({ fmt, x, y, w, h }); return addImage(img, fmt, x, y, w, h, ...rest); };
      this.setProperties = props => { properties = props; return setProps(props); };
    }
  }
  const doc = await Premium.exportPDF(project, studio, null, () => {}, { JsPDF: SpyPDF, save: false, ...options });
  return { doc, all: written.join('\n'), fills, placedImages, properties };
}

test('Catalogue premium : setStyle choisit le style, Agence par défaut', () => {
  assert.deepEqual(Object.keys(Premium.STYLES), ['agence', 'luxury', 'industrial']);
  assert.equal(Premium.setStyle('luxury'), 'luxury');
  assert.equal(Premium.getStyle(), 'luxury');
  assert.equal(Premium.setStyle('inconnu'), 'agence');
  assert.equal(Premium.setStyle('modern'), 'agence');
});

for (const [style, palette] of Object.entries(Premium.STYLES)) {
  test(`Catalogue premium : le style ${palette.label} colore réellement le PDF`, async () => {
    const { doc, all, fills } = await render(villa, { style });
    assert.equal(doc.getNumberOfPages(), 2);
    assert.ok(fills.has(palette.primary), `couleur principale ${palette.primary} absente`);
    assert.ok(fills.has(palette.paper), `fond ${palette.paper} absent`);
    for (const [other, otherPalette] of Object.entries(Premium.STYLES)) {
      if (other !== style) assert.ok(!fills.has(otherPalette.primary), `couleur du style ${other} présente`);
    }
    assert.ok(all.includes(`Style ${palette.label}`));
  });
}

test('Catalogue premium : sans studio 3D, le plan et le programme remplacent les vues', async () => {
  const { all } = await render(villa, { style: 'agence' });
  // La plus grande pièce habitable du rez-de-chaussée ouvre le programme (dérivé du projet, qui évolue).
  const first = Premium.summary(villa).rooms.filter(r => !r.level && r.habitable !== false).sort((a, b) => b.area - a.area)[0].name;
  for (const expected of ['VILLA SERENA', 'Plan du rez-de-chaussée', 'Programme des espaces', first, 'SURFACE HABITABLE']) {
    assert.ok(all.includes(expected), `« ${expected} » absent`);
  }
  assert.doesNotMatch(all, /undefined|NaN|Pas de vue intérieure/);
  assert.doesNotMatch(all, /[ ≈]|\p{Extended_Pictographic}/u);
});

test('Catalogue premium : surfaces calculées depuis la géométrie de l\'éditeur', () => {
  const info = Premium.summary(villa);
  assert.equal(info.rooms.length, villa.rooms.length);
  // Même surface que le métré de l'estimation (géométrie des pièces), quelle que soit la version de la villa.
  const CostEstimate = require('../js/costEstimate.js');
  const habitableRooms = villa.rooms.filter(r => r.habitable !== false);
  const expected = habitableRooms.reduce((sum, r) => sum + CostEstimate.roomArea(r), 0);
  assert.ok(Math.abs(info.habitable - expected) < 0.01, `surface habitable ${info.habitable} ≠ ${expected}`);
  assert.equal(info.habitableCount, habitableRooms.length);
});

test('Catalogue premium : les options du dialogue sont respectées', async () => {
  const { all } = await render(villa, { includeStats: false, includePlan: false });
  assert.ok(!all.includes('SURFACE HABITABLE'));
  assert.ok(!all.includes('Plan de masse'));
  assert.ok(all.includes('Programme des espaces'));
});

test('Catalogue premium : un projet sans pièces est refusé clairement', async () => {
  await assert.rejects(Premium.exportPDF({ rooms: [] }, null, null, () => {}, { JsPDF: jsPDF, save: false }), /sans pièces/);
});

test('Catalogue premium : les images IA du projet illustrent la couverture et les intérieurs', async () => {
  const fs = require('node:fs');
  const image = (file, label) => ({ data: `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`, label, width: 1376, height: 768, ai: true });
  const renders = 'projects/villa-serena/generated/renders/';
  const images = { facade: image(`${renders}facade-sud.jpg`, 'Façade sud'), interiors: [image(`${renders}sejour.jpg`, 'Séjour'), image(`${renders}cuisine.jpg`, 'Cuisine')] };
  const { all, properties } = await render(villa, { images });
  for (const expected of ['Façade sud', 'Vues intérieures', 'Séjour', 'Cuisine', 'générées par IA', 'non contractuelles']) {
    assert.ok(all.includes(expected), `« ${expected} » absent`);
  }
  assert.equal(properties.creator, 'ArchiCam Studio');
  assert.ok(!all.includes('Programme des espaces'), 'les vues remplacent le programme');
  assert.ok(!all.includes('Plan du rez-de-chaussée'), 'la façade remplace le plan en couverture');
});

test('Catalogue premium : perspective-01 (1080×720) sans déformation et mention architecte déclarée uniquement', async () => {
  const fs = require('node:fs');
  const verandas = require('../projects/residence-verandas/project.json');
  const data = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  const declared = await render(verandas, {
    images: { facade: { id: 'perspective-01', file: 'projects/residence-verandas/generated/images/perspective-01.jpg', label: 'Façade et perron', source: 'architect', data }, interiors: [] }
  });
  assert.equal(declared.placedImages.length, 1);
  assert.ok(Math.abs((declared.placedImages[0].w / declared.placedImages[0].h) - (1080 / 720)) < 1e-4, 'ratio 1080×720 conservé');
  assert.ok(declared.all.includes('Perspective de l\'architecte'));
  assert.ok(!declared.all.includes('générées par IA'));
  assert.ok(!declared.all.includes('non contractuelle'));

  const undeclared = await render(villa, {
    images: { facade: { label: 'Façade', data }, interiors: [] }
  });
  assert.ok(undeclared.all.includes('Illustration du projet'));
  assert.ok(!undeclared.all.includes('Perspective de l\'architecte'));
  assert.ok(!undeclared.all.includes('non contractuelle'));
});

test('Catalogue premium : la capture 3D de couverture (1600×800) n’est pas étirée et porte la mention 3D', async () => {
  const fs = require('node:fs');
  const prevHouseAuto = global.HouseAuto;
  global.HouseAuto = {
    bbox: () => ({ xMin: 0, xMax: 10, zMin: 0, zMax: 8, cx: 5, cz: 4, w: 10, d: 8 }),
    findEntry: () => ({ out: { x: 0, z: 1 } }),
    viewShot: () => ({ pos: [0, 5, 10], look: [5, 1, 4], fov: 50 }),
    roomShot: () => ({ pos: [2, 1.6, 2], look: [4, 1.4, 4], fov: 55 })
  };
  try {
    const sample = `data:image/jpeg;base64,${fs.readFileSync('projects/villa-serena/generated/renders/facade-sud.jpg').toString('base64')}`;
    const studio = { hs: { levelOffset: () => 0 }, capture: () => sample };
    const { all, placedImages } = await render(villa, { includeInterior: false }, studio);
    assert.equal(placedImages.length, 1);
    assert.ok(Math.abs((placedImages[0].w / placedImages[0].h) - (1600 / 800)) < 1e-4, `capture 3D étirée : ${placedImages[0].w / placedImages[0].h} ≠ 2`);
    assert.ok(all.includes('Capture de la maquette 3D'));
    assert.ok(!all.includes('non contractuelle'));
  } finally {
    if (prevHouseAuto === undefined) delete global.HouseAuto;
    else global.HouseAuto = prevHouseAuto;
  }
});

test('Catalogue premium : la statistique compte les pièces principales', () => {
  assert.equal(Premium.summary(require('../projects/residence-verandas/project.json')).mainRooms, 7);
  assert.equal(Premium.summary(villa).mainRooms, 5);
});
