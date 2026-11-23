const assert = require('node:assert/strict');
const { test } = require('node:test');
const { processPixels } = require('../js/planCleanup');

test('le traitement visuel est déterministe, conserve alpha et ne modifie pas la source', () => {
  const source = new Uint8ClampedArray([255, 0, 0, 128, 20, 40, 60, 255]);
  const original = Array.from(source);
  const options = { grayscale: true, contrast: 0, lines: 0, thresholdOn: false };
  const first = processPixels(source, options);
  const second = processPixels(source, options);

  assert.deepEqual(Array.from(first), Array.from(second));
  assert.equal(first[0], first[1]);
  assert.equal(first[1], first[2]);
  assert.equal(first[3], 128);
  assert.deepEqual(Array.from(source), original);
});

test('le renforcement local assombrit un trait fin sans modifier le fond uniforme', () => {
  const source = new Uint8ClampedArray(Array.from({ length: 9 }, (_, index) => {
    const value = index === 4 ? 100 : 240;
    return [value, value, value, 255];
  }).flat());
  const result = processPixels(source, { grayscale: true, contrast: 0, lines: 1, width: 3, height: 3 });
  assert.ok(result[4 * 4] < 100);
  assert.equal(result[0], 240);
  assert.equal(result[8 * 4], 240);
  assert.equal(result[4 * 4 + 3], 255);
});

test('le seuil optionnel produit une image noir/blanc sans toucher à la transparence', () => {
  const source = new Uint8ClampedArray([10, 20, 30, 64, 240, 240, 240, 192]);
  const result = processPixels(source, { grayscale: true, contrast: 0, lines: 0, thresholdOn: true, threshold: 128 });

  assert.deepEqual(Array.from(result), [0, 0, 0, 64, 255, 255, 255, 192]);
  assert.deepEqual(Array.from(source), [10, 20, 30, 64, 240, 240, 240, 192]);
});
