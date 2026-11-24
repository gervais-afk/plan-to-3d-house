const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ViewOrder = require('../js/viewOrder');
const presentation = require('../presentationStore');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-test-'));
  const projects = path.join(root, 'projects');
  for (const slug of ['plan-a', 'plan-b']) {
    const dir = path.join(projects, slug, 'generated');
    fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
    fs.writeFileSync(path.join(projects, slug, 'project.json'), '{}');
    fs.writeFileSync(path.join(dir, 'images', 'vue.jpg'), `image-${slug}`);
    fs.writeFileSync(path.join(dir, 'renders', 'capture.jpg'), `capture-${slug}`);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ items: [{ id: 'vue', type: 'image', file: `projects/${slug}/generated/images/vue.jpg` }] }));
  }
  return { root, projects, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('Les trois emplacements suivent l’ordre demandé, avec un repli automatique et sans doublons', () => {
  const a = { source: 'a', label: 'A' }, b = { source: 'b', label: 'B' }, c = { source: 'c', label: 'C' }, d = { source: 'd', label: 'D' };
  assert.deepEqual(ViewOrder.selectSlots([a, b, c], [null, 'c', 'b'], [a, b, c, d]).map(item => item.source), ['a', 'c', 'b']);
  assert.deepEqual(ViewOrder.selectSlots([a, b, c], ['d', null, 'missing'], [a, b, c, d]).map(item => item.source), ['d', 'a', 'b']);
  assert.deepEqual(ViewOrder.selectSlots([a, b, c], [null, null, null]).map(item => item.source), ['a', 'b', 'c']);
});

test('Le point focal est persisté et borné, les vues supprimées retombent en automatique', t => {
  const f = fixture(); t.after(f.clean);
  const image = 'projects/plan-a/generated/images/vue.jpg';
  const saved = presentation.save(f.projects, 'plan-a', { slots: [image, null, null], focal: { x: 23, y: 81 } });
  assert.deepEqual(saved.focal, { x: 23, y: 81 });
  assert.throws(() => presentation.save(f.projects, 'plan-a', { slots: [null, null, null], focal: { x: 101, y: 50 } }), /point focal/);
  fs.unlinkSync(path.join(f.projects, 'plan-a', 'generated', 'images', 'vue.jpg'));
  const fallback = presentation.get(f.projects, 'plan-a');
  assert.equal(fallback.slots[0], null);
  assert.equal(fallback.orphanedSlots, 1);
});

test('Sélections et réglages restent isolés par projet', t => {
  const f = fixture(); t.after(f.clean);
  const imageA = 'projects/plan-a/generated/images/vue.jpg';
  presentation.save(f.projects, 'plan-a', { slots: [imageA, null, null], focal: { x: 12, y: 68 } });
  assert.deepEqual(presentation.get(f.projects, 'plan-b').slots, [null, null, null]);
  assert.deepEqual(presentation.get(f.projects, 'plan-b').focal, { x: 50, y: 50 });
  assert.throws(() => presentation.save(f.projects, 'plan-b', { slots: [imageA, null, null], focal: { x: 50, y: 50 } }), /n’est plus disponible/);
});
