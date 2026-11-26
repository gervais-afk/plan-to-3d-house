/**
 * Comparateur de variantes A / B (module pur, utilisable dans le navigateur et sous Node).
 * Compare deux options d'un même dossier : surfaces, pièces ajoutées/modifiées/supprimées,
 * matériaux/finitions, enveloppe budgétaire FCFA et plan miniature SVG côte à côte.
 */
const VariantComparator = (() => {
  const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function getCostEstimate(options) {
    if (options?.CostEstimate) return options.CostEstimate;
    if (typeof CostEstimate !== 'undefined') return CostEstimate;
    if (typeof require === 'function') {
      try { return require('./costEstimate.js'); } catch { return null; }
    }
    return null;
  }

  function roomArea(room, CE) {
    if (CE?.roomArea) return CE.roomArea(room);
    if (Number.isFinite(room?.area)) return room.area;
    if (Array.isArray(room?.poly) && room.poly.length >= 3) {
      let s = 0;
      for (let i = 0; i < room.poly.length; i++) {
        const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s) / 2;
    }
    if (room?.bounds) return Math.max(0, (room.bounds.xMax - room.bounds.xMin) * (room.bounds.zMax - room.bounds.zMin));
    return 0;
  }

  function summarize(variantRecord, options = {}) {
    const CE = getCostEstimate(options);
    const snap = variantRecord?.snapshot || variantRecord || {};
    const rooms = Array.isArray(snap.rooms) ? snap.rooms : [];
    const walls = Array.isArray(snap.walls) ? snap.walls : [];
    const est = CE ? CE.estimate(snap, snap.estimate) : null;

    const roomMap = new Map();
    let habitable = 0, annexes = 0;
    const levelsSet = new Set();
    for (const room of rooms) {
      const lv = Number(room.level) || 0;
      levelsSet.add(lv);
      const area = r2(roomArea(room, CE));
      if (room.habitable !== false) habitable += area;
      else annexes += area;
      const key = `${lv}:${String(room.name || room.id || 'Pièce').trim().toLowerCase()}`;
      roomMap.set(key, {
        key,
        name: String(room.name || room.id || 'Pièce').trim(),
        level: lv,
        area,
        habitable: room.habitable !== false,
        floorType: room.floorType || ''
      });
    }

    const q = est?.quantities || {};
    const estSettings = snap.estimate || {};
    const mats = variantRecord?.materials || {};

    return {
      slot: variantRecord?.slot || '',
      label: variantRecord?.label || snap.meta?.name || 'Variante',
      notes: variantRecord?.notes || '',
      savedAt: variantRecord?.savedAt || '',
      previewImage: variantRecord?.previewImage || '',
      levels: Math.max(1, levelsSet.size),
      roomCount: rooms.length,
      wallCount: walls.length,
      habitable: r1(Number.isFinite(q.habitable) ? q.habitable : habitable),
      annexes: r1(Number.isFinite(q.annexes) ? q.annexes : annexes),
      totalArea: r1((Number.isFinite(q.habitable) ? q.habitable : habitable) + (Number.isFinite(q.annexes) ? q.annexes : annexes)),
      roofArea: r1(q.roofArea || 0),
      openingsCount: (q.doors || 0) + (q.windows || 0) + (q.bays || 0),
      budgetLow: Math.round(est?.total?.low || 0),
      budgetHigh: Math.round(est?.total?.high || 0),
      materials: {
        floor: mats.floor || snap.config?.defaultFloor || 'Par défaut',
        facade: mats.facade || snap.config?.facadeFinish || 'Enduit',
        roofType: mats.roofType || estSettings.roofType || snap.config?.roof?.type || 'Standard',
        standing: estSettings.standing || 'moyen'
      },
      rooms: [...roomMap.values()],
      roomMap
    };
  }

  function compare(variantA, variantB, options = {}) {
    const a = summarize(variantA, options);
    const b = summarize(variantB, options);

    const pct = (va, vb) => (va > 0 ? r1(((vb - va) / va) * 100) : 0);
    const deltas = {
      habitable: r1(b.habitable - a.habitable),
      habitablePct: pct(a.habitable, b.habitable),
      annexes: r1(b.annexes - a.annexes),
      totalArea: r1(b.totalArea - a.totalArea),
      roofArea: r1(b.roofArea - a.roofArea),
      openingsCount: b.openingsCount - a.openingsCount,
      budgetLow: b.budgetLow - a.budgetLow,
      budgetHigh: b.budgetHigh - a.budgetHigh,
      budgetPct: pct(a.budgetLow, b.budgetLow)
    };

    const allKeys = new Set([...a.roomMap.keys(), ...b.roomMap.keys()]);
    const roomDiff = [];
    for (const key of allKeys) {
      const ra = a.roomMap.get(key) || null;
      const rb = b.roomMap.get(key) || null;
      if (ra && !rb) {
        roomDiff.push({ status: 'removed', name: ra.name, level: ra.level, areaA: ra.area, areaB: 0, delta: r2(-ra.area) });
      } else if (!ra && rb) {
        roomDiff.push({ status: 'added', name: rb.name, level: rb.level, areaA: 0, areaB: rb.area, delta: r2(rb.area) });
      } else {
        const d = r2(rb.area - ra.area);
        roomDiff.push({
          status: Math.abs(d) >= 0.15 ? 'resized' : 'unchanged',
          name: rb.name,
          level: rb.level,
          areaA: ra.area,
          areaB: rb.area,
          delta: d
        });
      }
    }
    roomDiff.sort((x, y) => x.level - y.level || Math.abs(y.delta) - Math.abs(x.delta));

    const materialChanges = [];
    for (const [field, label] of [['floor', 'Sols'], ['facade', 'Façades'], ['roofType', 'Toiture'], ['standing', 'Standing']]) {
      if (String(a.materials[field] || '') !== String(b.materials[field] || '')) {
        materialChanges.push({ field, label, a: a.materials[field], b: b.materials[field] });
      }
    }

    return { a, b, deltas, roomDiff, materialChanges };
  }

  /**
   * Génère un plan miniature SVG vectoriel du RDC (niveau 0) d'une variante pour comparaison visuelle côte à côte.
   */
  function miniPlanSVG(variantRecord, options = {}) {
    const snap = variantRecord?.snapshot || variantRecord || {};
    const level = Number(options.level) || 0;
    const walls = (snap.walls || []).filter(w => (Number(w.level) || 0) === level);
    const rooms = (snap.rooms || []).filter(r => (Number(r.level) || 0) === level);
    const W = options.width || 360, H = options.height || 240;
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    };
    walls.forEach(w => { if (w.from && w.to) { add(w.from[0], w.from[1]); add(w.to[0], w.to[1]); } });
    rooms.forEach(r => {
      if (Array.isArray(r.poly)) r.poly.forEach(p => add(p[0], p[1]));
      else if (r.bounds) { add(r.bounds.xMin, r.bounds.zMin); add(r.bounds.xMax, r.bounds.zMax); }
    });
    if (!Number.isFinite(xMin)) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#F7F5F0"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6E6A60">Plan vide</text></svg>`;
    }
    const pad = 22;
    const scale = Math.min((W - pad * 2) / Math.max(1, xMax - xMin), (H - pad * 2) / Math.max(1, zMax - zMin));
    const ox = (W - (xMax - xMin) * scale) / 2;
    const oz = (H - (zMax - zMin) * scale) / 2;
    const X = x => r1(ox + (x - xMin) * scale);
    const Z = z => r1(oz + (z - zMin) * scale);

    const out = [`<rect width="${W}" height="${H}" fill="#F7F5F0"/>`];
    for (const r of rooms) {
      const fill = r.habitable !== false ? '#EDE8DC' : '#E3ECE2';
      if (Array.isArray(r.poly) && r.poly.length >= 3) {
        out.push(`<polygon points="${r.poly.map(p => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="${fill}" stroke="none"/>`);
      } else if (r.bounds) {
        out.push(`<rect x="${X(r.bounds.xMin)}" y="${Z(r.bounds.zMin)}" width="${r1((r.bounds.xMax - r.bounds.xMin) * scale)}" height="${r1((r.bounds.zMax - r.bounds.zMin) * scale)}" fill="${fill}"/>`);
      }
    }
    for (const w of walls) {
      if (!w.from || !w.to) continue;
      const sw = Math.max(1.5, r1((w.thick || 0.2) * scale));
      out.push(`<line x1="${X(w.from[0])}" y1="${Z(w.from[1])}" x2="${X(w.to[0])}" y2="${Z(w.to[1])}" stroke="#161C19" stroke-width="${sw}" stroke-linecap="square"/>`);
    }
    for (const r of rooms) {
      const cx = r.center?.x ?? (r.bounds ? (r.bounds.xMin + r.bounds.xMax) / 2 : null);
      const cz = r.center?.z ?? (r.bounds ? (r.bounds.zMin + r.bounds.zMax) / 2 : null);
      if (cx !== null && cz !== null) {
        out.push(`<text x="${X(cx)}" y="${Z(cz)}" text-anchor="middle" font-family="sans-serif" font-size="8.5" fill="#2F3833">${esc(String(r.name || '').slice(0, 18))}</text>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`;
  }

  return { summarize, compare, miniPlanSVG };
})();

if (typeof module === 'object' && module.exports) module.exports = VariantComparator;
