/**
 * ArchiCam AI — Moteur de Conception & d'Optimisation Architecturale (aiDesignEngine.js)
 * 1. Brief texte -> Plan 2D/3D complet, étanche et proportionné (Gemini + synthétiseur déterministe)
 * 2. Modification du plan en langage naturel (patch géométrique validé et réversible Ctrl+Z)
 * 3. Correction automatique PMR / RE2020 / Habitabilité
 * 4. Rédaction du Parti architectural, Sous-titre & Description d'agence
 * 5. Génération de Variantes A / B chiffrées (Éco / Standard vs Standing Bioclimatique)
 */

const round2 = n => Math.round(Number(n || 0) * 100) / 100;
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

function cleanText(value, maxLen = 200) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, maxLen)
    : '';
}

function slugify(value) {
  return String(value || 'nouveau-projet')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'nouveau-projet';
}

function wallLength(w) {
  if (!w || !Array.isArray(w.from) || !Array.isArray(w.to)) return 0;
  return Math.hypot((Number(w.to[0]) || 0) - (Number(w.from[0]) || 0), (Number(w.to[1]) || 0) - (Number(w.from[1]) || 0));
}

function roomArea(r) {
  if (!r) return 0;
  if (Number.isFinite(Number(r.area)) && Number(r.area) > 0) return Number(r.area);
  if (r.bounds) {
    return Math.max(0, (Number(r.bounds.xMax) || 0) - (Number(r.bounds.xMin) || 0)) *
      Math.max(0, (Number(r.bounds.zMax) || 0) - (Number(r.bounds.zMin) || 0));
  }
  return 0;
}

function computeModelBounds(project) {
  const xs = [];
  const zs = [];
  for (const w of project?.walls || []) {
    if (Array.isArray(w.from)) { xs.push(Number(w.from[0]) || 0); zs.push(Number(w.from[1]) || 0); }
    if (Array.isArray(w.to)) { xs.push(Number(w.to[0]) || 0); zs.push(Number(w.to[1]) || 0); }
  }
  for (const r of project?.rooms || []) {
    if (r?.bounds) {
      xs.push(Number(r.bounds.xMin) || 0, Number(r.bounds.xMax) || 0);
      zs.push(Number(r.bounds.zMin) || 0, Number(r.bounds.zMax) || 0);
    }
  }
  if (!xs.length) return { xMin: 0, xMax: 12, zMin: 0, zMax: 9 };
  return {
    xMin: round2(Math.min(...xs)),
    xMax: round2(Math.max(...xs)),
    zMin: round2(Math.min(...zs)),
    zMax: round2(Math.max(...zs))
  };
}

// ============================================================================
// 1. BRIEF TEXTE -> PLAN 2D/3D COMPLET (Étanche, PMR & RE2020 natifs)
// ============================================================================
function parseProgramFromBrief(brief) {
  const txt = String(brief || '');
  const low = txt.toLowerCase();

  const areaMatch = /(\d{2,4})\s*(?:m2|m²|metres?\s*carr)/i.exec(txt);
  const targetArea = clamp(areaMatch ? Number(areaMatch[1]) : 135, 36, 420);

  const bedMatch = /(\d)\s*(?:chambre|ch\b|suite)/i.exec(low);
  let bedrooms = bedMatch ? clamp(Number(bedMatch[1]), 1, 5) : (targetArea >= 165 ? 4 : targetArea >= 110 ? 3 : targetArea >= 65 ? 2 : 1);

  const isR1 = /\br\s*\+\s*1\b|étage|etage|duplex|2\s*niveaux/i.test(low) || targetArea >= 200;
  const hasVeranda = !/sans\s*(?:véranda|veranda|terrasse)/i.test(low);
  const hasOffice = /bureau|télétravail|teletravail|atelier/i.test(low);
  const hasSuite = /suite\s*parentale|parentale/i.test(low) || bedrooms >= 3;

  const heightMatch = /hauteur[^0-9]{0,20}(\d(?:[.,]\d{1,2})?)\s*m/i.exec(low);
  const wallHeight = heightMatch ? clamp(Number(heightMatch[1].replace(',', '.')), 2.4, 4.5) : 2.9;

  const cityMatch = /\b(yaound[eé]|douala|abidjan|dakar|kribi|bafoussam|libreville|lom[eé]|cotonou|paris|lyon|bordeaux|marseille|toulouse|nantes)\b/i.exec(txt);
  const city = cityMatch ? cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1) : '';

  const roofStyle = /toit\s*plat|toiture\s*terrasse|contemporain/i.test(low) ? 'flat' : 'hip';

  return { targetArea, bedrooms, isR1, hasVeranda, hasOffice, hasSuite, wallHeight, city, roofStyle };
}

