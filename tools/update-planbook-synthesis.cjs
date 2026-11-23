const fs = require('fs');
const file = 'C:/Users/HP/Desktop/plan de maison animé/js/planBook.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add 'synth' to SECTIONS if not present
if (!content.includes("id: 'synth'")) {
  content = content.replace(
    "const SECTIONS = [",
    "const SECTIONS = [\n    { id: 'synth', label: 'Planche de synthèse', hint: 'One-pager complet : plan 2D, 3D, intérieurs, écorché et matières' },"
  );
  console.log('Added synth to SECTIONS');
}

// 2. Add 'synth' to sheets in exportBook if not present
if (!content.includes("...(on('synth')")) {
  content = content.replace(
    "const sheets = [{ id: 'cover', title: 'Couverture', section: 'Présentation' },",
    "const sheets = [{ id: 'cover', title: 'Couverture', section: 'Présentation' },\n      ...(on('synth') ? [{ id: 'synth', title: 'Planche de synthèse', section: 'Synthèse du projet' }] : []),"
  );
  console.log('Added synth to sheets');
}

// 3. Add sheet rendering branch
if (!content.includes("else if (sheet.id === 'synth')")) {
  content = content.replace(
    "if (sheet.id === 'cover') cover(doc, data, sheet, hero, sheets, views[0]);",
    "if (sheet.id === 'cover') cover(doc, data, sheet, hero, sheets, views[0]);\n      else if (sheet.id === 'synth') await drawSynthesisBoard(doc, data, sheet, studio, views);"
  );
  console.log('Added synth branch to rendering loop');
}

