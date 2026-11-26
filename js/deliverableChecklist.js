/**
 * Tableau de bord « Livrables » : évalue l'état d'avancement du dossier en 5 étapes
 * (plan calibré, maquette vérifiée, vues capturées, rendus IA Porte E, documents/cartouche)
 * et déclenche les 5 générateurs existants sans rien inventer.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DeliverableChecklist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function resolveDep(overrides, key, globalName, relPath) {
    if (overrides && overrides[key]) return overrides[key];
    if (root && root[globalName]) return root[globalName];
    if (typeof require === 'function' && relPath) {
      try { return require(relPath); } catch { return null; }
    }
    return null;
  }

  function allWalls(project) {
    if (!project) return [];
    const base = Array.isArray(project.walls) ? project.walls : [];
    const levels = project.levels && typeof project.levels === 'object' ? Object.values(project.levels) : [];
    const extra = levels.flatMap(l => (l && Array.isArray(l.walls) ? l.walls : []));
    return base.length ? base : extra;
  }

  function allRooms(project) {
    if (!project) return [];
    const base = Array.isArray(project.rooms) ? project.rooms : [];
    const levels = project.levels && typeof project.levels === 'object' ? Object.values(project.levels) : [];
    const extra = levels.flatMap(l => (l && Array.isArray(l.rooms) ? l.rooms : []));
    return base.length ? base : extra;
  }

  /**
   * Évalue l'état des 5 étapes et des 5 livrables à partir de l'état réel du projet.
   */
  function evaluate({ project = null, cabinet = null, media = null, planches = [], deps = null } = {}) {
    const PdfIdentity = resolveDep(deps, 'PdfIdentity', 'PdfIdentity', './pdfIdentity.js');
    const DeliverableGate = resolveDep(deps, 'DeliverableGate', 'DeliverableGate', './deliverableGate.js');

    const safeProject = project || {};
    const cfg = safeProject.config || {};
    const pi = cfg.planImage || null;
    const walls = allWalls(safeProject);
    const rooms = allRooms(safeProject);
    const safeMedia = media || { renders: [], images: [], videos: [] };
    const renders = Array.isArray(safeMedia.renders) ? safeMedia.renders : [];
    const images = Array.isArray(safeMedia.images) ? safeMedia.images : [];
    const savedPlanches = Array.isArray(planches) ? planches : [];

    // 1. Plan importé et calibré
    const hasPlanUrl = Boolean(pi && typeof pi.url === 'string' && pi.url.trim());
    const hasCalibrated = Boolean(pi && pi.calibrated === true && Number(pi.pxPerMeter) > 0);
    const controlAlert = Boolean(pi && pi.controlCheck && pi.controlCheck.alert === true);
    const planMissing = [];
    if (!hasPlanUrl) planMissing.push('Aucun plan source importé.');
    if (hasPlanUrl && !hasCalibrated) planMissing.push('Échelle du plan non calibrée sur une cote réelle.');
    if (controlAlert) {
      const pct = Number(pi.controlCheck.errorPct);
      planMissing.push(`Alerte 2ᵉ cote de contrôle (écart ${Number.isFinite(pct) ? pct.toFixed(2) : '> 1'} %).`);
    }
    const planStatus = !hasPlanUrl ? 'todo' : (hasCalibrated && !controlAlert ? 'done' : 'partial');
    const planStep = {
      id: 'plan',
      index: 1,
      label: 'Plan importé et calibré',
      status: planStatus,
      summary: planStatus === 'done'
        ? `Calibré (${Number(pi.pxPerMeter).toFixed(1)} px/m)`
        : planStatus === 'partial'
          ? (hasCalibrated ? 'Calibré mais 2ᵉ cote en alerte' : 'Importé, calibration requise')
          : 'Aucun plan source',
      missing: planMissing
    };

    // 2. Maquette vérifiée
    const hasExtWall = walls.some(w => w && w.type === 'ext');
    const hasDoor = walls.some(w => w && Array.isArray(w.openings) && w.openings.some(o => o && o.type === 'door'));
    const modelMissing = [];
    if (!walls.length) modelMissing.push('Aucun mur tracé.');
    else if (!hasExtWall) modelMissing.push('Aucun mur extérieur identifié.');
    if (!rooms.length) modelMissing.push('Aucune pièce définie.');
    if (walls.length && !hasDoor) modelMissing.push('Aucune porte placée dans la maquette.');
    const modelStatus = !walls.length && !rooms.length
      ? 'todo'
      : (walls.length > 0 && hasExtWall && rooms.length > 0 && hasDoor ? 'done' : 'partial');
    const modelStep = {
      id: 'model',
      index: 2,
      label: 'Maquette vérifiée',
      status: modelStatus,
      summary: modelStatus === 'todo'
        ? 'Maquette vide'
        : `${walls.length} mur(s), ${rooms.length} pièce(s)`,
      missing: modelMissing
    };

    // 3. Vues capturées
    const totalViews = renders.length + images.length;
    const viewsMissing = [];
    if (renders.length === 0 && images.length === 0) viewsMissing.push('Aucune vue 3D capturée (ouvrir la Galerie dans la visite 3D).');
    else if (totalViews < 2) viewsMissing.push('Une seule vue disponible : capturez au moins 2 vues pour illustrer les documents.');
    const viewsStatus = totalViews === 0 ? 'todo' : totalViews >= 2 ? 'done' : 'partial';
    const viewsStep = {
      id: 'views',
      index: 3,
      label: 'Vues capturées',
      status: viewsStatus,
      summary: totalViews
        ? `${renders.length} capture(s) 3D · ${images.length} image(s)`
        : 'Aucune capture enregistrée',
      missing: viewsMissing
    };

    // 4. Rendus IA validés (Porte E)
    const aiRenders = DeliverableGate && typeof DeliverableGate.isAiRender === 'function'
      ? images.filter(img => DeliverableGate.isAiRender(img))
      : images.filter(img => Boolean(img && (img.ai || img.model || /photor/i.test(String(img.id || '')))));
    const aiEvaluations = aiRenders.map(img => {
      const decision = DeliverableGate && typeof DeliverableGate.evaluate === 'function'
        ? DeliverableGate.evaluate(img)
        : { eligible: img?.fidelity?.verdict === 'faithful', reason: 'Contrôle géométrique requis' };
      return { img, decision };
    });
    const blockedAi = aiEvaluations.filter(e => !e.decision.eligible);
    const eligibleAi = aiEvaluations.filter(e => e.decision.eligible);
    const aiMissing = [];
    blockedAi.forEach(e => {
      aiMissing.push(`${e.img.label || e.img.id || 'Rendu IA'} : ${e.decision.reason}`);
    });
    let aiStatus = 'todo';
    let aiSummary = 'En attente de vues';
    if (aiRenders.length > 0) {
      aiStatus = blockedAi.length === 0 ? 'done' : 'partial';
      aiSummary = blockedAi.length === 0
        ? `${eligibleAi.length}/${aiRenders.length} rendu(s) IA conformes (Porte E)`
        : `${blockedAi.length}/${aiRenders.length} rendu(s) IA bloqué(s) par la Porte E`;
    } else if (totalViews > 0) {
      aiStatus = 'done';
      aiSummary = 'Aucun rendu IA en attente (vues 3D locales prêtes)';
    } else {
      aiMissing.push('Aucune vue disponible pour contrôle Porte E.');
    }
    const aiStep = {
      id: 'ai-gate',
      index: 4,
      label: 'Rendus IA validés (Porte E)',
      status: aiStatus,
      summary: aiSummary,
      missing: aiMissing,
      counts: { total: aiRenders.length, eligible: eligibleAi.length, blocked: blockedAi.length }
    };

    // 5. Documents & cartouche
    const idCheck = PdfIdentity && typeof PdfIdentity.missingFields === 'function'
      ? PdfIdentity.missingFields(safeProject, { cabinet })
      : { missing: [], message: '' };
    const docMissing = (idCheck.missing || []).map(f => `Champ cartouche manquant : ${f}`);
    if (modelStatus === 'todo') docMissing.push('La maquette doit contenir des murs et des pièces avant export.');
    const hasSomeMeta = Boolean(
      (safeProject.meta && (safeProject.meta.name || safeProject.meta.architect || safeProject.meta.client)) ||
      (cabinet && (cabinet.name || cabinet.architect))
    );
    const docStatus = modelStatus === 'todo' && !hasSomeMeta
      ? 'todo'
      : (docMissing.length === 0 && modelStatus !== 'todo' ? 'done' : 'partial');
    const docStep = {
      id: 'documents',
      index: 5,
      label: 'Documents & cartouche',
      status: docStatus,
      summary: docMissing.length === 0 && modelStatus !== 'todo'
        ? `Cartouche complet${savedPlanches.length ? ` · ${savedPlanches.length} planche(s) PDF` : ''}`
        : `${idCheck.missing.length} champ(s) cartouche à compléter${savedPlanches.length ? ` · ${savedPlanches.length} planche(s) PDF` : ''}`,
      missing: docMissing,
      missingFields: idCheck.missing || [],
      planchesCount: savedPlanches.length
    };

    const steps = [planStep, modelStep, viewsStep, aiStep, docStep];
    const doneCount = steps.filter(s => s.status === 'done').length;

    const modelReady = walls.length > 0 && rooms.length > 0;
    const documents = [
      {
        id: 'aps',
        label: 'APS Auto (Avant-Projet Sommaire)',
        ready: modelReady,
        missing: modelReady ? idCheck.missing.slice() : ['Tracer les murs et pièces de la maquette.']
      },
      {
        id: 'brochure',
        label: 'Brochure client PDF',
        ready: modelReady,
        missing: [
          ...(modelReady ? [] : ['Maquette incomplète.']),
          ...(totalViews ? [] : ['Capturer des vues 3D pour illustrer la brochure.']),
          ...idCheck.missing
        ]
      },
      {
        id: 'catalog',
        label: 'Catalogue d’intérieurs PDF',
        ready: (renders.length + eligibleAi.length) > 0,
        missing: [
          ...((renders.length + eligibleAi.length) > 0 ? [] : ['Aucune vue 3D ni rendu IA validé Porte E.']),
          ...(blockedAi.length ? [`${blockedAi.length} rendu(s) IA écarté(s) (Porte E).`] : [])
        ]
      },
      {
        id: 'book',
        label: 'Cahier de plans A3',
        ready: modelReady,
        missing: modelReady ? idCheck.missing.slice() : ['Maquette incomplète.']
      },
      {
        id: 'synthesis',
        label: 'Planche de synthèse A3',
        ready: modelReady,
        missing: modelReady ? idCheck.missing.slice() : ['Maquette incomplète.']
      }
    ];

    return {
      projectName: (safeProject.meta && safeProject.meta.name) || 'Projet sans titre',
      doneCount,
      totalSteps: steps.length,
      ready: doneCount === steps.length,
      steps,
      documents
    };
  }

  const STATUS_TEXT = { done: 'Prêt', partial: 'Partiel', todo: 'À faire' };

  /**
   * Rendu DOM sûr du tableau de bord (createElement / textContent uniquement, zéro innerHTML).
   */
  function render(container, state, handlers) {
    if (!container || typeof container.ownerDocument === 'undefined' || !state) return;
    const doc = container.ownerDocument;
    while (container.firstChild) container.removeChild(container.firstChild);
    const onExport = handlers && typeof handlers.onExport === 'function' ? handlers.onExport : null;

    const head = doc.createElement('div');
    head.className = 'dlv-summary';
    const title = doc.createElement('strong');
    title.textContent = `${state.projectName} — ${state.doneCount} / ${state.totalSteps} étapes prêtes`;
    head.appendChild(title);
    container.appendChild(head);

    const stepsList = doc.createElement('ol');
    stepsList.className = 'dlv-steps';
    state.steps.forEach(step => {
      const li = doc.createElement('li');
      li.className = `dlv-step is-${step.status}`;
      li.setAttribute('data-step-id', step.id);
      li.setAttribute('data-step-status', step.status);

      const row = doc.createElement('div');
      row.className = 'dlv-step-head';
      const lbl = doc.createElement('span');
      lbl.className = 'dlv-step-title';
      lbl.textContent = `${step.index}. ${step.label}`;
      const badge = doc.createElement('span');
      badge.className = `dlv-badge is-${step.status}`;
      badge.textContent = STATUS_TEXT[step.status] || step.status;
      row.appendChild(lbl);
      row.appendChild(badge);
      li.appendChild(row);

      const sum = doc.createElement('p');
      sum.className = 'dlv-step-summary';
      sum.textContent = step.summary;
      li.appendChild(sum);

      if (step.missing && step.missing.length) {
        const ul = doc.createElement('ul');
        ul.className = 'dlv-missing';
        step.missing.forEach(msg => {
          const item = doc.createElement('li');
          item.textContent = msg;
          ul.appendChild(item);
        });
        li.appendChild(ul);
      }
      stepsList.appendChild(li);
    });
    container.appendChild(stepsList);

    const docsTitle = doc.createElement('h4');
    docsTitle.className = 'dlv-docs-title';
    docsTitle.textContent = 'Livrables du dossier (5)';
    container.appendChild(docsTitle);

    const docsGrid = doc.createElement('div');
    docsGrid.className = 'dlv-docs-grid';
    state.documents.forEach(d => {
      const card = doc.createElement('div');
      card.className = `dlv-doc-card ${d.ready ? 'is-ready' : 'is-pending'}`;
      card.setAttribute('data-doc-id', d.id);

      const info = doc.createElement('div');
      const name = doc.createElement('strong');
      name.textContent = d.label;
      info.appendChild(name);
      const note = doc.createElement('small');
      note.textContent = d.missing.length ? `À compléter : ${d.missing.join(' · ')}` : 'Prêt pour export';
      info.appendChild(note);
      card.appendChild(info);

      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-toggle btn-small dlv-doc-btn';
      btn.setAttribute('data-deliverable-export', d.id);
      btn.textContent = d.ready ? 'Générer' : 'Ouvrir';
      if (onExport) {
        btn.addEventListener('click', () => onExport(d.id, d, btn));
      }
      card.appendChild(btn);
      docsGrid.appendChild(card);
    });
    container.appendChild(docsGrid);
  }

  async function safeFetchJson(url) {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Charge les sources réelles (cabinet, galerie, planches) et affiche le dialogue Livrables.
   */
  async function openDashboard({ dialogEl, bodyEl, statusEl, slug = '', project = null, cabinet = null, media = null, planches = null, onExport = null } = {}) {
    if (!dialogEl || !bodyEl) return null;
    if (statusEl) statusEl.textContent = 'Analyse de l’état des livrables…';
    if (!dialogEl.open && typeof dialogEl.showModal === 'function') dialogEl.showModal();

    const safeSlug = slug ? encodeURIComponent(slug) : '';
    const [cabData, mediaData, planchesData] = await Promise.all([
      cabinet ? Promise.resolve(cabinet) : safeFetchJson('api/cabinet/profile'),
      media ? Promise.resolve(media) : (safeSlug ? safeFetchJson(`api/gallery/media?project=${safeSlug}`) : Promise.resolve({ renders: [], images: [] })),
      planches ? Promise.resolve(planches) : (safeSlug ? safeFetchJson(`api/projects/${safeSlug}/planches`) : Promise.resolve({ items: [] }))
    ]);

    const state = evaluate({
      project,
      cabinet: cabData || null,
      media: mediaData || { renders: [], images: [] },
      planches: Array.isArray(planchesData) ? planchesData : (planchesData && Array.isArray(planchesData.items) ? planchesData.items : [])
    });
    render(bodyEl, state, { onExport });
    if (statusEl) {
      statusEl.textContent = state.ready
        ? 'Toutes les étapes sont validées : vos 5 livrables sont prêts.'
        : 'Certains points restent à vérifier ou compléter avant remise au client.';
    }
    return state;
  }

  return { evaluate, render, openDashboard };
});