function buildSynthesizedPlan(program, aiHints = null) {
  const { targetArea, bedrooms, isR1, hasVeranda, hasOffice, hasSuite, wallHeight, city, roofStyle } = program;
  const footprint = isR1 ? clamp(targetArea * 0.56, 68, 220) : clamp(targetArea, 36, 230);
  const ratio = 1.38;
  const W = round2(clamp(Math.sqrt(footprint * ratio), 7.2, 18.0));
  const D = round2(clamp(footprint / W, 5.4, 13.0));

  const xSplit = round2(W * 0.52); // Zone jour à gauche, zone nuit à droite
  const zDaySplit = round2(D * 0.62); // Séjour devant, cuisine/service derrière

  const walls = [];
  const rooms = [];
  const furniture = [];
  const canopies = [];
  const columns = [];
  const stairwells = [];

  const addRoom = (id, name, xMin, xMax, zMin, zMax, floorType, habitable = true, level = 0, desc = '') => {
    const b = { xMin: round2(xMin), xMax: round2(xMax), zMin: round2(zMin), zMax: round2(zMax) };
    const area = round2(Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin));
    rooms.push({ id, name, level, bounds: b, area, floorType, habitable, desc });
    return { id, bounds: b, area };
  };

  // --- REZ-DE-CHAUSSÉE : Enveloppe extérieure avec baies RE2020 + porte d'entrée PMR (1.0 m) ---
  const southDayWinW = round2(clamp((xSplit - 1.2) * 0.52, 1.8, 3.6));
  const southNightWinW = round2(clamp((W - xSplit - 1.2) * 0.45, 1.4, 2.4));
  walls.push({
    from: [0, D], to: [W, D], thick: 0.25, type: 'ext', level: 0,
    openings: [
      { type: 'bay', at: round2(xSplit * 0.46), w: southDayWinW, h: 2.15, sill: 0.05, level: 0 },
      { type: 'door', at: round2(xSplit + 0.85), w: 1.0, h: 2.15, level: 0 },
      { type: 'window', at: round2(xSplit + (W - xSplit) * 0.68), w: southNightWinW, h: 1.4, sill: 0.9, level: 0 }
    ]
  });
  walls.push({
    from: [0, 0], to: [W, 0], thick: 0.25, type: 'ext', level: 0,
    openings: [
      { type: 'window', at: round2(xSplit * 0.48), w: round2(clamp(xSplit * 0.36, 1.4, 2.4)), h: 1.35, sill: 0.95, level: 0 },
      { type: 'window', at: round2(xSplit + (W - xSplit) * 0.56), w: round2(clamp((W - xSplit) * 0.36, 1.3, 2.2)), h: 1.35, sill: 0.95, level: 0 }
    ]
  });
  walls.push({
    from: [0, 0], to: [0, D], thick: 0.25, type: 'ext', level: 0,
    openings: [
      { type: 'window', at: round2(zDaySplit * 0.5), w: 1.4, h: 1.35, sill: 0.95, level: 0 },
      { type: 'bay', at: round2(zDaySplit + (D - zDaySplit) * 0.52), w: round2(clamp((D - zDaySplit) * 0.5, 1.5, 2.6)), h: 2.1, sill: 0.05, level: 0 }
    ]
  });
  walls.push({
    from: [W, 0], to: [W, D], thick: 0.25, type: 'ext', level: 0,
    openings: [
      { type: 'window', at: round2(D * 0.28), w: 1.3, h: 1.35, sill: 0.95, level: 0 },
      { type: 'window', at: round2(D * 0.72), w: 1.3, h: 1.35, sill: 0.95, level: 0 }
    ]
  });

  // Cloison principale séparant zone jour (x < xSplit) et zone nuit/dégagement (x > xSplit)
  walls.push({
    from: [xSplit, 0], to: [xSplit, D], thick: 0.15, type: 'int', level: 0,
    openings: [
      { type: 'open', at: round2(D * 0.55), w: 1.35, h: 2.2, level: 0 }
    ]
  });

  // Séparation cuisine / séjour (passage large ouvert)
  walls.push({
    from: [0, zDaySplit], to: [xSplit, zDaySplit], thick: 0.15, type: 'int', level: 0,
    openings: [
      { type: 'open', at: round2(xSplit * 0.55), w: round2(clamp(xSplit * 0.42, 1.4, 2.8)), h: 2.2, level: 0 }
    ]
  });

  // Pièces Zone Jour RDC
  const rSejour = addRoom('sejour', aiHints?.livingName || 'Séjour & Salle à manger', 0, xSplit, zDaySplit, D, 'parquet', true, 0, 'Espace de vie traversant ouvert sur la galerie.');
  const rCuisine = addRoom('cuisine', 'Cuisine ouverte', 0, xSplit, 0, zDaySplit, 'tile', true, 0, 'Cuisine ventilée avec accès direct au séjour.');

  // Pièces Zone Nuit RDC (couloir de 1.30 m + 1 ou 2 chambres + SDB)
  const hallW = round2(clamp(1.35, 1.25, (W - xSplit) * 0.26));
  const xNight = round2(xSplit + hallW);
  const zMidNight = round2(D * 0.52);
  const zBath = round2(clamp(D * 0.24, 1.8, 2.6));

  walls.push({
    from: [xNight, 0], to: [xNight, D], thick: 0.15, type: 'int', level: 0,
    openings: [
      { type: 'door', at: round2(zBath * 0.5), w: 0.9, h: 2.05, level: 0 },
      { type: 'door', at: round2(zBath + (zMidNight - zBath) * 0.5), w: 0.9, h: 2.05, level: 0 },
      { type: 'door', at: round2(zMidNight + (D - zMidNight) * 0.45), w: 0.9, h: 2.05, level: 0 }
    ]
  });
  walls.push({ from: [xNight, zBath], to: [W, zBath], thick: 0.15, type: 'int', level: 0, openings: [] });
  walls.push({ from: [xNight, zMidNight], to: [W, zMidNight], thick: 0.15, type: 'int', level: 0, openings: [] });

  addRoom('degagement', 'Entrée & Dégagement', xSplit, xNight, 0, D, 'tile', true, 0, 'Distribution fluide ≥ 1,25 m PMR.');
  addRoom('sdb-rdc', 'Salle d’eau', xNight, W, 0, zBath, 'tile', true, 0, 'Salle d’eau ventilée.');

  const rdcRoom2Name = hasOffice && !isR1 && bedrooms <= 2 ? 'Bureau / Chambre d’amis' : (hasSuite ? 'Suite parentale' : 'Chambre 1');
  const rCh1 = addRoom('chambre-1', rdcRoom2Name, xNight, W, zMidNight, D, 'parquet', true, 0, 'Chambre principale lumineuse.');
  const rCh2 = addRoom('chambre-2', hasOffice && bedrooms < 3 ? 'Bureau' : 'Chambre 2', xNight, W, zBath, zMidNight, 'parquet', true, 0, 'Pièce calme orientée jardin.');

  // Véranda / Galerie couverte au sud
  if (hasVeranda) {
    const vDepth = round2(clamp(D * 0.28, 2.2, 3.2));
    addRoom('veranda', 'Véranda couverte', 0, xSplit, D, round2(D + vDepth), 'terrace', false, 0, 'Galerie bioclimatique protégeant les baies du séjour.');
    canopies.push({
      id: 'canopy-veranda',
      name: 'Auvent véranda',
      level: 0,
      x: round2(xSplit / 2),
      z: round2(D + vDepth / 2),
      w: round2(xSplit),
      d: vDepth,
      y: round2(wallHeight - 0.1)
    });
    columns.push(
      { id: 'col-1', level: 0, x: 0.2, z: round2(D + vDepth - 0.2), r: 0.15 },
      { id: 'col-2', level: 0, x: round2(xSplit / 2), z: round2(D + vDepth - 0.2), r: 0.15 },
      { id: 'col-3', level: 0, x: round2(xSplit - 0.2), z: round2(D + vDepth - 0.2), r: 0.15 }
    );
  }

  // Mobilier essentiel placé proprement au centre des pièces
  const cx = r => round2((r.bounds.xMin + r.bounds.xMax) / 2);
  const cz = r => round2((r.bounds.zMin + r.bounds.zMax) / 2);
  furniture.push(
    { id: 'f-sofa', kind: 'sofa', label: 'Canapé', level: 0, x: cx(rSejour), z: round2(cz(rSejour) - 0.3), w: 2.2, d: 0.9, h: 0.85, rotY: 0, dims: 'local' },
    { id: 'f-table', kind: 'table', label: 'Table séjour', level: 0, x: cx(rSejour), z: round2(cz(rSejour) + 0.85), w: 1.5, d: 0.85, h: 0.75, rotY: 0, dims: 'local' },
    { id: 'f-kitchen', kind: 'counter', label: 'Plan cuisine', level: 0, x: cx(rCuisine), z: round2(rCuisine.bounds.zMin + 0.55), w: round2(clamp(xSplit - 1.2, 1.8, 3.2)), d: 0.65, h: 0.9, rotY: 0, dims: 'local' },
    { id: 'f-bed1', kind: 'bed', label: 'Lit double', level: 0, x: cx(rCh1), z: cz(rCh1), w: 1.8, d: 2.0, h: 0.55, rotY: 0, dims: 'local' },
    { id: 'f-bed2', kind: 'bed', label: 'Lit', level: 0, x: cx(rCh2), z: cz(rCh2), w: 1.4, d: 1.9, h: 0.55, rotY: 0, dims: 'local' }
  );

  // --- ÉTAGE R+1 SI PROGRAMME R+1 ---
  if (isR1) {
    const zR1Split = round2(D * 0.5);
    walls.push(
      { from: [0, 0], to: [W, 0], thick: 0.25, type: 'ext', level: 1, openings: [{ type: 'window', at: round2(W * 0.28), w: 1.6, h: 1.35, sill: 0.95, level: 1 }, { type: 'window', at: round2(W * 0.74), w: 1.6, h: 1.35, sill: 0.95, level: 1 }] },
      { from: [0, D], to: [W, D], thick: 0.25, type: 'ext', level: 1, openings: [{ type: 'bay', at: round2(W * 0.3), w: 2.2, h: 2.1, sill: 0.05, level: 1 }, { type: 'window', at: round2(W * 0.72), w: 1.6, h: 1.35, sill: 0.95, level: 1 }] },
      { from: [0, 0], to: [0, D], thick: 0.25, type: 'ext', level: 1, openings: [{ type: 'window', at: round2(D * 0.5), w: 1.4, h: 1.35, sill: 0.95, level: 1 }] },
      { from: [W, 0], to: [W, D], thick: 0.25, type: 'ext', level: 1, openings: [{ type: 'window', at: round2(D * 0.5), w: 1.4, h: 1.35, sill: 0.95, level: 1 }] },
      { from: [xSplit, 0], to: [xSplit, D], thick: 0.15, type: 'int', level: 1, openings: [{ type: 'door', at: round2(D * 0.25), w: 0.9, h: 2.05, level: 1 }, { type: 'door', at: round2(D * 0.75), w: 0.9, h: 2.05, level: 1 }] },
      { from: [0, zR1Split], to: [xSplit, zR1Split], thick: 0.15, type: 'int', level: 1, openings: [{ type: 'door', at: round2(xSplit * 0.75), w: 0.9, h: 2.05, level: 1 }] },
      { from: [xSplit, zR1Split], to: [W, zR1Split], thick: 0.15, type: 'int', level: 1, openings: [] }
    );
    const rMaster = addRoom('suite-r1', 'Suite parentale R+1', 0, xSplit, zR1Split, D, 'parquet', true, 1, 'Suite lumineuse avec vue dégagée.');
    addRoom('chambre-3', 'Chambre 3', 0, xSplit, 0, zR1Split, 'parquet', true, 1, 'Chambre d’étage.');
    addRoom('chambre-4', bedrooms >= 4 ? 'Chambre 4' : 'Salon privé / Bureau', xSplit, W, zR1Split, D, 'parquet', true, 1, 'Espace polyvalent à l’étage.');
    addRoom('sdb-r1', 'Salle de bain R+1', xSplit, W, 0, zR1Split, 'tile', true, 1, 'Salle de bain familiale.');
    stairwells.push({ id: 'stair-1', level: 1, bounds: { xMin: round2(xSplit - 1.1), xMax: round2(xSplit), zMin: round2(zR1Split - 1.4), zMax: round2(zR1Split + 1.4) } });
    furniture.push({ id: 'f-bed-r1', kind: 'bed', label: 'Lit suite R+1', level: 1, x: cx(rMaster), z: cz(rMaster), w: 2.0, d: 2.0, h: 0.55, rotY: 0, dims: 'local' });
  }

  const habitableM2 = round2(rooms.filter(r => r.habitable !== false).reduce((s, r) => s + r.area, 0));
  const projectName = cleanText(aiHints?.name || (isR1 ? `Villa R+1 ${Math.round(habitableM2)} m²` : `Villa ${Math.round(habitableM2)} m²`), 80);
  const subtitle = cleanText(aiHints?.subtitle || `${isR1 ? 'Résidence R+1' : 'Maison de plain-pied'} · ${bedrooms} chambres${hasVeranda ? ' & véranda bioclimatique' : ''}`, 120);
  const parti = cleanText(aiHints?.parti || `Architecture contemporaine articulée autour d’un séjour traversant et d’une distribution fluide conforme aux repères PMR, protégée par une galerie ombragée favorisant la ventilation naturelle.`, 400);
  const description = cleanText(aiHints?.description || `Avant-projet généré à partir du programme (${Math.round(habitableM2)} m² habitables${city ? ` à ${city}` : ''}). Cloisons orthogonales, ouvertures dimensionnées pour la lumière naturelle et circulation optimisée.`, 500);

  const project = {
    meta: {
      name: projectName,
      slug: slugify(projectName),
      subtitle,
      description,
      parti,
      location: city,
      client: '',
      clientVisible: false,
      architect: '',
      agency: '',
      phase: '',
      revision: '',
      issueDate: ''
    },
    config: {
      wallHeight,
      floorHeight: round2(wallHeight + 0.25),
      roofStyle
    },
    walls,
    rooms,
    columns,
    canopies,
    stairwells,
    furniture
  };

  const annexM2 = round2(rooms.filter(r => r.habitable === false).reduce((s, r) => s + r.area, 0));
  const openingsCount = walls.reduce((s, w) => s + (Array.isArray(w.openings) ? w.openings.length : 0), 0);

  return {
    project,
    summary: {
      name: projectName,
      width: W,
      depth: D,
      habitableM2,
      annexM2,
      roomsCount: rooms.length,
      wallsCount: walls.length,
      walls: walls.length,
      openings: openingsCount,
      floors: isR1 ? 2 : 1,
      wallHeight,
      city
    }
  };
}

