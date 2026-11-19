/**
 * LECTURE AUTOMATIQUE DU PLAN PAR IA (OpenRouter, via le relais local /api/ai/chat de serve.js)
 * Le modèle renvoie la géométrie en pixels de l'image ; on la convertit en mètres puis on la
 * « nettoie » : murs d'équerre, coordonnées regroupées, ouvertures posées sur le mur le plus proche.
 * Le résultat est un premier jet à corriger dans l'éditeur (Ctrl+Z annule la lecture).
 */
(() => {
  const E = window.EditorAPI;
  const $ = id => document.getElementById(id);

  // Modèles vision recommandés (prix OpenRouter du 18/11/2026, par million de tokens)
  const MODELS = [
    { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 — recommandé (≈ 0,05 $/plan)' },
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash — rapide (≈ 0,04 $/plan)' },
    { id: 'openai/gpt-6.2-sol', label: 'GPT-6.2 Sol — alternative (≈ 0,05 $/plan)' },
    { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna — très économique (< 0,01 $/plan)' },
    { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5 — plans difficiles (≈ 0,10 $/plan)' }
  ];

  const FURN_MAP = {
    sofa: 'Canapé 3 places', armchair: 'Fauteuil', coffee_table: 'Table basse', dining_table: 'Table à manger', chair: 'Chaise',
    bed_double: 'Lit double 160', bed_single: 'Lit simple 90', nightstand: 'Chevet', wardrobe: 'Armoire', kitchen_counter: 'Plan de travail',
    fridge: 'Réfrigérateur', toilet: 'Cuvette WC', sink: 'Lave-mains', shower: 'Douche', bathtub: 'Baignoire', tv_unit: 'Meuble TV',
    plant: 'Plante', desk: 'Bureau', shelves: 'Étagères', sideboard: 'Buffet', rug: 'Tapis'
  };

  const INSTRUCTIONS = (W, H, withFurniture) => `You are an expert architect reading a 2D residential floor plan image (${W} × ${H} pixels).
Extract its geometry precisely. Return ONLY one JSON object, no prose, with this exact shape:
{
  "scale": { "px_per_meter": number or null, "reference": "the dimension annotation you used, e.g. '11.50 m between x=22 and x=575'" },
  "walls": [ { "x1": n, "y1": n, "x2": n, "y2": n, "kind": "exterior" | "interior" } ],
  "openings": [ { "kind": "door" | "window" | "opening", "x": n, "y": n, "width": n } ],
  "rooms": [ { "name": "label as written on the plan", "polygon": [[x, y], ...], "floor": "parquet" | "tiles" | "stone" | "concrete", "habitable": true | false } ],
  "columns": [ { "x": n, "y": n, "size": n } ]${withFurniture ? `,
  "furniture": [ { "type": "${Object.keys(FURN_MAP).join('" | "')}", "x": n, "y": n, "width": n, "depth": n, "rotation": 0 | 90 | 180 | 270 } ]` : ''}
}
Rules:
- All coordinates are PIXELS of the given image: origin top-left, x to the right, y downwards. Be precise to a few pixels.
- Walls: the CENTERLINE of every wall. One entry per straight run between corners/junctions. A wall runs continuously THROUGH its doors and windows (do not split it at openings). Exterior walls form the thick outer perimeter; interior walls are the thinner partitions. Horizontal walls must have y1 = y2, vertical walls x1 = x2.
- Openings: every door (swing arc symbol), every window (thin parallel lines inside a wall) and every wide passage without door. (x, y) is the opening CENTER on the wall centerline; width is its size along the wall, in pixels.
- Rooms: every labelled space, including covered exterior spaces (porch, terrace: habitable false). The polygon follows the wall centerlines around the room, in order. Use "tiles" for kitchens, bathrooms and WC, "stone" for porches and terraces, "parquet" otherwise.
- Columns: square posts or pillars (often small filled squares), center and side length in pixels.
- Scale: if dimension annotations exist (e.g. "4.00 m", "11,50"), compute px_per_meter from the longest one you can locate precisely. Otherwise estimate it assuming interior doors are 0.85 m wide.${withFurniture ? '\n- Furniture: only items actually drawn on the plan. rotation = direction the FRONT of the item faces: 0 = down, 90 = right, 180 = up, 270 = left (beds: the foot of the bed; sofas: the seat side). width is along the front, depth front-to-back, in pixels.' : ''}`;

  // ---------------------------------------------------------------------------
  // Préparation de l'image (réduite à 1600 px de côté)
  // ---------------------------------------------------------------------------
  function prepareImage() {
    const img = E.S.planImg;
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), W: c.width, H: c.height, factor: img.width / c.width };
  }

  function parseJson(text) {
    const s = String(text || ''); // tolère un bloc ```json … ``` ou du texte autour
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Réponse sans JSON exploitable');
    return JSON.parse(s.slice(a, b + 1));
  }

  // ---------------------------------------------------------------------------
  // Conversion pixels → mètres + nettoyage géométrique
  // ---------------------------------------------------------------------------
  function cluster1D(values, tol) {
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array(values.length);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const mean = group.reduce((s, g) => s + g.v, 0) / group.length;
      group.forEach(g => { out[g.i] = E.round(mean, 0.05); });
      group = [];
    };
    sorted.forEach(it => {
      if (group.length && it.v - group[group.length - 1].v > tol) flush();
      group.push(it);
    });
    flush();
    return out;
  }

  function convert(ai, img, opts) {
    const S = E.S;
    const pi = S.p.config.planImage;
    let ppm; // pixels de l'image ORIGINALE par mètre
    if (opts.scale === 'calibrated' && pi && pi.pxPerMeter) ppm = pi.pxPerMeter;
    else if (ai.scale && ai.scale.px_per_meter > 0) ppm = ai.scale.px_per_meter * img.factor;
    else throw new Error('Échelle introuvable : calibrez le plan (K) puis relancez avec « Celle que j\'ai calibrée »');
    const origin = (pi && pi.originPx) || [E.S.planImg.width / 2, E.S.planImg.height / 2];
    const X = px => (px * img.factor - origin[0]) / ppm;
    const Z = py => (py * img.factor - origin[1]) / ppm;

    // Murs en mètres, remis d'équerre
    let walls = (ai.walls || []).map(w => {
      let a = [X(w.x1), Z(w.y1)], b = [X(w.x2), Z(w.y2)];
      const dx = Math.abs(b[0] - a[0]), dz = Math.abs(b[1] - a[1]);
      if (dz < 0.12 * dx) { const z = (a[1] + b[1]) / 2; a[1] = b[1] = z; }
      else if (dx < 0.12 * dz) { const x = (a[0] + b[0]) / 2; a[0] = b[0] = x; }
      return { from: a, to: b, ext: w.kind === 'exterior' };
    });

    // Regroupement des coordonnées par axe (murs + pièces + colonnes) : supprime les décalages de quelques cm
    const rooms = (ai.rooms || []).filter(r => Array.isArray(r.polygon) && r.polygon.length >= 3)
      .map(r => Object.assign({}, r, { pts: r.polygon.map(p => [X(p[0]), Z(p[1])]) }));
    const xs = [], zs = [], refs = [];
    walls.forEach(w => { [w.from, w.to].forEach(p => { refs.push(p); xs.push(p[0]); zs.push(p[1]); }); });
    rooms.forEach(r => r.pts.forEach(p => { refs.push(p); xs.push(p[0]); zs.push(p[1]); }));
    const cx = cluster1D(xs, 0.18), cz = cluster1D(zs, 0.18);
    refs.forEach((p, i) => { p[0] = cx[i]; p[1] = cz[i]; });

    // Murs : longueur minimale, doublons
    const seen = new Set();
    walls = walls.filter(w => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) >= 0.2).filter(w => {
      const key = [w.from, w.to].map(p => p.join(',')).sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(w => ({ from: w.from, to: w.to, thick: w.ext ? 0.25 : 0.15, type: w.ext ? 'ext' : 'int', openings: [] }));

    // Ouvertures sur le mur le plus proche
    let entrySet = false;
    const doors = [];
    (ai.openings || []).forEach(o => {
      const pt = { x: X(o.x), z: Z(o.y) };
      let best = null;
      walls.forEach(w => {
        const pr = E.projectOnWall(w, pt);
        if (pr.dist < 0.6 && (!best || pr.dist < best.pr.dist)) best = { w, pr };
      });
      if (!best) return;
      const kind = o.kind === 'door' ? 'door' : o.kind === 'window' ? 'window' : 'open';
      const def = Object.assign({}, E.OPENINGS[kind]);
      def.w = Math.max(0.5, Math.min(4, E.round((o.width || 0) * img.factor / ppm, 0.05) || def.w));
      const L = E.wallLen(best.w);
      if (L < def.w + 0.05) return;
      def.at = E.r2(Math.max(def.w / 2, Math.min(L - def.w / 2, E.round(best.pr.at, 0.05))));
      if (best.w.openings.some(x => Math.abs(x.at - def.at) < (x.w + def.w) / 2)) return; // chevauchement
      best.w.openings.push(def);
      if (kind === 'door' && best.w.type === 'ext') doors.push(def);
    });
    if (doors.length) { doors.sort((a, b) => b.w - a.w)[0].entry = true; entrySet = true; }

    // Pièces : rectangle → bounds, sinon polygone (bounds = emprise)
    const used = new Set(S.p.rooms.map(r => r.id));
    const outRooms = rooms.map((r, i) => {
      const xsR = r.pts.map(p => p[0]), zsR = r.pts.map(p => p[1]);
      const bounds = { xMin: Math.min(...xsR), xMax: Math.max(...xsR), zMin: Math.min(...zsR), zMax: Math.max(...zsR) };
      let id = E.slugify(r.name || 'piece-' + (i + 1));
      while (used.has(id)) id += '-2';
      used.add(id);
      const room = { id, name: String(r.name || 'PIÈCE ' + (i + 1)).toUpperCase(), bounds, floorType: r.floor || 'parquet', habitable: r.habitable !== false, desc: '' };
      const uniq = r.pts.filter((p, j, a) => j === 0 || p[0] !== a[j - 1][0] || p[1] !== a[j - 1][1]);
      const isRect = uniq.length <= 5 && uniq.every(p => (p[0] === bounds.xMin || p[0] === bounds.xMax) && (p[1] === bounds.zMin || p[1] === bounds.zMax));
      if (!isRect) room.poly = uniq;
      return room;
    }).filter(r => r.bounds.xMax - r.bounds.xMin > 0.4 && r.bounds.zMax - r.bounds.zMin > 0.4);

    const columns = (ai.columns || []).map(c => {
      const size = Math.max(0.15, Math.min(0.8, E.round((c.size || 0) * img.factor / ppm, 0.05) || 0.3));
      return { name: 'Colonne', x: E.round(X(c.x), 0.05), z: E.round(Z(c.y), 0.05), size, base: E.r2(size + 0.15), capital: E.r2(size + 0.15) };
    });

    const furniture = opts.furniture ? (ai.furniture || []).map(f => {
      const lib = E.FURNITURE.find(it => it.name === FURN_MAP[f.type]);
      if (!lib) return null;
      const rot = ((Math.round((f.rotation || 0) / 90) % 4) + 4) % 4;
      const w = E.round((f.width || 0) * img.factor / ppm, 0.05) || lib.w;
      const d = E.round((f.depth || 0) * img.factor / ppm, 0.05) || lib.d;
      const item = { name: lib.name, x: E.round(X(f.x), 0.05), z: E.round(Z(f.y), 0.05), w, d, h: lib.h, elev: lib.elev || 0, color: lib.color, rotY: E.r2(rot * Math.PI / 2 * 10000) / 10000, dims: 'local' };
      if (lib.model) item.model = lib.model;
      return item;
    }).filter(Boolean) : [];

    return { walls, rooms: outRooms, columns, furniture, ppm, entrySet, reference: ai.scale && ai.scale.reference };
  }

  // ---------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------
  const sel = $('ai-model');
  sel.innerHTML = MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
  try { const saved = localStorage.getItem('ed-ai-model'); if (MODELS.some(m => m.id === saved)) sel.value = saved; } catch (e) { /* stockage indisponible */ }
  function updateCostEstimate() {
    const selected = MODELS.find(model => model.id === sel.value);
    $('ai-cost-estimate').textContent = selected
      ? `Estimation préalable pour un plan : ${selected.label.split('—').pop().trim()}. Le coût réel dépend de la taille du plan et de la réponse ; il sera affiché après l’appel.`
      : '';
  }
  sel.addEventListener('change', updateCostEstimate);
  updateCostEstimate();

  $('btn-ai-read').onclick = async () => {
    const S = E.S;
    if (!S.planImg) { E.toast('Importez d\'abord l\'image du plan', true); return; }
    $('ai-scale').value = S.p.config.planImage && S.p.config.planImage.calibrated ? 'calibrated' : 'ai';
    $('ai-mode').value = S.p.walls.length ? 'merge' : 'replace';
    $('ai-status').textContent = 'Vérification de la clé OpenRouter…';
    $('dlg-ai').showModal();
    try {
      const st = await (await fetch('api/ai/status')).json();
      $('ai-status').textContent = st.configured ? 'Clé OpenRouter détectée sur le serveur local ✓'
        : 'Aucune clé : définissez la variable OPENROUTER_API_KEY (voir README) puis relancez start.bat.';
      $('ai-run').disabled = !st.configured;
    } catch (e) {
      $('ai-status').textContent = 'Serveur local indisponible : lancez start.bat.';
      $('ai-run').disabled = true;
    }
  };
  $('ai-cancel').onclick = () => $('dlg-ai').close();

  $('ai-run').onclick = async () => {
    const S = E.S;
    const model = sel.value;
    const selectedModel = MODELS.find(item => item.id === model);
    const estimate = selectedModel ? selectedModel.label.split('—').pop().trim() : 'estimation indisponible';
    if (!confirm(`Lancer la lecture IA du plan avec ${model} ?\n\nEstimation préalable : ${estimate}. Le coût réel dépend de l’image et de la réponse et sera indiqué après l’appel.\n\nCette requête OpenRouter est facturable. Confirmer ?`)) return;
    try { localStorage.setItem('ed-ai-model', model); } catch (e) { /* stockage indisponible */ }
    const opts = { scale: $('ai-scale').value, furniture: $('ai-furniture').checked, mode: $('ai-mode').value };
    const img = prepareImage();
    $('ai-run').disabled = true;
    const t0 = performance.now();
    $('ai-status').textContent = `Analyse du plan par ${model}… (20 à 90 s)`;
    try {
      const res = await fetch('api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 12000,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: INSTRUCTIONS(img.W, img.H, opts.furniture) },
            { type: 'image_url', image_url: { url: img.dataUrl } }
          ] }]
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error((data.error && (data.error.message || data.error)) || `HTTP ${res.status}`);
      const ai = parseJson(data.choices[0].message.content);
      const out = convert(ai, img, opts);
      applyResult(out, opts);
      const cost = data.usage && data.usage.cost !== undefined ? ` · coût ${Number(data.usage.cost).toFixed(3)} $` : '';
      const secs = ((performance.now() - t0) / 1000).toFixed(0);
      $('ai-status').textContent = `✓ ${out.walls.length} murs, ${out.walls.reduce((s, w) => s + w.openings.length, 0)} ouvertures, ${out.rooms.length} pièces, ${out.furniture.length} meubles en ${secs} s${cost}.` + (out.reference ? ` Échelle : ${out.reference}.` : '');
      E.toast('Lecture IA appliquée — vérifiez et corrigez (Ctrl+Z pour annuler)');
      setTimeout(() => $('dlg-ai').close(), 2500);
    } catch (e) {
      $('ai-status').textContent = '✗ ' + e.message;
    } finally {
      $('ai-run').disabled = false;
    }
  };

  function applyResult(out, opts) {
    const S = E.S;
    E.commit();
    const pi = S.p.config.planImage;
    if (opts.scale === 'ai' && pi) { pi.pxPerMeter = Math.round(out.ppm * 100) / 100; pi.originPx = pi.originPx || [S.planImg.width / 2, S.planImg.height / 2]; }
    if (opts.mode === 'replace') { S.p.walls = []; S.p.rooms = []; S.p.columns = []; S.p.furniture = []; }
    if (out.entrySet) S.p.walls.forEach(w => w.openings.forEach(o => { delete o.entry; }));
    S.p.walls.push(...out.walls);
    S.p.rooms.push(...out.rooms);
    S.p.columns.push(...out.columns);
    S.p.furniture.push(...out.furniture);
    S.sel = null;
    E.fitView();
    E.refreshPanel();
    E.draw();
  }

  // Exposé pour les tests (conversion sans appel réseau)
  window.EditorAI = { convert, applyResult, prepareImage, INSTRUCTIONS };
})();
