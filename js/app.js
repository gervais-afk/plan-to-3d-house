/**
 * MASTER APPLICATION ORCHESTRATOR
 * Coordonne la scène 3D, la visite au scroll, la visite libre au clavier et le HUD
 */

window.startProjectViewer = () => {
  if (window.PROJECT_ACCESS_FAILED || typeof HOUSE_DATA === 'undefined') return;
  function showViewerError(error) {
    document.getElementById('viewer-error').hidden = false;
    document.querySelector('.ui-layer').hidden = true;
    document.getElementById('scroll-container').hidden = true;
    console.error('Initialisation de la visite impossible', error);
  }
  if (window.PROJECT_DATA_INVALID) { showViewerError('Données de projet invalides'); return; }
  const portalContext = window.PORTAL_CONTEXT;
  const invited = ['read', 'comment'].includes(portalContext?.role);
  if (portalContext?.role) document.getElementById('portal-account').hidden = false;
  if (invited) {
    for (const id of ['btn-export-video', 'rg-regen', 'rg-generate-videos']) document.getElementById(id).hidden = true;
    async function checkSession() {
      if (document.hidden) return;
      try {
        const res = await fetch('api/portal/session', { cache: 'no-store' });
        if (!res.ok) return;
        const current = await res.json();
        if (current.project !== portalContext.project || current.role !== portalContext.role) location.replace('portal.html?session=terminee');
      } catch { /* renouveler la vérification après une coupure réseau */ }
    }
    document.addEventListener('visibilitychange', checkSession);
    setInterval(checkSession, 20000);
  }
  const PROJECT_SLUG = window.ACTIVE_PROJECT_SLUG || HOUSE_DATA.meta?.slug || 'villa-serena';
  const viewerTitle = document.querySelector('.project-title');
  viewerTitle.textContent = HOUSE_DATA.meta?.name || 'Visite architecturale';
  const viewerHome = document.getElementById('viewer-home');
  viewerHome.href = `/?project=${encodeURIComponent(PROJECT_SLUG)}`;
  viewerHome.hidden = Boolean(portalContext?.decision);
  const projectApi = endpoint => `${endpoint}?project=${encodeURIComponent(PROJECT_SLUG)}`;
  const projectMedia = path => `projects/${encodeURIComponent(PROJECT_SLUG)}/generated/${path}`;
  if (invited) document.querySelector('.rg-intro').textContent = 'Consultez les images et vidéos partagées pour ce projet.';
  const inVisit = () => window.ProjectWorkspace.isVisit();
  const container = document.getElementById('webgl-container');
  const minimapCanvas = document.getElementById('minimap-canvas');

  // Éléments du HUD
  document.getElementById('hud-wall-height').textContent = `${clientNumber.format(HOUSE_DATA.config.wallHeight)} m`;
  const roomNameEl = document.getElementById('hud-room-name');
  const roomSurfaceEl = document.getElementById('hud-room-surface');
  const roomDescEl = document.getElementById('hud-room-desc');
  const elevationPercentEl = document.getElementById('hud-elevation-percent');
  const progressFillEl = document.getElementById('progress-bar-fill');
  const modeBadgeEl = document.getElementById('mode-badge');
  const btnToggleMode = document.getElementById('btn-toggle-mode');
  const fpsHelpEl = document.getElementById('fps-controls-overlay');

  let pinnedView = null;
  let currentMode = 'scroll'; // 'scroll' ou 'walk'
  let scrollProgress = 0.0;
  let activeRoom = null;

  // 1. Initialisation de la scène 3D
  let houseScene;
  try { houseScene = new HouseScene(container); }
  catch (error) { showViewerError(error); return; }
  window.houseScene = houseScene; // accès console (débogage)
  houseScene.initRealism();

  // Modèles glTF CC0 (si présents dans HOUSE_DATA.assets) : remplacent les volumes de repli
  // puis fusion du mobilier pour limiter les appels de dessin
  const assetsReady = new AssetLibrary(houseScene).load().then(n => {
    if (n) console.info(`${n} modèles glTF chargés`);
    houseScene.mergeFurniture();
  });

  // Style du plan initial : rendu de présentation (Photoshop) ou plan encre
  const btnPlanStyle = document.getElementById('btn-plan-style');
  function togglePlanStyle() {
    const s = houseScene.togglePlanStyle();
    btnPlanStyle.textContent = s === 'render' ? 'Plan : Rendu' : 'Plan : Encre';
  }
  btnPlanStyle.addEventListener('click', togglePlanStyle);

  // --- STUDIO DE RENDUS & GALERIE ULTRA-RÉALISTE ---
  const studio = new RenderStudio(houseScene);
  const gallery = document.getElementById('render-gallery');
  const grid = document.getElementById('rg-grid');
  const status = document.getElementById('rg-status');
  const lightbox = document.getElementById('rg-lightbox');
  let currentItem = null;
  let galleryTask;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const shortcuts = document.getElementById('viewer-shortcuts');
  try { shortcuts.checked = localStorage.getItem('plan3d:viewer-shortcuts') !== 'off'; } catch { /* préférence facultative */ }
  shortcuts.addEventListener('change', () => {
    try { localStorage.setItem('plan3d:viewer-shortcuts', shortcuts.checked ? 'on' : 'off'); } catch { /* préférence facultative */ }
  });
  let isCompareActive = false;
  let galleryInitialized = false;
  let galleryMediaCache = null;
  let currentPhotoView = null;


  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function createViewCard(shot, aiImage) {
    const card = document.createElement('article');
    card.className = 'rg-card rg-view-card';
    card.dataset.id = shot.id;
    card.dataset.category = '3d';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'rg-thumb-wrap';
    const badge = document.createElement('span');
    badge.className = `rg-badge ${aiImage ? 'rg-badge-ultra' : 'rg-badge-3d'}`;
    badge.textContent = aiImage ? 'Rendu IA disponible' : 'Vue 3D de base';
    thumbWrap.appendChild(badge);

    const img = document.createElement('img');
    img.alt = `${shot.label} — vue 3D de référence`;
    img.loading = 'lazy';
    img.src = shot.url;
    thumbWrap.appendChild(img);
    card.appendChild(thumbWrap);

    const meta = document.createElement('div');
    meta.className = 'rg-card-meta';
    meta.innerHTML = `<div><div class="rg-card-title">${escapeHtml(shot.label)}</div><div class="rg-card-sub">Vue capturée depuis la maquette Three.js</div></div>`;
    card.appendChild(meta);

    if (!invited && !aiImage && shot.ext !== 'png') {
      const modelChoice = document.createElement('select');
      modelChoice.className = 'rg-model-choice';
      modelChoice.setAttribute('aria-label', `Modèle de photoréalisation — ${shot.label}`);
      modelChoice.replaceChildren(...Object.entries(IMAGE_MODELS).map(([id, m]) => new Option(m.label, id)));
      const estimate = document.createElement('span');
      estimate.className = 'rg-cost-estimate';
      const updateEstimate = () => { estimate.textContent = `${IMAGE_MODELS[modelChoice.value].estimate} Le coût réel OpenRouter sera affiché après l’appel.`; };
      modelChoice.addEventListener('change', updateEstimate);
      modelChoice.addEventListener('click', event => event.stopPropagation());
      updateEstimate();
      card.append(modelChoice, estimate);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn-toggle btn-small rg-card-action';
    if (aiImage) {
      Icons.label(action, 'compare', 'Comparer Avant (3D) / Après (IA)');
      action.addEventListener('click', event => {
        event.stopPropagation();
        openLightbox(shot, aiImage, true);
      });
    } else if (!invited && shot.ext !== 'png') {
      Icons.label(action, 'sparkle', 'Générer le rendu photoréaliste (IA)');
      action.addEventListener('click', event => {
        event.stopPropagation();
        const model = card.querySelector('.rg-model-choice').value;
        photorealize(shot, action, model);
      });
    } else {
      action.textContent = 'Ouvrir la vue';
      action.setAttribute('aria-label', `Ouvrir la vue : ${shot.label}`);
    }
    card.appendChild(action);
    if (!invited && aiImage?.id) {
      // Le rendu IA de cette vue peut rejoindre le catalogue des intérieurs et/ou le cahier de plans.
      const flags = document.createElement('div');
      flags.className = 'rg-flags';
      [['catalog', 'Catalogue'], ['book', 'Cahier']].forEach(([key, label]) => {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn-toggle btn-small rg-flag';
        const paint = () => {
          toggle.setAttribute('aria-pressed', String(aiImage[key] === true));
          // État porté par aria-pressed (fond sable) et par l’icône : coche quand l’image est retenue.
          Icons.label(toggle, aiImage[key] ? 'check' : key === 'catalog' ? 'gallery' : 'book', label);
          toggle.title = aiImage[key] ? `Retirer du ${label.toLowerCase()}` : `Ajouter au ${label.toLowerCase()}`;
        };
        paint();
        toggle.addEventListener('click', async event => {
          event.stopPropagation();
          toggle.disabled = true;
          try {
            await setImageFlags(aiImage.id, { [key]: !aiImage[key] });
            aiImage[key] = !aiImage[key];
            paint();
          } catch (error) { status.textContent = error.message; }
          finally { toggle.disabled = false; }
        });
        flags.append(toggle);
      });
      card.appendChild(flags);
    }
    if (action.textContent !== 'Ouvrir la vue') {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn-toggle btn-small rg-card-action';
      view.textContent = 'Ouvrir la vue';
      view.setAttribute('aria-label', `Ouvrir la vue : ${shot.label}`);
      card.appendChild(view);
    }
    card.onclick = () => openLightbox(shot, aiImage, false);
    return card;
  }

  // Construction d'une carte vidéo
  function createVideoCard(item) {
    const card = document.createElement('div');
    card.className = 'rg-card rg-card-video';
    card.dataset.id = item.id;
    card.dataset.category = 'videos';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'rg-thumb-wrap';

    const badge = document.createElement('div');
    badge.className = 'rg-badge rg-badge-video';
    const videoSourceLabel = item.sourceLabel || (item.generator === 'MediaRecorder local'
      ? 'Capture 3D locale'
      : item.generator ? 'Rendu IA' : 'Vidéo');
    badge.textContent = videoSourceLabel;
    thumbWrap.appendChild(badge);

    if (item.duration) {
      const dur = document.createElement('div');
      dur.className = 'rg-duration-pill';
      dur.textContent = `${item.duration}s`;
      thumbWrap.appendChild(dur);
    }

    const playOverlay = document.createElement('div');
    playOverlay.className = 'rg-play-overlay';
    playOverlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    thumbWrap.appendChild(playOverlay);

    if (item.poster) {
      const img = document.createElement('img');
      img.alt = item.label;
      img.loading = 'lazy';
      img.src = item.poster;
      thumbWrap.appendChild(img);
    }
    card.appendChild(thumbWrap);

    const meta = document.createElement('div');
    meta.className = 'rg-card-meta';
    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'rg-card-title'; title.textContent = item.label;
    const description = document.createElement('div');
    description.className = 'rg-card-sub';
    description.textContent = `${item.duration ? item.duration + ' s · ' : ''}${videoSourceLabel} · ${String(item.format || item.file.split('.').pop()).toUpperCase()}`;
    info.append(title, description);
    const play = document.createElement('button');
    play.type = 'button'; play.className = 'btn-toggle btn-small'; play.textContent = 'Visionner';
    play.setAttribute('aria-label', `Visionner : ${item.label}`);
    meta.append(info, play);
    card.appendChild(meta);

    card.onclick = () => openLightbox(item, false);
    return card;
  }

  const PHOTOREAL_PROMPT = 'Create a photorealistic, magazine-quality architectural visualization of the attached image (Architectural Digest / Dwell editorial style): warm, inviting, lived-in, refined materials, layered natural light, rich but restrained styling, realistic shadows and reflections. Preserve the exact camera framing and architectural geometry: do not move, add, remove, resize, or redesign any walls, doors, windows, openings, ceiling lines, or main volumes; keep their positions and proportions strictly unchanged. Keep the room layout and the position and identity of all existing furniture. You may enrich interior styling with tasteful, correctly scaled decor that does not obstruct openings or alter architecture: elegant linen curtains at existing windows, a textured rug beneath the bed or seating, carefully arranged cushions and a soft throw on the bed, warm glowing bedside lamps, one contemporary artwork on a suitable blank wall, and a healthy green plant. Integrate these additions naturally and avoid clutter. For exterior views preserve the existing landscape and context. The result should feel warm, sophisticated, realistic, and inhabited—not sterile.';

  async function imageDataUrl(url) {
    if (url && url.startsWith('data:image/')) return url;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image source inaccessible (HTTP ${response.status})`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du rendu source impossible'));
      reader.readAsDataURL(blob);
    });
  }

  function imageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Dimensions de l’image générée illisibles'));
      img.src = dataUrl;
    });
  }

  /**
   * Modèles de photoréalisation proposés (identifiants vérifiés sur l'API publique OpenRouter, novembre 2026).
   * La liste autorisée côté serveur est IMAGE_MODELS dans serve.js : garder les deux alignées.
   */
  const IMAGE_MODELS = {
    'google/gemini-3.1-flash-image': { label: 'Gemini 3.1 Flash Image — rendu final, ≈ 0,068 $', estimate: 'Estimation indicative : ≈ 0,068 $ pour une image (coût observé).' },
    'microsoft/mai-image-2.7-flash': { label: 'MAI-Image 2.7 Flash — coût variable par jeton', estimate: 'Estimation variable : 1,75 $/M jetons texte, 10 $/M jetons image ; total exact inconnu avant génération.' },
    'bytedance-seed/seedream-5-0-flash': { label: 'Seedream 5.0 Flash — brouillon rapide, ≈ 0,018 $', estimate: 'Brouillon rapide : ≈ 0,018 $ pour une image 1K (4,31 $ par million de jetons image). Pour comparer des ambiances avant le rendu final.' }
  };

  async function photorealize(item, button, model) {
    const costEstimate = IMAGE_MODELS[model]?.estimate || 'Coût variable selon le modèle.';
    if (!confirm(`Générer un rendu IA pour « ${item.label} » avec ${model} ?\n\n${costEstimate}\n\nL’appel est facturable ; le coût réel sera affiché après génération. Continuer ?`)) return;
    button.disabled = true;
    button.textContent = '⏳ Génération…';
    status.textContent = `Photoréalisation de « ${item.label} » avec ${model}…`;
    try {
      const source = await imageDataUrl(item.url);
      const response = await fetch('api/ai/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, prompt: PHOTOREAL_PROMPT, aspect_ratio: '16:9',
          input_references: [{ type: 'image_url', image_url: { url: source } }]
        })
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error?.message || result.error || `HTTP ${response.status}`);
      const generated = result.data?.[0];
      const output = generated?.b64_json
        ? `data:${generated.media_type || 'image/png'};base64,${generated.b64_json}`
        : generated?.url;
      if (!output) throw new Error('Le modèle n’a pas renvoyé d’image.');
      const image = await imageDataUrl(output);
      const dimensions = await imageDimensions(image);
      const id = `photor-${item.id}`;
      const saveResponse = await fetch(projectApi('api/save-generated'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, data: image,
          metadata: {
            reference: item.ext === 'png' ? projectMedia('renders/plan-2d-presentation.png') : projectMedia(`renders/${item.id}.jpg`),
            room: item.shot?.room || null,
            label: `${item.label} — photoréaliste`,
            width: dimensions.width, height: dimensions.height, model,
            prompt: PHOTOREAL_PROMPT
          }
        })
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.ok) throw new Error(saved.error || `Enregistrement impossible (HTTP ${saveResponse.status})`);
      galleryMediaCache = null;
      photoAvailability.clear();
      const media = await loadGalleryMedia(true);
      galleryInitialized = false;
      await buildGallery();
      const aiImage = aiImageForShot(item, media.images) || saved.item;
      const cost = result.usage?.cost !== undefined ? ` · ${Number(result.usage.cost).toFixed(3)} $` : '';
      status.textContent = `Rendu IA enregistré${cost}. Vérifiez sa fidélité au plan.`;
      // Proposition immédiate : rejoindre le catalogue des intérieurs (modifiable ensuite depuis la carte).
      if (confirm(`Ajouter « ${item.label} » au catalogue des intérieurs ?\n\nLe client pourra l’exporter en PDF avec les autres vues du catalogue.`)) {
        try {
          await setImageFlags(id, { catalog: true });
          status.textContent += ' Ajouté au catalogue.';
          galleryInitialized = false;
          await buildGallery();
        } catch (error) { status.textContent += ` Ajout au catalogue impossible : ${error.message}`; }
      }
      openLightbox(item, aiImage, true);
    } catch (error) {
      status.textContent = `Photoréalisation impossible : ${error.message}`;
      button.textContent = 'Réessayer';
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  // Les vues 3D et IA sont regroupées par angle de caméra, sans onglets ni doublons.

  async function loadGalleryMedia(force = false) {
    if (galleryMediaCache && !force) return galleryMediaCache;
    try {
      const response = await fetch(projectApi('api/gallery/media'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      galleryMediaCache = await response.json();
    } catch (error) {
      galleryMediaCache = { images: [], videos: [], unavailable: true };
    }
    return galleryMediaCache;
  }

  // Ajoute ou retire une image publiée du catalogue des intérieurs ou du cahier de plans (architecte).
  async function setImageFlags(id, flags) {
    const response = await fetch(projectApi('api/gallery/flags'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...flags })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Enregistrement du choix impossible (HTTP ${response.status})`);
    galleryMediaCache = null;
    return result;
  }

  function aiImageForShot(shot, images) {
    const ref = shot.id === 'plan-2d-presentation'
      ? projectMedia('renders/plan-2d-presentation.png')
      : projectMedia(`renders/${shot.id}.jpg`);
    const aliases = shot.id === 'plan-2d-presentation' ? ['plan-2d-photoshop'] : [];
    const matches = images.filter(image => image.reference === ref || image.id === shot.id || image.id === `photor-${shot.id}` || aliases.includes(image.id));
    matches.sort((a, b) => Number(b.id === `photor-${shot.id}`) - Number(a.id === `photor-${shot.id}`));
    return matches[0] || null;
  }

  function addSection(title, description) {
    const header = document.createElement('div');
    header.className = 'rg-section-header';
    header.innerHTML = `<span class="rg-section-title">${title}</span><span class="rg-section-desc">${description}</span>`;
    grid.appendChild(header);
  }

  // Une seule carte par angle : elle montre toujours la capture Three.js de ce projet.
  async function buildGallery() {
    grid.innerHTML = '';
    status.textContent = 'Vérification des images réellement disponibles…';
    const media = await loadGalleryMedia(true);
    if (media.unavailable && invited) {
      status.textContent = 'Impossible de charger les médias du projet pour le moment.';
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.className = 'btn-toggle btn-small';
      reload.textContent = 'Réessayer';
      reload.addEventListener('click', () => void buildGallery());
      grid.appendChild(reload);
      return;
    }
    const shots3D = invited ? studio.getExisting3DShots().filter(shot => media.renders?.includes(shot.url)) : studio.results;
    if (invited) {
      const added = new Set(shots3D.map(shot => shot.url));
      for (const url of media.renders || []) {
        if (added.has(url)) continue;
        const name = url.split('/').pop();
        const id = name.replace(/\.[^.]+$/, '');
        shots3D.push({ id, label: id.replace(/[-_]/g, ' '), url, ext: name.split('.').pop() });
      }
    }

    addSection('Vues de la maquette 3D', 'Captures locales gratuites · les rendus IA disponibles se comparent sur la même carte');
    let withAI = 0;
    shots3D.forEach(shot => {
      const aiImage = aiImageForShot(shot, media.images);
      if (aiImage) withAI++;
      grid.appendChild(createViewCard(shot, aiImage));
    });

    if (invited) {
      const extra = media.images.filter(image => !shots3D.some(shot => aiImageForShot(shot, [image])));
      if (extra.length) addSection('Rendus disponibles', 'Images enregistrées dans ce projet');
      extra.forEach(image => grid.appendChild(createViewCard({ ...image, url: image.file, ext: image.file.split('.').pop() }, null)));
    }
    if (media.videos.length) {
      addSection('Animations vidéo disponibles', 'Seuls les fichiers MP4 présents sont affichés');
      media.videos.forEach(video => grid.appendChild(createVideoCard(video)));
    }

    if (!grid.querySelector('.rg-card')) {
      const empty = document.createElement('p');
      empty.textContent = invited ? 'Aucun média n’a encore été partagé pour ce projet.' : 'Aucune capture disponible pour ce projet.';
      grid.appendChild(empty);
    }
    status.textContent = `${shots3D.length} vues 3D ${invited ? 'enregistrées' : 'capturées gratuitement'} · ${withAI} rendu(s) IA disponible(s)${media.videos.length ? ` · ${media.videos.length} vidéo(s)` : ''}`;
    galleryInitialized = true;
  }

  // Visionneuse commune : une vue 3D de base, avec comparaison IA uniquement si un fichier réel existe.
  function openLightbox(item, aiImage = null, startInCompareMode = false) {
    if (!gallery.open) return;
    currentItem = item;
    const fullImg = document.getElementById('rg-full');
    const videoEl = document.getElementById('rg-video');
    const compareView = document.getElementById('rg-compare-view');
    const compare3D = document.getElementById('rg-compare-3d');
    const compareGen = document.getElementById('rg-compare-gen');
    const btnCompare = document.getElementById('rg-btn-compare');
    const btnGoto = document.getElementById('rg-goto');
    const dlLink = document.getElementById('rg-download');
    const captionEl = document.getElementById('rg-caption');
    const metaEl = document.getElementById('rg-meta');
    const promptBox = document.getElementById('rg-prompt-box');
    const promptText = document.getElementById('rg-prompt-text');

    fullImg.classList.add('hidden');
    videoEl.classList.add('hidden');
    videoEl.pause();
    videoEl.removeAttribute('poster');
    videoEl.removeAttribute('src');
    videoEl.load();
    compareView.classList.add('hidden');
    btnCompare.classList.add('hidden');
    promptBox.classList.add('hidden');
    isCompareActive = false;

    if (item.type === 'video') {
      videoEl.classList.remove('hidden');
      videoEl.src = item.file;
      if (item.poster) videoEl.poster = item.poster;
      videoEl.play().catch(() => {});
      captionEl.textContent = item.label;
      const sourceLabel = item.sourceLabel || (item.generator === 'MediaRecorder local'
        ? 'Capture 3D locale'
        : item.generator ? 'Rendu IA' : 'Vidéo');
      metaEl.textContent = `${item.duration ? item.duration + ' s · ' : ''}${sourceLabel} · Vidéo ${(item.format || item.file.split('.').pop()).toUpperCase()} disponible`;
      dlLink.href = item.file;
      dlLink.download = item.file.split('/').pop() || `${item.id}.mp4`;
      btnGoto.style.display = 'none';
    } else {
      const baseUrl = item.url || item.file;
      const matchingShot = item.shot || studio.shots.find(shot => shot.id === item.id);
      captionEl.textContent = item.label;
      metaEl.textContent = aiImage ? 'Vue Three.js avant · rendu IA après' : 'Capture locale de la maquette Three.js';
      dlLink.href = aiImage ? aiImage.file : baseUrl;
      dlLink.download = `${aiImage ? aiImage.id : item.id}.${aiImage ? (aiImage.file.split('.').pop() || 'png') : (item.ext || 'jpg')}`;
      btnGoto.style.display = matchingShot ? '' : 'none';
      fullImg.classList.remove('hidden');
      fullImg.src = baseUrl;
      fullImg.alt = item.label;

      if (aiImage) {
        btnCompare.classList.remove('hidden');
        const toggleCompare = enable => {
          isCompareActive = enable;
          if (enable) {
            fullImg.classList.add('hidden');
            compareView.classList.remove('hidden');
            compare3D.src = baseUrl;
            compareGen.src = aiImage.file;
            Icons.label(btnCompare, 'gallery', 'Afficher une seule vue');
          } else {
            compareView.classList.add('hidden');
            fullImg.classList.remove('hidden');
            fullImg.src = baseUrl;
            Icons.label(btnCompare, 'compare', 'Comparer Avant (3D) / Après (IA)');
          }
        };
        btnCompare.onclick = () => toggleCompare(!isCompareActive);
        toggleCompare(startInCompareMode);
        if (aiImage.prompt || aiImage.notes) {
          promptBox.classList.remove('hidden');
          promptText.innerHTML = `${aiImage.prompt ? `<div><strong>Prompt :</strong> ${escapeHtml(aiImage.prompt)}</div>` : ''}${aiImage.notes ? `<div style="margin-top:4px;"><strong>Notes :</strong> ${escapeHtml(aiImage.notes)}</div>` : ''}`;
        }
      }
    }
    lightbox.classList.remove('hidden');
    if (!lightbox.open) lightbox.showModal();
  }

  function closeLightbox() {
    const videoEl = document.getElementById('rg-video');
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
    videoEl.load();
    }
    if (lightbox.open) lightbox.close();
    lightbox.classList.add('hidden');
  }

  async function generateRenders() {
    const regenButton = document.getElementById('rg-regen');
    regenButton.disabled = true;
    status.textContent = 'Capture locale gratuite des vues Three.js…';
    await assetsReady;
    let n = 0;
    const t0 = performance.now();
    try {
      await studio.generateAll(() => {
        n++;
        status.textContent = `Capture 3D ${n} / ${studio.shots.length + (houseScene.presentationCanvas ? 1 : 0)} — sans frais`;
      });
      galleryInitialized = false;
      photoAvailability.clear();
      await buildGallery();
      const duration = ((performance.now() - t0) / 1000).toFixed(1);
      status.textContent = `${studio.results.length} vues actualisées gratuitement en ${duration} s · les appels IA sont séparés et facturés`;
    } catch (error) {
      status.textContent = `Capture des vues 3D impossible : ${error.message}`;
    } finally {
      regenButton.disabled = false;
    }
  }

  async function generateAIVideos() {
    const button = document.getElementById('rg-generate-videos');
    button.disabled = true;
    const failures = [];
    try {
      const quoteResponse = await fetch('api/ai/video-quote', { cache: 'no-store' });
      const quote = await quoteResponse.json();
      if (!quoteResponse.ok) throw new Error(quote.error || `Devis indisponible (HTTP ${quoteResponse.status})`);
      const clips = [
        { id: 'anim-arrivee', label: 'Arrivée sur la façade sud', source: 'facade-sud.jpg' },
        { id: 'anim-sejour', label: 'Panoramique du séjour', source: 'sejour.jpg' }
      ];
      const present = new Set((await loadGalleryMedia(true)).videos.map(video => video.id));
      for (const clip of clips) {
        if (present.has(clip.id)) {
          status.textContent = `« ${clip.label} » existe déjà ; génération ignorée pour éviter de l’écraser.`;
          continue;
        }
        const perClip = Number(quote.estimatedPerClip);
        const estimateText = Number.isFinite(perClip) ? `${perClip.toFixed(4)} $` : 'coût variable';
        if (!confirm(`Générer « ${clip.label} » depuis ${clip.source} ?\n\nModèle : ${quote.model}\nDurée : ${quote.duration} s · résolution : ${quote.resolution} · sans audio\nEstimation : ${estimateText} pour ce clip.\n\nLe tarif réel peut varier ; chaque clip est un appel OpenRouter facturable. Confirmer cet appel ?`)) {
          status.textContent = `Génération annulée pour « ${clip.label} » ; aucun appel n’a été soumis.`;
          continue;
        }
        try {
          status.textContent = `Soumission OpenRouter de « ${clip.label} »…`;
          const submitResponse = await fetch('api/ai/videos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clipId: clip.id, project: PROJECT_SLUG })
          });
          const submitted = await submitResponse.json();
          if (!submitResponse.ok) throw new Error(submitted.error || `HTTP ${submitResponse.status}`);
          let result = null;
          for (let attempt = 0; attempt < 90; attempt++) {
            status.textContent = `Génération de « ${clip.label} » via Seedance 2.5 Flash… (${submitted.status || 'en cours'})`;
            await new Promise(resolve => setTimeout(resolve, 10000));
            const pollResponse = await fetch(`api/ai/videos/status?clipId=${encodeURIComponent(clip.id)}&project=${encodeURIComponent(PROJECT_SLUG)}`, { cache: 'no-store' });
            result = await pollResponse.json();
            if (!pollResponse.ok) throw new Error(result.error || `Suivi HTTP ${pollResponse.status}`);
            if (result.status === 'completed') break;
            if (['failed', 'cancelled', 'expired'].includes(result.status)) throw new Error(result.error || `La tâche a terminé avec le statut « ${result.status} »`);
          }
          if (!result || result.status !== 'completed') throw new Error('Délai de suivi dépassé ; vérifiez le statut depuis la galerie avant de relancer.');
          const realCost = Number.isFinite(Number(result.actualCost)) ? ` · coût réel ${Number(result.actualCost).toFixed(4)} $` : '';
          status.textContent = `${clip.label} enregistrée en local${realCost}.`;
          present.add(clip.id);
          galleryMediaCache = null;
          galleryInitialized = false;
          await buildGallery();
        } catch (error) {
          failures.push(`${clip.label} : ${error.message}`);
          status.textContent = `Échec de « ${clip.label} » : ${error.message}`;
        }
      }
      if (failures.length) status.textContent = `Génération terminée avec erreur(s) : ${failures.join(' · ')}`;
      else if (present.size) status.textContent = `${present.size} clip(s) vidéo disponible(s) dans la galerie.`;
    } catch (error) {
      status.textContent = `Génération vidéo indisponible : ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function openGallery() {
    if (gallery.open) return;
    if (currentMode === 'walk') setMode('scroll');
    if (feedback.placing) feedback.cancel();
    if (clientTools.measuring) clientTools.toggleMeasure(false);
    hidePhotoOverlay();
    gallery.classList.remove('hidden');
    gallery.showModal();
    if (!galleryInitialized && !galleryTask) {
      galleryTask = (invited || studio.results.length ? buildGallery() : generateRenders())
        .catch(() => { status.textContent = 'Galerie indisponible. Fermez-la et réessayez.'; })
        .finally(() => { galleryTask = null; });
      await galleryTask;
    }
  }

  function closeGallery(backToGallery = true) {
    if (lightbox.open) closeLightbox();
    if (gallery.open) gallery.close();
    gallery.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('workspace:close-studio', { detail: { backToGallery: backToGallery !== false } }));
  }

  // Les deux niveaux utilisent la gestion native du focus et d’Échap des dialogues.
  for (const [dialog, close] of [[gallery, closeGallery], [lightbox, closeLightbox]]) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  }

  document.getElementById('btn-renders').addEventListener('click', openGallery);
  document.getElementById('rg-close').addEventListener('click', closeGallery);
  document.getElementById('rg-regen').addEventListener('click', generateRenders);
  document.getElementById('rg-generate-videos').addEventListener('click', generateAIVideos);
  document.getElementById('rg-lb-close').addEventListener('click', closeLightbox);
  document.getElementById('rg-goto').addEventListener('click', () => {
    const shot = currentItem && (currentItem.shot || studio.shots.find(s => s.id === currentItem.id));
    closeGallery(false);
    if (!shot) return;
    releaseView(false);
    clientTools.setHour(shot.night ? SolarStudy.evening : SolarStudy.day);
    if (shot.pos[1] < 3) {
      setMode('walk');
      walkController.start({ x: shot.pos[0], z: shot.pos[2] });
      walkController.yaw = Math.atan2(-(shot.look[0] - shot.pos[0]), -(shot.look[2] - shot.pos[2]));
      walkController.updateCameraRotation();
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: motion.matches ? 'instant' : 'smooth' });
    }
  });

  // --- BASCULE IA / SCÈNE 3D AU REPOS DU PARCOURS ---
  let photoModeEnabled = true;
  const btnPhotoMode = document.getElementById('btn-photo-mode');
  const photoOverlay = document.getElementById('photo-mode-overlay');
  const photoControl = document.getElementById('photo-mode-control');
  const photoTitleEl = document.getElementById('photo-mode-title');
  const photoToggle = document.getElementById('photo-mode-toggle');
  let photoDebounceTimer = null;
  let photoRequestToken = 0;
  let photoAvailability = new Map();

  function setTourPhotoMode(realistic) {
    if (!currentPhotoView || !photoOverlay) return;
    photoOverlay.classList.toggle('is-visible', realistic && photoModeEnabled);
    photoToggle.textContent = realistic ? 'Voir en 3D' : 'Mode réaliste';
    photoToggle.setAttribute('aria-pressed', String(realistic));
  }

  function setPhotoMode(enabled) {
    photoModeEnabled = enabled;
    if (btnPhotoMode) {
      Icons.label(btnPhotoMode, photoModeEnabled ? 'sparkle' : 'camera', photoModeEnabled ? 'Mode photo : actif' : 'Mode photo : inactif');
      btnPhotoMode.classList.toggle('is-active', photoModeEnabled);
      btnPhotoMode.setAttribute('aria-pressed', String(photoModeEnabled));
    }
    if (!photoModeEnabled) hidePhotoOverlay();
    else onScrollStop();
  }

  if (btnPhotoMode) btnPhotoMode.addEventListener('click', () => setPhotoMode(!photoModeEnabled));
  if (photoToggle) photoToggle.addEventListener('click', () => {
    if (!currentPhotoView) return;
    setTourPhotoMode(!photoOverlay.classList.contains('is-visible'));
  });

  function hidePhotoOverlay() {
    photoRequestToken++;
    if (photoOverlay) photoOverlay.classList.remove('is-visible');
    if (photoControl) photoControl.classList.add('hidden');
    currentPhotoView = null;
  }

  // Le manifeste ne suffit pas : l'API ne renvoie que les images dont les fichiers existent.
  async function checkPhotoAvailable(shotId) {
    if (photoAvailability.has(shotId)) return photoAvailability.get(shotId);
    const media = await loadGalleryMedia();
    const shot = studio.shots.find(candidate => candidate.id === shotId);
    const baseShotId = shotId.startsWith('soir-') ? shotId.slice(5) : shotId;
    const baseShot = shot || studio.shots.find(candidate => candidate.id === baseShotId);
    const image = baseShot && aiImageForShot(baseShot, media.images);
    const view = image ? { image, label: shotId.startsWith('soir-') ? `${baseShot.label} · mode soirée` : baseShot.label } : null;
    photoAvailability.set(shotId, view);
    return view;
  }

  // À l'arrêt sur un waypoint, on propose l'IA si elle existe ; sinon la scène Three.js reste visible.
  function onScrollStop() {
    if (pinnedView || feedback.placing || feedback.panel.open || clientTools.panel.open || clientTools.measuring || document.getElementById('client-floor').value || document.getElementById('client-facade').value || houseScene.solarGeo || !photoModeEnabled || currentMode !== 'scroll') return;

    const waypoints = HOUSE_DATA.tourWaypoints;
    const numSteps = waypoints.length - 1;
    const rawStep = scrollProgress * numSteps;
    const nearestIdx = Math.round(rawStep);
    const dist = Math.abs(rawStep - nearestIdx);
    if (dist >= 0.22) return;

    const wp = waypoints[nearestIdx];
    let shotId = wp && wp.id;
    if (!shotId) return;
    if (houseScene.nightTarget > 0.5) {
      if (shotId === 'sejour') shotId = 'soir-sejour';
      else if (shotId === 'vue-aerienne') shotId = 'soir-aerien';
    }

    const token = ++photoRequestToken;
    checkPhotoAvailable(shotId).then(view => {
      const latestStep = Math.round(scrollProgress * numSteps);
      if (token !== photoRequestToken || pinnedView || clientTools.panel.open || clientTools.measuring || !photoModeEnabled || currentMode !== 'scroll' || latestStep !== nearestIdx || !view) return;
      currentPhotoView = view;
      photoOverlay.style.backgroundImage = `url("${view.image.file}")`;
      photoTitleEl.textContent = `RENDU IA · ${view.label || wp.label || shotId}`;
      photoControl.classList.remove('hidden');
      setTourPhotoMode(true);
    });
  }

  // Boutons Jour / Soir & Qualité
  const btnNight = document.getElementById('btn-night');
  const btnQuality = document.getElementById('btn-quality');
  const btnSection = document.getElementById('btn-section');
  const btnExplode = document.getElementById('btn-explode');
  const btnTimelapse = document.getElementById('btn-timelapse');
  if (btnTimelapse) btnTimelapse.addEventListener('click', () => houseScene.playConstruction());
  function toggleSectionCut() {
    const active = houseScene.toggleSectionCut();
    if (btnSection) { btnSection.classList.toggle('is-active', active); btnSection.setAttribute('aria-pressed', String(active)); }
  }
  function toggleExploded() {
    const requested = !houseScene.explodedTarget;
    const active = houseScene.setExploded(requested);
    if (btnExplode) { btnExplode.classList.toggle('is-active', active); btnExplode.setAttribute('aria-pressed', String(active)); }
  }
  if (btnSection) btnSection.addEventListener('click', toggleSectionCut);
  if (btnExplode) {
    const hasExplodableRoof = !!(houseScene.canopyGroup && houseScene.canopyGroup.children.some(mesh => mesh.userData.explodable));
    btnExplode.disabled = !houseScene.slabMeshes.length && !hasExplodableRoof;
    if (btnExplode.disabled) btnExplode.title = 'Disponible avec une dalle intermédiaire ou une toiture en dalle';
    btnExplode.addEventListener('click', toggleExploded);
  }
  const clientTools = new ClientTools(houseScene, hidePhotoOverlay);
  const pdfButton = document.getElementById('client-pdf');
  const pdfStatus = document.getElementById('client-pdf-status');
  let exportingPDF = false;
  async function exportClientPDF(variant = null) {
    if (exportingPDF || tourRecording || exportVideoButton.disabled) return;
    const variantButton = document.getElementById('variant-pdf');
    exportingPDF = pdfButton.disabled = variantButton.disabled = true;
    if (variant) variants.status.textContent = 'Composition de la brochure…';
    pdfStatus.textContent = 'Composition de la brochure…';
    try {
      await assetsReady;
      await ClientBrochure.exportPDF(HOUSE_DATA, studio, variant, () => {
        if (!variant) return;
        const floor = document.getElementById('client-floor').value, facade = document.getElementById('client-facade').value;
        clientTools.finishes.setFloor(variant.floor);
        clientTools.finishes.setFacade(variant.facade);
        return () => { clientTools.finishes.setFloor(floor); clientTools.finishes.setFacade(facade); };
      });
      pdfStatus.textContent = 'Brochure PDF téléchargée.';
    } catch (error) {
      console.error(error);
      pdfStatus.textContent = `Export PDF impossible : ${error.message}`;
    } finally {
      exportingPDF = pdfButton.disabled = variantButton.disabled = false;
      if (variant) variants.status.textContent = pdfStatus.textContent;
    }
  }
  pdfButton.addEventListener('click', () => exportClientPDF());

  // ---------- Cahier de plans : composer, approuver, puis assembler (architecte) ----------
  const bookOpen = document.getElementById('book-open');
  const bookDialog = document.getElementById('book-dialog');
  const bookFiles = document.getElementById('book-files');
  const bookStatus = document.getElementById('book-status');
  const bookDialogStatus = document.getElementById('book-dialog-status');
  const bookApproved = document.getElementById('book-approved');
  const bookExport = document.getElementById('book-export');
  const catalogButton = document.getElementById('catalog-pdf');
  bookOpen.hidden = invited;
  let bookViews = [];

  // Toute modification de la composition retire l’approbation : on approuve ce que l’on voit.
  function bookChanged() {
    bookApproved.checked = false;
    bookExport.disabled = true;
    const sheets = [...document.querySelectorAll('#book-sheets input:checked')].map(input => input.closest('label').querySelector('strong').textContent);
    const chosen = bookViews.filter(view => view.book).length;
    const annexes = bookFiles.files.length;
    document.getElementById('book-images-count').textContent = chosen ? `${chosen} sélectionnée${chosen > 1 ? 's' : ''}` : 'aucune sélection';
    document.getElementById('book-summary').textContent = `Couverture et cartouche, ${sheets.length ? sheets.map(name => name.charAt(0).toLowerCase() + name.slice(1)).join(', ') : 'aucune autre planche'}`
      + `${sheets.includes('Ambiances') ? ` (${chosen || Math.min(4, bookViews.length)} image${(chosen || Math.min(4, bookViews.length)) > 1 ? 's' : ''})` : ''}`
      + `${annexes ? `, ${annexes} PDF en annexe` : ''}.`;
  }
  function renderBookImages() {
    const grid = document.getElementById('book-images');
    grid.replaceChildren(...bookViews.map(view => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'book-image';
      button.setAttribute('aria-pressed', String(view.book));
      const img = document.createElement('img');
      img.src = view.preview || view.source; img.alt = ''; img.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = view.label;
      button.append(img, label);
      button.addEventListener('click', async () => {
        const next = !view.book;
        button.disabled = true;
        try {
          await setImageFlags(view.id, { book: next });
          view.book = next;
          button.setAttribute('aria-pressed', String(next));
          bookChanged();
        } catch (error) { bookDialogStatus.textContent = error.message; }
        finally { button.disabled = false; }
      });
      return button;
    }));
    if (!bookViews.length) grid.textContent = 'Aucun rendu publié : les vues de la maquette seront utilisées.';
  }
  bookOpen.addEventListener('click', async () => {
    if (invited) return;
    document.getElementById('book-sheets').replaceChildren(...PlanBook.SECTIONS.map(section => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" data-section="${section.id}" ${section.off ? '' : 'checked'}><span><strong></strong><small></small></span>`;
      label.querySelector('strong').textContent = section.label;
      label.querySelector('small').textContent = section.hint;
      label.querySelector('input').addEventListener('change', bookChanged);
      return label;
    }));
    bookDialogStatus.textContent = 'Chargement des images…';
    bookDialog.showModal();
    bookViews = await PlanBook.publishedViews(HOUSE_DATA);
    bookDialogStatus.textContent = '';
    renderBookImages();
    bookChanged();
  });
  bookFiles.addEventListener('change', () => {
    document.getElementById('book-files-list').replaceChildren(...Array.from(bookFiles.files, file => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><small></small>';
      li.firstChild.textContent = file.name;
      li.lastChild.textContent = `${Math.round(file.size / 1024)} Ko`;
      return li;
    }));
    bookChanged();
  });
  bookApproved.addEventListener('change', () => {
    bookExport.disabled = !bookApproved.checked;
    bookDialogStatus.textContent = bookApproved.checked ? 'Composition approuvée : vous pouvez exporter le PDF.' : '';
  });
  bookExport.addEventListener('click', async () => {
    if (!bookApproved.checked || exportingPDF || tourRecording || exportVideoButton.disabled || invited) return;
    const sections = Object.fromEntries([...document.querySelectorAll('#book-sheets input')].map(input => [input.dataset.section, input.checked]));
    exportingPDF = bookExport.disabled = pdfButton.disabled = true;
    try {
      await assetsReady;
      const result = await PlanBook.exportBook({ data: HOUSE_DATA, studio, files: bookFiles.files, sections,
        onStatus: message => { bookDialogStatus.textContent = message; } });
      const done = `Cahier de ${result.pages} planches téléchargé${result.annexes ? `, dont ${result.annexes} en annexe` : ''}.`;
      Motion.success(bookDialogStatus, done);
      Motion.success(bookStatus, done);
    } catch (error) {
      console.error(error);
      Motion.error(bookDialogStatus, `Cahier impossible : ${error.message}`, bookExport);
    } finally {
      exportingPDF = pdfButton.disabled = false;
      bookExport.disabled = !bookApproved.checked;
    }
  });

  // ---------- Catalogue des intérieurs : ouvert aux clients ----------
  catalogButton.addEventListener('click', async () => {
    if (exportingPDF) return;
    exportingPDF = catalogButton.disabled = true;
    try {
      const result = await PlanBook.exportCatalog({ data: HOUSE_DATA, onStatus: message => { bookStatus.textContent = message; } });
      Motion.success(bookStatus, `Catalogue de ${result.images} image${result.images > 1 ? 's' : ''} téléchargé.`);
    } catch (error) {
      Motion.error(bookStatus, error.message, catalogButton);
    } finally {
      exportingPDF = catalogButton.disabled = false;
    }
  });
  function toggleNight() {
    const geo = houseScene.solarGeo;
    const nightPreset = geo ? 22 : SolarStudy.evening;
    clientTools.setHour(houseScene.solarTarget >= nightPreset ? SolarStudy.day : nightPreset);
  }
  function setQuality(q) {
    if (tourRecording) return;
    houseScene.setQuality(q);
    btnQuality.textContent = q === 'high' ? 'Qualité : Haute' : 'Qualité : Normale';
  }
  btnNight.addEventListener('click', toggleNight);
  btnQuality.addEventListener('click', () => setQuality(houseScene.quality === 'high' ? 'normal' : 'high'));

  // 2. Initialisation du contrôleur de visite au scroll
  const scrollTour = new ScrollTour(houseScene, (room) => {
    updateHUD(room);
  });

  // 3. Initialisation du contrôleur de marche libre à la première personne
  const walkController = new WalkController(houseScene, (room) => {
    updateHUD(room);
  });

  // 4. Initialisation de la minimap 2D
  const minimap = new MiniMap(minimapCanvas, houseScene, (clickedRoom) => {
    // Si l'utilisateur clique sur une pièce de la minimap
    if (currentMode === 'walk') {
      walkController.start(clickedRoom.center);
    } else {
      // Trouver l'étape de scroll la plus proche de cette pièce
      jumpToRoom(clickedRoom);
    }
  });

  function updateHUD(room) {
    activeRoom = room;
    displayRoom(room);
  }

  function displayRoom(room, fallback = 'Vue d’ensemble') {
    roomNameEl.textContent = room?.name || fallback;
    roomSurfaceEl.textContent = Number.isFinite(room?.area) ? `${clientNumber.format(room.area)} m²${room.habitable ? '' : ' · annexe'}` : '';
    roomDescEl.textContent = room?.desc || '';
  }

  function setMode(newMode) {
    releaseView(false);
    currentMode = newMode;
    guidedActions.hidden = guidedAction.hidden = guideSelectLabel.hidden = currentMode === 'walk';
    guidedControls.classList.toggle('dock-free', currentMode === 'walk');
    hidePhotoOverlay();

    if (currentMode === 'walk') {
      scrollTour.update(1.0); // S'assurer que les murs sont à 100%
      walkController.start(activeRoom ? activeRoom.center : null);
      modeBadgeEl.textContent = 'Visite libre';
      modeBadgeEl.classList.add('is-fps');
      btnToggleMode.textContent = 'Revenir à la visite guidée';
      fpsHelpEl.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      walkController.stop();
      modeBadgeEl.textContent = 'Visite guidée';
      modeBadgeEl.classList.remove('is-fps');
      btnToggleMode.textContent = 'Visite libre (clavier)';
      fpsHelpEl.classList.add('hidden');
      document.body.style.overflow = 'auto';
      updateFromScroll();
    }
  }

  const resume = document.getElementById('variant-resume');
  function pinView(pose) {
    if (currentMode === 'walk') setMode('scroll');
    const hs = houseScene;
    pinnedView = pose;
    guidedActions.hidden = guidedAction.hidden = guideSelectLabel.hidden = true;
    guidedControls.classList.add('dock-free');
    hidePhotoOverlay();
    clearTimeout(photoDebounceTimer);
    if (Boolean(hs.sectionEnabled) !== pose.cut) toggleSectionCut();
    if (Boolean(hs.explodedTarget) !== pose.exploded) toggleExploded();
    hs.planOverlayManualVisible = pose.overlay ?? undefined;
    hs.setElevation(pose.e);
    hs.camera.position.fromArray(pose.p);
    hs.camera.quaternion.fromArray(pose.q);
    hs.camera.fov = pose.f;
    hs.camera.updateProjectionMatrix();
    scrollTour.detectCurrentRoom(hs.camera.position);
    elevationPercentEl.textContent = `${Math.round(pose.e * 100)}%`;
    modeBadgeEl.textContent = 'Vue figée';
    resume.hidden = false;
  }

  function releaseView(update = true) {
    if (!pinnedView) return;
    pinnedView = null;
    guidedActions.hidden = guidedAction.hidden = guideSelectLabel.hidden = currentMode === 'walk';
    guidedControls.classList.toggle('dock-free', currentMode === 'walk');
    resume.hidden = true;
    modeBadgeEl.textContent = 'Visite guidée';
    if (update) updateFromScroll();
  }

  const variants = new ClientVariants(clientTools, PROJECT_SLUG, pinView, exportClientPDF);
  const share = VariantState.readLink(location.hash, PROJECT_SLUG);
  const feedback = new ClientFeedback(clientTools, variants, share.channel);
  const panels = [...document.querySelectorAll('.client-panel-tabs > details')];
  const toolTrigger = document.getElementById('viewer-command-toggle');
  const commands = document.getElementById('viewer-commands');
  function showTools(show) {
    commands.hidden = !show;
    toolTrigger.setAttribute('aria-expanded', String(show));
    if (!show) panels.forEach(panel => { panel.open = false; });
  }
  toolTrigger.addEventListener('click', () => showTools(commands.hidden));
  panels.forEach(panel => panel.addEventListener('toggle', () => {
    if (!panel.open) return;
    panels.filter(other => other !== panel).forEach(other => { other.open = false; });
    hidePhotoOverlay();
  }));
  clientTools.measureButton.addEventListener('click', () => { if (clientTools.measuring && feedback.placing) feedback.cancel(); });
  resume.addEventListener('click', () => releaseView());

  btnToggleMode.addEventListener('click', () => {
    if (currentMode === 'scroll') {
      setMode('walk');
      document.getElementById('viewer-options').open = false;
      container.focus({ preventScroll: true });
    } else setMode('scroll');
  });

  // Capture locale du parcours complet via MediaRecorder (aucun appel IA).
  const exportVideoButton = document.getElementById('btn-export-video');
  const exportVideoStatus = document.getElementById('video-export-status');
  let tourRecording = null;
  const TOUR_RECORD_SECONDS = 24;

  function supportedRecordingMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    return [
      'video/mp4;codecs="avc1.42E01E"', 'video/mp4',
      'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
    ].find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function setVideoExportStatus(message) {
    if (exportVideoStatus) exportVideoStatus.textContent = message;
  }

  async function exportCinematicVideo() {
    if (invited) return;
    if (exportingPDF) { setVideoExportStatus('Patientez jusqu’à la fin de l’export PDF.'); return; }
    if (tourRecording) {
      tourRecording.stopRequested = true;
      exportVideoButton.textContent = '⏳ Finalisation…';
      return;
    }
    if (!window.MediaRecorder || !houseScene.renderer.domElement.captureStream) {
      setVideoExportStatus('Capture vidéo indisponible dans ce navigateur.');
      return;
    }

    exportVideoButton.disabled = true;
    setVideoExportStatus('Préparation du parcours…');
    const saved = {
      mode: currentMode, pinned: pinnedView,
      scrollY: window.scrollY,
      position: houseScene.camera.position.clone(),
      quaternion: houseScene.camera.quaternion.clone(),
      fov: houseScene.camera.fov,
      yaw: walkController.yaw,
      pitch: walkController.pitch
    };
    let stream;
    let recorder;
    let uploadStatus = '';
    let lockedControls = [];

    try {
      await assetsReady;
      if (currentMode === 'walk') setMode('scroll');
      clearTimeout(photoDebounceTimer);
      hidePhotoOverlay();
      const mimeType = supportedRecordingMime();
      stream = houseScene.renderer.domElement.captureStream(30);
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 6_000_000 });
      const chunks = [];
      const state = { recorder, stopRequested: false };
      tourRecording = state;
      clientTools.fields.disabled = variants.fields.disabled = feedback.fields.disabled = true;
      if (feedback.placing) feedback.cancel();
      releaseView(false);
      clientTools.toggleMeasure(false);
      clientTools.measureGroup.visible = false;
      lockedControls = [btnToggleMode, btnNight, btnQuality, btnPlanStyle, btnPhotoMode, btnSection, btnExplode, btnTimelapse, document.getElementById('btn-renders')];
      lockedControls.forEach(control => { if (control) control.disabled = true; });
      exportVideoButton.disabled = false;
      exportVideoButton.textContent = '⏹ Arrêter l’enregistrement';
      setVideoExportStatus('Capture du parcours complet…');
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };

      const stopped = new Promise(resolve => {
        recorder.addEventListener('stop', async () => {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
            if (!blob.size) throw new Error('Aucune image vidéo n’a été capturée.');
            const actualMime = (blob.type || 'video/webm').split(';')[0];
            const id = `visite-cinematique-${new Date().toISOString().replace(/[-:.]/g, '')}`;
            setVideoExportStatus('Vidéo capturée — enregistrement local…');
            exportVideoButton.disabled = true;
            exportVideoButton.textContent = '⏳ Enregistrement…';
            const response = await fetch(projectApi('api/save-video'), {
              method: 'POST',
              headers: {
                'Content-Type': actualMime,
                'X-Video-Id': id,
                'X-Video-Duration': String(Math.max(1, Math.round((performance.now() - startedAt) / 1000)))
              },
              body: blob
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
            galleryMediaCache = null;
            galleryInitialized = false;
            if (!gallery.classList.contains('hidden')) await buildGallery();
            uploadStatus = `${result.item.label} enregistrée (${(blob.size / (1024 * 1024)).toFixed(1)} Mo, ${actualMime.includes('mp4') ? 'MP4' : 'WebM'}). Disponible dans la galerie.`;
          } catch (error) {
            uploadStatus = `Export vidéo impossible : ${error.message}`;
          } finally {
            stream.getTracks().forEach(track => track.stop());
            resolve();
          }
        }, { once: true });
      });

      recorder.start(1000);
      const startedAt = performance.now();
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, 0);
      scrollProgress = 0;
      scrollTour.update(0);
      houseScene.render();

      await new Promise(resolve => {
        const advance = now => {
          if (state.stopRequested || recorder.state !== 'recording') return resolve();
          const progress = Math.min(1, (now - startedAt) / (TOUR_RECORD_SECONDS * 1000));
          scrollProgress = progress;
          scrollTour.update(progress);
          const elevation = Math.min(100, Math.round(Math.min(1, progress / HOUSE_DATA.config.elevationEnd) * 100));
          elevationPercentEl.textContent = `${elevation}%`;
          progressFillEl.style.width = `${progress * 100}%`;
          window.scrollTo(0, progress * maxScroll);
          exportVideoButton.textContent = `⏹ Arrêter · ${Math.round(progress * 100)}%`;
          if (progress >= 1) return resolve();
          requestAnimationFrame(advance);
        };
        requestAnimationFrame(advance);
      });
      if (recorder.state === 'recording') recorder.stop();
      await stopped;
    } catch (error) {
      uploadStatus = `Export vidéo impossible : ${error.message}`;
      if (recorder && recorder.state === 'recording') recorder.stop();
      if (stream) stream.getTracks().forEach(track => track.stop());
    } finally {
      tourRecording = null;
      clientTools.fields.disabled = variants.fields.disabled = feedback.fields.disabled = false;
      window.scrollTo(0, saved.scrollY);
      if (saved.mode === 'walk') {
        setMode('walk');
        houseScene.camera.position.copy(saved.position);
        houseScene.camera.quaternion.copy(saved.quaternion);
        houseScene.camera.fov = saved.fov;
        houseScene.camera.updateProjectionMatrix();
        walkController.yaw = saved.yaw;
        walkController.pitch = saved.pitch;
        walkController.updateCameraRotation();
      } else {
        setMode('scroll');
        updateFromScroll();
      }
      if (saved.pinned) pinView(saved.pinned);
      lockedControls.forEach(control => { if (control) control.disabled = false; });
      exportVideoButton.disabled = false;
      Icons.label(exportVideoButton, 'video', 'Exporter l’animation vidéo');
      setVideoExportStatus(uploadStatus || '');
    }
  }

  exportVideoButton.addEventListener('click', exportCinematicVideo);

  window.addEventListener('keydown', (e) => {
    if (!inVisit() || e.defaultPrevented || gallery.open) return;
    if (tourRecording) {
      if (e.code === 'Escape') tourRecording.stopRequested = true;
      return;
    }
    if (e.code === 'Escape' && feedback.placing) { feedback.cancel(); return; }
    if (e.code === 'Escape' && clientTools.measuring) { clientTools.toggleMeasure(false); return; }
    if (e.code === 'Escape') {
      const panel = panels.find(item => item.open);
      if (panel) { panel.open = false; panel.querySelector('summary').focus(); e.preventDefault(); return; }
      if (currentMode === 'walk') {
        setMode('scroll');
        (commands.hidden ? toolTrigger : document.querySelector('#viewer-options summary')).focus();
        e.preventDefault();
        return;
      }
      if (!commands.hidden && !document.body.classList.contains('is-presenting')) { showTools(false); toolTrigger.focus(); e.preventDefault(); return; }
    }
    if (!shortcuts.checked || e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.code === 'KeyM' && !e.repeat && gallery.classList.contains('hidden')) {
      if (feedback.placing) feedback.cancel();
      clientTools.toggleMeasure();
    }
    // Touche P : calque du plan original superposé (vérification de fidélité)
    if (e.code === 'KeyP') {
      houseScene.togglePlanOverlay();
    }
    if (e.code === 'KeyN') toggleNight();
    if (e.code === 'KeyB') togglePlanStyle();
    if (e.code === 'KeyC') toggleSectionCut();
    if (e.code === 'KeyX' && !btnExplode.disabled) toggleExploded();
    if (e.code === 'KeyF') setPhotoMode(!photoModeEnabled);
    if (e.code === 'KeyR') void openGallery();
    if (e.code === 'KeyH') setQuality(houseScene.quality === 'high' ? 'normal' : 'high');
  });

  // --- GESTION DU SCROLL ---
  function updateFromScroll() {
    if (!inVisit() || currentMode !== 'scroll' || tourRecording || pinnedView) return;
    hidePhotoOverlay();
    clearTimeout(photoDebounceTimer);
    photoDebounceTimer = setTimeout(onScrollStop, 350);

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = scrollHeight > 0 ? Math.max(0, Math.min(1, scrollTop / scrollHeight)) : 0;

    // Mise à jour de la visite cinématique
    scrollTour.update(scrollProgress);

    // Pourcentage d'élévation
    const elev = Math.min(100, Math.round(Math.min(1, scrollProgress / HOUSE_DATA.config.elevationEnd) * 100));
    elevationPercentEl.textContent = `${elev}%`;
    progressFillEl.style.width = `${scrollProgress * 100}%`;
    syncGuidedControls();
  }

  window.addEventListener('scroll', () => {
    updateFromScroll();
  }, { passive: true });

  // Reprend les étapes de la même spline, sans mouvement automatique à l’ouverture.
  const guidedControls = document.getElementById('guided-controls');
  const guidedLabel = document.getElementById('guided-step');
  const guidedPrev = document.getElementById('guided-prev');
  const guidedNext = document.getElementById('guided-next');
  const guidedAction = document.getElementById('guided-action');
  const guidedActions = document.getElementById('guided-actions');
  const guidedCount = document.getElementById('guided-count');
  const timeline = document.getElementById('guided-timeline');
  const guidedAnnouncement = document.getElementById('guided-announcement');
  const guideSelect = document.getElementById('guided-select');
  const guideSelectLabel = document.getElementById('guided-select-label');
  const waypoints = HOUSE_DATA.tourWaypoints;
  const lastWaypoint = Math.max(1, waypoints.length - 1);
  const elevation = Math.min(1, HOUSE_DATA.config.elevationEnd);
  const hasRoomSteps = waypoints.some(point => point.room);
  const stages = [{ progress: 0, label: 'Plan 2D' }, { progress: elevation, label: 'Maquette 3D' }, ...waypoints.flatMap((point, i) => {
    const progress = i / lastWaypoint;
    return progress > elevation && (point.room || (!hasRoomSteps && point.label) || i === lastWaypoint) ? [{ progress, label: point.label || 'Vue d’ensemble' }] : [];
  })];
  guideSelect.replaceChildren(...stages.map((stage, index) => new Option(`${index + 1}. ${stage.label}`, index)));
  const segments = stages.map(() => document.createElement('span'));
  timeline.replaceChildren(...segments);
  let guidedIndex = -1;
  function syncGuidedControls() {
    let index = stages.length - 1;
    while (index && stages[index].progress > scrollProgress + 0.002) index--;
    displayRoom(index < 2 ? null : activeRoom, stages[index].label);
    if (index === guidedIndex) return;
    guidedIndex = index;
    guideSelect.value = String(index);
    guidedLabel.textContent = 'Parcours guidé';
    guidedCount.textContent = `${index + 1} / ${stages.length}`;
    segments.forEach((segment, i) => { segment.classList.toggle('is-past', i < index); segment.classList.toggle('is-current', i === index); });
    if (index === 0 && document.activeElement === guidedPrev) guidedNext.focus();
    guidedPrev.disabled = index === 0;
    if (index === stages.length - 1 && document.activeElement === guidedNext) guidedAction.focus();
    guidedNext.disabled = index === stages.length - 1;
    guidedAction.textContent = index === 0 ? 'Démarrer la visite →' : index === stages.length - 1 ? 'Revoir le plan ↺' : 'Continuer →';
  }
  function navigateStage(index, smooth = false) {
    if (tourRecording || !stages[index]) return;
    hidePhotoOverlay();
    const { progress, label } = stages[index];
    const top = Math.ceil((document.documentElement.scrollHeight - window.innerHeight) * progress);
    window.scrollTo({ top, behavior: smooth && !motion.matches ? 'smooth' : 'instant' });
    if (!smooth || motion.matches) updateFromScroll();
    guidedAnnouncement.textContent = `Étape ${index + 1} sur ${stages.length} : ${label}`;
  }
  guideSelect.addEventListener('change', () => navigateStage(Number(guideSelect.value)));
  guidedPrev.addEventListener('click', () => navigateStage(guidedIndex - 1));
  guidedNext.addEventListener('click', () => navigateStage(guidedIndex + 1));
  guidedAction.addEventListener('click', () => navigateStage((guidedIndex + 1) % stages.length));
  const radar = document.getElementById('minimap-toggle');
  const radarPanel = document.getElementById('minimap-panel');
  radar.addEventListener('click', () => {
    radarPanel.hidden = !radarPanel.hidden;
    radar.setAttribute('aria-expanded', String(!radarPanel.hidden));
  });
  syncGuidedControls();

  // Téléportation fluide vers une pièce lors d'un clic
  function jumpToRoom(room) {
    releaseView(false);
    hidePhotoOverlay();
    const waypoints = HOUSE_DATA.tourWaypoints;
    let bestIndex = waypoints.findIndex(w => w.room === room.id);

    // Sinon : waypoint à hauteur d'homme le plus proche du centre de la pièce
    if (bestIndex < 0) {
      let best = Infinity;
      waypoints.forEach((w, i) => {
        if (w.pos[1] > 3) return;
        const d = Math.hypot(w.pos[0] - room.center.x, w.pos[2] - room.center.z);
        if (d < best) { best = d; bestIndex = i; }
      });
    }

    const targetRatio = Math.max(0, bestIndex) / (waypoints.length - 1);
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({
      top: targetRatio * scrollHeight,
      behavior: motion.matches ? 'instant' : 'smooth'
    });
  }

  // --- BOUCLE D'ANIMATION PRINCIPALE (60 FPS) ---
  let lastFrame = performance.now();
  let slowTime = 0;
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!inVisit() && !tourRecording) return;

    // Garde-fou 60 FPS : repli automatique en qualité normale si < 45 FPS pendant 3 s (onglet visible)
    if (!tourRecording && houseScene.quality === 'high' && now > 5000 && document.visibilityState === 'visible' && document.hasFocus()) {
      if (dt < 0.09) slowTime = dt > 1 / 45 ? slowTime + dt : Math.max(0, slowTime - dt);
      if (slowTime > 3) { setQuality('normal'); slowTime = 0; }
    }
    houseScene.updateRealism(dt);

    if (currentMode === 'walk') {
      walkController.update();
    }

    // Plafonds seulement à hauteur d'homme : intérieur réaliste, maquette ouverte vue d'en haut
    houseScene.setCeilingsVisible(pinnedView?.ceilings ?? (houseScene.camera.position.y < 2.7 && houseScene.elevationProgress >= 0.99));

    if (!radarPanel.hidden) minimap.update(activeRoom ? activeRoom.id : null);
    houseScene.render();
    const suppressed = Boolean(tourRecording) || !gallery.classList.contains('hidden') || photoOverlay.classList.contains('is-visible');
    clientTools.update(now, suppressed || feedback.placing);
    feedback.update(now, suppressed);
  }

  // Démarrage initial
  if (clientTools.solarOptions.configured) clientTools.solarOptions.restore(clientTools.solarOptions.configured, SolarStudy.day);
  updateFromScroll();
  if (share.variant) variants.apply(share.variant);
  if (share.invalid) { document.getElementById('client-variants').open = true; variants.status.textContent = 'Lien partagé incomplet ou incompatible avec ce projet.'; }
  const waypoint = new URLSearchParams(location.hash.slice(1)).get('wp');
  if (!pinnedView && inVisit() && /^\d+$/.test(waypoint || '') && waypoints.length > 1) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * Math.min(waypoints.length - 1, Number(waypoint)) / lastWaypoint, behavior: 'instant' });
    updateFromScroll();
  }
  document.addEventListener('workspace:enter-visit', () => houseScene.onResize());
  document.addEventListener('workspace:reveal-visit', () => {
    if (guidedIndex === 0 && !pinnedView && !motion.matches) navigateStage(1, true);
  });
  document.addEventListener('workspace:leave-visit', () => {
    if (tourRecording) tourRecording.stopRequested = true;
    if (currentMode === 'walk') setMode('scroll');
    if (gallery.open) closeGallery(false);
    if (document.body.classList.contains('is-presenting')) document.getElementById('btn-present').click();
    showTools(false);
    if (feedback.placing) feedback.cancel();
    if (clientTools.measuring) clientTools.toggleMeasure(false);
    clearTimeout(photoDebounceTimer);
    hidePhotoOverlay();
  });
  animate();
  return true;
};
