const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CostEstimate = require('../js/costEstimate.js');
const XlsxExport = require('../js/xlsxExport.js');
const TechnicalDrawings = require('../js/technicalDrawings.js');
const VariantComparator = require('../js/variantComparator.js');
const variantsStore = require('../variantsStore.js');
const feedbackStore = require('../feedbackStore.js');
const revisionsStore = require('../revisionsStore.js');
const ApdDossier = require('../js/apdDossier.js');

const SAMPLE_PROJECT = {
  meta: {
    slug: 'villa-test',
    name: 'Villa Test & <Atelier>',
    subtitle: 'Maison contemporaine R+1',
    client: 'M. & Mme =Test',
    location: 'Yaoundé, Cameroun',
    architect: 'Cabinet Lumière',
    phase: 'APD',
    revision: 'B',
    issueDate: '2026-06-15'
  },
  config: {
    wallHeight: 3.0,
    floorHeight: 3.1,
    roof: { type: 'hip', overhang: 0.65, height: 1.8 }
  },
  walls: [
    { id: 'w-n', from: [0, 0], to: [12, 0], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'window', at: 4, w: 1.8, h: 1.3, sill: 0.9 }] },
    { id: 'w-e', from: [12, 0], to: [12, 8], thick: 0.25, type: 'ext', level: 0, openings: [] },
    { id: 'w-s', from: [12, 8], to: [0, 8], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'door', at: 6, w: 1.0, h: 2.15 }] },
    { id: 'w-w', from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext', level: 0, openings: [] },
    { id: 'w-mid', from: [6, 0], to: [6, 8], thick: 0.15, type: 'int', level: 0, openings: [{ type: 'door', at: 4, w: 0.9, h: 2.1 }] },
    // Étage 1
    { id: 'w1-n', from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', level: 1, openings: [] },
    { id: 'w1-e', from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext', level: 1, openings: [] },
    { id: 'w1-s', from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext', level: 1, openings: [] },
    { id: 'w1-w', from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext', level: 1, openings: [] }
  ],
  rooms: [
    { id: 'sejour', name: 'Séjour', level: 0, habitable: true, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 8 } },
    { id: 'chambre1', name: 'Chambre 1', level: 0, habitable: true, bounds: { xMin: 6, xMax: 12, zMin: 0, zMax: 5 } },
    { id: 'terrasse', name: 'Terrasse', level: 0, habitable: false, bounds: { xMin: 6, xMax: 12, zMin: 5, zMax: 8 } },
    { id: 'suite', name: 'Suite parentale', level: 1, habitable: true, bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 } }
  ],
  canopies: [
    { xMin: 4, xMax: 8, zMin: 8, zMax: 9.5, level: 0, type: 'slab' }
  ]
};

function readZipEntries(bytes) {
  const buf = Buffer.from(bytes);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'En-tête PKZIP invalide');
  const entries = new Map();
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const compSize = buf.readUInt32LE(off + 18);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8');
    const dataStart = off + 30 + nameLen + extraLen;
    entries.set(name, buf.subarray(dataStart, dataStart + compSize).toString('utf8'));
    off = dataStart + compSize;
  }
  return entries;
}

async function freePort() {
  const sock = net.createServer();
  await new Promise(resolve => sock.listen(0, '127.0.0.1', resolve));
  const p = sock.address().port;
  await new Promise(resolve => sock.close(resolve));
  return p;
}

function makeSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-enh-'));
  const servers = [];
  t.after(async () => {
    for (const s of servers.reverse()) await s.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  for (const f of ['serve.js', 'geminiClient.js', 'aiDesignEngine.js', 'privatePortal.js', 'feedbackStore.js', 'decisionStore.js', 'presentationStore.js', 'cabinetStore.js', 'variantsStore.js', 'revisionsStore.js', 'planchesStore.js', 'portal.html', 'accueil.html', 'studio.html', 'index.html', 'editor.html']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(root, f));
  }
  fs.mkdirSync(path.join(root, 'js'));
  for (const f of ['variantState.js', 'data.js', 'coverImage.js', 'workspace.js', 'xlsxExport.js', 'technicalDrawings.js', 'variantComparator.js', 'apdDossier.js', 'meetingMode.js', 'bioclimaticAudit.js', 'deliverableGate.js', 'pdfIdentity.js', 'deliverableChecklist.js', 'codeCompliance.js']) {
    fs.copyFileSync(path.join(ROOT, 'js', f), path.join(root, 'js', f));
  }
  for (const slug of ['projet-a', 'projet-b']) {
    const dir = path.join(root, 'projects', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...SAMPLE_PROJECT, meta: { ...SAMPLE_PROJECT.meta, slug, name: `Projet ${slug}` } }));
  }
  async function start(envVars = {}) {
    const p = await freePort();
    const origin = `http://127.0.0.1:${p}`;
    const env = { ...process.env, HOST: '127.0.0.1', PORT: String(p), PORTAL_ORIGIN: origin, PRIVATE_PORTAL: '', PORTAL_PASSWORD: '', PORTAL_INSECURE_LOCAL: '', ...envVars };
    const proc = spawn(process.execPath, ['serve.js'], { cwd: root, env });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Serveur injoignable')); }, 5000);
      proc.once('exit', code => { clearTimeout(timer); reject(new Error(`Serveur arrêté (${code})`)); });
      proc.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    const done = new Promise(resolve => proc.once('exit', resolve));
    const srv = { origin, close: async () => { proc.kill(); await done; } };
    servers.push(srv);
    return srv;
  }
  return { root, start };
}

// ============================================================================
// 1. EXPORT EXCEL (.XLSX) AVEC FORMULES & PAGE DE GARDE CABINET
// ============================================================================
test('XlsxExport produit un classeur .xlsx valide à 4 onglets avec formules de totaux et page de garde cabinet', () => {
  const est = CostEstimate.estimate(SAMPLE_PROJECT);
  const { bytes } = XlsxExport.exportXlsx(SAMPLE_PROJECT, est, {
    CostEstimate,
    cabinet: { name: 'Atelier Ndongo & Associés', defaultArchitect: 'Jean Ndongo' }
  });
  assert.ok(bytes instanceof Uint8Array && bytes.length > 2000);
  const entries = readZipEntries(bytes);

  assert.ok(entries.has('[Content_Types].xml'));
  assert.ok(entries.has('xl/workbook.xml'));
  assert.ok(entries.has('xl/styles.xml'));
  assert.ok(entries.has('xl/worksheets/sheet1.xml'));
  assert.ok(entries.has('xl/worksheets/sheet2.xml'));
  assert.ok(entries.has('xl/worksheets/sheet3.xml'));
  assert.ok(entries.has('xl/worksheets/sheet4.xml'));

  const workbook = entries.get('xl/workbook.xml');
  assert.match(workbook, /Page de garde/);
  assert.match(workbook, /Estimation par lots/);
  assert.match(workbook, /Bordereau BQE/);
  assert.match(workbook, /Métrés &amp; Pièces/);

  const cover = entries.get('xl/worksheets/sheet1.xml');
  assert.match(cover, /Atelier Ndongo &amp; Associés/);
  assert.match(cover, /Villa Test &amp; &lt;Atelier&gt;/);
  assert.match(cover, /<f>&apos;Estimation par lots&apos;!/);
  assert.match(cover, /<f>&apos;Bordereau BQE&apos;!/);
  // Les chaînes utilisateur débutant par '=' restent en inlineStr et jamais en <f>
  assert.ok(!cover.includes('<f>=Test</f>'));
  assert.match(cover, /t="inlineStr"[^>]*><is><t[^>]*>M\. &amp; Mme =Test<\/t>/);

  const lotsSheet = entries.get('xl/worksheets/sheet2.xml');
  assert.match(lotsSheet, /<f>SUM\(B\d+:B\d+\)<\/f>/);
  assert.match(lotsSheet, /<f>AVERAGE\(B\d+:C\d+\)<\/f>/);

  const bqeSheet = entries.get('xl/worksheets/sheet3.xml');
  assert.match(bqeSheet, /<f>ROUND\(B\d+\*D\d+,0\)<\/f>/);
  assert.match(bqeSheet, /<f>SUM\(E\d+:E\d+\)<\/f>/);

  const roomsSheet = entries.get('xl/worksheets/sheet4.xml');
  assert.match(roomsSheet, /Rez-de-chaussée/);
  assert.match(roomsSheet, /Étage 1/);
  assert.match(roomsSheet, /<f>SUM\(D\d+:D\d+\)<\/f>/);
});

