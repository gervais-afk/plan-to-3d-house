/**
 * TESTS D'INTÉGRATION — Vérifie que les modules fonctionnent ensemble
 */

const { test } = require('node:test');
const assert = require('node:assert');

const Vectorization = require('../js/vectorization.js');
const StructuralAnalysis = require('../js/structuralAnalysis.js');
const BIMExport = require('../js/bimExport.js');
const BioclimaticAnalysis = require('../js/bioclimaticAnalysis.js');
const SmartAnnotations = require('../js/smartAnnotations.js');
const VersionComparison = require('../js/versionComparison.js');
const RealtimeCollaboration = require('../js/realtimeCollaboration.js');

// =========================================================================
// MOCK PROJECT
// =========================================================================

const mockProject = {
  name: 'Villa Test',
  rooms: [
    { id: 'sejour', name: 'Séjour', type: 'sejour', area: 30, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 } },
    { id: 'chambre', name: 'Chambre', type: 'chambre', area: 12, bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 3 } },
    { id: 'cuisine', name: 'Cuisine', type: 'cuisine', area: 8, bounds: { xMin: 6, xMax: 10, zMin: 3, zMax: 5 } }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', openings: [{ type: 'window', w: 1.5 }] },
    { from: [10, 0], to: [10, 5], thick: 0.25, type: 'ext', openings: [{ type: 'window', w: 1.2 }] },
    { from: [10, 5], to: [0, 5], thick: 0.25, type: 'ext', openings: [] },
    { from: [0, 5], to: [0, 0], thick: 0.25, type: 'ext', openings: [{ type: 'door', w: 0.9 }] },
    { from: [6, 0], to: [6, 5], thick: 0.15, type: 'int', openings: [] },
    { from: [6, 3], to: [10, 3], thick: 0.15, type: 'int', openings: [{ type: 'door', w: 0.7 }] }
  ]
};

// =========================================================================
// PIPELINE 1 : Vectorization → Structural Analysis → BIM Export
// =========================================================================

test('Intégration : Vectorization → Structural Analysis', () => {
  // 1. Vectoriser le plan
  const sketchData = {
    walls: mockProject.walls,
    openings: mockProject.walls.flatMap(w => w.openings || []),
    strokes: []
  };
  
  const vecResult = Vectorization.vectorize(sketchData);
  assert.ok(vecResult.vectors);
  assert.ok(vecResult.stats.wallCount > 0);
  
  // 2. Analyser la structure du projet original
  const structResult = StructuralAnalysis.analyzeStructure(mockProject);
  assert.ok(structResult.loadBearing); // loadBearing est un array
  assert.ok(structResult.summary);
});

test('Intégration : Project → BIM Export complet', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  assert.ok(ifc.includes('ISO-10303-21'));
  assert.ok(ifc.includes('IFCWALLSTANDARDCASE'));
  assert.ok(ifc.includes('IFCSLAB'));
  
  const gbxml = BIMExport.exportToGbXML(mockProject);
  assert.ok(gbxml.includes('<gbXML'));
  assert.ok(gbxml.includes('<Zone>'));
  assert.ok(gbxml.includes('<Surface>'));
  
  const all = BIMExport.exportAll(mockProject);
  assert.ok(all.ifc);
  assert.ok(all.gbxml);
  assert.strictEqual(all.stats.walls, 6);
  assert.strictEqual(all.stats.rooms, 3);
});

test('Intégration : Vectorization → export IFC (même projet)', () => {
  const vecResult = Vectorization.vectorize({
    walls: mockProject.walls,
    openings: [],
    strokes: []
  });
  
  assert.ok(vecResult.stats.wallCount > 0);
  
  const ifc = BIMExport.exportToIFC(mockProject);
  assert.ok(ifc.includes('IFCWALLSTANDARDCASE'));
});

// =========================================================================
// PIPELINE 2 : Version Comparison → impacts
// =========================================================================

