const assert = require('node:assert/strict');
const { test } = require('node:test');
const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
const APSGenerator = require('../js/apsGenerator.js');
const CostEstimate = require('../js/costEstimate.js');
const villa = require('../projects/villa-serena/project.json');

// Termes du logiciel lui-même qui n'ont rien à faire dans l'APS d'une maison.
const SOFTWARE_TERMS = /tests? unitaires|Vectorization|BIMExport|Modules? stratégiques|PDF Premium|Déploiement production|HTTPS|€/;

/** Génère le PDF sans le télécharger et récupère tout le texte écrit, les images placées et les propriétés. */
async function render(project, options = {}) {
  const written = [];
  const placedImages = [];
  let properties = null;
  // jsPDF définit text() / addImage() sur chaque instance : on les enveloppe après construction.
  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const originalText = this.text.bind(this);
      this.text = (value, ...rest) => {
        written.push(...(Array.isArray(value) ? value : [value]));
        return originalText(value, ...rest);
      };
      const originalAddImage = this.addImage.bind(this);
      this.addImage = (data, fmt, x, y, w, h, ...rest) => {
        placedImages.push({ fmt, x, y, w, h });
        return originalAddImage(data, fmt, x, y, w, h, ...rest);
      };
      const originalSetProps = this.setProperties.bind(this);
      this.setProperties = props => {
        properties = props;
        return originalSetProps(props);
      };
    }
  }
  const doc = await APSGenerator.generateAPS(project, null, null, { JsPDF: SpyPDF, save: false, ...options });
  return { doc, all: written.join('\n'), placedImages, properties };
}

test('APS : le programme reprend les pièces et surfaces du projet', () => {
  const content = APSGenerator.buildContent(villa);
  assert.equal(content.name, 'VILLA SERENA');
  // Attentes dérivées du projet : Villa Serena évolue dans l'éditeur (plain-pied, puis R+1…).
  const levels = new Set([...villa.rooms.map(r => r.level || 0), ...villa.walls.map(w => w.level || 0)]).size;
  assert.equal(content.levelsSummary, levels > 1 ? `R+${levels - 1} (${levels} niveaux)` : 'Plain-pied');
  assert.equal(content.roomCount, villa.rooms.length);
  const rooms = content.levels.flatMap(l => l.rooms);
  for (const room of villa.rooms) {
    const listed = rooms.find(r => r.id === room.id);
    assert.ok(listed, `${room.name} absent du programme`);
    assert.ok(Math.abs(listed.area - CostEstimate.roomArea(room)) < 1e-9, `surface de ${room.name}`);
  }
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
  const expected = require('../js/habitability.js').check(villa).map(f => f.message);
  assert.ok(expected.length > 0, 'la villa doit avoir au moins une remarque pour que le test ait un sens');
  assert.deepEqual(content.findings.map(f => f.message), expected);
});

