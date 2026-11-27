/**
 * SCROLL TOUR CONTROLLER
 * Interpolation cinématique lente et fluide de la caméra le long d'une spline CatmullRomCurve3
 * avec ralentissement contemplatif dans chaque pièce (room-dwell) et amortissement exponentiel.
 */

class ScrollTour {
  constructor(sceneController, onRoomChangeCallback) {
    this.houseScene = sceneController;
    this.onRoomChange = onRoomChangeCallback;
    this.activeRoomId = null;

    // Presets de rythme cinématographique (durée totale du parcours complet en secondes)
    this.pacePresets = {
      contemplatif: { label: 'Très lent · 72 s', seconds: 72, dwell: 0.42, damping: 4.2, stepDuration: 2.8 },
      cinema:       { label: 'Cinéma lent · 52 s', seconds: 52, dwell: 0.34, damping: 5.5, stepDuration: 2.2 },
      fluide:       { label: 'Fluide · 34 s', seconds: 34, dwell: 0.22, damping: 7.5, stepDuration: 1.5 }
    };
    this.pace = 'cinema';

    // Vecteurs pré-alloués (zéro GC dans la boucle 60 FPS)
    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
    this._smoothPos = new THREE.Vector3();
    this._smoothLook = new THREE.Vector3();
    this._smoothFov = 45;
    this._hasSmooth = false;

    this.initCurves();
  }

  setPace(paceKey) {
    if (this.pacePresets[paceKey]) this.pace = paceKey;
    return this.getPaceConfig();
  }

  getPaceConfig() {
    return this.pacePresets[this.pace] || this.pacePresets.cinema;
  }

