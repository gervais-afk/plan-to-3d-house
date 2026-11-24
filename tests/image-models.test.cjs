const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const file = path => readFileSync(resolve(__dirname, '..', path), 'utf8');

test('Les modèles de photoréalisation proposés dans la visite sont exactement ceux autorisés par le serveur', () => {
  const server = file('serve.js').match(/const IMAGE_MODELS = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(id => id.slice(1, -1));
  const block = file('js/app.js').match(/const IMAGE_MODELS = \{([\s\S]*?)\n  \};/)[1];
  const viewer = [...block.matchAll(/^\s*'([^']+)': \{/gm)].map(match => match[1]);
  assert.deepEqual([...viewer].sort(), [...server].sort());
  // Identifiant vérifié sur l'API publique OpenRouter : tirets, et non « seedream-5.0-flash ».
  assert.ok(server.includes('bytedance-seed/seedream-5-0-flash'));
  assert.ok(server.every(id => /^[a-z0-9-]+\/[a-z0-9.-]+$/.test(id)));
});
