const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('Vérification de la configuration OpenRouter et protection des secrets', async t => {
  const PORT = 8011;
  const serverProcess = spawn(process.execPath, ['serve.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', OPENROUTER_API_KEY: 'test-fixture-not-a-real-key' }
  });

  t.after(async () => {
    if (serverProcess.exitCode === null && !serverProcess.signalCode) {
      serverProcess.kill();
      await once(serverProcess, 'exit');
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Serveur trop long à démarrer')), 4000);
    serverProcess.stdout.once('data', () => {
      clearTimeout(timer);
      resolve();
    });
    serverProcess.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Serveur arrêté avec le code ${code}`));
    });
  });

  const get = path => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });

  // 1. Statut IA configuré
  const statusRes = await get('/api/ai/status');
  assert.equal(statusRes.status, 200);
  const statusJson = JSON.parse(statusRes.body);
  assert.equal(statusJson.configured, true, 'L’API /api/ai/status doit indiquer configured: true');

  // 2. Vérification que la clé ne fuite pas via le serveur statique
  const keyRes = await get('/openrouter.key');
  assert.equal(keyRes.status, 404, '/openrouter.key doit être bloqué (404/403)');

  const envRes = await get('/.env');
  assert.equal(envRes.status, 404, '/.env doit être bloqué (404/403)');
});
