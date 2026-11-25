const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');

const PdfIdentity = require('../js/pdfIdentity.js');
const APSGenerator = require('../js/apsGenerator.js');
const ClientBrochurePremium = require('../js/clientBrochurePremium.js');
const ClientBrochure = require('../js/clientBrochure.js');
const PlanBook = require('../js/planBook.js');

const verandas = require('../projects/residence-verandas/project.json');
const manifest = require('../projects/residence-verandas/generated/manifest.json');

// PNG 1×1 transparent valide (pour tester le logo du cabinet dans le cartouche sans recadrage)
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function spyJsPDF() {
  const written = [];
  const fills = new Set();
  const strokes = new Set();
  const placedImages = [];
  let properties = null;
  const toHex = c => (typeof c[0] === 'string'
    ? c[0].toLowerCase()
    : '#' + c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0')).join(''));

  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const origText = this.text.bind(this);
      const origFill = this.setFillColor.bind(this);
      const origDraw = this.setDrawColor.bind(this);
      const origImg = this.addImage.bind(this);
      const origProps = this.setProperties.bind(this);
      this.text = (value, ...rest) => {
        written.push(...(Array.isArray(value) ? value : [value]));
        return origText(value, ...rest);
      };
      this.setFillColor = (...c) => { fills.add(toHex(c)); return origFill(...c); };
      this.setDrawColor = (...c) => { strokes.add(toHex(c)); return origDraw(...c); };
      this.addImage = (img, fmt, x, y, w, h, ...rest) => {
        placedImages.push({ fmt, x, y, w, h });
        return origImg(img, fmt, x, y, w, h, ...rest);
      };
      this.setProperties = p => { properties = p; return origProps(p); };
    }
  }
  return { SpyPDF, written, fills, strokes, placedImages, getProperties: () => properties };
}

test('PdfIdentity.extractMeta n’invente ni indice A, ni client, ni lieu, ni date, ni ArchiCam Studio en maître d’œuvre', () => {
  const meta = PdfIdentity.extractMeta(verandas);
  assert.equal(meta.project, 'Résidence des Vérandas');
  assert.equal(meta.client, '');
  assert.equal(meta.location, '');
  assert.equal(meta.agency, '');
  assert.equal(meta.phase, '');
  assert.equal(meta.revision, '');
  assert.equal(meta.date, '');
  assert.equal(meta.year, '');

  const filled = PdfIdentity.extractMeta({
    meta: {
      name: 'VILLA EXEMPLE',
      client: 'M. Kouam',
      location: 'Yaoundé — Bastos',
      architect: 'J. Mballa',
      phase: 'APD',
      revision: 'B',
      issueDate: '2026-11-20'
    }
  }, {
    cabinet: { name: 'Atelier Nord', architect: 'Autre Architecte', logoData: TINY_PNG }
  });
  assert.equal(filled.displayProject, 'Villa Exemple');
  assert.equal(filled.client, 'M. Kouam');
  assert.equal(filled.location, 'Yaoundé — Bastos');
  assert.equal(filled.agency, 'Atelier Nord — J. Mballa');
  assert.equal(filled.brand, 'Atelier Nord');
  assert.equal(filled.logoData, TINY_PNG);
  assert.equal(filled.phase, 'Avant-projet définitif');
  assert.equal(filled.revision, 'B');
  assert.equal(filled.date, '20/11/2026');
  assert.equal(filled.year, '2026');
});

test('PdfIdentity.missingFields et documentCode : liste claire des champs absents et codification uniforme', () => {
  const missing = PdfIdentity.missingFields(verandas);
  assert.deepEqual(missing.missing, [
    'Maître d\'ouvrage',
    'Localisation',
    'Agence / maître d\'œuvre',
    'Phase',
    'Indice',
    'Date d\'émission'
  ]);
  assert.equal(
    missing.message,
    'Maître d\'ouvrage, localisation, agence / maître d\'œuvre, phase, indice, date d\'émission non renseignés'
  );

  const partial = PdfIdentity.missingFields(
    { meta: { name: 'Villa', client: 'Mme Ndiaye', location: 'Douala', phase: 'APS', revision: '0', issueDate: '2026-11-20' } },
    { cabinet: { name: 'Atelier Sud', architect: 'A. Diallo' } }
  );
  assert.deepEqual(partial.missing, []);
  assert.equal(partial.message, '');

  assert.equal(PdfIdentity.documentCode('aps', 0), 'APS-00');
  assert.equal(PdfIdentity.documentCode('brochure', 0), 'BRO-00');
  assert.equal(PdfIdentity.documentCode('catalog', 0), 'CAT-00');
  assert.equal(PdfIdentity.documentCode('book', 0), 'PL-00');
  assert.equal(PdfIdentity.documentCode('book', 2), 'PL-02');
});

