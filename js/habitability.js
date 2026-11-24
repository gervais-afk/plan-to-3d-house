/**
 * Repères d'habitabilité indicatifs, vérifiés en continu dans l'éditeur.
 * Ce sont des recommandations courantes (non une réglementation camerounaise citée) : elles avertissent,
 * elles ne bloquent jamais l'architecte. Valeurs relevées lors de la recherche NotebookLM (novembre 2026).
 *  - porte extérieure d'au moins 0,90 m de passage ;
 *  - hauteur sous plafond d'au moins 2,40 m ;
 *  - pièce de vie : surface vitrée d'au moins 10 % de la surface au sol ;
 *  - pièce d'eau ou cuisine : au moins une fenêtre (sinon prévoir une ventilation mécanique).
 */
const Habitability = (() => {
  const RULES = { doorMin: 0.9, ceilingMin: 2.4, glazingMin: 0.10 };
  const plain = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isCirculation = name => /\b(hall|degagement|couloir|circulation|entree|placard|dressing|cellier|magasin|rangement|buanderie|garage|local)\b/.test(name);
  const isWet = name => /\b(wc|toilettes?|salle d.?eau|sdb|salle de bains?|bains?|douche|cuisine|kitchenette)\b/.test(name);

  function outline(room) {
    if (Array.isArray(room.poly) && room.poly.length >= 3) return room.poly;
    const b = room.bounds;
    return [[b.xMin, b.zMin], [b.xMax, b.zMin], [b.xMax, b.zMax], [b.xMin, b.zMax]];
  }
  function area(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; sum += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(sum) / 2;
  }
  function distanceToSegment([px, pz], [ax, az], [bx, bz]) {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  }
  /** Une ouverture éclaire une pièce si son centre est sur le contour de la pièce (à l'épaisseur du mur près). */
  function onOutline(point, points, tolerance) {
    return points.some((p, i) => distanceToSegment(point, p, points[(i + 1) % points.length]) <= tolerance);
  }

  /** Liste d'avertissements { code, message, target, level } ; target est l'objet du projet concerné. */
  function check(project) {
    const warnings = [];
    const walls = Array.isArray(project?.walls) ? project.walls : [];
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const ceiling = Number(project?.config?.wallHeight) || 2.8;
    if (ceiling < RULES.ceilingMin) {
      warnings.push({ code: 'hauteur', level: 0, target: null, message: `Hauteur sous plafond de ${ceiling.toFixed(2).replace('.', ',')} m : moins de 2,40 m recommandés.` });
    }
    const openings = [];
    for (const wall of walls) {
      if (!Array.isArray(wall?.from) || !Array.isArray(wall?.to)) continue;
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      if (!length) continue;
      for (const op of Array.isArray(wall.openings) ? wall.openings : []) {
        const at = Number.isFinite(op.at) ? op.at : (op.pos ?? 0.5) * length;
        const point = [wall.from[0] + (wall.to[0] - wall.from[0]) * at / length, wall.from[1] + (wall.to[1] - wall.from[1]) * at / length];
        const level = Number(op.level ?? wall.level) || 0;
        openings.push({ op, wall, point, level, tolerance: (Number(wall.thick) || 0.2) / 2 + 0.12 });
        if (op.type === 'door' && wall.type === 'ext' && Number(op.w) < RULES.doorMin) {
          warnings.push({ code: 'porte', level, target: { kind: 'opening', obj: op, wall },
            message: `Porte extérieure de ${Number(op.w).toFixed(2).replace('.', ',')} m : au moins 0,90 m de passage recommandés.` });
        }
      }
    }
    for (const room of rooms) {
      if (!room?.bounds && !Array.isArray(room?.poly)) continue;
      const name = plain(room.name);
      const level = Number(room.level) || 0;
      const points = outline(room);
      const surface = area(points);
      const lit = openings.filter(o => o.level === level && onOutline(o.point, points, o.tolerance));
      const glazing = lit.filter(o => o.op.type === 'window' || o.op.type === 'bay').reduce((sum, o) => sum + (Number(o.op.w) || 0) * (Number(o.op.h) || 1.25), 0);
      const label = room.name || 'Pièce';
      if (room.habitable && !isCirculation(name) && !isWet(name) && surface > 0 && glazing / surface < RULES.glazingMin) {
        warnings.push({ code: 'lumiere', level, target: { kind: 'room', obj: room },
          message: `${label} : ${(Math.floor(glazing / surface * 1000) / 10).toLocaleString('fr-FR')} % de surface vitrée pour ${surface.toFixed(1).replace('.', ',')} m² (10 % recommandés).` });
      }
      if (isWet(name) && !lit.some(o => o.op.type === 'window' || o.op.type === 'bay')) {
        warnings.push({ code: 'ventilation', level, target: { kind: 'room', obj: room },
          message: `${label} : aucune fenêtre ; prévoir une ventilation mécanique.` });
      }
    }
    return warnings;
  }

  return { RULES, check };
})();

if (typeof module !== 'undefined') module.exports = Habitability;
