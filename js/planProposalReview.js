(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PlanProposalReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VALID_ACTIONS = new Set(['accepted', 'corrected', 'ignored']);

  function formatPosition(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return 'position inconnue';
    return `x ${pos.x.toFixed(2)} m, z ${pos.z.toFixed(2)} m`;
  }

  function formatToVerifyItem(item) {
    const type = item && item.type ? item.type : 'élément';
    const label = item && item.label ? `${item.label} — ` : '';
    const reason = item && item.reason ? item.reason : 'À vérifier.';
    return `[${type}] ${label}${reason} (${formatPosition(item && item.position)})`;
  }

  function assessProposal(ai, out, opts) {
    const options = opts || {};
    const warnings = [];
    const sourceOpenings = Array.isArray(ai && ai.openings) ? ai.openings.length : 0;
    const walls = Array.isArray(out && out.walls) ? out.walls : [];
    const rooms = Array.isArray(out && out.rooms) ? out.rooms : [];
    const columns = Array.isArray(out && out.columns) ? out.columns : [];
    const mappedOpenings = walls.reduce((sum, wall) => sum + ((wall.openings && wall.openings.length) || 0), 0);
    const unmatchedOpenings = Math.max(0, sourceOpenings - mappedOpenings);
    const toVerify = Array.isArray(out && out.toVerify) ? out.toVerify.slice() : [];
    const topology = (out && out.topology) || null;

    if (options.scale === 'ai') warnings.push(`Échelle estimée par IA${out && out.reference ? ` à partir de « ${out.reference} »` : ''} : vérifiez-la avec une cote connue.`);
    if (!walls.some(wall => wall.type === 'ext')) warnings.push('Aucun mur extérieur reconnu avec certitude : contrôlez le périmètre.');
    if (unmatchedOpenings) warnings.push(`${unmatchedOpenings} ouverture(s) n’ont pas été rattachées à un mur.`);
    if (rooms.length < 2) warnings.push('Peu de pièces ont été détectées ; comparez-les aux libellés du document.');
    if (columns.length) warnings.push(`${columns.length} poteau(x)/colonne(s) détecté(s) : leur position doit être vérifiée sur le document source.`);
    if (topology && Array.isArray(topology.errors) && topology.errors.length) {
      warnings.push(`Validation topologique : ${topology.errors.length} erreur(s) détectée(s) (score ${topology.score}/100).`);
    }
    const uncertainCount = toVerify.filter(item => item && item.uncertain === true).length;
    if (uncertainCount) {
      warnings.push(`${uncertainCount} élément(s) ou zone(s) floue(s)/non cotée(s) marqué(s) incertain(s) dans « À vérifier ».`);
    }
    if (toVerify.length) {
      warnings.push(`${toVerify.length} élément(s) écarté(s) consigné(s) dans la liste « À vérifier ».`);
    }
    warnings.push('Le modèle ne fournit pas de score de confiance par élément. Tous les traits proposés doivent être relus avant application.');
    return { warnings, unmatchedOpenings, mappedOpenings, toVerify, uncertainCount, topology };
  }

  function centroidOfProposal(proposal) {
    const pts = [];
    if (proposal && Array.isArray(proposal.walls)) {
      proposal.walls.forEach(w => {
        if (Array.isArray(w.from) && w.from.length >= 2) pts.push({ x: w.from[0], z: w.from[1] });
        if (Array.isArray(w.to) && w.to.length >= 2) pts.push({ x: w.to[0], z: w.to[1] });
      });
    }
    if (!pts.length && proposal && Array.isArray(proposal.rooms)) {
      proposal.rooms.forEach(r => {
        if (r && r.bounds) {
          pts.push({
            x: (Number(r.bounds.xMin) + Number(r.bounds.xMax)) / 2,
            z: (Number(r.bounds.zMin) + Number(r.bounds.zMax)) / 2
          });
        }
      });
    }
    if (!pts.length) return { x: 0, z: 0 };
    const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
    return { x: sum.x / pts.length, z: sum.z / pts.length };
  }

  function posMatch(a, b, tol = 0.25) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return false;
    return Math.hypot(a.x - b.x, a.z - b.z) <= tol;
  }

  /**
   * Machine à états pure pour la revue visuelle d'une proposition IA/vectorielle.
   * Classe chaque élément en vert (fiable / validé), orange (à vérifier / incertain) ou rouge (erreur bloquante).
   * Tant qu'une erreur bloquante reste en attente, canApply() renvoie false.
   */
  function createReviewSession(assessment, proposal) {
    const safeAssessment = assessment || {};
    const safeProposal = proposal || { walls: [], rooms: [], columns: [], furniture: [] };
    const items = [];
    const topo = safeAssessment.topology;

    if (topo && Array.isArray(topo.errors)) {
      topo.errors.forEach((err, idx) => {
        const text = typeof err === 'string' ? err : (err && err.reason) || String(err);
        const pos = (err && typeof err === 'object' && err.position && Number.isFinite(err.position.x) && Number.isFinite(err.position.z))
          ? { x: err.position.x, z: err.position.z }
          : null;
        items.push({
          id: `topo-err-${idx}`,
          source: 'topology',
          type: 'topologie',
          severity: 'error',
          label: `Anomalie topologique #${idx + 1}`,
          reason: text,
          position: pos,
          uncertain: false,
          status: 'pending',
          correction: null
        });
      });
    }

    const toVerify = Array.isArray(safeAssessment.toVerify) ? safeAssessment.toVerify : [];
    toVerify.forEach((entry, idx) => {
      if (!entry) return;
      const isBlocking = entry.blocking === true || entry.severity === 'error';
      const pos = entry.position && Number.isFinite(entry.position.x) && Number.isFinite(entry.position.z)
        ? { x: entry.position.x, z: entry.position.z }
        : null;
      items.push({
        id: `verify-${idx}`,
        source: 'toVerify',
        type: entry.type || 'élément',
        severity: isBlocking ? 'error' : 'warning',
        label: entry.label || '',
        reason: entry.reason || 'À vérifier.',
        position: pos,
        uncertain: Boolean(entry.uncertain),
        status: 'pending',
        correction: null,
        raw: entry
      });
    });

    function findItem(id) {
      return items.find(it => it.id === id) || null;
    }

    function resolveItem(id, action, correction) {
      if (!VALID_ACTIONS.has(action)) {
        throw new Error(`Action de revue invalide : ${action}`);
      }
      const item = findItem(id);
      if (!item) return null;
      item.status = action;
      item.correction = correction !== undefined && correction !== null && String(correction).trim()
        ? String(correction).trim()
        : null;
      return Object.assign({}, item);
    }

    function resetItem(id) {
      const item = findItem(id);
      if (!item) return null;
      item.status = 'pending';
      item.correction = null;
      return Object.assign({}, item);
    }

    function getItems() {
      return items.map(it => Object.assign({}, it));
    }

    function getBlockingPending() {
      return items.filter(it => it.severity === 'error' && it.status === 'pending').map(it => Object.assign({}, it));
    }

    function canApply() {
      const hasWalls = Array.isArray(safeProposal.walls) && safeProposal.walls.length > 0;
      const hasRooms = Array.isArray(safeProposal.rooms) && safeProposal.rooms.length > 0;
      const allowWallsOnly = safeProposal.source === 'pdf-vector';
      if (proposal && (!hasWalls || (!hasRooms && !allowWallsOnly))) return false;
      return getBlockingPending().length === 0;
    }

    function getFocusTarget(id) {
      const item = findItem(id);
      if (!item) return null;
      if (item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.z)) {
        return { x: item.position.x, z: item.position.z, scale: 95, exact: true };
      }
      const center = centroidOfProposal(safeProposal);
      return { x: center.x, z: center.z, scale: 55, exact: false };
    }

    function itemColor(item) {
      if (item.status === 'accepted' || item.status === 'corrected') return 'green';
      if (item.status === 'ignored') return 'muted';
      return item.severity === 'error' ? 'red' : 'orange';
    }

    function wallOverlayColor(wall) {
      const mid = (Array.isArray(wall.from) && Array.isArray(wall.to))
        ? { x: (wall.from[0] + wall.to[0]) / 2, z: (wall.from[1] + wall.to[1]) / 2 }
        : null;
      const matching = mid ? items.find(it => it.type === 'mur' && posMatch(it.position, mid, 0.35)) : null;
      if (matching) return itemColor(matching);
      if (wall.uncertain === true) return 'orange';
      return 'green';
    }

    function roomOverlayColor(room) {
      const mid = room && room.bounds
        ? { x: (room.bounds.xMin + room.bounds.xMax) / 2, z: (room.bounds.zMin + room.bounds.zMax) / 2 }
        : null;
      const matching = mid ? items.find(it => it.type === 'pièce' && (posMatch(it.position, mid, 0.5) || (it.label && room.name && it.label.toUpperCase() === room.name.toUpperCase()))) : null;
      if (matching) return itemColor(matching);
      if (room.uncertain === true) return 'orange';
      return 'green';
    }

    function getOverlayItems() {
      const walls = (safeProposal.walls || []).map((w, idx) => ({
        index: idx,
        from: w.from,
        to: w.to,
        thick: w.thick || 0.2,
        type: w.type || 'ext',
        color: wallOverlayColor(w),
        openings: (w.openings || []).map(o => ({
          type: o.type,
          at: o.at,
          w: o.w,
          color: o.uncertain === true ? 'orange' : 'green'
        }))
      }));
      const rooms = (safeProposal.rooms || []).map((r, idx) => ({
        index: idx,
        id: r.id,
        name: r.name,
        bounds: r.bounds,
        poly: r.poly || null,
        color: roomOverlayColor(r)
      }));
      const markers = items.map(it => ({
        id: it.id,
        type: it.type,
        label: it.label || it.type,
        reason: it.reason,
        severity: it.severity,
        status: it.status,
        position: it.position,
        color: itemColor(it)
      }));
      return {
        walls,
        rooms,
        markers,
        counts: {
          green: walls.filter(w => w.color === 'green').length + rooms.filter(r => r.color === 'green').length,
          orange: walls.filter(w => w.color === 'orange').length + rooms.filter(r => r.color === 'orange').length + markers.filter(m => m.color === 'orange').length,
          red: markers.filter(m => m.color === 'red').length
        }
      };
    }

    function applyDecisions(baseProposal) {
      const src = baseProposal || safeProposal;
      const ignoredWallPositions = items
        .filter(it => it.type === 'mur' && it.status === 'ignored' && it.position)
        .map(it => it.position);
      const ignoredRoomItems = items.filter(it => it.type === 'pièce' && it.status === 'ignored');
      const correctedRoomItems = items.filter(it => it.type === 'pièce' && it.status === 'corrected' && it.correction);

      const walls = (src.walls || []).filter(w => {
        if (!w.uncertain || !ignoredWallPositions.length) return true;
        const mid = { x: (w.from[0] + w.to[0]) / 2, z: (w.from[1] + w.to[1]) / 2 };
        return !ignoredWallPositions.some(p => posMatch(p, mid, 0.35));
      });

      const rooms = (src.rooms || []).filter(r => {
        if (!r.uncertain || !ignoredRoomItems.length) return true;
        const mid = r.bounds ? { x: (r.bounds.xMin + r.bounds.xMax) / 2, z: (r.bounds.zMin + r.bounds.zMax) / 2 } : null;
        return !ignoredRoomItems.some(it => (mid && posMatch(it.position, mid, 0.5)) || (it.label && r.name && it.label.toUpperCase() === r.name.toUpperCase()));
      }).map(r => {
        const mid = r.bounds ? { x: (r.bounds.xMin + r.bounds.xMax) / 2, z: (r.bounds.zMin + r.bounds.zMax) / 2 } : null;
        const corr = correctedRoomItems.find(it => (mid && posMatch(it.position, mid, 0.5)) || (it.label && r.name && it.label.toUpperCase() === r.name.toUpperCase()));
        return corr ? Object.assign({}, r, { name: corr.correction.toUpperCase(), uncertain: false }) : r;
      });

      return Object.assign({}, src, {
        walls,
        rooms,
        reviewDecisions: getItems().map(it => ({
          id: it.id,
          type: it.type,
          severity: it.severity,
          status: it.status,
          correction: it.correction
        }))
      });
    }

    return {
      getItems,
      getBlockingPending,
      resolveItem,
      resetItem,
      canApply,
      getFocusTarget,
      getOverlayItems,
      applyDecisions
    };
  }

  function statusBadgeLabel(status, severity) {
    if (status === 'accepted') return 'Accepté';
    if (status === 'corrected') return 'Corrigé';
    if (status === 'ignored') return 'Ignoré';
    return severity === 'error' ? 'Bloquant' : 'À vérifier';
  }

  function appendInteractiveActions(doc, li, item, session, opts) {
    const bar = doc.createElement('div');
    bar.className = 'ed-ai-item-actions';

    const badge = doc.createElement('span');
    const colorClass = (item.status === 'accepted' || item.status === 'corrected')
      ? 'is-green'
      : item.status === 'ignored'
        ? 'is-muted'
        : item.severity === 'error' ? 'is-red' : 'is-orange';
    badge.className = `ed-ai-badge ${colorClass}`;
    badge.textContent = statusBadgeLabel(item.status, item.severity);
    bar.appendChild(badge);

    if (item.position && typeof opts.onFocus === 'function') {
      const btnFocus = doc.createElement('button');
      btnFocus.type = 'button';
      btnFocus.className = 'ed-ai-btn';
      btnFocus.textContent = 'Voir sur le plan';
      btnFocus.addEventListener('click', () => opts.onFocus(item));
      bar.appendChild(btnFocus);
    }

    const actions = [
      ['accepted', 'Accepter'],
      ['corrected', 'Corriger'],
      ['ignored', 'Ignorer']
    ];
    actions.forEach(([actionKey, label]) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `ed-ai-btn${item.status === actionKey ? ' is-active' : ''}`;
      btn.setAttribute('data-review-action', actionKey);
      btn.setAttribute('data-review-id', item.id);
      btn.textContent = label;
      btn.addEventListener('click', () => {
        let correction = null;
        if (actionKey === 'corrected' && typeof opts.onCorrect === 'function') {
          correction = opts.onCorrect(item);
          if (correction === false) return;
        }
        session.resolveItem(item.id, actionKey, correction);
        if (typeof opts.onChange === 'function') opts.onChange(session);
      });
      bar.appendChild(btn);
    });

    if (item.correction) {
      const note = doc.createElement('span');
      note.className = 'ed-ai-pos';
      note.textContent = `Correction : ${item.correction}`;
      bar.appendChild(note);
    }

    li.appendChild(bar);
  }

  function renderReview(container, assessment, opts) {
    if (!container || typeof container.ownerDocument === 'undefined') return;
    const doc = container.ownerDocument;
    while (container.firstChild) container.removeChild(container.firstChild);
    const session = opts && opts.session ? opts.session : null;

    const modeP = doc.createElement('p');
    modeP.textContent = (opts && opts.mode === 'replace')
      ? 'Mode : remplacer le tracé existant.'
      : 'Mode : ajouter au tracé existant.';
    container.appendChild(modeP);

    if (session) {
      const pendingErrors = session.getBlockingPending();
      const gateP = doc.createElement('p');
      gateP.className = pendingErrors.length ? 'ed-ai-err' : 'ed-ai-ok';
      gateP.textContent = pendingErrors.length
        ? `${pendingErrors.length} anomalie(s) bloquante(s) en rouge : traitez-les (Accepter, Corriger ou Ignorer) pour débloquer l’application.`
        : 'Aucune anomalie bloquante en attente · Légende sur le plan : vert = fiable/validé, orange = à vérifier, rouge = erreur bloquante.';
      container.appendChild(gateP);
    }

    const topo = assessment && assessment.topology;
    if (topo) {
      const topoTitle = doc.createElement('h4');
      topoTitle.textContent = `Validation topologique — score ${topo.score}/100 (${topo.valid ? 'conforme' : 'anomalies détectées'})`;
      container.appendChild(topoTitle);
      const topoErrSessionItems = session
        ? session.getItems().filter(it => it.source === 'topology')
        : [];
      const topoWarnings = topo.warnings || [];
      if (topoErrSessionItems.length || (!session && (topo.errors || []).length) || topoWarnings.length) {
        const ul = doc.createElement('ul');
        if (session) {
          topoErrSessionItems.forEach(item => {
            const li = doc.createElement('li');
            li.className = item.status === 'pending' ? 'ed-ai-err' : '';
            const span = doc.createElement('span');
            span.textContent = item.reason;
            li.appendChild(span);
            appendInteractiveActions(doc, li, item, session, opts);
            ul.appendChild(li);
          });
        } else {
          (topo.errors || []).forEach(text => {
            const li = doc.createElement('li');
            li.className = 'ed-ai-err';
            li.textContent = text;
            ul.appendChild(li);
          });
        }
        topoWarnings.forEach(text => {
          const li = doc.createElement('li');
          li.textContent = text;
          ul.appendChild(li);
        });
        container.appendChild(ul);
      }
    }

    const toVerify = (assessment && assessment.toVerify) || [];
    const verifyTitle = doc.createElement('h4');
    verifyTitle.textContent = `À vérifier (${toVerify.length})`;
    container.appendChild(verifyTitle);

    if (toVerify.length) {
      const ul = doc.createElement('ul');
      ul.className = 'ed-ai-verify-list';
      const sessionVerify = session ? session.getItems().filter(it => it.source === 'toVerify') : [];
      toVerify.forEach((item, idx) => {
        const li = doc.createElement('li');
        const typeTag = doc.createElement('strong');
        typeTag.textContent = `[${item.type || 'élément'}] `;
        li.appendChild(typeTag);
        const body = doc.createTextNode(`${item.label ? `${item.label} — ` : ''}${item.reason || 'À vérifier.'} `);
        li.appendChild(body);
        const pos = doc.createElement('span');
        pos.className = 'ed-ai-pos';
        pos.textContent = `(${formatPosition(item.position)})`;
        li.appendChild(pos);
        if (session && sessionVerify[idx]) {
          appendInteractiveActions(doc, li, sessionVerify[idx], session, opts);
        }
        ul.appendChild(li);
      });
      container.appendChild(ul);
    } else {
      const okP = doc.createElement('p');
      okP.textContent = 'Aucun élément écarté lors de la conversion.';
      container.appendChild(okP);
    }

    const warnings = (assessment && assessment.warnings) || [];
    if (warnings.length) {
      const warnTitle = doc.createElement('h4');
      warnTitle.textContent = 'Points d’attention';
      container.appendChild(warnTitle);
      const ul = doc.createElement('ul');
      warnings.forEach(text => {
        const li = doc.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }
  }

  return {
    assessProposal,
    createReviewSession,
    formatPosition,
    formatToVerifyItem,
    renderReview
  };
});
