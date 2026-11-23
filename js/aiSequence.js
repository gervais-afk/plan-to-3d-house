/**
 * SÉQUENCE POUR L'IA — export image par image du parcours guidé, prêt pour un modèle « vidéo vers vidéo »
 * (Runway Aleph / Gen-4, Luma Modify, Wan VACE dans ComfyUI…).
 *
 * Pourquoi pas l'enregistrement d'écran ? Il est filmé en temps réel et peut sauter des images ; les modèles
 * vidéo, eux, traitent des clips courts (5 à 10 s). On rend donc chaque image à cadence exacte, segment par
 * segment, avec trois passes qui verrouillent la géométrie :
 *   - couleur    : le rendu de la maquette (JPEG) ;
 *   - profondeur : niveaux de gris linéaires, proche = blanc (convention ControlNet « depth ») ;
 *   - contours   : arêtes de la géométrie, blanc sur noir (convention « canny / lineart »).
 * L'IA ne doit changer que la matière et la lumière : murs, ouvertures et cadrage restent ceux du plan.
 */
const AiSequence = (() => {
  /**
   * Découpe le parcours en segments courts, en suivant les étapes (waypoints) du parcours guidé.
   * Sur la courbe du parcours, l'étape i se trouve à la progression i / (n − 1).
   * @param {Array} waypoints   HOUSE_DATA.tourWaypoints
   * @param {object} o          { totalSeconds, fps, maxSegmentSeconds, skipBefore }
   */
  function plan(waypoints, { totalSeconds = 24, fps = 24, maxSegmentSeconds = 5, skipBefore = 0 } = {}) {
    const n = Array.isArray(waypoints) ? waypoints.length : 0;
    if (n < 2) return [];
    const spans = n - 1, spanSeconds = totalSeconds / spans;
    const perSegment = Math.max(1, Math.floor(maxSegmentSeconds / spanSeconds + 1e-9));
    const segments = [];
    for (let i = 0; i < spans; i += perSegment) {
      const j = Math.min(spans, i + perSegment);
      const start = i / spans, end = j / spans;
      if (end <= skipBefore + 1e-9) continue; // phase « élévation des murs » écartée par défaut
      const from = Math.max(start, skipBefore);
      const seconds = (end - from) * totalSeconds;
      const frames = Math.max(2, Math.round(seconds * fps));
      const labels = waypoints.slice(i, j + 1).map(w => w.label).filter(Boolean);
      const label = [...new Set(labels)].slice(0, 2).join(' → ') || `Segment ${segments.length + 1}`;
      const aerial = waypoints.slice(i, j + 1).some(w => w.pos[1] > 5.5);
      segments.push({ index: segments.length + 1, start: from, end, seconds: Math.round(seconds * 100) / 100, frames, label, aerial });
    }
    return segments;
  }

  /** Progression de chaque image d'un segment (première et dernière incluses). */
  const frameProgress = (segment, k) => segment.start + (segment.end - segment.start) * (segment.frames === 1 ? 0 : k / (segment.frames - 1));

  /** Arêtes (Sobel) d'images en niveaux de gris : blanc sur noir, seuil adaptatif. */
  function edgesFromGray(sources, width, height) {
    const out = new Uint8ClampedArray(width * height);
    const mag = new Float32Array(width * height);
    let max = 0;
    for (const g of sources) {
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx = g[i - width + 1] + 2 * g[i + 1] + g[i + width + 1] - g[i - width - 1] - 2 * g[i - 1] - g[i + width - 1];
        const gy = g[i + width - 1] + 2 * g[i + width] + g[i + width + 1] - g[i - width - 1] - 2 * g[i - width] - g[i - width + 1];
        const m = Math.hypot(gx, gy);
        if (m > mag[i]) mag[i] = m;
        if (m > max) max = m;
      }
    }
    const threshold = max * 0.12;
    for (let i = 0; i < mag.length; i++) out[i] = mag[i] >= threshold ? 255 : 0;
    return out;
  }

  // ------------------------------------------------------------------------------------------------
  // Navigateur : rendu des passes depuis la scène Three.js
  // ------------------------------------------------------------------------------------------------
  let depthMaterial = null, normalMaterial = null;
  function materials(far) {
    if (!depthMaterial) {
      depthMaterial = new THREE.ShaderMaterial({
        uniforms: { uNear: { value: 0.3 }, uFar: { value: far } },
        vertexShader: 'varying float vViewZ; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewZ = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uNear; uniform float uFar; varying float vViewZ; void main(){ float d = clamp(1.0 - (vViewZ - uNear) / (uFar - uNear), 0.0, 1.0); gl_FragColor = vec4(vec3(d), 1.0); }',
        side: THREE.DoubleSide
      });
      normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    }
    depthMaterial.uniforms.uFar.value = far;
    return { depthMaterial, normalMaterial };
  }

  /** Pose la caméra du parcours à la progression p (même courbe que la visite guidée). */
  function shotAt(tour, p) {
    const pos = tour.posCurve.getPoint(p), look = tour.lookCurve.getPoint(p);
    const f = p * (tour.fovValues.length - 1), i0 = Math.floor(f), i1 = Math.min(tour.fovValues.length - 1, i0 + 1);
    const fov = tour.fovValues[i0] + (tour.fovValues[i1] - tour.fovValues[i0]) * (f - i0);
    // Intérieur : sous le toit du dernier niveau et à hauteur d'œil d'un étage (plafonds visibles).
    const cfg = (typeof HOUSE_DATA !== 'undefined' && HOUSE_DATA.config) || {};
    const fh = Number(cfg.floorHeight) || 3, wall = Number(cfg.wallHeight) || 2.8;
    const levels = typeof HOUSE_DATA !== 'undefined' ? 1 + Math.max(0, ...(HOUSE_DATA.walls || []).map(w => Number(w.level) || 0)) : 1;
    const interior = pos.y > 0 && pos.y < levels * fh && (pos.y % fh) < wall - 0.05;
    return { pos: pos.toArray(), look: look.toArray(), fov, interior };
  }

  /** Rend une passe « technique » (profondeur ou normales) dans un canevas, puis rétablit la scène. */
  function technicalPass(hs, shot, width, height, material) {
    const r = hs.renderer, cam = hs.camera, scene = hs.scene;
    const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, ratio: r.getPixelRatio(),
      size: r.getSize(new THREE.Vector2()), bg: scene.background, fog: scene.fog, override: scene.overrideMaterial, elev: hs.elevationProgress,
      ceilings: hs.ceilingsVisible };
    try {
      hs.setElevation(1);
      hs.setCeilingsVisible(shot.interior);
      cam.position.fromArray(shot.pos);
      cam.lookAt(new THREE.Vector3().fromArray(shot.look));
      cam.fov = shot.fov; cam.aspect = width / height; cam.updateProjectionMatrix();
      scene.background = new THREE.Color(0x000000);
      scene.fog = null;
      scene.overrideMaterial = material;
      r.setPixelRatio(1);
      r.setSize(width, height, false);
      r.render(scene, cam);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(r.domElement, 0, 0, width, height);
      return canvas;
    } finally {
      scene.overrideMaterial = saved.override;
      scene.background = saved.bg; scene.fog = saved.fog;
      cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.fov = saved.fov; cam.aspect = saved.aspect; cam.updateProjectionMatrix();
      r.setPixelRatio(saved.ratio); r.setSize(saved.size.x, saved.size.y, false);
      hs.setElevation(saved.elev); hs.setCeilingsVisible(saved.ceilings);
    }
  }

  const grayOf = (canvas, channel = -1) => {
    const { width, height } = canvas;
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    const g = new Float32Array(width * height);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = channel >= 0 ? px[p + channel] : (px[p] + px[p + 1] + px[p + 2]) / 3;
    return g;
  };

  /**
   * Rend une image du parcours dans les passes demandées.
   * @returns {Promise<{ color?: string, depth?: string, edges?: string }>} images en data URL
   */
  function captureFrame({ hs, studio, tour }, p, { width = 1280, height = 720, passes = ['color', 'depth', 'edges'], far = 20 } = {}) {
    const shot = shotAt(tour, p);
    const out = {};
    if (passes.includes('color')) out.color = studio.capture({ ...shot, night: false }, width, height, 1.25, { clean: true });
    if (passes.includes('depth') || passes.includes('edges')) {
      const { depthMaterial: dm, normalMaterial: nm } = materials(far);
      const depth = technicalPass(hs, shot, width, height, dm);
      if (passes.includes('depth')) out.depth = depth.toDataURL('image/png');
      if (passes.includes('edges')) {
        const normals = technicalPass(hs, shot, width, height, nm);
        const lines = edgesFromGray([grayOf(depth), grayOf(normals, 0), grayOf(normals, 1), grayOf(normals, 2)], width, height);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(width, height);
        for (let i = 0, q = 0; i < lines.length; i++, q += 4) { img.data[q] = img.data[q + 1] = img.data[q + 2] = lines[i]; img.data[q + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        out.edges = canvas.toDataURL('image/png');
      }
    }
    return out;
  }

  return { plan, frameProgress, edgesFromGray, shotAt, captureFrame };
})();

if (typeof module !== 'undefined') module.exports = AiSequence;
