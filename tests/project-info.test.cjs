const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PdfIdentity = require('../js/pdfIdentity.js');
const CostEstimate = require('../js/costEstimate.js');
const Habitability = require('../js/habitability.js');

/** Mini DOM suffisant pour exécuter js/editor.js dans node:vm sans navigateur. */
function createEditorSandbox() {
  const byId = new Map();

  function parseHtmlControls(html, container) {
    container._children = [];
    container._controls = [];
    container._missingNodes = [];

    const missingMatch = /<div[^>]*data-pdf-missing[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (missingMatch) {
      const node = makeEl('div');
      node.dataset.pdfMissing = '';
      node.innerHTML = missingMatch[1];
      node.textContent = missingMatch[1].replace(/<[^>]+>/g, '')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      node.classList.toggle('is-ok', /class="[^"]*\bis-ok\b/.test(missingMatch[0]));
      container._missingNodes.push(node);
    }

    const fieldRe = /<(input|select|textarea)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi;
    let m;
    while ((m = fieldRe.exec(html)) !== null) {
      const tag = m[1].toLowerCase();
      const attrs = m[2];
      const inner = m[3] || '';
      const el = makeEl(tag);
      const idM = /\bid="([^"]*)"/.exec(attrs);
      if (idM) { el.id = idM[1]; byId.set(el.id, el); }
      const keyM = /\bdata-key="([^"]*)"/.exec(attrs);
      if (keyM) el.dataset.key = keyM[1];
      const sheetM = /\bdata-sheet="([^"]*)"/.exec(attrs);
      if (sheetM) el.dataset.sheet = sheetM[1];
      const projM = /\bdata-proj="([^"]*)"/.exec(attrs);
      if (projM) el.dataset.proj = projM[1];
      const typeM = /\btype="([^"]*)"/.exec(attrs);
      if (typeM) el.type = typeM[1];
      if (tag === 'textarea') {
        el.value = inner
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      } else if (tag === 'select') {
        const selM = /<option\b[^>]*value="([^"]*)"[^>]*\bselected\b/i.exec(inner);
        el.value = selM ? selM[1] : '';
      } else if (el.type === 'checkbox') {
        el.checked = /\bchecked\b/.test(attrs);
      } else {
        const valM = /\bvalue="([^"]*)"/.exec(attrs);
        el.value = valM ? valM[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
      }
      container._controls.push(el);
    }

    const btnRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    while ((m = btnRe.exec(html)) !== null) {
      const el = makeEl('button');
      const idM = /\bid="([^"]*)"/.exec(m[1]);
      if (idM) { el.id = idM[1]; byId.set(el.id, el); }
      const projM = /\bdata-proj="([^"]*)"/.exec(m[1]);
      if (projM) el.dataset.proj = projM[1];
      container._controls.push(el);
    }

    const checksTitle = makeEl('h4');
    checksTitle.dataset.checksTitle = '';
    const checksList = makeEl('ul');
    checksList.dataset.checksList = '';
    container._checksTitle = checksTitle;
    container._checksList = checksList;
  }

  function makeEl(tag = 'div', id = '') {
    const classes = new Set();
    const listeners = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      id,
      type: '',
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      open: false,
      textContent: '',
      style: {},
      dataset: {},
      _innerHTML: '',
      _controls: [],
      _missingNodes: [],
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        toggle: (c, force) => {
          if (force === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
          else if (force) classes.add(c); else classes.delete(c);
        },
        contains: c => classes.has(c)
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const payload = typeof evt === 'string' ? { type, target: el } : Object.assign({ target: el }, evt);
        (listeners.get(type) || []).forEach(fn => fn(payload));
        if (typeof el['on' + type] === 'function') el['on' + type](payload);
      },
      click() { el.dispatchEvent('click'); },
      showModal() { el.open = true; },
      close() { el.open = false; el.dispatchEvent('close'); },
      setAttribute() {},
      removeAttribute() {},
      getAttribute() { return null; },
      contains() { return false; },
      append() {},
      appendChild(child) { return child; },
      replaceChildren() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; },
      querySelector(sel) {
        if (sel === '[data-checks-list]') return el._checksList || null;
        if (sel === '[data-checks-title]') return el._checksTitle || null;
        if (sel === '[data-pdf-missing]') return el._missingNodes[0] || null;
        if (sel === '[data-lib]') return makeEl('button');
        const dm = /^\[data-(key|sheet|proj)="([^"]+)"\]$/.exec(sel);
        if (dm) {
          const prop = dm[1];
          return el._controls.find(c => c.dataset[prop] === dm[2]) || null;
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-key]') return el._controls.filter(c => c.dataset.key !== undefined);
        if (sel === '[data-pdf-missing]') return el._missingNodes.slice();
        if (sel === '[data-add-void]') return [];
        if (sel === '[data-lib]') return [makeEl('button')];
        return [];
      }
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._innerHTML; },
      set(val) {
        el._innerHTML = String(val);
        parseHtmlControls(el._innerHTML, el);
      }
    });
    if (id) byId.set(id, el);
    return el;
  }

  const noop = () => {};
  const ctx2d = new Proxy({ measureText: () => ({ width: 20 }) }, {
    get(target, prop) { return prop in target ? target[prop] : noop; }
  });

  const canvas = makeEl('canvas', 'ed-canvas');
  canvas.width = 900;
  canvas.height = 600;
  canvas.clientWidth = 900;
  canvas.clientHeight = 600;
  canvas.getContext = () => ctx2d;

  const ids = [
    'ed-stage', 'ed-drop-overlay', 'ed-hint', 'ed-coords', 'ed-scale',
    'ed-props', 'ed-library', 'ed-project-name', 'ed-save-state', 'ed-toast',
    'ed-ghost-toggle', 'btn-new', 'btn-open', 'btn-import-villa', 'btn-cabinet',
    'btn-project-info', 'file-plan', 'btn-ai-read', 'btn-plan-cleanup', 'btn-undo',
    'btn-redo', 'btn-save', 'btn-export-json', 'btn-preview',
    'dlg-open', 'dlg-open-list', 'dlg-open-status', 'dlg-open-close', 'file-json',
    'dlg-cabinet', 'cabinet-name', 'cabinet-architect', 'cabinet-logo',
    'cabinet-logo-preview', 'cabinet-remove-logo', 'cabinet-status', 'cabinet-close', 'cabinet-save',
    'dlg-project-info', 'dlg-project-info-body', 'dlg-project-info-close'
  ];
  ids.forEach(id => makeEl(id.startsWith('dlg-') ? 'dialog' : 'div', id));

  const document = {
    getElementById: id => byId.get(id) || null,
    createElement: tag => makeEl(tag),
    querySelector: sel => {
      if (sel === '[data-pdf-missing]') {
        return [...byId.values()].flatMap(e => e._missingNodes)[0] || null;
      }
      return null;
    },
    querySelectorAll: sel => {
      if (sel === '[data-pdf-missing]') {
        return [...byId.values()].flatMap(e => e._missingNodes);
      }
      return [];
    },
    body: makeEl('body')
  };

  const windowObj = {
    devicePixelRatio: 1,
    addEventListener: noop,
    removeEventListener: noop,
    confirm: () => true,
    open: () => null,
    HOUSE_DATA: { meta: {}, config: {}, walls: [], rooms: [] }
  };

  const sandbox = {
    window: windowObj,
    document,
    PdfIdentity,
    CostEstimate,
    Habitability,
    Image: class { set src(_) {} },
    localStorage: { getItem: () => null, setItem: noop },
    fetch: async () => ({ ok: false }),
    setTimeout, clearTimeout,
    console
  };
  sandbox.globalThis = sandbox;

  const coreCode = fs.readFileSync(path.join(ROOT, 'js', 'houseDataCore.js'), 'utf8');
  vm.runInNewContext(coreCode, sandbox, { filename: 'js/houseDataCore.js' });
  sandbox.HouseAuto = windowObj.HouseAuto || sandbox.HouseAuto || {
    geometryVersion: () => '00000000',
    diagnose: () => ({ unreachable: [], voids: [], roof: [], footprintFill: 1 }),
    stairFits: () => true
  };
  const code = fs.readFileSync(path.join(ROOT, 'js', 'editor.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'js/editor.js' });
  return { api: windowObj.EditorAPI, document, byId };
}

test('editor.html expose le bouton « Informations du projet » et son dialogue', () => {
  const html = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  assert.match(html, /id="btn-project-info"[^>]*>Informations du projet<\/button>/);
  assert.match(html, /<dialog id="dlg-project-info"[^>]*>/);
  assert.match(html, /id="dlg-project-info-body"/);
});

test('aller-retour de residence-verandas : meta.description survit et aucun champ administratif n’est inventé', () => {
  const { api } = createEditorSandbox();
  const original = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));

  api.loadProject(original, { keepExtras: true });
  const saved = api.toProjectJson('2026-11-25T10:00:00.000Z');

  assert.equal(saved.meta.name, original.meta.name);
  assert.equal(saved.meta.slug, original.meta.slug);
  assert.equal(saved.meta.subtitle, original.meta.subtitle);
  assert.equal(saved.meta.description, original.meta.description);
  assert.equal(saved.meta.client, '');
  assert.equal(saved.meta.clientVisible, false);
  for (const absent of ['architect', 'location', 'phase', 'revision', 'reference', 'issueDate', 'status', 'concept', 'contact']) {
    assert.equal(saved.meta[absent], undefined, `le champ absent ${absent} ne doit pas être inventé`);
  }
});

