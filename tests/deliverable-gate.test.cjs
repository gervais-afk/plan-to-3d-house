const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DeliverableGate = require('../js/deliverableGate.js');
const ViewOrder = require('../js/viewOrder.js');

const ROOT = path.resolve(__dirname, '..');
const PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function httpJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function startTempServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-gate-'));
  for (const file of ['serve.js', 'privatePortal.js', 'feedbackStore.js', 'decisionStore.js', 'presentationStore.js', 'cabinetStore.js']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'js', 'deliverableGate.js'), path.join(dir, 'js', 'deliverableGate.js'));
  fs.copyFileSync(path.join(ROOT, 'js', 'variantState.js'), path.join(dir, 'js', 'variantState.js'));
  const projDir = path.join(dir, 'projects', 'demo');
  fs.mkdirSync(path.join(projDir, 'generated', 'images'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'generated', 'renders'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'planches'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'project.json'), JSON.stringify({
    meta: { name: 'Projet Démo', slug: 'demo', subtitle: 'Essai porte E' },
    config: {},
    walls: [{ from: [0, 0], to: [4, 0] }],
    rooms: []
  }, null, 2));
  fs.writeFileSync(path.join(projDir, 'generated', 'images', 'perspective-01.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(projDir, 'generated', 'images', 'photor-facade.png'), Buffer.from(PIXEL_PNG, 'base64'));
  fs.writeFileSync(path.join(projDir, 'generated', 'renders', 'facade.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(projDir, 'generated', 'manifest.json'), JSON.stringify({
    version: 1,
    items: [
      { id: 'perspective-01', type: 'image', file: 'projects/demo/generated/images/perspective-01.jpg', label: 'Façade', catalog: true, book: true, cover: false },
      {
        id: 'photor-facade',
        type: 'image',
        file: 'projects/demo/generated/images/photor-facade.png',
        reference: 'projects/demo/generated/renders/facade.jpg',
        generator: 'OpenRouter · google/gemini-3.1-flash-image',
        label: 'Façade IA',
        fidelity: { version: 2, verdict: 'unfaithful', score: 0.24, worstTile: { row: 1, col: 0, score: 0 } },
        catalog: true,
        book: true,
        cover: true
      }
    ]
  }, null, 2));

  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(dir, 'serve.js')], {
    cwd: dir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serve.js timeout')), 5000);
    proc.stdout.on('data', chunk => {
      if (String(chunk).includes(String(port))) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`serve.js exited early (${code})`));
    });
  });
  t.after(async () => {
    // Windows : le dossier reste verrouillé tant que le serveur (cwd = dir) n'est pas sorti.
    if (proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise(resolve => proc.once('exit', resolve));
      proc.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { dir, port };
}

test('Porte E : évalue médias non IA, rendus IA v2 fidèles, bloqués et obsolètes', () => {
  assert.equal(DeliverableGate.evaluate({ id: 'perspective-01', file: 'projects/p/generated/images/perspective-01.jpg' }).status, 'non_ai');
  assert.equal(DeliverableGate.isEligible({ id: 'render-facade', file: 'projects/p/generated/renders/facade.jpg', generator: 'Three.js' }), true);

  const faithful = { id: 'photor-sejour', file: 'projects/p/generated/images/photor-sejour.png', fidelity: { version: 2, verdict: 'faithful', score: 0.75 } };
  assert.equal(DeliverableGate.evaluate(faithful).eligible, true);
  assert.equal(DeliverableGate.evaluate(faithful).status, 'faithful');

  const review = { id: 'photor-etage', file: 'projects/p/generated/images/photor-etage.png', fidelity: { version: 2, verdict: 'review', score: 0.55 } };
  assert.equal(DeliverableGate.evaluate(review).eligible, false);
  assert.equal(DeliverableGate.evaluate(review).status, 'review');

  const unfaithful = { id: 'photor-ext', file: 'projects/p/generated/images/photor-ext.png', fidelity: { version: 2, verdict: 'unfaithful', score: 0.21 } };
  assert.equal(DeliverableGate.evaluate(unfaithful).eligible, false);
  assert.equal(DeliverableGate.evaluate(unfaithful).status, 'unfaithful');

  const unverified = { id: 'photor-new', file: 'projects/p/generated/images/photor-new.png' };
  assert.equal(DeliverableGate.evaluate(unverified).eligible, false);
  assert.equal(DeliverableGate.evaluate(unverified).status, 'unverified');

  const staleV1 = { id: 'photor-old', file: 'projects/p/generated/images/photor-old.png', fidelity: { version: 1, verdict: 'faithful', score: 0.61 } };
  assert.equal(DeliverableGate.evaluate(staleV1).eligible, false);
  assert.equal(DeliverableGate.evaluate(staleV1).status, 'stale');
});

test('Porte E : dérogation tracée exigée avec motif et expirée si version ou verdict change', () => {
  const base = {
    id: 'photor-coupe',
    file: 'projects/p/generated/images/photor-coupe.png',
    fidelity: { version: 2, verdict: 'review', score: 0.57 }
  };
  const validOverride = DeliverableGate.sanitizeOverride({ reason: 'Vérifié visuellement avec la coupe source', fidelityVersion: 2, verdict: 'review' });
  assert.ok(validOverride);
  assert.equal(DeliverableGate.evaluate({ ...base, fidelityOverride: validOverride }).status, 'overridden');
  assert.equal(DeliverableGate.isEligible({ ...base, fidelityOverride: validOverride }), true);

  // Motif vide refusé
  assert.equal(DeliverableGate.sanitizeOverride({ reason: '   ', fidelityVersion: 2, verdict: 'review' }), null);
  assert.equal(DeliverableGate.isEligible({ ...base, fidelityOverride: { ...validOverride, reason: '' } }), false);

  // Dérogation périmée si le verdict ou la version change
  assert.equal(DeliverableGate.isEligible({ ...base, fidelity: { version: 2, verdict: 'unfaithful', score: 0.25 }, fidelityOverride: validOverride }), false);
  assert.equal(DeliverableGate.isEligible({ ...base, fidelity: { version: 3, verdict: 'review', score: 0.57 }, fidelityOverride: validOverride }), false);
});

test('Porte E : resolveSheetSource bascule sur la planche technique si le rendu IA est bloqué', () => {
  const manifest = [
    { id: 'photor-plan-2d', file: 'projects/p/generated/images/photor-plan-2d.png', fidelity: { version: 2, verdict: 'unfaithful', score: 0.267 } },
    { id: 'photor-ok', file: 'projects/p/generated/images/photor-ok.png', fidelity: { version: 2, verdict: 'faithful', score: 0.81 } }
  ];
  const blocked = DeliverableGate.resolveSheetSource({
    title: 'Plan RDC',
    preview: 'projects/p/planches/063306.webp',
    art: 'projects/p/generated/images/photor-plan-2d.png'
  }, manifest);
  assert.equal(blocked.source, 'projects/p/planches/063306.webp');
  assert.equal(blocked.fallback, true);

  const nonAi = DeliverableGate.resolveSheetSource({
    title: 'Façade',
    preview: 'projects/p/planches/063252.webp',
    art: 'projects/p/edition-art/063252.webp'
  }, manifest);
  assert.equal(nonAi.source, 'projects/p/edition-art/063252.webp');
  assert.equal(nonAi.fallback, false);

  const okAi = DeliverableGate.resolveSheetSource({
    title: 'Plan fidèle',
    preview: 'projects/p/planches/063306.webp',
    art: 'projects/p/generated/images/photor-ok.png'
  }, manifest);
  assert.equal(okAi.source, 'projects/p/generated/images/photor-ok.png');
  assert.equal(okAi.fallback, false);
});

test('Porte E : pickCover ne renvoie jamais un rendu IA bloqué et retombe sur une vue éligible ou une capture 3D', () => {
  const blockedOnly = DeliverableGate.pickCover({
    images: [{ id: 'photor-cover', file: 'projects/p/generated/images/photor-cover.png', cover: true, catalog: true, fidelity: { version: 2, verdict: 'unfaithful', score: 0.2 } }],
    renders: ['projects/p/generated/renders/plan-2d.png', 'projects/p/generated/renders/facade.jpg']
  });
  assert.equal(blockedOnly.file, 'projects/p/generated/renders/facade.jpg');
  assert.equal(blockedOnly.kind, 'render');

  const withFallback = DeliverableGate.pickCover({
    images: [
      { id: 'photor-cover', file: 'projects/p/generated/images/photor-cover.png', cover: true, catalog: true, fidelity: { version: 2, verdict: 'unfaithful', score: 0.2 } },
      { id: 'perspective-01', file: 'projects/p/generated/images/perspective-01.jpg', label: 'Façade et perron', catalog: true, cover: false }
    ],
    renders: ['projects/p/generated/renders/facade.jpg']
  });
  assert.equal(withFallback.file, 'projects/p/generated/images/perspective-01.jpg');
  assert.equal(withFallback.kind, 'published');
});

test('residence-verandas : plan source restauré, 0 rendu IA non fidèle affecté, couverture de remplacement prête', () => {
  const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects/residence-verandas/project.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects/residence-verandas/generated/manifest.json'), 'utf8'));

  assert.equal(project.config.planImage.url, 'projects/residence-verandas/planches/063306.webp');
  assert.ok(fs.existsSync(path.join(ROOT, project.config.planImage.url)), 'le plan source 063306.webp existe sur disque');

  const aiItems = manifest.items.filter(item => DeliverableGate.isAiRender(item) && item.type === 'image');
  assert.equal(aiItems.length, 15, 'les 15 rendus photor-* sont toujours conservés dans le manifeste');
  for (const item of aiItems) {
    assert.ok(fs.existsSync(path.join(ROOT, item.file)), `aucun fichier supprimé : ${item.file}`);
    assert.equal(item.fidelity?.version, 2, `contrôle v2 présent sur ${item.id}`);
    if (!DeliverableGate.isEligible(item)) {
      assert.equal(item.catalog, false, `${item.id} ne doit plus être affecté au catalogue`);
      assert.equal(item.book, false, `${item.id} ne doit plus être affecté au cahier`);
      assert.equal(item.cover, false, `${item.id} ne doit plus être en couverture`);
    }
  }

  // Les 4 rendus intérieurs fidèles v2 restent publiés
  const publishedAiIds = aiItems.filter(item => item.catalog && item.book).map(item => item.id).sort();
  assert.deepEqual(publishedAiIds, [
    'photor-cuisine',
    'photor-salle-a-manger',
    'photor-sejour-veranda',
    'photor-suite-parentale'
  ]);

  // perspective-01.jpg devient la couverture de remplacement et l'affiche vidéo
  const coverItem = manifest.items.find(item => item.id === 'perspective-01');
  assert.equal(coverItem.cover, true);
  assert.equal(coverItem.catalog, true);
  assert.equal(coverItem.book, true);
  assert.equal(manifest.items.find(item => item.id === 'anim-visite-demo').poster, 'projects/residence-verandas/generated/images/perspective-01.jpg');

  const pickedCover = DeliverableGate.pickCover({ images: manifest.items.filter(i => i.type === 'image'), renders: [] });
  assert.equal(pickedCover.file, 'projects/residence-verandas/generated/images/perspective-01.jpg');

  // La page client (ViewOrder sur items éligibles du catalogue) place perspective-01 en couverture
  const eligibleCatalog = manifest.items.filter(i => i.type === 'image' && i.catalog === true && DeliverableGate.isEligible(i));
  const slides = ViewOrder.views({ images: eligibleCatalog, renders: [] }, 'residence-verandas', 3);
  assert.equal(slides[0].source, 'projects/residence-verandas/generated/images/perspective-01.jpg');
  assert.equal(slides[0].label, 'Façade et perron');

  // Les 5 planches edition.sheets pointant vers des photor-* bloqués retombent sur leurs planches techniques d'origine
  for (const sheet of project.edition.sheets) {
    const resolved = DeliverableGate.resolveSheetSource(sheet, manifest.items);
    if (sheet.art && /photor-/.test(sheet.art)) {
      assert.equal(resolved.fallback, true, `repli attendu pour ${sheet.title}`);
      assert.equal(resolved.source, sheet.preview);
    }
  }
});

test('serve.js (porte E) : couverture filtrée, dérogation tracée validée et worstTile/addedTile conservés', async t => {
  const { dir, port } = await startTempServer(t);

  // /api/projects ne doit pas servir photor-facade (unfaithful) en couverture : bascule sur perspective-01.jpg
  const projects = await httpJson(port, 'GET', '/api/projects');
  assert.equal(projects.status, 200);
  const demo = projects.json.find(p => p.slug === 'demo');
  assert.equal(demo.cover, 'projects/demo/generated/images/perspective-01.jpg');

  // /api/gallery/flags refuse l'affectation d'un rendu IA non éligible sans dérogation (422)
  const noOverride = await httpJson(port, 'POST', '/api/gallery/flags?project=demo', {
    id: 'photor-facade',
    catalog: true
  });
  assert.equal(noOverride.status, 422);

  // /api/gallery/flags refuse une dérogation sans motif (422)
  const badOverride = await httpJson(port, 'POST', '/api/gallery/flags?project=demo', {
    id: 'photor-facade',
    catalog: true,
    fidelityOverride: { reason: '   ', fidelityVersion: 2, verdict: 'unfaithful' }
  });
  assert.equal(badOverride.status, 422);

  // /api/gallery/flags accepte une dérogation tracée complète et la renvoie via /api/gallery/media
  const okOverride = await httpJson(port, 'POST', '/api/gallery/flags?project=demo', {
    id: 'photor-facade',
    catalog: true,
    book: true,
    fidelityOverride: { reason: 'Exception validée pour réunion client', fidelityVersion: 2, verdict: 'unfaithful' }
  });
  assert.equal(okOverride.status, 200);
  assert.equal(okOverride.json.fidelityOverride.reason, 'Exception validée pour réunion client');
  assert.equal(okOverride.json.fidelityOverride.fidelityVersion, 2);

  const media = await httpJson(port, 'GET', '/api/gallery/media?project=demo');
  assert.equal(media.status, 200);
  const savedItem = media.json.images.find(i => i.id === 'photor-facade');
  assert.equal(savedItem.ai, true);
  assert.equal(savedItem.fidelityOverride.reason, 'Exception validée pour réunion client');

  // /api/save-generated conserve worstTile / addedTile, purge l'ancienne dérogation et retire catalog/book si non fidèle
  const regen = await httpJson(port, 'POST', '/api/save-generated?project=demo', {
    type: 'image',
    id: 'photor-facade',
    data: `data:image/png;base64,${PIXEL_PNG}`,
    metadata: {
      label: 'Façade IA v2',
      reference: 'projects/demo/generated/renders/facade.jpg',
      generator: 'OpenRouter · google/gemini-3.1-flash-image',
      fidelity: {
        version: 2,
        verdict: 'review',
        score: 0.54,
        recall: 0.68,
        chance: 0.30,
        shift: { x: 0, y: 0 },
        worstTile: { row: 2, col: 0, score: 0.21 },
        addedTile: { row: 1, col: 1, score: 0 },
        aspect: 1.01
      }
    }
  });
  assert.equal(regen.status, 200);
  const manifestAfter = JSON.parse(fs.readFileSync(path.join(dir, 'projects/demo/generated/manifest.json'), 'utf8'));
  const updated = manifestAfter.items.find(i => i.id === 'photor-facade');
  assert.deepEqual(updated.fidelity.worstTile, { row: 2, col: 0, score: 0.21 });
  assert.deepEqual(updated.fidelity.addedTile, { row: 1, col: 1, score: 0 });
  assert.equal(updated.fidelityOverride, undefined, 'une régénération purge toute ancienne dérogation');
  assert.equal(updated.catalog, false, 'une régénération non fidèle ne reste pas affectée au catalogue');
  assert.equal(updated.book, false, 'une régénération non fidèle ne reste pas affectée au cahier');
  assert.ok(!updated.cover, 'une régénération non fidèle ne reste pas en couverture');
});