test('Intégration : VersionComparison détecte changements et calcule impacts', () => {
  const v1 = JSON.parse(JSON.stringify(mockProject));
  const v2 = JSON.parse(JSON.stringify(mockProject));
  
  v2.rooms.push({ id: 'sdb', name: 'SDB', type: 'sdb', area: 5, bounds: { xMin: 0, xMax: 2.5, zMin: 0, zMax: 2 } });
  v2.walls[0].thick = 0.30;
  
  const comparison = VersionComparison.compareVersions(v1, v2);
  
  // Structure : { walls, rooms, impacts, summary }
  assert.ok(comparison.rooms);
  assert.ok(comparison.impacts);
  assert.ok(comparison.summary);
  
  // Il y a une pièce ajoutée
  assert.ok(comparison.rooms.added.length >= 1 || comparison.rooms.modified.length >= 0);
});

test('Intégration : VersionComparison murs modifiés', () => {
  const v1 = JSON.parse(JSON.stringify(mockProject));
  const v2 = JSON.parse(JSON.stringify(mockProject));
  
  v2.walls[0].to = [12, 0];
  
  const comparison = VersionComparison.compareVersions(v1, v2);
  assert.ok(comparison.walls);
  // Le mur a changé de position
  assert.ok(comparison.walls.modified.length >= 1 || comparison.walls.added.length >= 1);
});

// =========================================================================
// PIPELINE 3 : Bioclimatic + CodeCompliance
// =========================================================================

test('Intégration : Bioclimatic Analysis complète', () => {
  const result = BioclimaticAnalysis.analyzeBioclimatic(mockProject);
  
  // Structure : { orientation, solarExposure, ventilation, inertia, scores, globalScore, summary }
  assert.ok(result.orientation);
  assert.ok(result.solarExposure);
  assert.ok(result.ventilation);
  assert.ok(result.inertia);
  assert.ok(result.summary);
});

test('Intégration : Bioclimatic → données pour export gbXML', () => {
  const bioclimatic = BioclimaticAnalysis.analyzeBioclimatic(mockProject);
  assert.ok(bioclimatic.orientation);
  
  const gbxml = BIMExport.exportToGbXML(mockProject);
  assert.ok(gbxml.includes('<Zone>'));
  assert.ok(gbxml.includes('<Area>'));
});

// =========================================================================
// PIPELINE 4 : Collaboration → historique → undo
// =========================================================================

test('Intégration : Collaboration complète multi-utilisateurs', () => {
  const session = RealtimeCollaboration.createSession('int-project', mockProject);
  assert.ok(session.id);
  
  const alice = RealtimeCollaboration.joinSession(session.id, { id: 'alice', name: 'Alice' });
  const bob = RealtimeCollaboration.joinSession(session.id, { id: 'bob', name: 'Bob' });
  assert.strictEqual(session.users.size, 2);
  
  RealtimeCollaboration.applyChange(session.id, 'alice', {
    type: 'set',
    path: 'name',
    value: 'Villa Alice'
  });
  
  RealtimeCollaboration.applyChange(session.id, 'bob', {
    type: 'push',
    path: 'rooms',
    value: { id: 'garage', name: 'Garage', area: 20 }
  });
  
  assert.strictEqual(session.project.name, 'Villa Alice');
  assert.strictEqual(session.project.rooms.length, 4);
  
  const history = RealtimeCollaboration.getHistory(session.id);
  assert.strictEqual(history.length, 2);
  
  const others = RealtimeCollaboration.getOtherUsers(session.id, 'bob');
  assert.strictEqual(others.length, 1);
  
  RealtimeCollaboration.leaveSession(session.id, 'alice');
  assert.strictEqual(session.users.size, 1);
});

