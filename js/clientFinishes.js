/** Bibliothèque de finitions générées localement, sans téléchargement de textures. */
class ClientFinishes {
  constructor(hs) {
    this.hs = hs;
    this.library = new Map();
    this.floors = hs.finishFloorMeshes.filter(mesh => mesh.userData.room.habitable);
    this.facade = hs.facadeMaterial;
    this.floorDefaults = this.floors.map(mesh => this.snapshot(mesh.material));
    this.facadeDefault = this.snapshot(this.facade);
  }

  snapshot(material) {
    const { map, normalMap, roughnessMap, roughness, metalness } = material;
    return { map, normalMap, roughnessMap, roughness, metalness };
  }

  getPreset(id) {
    if (this.library.has(id)) return this.library.get(id);
    // Une tuile en mètres ; les cartes couleur, normale et rugosité partagent les UV.
    const settings = {
      oak: [1.6, 0.55, [201, 166, 119]], tile: [1.2, 0.38, [64, 67, 71]],
      concrete: [2, 0.70, [165, 160, 153]], plaster: [1, 0.93, [239, 237, 230]],
      timber: [1.4, 0.76, [144, 105, 74]], stone: [1.8, 0.88, [159, 152, 139]]
    };
    const [meters, roughness, rgb] = settings[id];
    const size = 256;
    const canvas = this.hs.makeCanvas(size), ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const noise = (x, y) => {
      const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return value - Math.floor(value) - 0.5;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let shift = noise(x, y) * 11;
      const u = x / size, v = y / size;
      if (id === 'oak' || id === 'timber') {
        const horizontal = id === 'oak', a = horizontal ? u : v, b = horizontal ? v : u;
        const rows = b * (horizontal ? 8 : 10), row = Math.floor(rows);
        const along = (a + (row % 3) / 3) % 1;
        shift += 32 * noise(row, 2) + 7 * Math.sin(b * 360 + 1.4 * Math.sin(a * Math.PI * 4));
        if (rows % 1 < 0.045 || (horizontal && along < 0.009)) shift -= 43;
      } else if (id === 'tile') {
        shift += noise(x >> 7, y >> 7) * 17;
        if (x % 128 < 2 || y % 128 < 2) shift += 44;
      } else if (id === 'stone') {
        const band = v * 7, block = (u * 3 + Math.floor(band) * 0.5) % 3;
        shift += noise(Math.floor(block), Math.floor(band)) * 72 + 9 * Math.sin((x + y * 0.8) * 0.26);
        if (band % 1 < 0.075 || block % 1 < 0.025) shift -= 45;
      } else if (id === 'concrete') {
        shift += 8 * Math.sin(u * Math.PI * 4) * Math.cos(v * Math.PI * 6) + 4 * Math.sin((u + v) * Math.PI * 12);
      }
      const i = (y * size + x) * 4;
      rgb.forEach((value, channel) => { image.data[i + channel] = value + shift; });
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.encoding = THREE.sRGBEncoding;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(4, this.hs.maxAnisotropy);
    const pbr = this.hs.getPbrMaps(map, `client-${id}`);
    const preset = { map, ...pbr, roughness, metalness: id === 'tile' ? 0.025 : 0 };
    [map, pbr.normalMap, pbr.roughnessMap].forEach(tex => tex.repeat.setScalar(1 / meters));
    this.library.set(id, preset);
    return preset;
  }

  apply(material, maps) {
    if (material.map.encoding !== maps.map.encoding) material.needsUpdate = true;
    Object.assign(material, maps);
  }

  setFloor(id) {
    const preset = id && this.getPreset(id);
    this.floors.forEach((mesh, index) => this.apply(mesh.material, preset || this.floorDefaults[index]));
  }

  setFacade(id) {
    this.apply(this.facade, id ? this.getPreset(id) : this.facadeDefault);
  }
}
