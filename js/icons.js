/**
 * Jeu d'icônes au trait de Plan / 3D (remplace les emoji de l'interface).
 * Le sprite est injecté dans la page : <svg class="i" aria-hidden="true"><use href="#i-plan"/></svg>.
 * Depuis le JavaScript : Icons.label(bouton, 'plan', 'Composer le cahier').
 * Toutes les icônes : grille 24 × 24, trait 1,6, couleur héritée (currentColor).
 */
const Icons = (() => {
  const PATHS = {
    ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    document: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5"/>',
    book: '<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5v13"/>',
    plan: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 12h9v8.5M12.5 3.5V8M16 12h4.5"/>',
    gallery: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
    video: '<rect x="3" y="6.5" width="12.5" height="11" rx="1.5"/><path d="m15.5 10.5 5.5-3v9l-5.5-3"/>',
    compare: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 3v18"/><path d="m8 10-2 2 2 2M16 10l2 2-2 2"/>',
    sparkle: '<path d="M12 3.5c.8 4.2 2.3 5.7 6.5 6.5-4.2.8-5.7 2.3-6.5 6.5-.8-4.2-2.3-5.7-6.5-6.5 4.2-.8 5.7-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    cursor: '<path d="m5 3.5 13 6.2-5.6 1.8-1.8 5.6z"/><path d="m12.4 11.5 6 6"/>',
    scale: '<path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/><path d="M12 8v8"/>',
    'wall-ext': '<rect x="3" y="9" width="18" height="6" rx=".5" fill="currentColor" stroke="none"/>',
    'wall-int': '<rect x="3" y="10.5" width="18" height="3" rx=".5"/>',
    door: '<path d="M4 20h4M8 20V6"/><path d="M8 6a14 14 0 0 1 12 14"/>',
    window: '<rect x="3" y="8" width="18" height="8" rx=".5"/><path d="M3 12h18M12 8v8"/>',
    passage: '<path d="M3 12h5M16 12h5M8 8v8M16 8v8"/>',
    'room-auto': '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="2.5 2.5"/><path d="M12 8c.4 2 1.4 3 3.5 3.5-2.1.4-3.1 1.4-3.5 3.5-.4-2.1-1.4-3.1-3.5-3.5 2.1-.5 3.1-1.5 3.5-3.5z"/>',
    rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
    polygon: '<path d="M4 9.5 12 4l8 5.5-3 10.5H7z"/>',
    column: '<rect x="8" y="8" width="8" height="8" rx=".5" fill="currentColor" stroke="none"/>',
    canopy: '<path d="M3 8.5h18M5 8.5V18M19 8.5V18"/><path d="M3 6h18" stroke-dasharray="2 2"/>',
    stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/>',
    pergola: '<path d="M3 6h18M3 18h18M6 6v12M10 6v12M14 6v12M18 6v12"/>',
    sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h18v6H3zM6 17v2M18 17v2"/>',
    section: '<path d="M3 12h18" stroke-dasharray="3 2"/><path d="M6 8V5h12v3M6 16v3h12v-3"/>',
    explode: '<path d="M4 7.5 12 4l8 3.5-8 3.5z"/><path d="m4 12.5 8 3.5 8-3.5M4 17l8 3.5 8-3.5"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    check: '<path d="m4.5 12.5 4.5 4.5L19.5 6.5"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    present: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8"/><path d="m10 8 4 2-4 2z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.2"/>'
  };

  function inject() {
    if (document.getElementById('plan3d-icons')) return;
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.id = 'plan3d-icons';
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = Object.entries(PATHS).map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    document.body.prepend(sprite);
  }
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject, { once: true });

  /** Balise SVG d'une icône (décorative : le texte du bouton porte le sens). */
  const html = name => `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

  /** Icône + libellé dans un bouton, sans innerHTML sur le texte (aucune injection possible). */
  function label(element, name, text) {
    if (!element) return;
    element.replaceChildren();
    element.insertAdjacentHTML('afterbegin', html(name));
    element.append(document.createTextNode(` ${text}`));
  }

  return { html, label, names: Object.keys(PATHS) };
})();
window.Icons = Icons;
