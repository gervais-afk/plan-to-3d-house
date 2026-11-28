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

  // Les 5 livrables demandés doivent être pilotés par la chaîne
  assert.ok(aiJs.includes("label: 'APS Auto PDF'"), 'L’APS Auto PDF doit être proposé');
  assert.ok(aiJs.includes("label: 'Devis & Métré (PDF + .xlsx)'"), 'Le Devis FCFA (PDF cartouché + classeur) doit être proposé');
  assert.ok(aiJs.includes("label: 'Cahier A3 PDF'"), 'Le Cahier de plans A3 doit être proposé');
  assert.ok(aiJs.includes("label: 'Catalogue PDF'"), 'Le Catalogue Premium doit être proposé');
  assert.ok(aiJs.includes("label: 'Dossier APD / Permis PDF'"), 'Le Dossier APD / Permis doit être proposé');
  assert.ok(aiJs.includes('exportDevisPdf'), 'La chaîne doit déclencher le devis estimatif PDF');
  assert.ok(aiJs.includes('exportApdDossier'), 'La chaîne doit déclencher le dossier APD / Permis');
  assert.ok(/apd: opts\.outputs\?\.apd === true/.test(aiJs), 'Le dossier APD doit être décoché par défaut (pièces PC à réunir)');

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

  // Le partage du budget est un booléen strict : jamais déduit d'un montant ou d'un rôle.
  const badShare = await post(srv.origin, '/api/save-project', {
    slug: 'partage-invalide',
    project: { ...PIPELINE_PROJECT, meta: { ...PIPELINE_PROJECT.meta, budgetShared: 'oui' } }
  });
  assert.equal(badShare.status, 422);
  assert.match(badShare.data.error, /partage du budget/i);

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
  assert.equal(safety.data.meta.budgetShared, false, 'L’enveloppe budgétaire n’est pas partagée par défaut');

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
      clientVisible: false,
      budgetShared: true
    }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.data.meta.client, 'M. & Mme Ndongo');
  assert.equal(resolved.data.meta.location, 'Douala — Bonapriso');
  assert.equal(resolved.data.meta.phase, 'APS');
  assert.equal(resolved.data.meta.revision, 'A');
  assert.equal(resolved.data.meta.issueDate, '2026-11-27');
  assert.equal(resolved.data.meta.budgetShared, true, 'Le partage du budget validé dans le chat doit être enregistré');
  assert.ok((resolved.data.resolved || []).some(m => /Partage de l’enveloppe budgétaire activé/i.test(m)), 'La décision de partage doit être tracée dans l’audit');
  assert.ok(!resolved.data.missingCartouche.includes("Maître d'ouvrage"), 'Le maître d’ouvrage ne doit plus manquer après validation');
  assert.ok(!resolved.data.missingCartouche.includes('Phase'), 'La phase ne doit plus manquer après validation');

  // Étape 6 : les générateurs sont autorisés (APS, Devis, Cahier, Catalogue) une fois le cartouche tenu
  assert.ok(Array.isArray(resolved.data.readyGenerators), 'Les générateurs disponibles doivent être listés');
  assert.ok(resolved.data.readyGenerators.some(g => String(g.id || g).includes('aps')), 'L’APS doit être prêt après validation');
});

// ============================================================================
// 4. DEVIS ESTIMATIF PDF (BQE CART OUCHÉ) — MODÈLE ET MISE EN PAGE
// ============================================================================
test('Devis PDF : cartouche légal sans invention, lots, postes et fourchette FCFA', () => {
  const DevisPdf = require('../js/devisPdf.js');
  const CostEstimate = require('../js/costEstimate.js');

  const estimate = CostEstimate.estimate(PIPELINE_PROJECT, PIPELINE_PROJECT.estimate);
  const bare = DevisPdf.buildModel(PIPELINE_PROJECT, estimate, {});

  // Aucune mention légale inventée : le cartouche vide est signalé, pas rempli.
  assert.deepEqual(bare.cartouche.filter(item => item.value), [], 'Aucune mention légale ne doit être inventée');
  assert.ok(bare.missing.includes("Maître d'ouvrage") && bare.missing.includes('Localisation'), 'Les mentions absentes doivent être listées');
  assert.equal(bare.name, PIPELINE_PROJECT.meta.name);
  assert.equal(bare.lots.length, estimate.lots.length, 'Chaque lot de CostEstimate doit apparaître');
  assert.equal(bare.materials.length, estimate.materials.length, 'Chaque poste chiffré doit apparaître');
  assert.equal(Math.round(bare.totals.low), Math.round(estimate.total.low));
  assert.equal(Math.round(bare.totals.high), Math.round(estimate.total.high));
  assert.ok(bare.totals.high > bare.totals.low, 'La fourchette doit rester une fourchette');
  assert.ok(bare.conditions.some(c => /devis contractuel/i.test(c)), 'Les réserves doivent nier tout engagement contractuel');

  const filled = DevisPdf.buildModel(
    { ...PIPELINE_PROJECT, meta: { ...PIPELINE_PROJECT.meta, client: 'M. & Mme Ndongo', location: 'Douala — Bonapriso', phase: 'APS', revision: 'A', issueDate: '2026-11-27' } },
    estimate,
    { cabinet: { name: 'Atelier Ndongo', agency: 'Atelier Ndongo & Associés', defaultArchitect: 'J. Ndongo' } }
  );
  const get = label => filled.cartouche.find(item => item.label === label)?.value;
  assert.equal(get("Maître d'ouvrage"), 'M. & Mme Ndongo');
  assert.equal(get('Localisation'), 'Douala — Bonapriso');
  assert.equal(get('Phase'), 'APS');
  assert.equal(get("Date d'émission"), '27/11/2026', 'La date doit être rendue au format français');
  assert.deepEqual(filled.missing, [], 'Aucune mention ne doit manquer une fois le cartouche validé');
});

