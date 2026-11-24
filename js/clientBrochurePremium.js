/**
 * BROCHURE PDF PREMIUM — Design magazine architectural
 * 
 * Effets visuels :
 * - Typographie hiérarchisée (titres, sous-titres, corps)
 * - Grilles asymétriques modernes
 * - Dégradés et ombres portées
 * - Icônes SVG inline
 * - Charts visuels pour les données
 * - Mise en page éditoriale
 * - Éléments décoratifs géométriques
 * - Couleurs sophistiquées avec accent
 */

const ClientBrochurePremium = (() => {
  // =====================================================================
  // PALETTE DE COULEURS PREMIUM
  // =====================================================================
  
  const COLORS = {
    // Couleurs principales
    primary: '#1a1a2e',      // Bleu nuit profond
    secondary: '#16213e',    // Bleu sombre
    accent: '#e94560',       // Rouge corail vif
    accentLight: '#ff6b9d',  // Rose clair
    
    // Neutres sophistiqués
    dark: '#0f0f1e',         // Noir bleuté
    medium: '#4a4a5e',       // Gris bleuté
    light: '#a8a8c0',        // Gris clair
    paper: '#f8f9fa',        // Blanc cassé
    
    // Couleurs fonctionnelles
    success: '#10b981',      // Vert émeraude
    warning: '#f59e0b',      // Orange ambré
    info: '#3b82f6',         // Bleu info
    
    // Dégradés (simulés par couches)
    gradient1Start: '#667eea',
    gradient1End: '#764ba2',
    gradient2Start: '#f093fb',
    gradient2End: '#f5576c',
    
    // Couleurs de rooms
    roomHabitable: '#e8f5e9',
    roomService: '#fff3e0',
    roomExterieur: '#e3f2fd'
  };

  // =====================================================================
  // CONFIGURATION TYPOGRAPHIQUE
  // =====================================================================
  
  const TYPO = {
    // Familles de polices
    display: 'helvetica',    // Titres impactants
    body: 'helvetica',       // Corps de texte
    mono: 'courier',         // Données techniques
    
    // Tailles hiérarchisées
    hero: 42,                // Titre principal page 1
    h1: 28,                  // Titres de section
    h2: 18,                  // Sous-titres
    h3: 14,                  // Titres de bloc
    body: 10,                // Corps de texte
    caption: 8,              // Légendes
    small: 7                 // Notes de bas de page
  };

  // =====================================================================
  // UTILITAIRES DE DESSIN
  // =====================================================================

  /**
   * Dessine un dégradé vertical (simulé par bandes)
   */
  function drawGradient(doc, x, y, w, h, color1, color2, steps = 10) {
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
      
      doc.setFillColor(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
      doc.rect(x, y + i * stepH, w, stepH + 0.1, 'F');
    }
  }

  /**
   * Dessine une ombre portée
   */
  function drawShadow(doc, x, y, w, h, blur = 3, color = '#000000', opacity = 0.15) {
    doc.setFillColor(color);
    doc.setGState(new doc.GState({ opacity }));
    
    // Ombre décalée avec effet de flou (simulé par couches)
    for (let i = 0; i < blur; i++) {
      const offset = i * 0.5;
      const alpha = opacity * (1 - i / blur);
      doc.setGState(new doc.GState({ opacity: alpha }));
      doc.roundedRect(x + offset, y + offset, w, h, 1, 1, 'F');
    }
    
    doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /**
   * Dessine une carte avec ombre
   */
  function drawCard(doc, x, y, w, h, options = {}) {
    const { shadow = true, radius = 2, fill = '#ffffff', border = null } = options;
    
    if (shadow) {
      drawShadow(doc, x, y, w, h, 3);
    }
    
    doc.setFillColor(fill);
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
    
    if (border) {
      doc.setDrawColor(border);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, w, h, radius, radius, 'S');
    }
  }

  /**
   * Dessine une icône (formes géométriques simples)
   */
  function drawIcon(doc, type, x, y, size = 10, color = COLORS.accent) {
    doc.setFillColor(color);
    doc.setDrawColor(color);
    
    switch (type) {
      case 'home':
        // Maison simple
        doc.triangle(x, y + size * 0.4, x + size / 2, y, x + size, y + size * 0.4, 'F');
        doc.rect(x + size * 0.15, y + size * 0.4, size * 0.7, size * 0.6, 'F');
        break;
        
      case 'area':
        // Carré avec mesure
        doc.setLineWidth(0.5);
        doc.rect(x, y, size, size, 'S');
        doc.line(x, y + size, x + size, y + size);
        doc.text('m²', x + size / 2, y + size + 2, { align: 'center', fontSize: 6 });
        break;
        
      case 'rooms':
        // Grille de pièces
        const cellSize = size / 3;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            if ((i + j) % 2 === 0) {
              doc.rect(x + i * cellSize, y + j * cellSize, cellSize - 0.5, cellSize - 0.5, 'F');
            }
          }
        }
        break;
        
      case 'chart':
        // Graphique en barres
        const barW = size / 5;
        doc.rect(x, y + size * 0.6, barW, size * 0.4, 'F');
        doc.rect(x + barW + 1, y + size * 0.3, barW, size * 0.7, 'F');
        doc.rect(x + (barW + 1) * 2, y + size * 0.5, barW, size * 0.5, 'F');
        doc.rect(x + (barW + 1) * 3, y + size * 0.1, barW, size * 0.9, 'F');
        break;
        
      case 'location':
        // Pin de localisation
        doc.circle(x + size / 2, y + size * 0.3, size * 0.3, 'F');
        doc.triangle(x + size * 0.2, y + size * 0.5, x + size / 2, y + size, x + size * 0.8, y + size * 0.5, 'F');
        break;
    }
  }

  /**
   * Dessine un séparateur décoratif
   */
  function drawDivider(doc, x, y, width, style = 'line') {
    switch (style) {
      case 'line':
        doc.setDrawColor(COLORS.light);
        doc.setLineWidth(0.5);
        doc.line(x, y, x + width, y);
        break;
        
      case 'accent':
        doc.setDrawColor(COLORS.accent);
        doc.setLineWidth(2);
        doc.line(x, y, x + 30, y);
        doc.setDrawColor(COLORS.light);
        doc.setLineWidth(0.5);
        doc.line(x + 35, y, x + width, y);
        break;
        
      case 'dots':
        doc.setFillColor(COLORS.light);
        for (let i = 0; i < 5; i++) {
          doc.circle(x + i * 8, y, 1, 'F');
        }
        break;
    }
  }

  // =====================================================================
  // COMPOSANTS UI PREMIUM
  // =====================================================================

  /**
   * Stat card avec icône et valeur
   */
  function drawStatCard(doc, x, y, w, h, icon, label, value, unit = '') {
    drawCard(doc, x, y, w, h, { fill: '#ffffff' });
    
    // Icône en haut
    drawIcon(doc, icon, x + w / 2 - 5, y + 8, 10, COLORS.accent);
    
    // Valeur
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(24);
    doc.setTextColor(COLORS.primary);
    doc.text(value, x + w / 2, y + h * 0.55, { align: 'center' });
    
    // Unité
    if (unit) {
      doc.setFontSize(12);
      doc.setTextColor(COLORS.medium);
      doc.text(unit, x + w / 2, y + h * 0.65, { align: 'center' });
    }
    
    // Label
    doc.setFont(TYPO.body, 'normal');
    doc.setFontSize(TYPO.caption);
    doc.setTextColor(COLORS.medium);
    doc.text(label.toUpperCase(), x + w / 2, y + h - 8, { align: 'center' });
  }

  /**
   * Graphique en barres horizontal
   */
  function drawBarChart(doc, x, y, w, h, data, options = {}) {
    const { maxValue = null, color = COLORS.accent, showValues = true } = options;
    
    const max = maxValue || Math.max(...data.map(d => d.value));
    const barH = Math.min(8, (h - 10) / data.length - 2);
    
    data.forEach((item, i) => {
      const barY = y + i * (barH + 3);
      const barW = (item.value / max) * (w - 60);
      
      // Label
      doc.setFont(TYPO.body, 'normal');
      doc.setFontSize(TYPO.caption);
      doc.setTextColor(COLORS.medium);
      doc.text(item.label, x, barY + barH * 0.7, { align: 'left' });
      
      // Bar avec dégradé
      drawGradient(doc, x + 50, barY, barW, barH, color, COLORS.accentLight);
      
      // Valeur
      if (showValues) {
        doc.setFont(TYPO.body, 'bold');
        doc.setFontSize(TYPO.caption);
        doc.setTextColor(COLORS.primary);
        doc.text(item.value.toString(), x + 55 + barW, barY + barH * 0.7, { align: 'left' });
      }
    });
  }

  /**
   * Timeline verticale
   */
  function drawTimeline(doc, x, y, w, h, steps) {
    const stepH = (h - 20) / steps.length;
    
    // Ligne verticale
    doc.setDrawColor(COLORS.light);
    doc.setLineWidth(1);
    doc.line(x + 5, y + 10, x + 5, y + h - 10);
    
    steps.forEach((step, i) => {
      const stepY = y + 10 + i * stepH;
      
      // Cercle
      doc.setFillColor(COLORS.accent);
      doc.circle(x + 5, stepY, 3, 'F');
      
      // Numéro
      doc.setFont(TYPO.body, 'bold');
      doc.setFontSize(TYPO.caption);
      doc.setTextColor(COLORS.accent);
      doc.text((i + 1).toString(), x + 5, stepY + 1, { align: 'center' });
      
      // Texte
      doc.setFont(TYPO.body, 'normal');
      doc.setFontSize(TYPO.body);
      doc.setTextColor(COLORS.primary);
      doc.text(step.title, x + 15, stepY + 1);
      
      if (step.description) {
        doc.setFontSize(TYPO.caption);
        doc.setTextColor(COLORS.medium);
        doc.text(step.description, x + 15, stepY + 5);
      }
    });
  }

  // =====================================================================
  // MISE EN PAGE PREMIUM
  // =====================================================================

  /**
   * Page de couverture impactante
   */
  function drawCoverPage(doc, data, variant) {
    // Fond avec dégradé
    drawGradient(doc, 0, 0, 210, 297, COLORS.primary, COLORS.secondary, 20);
    
    // Grand titre
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.hero);
    doc.setTextColor('#ffffff');
    const title = data.meta?.name || 'Projet Architectural';
    doc.text(title, 20, 80, { maxWidth: 170 });
    
    // Sous-titre
    if (data.meta?.subtitle) {
      doc.setFontSize(TYPO.h2);
      doc.setTextColor(COLORS.light);
      doc.text(data.meta.subtitle, 20, 95, { maxWidth: 170 });
    }
    
    // Ligne accent
    doc.setDrawColor(COLORS.accent);
    doc.setLineWidth(3);
    doc.line(20, 105, 80, 105);
    
    // Stats en bas
    const stats = [
      { label: 'Surface habitable', value: data.totals?.habitable?.toFixed(0) || '0', unit: 'm²' },
      { label: 'Pièces', value: data.rooms?.length || '0', unit: '' },
      { label: 'Niveaux', value: Math.max(0, ...data.rooms.map(r => r.level)) + 1, unit: '' }
    ];
    
    const statW = 50;
    const statGap = 10;
    const startX = 20;
    
    stats.forEach((stat, i) => {
      const statX = startX + i * (statW + statGap);
      
      // Valeur
      doc.setFont(TYPO.display, 'bold');
      doc.setFontSize(32);
      doc.setTextColor('#ffffff');
      doc.text(stat.value, statX, 230);
      
      // Unité
      if (stat.unit) {
        doc.setFontSize(16);
        doc.setTextColor(COLORS.light);
        doc.text(stat.unit, statX + doc.getTextWidth(stat.value) + 2, 230);
      }
      
      // Label
      doc.setFont(TYPO.body, 'normal');
      doc.setFontSize(TYPO.caption);
      doc.setTextColor(COLORS.light);
      doc.text(stat.label.toUpperCase(), statX, 240);
    });
    
    // Variante si présente
    if (variant) {
      doc.setFontSize(TYPO.body);
      doc.setTextColor(COLORS.accent);
      doc.text(`Variante : ${variant.name}`, 20, 270);
    }
  }

  /**
   * Page de statistiques visuelles
   */
  function drawStatsPage(doc, data) {
    // Fond blanc
    doc.setFillColor('#ffffff');
    doc.rect(0, 0, 210, 297, 'F');
    
    // Titre de section
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.h1);
    doc.setTextColor(COLORS.primary);
    doc.text('ANALYSE DU PROJET', 20, 25);
    
    drawDivider(doc, 20, 30, 170, 'accent');
    
    // Grille de stats cards
    const totalArea = data.rooms.reduce((sum, r) => sum + r.area, 0);
    const habitableArea = data.totals?.habitable || totalArea;
    
    const stats = [
      { icon: 'area', label: 'Surface totale', value: totalArea.toFixed(0), unit: 'm²' },
      { icon: 'home', label: 'Surface habitable', value: habitableArea.toFixed(0), unit: 'm²' },
      { icon: 'rooms', label: 'Nombre de pièces', value: data.rooms.length, unit: '' },
      { icon: 'chart', label: 'Ratio habitable', value: ((habitableArea / totalArea) * 100).toFixed(0), unit: '%' }
    ];
    
    const cardW = 38;
    const cardH = 50;
    const gap = 8;
    const startX = 20;
    const startY = 45;
    
    stats.forEach((stat, i) => {
      const cardX = startX + (i % 4) * (cardW + gap);
      const cardY = startY + Math.floor(i / 4) * (cardH + gap);
      drawStatCard(doc, cardX, cardY, cardW, cardH, stat.icon, stat.label, stat.value, stat.unit);
    });
    
    // Graphique par type de pièce
    const roomTypes = {};
    data.rooms.forEach(room => {
      const type = room.type || 'autre';
      if (!roomTypes[type]) roomTypes[type] = 0;
      roomTypes[type] += room.area;
    });
    
    const chartData = Object.entries(roomTypes)
      .map(([type, area]) => ({ label: type.toUpperCase(), value: area }))
      .sort((a, b) => b.value - a.value);
    
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.h2);
    doc.setTextColor(COLORS.primary);
    doc.text('RÉPARTITION PAR TYPE', 20, 120);
    
    drawBarChart(doc, 20, 130, 170, 80, chartData);
    
    // Timeline des étapes
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.h2);
    doc.text('PROCESSUS DE CONCEPTION', 20, 225);
    
    const steps = [
      { title: 'Analyse du terrain', description: 'Étude du site et contraintes' },
      { title: 'Esquisse', description: 'Premières propositions' },
      { title: 'Développement', description: 'Affinement du projet' },
      { title: 'Finalisation', description: 'Dossier complet' }
    ];
    
    drawTimeline(doc, 20, 235, 170, 50, steps);
  }

  /**
   * Page de plan avec style magazine
   */
  function drawPlanPagePremium(doc, data, studio, variant) {
    // Fond
    doc.setFillColor(COLORS.paper);
    doc.rect(0, 0, 210, 297, 'F');
    
    // Titre
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.h1);
    doc.setTextColor(COLORS.primary);
    doc.text('PLAN DE MASSE', 20, 25);
    
    drawDivider(doc, 20, 30, 170, 'accent');
    
    // Plan avec ombre
    drawShadow(doc, 20, 40, 170, 120, 5);
    drawCard(doc, 20, 40, 170, 120, { fill: '#ffffff', radius: 3 });
    
    // Dessiner le plan (réutiliser la logique existante)
    sitePlan(doc, data, 25, 45, 160, 110, variant?.solar?.north);
    
    // Légende
    doc.setFont(TYPO.body, 'bold');
    doc.setFontSize(TYPO.h3);
    doc.setTextColor(COLORS.primary);
    doc.text('LÉGENDE', 20, 175);
    
    const legendItems = [
      { color: COLORS.roomHabitable, label: 'Pièces habitables' },
      { color: COLORS.roomService, label: 'Pièces de service' },
      { color: COLORS.roomExterieur, label: 'Extérieurs' }
    ];
    
    legendItems.forEach((item, i) => {
      const y = 185 + i * 8;
      doc.setFillColor(item.color);
      doc.rect(20, y - 3, 5, 5, 'F');
      doc.setFont(TYPO.body, 'normal');
      doc.setFontSize(TYPO.body);
      doc.setTextColor(COLORS.medium);
      doc.text(item.label, 28, y);
    });
    
    // Vue intérieure
    doc.setFont(TYPO.display, 'bold');
    doc.setFontSize(TYPO.h2);
    doc.setTextColor(COLORS.primary);
    doc.text('VUES INTÉRIEURES', 20, 220);
    
    const shots = selectShots(data, studio.hs);
    const photoW = 82;
    const photoH = 55;
    
    for (let i = 0; i < 2; i++) {
      const shot = shots.interior[i];
      const x = 20 + i * (photoW + 6);
      
      if (shot) {
        // Ombre pour la photo
        drawShadow(doc, x, 230, photoW, photoH, 3);
        
        const imgData = studio.capture(shot, 1000, 659);
        doc.addImage(imgData, 'JPEG', x, 230, photoW, photoH);
        
        // Label avec fond
        doc.setFillColor('rgba(0,0,0,0.7)');
        doc.rect(x, 230 + photoH - 10, photoW, 10, 'F');
        
        doc.setFont(TYPO.body, 'bold');
        doc.setFontSize(TYPO.body);
        doc.setTextColor('#ffffff');
        doc.text(shot.label, x + 3, 230 + photoH - 3);
      }
    }
  }

  // =====================================================================
  // FONCTION PRINCIPALE
  // =====================================================================

  async function exportPDFPremium(data, studio, variant = null) {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    
    const title = data.meta?.name || 'Projet architectural';
    doc.setProperties({ 
      title, 
      subject: 'Brochure architecturale premium',
      author: 'Plan to 3D House',
      creator: 'ClientBrochurePremium'
    });
    
    // Page 1 : Couverture
    drawCoverPage(doc, data, variant);
    
    // Page 2 : Statistiques
    doc.addPage();
    drawStatsPage(doc, data);
    
    // Page 3 : Plan et vues
    doc.addPage();
    drawPlanPagePremium(doc, data, studio, variant);
    
    // Sauvegarder
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    const suffix = variant?.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${slug}${suffix ? '-' + suffix : ''}-premium.pdf`);
  }

  return { exportPDFPremium };
})();
