const test = require('node:test');
const assert = require('node:assert/strict');
const PlanHomography = require('../js/planHomography');
const EditorAI = require('../js/editorAI');
const PlanProposalReview = require('../js/planProposalReview');

test('Lot 6 — Redressement 4 points (homographie) : coins < 1 px, ratio L/H < 0,5 %, image d’origine intacte', () => {
  const srcW = 240, srcH = 180;
  const srcData = new Uint8ClampedArray(srcW * srcH * 4);
  // Fond blanc
  srcData.fill(255);

  // Trapèze synthétique représentant une feuille 10 m x 6 m (ratio L/H = 5/3) photographiée en perspective
  const srcQuad = [
    [52, 24],   // Haut-gauche
    [188, 30],  // Haut-droite
    [220, 150], // Bas-droite
    [20, 144]   // Bas-gauche
  ];

  // Placer un point repère rouge au centre projectif du trapèze (qui doit atterrir au centre du rectangle redressé)
  const targetRatio = 10 / 6;
  const size = PlanHomography.computeRectifiedSize(srcQuad, { targetAspectRatio: targetRatio });
  const dstQuad = [[0, 0], [size.width - 1, 0], [size.width - 1, size.height - 1], [0, size.height - 1]];
  const HinvPreview = PlanHomography.solveHomography(dstQuad, srcQuad);
  const [srcCx, srcCy] = PlanHomography.applyHomography(HinvPreview, (size.width - 1) / 2, (size.height - 1) / 2);

  // Peindre un disque rouge de rayon 4 px autour du centre projectif dans l'image source
  for (let y = Math.floor(srcCy) - 4; y <= Math.ceil(srcCy) + 4; y++) {
    for (let x = Math.floor(srcCx) - 4; x <= Math.ceil(srcCx) + 4; x++) {
      if (x >= 0 && x < srcW && y >= 0 && y < srcH) {
        const idx = (y * srcW + x) * 4;
        srcData[idx] = 220; srcData[idx + 1] = 20; srcData[idx + 2] = 20; srcData[idx + 3] = 255;
      }
    }
  }
  const originalSnapshot = Buffer.from(srcData);

  const warped = PlanHomography.warpRGBA(srcData, srcW, srcH, srcQuad, size.width, size.height);

  // 1. L'image source n'est jamais modifiée
  assert.equal(Buffer.compare(Buffer.from(srcData), originalSnapshot), 0, 'Le buffer source doit rester intact');

  // 2. Chaque coin du trapèze se projette sur le coin du rectangle cible à < 1 px
  srcQuad.forEach((pt, i) => {
    const [u, v] = PlanHomography.applyHomography(warped.H, pt[0], pt[1]);
    const err = Math.hypot(u - dstQuad[i][0], v - dstQuad[i][1]);
    assert.ok(err < 1e-3, `Coin ${i} hors tolérance : erreur ${err} px`);
  });

  // 3. Ratio L/H respecté à < 0,5 %
  const actualRatio = warped.width / warped.height;
  const ratioErr = Math.abs(actualRatio - targetRatio) / targetRatio;
  assert.ok(ratioErr < 0.005, `Erreur de ratio L/H trop grande : ${(ratioErr * 100).toFixed(3)} %`);

  // 4. Le marqueur rouge au centre projectif se retrouve bien au centre de l'image redressée
  const midX = Math.round((warped.width - 1) / 2);
  const midY = Math.round((warped.height - 1) / 2);
  const midIdx = (midY * warped.width + midX) * 4;
  assert.ok(warped.data[midIdx] > 180 && warped.data[midIdx + 1] < 80, 'Le repère central doit être rouge après redressement');
});

test('Lot 6 — Seconde cote de contrôle : conforme ≤ 1 %, alerte explicite > 1 %', () => {
  // Échelle calibrée : 50 px/m, seconde cote attendue : 6,00 m (= 300 px exacts)
  const okCheck = PlanHomography.evaluateControlDimension({
    p1: [100, 100],
    p2: [402, 100], // 302 px -> 6.04 m -> 0.67 % d'écart
    realMeters: 6,
    pxPerMeter: 50
  });
  assert.equal(okCheck.ok, true);
  assert.equal(okCheck.alert, false);
  assert.ok(okCheck.percentError <= 1);

  const exactLimit = PlanHomography.evaluateControlDimension({
    p1: [0, 0],
    p2: [303, 0], // 303 px -> 6.06 m -> 1.00 % exact
    realMeters: 6,
    pxPerMeter: 50
  });
  assert.equal(exactLimit.ok, true);
  assert.equal(exactLimit.alert, false);

  const alertCheck = PlanHomography.evaluateControlDimension({
    p1: [0, 0],
    p2: [309, 0], // 309 px -> 6.18 m -> 3.00 % > 1 %
    realMeters: 6,
    pxPerMeter: 50
  });
  assert.equal(alertCheck.ok, false);
  assert.equal(alertCheck.alert, true);
  assert.equal(alertCheck.percentError, 3);
  assert.match(alertCheck.message, /3\.00\s*%/);
});

test('Lot 6 — Zones floues ou non cotées IA marquées uncertain et remontées dans « À vérifier »', () => {
  const env = {
    S: {
      p: {
        config: { planImage: { calibrated: true, pxPerMeter: 50, originPx: [0, 0] } },
        rooms: []
      },
      planImg: { width: 800, height: 600 }
    }
  };
  const ai = {
    scale: { reference: '10,00 m' },
    walls: [
      { x1: 0, y1: 0, x2: 500, y2: 0, kind: 'exterior' },
      { x1: 500, y1: 0, x2: 500, y2: 300, kind: 'exterior' },
      { x1: 0, y1: 300, x2: 500, y2: 300, kind: 'exterior' },
      { x1: 0, y1: 0, x2: 0, y2: 300, kind: 'exterior' },
      { x1: 250, y1: 0, x2: 250, y2: 300, kind: 'interior', uncertain: true, uncertainReason: 'Trait flou sur le croquis' }
    ],
    openings: [
      { kind: 'door', x: 120, y: 300, width: 45, uncertain: true }
    ],
    rooms: [
      { name: 'Séjour', polygon: [[0, 0], [250, 0], [250, 300], [0, 300]], floor: 'parquet', habitable: true },
      { name: 'Cuisine', polygon: [[250, 0], [500, 0], [500, 300], [250, 300]], floor: 'tiles', habitable: true, uncertain: true }
    ],
    uncertainZones: [
      { label: 'Angle cuisine', reason: 'undimensioned', x: 350, y: 150, width: 120, height: 100 }
    ]
  };

  const out = EditorAI.convert(ai, { W: 800, H: 600, factor: 1 }, {}, env);
  const uncertainItems = out.toVerify.filter(item => item.uncertain === true);
  assert.ok(uncertainItems.length >= 4, `Attendu ≥ 4 éléments incertains (zone + mur + ouverture + pièce), reçu ${uncertainItems.length}`);
  assert.ok(out.walls.some(w => w.uncertain === true));
  assert.ok(out.rooms.some(r => r.uncertain === true));

  const assessment = PlanProposalReview.assessProposal(ai, out);
  assert.ok(assessment.uncertainCount >= 4);
  assert.ok(assessment.warnings.some(w => /incertain/i.test(w)));
});
