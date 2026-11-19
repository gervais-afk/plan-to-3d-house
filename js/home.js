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
  el('home-editor').hidden = Boolean(context?.role && context.role !== 'architect');
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
  function pathInProject(value, slug) {
    if (typeof value !== 'string') return null;
    const prefix = `projects/${slug}/generated/`;
    return value.startsWith(prefix) && /^(?:images|renders)\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value.slice(prefix.length)) ? value : null;
  }
  function makeViews(media, slug) {
    const published = (media?.images || []).flatMap(item => {
      const source = pathInProject(item.file, slug);
      if (!source) return [];
      return [{ label: String(item.label || 'Rendu du projet'), source, preview: pathInProject(item.preview, slug), kind: 'Rendu de présentation' }];
    });
    const captures = (media?.renders || []).flatMap(value => {
      const source = pathInProject(value, slug);
      if (!source) return [];
      const caption = source.split('/').pop().split('.')[0].replace(/[-_]+/g, ' ');
      return [{ label: caption[0].toUpperCase() + caption.slice(1), source, kind: 'Capture de la maquette' }];
    });
    return (published.length ? published : captures).slice(0, 3);
  }
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
    try {
      next.src = source;
      try { await next.decode(); }
      catch (error) { if (source === original) throw error; next.src = original; await next.decode(); }
      if (version !== pictureVersion) return;
      next.id = image.id;
      next.alt = '';
      image.replaceWith(next);
      image = next;
      el('cover-caption').textContent = shot.label;
    } catch {
      if (version !== pictureVersion) return;
      image.hidden = true;
      el('cover-caption').textContent = 'Vue indisponible · plan du projet';
    }
  }
  function renderViews(shots) {
    activeViews = shots;
    pictureVersion++;
    image.hidden = true;
    image.removeAttribute('src');
    el('cover-caption').textContent = 'Plan du projet';
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
    if (shots.length) void showView(0);
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
    if (levels.size > 0) stats.push([counter(levels.size), levels.size === 1 ? 'Niveau' : 'Niveaux']);
    for (const [value, label] of stats) {
      const pair = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      pair.append(dt, dd); facts.append(pair);
    }
    facts.hidden = !stats.length;
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
    renderViews([]);
    el('cover-empty').hidden = true;
    projectDrawing([]);
    projectFacts(null);
    const [model, gallery] = await Promise.allSettled([
      json(`projects/${item.slug}/project.json`, controller.signal),
      json(`api/gallery/media?project=${item.slug}`, controller.signal)
    ]);
    if (controller.signal.aborted) return;
    cover.removeAttribute('aria-busy');
    if (model.status === 'fulfilled') {
      const project = model.value;
      if (typeof project?.meta?.subtitle === 'string' && project.meta.subtitle.trim()) el('cover-description').textContent = project.meta.subtitle;
      projectDrawing(project?.walls);
      projectFacts(project);
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
