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
  const FURNITURE = [
    { group: 'Séjour', name: 'Canapé 3 places', model: 'sofa', w: 1.8, d: 0.9, h: 0.8, color: '#6b6560' },
    { group: 'Séjour', name: 'Canapé 2 places', model: 'sofa', w: 1.5, d: 0.9, h: 0.8, color: '#6b6560' },
    { group: 'Séjour', name: 'Fauteuil', model: 'sofa', w: 0.9, d: 0.85, h: 0.8, color: '#6b6560' },
    { group: 'Séjour', name: 'Table basse', model: 'coffeeTable', w: 1.2, d: 0.6, h: 0.4, color: '#967856' },
    { group: 'Séjour', name: 'Meuble TV', w: 1.8, d: 0.45, h: 0.5, color: '#2b2c2e' },
    { group: 'Séjour', name: 'Tapis', w: 2.4, d: 1.7, h: 0.02, color: '#e8e0d2' },
    { group: 'Repas', name: 'Table à manger', model: 'diningTable', w: 0.9, d: 1.8, h: 0.76, color: '#8a6a4a' },
    { group: 'Repas', name: 'Chaise', model: 'chair', w: 0.45, d: 0.45, h: 0.9, color: '#2e2f31' },
    { group: 'Repas', name: 'Buffet', w: 1.6, d: 0.45, h: 0.8, color: '#5b4632' },
    { group: 'Cuisine', name: 'Plan de travail', w: 2.4, d: 0.6, h: 0.9, color: '#3b3f44' },
    { group: 'Cuisine', name: 'Évier inox', w: 0.7, d: 0.45, h: 0.03, elev: 0.9, color: '#a9adb1' },
    { group: 'Cuisine', name: 'Meuble haut', w: 1.0, d: 0.35, h: 0.7, elev: 1.55, color: '#c9b59a' },
    { group: 'Cuisine', name: 'Réfrigérateur', model: 'fridge', w: 0.65, d: 0.65, h: 1.85, color: '#d7d9db' },
    { group: 'Chambre', name: 'Lit double 160', model: 'bed', w: 1.6, d: 2.0, h: 0.5, color: '#d9d4cc' },
    { group: 'Chambre', name: 'Lit king 180', model: 'bed', w: 1.8, d: 2.0, h: 0.52, color: '#d9d4cc' },
    { group: 'Chambre', name: 'Lit simple 90', model: 'bed', w: 0.9, d: 2.0, h: 0.5, color: '#d9d4cc' },
    { group: 'Chambre', name: 'Chevet', model: 'nightstand', w: 0.45, d: 0.4, h: 0.5, color: '#8a6a4a' },
    { group: 'Chambre', name: 'Armoire', w: 1.2, d: 0.6, h: 2.2, color: '#efebe4' },
    { group: 'Chambre', name: 'Bureau', model: 'diningTable', w: 1.2, d: 0.6, h: 0.75, color: '#8a6a4a' },
    { group: 'Eau', name: 'Cuvette WC', model: 'toilet', w: 0.4, d: 0.62, h: 0.42, color: '#f7f7f5' },
    { group: 'Eau', name: 'Lave-mains', w: 0.5, d: 0.35, h: 0.15, elev: 0.78, color: '#f7f7f5' },
    { group: 'Eau', name: 'Douche', w: 0.9, d: 0.9, h: 0.05, color: '#e8ecee' },
    { group: 'Eau', name: 'Baignoire', w: 1.7, d: 0.75, h: 0.55, color: '#f5f6f6' },
    { group: 'Déco', name: 'Plante', model: 'plantTall', w: 0.5, d: 0.5, h: 1.2, color: '#4f6b3a' },
    { group: 'Déco', name: 'Étagères', w: 1.1, d: 0.4, h: 1.8, color: '#8d8f91' }
  ];
  const FLOORS = { parquet: 'Parquet', tiles: 'Carrelage', stone: 'Pierre / dallage', concrete: 'Béton' };
  const FLOOR_COLORS = { parquet: 'rgba(201,160,110,0.32)', tiles: 'rgba(170,185,195,0.35)', stone: 'rgba(190,180,160,0.38)', concrete: 'rgba(160,160,160,0.3)' };
  const OPENINGS = {
    door: { type: 'door', w: 0.85, h: 2.1, sill: 0, hinge: 'start', side: 1 },
    window: { type: 'window', w: 1.2, h: 1.25, sill: 0.95 },
    open: { type: 'open', w: 1.4, h: 2.4, sill: 0 }
  };
  const HINTS = {
    select: 'Cliquez un élément pour le modifier · glissez pour le déplacer · glissez une extrémité de mur pour l\'ajuster',
    calibrate: 'Cliquez les deux extrémités d\'une cote connue du plan, puis saisissez sa longueur réelle',
    'wall-ext': 'Cliquez point après point · Échap ou double-clic pour terminer · Alt : mur en biais',
    'wall-int': 'Cliquez point après point · Échap ou double-clic pour terminer · Alt : cloison en biais',
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
    furniture: 'Choisissez un meuble à droite puis cliquez pour le poser · R : +15° · Maj+R : −15°',
    camera: 'Glissez une caméra pour la déplacer, son losange pour l\'orienter · clic dans le vide : nouvelle étape · Suppr : retirer'
  };

  // ---------------------------------------------------------------------------
  // ÉTAT
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('ed-canvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

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
    ghostLevel: true
  };

  const LEVEL_ARRAYS = ['walls', 'rooms', 'columns', 'canopies', 'furniture', 'stairwells'];
  function levelMeta(level) {
    return { id: level, name: level === 0 ? 'Rez-de-chaussée' : `Étage ${level}`, elevation: level * (S.p && S.p.config.floorHeight || 3) };
  }
  function switchLevel(level, markDirty = false) {
    level = Number(level) || 0;
    if (level < 0 || level > 1 || level === S.activeLevel || !S.p) return;
    LEVEL_ARRAYS.forEach(key => { S.levelData[S.activeLevel][key] = S.p[key] || []; });
    if (!S.levelData[level]) S.levelData[level] = Object.fromEntries(LEVEL_ARRAYS.map(key => [key, []]));
    S.activeLevel = level;
    LEVEL_ARRAYS.forEach(key => { S.p[key] = S.levelData[level][key] || (S.levelData[level][key] = []); });
    // Les snapshots d'annulation ne contiennent que l'étage actif ; ne pas les rejouer
    // après un changement de niveau sur les tableaux d'un autre étage.
    S.undo = []; S.redo = [];
    S.sel = null; S.draft = null; S.drag = null;
    document.querySelectorAll('.ed-level-tabs [data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === level));
    if (markDirty) { S.dirty = true; }
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

  // Aimantation : extrémités de murs, alignements, grille 5 cm
  function snapPoint(pt, from, opts = {}) {
    let x = pt.x, z = pt.z;
    if (opts.free) return { x, z };
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
        if (Math.abs(e[0] - pt.x) < tol) x = e[0];
        if (Math.abs(e[1] - pt.z) < tol) z = e[1];
      }
      // murs orthogonaux par défaut
      if (from && !opts.diagonal) { if (Math.abs(x - from.x) > Math.abs(z - from.z)) z = from.z; else x = from.x; }
    }
    return { x: r2(x), z: r2(z) };
  }

  // ---------------------------------------------------------------------------
  // HISTORIQUE
  // ---------------------------------------------------------------------------
  function snapshot() { return JSON.stringify(S.p); }
  function commit() {
    S.undo.push(snapshot());
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
    S.dirty = true;
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
  const EDITABLE = ['meta', 'config', 'walls', 'rooms', 'columns', 'canopies', 'furniture', 'stairwells', 'levels', 'tourWaypoints'];

  function loadProject(data, { keepExtras = false } = {}) {
    const src = JSON.parse(JSON.stringify(data));
    const p = emptyProject();
    p.meta = Object.assign(p.meta, src.meta || {});
    p.config = Object.assign(p.config, { wallHeight: (src.config && src.config.wallHeight) || 2.8, floorHeight: (src.config && src.config.floorHeight) || 3, planImage: src.config && src.config.planImage || null });
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
    document.querySelectorAll('.ed-level-tabs [data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === 0));
    S.planDataUrl = null;
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
    loadPlanImage(dataUrl);
    setTool('calibrate');
    toast(`${sourceLabel} — calibrez maintenant l'échelle sur une cote connue`);
  }

  async function renderPdfPage(file) {
    if (!window.pdfjsLib) throw new Error('PDF.js n’est pas disponible. Vérifiez la connexion Internet puis rechargez l’éditeur.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, 3600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const raster = document.createElement('canvas');
    raster.width = Math.round(viewport.width);
    raster.height = Math.round(viewport.height);
    const context = raster.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, raster.width, raster.height);
    await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
    const dataUrl = raster.toDataURL('image/png');
    pdf.destroy();
    return { dataUrl, width: raster.width, height: raster.height };
  }

  async function importPlanFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      try {
        toast('Rendu de la première page du PDF en haute résolution…');
        const rendered = await renderPdfPage(file);
        importPlanDataUrl(rendered.dataUrl, `PDF rendu (${rendered.width} × ${rendered.height} px)`);
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
      ctx.strokeStyle = '#17796e';
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
      label('TRÉMIE', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 9, '#b45309');
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

    // Mobilier
    S.p.furniture.forEach(f => {
      const c = toScreen(f.x, f.z);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(-(f.rotY || 0));
      const sel = isSel('furniture', f);
      ctx.fillStyle = (f.color || '#999') + 'cc';
      ctx.strokeStyle = sel ? '#d97706' : 'rgba(17,24,39,0.55)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.fillRect(-f.w * k / 2, -f.d * k / 2, f.w * k, f.d * k);
      ctx.strokeRect(-f.w * k / 2, -f.d * k / 2, f.w * k, f.d * k);
      // Avant local (0, +d/2), cohérent avec la rotation Three.js.
      ctx.fillStyle = 'rgba(17,24,39,0.6)';
      ctx.beginPath(); ctx.arc(0, f.d * k * 0.38, Math.max(2, k * 0.05), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (k > 35 && f.w * k > 34) label(f.name, c.x, c.y, 9, '#1d252c', 600);
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
          ctx.strokeStyle = opSel ? '#d97706' : (op.entry ? '#17796e' : '#2b3440');
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

    if (S.tool === 'camera' || (S.sel && S.sel.kind === 'camera')) drawCameras();
    drawDraft();
  }

  function drawDraft() {
    const k = S.view.scale;
    const h = S.hover;
    if (S.draft && (S.draft.kind === 'wall' || S.draft.kind === 'calibrate') && h) {
      const a = S.draft.kind === 'calibrate' ? S.draft.screenA : toScreen(S.draft.from.x, S.draft.from.z);
      const bpt = S.draft.kind === 'calibrate' ? h.screen : toScreen(h.snap.x, h.snap.z);
      ctx.strokeStyle = S.draft.kind === 'calibrate' ? '#d97706' : 'rgba(23,121,110,0.9)';
      ctx.lineWidth = S.draft.kind === 'calibrate' ? 2 : Math.max(3, (S.tool === 'wall-ext' ? 0.25 : 0.15) * k);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bpt.x, bpt.y); ctx.stroke();
      if (S.draft.kind === 'wall') {
        const L = Math.hypot(h.snap.x - S.draft.from.x, h.snap.z - S.draft.from.z);
        label(`${L.toFixed(2)} m`, (a.x + bpt.x) / 2, (a.y + bpt.y) / 2 - 14, 12, '#17796e');
      }
    }
    if (S.draft && S.draft.kind === 'poly' && S.draft.pts.length) {
      ctx.strokeStyle = '#17796e'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(23,121,110,0.12)';
      ctx.beginPath();
      S.draft.pts.forEach((p, i) => { const s = toScreen(p[0], p[1]); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if (h) { const last = S.draft.pts[S.draft.pts.length - 1]; const sp = snapPoint(h.world, { x: last[0], z: last[1] }, {}); const s = toScreen(sp.x, sp.z); ctx.lineTo(s.x, s.y); }
      ctx.fill(); ctx.stroke();
      S.draft.pts.forEach(p => { const s = toScreen(p[0], p[1]); ctx.fillStyle = '#17796e'; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
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
      ctx.strokeStyle = '#17796e'; ctx.lineWidth = 1.5;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      const w = Math.abs(h.snap.x - S.draft.from.x), d = Math.abs(h.snap.z - S.draft.from.z);
      label(`${w.toFixed(2)} × ${d.toFixed(2)} m · ${(w * d).toFixed(1)} m²`, (p1.x + p2.x) / 2, p1.y - 12, 11, '#17796e');
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
        label(`${at.toFixed(2)} m depuis le début du mur`, m.x, m.y - 16, 10, '#17796e', 600);
      }
    }
    if (h && S.tool === 'furniture' && S.libItem) {
      const it = S.libItem, c = toScreen(h.snap.x, h.snap.z);
      ctx.strokeStyle = '#17796e'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - it.w * k / 2, c.y - it.d * k / 2, it.w * k, it.d * k);
      ctx.setLineDash([]);
    }
    if (h && S.tool !== 'select') {
      const s = toScreen(h.snap.x, h.snap.z);
      ctx.strokeStyle = '#17796e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.stroke();
    }
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
  function ensureCameras() {
    if (S.p.tourWaypoints && S.p.tourWaypoints.length) return;
    if (!S.p.walls.length) return;
    S.p.tourWaypoints = generateCameras();
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

  function addFurniture(pt) {
    const it = S.libItem;
    commit();
    const f = { name: it.name, level: S.activeLevel, x: r2(pt.x), z: r2(pt.z), w: it.w, d: it.d, h: it.h, elev: it.elev || 0, color: it.color, rotY: 0, dims: 'local' };
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
    toast(`Échelle : ${pi.pxPerMeter} px/m — tracez maintenant les murs extérieurs (M)`);
    setTool('wall-ext');
  }

  // ---------------------------------------------------------------------------
  // SOURIS & CLAVIER
  // ---------------------------------------------------------------------------
  function evtPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const world = toWorld(sx, sy);
    const from = S.draft && S.draft.kind === 'wall' ? S.draft.from : null;
    const snap = snapPoint(world, from, { free: e.shiftKey, diagonal: e.altKey });
    return { screen: { x: sx, y: sy }, world, snap };
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    const P = evtPoint(e);
    if (e.button === 2 || e.button === 1 || S.space) {
      S.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
      return;
    }
    if (e.button !== 0) return;
    switch (S.tool) {
      case 'select': {
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
      case 'wall-ext':
      case 'wall-int':
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
      case 'furniture':
        addFurniture(snapPoint(P.world, null, { free: e.shiftKey }));
        break;
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
    const P = evtPoint(e);
    S.hover = P;
    $('ed-coords').textContent = `x ${P.snap.x.toFixed(2)} · z ${P.snap.z.toFixed(2)} m`;
    const d = S.drag;
    if (d && d.kind === 'pan') {
      S.view.ox = d.ox + (e.clientX - d.sx);
      S.view.oy = d.oy + (e.clientY - d.sy);
    } else if (d && d.kind === 'endpoint') {
      const pt = snapPoint(P.world, null, { free: e.shiftKey });
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
      const dx = round(P.world.x - d.start.x, e.shiftKey ? 0.01 : 0.05), dz = round(P.world.z - d.start.z, e.shiftKey ? 0.01 : 0.05);
      const o = d.orig, obj = d.hit.obj;
      if (!d.moved && (dx !== 0 || dz !== 0)) { commit(); d.moved = true; }
      if (!d.moved) { draw(); return; }
      if (d.hit.kind === 'furniture' || d.hit.kind === 'column') { obj.x = r2(o.x + dx); obj.z = r2(o.z + dz); }
      else if (d.hit.kind === 'room') {
        Object.assign(obj.bounds, { xMin: r2(o.bounds.xMin + dx), xMax: r2(o.bounds.xMax + dx), zMin: r2(o.bounds.zMin + dz), zMax: r2(o.bounds.zMax + dz) });
        if (o.poly) obj.poly = o.poly.map(p => [r2(p[0] + dx), r2(p[1] + dz)]);
      }
      else if (d.hit.kind === 'canopy' || d.hit.kind === 'stairwell') { Object.assign(obj, { xMin: r2(o.xMin + dx), xMax: r2(o.xMax + dx), zMin: r2(o.zMin + dz), zMax: r2(o.zMax + dz) }); }
      else if (d.hit.kind === 'wall') { obj.from = [r2(o.from[0] + dx), r2(o.from[1] + dz)]; obj.to = [r2(o.to[0] + dx), r2(o.to[1] + dz)]; }
      else if (d.hit.kind === 'opening') {
        const w = d.hit.wall, L = wallLen(w);
        obj.at = r2(Math.max(obj.w / 2, Math.min(L - obj.w / 2, round(projectOnWall(w, P.world).at, e.shiftKey ? 0.01 : 0.05))));
      }
    }
    draw();
  });

  window.addEventListener('mouseup', e => {
    const d = S.drag;
    S.drag = null;
    if (d && d.kind === 'camera' && d.moved) refreshPanel();
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
  canvas.addEventListener('dblclick', () => { if (S.draft && S.draft.kind === 'wall') { S.draft = null; draw(); } else closePolyDraft(); });

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

  const TOOL_KEYS = { KeyV: 'select', KeyK: 'calibrate', KeyM: 'wall-ext', KeyC: 'wall-int', KeyD: 'door', KeyF: 'window', KeyB: 'open', KeyA: 'room', KeyW: 'room-auto', KeyP: 'room-poly', KeyO: 'column', KeyU: 'slab', KeyG: 'pergola', KeyE: 'furniture', KeyT: 'camera' };

  window.addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.code === 'Space') { S.space = true; canvas.style.cursor = 'grab'; e.preventDefault(); return; }
    if (e.code === 'Enter' && closePolyDraft()) return;
    if (e.code === 'Escape') { if (S.draft) S.draft = null; else select(null); draw(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelection(); return; }
    if (e.code === 'KeyR' && S.sel && S.sel.kind === 'furniture') { rotateFurniture(S.sel.obj, e.shiftKey ? -1 : 1); return; }
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
  // OUTILS & PANNEAU
  // ---------------------------------------------------------------------------
  function setTool(t) {
    S.tool = t;
    S.draft = null;
    document.querySelectorAll('#ed-tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    $('ed-hint').textContent = HINTS[t] || '';
    $('ed-library').classList.toggle('hidden', t !== 'furniture');
    if (t === 'camera') { ensureCameras(); if (!S.sel || S.sel.kind !== 'camera') { S.sel = null; } refreshPanel(); }
    else if (S.sel && S.sel.kind === 'camera') { S.sel = null; refreshPanel(); }
    draw();
  }
  document.querySelectorAll('#ed-tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

  function select(s) { S.sel = s; refreshPanel(); draw(); }

  // Génère un formulaire à partir d'un schéma [{key, label, type, options, step}]
  function form(title, obj, fields, onChange, extraHtml = '') {
    const el = $('ed-props');
    el.innerHTML = `<h3>${title}</h3>` + fields.map(f => {
      const v = f.get ? f.get(obj) : obj[f.key];
      let input;
      if (f.type === 'select') input = `<select data-key="${f.key}">${Object.entries(f.options).map(([k, l]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      else if (f.type === 'checkbox') input = `<input type="checkbox" data-key="${f.key}" ${v ? 'checked' : ''}>`;
      else if (f.type === 'readonly') input = `<span>${v}</span>`;
      else input = `<input type="${f.type || 'text'}" data-key="${f.key}" value="${v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;')}" ${f.step ? `step="${f.step}"` : ''}>`;
      return `<div class="ed-field"><label>${f.label}</label>${input}</div>`;
    }).join('') + extraHtml;
    el.querySelectorAll('[data-key]').forEach(inp => {
      inp.addEventListener('change', () => {
        const f = fields.find(x => x.key === inp.dataset.key);
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

  function refreshPanel() {
    $('ed-project-name').textContent = S.p.meta.name + (S.dirty ? ' •' : '');
    const s = S.sel;
    if (!s && S.tool === 'camera') return camerasPanel();
    if (!s) return projectPanel();
    if (s.kind === 'camera') return cameraPanel(s.obj);
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
      ], null, '<div class="ed-row"><button id="btn-to-rect">Convertir en rectangle</button><button id="btn-del">Supprimer</button></div>');
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
      ], null, '<div class="ed-row"><button id="btn-fit-room">Ajuster aux murs</button><button id="btn-del">Supprimer</button></div>');
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
      form('Trémie d’escalier', s.obj, [
        { key: 'name', label: 'Nom' },
        { key: 'xMin', label: 'X min (m)', type: 'number', step: 0.05 },
        { key: 'xMax', label: 'X max (m)', type: 'number', step: 0.05 },
        { key: 'zMin', label: 'Z min (m)', type: 'number', step: 0.05 },
        { key: 'zMax', label: 'Z max (m)', type: 'number', step: 0.05 }
      ], null, del);
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
        { key: 'model', label: 'Modèle 3D', type: 'select', options: { '': '— volume simple —', sofa: 'Canapé', chair: 'Chaise', diningTable: 'Table', coffeeTable: 'Table basse', bed: 'Lit', nightstand: 'Chevet', fridge: 'Réfrigérateur', toilet: 'WC', plantTall: 'Plante haute', plantBush: 'Plante basse' }, set: (o, v) => { if (v) o.model = v; else delete o.model; } },
        { key: 'w', label: 'Largeur (m)', type: 'number', step: 0.05 },
        { key: 'd', label: 'Profondeur (m)', type: 'number', step: 0.05 },
        { key: 'h', label: 'Hauteur (m)', type: 'number', step: 0.05 },
        { key: 'elev', label: 'Élévation (m)', type: 'number', step: 0.05 },
        { key: 'angle', label: 'Angle (°)', type: 'number', step: 1, get: o => Math.round((o.rotY || 0) * 180 / Math.PI * 100) / 100, set: (o, v) => { o.rotY = v * Math.PI / 180; o.dims = 'local'; } },
        { key: 'color', label: 'Couleur', type: 'color' }
      ], null, '<div class="ed-row"><button id="btn-rot">Pivoter +15° (R)</button><button id="btn-dup">Dupliquer</button><button id="btn-del">Supprimer</button></div>');
      $('btn-rot').onclick = () => rotateFurniture(s.obj);
      $('btn-dup').onclick = () => { commit(); const c = JSON.parse(JSON.stringify(s.obj)); c.x = r2(c.x + 0.3); c.z = r2(c.z + 0.3); S.p.furniture.push(c); select({ kind: 'furniture', obj: c }); };
    }
    const d = $('btn-del');
    if (d) d.onclick = deleteSelection;
  }

  function camerasPanel() {
    const list = S.p.tourWaypoints || [];
    const el = $('ed-props');
    el.innerHTML = `<h3>Parcours caméra</h3>
      <p class="ed-note">${list.length ? list.length + ' étapes. Cliquez une caméra pour la régler, glissez-la sur le plan.' : 'Aucun parcours : il sera généré automatiquement (passage par les portes).'}</p>
      <div class="ed-list">${list.map((wp, i) => `<button data-wp="${i}"><span>${i + 1}. ${wp.label || 'Étape'}</span><small>${isEye(wp) ? 'intérieur' : 'vue aérienne'}</small></button>`).join('')}</div>
      <div class="ed-row"><button id="btn-cam-gen">${list.length ? 'Régénérer automatiquement' : 'Générer le parcours'}</button><button id="btn-cam-preview">Aperçu 3D ↗</button></div>`;
    el.querySelectorAll('[data-wp]').forEach(b => { b.onclick = () => select({ kind: 'camera', obj: list[+b.dataset.wp] }); });
    $('btn-cam-gen').onclick = () => {
      if (list.length && !confirm('Remplacer le parcours actuel par un parcours généré automatiquement ?')) return;
      commit(); S.p.tourWaypoints = generateCameras(); refreshPanel(); draw(); toast('Parcours généré : passage par les portes');
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

  function projectPanel() {
    const p = S.p;
    const hab = p.rooms.filter(r => r.habitable).reduce((s, r) => s + roomArea(r), 0);
    const nOps = p.walls.reduce((s, w) => s + w.openings.length, 0);
    const pi = p.config.planImage;
    const extrasNote = S.extras ? `<div class="ed-field"><label>Garder caméras & abords</label><input type="checkbox" id="chk-extras" ${S.keepExtras ? 'checked' : ''}></div>
      <p class="ed-note">Décochez pour régénérer automatiquement le parcours caméra, les vues de rendu, les lampes et le jardin après des modifications importantes.</p>` : '';
    const warn = !p.walls.some(w => w.openings.some(o => o.type === 'door' && w.type === 'ext')) && p.walls.length
      ? '<p class="ed-note warn">Aucune porte sur un mur extérieur : l\'entrée de la visite sera devinée.</p>' : '';
    form('Projet', p.meta, [
      { key: 'name', label: 'Nom du projet', set: (o, v) => { o.name = String(v).toUpperCase(); if (!o.slugLocked) o.slug = slugify(v); } },
      { key: 'slug', label: 'Dossier', set: (o, v) => { o.slug = slugify(v); o.slugLocked = true; } },
      { key: 'subtitle', label: 'Sous-titre' },
      { key: 'client', label: 'Client' }
    ], null, `
      <div class="ed-field"><label>Opacité du plan</label><input type="range" id="rng-opacity" min="0" max="1" step="0.05" value="${S.planOpacity}"></div>
      <div class="ed-field"><label>Hauteur sous plafond</label><input type="number" id="num-height" step="0.05" value="${p.config.wallHeight}"></div>
      ${extrasNote}
      <p class="ed-note">${pi && S.planImg ? `Échelle du plan : <strong>${pi.pxPerMeter} px/m</strong>` : 'Commencez par importer l\'image du plan, puis calibrez l\'échelle (K).'}</p>
      ${warn}
      <div class="ed-stats">
        <div class="ed-stat"><strong>${p.walls.length}</strong><span>murs</span></div>
        <div class="ed-stat"><strong>${nOps}</strong><span>ouvertures</span></div>
        <div class="ed-stat"><strong>${p.rooms.length}</strong><span>pièces</span></div>
        <div class="ed-stat"><strong>${hab.toFixed(1).replace('.', ',')} m²</strong><span>habitables</span></div>
      </div>
      <div class="ed-row"><button id="btn-fit">Cadrer la vue</button><button id="btn-center">Centrer sur l'origine</button></div>`);
    $('rng-opacity').oninput = e => { S.planOpacity = parseFloat(e.target.value); draw(); };
    $('num-height').onchange = e => { const v = parseFloat(e.target.value); if (v > 2) { commit(); p.config.wallHeight = v; } };
    const chk = $('chk-extras');
    if (chk) chk.onchange = e => { S.keepExtras = e.target.checked; };
    $('btn-fit').onclick = () => { fitView(); draw(); };
    $('btn-center').onclick = () => { commit(); centerProject(); fitView(); draw(); toast('Projet recentré sur l\'origine'); };
  }

  function buildLibrary() {
    const groups = {};
    FURNITURE.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
    $('ed-library').innerHTML = '<h3>Bibliothèque</h3>' + Object.entries(groups).map(([g, items]) =>
      `<h4>${g}</h4><div class="ed-lib">${items.map(it => `<button data-lib="${FURNITURE.indexOf(it)}">${it.name}<small>${it.w} × ${it.d} m</small></button>`).join('')}</div>`).join('');
    $('ed-library').querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => {
      S.libItem = FURNITURE[+b.dataset.lib];
      $('ed-library').querySelectorAll('[data-lib]').forEach(x => x.classList.toggle('active', x === b));
    }));
    $('ed-library').querySelector('[data-lib]').classList.add('active');
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
    const pi = p.config.planImage;
    if (pi && pi.originPx) pi.originPx = [pi.originPx[0] - dx * pi.pxPerMeter, pi.originPx[1] - dz * pi.pxPerMeter];
    S.view.ox -= dx * S.view.scale;
    S.view.oy -= dz * S.view.scale;
    return { dx, dz };
  }

  // ---------------------------------------------------------------------------
  // EXPORT & ENREGISTREMENT
  // ---------------------------------------------------------------------------
  function toProjectJson() {
    const p = JSON.parse(JSON.stringify(S.p));
    const walls = JSON.parse(JSON.stringify(allLevelItems('walls')));
    const rooms = JSON.parse(JSON.stringify(allLevelItems('rooms')));
    const columns = JSON.parse(JSON.stringify(allLevelItems('columns')));
    const canopies = JSON.parse(JSON.stringify(allLevelItems('canopies')));
    const furniture = JSON.parse(JSON.stringify(allLevelItems('furniture')));
    const stairwells = JSON.parse(JSON.stringify(allLevelItems('stairwells')));
    const out = {
      meta: { name: p.meta.name, slug: p.meta.slug, subtitle: p.meta.subtitle || '', client: p.meta.client || '', updated: new Date().toISOString() },
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
    if (Array.isArray(p.tourWaypoints) && p.tourWaypoints.length >= 2) out.tourWaypoints = p.tourWaypoints;
    const pi = p.config.planImage;
    if (pi && pi.url) out.config.planImage = { url: pi.url.startsWith('data:') ? '' : pi.url, pxPerMeter: pi.pxPerMeter, originPx: pi.originPx, calibrated: !!pi.calibrated };
    if (S.extras && S.keepExtras) Object.assign(out, JSON.parse(JSON.stringify(S.extras)));
    else if (S.extras && S.extras.assets) out.assets = S.extras.assets;
    return out;
  }

  async function save() {
    if (!S.p.walls.length) { toast('Rien à enregistrer : tracez au moins un mur', true); return null; }
    const slug = slugify(S.p.meta.slug || S.p.meta.name);
    S.p.meta.slug = slug;
    // Le moteur 3D attend une maison centrée sur l'origine (ombres, plan de présentation, caméras)
    const shift = centerProject();
    if (shift.dx || shift.dz) { S.keepExtras = false; draw(); }
    try {
      const res = await fetch('api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, project: toProjectJson(), planImage: S.planDataUrl })
      });
      if (!res.ok) throw new Error(await res.text());
      const r = await res.json();
      if (r.planImage && r.planImage.url) { S.p.config.planImage.url = r.planImage.url; S.planDataUrl = null; }
      localStorage.setItem('lastProject', slug);
      S.dirty = false;
      refreshPanel();
      toast(`Enregistré dans projects/${slug}/project.json`);
      return slug;
    } catch (e) {
      // Serveur absent : téléchargement du fichier
      const blob = new Blob([JSON.stringify(toProjectJson(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'project.json';
      a.click();
      toast('Serveur local indisponible : project.json téléchargé (à placer dans projects/' + slug + '/)', true);
      return null;
    }
  }

  async function openDialog() {
    const dlg = $('dlg-open');
    const list = $('dlg-open-list');
    list.innerHTML = '<p class="ed-note">Chargement…</p>';
    dlg.showModal();
    try {
      const items = await (await fetch('api/projects')).json();
      list.innerHTML = items.length ? '' : '<p class="ed-note">Aucun projet enregistré pour l\'instant.</p>';
      items.forEach(it => {
        const b = document.createElement('button');
        b.innerHTML = `<span>${it.name}</span><small>${it.slug} · ${new Date(it.updated).toLocaleDateString('fr-FR')}</small>`;
        b.onclick = async () => {
          const data = await (await fetch(`projects/${it.slug}/project.json?t=${Date.now()}`)).json();
          data.meta = Object.assign({ slug: it.slug, slugLocked: true }, data.meta);
          loadProject(data, { keepExtras: true });
          localStorage.setItem('lastProject', it.slug);
          dlg.close();
          toast('Projet ouvert : ' + it.name);
        };
        list.appendChild(b);
      });
    } catch (e) {
      list.innerHTML = '<p class="ed-note warn">Serveur local indisponible : lancez start.bat ou importez un fichier project.json.</p>';
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
    villa.meta = { name: 'VILLA SERENA', slug: 'villa-serena', subtitle: 'Plan Eng Dollar — plain-pied 109 m²' };
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
    if (!f) return;
    f.text().then(t => { loadProject(JSON.parse(t), { keepExtras: true }); $('dlg-open').close(); toast('Projet importé'); });
    e.target.value = '';
  };
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;
  $('btn-save').onclick = save;
  $('btn-preview').onclick = async () => {
    const win = window.open('about:blank', '_blank');
    const slug = await save();
    if (slug && win) win.location = `index.html?project=${slug}`;
    else if (win) win.close();
  };
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------------------
  // DÉMARRAGE
  // ---------------------------------------------------------------------------
  buildLibrary();
  window.addEventListener('resize', resize);
  loadProject(emptyProject());
  setTool('select');
  resize();
  toast('Importez l\'image d\'un plan, ou ouvrez l\'exemple Villa Serena');
  window.__editor = S; // débogage
  // API interne pour les modules complémentaires (lecture IA, caméras…)
  window.EditorAPI = { S, commit, refreshPanel, draw, toast, fitView, setTool, select, FURNITURE, OPENINGS, wallLen, projectOnWall, slugify, r2, round };
})();
