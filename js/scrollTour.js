/**
 * SCROLL TOUR CONTROLLER
 * Interpolation cinématique de la caméra le long d'une spline CatmullRomCurve3
 * Synchronisé avec le défilement fluide (GSAP / ScrollTrigger / Lenis)
 */

class ScrollTour {
  constructor(sceneController, onRoomChangeCallback) {
    this.houseScene = sceneController;
    this.onRoomChange = onRoomChangeCallback;
    this.activeRoomId = null;

    this.initCurves();
  }

  initCurves() {
    const waypoints = HOUSE_DATA.tourWaypoints;

    // Spline pour les positions de caméra
    const posPoints = waypoints.map(w => new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2]));
    this.posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'centripetal');

    // Spline pour les cibles de regard (lookAt)
    const lookPoints = waypoints.map(w => new THREE.Vector3(w.look[0], w.look[1], w.look[2]));
    this.lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal');

    // Données FOV
    this.fovValues = waypoints.map(w => w.fov);
  }

  /**
   * Met à jour la position et l'orientation de la caméra en fonction de progress (0 à 1)
   */
  update(progress) {
    const p = Math.max(0, Math.min(1, progress));

    // 1. Élévation des murs (s'effectue principalement entre 0% et 22% du scroll)
    const elevationProgress = Math.min(1, p / HOUSE_DATA.config.elevationEnd);
    this.houseScene.setElevation(elevationProgress);

    // 2. Position et cible caméra sur les splines
    const camPos = this.posCurve.getPoint(p);
    const camLook = this.lookCurve.getPoint(p);

    this.houseScene.camera.position.copy(camPos);
    this.houseScene.camera.lookAt(camLook);

    // 3. Interpolation du FOV pour dynamiser les passages étroits / grands volumes
    const fovIndex = p * (this.fovValues.length - 1);
    const i0 = Math.floor(fovIndex);
    const i1 = Math.min(this.fovValues.length - 1, i0 + 1);
    const fovRatio = fovIndex - i0;
    const targetFov = this.fovValues[i0] + (this.fovValues[i1] - this.fovValues[i0]) * fovRatio;

    this.houseScene.camera.fov = targetFov;
    this.houseScene.camera.updateProjectionMatrix();

    // 4. Détection de la pièce actuellement visitée
    this.detectCurrentRoom(camPos);
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
