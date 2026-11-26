/**
 * Outils d'atelier de l'éditeur 2D :
 *  1) Coupes 2D & Plan de toiture vectoriels tirés de la maquette (#dlg-tech-drawings)
 *  2) Annotations & remarques épinglées sur le plan 2D, reliées à la 3D et au portail client (#dlg-annotations)
 *  3) Comparateur de Variantes A / B (#dlg-variants)
 */
(() => {
  const E = window.EditorAPI;
  if (!E) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const numFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const fmtXAF = v => (typeof CostEstimate !== 'undefined' ? CostEstimate.formatXAF(v) : `${Math.round(v)} FCFA`);

  function currentProjectSnapshot() {
    return typeof E.toProjectJson === 'function' ? E.toProjectJson() : {
      meta: E.S.p?.meta || {},
      config: E.S.p?.config || {},
      walls: E.allLevelItems('walls'),
      rooms: E.allLevelItems('rooms'),
      canopies: E.allLevelItems('canopies')
    };
  }

  function activeSlug() {
    const meta = E.S.p?.meta || {};
    const urlSlug = new URLSearchParams(location.search).get('project') || '';
    const candidate = (meta.slug && (meta.slugLocked || meta.slug !== 'nouveau-projet')) ? meta.slug : urlSlug;
    return /^[a-z0-9-]{1,60}$/i.test(candidate) ? candidate.toLowerCase() : '';
  }

  // =========================================================================
  // 1. COUPES 2D & PLAN DE TOITURE (MAQUETTE)
  // =========================================================================
  const dlgTech = $('dlg-tech-drawings');
  const techPreview = $('tech-preview');
  const techMetrics = $('tech-metrics');
  const techCutWrap = $('tech-cut-wrap');
  const techCutRange = $('tech-cut-range');
  const techCutVal = $('tech-cut-val');
  let techMode = 'roof';
  let techLastSvg = '';

  function renderTechDrawing() {
    if (!dlgTech || !techPreview || typeof TechnicalDrawings === 'undefined') return;
    const snap = currentProjectSnapshot();
    const tabs = [...dlgTech.querySelectorAll('[data-tech-mode]')];
    tabs.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.techMode === techMode)));

    if (techMode === 'roof') {
      if (techCutWrap) techCutWrap.hidden = true;
      const roof = TechnicalDrawings.computeRoofPlan(snap);
      techLastSvg = TechnicalDrawings.renderRoofPlanSVG(snap);
      techPreview.innerHTML = techLastSvg;
      if (techMetrics) {
        techMetrics.textContent = roof.valid
          ? `${roof.typeLabel} · Emprise ${numFr.format(roof.outer.w)} × ${numFr.format(roof.outer.d)} m · Pente ${numFr.format(roof.slopePercent)} % · Faîtage +${numFr.format(roof.ridgeY)} m · Surface couverture ${numFr.format(roof.roofArea)} m²`
          : roof.reason;
      }
      return;
    }

    const axis = techMode === 'section-aa' ? 'x' : 'z';
    const label = axis === 'x' ? 'Coupe longitudinale A–A' : 'Coupe transversale B–B';
    const baseSec = TechnicalDrawings.computeSection(snap, { axis, label });
    if (techCutWrap && techCutRange && baseSec.valid) {
      techCutWrap.hidden = false;
      const roof = TechnicalDrawings.computeRoofPlan(snap);
      const minC = axis === 'x' ? roof.footprint.zMin : roof.footprint.xMin;
      const maxC = axis === 'x' ? roof.footprint.zMax : roof.footprint.xMax;
      techCutRange.min = String(minC);
      techCutRange.max = String(maxC);
      if (techCutRange.dataset.axis !== axis) {
        techCutRange.dataset.axis = axis;
        techCutRange.value = String(baseSec.cutPos);
      }
      const pos = Number(techCutRange.value);
      const sec = TechnicalDrawings.computeSection(snap, { axis, position: pos, label });
      techLastSvg = TechnicalDrawings.renderSectionSVG(snap, { axis, position: pos, label });
      techPreview.innerHTML = techLastSvg;
      if (techCutVal) techCutVal.textContent = `${axis === 'x' ? 'z' : 'x'} = ${numFr.format(pos)} m`;
      if (techMetrics) {
        techMetrics.textContent = `${sec.label} · ${sec.cutWalls.length} mur(s) coupé(s) · ${sec.cutRooms.length} pièce(s) traversée(s) · HSP ${numFr.format(sec.wallH)} m · Intégré automatiquement au Cahier A3 si aucune planche importée.`;
      }
    } else {
      techLastSvg = TechnicalDrawings.renderSectionSVG(snap, { axis, label });
      techPreview.innerHTML = techLastSvg;
      if (techMetrics) techMetrics.textContent = baseSec.reason || '';
    }
  }

  if (dlgTech) {
    dlgTech.querySelectorAll('[data-tech-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        techMode = btn.dataset.techMode || 'roof';
        renderTechDrawing();
      });
    });
    techCutRange?.addEventListener('input', renderTechDrawing);
    $('tech-download-svg')?.addEventListener('click', () => {
      if (!techLastSvg) return;
      const slug = activeSlug() || 'projet';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([techLastSvg], { type: 'image/svg+xml;charset=utf-8' }));
      link.download = `${slug}-${techMode}.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      E.toast('Planche vectorielle téléchargée (SVG)');
    });
    $('tech-close')?.addEventListener('click', () => dlgTech.close());
    $('btn-tech-drawings')?.addEventListener('click', () => {
      renderTechDrawing();
      dlgTech.showModal();
    });
  }

  // =========================================================================
  // 2. ANNOTATIONS ÉPINGLÉES 2D ↔ 3D ↔ PORTAIL CLIENT
  // =========================================================================
  const dlgAnn = $('dlg-annotations');
  const annSelect = $('ann-channel-select');
  const annStatus = $('ann-status');
  const annList = $('ann-list');
  const annForm = $('ann-compose-form');
  const annTargetLabel = $('ann-target-label');
  const annText = $('ann-text');
  const annState = {
    channel: '',
    channels: [],
    notes: [],
    selectedId: '',
    draft: null,
    showPins: true
  };

  function channelStorageKey() {
    return `plan3d:retours:v1:${activeSlug()}`;
  }

  function randomChannelToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function roomAtWorld(x, z, level) {
    const rooms = E.allLevelItems('rooms').filter(r => (Number(r.level) || 0) === level);
    for (const r of rooms) {
      if (Array.isArray(r.poly) && r.poly.length >= 3) {
        let inside = false;
        for (let i = 0, j = r.poly.length - 1; i < r.poly.length; j = i++) {
          const xi = r.poly[i][0], zi = r.poly[i][1], xj = r.poly[j][0], zj = r.poly[j][1];
          if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi)) inside = !inside;
        }
        if (inside) return r;
      } else if (r.bounds && x >= r.bounds.xMin && x <= r.bounds.xMax && z >= r.bounds.zMin && z <= r.bounds.zMax) {
        return r;
      }
    }
    return null;
  }

  async function loadFeedbackChannels(preferredChannel = '') {
    const slug = activeSlug();
    if (!slug) {
      if (annStatus) annStatus.textContent = 'Enregistrez d’abord le projet pour activer les annotations partagées.';
      annState.notes = [];
      E.draw();
      return;
    }
    try {
      const res = await fetch(`api/client-feedback?project=${encodeURIComponent(slug)}&list=1`, { cache: 'no-store' });
      const body = res.ok ? await res.json() : { channels: [] };
      annState.channels = Array.isArray(body.channels) ? body.channels : [];
      let stored = '';
      try { stored = localStorage.getItem(channelStorageKey()) || ''; } catch { /* ignore */ }
      const target = preferredChannel || annState.channel || stored || annState.channels[0]?.channel || '';
      if (annSelect) {
        annSelect.replaceChildren();
        if (!annState.channels.length && target) {
          annSelect.add(new Option(`Dossier actif (${target.slice(0, 8)}…)`, target));
        } else if (!annState.channels.length) {
          annSelect.add(new Option('Aucun dossier de remarques', ''));
        } else {
          annState.channels.forEach((ch, idx) => {
            const label = `Dossier #${idx + 1} · ${ch.total} remarque(s) (${ch.open} à traiter)`;
            annSelect.add(new Option(label, ch.channel));
          });
          if (target && !annState.channels.some(c => c.channel === target)) {
            annSelect.add(new Option(`Nouveau dossier (${target.slice(0, 8)}…)`, target));
          }
        }
        annSelect.value = target;
      }
      if (target) {
        annState.channel = target;
        try { localStorage.setItem(channelStorageKey(), target); } catch { /* ignore */ }
        await loadFeedbackNotes(target);
      } else {
        annState.channel = '';
        annState.notes = [];
        renderAnnotationsList();
        E.draw();
      }
    } catch (err) {
      if (annStatus) annStatus.textContent = err.message || 'Impossible de charger les dossiers de remarques.';
    }
  }

  async function loadFeedbackNotes(channel) {
    const slug = activeSlug();
    if (!slug || !channel) return;
    const res = await fetch(`api/client-feedback?project=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
      headers: { 'X-Feedback-Channel': channel }
    });
    if (!res.ok) {
      if (annStatus) annStatus.textContent = 'Impossible de lire les remarques de ce dossier.';
      return;
    }
    const { notes } = await res.json();
    annState.notes = Array.isArray(notes) ? notes : [];
    if (annStatus) {
      const openCount = annState.notes.filter(n => (n.status || 'open') === 'open').length;
      annStatus.textContent = `${annState.notes.length} remarque(s) synchronisée(s) avec la 3D et le portail client · ${openCount} à traiter.`;
    }
    renderAnnotationsList();
    E.draw();
  }

  function focusAnnotationOnPlan(note) {
    annState.selectedId = note.id;
    const level = Number.isInteger(note.level) ? note.level : 0;
    if (E.S.activeLevel !== level) E.switchLevel(level);
    if (Array.isArray(note.point) && note.point.length >= 3) {
      E.focusWorldPoint(note.point[0], note.point[2]);
    }
    // Sélectionne la pièce ou le mur lié si trouvé
    const rooms = E.S.p?.rooms || [];
    const matchedRoom = note.room ? rooms.find(r => r.id === note.room) : null;
    if (matchedRoom) E.select({ kind: 'room', obj: matchedRoom });
    else if (note.wallId) {
      const m = /^wall-(\d+)$/.exec(note.wallId);
      const wallObj = m ? E.allLevelItems('walls')[Number(m[1])] : null;
      if (wallObj && (Number(wallObj.level) || 0) === level) E.select({ kind: 'wall', obj: wallObj });
    }
    E.draw();
  }

  function renderAnnotationsList() {
    if (!annList) return;
    annList.replaceChildren();
    if (!annState.notes.length) {
      const p = document.createElement('p');
      p.className = 'ed-note';
      p.textContent = annState.channel
        ? 'Aucune remarque dans ce dossier. Activez l’outil Annotations (N) et cliquez sur une pièce ou un mur.'
        : 'Créez un dossier de remarques ou sélectionnez-en un pour épingler des commentaires partagés.';
      annList.append(p);
      return;
    }
    const statusLabels = { open: 'À traiter', answered: 'Répondu', closed: 'Clos' };
    annState.notes.forEach((note, idx) => {
      const card = document.createElement('article');
      card.className = `ed-ann-card is-${note.status || 'open'}${note.id === annState.selectedId ? ' is-selected' : ''}`;
      const room = E.allLevelItems('rooms').find(r => r.id === note.room);
      const head = document.createElement('div');
      head.className = 'ed-ann-head';
      const title = document.createElement('strong');
      const lvLabel = (note.level || 0) === 0 ? 'RDC' : `R+${note.level}`;
      title.textContent = `#${idx + 1} · ${room?.name || 'Hors pièce'}${note.wallLabel ? ` · ${note.wallLabel}` : ''} (${lvLabel})`;
      const st = document.createElement('span');
      st.className = 'ed-ann-state';
      st.textContent = `${statusLabels[note.status] || 'À traiter'} · ${note.source === '2d' ? 'Plan 2D' : 'Visite 3D'}`;
      head.append(title, st);

      const body = document.createElement('p');
      body.className = 'ed-ann-body';
      body.textContent = note.text;

      const actions = document.createElement('div');
      actions.className = 'ed-ann-actions';
      const locBtn = document.createElement('button');
      locBtn.type = 'button';
      locBtn.textContent = 'Localiser sur le plan';
      locBtn.onclick = () => { dlgAnn?.close(); focusAnnotationOnPlan(note); };
      actions.append(locBtn);

      const replyBox = document.createElement('details');
      replyBox.className = 'ed-ann-reply';
      const sum = document.createElement('summary');
      sum.textContent = note.reply ? `Réponse architecte : ${note.reply}` : 'Répondre / changer le statut';
      const rForm = document.createElement('form');
      const rText = document.createElement('textarea');
      rText.rows = 2;
      rText.maxLength = 1000;
      rText.placeholder = 'Réponse de l’architecte…';
      rText.value = note.reply || '';
      const rSel = document.createElement('select');
      Object.entries(statusLabels).forEach(([k, v]) => rSel.add(new Option(v, k)));
      rSel.value = note.status || 'open';
      const rSave = document.createElement('button');
      rSave.type = 'submit';
      rSave.className = 'ed-primary';
      rSave.textContent = 'Enregistrer';
      rForm.append(rText, rSel, rSave);
      rForm.onsubmit = async ev => {
        ev.preventDefault();
        const slug = activeSlug();
        if (!slug || !annState.channel) return;
        rSave.disabled = true;
        try {
          const res = await fetch(`api/client-feedback?project=${encodeURIComponent(slug)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Feedback-Channel': annState.channel },
            body: JSON.stringify({ id: note.id, revision: note.revision ?? 0, status: rSel.value, reply: rText.value })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Erreur de mise à jour');
          annState.notes = annState.notes.map(n => n.id === data.item.id ? data.item : n);
          renderAnnotationsList();
          E.draw();
          E.toast('Suivi de remarque enregistré');
        } catch (err) {
          E.toast(err.message || 'Échec de mise à jour', true);
        } finally {
          rSave.disabled = false;
        }
      };
      replyBox.append(sum, rForm);
      card.append(head, body, actions, replyBox);
      annList.append(card);
    });
  }

  // Rendu des repères épinglés directement sur le canvas 2D
  E.addOverlayRenderer((ctx, toScreen, S) => {
    if (!annState.showPins || !annState.notes.length) return;
    const colors = { open: '#B38646', answered: '#2E6F51', closed: '#6E7470' };
    annState.notes.forEach((note, idx) => {
      if ((Number(note.level) || 0) !== (Number(S.activeLevel) || 0)) return;
      if (!Array.isArray(note.point) || note.point.length < 3) return;
      const p = toScreen(note.point[0], note.point[2]);
      const isSel = note.id === annState.selectedId;
      const fill = colors[note.status] || colors.open;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSel ? 12 : 9.5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), p.x, p.y + 0.5);
      ctx.restore();
    });
  });

  // Clic sur le canvas : soit sélectionner un repère existant, soit poser un nouveau repère avec l'outil 'annotate'
  E.addCanvasClickHandler((P) => {
    if (annState.showPins && annState.notes.length && E.S.tool === 'select') {
      for (const note of annState.notes) {
        if ((Number(note.level) || 0) !== (Number(E.S.activeLevel) || 0)) continue;
        if (!Array.isArray(note.point) || note.point.length < 3) continue;
        const sc = E.toScreen(note.point[0], note.point[2]);
        if (Math.hypot(sc.x - P.screen.x, sc.y - P.screen.y) <= 13) {
          annState.selectedId = note.id;
          renderAnnotationsList();
          E.draw();
          dlgAnn?.showModal();
          return true;
        }
      }
    }
    if (E.S.tool !== 'annotate') return false;
    const slug = activeSlug();
    if (!slug) { E.toast('Enregistrez le projet avant d’épingler une remarque.', true); return true; }
    if (!annState.channel) {
      annState.channel = randomChannelToken();
      try { localStorage.setItem(channelStorageKey(), annState.channel); } catch { /* ignore */ }
    }
    const lv = Number(E.S.activeLevel) || 0;
    const floorH = Number(E.S.p?.config?.floorHeight) || 3;
    const y = Math.round((lv * floorH + 1.4) * 100) / 100;
    const room = roomAtWorld(P.world.x, P.world.z, lv);
    const nw = E.nearestWall(P.world, 0.55);
    let wallId = '', wallLabel = '';
    if (nw?.w) {
      const idx = E.allLevelItems('walls').indexOf(nw.w);
      wallId = nw.w.id || (idx >= 0 ? `wall-${idx}` : '');
      wallLabel = `${nw.w.type === 'ext' ? 'Mur extérieur' : 'Cloison'} #${idx + 1}`;
    }
    annState.draft = {
      point: [E.r2(P.world.x), y, E.r2(P.world.z)],
      pose: { p: [E.r2(P.world.x), y + 4.5, E.r2(P.world.z + 5)], q: [0, 0, 0, 1], f: 50, e: 1, cut: false, exploded: false, ceilings: false, overlay: null },
      room: room?.id || '',
      wallId,
      wallLabel,
      level: lv,
      source: '2d'
    };
    if (annTargetLabel) {
      annTargetLabel.textContent = [room?.name || 'Hors pièce', wallLabel || null, lv === 0 ? 'RDC' : `R+${lv}`].filter(Boolean).join(' · ');
    }
    if (annForm) annForm.hidden = false;
    dlgAnn?.showModal();
    annText?.focus();
    return true;
  });

  if (dlgAnn) {
    annSelect?.addEventListener('change', () => {
      annState.channel = annSelect.value;
      if (annState.channel) {
        try { localStorage.setItem(channelStorageKey(), annState.channel); } catch { /* ignore */ }
        void loadFeedbackNotes(annState.channel);
      }
    });
    $('ann-new-dossier')?.addEventListener('click', () => {
      const token = randomChannelToken();
      void loadFeedbackChannels(token);
      E.toast('Nouveau dossier de remarques créé');
    });
    $('ann-copy-link')?.addEventListener('click', async () => {
      const slug = activeSlug();
      if (!slug || !annState.channel) { E.toast('Créez d’abord un dossier de remarques.', true); return; }
      const shareUrl = `${location.origin}${location.pathname.replace(/editor\.html$/, '')}index.html?project=${encodeURIComponent(slug)}#retours=${annState.channel}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        E.toast('Lien de remarques copié (visite 3D & portail client)');
      } catch {
        if (annStatus) annStatus.textContent = `Lien partageable : ${shareUrl}`;
      }
    });
    $('ann-place-pin')?.addEventListener('click', () => {
      dlgAnn.close();
      E.setTool('annotate');
      E.toast('Cliquez sur une pièce ou un mur du plan 2D pour épingler votre remarque.');
    });
    annForm?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const slug = activeSlug();
      const text = (annText?.value || '').trim();
      if (!slug || !annState.channel || !annState.draft || !text) return;
      const submitBtn = $('ann-submit');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(`api/client-feedback?project=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Feedback-Channel': annState.channel },
          body: JSON.stringify({ ...annState.draft, text })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Impossible d’enregistrer la remarque.');
        annState.draft = null;
        if (annText) annText.value = '';
        if (annForm) annForm.hidden = true;
        await loadFeedbackChannels(annState.channel);
        E.toast('Remarque épinglée sur le plan 2D et synchronisée en 3D');
      } catch (err) {
        E.toast(err.message || 'Échec de l’enregistrement', true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    $('ann-close')?.addEventListener('click', () => dlgAnn.close());
    $('btn-annotations')?.addEventListener('click', () => {
      void loadFeedbackChannels();
      dlgAnn.showModal();
    });
    setTimeout(() => { if (activeSlug()) void loadFeedbackChannels(); }, 600);
  }

  // =========================================================================
  // 3. COMPARATEUR DE VARIANTES A / B
  // =========================================================================
  const dlgVar = $('dlg-variants');
  const varStatus = $('var-status');
  const varGrid = $('var-compare-grid');
  let variantsCache = { A: null, B: null };

  async function refreshVariants() {
    const slug = activeSlug();
    if (!slug) {
      if (varStatus) varStatus.textContent = 'Enregistrez d’abord le projet pour mémoriser des variantes A / B.';
      if (varGrid) varGrid.replaceChildren();
      return;
    }
    try {
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/variants`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Impossible de charger les variantes.');
      variantsCache = data.variants || { A: null, B: null };
      renderVariantsUI();
    } catch (err) {
      if (varStatus) varStatus.textContent = err.message || 'Variantes indisponibles.';
    }
  }

  async function saveSlot(slot) {
    const slug = activeSlug();
    if (!slug) { E.toast('Enregistrez d’abord le projet.', true); return; }
    const labelInput = $(`var-label-${slot.toLowerCase()}`);
    const floorInput = $(`var-floor-${slot.toLowerCase()}`);
    const facadeInput = $(`var-facade-${slot.toLowerCase()}`);
    const payload = {
      slot,
      label: (labelInput?.value || '').trim() || `Variante ${slot}`,
      materials: {
        floor: floorInput?.value || '',
        facade: facadeInput?.value || '',
        roofType: E.S.p?.estimate?.roofType || E.S.p?.config?.roof?.type || ''
      },
      snapshot: currentProjectSnapshot()
    };
    const res = await fetch(`api/projects/${encodeURIComponent(slug)}/variants/${slot}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { E.toast(data?.error || 'Échec d’enregistrement', true); return; }
    variantsCache[slot] = data.item;
    renderVariantsUI();
    E.toast(`Variante ${slot} enregistrée`);
  }

  function loadSlotIntoEditor(slot) {
    const item = variantsCache[slot];
    if (!item?.snapshot) return;
    E.commit();
    E.loadProject(JSON.parse(JSON.stringify(item.snapshot)));
    E.toast(`Variante ${slot} (« ${item.label} ») chargée dans l’éditeur`);
    dlgVar?.close();
  }

  function renderVariantsUI() {
    if (!varGrid || typeof VariantComparator === 'undefined') return;
    const A = variantsCache.A;
    const B = variantsCache.B;
    for (const slot of ['A', 'B']) {
      const item = variantsCache[slot];
      const lbl = $(`var-label-${slot.toLowerCase()}`);
      const flr = $(`var-floor-${slot.toLowerCase()}`);
      const fac = $(`var-facade-${slot.toLowerCase()}`);
      const loadBtn = $(`var-load-${slot.toLowerCase()}`);
      if (lbl && item?.label) lbl.value = item.label;
      if (flr && item?.materials?.floor !== undefined) flr.value = item.materials.floor;
      if (fac && item?.materials?.facade !== undefined) fac.value = item.materials.facade;
      if (loadBtn) loadBtn.disabled = !item;
    }

    if (!A && !B) {
      if (varStatus) varStatus.textContent = 'Enregistrez l’état actuel en Variante A, modifiez votre plan ou vos finitions, puis enregistrez en Variante B pour comparer.';
      varGrid.innerHTML = '';
      return;
    }

    const renderCard = (slot, item) => {
      if (!item) {
        return `<div class="ed-var-card is-empty"><h4>Variante ${slot}</h4><p class="ed-note">Aucun instantané enregistré sur cet emplacement.</p></div>`;
      }
      const s = VariantComparator.summarize(item);
      return `<div class="ed-var-card">
        <h4>Variante ${slot} — ${esc(s.label)}</h4>
        <div class="ed-var-svg">${VariantComparator.miniPlanSVG(item)}</div>
        <dl class="ed-var-kpis">
          <div><dt>Habitable</dt><dd>${numFr.format(s.habitable)} m²</dd></div>
          <div><dt>Annexes</dt><dd>${numFr.format(s.annexes)} m²</dd></div>
          <div><dt>Ouvertures</dt><dd>${s.openingsCount}</dd></div>
          <div><dt>Finitions</dt><dd>${esc(s.materials.floor)} / ${esc(s.materials.facade)}</dd></div>
          <div><dt>Estimation</dt><dd>${fmtXAF(s.budgetLow)} – ${fmtXAF(s.budgetHigh)}</dd></div>
        </dl>
      </div>`;
    };

    let diffHtml = '';
    if (A && B) {
      const cmp = VariantComparator.compare(A, B);
      const sign = v => (v > 0 ? `+${numFr.format(v)}` : numFr.format(v));
      const signMoney = v => (v > 0 ? `+${fmtXAF(v)}` : (v < 0 ? `-${fmtXAF(Math.abs(v))}` : '0 FCFA'));
      const changedRooms = cmp.roomDiff.filter(r => r.status !== 'unchanged');
      diffHtml = `<div class="ed-var-diff">
        <h4>Écarts Variante B par rapport à Variante A</h4>
        <table class="ed-est-table">
          <thead><tr><th>Critère</th><th>Variante A</th><th>Variante B</th><th>Écart</th></tr></thead>
          <tbody>
            <tr><th>Surface habitable</th><td>${numFr.format(cmp.a.habitable)} m²</td><td>${numFr.format(cmp.b.habitable)} m²</td><td>${sign(cmp.deltas.habitable)} m² (${sign(cmp.deltas.habitablePct)} %)</td></tr>
            <tr><th>Annexes</th><td>${numFr.format(cmp.a.annexes)} m²</td><td>${numFr.format(cmp.b.annexes)} m²</td><td>${sign(cmp.deltas.annexes)} m²</td></tr>
            <tr><th>Budget bas</th><td>${fmtXAF(cmp.a.budgetLow)}</td><td>${fmtXAF(cmp.b.budgetLow)}</td><td>${signMoney(cmp.deltas.budgetLow)} (${sign(cmp.deltas.budgetPct)} %)</td></tr>
            <tr><th>Budget haut</th><td>${fmtXAF(cmp.a.budgetHigh)}</td><td>${fmtXAF(cmp.b.budgetHigh)}</td><td>${signMoney(cmp.deltas.budgetHigh)}</td></tr>
          </tbody>
        </table>
        ${changedRooms.length ? `<p class="ed-note"><strong>Pièces modifiées :</strong> ${changedRooms.map(r => `${esc(r.name)} (${r.status === 'added' ? `+${numFr.format(r.areaB)} m² ajoutée` : r.status === 'removed' ? `-${numFr.format(r.areaA)} m² supprimée` : `${sign(r.delta)} m²`})`).join(' · ')}</p>` : '<p class="ed-note">Aucune différence de surface entre les pièces.</p>'}
        ${cmp.materialChanges.length ? `<p class="ed-note"><strong>Finitions :</strong> ${cmp.materialChanges.map(m => `${esc(m.label)} : ${esc(m.a)} → ${esc(m.b)}`).join(' · ')}</p>` : ''}
      </div>`;
      if (varStatus) varStatus.textContent = 'Comparaison A / B prête : surfaces, pièces, finitions et enveloppe FCFA calculées depuis les plans exacts.';
    } else if (varStatus) {
      varStatus.textContent = 'Enregistrez la seconde variante pour afficher le tableau comparatif complet.';
    }

    varGrid.innerHTML = `<div class="ed-var-pair">${renderCard('A', A)}${renderCard('B', B)}</div>${diffHtml}`;
  }

  if (dlgVar) {
    $('var-save-a')?.addEventListener('click', () => { void saveSlot('A'); });
    $('var-save-b')?.addEventListener('click', () => { void saveSlot('B'); });
    $('var-load-a')?.addEventListener('click', () => loadSlotIntoEditor('A'));
    $('var-load-b')?.addEventListener('click', () => loadSlotIntoEditor('B'));
    $('var-close')?.addEventListener('click', () => dlgVar.close());
    $('btn-variants')?.addEventListener('click', () => {
      void refreshVariants();
      dlgVar.showModal();
    });
  }
})();
