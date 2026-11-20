const clientNumber = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clientLevel = level => level ? `Étage ${level}` : 'RDC';

/** Annotations de la visite : ancrages monde Three.js, textes projetés en HTML. */
class ClientTools {
  constructor(hs, onLiveView) {
    this.hs = hs;
    this.onLiveView = onLiveView;
    this.panel = document.getElementById('client-tools');
    this.fields = document.getElementById('client-tool-fields');
    this.layer = document.getElementById('client-annotations');
    this.measureButton = document.getElementById('client-measure');
    this.clearButton = document.getElementById('client-clear');
    this.measureStatus = document.getElementById('client-measure-status');
    this.hotspotToggle = document.getElementById('client-hotspots');
    this.hour = document.getElementById('client-hour');
    this.hourOutput = document.getElementById('client-hour-value');
    this.solarOptions = new SolarOptions(this);
    document.querySelector('#client-compass span').style.transform = `rotate(${hs.northDegrees}deg)`;
    this.finishes = new ClientFinishes(hs);
    this.canvas = hs.renderer.domElement;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.projected = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.surfaceMeshes = hs.elevatedGroup.children.filter(obj => obj.isMesh && [hs.wallPBRMaterial, hs.facadeMaterial].includes(obj.material)).concat(hs.finishFloorMeshes);
    this.surfaceSet = new Set(this.surfaceMeshes);
    this.measureGroup = new THREE.Group();
    this.measureMaterial = new THREE.LineBasicMaterial({ color: 0x32e1bf, depthTest: false, depthWrite: false, toneMapped: false });
    hs.clientMeasureGroup = this.measureGroup;
    hs.scene.add(this.measureGroup);
    this.measurements = [];
    this.measuring = false;
    this.hotspots = HOUSE_DATA.rooms.map(room => this.makeHotspot(room));
    this.nextOcclusion = 0;
    this.occlusionWorld = new THREE.Matrix4();
    this.occlusionProjection = new THREE.Matrix4();

    this.canvas.addEventListener('click', event => this.pick(event));
    this.panel.addEventListener('toggle', () => { if (this.panel.open) onLiveView(); });
    this.measureButton.addEventListener('click', () => this.toggleMeasure());
    this.clearButton.addEventListener('click', () => this.clear());
    this.hour.addEventListener('input', () => this.setHour(Number(this.hour.value)));
    this.hotspotToggle.addEventListener('change', () => { if (this.hotspotToggle.checked) onLiveView(); });
    document.getElementById('client-floor').addEventListener('change', event => { this.finishes.setFloor(event.target.value); onLiveView(); });
    document.getElementById('client-facade').addEventListener('change', event => { this.finishes.setFacade(event.target.value); onLiveView(); });
  }

  setHour(hour) {
    this.hs.setSolarHour(hour);
    this.hour.value = this.hs.solarTarget;
    const label = SolarStudy.format(this.hs.solarTarget);
    this.hourOutput.value = label;
    this.hour.setAttribute('aria-valuetext', label);
    this.solarOptions.updateReading();
    Icons.label(document.getElementById('btn-night'), this.hs.nightTarget > 0.5 ? 'moon' : 'sun', this.hs.nightTarget > 0.5 ? 'Soir' : 'Jour');
    this.onLiveView();
  }

  makeAnchor() {
    const el = document.createElement('div');
    el.className = 'client-anchor';
    el.hidden = true;
    this.layer.append(el);
    return el;
  }