test('APS : le PDF parle de la maison, pas du logiciel', async () => {
  const { doc, all } = await render(villa, { date: new Date('2026-11-24T12:00:00Z') });
  assert.ok(doc.getNumberOfPages() >= 6);
  assert.doesNotMatch(all, SOFTWARE_TERMS);
  const city = CostEstimate.CITIES[CostEstimate.estimate(villa, villa.estimate).settings.city].label;
  const roomNames = villa.rooms.slice(0, 4).map(r => r.name);
  for (const expected of ['VILLA SERENA', ...roomNames, 'FCFA', city, 'Bon pour accord', '24 novembre 2026']) {
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

test('APS : la façade photoréaliste IA porte la mention IA non contractuelle et le creator ArchiCam Studio', async () => {
  const fs = require('node:fs');
  const coverImage = {
    data: `data:image/jpeg;base64,${fs.readFileSync('projects/villa-serena/generated/renders/facade-sud.jpg').toString('base64')}`,
    width: 1376,
    height: 768,
    ai: true
  };
  const { all, properties } = await render(villa, { coverImage });
  assert.ok(all.includes('générée par IA'));
  assert.ok(all.includes('non contractuelle'));
  assert.equal(properties.creator, 'ArchiCam Studio');
  const without = await render(villa);
  assert.ok(!without.all.includes('générée par IA'));
  assert.ok(!without.all.includes('non contractuelle'));
});

test('APS : perspective-01 (1080×720) sans dimensions déclarées est placée sans déformation avec la mention architecte', async () => {
  const fs = require('node:fs');
  const verandas = require('../projects/residence-verandas/project.json');
  const data = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  // Aucune width/height passée : le placement doit lire le vrai ratio 1080/720 = 1,5 (jamais 1920/1080).
  const { all, placedImages } = await render(verandas, {
    coverImage: { id: 'perspective-01', file: 'projects/residence-verandas/generated/images/perspective-01.jpg', source: 'architect', data }
  });
  assert.equal(placedImages.length, 1);
  const placed = placedImages[0];
  assert.ok(Math.abs((placed.w / placed.h) - (1080 / 720)) < 1e-4, `ratio déformé : ${placed.w / placed.h} ≠ 1.5`);
  assert.ok(all.includes('Perspective de l\'architecte'));
  assert.ok(!all.includes('générée par IA'));
  assert.ok(!all.includes('non contractuelle'));
});

test('APS : mentions véridiques selon la provenance (capture 3D dans generated/images, origine non déclarée)', async () => {
  const fs = require('node:fs');
  const verandas = require('../projects/residence-verandas/project.json');
  const refData = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/interieur-sejour-reference.jpg').toString('base64')}`;
  const refRes = await render(verandas, {
    coverImage: {
      id: 'sejour-veranda-reference',
      file: 'projects/residence-verandas/generated/images/interieur-sejour-reference.jpg',
      notes: 'Capture issue de la maquette Three.js ; vue de référence, et non photographie ni rendu IA.',
      data: refData
    }
  });
  assert.ok(refRes.all.includes('Capture de la maquette 3D'));
  assert.ok(!refRes.all.includes('Perspective de l\'architecte'));
  assert.ok(!refRes.all.includes('non contractuelle'));

  const unknownRes = await render(villa, { coverImage: { data: refData } });
  assert.ok(unknownRes.all.includes('Illustration du projet'));
  assert.ok(!unknownRes.all.includes('Perspective de l\'architecte'));
  assert.ok(!unknownRes.all.includes('générée par IA'));
  assert.ok(!unknownRes.all.includes('non contractuelle'));
});

test('APS : si les dimensions sont introuvables, cadrage contain sans hypothèse 16:9', async () => {
  const fs = require('node:fs');
  const data = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  const placed = [];
  class NoPropsPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      this.getImageProperties = () => { throw new Error('indisponible'); };
      const orig = this.addImage.bind(this);
      this.addImage = (img, fmt, x, y, w, h, ...rest) => {
        placed.push({ w, h });
        return orig(img, fmt, x, y, w, h, ...rest);
      };
    }
  }
  await APSGenerator.generateAPS(villa, null, null, { JsPDF: NoPropsPDF, save: false, coverImage: { data } });
  assert.equal(placed.length, 1);
  assert.equal(placed[0].w, 0, 'largeur calculée proportionnellement (contain), jamais étirée en 16:9');
  assert.equal(placed[0].h, 85);
});

test('APS : pièces principales au sens immobilier, « R+1 » lisible, pas d’« annexe » répétée', async () => {
  const verandas = require('../projects/residence-verandas/project.json');
  const content = APSGenerator.buildContent(verandas);
  // Séjour, salle à manger, séjour étage et 4 chambres ; ni cuisine, ni pièces d'eau, ni paliers, ni dressing.
  assert.equal(content.mainRoomCount, 7);
  assert.equal(content.nature, 'Construction neuve — R+1 (2 niveaux)');
  const { all } = await render(verandas);
  assert.doesNotMatch(all, /\(annexe\) \(annexe\)|Annexe \(annexe\)|r\+1/);
  assert.match(all, /7 pièces principales/);
});