// 4. Add drawSynthesisBoard implementation before exportCatalog
if (!content.includes("async function drawSynthesisBoard")) {
  const synthesisCode = `
  /**
   * Planche de Synthèse Architecturale A3 Paysage (Master Project Board / One-Pager) :
   * En-tête éditorial, plan 2D meublé coté, maquette générale, 3 perspectives intérieures,
   * écorché 3D axonométrique, tableau des surfaces et nuancier des matériaux nobles.
   */
  async function drawSynthesisBoard(doc, data, sheet, studio, views = []) {
    const hs = studio?.hs;
    const i = info(data, sheet);
    const bb = HouseAuto.bbox(data);
    const levels = [...new Set(data.walls.map(w => Number(w.level) || 0))].sort((a, b) => a - b);
    const habitable = data.totals?.habitable || data.rooms.filter(r => r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const annexesArea = data.rooms.filter(r => !r.habitable).reduce((s, r) => s + (r.area || 0), 0);
    const totalArea = habitable + annexesArea;

    // Fond papier lin chaud adouci & double filet de cadrage éditorial
    doc.setFillColor(C.paper).rect(0, 0, W, H, 'F');
    doc.setDrawColor(C.rule).setLineWidth(0.35).rect(8, 8, W - 16, H - 16);
    doc.setDrawColor(C.sand).setLineWidth(0.18).rect(9.5, 9.5, W - 19, H - 19);

    // En-tête de prestige (Haut Gauche)
    const projectTitle = nameForDisplay(data.meta?.name || 'Projet').toUpperCase();
    text(doc, projectTitle, 14, 20.5, 20, { serif: true, bold: true, color: C.ink, space: 0.3 });
    const sub = \`SUPERFICIE HABITABLE : \${fr.format(habitable)} m² · EMPRISE : \${fr.format(bb.w)} × \${fr.format(bb.d)} m · \${levels.length <= 1 ? 'PLAIN-PIED' : 'R+' + (levels.length - 1)}\`;
    text(doc, sub, 14, 27, 8.2, { bold: true, color: C.muted, space: 0.5 });

    // Cartouche officiel d'architecture (Haut Droite)
    const cw = 98, ch = 23, cx = W - 14 - cw, cy = 11;
    doc.setFillColor(C.white).rect(cx, cy, cw, ch, 'F');
    doc.setDrawColor(C.ink).setLineWidth(0.35).rect(cx, cy, cw, ch);
    text(doc, 'ARCHICAM STUDIO', cx + cw / 2, cy + 5.5, 8.5, { align: 'center', bold: true, color: C.gold, space: 1.4 });
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(cx, cy + 8, cx + cw, cy + 8);
    text(doc, 'PLANCHE DE SYNTHÈSE DU PROJET', cx + cw / 2, cy + 12.8, 7.2, { align: 'center', bold: true, color: C.ink, space: 0.4 });
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(cx, cy + 15.5, cx + cw, cy + 15.5);
    text(doc, \`Échelle indicative · Phase \${i.phase} · Indice \${i.revision}\`, cx + 4, cy + 20, 6, { color: C.muted });
    text(doc, i.date, cx + cw - 4, cy + 20, 6, { align: 'right', color: C.muted });

    // Boussole Nord
    const nx = cx - 12, ny = cy + ch / 2;
    doc.setDrawColor(C.ink).setLineWidth(0.25).circle(nx, ny, 5);
    doc.setFillColor(C.ink).triangle(nx, ny - 4.5, nx - 1.5, ny + 1.5, nx + 1.5, ny + 1.5, 'F');
    text(doc, 'N', nx, ny - 6.5, 6, { bold: true, align: 'center' });

    // Résolution intelligente des vues
    const findView = (...keys) => {
      for (const k of keys) {
        const v = views.find(x => x.id?.includes(k) || x.source?.includes(k) || x.label?.toLowerCase().includes(k.toLowerCase()));
        if (v?.source) return v.source;
      }
      return null;
    };

    const drawBox = async (title, x, y, w, h, src, fallbackFn) => {
      kicker(doc, title, x, y - 2);
      doc.setFillColor(C.white).rect(x, y, w, h, 'F');
      doc.setDrawColor(C.sand).setLineWidth(0.25).rect(x, y, w, h);
      if (src) {
        try {
          const img = await loadImage(src);
          doc.addImage(jpeg(img, Math.round(w * 10), Math.round(h * 10)), 'JPEG', x, y, w, h);
          return;
        } catch {}
      }
      if (fallbackFn) fallbackFn(x, y, w, h);
    };

    // --- Colonne GAUCHE (Plan 2D + Tableau + Nuancier) ---
    // Plan 2D d'aménagement (X = 14, Y = 38, W = 158, H = 145)
    const planSrc = findView('photor-plan-2d', 'plan-2d', 'plan') || data.config?.planImage?.url;
    await drawBox("PLAN D'AMÉNAGEMENT · REZ-DE-CHAUSSÉE", 14, 38, 158, 145, planSrc, (x, y, w, h) => {
      drawPlan(doc, data, 0, { x, y, w, h }, 100);
    });

    // Tableau des surfaces (X = 14, Y = 194, W = 86, H = 84)
    kicker(doc, 'TABLEAU DES SURFACES', 14, 192);
    let ty = 197;
    const rooms = data.rooms.slice().sort((a, b) => (b.area || 0) - (a.area || 0));
    rooms.slice(0, 7).forEach(r => {
      text(doc, roomName(r.name), 14, ty, 7, { bold: r.habitable, maxWidth: 56 });
      text(doc, \`\${fr.format(r.area || 0)} m²\`, 14 + 86, ty, 7, { align: 'right', bold: r.habitable });
      doc.setDrawColor(C.rule).setLineWidth(0.12).line(14, ty + 1.5, 14 + 86, ty + 1.5);
      ty += 5.2;
    });
    doc.setDrawColor(C.ink).setLineWidth(0.35).line(14, ty + 0.5, 14 + 86, ty + 0.5);
    ty += 4.5;
    text(doc, 'TOTAL HABITABLE', 14, ty, 7.5, { bold: true });
    text(doc, \`\${fr.format(habitable)} m²\`, 14 + 86, ty, 7.5, { align: 'right', bold: true });
    ty += 4.5;
    text(doc, 'Annexes (véranda, terrasse)', 14, ty, 6.5, { color: C.muted });
    text(doc, \`\${fr.format(annexesArea)} m²\`, 14 + 86, ty, 6.5, { align: 'right', color: C.muted });
    ty += 4.5;
    doc.setDrawColor(C.gold).setLineWidth(0.4).line(14, ty, 14 + 86, ty);
    text(doc, 'SURFACE GLOBALE', 14, ty + 4, 7.8, { bold: true, color: C.gold });
    text(doc, \`\${fr.format(totalArea)} m²\`, 14 + 86, ty + 4, 7.8, { align: 'right', bold: true, color: C.gold });

    // Matériauthèque & Finitions (X = 108, Y = 194, W = 64, H = 84)
    kicker(doc, 'MATÉRIAUTHÈQUE & FINITIONS', 108, 192);
    const swatches = [
      { label: 'Enduit à la chaux vert sauge', color: '#7D8C7C', sub: 'Murs extérieurs' },
      { label: 'Pierre calcaire flammée', color: '#C5BCAC', sub: 'Piliers & perron' },
      { label: 'Menuiseries alu noir mat', color: '#272B2D', sub: 'Baies & vitrages' },
      { label: 'Parquet chêne massif', color: '#C49F6E', sub: 'Séjour & chambres' },
      { label: 'Toiture tuiles sombres / zinc', color: '#3A4247', sub: 'Couverture' }
    ];
    swatches.forEach((sw, idx) => {
      const sy = 196 + idx * 15.5;
      doc.setFillColor(sw.color).rect(108, sy, 11, 11, 'F');
      doc.setDrawColor(C.sand).setLineWidth(0.2).rect(108, sy, 11, 11);
      text(doc, sw.label, 122, sy + 4.5, 6.8, { bold: true, color: C.ink, maxWidth: 50 });
      text(doc, sw.sub, 122, sy + 8.8, 5.8, { color: C.muted });
    });

    // --- Colonne CENTRALE (X = 180, W = 114) ---
    const extSrc = findView('photor-perspective-01', 'perspective-01', 'facade') || views[0]?.source;
    await drawBox("MAQUETTE GÉNÉRALE · PERSPECTIVE D'ACCUEIL", 180, 38, 114, 73, extSrc, (x, y, w, h) => {
      if (hs) doc.addImage(render(hs, axonometric(data, hs), 1200, 770), 'JPEG', x, y, w, h);
    });

    const sejourSrc = findView('photor-sejour-veranda', 'sejour', 'salon');
    await drawBox("SÉJOUR CATHÉDRALE & VÉRANDA", 180, 122, 114, 73, sejourSrc);

    const verandaSrc = findView('photor-perspective-02', 'perspective-02', 'terrasse');
    await drawBox("VÉRANDA ARRIÈRE & JARDIN PAYSAGER", 180, 206, 114, 73, verandaSrc);

    // --- Colonne DROITE (X = 302, W = 104) ---
    const cuisineSrc = findView('photor-cuisine', 'cuisine');
    await drawBox("CUISINE CONTEMPORAINE", 302, 38, 104, 62, cuisineSrc);

    const suiteSrc = findView('photor-suite-parentale', 'suite', 'chambre');
    await drawBox("SUITE PARENTALE & BALCON", 302, 111, 104, 62, suiteSrc);

    const coupeSrc = findView('photor-coupe-bb', 'coupe');
    await drawBox("COUPE PERSPECTIVE 3D · ÉCORCHÉ", 302, 184, 104, 95, coupeSrc, (x, y, w, h) => {
      if (hs) doc.addImage(render(hs, axonometric(data, hs, -Math.PI / 2), 1200, 1000, { section: true }), 'JPEG', x, y, w, h);
    });

    // Bas de page éditorial
    doc.setDrawColor(C.rule).setLineWidth(0.2).line(14, 287, W - 14, 287);
    text(doc, 'ARCHICAM STUDIO · PLANCHE DE SYNTHÈSE ARCHITECTURALE', 14, 291.5, 6.4, { bold: true, color: C.ink, space: 0.4 });
    text(doc, 'Édition Monographe Privée · Rendu illustratif d’ambiance non contractuel', W - 14, 291.5, 6.2, { align: 'right', color: C.muted });
  }

  async function exportSynthesisBoard({ data, studio, onStatus = () => {} }) {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape', compress: true });
    onStatus('Composition de la planche de synthèse…');
    const views = await publishedViews(data, { keepDuplicates: true, includePlans: true });
    await drawSynthesisBoard(doc, data, { code: 'PL-01', title: 'Planche de synthèse architecturale' }, studio, views);
    const slug = (window.ACTIVE_PROJECT_SLUG || data.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-');
    doc.save(\`\${slug}-planche-de-synthese.pdf\`);
    return { success: true };
  }
`;

  content = content.replace("async function exportCatalog({ data, onStatus = () => {} }) {", synthesisCode + "\n  async function exportCatalog({ data, onStatus = () => {} }) {");
  console.log('Added drawSynthesisBoard and exportSynthesisBoard');
}

// 5. Update return statement to export exportSynthesisBoard and drawSynthesisBoard
if (!content.includes("exportSynthesisBoard")) {
  content = content.replace(
    "return { exportBook, exportCatalog,",
    "return { exportBook, exportCatalog, exportSynthesisBoard, drawSynthesisBoard,"
  );
  console.log('Updated return statement');
}

fs.writeFileSync(file, content, 'utf8');
console.log('planBook.js updated successfully!');
