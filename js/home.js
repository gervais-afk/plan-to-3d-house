/** Couverture d’un dossier : mêmes API et périmètre projet que la visite, sans moteur WebGL. */
(() => {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (['variant', 'retours', 'wp'].some(key => fragment.has(key))) {
    const visit = new URL('index.html', url);
    visit.search = url.search;
    visit.hash = url.hash;
    location.replace(visit.href);
    return;
  }

  const el = id => document.getElementById(id);
  const context = window.PORTAL_CONTEXT;
  const status = el('home-status');
  const select = el('home-project');
  let image = el('cover-image');
  const views = el('cover-views');
  const cover = el('home-cover');
  const title = el('cover-title');
  const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const slugPattern = /^[a-z0-9-]{1,60}$/;
  const svgNS = 'http://www.w3.org/2000/svg';
  const counter = value => String(value).padStart(2, '0');
  let request;
  let activeViews = [];
  let current = 0;
  let pictureVersion = 0;

  el('home-account').hidden = !context?.role;
  // L’outil de saisie n’apparaît dans l’en-tête que pour l’architecte connecté ; en démo il reste en pied de page.
  el('home-editor').hidden = context?.role !== 'architect';
  el('footer-editor').hidden = Boolean(context?.role);
  if (context?.project) el('home-brand').href = `accueil.html?project=${encodeURIComponent(context.project)}`;

  function viewerLink(project, gallery = false) {
    const link = new URL('index.html', url);
    if (project) link.searchParams.set('project', project);
    if (gallery) link.searchParams.set('galerie', '1');
    return link.pathname + link.search;
  }
  function selectProject(project) {
    el('cover-enter').href = viewerLink(project);
    el('cover-gallery').href = viewerLink(project, true);
  }
  const nameForDisplay = name => name === name.toLocaleUpperCase('fr-FR')
    ? name.toLocaleLowerCase('fr-FR').replace(/(^|[\s-])\p{L}/gu, start => start.toLocaleUpperCase('fr-FR')) : name;
  function setName(name) {
    const display = nameForDisplay(name);
    title.textContent = display;
    title.toggleAttribute('data-long', display.length > 23);
    document.title = `${display} — Plan to 3D`;
  }
  async function json(route, signal) {
    const response = await fetch(route, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  // Ouverture : les trois premières vues dans l’ordre de présentation partagé (js/viewOrder.js).
  const makeViews = (media, slug) => ViewOrder.views(media, slug, 3);
  async function showView(index) {
    if (!activeViews.length) return;
    current = (index + activeViews.length) % activeViews.length;
    const version = ++pictureVersion;
    const shot = activeViews[current];
    const original = new URL(shot.source, url).href;
    const source = new URL(shot.preview || shot.source, url).href;
    el('cover-number').textContent = `${counter(current + 1)} / ${counter(activeViews.length)}`;
    Array.from(views.children).forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    const next = new Image();
    next.fetchPriority = 'high';
    // Réseau lent : le plan dessiné couvre l’attente plutôt qu’une trame vide.
    const patience = setTimeout(() => { if (version === pictureVersion && cover.dataset.art !== 'photo') cover.dataset.art = 'plan'; }, 1200);
    try {
      next.src = source;
      try { await next.decode(); }
      catch (error) { if (source === original) throw error; next.src = original; await next.decode(); }
      if (version !== pictureVersion) return;
      next.id = image.id;
      next.alt = shot.alt;
      image.replaceWith(next);
      image = next;
      cover.dataset.art = 'photo';
      el('cover-caption').textContent = shot.label;
    } catch {
      if (version !== pictureVersion) return;
      image.hidden = true;
      cover.dataset.art = 'plan';
      el('cover-caption').textContent = 'Vue indisponible · plan du projet';
    } finally {
      clearTimeout(patience);
    }
  }
  function renderViews(shots) {
    activeViews = shots;
    pictureVersion++;
    image.hidden = true;
    image.removeAttribute('src');
    el('cover-caption').textContent = shots.length || cover.dataset.art === 'loading' ? '' : 'Plan du projet';
    el('cover-index').hidden = shots.length < 2;
    el('cover-empty').hidden = shots.length > 0;
    views.replaceChildren(...shots.map((shot, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'view-card';
      const figure = document.createElement('span'); figure.className = 'view-figure';
      const thumb = document.createElement('img'); thumb.alt = ''; thumb.loading = 'lazy'; thumb.decoding = 'async'; thumb.src = shot.preview || shot.source;
      const caption = document.createElement('span'); caption.className = 'view-name';
      const figureNumber = document.createElement('i'); figureNumber.textContent = counter(i + 1); figureNumber.setAttribute('aria-hidden', 'true');
      caption.append(figureNumber, document.createTextNode(shot.label));
      const kind = document.createElement('span'); kind.className = 'view-kind'; kind.textContent = shot.kind;
      figure.append(thumb); button.append(figure, caption, kind);
      button.addEventListener('click', () => {
        void showView(i);
        cover.focus({ preventScroll: true });
        cover.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      });
      return button;
    }));
    // Le plan dessiné ne sert de couverture que s’il n’y a aucun rendu : pas de plan entrevu avant la photo.
    if (shots.length) void showView(0);
    else if (cover.dataset.art !== 'loading') cover.dataset.art = 'plan';
  }
  function projectDrawing(walls) {
    const all = (Array.isArray(walls) ? walls : []).filter(wall => [wall?.from, wall?.to].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)));
    const level = wall => Number(wall.level) || 0;
    const ground = all.reduce((lowest, wall) => Math.min(lowest, level(wall)), Infinity);
    const valid = all.filter(wall => level(wall) === ground);
    const drawing = el('cover-drawing');
    drawing.replaceChildren();
    if (!valid.length) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const wall of valid) for (const [x, z] of [wall.from, wall.to]) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, z); bottom = Math.max(bottom, z);
    }
    const margin = Math.max(right - left, bottom - top, 1) * .13;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', [left - margin, top - margin, right - left + 2 * margin, bottom - top + 2 * margin].join(' '));
    for (const wall of valid) {
      const line = document.createElementNS(svgNS, 'line');
      for (const [attr, value] of Object.entries({ x1: wall.from[0], y1: wall.from[1], x2: wall.to[0], y2: wall.to[1], stroke: 'currentColor', 'stroke-width': wall.type === 'ext' ? 2.5 : 1.2, 'vector-effect': 'non-scaling-stroke' })) line.setAttribute(attr, value);
      svg.append(line);
    }
    drawing.append(svg);
  }
  function projectFacts(project) {
    const facts = el('project-facts');
    facts.hidden = true;
    facts.replaceChildren();
    if (!Array.isArray(project?.walls) || !Array.isArray(project?.rooms)) return;
    const levels = new Set([...project.walls, ...project.rooms].map(item => Number(item?.level) || 0));
    const rooms = project.rooms.length;
    const stats = [];
    let area = 0;
    try {
      const data = normalizeHouseData({ ...project, config: { ...HOUSE_DEFAULT_CONFIG, ...project.config } });
      area = data.totals.habitable; // Recalcul commun des surfaces rectangulaires et polygonales.
    } catch { /* métadonnées disponibles même si la géométrie est incomplète */ }
    if (area > 0) stats.push([`${number.format(area)} m²`, 'Surface habitable']);
    if (rooms > 0) stats.push([number.format(rooms), rooms === 1 ? 'Espace au plan' : 'Espaces au plan']);
    if (levels.size === 1) stats.push(['Plain-pied', 'Niveau']);
    else if (levels.size > 1) stats.push([`R+${levels.size - 1}`, `${levels.size} niveaux`]);
    for (const [value, label] of stats) {
      const pair = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      pair.append(dt, dd); facts.append(pair);
    }
    facts.hidden = !stats.length;
    window.Motion?.pop(facts.querySelectorAll('dd')); // chiffres qui apparaissent l’un après l’autre
  }
  // ---------- Sections « grand cabinet » : le projet, le plan, la signature ----------
  const PHASES = { ESQ: 'Esquisse', APS: 'Avant-projet sommaire', APD: 'Avant-projet définitif', PC: 'Permis de construire', DCE: 'Dossier de consultation', EXE: 'Exécution' };
  const SMALL = /^(?:à|a|au|aux|de|du|des|d|la|le|les|l|et|en|sur|sous)$/;
  // « SALLE À MANGER » → « Salle à manger » ; sigles courts (WC, SDB) conservés.
  const roomName = (name = '') => {
    if (name !== name.toLocaleUpperCase('fr-FR')) return name;
    const lower = name.replace(/\p{L}+/gu, word => (word.length <= 3 && !SMALL.test(word.toLocaleLowerCase('fr-FR')) && !/[aeiouyàâéèêëîïôöûü]/i.test(word.slice(1))) ? word : word.toLocaleLowerCase('fr-FR'));
    return lower.charAt(0).toLocaleUpperCase('fr-FR') + lower.slice(1);
  };
  function normalized(project) {
    try { return normalizeHouseData(JSON.parse(JSON.stringify({ ...project, config: { ...HOUSE_DEFAULT_CONFIG, ...project.config } }))); }
    catch { return null; }
  }
  function projectSheet(project, data) {
    const section = el('project-sheet');
    const meta = project?.meta || {};
    const concept = String(meta.concept || '').trim();
    el('sheet-concept').textContent = concept || String(meta.subtitle || '').trim();
    el('sheet-concept-block').hidden = !el('sheet-concept').textContent;
    const rooms = data?.rooms || [];
    const levels = new Set(rooms.map(r => r.level)).size;
    const annex = rooms.filter(r => !r.habitable).reduce((s, r) => s + r.area, 0);
    const updated = Date.parse(meta.updated);
    const rows = [
      ['Lieu', meta.location], ['Maître d’ouvrage', meta.client], ['Maître d’œuvre', meta.architect], ['Phase', PHASES[meta.phase] || meta.phase],
      ['Surface habitable', data?.totals?.habitable ? `${number.format(data.totals.habitable)} m²` : ''],
      ['Annexes', annex ? `${number.format(annex)} m²` : ''],
      ['Pièces de vie', String(rooms.filter(r => r.habitable).length || '')],
      ['Niveaux', levels === 1 ? 'Plain-pied' : levels > 1 ? `R+${levels - 1}` : ''],
      ['Mise à jour', Number.isFinite(updated) ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(updated) : '']
    ].filter(([, value]) => value && String(value).trim());
    el('sheet-facts').replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
    section.hidden = !rows.length && !el('sheet-concept').textContent;
  }
  /** Plan du niveau principal à proportions exactes (unités SVG = mètres). */
  function planFigure(data, slug) {
    const host = el('plan-figure');
    host.replaceChildren();
    el('plan-section').hidden = true;
    if (!data?.walls?.length) return;
    const ground = Math.min(...data.walls.map(w => w.level));
    const walls = data.walls.filter(w => w.level === ground), rooms = data.rooms.filter(r => r.level === ground);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    walls.forEach(w => { add(...w.from); add(...w.to); });
    rooms.forEach(r => { add(r.bounds.xMin, r.bounds.zMin); add(r.bounds.xMax, r.bounds.zMax); });
    const pad = 0.8;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `${x0 - pad} ${z0 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}`);
    svg.setAttribute('role', 'img');
    const node = (tag, attrs, text) => {
      const n = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text) n.textContent = text;
      svg.append(n);
      return n;
    };
    rooms.forEach(r => {
      const pts = r.poly || [[r.bounds.xMin, r.bounds.zMin], [r.bounds.xMax, r.bounds.zMin], [r.bounds.xMax, r.bounds.zMax], [r.bounds.xMin, r.bounds.zMax]];
      node('polygon', { points: pts.map(p => p.join(',')).join(' '), class: r.habitable ? 'plan-room' : 'plan-annex' });
    });
    walls.forEach(w => {
      const ux = (w.to[0] - w.from[0]) / w.length, uz = (w.to[1] - w.from[1]) / w.length;
      const at = s => [w.from[0] + ux * s, w.from[1] + uz * s];
      let last = 0;
      const solid = (s, e) => { const [a, b] = at(s), [c, d] = at(e); node('line', { x1: a, y1: b, x2: c, y2: d, class: 'plan-wall', 'stroke-width': w.thick || 0.2 }); };
      w.openings.forEach(op => {
        const s = Math.max(0, op.at - op.w / 2), e = Math.min(w.length, op.at + op.w / 2);
        if (s > last) solid(last, s);
        if (op.type === 'window' || op.type === 'bay') { const [a, b] = at(s), [c, d] = at(e); node('line', { x1: a, y1: b, x2: c, y2: d, class: 'plan-glass' }); }
        last = Math.max(last, e);
      });
      if (last < w.length) solid(last, w.length);
    });
    rooms.forEach(r => {
      if ((r.bounds.xMax - r.bounds.xMin) < 1.6) return; // pièce trop étroite pour une étiquette lisible
      node('text', { x: r.center.x, y: r.center.z - 0.05, class: 'plan-label' }, roomName(r.name));
      node('text', { x: r.center.x, y: r.center.z + 0.38, class: 'plan-area' }, `${number.format(r.area)} m²`);
    });
    const habitable = data.totals.habitable;
    svg.setAttribute('aria-label', `Plan ${ground ? `de l’étage ${ground}` : 'du rez-de-chaussée'} : ${rooms.length} espaces, ${number.format(habitable)} m² habitables.`);
    host.append(svg);
    el('plan-caption').textContent = `Fig. — Plan ${ground ? `de l’étage ${ground}` : 'du rez-de-chaussée'} · ${number.format(x1 - x0)} × ${number.format(z1 - z0)} m · ${number.format(habitable)} m² habitables`;
    el('plan-enter').href = viewerLink(slug);
    el('plan-section').hidden = false;
  }
  function signature(project) {
    const meta = project?.meta || {};
    const parts = [meta.architect, meta.location].map(v => String(v || '').trim()).filter(Boolean);
    el('footer-architect').textContent = parts.join(' · ');
    const contact = String(meta.contact || '').trim();
    const link = el('footer-contact');
    link.hidden = !contact;
    if (contact) {
      link.textContent = contact;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) link.href = `mailto:${contact}`;
      else if (/^\+?[\d\s.-]{6,}$/.test(contact)) link.href = `tel:${contact.replace(/[\s.-]/g, '')}`;
      else link.removeAttribute('href');
    }
    el('footer-signature').hidden = !parts.length && !contact;
  }

  async function loadProject(item) {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    selectProject(item.slug);
    setName(item.name);
    el('cover-description').textContent = 'Du dessin à l’espace : découvrez le projet à votre rythme dans la maquette interactive.';
    status.textContent = '';
    cover.setAttribute('aria-busy', 'true');
    cover.dataset.art = 'loading';
    renderViews([]);
    el('cover-empty').hidden = true;
    projectDrawing([]);
    projectFacts(null);
    projectSheet(null, null);
    planFigure(null, item.slug);
    signature(null);
    const [model, gallery] = await Promise.allSettled([
      json(`projects/${item.slug}/project.json`, controller.signal),
      json(`api/gallery/media?project=${item.slug}`, controller.signal)
    ]);
    if (controller.signal.aborted) return;
    cover.removeAttribute('aria-busy');
    cover.dataset.art = 'ready';
    if (model.status === 'fulfilled') {
      const project = model.value;
      if (typeof project?.meta?.subtitle === 'string' && project.meta.subtitle.trim()) el('cover-description').textContent = project.meta.subtitle;
      projectDrawing(project?.walls);
      projectFacts(project);
      const data = normalized(project);
      projectSheet(project, data);
      planFigure(data, item.slug);
      signature(project);
    } else status.textContent = 'Les informations du projet sont indisponibles pour le moment.';
    renderViews(gallery.status === 'fulfilled' ? makeViews(gallery.value, item.slug) : []);
    if (gallery.status === 'rejected') el('cover-empty').textContent = 'Les rendus sont momentanément indisponibles. Vous pouvez toujours ouvrir la maquette.';
    else el('cover-empty').textContent = 'Aucun rendu publié. Explorez le plan et les volumes dans la maquette.';
  }

  el('cover-prev').addEventListener('click', () => void showView(current - 1));
  el('cover-next').addEventListener('click', () => void showView(current + 1));
  json('api/projects').then(items => {
    const projects = items.filter(item => slugPattern.test(item.slug) && typeof item.name === 'string');
    if (!projects.length) { el('cover-empty').hidden = false; status.textContent = 'Aucun dossier disponible.'; return; }
    const asked = context?.project || url.searchParams.get('project');
    const item = projects.find(project => project.slug === asked) || projects.find(project => project.default) || projects[0];
    select.replaceChildren(...projects.map(project => new Option(nameForDisplay(project.name), project.slug)));
    select.value = item.slug;
    el('home-picker').hidden = projects.length < 2;
    select.addEventListener('change', () => {
      const target = projects.find(project => project.slug === select.value);
      if (!target) return;
      const href = new URL('accueil.html', url);
      href.searchParams.set('project', target.slug);
      history.replaceState(null, '', href);
      void loadProject(target);
    });
    return loadProject(item);
  }).catch(() => {
    el('cover-empty').hidden = false;
    status.textContent = 'Les dossiers n’ont pas pu être chargés. Relancez le serveur Node ou ouvrez la maquette directement.';
  });
})();