// ============================================================================
// 2. PLAN DE TOITURE ET COUPES 2D VECTORIELS DEPUIS LA MAQUETTE 3D
// ============================================================================
test('TechnicalDrawings calcule exactement toiture et coupes 2D sur maquette R+1 et sur residence-verandas', () => {
  const roof = TechnicalDrawings.computeRoofPlan(SAMPLE_PROJECT);
  assert.equal(roof.valid, true);
  assert.equal(roof.footprint.w, 10, 'La toiture couvre exactement l’emprise du dernier niveau (Étage 1 : 10 m)');
  assert.equal(roof.footprint.d, 8);
  assert.ok(roof.outer.w > roof.footprint.w, 'Débords pris en compte');
  assert.equal(roof.hips.length, 4, 'Toiture 4 pentes : 4 arêtiers');
  assert.ok(roof.roofArea > roof.outer.w * roof.outer.d);

  const roofSvg = TechnicalDrawings.renderRoofPlanSVG(SAMPLE_PROJECT);
  assert.match(roofSvg, /^<svg /);
  assert.match(roofSvg, /PLAN DE TOITURE/);
  assert.match(roofSvg, /FAÎTAGE/);
  assert.match(roofSvg, /Surface couverture/);

  const secAA = TechnicalDrawings.computeSection(SAMPLE_PROJECT, { axis: 'x', position: 4, label: 'Coupe A–A' });
  assert.equal(secAA.valid, true);
  assert.deepEqual(secAA.levels, [0, 1]);
  assert.ok(secAA.cutWalls.length >= 5, 'Murs RDC + R+1 coupés par z=4');
  assert.ok(secAA.cutRooms.some(r => r.name === 'Séjour'));
  assert.ok(secAA.cutRooms.some(r => r.name === 'Suite parentale'));
  assert.ok(!secAA.cutRooms.some(r => r.name === 'Terrasse'), 'La terrasse (z=5..8) ne doit pas apparaître sur la coupe z=4');

  const secSvg = TechnicalDrawings.renderSectionSVG(SAMPLE_PROJECT, { axis: 'x', position: 4, label: 'Coupe A–A' });
  assert.match(secSvg, /COUPE A–A/);
  assert.match(secSvg, /±0,00 m/);

  // Vérification tracé vectoriel PDF (jsPDF simulé)
  const ops = [];
  const mockDoc = {};
  for (const fn of ['setFillColor', 'setDrawColor', 'setTextColor', 'setLineWidth', 'setLineDashPattern', 'setFont', 'setFontSize', 'rect', 'line', 'lines', 'text']) {
    mockDoc[fn] = (...a) => { ops.push([fn, ...a]); return mockDoc; };
  }
  const rPdf = TechnicalDrawings.drawRoofPlanPDF(mockDoc, SAMPLE_PROJECT, { x: 10, y: 10, w: 200, h: 140 });
  const sPdf = TechnicalDrawings.drawSectionPDF(mockDoc, SAMPLE_PROJECT, { x: 10, y: 10, w: 200, h: 140 }, { axis: 'x' });
  assert.equal(rPdf.valid, true);
  assert.equal(sPdf.valid, true);
  assert.ok(ops.filter(o => o[0] === 'line').length > 20);

  // Vérification sur le projet réel residence-verandas
  const verandas = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));
  const vRoof = TechnicalDrawings.computeRoofPlan(verandas);
  const vSec = TechnicalDrawings.computeSection(verandas, { axis: 'x' });
  assert.equal(vRoof.valid, true);
  assert.equal(vSec.valid, true);
  assert.ok(vSec.cutWalls.length >= 2);
});

// ============================================================================
// 3. ANNOTATIONS ÉPINGLÉES 2D ↔ 3D ↔ PORTAIL CLIENT
// ============================================================================
test('feedbackStore gère wallId/wallLabel/level/source et listChannels, avec contrôle de rôle HTTP', async t => {
  const sb = makeSandbox(t);
  const ch = 'a'.repeat(32);

  // Test unitaire store
  const created = feedbackStore.append(path.join(sb.root, 'projects'), 'projet-a', ch, {
    point: [2.5, 1.4, 3.2],
    pose: { p: [2.5, 5.9, 8.2], q: [0, 0, 0, 1], f: 50, e: 1 },
    room: 'sejour',
    wallId: 'w-mid',
    wallLabel: 'Cloison #5',
    level: 0,
    source: '2d',
    text: 'Décaler la porte de 30 cm vers le nord.'
  });
  assert.equal(created.wallId, 'w-mid');
  assert.equal(created.wallLabel, 'Cloison #5');
  assert.equal(created.level, 0);
  assert.equal(created.source, '2d');

  const fallbackSrc = feedbackStore.append(path.join(sb.root, 'projects'), 'projet-a', ch, {
    point: [1, 1.4, 2], pose: { p: [1, 5, 6], q: [0, 0, 0, 1], f: 50, e: 1 }, text: 'Source inconnue repliée en 3d', source: 'invalid'
  });
  assert.equal(fallbackSrc.source, '3d');

  const channels = feedbackStore.listChannels(path.join(sb.root, 'projects'), 'projet-a');
  assert.equal(channels.length, 1);
  assert.equal(channels[0].total, 2);
  assert.equal(channels[0].open, 2);

  // Mode atelier local : GET ?list=1 et PATCH autorisés pour l'architecte local
  const localSrv = await sb.start();
  const listRes = await fetch(`${localSrv.origin}/api/client-feedback?project=projet-a&list=1`);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.channels.length, 1);

  const patchRes = await fetch(`${localSrv.origin}/api/client-feedback?project=projet-a`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Feedback-Channel': ch },
    body: JSON.stringify({ id: created.id, revision: 0, status: 'answered', reply: 'C’est noté sur le plan APD.' })
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.item.status, 'answered');
  assert.equal(patched.item.reply, 'C’est noté sur le plan APD.');

  // Mode portail privé : un invité ne peut ni lister tous les canaux (?list=1) ni modifier le statut (PATCH)
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const login = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  assert.equal(login.status, 200);
  const archCookie = login.headers.get('set-cookie').split(';')[0];

  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'comment', label: 'Client A', validHours: 24 })
  });
  assert.equal(invRes.status, 201);
  const { token: invToken } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token: invToken })
  });
  assert.equal(redeem.status, 200);
  const guestCookie = redeem.headers.get('set-cookie').split(';')[0];

  const guestList = await fetch(`${portalSrv.origin}/api/client-feedback?project=projet-a&list=1`, { headers: { Cookie: guestCookie } });
  assert.equal(guestList.status, 403, 'Invité bloqué sur ?list=1');

  const guestPatch = await fetch(`${portalSrv.origin}/api/client-feedback?project=projet-a`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie, 'X-Feedback-Channel': ch },
    body: JSON.stringify({ id: created.id, revision: 1, status: 'closed', reply: 'Tentative client' })
  });
  assert.equal(guestPatch.status, 403, 'Invité bloqué sur PATCH architecte');
});

// ============================================================================
// 4. COMPARATEUR DE VARIANTES A / B + SÉCURITÉ STOCKAGE & API
// ============================================================================
test('variantsStore & VariantComparator gèrent A/B, confinement des chemins, écarts et permissions portail', async t => {
  const sb = makeSandbox(t);
  const projectsDir = path.join(sb.root, 'projects');

  // Sécurité : chemin traversant, emplacement invalide, previewImage d'un autre projet
  assert.throws(() => variantsStore.list(projectsDir, '../etc'), /invalide/i);
  assert.throws(() => variantsStore.save(projectsDir, 'projet-a', 'C', { snapshot: SAMPLE_PROJECT }), /invalide/i);
  assert.throws(() => variantsStore.save(projectsDir, 'projet-a', 'A', { snapshot: {} }), /walls et rooms/i);

  const varA = variantsStore.save(projectsDir, 'projet-a', 'A', {
    label: 'Option A — Base',
    materials: { floor: 'Grès cérame 60×60', facade: 'Enduit blanc' },
    previewImage: 'projects/projet-b/generated/renders/hack.jpg', // doit être rejeté (autre projet)
    snapshot: SAMPLE_PROJECT
  });
  assert.equal(varA.previewImage, '', 'Une previewImage pointant vers un autre projet est ignorée');

  const projectB = JSON.parse(JSON.stringify(SAMPLE_PROJECT));
  projectB.rooms[0].bounds.xMax = 8; // Séjour agrandi de 48 à 64 m²
  projectB.rooms.push({ id: 'bureau', name: 'Bureau', level: 0, habitable: true, bounds: { xMin: 12, xMax: 15, zMin: 0, zMax: 4 } });
  const varB = variantsStore.save(projectsDir, 'projet-a', 'B', {
    label: 'Option B — Séjour agrandi + Bureau',
    materials: { floor: 'Parquet bois exotique', facade: 'Enduit & pierre' },
    snapshot: projectB
  });

  const listed = variantsStore.list(projectsDir, 'projet-a');
  assert.equal(listed.A.label, 'Option A — Base');
  assert.equal(listed.B.label, 'Option B — Séjour agrandi + Bureau');

  const cmp = VariantComparator.compare(varA, varB, { CostEstimate });
  assert.ok(cmp.deltas.habitable > 20, `Gain habitable attendu (+28 m²), obtenu ${cmp.deltas.habitable}`);
  assert.ok(cmp.deltas.budgetLow > 0, 'Budget bas en hausse sur la variante plus grande');
  assert.ok(cmp.roomDiff.some(r => r.name === 'Bureau' && r.status === 'added'));
  assert.ok(cmp.roomDiff.some(r => r.name === 'Séjour' && r.status === 'resized' && r.delta > 0));
  assert.equal(cmp.materialChanges.length, 2);

  const svg = VariantComparator.miniPlanSVG(varB);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<rect /);
  assert.match(svg, /<line /);
  assert.match(svg, /Bureau/);

  // API HTTP en mode portail privé : architecte R/W, invité lecture seule sur son projet uniquement
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const login = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  assert.equal(login.status, 200);
  const archCookie = login.headers.get('set-cookie').split(';')[0];

  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'read', label: 'Client Lecture', validHours: 24 })
  });
  assert.equal(invRes.status, 201);
  const { token: invToken } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token: invToken })
  });
  assert.equal(redeem.status, 200);
  const guestCookie = redeem.headers.get('set-cookie').split(';')[0];

  const guestReadOwn = await fetch(`${portalSrv.origin}/api/projects/projet-a/variants`, { headers: { Cookie: guestCookie } });
  assert.equal(guestReadOwn.status, 200);
  const ownBody = await guestReadOwn.json();
  assert.equal(ownBody.variants.A.label, 'Option A — Base');

  const guestReadOther = await fetch(`${portalSrv.origin}/api/projects/projet-b/variants`, { headers: { Cookie: guestCookie } });
  assert.equal(guestReadOther.status, 403, 'Invité bloqué sur les variantes d’un autre projet');

  const guestWrite = await fetch(`${portalSrv.origin}/api/projects/projet-a/variants/A`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie },
    body: JSON.stringify({ label: 'Modif client', snapshot: SAMPLE_PROJECT })
  });
  assert.equal(guestWrite.status, 403, 'Invité bloqué en écriture sur les variantes');

  const archDelete = await fetch(`${portalSrv.origin}/api/projects/projet-a/variants/B`, {
    method: 'DELETE',
    headers: { Origin: portalSrv.origin, Cookie: archCookie }
  });
  assert.equal(archDelete.status, 200);
});

