const fs = require('fs');
const path = require('path');

const planBookPath = path.join(__dirname, '..', 'js', 'planBook.js');
let code = fs.readFileSync(planBookPath, 'utf8');

// 1. Couverture Catalogue des intérieurs (A4 Paysage - Calm Luxury Portfolio)
const oldCatalogCover = `    // Couverture.
    doc.setFillColor(C.dark).rect(0, 0, PW, PH, 'F');
    doc.addImage(jpeg(images[0].img, 2000, Math.round(2000 * PH / 190)), 'JPEG', 0, 0, 190, PH);
    const x = 202, w = PW - x - 12;
    text(doc, 'ARCHICAM STUDIO', x, 18, 9, { bold: true, color: C.white, space: 0.6 });
    doc.setDrawColor(C.sand).setLineWidth(0.3).line(x, 23, x + w, 23);
    kicker(doc, 'Catalogue', x, 62, C.sand);
    doc.setFont('times', 'bold').setFontSize(26).setTextColor(C.white);
    doc.splitTextToSize('Les intérieurs', w).forEach((line, n) => doc.text(line, x, 76 + n * 10));
    text(doc, title, x, 92, 12, { serif: true, color: '#e7ebe3', maxWidth: w });
    text(doc, \`\${images.length} vue\${images.length > 1 ? 's' : ''} photoréaliste\${images.length > 1 ? 's' : ''}\`, x, 101, 8.4, { color: C.sand });
    paragraph(doc, 'Images de présentation générées depuis la maquette du projet. Rendus d’ambiance non contractuels : matériaux, mobilier et lumière sont indicatifs.', x, PH - 34, w, 7.4, 1.5, '#b9c2b6');`;

const newCatalogCover = `    // Couverture Premium — Calm Luxury Portfolio (A4 Paysage)
    doc.setFillColor(C.paper).rect(0, 0, PW, PH, 'F');
    // Double filet d'encadrement éditorial
    doc.setDrawColor(C.rule).setLineWidth(0.35).rect(8, 8, PW - 16, PH - 16);
    doc.setDrawColor(C.sand).setLineWidth(0.18).rect(9.5, 9.5, PW - 19, PH - 19);

    // En-tête centré de prestige
    text(doc, 'ARCHICAM STUDIO', PW / 2, 18.5, 9.5, { align: 'center', bold: true, color: C.gold, space: 1.6 });
    text(doc, title.toUpperCase(), PW / 2, 28, 19, { align: 'center', serif: true, bold: true, color: C.ink, space: 0.5 });
    text(doc, 'CATALOGUE DES ESPACES INTÉRIEURS & AMBIANCES DE VIE', PW / 2, 34.5, 7.2, { align: 'center', color: C.muted, space: 1.1 });

    // Fenêtre d'art centrale avec passe-partout lin et filet doré
    const imgW = 216, imgH = Math.round(imgW * 9 / 16);
    const imgX = (PW - imgW) / 2, imgY = 40;
    doc.setFillColor('#ece7de').rect(imgX - 1.2, imgY - 1.2, imgW + 2.4, imgH + 2.4, 'F');
    doc.setDrawColor(C.sand).setLineWidth(0.25).rect(imgX, imgY, imgW, imgH);
    doc.addImage(jpeg(images[0].img, 2400, Math.round(2400 * imgH / imgW)), 'JPEG', imgX, imgY, imgW, imgH);

    // Légende sous la vue d'ouverture
    const heroCaption = \`FIG. 01 · \${roomName(images[0].view.label).toUpperCase()} · VUE D'OUVERTURE\`;
    text(doc, heroCaption, PW / 2, imgY + imgH + 5.5, 6.4, { align: 'center', color: C.muted, space: 0.6 });

    // Bas de page éditorial
    doc.setDrawColor(C.rule).setLineWidth(0.25).line(16, PH - 17, PW - 16, PH - 17);
    text(doc, \`\${images.length} PLANCHES PHOTORÉALISTES · HAUTE DÉFINITION\`, 18, PH - 12, 6.8, { bold: true, color: C.ink, space: 0.5 });
    text(doc, 'Édition Monographe Privée', PW / 2, PH - 12, 6.4, { align: 'center', color: C.gold, space: 0.6 });
    text(doc, 'Rendu d’ambiance illustratif non contractuel', PW - 18, PH - 12, 6.6, { align: 'right', color: C.muted });`;

// 2. Couverture Cahier de plans (A3 Paysage - Édition Monographe)
const oldPlanBookCover = `    const x = split + 14, w = W - split - 28;
    text(doc, 'PLAN / 3D', x, M + 10, 10, { bold: true, color: C.white, space: 0.6 });
    text(doc, 'CAHIER DE PLANS', x + w, M + 10, 7, { bold: true, color: C.sand, align: 'right', space: 1.1 });
    doc.setDrawColor(C.sand).setLineWidth(0.3).line(x, M + 15, x + w, M + 15);`;

const newPlanBookCover = `    const x = split + 14, w = W - split - 28;
    text(doc, 'ARCHICAM STUDIO', x, M + 10, 9.5, { bold: true, color: C.white, space: 0.8 });
    text(doc, 'CAHIER DE PLANS', x + w, M + 10, 7.5, { bold: true, color: C.sand, align: 'right', space: 1.2 });
    doc.setDrawColor(C.sand).setLineWidth(0.35).line(x, M + 15, x + w, M + 15);`;

// Normalize CRLF to LF
const normalize = s => s.replace(/\r\n/g, '\n');

if (normalize(code).includes(normalize(oldCatalogCover))) {
  code = normalize(code).replace(normalize(oldCatalogCover), normalize(newCatalogCover));
  console.log('✓ Couverture Catalogue A4 mise à jour.');
} else {
  console.warn('! oldCatalogCover non trouvé');
}

if (normalize(code).includes(normalize(oldPlanBookCover))) {
  code = normalize(code).replace(normalize(oldPlanBookCover), normalize(newPlanBookCover));
  console.log('✓ Couverture Cahier de plans A3 mise à jour.');
} else {
  console.warn('! oldPlanBookCover non trouvé');
}

fs.writeFileSync(planBookPath, code, 'utf8');
console.log('✓ js/planBook.js enregistré.');