  makeHotspot(room) {
    const el = this.makeAnchor();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'client-hotspot';
    button.textContent = 'i';
    button.setAttribute('aria-label', `${room.name} — ${clientLevel(room.level)}`);
    button.setAttribute('aria-expanded', 'false');
    const card = document.createElement('div');
    card.className = 'client-room-card';
    card.id = `client-room-${this.layer.children.length}`;
    button.setAttribute('aria-controls', card.id);
    const title = document.createElement('strong');
    title.textContent = room.name;
    const details = document.createElement('span');
    details.textContent = `${clientLevel(room.level)} · ${clientNumber.format(room.area)} m²`;
    const height = document.createElement('span');
    height.textContent = room.habitable ? `Sous plafond : ${clientNumber.format(HOUSE_DATA.config.wallHeight)} m` : 'Sans plafond modélisé';
    card.append(title, details, height);
    el.append(button, card);
    button.addEventListener('click', () => {
      const open = !el.classList.contains('is-open');
      if (this.openHotspot) this.closeHotspot();
      if (open) {
        el.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        this.openHotspot = { el, button };
      } else button.blur();
    });
    const anchorY = Math.min(1.25, HOUSE_DATA.config.wallHeight * 0.55);
    const { x, z } = room.center;
    const y = this.hs.levelOffset(room.level) + anchorY;
    const roofY = (HOUSE_DATA.canopies || []).filter(roof => (Number(roof.level) || 0) === room.level &&
      (roof.poly ? pointInPolygon(roof.poly, x, z) : x >= roof.xMin && x <= roof.xMax && z >= roof.zMin && z <= roof.zMax))
      .reduce((top, roof) => Math.max(top, this.hs.levelOffset(roof.level) + (roof.y || 0) + (roof.thick || 0.2) + 0.25), y);
    return { el, point: new THREE.Vector3(x, y, z), insideY: y, roofY, occluded: true };
  }

  closeHotspot() {
    if (!this.openHotspot) return;
    this.openHotspot.el.classList.remove('is-open');
    this.openHotspot.button.setAttribute('aria-expanded', 'false');
    this.openHotspot = null;
  }

  ready() {
    return this.hs.elevationProgress >= 0.99 && !(this.hs.explodedTarget || this.hs.exploded);
  }

  toggleMeasure(active = !this.measuring) {
    this.measuring = this.hs.measureActive = active;
    this.measureButton.setAttribute('aria-pressed', String(active));
    this.measureButton.classList.toggle('is-active', active);
    this.hs.container.classList.toggle('is-measuring', active);
    this.layer.classList.toggle('is-measuring', active);
    if (active) {
      if (document.pointerLockElement) document.exitPointerLock?.();
      this.closeHotspot();
      this.onLiveView();
    } else this.cancelPoint();
    this.syncMeasureStatus();
  }

  cancelPoint() {
    this.pending?.el.remove();
    this.pending = null;
    this.clearButton.disabled = !this.measurements.length;
  }

  clear() {
    this.measurements.forEach(({ line, el }) => {
      this.measureGroup.remove(line);
      line.geometry.dispose();
      el.remove();
    });
    this.measurements.length = 0;
    this.cancelPoint();
    this.syncMeasureStatus();
  }

  syncMeasureStatus(error = '') {
    const message = error || (!this.ready() ? 'Attendez la fin de l’élévation et désactivez la vue éclatée.'
      : this.pending ? 'Cliquez le deuxième point sur un mur ou un sol.'
        : this.measurements.length ? 'Cote ajoutée. Cliquez pour démarrer une autre mesure (M pour quitter).'
          : 'Cliquez le premier point sur un mur ou un sol (M pour quitter).');
    if (this.measureStatus.textContent !== message) this.measureStatus.textContent = message;
    this.measureStatus.hidden = !this.measuring || this.fields.disabled;
  }

  clipped(point) {
    return this.hs.sectionEnabled && this.hs.sectionPlane.distanceToPoint(point) < -0.001;
  }

  blockers(includeFurniture = false) {
    const hs = this.hs;
    const meshes = this.surfaceMeshes.concat(hs.slabMeshes, hs.ceilings, hs.canopyGroup.visible ? hs.canopyGroup.children : []);
    if (includeFurniture && hs.furnGroup?.visible) meshes.push(...hs.furnGroup.children.filter(obj => obj.isMesh && !obj.material.transparent));
    return meshes.filter(mesh => mesh.isMesh && mesh.visible && mesh.material.visible && mesh.material.opacity > 0.1);
  }

  pickSurface(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set((event.clientX - rect.left) * 2 / rect.width - 1, 1 - (event.clientY - rect.top) * 2 / rect.height);
    this.hs.scene.updateMatrixWorld(true);
    this.hs.camera.updateMatrixWorld();
    this.ray.far = this.hs.camera.far;
    this.ray.setFromCamera(this.ndc, this.hs.camera);
    const hit = this.ray.intersectObjects(this.blockers(true), false).find(h => !this.clipped(h.point));
    return hit && this.surfaceSet.has(hit.object) ? hit : null;
  }

