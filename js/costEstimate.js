/**
 * Métré et estimation indicative d'un projet, en FCFA (Cameroun).
 *
 * Les quantités viennent exactement de la géométrie du projet (murs, ouvertures, pièces).
 * Les prix sont des ordres de grandeur publics, datés et modifiables par l'architecte :
 * ce n'est ni un devis ni un bordereau, et l'estimation est toujours rendue en fourchette.
 *
 * Sources des valeurs par défaut (consultées en novembre 2026) :
 * - Ratios au m² par standing, part gros œuvre / finitions, imprévus et taxe de permis :
 *   LeFisk, « Construire au Cameroun : prix au m², permis de bâtir… » (7 août 2026).
 * - Parpaing vibré 15×20×40 : Bativel, prix public en ligne (365 FCFA l'unité).
 * Le prix du parpaing de 20 n'a pas de source fiable : il est marqué « à confirmer ».
 */
const CostEstimate = (() => {
  const STANDINGS = {
    'semi-dur': { label: 'Semi-dur', perM2: 80000 },
    ordinaire: { label: 'Standing ordinaire', perM2: 225000 },
    moyen: { label: 'Moyen standing', perM2: 290000 },
    haut: { label: 'Haut standing', perM2: 350000 },
    'tres-haut': { label: 'Très haut standing', perM2: 450000 }
  };
  const CITIES = {
    douala: { label: 'Douala', permit: { perM2: 2500 } },
    yaounde: { label: 'Yaoundé', permit: { share: 0.01 } },
    autre: { label: 'Autre ville', permit: null }
  };
  const DEFAULTS = Object.freeze({
    version: 1,
    currency: 'XAF',
    standing: 'moyen',
    city: 'douala',
    perM2: null,                // null : ratio du standing choisi
    annexWeight: 0.5,           // porche, terrasse couverte, garage comptés à 50 %
    grossShare: 0.55,           // gros œuvre 50 à 60 % du total selon LeFisk
    contingency: 0.10,          // imprévus 10 % selon LeFisk
    rangeLow: 0.10,             // fourchette basse −10 %
    rangeHigh: 0.15,            // fourchette haute +15 %
    permitOther: 0,             // taxe de permis saisie à la main hors Douala/Yaoundé
    blockPrice15: 365,
    blockPrice20: 450,
    blocksPerM2: 12.5,          // blocs de 20 × 40 cm de face
    blockWaste: 0.05
  });
  const SOURCES = [
    { label: 'LeFisk — Construire au Cameroun : prix au m², permis de bâtir (août 2026)', url: 'https://lefisk.cm/blog/construire-au-cameroun-prix-m2-permis-batir-etapes-guide' },
    { label: 'Bativel — Parpaing de 15/40 vibré, prix public', url: 'https://bativel.com/produit/parpaing-de-15-40-vibre/' }
  ];

  const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, finite(value, fallback)));

  /** Réglages complets et bornés : toute valeur absente ou aberrante reprend sa valeur par défaut. */
  function settings(input = {}) {
    const s = input && typeof input === 'object' ? input : {};
    return {
      version: 1,
      currency: 'XAF',
      standing: Object.hasOwn(STANDINGS, s.standing) ? s.standing : DEFAULTS.standing,
      city: Object.hasOwn(CITIES, s.city) ? s.city : DEFAULTS.city,
      perM2: Number.isFinite(s.perM2) && s.perM2 > 0 ? Math.min(s.perM2, 5e6) : null,
      annexWeight: clamp(s.annexWeight, 0, 1, DEFAULTS.annexWeight),
      grossShare: clamp(s.grossShare, 0.2, 0.9, DEFAULTS.grossShare),
      contingency: clamp(s.contingency, 0, 0.5, DEFAULTS.contingency),
      rangeLow: clamp(s.rangeLow, 0, 0.5, DEFAULTS.rangeLow),
      rangeHigh: clamp(s.rangeHigh, 0, 1, DEFAULTS.rangeHigh),
      permitOther: clamp(s.permitOther, 0, 1e9, DEFAULTS.permitOther),
      blockPrice15: clamp(s.blockPrice15, 0, 1e5, DEFAULTS.blockPrice15),
      blockPrice20: clamp(s.blockPrice20, 0, 1e5, DEFAULTS.blockPrice20),
      blocksPerM2: clamp(s.blocksPerM2, 1, 50, DEFAULTS.blocksPerM2),
      blockWaste: clamp(s.blockWaste, 0, 0.5, DEFAULTS.blockWaste)
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

  /** Quantités tirées de la géométrie : aucune hypothèse de prix ici. */
  function quantities(project) {
    const config = project?.config || {};
    const wallHeight = Number(config.wallHeight) || 2.8;
    const walls = Array.isArray(project?.walls) ? project.walls : [];
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const q = {
      habitable: 0, annexes: 0, floorArea: 0, levels: 0,
      extLength: 0, intLength: 0, wallGross: 0, openingArea: 0,
      wall20: 0, wall15: 0, doors: 0, windows: 0, bays: 0, passages: 0
    };
    const levels = new Set();
    for (const room of rooms) {
      const area = roomArea(room);
      levels.add(Number(room.level) || 0);
      q.floorArea += area;
      if (room.habitable) q.habitable += area; else q.annexes += area;
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

  /** Estimation en fourchette. Le total vient du ratio au m² ; les parpaings sont un repère d'achat. */
  function estimate(project, input) {
    const s = settings(input);
    const q = quantities(project);
    const perM2 = s.perM2 ?? STANDINGS[s.standing].perM2;
    const reference = q.habitable + q.annexes * s.annexWeight;
    const works = reference * perM2;
    const contingency = works * s.contingency;
    const permitRule = CITIES[s.city].permit;
    const permit = permitRule?.perM2 ? reference * permitRule.perM2 : permitRule?.share ? works * permitRule.share : s.permitOther;
    const total = works + contingency + permit;
    const blocks = size => Math.ceil((size === 20 ? q.wall20 : q.wall15) * s.blocksPerM2 * (1 + s.blockWaste));
    const range = value => ({ low: value * (1 - s.rangeLow), mid: value, high: value * (1 + s.rangeHigh) });
    return {
      settings: s, quantities: q, perM2, reference,
      lots: [
        { id: 'gros-oeuvre', label: 'Gros œuvre (fondations, élévation, dalle ou toiture)', ...range(works * s.grossShare) },
        { id: 'finitions', label: 'Second œuvre et finitions', ...range(works * (1 - s.grossShare)) },
        { id: 'imprevus', label: `Imprévus (${Math.round(s.contingency * 100)} %)`, ...range(contingency) },
        { id: 'permis', label: `Permis de bâtir — ${CITIES[s.city].label}`, low: permit, mid: permit, high: permit }
      ],
      total: { low: works * (1 - s.rangeLow) + contingency * (1 - s.rangeLow) + permit, mid: total, high: works * (1 + s.rangeHigh) + contingency * (1 + s.rangeHigh) + permit },
      materials: [
        { id: 'parpaing-20', label: 'Parpaings de 20 (murs extérieurs)', count: blocks(20), unit: s.blockPrice20, cost: blocks(20) * s.blockPrice20, sourced: false },
        { id: 'parpaing-15', label: 'Parpaings de 15 (cloisons)', count: blocks(15), unit: s.blockPrice15, cost: blocks(15) * s.blockPrice15, sourced: true }
      ],
      excluded: 'Hors terrain, clôture, branchements ENEO et CAMWATER, aménagements extérieurs et honoraires.'
    };
  }

  const money = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  /** Montant arrondi au millier, lisible : « 31 450 000 FCFA ». */
  const formatXAF = value => `${money.format(Math.round(value / 1000) * 1000)} FCFA`;

  return { STANDINGS, CITIES, DEFAULTS, SOURCES, settings, quantities, estimate, roomArea, formatXAF };
})();

if (typeof module !== 'undefined') module.exports = CostEstimate;
