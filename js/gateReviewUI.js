/**
 * Revue visuelle de fidélité IA (comparateur rideau + grille 3×3 worstTile / addedTile)
 * et dialogue dédié de forçage Porte E (sans window.prompt, motif obligatoire, historique tracé).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.GateReviewUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const ROW_LABELS = ['haut', 'milieu', 'bas'];
  const COL_LABELS = ['gauche', 'centre', 'droite'];

  function zoneName(row, col) {
    if (row === 1 && col === 1) return 'centre';
    const r = ROW_LABELS[row] || '';
    const c = COL_LABELS[col] || '';
    return r && c ? `${r}-${c}` : 'zone';
  }

  /**
   * Construit les 9 cellules de la grille 3×3 à partir d'un résultat FidelityCheck.
   * Met en évidence worstTile (structure perdue/déplacée) et addedTile (élément ajouté).
   */
  function tileGridCells(fidelity) {
    const worst = fidelity && fidelity.worstTile && Number.isInteger(fidelity.worstTile.row) && Number.isInteger(fidelity.worstTile.col)
      ? fidelity.worstTile
      : null;
    const added = fidelity && fidelity.addedTile && Number.isInteger(fidelity.addedTile.row) && Number.isInteger(fidelity.addedTile.col)
      ? fidelity.addedTile
      : null;
    const cells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const isWorst = Boolean(worst && worst.row === row && worst.col === col && worst.score < 0.42);
        const isAdded = Boolean(added && added.row === row && added.col === col && added.score < 0.48);
        const kind = isWorst && isAdded ? 'both' : isWorst ? 'worst' : isAdded ? 'added' : 'ok';
        const score = isWorst ? worst.score : isAdded ? added.score : null;
        const zone = zoneName(row, col);
        let label = '';
        if (kind === 'both') label = `Écart géométrique & ajout (${zone})`;
        else if (kind === 'worst') label = `Écart géométrique ${Math.round(worst.score * 100)} % (${zone})`;
        else if (kind === 'added') label = `Élément ajouté ${Math.round(added.score * 100)} % (${zone})`;
        cells.push({ index: row * 3 + col, row, col, zone, kind, score, label });
      }
    }
    return cells;
  }

  function explainFidelity(fidelity) {
    if (!fidelity) return 'Contrôle géométrique absent ou non calculé.';
    const parts = [];
    if (Number.isFinite(fidelity.score)) {
      parts.push(`Score global ${Math.round(fidelity.score * 100)} %`);
    }
    if (fidelity.verdict === 'faithful') parts.push('Verdict : Fidèle au plan.');
    else if (fidelity.verdict === 'review') parts.push('Verdict : À vérifier face à la maquette.');
    else if (fidelity.verdict === 'unfaithful') parts.push('Verdict : Écart géométrique important.');
    if (fidelity.worstTile && fidelity.worstTile.score < 0.42) {
      parts.push(`Zone la plus modifiée : ${zoneName(fidelity.worstTile.row, fidelity.worstTile.col)} (${Math.round(fidelity.worstTile.score * 100)} %).`);
    }
    if (fidelity.addedTile && fidelity.addedTile.score < 0.48) {
      parts.push(`Éléments ajoutés non présents sur la source : ${zoneName(fidelity.addedTile.row, fidelity.addedTile.col)} (${Math.round(fidelity.addedTile.score * 100)} %).`);
    }
    return parts.join(' ');
  }

  function validateReason(raw) {
    const reason = typeof raw === 'string' ? raw.trim() : '';
    if (!reason) {
      return { ok: false, reason: '', error: 'Un motif explicite est obligatoire pour tracer un forçage Porte E.' };
    }
    if (reason.length < 3) {
      return { ok: false, reason, error: 'Précisez le motif en au moins 3 caractères.' };
    }
    return { ok: true, reason: reason.slice(0, 240), error: '' };
  }

  function resolveGate(gateApi) {
    if (gateApi) return gateApi;
    if (root && root.DeliverableGate) return root.DeliverableGate;
    if (typeof require === 'function') {
      try { return require('./deliverableGate.js'); } catch { return null; }
    }
    return null;
  }

  /**
   * Historique structuré des forçages Porte E.
   * Valide systématiquement un motif non vide et assainit via DeliverableGate.sanitizeOverride.
   */
  function createOverrideHistory(initialEntries) {
    const entries = Array.isArray(initialEntries) ? initialEntries.slice() : [];

    function list() {
      return entries.map(e => Object.assign({}, e));
    }

    function forTarget(targetId) {
      return entries.filter(e => e.targetId === targetId).map(e => Object.assign({}, e));
    }

    function recordOverride(params, gateApi) {
      const p = params || {};
      const check = validateReason(p.reason);
      if (!check.ok) return { ok: false, error: check.error, override: null, record: null };
      const gate = resolveGate(gateApi);
      const fidelity = p.fidelity || null;
      const rawOverride = {
        reason: check.reason,
        acceptedBy: p.acceptedBy || 'architect',
        acceptedAt: p.acceptedAt || new Date().toISOString(),
        fidelityVersion: fidelity && Number.isFinite(fidelity.version) ? fidelity.version : (p.fidelityVersion ?? 0),
        verdict: (fidelity && fidelity.verdict) || p.verdict || 'missing'
      };
      const override = gate && typeof gate.sanitizeOverride === 'function'
        ? gate.sanitizeOverride(rawOverride)
        : rawOverride;
      if (!override) {
        return { ok: false, error: 'Impossible de valider le motif de forçage.', override: null, record: null };
      }
      const record = {
        targetId: p.targetId || '',
        targetLabel: p.targetLabel || p.targetId || 'Rendu IA',
        destination: p.destination || 'Livrable',
        reason: override.reason,
        acceptedAt: override.acceptedAt,
        acceptedBy: override.acceptedBy,
        verdict: override.verdict,
        fidelityVersion: override.fidelityVersion
      };
      entries.push(record);
      return { ok: true, error: '', override, record };
    }

    return { list, forTarget, recordOverride };
  }

  /**
   * Ouvre un dialogue dédié (sans window.prompt) pour expliquer la Porte E,
   * exiger un motif non vide et consigner le forçage dans l'historique.
   */
  function openGateOverrideDialog(dialogEl, opts) {
    const options = opts || {};
    const history = options.history || createOverrideHistory();
    if (!dialogEl) return Promise.resolve(null);
    const doc = dialogEl.ownerDocument;
    const reasonEl = dialogEl.querySelector('#gate-override-reason');
    const summaryEl = dialogEl.querySelector('#gate-override-summary');
    const fidelityEl = dialogEl.querySelector('#gate-override-fidelity');
    const errorEl = dialogEl.querySelector('#gate-override-error');
    const historyListEl = dialogEl.querySelector('#gate-override-history');
    const confirmBtn = dialogEl.querySelector('#gate-override-confirm');
    const cancelBtn = dialogEl.querySelector('#gate-override-cancel');
    if (!reasonEl || !confirmBtn || !cancelBtn) return Promise.resolve(null);

    if (summaryEl) {
      const dest = options.destination ? ` pour « ${options.destination} »` : '';
      const target = options.targetLabel ? ` (« ${options.targetLabel} »)` : '';
      summaryEl.textContent = `Porte E${target}${dest} — ${options.decisionReason || 'Ce rendu IA n’est pas classé « Fidèle au plan ».'}`;
    }
    if (fidelityEl) {
      fidelityEl.textContent = explainFidelity(options.fidelity);
    }
    if (errorEl) errorEl.textContent = '';
    reasonEl.value = '';

    if (historyListEl && doc) {
      while (historyListEl.firstChild) historyListEl.removeChild(historyListEl.firstChild);
      const past = history.list().slice(-5).reverse();
      if (!past.length) {
        const li = doc.createElement('li');
        li.textContent = 'Aucun forçage enregistré sur cette session.';
        historyListEl.appendChild(li);
      } else {
        past.forEach(item => {
          const li = doc.createElement('li');
          const stamp = item.acceptedAt ? item.acceptedAt.slice(0, 16).replace('T', ' ') : '';
          li.textContent = `${stamp} · ${item.targetLabel} (${item.destination}) — « ${item.reason} »`;
          historyListEl.appendChild(li);
        });
      }
    }

    return new Promise(resolve => {
      let settled = false;
      function cleanup() {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        dialogEl.removeEventListener('cancel', onCancel);
      }
      function finish(val) {
        if (settled) return;
        settled = true;
        cleanup();
        if (typeof dialogEl.close === 'function' && dialogEl.open) dialogEl.close();
        resolve(val);
      }
      function onCancel(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        finish(null);
      }
      function onConfirm(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const res = history.recordOverride({
          targetId: options.targetId,
          targetLabel: options.targetLabel,
          destination: options.destination,
          reason: reasonEl.value,
          fidelity: options.fidelity
        }, options.gateApi);
        if (!res.ok) {
          if (errorEl) errorEl.textContent = res.error;
          if (typeof reasonEl.focus === 'function') reasonEl.focus();
          return;
        }
        finish({ override: res.override, record: res.record });
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      dialogEl.addEventListener('cancel', onCancel);
      if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
      if (typeof reasonEl.focus === 'function') reasonEl.focus();
    });
  }

  /**
   * Construit l'inspecteur Avant / Après avec curseur rideau et grille 3×3 (worstTile / addedTile).
   * S'appuie uniquement sur createElement / textContent (aucun innerHTML).
   */
  function renderFidelityInspector(container, opts) {
    if (!container || typeof container.ownerDocument === 'undefined') return null;
    const doc = container.ownerDocument;
    while (container.firstChild) container.removeChild(container.firstChild);
    const { beforeUrl, afterUrl, label, fidelity } = opts || {};

    const toolbar = doc.createElement('div');
    toolbar.className = 'rg-inspector-toolbar';

    const modeBtn = doc.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'btn-toggle btn-small';
    modeBtn.textContent = 'Affichage : Rideau Avant/Après';
    toolbar.appendChild(modeBtn);

    const gridToggle = doc.createElement('label');
    gridToggle.className = 'rg-inspector-check';
    const gridCb = doc.createElement('input');
    gridCb.type = 'checkbox';
    gridCb.checked = true;
    gridToggle.appendChild(gridCb);
    gridToggle.appendChild(doc.createTextNode(' Grille 3×3 de fidélité'));
    toolbar.appendChild(gridToggle);

    const legend = doc.createElement('span');
    legend.className = 'rg-inspector-legend';
    legend.textContent = explainFidelity(fidelity);
    toolbar.appendChild(legend);
    container.appendChild(toolbar);

    // Vue rideau Avant / Après
    const sliderWrap = doc.createElement('div');
    sliderWrap.className = 'rg-slider-stage';

    const imgBefore = doc.createElement('img');
    imgBefore.className = 'rg-slider-before';
    imgBefore.src = beforeUrl || '';
    imgBefore.alt = `${label || 'Vue'} — Source 3D`;
    sliderWrap.appendChild(imgBefore);

    const afterClip = doc.createElement('div');
    afterClip.className = 'rg-slider-after-clip';
    afterClip.style.clipPath = 'inset(0 0 0 50%)';
    const imgAfter = doc.createElement('img');
    imgAfter.className = 'rg-slider-after';
    imgAfter.src = afterUrl || '';
    imgAfter.alt = `${label || 'Vue'} — Rendu IA`;
    afterClip.appendChild(imgAfter);
    sliderWrap.appendChild(afterClip);

    const dividerLine = doc.createElement('div');
    dividerLine.className = 'rg-slider-line';
    dividerLine.style.left = '50%';
    sliderWrap.appendChild(dividerLine);

    const tagBefore = doc.createElement('span');
    tagBefore.className = 'rg-compare-label rg-slider-tag-left';
    tagBefore.textContent = 'Avant · Source 3D';
    sliderWrap.appendChild(tagBefore);

    const tagAfter = doc.createElement('span');
    tagAfter.className = 'rg-compare-label rg-slider-tag-right';
    tagAfter.textContent = 'Après · Rendu IA';
    sliderWrap.appendChild(tagAfter);

    const gridOverlay = doc.createElement('div');
    gridOverlay.className = 'rg-fidelity-grid';
    gridOverlay.setAttribute('aria-label', 'Grille 3×3 des écarts géométriques');
    const cells = tileGridCells(fidelity);
    cells.forEach(cell => {
      const div = doc.createElement('div');
      div.className = `rg-fidelity-cell is-${cell.kind}`;
      div.setAttribute('data-tile-row', String(cell.row));
      div.setAttribute('data-tile-col', String(cell.col));
      div.setAttribute('data-tile-kind', cell.kind);
      if (cell.label) {
        const badge = doc.createElement('span');
        badge.className = 'rg-fidelity-cell-label';
        badge.textContent = cell.label;
        div.appendChild(badge);
      }
      gridOverlay.appendChild(div);
    });
    sliderWrap.appendChild(gridOverlay);

    const range = doc.createElement('input');
    range.type = 'range';
    range.className = 'rg-slider-range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    range.setAttribute('aria-label', 'Curseur de comparaison Avant / Après');
    const updateSplit = () => {
      const pct = Number(range.value);
      afterClip.style.clipPath = `inset(0 0 0 ${pct}%)`;
      dividerLine.style.left = `${pct}%`;
    };
    range.addEventListener('input', updateSplit);
    sliderWrap.appendChild(range);
    container.appendChild(sliderWrap);

    // Vue côte-à-côte alternative
    const sideWrap = doc.createElement('div');
    sideWrap.className = 'rg-compare-side hidden';
    const panelA = doc.createElement('div');
    panelA.className = 'rg-compare-panel';
    const lblA = doc.createElement('span');
    lblA.className = 'rg-compare-label';
    lblA.textContent = 'Avant · Source 3D';
    const imgA = doc.createElement('img');
    imgA.src = beforeUrl || '';
    imgA.alt = 'Source 3D';
    panelA.appendChild(lblA);
    panelA.appendChild(imgA);

    const panelB = doc.createElement('div');
    panelB.className = 'rg-compare-panel';
    const lblB = doc.createElement('span');
    lblB.className = 'rg-compare-label';
    lblB.textContent = 'Après · Rendu IA';
    const imgB = doc.createElement('img');
    imgB.src = afterUrl || '';
    imgB.alt = 'Rendu IA';
    panelB.appendChild(lblB);
    panelB.appendChild(imgB);
    sideWrap.appendChild(panelA);
    sideWrap.appendChild(panelB);
    container.appendChild(sideWrap);

    let mode = 'slider';
    modeBtn.addEventListener('click', () => {
      mode = mode === 'slider' ? 'side' : 'slider';
      sliderWrap.classList.toggle('hidden', mode !== 'slider');
      sideWrap.classList.toggle('hidden', mode !== 'side');
      modeBtn.textContent = mode === 'slider' ? 'Affichage : Rideau Avant/Après' : 'Affichage : Côte-à-côte';
    });
    gridCb.addEventListener('change', () => {
      gridOverlay.classList.toggle('hidden', !gridCb.checked);
    });

    return { cells, updateFidelity(nextFidelity) {
      legend.textContent = explainFidelity(nextFidelity);
      const nextCells = tileGridCells(nextFidelity);
      Array.from(gridOverlay.children).forEach((node, i) => {
        const c = nextCells[i];
        if (!c) return;
        node.className = `rg-fidelity-cell is-${c.kind}`;
        node.setAttribute('data-tile-kind', c.kind);
        while (node.firstChild) node.removeChild(node.firstChild);
        if (c.label) {
          const badge = doc.createElement('span');
          badge.className = 'rg-fidelity-cell-label';
          badge.textContent = c.label;
          node.appendChild(badge);
        }
      });
    } };
  }

  return {
    zoneName,
    tileGridCells,
    explainFidelity,
    validateReason,
    createOverrideHistory,
    openGateOverrideDialog,
    renderFidelityInspector
  };
});
