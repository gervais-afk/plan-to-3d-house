(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PlanProposalReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
    if (toVerify.length) {
      warnings.push(`${toVerify.length} élément(s) écarté(s) consigné(s) dans la liste « À vérifier ».`);
    }
    warnings.push('Le modèle ne fournit pas de score de confiance par élément. Tous les traits proposés doivent être relus avant application.');
    return { warnings, unmatchedOpenings, mappedOpenings, toVerify, topology };
  }

  function renderReview(container, assessment, opts) {
    if (!container || typeof container.ownerDocument === 'undefined') return;
    const doc = container.ownerDocument;
    while (container.firstChild) container.removeChild(container.firstChild);

    const modeP = doc.createElement('p');
    modeP.textContent = (opts && opts.mode === 'replace')
      ? 'Mode : remplacer le tracé existant.'
      : 'Mode : ajouter au tracé existant.';
    container.appendChild(modeP);

    const topo = assessment && assessment.topology;
    if (topo) {
      const topoTitle = doc.createElement('h4');
      topoTitle.textContent = `Validation topologique — score ${topo.score}/100 (${topo.valid ? 'conforme' : 'anomalies détectées'})`;
      container.appendChild(topoTitle);
      const topoItems = []
        .concat((topo.errors || []).map(text => ({ text, isErr: true })))
        .concat((topo.warnings || []).map(text => ({ text, isErr: false })));
      if (topoItems.length) {
        const ul = doc.createElement('ul');
        topoItems.forEach(entry => {
          const li = doc.createElement('li');
          if (entry.isErr) li.className = 'ed-ai-err';
          li.textContent = entry.text;
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
      toVerify.forEach(item => {
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

  return { assessProposal, formatPosition, formatToVerifyItem, renderReview };
});
