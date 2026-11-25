/**
 * CONTRÔLE DE FIDÉLITÉ D'UN RENDU IA FACE À SA VUE 3D DE RÉFÉRENCE (local, gratuit, déterministe)
 *
 * Idée : l'IA a le droit de changer les matières et la lumière, pas les lignes de l'architecture.
 * 1. Les deux images sont ramenées à la même petite taille, en niveaux de gris.
 * 2. On garde les lignes fortes de la référence (arêtes de murs, baies, plafonds) et celles du rendu IA,
 *    chacune avec son orientation (4 classes : horizontale, verticale, deux diagonales).
 * 3. Une ligne de référence est « retrouvée » si le rendu IA a une ligne de même orientation (ou voisine)
 *    à moins de `tolerance` pixels. Un léger décalage global de cadrage est cherché puis signalé.
 * 4. Le taux brut est corrigé du hasard : une image chargée de textures couvre beaucoup de pixels et
 *    retrouverait des lignes par chance. score = (retrouvé − hasard) / (1 − hasard), borné à [0, 1].
 *
 * Ce score est un garde-fou, pas une preuve : il repère les caméras déplacées, les baies inventées ou
 * supprimées, les volumes modifiés. Le contrôle visuel par l'architecte reste nécessaire.
 */
const FidelityCheck = (() => {
  const VERSION = 2;
  const WIDTH = 320;
  // Seuils calibrés sur residence-verandas :
  // - 22/11/2026 (v1) : 5 rendus intérieurs (0,47–0,83), 9 paires croisées (0,06–0,27), perspective 03 (0,09).
  // - 24/11/2026 (v2, grille 3×3) : corpus élargi de 23 paires (8 fidèles vérifiés visuellement : pire tuile
  //   0,357–0,884, ajout inverse ≥ 0,150 ou absent ; infidèles ciblés : b2 suppression arbre/meneau à 0,302,
  //   c2 porte supprimée à 0,000, c1 fenêtre ajoutée sur mur nu à 0,000 en inverse, et photor-sejour-etage
  //   qui supprime deux portes / invente une baie 4 vantaux à 0,229 / 0,000).
  const THRESHOLDS = { faithful: 0.45, review: 0.3, tileFaithful: 0.32, tileReview: 0.15, addedFaithful: 0.1 };
  const REF_SHARE = 0.08;  // part des pixels de référence retenus comme lignes fortes
  const AI_SHARE = 0.12;   // part des pixels IA retenus (plus large : textures et ombres en plus)
  const TILE_SHARE = 0.1;  // part minimale d'arêtes dans une tuile 3×3 pour qu'elle soit évaluée
  const MAX_SHIFT = 0.02;  // décalage de cadrage toléré, en part de la largeur

  function toGray(rgba, width, height) {
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    return gray;
  }

  function blur(src, w, h) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += src[yy * w + xx]; n++; }
      }
      out[y * w + x] = sum / n;
    }
    return out;
  }

  /** Gradient de Sobel (magnitude, classe d'orientation 0..3 et histogramme) calculé en une passe. */
  function sobelData(gray, w, h) {
    const g = blur(gray, w, h);
    const mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
    let max = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > max) max = m;
      // Orientation de la ligne (perpendiculaire au gradient), repliée sur [0, 180[ puis en 4 classes.
      const angle = (Math.atan2(gy, gx) * 180 / Math.PI + 90 + 360) % 180;
      dir[i] = Math.round(angle / 45) % 4;
    }
    const bins = 1024, hist = new Uint32Array(bins);
    if (max > 0) for (let i = 0; i < mag.length; i++) hist[Math.min(bins - 1, Math.floor(mag[i] / max * bins))]++;
    return { mag, dir, hist, bins, max };
  }

  function maskFromSobel(s, w, h, share) {
    const target = Math.max(1, Math.round(w * h * share));
    let count = 0, cut = s.bins;
    while (cut > 0 && count < target) count += s.hist[--cut];
    const threshold = Math.max(cut / s.bins * s.max, 1e-6);
    const mask = new Uint8Array(w * h); // 0 = pas de ligne, sinon classe + 1
    const m = 2; // bord ignoré
    for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      if (s.mag[i] >= threshold) mask[i] = s.dir[i] + 1;
    }
    return mask;
  }

  /** Lignes fortes : les `share` pixels de plus fort gradient (Sobel), avec leur classe d'orientation 0..3. */
  function edges(gray, w, h, share) {
    return maskFromSobel(sobelData(gray, w, h), w, h, share);
  }

  /** Segments droits horizontaux (1) et verticaux (3) d'au moins `minRun` px : filtre feuillage et grain. */
  function straightHV(mask, w, h, minRun) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (mask[y * w + x] === 1) {
          let end = x;
          while (end < w && mask[y * w + end] === 1) end++;
          if (end - x >= minRun) for (let k = x; k < end; k++) out[y * w + k] = 1;
          x = end;
        } else x++;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (mask[y * w + x] === 3) {
          let end = y;
          while (end < h && mask[end * w + x] === 3) end++;
          if (end - y >= minRun) for (let k = y; k < end; k++) out[k * w + x] = 3;
          y = end;
        } else y++;
      }
    }
    return out;
  }

  /** Distance de chanfrein (3-4) aux pixels de classe `cls` ou voisine, en pixels. */
  function distanceTo(mask, w, h, cls) {
    const INF = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) {
      const c = mask[i] - 1;
      d[i] = c >= 0 && (c === cls || c === (cls + 1) % 4 || c === (cls + 3) % 4) ? 0 : INF;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
  }

  function verdictOf(score, worstTile = null, addedTile = null) {
    let v = score >= THRESHOLDS.faithful ? 'faithful' : score >= THRESHOLDS.review ? 'review' : 'unfaithful';
    if (worstTile) {
      if (worstTile.score < THRESHOLDS.tileReview) v = 'unfaithful';
      else if (worstTile.score < THRESHOLDS.tileFaithful && v === 'faithful') v = 'review';
    }
    if (addedTile && addedTile.score < THRESHOLDS.addedFaithful && v === 'faithful') v = 'review';
    return v;
  }

  /**
   * Compare deux images en niveaux de gris de même taille.
   * @returns {{ score:number, recall:number, chance:number, shift:{x:number,y:number}, worstTile?:object, addedTile?:object, verdict:string, version:number }}
   */
  function compareGray(refGray, aiGray, w, h) {
    const tolerance = Math.max(2, Math.round(w / 100));
    const refMask = edges(refGray, w, h, REF_SHARE);
    const aiSobel = sobelData(aiGray, w, h);
    const aiMask = maskFromSobel(aiSobel, w, h, AI_SHARE);
    const dist = [0, 1, 2, 3].map(cls => distanceTo(aiMask, w, h, cls));

    const points = [];
    for (let i = 0; i < refMask.length; i++) if (refMask[i]) points.push(i);
    if (!points.length) return { score: 0, recall: 0, chance: 0, shift: { x: 0, y: 0 }, worstTile: null, verdict: 'review', version: VERSION, empty: true };

    // Hasard : part de l'image où une ligne de cette orientation serait « retrouvée » sans rapport avec la référence.
    const coverage = dist.map(d => { let n = 0; for (let i = 0; i < d.length; i++) if (d[i] <= tolerance) n++; return n / d.length; });

    const maxShift = Math.round(w * MAX_SHIFT);
    let best = { recall: -1, chance: 0, x: 0, y: 0 };
    for (let sy = -maxShift; sy <= maxShift; sy += 2) for (let sx = -maxShift; sx <= maxShift; sx += 2) {
      let hit = 0, chance = 0, n = 0;
      for (const i of points) {
        const x = i % w + sx, y = (i / w | 0) + sy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const cls = refMask[i] - 1;
        n++;
        chance += coverage[cls];
        if (dist[cls][y * w + x] <= tolerance) hit++;
      }
      if (!n) continue;
      const recall = hit / n;
      // À rappel égal, on préfère le cadrage le moins décalé.
      if (recall > best.recall + 1e-9 || (Math.abs(recall - best.recall) <= 1e-9 && Math.abs(sx) + Math.abs(sy) < Math.abs(best.x) + Math.abs(best.y))) {
        best = { recall, chance: chance / n, x: sx, y: sy };
      }
    }
    const score = Math.max(0, Math.min(1, (best.recall - best.chance) / Math.max(1e-6, 1 - best.chance)));
    const round = v => Math.round(v * 1000) / 1000;

    // 1. Pire tuile dense (grille 3×3, ref → IA) : repère une ouverture ou un poteau supprimé localement.
    const rN = new Uint32Array(9), rHit = new Uint32Array(9), rCh = new Float64Array(9);
    for (const i of points) {
      const x = i % w, y = (i / w) | 0;
      const tx = x + best.x, ty = y + best.y;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const ti = Math.min(2, (y * 3 / h) | 0) * 3 + Math.min(2, (x * 3 / w) | 0);
      const cls = refMask[i] - 1;
      rN[ti]++;
      rCh[ti] += coverage[cls];
      if (dist[cls][ty * w + tx] <= tolerance) rHit[ti]++;
    }
    let worstTile = null;
    const minRefTile = points.length * TILE_SHARE;
    for (let ti = 0; ti < 9; ti++) {
      if (rN[ti] < minRefTile) continue;
      const rec = rHit[ti] / rN[ti], ch = rCh[ti] / rN[ti];
      const sc = Math.max(0, Math.min(1, (rec - ch) / Math.max(1e-6, 1 - ch)));
      if (!worstTile || sc < worstTile.score) worstTile = { row: (ti / 3) | 0, col: ti % 3, score: round(sc) };
    }

    // 2. Contrôle inverse (IA → ref) sur segments droits H/V forts : repère une baie ajoutée sur un mur nu
    //    sans pénaliser le feuillage ou le grain de matière.
    const minRun = Math.max(5, Math.round(w / 32));
    const aiStruct = straightHV(maskFromSobel(aiSobel, w, h, REF_SHARE), w, h, minRun);
    const distRef0 = distanceTo(refMask, w, h, 0);
    const distRef2 = distanceTo(refMask, w, h, 2);
    let c0 = 0, c2 = 0;
    for (let i = 0; i < distRef0.length; i++) {
      if (distRef0[i] <= tolerance) c0++;
      if (distRef2[i] <= tolerance) c2++;
    }
    const covRef0 = c0 / distRef0.length, covRef2 = c2 / distRef2.length;
    const aN = new Uint32Array(9), aHit = new Uint32Array(9), aNew = new Uint32Array(9), aCh = new Float64Array(9);
    let totalStruct = 0;
    for (let i = 0; i < aiStruct.length; i++) {
      const v = aiStruct[i];
      if (!v) continue;
      totalStruct++;
      const x = i % w, y = (i / w) | 0;
      const rx = x - best.x, ry = y - best.y;
      if (rx < 0 || ry < 0 || rx >= w || ry >= h) continue;
      const ti = Math.min(2, (y * 3 / h) | 0) * 3 + Math.min(2, (x * 3 / w) | 0);
      const isH = v === 1;
      aN[ti]++;
      aCh[ti] += isH ? covRef0 : covRef2;
      if ((isH ? distRef0 : distRef2)[ry * w + rx] <= tolerance) aHit[ti]++;
      else aNew[ti]++;
    }
    let addedTile = null;
    const minNewTile = Math.max(15, totalStruct * TILE_SHARE);
    for (let ti = 0; ti < 9; ti++) {
      if (aNew[ti] < minNewTile) continue;
      const rec = aHit[ti] / aN[ti], ch = aCh[ti] / aN[ti];
      const sc = Math.max(0, Math.min(1, (rec - ch) / Math.max(1e-6, 1 - ch)));
      if (sc < THRESHOLDS.addedFaithful && (!addedTile || sc < addedTile.score)) {
        addedTile = { row: (ti / 3) | 0, col: ti % 3, score: round(sc) };
      }
    }

    const result = {
      score: round(score), recall: round(best.recall), chance: round(best.chance),
      shift: { x: round(best.x / w), y: round(best.y / w) },
      worstTile,
      verdict: verdictOf(score, worstTile, addedTile),
      version: VERSION
    };
    if (addedTile) result.addedTile = addedTile;
    return result;
  }

  const LABELS = {
    faithful: 'Fidèle au plan',
    review: 'À vérifier',
    unfaithful: 'Écart géométrique'
  };
  const ZONE_LABELS = [
    ['en haut à gauche', 'en haut au centre', 'en haut à droite'],
    ['au milieu à gauche', 'au centre', 'au milieu à droite'],
    ['en bas à gauche', 'en bas au centre', 'en bas à droite']
  ];
  const zoneOf = tile => tile && ZONE_LABELS[tile.row]?.[tile.col] || '';
  // Arrondi inférieur : un score affiché « 30 % » ne peut pas être sous le seuil de 0,30.
  function describe(result) {
    if (!result) return '';
    const base = `${LABELS[result.verdict] || 'À vérifier'} · ${Math.floor(result.score * 100 + 1e-9)} %`;
    if (result.verdict === 'faithful') return base;
    if (result.worstTile && result.worstTile.score < THRESHOLDS.tileFaithful) {
      const where = zoneOf(result.worstTile);
      if (where) return `${base} — écart local ${where}`;
    }
    if (result.addedTile && result.addedTile.score < THRESHOLDS.addedFaithful) {
      const where = zoneOf(result.addedTile);
      if (where) return `${base} — ajout suspect ${where}`;
    }
    return base;
  }

  // --- Navigateur : chargement des images et passage en niveaux de gris -------------------------------
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image illisible : ${String(url).slice(0, 80)}`));
      img.src = url;
    });
  }

  /** Recadrage centré d'une image au rapport `ratio` (comme un « object-fit: cover »). */
  function coverCrop(width, height, ratio) {
    return width / height > ratio
      ? [(width - height * ratio) / 2, 0, height * ratio, height]
      : [0, (height - width / ratio) / 2, width, width / ratio];
  }

  function grayFromImage(img, w, h, crop) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    const [sx, sy, sw, sh] = crop || [0, 0, img.naturalWidth, img.naturalHeight];
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return toGray(ctx.getImageData(0, 0, w, h).data, w, h);
  }

  /**
   * Compare deux URL (ou data URL). Le modèle d'image impose souvent son format (16:9) : la référence est
   * recadrée au centre au format du rendu IA plutôt que d'étirer l'une des deux images.
   */
  async function compareUrls(referenceUrl, aiUrl) {
    const [ref, ai] = await Promise.all([loadImage(referenceUrl), loadImage(aiUrl)]);
    const ratio = ai.naturalWidth / ai.naturalHeight;
    const w = WIDTH, h = Math.max(8, Math.round(WIDTH / ratio));
    const result = compareGray(grayFromImage(ref, w, h, coverCrop(ref.naturalWidth, ref.naturalHeight, ratio)), grayFromImage(ai, w, h), w, h);
    result.aspect = Math.round(ratio / (ref.naturalWidth / ref.naturalHeight) * 1000) / 1000;
    return result;
  }

  /**
   * Format attendu par RenderStudio.renderWithFidelityLoop (branche arena) : score en %, verdict booléen.
   * « Réussi » seulement si le rendu est jugé fidèle ; « à vérifier » compte comme un échec pour relancer.
   */
  function toLoopResult(result) {
    if (!result) return { score: 0, passed: false, details: null };
    return { score: Math.floor(result.score * 100 + 1e-9), passed: result.verdict === 'faithful', details: result };
  }

  const asUrl = source => typeof source === 'string' ? source : source.toDataURL('image/png');

  /** Compare une vue de référence et un rendu IA (canvas ou URL) avec le contrôle calibré ci-dessus. */
  async function checkFidelity(original, generated) {
    return toLoopResult(await compareUrls(asUrl(original), asUrl(generated)));
  }

  return { VERSION, THRESHOLDS, LABELS, toGray, edges, coverCrop, compareGray, compareUrls, verdictOf, describe, checkFidelity, toLoopResult };
})();

if (typeof module !== 'undefined') module.exports = FidelityCheck;
