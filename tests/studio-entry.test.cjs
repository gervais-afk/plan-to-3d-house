const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on('error', reject);
});

async function withServer(run) {
  const port = await freePort();
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port) };
  delete env.PRIVATE_PORTAL;
  const child = spawn(process.execPath, ['serve.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/api/projects'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    await run(base);
  } finally { child.kill(); }
}

test('L’entrée de l’app est l’atelier : aucun nom ni chiffre de projet sur la première interface', async () => {
  await withServer(async base => {
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /<title>ArchiCam Studio<\/title>/);
    assert.match(html, /id="door-open"/);
    assert.match(html, /href="editor\.html"/);
    const projects = await (await fetch(base + '/api/projects')).json();
    assert.ok(projects.length > 0);
    for (const project of projects) {
      assert.ok(!html.includes(project.name), `« ${project.name} » ne doit pas apparaître sur l’entrée`);
      assert.ok(!html.includes(project.slug), `« ${project.slug} » ne doit pas apparaître sur l’entrée`);
    }
    assert.doesNotMatch(html, /m²|habitables/);
  });
});

test('Avec ?project=, la racine reste un lien direct vers la visite', async () => {
  await withServer(async base => {
    const html = await (await fetch(base + '/?project=residence-verandas')).text();
    assert.match(html, /src="js\/workspace\.js"/);
    assert.doesNotMatch(html, /id="door-open"/);
  });
});

test('L’index des dossiers fournit une vignette existante et mène à la couverture du projet', async () => {
  await withServer(async base => {
    const projects = await (await fetch(base + '/api/projects')).json();
    for (const project of projects) {
      if (!project.cover) continue;
      assert.ok(project.cover.startsWith(`projects/${project.slug}/`), project.cover);
      assert.equal((await fetch(`${base}/${project.cover}`)).status, 200, project.cover);
    }
    assert.ok(projects.some(p => p.cover), 'au moins un projet a une vignette');
  });
  const script = fs.readFileSync(path.join(ROOT, 'js/studio.js'), 'utf8');
  assert.match(script, /accueil\.html\?project=\$\{encodeURIComponent\(project\.slug\)\}/);
});
