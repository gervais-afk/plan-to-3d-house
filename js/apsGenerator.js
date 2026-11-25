/**
 * APS GENERATOR — Avant-Projet Sommaire automatique
 *
 * Produit un APS au format PDF à partir des données RÉELLES du projet ouvert :
 * - Couverture : nom, sous-titre, maître d'ouvrage, vue 3D de la façade
 * - Présentation : nature, niveaux, surfaces (brute, nette, annexes), ouvertures
 * - Programme : pièces par niveau avec leur surface
 * - Estimation : lots et total en FCFA calculés par CostEstimate (fourchette)
 * - Calendrier : phases de mission (ESQ → travaux), durée des travaux selon la surface
 * - Points de vigilance : contrôles Habitability, hypothèses, suites, bon pour accord
 *
 * Le contenu est calculé par buildContent(), une fonction pure testable sous Node ;
 * le dessin jsPDF ne fait que le mettre en page.
 */

const APSGenerator = (() => {
  'use strict';

  const CONFIG = {
    pageWidth: 210,
    pageHeight: 297,
    margin: 20,
    bodyTop: 50,
    bodyBottom: 268,
    colors: {
      primary: '#1d2620',
      secondary: '#202a23',
      accent: '#b78a3c',
      sand: '#d8c7a0',
      paper: '#f4f2eb',
      text: '#1b2320',
      lightGray: '#ebe8de',
      rule: '#c9cbbf',
      ruleDark: '#3d4a3f',
      mediumGray: '#5f6a63',
      white: '#ffffff'
    },
    font: 'helvetica'
  };
  const WIDTH = CONFIG.pageWidth - 2 * CONFIG.margin;

  // =====================================================================
  // DÉPENDANCES (globales dans le navigateur, require sous Node)
  // =====================================================================

  function dependency(name, file) {
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require(file); } catch (_) { return null; }
    }
    return null;
  }

  function dependencies(overrides = {}) {
    return {
      CostEstimate: overrides.CostEstimate ?? (typeof CostEstimate !== 'undefined' ? CostEstimate : dependency('CostEstimate', './costEstimate.js')),
      Habitability: overrides.Habitability ?? (typeof Habitability !== 'undefined' ? Habitability : dependency('Habitability', './habitability.js')),
      DeliverableGate: overrides.DeliverableGate ?? (typeof DeliverableGate !== 'undefined' ? DeliverableGate : dependency('DeliverableGate', './deliverableGate.js')),
      PdfIdentity: overrides.PdfIdentity ?? (typeof PdfIdentity !== 'undefined' ? PdfIdentity : dependency('PdfIdentity', './pdfIdentity.js'))
    };
  }

  function resolveImageSize(doc, image) {
    const w = Number(image?.width), h = Number(image?.height);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) return { width: w, height: h };
    if (image?.data && typeof doc?.getImageProperties === 'function') {
      try {
        const props = doc.getImageProperties(image.data);
        if (Number.isFinite(props?.width) && props.width > 0 && Number.isFinite(props?.height) && props.height > 0) {
          return { width: props.width, height: props.height };
        }
      } catch (_) { /* propriétés indisponibles */ }
    }
    return null;
  }

  function captionForImage(image, project) {
    const { DeliverableGate: gate } = dependencies();
    if (gate && typeof gate.imageCaption === 'function') return gate.imageCaption(image, { project });
    return image?.ai === true ? 'Image générée par IA — non contractuelle' : 'Illustration du projet';
  }

  // =====================================================================
  // CONTENU (pur, sans jsPDF)
  // =====================================================================

  const round1 = value => Math.round(value * 10) / 10;
  const m2 = value => `${round1(value).toLocaleString('fr-FR')} m²`;

  function levelLabel(level) {
    return level > 0 ? `Étage ${level} (R+${level})` : 'Rez-de-chaussée';
  }

  function levelsSummary(count) {
    return count > 1 ? `R+${count - 1} (${count} niveaux)` : 'Plain-pied';
  }

  // « R+1 (2 niveaux) » garde son R majuscule ; seul « Plain-pied » passe en minuscule dans une phrase.
  const lowerFirst = text => /^R\+/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);

  /** Pièce principale au sens immobilier : séjours et chambres (ni cuisine, ni pièce d'eau, ni circulation, ni annexe). */
  const NOT_MAIN = /cuisine|kitchen|salle d.?eau|salle de bains?|bains?|douche|\bwc\b|toilette|palier|escalier|degagement|hall|couloir|circulation|entree|dressing|placard|cellier|magasin|buanderie|rangement|garage|veranda|terrasse|porche/;
  function isMainRoom(room) {
    const name = String(room.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return room.habitable !== false && !NOT_MAIN.test(name);
  }

  function areaOf(room, CE) {
    if (Number.isFinite(room.area)) return room.area;
    return CE ? CE.roomArea(room) : 0;
  }

  /** Durée indicative des travaux (mois) selon la surface de référence et le nombre de niveaux. */
  function worksMonths(reference, levels) {
    const months = Math.round(reference / 15) + 2 * Math.max(0, levels - 1);
    return Math.min(24, Math.max(6, months));
  }

  function schedule(reference, levels) {
    const phases = [
      { code: 'ESQ', label: 'Esquisse', weeks: 2, note: 'Implantation et parti architectural' },
      { code: 'APS', label: 'Avant-projet sommaire', weeks: 2, note: 'Présent document : à valider par le maître d\'ouvrage' },
      { code: 'APD', label: 'Avant-projet définitif', weeks: 3, note: 'Plans cotés, structure BA, choix des matériaux' },
      { code: 'PC', label: 'Dossier de permis de bâtir', weeks: 2, note: 'Dépôt en mairie ; instruction de 1 à 3 mois selon la commune' },
      { code: 'PRO', label: 'Projet et dossier de consultation', weeks: 4, note: 'Détails d\'exécution, CCTP, bordereau quantitatif' },
      { code: 'ACT', label: 'Consultation des entreprises', weeks: 3, note: 'Comparaison des offres et signature des marchés' }
    ];
    let start = 0;
    for (const phase of phases) { phase.start = start; start += phase.weeks; }
    const months = worksMonths(reference, levels);
    return { phases, studyWeeks: start, works: { label: 'Travaux', months, note: `Durée indicative pour ${Math.round(reference)} m² de référence, ${lowerFirst(levelsSummary(levels))}` } };
  }

  /**
   * Calcule tout le contenu de l'APS à partir du projet.
   * @param {object} project — projet de l'éditeur (meta, config, walls, rooms, estimate…)
   * @param {object} [options] — { date, CostEstimate, Habitability }
   */
  function buildContent(project, options = {}) {
    const { CostEstimate: CE, Habitability: HB } = dependencies(options);
    const meta = project.meta || {};
    const rooms = (project.rooms || []).map(room => ({
      id: room.id,
      name: room.name || room.id || 'Pièce',
      desc: room.desc || '',
      level: room.level || 0,
      habitable: room.habitable !== false,
      area: areaOf(room, CE)
    }));
    const levelIds = [...new Set([...rooms.map(r => r.level), ...(project.walls || []).map(w => w.level || 0)])].sort((a, b) => a - b);
    if (!levelIds.length) levelIds.push(0);
    const levels = levelIds.map(level => {
      const list = rooms.filter(r => r.level === level).sort((a, b) => Number(b.habitable) - Number(a.habitable) || b.area - a.area);
      return {
        level,
        label: levelLabel(level),
        rooms: list,
        habitable: list.filter(r => r.habitable).reduce((sum, r) => sum + r.area, 0),
        annexes: list.filter(r => !r.habitable).reduce((sum, r) => sum + r.area, 0)
      };
    });

    const estimate = CE ? CE.estimate(project, project.estimate) : null;
    const q = estimate?.quantities;
    const habitable = q ? q.habitable : levels.reduce((sum, l) => sum + l.habitable, 0);
    const annexes = q ? q.annexes : levels.reduce((sum, l) => sum + l.annexes, 0);
    const reference = estimate ? estimate.reference : habitable;
    const levelCount = Math.max(levels.length, q?.levels || 0);

    const money = value => CE ? CE.formatXAF(value) : `${Math.round(value).toLocaleString('fr-FR')} FCFA`;
    const range = item => Math.round(item.low) === Math.round(item.high) ? money(item.low) : `${money(item.low)} à ${money(item.high)}`;
    const finance = estimate ? {
      basis: estimate.rate.label,
      city: CE.CITIES[estimate.settings.city]?.label || estimate.settings.city,
      perM2: `${money(estimate.rate.low)} à ${money(estimate.rate.high)} / m²`,
      reference: m2(estimate.reference),
      lots: estimate.lots.map(lot => ({ label: lot.label, range: range(lot), mid: money(lot.mid) })),
      total: { range: range(estimate.total), mid: money(estimate.total.mid) },
      annexes: estimate.annexes.map(a => ({ label: a.label, range: range(a) })),
      overall: estimate.overall ? range(estimate.overall) : null,
      excluded: estimate.excluded
    } : null;

    const findings = HB ? HB.check(project).map(f => ({ code: f.code, level: f.level || 0, message: f.message })) : [];
    const sanity = CE?.sanityChecks ? CE.sanityChecks(project) : { warnings: [], errors: [] };
    const cautions = [...(sanity.errors || []), ...(sanity.warnings || [])].map(String);

    const openings = q ? { doors: q.doors, windows: q.windows, bays: q.bays } : null;
    const nature = meta.nature || `Construction neuve — ${lowerFirst(levelsSummary(levelCount))}`;
    const { PdfIdentity: ID } = dependencies(options);
    const identityMeta = ID
      ? ID.extractMeta(project, { cabinet: options.cabinet, date: options.date, dateStyle: 'long' })
      : {
          project: meta.name || 'Projet architectural',
          subtitle: meta.subtitle || '',
          client: meta.client || '',
          location: meta.location || meta.address || '',
          phase: meta.phase || '',
          revision: meta.revision || '',
          date: options.date instanceof Date ? options.date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : (meta.issueDate || meta.date || ''),
          agency: meta.architect || meta.agency || '',
          brand: meta.agency || 'ARCHICAM STUDIO'
        };

    return {
      name: meta.name || 'Projet architectural',
      subtitle: meta.subtitle || '',
      client: identityMeta.client || 'À préciser',
      location: identityMeta.location || 'À préciser',
      agency: identityMeta.agency,
      phase: identityMeta.phase,
      revision: identityMeta.revision,
      identityMeta,
      description: meta.description || '',
      date: identityMeta.date,
      nature,
      levelCount,
      levelsSummary: levelsSummary(levelCount),
      levelsShort: levelCount > 1 ? `R+${levelCount - 1}` : 'Plain-pied',
      wallHeight: project.config?.wallHeight || null,
      surfaces: {
        habitable: m2(habitable),
        habitableNet: estimate ? m2(estimate.habitableNet) : null,
        annexes: m2(annexes),
        reference: m2(reference)
      },
      roomCount: rooms.length,
      habitableRoomCount: rooms.filter(r => r.habitable).length,
      mainRoomCount: rooms.filter(isMainRoom).length,
      openings,
      levels,
      finance,
      schedule: schedule(reference, levelCount),
      findings,
      cautions,
      nextSteps: [
        'Valider le programme et la surface de cet APS, ou demander des ajustements.',
        'Faire réaliser une étude de sol (géotechnique) avant le dimensionnement des fondations.',
        'Lancer l\'avant-projet définitif : plans cotés, structure béton armé, choix des finitions.',
        'Affiner l\'estimation avec des devis d\'entreprises sur la base du bordereau quantitatif.'
      ]
    };
  }

  // =====================================================================
  // CHARGEMENT JSPDF
  // =====================================================================

  let pendingLibrary;

  function loadJsPDF() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return pendingLibrary ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/vendor/jspdf-4.2.1.umd.min.js';
      script.crossOrigin = 'anonymous';
      const timer = setTimeout(fail, 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        pendingLibrary = null;
        reject(new Error('jsPDF indisponible'));
      }
      script.onload = () => {
        clearTimeout(timer);
        if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  }

  // =====================================================================
  // UTILITAIRES DE DESSIN
  // =====================================================================

  /** Les polices standard de jsPDF (WinAnsi) n'ont ni espaces fines, ni ≈, ni flèches, ni emojis. */
  function pdfSafe(value) {
    return String(value ?? '')
      .replace(/[   ]/g, ' ')
      .replace(/≈/g, 'env.')
      .replace(/[→⇒]/g, '->')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, '')
      .trim();
  }

  function hexToRgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }

  function drawGradient(doc, x, y, w, h, color1, color2, steps = 20) {
    const [r1, g1, b1] = hexToRgb(color1);
    const [r2, g2, b2] = hexToRgb(color2);
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      doc.setFillColor(Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t));
      doc.rect(x, y + i * stepH, w, stepH + 0.1, 'F');
    }
  }

  function text(doc, value, x, y, size, options = {}) {
    const { bold = false, serif = false, color = CONFIG.colors.text, maxWidth, align = 'left', space = 0 } = options;
    let label = pdfSafe(value);
    doc.setFont(serif ? 'times' : CONFIG.font, bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(space);
    const widthOf = str => doc.getTextWidth(str) + (space && str.length > 1 ? space * (str.length - 1) : 0);
    if (maxWidth && widthOf(label) > maxWidth) {
      while (label.length && widthOf(`${label}...`) > maxWidth) label = label.slice(0, -1);
      label += '...';
    }
    const extra = space && label.length > 1 ? space * (label.length - 1) : 0;
    const drawX = align === 'right' ? x - extra : (align === 'center' ? x - extra / 2 : x);
    doc.text(label, drawX, y, { align });
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  }

  /** Paragraphe sur plusieurs lignes ; renvoie la nouvelle ordonnée. */
  function paragraph(doc, value, x, y, size, width, options = {}) {
    const { bold = false, color = CONFIG.colors.text, lineHeight = size * 0.45 } = options;
    doc.setFont(CONFIG.font, bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    const lines = doc.splitTextToSize(pdfSafe(value), width);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  }

  /** Contexte de page : en-tête agence, pied et saut de page automatique. */
  function pageContext(doc, content) {
    const { PdfIdentity: ID } = dependencies();
    const ctx = { doc, content, page: doc.getNumberOfPages(), y: CONFIG.bodyTop, title: '' };
    ctx.start = title => {
      doc.addPage();
      ctx.page = doc.getNumberOfPages();
      ctx.title = title;
      doc.setFillColor(CONFIG.colors.paper).rect(0, 0, CONFIG.pageWidth, CONFIG.pageHeight, 'F');
      doc.setFillColor(CONFIG.colors.primary).rect(0, 0, CONFIG.pageWidth, 35, 'F');
      if (ID) ID.drawWoodGrain(doc, { x: 0, y: 0, w: CONFIG.pageWidth, h: 35 }, { seed: 7 + ctx.page, knots: 1, spacing: 6.5 });
      doc.setFillColor(CONFIG.colors.accent).rect(0, 35, CONFIG.pageWidth, 0.8, 'F');
      text(doc, 'ARCHICAM STUDIO · AVANT-PROJET SOMMAIRE', CONFIG.margin, 12.5, 6.2, { bold: true, color: CONFIG.colors.sand, space: 1.0 });
      text(doc, title, CONFIG.margin, 25.5, 17, { serif: true, bold: true, color: CONFIG.colors.white, maxWidth: WIDTH - 18 });
      text(doc, String(ctx.page).padStart(2, '0'), CONFIG.pageWidth - CONFIG.margin, 25.5, 15, { serif: true, bold: true, color: CONFIG.colors.accent, align: 'right' });
      doc.setDrawColor(CONFIG.colors.rule).setLineWidth(0.3);
      doc.line(CONFIG.margin, 280, CONFIG.pageWidth - CONFIG.margin, 280);
      text(doc, `${content.name} — Avant-projet sommaire`, CONFIG.margin, 286, 8, { color: CONFIG.colors.mediumGray, maxWidth: WIDTH - 35 });
      if (content.date) {
        text(doc, content.date, CONFIG.pageWidth - CONFIG.margin, 286, 8, { color: CONFIG.colors.mediumGray, align: 'right' });
      }
      ctx.y = CONFIG.bodyTop;
    };
    ctx.need = (height, continuation) => {
      if (ctx.y + height <= CONFIG.bodyBottom) return false;
      ctx.start(`${ctx.title.replace(/ \(suite\)$/, '')} (suite)`);
      if (continuation) continuation();
      return true;
    };
    ctx.heading = label => {
      ctx.need(16);
      text(doc, label, CONFIG.margin, ctx.y, 13, { serif: true, bold: true, color: CONFIG.colors.primary });
      ctx.y += 8;
    };
    ctx.field = (label, value) => {
      ctx.need(7);
      text(doc, label, CONFIG.margin, ctx.y, 10, { bold: true });
      ctx.y = paragraph(doc, value, CONFIG.margin + 55, ctx.y, 10, WIDTH - 55) + 2;
    };
    ctx.bullets = (items, size = 9.5) => {
      for (const item of items) {
        ctx.need(6);
        text(doc, '•', CONFIG.margin + 2, ctx.y, size, { color: CONFIG.colors.accent, bold: true });
        ctx.y = paragraph(doc, item, CONFIG.margin + 7, ctx.y, size, WIDTH - 7) + 1.5;
      }
    };
    return ctx;
  }

  function tableHeader(doc, y, columns) {
    doc.setFillColor(CONFIG.colors.primary);
    doc.rect(CONFIG.margin, y, WIDTH, 8, 'F');
    for (const col of columns) {
      text(doc, col.label, col.align === 'right' ? col.x + col.w - 2 : col.x + 2, y + 5.5, 9, { bold: true, color: CONFIG.colors.white, align: col.align || 'left' });
    }
    return y + 8;
  }

  function tableRow(doc, y, columns, values, options = {}) {
    const { shaded = false, bold = false, height = 7 } = options;
    if (shaded) {
      doc.setFillColor(CONFIG.colors.lightGray);
      doc.rect(CONFIG.margin, y, WIDTH, height, 'F');
    }
    columns.forEach((col, i) => {
      text(doc, values[i], col.align === 'right' ? col.x + col.w - 2 : col.x + 2, y + height - 2.2, 8.5, { bold, align: col.align || 'left', maxWidth: col.w - 4 });
    });
    return y + height;
  }

  // =====================================================================
  // PAGES
  // =====================================================================

  function drawCover(doc, content, project, studio, variant, options = {}) {
    const { PdfIdentity: ID } = dependencies(options);
    doc.setFillColor(CONFIG.colors.primary).rect(0, 0, CONFIG.pageWidth, CONFIG.pageHeight, 'F');
    if (ID) {
      ID.drawWoodGrain(doc, { x: 0, y: 0, w: CONFIG.pageWidth, h: CONFIG.pageHeight }, { seed: 11, knots: 2, spacing: 5.8 });
      ID.cropMarks(doc, 10, 10, CONFIG.pageWidth - 20, CONFIG.pageHeight - 20, CONFIG.colors.accent);
      ID.drawCoverHeader(doc, { x: CONFIG.margin, y: 21, w: WIDTH, brand: content.identityMeta?.brand || 'ARCHICAM STUDIO', documentType: 'AVANT-PROJET SOMMAIRE' });
    }

    const kickerLabel = ['AVANT-PROJET SOMMAIRE (APS)', content.revision && `INDICE ${content.revision}`].filter(Boolean).join(' · ');
    text(doc, kickerLabel, CONFIG.margin, 36, 7.2, { bold: true, color: CONFIG.colors.sand, space: 0.8 });

    doc.setFont('times', 'bold').setFontSize(28).setTextColor(CONFIG.colors.white);
    const title = doc.splitTextToSize(pdfSafe(content.name), WIDTH).slice(0, 2);
    doc.text(title, CONFIG.margin, 49);
    let y = 49 + (title.length - 1) * 11 + 5;
    doc.setDrawColor(CONFIG.colors.accent).setLineWidth(0.8);
    doc.line(CONFIG.margin, y, CONFIG.margin + 26, y);
    y += 7;
    if (content.subtitle) {
      y = paragraph(doc, content.subtitle, CONFIG.margin, y, 9.5, WIDTH, { color: '#d5dbd1', lineHeight: 4.5 });
    }

    const imageTop = Math.max(y + 6, 86);
    const frameH = 85;
    const cover = options.coverImage;
    if (cover?.data) {
      // Cadrage au ratio réel de l'image décodée ; si introuvable, cadrage « contain » sans déformation.
      const fmt = /^data:image\/png/i.test(cover.data) ? 'PNG' : 'JPEG';
      const size = resolveImageSize(doc, cover);
      doc.saveGraphicsState();
      doc.rect(CONFIG.margin, imageTop, WIDTH, frameH, null);
      doc.clip();
      doc.discardPath();
      if (size) {
        const ratio = size.width / size.height;
        let iw = WIDTH, ih = WIDTH / ratio;
        if (ih < frameH) { ih = frameH; iw = frameH * ratio; }
        doc.addImage(cover.data, fmt, CONFIG.margin + (WIDTH - iw) / 2, imageTop + (frameH - ih) / 2, iw, ih);
      } else {
        doc.addImage(cover.data, fmt, CONFIG.margin, imageTop, 0, frameH);
      }
      doc.restoreGraphicsState();
      doc.setDrawColor(CONFIG.colors.accent).setLineWidth(0.35).rect(CONFIG.margin, imageTop, WIDTH, frameH);
      text(doc, captionForImage(cover, project), CONFIG.margin, imageTop + frameH + 5, 6.8, { color: CONFIG.colors.sand });
    } else if (studio?.hs && typeof studio.capture === 'function' && project.walls?.length) {
      try {
        const shots = selectShots(project);
        const image = studio.capture(shots.facade, 1600, 800, 1, { clean: true, solar: variant });
        doc.addImage(image, 'JPEG', CONFIG.margin, imageTop, WIDTH, frameH);
        doc.setDrawColor(CONFIG.colors.accent).setLineWidth(0.35).rect(CONFIG.margin, imageTop, WIDTH, frameH);
        text(doc, captionForImage('render3d', project), CONFIG.margin, imageTop + frameH + 5, 6.8, { color: CONFIG.colors.sand });
      } catch (error) {
        console.warn('[APS] Vue 3D indisponible :', error);
      }
    }

    const factsY = Math.max(imageTop + frameH + 14, 192);
    const facts = [
      { value: content.surfaces.habitable, label: 'Surface habitable' },
      { value: String(content.mainRoomCount), label: 'Pièces principales' },
      { value: content.levelsShort, label: 'Niveaux' }
    ];
    if (ID) {
      ID.drawFactsBand(doc, facts, { x: CONFIG.margin, y: factsY, w: WIDTH, h: 24 });
      ID.drawCartouche(doc, content.identityMeta, { x: CONFIG.margin, y: 230, w: WIDTH, h: 42 }, {
        theme: 'dark',
        documentLabel: 'Avant-projet sommaire',
        code: ID.documentCode('aps', 0)
      });
    }
    if (variant?.aiEnhanced) {
      text(doc, 'Rendus sublimés par IA', CONFIG.pageWidth - CONFIG.margin, 285, 7.5, { color: CONFIG.colors.accent, align: 'right' });
    }
  }

  function drawPresentation(ctx) {
    const { doc, content } = ctx;
    ctx.start('1. PRÉSENTATION DU PROJET');
    ctx.heading('1.1 Identification');
    ctx.field('Projet :', content.name);
    ctx.field('Maître d\'ouvrage :', content.client);
    ctx.field('Localisation :', content.location);
    ctx.field('Nature :', content.nature);
    if (content.description) ctx.field('Description :', content.description);
    ctx.y += 4;

    ctx.heading('1.2 Surfaces');
    const rows = [
      ['Surface habitable (brute)', content.surfaces.habitable],
      ...(content.surfaces.habitableNet ? [['Surface habitable nette (nu intérieur)', content.surfaces.habitableNet]] : []),
      ['Annexes (terrasses, porches…)', content.surfaces.annexes],
      ['Surface de référence de l\'estimation', content.surfaces.reference]
    ];
    const columns = [{ x: CONFIG.margin, w: 120, label: 'Surface' }, { x: CONFIG.margin + 120, w: 50, label: 'Valeur', align: 'right' }];
    ctx.y = tableHeader(doc, ctx.y, columns);
    rows.forEach((row, i) => { ctx.y = tableRow(doc, ctx.y, columns, row, { shaded: i % 2 === 1 }); });
    ctx.y += 8;

    ctx.heading('1.3 Caractéristiques');
    const items = [
      `${content.levelsSummary}, ${content.roomCount} espaces dont ${content.mainRoomCount} pièces principales (séjours et chambres).`
    ];
    if (content.wallHeight) items.push(`Hauteur sous plafond : ${String(content.wallHeight).replace('.', ',')} m.`);
    if (content.openings) items.push(`Menuiseries : ${content.openings.doors} portes, ${content.openings.windows} fenêtres, ${content.openings.bays} baies.`);
    ctx.bullets(items, 10);
  }

  function drawProgram(ctx) {
    const { doc, content } = ctx;
    ctx.start('2. PROGRAMME ARCHITECTURAL');
    const columns = [
      { x: CONFIG.margin, w: 55, label: 'Pièce' },
      { x: CONFIG.margin + 55, w: 90, label: 'Usage' },
      { x: CONFIG.margin + 145, w: 25, label: 'Surface', align: 'right' }
    ];
    for (const level of content.levels) {
      ctx.heading(`${level.label} — ${m2(level.habitable)} habitables`);
      ctx.y = tableHeader(doc, ctx.y, columns);
      level.rooms.forEach((room, i) => {
        if (ctx.need(7)) ctx.y = tableHeader(doc, ctx.y, columns);
        const usage = room.desc ? (room.habitable ? room.desc : `${room.desc} (annexe)`) : (room.habitable ? 'Pièce habitable' : 'Annexe');
        ctx.y = tableRow(doc, ctx.y, columns, [room.name, usage, m2(room.area)], { shaded: i % 2 === 1 });
      });
      ctx.need(8);
      ctx.y = tableRow(doc, ctx.y, columns, ['Total du niveau', `${level.rooms.length} espaces · annexes ${m2(level.annexes)}`, m2(level.habitable + level.annexes)], { bold: true });
      ctx.y += 8;
    }
  }

  function drawEstimate(ctx) {
    const { doc, content } = ctx;
    const finance = content.finance;
    ctx.start('3. ESTIMATION FINANCIÈRE');
    if (!finance) {
      ctx.bullets(['Module d\'estimation indisponible : l\'estimation sera établie à l\'APD.'], 10);
      return;
    }
    ctx.heading('3.1 Hypothèses');
    ctx.field('Référentiel de prix :', finance.basis);
    ctx.field('Ville :', finance.city);
    ctx.field('Coût au m² :', finance.perM2);
    ctx.field('Surface de référence :', finance.reference);
    ctx.y += 4;

    ctx.heading('3.2 Estimation par lots (FCFA TTC indicatif)');
    const columns = [
      { x: CONFIG.margin, w: 95, label: 'Lot' },
      { x: CONFIG.margin + 95, w: 75, label: 'Fourchette', align: 'right' }
    ];
    ctx.y = tableHeader(doc, ctx.y, columns);
    finance.lots.forEach((lot, i) => { ctx.y = tableRow(doc, ctx.y, columns, [lot.label, lot.range], { shaded: i % 2 === 1 }); });
    doc.setFillColor(CONFIG.colors.accent);
    doc.rect(CONFIG.margin, ctx.y, WIDTH, 9, 'F');
    text(doc, 'TOTAL TRAVAUX', CONFIG.margin + 2, ctx.y + 6, 10, { bold: true, color: CONFIG.colors.white });
    text(doc, finance.total.range, CONFIG.pageWidth - CONFIG.margin - 2, ctx.y + 6, 10, { bold: true, color: CONFIG.colors.white, align: 'right' });
    ctx.y += 15;
    ctx.y = paragraph(doc, `Valeur centrale : ${finance.total.mid}.`, CONFIG.margin, ctx.y, 10, WIDTH, { bold: true }) + 4;

    if (finance.annexes.length) {
      ctx.heading('3.3 Postes complémentaires');
      ctx.y = tableHeader(doc, ctx.y, columns);
      finance.annexes.forEach((a, i) => { ctx.y = tableRow(doc, ctx.y, columns, [a.label, a.range], { shaded: i % 2 === 1 }); });
      ctx.y += 7;
      if (finance.overall) ctx.y = paragraph(doc, `Budget global : ${finance.overall}.`, CONFIG.margin, ctx.y, 10, WIDTH, { bold: true }) + 4;
    }
    ctx.need(20);
    ctx.y = paragraph(doc, `${finance.excluded} Estimation indicative au stade APS, à confirmer par des devis d'entreprises.`,
      CONFIG.margin, ctx.y + 2, 8.5, WIDTH, { color: CONFIG.colors.mediumGray });
  }

  function drawSchedule(ctx) {
    const { doc, content } = ctx;
    const { phases, studyWeeks, works } = content.schedule;
    ctx.start('4. CALENDRIER PRÉVISIONNEL');
    ctx.heading(`4.1 Études et autorisations (environ ${studyWeeks} semaines)`);
    const barX = CONFIG.margin + 70, barW = WIDTH - 70;
    const scale = barW / studyWeeks;
    for (const phase of phases) {
      ctx.need(14);
      text(doc, `${phase.code} — ${phase.label}`, CONFIG.margin, ctx.y + 4, 9, { bold: true, maxWidth: 68 });
      doc.setFillColor(phase.code === 'APS' ? CONFIG.colors.accent : CONFIG.colors.secondary);
      doc.roundedRect(barX + phase.start * scale, ctx.y, Math.max(phase.weeks * scale, 2), 5, 1, 1, 'F');
      text(doc, `${phase.weeks} sem.`, barX + (phase.start + phase.weeks) * scale - 1, ctx.y + 3.7, 7, { color: CONFIG.colors.white, align: 'right' });
      ctx.y = paragraph(doc, phase.note, CONFIG.margin, ctx.y + 9, 8, 68, { color: CONFIG.colors.mediumGray }) + 3;
    }
    ctx.y += 6;
    ctx.heading(`4.2 ${works.label} : environ ${works.months} mois`);
    ctx.bullets([
      works.note + '.',
      'Gros œuvre (fondations, élévation, dalle ou toiture) puis second œuvre et finitions.',
      'La saison des pluies peut allonger les délais de gros œuvre : à intégrer au planning d\'exécution.'
    ], 9.5);
  }

  function drawVigilance(ctx) {
    const { doc, content } = ctx;
    ctx.start('5. POINTS DE VIGILANCE ET SUITES');
    ctx.heading('5.1 Contrôles automatiques du plan');
    const notes = [...content.findings.map(f => (content.levelCount > 1 ? `${levelLabel(f.level)} : ` : '') + f.message), ...content.cautions];
    if (notes.length) {
      ctx.bullets(notes.slice(0, 14));
      if (notes.length > 14) ctx.bullets([`… et ${notes.length - 14} autres remarques dans l'éditeur.`]);
    } else {
      ctx.bullets(['Aucune remarque : dimensions de pièces, éclairement et passages conformes aux recommandations.']);
    }
    ctx.y += 4;
    ctx.heading('5.2 Suites à donner');
    ctx.bullets(content.nextSteps);
    ctx.y += 6;

    ctx.need(45);
    ctx.heading('5.3 Validation du maître d\'ouvrage');
    doc.setDrawColor(CONFIG.colors.rule).setLineWidth(0.4);
    doc.rect(CONFIG.margin, ctx.y, WIDTH, 32);
    text(doc, 'Bon pour accord sur l\'avant-projet sommaire', CONFIG.margin + 4, ctx.y + 7, 9.5, { bold: true });
    text(doc, `Nom : ${content.client === 'À préciser' ? '' : content.client}`, CONFIG.margin + 4, ctx.y + 16, 9);
    text(doc, 'Date :', CONFIG.margin + 4, ctx.y + 25, 9);
    text(doc, 'Signature :', CONFIG.margin + 95, ctx.y + 16, 9);
    ctx.y += 38;
  }

  // =====================================================================
  // VUE 3D
  // =====================================================================

  function selectShots(data) {
    const walls = data.walls.filter(w => !w.level);
    const list = walls.length ? walls : data.walls;
    const xs = list.flatMap(w => [w.from[0], w.to[0]]);
    const zs = list.flatMap(w => [w.from[1], w.to[1]]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    return {
      facade: {
        label: 'Façade principale', fov: 50, interior: false,
        pos: [cx + size * 1.5, size * 0.6, cz + size * 1.5],
        look: [cx, size * 0.44, cz]
      }
    };
  }

  // =====================================================================
  // GÉNÉRATION
  // =====================================================================

  /**
   * Génère l'APS du projet.
   * @param {object} project
   * @param {object} [studio] — studio 3D (capture de la façade)
   * @param {object} [variant]
   * @param {object} [options] — { coverImage: { data, width, height }, JsPDF, save: false, date }
   * @returns {Promise<object>} — le document jsPDF
   */
  async function generateAPS(project, studio = null, variant = null, options = {}) {
    if (!project || !Array.isArray(project.rooms)) throw new Error('Projet sans pièces : impossible de générer l\'APS');
    const { PdfIdentity: ID } = dependencies(options);
    const cabinet = options.cabinet !== undefined ? options.cabinet : (ID ? await ID.loadCabinetProfile() : null);
    const resolvedOptions = cabinet ? { ...options, cabinet } : options;
    const JsPDF = resolvedOptions.JsPDF || await loadJsPDF();
    const content = buildContent(project, resolvedOptions);
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: resolvedOptions.compress !== false });
    doc.setProperties({ title: pdfSafe(`APS - ${content.name}`), subject: 'Avant-projet sommaire', creator: 'ArchiCam Studio' });

    drawCover(doc, content, project, studio, variant, resolvedOptions);
    const ctx = pageContext(doc, content);
    drawPresentation(ctx);
    drawProgram(ctx);
    drawEstimate(ctx);
    drawSchedule(ctx);
    drawVigilance(ctx);

    if (resolvedOptions.save !== false) {
      const slug = (project.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
      doc.save(`${slug}-APS.pdf`);
    }
    return doc;
  }

  return { generateAPS, buildContent, pdfSafe, worksMonths };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APSGenerator;
}