test('Devis PDF : document A4 multi-pages, texte réel (titre, lots, montants, réserves, signatures)', async () => {
  const { jsPDF } = require('../assets/vendor/jspdf-4.2.1.umd.min.js');
  const DevisPdf = require('../js/devisPdf.js');

  const written = [];
  class SpyPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      const original = this.text.bind(this);
      this.text = (value, ...rest) => {
        written.push(...(Array.isArray(value) ? value : [value]));
        return original(value, ...rest);
      };
    }
  }

  const project = {
    ...PIPELINE_PROJECT,
    meta: { ...PIPELINE_PROJECT.meta, client: 'M. & Mme Ndongo', location: 'Douala — Bonapriso', phase: 'APS', revision: 'A', issueDate: '2026-11-27' }
  };
  const out = await DevisPdf.exportPDF(project, null, {
    JsPDF: SpyPDF,
    save: false,
    cabinet: { name: 'Atelier Ndongo', agency: 'Atelier Ndongo & Associés', defaultArchitect: 'J. Ndongo' }
  });

  assert.ok(out.pages >= 2, 'Le devis doit être un document relié de plusieurs pages A4');
  assert.equal(out.filename, 'chaine-complete-devis-estimatif.pdf', 'Le fichier doit être nommé d’après le dossier');
  assert.ok(out.doc.output('arraybuffer').byteLength > 3000, 'Le PDF doit contenir un vrai rendu');

  const all = written.join('\n');
  assert.match(all, /DEVIS ESTIMATIF/);
  assert.match(all, /Bordereau quantitatif estimatif/);
  assert.match(all, new RegExp(PIPELINE_PROJECT.meta.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(all, /M\. & Mme Ndongo/);
  assert.match(all, /Douala/);
  assert.match(all, /FCFA/);
  assert.match(all, /BON POUR ACCORD/);
  assert.match(all, /devis contractuel/i, 'La réserve « non contractuel » doit être imprimée');
  const norm = value => String(value).replace(/[\s\u00A0\u202F]/g, '');
  const printed = written.map(norm);
  for (const lot of out.model.lots) {
    assert.ok(printed.some(line => line.includes(norm(DevisPdf.money(lot.high)))), `Le montant haut du lot ${lot.label} doit être imprimé`);
  }
  assert.ok(written.some(line => /Page 1 \/ \d+/.test(String(line))), 'La pagination doit être imprimée');
});

