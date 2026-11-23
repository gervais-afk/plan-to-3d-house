#!/usr/bin/env node
/**
 * Projets d'essai des escaliers : une petite maison R+1 par type d'escalier, pour voir chaque géométrie
 * en 3D (visite guidée, « Prendre l'escalier », visite libre) et dans l'éditeur.
 *
 *   node tools/generate-stair-test-projects.cjs          → crée / met à jour les projets
 *   node tools/generate-stair-test-projects.cjs --remove → les supprime
 *
 * Maison de 10 × 7 m : RDC séjour + hall d'escalier, étage chambre + palier, porte d'entrée au sud.
 * Aucune toiture n'est tracée : la toiture-terrasse automatique et son acrotère s'appliquent.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'projects');
const PREFIX = 'essai-escalier-';

const STAIRS = [
  { slug: 'droit', label: 'droit', stair: { stairType: 'straight', dir: '+x', xMin: 0.6, xMax: 4.2, zMin: -3.3, zMax: -2.2 } },
  { slug: 'quart-tournant', label: 'quart tournant avec palier', stair: { stairType: 'quarter', dir: '+x', xMin: 0.8, xMax: 3.6, zMin: -3.3, zMax: -0.5 } },
  { slug: 'balance', label: 'quart tournant balancé', stair: { stairType: 'winder', dir: '+x', xMin: 0.8, xMax: 3.6, zMin: -3.3, zMax: -0.5 } },
  { slug: 'helicoidal', label: 'hélicoïdal', stair: { stairType: 'helical', dir: '+x', xMin: 1.2, xMax: 3.6, zMin: -3.2, zMax: -0.8 } }
];

const door = (at, extra = {}) => ({ type: 'door', at, w: 0.9, h: 2.1, sill: 0, hinge: 'start', side: 1, ...extra });
const window = (at, w = 1.4) => ({ type: 'window', at, w, h: 1.25, sill: 0.95 });

function house({ slug, label, stair }) {
  const walls = [];
  for (const level of [0, 1]) {
    walls.push(
      // Façade nord, est, sud (entrée au RDC), ouest
      { from: [-5, -3.5], to: [5, -3.5], thick: 0.25, type: 'ext', level, openings: [window(2.5)] },
      { from: [5, -3.5], to: [5, 3.5], thick: 0.25, type: 'ext', level, openings: [window(5.2, 1.2)] },
      { from: [5, 3.5], to: [-5, 3.5], thick: 0.25, type: 'ext', level, openings: level === 0 ? [window(2.5), door(7.5, { w: 1.0, entry: true })] : [window(2.5), window(7.5)] },
      { from: [-5, 3.5], to: [-5, -3.5], thick: 0.25, type: 'ext', level, openings: [window(3.5, 1.2)] },
      // Cloison centrale avec porte, côté sud pour laisser la place à l'escalier
      { from: [0, -3.5], to: [0, 3.5], thick: 0.15, type: 'int', level, openings: [door(5.5)] }
    );
  }
  walls.forEach(w => w.openings.forEach(o => { o.level = w.level; }));
  const room = (id, name, level, xMin, xMax, floorType) => ({ id, name, level, bounds: { xMin, xMax, zMin: -3.5, zMax: 3.5 }, floorType, habitable: true, desc: '' });
  return {
    meta: { name: `Essai escalier — ${label}`, slug: PREFIX + slug, subtitle: `Projet d’essai : escalier ${label} (généré par tools/generate-stair-test-projects.cjs)`, client: '', clientVisible: false, updated: new Date().toISOString() },
    config: { wallHeight: 2.8, floorHeight: 3 },
    levels: [{ id: 0, name: 'RDC', elevation: 0 }, { id: 1, name: 'Étage', elevation: 3 }],
    walls,
    rooms: [
      room('sejour', 'SÉJOUR', 0, -5, 0, 'parquet'),
      room('hall', 'HALL D’ESCALIER', 0, 0, 5, 'tiles'),
      room('chambre', 'CHAMBRE', 1, -5, 0, 'parquet'),
      room('palier', 'PALIER', 1, 0, 5, 'tiles')
    ],
    columns: [],
    canopies: [],
    furniture: [],
    stairwells: [{ name: `Escalier ${label}`, level: 1, ...stair }]
  };
}

if (process.argv.includes('--remove')) {
  for (const { slug } of STAIRS) {
    const dir = path.join(ROOT, PREFIX + slug);
    if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true }); console.log('supprimé', PREFIX + slug); }
  }
} else {
  for (const spec of STAIRS) {
    const dir = path.join(ROOT, PREFIX + spec.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(house(spec), null, 2) + '\n');
    console.log('écrit', path.relative(path.join(__dirname, '..'), path.join(dir, 'project.json')));
  }
}

module.exports = { STAIRS, house, PREFIX };
