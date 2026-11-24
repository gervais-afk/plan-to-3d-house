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
  const VERSION = 1;
  const WIDTH = 320;
  // Seuils calibrés le 22/11/2026 sur residence-verandas : 5 rendus intérieurs fidèles entre 0,47 et 0,83 ;
  // 9 paires croisées (référence d'une vue, rendu IA d'une autre) entre 0,06 et 0,27 ; la perspective 03,
  // dont l'IA a changé le point de vue (trois-quarts → frontal), à 0,09.
  const THRESHOLDS = { faithful: 0.45, review: 0.3 };
  const REF_SHARE = 0.08;  // part des pixels de référence retenus comme lignes fortes
  const AI_SHARE = 0.12;   // part des pixels IA retenus (plus large : textures et ombres en plus)
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

  /** Lignes fortes : les `share` pixels de plus fort gradient (Sobel), avec leur classe d'orientation 0..3. */
  function edges(gray, w, h, share) {
    const g = blur(gray, w, h);
    const mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
      // Orientation de la ligne (perpendiculaire au gradient), repliée sur [0, 180[ puis en 4 classes.
      const angle = (Math.atan2(gy, gx) * 180 / Math.PI + 90 + 360) % 180;
      dir[i] = Math.round(angle / 45) % 4;
    }
    // Seuil par histogramme : évite de trier toute l'image.
    let max = 0;
    for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
    const bins = 1024, hist = new Uint32Array(bins);
    if (max > 0) for (let i = 0; i < mag.length; i++) hist[Math.min(bins - 1, Math.floor(mag[i] / max * bins))]++;
    const target = Math.max(1, Math.round(w * h * share));
    let count = 0, cut = bins;
    while (cut > 0 && count < target) count += hist[--cut];
    const threshold = Math.max(cut / bins * max, 1e-6);
    const mask = new Uint8Array(w * h); // 0 = pas de ligne, sinon classe + 1
    const m = 2; // bord ignoré
    for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      if (mag[i] >= threshold) mask[i] = dir[i] + 1;
    }
    return mask;
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

  function verdictOf(score) {
    return score >= THRESHOLDS.faithful ? 'faithful' : score >= THRESHOLDS.review ? 'review' : 'unfaithful';
  }

  /**
   * Compare deux images en niveaux de gris de même taille.
   * @returns {{ score:number, recall:number, chance:number, shift:{x:number,y:number}, verdict:string, version:number }}
   */
  function compareGray(refGray, aiGray, w, h) {
    const tolerance = Math.max(2, Math.round(w / 100));
    const refMask = edges(refGray, w, h, REF_SHARE);
    const aiMask = edges(aiGray, w, h, AI_SHARE);
    const dist = [0, 1, 2, 3].map(cls => distanceTo(aiMask, w, h, cls));

    const points = [];
    for (let i = 0; i < refMask.length; i++) if (refMask[i]) points.push(i);
    if (!points.length) return { score: 0, recall: 0, chance: 0, shift: { x: 0, y: 0 }, verdict: 'review', version: VERSION, empty: true };

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
    return {
      score: round(score), recall: round(best.recall), chance: round(best.chance),
      shift: { x: round(best.x / w), y: round(best.y / w) }, verdict: verdictOf(score), version: VERSION
    };
  }

  const LABELS = {
    faithful: 'Fidèle au plan',
    review: 'À vérifier',
    unfaithful: 'Écart géométrique'
  };
  // Arrondi inférieur : un score affiché « 30 % » ne peut pas être sous le seuil de 0,30.
  const describe = result => result ? `${LABELS[result.verdict] || 'À vérifier'} · ${Math.floor(result.score * 100 + 1e-9)} %` : '';

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
