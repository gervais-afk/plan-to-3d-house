/** Entrée de l'atelier : aucun projet n'est affiché tant que l'utilisateur n'ouvre pas l'index des dossiers. */
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
    quick.append(visitLink, editLink);

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

  async function load() {
    if (projects) return;
    el('index-count').textContent = 'Chargement des dossiers…';
    try {
      const response = await fetch('api/projects', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      projects = Array.isArray(data) ? data : [];
      el('index-search-wrap').hidden = projects.length < 2;
      render();
    } catch {
      el('index-count').textContent = 'Les dossiers sont indisponibles pour le moment. Réessayez dans un instant.';
    }
  }

  // --- Tirages encadrés : 5 plans & planches ultra-réalistes, défilement à intervalle, loupe et visionneuse ---
  const stage = el('print-stage');
  const frame = document.querySelector('.print-frame');
  const loupe = el('print-loupe');
  const progress = el('print-progress');
  const images = [...stage.querySelectorAll('.print-img')];
  const plateButtons = [...document.querySelectorAll('.print-plates button')];
  const prevBtn = el('print-prev');
  const nextBtn = el('print-next');
  const toggleBtn = el('print-toggle');
  const expandBtn = el('print-expand');
  const counterEl = el('print-counter');
  const lightbox = el('print-lightbox');
  const lightboxImg = el('print-lightbox-img');
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

  function syncProgress() {
    if (!progress) return;
    progress.classList.remove('is-running');
    if (calm.matches || userPaused || hoverPaused || lightbox?.open) return;
    void progress.offsetWidth;
    progress.style.setProperty('--slide-ms', `${AUTOPLAY_MS}ms`);
    progress.classList.add('is-running');
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
    if (lightbox?.open && lightboxImg) {
      lightboxImg.src = active.currentSrc || active.src;
      lightboxImg.alt = active.alt;
      if (lightboxRef) lightboxRef.textContent = active.dataset.ref || '';
      if (lightboxTitle) lightboxTitle.textContent = active.dataset.title || '';
    }
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

  plateButtons.forEach(button => button.addEventListener('click', () => {
    showSlide(Number(button.dataset.slide) || 0);
    if (!userPaused) startAutoplay();
  }));
  prevBtn?.addEventListener('click', () => { showSlide(activeIndex - 1); if (!userPaused) startAutoplay(); });
  nextBtn?.addEventListener('click', () => { showSlide(activeIndex + 1); if (!userPaused) startAutoplay(); });
  toggleBtn?.addEventListener('click', () => setPaused(!userPaused));

  function openLightbox() {
    if (!lightbox || !lightboxImg) return;
    const active = images[activeIndex];
    if (!active) return;
    stopAutoplay();
    lightboxImg.src = active.currentSrc || active.src;
    lightboxImg.alt = active.alt;
    if (lightboxRef) lightboxRef.textContent = active.dataset.ref || '';
    if (lightboxTitle) lightboxTitle.textContent = active.dataset.title || '';
    lightbox.showModal();
  }

  expandBtn?.addEventListener('click', openLightbox);
  stage.addEventListener('click', openLightbox);
  el('print-lightbox-close')?.addEventListener('click', () => lightbox?.close());
  el('print-lightbox-prev')?.addEventListener('click', () => showSlide(activeIndex - 1));
  el('print-lightbox-next')?.addEventListener('click', () => showSlide(activeIndex + 1));
  lightbox?.addEventListener('close', () => { if (!userPaused) startAutoplay(); });
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
    if (!finePointer.matches) return;
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

  el('door-open').addEventListener('click', () => {
    dialog.showModal();
    void load();
  });
  el('index-close').addEventListener('click', () => dialog.close());
  // Un clic sur le voile (hors du panneau) ferme l'index ; un clic dans les marges du panneau, non.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  search.addEventListener('input', () => { if (projects) render(); });
})();
