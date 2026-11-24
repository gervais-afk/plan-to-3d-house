/**
 * FIDELITY CHECK — vérification de conformité architecturale après sublimation IA
 * Compare les contours de l'image originale et de l'image générée pour détecter
 * les hallucinations (murs déplacés, fenêtres ajoutées, perspectives modifiées).
 * 
 * Algorithme : détection de contours (Sobel) + corrélation structurelle (SSIM simplifié)
 * Retourne un score de fidélité 0-100% et des recommandations de correction.
 * 
 * Compatible navigateur et Node.js (module.exports).
 */
const FidelityCheck = (() => {
  'use strict';

  // =====================================================================
  // DÉTECTION DE CONTOURS (Filtre de Sobel)
  // =====================================================================

  /**
   * Convertit une image en niveaux de gris.
   * @param {ImageData} imageData — données de l'image (RGBA)
   * @returns {Float32Array} — tableau de luminance (0-255)
   */
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  }

  /**
   * Applique le filtre de Sobel pour détecter les contours.
   * Retourne un tableau de magnitude de gradient.
   * 
   * @param {Float32Array} gray — image en niveaux de gris
   * @param {number} width — largeur de l'image
   * @param {number} height — hauteur de l'image
   * @returns {Float32Array} — magnitude du gradient
   */
  function sobelEdges(gray, width, height) {
    const edges = new Float32Array(width * height);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += gray[idx] * sobelX[kernelIdx];
            gy += gray[idx] * sobelY[kernelIdx];
          }
        }
        edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return edges;
  }

  // =====================================================================
  // CORRéLATION STRUCTURELLE (SSIM simplifié)
  // =====================================================================

  /**
   * Calcule un score de similarité structurelle entre deux images de contours.
   * Version simplifiée de SSIM (Structural Similarity Index).
   * 
   * @param {Float32Array} edges1 — contours de l'image originale
   * @param {Float32Array} edges2 — contours de l'image générée
   * @param {number} width — largeur
   * @param {number} height — hauteur
   * @returns {number} — score de similarité (0-1)
   */
  function structuralSimilarity(edges1, edges2, width, height) {
    const C1 = 6.5025; // Constantes de stabilisation
    const C2 = 58.5225;
    
    let sum1 = 0, sum2 = 0, sum1sq = 0, sum2sq = 0, sum12 = 0;
    const n = width * height;
    
    for (let i = 0; i < n; i++) {
      const v1 = edges1[i];
      const v2 = edges2[i];
      sum1 += v1;
      sum2 += v2;
      sum1sq += v1 * v1;
      sum2sq += v2 * v2;
      sum12 += v1 * v2;
    }
    
    const mu1 = sum1 / n;
    const mu2 = sum2 / n;
    const sigma1sq = sum1sq / n - mu1 * mu1;
    const sigma2sq = sum2sq / n - mu2 * mu2;
    const sigma12 = sum12 / n - mu1 * mu2;
    
    const ssim = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) /
                 ((mu1 * mu1 + mu2 * mu2 + C1) * (sigma1sq + sigma2sq + C2));
    
    return Math.max(0, Math.min(1, ssim));
  }

  // =====================================================================
  // VÉRIFICATION DE FIDÉLITÉ COMPLèTE
  // =====================================================================

  /**
   * Vérifie la fidélité architecturale entre une image originale et une image générée.
   * 
   * @param {HTMLCanvasElement|string} originalCanvas — canvas ou dataURL de l'original
   * @param {HTMLCanvasElement|string} generatedCanvas — canvas ou dataURL du généré
   * @returns {Promise<{score: number, passed: boolean, details: object}>}
   */
  async function checkFidelity(originalCanvas, generatedCanvas) {
    // Charge les images
    const origImg = await loadImage(originalCanvas);
    const genImg = await loadImage(generatedCanvas);
    
    // Vérifie les dimensions
    if (origImg.width !== genImg.width || origImg.height !== genImg.height) {
      throw new Error('Les images doivent avoir les mêmes dimensions');
    }
    
    const { width, height } = origImg;
    
    // Convertit enImageData
    const origCtx = origImg.getContext('2d');
    const genCtx = genImg.getContext('2d');
    const origData = origCtx.getImageData(0, 0, width, height);
    const genData = genCtx.getImageData(0, 0, width, height);
    
    // Détection de contours
    const origGray = toGrayscale(origData);
    const genGray = toGrayscale(genData);
    const origEdges = sobelEdges(origGray, width, height);
    const genEdges = sobelEdges(genGray, width, height);
    
    // Corrélation structurelle
    const similarity = structuralSimilarity(origEdges, genEdges, width, height);
    
    // Seuil de conformité : 50% minimum pour valider
    const passed = similarity >= 0.50;
    
    return {
      score: Math.round(similarity * 100),
      passed,
      details: {
        similarity: similarity.toFixed(3),
        width,
        height,
        threshold: 0.50
      }
    };
  }

  /**
   * Charge une image depuis un canvas ou une dataURL.
   * @param {HTMLCanvasElement|string} source 
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function loadImage(source) {
    if (typeof source === 'string') {
      // dataURL
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = source;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas;
    }
    return source;
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  return {
    checkFidelity,
    toGrayscale,
    sobelEdges,
    structuralSimilarity
  };
})();

if (typeof module !== 'undefined') module.exports = FidelityCheck;
