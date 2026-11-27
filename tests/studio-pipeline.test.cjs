const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const PIPELINE_PROJECT = {
  meta: {
    slug: 'chaine-complete',
    name: 'Villa Chaîne Complète',
    subtitle: 'Maison R+1 à véranda',
    description: 'Maquette de travail pour la chaîne complète ArchiCam AI.'
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
    // Porte intérieure trop étroite : l'auto-fix PMR doit la porter à 0,90 m.
    { id: 'w-mid', from: [6, 0], to: [6, 8], thick: 0.15, type: 'int', level: 0, openings: [{ type: 'door', at: 4, w: 0.78, h: 2.1 }] }
  ],
  rooms: [
    { id: 'sejour', name: 'Séjour', level: 0, habitable: true, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 8 } },
    { id: 'chambre1', name: 'Chambre 1', level: 0, habitable: true, bounds: { xMin: 6, xMax: 12, zMin: 0, zMax: 5 } },
    { id: 'terrasse', name: 'Terrasse', level: 0, habitable: false, bounds: { xMin: 6, xMax: 12, zMin: 5, zMax: 8 } }
  ],
  canopies: [
    { xMin: 4, xMax: 8, zMin: 8, zMax: 9.5, level: 0, type: 'slab' }
  ]
};

async function freePort() {
  const sock = net.createServer();
  await new Promise(resolve => sock.listen(0, '127.0.0.1', resolve));
  const p = sock.address().port;
  await new Promise(resolve => sock.close(resolve));
  return p;
}

function makeSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-pipeline-'));
  const servers = [];
  t.after(async () => {
    for (const s of servers.reverse()) await s.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  for (const f of ['serve.js', 'geminiClient.js', 'aiDesignEngine.js', 'privatePortal.js', 'feedbackStore.js',
    'decisionStore.js', 'presentationStore.js', 'cabinetStore.js', 'variantsStore.js', 'revisionsStore.js', 'planchesStore.js']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(root, f));
  }
  fs.mkdirSync(path.join(root, 'js'));
  for (const f of ['data.js', 'workspace.js', 'variantState.js', 'coverImage.js', 'xlsxExport.js', 'costEstimate.js', 'habitability.js',
    'technicalDrawings.js', 'variantComparator.js', 'apdDossier.js', 'meetingMode.js', 'bioclimaticAudit.js',
    'deliverableGate.js', 'pdfIdentity.js', 'deliverableChecklist.js', 'codeCompliance.js', 'planBook.js']) {
    fs.copyFileSync(path.join(ROOT, 'js', f), path.join(root, 'js', f));
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

async function post(origin, route, payload = {}) {
  const res = await fetch(`${origin}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ============================================================================
// 1. CARTE DE CHAÎNE COMPLÈTE DANS L'ASSISTANT (IHM, ÉTAPES, LIVRABLES)
// ============================================================================
test('Chaîne complète : carte 6 étapes, 4 livrables cochables (APS, Devis, Cahier A3, Catalogue) et annulation Ctrl+Z', () => {
  const aiJs = fs.readFileSync(path.join(ROOT, 'js', 'aiAssistant.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'aiAssistant.css'), 'utf8');
  const premJs = fs.readFileSync(path.join(ROOT, 'js', 'editorPremium.js'), 'utf8');

  // Carte et étapes de l'orchestrateur
  assert.ok(aiJs.includes('openStudioPipelineCard'), 'L’orchestrateur openStudioPipelineCard doit exister');
  assert.ok(aiJs.includes('run_studio_pipeline'), 'L’action run_studio_pipeline doit être déclarée');
  assert.ok(aiJs.includes('archicam_ai_pending_pipeline_v1'), 'La reprise inter-vues doit passer par sessionStorage');
  for (const step of ['design', 'furnish', 'polish', 'save', 'safety', 'deliverables']) {
    assert.ok(aiJs.includes(`id: '${step}'`), `L’étape ${step} doit être déclarée dans la carte`);
  }

  // Les 4 livrables demandés doivent être pilotés par la chaîne
  assert.ok(aiJs.includes("label: 'APS Auto PDF'"), 'L’APS Auto PDF doit être proposé');
  assert.ok(aiJs.includes("label: 'Devis & Métré (.xlsx)'"), 'Le Devis & Métré FCFA (.xlsx) doit être proposé');
  assert.ok(aiJs.includes("label: 'Cahier A3 PDF'"), 'Le Cahier de plans A3 doit être proposé');
  assert.ok(aiJs.includes("label: 'Catalogue PDF'"), 'Le Catalogue Premium doit être proposé');

  // Annulation en un clic (restauration du plan précédent) et arrêt de la chaîne
  assert.ok(aiJs.includes('undoSnapshotBeforeRun'), 'La chaîne doit mémoriser l’état avant exécution');
  assert.ok(aiJs.includes('Ctrl+Z'), 'L’annulation doit être annoncée en Ctrl+Z');
  assert.ok(aiJs.includes('Stopper'), 'La chaîne doit pouvoir être stoppée');

  // Jalon cartouche : formulaire compact dans le chat + résolution serveur
  assert.ok(aiJs.includes('renderCartoucheValidationGate'), 'Le jalon de validation du cartouche doit exister');
  assert.ok(aiJs.includes('missingCartouche'), 'Le jalon doit lire missingCartouche renvoyé par document-safety');
  assert.ok(aiJs.includes('metaUpdates'), 'Le jalon doit transmettre les mentions validées par l’architecte');

  // Styles dédiés
  for (const cls of ['.ai-pipeline-card', '.ai-pipeline-steps', '.ai-pipeline-step.is-running', '.ai-pipeline-gate', '.ai-pipeline-btn--primary']) {
    assert.ok(css.includes(cls), `css/aiAssistant.css doit définir ${cls}`);
  }
  assert.ok(css.includes('.ai-chat-pipeline-cta'), 'L’accès direct à la chaîne depuis l’accueil doit être stylé');

  // API éditeur réellement exposée
  assert.ok(premJs.includes('window.EditorPremiumAPI'), 'js/editorPremium.js doit exposer window.EditorPremiumAPI');
  assert.ok(premJs.includes('generateAPS: handleGenerateAPS'), 'L’APS doit être exposé par l’API éditeur');
  assert.ok(premJs.includes('exportCatalog: exportPremiumPDF'), 'Le catalogue doit être exposé par l’API éditeur');
  assert.ok(/return true;/.test(premJs), 'Les exports doivent signaler leur succès à la chaîne');
});

// ============================================================================
// 2. RÉSOLUTION DES MODULES GLOBAUX (const lexicaux ≠ propriétés de window)
// ============================================================================
test('Chaîne complète : Devis et Cahier A3 résolvent les modules en `const` global sans dépendre de window.X', () => {
  const aiJs = fs.readFileSync(path.join(ROOT, 'js', 'aiAssistant.js'), 'utf8');

  assert.ok(aiJs.includes('function resolveGlobalLib'), 'Le résolveur de modules globaux doit exister');
  for (const name of ['CostEstimate', 'XlsxExport', 'PlanBook']) {
    assert.ok(aiJs.includes(`resolveGlobalLib('${name}')`), `${name} doit être résolu via resolveGlobalLib`);
    assert.ok(!aiJs.includes(`window.${name}`), `${name} ne doit pas être lu via window.${name} (liaison lexicale)`);
  }

  // Les modules déclarent bien leur export en `const` global (ce qui justifie le résolveur).
  for (const file of ['costEstimate.js', 'xlsxExport.js', 'planBook.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    assert.ok(/const (CostEstimate|XlsxExport|PlanBook) = /.test(src), `${file} doit déclarer son API en const global`);
    assert.ok(!/window\.(CostEstimate|XlsxExport|PlanBook)\s*=/.test(src), `${file} n’expose pas son API sur window`);
  }

  // Le devis est bien calculé sur l'instantané du plan, avec le slug du dossier.
  assert.ok(aiJs.includes('CostEstimateLib.estimate(snap, snap.estimate)'), 'Le devis doit être calculé depuis le plan actif');
  assert.ok(aiJs.includes('XlsxExportLib.downloadXlsx(snap, est, { slug: pipelineSlug })'), 'Le classeur doit être nommé avec le slug du dossier');
  assert.ok(aiJs.includes('includeEstimate: true'), 'Le Cahier A3 doit inclure la page estimation');
});

// ============================================================================
// 3. MOITIÉ SERVEUR DE LA CHAÎNE : ENREGISTREMENT → AUTO-FIX → NOTICE →
//    RÉVISION → SÉCURITÉ/CARTOUCHE
// ============================================================================
test('Chaîne complète (serveur) : save-project → compliance-autofix → editorial-brief → révision → document-safety → cartouche validé', async t => {
  const sandbox = makeSandbox(t);
  const srv = await sandbox.start();

  // Étape 3-4 : enregistrement du dossier produit par l'éditeur
  const saved = await post(srv.origin, '/api/save-project', { slug: 'chaine-complete', project: PIPELINE_PROJECT });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.ok, true);
  assert.ok(fs.existsSync(path.join(sandbox.root, 'projects', 'chaine-complete', 'project.json')), 'Le dossier doit être écrit sur disque');

  // Étape 3 : auto-fix PMR/RE2020 (porte 0,78 m → 0,90 m) sans écraser le plan tant que l'architecte n'a pas appliqué
  const fix = await post(srv.origin, '/api/projects/chaine-complete/compliance-autofix', { project: PIPELINE_PROJECT, apply: false });
  assert.equal(fix.status, 200);
  assert.ok(fix.data.patchedProject, 'L’auto-fix doit renvoyer un plan corrigé');
  assert.ok(fix.data.fixedCount >= 1, 'La porte de 0,78 m doit être corrigée');
  const patchedDoor = (fix.data.patchedProject.walls || []).flatMap(w => w.openings || []).find(o => o.type === 'door' && o.w < 0.9);
  assert.equal(patchedDoor, undefined, 'Plus aucune porte ne doit rester sous 0,90 m après correction');

  // Étape 3 : notice éditoriale (sous-titre, parti, description) en prévisualisation
  const brief = await post(srv.origin, '/api/projects/chaine-complete/editorial-brief', { mode: 'preview', project: PIPELINE_PROJECT });
  assert.equal(brief.status, 200);
  assert.equal(brief.data.ok, true);
  assert.ok(brief.data.draft?.subtitle, 'Le sous-titre doit être rédigé');
  assert.ok(brief.data.draft?.parti, 'Le parti architectural doit être rédigé');
  assert.ok(brief.data.draft?.description, 'La description doit être rédigée');

  // Étape 4 : révision datée du dossier
  const rev = await post(srv.origin, '/api/projects/chaine-complete/revisions', {
    label: 'Chaîne complète ArchiCam AI',
    note: 'Conception 2D/3D, meublage et mise en conformité avant livrables',
    snapshot: PIPELINE_PROJECT
  });
  assert.equal(rev.status, 201);
  assert.equal(rev.data.item.tag, 'V1');
  assert.equal(rev.data.item.label, 'Chaîne complète ArchiCam AI');

  // Étape 5 : passe sécurité Porte E + contrôle du cartouche
  const safety = await post(srv.origin, '/api/projects/chaine-complete/document-safety', {
    mode: 'resolve', applyCartouche: true, enforceDeliverableGate: true
  });
  assert.equal(safety.status, 200);
  assert.equal(safety.data.ok, true);
  assert.ok(Array.isArray(safety.data.missingCartouche), 'missingCartouche doit être exposé pour le jalon du chat');
  assert.ok(safety.data.missingCartouche.includes("Maître d'ouvrage"), 'Le maître d’ouvrage doit être listé comme manquant');
  assert.ok(safety.data.missingCartouche.includes('Date d’émission') || safety.data.missingCartouche.includes("Date d'émission"), 'La date d’émission doit être listée');
  assert.ok(safety.data.porteE && typeof safety.data.porteE.totalAi === 'number', 'L’état de la Porte E doit être renvoyé');
  assert.ok(safety.data.checklist && typeof safety.data.checklist.ready === 'boolean', 'La checklist de livraison doit être renvoyée');
  assert.equal(safety.data.meta.client, '', 'Aucune mention légale ne doit être inventée par le serveur');

  // Étape 5bis : l'architecte valide les mentions dans le mini-formulaire du chat
  const resolved = await post(srv.origin, '/api/projects/chaine-complete/document-safety', {
    mode: 'resolve',
    applyCartouche: true,
    enforceDeliverableGate: true,
    metaUpdates: {
      client: 'M. & Mme Ndongo',
      location: 'Douala — Bonapriso',
      architect: 'Atelier Ndongo & Associés',
      phase: 'APS',
      revision: 'A',
      issueDate: '2026-11-27',
      clientVisible: false
    }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.data.meta.client, 'M. & Mme Ndongo');
  assert.equal(resolved.data.meta.location, 'Douala — Bonapriso');
  assert.equal(resolved.data.meta.phase, 'APS');
  assert.equal(resolved.data.meta.revision, 'A');
  assert.equal(resolved.data.meta.issueDate, '2026-11-27');
  assert.ok(!resolved.data.missingCartouche.includes("Maître d'ouvrage"), 'Le maître d’ouvrage ne doit plus manquer après validation');
  assert.ok(!resolved.data.missingCartouche.includes('Phase'), 'La phase ne doit plus manquer après validation');

  // Étape 6 : les générateurs sont autorisés (APS, Devis, Cahier, Catalogue) une fois le cartouche tenu
  assert.ok(Array.isArray(resolved.data.readyGenerators), 'Les générateurs disponibles doivent être listés');
  assert.ok(resolved.data.readyGenerators.some(g => String(g.id || g).includes('aps')), 'L’APS doit être prêt après validation');
});

// ============================================================================
// 4. LE DEVIS FCFA ALIMENTE LA CHAÎNE (CALCUL LOCAL + EXPORT .XLSX)
// ============================================================================
test('Devis FCFA de la chaîne : enveloppe chiffrée calculée et classeur .xlsx signé du slug', () => {
  const CostEstimate = require('../js/costEstimate.js');
  const XlsxExport = require('../js/xlsxExport.js');

  const est = CostEstimate.estimate(PIPELINE_PROJECT, PIPELINE_PROJECT.estimate);
  assert.ok(est.total.low > 0 && est.total.high > est.total.low, 'L’enveloppe travaux doit être une fourchette chiffrée');
  const low = Math.round(est.total.low).toLocaleString('fr-FR');

  const { bytes, summary } = XlsxExport.exportXlsx(PIPELINE_PROJECT, est, { slug: 'chaine-complete' });
  assert.ok(bytes instanceof Uint8Array && bytes.length > 2000, 'Le classeur doit être un vrai fichier .xlsx');
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), 'PK', 'Le classeur doit être une archive PKZIP');
  assert.ok(summary?.lotCount > 0, 'Le récapitulatif doit dénombrer les lots chiffrés');
  assert.ok(summary?.roomCount > 0, 'Le métré doit dénombrer les pièces du plan');
  assert.ok(low.length > 0);
});
