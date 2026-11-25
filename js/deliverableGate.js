/**
 * PORTE E — VERROU CENTRAL DES LIVRABLES CLIENT (local, déterministe, partagé navigateur / Node)
 *
 * Règle absolue : aucun rendu IA n'entre dans un livrable client (couverture, catalogue,
 * cahier de plans A3, planche de synthèse, brochures, APS) si son contrôle géométrique
 * (FidelityCheck v2+) n'est pas « faithful », sauf forçage explicite et tracé de l'architecte.
 *
 * Les médias non générés par IA (captures 3D Three.js, perspectives d'origine, planches
 * techniques scannées/PDF) ne sont pas soumis au contrôle IA et passent directement.
 */
const DeliverableGate = (() => {
  'use strict';

  const MIN_FIDELITY_VERSION = 2;
  const VALID_VERDICTS = new Set(['faithful', 'review', 'unfaithful']);
  const OVERRIDE_VERDICTS = new Set(['faithful', 'review', 'unfaithful', 'missing']);
  const LABELS = {
    faithful: 'Fidèle au plan',
    review: 'À vérifier',
    unfaithful: 'Écart géométrique'
  };

  function isAiRender(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.ai === true) return true;
    const id = String(item.id || '');
    const file = String(item.file || item.source || '');
    const generator = String(item.generator || '');
    return /^photor-/i.test(id)
      || /(?:^|\/)photor-[^/]+$/i.test(file)
      || /openrouter/i.test(generator);
  }

  function describeFidelity(fidelity) {
    if (!fidelity || typeof fidelity !== 'object') return '';
    if (typeof FidelityCheck !== 'undefined' && typeof FidelityCheck.describe === 'function') {
      return FidelityCheck.describe(fidelity);
    }
    const label = LABELS[fidelity.verdict] || 'À vérifier';
    const pct = Number.isFinite(Number(fidelity.score)) ? Math.floor(Number(fidelity.score) * 100 + 1e-9) : 0;
    return `${label} · ${pct} %`;
  }

  /**
   * Valide et normalise un forçage explicite de l'architecte.
   * Exige un motif non vide, une date ISO valide, une version de fidélité entière et un verdict connu.
   */
  function sanitizeOverride(value, { actor = 'architect', now = () => new Date().toISOString() } = {}) {
    if (!value || typeof value !== 'object') return null;
    const reason = String(value.reason || '').trim().slice(0, 300);
    if (!reason) return null;
    const verdict = OVERRIDE_VERDICTS.has(value.verdict) ? value.verdict : null;
    if (!verdict) return null;
    const rawVersion = value.fidelityVersion;
    const fidelityVersion = Number.isInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;
    const rawDate = typeof value.acceptedAt === 'string' && Number.isFinite(Date.parse(value.acceptedAt))
      ? new Date(value.acceptedAt).toISOString()
      : now();
    const acceptedBy = String(value.acceptedBy || actor || 'architect').trim().slice(0, 80) || 'architect';
    return {
      acceptedAt: rawDate,
      acceptedBy,
      reason,
      fidelityVersion,
      verdict
    };
  }

  /**
   * Un forçage tracé n'est valide que s'il correspond exactement à l'état actuel du contrôle
   * (même version de fidélité et même verdict). Si le rendu est regénéré ou si le garde-fou
   * change de version, l'ancien forçage expire automatiquement.
   */
  function hasValidOverride(item, minVersion = MIN_FIDELITY_VERSION) {
    const raw = item?.fidelityOverride;
    if (!raw || typeof raw !== 'object') return null;
    const clean = sanitizeOverride(raw, { actor: raw.acceptedBy || 'architect', now: () => '' });
    if (!clean || !raw.acceptedAt || !Number.isFinite(Date.parse(raw.acceptedAt))) return null;
    const currentVersion = Number.isInteger(item?.fidelity?.version) ? item.fidelity.version : 0;
    const currentVerdict = VALID_VERDICTS.has(item?.fidelity?.verdict) ? item.fidelity.verdict : 'missing';
    if (clean.fidelityVersion !== currentVersion || clean.verdict !== currentVerdict) return null;
    if (currentVerdict !== 'missing' && currentVersion < minVersion) return null;
    return clean;
  }

  /**
   * Évalue l'éligibilité d'un média pour tout livrable client.
   * @returns {{ eligible: boolean, isAi: boolean, status: string, reason: string, override: object|null }}
   */
  function evaluate(item, { minVersion = MIN_FIDELITY_VERSION } = {}) {
    if (!item || typeof item !== 'object') {
      return { eligible: false, isAi: false, status: 'invalid', reason: 'Média absent', override: null };
    }
    if (!isAiRender(item)) {
      return { eligible: true, isAi: false, status: 'non_ai', reason: '', override: null };
    }
    const fidelity = item.fidelity && typeof item.fidelity === 'object' ? item.fidelity : null;
    const version = Number.isInteger(fidelity?.version) ? fidelity.version : 0;
    const verdict = VALID_VERDICTS.has(fidelity?.verdict) ? fidelity.verdict : null;

    if (fidelity && version >= minVersion && verdict === 'faithful') {
      return { eligible: true, isAi: true, status: 'faithful', reason: '', override: null };
    }
    const override = hasValidOverride(item, minVersion);
    if (override) {
      return { eligible: true, isAi: true, status: 'overridden', reason: override.reason, override };
    }
    if (!fidelity || !verdict) {
      return {
        eligible: false, isAi: true, status: 'unverified',
        reason: 'Contrôle géométrique absent — rendu IA non vérifié', override: null
      };
    }
    if (version < minVersion) {
      return {
        eligible: false, isAi: true, status: 'stale',
        reason: `Contrôle géométrique obsolète (v${version} < v${minVersion})`, override: null
      };
    }
    return {
      eligible: false, isAi: true, status: verdict,
      reason: describeFidelity(fidelity) || (verdict === 'review' ? 'À vérifier' : 'Écart géométrique'),
      override: null
    };
  }

  const isEligible = (item, options) => evaluate(item, options).eligible;

  function filterEligible(items, options) {
    const kept = [];
    const excluded = [];
    for (const item of Array.isArray(items) ? items : []) {
      const verdict = evaluate(item, options);
      if (verdict.eligible) kept.push(item);
      else excluded.push({ item, reason: verdict.reason, status: verdict.status });
    }
    return { kept, excluded };
  }

  /**
   * Résout la source affichable d'une planche `edition.sheets` ({ title, preview, art }).
   * Si `art` est un rendu IA bloqué (ou absent du manifeste vérifié), bascule sur la planche
   * technique d'origine `preview` pour garantir la fidélité des cotes et du dessin.
   */
  function resolveSheetSource(sheet, manifestItems = [], options = {}) {
    if (!sheet || typeof sheet !== 'object') return { source: null, fallback: false, reason: 'Planche absente' };
    const art = typeof sheet.art === 'string' && sheet.art ? sheet.art : null;
    const preview = typeof sheet.preview === 'string' && sheet.preview ? sheet.preview : null;
    if (!art) return { source: preview, fallback: false, reason: '' };
    const entry = (Array.isArray(manifestItems) ? manifestItems : []).find(item => item && (item.file === art || item.source === art));
    const candidate = entry || { file: art };
    if (!isAiRender(candidate)) return { source: art, fallback: false, reason: '' };
    const verdict = evaluate(candidate, options);
    if (verdict.eligible) return { source: art, fallback: false, reason: '' };
    return { source: preview, fallback: true, reason: verdict.reason };
  }

  const isPlanLike = item => /\bplan\b|masse|coupe/i.test(
    `${item?.id || ''} ${item?.label || ''} ${item?.file || item?.source || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '')
  );
  const isFacadeLike = item => /facade|perspective-01|porche|entree/i.test(
    `${item?.id || ''} ${item?.label || ''} ${item?.file || item?.source || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '')
  );

  /**
   * Choisit une image de couverture sûre pour un projet (ne renvoie jamais un rendu IA bloqué).
   * Ordre : cover éligible → façade/catalogue éligible → autre image publiée éligible → capture 3D.
   */
  function pickCover(media, options = {}) {
    const images = (Array.isArray(media?.images) ? media.images : [])
      .filter(item => item && typeof (item.file || item.source) === 'string' && isEligible(item, options));
    const nonPlan = images.filter(item => !isPlanLike(item));
    const explicit = nonPlan.find(item => item.cover === true);
    if (explicit) return { file: explicit.file || explicit.source, item: explicit, kind: 'published' };
    const catalog = nonPlan.filter(item => item.catalog === true);
    const catalogHit = catalog.find(isFacadeLike) || catalog[0];
    if (catalogHit) return { file: catalogHit.file || catalogHit.source, item: catalogHit, kind: 'published' };
    const anyImage = nonPlan.find(isFacadeLike) || nonPlan[0];
    if (anyImage) return { file: anyImage.file || anyImage.source, item: anyImage, kind: 'published' };
    const renders = (Array.isArray(media?.renders) ? media.renders : [])
      .filter(file => typeof file === 'string' && !/(?:^|\/)plan-/i.test(file));
    const renderHit = renders.find(file => /facade|aerien/i.test(file)) || renders[0];
    if (renderHit) return { file: renderHit, item: null, kind: 'render' };
    return null;
  }

  return Object.freeze({
    MIN_FIDELITY_VERSION,
    isAiRender,
    sanitizeOverride,
    hasValidOverride,
    evaluate,
    isEligible,
    filterEligible,
    resolveSheetSource,
    pickCover
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeliverableGate;
}
