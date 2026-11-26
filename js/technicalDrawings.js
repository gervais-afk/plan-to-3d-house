/**
 * Plans techniques vectoriels générés directement depuis la maquette 3D (sans IA, zéro hallucination) :
 *  - Plan de toiture 2D (emprise réelle, débords, faîtage, arêtiers, flèches de pente, cotes, surface de couverture)
 *  - Coupes architecturales 2D (Coupe A–A longitudinale, Coupe B–B transversale : murs coupés, dalles, niveaux,
 *    ouvertures réelles, charpente/toiture, pièces réellement traversées par le plan de coupe)
 * Utilisable en SVG (aperçu éditeur / téléchargement) et en tracé vectoriel jsPDF (cahier A3).
 */
const TechnicalDrawings = (() => {
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const r2 = v => Math.round(v * 100) / 100;
  const fr2 = v => Number(v || 0).toFixed(2).replace('.', ',');
  const fr1 = v => Number(v || 0).toFixed(1).replace('.', ',');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function projectBounds(data, levelFilter = null) {
    const walls = (data?.walls || []).filter(w => levelFilter === null || (Number(w.level) || 0) === levelFilter);
    const rooms = (data?.rooms || []).filter(r => levelFilter === null || (Number(r.level) || 0) === levelFilter);
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    };
    for (const w of walls) {
      if (Array.isArray(w.from) && Array.isArray(w.to)) {
        add(w.from[0], w.from[1]);
        add(w.to[0], w.to[1]);
      }
    }
    for (const r of rooms) {
      if (Array.isArray(r.poly) && r.poly.length >= 3) {
        for (const p of r.poly) add(p[0], p[1]);
      } else if (r.bounds) {
        add(r.bounds.xMin, r.bounds.zMin);
        add(r.bounds.xMax, r.bounds.zMax);
      }
    }
    if (!Number.isFinite(xMin)) return { valid: false, xMin: 0, xMax: 0, zMin: 0, zMax: 0, w: 0, d: 0, cx: 0, cz: 0 };
    return {
      valid: true,
      xMin: r2(xMin), xMax: r2(xMax), zMin: r2(zMin), zMax: r2(zMax),
      w: r2(xMax - xMin), d: r2(zMax - zMin),
      cx: r2((xMin + xMax) / 2), cz: r2((zMin + zMax) / 2)
    };
  }

  function distinctLevels(data) {
    const set = new Set();
    for (const w of (data?.walls || [])) set.add(Number(w.level) || 0);
    for (const r of (data?.rooms || [])) set.add(Number(r.level) || 0);
    const arr = [...set].sort((a, b) => a - b);
    return arr.length ? arr : [0];
  }

  function roofParams(data) {
    const cfg = data?.config || {};
    const roof = cfg.roof || {};
    const levels = distinctLevels(data);
    const topLevel = levels[levels.length - 1] || 0;
    const wallH = num(cfg.wallHeight, 2.8);
    const slabThick = num(cfg.slabThickness, 0.2);
    const floorH = num(cfg.floorHeight, wallH + slabThick);
    const eaveY = r2(topLevel * floorH + wallH + slabThick);
    const overhang = Math.max(0, Math.min(1.5, num(roof.overhang, 0.5)));
    const type = ['hip', 'gable', 'flat'].includes(roof.type) ? roof.type : 'hip';
    const pitchDeg = type === 'flat' ? 2 : Math.max(10, Math.min(45, num(roof.pitch, 26)));
    return { levels, topLevel, wallH, slabThick, floorH, eaveY, overhang, type, pitchDeg };
  }

  /**
   * Calcule la géométrie exacte du plan de toiture 2D à partir des murs/pièces réels.
   */
  function computeRoofPlan(data) {
    const rp = roofParams(data);
    const topB = projectBounds(data, rp.topLevel);
    const foot = topB.valid ? topB : projectBounds(data, null);
    if (!foot.valid) {
      return { valid: false, reason: 'Aucun mur ni pièce sur le projet.' };
    }
    const ov = rp.overhang;
    const outer = {
      xMin: r2(foot.xMin - ov),
      xMax: r2(foot.xMax + ov),
      zMin: r2(foot.zMin - ov),
      zMax: r2(foot.zMax + ov)
    };
    outer.w = r2(outer.xMax - outer.xMin);
    outer.d = r2(outer.zMax - outer.zMin);

    const horizontalRidge = outer.w >= outer.d;
    const shortSpan = Math.min(outer.w, outer.d);
    const halfSpan = shortSpan / 2;
    const pitchRad = (rp.pitchDeg * Math.PI) / 180;
    const ridgeRise = rp.type === 'flat' ? 0.15 : r2(halfSpan * Math.tan(pitchRad));
    const ridgeY = r2(rp.eaveY + ridgeRise);
    const slopePercent = r2(Math.tan(pitchRad) * 100);

    const corners = [
      [outer.xMin, outer.zMin],
      [outer.xMax, outer.zMin],
      [outer.xMax, outer.zMax],
      [outer.xMin, outer.zMax]
    ];

    let ridge = null;
    const hips = [];
    const slopeArrows = [];

    if (rp.type === 'hip') {
      if (horizontalRidge) {
        const zMid = r2((outer.zMin + outer.zMax) / 2);
        const rx0 = r2(outer.xMin + halfSpan);
        const rx1 = r2(outer.xMax - halfSpan);
        ridge = { from: [rx0, zMid], to: [rx1, zMid] };
        hips.push(
          { from: [outer.xMin, outer.zMin], to: [rx0, zMid] },
          { from: [outer.xMin, outer.zMax], to: [rx0, zMid] },
          { from: [outer.xMax, outer.zMin], to: [rx1, zMid] },
          { from: [outer.xMax, outer.zMax], to: [rx1, zMid] }
        );
        const cx = r2((outer.xMin + outer.xMax) / 2);
        slopeArrows.push(
          { from: [cx, zMid - halfSpan * 0.25], to: [cx, outer.zMin + halfSpan * 0.2], label: `${fr1(slopePercent)} %` },
          { from: [cx, zMid + halfSpan * 0.25], to: [cx, outer.zMax - halfSpan * 0.2], label: `${fr1(slopePercent)} %` },
          { from: [rx0 - halfSpan * 0.2, zMid], to: [outer.xMin + halfSpan * 0.2, zMid], label: `${fr1(slopePercent)} %` },
          { from: [rx1 + halfSpan * 0.2, zMid], to: [outer.xMax - halfSpan * 0.2, zMid], label: `${fr1(slopePercent)} %` }
        );
      } else {
        const xMid = r2((outer.xMin + outer.xMax) / 2);
        const rz0 = r2(outer.zMin + halfSpan);
        const rz1 = r2(outer.zMax - halfSpan);
        ridge = { from: [xMid, rz0], to: [xMid, rz1] };
        hips.push(
          { from: [outer.xMin, outer.zMin], to: [xMid, rz0] },
          { from: [outer.xMax, outer.zMin], to: [xMid, rz0] },
          { from: [outer.xMin, outer.zMax], to: [xMid, rz1] },
          { from: [outer.xMax, outer.zMax], to: [xMid, rz1] }
        );
        const cz = r2((outer.zMin + outer.zMax) / 2);
        slopeArrows.push(
          { from: [xMid - halfSpan * 0.25, cz], to: [outer.xMin + halfSpan * 0.2, cz], label: `${fr1(slopePercent)} %` },
          { from: [xMid + halfSpan * 0.25, cz], to: [outer.xMax - halfSpan * 0.2, cz], label: `${fr1(slopePercent)} %` },
          { from: [xMid, rz0 - halfSpan * 0.2], to: [xMid, outer.zMin + halfSpan * 0.2], label: `${fr1(slopePercent)} %` },
          { from: [xMid, rz1 + halfSpan * 0.2], to: [xMid, outer.zMax - halfSpan * 0.2], label: `${fr1(slopePercent)} %` }
        );
      }
    } else if (rp.type === 'gable') {
      if (horizontalRidge) {
        const zMid = r2((outer.zMin + outer.zMax) / 2);
        ridge = { from: [outer.xMin, zMid], to: [outer.xMax, zMid] };
        const cx = r2((outer.xMin + outer.xMax) / 2);
        slopeArrows.push(
          { from: [cx, zMid - halfSpan * 0.25], to: [cx, outer.zMin + halfSpan * 0.2], label: `${fr1(slopePercent)} %` },
          { from: [cx, zMid + halfSpan * 0.25], to: [cx, outer.zMax - halfSpan * 0.2], label: `${fr1(slopePercent)} %` }
        );
      } else {
        const xMid = r2((outer.xMin + outer.xMax) / 2);
        ridge = { from: [xMid, outer.zMin], to: [xMid, outer.zMax] };
        const cz = r2((outer.zMin + outer.zMax) / 2);
        slopeArrows.push(
          { from: [xMid - halfSpan * 0.25, cz], to: [outer.xMin + halfSpan * 0.2, cz], label: `${fr1(slopePercent)} %` },
          { from: [xMid + halfSpan * 0.25, cz], to: [outer.xMax - halfSpan * 0.2, cz], label: `${fr1(slopePercent)} %` }
        );
      }
    } else {
      const cx = r2((outer.xMin + outer.xMax) / 2), cz = r2((outer.zMin + outer.zMax) / 2);
      slopeArrows.push({ from: [cx - outer.w * 0.2, cz], to: [cx + outer.w * 0.2, cz], label: 'Pente 2 % (terrasse)' });
    }

    // Auvents / avancées inférieures réelles
    const canopies = (data?.canopies || []).map(c => ({
      name: c.name || 'Auvent',
      xMin: num(c.xMin), xMax: num(c.xMax), zMin: num(c.zMin), zMax: num(c.zMax)
    }));

    const planArea = r2(outer.w * outer.d);
    const roofArea = r2(planArea / Math.max(0.5, Math.cos(pitchRad)));

    return {
      valid: true,
      type: rp.type,
      typeLabel: rp.type === 'hip' ? 'Toiture 4 pentes (croupes)' : rp.type === 'gable' ? 'Toiture 2 pentes (pignons)' : 'Toiture terrasse',
      footprint: foot,
      outer,
      corners,
      ridge,
      hips,
      slopeArrows,
      canopies,
      overhang: ov,
      pitchDeg: rp.pitchDeg,
      slopePercent,
      eaveY: rp.eaveY,
      ridgeY,
      ridgeRise,
      planArea,
      roofArea,
      levels: rp.levels,
      northDeg: num(data?.config?.north, 0)
    };
  }

  function pointInRoom(room, x, z) {
    if (Array.isArray(room?.poly) && room.poly.length >= 3) {
      let inside = false;
      const pts = room.poly;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
        const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    }
    const b = room?.bounds;
    if (!b) return false;
    return x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax;
  }

  /**
   * Calcule une coupe verticale 2D exacte à travers tous les niveaux de la maquette.
   * axis = 'x' → coupe longitudinale (parallèle à X, plan de coupe z = position, Coupe A–A)
   * axis = 'z' → coupe transversale (parallèle à Z, plan de coupe x = position, Coupe B–B)
   */
  function computeSection(data, options = {}) {
    const bounds = projectBounds(data, null);
    if (!bounds.valid) return { valid: false, reason: 'Aucun mur ni pièce sur le projet.' };
    const axis = options.axis === 'z' ? 'z' : 'x';
    const label = options.label || (axis === 'x' ? 'Coupe A–A (longitudinale)' : 'Coupe B–B (transversale)');
    const cutPos = Number.isFinite(Number(options.position))
      ? Number(options.position)
      : (axis === 'x' ? bounds.cz : bounds.cx);

    const rp = roofParams(data);
    const roof = computeRoofPlan(data);
    const uMin = axis === 'x' ? bounds.xMin : bounds.zMin;
    const uMax = axis === 'x' ? bounds.xMax : bounds.zMax;
    const spanU = r2(uMax - uMin);

    const cutWalls = [];
    const bgOpenings = [];
    const cutRooms = [];
    const slabs = [];

    for (const lv of rp.levels) {
      const yFloor = r2(lv * rp.floorH);
      const yCeil = r2(yFloor + rp.wallH);
      const lvBounds = projectBounds(data, lv);
      if (lvBounds.valid) {
        const sMin = axis === 'x' ? lvBounds.xMin : lvBounds.zMin;
        const sMax = axis === 'x' ? lvBounds.xMax : lvBounds.zMax;
        slabs.push({ level: lv, u0: sMin, u1: sMax, y0: r2(yFloor - rp.slabThick), y1: yFloor });
        if (lv === rp.topLevel) {
          slabs.push({ level: lv + 1, u0: sMin, u1: sMax, y0: yCeil, y1: r2(yCeil + rp.slabThick) });
        }
      }

      const walls = (data?.walls || []).filter(w => (Number(w.level) || 0) === lv);
      for (const w of walls) {
        if (!Array.isArray(w.from) || !Array.isArray(w.to)) continue;
        const p0 = axis === 'x' ? w.from[1] : w.from[0]; // coordonnée perpendiculaire au plan de coupe
        const p1 = axis === 'x' ? w.to[1] : w.to[0];
        const u0 = axis === 'x' ? w.from[0] : w.from[1]; // coordonnée le long de la coupe
        const u1 = axis === 'x' ? w.to[0] : w.to[1];
        const thick = num(w.thick, w.type === 'ext' ? 0.25 : 0.15);

        // 1. Mur traversé par le plan de coupe
        const minP = Math.min(p0, p1), maxP = Math.max(p0, p1);
        if (cutPos >= minP - 1e-4 && cutPos <= maxP + 1e-4 && Math.abs(p1 - p0) > 1e-4) {
          const t = (cutPos - p0) / (p1 - p0);
          const uHit = r2(u0 + t * (u1 - u0));
          cutWalls.push({
            level: lv,
            u: uHit,
            thick,
            type: w.type || 'int',
            y0: yFloor,
            y1: yCeil
          });
        } else if (Math.abs(p0 - p1) <= 0.15 && p0 <= cutPos + 0.05 && p0 >= cutPos - 4.5) {
          // 2. Mur d'arrière-plan parallèle au plan de coupe (vu en élévation intérieure)
          const wallLen = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
          const dir = u1 >= u0 ? 1 : -1;
          for (const op of (w.openings || [])) {
            const centerU = u0 + dir * num(op.at, wallLen / 2);
            const ow = num(op.w, 0.9);
            const oh = num(op.h, op.type === 'door' ? 2.1 : 1.25);
            const sill = op.type === 'door' || op.type === 'open' ? 0 : num(op.sill, 0.95);
            bgOpenings.push({
              level: lv,
              type: op.type || 'window',
              u0: r2(centerU - ow / 2),
              u1: r2(centerU + ow / 2),
              y0: r2(yFloor + sill),
              y1: r2(Math.min(yCeil, yFloor + sill + oh))
            });
          }
        }
      }

      // 3. Pièces réellement traversées par le plan de coupe
      const rooms = (data?.rooms || []).filter(r => (Number(r.level) || 0) === lv);
      for (const r of rooms) {
        const rb = r.bounds || (() => {
          const xs = (r.poly || []).map(p => p[0]), zs = (r.poly || []).map(p => p[1]);
          if (!xs.length) return null;
          return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
        })();
        if (!rb) continue;
        const pMin = axis === 'x' ? rb.zMin : rb.xMin;
        const pMax = axis === 'x' ? rb.zMax : rb.xMax;
        if (cutPos < pMin || cutPos > pMax) continue;
        const rU0 = axis === 'x' ? rb.xMin : rb.zMin;
        const rU1 = axis === 'x' ? rb.xMax : rb.zMax;
        const midU = (rU0 + rU1) / 2;
        const hitX = axis === 'x' ? midU : cutPos;
        const hitZ = axis === 'x' ? cutPos : midU;
        if (pointInRoom(r, hitX, hitZ) || (cutPos >= pMin && cutPos <= pMax)) {
          cutRooms.push({
            level: lv,
            id: r.id || '',
            name: r.name || 'Pièce',
            uCenter: r2(midU),
            u0: r2(rU0),
            u1: r2(rU1),
            yMid: r2(yFloor + rp.wallH * 0.45),
            yFloor
          });
        }
      }
    }

    // 4. Silhouette exacte de toiture sur l'axe de coupe
    const roofMinU = (axis === 'x' ? roof.outer.xMin : roof.outer.zMin);
    const roofMaxU = (axis === 'x' ? roof.outer.xMax : roof.outer.zMax);
    let roofProfile = [];
    if (rp.type === 'flat') {
      roofProfile = [[roofMinU, rp.eaveY], [roofMinU, rp.eaveY + 0.35], [roofMaxU, rp.eaveY + 0.35], [roofMaxU, rp.eaveY]];
    } else {
      const rSpan = roofMaxU - roofMinU;
      const halfShort = Math.min(roof.outer.w, roof.outer.d) / 2;
      const isParallelToRidge = (axis === 'x' && roof.outer.w >= roof.outer.d) || (axis === 'z' && roof.outer.d > roof.outer.w);
      if (rp.type === 'hip' && isParallelToRidge && rSpan > halfShort * 2 + 0.05) {
        roofProfile = [
          [roofMinU, rp.eaveY],
          [r2(roofMinU + halfShort), roof.ridgeY],
          [r2(roofMaxU - halfShort), roof.ridgeY],
          [roofMaxU, rp.eaveY]
        ];
      } else {
        roofProfile = [
          [roofMinU, rp.eaveY],
          [r2((roofMinU + roofMaxU) / 2), roof.ridgeY],
          [roofMaxU, rp.eaveY]
        ];
      }
    }

    const levelMarkers = rp.levels.map(lv => ({
      level: lv,
      y: r2(lv * rp.floorH),
      label: lv === 0 ? '±0,00' : `+${fr2(lv * rp.floorH)}`
    }));
    levelMarkers.push({ level: 'eave', y: rp.eaveY, label: `+${fr2(rp.eaveY)}` });
    if (roof.ridgeY > rp.eaveY + 0.2) {
      levelMarkers.push({ level: 'ridge', y: roof.ridgeY, label: `+${fr2(roof.ridgeY)}` });
    }

    return {
      valid: true,
      axis,
      label,
      cutPos: r2(cutPos),
      uMin: Math.min(uMin, roofMinU),
      uMax: Math.max(uMax, roofMaxU),
      spanU,
      groundY: -0.45,
      maxY: r2(roof.ridgeY + 0.4),
      wallH: rp.wallH,
      slabThick: rp.slabThick,
      floorH: rp.floorH,
      levels: rp.levels,
      slabs,
      cutWalls,
      bgOpenings,
      cutRooms,
      roofProfile,
      roofTypeLabel: roof.typeLabel,
      levelMarkers
    };
  }

  // --- Rendu SVG vectoriel (aperçu interactif dans l'éditeur + export SVG) ---
  function renderRoofPlanSVG(data, options = {}) {
    const roof = computeRoofPlan(data);
    if (!roof.valid) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><text x="300" y="200" text-anchor="middle" fill="#5a635d" font-family="sans-serif">${esc(roof.reason)}</text></svg>`;
    const W = options.width || 960, H = options.height || 660;
    const pad = 95;
    const sx = (W - pad * 2) / Math.max(1, roof.outer.w);
    const sz = (H - pad * 2) / Math.max(1, roof.outer.d);
    const scale = Math.min(sx, sz);
    const ox = (W - roof.outer.w * scale) / 2;
    const oz = (H - roof.outer.d * scale) / 2;
    const X = x => r2(ox + (x - roof.outer.xMin) * scale);
    const Z = z => r2(oz + (z - roof.outer.zMin) * scale);

    const f = roof.footprint, o = roof.outer;
    const parts = [];
    parts.push(`<rect width="${W}" height="${H}" fill="#F7F5F0"/>`);
    parts.push(`<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#161C19" stroke-width="1"/>`);
    // Emprise murs extérieurs (pointillés sous débord)
    parts.push(`<rect x="${X(f.xMin)}" y="${Z(f.zMin)}" width="${r2(f.w * scale)}" height="${r2(f.d * scale)}" fill="#EAE4D8" stroke="#6E6A60" stroke-width="1.2" stroke-dasharray="6 4"/>`);
    // Contour toiture avec débords
    parts.push(`<rect x="${X(o.xMin)}" y="${Z(o.zMin)}" width="${r2(o.w * scale)}" height="${r2(o.d * scale)}" fill="rgba(179,134,70,0.08)" stroke="#161C19" stroke-width="2.4"/>`);
    // Auvents
    for (const c of roof.canopies) {
      parts.push(`<rect x="${X(c.xMin)}" y="${Z(c.zMin)}" width="${r2((c.xMax - c.xMin) * scale)}" height="${r2((c.zMax - c.zMin) * scale)}" fill="rgba(90,110,95,0.12)" stroke="#4C5A52" stroke-width="1.2" stroke-dasharray="4 3"/>`);
    }
    // Arêtiers
    for (const h of roof.hips) {
      parts.push(`<line x1="${X(h.from[0])}" y1="${Z(h.from[1])}" x2="${X(h.to[0])}" y2="${Z(h.to[1])}" stroke="#161C19" stroke-width="1.8"/>`);
    }
    // Faîtage
    if (roof.ridge) {
      parts.push(`<line x1="${X(roof.ridge.from[0])}" y1="${Z(roof.ridge.from[1])}" x2="${X(roof.ridge.to[0])}" y2="${Z(roof.ridge.to[1])}" stroke="#8C6329" stroke-width="3.2"/>`);
      const mx = (X(roof.ridge.from[0]) + X(roof.ridge.to[0])) / 2;
      const mz = (Z(roof.ridge.from[1]) + Z(roof.ridge.to[1])) / 2;
      parts.push(`<text x="${mx}" y="${mz - 10}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#8C6329">FAÎTAGE +${fr2(roof.ridgeY)} m</text>`);
    }
    // Flèches de pente
    parts.push(`<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#161C19"/></marker></defs>`);
    for (const a of roof.slopeArrows) {
      const x1 = X(a.from[0]), y1 = Z(a.from[1]), x2 = X(a.to[0]), y2 = Z(a.to[1]);
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#161C19" stroke-width="1.5" marker-end="url(#arr)"/>`);
      parts.push(`<text x="${r2((x1 + x2) / 2)}" y="${r2((y1 + y2) / 2 - 6)}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#3D4640">${esc(a.label)}</text>`);
    }
    // Cotes hors-tout
    const yDim = Z(o.zMax) + 34;
    parts.push(`<line x1="${X(o.xMin)}" y1="${yDim}" x2="${X(o.xMax)}" y2="${yDim}" stroke="#5A635D" stroke-width="1"/>`);
    parts.push(`<text x="${r2((X(o.xMin) + X(o.xMax)) / 2)}" y="${yDim - 6}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#161C19">${fr2(o.w)} m (dont débords ${fr2(roof.overhang)} m)</text>`);
    const xDim = X(o.xMax) + 34;
    parts.push(`<line x1="${xDim}" y1="${Z(o.zMin)}" x2="${xDim}" y2="${Z(o.zMax)}" stroke="#5A635D" stroke-width="1"/>`);
    parts.push(`<text x="${xDim + 14}" y="${r2((Z(o.zMin) + Z(o.zMax)) / 2)}" text-anchor="middle" transform="rotate(-90 ${xDim + 14} ${r2((Z(o.zMin) + Z(o.zMax)) / 2)})" font-family="sans-serif" font-size="12" font-weight="600" fill="#161C19">${fr2(o.d)} m</text>`);
    // Cartouche bas
    parts.push(`<text x="34" y="${H - 34}" font-family="Georgia,serif" font-size="15" font-weight="700" fill="#161C19">PLAN DE TOITURE — ${esc(roof.typeLabel.toUpperCase())}</text>`);
    parts.push(`<text x="${W - 34}" y="${H - 34}" text-anchor="end" font-family="sans-serif" font-size="12" fill="#5A635D">Égout +${fr2(roof.eaveY)} m · Faîtage +${fr2(roof.ridgeY)} m · Surface couverture ${fr1(roof.roofArea)} m²</text>`);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`;
  }

  function renderSectionSVG(data, options = {}) {
    const sec = computeSection(data, options);
    if (!sec.valid) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><text x="300" y="200" text-anchor="middle" fill="#5a635d" font-family="sans-serif">${esc(sec.reason)}</text></svg>`;
    const W = options.width || 960, H = options.height || 540;
    const padX = 95, padTop = 65, padBot = 90;
    const spanU = Math.max(2, sec.uMax - sec.uMin);
    const spanY = Math.max(3, sec.maxY - sec.groundY);
    const scale = Math.min((W - padX * 2) / spanU, (H - padTop - padBot) / spanY);
    const ox = (W - spanU * scale) / 2;
    const oy = H - padBot;
    const U = u => r2(ox + (u - sec.uMin) * scale);
    const Y = y => r2(oy - (y - sec.groundY) * scale);

    const parts = [];
    parts.push(`<rect width="${W}" height="${H}" fill="#F7F5F0"/>`);
    parts.push(`<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#161C19" stroke-width="1"/>`);
    // Terre-plein / sol naturel
    parts.push(`<rect x="28" y="${Y(0)}" width="${W - 56}" height="${r2(Y(sec.groundY) - Y(0))}" fill="#E6DFD2"/>`);
    parts.push(`<line x1="28" y1="${Y(0)}" x2="${W - 28}" y2="${Y(0)}" stroke="#161C19" stroke-width="1.8"/>`);
    // Silhouette toiture + fermes
    if (sec.roofProfile.length >= 3) {
      const pts = sec.roofProfile.map(([u, y]) => `${U(u)},${Y(y)}`).join(' ');
      parts.push(`<polygon points="${pts}" fill="#EAE3D6" stroke="#161C19" stroke-width="2.2"/>`);
      const uLeft = sec.roofProfile[0][0], uRight = sec.roofProfile[sec.roofProfile.length - 1][0];
      const yEave = sec.roofProfile[0][1];
      const peak = sec.roofProfile.reduce((best, p) => (p[1] > best[1] ? p : best), sec.roofProfile[0]);
      // Poinçon et entrait de charpente
      parts.push(`<line x1="${U(peak[0])}" y1="${Y(yEave)}" x2="${U(peak[0])}" y2="${Y(peak[1])}" stroke="#7B6B56" stroke-width="1.2" stroke-dasharray="4 3"/>`);
      parts.push(`<line x1="${U(uLeft)}" y1="${Y(yEave)}" x2="${U(uRight)}" y2="${Y(yEave)}" stroke="#161C19" stroke-width="1.6"/>`);
    }
    // Ouvertures vues en arrière-plan
    for (const op of sec.bgOpenings) {
      const x0 = U(op.u0), x1 = U(op.u1), yTop = Y(op.y1), yBot = Y(op.y0);
      const fill = op.type === 'door' ? '#F3EEE4' : 'rgba(130,170,195,0.22)';
      parts.push(`<rect x="${x0}" y="${yTop}" width="${r2(x1 - x0)}" height="${r2(yBot - yTop)}" fill="${fill}" stroke="#5A635D" stroke-width="1"/>`);
    }
    // Dalles horizontales pochées
    for (const slab of sec.slabs) {
      parts.push(`<rect x="${U(slab.u0)}" y="${Y(slab.y1)}" width="${r2((slab.u1 - slab.u0) * scale)}" height="${Math.max(3, r2((slab.y1 - slab.y0) * scale))}" fill="#161C19"/>`);
    }
    // Murs coupés pochés
    for (const w of sec.cutWalls) {
      const pw = Math.max(3, r2(w.thick * scale));
      parts.push(`<rect x="${r2(U(w.u) - pw / 2)}" y="${Y(w.y1)}" width="${pw}" height="${r2((w.y1 - w.y0) * scale)}" fill="#161C19"/>`);
    }
    // Noms des pièces traversées
    for (const rm of sec.cutRooms) {
      parts.push(`<text x="${U(rm.uCenter)}" y="${Y(rm.yMid)}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="600" fill="#2A322D">${esc(rm.name)}</text>`);
    }
    // Repères de niveaux à gauche
    for (const mk of sec.levelMarkers) {
      const ym = Y(mk.y);
      parts.push(`<line x1="36" y1="${ym}" x2="${U(sec.uMin) - 8}" y2="${ym}" stroke="#8C6329" stroke-width="0.9" stroke-dasharray="3 3"/>`);
      parts.push(`<text x="40" y="${ym - 4}" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#8C6329">${esc(mk.label)} m</text>`);
    }
    // Cartouche bas
    parts.push(`<text x="34" y="${H - 30}" font-family="Georgia,serif" font-size="15" font-weight="700" fill="#161C19">${esc(sec.label.toUpperCase())}</text>`);
    parts.push(`<text x="${W - 34}" y="${H - 30}" text-anchor="end" font-family="sans-serif" font-size="12" fill="#5A635D">Plan de coupe ${sec.axis === 'x' ? 'z' : 'x'} = ${fr2(sec.cutPos)} m · HSP ${fr2(sec.wallH)} m · ${sec.cutWalls.length} mur(s) coupé(s)</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`;
  }

  function drawPdfGraphicScale(doc, bx, by, effK, denominator, suffix = '') {
    const barM = [1, 2, 5, 10, 20].filter(m => m * effK <= 54).at(-1) || 1;
    const barW = barM * effK;
    if (barW >= 6) {
      for (let i = 0; i < 5; i++) {
        doc.setFillColor(i % 2 ? '#ffffff' : '#1b2320').rect(bx + i * barW / 5, by - 1.3, barW / 5, 1.3, 'F');
      }
      doc.setDrawColor('#1b2320').setLineWidth(0.2).rect(bx, by - 1.3, barW, 1.3, 'S');
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor('#5f6a63');
      doc.text('0', bx, by + 2.8);
      doc.text(`${barM} m`, bx + barW, by + 2.8, { align: 'center' });
      doc.text(`Échelle 1:${denominator}${suffix ? ` · ${suffix}` : ''}`, bx + barW + 6, by + 0.2);
    } else {
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor('#5f6a63');
      doc.text(`Échelle 1:${denominator}${suffix ? ` · ${suffix}` : ''}`, bx, by + 0.2);
    }
  }

  function drawPdfDimTick(doc, x, y) {
    doc.line(x - 1.1, y + 1.1, x + 1.1, y - 1.1);
  }

  function drawPdfPoly(doc, pts, style = 'FD') {
    if (!pts || pts.length < 3 || typeof doc.lines !== 'function') return;
    const [x0, y0] = pts[0];
    const rel = [];
    for (let i = 1; i < pts.length; i++) rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    doc.lines(rel, x0, y0, [1, 1], style, true);
  }

  // --- Tracé vectoriel natif dans jsPDF (pour Cahier de plans A3) ---
  function drawRoofPlanPDF(doc, data, box, denominator = 100) {
    const roof = computeRoofPlan(data);
    if (!roof.valid) return roof;
    const den = Number.isFinite(Number(denominator)) && Number(denominator) > 0 ? Number(denominator) : 100;
    const targetK = 1000 / den; // mm par mètre
    const effK = Math.min(targetK, (box.w - 30) / Math.max(1, roof.outer.w), (box.h - 32) / Math.max(1, roof.outer.d));
    const shownDen = effK < targetK * 0.96 ? Math.round(1000 / effK) : den;
    const ox = box.x + (box.w - roof.outer.w * effK) / 2 - 2;
    const oz = box.y + (box.h - 10 - roof.outer.d * effK) / 2;
    const X = x => ox + (x - roof.outer.xMin) * effK;
    const Z = z => oz + (z - roof.outer.zMin) * effK;

    // Passe-partout technique sur fond papier ivoire
    doc.setFillColor('#fbfaf6').rect(box.x, box.y, box.w, box.h - 8, 'F');
    doc.setDrawColor('#d2cfc4').setLineWidth(0.22).rect(box.x, box.y, box.w, box.h - 8, 'S');

    // Voile de couverture (contour extérieur) puis emprise murs en pointillés
    const f = roof.footprint, o = roof.outer;
    doc.setFillColor('#f5efe2').rect(X(o.xMin), Z(o.zMin), o.w * effK, o.d * effK, 'F');
    doc.setFillColor('#e9e3d5').rect(X(f.xMin), Z(f.zMin), f.w * effK, f.d * effK, 'F');
    doc.setDrawColor('#6e6a60').setLineWidth(0.22);
    if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([1.6, 1.2], 0);
    doc.rect(X(f.xMin), Z(f.zMin), f.w * effK, f.d * effK, 'S');
    if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);

    // Auvents / pergolas secondaires
    if (roof.canopies?.length) {
      doc.setFillColor('#e2e8df').setDrawColor('#5b6a60').setLineWidth(0.22);
      if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([1.1, 1.0], 0);
      for (const c of roof.canopies) {
        doc.rect(X(c.xMin), Z(c.zMin), (c.xMax - c.xMin) * effK, (c.zMax - c.zMin) * effK, 'FD');
      }
      if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
    }

    // Contour extérieur toiture (égouts)
    doc.setDrawColor('#1b2320').setLineWidth(0.62).rect(X(o.xMin), Z(o.zMin), o.w * effK, o.d * effK, 'S');
    // Arêtiers
    doc.setDrawColor('#1b2320').setLineWidth(0.4);
    for (const h of roof.hips) doc.line(X(h.from[0]), Z(h.from[1]), X(h.to[0]), Z(h.to[1]));
    // Faîtage en or architectural + cote de niveau
    if (roof.ridge) {
      doc.setDrawColor('#b78a3c').setLineWidth(0.8);
      doc.line(X(roof.ridge.from[0]), Z(roof.ridge.from[1]), X(roof.ridge.to[0]), Z(roof.ridge.to[1]));
      const mx = (X(roof.ridge.from[0]) + X(roof.ridge.to[0])) / 2;
      const my = (Z(roof.ridge.from[1]) + Z(roof.ridge.to[1])) / 2;
      doc.setFont('helvetica', 'bold').setFontSize(6.4).setTextColor('#8c6329');
      doc.text(`FAÎTAGE +${fr2(roof.ridgeY)} m`, mx, my - 2.2, { align: 'center' });
    }
    // Flèches de pente
    doc.setDrawColor('#1b2320').setLineWidth(0.25).setFont('helvetica', 'normal').setFontSize(6.2).setTextColor('#3d4640');
    for (const a of roof.slopeArrows) {
      const x1 = X(a.from[0]), y1 = Z(a.from[1]), x2 = X(a.to[0]), y2 = Z(a.to[1]);
      doc.line(x1, y1, x2, y2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      doc.line(x2, y2, x2 - Math.cos(ang - 0.5) * 2.0, y2 - Math.sin(ang - 0.5) * 2.0);
      doc.line(x2, y2, x2 - Math.cos(ang + 0.5) * 2.0, y2 - Math.sin(ang + 0.5) * 2.0);
      doc.text(a.label, (x1 + x2) / 2, (y1 + y2) / 2 - 1.5, { align: 'center' });
    }
    // Cotes extérieures avec traits d'attache et barres obliques d'architecte
    doc.setDrawColor('#5f6a63').setLineWidth(0.16).setFont('helvetica', 'normal').setFontSize(6.6).setTextColor('#1b2320');
    const yd = Math.min(box.y + box.h - 12, Z(o.zMax) + 7);
    doc.line(X(o.xMin), Z(o.zMax) + 1.5, X(o.xMin), yd + 1.5);
    doc.line(X(o.xMax), Z(o.zMax) + 1.5, X(o.xMax), yd + 1.5);
    doc.line(X(o.xMin), yd, X(o.xMax), yd);
    drawPdfDimTick(doc, X(o.xMin), yd);
    drawPdfDimTick(doc, X(o.xMax), yd);
    doc.text(`${fr2(o.w)} m (dont débords ${fr2(roof.overhang)} m)`, (X(o.xMin) + X(o.xMax)) / 2, yd - 1.5, { align: 'center' });

    const xd = Math.min(box.x + box.w - 5, X(o.xMax) + 7.5);
    doc.line(X(o.xMax) + 1.5, Z(o.zMin), xd + 1.5, Z(o.zMin));
    doc.line(X(o.xMax) + 1.5, Z(o.zMax), xd + 1.5, Z(o.zMax));
    doc.line(xd, Z(o.zMin), xd, Z(o.zMax));
    drawPdfDimTick(doc, xd, Z(o.zMin));
    drawPdfDimTick(doc, xd, Z(o.zMax));
    doc.text(`${fr2(o.d)} m`, xd + 2.2, (Z(o.zMin) + Z(o.zMax)) / 2, { angle: 90, align: 'center' });

    // Rose du Nord discrète en haut à droite du cadre
    if (typeof doc.circle === 'function') {
      const ncx = box.x + box.w - 9, ncy = box.y + 9;
      doc.setDrawColor('#1b2320').setLineWidth(0.24).circle(ncx, ncy, 4.2);
      doc.setFillColor('#1b2320');
      if (typeof doc.triangle === 'function') {
        doc.triangle(ncx, ncy - 3.6, ncx - 1.3, ncy + 1.4, ncx + 1.3, ncy + 1.4, 'F');
      }
      doc.setFont('helvetica', 'bold').setFontSize(5.5).setTextColor('#1b2320');
      doc.text('N', ncx, ncy - 4.8, { align: 'center' });
    }

    drawPdfGraphicScale(doc, box.x, box.y + box.h - 3.2, effK, shownDen, `${roof.typeLabel} · Surface couverture ${fr1(roof.roofArea)} m²`);
    return roof;
  }

  function drawSectionPDF(doc, data, box, denominatorOrOpts = 100, optionsArg = {}) {
    const isOpts4 = denominatorOrOpts && typeof denominatorOrOpts === 'object';
    const options = isOpts4 ? denominatorOrOpts : optionsArg;
    const rawDen = isOpts4 ? (options.denominator || 100) : denominatorOrOpts;
    const den = Number.isFinite(Number(rawDen)) && Number(rawDen) > 0 ? Number(rawDen) : 100;

    const sec = computeSection(data, options);
    if (!sec.valid) return sec;
    const targetK = 1000 / den;
    const spanU = Math.max(1, sec.uMax - sec.uMin);
    const spanY = Math.max(2, sec.maxY - sec.groundY);
    const effK = Math.min(targetK, (box.w - 34) / spanU, (box.h - 26) / spanY);
    const shownDen = effK < targetK * 0.96 ? Math.round(1000 / effK) : den;
    const ox = box.x + 22 + (box.w - 28 - spanU * effK) / 2;
    const oy = box.y + box.h - 15;
    const U = u => ox + (u - sec.uMin) * effK;
    const Y = y => oy - (y - sec.groundY) * effK;

    // Passe-partout technique sur fond papier ivoire
    doc.setFillColor('#fbfaf6').rect(box.x, box.y, box.w, box.h - 8, 'F');
    doc.setDrawColor('#d2cfc4').setLineWidth(0.22).rect(box.x, box.y, box.w, box.h - 8, 'S');

    // Sol naturel + hachures obliques discrètes
    const groundTop = Y(0);
    const groundH = Math.max(3, Y(sec.groundY) - groundTop);
    const gx0 = box.x + 18, gw = box.w - 22;
    doc.setFillColor('#e6dfd2').rect(gx0, groundTop, gw, groundH, 'F');
    doc.setDrawColor('#c8bfb0').setLineWidth(0.14);
    for (let hx = gx0 + 2; hx < gx0 + gw - 2; hx += 4.5) {
      doc.line(hx, groundTop + groundH, Math.min(gx0 + gw, hx + groundH * 0.8), groundTop + 0.3);
    }
    doc.setDrawColor('#1b2320').setLineWidth(0.5).line(gx0, groundTop, gx0 + gw, groundTop);

    // Toiture remplie (volume charpente) + axe de faîtage
    if (sec.roofProfile.length >= 3) {
      const pts = sec.roofProfile.map(p => [U(p[0]), Y(p[1])]);
      doc.setFillColor('#eae3d6').setDrawColor('#1b2320').setLineWidth(0.5);
      if (typeof doc.lines === 'function') {
        drawPdfPoly(doc, pts, 'FD');
      } else {
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          doc.line(a[0], a[1], b[0], b[1]);
        }
      }
      if (sec.roofProfile.length >= 4 && typeof doc.setLineDashPattern === 'function') {
        doc.setDrawColor('#8c6329').setLineWidth(0.22).setLineDashPattern([1.2, 1.0], 0);
        doc.line(U(sec.roofProfile[1][0]), Y(sec.roofProfile[0][1]), U(sec.roofProfile[1][0]), Y(sec.roofProfile[1][1]));
        doc.setLineDashPattern([], 0);
      }
    }

    // Ouvertures d'arrière-plan (teinte vitrage + cadre)
    doc.setFillColor('#dde8ed').setDrawColor('#5f6a63').setLineWidth(0.2);
    for (const op of sec.bgOpenings) {
      doc.rect(U(op.u0), Y(op.y1), Math.max(0.6, (op.u1 - op.u0) * effK), Math.max(0.6, (op.y1 - op.y0) * effK), 'FD');
    }

    // Dalles et murs coupés pochés
    doc.setFillColor('#1b2320');
    for (const slab of sec.slabs) {
      doc.rect(U(slab.u0), Y(slab.y1), (slab.u1 - slab.u0) * effK, Math.max(0.9, (slab.y1 - slab.y0) * effK), 'F');
    }
    for (const w of sec.cutWalls) {
      const pw = Math.max(0.9, w.thick * effK);
      doc.rect(U(w.u) - pw / 2, Y(w.y1), pw, Math.max(1, (w.y1 - w.y0) * effK), 'F');
    }

    // Pièces traversées
    doc.setFont('helvetica', 'bold').setFontSize(6.4).setTextColor('#1b2320');
    for (const rm of sec.cutRooms) {
      doc.text(String(rm.name || '').toUpperCase(), U(rm.uCenter), Y(rm.yMid), { align: 'center' });
    }

    // Repères de niveaux à gauche avec symbole altimétrique triangulaire
    for (const mk of sec.levelMarkers) {
      const ym = Y(mk.y);
      doc.setDrawColor('#b78a3c').setLineWidth(0.2);
      if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([1.0, 1.0], 0);
      doc.line(box.x + 3, ym, U(sec.uMin) - 2, ym);
      if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
      if (typeof doc.triangle === 'function') {
        doc.setFillColor('#b78a3c').triangle(box.x + 15.5, ym, box.x + 14.3, ym - 1.8, box.x + 16.7, ym - 1.8, 'F');
      }
      doc.setFont('helvetica', 'bold').setFontSize(6.0).setTextColor('#8c6329');
      doc.text(`${mk.label} m`, box.x + 3, ym - 1.1);
    }

    drawPdfGraphicScale(doc, box.x, box.y + box.h - 3.2, effK, shownDen, `${sec.label} · Coupe ${sec.axis === 'x' ? 'z' : 'x'}=${fr2(sec.cutPos)} m · HSP ${fr2(sec.wallH)} m`);
    return sec;
  }

  return {
    computeRoofPlan,
    computeSection,
    renderRoofPlanSVG,
    renderSectionSVG,
    drawRoofPlanPDF,
    drawSectionPDF
  };
})();

if (typeof module === 'object' && module.exports) module.exports = TechnicalDrawings;
