/** Entrée de l'atelier : aucun projet n'est gravé en dur dans la page ; la reprise rapide, le film HD et le profil cabinet se chargent dynamiquement. */
(() => {
  const el = id => document.getElementById(id);
  const dialog = el('studio-index');
  const list = el('index-list');
  const search = el('index-search');
  const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  let projects = null;

  // Millésime de l'édition en chiffres romains, comme sur une planche.
  const roman = n => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
    .reduce((out, [value, sym]) => { while (n >= value) { out += sym; n -= value; } return out; }, '');
  el('studio-year').textContent = roman(new Date().getFullYear());

  // Fil de bois de la charte : dessin vectoriel généré, toujours le même (graine fixe).
  const wood = el('studio-wood');
  if (wood && typeof WoodGrain !== 'undefined') {
    wood.innerHTML = WoodGrain.svg({ width: 1600, height: 1000, seed: 11, knots: 4, stroke: '#B38646', strokeWidth: 1, opacity: 0.18 });
    requestAnimationFrame(() => wood.classList.add('is-ready'));
  }

  function item(project) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'index-row';
    const link = document.createElement('a');
    link.className = 'index-item';
    link.href = `accueil.html?project=${encodeURIComponent(project.slug)}`;
    const thumb = document.createElement('span');
    thumb.className = 'index-thumb';
    if (project.cover) {
      const img = document.createElement('img');
      img.src = project.cover; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { img.replaceWith(initial(project.name)); };
      thumb.append(img);
    } else thumb.append(initial(project.name));
    const text = document.createElement('span');
    text.className = 'index-text';
    const name = document.createElement('span');
    name.className = 'index-name'; name.textContent = project.name;
    text.append(name);
    if (project.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'index-sub'; sub.textContent = project.subtitle;
      text.append(sub);
    }
    const metaParts = [];
    if (project.phase) metaParts.push(project.phase);
    if (Number.isFinite(project.updated)) metaParts.push(`Mis à jour le ${dateFormat.format(new Date(project.updated))}`);
    if (metaParts.length) {
      const date = document.createElement('span');
      date.className = 'index-date'; date.textContent = metaParts.join(' · ');
      text.append(date);
    }
    const arrow = document.createElement('span');
    arrow.className = 'index-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
    link.append(thumb, text, arrow);

    const quick = document.createElement('div');
    quick.className = 'index-quick';
    quick.setAttribute('aria-label', `Accès rapides — ${project.name}`);
    const visitLink = document.createElement('a');
    visitLink.href = `index.html?project=${encodeURIComponent(project.slug)}`;
    visitLink.textContent = 'Visite 3D';
    const editLink = document.createElement('a');
    editLink.href = `editor.html?project=${encodeURIComponent(project.slug)}`;
    editLink.textContent = 'Éditeur 2D';
    const meetLink = document.createElement('a');
    meetLink.href = `accueil.html?project=${encodeURIComponent(project.slug)}#meeting`;
    meetLink.textContent = 'Réunion client';
    quick.append(visitLink, editLink, meetLink);

    row.append(link, quick);
    li.append(row);
    return li;
  }

  function initial(name) {
    const span = document.createElement('span');
    span.textContent = String(name || '?').trim().charAt(0).toUpperCase();
    return span;
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase('fr');
    const shown = projects.filter(p => !query || `${p.name} ${p.subtitle || ''}`.toLocaleLowerCase('fr').includes(query));
    list.replaceChildren(...shown.map(item));
    el('index-empty').hidden = projects.length > 0;
    el('index-count').textContent = !projects.length ? ''
      : query ? `${shown.length} sur ${projects.length} dossiers`
      : `${projects.length} dossier${projects.length > 1 ? 's' : ''} · du plus récent au plus ancien`;
  }

  async function fetchProjectsList() {
    if (projects) return projects;
    try {
      const response = await fetch('api/projects', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      projects = Array.isArray(data) ? data : [];
      return projects;
    } catch {
      return null;
    }
  }

  async function load() {
    if (projects) { el('index-search-wrap').hidden = projects.length < 2; render(); return; }
    el('index-count').textContent = 'Chargement des dossiers…';
    const data = await fetchProjectsList();
    if (!data) {
      el('index-count').textContent = 'Les dossiers sont indisponibles pour le moment. Réessayez dans un instant.';
      return;
    }
    el('index-search-wrap').hidden = data.length < 2;
    render();
  }

  // --- Tirages encadrés : planches ultra-réalistes, film HD dynamique, loupe et visionneuse ---
  const stage = el('print-stage');
  const frame = document.querySelector('.print-frame');
  const loupe = el('print-loupe');
  const videoHint = el('print-video-hint');
  const progress = el('print-progress');
  const platesHost = el('print-plates');
  const projectLinkEl = el('print-project-link');
  const lightboxProjectEl = el('print-lightbox-project');
  let images = [...stage.querySelectorAll('.print-img')];
  let plateButtons = [...platesHost.querySelectorAll('button')];
  const prevBtn = el('print-prev');
  const nextBtn = el('print-next');
  const toggleBtn = el('print-toggle');
  const expandBtn = el('print-expand');
  const counterEl = el('print-counter');
  const lightbox = el('print-lightbox');
  const lightboxImg = el('print-lightbox-img');
  const lightboxVideo = el('print-lightbox-video');
  const lightboxRef = el('print-lightbox-ref');
  const lightboxTitle = el('print-lightbox-title');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const AUTOPLAY_MS = 6500;
  const pad2 = n => String(n).padStart(2, '0');
  let activeIndex = 0;
  let autoplay = null;
  let userPaused = false;
  let hoverPaused = false;
  const seriesSlugs = { a: '', b: '' };

  function slideSlug(slideEl) {
    if (!slideEl) return '';
    if (slideEl.dataset.projectSlug) return slideEl.dataset.projectSlug;
    return seriesSlugs[slideEl.dataset.series] || '';
  }

  function syncProgress() {
    if (!progress) return;
    progress.classList.remove('is-running');
    if (calm.matches || userPaused || hoverPaused || lightbox?.open) return;
    void progress.offsetWidth;
    progress.style.setProperty('--slide-ms', `${AUTOPLAY_MS}ms`);
    progress.classList.add('is-running');
  }

  function renderLightboxMedia(active) {
    if (!lightboxImg || !lightboxVideo || !active) return;
    const videoSrc = active.dataset.videoSrc || '';
    if (videoSrc) {
      lightboxImg.hidden = true;
      lightboxVideo.hidden = false;
      lightboxVideo.poster = active.currentSrc || active.src;
      if (lightboxVideo.getAttribute('src') !== videoSrc) {
        lightboxVideo.src = videoSrc;
        lightboxVideo.load();
      }
      lightboxVideo.play().catch(() => {});
    } else {
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.hidden = true;
      lightboxImg.hidden = false;
      lightboxImg.src = active.currentSrc || active.src;
      lightboxImg.alt = active.alt;
    }
    if (lightboxRef) lightboxRef.textContent = active.dataset.ref || '';
    if (lightboxTitle) lightboxTitle.textContent = active.dataset.title || '';
    const slug = slideSlug(active);
    if (lightboxProjectEl) {
      if (slug) {
        lightboxProjectEl.href = `accueil.html?project=${encodeURIComponent(slug)}`;
        lightboxProjectEl.hidden = false;
      } else {
        lightboxProjectEl.hidden = true;
      }
    }
  }

  function showSlide(nextIdx) {
    if (!images.length) return;
    activeIndex = (nextIdx + images.length) % images.length;
    const active = images[activeIndex];
    images.forEach((img, idx) => img.classList.toggle('is-active', idx === activeIndex));
    plateButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.slide) === activeIndex)));
    el('print-ref').textContent = active.dataset.ref || `PL. ${pad2(activeIndex + 1)}`;
    el('print-title').textContent = active.dataset.title || '';
    if (counterEl) counterEl.textContent = `${pad2(activeIndex + 1)} / ${pad2(images.length)}`;
    loupe.style.backgroundImage = `url("${active.currentSrc || active.src}")`;
    const isVideo = Boolean(active.dataset.videoSrc);
    if (videoHint) videoHint.hidden = !isVideo;
    const slug = slideSlug(active);
    if (projectLinkEl) {
      if (slug) {
        projectLinkEl.href = `accueil.html?project=${encodeURIComponent(slug)}`;
        projectLinkEl.hidden = false;
      } else {
        projectLinkEl.hidden = true;
      }
    }
    if (lightbox?.open) renderLightboxMedia(active);
    syncProgress();
  }

  function stopAutoplay() {
    clearInterval(autoplay);
    autoplay = null;
    if (progress) progress.classList.remove('is-running');
  }

  function startAutoplay() {
    stopAutoplay();
    if (calm.matches || userPaused || hoverPaused || lightbox?.open || images.length < 2) return;
    autoplay = setInterval(() => showSlide(activeIndex + 1), AUTOPLAY_MS);
    syncProgress();
  }

  function setPaused(paused) {
    userPaused = Boolean(paused);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(userPaused));
      toggleBtn.textContent = userPaused ? '▶' : '❚❚';
      toggleBtn.setAttribute('aria-label', userPaused ? 'Reprendre le défilement automatique' : 'Mettre en pause le défilement');
    }
    if (userPaused) stopAutoplay();
    else startAutoplay();
  }

  function bindPlateButton(button) {
    button.addEventListener('click', () => {
      showSlide(Number(button.dataset.slide) || 0);
      if (!userPaused) startAutoplay();
    });
  }
  plateButtons.forEach(bindPlateButton);
  prevBtn?.addEventListener('click', () => { showSlide(activeIndex - 1); if (!userPaused) startAutoplay(); });
  nextBtn?.addEventListener('click', () => { showSlide(activeIndex + 1); if (!userPaused) startAutoplay(); });
  toggleBtn?.addEventListener('click', () => setPaused(!userPaused));

  function openLightbox() {
    if (!lightbox || !lightboxImg) return;
    const active = images[activeIndex];
    if (!active) return;
    stopAutoplay();
    renderLightboxMedia(active);
    lightbox.showModal();
  }

  expandBtn?.addEventListener('click', openLightbox);
  stage.addEventListener('click', openLightbox);
  el('print-lightbox-close')?.addEventListener('click', () => lightbox?.close());
  el('print-lightbox-prev')?.addEventListener('click', () => showSlide(activeIndex - 1));
  el('print-lightbox-next')?.addEventListener('click', () => showSlide(activeIndex + 1));
  lightbox?.addEventListener('close', () => {
    if (lightboxVideo) { lightboxVideo.pause(); lightboxVideo.removeAttribute('src'); }
    if (!userPaused) startAutoplay();
  });
  lightbox?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); showSlide(activeIndex - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); showSlide(activeIndex + 1); }
  });
  lightbox?.addEventListener('click', event => {
    if (event.target === lightbox) lightbox.close();
  });

  showSlide(0);
  startAutoplay();

  // Balayage tactile gauche/droite sur tablette et mobile
  let touchStartX = null;
  stage.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchStartX = event.touches[0].clientX;
  }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (touchStartX === null || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) >= 42) {
      showSlide(activeIndex + (dx < 0 ? 1 : -1));
      if (!userPaused) startAutoplay();
    }
  }, { passive: true });

  const ZOOM = 2.4;
  stage.addEventListener('pointermove', event => {
    if (!finePointer.matches || images[activeIndex]?.dataset.videoSrc) return;
    const box = stage.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    stage.classList.add('is-zooming');
    loupe.style.left = `${x}px`; loupe.style.top = `${y}px`;
    loupe.style.backgroundSize = `${box.width * ZOOM}px ${box.height * ZOOM}px`;
    const half = loupe.offsetWidth / 2;
    loupe.style.backgroundPosition = `${-(x * ZOOM - half)}px ${-(y * ZOOM - half)}px`;
  });
  stage.addEventListener('pointerenter', () => {
    if (!finePointer.matches) return;
    hoverPaused = true;
    stopAutoplay();
  });
  stage.addEventListener('pointerleave', () => {
    stage.classList.remove('is-zooming');
    if (!finePointer.matches) return;
    hoverPaused = false;
    if (!userPaused) startAutoplay();
  });

  // Relief : le tirage s'incline de deux degrés au plus vers le pointeur.
  const print = el('studio-print');
  print.addEventListener('pointermove', event => {
    if (!finePointer.matches || calm.matches) return;
    const box = print.getBoundingClientRect();
    const dx = (event.clientX - box.left) / box.width - 0.5, dy = (event.clientY - box.top) / box.height - 0.5;
    frame.style.setProperty('--tilt-y', `${(dx * 4).toFixed(2)}deg`);
    frame.style.setProperty('--tilt-x', `${(-dy * 4).toFixed(2)}deg`);
  });
  print.addEventListener('pointerleave', () => { frame.style.setProperty('--tilt-x', '0deg'); frame.style.setProperty('--tilt-y', '0deg'); });

  // --- Hydratation dynamique : dernier dossier actif + lien vers projet + 8e vignette Film HD ---
  async function hydrateWorkspace() {
    const listData = await fetchProjectsList();
    if (!listData || !listData.length) return;

    // Associer les planches d'exposition aux projets existants sans graver de slug dans le HTML.
    const projA = listData.find(p => /veranda/i.test(p.slug)) || listData[0];
    const projB = listData.find(p => /serena/i.test(p.slug)) || listData[1] || projA;
    seriesSlugs.a = projA?.slug || '';
    seriesSlugs.b = projB?.slug || '';

    // Bandeau de reprise directe du dernier dossier consulté ou le plus récemment modifié.
    let lastSlug = '';
    try { lastSlug = localStorage.getItem('lastProject') || ''; } catch { /* ignore */ }
    const recent = listData.find(p => p.slug === lastSlug)
      || listData.find(p => p.default)
      || listData.find(p => !/^essai-/i.test(p.slug))
      || listData[0];
    const resumeBox = el('studio-resume');
    if (recent && resumeBox) {
      const link = el('resume-link');
      const meta = el('resume-meta');
      const edit = el('resume-edit');
      const visit = el('resume-visit');
      const meet = el('resume-meeting');
      const q = encodeURIComponent(recent.slug);
      link.textContent = recent.name;
      link.href = `accueil.html?project=${q}`;
      const bits = [];
      if (recent.phase) bits.push(recent.phase);
      if (Number.isFinite(recent.updated)) bits.push(`Mis à jour le ${dateFormat.format(new Date(recent.updated))}`);
      meta.textContent = bits.join(' · ');
      edit.href = `editor.html?project=${q}`;
      visit.href = `index.html?project=${q}`;
      meet.href = `accueil.html?project=${q}#meeting`;
      const resumeThumb = el('resume-thumb');
      if (resumeThumb) {
        resumeThumb.replaceChildren();
        if (recent.cover) {
          const tImg = document.createElement('img');
          tImg.src = recent.cover;
          tImg.alt = '';
          tImg.loading = 'lazy';
          tImg.decoding = 'async';
          tImg.onerror = () => { resumeThumb.textContent = String(recent.name || 'P').trim().charAt(0).toUpperCase(); };
          resumeThumb.append(tImg);
        } else {
          resumeThumb.textContent = String(recent.name || 'P').trim().charAt(0).toUpperCase();
        }
      }
      resumeBox.hidden = false;
    }

    // Ajouter la 8e vignette Film HD si le projet phare dispose d'un film réaliste MP4.
    if (projA?.slug) {
      try {
        const res = await fetch(`api/gallery/media?project=${encodeURIComponent(projA.slug)}`, { cache: 'no-store' });
        if (res.ok) {
          const media = await res.json();
          const videos = Array.isArray(media.videos) ? media.videos : [];
          const heroFilm = [...videos].reverse().find(v => /film-realiste/i.test(v.id || '') || /FFmpeg/i.test(v.generator || '')) || videos[videos.length - 1];
          if (heroFilm && heroFilm.file) {
            const idx = images.length;
            const img = document.createElement('img');
            img.className = 'print-img';
            img.src = heroFilm.poster || projA.cover || 'assets/studio/planche-villa-a.jpg';
            img.alt = heroFilm.label || 'Film réaliste d’architecture';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.dataset.slide = String(idx);
            img.dataset.ref = `PL. ${pad2(idx + 1)}`;
            img.dataset.title = `${heroFilm.label || 'Film réaliste HD'} (${heroFilm.duration || 24} s)`;
            img.dataset.projectSlug = projA.slug;
            img.dataset.videoSrc = heroFilm.file;
            stage.insertBefore(img, loupe);
            images = [...stage.querySelectorAll('.print-img')];

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.slide = String(idx);
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = 'Film HD';
            bindPlateButton(btn);
            platesHost.append(btn);
            plateButtons = [...platesHost.querySelectorAll('button')];
          }
        }
      } catch { /* pas de média vidéo */ }
    }
    showSlide(activeIndex);
  }

  // --- Profil du cabinet accessible dès l'entrée ---
  const cabBtn = el('btn-studio-cabinet');
  const cabDlg = el('studio-cabinet-dlg');
  const cabForm = el('studio-cabinet-form');
  const cabStatus = el('cab-status');
  const cabLogoPreview = el('cab-logo-preview');
  const cabLogoFile = el('cab-logo-file');
  let pendingLogoDataUrl = null;

  function renderCabinetLogo(url) {
    if (!cabLogoPreview) return;
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = 'Logo du cabinet';
      cabLogoPreview.replaceChildren(img);
    } else {
      cabLogoPreview.textContent = 'Aucun logo';
    }
  }

  async function loadCabinetProfile() {
    try {
      const res = await fetch('api/cabinet/profile', { cache: 'no-store' });
      if (!res.ok) return;
      const profile = await res.json();
      if (profile?.name) {
        const cartouche = el('studio-cabinet-cartouche');
        if (cartouche) cartouche.textContent = profile.name;
      }
      if (el('cab-name')) el('cab-name').value = profile?.name || '';
      if (el('cab-architect')) el('cab-architect').value = profile?.architect || '';
      if (el('cab-contact')) el('cab-contact').value = profile?.contact || '';
      renderCabinetLogo(profile?.logoUrl || '');
    } catch { /* profil par défaut */ }
  }

  cabBtn?.addEventListener('click', () => {
    pendingLogoDataUrl = null;
    if (cabStatus) cabStatus.textContent = '';
    void loadCabinetProfile();
    cabDlg?.showModal();
  });
  el('cabinet-dlg-close')?.addEventListener('click', () => cabDlg?.close());
  cabDlg?.addEventListener('click', event => { if (event.target === cabDlg) cabDlg.close(); });
  cabLogoFile?.addEventListener('change', () => {
    const file = cabLogoFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingLogoDataUrl = String(reader.result || '');
      renderCabinetLogo(pendingLogoDataUrl);
    };
    reader.readAsDataURL(file);
  });
  cabForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (cabStatus) cabStatus.textContent = 'Enregistrement…';
    try {
      const payload = {
        name: el('cab-name')?.value.trim() || '',
        architect: el('cab-architect')?.value.trim() || '',
        contact: el('cab-contact')?.value.trim() || ''
      };
      if (pendingLogoDataUrl) payload.logo = pendingLogoDataUrl;
      const res = await fetch('api/cabinet/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || `HTTP ${res.status}`);
      pendingLogoDataUrl = null;
      if (result?.logoUrl) renderCabinetLogo(`${result.logoUrl}?v=${Date.now()}`);
      if (payload.name && el('studio-cabinet-cartouche')) el('studio-cabinet-cartouche').textContent = payload.name;
      if (cabStatus) cabStatus.textContent = 'Profil du cabinet enregistré — appliqué à tous les dossiers PDF.';
    } catch (err) {
      if (cabStatus) cabStatus.textContent = `Enregistrement impossible : ${err.message}`;
    }
  });

  function openIndex() {
    dialog.showModal();
    void load();
  }
  el('door-open').addEventListener('click', openIndex);
  el('btn-studio-index-nav')?.addEventListener('click', openIndex);
  el('btn-studio-shortcuts')?.addEventListener('click', () => window.__archicamIHM?.openShortcuts?.());
  el('index-close').addEventListener('click', () => dialog.close());
  // Un clic sur le voile (hors du panneau) ferme l'index ; un clic dans les marges du panneau, non.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  search.addEventListener('input', () => { if (projects) render(); });

  // Raccourcis clavier directs sur la planche d'entrée (quand aucune boîte de dialogue ni champ n'est actif)
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = (event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showSlide(activeIndex - 1);
      if (!userPaused) startAutoplay();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showSlide(activeIndex + 1);
      if (!userPaused) startAutoplay();
    } else if (event.key === ' ' && tag !== 'button' && tag !== 'a') {
      event.preventDefault();
      setPaused(!userPaused);
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openLightbox();
    } else if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      openIndex();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      location.href = 'editor.html';
    }
  });

  void hydrateWorkspace();
  void loadCabinetProfile();
})();
