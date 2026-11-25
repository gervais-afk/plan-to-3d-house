/** Brochure locale, sans écriture serveur ni recours aux médias d'un autre projet. */
const ClientBrochure = (() => {
  const margin = 20, width = 170;
  const C = {
    dark: '#1d2620', panel: '#202a23', ink: '#1b2320', muted: '#5f6a63',
    paper: '#f4f2eb', rule: '#c9cbbf', sand: '#d8c7a0', gold: '#b78a3c',
    white: '#ffffff', room: '#ebe8de', annex: '#dfe5d8', glass: '#5b8ea0'
  };
  let pendingLibrary;

  function identityModule() {
    if (typeof PdfIdentity !== 'undefined') return PdfIdentity;
    if (typeof globalThis !== 'undefined' && globalThis.PdfIdentity) return globalThis.PdfIdentity;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./pdfIdentity.js'); } catch (_) { return null; }
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

  function formatNumber(value) {
    if (typeof clientNumber !== 'undefined' && clientNumber?.format) return clientNumber.format(value);
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value || 0);
  }

  function formatLevel(level) {
    if (typeof clientLevel === 'function') return clientLevel(level);
    return level ? `R+${level}` : 'RDC';
  }

  function caption3d(data, plural = false) {
    const G = gateModule();
    if (G && typeof G.imageCaption === 'function') return G.imageCaption('render3d', { project: data, plural });
    return plural ? 'Captures de la maquette 3D' : 'Capture de la maquette 3D';
  }

  function loadJsPDF() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return pendingLibrary ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/jspdf-4.2.1.umd.min.js'; // copie locale vérifiée : fonctionne hors ligne
      script.crossOrigin = 'anonymous';
      script.integrity = 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3';
      const timer = setTimeout(fail, 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        pendingLibrary = null;
        reject(new Error('jsPDF est indisponible. Vérifiez l’accès au CDN puis réessayez.'));
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

  function selectShots(data, hs) {
    const bb = HouseAuto.bbox(data);
    const { out } = HouseAuto.findEntry(data, bb);
    const span = Math.max(3, bb.max);
    const top = Math.max(0, ...data.rooms.map(r => r.level || 0), ...data.walls.map(w => w.level || 0));
    const height = hs.levelOffset(top) + data.config.wallHeight;
    const distance = 1.6 * Math.max(span, height);
    const facade = {
      label: 'Façade principale', fov: 47, interior: false,
      pos: [bb.cx + out.x * distance - out.z * span * 0.34, Math.max(1.9, height * 0.6), bb.cz + out.z * distance + out.x * span * 0.34],
      look: [bb.cx, height * 0.44, bb.cz]
    };
    const existing = (data.renderShots || []).filter(s => s.room && !s.night);
    // Préférer une vue composée déjà disponible, puis privilégier les pièces spacieuses.
    const rooms = data.rooms.filter(r => r.habitable).slice().sort((a, b) =>
      Number(existing.some(s => s.room === b.id)) - Number(existing.some(s => s.room === a.id)) || (b.area || 0) - (a.area || 0));
    const interior = rooms.slice(0, 2).map(r => {
      const authored = existing.find(s => s.room === r.id);
      if (authored) return { ...authored, label: r.name, interior: true };
      const { cam, look } = HouseAuto.roomPose(data, r);
      const y = hs.levelOffset(r.level);
      return {
        label: r.name, room: r.id, interior: true, fov: 65,
        pos: [cam.x, y + Math.min(1.45, data.config.wallHeight * 0.63), cam.z], look: [look.x, y + 1.08, look.z]
      };
    });
    if (interior.length === 1 && typeof roomContains === 'function') {
      const room = rooms[0];
      const shot = interior[0];
      const [x, y, z] = shot.pos;
      const opposite = [2 * room.center.x - x, 2 * room.center.z - z];
      const pos = roomContains(room, ...opposite) ? [opposite[0], y, opposite[1]] : [room.center.x, y, room.center.z];
      interior.push({ ...shot, pos, label: `${room.name} - autre angle`, look: [x, shot.look[1], z] });
    }
    return { facade, interior };
  }

  function pdfSafe(value) {
    const ID = identityModule();
    if (ID) return ID.pdfSafe(value);
    return String(value ?? '').replace(/[\u202f\u00a0\u2009]/g, ' ').trim();
  }

  function roomArea(room) {
    const ID = identityModule();
    if (ID && typeof ID.roomArea === 'function') return ID.roomArea(room);
    if (Number.isFinite(room?.area)) return room.area;
    const b = room?.bounds;
    return b ? Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin) : 0;
  }

  function text(doc, value, x, y, size = 9, options = {}) {
    const { bold = false, serif = false, color = C.ink, maxWidth, align, space = 0 } = options;
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
    doc.text(label, drawX, y, align ? { align } : undefined);
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  }

  function drawFitted(doc, dataUrl, fallbackW, fallbackH, x, y, w, h) {
    const fmt = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
    let iw = fallbackW, ih = fallbackH;
    if (typeof doc.getImageProperties === 'function') {
      try {
        const props = doc.getImageProperties(dataUrl);
        if (Number.isFinite(props?.width) && props.width > 0 && Number.isFinite(props?.height) && props.height > 0) {
          iw = props.width; ih = props.height;
        }
      } catch (_) { /* repli sur dimensions demandées */ }
    }
    doc.saveGraphicsState();
    doc.rect(x, y, w, h, null);
    doc.clip();
    doc.discardPath();
    if (iw > 0 && ih > 0) {
      const ratio = iw / ih;
      let dw = w, dh = w / ratio;
      if (dh < h) { dh = h; dw = h * ratio; }
      doc.addImage(dataUrl, fmt, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      const [dw, dh] = w >= h ? [0, h] : [w, 0];
      doc.addImage(dataUrl, fmt, x, y, dw, dh);
    }
    doc.restoreGraphicsState();
  }

  function pageChrome(doc, footerTitle, heading, page, totalPages) {
    const ID = identityModule();
    doc.setFillColor(C.paper).rect(0, 0, 210, 297, 'F');
    doc.setFillColor(C.dark).rect(0, 0, 210, 32, 'F');
    if (ID) ID.drawWoodGrain(doc, { x: 0, y: 0, w: 210, h: 32 }, { seed: 7 + page, knots: 1, spacing: 6.4 });
    doc.setFillColor(C.gold).rect(0, 32, 210, 0.8, 'F');
    text(doc, 'ARCHICAM STUDIO · BROCHURE CLIENT', margin, 12, 6.2, { bold: true, color: C.sand, space: 1.0 });
    text(doc, heading, margin, 23.5, 16.5, { serif: true, bold: true, color: C.white, maxWidth: width - 22 });
    text(doc, String(page).padStart(2, '0'), margin + width, 23.5, 15, { serif: true, bold: true, color: C.gold, align: 'right' });

    doc.setDrawColor(C.rule).setLineWidth(0.3).line(margin, 280, margin + width, 280);
    text(doc, footerTitle, margin, 286, 8, { color: C.muted, maxWidth: 140 });
    text(doc, `${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, margin + width, 286, 8, { bold: true, color: C.muted, align: 'right' });
  }

  function roomTable(doc, rooms, topY = 58) {
    const rows = rooms.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
    const columns = Math.min(2, Math.max(1, Math.ceil(rows.length / 28)));
    const rowCount = Math.ceil(rows.length / columns);
    const rowH = Math.min(6.4, 195 / Math.max(1, rowCount + 1));
    const gap = 6, colW = (width - (columns - 1) * gap) / columns;
    const size = Math.min(8.6, rowH * 1.8);
    for (let col = 0; col < columns; col++) {
      const x = margin + col * (colW + gap), y = topY;
      const areaRight = x + colW - 2.5, levelX = areaRight - 18;
      doc.setFillColor(C.dark).rect(x, y, colW, rowH + 0.6, 'F');
      text(doc, 'PIÈCE', x + 2.5, y + rowH * 0.74, size * 0.9, { bold: true, color: C.white });
      text(doc, 'NIVEAU', levelX, y + rowH * 0.74, size * 0.9, { bold: true, color: C.sand, align: 'right' });
      text(doc, 'M²', areaRight, y + rowH * 0.74, size * 0.9, { bold: true, color: C.sand, align: 'right' });
      rows.slice(col * rowCount, (col + 1) * rowCount).forEach((room, i) => {
        const rowY = y + 0.6 + (i + 1) * rowH;
        if (i % 2 === 0) doc.setFillColor(C.white).rect(x, rowY, colW, rowH, 'F');
        else doc.setFillColor(C.room).rect(x, rowY, colW, rowH, 'F');
        text(doc, room.name || room.id || 'Pièce', x + 2.5, rowY + rowH * 0.72, size, { maxWidth: levelX - x - 17, bold: room.habitable !== false });
        text(doc, formatLevel(room.level || 0), levelX, rowY + rowH * 0.72, size, { color: C.muted, align: 'right' });
        text(doc, formatNumber(roomArea(room)), areaRight, rowY + rowH * 0.72, size, { align: 'right', bold: room.habitable !== false });
      });
    }
  }

  function sitePlan(doc, data, x, y, w, h, northDegrees) {
    const bb = HouseAuto.bbox(data), ex = data.exterior || {};
    const rooms = data.rooms.filter(r => !r.level), walls = data.walls.filter(wall => !wall.level);
    const dims = (data.dimensions || []).filter(d => !Number(d.level) && d.from?.length >= 3 && d.to?.length >= 3);
    if (!dims.length) dims.push(
      { from: [bb.xMin, 0, bb.zMin - 0.6], to: [bb.xMax, 0, bb.zMin - 0.6] },
      { from: [bb.xMax + 0.6, 0, bb.zMin], to: [bb.xMax + 0.6, 0, bb.zMax] }
    );
    const bounds = { ...bb };
    const extend = (a, b) => {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      bounds.xMin = Math.min(bounds.xMin, a); bounds.xMax = Math.max(bounds.xMax, a);
      bounds.zMin = Math.min(bounds.zMin, b); bounds.zMax = Math.max(bounds.zMax, b);
    };
    const hedges = (ex.hedges || []).map(v => v.z !== undefined ? [v.xMin, v.z, v.xMax, v.z] : [v.x, v.zMin, v.x, v.zMax]);
    const water = data.water || ex.water;
    const areas = [[ex.path, '#e6dfcd'], [water, '#cbe5e8']].filter(([b]) => b && b.xMax > b.xMin && b.zMax > b.zMin);
    areas.forEach(([b]) => { extend(b.xMin, b.zMin); extend(b.xMax, b.zMax); });
    (ex.trees || []).forEach(([a, b, r = 1]) => { extend(a - r, b - r); extend(a + r, b + r); });
    hedges.forEach(([a, b, c, d]) => { extend(a, b); extend(c, d); });
    dims.forEach(d => { extend(d.from[0], d.from[2]); extend(d.to[0], d.to[2]); });
    const dx = Math.max(1, bounds.xMax - bounds.xMin), dz = Math.max(1, bounds.zMax - bounds.zMin);
    const scale = Math.min((w - 31) / dx, (h - 14) / dz);
    const X = a => x + (w - dx * scale) / 2 + (a - bounds.xMin) * scale;
    const Z = b => y + (h - dz * scale) / 2 + (b - bounds.zMin) * scale;
    doc.setFillColor(C.white).rect(x, y, w, h, 'F');
    doc.setDrawColor(C.rule).setLineWidth(0.3).rect(x, y, w, h);
    const line = (a, b, c, d) => doc.line(X(a), Z(b), X(c), Z(d));
    areas.forEach(([b, color]) => doc.setFillColor(color).rect(X(b.xMin), Z(b.zMin), (b.xMax - b.xMin) * scale, (b.zMax - b.zMin) * scale, 'F'));
    doc.setDrawColor('#9baa90').setLineWidth(0.65);
    hedges.forEach(points => line(...points));
    (ex.trees || []).forEach(([a, b, r = 1]) => doc.setFillColor('#dfe5d8').circle(X(a), Z(b), Math.max(0.35, r * scale), 'F'));
    rooms.forEach(room => {
      const b = room.bounds;
      if (!b && !room.poly) return;
      const p = room.poly || [[b.xMin, b.zMin], [b.xMax, b.zMin], [b.xMax, b.zMax], [b.xMin, b.zMax]];
      const vectors = p.slice(1).map(([a, z], i) => [(a - p[i][0]) * scale, (z - p[i][1]) * scale]);
      doc.setFillColor(room.habitable !== false ? C.room : C.annex).lines(vectors, X(p[0][0]), Z(p[0][1]), [1, 1], 'F', true);
    });
    walls.forEach(wall => {
      const whole = wall.length || Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      if (whole <= 0) return;
      const [a, b] = wall.from, [c, d] = wall.to;
      const segment = (start, end) => line(a + (c - a) * start, b + (d - b) * start, a + (c - a) * end, b + (d - b) * end);
      let last = 0;
      const stroke = () => doc.setDrawColor(C.ink).setLineWidth(Math.max(0.24, (wall.thick || 0.2) * scale * 0.75));
      for (const op of wall.openings || []) {
        const start = Math.max(0, (op.at - op.w / 2) / whole), end = Math.min(1, (op.at + op.w / 2) / whole);
        if (start > last) { stroke(); segment(last, start); }
        if (op.type === 'bay' || op.type === 'window') {
          doc.setDrawColor(C.glass).setLineWidth(0.28);
          segment(start, end);
        }
        last = Math.max(last, end);
      }
      if (last < 1) { stroke(); segment(last, 1); }
    });
    dims.forEach(({ from, to }) => {
      const a = X(from[0]), b = Z(from[2]), c = X(to[0]), d = Z(to[2]);
      const length = Math.hypot(a - c, b - d);
      if (length < 0.2) return;
      const nx = -(d - b) / length, ny = (c - a) / length;
      doc.setDrawColor(C.muted).setLineWidth(0.14).line(a, b, c, d);
      [[a, b], [c, d]].forEach(([u, v]) => doc.line(u - nx, v - ny, u + nx, v + ny));
      text(doc, `${formatNumber(length / scale)} m`, (a + c) / 2 - nx * 1.5, (b + d) / 2 - ny * 1.5, 6.5, { align: 'center', color: C.muted });
    });
    const north = (northDegrees ?? (HouseAuto.northAngle ? HouseAuto.northAngle(data) : 0)) * Math.PI / 180;
    const cx = x + w - 12, cy = y + 13, ux = Math.sin(north), uz = -Math.cos(north);
    doc.setDrawColor(C.ink).setLineWidth(0.4).circle(cx, cy, 5).line(cx - ux * 3, cy - uz * 3, cx + ux * 4, cy + uz * 4);
    doc.setFillColor(C.ink).triangle(cx + ux * 4, cy + uz * 4, cx + ux - uz * 1.2, cy + uz + ux * 1.2, cx + ux + uz * 1.2, cy + uz - ux * 1.2, 'F');
    text(doc, 'N', cx + ux * 8, cy + uz * 8 + 1, 7, { bold: true, align: 'center' });
    const steps = [1, 2, 5, 10, 20, 50];
    const step = steps.filter(n => n * scale <= 18).at(-1) || Math.min(1, 18 / scale);
    doc.setDrawColor(C.ink).setLineWidth(0.45).line(x + 5, y + h - 6, x + 5 + step * scale, y + h - 6);
    text(doc, `${Number(step.toPrecision(2))} m`, x + 5, y + h - 2.5, 6.5);
  }

  async function exportPDF(data, studio, variant = null, prepare = () => {}, options = {}) {
    const ID = identityModule();
    const cabinet = options.cabinet !== undefined ? options.cabinet : (ID ? await ID.loadCabinetProfile() : null);
    const resolvedOptions = cabinet ? { ...options, cabinet } : options;
    const JsPDF = resolvedOptions.JsPDF || await loadJsPDF();
    const restore = prepare();
    try { return build(JsPDF, data, studio, variant, resolvedOptions); }
    finally { restore?.(); }
  }

  function build(JsPDF, data, studio, variant = null, options = {}) {
    const ID = identityModule();
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: options.compress !== false });
    const title = data.meta?.name || 'Projet architectural';
    const footerTitle = [title, variant?.name].filter(Boolean).join(' · ');
    doc.setProperties({ title: pdfSafe(footerTitle), subject: 'Brochure de présentation architecturale', creator: 'ArchiCam Studio' });

    const meta = ID ? ID.extractMeta(data, { cabinet: options.cabinet, date: options.date }) : {
      project: title,
      subtitle: data.meta?.subtitle || '',
      client: data.meta?.client || '',
      location: data.meta?.location || data.meta?.address || '',
      phase: data.meta?.phase || '',
      revision: data.meta?.revision || '',
      date: '',
      agency: data.meta?.architect || data.meta?.agency || '',
      brand: 'ARCHICAM STUDIO'
    };
    const shots = selectShots(data, studio.hs);
    const capture = (shot, w, h) => studio.capture(shot, w, h, 1, { clean: true, solar: variant });

    // Page 1 — Couverture unifiée « agence »
    doc.setFillColor(C.dark).rect(0, 0, 210, 297, 'F');
    if (ID) {
      ID.drawWoodGrain(doc, { x: 0, y: 0, w: 210, h: 297 }, { seed: 11, knots: 2, spacing: 5.8 });
      ID.cropMarks(doc, 10, 10, 190, 277, C.gold);
      ID.drawCoverHeader(doc, {
        x: margin, y: 21, w: width,
        brand: meta.brand || 'ARCHICAM STUDIO',
        documentType: variant?.name ? `VARIANTE · ${variant.name}` : 'BROCHURE CLIENT'
      });
    }

    const kicker = [
      variant?.name ? `VARIANTE · ${variant.name}` : 'DOSSIER DE PRÉSENTATION',
      meta.phase,
      meta.revision && `INDICE ${meta.revision}`
    ].filter(Boolean).join(' · ');
    text(doc, kicker.toUpperCase(), margin, 36, 7.2, { bold: true, color: C.sand, space: 0.8, maxWidth: width });

    doc.setFont('times', 'bold').setFontSize(28).setTextColor(C.white);
    const titleLines = doc.splitTextToSize(pdfSafe(title), width).slice(0, 2);
    doc.text(titleLines, margin, 49);
    let y = 49 + (titleLines.length - 1) * 11 + 5;
    doc.setDrawColor(C.gold).setLineWidth(0.8).line(margin, y, margin + 26, y);
    y += 7;

    let subtitleLine = data.meta?.subtitle || '';
    if (variant && typeof document !== 'undefined') {
      const label = key => Array.from(document.getElementById(`client-${key}`)?.options || []).find(o => o.value === variant[key])?.textContent || 'Du projet';
      const hourStr = typeof SolarStudy !== 'undefined' ? SolarStudy.format(variant.hour) : '';
      subtitleLine = `${label('floor')} / ${label('facade')}${hourStr ? ` · ${hourStr}` : ''}${variant.solar ? ` · ${variant.solar.date}` : ''}`;
    }
    if (subtitleLine) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor('#d5dbd1');
      const subLines = doc.splitTextToSize(pdfSafe(subtitleLine), width).slice(0, 2);
      doc.text(subLines, margin, y);
      y += subLines.length * 4.5;
    }

    const imgY = Math.max(y + 6, 86), imgH = 85;
    drawFitted(doc, capture(shots.facade, 1600, 800), 1600, 800, margin, imgY, width, imgH);
    doc.setDrawColor(C.gold).setLineWidth(0.35).rect(margin, imgY, width, imgH);
    text(doc, caption3d(data, false), margin, imgY + imgH + 5, 6.8, { color: C.sand, maxWidth: width });

    const habitable = Number.isFinite(data.totals?.habitable)
      ? data.totals.habitable
      : (data.rooms || []).filter(r => r.habitable !== false).reduce((sum, r) => sum + roomArea(r), 0);
    const total = (data.rooms || []).reduce((sum, room) => sum + roomArea(room), 0);
    const levels = new Set([...(data.rooms || []).map(r => r.level || 0), ...(data.walls || []).map(w => w.level || 0)]).size || 1;
    const facts = [
      { value: formatNumber(habitable), unit: 'm²', label: 'Surface habitable' },
      { value: formatNumber(total), unit: 'm²', label: 'Toutes surfaces' },
      { value: levels > 1 ? `R+${levels - 1}` : 'Plain-pied', unit: '', label: 'Niveaux' }
    ];
    if (ID) {
      ID.drawFactsBand(doc, facts, { x: margin, y: Math.max(imgY + imgH + 14, 192), w: width, h: 24 });
      ID.drawCartouche(doc, meta, { x: margin, y: 230, w: width, h: 42 }, {
        theme: 'dark',
        documentLabel: variant?.name ? `Brochure · ${variant.name}` : 'Brochure client',
        code: ID.documentCode('brochure', 0)
      });
    }

    // Page 2 — Plan de masse & vues intérieures
    doc.addPage();
    pageChrome(doc, footerTitle, 'Plan de masse & vues', 2, 3);
    text(doc, 'Plan de masse', margin, 47, 18, { serif: true, bold: true });
    text(doc, 'RDC et abords modélisés · cotes indicatives de la maquette', margin, 53.5, 8.8, { color: C.muted });
    sitePlan(doc, data, margin, 58, width, 118, variant?.solar?.north);
    text(doc, 'Vues intérieures', margin, 191, 17, { serif: true, bold: true });
    const photoW = (width - 8) / 2, photoH = 58;
    for (let i = 0; i < 2; i++) {
      const shot = shots.interior[i], x = margin + i * (photoW + 8);
      if (shot) {
        drawFitted(doc, capture(shot, 1000, 659), 1000, 659, x, 198, photoW, photoH);
        doc.setDrawColor(C.gold).setLineWidth(0.3).rect(x, 198, photoW, photoH);
        text(doc, shot.label, x, 262.5, 8.8, { bold: true, maxWidth: photoW });
      } else {
        doc.setFillColor(C.room).rect(x, 198, photoW, photoH, 'F');
        doc.setDrawColor(C.rule).setLineWidth(0.3).rect(x, 198, photoW, photoH);
        text(doc, 'Pas de vue intérieure modélisée', x + photoW / 2, 228, 8, { align: 'center', color: C.muted });
      }
    }
    text(doc, caption3d(data, shots.interior.length > 1), margin, 270, 7, { color: C.muted, maxWidth: width });

    // Page 3 — Programme & tableau des surfaces
    doc.addPage();
    pageChrome(doc, footerTitle, 'Programme des espaces', 3, 3);
    text(doc, `${formatNumber(habitable)} m² habitables`, margin, 48, 14, { serif: true, bold: true });
    text(doc, `${formatNumber(total)} m² toutes surfaces modélisées`, margin + width, 48, 8.8, { align: 'right', color: C.muted });
    if (data.rooms?.length) roomTable(doc, data.rooms, 56);
    else text(doc, 'Aucune pièce renseignée.', margin, 62, 9, { color: C.muted });

    if (options.save !== false) {
      const active = typeof window !== 'undefined' ? window.ACTIVE_PROJECT_SLUG : null;
      const slug = (active || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
      const suffix = variant?.name ? variant.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
      doc.save(`${slug}${suffix ? '-' + suffix : ''}-brochure.pdf`);
    }
    return doc;
  }

  return { exportPDF, build, selectShots };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientBrochure;
}
