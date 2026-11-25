const assert = require('node:assert/strict');
const { test } = require('node:test');
const FidelityCheck = require('../js/fidelityCheck.js');

const W = 160, H = 90;

/** « Pièce » synthétique : fond, mur du fond, baie, plafond ; options pour déplacer ou changer la scène. */
function room({ dx = 0, window: win = [60, 25, 40, 35], floorY = 65, texture = 0, seed = 1, tone = 0 } = {}) {
  const g = new Float32Array(W * H);
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x - dx;
    let v = 200 + tone;                                   // mur
    if (y < 15) v = 235 + tone;                           // plafond
    if (y >= floorY) v = 120 + tone;                      // sol
    if (X >= win[0] && X < win[0] + win[2] && y >= win[1] && y < win[1] + win[3]) v = 60 + tone; // baie
    if (texture) v += (rand() - 0.5) * texture;           // matière / grain ajoutés par l'« IA »
    g[y * W + x] = Math.max(0, Math.min(255, v));
  }
  return g;
}

test('Un rendu qui garde les lignes de la référence est jugé fidèle', () => {
  const r = FidelityCheck.compareGray(room(), room({ texture: 18, tone: 12 }), W, H);
  assert.equal(r.verdict, 'faithful', JSON.stringify(r));
  assert.ok(r.score > 0.7);
});

test('Un léger décalage de cadrage est toléré et mesuré', () => {
  const r = FidelityCheck.compareGray(room(), room({ dx: 2 }), W, H);
  assert.equal(r.verdict, 'faithful', JSON.stringify(r));
  assert.ok(Math.abs(r.shift.x) > 0, 'le décalage est rapporté');
});

test('Une baie déplacée et un sol modifié sont détectés', () => {
  const r = FidelityCheck.compareGray(room(), room({ window: [15, 40, 25, 20], floorY: 50 }), W, H);
  assert.notEqual(r.verdict, 'faithful', JSON.stringify(r));
});

test('Une image de pur bruit ne passe pas pour fidèle (correction du hasard)', () => {
  const noise = new Float32Array(W * H);
  let s = 7;
  for (let i = 0; i < noise.length; i++) { s = (s * 1103515245 + 12345) % 2147483648; noise[i] = s / 2147483648 * 255; }
  const r = FidelityCheck.compareGray(room(), noise, W, H);
  assert.equal(r.verdict, 'unfaithful', JSON.stringify(r));
  assert.ok(r.recall > r.score, 'le taux brut est corrigé du hasard');
});

test('Le résultat est déterministe', () => {
  const a = FidelityCheck.compareGray(room(), room({ texture: 10 }), W, H);
  const b = FidelityCheck.compareGray(room(), room({ texture: 10 }), W, H);
  assert.deepEqual(a, b);
});

test('Recadrage centré au format du rendu IA', () => {
  assert.deepEqual(FidelityCheck.coverCrop(1080, 720, 16 / 9), [0, 56.25, 1080, 607.5]);
  assert.deepEqual(FidelityCheck.coverCrop(1920, 1080, 1), [420, 0, 1080, 1080]);
});

test('Verdicts et libellés suivent les seuils calibrés', () => {
  const { faithful, review } = FidelityCheck.THRESHOLDS;
  assert.equal(FidelityCheck.verdictOf(faithful), 'faithful');
  assert.equal(FidelityCheck.verdictOf(review), 'review');
  assert.equal(FidelityCheck.verdictOf(review - 0.01), 'unfaithful');
  assert.equal(FidelityCheck.describe({ verdict: 'faithful', score: 0.734 }), 'Fidèle au plan · 73 %');
});

test('Adaptateur checkFidelity (fusion avec arena) : score en % et seul « fidèle » valide', () => {
  const FC = require('../js/fidelityCheck.js');
  assert.deepEqual(FC.toLoopResult(null), { score: 0, passed: false, details: null });
  const faithful = { score: 0.62, verdict: 'faithful' };
  assert.equal(FC.toLoopResult(faithful).score, 62);
  assert.equal(FC.toLoopResult(faithful).passed, true);
  assert.equal(FC.toLoopResult({ score: 0.35, verdict: 'review' }).passed, false);
  assert.equal(FC.toLoopResult({ score: 0.1, verdict: 'unfaithful' }).passed, false);
  assert.equal(typeof FC.checkFidelity, 'function');
});

/** Pièce synthétique à deux ouvertures (gauche + droite) pour tester suppressions et ajouts locaux. */
function twoBayRoom({ leftBay = true, rightBay = true, extraWindow = false, texture = 0, tone = 0, seed = 3 } = {}) {
  const g = new Float32Array(W * H);
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 205 + tone;
    if (y < 14) v = 238 + tone;
    if (y >= 68) v = 120 + tone;
    if (leftBay && x >= 14 && x < 44 && y >= 24 && y < 58) v = 55 + tone;
    if (rightBay && x >= 112 && x < 144 && y >= 24 && y < 58) v = 55 + tone;
    if (extraWindow && x >= 60 && x < 98 && y >= 22 && y < 56) v = 45 + tone;
    if (texture) v += (rand() - 0.5) * texture;
    g[y * W + x] = Math.max(0, Math.min(255, v));
  }
  return g;
}

test('Une suppression locale (ouverture effacée) est bloquée par la pire tuile malgré un bon score global', () => {
  const ref = twoBayRoom({ leftBay: true, rightBay: true });
  const ai = twoBayRoom({ leftBay: true, rightBay: false });
  const r = FidelityCheck.compareGray(ref, ai, W, H);
  assert.ok(r.score >= FidelityCheck.THRESHOLDS.faithful, `score global encore haut (${r.score})`);
  assert.ok(r.worstTile && r.worstTile.col === 2 && r.worstTile.score < FidelityCheck.THRESHOLDS.tileFaithful, JSON.stringify(r));
  assert.notEqual(r.verdict, 'faithful', JSON.stringify(r));
  assert.match(FidelityCheck.describe(r), /écart local.*droite/);
});

test('Un ajout sur une zone vide (fenêtre inventée sur mur nu) est bloqué par le contrôle inverse', () => {
  const ref = twoBayRoom({ leftBay: true, rightBay: true, extraWindow: false });
  const ai = twoBayRoom({ leftBay: true, rightBay: true, extraWindow: true });
  const r = FidelityCheck.compareGray(ref, ai, W, H);
  assert.ok(r.score >= FidelityCheck.THRESHOLDS.faithful, `score global encore haut (${r.score})`);
  assert.ok(r.addedTile && r.addedTile.col === 1 && r.addedTile.score < FidelityCheck.THRESHOLDS.addedFaithful, JSON.stringify(r));
  assert.equal(r.verdict, 'review', JSON.stringify(r));
  assert.match(FidelityCheck.describe(r), /ajout suspect.*centre/);
});

test('Une image fidèle avec bruit léger et changement de teinte reste acceptée (v2)', () => {
  const ref = twoBayRoom({ leftBay: true, rightBay: true });
  const ai = twoBayRoom({ leftBay: true, rightBay: true, texture: 22, tone: 14 });
  const r = FidelityCheck.compareGray(ref, ai, W, H);
  assert.equal(r.verdict, 'faithful', JSON.stringify(r));
  assert.equal(r.version, 2);
  assert.ok(r.worstTile && r.worstTile.score >= FidelityCheck.THRESHOLDS.tileFaithful, JSON.stringify(r));
  assert.equal(r.addedTile, undefined, JSON.stringify(r));
});