// ============================================================================
// 5. BRANCHEMENT DES INTERFACES (HTML / WORKSPACE / PLANBOOK)
// ============================================================================
test('editor.html, index.html, planBook.js et workspace.js exposent les 4 nouveaux outils', () => {
  const editorHtml = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  for (const id of [
    'btn-tech-drawings', 'btn-annotations', 'btn-variants', 'est-xlsx',
    'dlg-tech-drawings', 'dlg-annotations', 'dlg-variants',
    'data-tool="annotate"',
    'js/xlsxExport.js', 'js/technicalDrawings.js', 'js/variantComparator.js', 'js/editorStudioTools.js'
  ]) {
    assert.ok(editorHtml.includes(id), `editor.html doit contenir ${id}`);
  }
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="atlas-bqe-xlsx"'));
  const planBook = fs.readFileSync(path.join(ROOT, 'js', 'planBook.js'), 'utf8');
  assert.ok(planBook.includes("id: 'sections2d'") && planBook.includes("id: 'roof2d'") && planBook.includes('TechnicalDrawings'));
  const workspaceJs = fs.readFileSync(path.join(ROOT, 'js', 'workspace.js'), 'utf8');
  assert.ok(workspaceJs.includes("'xlsxExport'") && workspaceJs.includes("'technicalDrawings'") && workspaceJs.includes("'variantComparator'"));
});

test('Cahier de plans A3 (jsPDF réel) : couverture sans hero, marque cabinet, coupes et toiture vectorielles valides', () => {
  const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
  const PlanBook = require('../js/planBook.js');
  const planBookSrc = fs.readFileSync(path.join(ROOT, 'js', 'planBook.js'), 'utf8');
  assert.ok(!planBookSrc.includes("'PLAN / 3D'"), 'Le cartouche pied de page doit utiliser le nom du cabinet / ArchiCam Studio');
  assert.ok(planBookSrc.includes('studio?.hs || null'), 'exportBook doit fonctionner même avec studio: null');

  const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape', compress: false });
  const sheets = [
    { id: 'cover', code: 'PL-00', title: 'Couverture', section: 'Présentation' },
    { id: 'plan', code: 'PL-01', title: 'Plan - Rez-de-chaussée', section: 'Plans' },
    { id: 'section2d', code: 'PL-02', title: 'Coupe longitudinale A–A', section: 'Coupes' },
    { id: 'roof2d', code: 'PL-03', title: 'Plan de toiture', section: 'Toiture' }
  ];
  const cabinet = { name: 'Atelier Ndongo', architect: 'Jean Ndongo' };
  PlanBook.cover(doc, { ...SAMPLE_PROJECT, cabinet }, sheets[0], null, sheets, null, null, { cabinet });

  doc.addPage('a3', 'landscape');
  const roof = TechnicalDrawings.drawRoofPlanPDF(doc, SAMPLE_PROJECT, { x: 20, y: 42, w: 280, h: 210 }, 100);
  assert.equal(roof.valid, true);

  doc.addPage('a3', 'landscape');
  const sec = TechnicalDrawings.drawSectionPDF(doc, SAMPLE_PROJECT, { x: 20, y: 42, w: 280, h: 210 }, 100, { axis: 'x', label: 'Coupe A–A' });
  assert.equal(sec.valid, true);

  const rawPdf = doc.output();
  assert.match(rawPdf, /^%PDF-/);
  assert.ok(rawPdf.includes('ATELIER NDONGO'), 'Le nom du cabinet apparaît dans le PDF A3');
  assert.ok(rawPdf.includes('FA\\316TAGE') || rawPdf.includes('FAÎTAGE') || rawPdf.includes('Toiture 4 pentes'), 'Les annotations techniques de toiture figurent dans le PDF');
  assert.equal(doc.getNumberOfPages(), 3);
});

