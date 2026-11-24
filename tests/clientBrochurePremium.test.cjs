const assert = require('node:assert/strict');
const { test } = require('node:test');
const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
const Premium = require('../js/clientBrochurePremium.js');
const villa = require('../projects/villa-serena/project.json');

/** Génère le catalogue sans téléchargement ; collecte le texte et les couleurs de remplissage. */
async function render(project, options = {}) {
  const written = [], fills = new Set();
  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const text = this.text.bind(this), fill = this.setFillColor.bind(this);
      this.text = (value, ...rest) => { written.push(...(Array.isArray(value) ? value : [value])); return text(value, ...rest); };
      this.setFillColor = (...c) => { fills.add(typeof c[0] === 'string' ? c[0].toLowerCase() : '#' + c.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('')); return fill(...c); };
    }
  }
  const doc = await Premium.exportPDF(project, null, null, () => {}, { JsPDF: SpyPDF, save: false, ...options });
  return { doc, all: written.join('\n'), fills };
}

test('Catalogue premium : setStyle choisit le style, Moderne par défaut', () => {
  assert.deepEqual(Object.keys(Premium.STYLES), ['modern', 'luxury', 'industrial']);
  assert.equal(Premium.setStyle('luxury'), 'luxury');
  assert.equal(Premium.getStyle(), 'luxury');
  assert.equal(Premium.setStyle('inconnu'), 'modern');
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
  const { all } = await render(villa, { style: 'modern' });
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
  const image = (file, label) => ({ data: `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`, label, width: 1376, height: 768 });
  const renders = 'projects/villa-serena/generated/renders/';
  const images = { facade: image(`${renders}facade-sud.jpg`, 'Façade sud'), interiors: [image(`${renders}sejour.jpg`, 'Séjour'), image(`${renders}cuisine.jpg`, 'Cuisine')] };
  const { all } = await render(villa, { images });
  for (const expected of ['Façade sud', 'Vues intérieures', 'Séjour', 'Cuisine', 'générées par IA']) {
    assert.ok(all.includes(expected), `« ${expected} » absent`);
  }
  assert.ok(!all.includes('Programme des espaces'), 'les vues remplacent le programme');
  assert.ok(!all.includes('Plan du rez-de-chaussée'), 'la façade remplace le plan en couverture');
});
