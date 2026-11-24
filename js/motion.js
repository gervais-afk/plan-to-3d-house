/**
 * Retours animés des actions (voir css/motion.css) : message, succès, erreur, chiffres.
 * Chaque fonction rejoue l'animation même si elle est déjà en cours ; le mouvement réduit est géré par le CSS.
 */
const Motion = (() => {
  const replay = (element, className) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth; // relance l'animation CSS
    element.classList.add(className);
  };
  /** Nouveau message d'état, avec un léger glissement. */
  function swap(element, text) {
    if (!element) return;
    element.classList.remove('t-success', 't-error');
    element.textContent = text;
    replay(element, 't-swap');
  }
  /** Message de réussite précédé d'une coche tracée. */
  function success(element, text) {
    if (!element) return;
    element.classList.remove('t-error');
    if (window.Icons) Icons.label(element, 'check', text); else element.textContent = text;
    element.classList.add('t-success');
    replay(element, 't-swap');
  }
  /** Message d'erreur et secousse du champ ou du bouton concerné. */
  function error(element, text, target = element) {
    if (element) {
      element.classList.remove('t-success');
      element.textContent = text;
      element.classList.add('t-error');
    }
    replay(target, 't-shake');
  }
  /** Fait apparaître des chiffres l'un après l'autre. */
  function pop(elements) {
    Array.from(elements || []).forEach((element, index) => {
      element.style.setProperty('--i', index);
      replay(element, 't-pop');
    });
  }
  return { swap, success, error, pop };
})();
window.Motion = Motion;
