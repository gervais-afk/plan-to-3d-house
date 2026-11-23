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
    if (Number.isFinite(project.updated)) {
      const date = document.createElement('span');
      date.className = 'index-date'; date.textContent = `Mis à jour le ${dateFormat.format(new Date(project.updated))}`;
      text.append(date);
    }
    const arrow = document.createElement('span');
    arrow.className = 'index-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
    link.append(thumb, text, arrow);
    li.append(link);
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
      el('index-search-wrap').hidden = projects.length < 6;
      render();
    } catch {
      el('index-count').textContent = 'Les dossiers sont indisponibles pour le moment. Réessayez dans un instant.';
    }
  }

  // --- Tirage du plan : niveaux RDC / R+1, loupe de lecture, léger relief au survol -------------------
  const stage = el('print-stage');
  const frame = document.querySelector('.print-frame');
  const loupe = el('print-loupe');
  const images = [...stage.querySelectorAll('.print-img')];
  const levelButtons = [...document.querySelectorAll('.print-levels button')];
  const LEVELS = { rdc: { ref: 'PL. 01', title: 'Rez-de-chaussée' }, r1: { ref: 'PL. 02', title: 'Étage R+1' } };
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let level = 'rdc', autoplay = null;

  function showLevel(next) {
    level = next;
    images.forEach(img => img.classList.toggle('is-active', img.dataset.level === next));
    levelButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === next)));
    el('print-ref').textContent = LEVELS[next].ref;
    el('print-title').textContent = LEVELS[next].title;
    const active = images.find(img => img.dataset.level === next);
    loupe.style.backgroundImage = `url("${active.currentSrc || active.src}")`;
  }
  const stopAutoplay = () => { clearInterval(autoplay); autoplay = null; };
  levelButtons.forEach(button => button.addEventListener('click', () => { stopAutoplay(); showLevel(button.dataset.level); }));
  // Alternance lente des deux niveaux tant que personne n'interagit avec le tirage.
  if (!calm.matches) autoplay = setInterval(() => showLevel(level === 'rdc' ? 'r1' : 'rdc'), 7000);
  showLevel('rdc');

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
  stage.addEventListener('pointerenter', () => { if (finePointer.matches) stopAutoplay(); });
  stage.addEventListener('pointerleave', () => stage.classList.remove('is-zooming'));

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
