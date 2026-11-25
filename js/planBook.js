/**
 * Cahier de plans A3 paysage, composé dans le navigateur à partir de la maquette 3D et du projet :
 * couverture avec cartouche, axonométrie, écorché, plans cotés à l’échelle, vues, descriptif sommaire,
 * estimation facultative et, en annexe, les PDF fournis par l’architecte (rendus page par page).
 * Rien n’est envoyé au serveur : le PDF est assemblé et téléchargé localement.
 */
const PlanBook = (() => {
  const W = 420, H = 297, M = 12, STRIP = 17;
  const C = {
    ink: '#1b2320', muted: '#5f6a63', paper: '#f4f2eb', rule: '#c9cbbf', dark: '#1d2620', sand: '#d8c7a0',
    gold: '#b78a3c', white: '#ffffff', room: '#ebe8de', annex: '#dfe5d8', glass: '#5b8ea0', cut: '#e6dfcd'
  };
  const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
  const PHASES = { ESQ: 'Esquisse', APS: 'Avant-projet sommaire', APD: 'Avant-projet définitif', PC: 'Permis de construire', DCE: 'Dossier de consultation', EXE: 'Exécution' };
  const FLOORS = { parquet: 'Parquet', oak: 'Parquet chêne', wood: 'Parquet', tiles: 'Carrelage', tile: 'Carrelage', stone: 'Pierre naturelle',
    concrete: 'Béton ciré', marble: 'Marbre', grass: 'Gazon', deck: 'Platelage bois', carpet: 'Moquette' };
  const MAX_ANNEX_PAGES = 30;
  const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const fr2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pending = new Map();

  function identityModule() {
    if (typeof PdfIdentity !== 'undefined') return PdfIdentity;
    if (typeof globalThis !== 'undefined' && globalThis.PdfIdentity) return globalThis.PdfIdentity;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./pdfIdentity.js'); } catch (_) { return null; }
    }
    return null;
  }
  function woodGrainModule() {
    if (typeof WoodGrain !== 'undefined') return WoodGrain;
    if (typeof globalThis !== 'undefined' && globalThis.WoodGrain) return globalThis.WoodGrain;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./woodGrain.js'); } catch (_) { return null; }
    }
    return null;
  }
  function gateModule() {
    if (typeof DeliverableGate !== 'undefined') return DeliverableGate;
    if (typeof globalThis !== 'undefined' && globalThis.DeliverableGate) return globalThis.DeliverableGate;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./deliverableGate.js'); } catch (_) { return null; }
    }
    return null;
  }

  // ---------- Bibliothèques chargées à la demande ----------
  function script(src, ready, integrity) {
    if (ready()) return Promise.resolve();
    if (pending.has(src)) return pending.get(src);
    const promise = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.crossOrigin = 'anonymous';
      if (integrity) tag.integrity = integrity;
      const fail = () => { tag.remove(); pending.delete(src); reject(new Error(`Bibliothèque indisponible (${new URL(src, location.href).pathname.split("/").pop()}). Vérifiez la connexion puis réessayez.`)); };
      const timer = setTimeout(fail, 15000);
      tag.onload = () => { clearTimeout(timer); ready() ? resolve() : fail(); };
      tag.onerror = () => { clearTimeout(timer); fail(); };
      document.head.append(tag);
    });
    pending.set(src, promise);
    return promise;
  }
  const loadJsPDF = () => script('assets/vendor/jspdf-4.2.1.umd.min.js', () => !!window.jspdf?.jsPDF, // copie locale vérifiée : fonctionne hors ligne
    'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3').then(() => window.jspdf.jsPDF);
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const loadPdfJs = () => script(`${PDFJS}pdf.min.js`, () => !!window.pdfjsLib).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`;
    return window.pdfjsLib;
  });

  // ---------- Texte et formes ----------
  // Les polices intégrées de jsPDF couvrent Windows-1252 : on remplace les rares signes hors de cette table.
  const clean = value => String(value ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-').replace(/≈/g, 'env.').replace(/[→⟶]/g, '->').replace(/[★☆]/g, '*');
  function roomArea(room) {
    const ID = identityModule();
    if (ID && typeof ID.roomArea === 'function') return ID.roomArea(room);
    if (Number.isFinite(room?.area)) return room.area;
    const b = room?.bounds;
    return b ? Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin) : 0;
  }
  function textWidth(doc, label, space = 0) {
    return doc.getTextWidth(label) + (space && label.length > 1 ? space * (label.length - 1) : 0);
  }
  function text(doc, value, x, y, size = 9, { bold = false, serif = false, color = C.ink, align, maxWidth, space = 0 } = {}) {
    let label = clean(value);
    doc.setFont(serif ? 'times' : 'helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color).setCharSpace(space);
    if (maxWidth && textWidth(doc, label, space) > maxWidth) {
      while (label.length > 1 && textWidth(doc, `${label}…`, space) > maxWidth) label = label.slice(0, -1);
      label += '…';
    }
    const extra = space && label.length > 1 ? space * (label.length - 1) : 0;
    const drawX = align === 'right' ? x - extra : (align === 'center' ? x - extra / 2 : x);
    doc.text(label, drawX, y, align ? { align } : undefined);
    doc.setCharSpace(0);
  }
  function paragraph(doc, value, x, y, width, size = 9, lineHeight = 1.45, color = C.ink, maxLines = 99) {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(color);
    const lines = doc.splitTextToSize(clean(value), width).slice(0, maxLines);
    lines.forEach((line, i) => doc.text(line, x, y + i * size * 0.3528 * lineHeight));
    return y + lines.length * size * 0.3528 * lineHeight;
  }
  function polygon(doc, points, style = 'F') {
    if (points.length < 3) return;
    const [x0, y0] = points[0];
    doc.lines(points.slice(1).map(([x, y], i) => [x - points[i][0], y - points[i][1]]), x0, y0, [1, 1], style, true);
  }
  const kicker = (doc, value, x, y, color = C.muted) => text(doc, value.toUpperCase(), x, y, 7.5, { bold: true, color, space: 0.9 });

  // ---------- Outils de mise en page « prestige » ----------
  const hasAlpha = doc => typeof doc.GState === 'function' && typeof doc.setGState === 'function';
  const alpha = (doc, opacity) => { if (hasAlpha(doc)) doc.setGState(new doc.GState({ opacity, 'stroke-opacity': opacity })); };
  /** Voile dégradé (bandes d'opacité croissante) : de `from` à `to`, horizontal (gauche → droite) ou vertical. */
  function veil(doc, x, y, w, h, color, from, to, { vertical = false, steps = 48 } = {}) {
    if (!hasAlpha(doc)) { if (to > 0.5) doc.setFillColor(color).rect(x, y, w, h, 'F'); return; }
    doc.setFillColor(color);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), o = from + (to - from) * t * t * (3 - 2 * t);
      alpha(doc, Math.max(0, Math.min(1, o)));
      if (vertical) doc.rect(x, y + h * i / steps, w, h / steps + 0.05, 'F');
      else doc.rect(x + w * i / steps, y, w / steps + 0.05, h, 'F');
    }
    alpha(doc, 1);
  }
  /** Repères de coupe d'imprimeur aux quatre coins (marque d'atelier). */
  function cropMarks(doc, x, y, w, h, color, len = 7, gap = 2) {
    doc.setDrawColor(color).setLineWidth(0.25);
    [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([cx, cy, sx, sy]) => {
      doc.line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
      doc.line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
    });
  }
  /** Emblème : les murs d'un niveau tracés en filets, à l'échelle, centrés dans `box` (vectoriel). */
  function planEmblem(doc, data, level, box, color, { wall = 0.55, partition = 0.25, roomColor = null } = {}) {
    const walls = (data.walls || []).filter(w => (Number(w.level) || 0) === level);
    if (!walls.length) return false;
    const rooms = (data.rooms || []).filter(r => (Number(r.level) || 0) === level && r.bounds);
    const xs = walls.flatMap(w => [w.from[0], w.to[0]]).concat(rooms.flatMap(r => [r.bounds.xMin, r.bounds.xMax]));
    const zs = walls.flatMap(w => [w.from[1], w.to[1]]).concat(rooms.flatMap(r => [r.bounds.zMin, r.bounds.zMax]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const k = Math.min(box.w / (x1 - x0 || 1), box.h / (z1 - z0 || 1));
    const ox = box.x + (box.w - (x1 - x0) * k) / 2, oz = box.y + (box.h - (z1 - z0) * k) / 2;
    const P = (x, z) => [ox + (x - x0) * k, oz + (z - z0) * k];
    // Contours des pièces en filet fin, puis initiales des grandes pièces : le dessin se lit comme un plan.
    if (roomColor) {
      doc.setDrawColor(roomColor).setLineWidth(0.12);
      rooms.forEach(r => {
        const [ax, az] = P(r.bounds.xMin, r.bounds.zMin), [bx, bz] = P(r.bounds.xMax, r.bounds.zMax);
        doc.rect(ax, az, bx - ax, bz - az);
        if ((bx - ax) > 11 && (bz - az) > 7 && r.name) text(doc, roomName(r.name).slice(0, 14), (ax + bx) / 2, (az + bz) / 2 + 1, 3.8, { align: 'center', color: roomColor });
      });
    }
    doc.setDrawColor(color);
    walls.forEach(w => {
      // Mur interrompu au droit de ses ouvertures, comme sur un plan.
      const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) || 1;
      const cuts = (w.openings || []).map(o => [Math.max(0, o.at - o.w / 2), Math.min(len, o.at + o.w / 2)]).sort((a, b) => a[0] - b[0]);
      let start = 0;
      doc.setLineWidth(w.type === 'ext' ? wall : partition);
      const seg = (a, b) => {
        if (b - a < 0.05) return;
        const pa = P(w.from[0] + (w.to[0] - w.from[0]) * a / len, w.from[1] + (w.to[1] - w.from[1]) * a / len);
        const pb = P(w.from[0] + (w.to[0] - w.from[0]) * b / len, w.from[1] + (w.to[1] - w.from[1]) * b / len);
        doc.line(pa[0], pa[1], pb[0], pb[1]);
      };
      cuts.forEach(([a, b]) => { seg(start, a); start = Math.max(start, b); });
      seg(start, len);
    });
    return true;
  }
  /** Flèche du nord (cercle et pointe), orientée selon config.northDegrees. */
  function northArrow(doc, cx, cy, r, color, degrees = 0) {
    const a = degrees * Math.PI / 180, p = (dx, dy) => [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    doc.setDrawColor(color).setLineWidth(0.25).circle(cx, cy, r);
    const tip = p(0, -r * 0.8), left = p(-r * 0.32, r * 0.45), right = p(r * 0.32, r * 0.45), mid = p(0, r * 0.18);
    doc.setFillColor(color).triangle(tip[0], tip[1], left[0], left[1], mid[0], mid[1], 'F');
    doc.setLineWidth(0.2).triangle(tip[0], tip[1], right[0], right[1], mid[0], mid[1], 'S');
    text(doc, 'N', tip[0], tip[1] - 1.6, 5.4, { bold: true, color, align: 'center' });
  }

  // ---------- Images ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image illisible : ${src}`));
      img.src = src;
    });
  }
  /** Recadre (cover) ou ajuste (contain) une image au format demandé, en JPEG. */
  function jpeg(img, width, height, { fit = 'cover', background = C.paper, quality = 0.9 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = background; g.fillRect(0, 0, width, height);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
    const w = iw * scale, h = ih * scale;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  }

  // ---------- Prises de vue de la maquette ----------
  function sceneHeight(data, hs) {
    const top = Math.max(0, ...data.rooms.map(r => Number(r.level) || 0), ...data.walls.map(w => Number(w.level) || 0));
    return hs.levelOffset(top) + data.config.wallHeight;
  }
  /** Vue quasi axonométrique : téléobjectif lointain, 35° au-dessus de l’horizon, depuis l’angle de l’entrée. */
  function axonometric(data, hs, turn = 0) {
    const bb = HouseAuto.bbox(data);
    const { out } = HouseAuto.findEntry(data, bb);
    const height = sceneHeight(data, hs);
    const base = Math.atan2(out.z, out.x) + Math.PI / 4 + turn;
    const elevation = 35 * Math.PI / 180, fov = 18;
    const radius = Math.hypot(bb.w, bb.d, height) / 2 * 0.82; // cadrage serré : la maison occupe la planche
    const distance = radius / Math.tan(fov * Math.PI / 360);
    const look = [bb.cx, height * 0.32, bb.cz];
    return {
      fov, look, interior: false,
      pos: [look[0] + Math.cos(base) * Math.cos(elevation) * distance, look[1] + Math.sin(elevation) * distance, look[2] + Math.sin(base) * Math.cos(elevation) * distance]
    };
  }
  /** Rendu sur fond papier, arêtes encrées visibles ; coupe horizontale facultative (écorché). */
  function render(hs, shot, width, height, { section = false } = {}) {
    const r = hs.renderer, cam = hs.camera;
    const saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, bg: hs.scene.background,
      ratio: r.getPixelRatio(), size: r.getSize(new THREE.Vector2()), section: hs.sectionEnabled, quality: hs.quality,
      overlay: hs.planOverlayManualVisible, exploded: hs.exploded, explodedTarget: hs.explodedTarget, ceilings: hs.ceilingsVisible, elevation: hs.elevationProgress,
      night: hs.night, nightTarget: hs.nightTarget, solarHour: hs.solarHour, notes: hs.clientMeasureGroup?.visible, fog: hs.scene.fog
    };
    try {
      if (hs.quality !== 'high') hs.setQuality('high');
      if (hs.clientMeasureGroup) hs.clientMeasureGroup.visible = false;
      if (Boolean(hs.sectionEnabled) !== section) hs.toggleSectionCut();
      hs.exploded = hs.explodedTarget = 0;
      hs.planOverlayManualVisible = false;
      hs.setElevation(1);
      hs.updateTechnicalAnimations?.();
      hs.night = hs.nightTarget = 0;
      hs.solarHour = SolarStudy.day;
      hs.setCeilingsVisible(!section);
      hs.applyAtmosphere();
      hs.scene.background = new THREE.Color(C.paper);
      hs.scene.fog = null; // la brume atmosphérique délave une vue prise de loin
      cam.position.fromArray(shot.pos);
      cam.lookAt(new THREE.Vector3().fromArray(shot.look));
      cam.fov = shot.fov;
      cam.aspect = width / height;
      cam.updateProjectionMatrix();
      r.setPixelRatio(1);
      r.setSize(width, height, false);
      r.render(hs.scene, cam);
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      const g = out.getContext('2d');
      g.filter = 'contrast(1.12) saturate(1.08)';
      g.drawImage(r.domElement, 0, 0, width, height);
      return out.toDataURL('image/jpeg', 0.92);
    } finally {
      if (Boolean(hs.sectionEnabled) !== Boolean(saved.section)) hs.toggleSectionCut();
      hs.scene.background = saved.bg;
      hs.scene.fog = saved.fog;
      hs.planOverlayManualVisible = saved.overlay;
      hs.exploded = saved.exploded || 0; hs.explodedTarget = hs.exploded;
      if (Number.isFinite(saved.elevation)) hs.setElevation(saved.elevation);
      hs.updateTechnicalAnimations?.();
      hs.explodedTarget = saved.explodedTarget;
      hs.night = saved.night; hs.nightTarget = saved.nightTarget; hs.solarHour = saved.solarHour;
      if (hs.clientMeasureGroup) hs.clientMeasureGroup.visible = saved.notes;
      hs.setCeilingsVisible(saved.ceilings ?? true);
      cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.fov = saved.fov; cam.aspect = saved.aspect;
      cam.updateProjectionMatrix();
      if (saved.quality !== 'high') hs.setQuality(saved.quality);
      r.setPixelRatio(saved.ratio);
      r.setSize(saved.size.x, saved.size.y, false);
      hs.applyAtmosphere();
    }
  }

  // ---------- Cartouche et habillage ----------
  function info(data, sheet, options = {}) {
    const ID = identityModule();
    const meta = ID ? ID.extractMeta(data, { cabinet: options.cabinet, date: options.date }) : (() => {
      const m = data?.meta || {};
      const rawPhase = String(m.phase || '').trim();
      return {
        project: String(m.name || '').trim() || 'Projet architectural',
        displayProject: nameForDisplay(m.name || 'Projet'),
        subtitle: String(m.subtitle || '').trim(),
        client: String(m.client || '').trim(),
        location: String(m.location || m.address || '').trim(),
        phase: PHASES[rawPhase] || rawPhase,
        revision: String(m.revision || '').trim(),
        date: '',
        year: '',
        agency: String(m.architect || m.agency || '').trim(),
        brand: String(m.agency || '').trim() || 'ARCHICAM STUDIO'
      };
    })();
    return {
      project: meta.displayProject || nameForDisplay(meta.project),
      client: meta.client,
      architect: meta.agency,
      location: meta.location,
      phase: meta.phase,
      revision: meta.revision,
      date: meta.date,
      year: meta.year,
      meta,
      sheet
    };
  }
  // Nom de projet saisi en capitales : « VILLA SERENA » → « Villa Serena » (petits mots en minuscules).
  const SMALL_WORDS = /^(?:à|a|au|aux|de|du|des|d|la|le|les|l|et|en|sur|sous|avec)$/;
  function nameForDisplay(name) {
    if (name !== name.toLocaleUpperCase('fr-FR')) return name;
    return name.toLocaleLowerCase('fr-FR').replace(/\p{L}+/gu, (word, offset) =>
      offset && SMALL_WORDS.test(word) ? word : word[0].toLocaleUpperCase('fr-FR') + word.slice(1));
  }
  // Pièce saisie en capitales : « SALLE À MANGER » → « Salle à manger », sigles courts conservés (WC, SDB).
  function roomName(name = '') {
    if (name !== name.toLocaleUpperCase('fr-FR')) return name;
    const lower = name.replace(/\p{L}+/gu, word => (word.length <= 3 && !SMALL_WORDS.test(word.toLocaleLowerCase('fr-FR')) && !/[aeiouyàâéèêëîïôöûü]/i.test(word.slice(1)))
      ? word : word.toLocaleLowerCase('fr-FR'));
    return lower.charAt(0).toLocaleUpperCase('fr-FR') + lower.slice(1);
  }
  /** Bandeau-cartouche en pied de chaque planche. */
  function strip(doc, data, sheet) {
    const i = info(data, sheet), y = H - M - STRIP, x0 = M, width = W - 2 * M;
    doc.setFillColor(C.white).rect(x0, y, width, STRIP, 'F');
    doc.setDrawColor(C.ink).setLineWidth(0.35).rect(x0, y, width, STRIP);
    const cells = [
      [46, 'PLAN / 3D', 'Cahier de plans', true],
      [82, 'Projet', i.project], [70, 'Planche', sheet.title], [56, 'Maître d’œuvre', i.architect],
      [36, 'Phase', i.phase], [28, 'Échelle', sheet.scale || ''], [26, 'Date', i.date], [16, 'Indice', i.revision]
    ];
    const fixed = cells.reduce((sum, cell) => sum + cell[0], 0);
    let x = x0;
    cells.forEach(([w, label, value, brand], index) => {
      if (index) doc.setDrawColor(C.rule).setLineWidth(0.2).line(x, y + 2.5, x, y + STRIP - 2.5);
      if (brand) {
        doc.setFillColor(C.dark).rect(x, y, w, STRIP, 'F');
        text(doc, label, x + 4, y + 7.6, 10, { bold: true, color: C.white, space: 0.4 });
        text(doc, value.toUpperCase(), x + 4, y + 12.6, 5.6, { color: C.sand, space: 0.7 });
      } else {
        text(doc, label.toUpperCase(), x + 3, y + 6, 5.4, { bold: true, color: C.muted, space: 0.6 });
        if (value) text(doc, value, x + 3, y + 12.2, 8.4, { bold: index === 2, maxWidth: w - 5 });
      }
      x += w;
    });
    const numberW = width - fixed;
    doc.setFillColor(C.ink).rect(x, y, numberW, STRIP, 'F');
    text(doc, 'N°', x + numberW / 2, y + 6, 5.4, { bold: true, color: C.sand, align: 'center', space: 0.6 });
    text(doc, sheet.code, x + numberW / 2, y + 12.6, 11, { bold: true, color: C.white, align: 'center' });
  }
  function sheetFrame(doc, data, sheet) {
    doc.setFillColor(C.paper).rect(0, 0, W, H, 'F');
    doc.setDrawColor(C.ink).setLineWidth(0.5).rect(M, M, W - 2 * M, H - 2 * M);
    strip(doc, data, sheet);
    kicker(doc, `${sheet.code} · ${sheet.section}`, M + 8, M + 10);
    text(doc, sheet.title, M + 8, M + 22, 22, { serif: true, bold: true });
  }
  const content = { x: M + 8, y: M + 30, w: W - 2 * M - 16, h: H - 2 * M - STRIP - 38 };

  // ---------- Plan coté à l’échelle ----------
  function levelBounds(data, level) {
    const walls = data.walls.filter(w => (Number(w.level) || 0) === level);
    const rooms = data.rooms.filter(r => (Number(r.level) || 0) === level);
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
    walls.forEach(w => { add(...w.from); add(...w.to); });
    rooms.forEach(r => { add(r.bounds.xMin, r.bounds.zMin); add(r.bounds.xMax, r.bounds.zMax); });
    return { walls, rooms, xMin, xMax, zMin, zMax, valid: Number.isFinite(xMin) };
  }
  function planScale(bounds, box) {
    const dx = bounds.xMax - bounds.xMin + 3.2, dz = bounds.zMax - bounds.zMin + 3.2;
    return SCALES.find(s => dx * 1000 / s <= box.w && dz * 1000 / s <= box.h) || SCALES.at(-1);
  }
  function drawPlan(doc, data, level, box, denominator) {
    const b = levelBounds(data, level);
    const k = 1000 / denominator; // mm par mètre
    const ox = box.x + (box.w - (b.xMax - b.xMin) * k) / 2, oz = box.y + (box.h - (b.zMax - b.zMin) * k) / 2;
    const X = x => ox + (x - b.xMin) * k, Z = z => oz + (z - b.zMin) * k;
    const P = ([x, z]) => [X(x), Z(z)];

    b.rooms.forEach(room => {
      const rb = room.bounds;
      const pts = room.poly || [[rb.xMin, rb.zMin], [rb.xMax, rb.zMin], [rb.xMax, rb.zMax], [rb.xMin, rb.zMax]];
      doc.setFillColor(room.habitable ? C.room : C.annex);
      polygon(doc, pts.map(P));
    });

    b.walls.forEach(wall => {
      const length = wall.length || Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      if (length < 1e-3) return;
      const ux = (wall.to[0] - wall.from[0]) / length, uz = (wall.to[1] - wall.from[1]) / length;
      const nx = -uz, nz = ux, t = (wall.thick || 0.2) / 2;
      const at = s => [wall.from[0] + ux * s, wall.from[1] + uz * s];
      const solid = (s, e) => {
        const a = s <= 1e-6 ? -t : s, c = e >= length - 1e-6 ? length + t : e; // angles fermés aux extrémités
        const [x1, z1] = at(a), [x2, z2] = at(c);
        doc.setFillColor(C.ink);
        polygon(doc, [[x1 + nx * t, z1 + nz * t], [x2 + nx * t, z2 + nz * t], [x2 - nx * t, z2 - nz * t], [x1 - nx * t, z1 - nz * t]].map(P));
      };
      let last = 0;
      (wall.openings || []).slice().sort((p, q) => p.at - q.at).forEach(op => {
        const s = Math.max(0, op.at - op.w / 2), e = Math.min(length, op.at + op.w / 2);
        if (s > last) solid(last, s);
        const [x1, z1] = at(s), [x2, z2] = at(e);
        if (op.type === 'window' || op.type === 'bay') {
          doc.setDrawColor(C.ink).setLineWidth(0.18);
          [[t, t], [-t, -t]].forEach(([a]) => doc.line(...P([x1 + nx * a, z1 + nz * a]), ...P([x2 + nx * a, z2 + nz * a])));
          doc.setDrawColor(C.glass).setLineWidth(op.type === 'bay' ? 0.5 : 0.35).line(...P([x1, z1]), ...P([x2, z2]));
        } else if (op.type === 'door') {
          const hingeEnd = op.hinge === 'end';
          const side = (op.side || 1) >= 0 ? 1 : -1;
          const [hx, hz] = hingeEnd ? [x2, z2] : [x1, z1];
          const dir = hingeEnd ? -1 : 1, w = e - s;
          const leaf = [hx + nx * side * w, hz + nz * side * w];
          doc.setDrawColor(C.ink).setLineWidth(0.3).line(...P([hx, hz]), ...P(leaf));
          doc.setLineWidth(0.12);
          const steps = 10;
          for (let i = 0; i < steps; i++) {
            const a0 = (i / steps) * Math.PI / 2, a1 = ((i + 1) / steps) * Math.PI / 2;
            const pt = a => [hx + (ux * dir * Math.cos(a) + nx * side * Math.sin(a)) * w, hz + (uz * dir * Math.cos(a) + nz * side * Math.sin(a)) * w];
            doc.line(...P(pt(a0)), ...P(pt(a1)));
          }
        }
        last = Math.max(last, e);
      });
      if (last < length) solid(last, length);
    });

    b.rooms.forEach(room => {
      const c = room.center || { x: (room.bounds.xMin + room.bounds.xMax) / 2, z: (room.bounds.zMin + room.bounds.zMax) / 2 };
      const width = Math.max(14, (room.bounds.xMax - room.bounds.xMin) * k - 3);
      text(doc, nameForDisplay(room.name || '').toUpperCase(), X(c.x), Z(c.z) - 0.6, 6.2, { bold: true, align: 'center', maxWidth: width, space: 0.3 });
      text(doc, `${fr.format(room.area || 0)} m²`, X(c.x), Z(c.z) + 3.4, 6.8, { align: 'center', color: C.muted });
    });

    // Cotes d’encombrement.
    const dim = (a, c, offset, horizontal) => {
      doc.setDrawColor(C.muted).setLineWidth(0.15);
      const [x1, y1, x2, y2] = horizontal ? [X(a), Z(b.zMax) + offset, X(c), Z(b.zMax) + offset] : [X(b.xMax) + offset, Z(a), X(b.xMax) + offset, Z(c)];
      doc.line(x1, y1, x2, y2);
      [[x1, y1], [x2, y2]].forEach(([x, y]) => doc.line(x - 1.2, y + 1.2, x + 1.2, y - 1.2));
      const label = fr2.format(Math.abs(c - a));
      if (horizontal) text(doc, label, (x1 + x2) / 2, y1 - 1.3, 7, { align: 'center', color: C.muted });
      else { doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(C.muted); doc.text(label, x1 + 1.6, (y1 + y2) / 2, { angle: 90, align: 'center' }); }
    };
    dim(b.xMin, b.xMax, 9, true);
    dim(b.zMin, b.zMax, 9, false);

    // Nord et échelle graphique.
    const north = HouseAuto.northAngle ? HouseAuto.northAngle(data) * Math.PI / 180 : 0;
    const cx = box.x + box.w - 10, cy = box.y + 10, sx = Math.sin(north), sz = -Math.cos(north);
    doc.setDrawColor(C.ink).setLineWidth(0.3).circle(cx, cy, 6);
    doc.setFillColor(C.ink).triangle(cx + sx * 5.4, cy + sz * 5.4, cx - sz * 1.8 - sx * 2, cy + sx * 1.8 - sz * 2, cx + sz * 1.8 - sx * 2, cy - sx * 1.8 - sz * 2, 'F');
    text(doc, 'N', cx + sx * 9.5, cy + sz * 9.5 + 1.2, 7.5, { bold: true, align: 'center' });
    const bar = [1, 2, 5, 10].filter(m => m * k <= 60).at(-1) || 1;
    const bx = box.x, by = box.y + box.h - 3;
    for (let i = 0; i < 5; i++) {
      doc.setFillColor(i % 2 ? C.white : C.ink).rect(bx + i * bar * k / 5, by - 1.4, bar * k / 5, 1.4, 'F');
    }
    doc.setDrawColor(C.ink).setLineWidth(0.2).rect(bx, by - 1.4, bar * k, 1.4);
    text(doc, '0', bx, by + 3.4, 6.5, { color: C.muted });
    text(doc, `${bar} m`, bx + bar * k, by + 3.4, 6.5, { align: 'center', color: C.muted });
    text(doc, `Échelle 1:${denominator} (impression A3 à 100 %)`, bx + bar * k + 8, by, 6.8, { color: C.muted });
  }

  // ---------- Planches ----------
  function roomTable(doc, rooms, x, y, w) {
    kicker(doc, 'Tableau des surfaces', x, y);
    let row = y + 6;
    doc.setDrawColor(C.rule).setLineWidth(0.2);
    rooms.forEach(room => {
      text(doc, roomName(room.name), x, row, 7.6, { maxWidth: w - 40 });
      text(doc, FLOORS[room.floorType] || '', x + w - 20, row, 6.6, { color: C.muted, align: 'right', maxWidth: 24 });
      text(doc, `${fr.format(room.area || 0)} m²`, x + w, row, 7.6, { align: 'right', bold: room.habitable });
      doc.line(x, row + 2, x + w, row + 2);
      row += 6.2;
    });
    const habitable = rooms.filter(r => r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const annex = rooms.filter(r => !r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    doc.setDrawColor(C.ink).setLineWidth(0.4).line(x, row - 1.5, x + w, row - 1.5);
    text(doc, 'Surface habitable', x, row + 3.5, 8, { bold: true });
    text(doc, `${fr.format(habitable)} m²`, x + w, row + 3.5, 8, { bold: true, align: 'right' });
    if (annex > 0) {
      text(doc, 'Annexes (porche, terrasse…)', x, row + 9, 7.4, { color: C.muted });
      text(doc, `${fr.format(annex)} m²`, x + w, row + 9, 7.4, { align: 'right', color: C.muted });
    }
  }

  async function projectMedia(data) {
    const slug = window.ACTIVE_PROJECT_SLUG || data.meta?.slug;
    if (!slug) return { images: [], renders: [] };
    try {
      const response = await fetch(`api/gallery/media?project=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      return response.ok ? await response.json() : { images: [], renders: [] };
    } catch { return { images: [], renders: [] }; }
  }

  async function publishedViews(data, options = {}, preloadedMedia = null) {
    const slug = window.ACTIVE_PROJECT_SLUG || data.meta?.slug;
    if (!slug || typeof ViewOrder === 'undefined') return [];
    const media = preloadedMedia || await projectMedia(data);
    return ViewOrder.views(media, slug, Infinity, options).filter(view =>
      view.published
      && (options.includePlans || view.category !== 'plan')
      && (typeof DeliverableGate === 'undefined' || DeliverableGate.isEligible(view))
    );
  }

  function defaultDeliverableScreen(view) {
    if (typeof DeliverableGate === 'undefined') return null;
    const verdict = DeliverableGate.evaluate(view);
    return verdict.eligible ? null : { exclude: true, reason: verdict.reason };
  }

  function viewSourceCaption(view, data, { fallbackKind = 'unknown', plural = false } = {}) {
    const G = gateModule();
    if (G && typeof G.imageCaption === 'function') {
      return view ? G.imageCaption(view, { project: data, plural }) : G.imageCaption(fallbackKind, { plural });
    }
    if (view?.ai === true) return plural ? 'Images générées par IA — non contractuelles' : 'Image générée par IA — non contractuelle';
    return plural ? 'Illustrations du projet' : 'Illustration du projet';
  }

  /**
   * Lit les PDF de l'architecte : chaque page est rendue en haute définition, son texte vectoriel est extrait
   * et la planche est identifiée (SheetClassifier) : distribution, coffrage, façade, coupe… L'architecte
   * peut corriger chaque proposition avant l'assemblage. `paperMm` donne le format d'origine de la page.
   */
  async function readSheets(files, onStatus = () => {}) {
    const list = Array.from(files || []).filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (!list.length) return [];
    onStatus('Lecture de vos PDF…');
    const pdfjs = await loadPdfJs();
    const pages = [];
    for (const file of list) {
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      try {
        for (let n = 1; n <= pdf.numPages && pages.length < MAX_ANNEX_PAGES; n++) {
          onStatus(`Lecture de « ${file.name} » — page ${n}/${pdf.numPages}…`);
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(4, 2600 / Math.max(base.width, base.height)) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
          const g = canvas.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: g, viewport }).promise;
          let text = '';
          try { text = (await page.getTextContent()).items.map(item => item.str).join(' '); } catch { /* page sans texte */ }
          const thumb = document.createElement('canvas');
          const k = 220 / Math.max(canvas.width, canvas.height);
          thumb.width = Math.round(canvas.width * k); thumb.height = Math.round(canvas.height * k);
          thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
          const guess = typeof SheetClassifier !== 'undefined' ? SheetClassifier.classify({ text, fileName: file.name })
            : { type: 'autre', level: null, label: file.name, discipline: 'annexe', confidence: 'none', reasons: [], scale: '' };
          pages.push({ name: file.name, page: n, total: pdf.numPages, width: canvas.width, height: canvas.height,
            paperMm: { w: base.width * 25.4 / 72, h: base.height * 25.4 / 72 },
            data: canvas.toDataURL('image/jpeg', 0.86), thumb: thumb.toDataURL('image/jpeg', 0.8), text,
            guess, type: guess.type, level: guess.level, label: guess.label, include: true, replaceGenerated: true });
        }
      } finally { pdf.destroy(); }
      if (pages.length >= MAX_ANNEX_PAGES) break;
    }
    return pages;
  }
  const annexPages = readSheets;

  /**
   * Échelle réellement imprimée d'une planche réduite (ou agrandie) pour tenir dans le cadre A3 :
   * `cell` pour la case Échelle du cartouche, `note` pour la ligne de source.
   */
  function printedScale(page, drawnWidthMm) {
    const declared = Number(String(page.guess?.scale || '').split('/')[1]);
    if (!declared || !page.paperMm?.w) return { cell: '', note: '' };
    const ratio = drawnWidthMm / page.paperMm.w;
    if (Math.abs(ratio - 1) < 0.03) return { cell: `1/${declared}`, note: `dessiné et imprimé au 1/${declared}` };
    const printed = Math.round(declared / ratio);
    return { cell: `1/${printed}`, note: `dessiné au 1/${declared}, imprimé au 1/${printed} (${ratio < 1 ? 'réduit' : 'agrandi'} pour l’A3)` };
  }

  // Couleur d'onglet par discipline : or (architecture), ardoise (structure), terre cuite (lots techniques).
  const DISCIPLINE_TONE = { architecture: C.gold, structure: '#5b6f7c', technique: '#a0583a', annexe: C.muted };
  /** Format ISO le plus proche d'une page (mm), quelle que soit son orientation. */
  function paperFormat(mm) {
    if (!mm?.w) return '';
    const long = Math.max(mm.w, mm.h), short = Math.min(mm.w, mm.h);
    const iso = [['A0', 1189, 841], ['A1', 841, 594], ['A2', 594, 420], ['A3', 420, 297], ['A4', 297, 210]];
    const [name, L, S] = iso.reduce((best, f) => Math.abs(f[1] - long) + Math.abs(f[2] - short) < Math.abs(best[1] - long) + Math.abs(best[2] - short) ? f : best);
    return Math.abs(L - long) < 25 && Math.abs(S - short) < 25 ? `${name} ${long > short && mm.w > mm.h ? 'paysage' : 'portrait'}` : `${Math.round(mm.w)} × ${Math.round(mm.h)} mm`;
  }
  const IDENTIFIED = { title: 'Lue dans le cartouche', likely: 'Déduite du contenu', low: 'À confirmer', none: 'Choisie par l’architecte' };

  /**
   * Planche fournie par l'architecte, mise en valeur comme un tirage : feuille blanche montée avec ombre
   * et filet d'or, onglet de discipline, colonne d'informations (échelles, format d'origine, source),
   * nord, et — pour un plan de distribution — le tableau des surfaces de la maquette au même niveau.
   */
  function architectSheet(doc, data, sheet) {
    const page = sheet.annex;
    const discipline = (typeof SheetClassifier !== 'undefined' && SheetClassifier.TYPES[page.type]?.discipline) || 'annexe';
    const tone = DISCIPLINE_TONE[discipline] || C.muted;
    const side = 88, area = { x: content.x, y: content.y + 2, w: content.w - side - 10, h: content.h - 4 };
    const pad = 5, ratio = Math.min((area.w - 2 * pad) / page.width, (area.h - 2 * pad) / page.height);
    const w = page.width * ratio, h = page.height * ratio;
    const ix = area.x + (area.w - w) / 2, iy = area.y + (area.h - h) / 2;
    // Échelle honnête : celle du cartouche d'origine, corrigée de la réduction au format A3.
    const scale = printedScale(page, w);
    sheet.scale = scale.cell;
    sheetFrame(doc, data, sheet);

    // Tirage monté : ombre, feuille blanche, filet d'or, repères de coupe.
    doc.setFillColor('#dcd6c9').rect(ix - pad + 1.4, iy - pad + 1.6, w + 2 * pad, h + 2 * pad, 'F');
    doc.setFillColor(C.white).rect(ix - pad, iy - pad, w + 2 * pad, h + 2 * pad, 'F');
    doc.setDrawColor(tone).setLineWidth(0.3).rect(ix - pad, iy - pad, w + 2 * pad, h + 2 * pad);
    doc.addImage(page.data, 'JPEG', ix, iy, w, h);
    cropMarks(doc, ix - pad, iy - pad, w + 2 * pad, h + 2 * pad, tone, 4, 1.2);

    // Colonne d'informations.
    const sx = area.x + area.w + 10, sw = side;
    doc.setFillColor(tone).rect(sx, content.y, sw, 2.2, 'F');
    const DISC = typeof SheetClassifier !== 'undefined' ? SheetClassifier.DISCIPLINES : {};
    text(doc, (DISC[discipline] || 'Document').toUpperCase(), sx, content.y + 9, 6.2, { bold: true, color: tone, space: 0.8 });
    text(doc, 'Planche de l’architecte', sx, content.y + 16, 12.5, { serif: true, bold: true, color: C.ink });
    const levelLabel = Number.isInteger(page.level) && typeof SheetClassifier !== 'undefined' ? SheetClassifier.levelName(page.level) : '—';
    const rows = [
      ['Niveau', levelLabel],
      ['Échelle dessinée', page.guess?.scale ? page.guess.scale : 'non indiquée'],
      ['Échelle imprimée', scale.cell || '—'],
      ['Format d’origine', paperFormat(page.paperMm) || '—'],
      ['Source', `${page.name}${page.total > 1 ? ` · p. ${page.page}/${page.total}` : ''}`],
      ['Identification', page.type !== page.guess?.type || page.level !== page.guess?.level ? 'Choisie par l’architecte' : IDENTIFIED[page.guess?.confidence] || '—']
    ];
    let ry = content.y + 22;
    rows.forEach(([label, value]) => {
      doc.setDrawColor(C.rule).setLineWidth(0.2).line(sx, ry, sx + sw, ry);
      text(doc, label.toUpperCase(), sx, ry + 4.6, 5.2, { bold: true, color: C.muted, space: 0.5 });
      text(doc, value, sx + sw, ry + 4.6, 7.4, { align: 'right', maxWidth: sw - 30 });
      ry += 7.2;
    });
    doc.setDrawColor(C.rule).line(sx, ry, sx + sw, ry);
    if (scale.note) ry = paragraph(doc, `Plan ${scale.note}. Les cotes inscrites font foi.`, sx, ry + 6, sw, 6.8, 1.4, C.muted, 3) + 2;
    // Nord, pour les plans d'implantation et de niveau.
    if (['masse', 'situation', 'distribution', 'coffrage', 'fondation', 'toiture'].includes(page.type)) {
      northArrow(doc, sx + sw - 6, ry + 9, 4.2, C.ink, Number(data.config?.northDegrees) || 0);
      text(doc, 'Orientation de la maquette', sx, ry + 10, 6.2, { color: C.muted });
      ry += 20;
    }
    // Surfaces de la maquette au même niveau : la planche et le modèle se contrôlent mutuellement.
    const rooms = page.type === 'distribution' && Number.isInteger(page.level) ? data.rooms.filter(r => (Number(r.level) || 0) === page.level) : [];
    if (rooms.length && ry < content.y + content.h - 40) roomTable(doc, rooms.slice(0, Math.floor((content.y + content.h - ry - 20) / 6.2)), sx, ry + 4, sw);
  }

  /**
   * Plan du rez-de-chaussée à montrer en couverture : d'abord la planche de distribution fournie avec le
   * cahier, sinon la planche de référence du projet (edition.sheets), sinon rien (trait de la maquette).
   */
  async function coverPlanSource(data, annexes = [], manifestImages = []) {
    const toTile = async (src, title, source) => {
      const img = await loadImage(src);
      const ratio = img.naturalHeight / img.naturalWidth;
      return { image: jpeg(img, 1400, Math.round(1400 * ratio), { background: C.white, quality: 0.92 }), ratio, title, source };
    };
    try {
      const page = annexes.find(p => p.type === 'distribution' && p.level === 0 && p.include !== false)
        || annexes.find(p => p.type === 'distribution' && p.include !== false);
      if (page) return await toTile(page.data, page.level ? `Plan — ${SheetClassifier?.levelName?.(page.level) || 'étage'}` : 'Plan du rez-de-chaussée', 'planche de l’architecte');
      const ref = (data.edition?.sheets || []).find(s => /rez|rdc/i.test(s.title || ''));
      const resolvedArt = ref && typeof DeliverableGate !== 'undefined' ? DeliverableGate.resolveSheetSource(ref, manifestImages).source : (ref?.preview || ref?.art);
      const src = ref?.preview || resolvedArt;
      if (src) return await toTile(src, 'Plan du rez-de-chaussée', 'planche du projet');
    } catch { /* image illisible : repli sur le trait de la maquette */ }
    return null;
  }

  /**
   * Diptyque : la planche technique de l'architecte et sa version d'ambiance IA, montées côte à côte à la
   * même taille, sur fond lin. Légendes, contrôle géométrique et mention « non contractuel ».
   */
  async function diptychSheet(doc, data, sheet) {
    const page = sheet.annex, s = page.sublimed;
    sheet.scale = 'Sans échelle';
    sheetFrame(doc, data, sheet);
    const img = await loadImage(s.data);
    const gap = 14, cellW = (content.w - gap) / 2, cellH = content.h - 22;
    const mount = (data64, iw, ih, x, caption, note, tone) => {
      const k = Math.min((cellW - 12) / iw, (cellH - 12) / ih), w = iw * k, h = ih * k;
      const ix = x + (cellW - w) / 2, iy = content.y + 4 + (cellH - h) / 2;
      doc.setFillColor('#dcd6c9').rect(ix - 5 + 1.4, iy - 5 + 1.6, w + 10, h + 10, 'F');
      doc.setFillColor(C.white).rect(ix - 5, iy - 5, w + 10, h + 10, 'F');
      doc.setDrawColor(tone).setLineWidth(0.3).rect(ix - 5, iy - 5, w + 10, h + 10);
      doc.addImage(data64, 'JPEG', ix, iy, w, h);
      cropMarks(doc, ix - 5, iy - 5, w + 10, h + 10, tone, 4, 1.2);
      text(doc, caption, x + cellW / 2, content.y + cellH + 14, 9, { serif: true, bold: true, align: 'center' });
      text(doc, note, x + cellW / 2, content.y + cellH + 19.5, 6.6, { align: 'center', color: C.muted, maxWidth: cellW - 10 });
    };
    mount(page.data, page.width, page.height, content.x, 'Planche technique de l’architecte',
      `${page.name}${page.guess?.scale ? ` · dessinée au ${page.guess.scale}` : ''} · les cotes font foi`, C.ink);
    mount(jpeg(img, img.naturalWidth, img.naturalHeight, { background: C.white, quality: 0.92 }), img.naturalWidth, img.naturalHeight,
      content.x + cellW + gap, 'Version d’ambiance', `Rendu d’ambiance illustratif non contractuel${s.fidelity ? ` · ${typeof FidelityCheck !== 'undefined' ? FidelityCheck.describe(s.fidelity) : ''}` : ''}`, C.gold);
    // Filet d'or central, comme la pliure d'un portfolio.
    doc.setDrawColor(C.gold).setLineWidth(0.25).line(content.x + cellW + gap / 2, content.y + 8, content.x + cellW + gap / 2, content.y + cellH - 4);
  }

  /** Titre de planche d'architecte : libellé choisi (ou proposé), complété par le niveau si besoin. */
  function architectTitle(page) {
    if (typeof SheetClassifier === 'undefined') return page.label || page.name;
    const custom = page.label && page.label !== page.guess?.label ? page.label : null;
    return custom || SheetClassifier.label(page.type, page.level, {
      orientation: page.type === page.guess?.type ? (page.guess.label.match(/^Façade (.+)$/) || [])[1] : '',
      cut: page.type === page.guess?.type ? (page.guess.label.match(/^Coupe (.+)$/) || [])[1] : ''
    });
  }

  /** Planches proposées dans la fenêtre de composition, dans l’ordre du cahier. */
  const SECTIONS = [
    { id: 'synth', label: 'Planche de synthèse', hint: 'One-pager complet : plan 2D, 3D, intérieurs, écorché et matières' },
    { id: 'axo', label: 'Axonométrie', hint: 'Vue d’ensemble de la maquette' },
    { id: 'cut', label: 'Écorché — vue en coupe', hint: 'Coupe horizontale, mobilier visible' },
    { id: 'plans', label: 'Plans cotés à l’échelle', hint: 'Une planche par niveau' },
    { id: 'views', label: 'Ambiances', hint: 'Les images ajoutées au cahier (4 au plus)' },
    { id: 'spec', label: 'Descriptif sommaire', hint: 'Pièces, surfaces, revêtements' },
    { id: 'estimate', label: 'Estimation indicative (FCFA)', hint: 'Fourchette et métré', off: true }
  ];

  /**
   * Compose et télécharge le cahier selon la composition approuvée.
   * @param {object} options { data, studio, files (PDF d’annexe, facultatif), sections ({ axo: true, … }), onStatus }
   * Les images d’ambiance sont celles explicitement ajoutées au cahier ; aucune n’est incluse par défaut.
   */
  async function exportBook({ data, studio, files = null, annexes: prepared = null, sections = {}, includeEstimate, cabinet: explicitCabinet, screen = null, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    const ID = identityModule();
    const cabinet = explicitCabinet !== undefined ? explicitCabinet : (ID ? await ID.loadCabinetProfile() : null);
    const bookData = cabinet ? { ...data, cabinet } : data;
    const hs = studio.hs;
    const on = id => (id === 'estimate' && includeEstimate !== undefined ? includeEstimate : sections[id] ?? !SECTIONS.find(s => s.id === id)?.off);
    // Planches de l'architecte : déjà lues et vérifiées dans la fenêtre de composition, sinon lues ici.
    const annexes = (prepared || await readSheets(files, onStatus)).filter(page => page.include !== false);
    const TYPES = typeof SheetClassifier !== 'undefined' ? SheetClassifier.TYPES : {};
    const DISCIPLINES = typeof SheetClassifier !== 'undefined' ? SheetClassifier.DISCIPLINES : {};
    const architect = annexes.flatMap(page => {
      const info = TYPES[page.type] || { discipline: 'annexe', order: 900 };
      const sheet = { id: 'annex', annex: page, title: architectTitle(page), type: page.type, level: page.level, order: info.order,
        section: page.type === 'autre' || !TYPES[page.type] ? 'Annexe architecte' : `${DISCIPLINES[info.discipline]} · planche de l’architecte` };
      // Version d'ambiance IA retenue : soumise à la Porte E (fidèle v2 ou forçage tracé).
      const sublimedAllowed = page.sublimed?.data && page.sublimedInclude && (typeof DeliverableGate === 'undefined'
        || DeliverableGate.isEligible({ id: page.sublimed.id || 'photor-planche', ai: true, fidelity: page.sublimed.fidelity, fidelityOverride: page.sublimed.fidelityOverride }));
      const diptych = sublimedAllowed
        ? [{ ...sheet, id: 'diptych', title: `${sheet.title} — technique et ambiance`, section: `${DISCIPLINES[info.discipline] || 'Architecture'} · version d’ambiance` }] : [];
      return [sheet, ...diptych];
    }).sort((a, b) => a.order - b.order || (a.level ?? 0) - (b.level ?? 0));
    // Un plan de distribution fourni par l'architecte remplace le plan généré du même niveau (sauf avis contraire).
    const replacedLevels = new Set(annexes.filter(p => p.type === 'distribution' && p.replaceGenerated !== false && Number.isInteger(p.level)).map(p => p.level));
    const byOrder = (min, max) => architect.filter(s => s.order >= min && s.order < max);
    onStatus('Prises de vue de la maquette…');
    const media = await projectMedia(data);
    const allViews = await publishedViews(data, {}, media);
    const gateScreen = typeof screen === 'function' ? screen : defaultDeliverableScreen;
    const { kept: views, excluded } = await screenViews(allViews.filter(view => view.book), gateScreen, onStatus);
    const eligibleEditionSheets = (data.edition?.sheets || []).map(s => {
      const resolved = typeof DeliverableGate !== 'undefined'
        ? DeliverableGate.resolveSheetSource(s, media.images || [])
        : { source: s.art || s.preview, fallback: false, reason: '' };
      if (resolved.fallback && s.art) excluded.push({ view: { label: `${s.title} (version IA)` }, reason: resolved.reason || 'écart géométrique' });
      return { id: 'art', title: s.title, section: 'Planches de référence', source: resolved.source };
    }).filter(s => Boolean(s.source));
    const levels = [...new Set(data.walls.map(w => Number(w.level) || 0))].sort((a, b) => a - b).filter(level => levelBounds(data, level).valid);
    const levelName = level => level === 0 ? 'Rez-de-chaussée' : `Étage ${level}`;
    const estimate = on('estimate') && typeof CostEstimate !== 'undefined' ? CostEstimate.estimate(data, data.estimate) : null;

    // Sommaire établi d’avance : les numéros de planche figurent dans les cartouches.
    // Plans : ceux de l'architecte et ceux tirés de la maquette, rangés ensemble par niveau.
    const generatedPlans = on('plans') && !eligibleEditionSheets.length
      ? levels.filter(level => !replacedLevels.has(level)).map(level => ({ id: 'plan', level, title: `Plan - ${levelName(level)}`, section: 'Plans · tirés de la maquette', order: 30 }))
      : [];
    const plans = [...generatedPlans, ...architect.filter(s => s.type === 'distribution')].sort((a, b) => (a.level ?? 99) - (b.level ?? 99));
    // Ordre d'un dossier d'architecte : situation et masse, plans, façades et coupes, toiture, volumétrie,
    // images et notice, puis structure (BET) et lots techniques, enfin les documents non identifiés.
    const sheets = [{ id: 'cover', title: 'Couverture', section: 'Présentation' },
      ...(on('synth') ? [{ id: 'synth', title: 'Planche de synthèse', section: 'Synthèse du projet' }] : []),
      ...byOrder(0, 30),
      ...(on('plans') && eligibleEditionSheets.length ? eligibleEditionSheets : []),
      ...plans,
      ...byOrder(31, 100),
      ...(on('axo') ? [{ id: 'axo', title: 'Axonométrie', section: 'Volumétrie' }] : []),
      ...(on('cut') ? [{ id: 'cut', title: 'Écorché — vue en coupe', section: 'Volumétrie' }] : []),
      ...(on('views') ? [{ id: 'views', title: views.length ? 'Ambiances' : 'Vues de la maquette', section: 'Images' }] : []),
      ...(on('spec') ? [{ id: 'spec', title: 'Descriptif sommaire', section: 'Notice' }] : []),
      ...(estimate ? [{ id: 'estimate', title: 'Estimation indicative', section: 'Économie' }] : []),
      ...byOrder(100, 900),
      ...byOrder(900, Infinity)];
    sheets.forEach((sheet, i) => { sheet.code = i ? `PL-${String(i).padStart(2, '0')}` : 'PL-00'; });
    const planBox = { x: content.x, y: content.y, w: content.w - 92, h: content.h };
    sheets.filter(s => s.id === 'plan').forEach(s => { s.denominator = planScale(levelBounds(data, s.level), planBox); s.scale = `1:${s.denominator}`; });

    const doc = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape', compress: true });
    const title = nameForDisplay(data.meta?.name || 'Projet');
    doc.setProperties({ title: `${title} — Cahier de plans`, subject: 'Cahier de plans et présentation du projet', creator: 'ArchiCam Studio' });

    // Couverture : meilleure vue éligible (façade/cover d’abord), sinon capture éligible, sinon axonométrie 3D.
    const heroW = 2600, heroH = Math.round(heroW * H / W); // image d'ouverture pleine page
    const pickedCover = typeof DeliverableGate !== 'undefined' ? DeliverableGate.pickCover(media) : null;
    const heroView = views[0] || (pickedCover
      ? { ...(pickedCover.item || {}), file: pickedCover.file, source: pickedCover.file, label: pickedCover.item?.label || 'Vue du projet',
          ...(pickedCover.kind === 'render' ? { sourceKind: 'render3d' } : {}) }
      : null);
    const heroSource = heroView?.source || null;
    const hero = heroSource ? jpeg(await loadImage(heroSource), heroW, heroH) : render(hs, axonometric(data, hs), heroW, heroH);
    // Plan de distribution réel du projet pour la couverture : planche de l'architecte si elle existe.
    const coverPlan = await coverPlanSource(data, annexes, media.images || []);

    for (const [index, sheet] of sheets.entries()) {
      if (index) doc.addPage('a3', 'landscape');
      onStatus(`Composition — ${sheet.code} ${sheet.title}…`);
      if (sheet.id === 'cover') cover(doc, bookData, sheet, hero, sheets, heroView, coverPlan, { cabinet });
      else if (sheet.id === 'synth') await drawSynthesisBoard(doc, bookData, sheet, studio, views);
      else if (sheet.id === 'axo') {
        sheetFrame(doc, bookData, sheet);
        const w = content.w - 96, h = content.h;
        doc.addImage(render(hs, axonometric(data, hs), 2400, Math.round(2400 * h / w)), 'JPEG', content.x, content.y, w, h);
        sideNote(doc, content.x + w + 8, content.y, 88, 'Volumétrie d’ensemble',
          'Vue axonométrique générée depuis la maquette 3D du projet : volumes, toiture, ouvertures et abords à l’échelle relative exacte du plan.',
          [['Hauteur sous plafond', `${fr2.format(data.config.wallHeight)} m`], ['Niveaux', levels.length === 1 ? 'Plain-pied' : `R+${levels.length - 1}`],
            ['Emprise', `${fr.format(HouseAuto.bbox(data).w)} × ${fr.format(HouseAuto.bbox(data).d)} m`]]);
      } else if (sheet.id === 'cut') {
        sheetFrame(doc, bookData, sheet);
        const w = content.w - 96, h = content.h;
        doc.addImage(render(hs, axonometric(data, hs, -Math.PI / 2), 2400, Math.round(2400 * h / w), { section: true }), 'JPEG', content.x, content.y, w, h);
        sideNote(doc, content.x + w + 8, content.y, 88, 'La maison ouverte',
          `Coupe horizontale à ${fr2.format(sceneHeight(data, hs) * 0.5)} m du sol : l’organisation des pièces, les circulations et l’ameublement se lisent d’un seul regard.`,
          data.rooms.filter(r => r.habitable).slice(0, 8).map(r => [roomName(r.name), `${fr.format(r.area || 0)} m²`]));
      } else if (sheet.id === 'art') {
        sheetFrame(doc, bookData, sheet);
        const image = await loadImage(sheet.source);
        const ratio = Math.min(content.w / image.naturalWidth, content.h / image.naturalHeight);
        const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
        doc.setFillColor(C.paper).rect(content.x + (content.w - w) / 2, content.y + (content.h - h) / 2, w, h, 'F');
        doc.addImage(jpeg(image, image.naturalWidth, image.naturalHeight, { quality: 0.98, background: C.paper }), 'JPEG', content.x + (content.w - w) / 2, content.y + (content.h - h) / 2, w, h);
      } else if (sheet.id === 'plan') {
        sheetFrame(doc, bookData, sheet);
        drawPlan(doc, data, sheet.level, planBox, sheet.denominator);
        roomTable(doc, data.rooms.filter(r => (Number(r.level) || 0) === sheet.level), planBox.x + planBox.w + 12, content.y + 2, 80);
      } else if (sheet.id === 'views') await viewsSheet(doc, bookData, sheet, views, studio);
      else if (sheet.id === 'spec') specification(doc, bookData, sheet);
      else if (sheet.id === 'estimate') estimateSheet(doc, bookData, sheet, estimate);
      else if (sheet.id === 'annex') architectSheet(doc, bookData, sheet);
      else if (sheet.id === 'diptych') await diptychSheet(doc, bookData, sheet);
    }
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    doc.save(`${slug}-cahier-de-plans.pdf`);
    const missing = ID ? ID.missingFields(bookData, { cabinet }) : { missing: [], message: '' };
    return { pages: sheets.length, annexes: annexes.length, excluded: excluded.map(e => ({ label: e.view.label, reason: e.reason })), missingFields: missing };
  }

  /**
   * Catalogue des intérieurs : les rendus ajoutés au catalogue, une image pleine page chacun (A4 paysage),
   * avec couverture et planche-contact finale. Ouvert aux clients : aucune donnée de chiffrage.
   */
  
  /**
   * Planche de Synthèse Architecturale A3 Paysage (Master Project Board / One-Pager) :
   * En-tête éditorial, plan 2D meublé coté, maquette générale, 3 perspectives intérieures,
   * écorché 3D axonométrique, tableau des surfaces et nuancier des matériaux nobles.
   */
  async function drawSynthesisBoard(doc, data, sheet, studio, views = []) {
    const hs = studio?.hs;
    const i = info(data, sheet);
    const bb = HouseAuto.bbox(data);
    const levels = [...new Set(data.walls.map(w => Number(w.level) || 0))].sort((a, b) => a - b);
    const habitable = data.totals?.habitable || data.rooms.filter(r => r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const annexesArea = data.rooms.filter(r => !r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const totalArea = habitable + annexesArea;

    // Fond papier lin chaud adouci & double filet de cadrage éditorial
    doc.setFillColor(C.paper).rect(0, 0, W, H, 'F');
    doc.setDrawColor(C.rule).setLineWidth(0.35).rect(8, 8, W - 16, H - 16);
    doc.setDrawColor(C.sand).setLineWidth(0.18).rect(9.5, 9.5, W - 19, H - 19);

    // En-tête de prestige (Haut Gauche)
    const projectTitle = nameForDisplay(data.meta?.name || 'Projet').toUpperCase();
    text(doc, projectTitle, 14, 20.5, 20, { serif: true, bold: true, color: C.ink, space: 0.3 });
    const sub = `SUPERFICIE HABITABLE : ${fr.format(habitable)} m² · EMPRISE : ${fr.format(bb.w)} × ${fr.format(bb.d)} m · ${levels.length <= 1 ? 'PLAIN-PIED' : 'R+' + (levels.length - 1)}`;
    text(doc, sub, 14, 27, 8.2, { bold: true, color: C.muted, space: 0.5 });

    // Cartouche officiel d'architecture (Haut Droite)
    const cw = 98, ch = 23, cx = W - 14 - cw, cy = 11;
    doc.setFillColor(C.white).rect(cx, cy, cw, ch, 'F');
    doc.setDrawColor(C.ink).setLineWidth(0.35).rect(cx, cy, cw, ch);
    text(doc, 'ARCHICAM STUDIO', cx + cw / 2, cy + 5.5, 8.5, { align: 'center', bold: true, color: C.gold, space: 1.4 });
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(cx, cy + 8, cx + cw, cy + 8);
    text(doc, 'PLANCHE DE SYNTHÈSE DU PROJET', cx + cw / 2, cy + 12.8, 7.2, { align: 'center', bold: true, color: C.ink, space: 0.4 });
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(cx, cy + 15.5, cx + cw, cy + 15.5);
    const metaLine = ['Échelle indicative', i.phase && `Phase ${i.phase}`, i.revision && `Indice ${i.revision}`].filter(Boolean).join(' · ');
    text(doc, metaLine, cx + 4, cy + 20, 6, { color: C.muted, maxWidth: cw - 24 });
    if (i.date) text(doc, i.date, cx + cw - 4, cy + 20, 6, { align: 'right', color: C.muted });

    // Boussole Nord
    const nx = cx - 12, ny = cy + ch / 2;
    doc.setDrawColor(C.ink).setLineWidth(0.25).circle(nx, ny, 5);
    doc.setFillColor(C.ink).triangle(nx, ny - 4.5, nx - 1.5, ny + 1.5, nx + 1.5, ny + 1.5, 'F');
    text(doc, 'N', nx, ny - 6.5, 6, { bold: true, align: 'center' });

    // Résolution intelligente des vues
    const findView = (...keys) => {
      for (const k of keys) {
        const v = views.find(x => x.id?.includes(k) || x.source?.includes(k) || x.label?.toLowerCase().includes(k.toLowerCase()));
        if (v?.source) return v.source;
      }
      return null;
    };

    const drawBox = async (title, x, y, w, h, src, fallbackFn) => {
      kicker(doc, title, x, y - 2);
      doc.setFillColor(C.white).rect(x, y, w, h, 'F');
      doc.setDrawColor(C.sand).setLineWidth(0.25).rect(x, y, w, h);
      if (src) {
        try {
          const img = await loadImage(src);
          doc.addImage(jpeg(img, Math.round(w * 10), Math.round(h * 10)), 'JPEG', x, y, w, h);
          return;
        } catch {}
      }
      if (fallbackFn) fallbackFn(x, y, w, h);
    };

    // --- Colonne GAUCHE (Plan 2D + Tableau + Nuancier) ---
    // Plan 2D d'aménagement (X = 14, Y = 38, W = 158, H = 145)
    const planSrc = findView('photor-plan-2d', 'plan-2d', 'plan') || data.config?.planImage?.url;
    await drawBox("PLAN D'AMÉNAGEMENT · REZ-DE-CHAUSSÉE", 14, 38, 158, 145, planSrc, (x, y, w, h) => {
      drawPlan(doc, data, 0, { x, y, w, h }, 100);
    });

    // Tableau des surfaces (X = 14, Y = 194, W = 86, H = 84)
    kicker(doc, 'TABLEAU DES SURFACES', 14, 192);
    let ty = 197;
    const rooms = data.rooms.slice().sort((a, b) => (b.area || 0) - (a.area || 0));
    rooms.slice(0, 7).forEach(r => {
      text(doc, roomName(r.name), 14, ty, 7, { bold: r.habitable, maxWidth: 56 });
      text(doc, `${fr.format(r.area || 0)} m²`, 14 + 86, ty, 7, { align: 'right', bold: r.habitable });
      doc.setDrawColor(C.rule).setLineWidth(0.12).line(14, ty + 1.5, 14 + 86, ty + 1.5);
      ty += 5.2;
    });
    doc.setDrawColor(C.ink).setLineWidth(0.35).line(14, ty + 0.5, 14 + 86, ty + 0.5);
    ty += 4.5;
    text(doc, 'TOTAL HABITABLE', 14, ty, 7.5, { bold: true });
    text(doc, `${fr.format(habitable)} m²`, 14 + 86, ty, 7.5, { align: 'right', bold: true });
    ty += 4.5;
    text(doc, 'Annexes (véranda, terrasse)', 14, ty, 6.5, { color: C.muted });
    text(doc, `${fr.format(annexesArea)} m²`, 14 + 86, ty, 6.5, { align: 'right', color: C.muted });
    ty += 4.5;
    doc.setDrawColor(C.gold).setLineWidth(0.4).line(14, ty, 14 + 86, ty);
    text(doc, 'SURFACE GLOBALE', 14, ty + 4, 7.8, { bold: true, color: C.gold });
    text(doc, `${fr.format(totalArea)} m²`, 14 + 86, ty + 4, 7.8, { align: 'right', bold: true, color: C.gold });

    // Matériauthèque & Finitions (X = 108, Y = 194, W = 64, H = 84)
    kicker(doc, 'MATÉRIAUTHÈQUE & FINITIONS', 108, 192);
    const swatches = [
      { label: 'Enduit à la chaux vert sauge', color: '#7D8C7C', sub: 'Murs extérieurs' },
      { label: 'Pierre calcaire flammée', color: '#C5BCAC', sub: 'Piliers & perron' },
      { label: 'Menuiseries alu noir mat', color: '#272B2D', sub: 'Baies & vitrages' },
      { label: 'Parquet chêne massif', color: '#C49F6E', sub: 'Séjour & chambres' },
      { label: 'Toiture tuiles sombres / zinc', color: '#3A4247', sub: 'Couverture' }
    ];
    swatches.forEach((sw, idx) => {
      const sy = 196 + idx * 15.5;
      doc.setFillColor(sw.color).rect(108, sy, 11, 11, 'F');
      doc.setDrawColor(C.sand).setLineWidth(0.2).rect(108, sy, 11, 11);
      text(doc, sw.label, 122, sy + 4.5, 6.8, { bold: true, color: C.ink, maxWidth: 50 });
      text(doc, sw.sub, 122, sy + 8.8, 5.8, { color: C.muted });
    });

    // --- Colonne CENTRALE (X = 180, W = 114) ---
    const extSrc = findView('photor-perspective-01', 'perspective-01', 'facade') || views[0]?.source;
    await drawBox("MAQUETTE GÉNÉRALE · PERSPECTIVE D'ACCUEIL", 180, 38, 114, 73, extSrc, (x, y, w, h) => {
      if (hs) doc.addImage(render(hs, axonometric(data, hs), 1200, 770), 'JPEG', x, y, w, h);
    });

    const sejourSrc = findView('photor-sejour-veranda', 'sejour', 'salon');
    await drawBox("SÉJOUR CATHÉDRALE & VÉRANDA", 180, 122, 114, 73, sejourSrc);

    const verandaSrc = findView('photor-perspective-02', 'perspective-02', 'terrasse');
    await drawBox("VÉRANDA ARRIÈRE & JARDIN PAYSAGER", 180, 206, 114, 73, verandaSrc);

    // --- Colonne DROITE (X = 302, W = 104) ---
    const cuisineSrc = findView('photor-cuisine', 'cuisine');
    await drawBox("CUISINE CONTEMPORAINE", 302, 38, 104, 62, cuisineSrc);

    const suiteSrc = findView('photor-suite-parentale', 'suite', 'chambre');
    await drawBox("SUITE PARENTALE & BALCON", 302, 111, 104, 62, suiteSrc);

    const coupeSrc = findView('photor-coupe-bb', 'coupe');
    await drawBox("COUPE PERSPECTIVE 3D · ÉCORCHÉ", 302, 184, 104, 95, coupeSrc, (x, y, w, h) => {
      if (hs) doc.addImage(render(hs, axonometric(data, hs, -Math.PI / 2), 1200, 1000, { section: true }), 'JPEG', x, y, w, h);
    });

    // Bas de page éditorial : mention véridique selon les sources réellement affichées sur la planche.
    const boardSources = [extSrc, sejourSrc, verandaSrc, cuisineSrc, suiteSrc, coupeSrc].filter(Boolean);
    const boardViews = boardSources.map(src => views.find(v => v.source === src)).filter(Boolean);
    const boardKinds = boardViews.map(v => (typeof DeliverableGate !== 'undefined' ? DeliverableGate.imageSourceKind(v, data) : (v.ai ? 'ai' : 'unknown')));
    let boardNote;
    if (boardKinds.includes('ai')) {
      boardNote = viewSourceCaption(null, data, { fallbackKind: 'ai', plural: true });
    } else if (boardKinds.length && new Set(boardKinds).size === 1) {
      boardNote = viewSourceCaption(null, data, { fallbackKind: boardKinds[0], plural: boardKinds.length > 1 });
    } else if (!boardViews.length && hs) {
      boardNote = viewSourceCaption(null, data, { fallbackKind: 'render3d', plural: true });
    } else {
      boardNote = viewSourceCaption(null, data, { fallbackKind: 'unknown', plural: true });
    }
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(14, 287, W - 14, 287);
    text(doc, 'ARCHICAM STUDIO · PLANCHE DE SYNTHÈSE ARCHITECTURALE', 14, 291.5, 6.4, { bold: true, color: C.ink, space: 0.4 });
    text(doc, `Édition Monographe Privée · ${boardNote}`, W - 14, 291.5, 6.2, { align: 'right', color: C.muted });
  }

  async function exportSynthesisBoard({ data, studio, screen = null, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape', compress: true });
    onStatus('Composition de la planche de synthèse…');
    const rawViews = await publishedViews(data, { keepDuplicates: true, includePlans: true });
    const gateScreen = typeof screen === 'function' ? screen : defaultDeliverableScreen;
    const { kept: views } = await screenViews(rawViews, gateScreen, onStatus);
    await drawSynthesisBoard(doc, data, { code: 'PL-01', title: 'Planche de synthèse architecturale' }, studio, views);
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    doc.save(`${slug}-planche-de-synthese.pdf`);
    return { success: true };
  }

  /**
   * Contrôle des rendus avant un livrable : `screen(view)` (fourni par l'application, contrôle de fidélité)
   * renvoie { exclude, reason } ; les vues écartées sont rendues pour être annoncées à l'architecte.
   */
  async function screenViews(views, screen, onStatus = () => {}) {
    const activeScreen = typeof screen === 'function' ? screen : defaultDeliverableScreen;
    const kept = [], excluded = [];
    for (const [n, view] of views.entries()) {
      onStatus(`Contrôle géométrique ${n + 1}/${views.length}…`);
      let verdict = null;
      try { verdict = await activeScreen(view); } catch { verdict = null; }
      if (verdict?.exclude) excluded.push({ view, reason: verdict.reason || 'écart géométrique' });
      else kept.push(view);
    }
    return { kept, excluded };
  }
  /** Définition d'impression (dpi) d'une image posée sur `widthMm`. */
  const printDpi = (img, widthMm) => Math.round(img.naturalWidth / (widthMm / 25.4));

  async function exportCatalog({ data, cabinet: explicitCabinet, screen = null, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    const ID = identityModule();
    const cabinet = explicitCabinet !== undefined ? explicitCabinet : (ID ? await ID.loadCabinetProfile() : null);
    onStatus('Lecture du catalogue…');
    const listed = (await publishedViews(data, { keepDuplicates: true, includePlans: true })).filter(view => view.catalog);
    if (!listed.length) throw new Error('Le catalogue est vide : ajoutez-y des rendus depuis la galerie.');
    // Porte E : aucun rendu IA non fidèle n'entre dans un document remis au client sans forçage tracé.
    const { kept: items, excluded } = await screenViews(listed, screen, onStatus);
    if (!items.length) throw new Error('Toutes les images du catalogue s’écartent de la géométrie du projet : régénérez-les avant d’exporter.');
    const images = [];
    for (const [n, view] of items.entries()) {
      onStatus(`Préparation de l’image ${n + 1}/${items.length}…`);
      try { images.push({ view, img: await loadImage(view.source) }); } catch { /* image manquante ignorée */ }
    }
    if (!images.length) throw new Error('Les images du catalogue sont illisibles.');
    // Pleine page A4 paysage (277 mm de large) : en dessous de 150 dpi, l'impression perd en netteté.
    const lowRes = images.filter(({ img }) => printDpi(img, 277) < 150).map(({ view, img }) => ({ label: view.label, dpi: printDpi(img, 277) }));
    const PW = 297, PH = 210, title = nameForDisplay(data.meta?.name || 'Projet');
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    doc.setProperties({ title: `${title} — Catalogue des intérieurs`, subject: 'Catalogue d’images', creator: 'ArchiCam Studio' });

    const coverJpeg = jpeg(images[0].img, 2600, Math.round(2600 * PH / PW));
    drawCatalogCover(doc, data, coverJpeg, images[0].view, images.length, { cabinet });

    // Une planche par image.
    images.forEach(({ view, img }, n) => {
      doc.addPage('a4', 'landscape');
      doc.setFillColor(C.paper).rect(0, 0, PW, PH, 'F');
      const iw = PW - 20, ih = PH - 40;
      doc.addImage(jpeg(img, 2400, Math.round(2400 * ih / iw)), 'JPEG', 10, 10, iw, ih);
      text(doc, String(n + 1).padStart(2, '0'), 10, PH - 17, 18, { serif: true, bold: true, color: C.gold });
      text(doc, roomName(view.label), 26, PH - 19.5, 13, { serif: true, bold: true, maxWidth: 150 });
      if (view.notes) paragraph(doc, view.notes, 26, PH - 13.5, 170, 7.6, 1.4, C.muted, 2);
      text(doc, `${title} · ${view.kind || 'Vue'}`, PW - 10, PH - 19.5, 7.4, { color: C.muted, align: 'right' });
      text(doc, `${n + 2} / ${images.length + 2}`, PW - 10, PH - 13.5, 7.4, { bold: true, align: 'right' });
    });

    // Planche-contact.
    doc.addPage('a4', 'landscape');
    doc.setFillColor(C.paper).rect(0, 0, PW, PH, 'F');
    text(doc, 'Sommaire des vues', 12, 22, 18, { serif: true, bold: true });
    const cols = 4, gap = 5, cw = (PW - 24 - gap * (cols - 1)) / cols, ch = cw * 9 / 16;
    images.slice(0, 16).forEach(({ view, img }, n) => {
      const cx = 12 + (n % cols) * (cw + gap), cy = 32 + Math.floor(n / cols) * (ch + 13);
      doc.addImage(jpeg(img, 640, 360, { quality: 0.82 }), 'JPEG', cx, cy, cw, ch);
      text(doc, `${String(n + 1).padStart(2, '0')}  ${roomName(view.label)}`, cx, cy + ch + 5, 7.4, { bold: true, maxWidth: cw });
    });
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    doc.save(`${slug}-catalogue-interieurs.pdf`);
    const missing = ID ? ID.missingFields(data, { cabinet }) : { missing: [], message: '' };
    return { images: images.length, excluded: excluded.map(e => ({ label: e.view.label, reason: e.reason })), lowRes, missingFields: missing };
  }

  function sideNote(doc, x, y, w, heading, body, rows) {
    text(doc, heading, x, y + 6, 14, { serif: true, bold: true, maxWidth: w });
    let row = paragraph(doc, body, x, y + 14, w, 8.6, 1.5, C.muted) + 6;
    doc.setDrawColor(C.rule).setLineWidth(0.2);
    rows.forEach(([label, value]) => {
      text(doc, label, x, row, 7.6, { maxWidth: w - 30 });
      text(doc, value, x + w, row, 7.6, { bold: true, align: 'right' });
      doc.line(x, row + 2, x + w, row + 2);
      row += 6.4;
    });
  }

  /**
   * Couverture du Catalogue des intérieurs (A4 paysage) : vue d'ouverture pleine page,
   * cartel lin façon musée à gauche, cartouche agence commun à droite et mention de source véridique.
   */
  function drawCatalogCover(doc, data, coverJpeg, coverView, plateCount = 1, options = {}) {
    const PW = 297, PH = 210;
    const i = info(data, { code: 'CAT-00', title: 'Catalogue des intérieurs' }, options);
    const WG = woodGrainModule();
    const ID = identityModule();
    const title = i.project;

    doc.setFillColor(C.dark).rect(0, 0, PW, PH, 'F');
    if (coverJpeg) doc.addImage(coverJpeg, 'JPEG', 0, 0, PW, PH);
    veil(doc, 0, 0, PW, 34, C.dark, 0.72, 0, { vertical: true });
    veil(doc, 0, PH - 96, PW, 96, C.dark, 0, 0.72, { vertical: true });
    cropMarks(doc, 8, 8, PW - 16, PH - 16, C.sand, 5, 1.5);
    text(doc, (i.meta?.brand || 'ARCHICAM STUDIO').toUpperCase(), 16, 19, 8.6, { bold: true, color: C.white, space: 1.6 });
    const topRight = ['CATALOGUE DES INTÉRIEURS', i.year].filter(Boolean).join(' · ');
    text(doc, topRight, PW - 16, 19, 6.4, { bold: true, color: C.sand, align: 'right', space: 1.2 });

    // Cartel gauche : papier lin, fil de bois, filet d'or, ombre portée discrète.
    const card = { x: 16, y: PH - 82, w: 134, h: 66 };
    doc.setFillColor('#0f1411'); alpha(doc, 0.35); doc.rect(card.x + 1.6, card.y + 1.8, card.w, card.h, 'F'); alpha(doc, 1);
    doc.setFillColor(C.paper).rect(card.x, card.y, card.w, card.h, 'F');
    if (WG) WG.drawPdf(doc, { x: card.x, y: card.y, w: card.w, h: card.h, color: '#e7dfcf', lineWidth: 0.14, seed: 5, knots: 1, spacing: 5.5 });
    doc.setFillColor(C.gold).rect(card.x, card.y, card.w, 1.1, 'F');
    const cx = card.x + 9;
    const catKicker = ['CATALOGUE DES ESPACES INTÉRIEURS', i.revision && `INDICE ${i.revision}`].filter(Boolean).join(' · ');
    text(doc, catKicker, cx, card.y + 10.5, 6.0, { bold: true, color: C.gold, space: 0.9, maxWidth: card.w - 18 });
    doc.setFont('times', 'bold').setFontSize(24).setTextColor(C.ink);
    const lines = doc.splitTextToSize(title, card.w - 18).slice(0, 2);
    lines.forEach((line, n) => doc.text(line, cx, card.y + 23 + n * 9));
    let cy = card.y + 23 + (lines.length - 1) * 9 + 5.5;
    doc.setDrawColor(C.gold).setLineWidth(0.6).line(cx, cy, cx + 18, cy);
    cy += 6;
    text(doc, data.meta?.subtitle || 'Ambiances de vie, matières et lumière', cx, cy, 8.2, { serif: true, color: C.muted, maxWidth: card.w - 18 });
    text(doc, `${plateCount} PLANCHE${plateCount > 1 ? 'S' : ''}  ·  ÉDITION ARCHITECTURALE`, cx, card.y + card.h - 7, 5.5, { bold: true, color: C.ink, space: 0.7 });

    // Cartouche agence commun resserré à droite + légende véridique calée juste au-dessus.
    const cartW = 121, cartH = 42, cartX = PW - 16 - cartW, cartY = PH - 16 - cartH;
    const drawnCart = ID ? ID.drawCartouche(doc, i.meta, { x: cartX, y: cartY, w: cartW, h: cartH }, {
      theme: 'dark',
      documentLabel: 'Catalogue des intérieurs',
      code: ID.documentCode('catalog', 0),
      useDisplayName: true
    }) : { y: cartY };
    const capH = 12.5, capY = drawnCart.y - capH - 2.5;
    doc.setFillColor(C.dark); alpha(doc, 0.78); doc.rect(cartX, capY, cartW, capH, 'F'); alpha(doc, 1);
    doc.setFillColor(C.gold).rect(cartX, capY, 1.0, capH, 'F');
    text(doc, `FIG. 01  ·  ${roomName(coverView?.label || 'Vue du projet').toUpperCase()}`, cartX + 4, capY + 5.0, 6.0, { bold: true, color: C.white, space: 0.55, maxWidth: cartW - 8 });
    text(doc, viewSourceCaption(coverView, data), cartX + 4, capY + 9.8, 5.8, { color: C.sand, maxWidth: cartW - 8 });
  }

  /**
   * Couverture A3 « prestige » : image d'ouverture pleine page, voile vert nuit en dégradé, fil de bois,
   * titre en grand, chiffres clés, sommaire à points de conduite, emblème du plan en filets d'or,
   * repères de coupe, tranche titrée et cartouche agence commun.
   */
  function cover(doc, data, sheet, hero, sheets, view, coverPlan = null, options = {}) {
    const i = info(data, sheet, options);
    const WG = woodGrainModule();
    const ID = identityModule();
    const panelX = 262, x = 280, w = W - x - 16;
    doc.setFillColor(C.dark).rect(0, 0, W, H, 'F');
    doc.addImage(hero, 'JPEG', 0, 0, W, H);
    // Voile : l'image se fond dans le panneau de droite, et s'assombrit légèrement en pied.
    veil(doc, 150, 0, panelX - 150, H, C.dark, 0, 0.9);
    doc.setFillColor(C.dark); alpha(doc, 0.9); doc.rect(panelX, 0, W - panelX, H, 'F'); alpha(doc, 1);
    veil(doc, 0, H - 70, panelX, 70, C.dark, 0, 0.55, { vertical: true });
    if (WG) WG.drawPdf(doc, { x: panelX, y: 0, w: W - panelX, h: H, color: '#2c382f', lineWidth: 0.2, seed: 11, knots: 2, spacing: 5.4 });
    cropMarks(doc, 10, 10, W - 20, H - 20, C.gold);

    // Tranche : la signature court le long du bord gauche, comme le dos d'un portfolio.
    doc.setFont('helvetica', 'bold').setFontSize(6.2).setTextColor(C.sand);
    const spine = ['ARCHICAM STUDIO', 'CAHIER DE PLANS', i.project.toUpperCase(), i.year].filter(Boolean).join('   ·   ');
    doc.text(spine, 6.2, H - 22, { angle: 90, charSpace: 1.1 });

    // Emblème du plan : le rez-de-chaussée en filets d'or, sur un cartel translucide.
    if (coverPlan) {
      // Le vrai plan du projet (planche de l'architecte), monté comme un petit tirage : feuille blanche,
      // ombre, filet d'or, légende. C'est la pièce maîtresse que le client reconnaît.
      const tile = { x: 18, y: 18, w: 92, h: 92 * coverPlan.ratio };
      if (tile.h > 112) { tile.h = 112; tile.w = 112 / coverPlan.ratio; }
      doc.setFillColor('#0b0f0c'); alpha(doc, 0.45); doc.rect(tile.x + 1.8, tile.y + 2.2, tile.w + 8, tile.h + 8, 'F'); alpha(doc, 1);
      doc.setFillColor(C.white).rect(tile.x, tile.y, tile.w + 8, tile.h + 8, 'F');
      doc.addImage(coverPlan.image, 'JPEG', tile.x + 4, tile.y + 4, tile.w, tile.h);
      doc.setDrawColor(C.gold).setLineWidth(0.4).rect(tile.x, tile.y, tile.w + 8, tile.h + 8);
      cropMarks(doc, tile.x, tile.y, tile.w + 8, tile.h + 8, C.gold, 4, 1.4);
      doc.setFillColor(C.dark); alpha(doc, 0.82); doc.rect(tile.x, tile.y + tile.h + 11, tile.w + 8, 9, 'F'); alpha(doc, 1);
      text(doc, `${coverPlan.title.toUpperCase()}  ·  ${coverPlan.source.toUpperCase()}`, tile.x + 3, tile.y + tile.h + 16.8, 5, { bold: true, color: C.sand, space: 0.5, maxWidth: tile.w + 2 });
    } else {
      // À défaut de planche, le trait de la maquette en filets d'or.
      const emblem = { x: 22, y: 22, w: 58, h: 58 };
      doc.setFillColor(C.dark); alpha(doc, 0.86); doc.rect(emblem.x - 6, emblem.y - 6, emblem.w + 12, emblem.h + 20, 'F'); alpha(doc, 1);
      doc.setDrawColor(C.gold).setLineWidth(0.25).rect(emblem.x - 6, emblem.y - 6, emblem.w + 12, emblem.h + 20);
      if (planEmblem(doc, data, 0, emblem, C.sand, { wall: 0.7, partition: 0.35, roomColor: '#7d8a76' })) {
        northArrow(doc, emblem.x + emblem.w - 2, emblem.y + 2, 3.2, C.gold, Number(data.config?.northDegrees) || 0);
        text(doc, 'PLAN DU REZ-DE-CHAUSSÉE · TRAIT DE LA MAQUETTE', emblem.x, emblem.y + emblem.h + 9, 4.6, { bold: true, color: C.sand, space: 0.5 });
      }
    }
    // Légende de l'image d'ouverture.
    text(doc, `FIG. 01  ·  ${(view?.label || 'Axonométrie de la maquette').toUpperCase()}`, 22, H - 18, 6.2, { bold: true, color: C.white, space: 0.6, maxWidth: 200 });
    text(doc, viewSourceCaption(view, data, { fallbackKind: 'render3d' }), 22, H - 13.5, 5.6, { color: C.sand });

    // En-tête du panneau.
    text(doc, (i.meta?.brand || 'ARCHICAM STUDIO').toUpperCase(), x, 24, 9.5, { bold: true, color: C.gold, space: 1.6 });
    text(doc, 'CAHIER DE PLANS', x + w, 24, 6.8, { bold: true, color: C.sand, align: 'right', space: 1.2 });
    doc.setDrawColor(C.sand).setLineWidth(0.3).line(x, 28.5, x + w, 28.5);
    const coverKicker = [i.phase, i.revision && `indice ${i.revision}`].filter(Boolean).join(' · ') || 'Cahier de plans';
    kicker(doc, coverKicker, x, 50, C.sand);

    // Titre : grand, serif, sur deux ou trois lignes.
    doc.setFont('times', 'bold').setFontSize(44).setTextColor(C.white);
    const titleLines = doc.splitTextToSize(i.project, w).slice(0, 3);
    titleLines.forEach((line, n) => doc.text(line, x, 70 + n * 15.5));
    let y = 70 + (titleLines.length - 1) * 15.5 + 8;
    doc.setDrawColor(C.gold).setLineWidth(0.8).line(x, y, x + 26, y);
    y += 8;
    if (data.meta?.subtitle) y = paragraph(doc, data.meta.subtitle, x, y, w, 9.5, 1.45, '#d5dbd1', 3) + 3;

    // Chiffres clés : grands numéros, filets d'or entre les colonnes.
    const habitable = Number.isFinite(data.totals?.habitable)
      ? data.totals.habitable
      : (data.rooms || []).filter(r => r.habitable !== false).reduce((s, r) => s + roomArea(r), 0);
    const levels = new Set((data.walls || []).map(wall => Number(wall.level) || 0)).size || 1;
    const facts = [[`${fr.format(habitable)}`, 'm² habitables'], [String((data.rooms || []).filter(r => r.habitable !== false).length), 'pièces de vie'], [levels === 1 ? 'Plain-pied' : `R+${levels - 1}`, 'niveaux']];
    const factW = w / 3;
    facts.forEach(([value, label], n) => {
      const fx = x + n * factW;
      if (n) doc.setDrawColor('#55624f').setLineWidth(0.2).line(fx - 3, y + 4, fx - 3, y + 20);
      text(doc, value, fx, y + 13, 19, { serif: true, bold: true, color: C.white, maxWidth: factW - 5 });
      text(doc, label.toUpperCase(), fx, y + 19.5, 5.6, { bold: true, color: C.gold, space: 0.7 });
    });

    // Cartouche commun resserré en bas de panneau, puis sommaire à points de conduite au-dessus.
    const boxH = 42, topBox = H - 16 - boxH;
    const drawnCart = ID ? ID.drawCartouche(doc, i.meta, { x: x - 4, y: topBox, w: w + 8, h: boxH }, {
      theme: 'dark',
      documentLabel: sheet.title || 'Cahier de plans',
      code: sheet.code || ID.documentCode('book', 0),
      useDisplayName: true
    }) : { y: topBox };

    let row = y + 32;
    kicker(doc, 'Sommaire', x, row, C.sand);
    row += 6.5;
    const maxRows = Math.max(3, Math.floor((drawnCart.y - 8 - row) / 4.8));
    sheets.slice(1, 1 + maxRows).forEach(s => {
      text(doc, s.code, x, row, 6.8, { bold: true, color: C.gold });
      const label = s.title.length > 44 ? s.title.slice(0, 43) + '…' : s.title;
      text(doc, label, x + 14, row, 6.8, { color: '#e7ebe3' });
      const labelEnd = x + 14 + doc.getTextWidth(label) + 2;
      const tag = s.section.split(' · ')[0].toUpperCase();
      doc.setFont('helvetica', 'normal').setFontSize(4.8);
      const tagW = Math.min(44, textWidth(doc, tag, 0.3));
      const dotEnd = x + w - tagW - 2.5;
      if (dotEnd > labelEnd + 3) {
        doc.setDrawColor('#5d6a5f').setLineDashPattern([0.3, 1.2], 0).setLineWidth(0.25).line(labelEnd, row - 0.6, dotEnd, row - 0.6).setLineDashPattern([], 0);
      }
      text(doc, tag, x + w, row, 4.8, { color: C.sand, align: 'right', space: 0.3, maxWidth: 44 });
      row += 4.8;
    });
    if (sheets.length > 1 + maxRows) text(doc, `… et ${sheets.length - 1 - maxRows} autres planches`, x + 14, row, 6.4, { color: C.sand });
  }

  async function viewsSheet(doc, data, sheet, views, studio) {
    sheetFrame(doc, data, sheet);
    let shots = [];
    if (views.length) {
      for (const view of views.slice(0, 4)) {
        try { shots.push({ label: view.label, kind: view.kind, image: await loadImage(view.source) }); } catch { /* vue illisible ignorée */ }
      }
    }
    if (!shots.length) {
      const authored = (data.renderShots || []).filter(s => !s.night).slice(0, 4);
      shots = authored.map(shot => ({ label: shot.label || 'Vue', kind: 'Capture de la maquette', capture: shot }));
    }
    const gap = 6, cols = shots.length > 1 ? 2 : 1, rowsCount = Math.ceil(shots.length / cols) || 1;
    const cw = (content.w - gap * (cols - 1)) / cols, ch = (content.h - gap * (rowsCount - 1)) / rowsCount - 7;
    shots.forEach((shot, n) => {
      const x = content.x + (n % cols) * (cw + gap), y = content.y + Math.floor(n / cols) * (ch + 7 + gap);
      const px = 1800, py = Math.round(px * ch / cw);
      const dataUrl = shot.image ? jpeg(shot.image, px, py) : studio.capture(shot.capture, px, py, 1, { clean: true });
      doc.addImage(dataUrl, 'JPEG', x, y, cw, ch);
      text(doc, `${String(n + 1).padStart(2, '0')}  ${roomName(shot.label)}`, x, y + ch + 5, 8.4, { bold: true, maxWidth: cw - 40 });
      text(doc, shot.kind || '', x + cw, y + ch + 5, 7, { color: C.muted, align: 'right' });
    });
    if (!shots.length) text(doc, 'Aucune vue disponible : générez des rendus depuis la galerie de la visite.', content.x, content.y + 10, 10, { color: C.muted });
  }

  function specification(doc, data, sheet) {
    sheetFrame(doc, data, sheet);
    const cols = [['Pièce', 0], ['Niveau', 78], ['Surface', 108], ['Revêtement de sol', 134], ['Description', 184]];
    const x = content.x, w = content.w;
    let y = content.y + 4;
    cols.forEach(([label, dx]) => kicker(doc, label, x + dx, y));
    doc.setDrawColor(C.ink).setLineWidth(0.4).line(x, y + 2.5, x + w, y + 2.5);
    y += 8.5;
    const rooms = data.rooms.slice().sort((a, b) => (a.level - b.level) || Number(b.habitable) - Number(a.habitable) || (b.area || 0) - (a.area || 0));
    const rowH = Math.min(9.5, (content.h - 66) / Math.max(1, rooms.length));
    rooms.forEach(room => {
      text(doc, roomName(room.name), x, y, 8.2, { bold: room.habitable, maxWidth: 74 });
      text(doc, room.level ? `Étage ${room.level}` : 'RDC', x + 78, y, 8, { color: C.muted });
      text(doc, `${fr.format(room.area || 0)} m²`, x + 108, y, 8);
      text(doc, FLOORS[room.floorType] || room.floorType || '—', x + 134, y, 8, { maxWidth: 46 });
      text(doc, room.desc || '—', x + 184, y, 7.6, { color: C.muted, maxWidth: w - 186 });
      doc.setDrawColor(C.rule).setLineWidth(0.15).line(x, y + rowH / 2, x + w, y + rowH / 2);
      y += rowH;
    });
    // Enveloppe.
    const walls = data.walls, openings = walls.flatMap(wall => wall.openings || []);
    const count = type => openings.filter(op => op.type === type).length;
    const ext = walls.filter(wall => wall.type === 'ext');
    const bottom = content.y + content.h - 40;
    doc.setDrawColor(C.ink).setLineWidth(0.4).line(x, bottom - 6, x + w, bottom - 6);
    kicker(doc, 'Enveloppe et ouvertures', x, bottom);
    const items = [
      ['Murs extérieurs', `${fr.format(ext.reduce((s, wall) => s + (wall.length || 0), 0))} m linéaires · ép. ${fr2.format(ext[0]?.thick || 0.25)} m`],
      ['Cloisons', `${fr.format(walls.filter(wall => wall.type !== 'ext').reduce((s, wall) => s + (wall.length || 0), 0))} m linéaires`],
      ['Hauteur sous plafond', `${fr2.format(data.config.wallHeight)} m`],
      ['Menuiseries', `${count('door')} portes · ${count('window')} fenêtres${count('bay') ? ` · ${count('bay')} baies vitrées` : ''}`]
    ];
    items.forEach(([label, value], n) => {
      const ix = x + (n % 2) * (w / 2), iy = bottom + 8 + Math.floor(n / 2) * 9;
      text(doc, label, ix, iy, 8.2, { color: C.muted });
      text(doc, value, ix + 52, iy, 8.4, { bold: true, maxWidth: w / 2 - 56 });
    });
    text(doc, 'Notice indicative établie depuis la maquette ; à compléter par le descriptif technique par lots.', x, content.y + content.h, 7, { color: C.muted });
  }

  function estimateSheet(doc, data, sheet, e) {
    sheetFrame(doc, data, sheet);
    const fmt = CostEstimate.formatXAF, x = content.x, w = 250;
    const s = e.settings;
    paragraph(doc, `Méthode : surface de référence (${fr.format(e.reference)} m², annexes à ${Math.round(s.annexWeight * 100)} %) × ${fmt(e.rate.low)} à ${fmt(e.rate.high)}/m². Référence : ${e.rate.label}.`, x, content.y + 4, w, 9, 1.5, C.muted);
    let y = content.y + 24;
    kicker(doc, 'Poste', x, y);
    text(doc, 'BAS', x + w - 60, y, 7.5, { bold: true, color: C.muted, align: 'right', space: 0.9 });
    text(doc, 'HAUT', x + w, y, 7.5, { bold: true, color: C.muted, align: 'right', space: 0.9 });
    doc.setDrawColor(C.ink).setLineWidth(0.4).line(x, y + 2.5, x + w, y + 2.5);
    y += 9;
    const line = (label, low, high, size = 9) => {
      text(doc, label, x, y, size, { maxWidth: w - 125 });
      text(doc, fmt(low), x + w - 60, y, size, { align: 'right' });
      text(doc, fmt(high), x + w, y, size, { align: 'right' });
      doc.setDrawColor(C.rule).setLineWidth(0.15).line(x, y + 3.2, x + w, y + 3.2);
      y += 8.6;
    };
    const total = (label, low, high) => {
      doc.setDrawColor(C.ink).setLineWidth(0.6).line(x, y - 3.6, x + w, y - 3.6);
      text(doc, label, x, y + 2.5, 10.5, { bold: true });
      text(doc, fmt(low), x + w - 60, y + 2.5, 10.5, { bold: true, align: 'right' });
      text(doc, fmt(high), x + w, y + 2.5, 10.5, { bold: true, align: 'right' });
      y += 14;
    };
    e.lots.forEach(lot => line(lot.label, lot.low, lot.high));
    total('Enveloppe travaux', e.total.low, e.total.high);
    if (e.overall) {
      e.annexes.forEach(a => line(a.label, a.low, a.high, 8.6));
      total('Budget global du projet', e.overall.low, e.overall.high);
    }
    paragraph(doc, `${e.excluded} Estimation indicative (${CostEstimate.SOURCES.map(src => src.label).join(' ; ')}). Ce document n’est ni un devis ni un engagement de prix.`, x, y, w, 7.6, 1.5, C.muted, 5);
    const side = x + w + 20, sw = content.w - w - 20;
    const q = e.quantities;
    const block = (title, rows, top) => {
      kicker(doc, title, side, top);
      rows.forEach(([label, value], n) => {
        const ry = top + 9 + n * 7.4;
        text(doc, label, side, ry, 8, { maxWidth: sw - 40 });
        text(doc, value, side + sw, ry, 8, { bold: true, align: 'right' });
        doc.setDrawColor(C.rule).setLineWidth(0.15).line(side, ry + 2.4, side + sw, ry + 2.4);
      });
      return top + 9 + rows.length * 7.4 + 8;
    };
    const next = block('Métré issu du plan', [
      ['Surface habitable', `${fr.format(q.habitable)} m²`], ['Annexes', `${fr.format(q.annexes)} m²`],
      ['Murs extérieurs / cloisons', `${fr.format(q.extLength)} / ${fr.format(q.intLength)} m`],
      ['Maçonnerie nette', `${fr.format(q.wall20 + q.wall15)} m²`], ['Portes · fenêtres et baies', `${q.doors} · ${q.windows + q.bays}`]
    ], content.y + 4);
    block('Bordereau d’achats (chutes comprises)', e.materials.map(m => [m.label, `${fr.format(m.quantity)} ${m.unit === 'u' ? 'u' : m.unit} · ${fmt(m.cost)}`]), next);
  }

  return { exportBook, exportCatalog, readSheets, printedScale, exportSynthesisBoard, drawSynthesisBoard, publishedViews, SECTIONS, axonometric, planScale, levelBounds, info, cover, drawCatalogCover };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanBook;
}