test('PdfIdentity.drawCartouche : masque toute case vide, resserre la hauteur et affiche le logo du cabinet', () => {
  // Cas 1 : projet sans métadonnées administratives ni profil cabinet
  const spyEmpty = spyJsPDF();
  const docEmpty = new spyEmpty.SpyPDF({ unit: 'mm', format: 'a4' });
  const boxEmpty = PdfIdentity.drawCartouche(docEmpty, PdfIdentity.extractMeta(verandas), { x: 20, y: 237, w: 170, h: 42 }, {
    documentLabel: 'Avant-projet sommaire',
    code: PdfIdentity.documentCode('aps', 0)
  });
  const emptyText = spyEmpty.written.join('\n');
  assert.equal(boxEmpty.rows, 2, 'seules les 2 lignes renseignées (PROJET, DOCUMENT) doivent être imprimées');
  assert.ok(boxEmpty.h < 42, 'la hauteur du cartouche doit se resserrer');
  assert.equal(boxEmpty.bottom, 279, 'ancrage bas conservé sur y + h');
  assert.ok(emptyText.includes('PROJET'));
  assert.ok(emptyText.includes('DOCUMENT'));
  for (const absent of ['MAÎTRE D\'OUVRAGE', 'LOCALISATION', 'AGENCE / MAÎTRE D\'ŒUVRE', 'PHASE', 'INDICE', 'DATE']) {
    assert.ok(!emptyText.includes(absent), `la case vide « ${absent} » ne doit pas être imprimée`);
  }
  assert.ok(!emptyText.includes('ArchiCam Studio'), 'ArchiCam Studio ne doit jamais apparaître comme maître d’œuvre');

  // Cas 2 : projet renseigné + profil du cabinet avec logo PNG
  const spyFull = spyJsPDF();
  const docFull = new spyFull.SpyPDF({ unit: 'mm', format: 'a4' });
  const fullMeta = PdfIdentity.extractMeta({
    meta: {
      name: 'Villa des Palmiers',
      client: 'M. Essomba',
      location: 'Douala — Bonapriso',
      phase: 'APS',
      revision: '0',
      issueDate: '2026-11-25'
    }
  }, {
    cabinet: { name: 'Cabinet Kama Architecture', architect: 'L. Kama, DPLG', logoData: TINY_PNG }
  });
  const boxFull = PdfIdentity.drawCartouche(docFull, fullMeta, { x: 20, y: 237, w: 170, h: 42 }, {
    documentLabel: 'Avant-projet sommaire',
    code: PdfIdentity.documentCode('aps', 0)
  });
  const fullText = spyFull.written.join('\n');
  assert.equal(boxFull.rows, 4);
  assert.ok(boxFull.h > boxEmpty.h);
  for (const present of ['PROJET', 'MAÎTRE D\'OUVRAGE', 'LOCALISATION', 'AGENCE / MAÎTRE D\'ŒUVRE', 'DOCUMENT', 'PHASE', 'INDICE', 'DATE']) {
    assert.ok(fullText.includes(present), `champ renseigné « ${present} » manquant`);
  }
  assert.ok(fullText.includes('Cabinet Kama Architecture — L. Kama, DPLG'));
  assert.equal(spyFull.placedImages.length, 1, 'le logo PNG du cabinet doit être intégré au cartouche');
  assert.equal(spyFull.placedImages[0].fmt, 'PNG');
});

