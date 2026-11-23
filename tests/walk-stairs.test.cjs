const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const project = require('../projects/residence-verandas/project.json');
// La visite libre s'appuie sur la géométrie d'escalier commune (HouseAuto, projectLoader.js).
const context = { HOUSE_DATA: project, THREE: {}, console, Math, JSON };
context.window = context;
vm.createContext(context);
for (const file of ['houseDataCore.js', 'projectLoader.js', 'walkController.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, { filename: file });
}
const WalkController = context.window.WalkController;
const stairs = project.stairwells[0];
const width = (stairs.zMax - stairs.zMin - 0.12) / 2;
const turn = stairs.xMin + 0.84;
const start = stairs.xMax;
const tread = (start - turn) / 8;
const front = stairs.zMax - width / 2;
const back = stairs.zMin + width / 2;
const controller = Object.assign(Object.create(WalkController.prototype), { walkFloorHeight: project.config.floorHeight, playerRadius: 0.25 });

function near(actual, expected) {
  assert.ok(actual !== null && Math.abs(actual.y - expected) < 1e-8, `${actual?.y} ≠ ${expected}`);
}

test('Visite libre : hauteur progressive des 16 marches, palier et descente', () => {
  for (let i = 0; i < 8; i++) {
    const firstX = start - (i + 0.5) * tread;
    near(controller.stairFloorAt(firstX, front), (i + 1) * project.config.floorHeight / 16);
    const returnX = turn + (i + 0.5) * tread;
    near(controller.stairFloorAt(returnX, back), (9 + i) * project.config.floorHeight / 16);
  }
  near(controller.stairFloorAt((stairs.xMin + turn) / 2, (stairs.zMin + stairs.zMax) / 2), project.config.floorHeight / 2);
  assert.equal(controller.stairFloorAt(start + 0.6, front), null);
});

test('La hauteur des yeux reste à 1,59 m et la marge de collision à 25 cm', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/walkController.js'), 'utf8');
  assert.equal((source.match(/this\.eyeHeight\s*=\s*1\.59/g) || []).length, 2, 'constructeur et démarrage libre');
  assert.match(source, /this\.playerRadius\s*=\s*0\.25/);
});

test('Le balancement de tête reste limité à deux centimètres', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/walkController.js'), 'utf8');
  assert.match(source, /Math\.sin\(this\.stepTimer\)\s*\*\s*0\.02/);
  assert.match(source, /this\.currentFloorY\s*\+=\s*\(this\.targetFloorY\s*-\s*this\.currentFloorY\)/);
});