async function generatePlanFromBrief(brief, { geminiClient = null, rootDir = __dirname } = {}) {
  const cleanBrief = cleanText(brief, 1200);
  if (!cleanBrief) throw Object.assign(new Error('Décrivez votre programme architectural (surface, pièces, style…).'), { status: 400 });

  const program = parseProgramFromBrief(cleanBrief);
  let aiHints = null;
  let source = 'engine';

  if (geminiClient && typeof geminiClient.isConfigured === 'function' && geminiClient.isConfigured(rootDir)) {
    try {
      const res = await geminiClient.generateText({
        systemInstruction: 'Tu es un architecte DPLG. Retourne UNIQUEMENT un JSON valide (sans markdown) avec les clés : name (nom sobre du projet, <=60 car), subtitle (<=110 car), parti (parti architectural en français, <=360 car), description (notice courte, <=450 car), livingName (nom de la pièce de vie).',
        prompt: `Programme demandé par l’architecte : ${cleanBrief}\nRepères détectés : ${program.targetArea} m², ${program.bedrooms} chambres, ${program.isR1 ? 'R+1' : 'plain-pied'}${program.city ? `, ville : ${program.city}` : ''}.`,
        responseMimeType: 'application/json'
      });
      const parsed = JSON.parse(String(res.text || '').replace(/^```json\s*|\s*```$/g, '').trim());
      if (parsed && typeof parsed === 'object') {
        aiHints = parsed;
        source = 'gemini+engine';
      }
    } catch { /* repli propre sur le synthétiseur déterministe */ }
  }

  const built = buildSynthesizedPlan(program, aiHints);
  return { ok: true, source, program, ...built };
}

