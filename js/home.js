/** Couverture d’un dossier : mêmes API et périmètre projet que la visite, sans moteur WebGL. */
window.ProjectCoverReady = (() => {
  const url = new URL(location.href);
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
  let projectPresentationOpen = false;
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
    const logo = el('cover-logo');
    const name = el('cover-cabinet-name');
    name.textContent = currentCabinet.name || 'ArchiCam Studio';
    name.hidden = Boolean(currentCabinet.logoUrl);
    logo.hidden = !currentCabinet.logoUrl;
    if (currentCabinet.logoUrl) logo.src = currentCabinet.logoUrl;
    else logo.removeAttribute('src');
    // Le bandeau et le cartouche conservent toujours la marque officielle ; le profil Cabinet
    // ne remplace que la signature propre au projet sur la couverture.
  }
  json('api/cabinet/profile').then(profile => {
    currentCabinet = profile; renderCabinet();
    if (loadedProjectRecord) {
      renderPlanBook(loadedProjectRecord, loadedProjectData, loadedProjectMedia);
      projectSheet(loadedProjectRecord, loadedProjectData);
    }
  }).catch(() => renderCabinet());
  const editionDate = el('cover-edition-date');
  if (editionDate) editionDate.textContent = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  el('home-account').hidden = !context?.role;
  // Retour à l'entrée de l'atelier (studio.html), seulement hors portail : en privé, « / » ouvre la visite.
  const studioLink = el('home-studio');
  if (studioLink) studioLink.hidden = Boolean(context?.role);
  // L’outil de saisie n’apparaît dans l’en-tête que pour l’architecte connecté ; en démo il reste en pied de page.
  el('home-editor').hidden = context?.role !== 'architect';
  const homeDeliverablesBtn = el('home-deliverables');
  if (homeDeliverablesBtn) {
    const isClientRole = Boolean(context?.role && context.role !== 'architect');
    homeDeliverablesBtn.hidden = isClientRole;
    homeDeliverablesBtn.addEventListener('click', () => {
      const dlg = el('dlg-home-deliverables');
      if (!dlg || typeof DeliverableChecklist === 'undefined') return;
      const slug = select?.value || context?.project || url.searchParams.get('project') || '';
      DeliverableChecklist.openDashboard({
        dialogEl: dlg,
        bodyEl: el('dlg-home-deliverables-body'),
        statusEl: el('dlg-home-deliverables-status'),
        slug,
        project: loadedProjectRecord || loadedProjectData,
        cabinet: currentCabinet,
        media: loadedProjectMedia,
        onExport: docId => {
          dlg.close();
          if (docId === 'aps') { location.assign(`editor.html${slug ? `?project=${encodeURIComponent(slug)}` : ''}`); return; }
          if (docId === 'book' && el('workspace-book')) { el('workspace-book').click(); return; }
          location.assign(viewerLink(slug));
        }
      });
    });
  }
  el('footer-editor').hidden = Boolean(context?.role);
  el('home-brand').dataset.view = 'cover';
  el('home-brand').removeAttribute('aria-label');
  el('welcome-present').addEventListener('click', () => {
    projectPresentationOpen = !projectPresentationOpen;
    el('project-sheet').hidden = !projectPresentationOpen;
    el('welcome-present').setAttribute('aria-expanded', String(projectPresentationOpen));
    el('welcome-present-label').textContent = projectPresentationOpen ? 'Fermer la présentation' : 'Présenter le projet';
    el('welcome-present-icon').textContent = projectPresentationOpen ? '↑' : '↓';
    if (projectPresentationOpen) {
      el('project-sheet').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  });

  function viewerLink(project, gallery = false) {
    const link = new URL('index.html', url);
    if (project) link.searchParams.set('project', project);
    if (gallery) link.searchParams.set('galerie', '1');
    return link.pathname + link.search;
  }
  function selectProject(project) {
    window.ProjectWorkspace.setProject(project);
    el('home-brand').href = `/?project=${encodeURIComponent(project)}`;
    el('cover-enter').href = viewerLink(project);
    el('welcome-enter-from-presentation').href = viewerLink(project);
  }
  const nameForDisplay = name => name === name.toLocaleUpperCase('fr-FR')
    ? name.toLocaleLowerCase('fr-FR').replace(/(^|[\s-])\p{L}/gu, start => start.toLocaleUpperCase('fr-FR')) : name;
  function setName(name) {
    const display = nameForDisplay(name);
    title.textContent = display;
    title.toggleAttribute('data-long', display.length > 23);
    document.title = `${display} — ArchiCam Studio`;
  }
  async function json(route, signal) {
    const response = await fetch(route, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  const isGateEligible = item => typeof DeliverableGate === 'undefined' || DeliverableGate.isEligible(item);
  // L’ordre historique reste le repli ; les sélections ne sont appliquées que si éligibles (Porte E).
  const makeViews = (media, slug) => {
    const eligible = ViewOrder.views({ images: media?.images || [], renders: [] }, slug).filter(isGateEligible);
    const published = eligible.filter(view => view.catalog && view.category !== 'plan');
    if (published.length) {
      const automatic = published.slice(0, 3);
      return ViewOrder.selectSlots(automatic, media?.presentation?.slots, published);
    }
    const anyEligible = eligible.filter(view => view.category !== 'plan');
    if (anyEligible.length) return anyEligible.slice(0, 3);
    // Repli garanti : la couverture ne reste jamais sans photo s'il existe une capture 3D locale.
    return ViewOrder.views({ images: [], renders: media?.renders || [] }, slug)
      .filter(view => view.category !== 'plan')
      .slice(0, 3)
      .map(view => ({ ...view, fallbackCover: true }));
  };
  const coverCalm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const COVER_SLIDE_MS = 6500;
  let coverAutoplay = null;
  let coverUserPaused = false;
  let coverHoverPaused = false;

  function stopCoverAutoplay() {
    clearInterval(coverAutoplay);
    coverAutoplay = null;
  }

  function startCoverAutoplay() {
    stopCoverAutoplay();
    if (coverCalm.matches || coverUserPaused || coverHoverPaused || activeViews.length < 2) return;
    coverAutoplay = setInterval(() => void showView(current + 1), COVER_SLIDE_MS);
  }

  function setCoverPaused(paused) {
    coverUserPaused = Boolean(paused);
    const toggle = el('cover-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(coverUserPaused));
      toggle.textContent = coverUserPaused ? '▶' : '❚❚';
      toggle.setAttribute('aria-label', coverUserPaused ? 'Reprendre le défilement automatique' : 'Mettre en pause le défilement');
    }
    if (coverUserPaused) stopCoverAutoplay();
    else startCoverAutoplay();
  }

  /** Nomme le type de planche d'après son intitulé, sans cas particulier par slug. */
  function plateKind(title) {
    const label = String(title || '');
    if (/\btoiture\b/i.test(label)) return 'Plan de toiture';
    if (/\bcoupe\b/i.test(label)) return 'Coupe 2D';
    if (/\bfa[çc]ade\b/i.test(label)) return 'Façade';
    if (/\bmasse\b/i.test(label)) return 'Plan de masse';
    if (/\b(étage|etage|R\+\d)\b/i.test(label)) return 'Plan d’étage';
    if (/\b(rez[- ]de[- ]chaussée|rdc)\b/i.test(label)) return 'Plan RDC';
    if (/\b(fondation|coffrage|structure)\b/i.test(label)) return 'Plan technique';
    return 'Planche du dossier';
  }

  /**
   * Détecte génériquement les planches réellement présentes dans le dossier du projet
   * (`edition.sheets`) et la planche complète de synthèse. Aucun nom de fichier n'est codé
   * en dur : une planche absente est simplement ignorée (vérification HEAD ci-dessous),
   * pour ne jamais afficher une couverture cassée.
   */
  async function loadShowcasePlates(slug, projectRecord, signal) {
    if (!slug || !slugPattern.test(slug)) return [];
    const existingSheets = (projectRecord?.edition?.sheets || [])
      .map(sheet => {
        const previewPath = typeof sheet.preview === 'string' ? sheet.preview : '';
        const prefix = `projects/${slug}/planches/`;
        // Priorise la planche originale haute définition (planches/edition-art/<fichier>) quand elle existe
        const originalHiRes = previewPath.startsWith(prefix) && !previewPath.slice(prefix.length).includes('/')
          ? `${prefix}edition-art/${previewPath.slice(prefix.length)}`
          : '';
        return {
          file: originalHiRes || sheet.art || previewPath,
          fallback: previewPath || sheet.art || '',
          label: `${sheet.title || 'Planche'} — planche d’origine`,
          kind: plateKind(sheet.title),
          fit: 'contain'
        };
      })
      .filter(item => item.file);

    const candidates = [
      ...existingSheets,
      { file: `projects/${slug}/planches/edition-art/planche-complete.jpg`, label: 'Planche complète — vues, plan et matériaux', kind: 'Planche complète', fit: 'contain' }
    ];
    const checks = await Promise.all(candidates.map(async item => {
      const pathsToTry = item.fallback && item.fallback !== item.file ? [item.file, item.fallback] : [item.file];
      for (const candidatePath of pathsToTry) {
        try {
          const res = await fetch(new URL(candidatePath, url), { method: 'HEAD', cache: 'no-store', signal });
          if (res.ok) {
            return {
              source: candidatePath,
              preview: candidatePath,
              label: item.label,
              alt: item.label,
              kind: item.kind,
              published: true,
              fit: item.fit
            };
          }
        } catch {
          // Essaie le repli si présent
        }
      }
      return null;
    }));
    return checks.filter(Boolean);
  }

  const coverStrip = el('cover-strip');
  const coverLightbox = el('cover-lightbox');
  const coverLightboxImg = el('cover-lightbox-img');
  const coverLightboxTitle = el('cover-lightbox-title');
  const coverLightboxCount = el('cover-lightbox-count');

  function syncCoverLightbox() {
    if (!coverLightbox?.open || !coverLightboxImg || !activeViews.length) return;
    const shot = activeViews[current];
    if (!shot) return;
    coverLightboxImg.src = new URL(shot.source, url).href;
    coverLightboxImg.alt = shot.alt || shot.label || '';
    if (coverLightboxTitle) coverLightboxTitle.textContent = shot.label || 'Visuel du projet';
    if (coverLightboxCount) coverLightboxCount.textContent = `${counter(current + 1)} / ${counter(activeViews.length)}`;
  }

  function openCoverLightbox(index = current) {
    if (!coverLightbox || !coverLightboxImg || !activeViews.length) return;
    stopCoverAutoplay();
    void showView(index);
    const shot = activeViews[(index + activeViews.length) % activeViews.length];
    if (!shot) return;
    coverLightboxImg.src = new URL(shot.source, url).href;
    coverLightboxImg.alt = shot.alt || shot.label || '';
    if (coverLightboxTitle) coverLightboxTitle.textContent = shot.label || 'Visuel du projet';
    if (coverLightboxCount) coverLightboxCount.textContent = `${counter(((index + activeViews.length) % activeViews.length) + 1)} / ${counter(activeViews.length)}`;
    if (!coverLightbox.open) coverLightbox.showModal();
  }

  async function showView(index) {
    if (!activeViews.length) return;
    current = (index + activeViews.length) % activeViews.length;
    const version = ++pictureVersion;
    const shot = activeViews[current];
    const focal = current === 0 ? presentation?.focal : null;
    if (shot.fit === 'contain') cover.dataset.slideFit = 'contain';
    else delete cover.dataset.slideFit;
    if (coverStrip) {
      Array.from(coverStrip.children).forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === current)));
    }
    syncCoverLightbox();
    if (!shot.published && !shot.fallbackCover) {
      image.hidden = true;
      cover.dataset.art = 'ambient';
      el('cover-caption').textContent = shot.label;
      el('cover-number').textContent = `${counter(current + 1)} / ${counter(activeViews.length)}`;
      return;
    }
    const original = new URL(shot.source, url).href;
    const source = new URL(shot.preview || shot.source, url).href;
    el('cover-number').textContent = `${counter(current + 1)} / ${counter(activeViews.length)}`;
    Array.from(views.children).forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    // Réseau lent : un fond architectural abstrait couvre l’attente, sans afficher de dessin de plan.
    const patience = setTimeout(() => { if (version === pictureVersion && cover.dataset.art !== 'photo') cover.dataset.art = 'ambient'; }, 1200);
    try {
      const next = await CoverImage.replace(image, {
        ImageConstructor: Image, source, original, alt: shot.alt, focal,
        isCurrent: () => version === pictureVersion
      });
      if (!next) return;
      image = next;
      cover.dataset.art = 'photo';
      el('cover-caption').textContent = shot.label;
    } catch {
      if (version !== pictureVersion) return;
      image.hidden = true;
      cover.dataset.art = 'ambient';
      el('cover-caption').textContent = 'Visuel du projet indisponible';
    } finally {
      clearTimeout(patience);
    }
  }
  function renderViews(shots) {
    stopCoverAutoplay();
    activeViews = shots;
    pictureVersion++;
    image.hidden = true;
    image.removeAttribute('src');
    delete cover.dataset.slideFit;
    el('cover-caption').textContent = shots.length || cover.dataset.art === 'loading' ? '' : 'Visuel du projet';
    el('cover-index').hidden = shots.length < 2;
    el('cover-empty').hidden = shots.length > 0;
    if (coverStrip) {
      coverStrip.hidden = shots.length < 2;
      coverStrip.replaceChildren(...shots.map((shot, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cover-strip-item';
        btn.setAttribute('aria-pressed', String(i === 0));
        btn.setAttribute('aria-label', `${counter(i + 1)} · ${shot.label}`);
        btn.title = shot.label;
        const img = document.createElement('img');
        img.src = shot.preview || shot.source;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        btn.append(img);
        btn.addEventListener('click', () => {
          void showView(i);
          if (!coverUserPaused) startCoverAutoplay();
        });
        return btn;
      }));
    }
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
        openCoverLightbox(i);
      });
      return button;
    }));
    // Sans photographie disponible, la couverture garde son fond architectural abstrait — jamais un plan.
    if (shots.length) {
      void showView(0);
      startCoverAutoplay();
    } else if (cover.dataset.art !== 'loading') cover.dataset.art = 'ambient';
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
    el('cover-area').hidden = true;
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
    if (area > 0) {
      const value = `${number.format(area)} m²`;
      stats.push([value, 'Surface habitable']);
      el('cover-area').textContent = `${value} habitables`;
      el('cover-area').hidden = false;
    }
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
    // Enveloppe budgétaire : le devis n'est proposé à l'invité que si le partage est explicitement activé
    const devisBtn = el('sheet-export-devis');
    if (devisBtn) {
      const ctx = (typeof window !== 'undefined' && window.PORTAL_CONTEXT) || null;
      const invited = Boolean(ctx && ctx.role && ctx.role !== 'architect');
      devisBtn.hidden = invited && meta.budgetShared !== true;
    }
    const concept = String(meta.concept || '').trim();
    const rooms = data?.rooms || [];
    const levels = new Set(rooms.map(r => r.level)).size;
    const annex = rooms.filter(r => !r.habitable).reduce((s, r) => s + r.area, 0);
    const habitableRooms = rooms.filter(r => r.habitable);
    const plain = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const bedrooms = habitableRooms.filter(r => /chambre|suite/.test(plain(r.name))).length;
    const baths = rooms.filter(r => /salle d.?eau|salle de bain|douche|\bwc\b|toil|sdb/.test(plain(r.name))).length;
    const levelsLabel = levels === 1 ? 'Plain-pied' : levels > 1 ? `R+${levels - 1}` : '';
    // Sans texte d'intention saisi, une phrase tirée du projet lui-même plutôt qu'une formule générique.
    const derived = data?.totals?.habitable
      ? `${levels > 1 ? `Maison ${levelsLabel}` : 'Maison de plain-pied'} de ${number.format(data.totals.habitable)} m² habitables : ${habitableRooms.length} pièces de vie${bedrooms ? `, dont ${bedrooms} chambre${bedrooms > 1 ? 's' : ''}` : ''}${levels > 1 ? `, réparties sur ${levels} niveaux` : ''}${annex ? `, prolongées par ${number.format(annex)} m² d’espaces extérieurs couverts` : ''}.`
      : '';
    el('sheet-concept').textContent = concept || derived || 'Une exploration des volumes, des espaces et des intentions qui donnent au projet son caractère.';
    el('sheet-concept-block').hidden = !el('sheet-concept').textContent;
    const updated = Date.parse(meta.updated);
    let footprint = '';
    try {
      const ground = (data?.walls || []).filter(w => (w.level || 0) === 0);
      const xs = ground.flatMap(w => [w.from[0], w.to[0]]), zs = ground.flatMap(w => [w.from[1], w.to[1]]);
      if (xs.length) footprint = `${number.format(Math.max(...xs) - Math.min(...xs))} × ${number.format(Math.max(...zs) - Math.min(...zs))} m`;
    } catch { /* emprise facultative */ }
    // Deux familles de repères : ce qui identifie le dossier, puis ce qui le mesure.
    const groups = [
      ['Le dossier', [
        ['Lieu', meta.location], ['Référence projet', meta.reference],
        ['Maître d’ouvrage', meta.clientVisible === true ? meta.client : ''],
        ['Architecte responsable', meta.architect || currentCabinet.architect], ['Phase', PHASES[meta.phase] || meta.phase],
        ['Mise à jour', Number.isFinite(updated) ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(updated) : '']
      ]],
      ['Les chiffres', [
        ['Surface habitable', data?.totals?.habitable ? `${number.format(data.totals.habitable)} m²` : ''],
        ['Espaces extérieurs couverts', annex ? `${number.format(annex)} m²` : ''],
        ['Pièces de vie', String(habitableRooms.length || '')],
        ['Chambres', bedrooms ? String(bedrooms) : ''],
        ['Salles d’eau et WC', baths ? String(baths) : ''],
        ['Niveaux', levelsLabel],
        ['Emprise du bâti', footprint],
        ['Hauteur sous plafond', data?.config?.wallHeight ? `${number.format(data.config.wallHeight)} m` : '']
      ]]
    ].map(([title, rows]) => [title, rows.filter(([, value]) => value && String(value).trim())])
      .filter(([, rows]) => rows.length);
    scheduleTable(rooms);
    el('sheet-facts').replaceChildren(...groups.flatMap(([title, rows]) => {
      const heading = document.createElement('dt');
      heading.className = 'sheet-facts-title';
      heading.textContent = title;
      return [heading, ...rows.map(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = value;
        row.append(dt, dd);
        return row;
      })];
    }));
    // Couverture : quatre chiffres clés de même rang (la surface n'est plus isolée dans une pastille).
    const highlights = [
      ['Surface habitable', data?.totals?.habitable ? `${number.format(data.totals.habitable)} m²` : ''],
      ['Extérieurs couverts', annex ? `${number.format(annex)} m²` : ''],
      ['Pièces de vie', String(habitableRooms.length || '')],
      ['Niveaux', levelsLabel]
    ].filter(([, value]) => value);
    el('welcome-stats').replaceChildren(...highlights.map(([label, value]) => {
      const item = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      item.append(dt, dd);
      return item;
    }));
    el('welcome-stats').hidden = !highlights.length;
    section.hidden = !projectPresentationOpen;
  }
  /** Tableau des surfaces : une colonne par niveau, pièces à points de conduite, sous-totaux. */
  function scheduleTable(rooms) {
    const host = el('sheet-schedule-levels'), section = el('sheet-schedule');
    if (!host || !section) return;
    const byLevel = new Map();
    rooms.filter(r => r.area > 0).forEach(r => { const l = Number(r.level) || 0; if (!byLevel.has(l)) byLevel.set(l, []); byLevel.get(l).push(r); });
    const levelName = l => l === 0 ? 'Rez-de-chaussée' : l < 0 ? 'Sous-sol' : `Étage ${l}`;
    host.replaceChildren(...[...byLevel.keys()].sort((a, b) => a - b).map(level => {
      const list = byLevel.get(level).sort((a, b) => Number(b.habitable) - Number(a.habitable) || b.area - a.area);
      const block = document.createElement('div');
      block.className = 'schedule-level';
      const head = document.createElement('h4');
      head.textContent = levelName(level);
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th scope="col">Pièce</th><th scope="col">Surface</th></tr></thead><tbody></tbody><tfoot></tfoot>';
      list.forEach(r => {
        const tr = document.createElement('tr');
        if (!r.habitable) tr.className = 'is-annex';
        const name = document.createElement('th'); name.scope = 'row';
        const label = document.createElement('span'); label.textContent = roomName(r.name);
        name.append(label);
        const area = document.createElement('td'); area.textContent = `${number.format(r.area)} m²`;
        tr.append(name, area);
        table.tBodies[0].append(tr);
      });
      const hab = list.filter(r => r.habitable).reduce((s, r) => s + r.area, 0), ext = list.filter(r => !r.habitable).reduce((s, r) => s + r.area, 0);
      table.tFoot.innerHTML = `<tr><th scope="row">Surface habitable</th><td>${number.format(hab)} m²</td></tr>${ext ? `<tr class="is-annex"><th scope="row">Extérieurs couverts</th><td>${number.format(ext)} m²</td></tr>` : ''}`;
      block.append(head, table);
      return block;
    }));
    section.hidden = !byLevel.size;
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
    return ViewOrder.views({ images: media?.images || [], renders: [] }, slug).filter(isGateEligible);
  }
  function coverCandidate() {
    const reference = presentation.slots?.[0];
    return presentationCatalog.find(view => view.source === reference) || presentationCatalog[0] || makeViews(currentMedia, currentProject)[0];
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
    const bookImages = (media?.images || []).filter(item => item.book === true && isGateEligible(item));
    if (bookImages.length) {
      const item = document.createElement('li'); item.textContent = `${bookImages.length} image${bookImages.length === 1 ? '' : 's'} publiée${bookImages.length === 1 ? '' : 's'} sélectionnée${bookImages.length === 1 ? '' : 's'} en annexe`;
      contents.append(item);
    }
    el('planbook-empty').hidden = contents.children.length > 0;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderEstimate(project, data, slug) {
    const host = el('workspace-estimate-content');
    host.replaceChildren();
    if (!data?.rooms?.length) {
      host.append(element('p', 'Aucune surface exploitable pour établir une estimation.', 'workspace-empty'));
      return;
    }
    const result = CostEstimate.estimate(data, project.estimate);
    const unit = document.createElement('select');
    unit.setAttribute('aria-label', 'Devise de l’estimation');
    unit.append(new Option('FCFA', 'XAF'), new Option('EUR', 'EUR'));
    const estimate = element('div');
    const toolbar = element('div', '', 'workspace-sheet-toolbar');
    const csv = element('button', 'Bordereau CSV · FCFA', 'cover-print');
    csv.type = 'button';
    csv.onclick = () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([CostEstimate.bordereauCSV(result, project.meta?.name)], { type: 'text/csv;charset=utf-8' }));
      link.download = `${slug}-bordereau.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    const xlsxBtn = element('button', 'Exporter Excel (.xlsx)', 'cover-print');
    xlsxBtn.type = 'button';
    xlsxBtn.onclick = () => {
      if (typeof XlsxExport === 'undefined') return;
      void XlsxExport.downloadXlsx({ ...data, meta: project.meta || {}, estimate: project.estimate }, result, { slug });
    };
    toolbar.append(unit, csv, xlsxBtn);
    const variantsBox = element('div', '', 'workspace-variants-compare');
    variantsBox.hidden = true;
    if (typeof VariantComparator !== 'undefined' && slug && slugPattern.test(slug)) {
      fetch(`api/projects/${encodeURIComponent(slug)}/variants`, { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(payload => {
          const A = payload?.variants?.A || null;
          const B = payload?.variants?.B || null;
          if (!A || !B) return;
          const cmp = VariantComparator.compare(A, B);
          const sign = v => (v > 0 ? `+${number.format(v)}` : number.format(v));
          const titleEl = element('h3', `Comparatif Variantes — ${cmp.a.label} vs ${cmp.b.label}`);
          const pair = element('div', '', 'workspace-variants-pair');
          for (const [slot, item, sum] of [['A', A, cmp.a], ['B', B, cmp.b]]) {
            const card = element('div', '', 'workspace-variant-card');
            const heading = element('strong', `Variante ${slot} · ${sum.label}`);
            const svgWrap = element('div', '', 'workspace-variant-svg');
            svgWrap.innerHTML = VariantComparator.miniPlanSVG(item, { width: 300, height: 190 });
            const info = element('p', `${number.format(sum.habitable)} m² habitables · ${CostEstimate.formatXAF(sum.budgetLow)} – ${CostEstimate.formatXAF(sum.budgetHigh)}`, 'workspace-intro');
            card.append(heading, svgWrap, info);
            pair.append(card);
          }
          const deltaText = element('p', `Écart B vs A : ${sign(cmp.deltas.habitable)} m² habitables (${sign(cmp.deltas.habitablePct)} %) · ${sign(cmp.deltas.budgetLow)} FCFA (bas) / ${sign(cmp.deltas.budgetHigh)} FCFA (haut).`, 'workspace-intro');
          variantsBox.replaceChildren(titleEl, pair, deltaText);
          variantsBox.hidden = false;
        })
        .catch(() => { /* variantes facultatives */ });
    }
    function render() {
      const money = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
      const format = value => unit.value === 'EUR' ? `${money.format(value / 655.957)} €` : CostEstimate.formatXAF(value);
      const table = (title, headings, rows) => {
        const frame = element('div', '', 'workspace-table');
        const t = document.createElement('table');
        t.append(element('caption', title));
        const head = t.createTHead().insertRow();
        headings.forEach(label => { const cell = element('th', label); cell.scope = 'col'; head.append(cell); });
        const body = t.createTBody();
        for (const [label, ...values] of rows) {
          const row = body.insertRow();
          const cell = element('th', label); cell.scope = 'row'; row.append(cell);
          values.forEach(value => { row.append(element('td', value)); });
        }
        frame.append(t);
        return frame;
      };
      const notes = element('p', `${result.rate.label} · ${number.format(result.reference)} m² de référence.`, 'workspace-intro');
      const summary = element('div', '', 'workspace-budget');
      summary.append(element('span', 'ENVELOPPE TRAVAUX', 'section-kicker'), element('strong', `${format(result.total.low)} – ${format(result.total.high)}`), notes);
      if (unit.value === 'EUR') summary.append(element('p', 'Conversion indicative : 1 € = 655,957 FCFA.', 'workspace-intro'));
      const ranges = rows => rows.map(row => [row.label, format(row.low), format(row.high)]);
      const works = table('Répartition des travaux', ['Poste', 'Bas', 'Haut'], ranges(result.lots));
      const materials = table('Bordereau d’achats', ['Matériau', 'Quantité', 'Montant'], result.materials.map(row =>
        [row.label, `${number.format(row.quantity)} ${row.unit}`, format(row.cost)]));
      const foot = element('p', `${result.excluded} Le bordereau est un repère d’achat déjà inclus dans le gros œuvre.`, 'workspace-intro');
      estimate.replaceChildren(summary, variantsBox, works);
      if (result.overall) estimate.append(table('Budget global avec annexes', ['Poste', 'Bas', 'Haut'],
        ranges([...result.annexes, { label: 'Total global', ...result.overall }])));
      estimate.append(materials, foot);
    }
    unit.onchange = render;
    host.append(toolbar, estimate);
    render();
  }

  function renderGallery(project, media, slug) {
    const host = el('workspace-gallery-content');
    const studio = el('workspace-studio');
    const lightbox = el('workspace-image-dialog');
    const lightboxBody = el('workspace-image-body');
    lightbox.onclose = () => { lightboxBody.replaceChildren(); };
    studio.hidden = ['read', 'comment'].includes(context?.role);
    host.replaceChildren();
    const append = (source, label, kind, preview = source, video = false) => {
      const anchor = element('a', '', 'workspace-media');
      anchor.href = source;
      anchor.setAttribute('aria-haspopup', 'dialog');
      anchor.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof lightbox.showModal !== 'function') return;
        event.preventDefault();
        const full = element(video ? 'video' : 'img');
        full.src = source;
        if (video) { full.controls = true; full.playsInline = true; }
        else full.alt = label;
        el('workspace-image-title').textContent = label;
        lightboxBody.replaceChildren(full);
        lightbox.showModal();
      });
      const photo = element(video ? 'video' : 'img');
      if (video) { photo.preload = 'none'; if (preview) photo.poster = preview; }
      else { photo.src = preview; photo.alt = ''; photo.loading = 'lazy'; }
      anchor.classList.toggle('workspace-original', kind === 'Document source');
      anchor.append(photo, element('span', kind, 'section-kicker'), element('strong', label));
      host.append(anchor);
    };
    const crop = project?.config?.planImage?.url;
    const cropPrefix = `projects/${slug}/`;
    const cropRel = typeof crop === 'string' && crop.startsWith(cropPrefix) ? crop.slice(cropPrefix.length) : '';
    if (cropRel && !cropRel.includes('..') && /^(?:planches\/)?[a-z\d_-]+\.(?:jpe?g|png|webp)$/i.test(cropRel)) {
      append(crop, 'Plan ou croquis d’origine', 'Document source');
    }
    for (const view of ViewOrder.views({ images: media.images }, slug, Infinity, { keepDuplicates: true }).filter(view => view.catalog && isGateEligible(view))) {
      append(view.source, view.label, 'Rendu publié', view.preview || view.source);
    }
    for (const view of ViewOrder.views({ renders: media.renders }, slug, Infinity, { keepDuplicates: true })) {
      append(view.source, view.label, 'Capture 3D');
    }
    for (const video of media.videos || []) {
      if (typeof video.file !== 'string' || !video.file.startsWith(`projects/${slug}/generated/videos/`)) continue;
      append(video.file, video.label, 'Animation · ouvrir la vidéo', ViewOrder.pathInProject(video.poster, slug), true);
    }
    if (!host.children.length) host.append(element('p', 'Aucun média partagé pour le moment.', 'workspace-empty'));
  }

  function validBookFile(bookFile, slug) {
    if (typeof bookFile !== 'string') return '';
    const prefix = `projects/${slug}/`;
    if (!bookFile.startsWith(prefix) || bookFile.includes('..')) return '';
    const rel = bookFile.slice(prefix.length);
    return /^(?:[a-z\d_-]+\/)*[a-z\d_-]+\.pdf$/i.test(rel) ? bookFile : '';
  }

  function renderEdition(project, slug, host = el('edition-reader'), initial = 0, media = loadedProjectMedia) {
    host.hidden = true; host.replaceChildren();
    if (!project?.edition) return;
    const manifestImages = media?.images || [];
    const sheets = (project.edition.sheets || []).map(sheet => {
      const resolved = typeof DeliverableGate !== 'undefined'
        ? DeliverableGate.resolveSheetSource(sheet, manifestImages)
        : { source: sheet.art || sheet.preview };
      return { ...sheet, resolvedSource: resolved.source || sheet.preview };
    });
    const series = [...sheets, ...(project.edition.photos || [])];
    if (!series.length) return;
    const title = element('h3', project.edition.title || 'Les planches du projet');
    const select = element('select'); select.setAttribute('aria-label', 'Choisir une planche');
    series.forEach((sheet, i) => select.add(new Option(`${counter(i + 1)} · ${sheet.title}`, String(i))));
    const image = element('img'); image.loading = 'lazy';
    const caption = element('figcaption'); caption.setAttribute('aria-live', 'polite');
    const figure = element('figure'); figure.append(image, caption);
    const prev = element('button', 'Précédente'), next = element('button', 'Suivante');
    const safeSlug = String(slug || project.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    const bookFile = validBookFile(project.edition.bookFile, slug);
    let download;
    if (bookFile) {
      download = element('a', 'Télécharger le cahier complet (PDF)');
      download.href = bookFile;
      download.download = `${safeSlug}-cahier-de-plans.pdf`;
    } else {
      download = element('button', 'Exporter le cahier de plans (PDF)');
      download.type = 'button';
      download.onclick = async () => {
        if (typeof PlanBook === 'undefined' || typeof PlanBook.exportBook !== 'function') {
          location.assign(`index.html?project=${encodeURIComponent(slug)}`);
          return;
        }
        download.disabled = true;
        try {
          const cabinet = typeof PdfIdentity !== 'undefined' && typeof PdfIdentity.loadCabinetProfile === 'function'
            ? await PdfIdentity.loadCabinetProfile() : null;
          const bookData = { ...project, meta: { ...(project.meta || {}), slug: safeSlug } };
          await PlanBook.exportBook({ data: bookData, studio: null, cabinet });
        } finally {
          download.disabled = false;
        }
      };
    }
    function show(i) {
      const sheet = series[i]; select.selectedIndex = i;
      image.src = sheet.image || sheet.resolvedSource || sheet.preview;
      image.alt = sheet.title; caption.textContent = `Fig. ${counter(i + 1)} / ${counter(series.length)} — ${sheet.title}`;
      prev.disabled = i === 0; next.disabled = i === series.length - 1;
    }
    prev.onclick = () => show(select.selectedIndex - 1); next.onclick = () => show(select.selectedIndex + 1); select.onchange = () => show(select.selectedIndex);
    const nav = element('div'); nav.append(prev, select, next); host.append(title, nav, figure, download); host.hidden = false; show(initial);
  }
  window.renderProjectEdition = renderEdition;

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
    renderEdition(projectRecord, item.slug, el('edition-reader'), 0, media);
    renderEstimate(projectRecord, projectData, item.slug);
    renderGallery(projectRecord, media, item.slug);
    loadedProjectRecord = projectRecord; loadedProjectData = projectData; loadedProjectMedia = media;
    renderPresentationEditor(media, item.slug);
    const baseViews = makeViews(media, item.slug);
    const showcasePlates = await loadShowcasePlates(item.slug, projectRecord, controller.signal);
    if (controller.signal.aborted) return;
    renderViews([...baseViews, ...showcasePlates]);
    renderPlanBook(projectRecord, projectData, media);
    void loadRevisionsSheet(item.slug, controller.signal);
    if (gallery.status === 'rejected') el('cover-empty').textContent = 'Les rendus sont momentanément indisponibles. Vous pouvez toujours ouvrir la maquette.';
    else el('cover-empty').textContent = 'Aucun visuel publié. Entrez dans le cockpit pour découvrir la maquette.';
    if (location.hash === '#meeting' && typeof window.MeetingMode !== 'undefined' && projectRecord) {
      window.MeetingMode.open({ project: projectRecord, media, slug: item.slug, cabinet: currentCabinet });
    }
  }

  async function loadRevisionsSheet(slug, signal) {
    const section = el('sheet-revisions');
    const list = el('sheet-revisions-list');
    if (!section || !list) return;
    section.hidden = true;
    list.replaceChildren();
    if (!slug || !slugPattern.test(slug)) return;
    try {
      const data = await json(`api/projects/${encodeURIComponent(slug)}/revisions`, signal);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) return;
      const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      [...items].reverse().forEach(rev => {
        const li = document.createElement('li');
        li.className = 'sheet-rev-item';
        const head = element('div', '', 'sheet-rev-head');
        head.append(
          element('span', rev.tag || 'V', 'sheet-rev-tag'),
          element('strong', rev.label || 'Révision'),
          element('span', rev.phase || '', 'sheet-rev-phase'),
          element('time', rev.createdAt ? fmt.format(new Date(rev.createdAt)) : '', 'sheet-rev-date')
        );
        li.append(head);
        if (rev.note) li.append(element('p', rev.note, 'sheet-rev-note'));
        const m = rev.metrics || {};
        const summaryBits = [];
        if (m.habitable) summaryBits.push(`${number.format(m.habitable)} m² habitables`);
        if (m.roomsCount) summaryBits.push(`${m.roomsCount} pièces`);
        if (rev.diff?.habitableDelta) summaryBits.push(`écart ${rev.diff.habitableDelta > 0 ? '+' : ''}${number.format(rev.diff.habitableDelta)} m²`);
        if (summaryBits.length) li.append(element('p', summaryBits.join(' · '), 'sheet-rev-meta'));
        list.append(li);
      });
      section.hidden = false;
    } catch { /* journal facultatif */ }
  }

  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => {
    document.body.dataset.print = button.dataset.print;
    window.print();
  }));
  window.addEventListener('afterprint', () => { delete document.body.dataset.print; });

  el('cover-prev').addEventListener('click', () => { void showView(current - 1); if (!coverUserPaused) startCoverAutoplay(); });
  el('cover-next').addEventListener('click', () => { void showView(current + 1); if (!coverUserPaused) startCoverAutoplay(); });
  el('cover-toggle')?.addEventListener('click', () => setCoverPaused(!coverUserPaused));
  el('cover-expand')?.addEventListener('click', () => openCoverLightbox(current));
  el('cover-lightbox-prev')?.addEventListener('click', () => void showView(current - 1));
  el('cover-lightbox-next')?.addEventListener('click', () => void showView(current + 1));
  el('cover-lightbox-close')?.addEventListener('click', () => coverLightbox?.close());
  coverLightbox?.addEventListener('close', () => { if (!coverUserPaused) startCoverAutoplay(); });
  coverLightbox?.addEventListener('click', event => { if (event.target === coverLightbox) coverLightbox.close(); });
  coverLightbox?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); void showView(current - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); void showView(current + 1); }
  });
  el('sheet-open-deliverables')?.addEventListener('click', () => el('home-deliverables')?.click());
  el('btn-meeting-mode')?.addEventListener('click', () => {
    if (typeof window.MeetingMode === 'undefined' || !loadedProjectRecord) return;
    stopCoverAutoplay();
    window.MeetingMode.open({
      project: loadedProjectRecord,
      media: loadedProjectMedia || currentMedia,
      slug: currentProject || select?.value || '',
      cabinet: currentCabinet
    });
  });
  el('sheet-export-devis')?.addEventListener('click', async () => {
    const btn = el('sheet-export-devis');
    const lib = (typeof window !== 'undefined' && window.DevisPdf) || null;
    if (!lib || typeof lib.exportPDF !== 'function' || !loadedProjectRecord) return;
    btn.disabled = true;
    try {
      const estimate = typeof CostEstimate !== 'undefined' ? CostEstimate.estimate(loadedProjectRecord, loadedProjectRecord.estimate) : null;
      const out = await lib.exportPDF(loadedProjectRecord, estimate, { cabinet: currentCabinet });
      status.textContent = `Devis estimatif téléchargé (${out.pages} page${out.pages > 1 ? 's' : ''}) — montants indicatifs, non contractuels.`;
    } catch (err) {
      status.textContent = `Export du devis impossible : ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
  el('sheet-export-apd')?.addEventListener('click', async () => {
    const btn = el('sheet-export-apd');
    if (typeof ApdDossier === 'undefined' || !loadedProjectRecord) return;
    btn.disabled = true;
    try {
      await ApdDossier.exportPDF({
        project: loadedProjectRecord,
        cabinet: currentCabinet,
        media: loadedProjectMedia || currentMedia
      });
    } catch (err) {
      status.textContent = `Export APD impossible : ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
  cover.addEventListener('pointerenter', () => { coverHoverPaused = true; stopCoverAutoplay(); });
  cover.addEventListener('pointerleave', () => { coverHoverPaused = false; if (!coverUserPaused) startCoverAutoplay(); });
  return json('api/projects').then(items => {
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
      try { localStorage.setItem('lastProject', target.slug); } catch { /* facultatif */ }
      // Changer de maquette démarre un nouveau document ; seules les sections du même projet partagent une scène.
      location.assign(`/?project=${encodeURIComponent(target.slug)}`);
    });
    return loadProject(item);
  }).catch(() => {
    el('cover-empty').hidden = false;
    status.textContent = 'Les dossiers n’ont pas pu être chargés. Relancez le serveur Node ou ouvrez la maquette directement.';
  });
})();
