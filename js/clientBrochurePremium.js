/**
 * BROCHURE PREMIUM — Catalogue digne des grands magazines immobiliers
 * 
 * Améliorations :
 * - Couverture avec image 3D plein cadre + overlay dégradé
 * - Typographie hiérarchisée (titres impactants)
 * - Ombres portées et profondeur
 * - Mise en page magazine avec grilles asymétriques
 * - Statistiques visuelles premium
 * - Intégration du bouton "Sublimer avec l'IA"
 */

const ClientBrochurePremium = (() => {
  'use strict';

  // =====================================================================
  // PALETTE PREMIUM
  // =====================================================================
  
  const COLORS = {
    // Couleurs principales
    primary: '#1a1a2e',      // Bleu nuit profond
    secondary: '#16213e',    // Bleu sombre
    accent: '#e94560',       // Rouge corail vif
    accentLight: '#ff6b9d',  // Rose clair
    
    // Neutres sophistiqués
    dark: '#0f0f1e',
    medium: '#4a4a5e',
    light: '#a8a8c0',
    paper: '#f8f9fa',
    
    // Or pour luxe
    gold: '#d4af37',
    goldLight: '#f4d03f'
  };

  const margin = 20;
  const width = 170;

  let pendingLibrary;

  // =====================================================================
  // CHARGEMENT JSPDF
  // =====================================================================

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
  // UTILITAIRES VISUELS PREMIUM
  // =====================================================================

  /**
   * Dessine un dégradé vertical (simulé par bandes)
   */
  function drawGradient(doc, x, y, w, h, color1, color2, steps = 20) {
    const stepH = h / steps;
    
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      
      const r1 = parseInt(color1.slice(1, 3), 16);
      const g1 = parseInt(color1.slice(3, 5), 16);
      const b1 = parseInt(color1.slice(5, 7), 16);
      
      const r2 = parseInt(color2.slice(1, 3), 16);
      const g2 = parseInt(color2.slice(3, 5), 16);
      const b2 = parseInt(color2.slice(5, 7), 16);
      
      const r = Math.round(r1 + (r2 - r1) * ratio);
      const g = Math.round(g1 + (g2 - g1) * ratio);
      const b = Math.round(b1 + (b2 - b1) * ratio);
      
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      
      doc.setFillColor(hex);
      doc.rect(x, y + i * stepH, w, stepH + 0.1, 'F');
    }
  }

  /**
   * Dessine une ombre portée
   */
  function drawShadow(doc, x, y, w, h, blur = 3) {
    for (let i = 0; i < blur; i++) {
      const offset = i * 0.5;
      const opacity = 0.15 * (1 - i / blur);
      
      if (doc.setGState) {
        doc.setGState(new doc.GState({ opacity }));
      }
      doc.setFillColor('#000000');
      doc.roundedRect(x + offset, y + offset, w, h, 1, 1, 'F');
    }
    
    if (doc.setGState) {
      doc.setGState(new doc.GState({ opacity: 1 }));
    }
  }

  /**
   * Texte avec style premium
   */
  function premiumText(doc, value, x, y, size, options = {}) {
    const { bold = false, color = COLORS.primary, maxWidth, align = 'left', font = 'helvetica' } = options;
    let label = String(value).replace(/[\u202f\u00a0]/g, ' ');
    
    doc.setFont(font, bold ? 'bold' : 'normal')
       .setFontSize(size)
       .setTextColor(color);
    
    if (maxWidth && doc.getTextWidth(label) > maxWidth) {
      while (label.length && doc.getTextWidth(`${label}…`) > maxWidth) {
        label = label.slice(0, -1);
      }
      label += '…';
    }
    
    doc.text(label, x, y, { align });
  }

  /**
   * Séparateur décoratif
   */
  function drawDivider(doc, x, y, width, style = 'accent') {
    if (style === 'accent') {
      doc.setDrawColor(COLORS.accent);
      doc.setLineWidth(2);
      doc.line(x, y, x + 30, y);
      
      doc.setDrawColor(COLORS.light);
      doc.setLineWidth(0.5);
      doc.line(x + 35, y, x + width, y);
    } else if (style === 'gold') {
      doc.setDrawColor(COLORS.gold);
      doc.setLineWidth(1.5);
      doc.line(x, y, x + 40, y);
    }
  }

  /**
   * Stat card premium
   */
  function drawStatCard(doc, x, y, w, h, label, value, unit) {
    // Fond blanc avec ombre
    drawShadow(doc, x, y, w, h, 3);
    doc.setFillColor('#ffffff');
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    
    // Valeur grande
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(COLORS.primary);
    doc.text(value, x + w / 2, y + h * 0.5, { align: 'center' });
    
    // Unité
    doc.setFontSize(14);
    doc.setTextColor(COLORS.medium);
    doc.text(unit, x + w / 2, y + h * 0.65, { align: 'center' });
    
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLORS.accent);
    doc.text(label.toUpperCase(), x + w / 2, y + h - 8, { align: 'center' });
  }

  // =====================================================================
  // SÉLECTION DES VUES 3D
  // =====================================================================

  function selectShots(data, hs) {
    const bb = HouseAuto.bbox(data);
    const { out } = HouseAuto.findEntry(data, bb);
    const span = Math.max(3, bb.max);
    const top = Math.max(0, ...data.rooms.map(r => r.level), ...data.walls.map(w => w.level));
    const height = hs.levelOffset(top) + data.config.wallHeight;
    const distance = 1.6 * Math.max(span, height);
    
    // Vue façade premium (plus large, plus impactante)
    const facade = {
      label: 'Façade principale', 
      fov: 50, 
      interior: false,
      pos: [bb.cx + out.x * distance - out.z * span * 0.34, Math.max(1.9, height * 0.6), bb.cz + out.z * distance + out.x * span * 0.34],
      look: [bb.cx, height * 0.44, bb.cz]
    };
    
    const existing = (data.renderShots || []).filter(s => s.room && !s.night);
    const rooms = data.rooms.filter(r => r.habitable).slice().sort((a, b) =>
      Number(existing.some(s => s.room === b.id)) - Number(existing.some(s => s.room === a.id)) || b.area - a.area);
    
    // Vues intérieures premium
    const interior = rooms.slice(0, 3).map(r => {
      const authored = existing.find(s => s.room === r.id);
      if (authored) return { ...authored, label: r.name, interior: true };
      
      const { cam, look } = HouseAuto.roomPose(data, r);
      const y = hs.levelOffset(r.level);
      return { 
        label: r.name, 
        room: r.id, 
        interior: true, 
        fov: 65,
        pos: [cam.x, y + Math.min(1.45, data.config.wallHeight * 0.63), cam.z], 
        look: [look.x, y + 1.08, look.z] 
      };
    });
    
    return { facade, interior };
  }

  // =====================================================================
  // PAGE DE COUVERTURE PREMIUM
  // =====================================================================

  function drawCoverPage(doc, data, studio, variant) {
    // Fond avec dégradé sombre
    drawGradient(doc, 0, 0, 210, 297, COLORS.primary, COLORS.secondary, 20);
    
    // Titre du projet en haut
    premiumText(doc, variant ? `VARIANTE · ${variant.name}` : 'DOSSIER DE PRÉSENTATION', 
                margin, 25, 10, { bold: true, color: COLORS.accent });
    
    // Nom du projet en grand
    const title = data.meta?.name || 'Projet architectural';
    premiumText(doc, title, margin, 45, 36, { bold: true, color: '#ffffff', maxWidth: 170 });
    
    // Sous-titre
    if (data.meta?.subtitle) {
      premiumText(doc, data.meta.subtitle, margin, 60, 14, { color: COLORS.light, maxWidth: 170 });
    }
    
    // Ligne d'accent
    doc.setDrawColor(COLORS.accent);
    doc.setLineWidth(3);
    doc.line(margin, 70, margin + 60, 70);
    
    // Image 3D plein cadre avec overlay
    const shots = selectShots(data, studio.hs);
    const imgY = 85;
    const imgH = 120;
    const imgData = studio.capture(shots.facade, 1600, 800, 1, { clean: true, solar: variant });
    
    // Ombre derrière l'image
    drawShadow(doc, margin, imgY, width, imgH, 5);
    
    // Image
    doc.addImage(imgData, 'JPEG', margin, imgY, width, imgH);
    
    // Overlay dégradé en bas de l'image pour lisibilité
    doc.setFillColor('rgba(0,0,0,0.3)');
    doc.rect(margin, imgY + imgH - 30, width, 30, 'F');
    
    // Stats en bas
    const statsY = 220;
    const statW = 50;
    const statH = 55;
    
    const habitable = data.totals?.habitable || 0;
    const total = data.rooms.reduce((sum, room) => sum + room.area, 0);
    const roomCount = data.rooms.length;
    
    drawStatCard(doc, margin, statsY, statW, statH, 'Surface habitable', habitable.toFixed(0), 'm²');
    drawStatCard(doc, margin + statW + 10, statsY, statW, statH, 'Surface totale', total.toFixed(0), 'm²');
    drawStatCard(doc, margin + (statW + 10) * 2, statsY, statW, statH, 'Pièces', roomCount, '');
    
    // Mention IA si sublimé
    if (variant?.aiEnhanced) {
      premiumText(doc, '✨ Sublimé avec IA', margin + width - 40, 285, 8, { color: COLORS.goldLight, align: 'right' });
    }
  }

  // =====================================================================
  // PAGE PLAN & ESPACES PREMIUM
  // =====================================================================

  function drawPlanPage(doc, data, studio, variant) {
    // Fond blanc
    doc.setFillColor(COLORS.paper);
    doc.rect(0, 0, 210, 297, 'F');
    
    // Titre de section
    premiumText(doc, 'PLAN & ESPACES', margin, 25, 12, { bold: true, color: COLORS.medium });
    drawDivider(doc, margin, 30, width, 'accent');
    
    // Titre principal
    premiumText(doc, 'Plan de masse', margin, 45, 28, { bold: true });
    premiumText(doc, 'RDC et abords modélisés · cotes indicatives', margin, 55, 10, { color: COLORS.medium });
    
    // Plan de masse avec ombre
    const planY = 65;
    const planH = 100;
    drawShadow(doc, margin, planY, width, planH, 4);
    doc.setFillColor('#ffffff');
    doc.roundedRect(margin, planY, width, planH, 2, 2, 'F');
    
    // Dessiner le plan (réutiliser la logique existante)
    sitePlan(doc, data, margin + 5, planY + 5, width - 10, planH - 10, variant?.solar?.north);
    
    // Vues intérieures
    premiumText(doc, 'Vues intérieures', margin, 185, 22, { bold: true });
    
    const photoW = (width - 10) / 2;
    const photoH = 65;
    const shots = selectShots(data, studio.hs);
    
    for (let i = 0; i < 2; i++) {
      const shot = shots.interior[i];
      const x = margin + i * (photoW + 10);
      const y = 195;
      
      if (shot) {
        // Ombre
        drawShadow(doc, x, y, photoW, photoH, 4);
        
        // Image
        const imgData = studio.capture(shot, 1200, 750, 1, { clean: true, solar: variant });
        doc.addImage(imgData, 'JPEG', x, y, photoW, photoH);
        
        // Label avec fond
        doc.setFillColor('rgba(0,0,0,0.7)');
        doc.rect(x, y + photoH - 12, photoW, 12, 'F');
        
        premiumText(doc, shot.label, x + 3, y + photoH - 4, 10, { bold: true, color: '#ffffff' });
      } else {
        // Placeholder
        doc.setFillColor(COLORS.paper);
        drawShadow(doc, x, y, photoW, photoH, 3);
        doc.roundedRect(x, y, photoW, photoH, 2, 2, 'F');
        
        premiumText(doc, 'Pas de vue intérieure', x + photoW / 2, y + photoH / 2, 9, { 
          color: COLORS.light, 
          align: 'center' 
        });
      }
    }
    
    // Pied de page
    const title = data.meta?.name || 'Projet';
    premiumText(doc, title, margin, 285, 8, { color: COLORS.medium, maxWidth: 140 });
    premiumText(doc, '02 / 02', margin + width, 285, 8, { bold: true, color: COLORS.medium, align: 'right' });
  }

  // =====================================================================
  // PLAN DE MASSE (réutilisé de l'original)
  // =====================================================================

  function sitePlan(doc, data, x, y, w, h, northDegrees) {
    // Logique simplifiée - réutiliser le code original si nécessaire
    const bb = HouseAuto.bbox(data);
    
    // Fond
    doc.setFillColor('#ffffff');
    doc.rect(x, y, w, h, 'F');
    
    // Dessiner les pièces
    const rooms = data.rooms.filter(r => !r.level);
    const dx = Math.max(1, bb.xMax - bb.xMin);
    const dz = Math.max(1, bb.zMax - bb.zMin);
    const scale = Math.min((w - 20) / dx, (h - 10) / dz);
    
    const X = a => x + (w - dx * scale) / 2 + (a - bb.xMin) * scale;
    const Z = b => y + (h - dz * scale) / 2 + (b - bb.zMin) * scale;
    
    rooms.forEach(room => {
      const b = room.bounds;
      doc.setFillColor(room.habitable ? '#e8f5e9' : '#fff3e0');
      doc.rect(X(b.xMin), Z(b.zMin), (b.xMax - b.xMin) * scale, (b.zMax - b.zMin) * scale, 'F');
    });
    
    // Boussole
    const cx = x + w - 15, cy = y + 15;
    doc.setDrawColor(COLORS.primary);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, 6);
    premiumText(doc, 'N', cx, cy + 2, 8, { bold: true, align: 'center', color: COLORS.primary });
  }

  // =====================================================================
  // EXPORT PDF PREMIUM
  // =====================================================================

  async function exportPDF(data, studio, variant = null, prepare = () => {}) {
    const JsPDF = await loadJsPDF();
    const restore = prepare();
    
    try {
      const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
      
      const title = data.meta?.name || 'Projet architectural';
      doc.setProperties({ 
        title, 
        subject: 'Brochure architecturale premium',
        author: 'Plan to 3D House'
      });
      
      // Page 1 : Couverture premium
      drawCoverPage(doc, data, studio, variant);
      
      // Page 2 : Plan & espaces premium
      doc.addPage();
      drawPlanPage(doc, data, studio, variant);
      
      // Sauvegarder
      const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
      const suffix = variant?.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      doc.save(`${slug}${suffix ? '-' + suffix : ''}-premium.pdf`);
    } finally {
      restore?.();
    }
  }

  return { exportPDF };
})();