// ============================================================================
// 6. JOURNAL DES RÉVISIONS (V1, V2, V3…) + ÉCARTS + RBAC PORTAIL
// ============================================================================
test('revisionsStore & API /api/projects/:slug/revisions gèrent V1/V2, deltas automatiques et permissions portail', async t => {
  const sb = makeSandbox(t);
  const projectsDir = path.join(sb.root, 'projects');

  // Sécurité : chemin traversant et snapshot invalide
  assert.throws(() => revisionsStore.list(projectsDir, '../etc'), /invalide/i);
  assert.throws(() => revisionsStore.create(projectsDir, 'projet-a', { snapshot: {} }), /Instantané de projet requis/i);

  const snapV1 = {
    ...SAMPLE_PROJECT,
    rooms: [
      { id: 'sejour', name: 'Séjour', level: 0, habitable: true, area: 48 },
      { id: 'chambre1', name: 'Chambre 1', level: 0, habitable: true, area: 30 },
      { id: 'terrasse', name: 'Terrasse', level: 0, habitable: false, area: 18 }
    ],
    estimate: { low: 45000000, high: 55000000 }
  };
  const v1 = revisionsStore.create(projectsDir, 'projet-a', {
    label: 'Remise APS initiale',
    phase: 'APS',
    note: 'Première proposition complète.',
    snapshot: snapV1,
    feedbackSummary: { open: 3, resolved: 0 }
  });
  assert.equal(v1.tag, 'V1');
  assert.equal(v1.version, 'V1');
  assert.equal(v1.diff, null);
  assert.equal(v1.metrics.habitable, 78);

  const snapV2 = {
    ...snapV1,
    rooms: [
      ...snapV1.rooms,
      { id: 'bureau', name: 'Bureau', level: 0, habitable: true, area: 14 }
    ],
    estimate: { low: 52000000, high: 64000000 }
  };
  const v2 = revisionsStore.create(projectsDir, 'projet-a', {
    label: 'Suite réunion client #1',
    phase: 'APD',
    note: 'Ajout d’un bureau indépendant.',
    snapshot: snapV2,
    feedbackSummary: { open: 1, resolved: 2 }
  });
  assert.equal(v2.tag, 'V2');
  assert.equal(v2.diff.habitableDelta, 14);
  assert.equal(v2.diff.roomsDelta, 1);
  assert.equal(v2.diff.budgetLowDelta, 7000000);
  assert.equal(v2.diff.feedbackDelta, -2);
  assert.equal(v2.diff.feedbackResolvedDelta, 2);

  // API HTTP en mode portail privé : architecte R/W, invité lecture seule sur son projet uniquement
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const login = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  assert.equal(login.status, 200);
  const archCookie = login.headers.get('set-cookie').split(';')[0];

  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'read', label: 'Client Révisions', validHours: 24 })
  });
  assert.equal(invRes.status, 201);
  const { token: invToken } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token: invToken })
  });
  assert.equal(redeem.status, 200);
  const guestCookie = redeem.headers.get('set-cookie').split(';')[0];

  const guestListOwn = await fetch(`${portalSrv.origin}/api/projects/projet-a/revisions`, { headers: { Cookie: guestCookie } });
  assert.equal(guestListOwn.status, 200);
  const ownData = await guestListOwn.json();
  assert.equal(ownData.items.length, 2);
  assert.equal(ownData.items[1].tag, 'V2');

  const guestListOther = await fetch(`${portalSrv.origin}/api/projects/projet-b/revisions`, { headers: { Cookie: guestCookie } });
  assert.equal(guestListOther.status, 403, 'Invité bloqué sur le journal d’un autre projet');

  const guestCreate = await fetch(`${portalSrv.origin}/api/projects/projet-a/revisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie },
    body: JSON.stringify({ label: 'Tentative client', snapshot: snapV2 })
  });
  assert.equal(guestCreate.status, 403, 'Invité bloqué en écriture sur le journal des révisions');

  const archDel = await fetch(`${portalSrv.origin}/api/projects/projet-a/revisions/${encodeURIComponent(v2.id)}`, {
    method: 'DELETE',
    headers: { Origin: portalSrv.origin, Cookie: archCookie }
  });
  assert.equal(archDel.status, 200);
  assert.equal(revisionsStore.list(projectsDir, 'projet-a').length, 1);
});

// ============================================================================
// 7. DOSSIER APD / PERMIS DE CONSTRUIRE GUIDÉ (PC-01 → PC-08 + PDF A4 RÉEL)
// ============================================================================
test('ApdDossier évalue les 8 pièces réglementaires et assemble un PDF A4 relié valide', async () => {
  const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
  const projectWithAreas = {
    ...SAMPLE_PROJECT,
    rooms: SAMPLE_PROJECT.rooms.map(r => ({
      ...r,
      area: (r.bounds.xMax - r.bounds.xMin) * (r.bounds.zMax - r.bounds.zMin)
    }))
  };
  const cabinet = { name: 'Atelier Lumière', architect: 'Claire Mbarga' };
  const ev = ApdDossier.evaluate({
    project: projectWithAreas,
    cabinet,
    media: { images: [{ id: 'facade-sud' }, { id: 'plan-masse' }], renders: [] },
    planches: [{ title: 'Plan de masse cadastral', category: 'masse' }],
    deps: { TechnicalDrawings, CostEstimate }
  });

  assert.equal(ev.pieces.length, 8);
  assert.deepEqual(ev.pieces.map(p => p.code), ['PC-01', 'PC-02', 'PC-03', 'PC-04', 'PC-05', 'PC-06', 'PC-07', 'PC-08']);
  assert.equal(ev.canExport, true);
  assert.ok(ev.completeness >= 90, `Complétude attendue >= 90%, obtenu ${ev.completeness}%`);

  const exported = await ApdDossier.exportPDF({
    project: projectWithAreas,
    cabinet,
    media: { images: [{ id: 'facade-sud' }], renders: [] },
    planches: [{ title: 'Plan de masse', category: 'masse' }],
    deps: { TechnicalDrawings, CostEstimate },
    jsPDFCtor: jsPDF
  });
  assert.equal(exported.filename, 'villa-test-dossier-APD-PC.pdf');
  assert.ok(exported.pages >= 3);
  const rawPdf = exported.doc.output();
  assert.match(rawPdf, /^%PDF-/);
  assert.ok(rawPdf.includes('ATELIER LUMI'));
  assert.ok(rawPdf.includes('PC-01') && rawPdf.includes('PC-08'));
});

// ============================================================================
// 8. BRANCHEMENT DES 6 NOUVELLES FONCTIONS SUR TOUTES LES PAGES
// ============================================================================
test('studio.html, accueil.html, index.html, editor.html et workspace.js exposent les 6 nouvelles fonctionnalités', () => {
  const studioHtml = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  for (const token of ['id="btn-studio-cabinet"', 'id="studio-cabinet-dlg"', 'id="studio-resume"', 'id="print-project-link"', 'portal.html']) {
    assert.ok(studioHtml.includes(token), `studio.html doit contenir ${token}`);
  }

  const accueilHtml = fs.readFileSync(path.join(ROOT, 'accueil.html'), 'utf8');
  for (const token of ['id="btn-meeting-mode"', 'id="sheet-export-apd"', 'id="sheet-revisions"', 'id="sheet-revisions-list"']) {
    assert.ok(accueilHtml.includes(token), `accueil.html doit contenir ${token}`);
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const token of ['id="client-north"', 'id="solar-play"', 'id="solar-city"', 'id="solar-season"', 'data-ambiance="pierre-chaux"', 'data-ambiance="villa-tropicale"']) {
    assert.ok(indexHtml.includes(token), `index.html doit contenir ${token}`);
  }

  const editorHtml = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  for (const token of ['id="btn-apd-dossier"', 'id="btn-revisions"', 'id="dlg-apd-dossier"', 'id="dlg-revisions"', 'js/apdDossier.js']) {
    assert.ok(editorHtml.includes(token), `editor.html doit contenir ${token}`);
  }

  const workspaceJs = fs.readFileSync(path.join(ROOT, 'js', 'workspace.js'), 'utf8');
  assert.ok(workspaceJs.includes("'apdDossier'") && workspaceJs.includes("'meetingMode'"));
});

// ============================================================================
// 9. CINÉMATOGRAPHIE LENTE, PERSONNAGES ANIMÉS & PROMPTS VIDÉO IA VIVANTS
// ============================================================================
test('Cinématographie lente, vie extérieure et prompts vidéo IA sont correctement configurés', () => {
  const AiPrompt = require('../js/aiPrompt.js');
  const videoExt = AiPrompt.buildVideoPrompt({
    kind: 'exterior',
    movement: 'slow dolly-in along the garden path toward the veranda',
    city: 'Douala, Cameroun',
    livingPeople: true,
    livingEnvironment: true,
    pace: 'contemplatif'
  });
  assert.match(videoExt, /ultra-slow|meditative/i);
  assert.match(videoExt, /strictly preserve/i);
  assert.match(videoExt, /strolling|residents|human presence/i);
  assert.match(videoExt, /palm fronds|clouds|breeze/i);

  const videoStill = AiPrompt.buildVideoPrompt({
    kind: 'interior',
    room: 'Grand Séjour',
    livingPeople: false,
    livingEnvironment: false,
    pace: 'cinema'
  });
  assert.match(videoStill, /Grand Séjour/);
  assert.doesNotMatch(videoStill, /Natural human presence/i);
  assert.doesNotMatch(videoStill, /Living environment/i);

  // Vérification de la fonction monotone de ralentissement dans les pièces (ScrollTour)
  const vm = require('node:vm');
  const scrollTourSrc = fs.readFileSync(path.join(ROOT, 'js', 'scrollTour.js'), 'utf8');
  class FakeVec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
  }
  const sandbox = {
    window: {},
    THREE: {
      Vector3: FakeVec3,
      CatmullRomCurve3: class { constructor(pts) { this.pts = pts; } getPoint(t, out) { return out.copy(this.pts[Math.min(this.pts.length - 1, Math.floor(t * (this.pts.length - 1)))]); } }
    },
    HOUSE_DATA: {
      config: { elevationEnd: 0.25 },
      rooms: [],
      tourWaypoints: [
        { pos: [0, 20, 0], look: [0, 0, 0], fov: 26 },
        { pos: [5, 10, 15], look: [5, 2, 5], fov: 38 },
        { pos: [5, 1.65, 10], look: [5, 1.5, 4], fov: 56 },
        { pos: [5, 1.65, 4], look: [8, 1.5, 4], fov: 62 },
        { pos: [8, 1.65, 4], look: [8, 1.5, 1], fov: 60 },
        { pos: [12, 14, 16], look: [5, 2, 5], fov: 44 }
      ]
    }
  };
  vm.runInNewContext(scrollTourSrc + '; globalThis.__ScrollTour = ScrollTour;', sandbox);
  const tour = new sandbox.__ScrollTour({ camera: { position: new FakeVec3(), fov: 50, lookAt() {}, updateProjectionMatrix() {} }, setElevation() {} });
  assert.equal(tour.getPaceConfig().seconds, 52);
  tour.setPace('contemplatif');
  assert.equal(tour.getPaceConfig().seconds, 72);
  let prev = -1;
  for (let i = 0; i <= 40; i++) {
    const r = tour.remapProgress(i / 40);
    assert.ok(r >= prev - 1e-9, `remapProgress doit rester monotone croissant (${prev} -> ${r})`);
    prev = r;
  }
  assert.equal(tour.remapProgress(0), 0);
  assert.equal(tour.remapProgress(1), 1);

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const token of ['id="guided-autoplay"', 'id="tour-pace"', 'id="toggle-living-scene"']) {
    assert.ok(indexHtml.includes(token), `index.html doit contenir ${token}`);
  }
  const styleCss = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(styleCss, /#scroll-container\s*\{[^}]*height:\s*1800vh/);
});

// ============================================================================
// 10. SUITE IA AVANCÉE (6 OUTILS : TERRAIN, RETOUCHE/STYLES, DÉBUT→FIN, VOIX OFF, 360°, BIOCLIMATIQUE & CCTP)
// ============================================================================
test('Suite IA Avancée : BioclimaticAudit, Panoramas 360°, endpoints serveur, RBAC et interface complète', async t => {
  const BioclimaticAudit = require('../js/bioclimaticAudit.js');
  const geminiClient = require('../geminiClient.js');

  assert.equal(geminiClient.TEXT_MODEL, 'gemini-4-hydrogen');
  assert.equal(geminiClient.TTS_MODEL, 'gemini-3.8-flash-lite-tts');

  const audit = BioclimaticAudit.analyze(SAMPLE_PROJECT, { city: 'douala', northAngle: 15 });
  assert.ok(audit.score >= 25 && audit.score <= 98);
  assert.equal(audit.facades.length, 4);
  assert.ok(audit.metrics.habitableAreaM2 > 100);
  assert.ok(audit.recommendations.length >= 1);

  const cctp = BioclimaticAudit.buildLocalCctpMarkdown(SAMPLE_PROJECT, audit);
  assert.match(cctp, /Lot 01/);
  assert.match(cctp, /Lot 08/);
  assert.match(cctp, /Score : \d+\/100/);

  const script = BioclimaticAudit.buildLocalVoiceoverScript(SAMPLE_PROJECT, audit);
  assert.match(script, /Villa Test/);
  assert.match(script, /Douala/);

  // Vérification sur le projet réel residence-verandas
  const verandas = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));
  const vAudit = BioclimaticAudit.analyze(verandas);
  assert.ok(vAudit.score >= 40 && vAudit.facades.length === 4);

  // Tests HTTP sandbox : /api/ai/status, /api/ai/bioclimatic-cctp, /api/save-panorama, /api/panoramas & RBAC
  const sb = makeSandbox(t);
  const localSrv = await sb.start({ GEMINI_API_KEY: '', OPENROUTER_API_KEY: '' });

  const stRes = await fetch(`${localSrv.origin}/api/ai/status`);
  assert.equal(stRes.status, 200);
  const stBody = await stRes.json();
  assert.equal(typeof stBody.gemini, 'boolean');
  assert.equal(typeof stBody.openRouter, 'boolean');

  const bioRes = await fetch(`${localSrv.origin}/api/ai/bioclimatic-cctp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'projet-a', city: 'yaounde', localOnly: true })
  });
  assert.equal(bioRes.status, 200);
  const bioData = await bioRes.json();
  assert.equal(bioData.ok, true);
  assert.match(bioData.markdown, /Lot 01/);

  // 1x1 PNG valide pour test panorama 360°
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const panoSave = await fetch(`${localSrv.origin}/api/save-panorama?project=projet-a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'pano-sejour', label: 'Séjour (360°)', roomId: 'sejour', source: '3d', dataUrl: tinyPng })
  });
  assert.equal(panoSave.status, 200);
  const panoSaved = await panoSave.json();
  assert.equal(panoSaved.ok, true);
  assert.match(panoSaved.item.file, /^projects\/projet-a\/generated\/panoramas\/pano-sejour\.png$/);

  const panoList = await fetch(`${localSrv.origin}/api/panoramas?project=projet-a`);
  assert.equal(panoList.status, 200);
  const panoListData = await panoList.json();
  assert.equal(panoListData.items.length, 1);
  assert.equal(panoListData.items[0].id, 'pano-sejour');

  // Sécurité portail : un invité lecture seule est bloqué sur les routes Studio IA
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const login = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  const archCookie = login.headers.get('set-cookie').split(';')[0];
  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'read', label: 'Invité Studio IA', validHours: 24 })
  });
  const { token } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token })
  });
  const guestCookie = redeem.headers.get('set-cookie').split(';')[0];

  for (const [ep, payload] of [
    ['/api/ai/bioclimatic-cctp', { project: 'projet-a', localOnly: true }],
    ['/api/ai/voiceover', { project: 'projet-a', action: 'script' }],
    ['/api/save-panorama?project=projet-a', { id: 'hack', dataUrl: tinyPng }]
  ]) {
    const blocked = await fetch(`${portalSrv.origin}${ep}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie },
      body: JSON.stringify(payload)
    });
    assert.equal(blocked.status, 403, `Invité bloqué sur ${ep}`);
  }

  // Vérification interface & branchements
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const token of ['css/aiStudioSuite.css', 'id="btn-ai-studio"', 'id="rg-open-ai-studio"', 'id="dlg-ai-studio"']) {
    assert.ok(indexHtml.includes(token), `index.html doit contenir ${token}`);
  }
  const workspaceJs = fs.readFileSync(path.join(ROOT, 'js', 'workspace.js'), 'utf8');
  assert.ok(workspaceJs.includes("'bioclimaticAudit'") && workspaceJs.includes("'aiStudioSuite'"));
});

