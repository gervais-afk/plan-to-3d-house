/**
 * AI ENHANCE — Sublimation des rendus par IA (OpenRouter, via le serveur local)
 *
 * Part des captures 3D enregistrées par la visite (projects/<slug>/generated/renders/)
 * et les photoréalise avec le relais du serveur local :
 *   POST api/ai/images      → OpenRouter /api/v1/images (modèles autorisés dans serve.js)
 *   POST api/save-generated → image + entrée du manifeste du projet
 * C'est le même flux et le même prompt que la photoréalisation de la visite 3D (js/app.js).
 *
 * Les images obtenues (et celles déjà générées pour le projet) alimentent ensuite
 * le catalogue premium et l'APS.
 *
 * Chaque appel est facturé par OpenRouter : une confirmation avec l'estimation
 * est toujours demandée avant d'envoyer quoi que ce soit.
 */

const AIEnhance = (() => {
  'use strict';

  // Même prompt que la photoréalisation de la visite 3D (js/app.js) : géométrie strictement conservée.
  const PHOTOREAL_PROMPT = 'Create a photorealistic, magazine-quality architectural visualization of the attached image (Architectural Digest / Dwell editorial style): warm, inviting, lived-in, refined materials, layered natural light, rich but restrained styling, realistic shadows and reflections. Preserve the exact camera framing and architectural geometry: do not move, add, remove, resize, or redesign any walls, doors, windows, openings, ceiling lines, or main volumes; keep their positions and proportions strictly unchanged. Keep the room layout and the position and identity of all existing furniture. You may enrich interior styling with tasteful, correctly scaled decor that does not obstruct openings or alter architecture: elegant linen curtains at existing windows, a textured rug beneath the bed or seating, carefully arranged cushions and a soft throw on the bed, warm glowing bedside lamps, one contemporary artwork on a suitable blank wall, and a healthy green plant. Integrate these additions naturally and avoid clutter. For exterior views preserve the existing landscape and context. The result should feel warm, sophisticated, realistic, and inhabited—not sterile.';

  /** Modèles autorisés par serve.js (IMAGE_MODELS) ; le premier est utilisé par défaut. */
  const MODELS = {
    'google/gemini-3.1-flash-image': { label: 'Gemini 3.1 Flash Image', perImageUSD: 0.068 },
    'bytedance-seed/seedream-5-0-flash': { label: 'Seedream 5.0 Flash (brouillon)', perImageUSD: 0.018 }
  };
  const DEFAULT_MODEL = 'google/gemini-3.1-flash-image';
  const EXTERIOR = /facade|fa[cç]ade|aerien|a[ée]rien|porche|exterieur|ext[ée]rieur|jardin/i;
  const MAX_IMAGES = 3; // 1 vue extérieure + 2 vues intérieures : ce qu'utilise le catalogue

  let lastMedia = null;

  // =====================================================================
  // CHOIX DES IMAGES (pur, testable sous Node)
  // =====================================================================

  const baseName = file => String(file).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  const isExterior = name => EXTERIOR.test(name) && !/^soir-sejour/i.test(name);
  const isPlan = name => /^plan-/i.test(name);

  /**
   * Captures 3D à sublimer : celles qui n'ont pas encore d'image IA, la vue extérieure d'abord.
   * @param {{images: object[], renders: string[]}} media — réponse de api/gallery/media
   */
  function planSublimation(media, max = MAX_IMAGES) {
    const images = media?.images || [];
    const done = new Set(images.map(image => image.reference).filter(Boolean));
    const candidates = (media?.renders || [])
      .filter(file => /\.(?:jpe?g|png)$/i.test(file) && !isPlan(baseName(file)) && !done.has(file))
      .map(file => ({ file, name: baseName(file), exterior: isExterior(baseName(file)) }));
    // On complète seulement ce qui manque aux documents : 1 vue extérieure et 2 intérieures au total.
    const doneExterior = images.some(image => !image.room && isExterior(baseName(image.reference || image.file)));
    const doneInteriors = new Set(images.filter(image => image.room && !isPlan(baseName(image.reference || image.file)))
      .map(image => image.reference || image.file)).size;
    const exterior = doneExterior ? [] : candidates.filter(c => c.exterior).slice(0, 1);
    const interiors = candidates.filter(c => !c.exterior && !/^soir-/i.test(c.name)).slice(0, Math.max(0, max - 1 - doneInteriors));
    return [...exterior, ...interiors].slice(0, max).map(c => ({
      ...c,
      id: `photor-${c.name}`.slice(0, 76),
      label: prettyLabel(c.name)
    }));
  }

  /** « facade-sud » → « Façade sud » : noms de fichiers sans accents rendus lisibles. */
  const ACCENTS = { facade: 'façade', sejour: 'séjour', aerienne: 'aérienne', aerien: 'aérien', entree: 'entrée', veranda: 'véranda', etage: 'étage', exterieur: 'extérieur' };
  function prettyLabel(name) {
    const text = String(name).split(/[-_]+/).map(word => ACCENTS[word.toLowerCase()] || word).join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Images IA du projet pour les documents : une vue extérieure et jusqu'à deux intérieures.
   * Les images générées priment ; à défaut, rien (les documents gardent le plan).
   */
  function pickImages(media, interiorsWanted = 2) {
    // Seules les images que l'architecte a validées pour le catalogue (case « Catalogue » de la galerie)
    // vont dans un document client : un rendu IA peut inventer ou retirer des éléments (arbres, ouvertures…).
    const images = (media?.images || []).filter(image => image.catalog === true && /\.(?:jpe?g|png)$/i.test(image.file || ''));
    const nameOf = image => baseName(image.reference || image.file);
    const facade = images.find(image => image.cover) || images.find(image => !image.room && isExterior(nameOf(image)))
      || images.find(image => !image.room && !isPlan(nameOf(image)));
    // Une image par capture d'origine : la plus récente du manifeste (sublimation la plus récente).
    const byReference = new Map();
    for (const image of images) {
      if (image === facade || !image.room || isPlan(nameOf(image))) continue;
      byReference.set(image.reference || image.file, image);
    }
    const interiors = [...byReference.values()].slice(0, interiorsWanted);
    return { facade: facade || null, interiors };
  }

  function estimateUSD(count, model = DEFAULT_MODEL) {
    return Math.round(count * (MODELS[model]?.perImageUSD || MODELS[DEFAULT_MODEL].perImageUSD) * 1000) / 1000;
  }

  // =====================================================================
  // ACCÈS AU SERVEUR LOCAL
  // =====================================================================

  const api = (endpoint, slug) => `${endpoint}?project=${encodeURIComponent(slug)}`;

  async function readJson(response, what) {
    let body = null;
    try { body = await response.json(); } catch (_) { /* réponse non JSON */ }
    if (!response.ok || body?.error) {
      const detail = body?.error?.message || body?.error || `HTTP ${response.status}`;
      throw new Error(`${what} : ${detail}`);
    }
    return body;
  }

  async function loadMedia(slug, { fetch: fetchImpl = fetch } = {}) {
    lastMedia = await readJson(await fetchImpl(api('api/gallery/media', slug), { cache: 'no-store' }), 'Médias du projet');
    return lastMedia;
  }

  async function dataUrl(url, fetchImpl = fetch) {
    if (url.startsWith('data:image/')) return url;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Image inaccessible (HTTP ${response.status}) : ${url}`);
    const blob = await response.blob();
    if (typeof FileReader === 'undefined') { // Node (tests)
      const type = blob.type || (/\.png$/i.test(url) ? 'image/png' : 'image/jpeg');
      return `data:${type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Lecture impossible : ${url}`));
      reader.readAsDataURL(blob);
    });
  }

  function dimensions(source) {
    if (typeof Image === 'undefined') return Promise.resolve({ width: 1920, height: 1080 }); // Node (tests)
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 1920, height: 1080 });
      img.src = source;
    });
  }

  /** Les PNG générés pèsent plusieurs Mo : JPEG 85 % (max 2000 px) pour garder un PDF léger. */
  async function toJpeg(source) {
    if (typeof document === 'undefined' || !/^data:image\/png/i.test(source)) return source;
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = source;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /** Charge les images choisies par pickImages en data URL, prêtes pour jsPDF. */
  async function documentImages(slug, options = {}) {
    if (!slug) return { facade: null, interiors: [] };
    const media = await loadMedia(slug, options);
    const picked = pickImages(media);
    const load = async image => image && ({
      data: await toJpeg(await dataUrl(image.file, options.fetch || fetch)),
      label: String(image.label || '').replace(/\s+[—-]\s+photor[ée]aliste$/i, ''),
      width: image.width || 1920,
      height: image.height || 1080
    });
    return { facade: await load(picked.facade), interiors: await Promise.all(picked.interiors.map(load)) };
  }

  // =====================================================================
  // SUBLIMATION
  // =====================================================================

  const slugify = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /**
   * Prompt d'une vue, piloté par le projet (js/aiPrompt.js, comme la visite 3D) : un prompt extérieur
   * n'ajoute ni mobilier ni décor intérieur (essai réel : un prompt unique avait posé un lit sur la pelouse).
   */
  function promptFor(item, project) {
    const AP = typeof AiPrompt !== 'undefined' ? AiPrompt
      : (typeof module !== 'undefined' && typeof require === 'function' ? require('./aiPrompt.js') : null);
    const room = item.exterior ? null
      : (project?.rooms || []).find(r => r.id === item.name || slugify(r.name) === item.name) || null;
    if (!AP) return { prompt: PHOTOREAL_PROMPT, tags: null, room };
    const { prompt, tags } = AP.build({
      kind: item.exterior ? 'exterior' : 'interior',
      room,
      city: project?.estimate?.city || 'douala',
      planVersion: project ? AP.planVersion(project) : null
    });
    return { prompt, tags, room };
  }

  /**
   * Photoréalise les captures 3D du projet qui ne le sont pas encore.
   * @param {string} slug — projet enregistré (projects/<slug>)
   * @param {object} [options] — { project, model, fetch, confirm, onProgress } ; project fournit pièces et ville au prompt
   * @returns {Promise<{created: object[], skipped: string}>}
   */
  async function sublimateWithAI(slug, options = {}) {
    if (!slug) throw new Error('Enregistrez le projet avant de sublimer ses rendus.');
    const fetchImpl = options.fetch || fetch;
    const ask = options.confirm || (message => window.confirm(message));
    const progress = options.onProgress || (() => {});
    const model = MODELS[options.model] ? options.model : DEFAULT_MODEL;

    const status = await readJson(await fetchImpl('api/ai/status', { cache: 'no-store' }), 'Statut IA');
    if (!status.configured) throw new Error('Clé OpenRouter absente sur le serveur local (openrouter.key ou OPENROUTER_API_KEY).');

    const media = await loadMedia(slug, { fetch: fetchImpl });
    if (!(media.renders || []).length) {
      return { created: [], skipped: 'Aucune capture 3D pour ce projet : ouvrez la visite 3D et enregistrez des vues, puis relancez la sublimation.' };
    }
    const plan = planSublimation(media);
    if (!plan.length) return { created: [], skipped: 'Toutes les vues utiles sont déjà sublimées.' };

    const list = plan.map(p => `• ${p.label}`).join('\n');
    const cost = estimateUSD(plan.length, model);
    if (!ask(`Sublimer ${plan.length} vue(s) avec ${MODELS[model].label} ?\n\n${list}\n\nCoût estimé : environ ${cost.toLocaleString('fr-FR')} $ (facturé par OpenRouter). Continuer ?`)) {
      return { created: [], skipped: 'Sublimation annulée.' };
    }

    const created = [];
    for (const [index, item] of plan.entries()) {
      progress(`Sublimation ${index + 1}/${plan.length} : ${item.label}…`);
      const { prompt, tags, room } = promptFor(item, options.project);
      const source = await dataUrl(item.file, fetchImpl);
      const result = await readJson(await fetchImpl('api/ai/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, aspect_ratio: '16:9', input_references: [{ type: 'image_url', image_url: { url: source } }] })
      }), `Génération « ${item.label} »`);
      const generated = result.data?.[0];
      const output = generated?.b64_json ? `data:${generated.media_type || 'image/png'};base64,${generated.b64_json}` : generated?.url;
      if (!output) throw new Error(`Le modèle n'a pas renvoyé d'image pour « ${item.label} ».`);
      const image = await dataUrl(output, fetchImpl);
      const size = await dimensions(image);
      // Contrôle géométrique local (lignes de l'architecture) quand le module est chargé, comme dans la visite 3D.
      const fidelity = typeof FidelityCheck !== 'undefined' && typeof Image !== 'undefined'
        ? await FidelityCheck.compareUrls(source, image).catch(() => null) : null;
      const saved = await readJson(await fetchImpl(api('api/save-generated', slug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id, data: image,
          metadata: { reference: item.file, room: item.exterior ? null : (room?.id || item.name), label: `${item.label} — photoréaliste`, width: size.width, height: size.height, model, prompt, tags, fidelity }
        })
      }), `Enregistrement « ${item.label} »`);
      created.push(saved.item);
    }
    await loadMedia(slug, { fetch: fetchImpl });
    return { created, skipped: '' };
  }

  /** Vrai si le projet chargé en dernier a au moins une image validée « Catalogue » par l'architecte. */
  function isEnhanced() {
    return (lastMedia?.images || []).some(image => image.catalog === true);
  }

  return { sublimateWithAI, documentImages, loadMedia, isEnhanced, planSublimation, pickImages, promptFor, estimateUSD, MODELS, DEFAULT_MODEL, PHOTOREAL_PROMPT };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIEnhance;
}
