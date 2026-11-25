/**
 * Tests unitaires — Validateur topologique, échelle calibrée obligatoire
 * et liste structurée « À vérifier » (zéro suppression silencieuse) dans js/editorAI.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EditorAI = require('../js/editorAI.js');
const { assessProposal } = require('../js/planProposalReview.js');

function makeEnv(planImage) {
  return {
    S: {
      p: {
        config: { planImage },
        rooms: []
      },
      planImg: { width: 1000, height: 800 }
    }
  };
}

const IMG = { W: 1000, H: 800, factor: 1 };

function makeFourRoomPlan() {
  // Maison 10 m × 8 m (ppm = 100, origin = [0, 0]) divisée en 4 pièces rectangulaires (4 sommets chacune)
  return {
    scale: { reference: '10.00 m' },
    walls: [
      // Périmètre extérieur
      { x1: 0, y1: 0, x2: 1000, y2: 0, kind: 'exterior' },
      { x1: 1000, y1: 0, x2: 1000, y2: 800, kind: 'exterior' },
      { x1: 1000, y1: 800, x2: 0, y2: 800, kind: 'exterior' },
      { x1: 0, y1: 800, x2: 0, y2: 0, kind: 'exterior' },
      // Cloisons intérieures en croix
      { x1: 500, y1: 0, x2: 500, y2: 800, kind: 'interior' },
      { x1: 0, y1: 400, x2: 1000, y2: 400, kind: 'interior' }
    ],
    openings: [
      { kind: 'door', x: 250, y: 0, width: 100 },     // porte d'entrée sur mur nord
      { kind: 'window', x: 750, y: 0, width: 120 },   // fenêtre sur mur nord
      { kind: 'door', x: 500, y: 200, width: 85 },    // porte intérieure Séjour / Cuisine
      { kind: 'door', x: 250, y: 400, width: 85 }     // porte intérieure Séjour / Chambre 1
    ],
    rooms: [
      { name: 'Séjour', polygon: [[0, 0], [500, 0], [500, 400], [0, 400]], floor: 'parquet', habitable: true },
      { name: 'Cuisine', polygon: [[500, 0], [1000, 0], [1000, 400], [500, 400]], floor: 'tiles', habitable: true },
      { name: 'Chambre 1', polygon: [[0, 400], [500, 400], [500, 800], [0, 800]], floor: 'parquet', habitable: true },
      { name: 'Chambre 2', polygon: [[500, 400], [1000, 400], [1000, 800], [500, 800]], floor: 'parquet', habitable: true }
    ],
    columns: [],
    furniture: [
      { type: 'sofa', x: 200, y: 200, width: 180, depth: 90, rotation: 0 },
      { type: 'bed_double', x: 250, y: 600, width: 160, depth: 200, rotation: 90 }
    ]
  };
}

test('Échelle obligatoire : lecture refusée sans calibrage même si l’IA renvoie scale.px_per_meter', () => {
  const ai = Object.assign(makeFourRoomPlan(), { scale: { px_per_meter: 100, reference: 'porte 0.85 m' } });

  // Cas 1 : planImage null
  assert.throws(
    () => EditorAI.convert(ai, IMG, { scale: 'ai', furniture: true }, makeEnv(null)),
    /non calibrée.*touche K/i
  );

  // Cas 2 : calibrated: false avec un pxPerMeter résiduel
  assert.throws(
    () => EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: true }, makeEnv({ calibrated: false, pxPerMeter: 100 })),
    /non calibrée.*touche K/i
  );

  // Cas 3 : calibrated: true mais pxPerMeter invalide (0)
  assert.throws(
    () => EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: true }, makeEnv({ calibrated: true, pxPerMeter: 0 })),
    /non calibrée.*touche K/i
  );
});

test('Prompt et interface : aucune échelle devinée sur des portes de 0,85 m et script aiTopology chargé', () => {
  const prompt = EditorAI.INSTRUCTIONS(1000, 800, true);
  assert.ok(!/0\.85\s*m/i.test(prompt), 'Le prompt ne doit plus mentionner de porte de 0,85 m pour estimer l’échelle');

  const html = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');
  const idxTopo = html.indexOf('js/aiTopology.js');
  const idxAI = html.indexOf('js/editorAI.js');
  assert.ok(idxTopo > 0, 'editor.html doit charger js/aiTopology.js');
  assert.ok(idxTopo < idxAI, 'js/aiTopology.js doit être chargé avant js/editorAI.js');
  assert.ok(!html.includes('<option value="ai">'), 'Le sélecteur d’échelle devinée par l’IA doit être supprimé');
});

test('Zéro perte silencieuse : ouverture à 0,8 m, ouverture chevauchante et mur < 0,2 m dans « À vérifier »', () => {
  const env = makeEnv({ calibrated: true, pxPerMeter: 100, originPx: [0, 0] });
  const ai = makeFourRoomPlan();

  // 1. Mur trop court (< 0,2 m : 15 px = 0,15 m)
  ai.walls.push({ x1: 100, y1: 100, x2: 115, y2: 100, kind: 'interior' });
  // 2. Ouverture à 0,80 m du mur le plus proche (y = 80 → 0,80 m du mur nord y = 0)
  ai.openings.push({ kind: 'door', x: 250, y: 80, width: 85 });
  // 3. Ouverture qui chevauche la porte d'entrée (même position x = 250, y = 0)
  ai.openings.push({ kind: 'window', x: 260, y: 0, width: 100 });
  // 4. Meuble de type inconnu
  ai.furniture.push({ type: 'piano_a_queue', x: 700, y: 200, width: 150, depth: 150, rotation: 0 });

  const out = EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: true }, env);
  const assessment = assessProposal(ai, out, { scale: 'calibrated', mode: 'replace' });

  // Mur trop court consigné avec type, motif, position
  const shortWall = out.toVerify.find(it => it.type === 'mur' && /trop court/i.test(it.reason));
  assert.ok(shortWall, 'Le mur < 0,2 m doit figurer dans « À vérifier »');
  assert.ok(shortWall.position && Number.isFinite(shortWall.position.x), 'Position du mur court renseignée');

  // Ouverture à 0,80 m consignée
  const farOpening = out.toVerify.find(it => it.type === 'ouverture' && /0\.80 m|éloignée/i.test(it.reason));
  assert.ok(farOpening, 'L’ouverture à 0,8 m d’un mur doit figurer dans « À vérifier »');
  assert.deepEqual(farOpening.position, { x: 2.5, z: 0.8 });

  // Ouverture chevauchante consignée
  const overlapOpening = out.toVerify.find(it => it.type === 'ouverture' && /chevauchement/i.test(it.reason));
  assert.ok(overlapOpening, 'L’ouverture chevauchante doit figurer dans « À vérifier »');
  assert.deepEqual(overlapOpening.position, { x: 2.6, z: 0 });

  // Meuble inconnu consigné
  const badFurn = out.toVerify.find(it => it.type === 'meuble' && /piano_a_queue/i.test(it.reason));
  assert.ok(badFurn, 'Le meuble de type inconnu doit figurer dans « À vérifier »');
  assert.deepEqual(badFurn.position, { x: 7, z: 2 });

  // La revue propage bien la liste complète
  assert.equal(assessment.toVerify.length, out.toVerify.length);
  assert.ok(assessment.toVerify.length >= 4);
});

test('Branchement AITopology : pièce auto-intersectante et mur doublon consignés dans « À vérifier »', () => {
  const env = makeEnv({ calibrated: true, pxPerMeter: 100, originPx: [0, 0] });
  const ai = makeFourRoomPlan();
  // Ajoute une pièce papillon (auto-intersectante) et un mur doublon colinéaire
  ai.rooms.push({ name: 'Annexe croisée', polygon: [[100, 100], [300, 300], [300, 100], [100, 300]], floor: 'parquet', habitable: true });
  ai.walls.push({ x1: 200, y1: 0, x2: 700, y2: 0, kind: 'exterior' });

  const out = EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: false }, env);
  assert.ok(out.topology, 'Le rapport AITopology doit être attaché au résultat');
  assert.equal(out.topology.valid, false, 'La pièce auto-intersectante rend la topologie invalide');
  assert.equal(out.rooms.length, 4, 'Les 4 pièces valides sont conservées, la pièce croisée est rejetée');
  assert.ok(out.toVerify.some(it => it.type === 'pièce' && it.label === 'Annexe croisée' && /auto-intersect/i.test(it.reason)));
  assert.ok(out.toVerify.some(it => it.type === 'mur' && /doublon|chevauchement/i.test(it.reason)));
});

test('Recette : un plan simple à 4 pièces est importé sans aucune perte non signalée', () => {
  const env = makeEnv({ calibrated: true, pxPerMeter: 100, originPx: [0, 0] });
  const ai = makeFourRoomPlan();
  const out = EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: true }, env);
  const assessment = assessProposal(ai, out, { scale: 'calibrated', mode: 'replace' });

  assert.equal(out.topology.valid, true, `Erreurs topologie inattendues : ${out.topology.errors.join('; ')}`);
  assert.equal(out.topology.errors.length, 0);
  assert.equal(out.walls.length, 6, 'Les 6 murs (4 ext. + 2 cloisons) sont conservés');
  assert.equal(assessment.mappedOpenings, 4, 'Les 4 ouvertures sont rattachées');
  assert.equal(assessment.unmatchedOpenings, 0);
  assert.equal(out.rooms.length, 4, 'Les 4 pièces en 4 sommets sont importées');
  assert.equal(out.furniture.length, 2, 'Les 2 meubles sont importés');
  assert.equal(out.toVerify.length, 0, 'Aucune perte non signalée');
  assert.equal(assessment.toVerify.length, 0);
});

test('Zéro perte silencieuse : pièce trop petite, ouverture sur mur trop court et compatibilité navigateur', () => {
  const env = makeEnv({ calibrated: true, pxPerMeter: 100, originPx: [0, 0] });
  const ai = makeFourRoomPlan();
  // Pièce de 0,30 × 0,30 m (≤ 0,40 m)
  ai.rooms.push({ name: 'Placard minuscule', polygon: [[100, 100], [130, 100], [130, 130], [100, 130]], floor: 'parquet', habitable: false });
  // Mur de 0,60 m + fenêtre de 1,20 m centrée dessus → mur trop court pour l'ouverture
  ai.walls.push({ x1: 1200, y1: 0, x2: 1260, y2: 0, kind: 'interior' });
  ai.openings.push({ kind: 'window', x: 1230, y: 0, width: 120 });

  const out = EditorAI.convert(ai, IMG, { scale: 'calibrated', furniture: false }, env);
  assert.ok(out.toVerify.some(it => it.type === 'pièce' && it.label === 'Placard minuscule' && /dimensions trop faibles/i.test(it.reason)));
  assert.ok(out.toVerify.some(it => it.type === 'ouverture' && /mur trop court/i.test(it.reason)));

  // Chargement en contexte navigateur (sans module/require) dans l'ordre d'editor.html
  const vm = require('node:vm');
  const ctx = vm.createContext({ window: {}, document: { getElementById: () => null } });
  ctx.window = ctx;
  for (const rel of ['../js/aiTopology.js', '../js/planProposalReview.js', '../js/editorAI.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(rel), 'utf8'), ctx);
  }
  assert.equal(typeof ctx.EditorAI.convert, 'function');
  const browserOut = ctx.EditorAI.convert(makeFourRoomPlan(), IMG, { scale: 'calibrated', furniture: false }, env);
  assert.equal(browserOut.rooms.length, 4);
  assert.equal(browserOut.toVerify.length, 0);
  assert.equal(browserOut.topology.valid, true);
});
