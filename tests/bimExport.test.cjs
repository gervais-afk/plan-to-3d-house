/**
 * TESTS UNITAIRES — bimExport.js
 * Export IFC/gbXML
 */

const { test } = require('node:test');
const assert = require('node:assert');
const BIMExport = require('../js/bimExport.js');

// =========================================================================
// MOCK DATA
// =========================================================================

const mockProject = {
  name: 'Test Project',
  rooms: [
    { id: 'sejour', name: 'Séjour', type: 'sejour', area: 30, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 } },
    { id: 'chambre', name: 'Chambre', type: 'chambre', area: 12, bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 3 } }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', openings: [{ type: 'window', w: 1.5 }] },
    { from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext', openings: [] },
    { from: [6, 0], to: [6, 3], thick: 0.15, type: 'int', openings: [] }
  ]
};

// =========================================================================
// EXPORT IFC
// =========================================================================

test('BIMExport - exportToIFC() génère IFC valide', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  
  assert.ok(ifc.includes('ISO-10303-21;'));
  assert.ok(ifc.includes('HEADER;'));
  assert.ok(ifc.includes('DATA;'));
  assert.ok(ifc.includes('ENDSEC;'));
  assert.ok(ifc.includes('END-ISO-10303-21;'));
});

test('BIMExport - exportToIFC() inclut projet', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  
  assert.ok(ifc.includes('IFCPROJECT'));
  assert.ok(ifc.includes('Test Project'));
});

test('BIMExport - exportToIFC() inclut murs', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  
  assert.ok(ifc.includes('IFCWALLSTANDARDCASE'));
  // 3 murs dans le mock
  const wallCount = (ifc.match(/IFCWALLSTANDARDCASE/g) || []).length;
  assert.strictEqual(wallCount, 3);
});

test('BIMExport - exportToIFC() inclut dalles', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  
  assert.ok(ifc.includes('IFCSLAB'));
  // 2 pièces dans le mock
  const slabCount = (ifc.match(/IFCSLAB/g) || []).length;
  assert.strictEqual(slabCount, 2);
});

test('BIMExport - exportToIFC() inclut ouvertures', () => {
  const ifc = BIMExport.exportToIFC(mockProject);
  
  // 1 fenêtre dans le mock
  assert.ok(ifc.includes('IFCWINDOW'));
});

test('BIMExport - exportToIFC() options personnalisation', () => {
  const ifc = BIMExport.exportToIFC(mockProject, {
    projectName: 'Custom Project',
    siteName: 'Custom Site',
    buildingName: 'Custom Building'
  });
  
  assert.ok(ifc.includes('Custom Project'));
  assert.ok(ifc.includes('Custom Site'));
  assert.ok(ifc.includes('Custom Building'));
});

// =========================================================================
// EXPORT gbXML
// =========================================================================

test('BIMExport - exportToGbXML() génère XML valide', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  assert.ok(gbxml.includes('<?xml version="1.0"'));
  assert.ok(gbxml.includes('<gbXML'));
  assert.ok(gbxml.includes('</gbXML>'));
});

test('BIMExport - exportToGbXML() inclut zones thermiques', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  assert.ok(gbxml.includes('<Zone>'));
  assert.ok(gbxml.includes('Séjour'));
  assert.ok(gbxml.includes('Chambre'));
});

test('BIMExport - exportToGbXML() inclut surfaces', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  assert.ok(gbxml.includes('<Surface>'));
  assert.ok(gbxml.includes('ExteriorWall'));
  assert.ok(gbxml.includes('InteriorWall'));
});

test('BIMExport - exportToGbXML() inclut ouvertures', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  assert.ok(gbxml.includes('<Opening'));
  assert.ok(gbxml.includes('type="window"'));
});

test('BIMExport - exportToGbXML() calcule volumes', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  // Séjour: 30m² * 2.5m = 75m³
  assert.ok(gbxml.includes('<Volume>75.00</Volume>'));
  // Chambre: 12m² * 2.5m = 30m³
  assert.ok(gbxml.includes('<Volume>30.00</Volume>'));
});

test('BIMExport - exportToGbXML() types de zones', () => {
  const gbxml = BIMExport.exportToGbXML(mockProject);
  
  assert.ok(gbxml.includes('<ZoneType>LivingRoom</ZoneType>'));
  assert.ok(gbxml.includes('<ZoneType>Bedroom</ZoneType>'));
});

// =========================================================================
// EXPORT COMPLET
// =========================================================================

test('BIMExport - exportAll() exporte tous formats', () => {
  const result = BIMExport.exportAll(mockProject);
  
  assert.ok(result.ifc);
  assert.ok(result.gbxml);
  assert.ok(result.stats);
});

test('BIMExport - exportAll() calcule stats', () => {
  const result = BIMExport.exportAll(mockProject);
  
  assert.strictEqual(result.stats.walls, 3);
  assert.strictEqual(result.stats.rooms, 2);
  assert.strictEqual(result.stats.openings, 1); // 1 fenêtre
});

// =========================================================================
// UTILITAIRES
// =========================================================================

test('BIMExport - generateGUID() génère GUID valide', () => {
  const guid = BIMExport.generateGUID();
  
  assert.ok(typeof guid === 'string');
  assert.ok(guid.length > 0);
  // Format: xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx
  assert.ok(guid.includes('_'));
});

test('BIMExport - escapeXML() échappe caractères spéciaux', () => {
  assert.strictEqual(BIMExport.escapeXML('<test>'), '&lt;test&gt;');
  assert.strictEqual(BIMExport.escapeXML('"quote"'), '&quot;quote&quot;');
  assert.strictEqual(BIMExport.escapeXML("it's"), 'it&apos;s');
  assert.strictEqual(BIMExport.escapeXML('ampersand &'), 'ampersand &amp;');
});

test('BIMExport - escapeXML() gère null/undefined', () => {
  assert.strictEqual(BIMExport.escapeXML(null), 'null');
  assert.strictEqual(BIMExport.escapeXML(undefined), 'undefined');
});

// =========================================================================
// INTÉGRATION
// =========================================================================

test('BIMExport - workflow complet export IFC', () => {
  const project = {
    name: 'Integration Test',
    rooms: [{ id: 'r1', name: 'Room 1', area: 20, bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 5 } }],
    walls: [{ from: [0, 0], to: [4, 0], thick: 0.2, type: 'ext', openings: [] }]
  };
  
  const ifc = BIMExport.exportToIFC(project);
  
  // Vérifier structure complète
  assert.ok(ifc.startsWith('ISO-10303-21;'));
  assert.ok(ifc.endsWith('END-ISO-10303-21;'));
  assert.ok(ifc.includes('IFCPROJECT'));
  assert.ok(ifc.includes('IFCWALLSTANDARDCASE'));
  assert.ok(ifc.includes('IFCSLAB'));
});

test('BIMExport - workflow complet export gbXML', () => {
  const project = {
    name: 'Integration Test',
    rooms: [{ id: 'r1', name: 'Room 1', area: 20, bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 5 } }],
    walls: [{ from: [0, 0], to: [4, 0], thick: 0.2, type: 'ext', openings: [] }]
  };
  
  const gbxml = BIMExport.exportToGbXML(project);
  
  // Vérifier structure complète
  assert.ok(gbxml.startsWith('<?xml'));
  assert.ok(gbxml.endsWith('</gbXML>'));
  assert.ok(gbxml.includes('<Project'));
  assert.ok(gbxml.includes('<Zone>'));
  assert.ok(gbxml.includes('<Surface>'));
});
