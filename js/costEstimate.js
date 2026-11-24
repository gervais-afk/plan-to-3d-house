/**
 * Métré et estimation indicative d'un projet, en FCFA (Cameroun).
 *
 * Les quantités de maçonnerie viennent de la géométrie (murs, ouvertures, pièces).
 * Le lot BA/HA est un avant-métré sous hypothèses explicites, pas un dimensionnement.
 * Les prix sont des ordres de grandeur datés, rattachés à leur source et modifiables par l'architecte :
 * ce n'est ni un devis ni un bordereau contractuel, et l'estimation est toujours rendue en fourchette.
 *
 * Trois profils de prix au m² (les sources publiques divergent d'environ 30 %) :
 * - LeFisk (août 2026) : ratios par standing ; profil par défaut.
 * - ECS Informatique (nov. 2025) : fourchettes clé en main par standing.
 * - Spécifications techniques Plan / 3D (2026) : indice de base 380 000 FCFA/m² HT, coefficient par ville,
 *   facteur haut standing 1,35, TVA 19,25 % facultative.
 * Postes annexes (terrain, études et permis, extérieurs) : guide de terrain FUSUCOB (2026).
 * Recherche documentaire menée avec NotebookLM (novembre 2026), valeurs vérifiées par l'utilisateur.
 */
