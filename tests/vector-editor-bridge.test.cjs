const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PdfVectorExtract = require('../js/pdfVectorExtract.js');
const EditorAI = require('../js/editorAI.js');
const PlanProposalReview = require('../js/planProposalReview.js');

test('EditorAI.vectorToProposal : convertit une extraction vectorielle PDF en proposition relisible (Lot 7) sans inventer de pièce', () => {
  const vecResult = {
    ok: true,
    scaleConfirmed: true,
    ptsPerMeter: PdfVectorExtract.ptsPerMeterForDenominator(100),
    scaleProposal: { denominator: 100, label: '1/100', confirmed: true },
    walls: [
      {
        from: [2, 1],
        to: [8, 1],
        thick: 0.25,
        type: 'ext',
        openings: [{ type: 'door', at: 2.5, w: 0.9, h: 2.1, sill: 0, hinge: 'start', side: 1 }]
      },
      {
        from: [8, 1],
        to: [8, 6],
        thick: 0.25,
        type: 'ext',
        openings: [{ type: 'window', at: 2.0, w: 1.4, h: 1.25, sill: 0.95 }]
      }
    ],
    rooms: [
      { name: 'Séjour', center: [5, 3.5], polygon: [[2, 1], [8, 1], [8, 6], [2, 6]] },
      { name: 'Hall', center: [3, 2] } // sans polygone fermé → doit aller dans toVerify, jamais inventé
    ],
    toVerify: [
      { kind: 'segment', reason: 'Trait vectoriel non interprété (1.80 m)', coords: { from: [4, 2], to: [5.8, 2] } }
    ]
  };

  const { out, assessment } = EditorAI.vectorToProposal(vecResult, { level: 0, mode: 'replace' });
  assert.equal(out.source, 'pdf-vector');
  assert.equal(out.walls.length, 2);
  assert.equal(out.mappedOpenings, 2);
  assert.equal(out.rooms.length, 1, 'seule la pièce dotée d’un polygone fermé est créée');
  assert.equal(out.rooms[0].name, 'Séjour');
  assert.equal(out.toVerify.length, 2, 'le texte sans contour et le trait non interprété sont dans À vérifier');
  assert.ok(out.toVerify.some(item => item.label === 'Hall' && item.position), 'Hall conservé dans toVerify avec coordonnées');

  const session = PlanProposalReview.createReviewSession(assessment, out);
  const overlay = session.getOverlayItems();
  assert.equal(overlay.walls.length, 2, 'la superposition visuelle contient les 2 murs vectoriels');
  assert.equal(overlay.rooms.length, 1, 'la superposition visuelle contient la pièce fermée');
  assert.equal(overlay.markers.length, 2, 'la superposition visuelle signale les 2 éléments à vérifier');
  assert.equal(session.canApply(), true, 'sans anomalie bloquante, la proposition est applicable après relecture');

  // Cas murs + textes de pièces sans polygone fermé (fréquent en CAO) : applicable sans inventer de pièce
  const wallsOnly = EditorAI.vectorToProposal({ ...vecResult, rooms: [{ name: 'Hall', center: [3, 2] }] });
  const wallsOnlySession = PlanProposalReview.createReviewSession(wallsOnly.assessment, wallsOnly.out);
  assert.equal(wallsOnly.out.rooms.length, 0);
  assert.equal(wallsOnlySession.canApply(), true, 'une extraction vectorielle murs seuls reste applicable après relecture');
});

