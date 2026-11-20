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
  function text(doc, value, x, y, size = 9, { bold = false, serif = false, color = C.ink, align, maxWidth, space = 0 } = {}) {
    let label = clean(value);
    doc.setFont(serif ? 'times' : 'helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color).setCharSpace(space);
    if (maxWidth && doc.getTextWidth(label) > maxWidth) {
      while (label.length > 1 && doc.getTextWidth(`${label}…`) > maxWidth) label = label.slice(0, -1);
      label += '…';
    }
    doc.text(label, x, y, { align });
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
  function info(data, sheet) {
    const meta = data.meta || {};
    return {
      project: nameForDisplay(meta.name || 'Projet'), client: meta.client || '—', architect: meta.architect || '—', location: meta.location || '—',
      phase: PHASES[meta.phase] || meta.phase || 'Présentation', revision: meta.revision || 'A',
      date: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()),
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
      [36, 'Phase', i.phase], [28, 'Échelle', sheet.scale || '—'], [26, 'Date', i.date], [16, 'Indice', i.revision]
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
        text(doc, value, x + 3, y + 12.2, 8.4, { bold: index === 2, maxWidth: w - 5 });
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

  async function publishedViews(data, options = {}) {
    const slug = window.ACTIVE_PROJECT_SLUG || data.meta?.slug;
    if (!slug || typeof ViewOrder === 'undefined') return [];
    try {
      const response = await fetch(`api/gallery/media?project=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      if (!response.ok) return [];
      return ViewOrder.views(await response.json(), slug, Infinity, options).filter(view => view.published && view.category !== 'plan');
    } catch { return []; }
  }

  async function annexPages(files, onStatus) {
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
          pages.push({ name: file.name, page: n, total: pdf.numPages, width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/jpeg', 0.86) });
        }
      } finally { pdf.destroy(); }
      if (pages.length >= MAX_ANNEX_PAGES) break;
    }
    return pages;
  }

  /** Planches proposées dans la fenêtre de composition, dans l’ordre du cahier. */
  const SECTIONS = [
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
   * Les images d’ambiance sont celles ajoutées au cahier ; sans sélection, les quatre premières dans l’ordre de présentation.
   */
  async function exportBook({ data, studio, files = null, sections = {}, includeEstimate, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    const hs = studio.hs;
    const on = id => (id === 'estimate' && includeEstimate !== undefined ? includeEstimate : sections[id] ?? !SECTIONS.find(s => s.id === id)?.off);
    const annexes = await annexPages(files, onStatus);
    onStatus('Prises de vue de la maquette…');
    const allViews = await publishedViews(data);
    const chosen = allViews.filter(view => view.book);
    const views = chosen.length ? chosen : allViews;
    const levels = [...new Set(data.walls.map(w => Number(w.level) || 0))].sort((a, b) => a - b).filter(level => levelBounds(data, level).valid);
    const levelName = level => level === 0 ? 'Rez-de-chaussée' : `Étage ${level}`;
    const estimate = on('estimate') && typeof CostEstimate !== 'undefined' ? CostEstimate.estimate(data, data.estimate) : null;

    // Sommaire établi d’avance : les numéros de planche figurent dans les cartouches.
    const sheets = [{ id: 'cover', title: 'Couverture', section: 'Présentation' },
      ...(on('axo') ? [{ id: 'axo', title: 'Axonométrie', section: 'Volumétrie' }] : []),
      ...(on('cut') ? [{ id: 'cut', title: 'Écorché — vue en coupe', section: 'Volumétrie' }] : []),
      ...(on('plans') ? levels.map(level => ({ id: 'plan', level, title: `Plan — ${levelName(level)}`, section: 'Plans' })) : []),
      ...(on('views') ? [{ id: 'views', title: views.length ? 'Ambiances' : 'Vues de la maquette', section: 'Images' }] : []),
      ...(on('spec') ? [{ id: 'spec', title: 'Descriptif sommaire', section: 'Notice' }] : []),
      ...(estimate ? [{ id: 'estimate', title: 'Estimation indicative', section: 'Économie' }] : []),
      ...annexes.map(page => ({ id: 'annex', annex: page, title: page.total > 1 ? `${page.name} — p. ${page.page}/${page.total}` : page.name, section: 'Annexe architecte' }))];
    sheets.forEach((sheet, i) => { sheet.code = i ? `PL-${String(i).padStart(2, '0')}` : 'PL-00'; });
    const planBox = { x: content.x, y: content.y, w: content.w - 92, h: content.h };
    sheets.filter(s => s.id === 'plan').forEach(s => { s.denominator = planScale(levelBounds(data, s.level), planBox); s.scale = `1:${s.denominator}`; });

    const doc = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape', compress: true });
    const title = nameForDisplay(data.meta?.name || 'Projet');
    doc.setProperties({ title: `${title} — Cahier de plans`, subject: 'Cahier de plans et présentation du projet', creator: 'Plan / 3D' });

    // Couverture : la meilleure vue publiée (façade d’abord), sinon l’axonométrie de la maquette.
    const heroW = 2000, heroH = Math.round(heroW * H / 270);
    const heroSource = views[0]?.source;
    const hero = heroSource ? jpeg(await loadImage(heroSource), heroW, heroH) : render(hs, axonometric(data, hs), heroW, heroH);

    for (const [index, sheet] of sheets.entries()) {
      if (index) doc.addPage('a3', 'landscape');
      onStatus(`Composition — ${sheet.code} ${sheet.title}…`);
      if (sheet.id === 'cover') cover(doc, data, sheet, hero, sheets, views[0]);
      else if (sheet.id === 'axo') {
        sheetFrame(doc, data, sheet);
        const w = content.w - 96, h = content.h;
        doc.addImage(render(hs, axonometric(data, hs), 2400, Math.round(2400 * h / w)), 'JPEG', content.x, content.y, w, h);
        sideNote(doc, content.x + w + 8, content.y, 88, 'Volumétrie d’ensemble',
          'Vue axonométrique générée depuis la maquette 3D du projet : volumes, toiture, ouvertures et abords à l’échelle relative exacte du plan.',
          [['Hauteur sous plafond', `${fr2.format(data.config.wallHeight)} m`], ['Niveaux', levels.length === 1 ? 'Plain-pied' : `R+${levels.length - 1}`],
            ['Emprise', `${fr.format(HouseAuto.bbox(data).w)} × ${fr.format(HouseAuto.bbox(data).d)} m`]]);
      } else if (sheet.id === 'cut') {
        sheetFrame(doc, data, sheet);
        const w = content.w - 96, h = content.h;
        doc.addImage(render(hs, axonometric(data, hs, -Math.PI / 2), 2400, Math.round(2400 * h / w), { section: true }), 'JPEG', content.x, content.y, w, h);
        sideNote(doc, content.x + w + 8, content.y, 88, 'La maison ouverte',
          `Coupe horizontale à ${fr2.format(sceneHeight(data, hs) * 0.5)} m du sol : l’organisation des pièces, les circulations et l’ameublement se lisent d’un seul regard.`,
          data.rooms.filter(r => r.habitable).slice(0, 8).map(r => [roomName(r.name), `${fr.format(r.area || 0)} m²`]));
      } else if (sheet.id === 'plan') {
        sheetFrame(doc, data, sheet);
        drawPlan(doc, data, sheet.level, planBox, sheet.denominator);
        roomTable(doc, data.rooms.filter(r => (Number(r.level) || 0) === sheet.level), planBox.x + planBox.w + 12, content.y + 2, 80);
      } else if (sheet.id === 'views') await viewsSheet(doc, data, sheet, views, studio);
      else if (sheet.id === 'spec') specification(doc, data, sheet);
      else if (sheet.id === 'estimate') estimateSheet(doc, data, sheet, estimate);
      else if (sheet.id === 'annex') {
        sheetFrame(doc, data, sheet);
        const page = sheet.annex, ratio = Math.min(content.w / page.width, content.h / page.height);
        const w = page.width * ratio, h = page.height * ratio;
        doc.setFillColor(C.white).rect(content.x + (content.w - w) / 2, content.y + (content.h - h) / 2, w, h, 'F');
        doc.addImage(page.data, 'JPEG', content.x + (content.w - w) / 2, content.y + (content.h - h) / 2, w, h);
      }
    }
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    doc.save(`${slug}-cahier-de-plans.pdf`);
    return { pages: sheets.length, annexes: annexes.length };
  }

  /**
   * Catalogue des intérieurs : les rendus ajoutés au catalogue, une image pleine page chacun (A4 paysage),
   * avec couverture et planche-contact finale. Ouvert aux clients : aucune donnée de chiffrage.
   */
  async function exportCatalog({ data, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    onStatus('Lecture du catalogue…');
    const items = (await publishedViews(data, { keepDuplicates: true })).filter(view => view.catalog);
    if (!items.length) throw new Error('Le catalogue est vide : ajoutez-y des rendus depuis la galerie.');
    const images = [];
    for (const [n, view] of items.entries()) {
      onStatus(`Préparation de l’image ${n + 1}/${items.length}…`);
      try { images.push({ view, img: await loadImage(view.source) }); } catch { /* image manquante ignorée */ }
    }
    if (!images.length) throw new Error('Les images du catalogue sont illisibles.');
    const PW = 297, PH = 210, title = nameForDisplay(data.meta?.name || 'Projet');
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    doc.setProperties({ title: `${title} — Catalogue des intérieurs`, subject: 'Catalogue d’images', creator: 'Plan / 3D' });

    // Couverture.
    doc.setFillColor(C.dark).rect(0, 0, PW, PH, 'F');
    doc.addImage(jpeg(images[0].img, 2000, Math.round(2000 * PH / 190)), 'JPEG', 0, 0, 190, PH);
    const x = 202, w = PW - x - 12;
    text(doc, 'PLAN / 3D', x, 18, 9, { bold: true, color: C.white, space: 0.6 });
    doc.setDrawColor(C.sand).setLineWidth(0.3).line(x, 23, x + w, 23);
    kicker(doc, 'Catalogue', x, 62, C.sand);
    doc.setFont('times', 'bold').setFontSize(26).setTextColor(C.white);
    doc.splitTextToSize('Les intérieurs', w).forEach((line, n) => doc.text(line, x, 76 + n * 10));
    text(doc, title, x, 92, 12, { serif: true, color: '#e7ebe3', maxWidth: w });
    text(doc, `${images.length} vue${images.length > 1 ? 's' : ''} photoréaliste${images.length > 1 ? 's' : ''}`, x, 101, 8.4, { color: C.sand });
    paragraph(doc, 'Images de présentation générées depuis la maquette du projet. Rendus d’ambiance non contractuels : matériaux, mobilier et lumière sont indicatifs.', x, PH - 34, w, 7.4, 1.5, '#b9c2b6');

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
    return { images: images.length };
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

  function cover(doc, data, sheet, hero, sheets, view) {
    const i = info(data, sheet), split = 270;
    doc.setFillColor(C.dark).rect(0, 0, W, H, 'F');
    doc.addImage(hero, 'JPEG', 0, 0, split, H);
    // Légende de l’image d’ouverture.
    doc.setFillColor(C.dark).rect(M, H - M - 12, 74, 8, 'F');
    text(doc, `FIG. 01 · ${(view?.label || 'Axonométrie de la maquette').toUpperCase()}`, M + 3, H - M - 6.7, 6.4, { bold: true, color: C.white, space: 0.5, maxWidth: 68 });

    const x = split + 14, w = W - split - 28;
    text(doc, 'PLAN / 3D', x, M + 10, 10, { bold: true, color: C.white, space: 0.6 });
    text(doc, 'CAHIER DE PLANS', x + w, M + 10, 7, { bold: true, color: C.sand, align: 'right', space: 1.1 });
    doc.setDrawColor(C.sand).setLineWidth(0.3).line(x, M + 15, x + w, M + 15);
    kicker(doc, 'Présentation du projet', x, 62, C.sand);
    doc.setFont('times', 'bold').setFontSize(36).setTextColor(C.white);
    const titleLines = doc.splitTextToSize(i.project, w).slice(0, 3);
    titleLines.forEach((line, n) => doc.text(line, x, 78 + n * 13.5));
    let y = 78 + titleLines.length * 13.5;
    if (data.meta?.subtitle) y = paragraph(doc, data.meta.subtitle, x, y, w, 9.5, 1.45, '#cfd6cc', 3) + 2;

    const habitable = data.totals?.habitable || data.rooms.filter(r => r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const levels = new Set(data.walls.map(wall => Number(wall.level) || 0)).size;
    const facts = [[`${fr.format(habitable)} m²`, 'habitables'], [String(data.rooms.filter(r => r.habitable).length), 'pièces de vie'], [levels === 1 ? 'Plain-pied' : `R+${levels - 1}`, 'niveaux']];
    const factW = w / 3;
    facts.forEach(([value, label], n) => {
      text(doc, value, x + n * factW, y + 14, 13, { bold: true, color: C.white, maxWidth: factW - 3 });
      text(doc, label.toUpperCase(), x + n * factW, y + 19.5, 5.8, { color: C.sand, space: 0.6 });
    });

    // Sommaire.
    let row = y + 34;
    kicker(doc, 'Sommaire', x, row, C.sand);
    row += 6;
    sheets.slice(1, 12).forEach(s => {
      text(doc, s.code, x, row, 7.2, { bold: true, color: C.sand });
      text(doc, s.title, x + 15, row, 7.2, { color: '#e7ebe3', maxWidth: w - 15 });
      row += 4.9;
    });
    if (sheets.length > 12) text(doc, `… et ${sheets.length - 12} planches d’annexe`, x + 15, row, 7, { color: C.sand });

    // Cartouche complet.
    const rows = [['Projet', i.project], ['Maître d’ouvrage', i.client], ['Maître d’œuvre', i.architect], ['Lieu', i.location],
      ['Phase', i.phase], ['Date', i.date], ['Indice', i.revision], ['Planche', `${sheet.code} — ${sheet.title}`]];
    const rowH = 7.4, boxH = rows.length * rowH + 10, top = H - M - boxH;
    doc.setFillColor('#253128').rect(x - 4, top, w + 8, boxH, 'F');
    doc.setDrawColor(C.sand).setLineWidth(0.45).rect(x - 4, top, w + 8, boxH);
    text(doc, 'CARTOUCHE', x, top + 6.5, 6.4, { bold: true, color: C.sand, space: 1 });
    rows.forEach(([label, value], n) => {
      const ry = top + 10 + n * rowH;
      doc.setDrawColor('#3d4a3f').setLineWidth(0.2).line(x - 4, ry, x + w + 4, ry);
      text(doc, label.toUpperCase(), x, ry + 4.9, 5.6, { bold: true, color: C.sand, space: 0.5 });
      text(doc, value, x + 34, ry + 4.9, 8, { color: C.white, maxWidth: w - 34, bold: n === 0 });
    });
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
    paragraph(doc, `Méthode : surface de référence (${fr.format(e.reference)} m², annexes à ${Math.round(s.annexWeight * 100)} %) × ${fmt(e.perM2)}/m² — ${CostEstimate.STANDINGS[s.standing].label}, ${CostEstimate.CITIES[s.city].label}. Fourchette de −${Math.round(s.rangeLow * 100)} % à +${Math.round(s.rangeHigh * 100)} %.`, x, content.y + 4, w, 9, 1.5, C.muted);
    let y = content.y + 22;
    kicker(doc, 'Poste', x, y);
    text(doc, 'BAS', x + w - 60, y, 7.5, { bold: true, color: C.muted, align: 'right', space: 0.9 });
    text(doc, 'HAUT', x + w, y, 7.5, { bold: true, color: C.muted, align: 'right', space: 0.9 });
    doc.setDrawColor(C.ink).setLineWidth(0.4).line(x, y + 2.5, x + w, y + 2.5);
    y += 10;
    e.lots.forEach(lot => {
      text(doc, lot.label, x, y, 9.2, { maxWidth: w - 120 });
      text(doc, fmt(lot.low), x + w - 60, y, 9.2, { align: 'right' });
      text(doc, fmt(lot.high), x + w, y, 9.2, { align: 'right' });
      doc.setDrawColor(C.rule).setLineWidth(0.15).line(x, y + 3.5, x + w, y + 3.5);
      y += 10;
    });
    doc.setDrawColor(C.ink).setLineWidth(0.6).line(x, y - 4, x + w, y - 4);
    text(doc, 'Enveloppe travaux', x, y + 3, 11, { bold: true });
    text(doc, fmt(e.total.low), x + w - 60, y + 3, 11, { bold: true, align: 'right' });
    text(doc, fmt(e.total.high), x + w, y + 3, 11, { bold: true, align: 'right' });
    y += 18;
    paragraph(doc, `${e.excluded} Estimation indicative fondée sur des ratios publics (${CostEstimate.SOURCES.map(src => src.label).join(' ; ')}). Ce document n’est ni un devis ni un engagement de prix.`, x, y, w, 8, 1.5, C.muted);
    const side = x + w + 20, sw = content.w - w - 20;
    kicker(doc, 'Métré issu du plan', side, content.y + 4);
    const q = e.quantities;
    [['Surface habitable', `${fr.format(q.habitable)} m²`], ['Annexes', `${fr.format(q.annexes)} m²`], ['Murs extérieurs', `${fr.format(q.extLength)} m`],
      ['Cloisons', `${fr.format(q.intLength)} m`], ['Maçonnerie nette', `${fr.format(q.wall20 + q.wall15)} m²`], ['Portes', String(q.doors)],
      ['Fenêtres et baies', String(q.windows + q.bays)], ...e.materials.map(m => [m.label, `${fr.format(m.count)} u`])]
      .forEach(([label, value], n) => {
        const ry = content.y + 14 + n * 8;
        text(doc, label, side, ry, 8.4, { maxWidth: sw - 34 });
        text(doc, value, side + sw, ry, 8.4, { bold: true, align: 'right' });
        doc.setDrawColor(C.rule).setLineWidth(0.15).line(side, ry + 2.5, side + sw, ry + 2.5);
      });
  }

  return { exportBook, exportCatalog, publishedViews, SECTIONS, axonometric, planScale, levelBounds };
})();
