const test = require('node:test');
const assert = require('node:assert/strict');
const PdfVectorExtract = require('../js/pdfVectorExtract');

const OPS = PdfVectorExtract.DEFAULT_OPS;

function buildSynthetic3RoomHousePdf() {
  // Échelle 1/100 : 1 m réel = 28.3464567 pt PDF
  const scaleDenom = 100;
  const ppm = PdfVectorExtract.ptsPerMeterForDenominator(scaleDenom);
  const pageH = 842; // A4/A3 portrait/paysage arbitraire
  const toPdf = (xM, zM) => [50 + xM * ppm, pageH - (50 + zM * ppm)];

  const fnArray = [];
  const argsArray = [];

  const addLine = (x1, z1, x2, z2) => {
    const [px1, py1] = toPdf(x1, z1);
    const [px2, py2] = toPdf(x2, z2);
    fnArray.push(OPS.moveTo, OPS.lineTo, OPS.stroke);
    argsArray.push([px1, py1], [px2, py2], []);
  };

  // Helper mur : paire de traits parallèles séparés de `thick`
  const addWall = (x1, z1, x2, z2, thick) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const nx = (-dz / len) * (thick / 2);
    const nz = (dx / len) * (thick / 2);
    addLine(x1 + nx, z1 + nz, x2 + nx, z2 + nz);
    addLine(x1 - nx, z1 - nz, x2 - nx, z2 - nz);
  };

  // Helper arc de porte 90° (approximation cubique Bézier kappa = 0.55228475)
  const addDoorArc = (hx, hz, r, startAngle, endAngle) => {
    const k = 0.55228475;
    const x0 = hx + r * Math.cos(startAngle), z0 = hz + r * Math.sin(startAngle);
    const x3 = hx + r * Math.cos(endAngle), z3 = hz + r * Math.sin(endAngle);
    const sign = endAngle > startAngle ? 1 : -1;
    const x1 = x0 - sign * k * r * Math.sin(startAngle);
    const z1 = z0 + sign * k * r * Math.cos(startAngle);
    const x2 = x3 + sign * k * r * Math.sin(endAngle);
    const z2 = z3 - sign * k * r * Math.cos(endAngle);
    const [px0, py0] = toPdf(x0, z0);
    const [px1, py1] = toPdf(x1, z1);
    const [px2, py2] = toPdf(x2, z2);
    const [px3, py3] = toPdf(x3, z3);
    fnArray.push(OPS.moveTo, OPS.curveTo, OPS.stroke);
    argsArray.push([px0, py0], [px1, py1, px2, py2, px3, py3], []);
    // Vantail (segment de la charnière vers la fin de l'arc)
    addLine(hx, hz, x3, z3);
  };

  // Helper fenêtre : 3 traits parallèles espacés de 0.03 m
  const addWindow = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len, nz = dx / len;
    for (const off of [-0.03, 0, 0.03]) {
      addLine(x1 + nx * off, z1 + nz * off, x2 + nx * off, z2 + nz * off);
    }
  };

  // Maison 3 pièces : 10 m x 6 m
  // 4 murs extérieurs (épaisseur 0.20 m)
  addWall(0, 0, 10, 0, 0.20);   // Nord
  addWall(10, 0, 10, 6, 0.20);  // Est
  addWall(0, 6, 10, 6, 0.20);   // Sud
  addWall(0, 0, 0, 6, 0.20);    // Ouest
  // 2 cloisons intérieures (épaisseur 0.12 m)
  addWall(6, 0, 6, 6, 0.12);    // Sépare Séjour (x=0..6) de Chambre 1 / Cuisine (x=6..10)
  addWall(6, 3.5, 10, 3.5, 0.12); // Sépare Chambre 1 (z=0..3.5) de Cuisine (z=3.5..6)

  // 2 portes :
  // - Porte d'entrée sur mur Sud (z=6), largeur 0.90 m, charnière à (2.0, 6.0)
  addDoorArc(2.0, 6.0, 0.90, 0, -Math.PI / 2);
  // - Porte intérieure sur cloison x=6, largeur 0.80 m, charnière à (6.0, 1.5)
  addDoorArc(6.0, 1.5, 0.80, Math.PI / 2, 0);

  // 2 fenêtres :
  // - Fenêtre Séjour sur mur Nord (z=0), x = 2.0 à 3.6 (largeur 1.60 m)
  addWindow(2.0, 0, 3.6, 0);
  // - Fenêtre Chambre 1 sur mur Est (x=10), z = 1.0 à 2.2 (largeur 1.20 m)
  addWindow(10, 1.0, 10, 2.2);

  // 1 trait vectoriel orphelin (ex. mobilier ou cote non interprétée) de 1.5 m -> doit aller dans toVerify
  addLine(1.0, 2.0, 2.5, 2.0);

  const textItem = (str, xM, zM) => {
    const [px, py] = toPdf(xM, zM);
    return { str, transform: [10, 0, 0, 10, px, py] };
  };

  const textContent = {
    items: [
      textItem('TITRE DU PLAN : PLAN DE DISTRIBUTION RDC', 0.5, 7.2),
      textItem('Échelle : 1/100', 7.0, 7.2),
      textItem('Séjour', 3.0, 3.0),
      textItem('36,0 m²', 3.0, 3.4),
      textItem('Chambre 1', 8.0, 1.8),
      textItem('14,0 m²', 8.0, 2.2),
      textItem('Cuisine', 8.0, 4.7),
      textItem('10,0 m²', 8.0, 5.1)
    ]
  };

  return {
    operatorList: { fnArray, argsArray },
    textContent,
    pageHeightPt: pageH,
    ppm,
    originOffsetM: 50 / ppm
  };
}

