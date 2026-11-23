(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined' && window.document) api.init(window);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function processPixels(source, options = {}) {
    const output = new Uint8ClampedArray(source);
    const grayscale = options.grayscale !== false;
    const contrastValue = Math.max(-100, Math.min(100, Number(options.contrast) || 0));
    const factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
    const lineStrength = Math.max(0, Math.min(1, Number(options.lines) || 0));
    const thresholdOn = options.thresholdOn === true;
    const threshold = Math.max(0, Math.min(255, Number(options.threshold) || 0));
    const width = Math.max(1, Math.floor(Number(options.width) || output.length / 4));
    const height = Math.max(1, Math.floor(Number(options.height) || 1));

    // Tonal work is independent for each pixel; alpha remains untouched.
    for (let i = 0; i < output.length; i += 4) {
      let r = source[i], g = source[i + 1], b = source[i + 2];
      if (grayscale) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = g = b = gray;
      }
      output[i] = factor * (r - 128) + 128;
      output[i + 1] = factor * (g - 128) + 128;
      output[i + 2] = factor * (b - 128) + 128;
    }

    // Darken only pixels that are locally darker than their 8-neighbourhood, making
    // fine ink lines more legible without inventing, moving, or tracing any geometry.
    const pixelCount = Math.min(width * height, output.length / 4);
    if (lineStrength && pixelCount === output.length / 4 && width > 1 && height > 1) {
      const luminance = new Float32Array(pixelCount);
      for (let p = 0; p < pixelCount; p++) {
        const i = p * 4;
        luminance[p] = 0.2126 * output[i] + 0.7152 * output[i + 1] + 0.0722 * output[i + 2];
      }
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = y * width + x;
        let sum = 0, neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sum += luminance[ny * width + nx];
          neighbours++;
        }
        if (!neighbours) continue;
        const inkDelta = Math.max(0, (sum / neighbours - luminance[p]) * lineStrength * 0.8);
        const i = p * 4;
        output[i] = Math.max(0, output[i] - inkDelta);
        output[i + 1] = Math.max(0, output[i + 1] - inkDelta);
        output[i + 2] = Math.max(0, output[i + 2] - inkDelta);
      }
    }

    if (thresholdOn) for (let i = 0; i < output.length; i += 4) {
      const value = 0.2126 * output[i] + 0.7152 * output[i + 1] + 0.0722 * output[i + 2] < threshold ? 0 : 255;
      output[i] = output[i + 1] = output[i + 2] = value;
    }
    return output;
  }

  function init(win) {
    const $ = id => win.document.getElementById(id);
    const button = $('btn-plan-cleanup');
    const dialog = $('dlg-plan-cleanup');
    if (!button || !dialog) return;

    const before = $('cleanup-before');
    const after = $('cleanup-after');
    const status = $('cleanup-status');
    const download = $('cleanup-download');
    const sourceCanvas = win.document.createElement('canvas');
    let sourceImage = null;
    let renderQueued = false;

    function currentImage() {
      return win.EditorAPI && win.EditorAPI.S && win.EditorAPI.S.planImg;
    }

    function syncAvailability() {
      const image = currentImage();
      const available = !!(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      button.disabled = !available;
      button.title = available ? 'Nettoyer visuellement une copie du plan' : 'Importez d’abord une image de plan';
    }

    function getOptions() {
      return {
        grayscale: $('cleanup-grayscale').checked,
        contrast: (Number($('cleanup-contrast').value) - 50) * 2,
        lines: Number($('cleanup-lines').value) / 100,
        thresholdOn: $('cleanup-threshold').checked,
        threshold: Number($('cleanup-threshold-value').value)
      };
    }

    function renderPreview() {
      renderQueued = false;
      if (!sourceImage) return;
      const width = sourceImage.naturalWidth;
      const height = sourceImage.naturalHeight;
      try {
        const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(sourceImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const result = processPixels(imageData.data, { ...getOptions(), width, height });
        const outCtx = after.getContext('2d');
        const output = outCtx.createImageData(width, height);
        output.data.set(result);
        outCtx.putImageData(output, 0, 0);
        status.textContent = 'Aperçu local côte à côte. L’image exportée est un nouveau fichier PNG ; le plan original reste intact.';
        download.disabled = false;
      } catch (error) {
        status.textContent = 'Impossible de traiter cette image dans le navigateur : ' + (error && error.message ? error.message : 'erreur inconnue');
        download.disabled = true;
      }
    }

    function queuePreview() {
      if (renderQueued) return;
      renderQueued = true;
      win.requestAnimationFrame(renderPreview);
    }

    function openCleanup() {
      syncAvailability();
      const image = currentImage();
      if (button.disabled || !image) return;
      const pixels = image.naturalWidth * image.naturalHeight;
      if (!Number.isSafeInteger(pixels) || pixels > 16000000) {
        win.EditorAPI.toast('Cette image dépasse la limite de 16 mégapixels pour un aperçu fluide.', true);
        return;
      }
      sourceImage = image;
      before.width = after.width = sourceCanvas.width = image.naturalWidth;
      before.height = after.height = sourceCanvas.height = image.naturalHeight;
      before.getContext('2d').drawImage(image, 0, 0);
      const projectName = win.EditorAPI.S.p.meta && win.EditorAPI.S.p.meta.name || 'plan';
      const baseName = String(projectName).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'plan';
      $('cleanup-filename').value = baseName + '-nettoye.png';
      status.textContent = 'Génération de l’aperçu local…';
      download.disabled = true;
      if (!dialog.open) dialog.showModal();
      queuePreview();
    }

    button.addEventListener('click', openCleanup);
    $('cleanup-close').addEventListener('click', () => dialog.close());
    $('cleanup-threshold').addEventListener('change', event => {
      $('cleanup-threshold-value').disabled = !event.currentTarget.checked;
      queuePreview();
    });
    $('cleanup-contrast').addEventListener('input', event => {
      $('cleanup-contrast-value').value = event.currentTarget.value;
      queuePreview();
    });
    $('cleanup-lines').addEventListener('input', event => {
      $('cleanup-lines-value').value = event.currentTarget.value;
      queuePreview();
    });
    $('cleanup-threshold-value').addEventListener('input', event => {
      $('cleanup-threshold-output').value = event.currentTarget.value;
      queuePreview();
    });
    $('cleanup-grayscale').addEventListener('change', queuePreview);

    download.addEventListener('click', () => {
      if (!sourceImage || download.disabled) return;
      const rawName = $('cleanup-filename').value.trim();
      let filename = rawName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\.+$/g, '').trim();
      if (!filename) filename = 'plan-nettoye.png';
      if (!/\.png$/i.test(filename)) filename += '.png';
      after.toBlob(blob => {
        if (!blob) {
          status.textContent = 'Le navigateur n’a pas pu créer le fichier PNG.';
          return;
        }
        const url = win.URL.createObjectURL(blob);
        const link = win.document.createElement('a');
        link.href = url;
        link.download = filename;
        link.hidden = true;
        win.document.body.appendChild(link);
        link.click();
        link.remove();
        win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
        status.textContent = 'Nouveau fichier téléchargé : ' + filename + '. Le plan original et le projet n’ont pas été modifiés.';
      }, 'image/png');
    });

    // EditorAPI exposes planImg but no image-loaded event; poll only its lightweight state.
    syncAvailability();
    win.setInterval(syncAvailability, 300);
  }

  return { processPixels, init };
});
