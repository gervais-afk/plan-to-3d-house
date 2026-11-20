/**
 * Métré et estimation indicative d'un projet, en FCFA (Cameroun).
 *
 * Les quantités viennent exactement de la géométrie du projet (murs, ouvertures, pièces).
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
  function roomArea(room) {
    if (Array.isArray(room?.poly) && room.poly.length >= 3) return shoelace(room.poly);
    const b = room?.bounds;
    return b ? Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin) : 0;
  }
  const isTiled = room => /^tiles?$/i.test(room?.floorType || '');

  /** Quantités tirées de la géométrie : aucune hypothèse de prix ici. */
  function quantities(project) {
    const config = project?.config || {};
    const wallHeight = Number(config.wallHeight) || 2.8;
    const walls = Array.isArray(project?.walls) ? project.walls : [];
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const q = {
      habitable: 0, annexes: 0, floorArea: 0, levels: 0, tiledArea: 0, roofArea: 0,
      extLength: 0, intLength: 0, wallGross: 0, openingArea: 0,
      wall20: 0, wall15: 0, doors: 0, windows: 0, bays: 0, passages: 0
    };
    const levels = new Set();
    let top = 0;
    for (const room of rooms) top = Math.max(top, Number(room.level) || 0);
    for (const room of rooms) {
      const area = roomArea(room);
      const level = Number(room.level) || 0;
      levels.add(level);
      q.floorArea += area;
      if (room.habitable) q.habitable += area; else q.annexes += area;
      if (isTiled(room)) q.tiledArea += area;
      if (level === top) q.roofArea += area; // surface couverte estimée : pièces du dernier niveau
    }
    for (const wall of walls) {
      if (!Array.isArray(wall?.from) || !Array.isArray(wall?.to)) continue;
      levels.add(Number(wall.level) || 0);
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const gross = length * wallHeight;
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
      const net = Math.max(0, gross - holes);
      if (wall.type === 'ext') q.extLength += length; else q.intLength += length;
      // Un mur de 20 cm et plus est monté en parpaing de 20, une cloison en parpaing de 15.
      if ((Number(wall.thick) || (wall.type === 'ext' ? 0.25 : 0.15)) >= 0.2) q.wall20 += net; else q.wall15 += net;
      q.wallGross += gross;
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
    const reference = q.habitable + q.annexes * s.annexWeight;
    const rate = priceRange(s);
    const works = scale(rate, reference);
    const contingency = scale(works, s.contingency);
    const permitRule = CITIES[s.city].permit;
    const permit = permitRule?.perM2 ? reference * permitRule.perM2 : permitRule?.share ? works.mid * permitRule.share : s.permitOther;
    const fixed = value => ({ low: value, mid: value, high: value });
    const total = { low: works.low + contingency.low + permit, mid: works.mid + contingency.mid + permit, high: works.high + contingency.high + permit };

    // Bordereau d'achats : quantités commerciales, chutes comprises (repère, déjà inclus dans le gros œuvre).
    const blocks = area => Math.ceil(area * s.blocksPerM2 * (1 + s.blockWaste));
    const tile = TILES[s.tileFormat], roof = ROOFS[s.roofType];
    const row = (id, label, quantity, unit, unitPrice, source, sourced = true) => ({ id, label, quantity, unit, unitPrice, cost: quantity * unitPrice, source, sourced });
    const materials = [
      row('parpaing-20', 'Parpaings creux de 20 (murs extérieurs)', blocks(q.wall20), 'u', s.blockPrice20, SPEC),
      row('parpaing-15', 'Parpaings de 15 (cloisons)', blocks(q.wall15), 'u', s.blockPrice15, 'Bativel'),
      row('carrelage', `${tile.label} (pièces carrelées, chutes ${Math.round(s.tileWaste * 100)} %)`, Math.ceil(q.tiledArea * (1 + s.tileWaste) * 10) / 10, 'm²', tile.price, SPEC),
      row('couverture', `${roof.label} (surface couverte estimée)`, Math.ceil(q.roofArea * 10) / 10, 'm²', roof.price, SPEC)
    ].filter(item => item.quantity > 0);
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

    return {
      settings: s, quantities: q, reference, perM2: rate.mid, rate,
      lots: [
        { id: 'gros-oeuvre', label: 'Gros œuvre (fondations, élévation, dalle ou toiture)', ...scale(works, s.grossShare) },
        { id: 'finitions', label: 'Second œuvre et finitions', ...scale(works, 1 - s.grossShare) },
        { id: 'imprevus', label: `Imprévus (${Math.round(s.contingency * 100)} %)`, ...contingency },
        { id: 'permis', label: `Permis de bâtir — ${CITIES[s.city].label}`, ...fixed(permit) }
      ],
      total, materials, annexes, overall,
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
    const lines = [['Projet', projectName], [], ['Poste', 'Quantité', 'Unité', 'Prix unitaire (FCFA)', 'Montant (FCFA)', 'Source']];
    result.materials.forEach(m => lines.push([m.label, m.quantity, m.unit === 'u' ? 'pièce' : m.unit, m.unitPrice, Math.round(m.cost), m.source]));
    lines.push([], ['Repère d’achat indicatif : quantités tirées du plan, chutes comprises ; prix à confirmer auprès des fournisseurs.']);
    return '﻿' + lines.map(line => line.map(cell).join(';')).join('\r\n');
  }

  return { PROFILES, STANDINGS, CITIES, TILES, ROOFS, LAND, VAT, DEFAULTS, SOURCES, settings, quantities, priceRange, estimate, roomArea, formatXAF, bordereauCSV };
})();

if (typeof module !== 'undefined') module.exports = CostEstimate;
