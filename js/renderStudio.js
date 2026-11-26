/**
 * RENDER STUDIO — rendus « grandeur nature » haute définition depuis la scène 3D
 * Sur-échantillonnage ×1,5 puis réduction (anti-crénelage), ombres 4096, vignettage photo léger.
 * Les images s'affichent dans une galerie et sont enregistrées dans le dossier generated/ du projet actif.
 * 
 * AXE 2 : Sublimation IA fidèle avec Depth Map et boucle de rétroaction automatique.
 */

// Import de FidelityCheck (disponible en navigateur via <script> ou en Node.js via module)
// La classe FidelityCheck est définie dans js/fidelityCheck.js

class RenderStudio {
  constructor(houseScene) {
    this.hs = houseScene;
    this.shots = HOUSE_DATA.renderShots || [];
    this.results = [];
    this.generating = null;
  }

  capture(shot, width = 1920, height = 1080, ss = 1.5, { clean = false, solar = null } = {}) {
    const hs = this.hs, r = hs.renderer, cam = hs.camera;
    const saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect,
      night: hs.night, nightTarget: hs.nightTarget, solarHour: hs.solarHour, solarGeo: hs.solarGeo,
      elev: hs.elevationProgress, quality: hs.quality, ceilings: hs.ceilingsVisible,
      ratio: r.getPixelRatio(), size: r.getSize(new THREE.Vector2()), bg: hs.scene.background,
      section: hs.sectionEnabled, exploded: hs.exploded, explodedTarget: hs.explodedTarget,
      planOverlay: hs.planOverlayManualVisible, notesVisible: hs.clientMeasureGroup?.visible
    };
    try {
      if (hs.quality !== 'high') hs.setQuality('high');
      if (hs.clientMeasureGroup) hs.clientMeasureGroup.visible = false;
      if (clean) {
        if (saved.section) hs.toggleSectionCut();
        hs.exploded = hs.explodedTarget = 0;
        hs.planOverlayManualVisible = false;
      }
      hs.setElevation(1);
      if (clean) hs.updateTechnicalAnimations();
      hs.solarHour = clean ? solar?.hour ?? SolarStudy.day : null;
      hs.solarGeo = solar?.solar || null;
      hs.night = hs.nightTarget = shot.night ? 1 : 0;
      cam.position.fromArray(shot.pos);
      cam.lookAt(new THREE.Vector3().fromArray(shot.look));
      cam.fov = shot.fov;
      cam.aspect = width / height;
      cam.updateProjectionMatrix();
      hs.setCeilingsVisible(shot.interior ?? (Boolean(shot.room) || cam.position.y < 2.7));
      hs.applyAtmosphere();
      hs.scene.background = this.skyTexture(solar ? SolarStudy.position(solar.hour, hs.northDegrees, solar.solar).dusk > 0.5 : !!shot.night);
      hs.inkEdgeMaterial.visible = false;
      if (hs.furnEdgeMaterial) hs.furnEdgeMaterial.visible = false;

      r.setPixelRatio(1);
      r.setSize(width * ss, height * ss, false);
      r.render(hs.scene, cam);
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(r.domElement, 0, 0, width, height);
      const vignette = g.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, height * 0.95);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, shot.night ? 'rgba(0,0,0,0.35)' : 'rgba(30,20,10,0.18)');
      g.fillStyle = vignette;
      g.fillRect(0, 0, width, height);
      return out.toDataURL('image/jpeg', 0.92);
    } finally {
      hs.scene.background = saved.bg;
      hs.night = saved.night;
      hs.nightTarget = saved.nightTarget;
      hs.solarHour = saved.solarHour;
      hs.solarGeo = saved.solarGeo;
      cam.position.copy(saved.pos);
      cam.quaternion.copy(saved.quat);
      cam.fov = saved.fov;
      if (saved.quality !== 'high') hs.setQuality(saved.quality);
      r.setPixelRatio(saved.ratio);
      r.setSize(saved.size.x, saved.size.y, false);
      cam.aspect = saved.aspect;
      cam.updateProjectionMatrix();
      if (clean) {
        if (saved.section) hs.toggleSectionCut();
        hs.planOverlayManualVisible = saved.planOverlay;
        hs.exploded = saved.exploded || 0;
        hs.explodedTarget = hs.exploded;
      }
      hs.setElevation(saved.elev);
      if (clean) {
        hs.updateTechnicalAnimations();
        hs.explodedTarget = saved.explodedTarget;
      }
      hs.setCeilingsVisible(saved.ceilings);
      if (hs.clientMeasureGroup) hs.clientMeasureGroup.visible = saved.notesVisible;
      hs.applyAtmosphere();
    }
  }

  /**
   * Génère une Depth Map (carte de profondeur) de la scène 3D.
   * Retourne une image en niveaux de gris où les objets proches sont blancs
   * et le fond est noir. Utilisée pour verrouiller la géométrie lors de la
   * sublimation IA (technologie type ControlNet Depth).
   * 
   * @param {object} shot — configuration du rendu (pos, look, fov)
   * @param {number} width — largeur (défaut 1920)
   * @param {number} height — hauteur (défaut 1080)
   * @returns {string} — dataURL de la depth map (JPEG)
   */
  captureDepthMap(shot, width = 1920, height = 1080) {
    const hs = this.hs, r = hs.renderer, cam = hs.camera;
    const saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect,
      bg: hs.scene.background, ratio: r.getPixelRatio(), size: r.getSize(new THREE.Vector2())
    };
    const originalMaterials = new Map();
    let customDepthMaterial = null;

    try {
      cam.position.fromArray(shot.pos);
      cam.lookAt(new THREE.Vector3().fromArray(shot.look));
      cam.fov = shot.fov;
      cam.aspect = width / height;
      cam.updateProjectionMatrix();

      const near = cam.near || 0.1;
      const far = cam.far || 100;
      customDepthMaterial = new THREE.ShaderMaterial({
        uniforms: {
          mNear: { value: near },
          mFar: { value: far }
        },
        vertexShader: `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float mNear;
          uniform float mFar;
          void main() {
            float depth = gl_FragCoord.z;
            float linearDepth = (2.0 * mNear) / (mFar + mNear - depth * (mFar - mNear));
            gl_FragColor = vec4(vec3(linearDepth), 1.0);
          }
        `
      });

      hs.scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          originalMaterials.set(obj, obj.material);
          obj.material = customDepthMaterial;
        }
      });

      r.setPixelRatio(1);
      r.setSize(width, height, false);
      hs.scene.background = new THREE.Color(0x000000);
      r.render(hs.scene, cam);
      return r.domElement.toDataURL('image/jpeg', 0.92);
    } finally {
      originalMaterials.forEach((mat, obj) => { obj.material = mat; });
      if (customDepthMaterial) customDepthMaterial.dispose();
      cam.position.copy(saved.pos);
      cam.quaternion.copy(saved.quat);
      cam.fov = saved.fov;
      cam.aspect = saved.aspect;
      cam.updateProjectionMatrix();
      r.setPixelRatio(saved.ratio);
      r.setSize(saved.size.x, saved.size.y, false);
      hs.scene.background = saved.bg;
    }
  }
  
  /**
   * Génère un rendu avec sublimation IA et vérification de fidélité automatique.
   * Boucle de rétroaction : si le score de fidélité < 50%, relance avec paramètres
   * plus stricts (temperature réduite, prompt renforcé).
   * 
   * @param {object} shot — configuration du rendu
   * @param {function} aiEnhanceFn — fonction d'appel à l'IA (reçoit image + depth + prompt)
   * @param {number} maxRetries — nombre maximum de tentatives (défaut 3)
   * @returns {Promise<{image: string, score: number, attempts: number}>}
   */
  async renderWithFidelityLoop(shot, aiEnhanceFn, maxRetries = 3) {
    // 1. Capture l'image originale et la depth map
    const originalImage = this.capture(shot);
    const depthMap = this.captureDepthMap(shot);
    
    // 2. Prompt de base (verrouillage orthographique + préservation géométrie)
    const PHOTOREAL_PROMPT_LOCAL = 'Create a photorealistic, magazine-quality architectural visualization. ' +
      'STRICT TOP-DOWN ORTHOGONAL PROJECTION ONLY, NO TILT, NO 3D ANGLE for floor plans. ' +
      'Preserve exact architectural geometry: do not move, add, remove, resize, or redesign any walls, ' +
      'doors, windows, openings, ceiling lines, or main volumes. Use deep charcoal solid infill for walls ' +
      'to indicate opaque masses. Place flooring and furniture ONLY inside room boundaries.';
    
    let prompt = PHOTOREAL_PROMPT_LOCAL + 
      '\n\nIMPORTANT: Preserve exact architectural geometry. Do not modify wall positions, ' +
      'window placements, or room proportions. Use the depth map to maintain spatial accuracy.';
    
    // 3. Boucle de rétroaction
    let attempts = 0;
    let bestResult = null;
    let bestScore = 0;
    
    while (attempts < maxRetries) {
      attempts++;
      
      // Appel à l'IA
      const generatedImage = await aiEnhanceFn(originalImage, depthMap, prompt);
      
      // Vérification de fidélité
      const fidelity = await FidelityCheck.checkFidelity(originalImage, generatedImage);
      
      console.log(`Tentative ${attempts}: score de fidélité = ${fidelity.score}%`);
      
      // Garde le meilleur résultat
      if (fidelity.score > bestScore) {
        bestScore = fidelity.score;
        bestResult = { image: generatedImage, score: fidelity.score, details: fidelity.details };
      }
      
      // Si le score est acceptable, on arrête
      if (fidelity.passed) {
        return { ...bestResult, attempts };
      }
      
      // Sinon, on renforce le prompt pour la prochaine tentative
      const temperature = Math.max(0.1, 0.5 - attempts * 0.15); // Réduit la température
      prompt = prompt + `\n\nCRITICAL (attempt ${attempts}): Previous generation scored only ${fidelity.score}%. ` +
        'You MUST preserve all architectural elements exactly. Reduce creative interpretation. ' +
        `Temperature set to ${temperature} for stricter adherence.`;
      
      // Attend un peu avant de relancer
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Retourne le meilleur résultat même si le seuil n'est pas atteint
    return { ...bestResult, attempts, warning: `Score max ${bestScore}% < 50% après ${maxRetries} tentatives` };
  }
  
  skyTexture(night) {
    this._sky = this._sky || {};
    if (this._sky[night]) return this._sky[night];
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    if (night) {
      grd.addColorStop(0, '#070c18'); grd.addColorStop(0.5, '#1a2540'); grd.addColorStop(1, '#3a3f52');
    } else {
      grd.addColorStop(0, '#6f9fcf'); grd.addColorStop(0.45, '#b9d3e8'); grd.addColorStop(0.56, '#eef2ee'); grd.addColorStop(1, '#dfe6df');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 512);
    return (this._sky[night] = new THREE.CanvasTexture(c));
  }

  async loadManifest() {
    try {
      const slug = window.ACTIVE_PROJECT_SLUG || HOUSE_DATA.meta?.slug || 'villa-serena';
      const res = await fetch(`projects/${encodeURIComponent(slug)}/generated/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Manifest not found');
      this.manifest = await res.json();
      return (this.manifest && Array.isArray(this.manifest.items)) ? this.manifest.items : [];
    } catch (e) {
      this.manifest = { version: 1, items: [] };
      return [];
    }
  }

  getExisting3DShots() {
    const slug = window.ACTIVE_PROJECT_SLUG || HOUSE_DATA.meta?.slug || 'villa-serena';
    const renderPath = `projects/${encodeURIComponent(slug)}/generated/renders`;
    const list = [
      { id: 'plan-2d-presentation', label: 'Plan 2D de présentation', url: `${renderPath}/plan-2d-presentation.png`, ext: 'png' }
    ];
    for (const shot of this.shots) {
      list.push({
        id: shot.id,
        label: shot.label,
        url: `${renderPath}/${shot.id}.jpg`,
        ext: 'jpg',
        shot
      });
    }
    return list;
  }

  save(name, dataUrl) {
    const slug = window.ACTIVE_PROJECT_SLUG || HOUSE_DATA.meta?.slug || 'villa-serena';
    return fetch(`api/save-render?project=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: dataUrl })
    }).then(r => r.ok).catch(() => false);
  }

  // Génère le plan de présentation + tous les rendus (un par image d'animation pour garder l'UI fluide)
  generateAll(onItem) {
    if (this.generating) return this.generating;
    const frame = () => new Promise(res => requestAnimationFrame(() => res()));
    this.generating = (async () => {
      this.results = [];
      if (this.hs.presentationCanvas) {
        const url = this.hs.presentationCanvas.toDataURL('image/png');
        const item = { id: 'plan-2d-presentation', label: 'Plan 2D de présentation', url, ext: 'png' };
        this.results.push(item);
        await this.save('plan-2d-presentation.png', url);
        onItem && onItem(item);
      }
      for (const shot of this.shots) {
        await frame();
        const url = this.capture(shot);
        const item = { id: shot.id, label: shot.label, url, ext: 'jpg', shot };
        this.results.push(item);
        await this.save(shot.id + '.jpg', url);
        onItem && onItem(item);
      }
      return this.results;
    })();
    this.generating.finally(() => { this.generating = null; });
    return this.generating;
  }
}

window.RenderStudio = RenderStudio;
