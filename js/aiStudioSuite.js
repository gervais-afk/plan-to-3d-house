/**
 * STUDIO IA AVANCÉ — 6 capacités IA modernes pour ArchiCam Studio :
 *  1. Insertion paysagère sur photo réelle du terrain (placement interactif + analyse Gemini + sublimation IA)
 *  2. Retouche ciblée par zone (pinceau masque) & styles cohérents multi-vues (image de référence commune)
 *  3. Vidéo enchaînée Image de départ (A) → Image d’arrivée (B) (Transition HD locale + IA Seedance)
 *  4. Film de présentation narré : script & voix off d’architecte (Gemini TTS WAV) + ambiance sonore mixée MP4
 *  5. Panoramas 360° équirectangulaires capturés depuis Three.js + visionneuse interactive 360° + photoréalisation IA
 *  6. Audit bioclimatique physique, optimisation de plan & rédaction Notice Architecturale + CCTP (Gemini)
 */
const AiStudioSuite = (() => {
  const STYLE_PRESETS = {
    tropical: {
      name: 'Tropical contemporain',
      prompt: 'Contemporary tropical architecture aesthetic: warm lime-white plaster, natural teak wood louvers and slatted ceilings, honed travertine limestone tiles, linen textiles, lush tropical foliage, soft equatorial daylight.'
    },
    minimaliste: {
      name: 'Minimaliste chaud',
      prompt: 'Warm minimalist architectural interior and exterior: matte micro-cement floors, pale oak millwork, sand-toned mineral plaster walls, sculpted neutral fabrics, architectural recessed lighting, calm serene atmosphere.'
    },
    afro: {
      name: 'Afro-moderne raffiné',
      prompt: 'Refined Afro-modern contemporary villa: handcrafted warm wood joinery, laterite terracotta and natural stone accents, woven natural fiber textures, airy shaded verandas, rich warm golden daylight.'
    },
    luxe: {
      name: 'Luxe minéral',
      prompt: 'Quiet luxury mineral architecture: large-format honed limestone and dark bronze frames, smoked oak cabinetry, sculptural indirect lighting, crisp architectural reflections, magazine editorial photography.'
    }
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className') node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function dataUrlFromImageUrl(url, maxDim = 1400) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(16, Math.round(img.naturalWidth * scale));
        const h = Math.max(16, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Impossible de charger cette image.'));
      img.src = url;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible.'));
      img.src = src;
    });
  }

  /**
   * Capture un vrai panorama 360° équirectangulaire (projection 2:1) au point de vue donné dans Three.js
   * en rendant les 6 faces d'un cube (90° FOV) puis en re-échantillonnant sphériquement sur un canvas 2D.
   */
  function captureEquirectangular360(houseScene, origin, { faceSize = 384, outW = 1536, outH = 768 } = {}) {
    const renderer = houseScene?.renderer;
    const scene = houseScene?.scene;
    if (!renderer || !scene || typeof THREE === 'undefined') {
      throw new Error('Scène 3D indisponible pour la capture 360°.');
    }
    const prevCeilings = houseScene.ceilingsGroup ? houseScene.ceilingsGroup.visible : true;
    const prevTarget = renderer.getRenderTarget();
    if (houseScene.ceilingsGroup) houseScene.ceilingsGroup.visible = true;

    // 6 directions standards : 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
    const dirs = [
      { look: [1, 0, 0], up: [0, 1, 0] },
      { look: [-1, 0, 0], up: [0, 1, 0] },
      { look: [0, 1, 0], up: [0, 0, -1] },
      { look: [0, -1, 0], up: [0, 0, 1] },
      { look: [0, 0, 1], up: [0, 1, 0] },
      { look: [0, 0, -1], up: [0, 1, 0] }
    ];
    const cam = new THREE.PerspectiveCamera(90, 1, 0.08, 160);
    cam.position.set(origin.x, origin.y, origin.z);
    const rt = new THREE.WebGLRenderTarget(faceSize, faceSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    const faces = [];
    try {
      for (const d of dirs) {
        cam.up.set(d.up[0], d.up[1], d.up[2]);
        cam.lookAt(origin.x + d.look[0], origin.y + d.look[1], origin.z + d.look[2]);
        cam.updateMatrixWorld(true);
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, cam);
        const pixels = new Uint8Array(faceSize * faceSize * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, faceSize, faceSize, pixels);
        faces.push(pixels);
      }
    } finally {
      renderer.setRenderTarget(prevTarget);
      rt.dispose();
      if (houseScene.ceilingsGroup) houseScene.ceilingsGroup.visible = prevCeilings;
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(outW, outH);
    const dst = imgData.data;

    for (let y = 0; y < outH; y++) {
      const theta = ((y + 0.5) / outH) * Math.PI; // 0 (zénith) -> PI (nadir)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      for (let x = 0; x < outW; x++) {
        const phi = ((x + 0.5) / outW) * 2 * Math.PI - Math.PI; // -PI .. +PI
        const dx = sinT * Math.sin(phi);
        const dy = cosT;
        const dz = -sinT * Math.cos(phi);

        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        let faceIdx = 0, u = 0, v = 0;
        if (ax >= ay && ax >= az) {
          if (dx > 0) { faceIdx = 0; u = -dz / ax; v = dy / ax; }
          else        { faceIdx = 1; u = dz / ax;  v = dy / ax; }
        } else if (ay >= ax && ay >= az) {
          if (dy > 0) { faceIdx = 2; u = dx / ay;  v = -dz / ay; }
          else        { faceIdx = 3; u = dx / ay;  v = dz / ay; }
        } else {
          if (dz > 0) { faceIdx = 4; u = dx / az;  v = dy / az; }
          else        { faceIdx = 5; u = -dx / az; v = dy / az; }
        }
        const fx = Math.max(0, Math.min(faceSize - 1, Math.floor((u * 0.5 + 0.5) * (faceSize - 1))));
        const fy = Math.max(0, Math.min(faceSize - 1, Math.floor((v * 0.5 + 0.5) * (faceSize - 1))));
        const srcIdx = (fy * faceSize + fx) * 4;
        const dstIdx = (y * outW + x) * 4;
        const src = faces[faceIdx];
        dst[dstIdx] = src[srcIdx];
        dst[dstIdx + 1] = src[srcIdx + 1];
        dst[dstIdx + 2] = src[srcIdx + 2];
        dst[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function create(opts) {
    const { projectSlug, houseScene, getGalleryItems, refreshGallery, getNorthAngle } = opts;
    const dialog = document.getElementById('dlg-ai-studio');
    if (!dialog) return null;

    let aiCapabilities = { configured: false, gemini: false, openRouter: false };
    let galleryImages = [];
    let currentTab = 'site';

    // --- ÉTAT TAB 1 : INSERTION SUR TERRAIN ---
    let siteBgImg = null;
    let siteBgDataUrl = '';
    let siteModelImg = null;
    let siteCompositeUrl = '';
    let siteAiResultUrl = '';
    const siteState = { x: 0.5, y: 0.62, scale: 0.64, shadow: 0.42, warmth: 1.0, dragging: false, dragDx: 0, dragDy: 0 };

    // --- ÉTAT TAB 2 : RETOUCHE & STYLES ---
    let inpaintBaseImg = null;
    let inpaintBaseUrl = '';
    let inpaintStyleKey = 'tropical';
    let inpaintDrawing = false;
    let inpaintMaskDirty = false;
    let inpaintResultUrl = '';

    // --- ÉTAT TAB 4 : VOIX OFF ---
    let latestVoiceFile = '';

    // --- ÉTAT TAB 5 : VISIONNEUSE 360° ---
    let panoViewer = null;
    let panoList = [];
    let activePano = null;

    // Construction propre de l'interface du dialogue
    dialog.textContent = '';
    const statusChip = el('span', { className: 'ai-studio-status-chip', textContent: 'Vérification des moteurs IA…' });
    const closeBtn = el('button', { type: 'button', className: 'btn-toggle btn-small', textContent: 'Fermer', onClick: () => dialog.close() });

    const tabsSpec = [
      { id: 'site', label: '1 · Terrain & Insertion' },
      { id: 'inpaint', label: '2 · Retouche & Styles' },
      { id: 'transition', label: '3 · Vidéo Début → Fin' },
      { id: 'voiceover', label: '4 · Film & Voix Off IA' },
      { id: 'pano360', label: '5 · Panoramas 360°' },
      { id: 'bioclimatic', label: '6 · Audit Bioclimatique & CCTP' }
    ];

    const tabButtons = new Map();
    const panels = new Map();

    const tabBar = el('div', { className: 'ai-studio-tabs', role: 'tablist', 'aria-label': 'Outils IA avancés' },
      tabsSpec.map(t => {
        const b = el('button', {
          type: 'button', role: 'tab', className: 'ai-studio-tab',
          id: `ai-tab-${t.id}`, 'aria-selected': String(t.id === currentTab),
          'aria-controls': `ai-panel-${t.id}`, textContent: t.label,
          onClick: () => selectTab(t.id)
        });
        tabButtons.set(t.id, b);
        return b;
      })
    );

    const body = el('div', { className: 'ai-studio-body' });

    // =========================================================================
    // TAB 1 : INSERTION PAYSAGÈRE SUR LE VRAI TERRAIN
    // =========================================================================
    const siteCanvas = el('canvas', { width: 1280, height: 720 });
    const siteMsg = el('p', { className: 'ai-msg', role: 'status' });
    const sitePromptInput = el('textarea', {
      id: 'ai-site-prompt',
      placeholder: 'Consignes d’insertion paysagère (ex. harmoniser le ciel, prolonger la pelouse, ombres portées naturelles au sol)…'
    });
    const siteScaleOut = el('output', { textContent: '64%' });
    const siteYOut = el('output', { textContent: '62%' });
    const siteShadowOut = el('output', { textContent: '42%' });
    const siteWarmthOut = el('output', { textContent: '100%' });
    const siteCompareWrap = el('div', { className: 'ai-compare-pair', hidden: '' });
    const siteBeforePreview = el('img', { alt: 'Montage maquette sur terrain' });
    const siteAfterPreview = el('img', { alt: 'Insertion paysagère sublimée par IA' });
    siteCompareWrap.append(
      el('figure', {}, [siteBeforePreview, el('figcaption', { textContent: 'Montage recalé sur votre terrain' })]),
      el('figure', {}, [siteAfterPreview, el('figcaption', { textContent: 'Insertion paysagère sublimée (IA)' })])
    );

    function drawSiteComposite() {
      const ctx = siteCanvas.getContext('2d');
      const W = siteCanvas.width, H = siteCanvas.height;
      ctx.clearRect(0, 0, W, H);
      if (siteBgImg) {
        const r = Math.max(W / siteBgImg.naturalWidth, H / siteBgImg.naturalHeight);
        const dw = siteBgImg.naturalWidth * r;
        const dh = siteBgImg.naturalHeight * r;
        ctx.drawImage(siteBgImg, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#c8d8e4');
        g.addColorStop(0.55, '#e8e2d5');
        g.addColorStop(1, '#7a8a63');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(22,28,25,0.65)';
        ctx.font = '500 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Importez une photo réelle de votre terrain pour commencer', W / 2, H / 2 - 10);
      }

      if (siteModelImg) {
        const mw = W * siteState.scale;
        const mh = mw * (siteModelImg.naturalHeight / Math.max(1, siteModelImg.naturalWidth));
        const cx = W * siteState.x;
        const cy = H * siteState.y;
        // Ombre portée douce au sol sous la villa
        if (siteState.shadow > 0.02) {
          ctx.save();
          const grad = ctx.createRadialGradient(cx, cy + mh * 0.36, mw * 0.08, cx, cy + mh * 0.36, mw * 0.52);
          grad.addColorStop(0, `rgba(12, 16, 12, ${siteState.shadow * 0.65})`);
          grad.addColorStop(1, 'rgba(12, 16, 12, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(cx, cy + mh * 0.36, mw * 0.52, mh * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.filter = `brightness(${siteState.warmth}) contrast(1.03)`;
        // Masque doux sur les bords pour fondre l'horizon 3D dans la photo terrain
        ctx.beginPath();
        ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, 14);
        ctx.clip();
        ctx.drawImage(siteModelImg, cx - mw / 2, cy - mh / 2, mw, mh);
        ctx.restore();
      }
      siteCompositeUrl = siteCanvas.toDataURL('image/jpeg', 0.92);
    }

    siteCanvas.addEventListener('pointerdown', e => {
      if (!siteModelImg) return;
      const rect = siteCanvas.getBoundingClientRect();
      siteState.dragging = true;
      siteState.dragDx = (e.clientX - rect.left) / rect.width - siteState.x;
      siteState.dragDy = (e.clientY - rect.top) / rect.height - siteState.y;
      siteCanvas.setPointerCapture(e.pointerId);
    });
    siteCanvas.addEventListener('pointermove', e => {
      if (!siteState.dragging) return;
      const rect = siteCanvas.getBoundingClientRect();
      siteState.x = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width - siteState.dragDx));
      siteState.y = Math.max(0.15, Math.min(0.9, (e.clientY - rect.top) / rect.height - siteState.dragDy));
      siteYOut.textContent = `${Math.round(siteState.y * 100)}%`;
      drawSiteComposite();
    });
    siteCanvas.addEventListener('pointerup', () => { siteState.dragging = false; });

    function captureCurrent3DForSite() {
      if (!houseScene?.renderer) return;
      houseScene.renderer.render(houseScene.scene, houseScene.camera);
      const dataUrl = houseScene.renderer.domElement.toDataURL('image/png');
      loadImage(dataUrl).then(img => {
        siteModelImg = img;
        drawSiteComposite();
        setMsg(siteMsg, 'Vue 3D capturée : glissez-la sur la photo du terrain et ajustez son échelle.', 'ok');
      }).catch(err => setMsg(siteMsg, err.message, 'error'));
    }

    const sitePanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-site', role: 'tabpanel' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Insertion paysagère sur votre terrain' }),
          el('p', { className: 'ai-hint', textContent: 'Importez une photo réelle de la parcelle, recalez la maquette 3D à la souris, analysez la lumière avec Gemini puis sublimez l’incrustation pour votre dossier Permis / client.' }),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-site-file', textContent: '1. Photo réelle du terrain (JPG/PNG/WebP)' }),
            el('input', {
              id: 'ai-site-file', type: 'file', accept: 'image/jpeg,image/png,image/webp',
              onChange: async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  siteBgDataUrl = await readFileAsDataUrl(file);
                  siteBgImg = await loadImage(siteBgDataUrl);
                  if (!siteModelImg) captureCurrent3DForSite();
                  else drawSiteComposite();
                  setMsg(siteMsg, 'Photo du terrain chargée. Glissez la maquette sur l’aperçu pour l’aligner.', 'ok');
                } catch (err) { setMsg(siteMsg, err.message, 'error'); }
              }
            })
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', { type: 'button', className: 'btn-toggle btn-small', textContent: 'Capturer la vue 3D actuelle', onClick: captureCurrent3DForSite }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Analyser lumière & terrain (Gemini)',
              onClick: async () => {
                if (!siteBgDataUrl) return setMsg(siteMsg, 'Importez d’abord une photo du terrain.', 'error');
                setMsg(siteMsg, 'Analyse de la lumière et de la perspective par Gemini…');
                try {
                  const res = await fetch('api/ai/site-insertion-advice', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      siteImage: siteBgDataUrl,
                      projectName: window.HOUSE_DATA?.meta?.name || projectSlug,
                      city: window.HOUSE_DATA?.meta?.location || 'Douala, Cameroun'
                    })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  const a = data.analysis || {};
                  if (a.insertionPrompt) sitePromptInput.value = a.insertionPrompt;
                  setMsg(siteMsg, `${a.sunDirection || ''} ${a.terrainAdvice || ''}`.trim() || 'Analyse terminée.', 'ok');
                } catch (err) { setMsg(siteMsg, err.message, 'error'); }
              }
            })
          ]),
          el('div', { style: 'margin-top:10px' }, [
            el('div', { className: 'ai-slider-row' }, [
              el('span', { textContent: 'Échelle villa' }),
              el('input', {
                type: 'range', min: 25, max: 95, value: 64,
                onInput: e => { siteState.scale = Number(e.target.value) / 100; siteScaleOut.textContent = `${e.target.value}%`; drawSiteComposite(); }
              }),
              siteScaleOut
            ]),
            el('div', { className: 'ai-slider-row' }, [
              el('span', { textContent: 'Hauteur horizon' }),
              el('input', {
                type: 'range', min: 20, max: 88, value: 62,
                onInput: e => { siteState.y = Number(e.target.value) / 100; siteYOut.textContent = `${e.target.value}%`; drawSiteComposite(); }
              }),
              siteYOut
            ]),
            el('div', { className: 'ai-slider-row' }, [
              el('span', { textContent: 'Ombre au sol' }),
              el('input', {
                type: 'range', min: 0, max: 90, value: 42,
                onInput: e => { siteState.shadow = Number(e.target.value) / 100; siteShadowOut.textContent = `${e.target.value}%`; drawSiteComposite(); }
              }),
              siteShadowOut
            ]),
            el('div', { className: 'ai-slider-row' }, [
              el('span', { textContent: 'Lumière' }),
              el('input', {
                type: 'range', min: 75, max: 125, value: 100,
                onInput: e => { siteState.warmth = Number(e.target.value) / 100; siteWarmthOut.textContent = `${e.target.value}%`; drawSiteComposite(); }
              }),
              siteWarmthOut
            ])
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-site-prompt', textContent: 'Prompt d’intégration paysagère IA' }),
            sitePromptInput
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: 'Sublimer l’insertion par IA',
              onClick: async () => {
                if (!siteBgDataUrl || !siteModelImg) return setMsg(siteMsg, 'Chargez une photo du terrain et la vue 3D avant de lancer l’IA.', 'error');
                drawSiteComposite();
                setMsg(siteMsg, 'Fusion photoréaliste de la villa sur votre terrain en cours…');
                try {
                  const basePrompt = sitePromptInput.value.trim() ||
                    'Photorealistic architectural site insertion (insertion paysagère): seamlessly integrate the exact house volume, roof, verandas, and openings from reference image 2 into the real land plot photographed in reference image 1. Strictly preserve building architecture, match natural daylight direction, cast realistic soft ground shadows, blend tropical vegetation, driveway, and sky seamlessly. No morphing walls, no text.';
                  const r = await fetch('api/ai/images', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'google/gemini-3.1-flash-image-preview',
                      prompt: basePrompt,
                      aspect_ratio: '16:9',
                      input_references: [
                        { type: 'image_url', image_url: { url: siteBgDataUrl } },
                        { type: 'image_url', image_url: { url: siteCompositeUrl } }
                      ]
                    })
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error?.message || data.error || `HTTP ${r.status}`);
                  const b64 = data?.data?.[0]?.b64_json;
                  if (!b64) throw new Error('Aucune image renvoyée par le modèle.');
                  siteAiResultUrl = `data:image/png;base64,${b64}`;
                  siteBeforePreview.src = siteCompositeUrl;
                  siteAfterPreview.src = siteAiResultUrl;
                  siteCompareWrap.hidden = false;
                  setMsg(siteMsg, 'Insertion paysagère IA prête ! Enregistrez-la pour l’intégrer à la galerie et au dossier Permis.', 'ok');
                } catch (err) { setMsg(siteMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Enregistrer dans la galerie / APD',
              onClick: async () => {
                const payloadImg = siteAiResultUrl || siteCompositeUrl;
                if (!payloadImg) return setMsg(siteMsg, 'Rien à enregistrer pour le moment.', 'error');
                try {
                  const id = `insertion-terrain-${Date.now()}`;
                  const res = await fetch(`api/save-generated?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id,
                      label: siteAiResultUrl ? 'Insertion paysagère IA sur terrain réel' : 'Insertion paysagère 3D sur terrain réel',
                      dataUrl: payloadImg,
                      prompt: sitePromptInput.value.trim() || 'Insertion paysagère sur parcelle réelle',
                      book: true, catalog: true
                    })
                  });
                  const out = await res.json();
                  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
                  if (typeof refreshGallery === 'function') refreshGallery();
                  setMsg(siteMsg, 'Insertion paysagère enregistrée dans la galerie et disponible pour le dossier APD / Permis.', 'ok');
                } catch (err) { setMsg(siteMsg, err.message, 'error'); }
              }
            })
          ]),
          siteMsg
        ]),
        el('div', {}, [
          el('div', { className: 'ai-stage-box' }, [
            siteCanvas,
            el('span', { className: 'ai-stage-overlay-note', textContent: 'Glissez la maquette directement sur la photo du terrain' })
          ]),
          siteCompareWrap
        ])
      ])
    ]);

    // =========================================================================
    // TAB 2 : RETOUCHE CIBLÉE PAR ZONE (INPAINTING) & STYLES COHÉRENTS
    // =========================================================================
    const inpaintSourceSelect = el('select', { id: 'ai-inpaint-source' });
    const inpaintRefSelect = el('select', { id: 'ai-inpaint-ref' });
    const inpaintPrompt = el('textarea', {
      id: 'ai-inpaint-prompt',
      placeholder: 'Ex. : « Remplacer la zone surlignée par un parement en pierre naturelle chaude et un plafond bois ajouré »'
    });
    const inpaintCanvas = el('canvas', { width: 1280, height: 720 });
    const inpaintMaskCanvas = document.createElement('canvas');
    inpaintMaskCanvas.width = 1280; inpaintMaskCanvas.height = 720;
    const inpaintBrushSize = el('input', { type: 'range', min: 14, max: 96, value: 42 });
    const inpaintBrushOut = el('output', { textContent: '42 px' });
    const inpaintMsg = el('p', { className: 'ai-msg', role: 'status' });
    const inpaintCompare = el('div', { className: 'ai-compare-pair', hidden: '' });
    const inpaintBeforeImg = el('img', { alt: 'Vue d’origine' });
    const inpaintAfterImg = el('img', { alt: 'Proposition retouchée IA' });
    inpaintCompare.append(
      el('figure', {}, [inpaintBeforeImg, el('figcaption', { textContent: 'Avant · Vue source' })]),
      el('figure', {}, [inpaintAfterImg, el('figcaption', { textContent: 'Après · Retouche / Style IA' })])
    );

    function renderInpaintCanvas() {
      const ctx = inpaintCanvas.getContext('2d');
      ctx.clearRect(0, 0, inpaintCanvas.width, inpaintCanvas.height);
      if (inpaintBaseImg) {
        const r = Math.min(inpaintCanvas.width / inpaintBaseImg.naturalWidth, inpaintCanvas.height / inpaintBaseImg.naturalHeight);
        const w = inpaintBaseImg.naturalWidth * r;
        const h = inpaintBaseImg.naturalHeight * r;
        ctx.drawImage(inpaintBaseImg, (inpaintCanvas.width - w) * 0.5, (inpaintCanvas.height - h) * 0.5, w, h);
      }
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.drawImage(inpaintMaskCanvas, 0, 0);
      ctx.restore();
    }

    function paintInpaintPoint(e) {
      const rect = inpaintCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * inpaintCanvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * inpaintCanvas.height;
      const mctx = inpaintMaskCanvas.getContext('2d');
      mctx.fillStyle = '#e0643b';
      mctx.beginPath();
      mctx.arc(x, y, Number(inpaintBrushSize.value), 0, Math.PI * 2);
      mctx.fill();
      inpaintMaskDirty = true;
      renderInpaintCanvas();
    }

    inpaintCanvas.addEventListener('pointerdown', e => {
      inpaintDrawing = true;
      inpaintCanvas.setPointerCapture(e.pointerId);
      paintInpaintPoint(e);
    });
    inpaintCanvas.addEventListener('pointermove', e => {
      if (inpaintDrawing) paintInpaintPoint(e);
    });
    inpaintCanvas.addEventListener('pointerup', () => { inpaintDrawing = false; });

    inpaintBrushSize.addEventListener('input', () => { inpaintBrushOut.textContent = `${inpaintBrushSize.value} px`; });

    async function loadInpaintSource(value) {
      inpaintMaskCanvas.getContext('2d').clearRect(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height);
      inpaintMaskDirty = false;
      if (value === '__current3d__' && houseScene?.renderer) {
        houseScene.renderer.render(houseScene.scene, houseScene.camera);
        inpaintBaseUrl = houseScene.renderer.domElement.toDataURL('image/jpeg', 0.92);
      } else if (value) {
        inpaintBaseUrl = await dataUrlFromImageUrl(value);
      } else {
        return;
      }
      inpaintBaseImg = await loadImage(inpaintBaseUrl);
      renderInpaintCanvas();
    }

    inpaintSourceSelect.addEventListener('change', () => {
      loadInpaintSource(inpaintSourceSelect.value).catch(err => setMsg(inpaintMsg, err.message, 'error'));
    });

    const styleBtns = Object.entries(STYLE_PRESETS).map(([key, spec]) => {
      const btn = el('button', {
        type: 'button', className: `ai-style-btn${key === inpaintStyleKey ? ' is-active' : ''}`,
        textContent: spec.name,
        onClick: () => {
          inpaintStyleKey = key;
          styleBtns.forEach(b => b.classList.toggle('is-active', b === btn));
        }
      });
      return btn;
    });

    const inpaintPanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-inpaint', role: 'tabpanel', hidden: '' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Retouche ciblée & Styles cohérents' }),
          el('p', { className: 'ai-hint', textContent: 'Peignez directement la zone à modifier (mur, sol, mobilier, façade) ou choisissez une ambiance complète avec une image de référence commune pour conserver les mêmes matières dans toute la villa.' }),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-inpaint-source', textContent: 'Vue à retoucher' }),
            inpaintSourceSelect
          ]),
          el('div', { className: 'ai-slider-row' }, [
            el('span', { textContent: 'Taille du pinceau' }),
            inpaintBrushSize,
            inpaintBrushOut
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Effacer le masque',
              onClick: () => {
                inpaintMaskCanvas.getContext('2d').clearRect(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height);
                inpaintMaskDirty = false;
                renderInpaintCanvas();
              }
            })
          ]),
          el('div', { className: 'ai-field', style: 'margin-top:10px' }, [
            el('span', { className: 'ai-lbl', textContent: 'Style architectural complet' }),
            el('div', { className: 'ai-style-grid' }, styleBtns)
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-inpaint-ref', textContent: 'Image de référence commune (cohérence multi-vues)' }),
            inpaintRefSelect
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-inpaint-prompt', textContent: 'Instruction ciblée sur la zone peinte (facultatif)' }),
            inpaintPrompt
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: 'Appliquer la retouche IA',
              onClick: async () => {
                if (!inpaintBaseUrl) return setMsg(inpaintMsg, 'Choisissez d’abord une vue source.', 'error');
                setMsg(inpaintMsg, 'Génération de la variante ciblée en cours…');
                try {
                  const refs = [{ type: 'image_url', image_url: { url: inpaintBaseUrl } }];
                  const styleSpec = STYLE_PRESETS[inpaintStyleKey] || STYLE_PRESETS.tropical;
                  const customEdit = inpaintPrompt.value.trim();
                  let promptText = `Strictly preserve the exact architectural geometry, walls, ceiling lines, doors, windows, camera angle, and spatial layout of reference image 1. ${styleSpec.prompt}`;
                  if (inpaintMaskDirty) {
                    const markedDataUrl = inpaintCanvas.toDataURL('image/jpeg', 0.9);
                    refs.push({ type: 'image_url', image_url: { url: markedDataUrl } });
                    promptText += ` Reference image 2 shows an orange translucent brush highlight marking the exact target zone to edit. Modify ONLY the highlighted area (${customEdit || 'upgrade materials and finishes in this zone'}) while keeping every untouched wall and opening 100% consistent. Remove all orange highlight marks in the final photorealistic image.`;
                  } else if (customEdit) {
                    promptText += ` Apply this specific architectural/interior design change cleanly: ${customEdit}.`;
                  }
                  if (inpaintRefSelect.value) {
                    const styleRefUrl = await dataUrlFromImageUrl(inpaintRefSelect.value, 1024);
                    refs.push({ type: 'image_url', image_url: { url: styleRefUrl } });
                    promptText += ` Match the exact material palette, plaster tone, wood finish, floor texture, and lighting mood from reference image ${refs.length} so the entire residence stays visually consistent across rooms.`;
                  }
                  promptText += ' Photorealistic architectural photography, crisp materials, natural daylight, no text, no watermarks.';

                  const r = await fetch('api/ai/images', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'google/gemini-3.1-flash-image-preview',
                      prompt: promptText,
                      aspect_ratio: '16:9',
                      input_references: refs
                    })
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error?.message || data.error || `HTTP ${r.status}`);
                  const b64 = data?.data?.[0]?.b64_json;
                  if (!b64) throw new Error('Aucune image renvoyée par le modèle.');
                  inpaintResultUrl = `data:image/png;base64,${b64}`;
                  inpaintBeforeImg.src = inpaintBaseUrl;
                  inpaintAfterImg.src = inpaintResultUrl;
                  inpaintCompare.hidden = false;
                  setMsg(inpaintMsg, 'Retouche générée ! Comparez Avant / Après puis enregistrez dans la galerie.', 'ok');
                } catch (err) { setMsg(inpaintMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Enregistrer dans la galerie',
              onClick: async () => {
                if (!inpaintResultUrl) return setMsg(inpaintMsg, 'Générez d’abord une retouche.', 'error');
                try {
                  const styleName = STYLE_PRESETS[inpaintStyleKey]?.name || 'Style IA';
                  const res = await fetch(`api/save-generated?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: `retouche-${inpaintStyleKey}-${Date.now()}`,
                      label: `Retouche ciblée · ${styleName}`,
                      dataUrl: inpaintResultUrl,
                      prompt: inpaintPrompt.value.trim() || styleName,
                      book: true, catalog: true
                    })
                  });
                  const out = await res.json();
                  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
                  if (typeof refreshGallery === 'function') refreshGallery();
                  setMsg(inpaintMsg, 'Variante enregistrée dans la galerie du projet.', 'ok');
                } catch (err) { setMsg(inpaintMsg, err.message, 'error'); }
              }
            })
          ]),
          inpaintMsg
        ]),
        el('div', {}, [
          el('div', { className: 'ai-stage-box is-drawable' }, [
            inpaintCanvas,
            el('span', { className: 'ai-stage-overlay-note', textContent: 'Peignez à la souris la zone à retoucher (orange)' })
          ]),
          inpaintCompare
        ])
      ])
    ]);

    // =========================================================================
    // TAB 3 : VIDÉO ENCHAÎNÉE IMAGE DÉBUT → IMAGE FIN (START-TO-END FRAME)
    // =========================================================================
    const transStartSelect = el('select', { id: 'ai-trans-start' });
    const transEndSelect = el('select', { id: 'ai-trans-end' });
    const transPaceSelect = el('select', { id: 'ai-trans-pace' }, [
      el('option', { value: 'contemplatif', textContent: 'Très lent · Contemplatif' }),
      el('option', { value: 'cinema', textContent: 'Cinéma lent · Fluide' })
    ]);
    const transPeopleCheck = el('input', { type: 'checkbox', checked: '' });
    const transEnvCheck = el('input', { type: 'checkbox', checked: '' });
    const transStartThumb = el('img', { alt: 'Image de départ' });
    const transEndThumb = el('img', { alt: 'Image d’arrivée' });
    const transVideoEl = el('video', { controls: '', playsinline: '', hidden: '' });
    const transMsg = el('p', { className: 'ai-msg', role: 'status' });

    function syncTransThumbs() {
      if (transStartSelect.value) transStartThumb.src = transStartSelect.value;
      if (transEndSelect.value) transEndThumb.src = transEndSelect.value;
    }
    transStartSelect.addEventListener('change', syncTransThumbs);
    transEndSelect.addEventListener('change', syncTransThumbs);

    const transitionPanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-transition', role: 'tabpanel', hidden: '' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Transition vidéo Début (A) → Fin (B)' }),
          el('p', { className: 'ai-hint', textContent: 'Choisissez deux vues du projet (ex. Façade → Séjour ou Séjour → Véranda) pour générer un plan-séquence fluide d’une pièce à l’autre, en local HD gratuit ou via l’IA Seedance Start-to-End Frame.' }),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-trans-start', textContent: 'Image de départ (A)' }),
            transStartSelect
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-trans-end', textContent: 'Image d’arrivée (B)' }),
            transEndSelect
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-trans-pace', textContent: 'Rythme caméra' }),
            transPaceSelect
          ]),
          el('label', { className: 'client-check' }, [transPeopleCheck, ' Personnages en mouvement naturel']),
          el('label', { className: 'client-check' }, [transEnvCheck, ' Vent, feuillages & nuages vivants']),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: 'Transition cinéma HD (MP4 local)',
              onClick: async () => {
                if (!transStartSelect.value || !transEndSelect.value) return setMsg(transMsg, 'Sélectionnez deux vues du projet.', 'error');
                setMsg(transMsg, 'Rendu FFmpeg HD de la transition en cours…');
                try {
                  const sOpt = transStartSelect.selectedOptions[0]?.textContent || 'Départ';
                  const eOpt = transEndSelect.selectedOptions[0]?.textContent || 'Arrivée';
                  const res = await fetch(`api/render-video?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      mode: 'transition',
                      startImage: transStartSelect.value,
                      endImage: transEndSelect.value,
                      startLabel: sOpt,
                      endLabel: eOpt,
                      ambientSound: true
                    })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  transVideoEl.src = `${data.item.file}?v=${Date.now()}`;
                  transVideoEl.hidden = false;
                  transVideoEl.load();
                  if (typeof refreshGallery === 'function') refreshGallery();
                  setMsg(transMsg, 'Transition HD MP4 enregistrée dans la galerie !', 'ok');
                } catch (err) { setMsg(transMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Transition IA Start→End (Seedance)',
              onClick: async () => {
                if (!transStartSelect.value || !transEndSelect.value) return setMsg(transMsg, 'Sélectionnez deux vues du projet.', 'error');
                setMsg(transMsg, 'Envoi du couple Image A → Image B vers Seedance 2.5 Flash…');
                try {
                  const res = await fetch('api/ai/videos', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      project: projectSlug,
                      clipId: 'anim-transition',
                      startImage: transStartSelect.value,
                      endImage: transEndSelect.value,
                      pace: transPaceSelect.value,
                      livingPeople: transPeopleCheck.checked,
                      livingEnvironment: transEnvCheck.checked
                    })
                  });
                  const job = await res.json();
                  if (!res.ok) throw new Error(job.error || `HTTP ${res.status}`);
                  setMsg(transMsg, 'Génération IA lancée (1 à 2 min). Suivi automatique en cours…');
                  for (let tries = 0; tries < 40; tries++) {
                    await new Promise(r => setTimeout(r, 4000));
                    const stRes = await fetch(`api/ai/videos/status?project=${encodeURIComponent(projectSlug)}&clipId=anim-transition`);
                    const st = await stRes.json();
                    if (st.status === 'completed' && st.item?.file) {
                      transVideoEl.src = `${st.item.file}?v=${Date.now()}`;
                      transVideoEl.hidden = false;
                      transVideoEl.load();
                      if (typeof refreshGallery === 'function') refreshGallery();
                      return setMsg(transMsg, 'Vidéo IA Début → Fin terminée et ajoutée à la galerie !', 'ok');
                    }
                    if (['failed', 'cancelled', 'expired'].includes(st.status)) {
                      throw new Error(st.error || `Échec génération (${st.status}).`);
                    }
                  }
                  setMsg(transMsg, 'Génération toujours en cours sur le serveur — actualisez la galerie dans un instant.');
                } catch (err) { setMsg(transMsg, err.message, 'error'); }
              }
            })
          ]),
          transMsg
        ]),
        el('div', {}, [
          el('div', { className: 'ai-thumb-pair' }, [
            el('div', { className: 'ai-thumb-card' }, [transStartThumb, el('span', { textContent: 'Image de départ (A)' })]),
            el('div', { className: 'ai-thumb-card' }, [transEndThumb, el('span', { textContent: 'Image d’arrivée (B)' })])
          ]),
          el('div', { className: 'ai-stage-box' }, [
            transVideoEl,
            el('span', { className: 'ai-stage-overlay-note', textContent: 'Le film de transition apparaît ici dès la fin du rendu' })
          ])
        ])
      ])
    ]);

    // =========================================================================
    // TAB 4 : FILM NARRÉ AVEC VOIX OFF D'ARCHITECTE (GEMINI TTS) + AMBIANCE
    // =========================================================================
    const voxScriptArea = el('textarea', {
      id: 'ai-vox-script', rows: 6,
      placeholder: 'Cliquez sur « Rédiger le commentaire » pour générer un texte d’architecte basé sur les vraies surfaces et pièces de votre projet…'
    });
    const voxVoiceSelect = el('select', { id: 'ai-vox-voice' }, [
      el('option', { value: 'Charon', textContent: 'Charon — Architecte posé et chaleureux' }),
      el('option', { value: 'Kore', textContent: 'Kore — Voix studio claire et élégante' }),
      el('option', { value: 'Zephyr', textContent: 'Zephyr — Ton lumineux et accueillant' })
    ]);
    const voxAmbientCheck = el('input', { type: 'checkbox', checked: '' });
    const voxAudioEl = el('audio', { controls: '', hidden: '' });
    const voxVideoEl = el('video', { controls: '', playsinline: '', hidden: '' });
    const voxMsg = el('p', { className: 'ai-msg', role: 'status' });

    const voiceoverPanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-voiceover', role: 'tabpanel', hidden: '' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Film narré & Voix Off d’architecte IA' }),
          el('p', { className: 'ai-hint', textContent: 'Rédigez le commentaire à partir des cotes réelles du projet, synthétisez la voix off naturelle (Gemini TTS WAV) puis mixez-la avec une ambiance sonore douce dans le film HD MP4.' }),
          el('div', { className: 'ai-actions-row', style: 'margin-bottom:10px' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: '1 · Rédiger le commentaire (Gemini)',
              onClick: async () => {
                setMsg(voxMsg, 'Rédaction du script d’architecte…');
                try {
                  const res = await fetch('api/ai/voiceover', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: projectSlug, action: 'script' })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  voxScriptArea.value = data.script || '';
                  setMsg(voxMsg, `Commentaire prêt (${data.source}). Vous pouvez l’ajuster avant de lancer la voix off.`, 'ok');
                } catch (err) { setMsg(voxMsg, err.message, 'error'); }
              }
            })
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-vox-script', textContent: 'Texte de narration du film' }),
            voxScriptArea
          ]),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-vox-voice', textContent: 'Voix de présentation' }),
            voxVoiceSelect
          ]),
          el('label', { className: 'client-check' }, [voxAmbientCheck, ' Ajouter une ambiance sonore douce (brise extérieure -26 dB)']),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: '2 · Générer la voix off (Gemini TTS)',
              onClick: async () => {
                setMsg(voxMsg, 'Synthèse vocale HD 24 kHz en cours…');
                try {
                  const res = await fetch('api/ai/voiceover', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      project: projectSlug,
                      action: 'synthesize',
                      script: voxScriptArea.value.trim(),
                      voiceName: voxVoiceSelect.value
                    })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  if (data.script && !voxScriptArea.value.trim()) voxScriptArea.value = data.script;
                  latestVoiceFile = data.file;
                  voxAudioEl.src = `${data.audioUrl}?v=${Date.now()}`;
                  voxAudioEl.hidden = false;
                  voxAudioEl.load();
                  setMsg(voxMsg, `Voix off prête (${data.voiceName}). Écoutez-la puis assemblez le film HD narré.`, 'ok');
                } catch (err) { setMsg(voxMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: '3 · Assembler le film HD narré (MP4)',
              onClick: async () => {
                setMsg(voxMsg, 'Assemblage FFmpeg HD 1280×720 avec piste audio en cours…');
                try {
                  const res = await fetch(`api/render-video?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      voiceoverFile: latestVoiceFile || undefined,
                      ambientSound: voxAmbientCheck.checked
                    })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  voxVideoEl.src = `${data.item.file}?v=${Date.now()}`;
                  voxVideoEl.hidden = false;
                  voxVideoEl.load();
                  if (typeof refreshGallery === 'function') refreshGallery();
                  setMsg(voxMsg, `Film HD narré prêt (${data.item.duration} s) et enregistré dans la galerie !`, 'ok');
                } catch (err) { setMsg(voxMsg, err.message, 'error'); }
              }
            })
          ]),
          el('div', { className: 'ai-audio-box' }, [
            el('span', { className: 'ai-lbl', textContent: 'Aperçu audio voix off (WAV 24 kHz)' }),
            voxAudioEl
          ]),
          voxMsg
        ]),
        el('div', {}, [
          el('div', { className: 'ai-stage-box' }, [
            voxVideoEl,
            el('span', { className: 'ai-stage-overlay-note', textContent: 'Lecteur du film HD narré (MP4 H.264 + AAC)' })
          ])
        ])
      ])
    ]);

    // =========================================================================
    // TAB 5 : PANORAMAS 360° IMMERSIFS PAR PIÈCE (CAPTURE THREE.JS + VIEWER 360°)
    // =========================================================================
    const panoRoomSelect = el('select', { id: 'ai-pano-room' });
    const panoStage = el('div', { className: 'ai-stage-box is-pano' });
    const panoCanvas = el('canvas', { width: 1024, height: 576 });
    const panoStrip = el('div', { className: 'ai-pano-strip' });
    const panoMsg = el('p', { className: 'ai-msg', role: 'status' });
    const panoDownloadLink = el('a', { className: 'btn-toggle btn-small', textContent: 'Télécharger 360°', download: 'panorama-360.jpg', hidden: '' });
    panoStage.append(panoCanvas, el('span', { className: 'ai-stage-overlay-note', textContent: 'Glissez pour regarder à 360° · Molette pour zoomer' }));

    function initPanoViewer() {
      if (panoViewer || typeof THREE === 'undefined') return;
      const renderer = new THREE.WebGLRenderer({ canvas: panoCanvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(panoCanvas.width, panoCanvas.height, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(72, panoCanvas.width / panoCanvas.height, 0.1, 100);
      const geom = new THREE.SphereGeometry(20, 48, 32);
      geom.scale(-1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);

      const state = { yaw: 0, pitch: 0, fov: 72, dragging: false, lastX: 0, lastY: 0, loader: new THREE.TextureLoader() };
      function draw() {
        const phi = THREE.MathUtils.degToRad(90 - state.pitch);
        const theta = THREE.MathUtils.degToRad(state.yaw);
        camera.fov = state.fov;
        camera.updateProjectionMatrix();
        camera.lookAt(
          10 * Math.sin(phi) * Math.cos(theta),
          10 * Math.cos(phi),
          10 * Math.sin(phi) * Math.sin(theta)
        );
        renderer.render(scene, camera);
      }

      panoCanvas.addEventListener('pointerdown', e => {
        state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY;
        panoCanvas.setPointerCapture(e.pointerId);
      });
      panoCanvas.addEventListener('pointermove', e => {
        if (!state.dragging) return;
        state.yaw -= (e.clientX - state.lastX) * 0.28;
        state.pitch = Math.max(-75, Math.min(75, state.pitch + (e.clientY - state.lastY) * 0.24));
        state.lastX = e.clientX; state.lastY = e.clientY;
        draw();
      });
      panoCanvas.addEventListener('pointerup', () => { state.dragging = false; });
      panoCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        state.fov = Math.max(42, Math.min(95, state.fov + e.deltaY * 0.04));
        draw();
      }, { passive: false });

      panoViewer = {
        loadUrl(url) {
          state.loader.load(url, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (mat.map) mat.map.dispose();
            mat.map = tex;
            mat.needsUpdate = true;
            draw();
          });
        },
        draw
      };
    }

    function renderPanoStrip() {
      panoStrip.textContent = '';
      for (const item of panoList) {
        const btn = el('button', {
          type: 'button', className: `ai-pano-item${activePano?.id === item.id ? ' is-active' : ''}`,
          onClick: () => selectPano(item)
        }, [
          el('img', { src: item.file, alt: item.label }),
          el('span', { textContent: `${item.source === 'ai' ? '✨ ' : ''}${item.label}` })
        ]);
        panoStrip.appendChild(btn);
      }
    }

    function selectPano(item) {
      activePano = item;
      initPanoViewer();
      if (panoViewer && item?.file) panoViewer.loadUrl(`${item.file}?v=${Date.now()}`);
      if (item?.file) {
        panoDownloadLink.href = item.file;
        panoDownloadLink.download = `${item.id || 'panorama-360'}.jpg`;
        panoDownloadLink.hidden = false;
      }
      renderPanoStrip();
    }

    async function refreshPanoramas() {
      try {
        const res = await fetch(`api/panoramas?project=${encodeURIComponent(projectSlug)}`);
        if (!res.ok) return;
        const data = await res.json();
        panoList = Array.isArray(data.items) ? data.items : [];
        renderPanoStrip();
        if (panoList.length && !activePano) selectPano(panoList[0]);
      } catch { /* ignore */ }
    }

    const panoPanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-pano360', role: 'tabpanel', hidden: '' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Panoramas 360° immersifs par pièce' }),
          el('p', { className: 'ai-hint', textContent: 'Capturez une sphère équirectangulaire 360° depuis le centre de n’importe quelle pièce de la maquette 3D, explorez-la à la souris ou au doigt, et photoréalisez-la par IA.' }),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-pano-room', textContent: 'Point de vue 360°' }),
            panoRoomSelect
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: 'Capturer 360° (maquette 3D)',
              onClick: async () => {
                try {
                  setMsg(panoMsg, 'Capture sphérique 6 faces Three.js en cours…');
                  const val = panoRoomSelect.value;
                  const rooms = window.HOUSE_DATA?.rooms || [];
                  const room = rooms.find(r => (r.id || r.name) === val);
                  const floorH = Number(window.HOUSE_DATA?.config?.floorHeight) || 3.1;
                  const origin = room?.center
                    ? { x: room.center[0], y: (Number(room.level) || 0) * floorH + 1.6, z: room.center[1] }
                    : room?.bounds
                      ? { x: (room.bounds.xMin + room.bounds.xMax) * 0.5, y: (Number(room.level) || 0) * floorH + 1.6, z: (room.bounds.zMin + room.bounds.zMax) * 0.5 }
                      : { x: houseScene.camera.position.x, y: Math.max(1.55, houseScene.camera.position.y), z: houseScene.camera.position.z };
                  const dataUrl = captureEquirectangular360(houseScene, origin);
                  const label = room ? `${room.name} (360°)` : 'Vue actuelle (360°)';
                  const id = `pano-${(room?.id || 'cam').replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}`;
                  const res = await fetch(`api/save-panorama?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, label, roomId: room?.id || '', source: '3d', dataUrl })
                  });
                  const out = await res.json();
                  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
                  panoList.unshift(out.item);
                  selectPano(out.item);
                  setMsg(panoMsg, `Panorama 360° « ${label} » capturé ! Glissez sur l’aperçu pour tourner autour.`, 'ok');
                } catch (err) { setMsg(panoMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Photoréaliser ce 360° (IA)',
              onClick: async () => {
                if (!activePano?.file) return setMsg(panoMsg, 'Capturez ou sélectionnez d’abord un panorama 360°.', 'error');
                setMsg(panoMsg, 'Photoréalisation du panorama équirectangulaire 360°…');
                try {
                  const refDataUrl = await dataUrlFromImageUrl(activePano.file, 1536);
                  const prompt = `Seamless 360-degree equirectangular architectural panorama (2:1 projection) strictly preserving the exact walls, doors, windows, ceiling, furniture placement, and spatial proportions of the reference 360° room image (${activePano.label}). Upgrade all surfaces to photorealistic contemporary architectural materials, warm natural daylight, crisp reflections, continuous left-to-right horizon seam, no visible seam, no text, no watermark.`;
                  const r = await fetch('api/ai/images', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'google/gemini-3.1-flash-image-preview',
                      prompt,
                      aspect_ratio: '2:1',
                      input_references: [{ type: 'image_url', image_url: { url: refDataUrl } }]
                    })
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error?.message || data.error || `HTTP ${r.status}`);
                  const b64 = data?.data?.[0]?.b64_json;
                  if (!b64) throw new Error('Aucune image 360° retournée.');
                  const saveRes = await fetch(`api/save-panorama?project=${encodeURIComponent(projectSlug)}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: `${activePano.id}-ia`,
                      label: `${activePano.label} · Photoréaliste`,
                      roomId: activePano.roomId || '',
                      source: 'ai',
                      dataUrl: `data:image/png;base64,${b64}`
                    })
                  });
                  const saved = await saveRes.json();
                  if (!saveRes.ok) throw new Error(saved.error || `HTTP ${saveRes.status}`);
                  panoList.unshift(saved.item);
                  selectPano(saved.item);
                  setMsg(panoMsg, 'Panorama 360° photoréaliste enregistré et prêt à explorer !', 'ok');
                } catch (err) { setMsg(panoMsg, err.message, 'error'); }
              }
            }),
            panoDownloadLink
          ]),
          panoMsg
        ]),
        el('div', {}, [
          panoStage,
          panoStrip
        ])
      ])
    ]);

    // =========================================================================
    // TAB 6 : AUDIT BIOCLIMATIQUE, OPTIMISATION DE PLAN & NOTICE / CCTP
    // =========================================================================
    const bioCitySelect = el('select', { id: 'ai-bio-city' }, [
      el('option', { value: 'douala', textContent: 'Douala — Équatorial côtier humide' }),
      el('option', { value: 'yaounde', textContent: 'Yaoundé — Tropical d’altitude' }),
      el('option', { value: 'abidjan', textContent: 'Abidjan — Subéquatorial littoral' }),
      el('option', { value: 'dakar', textContent: 'Dakar — Tropical sec / alizés' }),
      el('option', { value: 'paris', textContent: 'Paris — Tempéré océanique' })
    ]);
    const bioKpiWrap = el('div', { className: 'ai-bio-kpis' });
    const bioTableBody = el('tbody');
    const bioRecsList = el('ul', { className: 'ai-bio-recs' });
    const bioCctpArea = el('textarea', { className: 'ai-cctp-out', id: 'ai-cctp-markdown' });
    const bioMsg = el('p', { className: 'ai-msg', role: 'status' });

    function runLocalBioclimatic() {
      if (typeof BioclimaticAudit === 'undefined' || !window.HOUSE_DATA) return;
      const north = typeof getNorthAngle === 'function' ? getNorthAngle() : (Number(window.HOUSE_DATA?.config?.northAngle) || 0);
      const audit = BioclimaticAudit.analyze(window.HOUSE_DATA, { city: bioCitySelect.value, northAngle: north });

      bioKpiWrap.textContent = '';
      const kpis = [
        ['Score bioclimatique', `${audit.score}/100 · ${audit.grade.split('·')[0].trim()}`],
        ['Surface habitable', `${audit.metrics.habitableAreaM2} m²`],
        ['Vérandas & ombrages', `${audit.metrics.terraceAndShadingM2} m²`],
        ['Ventilation traversante', `${audit.metrics.crossVentPct}%`],
        ['Taux de vitrage', `${audit.metrics.daylightRatioPct}%`]
      ];
      for (const [label, val] of kpis) {
        bioKpiWrap.appendChild(el('div', { className: 'ai-bio-kpi' }, [
          el('span', { textContent: label }),
          el('strong', { textContent: val })
        ]));
      }

      bioTableBody.textContent = '';
      for (const f of audit.facades) {
        bioTableBody.appendChild(el('tr', {}, [
          el('td', { textContent: f.orientation }),
          el('td', { textContent: `${f.wallLengthM} m` }),
          el('td', { textContent: String(f.openingsCount) }),
          el('td', { textContent: `${f.glazedAreaM2} m² (${f.glazingRatioPct}%)` }),
          el('td', { textContent: f.exposureRisk })
        ]));
      }

      bioRecsList.textContent = '';
      for (const rec of audit.recommendations) {
        bioRecsList.appendChild(el('li', {}, [
          el('strong', { textContent: `[${rec.priority}] ${rec.theme} : ` }),
          rec.detail
        ]));
      }

      bioCctpArea.value = BioclimaticAudit.buildLocalCctpMarkdown(window.HOUSE_DATA, audit);
      setMsg(bioMsg, `Audit physique calculé pour ${audit.city} (Nord ${Math.round(north)}°). Cliquez sur « Enrichir avec Gemini IA » pour une rédaction architecturale complète.`, 'ok');
    }

    bioCitySelect.addEventListener('change', runLocalBioclimatic);

    const bioPanel = el('section', { className: 'ai-studio-panel', id: 'ai-panel-bioclimatic', role: 'tabpanel', hidden: '' }, [
      el('div', { className: 'ai-panel-grid' }, [
        el('div', { className: 'ai-card' }, [
          el('h3', { textContent: 'Audit bioclimatique & Notice CCTP' }),
          el('p', { className: 'ai-hint', textContent: 'Analyse réelle de vos façades (Nord/Est/Sud/Ouest), de la ventilation traversante et des débords de toiture, puis rédaction automatique de la Notice architecturale et du CCTP par lots.' }),
          el('div', { className: 'ai-field' }, [
            el('label', { for: 'ai-bio-city', textContent: 'Climat / ville de référence' }),
            bioCitySelect
          ]),
          el('div', { className: 'ai-actions-row' }, [
            el('button', {
              type: 'button', className: 'btn-toggle btn-small ai-btn-primary', textContent: 'Enrichir & rédiger avec Gemini IA',
              onClick: async () => {
                setMsg(bioMsg, 'Rédaction de la Notice architecturale et du CCTP par Gemini…');
                try {
                  const north = typeof getNorthAngle === 'function' ? getNorthAngle() : 0;
                  const res = await fetch('api/ai/bioclimatic-cctp', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: projectSlug, city: bioCitySelect.value, northAngle: north })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  bioCctpArea.value = data.markdown || '';
                  setMsg(bioMsg, `Notice & CCTP enrichis par ${data.source}. Prêts à copier ou télécharger pour votre dossier APD.`, 'ok');
                } catch (err) { setMsg(bioMsg, err.message, 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Copier',
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(bioCctpArea.value);
                  setMsg(bioMsg, 'Notice & CCTP copiés dans le presse-papiers.', 'ok');
                } catch { setMsg(bioMsg, 'Sélectionnez le texte et copiez-le avec Ctrl+C.', 'error'); }
              }
            }),
            el('button', {
              type: 'button', className: 'btn-toggle btn-small', textContent: 'Télécharger (.md)',
              onClick: () => {
                const blob = new Blob([bioCctpArea.value], { type: 'text/markdown;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${projectSlug}-notice-bioclimatique-cctp.md`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 3000);
              }
            })
          ]),
          el('h3', { style: 'margin-top:14px', textContent: 'Recommandations prioritaires' }),
          bioRecsList,
          bioMsg
        ]),
        el('div', {}, [
          bioKpiWrap,
          el('div', { className: 'ai-card', style: 'margin-bottom:12px' }, [
            el('h3', { textContent: 'Exposition solaire des façades' }),
            el('table', { className: 'ai-bio-table' }, [
              el('thead', {}, [
                el('tr', {}, [
                  el('th', { textContent: 'Façade' }),
                  el('th', { textContent: 'Linéaire' }),
                  el('th', { textContent: 'Baies' }),
                  el('th', { textContent: 'Vitrage' }),
                  el('th', { textContent: 'Exposition' })
                ])
              ]),
              bioTableBody
            ])
          ]),
          el('div', { className: 'ai-card' }, [
            el('h3', { textContent: 'Notice Architecturale & Descriptif par lots (CCTP)' }),
            bioCctpArea
          ])
        ])
      ])
    ]);

    panels.set('site', sitePanel);
    panels.set('inpaint', inpaintPanel);
    panels.set('transition', transitionPanel);
    panels.set('voiceover', voiceoverPanel);
    panels.set('pano360', panoPanel);
    panels.set('bioclimatic', bioPanel);

    body.append(sitePanel, inpaintPanel, transitionPanel, voiceoverPanel, panoPanel, bioPanel);

    const shell = el('div', { className: 'ai-studio-shell' }, [
      el('header', { className: 'ai-studio-head' }, [
        el('div', {}, [
          el('p', { className: 'ai-studio-kicker', textContent: 'ARCHICAM STUDIO · SUITE IA' }),
          el('h2', { id: 'dlg-ai-studio-title', textContent: 'Studio IA Avancé' })
        ]),
        el('div', { className: 'ai-studio-head-meta' }, [statusChip, closeBtn])
      ]),
      tabBar,
      body
    ]);
    dialog.appendChild(shell);

    function setMsg(node, text, kind = '') {
      node.textContent = text;
      node.className = `ai-msg${kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : ''}`;
    }

    function selectTab(id) {
      currentTab = id;
      for (const [k, btn] of tabButtons.entries()) btn.setAttribute('aria-selected', String(k === id));
      for (const [k, panel] of panels.entries()) panel.hidden = k !== id;
      if (id === 'bioclimatic') runLocalBioclimatic();
      if (id === 'pano360') { initPanoViewer(); refreshPanoramas(); }
      if (id === 'site') drawSiteComposite();
    }

    async function syncOptions() {
      // Statut des moteurs serveur (Gemini + OpenRouter)
      try {
        const st = await fetch('api/ai/status').then(r => r.json());
        aiCapabilities = st || aiCapabilities;
        const labels = [];
        if (aiCapabilities.gemini) labels.push('Gemini actif');
        if (aiCapabilities.openRouter) labels.push('OpenRouter actif');
        statusChip.textContent = labels.length ? labels.join(' · ') : 'Mode local 3D & FFmpeg actif';
      } catch {
        statusChip.textContent = 'Mode local 3D & FFmpeg actif';
      }

      // Liste des images de la galerie
      const rawItems = typeof getGalleryItems === 'function' ? await getGalleryItems() : [];
      galleryImages = (rawItems || []).filter(it => it && it.type !== 'video' && typeof it.file === 'string');

      const fillSelect = (sel, includeCurrent3d, includeNone) => {
        const prev = sel.value;
        sel.textContent = '';
        if (includeNone) sel.appendChild(el('option', { value: '', textContent: 'Aucune (style libre)' }));
        if (includeCurrent3d) sel.appendChild(el('option', { value: '__current3d__', textContent: 'Vue 3D actuelle (capture directe)' }));
        for (const it of galleryImages) {
          sel.appendChild(el('option', { value: it.file, textContent: it.label || it.id || it.file }));
        }
        if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
      };

      fillSelect(inpaintSourceSelect, true, false);
      fillSelect(inpaintRefSelect, false, true);
      fillSelect(transStartSelect, false, false);
      fillSelect(transEndSelect, false, false);
      if (transEndSelect.options.length > 1 && transEndSelect.selectedIndex === 0) {
        transEndSelect.selectedIndex = 1;
      }
      syncTransThumbs();
      if (!inpaintBaseImg && inpaintSourceSelect.value) {
        loadInpaintSource(inpaintSourceSelect.value).catch(() => {});
      }

      // Pièces disponibles pour la capture 360°
      panoRoomSelect.textContent = '';
      panoRoomSelect.appendChild(el('option', { value: '__cam__', textContent: 'Position actuelle de la caméra' }));
      for (const r of (window.HOUSE_DATA?.rooms || [])) {
        if (!r?.name) continue;
        panoRoomSelect.appendChild(el('option', { value: r.id || r.name, textContent: `${r.name}${Number(r.level) > 0 ? ` (R+${r.level})` : ''}` }));
      }

      // Ville bioclimatique détectée automatiquement
      if (typeof BioclimaticAudit !== 'undefined' && window.HOUSE_DATA) {
        bioCitySelect.value = BioclimaticAudit.detectCityKey(window.HOUSE_DATA);
      }
    }

    async function open(initialTab = 'site') {
      if (!dialog.open) dialog.showModal();
      await syncOptions();
      selectTab(initialTab);
    }

    return { open, selectTab };
  }

  return { create, captureEquirectangular360, STYLE_PRESETS };
})();

if (typeof module !== 'undefined') module.exports = AiStudioSuite;
