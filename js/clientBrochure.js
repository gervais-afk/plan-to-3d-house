/** Brochure locale, sans écriture serveur ni recours aux médias d'un autre projet. */
const ClientBrochure = (() => {
  const margin = 16, width = 178;
  const ink = '#193333', muted = '#536a64', paper = '#f5f6f0', accent = '#dcebe1';
  let pendingLibrary;

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
    const top = Math.max(0, ...data.rooms.map(r => r.level), ...data.walls.map(w => w.level));
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
      Number(existing.some(s => s.room === b.id)) - Number(existing.some(s => s.room === a.id)) || b.area - a.area);
    const interior = rooms.slice(0, 2).map(r => {
      const authored = existing.find(s => s.room === r.id);
      if (authored) return { ...authored, label: r.name, interior: true };
      const { cam, look } = HouseAuto.roomPose(data, r);
      const y = hs.levelOffset(r.level);
      return { label: r.name, room: r.id, interior: true, fov: 65,
        pos: [cam.x, y + Math.min(1.45, data.config.wallHeight * 0.63), cam.z], look: [look.x, y + 1.08, look.z] };
    });
    if (interior.length === 1) {
      const room = rooms[0];
      const shot = interior[0];
      const [x, y, z] = shot.pos;
      const opposite = [2 * room.center.x - x, 2 * room.center.z - z];
      const pos = roomContains(room, ...opposite) ? [opposite[0], y, opposite[1]] : [room.center.x, y, room.center.z];
      interior.push({ ...shot, pos, label: `${room.name} - autre angle`, look: [x, shot.look[1], z] });
    }
    return { facade, interior };
  }

  function text(doc, value, x, y, size = 9, options = {}) {
    const { bold = false, color = ink, maxWidth, align } = options;
    let label = String(value).replace(/[\u202f\u00a0]/g, ' ');
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    if (maxWidth && doc.getTextWidth(label) > maxWidth) {
      while (label.length && doc.getTextWidth(`${label}…`) > maxWidth) label = label.slice(0, -1);
      label += '…';
    }
    doc.text(label, x, y, { align });
  }

  function chrome(doc, title, page) {
    doc.setFillColor(paper).rect(0, 0, 210, 297, 'F');
    doc.setDrawColor('#a3b8a9').setLineWidth(0.25).line(margin, 279, 194, 279);
    text(doc, title, margin, 285, 8, { color: muted, maxWidth: 140 });
    text(doc, `0${page} / 02`, 194, 285, 8, { bold: true, align: 'right' });
  }

  function roomTable(doc, rooms) {
    const rows = rooms.slice().sort((a, b) => a.level - b.level);
    const columns = Math.min(3, Math.max(1, Math.ceil(rows.length / 23)));
    const rowCount = Math.ceil(rows.length / columns);
    const rowH = Math.min(5.4, 126 / (rowCount + 1));
    const gap = 4, colW = (width - (columns - 1) * gap) / columns;
    const size = Math.min(9, rowH * 2.14);
    for (let col = 0; col < columns; col++) {
      const x = margin + col * (colW + gap), y = 145;
      const areaRight = x + colW - 2, levelX = areaRight - 18;
      doc.setFillColor(accent).rect(x, y, colW, rowH, 'F');
      text(doc, 'PIÈCE', x + 2, y + rowH * 0.72, size, { bold: true });
      text(doc, 'NIVEAU', levelX, y + rowH * 0.72, size, { bold: true, align: 'right' });
      text(doc, 'M²', areaRight, y + rowH * 0.72, size, { bold: true, align: 'right' });
      rows.slice(col * rowCount, (col + 1) * rowCount).forEach((room, i) => {
        const rowY = y + (i + 1) * rowH;
        if (i % 2 === 0) doc.setFillColor('#ffffff').rect(x, rowY, colW, rowH, 'F');
        text(doc, room.name, x + 2, rowY + rowH * 0.72, size, { maxWidth: levelX - x - 17 });
        text(doc, clientLevel(room.level), levelX, rowY + rowH * 0.72, size, { align: 'right' });
        text(doc, clientNumber.format(room.area), areaRight, rowY + rowH * 0.72, size, { align: 'right' });
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
    const areas = [[ex.path, '#e6ded1'], [water, '#cbe5e8']].filter(([b]) => b && b.xMax > b.xMin && b.zMax > b.zMin);
    areas.forEach(([b]) => { extend(b.xMin, b.zMin); extend(b.xMax, b.zMax); });
    (ex.trees || []).forEach(([a, b, r = 1]) => { extend(a - r, b - r); extend(a + r, b + r); });
    hedges.forEach(([a, b, c, d]) => { extend(a, b); extend(c, d); });
    dims.forEach(d => { extend(d.from[0], d.from[2]); extend(d.to[0], d.to[2]); });
    const dx = Math.max(1, bounds.xMax - bounds.xMin), dz = Math.max(1, bounds.zMax - bounds.zMin);
    const scale = Math.min((w - 31) / dx, (h - 14) / dz);
    const X = a => x + (w - dx * scale) / 2 + (a - bounds.xMin) * scale;
    const Z = b => y + (h - dz * scale) / 2 + (b - bounds.zMin) * scale;
    doc.setFillColor('#ffffff').roundedRect(x, y, w, h, 2, 2, 'F');
    const line = (a, b, c, d) => doc.line(X(a), Z(b), X(c), Z(d));
    areas.forEach(([b, color]) => doc.setFillColor(color).rect(X(b.xMin), Z(b.zMin), (b.xMax - b.xMin) * scale, (b.zMax - b.zMin) * scale, 'F'));
    doc.setDrawColor('#a6b797').setLineWidth(0.65);
    hedges.forEach(points => line(...points));
    (ex.trees || []).forEach(([a, b, r = 1]) => doc.setFillColor('#e1ecd9').circle(X(a), Z(b), Math.max(0.35, r * scale), 'F'));
    rooms.forEach(room => {
      const b = room.bounds;
      const p = room.poly || [[b.xMin, b.zMin], [b.xMax, b.zMin], [b.xMax, b.zMax], [b.xMin, b.zMax]];
      const vectors = p.slice(1).map(([a, z], i) => [(a - p[i][0]) * scale, (z - p[i][1]) * scale]);
      doc.setFillColor(room.habitable ? '#eaf0e9' : '#f3ebe1').lines(vectors, X(p[0][0]), Z(p[0][1]), [1, 1], 'F', true);
    });
    walls.filter(wall => wall.length > 0).forEach(wall => {
      const [a, b] = wall.from, [c, d] = wall.to;
      const segment = (start, end) => line(a + (c - a) * start, b + (d - b) * start, a + (c - a) * end, b + (d - b) * end);
      const whole = wall.length;
      let last = 0;
      const stroke = () => doc.setDrawColor(ink).setLineWidth(Math.max(0.24, wall.thick * scale * 0.75));
      for (const op of wall.openings) {
        const start = Math.max(0, (op.at - op.w / 2) / whole), end = Math.min(1, (op.at + op.w / 2) / whole);
        if (start > last) { stroke(); segment(last, start); }
        if (op.type === 'bay' || op.type === 'window') {
          doc.setDrawColor('#588a9d').setLineWidth(0.25);
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
      doc.setDrawColor(muted).setLineWidth(0.14).line(a, b, c, d);
      [[a, b], [c, d]].forEach(([u, v]) => doc.line(u - nx, v - ny, u + nx, v + ny));
      text(doc, `${clientNumber.format(length / scale)} m`, (a + c) / 2 - nx * 1.5, (b + d) / 2 - ny * 1.5, 6.5, { align: 'center', color: muted });
    });
    const north = (northDegrees ?? HouseAuto.northAngle(data)) * Math.PI / 180;
    const cx = x + w - 12, cy = y + 13, ux = Math.sin(north), uz = -Math.cos(north);
    doc.setDrawColor(ink).setLineWidth(0.4).circle(cx, cy, 5).line(cx - ux * 3, cy - uz * 3, cx + ux * 4, cy + uz * 4);
    doc.setFillColor(ink).triangle(cx + ux * 4, cy + uz * 4, cx + ux - uz * 1.2, cy + uz + ux * 1.2, cx + ux + uz * 1.2, cy + uz - ux * 1.2, 'F');
    text(doc, 'N', cx + ux * 8, cy + uz * 8 + 1, 7, { bold: true, align: 'center' });
    const steps = [1, 2, 5, 10, 20, 50];
    const step = steps.filter(n => n * scale <= 18).at(-1) || Math.min(1, 18 / scale);
    doc.setDrawColor(ink).setLineWidth(0.45).line(x + 5, y + h - 6, x + 5 + step * scale, y + h - 6);
    text(doc, `${Number(step.toPrecision(2))} m`, x + 5, y + h - 2.5, 6.5);
  }

  async function exportPDF(data, studio, variant = null, prepare = () => {}) {
    const JsPDF = await loadJsPDF();
    const restore = prepare();
    try { build(JsPDF, data, studio, variant); }
    finally { restore?.(); }
  }

  function build(JsPDF, data, studio, variant) {
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    const title = data.meta?.name || 'Projet architectural';
    const footerTitle = [title, variant?.name].filter(Boolean).join(' · ');
    doc.setProperties({ title: footerTitle, subject: 'Brochure de présentation architecturale' });
    const shots = selectShots(data, studio.hs);
    const capture = (shot, w, h) => studio.capture(shot, w, h, 1, { clean: true, solar: variant });
    chrome(doc, footerTitle, 1);
    text(doc, variant ? `VARIANTE · ${variant.name}` : 'DOSSIER DE PRÉSENTATION', margin, 17, 9, { bold: true, color: muted, maxWidth: width });
    text(doc, title, margin, 31, 29, { bold: true, maxWidth: width });
    const subtitle = data.meta?.subtitle;
    if (variant) {
      const label = key => Array.from(document.getElementById(`client-${key}`).options).find(o => o.value === variant[key])?.textContent || 'Du projet';
      const finishes = `${label('floor')} / ${label('facade')} · ${SolarStudy.format(variant.hour)}${variant.solar ? ` · ${variant.solar.date}` : ''}`;
      text(doc, finishes, margin, 39, 8.5, { color: muted, maxWidth: width });
    } else if (subtitle) text(doc, subtitle, margin, 39, 9, { color: muted, maxWidth: width });
    doc.addImage(capture(shots.facade, 1400, 645), 'JPEG', margin, 44, width, 82);
    const total = data.rooms.reduce((sum, room) => sum + room.area, 0);
    text(doc, `${clientNumber.format(data.totals.habitable)} m² habitables`, margin, 138, 13, { bold: true });
    text(doc, `${clientNumber.format(total)} m² toutes surfaces modélisées`, 194, 138, 9, { align: 'right', color: muted });
    roomTable(doc, data.rooms);
    if (!data.rooms.length) text(doc, 'Aucune pièce renseignée.', margin, 158);

    doc.addPage();
    chrome(doc, footerTitle, 2);
    text(doc, 'PLAN & ESPACES', margin, 19, 9, { bold: true, color: muted });
    text(doc, 'Plan de masse', margin, 33, 24, { bold: true });
    text(doc, 'RDC et abords modélisés · cotes indicatives de la maquette', margin, 41, 9, { color: muted });
    sitePlan(doc, data, margin, 47, width, 131, variant?.solar?.north);
    text(doc, 'Vues intérieures', margin, 195, 17, { bold: true });
    const photoW = (width - 5) / 2, photoH = 57;
    for (let i = 0; i < 2; i++) {
      const shot = shots.interior[i], x = margin + i * (photoW + 5);
      if (shot) {
        doc.addImage(capture(shot, 1000, 659), 'JPEG', x, 202, photoW, photoH);
        text(doc, shot.label, x, 265, 9, { bold: true, maxWidth: photoW });
      } else {
        doc.setFillColor(accent).rect(x, 202, photoW, photoH, 'F');
        text(doc, 'Pas de vue intérieure modélisée', x + photoW / 2, 231, 8, { align: 'center' });
      }
    }
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    const suffix = variant?.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${slug}${suffix ? '-' + suffix : ''}-brochure.pdf`);
  }
  return { exportPDF };
})();