test('Lot 5 — Extraction vectorielle d’une maison 3 pièces (murs, portes, fenêtres, pièces, tolérance ≤ 2 cm)', () => {
  const synth = buildSynthetic3RoomHousePdf();

  // 1. Sans confirmation d'échelle : proposition 1/100 signalée dans « À vérifier »
  const unconfirmed = PdfVectorExtract.extract({
    operatorList: synth.operatorList,
    textContent: synth.textContent,
    pageHeightPt: synth.pageHeightPt
  });
  assert.equal(unconfirmed.ok, true);
  assert.equal(unconfirmed.scaleConfirmed, false);
  assert.equal(unconfirmed.needsScaleConfirmation, true);
  assert.equal(unconfirmed.scaleProposal.denominator, 100);
  assert.ok(unconfirmed.toVerify.some(item => item.kind === 'scale'));

  // 2. Confirmation explicite sur la cote témoin de 10,00 m
  const confirmedScale = PdfVectorExtract.confirmScale({
    detectedDenominator: unconfirmed.scaleProposal.denominator,
    witnessPdfPoints: 10 * synth.ppm,
    witnessRealMeters: 10
  });
  assert.equal(confirmedScale.confirmed, true);
  assert.equal(confirmedScale.consistent, true);
  assert.ok(confirmedScale.relativeError < 0.001);

  const res = PdfVectorExtract.extract({
    operatorList: synth.operatorList,
    textContent: synth.textContent,
    pageHeightPt: synth.pageHeightPt,
    confirmedScale
  });

  assert.equal(res.ok, true);
  assert.equal(res.scaleConfirmed, true);
  assert.equal(res.walls.length, 6, 'Doit extraire exactement 6 murs (4 extérieurs + 2 cloisons)');

  const ox = synth.originOffsetM;
  const oz = synth.originOffsetM;
  const findWall = (x1, z1, x2, z2) => res.walls.find(w => {
    const a = Math.hypot(w.from[0] - (x1 + ox), w.from[1] - (z1 + oz)) + Math.hypot(w.to[0] - (x2 + ox), w.to[1] - (z2 + oz));
    const b = Math.hypot(w.from[0] - (x2 + ox), w.from[1] - (z2 + oz)) + Math.hypot(w.to[0] - (x1 + ox), w.to[1] - (z1 + oz));
    return Math.min(a, b) <= 0.04; // ≤ 2 cm par extrémité
  });

  const north = findWall(0, 0, 10, 0);
  const east = findWall(10, 0, 10, 6);
  const south = findWall(0, 6, 10, 6);
  const west = findWall(0, 0, 0, 6);
  const partV = findWall(6, 0, 6, 6);
  const partH = findWall(6, 3.5, 10, 3.5);
  assert.ok(north && east && south && west && partV && partH, 'Tous les murs doivent correspondre aux coordonnées exactes (±2 cm)');
  assert.ok(Math.abs(north.thick - 0.20) <= 0.01);
  assert.equal(north.type, 'ext');
  assert.ok(Math.abs(partV.thick - 0.12) <= 0.01);
  assert.equal(partV.type, 'int');

  // Portes (2 arcs détectés)
  assert.equal(res.doors.length, 2, 'Doit détecter les 2 portes');
  const doorWidths = res.doors.map(d => d.w).sort((a, b) => a - b);
  assert.ok(Math.abs(doorWidths[0] - 0.80) <= 0.03);
  assert.ok(Math.abs(doorWidths[1] - 0.90) <= 0.03);

  // Fenêtres (2 faisceaux détectés)
  assert.equal(res.windows.length, 2, 'Doit détecter les 2 fenêtres');
  const winWidths = res.windows.map(w => w.w).sort((a, b) => a - b);
  assert.ok(Math.abs(winWidths[0] - 1.20) <= 0.03);
  assert.ok(Math.abs(winWidths[1] - 1.60) <= 0.03);

  // Pièces (3 pièces nommées)
  assert.equal(res.rooms.length, 3, 'Doit extraire les 3 pièces');
  const names = res.rooms.map(r => r.name).sort();
  assert.deepEqual(names, ['Chambre 1', 'Cuisine', 'Séjour']);
  const sejour = res.rooms.find(r => r.name === 'Séjour');
  assert.ok(sejour.bounds, 'Séjour doit avoir des limites déduites des murs');
  assert.ok(Math.abs((sejour.bounds.xMax - sejour.bounds.xMin) - 6.0) <= 0.03);
  assert.ok(Math.abs((sejour.bounds.zMax - sejour.bounds.zMin) - 6.0) <= 0.03);
  assert.equal(sejour.declaredArea, 36);

  // Trait orphelin jamais supprimé silencieusement -> présent dans toVerify
  assert.ok(res.toVerify.some(item => item.kind === 'segment'), 'Le trait orphelin de 1,5 m doit apparaître dans « À vérifier »');
});

