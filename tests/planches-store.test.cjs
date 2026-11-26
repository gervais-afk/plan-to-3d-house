const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const planchesStore = require('../planchesStore');

const ROOT = path.resolve(__dirname, '..');

// Minimal valid PDF and PNG payloads
const VALID_PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'ascii').toString('base64');
const VALID_PDF_DATA_URL = `data:application/pdf;base64,${VALID_PDF_B64}`;
// 1x1 transparent PNG
const VALID_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_B64}`;

function makeTempProjects() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-planches-'));
  const projects = path.join(dir, 'projects');
  const slug = 'projet-test-planches';
  fs.mkdirSync(path.join(projects, slug), { recursive: true });
  fs.writeFileSync(path.join(projects, slug, 'project.json'), JSON.stringify({
    meta: { name: 'Projet Test', slug },
    config: { wallHeight: 3 },
    walls: [],
    rooms: []
  }));
  return { dir, projects, slug };
}

test('Lot 3 — planchesStore : téléversement, liste, modification, suppression et nettoyage des fichiers', () => {
  const { dir, projects, slug } = makeTempProjects();
  try {
    assert.deepEqual(planchesStore.list(projects, slug), []);

    const saved = planchesStore.save(projects, slug, {
      name: '../../dossier/Plan_RDC_et_Facade.pdf',
      pdf: VALID_PDF_DATA_URL,
      pages: [
        {
          page: 1,
          total: 2,
          image: VALID_PNG_DATA_URL,
          width: 1200,
          height: 800,
          paperMm: { w: 420, h: 297 },
          text: 'TITRE DU PLAN : PLAN DE DISTRIBUTION RDC ECHELLE : 1/100 SEJOUR 25,0 m2 CHAMBRE 12,5 m2'
        },
        {
          page: 2,
          total: 2,
          image: VALID_PNG_DATA_URL,
          width: 1200,
          height: 800,
          paperMm: { w: 420, h: 297 },
          text: 'TITRE DU PLAN : FACADE PRINCIPALE ECHELLE : 1/100'
        }
      ]
    });

    assert.equal(saved.length, 2);
    // Noms générés par le serveur (aucun nom client sur le disque)
    assert.match(saved[0].sourcePdf, /^doc-[0-9a-f-]+\.pdf$/);
    assert.match(saved[0].image, /^page-[0-9a-f-]+\.png$/);
    assert.equal(saved[0].sourcePdf, saved[1].sourcePdf);
    assert.equal(saved[0].type, 'distribution');
    assert.equal(saved[0].level, 0);
    assert.equal(saved[0].scale, '1/100');
    assert.equal(saved[1].type, 'facade');
    assert.equal(saved[1].level, null);

    const planchesDir = path.join(projects, slug, 'planches');
    assert.ok(fs.existsSync(path.join(planchesDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(planchesDir, saved[0].sourcePdf)));
    assert.ok(fs.existsSync(path.join(planchesDir, saved[0].image)));
    assert.ok(fs.existsSync(path.join(planchesDir, saved[1].image)));

    // Liste
    const listed = planchesStore.list(projects, slug);
    assert.equal(listed.length, 2);
    assert.equal(listed[0].imageUrl, `projects/${slug}/planches/${saved[0].image}`);

    // Modification
    const updated = planchesStore.update(projects, slug, saved[0].id, {
      type: 'distribution',
      level: 1,
      scale: '1:50',
      include: false,
      replaceGenerated: false
    });
    assert.equal(updated.level, 1);
    assert.equal(updated.scale, '1/50');
    assert.equal(updated.include, false);
    assert.equal(updated.replaceGenerated, false);

    // Suppression de la page 1 : image supprimée, PDF conservé car page 2 l'utilise
    planchesStore.remove(projects, slug, saved[0].id);
    assert.equal(fs.existsSync(path.join(planchesDir, saved[0].image)), false);
    assert.equal(fs.existsSync(path.join(planchesDir, saved[0].sourcePdf)), true);

    // Suppression de la page 2 : image ET PDF d'origine supprimés
    planchesStore.remove(projects, slug, saved[1].id);
    assert.equal(fs.existsSync(path.join(planchesDir, saved[1].image)), false);
    assert.equal(fs.existsSync(path.join(planchesDir, saved[0].sourcePdf)), false);
    assert.deepEqual(planchesStore.list(projects, slug), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 3 — planchesStore : sécurité (PDF uniquement, taille bornée, chemins confinés)', () => {
  const { dir, projects, slug } = makeTempProjects();
  try {
    // Fichier non PDF refusé
    assert.throws(() => planchesStore.save(projects, slug, {
      name: 'malware.exe',
      pdf: 'data:application/pdf;base64,' + Buffer.from('NOT_A_PDF_FILE_CONTENT').toString('base64'),
      pages: [{ page: 1, total: 1, image: VALID_PNG_DATA_URL }]
    }), err => err.status === 415);

    // MIME non PDF refusé
    assert.throws(() => planchesStore.save(projects, slug, {
      name: 'script.html',
      pdf: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'),
      pages: [{ page: 1, total: 1, image: VALID_PNG_DATA_URL }]
    }), err => err.status === 415);

    // Image truquée (mauvaise signature) refusée
    assert.throws(() => planchesStore.save(projects, slug, {
      name: 'plan.pdf',
      pdf: VALID_PDF_DATA_URL,
      pages: [{ page: 1, total: 1, image: 'data:image/png;base64,' + Buffer.from('not-a-png-header-at-all').toString('base64') }]
    }), err => err.status === 415);

    // Chemins hors projet / traversal refusés
    for (const badSlug of ['../etc', '..', '.hidden', 'a/b', 'foo\\bar', '']) {
      assert.throws(() => planchesStore.list(projects, badSlug), err => [400, 403].includes(err.status));
    }
    assert.throws(() => planchesStore.confineFile(path.join(projects, slug, 'planches'), '../project.json'), err => [400, 403].includes(err.status));
    assert.throws(() => planchesStore.confineFile(path.join(projects, slug, 'planches'), '.env'), err => [400, 403].includes(err.status));

    // Lien symbolique sortant du projet refusé
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-outside-'));
    try {
      fs.symlinkSync(outside, path.join(projects, slug, 'planches'));
      assert.throws(() => planchesStore.list(projects, slug), err => err.status === 403);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function request(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const reqHeaders = { ...headers };
    if (payload !== null && !reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
    if (payload !== null) reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: reqHeaders }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function copyFixtureServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-srv-planches-'));
  for (const file of ['serve.js', 'privatePortal.js', 'planchesStore.js', 'feedbackStore.js', 'decisionStore.js', 'presentationStore.js', 'cabinetStore.js']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  for (const js of ['variantState.js', 'sheetClassifier.js', 'deliverableGate.js']) {
    fs.copyFileSync(path.join(ROOT, 'js', js), path.join(dir, 'js', js));
  }
  const slug = 'villa-planches';
  fs.mkdirSync(path.join(dir, 'projects', slug), { recursive: true });
  fs.writeFileSync(path.join(dir, 'projects', slug, 'project.json'), JSON.stringify({
    meta: { name: 'Villa Planches', slug },
    config: { wallHeight: 3 },
    walls: [],
    rooms: []
  }));
  return { dir, slug };
}

test('Lot 3 — HTTP /api/projects/:slug/planches : rôle architecte requis, invité et chemins hors projet refusés', async () => {
  const { dir, slug } = copyFixtureServer();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const password = 'mot-de-passe-architecte-tres-long-2026';
  const child = spawn(process.execPath, ['serve.js'], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      PRIVATE_PORTAL: '1',
      PORTAL_PASSWORD: password,
      PORTAL_ORIGIN: origin,
      PORTAL_INSECURE_LOCAL: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('serve.js timeout')), 5000);
      child.stdout.on('data', chunk => {
        if (chunk.toString().includes('ArchiCam Studio')) { clearTimeout(timer); resolve(); }
      });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`serve.js exit ${code}`)); });
    });

    // 1. Non authentifié : refusé
    const anonGet = await request(port, 'GET', `/api/projects/${slug}/planches`);
    assert.equal(anonGet.status, 401);

    // 2. Connexion architecte
    const login = await request(port, 'POST', '/api/portal/login', {
      headers: { Origin: origin },
      body: { password }
    });
    assert.equal(login.status, 200);
    const archCookie = (login.headers['set-cookie']?.[0] || '').split(';')[0];
    assert.ok(archCookie);

    // 3. Création d'une invitation client (rôle comment) et connexion invité
    const inv = await request(port, 'POST', '/api/portal/invitations', {
      headers: { Origin: origin, Cookie: archCookie },
      body: { project: slug, role: 'comment', validHours: 24, label: 'Client invité' }
    });
    assert.equal(inv.status, 201);
    const accept = await request(port, 'POST', '/api/portal/accept', {
      headers: { Origin: origin },
      body: { token: inv.json.token }
    });
    assert.equal(accept.status, 200);
    const clientCookie = (accept.headers['set-cookie']?.[0] || '').split(';')[0];
    assert.ok(clientCookie);

    // 4. Invité refusé sur GET, POST, PATCH, DELETE
    const clientGet = await request(port, 'GET', `/api/projects/${slug}/planches`, { headers: { Cookie: clientCookie } });
    assert.equal(clientGet.status, 403);
    const clientPost = await request(port, 'POST', `/api/projects/${slug}/planches`, {
      headers: { Origin: origin, Cookie: clientCookie },
      body: { name: 'test.pdf', pdf: VALID_PDF_DATA_URL, pages: [{ page: 1, total: 1, image: VALID_PNG_DATA_URL }] }
    });
    assert.equal(clientPost.status, 403);
    const clientPatch = await request(port, 'PATCH', `/api/projects/${slug}/planches/pl-00000000-0000-0000-0000-000000000000`, {
      headers: { Origin: origin, Cookie: clientCookie },
      body: { include: false }
    });
    assert.equal(clientPatch.status, 403);
    const clientDel = await request(port, 'DELETE', `/api/projects/${slug}/planches/pl-00000000-0000-0000-0000-000000000000`, {
      headers: { Origin: origin, Cookie: clientCookie }
    });
    assert.equal(clientDel.status, 403);

    // 5. Architecte : POST -> GET -> PATCH -> DELETE
    const created = await request(port, 'POST', `/api/projects/${slug}/planches`, {
      headers: { Origin: origin, Cookie: archCookie },
      body: {
        name: 'Dossier_Architecte.pdf',
        pdf: VALID_PDF_DATA_URL,
        pages: [{
          page: 1, total: 1, image: VALID_PNG_DATA_URL, width: 1000, height: 700,
          text: 'TITRE DU PLAN : PLAN DE MASSE ECHELLE 1/200'
        }]
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.items.length, 1);
    const sheetId = created.json.items[0].id;
    assert.equal(created.json.items[0].type, 'masse');

    const listed = await request(port, 'GET', `/api/projects/${slug}/planches`, { headers: { Cookie: archCookie } });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.items.length, 1);
    assert.equal(listed.json.items[0].id, sheetId);

    const patched = await request(port, 'PATCH', `/api/projects/${slug}/planches/${sheetId}`, {
      headers: { Origin: origin, Cookie: archCookie },
      body: { type: 'distribution', level: 0, scale: '1/100', include: true, replaceGenerated: false }
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.item.type, 'distribution');
    assert.equal(patched.json.item.level, 0);
    assert.equal(patched.json.item.replaceGenerated, false);

    // 6. Rejet non-PDF et chemin hors projet côté HTTP
    const nonPdf = await request(port, 'POST', `/api/projects/${slug}/planches`, {
      headers: { Origin: origin, Cookie: archCookie },
      body: { name: 'bad.txt', pdf: 'data:text/plain;base64,aGVsbG8=', pages: [{ page: 1, total: 1, image: VALID_PNG_DATA_URL }] }
    });
    assert.equal(nonPdf.status, 415);

    const traversal = await request(port, 'GET', '/api/projects/..%2F..%2Fetc/planches', { headers: { Cookie: archCookie } });
    assert.ok([400, 403, 404].includes(traversal.status));

    // 7. Suppression
    const deleted = await request(port, 'DELETE', `/api/projects/${slug}/planches/${sheetId}`, {
      headers: { Origin: origin, Cookie: archCookie }
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.json.ok, true);

    const afterDel = await request(port, 'GET', `/api/projects/${slug}/planches`, { headers: { Cookie: archCookie } });
    assert.equal(afterDel.status, 200);
    assert.deepEqual(afterDel.json.items, []);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 3 — app.js recharge automatiquement les planches enregistrées dans « Composer le cahier »', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(appSrc, /api\/projects\/\$\{slug\}\/planches/);
  assert.match(appSrc, /loadSavedPlanches/);
  assert.match(appSrc, /patchSavedPlanche/);
  assert.match(appSrc, /deleteSavedPlanche/);
});
