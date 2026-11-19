/**
 * MASTER APPLICATION ORCHESTRATOR
 * Coordonne la scène 3D, la visite au scroll, la visite libre au clavier et le HUD
 */

document.addEventListener('DOMContentLoaded', () => {
  const PROJECT_SLUG = window.ACTIVE_PROJECT_SLUG || HOUSE_DATA.meta?.slug || 'villa-serena';
  const projectApi = endpoint => `${endpoint}?project=${encodeURIComponent(PROJECT_SLUG)}`;
  const projectMedia = path => `projects/${encodeURIComponent(PROJECT_SLUG)}/generated/${path}`;
  const projectPicker = document.getElementById('project-picker');
  if (projectPicker) {
    fetch('api/projects', { cache: 'no-store' }).then(response => response.ok ? response.json() : []).then(projects => {
      projectPicker.replaceChildren();
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.slug;
        option.textContent = project.name;
        projectPicker.appendChild(option);
      });
      if (!projects.some(project => project.slug === PROJECT_SLUG)) {
        const fallback = document.createElement('option');
        fallback.value = PROJECT_SLUG;
        fallback.textContent = PROJECT_SLUG === 'villa-serena' ? 'Villa Serena' : PROJECT_SLUG;
        projectPicker.prepend(fallback);
      }
      projectPicker.value = PROJECT_SLUG;
    }).catch(() => {
      projectPicker.innerHTML = '<option value="villa-serena">Villa Serena</option>';
      projectPicker.value = PROJECT_SLUG;
    });
    projectPicker.addEventListener('change', () => {
      if (!projectPicker.value) return;
      localStorage.setItem('lastProject', projectPicker.value);
      location.href = `index.html?project=${encodeURIComponent(projectPicker.value)}`;
    });
  }
  const container = document.getElementById('webgl-container');
  const minimapCanvas = document.getElementById('minimap-canvas');

  // Éléments du HUD
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
  const houseScene = new HouseScene(container);
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

    if (!aiImage && shot.ext !== 'png') {
      const modelChoice = document.createElement('select');
      modelChoice.className = 'rg-model-choice';
      modelChoice.setAttribute('aria-label', `Modèle de photoréalisation — ${shot.label}`);
      modelChoice.innerHTML = '<option value="google/gemini-3.1-flash-image">Gemini 3.1 Flash Image — ≈ 0,068 $</option><option value="microsoft/mai-image-2.7-flash">MAI-Image 2.7 Flash — coût variable par jeton</option>';
      const estimate = document.createElement('span');
      estimate.className = 'rg-cost-estimate';
      const updateEstimate = () => {
        estimate.textContent = modelChoice.value === 'google/gemini-3.1-flash-image'
          ? 'Estimation indicative : ≈ 0,068 $ / image ; le coût réel OpenRouter sera affiché après l’appel.'
          : 'Estimation variable : 1,75 $/M jetons texte + 2,50 $/M jetons image en entrée + 10 $/M jetons image en sortie. Total exact inconnu avant génération.';
      };
      modelChoice.addEventListener('change', updateEstimate);
      modelChoice.addEventListener('click', event => event.stopPropagation());
      updateEstimate();
      card.append(modelChoice, estimate);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn-toggle btn-small rg-card-action';
    if (aiImage) {
      action.textContent = '↔ Comparer Avant (3D) / Après (IA)';
      action.addEventListener('click', event => {
        event.stopPropagation();
        openLightbox(shot, aiImage, true);
      });
    } else if (shot.ext !== 'png') {
      action.textContent = '✨ Générer le rendu photoréaliste (IA)';
      action.addEventListener('click', event => {
        event.stopPropagation();
        const model = card.querySelector('.rg-model-choice').value;
        photorealize(shot, action, model);
      });
    } else {
      action.textContent = 'Plan de référence';
      action.disabled = true;
    }
    card.appendChild(action);
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
      ? '🎥 Capture 3D locale'
      : item.generator ? '✨ Rendu IA' : '🎞 Vidéo');
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
    meta.innerHTML = `
      <div>
        <div class="rg-card-title">${escapeHtml(item.label)}</div>
        <div class="rg-card-sub">${item.duration ? item.duration + ' s · ' : ''}${escapeHtml(videoSourceLabel)} · ${(item.format || item.file.split('.').pop()).toUpperCase()}</div>
      </div>
      <span class="btn-toggle btn-small" style="font-size:10px; padding:3px 8px;">▶ Visionner</span>
    `;
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

  async function photorealize(item, button, model) {
    const costEstimate = model === 'google/gemini-3.1-flash-image'
      ? 'Estimation indicative : environ 0,068 $ pour une image (coût observé ; variable selon l’endpoint).'
      : 'Estimation variable, sans montant fixe : 1,75 $/M jetons texte + 2,50 $/M jetons image en entrée + 10 $/M jetons image en sortie. Le nombre de jetons dépend du traitement.';
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
      galleryMediaCache = { images: [], videos: [] };
    }
    return galleryMediaCache;
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
    const shots3D = studio.results;

    addSection('🏛 Vues de la maquette 3D', 'Captures locales gratuites · les rendus IA disponibles se comparent sur la même carte');
    let withAI = 0;
    shots3D.forEach(shot => {
      const aiImage = aiImageForShot(shot, media.images);
      if (aiImage) withAI++;
      grid.appendChild(createViewCard(shot, aiImage));
    });

    if (media.videos.length) {
      addSection('🎬 Animations vidéo disponibles', 'Seuls les fichiers MP4 présents sont affichés');
      media.videos.forEach(video => grid.appendChild(createVideoCard(video)));
    }

    status.textContent = `${shots3D.length} vues 3D capturées gratuitement · ${withAI} rendu(s) IA disponible(s)${media.videos.length ? ` · ${media.videos.length} vidéo(s)` : ''}`;
    galleryInitialized = true;
  }

  // Visionneuse commune : une vue 3D de base, avec comparaison IA uniquement si un fichier réel existe.
  function openLightbox(item, aiImage = null, startInCompareMode = false) {
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
    videoEl.src = '';
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
        ? '🎥 Capture 3D locale'
        : item.generator ? '✨ Rendu IA' : '🎞 Vidéo');
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

      if (aiImage) {
        btnCompare.classList.remove('hidden');
        const toggleCompare = enable => {
          isCompareActive = enable;
          if (enable) {
            fullImg.classList.add('hidden');
            compareView.classList.remove('hidden');
            compare3D.src = baseUrl;
            compareGen.src = aiImage.file;
            btnCompare.textContent = '🖼 Afficher une seule vue';
          } else {
            compareView.classList.add('hidden');
            fullImg.classList.remove('hidden');
            fullImg.src = baseUrl;
            btnCompare.textContent = '↔ Comparer Avant (3D) / Après (IA)';
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
  }

  function closeLightbox() {
    const videoEl = document.getElementById('rg-video');
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
    }
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
          status.textContent = `✨ ${clip.label} enregistrée en local${realCost}.`;
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
    if (currentMode === 'walk') setMode('scroll');
    if (feedback.placing) feedback.cancel();
    if (clientTools.measuring) clientTools.toggleMeasure(false);
    hidePhotoOverlay();
    gallery.classList.remove('hidden');
    if (!galleryInitialized) {
      if (studio.results.length) await buildGallery();
      else await generateRenders();
    }
  }

  function closeGallery() {
    closeLightbox();
    gallery.classList.add('hidden');
  }

  document.getElementById('btn-renders').addEventListener('click', openGallery);
  document.getElementById('rg-close').addEventListener('click', closeGallery);
  document.getElementById('rg-regen').addEventListener('click', generateRenders);
  document.getElementById('rg-generate-videos').addEventListener('click', generateAIVideos);
  document.getElementById('rg-lb-close').addEventListener('click', closeLightbox);
  document.getElementById('rg-goto').addEventListener('click', () => {
    const shot = currentItem && (currentItem.shot || studio.shots.find(s => s.id === currentItem.id));
    closeGallery();
    if (!shot) return;
    releaseView(false);
    clientTools.setHour(shot.night ? SolarStudy.evening : SolarStudy.day);
    if (shot.pos[1] < 3) {
      setMode('walk');
      walkController.start({ x: shot.pos[0], z: shot.pos[2] });
      walkController.yaw = Math.atan2(-(shot.look[0] - shot.pos[0]), -(shot.look[2] - shot.pos[2]));
      walkController.updateCameraRotation();
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
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
      btnPhotoMode.textContent = photoModeEnabled ? '✨ Mode photo : Actif' : '📷 Mode photo : Inactif';
      btnPhotoMode.classList.toggle('is-active', photoModeEnabled);
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
    if (btnSection) { btnSection.classList.toggle('is-active', active); btnSection.textContent = active ? '✂ Coupe : active' : '✂ Coupe'; }
  }
  function toggleExploded() {
    const requested = !houseScene.explodedTarget;
    const active = houseScene.setExploded(requested);
    if (btnExplode) { btnExplode.classList.toggle('is-active', active); btnExplode.textContent = active ? '↕ Vue éclatée : active' : '↕ Vue éclatée'; }
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
    if (!room) return;

    roomNameEl.textContent = room.name || 'VILLA CONTEMPORAINE';
    roomSurfaceEl.textContent = room.surface || '';
    roomDescEl.textContent = room.desc || '';
  }

  function setMode(newMode) {
    releaseView(false);
    currentMode = newMode;
    hidePhotoOverlay();

    if (currentMode === 'walk') {
      scrollTour.update(1.0); // S'assurer que les murs sont à 100%
      walkController.start(activeRoom ? activeRoom.center : null);
      modeBadgeEl.textContent = 'MODE VISITE LIBRE (FPS)';
      modeBadgeEl.classList.add('is-fps');
      btnToggleMode.textContent = 'Revenir au Plan / Scroll';
      fpsHelpEl.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      walkController.stop();
      modeBadgeEl.textContent = 'MODE PLAN & SCROLL 3D';
      modeBadgeEl.classList.remove('is-fps');
      btnToggleMode.textContent = 'Explorer en Visite Libre (ZQSD)';
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
    modeBadgeEl.textContent = 'VUE FIGÉE';
    resume.hidden = false;
  }

  function releaseView(update = true) {
    if (!pinnedView) return;
    pinnedView = null;
    resume.hidden = true;
    modeBadgeEl.textContent = 'MODE PLAN & SCROLL 3D';
    if (update) updateFromScroll();
  }

  const variants = new ClientVariants(clientTools, PROJECT_SLUG, pinView, exportClientPDF);
  const share = VariantState.readLink(location.hash, PROJECT_SLUG);
  const feedback = new ClientFeedback(clientTools, variants, share.channel);
  const panels = [clientTools.panel, document.getElementById('client-variants'), feedback.panel];
  panels.forEach(panel => panel.addEventListener('toggle', () => {
    if (!panel.open) return;
    panels.filter(other => other !== panel).forEach(other => { other.open = false; });
    hidePhotoOverlay();
  }));
  clientTools.measureButton.addEventListener('click', () => { if (clientTools.measuring && feedback.placing) feedback.cancel(); });
  resume.addEventListener('click', () => releaseView());

  btnToggleMode.addEventListener('click', () => {
    setMode(currentMode === 'scroll' ? 'walk' : 'scroll');
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
      exportVideoButton.textContent = '🎥 Exporter l’animation vidéo';
      setVideoExportStatus(uploadStatus || '');
    }
  }

  exportVideoButton.addEventListener('click', exportCinematicVideo);

  window.addEventListener('keydown', (e) => {
    if (tourRecording) {
      if (e.code === 'Escape') tourRecording.stopRequested = true;
      return;
    }
    if (e.code === 'Escape' && feedback.placing) { feedback.cancel(); return; }
    if (e.code === 'Escape' && clientTools.measuring) { clientTools.toggleMeasure(false); return; }
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.code === 'KeyM' && !e.repeat && gallery.classList.contains('hidden')) {
      if (feedback.placing) feedback.cancel();
      clientTools.toggleMeasure();
    }
    // La touche Espace bascule le mode
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      setMode(currentMode === 'scroll' ? 'walk' : 'scroll');
    }
    // Touche P : calque du plan original superposé (vérification de fidélité)
    if (e.code === 'KeyP') {
      houseScene.togglePlanOverlay();
    }
    if (e.code === 'KeyN') toggleNight();
    if (e.code === 'KeyB') togglePlanStyle();
    if (e.code === 'KeyC') toggleSectionCut();
    if (e.code === 'KeyX') toggleExploded();
    if (e.code === 'KeyF') setPhotoMode(!photoModeEnabled);
    if (e.code === 'KeyR') (gallery.classList.contains('hidden') ? openGallery() : closeGallery());
    if (e.code === 'Escape' && !gallery.classList.contains('hidden')) closeGallery();
    if (e.code === 'KeyH') setQuality(houseScene.quality === 'high' ? 'normal' : 'high');
  });

  // --- GESTION DU SCROLL ---
  function updateFromScroll() {
    if (currentMode !== 'scroll' || tourRecording || pinnedView) return;
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
  }

  window.addEventListener('scroll', () => {
    updateFromScroll();
  }, { passive: true });

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
      behavior: 'smooth'
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

    minimap.update(activeRoom ? activeRoom.id : null);
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
  animate();
});
