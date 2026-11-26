const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function copyServerWorkspace(tmpDir) {
  for (const file of ['serve.js', 'privatePortal.js', 'feedbackStore.js', 'decisionStore.js', 'presentationStore.js', 'cabinetStore.js']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(tmpDir, file));
  }
  fs.mkdirSync(path.join(tmpDir, 'js'), { recursive: true });
  for (const jsFile of ['variantState.js', 'deliverableGate.js']) {
    fs.copyFileSync(path.join(ROOT, 'js', jsFile), path.join(tmpDir, 'js', jsFile));
  }
  fs.mkdirSync(path.join(tmpDir, 'projects'), { recursive: true });
}

function startServer(cwd) {
  return new Promise((resolve, reject) => {
    const port = 18000 + Math.floor(Math.random() * 10000);
    const proc = spawn(process.execPath, ['serve.js'], {
      cwd,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PRIVATE_PORTAL: '', PORTAL_PASSWORD: '', PORTAL_DEFAULT_PROJECT: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`Timeout démarrage serve.js: ${stderr}`)); }, 6000);
    proc.stdout.on('data', chunk => {
      if (String(chunk).includes(`:${port}`)) {
        clearTimeout(timer);
        resolve({ base: `http://127.0.0.1:${port}`, stop: () => proc.kill() });
      }
    });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`serve.js terminé prématurément (${code}): ${stderr}`));
    });
  });
}

function minimalProject(slug, name, planImageUrl) {
  return {
    meta: { name, slug, subtitle: `Sous-titre de ${name}` },
    config: { wallHeight: 2.8, floorHeight: 3, ...(planImageUrl ? { planImage: { url: planImageUrl, calibrated: false } } : {}) },
    walls: [{ from: [0, 0], to: [5, 0], thick: 0.2, type: 'ext', level: 0, openings: [] }],
    rooms: [{ id: 'sejour', name: 'SÉJOUR', level: 0, bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 4 }, floorType: 'parquet', habitable: true }]
  };
}

test('serve.js : aucun projet → liste vide et erreur claire sur route sans ?project=', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-lot2-empty-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  copyServerWorkspace(tmp);
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const listRes = await fetch(`${srv.base}/api/projects`);
  assert.equal(listRes.status, 200);
  assert.deepEqual(await listRes.json(), []);

  const mediaRes = await fetch(`${srv.base}/api/gallery/media`);
  assert.equal(mediaRes.status, 400);
  const errBody = await mediaRes.json();
  assert.match(errBody.error, /Aucun projet disponible/i);
});

