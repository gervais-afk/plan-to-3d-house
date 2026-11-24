/* Chargement atomique de l’image de couverture : le cadrage est posé sur le nœud inséré. */
(() => {
  async function replace(current, { ImageConstructor, source, original, alt, focal, isCurrent }) {
    const next = new ImageConstructor();
    next.fetchPriority = 'high';
    next.src = source;
    try {
      await next.decode();
    } catch (error) {
      if (source === original) throw error;
      next.src = original;
      await next.decode();
    }
    if (!isCurrent()) return null;
    next.id = current.id;
    next.alt = alt;
    if (focal && Number.isFinite(focal.x) && Number.isFinite(focal.y)) {
      next.style.objectPosition = `${focal.x}% ${focal.y}%`;
    }
    current.replaceWith(next);
    return next;
  }

  const api = Object.freeze({ replace });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.CoverImage = api;
})();
