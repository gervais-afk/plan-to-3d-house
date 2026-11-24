/**
 * ARCHITECTURAL DATA MODEL — relevé fidèle du plan « Eng Dollar » (Engineer Dollar Bakoh.jpg)
 * Coordonnées en mètres (échelle 1:1), origine au centre de l'emprise.
 * Three.js : X = Est (+) / Ouest (−), Y = hauteur, Z = Sud (+) / Nord (−). L'entrée est au Sud.
 * Calibrage : 48 px/m sur l'image 600 px → emprise 11,50 m × 11,50 m (porche compris).
 *
 * Ouvertures : openings: [{ type: 'door'|'window'|'bay'|'open', at, w, h, sill, hinge, side }]
 *   at    = distance (m) du centre de l'ouverture depuis le point `from` du mur
 *   hinge = 'start'|'end' (côté des gonds), side = 1|-1 (sens d'ouverture, normale gauche du mur)
 * L'ancien format { opening: { pos (fraction) } } reste accepté (normalisé en bas de fichier).
 */

const D = { type: 'door', w: 0.85, h: 2.1 };
const WIN = { type: 'window', w: 1.2, h: 1.25, sill: 0.95 };
const IMPOSTE = { type: 'window', w: 0.5, h: 0.5, sill: 1.6 };

