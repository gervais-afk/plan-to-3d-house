/**
 * FURNITURE 2D — Bibliothèque architecturale étendue, symboles CAO 2D réalistes,
 * miniatures SVG pour le catalogue, aimantation magnétique aux murs et modèles de départ.
 * Compatible navigateur (<script>) et Node.js (module.exports).
 */
const Furniture2D = (() => {
  'use strict';

  const CATALOG = [
    // Séjour
    { group: 'Séjour', name: 'Canapé 3 places', symbol: 'sofa', model: 'sofa', w: 2.1, d: 0.92, h: 0.82, color: '#78716a' },
    { group: 'Séjour', name: 'Canapé d’angle', symbol: 'sofaCorner', model: 'sofaCorner', w: 2.55, d: 1.75, h: 0.82, color: '#6b6560' },
    { group: 'Séjour', name: 'Canapé 2 places', symbol: 'sofa', model: 'sofa', w: 1.6, d: 0.9, h: 0.82, color: '#7a746d' },
    { group: 'Séjour', name: 'Fauteuil', symbol: 'armchair', model: 'armchair', w: 0.88, d: 0.85, h: 0.82, color: '#8a7f74' },
    { group: 'Séjour', name: 'Table basse', symbol: 'coffeeTable', model: 'coffeeTable', w: 1.2, d: 0.65, h: 0.4, color: '#9c7d5a' },
    { group: 'Séjour', name: 'Meuble TV', symbol: 'tvUnit', model: 'tvUnit', w: 1.85, d: 0.46, h: 0.52, color: '#35383c' },
    { group: 'Séjour', name: 'Tapis', symbol: 'rug', model: 'rug', w: 2.4, d: 1.7, h: 0.02, color: '#e4dac9' },

    // Repas
    { group: 'Repas', name: 'Table à manger 6p', symbol: 'diningTable', model: 'diningTable', w: 1.8, d: 0.95, h: 0.76, color: '#8c6b4a' },
    { group: 'Repas', name: 'Table ronde 4p', symbol: 'diningRound', model: 'diningRound', w: 1.15, d: 1.15, h: 0.76, color: '#8c6b4a' },
    { group: 'Repas', name: 'Chaise', symbol: 'chair', model: 'chair', w: 0.46, d: 0.48, h: 0.88, color: '#3b3d40' },
    { group: 'Repas', name: 'Buffet / Console', symbol: 'buffet', model: 'buffet', w: 1.6, d: 0.45, h: 0.82, color: '#634c36' },

    // Cuisine
    { group: 'Cuisine', name: 'Plan de travail', symbol: 'kitchenCounter', model: 'kitchenCounter', w: 2.4, d: 0.62, h: 0.9, color: '#45494e' },
    { group: 'Cuisine', name: 'Îlot central', symbol: 'kitchenIsland', model: 'kitchenIsland', w: 1.9, d: 0.9, h: 0.9, color: '#51565c' },
    { group: 'Cuisine', name: 'Plaque cuisson', symbol: 'cooktop', model: 'cooktop', w: 0.65, d: 0.52, h: 0.05, elev: 0.9, color: '#1f2226' },
    { group: 'Cuisine', name: 'Évier inox', symbol: 'sink', model: 'sink', w: 0.85, d: 0.5, h: 0.04, elev: 0.9, color: '#b4b9be' },
    { group: 'Cuisine', name: 'Meuble haut', symbol: 'upperCabinet', model: 'upperCabinet', w: 1.0, d: 0.35, h: 0.7, elev: 1.55, color: '#cbb79d' },
    { group: 'Cuisine', name: 'Réfrigérateur', symbol: 'fridge', model: 'fridge', w: 0.7, d: 0.68, h: 1.9, color: '#d6d9dc' },

    // Chambre
    { group: 'Chambre', name: 'Lit double 160', symbol: 'bed', model: 'bed', w: 1.65, d: 2.05, h: 0.52, color: '#dcd6cd' },
    { group: 'Chambre', name: 'Lit king 180', symbol: 'bed', model: 'bed', w: 1.85, d: 2.05, h: 0.54, color: '#dcd6cd' },
    { group: 'Chambre', name: 'Lit simple 90', symbol: 'bedSingle', model: 'bed', w: 0.95, d: 2.0, h: 0.5, color: '#dcd6cd' },
    { group: 'Chambre', name: 'Chevet', symbol: 'nightstand', model: 'nightstand', w: 0.45, d: 0.42, h: 0.52, color: '#8d6d4d' },
    { group: 'Chambre', name: 'Armoire / Dressing', symbol: 'wardrobe', model: 'wardrobe', w: 1.5, d: 0.6, h: 2.2, color: '#ece7df' },

    // Eau
    { group: 'Eau', name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', w: 0.4, d: 0.66, h: 0.78, color: '#f6f6f4' },
    { group: 'Eau', name: 'Meuble vasque', symbol: 'vanity', model: 'vanity', w: 0.85, d: 0.48, h: 0.85, color: '#f3f1ec' },
    { group: 'Eau', name: 'Douche italienne', symbol: 'shower', model: 'shower', w: 1.1, d: 0.9, h: 2.1, color: '#e6ecef' },
    { group: 'Eau', name: 'Baignoire', symbol: 'bathtub', model: 'bathtub', w: 1.75, d: 0.78, h: 0.58, color: '#f4f6f6' },

    // Bureau & Extérieur
    { group: 'Bureau & Ext.', name: 'Bureau', symbol: 'desk', model: 'desk', w: 1.35, d: 0.68, h: 0.75, color: '#8f6f4f' },
    { group: 'Bureau & Ext.', name: 'Salon terrasse', symbol: 'terraceSet', model: 'diningTable', w: 1.5, d: 0.9, h: 0.74, color: '#9c7c58' },
    { group: 'Bureau & Ext.', name: 'Transat', symbol: 'lounger', model: 'lounger', w: 0.72, d: 1.95, h: 0.38, color: '#d8ccb9' },
    { group: 'Bureau & Ext.', name: 'Voiture (garage)', symbol: 'car', model: 'car', w: 1.85, d: 4.4, h: 1.48, color: '#5f6b74' },

    // Déco
    { group: 'Déco', name: 'Plante haute', symbol: 'plantTall', model: 'plantTall', w: 0.55, d: 0.55, h: 1.35, color: '#4c6b39' },
    { group: 'Déco', name: 'Plante basse', symbol: 'plantBush', model: 'plantBush', w: 0.45, d: 0.45, h: 0.65, color: '#5b7c44' },
    { group: 'Déco', name: 'Bibliothèque', symbol: 'shelf', model: 'shelf', w: 1.2, d: 0.38, h: 1.95, color: '#7c654d' }
  ];

  function inferSymbol(item) {
    if (!item) return 'box';
    if (item.symbol) return item.symbol;
    const m = String(item.model || '');
    const n = String(item.name || '').toLowerCase();
    if (m === 'sofaCorner' || /angle|sectionnel/.test(n)) return 'sofaCorner';
    if (m === 'armchair' || /fauteuil/.test(n)) return 'armchair';
    if (m === 'sofa' || /canap/.test(n)) return 'sofa';
    if (m === 'bed' || /\blit\b/.test(n)) return (item.w && item.w <= 1.15) || /simple|90/.test(n) ? 'bedSingle' : 'bed';
    if (m === 'nightstand' || /chevet/.test(n)) return 'nightstand';
    if (m === 'diningRound' || /ronde/.test(n)) return 'diningRound';
    if (m === 'diningTable' || /table.*manger|terrasse/.test(n)) return /terrasse/.test(n) ? 'terraceSet' : 'diningTable';
    if (m === 'coffeeTable' || /table basse/.test(n)) return 'coffeeTable';
    if (m === 'chair' || /chaise/.test(n)) return 'chair';
    if (m === 'desk' || /bureau/.test(n)) return 'desk';
    if (m === 'tvUnit' || /\btv\b|télé/.test(n)) return 'tvUnit';
    if (m === 'rug' || /tapis/.test(n)) return 'rug';
    if (m === 'kitchenIsland' || /îlot|ilot/.test(n)) return 'kitchenIsland';
    if (m === 'kitchenCounter' || /plan de travail/.test(n)) return 'kitchenCounter';
    if (m === 'cooktop' || /plaque|cuisson|cuisin/.test(n)) return 'cooktop';
    if (m === 'sink' || /évier|evier/.test(n)) return 'sink';
    if (m === 'upperCabinet' || /meuble haut/.test(n)) return 'upperCabinet';
    if (m === 'fridge' || /frigo|réfrig|refrig/.test(n)) return 'fridge';
    if (m === 'wardrobe' || /armoire|dressing|placard/.test(n)) return 'wardrobe';
    if (m === 'toilet' || /\bwc\b|cuvette/.test(n)) return 'toilet';
    if (m === 'vanity' || /vasque|lave-mains|lavabo/.test(n)) return 'vanity';
    if (m === 'shower' || /douche/.test(n)) return 'shower';
    if (m === 'bathtub' || /baignoire/.test(n)) return 'bathtub';
    if (m === 'plantTall' || m === 'plantBush' || /plante|palmier|ficus/.test(n)) return /basse/.test(n) ? 'plantBush' : 'plantTall';
    if (m === 'shelf' || /étag|etag|biblio/.test(n)) return 'shelf';
    if (m === 'buffet' || /buffet|console/.test(n)) return 'buffet';
    if (m === 'lounger' || /transat/.test(n)) return 'lounger';
    if (m === 'car' || /voiture|véhicule|garage/.test(n)) return 'car';
    return 'box';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /**
   * Dessine un symbole architectural 2D en vue de dessus, centré en (0, 0),
   * dans le repère local du meuble (largeur W sur X, profondeur D sur Y, avant en +D/2).
   */
  function drawSymbolLocal(ctx, sym, W, D, baseColor, strokeColor, lineWidth) {
    const hw = W / 2;
    const hd = D / 2;
    const ink = strokeColor || '#26302b';
    const softInk = 'rgba(22, 28, 25, 0.42)';
    const fill = baseColor || '#cfc7ba';

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (sym) {
      case 'sofa':
      case 'armchair': {
        const armW = Math.min(W * 0.14, D * 0.24);
        const backD = D * 0.24;
        // Base
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.08);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Dossier (-Y)
        roundRectPath(ctx, -hw, -hd, W, backD, Math.min(W, D) * 0.06);
        ctx.fillStyle = 'rgba(22,28,25,0.14)';
        ctx.fill();
        ctx.stroke();
        // Accoudoirs
        roundRectPath(ctx, -hw, -hd, armW, D * 0.92, Math.min(W, D) * 0.05);
        ctx.fill();
        ctx.stroke();
        roundRectPath(ctx, hw - armW, -hd, armW, D * 0.92, Math.min(W, D) * 0.05);
        ctx.fill();
        ctx.stroke();
        // Coussins d'assise
        const innerW = W - armW * 2;
        const seats = sym === 'armchair' ? 1 : (W / Math.max(D, 0.1) > 1.9 ? 3 : 2);
        const sw = innerW / seats;
        ctx.strokeStyle = softInk;
        for (let i = 0; i < seats; i++) {
          const sx = -hw + armW + i * sw;
          roundRectPath(ctx, sx + 1, -hd + backD + 1, sw - 2, D - backD - 3, Math.min(sw, D) * 0.08);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fill();
          ctx.stroke();
        }
        break;
      }

      case 'sofaCorner': {
        const legD = D * 0.48;
        const chaiseW = W * 0.38;
        const back = Math.min(W, D) * 0.15;
        ctx.beginPath();
        ctx.moveTo(-hw, -hd);
        ctx.lineTo(hw, -hd);
        ctx.lineTo(hw, hd);
        ctx.lineTo(hw - chaiseW, hd);
        ctx.lineTo(hw - chaiseW, -hd + legD);
        ctx.lineTo(-hw, -hd + legD);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Dossier arrière + retour droit
        ctx.fillStyle = 'rgba(22,28,25,0.16)';
        ctx.fillRect(-hw, -hd, W, back);
        ctx.strokeRect(-hw, -hd, W, back);
        ctx.fillRect(hw - back, -hd, back, D * 0.65);
        ctx.strokeRect(hw - back, -hd, back, D * 0.65);
        // Lignes de séparation coussins
        ctx.strokeStyle = softInk;
        ctx.beginPath();
        ctx.moveTo(-hw + (W - chaiseW) * 0.5, -hd + back);
        ctx.lineTo(-hw + (W - chaiseW) * 0.5, -hd + legD);
        ctx.moveTo(hw - chaiseW, -hd + back);
        ctx.lineTo(hw - chaiseW, -hd + legD);
        ctx.stroke();
        break;
      }

      case 'bed':
      case 'bedSingle': {
        // Cadre de lit
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.04);
        ctx.fillStyle = '#f8f6f1';
        ctx.fill();
        ctx.stroke();
        // Tête de lit (-Y)
        const headD = Math.max(D * 0.07, 2.5);
        ctx.fillStyle = '#735840';
        ctx.fillRect(-hw, -hd, W, headD);
        ctx.strokeRect(-hw, -hd, W, headD);
        // Couette repliée (+Y)
        const duvetY = -hd + D * 0.34;
        ctx.fillStyle = fill;
        ctx.fillRect(-hw + 1, duvetY, W - 2, D - (duvetY + hd) - 1);
        ctx.strokeStyle = softInk;
        ctx.strokeRect(-hw + 1, duvetY, W - 2, D - (duvetY + hd) - 1);
        // Pli de drap diagonal élégant
        ctx.beginPath();
        ctx.moveTo(-hw + 1, duvetY + D * 0.08);
        ctx.lineTo(hw - 1, duvetY + D * 0.08);
        ctx.stroke();
        // Oreillers
        const pCount = sym === 'bedSingle' ? 1 : 2;
        const pad = W * 0.07;
        const pw = (W - pad * (pCount + 1)) / pCount;
        const ph = D * 0.19;
        for (let i = 0; i < pCount; i++) {
          const px = -hw + pad + i * (pw + pad);
          roundRectPath(ctx, px, -hd + headD + D * 0.05, pw, ph, Math.min(pw, ph) * 0.22);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = ink;
          ctx.stroke();
        }
        break;
      }

      case 'diningTable':
      case 'terraceSet': {
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.06);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Filet intérieur de plateau bois
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.strokeRect(-hw + W * 0.06, -hd + D * 0.08, W * 0.88, D * 0.84);
        // Chaises suggérées en pointillé fin autour (repère d'encombrement)
        const nSide = Math.max(2, Math.round(W / Math.max(D, 0.2) * 1.4));
        const cw = Math.min(W / (nSide + 0.5), D * 0.42);
        const cd = Math.min(D * 0.16, cw * 0.45);
        ctx.strokeStyle = softInk;
        for (let i = 0; i < nSide; i++) {
          const cx = -hw + (W / nSide) * (i + 0.5);
          ctx.strokeRect(cx - cw * 0.4, -hd - cd, cw * 0.8, cd);
          ctx.strokeRect(cx - cw * 0.4, hd, cw * 0.8, cd);
        }
        break;
      }

      case 'diningRound': {
        const r = Math.min(hw, hd);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.stroke();
        // 4 repères de chaises
        ctx.strokeStyle = softInk;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.12, a - 0.25, a + 0.25);
          ctx.stroke();
        }
        break;
      }

      case 'chair': {
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.18);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Dossier courbé en -Y
        roundRectPath(ctx, -hw, -hd, W, D * 0.24, Math.min(W, D) * 0.14);
        ctx.fillStyle = 'rgba(22,28,25,0.26)';
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'coffeeTable': {
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.14);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Plateau central / revue
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.strokeRect(-hw * 0.72, -hd * 0.65, W * 0.72, D * 0.65);
        break;
      }

      case 'tvUnit': {
        ctx.fillStyle = fill;
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        // Écran plat mince côté arrière (-Y)
        const screenW = W * 0.72;
        const screenD = Math.max(D * 0.14, 2);
        ctx.fillStyle = '#111518';
        ctx.fillRect(-screenW / 2, -hd + D * 0.18, screenW, screenD);
        ctx.strokeStyle = '#9ca3af';
        ctx.strokeRect(-screenW / 2, -hd + D * 0.18, screenW, screenD);
        break;
      }

      case 'rug': {
        ctx.fillStyle = fill;
        ctx.fillRect(-hw, -hd, W, D);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = softInk;
        ctx.strokeRect(-hw, -hd, W, D);
        ctx.setLineDash([]);
        ctx.strokeRect(-hw + W * 0.06, -hd + D * 0.08, W * 0.88, D * 0.84);
        break;
      }

      case 'kitchenCounter':
      case 'kitchenIsland': {
        ctx.fillStyle = '#e7e4dc';
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        // Crédence / bord arrière
        if (sym === 'kitchenCounter') {
          ctx.fillStyle = 'rgba(22,28,25,0.16)';
          ctx.fillRect(-hw, -hd, W, D * 0.1);
        }
        // Divisions de caissons
        const mods = Math.max(2, Math.round(W / Math.max(D, 0.3)));
        ctx.strokeStyle = softInk;
        for (let i = 1; i < mods; i++) {
          const x = -hw + (W / mods) * i;
          ctx.beginPath(); ctx.moveTo(x, -hd); ctx.lineTo(x, hd); ctx.stroke();
        }
        break;
      }

      case 'cooktop': {
        roundRectPath(ctx, -hw, -hd, W, D, 2);
        ctx.fillStyle = '#1f2328';
        ctx.fill();
        ctx.stroke();
        const pts = [[-0.25, -0.24, 0.16], [0.25, -0.24, 0.13], [-0.25, 0.22, 0.13], [0.25, 0.22, 0.17]];
        ctx.strokeStyle = '#d1d5db';
        pts.forEach(([px, py, pr]) => {
          ctx.beginPath();
          ctx.arc(px * W, py * D, Math.min(W, D) * pr, 0, Math.PI * 2);
          ctx.stroke();
        });
        break;
      }

      case 'sink': {
        roundRectPath(ctx, -hw, -hd, W, D, 2);
        ctx.fillStyle = '#dfe4e7';
        ctx.fill();
        ctx.stroke();
        // Cuve principale + égouttoir
        roundRectPath(ctx, -hw + W * 0.07, -hd + D * 0.14, W * 0.48, D * 0.72, 2);
        ctx.fillStyle = '#c5cdd2';
        ctx.fill();
        ctx.stroke();
        // Bonde
        ctx.beginPath();
        ctx.arc(-hw + W * 0.31, 0, Math.min(W, D) * 0.06, 0, Math.PI * 2);
        ctx.stroke();
        // Rainures d'égouttoir
        ctx.strokeStyle = softInk;
        for (let i = 0; i < 4; i++) {
          const y = -hd + D * (0.24 + i * 0.17);
          ctx.beginPath(); ctx.moveTo(W * 0.1, y); ctx.lineTo(hw - W * 0.08, y); ctx.stroke();
        }
        // Mitigeur
        ctx.strokeStyle = ink;
        ctx.beginPath(); ctx.moveTo(-hw + W * 0.31, -hd + D * 0.06); ctx.lineTo(-hw + W * 0.31, -hd + D * 0.24); ctx.stroke();
        break;
      }

      case 'fridge': {
        roundRectPath(ctx, -hw, -hd, W, D, 2);
        ctx.fillStyle = '#eef1f2';
        ctx.fill();
        ctx.stroke();
        // Diagonale technique CAO + poignée avant (+Y)
        ctx.strokeStyle = softInk;
        ctx.beginPath();
        ctx.moveTo(-hw + 2, -hd + 2); ctx.lineTo(hw - 2, hd - 2);
        ctx.moveTo(hw - 2, -hd + 2); ctx.lineTo(-hw + 2, hd - 2);
        ctx.stroke();
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(-hw * 0.6, hd - 1.5); ctx.lineTo(hw * 0.6, hd - 1.5);
        ctx.stroke();
        break;
      }

      case 'toilet': {
        // Réservoir arrière (-Y)
        const tankD = D * 0.3;
        roundRectPath(ctx, -hw * 0.92, -hd, W * 0.92, tankD, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        // Cuvette ovale (+Y)
        ctx.beginPath();
        ctx.ellipse(0, -hd + tankD + (D - tankD) * 0.5, hw * 0.86, (D - tankD) * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        // Lunette intérieure
        ctx.beginPath();
        ctx.ellipse(0, -hd + tankD + (D - tankD) * 0.52, hw * 0.56, (D - tankD) * 0.34, 0, 0, Math.PI * 2);
        ctx.strokeStyle = softInk;
        ctx.stroke();
        break;
      }

      case 'vanity': {
        ctx.fillStyle = '#f5f4f0';
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        // Vasque ovale encastrée
        ctx.beginPath();
        ctx.ellipse(0, D * 0.05, Math.min(hw * 0.62, D * 0.55), D * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        // Robinet
        ctx.beginPath();
        ctx.moveTo(0, -hd + D * 0.08);
        ctx.lineTo(0, -hd + D * 0.28);
        ctx.stroke();
        break;
      }

      case 'shower': {
        ctx.fillStyle = '#edf3f5';
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        // Diagonales d'écoulement vers la bonde
        const bx = 0, by = 0;
        ctx.strokeStyle = softInk;
        ctx.beginPath();
        ctx.moveTo(-hw, -hd); ctx.lineTo(hw, hd);
        ctx.moveTo(hw, -hd); ctx.lineTo(-hw, hd);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, by, Math.min(W, D) * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.stroke();
        // Paroi vitrée bleutée sur un côté
        ctx.strokeStyle = '#3d7fae';
        ctx.lineWidth = Math.max(lineWidth * 1.8, 2);
        ctx.beginPath();
        ctx.moveTo(-hw, hd); ctx.lineTo(hw * 0.3, hd);
        ctx.stroke();
        break;
      }

      case 'bathtub': {
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.12);
        ctx.fillStyle = '#f7f9f9';
        ctx.fill();
        ctx.stroke();
        // Bassin intérieur arrondi
        const pad = Math.min(W, D) * 0.1;
        roundRectPath(ctx, -hw + pad, -hd + pad, W - pad * 2, D - pad * 2, Math.min(W, D) * 0.28);
        ctx.fillStyle = '#e5f0f5';
        ctx.fill();
        ctx.strokeStyle = softInk;
        ctx.stroke();
        // Bonde côté gauche
        ctx.beginPath();
        ctx.arc(-hw + pad * 2.4, 0, Math.min(W, D) * 0.055, 0, Math.PI * 2);
        ctx.strokeStyle = ink;
        ctx.stroke();
        break;
      }

      case 'wardrobe':
      case 'buffet':
      case 'shelf':
      case 'upperCabinet': {
        ctx.fillStyle = fill;
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        if (sym === 'wardrobe') {
          // Tringle en pointillé + croix penderie
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = softInk;
          ctx.beginPath(); ctx.moveTo(-hw + 2, 0); ctx.lineTo(hw - 2, 0); ctx.stroke();
          ctx.setLineDash([]);
          // Double battants devant (+Y)
          ctx.strokeStyle = ink;
          ctx.beginPath(); ctx.moveTo(0, -hd); ctx.lineTo(0, hd); ctx.stroke();
        } else if (sym === 'upperCabinet') {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = softInk;
          ctx.strokeRect(-hw + 2, -hd + 2, W - 4, D - 4);
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = softInk;
          ctx.beginPath();
          ctx.moveTo(-hw + W * 0.33, -hd); ctx.lineTo(-hw + W * 0.33, hd);
          ctx.moveTo(-hw + W * 0.66, -hd); ctx.lineTo(-hw + W * 0.66, hd);
          ctx.stroke();
        }
        break;
      }

      case 'desk': {
        roundRectPath(ctx, -hw, -hd, W, D, 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Écran ordinateur
        ctx.fillStyle = '#1f2428';
        ctx.fillRect(-W * 0.22, -hd + D * 0.16, W * 0.44, Math.max(D * 0.09, 2));
        // Clavier
        ctx.strokeStyle = softInk;
        ctx.strokeRect(-W * 0.16, -hd + D * 0.42, W * 0.32, D * 0.16);
        break;
      }

      case 'nightstand': {
        roundRectPath(ctx, -hw, -hd, W, D, 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Lampe de chevet (cercle)
        ctx.beginPath();
        ctx.arc(0, -D * 0.05, Math.min(W, D) * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,250,235,0.85)';
        ctx.fill();
        ctx.strokeStyle = softInk;
        ctx.stroke();
        break;
      }

      case 'plantTall':
      case 'plantBush': {
        const r = Math.min(hw, hd);
        // Feuillage étoilé organique (7 lobes)
        ctx.fillStyle = sym === 'plantTall' ? 'rgba(76, 107, 57, 0.85)' : 'rgba(98, 130, 74, 0.82)';
        ctx.strokeStyle = '#2d4522';
        ctx.beginPath();
        const petals = sym === 'plantTall' ? 7 : 6;
        for (let i = 0; i < petals * 2; i++) {
          const a = (i * Math.PI) / petals;
          const rad = i % 2 === 0 ? r : r * 0.56;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Pot central
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#c58f65';
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'lounger': {
        roundRectPath(ctx, -hw, -hd, W, D, Math.min(W, D) * 0.12);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
        // Dossier incliné (-Y)
        ctx.strokeStyle = softInk;
        ctx.beginPath(); ctx.moveTo(-hw + 2, -hd + D * 0.32); ctx.lineTo(hw - 2, -hd + D * 0.32); ctx.stroke();
        roundRectPath(ctx, -hw * 0.65, -hd + D * 0.06, W * 0.65, D * 0.14, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'car': {
        roundRectPath(ctx, -hw, -hd, W, D, W * 0.24);
        ctx.fillStyle = 'rgba(95, 107, 116, 0.28)';
        ctx.fill();
        ctx.stroke();
        // Pare-brise & toit
        roundRectPath(ctx, -hw * 0.78, -hd + D * 0.24, W * 0.78, D * 0.46, W * 0.12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();
        ctx.strokeStyle = softInk;
        ctx.stroke();
        break;
      }

      default: {
        ctx.fillStyle = fill;
        ctx.fillRect(-hw, -hd, W, D);
        ctx.strokeRect(-hw, -hd, W, D);
        break;
      }
    }
  }

  /**
   * Dessine un meuble complet sur le canvas 2D (avec ombre douce, symbole CAO,
   * surbrillance sélection, poignée de rotation interactive si sélectionné).
   */
  function drawFurniture2D(ctx, item, screenPos, scale, opts = {}) {
    const W = Math.max(4, (item.w || 0.6) * scale);
    const D = Math.max(4, (item.d || 0.6) * scale);
    const sym = inferSymbol(item);
    const sel = !!opts.selected;
    const ghost = !!opts.ghost;

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(-(item.rotY || 0));

    if (ghost) {
      ctx.globalAlpha = 0.68;
    } else if (scale > 20) {
      ctx.shadowColor = 'rgba(22, 28, 25, 0.14)';
      ctx.shadowBlur = sel ? 8 : 4;
      ctx.shadowOffsetY = 1.5;
    }

    drawSymbolLocal(
      ctx,
      sym,
      W,
      D,
      item.color || '#c7bfb2',
      sel ? '#b38646' : (ghost ? '#9a6f2a' : '#2c3530'),
      sel ? 2 : 1.15
    );

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Cadre de sélection + poignée de rotation interactive (avant +D/2)
    if (sel && !ghost) {
      const pad = 4;
      ctx.strokeStyle = '#b38646';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(-W / 2 - pad, -D / 2 - pad, W + pad * 2, D + pad * 2);
      ctx.setLineDash([]);

      // Tige + poignée circulaire de rotation devant le meuble
      const handleDist = D / 2 + 18;
      ctx.beginPath();
      ctx.moveTo(0, D / 2 + pad);
      ctx.lineTo(0, handleDist);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, handleDist, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b38646';
      ctx.stroke();
    } else if (ghost) {
      // Petite flèche d'orientation avant (+D/2) pour la prévisualisation au curseur
      ctx.fillStyle = '#9a6f2a';
      ctx.beginPath();
      ctx.moveTo(0, D / 2 + 7);
      ctx.lineTo(-4, D / 2 + 1);
      ctx.lineTo(4, D / 2 + 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Position monde de la poignée de rotation d'un meuble sélectionné.
   */
  function getRotateHandleWorld(item, scale) {
    const distWorld = (item.d || 0.6) / 2 + 18 / Math.max(10, scale || 45);
    const r = item.rotY || 0;
    return {
      x: item.x + Math.sin(r) * distWorld,
      z: item.z + Math.cos(r) * distWorld
    };
  }

  /**
   * Crée une miniature canvas haute netteté (64x44) représentant le vrai symbole CAO 2D du meuble.
   */
  function createThumbnailCanvas(item) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 112;
    c.height = 76;
    c.className = 'ed-lib-thumb';
    c.setAttribute('aria-hidden', 'true');
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const maxW = 84, maxH = 54;
    const ratio = Math.min(maxW / Math.max(item.w || 0.6, 0.3), maxH / Math.max(item.d || 0.6, 0.3));
    const W = Math.max(16, (item.w || 0.6) * ratio);
    const D = Math.max(14, (item.d || 0.6) * ratio);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    drawSymbolLocal(ctx, inferSymbol(item), W, D, item.color || '#cfc7ba', '#232d28', 1.6);
    ctx.restore();
    return c;
  }

  /**
   * Aimantation magnétique d'un meuble contre le mur le plus proche :
   * colle l'arrière du meuble (-d/2) contre la face du mur et oriente l'avant (+d/2) vers l'intérieur.
   */
  function snapFurnitureToWall(pt, item, walls, maxDist = 0.55) {
    if (!pt || !item || !Array.isArray(walls) || !walls.length) return null;
    const sym = inferSymbol(item);
    // Les tapis, tables à manger centrales et plantes ne collent pas obligatoirement aux murs
    if (['rug', 'diningRound', 'kitchenIsland'].includes(sym)) return null;

    let best = null;
    for (const w of walls) {
      const ax = w.from[0], az = w.from[1];
      const dx = w.to[0] - ax, dz = w.to[1] - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.3) continue;
      const t = Math.max(0, Math.min(1, ((pt.x - ax) * dx + (pt.z - az) * dz) / (L * L)));
      const px = ax + dx * t, pz = az + dz * t;
      const dist = Math.hypot(pt.x - px, pt.z - pz);
      const wallHalf = (w.thick || 0.15) / 2;
      const targetOffset = wallHalf + (item.d || 0.6) / 2 + 0.02;
      if (dist <= targetOffset + maxDist && (!best || dist < best.dist)) {
        // Normale unitaire pointant du mur vers le curseur
        let nx = -dz / L, nz = dx / L;
        if ((pt.x - px) * nx + (pt.z - pz) * nz < 0) { nx = -nx; nz = -nz; }
        // Dans le repère local du meuble, l'avant (+d/2) pointe vers (sin(rotY), cos(rotY))
        const rotY = Math.atan2(nx, nz);
        best = {
          dist,
          wall: w,
          x: Math.round((px + nx * targetOffset) * 100) / 100,
          z: Math.round((pz + nz * targetOffset) * 100) / 100,
          rotY: Math.round(((rotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 10000) / 10000
        };
      }
    }
    return best;
  }

  /**
   * Modèles de démarrage instantanés (prêts à éditer en 2D et 3D).
   */
  function getStarterTemplate(kind) {
    if (kind === 'studio') {
      return {
        meta: { name: 'STUDIO CONTEMPORAIN', slug: 'studio-contemporain', subtitle: 'Studio fonctionnel 38 m² — Modèle de départ', phase: 'ESQ' },
        config: { wallHeight: 2.8, floorHeight: 3, roofStyle: 'flat' },
        walls: [
          { from: [-3.5, -2.75], to: [3.5, -2.75], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'window', at: 2.2, w: 1.6, h: 1.3, sill: 0.9, level: 0 }] },
          { from: [3.5, -2.75], to: [3.5, 2.75], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'bay', at: 2.75, w: 2.2, h: 2.15, sill: 0, level: 0 }] },
          { from: [3.5, 2.75], to: [-3.5, 2.75], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'door', at: 5.8, w: 0.95, h: 2.1, sill: 0, hinge: 'start', side: -1, entry: true, level: 0 }] },
          { from: [-3.5, 2.75], to: [-3.5, -2.75], thick: 0.25, type: 'ext', level: 0, openings: [] },
          { from: [-1.1, -2.75], to: [-1.1, -0.35], thick: 0.15, type: 'int', level: 0, openings: [{ type: 'door', at: 1.7, w: 0.8, h: 2.1, sill: 0, hinge: 'start', side: 1, level: 0 }] },
          { from: [-3.5, -0.35], to: [-1.1, -0.35], thick: 0.15, type: 'int', level: 0, openings: [] }
        ],
        rooms: [
          { id: 'sejour', name: 'SÉJOUR / NUIT', level: 0, bounds: { xMin: -1.1, xMax: 3.5, zMin: -2.75, zMax: 2.75 }, floorType: 'parquet', habitable: true, desc: 'Pièce de vie lumineuse avec coin cuisine' },
          { id: 'sdb', name: 'SALLE D’EAU', level: 0, bounds: { xMin: -3.5, xMax: -1.1, zMin: -2.75, zMax: -0.35 }, floorType: 'tiles', habitable: true, desc: 'Douche italienne et vasque' },
          { id: 'entree', name: 'ENTRÉE', level: 0, bounds: { xMin: -3.5, xMax: -1.1, zMin: -0.35, zMax: 2.75 }, floorType: 'tiles', habitable: true, desc: 'Entrée avec rangement' }
        ],
        columns: [],
        canopies: [],
        stairwells: [],
        furniture: [
          { name: 'Canapé 3 places', symbol: 'sofa', model: 'sofa', level: 0, x: 1.5, z: -2.15, w: 2.1, d: 0.92, h: 0.82, elev: 0, color: '#78716a', rotY: 0, dims: 'local', room: 'sejour' },
          { name: 'Table basse', symbol: 'coffeeTable', model: 'coffeeTable', level: 0, x: 1.5, z: -0.9, w: 1.2, d: 0.65, h: 0.4, elev: 0, color: '#9c7d5a', rotY: 0, dims: 'local', room: 'sejour' },
          { name: 'Plan de travail', symbol: 'kitchenCounter', model: 'kitchenCounter', level: 0, x: 0.4, z: 2.3, w: 2.4, d: 0.62, h: 0.9, elev: 0, color: '#45494e', rotY: Math.PI, dims: 'local', room: 'sejour' },
          { name: 'Douche italienne', symbol: 'shower', model: 'shower', level: 0, x: -2.85, z: -2.15, w: 1.1, d: 0.9, h: 2.1, elev: 0, color: '#e6ecef', rotY: 0, dims: 'local', room: 'sdb' },
          { name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', level: 0, x: -1.65, z: -2.25, w: 0.4, d: 0.66, h: 0.78, elev: 0, color: '#f6f6f4', rotY: 0, dims: 'local', room: 'sdb' },
          { name: 'Meuble vasque', symbol: 'vanity', model: 'vanity', level: 0, x: -2.5, z: -0.72, w: 0.85, d: 0.48, h: 0.85, elev: 0, color: '#f3f1ec', rotY: Math.PI, dims: 'local', room: 'sdb' },
          { name: 'Plante haute', symbol: 'plantTall', model: 'plantTall', level: 0, x: 3.0, z: -2.2, w: 0.55, d: 0.55, h: 1.35, elev: 0, color: '#4c6b39', rotY: 0, dims: 'local', room: 'sejour' }
        ]
      };
    }

    // Par défaut : Villa F4 118 m² plain-pied
    return {
      meta: { name: 'VILLA HORIZON F4', slug: 'villa-horizon-f4', subtitle: 'Villa contemporaine 3 chambres · 118 m² habitables', phase: 'APS' },
      config: { wallHeight: 2.9, floorHeight: 3.1, roofStyle: 'flat' },
      walls: [
        // Enveloppe 12m × 10m
        { from: [-6, -5], to: [6, -5], thick: 0.25, type: 'ext', level: 0, openings: [
          { type: 'window', at: 2.1, w: 1.4, h: 1.25, sill: 0.95, level: 0 },
          { type: 'window', at: 6.0, w: 1.4, h: 1.25, sill: 0.95, level: 0 },
          { type: 'window', at: 10.0, w: 1.5, h: 1.25, sill: 0.95, level: 0 }
        ] },
        { from: [6, -5], to: [6, 5], thick: 0.25, type: 'ext', level: 0, openings: [
          { type: 'bay', at: 7.4, w: 2.6, h: 2.2, sill: 0, level: 0 }
        ] },
        { from: [6, 5], to: [-6, 5], thick: 0.25, type: 'ext', level: 0, openings: [
          { type: 'bay', at: 2.8, w: 2.8, h: 2.2, sill: 0, level: 0 },
          { type: 'door', at: 7.4, w: 1.05, h: 2.15, sill: 0, hinge: 'start', side: -1, entry: true, level: 0 },
          { type: 'window', at: 10.2, w: 1.4, h: 1.25, sill: 0.95, level: 0 }
        ] },
        { from: [-6, 5], to: [-6, -5], thick: 0.25, type: 'ext', level: 0, openings: [
          { type: 'window', at: 2.5, w: 1.3, h: 1.25, sill: 0.95, level: 0 }
        ] },
        // Cloisons intérieures
        { from: [0.5, -5], to: [0.5, 5], thick: 0.15, type: 'int', level: 0, openings: [
          { type: 'open', at: 6.5, w: 1.5, h: 2.4, sill: 0, level: 0 },
          { type: 'door', at: 3.4, w: 0.85, h: 2.1, sill: 0, hinge: 'start', side: 1, level: 0 }
        ] },
        { from: [-6, 0], to: [0.5, 0], thick: 0.15, type: 'int', level: 0, openings: [
          { type: 'door', at: 4.5, w: 0.85, h: 2.1, sill: 0, hinge: 'start', side: 1, level: 0 }
        ] },
        { from: [-2.4, -5], to: [-2.4, 0], thick: 0.15, type: 'int', level: 0, openings: [
          { type: 'door', at: 3.9, w: 0.8, h: 2.1, sill: 0, hinge: 'start', side: -1, level: 0 }
        ] },
        { from: [0.5, -0.5], to: [6, -0.5], thick: 0.15, type: 'int', level: 0, openings: [
          { type: 'open', at: 2.4, w: 2.0, h: 2.4, sill: 0, level: 0 }
        ] }
      ],
      rooms: [
        { id: 'sejour', name: 'GRAND SÉJOUR', level: 0, bounds: { xMin: 0.5, xMax: 6, zMin: -0.5, zMax: 5 }, floorType: 'tiles', habitable: true, desc: 'Séjour traversant ouvert sur la terrasse' },
        { id: 'cuisine', name: 'CUISINE OUVERTE', level: 0, bounds: { xMin: 0.5, xMax: 6, zMin: -5, zMax: -0.5 }, floorType: 'tiles', habitable: true, desc: 'Cuisine équipée avec îlot central' },
        { id: 'chambre-1', name: 'SUITE PARENTALE', level: 0, bounds: { xMin: -6, xMax: 0.5, zMin: 0, zMax: 5 }, floorType: 'parquet', habitable: true, desc: 'Suite parentale avec dressing' },
        { id: 'chambre-2', name: 'CHAMBRE 2', level: 0, bounds: { xMin: -6, xMax: -2.4, zMin: -5, zMax: 0 }, floorType: 'parquet', habitable: true, desc: 'Chambre d’amis lumineuse' },
        { id: 'sdb', name: 'SALLE DE BAIN', level: 0, bounds: { xMin: -2.4, xMax: 0.5, zMin: -5, zMax: 0 }, floorType: 'tiles', habitable: true, desc: 'Douche italienne, baignoire et double vasque' }
      ],
      columns: [],
      canopies: [
        { name: 'Terrasse couverte', type: 'pergola', level: 0, xMin: 0.5, xMax: 6, zMin: 5, zMax: 7.4, y: 2.9, slat: 0.08, gap: 0.28, color: '#5b4634' }
      ],
      stairwells: [],
      furniture: [
        { name: 'Canapé d’angle', symbol: 'sofaCorner', model: 'sofaCorner', level: 0, x: 2.2, z: 1.5, w: 2.55, d: 1.75, h: 0.82, elev: 0, color: '#6b6560', rotY: Math.PI / 2, dims: 'local', room: 'sejour' },
        { name: 'Table basse', symbol: 'coffeeTable', model: 'coffeeTable', level: 0, x: 3.7, z: 2.1, w: 1.2, d: 0.65, h: 0.4, elev: 0, color: '#9c7d5a', rotY: Math.PI / 2, dims: 'local', room: 'sejour' },
        { name: 'Meuble TV', symbol: 'tvUnit', model: 'tvUnit', level: 0, x: 5.55, z: 1.8, w: 1.85, d: 0.46, h: 0.52, elev: 0, color: '#35383c', rotY: -Math.PI / 2, dims: 'local', room: 'sejour' },
        { name: 'Plan de travail', symbol: 'kitchenCounter', model: 'kitchenCounter', level: 0, x: 3.2, z: -4.55, w: 3.2, d: 0.62, h: 0.9, elev: 0, color: '#45494e', rotY: 0, dims: 'local', room: 'cuisine' },
        { name: 'Îlot central', symbol: 'kitchenIsland', model: 'kitchenIsland', level: 0, x: 3.2, z: -2.4, w: 2.0, d: 0.9, h: 0.9, elev: 0, color: '#51565c', rotY: 0, dims: 'local', room: 'cuisine' },
        { name: 'Réfrigérateur', symbol: 'fridge', model: 'fridge', level: 0, x: 5.45, z: -4.45, w: 0.7, d: 0.68, h: 1.9, elev: 0, color: '#d6d9dc', rotY: 0, dims: 'local', room: 'cuisine' },
        { name: 'Lit king 180', symbol: 'bed', model: 'bed', level: 0, x: -3.2, z: 1.35, w: 1.85, d: 2.05, h: 0.54, elev: 0, color: '#dcd6cd', rotY: 0, dims: 'local', room: 'chambre-1' },
        { name: 'Armoire / Dressing', symbol: 'wardrobe', model: 'wardrobe', level: 0, x: -5.5, z: 2.4, w: 1.8, d: 0.6, h: 2.2, elev: 0, color: '#ece7df', rotY: Math.PI / 2, dims: 'local', room: 'chambre-1' },
        { name: 'Lit double 160', symbol: 'bed', model: 'bed', level: 0, x: -4.2, z: -3.7, w: 1.65, d: 2.05, h: 0.52, elev: 0, color: '#dcd6cd', rotY: 0, dims: 'local', room: 'chambre-2' },
        { name: 'Douche italienne', symbol: 'shower', model: 'shower', level: 0, x: -1.7, z: -4.35, w: 1.15, d: 0.95, h: 2.1, elev: 0, color: '#e6ecef', rotY: 0, dims: 'local', room: 'sdb' },
        { name: 'Meuble vasque', symbol: 'vanity', model: 'vanity', level: 0, x: -0.1, z: -3.2, w: 1.0, d: 0.48, h: 0.85, elev: 0, color: '#f3f1ec', rotY: -Math.PI / 2, dims: 'local', room: 'sdb' },
        { name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', level: 0, x: -0.15, z: -1.6, w: 0.4, d: 0.66, h: 0.78, elev: 0, color: '#f6f6f4', rotY: -Math.PI / 2, dims: 'local', room: 'sdb' },
        { name: 'Plante haute', symbol: 'plantTall', model: 'plantTall', level: 0, x: 1.1, z: 4.35, w: 0.55, d: 0.55, h: 1.35, elev: 0, color: '#4c6b39', rotY: 0, dims: 'local', room: 'sejour' }
      ]
    };
  }

  return {
    CATALOG,
    inferSymbol,
    drawFurniture2D,
    getRotateHandleWorld,
    createThumbnailCanvas,
    snapFurnitureToWall,
    getStarterTemplate
  };
})();

if (typeof window !== 'undefined') window.Furniture2D = Furniture2D;
if (typeof module !== 'undefined') module.exports = Furniture2D;
