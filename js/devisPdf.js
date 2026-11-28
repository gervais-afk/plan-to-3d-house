/**
 * DEVIS ESTIMATIF — Bordereau quantitatif estimatif (BQE) en FCFA.
 *
 * Complète l'export Excel (`js/xlsxExport.js`) par un document PDF prêt à présenter :
 *  1. page de garde : cartouche légal du cabinet et du projet, synthèse des surfaces,
 *     standing, enveloppe travaux (fourchette) et total par lot ;
 *  2. bordereau des postes (matériaux et ouvrages) avec quantités, unités, prix unitaires ;
 *  3. annexes (études, extérieurs), enveloppe globale, conditions et réserves, signatures.
 *
 * Règles du dispositif, comme pour l'APS et le catalogue :
 *  - aucun champ légal n'est inventé : une mention non renseignée est masquée et signalée ;
 *  - les montants restent une FOURCHETTE indicative, jamais un engagement de prix ;
 *  - le document est produit localement, sans envoi du projet au serveur.
 *
 * UMD : navigateur (`window.DevisPdf`) et tests Node (`require('../js/devisPdf.js')`).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DevisPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const W = 210, H = 297, M = 14;
  const PALETTE = {
    ink: '#161C19', muted: '#5F6A63', rule: '#CDCeC1', paper: '#F7F5F0',
    accent: '#B38646', accentInk: '#7A5A20', light: '#ECEAE1', white: '#FFFFFF', danger: '#A33A2C'
  };

  function resolveDep(overrides, key, globalName, relPath) {
    if (overrides && overrides[key]) return overrides[key];
    if (root && root[globalName]) return root[globalName];
    if (typeof require === 'function' && relPath) {
      try { return require(relPath); } catch { return null; }
    }
    return null;
  }

  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function pdfSafe(value) {
    return String(value ?? '')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0|\u202F/g, ' ')
      .replace(/[^\x00-\xFF]/g, '');
  }

  function money(value) {
    return `${nf0.format(Math.round(Number(value) || 0))} FCFA`;
  }

  function qty(value, unit) {
    const n = Number(value) || 0;
    const text = Math.abs(n) >= 100 || Number.isInteger(n) ? nf0.format(n) : nf1.format(n);
    return unit ? `${text} ${unit}` : text;
  }

  function surface(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : `${nf1.format(Number(value))} m²`;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function frDate(iso) {
    const raw = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
  }

  /** Modèle du document : tout ce que le PDF affiche, calculé une seule fois. */
  function buildModel(project, estimate, options = {}) {
    const CostEstimate = resolveDep(options, 'CostEstimate', 'CostEstimate', './costEstimate.js');
    const est = estimate || (CostEstimate ? CostEstimate.estimate(project, project?.estimate) : null);
    if (!est) throw new Error('Estimation indisponible : impossible de composer le devis.');

    const meta = project?.meta || {};
    const cabinet = options.cabinet || null;
    const quantity = est.quantities || {};
    const totals = est.total || { low: 0, mid: 0, high: 0 };
    const reference = Number(est.reference) || Number(quantity.habitable) || 0;
    const generatedAt = options.generatedAt || today();

    const signatures = [
      { label: 'Agence / maître d\'œuvre', value: cabinet?.agency || cabinet?.name || meta.architect || '' },
      { label: 'Architecte', value: cabinet?.defaultArchitect || meta.architect || '' }
    ].filter(item => item.value);

    const cartouche = [
      { label: 'Maître d\'ouvrage', value: meta.client || '' },
      { label: 'Localisation', value: meta.location || '' },
      { label: 'Agence / maître d\'œuvre', value: cabinet?.agency || cabinet?.name || meta.agency || '' },
      { label: 'Phase', value: meta.phase || '' },
      { label: 'Indice', value: meta.revision || meta.indice || '' },
      { label: 'Date d\'émission', value: meta.issueDate ? frDate(meta.issueDate) : '' }
    ];

    const missing = cartouche.filter(item => !item.value).map(item => item.label);

    const conditions = [
      `Montants exprimés en francs CFA (FCFA), ${est.rate?.ht ? 'hors taxes' : 'toutes taxes comprises selon le taux retenu'}, arrondis au franc.`,
      'Fourchette indicative d\'avant-projet : les prix unitaires sont des ordres de grandeur datés, à confirmer par la consultation des entreprises.',
      'Ne comprend ni le foncier, ni les honoraires d\'architecture (voir l\'annexe « études »), ni les travaux particuliers non décrits au bordereau.',
      'Les quantités sont calculées géométriquement depuis le plan (murs, ouvertures, pièces, toiture) et ne remplacent pas un métré d\'exécution.',
      'Document de travail : il ne constitue pas un devis contractuel et n\'engage ni le maître d\'ouvrage ni l\'agence.'
    ];

    return {
      slug: meta.slug || 'projet',
      name: meta.name || 'Projet sans nom',
      subtitle: meta.subtitle || '',
      generatedAt,
      generatedLabel: frDate(generatedAt),
      cabinet,
      cartouche,
      missing,
      signatures,
      standing: est.rate?.label || '',
      reference,
      surfaces: {
        habitable: quantity.habitable,
        habitableNet: quantity.habitableNet ?? est.habitableNet,
        annexes: quantity.annexes,
        levels: quantity.levels
      },
      totals: { low: Number(totals.low) || 0, mid: Number(totals.mid) || 0, high: Number(totals.high) || 0 },
      overall: { low: Number(est.overall?.low) || 0, high: Number(est.overall?.high) || 0 },
      lots: (est.lots || []).map(lot => ({ label: lot.label, low: lot.low, high: lot.high })),
      annexes: (est.annexes || []).map(item => ({ label: item.label, low: item.low, high: item.high })),
      materials: (est.materials || []).map(item => ({
        label: item.label,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        cost: item.cost,
        sourced: item.sourced !== false
      })),
      conditions
    };
  }

  // --- primitives de mise en page -------------------------------------------------

  function text(doc, value, x, y, size = 9, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(opts.color || PALETTE.ink);
    const lines = opts.maxWidth ? doc.splitTextToSize(pdfSafe(value), opts.maxWidth) : [pdfSafe(value)];
    doc.text(lines, x, y, opts.align ? { align: opts.align } : undefined);
    return y + (lines.length ? lines.length * size * 0.38 : 0);
  }

  function rule(doc, y, color = PALETTE.rule, width = 0.25) {
    doc.setDrawColor(color);
    doc.setLineWidth(width);
    doc.line(M, y, W - M, y);
  }

  function header(doc, model, kicker) {
    doc.setFillColor(PALETTE.ink);
    doc.rect(0, 0, W, 22, 'F');
    text(doc, model.cabinet?.name || 'ArchiCam Studio', M, 9, 11, { bold: true, color: PALETTE.white });
    text(doc, kicker, M, 15, 7.6, { color: '#D9D6C9' });
    text(doc, model.generatedLabel, W - M, 9, 8, { color: PALETTE.white, align: 'right' });
    text(doc, 'Devis estimatif · BQE', W - M, 15, 7.6, { color: '#D9D6C9', align: 'right' });
  }

  function footer(doc, model, page, pages) {
    const y = H - 12;
    rule(doc, y - 4);
    text(doc, `${model.name} · devis estimatif ${model.generatedLabel}`, M, y, 7.2, { color: PALETTE.muted });
    text(doc, `Page ${page} / ${pages}`, W - M, y, 7.2, { color: PALETTE.muted, align: 'right' });
  }

  function sectionTitle(doc, label, y) {
    text(doc, label, M, y, 10.5, { bold: true });
    doc.setDrawColor(PALETTE.accent);
    doc.setLineWidth(0.6);
    doc.line(M, y + 1.6, M + 26, y + 1.6);
    return y + 8;
  }

  function table(doc, columns, rows, startY, options = {}) {
    let y = startY;
    const rowH = options.rowH || 6.4;
    const fontSize = options.fontSize || 8.4;

    const drawHead = () => {
      doc.setFillColor(PALETTE.light);
      doc.rect(M, y - 4.6, W - 2 * M, rowH, 'F');
      let x = M + 2;
      for (const col of columns) {
        text(doc, col.label, col.align === 'right' ? x + col.w - 2 : x, y, fontSize, {
          bold: true, color: PALETTE.accentInk, align: col.align === 'right' ? 'right' : undefined
        });
        x += col.w;
      }
      y += rowH;
    };

    drawHead();
    for (const row of rows) {
      const cells = row.cells || row;
      const first = doc.splitTextToSize(pdfSafe(cells[0] ?? ''), columns[0].w - 4);
      const height = Math.max(rowH, first.length * fontSize * 0.38 + 3.2);
      if (y + height > H - 24) {
        doc.addPage();
        y = 26;
        drawHead();
      }
      let x = M + 2;
      columns.forEach((col, index) => {
        const value = cells[index] ?? '';
        const align = col.align === 'right' ? 'right' : undefined;
        const at = align ? x + col.w - 2 : x;
        text(doc, value, at, y, fontSize, { align, maxWidth: align ? null : col.w - 4, bold: Boolean(row.emphasis && index === 0) });
        x += col.w;
      });
      y += height;
      doc.setDrawColor('#E4E2D8');
      doc.setLineWidth(0.15);
      doc.line(M, y - 4.4, W - M, y - 4.4);
    }
    if (options.totalRow) {
      const cells = options.totalRow;
      let x = M + 2;
      columns.forEach((col, index) => {
        const align = col.align === 'right' ? 'right' : undefined;
        const at = align ? x + col.w - 2 : x;
        text(doc, cells[index] ?? '', at, y, fontSize + 0.4, { bold: true, align, color: PALETTE.accentInk });
        x += col.w;
      });
      y += rowH;
    }
    return y;
  }

  function keyValueGrid(doc, entries, startY) {
    let y = startY;
    const colW = (W - 2 * M) / 2;
    entries.forEach((entry, index) => {
      if (index % 2 === 0 && index > 0) y += 9;
      const half = index % 2;
      const x = M + half * colW;
      text(doc, entry.label.toUpperCase(), x, y, 6.6, { color: PALETTE.muted, bold: true });
      text(doc, entry.value, x, y + 4.4, 9.4, { bold: true, maxWidth: colW - 6 });
    });
    return y + 10;
  }

  function renderDevis(doc, model) {
    // ---------- Page 1 : page de garde et synthèse ----------
    header(doc, model, 'Document de travail — ne constitue pas un engagement de prix');

    let y = 34;
    text(doc, 'DEVIS ESTIMATIF', M, y, 19, { bold: true });
    y = text(doc, 'Bordereau quantitatif estimatif (BQE) — montants en francs CFA', M, y + 6, 9.2, { color: PALETTE.muted });
    y += 4;

    text(doc, model.name, M, y + 4, 14, { bold: true, maxWidth: W - 2 * M });
    y += 12;
    if (model.subtitle) {
      y = text(doc, model.subtitle, M, y, 9.4, { color: PALETTE.muted, maxWidth: W - 2 * M }) + 2;
    }
    y += 3;
    rule(doc, y);
    y += 9;

    // Cartouche légal : uniquement les mentions réellement renseignées (Porte E).
    const filled = model.cartouche.filter(item => item.value);
    if (filled.length) {
      y = sectionTitle(doc, 'Cartouche du dossier', y);
      y = keyValueGrid(doc, filled, y);
    }
    if (model.missing.length) {
      text(doc, `Mentions non renseignées (${model.missing.join(', ')}) : masquées du cartouche, jamais inventées.`,
        M, y, 7.6, { color: PALETTE.danger, maxWidth: W - 2 * M });
      y += 8;
    }
    rule(doc, y);
    y += 9;

    // Synthèse du projet
    y = sectionTitle(doc, 'Synthèse du projet', y);
    y = keyValueGrid(doc, [
      { label: 'Surface habitable nette', value: surface(model.surfaces.habitableNet) },
      { label: 'Surface habitable brute', value: surface(model.surfaces.habitable) },
      { label: 'Annexes', value: surface(model.surfaces.annexes) },
      { label: 'Niveaux', value: String(model.surfaces.levels || 1) },
      { label: 'Standing retenu', value: model.standing || '—' },
      { label: 'Surface de référence', value: surface(model.reference) }
    ], y);
    y += 2;

    // Enveloppe travaux
    doc.setFillColor(PALETTE.paper);
    doc.rect(M, y - 2, W - 2 * M, 26, 'F');
    doc.setDrawColor(PALETTE.accent);
    doc.setLineWidth(0.4);
    doc.rect(M, y - 2, W - 2 * M, 26, 'S');
    text(doc, 'ENVELOPPE TRAVAUX (FOURCHETTE INDICATIVE)', M + 4, y + 5, 7.4, { bold: true, color: PALETTE.accentInk });
    text(doc, `${money(model.totals.low)}  –  ${money(model.totals.high)}`, M + 4, y + 14, 15, { bold: true });
    text(doc, `mi-point ${money(model.totals.mid)}`, W - M - 4, y + 14, 8.6, { align: 'right', color: PALETTE.muted });
    text(doc, `soit environ ${money(model.reference ? model.totals.mid / model.reference : 0)} par m² de surface de référence`,
      M + 4, y + 20, 7.6, { color: PALETTE.muted });
    y += 34;

    // Total par lot
    y = sectionTitle(doc, 'Synthèse par lot', y);
    y = table(doc, [
      { label: 'Lot', w: 96 },
      { label: 'Montant bas', w: 44, align: 'right' },
      { label: 'Montant haut', w: 42, align: 'right' }
    ], model.lots.map(lot => [lot.label, money(lot.low), money(lot.high)]), y, {
      totalRow: ['TOTAL TRAVAUX', money(model.totals.low), money(model.totals.high)]
    });
    y += 7;

    text(doc, 'Ce document est une estimation d\'avant-projet : les montants sont donnés en fourchette et ne constituent pas un devis contractuel.',
      M, y, 7.8, { color: PALETTE.muted, maxWidth: W - 2 * M });

    // ---------- Page 2 : bordereau détaillé ----------
    doc.addPage();
    header(doc, model, 'Bordereau quantitatif estimatif — postes et ouvrages');
    y = 34;
    y = sectionTitle(doc, 'Bordereau estimatif — postes et ouvrages', y);
    y = text(doc, `${model.materials.length} poste(s) issus du métré géométrique du plan. Prix unitaires indicatifs en FCFA.`,
      M, y, 8, { color: PALETTE.muted, maxWidth: W - 2 * M }) + 5;

    if (model.materials.length) {
      const materialTotal = model.materials.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
      y = table(doc, [
        { label: 'Désignation', w: 96 },
        { label: 'Quantité', w: 30, align: 'right' },
        { label: 'P.U.', w: 28, align: 'right' },
        { label: 'Montant', w: 28, align: 'right' }
      ], model.materials.map(item => [
        `${item.label}${item.sourced ? '' : ' *'}`,
        qty(item.quantity, item.unit),
        money(item.unitPrice),
        money(item.cost)
      ]), y, { totalRow: ['TOTAL DES POSTES CHIFFRÉS', '', '', money(materialTotal)] });
      y += 6;
      if (model.materials.some(item => !item.sourced)) {
        text(doc, '* prix non sourcé : ordre de grandeur à confirmer.', M, y, 7.4, { color: PALETTE.muted });
        y += 6;
      }
    } else {
      y = text(doc, 'Aucun poste détaillé disponible pour ce plan.', M, y, 9, { color: PALETTE.muted }) + 6;
    }

    // ---------- Annexes, conditions, signatures ----------
    if (y > H - 110) { doc.addPage(); header(doc, model, 'Annexes et conditions'); y = 34; } else { y += 8; }
    y = sectionTitle(doc, 'Annexes et enveloppe globale', y);
    const annexRows = model.annexes.map(item => [item.label, money(item.low), money(item.high)]);
    annexRows.push(['ENVELOPPE GLOBALE (travaux + annexes)', money(model.overall.low), money(model.overall.high)]);
    y = table(doc, [
      { label: 'Poste annexe', w: 106 },
      { label: 'Montant bas', w: 40, align: 'right' },
      { label: 'Montant haut', w: 36, align: 'right' }
    ], annexRows, y, { emphasisLast: true });
    y += 10;

    y = sectionTitle(doc, 'Conditions et réserves', y);
    for (const condition of model.conditions) {
      const lines = doc.splitTextToSize(pdfSafe(`— ${condition}`), W - 2 * M - 4);
      if (y + lines.length * 3.4 > H - 46) { doc.addPage(); header(doc, model, 'Conditions et réserves'); y = 34; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(PALETTE.ink);
      doc.text(lines, M + 1, y);
      y += lines.length * 3.6 + 2.2;
    }

    y += 4;
    if (y > H - 60) { doc.addPage(); header(doc, model, 'Bon pour accord'); y = 34; }
    rule(doc, y);
    y += 8;
    text(doc, 'BON POUR ACCORD', M, y, 8.4, { bold: true, color: PALETTE.accentInk });
    y += 8;
    const signColumns = [
      { label: 'Le maître d\'ouvrage', value: model.cartouche.find(item => item.label === 'Maître d\'ouvrage')?.value || '' },
      { label: model.signatures.find(item => /architecte/i.test(item.label))?.label || 'L\'architecte', value: model.signatures.find(item => /architecte/i.test(item.label))?.value || '' }
    ];
    signColumns.forEach((column, index) => {
      const x = M + index * ((W - 2 * M) / 2);
      doc.setDrawColor(PALETTE.rule);
      doc.setLineWidth(0.2);
      doc.rect(x, y, (W - 2 * M) / 2 - 6, 24);
      text(doc, column.label, x + 3, y + 5, 7.4, { bold: true, color: PALETTE.muted });
      text(doc, column.value || 'nom, date et signature', x + 3, y + 10, 8.2, { color: column.value ? PALETTE.ink : PALETTE.muted, maxWidth: (W - 2 * M) / 2 - 12 });
    });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      footer(doc, model, page, pages);
    }
    return { pages };
  }

  function loadJsPDF(options = {}) {
    if (options.JsPDF) return Promise.resolve(options.JsPDF);
    if (root.jspdf?.jsPDF) return Promise.resolve(root.jspdf.jsPDF);
    if (typeof document === 'undefined') return Promise.reject(new Error('jsPDF indisponible hors navigateur.'));
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/jspdf-4.2.1.umd.min.js';
      script.onload = () => (root.jspdf?.jsPDF ? resolve(root.jspdf.jsPDF) : reject(new Error('jsPDF introuvable après chargement.')));
      script.onerror = () => reject(new Error('Chargement de jsPDF impossible.'));
      document.head.append(script);
    });
  }

  async function exportPDF(project, estimate = null, options = {}) {
    const JsPDF = await loadJsPDF(options);
    const model = buildModel(project, estimate, options);
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    if (typeof doc.setProperties === 'function') {
      doc.setProperties({
        title: pdfSafe(`Devis estimatif — ${model.name}`),
        subject: 'Bordereau quantitatif estimatif (FCFA)',
        creator: 'ArchiCam Studio',
        author: pdfSafe(model.cabinet?.name || 'ArchiCam Studio')
      });
    }
    const { pages } = renderDevis(doc, model);
    const slug = String(model.slug || 'projet').replace(/[^a-z0-9-]/gi, '-') || 'projet';
    const filename = options.filename || `${slug}-devis-estimatif.pdf`;
    if (options.save !== false && typeof doc.save === 'function' && typeof window !== 'undefined') {
      doc.save(filename);
    }
    return { filename, pages, model, doc };
  }

  return { buildModel, exportPDF, renderDevis, money, qty, surface, frDate };
});