test('serve.js : repli sur premier projet générique + projectCover (plan.png et config.planImage.url)', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-lot2-generic-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  copyServerWorkspace(tmp);

  const p1Dir = path.join(tmp, 'projects', 'villa-cedre');
  fs.mkdirSync(p1Dir, { recursive: true });
  fs.writeFileSync(path.join(p1Dir, 'project.json'), JSON.stringify(minimalProject('villa-cedre', 'Villa Cèdre')));
  fs.writeFileSync(path.join(p1Dir, 'plan.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const p2Dir = path.join(tmp, 'projects', 'maison-noyer');
  fs.mkdirSync(path.join(p2Dir, 'planches'), { recursive: true });
  fs.writeFileSync(path.join(p2Dir, 'planches', 'rdc.webp'), Buffer.from('RIFF....WEBP'));
  fs.writeFileSync(path.join(p2Dir, 'project.json'), JSON.stringify(minimalProject('maison-noyer', 'Maison Noyer', 'projects/maison-noyer/planches/rdc.webp')));

  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const list = await (await fetch(`${srv.base}/api/projects`)).json();
  assert.equal(list.length, 2);
  assert.equal(list.filter(p => p.default).length, 1, 'un seul projet par défaut');

  const cedre = list.find(p => p.slug === 'villa-cedre');
  const noyer = list.find(p => p.slug === 'maison-noyer');
  assert.equal(cedre.cover, 'projects/villa-cedre/plan.png', 'repli sur plan.png');
  assert.equal(noyer.cover, 'projects/maison-noyer/planches/rdc.webp', 'repli sur config.planImage.url');

  // Sans ?project=, l'API choisit le premier projet disponible sans jamais exiger residence-verandas.
  const mediaRes = await fetch(`${srv.base}/api/gallery/media`);
  assert.equal(mediaRes.status, 200);
});

test('projectLoader.js : sélectionne le premier projet disponible et signale clairement l’absence de projet', () => {
  const loaderCode = fs.readFileSync(path.join(ROOT, 'js', 'projectLoader.js'), 'utf8');
  const coreCode = fs.readFileSync(path.join(ROOT, 'js', 'houseDataCore.js'), 'utf8');

  function runLoader(responses) {
    const win = { location: { search: '', replace() {} } };
    class MockXHR {
      open(method, url) { this._url = url; }
      getResponseHeader() { return null; }
      send() {
        const key = this._url.split('?')[0];
        const hit = responses[key];
        this.status = hit ? hit.status : 404;
        this.responseText = hit ? JSON.stringify(hit.body) : '';
      }
    }
    const houseData = { meta: {}, config: { wallHeight: 2.8, floorHeight: 3 }, walls: [], rooms: [] };
    const sandbox = {
      window: win,
      location: win.location,
      HOUSE_DATA: houseData,
      XMLHttpRequest: MockXHR,
      URLSearchParams,
      localStorage: { setItem() {}, getItem() { return null; } },
      console: { warn() {}, log() {}, error() {} }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(coreCode, sandbox);
    vm.runInNewContext(loaderCode, sandbox);
    return { win, houseData };
  }

  // Cas 1 : projet tiers générique uniquement
  const fixture = minimalProject('maison-alpha', 'Maison Alpha');
  const res1 = runLoader({
    'api/projects': { status: 200, body: [{ slug: 'maison-alpha', name: 'Maison Alpha', default: true }] },
    'projects/maison-alpha/project.json': { status: 200, body: fixture }
  });
  assert.equal(res1.win.ACTIVE_PROJECT_SLUG, 'maison-alpha');
  assert.equal(res1.houseData.meta.slug, 'maison-alpha');
  assert.equal(res1.win.PROJECT_LOAD_ERROR, undefined);

  // Cas 2 : aucun projet disponible
  const res2 = runLoader({ 'api/projects': { status: 200, body: [] } });
  assert.equal(res2.win.ACTIVE_PROJECT_SLUG, '');
  assert.match(res2.win.PROJECT_LOAD_ERROR, /Aucun projet disponible/i);
});

test('js/home.js : galerie accepte planches/ et liseuse fonctionne pour un projet tiers ET residence-verandas', async () => {
  const homeSource = fs.readFileSync(path.join(ROOT, 'js', 'home.js'), 'utf8');
  assert.doesNotMatch(homeSource, /slug !== 'residence-verandas'/, 'aucune restriction de la liseuse à residence-verandas');
  assert.doesNotMatch(homeSource, /Residence-des-Verandas\.pdf/, 'aucun nom de fichier PDF figé');
  assert.match(homeSource, /planches\\\//, 'la galerie accepte le sous-dossier planches/');

  // Vérification structurelle de residence-verandas/project.json
  const verandas = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));
  assert.equal(verandas.edition.bookFile, 'projects/residence-verandas/planches/cahier.pdf');

  // Exécution isolée de renderEdition sur un projet générique sans bookFile et sur residence-verandas
  const fnMatch = /function validBookFile[\s\S]*?function renderEdition[\s\S]*?\n  \}/.exec(homeSource);
  assert.ok(fnMatch, 'validBookFile et renderEdition doivent exister');

  let exportedArgs = null;
  function makeNode(tag, text = '', cls = '') {
    const node = {
      tagName: tag.toUpperCase(),
      textContent: text,
      className: cls,
      hidden: false,
      disabled: false,
      children: [],
      options: [],
      selectedIndex: 0,
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      add(opt) { this.options.push(opt); },
      append(...kids) { this.children.push(...kids); },
      replaceChildren(...kids) { this.children = [...kids]; }
    };
    return node;
  }

  const sandbox = {
    element: makeNode,
    el: () => makeNode('div'),
    counter: n => String(n).padStart(2, '0'),
    Option: function (label, val) { return { label, value: val }; },
    loadedProjectMedia: { images: [] },
    PlanBook: {
      exportBook: async args => { exportedArgs = args; return { pages: 1 }; }
    },
    PdfIdentity: { loadCabinetProfile: async () => null },
    location: { assign() {} }
  };
  vm.runInNewContext(`${fnMatch[0]}\nthis.renderEdition = renderEdition;`, sandbox);

  // Projet générique sans bookFile : bouton qui déclenche PlanBook.exportBook avec le slug du projet
  const genericHost = makeNode('div');
  const genericProject = {
    meta: { name: 'Maison Kola', slug: 'maison-kola' },
    edition: {
      sheets: [{ title: 'Plan RDC', preview: 'projects/maison-kola/planches/rdc.webp' }],
      photos: []
    }
  };
  sandbox.renderEdition(genericProject, 'maison-kola', genericHost, 0, { images: [] });
  assert.equal(genericHost.hidden, false, 'la liseuse s’affiche pour un projet générique');
  const genericAction = genericHost.children[genericHost.children.length - 1];
  assert.equal(genericAction.tagName, 'BUTTON', 'sans bookFile, bouton PlanBook.exportBook');
  await genericAction.onclick();
  assert.equal(exportedArgs.data.meta.slug, 'maison-kola');

  // residence-verandas avec bookFile : lien direct nommé residence-verandas-cahier-de-plans.pdf
  const verandasHost = makeNode('div');
  sandbox.renderEdition(verandas, 'residence-verandas', verandasHost, 0, { images: [] });
  assert.equal(verandasHost.hidden, false);
  const verandasAction = verandasHost.children[verandasHost.children.length - 1];
  assert.equal(verandasAction.tagName, 'A');
  assert.equal(verandasAction.href, 'projects/residence-verandas/planches/cahier.pdf');
  assert.equal(verandasAction.download, 'residence-verandas-cahier-de-plans.pdf');
});

test('js/app.js et js/clientTools.js : aucun cas particulier residence-verandas (bannière FCFA, PDF présentation, CSV, perspectives)', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const clientToolsSource = fs.readFileSync(path.join(ROOT, 'js', 'clientTools.js'), 'utf8');

  assert.doesNotMatch(appSource, /residence-verandas/, 'app.js ne doit plus contenir de cas particulier residence-verandas');
  assert.doesNotMatch(appSource, /residence-des-verandas-bqe\.csv/, 'CSV nommé dynamiquement <slug>-bqe.csv');
  assert.match(appSource, /\$\{PROJECT_SLUG\}-bqe\.csv/);

  assert.doesNotMatch(clientToolsSource, /residence-verandas/, 'clientTools.js ne doit plus réserver les perspectives à residence-verandas');
  assert.match(clientToolsSource, /if \(HOUSE_DATA\.edition\?\.photos\?\.length\)/);
});
