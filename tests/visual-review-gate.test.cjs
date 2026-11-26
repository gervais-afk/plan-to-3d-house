'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PlanProposalReview = require('../js/planProposalReview.js');
const GateReviewUI = require('../js/gateReviewUI.js');
const DeliverableGate = require('../js/deliverableGate.js');

function createMockDoc() {
  class MockNode {
    constructor(tag, text) {
      this.tagName = tag;
      this.textContent = text || '';
      this.className = '';
      this.children = [];
      this.attrs = {};
      this.listeners = {};
      this.style = {};
      this.value = '';
      this.checked = false;
      this.open = false;
      this.ownerDocument = doc;
      this.classList = {
        add: c => { if (!this.className.split(/\s+/).includes(c)) this.className = (this.className + ' ' + c).trim(); },
        remove: c => { this.className = this.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
        toggle: (c, force) => {
          const has = this.className.split(/\s+/).includes(c);
          const next = force === undefined ? !has : Boolean(force);
          if (next) this.classList.add(c); else this.classList.remove(c);
        }
      };
    }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
      return child;
    }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] || null; }
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    removeEventListener(ev, fn) {
      this.listeners[ev] = (this.listeners[ev] || []).filter(f => f !== fn);
    }
    dispatch(ev, payload) { (this.listeners[ev] || []).slice().forEach(fn => fn(payload || {})); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = n => {
        n.children.forEach(c => {
          const matchId = sel.startsWith('#') && c.attrs.id === sel.slice(1);
          const matchAttr = sel.startsWith('[') && (() => {
            const m = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
            if (!m) return false;
            return m[2] === undefined ? (m[1] in c.attrs) : c.attrs[m[1]] === m[2];
          })();
          if (matchId || matchAttr) out.push(c);
          walk(c);
        });
      };
      walk(this);
      return out;
    }
  }
  const doc = {
    createElement: tag => new MockNode(tag),
    createTextNode: text => new MockNode('#text', text)
  };
  return doc;
}

test('Lot 7 — Revue visuelle IA : code couleur vert/orange/rouge, focus et blocage tant qu’une erreur bloquante persiste', () => {
  const proposal = {
    walls: [
      { from: [0, 0], to: [6, 0], thick: 0.25, type: 'ext', openings: [] },
      { from: [6, 0], to: [6, 4], thick: 0.15, type: 'int', uncertain: true, openings: [] }
    ],
    rooms: [
      { id: 'sejour', name: 'SÉJOUR', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 4 } }
    ],
    columns: [],
    furniture: [],
    topology: {
      valid: false,
      score: 65,
      errors: ['Périmètre non fermé au coin nord-est'],
      warnings: []
    },
    toVerify: [
      {
        type: 'mur',
        label: 'Cloison est',
        reason: 'Trait flou non coté',
        position: { x: 6, z: 2 },
        uncertain: true
      }
    ]
  };
  const assessment = PlanProposalReview.assessProposal({ openings: [] }, proposal, { mode: 'replace' });
  const session = PlanProposalReview.createReviewSession(assessment, proposal);

  // Tant que l'erreur topologique bloquante n'est pas résolue, canApply() vaut false.
  assert.equal(session.canApply(), false);
  assert.equal(session.getBlockingPending().length, 1);

  const overlayBefore = session.getOverlayItems();
  assert.equal(overlayBefore.walls[0].color, 'green');
  assert.equal(overlayBefore.walls[1].color, 'orange');
  assert.equal(overlayBefore.markers.find(m => m.id === 'topo-err-0').color, 'red');
  assert.equal(overlayBefore.markers.find(m => m.id === 'verify-0').color, 'orange');

  // Clic sur l'élément à vérifier → cible de zoom exacte
  const focus = session.getFocusTarget('verify-0');
  assert.equal(focus.x, 6);
  assert.equal(focus.z, 2);
  assert.equal(focus.exact, true);

  // Résoudre uniquement l'élément orange ne débloque pas l'erreur bloquante rouge
  session.resolveItem('verify-0', 'accepted');
  assert.equal(session.canApply(), false);
  assert.equal(session.getOverlayItems().walls[1].color, 'green');

  // Résoudre l'anomalie bloquante débloque l'application
  session.resolveItem('topo-err-0', 'corrected', 'Fermeture vérifiée');
  assert.equal(session.canApply(), true);
  assert.equal(session.getOverlayItems().markers.find(m => m.id === 'topo-err-0').color, 'green');

  // Rendu DOM sûr avec boutons Accepter / Corriger / Ignorer
  const doc = createMockDoc();
  const container = doc.createElement('div');
  let focused = null;
  PlanProposalReview.renderReview(container, assessment, {
    mode: 'replace',
    session,
    onFocus: it => { focused = it.id; },
    onChange: () => {}
  });
  const actionButtons = container.querySelectorAll('[data-review-action]');
  assert.ok(actionButtons.length >= 6, 'Chaque élément dispose des actions Accepter/Corriger/Ignorer');
  assert.equal(focused, null);
});

