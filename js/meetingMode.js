/**
 * Mode « Réunion client » (plein écran / iPad) sur la page projet (accueil.html).
 * Masque les outils techniques et enchaîne 6 chapitres fluides devant le maître d'ouvrage :
 * 1. Façade & Esprit · 2. Plans & Surfaces · 3. Visite 3D · 4. Film réaliste HD · 5. Estimation FCFA · 6. Validation.
 */
(() => {
  'use strict';

  const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtXAF = n => `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)).replace(/\u202f/g, ' ')} FCFA`;

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function createDialog() {
    let dlg = document.getElementById('meeting-deck');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'meeting-deck';
    dlg.className = 'meeting-deck';
    dlg.setAttribute('aria-label', 'Mode Réunion client');
    dlg.innerHTML = `
      <header class="meeting-bar">
        <div class="meeting-brand">
          <span class="meeting-kicker" id="meeting-cabinet">ARCHICAM STUDIO · RÉUNION CLIENT</span>
          <strong id="meeting-project-title">Projet</strong>
        </div>
        <nav class="meeting-tabs" id="meeting-tabs" role="tablist" aria-label="Chapitres de la présentation"></nav>
        <div class="meeting-controls">
          <button type="button" id="meeting-fs" title="Plein écran">⤢ Plein écran</button>
          <button type="button" id="meeting-close" aria-label="Quitter le mode réunion">Quitter ×</button>
        </div>
      </header>
      <div class="meeting-stage" id="meeting-stage"></div>
      <footer class="meeting-foot">
        <button type="button" id="meeting-prev">← Précédent</button>
        <span class="meeting-counter" id="meeting-counter">01 / 06</span>
        <button type="button" id="meeting-next">Suivant →</button>
      </footer>
    `;
    document.body.append(dlg);
    return dlg;
  }

  function buildSlides({ project, media, slug, cabinet }) {
    const meta = project?.meta || {};
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const hab = rooms.filter(r => r.habitable !== false).reduce((s, r) => s + (Number(r.area) || 0), 0);
    const ann = rooms.filter(r => r.habitable === false).reduce((s, r) => s + (Number(r.area) || 0), 0);
    const maxLevel = rooms.reduce((m, r) => Math.max(m, Number(r.level) || 0), 0);
    const images = Array.isArray(media?.images) ? media.images : [];
    const renders = Array.isArray(media?.renders) ? media.renders : [];
    const videos = Array.isArray(media?.videos) ? media.videos : [];
    const heroImg = images.find(i => i.cover && i.file)?.file
      || images.find(i => /perspective-01/i.test(i.id || i.file || ''))?.file
      || renders[0]?.file || '';
    const planImg = project?.edition?.sheets?.[0]?.preview
      || project?.config?.planImage?.url
      || images.find(i => /plan-2d/i.test(i.id || ''))?.file || '';
    const galleryShots = [...images.filter(i => i.catalog && i.file), ...renders.filter(r => r.file)].slice(0, 4);
    const heroVideo = [...videos].reverse().find(v => /film-realiste/i.test(v.id || '') || /FFmpeg/i.test(v.generator || '')) || videos[videos.length - 1] || null;
    const est = typeof CostEstimate !== 'undefined' && rooms.length ? CostEstimate.estimate(project, project.estimate || {}) : null;
    const safeSlug = encodeURIComponent(slug || meta.slug || '');

    return [
      {
        id: 'facade',
        tab: '01 · Façade',
        render: () => `
          <div class="meeting-split">
            <div class="meeting-visual">
              ${heroImg ? `<img src="${esc(heroImg)}" alt="${esc(meta.name || 'Façade')}">` : `<div class="meeting-placeholder">${esc(meta.name || 'Projet')}</div>`}
            </div>
            <div class="meeting-copy">
              <p class="meeting-eyebrow">${esc(meta.phase || 'AVANT-PROJET')} ${meta.location ? `· ${esc(meta.location)}` : ''}</p>
              <h2>${esc(meta.name || 'Projet architectural')}</h2>
              <p class="meeting-lead">${esc(meta.subtitle || meta.description || 'Présentation architecturale du dossier.')}</p>
              <dl class="meeting-kpis">
                <div><dt>Surface habitable</dt><dd>${nf.format(hab)} m²</dd></div>
                <div><dt>Annexes &amp; vérandas</dt><dd>${nf.format(ann)} m²</dd></div>
                <div><dt>Niveaux</dt><dd>${maxLevel === 0 ? 'Plain-pied' : `R+${maxLevel}`}</dd></div>
                <div><dt>Espaces</dt><dd>${rooms.length} pièces</dd></div>
              </dl>
              ${meta.client ? `<p class="meeting-credit">Maître d’ouvrage : <strong>${esc(meta.client)}</strong></p>` : ''}
              <p class="meeting-credit">Maîtrise d’œuvre : <strong>${esc(cabinet?.name || meta.agency || 'ArchiCam Studio')}</strong></p>
            </div>
          </div>`
      },
      {
        id: 'plans',
        tab: '02 · Plans & Surfaces',
        render: () => `
          <div class="meeting-split">
            <div class="meeting-visual meeting-visual-paper">
              ${planImg ? `<img src="${esc(planImg)}" alt="Plan d’architecture">` : `<div class="meeting-placeholder">Plan des niveaux</div>`}
            </div>
            <div class="meeting-copy meeting-scroll">
              <p class="meeting-eyebrow">PROGRAMME ARCHITECTURAL</p>
              <h2>Surfaces pièce par pièce</h2>
              <table class="meeting-table">
                <thead><tr><th>Pièce</th><th>Niveau</th><th>Surface</th></tr></thead>
                <tbody>
                  ${rooms.slice(0, 14).map(r => `<tr><td>${esc(r.name)}</td><td>${(Number(r.level) || 0) === 0 ? 'RDC' : `R+${r.level}`}</td><td>${nf.format(Number(r.area) || 0)} m²</td></tr>`).join('')}
                </tbody>
              </table>
              ${rooms.length > 14 ? `<p class="meeting-note">+ ${rooms.length - 14} autres espaces détaillés dans le cahier de plans.</p>` : ''}
            </div>
          </div>`
      },
      {
        id: '3d',
        tab: '03 · Visite 3D',
        render: () => `
          <div class="meeting-center">
            <p class="meeting-eyebrow">MAQUETTE 3D &amp; AMBIANCES</p>
            <h2>Explorer les volumes en temps réel</h2>
            <div class="meeting-thumbs">
              ${galleryShots.length
                ? galleryShots.map(s => `<figure><img src="${esc(s.preview || s.file)}" alt="${esc(s.label || '')}"><figcaption>${esc(s.label || '')}</figcaption></figure>`).join('')
                : '<p class="meeting-note">Ouvrez directement la visite 3D interactive pour parcourir la maison.</p>'}
            </div>
            <div class="meeting-cta-row">
              <a class="meeting-primary" href="index.html?project=${safeSlug}">Ouvrir la visite 3D interactive ↗</a>
              <a class="meeting-secondary" href="editor.html?project=${safeSlug}">Ouvrir le plan 2D</a>
            </div>
          </div>`
      },
      {
        id: 'film',
        tab: '04 · Film HD',
        render: () => `
          <div class="meeting-center">
            <p class="meeting-eyebrow">PRÉSENTATION VIDÉO</p>
            <h2>${esc(heroVideo?.label || 'Film réaliste d’architecture')}</h2>
            ${heroVideo
              ? `<div class="meeting-video-box"><video id="meeting-video" src="${esc(heroVideo.file)}" poster="${esc(heroVideo.poster || heroImg)}" controls playsinline></video></div>`
              : `<p class="meeting-note">Aucun film HD généré pour ce projet. Lancez « Film réaliste (MP4) » depuis la Galerie des vues de la visite 3D.</p>
                 <div class="meeting-cta-row"><a class="meeting-primary" href="index.html?project=${safeSlug}">Ouvrir la galerie 3D ↗</a></div>`}
          </div>`
      },
      {
        id: 'budget',
        tab: '05 · Estimation',
        render: () => `
          <div class="meeting-center meeting-scroll">
            <p class="meeting-eyebrow">ENVELOPPE PRÉVISIONNELLE</p>
            <h2>${est ? `${fmtXAF(est.total.low)} – ${fmtXAF(est.total.high)}` : 'Estimation non calculée'}</h2>
            ${est ? `
              <p class="meeting-note">${esc(est.rate?.label || '')} · ${nf.format(est.reference)} m² de référence · Indication non contractuelle.</p>
              <table class="meeting-table meeting-table-wide">
                <thead><tr><th>Lot de travaux</th><th>Fourchette basse</th><th>Fourchette haute</th></tr></thead>
                <tbody>
                  ${est.lots.map(l => `<tr><td>${esc(l.label)}</td><td>${fmtXAF(l.low)}</td><td>${fmtXAF(l.high)}</td></tr>`).join('')}
                </tbody>
              </table>
            ` : '<p class="meeting-note">Dessinez au moins une pièce pour calculer l’enveloppe travaux.</p>'}
          </div>`
      },
      {
        id: 'decision',
        tab: '06 · Validation',
        render: () => `
          <div class="meeting-center">
            <p class="meeting-eyebrow">VALIDATION &amp; LIVRABLES</p>
            <h2>Décision du maître d’ouvrage</h2>
            <p class="meeting-lead">À l’issue de cette présentation, téléchargez les livrables de l’agence ou passez à la validation formelle du dossier.</p>
            <div class="meeting-cta-row">
              <button type="button" class="meeting-primary" id="meeting-export-apd">Télécharger le dossier APD / Permis (PDF)</button>
              <a class="meeting-secondary" href="portal.html">Ouvrir le portail de validation client ↗</a>
              <a class="meeting-secondary" href="index.html?project=${safeSlug}">Poursuivre en visite 3D</a>
            </div>
            <p class="meeting-note" id="meeting-decision-status" role="status"></p>
          </div>`
      }
    ];
  }

  let currentCtx = null;
  let slides = [];
  let idx = 0;

  function open(ctx) {
    currentCtx = ctx;
    const dlg = createDialog();
    slides = buildSlides(ctx);
    idx = 0;

    const titleEl = dlg.querySelector('#meeting-project-title');
    const cabEl = dlg.querySelector('#meeting-cabinet');
    const tabsEl = dlg.querySelector('#meeting-tabs');
    const stageEl = dlg.querySelector('#meeting-stage');
    const counterEl = dlg.querySelector('#meeting-counter');
    const prevBtn = dlg.querySelector('#meeting-prev');
    const nextBtn = dlg.querySelector('#meeting-next');
    const fsBtn = dlg.querySelector('#meeting-fs');
    const closeBtn = dlg.querySelector('#meeting-close');

    titleEl.textContent = ctx.project?.meta?.name || ctx.slug || 'Projet';
    cabEl.textContent = `${(ctx.cabinet?.name || ctx.project?.meta?.agency || 'ArchiCam Studio').toUpperCase()} · RÉUNION CLIENT`;

    const show = (nextIdx) => {
      const oldVid = stageEl.querySelector('video');
      if (oldVid) oldVid.pause();
      idx = Math.max(0, Math.min(slides.length - 1, nextIdx));
      stageEl.innerHTML = slides[idx].render();
      counterEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === slides.length - 1;
      [...tabsEl.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
      const apdBtn = stageEl.querySelector('#meeting-export-apd');
      if (apdBtn) {
        apdBtn.onclick = async () => {
          const st = stageEl.querySelector('#meeting-decision-status');
          if (typeof ApdDossier === 'undefined') {
            if (st) st.textContent = 'Module APD indisponible sur cette vue.';
            return;
          }
          apdBtn.disabled = true;
          if (st) st.textContent = 'Génération du dossier APD / Permis en cours…';
          try {
            const out = await ApdDossier.exportPDF({ project: ctx.project, cabinet: ctx.cabinet, media: ctx.media });
            if (st) st.textContent = `Dossier téléchargé : ${out.filename} (${out.pages} pages).`;
          } catch (err) {
            if (st) st.textContent = `Export impossible : ${err.message}`;
          } finally {
            apdBtn.disabled = false;
          }
        };
      }
    };

    tabsEl.replaceChildren(...slides.map((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(i === 0));
      btn.textContent = s.tab;
      btn.onclick = () => show(i);
      return btn;
    }));

    prevBtn.onclick = () => show(idx - 1);
    nextBtn.onclick = () => show(idx + 1);
    closeBtn.onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      dlg.close();
    };
    fsBtn.onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else dlg.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    };

    dlg.onkeydown = event => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); show(idx + 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); show(idx - 1); }
    };
    dlg.onclose = () => {
      const v = stageEl.querySelector('video');
      if (v) v.pause();
    };

    let touchX = null;
    stageEl.ontouchstart = e => { if (e.touches.length === 1) touchX = e.touches[0].clientX; };
    stageEl.ontouchend = e => {
      if (touchX === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) >= 48) show(idx + (dx < 0 ? 1 : -1));
    };

    show(0);
    if (!dlg.open) dlg.showModal();
  }

  window.MeetingMode = { open, buildSlides };
})();
