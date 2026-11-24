/**
 * Tests unitaires du bouclier de sécurité :
 *   - Module 1 : Validateur topologique (js/aiTopology.js)
 *   - Module 2 : Garde-fous métier / sanity checks (js/costEstimate.js)
 *
 * Critères de recette :
 *   1. Un plan avec pièce ouverte ou murs doublons est rejeté ou nettoyé.
 *   2. Un devis avec un ratio acier/béton aberrant déclenche le bon warning.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AITopology = require('../js/aiTopology.js');
const CostEstimate = require('../js/costEstimate.js');

// ─── Helpers ────────────────────────────────────────────────────────────

const wall = (from, to, type = 'ext', thick = 0.25) => ({ from, to, type, thick, openings: [] });
const wallAI = (x1, y1, x2, y2, kind = 'exterior') => ({ x1, y1, x2, y2, kind });
const roomClosed = (name, poly, floor = 'parquet', habitable = true) => ({ name, polygon: poly, floor, habitable });

// ─────────────────────────────────────────────────────────────────────────
// MODULE 1 — VALIDATEUR TOPOLOGIQUE (js/aiTopology.js)
// ─────────────────────────────────────────────────────────────────────────

test('Topologie : plan valide (polygones fermés, murs sans doublon) — score 100', () => {
  const ppm = 100;
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 1000, 0, 'exterior'),
      wallAI(1000, 0, 1000, 800, 'exterior'),
      wallAI(1000, 800, 0, 800, 'exterior'),
      wallAI(0, 800, 0, 0, 'exterior'),
      wallAI(500, 0, 500, 800, 'interior')
    ],
    rooms: [
      roomClosed('Séjour', [[0, 0], [500, 0], [500, 800], [0, 800], [0, 0]]),
      roomClosed('Chambre', [[500, 0], [1000, 0], [1000, 800], [500, 800], [500, 0]])
    ],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.equal(r.valid, true);
  assert.equal(r.score, 100);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.cleanedGeometry.rooms.length, 2);
  assert.equal(r.cleanedGeometry.walls.length, 5);
});

test('Topologie : pièce ouverte (> 10 cm) → erreur bloquante, fuite de surface', () => {
  const ppm = 100;
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 1000, 0), wallAI(1000, 0, 1000, 800),
      wallAI(1000, 800, 0, 800), wallAI(0, 800, 0, 0)
    ],
    // Dernier sommet décalé de 850 px = 8,5 m → bien > 10 cm
    rooms: [roomClosed('Séjour', [[50, 50], [950, 50], [950, 750], [50, 900]])],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => /ouvert|fuite/i.test(e)), 'Doit signaler un polygone ouvert');
  assert.ok(r.score < 80, `Score ${r.score} trop élevé pour un plan avec fuite de surface`);
  assert.equal(r.cleanedGeometry.rooms.length, 0, 'Pièce rejetée : absente du cleanedGeometry');
});

test('Topologie : auto-fermeture tolérable (2 cm < écart < 10 cm) → warning', () => {
  const ppm = 100;
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 1000, 0), wallAI(1000, 0, 1000, 800),
      wallAI(1000, 800, 0, 800), wallAI(0, 800, 0, 5)   // 5 cm d'écart
    ],
    rooms: [roomClosed('Pièce', [[0, 0], [1000, 0], [1000, 800], [0, 800], [0, 5]])],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.equal(r.valid, true, 'Auto-fermeture tolérable : plan valide');
  assert.ok(r.warnings.some(w => /auto-fermeture/i.test(w)), 'Doit avertir de l\'auto-fermeture');
  assert.ok(r.score >= 80, `Score ${r.score} : pénalité légère pour auto-fermeture`);
});

test('Topologie : mur doublon colinéaire → retiré du cleanedGeometry', () => {
  const ppm = 100;
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 1000, 0),      // mur complet bas
      wallAI(200, 0, 700, 0),      // DOUBLON : même axe, plus court (5 m de chevauchement)
      wallAI(1000, 0, 1000, 800),
      wallAI(1000, 800, 0, 800),
      wallAI(0, 800, 0, 0)
    ],
    rooms: [roomClosed('Séjour', [[0, 0], [1000, 0], [1000, 800], [0, 800], [0, 0]])],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.ok(r.warnings.some(w => /doublon|chevauchement/i.test(w)), 'Doit signaler le mur doublon');
  // Le mur doublon doit être retiré : 5 murs initiaux → 4 dans le cleaned
  assert.equal(r.cleanedGeometry.walls.length, 4, 'Un mur doublon retiré du cleanedGeometry');
});

test('Topologie : murs parallèles proches (faux positif évité) — non confondus avec des doublons', () => {
  const ppm = 100;
  // Deux murs parallèles décalés de 25 cm (épaisseur de mur standard) ≠ doublons
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 1000, 0),        // face extérieure du mur bas
      wallAI(0, 25, 1000, 25),       // face intérieure du mur bas (25 cm plus haut)
      wallAI(1000, 0, 1000, 800),
      wallAI(1000, 800, 0, 800),
      wallAI(0, 800, 0, 0)
    ],
    rooms: [roomClosed('Séjour', [[0, 25], [1000, 25], [1000, 800], [0, 800], [0, 25]])],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  // Les murs parallèles à 25 cm ne doivent PAS être détectés comme doublons
  assert.equal(r.cleanedGeometry.walls.length, 5, 'Murs parallèles conservés (pas des doublons)');
  assert.ok(!r.warnings.some(w => /doublon/i.test(w)), 'Aucun warning doublon pour murs parallèles décalés');
});

test('Topologie : échelle absente → rejet immédiat avec message explicite', () => {
  const r = AITopology.validate({ walls: [wallAI(0, 0, 100, 0)], rooms: [] });
  assert.equal(r.valid, false);
  assert.equal(r.score, 0);
  assert.ok(r.errors[0].includes('Échelle introuvable'), 'Message d\'échelle manquant');
  assert.equal(r.cleanedGeometry, null);
});

test('Topologie : polygone avec < 3 sommets → erreur', () => {
  const ppm = 100;
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [wallAI(0, 0, 100, 0), wallAI(100, 0, 100, 100), wallAI(100, 100, 0, 0)],
    rooms: [roomClosed('Mini', [[0, 0], [100, 0]])],   // seulement 2 sommets
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.ok(r.errors.some(e => /invalide|3 sommets/i.test(e)), 'Polygone à 2 sommets rejeté');
  assert.equal(r.cleanedGeometry.rooms.length, 0);
});

test('Topologie : ratio pièces/emprise hors plage détecté', () => {
  const ppm = 100;
  // Grande emprise (20×20 m) mais une seule petite pièce (3×3 m) → ratio ≈ 9/400 = 2,25 %
  const plan = {
    scale: { px_per_meter: ppm },
    walls: [
      wallAI(0, 0, 2000, 0), wallAI(2000, 0, 2000, 2000),
      wallAI(2000, 2000, 0, 2000), wallAI(0, 2000, 0, 0)
    ],
    rooms: [roomClosed('Petit', [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]])],
    openings: [], columns: []
  };
  const r = AITopology.validate(plan);
  assert.ok(r.errors.some(e => /couverture|insuffisante/i.test(e)),
    'Doit détecter une couverture insuffisante (< 60 %)');
});

// ─────────────────────────────────────────────────────────────────────────
// MODULE 2 — GARDE-FOUS MÉTIER (sanityChecks dans js/costEstimate.js)
// ─────────────────────────────────────────────────────────────────────────

test('Sanity checks : projet normal 10×8 m — ratios corrects, avertissements attendus', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [
      wall([0, 0], [10, 0]), wall([10, 0], [10, 8]),
      wall([10, 8], [0, 8]), wall([0, 8], [0, 0])
    ],
    rooms: [{
      name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 },
      habitable: true, floorType: 'parquet',
      poly: [[0, 0], [10, 0], [10, 8], [0, 8]]
    }]
  };
  const result = CostEstimate.estimate(project);
  const checks = CostEstimate.sanityChecks(result, project);

  // Structure de retour
  assert.equal(typeof checks.valid, 'boolean');
  assert.ok(Array.isArray(checks.warnings));
  assert.ok(Array.isArray(checks.errors));
  assert.ok(checks.details);

  // Ratios calculés correctement
  const steel = result.structure.steel.reduce((s, i) => s + i.massKg, 0);
  const concrete = result.structure.concreteOrder;
  assert.equal(checks.details.steelPerConcrete, Math.round(steel / concrete * 10) / 10);
  assert.ok(checks.details.steelPerConcrete > 0);
  assert.ok(checks.details.concretePerArea > 0);
  assert.equal(checks.details.compactness, Math.round(36 / Math.sqrt(80) * 10) / 10);

  // Le modèle BA/HA exclut armatures de semelles/dalles/linteaux → ratio < 60 est attendu
  assert.ok(checks.details.steelPerConcrete < 60, 'Ratio < 60 car modèle incomplet (connu)');
  assert.ok(checks.warnings.some(w => /acier.*béton|ratio/i.test(w)),
    'Avertissement ratio acier/béton déclenché (limite du modèle documentée)');

  // Béton/m² raisonnable
  assert.ok(checks.details.concretePerArea < 0.25, 'Pas de surdimensionnement béton');

  // Compacité : rectangle 10×8 → 36/√80 = 4.02
  assert.ok(checks.details.compactness >= 2.5 && checks.details.compactness <= 5.5,
    `Compacité ${checks.details.compactness} dans la plage normale`);
});

test('Sanity checks : tiny building 2×2 m — béton/m² > 0,25 ET chambre < 7 m²', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [
      wall([0, 0], [2, 0]), wall([2, 0], [2, 2]),
      wall([2, 2], [0, 2]), wall([0, 2], [0, 0])
    ],
    rooms: [{
      name: 'CHAMBRE', bounds: { xMin: 0, xMax: 2, zMin: 0, zMax: 2 },
      habitable: true, floorType: 'parquet'
    }]
  };
  const result = CostEstimate.estimate(project);
  const checks = CostEstimate.sanityChecks(result, project);

  // Béton/m² élevé (beaucoup de béton pour 4 m² habitables)
  assert.ok(checks.details.concretePerArea > 0.25,
    `Béton/m² ${checks.details.concretePerArea} > 0,25 pour tiny building`);
  assert.ok(checks.warnings.some(w => /surdimensionnement|erreur géométrique/i.test(w)),
    'Alerte surdimensionnement béton déclenchée');

  // Chambre < 7 m²
  assert.ok(checks.warnings.some(w => /chambre.*7 m²|habitabilité/i.test(w)),
    'Alerte chambre trop petite déclenchée');
  assert.ok(checks.details.roomIssues.some(i => /chambre/i.test(i)),
    'roomIssues contient l\'alerte chambre');

  // Pas d'ouverture vitrée
  assert.ok(checks.warnings.some(w => /ouverture vitrée|éclairage/i.test(w)),
    'Alerte absence d\'ouverture vitrée déclenchée');
});

test('Sanity checks : pièce de vie avec fenêtre → pas d\'alerte éclairage', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [
      { from: [0, 0], to: [10, 0], type: 'ext', thick: 0.25,
        openings: [{ type: 'window', at: 5, w: 1.2, h: 1.25, sill: 0.95 }] },
      wall([10, 0], [10, 8]), wall([10, 8], [0, 8]), wall([0, 8], [0, 0])
    ],
    rooms: [{
      name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 },
      habitable: true, floorType: 'parquet',
      poly: [[0, 0], [10, 0], [10, 8], [0, 8]]
    }]
  };
  const result = CostEstimate.estimate(project);
  const checks = CostEstimate.sanityChecks(result, project);

  assert.equal(checks.details.roomIssues.length, 0, 'Aucun problème d\'habitabilité avec fenêtre');
  assert.ok(!checks.warnings.some(w => /ouverture vitrée|éclairage/i.test(w)),
    'Pas d\'alerte éclairage quand la fenêtre existe');
});

test('Sanity checks : pièce de vie sans fenêtre → alerte éclairage naturel', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [
      wall([0, 0], [10, 0]), wall([10, 0], [10, 8]),
      wall([10, 8], [0, 8]), wall([0, 8], [0, 0])
    ],
    rooms: [{
      name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 },
      habitable: true, floorType: 'parquet',
      poly: [[0, 0], [10, 0], [10, 8], [0, 8]]
    }]
  };
  const result = CostEstimate.estimate(project);
  const checks = CostEstimate.sanityChecks(result, project);

  assert.ok(checks.warnings.some(w => /ouverture vitrée|éclairage/i.test(w)),
    'Alerte absence de fenêtre pour le séjour');
  assert.ok(checks.details.roomIssues.length >= 1, 'roomIssues contient le problème');
});

test('Sanity checks : CSV exporté avec l\'avertissement anti-double comptage en en-tête', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [
      wall([0, 0], [10, 0]), wall([10, 0], [10, 8]),
      wall([10, 8], [0, 8]), wall([0, 8], [0, 0])
    ],
    rooms: [{ name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 }, habitable: true }]
  };
  const result = CostEstimate.estimate(project);
  const csv = CostEstimate.bordereauCSV(result, 'Test CSV');

  // L'avertissement anti-double comptage doit être en 2e ligne du CSV
  const lines = csv.split('\r\n');
  assert.ok(lines[1].includes('AVERTISSEMENT'), 'Avertissement en 2e ligne du CSV');
  assert.ok(lines[1].includes('additionner'), 'Texte de l\'avertissement présent');
  assert.ok(lines[1].includes('bordereau') && lines[1].includes('budget'), 'Mention bordereau ET budget');
});

test('Sanity checks : structure désactivée → pas de calcul acier/béton', () => {
  const project = {
    config: { wallHeight: 3 },
    walls: [wall([0, 0], [10, 0]), wall([10, 0], [10, 8]), wall([10, 8], [0, 8]), wall([0, 8], [0, 0])],
    rooms: [{ name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 }, habitable: true }]
  };
  const result = CostEstimate.estimate(project, { structure: { enabled: false } });
  const checks = CostEstimate.sanityChecks(result, project);

  assert.equal(checks.details.steelPerConcrete, 0, 'Ratio nul quand structure désactivée');
  assert.ok(!checks.warnings.some(w => /acier.*béton/i.test(w)),
    'Pas d\'alerte ratio quand pas de structure');
});

// ─────────────────────────────────────────────────────────────────────────
// COMPATIBILITÉ NAVIGATEUR
// ─────────────────────────────────────────────────────────────────────────

test('Compatibilité navigateur : aiTopology.js et sanityChecks sans module.exports', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');

  // aiTopology.js dans un contexte navigateur (pas de module.exports)
  const topoCode = fs.readFileSync(require.resolve('../js/aiTopology.js'), 'utf8')
    + '\nglobalThis.AITopology = AITopology;';
  const topoCtx = vm.createContext({});
  vm.runInContext(topoCode, topoCtx);
  assert.ok(topoCtx.AITopology, 'AITopology exposé globalement');
  assert.equal(typeof topoCtx.AITopology.validate, 'function');

  // costEstimate.js avec sanityChecks
  const costCode = fs.readFileSync(require.resolve('../js/costEstimate.js'), 'utf8')
    + '\nglobalThis.CostEstimate = CostEstimate;';
  const costCtx = vm.createContext({});
  vm.runInContext(costCode, costCtx);
  assert.ok(costCtx.CostEstimate, 'CostEstimate exposé globalement');
  assert.equal(typeof costCtx.CostEstimate.sanityChecks, 'function');
});
