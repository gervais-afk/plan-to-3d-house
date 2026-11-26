/**
 * Export Excel (.xlsx) natif et sans dépendance pour ArchiCam Studio.
 * Génère un classeur OOXML standard (PKZIP + XML) lisible par Excel, LibreOffice et Google Sheets :
 *  - Onglet 1 : Page de garde (identité cabinet, cartouche projet, synthèse reliée par formules)
 *  - Onglet 2 : Estimation par lots (fourchettes Bas / Haut en FCFA + formules =SUM(...))
 *  - Onglet 3 : Bordereau BQE (postes regroupés par lot, montants =B*D, sous-totaux par lot =SUM(...) et total général)
 *  - Onglet 4 : Métrés & Pièces (groupés par niveau, sous-totaux par niveau =SUM(...) et surfaces globales)
 */
const XlsxExport = (() => {
  // --- Table CRC-32 IEEE 802.3 ---
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(str));
    return Uint8Array.from(Buffer.from(String(str), 'utf8'));
  }

  function xmlEsc(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colRef(colIndex) {
    let n = colIndex + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function cellRef(row1, col0) {
    return `${colRef(col0)}${row1}`;
  }

  // --- Constructeur ZIP (méthode STORE 0, valide 100 % partout sans dépendance) ---
  function buildZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

    for (const entry of entries) {
      const nameBytes = encodeUtf8(entry.name);
      const dataBytes = entry.data instanceof Uint8Array ? entry.data : encodeUtf8(entry.data);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8
      lv.setUint16(8, 0, true); // STORE
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      localParts.push(local, dataBytes);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + dataBytes.length;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const part of centralParts) centralSize += part.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);

    const totalLen = centralOffset + centralSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const part of localParts) { out.set(part, pos); pos += part.length; }
    for (const part of centralParts) { out.set(part, pos); pos += part.length; }
    out.set(eocd, pos);
    return out;
  }

  // --- Styles OOXML (palette atelier ArchiCam : encre #161C19, or #B38646, lin #F7F5F0) ---
  // Index styles (s=...):
  // 0: Normal
  // 1: Titre page de garde (18pt gras encre)
  // 2: Kicker / sous-titre or (10pt gras #8C6329)
  // 3: En-tête de tableau (blanc gras sur fond #161C19)
  // 4: Titre de lot / sous-section (gras encre sur fond #ECE8DF)
  // 5: Total / Sous-total (gras encre sur fond #F2EDE2, bordures haut+bas)
  // 6: Montant FCFA entier (#,##0" FCFA")
  // 7: Montant FCFA gras total (style 5 + #,##0" FCFA")
  // 8: Nombre décimal (0.00)
  // 9: Surface m² (0.0" m²")
  // 10: Surface m² gras total (style 5 + 0.0" m²")
  // 11: Note discrète italique (#5A635D)
  // 12: Libellé gras
  // 13: Montant FCFA sous-total lot (style 4 + #,##0" FCFA")
  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0&quot; FCFA&quot;"/>
    <numFmt numFmtId="165" formatCode="0.00"/>
    <numFmt numFmtId="166" formatCode="0.0&quot; m²&quot;"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="10"/><color rgb="FF161C19"/><name val="Calibri"/></font>
    <font><b/><sz val="18"/><color rgb="FF161C19"/><name val="Georgia"/></font>
    <font><b/><sz val="10"/><color rgb="FF8C6329"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFF7F5F0"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF161C19"/><name val="Calibri"/></font>
    <font><i/><sz val="9"/><color rgb="FF5A635D"/><name val="Calibri"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF161C19"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFECE8DF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5EFE2"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFDAD5C8"/></left>
      <right style="thin"><color rgb="FFDAD5C8"/></right>
      <top style="thin"><color rgb="FFDAD5C8"/></top>
      <bottom style="thin"><color rgb="FFDAD5C8"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left/><right/>
      <top style="thin"><color rgb="FF161C19"/></top>
      <bottom style="double"><color rgb="FF161C19"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" applyFont="1" applyFill="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="2" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="4" fillId="4" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="166" fontId="4" fillId="4" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" horizontal="right"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  function renderCell(row1, col0, spec) {
    if (spec === null || spec === undefined) return '';
    const ref = cellRef(row1, col0);
    if (typeof spec === 'string') {
      return `<c r="${ref}" t="inlineStr" s="0"><is><t xml:space="preserve">${xmlEsc(spec)}</t></is></c>`;
    }
    if (typeof spec === 'number' && Number.isFinite(spec)) {
      return `<c r="${ref}" s="8"><v>${spec}</v></c>`;
    }
    const s = Number.isInteger(spec.s) ? spec.s : 0;
    if (spec.f) {
      const cached = typeof spec.v === 'number' && Number.isFinite(spec.v) ? `<v>${spec.v}</v>` : '';
      return `<c r="${ref}" s="${s}"><f>${xmlEsc(spec.f)}</f>${cached}</c>`;
    }
    if (typeof spec.v === 'number' && Number.isFinite(spec.v)) {
      return `<c r="${ref}" s="${s}"><v>${spec.v}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(spec.v ?? '')}</t></is></c>`;
  }

  function sheetXml({ rows, widths = [], merges = [] }) {
    const colsXml = widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const rowsXml = rows.map((row, rIdx) => {
      const r1 = rIdx + 1;
      const cells = (row.cells || row).map((c, cIdx) => renderCell(r1, cIdx, c)).filter(Boolean).join('');
      const ht = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      return `<row r="${r1}"${ht}>${cells}</row>`;
    }).join('');
    const mergesXml = merges.length
      ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  <pageSetup orientation="landscape" paperSize="9"/>
</worksheet>`;
  }

  function classifyMaterialLot(item) {
    const id = String(item?.id || '').toLowerCase();
    const label = String(item?.label || '').toLowerCase();
    if (/parpaing|ciment|sable|gravier|brique|ma[cç]onnerie/.test(id + ' ' + label)) return 'Lot 01 — Maçonnerie & Gros œuvre';
    if (/acier|fer|b[eé]ton|armature|coffrage|structure/.test(id + ' ' + label)) return 'Lot 02 — Structure béton & armatures';
    if (/toit|t[oô]le|tuile|charpente|couverture/.test(id + ' ' + label)) return 'Lot 03 — Couverture & Charpente';
    if (/carrelage|peinture|enduit|rev[eê]tement|menuiserie|porte|fen[eê]tre/.test(id + ' ' + label)) return 'Lot 04 — Revêtements & Second œuvre';
    return 'Lot 05 — Autres fournitures';
  }

  function roomAreaFallback(room) {
    if (Number.isFinite(room?.area)) return room.area;
    if (Array.isArray(room?.poly) && room.poly.length >= 3) {
      let sum = 0;
      for (let i = 0; i < room.poly.length; i++) {
        const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length];
        sum += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(sum) / 2;
    }
    if (room?.bounds) {
      return Math.max(0, (room.bounds.xMax - room.bounds.xMin) * (room.bounds.zMax - room.bounds.zMin));
    }
    return 0;
  }

  /**
   * Construit les 4 feuilles du classeur BQE & Métrés avec vraies formules Excel.
   */
  function buildWorkbookData(project = {}, estimateResult = null, options = {}) {
    const CE = options.CostEstimate || (typeof CostEstimate !== 'undefined' ? CostEstimate : null);
    const result = estimateResult || (CE ? CE.estimate(project, project.estimate) : {
      lots: [], annexes: [], materials: [], total: { low: 0, high: 0 }, reference: 0,
      quantities: { habitable: 0, annexes: 0, extLength: 0, intLength: 0, roofArea: 0, doors: 0, windows: 0, bays: 0 },
      rate: { low: 0, high: 0, label: '' }, excluded: ''
    });
    const meta = project.meta || {};
    const cabinet = options.cabinet || {};
    const cabinetName = String(cabinet.name || meta.architect || 'ArchiCam Studio').trim() || 'ArchiCam Studio';
    const architectName = String(meta.architect || cabinet.defaultArchitect || '').trim();
    const projectName = String(meta.name || 'Projet architectural').trim();
    const issueDate = String(meta.issueDate || new Date().toISOString().slice(0, 10));

    // ---- ONGLET 2 : ESTIMATION PAR LOTS ----
    const lotsRows = [];
    lotsRows.push({ height: 28, cells: [{ v: `${cabinetName.toUpperCase()} — ESTIMATION DES TRAVAUX PAR LOTS`, s: 1 }] });
    lotsRows.push({ height: 18, cells: [{ v: `${projectName} · ${result.rate?.label || 'Estimation indicative (FCFA)'}`, s: 2 }] });
    lotsRows.push({ height: 12, cells: [] });
    lotsRows.push({ height: 24, cells: [{ v: 'Lot / Poste de travaux', s: 3 }, { v: 'Fourchette basse (FCFA)', s: 3 }, { v: 'Fourchette haute (FCFA)', s: 3 }, { v: 'Moyenne indicative (FCFA)', s: 3 }] });

    const lotStartRow = 5;
    const lots = Array.isArray(result.lots) ? result.lots : [];
    lots.forEach((lot, idx) => {
      const r = lotStartRow + idx;
      const low = Math.round(Number(lot.low) || 0);
      const high = Math.round(Number(lot.high) || 0);
      lotsRows.push({
        height: 21,
        cells: [
          { v: lot.label || `Lot ${idx + 1}`, s: 0 },
          { v: low, s: 6 },
          { v: high, s: 6 },
          { f: `AVERAGE(B${r}:C${r})`, v: Math.round((low + high) / 2), s: 6 }
        ]
      });
    });
    const lotEndRow = Math.max(lotStartRow, lotStartRow + lots.length - 1);
    const worksTotalRow = lotStartRow + lots.length;
    const worksLowVal = lots.reduce((s, l) => s + Math.round(Number(l.low) || 0), 0);
    const worksHighVal = lots.reduce((s, l) => s + Math.round(Number(l.high) || 0), 0);
    lotsRows.push({
      height: 24,
      cells: [
        { v: 'TOTAL ENVELOPPE TRAVAUX', s: 5 },
        lots.length ? { f: `SUM(B${lotStartRow}:B${lotEndRow})`, v: worksLowVal, s: 7 } : { v: 0, s: 7 },
        lots.length ? { f: `SUM(C${lotStartRow}:C${lotEndRow})`, v: worksHighVal, s: 7 } : { v: 0, s: 7 },
        { f: `AVERAGE(B${worksTotalRow}:C${worksTotalRow})`, v: Math.round((worksLowVal + worksHighVal) / 2), s: 7 }
      ]
    });

    let globalTotalRow = worksTotalRow;
    const annexes = Array.isArray(result.annexes) ? result.annexes : [];
    if (annexes.length) {
      lotsRows.push({ height: 14, cells: [] });
      lotsRows.push({ height: 22, cells: [{ v: 'Postes annexes & frais de projet', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }] });
      const annexStartRow = lotsRows.length + 1;
      annexes.forEach((annex, idx) => {
        const r = annexStartRow + idx;
        const low = Math.round(Number(annex.low) || 0);
        const high = Math.round(Number(annex.high) || 0);
        lotsRows.push({
          height: 21,
          cells: [
            { v: annex.label || `Annexe ${idx + 1}`, s: 0 },
            { v: low, s: 6 },
            { v: high, s: 6 },
            { f: `AVERAGE(B${r}:C${r})`, v: Math.round((low + high) / 2), s: 6 }
          ]
        });
      });
      const annexEndRow = annexStartRow + annexes.length - 1;
      globalTotalRow = lotsRows.length + 1;
      const gLow = worksLowVal + annexes.reduce((s, a) => s + Math.round(Number(a.low) || 0), 0);
      const gHigh = worksHighVal + annexes.reduce((s, a) => s + Math.round(Number(a.high) || 0), 0);
      lotsRows.push({
        height: 24,
        cells: [
          { v: 'BUDGET GLOBAL DU PROJET (TRAVAUX + ANNEXES)', s: 5 },
          { f: `B${worksTotalRow}+SUM(B${annexStartRow}:B${annexEndRow})`, v: gLow, s: 7 },
          { f: `C${worksTotalRow}+SUM(C${annexStartRow}:C${annexEndRow})`, v: gHigh, s: 7 },
          { f: `AVERAGE(B${globalTotalRow}:C${globalTotalRow})`, v: Math.round((gLow + gHigh) / 2), s: 7 }
        ]
      });
    }
    lotsRows.push({ height: 12, cells: [] });
    lotsRows.push({ height: 26, cells: [{ v: `${result.excluded || ''} Estimation indicative non contractuelle — ne pas additionner le bordereau BQE (onglet suivant) à l’enveloppe travaux.`, s: 11 }] });

    // ---- ONGLET 3 : BORDEREAU BQE GROUPÉ PAR LOT ----
    const bqeRows = [];
    bqeRows.push({ height: 28, cells: [{ v: `${cabinetName.toUpperCase()} — BORDEREAU QUANTITATIF ET ESTIMATIF (BQE)`, s: 1 }] });
    bqeRows.push({ height: 18, cells: [{ v: `${projectName} · Quantités issues du plan (chutes comprises) · Formules dynamiques`, s: 2 }] });
    bqeRows.push({ height: 12, cells: [] });
    bqeRows.push({
      height: 24,
      cells: [
        { v: 'Désignation du poste / matériau', s: 3 },
        { v: 'Quantité', s: 3 },
        { v: 'Unité', s: 3 },
        { v: 'Prix unitaire (FCFA)', s: 3 },
        { v: 'Montant (FCFA)', s: 3 },
        { v: 'Source / Référence', s: 3 }
      ]
    });

    const groupedMaterials = new Map();
    for (const item of (Array.isArray(result.materials) ? result.materials : [])) {
      const lotName = item.lot || classifyMaterialLot(item);
      if (!groupedMaterials.has(lotName)) groupedMaterials.set(lotName, []);
      groupedMaterials.get(lotName).push(item);
    }

    const bqeSubtotalRefs = [];
    let bqeGrandTotalVal = 0;
    for (const [lotName, items] of groupedMaterials.entries()) {
      bqeRows.push({
        height: 22,
        cells: [{ v: lotName, s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }]
      });
      const startRow = bqeRows.length + 1;
      let lotVal = 0;
      for (const m of items) {
        const r = bqeRows.length + 1;
        const qty = Math.round((Number(m.quantity) || 0) * 100) / 100;
        const pu = Math.round(Number(m.unitPrice) || 0);
        const amount = Math.round(qty * pu);
        lotVal += amount;
        bqeRows.push({
          height: 20,
          cells: [
            { v: m.label || '', s: 0 },
            { v: qty, s: 8 },
            { v: m.unit === 'u' ? 'pièce' : (m.unit || ''), s: 0 },
            { v: pu, s: 6 },
            { f: `ROUND(B${r}*D${r},0)`, v: amount, s: 6 },
            { v: m.source || '', s: 0 }
          ]
        });
      }
      const endRow = bqeRows.length;
      const subRow = bqeRows.length + 1;
      bqeGrandTotalVal += lotVal;
      bqeSubtotalRefs.push(`E${subRow}`);
      bqeRows.push({
        height: 22,
        cells: [
          { v: `Sous-total — ${lotName}`, s: 4 },
          { v: '', s: 4 },
          { v: '', s: 4 },
          { v: '', s: 4 },
          { f: `SUM(E${startRow}:E${endRow})`, v: lotVal, s: 13 },
          { v: '', s: 4 }
        ]
      });
    }

    const bqeTotalRow = bqeRows.length + 1;
    bqeRows.push({
      height: 24,
      cells: [
        { v: 'TOTAL BORDEREAU D’ACHATS (MATÉRIAUX)', s: 5 },
        { v: '', s: 5 },
        { v: '', s: 5 },
        { v: '', s: 5 },
        bqeSubtotalRefs.length
          ? { f: bqeSubtotalRefs.join('+'), v: bqeGrandTotalVal, s: 7 }
          : { v: 0, s: 7 },
        { v: 'Déjà compris dans l’enveloppe gros œuvre', s: 5 }
      ]
    });

    // ---- ONGLET 4 : MÉTRÉS & PIÈCES PAR NIVEAU ----
    const roomsRows = [];
    roomsRows.push({ height: 28, cells: [{ v: `${cabinetName.toUpperCase()} — TABLEAU DES SURFACES & MÉTRÉS`, s: 1 }] });
    roomsRows.push({ height: 18, cells: [{ v: `${projectName} · Surfaces nettes mesurées sur la géométrie du plan`, s: 2 }] });
    roomsRows.push({ height: 12, cells: [] });
    roomsRows.push({
      height: 24,
      cells: [
        { v: 'Pièce / Espace', s: 3 },
        { v: 'Catégorie', s: 3 },
        { v: 'Revêtement de sol', s: 3 },
        { v: 'Surface (m²)', s: 3 }
      ]
    });

    const rooms = Array.isArray(project.rooms) ? project.rooms : [];
    const byLevel = new Map();
    for (const room of rooms) {
      const lv = Number(room.level) || 0;
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv).push(room);
    }
    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
    const levelSubRefs = [];
    let totalRoomAreaVal = 0;

    for (const lv of sortedLevels) {
      const levelLabel = lv === 0 ? 'Rez-de-chaussée (RDC)' : `Étage ${lv} (R+${lv})`;
      roomsRows.push({ height: 22, cells: [{ v: levelLabel, s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }, { v: '', s: 4 }] });
      const startRow = roomsRows.length + 1;
      let lvSum = 0;
      for (const room of byLevel.get(lv)) {
        const area = Math.round((CE?.roomArea ? CE.roomArea(room) : roomAreaFallback(room)) * 100) / 100;
        lvSum += area;
        roomsRows.push({
          height: 20,
          cells: [
            { v: room.name || 'Pièce', s: 0 },
            { v: room.habitable !== false ? 'Habitable' : 'Annexe', s: 0 },
            { v: room.floorType || '—', s: 0 },
            { v: area, s: 9 }
          ]
        });
      }
      const endRow = roomsRows.length;
      const subRow = roomsRows.length + 1;
      totalRoomAreaVal += lvSum;
      levelSubRefs.push(`D${subRow}`);
      roomsRows.push({
        height: 22,
        cells: [
          { v: `Sous-total — ${levelLabel}`, s: 4 },
          { v: '', s: 4 },
          { v: '', s: 4 },
          { f: `SUM(D${startRow}:D${endRow})`, v: Math.round(lvSum * 100) / 100, s: 10 }
        ]
      });
    }

    const roomsTotalRow = roomsRows.length + 1;
    roomsRows.push({
      height: 24,
      cells: [
        { v: 'SURFACE TOTALE DES PIÈCES', s: 5 },
        { v: '', s: 5 },
        { v: '', s: 5 },
        levelSubRefs.length
          ? { f: levelSubRefs.join('+'), v: Math.round(totalRoomAreaVal * 100) / 100, s: 10 }
          : { v: 0, s: 10 }
      ]
    });

    // ---- ONGLET 1 : PAGE DE GARDE (avec formules reliées aux autres onglets) ----
    const coverRows = [
      { height: 20, cells: [{ v: 'DOSSIER D’ÉCONOMIE & MÉTRÉS — ARCHICAM STUDIO', s: 2 }] },
      { height: 34, cells: [{ v: cabinetName, s: 1 }] },
      { height: 22, cells: [{ v: projectName + (meta.subtitle ? ` — ${meta.subtitle}` : ''), s: 12 }] },
      { height: 12, cells: [] },
      { height: 24, cells: [{ v: 'IDENTIFICATION DU DOSSIER', s: 3 }, { v: 'VALEUR', s: 3 }] },
      { height: 21, cells: [{ v: 'Cabinet / Agence', s: 12 }, { v: cabinetName, s: 0 }] },
      { height: 21, cells: [{ v: 'Architecte / Maître d’œuvre', s: 12 }, { v: architectName || '—', s: 0 }] },
      { height: 21, cells: [{ v: 'Maître d’ouvrage', s: 12 }, { v: meta.client || '—', s: 0 }] },
      { height: 21, cells: [{ v: 'Localisation', s: 12 }, { v: meta.location || '—', s: 0 }] },
      { height: 21, cells: [{ v: 'Référence', s: 12 }, { v: meta.reference || '—', s: 0 }] },
      { height: 21, cells: [{ v: 'Phase / Indice', s: 12 }, { v: [meta.phase, meta.revision].filter(Boolean).join(' · ') || '—', s: 0 }] },
      { height: 21, cells: [{ v: 'Date d’émission', s: 12 }, { v: issueDate, s: 0 }] },
      { height: 14, cells: [] },
      { height: 24, cells: [{ v: 'SYNTHÈSE AUTOMATIQUE (LIÉE AUX ONGLETS)', s: 3 }, { v: 'VALEUR CALCULÉE', s: 3 }] },
      { height: 22, cells: [{ v: 'Surface totale mesurée (toutes pièces)', s: 12 }, { f: `'Métrés & Pièces'!D${roomsTotalRow}`, v: Math.round(totalRoomAreaVal * 100) / 100, s: 10 }] },
      { height: 22, cells: [{ v: 'Surface habitable (métré)', s: 12 }, { v: Math.round((Number(result.quantities?.habitable) || 0) * 100) / 100, s: 9 }] },
      { height: 22, cells: [{ v: 'Surface annexes (porches, terrasses…)', s: 12 }, { v: Math.round((Number(result.quantities?.annexes) || 0) * 100) / 100, s: 9 }] },
      { height: 22, cells: [{ v: 'Toiture estimée', s: 12 }, { v: Math.round((Number(result.quantities?.roofArea) || 0) * 100) / 100, s: 9 }] },
      { height: 22, cells: [{ v: 'Enveloppe travaux — fourchette basse', s: 12 }, { f: `'Estimation par lots'!B${worksTotalRow}`, v: worksLowVal, s: 7 }] },
      { height: 22, cells: [{ v: 'Enveloppe travaux — fourchette haute', s: 12 }, { f: `'Estimation par lots'!C${worksTotalRow}`, v: worksHighVal, s: 7 }] },
      { height: 22, cells: [{ v: 'Budget global (travaux + annexes) — bas', s: 12 }, { f: `'Estimation par lots'!B${globalTotalRow}`, v: worksLowVal, s: 7 }] },
      { height: 22, cells: [{ v: 'Total bordereau matériaux BQE (inclus gros œuvre)', s: 12 }, { f: `'Bordereau BQE'!E${bqeTotalRow}`, v: bqeGrandTotalVal, s: 7 }] },
      { height: 14, cells: [] },
      { height: 28, cells: [{ v: 'AVERTISSEMENT : Document indicatif généré depuis la maquette ArchiCam Studio. Ne pas additionner le bordereau des matériaux au budget global travaux. Les prix doivent être confirmés auprès des entreprises et fournisseurs.', s: 11 }] }
    ];

    return {
      sheets: [
        { name: 'Page de garde', rows: coverRows, widths: [44, 34], merges: ['A1:B1', 'A2:B2', 'A3:B3', 'A24:B24'] },
        { name: 'Estimation par lots', rows: lotsRows, widths: [44, 24, 24, 24], merges: ['A1:D1', 'A2:D2'] },
        { name: 'Bordereau BQE', rows: bqeRows, widths: [42, 14, 12, 22, 24, 30], merges: ['A1:F1', 'A2:F2'] },
        { name: 'Métrés & Pièces', rows: roomsRows, widths: [34, 16, 22, 18], merges: ['A1:D1', 'A2:D2'] }
      ],
      summary: {
        cabinetName,
        projectName,
        lotCount: lots.length,
        materialLotCount: groupedMaterials.size,
        materialCount: (result.materials || []).length,
        roomCount: rooms.length,
        worksTotalRow,
        bqeTotalRow,
        roomsTotalRow
      }
    };
  }

  function exportXlsx(project, estimateResult = null, options = {}) {
    const wb = buildWorkbookData(project, estimateResult, options);
    const sheetCount = wb.sheets.length;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n  ')}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>
    ${wb.sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n    ')}
  </sheets>
  <calcPr fullCalcOnLoad="1"/>
</workbook>`;

    const entries = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
      { name: 'xl/styles.xml', data: stylesXml() },
      ...wb.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
    ];

    return {
      bytes: buildZip(entries),
      summary: wb.summary,
      entries
    };
  }

  async function downloadXlsx(project, estimateResult = null, options = {}) {
    let cabinet = options.cabinet || null;
    if (!cabinet && typeof fetch === 'function') {
      try {
        const res = await fetch('api/cabinet/profile', { cache: 'no-store' });
        if (res.ok) cabinet = await res.json();
      } catch { /* repli nom par défaut */ }
    }
    const { bytes, summary } = exportXlsx(project, estimateResult, { ...options, cabinet });
    const slug = String(options.slug || project?.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-') || 'projet';
    const filename = options.filename || `${slug}-bqe-metres.xlsx`;
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
    }
    return { filename, size: bytes.length, summary };
  }

  return { buildWorkbookData, exportXlsx, downloadXlsx, classifyMaterialLot, colRef };
})();

if (typeof module === 'object' && module.exports) module.exports = XlsxExport;
