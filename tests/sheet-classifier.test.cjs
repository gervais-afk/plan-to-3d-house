const assert = require('node:assert/strict');
const { test } = require('node:test');
const C = require('../js/sheetClassifier.js');

// Textes au format de PDF vectoriels réels (AutoCAD) : cotes, repères de coupe, étiquettes, cartouche.
// Les noms du cartouche ont été remplacés.
const CARTOUCHE = "PROJET DE CONSTRUCTION D'UNE MAISON D'HABITATION Maitre d'oeuvre: M. DUPONT Dessin et conception: M. MARTIN Ec 1/50 Date: Septembre 2024";
const pages = {
  coffrage: ['B B avant 1,75 15 5,65 15 5,50 15 3,00 a c b d e f g h i j k 1 2 5 6 4 3 TITRE DU PLAN: COFFRAGE ' + CARTOUCHE + ' ( ) ( ) ( ) L', 'COFFRAGE_063228.pdf'],
  fondation: ['B B avant .80 50 50 a S S c b d TITRE DU PLAN: FONDATION Ec 1/50 ' + CARTOUCHE + ' S S S S', 'FONDATION_063304.pdf'],
  masse: ['B B avant 171,56 m 2 Emprise au sol du batiment TITRE :PLAN DE PLAN Ec 1/100 ROUTE', 'DE MASSE_063243.pdf'],
  rdc: ['56,50 m 2 16,45 m 2 4,38 m 2 14,83 m 2 14,60 m 2 R 15 x 19 = 2,80 B B avant ± toil TITRE DU PLAN: RDC Veranda Séjour chambre invités Cuisine Veranda Degagement ' + CARTOUCHE, 'RDC_063306.pdf'],
  etage: ['28,25 m 2 25,83 m 2 6,60 m 2 6,00 m 2 B B avant chambre enfants terrasse chambre Parents séjour etage Dressing toil TITRE DU PLAN: ETAGE ' + CARTOUCHE + ' Degagement toiture sur veranda cuisine', 'etage_063245.pdf'],
  coupe: ['2,85 -0,60 +3,00 0,00 +6,00 +8,60 2,60 TITRE DU PLAN: Coupe B-B ' + CARTOUCHE, 'coupe bb_063240.pdf'],
  toiture: ['B B avant 70 3,04 70 TITRE DU PLAN: TOITURE ' + CARTOUCHE + ' toles bacs 5/10e fermes', 'TOITURE_063308.pdf'],
  facade: ['TITRE DU PLAN: Façade Arriere', 'facade arriere_063247.pdf']
};
const run = key => C.classify({ text: pages[key][0], fileName: pages[key][1] });

test('Coffrage et distribution, visuellement proches, sont distingués par leur contenu', () => {
  const coffrage = run('coffrage'), rdc = run('rdc');
  assert.equal(coffrage.type, 'coffrage');
  assert.equal(coffrage.discipline, 'structure');
  assert.equal(rdc.type, 'distribution');
  assert.equal(rdc.discipline, 'architecture');
  assert.equal(rdc.level, 0);
  assert.equal(rdc.label, 'Plan de distribution — Rez-de-chaussée');
  assert.equal(rdc.title, 'RDC', 'titre coupé avant les étiquettes de pièces');
});

test('Les huit planches du dossier type sont identifiées par le cartouche', () => {
  const expected = { coffrage: 'coffrage', fondation: 'fondation', masse: 'masse', rdc: 'distribution', etage: 'distribution', coupe: 'coupe', toiture: 'toiture', facade: 'facade' };
  for (const [key, type] of Object.entries(expected)) {
    const r = run(key);
    assert.equal(r.type, type, key);
    assert.equal(r.confidence, 'title', `${key} : ${r.reasons.join(' ; ')}`);
  }
  assert.equal(run('etage').level, 1);
  assert.equal(run('facade').label, 'Façade arrière');
  assert.equal(run('coupe').label, 'Coupe B-B');
  assert.equal(run('masse').scale, '1/100');
});

test('Un plan de distribution sans cartouche est reconnu à ses pièces et surfaces', () => {
  const r = C.classify({ text: 'Séjour 32,40 m² Cuisine 12,10 m² Chambre 1 14,00 m² Chambre 2 11,50 m² WC Douche Dégagement R+1', fileName: 'export.pdf' });
  assert.equal(r.type, 'distribution');
  assert.equal(r.level, 1);
  assert.equal(r.confidence, 'likely');
});

test('Un coffrage sans cartouche est reconnu à son vocabulaire de structure, malgré des pièces citées', () => {
  const r = C.classify({ text: 'Poutre P1 20x40 Poteau 20x20 Dalle 16+4 hourdis chaînage Séjour', fileName: 'plancher.pdf' });
  assert.equal(r.type, 'coffrage');
});

test('Page scannée : rien n’est inventé ; le nom du fichier sert d’indice faible', () => {
  assert.equal(C.classify({ text: '', fileName: 'scan_0001.pdf' }).confidence, 'none');
  const named = C.classify({ text: '', fileName: 'Plan de coffrage haut RDC.pdf' });
  assert.equal(named.type, 'coffrage');
  assert.equal(named.confidence, 'low', 'à confirmer par l’architecte');
});

test('Contenu du dossier : fourni, généré par la maquette, manquant', () => {
  const rows = C.completeness([{ type: 'distribution', level: 0 }, { type: 'coffrage', level: 0 }, { type: 'facade' }, { type: 'facade' }], [0, 1]);
  const status = Object.fromEntries(rows.map(r => [r.key, r.status]));
  assert.equal(status['distribution-0'], 'provided');
  assert.equal(status['distribution-1'], 'generated', 'l’étage manquant est tiré de la maquette');
  assert.equal(status.coffrage, 'provided');
  assert.equal(status.fondation, 'missing', 'la maquette ne fabrique pas de plan de structure');
  assert.equal(rows.find(r => r.key === 'facade').count, 2);
});