const HOUSE_DATA = {
  config: {
    ...HOUSE_DEFAULT_CONFIG,
    walkStart: { x: -1.9, z: 8.0, yaw: 0 }, // départ visite libre : face au porche
    walkBounds: { xMin: -9, xMax: 9, zMin: -9, zMax: 12 },
    planImage: { url: 'Engineer Dollar Bakoh.jpg', pxPerMeter: 48, originPx: [298.5, 300] }
  },

  rooms: [
    { id: 'porch',    name: 'PORCHE À COLONNES', bounds: { xMin: -2.95, xMax: 1.85, zMin: 4.15, zMax: 5.75 }, floorType: 'stone',    habitable: false, desc: 'Entrée couverte rythmée par deux colonnes' },
    { id: 'living',   name: 'SÉJOUR',            bounds: { xMin: -2.6,  xMax: 1.85, zMin: -0.5, zMax: 4.15 }, floorType: 'parquet',  habitable: true,  desc: 'Salon en U, trois canapés, ouvert sur la salle à manger' },
    { id: 'dining',   name: 'SALLE À MANGER',    bounds: { xMin: -5.75, xMax: -2.6, zMin: -0.5, zMax: 3.55 }, floorType: 'parquet',  habitable: true,  desc: 'Table de 8 couverts baignée par deux fenêtres' },
    { id: 'kitchen',  name: 'CUISINE',           bounds: { xMin: -5.75, xMax: -2.6, zMin: -3.7, zMax: -0.5 }, floorType: 'tiles',    habitable: true,  desc: 'Linéaire sous fenêtre, accès terrasse et magasin' },
    { id: 'store',    name: 'MAGASIN',           bounds: { xMin: -3.9,  xMax: -2.6, zMin: -5.75, zMax: -3.7 }, floorType: 'concrete', habitable: true,  desc: 'Cellier / réserve attenante à la cuisine' },
    { id: 'terrace',  name: 'TERRASSE',          bounds: { xMin: -5.75, xMax: -3.9, zMin: -5.75, zMax: -3.7 }, floorType: 'stone',    habitable: false, desc: 'Terrasse de service couverte, poteau d\'angle' },
    { id: 'bed1',     name: 'CHAMBRE 1',         bounds: { xMin: -2.6,  xMax: 1.1,  zMin: -5.75, zMax: -1.8 }, floorType: 'parquet',  habitable: true,  desc: 'Chambre exposée au nord, fenêtre en façade' },
    { id: 'bed2',     name: 'CHAMBRE 2',         bounds: { xMin: 1.1,   xMax: 5.2,  zMin: -5.75, zMax: -1.8 }, floorType: 'parquet',  habitable: true,  desc: 'Chambre d\'angle, double exposition nord / est' },
    { id: 'hall',     name: 'HALL',              bounds: { xMin: -2.6,  xMax: 3.45, zMin: -1.8, zMax: -0.5 }, floorType: 'parquet',  habitable: true,  desc: 'Circulation distribuant cuisine, chambres et WC' },
    { id: 'vestibule',name: 'DÉGAGEMENT',        bounds: { xMin: 1.85,  xMax: 3.45, zMin: -0.5, zMax: 0.95 }, floorType: 'parquet',  habitable: true,  desc: 'Sas d\'accès à la chambre parentale' },
    { id: 'wc1',      name: 'WC 1',              bounds: { xMin: 3.45,  xMax: 5.75, zMin: -1.8, zMax: -0.35 }, floorType: 'tiles',   habitable: true,  desc: 'Cabinet de toilette, imposte en façade est' },
    { id: 'wc2',      name: 'WC 2',              bounds: { xMin: 3.45,  xMax: 5.75, zMin: -0.35, zMax: 0.95 }, floorType: 'tiles',   habitable: true,  desc: 'Cabinet de toilette, imposte en façade est' },
    { id: 'master',   name: 'CHAMBRE PARENTALE', bounds: { xMin: 1.85,  xMax: 5.75, zMin: 0.95, zMax: 4.9 }, floorType: 'parquet',  habitable: true,  desc: 'Suite au calme, lit king size, double exposition' }
  ],

  walls: [
    // ---------- MURS EXTÉRIEURS (0,25 m) ----------
    // Façade Nord : Chambre 1 + Chambre 2
    { from: [-3.9, -5.75], to: [5.2, -5.75], thick: 0.25, type: 'ext', openings: [{ ...WIN, at: 2.6 }, { ...WIN, at: 6.95 }] },
    // Pignon Est Chambre 2 (en retrait)
    { from: [5.2, -5.75], to: [5.2, -1.8], thick: 0.25, type: 'ext', openings: [{ ...WIN, at: 2.0 }] },
    { from: [5.2, -1.8], to: [5.75, -1.8], thick: 0.25, type: 'ext' },
    // Façade Est : WC1, WC2, Chambre parentale
    { from: [5.75, -1.8], to: [5.75, 4.9], thick: 0.25, type: 'ext', openings: [{ ...IMPOSTE, at: 0.7 }, { ...IMPOSTE, at: 2.1 }, { ...WIN, at: 4.5 }] },
    // Façade Sud : Chambre parentale
    { from: [5.75, 4.9], to: [1.85, 4.9], thick: 0.25, type: 'ext', openings: [{ ...WIN, at: 2.4 }] },
    { from: [1.85, 4.9], to: [1.85, 4.15], thick: 0.25, type: 'ext' },
    // Façade Sud : Séjour (porte d'entrée + fenêtre) sous le porche
    { from: [-2.6, 4.15], to: [1.85, 4.15], thick: 0.25, type: 'ext', openings: [{ ...D, w: 1.0, at: 0.7, hinge: 'start', side: -1 }, { ...WIN, w: 1.1, at: 2.2 }] },
    { from: [-2.6, 4.15], to: [-2.6, 3.55], thick: 0.25, type: 'ext' },
    // Façade Sud : Salle à manger
    { from: [-2.6, 3.55], to: [-5.75, 3.55], thick: 0.25, type: 'ext', openings: [{ ...WIN, w: 1.0, at: 1.6 }] },
    // Pignon Ouest : Salle à manger + Cuisine (fenêtre au-dessus de l'évier)
    { from: [-5.75, 3.55], to: [-5.75, -3.7], thick: 0.25, type: 'ext', openings: [{ ...WIN, w: 1.0, at: 3.1 }, { ...WIN, w: 0.9, at: 5.95, sill: 1.1, h: 1.0 }] },
    // Cuisine / Terrasse (porte de service)
    { from: [-5.75, -3.7], to: [-3.9, -3.7], thick: 0.25, type: 'ext', openings: [{ ...D, w: 0.8, at: 1.5, hinge: 'end', side: -1 }] },
    // Magasin / Terrasse (fenêtre)
    { from: [-3.9, -3.7], to: [-3.9, -5.75], thick: 0.25, type: 'ext', openings: [{ ...WIN, w: 1.0, at: 1.1 }] },

    // ---------- CLOISONS (0,15 m) ----------
    { from: [-3.9, -3.7], to: [-2.6, -3.7], thick: 0.15, type: 'int', openings: [{ ...D, w: 0.7, at: 0.65, hinge: 'end', side: -1 }] },     // Cuisine / Magasin
    { from: [-2.6, -5.75], to: [-2.6, -0.5], thick: 0.15, type: 'int', openings: [{ ...D, at: 4.6, hinge: 'end', side: 1 }] },              // Magasin+Cuisine / Ch1+Hall
    { from: [1.1, -5.75], to: [1.1, -1.8], thick: 0.15, type: 'int' },                                                                     // Ch1 / Ch2
    { from: [-2.6, -1.8], to: [5.2, -1.8], thick: 0.15, type: 'int', openings: [{ ...D, at: 3.15, hinge: 'end', side: -1 }, { ...D, at: 4.3, hinge: 'start', side: -1 }] }, // Chambres / Hall
    { from: [3.45, -1.8], to: [3.45, 0.95], thick: 0.15, type: 'int', openings: [{ ...D, w: 0.7, at: 0.7, hinge: 'start', side: -1 }, { ...D, w: 0.7, at: 2.1, hinge: 'start', side: -1 }] }, // Hall / WC
    { from: [3.45, -0.35], to: [5.75, -0.35], thick: 0.15, type: 'int' },                                                                 // WC1 / WC2
    { from: [1.85, 0.95], to: [5.75, 0.95], thick: 0.15, type: 'int', openings: [{ ...D, at: 0.55, hinge: 'start', side: 1 }] },           // Dégagement / Ch. parentale
    { from: [1.85, -0.5], to: [1.85, 4.15], thick: 0.15, type: 'int' },                                                                    // Séjour / Ch. parentale
    { from: [-1.1, -0.5], to: [1.85, -0.5], thick: 0.15, type: 'int' },                                                                    // Hall / Séjour (passage libre à l'ouest)
    { from: [-5.75, -0.5], to: [-2.6, -0.5], thick: 0.15, type: 'int' }                                                                    // Cuisine / Salle à manger
  ],

  // Colonnes & poteaux (porteurs, avec collision)
  columns: [
    { name: 'Colonne porche Ouest', x: -2.65, z: 5.25, size: 0.35, base: 0.5, capital: 0.5 },
    { name: 'Colonne porche Est',   x: 1.4,   z: 5.25, size: 0.35, base: 0.5, capital: 0.5 },
    { name: 'Poteau terrasse',      x: -5.6,  z: -5.6, size: 0.25, base: 0.32, capital: 0.32 }
  ],

  // Toitures légères (apparaissent en fin d'élévation)
  canopies: [
    { name: 'Auvent du porche', type: 'slab', xMin: -3.05, xMax: 1.95, zMin: 4.05, zMax: 5.6, y: 2.8, thick: 0.18, color: '#f1eee8' },
    { name: 'Pergola terrasse', type: 'pergola', xMin: -5.8, xMax: -3.85, zMin: -5.8, zMax: -3.65, y: 2.7, slat: 0.08, gap: 0.3, color: '#5a4a3a' }
  ],

  // Éclairage artificiel par pièce (allumé en mode Soir, touche N)
  lights: [
    { room: 'living',  type: 'ceiling', x: -0.4, z: 1.8,   i: 1.0, dist: 7 },
    { room: 'living',  type: 'floor',   x: 1.35, z: 3.75,  i: 0.7, dist: 4 },
    { room: 'dining',  type: 'pendant', x: -4.2, z: 1.45, y: 1.7, i: 1.2, dist: 5 },
    { room: 'kitchen', type: 'ceiling', x: -4.2, z: -2.1,  i: 0.9, dist: 5 },
    { room: 'hall',    type: 'ceiling', x: 0.4,  z: -1.15, i: 0.6, dist: 5 },
    { room: 'bed1',    type: 'ceiling', x: -0.75, z: -3.4, i: 0.8, dist: 5 },
    { room: 'bed2',    type: 'ceiling', x: 3.15, z: -3.4,  i: 0.8, dist: 5 },
    { room: 'master',  type: 'ceiling', x: 3.8,  z: 2.9,   i: 0.8, dist: 5.5 },
    { room: 'porch',   type: 'wall',    x: -0.9, z: 4.3, y: 2.25, i: 0.9, dist: 5 }
  ],

  // Silhouettes humaines statiques (échelle humaine) — face locale +Z, rotY comme le mobilier
  people: [
    { name: 'Lecteur au salon',   pose: 'sit',   x: 0.0,   z: 3.45, rotY: Math.PI, seatY: 0.44, model: 'personSit' },
    { name: 'Convive à table',    pose: 'sit',   x: -3.4,  z: 0.85, rotY: -Math.PI / 2, seatY: 0.48, model: 'personSit' },
    { name: 'Cuisinière',         pose: 'stand', x: -4.72, z: -1.3, rotY: -Math.PI / 2, model: 'personStand' },
    { name: 'Visiteur au porche', pose: 'stand', x: 0.75,  z: 4.85, rotY: 0.5, model: 'personStand' }
  ],

  // Abords : allée d'entrée, haies, arbres
  exterior: {
    path: { xMin: -2.6, xMax: -1.2, zMin: 5.75, zMax: 12.5 },
    hedges: [
      { xMin: -9.5, xMax: -3.2, z: 11.0 }, { xMin: -0.6, xMax: 9.5, z: 11.0 },
      { x: -9.5, zMin: -9.5, zMax: 11.0 }, { x: 9.5, zMin: -9.5, zMax: 11.0 }
    ],
    trees: [[-8, -3, 1.2], [7.8, -6.5, 1.4], [7.5, 6.5, 1.1], [-7.6, 7.2, 1.3], [4.2, 9.2, 0.9], [-7.8, -7.8, 1.0]]
  },

  assets: HOUSE_DEFAULT_ASSETS,

  // Mobilier relevé sur le plan (volumes ; remplacés par des modèles glTF si disponibles, champ `model`)
  furniture: [
    // Séjour — U de canapés
    { name: 'Canapé Nord',  room: 'living', x: 0.45, y: 0.4,  z: 0.42, w: 1.8, h: 0.8, d: 0.9, color: '#6b6560', model: 'sofa', rotY: 0 },
    { name: 'Canapé Sud',   room: 'living', x: 0.4,  y: 0.4,  z: 3.35, w: 1.8, h: 0.8, d: 0.9, color: '#6b6560', model: 'sofa', rotY: Math.PI },
    { name: 'Canapé Ouest', room: 'living', x: -1.3, y: 0.4,  z: 1.9,  w: 0.9, h: 0.8, d: 1.8, color: '#6b6560', model: 'sofa', rotY: Math.PI / 2 },
    { name: 'Table basse',  room: 'living', x: 0.35, y: 0.2,  z: 1.9,  w: 1.2, h: 0.4, d: 0.6, color: '#967856', model: 'coffeeTable' },
    { name: 'Tapis',        room: 'living', x: 0.25, y: 0.01, z: 1.9,  w: 2.8, h: 0.02, d: 2.2, color: '#e8e0d2' },
    { name: 'Meuble TV',    room: 'living', x: 1.55, y: 0.25, z: 1.9,  w: 0.45, h: 0.5, d: 1.8, color: '#2b2c2e' },
    { name: 'Guéridon',     room: 'living', x: -1.3, y: 0.28, z: 0.55, w: 0.45, h: 0.55, d: 0.45, color: '#8a6a4a', model: 'sideTable' },
    { name: 'Écran TV',     room: 'living', x: 1.74, y: 1.25, z: 1.9,  w: 0.05, h: 0.72, d: 1.25, color: '#0c0d0f' },

    // Salle à manger — table 8 couverts
    { name: 'Table à manger', room: 'dining', x: -4.2, y: 0.38, z: 1.45, w: 1.0, h: 0.76, d: 2.0, color: '#8a6a4a', model: 'diningTable' },
    { name: 'Chaise', room: 'dining', x: -4.95, y: 0.45, z: 0.85, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -4.95, y: 0.45, z: 1.45, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -4.95, y: 0.45, z: 2.05, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -3.45, y: 0.45, z: 0.85, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: -Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -3.45, y: 0.45, z: 1.45, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: -Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -3.45, y: 0.45, z: 2.05, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: -Math.PI / 2 },
    { name: 'Chaise', room: 'dining', x: -4.2,  y: 0.45, z: 0.15, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: 0 },
    { name: 'Chaise', room: 'dining', x: -4.2,  y: 0.45, z: 2.75, w: 0.45, h: 0.9, d: 0.45, color: '#2e2f31', model: 'chair', rotY: Math.PI },
    { name: 'Buffet', room: 'dining', x: -4.2,  y: 0.4,  z: 3.2,  w: 1.6, h: 0.8, d: 0.45, color: '#5b4632' },

    // Cuisine
    { name: 'Plan de travail', room: 'kitchen', x: -5.32, y: 0.45, z: -2.1,  w: 0.6, h: 0.9, d: 3.0, color: '#3b3f44' },
    { name: 'Évier inox',      room: 'kitchen', x: -5.32, y: 0.91, z: -2.4,  w: 0.45, h: 0.03, d: 0.7, color: '#a9adb1' },
    { name: 'Meuble haut',     room: 'kitchen', x: -5.45, y: 1.9,  z: -1.15, w: 0.35, h: 0.7, d: 1.0, color: '#c9b59a' },
    { name: 'Meuble haut',     room: 'kitchen', x: -5.45, y: 1.9,  z: -3.3,  w: 0.35, h: 0.7, d: 0.7, color: '#c9b59a' },
    { name: 'Réfrigérateur',   room: 'kitchen', x: -2.97, y: 0.93, z: -2.4,  w: 0.65, h: 1.85, d: 0.65, color: '#d7d9db', model: 'fridge' },

    // Magasin
    { name: 'Étagères', room: 'store', x: -3.25, y: 0.9, z: -5.4, w: 1.1, h: 1.8, d: 0.4, color: '#8d8f91' },

    // Terrasse
    { name: 'Salon de terrasse', room: 'terrace', x: -4.85, y: 0.4, z: -4.75, w: 1.5, h: 0.8, d: 1.5, color: '#7a7670', model: 'terraceSet' },

    // Chambre 1
    { name: 'Lit double',     room: 'bed1', x: -0.75, y: 0.25, z: -4.6,  w: 1.6, h: 0.5, d: 2.0, color: '#d9d4cc', model: 'bed' },
    { name: 'Tête de lit',    room: 'bed1', x: -0.75, y: 0.55, z: -5.58, w: 1.75, h: 1.1, d: 0.08, color: '#5b4632' },
    { name: 'Chevet',         room: 'bed1', x: -1.85, y: 0.25, z: -5.35, w: 0.45, h: 0.5, d: 0.4, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Chevet',         room: 'bed1', x: 0.35,  y: 0.25, z: -5.35, w: 0.45, h: 0.5, d: 0.4, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Armoire',        room: 'bed1', x: -2.2,  y: 1.1,  z: -2.9,  w: 0.6, h: 2.2, d: 1.8, color: '#efebe4' },

    // Chambre 2
    { name: 'Lit double',     room: 'bed2', x: 3.15, y: 0.25, z: -4.6,  w: 1.6, h: 0.5, d: 2.0, color: '#d9d4cc', model: 'bed' },
    { name: 'Tête de lit',    room: 'bed2', x: 3.15, y: 0.55, z: -5.58, w: 1.75, h: 1.1, d: 0.08, color: '#5b4632' },
    { name: 'Chevet',         room: 'bed2', x: 2.05, y: 0.25, z: -5.35, w: 0.45, h: 0.5, d: 0.4, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Chevet',         room: 'bed2', x: 4.25, y: 0.25, z: -5.35, w: 0.45, h: 0.5, d: 0.4, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Armoire',        room: 'bed2', x: 4.8,  y: 1.1,  z: -2.5,  w: 0.6, h: 2.2, d: 1.2, color: '#efebe4' },

    // Chambre parentale (tête de lit contre le mur Ouest)
    { name: 'Lit King Size',  room: 'master', x: 3.0,  y: 0.26, z: 2.9,  w: 2.0, h: 0.52, d: 1.8, color: '#d9d4cc', model: 'bed', rotY: Math.PI / 2 },
    { name: 'Tête de lit',    room: 'master', x: 1.97, y: 0.6,  z: 2.9,  w: 0.08, h: 1.2, d: 1.95, color: '#5b4632' },
    { name: 'Chevet',         room: 'master', x: 2.15, y: 0.25, z: 1.75, w: 0.4, h: 0.5, d: 0.45, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Chevet',         room: 'master', x: 2.15, y: 0.25, z: 4.05, w: 0.4, h: 0.5, d: 0.45, color: '#8a6a4a', model: 'nightstand' },
    { name: 'Dressing',       room: 'master', x: 4.55, y: 1.1,  z: 1.35, w: 1.8, h: 2.2, d: 0.6, color: '#efebe4' },

    // WC
    { name: 'Cuvette WC',     room: 'wc1', x: 5.3,  y: 0.21, z: -1.05, w: 0.62, h: 0.42, d: 0.4, color: '#f7f7f5', model: 'toilet', rotY: -Math.PI / 2 },
    { name: 'Réservoir',      room: 'wc1', x: 5.55, y: 0.6,  z: -1.05, w: 0.18, h: 0.4, d: 0.45, color: '#f7f7f5' },
    { name: 'Lave-mains',     room: 'wc1', x: 4.4,  y: 0.85, z: -1.6,  w: 0.5, h: 0.15, d: 0.35, color: '#f7f7f5' },
    { name: 'Cuvette WC',     room: 'wc2', x: 5.3,  y: 0.21, z: 0.3,   w: 0.62, h: 0.42, d: 0.4, color: '#f7f7f5', model: 'toilet', rotY: -Math.PI / 2 },
    { name: 'Réservoir',      room: 'wc2', x: 5.55, y: 0.6,  z: 0.3,   w: 0.18, h: 0.4, d: 0.45, color: '#f7f7f5' },
    { name: 'Lave-mains',     room: 'wc2', x: 4.4,  y: 0.85, z: 0.75,  w: 0.5, h: 0.15, d: 0.35, color: '#f7f7f5' }
  ],

  // Décoration (aucun volume de repli : visible seulement si le modèle glTF se charge)
  decor: [
    { name: 'Plante (séjour)',       x: 1.6,   y: 0.6,  z: 0.08, w: 0.5, h: 1.2, d: 0.5, model: 'plantTall' },
    { name: 'Plante (porche)',       x: 1.5,   y: 0.6,  z: 4.5,  w: 0.5, h: 1.2, d: 0.5, model: 'plantTall' },
    { name: 'Plante (salle à manger)', x: -5.35, y: 0.4, z: -0.12, w: 0.5, h: 0.8, d: 0.5, model: 'plantBush' },
    { name: 'Plante (parentale)',    x: 5.35,  y: 0.4,  z: 4.5,  w: 0.5, h: 0.8, d: 0.5, model: 'plantBush' },
    { name: 'Tableau (séjour)',      x: 0.45,  y: 1.65, z: -0.41, w: 0.65, h: 0.9, d: 0.05, model: 'frame' },
    { name: 'Tableau (parentale)',   x: 1.94,  y: 1.65, z: 2.9,  w: 0.05, h: 0.6, d: 0.9, model: 'frame', rotY: Math.PI / 2 },
    { name: 'Tableau (chambre 1)',   x: -0.75, y: 1.7,  z: -5.6, w: 0.8, h: 0.55, d: 0.05, model: 'frame' },
    { name: 'Tableau (chambre 2)',   x: 3.15,  y: 1.7,  z: -5.6, w: 0.8, h: 0.55, d: 0.05, model: 'frame' },
    { name: 'Vase (buffet)',         x: -4.6,  y: 0.95, z: 3.2,  w: 0.2, h: 0.3, d: 0.2, model: 'vase' }
  ],

  // Cotes du plan 2D (affichées avec leur texte)
  dimensions: [
    { from: [-5.75, 0, -6.35], to: [5.75, 0, -6.35], text: '11.50 m' },
    { from: [6.35, 0, -5.75], to: [6.35, 0, 5.75], text: '11.50 m (porche compris)' },
    { from: [-2.6, 0, 6.3], to: [1.85, 0, 6.3], text: 'SÉJOUR 4.45 m' },
    { from: [-2.6, 0, -6.0], to: [1.1, 0, -6.0], text: 'CH.1 3.70 m' },
    { from: [1.1, 0, -6.0], to: [5.2, 0, -6.0], text: 'CH.2 4.10 m' },
    { from: [-6.35, 0, -0.5], to: [-6.35, 0, 3.55], text: 'S.À.M. 4.05 m' },
    { from: [6.0, 0, 0.95], to: [6.0, 0, 4.9], text: 'PARENTALE 3.95 m' }
  ],

  // Rendus « grandeur nature » (photo d'architecture : caméra à 1,40 m, verticales droites)
  renderShots: [
    { id: 'vue-aerienne',      label: 'Vue aérienne',               pos: [-10, 9.5, 11],  look: [0, 0.6, 0],     fov: 40 },
    { id: 'facade-sud',        label: 'Façade sud & porche',        pos: [3.8, 1.5, 12.5], look: [-0.6, 1.6, 4.5], fov: 48 },
    { id: 'porche',            label: 'Porche à colonnes',          pos: [-0.3, 1.45, 7.4], look: [-1.9, 1.45, 3.8], fov: 62 },
    { id: 'sejour',            label: 'Séjour',                     pos: [-2.25, 1.4, 3.75], look: [1.2, 1.15, 0.6], fov: 70, room: 'living' },
    { id: 'salle-a-manger',    label: 'Salle à manger',             pos: [-0.4, 1.4, 2.5],  look: [-4.6, 1.05, 1.0], fov: 66, room: 'dining' },
    { id: 'cuisine',           label: 'Cuisine',                    pos: [-3.15, 1.4, -3.3], look: [-5.4, 1.05, -2.6], fov: 66, room: 'kitchen' },
    { id: 'chambre-parentale', label: 'Chambre parentale',          pos: [4.95, 1.4, 1.9],  look: [2.3, 0.9, 3.4],   fov: 70, room: 'master' },
    { id: 'chambre-1',         label: 'Chambre 1',                  pos: [0.55, 1.4, -2.3], look: [-1.0, 0.8, -4.9], fov: 70, room: 'bed1' },
    { id: 'soir-aerien',       label: 'Vue aérienne — soir',        pos: [-10, 9.5, 11],  look: [0, 0.6, 0],     fov: 40, night: true },
    { id: 'soir-sejour',       label: 'Séjour — soir',              pos: [-2.25, 1.4, 3.75], look: [1.2, 1.15, 0.6], fov: 70, night: true, room: 'living' }
  ],

  // Trajectoire cinématique (CatmullRom centripète) — `room` sert au saut depuis la minimap, `id` correspond aux vues générées
  tourWaypoints: [
    { id: 'plan-2d-photoshop', pos: [0, 34, 0.01],      look: [0, 0, 0],          fov: 26, label: 'PLAN D\'ARCHITECTE 2D' },
    { pos: [6, 18, 14],        look: [0, 1.0, 0],        fov: 38, label: 'ÉLÉVATION DES MURS' },
    { id: 'facade-sud',        pos: [-0.5, 1.65, 10.5], look: [-0.5, 1.9, 4.5],   fov: 50, label: 'PORCHE À COLONNES' },
    { id: 'porche',            pos: [-1.9, 1.65, 5.2],  look: [-1.9, 1.6, 1.5],   fov: 55, label: 'PORTE D\'ENTRÉE', room: 'porch' },
    { id: 'sejour',            pos: [-2.0, 1.65, 3.3],  look: [1.0, 1.3, 0.8],    fov: 62, label: 'SÉJOUR', room: 'living' },
    { id: 'salle-a-manger',    pos: [-2.85, 1.65, 1.0], look: [-4.6, 1.0, 2.2],   fov: 62, label: 'SALLE À MANGER', room: 'dining' },
    { id: 'cuisine',           pos: [-1.85, 1.65, -1.15], look: [-4.0, 1.3, -1.6], fov: 60, label: 'CUISINE', room: 'kitchen' },
    { id: 'chambre-1',         pos: [0.55, 1.65, -1.15], look: [0.3, 1.4, -4.6],  fov: 60, label: 'CHAMBRES', room: 'bed1' },
    { pos: [2.65, 1.65, -1.05], look: [2.5, 1.4, 2.5],   fov: 60, label: 'HALL', room: 'hall' },
    { id: 'chambre-parentale', pos: [2.4, 1.65, 1.35],  look: [3.6, 1.2, 3.2],    fov: 62, label: 'CHAMBRE PARENTALE', room: 'master' },
    { pos: [4.75, 1.6, 2.05],  look: [2.4, 0.55, 3.3],   fov: 62, label: 'SUITE PARENTALE' },
    { pos: [3.6, 5.0, 2.8],    look: [2.6, 0.0, 1.2],    fov: 55, label: 'ENVOL' },
    { id: 'vue-aerienne',      pos: [-9, 9, 10],        look: [0, 0.8, 0],        fov: 42, label: 'VUE D\'ENSEMBLE' }
  ]
};

normalizeHouseData(HOUSE_DATA);
window.HOUSE_DATA = HOUSE_DATA;
