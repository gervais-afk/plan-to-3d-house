/**
 * FURNITURE 3D BUILDER & EDITOR LIVE 3D VIEWPORT
 * 1) `window.Furniture3DBuilder.build(THREE, item)` : construit des meubles 3D détaillés
 *    pour tous les types architecturaux (canapés, lits, cuisine, sanitaires, plantes, rangements, voitures).
 * 2) `window.EditorLive3D` : vue 3D temps réel embarquée dans l'éditeur (mode 2D / 2D+3D / 3D),
 *    synchronisée à 60 fps avec les murs, ouvertures, sols, auvents, meubles posés et le fantôme au curseur.
 */
(() => {
  'use strict';

  function inferKind(item) {
    if (typeof window !== 'undefined' && window.Furniture2D && typeof window.Furniture2D.inferSymbol === 'function') {
      return window.Furniture2D.inferSymbol(item);
    }
    const m = String(item?.model || '');
    const n = String(item?.name || '').toLowerCase();
    if (m) return m;
    if (/canap.*angle/.test(n)) return 'sofaCorner';
    if (/fauteuil/.test(n)) return 'armchair';
    if (/canap/.test(n)) return 'sofa';
    if (/\blit\b/.test(n)) return 'bed';
    if (/table basse/.test(n)) return 'coffeeTable';
    if (/table/.test(n)) return 'diningTable';
    if (/chaise/.test(n)) return 'chair';
    if (/\btv\b/.test(n)) return 'tvUnit';
    if (/tapis/.test(n)) return 'rug';
    if (/îlot|ilot/.test(n)) return 'kitchenIsland';
    if (/plan de travail/.test(n)) return 'kitchenCounter';
    if (/plaque/.test(n)) return 'cooktop';
    if (/évier|evier/.test(n)) return 'sink';
    if (/frigo|réfrig|refrig/.test(n)) return 'fridge';
    if (/armoire|dressing/.test(n)) return 'wardrobe';
    if (/\bwc\b|cuvette/.test(n)) return 'toilet';
    if (/vasque|lavabo|lave-mains/.test(n)) return 'vanity';
    if (/douche/.test(n)) return 'shower';
    if (/baignoire/.test(n)) return 'bathtub';
    if (/bureau/.test(n)) return 'desk';
    if (/chevet/.test(n)) return 'nightstand';
    if (/plante/.test(n)) return 'plantTall';
    if (/étag|biblio/.test(n)) return 'shelf';
    if (/voiture/.test(n)) return 'car';
    return 'box';
  }

  /**
   * Construit un groupe Three.js détaillé pour n'importe quel meuble.
   * Repère local : origine au sol (y = 0), avant en +Z, arrière en −Z.
   */
  function buildFurnitureMesh3D(THREE, item, opts = {}) {
    const kind = inferKind(item);
    const swap = item.dims !== 'local' && Math.abs(Math.sin(item.rotY || 0)) > 0.5;
    const W = Math.max(0.12, Number(swap ? item.d : item.w) || 0.8);
    const D = Math.max(0.12, Number(swap ? item.w : item.d) || 0.6);
    const H = Math.max(0.02, Number(item.h) || 0.75);
    const ghost = !!opts.ghost;
    const selected = !!opts.selected;

    const g = new THREE.Group();
    const mat = (color, rough = 0.7, metal = 0.04, extra = {}) => new THREE.MeshStandardMaterial({
      color: selected && !ghost ? new THREE.Color(color).lerp(new THREE.Color('#d49a3a'), 0.25) : color,
      roughness: rough,
      metalness: metal,
      transparent: ghost || !!extra.transparent,
      opacity: ghost ? 0.52 : (extra.opacity ?? 1),
      ...extra
    });
    const addBox = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d)), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      g.add(mesh);
      return mesh;
    };
    const addCyl = (rt, rb, h, x, y, z, m, seg = 14) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      g.add(mesh);
      return mesh;
    };
    const addLegs = (w, d, h, r, m) => {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        addBox(r, h, r, sx * (w / 2 - r), h / 2, sz * (d / 2 - r), m);
      });
    };

    const baseCol = item.color || '#8c8378';
    const darkWood = mat('#3c2d21', 0.55);
    const warmWood = mat('#8f6c4a', 0.52);
    const chrome = mat('#cfd6db', 0.22, 0.78);
    const ceramic = mat('#f5f6f4', 0.22, 0.04);

    switch (kind) {
      case 'sofa':
      case 'armchair': {
        const fabric = mat(baseCol, 0.92);
        const cushion = mat(new THREE.Color(baseCol).offsetHSL(0, 0, 0.07), 0.92);
        const armW = Math.min(0.18, W * 0.16);
        addLegs(W - 0.1, D - 0.1, 0.08, 0.045, darkWood);
        addBox(W, 0.28, D, 0, 0.22, 0, fabric);
        addBox(W, H - 0.08, 0.18, 0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.09, fabric);
        addBox(armW, Math.min(H * 0.76, 0.62), D * 0.96, -W / 2 + armW / 2, 0.08 + Math.min(H * 0.76, 0.62) / 2, 0, fabric);
        addBox(armW, Math.min(H * 0.76, 0.62), D * 0.96, W / 2 - armW / 2, 0.08 + Math.min(H * 0.76, 0.62) / 2, 0, fabric);
        const n = kind === 'armchair' ? 1 : (W > 1.75 ? 3 : 2);
        const cw = (W - armW * 2) / n;
        for (let i = 0; i < n; i++) {
          const cx = -W / 2 + armW + cw / 2 + i * cw;
          addBox(cw - 0.02, 0.12, D - 0.24, cx, 0.42, 0.06, cushion);
          addBox(cw - 0.04, H * 0.44, 0.12, cx, 0.48 + H * 0.2, -D / 2 + 0.24, cushion);
        }
        break;
      }

      case 'sofaCorner': {
        const fabric = mat(baseCol, 0.92);
        const cushion = mat(new THREE.Color(baseCol).offsetHSL(0, 0, 0.07), 0.92);
        const mainD = D * 0.48;
        const chaiseW = W * 0.38;
        // Corps principal (-Z)
        addBox(W, 0.32, mainD, 0, 0.22, -D / 2 + mainD / 2, fabric);
        addBox(W, H - 0.08, 0.18, 0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.09, fabric);
        // Méridienne (+X, +Z)
        addBox(chaiseW, 0.32, D, W / 2 - chaiseW / 2, 0.22, 0, fabric);
        addBox(0.18, H * 0.75, D * 0.65, W / 2 - 0.09, 0.08 + H * 0.375, -D / 2 + D * 0.325, fabric);
        addBox(0.16, H * 0.72, mainD, -W / 2 + 0.08, 0.08 + H * 0.36, -D / 2 + mainD / 2, fabric);
        // Coussins
        addBox(W - chaiseW - 0.18, 0.12, mainD - 0.22, -chaiseW / 2 + 0.08, 0.43, -D / 2 + mainD / 2 + 0.06, cushion);
        addBox(chaiseW - 0.2, 0.12, D - 0.22, W / 2 - chaiseW / 2 - 0.06, 0.43, 0.06, cushion);
        break;
      }

      case 'bed':
      case 'bedSingle': {
        const frame = mat('#6b533e', 0.58);
        const sheet = mat('#f5f2ec', 0.92);
        const duvet = mat(baseCol, 0.92);
        addBox(W, 0.26, D, 0, 0.13, 0, frame);
        addBox(W + 0.04, Math.max(H + 0.48, 0.95), 0.08, 0, Math.max(H + 0.48, 0.95) / 2, -D / 2 + 0.04, frame);
        addBox(W - 0.06, 0.2, D - 0.1, 0, 0.36, 0.02, sheet);
        addBox(W - 0.02, 0.07, D * 0.62, 0, 0.48, D * 0.18, duvet);
        const count = kind === 'bedSingle' || W <= 1.1 ? 1 : 2;
        const pw = (W - 0.24) / count;
        for (let i = 0; i < count; i++) {
          const px = count === 1 ? 0 : (i === 0 ? -pw / 2 - 0.04 : pw / 2 + 0.04);
          addBox(pw, 0.13, 0.38, px, 0.52, -D / 2 + 0.3, sheet);
        }
        break;
      }

      case 'diningTable':
      case 'terraceSet':
      case 'coffeeTable': {
        const topMat = mat(baseCol, 0.45);
        const top = kind === 'coffeeTable' ? 0.05 : 0.045;
        addBox(W, top, D, 0, H - top / 2, 0, topMat);
        addLegs(W - 0.06, D - 0.06, H - top, kind === 'coffeeTable' ? 0.045 : 0.055, darkWood);
        break;
      }

      case 'diningRound': {
        const topMat = mat(baseCol, 0.45);
        const r = Math.min(W, D) / 2;
        addCyl(r, r, 0.045, 0, H - 0.0225, 0, topMat, 24);
        addCyl(0.07, 0.09, H - 0.06, 0, (H - 0.06) / 2, 0, darkWood, 12);
        addCyl(r * 0.45, r * 0.48, 0.03, 0, 0.015, 0, darkWood, 16);
        break;
      }

      case 'chair': {
        const seat = mat(baseCol, 0.85);
        addLegs(W, D, 0.44, 0.032, warmWood);
        addBox(W, 0.05, D, 0, 0.465, 0, seat);
        addBox(W, Math.max(0.35, H - 0.48), 0.04, 0, 0.48 + Math.max(0.35, H - 0.48) / 2, -D / 2 + 0.02, warmWood);
        break;
      }

      case 'tvUnit': {
        const body = mat(baseCol, 0.5);
        const screenMat = mat('#11161a', 0.15, 0.3);
        addLegs(W - 0.1, D - 0.08, 0.1, 0.035, darkWood);
        addBox(W, H - 0.1, D, 0, 0.1 + (H - 0.1) / 2, 0, body);
        // Écran TV posé dessus
        const tvW = W * 0.72, tvH = Math.min(0.75, tvW * 0.56);
        addBox(0.28, 0.02, 0.16, 0, H + 0.01, -D * 0.1, screenMat);
        addBox(0.05, 0.1, 0.04, 0, H + 0.06, -D * 0.1, screenMat);
        addBox(tvW, tvH, 0.035, 0, H + 0.1 + tvH / 2, -D * 0.1, screenMat);
        break;
      }

      case 'kitchenCounter':
      case 'kitchenIsland': {
        const cabinet = mat('#edeae3', 0.55);
        const counter = mat(baseCol, 0.35, 0.08);
        const plinth = mat('#2a2d30', 0.7);
        addBox(W - 0.04, 0.1, D - 0.08, 0, 0.05, -0.02, plinth);
        addBox(W, H - 0.14, D - 0.02, 0, 0.1 + (H - 0.14) / 2, 0, cabinet);
        addBox(W + 0.02, 0.045, D + 0.02, 0, H - 0.0225, 0, counter);
        // Poignées horizontales en façade (+Z)
        const doors = Math.max(2, Math.round(W / 0.6));
        const dw = W / doors;
        for (let i = 0; i < doors; i++) {
          const x = -W / 2 + dw * (i + 0.5);
          addBox(dw * 0.36, 0.016, 0.025, x, H - 0.14, D / 2 + 0.005, chrome);
        }
        break;
      }

      case 'cooktop': {
        const glass = mat('#181b1f', 0.12, 0.35);
        const ring = mat('#525860', 0.3, 0.6);
        addBox(W, Math.max(0.03, H), D, 0, Math.max(0.03, H) / 2, 0, glass);
        [[-0.24, -0.22, 0.1], [0.24, -0.22, 0.08], [-0.24, 0.22, 0.08], [0.24, 0.22, 0.11]].forEach(([px, pz, r]) => {
          addCyl(r, r, 0.008, px * W, Math.max(0.03, H) + 0.004, pz * D, ring, 16);
        });
        break;
      }

      case 'sink': {
        const inox = mat('#b9c0c6', 0.28, 0.72);
        const basin = mat('#7b838a', 0.35, 0.6);
        addBox(W, 0.03, D, 0, 0.015, 0, inox);
        addBox(W * 0.46, 0.02, D * 0.72, -W * 0.18, 0.025, 0, basin);
        // Mitigeur col de cygne
        addCyl(0.018, 0.022, 0.26, -W * 0.18, 0.14, -D * 0.38, chrome, 10);
        addBox(0.022, 0.022, 0.14, -W * 0.18, 0.26, -D * 0.31, chrome);
        break;
      }

      case 'fridge': {
        const steel = mat(baseCol, 0.3, 0.48);
        addBox(W, H, D, 0, H / 2, 0, steel);
        // Séparation frigo / congélateur + poignées
        addBox(W + 0.006, 0.01, 0.01, 0, H * 0.36, D / 2 + 0.002, mat('#33383d', 0.6));
        addBox(0.02, H * 0.28, 0.035, -W / 2 + 0.08, H * 0.64, D / 2 + 0.02, chrome);
        addBox(0.02, H * 0.18, 0.035, -W / 2 + 0.08, H * 0.22, D / 2 + 0.02, chrome);
        break;
      }

      case 'toilet': {
        // Réservoir (-Z)
        addBox(W * 0.92, H * 0.55, D * 0.3, 0, H * 0.42 + H * 0.275, -D / 2 + D * 0.15, ceramic);
        // Pied & cuvette (+Z)
        addCyl(W * 0.32, W * 0.26, 0.38, 0, 0.19, D * 0.08, ceramic, 14);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.46, W * 0.34, 0.14, 16), ceramic);
        bowl.scale.set(1, 1, 1.32);
        bowl.position.set(0, 0.39, D * 0.14);
        bowl.castShadow = !ghost;
        g.add(bowl);
        // Bouton chasse chrome
        addCyl(0.028, 0.028, 0.018, 0, H * 0.97 + 0.01, -D / 2 + D * 0.15, chrome, 10);
        break;
      }

      case 'vanity': {
        const cab = mat('#e8e3da', 0.55);
        addBox(W, H * 0.68, D, 0, H * 0.16 + H * 0.34, 0, cab);
        addBox(W + 0.02, 0.04, D + 0.02, 0, H * 0.85, 0, ceramic);
        addCyl(Math.min(W * 0.26, D * 0.34), Math.min(W * 0.2, D * 0.28), 0.11, 0, H * 0.92, 0.02, ceramic, 16);
        addCyl(0.015, 0.018, 0.14, 0, H * 0.94, -D * 0.34, chrome, 10);
        // Miroir mural au-dessus
        const mirror = mat('#d9e6ec', 0.08, 0.85);
        addBox(W * 0.88, 0.72, 0.025, 0, H + 0.58, -D / 2 + 0.02, mirror);
        break;
      }

      case 'shower': {
        const tray = mat('#f2f4f5', 0.25);
        const glass = mat('#cbe3ef', 0.08, 0.1, { transparent: true, opacity: ghost ? 0.25 : 0.32 });
        addBox(W, 0.05, D, 0, 0.025, 0, tray);
        // Paroi vitrée sur 2 côtés
        const gh = Math.max(H, 2.0);
        addBox(W * 0.7, gh, 0.02, -W * 0.15, gh / 2, D / 2 - 0.01, glass);
        addBox(0.02, gh, D, W / 2 - 0.01, gh / 2, 0, glass);
        // Colonne de douche + pommeau
        addCyl(0.015, 0.015, 1.35, 0, 1.35, -D / 2 + 0.06, chrome, 10);
        addCyl(0.11, 0.11, 0.02, 0, 2.02, -D / 2 + 0.22, chrome, 14);
        break;
      }

      case 'bathtub': {
        addBox(W, H, D, 0, H / 2, 0, ceramic);
        addBox(W - 0.16, 0.04, D - 0.16, 0, H - 0.08, 0, mat('#cde2ec', 0.15, 0.1));
        addCyl(0.02, 0.02, 0.16, -W / 2 + 0.12, H + 0.08, 0, chrome, 10);
        break;
      }

      case 'wardrobe':
      case 'buffet':
      case 'shelf': {
        const wood = mat(baseCol, 0.58);
        addBox(W, H, D, 0, H / 2, 0, wood);
        const doors = Math.max(2, Math.round(W / 0.55));
        const dw = W / doors;
        for (let i = 0; i < doors; i++) {
          const x = -W / 2 + dw * (i + 0.5);
          addBox(0.016, Math.min(0.24, H * 0.2), 0.025, x + dw * 0.32, H * 0.52, D / 2 + 0.012, chrome);
        }
        break;
      }

      case 'desk': {
        const top = mat(baseCol, 0.48);
        const screen = mat('#191e24', 0.2, 0.3);
        addBox(W, 0.04, D, 0, H - 0.02, 0, top);
        addLegs(W - 0.06, D - 0.06, H - 0.04, 0.04, darkWood);
        addBox(0.54, 0.34, 0.03, 0, H + 0.25, -D * 0.25, screen);
        addBox(0.06, 0.1, 0.04, 0, H + 0.05, -D * 0.25, screen);
        break;
      }

      case 'nightstand': {
        addBox(W, H, D, 0, H / 2, 0, mat(baseCol, 0.55));
        addCyl(0.06, 0.07, 0.16, 0, H + 0.08, -D * 0.08, ceramic, 10);
        addCyl(0.09, 0.12, 0.16, 0, H + 0.22, -D * 0.08, mat('#f7ecd6', 0.85), 12);
        break;
      }

      case 'plantTall':
      case 'plantBush': {
        const r = Math.min(W, D) * 0.45;
        const potH = kind === 'plantTall' ? 0.38 : 0.26;
        const pot = mat('#c2855a', 0.78);
        const leaf1 = mat('#476b35', 0.88);
        const leaf2 = mat('#5c8244', 0.88);
        addCyl(r * 0.65, r * 0.48, potH, 0, potH / 2, 0, pot, 12);
        if (kind === 'plantTall') {
          addCyl(0.03, 0.04, H * 0.45, 0, potH + H * 0.2, 0, darkWood, 8);
        }
        const crownY = kind === 'plantTall' ? potH + H * 0.42 : potH + H * 0.28;
        const puffs = [[0, 0.12, 0, r * 0.95], [r * 0.45, -0.02, r * 0.25, r * 0.68], [-r * 0.42, 0.02, -r * 0.22, r * 0.72], [0.1, -0.05, -r * 0.4, r * 0.64]];
        puffs.forEach(([px, py, pz, pr], idx) => {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.08, pr), 1), idx % 2 ? leaf2 : leaf1);
          m.position.set(px, crownY + py, pz);
          m.castShadow = !ghost;
          g.add(m);
        });
        break;
      }

      case 'rug': {
        addBox(W, 0.015, D, 0, 0.008, 0, mat(baseCol, 0.96));
        break;
      }

      case 'lounger': {
        addBox(W, 0.14, D, 0, 0.22, 0, mat(baseCol, 0.82));
        addLegs(W - 0.08, D - 0.2, 0.16, 0.035, warmWood);
        const back = addBox(W - 0.04, 0.08, D * 0.32, 0, 0.38, -D * 0.34, mat('#f3efe6', 0.9));
        back.rotation.x = 0.42;
        break;
      }

      case 'car': {
        const body = mat(baseCol, 0.28, 0.45);
        const glass = mat('#22303c', 0.1, 0.6);
        const tire = mat('#1d2024', 0.9);
        addBox(W, H * 0.42, D * 0.96, 0, H * 0.38, 0, body);
        addBox(W * 0.84, H * 0.36, D * 0.48, 0, H * 0.74, -D * 0.05, glass);
        [[-W / 2 + 0.08, D * 0.3], [W / 2 - 0.08, D * 0.3], [-W / 2 + 0.08, -D * 0.3], [W / 2 - 0.08, -D * 0.3]].forEach(([wx, wz]) => {
          const wheel = addCyl(0.32, 0.32, 0.22, wx, 0.32, wz, tire, 14);
          wheel.rotation.z = Math.PI / 2;
        });
        break;
      }

      default: {
        addBox(W, H, D, 0, H / 2, 0, mat(baseCol, 0.65));
        break;
      }
    }

    const baseY = item.elev !== undefined
      ? Math.max(0, Number(item.elev) || 0)
      : (item.y !== undefined ? Math.max(0, Number(item.y) - H / 2) : 0);
    g.position.set(Number(item.x) || 0, baseY, Number(item.z) || 0);
    g.rotation.y = Number(item.rotY) || 0;
    g.userData = { nominalY: baseY, item, composite: true };
    return g;
  }

  window.Furniture3DBuilder = { build: buildFurnitureMesh3D, inferKind };

  // ===========================================================================
  // LIVE 3D VIEWPORT POUR L'ÉDITEUR (2D / 2D+3D / 3D EN TEMPS RÉEL)
  // ===========================================================================
  function createEditorLive3D() {
    const wrap = document.getElementById('ed-live3d-wrap');
    const host = document.getElementById('ed-live3d-canvas-host');
    const stageGrid = document.getElementById('ed-stage-grid');
    if (!wrap || !host || typeof window.THREE === 'undefined') return null;

    const THREE = window.THREE;
    let renderer = null;
    let scene = null;
    let camera = null;
    let modelRoot = null;
    let ghostGroup = null;
    let active = false;
    let mode = '2d'; // '2d' | 'split' | '3d'
    let rafId = 0;
    let dirtyGeometry = true;
    let lastSig = '';
    let contextLost = false;
    let furnPickables = [];

    const orbit = {
      yaw: Math.PI * 0.24,
      pitch: 0.72,
      dist: 17,
      target: new THREE.Vector3(0, 0.9, 0),
      dragging: false,
      panning: false,
      lx: 0,
      ly: 0,
      moved: false
    };

    const FLOOR_HEX = {
      parquet: 0xcba678,
      tiles: 0xdce2e4,
      stone: 0xc8c0b1,
      concrete: 0xbcbeb9
    };

    function initRenderer() {
      if (renderer) return;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      } catch {
        host.textContent = 'WebGL indisponible dans ce navigateur.';
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;

      host.replaceChildren(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      renderer.domElement.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        contextLost = true;
      });
      renderer.domElement.addEventListener('webglcontextrestored', () => {
        contextLost = false;
        dirtyGeometry = true;
      });

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf2efe8);
      scene.fog = new THREE.FogExp2(0xf2efe8, 0.011);

      camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180);

      // Éclairage studio 3 points (chaleureux et lisible)
      const hemi = new THREE.HemisphereLight(0xfdfaf3, 0xb8b2a6, 0.85);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff5e4, 0.95);
      sun.position.set(14, 22, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 65;
      const d = 18;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0008;
      scene.add(sun);

      const rim = new THREE.DirectionalLight(0xd9e6f2, 0.35);
      rim.position.set(-14, 10, -14);
      scene.add(rim);

      // Sol de référence + grille discrète
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(140, 140),
        new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      ground.receiveShadow = true;
      scene.add(ground);

      const grid = new THREE.GridHelper(60, 60, 0xc4beb2, 0xd9d4ca);
      grid.position.y = -0.01;
      scene.add(grid);

      modelRoot = new THREE.Group();
      scene.add(modelRoot);
      ghostGroup = new THREE.Group();
      scene.add(ghostGroup);

      bindOrbitEvents(renderer.domElement);
    }

    function updateCamera() {
      if (!camera) return;
      const cp = Math.cos(orbit.pitch);
      camera.position.set(
        orbit.target.x + orbit.dist * cp * Math.sin(orbit.yaw),
        orbit.target.y + orbit.dist * Math.sin(orbit.pitch),
        orbit.target.z + orbit.dist * cp * Math.cos(orbit.yaw)
      );
      camera.lookAt(orbit.target);
    }

    function bindOrbitEvents(dom) {
      const raycaster = new THREE.Raycaster();
      dom.addEventListener('contextmenu', e => e.preventDefault());
      dom.addEventListener('mousedown', e => {
        orbit.dragging = true;
        orbit.panning = e.button === 2 || e.shiftKey;
        orbit.lx = e.clientX;
        orbit.ly = e.clientY;
        orbit.moved = false;
      });
      window.addEventListener('mousemove', e => {
        if (!orbit.dragging) return;
        const dx = e.clientX - orbit.lx;
        const dy = e.clientY - orbit.ly;
        orbit.lx = e.clientX;
        orbit.ly = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) orbit.moved = true;
        if (orbit.panning) {
          const panScale = orbit.dist * 0.0018;
          const right = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
          const fwd = new THREE.Vector3(-Math.sin(orbit.yaw), 0, -Math.cos(orbit.yaw));
          orbit.target.addScaledVector(right, -dx * panScale);
          orbit.target.addScaledVector(fwd, dy * panScale);
        } else {
          orbit.yaw -= dx * 0.0075;
          orbit.pitch = Math.max(0.14, Math.min(1.48, orbit.pitch + dy * 0.0065));
        }
        updateCamera();
      });
      window.addEventListener('mouseup', () => { orbit.dragging = false; });
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        orbit.dist = Math.max(3.5, Math.min(60, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.91)));
        updateCamera();
      }, { passive: false });

      // Clic sur un meuble 3D -> sélection immédiate dans l'éditeur 2D !
      dom.addEventListener('click', e => {
        if (orbit.moved || !camera || !furnPickables.length || !window.EditorAPI) return;
        const rect = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(furnPickables, true);
        if (!hits.length) return;
        let obj = hits[0].object;
        while (obj && !obj.userData?.editorRef) obj = obj.parent;
        if (obj?.userData?.editorRef) {
          window.EditorAPI.select({ kind: 'furniture', obj: obj.userData.editorRef });
        }
      });
    }

    function disposeGroup(group) {
      while (group.children.length) {
        const child = group.children.pop();
        child.traverse?.(o => {
          if (o.geometry) o.geometry.dispose?.();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
            else o.material.dispose?.();
          }
        });
      }
    }

    function rebuildScene() {
      if (!scene || !modelRoot || !window.EditorAPI) return;
      const E = window.EditorAPI;
      const S = E.S;
      if (!S || !S.p) return;

      disposeGroup(modelRoot);
      furnPickables = [];

      const wallH = Number(S.p.config?.wallHeight) || 2.8;
      const floorH = Number(S.p.config?.floorHeight) || 3.0;
      const extWallMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.78 });
      const intWallMat = new THREE.MeshStandardMaterial({ color: 0xeae6de, roughness: 0.84 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x9ac6dc, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.34 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x9c7852, roughness: 0.55 });
      const entryDoorMat = new THREE.MeshStandardMaterial({ color: 0x5d3f28, roughness: 0.48 });
      const colMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d7, roughness: 0.7 });

      const levelsToDraw = S.activeLevel === 1 ? [0, 1] : [0];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const track = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };

      levelsToDraw.forEach(lvl => {
        const ld = S.levelData?.[lvl];
        if (!ld) return;
        const y0 = lvl * floorH;

        // Sols des pièces
        (ld.rooms || []).forEach(r => {
          const mat = new THREE.MeshStandardMaterial({ color: FLOOR_HEX[r.floorType] || 0xcba678, roughness: 0.82 });
          if (Array.isArray(r.poly) && r.poly.length >= 3) {
            const shape = new THREE.Shape();
            r.poly.forEach((p, i) => {
              track(p[0], p[1]);
              if (i === 0) shape.moveTo(p[0], -p[1]);
              else shape.lineTo(p[0], -p[1]);
            });
            shape.closePath();
            const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = y0 + 0.012;
            mesh.receiveShadow = true;
            modelRoot.add(mesh);
          } else if (r.bounds) {
            const b = r.bounds;
            track(b.xMin, b.zMin); track(b.xMax, b.zMax);
            const w = Math.max(0.1, b.xMax - b.xMin), d = Math.max(0.1, b.zMax - b.zMin);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat);
            mesh.position.set((b.xMin + b.xMax) / 2, y0 - 0.008, (b.zMin + b.zMax) / 2);
            mesh.receiveShadow = true;
            modelRoot.add(mesh);
          }
        });

        // Murs avec vraies découpes de portes et fenêtres
        (ld.walls || []).forEach(w => {
          track(w.from[0], w.from[1]); track(w.to[0], w.to[1]);
          const dx = w.to[0] - w.from[0], dz = w.to[1] - w.from[1];
          const L = Math.hypot(dx, dz);
          if (L < 0.05) return;
          const angle = Math.atan2(dz, dx);
          const ux = dx / L, uz = dz / L;
          const thick = Number(w.thick) || (w.type === 'ext' ? 0.25 : 0.15);
          const isSelWall = S.sel?.kind === 'wall' && S.sel.obj === w;
          const wMat = isSelWall
            ? new THREE.MeshStandardMaterial({ color: 0xd9a14a, roughness: 0.65 })
            : (w.type === 'ext' ? extWallMat : intWallMat);

          const addSeg = (s0, s1, bY, segH, m = wMat) => {
            const segL = s1 - s0;
            if (segL < 0.02 || segH < 0.02) return;
            const mid = (s0 + s1) / 2;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(segL, segH, thick), m);
            mesh.position.set(w.from[0] + ux * mid, y0 + bY + segH / 2, w.from[1] + uz * mid);
            mesh.rotation.y = -angle;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            modelRoot.add(mesh);
          };

          const ops = (w.openings || []).slice().sort((a, b) => a.at - b.at);
          let cursor = 0;
          ops.forEach(op => {
            const s = Math.max(cursor, op.at - op.w / 2);
            const e = Math.min(L, op.at + op.w / 2);
            if (s > cursor) addSeg(cursor, s, 0, wallH);
            const sill = Math.max(0, Number(op.sill) || 0);
            const oh = Math.min(wallH - sill, Number(op.h) || (op.type === 'window' ? 1.25 : 2.1));
            if (sill > 0.02) addSeg(s, e, 0, sill);
            if (wallH - (sill + oh) > 0.02) addSeg(s, e, sill + oh, wallH - (sill + oh));
            // Vitrage ou vantail
            const mid = (s + e) / 2;
            if (op.type === 'window' || op.type === 'bay') {
              const pane = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, e - s), oh, 0.03), glassMat);
              pane.position.set(w.from[0] + ux * mid, y0 + sill + oh / 2, w.from[1] + uz * mid);
              pane.rotation.y = -angle;
              modelRoot.add(pane);
            } else if (op.type === 'door') {
              // Vantail entrouvert à 35° pour lisibilité architecturale
              const leafW = Math.max(0.4, e - s);
              const hingeAt = op.hinge === 'end' ? e : s;
              const pivot = new THREE.Group();
              pivot.position.set(w.from[0] + ux * hingeAt, y0, w.from[1] + uz * hingeAt);
              const sgn = op.hinge === 'end' ? -1 : 1;
              const side = op.side || 1;
              pivot.rotation.y = -angle - side * sgn * 0.58;
              const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, oh, 0.045), op.entry ? entryDoorMat : doorMat);
              leaf.position.set((sgn * leafW) / 2, oh / 2, 0);
              leaf.castShadow = true;
              pivot.add(leaf);
              modelRoot.add(pivot);
            }
            cursor = Math.max(cursor, e);
          });
          if (cursor < L) addSeg(cursor, L, 0, wallH);
        });

        // Colonnes
        (ld.columns || []).forEach(c => {
          const sz = Number(c.size) || 0.35;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, wallH, sz), colMat);
          mesh.position.set(c.x, y0 + wallH / 2, c.z);
          mesh.castShadow = mesh.receiveShadow = true;
          modelRoot.add(mesh);
        });

        // Auvents & Pergolas
        (ld.canopies || []).forEach(c => {
          const cw = Math.max(0.2, c.xMax - c.xMin), cd = Math.max(0.2, c.zMax - c.zMin);
          const cy = y0 + (Number(c.y) || wallH);
          const cx = (c.xMin + c.xMax) / 2, cz = (c.zMin + c.zMax) / 2;
          if (c.type === 'pergola') {
            const slatMat = new THREE.MeshStandardMaterial({ color: c.color || '#5a4a3a', roughness: 0.72 });
            const gap = Number(c.gap) || 0.3;
            for (let x = c.xMin + 0.1; x < c.xMax - 0.05; x += gap) {
              const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, cd), slatMat);
              s.position.set(x, cy, cz);
              s.castShadow = true;
              modelRoot.add(s);
            }
          } else {
            const slab = new THREE.Mesh(new THREE.BoxGeometry(cw, Number(c.thick) || 0.18, cd), new THREE.MeshStandardMaterial({ color: c.color || '#f1eee8', roughness: 0.75 }));
            slab.position.set(cx, cy, cz);
            slab.castShadow = slab.receiveShadow = true;
            modelRoot.add(slab);
          }
        });

        // Mobilier 3D détaillé en temps réel !
        (ld.furniture || []).forEach(f => {
          track(f.x, f.z);
          const sel = S.sel?.kind === 'furniture' && S.sel.obj === f;
          const group = buildFurnitureMesh3D(THREE, f, { selected: sel });
          group.position.y += y0;
          group.userData.editorRef = f;
          modelRoot.add(group);
          furnPickables.push(group);
        });
      });

      // Cadre automatiquement la cible si le projet vient d'être chargé
      if (isFinite(minX) && !orbit._userMoved) {
        orbit.target.set((minX + maxX) / 2, 0.9, (minZ + maxZ) / 2);
        const span = Math.max(6, Math.hypot(maxX - minX, maxZ - minZ));
        orbit.dist = Math.max(7, Math.min(34, span * 1.18));
        updateCamera();
      }
    }

    function updateGhost(previewItem) {
      if (!active || !ghostGroup || !THREE) return;
      disposeGroup(ghostGroup);
      if (!previewItem) return;
      const lvlY = (window.EditorAPI?.S?.activeLevel || 0) * (Number(window.EditorAPI?.S?.p?.config?.floorHeight) || 3);
      const mesh = buildFurnitureMesh3D(THREE, previewItem, { ghost: true });
      mesh.position.y += lvlY;
      ghostGroup.add(mesh);
    }

    function resize() {
      if (!active || !renderer || !camera) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }

    function tick() {
      if (!active) return;
      rafId = requestAnimationFrame(tick);
      if (contextLost || !renderer || !scene || !camera) return;
      if (dirtyGeometry) {
        dirtyGeometry = false;
        rebuildScene();
      }
      renderer.render(scene, camera);
    }

    function computeSig() {
      const S = window.EditorAPI?.S;
      if (!S?.p) return '';
      const selId = S.sel ? `${S.sel.kind}:${S.sel.obj?.x ?? ''}:${S.sel.obj?.z ?? ''}:${S.sel.obj?.rotY ?? ''}` : '';
      return JSON.stringify([
        S.activeLevel,
        S.p.config?.wallHeight,
        S.levelData?.[0]?.walls,
        S.levelData?.[0]?.rooms,
        S.levelData?.[0]?.furniture,
        S.levelData?.[0]?.columns,
        S.levelData?.[0]?.canopies,
        S.levelData?.[1]?.walls,
        S.levelData?.[1]?.rooms,
        S.levelData?.[1]?.furniture,
        selId
      ]);
    }

    function sync(force = false) {
      if (!active) return;
      const sig = computeSig();
      if (force || sig !== lastSig) {
        lastSig = sig;
        dirtyGeometry = true;
      }
    }

    function setMode(nextMode) {
      if (!['2d', 'split', '3d'].includes(nextMode)) return;
      mode = nextMode;
      if (stageGrid) stageGrid.dataset.view = mode;
      wrap.hidden = mode === '2d';
      active = mode !== '2d';

      document.querySelectorAll('[data-view-mode]').forEach(btn => {
        const isCurrent = btn.dataset.viewMode === mode;
        btn.classList.toggle('active', isCurrent);
        btn.setAttribute('aria-pressed', String(isCurrent));
      });

      if (active) {
        initRenderer();
        orbit._userMoved = false;
        lastSig = '';
        dirtyGeometry = true;
        requestAnimationFrame(() => {
          resize();
          updateCamera();
          if (!rafId) tick();
        });
      } else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      if (typeof window.EditorAPI?.draw === 'function') {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }
    }

    function setCameraPreset(preset) {
      if (!camera) return;
      orbit._userMoved = true;
      if (preset === 'iso') {
        orbit.yaw = Math.PI * 0.24;
        orbit.pitch = 0.68;
      } else if (preset === 'top') {
        orbit.yaw = 0;
        orbit.pitch = 1.46;
      } else if (preset === 'eye') {
        orbit.yaw = Math.PI * 0.15;
        orbit.pitch = 0.24;
        orbit.dist = Math.max(5.5, Math.min(11, orbit.dist));
      }
      updateCamera();
    }

    window.addEventListener('resize', () => { if (active) resize(); });

    // Branchement des boutons de caméra 3D dans le bandeau flottant 3D
    document.querySelectorAll('[data-live3d-cam]').forEach(btn => {
      btn.addEventListener('click', () => setCameraPreset(btn.dataset.live3dCam));
    });

    return { setMode, getMode: () => mode, sync, updateGhost, setCameraPreset, resize };
  }

  window.EditorLive3D = null;
  window.addEventListener('DOMContentLoaded', () => {
    window.EditorLive3D = createEditorLive3D();
  });
})();
