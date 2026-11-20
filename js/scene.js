/**
 * THREE.JS SCENE BUILDER & PROCEDURAL GENERATOR
 * Univers 3D, lumières, élévation des murs, passage Encre 2D -> Rendu 3D
 */

class HouseScene {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.wallMeshes = [];      // murs, vitrages, menuiseries, colonnes (s'élèvent ; collision si userData.collide)
    this.wallEdges = [];
    this.furnitureMeshes = [];
    this.dimensionLines = [];
    this.labelMaterials = [];
    this.ceilings = [];
    this.canopyMaterials = [];
    this.slabMeshes = [];
    this.foundationMeshes = [];
    this.finishFloorMeshes = [];

    this.elevationProgress = 0.0;
    this.ceilingsVisible = false;

    this.initThree();
    this.setupLighting();
    this.createFloors();
    this.createWalls();
    this.createColumns();
    this.createCanopies();
    this.createFurniture();
    this.createDoors();
    this.createBlueprintAnnotations();
    this.createLabels();
    this.createCeilings();
    this.ensurePlanOverlay();

    window.addEventListener('resize', () => this.onResize());
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xF5F2EB);
    this.scene.fog = new THREE.FogExp2(0xF5F2EB, 0.012);

    this.camera = new THREE.PerspectiveCamera(26, this.width / this.height, 0.05, 150);
    this.camera.position.set(0, 30, 0.01);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.container.appendChild(this.renderer.domElement);
  }

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xfff8ed, 0.6);
    this.scene.add(this.ambientLight);

    // Soleil rasant Sud-Ouest : dessine les colonnes du porche et la façade d'entrée
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.05);
    this.sunLight.position.set(-10, 18, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 60;
    const d = window.HouseAuto ? Math.max(10, HouseAuto.bbox(HOUSE_DATA).max * 0.85 + 1) : 10; // emprise du projet
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 0.45);
    this.scene.add(this.fillLight);
  }

  // ---------------------------------------------------------------------------
  // TEXTURES PROCÉDURALES (CanvasTexture : coût quasi nul)
  // ---------------------------------------------------------------------------
  makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  getFloorTextureBase(type) {
    this._texCache = this._texCache || {};
    if (this._texCache[type]) return this._texCache[type];

    const S = 512;
    const c = this.makeCanvas(S);
    const g = c.getContext('2d');
    let meters = 2;
    const rnd = (a, b) => a + Math.random() * (b - a);

    if (type === 'parquet') {
      meters = 2.0; // 512 px = 2 m, lames de 0,20 m
      const plankW = S / 10;
      for (let row = 0; row < 10; row++) {
        let x = -rnd(0, S * 0.4);
        while (x < S) {
          const len = rnd(0.35, 0.75) * S;
          const l = rnd(-10, 10);
          g.fillStyle = `hsl(${rnd(30, 36)}, ${rnd(38, 48)}%, ${62 + l}%)`;
          g.fillRect(x, row * plankW, len, plankW);
          // veinage
          g.strokeStyle = 'rgba(90,60,30,0.10)';
          g.lineWidth = 1;
          for (let k = 0; k < 5; k++) {
            const yy = row * plankW + rnd(3, plankW - 3);
            g.beginPath();
            g.moveTo(x, yy);
            g.bezierCurveTo(x + len * 0.3, yy + rnd(-3, 3), x + len * 0.6, yy + rnd(-3, 3), x + len, yy + rnd(-2, 2));
            g.stroke();
          }
          g.fillStyle = 'rgba(60,40,20,0.35)';
          g.fillRect(x + len - 1, row * plankW, 1.5, plankW);
          x += len;
        }
        g.fillStyle = 'rgba(60,40,20,0.35)';
        g.fillRect(0, row * plankW, S, 1.5);
      }
    } else if (type === 'tiles') {
      meters = 1.2; // carreaux 60x60
      const n = 2, t = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const l = rnd(-2, 2);
        g.fillStyle = `hsl(40, 6%, ${86 + l}%)`;
        g.fillRect(i * t, j * t, t, t);
        for (let k = 0; k < 400; k++) {
          g.fillStyle = `rgba(120,115,105,${rnd(0.02, 0.06)})`;
          g.fillRect(i * t + rnd(0, t), j * t + rnd(0, t), rnd(1, 3), rnd(1, 3));
        }
      }
      g.fillStyle = '#b5b1a8';
      for (let i = 0; i <= n; i++) {
        g.fillRect(i * t - 2, 0, 4, S);
        g.fillRect(0, i * t - 2, S, 4);
      }
    } else if (type === 'stone') {
      meters = 1.6; // dalles 40x40
      const n = 4, t = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = `hsl(${rnd(32, 40)}, ${rnd(10, 18)}%, ${rnd(76, 84)}%)`;
        g.fillRect(i * t, j * t, t, t);
        for (let k = 0; k < 250; k++) {
          g.fillStyle = `rgba(90,80,60,${rnd(0.03, 0.08)})`;
          g.fillRect(i * t + rnd(0, t), j * t + rnd(0, t), rnd(1, 4), rnd(1, 4));
        }
      }
      g.fillStyle = '#a8a091';
      for (let i = 0; i <= n; i++) {
        g.fillRect(i * t - 2, 0, 4, S);
        g.fillRect(0, i * t - 2, S, 4);
      }
    } else {
      meters = 2.0; // béton lissé
      g.fillStyle = '#d9d6cf';
      g.fillRect(0, 0, S, S);
      for (let k = 0; k < 3000; k++) {
        g.fillStyle = `rgba(100,95,85,${rnd(0.02, 0.07)})`;
        g.fillRect(rnd(0, S), rnd(0, S), rnd(1, 3), rnd(1, 3));
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.maxAnisotropy;
    this._texCache[type] = { tex, meters };
    return this._texCache[type];
  }

  levelOffset(level = 0) {
    return Math.max(0, Number(level) || 0) * (Number(HOUSE_DATA.config.floorHeight) || 3);
  }

  getPbrMaps(texture, cacheKey) {
    this._pbrMapCache = this._pbrMapCache || {};
    if (this._pbrMapCache[cacheKey]) return this._pbrMapCache[cacheKey];
    const source = texture.image;
    const size = 128;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const cg = canvas.getContext('2d', { willReadFrequently: true });
    cg.drawImage(source, 0, 0, size, size);
    const pixels = cg.getImageData(0, 0, size, size), normal = cg.createImageData(size, size), rough = cg.createImageData(size, size);
    const lum = (x, y) => {
      const i = ((y + size) % size * size + (x + size) % size) * 4;
      return (pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114) / 255;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, dx = (lum(x + 1, y) - lum(x - 1, y)) * 1.8, dy = (lum(x, y + 1) - lum(x, y - 1)) * 1.8;
      const nx = -dx, ny = -dy, nz = 1, n = Math.hypot(nx, ny, nz);
      normal.data[i] = (nx / n * 0.5 + 0.5) * 255; normal.data[i + 1] = (ny / n * 0.5 + 0.5) * 255; normal.data[i + 2] = (nz / n * 0.5 + 0.5) * 255; normal.data[i + 3] = 255;
      const value = Math.max(135, Math.min(235, 215 - Math.abs(lum(x, y) - 0.5) * 40));
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = value; rough.data[i + 3] = 255;
    }
    const nc = document.createElement('canvas'); nc.width = nc.height = size; nc.getContext('2d').putImageData(normal, 0, 0);
    const rc = document.createElement('canvas'); rc.width = rc.height = size; rc.getContext('2d').putImageData(rough, 0, 0);
    const normalMap = new THREE.CanvasTexture(nc), roughnessMap = new THREE.CanvasTexture(rc);
    [normalMap, roughnessMap].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(4, this.maxAnisotropy); });
    this._pbrMapCache[cacheKey] = { normalMap, roughnessMap };
    return this._pbrMapCache[cacheKey];
  }

  getWallTexture() {
    if (this._wallTexture) return this._wallTexture;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = '#f7f5f1'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) { const v = Math.random() > .5 ? 255 : 90; g.fillStyle = `rgba(${v},${v - (v === 255 ? 0 : 4)},${v - (v === 255 ? 0 : 8)},${Math.random() * .045})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2); tex.anisotropy = Math.min(4, this.maxAnisotropy);
    this._wallTexture = tex;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // SOLS
  // ---------------------------------------------------------------------------
  createFloors() {
    const baseGeo = new THREE.PlaneGeometry(40, 40);
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0xF5F2EB, roughness: 0.95, metalness: 0.0 });
    const baseMesh = new THREE.Mesh(baseGeo, this.groundMaterial);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = -0.01;
    baseMesh.receiveShadow = true;
    this.groundMesh = baseMesh;
    this.scene.add(baseMesh);

    const grid = new THREE.GridHelper(30, 30, 0xbfb6a4, 0xded8cc);
    grid.position.y = 0.001;
    this.blueprintGrid = grid;
    this.scene.add(grid);

    const roughness = { parquet: 0.5, tiles: 0.22, stone: 0.8, concrete: 0.7 };

    HOUSE_DATA.rooms.forEach(room => {
      const levelY = this.levelOffset(room.level);
      const b = room.bounds;
      const w = b.xMax - b.xMin;
      const d = b.zMax - b.zMin;
      const cx = (b.xMin + b.xMax) / 2;
      const cz = (b.zMin + b.zMax) / 2;

      const base = this.getFloorTextureBase(room.floorType);
      const map = base.tex.clone();
      map.needsUpdate = true;
      map.repeat.setScalar(1 / base.meters);

      const pbr = this.getPbrMaps(base.tex, `floor-${room.floorType}`);
      const normalMap = pbr.normalMap.clone(), roughnessMap = pbr.roughnessMap.clone();
      normalMap.repeat.copy(map.repeat); roughnessMap.repeat.copy(map.repeat);
      const floorMat = new THREE.MeshStandardMaterial({
        map, normalMap, roughnessMap,
        normalScale: new THREE.Vector2(0.16, 0.16),
        roughness: roughness[room.floorType] || 0.6,
        metalness: room.floorType === 'tiles' ? 0.035 : 0.0,
        transparent: true, opacity: 0
      });

      let floorMesh, line;
      if (room.poly) {
        // Pièce polygonale : forme exacte (UV en mètres → répétition 1/m)
        const shape = new THREE.Shape(room.poly.map(p => new THREE.Vector2(p[0], -p[1])));
        floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = levelY + 0.005;
        const pts = room.poly.concat([room.poly[0]]).map(p => new THREE.Vector3(p[0], levelY + 0.01, p[1]));
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a2128 }));
      } else {
        const geometry = new THREE.PlaneGeometry(w, d);
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
        floorMesh = new THREE.Mesh(geometry, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(cx, levelY + 0.005, cz);
        // Liseré d'encre autour de chaque pièce (plan 2D)
        line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)), new THREE.LineBasicMaterial({ color: 0x1a2128 }));
        line.position.set(cx, levelY + 0.01, cz);
      }
      floorMesh.receiveShadow = true;
      floorMesh.userData = { room };
      this.scene.add(floorMesh);
      this.finishFloorMeshes.push(floorMesh);
      this.scene.add(line);
      this.dimensionLines.push(line);
    });

    // Dalle intermédiaire sous les pièces d'étage, évidée par les trémies déclarées.
    const slabThickness = 0.18;
    const concrete = this.getFloorTextureBase('concrete');
    const concretePbr = this.getPbrMaps(concrete.tex, 'floor-concrete');
    const slabMat = new THREE.MeshStandardMaterial({ map: concrete.tex, normalMap: concretePbr.normalMap, roughnessMap: concretePbr.roughnessMap, roughness: 0.82, metalness: 0.01, normalScale: new THREE.Vector2(0.12, 0.12) });
    const foundationMat = slabMat.clone(); foundationMat.transparent = true; foundationMat.opacity = 0;
    (HOUSE_DATA.rooms || []).filter(room => !(Number(room.level) > 0)).forEach(room => {
      const b = room.bounds, corners = room.poly || [[b.xMin,b.zMin],[b.xMax,b.zMin],[b.xMax,b.zMax],[b.xMin,b.zMax]];
      const shape = new THREE.Shape(); corners.forEach((p, i) => i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1])); shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 1 }), foundationMat);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, -0.2, 0); mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
      this.scene.add(mesh); this.foundationMeshes.push(mesh);
    });
    (HOUSE_DATA.rooms || []).filter(room => Number(room.level) > 0).forEach(room => {
      const b = room.bounds, corners = room.poly || [[b.xMin,b.zMin],[b.xMax,b.zMin],[b.xMax,b.zMax],[b.xMin,b.zMax]];
      const shape = new THREE.Shape();
      corners.forEach((p, i) => i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1]));
      shape.closePath();
      (HOUSE_DATA.stairwells || []).filter(s => (Number(s.level) || 1) === Number(room.level) && s.xMax > b.xMin && s.xMin < b.xMax && s.zMax > b.zMin && s.zMin < b.zMax).forEach(s => {
        const hole = new THREE.Path();
        hole.moveTo(s.xMin, -s.zMin); hole.lineTo(s.xMin, -s.zMax); hole.lineTo(s.xMax, -s.zMax); hole.lineTo(s.xMax, -s.zMin); hole.closePath();
        shape.holes.push(hole);
      });
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: slabThickness, bevelEnabled: false, curveSegments: 1 });
      const mesh = new THREE.Mesh(geometry, slabMat);
      const levelY = this.levelOffset(room.level);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, levelY - slabThickness, 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { baseY: levelY - slabThickness, nominalHeight: slabThickness, room };
      this.scene.add(mesh); this.slabMeshes.push(mesh);
    });
  }

  // ---------------------------------------------------------------------------
  // MURS PROCÉDURAUX AVEC OUVERTURES MULTIPLES
  // ---------------------------------------------------------------------------
  createWalls() {
    const H = HOUSE_DATA.config.wallHeight;

    const wallTexture = this.getWallTexture();
    const wallPbr = this.getPbrMaps(wallTexture, 'plaster');
    this.wallPBRMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTexture, normalMap: wallPbr.normalMap, roughnessMap: wallPbr.roughnessMap, normalScale: new THREE.Vector2(0.08, 0.08), roughness: 0.82, metalness: 0.0 });
    this.facadeMaterial = this.wallPBRMaterial.clone();
    this.facadeMaterial.userData.keepBatch = true;
    this.inkEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x11161d });
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd6e8f0, transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0.0,
      reflectivity: 0.6, depthWrite: false
    });
    this.frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.4 });

    const bb = HouseAuto.bbox(HOUSE_DATA);
    HOUSE_DATA.walls.forEach(w => {
      if (!w.length) return;
      const side = w.type === 'ext' ? HouseAuto.exteriorSide(HOUSE_DATA, w, bb) : 0;
      const levelY = this.levelOffset(w.level);
      const p1 = new THREE.Vector2(w.from[0], w.from[1]);
      const dir = new THREE.Vector2(w.to[0] - w.from[0], w.to[1] - w.from[1]).normalize();
      const angle = Math.atan2(dir.y, dir.x);
      const t = w.thick;
      const L = w.length;

      // Angles propres : prolongement de t/2 à chaque extrémité
      let cursor = -t / 2;
      w.openings.forEach(op => {
        const s = op.at - op.w / 2;
        const e = op.at + op.w / 2;
        const top = op.sill + op.h;
        if (s - cursor > 0.02) this.buildWallSection(p1, dir, cursor, s - cursor, angle, t, H, levelY, side);
        if (H - top > 0.02) this.buildWallSection(p1, dir, s, op.w, angle, t, H - top, levelY + top, side);
        if (op.sill > 0.02) this.buildWallSection(p1, dir, s, op.w, angle, t, op.sill, levelY, side);
        if (op.type === 'window' || op.type === 'bay') {
          this.buildGlassSection(p1, dir, s, op.w, angle, op.h, levelY + op.sill);
          this.buildWindowFrame(p1, dir, s, op.w, angle, op.h, op.sill, t, levelY);
        }
        cursor = Math.max(cursor, e);
      });
      const end = L + t / 2;
      if (end - cursor > 0.02) this.buildWallSection(p1, dir, cursor, end - cursor, angle, t, H, levelY, side);
    });
  }

  // Ajoute une boîte qui s'élève avec setElevation (et collision optionnelle)
  addElevated(geo, material, x, z, baseY, height, rotY = 0, opts = {}) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    mesh.position.set(x, baseY + height / 2, z);
    mesh.rotation.y = rotY;
    mesh.userData = { baseY, nominalHeight: height, collide: opts.collide !== false };
    this.scene.add(mesh);
    this.wallMeshes.push(mesh);
    if (opts.edges !== false) {
      const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.inkEdgeMaterial);
      mesh.add(edgeLine);
      this.wallEdges.push(edgeLine);
    }
    return mesh;
  }

  alongWall(startP2, dirNorm, dist) {
    return { x: startP2.x + dirNorm.x * dist, z: startP2.y + dirNorm.y * dist };
  }

  buildWallSection(startP2, dirNorm, offsetAlong, length, angle, thickness, height, yOffset, facadeSide) {
    const p = this.alongWall(startP2, dirNorm, offsetAlong + length / 2);
    const box = new THREE.BoxGeometry(length, height, thickness);
    const wall = this.addElevated(box, this.wallPBRMaterial, p.x, p.z, yOffset, height, -angle);
    if (!facadeSide) return wall;

    // Séparer uniquement la face extérieure sans géométrie superposée ; les deux
    // matériaux restent fusionnables dans des lots statiques distincts.
    const face = box.groups[facadeSide > 0 ? 4 : 5]; // normales locales +Z / -Z
    const indices = Array.from(box.index.array);
    const skin = box.clone();
    skin.setIndex(indices.splice(face.start, face.count));
    box.setIndex(indices);
    box.clearGroups();
    skin.clearGroups();
    const uv = skin.attributes.uv, positions = skin.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, offsetAlong + length / 2 + positions.getX(i), yOffset + height / 2 + positions.getY(i));
    }
    this.addElevated(skin, this.facadeMaterial, p.x, p.z, yOffset, height, -angle, { edges: false, collide: false });
    return wall;
  }

  buildGlassSection(startP2, dirNorm, offsetAlong, length, angle, height, yOffset) {
    const p = this.alongWall(startP2, dirNorm, offsetAlong + length / 2);
    return this.addElevated(new THREE.BoxGeometry(length, height, 0.02), this.glassMaterial, p.x, p.z, yOffset, height, -angle,
      { edges: false, castShadow: false });
  }

  buildWindowFrame(startP2, dirNorm, s, w, angle, h, sill, thick, levelY = 0) {
    const f = 0.05, depth = Math.min(0.08, thick);
    const mat = this.frameMaterial;
    const opt = { edges: false, collide: false };
    const at = (d) => this.alongWall(startP2, dirNorm, d);
    // montants gauche / droit
    let p = at(s + f / 2);
    this.addElevated(new THREE.BoxGeometry(f, h, depth), mat, p.x, p.z, levelY + sill, h, -angle, opt);
    p = at(s + w - f / 2);
    this.addElevated(new THREE.BoxGeometry(f, h, depth), mat, p.x, p.z, levelY + sill, h, -angle, opt);
    // traverses haute / basse
    p = at(s + w / 2);
    this.addElevated(new THREE.BoxGeometry(w, f, depth), mat, p.x, p.z, levelY + sill + h - f, f, -angle, opt);
    this.addElevated(new THREE.BoxGeometry(w, f, depth), mat, p.x, p.z, levelY + sill, f, -angle, opt);
    // meneau central pour les fenêtres à deux vantaux
    if (w >= 0.9) this.addElevated(new THREE.BoxGeometry(0.04, h, depth * 0.8), mat, p.x, p.z, levelY + sill, h, -angle, opt);
  }

  // ---------------------------------------------------------------------------
  // COLONNES DU PORCHE & POTEAU DE TERRASSE
  // ---------------------------------------------------------------------------
  createColumns() {
    const H = HOUSE_DATA.config.wallHeight;
    this.columnMaterial = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.7 });
    (HOUSE_DATA.columns || []).forEach(c => {
      const baseH = 0.15, capH = 0.15, levelY = this.levelOffset(c.level);
      this.addElevated(new THREE.BoxGeometry(c.base, baseH, c.base), this.columnMaterial, c.x, c.z, levelY, baseH);
      this.addElevated(new THREE.BoxGeometry(c.size, H - baseH - capH, c.size), this.columnMaterial, c.x, c.z, levelY + baseH, H - baseH - capH);
      this.addElevated(new THREE.BoxGeometry(c.capital, capH, c.capital), this.columnMaterial, c.x, c.z, levelY + H - capH, capH);
    });
  }

  // ---------------------------------------------------------------------------
  // AUVENT DU PORCHE & PERGOLA DE TERRASSE (fondu en fin d'élévation)
  // ---------------------------------------------------------------------------
  createCanopies() {
    this.canopyGroup = new THREE.Group();
    (HOUSE_DATA.canopies || []).forEach(cn => {
      const mat = new THREE.MeshStandardMaterial({ color: cn.color, roughness: 0.7, transparent: true, opacity: 0 });
      this.canopyMaterials.push(mat);
      const w = cn.xMax - cn.xMin, d = cn.zMax - cn.zMin;
      const cx = (cn.xMin + cn.xMax) / 2, cz = (cn.zMin + cn.zMax) / 2, levelY = this.levelOffset(cn.level), canopyY = (cn.y || 0) + levelY;
      const add = (geo, x, y, z, rotationX = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rotationX;
        m.userData.explodeBaseY = y;
        m.userData.explodable = cn.type === 'slab';
        m.castShadow = true;
        m.receiveShadow = true;
        this.canopyGroup.add(m);
      };
      if (cn.type === 'slab' && Array.isArray(cn.poly) && cn.poly.length >= 3) {
        const shape = new THREE.Shape();
        cn.poly.forEach((p, i) => i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1]));
        shape.closePath();
        add(new THREE.ExtrudeGeometry(shape, { depth: cn.thick, bevelEnabled: false, curveSegments: 1 }), 0, canopyY, 0, -Math.PI / 2);
      } else if (cn.type === 'slab') {
        add(new THREE.BoxGeometry(w, cn.thick, d), cx, canopyY + cn.thick / 2, cz);
      } else {
        // poutres de rive + lames
        add(new THREE.BoxGeometry(w, 0.12, 0.1), cx, canopyY, cn.zMin + 0.05);
        add(new THREE.BoxGeometry(w, 0.12, 0.1), cx, canopyY, cn.zMax - 0.05);
        add(new THREE.BoxGeometry(0.1, 0.12, d), cn.xMin + 0.05, canopyY, cz);
        for (let x = cn.xMin + 0.15; x < cn.xMax - 0.1; x += cn.gap) {
          add(new THREE.BoxGeometry(cn.slat, 0.14, d), x, canopyY + 0.13, cz);
        }
      }
    });
    this.canopyGroup.visible = false;
    this.scene.add(this.canopyGroup);
  }

  // ---------------------------------------------------------------------------
  // MOBILIER
  // ---------------------------------------------------------------------------
  createFurniture() {
    HOUSE_DATA.furniture.forEach(item => {
      const levelY = this.levelOffset(item.level);
      // Mobilier composé (realism.js) si disponible pour ce type
      const comp = this.buildComposite ? this.buildComposite(item) : null;
      if (comp) {
        comp.position.y += levelY;
        comp.userData.nominalY = (comp.userData.nominalY || 0) + levelY;
        this.scene.add(comp);
        this.furnitureMeshes.push(comp);
        return;
      }
      const geo = new THREE.BoxGeometry(item.w, item.h, item.d);
      const mat = new THREE.MeshStandardMaterial({
        color: item.color,
        roughness: 0.6,
        metalness: 0.05,
        transparent: !!item.transparent,
        opacity: item.opacity || 1.0,
        wireframe: !!item.wireframe
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(item.x, item.y + levelY, item.z);
      if (item.dims === 'local') mesh.rotation.y = item.rotY || 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      this.furnEdgeMaterial = this.furnEdgeMaterial || new THREE.LineBasicMaterial({ color: 0x222a33, opacity: 0.5, transparent: true });
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.furnEdgeMaterial);
      mesh.add(line);

      mesh.userData = { nominalY: item.y + levelY, item };
      this.scene.add(mesh);
      this.furnitureMeshes.push(mesh);
    });
  }

  // ---------------------------------------------------------------------------
  // PORTES : arcs de débattement (plan 2D) + vantaux entrouverts (3D)
  // ---------------------------------------------------------------------------
  createDoors() {
    this.annotationGroup = this.annotationGroup || new THREE.Group();
    const arcMat = new THREE.LineBasicMaterial({ color: 0x2b3440 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xa88560, roughness: 0.55 });
    const entryMat = new THREE.MeshStandardMaterial({ color: 0x5b3e28, roughness: 0.45 });

    HOUSE_DATA.walls.forEach(w => {
      const levelY = this.levelOffset(w.level);
      const p1 = new THREE.Vector2(w.from[0], w.from[1]);
      const dir = new THREE.Vector2(w.to[0] - w.from[0], w.to[1] - w.from[1]).normalize();
      const n = new THREE.Vector2(-dir.y, dir.x);

      w.openings.filter(op => op.type === 'door').forEach(op => {
        const hingeEnd = op.hinge === 'end';
        const sgn = hingeEnd ? -1 : 1;
        const side = op.side || 1;
        const hx = hingeEnd ? op.at + op.w / 2 : op.at - op.w / 2;
        const H2 = new THREE.Vector2(p1.x + dir.x * hx, p1.y + dir.y * hx);
        const leafW = op.w - 0.04;

        // Arc 2D (quart de cercle) + vantail à 90°
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const th = (i / 24) * Math.PI / 2;
          const vx = dir.x * sgn * Math.cos(th) + n.x * side * Math.sin(th);
          const vz = dir.y * sgn * Math.cos(th) + n.y * side * Math.sin(th);
          pts.push(new THREE.Vector3(H2.x + vx * op.w, levelY + 0.03, H2.y + vz * op.w));
        }
        pts.push(new THREE.Vector3(H2.x, levelY + 0.03, H2.y));
        this.annotationGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat));

        // Vantail 3D entrouvert (porte d'entrée ouverte à 90° pour dégager le passage)
        const isEntry = w.type === 'ext' && op.w >= 1.0;
        const openAngle = (isEntry ? 92 : 70) * Math.PI / 180;
        const ldx = dir.x * sgn * Math.cos(openAngle) + n.x * side * Math.sin(openAngle);
        const ldz = dir.y * sgn * Math.cos(openAngle) + n.y * side * Math.sin(openAngle);
        const hLeaf = op.h - 0.02;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, hLeaf, 0.04), isEntry ? entryMat : leafMat);
        leaf.position.set(H2.x + ldx * leafW / 2, levelY + hLeaf / 2, H2.y + ldz * leafW / 2);
        leaf.rotation.y = -Math.atan2(ldz, ldx);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        leaf.userData = { nominalY: levelY + hLeaf / 2, item: { level: w.level } };
        this.scene.add(leaf);
        this.furnitureMeshes.push(leaf);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // COTES & TEXTES DU PLAN 2D
  // ---------------------------------------------------------------------------
  makeTextPlane(lines, heightM, opts = {}) {
    const fontPx = 64;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const fonts = lines.map((l, i) => `${i === 0 ? (opts.weight || 700) : 500} ${i === 0 ? fontPx : fontPx * 0.62}px Inter, Arial, sans-serif`);
    let maxW = 0;
    lines.forEach((l, i) => { g.font = fonts[i]; maxW = Math.max(maxW, g.measureText(l).width); });
    const lineH = [fontPx * 1.15, fontPx * 0.8];
    const totalH = lines.reduce((s, l, i) => s + lineH[Math.min(i, 1)], 0);
    c.width = Math.ceil(maxW + 24);
    c.height = Math.ceil(totalH + 16);
    let y = 8;
    lines.forEach((l, i) => {
      g.font = fonts[i];
      g.fillStyle = i === 0 ? (opts.color || '#1a2128') : (opts.subColor || '#5b6470');
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(l, c.width / 2, y);
      y += lineH[Math.min(i, 1)];
    });
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = this.maxAnisotropy;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this.labelMaterials.push(mat);
    const hM = heightM * (totalH / lineH[0]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(hM * c.width / c.height, hM), mat);
    mesh.renderOrder = 2;
    return mesh;
  }

  createBlueprintAnnotations() {
    this.annotationGroup = this.annotationGroup || new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4a5568 });

    HOUSE_DATA.dimensions.forEach(dim => {
      const p1 = new THREE.Vector3(dim.from[0], 0.04, dim.from[2]);
      const p2 = new THREE.Vector3(dim.to[0], 0.04, dim.to[2]);
      this.annotationGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), lineMat));
      [p1, p2].forEach(p => {
        this.annotationGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p.x - 0.15, 0.04, p.z + 0.15), new THREE.Vector3(p.x + 0.15, 0.04, p.z - 0.15)
        ]), lineMat));
      });

      if (dim.text) {
        const vertical = Math.abs(p2.z - p1.z) > Math.abs(p2.x - p1.x);
        const label = this.makeTextPlane([dim.text], 0.26, { weight: 600, color: '#4a5568' });
        label.position.set((p1.x + p2.x) / 2, 0.045, (p1.z + p2.z) / 2);
        label.rotation.set(-Math.PI / 2, 0, vertical ? Math.PI / 2 : 0);
        if (vertical) label.position.x += (p1.x > 0 ? 0.22 : -0.22);
        else label.position.z += (p1.z > 0 ? 0.2 : -0.2);
        this.annotationGroup.add(label);
      }
    });

    this.scene.add(this.annotationGroup);
  }

  createLabels() {
    HOUSE_DATA.rooms.forEach(r => {
      const b = r.bounds;
      const w = b.xMax - b.xMin;
      const h = Math.min(0.36, (w * 0.85) / (r.name.length * 0.62));
      const label = this.makeTextPlane([r.name, r.surface], h);
      label.rotation.x = -Math.PI / 2;
      label.position.set(r.center.x, this.levelOffset(r.level) + 0.035, r.center.z);
      this.annotationGroup.add(label);
    });
  }

  // ---------------------------------------------------------------------------
  // PLAFONDS (visibles seulement à hauteur d'homme : intérieur réaliste)
  // ---------------------------------------------------------------------------
  createCeilings() {
    const H = HOUSE_DATA.config.wallHeight;
    const mat = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.95 });
    HOUSE_DATA.rooms.filter(r => r.habitable).forEach(r => {
      const levelY = this.levelOffset(r.level), ceilingY = levelY + H;
      const b = r.bounds;
      let m;
      if (r.poly) {
        m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(r.poly.map(p => new THREE.Vector2(p[0], p[1])))), mat);
        m.rotation.x = Math.PI / 2; // (x, z) → face vers le bas
        m.position.set(0, ceilingY, 0);
      } else {
        m = new THREE.Mesh(new THREE.PlaneGeometry(b.xMax - b.xMin, b.zMax - b.zMin), mat);
        m.rotation.x = Math.PI / 2; // face vers le bas
        m.position.set((b.xMin + b.xMax) / 2, ceilingY, (b.zMin + b.zMax) / 2);
      }
      m.castShadow = true;
      m.visible = false;
      this.scene.add(m);
      this.ceilings.push(m);
    });
  }

  setCeilingsVisible(v) {
    if (v === this.ceilingsVisible) return;
    this.ceilingsVisible = v;
    this.ceilings.forEach(m => { m.visible = v; });
    this._atmoDirty = true;
  }

  // ---------------------------------------------------------------------------
  // CALQUE DU PLAN ORIGINAL : fondation visuelle, puis fondu pendant l'élévation
  // ---------------------------------------------------------------------------
  ensurePlanOverlay() {
    const cfg = HOUSE_DATA.config && HOUSE_DATA.config.planImage;
    if (!cfg || !cfg.url) return null;
    if (this.planOverlay) return this.planOverlay;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.planOverlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.planOverlay.rotation.x = -Math.PI / 2;
    this.planOverlay.position.y = 0.075;
    this.planOverlay.renderOrder = 5;
    this.planOverlay.visible = false;
    this.scene.add(this.planOverlay);
    new THREE.TextureLoader().load(encodeURI(cfg.url), tex => {
      const img = tex.image;
      const k = Number(cfg.pxPerMeter);
      if (!img || !img.width || !img.height || !(k > 0)) {
        tex.dispose();
        console.warn('Calque du plan ignoré : dimensions ou échelle invalides.', cfg.url);
        return;
      }
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = Math.min(4, this.maxAnisotropy);
      mat.map = tex;
      mat.needsUpdate = true;
      const origin = Array.isArray(cfg.originPx) && cfg.originPx.length >= 2 && cfg.originPx.every(Number.isFinite)
        ? cfg.originPx : [img.width / 2, img.height / 2];
      this.planOverlay.scale.set(img.width / k, img.height / k, 1);
      this.planOverlay.position.set((img.width / 2 - origin[0]) / k, 0.075, (img.height / 2 - origin[1]) / k);
      this.updatePlanOverlay();
    }, undefined, () => console.warn('Calque du plan introuvable :', cfg.url));
    return this.planOverlay;
  }

  updatePlanOverlay() {
    if (!this.planOverlay) return;
    const e = this.elevationProgress || 0;
    const t = Math.max(0, Math.min(1, (e - 0.04) / 0.24));
    const fade = t * t * (3 - 2 * t);
    const opacity = this.planOverlayManualVisible === undefined
      ? 0.94 * (1 - fade)
      : (this.planOverlayManualVisible ? 0.82 : 0);
    this.planOverlay.material.opacity = opacity;
    this.planOverlay.visible = opacity > 0.01;
  }

  togglePlanOverlay() {
    if (!this.ensurePlanOverlay()) return false;
    this.planOverlayManualVisible = !this.planOverlay.visible;
    this.updatePlanOverlay();
    return this.planOverlay.visible;
  }

  /**
   * Élévation de 0 (plan à plat) à 1 (murs à 2,80 m) — tout monte depuis le sol
   */
  setElevation(progress) {
    this.elevationProgress = Math.max(0, Math.min(1, progress));
    const e = this.elevationProgress;

    const foundationProgress = Math.max(0, Math.min(1, e / 0.12));
    this.foundationMeshes.forEach(mesh => { mesh.visible = foundationProgress > 0.01; mesh.material.opacity = foundationProgress; });
    const wallProgress = Math.max(0, Math.min(1, (e - 0.10) / 0.36));
    this.buildingProgress = wallProgress;
    const s = Math.max(0.015, wallProgress);
    this.wallMeshes.forEach(mesh => {
      const u = mesh.userData;
      mesh.scale.y = s;
      mesh.position.y = (u.baseY + u.nominalHeight / 2) * s;
    });
    const joineryProgress = Math.max(0, Math.min(1, (e - 0.43) / 0.12));
    if (this.glassMaterial) this.glassMaterial.opacity = 0.26 * joineryProgress;
    if (this.frameMaterial) { this.frameMaterial.transparent = true; this.frameMaterial.opacity = joineryProgress; }

    const slabProgress = Math.max(0, Math.min(1, (e - 0.53) / 0.12));
    this.slabMeshes.forEach(mesh => {
      mesh.visible = slabProgress > 0.01;
      mesh.scale.z = Math.max(0.01, slabProgress);
      mesh.position.y = mesh.userData.baseY + (mesh.userData.nominalHeight || 0.18) * (1 - slabProgress);
    });

    const floorProgress = Math.max(0, Math.min(1, (e - 0.66) / 0.12));
    this.finishFloorMeshes.forEach(mesh => { mesh.material.opacity = floorProgress; });
    this.finishFloorMeshes.forEach(mesh => { mesh.visible = floorProgress > 0.01; });
    const furnScale = Math.max(0.01, Math.min(1, (e - 0.78) / 0.16));
    this.furnitureProgress = furnScale;
    this.furnitureMeshes.forEach(mesh => {
      mesh.scale.set(furnScale > 0.01 ? 1 : 0.01, furnScale, furnScale > 0.01 ? 1 : 0.01);
      mesh.position.y = mesh.userData.nominalY * furnScale;
    });

    // Auvents : descendent et apparaissent en fin d'élévation
    const k = Math.max(0, Math.min(1, (e - 0.90) / 0.10));
    this.canopyGroup.visible = k > 0.01;
    this.canopyGroup.position.y = (1 - k) * 1.2;
    this.canopyMaterials.forEach(m => { m.opacity = k; });

    // Textes, cotes et grille 2D s'estompent
    const alpha2D = Math.max(0, 1 - e * 2.2);
    this.annotationGroup.visible = alpha2D > 0.02;
    this.labelMaterials.forEach(m => { m.opacity = alpha2D; });
    if (this.blueprintGrid) this.blueprintGrid.visible = alpha2D > 0.05;
    this.updatePlanOverlay();
  }

  toggleSectionCut() {
    this.sectionEnabled = !this.sectionEnabled;
    if (this.sectionEnabled) {
      const maxLevel = Math.max(0, ...(HOUSE_DATA.walls || []).map(w => Number(w.level) || 0));
      const totalHeight = this.levelOffset(maxLevel) + HOUSE_DATA.config.wallHeight;
      this.sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), totalHeight * 0.5);
    }
    const planes = this.sectionEnabled ? [this.sectionPlane] : [];
    this.scene.traverse(obj => {
      if (!obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(material => { material.clippingPlanes = planes; material.clipShadows = this.sectionEnabled; material.needsUpdate = true; });
    });
    return this.sectionEnabled;
  }

  playConstruction(duration = 9000) {
    if (this._constructionFrame) cancelAnimationFrame(this._constructionFrame);
    const start = performance.now();
    // Mouvement réduit : le chantier avance par quatre états fixes au lieu d'un mouvement continu.
    const stepped = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setElevation(0);
    const tick = now => {
      const raw = Math.min(1, (now - start) / duration);
      const t = stepped ? Math.floor(raw * 4) / 4 : raw;
      this.setElevation(t);
      if (t < 1) this._constructionFrame = requestAnimationFrame(tick);
      else this._constructionFrame = 0;
    };
    this._constructionFrame = requestAnimationFrame(tick);
  }

  setExploded(enabled) {
    const hasExplodableRoof = !!(this.canopyGroup && this.canopyGroup.children.some(mesh => mesh.userData.explodable));
    if (enabled && this.slabMeshes.length === 0 && !hasExplodableRoof) {
      this.explodedTarget = 0;
      return false;
    }
    this.explodedTarget = enabled ? 1 : 0;
    return !!this.explodedTarget;
  }

  updateTechnicalAnimations() {
    const target = this.explodedTarget || 0;
    this.exploded = this.exploded === undefined ? 0 : this.exploded;
    this.exploded += (target - this.exploded) * 0.08;
    if (Math.abs(target - this.exploded) < 0.001) this.exploded = target;
    if (this.canopyGroup) this.canopyGroup.children.forEach(mesh => {
      if (mesh.userData.explodable) mesh.position.y = mesh.userData.explodeBaseY + 5 * this.exploded;
    });
    this.slabMeshes.forEach(mesh => { mesh.position.y = mesh.userData.baseY + (mesh.userData.nominalHeight || 0.18) * (1 - Math.max(0, Math.min(1, (this.elevationProgress - 0.38) / 0.14))) + 1.5 * this.exploded; });
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  render() {
    this.updateTechnicalAnimations();
    this.renderer.render(this.scene, this.camera);
  }
}

window.HouseScene = HouseScene;
