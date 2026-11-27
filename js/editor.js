/**
 * ÉDITEUR DE PLAN 2D → projet 3D (projects/<slug>/project.json)
 * Calibrage sur l'image du plan, murs aimantés, portes/fenêtres posées sur les murs, pièces,
 * colonnes, auvents, mobilier. Le projet s'ouvre ensuite dans index.html?project=<slug>.
 * Unités : mètres. X = Est, Z = Sud (nord en haut de l'écran).
 */
(() => {
  // ---------------------------------------------------------------------------
  // BIBLIOTHÈQUES
  // ---------------------------------------------------------------------------
  const FALLBACK_FURNITURE = [
    { group: 'Séjour', name: 'Canapé 3 places', symbol: 'sofa', model: 'sofa', w: 2.1, d: 0.92, h: 0.82, color: '#78716a' },
    { group: 'Séjour', name: 'Table basse', symbol: 'coffeeTable', model: 'coffeeTable', w: 1.2, d: 0.65, h: 0.4, color: '#9c7d5a' },
    { group: 'Repas', name: 'Table à manger 6p', symbol: 'diningTable', model: 'diningTable', w: 1.8, d: 0.95, h: 0.76, color: '#8c6b4a' },
    { group: 'Chambre', name: 'Lit double 160', symbol: 'bed', model: 'bed', w: 1.65, d: 2.05, h: 0.52, color: '#dcd6cd' },
    { group: 'Eau', name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', w: 0.4, d: 0.66, h: 0.78, color: '#f6f6f4' }
  ];
  const FURNITURE = (typeof Furniture2D !== 'undefined' && Array.isArray(Furniture2D.CATALOG) && Furniture2D.CATALOG.length)
    ? Furniture2D.CATALOG
    : FALLBACK_FURNITURE;
  const FLOORS = { parquet: 'Parquet', tiles: 'Carrelage', stone: 'Pierre / dallage', concrete: 'Béton' };
  const FLOOR_COLORS = { parquet: 'rgba(201,160,110,0.32)', tiles: 'rgba(170,185,195,0.35)', stone: 'rgba(190,180,160,0.38)', concrete: 'rgba(160,160,160,0.3)' };
  const OPENINGS = {
    door: { type: 'door', w: 0.85, h: 2.1, sill: 0, hinge: 'start', side: 1 },
    window: { type: 'window', w: 1.2, h: 1.25, sill: 0.95 },
    open: { type: 'open', w: 1.4, h: 2.4, sill: 0 }
  };
  const HINTS = {
    select: 'Cliquez un élément pour le modifier · glissez pour déplacer · poignée circulaire pour pivoter un meuble',
    annotate: 'Cliquez sur une pièce ou un mur pour épingler une remarque (synchronisée avec la 3D et le portail client)',
    calibrate: 'Cliquez les deux extrémités d\'une cote connue du plan (loupe active), puis saisissez sa longueur réelle',
    'verify-scale': 'Contrôle : cliquez les deux extrémités d\'une 2ᵉ cote connue (loupe active) pour vérifier l\'échelle (alerte > 1 %)',
    rectify: 'Redressement 4 points : cliquez les 4 coins du cadre/plan dans l\'ordre (haut-gauche, haut-droite, bas-droite, bas-gauche)',
    'wall-ext': 'Cliquez point après point · tapez une longueur (ex. 4.5) + Entrée · Échap ou double-clic pour terminer · Alt : biais',
    'wall-int': 'Cliquez point après point · tapez une longueur (ex. 3.2) + Entrée · Échap ou double-clic pour terminer · Alt : biais',
    door: 'Cliquez sur un mur pour poser une porte · ensuite H inverse les gonds, J le sens d\'ouverture',
    window: 'Cliquez sur un mur pour poser une fenêtre',
    open: 'Cliquez sur un mur pour un passage libre (sans porte)',
    room: 'Glissez un rectangle pour créer une pièce (nom, sol et surface dans le panneau)',
    'room-auto': 'Cliquez à l\'intérieur d\'un espace fermé par des murs : la pièce (même en L) est détectée automatiquement',
    'room-poly': 'Cliquez les sommets de la pièce · cliquez le premier point, Entrée ou double-clic pour fermer · Alt : côté en biais',
    column: 'Cliquez pour poser une colonne ou un poteau',
    slab: 'Glissez un rectangle pour un auvent en dalle (porche)',
    stairwell: 'Sur Étage 1, glissez un rectangle pour réserver la trémie dans la dalle intermédiaire',
    pergola: 'Glissez un rectangle pour une pergola à lames',
    furniture: 'Choisissez un meuble à droite puis cliquez pour poser · Aimantation murs auto (Maj pour libérer) · R : +15° · Maj+R : −15°',
    camera: 'Glissez une caméra pour la déplacer, son losange pour l\'orienter · clic dans le vide : nouvelle étape · Suppr : retirer',
    measure: 'Cliquez deux points pour mesurer une distance exacte · Échap pour effacer'
  };
  const customOverlays = [];
  const customClickHandlers = [];

  // ---------------------------------------------------------------------------
  // ÉTAT
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('ed-canvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let cabinetProfile = { name: '', architect: '', logoUrl: '' };
  let pendingCabinetLogo;

  const S = {
    p: null,              // projet en cours d'édition
    extras: null,         // données conservées telles quelles (caméras réglées à la main, etc.)
    keepExtras: false,
    planImg: null,
    planDataUrl: null,    // image importée pas encore enregistrée
    planOpacity: 0.55,
    view: { scale: 45, ox: 0, oy: 0 },
    tool: 'select',
    draft: null,
    sel: null,            // { kind, obj, wall? }
    drag: null,
    hover: null,
    libItem: FURNITURE[0],
    undo: [],
    redo: [],
    dirty: false,
    space: false,
    activeLevel: 0,
    levelData: {},
    ghostLevel: true,
    showDims: true,
    showGrid: true,
    snapEnabled: true,
    wallSnapFurniture: true,
    placeRotY: 0,
    measurePts: null,
    typedLength: '',
    panelTab: 'inspect',
    libQuery: '',
    libGroup: 'Tous',
    guides: [],
    pendingDraft: null,
    lastShiftKey: false
  };

  const LEVEL_ARRAYS = ['walls', 'rooms', 'columns', 'canopies', 'furniture', 'stairwells'];
  function levelMeta(level) {
    return { id: level, name: level === 0 ? 'Rez-de-chaussée' : `Étage ${level}`, elevation: level * (S.p && S.p.config.floorHeight || 3) };
  }
  function switchLevel(level, markDirty = false) {
    level = Number(level) || 0;
    if (level < 0 || level > 1 || level === S.activeLevel || !S.p) return;
    if (S.p.config.planImages && typeof S.p.config.planImages === 'object') {
      S.p.config.planImages[String(S.activeLevel)] = S.p.config.planImage || null;
      if (S.planDataUrl) {
        S.levelPlanDataUrls = S.levelPlanDataUrls || {};
        S.levelPlanDataUrls[String(S.activeLevel)] = S.planDataUrl;
      }
    }
    LEVEL_ARRAYS.forEach(key => { S.levelData[S.activeLevel][key] = S.p[key] || []; });
    if (!S.levelData[level]) S.levelData[level] = Object.fromEntries(LEVEL_ARRAYS.map(key => [key, []]));
    S.activeLevel = level;
    LEVEL_ARRAYS.forEach(key => { S.p[key] = S.levelData[level][key] || (S.levelData[level][key] = []); });
    if (S.p.config.planImages && typeof S.p.config.planImages === 'object') {
      const nextPlan = S.p.config.planImages[String(level)] || null;
      S.p.config.planImage = nextPlan;
      S.planDataUrl = (S.levelPlanDataUrls && S.levelPlanDataUrls[String(level)]) || null;
      loadPlanImage(nextPlan && nextPlan.url);
    }
    // Les snapshots d'annulation ne contiennent que l'étage actif ; ne pas les rejouer
    // après un changement de niveau sur les tableaux d'un autre étage.
    S.undo = []; S.redo = [];
    S.sel = null; S.draft = null; S.drag = null;
    document.querySelectorAll('.ed-level-tabs [data-level]').forEach(b => {
      const active = Number(b.dataset.level) === level;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    if (markDirty) { S.dirty = true; setSaveState('Modifications non enregistrées'); }
    refreshPanel(); draw();
  }
  function allLevelItems(key) {
    const items = [];
    Object.keys(S.levelData).sort((a, b) => Number(a) - Number(b)).forEach(level => items.push(...(S.levelData[level][key] || [])));
    return items;
  }

  function emptyProject() {
    return {
      meta: { name: 'NOUVEAU PROJET', slug: 'nouveau-projet', subtitle: '' },
      config: { wallHeight: 2.8, floorHeight: 3, planImage: null },
      walls: [], rooms: [], columns: [], canopies: [], furniture: [], stairwells: []
    };
  }

  // ---------------------------------------------------------------------------
  // OUTILS GÉOMÉTRIQUES
  // ---------------------------------------------------------------------------
  const round = (v, s = 0.01) => Math.round(Math.round(v / s) * s * 1000) / 1000;
  const r2 = v => Math.round(v * 100) / 100;
  const wallLen = w => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
  const toScreen = (x, z) => ({ x: x * S.view.scale + S.view.ox, y: z * S.view.scale + S.view.oy });
  const toWorld = (sx, sy) => ({ x: (sx - S.view.ox) / S.view.scale, z: (sy - S.view.oy) / S.view.scale });
  const slugify = s => (s || 'projet').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'projet';

  function projectOnWall(w, pt) {
    const ax = w.from[0], az = w.from[1];
    const dx = w.to[0] - ax, dz = w.to[1] - az;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((pt.x - ax) * dx + (pt.z - az) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    return { t, at: t * Math.sqrt(L2), dist: Math.hypot(pt.x - px, pt.z - pz), x: px, z: pz };
  }

  const roomArea = r => (r.poly ? polygonArea(r.poly) : (r.bounds.xMax - r.bounds.xMin) * (r.bounds.zMax - r.bounds.zMin));
  const roomLabelPoint = r => (r.poly ? polygonLabelPoint(r.poly) : { x: (r.bounds.xMin + r.bounds.xMax) / 2, z: (r.bounds.zMin + r.bounds.zMax) / 2 });
  function polyBounds(poly) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
  }
  function roomPath(r) {
    ctx.beginPath();
    if (r.poly) r.poly.forEach((p, i) => { const s = toScreen(p[0], p[1]); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    else { const p1 = toScreen(r.bounds.xMin, r.bounds.zMin), p2 = toScreen(r.bounds.xMax, r.bounds.zMax); ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); }
    ctx.closePath();
  }

  function nearestWall(pt, maxDist) {
    let best = null;
    S.p.walls.forEach(w => {
      const pr = projectOnWall(w, pt);
      if (pr.dist <= maxDist && (!best || pr.dist < best.pr.dist)) best = { w, pr };
    });
    return best;
  }

  // Aimantation : extrémités de murs, alignements intelligents, grille 5 cm
  function snapPoint(pt, from, opts = {}) {
    let x = pt.x, z = pt.z;
    const guides = [];
    if (opts.free || !S.snapEnabled) {
      if (opts.recordGuides) S.guides = [];
      return { x: r2(x), z: r2(z) };
    }
    const tol = 12 / S.view.scale;
    let snapped = false;
    for (const w of S.p.walls) {
      for (const e of [w.from, w.to]) {
        if (Math.hypot(e[0] - x, e[1] - z) < tol) { x = e[0]; z = e[1]; snapped = true; break; }
      }
      if (snapped) break;
    }
    if (!snapped) {
      x = round(x, 0.05);
      z = round(z, 0.05);
      // alignement sur les extrémités existantes (même X ou même Z)
      for (const w of S.p.walls) for (const e of [w.from, w.to]) {
        if (Math.abs(e[0] - pt.x) < tol) { x = e[0]; guides.push({ axis: 'x', v: e[0], from: e[1], to: pt.z }); }
        if (Math.abs(e[1] - pt.z) < tol) { z = e[1]; guides.push({ axis: 'z', v: e[1], from: e[0], to: pt.x }); }
      }
      // murs orthogonaux par défaut
      if (from && !opts.diagonal) { if (Math.abs(x - from.x) > Math.abs(z - from.z)) z = from.z; else x = from.x; }
    }
    if (opts.recordGuides) S.guides = guides;
    return { x: r2(x), z: r2(z) };
  }

  // ---------------------------------------------------------------------------
  // HISTORIQUE & BROUILLON AUTOMATIQUE
  // ---------------------------------------------------------------------------
  let autoDraftTimer = null;
  function scheduleAutoDraft() {
    clearTimeout(autoDraftTimer);
    autoDraftTimer = setTimeout(() => { void persistAutoDraft(); }, 4000);
  }
  async function persistAutoDraft() {
    if (!S.p || !S.dirty || !allLevelItems('walls').length) return;
    const slug = slugify(S.p.meta?.slug || S.p.meta?.name || 'nouveau-projet');
    const proj = toProjectJson();
    try {
      localStorage.setItem(`archicam_draft_${slug}`, JSON.stringify({ savedAt: new Date().toISOString(), project: proj }));
    } catch { /* quota local facultatif */ }
    if (typeof fetch !== 'function') return;
    try {
      await fetch(`api/projects/${encodeURIComponent(slug)}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: proj })
      });
    } catch { /* brouillon serveur facultatif */ }
  }
  async function clearServerDraft(slug) {
    const clean = slugify(slug || '');
    if (!clean) return;
    try { localStorage.removeItem(`archicam_draft_${clean}`); } catch { /* ignore */ }
    const banner = $('ed-draft-banner');
    if (banner) banner.hidden = true;
    S.pendingDraft = null;
    if (typeof fetch !== 'function') return;
    try {
      await fetch(`api/projects/${encodeURIComponent(clean)}/draft`, { method: 'DELETE' });
    } catch { /* ignore */ }
  }
  async function checkServerDraft(slug, savedUpdated) {
    const banner = $('ed-draft-banner');
    if (!banner || typeof fetch !== 'function') return;
    banner.hidden = true;
    S.pendingDraft = null;
    try {
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/draft`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      const draft = body?.draft;
      if (!draft || !draft.project || !Array.isArray(draft.project.walls) || !draft.project.walls.length) return;
      const draftTime = Date.parse(draft.savedAt || '');
      const savedTime = Date.parse(savedUpdated || '');
      if (Number.isFinite(savedTime) && Number.isFinite(draftTime) && draftTime <= savedTime + 1500) return;
      S.pendingDraft = draft;
      const txt = $('ed-draft-text');
      const when = Number.isFinite(draftTime) ? new Date(draftTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      if (txt) txt.textContent = `Brouillon auto non enregistré${when ? ` (${when})` : ''} : ${draft.wallCount || draft.project.walls.length} murs, ${draft.furnitureCount || 0} meubles.`;
      banner.hidden = false;
    } catch { /* ignore */ }
  }

  function snapshot() { return JSON.stringify(S.p); }
  function commit() {
    setSaveState('Modifications non enregistrées');
    S.undo.push(snapshot());
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
    S.dirty = true;
    scheduleAutoDraft();
  }
  function restore(json) {
    S.p = JSON.parse(json);
    LEVEL_ARRAYS.forEach(key => { S.levelData[S.activeLevel][key] = S.p[key] || []; });
    S.sel = null;
    S.draft = null;
    refreshPanel();
    draw();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); toast('Annulé'); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); toast('Rétabli'); }

  // ---------------------------------------------------------------------------
  // CHARGEMENT
  // ---------------------------------------------------------------------------
  const EDITABLE = ['meta', 'config', 'walls', 'rooms', 'columns', 'canopies', 'furniture', 'stairwells', 'levels', 'tourWaypoints', 'tourPlanVersion', 'estimate'];

  function loadProject(data, { keepExtras = false } = {}) {
    const src = JSON.parse(JSON.stringify(data));
    const p = emptyProject();
    p.meta = Object.assign(p.meta, src.meta || {});
    if (!p.meta.architect && cabinetProfile.architect) p.meta.architect = cabinetProfile.architect;
    if (typeof p.meta.clientVisible !== 'boolean') p.meta.clientVisible = false;
    p.config = Object.assign(p.config, {
      wallHeight: (src.config && src.config.wallHeight) || 2.8,
      floorHeight: (src.config && src.config.floorHeight) || 3,
      planImage: src.config && src.config.planImage || null,
      ...(src.config && src.config.planImages && typeof src.config.planImages === 'object' ? { planImages: JSON.parse(JSON.stringify(src.config.planImages)) } : {})
    });
    if (['hip', 'flat', 'none'].includes(src.config?.roofStyle)) p.config.roofStyle = src.config.roofStyle;
    if (src.config && src.config.elevationEnd) p.config.elevationEnd = src.config.elevationEnd;
    p.walls = (src.walls || []).map(w => {
      const L = wallLen(w);
      const ops = (w.openings || []).slice();
      if (w.opening) ops.push(Object.assign({ at: (w.opening.pos !== undefined ? w.opening.pos : 0.5) * L }, w.opening));
      const level = Math.max(0, Number(w.level) || 0);
      return { from: w.from, to: w.to, thick: w.thick || (w.type === 'ext' ? 0.25 : 0.15), type: w.type || 'int', level,
        openings: ops.map(o => { const c = Object.assign({}, o); delete c.pos; c.level = Math.max(0, Number(c.level === undefined ? level : c.level) || 0); return c; }) };
    });
    p.rooms = (src.rooms || []).map(r => {
      const room = { id: r.id, name: r.name, level: Math.max(0, Number(r.level) || 0), bounds: Object.assign({}, r.bounds), floorType: r.floorType || 'parquet', habitable: r.habitable !== false, desc: r.desc || '' };
      if (Array.isArray(r.poly) && r.poly.length >= 3) { room.poly = r.poly.map(q => [q[0], q[1]]); room.bounds = polyBounds(room.poly); }
      return room;
    });
    p.columns = (src.columns || []).map(c => Object.assign({ level: 0 }, c, { level: Math.max(0, Number(c.level) || 0) }));
    p.canopies = (src.canopies || []).map(c => Object.assign({ level: 0 }, c, { level: Math.max(0, Number(c.level) || 0) }));
    p.stairwells = (src.stairwells || []).map(s => Object.assign({}, s, { level: Math.max(1, Number(s.level) || 1) }));
    p.furniture = (src.furniture || []).map(f => {
      const c = Object.assign({ level: 0 }, f);
      c.level = Math.max(0, Number(c.level) || 0);
      // Compatibilité : les anciens projets stockaient w/d selon les axes du monde.
      // Une rotation par quart de tour échangeait donc les dimensions ; les normaliser une fois
      // dans le repère local conserve leur apparence en 3D tout en autorisant les angles libres.
      if (c.dims !== 'local' && Math.abs(Math.sin(c.rotY || 0)) > 0.5) {
        const w = c.w; c.w = c.d; c.d = w;
      }
      c.dims = 'local';
      c.elev = Math.max(0, r2((f.y !== undefined ? f.y : f.h / 2) - f.h / 2));
      delete c.y;
      return c;
    });

    if (Array.isArray(src.tourWaypoints)) p.tourWaypoints = JSON.parse(JSON.stringify(src.tourWaypoints));
    if (typeof src.tourPlanVersion === 'string' && /^[0-9a-f]{8}$/.test(src.tourPlanVersion)) p.tourPlanVersion = src.tourPlanVersion;
    if (src.estimate && typeof src.estimate === 'object' && !Array.isArray(src.estimate)) p.estimate = src.estimate;
    const levelMetadata = Array.isArray(src.levels) ? src.levels : [];
    S.levelData = { 0: Object.fromEntries(LEVEL_ARRAYS.map(key => [key, []])), 1: Object.fromEntries(LEVEL_ARRAYS.map(key => [key, []])) };
    LEVEL_ARRAYS.forEach(key => (p[key] || []).forEach(item => {
      const level = Math.max(0, Number(item.level) || 0);
      if (!S.levelData[level]) S.levelData[level] = Object.fromEntries(LEVEL_ARRAYS.map(k => [k, []]));
      S.levelData[level][key].push(item);
    }));
    p.levels = levelMetadata.length ? levelMetadata : [levelMeta(0), levelMeta(1)];
    const extras = {};
    Object.keys(src).forEach(k => { if (!EDITABLE.includes(k) && k !== 'totals') extras[k] = src[k]; });
    S.extras = Object.keys(extras).length ? extras : null;
    S.keepExtras = keepExtras && !!S.extras;
    S.p = p;
    S.activeLevel = 0;
    LEVEL_ARRAYS.forEach(key => { S.p[key] = S.levelData[0][key]; });
    S.undo = []; S.redo = []; S.sel = null; S.draft = null; S.dirty = false;
    setSaveState('');
    document.querySelectorAll('.ed-level-tabs [data-level]').forEach(b => {
      const active = Number(b.dataset.level) === 0;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    S.planDataUrl = null;
    S.levelPlanDataUrls = {};
    if (p.config.planImages && !p.config.planImage && p.config.planImages['0']) {
      p.config.planImage = p.config.planImages['0'];
    }
    loadPlanImage(p.config.planImage && p.config.planImage.url);
    fitView();
    refreshPanel();
    draw();
  }

  function loadPlanImage(url) {
    S.planImg = null;
    if (!url) { draw(); return; }
    const img = new Image();
    img.onload = () => {
      S.planImg = img;
      const pi = S.p.config.planImage;
      if (!pi.originPx) pi.originPx = [img.width / 2, img.height / 2];
      if (!pi.pxPerMeter) pi.pxPerMeter = 50;
      if (!S.p.walls.length) fitView();
      refreshPanel();
      draw();
    };
    img.onerror = () => toast('Image du plan introuvable : ' + url, true);
    img.src = url.startsWith('data:') ? url : encodeURI(url);
  }

  function importPlanDataUrl(dataUrl, sourceLabel = 'Plan importé') {
    commit();
    S.planDataUrl = dataUrl;
    const prev = S.p.config.planImage || {};
    S.p.config.planImage = { url: dataUrl, pxPerMeter: prev.pxPerMeter || 50, originPx: null };
    if (S.p.config.planImages && typeof S.p.config.planImages === 'object') {
      S.p.config.planImages[String(S.activeLevel)] = S.p.config.planImage;
      S.levelPlanDataUrls = S.levelPlanDataUrls || {};
      S.levelPlanDataUrls[String(S.activeLevel)] = dataUrl;
    }
    loadPlanImage(dataUrl);
    setTool('calibrate');
    toast(`${sourceLabel} — calibrez maintenant l'échelle sur une cote connue`);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Lecture impossible : ${file?.name || 'fichier'}`));
      reader.readAsDataURL(file);
    });
  }

  async function readPdfAllPages(file, onStatus = () => {}) {
    if (typeof PlanBook !== 'undefined' && typeof PlanBook.readSheets === 'function') {
      return PlanBook.readSheets([file], onStatus);
    }
    if (!window.pdfjsLib) throw new Error('PDF.js local est introuvable (assets/vendor/pdf.min.js).');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        onStatus(`Lecture de « ${file.name} » — page ${n}/${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(4, 2600 / Math.max(base.width, base.height)) });
        const raster = document.createElement('canvas');
        raster.width = Math.round(viewport.width);
        raster.height = Math.round(viewport.height);
        const context = raster.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, raster.width, raster.height);
        await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
        let text = '';
        try { text = (await page.getTextContent()).items.map(item => item.str).join(' '); } catch { /* page scannée */ }
        const data = raster.toDataURL('image/jpeg', 0.86);
        const guess = typeof SheetClassifier !== 'undefined'
          ? SheetClassifier.classify({ text, fileName: file.name })
          : { type: 'autre', level: null, label: file.name, discipline: 'annexe', confidence: 'none', reasons: [], scale: '' };
        pages.push({
          name: file.name, page: n, total: pdf.numPages, width: raster.width, height: raster.height,
          paperMm: { w: base.width * 25.4 / 72, h: base.height * 25.4 / 72 },
          data, thumb: data, text, guess, type: guess.type, level: guess.level, label: guess.label,
          include: true, replaceGenerated: true
        });
      }
    } finally {
      pdf.destroy();
    }
    return pages;
  }

  /**
   * Prépare l'affectation des pages d'un PDF multi-pages :
   * - chaque plan de distribution identifié avec un niveau (0 = RDC, 1 = Étage 1…) est affecté à ce niveau ;
   * - toute autre page (plan de masse, façade, coupe, structure, doublon…) est proposée en planche de référence ;
   * - aucune supposition silencieuse : les pages douteuses ou en conflit sont marquées needsVerification.
   */
  function planPdfImport(pages) {
    const claimedLevels = new Set();
    return (pages || []).map((raw, idx) => {
      const guess = raw.guess || (typeof SheetClassifier !== 'undefined'
        ? SheetClassifier.classify({ text: raw.text || '', fileName: raw.name || '' })
        : { type: raw.type || 'autre', level: raw.level ?? null, label: raw.label || `Page ${idx + 1}`, discipline: 'annexe', confidence: 'none', reasons: [], scale: '' });
      const type = raw.type || guess.type || 'autre';
      const level = raw.level !== undefined ? raw.level : guess.level;
      let action = 'reference';
      let targetLevel = null;
      let needsVerification = guess.confidence === 'low' || guess.confidence === 'none';
      let verifyReason = needsVerification ? 'Type ou niveau incertain — à vérifier' : '';

      if (type === 'distribution' && Number.isInteger(level) && level >= 0 && level <= 1) {
        if (!claimedLevels.has(level)) {
          claimedLevels.add(level);
          action = 'level';
          targetLevel = level;
        } else {
          action = 'reference';
          needsVerification = true;
          verifyReason = `Doublon détecté pour le niveau ${level} — à vérifier`;
        }
      } else if (type === 'distribution' && (level === null || level === undefined)) {
        action = 'reference';
        needsVerification = true;
        verifyReason = 'Niveau non détecté dans le cartouche — à choisir';
      }

      return {
        ...raw,
        page: raw.page || idx + 1,
        total: raw.total || (pages ? pages.length : 1),
        guess,
        type,
        level,
        label: raw.label || guess.label || `Page ${idx + 1}`,
        action,
        targetLevel,
        needsVerification,
        verifyReason
      };
    });
  }

  /**
   * Applique la sélection issue de la galerie PDF multi-pages :
   * - affecte chaque plan de distribution à son niveau dans config.planImages (et config.planImage pour le niveau actif) ;
   * - enregistre les planches de référence (et le PDF source) via POST api/projects/:slug/planches (Lot 3).
   */
  async function applyPdfImportSelection(items, { file = null, pdfDataUrl = null, fetchFn = typeof fetch === 'function' ? fetch : null } = {}) {
    const selected = (items || []).filter(item => item && item.action !== 'ignore');
    const levelItems = selected.filter(item => item.action === 'level' && Number.isInteger(item.targetLevel) && item.targetLevel >= 0);
    const refItems = selected.filter(item => item.action === 'reference');
    const toVerify = selected.filter(item => item.needsVerification).map(item => ({ page: item.page, label: item.label, reason: item.verifyReason || 'À vérifier' }));

    let savedByPage = new Map();
    let savedPlanches = [];
    const slug = slugify(S.p?.meta?.slug || S.p?.meta?.name || '');
    const toArchive = selected; // Archive le PDF d'origine + toutes les pages retenues (niveaux + références)
    if (toArchive.length && fetchFn && slug) {
      const pdfPayload = pdfDataUrl || (file ? await fileToDataUrl(file).catch(() => null) : null);
      if (pdfPayload) {
        try {
          const response = await fetchFn(`api/projects/${encodeURIComponent(slug)}/planches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file?.name || toArchive[0]?.name || 'dossier.pdf',
              pdf: pdfPayload,
              pages: toArchive.map(p => ({
                page: p.page,
                total: p.total,
                image: p.data || p.image,
                width: p.width,
                height: p.height,
                paperMm: p.paperMm || null,
                text: p.text || '',
                guess: p.guess,
                type: p.action === 'level' ? 'distribution' : p.type,
                level: p.action === 'level' ? p.targetLevel : p.level,
                scale: p.scale || p.guess?.scale || '',
                label: p.label,
                include: true,
                replaceGenerated: p.action === 'level'
              }))
            })
          });
          if (response && response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (Array.isArray(payload.items)) {
              savedPlanches = payload.items;
              payload.items.forEach((saved, idx) => {
                const srcPage = toArchive[idx];
                if (srcPage) savedByPage.set(srcPage.page, saved);
              });
            }
          }
        } catch {
          // Mode hors-ligne ou projet non encore enregistré sur disque : l'affectation locale continue.
        }
      }
    }

    commit();
    S.p.config.planImages = S.p.config.planImages && typeof S.p.config.planImages === 'object'
      ? { ...S.p.config.planImages }
      : {};
    S.levelPlanDataUrls = S.levelPlanDataUrls || {};

    const levels = {};
    for (const item of levelItems) {
      const key = String(item.targetLevel);
      const saved = savedByPage.get(item.page);
      const prev = S.p.config.planImages[key] || {};
      const url = saved?.imageUrl || item.data || item.image;
      S.p.config.planImages[key] = {
        url,
        pxPerMeter: prev.pxPerMeter || 50,
        originPx: null,
        calibrated: false,
        sourcePage: item.page,
        sourceName: item.name || ''
      };
      if (!saved?.imageUrl && typeof url === 'string' && url.startsWith('data:')) {
        S.levelPlanDataUrls[key] = url;
      } else {
        delete S.levelPlanDataUrls[key];
      }
      levels[item.targetLevel] = S.p.config.planImages[key];
    }

    const assignedLevelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
    if (assignedLevelKeys.length) {
      const targetActive = levels[S.activeLevel] ? S.activeLevel : assignedLevelKeys[0];
      if (targetActive !== S.activeLevel) {
        switchLevel(targetActive);
      } else {
        S.p.config.planImage = S.p.config.planImages[String(targetActive)];
        S.planDataUrl = S.levelPlanDataUrls[String(targetActive)] || null;
        loadPlanImage(S.p.config.planImage?.url);
      }
      setTool('calibrate');
    }

    const references = refItems.map(item => {
      const saved = savedByPage.get(item.page);
      return {
        page: item.page,
        type: item.type,
        level: item.level,
        label: item.label,
        id: saved?.id || null,
        imageUrl: saved?.imageUrl || null
      };
    });

    refreshPanel();
    draw();
    return { levels, references, savedPlanches, toVerify };
  }

  function openPdfImportDialog(file, pages) {
    const dlg = $('dlg-pdf-import');
    const gallery = $('pdf-import-gallery');
    const summary = $('pdf-import-summary');
    const status = $('pdf-import-status');
    const applyBtn = $('pdf-import-apply');
    const plan = planPdfImport(pages);

    if (!dlg || !gallery) {
      // Repli si la fenêtre n'existe pas dans le DOM
      void applyPdfImportSelection(plan, { file });
      return;
    }

    const renderGallery = () => {
      const levelCount = plan.filter(p => p.action === 'level').length;
      const refCount = plan.filter(p => p.action === 'reference').length;
      const verifyCount = plan.filter(p => p.needsVerification && p.action !== 'ignore').length;
      summary.textContent = `${plan.length} page${plan.length > 1 ? 's' : ''} lue${plan.length > 1 ? 's' : ''} : ${levelCount} plan${levelCount > 1 ? 's' : ''} de niveau, ${refCount} planche${refCount > 1 ? 's' : ''} de référence${verifyCount ? ` (${verifyCount} à vérifier)` : ''}.`;
      gallery.replaceChildren(...plan.map(item => {
        const card = document.createElement('div');
        card.className = 'ed-pdf-card' + (item.action === 'ignore' ? ' is-ignored' : '');
        const img = document.createElement('img');
        img.src = item.thumb || item.data;
        img.alt = `Page ${item.page}`;
        const head = document.createElement('div');
        head.className = 'ed-pdf-card-head';
        const strong = document.createElement('strong');
        strong.textContent = `Page ${item.page}/${item.total}`;
        const meta = document.createElement('span');
        meta.className = 'ed-pdf-card-meta';
        meta.textContent = `${item.label}${item.guess?.scale ? ` · ${item.guess.scale}` : ''}`;
        head.append(strong, meta);
        card.append(img, head);

        if (item.needsVerification) {
          const warn = document.createElement('div');
          warn.className = 'ed-pdf-card-warn';
          warn.textContent = `À vérifier : ${item.verifyReason || 'classement incertain'}`;
          card.append(warn);
        }

        const roleLabel = document.createElement('label');
        roleLabel.textContent = 'Affectation';
        const roleSelect = document.createElement('select');
        [
          ['level', 'Plan de niveau'],
          ['reference', 'Planche de référence'],
          ['ignore', 'Ignorer']
        ].forEach(([val, txt]) => {
          const opt = document.createElement('option');
          opt.value = val; opt.textContent = txt;
          roleSelect.append(opt);
        });
        roleSelect.value = item.action;
        roleSelect.onchange = () => {
          item.action = roleSelect.value;
          if (item.action === 'level' && !Number.isInteger(item.targetLevel)) item.targetLevel = 0;
          if (item.action !== 'level') item.targetLevel = null;
          item.needsVerification = false;
          renderGallery();
        };
        roleLabel.append(roleSelect);
        card.append(roleLabel);

        if (item.action === 'level') {
          const lvlLabel = document.createElement('label');
          lvlLabel.textContent = 'Niveau';
          const lvlSelect = document.createElement('select');
          [['0', 'Rez-de-chaussée (0)'], ['1', 'Étage 1 (1)']].forEach(([val, txt]) => {
            const opt = document.createElement('option');
            opt.value = val; opt.textContent = txt;
            lvlSelect.append(opt);
          });
          lvlSelect.value = String(item.targetLevel ?? 0);
          lvlSelect.onchange = () => {
            item.targetLevel = Number(lvlSelect.value);
            item.level = item.targetLevel;
            renderGallery();
          };
          lvlLabel.append(lvlSelect);
          card.append(lvlLabel);

          if (typeof window !== 'undefined' && window.EditorAI && typeof window.EditorAI.openVectorDialog === 'function') {
            const vecBtn = document.createElement('button');
            vecBtn.type = 'button';
            vecBtn.className = 'ed-pdf-vec-btn';
            vecBtn.textContent = 'Extraire vectoriel (0 $)';
            vecBtn.onclick = () => {
              dlg.close();
              void window.EditorAI.openVectorDialog(item.page);
            };
            card.append(vecBtn);
          }
        }
        return card;
      }));
    };

    status.textContent = '';
    renderGallery();
    const close = () => dlg.close();
    const closeBtn = $('pdf-import-close');
    const cancelBtn = $('pdf-import-cancel');
    if (closeBtn) closeBtn.onclick = close;
    if (cancelBtn) cancelBtn.onclick = close;
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.onclick = async () => {
        applyBtn.disabled = true;
        status.textContent = 'Import des planches et enregistrement des références…';
        try {
          const result = await applyPdfImportSelection(plan, { file });
          const nLevels = Object.keys(result.levels).length;
          const nRefs = result.references.length;
          dlg.close();
          toast(`PDF importé : ${nLevels} niveau${nLevels > 1 ? 'x' : ''} affecté${nLevels > 1 ? 's' : ''}, ${nRefs} planche${nRefs > 1 ? 's' : ''} en référence.`);
        } catch (err) {
          status.textContent = `Import impossible : ${err.message}`;
          applyBtn.disabled = false;
        }
      };
    }
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  async function importPlanFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      try {
        toast('Lecture de toutes les pages du PDF…');
        try {
          S.lastPdfBuffer = await file.arrayBuffer();
          S.lastPdfName = file.name || 'plan.pdf';
        } catch { /* lecture buffer facultative */ }
        const pages = await readPdfAllPages(file, message => toast(message));
        if (!pages.length) throw new Error('Aucune page lisible dans ce PDF.');
        openPdfImportDialog(file, pages);
      } catch (error) {
        toast(`Import PDF impossible : ${error.message}`, true);
      }
      return;
    }
    if (!/^image\/(png|jpeg)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name || '')) {
      toast('Format non pris en charge. Choisissez un PDF, JPG ou PNG.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => importPlanDataUrl(reader.result);
    reader.onerror = () => toast('Lecture du fichier image impossible.', true);
    reader.readAsDataURL(file);
  }

  // Vue : cadrer le projet (ou l'image)
  function fitView() {
    const rect = canvas.getBoundingClientRect();
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
    S.p.walls.forEach(w => { add(w.from[0], w.from[1]); add(w.to[0], w.to[1]); });
    const pi = S.p.config.planImage;
    if (!isFinite(xMin) && S.planImg && pi) {
      const k = pi.pxPerMeter, o = pi.originPx || [S.planImg.width / 2, S.planImg.height / 2];
      add(-o[0] / k, -o[1] / k);
      add((S.planImg.width - o[0]) / k, (S.planImg.height - o[1]) / k);
    }
    if (!isFinite(xMin)) { xMin = zMin = -6; xMax = zMax = 6; }
    const pad = 1.5;
    const sc = Math.min(rect.width / (xMax - xMin + pad * 2), rect.height / (zMax - zMin + pad * 2));
    S.view.scale = Math.max(8, Math.min(200, sc));
    S.view.ox = rect.width / 2 - ((xMin + xMax) / 2) * S.view.scale;
    S.view.oy = rect.height / 2 - ((zMin + zMax) / 2) * S.view.scale;
  }

  // ---------------------------------------------------------------------------
  // DESSIN
  // ---------------------------------------------------------------------------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function wallQuad(w, s, e) {
    const L = wallLen(w) || 1;
    const dx = (w.to[0] - w.from[0]) / L, dz = (w.to[1] - w.from[1]) / L;
    const nx = -dz * w.thick / 2, nz = dx * w.thick / 2;
    const ax = w.from[0] + dx * s, az = w.from[1] + dz * s, bx = w.from[0] + dx * e, bz = w.from[1] + dz * e;
    return [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]].map(p => toScreen(p[0], p[1]));
  }
  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  const isSel = (kind, obj) => S.sel && S.sel.kind === kind && S.sel.obj === obj;

  function label(text, x, y, size = 12, color = '#1d252c', weight = 700) {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw() {
    if (!S.p) return;
    if (typeof syncStatusBar === 'function') syncStatusBar();
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height, k = S.view.scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ece8df';
    ctx.fillRect(0, 0, W, H);

    // Image du plan
    const pi = S.p.config.planImage;
    if (S.planImg && pi && pi.originPx) {
      const tl = toScreen(-pi.originPx[0] / pi.pxPerMeter, -pi.originPx[1] / pi.pxPerMeter);
      ctx.globalAlpha = S.planOpacity;
      ctx.drawImage(S.planImg, tl.x, tl.y, S.planImg.width / pi.pxPerMeter * k, S.planImg.height / pi.pxPerMeter * k);
      ctx.globalAlpha = 1;
    }

    // Grille (1 m, 0,5 m si zoom fort)
    if (S.showGrid) {
      const step = k > 70 ? 0.5 : 1;
      const a = toWorld(0, 0), b = toWorld(W, H);
      ctx.lineWidth = 1;
      for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
        const sx = Math.round(toScreen(x, 0).x) + 0.5;
        ctx.strokeStyle = Math.abs(x % 5) < 1e-6 ? 'rgba(17,24,39,0.16)' : 'rgba(17,24,39,0.06)';
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let z = Math.floor(a.z / step) * step; z <= b.z; z += step) {
        const sy = Math.round(toScreen(0, z).y) + 0.5;
        ctx.strokeStyle = Math.abs(z % 5) < 1e-6 ? 'rgba(17,24,39,0.16)' : 'rgba(17,24,39,0.06)';
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }
    }
    // Origine
    const o = toScreen(0, 0);
    ctx.strokeStyle = 'rgba(23,121,110,0.5)';
    ctx.beginPath(); ctx.moveTo(o.x - 8, o.y); ctx.lineTo(o.x + 8, o.y); ctx.moveTo(o.x, o.y - 8); ctx.lineTo(o.x, o.y + 8); ctx.stroke();

    // Calque fantôme du rez-de-chaussée : rendu seul, exclu du hit-test et de l'aimantation.
    const ghostToggle = $('ed-ghost-toggle');
    S.ghostLevel = !!(ghostToggle && ghostToggle.checked);
    if (S.activeLevel === 1 && S.ghostLevel && S.levelData[0]) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#9a6f2a';
      ctx.lineWidth = 1.5;
      (S.levelData[0].rooms || []).forEach(r => { roomPath(r); ctx.stroke(); });
      (S.levelData[0].walls || []).forEach(w => {
        const a = toScreen(w.from[0], w.from[1]), b = toScreen(w.to[0], w.to[1]);
        ctx.lineWidth = Math.max(2, (w.thick || 0.15) * k);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      ctx.restore();
    }

    // Pièces
    S.p.rooms.forEach(r => {
      roomPath(r);
      ctx.fillStyle = FLOOR_COLORS[r.floorType] || FLOOR_COLORS.parquet;
      ctx.fill();
      ctx.setLineDash(isSel('room', r) ? [] : [4, 3]);
      ctx.strokeStyle = isSel('room', r) ? '#d97706' : 'rgba(17,24,39,0.35)';
      ctx.lineWidth = isSel('room', r) ? 2 : 1;
      ctx.stroke();
      ctx.setLineDash([]);
      if (r.poly && isSel('room', r)) r.poly.forEach(p => { const s = toScreen(p[0], p[1]); ctx.fillStyle = '#d97706'; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
      const area = roomArea(r);
      const lp = roomLabelPoint(r), lc = toScreen(lp.x, lp.z);
      const cx = lc.x, cy = lc.y;
      label(r.name, cx, cy - 7, Math.max(9, Math.min(13, k * 0.28)));
      label(`${area.toFixed(1).replace('.', ',')} m²`, cx, cy + 8, Math.max(8, Math.min(11, k * 0.22)), '#4b5563', 500);
    });

    // Réservation d'escalier au niveau d'étage, affichée en tirets.
    (S.p.stairwells || []).forEach(s => {
      const p1 = toScreen(s.xMin, s.zMin), p2 = toScreen(s.xMax, s.zMax);
      ctx.fillStyle = 'rgba(217,119,6,0.12)'; ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.setLineDash([5, 3]); ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); ctx.setLineDash([]);
      if (HouseAuto.stairFits(s)) {
        // Marches et ligne de foulée avec flèche de montée, comme sur un plan d'architecte.
        const g = HouseAuto.stairGeometry(s, Number(S.p.config.floorHeight) || 3);
        ctx.strokeStyle = 'rgba(180,83,9,0.55)'; ctx.lineWidth = 1;
        [...g.flights.flatMap(f => f.treads), ...g.landings].forEach(r => {
          if (r.poly) { // marche tournante (balancée, hélicoïdale)
            ctx.beginPath();
            r.poly.forEach((p, i) => { const q = toScreen(p[0], p[1]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
            ctx.closePath(); ctx.stroke();
            return;
          }
          const a = toScreen(r.xMin, r.zMin), b = toScreen(r.xMax, r.zMax);
          ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        });
        const pts = g.path.map(p => toScreen(p.x, p.z));
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = 1.5; ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
        const end = pts[pts.length - 1], prev = pts[pts.length - 2], ang = Math.atan2(end.y - prev.y, end.x - prev.x);
        ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - 9 * Math.cos(ang - 0.45), end.y - 9 * Math.sin(ang - 0.45));
        ctx.lineTo(end.x - 9 * Math.cos(ang + 0.45), end.y - 9 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3.5, 0, Math.PI * 2); ctx.fill();
        label('M', pts[0].x, pts[0].y - 10, 9, '#b45309', 700);
      } else label('TRÉMIE TROP PETITE', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 9, '#b91c1c');
    });

    // Auvents / pergolas
    S.p.canopies.forEach(c => {
      const p1 = toScreen(c.xMin, c.zMin), p2 = toScreen(c.xMax, c.zMax);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = isSel('canopy', c) ? '#d97706' : (c.type === 'pergola' ? '#6b4f35' : '#4b5563');
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.setLineDash([]);
      if (c.type === 'pergola') {
        ctx.strokeStyle = 'rgba(107,79,53,0.45)';
        for (let x = c.xMin + 0.15; x < c.xMax - 0.1; x += c.gap || 0.3) {
          const sx = toScreen(x, 0).x;
          ctx.beginPath(); ctx.moveTo(sx, p1.y); ctx.lineTo(sx, p2.y); ctx.stroke();
        }
      }
    });

    // Mobilier : symboles architecturaux CAO 2D réalistes (+ poignée de rotation si sélectionné)
    S.p.furniture.forEach(f => {
      const c = toScreen(f.x, f.z);
      const sel = isSel('furniture', f);
      if (typeof Furniture2D !== 'undefined' && typeof Furniture2D.drawFurniture2D === 'function') {
        Furniture2D.drawFurniture2D(ctx, f, c, k, { selected: sel });
      } else {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(-(f.rotY || 0));
        ctx.fillStyle = (f.color || '#999') + 'cc';
        ctx.strokeStyle = sel ? '#d97706' : 'rgba(17,24,39,0.55)';
        ctx.lineWidth = sel ? 2 : 1;
        ctx.fillRect(-f.w * k / 2, -f.d * k / 2, f.w * k, f.d * k);
        ctx.strokeRect(-f.w * k / 2, -f.d * k / 2, f.w * k, f.d * k);
        ctx.restore();
      }
      if (k > 44 && f.w * k > 44) label(f.name, c.x, c.y + (sel ? -f.d * k * 0.5 - 12 : 0), 9, sel ? '#9a6f2a' : '#26302b', 600);
    });

    // Murs (pleins + ouvertures)
    S.p.walls.forEach(w => {
      const L = wallLen(w);
      const ops = w.openings.slice().sort((p, q) => p.at - q.at);
      let cursor = -w.thick / 2;
      const sel = isSel('wall', w);
      ctx.fillStyle = sel ? '#d97706' : (w.type === 'ext' ? '#22252a' : '#4a4f57');
      ops.forEach(op => {
        const s = op.at - op.w / 2, e = op.at + op.w / 2;
        if (s > cursor) { poly(wallQuad(w, cursor, s)); ctx.fill(); }
        cursor = Math.max(cursor, e);
      });
      if (L + w.thick / 2 > cursor) { poly(wallQuad(w, cursor, L + w.thick / 2)); ctx.fill(); }

      ops.forEach(op => {
        const opSel = isSel('opening', op);
        const q = wallQuad(w, op.at - op.w / 2, op.at + op.w / 2);
        if (op.type === 'window' || op.type === 'bay') {
          poly(q);
          ctx.fillStyle = opSel ? 'rgba(217,119,6,0.5)' : '#dcebf3';
          ctx.fill();
          ctx.strokeStyle = '#3d7fae'; ctx.lineWidth = 1.2; ctx.stroke();
        } else if (op.type === 'open') {
          ctx.setLineDash([3, 3]);
          poly(q); ctx.strokeStyle = opSel ? '#d97706' : 'rgba(17,24,39,0.5)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Porte : arc de débattement
          const dx = (w.to[0] - w.from[0]) / L, dz = (w.to[1] - w.from[1]) / L;
          const nx = -dz, nz = dx;
          const sgn = op.hinge === 'end' ? -1 : 1, side = op.side || 1;
          const hx = op.hinge === 'end' ? op.at + op.w / 2 : op.at - op.w / 2;
          const hX = w.from[0] + dx * hx, hZ = w.from[1] + dz * hx;
          ctx.strokeStyle = opSel ? '#d97706' : (op.entry ? '#9a6f2a' : '#2b3440');
          ctx.lineWidth = opSel || op.entry ? 2 : 1.2;
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const th = (i / 20) * Math.PI / 2;
            const vx = dx * sgn * Math.cos(th) + nx * side * Math.sin(th), vz = dz * sgn * Math.cos(th) + nz * side * Math.sin(th);
            const p = toScreen(hX + vx * op.w, hZ + vz * op.w);
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
          }
          const leaf = toScreen(hX + nx * side * op.w, hZ + nz * side * op.w), hs = toScreen(hX, hZ);
          ctx.lineTo(hs.x, hs.y);
          ctx.stroke();
          ctx.lineWidth = Math.max(2, k * 0.04);
          ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(leaf.x, leaf.y); ctx.stroke();
        }
      });
      if (sel) {
        [w.from, w.to].forEach(e => { const s = toScreen(e[0], e[1]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
        const m = toScreen((w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2);
        label(`${L.toFixed(2)} m`, m.x, m.y - 14, 11, '#d97706');
      }
    });

    // Colonnes
    S.p.columns.forEach(c => {
      const p = toScreen(c.x - c.base / 2, c.z - c.base / 2);
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(p.x, p.y, c.base * k, c.base * k);
      const q = toScreen(c.x - c.size / 2, c.z - c.size / 2);
      ctx.fillStyle = isSel('column', c) ? '#d97706' : '#22252a';
      ctx.fillRect(q.x, q.y, c.size * k, c.size * k);
    });

    if (S.showDims && k >= 18) drawWallDimensions();
    if (S.guides && S.guides.length && (S.draft || S.drag)) drawAlignmentGuides();
    if (S.tool === 'camera' || (S.sel && S.sel.kind === 'camera')) drawCameras();
    if (S.reviewOverlay) drawReviewOverlay();
    drawDraft();
    syncEmptyState();
    syncQuickBar();
    if (window.EditorLive3D && typeof window.EditorLive3D.sync === 'function') window.EditorLive3D.sync();
  }

  function drawWallDimensions() {
    const k = S.view.scale;
    const walls = S.p.walls || [];
    if (!walls.length) return;
    let cx = 0, cz = 0;
    walls.forEach(w => { cx += (w.from[0] + w.to[0]) / 2; cz += (w.from[1] + w.to[1]) / 2; });
    cx /= walls.length; cz /= walls.length;

    ctx.save();
    walls.forEach(w => {
      if (isSel('wall', w)) return;
      const L = wallLen(w);
      if (L < 0.4 || L * k < 34) return;
      if (w.type !== 'ext' && k < 36) return;
      const a = toScreen(w.from[0], w.from[1]);
      const b = toScreen(w.to[0], w.to[1]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenPx = Math.hypot(dx, dy) || 1;
      let nx = -dy / lenPx, ny = dx / lenPx;
      // Oriente la cote vers l'extérieur du centre moyen pour les murs extérieurs
      const midW = { x: (w.from[0] + w.to[0]) / 2, z: (w.from[1] + w.to[1]) / 2 };
      const outDot = (midW.x - cx) * nx + (midW.z - cz) * ny;
      if (w.type === 'ext' && outDot < 0) { nx = -nx; ny = -ny; }
      const off = (w.thick * k) / 2 + (w.type === 'ext' ? 16 : 11);
      const ax = a.x + nx * off, ay = a.y + ny * off;
      const bx = b.x + nx * off, by = b.y + ny * off;

      ctx.strokeStyle = w.type === 'ext' ? 'rgba(34, 42, 38, 0.36)' : 'rgba(74, 79, 87, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      // Petits traits d'attache aux extrémités
      ctx.moveTo(ax - nx * 4, ay - ny * 4); ctx.lineTo(ax + nx * 3, ay + ny * 3);
      ctx.moveTo(bx - nx * 4, by - ny * 4); ctx.lineTo(bx + nx * 3, by + ny * 3);
      ctx.stroke();

      const mx = (ax + bx) / 2 + nx * 8;
      const my = (ay + by) / 2 + ny * 8;
      label(`${L.toFixed(2).replace('.', ',')} m`, mx, my, w.type === 'ext' ? 10 : 9, w.type === 'ext' ? '#2c3530' : '#57605c', 600);
    });
    ctx.restore();
  }

  function drawAlignmentGuides() {
    ctx.save();
    ctx.strokeStyle = 'rgba(179, 134, 70, 0.78)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    S.guides.forEach(g => {
      if (g.axis === 'x') {
        const p1 = toScreen(g.v, g.from), p2 = toScreen(g.v, g.to);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      } else {
        const p1 = toScreen(g.from, g.v), p2 = toScreen(g.to, g.v);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
    });
    ctx.restore();
  }

  function syncEmptyState() {
    const empty = $('ed-empty-start');
    if (!empty) return;
    const hasContent = allLevelItems('walls').length > 0 || allLevelItems('rooms').length > 0 || !!S.planImg;
    empty.hidden = hasContent || S.tool !== 'select';
  }

  function getFurniturePreviewAt(worldPt, opts = {}) {
    const it = S.libItem;
    if (!it || !worldPt) return null;
    const free = !!opts.free;
    let x = worldPt.x, z = worldPt.z, rotY = S.placeRotY || 0, snapped = false;
    if (!free && S.snapEnabled && S.wallSnapFurniture && typeof Furniture2D !== 'undefined' && typeof Furniture2D.snapFurnitureToWall === 'function') {
      const hit = Furniture2D.snapFurnitureToWall(worldPt, it, S.p.walls, 0.48);
      if (hit) { x = hit.x; z = hit.z; rotY = hit.rotY; snapped = true; }
    }
    if (!snapped) {
      const sp = snapPoint(worldPt, null, { free });
      x = sp.x; z = sp.z;
    }
    return { ...it, x: r2(x), z: r2(z), rotY, dims: 'local', snapped };
  }

  function setReviewOverlay(overlay) {
    S.reviewOverlay = overlay || null;
    if (!overlay) S.reviewFocus = null;
    draw();
  }

  function focusWorldPoint(x, z, targetScale = 95) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(S.view.scale, Number(targetScale) || 95);
    S.view.scale = Math.min(240, Math.max(12, scale));
    S.view.x = rect.width / 2 - x * S.view.scale;
    S.view.y = rect.height / 2 - z * S.view.scale;
    S.reviewFocus = { x, z };
    draw();
  }

  function drawReviewOverlay() {
    const ov = S.reviewOverlay;
    if (!ov) return;
    const k = S.view.scale;
    const COLORS = {
      green: { stroke: '#15803d', fill: 'rgba(21,128,61,0.16)' },
      orange: { stroke: '#d97706', fill: 'rgba(217,119,6,0.20)' },
      red: { stroke: '#dc2626', fill: 'rgba(220,38,38,0.22)' },
      muted: { stroke: '#6b7280', fill: 'rgba(107,114,128,0.10)' }
    };
    ctx.save();
    (ov.rooms || []).forEach(r => {
      const palette = COLORS[r.color] || COLORS.green;
      ctx.fillStyle = palette.fill;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = r.color === 'green' ? 1.5 : 2.2;
      ctx.setLineDash(r.color === 'green' ? [5, 3] : [3, 3]);
      if (r.poly && r.poly.length >= 3) {
        ctx.beginPath();
        r.poly.forEach((p, idx) => { const s = toScreen(p[0], p[1]); idx ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (r.bounds) {
        const p1 = toScreen(r.bounds.xMin, r.bounds.zMin);
        const p2 = toScreen(r.bounds.xMax, r.bounds.zMax);
        ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      }
    });
    ctx.setLineDash([]);
    (ov.walls || []).forEach(w => {
      if (!w.from || !w.to) return;
      const palette = COLORS[w.color] || COLORS.green;
      const a = toScreen(w.from[0], w.from[1]);
      const b = toScreen(w.to[0], w.to[1]);
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = Math.max(3.5, (w.thick || 0.2) * k);
      ctx.lineCap = 'round';
      ctx.globalAlpha = w.color === 'muted' ? 0.35 : 0.85;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    (ov.markers || []).forEach(m => {
      if (!m.position || !Number.isFinite(m.position.x) || !Number.isFinite(m.position.z)) return;
      const palette = COLORS[m.color] || COLORS.orange;
      const s = toScreen(m.position.x, m.position.z);
      ctx.fillStyle = palette.fill;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(m.label || m.type, s.x, s.y - 16, 10, palette.stroke, 700);
    });
    if (S.reviewFocus && Number.isFinite(S.reviewFocus.x) && Number.isFinite(S.reviewFocus.z)) {
      const f = toScreen(S.reviewFocus.x, S.reviewFocus.z);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawDraft() {
    const k = S.view.scale;
    const h = S.hover;
    if (S.draft && (S.draft.kind === 'wall' || S.draft.kind === 'calibrate' || S.draft.kind === 'verify-scale') && h) {
      const isCal = S.draft.kind === 'calibrate' || S.draft.kind === 'verify-scale';
      const a = isCal ? S.draft.screenA : toScreen(S.draft.from.x, S.draft.from.z);
      const bpt = isCal ? h.screen : toScreen(h.snap.x, h.snap.z);
      ctx.strokeStyle = S.draft.kind === 'verify-scale' ? '#2563eb' : (S.draft.kind === 'calibrate' ? '#d97706' : 'rgba(23,121,110,0.9)');
      ctx.lineWidth = isCal ? 2 : Math.max(3, (S.tool === 'wall-ext' ? 0.25 : 0.15) * k);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bpt.x, bpt.y); ctx.stroke();
      if (S.draft.kind === 'wall') {
        const L = Math.hypot(h.snap.x - S.draft.from.x, h.snap.z - S.draft.from.z);
        label(`${L.toFixed(2)} m`, (a.x + bpt.x) / 2, (a.y + bpt.y) / 2 - 14, 12, '#9a6f2a');
      }
    }
    if (S.draft && S.draft.kind === 'rectify' && S.draft.pts.length) {
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(37,99,235,0.10)';
      ctx.beginPath();
      S.draft.pts.forEach((p, i) => { const s = toScreen(p.x, p.z); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if (h) ctx.lineTo(h.screen.x, h.screen.y);
      ctx.stroke();
      S.draft.pts.forEach((p, idx) => {
        const s = toScreen(p.x, p.z);
        ctx.fillStyle = '#2563eb';
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
        label(`C${idx + 1}`, s.x + 10, s.y - 10, 11, '#1d4ed8');
      });
    }
    if (S.draft && S.draft.kind === 'poly' && S.draft.pts.length) {
      ctx.strokeStyle = '#9a6f2a'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(23,121,110,0.12)';
      ctx.beginPath();
      S.draft.pts.forEach((p, i) => { const s = toScreen(p[0], p[1]); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if (h) { const last = S.draft.pts[S.draft.pts.length - 1]; const sp = snapPoint(h.world, { x: last[0], z: last[1] }, {}); const s = toScreen(sp.x, sp.z); ctx.lineTo(s.x, s.y); }
      ctx.fill(); ctx.stroke();
      S.draft.pts.forEach(p => { const s = toScreen(p[0], p[1]); ctx.fillStyle = '#9a6f2a'; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
    }
    if (h && S.tool === 'room-auto') {
      ctx.fillStyle = 'rgba(23,121,110,0.85)';
      const s = toScreen(h.world.x, h.world.z);
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (S.draft && S.draft.kind === 'rect' && h) {
      const p1 = toScreen(Math.min(S.draft.from.x, h.snap.x), Math.min(S.draft.from.z, h.snap.z));
      const p2 = toScreen(Math.max(S.draft.from.x, h.snap.x), Math.max(S.draft.from.z, h.snap.z));
      ctx.fillStyle = 'rgba(23,121,110,0.12)';
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeStyle = '#9a6f2a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      const w = Math.abs(h.snap.x - S.draft.from.x), d = Math.abs(h.snap.z - S.draft.from.z);
      label(`${w.toFixed(2)} × ${d.toFixed(2)} m · ${(w * d).toFixed(1)} m²`, (p1.x + p2.x) / 2, p1.y - 12, 11, '#9a6f2a');
    }
    // Aperçu ouverture sur le mur survolé
    if (h && ['door', 'window', 'open'].includes(S.tool)) {
      const nw = nearestWall(h.world, 0.5);
      if (nw) {
        const def = OPENINGS[S.tool];
        const L = wallLen(nw.w);
        const at = Math.max(def.w / 2, Math.min(L - def.w / 2, round(nw.pr.at, 0.05)));
        poly(wallQuad(nw.w, at - def.w / 2, at + def.w / 2));
        ctx.fillStyle = 'rgba(23,121,110,0.55)';
        ctx.fill();
        const m = toScreen(nw.pr.x, nw.pr.z);
        label(`${at.toFixed(2)} m depuis le début du mur`, m.x, m.y - 16, 10, '#9a6f2a', 600);
      }
    }
    if (h && S.tool === 'furniture' && S.libItem) {
      const prev = getFurniturePreviewAt(h.world, { free: S.lastShiftKey });
      if (prev) {
        const c = toScreen(prev.x, prev.z);
        if (typeof Furniture2D !== 'undefined' && typeof Furniture2D.drawFurniture2D === 'function') {
          Furniture2D.drawFurniture2D(ctx, prev, c, k, { ghost: true });
        } else {
          ctx.strokeStyle = '#9a6f2a'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
          ctx.strokeRect(c.x - prev.w * k / 2, c.y - prev.d * k / 2, prev.w * k, prev.d * k);
          ctx.setLineDash([]);
        }
        const deg = Math.round(((prev.rotY || 0) * 180 / Math.PI + 360) % 360);
        label(`${prev.name}${prev.snapped ? ' · Aimanté au mur' : ` · ${deg}°`}`, c.x, c.y - Math.max(prev.w, prev.d) * k * 0.5 - 14, 10, '#9a6f2a', 700);
        if (window.EditorLive3D && typeof window.EditorLive3D.updateGhost === 'function') {
          window.EditorLive3D.updateGhost(prev);
        }
      }
    } else if (window.EditorLive3D && typeof window.EditorLive3D.updateGhost === 'function') {
      window.EditorLive3D.updateGhost(null);
    }
    // Outil Mesurer (X)
    if (S.tool === 'measure' && S.measurePts && S.measurePts.a) {
      const a = S.measurePts.a;
      const b = S.measurePts.b || (h ? h.snap : a);
      const sa = toScreen(a.x, a.z), sb = toScreen(b.x, b.z);
      ctx.save();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.setLineDash([]);
      [sa, sb].forEach(p => { ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill(); });
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
      label(`${dist.toFixed(2).replace('.', ',')} m  (Δx ${dx.toFixed(2)} · Δz ${dz.toFixed(2)})`, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 15, 11, '#9a3412', 700);
      ctx.restore();
    }
    if (h && S.tool !== 'select' && S.tool !== 'furniture') {
      const s = toScreen(h.snap.x, h.snap.z);
      ctx.strokeStyle = '#9a6f2a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.stroke();
    }
    // Loupe de précision lors du calibrage, du contrôle 2e cote ou du redressement 4 points
    if (h && S.planImg && S.p?.config?.planImage && ['calibrate', 'verify-scale', 'rectify'].includes(S.tool)) {
      drawCalibrationLoupe(h);
    }
    for (const fn of customOverlays) {
      try { fn(ctx, toScreen, S); } catch { /* overlay isolé */ }
    }
  }

  function drawCalibrationLoupe(h) {
    const pi = S.p.config.planImage;
    if (!pi || !pi.originPx || !pi.pxPerMeter || !S.planImg) return;
    const imgX = h.world.x * pi.pxPerMeter + pi.originPx[0];
    const imgY = h.world.z * pi.pxPerMeter + pi.originPx[1];
    const radius = 58;
    const zoom = 3;
    const rect = canvas.getBoundingClientRect();
    let cx = h.screen.x + radius + 24;
    let cy = h.screen.y - radius - 24;
    if (cx + radius + 8 > rect.width) cx = h.screen.x - radius - 24;
    if (cy - radius - 8 < 0) cy = h.screen.y + radius + 24;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    const srcHalf = (radius / zoom) * (pi.pxPerMeter / Math.max(1, S.view.scale));
    ctx.drawImage(
      S.planImg,
      imgX - srcHalf, imgY - srcHalf, srcHalf * 2, srcHalf * 2,
      cx - radius, cy - radius, radius * 2, radius * 2
    );
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#1b2320';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // SÉLECTION (test de clic)
  // ---------------------------------------------------------------------------
  function hitTest(pt) {
    const tol = 6 / S.view.scale;
    // Ouvertures
    for (const w of S.p.walls) {
      const pr = projectOnWall(w, pt);
      if (pr.dist > w.thick / 2 + tol) continue;
      for (const op of w.openings) if (Math.abs(pr.at - op.at) <= op.w / 2) return { kind: 'opening', obj: op, wall: w };
    }
    for (const c of S.p.columns) if (Math.abs(pt.x - c.x) <= c.base / 2 && Math.abs(pt.z - c.z) <= c.base / 2) return { kind: 'column', obj: c };
    for (let i = S.p.furniture.length - 1; i >= 0; i--) {
      const f = S.p.furniture[i];
      const dx = pt.x - f.x, dz = pt.z - f.z, r = f.rotY || 0;
      const lx = dx * Math.cos(r) - dz * Math.sin(r);
      const lz = dx * Math.sin(r) + dz * Math.cos(r);
      if (Math.abs(lx) <= f.w / 2 && Math.abs(lz) <= f.d / 2) return { kind: 'furniture', obj: f };
    }
    for (const w of S.p.walls) {
      const pr = projectOnWall(w, pt);
      if (pr.dist <= w.thick / 2 + tol) return { kind: 'wall', obj: w };
    }
    for (const s of S.p.stairwells || []) if (pt.x >= s.xMin && pt.x <= s.xMax && pt.z >= s.zMin && pt.z <= s.zMax) return { kind: 'stairwell', obj: s };
    for (const c of S.p.canopies) if (pt.x >= c.xMin && pt.x <= c.xMax && pt.z >= c.zMin && pt.z <= c.zMax) return { kind: 'canopy', obj: c };
    for (let i = S.p.rooms.length - 1; i >= 0; i--) {
      const r = S.p.rooms[i];
      if (roomContains(r, pt.x, pt.z)) return { kind: 'room', obj: r };
    }
    return null;
  }

  function endpointAt(pt) {
    const tol = 9 / S.view.scale;
    for (const w of S.p.walls) for (const key of ['from', 'to']) {
      const e = w[key];
      if (Math.hypot(e[0] - pt.x, e[1] - pt.z) < tol) return { x: e[0], z: e[1] };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // ACTIONS DE CRÉATION
  // ---------------------------------------------------------------------------
  function addWall(a, b) {
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05) return;
    commit();
    const ext = S.tool === 'wall-ext';
    S.p.walls.push({ from: [a.x, a.z], to: [b.x, b.z], thick: ext ? 0.25 : 0.15, type: ext ? 'ext' : 'int', level: S.activeLevel, openings: [] });
  }

  function addOpening(pt) {
    const nw = nearestWall(pt, 0.5);
    if (!nw) { toast('Cliquez sur un mur', true); return; }
    const def = Object.assign({}, OPENINGS[S.tool]);
    if (S.tool === 'door' && nw.w.type === 'ext' && !nw.w.openings.some(o => o.type === 'door') && !S.p.walls.some(w => w.openings.some(o => o.entry))) {
      def.w = 1.0; def.entry = true; // première porte extérieure = entrée principale
    }
    const L = wallLen(nw.w);
    if (L < def.w + 0.1) { toast('Mur trop court pour cette ouverture', true); return; }
    def.at = r2(Math.max(def.w / 2, Math.min(L - def.w / 2, round(nw.pr.at, 0.05))));
    def.level = S.activeLevel;
    commit();
    nw.w.openings.push(def);
    select({ kind: 'opening', obj: def, wall: nw.w });
  }

  function addRect(a, b) {
    if (S.tool === 'stairwell' && S.activeLevel === 0) { toast('Passez à Étage 1 pour dessiner la trémie', true); return; }
    const xMin = r2(Math.min(a.x, b.x)), xMax = r2(Math.max(a.x, b.x)), zMin = r2(Math.min(a.z, b.z)), zMax = r2(Math.max(a.z, b.z));
    if (xMax - xMin < 0.3 || zMax - zMin < 0.3) return;
    commit();
    if (S.tool === 'room') {
      const n = S.p.rooms.length + 1;
      let id = 'piece-' + n;
      while (allLevelItems('rooms').some(r => r.id === id)) id += 'b';
      const room = { id, name: 'PIÈCE ' + n, level: S.activeLevel, bounds: { xMin, xMax, zMin, zMax }, floorType: 'parquet', habitable: true, desc: '' };
      S.p.rooms.push(room);
      select({ kind: 'room', obj: room });
      setTimeout(() => { const el = document.querySelector('#ed-props input[data-key="name"]'); if (el) { el.focus(); el.select(); } }, 0);
    } else if (S.tool === 'stairwell') {
      const opening = { name: 'Trémie d’escalier', level: S.activeLevel, xMin, xMax, zMin, zMax };
      S.p.stairwells.push(opening);
      select({ kind: 'stairwell', obj: opening });
    } else if (S.tool === 'slab') {
      const c = { name: 'Auvent', type: 'slab', level: S.activeLevel, xMin, xMax, zMin, zMax, y: S.p.config.wallHeight, thick: 0.18, color: '#f1eee8' };
      S.p.canopies.push(c);
      select({ kind: 'canopy', obj: c });
    } else {
      const c = { name: 'Pergola', type: 'pergola', level: S.activeLevel, xMin, xMax, zMin, zMax, y: S.p.config.wallHeight, slat: 0.08, gap: 0.3, color: '#5a4a3a' };
      S.p.canopies.push(c);
      select({ kind: 'canopy', obj: c });
    }
  }

  function nextRoomId() {
    let n = S.p.rooms.length + 1, id = 'piece-' + n;
    while (allLevelItems('rooms').some(r => r.id === id)) id = 'piece-' + (++n);
    return { id, n };
  }

  function simplifyPoly(pts) {
    let out = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
    let changed = true;
    while (changed && out.length > 3) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 1e-6) { out.splice(i, 1); changed = true; break; }
      }
    }
    return out;
  }

  function addPolyRoom(poly) {
    poly = simplifyPoly(poly.map(p => [r2(p[0]), r2(p[1])]));
    if (poly.length < 3 || polygonArea(poly) < 0.5) { toast('Pièce trop petite', true); return null; }
    commit();
    const { id, n } = nextRoomId();
    const b = polyBounds(poly);
    const isRect = poly.length === 4 && poly.every(p => (p[0] === b.xMin || p[0] === b.xMax) && (p[1] === b.zMin || p[1] === b.zMax));
    const room = { id, name: 'PIÈCE ' + n, level: S.activeLevel, bounds: b, floorType: 'parquet', habitable: true, desc: '' };
    if (!isRect) room.poly = poly;
    S.p.rooms.push(room);
    select({ kind: 'room', obj: room });
    setTimeout(() => { const el = document.querySelector('#ed-props input[data-key="name"]'); if (el) { el.focus(); el.select(); } }, 0);
    return room;
  }

  // Détection d'un espace fermé : murs rastérisés (portes comprises), remplissage, contour, recalage sur les axes des murs
  function detectRoomAt(pt) {
    if (!S.p.walls.length) return null;
    const res = 0.05;
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    S.p.walls.forEach(w => [w.from, w.to].forEach(e => { xMin = Math.min(xMin, e[0]); xMax = Math.max(xMax, e[0]); zMin = Math.min(zMin, e[1]); zMax = Math.max(zMax, e[1]); }));
    xMin -= 0.6; zMin -= 0.6; xMax += 0.6; zMax += 0.6;
    if (pt.x < xMin || pt.x > xMax || pt.z < zMin || pt.z > zMax) return null;
    const nx = Math.ceil((xMax - xMin) / res), nz = Math.ceil((zMax - zMin) / res);
    const blocked = new Uint8Array(nx * nz);
    const mark = (x, z) => { const i = Math.floor((x - xMin) / res), j = Math.floor((z - zMin) / res); if (i >= 0 && j >= 0 && i < nx && j < nz) blocked[j * nx + i] = 1; };
    S.p.walls.forEach(w => {
      const L = wallLen(w) || 1, dx = (w.to[0] - w.from[0]) / L, dz = (w.to[1] - w.from[1]) / L;
      const half = Math.max(w.thick / 2, 0.06);
      for (let t = -w.thick / 2; t <= L + w.thick / 2; t += res / 2)
        for (let o = -half; o <= half; o += res / 2) mark(w.from[0] + dx * t - dz * o, w.from[1] + dz * t + dx * o);
    });
    const si = Math.floor((pt.x - xMin) / res), sj = Math.floor((pt.z - zMin) / res);
    if (blocked[sj * nx + si]) return null;
    const filled = new Uint8Array(nx * nz);
    const stack = [sj * nx + si];
    filled[stack[0]] = 1;
    while (stack.length) {
      const c = stack.pop();
      const i = c % nx, j = (c - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) return null; // fuite vers l'extérieur : espace non fermé
      for (const nb of [c - 1, c + 1, c - nx, c + nx]) if (!blocked[nb] && !filled[nb]) { filled[nb] = 1; stack.push(nb); }
    }
    // Arêtes de contour orientées (sens horaire autour de chaque cellule remplie)
    const key = (i, j) => i + ',' + j;
    const out = new Map();
    const addEdge = (a, b) => { const k = key(a[0], a[1]); if (!out.has(k)) out.set(k, []); out.get(k).push(b); };
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      if (!filled[j * nx + i]) continue;
      if (!filled[(j - 1) * nx + i]) addEdge([i, j], [i + 1, j]);
      if (!filled[j * nx + i + 1]) addEdge([i + 1, j], [i + 1, j + 1]);
      if (!filled[(j + 1) * nx + i]) addEdge([i + 1, j + 1], [i, j + 1]);
      if (!filled[j * nx + i - 1]) addEdge([i, j + 1], [i, j]);
    }
    let best = null;
    while (out.size) {
      const [k0, list0] = out.entries().next().value;
      const start = k0.split(',').map(Number);
      const loop = [start];
      let cur = list0.pop();
      if (!list0.length) out.delete(k0);
      let guard = 0;
      while (key(cur[0], cur[1]) !== k0 && guard++ < 200000) {
        loop.push(cur);
        const k = key(cur[0], cur[1]);
        const l = out.get(k);
        if (!l) break;
        const nxt = l.pop();
        if (!l.length) out.delete(k);
        cur = nxt;
      }
      const poly = loop.map(([i, j]) => [xMin + i * res, zMin + j * res]);
      const a = polygonArea(poly);
      if (!best || a > best.a) best = { poly, a };
    }
    if (!best) return null;
    // Recalage des sommets sur les axes des murs voisins (le remplissage s'arrête aux faces des murs)
    const vx = [], hz = [];
    S.p.walls.forEach(w => {
      if (Math.abs(w.from[0] - w.to[0]) < 1e-6) vx.push({ v: w.from[0], t: w.thick });
      if (Math.abs(w.from[1] - w.to[1]) < 1e-6) hz.push({ v: w.from[1], t: w.thick });
    });
    const snapAxis = (v, list) => {
      let bestV = v, bd = Infinity;
      list.forEach(c => { const d = Math.abs(c.v - v); if (d <= c.t / 2 + res * 1.5 && d < bd) { bd = d; bestV = c.v; } });
      return bestV;
    };
    return simplifyPoly(simplifyPoly(best.poly).map(p => [r2(snapAxis(p[0], vx)), r2(snapAxis(p[1], hz))]));
  }

  // ---------------------------------------------------------------------------
  // CAMÉRAS DU PARCOURS (tourWaypoints)
  // ---------------------------------------------------------------------------
  const isEye = wp => wp.pos[1] < 3;
  function generateCameras() {
    const clone = JSON.parse(JSON.stringify(toProjectJson()));
    delete clone.tourWaypoints;
    delete clone.renderShots;
    clone.config = Object.assign({ doorHeight: 2.1, windowHeight: 1.25, windowSill: 0.95 }, clone.config);
    normalizeHouseData(clone);
    HouseAuto.complete(clone);
    return clone.tourWaypoints;
  }
  /** Empreinte actuelle du plan (tous niveaux), à comparer à celle mémorisée avec le parcours. */
  const planVersionNow = () => HouseAuto.geometryVersion(toProjectJson());
  /** 'fresh' : parcours fait sur ce plan ; 'stale' : le plan a changé depuis ; 'unknown' : parcours ancien, jamais daté. */
  function tourState() {
    if (!S.p.tourWaypoints || !S.p.tourWaypoints.length) return 'none';
    if (!S.p.tourPlanVersion) return 'unknown';
    return S.p.tourPlanVersion === planVersionNow() ? 'fresh' : 'stale';
  }
  function setGeneratedTour() {
    S.p.tourWaypoints = generateCameras();
    S.p.tourPlanVersion = planVersionNow();
  }
  function ensureCameras() {
    if (S.p.tourWaypoints && S.p.tourWaypoints.length) return;
    if (!S.p.walls.length) return;
    setGeneratedTour();
  }
  function cameraHandles(wp) {
    const dx = wp.look[0] - wp.pos[0], dz = wp.look[2] - wp.pos[2], l = Math.hypot(dx, dz) || 1;
    const r = Math.min(1.6, Math.max(0.9, l));
    return { pos: { x: wp.pos[0], z: wp.pos[2] }, look: { x: wp.pos[0] + (dx / l) * r, z: wp.pos[2] + (dz / l) * r }, dir: { x: dx / l, z: dz / l } };
  }
  function drawCameras() {
    const list = S.p.tourWaypoints;
    if (!list) return;
    const k = S.view.scale;
    // trajet (étapes à hauteur d'homme)
    ctx.strokeStyle = 'rgba(37,99,235,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    let started = false;
    list.forEach(wp => { if (!isEye(wp)) return; const s = toScreen(wp.pos[0], wp.pos[2]); started ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); started = true; });
    ctx.stroke();
    ctx.setLineDash([]);
    list.forEach((wp, i) => {
      const hnd = cameraHandles(wp);
      const s = toScreen(hnd.pos.x, hnd.pos.z);
      const sel = isSel('camera', wp);
      if (isEye(wp)) {
        // cône de vision
        const half = ((wp.fov || 60) * Math.PI) / 360 * 1.3;
        const ang = Math.atan2(hnd.dir.z, hnd.dir.x);
        ctx.fillStyle = sel ? 'rgba(217,119,6,0.22)' : 'rgba(37,99,235,0.14)';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, 1.3 * k, ang - half, ang + half); ctx.closePath(); ctx.fill();
        const l = toScreen(hnd.look.x, hnd.look.z);
        ctx.strokeStyle = sel ? '#d97706' : '#2563eb'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(l.x, l.y); ctx.stroke();
        ctx.fillStyle = sel ? '#d97706' : '#2563eb';
        ctx.beginPath(); ctx.moveTo(l.x, l.y - 6); ctx.lineTo(l.x + 6, l.y); ctx.lineTo(l.x, l.y + 6); ctx.lineTo(l.x - 6, l.y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 10px Inter, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), s.x, s.y + 0.5);
      } else {
        ctx.fillStyle = sel ? '#d97706' : 'rgba(75,85,99,0.75)';
        ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
        label(`${i + 1} ↑ ${wp.label || ''}`, s.x, s.y - 14, 9, '#4b5563', 600);
      }
    });
  }
  function cameraHit(pt) {
    const list = S.p.tourWaypoints || [];
    const tol = 11 / S.view.scale;
    for (let i = list.length - 1; i >= 0; i--) {
      const hnd = cameraHandles(list[i]);
      if (isEye(list[i]) && Math.hypot(pt.x - hnd.look.x, pt.z - hnd.look.z) < tol) return { wp: list[i], part: 'look' };
      if (Math.hypot(pt.x - hnd.pos.x, pt.z - hnd.pos.z) < tol) return { wp: list[i], part: 'pos' };
    }
    return null;
  }
  function addCamera(pt) {
    ensureCameras();
    const list = S.p.tourWaypoints;
    if (!list) return;
    commit();
    let idx = S.sel && S.sel.kind === 'camera' ? list.indexOf(S.sel.obj) + 1 : list.findIndex(w => /ENVOL/i.test(w.label || ''));
    if (idx < 0) idx = list.length;
    const prev = list[idx - 1] || list[0];
    const dx = pt.x - prev.pos[0], dz = pt.z - prev.pos[2], l = Math.hypot(dx, dz) || 1;
    const room = roomAt(pt.x, pt.z);
    const r = room && S.p.rooms.find(x => x.id === room);
    const wp = { pos: [r2(pt.x), 1.65, r2(pt.z)], look: [r2(pt.x + (dx / l) * 3), 1.3, r2(pt.z + (dz / l) * 3)], fov: 62, label: r ? r.name : 'ÉTAPE' };
    if (room) wp.room = room;
    list.splice(idx, 0, wp);
    select({ kind: 'camera', obj: wp });
  }

  function roomAt(x, z) {
    const r = S.p.rooms.find(r => roomContains(r, x, z));
    return r ? r.id : undefined;
  }

  function addFurniture(pt, opts = {}) {
    const it = S.libItem;
    if (!it) return;
    commit();
    const rotY = Number.isFinite(opts.rotY) ? opts.rotY : (S.placeRotY || 0);
    const f = {
      name: it.name,
      level: S.activeLevel,
      x: r2(pt.x),
      z: r2(pt.z),
      w: it.w,
      d: it.d,
      h: it.h,
      elev: it.elev || 0,
      color: it.color,
      rotY,
      dims: 'local'
    };
    if (it.symbol) f.symbol = it.symbol;
    if (it.model) f.model = it.model;
    const room = roomAt(f.x, f.z);
    if (room) f.room = room;
    S.p.furniture.push(f);
    select({ kind: 'furniture', obj: f });
  }

  function rotateFurniture(f, direction = 1) {
    commit();
    const step = Math.PI / 12; // 15°
    f.rotY = ((f.rotY || 0) + direction * step) % (Math.PI * 2);
    if (f.rotY < 0) f.rotY += Math.PI * 2;
    f.dims = 'local';
    refreshPanel();
    draw();
  }

  function deleteSelection() {
    const s = S.sel;
    if (!s) return;
    commit();
    if (s.kind === 'opening') s.wall.openings.splice(s.wall.openings.indexOf(s.obj), 1);
    else if (s.kind === 'camera') S.p.tourWaypoints.splice(S.p.tourWaypoints.indexOf(s.obj), 1);
    else {
      const list = { wall: 'walls', room: 'rooms', column: 'columns', canopy: 'canopies', furniture: 'furniture', stairwell: 'stairwells' }[s.kind];
      S.p[list].splice(S.p[list].indexOf(s.obj), 1);
    }
    S.sel = null;
    refreshPanel();
    draw();
  }

  function finishCalibration(a, b) {
    const pi = S.p.config.planImage;
    if (!pi || !S.planImg) { toast('Importez d\'abord l\'image du plan', true); return; }
    const pxA = { x: a.x * pi.pxPerMeter + pi.originPx[0], y: a.z * pi.pxPerMeter + pi.originPx[1] };
    const pxB = { x: b.x * pi.pxPerMeter + pi.originPx[0], y: b.z * pi.pxPerMeter + pi.originPx[1] };
    const pxDist = Math.hypot(pxB.x - pxA.x, pxB.y - pxA.y);
    const ans = prompt('Longueur réelle de cette cote (en mètres) ?', '');
    const m = parseFloat((ans || '').replace(',', '.'));
    if (!(m > 0) || pxDist < 4) { toast('Calibrage annulé', true); return; }
    commit();
    // Le point A reste fixe à l'écran : on recalcule l'origine en conséquence
    const newK = pxDist / m;
    const aw = toWorld(S.draft.screenA.x, S.draft.screenA.y);
    pi.originPx = [pxA.x - aw.x * newK, pxA.y - aw.z * newK];
    pi.pxPerMeter = Math.round(newK * 100) / 100;
    pi.calibrated = true;
    delete pi.controlCheck;
    refreshPanel();
    toast(`Échelle : ${pi.pxPerMeter} px/m — vérifiez sur une 2ᵉ cote de contrôle ou tracez les murs (M)`);
    setTool('wall-ext');
  }

  function finishScaleControl(a, b, explicitMeters = null) {
    const pi = S.p.config.planImage;
    if (!pi || !pi.calibrated || !S.planImg) { toast('Calibrez d’abord le plan sur une 1ʳᵉ cote (K).', true); return null; }
    if (typeof PlanHomography === 'undefined') { toast('Module PlanHomography indisponible.', true); return null; }
    const p1 = [a.x * pi.pxPerMeter + pi.originPx[0], a.z * pi.pxPerMeter + pi.originPx[1]];
    const p2 = [b.x * pi.pxPerMeter + pi.originPx[0], b.z * pi.pxPerMeter + pi.originPx[1]];
    const raw = explicitMeters !== null ? String(explicitMeters) : prompt('Longueur réelle de la 2ᵉ cote de contrôle (en mètres) ?', '');
    const m = parseFloat((raw || '').replace(',', '.'));
    if (!(m > 0)) { toast('Contrôle annulé', true); return null; }
    const check = PlanHomography.evaluateControlDimension({ p1, p2, realMeters: m, pxPerMeter: pi.pxPerMeter, tolerance: 0.01 });
    commit();
    pi.controlCheck = check;
    refreshPanel();
    toast(check.message, check.alert);
    setTool('select');
    return check;
  }

  function finishRectification(worldPts) {
    const pi = S.p.config.planImage;
    if (!pi || !S.planImg || typeof PlanHomography === 'undefined') {
      toast('Importez un plan avant de redresser la perspective.', true);
      return null;
    }
    const srcQuad = worldPts.map(pt => [
      pt.x * pi.pxPerMeter + pi.originPx[0],
      pt.z * pi.pxPerMeter + pi.originPx[1]
    ]);
    try {
      const rect = PlanHomography.rectifyCanvas(S.planImg, srcQuad);
      commit();
      // Conserver l'image source intacte pour permettre la restauration à tout moment.
      const originalUrl = pi.originalUrl || pi.url;
      S.planDataUrl = rect.dataUrl;
      S.p.config.planImage = {
        url: rect.dataUrl,
        originalUrl,
        rectified: true,
        pxPerMeter: pi.pxPerMeter || 50,
        originPx: null,
        calibrated: false
      };
      if (S.p.config.planImages && typeof S.p.config.planImages === 'object') {
        S.p.config.planImages[String(S.activeLevel)] = S.p.config.planImage;
        S.levelPlanDataUrls = S.levelPlanDataUrls || {};
        S.levelPlanDataUrls[String(S.activeLevel)] = rect.dataUrl;
      }
      loadPlanImage(rect.dataUrl);
      setTool('calibrate');
      toast(`Plan redressé (${rect.width} × ${rect.height} px, original conservé) — calibrez maintenant l'échelle (K).`);
      return rect;
    } catch (err) {
      toast(`Redressement impossible : ${err.message}`, true);
      return null;
    }
  }

  function restoreOriginalPlanImage() {
    const pi = S.p.config.planImage;
    if (!pi || !pi.originalUrl) return false;
    commit();
    const orig = pi.originalUrl;
    S.planDataUrl = orig.startsWith('data:') ? orig : null;
    S.p.config.planImage = { url: orig, pxPerMeter: pi.pxPerMeter || 50, originPx: null, calibrated: false };
    if (S.p.config.planImages && typeof S.p.config.planImages === 'object') {
      S.p.config.planImages[String(S.activeLevel)] = S.p.config.planImage;
    }
    loadPlanImage(orig);
    refreshPanel();
    toast('Image du plan d’origine restaurée.');
    return true;
  }

  // ---------------------------------------------------------------------------
  // SOURIS & CLAVIER
  // ---------------------------------------------------------------------------
  function evtPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const world = toWorld(sx, sy);
    const from = S.draft && S.draft.kind === 'wall' ? S.draft.from : null;
    const snap = snapPoint(world, from, { free: e.shiftKey, diagonal: e.altKey, recordGuides: !!(S.draft || S.drag) });
    return { screen: { x: sx, y: sy }, world, snap };
  }

  function syncLengthHud() {
    const hud = $('ed-length-hud');
    if (!hud) return;
    if (S.draft && S.draft.kind === 'wall' && S.typedLength) {
      hud.textContent = `Longueur mur : ${S.typedLength} m  (Entrée pour valider · Échap pour effacer)`;
      hud.hidden = false;
    } else {
      hud.hidden = true;
    }
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    S.lastShiftKey = !!e.shiftKey;
    const P = evtPoint(e);
    if (e.button === 2 || e.button === 1 || S.space) {
      S.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
      return;
    }
    if (e.button !== 0) return;
    for (const fn of customClickHandlers) {
      if (fn(P, e) === true) return;
    }
    switch (S.tool) {
      case 'select': {
        // Poignée de rotation interactive d'un meuble déjà sélectionné
        if (S.sel && S.sel.kind === 'furniture' && typeof Furniture2D !== 'undefined' && typeof Furniture2D.getRotateHandleWorld === 'function') {
          const rh = Furniture2D.getRotateHandleWorld(S.sel.obj, S.view.scale);
          if (Math.hypot(P.world.x - rh.x, P.world.z - rh.z) < 12 / S.view.scale) {
            S.drag = { kind: 'rotate-furniture', obj: S.sel.obj, moved: false };
            return;
          }
        }
        const ep = endpointAt(P.world);
        if (ep) {
          const ends = [];
          S.p.walls.forEach(w => ['from', 'to'].forEach(key => { if (w[key][0] === ep.x && w[key][1] === ep.z) ends.push({ w, key }); }));
          select({ kind: 'wall', obj: ends[0].w });
          S.drag = { kind: 'endpoint', ends, moved: false };
          return;
        }
        const hit = hitTest(P.world);
        select(hit);
        if (hit) {
          S.drag = { kind: 'move', hit, start: P.world, orig: JSON.parse(JSON.stringify(hit.obj)), moved: false };
        } else {
          S.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
        }
        break;
      }
      case 'calibrate':
        if (!S.draft) S.draft = { kind: 'calibrate', screenA: P.screen, worldA: P.world };
        else { const a = S.draft.worldA; finishCalibration(a, P.world); S.draft = null; }
        break;
      case 'verify-scale':
        if (!S.draft) S.draft = { kind: 'verify-scale', screenA: P.screen, worldA: P.world };
        else { const a = S.draft.worldA; finishScaleControl(a, P.world); S.draft = null; }
        break;
      case 'rectify':
        if (!S.draft || S.draft.kind !== 'rectify') S.draft = { kind: 'rectify', pts: [] };
        S.draft.pts.push(P.world);
        if (S.draft.pts.length >= 4) {
          const corners = S.draft.pts.slice(0, 4);
          S.draft = null;
          finishRectification(corners);
        }
        break;
      case 'wall-ext':
      case 'wall-int':
        S.typedLength = '';
        syncLengthHud();
        if (!S.draft) S.draft = { kind: 'wall', from: P.snap };
        else { addWall(S.draft.from, P.snap); S.draft.from = P.snap; }
        break;
      case 'door':
      case 'window':
      case 'open':
        addOpening(P.world);
        break;
      case 'room-auto': {
        const poly = detectRoomAt(P.world);
        if (!poly) toast('Aucun espace fermé ici : vérifiez que les murs se rejoignent (ou utilisez Rectangle / Polygone)', true);
        else addPolyRoom(poly);
        break;
      }
      case 'room-poly': {
        const last = S.draft && S.draft.pts.length ? S.draft.pts[S.draft.pts.length - 1] : null;
        const pt = snapPoint(P.world, last ? { x: last[0], z: last[1] } : null, { free: e.shiftKey, diagonal: e.altKey });
        if (!S.draft) S.draft = { kind: 'poly', pts: [] };
        const first = S.draft.pts[0];
        if (first && S.draft.pts.length >= 3 && Math.hypot(pt.x - first[0], pt.z - first[1]) * S.view.scale < 10) { addPolyRoom(S.draft.pts); S.draft = null; }
        else S.draft.pts.push([pt.x, pt.z]);
        break;
      }
      case 'room':
      case 'slab':
      case 'stairwell':
      case 'pergola':
        S.draft = { kind: 'rect', from: snapPoint(P.world, null, { free: e.shiftKey }) };
        break;
      case 'column': {
        commit();
        const c = { name: 'Colonne', level: S.activeLevel, x: P.snap.x, z: P.snap.z, size: 0.35, base: 0.5, capital: 0.5 };
        S.p.columns.push(c);
        select({ kind: 'column', obj: c });
        break;
      }
      case 'furniture': {
        const prev = getFurniturePreviewAt(P.world, { free: e.shiftKey });
        if (prev) addFurniture({ x: prev.x, z: prev.z }, { rotY: prev.rotY });
        break;
      }
      case 'measure': {
        if (!S.measurePts || S.measurePts.b) {
          S.measurePts = { a: P.snap, b: null };
        } else {
          S.measurePts.b = P.snap;
          const dist = Math.hypot(P.snap.x - S.measurePts.a.x, P.snap.z - S.measurePts.a.z);
          toast(`Distance mesurée : ${dist.toFixed(2).replace('.', ',')} m`);
        }
        break;
      }
      case 'camera': {
        ensureCameras();
        const hit = cameraHit(P.world);
        if (hit) {
          select({ kind: 'camera', obj: hit.wp });
          S.drag = { kind: 'camera', hit, moved: false };
        } else addCamera(snapPoint(P.world, null, { free: true }));
        break;
      }
    }
    draw();
  });

  window.addEventListener('mousemove', e => {
    if (!S.p) return;
    S.lastShiftKey = !!e.shiftKey;
    const P = evtPoint(e);
    S.hover = P;
    $('ed-coords').textContent = `x ${P.snap.x.toFixed(2)} · z ${P.snap.z.toFixed(2)} m`;
    const d = S.drag;
    if (d && d.kind === 'pan') {
      S.view.ox = d.ox + (e.clientX - d.sx);
      S.view.oy = d.oy + (e.clientY - d.sy);
    } else if (d && d.kind === 'rotate-furniture') {
      if (!d.moved) { commit(); d.moved = true; }
      const raw = Math.atan2(P.world.x - d.obj.x, P.world.z - d.obj.z);
      const step = e.shiftKey ? (Math.PI / 180) : (Math.PI / 12);
      const snapped = Math.round(raw / step) * step;
      d.obj.rotY = ((snapped % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      d.obj.dims = 'local';
    } else if (d && d.kind === 'endpoint') {
      const pt = snapPoint(P.world, null, { free: e.shiftKey, recordGuides: true });
      const cur = d.ends[0].w[d.ends[0].key];
      if (pt.x !== cur[0] || pt.z !== cur[1]) {
        if (!d.moved) { commit(); d.moved = true; } // historique seulement si ça bouge vraiment
        d.ends.forEach(({ w, key }) => { w[key] = [pt.x, pt.z]; });
      }
    } else if (d && d.kind === 'camera') {
      if (!d.moved) { commit(); d.moved = true; }
      const wp = d.hit.wp, x = r2(P.world.x), z = r2(P.world.z);
      if (d.hit.part === 'pos') {
        const ox = wp.look[0] - wp.pos[0], oz = wp.look[2] - wp.pos[2];
        wp.pos[0] = x; wp.pos[2] = z;
        wp.look[0] = r2(x + ox); wp.look[2] = r2(z + oz);
        const room = roomAt(x, z);
        if (room && isEye(wp)) { wp.room = room; }
      } else {
        const dx = x - wp.pos[0], dz = z - wp.pos[2], l = Math.hypot(dx, dz) || 1;
        wp.look[0] = r2(wp.pos[0] + (dx / l) * 3); wp.look[2] = r2(wp.pos[2] + (dz / l) * 3);
      }
    } else if (d && d.kind === 'move') {
      const step = (e.shiftKey || !S.snapEnabled) ? 0.01 : 0.05;
      const dx = round(P.world.x - d.start.x, step), dz = round(P.world.z - d.start.z, step);
      const o = d.orig, obj = d.hit.obj;
      if (!d.moved && (dx !== 0 || dz !== 0)) { commit(); d.moved = true; }
      if (!d.moved) { draw(); return; }
      if (d.hit.kind === 'furniture') {
        let nx = r2(o.x + dx), nz = r2(o.z + dz);
        if (S.snapEnabled && S.wallSnapFurniture && !e.shiftKey && typeof Furniture2D !== 'undefined' && typeof Furniture2D.snapFurnitureToWall === 'function') {
          const snapW = Furniture2D.snapFurnitureToWall({ x: nx, z: nz }, obj, S.p.walls, 0.3);
          if (snapW) { nx = snapW.x; nz = snapW.z; obj.rotY = snapW.rotY; obj.dims = 'local'; }
        }
        obj.x = nx; obj.z = nz;
      } else if (d.hit.kind === 'column') { obj.x = r2(o.x + dx); obj.z = r2(o.z + dz); }
      else if (d.hit.kind === 'room') {
        Object.assign(obj.bounds, { xMin: r2(o.bounds.xMin + dx), xMax: r2(o.bounds.xMax + dx), zMin: r2(o.bounds.zMin + dz), zMax: r2(o.bounds.zMax + dz) });
        if (o.poly) obj.poly = o.poly.map(p => [r2(p[0] + dx), r2(p[1] + dz)]);
      }
      else if (d.hit.kind === 'canopy' || d.hit.kind === 'stairwell') { Object.assign(obj, { xMin: r2(o.xMin + dx), xMax: r2(o.xMax + dx), zMin: r2(o.zMin + dz), zMax: r2(o.zMax + dz) }); }
      else if (d.hit.kind === 'wall') { obj.from = [r2(o.from[0] + dx), r2(o.from[1] + dz)]; obj.to = [r2(o.to[0] + dx), r2(o.to[1] + dz)]; }
      else if (d.hit.kind === 'opening') {
        const w = d.hit.wall, L = wallLen(w);
        obj.at = r2(Math.max(obj.w / 2, Math.min(L - obj.w / 2, round(projectOnWall(w, P.world).at, step))));
      }
    }
    draw();
  });

  window.addEventListener('mouseup', e => {
    const d = S.drag;
    S.drag = null;
    S.guides = [];
    if (d && (d.kind === 'camera' || d.kind === 'rotate-furniture') && d.moved) refreshPanel();
    if (d && (d.kind === 'move' || d.kind === 'endpoint') && d.moved) {
      if (d.hit && d.hit.kind === 'furniture') { const room = roomAt(d.hit.obj.x, d.hit.obj.z); if (room) d.hit.obj.room = room; }
      refreshPanel();
    }
    if (S.draft && S.draft.kind === 'rect' && S.hover && e.button === 0) {
      addRect(S.draft.from, snapPoint(S.hover.world, null, { free: e.shiftKey }));
      S.draft = null;
    }
    draw();
  });

  function closePolyDraft() {
    if (S.draft && S.draft.kind === 'poly') { const pts = S.draft.pts; S.draft = null; if (pts.length >= 3) addPolyRoom(pts); draw(); return true; }
    return false;
  }
  canvas.addEventListener('dblclick', () => { if (S.draft && S.draft.kind === 'wall') { S.draft = null; S.typedLength = ''; syncLengthHud(); draw(); } else closePolyDraft(); });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const before = toWorld(sx, sy);
    S.view.scale = Math.max(6, Math.min(400, S.view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    S.view.ox = sx - before.x * S.view.scale;
    S.view.oy = sy - before.z * S.view.scale;
    $('ed-scale').textContent = `${Math.round(S.view.scale)} px/m`;
    draw();
  }, { passive: false });

  // Barre d'état interactive : état du calage d'échelle (clic → outil K) et opacité directe du calque plan
  const edScaleCal = $('ed-scale-cal');
  const edOpacityWrap = $('ed-opacity-wrap');
  const edQuickOpacity = $('ed-quick-opacity');
  const btnBackProject = $('btn-back-project');
  function syncStatusBar() {
    if (btnBackProject) {
      const slug = S.p?.slug;
      btnBackProject.href = slug ? `accueil.html?project=${encodeURIComponent(slug)}` : 'accueil.html';
    }
    const pi = S.p?.config?.planImage;
    if (edScaleCal) {
      const ok = !!(pi && pi.calibrated === true && Number.isFinite(pi.pxPerMeter) && pi.pxPerMeter > 0);
      edScaleCal.textContent = ok
        ? `Échelle calibrée · ${pi.pxPerMeter.toFixed(1)} px/m ✓`
        : (S.planImg ? 'Échelle : à calibrer (K)' : 'Aucun plan importé');
      edScaleCal.classList.toggle('is-calibrated', ok);
      edScaleCal.classList.toggle('is-warn', !ok && !!S.planImg);
    }
    if (edOpacityWrap && edQuickOpacity) {
      edOpacityWrap.hidden = !S.planImg;
      edQuickOpacity.value = String(S.planOpacity);
    }
  }
  edScaleCal?.addEventListener('click', () => {
    if (!S.planImg) { $('file-plan')?.click(); return; }
    setTool('calibrate');
    toast('Cliquez deux extrémités d’une cote connue sur le plan (K)');
  });
  edQuickOpacity?.addEventListener('input', e => {
    S.planOpacity = parseFloat(e.target.value);
    const panelRng = document.querySelector('[data-proj="rng-opacity"]');
    if (panelRng) panelRng.value = String(S.planOpacity);
    draw();
  });

  // Fermeture automatique des menus déroulants de la barre d'outils au clic extérieur ou sur une action
  const toolbarMenus = [...(document.querySelectorAll?.('.ed-menu') || [])];
  document.addEventListener?.('click', e => {
    for (const menu of toolbarMenus) {
      if (!menu.open) continue;
      if (!menu.contains?.(e.target) || e.target?.closest?.('.ed-menu-panel button')) {
        menu.open = false;
      }
    }
  });

  const TOOL_KEYS = { KeyV: 'select', KeyN: 'annotate', KeyK: 'calibrate', KeyM: 'wall-ext', KeyC: 'wall-int', KeyD: 'door', KeyF: 'window', KeyB: 'open', KeyA: 'room', KeyW: 'room-auto', KeyP: 'room-poly', KeyO: 'column', KeyU: 'slab', KeyG: 'pergola', KeyE: 'furniture', KeyT: 'camera', KeyX: 'measure' };

  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const typing = e.target.closest?.('input, select, textarea, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.code === 'Space' && !e.target.closest?.('button, a, summary, label')) { S.space = true; canvas.style.cursor = 'grab'; e.preventDefault(); return; }
    // Saisie directe de longueur en mètres pendant le tracé d'un mur (ex: taper "4.5" puis Entrée)
    if (S.draft && S.draft.kind === 'wall' && !e.ctrlKey && !e.metaKey) {
      if (/^[0-9.,]$/.test(e.key)) {
        e.preventDefault();
        if (S.typedLength.length < 8) {
          S.typedLength += e.key === ',' ? '.' : e.key;
          syncLengthHud();
        }
        return;
      }
      if (e.code === 'Backspace' && S.typedLength) {
        e.preventDefault();
        S.typedLength = S.typedLength.slice(0, -1);
        syncLengthHud();
        return;
      }
      if (e.code === 'Enter' && S.typedLength) {
        e.preventDefault();
        const len = parseFloat(S.typedLength);
        if (Number.isFinite(len) && len >= 0.1 && len <= 100) {
          const ref = S.hover ? S.hover.snap : { x: S.draft.from.x + 1, z: S.draft.from.z };
          let dx = ref.x - S.draft.from.x, dz = ref.z - S.draft.from.z;
          const d = Math.hypot(dx, dz);
          if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
          const end = { x: r2(S.draft.from.x + dx * len), z: r2(S.draft.from.z + dz * len) };
          addWall(S.draft.from, end);
          S.draft.from = end;
          toast(`Mur de ${len.toFixed(2).replace('.', ',')} m tracé`);
        }
        S.typedLength = '';
        syncLengthHud();
        draw();
        return;
      }
    }
    if (e.code === 'Enter' && closePolyDraft()) return;
    if (e.code === 'Escape') {
      S.typedLength = '';
      syncLengthHud();
      S.measurePts = null;
      S.guides = [];
      if (S.draft) S.draft = null;
      else select(null);
      draw();
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelection(); return; }
    if (e.code === 'KeyR' && S.sel && S.sel.kind === 'furniture') { rotateFurniture(S.sel.obj, e.shiftKey ? -1 : 1); return; }
    if (e.code === 'KeyR' && S.tool === 'furniture') {
      const step = Math.PI / 12;
      S.placeRotY = ((S.placeRotY || 0) + (e.shiftKey ? -step : step) + Math.PI * 2) % (Math.PI * 2);
      draw();
      return;
    }
    if (S.sel && S.sel.kind === 'opening' && S.sel.obj.type === 'door' && (e.code === 'KeyH' || e.code === 'KeyJ')) {
      commit();
      if (e.code === 'KeyH') S.sel.obj.hinge = S.sel.obj.hinge === 'end' ? 'start' : 'end';
      else S.sel.obj.side = (S.sel.obj.side || 1) * -1;
      refreshPanel(); draw(); return;
    }
    if (TOOL_KEYS[e.code] && !e.ctrlKey && !e.metaKey) setTool(TOOL_KEYS[e.code]);
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { S.space = false; canvas.style.cursor = 'crosshair'; } });

  // ---------------------------------------------------------------------------
  // OUTILS, ONGLETS & PANNEAU
  // ---------------------------------------------------------------------------
  function setPanelTab(tab) {
    if (!['inspect', 'furniture', 'dossier'].includes(tab)) return;
    S.panelTab = tab;
    const propsEl = $('ed-props');
    const libEl = $('ed-library');
    const dossierEl = $('ed-dossier-pane');
    if (dossierEl) {
      if (propsEl) propsEl.classList.toggle('hidden', tab !== 'inspect');
      if (libEl) libEl.classList.toggle('hidden', tab !== 'furniture');
      dossierEl.classList.toggle('hidden', tab !== 'dossier');
      document.querySelectorAll('#ed-panel-tabs [data-panel-tab]').forEach(btn => {
        const isCurrent = btn.dataset.panelTab === tab;
        btn.classList.toggle('active', isCurrent);
        btn.setAttribute('aria-selected', String(isCurrent));
      });
      if (tab === 'dossier' && S.p) projectPanel(dossierEl, { inDialog: false, inDossier: true });
    } else if (libEl) {
      libEl.classList.toggle('hidden', tab !== 'furniture' && S.tool !== 'furniture');
    }
  }

  function setTool(t) {
    S.tool = t;
    S.draft = null;
    S.typedLength = '';
    S.measurePts = null;
    S.guides = [];
    syncLengthHud();
    if (window.EditorLive3D && typeof window.EditorLive3D.updateGhost === 'function') {
      window.EditorLive3D.updateGhost(null);
    }
    document.querySelectorAll('#ed-tools button').forEach(b => {
      const active = b.dataset.tool === t;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    $('ed-hint').textContent = HINTS[t] || '';
    if (t === 'furniture') setPanelTab('furniture');
    else if (S.panelTab === 'furniture') setPanelTab('inspect');
    if (t === 'camera') { ensureCameras(); if (!S.sel || S.sel.kind !== 'camera') { S.sel = null; } refreshPanel(); }
    else if (S.sel && S.sel.kind === 'camera') { S.sel = null; refreshPanel(); }
    draw();
  }
  document.querySelectorAll('#ed-tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

  function select(s) {
    S.sel = s;
    if (s && $('ed-dossier-pane') && S.panelTab !== 'inspect') setPanelTab('inspect');
    refreshPanel();
    draw();
  }

  // Génère un formulaire à partir d'un schéma [{key, label, type, options, step, pdf, rows}]
  function form(title, obj, fields, onChange, extraHtml = '', target = $('ed-props'), prependHtml = '') {
    const el = target || $('ed-props');
    if (!el) return;
    el.innerHTML = (title ? `<h3>${title}</h3>` : '') + prependHtml + fields.map(f => {
      const v = f.get ? f.get(obj) : obj[f.key];
      let input;
      if (f.type === 'select') input = `<select data-key="${f.key}">${Object.entries(f.options).map(([k, l]) => `<option value="${k}" ${String(v ?? '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      else if (f.type === 'checkbox') input = `<input type="checkbox" data-key="${f.key}" ${v ? 'checked' : ''}>`;
      else if (f.type === 'textarea') input = `<textarea data-key="${f.key}" rows="${f.rows || 3}">${escapeHtml(v ?? '')}</textarea>`;
      else if (f.type === 'readonly') input = `<span>${v}</span>`;
      else input = `<input type="${f.type || 'text'}" data-key="${f.key}" value="${v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;')}" ${f.step ? `step="${f.step}"` : ''}>`;
      const pdfTag = f.pdf ? '<br><span class="ed-pdf-tag" title="Champ repris dans le cartouche des exports PDF">utilisé dans les PDF</span>' : '';
      return `<div class="ed-field"${f.pdf ? ' data-pdf-field="true"' : ''}><label>${f.label}${pdfTag}</label>${input}</div>`;
    }).join('') + extraHtml;
    el.querySelectorAll('[data-key]').forEach(inp => {
      const f = fields.find(x => x.key === inp.dataset.key);
      if (f && f.pdf && inp.type !== 'checkbox') {
        inp.addEventListener('input', () => {
          const previewMeta = Object.assign({}, S.p.meta, { [f.key]: inp.value });
          updatePdfMissingBanners(previewMeta);
        });
      }
      inp.addEventListener('change', () => {
        let val = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (f.type === 'number') { val = parseFloat(String(val).replace(',', '.')); if (!isFinite(val)) return; }
        commit();
        if (f.set) f.set(obj, val); else obj[f.key] = val;
        if (onChange) onChange();
        refreshPanel();
        draw();
      });
    });
  }

  function pdfMissingInfo(metaOverride) {
    if (typeof PdfIdentity === 'undefined' || typeof PdfIdentity.missingFields !== 'function') {
      return { missing: [], message: '' };
    }
    return PdfIdentity.missingFields({ meta: metaOverride || S.p.meta }, { cabinet: cabinetProfile });
  }

  function pdfMissingBannerHtml(metaOverride) {
    const info = pdfMissingInfo(metaOverride);
    if (!info.missing.length) {
      return '<div class="ed-pdf-missing is-ok" data-pdf-missing role="status">Cartouche PDF complet : tous les champs administratifs sont renseignés.</div>';
    }
    return `<div class="ed-pdf-missing" data-pdf-missing role="status"><strong>Champs vides du cartouche PDF (${info.missing.length}) :</strong> ${escapeHtml(info.missing.join(', '))}.</div>`;
  }

  function updatePdfMissingBanners(metaOverride) {
    const info = pdfMissingInfo(metaOverride);
    document.querySelectorAll('[data-pdf-missing]').forEach(node => {
      node.classList.toggle('is-ok', !info.missing.length);
      if (!info.missing.length) {
        node.textContent = 'Cartouche PDF complet : tous les champs administratifs sont renseignés.';
      } else {
        node.innerHTML = `<strong>Champs vides du cartouche PDF (${info.missing.length}) :</strong> ${escapeHtml(info.missing.join(', '))}.`;
      }
    });
  }

  function syncProjectInfoDialog() {
    const dlg = $('dlg-project-info');
    const body = $('dlg-project-info-body');
    if (dlg && dlg.open && body) projectPanel(body, { inDialog: true });
  }

  function openProjectInfoDialog() {
    const dlg = $('dlg-project-info');
    const body = $('dlg-project-info-body');
    if (!dlg || !body) return;
    projectPanel(body, { inDialog: true });
    if (!dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
  }

  function syncDossierPane() {
    const pane = $('ed-dossier-pane');
    if (pane && S.panelTab === 'dossier' && S.p) projectPanel(pane, { inDialog: false, inDossier: true });
  }

  function syncQuickBar() {
    const bar = $('ed-quick-bar');
    if (!bar) return;
    const s = S.sel;
    if (!s || S.tool === 'measure') {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }
    const items = [];
    let title = '';
    if (s.kind === 'furniture') {
      title = s.obj.name || 'Meuble';
      items.push(
        { label: 'Pivoter +90°', onClick: () => { commit(); s.obj.rotY = ((s.obj.rotY || 0) + Math.PI / 2) % (Math.PI * 2); s.obj.dims = 'local'; refreshPanel(); draw(); } },
        { label: 'Coller au mur', onClick: () => snapSelectedFurnitureToWall(s.obj) },
        { label: 'Dupliquer', onClick: () => { commit(); const c = JSON.parse(JSON.stringify(s.obj)); c.x = r2(c.x + 0.35); c.z = r2(c.z + 0.35); S.p.furniture.push(c); select({ kind: 'furniture', obj: c }); } },
        { label: 'Supprimer', onClick: deleteSelection }
      );
    } else if (s.kind === 'room') {
      title = s.obj.name || 'Pièce';
      items.push(
        { label: 'Meubler cette pièce', onClick: () => void autoFurnishRooms(s.obj.id) },
        ...(!s.obj.poly ? [{ label: 'Ajuster aux murs', onClick: () => { commit(); fitRoomToWalls(s.obj); refreshPanel(); draw(); } }] : []),
        { label: 'Supprimer', onClick: deleteSelection }
      );
    } else if (s.kind === 'opening' && s.obj.type === 'door') {
      title = 'Porte';
      items.push(
        { label: 'Gonds (H)', onClick: () => { commit(); s.obj.hinge = s.obj.hinge === 'end' ? 'start' : 'end'; refreshPanel(); draw(); } },
        { label: 'Sens (J)', onClick: () => { commit(); s.obj.side = (s.obj.side || 1) * -1; refreshPanel(); draw(); } },
        { label: 'Supprimer', onClick: deleteSelection }
      );
    } else if (s.kind === 'wall') {
      title = `Mur ${wallLen(s.obj).toFixed(2).replace('.', ',')} m`;
      items.push(
        { label: s.obj.type === 'ext' ? 'Passer en cloison' : 'Passer en mur ext.', onClick: () => { commit(); s.obj.type = s.obj.type === 'ext' ? 'int' : 'ext'; s.obj.thick = s.obj.type === 'ext' ? 0.25 : 0.15; refreshPanel(); draw(); } },
        { label: 'Supprimer', onClick: deleteSelection }
      );
    } else {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }

    const nodes = [];
    const lbl = document.createElement('span');
    lbl.className = 'ed-qb-label';
    lbl.textContent = title;
    nodes.push(lbl);
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.onclick = it.onClick;
      nodes.push(b);
    });
    bar.replaceChildren(...nodes);
    bar.hidden = false;
  }

  function snapSelectedFurnitureToWall(obj) {
    if (!obj || typeof Furniture2D === 'undefined' || typeof Furniture2D.snapFurnitureToWall !== 'function') return;
    const hit = Furniture2D.snapFurnitureToWall({ x: obj.x, z: obj.z }, obj, S.p.walls, 2.5);
    if (!hit) { toast('Aucun mur proche pour aimanter ce meuble.', true); return; }
    commit();
    obj.x = hit.x;
    obj.z = hit.z;
    obj.rotY = hit.rotY;
    obj.dims = 'local';
    refreshPanel();
    draw();
    toast('Meuble aligné contre le mur.');
  }

  async function autoFurnishRooms(roomId = null) {
    if (!S.p || !S.p.rooms.length) {
      toast('Créez d’abord au moins une pièce (W, A ou P) avant de meubler automatiquement.', true);
      return;
    }
    toast('Calcul de l’ameublement architectural…');
    try {
      const res = await fetch('api/ai/auto-furnish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: toProjectJson(),
          roomId: roomId || undefined,
          level: roomId ? undefined : S.activeLevel,
          useAi: false
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Meublage automatique indisponible.');
      const items = Array.isArray(data.furniture) ? data.furniture : [];
      if (!items.length) {
        toast('Aucun meuble proposé pour ces noms de pièces (ex. Séjour, Chambre, Cuisine, Salle de bain).', true);
        return;
      }
      commit();
      if (roomId) {
        S.p.furniture = S.p.furniture.filter(f => f.room !== roomId);
      }
      items.forEach(it => {
        if ((Number(it.level) || 0) === S.activeLevel) {
          S.p.furniture.push({ ...it, dims: 'local', elev: it.elev || 0 });
        }
      });
      refreshPanel();
      draw();
      if (window.EditorLive3D && window.EditorLive3D.getMode() === '2d') {
        window.EditorLive3D.setMode('split');
      }
      toast(data.note || `${items.length} meubles placés.`);
    } catch (err) {
      toast(err.message || 'Impossible de meubler automatiquement.', true);
    }
  }

  function projectSummaryPanel() {
    const container = $('ed-props');
    if (!container || !S.p) return;
    const p = S.p;
    const hab = p.rooms.filter(r => r.habitable).reduce((s, r) => s + roomArea(r), 0);
    const nOps = p.walls.reduce((s, w) => s + w.openings.length, 0);
    const pi = p.config.planImage;
    const missing = pdfMissingInfo().missing;
    const warn = !p.walls.some(w => w.openings.some(o => o.type === 'door' && w.type === 'ext')) && p.walls.length
      ? '<p class="ed-note warn">Aucune porte sur un mur extérieur : l\'entrée de la visite sera devinée.</p>' : '';

    container.innerHTML = `<div class="ed-inspector-summary">
      <div class="ed-inspector-head">
        <h3>Projet</h3>
        <button type="button" id="btn-open-dossier-tab" title="Compléter le cartouche PDF et les métadonnées">Cartouche PDF${missing.length ? ` (${missing.length})` : ' ✓'}</button>
      </div>
      <div class="ed-field"><label>Nom du projet</label><input type="text" id="sum-proj-name" value="${escapeHtml(p.meta.name || '')}"></div>
      <div class="ed-stats">
        <div class="ed-stat"><strong>${p.walls.length}</strong><span>murs</span></div>
        <div class="ed-stat"><strong>${nOps}</strong><span>ouvertures</span></div>
        <div class="ed-stat"><strong>${p.rooms.length}</strong><span>pièces</span></div>
        <div class="ed-stat"><strong>${hab.toFixed(1).replace('.', ',')} m²</strong><span>habitables</span></div>
      </div>
      <div class="ed-inspector-actions">
        <button type="button" id="sum-btn-split" class="ed-primary">Aperçu 2D + 3D</button>
        <button type="button" id="sum-btn-autofurnish">Meubler auto</button>
      </div>
      <div class="ed-field"><label>Hauteur sous plafond (m)</label><input type="number" data-proj="num-height" step="0.05" value="${p.config.wallHeight}"></div>
      ${S.planImg ? `<div class="ed-field"><label>Opacité du plan</label><input type="range" data-proj="rng-opacity" min="0" max="1" step="0.05" value="${S.planOpacity}"></div>` : ''}
      <p class="ed-note">${pi && S.planImg ? `Échelle du plan : <strong>${pi.pxPerMeter} px/m</strong>${pi.calibrated ? ' (calibré)' : ' (non calibré)'}${pi.rectified ? ' · redressé' : ''}` : 'Sélectionnez un élément sur le plan ou ouvrez l’onglet Mobilier pour aménager en direct.'}</p>
      ${pi && S.planImg ? `<div class="ed-row"><button type="button" data-proj="btn-rectify">Redresser (4 pts)</button>${pi.calibrated ? '<button type="button" data-proj="btn-verify-scale">Contrôler 2ᵉ cote</button>' : ''}${pi.originalUrl ? '<button type="button" data-proj="btn-restore-plan">Plan d’origine</button>' : ''}</div>` : ''}
      ${warn}
      ${diagnosticHtml('sum-')}
      <div class="ed-row"><button type="button" data-proj="btn-fit">Cadrer la vue</button><button type="button" data-proj="btn-center">Centrer sur l'origine</button></div>
      <section class="ed-checks" aria-labelledby="ed-checks-title"><h4 id="ed-checks-title" data-checks-title>Vérifications</h4><ul id="ed-checks-list" data-checks-list></ul>
        <p class="ed-note">Repères d'habitabilité indicatifs, non réglementaires : ils signalent, ils ne bloquent pas.</p></section>
    </div>`;

    const nameInp = $('sum-proj-name');
    if (nameInp) nameInp.onchange = () => {
      commit();
      p.meta.name = String(nameInp.value).toUpperCase();
      if (!p.meta.slugLocked) p.meta.slug = slugify(p.meta.name);
      refreshPanel();
    };
    const btnDossier = $('btn-open-dossier-tab');
    if (btnDossier) btnDossier.onclick = () => setPanelTab('dossier');
    const btnSplit = $('sum-btn-split');
    if (btnSplit) {
      const curMode = window.EditorLive3D?.getMode?.() || '2d';
      btnSplit.textContent = curMode === 'split' ? 'Revenir en 2D' : 'Aperçu 2D + 3D';
      btnSplit.onclick = () => {
        if (!window.EditorLive3D) return;
        window.EditorLive3D.setMode(window.EditorLive3D.getMode() === 'split' ? '2d' : 'split');
        refreshPanel();
      };
    }
    const btnFurn = $('sum-btn-autofurnish');
    if (btnFurn) btnFurn.onclick = () => void autoFurnishRooms();
    const rngOpacity = container.querySelector('[data-proj="rng-opacity"]');
    if (rngOpacity) rngOpacity.oninput = e => {
      S.planOpacity = parseFloat(e.target.value);
      const quick = $('ed-quick-opacity');
      if (quick) quick.value = String(S.planOpacity);
      draw();
    };
    const numHeight = container.querySelector('[data-proj="num-height"]');
    if (numHeight) numHeight.onchange = e => { const v = parseFloat(e.target.value); if (v > 2) { commit(); p.config.wallHeight = v; refreshPanel(); draw(); } };
    const btnFit = container.querySelector('[data-proj="btn-fit"]');
    if (btnFit) btnFit.onclick = () => { fitView(); draw(); };
    const btnCenter = container.querySelector('[data-proj="btn-center"]');
    if (btnCenter) btnCenter.onclick = () => { commit(); centerProject(); fitView(); draw(); toast('Projet recentré sur l\'origine'); };
    const btnRectify = container.querySelector('[data-proj="btn-rectify"]');
    if (btnRectify) btnRectify.onclick = () => { setTool('rectify'); toast('Cliquez les 4 coins du cadre/plan (haut-gauche → sens horaire).'); };
    const btnVerifyScale = container.querySelector('[data-proj="btn-verify-scale"]');
    if (btnVerifyScale) btnVerifyScale.onclick = () => { setTool('verify-scale'); toast('Cliquez les 2 extrémités d’une 2ᵉ cote connue (loupe active).'); };
    const btnRestorePlan = container.querySelector('[data-proj="btn-restore-plan"]');
    if (btnRestorePlan) btnRestorePlan.onclick = () => restoreOriginalPlanImage();
    renderChecks(container);
    wireDiagnostic(container);
  }

  function refreshPanel() {
    $('ed-project-name').textContent = S.p.meta.name + (S.dirty ? ' •' : '');
    const s = S.sel;
    if (!s && S.tool === 'camera') { camerasPanel(); syncDossierPane(); syncProjectInfoDialog(); return; }
    if (!s) {
      if ($('ed-dossier-pane')) projectSummaryPanel();
      else projectPanel();
      syncDossierPane();
      syncProjectInfoDialog();
      return;
    }
    if (s.kind === 'camera') { cameraPanel(s.obj); syncDossierPane(); syncProjectInfoDialog(); return; }
    const del = '<div class="ed-row"><button id="btn-del">Supprimer</button></div>';
    if (s.kind === 'wall') {
      form('Mur', s.obj, [
        { key: 'type', label: 'Type', type: 'select', options: { ext: 'Mur extérieur', int: 'Cloison' }, set: (o, v) => { o.type = v; o.thick = v === 'ext' ? 0.25 : 0.15; } },
        { key: 'thick', label: 'Épaisseur (m)', type: 'number', step: 0.01 },
        { key: 'len', label: 'Longueur', type: 'readonly', get: o => wallLen(o).toFixed(2) + ' m' },
        { key: 'ops', label: 'Ouvertures', type: 'readonly', get: o => o.openings.length }
      ], null, del);
    } else if (s.kind === 'opening') {
      const isDoor = s.obj.type === 'door';
      form(isDoor ? 'Porte' : s.obj.type === 'open' ? 'Passage libre' : 'Fenêtre', s.obj, [
        { key: 'type', label: 'Type', type: 'select', options: { door: 'Porte', window: 'Fenêtre', bay: 'Baie vitrée', open: 'Passage libre' } },
        { key: 'w', label: 'Largeur (m)', type: 'number', step: 0.05 },
        { key: 'h', label: 'Hauteur (m)', type: 'number', step: 0.05 },
        { key: 'sill', label: 'Allège (m)', type: 'number', step: 0.05 },
        { key: 'at', label: 'Position (m)', type: 'number', step: 0.05 },
        ...(isDoor ? [
          { key: 'hinge', label: 'Gonds', type: 'select', options: { start: 'Côté début', end: 'Côté fin' } },
          { key: 'side', label: 'Ouverture', type: 'select', options: { 1: 'Côté A', '-1': 'Côté B' }, set: (o, v) => { o.side = parseInt(v, 10); } },
          { key: 'entry', label: 'Entrée principale', type: 'checkbox', set: (o, v) => { S.p.walls.forEach(w => w.openings.forEach(x => { delete x.entry; })); if (v) o.entry = true; } }
        ] : [])
      ], null, (isDoor ? '<p class="ed-note"><kbd>H</kbd> inverse les gonds · <kbd>J</kbd> le sens d\'ouverture</p>' : '') + del);
    } else if (s.kind === 'room' && s.obj.poly) {
      form('Pièce (polygone)', s.obj, [
        { key: 'name', label: 'Nom', set: (o, v) => { o.name = String(v).toUpperCase(); } },
        { key: 'floorType', label: 'Sol', type: 'select', options: FLOORS },
        { key: 'habitable', label: 'Habitable', type: 'checkbox' },
        { key: 'desc', label: 'Description' },
        { key: 'area', label: 'Surface', type: 'readonly', get: o => roomArea(o).toFixed(2).replace('.', ',') + ' m²' },
        { key: 'nv', label: 'Sommets', type: 'readonly', get: o => o.poly.length }
      ], null, '<div class="ed-row"><button id="btn-furnish-room" class="ed-primary">Meubler cette pièce</button><button id="btn-to-rect">Rectangle</button><button id="btn-del">Supprimer</button></div>');
      const bf = $('btn-furnish-room');
      if (bf) bf.onclick = () => void autoFurnishRooms(s.obj.id);
      $('btn-to-rect').onclick = () => { commit(); s.obj.bounds = polyBounds(s.obj.poly); delete s.obj.poly; refreshPanel(); draw(); };
    } else if (s.kind === 'room') {
      const b = s.obj.bounds;
      form('Pièce', s.obj, [
        { key: 'name', label: 'Nom', set: (o, v) => { o.name = String(v).toUpperCase(); } },
        { key: 'floorType', label: 'Sol', type: 'select', options: FLOORS },
        { key: 'habitable', label: 'Habitable', type: 'checkbox' },
        { key: 'desc', label: 'Description' },
        { key: 'dims', label: 'Dimensions', type: 'readonly', get: () => `${(b.xMax - b.xMin).toFixed(2)} × ${(b.zMax - b.zMin).toFixed(2)} m` },
        { key: 'xMin', label: 'Ouest (x min)', type: 'number', step: 0.05, get: o => o.bounds.xMin, set: (o, v) => { o.bounds.xMin = v; } },
        { key: 'xMax', label: 'Est (x max)', type: 'number', step: 0.05, get: o => o.bounds.xMax, set: (o, v) => { o.bounds.xMax = v; } },
        { key: 'zMin', label: 'Nord (z min)', type: 'number', step: 0.05, get: o => o.bounds.zMin, set: (o, v) => { o.bounds.zMin = v; } },
        { key: 'zMax', label: 'Sud (z max)', type: 'number', step: 0.05, get: o => o.bounds.zMax, set: (o, v) => { o.bounds.zMax = v; } }
      ], null, '<div class="ed-row"><button id="btn-furnish-room" class="ed-primary">Meubler cette pièce</button><button id="btn-fit-room">Ajuster aux murs</button><button id="btn-del">Supprimer</button></div>');
      const bf = $('btn-furnish-room');
      if (bf) bf.onclick = () => void autoFurnishRooms(s.obj.id);
      const fit = $('btn-fit-room');
      if (fit) fit.onclick = () => { commit(); fitRoomToWalls(s.obj); refreshPanel(); draw(); };
    } else if (s.kind === 'column') {
      form('Colonne / poteau', s.obj, [
        { key: 'name', label: 'Nom' },
        { key: 'size', label: 'Fût (m)', type: 'number', step: 0.05 },
        { key: 'base', label: 'Base (m)', type: 'number', step: 0.05 },
        { key: 'capital', label: 'Chapiteau (m)', type: 'number', step: 0.05 }
      ], null, del);
    } else if (s.kind === 'stairwell') {
      const fitsNote = HouseAuto.stairFits(s.obj) ? '' : '<p class="ed-note warn">Trémie trop petite pour ce type d’escalier : agrandissez-la ou changez de type (aucun escalier ne sera construit en 3D).</p>';
      form('Trémie d’escalier', s.obj, [
        { key: 'name', label: 'Nom' },
        { key: 'stairType', label: 'Type d’escalier', type: 'select', get: o => o.stairType || 'return',
          options: { return: 'À retour (deux volées, palier)', straight: 'Droit (une volée)', quarter: 'Quart tournant (palier d’angle)', winder: 'Quart tournant balancé (marches dansantes)', helical: 'Hélicoïdal (poteau central)' } },
        { key: 'dir', label: 'Sens de montée', type: 'select', get: o => o.dir || '-x',
          options: { '-x': '← vers l’ouest (−X)', '+x': '→ vers l’est (+X)', '-z': '↑ vers le nord (−Z)', '+z': '↓ vers le sud (+Z)' } },
        { key: 'xMin', label: 'X min (m)', type: 'number', step: 0.05 },
        { key: 'xMax', label: 'X max (m)', type: 'number', step: 0.05 },
        { key: 'zMin', label: 'Z min (m)', type: 'number', step: 0.05 },
        { key: 'zMax', label: 'Z max (m)', type: 'number', step: 0.05 }
      ], null, fitsNote + del);
    } else if (s.kind === 'canopy') {
      form(s.obj.type === 'pergola' ? 'Pergola' : 'Auvent', s.obj, [
        { key: 'name', label: 'Nom' },
        { key: 'type', label: 'Type', type: 'select', options: { slab: 'Dalle (auvent)', pergola: 'Pergola à lames' } },
        { key: 'y', label: 'Hauteur (m)', type: 'number', step: 0.05 },
        { key: 'color', label: 'Couleur', type: 'color' }
      ], null, del);
    } else if (s.kind === 'furniture') {
      form('Meuble', s.obj, [
        { key: 'name', label: 'Nom' },
        {
          key: 'model',
          label: 'Modèle 2D / 3D',
          type: 'select',
          options: {
            '': '— volume simple —',
            sofa: 'Canapé',
            sofaCorner: 'Canapé d’angle',
            armchair: 'Fauteuil',
            coffeeTable: 'Table basse',
            tvUnit: 'Meuble TV',
            rug: 'Tapis',
            diningTable: 'Table à manger',
            diningRound: 'Table ronde',
            chair: 'Chaise',
            buffet: 'Buffet / Console',
            kitchenCounter: 'Plan de travail',
            kitchenIsland: 'Îlot central',
            cooktop: 'Plaque cuisson',
            sink: 'Évier inox',
            upperCabinet: 'Meuble haut',
            fridge: 'Réfrigérateur',
            bed: 'Lit',
            nightstand: 'Chevet',
            wardrobe: 'Armoire / Dressing',
            toilet: 'Cuvette WC',
            vanity: 'Meuble vasque',
            shower: 'Douche italienne',
            bathtub: 'Baignoire',
            desk: 'Bureau',
            lounger: 'Transat',
            car: 'Voiture (garage)',
            plantTall: 'Plante haute',
            plantBush: 'Plante basse',
            shelf: 'Bibliothèque / Étagères'
          },
          set: (o, v) => {
            if (v) { o.model = v; o.symbol = v; }
            else { delete o.model; delete o.symbol; }
          }
        },
        { key: 'w', label: 'Largeur (m)', type: 'number', step: 0.05 },
        { key: 'd', label: 'Profondeur (m)', type: 'number', step: 0.05 },
        { key: 'h', label: 'Hauteur (m)', type: 'number', step: 0.05 },
        { key: 'elev', label: 'Élévation (m)', type: 'number', step: 0.05 },
        { key: 'angle', label: 'Angle (°)', type: 'number', step: 1, get: o => Math.round((o.rotY || 0) * 180 / Math.PI * 100) / 100, set: (o, v) => { o.rotY = v * Math.PI / 180; o.dims = 'local'; } },
        { key: 'color', label: 'Couleur', type: 'color' }
      ], null, '<div class="ed-row"><button id="btn-rot">Pivoter +15° (R)</button><button id="btn-snap-wall">Coller au mur</button><button id="btn-dup">Dupliquer</button><button id="btn-del">Supprimer</button></div>');
      $('btn-rot').onclick = () => rotateFurniture(s.obj);
      const bSnap = $('btn-snap-wall');
      if (bSnap) bSnap.onclick = () => snapSelectedFurnitureToWall(s.obj);
      $('btn-dup').onclick = () => { commit(); const c = JSON.parse(JSON.stringify(s.obj)); c.x = r2(c.x + 0.3); c.z = r2(c.z + 0.3); S.p.furniture.push(c); select({ kind: 'furniture', obj: c }); };
    }
    const d = $('btn-del');
    if (d) d.onclick = deleteSelection;
    syncDossierPane();
    syncProjectInfoDialog();
  }

  function camerasPanel() {
    const list = S.p.tourWaypoints || [];
    const el = $('ed-props');
    const state = tourState();
    const freshness = {
      fresh: '<p class="ed-note ed-tour-fresh">✓ Parcours à jour avec le plan actuel.</p>',
      stale: '<p class="ed-note warn ed-tour-stale" role="status"><strong>Le plan a changé depuis ce parcours</strong> (murs, portes, pièces ou escalier). Certaines caméras peuvent traverser un mur ou viser une pièce disparue : régénérez-le, ou vérifiez chaque étape puis gardez-le.</p>',
      unknown: '<p class="ed-note warn ed-tour-stale" role="status">Ce parcours a été enregistré avant le suivi des versions : on ne sait pas s’il correspond au plan actuel. Vérifiez-le en aperçu 3D, puis marquez-le comme à jour.</p>',
      none: ''
    }[state];
    el.innerHTML = `<h3>Parcours caméra</h3>
      ${freshness}
      <p class="ed-note">${list.length ? list.length + ' étapes. Cliquez une caméra pour la régler, glissez-la sur le plan.' : 'Aucun parcours : il sera généré automatiquement (passage par les portes et l’escalier).'}</p>
      ${state === 'stale' || state === 'unknown' ? '<div class="ed-row"><button id="btn-cam-keep">Garder ce parcours : il est à jour</button></div>' : ''}
      <div class="ed-list">${list.map((wp, i) => `<button data-wp="${i}"><span>${i + 1}. ${wp.label || 'Étape'}</span><small>${isEye(wp) ? 'intérieur' : 'vue aérienne'}</small></button>`).join('')}</div>
      <div class="ed-row"><button id="btn-cam-gen">${list.length ? 'Régénérer automatiquement' : 'Générer le parcours'}</button><button id="btn-cam-preview">Aperçu 3D ↗</button></div>`;
    el.querySelectorAll('[data-wp]').forEach(b => { b.onclick = () => select({ kind: 'camera', obj: list[+b.dataset.wp] }); });
    $('btn-cam-gen').onclick = () => {
      if (list.length && !confirm('Remplacer le parcours actuel par un parcours généré automatiquement ?')) return;
      commit(); setGeneratedTour(); refreshPanel(); draw(); toast('Parcours généré : passage par les portes et l’escalier');
    };
    const keep = $('btn-cam-keep');
    if (keep) keep.onclick = () => {
      commit(); S.p.tourPlanVersion = planVersionNow(); refreshPanel(); toast('Parcours marqué à jour avec le plan actuel');
    };
    $('btn-cam-preview').onclick = () => previewAt(0);
  }
  function cameraPanel(wp) {
    const list = S.p.tourWaypoints;
    const i = list.indexOf(wp);
    const rooms = { '': '— aucune —' };
    S.p.rooms.forEach(r => { rooms[r.id] = r.name; });
    form(`Caméra ${i + 1} / ${list.length}`, wp, [
      { key: 'label', label: 'Titre (HUD)', set: (o, v) => { o.label = String(v).toUpperCase(); } },
      { key: 'room', label: 'Pièce (minimap)', type: 'select', options: rooms, set: (o, v) => { if (v) o.room = v; else delete o.room; } },
      { key: 'fov', label: 'Champ (°)', type: 'number', step: 1, set: (o, v) => { o.fov = Math.max(20, Math.min(90, v)); } },
      { key: 'y', label: 'Hauteur œil (m)', type: 'number', step: 0.05, get: o => o.pos[1], set: (o, v) => { o.pos[1] = v; } },
      { key: 'ly', label: 'Hauteur visée (m)', type: 'number', step: 0.05, get: o => o.look[1], set: (o, v) => { o.look[1] = v; } }
    ], null, `<div class="ed-row"><button id="btn-cam-up">▲ Avant</button><button id="btn-cam-down">▼ Après</button><button id="btn-cam-preview">Aperçu 3D ↗</button><button id="btn-del">Supprimer</button></div>
      <div class="ed-row"><button id="btn-cam-list">← Toutes les caméras</button></div>`);
    const move = d => { const j = i + d; if (j < 0 || j >= list.length) return; commit(); list.splice(i, 1); list.splice(j, 0, wp); refreshPanel(); draw(); };
    $('btn-cam-up').onclick = () => move(-1);
    $('btn-cam-down').onclick = () => move(1);
    $('btn-cam-preview').onclick = () => previewAt(i);
    $('btn-cam-list').onclick = () => select(null);
    $('btn-del').onclick = deleteSelection;
  }
  async function previewAt(i) {
    const win = window.open('about:blank', '_blank');
    const slug = await save();
    if (slug && win) win.location = `index.html?project=${slug}#wp=${i}`;
    else if (win) win.close();
    else if (slug) location.assign(`index.html?project=${slug}`);
  }

  // Ajuste une pièce aux faces intérieures des murs qui l'entourent (centre des murs)
  function fitRoomToWalls(r) {
    const b = r.bounds, cx = (b.xMin + b.xMax) / 2, cz = (b.zMin + b.zMax) / 2;
    const best = { xMin: b.xMin, xMax: b.xMax, zMin: b.zMin, zMax: b.zMax };
    const dist = { xMin: Infinity, xMax: Infinity, zMin: Infinity, zMax: Infinity };
    S.p.walls.forEach(w => {
      const vertical = Math.abs(w.from[0] - w.to[0]) < 0.01, horizontal = Math.abs(w.from[1] - w.to[1]) < 0.01;
      if (vertical) {
        const x = w.from[0], z0 = Math.min(w.from[1], w.to[1]), z1 = Math.max(w.from[1], w.to[1]);
        if (cz < z0 || cz > z1) return;
        if (x <= cx && Math.abs(x - b.xMin) < dist.xMin && Math.abs(x - b.xMin) < 0.8) { dist.xMin = Math.abs(x - b.xMin); best.xMin = x; }
        if (x >= cx && Math.abs(x - b.xMax) < dist.xMax && Math.abs(x - b.xMax) < 0.8) { dist.xMax = Math.abs(x - b.xMax); best.xMax = x; }
      } else if (horizontal) {
        const z = w.from[1], x0 = Math.min(w.from[0], w.to[0]), x1 = Math.max(w.from[0], w.to[0]);
        if (cx < x0 || cx > x1) return;
        if (z <= cz && Math.abs(z - b.zMin) < dist.zMin && Math.abs(z - b.zMin) < 0.8) { dist.zMin = Math.abs(z - b.zMin); best.zMin = z; }
        if (z >= cz && Math.abs(z - b.zMax) < dist.zMax && Math.abs(z - b.zMax) < 0.8) { dist.zMax = Math.abs(z - b.zMax); best.zMax = z; }
      }
    });
    Object.assign(r.bounds, best);
  }

  // Contrôles d'habitabilité (js/habitability.js) : un avertissement cliquable par point à vérifier.
  function renderChecks(container = $('ed-props')) {
    const list = container?.querySelector('[data-checks-list]') || $('ed-checks-list');
    const title = container?.querySelector('[data-checks-title]') || $('ed-checks-title');
    if (!list || typeof Habitability === 'undefined') return;
    const warnings = Habitability.check({ config: S.p.config, walls: allLevelItems('walls'), rooms: allLevelItems('rooms') });
    if (title) title.textContent = warnings.length ? `Vérifications (${warnings.length})` : 'Vérifications';
    if (!warnings.length) {
      const ok = document.createElement('li');
      ok.className = 'is-ok';
      ok.textContent = 'Aucun point à signaler sur les repères vérifiés.';
      list.replaceChildren(ok);
      return;
    }
    list.replaceChildren(...warnings.map(warning => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = warning.message;
      if (warning.level !== S.activeLevel) button.textContent += warning.level ? ` (étage ${warning.level})` : ' (rez-de-chaussée)';
      button.disabled = !warning.target;
      button.onclick = () => {
        if (warning.level !== S.activeLevel) switchLevel(warning.level);
        select(warning.target);
      };
      item.append(button);
      return item;
    }));
  }

  function projectPanel(target = $('ed-props'), options = {}) {
    const container = target || $('ed-props');
    const inDialog = Boolean(options.inDialog || container !== $('ed-props'));
    const p = S.p;
    const hab = p.rooms.filter(r => r.habitable).reduce((s, r) => s + roomArea(r), 0);
    const nOps = p.walls.reduce((s, w) => s + w.openings.length, 0);
    const pi = p.config.planImage;
    const sheet = p.meta.sheets?.[S.activeLevel] || {};
    const idPrefix = inDialog ? 'dlg-proj-' : '';
    const extrasNote = S.extras ? `<div class="ed-field"><label>Garder caméras & abords</label><input type="checkbox" id="${idPrefix}chk-extras" data-proj="chk-extras" ${S.keepExtras ? 'checked' : ''}></div>
      <p class="ed-note">Décochez pour régénérer automatiquement le parcours caméra, les vues de rendu, les lampes et le jardin après des modifications importantes.</p>` : '';
    const warn = !p.walls.some(w => w.openings.some(o => o.type === 'door' && w.type === 'ext')) && p.walls.length
      ? '<p class="ed-note warn">Aucune porte sur un mur extérieur : l\'entrée de la visite sera devinée.</p>' : '';
    form(inDialog ? '' : 'Projet', p.meta, [
      { key: 'name', label: 'Nom du projet', pdf: true, set: (o, v) => { o.name = String(v).toUpperCase(); if (!o.slugLocked) o.slug = slugify(v); } },
      { key: 'slug', label: 'Dossier', set: (o, v) => { o.slug = slugify(v); o.slugLocked = true; } },
      { key: 'subtitle', label: 'Sous-titre', pdf: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3, set: (o, v) => { o.description = String(v).slice(0, 2000); } },
      { key: 'client', label: 'Client / maître d’ouvrage', pdf: true },
      { key: 'clientVisible', label: 'Afficher le client sur les couvertures partagées', type: 'checkbox' },
      { key: 'reference', label: 'Référence projet', set: (o, v) => { o.reference = String(v).slice(0, 80); } },
      // Cartouche du cahier de plans.
      { key: 'architect', label: 'Architecte responsable', pdf: true, set: (o, v) => { o.architect = String(v).slice(0, 120); } },
      { key: 'location', label: 'Lieu', pdf: true, set: (o, v) => { o.location = String(v).slice(0, 80); } },
      { key: 'phase', label: 'Phase', pdf: true, type: 'select', options: { '': '—', ESQ: 'Esquisse', APS: 'Avant-projet sommaire', APD: 'Avant-projet définitif', PC: 'Permis de construire', DCE: 'Dossier de consultation', EXE: 'Exécution' } },
      { key: 'revision', label: 'Indice du dossier', pdf: true, set: (o, v) => { o.revision = String(v).toUpperCase().slice(0, 4); } },
      { key: 'issueDate', label: 'Date d’édition', pdf: true, type: 'date' },
      { key: 'status', label: 'Statut du dossier', set: (o, v) => { o.status = String(v).slice(0, 80); } },
      // Accueil et signature : parti architectural et contact de l'agence.
      { key: 'concept', label: 'Parti architectural', type: 'textarea', rows: 2, set: (o, v) => { o.concept = String(v).slice(0, 600); } },
      { key: 'contact', label: 'Contact agence', set: (o, v) => { o.contact = String(v).slice(0, 120); } }
    ], null, `
      <fieldset class="ed-sheet-fields"><legend>Métadonnées manuelles — feuille ${S.activeLevel + 1}</legend>
        <div class="ed-field"><label for="${idPrefix}sheet-title">Titre du plan</label><input id="${idPrefix}sheet-title" data-sheet="title" maxlength="160" value="${escapeHtml(sheet.title)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-number">Numéro de feuille</label><input id="${idPrefix}sheet-number" data-sheet="number" maxlength="80" value="${escapeHtml(sheet.number)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-level">Niveau indiqué</label><input id="${idPrefix}sheet-level" data-sheet="level" maxlength="80" value="${escapeHtml(sheet.level)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-revision">Révision</label><input id="${idPrefix}sheet-revision" data-sheet="revision" maxlength="80" value="${escapeHtml(sheet.revision)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-date">Date</label><input id="${idPrefix}sheet-date" data-sheet="date" type="date" value="${escapeHtml(sheet.date)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-status">Statut</label><input id="${idPrefix}sheet-status" data-sheet="status" maxlength="80" value="${escapeHtml(sheet.status)}"></div>
        <div class="ed-field"><label for="${idPrefix}sheet-scale">Échelle connue (saisie manuelle)</label><input id="${idPrefix}sheet-scale" data-sheet="scale" maxlength="80" placeholder="Ex. 1:100" value="${escapeHtml(sheet.scale)}"></div>
        <p class="ed-note">Aucune échelle n’est déduite du nom du fichier. Les champs laissés vides restent absents du cartouche.</p>
      </fieldset>
      <div class="ed-field"><label>Opacité du plan</label><input type="range" id="${idPrefix}rng-opacity" data-proj="rng-opacity" min="0" max="1" step="0.05" value="${S.planOpacity}"></div>
      <div class="ed-field"><label>Hauteur sous plafond</label><input type="number" id="${idPrefix}num-height" data-proj="num-height" step="0.05" value="${p.config.wallHeight}"></div>
      ${extrasNote}
      <p class="ed-note">${pi && S.planImg ? `Échelle du plan : <strong>${pi.pxPerMeter} px/m</strong>${pi.calibrated ? ' (calibré)' : ' (non calibré)'}${pi.rectified ? ' · redressé' : ''}` : 'Commencez par importer l\'image du plan, puis calibrez l\'échelle (K).'}</p>
      ${pi && pi.controlCheck ? `<p class="ed-note ${pi.controlCheck.alert ? 'warn' : ''}">${escapeHtml(pi.controlCheck.message)}</p>` : ''}
      ${pi && S.planImg ? `<div class="ed-row"><button type="button" data-proj="btn-rectify">Redresser perspective (4 pts)</button>${pi.calibrated ? '<button type="button" data-proj="btn-verify-scale">Contrôler sur 2ᵉ cote</button>' : ''}${pi.originalUrl ? '<button type="button" data-proj="btn-restore-plan">Plan d’origine</button>' : ''}</div>` : ''}
      ${warn}
      ${diagnosticHtml(idPrefix)}
      <div class="ed-stats">
        <div class="ed-stat"><strong>${p.walls.length}</strong><span>murs</span></div>
        <div class="ed-stat"><strong>${nOps}</strong><span>ouvertures</span></div>
        <div class="ed-stat"><strong>${p.rooms.length}</strong><span>pièces</span></div>
        <div class="ed-stat"><strong>${hab.toFixed(1).replace('.', ',')} m²</strong><span>habitables</span></div>
      </div>
      <div class="ed-row"><button id="${idPrefix}btn-fit" data-proj="btn-fit" type="button">Cadrer la vue</button><button id="${idPrefix}btn-center" data-proj="btn-center" type="button">Centrer sur l'origine</button></div>
      <section class="ed-checks" aria-labelledby="${idPrefix}ed-checks-title"><h4 id="${idPrefix}ed-checks-title" data-checks-title>Vérifications</h4><ul id="${idPrefix}ed-checks-list" data-checks-list></ul>
        <p class="ed-note">Repères d'habitabilité indicatifs, non réglementaires : ils signalent, ils ne bloquent pas.</p></section>`, container, pdfMissingBannerHtml());
    ['title', 'number', 'level', 'revision', 'date', 'status', 'scale'].forEach(key => {
      const input = container.querySelector(`[data-sheet="${key}"]`);
      if (!input) return;
      input.onchange = () => {
        commit();
        const sheets = p.meta.sheets || (p.meta.sheets = []);
        const current = Object.assign({}, sheets[S.activeLevel] || {});
        if (input.value.trim()) current[key] = input.value.trim(); else delete current[key];
        sheets[S.activeLevel] = current;
        if (!Object.keys(current).length && sheets.every(value => !value || !Object.keys(value).length)) delete p.meta.sheets;
        refreshPanel();
      };
    });
    renderChecks(container);
    const rngOpacity = container.querySelector('[data-proj="rng-opacity"]');
    if (rngOpacity) rngOpacity.oninput = e => {
      S.planOpacity = parseFloat(e.target.value);
      const quick = $('ed-quick-opacity');
      if (quick) quick.value = String(S.planOpacity);
      draw();
    };
    const numHeight = container.querySelector('[data-proj="num-height"]');
    if (numHeight) numHeight.onchange = e => { const v = parseFloat(e.target.value); if (v > 2) { commit(); p.config.wallHeight = v; refreshPanel(); } };
    const chk = container.querySelector('[data-proj="chk-extras"]');
    if (chk) chk.onchange = e => { S.keepExtras = e.target.checked; };
    const btnFit = container.querySelector('[data-proj="btn-fit"]');
    if (btnFit) btnFit.onclick = () => { fitView(); draw(); };
    const btnCenter = container.querySelector('[data-proj="btn-center"]');
    if (btnCenter) btnCenter.onclick = () => { commit(); centerProject(); fitView(); draw(); toast('Projet recentré sur l\'origine'); };
    const btnRectify = container.querySelector('[data-proj="btn-rectify"]');
    if (btnRectify) btnRectify.onclick = () => { if (inDialog) $('dlg-project-info')?.close(); setTool('rectify'); toast('Cliquez les 4 coins du cadre/plan (haut-gauche → sens horaire).'); };
    const btnVerifyScale = container.querySelector('[data-proj="btn-verify-scale"]');
    if (btnVerifyScale) btnVerifyScale.onclick = () => { if (inDialog) $('dlg-project-info')?.close(); setTool('verify-scale'); toast('Cliquez les 2 extrémités d’une 2ᵉ cote connue (loupe active).'); };
    const btnRestorePlan = container.querySelector('[data-proj="btn-restore-plan"]');
    if (btnRestorePlan) btnRestorePlan.onclick = () => restoreOriginalPlanImage();
    wireDiagnostic(container);
  }

  // ---------------------------------------------------------------------------
  // DIAGNOSTIC DU PROJET : circulation (pièces isolées, couloirs non dessinés) et toiture.
  // Calcul mis en cache par empreinte du plan : le panneau se rafraîchit à chaque modification.
  // ---------------------------------------------------------------------------
  let diagCache = null;
  function projectDiagnostic() {
    if (!allLevelItems('walls').length) return null;
    const project = toProjectJson();
    const key = HouseAuto.geometryVersion(project) + '|' + (project.config.roofStyle || 'auto') + '|'
      + JSON.stringify(project.canopies.map(c => [c.type, c.xMin, c.xMax, c.zMin, c.zMax, c.level]));
    if (!diagCache || diagCache.key !== key) {
      try { diagCache = { key, result: HouseAuto.diagnose(project) }; } catch (error) { diagCache = { key, result: null }; }
    }
    return diagCache.result;
  }
  const levelName = level => (level ? 'Étage ' + level : 'RDC');
  function diagnosticHtml(idPrefix = '') {
    const d = projectDiagnostic();
    if (!d) return '';
    const items = [];
    if (d.unreachable.length) {
      items.push(`<p class="ed-note warn"><strong>Pièces non reliées à l’entrée</strong> : ${d.unreachable.map(r => `${escapeHtml(r.name)} (${levelName(r.level)})`).join(', ')}. Ajoutez une porte ou un passage : sinon la visite y saute sans franchir de seuil.</p>`);
    } else {
      items.push(`<p class="ed-note">✓ Circulation : toutes les pièces habitables sont reliées à l’entrée${d.entryRoom ? ` (${escapeHtml(d.entryRoom)})` : ''}.</p>`);
    }
    d.voids.forEach((v, i) => items.push(`<p class="ed-note warn">Couloir non dessiné (${levelName(v.level)}, ≈ ${String(v.area).replace('.', ',')} m²) : des portes y ouvrent sans pièce. La visite le traverse déjà, mais il manque au tableau des surfaces. <button type="button" data-add-void="${i}">Ajouter la pièce « Dégagement »</button></p>`));
    const roofStyle = S.p.config.roofStyle || 'auto';
    const roofNote = d.roof.length
      ? `Aucune toiture tracée : la 3D pose une ${d.roof[0].type === 'hip' ? 'toiture 4 pans (pente 27°, débord 60 cm)' : 'toiture-terrasse (dalle sur l’emprise exacte)'} automatique.${d.roof[0].type === 'hip' && d.footprintFill < 0.85 ? ' Attention : l’emprise est découpée, le 4 pans couvrira aussi ses creux.' : ''}`
      : roofStyle === 'none' ? 'Toiture automatique désactivée.' : '✓ Toiture tracée à la main : elle est utilisée telle quelle.';
    const options = { auto: 'Automatique (toit-terrasse)', hip: '4 pans', flat: 'Toit-terrasse', none: 'Aucune' };
    items.push(`<div class="ed-field"><label for="${idPrefix}sel-roof">Toiture automatique</label><select id="${idPrefix}sel-roof" data-proj="sel-roof">${Object.entries(options).map(([k, l]) => `<option value="${k}"${k === roofStyle ? ' selected' : ''}>${l}</option>`).join('')}</select></div><p class="ed-note">${roofNote}</p>`);
    return `<fieldset class="ed-sheet-fields ed-diagnostic"><legend>Diagnostic du projet</legend>${items.join('')}</fieldset>`;
  }
  function wireDiagnostic(container = $('ed-props')) {
    const scope = container || document;
    const roof = scope.querySelector('[data-proj="sel-roof"]') || $('sel-roof');
    if (roof) roof.onchange = e => { commit(); if (e.target.value === 'auto') delete S.p.config.roofStyle; else S.p.config.roofStyle = e.target.value; refreshPanel(); };
    scope.querySelectorAll('[data-add-void]').forEach(button => button.addEventListener('click', () => {
      const v = projectDiagnostic()?.voids[+button.dataset.addVoid];
      const rooms = v && S.levelData[v.level] ? S.levelData[v.level].rooms : null;
      if (!rooms) return;
      commit();
      let id = 'degagement', n = 2;
      while (allLevelItems('rooms').some(r => r.id === id)) id = 'degagement-' + n++;
      rooms.push({ id, name: 'DÉGAGEMENT', level: v.level, bounds: { ...v.bounds }, floorType: 'tiles', habitable: true, desc: 'Circulation intérieure' });
      S.dirty = true; refreshPanel(); draw();
      toast(`Pièce « Dégagement » ajoutée (${levelName(v.level)}) — vérifiez ses limites sur le plan.`);
    }));
  }

  function buildLibrary() {
    const lib = $('ed-library');
    if (!lib) return;
    const allGroups = ['Tous', ...new Set(FURNITURE.map(f => f.group))];

    const renderList = () => {
      const q = (S.libQuery || '').trim().toLowerCase();
      const filtered = FURNITURE.filter(it => {
        if (S.libGroup !== 'Tous' && it.group !== S.libGroup) return false;
        if (q && !it.name.toLowerCase().includes(q) && !it.group.toLowerCase().includes(q)) return false;
        return true;
      });
      const groups = {};
      filtered.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });

      const frag = [];
      const entries = Object.entries(groups);
      if (!entries.length) {
        const emptyNote = document.createElement('p');
        emptyNote.className = 'ed-note';
        emptyNote.textContent = 'Aucun meuble ne correspond à cette recherche.';
        frag.push(emptyNote);
      } else {
        entries.forEach(([g, items]) => {
          const h4 = document.createElement('h4');
          h4.textContent = g;
          const grid = document.createElement('div');
          grid.className = 'ed-lib';
          items.forEach(it => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.lib = String(FURNITURE.indexOf(it));
            if (S.libItem === it) btn.classList.add('active');
            if (typeof Furniture2D !== 'undefined' && typeof Furniture2D.createThumbnailCanvas === 'function') {
              const thumb = Furniture2D.createThumbnailCanvas(it);
              if (thumb) btn.append(thumb);
            }
            const nameSpan = document.createElement('span');
            nameSpan.className = 'ed-lib-name';
            nameSpan.textContent = it.name;
            const dims = document.createElement('small');
            dims.textContent = `${it.w} × ${it.d} m`;
            btn.append(nameSpan, dims);
            btn.onclick = () => {
              S.libItem = it;
              S.placeRotY = 0;
              if (S.tool !== 'furniture') setTool('furniture');
              else renderList();
              toast(`${it.name} sélectionné — cliquez sur le plan pour poser`);
            };
            grid.append(btn);
          });
          frag.push(h4, grid);
        });
      }
      listHost.replaceChildren(...frag);
    };

    const head = document.createElement('div');
    head.className = 'ed-lib-head';

    const title = document.createElement('h3');
    title.textContent = 'Catalogue mobilier';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'ed-lib-search';
    search.placeholder = 'Rechercher (canapé, lit, douche, îlot…)';
    search.value = S.libQuery || '';
    search.oninput = () => { S.libQuery = search.value; renderList(); };

    const cats = document.createElement('div');
    cats.className = 'ed-lib-cats';
    allGroups.forEach(g => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = g;
      if (S.libGroup === g) b.classList.add('active');
      b.onclick = () => {
        S.libGroup = g;
        cats.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        renderList();
      };
      cats.append(b);
    });

    const tools = document.createElement('div');
    tools.className = 'ed-lib-tools';
    const snapLbl = document.createElement('label');
    const snapChk = document.createElement('input');
    snapChk.type = 'checkbox';
    snapChk.checked = S.wallSnapFurniture;
    snapChk.onchange = () => { S.wallSnapFurniture = snapChk.checked; };
    const snapText = document.createElement('span');
    snapText.textContent = 'Aimant murs';
    snapLbl.append(snapChk, snapText);

    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'ed-primary';
    autoBtn.textContent = 'Meubler auto';
    autoBtn.title = 'Meubler automatiquement toutes les pièces du niveau actif';
    autoBtn.onclick = () => void autoFurnishRooms();
    tools.append(snapLbl, autoBtn);

    head.append(title, search, cats, tools);
    const listHost = document.createElement('div');
    lib.replaceChildren(head, listHost);
    renderList();
  }

  // Décale toute la géométrie pour centrer l'emprise sur (0,0) — l'image du plan suit
  function centerProject() {
    const p = S.p;
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const walls = allLevelItems('walls'), rooms = allLevelItems('rooms');
    // Même translation pour tous les étages : leurs empreintes restent alignées.
    const add = (x, z) => { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
    walls.forEach(w => { add(w.from[0], w.from[1]); add(w.to[0], w.to[1]); });
    rooms.forEach(r => { add(r.bounds.xMin, r.bounds.zMin); add(r.bounds.xMax, r.bounds.zMax); });
    if (!isFinite(xMin)) return { dx: 0, dz: 0 };
    const dx = -r2((xMin + xMax) / 2), dz = -r2((zMin + zMax) / 2);
    if (!dx && !dz) return { dx, dz };
    walls.forEach(w => { w.from = [r2(w.from[0] + dx), r2(w.from[1] + dz)]; w.to = [r2(w.to[0] + dx), r2(w.to[1] + dz)]; });
    rooms.forEach(r => {
      r.bounds = { xMin: r2(r.bounds.xMin + dx), xMax: r2(r.bounds.xMax + dx), zMin: r2(r.bounds.zMin + dz), zMax: r2(r.bounds.zMax + dz) };
      if (r.poly) r.poly = r.poly.map(q => [r2(q[0] + dx), r2(q[1] + dz)]);
    });
    allLevelItems('columns').forEach(c => { c.x = r2(c.x + dx); c.z = r2(c.z + dz); });
    ['canopies', 'stairwells'].forEach(key => allLevelItems(key).forEach(c => { c.xMin = r2(c.xMin + dx); c.xMax = r2(c.xMax + dx); c.zMin = r2(c.zMin + dz); c.zMax = r2(c.zMax + dz); }));
    allLevelItems('furniture').forEach(f => { f.x = r2(f.x + dx); f.z = r2(f.z + dz); });
    // Le parcours suit la maison : sans ce décalage, les caméras enregistrées resteraient à côté des murs.
    (p.tourWaypoints || []).forEach(wp => {
      for (const key of ['pos', 'look']) if (Array.isArray(wp[key])) wp[key] = [r2(wp[key][0] + dx), wp[key][1], r2(wp[key][2] + dz)];
    });
    const pi = p.config.planImage;
    if (pi && pi.originPx) pi.originPx = [pi.originPx[0] - dx * pi.pxPerMeter, pi.originPx[1] - dz * pi.pxPerMeter];
    S.view.ox -= dx * S.view.scale;
    S.view.oy -= dz * S.view.scale;
    return { dx, dz };
  }

  // ---------------------------------------------------------------------------
  // EXPORT & ENREGISTREMENT
  // ---------------------------------------------------------------------------
  function toProjectJson(updated = new Date().toISOString()) {
    const p = JSON.parse(JSON.stringify(S.p));
    const walls = JSON.parse(JSON.stringify(allLevelItems('walls')));
    const rooms = JSON.parse(JSON.stringify(allLevelItems('rooms')));
    const columns = JSON.parse(JSON.stringify(allLevelItems('columns')));
    const canopies = JSON.parse(JSON.stringify(allLevelItems('canopies')));
    const furniture = JSON.parse(JSON.stringify(allLevelItems('furniture')));
    const stairwells = JSON.parse(JSON.stringify(allLevelItems('stairwells')));
    const out = {
      meta: { name: p.meta.name, slug: p.meta.slug, subtitle: p.meta.subtitle || '', client: p.meta.client || '', clientVisible: p.meta.clientVisible === true, updated,
        ...Object.fromEntries(['architect', 'location', 'phase', 'revision', 'reference', 'issueDate', 'status', 'concept', 'contact', 'description'].filter(key => p.meta[key]).map(key => [key, String(p.meta[key])])),
        ...(Array.isArray(p.meta.sheets) ? { sheets: p.meta.sheets.map(sheet => Object.fromEntries(['title', 'number', 'level', 'revision', 'date', 'status', 'scale'].filter(key => sheet?.[key]).map(key => [key, String(sheet[key])]))) } : {}) },
      config: { wallHeight: p.config.wallHeight, floorHeight: p.config.floorHeight || 3 },
      levels: [levelMeta(0), levelMeta(1)],
      walls: walls.map(w => ({ from: w.from, to: w.to, thick: w.thick, type: w.type, level: Number(w.level) || 0,
        openings: w.openings.slice().sort((a, b) => a.at - b.at).map(o => {
          const c = { type: o.type, level: Number(o.level === undefined ? w.level : o.level) || 0, at: r2(o.at), w: o.w, h: o.h, sill: o.sill || 0 };
          if (o.type === 'door') { c.hinge = o.hinge || 'start'; c.side = o.side || 1; if (o.entry) c.entry = true; }
          return c;
        }) })),
      rooms: rooms.map(r => {
        const room = { id: r.id, name: r.name, level: Number(r.level) || 0, bounds: r.poly ? polyBounds(r.poly) : r.bounds, floorType: r.floorType, habitable: !!r.habitable, desc: r.desc || '' };
        if (r.poly) room.poly = r.poly;
        return room;
      }),
      columns,
      canopies,
      stairwells,
      furniture: furniture.map(f => {
        const c = Object.assign({}, f, { y: r2((f.elev || 0) + f.h / 2) });
        delete c.elev;
        return c;
      })
    };
    if (p.config.elevationEnd) out.config.elevationEnd = p.config.elevationEnd;
    if (['hip', 'flat', 'none'].includes(p.config.roofStyle)) out.config.roofStyle = p.config.roofStyle;
    if (Array.isArray(p.tourWaypoints) && p.tourWaypoints.length >= 2) {
      out.tourWaypoints = p.tourWaypoints;
      if (p.tourPlanVersion) out.tourPlanVersion = p.tourPlanVersion;
    }
    if (p.estimate && typeof CostEstimate !== 'undefined') out.estimate = CostEstimate.settings(p.estimate);
    const pi = p.config.planImage;
    if (pi && pi.url) out.config.planImage = { url: pi.url.startsWith('data:') ? '' : pi.url, pxPerMeter: pi.pxPerMeter, originPx: pi.originPx, calibrated: !!pi.calibrated };
    if (p.config.planImages && typeof p.config.planImages === 'object') {
      const cleaned = {};
      for (const [lvl, entry] of Object.entries(p.config.planImages)) {
        if (!entry || !entry.url) continue;
        cleaned[lvl] = {
          url: entry.url.startsWith('data:') ? '' : entry.url,
          pxPerMeter: entry.pxPerMeter,
          originPx: entry.originPx,
          calibrated: !!entry.calibrated,
          ...(entry.sourcePage ? { sourcePage: entry.sourcePage } : {}),
          ...(entry.sourceName ? { sourceName: entry.sourceName } : {})
        };
      }
      if (Object.keys(cleaned).length) out.config.planImages = cleaned;
    }
    if (S.extras && S.keepExtras) Object.assign(out, JSON.parse(JSON.stringify(S.extras)));
    else if (S.extras && S.extras.assets) out.assets = S.extras.assets;
    return out;
  }

  let saving = false;
  function setSaveState(message, error = false) {
    const state = $('ed-save-state');
    state.classList.toggle('is-error', error);
    // Retour animé : coche à l'enregistrement, secousse en cas de refus (css/motion.css).
    if (!message || !window.Motion) { state.textContent = message; return; }
    if (error) Motion.error(state, message, $('btn-save'));
    else if (/enregistr/i.test(message) && !/non enregistr/i.test(message)) Motion.success(state, message);
    else Motion.swap(state, message);
  }

  function downloadProject() {
    const blob = new Blob([JSON.stringify(toProjectJson(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'project.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('project.json exporté. Le fichier image du plan n’est pas inclus.');
  }

  async function save() {
    if (saving) return null;
    if (!allLevelItems('walls').length) { setSaveState('Tracez au moins un mur avant d’enregistrer.', true); return null; }
    const slug = slugify(S.p.meta.slug || S.p.meta.name);
    S.p.meta.slug = slug;
    const tourBefore = tourState();
    const shift = centerProject();
    if (shift.dx || shift.dz) {
      S.keepExtras = false; draw();
      // Le recentrage déplace plan et caméras ensemble : un parcours à jour le reste.
      if (tourBefore === 'fresh') S.p.tourPlanVersion = planVersionNow();
    }
    if (tourBefore === 'stale') toast('Attention : le parcours caméra ne correspond plus au plan (outil Caméras).', true);
    const project = toProjectJson();
    const submitted = JSON.stringify(project);
    const planImage = S.planDataUrl;
    saving = true;
    const locks = ['btn-save', 'btn-preview', 'btn-new', 'btn-open', 'btn-import-villa'];
    locks.forEach(id => { $(id).disabled = true; });
    setSaveState('Enregistrement…');
    try {
      const res = await fetch('api/save-project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, project, planImage })
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('Session non autorisée. Reconnectez-vous dans l’espace privé.');
        if ([404, 405, 501].includes(res.status)) throw new Error('Enregistrement serveur indisponible. Utilisez « Exporter le JSON ».');
        throw new Error(result?.error || `Impossible d’enregistrer le projet (${res.status}).`);
      }
      const newerEdits = submitted !== JSON.stringify(toProjectJson(project.meta.updated)) || planImage !== S.planDataUrl;
      if (result.planImage?.url && planImage && planImage === S.planDataUrl && S.p.config.planImage) {
        S.p.config.planImage.url = result.planImage.url;
        S.planDataUrl = null;
      }
      try { localStorage.setItem('lastProject', slug); } catch { /* stockage facultatif */ }
      void clearServerDraft(slug);
      S.dirty = newerEdits;
      setSaveState(newerEdits ? 'Version enregistrée · nouvelles modifications en attente' : 'Projet enregistré');
      return slug;
    } catch (error) {
      setSaveState(error instanceof TypeError ? 'Connexion au serveur perdue. Réessayez ou exportez le JSON.' : error.message, true);
      S.dirty = true;
      return null;
    } finally {
      saving = false;
      locks.forEach(id => { $(id).disabled = false; });
      $('ed-project-name').textContent = S.p.meta.name + (S.dirty ? ' •' : '');
    }
  }

  async function openDialog() {
    if (saving) return;
    const dlg = $('dlg-open');
    const list = $('dlg-open-list');
    const status = $('dlg-open-status');
    list.replaceChildren();
    status.textContent = 'Chargement des projets…';
    dlg.showModal();
    try {
      const response = await fetch('api/projects', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const items = await response.json();
      status.textContent = items.length ? '' : 'Aucun projet enregistré pour l’instant.';
      items.forEach(it => {
        const button = document.createElement('button');
        const title = document.createElement('span');
        title.textContent = it.name;
        const details = document.createElement('small');
        details.textContent = `${it.slug} · ${new Date(it.updated).toLocaleDateString('fr-FR')}`;
        button.append(title, details);
        button.onclick = async () => {
          if (!confirmLose() || list.getAttribute('aria-busy') === 'true') return;
          list.setAttribute('aria-busy', 'true');
          status.textContent = 'Ouverture du projet…';
          try {
            const reply = await fetch(`projects/${encodeURIComponent(it.slug)}/project.json`, { cache: 'no-store' });
            if (!reply.ok) throw new Error();
            const data = await reply.json();
            if (!dlg.open || !list.contains(button)) return;
            data.meta = { ...data.meta, slug: it.slug, slugLocked: true };
            loadProject(data, { keepExtras: true });
            try { localStorage.setItem('lastProject', it.slug); } catch { /* stockage facultatif */ }
            dlg.close();
            toast('Projet ouvert : ' + it.name);
          } catch { status.textContent = 'Impossible d’ouvrir ce projet. Réessayez ou importez un fichier.'; }
          finally { list.removeAttribute('aria-busy'); }
        };
        list.appendChild(button);
      });
    } catch {
      status.textContent = 'Liste indisponible. Réessayez ou importez un fichier project.json.';
    }
  }

  let toastTimer = null;
  function toast(msg, warn) {
    const t = $('ed-toast');
    t.textContent = msg;
    t.style.background = warn ? '#b45309' : '';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------------------------------------------------------------------------
  // BOUTONS DU HAUT
  // ---------------------------------------------------------------------------
  const confirmLose = () => !S.dirty || confirm('Des modifications ne sont pas enregistrées. Continuer ?');
  $('btn-new').onclick = () => { if (confirmLose()) { loadProject(emptyProject()); setTool('select'); toast('Nouveau projet : importez l\'image du plan'); } };
  $('btn-open').onclick = openDialog;
  document.querySelectorAll('.ed-level-tabs [data-level]').forEach(b => b.addEventListener('click', () => switchLevel(b.dataset.level)));
  $('ed-ghost-toggle').addEventListener('change', draw);
  $('dlg-open-close').onclick = () => $('dlg-open').close();
  $('btn-import-villa').onclick = () => {
    if (!confirmLose()) return;
    const villa = JSON.parse(JSON.stringify(window.HOUSE_DATA));
    villa.meta = { name: 'VILLA SERENA', slug: 'villa-serena', subtitle: 'Villa contemporaine de plain-pied — plan d’origine : Eng Dollar' };
    loadProject(villa, { keepExtras: true });
    toast('Villa Serena chargée depuis js/data.js');
  };
  $('file-plan').onchange = e => { if (e.target.files[0]) importPlanFile(e.target.files[0]); e.target.value = ''; };
  const editorStage = $('ed-stage');
  const dropOverlay = $('ed-drop-overlay');
  const isFileDrag = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  editorStage.addEventListener('dragenter', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
  });
  editorStage.addEventListener('dragover', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropOverlay.classList.remove('hidden');
  });
  editorStage.addEventListener('dragleave', e => {
    if (!editorStage.contains(e.relatedTarget)) dropOverlay.classList.add('hidden');
  });
  editorStage.addEventListener('drop', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    importPlanFile(e.dataTransfer.files[0]);
  });
  $('file-json').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !confirmLose()) return;
    f.text().then(t => {
      const data = JSON.parse(t);
      if (!data || !Array.isArray(data.walls) || !Array.isArray(data.rooms)) throw new Error();
      loadProject(data, { keepExtras: true });
      $('dlg-open').close();
      toast('Projet importé');
    }).catch(() => { $('dlg-open-status').textContent = 'Ce fichier ne contient pas un projet valide.'; });
  };
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;
  $('btn-save').onclick = save;
  $('btn-export-json').onclick = downloadProject;
  $('btn-preview').onclick = async () => {
    const win = window.open('about:blank', '_blank');
    const slug = await save();
    if (slug && win) win.location = `index.html?project=${slug}`;
    else if (win) win.close();
    else if (slug) location.assign(`index.html?project=${slug}`);
  };
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------------------
  // DÉMARRAGE
  // ---------------------------------------------------------------------------
  async function fetchCabinetProfile() {
    try {
      const response = await fetch('api/cabinet/profile', { cache: 'no-store' });
      if (!response.ok) return;
      cabinetProfile = await response.json();
      if (S.p && !S.p.meta.architect && cabinetProfile.architect) {
        S.p.meta.architect = cabinetProfile.architect;
        refreshPanel();
      }
    } catch { /* profil facultatif en mode hors ligne */ }
  }
  $('btn-cabinet').onclick = async () => {
    await fetchCabinetProfile();
    $('cabinet-name').value = cabinetProfile.name || '';
    $('cabinet-architect').value = cabinetProfile.architect || '';
    const preview = $('cabinet-logo-preview');
    preview.hidden = !cabinetProfile.logoUrl;
    if (cabinetProfile.logoUrl) preview.src = cabinetProfile.logoUrl;
    pendingCabinetLogo = undefined;
    $('cabinet-logo').value = '';
    $('cabinet-status').textContent = '';
    $('dlg-cabinet').showModal();
  };
  $('cabinet-logo').onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) {
      $('cabinet-status').textContent = 'Choisissez un PNG transparent de moins de 2 Mo.';
      event.target.value = '';
      return;
    }
    pendingCabinetLogo = await new Promise(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(null); reader.readAsDataURL(file);
    });
    if (pendingCabinetLogo) { $('cabinet-logo-preview').src = pendingCabinetLogo; $('cabinet-logo-preview').hidden = false; }
  };
  $('cabinet-remove-logo').onclick = () => {
    pendingCabinetLogo = '';
    $('cabinet-logo-preview').hidden = true;
    $('cabinet-logo').value = '';
    $('cabinet-status').textContent = 'Le nom du cabinet sera utilisé à la place du logo.';
  };
  $('cabinet-close').onclick = () => $('dlg-cabinet').close();
  $('cabinet-save').onclick = async () => {
    const button = $('cabinet-save'); button.disabled = true;
    try {
      const body = { name: $('cabinet-name').value, architect: $('cabinet-architect').value };
      if (pendingCabinetLogo !== undefined) body.logo = pendingCabinetLogo;
      const response = await fetch('api/cabinet/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Profil non enregistré.');
      const previousArchitect = cabinetProfile.architect;
      cabinetProfile = result;
      if (!S.p.meta.architect || S.p.meta.architect === previousArchitect) {
        commit(); S.p.meta.architect = cabinetProfile.architect; refreshPanel();
      }
      $('cabinet-status').textContent = 'Profil Cabinet enregistré.';
    } catch (error) { $('cabinet-status').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('dlg-cabinet').addEventListener('close', () => { pendingCabinetLogo = undefined; });
  const btnProjectInfo = $('btn-project-info');
  if (btnProjectInfo) btnProjectInfo.onclick = openProjectInfoDialog;
  const btnProjectInfoClose = $('dlg-project-info-close');
  if (btnProjectInfoClose) btnProjectInfoClose.onclick = () => $('dlg-project-info')?.close();
  const btnDeliverables = $('btn-deliverables');
  const dlgDeliverables = $('dlg-deliverables');
  const btnDeliverablesClose = $('dlg-deliverables-close');
  if (btnDeliverablesClose && dlgDeliverables) btnDeliverablesClose.onclick = () => dlgDeliverables.close();
  if (btnDeliverables && dlgDeliverables) {
    btnDeliverables.onclick = () => {
      if (typeof DeliverableChecklist === 'undefined') return;
      const slug = S.p?.meta?.slug || slugify(S.p?.meta?.name || '');
      DeliverableChecklist.openDashboard({
        dialogEl: dlgDeliverables,
        bodyEl: $('dlg-deliverables-body'),
        statusEl: $('dlg-deliverables-status'),
        slug,
        project: toProjectJson(),
        cabinet: cabinetProfile,
        onExport: async docId => {
          const stEl = $('dlg-deliverables-status');
          if (docId === 'aps') { dlgDeliverables.close(); $('btn-aps')?.click(); return; }
          if (docId === 'catalog') { dlgDeliverables.close(); $('btn-export-premium')?.click(); return; }
          if (docId === 'book' && typeof PlanBook !== 'undefined' && typeof PlanBook.exportBook === 'function') {
            if (stEl) stEl.textContent = 'Assemblage du cahier de plans A3…';
            await PlanBook.exportBook({ data: toProjectJson(), studio: null, cabinet: cabinetProfile });
            if (stEl) stEl.textContent = 'Cahier de plans A3 exporté.';
            return;
          }
          if (docId === 'synthesis' && typeof PlanBook !== 'undefined' && typeof PlanBook.exportSynthesisBoard === 'function') {
            if (stEl) stEl.textContent = 'Export de la planche de synthèse A3…';
            await PlanBook.exportSynthesisBoard({ data: toProjectJson(), studio: null });
            if (stEl) stEl.textContent = 'Planche de synthèse A3 exportée.';
            return;
          }
          if (slug) location.assign(`index.html?project=${encodeURIComponent(slug)}`);
          else if (stEl) stEl.textContent = 'Enregistrez d’abord le projet pour lancer cet export depuis la visite 3D.';
        }
      });
    };
  }
  async function openProjectBySlug(rawSlug) {
    const slug = slugify(rawSlug || '');
    if (!slug) return false;
    try {
      const reply = await fetch(`projects/${encodeURIComponent(slug)}/project.json`, { cache: 'no-store' });
      if (!reply.ok) throw new Error('not-found');
      const data = await reply.json();
      data.meta = { ...data.meta, slug, slugLocked: true };
      loadProject(data, { keepExtras: true });
      try { localStorage.setItem('lastProject', slug); } catch { /* stockage facultatif */ }
      void checkServerDraft(slug, data.meta?.updated);
      toast('Projet ouvert : ' + (data.meta.name || slug));
      return true;
    } catch {
      if (slug === 'villa-serena' && window.HOUSE_DATA) {
        const villa = JSON.parse(JSON.stringify(window.HOUSE_DATA));
        villa.meta = { name: 'VILLA SERENA', slug: 'villa-serena', slugLocked: true, subtitle: 'Villa contemporaine de plain-pied — plan d’origine : Eng Dollar' };
        loadProject(villa, { keepExtras: true });
        toast('Villa Serena chargée');
        return true;
      }
      return false;
    }
  }

  function loadStarterTemplate(kind) {
    if (typeof Furniture2D === 'undefined' || typeof Furniture2D.getStarterTemplate !== 'function') return;
    if (!confirmLose()) return;
    const tpl = Furniture2D.getStarterTemplate(kind);
    loadProject(tpl, { keepExtras: false });
    setTool('select');
    if (window.EditorLive3D && typeof window.EditorLive3D.setMode === 'function') {
      window.EditorLive3D.setMode('split');
    }
    toast(`Modèle « ${tpl.meta.name} » chargé en vue 2D + 3D temps réel`);
  }

  // Branchement onglets panneau droit, barre CAO, démarrage rapide et bannière brouillon
  document.querySelectorAll('#ed-panel-tabs [data-panel-tab]').forEach(btn => {
    btn.addEventListener('click', () => setPanelTab(btn.dataset.panelTab));
  });
  document.querySelectorAll('#ed-cad-bar [data-view-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.EditorLive3D && typeof window.EditorLive3D.setMode === 'function') {
        window.EditorLive3D.setMode(btn.dataset.viewMode);
        refreshPanel();
      }
    });
  });
  const bindCadToggle = (id, key, labelText) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', () => {
      S[key] = !S[key];
      el.classList.toggle('active', S[key]);
      el.setAttribute('aria-pressed', String(S[key]));
      draw();
      toast(`${labelText} : ${S[key] ? 'activé' : 'masqué'}`);
    });
  };
  bindCadToggle('cad-toggle-dims', 'showDims', 'Cotes automatiques');
  bindCadToggle('cad-toggle-grid', 'showGrid', 'Grille métrique');
  bindCadToggle('cad-toggle-snap', 'snapEnabled', 'Aimantation CAO');

  const zoomBy = factor => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const before = toWorld(cx, cy);
    S.view.scale = Math.max(6, Math.min(400, S.view.scale * factor));
    S.view.ox = cx - before.x * S.view.scale;
    S.view.oy = cy - before.z * S.view.scale;
    $('ed-scale').textContent = `${Math.round(S.view.scale)} px/m`;
    draw();
  };
  $('cad-zoom-in')?.addEventListener('click', () => zoomBy(1.22));
  $('cad-zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.22));
  $('cad-zoom-fit')?.addEventListener('click', () => { fitView(); draw(); });

  $('empty-start-import')?.addEventListener('click', () => $('file-plan')?.click());
  $('empty-start-wall')?.addEventListener('click', () => setTool('wall-ext'));
  $('empty-start-villa')?.addEventListener('click', () => $('btn-import-villa')?.click());
  document.querySelectorAll('[data-starter-template]').forEach(btn => {
    btn.addEventListener('click', () => loadStarterTemplate(btn.dataset.starterTemplate));
  });

  $('ed-draft-restore')?.addEventListener('click', () => {
    if (!S.pendingDraft?.project) return;
    const proj = S.pendingDraft.project;
    S.pendingDraft = null;
    if ($('ed-draft-banner')) $('ed-draft-banner').hidden = true;
    loadProject(proj, { keepExtras: true });
    S.dirty = true;
    setSaveState('Brouillon restauré — pensez à enregistrer');
    toast('Brouillon automatique restauré');
  });
  $('ed-draft-dismiss')?.addEventListener('click', () => {
    const slug = S.pendingDraft?.slug || S.p?.meta?.slug;
    if ($('ed-draft-banner')) $('ed-draft-banner').hidden = true;
    S.pendingDraft = null;
    if (slug) void clearServerDraft(slug);
  });

  void fetchCabinetProfile();
  buildLibrary();
  window.addEventListener('resize', resize);
  loadProject(emptyProject());
  setTool('select');
  resize();
  const initialSlug = typeof URLSearchParams === 'function' && typeof location !== 'undefined'
    ? (new URLSearchParams(location.search).get('project') || new URLSearchParams(location.search).get('p'))
    : null;
  if (initialSlug) {
    void openProjectBySlug(initialSlug).then(ok => {
      if (!ok) toast('Projet introuvable — ouvrez un dossier ou importez un plan', true);
    });
  } else {
    toast('Importez l\'image d\'un plan, ou démarrez depuis un modèle 2D + 3D');
  }
  window.__editor = S; // débogage
  // API interne pour les modules complémentaires (lecture IA, caméras, vue 3D temps réel…)
  const addOverlayRenderer = fn => { if (typeof fn === 'function') customOverlays.push(fn); };
  const addCanvasClickHandler = fn => { if (typeof fn === 'function') customClickHandlers.push(fn); };
  window.EditorAPI = { S, commit, refreshPanel, draw, toast, fitView, setTool, setPanelTab, select, switchLevel, loadProject, openProjectBySlug, loadStarterTemplate, autoFurnishRooms, projectPanel, openProjectInfoDialog, planPdfImport, applyPdfImportSelection, finishRectification, finishScaleControl, restoreOriginalPlanImage, setReviewOverlay, focusWorldPoint, addOverlayRenderer, addCanvasClickHandler, toScreen, toWorld, nearestWall, FURNITURE, OPENINGS, wallLen, projectOnWall, slugify, r2, round, allLevelItems, toProjectJson };
})();