  initCurves() {
    const waypoints = HOUSE_DATA.tourWaypoints || [];
    this.waypoints = waypoints;

    // Spline pour les positions de caméra
    const posPoints = waypoints.map(w => new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2]));
    this.posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'centripetal');

    // Spline pour les cibles de regard (lookAt)
    const lookPoints = waypoints.map(w => new THREE.Vector3(w.look[0], w.look[1], w.look[2]));
    this.lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal');

    // Données FOV
    this.fovValues = waypoints.map(w => w.fov);

    // Table de remappage « contemplation par pièce » : ralentit doucement aux arrêts de pièces
    // pour apprécier les volumes, tout en restant strictement croissant sur [0, 1].
    this._buildDwellMap();
    this._hasSmooth = false;
  }

  _buildDwellMap() {
    const waypoints = this.waypoints || [];
    const n = waypoints.length;
    const samples = 240;
    const raw = new Float32Array(samples + 1);
    const anchors = [];
    if (n > 1) {
      waypoints.forEach((w, i) => {
        if (w && (w.room || i === 2 || i === n - 1)) anchors.push(i / (n - 1));
      });
    }
    const sigma = n > 2 ? 0.36 / (n - 1) : 0.08;
    const inv2Sig2 = 1 / (2 * sigma * sigma);
    let acc = 0;
    raw[0] = 0;
    for (let s = 1; s <= samples; s++) {
      const u = (s - 0.5) / samples;
      let weight = 1;
      for (let a = 0; a < anchors.length; a++) {
        const d = u - anchors[a];
        // Plus de temps passé autour des pièces clés (jusqu'à +115% de durée locale)
        weight += 1.15 * Math.exp(-(d * d) * inv2Sig2);
      }
      acc += weight;
      raw[s] = acc;
    }
    for (let s = 0; s <= samples; s++) raw[s] /= acc || 1;
    // Table inverse : temps normalisé t -> progression courbe u(t)
    this._dwellInv = new Float32Array(samples + 1);
    let j = 0;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      while (j < samples - 1 && raw[j + 1] < t) j++;
      const span = Math.max(1e-6, raw[j + 1] - raw[j]);
      const frac = Math.max(0, Math.min(1, (t - raw[j]) / span));
      this._dwellInv[i] = (j + frac) / samples;
    }
  }

  /**
   * Transforme une progression linéaire t (0..1) en progression cinématographique
   * qui ralentit naturellement dans chaque pièce (strength = 0 → linéaire).
   */
  remapProgress(t, strength = null) {
    const p = Math.max(0, Math.min(1, t));
    const mix = strength === null ? this.getPaceConfig().dwell : Math.max(0, Math.min(1, strength));
    if (!this._dwellInv || mix <= 0) return p;
    const samples = this._dwellInv.length - 1;
    const idx = p * samples;
    const i0 = Math.floor(idx);
    const i1 = Math.min(samples, i0 + 1);
    const u = this._dwellInv[i0] + (this._dwellInv[i1] - this._dwellInv[i0]) * (idx - i0);
    return p + (u - p) * mix;
  }

  /**
   * Calcule la pose exacte (sans amortissement) à la progression courbe p (0..1).
   */
  samplePose(p) {
    const clamped = Math.max(0, Math.min(1, p));
    this.posCurve.getPoint(clamped, this._targetPos);
    this.lookCurve.getPoint(clamped, this._targetLook);
    const fovIndex = clamped * (this.fovValues.length - 1);
    const i0 = Math.floor(fovIndex);
    const i1 = Math.min(this.fovValues.length - 1, i0 + 1);
    const fovRatio = fovIndex - i0;
    const fov = this.fovValues[i0] + (this.fovValues[i1] - this.fovValues[i0]) * fovRatio;
    return { pos: this._targetPos, look: this._targetLook, fov };
  }

  /**
   * Met à jour la position et l'orientation de la caméra en fonction de progress (0 à 1).
   * - Par défaut (instant) : pose immédiate sur la spline (compatible tests, scroll direct, capture frame exacte).
   * - Avec { dt, smooth: true } : amortissement exponentiel cinéma (gimbal stabilisé).
   * - Avec { dwell: true } : applique le ralentissement contemplatif dans chaque pièce.
   */
  update(progress, { dt = 0, smooth = false, dwell = false } = {}) {
    const rawP = Math.max(0, Math.min(1, progress));
    const p = dwell ? this.remapProgress(rawP) : rawP;

    // 1. Élévation des murs (s'effectue principalement entre 0% et elevationEnd du scroll)
    const elevationProgress = Math.min(1, p / HOUSE_DATA.config.elevationEnd);
    this.houseScene.setElevation(elevationProgress);

    // 2. Position, cible regard et FOV sur les splines
    const { pos, look, fov } = this.samplePose(p);

    if (smooth && dt > 0 && this._hasSmooth) {
      const lambda = this.getPaceConfig().damping;
      const alpha = 1 - Math.exp(-lambda * dt);
      this._smoothPos.lerp(pos, alpha);
      this._smoothLook.lerp(look, alpha);
      this._smoothFov += (fov - this._smoothFov) * alpha;
    } else {
      this._smoothPos.copy(pos);
      this._smoothLook.copy(look);
      this._smoothFov = fov;
      this._hasSmooth = true;
    }

    this.houseScene.camera.position.copy(this._smoothPos);
    this.houseScene.camera.lookAt(this._smoothLook);
    this.houseScene.camera.fov = this._smoothFov;
    this.houseScene.camera.updateProjectionMatrix();

    // 3. Détection de la pièce actuellement visitée
    this.detectCurrentRoom(this._smoothPos);
  }

  resetSmoothing() {
    this._hasSmooth = false;
  }

  detectCurrentRoom(pos) {
    let current = null;

    for (let r of HOUSE_DATA.rooms) {
      const aboveFloor = pos.y - this.houseScene.levelOffset(r.level);
      if (aboveFloor >= 0 && aboveFloor <= HOUSE_DATA.config.wallHeight && roomContains(r, pos.x, pos.z)) {
        current = r;
        break;
      }
    }

    // Si on est à l'extérieur ou en vol zénithal
    if (!current && pos.y > 3.5) {
      current = {
        id: 'overview',
        name: 'VUE D\'ENSEMBLE DU PLAN',
        surface: HOUSE_DATA.totals.habitableLabel,
        desc: 'Élévation volumique & distribution des espaces'
      };
    } else if (!current) {
      current = {
        id: 'outside',
        name: 'EXTÉRIEUR & ACCÈS',
        surface: 'Parcelle aménagée',
        desc: 'Abords paysagers de la maison'
      };
    }

    if (this.activeRoomId !== current.id) {
      this.activeRoomId = current.id;
      if (this.onRoomChange) {
        this.onRoomChange(current);
      }
    }
  }
}

window.ScrollTour = ScrollTour;
