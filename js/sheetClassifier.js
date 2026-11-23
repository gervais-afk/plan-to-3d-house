/**
 * IDENTIFICATION DES PLANCHES PDF DE L'ARCHITECTE (local, sans IA, déterministe)
 *
 * Un plan de distribution et un plan de coffrage se ressemblent (mêmes murs, mêmes cotes) : on ne peut
 * pas les distinguer à l'image. On lit donc le TEXTE vectoriel de la page (PDF issus d'AutoCAD, ArchiCAD…) :
 *  1. le cartouche (« TITRE DU PLAN : COFFRAGE ») — indice décisif ;
 *  2. le vocabulaire du dessin : noms de pièces et surfaces (distribution), poteaux / poutres / dalle
 *     (coffrage), semelles / longrines (fondations), tôles / fermes (toiture), cotes NGF (coupe)… ;
 *  3. le nom du fichier, en appoint.
 * Chaque indice pèse des points ; le type le mieux noté l'emporte, avec une confiance :
 *  'title'  — lu dans le cartouche ;  'likely' — indices concordants ;  'low' — à confirmer ;  'none' — page
 *  scannée ou muette : l'architecte choisit lui-même. Le choix de l'architecte prime toujours.
 */
const SheetClassifier = (() => {
  // Ordre d'un dossier d'architecte : architecture, puis structure (BET), puis lots techniques.
  const TYPES = {
    situation: { label: 'Plan de situation', discipline: 'architecture', order: 10 },
    masse: { label: 'Plan de masse', discipline: 'architecture', order: 20 },
    distribution: { label: 'Plan de distribution', discipline: 'architecture', order: 30, levels: true },
    facade: { label: 'Façade', discipline: 'architecture', order: 40 },
    coupe: { label: 'Coupe', discipline: 'architecture', order: 50 },
    toiture: { label: 'Plan de toiture', discipline: 'architecture', order: 60 },
    perspective: { label: 'Perspective', discipline: 'architecture', order: 70 },
    fondation: { label: 'Plan de fondations', discipline: 'structure', order: 110 },
    coffrage: { label: 'Plan de coffrage', discipline: 'structure', order: 120, levels: true },
    ferraillage: { label: 'Plan de ferraillage', discipline: 'structure', order: 130 },
    electricite: { label: 'Plan d’électricité', discipline: 'technique', order: 210, levels: true },
    plomberie: { label: 'Plan de plomberie et assainissement', discipline: 'technique', order: 220, levels: true },
    autre: { label: 'Autre document', discipline: 'annexe', order: 900 }
  };
  const DISCIPLINES = { architecture: 'Architecture', structure: 'Structure — béton armé', technique: 'Lots techniques', annexe: 'Autres documents' };

  // Mots-clés (sans accents, minuscules) ; le titre du cartouche compte cinq fois plus que le corps.
  const KEYWORDS = {
    situation: [[/plan de situation|\bsituation\b|localisation|carte/, 4]],
    masse: [[/\bmasse\b|plan de plan|emprise au sol|\broute\b|limite de (?:propriete|parcelle)|\bvoirie\b|\bcloture\b/, 4]],
    distribution: [[/distribution|amenagement|plan commercial|plan meuble|plan de vente/, 4], [/\brdc\b|rez[ -]de[ -]chaussee|\betage\b|\br ?\+ ?\d\b|niveau \d/, 1]],
    facade: [[/facade|elevation/, 4]],
    coupe: [[/\bcoupe\b|\bsection\b/, 4], [/[+-]\d+,\d{2}\b.*[+-]\d+,\d{2}\b/, 1]],
    toiture: [[/toiture|charpente|\btoles?\b|bacs? alu|\bfermes?\b|\bpannes?\b|\bfaitage\b|chevron|couverture/, 4]],
    perspective: [[/perspective|\b3d\b|vue d'?ensemble|rendu/, 3]],
    fondation: [[/fondation|semelle|longrine|gros beton|beton de proprete|radier|\bpieux?\b/, 4]],
    coffrage: [[/coffrage|plancher haut|\bpoutres?\b|\bpoteaux?\b|chainage|\bdalle\b|hourdis|linteau|nervure|poutrelle/, 4]],
    ferraillage: [[/ferraillage|armature|\bha ?\d|\bt ?\d{1,2}\b.*\be ?=|epingle|\bcadres?\b|nomenclature des aciers/, 4]],
    electricite: [[/electricit|eclairage|\bprises?\b|interrupteur|tableau electrique|\bluminaire|disjoncteur/, 4]],
    plomberie: [[/plomberie|assainissement|evacuation|\bfosse\b|\bpuisard|alimentation en eau|eaux (?:usees|vannes|pluviales)|regard/, 4]]
  };
  const ROOMS = /\b(?:sejour|salon|chambre|cuisine|toil|wc|douche|sdb|salle (?:d'?eau|de bain|a manger)|degagement|dressing|veranda|terrasse|garage|bureau|buanderie|magasin|hall|palier|cellier|s ?a ?m)\b/g;
  const AREAS = /\d+[,.]\d+\s*m\s*(?:2|²)/g;

  const normalize = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');

  /** Titre lu dans le cartouche (« TITRE DU PLAN : … », « TITRE : … »), sinon ''. */
  function cartoucheTitle(raw) {
    const m = String(raw || '').replace(/\s+/g, ' ').match(/TITRE\s*(?:DU\s*PLAN)?\s*:\s*(.+?)(?=\s+(?:PROJET|MA[IÎ]TRE|DESSIN|EC\s*\d|ECH|DATE|ECHELLE)\b|$)/i);
    if (!m) return '';
    // Dans le flux de texte du PDF, les étiquettes de pièces voisines suivent parfois le titre : on s'arrête
    // au premier nom de pièce, et à six mots au plus.
    const words = m[1].trim().split(' ');
    const end = words.findIndex((w, i) => i > 0 && new RegExp(ROOMS.source).test(normalize(w)));
    return words.slice(0, Math.min(6, end > 0 ? end : words.length)).join(' ').slice(0, 80);
  }

  function levelOf(text) {
    if (/sous[- ]sol|\bs ?-? ?sol\b|niveau -1/.test(text)) return -1;
    if (/\brdc\b|rez[ -]de[ -]chaussee|niveau 0\b|\br ?\+ ?0\b/.test(text)) return 0;
    const plus = text.match(/\br ?\+ ?(\d)\b/) || text.match(/niveau (\d)\b/) || text.match(/(\d)(?:er|e|eme) etage/);
    if (plus) return Number(plus[1]);
    if (/\betage\b/.test(text)) return 1;
    return null;
  }

  function orientationOf(text) {
    const m = text.match(/\b(avant|principale|arriere|posterieure|gauche|droite|laterale|nord|sud|est|ouest)\b/);
    if (!m) return '';
    return { principale: 'avant', posterieure: 'arrière', arriere: 'arrière', laterale: 'latérale' }[m[1]] || m[1];
  }

  /**
   * @param {{ text?: string, fileName?: string }} page  texte vectoriel de la page, nom du fichier
   * @returns {{ type, level, label, discipline, confidence, title, scale, reasons: string[], scores }}
   */
  function classify({ text = '', fileName = '' } = {}) {
    const raw = String(text || '');
    const title = cartoucheTitle(raw);
    const body = normalize(raw), head = normalize(title), file = normalize(fileName).replace(/[_.-]+/g, ' ');
    const scores = Object.fromEntries(Object.keys(TYPES).map(k => [k, 0]));
    const reasons = {};
    const add = (type, points, why) => { scores[type] += points; (reasons[type] ||= []).push(why); };

    for (const [type, rules] of Object.entries(KEYWORDS)) {
      for (const [pattern, weight] of rules) {
        if (head && pattern.test(head)) add(type, weight * 5, `cartouche : « ${title} »`);
        if (pattern.test(body)) add(type, weight, 'vocabulaire du dessin');
        if (pattern.test(file)) add(type, weight, `nom du fichier : ${fileName}`);
      }
    }
    // Pièces nommées et surfaces : signature d'un plan de distribution (absentes d'un plan de structure).
    const rooms = new Set(body.match(ROOMS) || []).size, areas = (raw.match(AREAS) || []).length;
    if (rooms) add('distribution', Math.min(8, rooms * 1.5), `${rooms} pièce${rooms > 1 ? 's' : ''} nommée${rooms > 1 ? 's' : ''}`);
    if (areas) add('distribution', Math.min(6, areas), `${areas} surface${areas > 1 ? 's' : ''} en m²`);
    // Un titre de niveau seul (« RDC », « ETAGE ») désigne un plan de distribution… sauf vocabulaire de structure.
    if (head && levelOf(head) !== null && !/coffrage|fondation|ferraillage|electric|plomberie|toiture/.test(head)) add('distribution', 12, `cartouche : « ${title} »`);
    // Les pièces citées sur un plan de toiture ou de structure ne doivent pas l'emporter sur le titre.
    const ranked = Object.entries(scores).filter(([k]) => k !== 'autre').sort((a, b) => b[1] - a[1]);
    let [type, best] = ranked[0];
    const second = ranked[1][1];
    if (best <= 0) type = 'autre';

    const fromTitle = (reasons[type] || []).some(r => r.startsWith('cartouche'));
    const confidence = !raw.trim() && best <= 0 ? 'none'
      : fromTitle && best >= second * 1.3 ? 'title'
      : best >= 6 && best >= second * 1.6 ? 'likely'
      : best > 0 ? 'low' : 'none';

    const info = TYPES[type];
    const level = info.levels ? levelOf(head || body) ?? levelOf(file) : null;
    const orient = type === 'facade' ? orientationOf(head || file || body) : '';
    const cut = type === 'coupe' ? ((head || body).match(/coupe\s*([a-z])\s*[-–]?\s*([a-z])\b/) || []) : [];
    const scale = (raw.match(/(?:ec|ech|echelle|éch|échelle)\.?\s*:?\s*1\s*\/\s*(\d{2,4})/i) || [])[1];
    return {
      type, level, discipline: info.discipline, confidence, title, scale: scale ? `1/${scale}` : '',
      label: label(type, level, { orientation: orient, cut: cut[1] ? `${cut[1]}-${cut[2]}`.toUpperCase() : '' }),
      reasons: [...new Set(reasons[type] || [])].slice(0, 3), scores
    };
  }

  const levelName = level => level === null || level === undefined ? '' : level < 0 ? 'Sous-sol' : level === 0 ? 'Rez-de-chaussée' : `Étage ${level}`;

  /** Libellé de planche : « Plan de distribution — Rez-de-chaussée », « Façade arrière », « Coupe B-B ». */
  function label(type, level, { orientation = '', cut = '' } = {}) {
    const base = (TYPES[type] || TYPES.autre).label;
    if (type === 'facade') return orientation ? `Façade ${orientation}` : base;
    if (type === 'coupe') return cut ? `Coupe ${cut}` : base;
    return TYPES[type]?.levels && level !== null && level !== undefined ? `${base} — ${levelName(level)}` : base;
  }

  /**
   * Contenu du dossier : ce que l'architecte a fourni, ce que la maquette sait produire, ce qui manque.
   * @param sheets   planches retenues [{ type, level }]
   * @param levels   niveaux de la maquette, ex. [0, 1]
   */
  function completeness(sheets, levels = [0]) {
    const has = (type, level) => sheets.some(s => s.type === type && (level === undefined || s.level === level));
    const rows = [
      { key: 'masse', label: 'Plan de masse', status: has('masse') ? 'provided' : 'missing' },
      ...levels.map(level => ({ key: `distribution-${level}`, label: `Plan de distribution — ${levelName(level)}`, status: has('distribution', level) ? 'provided' : 'generated' })),
      { key: 'facade', label: 'Façades', status: has('facade') ? 'provided' : 'missing', count: sheets.filter(s => s.type === 'facade').length },
      { key: 'coupe', label: 'Coupe', status: has('coupe') ? 'provided' : 'missing' },
      { key: 'toiture', label: 'Plan de toiture', status: has('toiture') ? 'provided' : 'missing' },
      { key: 'fondation', label: 'Plan de fondations', status: has('fondation') ? 'provided' : 'missing', structure: true },
      { key: 'coffrage', label: 'Plan(s) de coffrage', status: has('coffrage') ? 'provided' : 'missing', structure: true }
    ];
    return rows;
  }

  return { TYPES, DISCIPLINES, classify, cartoucheTitle, label, levelName, completeness, normalize };
})();

if (typeof module !== 'undefined') module.exports = SheetClassifier;