// ============================================================================
// 11. ÉDITEUR CAO 2D/3D TEMPS RÉEL, MOBILIER VISUEL, BROUILLONS & MEUBLAGE AUTO
// ============================================================================
test('Éditeur 2D/3D : Furniture2D, aimantation murs, modèles de départ, API brouillons & meublage auto + RBAC', async t => {
  const Furniture2D = require('../js/furniture2d.js');

  assert.ok(Array.isArray(Furniture2D.CATALOG) && Furniture2D.CATALOG.length >= 30, 'Catalogue étendu >= 30 meubles');
  assert.equal(Furniture2D.inferSymbol({ name: 'Canapé d’angle', w: 2.5, d: 1.7 }), 'sofaCorner');
  assert.equal(Furniture2D.inferSymbol({ name: 'Douche italienne', w: 1.1, d: 0.9 }), 'shower');
  assert.equal(Furniture2D.inferSymbol({ name: 'Lit simple 90', model: 'bed', w: 0.95, d: 2.0 }), 'bedSingle');
  assert.equal(Furniture2D.inferSymbol({ name: 'Évier inox', w: 0.8, d: 0.5 }), 'sink');

  // Aimantation magnétique sur un mur nord horizontal (z = 0, épaisseur 0.25)
  const wall = { from: [0, 0], to: [6, 0], thick: 0.25, type: 'ext' };
  const sofa = { name: 'Canapé 3 places', symbol: 'sofa', w: 2.1, d: 0.92 };
  const snap = Furniture2D.snapFurnitureToWall({ x: 3.0, z: 0.7 }, sofa, [wall], 0.55);
  assert.ok(snap, 'Le canapé proche du mur doit s’aimanter');
  assert.ok(Math.abs(snap.z - (0.25 / 2 + 0.92 / 2 + 0.02)) < 0.03, `Position collée attendue (~0.61), obtenue ${snap.z}`);
  assert.ok(Math.abs(snap.rotY) < 0.01, 'Le canapé doit faire face vers +Z (intérieur de la pièce)');

  // Modèles de départ complets et meublés
  const villaTpl = Furniture2D.getStarterTemplate('villa-f4');
  assert.ok(villaTpl.walls.length >= 6 && villaTpl.rooms.length >= 4 && villaTpl.furniture.length >= 10);
  const studioTpl = Furniture2D.getStarterTemplate('studio');
  assert.ok(studioTpl.walls.length >= 5 && studioTpl.rooms.length >= 2 && studioTpl.furniture.length >= 5);

  // Tests HTTP sandbox : /api/projects/:slug/draft, /api/ai/auto-furnish et nettoyage au save
  const sb = makeSandbox(t);
  const localSrv = await sb.start({ GEMINI_API_KEY: '' });

  const draftSave = await fetch(`${localSrv.origin}/api/projects/projet-a/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: SAMPLE_PROJECT })
  });
  assert.equal(draftSave.status, 200);
  const draftSaveData = await draftSave.json();
  assert.equal(draftSaveData.ok, true);
  assert.ok(draftSaveData.savedAt);

  const draftGet = await fetch(`${localSrv.origin}/api/projects/projet-a/draft`);
  assert.equal(draftGet.status, 200);
  const draftBody = await draftGet.json();
  assert.equal(draftBody.draft.slug, 'projet-a');
  assert.equal(draftBody.draft.wallCount, SAMPLE_PROJECT.walls.length);

  // Le fichier .draft.json ne doit jamais être servi statiquement (fichier caché)
  const staticDraft = await fetch(`${localSrv.origin}/projects/projet-a/.draft.json`);
  assert.notEqual(staticDraft.status, 200, 'Les brouillons dot-préfixés ne doivent pas être servis statiquement');

  // Enregistrer officiellement le projet supprime automatiquement .draft.json
  const formalSave = await fetch(`${localSrv.origin}/api/save-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'projet-a', project: SAMPLE_PROJECT })
  });
  assert.equal(formalSave.status, 200);
  const draftAfterSave = await (await fetch(`${localSrv.origin}/api/projects/projet-a/draft`)).json();
  assert.equal(draftAfterSave.draft, null, 'Le brouillon est purgé après enregistrement officiel');

  // Meublage automatique intelligent
  const furnishRes = await fetch(`${localSrv.origin}/api/ai/auto-furnish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: SAMPLE_PROJECT, level: 0, useAi: false })
  });
  assert.equal(furnishRes.status, 200);
  const furnishData = await furnishRes.json();
  assert.equal(furnishData.ok, true);
  assert.ok(furnishData.furniture.length >= 6, `Au moins 6 meubles attendus pour Séjour+Chambre+Terrasse, reçu ${furnishData.furniture.length}`);
  assert.ok(furnishData.furniture.every(f => Number.isFinite(f.x) && Number.isFinite(f.z) && f.symbol));

  // RBAC Portail privé : un invité est bloqué (403) sur /draft et /api/ai/auto-furnish
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const login = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  const archCookie = login.headers.get('set-cookie').split(';')[0];
  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'comment', label: 'Invité Éditeur', validHours: 24 })
  });
  const { token } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token })
  });
  const guestCookie = redeem.headers.get('set-cookie').split(';')[0];

  const blockedDraft = await fetch(`${portalSrv.origin}/api/projects/projet-a/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie },
    body: JSON.stringify({ project: SAMPLE_PROJECT })
  });
  assert.equal(blockedDraft.status, 403, 'Invité bloqué sur /draft');

  const blockedFurnish = await fetch(`${portalSrv.origin}/api/ai/auto-furnish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: guestCookie },
    body: JSON.stringify({ project: SAMPLE_PROJECT })
  });
  assert.equal(blockedFurnish.status, 403, 'Invité bloqué sur /api/ai/auto-furnish');

  // Vérification du branchement dans editor.html et js/editor.js
  const editorHtml = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  for (const token of [
    'id="ed-live3d-wrap"', 'id="ed-cad-bar"', 'id="ed-panel-tabs"',
    'id="ed-empty-start"', 'id="ed-quick-bar"', 'id="ed-draft-banner"',
    'data-tool="measure"', 'js/furniture2d.js', 'js/editorLive3d.js'
  ]) {
    assert.ok(editorHtml.includes(token), `editor.html doit contenir ${token}`);
  }
});

// ============================================================================
// 12. SUBLIMATION ATELIER (STUDIO.HTML) & IHM UNIVERSELLE (PALETTE ⌘K + RACCOURCIS)
// ============================================================================
test('Atelier & IHM universelle : typographie, transitions GPU-only et palette ⌘K sur les 4 vues', () => {
  const tokensCss = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
  assert.match(tokensCss, /--mono:/, 'tokens.css doit définir la police technique --mono');
  assert.match(tokensCss, /font-optical-sizing:\s*auto/, 'tokens.css doit activer la taille optique serif');
  assert.match(tokensCss, /text-wrap:\s*balance/, 'tokens.css doit équilibrer les titres');

  const studioCss = fs.readFileSync(path.join(ROOT, 'css', 'studio.css'), 'utf8');
  assert.doesNotMatch(studioCss, /transition:[^;]*letter-spacing/, 'studio.css ne doit pas animer letter-spacing (reflow)');
  assert.match(studioCss, /prefers-reduced-motion:\s*reduce/, 'studio.css doit respecter prefers-reduced-motion');

  const studioHtml = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  assert.ok(!studioHtml.includes('studio-dot'), 'studio.html supprime la pastille décorative dans le logo');
  assert.ok(studioHtml.includes('data-cmd-trigger="1"'), 'studio.html intègre le déclencheur ⌘K dans la barre 3 zones');
  assert.ok(studioHtml.includes('id="resume-thumb"'), 'studio.html inclut la vignette aperçu du dernier dossier');
  assert.ok(studioHtml.includes('id="btn-studio-index-nav"'), 'studio.html expose l’accès Index dans l’en-tête');

  const ihmCss = fs.readFileSync(path.join(ROOT, 'css', 'ihm.css'), 'utf8');
  const cmdJs = fs.readFileSync(path.join(ROOT, 'js', 'commandPalette.js'), 'utf8');
  assert.match(ihmCss, /\.ihm-palette/, 'css/ihm.css doit styler la palette de commandes');
  assert.match(cmdJs, /__archicamIHM/, 'js/commandPalette.js doit exposer l’API IHM globale');
  assert.ok(!cmdJs.includes('innerHTML'), 'js/commandPalette.js doit construire le DOM sans innerHTML');

  for (const page of ['studio.html', 'accueil.html', 'editor.html', 'index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(html.includes('css/ihm.css'), `${page} doit charger css/ihm.css`);
    assert.ok(html.includes('js/commandPalette.js'), `${page} doit charger js/commandPalette.js`);
  }
});

// ============================================================================
// 13. ASSISTANT CHAT IA EN STREAMING (/api/ai/assistant + TIROIR + RBAC)
// ============================================================================
test('Assistant Chat IA : endpoint /api/ai/assistant, validation, RBAC portail et intégration 4 vues', async t => {
  const geminiClient = require('../geminiClient.js');
  assert.equal(typeof geminiClient.streamAssistantChat, 'function', 'geminiClient doit exporter streamAssistantChat');

  const sb = makeSandbox(t);
  const srv = await sb.start({ GEMINI_API_KEY: '' });

  // 1) Message vide -> 400
  const emptyRes = await fetch(`${srv.origin}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'projet-a', messages: [] })
  });
  assert.equal(emptyRes.status, 400, 'Message vide doit retourner 400');

  // 2) Slug malveillant -> 400
  const badSlugRes = await fetch(`${srv.origin}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: '../../etc/passwd', messages: [{ role: 'user', text: 'Bonjour' }] })
  });
  assert.equal(badSlugRes.status, 400, 'Slug traversal doit retourner 400');

  // 3) Image invalide -> 400
  const badImgRes = await fetch(`${srv.origin}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'projet-a', messages: [{ role: 'user', text: 'Analyse' }], imageDataUrl: 'javascript:alert(1)' })
  });
  assert.equal(badImgRes.status, 400, 'ImageDataUrl non conforme doit retourner 400');

  // 4) Sans GEMINI_API_KEY -> 401 explicite (aucune réponse factice)
  const noKeyRes = await fetch(`${srv.origin}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'projet-a', messages: [{ role: 'user', text: 'Quelle est la surface ?' }] })
  });
  assert.equal(noKeyRes.status, 401, 'Sans GEMINI_API_KEY le serveur doit renvoyer 401');

  // 5) Contrôle d’accès Portail privé : un client invité sur projet-a ne peut pas interroger projet-b
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1', GEMINI_API_KEY: '' });
  const loginRes = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  assert.equal(loginRes.status, 200);
  const archCookie = loginRes.headers.get('set-cookie').split(';')[0];

  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'read', validHours: 24, label: 'Client IA' })
  });
  const { token } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token })
  });
  const clientCookie = redeem.headers.get('set-cookie').split(';')[0];

  const crossProjectRes = await fetch(`${portalSrv.origin}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: clientCookie },
    body: JSON.stringify({ project: 'autre-projet', messages: [{ role: 'user', text: 'Infos ?' }] })
  });
  assert.equal(crossProjectRes.status, 403, 'Un invité portail ne doit pas interroger un autre projet');

  // 6) Validation /api/ai/assistant-tts (texte vide -> 400, sans clé -> 401)
  const ttsEmpty = await fetch(`${srv.origin}/api/ai/assistant-tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '   ' })
  });
  assert.equal(ttsEmpty.status, 400, 'TTS texte vide doit retourner 400');

  const ttsNoKey = await fetch(`${srv.origin}/api/ai/assistant-tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Présentation de la villa.' })
  });
  assert.equal(ttsNoKey.status, 401, 'TTS sans GEMINI_API_KEY doit retourner 401');

  // 7) Sécurité DOM client, mode flottant déplaçable, actions agent, voix, import & export livrable
  const aiJs = fs.readFileSync(path.join(ROOT, 'js', 'aiAssistant.js'), 'utf8');
  const aiCss = fs.readFileSync(path.join(ROOT, 'css', 'aiAssistant.css'), 'utf8');
  const cmdJs = fs.readFileSync(path.join(ROOT, 'js', 'commandPalette.js'), 'utf8');
  assert.ok(!aiJs.includes('innerHTML'), 'js/aiAssistant.js ne doit jamais utiliser innerHTML');
  assert.match(aiJs, /__archicamAssistant/, 'js/aiAssistant.js doit exposer window.__archicamAssistant');
  assert.match(aiJs, /AGENT_ACTIONS/, 'js/aiAssistant.js doit définir la liste blanche AGENT_ACTIONS');
  assert.match(aiJs, /bindDragging/, 'js/aiAssistant.js doit gérer le déplacement flottant');
  assert.match(aiJs, /exportMessageDeliverable/, 'js/aiAssistant.js doit permettre l’export livrable .md');
  assert.match(aiJs, /setupVoiceInput/, 'js/aiAssistant.js doit intégrer la dictée vocale');
  assert.match(aiJs, /loadDroppedOrPickedImage/, 'js/aiAssistant.js doit gérer le glisser-déposer et l’import d’images');
  assert.match(aiCss, /\.ai-chat-fab/, 'css/aiAssistant.css doit définir la bulle flottante .ai-chat-fab');
  assert.match(aiCss, /\.ai-chat-drawer\.is-floating/, 'css/aiAssistant.css doit définir le mode flottant');
  assert.match(aiCss, /\.ai-chat-drawer\.is-docked/, 'css/aiAssistant.css doit définir le mode ancré');
  assert.match(cmdJs, /__archicamAssistant/, 'commandPalette.js doit relier l’Assistant IA');

  for (const page of ['studio.html', 'accueil.html', 'editor.html', 'index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(html.includes('css/aiAssistant.css'), `${page} doit charger css/aiAssistant.css`);
    assert.ok(html.includes('js/aiAssistant.js'), `${page} doit charger js/aiAssistant.js`);
  }
});

