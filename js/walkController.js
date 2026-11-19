/**
 * WALK CONTROLLER (Mode Visite Libre à la Première Personne)
 * Clavier : ZQSD / Flèches
 * Souris : Regard libre (Pointer Lock & Drag)
 * Gestion des collisions de cloisons et oscillation de marche (head bobbing)
 */

class WalkController {
  constructor(sceneController, onRoomChangeCallback) {
    this.houseScene = sceneController;
    this.camera = sceneController.camera;
    this.onRoomChange = onRoomChangeCallback;

    this.enabled = false;
    this.speed = 4.2; // m/s
    this.eyeHeight = 1.65; // hauteur d'yeux en mètres
    this.playerRadius = 0.25; // rayon du corps
    this.colliders = [];
    this._probe = new THREE.Vector3();

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    this.pitch = 0; // rotation haut/bas
    this.yaw = 0;   // rotation gauche/droite
    this.isPointerLocked = false;

    this.stepTimer = 0;
    this.lastTime = performance.now();

    this.initEvents();
  }

  initEvents() {
    // Clavier
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.clearMovement());

    // Souris
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = (document.pointerLockElement === this.houseScene.renderer.domElement);
    });

    // Clic pour activer le pointer lock
    this.houseScene.renderer.domElement.addEventListener('click', () => {
      if (this.enabled && !this.isPointerLocked && !this.houseScene.measureActive && !this.houseScene.feedbackActive) {
        try { this.houseScene.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch { /* navigateur sans verrouillage pointeur */ }
      }
    });
  }

  start(initialPosition = null) {
    this.enabled = true;
    this.houseScene.setElevation(1.0); // Murs levés à 100%

    // Boîtes de collision précalculées une fois (murs, vitrages, colonnes)
    const boxes = this.houseScene.colliderBoxes ||
      this.houseScene.wallMeshes.filter(m => m.userData.collide).map(m => new THREE.Box3().setFromObject(m));
    this.colliders = boxes.map(b => b.clone().expandByScalar(this.playerRadius));

    const start = HOUSE_DATA.config.walkStart;
    if (initialPosition) {
      this.camera.position.set(initialPosition.x, this.eyeHeight, initialPosition.z);
    } else {
      // Démarrage par défaut face au porche à colonnes
      this.camera.position.set(start.x, this.eyeHeight, start.z);
    }

    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();

    // Orientation initiale : regard vers le Nord (la maison)
    this.yaw = start.yaw || 0;
    this.pitch = 0;
    this.lastTime = performance.now();
    this.updateCameraRotation();

  }

  clearMovement() {
    this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = false;
  }

  stop() {
    this.enabled = false;
    this.clearMovement();
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  onKeyDown(e) {
    if (!this.enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('button, a, input, select, textarea, summary, [contenteditable]')) return;
    if (/^Arrow(Up|Down|Left|Right)$/.test(e.code)) e.preventDefault();

    switch (e.code) {
      case 'KeyW':
      case 'KeyZ':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'KeyQ':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
    }
  }

  onKeyUp(e) {
    if (!this.enabled) return;

    switch (e.code) {
      case 'KeyW':
      case 'KeyZ':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'KeyQ':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
    }
  }

  onMouseMove(e) {
    if (!this.enabled || !this.isPointerLocked) return;

    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;

    // Limiter le regard vertical (pas de looping)
    this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));

    this.updateCameraRotation();
  }

  updateCameraRotation() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  update() {
    if (!this.enabled) return;

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Décélération progressive (inertie naturelle)
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * this.speed * 12.0 * delta;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * this.speed * 12.0 * delta;
    }

    // Calcul du vecteur de déplacement dans l'espace caméra
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const moveStep = new THREE.Vector3()
      .addScaledVector(forward, -this.velocity.z * delta)
      .addScaledVector(right, -this.velocity.x * delta);

    const oldPos = this.camera.position.clone();
    const newPos = oldPos.clone().add(moveStep);

    // Collision simple avec les cloisons
    if (!this.checkWallCollision(newPos)) {
      this.camera.position.copy(newPos);
    } else {
      // Test de glissement le long des axes X ou Z
      const tryX = oldPos.clone().add(new THREE.Vector3(moveStep.x, 0, 0));
      if (!this.checkWallCollision(tryX)) {
        this.camera.position.x = tryX.x;
      }
      const tryZ = oldPos.clone().add(new THREE.Vector3(0, 0, moveStep.z));
      if (!this.checkWallCollision(tryZ)) {
        this.camera.position.z = tryZ.z;
      }
    }

    // Oscillation de la tête (Head-bobbing pendant la marche)
    const isMoving = (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1);
    if (isMoving) {
      this.stepTimer += delta * 9.0;
      const bobY = Math.sin(this.stepTimer) * 0.035;
      this.camera.position.y = this.eyeHeight + bobY;
    } else {
      this.camera.position.y = this.eyeHeight;
    }

    // Mise à jour de la pièce active pour le HUD
    this.updateActiveRoom();
  }

  checkWallCollision(pos) {
    const b = HOUSE_DATA.config.walkBounds;
    if (pos.x < b.xMin || pos.x > b.xMax || pos.z < b.zMin || pos.z > b.zMax) return true;

    this._probe.set(pos.x, this.eyeHeight, pos.z);
    for (let i = 0; i < this.colliders.length; i++) {
      if (this.colliders[i].containsPoint(this._probe)) return true;
    }
    return false;
  }

  updateActiveRoom() {
    const pos = this.camera.position;
    for (let r of HOUSE_DATA.rooms) {
      const b = r.bounds;
      if (roomContains(r, pos.x, pos.z)) {
        if (this.onRoomChange) this.onRoomChange(r);
        return;
      }
    }
  }
}

window.WalkController = WalkController;
