/**
 * 2D ARCHITECTURAL MINIMAP & RADAR
 * Dessine le plan d'étage en temps réel dans un canvas avec cône de vision du visiteur
 */

class MiniMap {
  constructor(canvasElement, sceneController, onRoomClick) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.houseScene = sceneController;
    this.onRoomClick = onRoomClick;

    this.scale = 12; // pixels par mètre
    this.size = 200;
    this.canvas.width = this.size;
    this.canvas.height = this.size;

    this.offsetX = this.size / 2;
    this.offsetZ = this.size / 2;
    // Échelle et centrage adaptés à l'emprise du projet chargé
    if (window.HouseAuto) {
      const bb = HouseAuto.bbox(HOUSE_DATA);
      this.scale = Math.min(14, (this.size - 24) / Math.max(bb.max, 1));
      this.offsetX = this.size / 2 - bb.cx * this.scale;
      this.offsetZ = this.size / 2 - bb.cz * this.scale;
    }

    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  worldToMap(x, z) {
    return {
      mx: this.offsetX + x * this.scale,
      mz: this.offsetZ + z * this.scale
    };
  }

  mapToWorld(mx, mz) {
    return {
      x: (mx - this.offsetX) / this.scale,
      z: (mz - this.offsetZ) / this.scale
    };
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const mz = e.clientY - rect.top;
    const worldPos = this.mapToWorld(mx, mz);

    // Trouver la pièce cliquée
    for (let r of HOUSE_DATA.rooms) {
      const b = r.bounds;
      if (roomContains(r, worldPos.x, worldPos.z)) {
        if (this.onRoomClick) {
          this.onRoomClick(r);
        }
        break;
      }
    }
  }

  buildWallSegments() {
    this.wallSegments = [];
    this.windowSegments = [];
    HOUSE_DATA.walls.forEach(w => {
      const dx = (w.to[0] - w.from[0]) / w.length;
      const dz = (w.to[1] - w.from[1]) / w.length;
      const pt = (d) => this.worldToMap(w.from[0] + dx * d, w.from[1] + dz * d);
      let cursor = 0;
      w.openings.forEach(op => {
        const s = op.at - op.w / 2, e = op.at + op.w / 2;
        if (s > cursor) this.wallSegments.push({ a: pt(cursor), b: pt(s), ext: w.type === 'ext' });
        if (op.type === 'window' || op.type === 'bay') this.windowSegments.push({ a: pt(s), b: pt(e) });
        cursor = e;
      });
      if (w.length > cursor) this.wallSegments.push({ a: pt(cursor), b: pt(w.length), ext: w.type === 'ext' });
    });
  }

  update(activeRoomId) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    // Fond papier de la minimap
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(0, 0, this.size, this.size);

    // 1. Dessiner les pièces
    HOUSE_DATA.rooms.forEach(r => {
      const b = r.bounds;
      const p1 = this.worldToMap(b.xMin, b.zMin);
      const p2 = this.worldToMap(b.xMax, b.zMax);
      const w = p2.mx - p1.mx;
      const h = p2.mz - p1.mz;

      const isActive = (r.id === activeRoomId);

      // Fond de pièce (rectangle ou polygone)
      ctx.beginPath();
      if (r.poly) r.poly.forEach((p, i) => { const m = this.worldToMap(p[0], p[1]); i ? ctx.lineTo(m.mx, m.mz) : ctx.moveTo(m.mx, m.mz); });
      else ctx.rect(p1.mx, p1.mz, w, h);
      ctx.closePath();
      ctx.fillStyle = isActive ? 'rgba(23, 121, 110, 0.22)' : 'rgba(235, 230, 220, 0.6)';
      ctx.fill();

      // Lignes de cloisons
      ctx.strokeStyle = isActive ? '#17796e' : '#2b353e';
      ctx.lineWidth = isActive ? 1.8 : 1.2;
      ctx.stroke();
    });

    // 2. Murs (pré-calculés : tronçons pleins entre les ouvertures) + fenêtres + colonnes
    if (!this.wallSegments) this.buildWallSegments();
    ctx.strokeStyle = '#111827';
    this.wallSegments.forEach(seg => {
      ctx.beginPath();
      ctx.moveTo(seg.a.mx, seg.a.mz);
      ctx.lineTo(seg.b.mx, seg.b.mz);
      ctx.lineWidth = seg.ext ? 2.5 : 1.5;
      ctx.stroke();
    });
    ctx.strokeStyle = '#5aa7c7';
    ctx.lineWidth = 1.2;
    this.windowSegments.forEach(seg => {
      ctx.beginPath();
      ctx.moveTo(seg.a.mx, seg.a.mz);
      ctx.lineTo(seg.b.mx, seg.b.mz);
      ctx.stroke();
    });
    ctx.fillStyle = '#6b7280';
    (HOUSE_DATA.columns || []).forEach(c => {
      const p = this.worldToMap(c.x, c.z);
      const s = Math.max(3, c.base * this.scale);
      ctx.fillRect(p.mx - s / 2, p.mz - s / 2, s, s);
    });

    // 3. Position du joueur & Cône de vision
    const cam = this.houseScene.camera;
    const camPos = cam.position;
    const pPlayer = this.worldToMap(camPos.x, camPos.z);

    // Direction du regard de la caméra
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const viewAngle = Math.atan2(dir.z, dir.x);

    // Cône de vision (Frustum)
    const fovAngle = (cam.fov * Math.PI) / 180 * 0.6;
    const coneRadius = 26;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pPlayer.mx, pPlayer.mz);
    ctx.arc(pPlayer.mx, pPlayer.mz, coneRadius, viewAngle - fovAngle / 2, viewAngle + fovAngle / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(23, 121, 110, 0.28)';
    ctx.fill();
    ctx.restore();

    // Point de position joueur
    ctx.beginPath();
    ctx.arc(pPlayer.mx, pPlayer.mz, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = '#17796e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

window.MiniMap = MiniMap;
