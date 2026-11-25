/**
 * IDENTITÉ PDF AGENCE — Charte graphique et cartouche communs à tous les documents ArchiCam Studio
 * (Cahier de plans A3, Catalogue A4 paysage, APS A4 portrait, Brochures client A4 portrait).
 *
 * Règles strictes :
 * 1. Aucun champ administratif n'est inventé (jamais d'indice « A », de client, de lieu ni de date fabriqués).
 * 2. Aucune case vide n'est imprimée dans le cartouche remis au client : les lignes sans valeur sont
 *    masquées et le bloc se resserre. Les champs manquants sont signalés à l'écran avant export via missingFields().
 * 3. L'agence / maître d'œuvre provient du profil du cabinet (/api/cabinet/profile) et/ou de meta.architect ;
 *    en leur absence, la ligne est masquée (jamais « ArchiCam Studio » en maître d'œuvre).
 * 4. Codification documentaire déterministe, identique pour tout projet : <PRÉFIXE>-<NN>
 *    (00 = couverture, 01..NN = planches/pages), avec APS (Avant-projet sommaire), BRO (Brochure),
 *    CAT (Catalogue des intérieurs) et PL (Cahier de plans A3).
 */
const PdfIdentity = (() => {
  'use strict';

  const PALETTE = Object.freeze({
    dark: '#1d2620',
    panel: '#202a23',
    ink: '#1b2320',
    muted: '#5f6a63',
    paper: '#f4f2eb',
    rule: '#c9cbbf',
    ruleDark: '#3d4a3f',
    sand: '#d8c7a0',
    gold: '#b78a3c',
    white: '#ffffff',
    room: '#ebe8de',
    annex: '#dfe5d8',
    glass: '#5b8ea0',
    cut: '#e6dfcd',
    woodDark: '#2c382f',
    woodPaper: '#e7dfcf',
    softLight: '#d5dbd1'
  });

  const PHASES = Object.freeze({
    ESQ: 'Esquisse',
    APS: 'Avant-projet sommaire',
    APD: 'Avant-projet définitif',
    PC: 'Permis de construire',
    DCE: 'Dossier de consultation',
    EXE: 'Exécution'
  });

  /** Préfixes normalisés des codes cartouche (<PRÉFIXE>-<NN>, 00 = couverture). */
  const DOC_CODES = Object.freeze({
    aps: 'APS',
    brochure: 'BRO',
    catalog: 'CAT',
    book: 'PL'
  });

  const SMALL_WORDS = /^(?:à|a|au|aux|de|du|des|d|la|le|les|l|et|en|sur|sous|avec)$/;

  function woodGrainModule() {
    if (typeof WoodGrain !== 'undefined') return WoodGrain;
    if (typeof globalThis !== 'undefined' && globalThis.WoodGrain) return globalThis.WoodGrain;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./woodGrain.js'); } catch (_) { return null; }
    }
    return null;
  }

  /** Génère le code cartouche normalisé (<PRÉFIXE>-<NN>), identique pour tout projet. */
  function documentCode(kind, index = 0) {
    const prefix = DOC_CODES[kind] || String(kind || 'DOC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'DOC';
    const num = Math.max(0, Math.floor(Number(index) || 0));
    return `${prefix}-${String(num).padStart(2, '0')}`;
  }

  /** Nettoie les caractères hors table WinAnsi des polices intégrées de jsPDF. */
  function pdfSafe(value) {
    return String(value ?? '')
      .replace(/[\u202f\u00a0\u2009]/g, ' ')
      .replace(/−/g, '-')
      .replace(/≈/g, 'env.')
      .replace(/[→⇒⟶]/g, '->')
      .replace(/[★☆]/g, '*')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\ufe0f]/gu, '')
      .trim();
  }

  /** « VILLA SERENA » → « Villa Serena » tout en préservant les noms déjà en casse mixte. */
  function nameForDisplay(name = '') {
    const clean = String(name || '').trim();
    if (!clean || clean !== clean.toLocaleUpperCase('fr-FR')) return clean;
    return clean.toLocaleLowerCase('fr-FR').replace(/\p{L}+/gu, (word, offset) =>
      offset && SMALL_WORDS.test(word) ? word : word[0].toLocaleUpperCase('fr-FR') + word.slice(1));
  }

  function cleanStr(value) {
    const s = pdfSafe(value);
    return !s || s === '—' || s === '-' ? '' : s;
  }

  function cleanLogoData(value) {
    const s = String(value || '').trim();
    return /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(s) ? s : '';
  }

  /** Formate uniquement une date explicitement fournie ; renvoie '' si absente (jamais new Date()). */
  function formatDate(raw, { style = 'numeric' } = {}) {
    if (raw === null || raw === undefined || raw === '') return '';
    let parsed = null;
    if (raw instanceof Date) {
      if (!Number.isNaN(raw.getTime())) parsed = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return '';
      if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(trimmed)) {
        const candidate = new Date(trimmed.length === 10 ? `${trimmed}T12:00:00Z` : trimmed);
        if (!Number.isNaN(candidate.getTime())) parsed = candidate;
      } else {
        return pdfSafe(trimmed);
      }
    }
    if (!parsed) return '';
    if (style === 'long') {
      return pdfSafe(parsed.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }));
    }
    return pdfSafe(new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed));
  }

  /** Année explicite uniquement si une date a été renseignée ; sinon ''. */
  function extractYear(raw) {
    if (!raw) return '';
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return String(raw.getFullYear());
    const match = String(raw).match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
  }

  /** Surface géométrique d'une pièce (area précalculée, polygone ou rectangle bounds). */
  function roomArea(room) {
    if (!room) return 0;
    if (Number.isFinite(room.area)) return room.area;
    if (Array.isArray(room.poly) && room.poly.length >= 3) {
      let sum = 0;
      for (let i = 0; i < room.poly.length; i++) {
        const [x1, z1] = room.poly[i], [x2, z2] = room.poly[(i + 1) % room.poly.length];
        sum += x1 * z2 - x2 * z1;
      }
      return Math.abs(sum) / 2;
    }
    const b = room.bounds;
    if (b && Number.isFinite(b.xMin) && Number.isFinite(b.xMax) && Number.isFinite(b.zMin) && Number.isFinite(b.zMax)) {
      return Math.max(0, b.xMax - b.xMin) * Math.max(0, b.zMax - b.zMin);
    }
    return 0;
  }

  /**
   * Charge le profil du cabinet depuis GET /api/cabinet/profile (name, architect, logoUrl)
   * et convertit le logo PNG éventuel en data URL pour jsPDF. Sans serveur, renvoie null.
   */
  async function loadCabinetProfile(options = {}) {
    if (options.cabinet && typeof options.cabinet === 'object') return options.cabinet;
    const fetchFn = options.fetch || (typeof fetch === 'function' && typeof window !== 'undefined' ? fetch.bind(window) : null);
    if (!fetchFn) return null;
    try {
      const response = await fetchFn('api/cabinet/profile', { cache: 'no-store' });
      if (!response.ok) return null;
      const profile = await response.json();
      if (!profile || typeof profile !== 'object') return null;
      const out = {
        name: cleanStr(profile.name),
        architect: cleanStr(profile.architect),
        logoUrl: typeof profile.logoUrl === 'string' ? profile.logoUrl : '',
        logoData: cleanLogoData(profile.logoData)
      };
      if (!out.logoData && out.logoUrl && typeof FileReader !== 'undefined') {
        try {
          const logoRes = await fetchFn(out.logoUrl.replace(/^\//, ''), { cache: 'no-store' });
          if (logoRes.ok) {
            const blob = await logoRes.blob();
            out.logoData = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(cleanLogoData(reader.result));
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
          }
        } catch (_) { /* logo facultatif */ }
      }
      return out;
    } catch (_) {
      return null;
    }
  }

  function composeAgency(meta, cabinet) {
    const cabName = cleanStr(cabinet?.name);
    const metaArchitect = cleanStr(meta?.architect || meta?.agency);
    const cabArchitect = cleanStr(cabinet?.architect);
    const architect = metaArchitect || cabArchitect;
    const parts = [];
    if (cabName) parts.push(cabName);
    if (architect && !parts.some(p => p.toLocaleLowerCase('fr-FR') === architect.toLocaleLowerCase('fr-FR'))) {
      parts.push(architect);
    }
    return parts.join(' — ');
  }

  /**
   * Extrait les métadonnées véridiques du projet + profil du cabinet pour le cartouche commun.
   * Aucun champ vide n'est comblé par une valeur inventée (et « ArchiCam Studio » n'est jamais maître d'œuvre).
   */
  function extractMeta(data, options = {}) {
    const meta = data?.meta || {};
    const cabinet = options.cabinet || data?.cabinet || null;
    const rawName = cleanStr(meta.name);
    const rawPhase = cleanStr(meta.phase);
    const phase = rawPhase ? (PHASES[rawPhase] || rawPhase) : cleanStr(options.phase);
    const rawDate = options.date !== undefined ? options.date : (meta.issueDate || meta.date);
    const date = formatDate(rawDate, { style: options.dateStyle || 'numeric' });
    const agency = composeAgency(meta, cabinet);
    const cabinetName = cleanStr(cabinet?.name);
    const logoData = cleanLogoData(options.logoData || cabinet?.logoData);
    return {
      project: rawName || 'Projet architectural',
      displayProject: nameForDisplay(rawName || 'Projet'),
      subtitle: cleanStr(meta.subtitle),
      client: cleanStr(meta.client),
      location: cleanStr(meta.location || meta.address),
      phase,
      revision: cleanStr(meta.revision),
      date,
      year: extractYear(rawDate),
      agency,
      cabinetName,
      logoData,
      brand: cabinetName || cleanStr(meta.agency) || 'ARCHICAM STUDIO'
    };
  }

  /**
   * Retourne la liste des champs administratifs absents avant l'export PDF
   * (à afficher à l'écran ; les cases correspondantes sont masquées dans le PDF).
   */
  function missingFields(data, options = {}) {
    const meta = extractMeta(data, options);
    const checks = [
      ['client', 'Maître d\'ouvrage'],
      ['location', 'Localisation'],
      ['agency', 'Agence / maître d\'œuvre'],
      ['phase', 'Phase'],
      ['revision', 'Indice'],
      ['date', 'Date d\'émission']
    ];
    const missing = checks.filter(([key]) => !meta[key]).map(([, label]) => label);
    if (!missing.length) return { missing: [], message: '' };
    const list = missing.map((label, idx) => (idx === 0 ? label : label.charAt(0).toLocaleLowerCase('fr-FR') + label.slice(1))).join(', ');
    return {
      missing,
      message: `${list} non renseigné${missing.length > 1 ? 's' : ''}`
    };
  }

  function textWidth(doc, label, space = 0) {
    const base = typeof doc.getTextWidth === 'function' ? doc.getTextWidth(label) : 0;
    return base + (space && label.length > 1 ? space * (label.length - 1) : 0);
  }

  function text(doc, value, x, y, size = 9, { bold = false, serif = false, color = PALETTE.ink, align, maxWidth, space = 0 } = {}) {
    let label = pdfSafe(value);
    doc.setFont(serif ? 'times' : 'helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(space);
    if (maxWidth && textWidth(doc, label, space) > maxWidth) {
      while (label.length > 1 && textWidth(doc, `${label}...`, space) > maxWidth) label = label.slice(0, -1);
      label += '...';
    }
    // jsPDF n'intègre pas charSpace dans le décalage d'alignement droite/centré : on le compense ici.
    const extra = space && label.length > 1 ? space * (label.length - 1) : 0;
    const drawX = align === 'right' ? x - extra : (align === 'center' ? x - extra / 2 : x);
    doc.text(label, drawX, y, align ? { align } : undefined);
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  }

  /** Repères de coupe discrets aux quatre coins (marque d'atelier). */
  function cropMarks(doc, x, y, w, h, color = PALETTE.gold, len = 5.5, gap = 1.5) {
    doc.setDrawColor(color).setLineWidth(0.25);
    [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([cx, cy, sx, sy]) => {
      doc.line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
      doc.line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
    });
  }

  /** Motif fil de bois discret (vectoriel, déterministe). */
  function drawWoodGrain(doc, rect, options = {}) {
    const WG = woodGrainModule();
    if (!WG || typeof WG.drawPdf !== 'function') return;
    WG.drawPdf(doc, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      color: options.color || PALETTE.woodDark,
      lineWidth: options.lineWidth ?? 0.16,
      seed: options.seed ?? 11,
      knots: options.knots ?? 2,
      spacing: options.spacing ?? 5.6
    });
  }

  /** Bandeau supérieur unifié des couvertures portrait A4 (marque + type de document + filet). */
  function drawCoverHeader(doc, { x, y = 21, w, brand = 'ARCHICAM STUDIO', documentType = '', palette = PALETTE }) {
    const accent = palette.gold || palette.accent || PALETTE.gold;
    const sand = palette.sand || palette.light || PALETTE.sand;
    text(doc, brand.toUpperCase(), x, y, 8.6, { bold: true, color: accent, space: 1.5, maxWidth: w * 0.56 });
    if (documentType) {
      text(doc, documentType.toUpperCase(), x + w, y, 6.4, { bold: true, color: sand, align: 'right', space: 1.0, maxWidth: w * 0.44 });
    }
    doc.setDrawColor(sand).setLineWidth(0.28).line(x, y + 4.2, x + w, y + 4.2);
  }

  /** Bandeau de 3 chiffres clés (serif blanc + libellé or) sur fond sombre. */
  function drawFactsBand(doc, facts, { x, y, w, h = 24, palette = PALETTE }) {
    const ruleColor = palette.ruleDark || PALETTE.ruleDark;
    const accent = palette.gold || palette.accent || PALETTE.gold;
    const sand = palette.sand || palette.light || PALETTE.sand;
    const white = palette.white || PALETTE.white;
    doc.setDrawColor(ruleColor).setLineWidth(0.25);
    doc.line(x, y, x + w, y);
    doc.line(x, y + h, x + w, y + h);
    const colW = w / Math.max(1, facts.length);
    facts.forEach((fact, idx) => {
      const fx = x + idx * colW;
      if (idx > 0) doc.setDrawColor(ruleColor).setLineWidth(0.2).line(fx, y + 3.5, fx, y + h - 3.5);
      const pad = idx > 0 ? 4.5 : 0;
      const valueText = fact.unit ? `${fact.value} ${fact.unit}` : String(fact.value);
      text(doc, valueText, fx + pad, y + 12.2, 16.5, { serif: true, bold: true, color: white, maxWidth: colW - pad - 3 });
      text(doc, String(fact.label || '').toUpperCase(), fx + pad, y + 19.2, 5.6, { bold: true, color: accent, space: 0.65, maxWidth: colW - pad - 3 });
      if (fact.sub) {
        text(doc, fact.sub, fx + pad, y + 22.8, 5.4, { color: sand, maxWidth: colW - pad - 3 });
      }
    });
  }

  function drawLogo(doc, logoData, x, y, maxW, maxH) {
    const fmt = /^data:image\/png/i.test(logoData) ? 'PNG' : 'JPEG';
    let iw = 0, ih = 0;
    if (typeof doc.getImageProperties === 'function') {
      try {
        const props = doc.getImageProperties(logoData);
        if (Number.isFinite(props?.width) && props.width > 0 && Number.isFinite(props?.height) && props.height > 0) {
          iw = props.width; ih = props.height;
        }
      } catch (_) { /* repli */ }
    }
    let dw = maxW, dh = maxH;
    if (iw > 0 && ih > 0) {
      const scale = Math.min(maxW / iw, maxH / ih);
      dw = iw * scale;
      dh = ih * scale;
    } else {
      dw = maxH;
      dh = maxH;
    }
    doc.addImage(logoData, fmt, x, y + (maxH - dh) / 2, dw, dh);
    return dw;
  }

  /**
   * Cartouche architectural commun à toutes les couvertures (Cahier A3, Catalogue, APS, Brochures).
   * - Aucune case vide n'est imprimée : toute cellule ou ligne sans valeur est masquée et le bloc se resserre.
   * - Le logo du cabinet est affiché dans l'en-tête du cartouche s'il existe (sans recadrage).
   * - Ancrage bas par défaut (`anchor: 'bottom'`) pour rester calé sur la marge inférieure de la page.
   */
  function drawCartouche(doc, meta, box, options = {}) {
    const {
      theme = 'dark',
      documentLabel = '',
      code = '',
      palette = PALETTE,
      useDisplayName = false,
      anchor = 'bottom'
    } = options;
    const { x, y, w } = box;
    const maxH = box.h || 42;
    const isDark = theme === 'dark';
    const bg = isDark ? (palette.panel || palette.secondary || PALETTE.panel) : PALETTE.white;
    const border = isDark ? (palette.gold || palette.accent || PALETTE.gold) : PALETTE.ink;
    const accent = palette.gold || palette.accent || PALETTE.gold;
    const divider = isDark ? (palette.ruleDark || PALETTE.ruleDark) : PALETTE.rule;
    const labelColor = isDark ? (palette.sand || palette.light || PALETTE.sand) : PALETTE.muted;
    const valueColor = isDark ? PALETTE.white : PALETTE.ink;

    const projectValue = useDisplayName ? (meta.displayProject || meta.project) : meta.project;
    const val = v => {
      const s = cleanStr(v);
      return (!s || s === 'À préciser') ? '' : s;
    };

    const rawRows = [
      [{ span: 1, label: 'PROJET', value: val(projectValue), bold: true }],
      [
        { span: 0.52, label: 'MAÎTRE D\'OUVRAGE', value: val(meta.client) },
        { span: 0.48, label: 'LOCALISATION', value: val(meta.location) }
      ],
      [
        { span: 0.52, label: 'AGENCE / MAÎTRE D\'ŒUVRE', value: val(meta.agency) },
        { span: 0.48, label: 'DOCUMENT', value: val(documentLabel) }
      ],
      [
        { span: 0.44, label: 'PHASE', value: val(meta.phase) },
        { span: 0.22, label: 'INDICE', value: val(meta.revision) },
        { span: 0.34, label: 'DATE', value: val(meta.date) }
      ]
    ];

    // Filtrage strict : aucune case vide imprimée ; les lignes entièrement vides disparaissent.
    const rows = rawRows
      .map(cols => cols.filter(cell => Boolean(cell.value)))
      .filter(cols => cols.length > 0);

    const logoData = cleanLogoData(meta.logoData);
    const headH = logoData ? 10.6 : 6.8;
    const rowH = 8.8;
    const actualH = headH + rows.length * rowH;
    const drawY = anchor === 'bottom' ? (y + maxH - actualH) : y;

    // Cadre et bandeau d'or supérieur.
    doc.setFillColor(bg).rect(x, drawY, w, actualH, 'F');
    doc.setFillColor(accent).rect(x, drawY, w, 0.9, 'F');
    doc.setDrawColor(border).setLineWidth(0.35).rect(x, drawY, w, actualH);

    // En-tête du cartouche (+ logo du cabinet sans recadrage s'il est configuré).
    let headerTextX = x + 3.2;
    if (logoData) {
      const usedW = drawLogo(doc, logoData, x + 3.0, drawY + 1.9, Math.min(26, w * 0.24), headH - 3.0);
      headerTextX = x + 3.0 + usedW + 3.0;
    }
    const headerBaseline = drawY + (logoData ? 6.6 : 5.0);
    text(doc, 'CARTOUCHE', headerTextX, headerBaseline, 5.6, { bold: true, color: accent, space: 1.0 });
    if (code) {
      text(doc, code, x + w - 3.2, headerBaseline, 5.6, { bold: true, color: labelColor, align: 'right', space: 0.7 });
    }

    rows.forEach((cols, rIdx) => {
      const ry = drawY + headH + rIdx * rowH;
      doc.setDrawColor(divider).setLineWidth(0.2).line(x, ry, x + w, ry);
      const totalSpan = cols.reduce((sum, cell) => sum + cell.span, 0) || 1;
      let cx = x;
      cols.forEach((cell, cIdx) => {
        const cw = cIdx === cols.length - 1 ? (x + w - cx) : w * (cell.span / totalSpan);
        if (cIdx > 0) doc.setDrawColor(divider).setLineWidth(0.2).line(cx, ry, cx, ry + rowH);
        text(doc, cell.label, cx + 3.0, ry + 3.1, 4.9, { bold: true, color: labelColor, space: 0.45, maxWidth: cw - 5 });
        text(doc, cell.value, cx + 3.0, ry + rowH - 1.6, cell.bold ? 7.8 : 7.2, {
          bold: Boolean(cell.bold),
          color: valueColor,
          maxWidth: cw - 5.5
        });
        cx += cw;
      });
    });

    return { y: drawY, h: actualH, bottom: drawY + actualH, rows: rows.length };
  }

  return {
    PALETTE,
    PHASES,
    DOC_CODES,
    documentCode,
    pdfSafe,
    nameForDisplay,
    formatDate,
    extractYear,
    roomArea,
    loadCabinetProfile,
    extractMeta,
    missingFields,
    textWidth,
    text,
    cropMarks,
    drawWoodGrain,
    drawCoverHeader,
    drawFactsBand,
    drawCartouche
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PdfIdentity;
}