// ============================================================================
// 5. DEVIS PDF DISPONIBLE DANS LES QUATRE SURFACES (ÉDITEUR, COCKPIT 3D,
//    LIVRET DE RÉUNION, PORTAIL CLIENT)
// ============================================================================
test('Devis PDF : exposé dans l’éditeur, le cockpit 3D, le livret de réunion et le portail client', () => {
  const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // Éditeur : bouton dans la fenêtre Estimation + API de la chaîne complète
  const editor = read('editor.html');
  assert.ok(editor.includes('id="est-devis-pdf"'), 'l’éditeur propose « Devis estimatif PDF » dans Estimation FCFA');
  assert.ok(editor.includes('js/devisPdf.js'), 'l’éditeur charge le module du devis');
  assert.ok(read('js/editorEstimate.js').includes('window.DevisPdf'), 'le bouton de l’éditeur appelle DevisPdf');
  assert.ok(read('js/editorPremium.js').includes('exportDevisPdf'), 'la chaîne complète expose exportDevisPdf');

  // Cockpit 3D (visite) : à côté du BQE Excel
  const cockpit = read('index.html');
  assert.ok(cockpit.includes('id="atlas-bqe-pdf"'), 'le cockpit 3D propose le devis PDF à côté du BQE Excel');
  const app = read('js/app.js');
  assert.ok(app.includes("getElementById('atlas-bqe-pdf')"), 'js/app.js branche le bouton du cockpit');
  assert.ok(app.includes('lib.exportPDF('), 'le cockpit génère le PDF avec la même estimation que le BQE');

  // Livret de réunion : chapitre Estimation + Validation
  const meeting = read('js/meetingMode.js');
  assert.ok(meeting.includes('id="meeting-export-devis"'), 'le livret propose le devis dans le chapitre Estimation');
  assert.ok(meeting.includes('id="meeting-export-devis-livrables"'), 'le livret propose le devis dans le chapitre Validation');
  assert.ok(meeting.includes('lib.exportPDF(ctx.project, estimate'), 'le livret produit le PDF depuis le projet présenté');

  // Couverture / portail client : export depuis la fiche projet
  assert.ok(read('accueil.html').includes('id="sheet-export-devis"'), 'la fiche projet propose le devis PDF');
  assert.ok(read('js/home.js').includes("el('sheet-export-devis')"), 'js/home.js branche l’export de la fiche projet');

  // Chargement et autorisation côté portail privé
  assert.match(read('js/workspace.js'), /'costEstimate', 'xlsxExport', 'devisPdf'/, 'le shell charge le devis sur toutes les vues');
  assert.match(read('privatePortal.js'), /'js\/devisPdf\.js'/, 'le portail autorise le module du devis pour les invités');
});

// ============================================================================
// 6. LE DEVIS FCFA ALIMENTE LA CHAÎNE (CALCUL LOCAL + EXPORT .XLSX)
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

// ============================================================================
// 8. PARTAGE DU BUDGET : VERROU SERVEUR ET MASQUAGE DES SURFACES CLIENT
// ============================================================================
test('Partage du budget : booléen explicite, rédaction serveur et masquage des surfaces invité', () => {
  const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const serve = read('serve.js');

  // (1) Seul le serveur décide : sans partage explicite, l'enveloppe ne quitte jamais le dossier.
  assert.match(serve, /budgetShared !== true\) delete project\.estimate/,
    'Le routage statique doit supprimer project.estimate tant que le partage n’est pas activé');
  assert.match(serve, /budgetShared !== undefined && typeof project\.meta\.budgetShared !== 'boolean'/,
    'projectProblem doit refuser un partage non booléen');
  assert.match(serve, /Partage du budget désactivé \(aucune pièce à chiffrer/,
    'Un partage sans pièce à chiffrer doit être annulé et tracé');

  // (2) L'architecte pilote le drapeau depuis l'éditeur et le mini-formulaire du chat.
  const editor = read('js/editor.js');
  assert.match(editor, /key: 'budgetShared'[^\n]*Partager l’enveloppe budgétaire avec le client invité/,
    'L’éditeur doit proposer la case « Partager l’enveloppe budgétaire »');
  assert.match(editor, /if \(typeof p\.meta\.budgetShared !== 'boolean'\) p\.meta\.budgetShared = false;/,
    'Le partage doit être normalisé à false au chargement du dossier');
  const assistant = read('js/aiAssistant.js');
  assert.match(assistant, /k === 'budgetShared'/, 'L’assistant doit savoir écrire le drapeau');
  assert.match(assistant, /Partager l’enveloppe budgétaire \(devis PDF\) avec le client invité/,
    'Le jalon cartouche du chat doit exposer la case de partage');

  // (3) Côté invité, les surfaces qui recalculent des montants sont retirées, pas seulement leurs boutons.
  const app = read('js/app.js');
  assert.match(app, /L’enveloppe budgétaire n’est pas partagée sur ce dossier\./);
  assert.match(app, /for\(const id of \['atlas-bqe','atlas-bqe-xlsx','atlas-bqe-pdf'\]\)/,
    'Les trois exports du panneau Estimation doivent disparaître ensemble');
  const home = read('js/home.js');
  assert.match(home, /devisBtn\.hidden = invited && meta\.budgetShared !== true;/,
    'La fiche projet doit masquer l’export devis pour un invité sans partage');
  const meeting = read('js/meetingMode.js');
  assert.match(meeting, /const budgetVisible = !invited \|\| meta\.budgetShared === true;/);
  assert.match(meeting, /const est = budgetVisible && typeof CostEstimate !== 'undefined'/,
    'Sans partage, le livret de réunion ne doit pas même calculer l’enveloppe');
  assert.match(meeting, /\$\{budgetVisible \? '<button[^']*meeting-export-devis-livrables/,
    'Le second CTA devis du chapitre validation doit suivre le même verrou');

  // (4) L'assistant ne divulgue pas l'enveloppe à un invité : consigne explicite côté serveur.
  assert.match(serve, /Le budget n’est communiqué que si le partage est activé sur le dossier/);
});
