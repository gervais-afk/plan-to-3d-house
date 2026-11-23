const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assessProposal } = require('../js/planProposalReview');

test('la revue du plan signale l’échelle estimée, les ouvertures non rattachées et l’absence de score de confiance', () => {
  const out = {
    reference: '11,50 m',
    walls: [{ type: 'ext', openings: [{ kind: 'door' }] }],
    rooms: [{}, {}],
    columns: []
  };
  const result = assessProposal({ openings: [{}, {}] }, out, { scale: 'ai' });

  assert.equal(result.mappedOpenings, 1);
  assert.equal(result.unmatchedOpenings, 1);
  assert.ok(result.warnings.some(warning => warning.includes('11,50 m')));
  assert.ok(result.warnings.some(warning => warning.includes('1 ouverture')));
  assert.ok(result.warnings.some(warning => warning.includes('ne fournit pas de score de confiance')));
});

test('la revue avertit quand le périmètre extérieur ou les pièces semblent incomplets', () => {
  const result = assessProposal({ openings: [] }, { reference: null, walls: [{ type: 'int', openings: [] }], rooms: [{}], columns: [{}, {}] }, { scale: 'calibrated' });
  assert.ok(result.warnings.some(warning => warning.includes('mur extérieur')));
  assert.ok(result.warnings.some(warning => warning.includes('Peu de pièces')));
  assert.ok(result.warnings.some(warning => warning.includes('2 poteau')));
  assert.equal(result.mappedOpenings, 0);
  assert.equal(result.unmatchedOpenings, 0);
});
