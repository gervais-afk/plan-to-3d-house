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
  let presentation = { slots: [null, null, null], focal: { x: 50, y: 50 } };
  let presentationCatalog = [];
  let currentMedia = { images: [], renders: [] };
  let currentProject = null;
  let loadedProjectRecord = null;
  let loadedProjectData = null;
  let loadedProjectMedia = null;
  let currentCabinet = { name: '', architect: '', logoUrl: '' };
  const formatDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date) : '';
  };
  function renderCabinet() {
    const logos = [el('cover-logo'), el('planbook-logo')];
    const names = [el('cover-cabinet-name'), el('planbook-cabinet-name')];
    for (const name of names) {
      name.textContent = currentCabinet.name || 'Plan / 3D';
      name.hidden = Boolean(currentCabinet.logoUrl);
    }
    for (const logo of logos) {
      logo.hidden = !currentCabinet.logoUrl;
      if (currentCabinet.logoUrl) logo.src = currentCabinet.logoUrl;
      else logo.removeAttribute('src');
    }
  }
  json('api/cabinet/profile').then(profile => {
    currentCabinet = profile; renderCabinet();
    if (loadedProjectRecord) {
      renderPlanBook(loadedProjectRecord, loadedProjectData, loadedProjectMedia);
      projectSheet(loadedProjectRecord, loadedProjectData);
    }
  }).catch(() => renderCabinet());
  el('cover-edition-date').textContent = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

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
  // L’ordre historique reste le repli ; les sélections ne sont appliquées que si disponibles.
  const makeViews = (media, slug) => {
    const published = ViewOrder.views({ images: media?.images || [], renders: [] }, slug);
    const automatic = published.slice(0, 3);
    return ViewOrder.selectSlots(automatic, media?.presentation?.slots, published);
  };
  async function showView(index) {
    if (!activeViews.length) return;
    current = (index + activeViews.length) % activeViews.length;
    const version = ++pictureVersion;
    const shot = activeViews[current];
    const focal = current === 0 ? presentation.focal : { x: 50, y: 50 };
    image.style.objectPosition = `${focal.x}% ${focal.y}%`;
    if (!shot.published) {
      image.hidden = true;
      cover.dataset.art = 'plan';
      el('cover-caption').textContent = shot.label;
      el('cover-number').textContent = `${counter(current + 1)} / ${counter(activeViews.length)}`;
      return;
    }
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
      ['Lieu', meta.location], ['Référence projet', meta.reference],
      ['Maître d’ouvrage', meta.clientVisible === true ? meta.client : ''],
      ['Architecte responsable', meta.architect || currentCabinet.architect], ['Phase', PHASES[meta.phase] || meta.phase],
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

  function allCandidates(media, slug) {
    return ViewOrder.views({ images: media?.images || [], renders: [] }, slug);
  }
  function coverCandidate() {
    const reference = presentation.slots?.[0];
    return presentationCatalog.find(view => view.source === reference) || ViewOrder.views({ images: currentMedia.images || [], renders: [] }, currentProject, 1)[0] || presentationCatalog[0];
  }
  function updateCropPreview() {
    const shot = coverCandidate();
    const focal = presentation.focal || { x: 50, y: 50 };
    for (const id of ['crop-desktop-image', 'crop-mobile-image']) {
      const img = el(id);
      if (!img) continue;
      img.style.objectPosition = `${focal.x}% ${focal.y}%`;
      if (shot) img.src = shot.preview || shot.source;
      else img.removeAttribute('src');
    }
    el('focal-x-value').value = `${focal.x} %`;
    el('focal-y-value').value = `${focal.y} %`;
    el('focal-x').value = focal.x;
    el('focal-y').value = focal.y;
  }
  function renderPresentationEditor(media, slug) {
    const admin = el('presentation-admin'), retouch = el('retouch-admin');
    const isArchitect = context?.role === 'architect';
    admin.hidden = !isArchitect;
    retouch.hidden = !isArchitect;
    presentation = media.presentation || presentation;
    presentationCatalog = allCandidates(media, slug);
    currentMedia = media;
    currentProject = slug;
    const container = el('presentation-slots');
    container.replaceChildren();
    const labels = ['01 · Couverture', '02 · Vue complémentaire', '03 · Vue complémentaire'];
    for (let index = 0; index < 3; index++) {
      const row = document.createElement('div'); row.className = 'slot-row';
      const label = document.createElement('label'); label.htmlFor = `presentation-slot-${index}`; label.textContent = labels[index];
      const choice = document.createElement('select'); choice.id = `presentation-slot-${index}`;
      choice.append(new Option('Automatique — ordre habituel', ''));
      for (const view of presentationCatalog) choice.append(new Option(view.label, view.source));
      choice.value = presentation.slots?.[index] || '';
      choice.addEventListener('change', () => {
        presentation.slots[index] = choice.value || null;
        updateCropPreview();
        renderViews(ViewOrder.selectSlots(ViewOrder.views(media, slug, 3), presentation.slots, presentationCatalog));
      });
      row.append(label, choice); container.append(row);
    }
    for (const axis of ['x', 'y']) el(`focal-${axis}`).oninput = event => {
      presentation.focal[axis] = Number(event.currentTarget.value);
      updateCropPreview();
      image.style.objectPosition = `${presentation.focal.x}% ${presentation.focal.y}%`;
    };
    el('presentation-save').onclick = async () => {
      const button = el('presentation-save'); button.disabled = true;
      try {
        const response = await fetch(`api/presentation/settings?project=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(presentation) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Enregistrement impossible.');
        presentation = result; el('presentation-status').textContent = 'Sélection, ordre et point focal enregistrés pour ce projet.';
      } catch (error) { el('presentation-status').textContent = error.message; }
      finally { button.disabled = false; }
    };
    updateCropPreview();
    const source = el('retouch-source'); source.replaceChildren();
    const captures = ViewOrder.views({ images: [], renders: media.renders || [] }, slug);
    if (!captures.length) source.append(new Option('Aucune capture disponible', ''));
    for (const view of captures) source.append(new Option(view.label, view.source));
    el('retouch-create').onclick = async () => {
      const button = el('retouch-create'); button.disabled = true;
      try {
        const response = await fetch(`api/presentation/drafts?project=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: source.value, prompt: el('retouch-prompt').value }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Création du brouillon impossible.');
        el('retouch-status').textContent = 'Brouillon simulé créé localement ; aucune image n’a quitté ce serveur.';
        await loadDrafts(slug);
      } catch (error) { el('retouch-status').textContent = error.message; }
      finally { button.disabled = false; }
    };
    if (isArchitect) void loadDrafts(slug);
  }
  async function loadDrafts(slug) {
    const host = el('draft-list'); host.replaceChildren();
    try {
      const { drafts = [] } = await json(`api/presentation/drafts?project=${encodeURIComponent(slug)}`);
      if (!drafts.length) { host.textContent = 'Aucun brouillon privé à examiner.'; return; }
      for (const draft of drafts) {
        const card = document.createElement('article'); card.className = 'draft-card';
        const heading = document.createElement('h3'); heading.textContent = 'Retouche proposée · brouillon';
        const state = document.createElement('span'); state.className = 'draft-state'; state.textContent = 'BROUILLON · NON PUBLIÉ';
        const prompt = document.createElement('p'); prompt.textContent = `${draft.prompt} — ${draft.model}`;
        const pair = document.createElement('div'); pair.className = 'draft-pair';
        for (const [src, label] of [[draft.source, 'Capture source'], [draft.imageUrl, 'Résultat simulé']]) {
          const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
          img.src = src; img.alt = `${label} — comparaison du brouillon`; img.loading = 'lazy'; caption.textContent = label; figure.append(img, caption); pair.append(figure);
        }
        const checklist = document.createElement('div'); checklist.className = 'draft-review';
        const geom = document.createElement('label'), same = document.createElement('label'), checked = document.createElement('input'), unchanged = document.createElement('input');
        checked.type = unchanged.type = 'checkbox'; geom.append(checked, document.createTextNode(' J’ai vérifié portes, fenêtres, poteaux, volumes, toiture et cadrage.'));
        same.append(unchanged, document.createTextNode(' Aucun écart de géométrie : le résultat peut être publié.'));
        const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'primary'; approve.textContent = 'Approuver pour publication';
        approve.addEventListener('click', async () => {
          approve.disabled = true;
          try {
            const response = await fetch(`api/presentation/publish-draft?project=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: draft.id, geometryReviewed: checked.checked, geometryPass: unchanged.checked }) });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Publication refusée.');
            el('retouch-status').textContent = 'Retouche publiée après validation géométrique de l’architecte.';
            await loadDrafts(slug);
          } catch (error) { el('retouch-status').textContent = error.message; approve.disabled = false; }
        });
        checklist.append(geom, same); card.append(heading, state, prompt, pair, checklist, approve); host.append(card);
      }
    } catch { host.textContent = 'Impossible de charger les brouillons privés.'; }
  }
  function renderPlanBook(project, data, media) {
    const bookProject = currentProject;
    const meta = project?.meta || {};
    el('planbook-project').textContent = nameForDisplay(meta.name || 'Projet');
    el('planbook-subtitle').textContent = String(meta.subtitle || '').trim();
    el('planbook-subtitle').hidden = !el('planbook-subtitle').textContent;
    el('planbook-cabinet').textContent = currentCabinet.name || '';
    el('planbook-cabinet-row').hidden = !currentCabinet.name;
    const architect = String(meta.architect || currentCabinet.architect || '').trim();
    el('planbook-architect').textContent = architect;
    el('planbook-architect-row').hidden = !architect;
    const clientVisible = meta.clientVisible === true && String(meta.client || '').trim();
    el('planbook-client').textContent = clientVisible ? String(meta.client).trim() : '';
    el('planbook-client-row').hidden = !clientVisible;
    const reference = String(meta.reference || '').trim();
    el('planbook-reference').textContent = reference;
    el('planbook-reference-row').hidden = !reference;
    const coverSheet = meta.sheets?.[0] || {};
    const revision = String(meta.revision || coverSheet.revision || '').trim();
    el('planbook-revision').textContent = revision;
    el('planbook-revision-row').hidden = !revision;
    const issueDate = formatDate(meta.issueDate || coverSheet.date);
    el('planbook-date').textContent = issueDate;
    el('planbook-date-row').hidden = !issueDate;
    const projectStatus = String(meta.status || coverSheet.status || '').trim();
    el('planbook-status').textContent = projectStatus;
    el('planbook-status-row').hidden = !projectStatus;
    const drawing = el('cover-drawing').querySelector('svg');
    el('planbook-drawing').replaceChildren(...(drawing ? [drawing.cloneNode(true)] : []));
    const contents = el('planbook-contents'); contents.replaceChildren();
    const levels = [...new Set((data?.walls || []).map(wall => Number(wall.level) || 0))].sort((a, b) => a - b);
    for (const level of levels) {
      const item = document.createElement('li');
      const sheet = meta.sheets?.[level] || {};
      const parts = [sheet.number, sheet.title || `Plan du niveau ${level ? `+${level}` : 'principal'}`].filter(Boolean);
      if (sheet.level) parts.push(String(sheet.level));
      if (sheet.revision) parts.push(`Rév. ${sheet.revision}`);
      if (sheet.date) parts.push(formatDate(sheet.date));
      if (sheet.status) parts.push(String(sheet.status));
      parts.push('dessin issu de la maquette · aperçu sans échelle');
      item.textContent = parts.join(' · ');
      contents.append(item);
    }
    const planUrl = project?.config?.planImage?.url;
    if (typeof planUrl === 'string' && planUrl.startsWith(`projects/${currentProject}/`) && !planUrl.split('/').includes('..')) {
      fetch(new URL(planUrl, url), { method: 'HEAD', cache: 'no-store' }).then(response => {
        if (!response.ok || currentProject !== bookProject) return;
        const item = document.createElement('li');
        const sheet = meta.sheets?.[0] || {};
        item.textContent = [sheet.number, sheet.title || 'Plan source importé', sheet.scale ? `échelle déclarée ${sheet.scale}` : 'échelle non renseignée'].filter(Boolean).join(' · ');
        contents.append(item);
        el('planbook-empty').hidden = contents.children.length > 0;
      }).catch(() => {});
    }
    const bookImages = (media?.images || []).filter(item => item.book === true);
    if (bookImages.length) {
      const item = document.createElement('li'); item.textContent = `${bookImages.length} image${bookImages.length === 1 ? '' : 's'} publiée${bookImages.length === 1 ? '' : 's'} sélectionnée${bookImages.length === 1 ? '' : 's'} en annexe`;
      contents.append(item);
    }
    el('planbook-empty').hidden = contents.children.length > 0;
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
    loadedProjectRecord = loadedProjectData = loadedProjectMedia = null;
    el('cover-client').hidden = true;
    el('cover-client').textContent = '';
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
    let projectRecord = null, projectData = null;
    if (model.status === 'fulfilled') {
      projectRecord = model.value;
      if (typeof projectRecord?.meta?.subtitle === 'string' && projectRecord.meta.subtitle.trim()) el('cover-description').textContent = projectRecord.meta.subtitle;
      if (projectRecord?.meta?.clientVisible === true && String(projectRecord.meta.client || '').trim()) {
        el('cover-client').textContent = `Maître d’ouvrage · ${String(projectRecord.meta.client).trim()}`;
        el('cover-client').hidden = false;
      }
      projectDrawing(projectRecord?.walls);
      projectFacts(projectRecord);
      projectData = normalized(projectRecord);
      projectSheet(projectRecord, projectData);
      planFigure(projectData, item.slug);
      signature(projectRecord);
    } else status.textContent = 'Les informations du projet sont indisponibles pour le moment.';
    const media = gallery.status === 'fulfilled' ? gallery.value : { images: [], renders: [], presentation: { slots: [null, null, null], focal: { x: 50, y: 50 } } };
    loadedProjectRecord = projectRecord; loadedProjectData = projectData; loadedProjectMedia = media;
    renderPresentationEditor(media, item.slug);
    renderViews(makeViews(media, item.slug));
    renderPlanBook(projectRecord, projectData, media);
    if (gallery.status === 'rejected') el('cover-empty').textContent = 'Les rendus sont momentanément indisponibles. Vous pouvez toujours ouvrir la maquette.';
    else el('cover-empty').textContent = 'Aucun rendu publié. Explorez le plan et les volumes dans la maquette.';
  }

  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => {
    document.body.dataset.print = button.dataset.print;
    window.print();
  }));
  window.addEventListener('afterprint', () => { delete document.body.dataset.print; });

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