test('aller-retour complet : tous les champs meta survivent sans perte ni déformation', () => {
  const { api } = createEditorSandbox();
  const fullProject = {
    meta: {
      name: 'VILLA ACACIA',
      slug: 'villa-acacia',
      subtitle: 'Maison R+1 avec patio central',
      client: 'M. & Mme Mbarga',
      clientVisible: true,
      reference: 'ARC-2026-014',
      architect: 'Atelier Nkoa',
      location: 'Yaoundé — Bastos',
      phase: 'APS',
      revision: 'B',
      issueDate: '2026-10-15',
      status: 'En validation client',
      concept: 'Double orientation nord-sud\nVentilation traversante naturelle',
      contact: 'atelier@nkoa-archi.cm',
      description: 'Ligne 1 : rez-de-chaussée ouvert sur terrasse.\nLigne 2 : étage nuit protégé par brise-soleil.'
    },
    config: { wallHeight: 2.9, floorHeight: 3 },
    walls: [{ from: [0, 0], to: [6, 0], thick: 0.25, type: 'ext', level: 0, openings: [] }],
    rooms: [{ id: 'sejour', name: 'SÉJOUR', level: 0, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 4 }, floorType: 'parquet', habitable: true, desc: '' }]
  };

  api.loadProject(fullProject);
  const first = api.toProjectJson('2026-11-25T10:00:00.000Z');
  api.loadProject(first);
  const second = api.toProjectJson('2026-11-25T10:05:00.000Z');

  for (const field of ['name', 'subtitle', 'client', 'clientVisible', 'reference', 'architect', 'location', 'phase', 'revision', 'issueDate', 'status', 'concept', 'contact', 'description']) {
    assert.equal(first.meta[field], fullProject.meta[field], `premier aller-retour sur meta.${field}`);
    assert.equal(second.meta[field], fullProject.meta[field], `second aller-retour sur meta.${field}`);
  }
});