test('Lot 7 — Inspecteur de fidélité : grille 3×3 surligne worstTile et addedTile', () => {
  const fidelity = {
    version: 2,
    score: 0.35,
    recall: 0.40,
    verdict: 'unfaithful',
    worstTile: { row: 0, col: 2, score: 0.21 },
    addedTile: { row: 2, col: 1, score: 0.32 }
  };
  const cells = GateReviewUI.tileGridCells(fidelity);
  assert.equal(cells.length, 9);
  assert.equal(cells[2].kind, 'worst');
  assert.equal(cells[2].zone, 'haut-droite');
  assert.equal(cells[7].kind, 'added');
  assert.equal(cells[7].zone, 'bas-centre');
  assert.equal(cells[4].kind, 'ok');

  // Même tuile touchée par worstTile et addedTile -> 'both'
  const bothCells = GateReviewUI.tileGridCells({
    score: 0.3,
    verdict: 'unfaithful',
    worstTile: { row: 1, col: 1, score: 0.2 },
    addedTile: { row: 1, col: 1, score: 0.3 }
  });
  assert.equal(bothCells[4].kind, 'both');
  assert.equal(bothCells[4].zone, 'centre');
});

test('Lot 7 — Dialogue Porte E : motif obligatoire, historique tracé et zéro window.prompt dans app.js', async () => {
  const doc = createMockDoc();
  const dialog = doc.createElement('dialog');
  const makeChild = (tag, id) => {
    const el = doc.createElement(tag);
    el.setAttribute('id', id);
    dialog.appendChild(el);
    return el;
  };
  makeChild('p', 'gate-override-summary');
  makeChild('p', 'gate-override-fidelity');
  const reasonInput = makeChild('textarea', 'gate-override-reason');
  const errorEl = makeChild('p', 'gate-override-error');
  makeChild('ul', 'gate-override-history');
  const cancelBtn = makeChild('button', 'gate-override-cancel');
  const confirmBtn = makeChild('button', 'gate-override-confirm');

  const history = GateReviewUI.createOverrideHistory();
  const fidelity = { version: 2, score: 0.41, verdict: 'review', worstTile: { row: 1, col: 0, score: 0.33 } };

  const promise = GateReviewUI.openGateOverrideDialog(dialog, {
    targetId: 'photor-sejour',
    targetLabel: 'Séjour',
    destination: 'Catalogue',
    decisionReason: 'Écart local sur le mur ouest',
    fidelity,
    history,
    gateApi: DeliverableGate
  });

  assert.equal(dialog.open, true);

  // Tentative de validation avec motif vide -> rejetée, dialogue toujours ouvert
  reasonInput.value = '   ';
  confirmBtn.dispatch('click');
  assert.equal(dialog.open, true);
  assert.ok(errorEl.textContent.length > 0);
  assert.equal(history.list().length, 0);

  // Saisie d'un motif valide -> accepté, assaini par DeliverableGate, journalisé dans l'historique
  reasonInput.value = 'Mobilier décoratif ajouté sur la terrasse, gros œuvre conforme.';
  confirmBtn.dispatch('click');

  const res = await promise;
  assert.equal(dialog.open, false);
  assert.ok(res && res.override);
  assert.equal(res.override.reason, 'Mobilier décoratif ajouté sur la terrasse, gros œuvre conforme.');
  assert.equal(history.list().length, 1);
  assert.equal(history.forTarget('photor-sejour')[0].destination, 'Catalogue');
  assert.equal(
    DeliverableGate.evaluate({ id: 'photor-sejour', ai: true, fidelity, fidelityOverride: res.override }).eligible,
    true
  );

  // Vérifier annulation propre
  const cancelPromise = GateReviewUI.openGateOverrideDialog(dialog, {
    targetId: 'photor-chambre',
    targetLabel: 'Chambre',
    destination: 'Cahier de plans',
    decisionReason: 'Contrôle absent',
    history,
    gateApi: DeliverableGate
  });
  cancelBtn.dispatch('click');
  assert.equal(await cancelPromise, null);

  // Vérification statique : plus aucun window.prompt pour Porte E dans js/app.js et dialogue présent dans index.html
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.equal(appSource.includes('window.prompt('), false, 'js/app.js ne doit plus utiliser window.prompt pour la Porte E');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="gate-override-dialog"'), 'index.html doit contenir le dialogue #gate-override-dialog');
});