test('APS : palette agence (#1d2620 / #b78a3c / #f4f2eb), cartouche resserré, pas de date inventée', async () => {
  const spy = spyJsPDF();
  const data = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  await APSGenerator.generateAPS(verandas, null, null, {
    JsPDF: spy.SpyPDF,
    save: false,
    coverImage: { id: 'perspective-01', file: 'projects/residence-verandas/generated/images/perspective-01.jpg', source: 'architect', data }
  });
  const all = spy.written.join('\n');
  assert.ok(spy.fills.has('#1d2620'), 'vert nuit agence manquant');
  assert.ok(spy.fills.has('#b78a3c'), 'or agence manquant');
  assert.ok(spy.fills.has('#f4f2eb'), 'papier lin agence manquant');
  assert.ok(!spy.fills.has('#e94560'), 'ancien accent corail #e94560 encore présent');
  assert.ok(!spy.fills.has('#1a1a2e'), 'ancien marine #1a1a2e encore présent');
  assert.ok(all.includes('CARTOUCHE'));
  assert.ok(all.includes('APS-00'));
  assert.ok(all.includes('PROJET'));
  assert.ok(all.includes('DOCUMENT'));
  assert.ok(!all.includes('MAÎTRE D\'OUVRAGE'), 'champ client vide masqué du cartouche');
  assert.ok(!all.includes('AGENCE / MAÎTRE D\'ŒUVRE'), 'champ agence vide masqué du cartouche');
  assert.ok(all.includes('Perspective de l\'architecte'));
  const content = APSGenerator.buildContent(verandas);
  assert.equal(content.date, '', 'aucune date d’émission inventée quand non fournie');
  assert.equal(content.revision, '', 'aucun indice A inventé');
  assert.equal(content.location, 'À préciser', 'localisation non inventée depuis CostEstimate');
});

test('Brochure classique : charte agence, cartouche commun, capture 3D non étirée et mention DeliverableGate', () => {
  const spy = spyJsPDF();
  const prevHouseAuto = global.HouseAuto;
  global.HouseAuto = {
    bbox: () => ({ xMin: -5.8, xMax: 5.8, zMin: -5.8, zMax: 5.8, cx: 0, cz: 0, w: 11.6, d: 11.6, max: 11.6 }),
    findEntry: () => ({ out: { x: 0, z: 1 } }),
    roomPose: () => ({ cam: { x: 0, z: 0 }, look: { x: 2, z: 2 } }),
    northAngle: () => 0
  };
  try {
    const facadeJpg = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/renders/facade.jpg').toString('base64')}`;
    const studio = { hs: { levelOffset: lvl => lvl * 3 }, capture: () => facadeJpg };
    const doc = ClientBrochure.build(spy.SpyPDF, verandas, studio, null, { save: false });
    assert.equal(doc.getNumberOfPages(), 3);
    const all = spy.written.join('\n');
    assert.ok(spy.fills.has('#1d2620'));
    assert.ok(spy.fills.has('#f4f2eb'));
    assert.ok(spy.fills.has('#b78a3c'));
    assert.ok(all.includes('CARTOUCHE'));
    assert.ok(all.includes('BRO-00'));
    assert.ok(all.includes('Capture de la maquette 3D'));
    assert.equal(spy.getProperties().creator, 'ArchiCam Studio');
  } finally {
    if (prevHouseAuto === undefined) delete global.HouseAuto;
    else global.HouseAuto = prevHouseAuto;
  }
});

test('PlanBook : info() sans valeurs inventées, couverture A3 conservée + cartouche resserré, couverture Catalogue + cartouche commun', () => {
  const info = PlanBook.info(verandas, { code: 'PL-00', title: 'Couverture' });
  assert.equal(info.revision, '', 'jamais d’indice A par défaut');
  assert.equal(info.phase, '', 'jamais de phase Présentation inventée');
  assert.equal(info.date, '', 'jamais de date new Date() inventée');
  assert.equal(info.client, '');
  assert.equal(info.location, '');
  assert.equal(info.architect, '');

  const heroData = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  const coverView = manifest.items.find(item => item.id === 'perspective-01');

  // Couverture Cahier A3 (sans métadonnées → cases vides masquées)
  const spyA3 = spyJsPDF();
  const docA3 = new spyA3.SpyPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
  PlanBook.cover(
    docA3,
    verandas,
    { code: 'PL-00', title: 'Couverture', section: 'Présentation' },
    heroData,
    [
      { code: 'PL-00', title: 'Couverture', section: 'Présentation' },
      { code: 'PL-01', title: 'Planche de synthèse', section: 'Synthèse du projet' },
      { code: 'PL-02', title: 'Plan - Rez-de-chaussée', section: 'Plans' }
    ],
    coverView
  );
  const a3Text = spyA3.written.join('\n');
  assert.ok(spyA3.fills.has('#1d2620'), 'panneau vert nuit A3 conservé');
  assert.ok(a3Text.includes('CARTOUCHE'));
  assert.ok(a3Text.includes('PL-00'));
  assert.ok(!a3Text.includes('INDICE'), 'aucune case INDICE vide sur la couverture A3');
  assert.ok(!a3Text.includes('PHASE'), 'aucune case PHASE vide sur la couverture A3');
  assert.ok(a3Text.includes('Perspective de l\'architecte'));
  assert.ok(!a3Text.includes('INDICE A'), 'aucun indice A inventé sur la couverture A3');
  assert.ok(!a3Text.includes('PRÉSENTATION · INDICE A'));

  // Couverture Catalogue A4 paysage + profil du cabinet
  const spyCat = spyJsPDF();
  const docCat = new spyCat.SpyPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  PlanBook.drawCatalogCover(docCat, verandas, heroData, coverView, 8, {
    cabinet: { name: 'Atelier Kama', architect: 'L. Kama', logoData: TINY_PNG }
  });
  const catText = spyCat.written.join('\n');
  assert.ok(spyCat.fills.has('#f4f2eb'), 'cartel lin du catalogue conservé');
  assert.ok(spyCat.fills.has('#202a23'), 'cartouche commun agence présent sur le catalogue');
  assert.ok(catText.includes('CARTOUCHE'));
  assert.ok(catText.includes('CAT-00'));
  assert.ok(catText.includes('AGENCE / MAÎTRE D\'ŒUVRE'));
  assert.ok(catText.includes('Atelier Kama — L. Kama'));
  assert.ok(catText.includes('Perspective de l\'architecte'));
  assert.ok(!catText.includes(String(new Date().getFullYear())), 'aucune année inventée par new Date()');
  assert.ok(!a3Text.includes('\n0\n'), 'la surface habitable géométrique est calculée même sans totals précalculés');
});