test('Accueil studio.html & planches : tirages du studio et planches réelles des projets, sans référence fantôme', () => {
  const studioFiles = [
    'assets/studio/plan-villa-a-rdc.jpg',
    'assets/studio/plan-villa-a-etage.jpg',
    'assets/studio/coupe-villa-a.jpg',
    'assets/studio/toiture-villa-a.jpg',
    'assets/studio/planche-villa-a.jpg',
    'assets/studio/plan-villa-b-rdc.jpg',
    'assets/studio/planche-villa-b.jpg'
  ];
  const studioHtml = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  for (const rel of studioFiles) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} existe`);
    assert.ok(studioHtml.includes(rel), `${rel} est intégré dans studio.html`);
  }
  assert.match(studioHtml, /Coupe B–B · Planche d’origine/);
  assert.match(studioHtml, /Plan de toiture · Planche d’origine/);

  // Planches réellement versionnées pour les couvertures des projets de démonstration.
  const projectPlates = [
    'projects/residence-verandas/planches/edition-art/063240.webp',
    'projects/residence-verandas/planches/edition-art/063308.webp',
    'projects/residence-verandas/planches/edition-art/planche-complete.jpg',
    'projects/villa-serena/planches/edition-art/planche-complete.jpg'
  ];
  for (const rel of projectPlates) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} existe pour la couverture du projet`);
  }

  const homeCode = fs.readFileSync(path.join(ROOT, 'js/home.js'), 'utf8');
  assert.ok(!homeCode.includes('coupe-2d-ia.jpg') && !homeCode.includes('toiture-ia.jpg'), 'aucune référence aux anciennes coupes/toitures IA dans home.js');
  assert.match(homeCode, /edition\?\.sheets/, 'home.js récupère génériquement les planches existantes depuis edition.sheets');
  // Plus aucune planche fantôme codée en dur : une couverture ne doit jamais pointer un fichier absent du dépôt.
  assert.ok(!/plan-(rdc|etage)-ultrareal/.test(homeCode), 'home.js ne doit plus coder en dur des planches inexistantes');
  assert.ok(homeCode.includes('function plateKind'), 'le type de planche doit être déduit de son intitulé, sans cas particulier par slug');
  assert.ok(homeCode.includes('planche-complete.jpg'), 'la planche complète de synthèse reste proposée quand elle existe');

  // Intégrité : chaque planche déclarée par un projet de démonstration existe au moins sous une de ses formes.
  for (const slug of ['residence-verandas', 'villa-serena']) {
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', slug, 'project.json'), 'utf8'));
    for (const sheet of record.edition?.sheets || []) {
      const candidates = [sheet.art, sheet.preview].filter(rel => typeof rel === 'string' && rel.startsWith('projects/'));
      assert.ok(candidates.length > 0, `${slug} · ${sheet.title} doit référencer une planche`);
      assert.ok(candidates.some(rel => fs.existsSync(path.join(ROOT, rel))),
        `${slug} · ${sheet.title} : aucune planche du dossier n’existe sur disque`);
    }
  }
});

test('Extraction 2D Three.js sans hallucination : filtrage par niveau et zéro plaque de cuisson codée en dur', () => {
  const planCode = fs.readFileSync(path.join(ROOT, 'js/presentationPlan.js'), 'utf8');
  assert.ok(!planCode.includes('-5.45, -1.45'), 'aucune coordonnée de plaque de cuisson codée en dur');
  assert.ok(planCode.includes('levelRooms') && planCode.includes('levelWalls'), 'filtrage strict des pièces et murs par niveau');
  const studioCode = fs.readFileSync(path.join(ROOT, 'js/renderStudio.js'), 'utf8');
  assert.ok(studioCode.includes('customDepthMaterial.dispose()'), 'captureDepthMap libère le ShaderMaterial temporaire');
});

test('AiPrompt.warmRoomCaption : descriptif court, chaleureux et fidèle aux données réelles de la pièce', () => {
  const AiPrompt = require('../js/aiPrompt.js');
  const caption = AiPrompt.warmRoomCaption({ name: 'Séjour', area: 28.4, level: 0, floorType: 'oak' });
  assert.ok(caption.startsWith('Séjour (28,4 m² · sol en parquet chêne naturel) — '), `format attendu : ${caption}`);
  assert.ok(caption.length > 40 && caption.length < 220, 'descriptif concis');
  const upper = AiPrompt.warmRoomCaption({ name: 'Suite parentale', area: 19, level: 1 });
  assert.ok(upper.includes('R+1') && upper.includes('19 m²'), `mentionne niveau et surface : ${upper}`);
});
