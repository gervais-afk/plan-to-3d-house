'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DeliverableChecklist = require('../js/deliverableChecklist.js');

test('Lot 8 — Projet vide : toutes les étapes sont « todo » avec liste explicite des manques', () => {
  const state = DeliverableChecklist.evaluate({
    project: { meta: {}, config: {}, walls: [], rooms: [] },
    cabinet: {},
    media: { renders: [], images: [] },
    planches: []
  });

  assert.equal(state.totalSteps, 5);
  assert.equal(state.doneCount, 0);
  assert.equal(state.ready, false);
  state.steps.forEach(step => {
    assert.equal(step.status, 'todo', `Étape ${step.id} devrait être todo`);
    assert.ok(step.missing.length > 0, `Étape ${step.id} doit expliquer ce qui manque`);
  });
  assert.equal(state.documents.length, 5);
  assert.deepEqual(
    state.documents.map(d => d.id),
    ['aps', 'brochure', 'catalog', 'book', 'synthesis']
  );
  state.documents.forEach(d => assert.equal(d.ready, false));
});

test('Lot 8 — Projet partiel : plan non calibré, rendu IA bloqué Porte E, cartouche incomplet', () => {
  const project = {
    meta: { name: 'Villa Test', architect: 'Atelier Nord' },
    config: {
      planImage: { url: 'projects/villa-test/plan.png', calibrated: false, pxPerMeter: 50 }
    },
    walls: [
      { from: [0, 0], to: [8, 0], thick: 0.25, type: 'ext', openings: [{ type: 'door', at: 2, w: 1, entry: true }] }
    ],
    rooms: [
      { id: 'sejour', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 8, zMin: 0, zMax: 5 } }
    ]
  };
  const media = {
    renders: [{ id: 'facade', file: 'projects/villa-test/generated/images/facade.jpg' }],
    images: [
      {
        id: 'photor-sejour',
        label: 'Séjour IA',
        ai: true,
        model: 'google/gemini-3.1-flash-image',
        fidelity: { version: 2, score: 0.30, verdict: 'unfaithful' }
      }
    ]
  };

  const state = DeliverableChecklist.evaluate({
    project,
    cabinet: { name: 'Cabinet Test', architect: 'Atelier Nord' },
    media,
    planches: [{ id: 'p1', type: 'distribution', level: 0 }]
  });

  const byId = Object.fromEntries(state.steps.map(s => [s.id, s]));
  assert.equal(byId.plan.status, 'partial');
  assert.ok(byId.plan.missing.some(m => /calibr/i.test(m)));
  assert.equal(byId.model.status, 'done');
  assert.equal(byId.views.status, 'done');
  assert.equal(byId['ai-gate'].status, 'partial');
  assert.equal(byId['ai-gate'].counts.blocked, 1);
  assert.ok(byId['ai-gate'].missing.some(m => m.includes('Séjour IA')));
  assert.equal(byId.documents.status, 'partial');
  assert.equal(byId.documents.planchesCount, 1);
  assert.ok(byId.documents.missingFields.length > 0);
  assert.equal(state.ready, false);
});

test('Lot 8 — Projet complet : 5/5 étapes prêtes et 5 livrables prêts', () => {
  const project = {
    meta: {
      name: 'Villa Complète',
      subtitle: 'Maison R+1',
      client: 'M. & Mme Mbarga',
      architect: 'Cabinet Horizon',
      location: 'Douala, Cameroun',
      phase: 'APS',
      revision: 'Ind. B',
      issueDate: '2026-11-25'
    },
    config: {
      planImage: {
        url: 'projects/villa-complete/plan.png',
        calibrated: true,
        pxPerMeter: 80,
        controlCheck: { alert: false, errorPct: 0.4 }
      }
    },
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', openings: [{ type: 'door', at: 5, w: 1.0, entry: true }] },
      { from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext', openings: [] },
      { from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext', openings: [] },
      { from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext', openings: [] }
    ],
    rooms: [
      { id: 'sejour', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 8 } }
    ]
  };
  const media = {
    renders: [
      { id: 'facade', file: 'projects/villa-complete/generated/images/facade.jpg' },
      { id: 'sejour', file: 'projects/villa-complete/generated/images/sejour.jpg' }
    ],
    images: [
      {
        id: 'photor-sejour',
        label: 'Séjour IA',
        ai: true,
        model: 'google/gemini-3.1-flash-image',
        fidelity: { version: 2, score: 0.88, verdict: 'faithful' }
      }
    ]
  };

  const state = DeliverableChecklist.evaluate({
    project,
    cabinet: { name: 'Cabinet Horizon', architect: 'Cabinet Horizon' },
    media,
    planches: [{ id: 'p1', type: 'distribution', level: 0 }]
  });

  assert.equal(state.doneCount, 5);
  assert.equal(state.ready, true);
  state.steps.forEach(s => assert.equal(s.status, 'done'));
  state.documents.forEach(d => assert.equal(d.ready, true));
});

test('Lot 8 — Présence du bouton Livrables et du dialogue sur Visite 3D, Éditeur et Accueil', () => {
  const root = path.join(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const editorHtml = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
  const accueilHtml = fs.readFileSync(path.join(root, 'accueil.html'), 'utf8');
  const workspaceJs = fs.readFileSync(path.join(root, 'js', 'workspace.js'), 'utf8');

  assert.ok(indexHtml.includes('id="btn-deliverables"'), 'Bouton Livrables manquant dans index.html');
  assert.ok(indexHtml.includes('id="dlg-deliverables"'), 'Dialogue Livrables manquant dans index.html');
  assert.ok(editorHtml.includes('id="btn-deliverables"'), 'Bouton Livrables manquant dans editor.html');
  assert.ok(editorHtml.includes('id="dlg-deliverables"'), 'Dialogue Livrables manquant dans editor.html');
  assert.ok(editorHtml.includes('js/deliverableChecklist.js'), 'Script deliverableChecklist.js manquant dans editor.html');
  assert.ok(accueilHtml.includes('id="home-deliverables"'), 'Bouton Livrables manquant dans accueil.html');
  assert.ok(accueilHtml.includes('id="dlg-home-deliverables"'), 'Dialogue Livrables manquant dans accueil.html');
  assert.ok(workspaceJs.includes("'deliverableChecklist'"), 'deliverableChecklist manquant dans js/workspace.js');
});
