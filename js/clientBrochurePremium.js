/**
 * BROCHURE PREMIUM — Catalogue de présentation client en 2 pages
 *
 * - 3 styles : Moderne, Luxe, Industriel (setStyle / getStyle)
 * - Couverture : vue 3D de la façade si un studio 3D est disponible,
 *   sinon le plan du rez-de-chaussée mis en valeur
 * - Statistiques : surface habitable, surface totale, nombre de pièces
 * - Page 2 : plan de masse + vues intérieures (studio 3D) ou programme des espaces
 *
 * Fonctionne dans la visite 3D (avec studio) comme dans l'éditeur (sans studio).
 * Compatible navigateur et Node.js (tests).
 */

const ClientBrochurePremium = (() => {
  'use strict';

  // =====================================================================
  // STYLES
  // =====================================================================

  const STYLES = {
    agence: { label: 'Agence', primary: '#1d2620', secondary: '#202a23', accent: '#b78a3c', paper: '#f4f2eb', light: '#d8c7a0', medium: '#5f6a63', ink: '#1b2320', ruleDark: '#3d4a3f', wood: '#2c382f' },
    luxury: { label: 'Luxe', primary: '#064e3b', secondary: '#065f46', accent: '#d4af37', paper: '#fefdf8', light: '#b9c9bf', medium: '#3f5148', ink: '#0f2920', ruleDark: '#1c6b53', wood: '#0c5c46' },
    industrial: { label: 'Industriel', primary: '#1e293b', secondary: '#334155', accent: '#b87333', paper: '#f8fafc', light: '#a7b0bd', medium: '#475569', ink: '#1e293b', ruleDark: '#3e4e63', wood: '#2a394e' }
  };

  let currentStyle = 'agence';
  let COLORS = { ...STYLES.agence };

  /** Choisit le style du catalogue ; renvoie le style retenu (Agence par défaut). */
  function setStyle(name) {
    currentStyle = Object.prototype.hasOwnProperty.call(STYLES, name) ? name : 'agence';
    COLORS = { ...STYLES[currentStyle] };
    return currentStyle;
  }

  function getStyle() {
    return currentStyle;
  }

  const margin = 20;
  const width = 170;

  // =====================================================================
  // CHARGEMENT JSPDF
  // =====================================================================

  let pendingLibrary;

  function loadJsPDF() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return pendingLibrary ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/jspdf-4.2.1.umd.min.js';
      script.crossOrigin = 'anonymous';
      const timer = setTimeout(fail, 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        pendingLibrary = null;
        reject(new Error('jsPDF indisponible'));
      }
      script.onload = () => {
        clearTimeout(timer);
        if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  }

  // =====================================================================
  // DONNÉES DU PROJET
  // =====================================================================

  function polyArea(poly) {
    let sum = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      sum += x1 * z2 - x2 * z1;
    }
    return Math.abs(sum) / 2;
  }

  function roomBounds(room) {
    if (room.bounds) return room.bounds;
    if (Array.isArray(room.poly) && room.poly.length >= 3) {
      const xs = room.poly.map(p => p[0]), zs = room.poly.map(p => p[1]);
      return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
    }
    return null;
  }

  function roomArea(room) {
    if (Number.isFinite(room.area)) return room.area;
    if (Array.isArray(room.poly) && room.poly.length >= 3) return polyArea(room.poly);
    const b = roomBounds(room);
    return b ? Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin) : 0;
  }

  /** Surfaces et pièces, que le projet vienne de la visite 3D (totals, area) ou de l'éditeur. */
  /** Pièce principale au sens immobilier : séjours et chambres (ni cuisine, ni pièce d'eau, ni circulation, ni annexe). */
  const NOT_MAIN = /cuisine|kitchen|salle d.?eau|salle de bains?|bains?|douche|\bwc\b|toilette|palier|escalier|degagement|hall|couloir|circulation|entree|dressing|placard|cellier|magasin|buanderie|rangement|garage|veranda|terrasse|porche/;
  function isMainRoom(room) {
    const name = String(room.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return room.habitable !== false && !NOT_MAIN.test(name);
  }

  function summary(data) {
    const rooms = (data.rooms || []).map(room => ({ ...room, area: roomArea(room), level: room.level || 0 }));
    const habitable = Number.isFinite(data.totals?.habitable)
      ? data.totals.habitable
      : rooms.filter(r => r.habitable !== false).reduce((sum, r) => sum + r.area, 0);
    const total = rooms.reduce((sum, r) => sum + r.area, 0);
    const mainRooms = rooms.filter(isMainRoom).length;
    return { rooms, habitable, total, habitableCount: rooms.filter(r => r.habitable !== false).length, mainRooms };
  }

  function bbox(data, level = 0) {
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
    for (const wall of data.walls || []) {
      if ((wall.level || 0) !== level) continue;
      add(wall.from[0], wall.from[1]);
      add(wall.to[0], wall.to[1]);
    }
    for (const room of data.rooms || []) {
      const b = (room.level || 0) === level ? roomBounds(room) : null;
      if (b) { add(b.xMin, b.zMin); add(b.xMax, b.zMax); }
    }
    if (!Number.isFinite(xMin)) return null;
    return { xMin, xMax, zMin, zMax };
  }

  // =====================================================================
  // UTILITAIRES DE DESSIN
  // =====================================================================

  /** Les polices standard de jsPDF (WinAnsi) n'ont ni espaces fines, ni ≈, ni emojis. */
  function pdfSafe(value) {
    return String(value ?? '')
      .replace(/[   ]/g, ' ')
      .replace(/≈/g, 'env.')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, '')
      .trim();
  }

  function hexToRgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }

  function withOpacity(doc, opacity, draw) {
    const supported = typeof doc.setGState === 'function' && typeof doc.GState === 'function';
    if (supported) doc.setGState(new doc.GState({ opacity }));
    try { draw(); } finally { if (supported) doc.setGState(new doc.GState({ opacity: 1 })); }
  }

  function drawGradient(doc, x, y, w, h, color1, color2, steps = 20) {
    const [r1, g1, b1] = hexToRgb(color1);
    const [r2, g2, b2] = hexToRgb(color2);
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      doc.setFillColor(Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t));
      doc.rect(x, y + i * stepH, w, stepH + 0.1, 'F');
    }
  }

  function drawShadow(doc, x, y, w, h, blur = 3) {
    for (let i = 0; i < blur; i++) {
      const offset = i * 0.5;
      withOpacity(doc, 0.15 * (1 - i / blur), () => {
        doc.setFillColor('#000000');
        doc.roundedRect(x + offset, y + offset, w, h, 1, 1, 'F');
      });
    }
  }

  function premiumText(doc, value, x, y, size, options = {}) {
    const { bold = false, serif = false, color = COLORS.primary, maxWidth, align = 'left', space = 0 } = options;
    let label = pdfSafe(value);
    doc.setFont(serif ? 'times' : 'helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(space);
    const widthOf = str => doc.getTextWidth(str) + (space && str.length > 1 ? space * (str.length - 1) : 0);
    if (maxWidth && widthOf(label) > maxWidth) {
      while (label.length && widthOf(`${label}...`) > maxWidth) label = label.slice(0, -1);
      label += '...';
    }
    const extra = space && label.length > 1 ? space * (label.length - 1) : 0;
    const drawX = align === 'right' ? x - extra : (align === 'center' ? x - extra / 2 : x);
    doc.text(label, drawX, y, { align });
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  }

  function drawDivider(doc, x, y, w) {
    doc.setDrawColor(COLORS.accent).setLineWidth(0.9);
    doc.line(x, y, x + 26, y);
    doc.setDrawColor(COLORS.light).setLineWidth(0.35);
    doc.line(x + 30, y, x + w, y);
  }

  function drawStatCard(doc, x, y, w, h, label, value, unit) {
    drawShadow(doc, x, y, w, h, 3);
    doc.setFillColor('#ffffff');
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    premiumText(doc, String(value), x + w / 2, y + h * 0.48, 26, { bold: true, align: 'center' });
    if (unit) premiumText(doc, unit, x + w / 2, y + h * 0.66, 13, { color: COLORS.medium, align: 'center' });
    premiumText(doc, label.toUpperCase(), x + w / 2, y + h - 7, 8, { color: COLORS.accent, align: 'center' });
  }

  // =====================================================================
  // VUES 3D (visite 3D uniquement)
  // =====================================================================

  function selectShots(data, hs) {
    const bb = HouseAuto.bbox(data);
    const { out } = HouseAuto.findEntry(data, bb);
    const span = Math.max(3, bb.max);
    const top = Math.max(0, ...data.rooms.map(r => r.level || 0), ...data.walls.map(w => w.level || 0));
    const height = hs.levelOffset(top) + data.config.wallHeight;
    const distance = 1.6 * Math.max(span, height);
    const facade = {
      label: 'Façade principale', fov: 50, interior: false,
      pos: [bb.cx + out.x * distance - out.z * span * 0.34, Math.max(1.9, height * 0.6), bb.cz + out.z * distance + out.x * span * 0.34],
      look: [bb.cx, height * 0.44, bb.cz]
    };
    const existing = (data.renderShots || []).filter(s => s.room && !s.night && Array.isArray(s.pos));
    const rooms = summary(data).rooms.filter(r => r.habitable !== false).sort((a, b) =>
      Number(existing.some(s => s.room === b.id)) - Number(existing.some(s => s.room === a.id)) || b.area - a.area);
    const interior = rooms.slice(0, 3).map(r => {
      const authored = existing.find(s => s.room === r.id);
      if (authored) return { ...authored, label: r.name, interior: true };
      const { cam, look } = HouseAuto.roomPose(data, r);
      const y = hs.levelOffset(r.level);
      return {
        label: r.name, room: r.id, interior: true, fov: 65,
        pos: [cam.x, y + Math.min(1.45, data.config.wallHeight * 0.63), cam.z],
        look: [look.x, y + 1.08, look.z]
      };
    });
    return { facade, interior };
  }

  function gateModule() {
    if (typeof DeliverableGate !== 'undefined') return DeliverableGate;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./deliverableGate.js'); } catch (_) { return null; }
    }
    return null;
  }

  function identityModule() {
    if (typeof PdfIdentity !== 'undefined') return PdfIdentity;
    if (typeof globalThis !== 'undefined' && globalThis.PdfIdentity) return globalThis.PdfIdentity;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./pdfIdentity.js'); } catch (_) { return null; }
    }
    return null;
  }

  function resolveImageSize(doc, image) {
    const w = Number(image?.width), h = Number(image?.height);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) return { width: w, height: h };
    if (image?.data && typeof doc?.getImageProperties === 'function') {
      try {
        const props = doc.getImageProperties(image.data);
        if (Number.isFinite(props?.width) && props.width > 0 && Number.isFinite(props?.height) && props.height > 0) {
          return { width: props.width, height: props.height };
        }
      } catch (_) { /* propriétés indisponibles */ }
    }
    return null;
  }

  function imagesCaption(images, data, variant) {
    const G = gateModule();
    const list = (images || []).filter(image => image?.data);
    if (!list.length) return '';
    const kinds = list.map(image => (G ? G.imageSourceKind(image, data) : (image.ai === true ? 'ai' : 'unknown')));
    const plural = list.length > 1;
    if (kinds.includes('ai') || variant?.aiEnhanced) {
      return G ? G.imageCaption('ai', { plural }) : (plural ? 'Images générées par IA — non contractuelles' : 'Image générée par IA — non contractuelle');
    }
    const unique = [...new Set(kinds)];
    const kind = unique.length === 1 ? unique[0] : 'unknown';
    return G ? G.imageCaption(kind, { plural }) : (plural ? 'Illustrations du projet' : 'Illustration du projet');
  }

  function coverSourceCaption(data, studio, variant, options) {
    const G = gateModule();
    if (options.images?.facade?.data) {
      return imagesCaption([options.images.facade], data, variant);
    }
    if (hasStudio(studio)) {
      if (variant?.aiEnhanced) {
        return G ? G.imageCaption('ai', { plural: false }) : 'Image générée par IA — non contractuelle';
      }
      return G ? G.imageCaption('render3d') : 'Capture de la maquette 3D';
    }
    return '';
  }

  /** Format jsPDF d'une image data URL (JPEG ou PNG). */
  function imageFormat(data) {
    return /^data:image\/png/i.test(data) ? 'PNG' : 'JPEG';
  }

  /** Place une image au ratio réel (sans déformation) ; repli « contain » si dimensions introuvables. */
  function drawFitted(doc, image, x, y, w, h) {
    const size = resolveImageSize(doc, image);
    const fmt = imageFormat(image.data);
    doc.saveGraphicsState();
    doc.rect(x, y, w, h, null);
    doc.clip();
    doc.discardPath();
    if (size) {
      const ratio = size.width / size.height;
      let iw = w, ih = w / ratio;
      if (ih < h) { ih = h; iw = h * ratio; }
      const ix = x + (w - iw) / 2, iy = y + (h - ih) / 2;
      doc.addImage(image.data, fmt, ix, iy, iw, ih);
    } else {
      const [dw, dh] = w >= h ? [0, h] : [w, 0];
      doc.addImage(image.data, fmt, x, y, dw, dh);
    }
    doc.restoreGraphicsState();
  }

  function hasStudio(studio) {
    return !!(studio && studio.hs && typeof studio.capture === 'function' && typeof HouseAuto !== 'undefined');
  }

  // =====================================================================
  // PLAN DU REZ-DE-CHAUSSÉE
  // =====================================================================

  function sitePlan(doc, data, x, y, w, h, options = {}) {
    const { labels = false } = options;
    doc.setFillColor('#ffffff');
    doc.rect(x, y, w, h, 'F');
    const bb = bbox(data, 0);
    if (!bb) {
      premiumText(doc, 'Plan non disponible', x + w / 2, y + h / 2, 9, { color: COLORS.light, align: 'center' });
      return;
    }
    const dx = Math.max(1, bb.xMax - bb.xMin), dz = Math.max(1, bb.zMax - bb.zMin);
    const scale = Math.min((w - 20) / dx, (h - 14) / dz);
    const X = a => x + (w - dx * scale) / 2 + (a - bb.xMin) * scale;
    const Z = b => y + (h - dz * scale) / 2 + (b - bb.zMin) * scale;
    const [ar, ag, ab] = hexToRgb(COLORS.accent);

    const rooms = summary(data).rooms.filter(r => !r.level);
    for (const room of rooms) {
      const b = roomBounds(room);
      if (!b) continue;
      // Teinte du style : pièces habitables légèrement colorées, annexes neutres.
      const tint = room.habitable !== false ? 0.16 : 0.06;
      doc.setFillColor(Math.round(255 - (255 - ar) * tint), Math.round(255 - (255 - ag) * tint), Math.round(255 - (255 - ab) * tint));
      if (Array.isArray(room.poly) && room.poly.length >= 3) {
        const pts = room.poly.map(([px, pz]) => [X(px), Z(pz)]);
        doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
      } else {
        doc.rect(X(b.xMin), Z(b.zMin), (b.xMax - b.xMin) * scale, (b.zMax - b.zMin) * scale, 'F');
      }
      if (labels && (b.xMax - b.xMin) * scale > 16 && (b.zMax - b.zMin) * scale > 8) {
        premiumText(doc, room.name || '', X((b.xMin + b.xMax) / 2), Z((b.zMin + b.zMax) / 2), 6, { bold: true, color: COLORS.medium, align: 'center', maxWidth: (b.xMax - b.xMin) * scale - 2 });
      }
    }
    doc.setDrawColor(COLORS.primary).setLineWidth(0.6);
    for (const wall of (data.walls || []).filter(wl => !wl.level)) {
      doc.setLineWidth(wall.type === 'ext' ? 0.9 : 0.4);
      doc.line(X(wall.from[0]), Z(wall.from[1]), X(wall.to[0]), Z(wall.to[1]));
    }
    const cx = x + w - 10, cy = y + 10;
    doc.setDrawColor(COLORS.primary).setLineWidth(0.4);
    doc.circle(cx, cy, 5);
    premiumText(doc, 'N', cx, cy + 1.8, 7, { bold: true, align: 'center' });
  }

  // =====================================================================
  // PAGES
  // =====================================================================

  function drawCoverPage(doc, data, studio, variant, options) {
    const info = summary(data);
    const ID = identityModule();
    const meta = ID ? ID.extractMeta(data, { cabinet: options.cabinet, date: options.date }) : {
      project: data.meta?.name || 'Projet architectural',
      subtitle: data.meta?.subtitle || '',
      client: data.meta?.client || '',
      location: data.meta?.location || data.meta?.address || '',
      phase: data.meta?.phase || '',
      revision: data.meta?.revision || '',
      date: '',
      agency: data.meta?.architect || data.meta?.agency || '',
      brand: 'ARCHICAM STUDIO'
    };
    const stylePalette = {
      panel: COLORS.secondary,
      gold: COLORS.accent,
      accent: COLORS.accent,
      sand: COLORS.light,
      light: COLORS.light,
      ruleDark: COLORS.ruleDark,
      white: '#ffffff'
    };

    doc.setFillColor(COLORS.primary).rect(0, 0, 210, 297, 'F');
    if (ID) {
      ID.drawWoodGrain(doc, { x: 0, y: 0, w: 210, h: 297 }, { color: COLORS.wood, seed: 11, knots: 2, spacing: 5.8 });
      ID.cropMarks(doc, 10, 10, 190, 277, COLORS.accent);
      ID.drawCoverHeader(doc, {
        x: margin, y: 21, w: width,
        brand: meta.brand || 'ARCHICAM STUDIO',
        documentType: variant?.name ? `VARIANTE · ${variant.name}` : 'DOSSIER DE PRÉSENTATION',
        palette: stylePalette
      });
    }

    const kicker = [
      variant?.name ? `VARIANTE · ${variant.name}` : 'BROCHURE DE PRÉSENTATION',
      meta.phase,
      meta.revision && `INDICE ${meta.revision}`
    ].filter(Boolean).join(' · ');
    premiumText(doc, kicker.toUpperCase(), margin, 36, 7.2, { bold: true, color: COLORS.light, space: 0.8, maxWidth: width });

    doc.setFont('times', 'bold').setFontSize(28).setTextColor('#ffffff');
    const titleLines = doc.splitTextToSize(pdfSafe(data.meta?.name || 'Projet architectural'), width).slice(0, 2);
    doc.text(titleLines, margin, 49);
    let y = 49 + (titleLines.length - 1) * 11 + 5;
    doc.setDrawColor(COLORS.accent).setLineWidth(0.8);
    doc.line(margin, y, margin + 26, y);
    y += 7;
    if (data.meta?.subtitle) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor('#d5dbd1');
      const subLines = doc.splitTextToSize(pdfSafe(data.meta.subtitle), width).slice(0, 2);
      doc.text(subLines, margin, y);
      y += subLines.length * 4.5;
    }

    const imgY = Math.max(y + 6, 86), imgH = 85;
    const facadeImage = options.images?.facade;
    if (facadeImage?.data) {
      drawFitted(doc, facadeImage, margin, imgY, width, imgH);
      withOpacity(doc, 0.48, () => {
        doc.setFillColor('#000000');
        doc.rect(margin, imgY + imgH - 10, width, 10, 'F');
      });
      premiumText(doc, facadeImage.label || 'Vue extérieure', margin + 4, imgY + imgH - 3.6, 8, { color: '#ffffff', maxWidth: width - 8 });
      doc.setDrawColor(COLORS.accent).setLineWidth(0.35).rect(margin, imgY, width, imgH);
    } else if (hasStudio(studio)) {
      const shots = selectShots(data, studio.hs);
      drawFitted(doc, { data: studio.capture(shots.facade, 1600, 800, 1, { clean: true, solar: variant }), width: 1600, height: 800 }, margin, imgY, width, imgH);
      doc.setDrawColor(COLORS.accent).setLineWidth(0.35).rect(margin, imgY, width, imgH);
    } else {
      doc.setFillColor('#ffffff');
      doc.rect(margin, imgY, width, imgH, 'F');
      sitePlan(doc, data, margin + 4, imgY + 4, width - 8, imgH - 13, { labels: true });
      premiumText(doc, 'Plan du rez-de-chaussée', margin + 5, imgY + imgH - 3.5, 7.5, { color: COLORS.medium });
      doc.setDrawColor(COLORS.accent).setLineWidth(0.35).rect(margin, imgY, width, imgH);
    }

    const sourceNote = coverSourceCaption(data, studio, variant, options);
    if (sourceNote) {
      premiumText(doc, sourceNote, margin, imgY + imgH + 5, 6.8, { color: COLORS.light, maxWidth: width });
    }

    if (options.includeStats !== false) {
      const factsY = Math.max(imgY + imgH + 14, 192);
      const facts = [
        { value: String(Math.round(info.habitable)), unit: 'm²', label: 'Surface habitable' },
        { value: String(Math.round(info.total)), unit: 'm²', label: 'Surface totale' },
        { value: String(info.mainRooms), unit: '', label: 'Pièces principales' }
      ];
      if (ID) {
        ID.drawFactsBand(doc, facts, { x: margin, y: factsY, w: width, h: 24, palette: stylePalette });
      } else {
        drawStatCard(doc, margin, factsY, 50, 30, 'Surface habitable', Math.round(info.habitable), 'm²');
        drawStatCard(doc, margin + 60, factsY, 50, 30, 'Surface totale', Math.round(info.total), 'm²');
        drawStatCard(doc, margin + 120, factsY, 50, 30, 'Pièces principales', info.mainRooms, '');
      }
    }

    if (ID) {
      ID.drawCartouche(doc, meta, { x: margin, y: 230, w: width, h: 42 }, {
        theme: 'dark',
        documentLabel: variant?.name ? `Brochure · ${variant.name}` : 'Brochure de présentation',
        code: ID.documentCode('brochure', 0),
        palette: stylePalette
      });
    }
    premiumText(doc, `Style ${STYLES[currentStyle].label}`, margin, 285, 7, { color: COLORS.light });
  }

  function drawProgram(doc, data, top) {
    const rooms = summary(data).rooms.slice().sort((a, b) => a.level - b.level || Number(b.habitable !== false) - Number(a.habitable !== false) || b.area - a.area);
    premiumText(doc, 'Programme des espaces', margin, top, 18, { serif: true, bold: true });
    let y = top + 7.5;
    const rowH = 6.2, bottom = 274;
    const maxRows = Math.floor((bottom - y) / rowH);
    const shown = rooms.length > maxRows ? rooms.slice(0, maxRows - 1) : rooms;
    shown.forEach((room, i) => {
      if (i % 2 === 0) {
        doc.setFillColor('#ffffff');
        doc.rect(margin, y, width, rowH, 'F');
      }
      const level = room.level ? ` · R+${room.level}` : '';
      premiumText(doc, `${room.name || room.id}${level}`, margin + 3, y + 4.3, 9, { bold: room.habitable !== false, color: room.habitable !== false ? COLORS.primary : COLORS.medium, maxWidth: 110 });
      premiumText(doc, `${(Math.round(room.area * 10) / 10).toLocaleString('fr-FR')} m²`, margin + width - 3, y + 4.3, 9, { color: COLORS.medium, align: 'right' });
      y += rowH;
    });
    if (shown.length < rooms.length) {
      premiumText(doc, `… et ${rooms.length - shown.length} autres espaces`, margin + 3, y + 4.3, 8, { color: COLORS.medium });
    }
  }

  function drawPlanPage(doc, data, studio, variant, options) {
    const ID = identityModule();
    doc.setFillColor(COLORS.paper);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(COLORS.primary).rect(0, 0, 210, 32, 'F');
    if (ID) ID.drawWoodGrain(doc, { x: 0, y: 0, w: 210, h: 32 }, { color: COLORS.wood, seed: 9, knots: 1, spacing: 6.4 });
    doc.setFillColor(COLORS.accent).rect(0, 32, 210, 0.8, 'F');
    premiumText(doc, 'ARCHICAM STUDIO · PLAN & ESPACES', margin, 12, 6.2, { bold: true, color: COLORS.light, space: 1.0 });
    premiumText(doc, data.meta?.name || 'Projet architectural', margin, 23.5, 16, { serif: true, bold: true, color: '#ffffff', maxWidth: width - 22 });
    premiumText(doc, '02', margin + width, 23.5, 15, { serif: true, bold: true, color: COLORS.accent, align: 'right' });

    let next = 48;
    if (options.includePlan !== false) {
      premiumText(doc, 'Plan de masse', margin, 47, 19, { serif: true, bold: true });
      premiumText(doc, 'Rez-de-chaussée · cotes indicatives', margin, 54, 9, { color: COLORS.medium });
      const planY = 60, planH = 100;
      doc.setFillColor('#ffffff');
      doc.rect(margin, planY, width, planH, 'F');
      doc.setDrawColor('#c9cbbf').setLineWidth(0.3).rect(margin, planY, width, planH);
      sitePlan(doc, data, margin + 5, planY + 5, width - 10, planH - 10, { labels: true });
      next = 176;
    }

    const shots = hasStudio(studio) && options.includeInterior !== false ? selectShots(data, studio.hs).interior.slice(0, 2) : [];
    const photos = options.includeInterior !== false ? (options.images?.interiors || []).filter(image => image?.data).slice(0, 2) : [];
    if (photos.length) {
      premiumText(doc, 'Vues intérieures', margin, next, 18, { serif: true, bold: true });
      const photoW = (width - 8) / 2, photoH = 66, y = next + 8;
      photos.forEach((photo, i) => {
        const x = margin + i * (photoW + 8);
        drawFitted(doc, photo, x, y, photoW, photoH);
        withOpacity(doc, 0.65, () => {
          doc.setFillColor(COLORS.primary);
          doc.rect(x, y + photoH - 10, photoW, 10, 'F');
        });
        doc.setDrawColor(COLORS.accent).setLineWidth(0.3).rect(x, y, photoW, photoH);
        premiumText(doc, photo.label || 'Vue intérieure', x + 3, y + photoH - 3.4, 8.5, { bold: true, color: '#ffffff', maxWidth: photoW - 6 });
      });
      const interiorNote = imagesCaption(photos, data, variant);
      if (interiorNote) {
        premiumText(doc, interiorNote, margin, y + photoH + 5.5, 7, { color: COLORS.medium, maxWidth: width });
      }
    } else if (shots.length) {
      premiumText(doc, 'Vues intérieures', margin, next, 18, { serif: true, bold: true });
      const photoW = (width - 8) / 2, photoH = 66, y = next + 8;
      shots.forEach((shot, i) => {
        const x = margin + i * (photoW + 8);
        drawFitted(doc, { data: studio.capture(shot, 1200, 750, 1, { clean: true, solar: variant }), width: 1200, height: 750 }, x, y, photoW, photoH);
        withOpacity(doc, 0.65, () => {
          doc.setFillColor(COLORS.primary);
          doc.rect(x, y + photoH - 10, photoW, 10, 'F');
        });
        doc.setDrawColor(COLORS.accent).setLineWidth(0.3).rect(x, y, photoW, photoH);
        premiumText(doc, shot.label, x + 3, y + photoH - 3.4, 8.5, { bold: true, color: '#ffffff', maxWidth: photoW - 6 });
      });
      const G = gateModule();
      const note = G ? G.imageCaption('render3d', { plural: shots.length > 1 }) : (shots.length > 1 ? 'Captures de la maquette 3D' : 'Capture de la maquette 3D');
      premiumText(doc, note, margin, y + photoH + 5.5, 7, { color: COLORS.medium, maxWidth: width });
    } else {
      drawProgram(doc, data, next);
    }

    doc.setDrawColor('#c9cbbf').setLineWidth(0.3).line(margin, 280, margin + width, 280);
    premiumText(doc, data.meta?.name || 'Projet', margin, 286, 8, { color: COLORS.medium, maxWidth: 140 });
    premiumText(doc, '02 / 02', margin + width, 286, 8, { bold: true, color: COLORS.medium, align: 'right' });
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  /**
   * Génère le catalogue premium.
   * @param {object} data — projet (visite 3D ou éditeur)
   * @param {object|null} studio — studio 3D ; sans studio, le plan remplace les vues 3D
   * @param {object|null} variant
   * @param {Function} prepare — préparation de la scène, renvoie une fonction de restauration
   * @param {object} options — { style, includeStats, includePlan, includeInterior, images: { facade, interiors }, JsPDF, save }
   *   images : images IA en data URL ({ data, label, width, height }) ; elles priment sur le studio et le plan
   * @returns {Promise<object>} — le document jsPDF
   */
  async function exportPDF(data, studio = null, variant = null, prepare = () => {}, options = {}) {
    if (!data || !Array.isArray(data.rooms) || !data.rooms.length) throw new Error('Projet sans pièces : impossible de composer le catalogue');
    if (options.style) setStyle(options.style);
    const ID = identityModule();
    const cabinet = options.cabinet !== undefined ? options.cabinet : (ID ? await ID.loadCabinetProfile() : null);
    const resolvedOptions = cabinet ? { ...options, cabinet } : options;
    const JsPDF = resolvedOptions.JsPDF || await loadJsPDF();
    const restore = prepare();
    try {
      const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: resolvedOptions.compress !== false });
      doc.setProperties({ title: pdfSafe(data.meta?.name || 'Projet architectural'), subject: `Brochure premium — style ${STYLES[currentStyle].label}`, creator: 'ArchiCam Studio' });
      drawCoverPage(doc, data, studio, variant, resolvedOptions);
      doc.addPage();
      drawPlanPage(doc, data, studio, variant, resolvedOptions);
      if (resolvedOptions.save !== false) {
        // Le slug du projet passé prime : dans l'éditeur, ACTIVE_PROJECT_SLUG reste celui du projet par défaut.
        const active = typeof window !== 'undefined' ? window.ACTIVE_PROJECT_SLUG : null;
        const slug = (data.meta?.slug || active || 'projet').replace(/[^a-z0-9-]/gi, '-');
        const suffix = (variant?.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        doc.save(`${slug}${suffix ? '-' + suffix : ''}-premium-${currentStyle}.pdf`);
      }
      return doc;
    } finally {
      restore?.();
    }
  }

  return { exportPDF, setStyle, getStyle, selectShots, summary, STYLES };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientBrochurePremium;
}
