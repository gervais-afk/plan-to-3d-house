/**
 * REALISM LAYER — extension de HouseScene
 * Mobilier composé, menuiseries (plinthes / chambranles), abords paysagers, lampes par pièce,
 * silhouettes humaines, éclairage d'environnement (RoomEnvironment / HDRI), bascule Jour / Soir,
 * occlusion ambiante (SSAO) et niveaux de qualité.
 */
(function () {
  const P = HouseScene.prototype;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------------------
  // MOBILIER COMPOSÉ (repli réaliste si aucun modèle glTF n'est disponible)
  // Repère local : l'objet « regarde » +Z, dossier / tête en −Z.
  // ---------------------------------------------------------------------------
  P.buildComposite = function (item) {
    const kind = item.model;
    const builders = { sofa: 1, chair: 1, diningTable: 1, coffeeTable: 1, bed: 1 };
    if (!builders[kind]) return null;

    const swap = item.dims !== 'local' && Math.abs(Math.sin(item.rotY || 0)) > 0.5;
    const W = swap ? item.d : item.w;
    const D = swap ? item.w : item.d;
    const H = item.h;
    const g = new THREE.Group();
    const mat = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const box = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const legs = (w, d, h, r, m) => {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(r, h, r, sx * (w / 2 - r), h / 2, sz * (d / 2 - r), m));
    };

    if (kind === 'sofa') {
      const fabric = mat(item.color, 0.95);
      const cushion = mat(new THREE.Color(item.color).offsetHSL(0, 0, 0.06), 0.95);
      const wood = mat('#3b2c20', 0.5);
      legs(W - 0.1, D - 0.1, 0.08, 0.05, wood);
      box(W, 0.3, D, 0, 0.23, 0, fabric);                                  // socle
      box(W, H - 0.08, 0.2, 0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.1, fabric); // dossier
      box(0.18, 0.62, D, -W / 2 + 0.09, 0.39, 0, fabric);                  // accoudoirs
      box(0.18, 0.62, D, W / 2 - 0.09, 0.39, 0, fabric);
      const n = W > 1.5 ? 3 : 2, cw = (W - 0.36) / n;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.18 + cw / 2 + i * cw;
        box(cw - 0.02, 0.12, D - 0.25, x, 0.44, 0.06, cushion);            // assises
        box(cw - 0.04, 0.38, 0.12, x, 0.66, -D / 2 + 0.26, cushion);       // coussins de dos
      }
    } else if (kind === 'chair') {
      const wood = mat('#6e5038', 0.55);
      const seat = mat(item.color, 0.9);
      legs(W, D, 0.44, 0.035, wood);
      box(W, 0.05, D, 0, 0.465, 0, seat);
      box(W, 0.42, 0.04, 0, 0.7, -D / 2 + 0.02, wood);
    } else if (kind === 'diningTable' || kind === 'coffeeTable') {
      const wood = mat(item.color, 0.45);
      const top = kind === 'diningTable' ? 0.045 : 0.06;
      box(W, top, D, 0, H - top / 2, 0, wood);
      legs(W - 0.06, D - 0.06, H - top, kind === 'diningTable' ? 0.06 : 0.05, mat('#3b2c20', 0.5));
    } else if (kind === 'bed') {
      const frame = mat('#6b5440', 0.6);
      const sheet = mat('#f3f0ea', 0.95);
      const duvet = mat('#c9c2b4', 0.95);
      box(W, 0.28, D, 0, 0.14, 0, frame);
      box(W - 0.06, 0.2, D - 0.06, 0, 0.38, 0, sheet);
      box(W - 0.02, 0.06, D * 0.62, 0, 0.5, D * 0.19, duvet);
      const pw = (W - 0.2) / 2;
      box(pw, 0.12, 0.38, -pw / 2 - 0.03, 0.53, -D / 2 + 0.26, sheet);
      box(pw, 0.12, 0.38, pw / 2 + 0.03, 0.53, -D / 2 + 0.26, sheet);
    }

    g.position.set(item.x, 0, item.z);
    g.rotation.y = item.rotY || 0;
    g.userData = { nominalY: 0, item };
    return g;
  };

  // ---------------------------------------------------------------------------
  // INITIALISATION DE LA COUCHE RÉALISTE
  // ---------------------------------------------------------------------------
  P.initRealism = function () {
    this.quality = 'high';
    this.night = 0;
    this.nightTarget = 0;
    this.solarHour = this.solarTarget = SolarStudy.day;
    this.northDegrees = HouseAuto.northAngle(HOUSE_DATA);
    this.sunOrigin = this.sunLight.position.clone();
    const bb = HouseAuto.bbox(HOUSE_DATA);
    const topLevel = HOUSE_DATA.walls.reduce((max, wall) => Math.max(max, wall.level), 0);
    const height = this.levelOffset(topLevel) + HOUSE_DATA.config.wallHeight;
    this.sunCenter = new THREE.Vector3(bb.cx, height / 2, bb.cz);
    this.sunDistance = Math.max(24, Math.hypot(bb.w, bb.d, height) * 1.3);
    this.sunLight.shadow.camera.far = this.sunDistance * 2.5;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sunLight.target);
    this.roomLights = [];
    this.windGroups = [];
    this.waterMeshes = [];
    this.fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffd9a0, emissiveIntensity: 0.2, roughness: 0.4 });

    this.createJoinery();
    this.createExterior();
    this.createRoomLights();
    this.createPeople();
    this.createDecor();
    this.createContactShadows();
    this.setupEnvironment();
    this.collectMaterials();
    this.mergeStatic();
    this._atmoDirty = true;
    this.applyAtmosphere();
    this.setQuality('high');
  };

  // Plinthes + chambranles de portes
  P.createJoinery = function () {
    const H = HOUSE_DATA.config.wallHeight;
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xece8e1, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.5 });
    const opt = { edges: false, collide: false, castShadow: false };

    this.wallMeshes.slice().forEach(m => {
      const u = m.userData;
      if (m.material !== this.wallPBRMaterial || u.nominalHeight < H - 0.01) return;
      const p = m.geometry.parameters;
      this.addElevated(new THREE.BoxGeometry(p.width, 0.08, p.depth + 0.024), plinthMat, m.position.x, m.position.z, u.baseY, 0.08, m.rotation.y, opt);
    });

    HOUSE_DATA.walls.forEach(w => {
      const levelY = this.levelOffset(w.level);
      const p1 = new THREE.Vector2(w.from[0], w.from[1]);
      const dir = new THREE.Vector2(w.to[0] - w.from[0], w.to[1] - w.from[1]).normalize();
      const angle = Math.atan2(dir.y, dir.x);
      w.openings.filter(op => op.type === 'door').forEach(op => {
        const depth = w.thick + 0.03, fw = 0.06;
        [op.at - op.w / 2 - fw / 2, op.at + op.w / 2 + fw / 2].forEach(d => {
          const p = this.alongWall(p1, dir, d);
          this.addElevated(new THREE.BoxGeometry(fw, op.h + fw, depth), frameMat, p.x, p.z, levelY, op.h + fw, -angle, opt);
        });
        const p = this.alongWall(p1, dir, op.at);
        this.addElevated(new THREE.BoxGeometry(op.w + 2 * fw, fw, depth), frameMat, p.x, p.z, levelY + op.h, fw, -angle, opt);
      });
    });
  };

  // Allée, haies, arbres
  P.createExterior = function () {
    const ex = HOUSE_DATA.exterior;
    if (!ex) { this.createWaterSurface(HOUSE_DATA.water || null); return; }
    if (ex.path && ex.path.xMax > ex.path.xMin && ex.path.zMax > ex.path.zMin) {
      const base = this.getFloorTextureBase('stone');
      const map = base.tex.clone();
      map.needsUpdate = true;
      const pw = ex.path.xMax - ex.path.xMin, pd = ex.path.zMax - ex.path.zMin;
      map.repeat.set(pw / base.meters, pd / base.meters);
      const pbr = this.getPbrMaps(base.tex, 'floor-stone');
      const path = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshStandardMaterial({ map, normalMap: pbr.normalMap, roughnessMap: pbr.roughnessMap, roughness: 0.85 }));
      path.rotation.x = -Math.PI / 2;
      path.position.set((ex.path.xMin + ex.path.xMax) / 2, 0.003, (ex.path.zMin + ex.path.zMax) / 2);
      path.receiveShadow = true;
      this.scene.add(path);
    }

    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4d6a38, roughness: 1 });
    (ex.hedges || []).forEach(h => {
      const horiz = h.z !== undefined;
      const len = horiz ? h.xMax - h.xMin : h.zMax - h.zMin;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.6, 0.9, horiz ? 0.6 : len), hedgeMat);
      mesh.position.set(horiz ? (h.xMin + h.xMax) / 2 : h.x, 0.45, horiz ? h.z : (h.zMin + h.zMax) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { nominalY: 0.45 };
      this.scene.add(mesh);
      this.furnitureMeshes.push(mesh);
    });

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
    (ex.trees || []).forEach(([x, z, s], i) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 1.8 * s, 8), trunkMat);
      trunk.position.y = 0.9 * s;
      trunk.castShadow = true;
      g.add(trunk);
      const leafMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.27 + i * 0.012, 0.38, 0.32 + (i % 3) * 0.03), roughness: 1, flatShading: true });
      [[0, 2.5, 0, 1.15], [0.55, 2.2, 0.2, 0.8], [-0.5, 2.3, -0.25, 0.85], [0.1, 3.05, -0.1, 0.75]].forEach(([fx, fy, fz, r]) => {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leafMat);
        f.position.set(fx * s, fy * s, fz * s);
        f.castShadow = f.receiveShadow = true;
        g.add(f);
      });
      g.position.set(x, 0, z);
      g.userData = { nominalY: 0, windSeed: i * 1.73 };
      this.scene.add(g);
      this.furnitureMeshes.push(g);
      this.windGroups.push(g);
    });
    this.createOptionalVehicle(ex);
    this.createWaterSurface(HOUSE_DATA.water || ex.water || ex.pool || null);
  };

  // Véhicule construit à l'échelle seulement lorsqu'une zone de stationnement est fournie par le projet.
  P.createOptionalVehicle = function (exterior) {
    const zone = exterior && (exterior.parking || exterior.vehicleZone);
    if (!zone) return;
    const b = zone.bounds || zone, w = Number(b.xMax) - Number(b.xMin), d = Number(b.zMax) - Number(b.zMin);
    if (!(w >= 2.05 && d >= 3.2)) return;
    const alongX = w > d, length = Math.min(4.35, (alongX ? w : d) * 0.9), width = Math.min(1.85, (alongX ? d : w) * 0.82);
    if (length < 3.1 || width < 1.55) return;
    const cx = (b.xMin + b.xMax) / 2, cz = (b.zMin + b.zMax) / 2, g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: zone.color || 0x38424a, roughness: 0.32, metalness: 0.42 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x8297a1, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.62, length), bodyMat); body.position.y = 0.58; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.52, length * 0.48), glassMat); cabin.position.set(0, 1.05, -length * 0.02); cabin.castShadow = true; g.add(cabin);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.8 });
    [-1, 1].forEach(side => [-1, 1].forEach(end => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.18, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(side * width * 0.51, 0.34, end * length * 0.31); wheel.castShadow = true; g.add(wheel);
    }));
    g.position.set(cx, 0, cz); if (alongX) g.rotation.y = Math.PI / 2;
    g.userData = { nominalY: 0, item: { name: 'Véhicule' } };
    this.scene.add(g); this.furnitureMeshes.push(g);
  };

  // Plan d'eau facultatif : aucune piscine n'est inventée sans bounds présentes dans project.json.
  P.createWaterSurface = function (water) {
    if (!water) return;
    const b = water.bounds || water;
    const w = Number(b.xMax) - Number(b.xMin), d = Number(b.zMax) - Number(b.zMin);
    if (!(w > 0.5 && d > 0.5)) return;
    const geo = new THREE.PlaneGeometry(w, d, 16, 16), base = geo.attributes.position.array.slice();
    const mat = new THREE.MeshPhysicalMaterial({ color: water.color || 0x76b9c8, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.82, clearcoat: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((b.xMin + b.xMax) / 2, Number(water.y) || 0.025, (b.zMin + b.zMax) / 2);
    mesh.receiveShadow = true; mesh.userData.waveBase = base;
    this.scene.add(mesh); this.waterMeshes.push(mesh);
  };

  // Lampes : luminaire + PointLight (sans ombre portée, pour tenir 60 FPS)
  P.createRoomLights = function () {
    const H = HOUSE_DATA.config.wallHeight;
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.4, metalness: 0.6 });
    (HOUSE_DATA.lights || []).forEach(L => {
      const room = (HOUSE_DATA.rooms || []).find(r => r.id === L.room);
      const levelY = this.levelOffset(L.level === undefined && room ? room.level : L.level);
      let y = levelY + (L.y || H - 0.15);
      const addFurn = (obj) => { obj.userData = { nominalY: obj.position.y }; this.scene.add(obj); this.furnitureMeshes.push(obj); };

      if (L.type === 'ceiling') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), this.fixtureMaterial);
        disc.position.set(L.x, levelY + H - 0.02, L.z);
        disc.visible = false;
        this.scene.add(disc);
        this.ceilings.push(disc); // visible avec les plafonds
        y = levelY + H - 0.25;
      } else if (L.type === 'pendant') {
        const g = new THREE.Group();
        const cordLength = H - (y - levelY);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cordLength, 4), metal);
        cord.position.y = cordLength / 2;
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 24, 1, true), metal);
        shade.material = metal.clone();
        shade.material.side = THREE.DoubleSide;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), this.fixtureMaterial);
        bulb.position.y = -0.08;
        g.add(cord, shade, bulb);
        g.position.set(L.x, y, L.z);
        addFurn(g);
        y -= 0.12;
      } else if (L.type === 'floor') {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), metal);
        base.position.y = 0.015;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 6), metal);
        pole.position.y = 0.74;
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.32, 24, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xf1e6d2, emissive: 0xffd9a0, emissiveIntensity: 0.1, side: THREE.DoubleSide, roughness: 0.9 }));
        shade.position.y = 1.58;
        this.lampShadeMaterials = (this.lampShadeMaterials || []).concat(shade.material);
        g.add(base, pole, shade);
        g.position.set(L.x, levelY, L.z);
        g.userData = { nominalY: levelY };
        this.scene.add(g);
        this.furnitureMeshes.push(g);
        y = levelY + 1.55;
      } else if (L.type === 'wall') {
        const ap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.08), this.fixtureMaterial);
        ap.position.set(L.x, y, L.z - 0.02);
        addFurn(ap);
        y -= 0.1;
      }

      const light = new THREE.PointLight(0xffd6a0, 0, L.dist || 5, 2);
      light.position.set(L.x, y, L.z + (L.type === 'wall' ? 0.15 : 0));
      light.userData = { base: L.i };
      this.scene.add(light);
      this.roomLights.push(light);
    });
  };

  // Silhouettes humaines « maquette » (mannequins mats)
  P.makePerson = function (pose, seatY = 0.45) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xe6e1d8, roughness: 0.9 });
    const add = (geo, x, y, z, rx = 0, rz = 0, sx = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      mesh.scale.set(sx, 1, sz);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    const limb = (r1, r2, h) => new THREE.CylinderGeometry(r1, r2, h, 10);

    if (pose === 'sit') {
      const s = seatY;
      [-0.1, 0.1].forEach(x => {
        add(limb(0.07, 0.06, 0.44), x, s + 0.07, 0.2, Math.PI / 2);           // cuisses
        add(limb(0.055, 0.045, s + 0.05), x, (s + 0.05) / 2, 0.42);           // jambes
      });
      add(limb(0.15, 0.17, 0.6), 0, s + 0.38, -0.02, -0.08, 0, 1, 0.62);      // buste
      add(new THREE.SphereGeometry(0.105, 16, 12), 0, s + 0.82, 0.0);          // tête
      [-1, 1].forEach(k => {
        add(limb(0.045, 0.04, 0.32), k * 0.21, s + 0.5, 0.02);                 // bras
        add(limb(0.04, 0.035, 0.3), k * 0.19, s + 0.33, 0.17, Math.PI / 2);    // avant-bras
      });
    } else {
      [-0.09, 0.09].forEach(x => add(limb(0.065, 0.05, 0.86), x, 0.43, 0));  // jambes
      add(limb(0.16, 0.13, 0.62), 0, 1.17, 0, 0, 0, 1, 0.62);                 // buste
      add(limb(0.04, 0.045, 0.1), 0, 1.5, 0);                                  // cou
      add(new THREE.SphereGeometry(0.105, 16, 12), 0, 1.62, 0.01);             // tête
      [-1, 1].forEach(k => add(limb(0.045, 0.038, 0.64), k * 0.21, 1.14, 0.02, 0.06, k * 0.07));
    }
    return g;
  };

  P.createPeople = function () {
    (HOUSE_DATA.people || []).forEach(p => {
      const g = this.makePerson(p.pose, p.seatY);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.rotY || 0;
      g.userData = { nominalY: 0, item: Object.assign({ w: 0.5, h: p.pose === 'sit' ? 1.3 : 1.72, d: 0.5 }, p) };
      this.scene.add(g);
      this.furnitureMeshes.push(g);
    });
  };

  // Emplacements de décoration : vides tant que le modèle glTF n'est pas chargé
  P.createDecor = function () {
    (HOUSE_DATA.decor || []).forEach(d => {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      g.userData = { nominalY: 0, item: Object.assign({ decor: true }, d) };
      this.scene.add(g);
      this.furnitureMeshes.push(g);
    });
  };

  // Environnement : RoomEnvironment (intégré) puis HDRI si fourni
  P.setupEnvironment = function () {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    if (THREE.RoomEnvironment) {
      this.scene.environment = this.pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    }
    const hdri = HOUSE_DATA.assets && HOUSE_DATA.assets.hdri;
    if (hdri && THREE.RGBELoader) {
      new THREE.RGBELoader().setDataType(THREE.UnsignedByteType).load(hdri, tex => {
        this.scene.environment = this.pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
      }, undefined, () => console.info('HDRI non disponible, RoomEnvironment conservé'));
    }
  };

  P.collectMaterials = function () {
    const set = new Set();
    this.scene.traverse(o => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) set.add(o.material);
    });
    this.pbrMaterials = Array.from(set);
    this.pbrMaterials.forEach(m => {
      // Réflexions d'environnement discrètes (RoomEnvironment est un studio : trop fort sur murs et parquet)
      if (m.userData.baseEnv === undefined) m.userData.baseEnv = (m === this.glassMaterial) ? 1.0 : (m.metalness > 0.3 ? 0.5 : 0.12);
    });
  };

  // Ombres de contact : halo sombre sous chaque meuble / silhouette (occlusion ambiante « bakée »,
  // robuste et quasi gratuite — la SSAO de r128 produit des artefacts sur ce modèle)
  P.createContactShadows = function () {
    const c = this.makeCanvas(128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 });
    const skip = /Tapis|Écran|Évier|Meuble haut|Tête de lit|Réservoir|Lave-mains/;

    this.furnitureMeshes.slice().forEach(o => {
      const it = o.userData.item;
      if (!it || it.decor || skip.test(it.name || '') || (it.y !== undefined && it.y - (it.h || 0) / 2 > 0.3)) return;
      const w = (it.pose ? 0.55 : Number(it.w)) + 0.35, d = (it.pose ? 0.55 : Number(it.d)) + 0.35;
      if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0 || !Number.isFinite(it.x) || !Number.isFinite(it.z)) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.set(-Math.PI / 2, 0, it.dims === 'local' ? (it.rotY || 0) : 0);
      m.position.set(it.x, this.levelOffset(it.level) + 0.008, it.z);
      m.renderOrder = 1;
      m.userData = { nominalY: 0.008 };
      this.scene.add(m);
      this.furnitureMeshes.push(m);
    });
  };

  P.setQuality = function (q) {
    this.quality = q;
    const high = q === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
    const size = high ? 2048 : 1024;
    if (this.sunLight.shadow.mapSize.width !== size) {
      this.sunLight.shadow.mapSize.set(size, size);
      if (this.sunLight.shadow.map) { this.sunLight.shadow.map.dispose(); this.sunLight.shadow.map = null; }
    }
    this.onResize();
    return q;
  };

  P.setSolarHour = function (hour) {
    if (!Number.isFinite(hour)) return;
    this.solarTarget = SolarStudy.clampHour(hour, this.solarGeo);
    this.nightTarget = SolarStudy.position(this.solarTarget, this.northDegrees, this.solarGeo).dusk;
    this._atmoDirty = true;
  };

  // Couleurs de ciel / sol / intensités selon élévation (maquette → réel) et Jour / Soir
  const C = {
    paper: new THREE.Color(0xF5F2EB), sky: new THREE.Color(0xdce8f0), nightSky: new THREE.Color(0x131a28),
    lawn: new THREE.Color(0x8fa86a), nightLawn: new THREE.Color(0x26301f),
    sunDay: new THREE.Color(0xffffff), sunWarm: new THREE.Color(0xffa450), warmSky: new THREE.Color(0xe9b291), sunNight: new THREE.Color(0x9fb4ff)
  };
  const tmp = new THREE.Color();

  P.applyAtmosphere = function () {
    const k = smooth(0.4, 1.0, this.elevationProgress);
    const solar = this.solarHour == null ? null : SolarStudy.position(this.solarHour, this.northDegrees, this.solarGeo);
    const n = solar ? solar.dusk : this.night;
    if (solar) {
      this.sunLight.target.position.copy(this.sunCenter);
      this.sunLight.position.set(solar.x, solar.y, solar.z).multiplyScalar(this.sunDistance).add(this.sunCenter);
    } else {
      this.sunLight.target.position.set(0, 0, 0);
      this.sunLight.position.copy(this.sunOrigin);
    }

    tmp.copy(C.paper).lerp(C.sky, k).lerp(C.warmSky, solar ? solar.warmth * 0.52 * k : 0).lerp(C.nightSky, n * k);
    this.scene.background.copy(tmp);
    this.scene.fog.color.copy(tmp);
    this.groundMaterial.color.copy(C.paper).lerp(C.lawn, k).lerp(C.nightLawn, n * k);

    const nk = n * k;
    // À l'intérieur (plafonds visibles) : lumière du jour diffuse renforcée + lampes d'appoint
    const inside = this.ceilingsVisible ? 1 : 0;
    const dayIn = inside * (1 - n);
    this.sunLight.intensity = lerp(1.05, 0.08, nk);
    this.sunLight.color.copy(C.sunDay).lerp(C.sunNight, nk);
    if (solar) {
      this.sunLight.intensity = lerp(1.05, 1.5 * solar.light, k);
      this.sunLight.color.copy(C.sunDay).lerp(C.sunWarm, solar.warmth * k);
    }
    // (intérieur de jour : diffuse modérée pour garder volumes et contrastes, lampes chaudes d'appoint)
    this.ambientLight.intensity = lerp(lerp(lerp(0.6, 0.32, k), 0.14, dayIn), 0.05, nk);
    this.fillLight.intensity = lerp(lerp(lerp(0.45, 0.3, k), 0.42, dayIn), 0.06, nk);
    this.roomLights.forEach(l => { l.intensity = l.userData.base * Math.max(nk, 0.55 * dayIn); });
    this.fixtureMaterial.emissiveIntensity = 0.15 + 1.9 * nk;
    (this.lampShadeMaterials || []).forEach(m => { m.emissiveIntensity = 0.05 + 1.2 * nk; });
    const envK = lerp(1, 0.12, nk) * k;
    (this.pbrMaterials || []).forEach(m => { m.envMapIntensity = m.userData.baseEnv * envK; });
    this.renderer.toneMappingExposure = lerp(lerp(1.05, 1.15, dayIn), 1.25, nk);
    // Traits d'encre « maquette » masqués quand on est à l'intérieur
    this.inkEdgeMaterial.visible = !inside;
    if (this.furnEdgeMaterial) this.furnEdgeMaterial.visible = !inside;
    this._atmoDirty = false;
  };

  // ---------------------------------------------------------------------------
  // FUSION DE LA GÉOMÉTRIE STATIQUE (≈ 550 objets → quelques dizaines d'appels de dessin)
  // L'élévation est une mise à l'échelle verticale uniforme depuis le sol : un groupe suffit.
  // ---------------------------------------------------------------------------
  P.mergeGeometries = function (geos, withNormalsUv = true) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g)).filter(g => {
      const p = g.attributes && g.attributes.position;
      // Un actif glTF incomplet ne doit pas propager des NaN à toute la scène fusionnée.
      return p && p.array && p.array.length >= p.count * 3 && Array.from(p.array).every(Number.isFinite);
    });
    let count = 0;
    parts.forEach(g => { count += g.attributes.position.count; });
    const pos = new Float32Array(count * 3);
    const nor = withNormalsUv ? new Float32Array(count * 3) : null;
    const uv = withNormalsUv ? new Float32Array(count * 2) : null;
    let o = 0;
    parts.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      if (nor && g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  };

  const matKey = (m) => {
    if (m.userData.keepBatch || (m.emissive && m.emissive.getHex() !== 0)) return m.uuid; // matériaux animés : identité conservée
    const t = (x) => (x ? x.uuid : '');
    return [m.type, m.color && m.color.getHexString(), m.roughness, m.metalness, t(m.map), t(m.normalMap), t(m.roughnessMap), t(m.metalnessMap), t(m.alphaMap), m.alphaTest,
      m.transparent, m.opacity, m.side, m.flatShading, m.depthWrite].join('|');
  };

  // Rejette une géométrie corrompue avant clone/applyMatrix4 : Three.js recalcule parfois
  // sa bounding sphere pendant ces opérations, ce qui sinon propage une erreur NaN.
  const hasFinitePositions = geometry => {
    const position = geometry && geometry.attributes && geometry.attributes.position;
    return !!(position && position.array && position.array.length >= position.count * 3 && Array.from(position.array).every(Number.isFinite));
  };

  // Regroupe les meshes de `objects` (mis à pleine échelle au préalable) dans `group`
  P.mergeInto = function (objects, group, edgeMaterialFilter) {
    const byMat = new Map(), canon = new Map(), edges = new Map();
    this.scene.updateMatrixWorld(true);
    objects.forEach(root => {
      root.updateMatrixWorld(true);
      const keep = [];
      root.traverse(o => {
        if ((o.isLineSegments || o.isLine) && o.geometry) {
          if (!hasFinitePositions(o.geometry)) {
            console.warn('Géométrie de lignes invalide ignorée pendant la fusion.', o.name || o.uuid, root.userData && root.userData.item && root.userData.item.name);
            return;
          }
          if (!edges.has(o.material)) edges.set(o.material, []);
          edges.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld));
          return;
        }
        if (!o.isMesh) return;
        if (!hasFinitePositions(o.geometry)) {
          console.warn('Géométrie de mesh invalide ignorée pendant la fusion.', o.name || o.uuid, root.userData && root.userData.item && root.userData.item.name);
          return;
        }
        if (Array.isArray(o.material) || o.isSkinnedMesh || o.isInstancedMesh) { keep.push(o); return; }
        const k = matKey(o.material);
        if (!canon.has(k)) canon.set(k, o.material);
        const mat = canon.get(k);
        if (!byMat.has(mat)) byMat.set(mat, { geos: [], cast: false, order: 0 });
        const e = byMat.get(mat);
        e.geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
        e.cast = e.cast || o.castShadow;
        e.order = Math.max(e.order, o.renderOrder || 0);
      });
      keep.forEach(o => group.attach(o));
      if (root.parent) root.parent.remove(root);
    });
    byMat.forEach((e, mat) => {
      if (!e.geos.length) return;
      const mesh = new THREE.Mesh(this.mergeGeometries(e.geos), mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      mesh.renderOrder = e.order;
      group.add(mesh);
    });
    edges.forEach((geos, mat) => group.add(new THREE.LineSegments(this.mergeGeometries(geos, false), mat)));
    return group;
  };

  P.mergeStatic = function () {
    this.wallMeshes.forEach(m => {
      m.scale.y = 1;
      m.position.y = m.userData.baseY + m.userData.nominalHeight / 2;
    });
    this.scene.updateMatrixWorld(true);
    this.colliderBoxes = this.wallMeshes.filter(m => m.userData.collide).map(m => new THREE.Box3().setFromObject(m));
    this.elevatedGroup = this.mergeInto(this.wallMeshes, new THREE.Group());
    this.scene.add(this.elevatedGroup);
    this.wallMeshes = [];
    this.setElevation(this.elevationProgress);
  };

  P.mergeFurniture = function () {
    const windSet = new Set(this.windGroups || []);
    const mergeable = this.furnitureMeshes.filter(o => !windSet.has(o));
    mergeable.forEach(o => {
      o.scale.set(1, 1, 1);
      o.position.y = o.userData.nominalY || 0;
    });
    this.furnGroup = this.mergeInto(mergeable, new THREE.Group());
    this.scene.add(this.furnGroup);
    this.furnitureMeshes = (this.windGroups || []).slice();
    this.collectMaterials();
    this._atmoDirty = true;
    this.setElevation(this.elevationProgress);
  };

  // Hooks : élévation → groupes fusionnés + ambiance
  const origSetElevation = P.setElevation;
  P.setElevation = function (p) {
    const before = this.elevationProgress;
    origSetElevation.call(this, p);
    const e = this.elevationProgress;
    if (this.elevatedGroup) this.elevatedGroup.scale.y = Math.max(0.015, this.buildingProgress === undefined ? e : this.buildingProgress);
    if (this.furnGroup) {
      const f = this.furnitureProgress === undefined ? Math.max(0.01, Math.min(1, (e - 0.78) / 0.16)) : this.furnitureProgress;
      this.furnGroup.scale.y = f;
      this.furnGroup.visible = f > 0.01;
    }
    if (before !== e) this._atmoDirty = true;
  };

  P.updateRealism = function (dt) {
    this._windTime = (this._windTime || 0) + dt;
    this.windGroups.forEach(g => {
      const phase = this._windTime * 0.65 + g.userData.windSeed;
      g.rotation.z = Math.sin(phase) * 0.012;
      g.rotation.x = Math.cos(phase * 0.83) * 0.009;
    });
    this.waterMeshes.forEach(mesh => {
      const attr = mesh.geometry.attributes.position, base = mesh.userData.waveBase, t = this._windTime;
      for (let i = 0; i < attr.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        attr.array[i * 3 + 2] = Math.sin(x * 1.8 + t * 1.2) * 0.012 + Math.cos(y * 2.1 - t) * 0.009;
      }
      attr.needsUpdate = true; mesh.geometry.computeVertexNormals();
    });
    if (this.solarHour != null && this.solarHour !== this.solarTarget) {
      this.solarHour = lerp(this.solarHour, this.solarTarget, Math.min(1, dt * 14));
      if (Math.abs(this.solarHour - this.solarTarget) < 0.01) this.solarHour = this.solarTarget;
      this._atmoDirty = true;
    } else if (this.solarHour == null && this.night !== this.nightTarget) {
      const step = dt / 1.2;
      this.night = this.nightTarget > this.night ? Math.min(this.nightTarget, this.night + step) : Math.max(this.nightTarget, this.night - step);
      this._atmoDirty = true;
    }
    if (this._atmoDirty && this.pbrMaterials) this.applyAtmosphere();
  };

})();
