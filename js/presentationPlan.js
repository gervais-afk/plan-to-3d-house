/**
 * PLAN DE PRÉSENTATION 2D « STYLE PHOTOSHOP »
 * Dessiné au canvas à partir de HOUSE_DATA : sols texturés, mobilier vu de dessus avec ombres portées,
 * végétation, murs pochés avec ombre, menuiseries, cotes, nord et échelle.
 * Affiché au sol en début de scroll (état 0 %), il se dissout pendant l'élévation des murs.
 * Touche B : bascule plan de présentation / plan encre (blueprint).
 */
(function () {
  const P = HouseScene.prototype;
  const PPM = 100;            // pixels par mètre
  let X0 = -7, Z0 = -7, S = 14;
  // Emprise de la feuille calée sur le projet (carré, marge de 1,25 m autour des murs et des cotes)
  function computeExtent() {
    if (!window.HouseAuto) return;
    const bb = HouseAuto.bbox(HOUSE_DATA);
    S = Math.max(14, Math.ceil(bb.max + 2.5));
    X0 = bb.cx - S / 2;
    Z0 = bb.cz - S / 2;
  }

  // Générateur pseudo-aléatoire déterministe (le plan est identique à chaque chargement)
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  P.buildPresentationPlan = function (level = 0) {
    computeExtent();
    const targetLevel = Number(level) || 0;
    const onLevel = item => (Number(item?.level) || 0) === targetLevel;
    const N = S * PPM;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const X = x => (x - X0) * PPM, Z = z => (z - Z0) * PPM, L = m => m * PPM;
    const R = rng(42);
    const H = HOUSE_DATA;
    const levelRooms = (H.rooms || []).filter(onLevel);
    const levelWalls = (H.walls || []).filter(onLevel);
    const levelFurniture = (H.furniture || []).filter(onLevel);
    const levelColumns = (H.columns || []).filter(onLevel);
    const levelCanopies = (H.canopies || []).filter(onLevel);
    const levelDimensions = (H.dimensions || []).filter(onLevel);
    const levelDecor = (H.decor || []).filter(onLevel);

    const shadowOn = (blur = 0.12, off = 0.06, a = 0.35) => {
      g.shadowColor = `rgba(20,18,15,${a})`;
      g.shadowBlur = L(blur);
      g.shadowOffsetX = L(off);
      g.shadowOffsetY = L(off * 1.2);
    };
    const shadowOff = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = 0; };
    const rr = (x, y, w, h, r) => {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const pattern = (type) => {
      const b = this.getFloorTextureBase(type);
      const p = g.createPattern(b.tex.image, 'repeat');
      p.setTransform(new DOMMatrix().scale(L(b.meters) / b.tex.image.width));
      return p;
    };

    // ---- 1. Pelouse ----
    g.fillStyle = '#87a560';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 60; i++) {
      const x = R() * N, y = R() * N, r = L(0.6 + R() * 1.6);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const light = R() > 0.5;
      gr.addColorStop(0, light ? 'rgba(170,200,120,0.25)' : 'rgba(60,90,40,0.22)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = R() > 0.5 ? 'rgba(50,80,30,0.18)' : 'rgba(190,215,140,0.16)';
      g.fillRect(R() * N, R() * N, 1.5, 3);
    }

    // ---- 2. Allée d'entrée ----
    const ex = H.exterior;
    if (ex) {
      shadowOn(0.05, 0.02, 0.25);
      g.fillStyle = pattern('stone');
      g.fillRect(X(ex.path.xMin), Z(ex.path.zMin), L(ex.path.xMax - ex.path.xMin), L(ex.path.zMax - ex.path.zMin));
      shadowOff();
    }

    // ---- 3. Sols des pièces (filtrées strictement sur le niveau demandé) ----
    levelRooms.forEach(r => {
      const b = r.bounds;
      const shapePath = () => {
        g.beginPath();
        if (r.poly) r.poly.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))));
        else g.rect(X(b.xMin), Z(b.zMin), L(b.xMax - b.xMin), L(b.zMax - b.zMin));
        g.closePath();
      };
      g.fillStyle = pattern(r.floorType);
      shapePath();
      g.fill();
      // léger assombrissement en périphérie (ambiance)
      const cx = X(r.center.x), cz = Z(r.center.z), rad = L(Math.max(b.xMax - b.xMin, b.zMax - b.zMin) * 0.75);
      const gr = g.createRadialGradient(cx, cz, rad * 0.3, cx, cz, rad);
      gr.addColorStop(0, 'rgba(255,250,240,0.10)');
      gr.addColorStop(1, 'rgba(60,40,20,0.10)');
      g.fillStyle = gr;
      shapePath();
      g.fill();
    });

    // ---- 4. Haies ----
    if (ex) {
      ex.hedges.forEach(h => {
        const horiz = h.z !== undefined;
        const x0 = horiz ? h.xMin : h.x - 0.3, x1 = horiz ? h.xMax : h.x + 0.3;
        const z0 = horiz ? h.z - 0.3 : h.zMin, z1 = horiz ? h.z + 0.3 : h.zMax;
        if (x1 < X0 || x0 > X0 + S || z1 < Z0 || z0 > Z0 + S) return;
        shadowOn(0.15, 0.1, 0.4);
        g.fillStyle = '#4c6b35';
        rr(X(x0), Z(z0), L(x1 - x0), L(z1 - z0), L(0.25));
        g.fill();
        shadowOff();
        const len = horiz ? x1 - x0 : z1 - z0;
        for (let t = 0; t < len; t += 0.35) {
          const px = horiz ? x0 + t + 0.15 : h.x + (R() - 0.5) * 0.2;
          const pz = horiz ? h.z + (R() - 0.5) * 0.2 : z0 + t + 0.15;
          g.fillStyle = `rgba(${110 + R() * 30},${150 + R() * 30},${80 + R() * 20},0.35)`;
          g.beginPath();
          g.arc(X(px), Z(pz), L(0.16), 0, Math.PI * 2);
          g.fill();
        }
      });
    }

    // ---- 5. Mobilier vu de dessus (uniquement le niveau demandé) ----
    const skip = /Écran TV|Meuble haut/;
    const items = levelFurniture.filter(it => !skip.test(it.name || ''));
    const rug = items.find(it => /Tapis/.test(it.name));
    if (rug) {
      g.fillStyle = '#e9e1d3';
      g.fillRect(X(rug.x - rug.w / 2), Z(rug.z - rug.d / 2), L(rug.w), L(rug.d));
      g.strokeStyle = '#b9a98f';
      g.lineWidth = L(0.04);
      g.strokeRect(X(rug.x - rug.w / 2) + L(0.08), Z(rug.z - rug.d / 2) + L(0.08), L(rug.w - 0.16), L(rug.d - 0.16));
    }

    const drawItem = (it) => {
      const r = it.rotY || 0;
      const swap = it.dims !== 'local' && Math.abs(Math.sin(r)) > 0.5;
      const w = L(swap ? it.d : it.w), d = L(swap ? it.w : it.d);
      g.save();
      g.translate(X(it.x), Z(it.z));
      g.rotate(-r);
      const x = -w / 2, y = -d / 2; // repère local : arrière (dossier / tête) en haut (−y)
      const kind = it.model || '';
      const shade = (col, amt) => '#' + new THREE.Color(col).offsetHSL(0, 0, amt).getHexString();
      shadowOn(0.1, 0.05, 0.38);

      if (kind === 'sofa') {
        g.fillStyle = '#8c857d'; rr(x, y, w, d, L(0.08)); g.fill(); shadowOff();
        g.fillStyle = '#6f6962'; rr(x, y, w, L(0.2), L(0.06)); g.fill();
        rr(x, y, L(0.18), d, L(0.06)); g.fill(); rr(x + w - L(0.18), y, L(0.18), d, L(0.06)); g.fill();
        const n = w > L(1.5) ? 3 : 2, cw = (w - L(0.36)) / n;
        g.fillStyle = '#a39b92';
        for (let i = 0; i < n; i++) { rr(x + L(0.18) + i * cw + L(0.015), y + L(0.22), cw - L(0.03), d - L(0.26), L(0.05)); g.fill(); }
      } else if (kind === 'bed') {
        g.fillStyle = '#7a6250'; rr(x, y, w, d, L(0.04)); g.fill(); shadowOff();
        g.fillStyle = '#f7f4ef'; rr(x + L(0.04), y + L(0.04), w - L(0.08), d - L(0.08), L(0.04)); g.fill();
        g.fillStyle = '#cdbfa8'; rr(x + L(0.02), y + d * 0.36, w - L(0.04), d * 0.62, L(0.05)); g.fill();
        g.strokeStyle = 'rgba(90,70,50,0.35)'; g.lineWidth = L(0.02);
        g.beginPath(); g.moveTo(x + L(0.05), y + d * 0.44); g.lineTo(x + w - L(0.05), y + d * 0.44); g.stroke();
        g.fillStyle = '#ffffff';
        const pw = (w - L(0.24)) / 2;
        shadowOn(0.04, 0.015, 0.25);
        rr(x + L(0.08), y + L(0.1), pw, L(0.34), L(0.08)); g.fill();
        rr(x + w - L(0.08) - pw, y + L(0.1), pw, L(0.34), L(0.08)); g.fill();
      } else if (kind === 'chair') {
        g.fillStyle = '#6b4a35'; rr(x, y, w, d, L(0.06)); g.fill(); shadowOff();
        g.fillStyle = '#8a654a'; rr(x + L(0.05), y + L(0.09), w - L(0.1), d - L(0.13), L(0.05)); g.fill();
      } else if (kind === 'diningTable' || kind === 'coffeeTable' || kind === 'sideTable' || kind === 'terraceSet') {
        const grd = g.createLinearGradient(x, y, x + w, y + d);
        grd.addColorStop(0, kind === 'coffeeTable' ? '#cbb89b' : '#b08558');
        grd.addColorStop(1, kind === 'coffeeTable' ? '#a89276' : '#8a6440');
        g.fillStyle = grd;
        if (kind === 'terraceSet') { g.beginPath(); g.arc(0, 0, Math.min(w, d) * 0.3, 0, Math.PI * 2); g.fill(); }
        else { rr(x, y, w, d, L(0.03)); g.fill(); }
        shadowOff();
        if (kind !== 'terraceSet') {
          g.strokeStyle = 'rgba(70,45,25,0.18)'; g.lineWidth = 1;
          for (let k = 1; k < 9; k++) { g.beginPath(); g.moveTo(x + L(0.03), y + (d * k) / 9); g.lineTo(x + w - L(0.03), y + (d * k) / 9 + (R() - 0.5) * 4); g.stroke(); }
        } else {
          g.fillStyle = '#4a4540';
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; shadowOn(0.06, 0.03, 0.3); rr(Math.cos(a) * w * 0.36 - L(0.22), Math.sin(a) * d * 0.36 - L(0.22), L(0.44), L(0.44), L(0.08)); g.fill(); }
        }
      } else if (kind === 'toilet') {
        g.fillStyle = '#fbfbfa'; g.strokeStyle = '#9aa0a5'; g.lineWidth = L(0.015);
        g.beginPath(); g.ellipse(0, L(0.06), w * 0.42, d * 0.5, 0, 0, Math.PI * 2); g.fill(); shadowOff(); g.stroke();
        g.beginPath(); g.ellipse(0, L(0.08), w * 0.26, d * 0.32, 0, 0, Math.PI * 2); g.stroke();
      } else if (/Évier/.test(it.name)) {
        shadowOff();
        g.fillStyle = '#c3c8cc'; rr(x, y, w, d, L(0.05)); g.fill();
        g.fillStyle = '#9ea4a9'; rr(x + L(0.05), y + L(0.06), w - L(0.1), d - L(0.12), L(0.06)); g.fill();
      } else if (/Lave-mains/.test(it.name)) {
        g.fillStyle = '#fbfbfa'; rr(x, y, w, d, L(0.05)); g.fill(); shadowOff();
        g.strokeStyle = '#9aa0a5'; g.lineWidth = L(0.012);
        g.beginPath(); g.ellipse(0, 0, w * 0.32, d * 0.3, 0, 0, Math.PI * 2); g.stroke();
      } else {
        g.fillStyle = shade(it.color || '#cccccc', 0.04); rr(x, y, w, d, L(0.025)); g.fill(); shadowOff();
        g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = L(0.012); rr(x, y, w, d, L(0.025)); g.stroke();
        if (/Armoire|Dressing|Étagères/.test(it.name)) {
          g.save(); rr(x, y, w, d, 0); g.clip();
          g.strokeStyle = 'rgba(40,30,20,0.18)';
          for (let k = -d; k < w; k += L(0.12)) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + d, y + d); g.stroke(); }
          g.restore();
        }
      }
      g.restore();
    };
    items.filter(it => it !== rug).forEach(drawItem);

    // Plaque de cuisson : uniquement si un plan de travail / plaque existe réellement sur ce niveau
    const cooktop = levelFurniture.find(it => /plaque|cuisson|cuisini[eè]re/i.test(it.name || ''));
    if (cooktop) {
      g.strokeStyle = '#2c2e30'; g.lineWidth = L(0.015);
      const bx = cooktop.x, bz = cooktop.z;
      [[-0.13, -0.14], [0.13, -0.14], [-0.13, 0.14], [0.13, 0.14]].forEach(([dx, dz]) => {
        g.beginPath(); g.arc(X(bx + dx), Z(bz + dz), L(0.08), 0, Math.PI * 2); g.stroke();
      });
    }

    // Plantes en pot (décor du niveau uniquement)
    const plant = (x, z, rad) => {
      shadowOn(0.12, 0.08, 0.4);
      g.fillStyle = '#3f5f2c'; g.beginPath(); g.arc(X(x), Z(z), L(rad), 0, Math.PI * 2); g.fill(); shadowOff();
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2 + R() * 0.3, len = L(rad * (0.6 + R() * 0.4));
        g.fillStyle = `rgb(${70 + R() * 40},${115 + R() * 40},${50 + R() * 20})`;
        g.beginPath();
        g.ellipse(X(x) + Math.cos(a) * len * 0.5, Z(z) + Math.sin(a) * len * 0.5, len * 0.55, len * 0.2, a, 0, Math.PI * 2);
        g.fill();
      }
    };
    levelDecor.filter(d => /plant/i.test(d.model || '')).forEach(d => plant(d.x, d.z, (d.w || 0.5) * 0.55));

    // ---- 6. Murs pochés avec ombre portée (strictement sur le niveau demandé) ----
    const wallPath = new Path2D();
    const winRects = [];
    levelWalls.forEach(w => {
      const dx = (w.to[0] - w.from[0]) / w.length, dz = (w.to[1] - w.from[1]) / w.length;
      const nx = -dz * w.thick / 2, nz = dx * w.thick / 2;
      const quad = (s, e, list) => {
        const ax = w.from[0] + dx * s, az = w.from[1] + dz * s, bx = w.from[0] + dx * e, bz = w.from[1] + dz * e;
        const pts = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
        if (list) { list.push({ pts, w }); return; }
        wallPath.moveTo(X(pts[0][0]), Z(pts[0][1]));
        pts.slice(1).forEach(p => wallPath.lineTo(X(p[0]), Z(p[1])));
        wallPath.closePath();
      };
      let cursor = -w.thick / 2;
      w.openings.forEach(op => {
        const s = op.at - op.w / 2, e = op.at + op.w / 2;
        if (s > cursor) quad(cursor, s);
        if (op.type === 'window' || op.type === 'bay') quad(s, e, winRects);
        cursor = e;
      });
      if (w.length + w.thick / 2 > cursor) quad(cursor, w.length + w.thick / 2);
    });
    shadowOn(0.22, 0.1, 0.5);
    g.fillStyle = '#2b2a28';
    g.fill(wallPath);
    shadowOff();
    // Fenêtres : tableau clair + double trait de vitrage
    winRects.forEach(({ pts }) => {
      g.fillStyle = '#eef3f5';
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.closePath(); g.fill();
      g.strokeStyle = '#2b2a28'; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = '#5d9ac2'; g.lineWidth = 2;
      const m1 = [(pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2], m2 = [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2];
      g.beginPath(); g.moveTo(X(m1[0]), Z(m1[1])); g.lineTo(X(m2[0]), Z(m2[1])); g.stroke();
    });

    // Portes : arc de débattement + vantail (niveau demandé uniquement)
    levelWalls.forEach(w => {
      const dx = (w.to[0] - w.from[0]) / w.length, dz = (w.to[1] - w.from[1]) / w.length;
      const nx = -dz, nz = dx;
      w.openings.filter(op => op.type === 'door').forEach(op => {
        const sgn = op.hinge === 'end' ? -1 : 1, side = op.side || 1;
        const hx = op.hinge === 'end' ? op.at + op.w / 2 : op.at - op.w / 2;
        const hX = w.from[0] + dx * hx, hZ = w.from[1] + dz * hx;
        g.strokeStyle = 'rgba(30,30,30,0.75)'; g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const th = (i / 24) * Math.PI / 2;
          const vx = dx * sgn * Math.cos(th) + nx * side * Math.sin(th), vz = dz * sgn * Math.cos(th) + nz * side * Math.sin(th);
          const px = X(hX + vx * op.w), pz = Z(hZ + vz * op.w);
          i ? g.lineTo(px, pz) : g.moveTo(px, pz);
        }
        g.stroke();
        g.strokeStyle = '#2b2a28'; g.lineWidth = L(0.045);
        g.beginPath(); g.moveTo(X(hX), Z(hZ)); g.lineTo(X(hX + nx * side * op.w), Z(hZ + nz * side * op.w)); g.stroke();
      });
    });

    // Colonnes
    levelColumns.forEach(col => {
      shadowOn(0.15, 0.1, 0.5);
      g.fillStyle = '#e8e4dc'; g.fillRect(X(col.x - col.base / 2), Z(col.z - col.base / 2), L(col.base), L(col.base));
      shadowOff();
      g.fillStyle = '#2b2a28'; g.fillRect(X(col.x - col.size / 2), Z(col.z - col.size / 2), L(col.size), L(col.size));
    });

    // Pergola (lames) et projection de l'auvent (tirets)
    levelCanopies.forEach(cn => {
      if (cn.type === 'pergola') {
        g.fillStyle = 'rgba(70,52,36,0.55)';
        for (let x = cn.xMin + 0.15; x < cn.xMax - 0.1; x += cn.gap) g.fillRect(X(x - cn.slat / 2), Z(cn.zMin), L(cn.slat), L(cn.zMax - cn.zMin));
      } else {
        g.setLineDash([L(0.15), L(0.1)]);
        g.strokeStyle = 'rgba(40,40,40,0.7)'; g.lineWidth = 2;
        g.strokeRect(X(cn.xMin), Z(cn.zMin), L(cn.xMax - cn.xMin), L(cn.zMax - cn.zMin));
        g.setLineDash([]);
      }
    });

    // ---- 7. Arbres (houppiers au-dessus de tout) ----
    if (ex) ex.trees.forEach(([x, z, s]) => {
      const rad = 1.45 * s;
      if (x + rad < X0 || x - rad > X0 + S || z + rad < Z0 || z - rad > Z0 + S) return;
      shadowOn(0.5, 0.45, 0.45);
      const gr = g.createRadialGradient(X(x - rad * 0.3), Z(z - rad * 0.3), L(rad * 0.1), X(x), Z(z), L(rad));
      gr.addColorStop(0, '#8db35f'); gr.addColorStop(0.7, '#5d8a3c'); gr.addColorStop(1, '#3f6629');
      g.fillStyle = gr; g.beginPath(); g.arc(X(x), Z(z), L(rad), 0, Math.PI * 2); g.fill();
      shadowOff();
      for (let k = 0; k < 18; k++) {
        const a = R() * Math.PI * 2, d = R() * rad * 0.8;
        g.fillStyle = `rgba(${120 + R() * 50},${170 + R() * 40},${80 + R() * 30},0.35)`;
        g.beginPath(); g.arc(X(x + Math.cos(a) * d), Z(z + Math.sin(a) * d), L(rad * (0.15 + R() * 0.2)), 0, Math.PI * 2); g.fill();
      }
    });

    // ---- 8. Textes : pièces, cotes, nord, échelle ----
    const text = (str, x, y, size, weight = 700, color = '#1d252c', align = 'center') => {
      g.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      g.textAlign = align; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = size * 0.28; g.strokeText(str, x, y);
      g.fillStyle = color; g.fillText(str, x, y);
    };
    levelRooms.forEach(r => {
      const w = r.bounds.xMax - r.bounds.xMin;
      const size = L(Math.min(0.3, (w * 0.85) / (Math.max(1, (r.name || '').length) * 0.62)));
      let cz = r.center.z;
      if (r.id === 'living' && 1.25 > r.bounds.zMin + 0.4 && 1.25 < r.bounds.zMax - 0.4) cz = 1.25;
      if (r.id === 'dining' && 3.05 > r.bounds.zMin + 0.4 && 3.05 < r.bounds.zMax - 0.4) cz = 3.05;
      text(r.name, X(r.center.x), Z(cz) - size * 0.35, size);
      if (r.surface) text(r.surface, X(r.center.x), Z(cz) + size * 0.75, size * 0.62, 500, '#46525c');
    });

    g.strokeStyle = '#1d252c'; g.lineWidth = 1.5;
    levelDimensions.forEach(dm => {
      const ax = X(dm.from[0]), az = Z(dm.from[2]), bx = X(dm.to[0]), bz = Z(dm.to[2]);
      g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
      [[ax, az], [bx, bz]].forEach(([px, pz]) => { g.beginPath(); g.moveTo(px - 8, pz + 8); g.lineTo(px + 8, pz - 8); g.stroke(); });
      const vertical = Math.abs(bz - az) > Math.abs(bx - ax);
      g.save(); g.translate((ax + bx) / 2, (az + bz) / 2);
      if (vertical) g.rotate(-Math.PI / 2);
      text(dm.text, 0, -L(0.16), L(0.17), 600, '#1d252c');
      g.restore();
    });

    // Nord
    const nx = X(X0 + S - 0.75), nz = Z(Z0 + 0.75);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(nx, nz, L(0.42), 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1d252c'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#1d252c'; g.beginPath(); g.moveTo(nx, nz - L(0.32)); g.lineTo(nx + L(0.14), nz + L(0.2)); g.lineTo(nx, nz + L(0.08)); g.lineTo(nx - L(0.14), nz + L(0.2)); g.closePath(); g.fill();
    text('N', nx, nz - L(0.56), L(0.2));

    // Échelle graphique 0-1-2-3-5 m
    const sx = X(X0 + 0.3), sz = Z(Z0 + S - 0.35);
    [0, 1, 2, 3, 4].forEach(i => { g.fillStyle = i % 2 ? '#ffffff' : '#1d252c'; g.fillRect(sx + L(i), sz, L(1), L(0.1)); });
    g.strokeStyle = '#1d252c'; g.lineWidth = 1.5; g.strokeRect(sx, sz, L(5), L(0.1));
    [0, 1, 2, 3, 5].forEach(m => text(m + (m === 5 ? ' m' : ''), sx + L(m), sz - L(0.16), L(0.15), 600));
    const levelLabel = targetLevel === 0 ? 'PLAN DU REZ-DE-CHAUSSÉE' : `PLAN DE L’ÉTAGE R+${targetLevel}`;
    text(levelLabel, X(X0 + S - 0.25), Z(Z0 + S - 0.45), L(0.2), 800, '#1d252c', 'right');
    text(`Surface habitable ≈ ${Math.round(H.totals.habitable)} m²`, X(X0 + S - 0.25), Z(Z0 + S - 0.2), L(0.14), 500, '#46525c', 'right');

    return c;
  };

  P.createPresentationPlan = function () {
    this.presentationCanvas = this.buildPresentationPlan(0);
    const tex = new THREE.CanvasTexture(this.presentationCanvas);
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = this.maxAnisotropy;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(X0 + S / 2, 0.06, Z0 + S / 2);
    plane.renderOrder = 4;
    this.presentationPlan = plane;
    this.planStyle = 'render';
    this.scene.add(plane);
    this.setElevation(this.elevationProgress);
  };

  P.togglePlanStyle = function () {
    this.planStyle = this.planStyle === 'render' ? 'blueprint' : 'render';
    this.setElevation(this.elevationProgress);
    return this.planStyle;
  };

  const origInit = P.initRealism;
  P.initRealism = function () {
    origInit.call(this);
    this.createPresentationPlan();
  };

  const origSet = P.setElevation;
  P.setElevation = function (p) {
    origSet.call(this, p);
    if (!this.presentationPlan) return;
    const e = this.elevationProgress;
    const t = Math.max(0, Math.min(1, e / 0.3));
    const a = this.planStyle === 'render' ? 1 - t * t * (3 - 2 * t) : 0;
    this.presentationPlan.visible = a > 0.01;
    this.presentationPlan.material.opacity = a;
    if (this.planStyle === 'render') {
      this.annotationGroup.visible = false; // le plan de présentation porte ses propres textes
      if (this.blueprintGrid) this.blueprintGrid.visible = false;
    }
  };
})();