test('PdfIdentity.text : l’alignement à droite avec charSpace compense l’espacement des lettres', () => {
  const calls = [];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const orig = doc.text.bind(doc);
  doc.text = (value, x, y, opts) => { calls.push({ value, x, y, opts }); return orig(value, x, y, opts); };
  const label = 'AVANT-PROJET SOMMAIRE';
  PdfIdentity.text(doc, label, 190, 21, 6.4, { bold: true, align: 'right', space: 1.0 });
  assert.equal(calls.length, 1);
  const expectedX = 190 - 1.0 * (label.length - 1);
  assert.ok(Math.abs(calls[0].x - expectedX) < 1e-6, `x=${calls[0].x} ≠ ${expectedX}`);
  assert.equal(calls[0].opts.align, 'right');
});

test('Brochure premium : couverture architecte + intérieurs IA gardent leurs mentions distinctes par page', async () => {
  const pageTexts = { 1: [], 2: [] };
  class PageSpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const origText = this.text.bind(this);
      this.text = (value, ...rest) => {
        const p = this.getNumberOfPages();
        (pageTexts[p] ||= []).push(...(Array.isArray(value) ? value : [value]));
        return origText(value, ...rest);
      };
    }
  }
  const facadeData = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  const int1 = `data:image/png;base64,${fs.readFileSync('projects/residence-verandas/generated/images/photor-sejour-veranda.png').toString('base64')}`;
  const int2 = `data:image/png;base64,${fs.readFileSync('projects/residence-verandas/generated/images/photor-cuisine.png').toString('base64')}`;
  await ClientBrochurePremium.exportPDF(verandas, null, null, () => {}, {
    JsPDF: PageSpyPDF,
    save: false,
    images: {
      facade: { id: 'perspective-01', file: 'projects/residence-verandas/generated/images/perspective-01.jpg', label: 'Façade et perron', source: 'architect', data: facadeData },
      interiors: [
        { id: 'photor-sejour-veranda', file: 'projects/residence-verandas/generated/images/photor-sejour-veranda.png', label: 'Séjour & véranda', ai: true, data: int1 },
        { id: 'photor-cuisine', file: 'projects/residence-verandas/generated/images/photor-cuisine.png', label: 'Cuisine', ai: true, data: int2 }
      ]
    }
  });
  const p1 = pageTexts[1].join('\n');
  const p2 = pageTexts[2].join('\n');
  assert.ok(p1.includes('Perspective de l\'architecte'), 'la couverture architecte doit porter sa propre mention');
  assert.ok(!p1.includes('générées par IA'), 'la couverture architecte ne doit pas être qualifiée de rendu IA');
  assert.ok(p2.includes('Images générées par IA'), 'les vues intérieures IA en page 2 doivent porter leur mention IA');
  assert.equal(APSGenerator.buildContent(verandas).phase, '', 'APS n’invente pas de phase quand meta.phase est vide');
});