  pick(event) {
    if (!this.measuring || !this.ready() || this.fields.disabled || event.button !== 0) return;
    const hit = this.pickSurface(event);
    if (!hit) {
      this.syncMeasureStatus('Aucun mur ni sol visible à cet endroit. Choisissez un autre point.');
      return;
    }
    if (!this.pending) {
      const el = this.makeAnchor();
      const dot = document.createElement('div');
      dot.className = 'client-measure-point';
      el.append(dot);
      this.pending = { point: hit.point, el };
    } else {
      const a = this.pending.point, b = hit.point;
      const distance = a.distanceTo(b);
      if (distance < 0.005) { this.syncMeasureStatus('Choisissez un deuxième point distinct.'); return; }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), this.measureMaterial);
      line.renderOrder = 10;
      this.measureGroup.add(line);
      const el = this.makeAnchor();
      const label = document.createElement('div');
      label.className = 'client-distance';
      label.textContent = `${clientNumber.format(distance)} m`;
      el.append(label);
      this.measurements.push({ line, el, a, b, point: a.clone().lerp(b, 0.5) });
      this.cancelPoint();
    }
    this.clearButton.disabled = false;
    this.syncMeasureStatus();
  }

  project(anchor, visible) {
    const p = this.projected.copy(anchor.point).project(this.hs.camera);
    visible = visible && !this.clipped(anchor.point) && p.z >= -1 && p.z <= 1 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98;
    if (visible) {
      const x = Math.round((p.x + 1) * 0.5 * this.hs.width), y = Math.round((1 - p.y) * 0.5 * this.hs.height);
      if (anchor.screenX !== x || anchor.screenY !== y) {
        anchor.el.style.transform = `translate3d(${x}px,${y}px,0)`;
        anchor.screenX = x;
        anchor.screenY = y;
      }
    }
    return visible;
  }

  update(now, suppressed) {
    const hs = this.hs;
    const ready = this.ready();
    const show = ready && !suppressed;
    const showRooms = show && !this.measuring && this.hotspotToggle.checked && !document.pointerLockElement;
    const camera = hs.camera;
    if (show) camera.updateMatrixWorld();
    const aerial = showRooms && !hs.sectionEnabled && camera.matrixWorld.elements[9] > 0.27;
    // Lancer les rayons à fréquence réduite, et ne pas les répéter si la vue est fixe.
    const checkOcclusion = showRooms && now >= this.nextOcclusion && (!this.nextOcclusion ||
      this.occlusionSection !== hs.sectionEnabled || !this.occlusionWorld.equals(camera.matrixWorld) ||
      !this.occlusionProjection.equals(camera.projectionMatrix));
    if (checkOcclusion) {
      this.nextOcclusion = now + 140;
      this.occlusionSection = hs.sectionEnabled;
      this.occlusionWorld.copy(camera.matrixWorld);
      this.occlusionProjection.copy(camera.projectionMatrix);
    } else if (!showRooms) this.nextOcclusion = 0;
    let blockers;
    this.hotspots.forEach(anchor => {
      anchor.point.y = aerial && hs.camera.position.y > anchor.roofY + 0.8 ? anchor.roofY : anchor.insideY;
      const onScreen = showRooms && this.project(anchor, true);
      if (onScreen && checkOcclusion) {
        blockers ||= this.blockers();
        this.direction.copy(anchor.point).sub(hs.camera.position);
        this.ray.far = this.direction.length() - 0.03;
        this.ray.set(hs.camera.position, this.direction.normalize());
        anchor.occluded = this.ray.intersectObjects(blockers, false).some(h => !this.clipped(h.point));
      }
      const hidden = !onScreen || anchor.occluded;
      if (hidden !== anchor.el.hidden) anchor.el.hidden = hidden;
      if (anchor.el.hidden && this.openHotspot?.el === anchor.el) this.closeHotspot();
    });
    this.measureGroup.visible = show;
    this.measurements.forEach(m => {
      m.line.visible = !this.clipped(m.a) && !this.clipped(m.b);
      m.el.hidden = !show || !m.line.visible || !this.project(m, true);
    });
    if (this.pending && (!ready || this.clipped(this.pending.point))) this.cancelPoint();
    if (this.pending) this.pending.el.hidden = !show || !this.project(this.pending, true);
    if (ready !== this.wasReady) this.syncMeasureStatus();
    this.wasReady = ready;
  }
}
