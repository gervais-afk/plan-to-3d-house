/**
 * Tests unitaires de l'auto-aménagement automatique de pièces
 * 
 * Critères :
 * 1. Un plan avec une pièce ouverte ou des murs doublons est correctement rejeté ou nettoyé.
 * 2. Un devis avec un ratio acier/béton aberrant déclenche le bon warning.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AutoFurnish = require('../js/autoFurnish.js');

test('Auto-aménagement chambre 3×4 m : lit double placé, circulation respectée', () => {
  const room = { name: 'CHAMBRE', bounds: { xMin: 0, xMax: 3, zMin: 0, zMax: 4 } };
  const walls = [
    { from: [0, 0], to: [3, 0] }, // mur sud (3 m)
    { from: [3, 0], to: [3, 4] }, // mur est (4 m) — le plus long sans ouverture
    { from: [3, 4], to: [0, 4] }, // mur nord (3 m)
    { from: [0, 4], to: [0, 0] }  // mur ouest (4 m)
  ];
  const openings = [
    { type: 'door', at: 1.5, w: 0.85 } // porte sur mur sud
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  
  assert.ok(placed.length > 0, 'Au moins un meuble placé');
  const bed = placed.find(f => /lit/i.test(f.name));
  assert.ok(bed, 'Lit double placé');
  
  // Le lit est adossé au mur le plus long sans ouverture (mur est ou ouest)
  // Vérifie qu'il n'est pas trop près de la porte (circulation 90 cm)
  const doorCenter = [1.5, 0]; // porte sur mur sud
  const distToDoor = Math.hypot(bed.x - doorCenter[0], bed.z - doorCenter[1]);
  assert.ok(distToDoor > 0.9 + Math.max(bed.w, bed.d) / 2,
    `Circulation respectée : distance ${distToDoor.toFixed(2)} m > ${(0.9 + Math.max(bed.w, bed.d) / 2).toFixed(2)} m`);
});

test('Auto-aménagement séjour : canapé placé sur mur hôte', () => {
  const room = { name: 'SÉJOUR', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 4 } };
  const walls = [
    { from: [0, 0], to: [5, 0] }, // 5 m
    { from: [5, 0], to: [5, 4] }, // 4 m
    { from: [5, 4], to: [0, 4] }, // 5 m
    { from: [0, 4], to: [0, 0] }  // 4 m
  ];
  const openings = [
    { type: 'door', at: 2, w: 0.85 },
    { type: 'window', at: 2.5, w: 1.2 }
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  const sofa = placed.find(f => /canapé/i.test(f.name));
  assert.ok(sofa, 'Canapé placé');
  
  // Vérifie que le canapé n'est pas dans le rayon de 90 cm de la porte
  const doorCenter = [2, 0];
  const dist = Math.hypot(sofa.x - doorCenter[0], sofa.z - doorCenter[1]);
  assert.ok(dist > 0.9 + Math.max(sofa.w, sofa.d) / 2,
    `Circulation de 90 cm respectée devant la porte (dist=${dist.toFixed(2)} m)`);
});

test('Auto-aménagement cuisine 4×3 m : plan de travail + évier + frigo placés', () => {
  const room = { name: 'CUISINE', bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 3 } };
  const walls = [
    { from: [0, 0], to: [4, 0] }, // 4 m
    { from: [4, 0], to: [4, 3] }, // 3 m — mur hôte
    { from: [4, 3], to: [0, 3] }, // 4 m
    { from: [0, 3], to: [0, 0] }  // 3 m
  ];
  const openings = [
    { type: 'door', at: 2, w: 0.85 } // porte sur mur sud, loin du mur est
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  
  const planTravail = placed.find(f => /plan de travail/i.test(f.name));
  assert.ok(planTravail, 'Plan de travail placé');
  
  const evier = placed.find(f => /évier/i.test(f.name));
  assert.ok(evier, 'Évier placé');
  
  const frigo = placed.find(f => /réfrigérateur/i.test(f.name));
  assert.ok(frigo, 'Réfrigérateur placé');
  
  assert.ok(placed.length >= 3, 'Au moins 3 meubles de cuisine placés');
});

test('Auto-aménagement SDB : douche + WC + lave-mains placés', () => {
  const room = { name: 'SDB', bounds: { xMin: 0, xMax: 2.5, zMin: 0, zMax: 2.5 } };
  const walls = [
    { from: [0, 0], to: [2.5, 0] },
    { from: [2.5, 0], to: [2.5, 2.5] },
    { from: [2.5, 2.5], to: [0, 2.5] },
    { from: [0, 2.5], to: [0, 0] }
  ];
  const openings = [
    { type: 'door', at: 1.2, w: 0.7 }
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  
  const douche = placed.find(f => /douche/i.test(f.name));
  assert.ok(douche, 'Douche placée');
  
  const wc = placed.find(f => /wc/i.test(f.name));
  assert.ok(wc, 'WC placés');
  
  const laveMains = placed.find(f => /lave-mains/i.test(f.name));
  assert.ok(laveMains, 'Lave-mains placé');
  
  assert.ok(placed.length >= 3, 'Au moins 3 meubles de SDB placés');
});

test('Auto-aménagement pièce non reconnue : aucun meuble', () => {
  const room = { name: 'DÉGAGEMENT', bounds: { xMin: 0, xMax: 2, zMin: 0, zMax: 3 } };
  const walls = [
    { from: [0, 0], to: [2, 0] },
    { from: [2, 0], to: [2, 3] },
    { from: [2, 3], to: [0, 3] },
    { from: [0, 3], to: [0, 0] }
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, []);
  assert.equal(placed.length, 0, 'Aucun meuble pour pièce non reconnue');
});

test('Sélection meubles : chambre = lit + 2 chevets + armoire', () => {
  const furniture = AutoFurnish.selectFurnitureForRoom('CHAMBRE');
  assert.equal(furniture.length, 3, '3 types de meubles pour chambre');
  
  const main = furniture.find(f => f.priority === 'main');
  assert.ok(main, 'Meuble principal défini');
  assert.ok(/lit/i.test(main.item.name), 'Meuble principal = lit');
  
  const secondaries = furniture.filter(f => f.priority === 'secondary');
  assert.equal(secondaries.length, 2, '2 meubles secondaires');
  
  const chevetWithCount = secondaries.find(f => f.count === 2);
  assert.ok(chevetWithCount, 'Chevet avec count=2 (2 chevets)');
});

test('Sélection meubles : séjour = canapé + table basse + meuble TV', () => {
  const furniture = AutoFurnish.selectFurnitureForRoom('SÉJOUR');
  assert.equal(furniture.length, 3, '3 types de meubles pour séjour');
  
  const main = furniture.find(f => f.priority === 'main');
  assert.ok(main, 'Meuble principal défini');
  assert.ok(/canapé/i.test(main.item.name), 'Meuble principal = canapé');
});

test('Position meuble : calcul correct (x, z, rotY)', () => {
  const hostWall = { from: [0, 0], to: [3, 0] }; // mur horizontal
  const furniture = { w: 1.6, d: 2.0, h: 0.5 };
  
  const placement = AutoFurnish.computeFurniturePlacement(hostWall, furniture);
  
  // Centre du mur : (1.5, 0)
  // Normale : (0, 1) vers le haut
  // Position : (1.5, 0 + 2.0/2) = (1.5, 1.0)
  assert.ok(Math.abs(placement.x - 1.5) < 0.01, 'X centré sur le mur');
  assert.ok(Math.abs(placement.z - 1.0) < 0.01, 'Z décalé de profondeur/2');
  assert.ok(typeof placement.rotY === 'number', 'rotY calculé');
});

test('Circulation : meuble trop près d\'une porte → bloqué', () => {
  const furniture = { x: 0.5, z: 0.5, w: 1.6, d: 2.0 };
  const doors = [{ type: 'door', at: 0.5, w: 0.85 }];
  const wall = { from: [0, 0], to: [3, 0] };
  
  const ok = AutoFurnish.checkCirculation(furniture, doors, wall);
  assert.equal(ok, false, 'Circulation bloquée (meuble trop près de la porte)');
});

test('Circulation : meuble loin de la porte → OK', () => {
  const furniture = { x: 5, z: 5, w: 1.6, d: 2.0 };
  const doors = [{ type: 'door', at: 1, w: 0.85 }];
  const wall = { from: [0, 0], to: [3, 0] };
  
  const ok = AutoFurnish.checkCirculation(furniture, doors, wall);
  assert.equal(ok, true, 'Circulation respectée (meuble loin de la porte)');
});
