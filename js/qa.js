/*
 * ARCHICAM STUDIO — BANC D'ESSAI (js/qa.js)
 * ---------------------------------------------------------------------------
 * Charge une vraie vue de l'application dans un cadre à largeur choisie et
 * audite les contrastes du système (clair et sombre) depuis css/tokens.css.
 * Aucun accès réseau hors des pages de l'atelier ; aucun réglage n'est envoyé
 * au serveur : tout vit dans l'URL de la page de banc d'essai.
 */
(() => {
  'use strict';

  const el = id => document.getElementById(id);

  const VIEWS = {
    accueil: { label: 'Accueil — dossier client', url: slug => `accueil.html${slug ? `?project=${encodeURIComponent(slug)}` : ''}` },
    cockpit: { label: 'Cockpit 3D', url: slug => `index.html${slug ? `?project=${encodeURIComponent(slug)}` : ''}` },
    studio: { label: 'Atelier (entrée)', url: () => 'studio.html' },
    editeur: { label: 'Éditeur 2D', url: () => 'editor.html' },
    portail: { label: 'Portail privé', url: () => 'portal.html' },
    charte: { label: 'Charte vivante', url: () => 'design.html' }
  };

  // Couples texte / fond à auditer, lus dans tokens.css. `large` = grand texte (seuil 3).
  const PAIRS = [
    ['--ink', '--paper', 'Texte courant sur papier', false],
    ['--ink-2', '--paper', 'Texte secondaire sur papier', false],
    ['--muted', '--paper', 'Légendes sur papier', false],
    ['--ink-2', '--surface', 'Secondaire sur surface', false],
    ['--muted', '--surface', 'Légendes sur surface', false],
    ['--accent-ink', '--paper', 'Accent sur papier', false],
    ['--accent-ink', '--accent-wash', 'Accent sur lavé sable', false],
    ['--paper', '--ink', 'Bouton primaire', false],
    ['--on-night', '--night', 'Texte sur nuit', false],
    ['--on-night-2', '--night', 'Secondaire sur nuit', false],
    ['--on-night-muted', '--night', 'Légende sur nuit', false],
    ['--accent-soft', '--night', 'Accent doux sur nuit', true],
    ['--night', '--accent', 'Badge accent (mode FPS)', false],
    ['--danger', '--paper', 'Alerte sur papier', false],
    ['--success', '--paper', 'Succès sur papier', false],
    ['--warning', '--paper', 'Vigilance sur papier', false]
  ];

  const REQUIRED_TOKENS = ['--paper', '--ink', '--accent', '--surface-2', '--ring', '--shadow-3', '--text-3xl', '--measure'];

  const state = { view: 'accueil', project: '', width: 768, height: 'fill', zoom: 1, scheme: 'light' };
  let schemes = { light: null, dark: null };

  /* ------------------------------------------------------------------ */
  /* Couleur et contraste — calcul dans js/contrast.js                  */
  /* ------------------------------------------------------------------ */

  const Contrast = (typeof window !== 'undefined' && window.Contrast) || null;

  function token(scheme, name) {
    const map = schemes[scheme];
    if (map && Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    if (scheme === 'light') {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    return '';
  }

  function evaluateScheme(scheme) {
    const results = PAIRS.map(([fgName, bgName, label, large]) => {
      const fg = Contrast.parseColor(token(scheme, fgName));
      const bg = Contrast.parseColor(token(scheme, bgName));
      if (!fg || !bg) {
        return { fgName, bgName, label, value: null, code: 'jeton illisible', tone: 'is-bad', ok: false };
      }
      const value = Contrast.ratio(fg, bg);
      const { code, tone } = Contrast.verdict(value, large);
      const min = large ? Contrast.AA_LARGE : Contrast.AA_TEXT;
      return { fgName, bgName, label, value, code, tone, ok: value >= min };
    });
    const passed = results.filter(item => item.ok).length;
    return { results, passed, total: results.length, failed: results.length - passed };
  }

  function syncSchemeButtons() {
    document.querySelectorAll('.qa-scheme').forEach(button => {
      const active = button.dataset.auditScheme === state.scheme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderContrast() {
    const body = el('qa-contrast-body');
    if (!body) return;
    if (!Contrast) {
      body.innerHTML = '<tr><td colspan="3">Module js/contrast.js indisponible : audit impossible.</td></tr>';
      return;
    }

    syncSchemeButtons();
    const active = evaluateScheme(state.scheme);
    const rows = active.results.map(item => {
      if (item.value === null) {
        return `<tr><td>${item.label}<br><span class="qa-token-pair">${item.fgName} / ${item.bgName}</span></td><td>—</td><td class="qa-verdict is-bad">${item.code}</td></tr>`;
      }
      return `<tr><td>${item.label}<br><span class="qa-token-pair">${item.fgName} / ${item.bgName}</span></td>` +
        `<td class="qa-ratio">${item.value.toFixed(2)}</td>` +
        `<td><span class="qa-verdict ${item.tone}">${item.code}</span></td></tr>`;
    });
    body.innerHTML = rows.join('');

    const summary = el('qa-scheme-summary');
    if (summary) {
      const lightEval = evaluateScheme('light');
      const darkEval = schemes.dark ? evaluateScheme('dark') : null;
      if (darkEval) {
        summary.textContent = `Clair : ${lightEval.passed}/${lightEval.total} AA · Sombre : ${darkEval.passed}/${darkEval.total} AA`;
        summary.classList.toggle('is-bad', lightEval.failed > 0 || darkEval.failed > 0);
      } else {
        summary.textContent = `Clair : ${lightEval.passed}/${lightEval.total} AA · Sombre : lecture de tokens.css requise`;
        summary.classList.toggle('is-bad', lightEval.failed > 0);
      }
    }

    const missing = REQUIRED_TOKENS.filter(name => !token(state.scheme, name));
    const note = el('qa-tokens');
    if (note) {
      const label = state.scheme === 'dark' ? 'mode sombre' : 'mode clair';
      note.textContent = missing.length
        ? `Jetons attendus mais vides (${label}) : ${missing.join(', ')}.`
        : `Les ${REQUIRED_TOKENS.length} jetons critiques sont définis en ${label} ; ${PAIRS.length} couples audités.`;
      note.classList.toggle('is-bad', missing.length > 0);
    }
  }

  async function loadSchemes() {
    if (!Contrast || typeof Contrast.extractSchemes !== 'function') return;
    try {
      const response = await fetch('css/tokens.css', { cache: 'no-store' });
      if (!response.ok) return;
      const cssText = await response.text();
      const extracted = Contrast.extractSchemes(cssText);
      if (extracted && Object.keys(extracted.light || {}).length) {
        schemes = extracted;
        renderContrast();
      }
    } catch {
      /* Sans serveur (fichier ouvert directement), le mode clair reste lu via getComputedStyle. */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cadre d'aperçu                                                     */
  /* ------------------------------------------------------------------ */

  function frameUrl() {
    const view = VIEWS[state.view] || VIEWS.accueil;
    return view.url(state.project);
  }

  function syncUrl() {
    const params = new URLSearchParams({ view: state.view, w: String(state.width) });
    if (state.project) params.set('project', state.project);
    if (state.height !== 'fill') params.set('h', state.height);
    if (state.zoom !== 1) params.set('z', String(state.zoom));
    if (state.scheme !== 'light') params.set('scheme', state.scheme);
    history.replaceState(null, '', `qa.html?${params.toString()}`);
  }

  function apply() {
    const url = frameUrl();
    el('qa-frame').src = url;
    el('qa-url').textContent = url;
    el('qa-open').href = url;

    const device = el('qa-device');
    device.style.width = `${state.width}px`;
    device.style.transform = state.zoom === 1 ? 'none' : `scale(${state.zoom})`;
    device.style.maxHeight = 'none';

    const frame = el('qa-frame');
    if (state.height === 'fill') {
      frame.style.height = 'calc(100dvh - 210px)';
    } else {
      frame.style.height = `${state.height}px`;
    }

    el('qa-size').textContent = `${state.width} × ${state.height === 'fill' ? 'fenêtre' : state.height} px${state.zoom !== 1 ? ` · zoom ${Math.round(state.zoom * 100)} %` : ''}`;

    document.querySelectorAll('.qa-width').forEach(button => {
      const active = Number(button.dataset.width) === state.width;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    el('qa-width-custom').value = String(state.width);
    el('qa-view').value = state.view;
    el('qa-height').value = state.height;
    el('qa-zoom').value = String(state.zoom);

    syncUrl();

    const live = el('qa-live');
    if (live) live.textContent = `${VIEWS[state.view].label} · ${state.width} px`;
  }

  function restore() {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (VIEWS[view]) state.view = view;
    const width = Number(params.get('w'));
    if (Number.isFinite(width) && width >= 320 && width <= 1920) state.width = width;
    const height = params.get('h');
    if (['812', '1024', '1180'].includes(height)) state.height = height;
    const zoom = Number(params.get('z'));
    if ([0.5, 0.75, 1].includes(zoom)) state.zoom = zoom;
    const scheme = params.get('scheme');
    if (scheme === 'light' || scheme === 'dark') state.scheme = scheme;
    state.project = params.get('project') || '';
  }

  async function loadProjects() {
    const select = el('qa-project');
    if (!select) return;
    try {
      const response = await fetch('api/projects');
      if (!response.ok) return;
      const list = await response.json();
      const slugs = (Array.isArray(list) ? list : []).map(item => item.slug).filter(Boolean);
      for (const slug of slugs) {
        const option = document.createElement('option');
        option.value = slug;
        option.textContent = slug;
        select.append(option);
      }
      if (slugs.includes(state.project)) select.value = state.project;
      else if (slugs.length) { state.project = slugs[0]; select.value = state.project; }
    } catch {
      /* Le banc reste utilisable sans la liste : les vues générales n'ont pas besoin de dossier. */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Câblage                                                            */
  /* ------------------------------------------------------------------ */

  function wire() {
    el('qa-view').addEventListener('change', event => { state.view = event.target.value; apply(); });
    el('qa-project').addEventListener('change', event => { state.project = event.target.value; apply(); });
    el('qa-height').addEventListener('change', event => { state.height = event.target.value; apply(); });
    el('qa-zoom').addEventListener('change', event => { state.zoom = Number(event.target.value); apply(); });
    el('qa-width-custom').addEventListener('change', event => {
      const value = Math.min(1920, Math.max(320, Number(event.target.value) || state.width));
      state.width = value;
      apply();
    });
    document.querySelectorAll('.qa-width').forEach(button => {
      button.addEventListener('click', () => { state.width = Number(button.dataset.width); apply(); });
    });
    document.querySelectorAll('.qa-scheme').forEach(button => {
      button.addEventListener('click', () => {
        const next = button.dataset.auditScheme;
        if (next !== 'light' && next !== 'dark') return;
        state.scheme = next;
        syncUrl();
        renderContrast();
      });
    });
    el('qa-reload').addEventListener('click', () => {
      const frame = el('qa-frame');
      frame.src = 'about:blank';
      requestAnimationFrame(() => apply());
      el('qa-live').textContent = 'Cadre rechargé.';
    });
    el('qa-copy').addEventListener('click', async () => {
      const live = el('qa-live');
      try {
        await navigator.clipboard.writeText(location.href);
        live.textContent = 'Lien copié : il rouvre ce réglage.';
      } catch {
        live.textContent = location.href;
      }
    });
    window.addEventListener('resize', () => { if (state.height === 'fill') apply(); });
  }

  function start() {
    restore();
    renderContrast();
    wire();
    void loadSchemes();
    void loadProjects().then(apply);
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