// ============================================================================
// 14. SÉCURISATION DES GÉNÉRATEURS DE DOCUMENTS PAR L’ASSISTANT (PORTE E, CARTOUCHE, RBAC)
// ============================================================================
test('Document safety endpoint : résout uniquement ce que le dispositif autorise, applique Porte E sans contournement, n’invente aucun champ légal et bloque les clients portail', async (t) => {
  const sb = makeSandbox(t);
  // Configure un profil cabinet réel dans la sandbox
  fs.mkdirSync(path.join(sb.root, '.cabinet'), { recursive: true });
  fs.writeFileSync(path.join(sb.root, '.cabinet', 'profile.json'), JSON.stringify({
    name: 'Atelier Mbarga Architecture',
    architect: 'Claire Mbarga, DPLG'
  }, null, 2));

  // Prépare un projet avec champs cartouche incomplets, tiret fictif, clientVisible=true sans client,
  // et un rendu IA non conforme encore exposé dans catalogue/cahier
  const projPath = path.join(sb.root, 'projects', 'projet-a', 'project.json');
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  proj.meta = {
    name: 'Projet Sécurité Test',
    slug: 'projet-a',
    client: '',
    clientVisible: true,
    location: '—',
    phase: '',
    revision: '-',
    issueDate: ''
  };
  fs.writeFileSync(projPath, JSON.stringify(proj, null, 2));

  const genDir = path.join(sb.root, 'projects', 'projet-a', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const manifestPath = path.join(genDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    items: [
      {
        id: 'photor-drift-01',
        type: 'image',
        label: 'Séjour IA non fidèle',
        file: 'projects/projet-a/generated/images/photor-drift-01.png',
        ai: true,
        model: 'google/gemini-3.1-flash-image',
        catalog: true,
        book: true,
        published: true,
        fidelity: { version: 2, verdict: 'drift', score: 0.42 }
      },
      {
        id: 'photor-ok-02',
        type: 'image',
        label: 'Façade IA vérifiée',
        file: 'projects/projet-a/generated/images/photor-ok-02.png',
        ai: true,
        model: 'google/gemini-3.1-flash-image',
        catalog: true,
        book: true,
        published: true,
        fidelity: { version: 2, verdict: 'faithful', score: 0.96 }
      }
    ]
  }, null, 2));

  const srv = await sb.start();

  // 1) Résolution de sécurité automatique via POST /api/projects/projet-a/document-safety
  const res = await fetch(`${srv.origin}/api/projects/projet-a/document-safety`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'resolve' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  // Vérifie synchronisation réelle du profil cabinet + assainissement des tirets + confidentialité client
  assert.equal(data.meta.agency, 'Atelier Mbarga Architecture');
  assert.equal(data.meta.architect, 'Claire Mbarga, DPLG');
  assert.equal(data.meta.clientVisible, false, 'clientVisible doit être désactivé si aucun client');
  // Vérifie qu’AUCUN champ administratif/légal n’a été inventé (Règle 1 PdfIdentity)
  assert.equal(data.meta.client, '', 'Ne jamais inventer le maître d’ouvrage');
  assert.equal(data.meta.location, '', 'Les tirets fictifs doivent être nettoyés, jamais remplacés par un lieu inventé');
  assert.equal(data.meta.phase, '', 'Ne jamais inventer la phase en mode auto');
  assert.equal(data.meta.revision, '', 'Ne jamais inventer un indice A en mode auto');
  assert.equal(data.meta.issueDate, '', 'Ne jamais inventer une date d’émission en mode auto');
  assert.ok(data.missingCartouche.includes("Maître d'ouvrage"));
  assert.ok(data.missingCartouche.includes('Localisation'));

  // Vérifie quarantaine Porte E sur le rendu IA non fidèle, sans contournement ni suppression du rendu fidèle
  assert.deepEqual(data.porteE.quarantinedNow, ['Séjour IA non fidèle']);
  assert.equal(data.porteE.eligibleAi, 1);
  assert.equal(data.porteE.blockedAi, 1);

  const savedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const driftItem = savedManifest.items.find(i => i.id === 'photor-drift-01');
  const okItem = savedManifest.items.find(i => i.id === 'photor-ok-02');
  assert.equal(driftItem.catalog, false, 'Rendu IA non conforme retiré du catalogue');
  assert.equal(driftItem.book, false, 'Rendu IA non conforme retiré du cahier');
  assert.equal(driftItem.published, false, 'Rendu IA non conforme retiré de la publication');
  assert.equal(driftItem.fidelityOverride, undefined, 'Porte E ne doit JAMAIS forger de fidelityOverride');
  assert.equal(okItem.catalog, true, 'Rendu IA fidèle préservé dans le catalogue');
  assert.equal(okItem.book, true, 'Rendu IA fidèle préservé dans le cahier');

  // 2) RBAC Portail privé : un client invité reçoit 403 sur /api/projects/projet-a/document-safety
  const portalSrv = await sb.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-doc-password', PORTAL_INSECURE_LOCAL: '1' });
  const loginRes = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-doc-password' })
  });
  const archCookie = loginRes.headers.get('set-cookie').split(';')[0];
  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'comment', validHours: 24, label: 'Client Test' })
  });
  const { token } = await invRes.json();
  const redeem = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token })
  });
  const clientCookie = redeem.headers.get('set-cookie').split(';')[0];

  const clientTry = await fetch(`${portalSrv.origin}/api/projects/projet-a/document-safety`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: clientCookie },
    body: JSON.stringify({ mode: 'resolve' })
  });
  assert.equal(clientTry.status, 403, 'Un invité portail ne doit pas pouvoir muter les documents');

  const archTry = await fetch(`${portalSrv.origin}/api/projects/projet-a/document-safety`, {
    method: 'GET',
    headers: { Origin: portalSrv.origin, Cookie: archCookie }
  });
  assert.equal(archTry.status, 200, 'L’architecte connecté peut auditer la sécurité documentaire');

  // 2b) Mises à jour explicites du cartouche (commande explicite set_cartouche)
  const explicitRes = await fetch(`${srv.origin}/api/projects/projet-a/document-safety`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'resolve',
      metaUpdates: { phase: 'APD', revision: 'B', issueDate: '2026-11-27', clientVisible: false }
    })
  });
  assert.equal(explicitRes.status, 200);
  const explicitData = await explicitRes.json();
  assert.equal(explicitData.meta.phase, 'APD');
  assert.equal(explicitData.meta.revision, 'B');
  assert.equal(explicitData.meta.issueDate, '2026-11-27');
  assert.equal(explicitData.meta.clientVisible, false);

  // 3) Vérification côté client js/aiAssistant.js : logo ArchiCam AI, actions 4 catégories en liste blanche + zéro innerHTML
  const aiJs = fs.readFileSync(path.join(ROOT, 'js', 'aiAssistant.js'), 'utf8');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'archicam-ai-logo.svg')), 'assets/archicam-ai-logo.svg doit exister');
  assert.ok(aiJs.includes('assets/archicam-ai-logo.svg'), 'js/aiAssistant.js doit afficher le logo ArchiCam AI');
  assert.ok(!aiJs.includes('innerHTML'), 'js/aiAssistant.js ne doit jamais utiliser innerHTML');
  assert.match(aiJs, /runAction:/, 'window.__archicamAssistant doit exposer runAction');
  assert.match(aiJs, /listActions:/, 'window.__archicamAssistant doit exposer listActions');
  for (const act of [
    'resolve_document_safety', 'set_cartouche', 'generate_aps', 'generate_apd', 'generate_catalog',
    'generate_tech_drawings', 'generate_estimate', 'export_ifc', 'export_gbxml', 'run_compliance',
    'run_bioclimatic', 'run_structural', 'compose_planbook', 'print_planbook', 'export_json',
    'open_project_info', 'open_deliverables', 'open_revisions', 'save_revision', 'compare_versions',
    'open_variants', 'generate_variants', 'open_annotations', 'open_cabinet', 'set_ambiance',
    'set_finish', 'set_solar_hour', 'toggle_solar_play', 'toggle_night', 'toggle_section_3d',
    'toggle_explode_3d', 'toggle_timelapse_4d', 'toggle_clearances', 'toggle_plan_compare',
    'toggle_present_mode', 'open_gallery', 'open_sublimate', 'export_video', 'export_ai_sequence',
    'set_floor', 'select_tool', 'editor_undo', 'editor_redo', 'load_template',
    'open_ai_read', 'open_vector_pdf', 'open_plan_cleanup'
  ]) {
    assert.ok(aiJs.includes(`${act}:`), `AGENT_ACTIONS doit contenir ${act}`);
  }
});

