const assert = require('node:assert/strict');
const { test } = require('node:test');
const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
const APSGenerator = require('../js/apsGenerator.js');
const CostEstimate = require('../js/costEstimate.js');
const villa = require('../projects/villa-serena/project.json');

// Termes du logiciel lui-même qui n'ont rien à faire dans l'APS d'une maison.
const SOFTWARE_TERMS = /tests? unitaires|Vectorization|BIMExport|Modules? stratégiques|PDF Premium|Déploiement production|HTTPS|€/;

/** Génère le PDF sans le télécharger et récupère tout le texte écrit. */
async function render(project, options = {}) {
  const written = [];
  // jsPDF définit text() sur chaque instance : on l'enveloppe après construction.
  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const original = this.text.bind(this);
      this.text = (value, ...rest) => {
        written.push(...(Array.isArray(value) ? value : [value]));
        return original(value, ...rest);
      };
    }
  }
  const doc = await APSGenerator.generateAPS(project, null, null, { JsPDF: SpyPDF, save: false, ...options });
  return { doc, all: written.join('\n') };
}

test('APS : le programme reprend les pièces et surfaces du projet', () => {
  const content = APSGenerator.buildContent(villa);
  assert.equal(content.name, 'VILLA SERENA');
  assert.equal(content.levelsSummary, 'Plain-pied');
  assert.equal(content.roomCount, villa.rooms.length);
  const names = content.levels.flatMap(l => l.rooms.map(r => r.name));
  for (const room of villa.rooms) assert.ok(names.includes(room.name), `${room.name} absent du programme`);
  const sejour = content.levels[0].rooms.find(r => r.id === 'living');
  assert.ok(Math.abs(sejour.area - CostEstimate.roomArea(villa.rooms.find(r => r.id === 'living'))) < 1e-9);
});

test('APS : l\'estimation vient de CostEstimate, en FCFA', () => {
  const content = APSGenerator.buildContent(villa);
  const estimate = CostEstimate.estimate(villa, villa.estimate);
  assert.equal(content.finance.total.mid, CostEstimate.formatXAF(estimate.total.mid));
  assert.equal(content.finance.lots.length, estimate.lots.length);
  assert.match(content.finance.total.range, /FCFA.*à.*FCFA/);
  assert.doesNotMatch(JSON.stringify(content), /€/);
});

test('APS : la durée des travaux suit la surface et les niveaux', () => {
  assert.equal(APSGenerator.worksMonths(40, 1), 6);
  assert.equal(APSGenerator.worksMonths(150, 1), 10);
  assert.equal(APSGenerator.worksMonths(150, 2), 12);
  assert.equal(APSGenerator.worksMonths(1000, 3), 24);
});

test('APS : les contrôles d\'habitabilité du plan sont repris', () => {
  const content = APSGenerator.buildContent(villa);
  assert.ok(content.findings.some(f => /SÉJOUR/.test(f.message)), 'remarque d\'éclairement du séjour attendue');
});

test('APS : le PDF parle de la maison, pas du logiciel', async () => {
  const { doc, all } = await render(villa, { date: new Date('2026-11-24T12:00:00Z') });
  assert.ok(doc.getNumberOfPages() >= 6);
  assert.doesNotMatch(all, SOFTWARE_TERMS);
  for (const expected of ['VILLA SERENA', 'CHAMBRE PARENTALE', 'SÉJOUR', 'FCFA', 'Douala', 'Bon pour accord', '24 novembre 2026']) {
    assert.ok(all.includes(expected), `« ${expected} » absent du PDF`);
  }
  assert.doesNotMatch(all, /[ ≈→]|\p{Extended_Pictographic}/u, 'caractères non imprimables par les polices standard');
});

test('APS : un projet à étage et un long programme passent sur plusieurs pages', async () => {
  const rooms = [];
  for (let level = 0; level < 2; level++) {
    for (let i = 0; i < 22; i++) {
      rooms.push({ id: `r${level}-${i}`, name: `PIÈCE ${level}.${i}`, level, habitable: true, bounds: { xMin: i, xMax: i + 1, zMin: 0, zMax: 3 } });
    }
  }
  const walls = [0, 1].map(level => ({ level, from: [0, 0], to: [22, 0], type: 'ext', thick: 0.2 }));
  const project = { meta: { name: 'Immeuble R+1' }, config: { wallHeight: 3 }, walls, rooms };
  const content = APSGenerator.buildContent(project);
  assert.equal(content.levelsSummary, 'R+1 (2 niveaux)');
  const { doc, all } = await render(project);
  assert.ok(all.includes('PIÈCE 1.21'), 'la dernière pièce doit figurer dans le programme');
  assert.ok(all.includes('(suite)'));
  assert.ok(doc.getNumberOfPages() >= 7);
});

test('APS : un projet sans pièces est refusé clairement', async () => {
  await assert.rejects(APSGenerator.generateAPS({}, null, null, { JsPDF: jsPDF, save: false }), /sans pièces/);
});

test('APS : la façade photoréaliste du projet illustre la couverture', async () => {
  const fs = require('node:fs');
  const coverImage = { data: `data:image/jpeg;base64,${fs.readFileSync('projects/villa-serena/generated/renders/facade-sud.jpg').toString('base64')}`, width: 1376, height: 768 };
  const { all } = await render(villa, { coverImage });
  assert.ok(all.includes('générée par IA'));
  const without = await render(villa);
  assert.ok(!without.all.includes('générée par IA'));
});
