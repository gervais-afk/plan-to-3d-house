const assert = require('node:assert/strict');
const { test } = require('node:test');
const WoodGrain = require('../js/woodGrain.js');

test('Le fil de bois est déterministe : même graine, même dessin', () => {
  const a = WoodGrain.lines({ width: 400, height: 300, seed: 11, knots: 3 });
  const b = WoodGrain.lines({ width: 400, height: 300, seed: 11, knots: 3 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, WoodGrain.lines({ width: 400, height: 300, seed: 12, knots: 3 }));
});

test('Veines sur toute la hauteur et nœuds fermés', () => {
  const lines = WoodGrain.lines({ width: 400, height: 300, seed: 11, knots: 2 });
  const veins = lines.filter(l => l[0][1] < 0 && l[l.length - 1][1] > 300);
  assert.ok(veins.length >= 20, `${veins.length} veines`);
  const rings = lines.filter(l => Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 1e-6);
  assert.ok(rings.length >= 4, 'au moins deux cernes par nœud');
});

test('SVG autonome, aux couleurs passées, sans dépendance', () => {
  const svg = WoodGrain.svg({ stroke: '#B38646', opacity: 0.18 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /stroke="#B38646"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
  assert.ok(svg.length < 200000, 'motif léger');
});

test('Tracé PDF vectoriel, contenu dans le cadre demandé', () => {
  const calls = [];
  const doc = { setDrawColor() { return this; }, setLineWidth() { return this; }, lines(deltas, x, y) {
    let px = x, py = y; const pts = [[px, py]];
    deltas.forEach(([dx, dy]) => { px += dx; py += dy; pts.push([px, py]); });
    calls.push(pts);
  } };
  WoodGrain.drawPdf(doc, { x: 270, y: 0, w: 150, h: 297, color: '#27322b', seed: 11 });
  assert.ok(calls.length > 20);
  for (const pts of calls) for (const [x, y] of pts) {
    assert.ok(x >= 270 - 1e-6 && x <= 420 + 1e-6 && y >= -1e-6 && y <= 297 + 1e-6, `point hors cadre ${x},${y}`);
  }
});
