'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const cabinetStore = require('../cabinetStore.js');

const ROOT = path.join(__dirname, '..');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function transparentPng() {
  const sig = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const pixel = Buffer.from([0, 20, 40, 60, 128]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(pixel)), pngChunk('IEND', Buffer.alloc(0))]);
}

const net = require('node:net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer(cwd, env = {}) {
  const port = await getFreePort();
  const base = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(cwd, 'serve.js')], {
      cwd,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PORTAL_ORIGIN: base, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout serveur\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 8000);
    child.stdout.on('data', d => {
      stdout += d.toString();
      if (/http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(stdout)) {
        clearTimeout(timer);
        resolve({ child, base });
      }
    });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!/http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(stdout)) {
        reject(new Error(`Serveur arrêté (${code})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

test('Lot 9 — Autonomie hors ligne : zéro dépendance CDN (cdnjs, jsdelivr, unpkg) dans tous les HTML et JS', () => {
  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f));
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'js', f));
  const offenders = [];

  for (const filePath of [...htmlFiles, ...jsFiles]) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)/i.test(content)) {
      offenders.push(path.relative(ROOT, filePath));
    }
  }
  assert.deepEqual(offenders, [], `Dépendances CDN trouvées : ${offenders.join(', ')}`);

  // Vérifier la présence locale de Three.js r128 et de ses modules
  for (const vendorFile of [
    'assets/vendor/three/three.min.js',
    'assets/vendor/three/GLTFLoader.js',
    'assets/vendor/three/RGBELoader.js',
    'assets/vendor/three/RoomEnvironment.js',
    'assets/vendor/pdf.min.js',
    'assets/vendor/pdf.worker.min.js',
    'assets/vendor/jspdf-4.2.1.umd.min.js'
  ]) {
    const full = path.join(ROOT, vendorFile);
    assert.ok(fs.existsSync(full), `Fichier local manquant : ${vendorFile}`);
    assert.ok(fs.statSync(full).size > 1024, `Fichier local trop petit : ${vendorFile}`);
  }
});

test('Lot 9 — Logo cabinet dans .cabinet/logo.png, migration automatique et route /api/cabinet/logo (y compris portail privé)', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-lot9-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // 1. Test unitaire de migration automatique depuis l'ancien emplacement assets/cabinet/logo.png
  const legacyDir = path.join(tmp, 'assets', 'cabinet');
  fs.mkdirSync(legacyDir, { recursive: true });
  const samplePng = transparentPng();
  fs.writeFileSync(path.join(legacyDir, 'logo.png'), samplePng);

  const migrated = cabinetStore.read(tmp);
  assert.equal(migrated.logoUrl, '/api/cabinet/logo');
  assert.ok(fs.existsSync(path.join(tmp, '.cabinet', 'logo.png')), 'Le logo doit être migré vers .cabinet/logo.png');
  assert.equal(fs.existsSync(path.join(legacyDir, 'logo.png')), false, 'L’ancien fichier assets/cabinet/logo.png doit être nettoyé');
  assert.deepEqual(fs.readFileSync(path.join(tmp, '.cabinet', 'logo.png')), samplePng);

  // 2. Test HTTP complet en mode portail privé
  for (const f of ['serve.js', 'cabinetStore.js', 'privatePortal.js', 'decisionStore.js', 'feedbackStore.js', 'presentationStore.js', 'planchesStore.js']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  fs.mkdirSync(path.join(tmp, 'js'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'js', 'variantState.js'), path.join(tmp, 'js', 'variantState.js'));
  fs.copyFileSync(path.join(ROOT, 'js', 'sheetClassifier.js'), path.join(tmp, 'js', 'sheetClassifier.js'));
  fs.mkdirSync(path.join(tmp, 'projects', 'villa-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'projects', 'villa-demo', 'project.json'), JSON.stringify({
    meta: { name: 'Villa Démo' },
    walls: [],
    rooms: []
  }));

  const password = 'mot-de-passe-cabinet-tres-long-2026';
  const { child, base } = await startServer(tmp, {
    PRIVATE_PORTAL: '1',
    PORTAL_PASSWORD: password,
    PORTAL_INSECURE_LOCAL: '1'
  });
  t.after(() => child.kill());

  // Non authentifié -> refusé (401)
  const unauthLogo = await fetch(`${base}/api/cabinet/logo`);
  assert.equal(unauthLogo.status, 401);

  // Accès direct à /.cabinet/logo.png -> toujours refusé (404)
  const directHidden = await fetch(`${base}/.cabinet/logo.png`);
  assert.equal(directHidden.status, 404);

  // Connexion architecte -> accès au logo et création d'une invitation client
  const loginRes = await fetch(`${base}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ password })
  });
  assert.equal(loginRes.status, 200);
  const archCookie = loginRes.headers.get('set-cookie').split(';')[0];

  const archLogo = await fetch(`${base}/api/cabinet/logo`, { headers: { Cookie: archCookie } });
  assert.equal(archLogo.status, 200);
  assert.equal(archLogo.headers.get('content-type'), 'image/png');
  assert.equal(archLogo.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await archLogo.arrayBuffer()), samplePng);

  // Création d'une invitation client lecture seule -> le client peut aussi lire /api/cabinet/logo
  const invRes = await fetch(`${base}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: archCookie },
    body: JSON.stringify({ project: 'villa-demo', role: 'read', validHours: 24, label: 'Client test' })
  });
  assert.equal(invRes.status, 201);
  const invData = await invRes.json();
  assert.ok(invData.token);

  const clientLogin = await fetch(`${base}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ token: invData.token })
  });
  assert.equal(clientLogin.status, 200);
  const clientCookie = clientLogin.headers.get('set-cookie').split(';')[0];

  const clientLogo = await fetch(`${base}/api/cabinet/logo`, { headers: { Cookie: clientCookie } });
  assert.equal(clientLogo.status, 200);
  assert.deepEqual(Buffer.from(await clientLogo.arrayBuffer()), samplePng);
});

test('Lot 9 — .gitignore et guide docs/INSTALLATION-CABINET.md complets', () => {
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('projects/*'), '.gitignore doit ignorer les projets de travail du cabinet');
  assert.ok(gitignore.includes('!projects/residence-verandas/'), '.gitignore doit documenter les projets de démo requis par les tests');
  assert.ok(gitignore.includes('.cabinet/'), '.gitignore doit ignorer .cabinet/');

  const docPath = path.join(ROOT, 'docs', 'INSTALLATION-CABINET.md');
  assert.ok(fs.existsSync(docPath), 'docs/INSTALLATION-CABINET.md doit exister');
  const doc = fs.readFileSync(docPath, 'utf8');
  for (const required of ['Node.js', 'node serve.js', 'openrouter.key', 'PRIVATE_PORTAL', 'PORTAL_PASSWORD', 'PORTAL_ORIGIN', 'invitations', 'Sauvegarde', 'restauration']) {
    assert.ok(doc.toLowerCase().includes(required.toLowerCase()), `Section/mot-clé manquant dans INSTALLATION-CABINET.md : ${required}`);
  }
});
