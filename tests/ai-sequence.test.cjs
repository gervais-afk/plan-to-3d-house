const assert = require('node:assert/strict');
const { test } = require('node:test');
const AiSequence = require('../js/aiSequence.js');

const wp = labels => labels.map((label, i) => ({ label, pos: [i, label === 'ENVOL' ? 8 : 1.65, 0], look: [i + 1, 1.5, 0], fov: 60 }));
const tour = wp(['PLAN', 'ÉLÉVATION', 'ARRIVÉE', 'PORTE', 'SÉJOUR', 'CUISINE', 'MONTÉE', 'PALIER', 'CHAMBRE', 'ENVOL', 'ENSEMBLE']);

test('Le parcours est découpé en segments de 5 s au plus, à cadence exacte', () => {
  const segments = AiSequence.plan(tour, { totalSeconds: 24, fps: 24, maxSegmentSeconds: 5 });
  assert.ok(segments.length >= 5);
  for (const s of segments) {
    assert.ok(s.seconds <= 5 + 1e-9, `${s.label} : ${s.seconds} s`);
    assert.equal(s.frames, Math.round(s.seconds * 24));
  }
  // Les segments se suivent sans trou ni chevauchement.
  segments.slice(1).forEach((s, i) => assert.ok(Math.abs(s.start - segments[i].end) < 1e-9));
  assert.ok(Math.abs(segments[segments.length - 1].end - 1) < 1e-9);
});

test('La phase d’élévation des murs peut être écartée', () => {
  const all = AiSequence.plan(tour, { totalSeconds: 24, fps: 12 });
  const skipped = AiSequence.plan(tour, { totalSeconds: 24, fps: 12, skipBefore: 0.16 });
  assert.ok(skipped[0].start >= 0.16 - 1e-9);
  assert.ok(skipped.reduce((n, s) => n + s.frames, 0) < all.reduce((n, s) => n + s.frames, 0));
});

test('Les segments aériens sont repérés (profondeur sur 60 m au lieu de 10 m)', () => {
  const segments = AiSequence.plan(tour, { totalSeconds: 24, fps: 12, maxSegmentSeconds: 5 });
  assert.ok(segments.some(s => s.aerial));
  assert.ok(segments.some(s => !s.aerial));
});

test('Première et dernière image d’un segment tombent sur ses bornes', () => {
  const [s] = AiSequence.plan(tour, { totalSeconds: 24, fps: 24 });
  assert.equal(AiSequence.frameProgress(s, 0), s.start);
  assert.ok(Math.abs(AiSequence.frameProgress(s, s.frames - 1) - s.end) < 1e-12);
});

test('Contours : une arête nette devient une ligne blanche sur fond noir', () => {
  const w = 40, h = 30, g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 20 ? 30 : 220;
  const edges = AiSequence.edgesFromGray([g], w, h);
  assert.equal(edges[15 * w + 19] + edges[15 * w + 20] > 0, true, 'ligne sur la rupture');
  assert.equal(edges[15 * w + 5], 0, 'fond noir loin de l’arête');
});
