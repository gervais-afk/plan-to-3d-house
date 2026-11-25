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

test('la revue expose la liste structurée « À vérifier », la topologie et le rendu DOM sans innerHTML', () => {
  const { formatToVerifyItem, renderReview } = require('../js/planProposalReview');
  const out = {
    walls: [{ type: 'ext', openings: [] }],
    rooms: [{}, {}],
    columns: [],
    topology: { valid: false, score: 60, errors: ['Pièce « X » : polygone auto-intersectant.'], warnings: [] },
    toVerify: [
      { type: 'ouverture', label: 'Porte', reason: 'Ouverture trop éloignée de tout mur (0.80 m ≥ 0,60 m).', position: { x: 2.5, z: 1.2 } },
      { type: 'mur', label: 'Cloison', reason: 'Mur trop court (0.15 m < 0,20 m).', position: { x: 0.4, z: 0.1 } }
    ]
  };
  const assessment = assessProposal({ openings: [{}] }, out, { scale: 'calibrated', mode: 'replace' });
  assert.equal(assessment.toVerify.length, 2);
  assert.equal(assessment.topology.score, 60);
  assert.ok(assessment.warnings.some(w => w.includes('2 élément(s) écarté(s)')));
  assert.ok(assessment.warnings.some(w => w.includes('Validation topologique')));
  assert.match(formatToVerifyItem(assessment.toVerify[0]), /\[ouverture\] Porte — .*x 2\.50 m, z 1\.20 m/);

  // Faux DOM minimal pour vérifier renderReview
  const makeNode = tag => ({
    tag, className: '', textContent: '', children: [],
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); }
  });
  const doc = {
    createElement: tag => makeNode(tag),
    createTextNode: text => ({ tag: '#text', textContent: text, children: [] })
  };
  const container = makeNode('div');
  container.ownerDocument = doc;
  renderReview(container, assessment, { mode: 'replace' });

  const dumpText = node => (node.textContent || '') + node.children.map(dumpText).join(' ');
  const rendered = dumpText(container);
  assert.ok(rendered.includes('À vérifier (2)'));
  assert.ok(rendered.includes('[ouverture]'));
  assert.ok(rendered.includes('0.80 m'));
  assert.ok(rendered.includes('x 2.50 m, z 1.20 m'));
  assert.ok(rendered.includes('[mur]'));
  assert.ok(rendered.includes('Validation topologique — score 60/100'));
});
