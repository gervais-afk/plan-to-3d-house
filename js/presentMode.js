/**
 * Mode « Présenter » : la visite en plein écran, sans outils, pour un rendez-vous client ou une tablette.
 * Flèches, Page suivante/précédente ou Espace pour le parcours guidé ; Échap ou le bouton pour quitter.
 * N'utilise que les commandes existantes du parcours (#guided-next, #guided-prev).
 */
(() => {
  const button = document.getElementById('btn-present');
  if (!button) return;
  const label = button.querySelector('span');
  const next = document.getElementById('guided-next');
  const prev = document.getElementById('guided-prev');
  let active = false;

  function set(on) {
    active = on;
    document.body.classList.toggle('is-presenting', on);
    button.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'Quitter la présentation' : 'Présenter';
    document.querySelectorAll('.client-tools[open]').forEach(panel => { panel.open = false; });
  }
  async function enter() {
    set(true);
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
    catch { /* plein écran refusé : la présentation reste active dans la fenêtre */ }
  }
  async function leave() {
    set(false);
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* déjà sorti */ } }
  }
  button.addEventListener('click', () => (active ? leave() : enter()));
  // Sortie du plein écran par le navigateur (Échap) : on quitte aussi la présentation.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && active) set(false); });
  document.addEventListener('keydown', event => {
    if (!active || document.body.classList.contains('fps-active') || event.target.closest?.('input, textarea, select')) return;
    const forward = ['ArrowRight', 'PageDown', ' '].includes(event.key);
    const backward = ['ArrowLeft', 'PageUp'].includes(event.key);
    if (event.key === 'Escape') { event.preventDefault(); leave(); }
    else if (forward && next && !next.disabled) { event.preventDefault(); next.click(); }
    else if (backward && prev && !prev.disabled) { event.preventDefault(); prev.click(); }
  });
})();
