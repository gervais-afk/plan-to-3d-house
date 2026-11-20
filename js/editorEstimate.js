/**
 * Panneau « Estimation FCFA » de l'éditeur : métré tiré du plan (tous niveaux) et fourchette de coût.
 * Les réglages sont enregistrés dans project.json (clé `estimate`) avec le projet.
 */
(() => {
  const E = window.EditorAPI;
  const $ = id => document.getElementById(id);
  const dialog = $('dlg-estimate');
  const formEl = $('est-form');
  const fmt = CostEstimate.formatXAF;
  const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const escape = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  $('est-standing').append(...Object.entries(CostEstimate.STANDINGS).map(([id, s]) => new Option(`${s.label} — ${fmt(s.perM2)}/m²`, id)));
  $('est-city').append(...Object.entries(CostEstimate.CITIES).map(([id, c]) => new Option(c.label, id)));

  // Tous les niveaux, pas seulement celui affiché dans l'éditeur.
  const project = () => ({ config: E.S.p.config, walls: E.allLevelItems('walls'), rooms: E.allLevelItems('rooms') });
  const current = () => CostEstimate.settings(E.S.p.estimate);

  function fill(s) {
    for (const input of formEl.elements) {
      if (!input.name) continue;
      const value = s[input.name];
      if (input.name === 'perM2') input.value = value ?? CostEstimate.STANDINGS[s.standing].perM2;
      else input.value = input.hasAttribute('data-percent') ? Math.round(value * 100) : value;
    }
    $('est-permit-row').hidden = s.city !== 'autre';
  }

  function read() {
    const s = current();
    const next = { ...s };
    for (const input of formEl.elements) {
      if (!input.name) continue;
      if (input.tagName === 'SELECT') { next[input.name] = input.value; continue; }
      const value = parseFloat(String(input.value).replace(',', '.'));
      if (!Number.isFinite(value)) continue;
      next[input.name] = input.hasAttribute('data-percent') ? value / 100 : value;
    }
    // Un prix au m² égal au ratio du standing n'est pas une saisie personnalisée.
    if (next.standing !== s.standing || next.perM2 === CostEstimate.STANDINGS[next.standing].perM2) next.perM2 = null;
    return CostEstimate.settings(next);
  }

  function render() {
    const e = CostEstimate.estimate(project(), E.S.p.estimate);
    const q = e.quantities;
    const m2 = value => `${num.format(value)} m²`;
    const rows = e.lots.map(lot => `<tr><th scope="row">${escape(lot.label)}</th><td>${fmt(lot.low)}</td><td>${fmt(lot.high)}</td></tr>`).join('');
    $('est-result').innerHTML = q.habitable + q.annexes <= 0
      ? '<p class="ed-note warn">Tracez d’abord des pièces : la surface de référence est nulle.</p>'
      : `<h4>Métré du plan</h4>
      <dl class="ed-est-quantities">
        <div><dt>Surface habitable</dt><dd>${m2(q.habitable)}</dd></div>
        <div><dt>Annexes (porche, terrasse…)</dt><dd>${m2(q.annexes)}</dd></div>
        <div><dt>Surface de référence</dt><dd>${m2(e.reference)}</dd></div>
        <div><dt>Murs extérieurs / cloisons</dt><dd>${num.format(q.extLength)} m / ${num.format(q.intLength)} m</dd></div>
        <div><dt>Maçonnerie nette</dt><dd>${m2(q.wall20 + q.wall15)}</dd></div>
        <div><dt>Ouvertures</dt><dd>${q.doors} portes · ${q.windows + q.bays} fenêtres et baies</dd></div>
      </dl>
      <h4>Estimation (${fmt(e.perM2)}/m²)</h4>
      <table class="ed-est-table">
        <thead><tr><th scope="col">Poste</th><th scope="col">Bas</th><th scope="col">Haut</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th scope="row">Enveloppe travaux</th><td>${fmt(e.total.low)}</td><td>${fmt(e.total.high)}</td></tr></tfoot>
      </table>
      <h4>Repère d’achat — parpaings (casse 5 % incluse)</h4>
      <ul class="ed-est-materials">${e.materials.map(item => `<li><span>${escape(item.label)} : <strong>${num.format(item.count)}</strong> × ${num.format(item.unit)} FCFA${item.sourced ? '' : ' <em>(prix à confirmer)</em>'}</span><strong>${fmt(item.cost)}</strong></li>`).join('')}</ul>
      <p class="ed-note">${escape(e.excluded)} Les parpaings sont inclus dans le gros œuvre : ils ne s’ajoutent pas au total.</p>
      <p class="ed-note">Sources : ${CostEstimate.SOURCES.map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>`).join(' · ')}</p>`;
    window.Motion?.pop($('est-result').querySelectorAll('tfoot td')); // l'enveloppe recalculée apparaît
  }

  function apply() {
    const next = read();
    if (JSON.stringify(next) !== JSON.stringify(current()) || !E.S.p.estimate) {
      E.commit();
      E.S.p.estimate = next;
      E.refreshPanel();
    }
    fill(next);
    render();
  }

  formEl.addEventListener('change', apply);
  formEl.addEventListener('submit', event => event.preventDefault());
  $('est-reset').onclick = () => { E.commit(); E.S.p.estimate = CostEstimate.settings({}); E.refreshPanel(); fill(current()); render(); E.toast('Valeurs par défaut rétablies'); };
  $('est-close').onclick = () => dialog.close();
  $('btn-estimate').onclick = () => { fill(current()); render(); dialog.showModal(); };
})();