test('Lot 5 — Sans échelle ni confirmation, refus d’inventer une échelle ; l’IA ne déplace jamais un mur vectoriel', () => {
  const noScale = PdfVectorExtract.extract({
    operatorList: { fnArray: [OPS.moveTo, OPS.lineTo, OPS.stroke], argsArray: [[0, 0], [100, 0], []] },
    textContent: { items: [{ str: 'Séjour', transform: [10, 0, 0, 10, 50, 50] }] }
  });
  assert.equal(noScale.ok, false);
  assert.equal(noScale.needsScaleConfirmation, true);
  assert.equal(noScale.walls.length, 0);

  // Vérifier que mergeAiAnnotations renomme les pièces sans toucher aux murs vectoriels
  const synth = buildSynthetic3RoomHousePdf();
  const confirmedScale = PdfVectorExtract.confirmScale({
    detectedDenominator: 100,
    witnessPdfPoints: 10 * synth.ppm,
    witnessRealMeters: 10
  });
  const base = PdfVectorExtract.extract({
    operatorList: synth.operatorList,
    textContent: synth.textContent,
    pageHeightPt: synth.pageHeightPt,
    confirmedScale
  });
  const beforeWalls = JSON.stringify(base.walls);
  const merged = PdfVectorExtract.mergeAiAnnotations(base, {
    walls: [{ from: [99, 99], to: [100, 100], thick: 0.5 }], // tentative illégale de déplacer les murs
    rooms: [{ id: 'sejour', name: 'Grand Séjour / Salle à manger' }]
  });
  assert.equal(JSON.stringify(merged.walls), beforeWalls, 'Les murs vectoriels doivent rester strictement immuables');
  assert.equal(merged.rooms.find(r => r.id === 'sejour').name, 'Grand Séjour / Salle à manger');
});
