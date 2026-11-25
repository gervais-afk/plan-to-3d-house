/**
 * Ordre de présentation d’architecte des vues d’un projet, partagé par l’accueil et le cahier de plans.
 * Indépendant de l’ordre de génération : couverture choisie (`cover: true` dans le manifeste),
 * façade, vue aérienne, séjour, autres pièces, autres vues, plans.
 */
const ViewOrder = (() => {
  const RANK = { cover: 0, facade: 1, aerial: 2, living: 3, room: 4, other: 5, plan: 6 };
  const KIND = { facade: 'Vue extérieure', aerial: 'Vue d’ensemble', living: 'Vue intérieure', room: 'Vue intérieure', other: 'Vue extérieure', plan: 'Plan' };
  const ACCENTS = [[/\bfacade\b/gi, 'façade'], [/\baerien(ne)?\b/gi, 'aérien$1'], [/\bsejour\b/gi, 'séjour'], [/\bentree\b/gi, 'entrée'],
    [/\bsalle manger\b/gi, 'salle à manger'], [/\bpresentation\b/gi, 'présentation'], [/\betage\b/gi, 'étage']];
  const accentuate = text => ACCENTS.reduce((value, [pattern, word]) => value.replace(pattern, word), text);

  function category(item, text) {
    const words = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/\bplan\b|masse|coupe/.test(words)) return 'plan';
    if (/facade|porche|entree/.test(words)) return 'facade';
    if (/aerien|ensemble|drone|survol/.test(words)) return 'aerial';
    if (item.room === 'living' || /sejour|salon|living/.test(words)) return 'living';
    if (item.room || /chambre|cuisine|salle|bureau|suite|dressing/.test(words)) return 'room';
    return 'other';
  }

  function order(views, { keepDuplicates = false } = {}) {
    const seen = new Set();
    const ranked = views
      .map((view, index) => ({ view, index }))
      .sort((a, b) => a.view.rank - b.view.rank || a.index - b.index)
      .map(entry => entry.view)
      // Une même prise de vue (même référence 3D) n’occupe qu’une place.
      .filter(view => keepDuplicates || !view.reference || (!seen.has(view.reference) && seen.add(view.reference)));
    // Une vue par catégorie d’abord (façade, ensemble, séjour…), puis les doublons de catégorie.
    const categories = new Set();
    const leaders = ranked.filter(view => !categories.has(view.rank) && categories.add(view.rank));
    return [...leaders, ...ranked.filter(view => !leaders.includes(view))];
  }

  function pathInProject(value, slug) {
    if (typeof value !== 'string') return null;
    const prefix = `projects/${slug}/generated/`;
    return value.startsWith(prefix) && /^(?:images|renders)\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value.slice(prefix.length)) ? value : null;
  }

  function referenceInProject(value, slug) {
    const generated = pathInProject(value, slug);
    if (generated) return generated;
    if (typeof value !== 'string') return null;
    const planches = `projects/${slug}/planches/`;
    return value.startsWith(planches) && /^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value.slice(planches.length)) ? value : null;
  }

  /** Trois emplacements explicites, les autres restant en sélection automatique. */
  function selectSlots(candidates, slots, catalog = candidates) {
    const automatic = (Array.isArray(candidates) ? candidates : []).slice();
    if (!Array.isArray(slots) || !slots.some(Boolean)) return automatic.slice(0, 3);
    const bySource = new Map((Array.isArray(catalog) ? catalog : []).map(view => [view.source, view]));
    const used = new Set();
    const ordered = Array.from({ length: 3 }, (_, index) => {
      const selected = typeof slots[index] === 'string' ? bySource.get(slots[index]) : null;
      if (selected && !used.has(selected.source)) { used.add(selected.source); return selected; }
      const fallback = automatic.find(view => !used.has(view.source));
      if (fallback) used.add(fallback.source);
      return fallback || null;
    }).filter(Boolean);
    return ordered;
  }

  /** Vues publiées (manifeste) ou, à défaut, captures de la maquette, dans l’ordre de présentation. */
  function views(media, slug, limit = Infinity, options = {}) {
    const published = (media?.images || []).flatMap(item => {
      const source = pathInProject(item.file, slug);
      if (!source) return [];
      // Les photoréalisations OpenRouter portent un suffixe et une note de contrôle internes : hors vitrine.
      const label = String(item.label || 'Rendu du projet').replace(/\s+[—-]\s+photoréaliste$/i, '');
      const notes = typeof item.notes === 'string' && !/^Image issue du rendu/i.test(item.notes) ? item.notes.trim() : '';
      const kind = category(item, `${item.id || ''} ${label} ${source.split('/').pop()}`);
      return [{ id: String(item.id || ''), label, source, preview: pathInProject(item.preview, slug), reference: referenceInProject(item.reference, slug), notes,
        category: kind, rank: item.cover === true ? RANK.cover : RANK[kind], kind: KIND[kind], alt: notes ? `${label} : ${notes}` : label, published: true,
        catalog: item.catalog === true || item.catalog === undefined, book: item.book === true, room: item.room || null,
        ai: item.ai === true || /^photor-/i.test(String(item.id || '')) || /openrouter/i.test(String(item.generator || '')),
        fidelity: item.fidelity && typeof item.fidelity === 'object' ? item.fidelity : null,
        fidelityOverride: item.fidelityOverride && typeof item.fidelityOverride === 'object' ? item.fidelityOverride : null,
        fidelityAccepted: item.fidelityAccepted === true }];
    });
    const captures = (media?.renders || []).flatMap(value => {
      const source = pathInProject(value, slug);
      if (!source) return [];
      const caption = accentuate(source.split('/').pop().split('.')[0].replace(/[-_]+/g, ' '));
      const label = caption[0].toUpperCase() + caption.slice(1);
      const kind = category({}, caption);
      return [{ label, source, category: kind, rank: RANK[kind], kind: 'Capture de la maquette', alt: `${label}, capture de la maquette 3D`, published: false }];
    });
    return order(published.length ? published : captures, options).slice(0, limit);
  }

  return { RANK, KIND, category, order, views, selectSlots, accentuate, pathInProject };
})();

if (typeof module !== 'undefined') module.exports = ViewOrder;
