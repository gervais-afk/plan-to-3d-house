/**
 * ASSET LIBRARY — remplace les volumes de repli par des modèles glTF CC0 (HOUSE_DATA.assets.models)
 * Chaque objet portant `userData.item.model` est remplacé si un modèle correspondant se charge ;
 * en cas d'échec, le volume de repli reste en place (l'application fonctionne toujours).
 */
class AssetLibrary {
  constructor(houseScene, onProgress) {
    this.houseScene = houseScene;
    this.onProgress = onProgress;
    this.cache = {};
  }

  load() {
    const manifest = (HOUSE_DATA.assets && HOUSE_DATA.assets.models) || {};
    const targets = this.houseScene.furnitureMeshes.filter(o => o.userData.item && manifest[o.userData.item.model]);
    if (!targets.length || !THREE.GLTFLoader) {
      if (this.onProgress) this.onProgress(1, 0);
      return Promise.resolve(0);
    }

    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => this.onProgress && this.onProgress(loaded / total, total);
    const loader = new THREE.GLTFLoader(manager);
    const keys = [...new Set(targets.map(o => o.userData.item.model))];

    const loads = keys.map(key => new Promise(resolve => {
      loader.load(manifest[key].url, gltf => { this.cache[key] = gltf.scene; resolve(); },
        undefined, () => { console.info('Modèle indisponible, repli conservé :', key); resolve(); });
    }));

    return Promise.all(loads).then(() => {
      let replaced = 0;
      targets.forEach(obj => {
        const src = this.cache[obj.userData.item.model];
        if (src && this.replace(obj, src, manifest[obj.userData.item.model])) replaced++;
      });
      this.houseScene.collectMaterials();
      this.houseScene._atmoDirty = true;
      this.houseScene.setElevation(this.houseScene.elevationProgress);
      return replaced;
    });
  }

  replace(obj, src, def) {
    const item = obj.userData.item;
    const model = src.clone(true);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Pipeline linéaire du projet : textures lues telles quelles
      ['map', 'emissiveMap'].forEach(k => { if (o.material[k]) o.material[k].encoding = THREE.LinearEncoding; });
      o.material = o.material.clone();
      o.material.aoMap = null; // pas d'uv2 après fusion
      // Vitres de cadre déclarées opaques dans certains fichiers : on les rend translucides
      if (/glass/i.test(o.material.name)) {
        o.material.transparent = true;
        o.material.opacity = 0.12;
        o.material.depthWrite = false;
        o.castShadow = false;
      }
    });
    if (def.rotY) model.rotation.y = def.rotY; // correction d'orientation propre au fichier

    // Mise à l'échelle uniforme (repère local de l'objet) : emprise, largeur ou hauteur
    const swap = item.dims !== 'local' && Math.abs(Math.sin(item.rotY || 0)) > 0.5;
    const W = swap ? item.d : item.w, D = swap ? item.w : item.d;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 1e-4 || size.y < 1e-4) return false;
    let s = def.scale;
    if (!s && def.fit === 'w') s = W / size.x;
    if (!s && def.fit === 'h') s = item.h / size.y;
    if (!s) s = Math.min(W / size.x, D / Math.max(size.z, 1e-4), (item.h * 1.25) / size.y);
    model.scale.multiplyScalar(s);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;

    const holder = new THREE.Group();
    holder.add(model);
    // Pose : au sol, ou à la hauteur du bas de l'objet (tableau au mur, vase sur buffet)
    const baseY = item.y !== undefined && item.h !== undefined ? Math.max(0, item.y - item.h / 2) : 0;
    holder.position.set(item.x, baseY, item.z);
    holder.rotation.y = item.rotY || 0;
    holder.userData = { nominalY: baseY, item, gltf: true };

    const hs = this.houseScene;
    hs.scene.remove(obj);
    hs.scene.add(holder);
    hs.furnitureMeshes[hs.furnitureMeshes.indexOf(obj)] = holder;
    return true;
  }
}

window.AssetLibrary = AssetLibrary;