test('la fiche « Informations du projet » s’ouvre dans un dialogue même lorsqu’un mur est sélectionné', () => {
  const { api, byId } = createEditorSandbox();
  const original = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));
  api.loadProject(original, { keepExtras: true });

  const wall = api.S.p.walls[0];
  assert.ok(wall, 'au moins un mur doit être présent');
  api.select({ kind: 'wall', obj: wall });
  assert.equal(api.S.sel.kind, 'wall');
  assert.match(byId.get('ed-props').innerHTML, /<h3>Mur<\/h3>/);

  byId.get('btn-project-info').click();
  const dlg = byId.get('dlg-project-info');
  const body = byId.get('dlg-project-info-body');
  assert.equal(dlg.open, true, 'le dialogue doit être ouvert');
  assert.equal(api.S.sel.kind, 'wall', 'la sélection du mur doit rester intacte');

  const descInput = body.querySelector('[data-key="description"]');
  assert.ok(descInput, 'le champ Description doit être présent dans la fiche');
  assert.equal(descInput.tagName, 'TEXTAREA');
  assert.equal(descInput.value, original.meta.description);

  assert.match(body.innerHTML, /utilisé dans les PDF/, 'les champs du cartouche portent le repère « utilisé dans les PDF »');
});

test('missingFields se met à jour dès la saisie du maître d’ouvrage dans la fiche', () => {
  const { api, byId } = createEditorSandbox();
  const original = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'residence-verandas', 'project.json'), 'utf8'));
  api.loadProject(original, { keepExtras: true });

  byId.get('btn-project-info').click();
  const body = byId.get('dlg-project-info-body');
  const bannerBefore = body.querySelector('[data-pdf-missing]');
  assert.ok(bannerBefore, 'la liste des champs vides doit être affichée');
  assert.match(bannerBefore.textContent, /Maître d'ouvrage/);

  const clientInput = body.querySelector('[data-key="client"]');
  assert.ok(clientInput, 'le champ client doit être présent');
  clientInput.value = 'Mme Fouda';
  clientInput.dispatchEvent('change');

  assert.equal(api.S.p.meta.client, 'Mme Fouda');
  const bannerAfter = body.querySelector('[data-pdf-missing]');
  assert.doesNotMatch(bannerAfter.textContent, /Maître d'ouvrage/);
  const check = PdfIdentity.missingFields({ meta: api.S.p.meta });
  assert.ok(!check.missing.includes("Maître d'ouvrage"));
});
