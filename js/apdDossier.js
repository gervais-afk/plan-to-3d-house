/**
 * Dossier APD / Permis de Construire guidé — évaluation des 8 pièces réglementaires
 * (PC-01 à PC-08) et assemblage d'un dossier PDF relié A4 prêt pour le dépôt ou la validation.
 * Fonctionne en UMD (navigateur + tests Node).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ApdDossier = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtMoney = n => `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)).replace(/\u202f/g, ' ')} FCFA`;

  function resolveDep(overrides, key, globalName, relPath) {
    if (overrides && overrides[key]) return overrides[key];
    if (root && root[globalName]) return root[globalName];
    if (typeof require === 'function' && relPath) {
      try { return require(relPath); } catch { return null; }
    }
    return null;
  }

  function allRooms(project) {
    if (!project) return [];
    if (Array.isArray(project.rooms) && project.rooms.length) return project.rooms;
    if (project.levels && typeof project.levels === 'object') {
      return Object.values(project.levels).flatMap(l => (l && Array.isArray(l.rooms) ? l.rooms : []));
    }
    return [];
  }

  function allWalls(project) {
    if (!project) return [];
    if (Array.isArray(project.walls) && project.walls.length) return project.walls;
    if (project.levels && typeof project.levels === 'object') {
      return Object.values(project.levels).flatMap(l => (l && Array.isArray(l.walls) ? l.walls : []));
    }
    return [];
  }

  /**
   * Évalue les 8 pièces réglementaires du dossier APD / Permis de construire.
   */
  function evaluate({ project = null, cabinet = null, media = null, planches = [], deps = null } = {}) {
    const p = project || {};
    const meta = p.meta || {};
    const cfg = p.config || {};
    const rooms = allRooms(p);
    const walls = allWalls(p);
    const images = Array.isArray(media?.images) ? media.images : [];
    const renders = Array.isArray(media?.renders) ? media.renders : [];
    const savedPlanches = Array.isArray(planches) ? planches : [];
    const TechnicalDrawings = resolveDep(deps, 'TechnicalDrawings', 'TechnicalDrawings', './technicalDrawings.js');
    const CostEstimate = resolveDep(deps, 'CostEstimate', 'CostEstimate', './costEstimate.js');

    const roof = TechnicalDrawings ? TechnicalDrawings.computeRoofPlan(p) : { valid: false };
    const secA = TechnicalDrawings ? TechnicalDrawings.computeSection(p, { axis: 'x', label: 'Coupe longitudinale A–A' }) : { valid: false };
    const est = CostEstimate && rooms.length ? CostEstimate.estimate(p, p.estimate || {}) : null;

    const hasLocation = Boolean(String(meta.location || '').trim());
    const hasClient = Boolean(String(meta.client || '').trim());
    const hasAgency = Boolean(String(meta.agency || cabinet?.name || '').trim());
    const hasMasse = savedPlanches.some(pl => /masse|situation/i.test(`${pl.title || ''} ${pl.category || ''}`))
      || images.some(im => /plan-masse/i.test(im.id || im.file || ''));
    const hasFacades = images.some(im => /facade|perspective-01|perspective-03/i.test(im.id || im.file || ''))
      || renders.length >= 2
      || savedPlanches.some(pl => /fa[çc]ade|elevation/i.test(`${pl.title || ''} ${pl.category || ''}`));

    const pieces = [
      {
        code: 'PC-01',
        title: 'Identification & Plan de situation',
        status: hasLocation && hasClient && hasAgency ? 'ready' : (hasAgency || hasLocation ? 'partial' : 'missing'),
        detail: hasLocation && hasClient
          ? `${meta.location} · Maître d’ouvrage : ${meta.client}`
          : 'Renseigner maître d’ouvrage, localisation et cabinet dans le cartouche Projet.'
      },
      {
        code: 'PC-02',
        title: 'Plan de masse & implantation',
        status: hasMasse ? 'ready' : (roof.valid ? 'partial' : 'missing'),
        detail: hasMasse
          ? 'Plan de masse présent dans les planches du dossier.'
          : (roof.valid ? `Emprise calculée (${nf.format(roof.outer.w)} × ${nf.format(roof.outer.d)} m) — importer le plan de masse cadastral.` : 'Importer un plan de masse ou tracer l’emprise.')
      },
      {
        code: 'PC-03',
        title: 'Plans cotés des niveaux (RDC / R+1)',
        status: rooms.length > 0 && walls.length > 0 ? 'ready' : 'missing',
        detail: rooms.length ? `${rooms.length} pièce(s) et ${walls.length} mur(s) cotés issus de la maquette.` : 'Aucun plan de niveau tracé.'
      },
      {
        code: 'PC-04',
        title: 'Coupes architecturales 2D (A–A & B–B)',
        status: secA.valid ? 'ready' : 'missing',
        detail: secA.valid
          ? `Coupes vectorielles exactes générées (hauteur totale +${nf.format(roof.valid ? roof.ridgeY : (secA.maxY || 0))} m).`
          : 'Tracer les murs extérieurs pour générer les coupes vectorielles.'
      },
      {
        code: 'PC-05',
        title: 'Plan de toiture & évacuation EP',
        status: roof.valid ? 'ready' : 'missing',
        detail: roof.valid
          ? `${roof.typeLabel} · pente ${nf.format(roof.slopePercent)} % · ${nf.format(roof.roofArea)} m² de couverture.`
          : 'Définir l’enveloppe du bâtiment.'
      },
      {
        code: 'PC-06',
        title: 'Façades & insertion architecturale',
        status: hasFacades ? 'ready' : 'partial',
        detail: hasFacades
          ? `${images.length + renders.length} vue(s) de façade / perspectives disponibles.`
          : 'Capturer les façades depuis la visite 3D ou joindre les élévations PDF.'
      },
      {
        code: 'PC-07',
        title: 'Notice descriptive & tableau des surfaces',
        status: rooms.length > 0 ? 'ready' : 'missing',
        detail: rooms.length
          ? `Habitable ${nf.format(rooms.filter(r => r.habitable !== false).reduce((s, r) => s + (Number(r.area) || 0), 0))} m² · Hauteur sous plafond ${nf.format(cfg.wallHeight || 2.8)} m.`
          : 'Définir le programme des pièces.'
      },
      {
        code: 'PC-08',
        title: 'Estimation financière & pièces jointes PDF',
        status: est ? 'ready' : 'missing',
        detail: est
          ? `Enveloppe travaux : ${fmtMoney(est.total.low)} – ${fmtMoney(est.total.high)}${savedPlanches.length ? ` · ${savedPlanches.length} planche(s) PDF jointe(s)` : ''}.`
          : 'Calculée automatiquement dès qu’une pièce est définie.'
      }
    ];

    const readyCount = pieces.filter(x => x.status === 'ready').length;
    const partialCount = pieces.filter(x => x.status === 'partial').length;
    const completeness = Math.round(((readyCount + partialCount * 0.5) / pieces.length) * 100);
    return {
      pieces,
      readyCount,
      partialCount,
      totalCount: pieces.length,
      completeness,
      canExport: rooms.length > 0,
      roof,
      secA,
      estimate: est
    };
  }

  /**
   * Génère le Dossier APD / Permis de Construire relié en PDF A4 (jsPDF).
   */
  async function exportPDF({ project, cabinet = null, media = null, planches = [], deps = null, jsPDFCtor = null } = {}) {
    const rooms = allRooms(project);
    if (!rooms.length) throw new Error('Dessinez au moins une pièce avant d’exporter le dossier APD / Permis.');

    const loadBrowserJsPDF = () => new Promise((resolve, reject) => {
      if (root?.jspdf?.jsPDF) return resolve(root.jspdf.jsPDF);
      if (typeof document === 'undefined') return resolve(null);
      const s = document.createElement('script');
      s.src = 'assets/vendor/jspdf-4.2.1.umd.min.js';
      s.onload = () => resolve(root?.jspdf?.jsPDF || null);
      s.onerror = () => reject(new Error('Bibliothèque jsPDF locale introuvable.'));
      document.head.append(s);
    });
    const JsPDF = jsPDFCtor || root?.jspdf?.jsPDF || root?.jsPDF || (typeof document !== 'undefined' ? await loadBrowserJsPDF() : null) || (typeof require === 'function' ? (() => {
      try { return require('jspdf').jsPDF; } catch { return null; }
    })() : null);
    if (!JsPDF) throw new Error('Bibliothèque jsPDF indisponible.');

    const TechnicalDrawings = resolveDep(deps, 'TechnicalDrawings', 'TechnicalDrawings', './technicalDrawings.js');
    const evaluation = evaluate({ project, cabinet, media, planches, deps });
    const meta = project.meta || {};
    const cfg = project.config || {};
    const brandName = (cabinet?.name || meta.agency || 'ArchiCam Studio').trim();
    const projectName = (meta.name || 'Projet architectural').trim();
    const slug = (meta.slug || projectName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';

    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;
    const INK = [22, 28, 25];
    const MUTED = [96, 106, 99];
    const GOLD = [179, 134, 70];
    const LINEN = [247, 245, 240];
    const GREEN = [27, 45, 35];

    const drawHeaderFooter = (pageCode, sectionTitle) => {
      doc.setFillColor(...LINEN);
      doc.rect(0, 0, W, H, 'F');
      doc.setDrawColor(201, 203, 191);
      doc.setLineWidth(0.3);
      doc.rect(10, 10, W - 20, H - 20);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.6);
      doc.line(14, 21, W - 14, 21);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GREEN);
      doc.text(brandName.toUpperCase(), 14, 17.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
      doc.text(`${projectName}  ·  ${sectionTitle}`, W - 14, 17.5, { align: 'right' });
      doc.setDrawColor(201, 203, 191);
      doc.setLineWidth(0.25);
      doc.line(14, H - 17, W - 14, H - 17);
      doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(`DOSSIER APD / PERMIS DE CONSTRUIRE · ${pageCode}`, 14, H - 12.8);
      doc.text(new Date().toLocaleDateString('fr-FR'), W - 14, H - 12.8, { align: 'right' });
    };

    // --- PAGE 1 : COUVERTURE RÉGLEMENTAIRE + BORDEREAU PC-01 → PC-08 ---
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 82, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.8);
    doc.line(16, 22, W - 16, 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(225, 204, 165);
    doc.text(brandName.toUpperCase(), 16, 18);
    doc.text('DOSSIER APD · PERMIS DE CONSTRUIRE', W - 16, 18, { align: 'right' });

    doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(247, 245, 240);
    doc.text(projectName, 16, 44, { maxWidth: W - 32 });
    if (meta.subtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(214, 203, 184);
      doc.text(String(meta.subtitle), 16, 56, { maxWidth: W - 32 });
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(225, 204, 165);
    doc.text(`COMPLÉTUDE RÉGLEMENTAIRE : ${evaluation.completeness} % (${evaluation.readyCount}/${evaluation.totalCount} PIÈCES PRÊTES)`, 16, 72);

    // Cartouche administratif
    let y = 92;
    doc.setFillColor(...LINEN);
    doc.rect(14, y, W - 28, 34, 'F');
    doc.setDrawColor(201, 203, 191);
    doc.rect(14, y, W - 28, 34);
    const metaCells = [
      ['Maître d’ouvrage', meta.client || 'À compléter'],
      ['Localisation', meta.location || 'À compléter'],
      ['Maître d’œuvre', meta.agency || cabinet?.name || brandName],
      ['Architecte', cabinet?.architect || 'À compléter'],
      ['Phase / Indice', `${meta.phase || 'APD / PC'} · Ind. ${meta.revision || 'A'}`],
      ['Date d’émission', meta.issueDate || new Date().toLocaleDateString('fr-FR')]
    ];
    metaCells.forEach(([k, v], idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx = 18 + col * 60;
      const cy = y + 8 + row * 15;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text(k.toUpperCase(), cx, cy);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
      doc.text(String(v).slice(0, 32), cx, cy + 5.2);
    });

    // Bordereau des 8 pièces réglementaires
    y = 138;
    doc.setFont('times', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK);
    doc.text('Bordereau des pièces réglementaires (PC-01 à PC-08)', 14, y);
    y += 7;
    const statusMap = { ready: 'PRÊT', partial: 'À COMPLÉTER', missing: 'MANQUANT' };
    evaluation.pieces.forEach((piece, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(242, 239, 231);
        doc.rect(14, y - 4, W - 28, 15.5, 'F');
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...GOLD);
      doc.text(piece.code, 17, y + 1);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
      doc.text(piece.title, 34, y + 1);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      const sc = piece.status === 'ready' ? [26, 102, 58] : (piece.status === 'partial' ? [156, 102, 21] : [160, 48, 42]);
      doc.setTextColor(...sc);
      doc.text(statusMap[piece.status], W - 17, y + 1, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(piece.detail, 34, y + 7.2, { maxWidth: W - 54 });
      y += 16.5;
    });

    // --- PAGE 2 : NOTICE DESCRIPTIVE + TABLEAU DES SURFACES + ESTIMATION ---
    doc.addPage();
    drawHeaderFooter('PC-07 · PC-08', 'Notice descriptive, surfaces & enveloppe');
    y = 32;
    doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text('Notice architecturale et descriptive', 14, y);
    y += 8;
    const habArea = rooms.filter(r => r.habitable !== false).reduce((s, r) => s + (Number(r.area) || 0), 0);
    const annArea = rooms.filter(r => r.habitable === false).reduce((s, r) => s + (Number(r.area) || 0), 0);
    const maxLevel = rooms.reduce((m, r) => Math.max(m, Number(r.level) || 0), 0);
    const walls = allWalls(project);
    const doors = walls.reduce((s, w) => s + (w.openings || []).filter(o => o.type === 'door').length, 0);
    const windows = walls.reduce((s, w) => s + (w.openings || []).filter(o => o.type === 'window').length, 0);
    const noticeLines = [
      `Le présent projet porte sur la réalisation de « ${projectName} » (${maxLevel === 0 ? 'plain-pied RDC' : `R+${maxLevel}`}), développant ${nf.format(habArea)} m² de surface habitable et ${nf.format(annArea)} m² d’espaces annexes (vérandas, terrasses, circulations extérieures).`,
      `La hauteur libre sous plafond est fixée à ${nf.format(cfg.wallHeight || 2.8)} m. L’enveloppe intègre ${doors} porte(s) et ${windows} fenêtre(s) ou baie(s) assurant la ventilation traversante et l’éclairement naturel des pièces principales.`,
      evaluation.roof.valid
        ? `Couverture : ${evaluation.roof.typeLabel.toLowerCase()}, pente ${nf.format(evaluation.roof.slopePercent)} %, faîtage à +${nf.format(evaluation.roof.ridgeY)} m, surface développée de ${nf.format(evaluation.roof.roofArea)} m².`
        : 'Couverture à préciser en phase d’exécution.'
    ];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
    for (const para of noticeLines) {
      const wrapped = doc.splitTextToSize(para, W - 28);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 4.8 + 3;
    }

    y += 4;
    doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text('Tableau des surfaces par niveau', 14, y);
    y += 6;
    doc.setFillColor(...GREEN);
    doc.rect(14, y, W - 28, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(247, 245, 240);
    doc.text('Pièce / Espace', 17, y + 4.8);
    doc.text('Niveau', 112, y + 4.8);
    doc.text('Nature', 142, y + 4.8);
    doc.text('Surface', W - 17, y + 4.8, { align: 'right' });
    y += 9;

    const sortedRooms = [...rooms].sort((a, b) => (Number(a.level) || 0) - (Number(b.level) || 0));
    sortedRooms.forEach((r, idx) => {
      if (y > 235) {
        doc.addPage();
        drawHeaderFooter('PC-07', 'Tableau des surfaces (suite)');
        y = 32;
      }
      if (idx % 2 === 0) {
        doc.setFillColor(242, 239, 231);
        doc.rect(14, y - 3.6, W - 28, 6.2, 'F');
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
      doc.text(String(r.name || 'Pièce').slice(0, 44), 17, y);
      doc.text((Number(r.level) || 0) === 0 ? 'RDC' : `R+${r.level}`, 112, y);
      doc.text(r.habitable === false ? 'Annexe' : 'Habitable', 142, y);
      doc.text(`${nf.format(Number(r.area) || 0)} m²`, W - 17, y, { align: 'right' });
      y += 6.2;
    });

    if (evaluation.estimate && y < 238) {
      y += 7;
      doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
      doc.text('Enveloppe financière indicative (PC-08)', 14, y);
      y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...GREEN);
      doc.text(`Total travaux estimé : ${fmtMoney(evaluation.estimate.total.low)} – ${fmtMoney(evaluation.estimate.total.high)}`, 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`${evaluation.estimate.rate?.label || 'Référentiel agence'} · Surface de référence ${nf.format(evaluation.estimate.reference)} m² · Estimation non contractuelle.`, 14, y);
    }

    // --- PAGE 3 : PLAN DE TOITURE + COUPES 2D VECTORIELLES (PC-04 & PC-05) ---
    if (TechnicalDrawings && (evaluation.roof.valid || evaluation.secA.valid)) {
      doc.addPage();
      drawHeaderFooter('PC-04 · PC-05', 'Plan de toiture et coupes 2D (maquette)');
      if (evaluation.roof.valid && typeof TechnicalDrawings.drawRoofPlanPDF === 'function') {
        TechnicalDrawings.drawRoofPlanPDF(doc, project, { x: 14, y: 28, w: W - 28, h: 112 });
      }
      if (evaluation.secA.valid && typeof TechnicalDrawings.drawSectionPDF === 'function') {
        TechnicalDrawings.drawSectionPDF(doc, project, { x: 14, y: 148, w: W - 28, h: 118 }, 100, { axis: 'x', label: 'Coupe longitudinale A–A' });
      }
    }

    const filename = `${slug}-dossier-APD-PC.pdf`;
    if (typeof doc.save === 'function' && typeof window !== 'undefined') {
      doc.save(filename);
    }
    return { filename, doc, evaluation, pages: doc.getNumberOfPages() };
  }

  return { evaluate, exportPDF };
});
