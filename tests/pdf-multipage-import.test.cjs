const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const SheetClassifier = require('../js/sheetClassifier');
const planchesStore = require('../planchesStore');

const ROOT = path.resolve(__dirname, '..');

const VALID_PDF_DATA_URL = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'ascii').toString('base64');
const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeElement(tag = 'div', id = '') {
  const el = {
    tagName: String(tag).toUpperCase(),
    id,
    className: '',
    type: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    open: false,
    dataset: {},
    style: {},
    children: [],
    listeners: {},
    textContent: '',
    innerHTML: '',
    src: '',
    alt: '',
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() { return false; }
    },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    append(...nodes) { el.children.push(...nodes); },
    appendChild(node) { el.children.push(node); return node; },
    replaceChildren(...nodes) { el.children = [...nodes]; },
    querySelector() { return makeElement('div'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
    getContext() {
      return new Proxy({}, {
        get(_t, prop) {
          if (prop === 'canvas') return el;
          return () => {};
        }
      });
    },
    showModal() { el.open = true; },
    close() { el.open = false; }
  };
  return el;
}

function loadEditorSandbox() {
  const byId = new Map();
  const getEl = id => {
    if (!byId.has(id)) byId.set(id, makeElement('div', id));
    return byId.get(id);
  };
  const canvas = makeElement('canvas', 'ed-canvas');
  canvas.width = 800; canvas.height = 600;
  byId.set('ed-canvas', canvas);
  const libEl = makeElement('div');
  const document = {
    getElementById: getEl,
    createElement: tag => makeElement(tag),
    querySelector: sel => (sel === '[data-lib]' ? libEl : makeElement('div')),
    querySelectorAll: () => [],
    addEventListener() {},
    body: makeElement('body')
  };
  const windowObj = {
    document,
    devicePixelRatio: 1,
    location: { search: '', href: 'http://localhost:3000/editor.html' },
    addEventListener() {},
    removeEventListener() {},
    localStorage: { getItem: () => null, setItem() {} },
    Image: class MockImage {
      set src(v) {
        this._src = v;
        this.width = 1200;
        this.height = 800;
        if (typeof this.onload === 'function') this.onload();
      }
      get src() { return this._src; }
    },
    SheetClassifier,
    fetch: async () => ({ ok: false, json: async () => ({}) })
  };
  windowObj.window = windowObj;
  const ctx = vm.createContext({
    ...windowObj,
    console,
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    Uint8Array
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'houseDataCore.js'), 'utf8'), ctx, { filename: 'houseDataCore.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'editor.js'), 'utf8'), ctx, { filename: 'editor.js' });
  return ctx.window.EditorAPI;
}

test('Lot 4 — PDF.js 3.11.174 est local dans assets/vendor/ et aucune dépendance cdnjs ne subsiste', () => {
  const pdfMin = path.join(ROOT, 'assets', 'vendor', 'pdf.min.js');
  const pdfWorker = path.join(ROOT, 'assets', 'vendor', 'pdf.worker.min.js');
  assert.ok(fs.existsSync(pdfMin), 'assets/vendor/pdf.min.js doit exister');
  assert.ok(fs.existsSync(pdfWorker), 'assets/vendor/pdf.worker.min.js doit exister');
  assert.ok(fs.statSync(pdfMin).size > 100000, 'pdf.min.js non vide');
  assert.ok(fs.statSync(pdfWorker).size > 500000, 'pdf.worker.min.js non vide');

  for (const rel of ['editor.html', 'js/editor.js', 'js/planBook.js']) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(/cdnjs\.cloudflare\.com/i.test(content), false, `${rel} ne doit plus référencer cdnjs`);
  }
  const editorHtml = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  assert.match(editorHtml, /assets\/vendor\/pdf\.min\.js/);
  assert.match(editorHtml, /id="dlg-pdf-import"/);
  assert.match(editorHtml, /js\/sheetClassifier\.js/);
  assert.match(editorHtml, /js\/planBook\.js/);
});

test('Lot 4 — Dossier synthétique de 5 pages (masse, RDC, R+1, façade, coupe) → niveaux 0 et 1 + références archivées', async () => {
  const api = loadEditorSandbox();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-lot4-'));
  const projects = path.join(dir, 'projects');
  const slug = 'villa-cinq-pages';
  fs.mkdirSync(path.join(projects, slug), { recursive: true });
  fs.writeFileSync(path.join(projects, slug, 'project.json'), JSON.stringify({
    meta: { name: 'Villa Cinq Pages', slug },
    config: { wallHeight: 2.8, floorHeight: 3 },
    walls: [],
    rooms: []
  }));

  try {
    api.loadProject({
      meta: { name: 'Villa Cinq Pages', slug },
      config: { wallHeight: 2.8, floorHeight: 3 },
      walls: [],
      rooms: []
    });

    // Dossier synthétique de 5 pages tel que produit par PlanBook.readSheets
    const syntheticPages = [
      {
        name: 'Dossier_Permis.pdf', page: 1, total: 5, width: 1600, height: 1130,
        paperMm: { w: 420, h: 297 }, data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
        text: 'TITRE DU PLAN : PLAN DE MASSE ECHELLE 1/200 LIMITE DE PROPRIETE ROUTE VOIRIE EMPRISE AU SOL'
      },
      {
        name: 'Dossier_Permis.pdf', page: 2, total: 5, width: 1600, height: 1130,
        paperMm: { w: 420, h: 297 }, data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
        text: 'TITRE DU PLAN : PLAN DE DISTRIBUTION RDC ECHELLE 1/100 SEJOUR 32,0 m2 CUISINE 14,2 m2 CHAMBRE 13,5 m2 VERANDA 11,0 m2'
      },
      {
        name: 'Dossier_Permis.pdf', page: 3, total: 5, width: 1600, height: 1130,
        paperMm: { w: 420, h: 297 }, data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
        text: 'TITRE DU PLAN : PLAN DE DISTRIBUTION R+1 ECHELLE 1/100 CHAMBRE 16,0 m2 DRESSING 6,5 m2 SALLE DE BAIN 7,2 m2 DEGAGEMENT 5,0 m2'
      },
      {
        name: 'Dossier_Permis.pdf', page: 4, total: 5, width: 1600, height: 1130,
        paperMm: { w: 420, h: 297 }, data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
        text: 'TITRE DU PLAN : FACADE PRINCIPALE ECHELLE 1/100 ELEVATION SUD'
      },
      {
        name: 'Dossier_Permis.pdf', page: 5, total: 5, width: 1600, height: 1130,
        paperMm: { w: 420, h: 297 }, data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
        text: 'TITRE DU PLAN : COUPE A-A ECHELLE 1/100 +0,00 +3,00 +6,20'
      }
    ];

    const planned = api.planPdfImport(syntheticPages);
    assert.equal(planned.length, 5);
    assert.equal(planned[0].type, 'masse');
    assert.equal(planned[0].action, 'reference');
    assert.equal(planned[1].type, 'distribution');
    assert.equal(planned[1].action, 'level');
    assert.equal(planned[1].targetLevel, 0);
    assert.equal(planned[2].type, 'distribution');
    assert.equal(planned[2].action, 'level');
    assert.equal(planned[2].targetLevel, 1);
    assert.equal(planned[3].type, 'facade');
    assert.equal(planned[3].action, 'reference');
    assert.equal(planned[4].type, 'coupe');
    assert.equal(planned[4].action, 'reference');

    // Simule l'API Lot 3 (/api/projects/:slug/planches) adossée au vrai planchesStore
    let postedUrl = '';
    const mockFetch = async (url, init) => {
      postedUrl = url;
      const body = JSON.parse(init.body);
      const items = planchesStore.save(projects, slug, body);
      return { ok: true, status: 201, json: async () => ({ slug, items }) };
    };

    const result = await api.applyPdfImportSelection(planned, {
      pdfDataUrl: VALID_PDF_DATA_URL,
      fetchFn: mockFetch
    });

    assert.equal(postedUrl, `api/projects/${slug}/planches`);
    // Niveaux 0 (RDC = page 2) et 1 (R+1 = page 3) affectés aux bonnes pages
    assert.equal(result.levels[0].sourcePage, 2);
    assert.equal(result.levels[1].sourcePage, 3);
    assert.match(result.levels[0].url, new RegExp(`^projects/${slug}/planches/page-.*\\.png$`));
    assert.match(result.levels[1].url, new RegExp(`^projects/${slug}/planches/page-.*\\.png$`));

    // Bascule de niveau dans l'éditeur charge bien le plan du bon niveau
    assert.equal(api.S.activeLevel, 0);
    assert.equal(api.S.p.config.planImage.sourcePage, 2);
    api.switchLevel(1);
    assert.equal(api.S.activeLevel, 1);
    assert.equal(api.S.p.config.planImage.sourcePage, 3);
    api.switchLevel(0);
    assert.equal(api.S.p.config.planImage.sourcePage, 2);

    // Masse (p.1), façade (p.4) et coupe (p.5) enregistrées en référence (Lot 3)
    assert.deepEqual(
      result.references.map(r => ({ page: r.page, type: r.type })),
      [
        { page: 1, type: 'masse' },
        { page: 4, type: 'facade' },
        { page: 5, type: 'coupe' }
      ]
    );
    const onDisk = planchesStore.list(projects, slug);
    assert.equal(onDisk.length, 5);
    assert.ok(onDisk.some(item => item.page === 4 && item.type === 'facade'));
    assert.ok(onDisk.some(item => item.page === 5 && item.type === 'coupe'));

    // toProjectJson conserve planImages pour les deux niveaux
    const serialized = api.toProjectJson('2026-11-25T00:00:00.000Z');
    assert.equal(serialized.config.planImages['0'].sourcePage, 2);
    assert.equal(serialized.config.planImages['1'].sourcePage, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 4 — Page de distribution sans niveau explicite signalée « À vérifier » sans deviner', () => {
  const api = loadEditorSandbox();
  const planned = api.planPdfImport([
    {
      name: 'Plan_Sans_Niveau.pdf', page: 1, total: 1, width: 1200, height: 800,
      data: VALID_PNG_DATA_URL, thumb: VALID_PNG_DATA_URL,
      text: 'TITRE DU PLAN : PLAN DE DISTRIBUTION SEJOUR 20,0 m2 CHAMBRE 12,0 m2'
    }
  ]);
  assert.equal(planned[0].type, 'distribution');
  assert.equal(planned[0].level, null);
  assert.equal(planned[0].needsVerification, true);
  assert.equal(planned[0].action, 'reference');
});
