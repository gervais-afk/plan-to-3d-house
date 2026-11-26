/**
 * REDRESSEMENT DE PERSPECTIVE (HOMOGRAPHIE 4 POINTS) & CONTRÔLE DE CALIBRATION
 * Module pur UMD (navigateur + Node.js, sans dépendance externe).
 *
 * - Calcule la matrice projective 3×3 (DLT 8×8 par pivot de Gauss) envoyant un quadrilatère
 *   quelconque (photo de plan ou croquis pris en biais) sur un rectangle droit.
 * - Rééchantillonne les pixels par interpolation bilinéaire dans une NOUVELLE image
 *   sans jamais altérer l'image source originale.
 * - Évalue une seconde cote de contrôle après calibrage principal et lève une alerte
 *   explicite si l'écart relatif dépasse 1 %.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PlanHomography = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat(b[i]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxAbs = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const val = Math.abs(M[r][col]);
        if (val > maxAbs) { maxAbs = val; pivot = r; }
      }
      if (maxAbs < 1e-12) throw new Error('Quadrilatère dégénéré : les 4 points ne peuvent pas être colinéaires.');
      if (pivot !== col) {
        const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp;
      }
      const div = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        if (Math.abs(factor) < 1e-15) continue;
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return M.map(row => row[n]);
  }

  /**
   * Calcule la matrice homographique 3×3 (tableau 9 éléments) envoyant srcQuad[0..3] sur dstQuad[0..3].
   */
  function solveHomography(srcQuad, dstQuad) {
    if (!Array.isArray(srcQuad) || srcQuad.length !== 4 || !Array.isArray(dstQuad) || dstQuad.length !== 4) {
      throw new Error('Quatre coins source et quatre coins destination sont requis.');
    }
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = srcQuad[i];
      const [u, v] = dstQuad[i];
      if (![x, y, u, v].every(Number.isFinite)) throw new Error('Coordonnées de coins invalides.');
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    const h = solveLinearSystem(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function applyHomography(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    if (Math.abs(w) < 1e-12) return [NaN, NaN];
    return [
      (H[0] * x + H[1] * y + H[2]) / w,
      (H[3] * x + H[4] * y + H[5]) / w
    ];
  }

  function invert3x3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const c00 = e * i - f * h;
    const c01 = -(d * i - f * g);
    const c02 = d * h - e * g;
    const c10 = -(b * i - c * h);
    const c11 = a * i - c * g;
    const c12 = -(a * h - b * g);
    const c20 = b * f - c * e;
    const c21 = -(a * f - c * d);
    const c22 = a * e - b * d;
    const det = a * c00 + b * c01 + c * c02;
    if (Math.abs(det) < 1e-12) throw new Error('Matrice homographique non inversible.');
    return [
      c00 / det, c10 / det, c20 / det,
      c01 / det, c11 / det, c21 / det,
      c02 / det, c12 / det, c22 / det
    ];
  }

  /**
   * Calcule la taille (width, height) du rectangle redressé à partir des 4 coins [TL, TR, BR, BL].
   * Si `targetAspectRatio` (L/H) est fourni, le respecte exactement ; sinon utilise la longueur
   * maximale des bords opposés (ou estimation projective si centre fourni).
   */
  function computeRectifiedSize(srcQuad, { targetAspectRatio = null, maxDim = 2400 } = {}) {
    const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const topW = dist(srcQuad[0], srcQuad[1]);
    const botW = dist(srcQuad[3], srcQuad[2]);
    const leftH = dist(srcQuad[0], srcQuad[3]);
    const rightH = dist(srcQuad[1], srcQuad[2]);
    let w = Math.max(topW, botW);
    let h = Math.max(leftH, rightH);
    if (w < 8 || h < 8) throw new Error('Zone de redressement trop petite.');

    if (Number.isFinite(Number(targetAspectRatio)) && Number(targetAspectRatio) > 0) {
      const ratio = Number(targetAspectRatio);
      if (w / h >= ratio) h = w / ratio;
      else w = h * ratio;
    }

    const scale = Math.min(1, maxDim / Math.max(w, h));
    return {
      width: Math.max(16, Math.round(w * scale)),
      height: Math.max(16, Math.round(h * scale))
    };
  }

  /**
   * Rééchantillonne un buffer RGBA par homographie inverse + interpolation bilinéaire.
   * Retourne un NOUVEAU Uint8ClampedArray sans jamais modifier `srcData`.
   */
  function warpRGBA(srcData, srcW, srcH, srcQuad, outW, outH, { background = [255, 255, 255, 255] } = {}) {
    const dstQuad = [[0, 0], [outW - 1, 0], [outW - 1, outH - 1], [0, outH - 1]];
    const H = solveHomography(srcQuad, dstQuad);
    const Hinv = solveHomography(dstQuad, srcQuad);
    const out = new Uint8ClampedArray(outW * outH * 4);

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const [sx, sy] = applyHomography(Hinv, x, y);
        const dstIdx = (y * outW + x) * 4;
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) {
          out[dstIdx] = background[0];
          out[dstIdx + 1] = background[1];
          out[dstIdx + 2] = background[2];
          out[dstIdx + 3] = background[3];
          continue;
        }
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(srcW - 1, x0 + 1), y1 = Math.min(srcH - 1, y0 + 1);
        const fx = sx - x0, fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * srcW + x0) * 4;
        const i10 = (y0 * srcW + x1) * 4;
        const i01 = (y1 * srcW + x0) * 4;
        const i11 = (y1 * srcW + x1) * 4;
        for (let c = 0; c < 4; c++) {
          out[dstIdx + c] = Math.round(
            srcData[i00 + c] * w00 +
            srcData[i10 + c] * w10 +
            srcData[i01 + c] * w01 +
            srcData[i11 + c] * w11
          );
        }
      }
    }
    return { data: out, width: outW, height: outH, H, Hinv, dstQuad };
  }

  /**
   * Redresse un HTMLImageElement ou HTMLCanvasElement dans un NOUVEAU canvas (source intacte).
   */
  function rectifyCanvas(source, srcQuad, options = {}) {
    if (typeof document === 'undefined') throw new Error('document requis pour rectifyCanvas.');
    const srcW = source.naturalWidth || source.width;
    const srcH = source.naturalHeight || source.height;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const sCtx = srcCanvas.getContext('2d');
    sCtx.drawImage(source, 0, 0, srcW, srcH);
    const srcImgData = sCtx.getImageData(0, 0, srcW, srcH);

    const size = computeRectifiedSize(srcQuad, options);
    const warped = warpRGBA(srcImgData.data, srcW, srcH, srcQuad, size.width, size.height);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = size.width;
    outCanvas.height = size.height;
    const oCtx = outCanvas.getContext('2d');
    const outImgData = oCtx.createImageData(size.width, size.height);
    outImgData.data.set(warped.data);
    oCtx.putImageData(outImgData, 0, 0);

    return {
      canvas: outCanvas,
      dataUrl: outCanvas.toDataURL('image/png'),
      width: size.width,
      height: size.height,
      H: warped.H,
      Hinv: warped.Hinv,
      srcQuad: srcQuad.map(p => [p[0], p[1]])
    };
  }

  /**
   * Vérifie une seconde cote de contrôle après calibrage principal.
   * Lève `alert: true` si l'écart relatif entre la distance mesurée et la cote réelle dépasse 1 %.
   */
  function evaluateControlDimension({ p1, p2, realMeters, pxPerMeter, tolerance = 0.01 } = {}) {
    const real = Number(realMeters);
    const ppm = Number(pxPerMeter);
    if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) {
      throw new Error('Deux points de contrôle sont requis.');
    }
    if (!Number.isFinite(real) || real <= 0) throw new Error('Longueur réelle de contrôle invalide.');
    if (!Number.isFinite(ppm) || ppm <= 0) throw new Error('Le plan doit être calibré avant le contrôle.');

    const pixelDistance = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (pixelDistance < 2) throw new Error('Points de contrôle trop proches.');

    const measuredMeters = pixelDistance / ppm;
    const deltaMeters = measuredMeters - real;
    const relativeError = Math.abs(deltaMeters) / real;
    const percentError = Math.round(relativeError * 10000) / 100; // ex. 1.45 (%)
    const alert = relativeError > tolerance;
    const ok = !alert;

    const message = alert
      ? `Écart de calibrage de ${percentError.toFixed(2)} % (> ${(tolerance * 100).toFixed(0)} %) : mesuré ${measuredMeters.toFixed(2)} m pour ${real.toFixed(2)} m attendus. Vérifiez le redressement ou la 1ʳᵉ cote.`
      : `Contrôle conforme (écart ${percentError.toFixed(2)} % ≤ ${(tolerance * 100).toFixed(0)} %) : mesuré ${measuredMeters.toFixed(2)} m pour ${real.toFixed(2)} m.`;

    return {
      ok,
      alert,
      pixelDistance: Math.round(pixelDistance * 100) / 100,
      measuredMeters: Math.round(measuredMeters * 1000) / 1000,
      expectedMeters: real,
      deltaMeters: Math.round(deltaMeters * 1000) / 1000,
      relativeError: Math.round(relativeError * 100000) / 100000,
      percentError,
      tolerancePercent: tolerance * 100,
      message
    };
  }

  return {
    solveHomography,
    applyHomography,
    invert3x3,
    computeRectifiedSize,
    warpRGBA,
    rectifyCanvas,
    evaluateControlDimension
  };
});