// ============================================================================
// 2. MODIFICATION DU PLAN EN LANGAGE NATUREL (PATCH GÉOMÉTRIQUE SÛR)
// ============================================================================
function applyPatchOperations(project, ops) {
  const next = JSON.parse(JSON.stringify(project || {}));
  if (!next.config || typeof next.config !== 'object') next.config = { wallHeight: 2.8, floorHeight: 3.0 };
  if (!next.meta || typeof next.meta !== 'object') next.meta = {};
  if (!Array.isArray(next.walls)) next.walls = [];
  if (!Array.isArray(next.rooms)) next.rooms = [];
  if (!Array.isArray(next.canopies)) next.canopies = [];
  if (!Array.isArray(next.columns)) next.columns = [];
  if (!Array.isArray(next.furniture)) next.furniture = [];

  const changes = [];
  const bounds = computeModelBounds(next);

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    switch (op.type) {
      case 'set_wall_height': {
        const h = round2(clamp(op.value, 2.2, 5.5));
        const prev = Number(next.config.wallHeight) || 2.8;
        next.config.wallHeight = h;
        next.config.floorHeight = round2(Math.max(h + 0.2, Number(next.config.floorHeight) || (h + 0.25)));
        changes.push(`Hauteur sous plafond ajustée : ${prev.toFixed(2)} m → ${h.toFixed(2)} m.`);
        break;
      }
      case 'set_roof_style': {
        if (['hip', 'flat', 'none'].includes(op.value)) {
          next.config.roofStyle = op.value;
          const labels = { hip: 'Toiture à pans', flat: 'Toiture terrasse plate', none: 'Sans toiture' };
          changes.push(`Style de toiture réglé sur : ${labels[op.value]}.`);
        }
        break;
      }
      case 'add_canopy':
      case 'add_pergola': {
        const w = round2(clamp(op.w || 4.0, 1.5, Math.max(4, bounds.xMax - bounds.xMin)));
        const d = round2(clamp(op.d || 3.0, 1.5, 6.0));
        const x = round2((bounds.xMin + bounds.xMax) / 2);
        const z = round2(bounds.zMax + d / 2);
        const isPergola = op.type === 'add_pergola';
        next.canopies.push({
          id: `${isPergola ? 'pergola' : 'canopy'}-${Date.now().toString(36)}`,
          name: isPergola ? 'Pergola bioclimatique' : 'Auvent / Terrasse couverte',
          kind: isPergola ? 'pergola' : 'slab',
          level: 0,
          x,
          z,
          w,
          d,
          y: round2((Number(next.config.wallHeight) || 2.8) - 0.1)
        });
        next.rooms.push({
          id: `terrasse-${Date.now().toString(36)}`,
          name: isPergola ? 'Terrasse sous pergola' : 'Terrasse couverte',
          level: 0,
          bounds: { xMin: round2(x - w / 2), xMax: round2(x + w / 2), zMin: bounds.zMax, zMax: round2(bounds.zMax + d) },
          area: round2(w * d),
          floorType: 'terrace',
          habitable: false,
          desc: 'Extension extérieure ajoutée par ArchiCam AI.'
        });
        changes.push(`${isPergola ? 'Pergola' : 'Auvent / terrasse couverte'} ajouté(e) en façade sud (${w.toFixed(2)} × ${d.toFixed(2)} m, ${round2(w * d)} m²).`);
        break;
      }
      case 'widen_doors': {
        const targetW = round2(clamp(op.value || 0.9, 0.8, 1.4));
        let count = 0;
        for (const w of next.walls) {
          const L = wallLength(w);
          for (const o of w.openings || []) {
            if (o.type === 'door' && (Number(o.w) || 0.8) < targetW) {
              const safeW = round2(Math.min(targetW, Math.max(0.7, L - 0.3)));
              if (safeW > (Number(o.w) || 0)) {
                o.w = safeW;
                count += 1;
              }
            }
          }
        }
        if (count) changes.push(`${count} porte(s) élargie(s) à ${targetW.toFixed(2)} m.`);
        break;
      }
      case 'enlarge_windows': {
        const factor = clamp(op.factor || 1.2, 1.05, 1.6);
        let count = 0;
        for (const w of next.walls) {
          const L = wallLength(w);
          const opsList = w.openings || [];
          const maxEach = opsList.length ? Math.max(0.8, (L - 0.4 * (opsList.length + 1)) / opsList.length) : L - 0.6;
          for (const o of opsList) {
            if (o.type === 'window' || o.type === 'bay') {
              const curW = Number(o.w) || 1.2;
              const nextW = round2(Math.min(curW * factor, maxEach, 3.8));
              if (nextW > curW + 0.02) {
                o.w = nextW;
                count += 1;
              }
            }
          }
        }
        if (count) changes.push(`${count} baie(s) / fenêtre(s) agrandie(s) (+${Math.round((factor - 1) * 100)} %).`);
        break;
      }
      case 'rename_room': {
        const fromLow = cleanText(op.from, 60).toLowerCase();
        const toName = cleanText(op.to, 60);
        if (fromLow && toName) {
          const room = next.rooms.find(r => String(r.name || '').toLowerCase().includes(fromLow));
          if (room) {
            const old = room.name;
            room.name = toName;
            changes.push(`Pièce renommée : « ${old} » → « ${toName} ».`);
          }
        }
        break;
      }
      case 'update_meta': {
        for (const key of ['subtitle', 'parti', 'description']) {
          if (typeof op[key] === 'string' && op[key].trim()) {
            next.meta[key] = cleanText(op[key], key === 'subtitle' ? 140 : 500);
            changes.push(`Champ dossier mis à jour : ${key}.`);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return { patchedProject: next, changes };
}

function parseDeterministicPatchOps(instruction) {
  const txt = String(instruction || '');
  const low = txt.toLowerCase();
  const ops = [];

  // Hauteur sous plafond
  const hMatch = /(?:hauteur(?:\s*sous\s*plafond)?|plafond)[^0-9]{0,20}(\d(?:[.,]\d{1,2})?)\s*m?/i.exec(low);
  if (hMatch) {
    ops.push({ type: 'set_wall_height', value: Number(hMatch[1].replace(',', '.')) });
  }

  // Style de toiture
  if (/toit(?:ure)?\s*(?:plat|terrasse)/i.test(low)) ops.push({ type: 'set_roof_style', value: 'flat' });
  else if (/toit(?:ure)?\s*(?:en\s*pente|4\s*pans|pans|hip)/i.test(low)) ops.push({ type: 'set_roof_style', value: 'hip' });

  // Pergola / auvent / terrasse couverte
  if (/pergola|auvent|terrasse\s*couverte|v[ée]randa/i.test(low) && /ajout|cr[ée]e|mets|ajoute/i.test(low)) {
    const dimMatch = /(\d+(?:[.,]\d+)?)\s*(?:x|×|par)\s*(\d+(?:[.,]\d+)?)/i.exec(low);
    const areaMatch = /(\d{1,3})\s*(?:m2|m²)/i.exec(low);
    let w = 4.5, d = 3.0;
    if (dimMatch) {
      w = Number(dimMatch[1].replace(',', '.'));
      d = Number(dimMatch[2].replace(',', '.'));
    } else if (areaMatch) {
      const a = clamp(Number(areaMatch[1]), 6, 45);
      d = round2(clamp(Math.sqrt(a / 1.5), 2.0, 4.5));
      w = round2(a / d);
    }
    ops.push({ type: /pergola/i.test(low) ? 'add_pergola' : 'add_canopy', w, d });
  }

  // Portes PMR / élargir portes
  if (/porte/i.test(low) && /(pmr|0[.,]9|90\s*cm|[ée]larg|largeur)/i.test(low)) {
    const wMatch = /(0[.,]\d{2}|1[.,]\d{2})\s*m/i.exec(low);
    ops.push({ type: 'widen_doors', value: wMatch ? Number(wMatch[1].replace(',', '.')) : 0.9 });
  }

  // Agrandir fenêtres / baies
  if (/(fen[êe]tre|baie|vitrage)/i.test(low) && /(agrand|augment|plus\s*grand|lumi[èe]re|re2020)/i.test(low)) {
    const pctMatch = /(\d{1,2})\s*%/.exec(low);
    const factor = pctMatch ? 1 + clamp(Number(pctMatch[1]), 5, 50) / 100 : 1.25;
    ops.push({ type: 'enlarge_windows', factor });
  }

  // Renommer une pièce
  const renMatch = /renomme(?:r)?\s+(?:le|la|l['’])?\s*([a-zà-ÿ0-9\s-]{2,35}?)\s+en\s+[«"]?([a-zà-ÿ0-9\s&-]{2,45})[»"]?/i.exec(txt);
  if (renMatch) {
    ops.push({ type: 'rename_room', from: renMatch[1].trim(), to: renMatch[2].trim() });
  }

  return ops;
}

async function computeNaturalLanguagePatch(project, instruction, { geminiClient = null, rootDir = __dirname } = {}) {
  const cleanInst = cleanText(instruction, 600);
  if (!cleanInst) throw Object.assign(new Error('Précisez la modification à appliquer sur le plan.'), { status: 400 });
  if (!project || typeof project !== 'object') throw Object.assign(new Error('Plan projet requis.'), { status: 400 });

  let ops = parseDeterministicPatchOps(cleanInst);
  let source = 'engine';

  if (!ops.length && geminiClient && typeof geminiClient.isConfigured === 'function' && geminiClient.isConfigured(rootDir)) {
    try {
      const roomNames = (project.rooms || []).map(r => r.name).filter(Boolean).slice(0, 16).join(', ');
      const res = await geminiClient.generateText({
        systemInstruction: 'Traduis une demande d’architecte en tableau JSON strict d’opérations autorisées : {"ops":[...]}. Types autorisés UNIQUEMENT : {"type":"set_wall_height","value":3.1}, {"type":"set_roof_style","value":"flat"|"hip"|"none"}, {"type":"add_pergola","w":4,"d":3}, {"type":"add_canopy","w":5,"d":2.8}, {"type":"widen_doors","value":0.9}, {"type":"enlarge_windows","factor":1.25}, {"type":"rename_room","from":"...","to":"..."}. Aucune autre clé.',
        prompt: `Pièces actuelles : ${roomNames || 'aucune'}. Hauteur actuelle : ${project.config?.wallHeight || 2.8} m.\nDemande : ${cleanInst}`,
        responseMimeType: 'application/json'
      });
      const parsed = JSON.parse(String(res.text || '').replace(/^```json\s*|\s*```$/g, '').trim());
      if (Array.isArray(parsed?.ops) && parsed.ops.length) {
        ops = parsed.ops.slice(0, 6);
        source = 'gemini+engine';
      }
    } catch { /* aucun op reconnu */ }
  }

  if (!ops.length) {
    return {
      ok: false,
      error: 'Aucune modification géométrique reconnue. Essayez par exemple : « Passe la hauteur sous plafond à 3,10 m », « Ajoute une pergola de 4 × 3 m », « Élargis les portes à 0,90 m PMR » ou « Agrandis les fenêtres de 25 % ».'
    };
  }

  const { patchedProject, changes } = applyPatchOperations(project, ops);
  if (!changes.length) {
    return { ok: true, source, patchedProject, changes: ['Le plan respecte déjà exactement le critère demandé.'], noOp: true };
  }
  return { ok: true, source, patchedProject, changes, noOp: false };
}

// ============================================================================
// 3. CORRECTION AUTOMATIQUE PMR / RE2020 / HABITABILITÉ
// ============================================================================
function measureComplianceMetrics(project) {
  const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
  const walls = Array.isArray(project?.walls) ? project.walls : [];
  const habitableM2 = round2(rooms.filter(r => r && r.habitable !== false).reduce((s, r) => s + roomArea(r), 0));
  let bayM2 = 0;
  let narrowDoors = 0;
  for (const w of walls) {
    for (const o of w.openings || []) {
      const ow = Number(o.w ?? o.width);
      const oh = Number(o.h ?? o.height);
      if (o.type === 'window' || o.type === 'bay') bayM2 += (Number.isFinite(ow) && ow > 0 ? ow : 1) * (Number.isFinite(oh) && oh > 0 ? oh : 1.2);
      if (o.type === 'door' && (Number.isFinite(ow) && ow > 0 ? ow : 0.8) < 0.9) narrowDoors += 1;
    }
  }
  const bayRatio = habitableM2 > 0 ? round2(bayM2 / habitableM2) : 0;
  const glazingRatioPct = habitableM2 > 0 ? round2((bayM2 / habitableM2) * 100) : 0;
  const wallHeight = round2(Number(project?.config?.wallHeight) || 2.8);
  return { habitableM2, bayM2: round2(bayM2), bayRatio, glazingRatioPct, narrowDoors, wallHeight };
}

function computeComplianceAutoFix(project) {
  if (!project || typeof project !== 'object') throw Object.assign(new Error('Dossier projet requis.'), { status: 400 });
  const before = measureComplianceMetrics(project);
  const next = JSON.parse(JSON.stringify(project));
  if (!next.config || typeof next.config !== 'object') next.config = { wallHeight: 2.8, floorHeight: 3.0 };
  if (!Array.isArray(next.walls)) next.walls = [];

  const fixes = [];
  const remaining = [];

  // 1) Habitabilité : hauteur sous plafond minimale >= 2.20 m
  if ((Number(next.config.wallHeight) || 0) < 2.2) {
    const oldH = Number(next.config.wallHeight) || 0;
    next.config.wallHeight = 2.5;
    next.config.floorHeight = Math.max(2.75, Number(next.config.floorHeight) || 2.8);
    fixes.push(`Habitabilité : hauteur sous plafond relevée de ${oldH.toFixed(2)} m à 2,50 m (minimum légal 2,20 m).`);
  }

  // 2) PMR : toutes les portes < 0.90 m élargies à 0.90 m (dans la limite physique du mur hôte)
  let fixedDoors = 0;
  let unfixableDoors = 0;
  for (const w of next.walls) {
    const L = wallLength(w);
    for (const o of w.openings || []) {
      const ow = Number(o.w ?? o.width);
      if (o.type === 'door' && (Number.isFinite(ow) && ow > 0 ? ow : 0.8) < 0.9) {
        if (L >= 1.15) {
          o.w = 0.9;
          if ('width' in o) o.width = 0.9;
          fixedDoors += 1;
        } else {
          unfixableDoors += 1;
        }
      }
    }
  }
  if (fixedDoors) fixes.push(`PMR : ${fixedDoors} porte(s) élargie(s) à 0,90 m pour le passage fauteuil roulant.`);
  if (unfixableDoors) remaining.push(`PMR : ${unfixableDoors} porte(s) sur mur trop court (< 1,15 m) nécessite(nt) un ajustement manuel des cloisons.`);

  // 3) RE2020 : ratio surface vitrée >= 1/6 (16.7 %) de la surface habitable
  const targetBayM2 = before.habitableM2 > 0 ? round2(before.habitableM2 / 6) : 0;
  let current = measureComplianceMetrics(next);
  if (targetBayM2 > 0 && current.bayM2 < targetBayM2) {
    let widenedWins = 0;
    for (const w of next.walls) {
      if (current.bayM2 >= targetBayM2) break;
      const L = wallLength(w);
      const ops = w.openings || [];
      const maxPerOp = ops.length ? Math.max(0.9, (L - 0.35 * (ops.length + 1)) / ops.length) : L - 0.6;
      for (const o of ops) {
        if (current.bayM2 >= targetBayM2) break;
        if (o.type === 'window' || o.type === 'bay') {
          const oldW = Number(o.w ?? o.width) || 1.2;
          const oldH = Number(o.h ?? o.height) || 1.3;
          const maxH = round2(Math.max(1.55, (Number(next.config.wallHeight) || 2.8) - 0.35));
          const newW = round2(Math.min(Math.max(oldW * 1.6, 1.8), maxPerOp, 3.6));
          const newH = round2(Math.min(Math.max(oldH, o.type === 'bay' ? 2.15 : 1.75), maxH));
          if (newW > oldW + 0.02 || newH > oldH + 0.02) {
            o.w = newW;
            o.h = newH;
            if ('width' in o) o.width = newW;
            if ('height' in o) o.height = newH;
            widenedWins += 1;
            current = measureComplianceMetrics(next);
          }
        }
      }
    }
    if (widenedWins) fixes.push(`RE2020 : ${widenedWins} fenêtre(s)/baie(s) agrandie(s) pour augmenter l’apport lumineux naturel.`);

    // Si encore insuffisant, insérer des fenêtres/baies sur les murs extérieurs disponibles
    let addedWins = 0;
    const maxWinH = round2(Math.min(2.1, (Number(next.config.wallHeight) || 2.8) - 0.35));
    for (const w of next.walls) {
      if (current.bayM2 >= targetBayM2) break;
      if (w.type !== 'ext') continue;
      const L = wallLength(w);
      if (!Array.isArray(w.openings)) w.openings = [];
      if (L >= 2.4 && w.openings.length === 0) {
        const winW = round2(clamp(L * 0.48, 1.6, 3.2));
        w.openings.push({ type: 'bay', at: round2(L / 2), w: winW, h: maxWinH, sill: 0.1, level: Number(w.level) || 0 });
        addedWins += 1;
        current = measureComplianceMetrics(next);
      } else if (L >= 4.5 && w.openings.length === 1) {
        const existingAt = Number(w.openings[0].at) || L / 2;
        const freeAt = existingAt < L / 2 ? round2(L * 0.74) : round2(L * 0.26);
        const winW = round2(clamp(L * 0.3, 1.5, 2.8));
        w.openings.push({ type: 'window', at: freeAt, w: winW, h: Math.min(1.85, maxWinH), sill: 0.65, level: Number(w.level) || 0 });
        addedWins += 1;
        current = measureComplianceMetrics(next);
      }
    }
    if (addedWins) fixes.push(`RE2020 : ${addedWins} baie(s)/fenêtre(s) extérieure(s) ajoutée(s) en façade pour atteindre le ratio 1/6.`);
  }

  const after = measureComplianceMetrics(next);
  if (targetBayM2 > 0 && after.bayM2 < targetBayM2) {
    remaining.push(`RE2020 : surface vitrée portée à ${after.bayM2} m² (objectif 1/6 = ${targetBayM2} m²) — complétez avec une baie coulissante en façade.`);
  }

  return {
    ok: true,
    patchedProject: next,
    fixes,
    remaining,
    fixedCount: fixes.length,
    before,
    after,
    metricsBefore: before,
    metricsAfter: after
  };
}

// ============================================================================
// 4. RÉDACTION & INJECTION DU PARTI ARCHITECTURAL, SOUS-TITRE & DESCRIPTION
// ============================================================================
async function generateEditorialBrief(project, { geminiClient = null, rootDir = __dirname, tone = 'agence' } = {}) {
  if (!project || typeof project !== 'object') throw Object.assign(new Error('Dossier projet requis.'), { status: 400 });
  const rooms = Array.isArray(project.rooms) ? project.rooms : [];
  const habitableRooms = rooms.filter(r => r && r.habitable !== false);
  const annexRooms = rooms.filter(r => r && r.habitable === false);
  const habM2 = round2(habitableRooms.reduce((s, r) => s + roomArea(r), 0));
  const annexM2 = round2(annexRooms.reduce((s, r) => s + roomArea(r), 0));
  const levels = new Set(rooms.map(r => Number(r.level) || 0)).size || 1;
  const name = cleanText(project.meta?.name || 'Résidence contemporaine', 90);
  const city = cleanText(project.meta?.location || '', 80);
  const roomList = habitableRooms.slice(0, 10).map(r => `${r.name} (${Math.round(roomArea(r))} m²)`).join(', ');

  let draft = {
    subtitle: `${levels > 1 ? 'Résidence R+1' : 'Architecture de plain-pied'} · ${Math.round(habM2)} m² habitables${city ? ` à ${city}` : ''}`,
    parti: `Conception contemporaine de ${Math.round(habM2)} m² habitables articulant espaces de réception lumineux et zone nuit préservée${annexM2 > 0 ? `, prolongés par ${Math.round(annexM2)} m² d’espaces extérieurs abrités favorisant la ventilation naturelle` : ''}. L’implantation privilégie des circulations lisibles, des proportions équilibrées et une maîtrise climatique adaptée au site${city ? ` (${city})` : ''}.`,
    description: `${name} développe ${habitableRooms.length} pièces principales (${roomList || 'programme résidentiel'}) sous une hauteur sous plafond de ${round2(Number(project.config?.wallHeight) || 2.8)} m. Le plan privilégie le confort d’usage quotidien, la lumière naturelle et la cohérence constructive entre plan 2D, volume 3D et pièces graphiques.`
  };
  let source = 'engine';

  if (geminiClient && typeof geminiClient.isConfigured === 'function' && geminiClient.isConfigured(rootDir)) {
    try {
      const res = await geminiClient.generateText({
        systemInstruction: 'Tu es un architecte DPLG rédigeant la fiche éditoriale officielle d’un dossier APS/APD. Retourne UNIQUEMENT un JSON valide (sans markdown) : {"subtitle":"<=120 car","parti":"<=380 car","description":"<=480 car"}. Style sobre, précis, architectural, sans inventer de client, de date ni de mesures absentes.',
        prompt: `Projet : ${name}${city ? ` (${city})` : ''}\nNiveaux : ${levels}\nSurface habitable : ${habM2} m² (annexes : ${annexM2} m²)\nHauteur sous plafond : ${project.config?.wallHeight || 2.8} m\nPièces : ${roomList || 'non détaillées'}\nTon souhaité : ${cleanText(tone, 40) || 'agence'}`,
        responseMimeType: 'application/json'
      });
      const parsed = JSON.parse(String(res.text || '').replace(/^```json\s*|\s*```$/g, '').trim());
      if (parsed && typeof parsed === 'object' && parsed.parti && parsed.description) {
        draft = {
          subtitle: cleanText(parsed.subtitle || draft.subtitle, 130),
          parti: cleanText(parsed.parti, 420),
          description: cleanText(parsed.description, 520)
        };
        source = 'gemini';
      }
    } catch { /* repli rédacteur déterministe */ }
  }

  return { ok: true, source, draft };
}

// ============================================================================
// 5. CRÉATION AUTOMATIQUE DE VARIANTES A / B CHIFFRÉES
// ============================================================================
function buildABVariants(project, { costEstimate = null } = {}) {
  if (!project || typeof project !== 'object' || !Array.isArray(project.walls) || !Array.isArray(project.rooms)) {
    throw Object.assign(new Error('Le projet doit contenir des murs et des pièces pour créer les Variantes A / B.'), { status: 400 });
  }

  const baseCopy = JSON.parse(JSON.stringify(project));
  // Variante A : Optimisation économique / Essentiel
  const snapA = JSON.parse(JSON.stringify(baseCopy));
  if (!snapA.config) snapA.config = {};
  snapA.config.wallHeight = round2(Math.min(Number(snapA.config.wallHeight) || 2.8, 2.8));
  if (!snapA.estimate || typeof snapA.estimate !== 'object') snapA.estimate = {};
  snapA.estimate.standing = 'economique';

  // Variante B : Standing & Confort bioclimatique (baies +20 %, hauteur +20 cm, pergola/terrasse si absente)
  const snapB = JSON.parse(JSON.stringify(baseCopy));
  if (!snapB.config) snapB.config = {};
  snapB.config.wallHeight = round2(Math.max(Number(snapB.config.wallHeight) || 2.8, 3.05));
  snapB.config.floorHeight = round2(Math.max(snapB.config.wallHeight + 0.25, Number(snapB.config.floorHeight) || 3.3));
  const patchedB = applyPatchOperations(snapB, [{ type: 'enlarge_windows', factor: 1.2 }, { type: 'widen_doors', value: 0.9 }]).patchedProject;
  if (!(patchedB.canopies || []).length) {
    const withPergola = applyPatchOperations(patchedB, [{ type: 'add_pergola', w: 4.5, d: 3.0 }]).patchedProject;
    Object.assign(patchedB, withPergola);
  }
  if (!patchedB.estimate || typeof patchedB.estimate !== 'object') patchedB.estimate = {};
  patchedB.estimate.standing = 'standing';

  const calcBudget = (snap, standing) => {
    if (costEstimate && typeof costEstimate.estimate === 'function') {
      try {
        const est = costEstimate.estimate(snap, { standing });
        if (est && Number.isFinite(est.total?.mid || est.total)) {
          const val = Number(est.total?.mid ?? est.total);
          return Math.round(val);
        }
      } catch { /* fallback estimation ratio */ }
    }
    const hab = (snap.rooms || []).filter(r => r && r.habitable !== false).reduce((s, r) => s + roomArea(r), 0);
    const rate = standing === 'standing' ? 420000 : 285000;
    return Math.round(hab * rate);
  };

  const budgetA = calcBudget(snapA, 'economique');
  const budgetB = calcBudget(patchedB, 'standing');
  const habA = round2((snapA.rooms || []).filter(r => r && r.habitable !== false).reduce((s, r) => s + roomArea(r), 0));
  const habB = round2((patchedB.rooms || []).filter(r => r && r.habitable !== false).reduce((s, r) => s + roomArea(r), 0));
  const annexA = round2((snapA.rooms || []).filter(r => r && r.habitable === false).reduce((s, r) => s + roomArea(r), 0));
  const annexB = round2((patchedB.rooms || []).filter(r => r && r.habitable === false).reduce((s, r) => s + roomArea(r), 0));

  const variantA = {
    slot: 'A',
    label: 'Variante A — Essentiel maîtrisé',
    notes: `Enveloppe optimisée (${habA} m² hab.${annexA ? ` + ${annexA} m² annexes` : ''}, HSP ${snapA.config.wallHeight} m). Estimation indicative : ~${budgetA.toLocaleString('fr-FR')} FCFA.`,
    materials: { floor: 'tile', facade: 'plaster', roofType: snapA.config.roofStyle || 'hip' },
    snapshot: snapA,
    metrics: { habitableM2: habA, annexM2: annexA, wallHeight: snapA.config.wallHeight, budgetFCFA: budgetA }
  };

  const variantB = {
    slot: 'B',
    label: 'Variante B — Standing bioclimatique',
    notes: `Confort valorisé (${habB} m² hab.${annexB ? ` + ${annexB} m² annexes/pergola` : ''}, HSP ${patchedB.config.wallHeight} m, baies +20 %, portes PMR). Estimation indicative : ~${budgetB.toLocaleString('fr-FR')} FCFA.`,
    materials: { floor: 'oak', facade: 'timber', roofType: patchedB.config.roofStyle || 'hip' },
    snapshot: patchedB,
    metrics: { habitableM2: habB, annexM2: annexB, wallHeight: patchedB.config.wallHeight, budgetFCFA: budgetB }
  };

  return {
    ok: true,
    variantA,
    variantB,
    delta: {
      budgetFCFA: budgetB - budgetA,
      budgetPct: budgetA > 0 ? Math.round(((budgetB - budgetA) / budgetA) * 100) : 0,
      annexDeltaM2: round2(annexB - annexA),
      wallHeightDeltaM: round2(patchedB.config.wallHeight - snapA.config.wallHeight)
    }
  };
}

module.exports = {
  parseProgramFromBrief,
  generatePlanFromBrief,
  computeNaturalLanguagePatch,
  computeComplianceAutoFix,
  generateEditorialBrief,
  buildABVariants
};