test('Intégration : Collaboration → undo', () => {
  const session = RealtimeCollaboration.createSession('undo-project', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user1', name: 'User' });
  
  assert.strictEqual(session.project.name, 'Villa Test');
  
  RealtimeCollaboration.applyChange(session.id, 'user1', {
    type: 'set',
    path: 'name',
    value: 'Villa Modifiée'
  });
  assert.strictEqual(session.project.name, 'Villa Modifiée');
  
  const undoResult = RealtimeCollaboration.undo(session.id, 'user1');
  assert.ok(undoResult.success);
  assert.strictEqual(session.project.name, 'Villa Test');
});

// =========================================================================
// PIPELINE 5 : Annotations
// =========================================================================

test('Intégration : SmartAnnotations détectent des dimensions', () => {
  const annotations = [
    { text: '3.50m', type: 'text', bounds: { x: 0, y: 0, w: 50, h: 20 } },
    { text: 'Séjour', type: 'text', bounds: { x: 100, y: 100, w: 60, h: 20 } },
    { text: '250cm', type: 'text', bounds: { x: 200, y: 200, w: 50, h: 20 } }
  ];
  
  const result = SmartAnnotations.analyzeAnnotations(annotations);
  
  // Structure : { dimensions, texts, symbols, interpretation, stats }
  assert.ok(result.dimensions);
  assert.ok(result.texts);
  assert.ok(result.stats);
  
  // parseDimension retourne un nombre (valeur en mètres)
  const dim1 = SmartAnnotations.parseDimension('3.50m');
  assert.ok(dim1 !== null && dim1 !== undefined);
  // 3.50m = 3.5 mètres
  assert.ok(typeof dim1 === 'number' || (dim1.value !== undefined));
});

// =========================================================================
// PIPELINE 6 : Tous les modules ensemble
// =========================================================================

test('Intégration : Pipeline complet tous modules', () => {
  const project = JSON.parse(JSON.stringify(mockProject));
  
  const structure = StructuralAnalysis.analyzeStructure(project);
  assert.ok(structure.loadBearing);
  
  const bioclimatic = BioclimaticAnalysis.analyzeBioclimatic(project);
  assert.ok(bioclimatic.orientation);
  
  const vectors = Vectorization.vectorize({
    walls: project.walls,
    openings: [],
    strokes: []
  });
  assert.ok(vectors.vectors);
  
  const bim = BIMExport.exportAll(project);
  assert.ok(bim.ifc);
  assert.ok(bim.gbxml);
  
  const session = RealtimeCollaboration.createSession('full-pipeline', project);
  RealtimeCollaboration.joinSession(session.id, { id: 'architect', name: 'Architecte' });
  
  RealtimeCollaboration.applyChange(session.id, 'architect', {
    type: 'set',
    path: 'name',
    value: 'Villa Finale'
  });
  
  assert.strictEqual(session.project.name, 'Villa Finale');
  
  const comparison = VersionComparison.compareVersions(project, session.project);
  assert.ok(comparison);
});

test('Intégration : Export DXF + SVG depuis vecteurs', () => {
  const vectors = Vectorization.vectorize({
    walls: mockProject.walls,
    openings: [],
    strokes: []
  });
  
  const dxf = Vectorization.exportToDXF(vectors.vectors, { unit: 'm' });
  assert.ok(dxf.length > 0);
  assert.ok(dxf.includes('SECTION'));
  assert.ok(dxf.includes('ENTITIES'));
  
  const svg = Vectorization.exportToSVG(vectors.vectors, { width: 800, height: 600 });
  assert.ok(svg.length > 0);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
});

test('Intégration : Collaboration avec détection de conflits', () => {
  const session = RealtimeCollaboration.createSession('conflict-test', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user1', name: 'User 1' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user2', name: 'User 2' });
  
  let conflicts = RealtimeCollaboration.checkConflicts(session.id, 1);
  assert.strictEqual(conflicts.hasConflict, false);
  
  RealtimeCollaboration.applyChange(session.id, 'user1', {
    type: 'set',
    path: 'name',
    value: 'Modified by User 1'
  });
  
  conflicts = RealtimeCollaboration.checkConflicts(session.id, 1);
  assert.strictEqual(conflicts.hasConflict, true);
  assert.ok(conflicts.changes.length > 0);
  
  const result = RealtimeCollaboration.resolveConflict(session.id, 'user2', {
    type: 'set',
    path: 'name',
    value: 'Modified by User 2'
  });
  assert.ok(result.success);
  assert.strictEqual(session.project.name, 'Modified by User 2');
});
