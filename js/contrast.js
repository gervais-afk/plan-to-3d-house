/*
 * ARCHICAM STUDIO — CONTRASTE (js/contrast.js)
 * ---------------------------------------------------------------------------
 * Lecture de couleur et ratio de contraste WCAG 2.1, sans dépendance.
 * Utilisé par le banc d'essai (js/qa.js) et vérifié directement par les tests :
 *   ratio = (L1 + 0.05) / (L2 + 0.05), L = luminance relative.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Contrast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const AA_TEXT = 4.5;
  const AA_LARGE = 3;
  const AAA_TEXT = 7;

  /** '#abc' | '#aabbcc' | 'rgb(...)' | 'rgba(...)' → [r, g, b] | null */
  function parseColor(value) {
    if (!value) return null;
    const text = String(value).trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (hex) {
      const body = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
      return [0, 2, 4].map(i => parseInt(body.slice(i, i + 2), 16));
    }
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return null;
  }

  function channel(value) {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(rgb) {
    if (!rgb) return 0;
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }

  /** Ratio entre deux couleurs (1 → 21), insensible à l'ordre. */
  function ratio(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  }

  /** Verdict lisible pour un ratio et un type de texte. */
  function verdict(value, large = false) {
    const min = large ? AA_LARGE : AA_TEXT;
    if (value >= AAA_TEXT) return { code: 'AAA', tone: 'is-ok' };
    if (value >= min) return { code: 'AA', tone: 'is-ok' };
    if (value >= AA_LARGE) return { code: 'AA grand texte', tone: 'is-warn' };
    return { code: 'Échec', tone: 'is-bad' };
  }

  /**
   * Extrait les jetons CSS (--nom: valeur) des schémas clair (:root) et sombre
   * (@media (prefers-color-scheme: dark) { :root[data-scheme="auto"] { ... } })
   * directement depuis le texte de css/tokens.css.
   */
  function extractSchemes(cssText) {
    const text = String(cssText || '');
    const parseVars = block => {
      const map = {};
      if (!block) return map;
      for (const match of block.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
        map[match[1]] = match[2].trim();
      }
      return map;
    };
    const light = {};
    for (const match of text.matchAll(/(?:^|\n):root\s*\{([\s\S]*?)\n\}/g)) {
      Object.assign(light, parseVars(match[1]));
    }
    const darkMatch = /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?:root\[data-scheme="auto"\]\s*\{([\s\S]*?)\n\s*\}/.exec(text);
    const dark = { ...light, ...parseVars(darkMatch ? darkMatch[1] : '') };
    return { light, dark };
  }

  return { AA_TEXT, AA_LARGE, AAA_TEXT, parseColor, luminance, ratio, verdict, extractSchemes };
});
