/**
 * RENDER STUDIO — rendus « grandeur nature » haute définition depuis la scène 3D
 * Sur-échantillonnage ×1,5 puis réduction (anti-crénelage), ombres 4096, vignettage photo léger.
 * Les images s'affichent dans une galerie et sont enregistrées dans le dossier generated/ du projet actif.
 */
class RenderStudio {
  constructor(houseScene) {
    this.hs = houseScene;
    this.shots = HOUSE_DATA.renderShots || [];
    this.results = [];
    this.generating = null;
  }

  capture(shot, width = 1920, height = 1080, ss = 1.5) {
    const hs = this.hs, r = hs.renderer, cam = hs.camera;
    const saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect,
      night: hs.night, nightTarget: hs.nightTarget, elev: hs.elevationProgress, quality: hs.quality,
      ceilings: hs.ceilingsVisible, ratio: r.getPixelRatio()
    };

    if (hs.quality !== 'high') hs.setQuality('high');
    hs.setElevation(1);
    hs.night = hs.nightTarget = shot.night ? 1 : 0;
    cam.position.fromArray(shot.pos);
    cam.lookAt(new THREE.Vector3().fromArray(shot.look));
    cam.fov = shot.fov;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    hs.setCeilingsVisible(cam.position.y < 2.7);
    hs.applyAtmosphere();
    // Ciel en dégradé (zénith → horizon) pour un rendu photographique
    const savedBg = hs.scene.background;
    hs.scene.background = this.skyTexture(!!shot.night);
    // Rendu photo : pas de traits d'encre « maquette »
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
    // Vignettage photographique discret
    const v = g.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, height * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, shot.night ? 'rgba(0,0,0,0.35)' : 'rgba(30,20,10,0.18)');
    g.fillStyle = v;
    g.fillRect(0, 0, width, height);

    // Restauration de l'état interactif
    hs.scene.background = savedBg;
    r.setPixelRatio(saved.ratio);
    hs.night = saved.night;
    hs.nightTarget = saved.nightTarget;
    cam.position.copy(saved.pos);
    cam.quaternion.copy(saved.quat);
    cam.fov = saved.fov;
    hs.setElevation(saved.elev);
    hs.setCeilingsVisible(saved.ceilings);
    if (saved.quality !== 'high') hs.setQuality(saved.quality);
    hs.onResize();
    hs._atmoDirty = true;

    return out.toDataURL('image/jpeg', 0.92);
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
        onItem && onItem(item);
        this.save('plan-2d-presentation.png', url);
      }
      for (const shot of this.shots) {
        await frame();
        const url = this.capture(shot);
        const item = { id: shot.id, label: shot.label, url, ext: 'jpg', shot };
        this.results.push(item);
        onItem && onItem(item);
        this.save(shot.id + '.jpg', url);
      }
      return this.results;
    })();
    this.generating.finally(() => { this.generating = null; });
    return this.generating;
  }
}

window.RenderStudio = RenderStudio;