const CostEstimate = (() => {
  const SPEC = 'Spécifications techniques Plan / 3D (2026)';
  const SOURCES = [
    { label: 'LeFisk — Construire au Cameroun : prix au m², permis de bâtir (août 2026)', url: 'https://lefisk.cm/blog/construire-au-cameroun-prix-m2-permis-batir-etapes-guide' },
    { label: 'ECS Informatique — Coût de construction d’une maison au Cameroun (nov. 2025)', url: 'https://www.ecsinformatique.com/quel-est-le-cout-de-construction-dune-maison-au-cameroun/' },
    { label: `${SPEC} — indice de base, coefficients par ville, prix unitaires`, url: '' },
    { label: 'FUSUCOB — Vrai coût de construction au Cameroun, poste par poste (2026)', url: 'https://www.youtube.com/watch?v=yhSTyhVRxyM' },
    { label: 'Bativel — Parpaing de 15/40 vibré, prix public', url: 'https://bativel.com/produit/parpaing-de-15-40-vibre/' }
  ];

  /** Profils : prix ponctuel (perM2), fourchette publiée (low/high) ou indice × facteur (spec). */
  const PROFILES = {
    lefisk: {
      label: 'LeFisk (août 2026)', default: 'moyen',
      standings: {
        'semi-dur': { label: 'Semi-dur', perM2: 80000 },
        ordinaire: { label: 'Standing ordinaire', perM2: 225000 },
        moyen: { label: 'Moyen standing', perM2: 290000 },
        haut: { label: 'Haut standing', perM2: 350000 },
        'tres-haut': { label: 'Très haut standing', perM2: 450000 }
      }
    },
    ecs: {
      label: 'ECS Informatique (nov. 2025)', default: 'moyen',
      standings: {
        petit: { label: 'Petit standing', low: 120000, high: 165000 },
        moyen: { label: 'Moyen standing', low: 170000, high: 220000 },
        haut: { label: 'Haut standing', low: 225000, high: 300000 }
      }
    },
    spec: {
      label: 'Spécifications techniques (2026)', default: 'standard', base: 380000, ht: true, cityFactor: true,
      standings: {
        standard: { label: 'Standard (indice de base)', factor: 1 },
        haut: { label: 'Haut standing (× 1,35)', factor: 1.35 }
      }
    }
  };
  // Compatibilité : l'ancien tableau des standings correspond au profil par défaut.
  const STANDINGS = PROFILES.lefisk.standings;

  /** Villes : coefficient territorial (profil Spécifications) et règle de taxe de permis connue. */
  const CITIES = {
    douala: { label: 'Douala', k: 1.00, permit: { perM2: 2500 } },
    yaounde: { label: 'Yaoundé', k: 1.03, permit: { share: 0.01 } },
    bafoussam: { label: 'Bafoussam', k: 0.98, permit: null },
    'buea-kribi': { label: 'Buea / Kribi', k: 1.04, permit: null },
    bamenda: { label: 'Bamenda', k: 1.06, permit: null },
    ngaoundere: { label: 'Ngaoundéré', k: 1.09, permit: null },
    garoua: { label: 'Garoua', k: 1.12, permit: null },
    maroua: { label: 'Maroua', k: 1.13, permit: null },
    ebolowa: { label: 'Ebolowa', k: 1.03, permit: null },
    autre: { label: 'Autre ville', k: 1.00, permit: null }
  };
  const VAT = 0.1925;
  const TILES = { '40x40': { label: 'Carrelage grès cérame 40 × 40', price: 11000 }, '60x60': { label: 'Carrelage grand format 60 × 60', price: 16500 } };
  const ROOFS = {
    dalle: { label: 'Toiture-terrasse en dalle béton armé étanchée', price: 28000 },
    aluzinc: { label: 'Tôle aluzinc 40/100 sur charpente bois traité', price: 7200 + 9500 },
    galva: { label: 'Tôle galvanisée 30/100 sur charpente bois traité', price: 4800 + 9500 },
    prelaquee: { label: 'Tôle prélaquée 40/100 sur charpente métallique légère', price: 8200 + 14500 }
  };
  const LAND = { peripherie: { label: 'Périphérie', low: 5000, high: 15000 }, centre: { label: 'Quartier central', low: 30000, high: 100000 } };

  const DEFAULTS = Object.freeze({
    version: 2, currency: 'XAF', profile: 'lefisk', standing: 'moyen', city: 'douala', perM2: null, vat: false,
    annexWeight: 0.5, grossShare: 0.55, contingency: 0.10, rangeLow: 0.10, rangeHigh: 0.15, permitOther: 0,
    // Bordereau d'achats
    blockPrice15: 365, blockPrice20: 425, blocksPerM2: 12.5, blockWaste: 0.05,
    tileFormat: '40x40', tileWaste: 0.10, roofType: 'dalle',
    // Budget global (postes souvent oubliés, FUSUCOB)
    studies: true, studiesLow: 2000000, studiesHigh: 5000000,
    exterior: true, exteriorLow: 0.05, exteriorHigh: 0.10,
    land: false, landZone: 'peripherie', plotArea: 0
  });

  // Hypothèses demandées pour l'avant-métré, NON prescriptions de calcul.
  // Prix repères fournis par le maître d'ouvrage, non vérifiés auprès des fournisseurs.
  const STRUCTURE_DEFAULTS = Object.freeze({
    enabled: true, foundationLevel: 0,
    footingWidth: 0.60, footingHeight: 0.25,
    columnWidth: 0.20, columnDepth: 0.20,
    beamWidth: 0.20, beamHeight: 0.20,
    cover: 0.025, stirrupSpacing: 0.20, stirrupDiameter: 6,
    lapLength: 0.40, hookLength: 0.06,
    concreteWaste: 0.05, steelWaste: 0.10,
    concretePrice: 75000, ha12Price: 7800, ha10Price: 5400, stirrupPrice: 3500
  });
  const STRUCTURE_SOURCE = 'Hypothèses BA/HA utilisateur — prix Cameroun à confirmer';
  const STRUCTURE_WARNINGS = Object.freeze([
    'Avant-métré seulement : sections, dosage 350 kg/m³, enrobage, ancrages et recouvrements à valider par un ingénieur structure et une étude de sol. Le dosage ne garantit pas une classe de résistance.',
    'Semelles uniquement au niveau de fondation choisi ; tous les murs extérieurs y sont supposés porteurs. Deux chaînages par mur à chaque niveau ; poteaux aux jonctions non colinéaires, sans raidisseurs intermédiaires automatiques.',
    'Volumes bruts sur axes, sans déduction des intersections béton ; armatures des semelles, dalles et linteaux, coffrage et main-d’œuvre exclus. Ce lot ne constitue pas un métré structurel complet.',
    'Achats indicatifs déjà représentés dans le budget au m² : ne pas les y additionner. La couverture dalle reste un poste séparé ; aucun béton de dalle ajouté ici.'
  ]);

  function structureSettings(input) {
    const s = input && typeof input === 'object' ? input : {};
    const out = { ...STRUCTURE_DEFAULTS, enabled: bool(s.enabled, true) };
    for (const key of Object.keys(STRUCTURE_DEFAULTS)) {
      if (key === 'enabled' || key === 'stirrupDiameter') continue;
      const price = key.endsWith('Price');
      const waste = key.endsWith('Waste');
      out[key] = clamp(s[key], key === 'foundationLevel' ? -20 : price || waste ? 0 : 0.001,
        price ? 1e7 : waste ? 0.5 : 100, STRUCTURE_DEFAULTS[key]);
    }
    out.lapLength = Math.min(out.lapLength, 2);
    out.foundationLevel = Math.trunc(out.foundationLevel);
    out.stirrupDiameter = s.stirrupDiameter === 8 ? 8 : 6;
    // Empêche un cadre de dimensions négatives ; diamètre pris à l'axe de l'acier.
    out.cover = Math.min(out.cover,
      (Math.min(out.columnWidth, out.columnDepth, out.beamWidth, out.beamHeight) - out.stirrupDiameter / 1000) / 2 * 0.99);
    return out;
  }

  /** Masse linéique approchée de l'acier : diamètre en mm, résultat en kg/m. */
  function steelKgPerMeter(diameterMm) {
    if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new RangeError('Diamètre invalide');
    return diameterMm ** 2 / 162;
  }

  /** Graphe local par niveau : intersections T/X, segments superposés et doublons.
   * Tolérance métrique 1 µm pour les clés ; ne répare pas un plan mal raccordé.
   * O(n²), suffisant pour ce métré à la demande, pas destiné au rendu par frame.
   */
  function structuralGeometry(project) {
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const key = p => p.map(v => Math.round(v * 1e6)).join(',');
    const valid = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite);
    const walls = (Array.isArray(project?.walls) ? project.walls : []).filter(w =>
      valid(w?.from) && valid(w?.to) && Math.hypot(...sub(w.to, w.from)) > 1e-6
    ).map(w => ({ a: w.from, d: sub(w.to, w.from), level: Number(w.level) || 0,
      ext: w.type === 'ext' || (!w.type && Number(w.thick) >= 0.2), cuts: [0, 1] }));
    const add = (w, t) => { if (t >= -1e-9 && t <= 1 + 1e-9) w.cuts.push(Math.max(0, Math.min(1, t))); };
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i], b = walls[j];
      if (a.level !== b.level) continue;
      const delta = sub(b.a, a.a), det = cross(a.d, b.d);
      if (Math.abs(det) > 1e-9) {
        const t = cross(delta, b.d) / det, u = cross(delta, a.d) / det;
        if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) { add(a, t); add(b, u); }
      } else if (Math.abs(cross(delta, a.d)) < 1e-9) {
        for (const [w, other] of [[a, b], [b, a]]) {
          const axis = Math.abs(w.d[0]) >= Math.abs(w.d[1]) ? 0 : 1;
          add(w, (other.a[axis] - w.a[axis]) / w.d[axis]);
          add(w, (other.a[axis] + other.d[axis] - w.a[axis]) / w.d[axis]);
        }
      }
    }
    const spans = new Map();
    for (const w of walls) {
      const cuts = [...new Set(w.cuts)].sort((a, b) => a - b);
      for (let i = 1; i < cuts.length; i++) {
        const a = w.a.map((v, k) => v + cuts[i - 1] * w.d[k]);
        const b = w.a.map((v, k) => v + cuts[i] * w.d[k]);
        if (key(a) === key(b)) continue;
        const id = `${w.level}:${[key(a), key(b)].sort().join(':')}`;
        const old = spans.get(id);
        spans.set(id, { a, b, level: w.level, ext: w.ext || Boolean(old?.ext) });
      }
    }
    const nodes = new Map();
    for (const span of spans.values()) for (const [a, b] of [[span.a, span.b], [span.b, span.a]]) {
      const id = `${span.level}:${key(a)}`;
      if (!nodes.has(id)) nodes.set(id, { point: a, level: span.level, directions: [] });
      nodes.get(id).directions.push(sub(b, a));
    }
    const junctions = [...nodes.values()].filter(n => n.directions.some((a, i) =>
      n.directions.slice(i + 1).some(b => Math.abs(cross(a, b)) / (Math.hypot(...a) * Math.hypot(...b)) > 1e-6)));
    return { spans: [...spans.values()], junctions };
  }

  function reinforcedConcrete(project, input) {
    const s = structureSettings(input);
    const geometry = structuralGeometry(project);
    const height = clamp(project?.config?.wallHeight, 0.1, 100, 2.8);
    const totalLength = geometry.spans.reduce((sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0);
    const footingLength = geometry.spans.filter(w => w.ext && w.level === s.foundationLevel)
      .reduce((sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0);
    const columnCount = geometry.junctions.length;
    const volumes = {
      footings: footingLength * s.footingWidth * s.footingHeight,
      columns: columnCount * s.columnWidth * s.columnDepth * height,
      beams: 2 * totalLength * s.beamWidth * s.beamHeight
    };
    const concreteNet = Object.values(volumes).reduce((a, b) => a + b, 0);
    // Une longueur longitudinale par mur original unique ; les découpes T/X
    // ne doivent pas provoquer de faux recouvrements ni d'étriers supplémentaires.
    const runs = [];
    // Le graphe est regroupé en lignes contiguës, y compris à travers les jonctions.
    const groups = new Map();
    for (const w of geometry.spans) {
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy);
      const sign = dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0) ? -1 : 1;
      const ux = sign * dx / len, uy = sign * dy / len;
      const id = `${w.level}:${[ux, uy, -uy * w.a[0] + ux * w.a[1]].map(v => Math.round(v * 1e6)).join(':')}`;
      const t = p => ux * p[0] + uy * p[1];
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push([Math.min(t(w.a), t(w.b)), Math.max(t(w.a), t(w.b))]);
    }
    for (const intervals of groups.values()) {
      intervals.sort((a, b) => a[0] - b[0]);
      let [start, end] = intervals[0];
      for (const [a, b] of intervals.slice(1)) {
        if (a <= end + 1e-6) end = Math.max(end, b);
        else { runs.push(end - start); start = a; end = b; }
      }
      runs.push(end - start);
    }
    const stock = 12;
    // 40 cm par fil à chaque raccord d'élément, plus les épissures nécessaires
    // au-delà de 12 m. Hypothèse budgétaire, pas une longueur d'ancrage calculée.
    const longitudinal = length => {
      const base = length + s.lapLength;
      const splices = Math.max(0, Math.ceil((base - stock) / (stock - s.lapLength)));
      return 4 * (base + splices * s.lapLength);
    };
    const stirrupLength = (b, h) => 2 * (b + h - 4 * s.cover - 2 * s.stirrupDiameter / 1000) + 2 * s.hookLength;
    const stirrups = length => Math.ceil(length / s.stirrupSpacing) + 1;
    const columnStirrups = columnCount * stirrups(height);
    const beamStirrups = 2 * runs.reduce((sum, length) => sum + stirrups(length), 0);
    const steel = [
      { id: 'ha-12', diameter: 12, length: columnCount * longitudinal(height), price: s.ha12Price },
      { id: 'ha-10', diameter: 10, length: 2 * runs.reduce((sum, length) => sum + longitudinal(length), 0), price: s.ha10Price },
      { id: `ha-${s.stirrupDiameter}`, diameter: s.stirrupDiameter,
        length: columnStirrups * stirrupLength(s.columnWidth, s.columnDepth) + beamStirrups * stirrupLength(s.beamWidth, s.beamHeight), price: s.stirrupPrice }
    ].map(item => ({ ...item, massKg: item.length * steelKgPerMeter(item.diameter),
      bars: Math.ceil(item.length * (1 + s.steelWaste) / stock) }));
    return { settings: s, totalLength, footingLength, columnCount, volumes, concreteNet,
      concreteOrder: concreteNet * (1 + s.concreteWaste), columnStirrups, beamStirrups,
      steel, warnings: [...STRUCTURE_WARNINGS] };
  }

  const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, finite(value, fallback)));
  const pick = (table, key, fallback) => (Object.hasOwn(table, key) ? key : fallback);
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

  /** Réglages complets et bornés : toute valeur absente ou aberrante reprend sa valeur par défaut. */
  function settings(input = {}) {
    const s = input && typeof input === 'object' ? input : {};
    const profile = pick(PROFILES, s.profile, DEFAULTS.profile);
    const studiesLow = clamp(s.studiesLow, 0, 1e9, DEFAULTS.studiesLow);
    const exteriorLow = clamp(s.exteriorLow, 0, 0.5, DEFAULTS.exteriorLow);
    return {
      version: 2, currency: 'XAF', profile,
      structure: structureSettings(s.structure),
      standing: pick(PROFILES[profile].standings, s.standing, PROFILES[profile].default),
      city: pick(CITIES, s.city, DEFAULTS.city),
      perM2: Number.isFinite(s.perM2) && s.perM2 > 0 ? Math.min(s.perM2, 5e6) : null,
      vat: bool(s.vat, DEFAULTS.vat),
      annexWeight: clamp(s.annexWeight, 0, 1, DEFAULTS.annexWeight),
      grossShare: clamp(s.grossShare, 0.2, 0.9, DEFAULTS.grossShare),
      contingency: clamp(s.contingency, 0, 0.5, DEFAULTS.contingency),
      rangeLow: clamp(s.rangeLow, 0, 0.5, DEFAULTS.rangeLow),
      rangeHigh: clamp(s.rangeHigh, 0, 1, DEFAULTS.rangeHigh),
      permitOther: clamp(s.permitOther, 0, 1e9, DEFAULTS.permitOther),
      blockPrice15: clamp(s.blockPrice15, 0, 1e5, DEFAULTS.blockPrice15),
      blockPrice20: clamp(s.blockPrice20, 0, 1e5, DEFAULTS.blockPrice20),
      blocksPerM2: clamp(s.blocksPerM2, 1, 50, DEFAULTS.blocksPerM2),
      blockWaste: clamp(s.blockWaste, 0, 0.5, DEFAULTS.blockWaste),
      tileFormat: pick(TILES, s.tileFormat, DEFAULTS.tileFormat),
      tileWaste: clamp(s.tileWaste, 0, 0.5, DEFAULTS.tileWaste),
      roofType: pick(ROOFS, s.roofType, DEFAULTS.roofType),
      studies: bool(s.studies, DEFAULTS.studies),
      studiesLow, studiesHigh: Math.max(studiesLow, clamp(s.studiesHigh, 0, 1e9, DEFAULTS.studiesHigh)),
      exterior: bool(s.exterior, DEFAULTS.exterior),
      exteriorLow, exteriorHigh: Math.max(exteriorLow, clamp(s.exteriorHigh, 0, 0.5, DEFAULTS.exteriorHigh)),
      land: bool(s.land, DEFAULTS.land),
      landZone: pick(LAND, s.landZone, DEFAULTS.landZone),
      plotArea: clamp(s.plotArea, 0, 1e6, DEFAULTS.plotArea)
    };
  }

  function shoelace(poly) {
    let sum = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  }
  
  /**
   * Surface au nu intérieur : offset polygonal vers l'intérieur de thick/2.
   * Soustrait l'emprise des murs pour obtenir la vraie surface habitable utile
   * (au pied des plinthes), conforme aux normes légales (Loi Carrez).
   * 
   * Algorithme simplifié pour polygones convexes et orthogonaux :
   * - Pour chaque arête, décale vers l'intérieur de thick/2
   * - Surface nette = surface brute - (périmètre × thick/2) + coins
   * 
   * Pour les rectangles : S_nette = (L - thick) × (l - thick)
   */
  function roomAreaNet(room, walls) {
    const thick = Number(room?.wallThickness) || 0.20; // Épaisseur moyenne des murs adjacents
    const areaBrute = roomArea(room);
    if (areaBrute < 1) return 0;
    
    // Calcule le périmètre de la pièce
    let perimeter = 0;
    if (Array.isArray(room?.poly) && room.poly.length >= 3) {
      for (let i = 0; i < room.poly.length; i++) {
        const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length];
        perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    } else if (room?.bounds) {
      const b = room.bounds;
      perimeter = 2 * ((b.xMax - b.xMin) + (b.zMax - b.zMin));
    }
    
    // Surface nette = brute - (périmètre × thick/2)
    // Correction : ajouter les coins (thick/2)² pour les angles droits
    const areaNette = Math.max(0, areaBrute - perimeter * (thick / 2));
    return areaNette;
  }
  
  function roomArea(room) {
    if (Array.isArray(room?.poly) && room.poly.length >= 3) return shoelace(room.poly);
    const b = room?.bounds;
    return b ? Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin) : 0;
  }
  const isTiled = room => /^tiles?$/i.test(room?.floorType || '');

  /**
   * Déduplication des intersections de murs : soustrait l'épaisseur du mur croisé
   * aux jonctions en L ou en T pour éviter la double facturation des parpaings.
   * 
   * Algorithme : pour chaque jonction, détecter les murs perpendiculaires et soustraire
   * l'épaisseur du mur le plus fin (généralement la cloison intérieure).
   * 
   * Retourne un map : wallId → longueur nette (après déduction des jonctions)
   */
  function deduplicateWallLengths(walls) {
    const netLengths = new Map();
    
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      if (!Array.isArray(wall?.from) || !Array.isArray(wall?.to)) continue;
      
      let grossLength = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      let junctionDeductions = 0;
      
      // Détecte les jonctions avec les autres murs
      for (let j = 0; j < walls.length; j++) {
        if (i === j) continue;
        const other = walls[j];
        if (!Array.isArray(other?.from) || !Array.isArray(other?.to)) continue;
        
        // Vérifie si les murs se croisent ou se touchent
        const thick1 = Number(wall.thick) || (wall.type === 'ext' ? 0.25 : 0.15);
        const thick2 = Number(other.thick) || (other.type === 'ext' ? 0.25 : 0.15);
        
        // Détection simplifiée : si une extrémité de wall touche other
        const endpoints = [wall.from, wall.to];
        for (const pt of endpoints) {
          // Distance du point au segment other
          const dx = other.to[0] - other.from[0];
          const dy = other.to[1] - other.from[1];
          const len2 = dx * dx + dy * dy;
          if (len2 < 1e-6) continue;
          
          let t = ((pt[0] - other.from[0]) * dx + (pt[1] - other.from[1]) * dy) / len2;
          t = Math.max(0, Math.min(1, t));
          const projX = other.from[0] + t * dx;
          const projY = other.from[1] + t * dy;
          const dist = Math.hypot(pt[0] - projX, pt[1] - projY);
          
          // Si l'extrémité touche l'autre mur (distance < 5 cm)
          if (dist < 0.05) {
            // Déduit l'épaisseur du mur le plus fin (cloison intérieure typiquement)
            const minThick = Math.min(thick1, thick2);
            junctionDeductions += minThick;
          }
        }
      }
      
      // Longueur nette = brute - déductions
      const netLength = Math.max(0, grossLength - junctionDeductions);
      netLengths.set(wall, netLength);
    }
    
    return netLengths;
  }
  
  /**
   * Exclusion de la zone sous-escalier < 1,80 m.
   * 
   * Règle d'or d'architecture : la surface située sous un escalier où la hauteur
   * sous plafond est inférieure à 1,80 m n'est pas habitable (placard/débarras).
   * 
   * Algorithme : pour chaque stairwell, calcule l'emprise projetée et soustrait
   * la zone où la hauteur < 1,80 m (hypothèse : escalier droit, hauteur proportionnelle).
   * 
   * Retourne la surface totale à exclure (m²)
   */
  function computeStairwellExclusion(project) {
    const stairwells = Array.isArray(project?.stairwells) ? project.stairwells : [];
    if (stairwells.length === 0) return 0;
    
    const wallHeight = Number(project?.config?.wallHeight) || 2.8;
    let exclusionArea = 0;
    
    for (const stairwell of stairwells) {
      // Dimensions de la trémie
      const width = Math.abs(stairwell.xMax - stairwell.xMin);
      const depth = Math.abs(stairwell.zMax - stairwell.zMin);
      const stairArea = width * depth;
      
      // Hypothèse : escalier droit montant sur toute la hauteur
      // La hauteur sous plafond varie linéairement de 0 (bas) à wallHeight (haut)
      // La zone < 1,80 m correspond à la fraction (1.80 / wallHeight) de la longueur
      const fractionLowHeight = Math.min(1, 1.80 / wallHeight);
      const lowArea = stairArea * fractionLowHeight;
      
      exclusionArea += lowArea;
    }
    
    return exclusionArea;
  }
  
  /** Quantités tirées de la géométrie : aucune hypothèse de prix ici. */
  function quantities(project) {
    const config = project?.config || {};
    const wallHeight = Number(config.wallHeight) || 2.8;
    const walls = Array.isArray(project?.walls) ? project.walls : [];
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const q = {
      habitable: 0, habitableNet: 0, annexes: 0, floorArea: 0, floorAreaNet: 0, levels: 0, tiledArea: 0, tiledAreaNet: 0, roofArea: 0,
      extLength: 0, extLengthNet: 0, intLength: 0, intLengthNet: 0, wallGross: 0, wallNet: 0, openingArea: 0,
      wall20: 0, wall20Net: 0, wall15: 0, wall15Net: 0, doors: 0, windows: 0, bays: 0, passages: 0,
      stairwellExclusion: 0
    };
    const levels = new Set();
    let top = 0;
    for (const room of rooms) top = Math.max(top, Number(room.level) || 0);
    
    // Calcule les surfaces brutes et nettes (au nu intérieur)
    for (const room of rooms) {
      const areaBrute = roomArea(room);
      const areaNette = roomAreaNet(room, walls);
      const level = Number(room.level) || 0;
      levels.add(level);
      q.floorArea += areaBrute;
      q.floorAreaNet += areaNette;
      if (room.habitable) {
        q.habitable += areaBrute;
        q.habitableNet += areaNette;
      } else {
        q.annexes += areaBrute;
      }
      if (isTiled(room)) {
        q.tiledArea += areaBrute; // Carrelage brut (compatibilité)
        q.tiledAreaNet += areaNette; // Carrelage net (nu intérieur)
      }
      if (level === top) q.roofArea += areaBrute; // Surface couverte estimée
    }
    
    // Exclusion de la zone sous-escalier < 1,80 m
    q.stairwellExclusion = computeStairwellExclusion(project);
    q.habitableNet = Math.max(0, q.habitableNet - q.stairwellExclusion);
    
    // Déduplication des intersections de murs (anti-surfacturation parpaings)
    const netLengths = deduplicateWallLengths(walls);
    
    for (const wall of walls) {
      if (!Array.isArray(wall?.from) || !Array.isArray(wall?.to)) continue;
      levels.add(Number(wall.level) || 0);
      
      const grossLength = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const netLength = netLengths.get(wall) || grossLength;
      
      const gross = grossLength * wallHeight;
      const net = netLength * wallHeight;
      
      let holes = 0;
      for (const op of Array.isArray(wall.openings) ? wall.openings : []) {
        const width = Math.max(0, Number(op.w) || 0);
        const height = Math.max(0, Number(op.h) || (op.type === 'door' ? 2.1 : op.type === 'open' ? wallHeight : 1.25));
        holes += Math.min(width * height, gross);
        if (op.type === 'door') q.doors++;
        else if (op.type === 'window') q.windows++;
        else if (op.type === 'bay') q.bays++;
        else if (op.type === 'open') q.passages++;
      }
      
      const grossWithHoles = Math.max(0, gross - holes);
      const netWithHoles = Math.max(0, net - holes);
      
      if (wall.type === 'ext') {
        q.extLength += grossLength;
        q.extLengthNet += netLength;
      } else {
        q.intLength += grossLength;
        q.intLengthNet += netLength;
      }
      
      // Un mur de 20 cm et plus est monté en parpaing de 20, une cloison en parpaing de 15.
      // Valeurs brutes (compatibilité) et nettes (anti-surfacturation)
      if ((Number(wall.thick) || (wall.type === 'ext' ? 0.25 : 0.15)) >= 0.2) {
        q.wall20 += grossWithHoles; // Brut
        q.wall20Net += netWithHoles; // Net (après déduplication)
      } else {
        q.wall15 += grossWithHoles; // Brut
        q.wall15Net += netWithHoles; // Net (après déduplication)
      }
      q.wallGross += gross;
      q.wallNet += net;
      q.openingArea += holes;
    }
    q.levels = levels.size;
    return q;
  }

  /** Prix au m² retenu pour le profil, le standing et la ville : { low, mid, high, ht, label }. */
  function priceRange(s) {
    const profile = PROFILES[s.profile];
    const standing = profile.standings[s.standing];
    const spread = mid => ({ low: mid * (1 - s.rangeLow), mid, high: mid * (1 + s.rangeHigh) });
    if (s.perM2) return { ...spread(s.perM2), ht: false, label: 'Prix au m² saisi' };
    if (standing.low) return { low: standing.low, mid: (standing.low + standing.high) / 2, high: standing.high, ht: false, label: `${profile.label} · ${standing.label}` };
    if (profile.base) {
      const k = profile.cityFactor ? CITIES[s.city].k : 1;
      const mid = profile.base * standing.factor * k * (s.vat ? 1 + VAT : 1);
      return { ...spread(mid), ht: !s.vat, label: `${profile.label} · ${standing.label} · ${CITIES[s.city].label} (× ${k.toFixed(2).replace('.', ',')})${s.vat ? ' · TVA 19,25 % incluse' : ' · HT'}` };
    }
    return { ...spread(standing.perM2), ht: false, label: `${profile.label} · ${standing.label}` };
  }

  const scale = (range, factor) => ({ low: range.low * factor, mid: range.mid * factor, high: range.high * factor });

  /** Estimation en fourchette, bordereau d'achats et budget global. */
  function estimate(project, input) {
    const s = settings(input);
    const q = quantities(project);
    // La référence de prix est basée sur la surface habitable NETTE (au nu intérieur,
    // sous-escalier < 1,80 m exclu) : c'est la vraie surface utile, conforme aux normes
    // de vente (Loi Carrez) et aux attentes des maîtres d'ouvrage.
    const reference = q.habitable + q.annexes * s.annexWeight;
    const rate = priceRange(s);
    const works = scale(rate, reference);
    const contingency = scale(works, s.contingency);
    const permitRule = CITIES[s.city].permit;
    const permit = permitRule?.perM2 ? reference * permitRule.perM2 : permitRule?.share ? works.mid * permitRule.share : s.permitOther;
    const fixed = value => ({ low: value, mid: value, high: value });
    const total = { low: works.low + contingency.low + permit, mid: works.mid + contingency.mid + permit, high: works.high + contingency.high + permit };

    // Bordereau d'achats : quantités commerciales, chutes comprises (repère, déjà inclus dans le gros œuvre).
    // Utilise les valeurs NETTES (après déduplication des jonctions et nu intérieur) pour éviter
    // la surfacturation : on ne commande que ce qu'on pose réellement.
    const blocks = area => Math.ceil(area * s.blocksPerM2 * (1 + s.blockWaste));
    const tile = TILES[s.tileFormat], roof = ROOFS[s.roofType];
    const row = (id, label, quantity, unit, unitPrice, source, sourced = true) => ({ id, label, quantity, unit, unitPrice, cost: quantity * unitPrice, source, sourced });
    const materials = [
      row('parpaing-20', 'Parpaings creux de 20 (murs extérieurs)', blocks(q.wall20), 'u', s.blockPrice20, SPEC),
      row('parpaing-15', 'Parpaings de 15 (cloisons)', blocks(q.wall15), 'u', s.blockPrice15, 'Bativel'),
      row('carrelage', `${tile.label} (surface carrelée, chutes ${Math.round(s.tileWaste * 100)} %)`, Math.ceil(q.tiledArea * (1 + s.tileWaste) * 10) / 10, 'm²', tile.price, SPEC),
      row('couverture', `${roof.label} (surface couverte estimée)`, Math.ceil(q.roofArea * 10) / 10, 'm²', roof.price, SPEC)
    ].filter(item => item.quantity > 0);
    const structure = reinforcedConcrete(project, s.structure);
    if (s.structure.enabled) {
      const concreteParts = [
        ['semelles', 'Semelles filantes', structure.volumes.footings],
        ['poteaux', 'Poteaux aux jonctions', structure.volumes.columns],
        ['chainages', 'Chaînages bas et hauts', structure.volumes.beams]
      ];
      for (const [id, label, volume] of concreteParts) {
        if (volume > 0) materials.push(row(`ba-${id}`,
          `BA/HA — ${label} — béton 350 kg/m³ (pertes ${Math.round(s.structure.concreteWaste * 100)} %, prévisionnel)`,
          volume * (1 + s.structure.concreteWaste), 'm³', s.structure.concretePrice, STRUCTURE_SOURCE, false));
      }
      for (const steel of structure.steel) {
        if (steel.bars > 0) materials.push(row(steel.id,
          `BA/HA — HA ${steel.diameter}, barre de 12 m (chutes ${Math.round(s.structure.steelWaste * 100)} %, prévisionnel)`,
          steel.bars, 'barre', steel.price, STRUCTURE_SOURCE, false));
      }
    }
    materials.forEach(item => { item.count = item.quantity; }); // compatibilité avec l'ancien champ « count »

    // Budget global : postes facultatifs souvent oubliés (FUSUCOB 2026), en fourchette.
    const annexes = [];
    if (s.studies) annexes.push({ id: 'etudes', label: 'Études, plans et dossiers techniques', low: s.studiesLow, high: s.studiesHigh });
    if (s.exterior) annexes.push({ id: 'exterieurs', label: `Clôture, assainissement et extérieurs (${Math.round(s.exteriorLow * 100)} à ${Math.round(s.exteriorHigh * 100)} % des travaux)`, low: works.low * s.exteriorLow, high: works.high * s.exteriorHigh });
    if (s.land && s.plotArea > 0) {
      const zone = LAND[s.landZone];
      annexes.push({ id: 'terrain', label: `Terrain : ${Math.round(s.plotArea)} m² en ${zone.label.toLowerCase()} (${zone.low.toLocaleString('fr-FR')} à ${zone.high.toLocaleString('fr-FR')} FCFA/m²)`, low: s.plotArea * zone.low, high: s.plotArea * zone.high });
    }
    const overall = annexes.length ? { low: total.low + annexes.reduce((sum, a) => sum + a.low, 0), high: total.high + annexes.reduce((sum, a) => sum + a.high, 0) } : null;

    // Surface habitable nette (au nu intérieur, sous-escalier exclu) : conforme Loi Carrez.
    const habitableNet = Math.round(q.habitableNet * 10) / 10;
    const habitableNetLabel = `≈ ${Math.round(habitableNet)} m² habitables (nu intérieur)`;

    return {
      settings: s, quantities: q, reference, perM2: rate.mid, rate,
      lots: [
        { id: 'gros-oeuvre', label: 'Gros œuvre (fondations, élévation, dalle ou toiture)', ...scale(works, s.grossShare) },
        { id: 'finitions', label: 'Second œuvre et finitions', ...scale(works, 1 - s.grossShare) },
        { id: 'imprevus', label: `Imprévus (${Math.round(s.contingency * 100)} %)`, ...contingency },
        { id: 'permis', label: `Permis de bâtir — ${CITIES[s.city].label}`, ...fixed(permit) }
      ],
      total, materials, annexes, overall, structure,
      habitableNet, habitableNetLabel,
      excluded: overall ? 'Hors branchements ENEO et CAMWATER et honoraires de maîtrise d’œuvre.'
        : 'Hors terrain, clôture, branchements ENEO et CAMWATER, aménagements extérieurs et honoraires.'
    };
  }

  const money = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  /** Montant arrondi au millier, lisible : « 31 450 000 FCFA ». */
  const formatXAF = value => `${money.format(Math.round(value / 1000) * 1000)} FCFA`;

  /** Bordereau d'achats au format CSV (séparateur « ; », décimales à virgule) pour un tableur ou une quincaillerie. */
  function bordereauCSV(result, projectName = 'Projet') {
    const cell = value => {
      const text = typeof value === 'number' ? String(Math.round(value * 100) / 100).replace('.', ',') : String(value ?? '');
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      ['Projet', projectName],
      ['AVERTISSEMENT : Ne pas additionner le bordereau des achats détaillés avec le budget global au m²'],
      [],
      ['Poste', 'Quantité', 'Unité', 'Prix unitaire (FCFA)', 'Montant (FCFA)', 'Source']
    ];
    result.materials.forEach(m => lines.push([m.label, m.quantity, m.unit === 'u' ? 'pièce' : m.unit, m.unitPrice, Math.round(m.cost), m.source]));
    lines.push([], ['Repère d’achat indicatif : quantités tirées du plan, chutes comprises ; prix à confirmer auprès des fournisseurs.']);
    if (result.structure?.settings.enabled) result.structure.warnings.forEach(warning => lines.push([warning]));
    return '﻿' + lines.map(line => line.map(cell).join(';')).join('\r\n');
  }

  // =====================================================================
  // GARDE-FOUS MÉTIER — SANITY CHECKS DU DEVIS ET DU MÉTRÉ
  // =====================================================================

  /** Distance d'un point à un segment (usage interne pour l'adjacence mur/pièce). */
  function _pointToSegDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  /**
   * Sanity checks du devis FCFA : contrôle la plausibilité du métré et du
   * dimensionnement avant affichage à l'utilisateur ou export CSV.
   *
   * Seuils normatifs (bâtiment résidentiel standard, Cameroun) :
   * - Ratio acier/béton : [60, 180] kg/m³.
   *   En-dessous : armatures sous-dimensionnées ou semelles non ferraillées.
   *   Au-dessus : surdimensionnement ou géométrie aberrante.
   * - Béton / surface habitable : ≤ 0,25 m³/m². Au-delà, erreur probable.
   * - Compacité L_ext / √S_hab : [2,5 ; 5,5]. En-dehors, forme non standard.
   * - Habitabilité : chambre ≥ 7 m² ; séjour/chambre avec ouverture vitrée.
   *
   * @param {object} result — sortie de estimate()
   * @param {object} project — données du projet (walls, rooms, config)
   * @returns {{ valid: boolean, warnings: string[], errors: string[],
   *             details: { steelPerConcrete: number, concretePerArea: number, compactness: number, roomIssues: string[] } }}
   */
  function sanityChecks(result, project) {
    const warnings = [];
    const errors = [];
    const roomIssues = [];
    const structure = result.structure || {};
    const q = result.quantities || {};
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const walls = Array.isArray(project?.walls) ? project.walls : [];

    // ─── 1. Ratio acier / béton (kg/m³) ─────────────────────────────────
    // Masse théorique de l'acier (sans chutes) vs volume commandé (avec pertes).
    // Le modèle exclut les armatures de semelles, dalles et linteaux :
    // un ratio bas est donc attendu et signalé comme limitation du modèle.
    // Si le lot structure est désactivé, le calcul est sauté.
    const steelItems = Array.isArray(structure.steel) ? structure.steel : [];
    const concreteOrdered = Number(structure.concreteOrder) || 0;
    const structureEnabled = structure.settings?.enabled !== false;
    const steelPerConcrete = (structureEnabled && concreteOrdered > 0)
      ? steelItems.reduce((s, item) => s + (Number(item.massKg) || 0), 0) / concreteOrdered
      : 0;

    if (structureEnabled && concreteOrdered > 0 && steelPerConcrete < 60) {
      warnings.push(`Ratio acier/béton ${steelPerConcrete.toFixed(0)} kg/m³ < 60 — sous la plage résidentielle [60–180]. Ce modèle n'inclut pas les armatures de semelles, dalles et linteaux : consulter un ingénieur structure.`);
    } else if (structureEnabled && concreteOrdered > 0 && steelPerConcrete > 180) {
      warnings.push(`Ratio acier/béton ${steelPerConcrete.toFixed(0)} kg/m³ > 180 — sur la plage résidentielle [60–180]. Vérifier le ferraillage ou la géométrie.`);
    }

    // ─── 2. Béton / surface habitable (m³/m²) ───────────────────────────
    const habitable = Number(q.habitable) || 0;
    const concretePerArea = (structureEnabled && habitable > 0) ? concreteOrdered / habitable : 0;
    if (structureEnabled && habitable > 0 && concretePerArea > 0.25) {
      warnings.push(`Volume béton ${concretePerArea.toFixed(2)} m³/m² habitable > 0,25 — indice de surdimensionnement ou d'erreur géométrique. Vérifier les sections ou la hauteur.`);
    }

    // ─── 3. Compacité architecturale ─────────────────────────────────────
    // L_ext / √S_hab : indicateur de forme. Un rectangle a un ratio ≈ 2 × (L+l) / √(L×l).
    // Pour un carré de 100 m² : 4×10/10 = 4. Pour un L très découpé : > 5.
    const extLength = Number(q.extLength) || 0;
    const compactness = habitable > 0 ? extLength / Math.sqrt(habitable) : 0;
    if (habitable > 0) {
      if (compactness < 2.5) {
        warnings.push(`Compacité ${compactness.toFixed(1)} < 2,5 — forme géométrique impossible ou linéaire extérieur sous-estimé.`);
      } else if (compactness > 5.5) {
        warnings.push(`Compacité ${compactness.toFixed(1)} > 5,5 — forme excessivement découpée et énergivore. Envisager une implantation plus compacte.`);
      }
    }

    // ─── 4. Habitabilité minimale des pièces ─────────────────────────────
    const tolerance = 0.20; // 20 cm pour l'adjacence mur/pièce
    for (const room of rooms) {
      const name = String(room.name || '').toLowerCase();
      const area = roomArea(room);
      const label = room.name || 'pièce';

      // 4a. Chambre ≥ 7 m² (norme d'habitabilité minimale)
      if (/chambre|bedroom/.test(name) && area < 7) {
        const msg = `Pièce « ${label} » : ${area.toFixed(1)} m² < 7 m² — chambre en-dessous de l'habitabilité minimale.`;
        roomIssues.push(msg);
        warnings.push(msg);
      }

      // 4b. Pièce de vie (séjour, salon, chambre) avec ouverture vitrée
      if (/séjour|sejour|salon|living|chambre|bedroom/.test(name)) {
        const pts = Array.isArray(room.poly) && room.poly.length >= 3
          ? room.poly
          : room.bounds
            ? [[room.bounds.xMin, room.bounds.zMin], [room.bounds.xMax, room.bounds.zMin],
               [room.bounds.xMax, room.bounds.zMax], [room.bounds.xMin, room.bounds.zMax]]
            : [];

        if (pts.length >= 3) {
          const adjacentWalls = walls.filter(w => {
            if (!Array.isArray(w?.from) || !Array.isArray(w?.to)) return false;
            const mid = [(w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2];
            for (let j = 0; j < pts.length; j++) {
              if (_pointToSegDist(mid, pts[j], pts[(j + 1) % pts.length]) < tolerance) return true;
            }
            return false;
          });

          const hasWindow = adjacentWalls.some(w =>
            Array.isArray(w.openings) && w.openings.some(op => op.type === 'window' || op.type === 'bay')
          );

          if (!hasWindow) {
            const msg = `Pièce « ${label} » : aucune ouverture vitrée (fenêtre ou baie) sur les murs adjacents — éclair naturel insuffisant.`;
            roomIssues.push(msg);
            warnings.push(msg);
          }
        }
      }
    }

    // ─── 5. Résumé ───────────────────────────────────────────────────────
    return {
      valid: errors.length === 0,
      warnings,
      errors,
      details: {
        steelPerConcrete: Math.round(steelPerConcrete * 10) / 10,
        concretePerArea: Math.round(concretePerArea * 1000) / 1000,
        compactness: Math.round(compactness * 10) / 10,
        roomIssues
      }
    };
  }

  return { STRUCTURE_DEFAULTS, STRUCTURE_WARNINGS, structureSettings, structuralGeometry, reinforcedConcrete, steelKgPerMeter, PROFILES, STANDINGS, CITIES, TILES, ROOFS, LAND, VAT, DEFAULTS, SOURCES, settings, quantities, priceRange, estimate, roomArea, roomAreaNet, deduplicateWallLengths, computeStairwellExclusion, formatXAF, bordereauCSV, sanityChecks };
})();

if (typeof module !== 'undefined') module.exports = CostEstimate;