// ============================================================================
// 15. CONCEPTION GÉNÉRATIVE SANS PLAN, PATCH NATUREL, AUTO-FIX PMR/RE2020,
//     LIVE SYNC, INJECTION ÉDITORIALE & VARIANTES A/B CHIFFRÉES + RBAC PORTAIL
// ============================================================================
test('Conception générative IA : Brief -> Plan 2D/3D, Patch naturel, Auto-fix PMR/RE2020, Éditorial, Variantes A/B et verrou RBAC Portail', async (t) => {
  const box = makeSandbox(t);
  const srv = await box.start();

  // 1) Brief texte -> Plan 2D + 3D complet + sauvegarde en nouveau dossier
  const genRes = await fetch(`${srv.origin}/api/ai/generate-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brief: 'Villa plain-pied 140 m² à Douala, 3 chambres, séjour-cuisine, bureau et véranda',
      saveAsNew: true
    })
  });
  assert.equal(genRes.status, 200);
  const genData = await genRes.json();
  assert.equal(genData.ok, true);
  assert.ok(genData.savedSlug, 'Doit sauvegarder le nouveau projet quand saveAsNew=true');
  assert.ok(Array.isArray(genData.project.walls) && genData.project.walls.length >= 6);
  assert.ok(Array.isArray(genData.project.rooms) && genData.project.rooms.length >= 5);
  const genDoors = genData.project.walls.flatMap(w => (w.openings || []).filter(o => o.type === 'door'));
  const genWins = genData.project.walls.flatMap(w => (w.openings || []).filter(o => o.type === 'window' || o.type === 'bay'));
  assert.ok(genDoors.length >= 3 && genDoors.every(d => d.w >= 0.9), 'Toutes les portes générées doivent être PMR >= 0.90 m');
  assert.ok(genWins.length >= 3, 'Le plan généré doit comporter des fenêtres extérieures');
  assert.ok(fs.existsSync(path.join(box.root, 'projects', genData.savedSlug, 'project.json')));

  // 2) Modification du plan en langage naturel
  const patchRes = await fetch(`${srv.origin}/api/ai/plan-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: genData.project,
      instruction: 'Passe la hauteur sous plafond à 3,10 m, ajoute une pergola de 4 x 3 m, agrandis les fenêtres de 25 % et renomme le séjour en Grand Salon'
    })
  });
  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.ok, true);
  assert.equal(patchData.noOp, false);
  assert.equal(patchData.patchedProject.config.wallHeight, 3.1);
  assert.ok((patchData.patchedProject.canopies || []).length >= 1, 'La pergola doit être ajoutée');
  assert.ok(patchData.patchedProject.rooms.some(r => r.name === 'Grand Salon'), 'La pièce séjour doit être renommée en Grand Salon');

  // 3) Auto-fix PMR & RE2020 sur un dossier volontairement non conforme
  const projAFile = path.join(box.root, 'projects', 'projet-a', 'project.json');
  const badProj = JSON.parse(fs.readFileSync(projAFile, 'utf8'));
  badProj.config = { ...(badProj.config || {}), wallHeight: 2.05 };
  badProj.meta = { ...(badProj.meta || {}), client: 'Famille Kamga', phase: 'APD', revision: 'B', issueDate: '2026-11-27' };
  badProj.walls[0].openings = [{ type: 'door', at: 2.0, w: 0.72, h: 2.04, level: 0 }];
  badProj.walls[1].openings = [{ type: 'window', at: 2.0, w: 0.6, h: 0.8, sill: 1.0, level: 0 }];
  fs.writeFileSync(projAFile, JSON.stringify(badProj, null, 2));

  const fixRes = await fetch(`${srv.origin}/api/projects/projet-a/compliance-autofix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apply: true })
  });
  assert.equal(fixRes.status, 200);
  const fixData = await fixRes.json();
  assert.equal(fixData.ok, true);
  assert.equal(fixData.persisted, true);
  assert.ok(fixData.fixedCount >= 2, 'Doit corriger HSP, porte étroite et/ou ratio vitrage');
  assert.ok(fixData.after.wallHeight >= 2.5, 'HSP doit être relevée à >= 2.50 m');
  assert.equal(fixData.after.narrowDoors, 0, 'Aucune porte ne doit rester < 0.90 m');
  assert.ok(fixData.after.glazingRatioPct >= 16.7, 'Le ratio vitrage RE2020 doit atteindre >= 16.7 %');

  // 4) Rédaction & injection éditoriale (sans toucher aux champs légaux du cartouche)
  const edPrev = await fetch(`${srv.origin}/api/projects/projet-a/editorial-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview' })
  });
  assert.equal(edPrev.status, 200);
  const edPrevData = await edPrev.json();
  assert.equal(edPrevData.ok, true);
  assert.equal(edPrevData.applied, false);
  assert.ok(edPrevData.draft.subtitle && edPrevData.draft.parti && edPrevData.draft.description);

  const edApply = await fetch(`${srv.origin}/api/projects/projet-a/editorial-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'apply', draft: edPrevData.draft })
  });
  assert.equal(edApply.status, 200);
  const savedAfterEd = JSON.parse(fs.readFileSync(projAFile, 'utf8'));
  assert.equal(savedAfterEd.meta.subtitle, edPrevData.draft.subtitle);
  assert.equal(savedAfterEd.meta.parti, edPrevData.draft.parti);
  assert.equal(savedAfterEd.meta.description, edPrevData.draft.description);
  assert.equal(savedAfterEd.meta.client, 'Famille Kamga', 'Le maître d’ouvrage ne doit jamais être altéré');
  assert.equal(savedAfterEd.meta.phase, 'APD', 'La phase légale ne doit jamais être altérée');
  assert.equal(savedAfterEd.meta.revision, 'B', 'L’indice légal ne doit jamais être altéré');

  // 5) Création automatique des Variantes A / B chiffrées
  const varRes = await fetch(`${srv.origin}/api/projects/projet-a/generate-ab-variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(varRes.status, 200);
  const varData = await varRes.json();
  assert.equal(varData.ok, true);
  assert.equal(varData.variantA.slot, 'A');
  assert.equal(varData.variantB.slot, 'B');
  assert.ok(varData.variantB.metrics.budgetFCFA > varData.variantA.metrics.budgetFCFA);
  const listVarRes = await fetch(`${srv.origin}/api/projects/projet-a/variants`);
  const listVarData = await listVarRes.json();
  assert.ok(listVarData.variants && listVarData.variants.A && listVarData.variants.B, 'Les variantes A et B doivent être stockées dans variantsStore');

  // 6) RBAC Portail privé : un client invité reçoit 403 sur les 5 nouveaux endpoints
  const portalSrv = await box.start({ PRIVATE_PORTAL: '1', PORTAL_PASSWORD: 'secret-test-password', PORTAL_INSECURE_LOCAL: '1' });
  const loginRes = await fetch(`${portalSrv.origin}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ password: 'secret-test-password' })
  });
  const archCookie = loginRes.headers.get('set-cookie').split(';')[0];
  const invRes = await fetch(`${portalSrv.origin}/api/portal/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: archCookie },
    body: JSON.stringify({ project: 'projet-a', role: 'comment', validHours: 4, label: 'Client Test IA' })
  });
  const { token } = await invRes.json();
  const redeemRes = await fetch(`${portalSrv.origin}/api/portal/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin },
    body: JSON.stringify({ token })
  });
  const clientCookie = redeemRes.headers.get('set-cookie').split(';')[0];

  for (const [ep, payload] of [
    ['/api/ai/generate-plan', { brief: 'Villa 120 m2' }],
    ['/api/ai/plan-patch', { slug: 'projet-a', instruction: 'Hauteur 3m' }],
    ['/api/projects/projet-a/compliance-autofix', { apply: false }],
    ['/api/projects/projet-a/editorial-brief', { mode: 'preview' }],
    ['/api/projects/projet-a/generate-ab-variants', {}]
  ]) {
    const r = await fetch(`${portalSrv.origin}${ep}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: portalSrv.origin, Cookie: clientCookie },
      body: JSON.stringify(payload)
    });
    assert.equal(r.status, 403, `Un invité portail doit être bloqué (403) sur ${ep}`);
  }

  // 6b) Validation cartouche explicite (jalon étape 5 de la chaîne complète) : accepte client/localisation réels, rejette les placeholders
  const explicitCartoucheRes = await fetch(`${srv.origin}/api/projects/projet-a/document-safety`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'resolve',
      metaUpdates: { client: 'M. & Mme Ndongo', location: 'Douala — Bonapriso', phase: 'APS', revision: 'A', issueDate: '2026-11-27', clientVisible: true }
    })
  });
  assert.equal(explicitCartoucheRes.status, 200);
  const explicitCartouche = await explicitCartoucheRes.json();
  assert.equal(explicitCartouche.meta.client, 'M. & Mme Ndongo');
  assert.equal(explicitCartouche.meta.location, 'Douala — Bonapriso');
  assert.equal(explicitCartouche.meta.phase, 'APS');
  assert.equal(explicitCartouche.meta.revision, 'A');
  assert.equal(explicitCartouche.meta.clientVisible, true);

  // 7) Vérification Live Sync, Orchestrateur Chaîne complète & nouvelles actions côté client js/aiAssistant.js
  const aiJs = fs.readFileSync(path.join(ROOT, 'js', 'aiAssistant.js'), 'utf8');
  const premJs = fs.readFileSync(path.join(ROOT, 'js', 'editorPremium.js'), 'utf8');
  assert.ok(!aiJs.includes('innerHTML'), 'js/aiAssistant.js ne doit jamais utiliser innerHTML');
  assert.ok(aiJs.includes('ctx.liveProject'), 'js/aiAssistant.js doit envoyer liveProject pour le Live Sync');
  assert.ok(aiJs.includes('applyProjectToEditorWithUndo'), 'js/aiAssistant.js doit préserver Ctrl+Z lors du chargement de plan');
  assert.ok(aiJs.includes('openStudioPipelineCard'), 'js/aiAssistant.js doit exposer l’orchestrateur de chaîne complète');
  assert.ok(aiJs.includes('EditorPremiumAPI.generateAPS'), 'La chaîne complète doit piloter l’APS Auto PDF');
  assert.ok(aiJs.includes('XlsxExport.downloadXlsx'), 'La chaîne complète doit piloter le Devis & Métré FCFA (.xlsx)');
  assert.ok(aiJs.includes('PlanBook.exportBook'), 'La chaîne complète doit piloter le Cahier de plans A3 PDF');
  assert.ok(aiJs.includes('EditorPremiumAPI.exportCatalog'), 'La chaîne complète doit piloter le Catalogue Premium PDF');
  assert.ok(premJs.includes('window.EditorPremiumAPI'), 'js/editorPremium.js doit exposer window.EditorPremiumAPI');
  for (const act of [
    'run_studio_pipeline', 'generate_plan_brief', 'confirm_load_generated_plan', 'apply_plan_patch', 'confirm_apply_plan_patch',
    'autofix_compliance', 'confirm_apply_compliance_fix', 'inject_editorial_brief',
    'confirm_inject_editorial_brief', 'create_ab_variants'
  ]) {
    assert.ok(aiJs.includes(`${act}:`), `AGENT_ACTIONS doit contenir ${act}`);
  }
});






