/**
 * Panneau « Estimation FCFA » de l'éditeur : métré tiré du plan (tous niveaux), estimation en fourchette
 * selon une référence de prix, bordereau d'achats exportable en CSV et budget global.
 * Les réglages sont enregistrés dans project.json (clé `estimate`) avec le projet.
 */
(() => {
  const E = window.EditorAPI;
  const $ = id => document.getElementById(id);
  const dialog = $('dlg-estimate');
  const formEl = $('est-form');
  const C = CostEstimate;
  const fmt = C.formatXAF;
  const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const escape = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const options = (select, entries) => select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));

  options($('est-profile'), Object.entries(C.PROFILES).map(([id, p]) => [id, p.label]));
  options($('est-city'), Object.entries(C.CITIES).map(([id, c]) => [id, c.label]));
  options($('est-tileFormat'), Object.entries(C.TILES).map(([id, t]) => [id, `${t.label} — ${fmt(t.price)}/m²`]));
  options($('est-roofType'), Object.entries(C.ROOFS).map(([id, r]) => [id, `${r.label} — ${fmt(r.price)}/m²`]));
  options($('est-landZone'), Object.entries(C.LAND).map(([id, z]) => [id, `${z.label} (${num.format(z.low)} à ${num.format(z.high)} FCFA/m²)`]));

  // Tous les niveaux, pas seulement celui affiché dans l'éditeur.
  const project = () => ({ config: E.S.p.config, walls: E.allLevelItems('walls'), rooms: E.allLevelItems('rooms') });
  const current = () => C.settings(E.S.p.estimate);

  function standingLabel(profile, standing) {
    if (standing.low) return `${standing.label} — ${num.format(standing.low)} à ${num.format(standing.high)} FCFA/m²`;
    if (standing.factor) return `${standing.label} — ${num.format(profile.base * standing.factor)} FCFA/m² HT (Douala)`;
    return `${standing.label} — ${fmt(standing.perM2)}/m²`;
  }

  function fill(s) {
    const profile = C.PROFILES[s.profile];
    options($('est-standing'), Object.entries(profile.standings).map(([id, st]) => [id, standingLabel(profile, st)]));
    for (const input of formEl.elements) {
      if (!input.name) continue;
      const value = s[input.name];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.name === 'perM2') { input.value = value ?? ''; input.placeholder = `selon la référence (${num.format(C.priceRange({ ...s, perM2: null }).mid)})`; }
      else input.value = input.hasAttribute('data-percent') ? Math.round(value * 100) : value;
    }
    $('est-vat-row').hidden = !profile.ht;
    $('est-permit-row').hidden = Boolean(C.CITIES[s.city].permit);
    ['studiesLow', 'studiesHigh'].forEach(id => { $(`est-${id}`).disabled = !s.studies; });
    ['exteriorLow', 'exteriorHigh'].forEach(id => { $(`est-${id}`).disabled = !s.exterior; });
    ['plotArea', 'landZone'].forEach(id => { $(`est-${id}`).disabled = !s.land; });
  }

  function read() {
    const s = current();
    const next = { ...s };
    for (const input of formEl.elements) {
      if (!input.name) continue;
      if (input.type === 'checkbox') { next[input.name] = input.checked; continue; }
      if (input.tagName === 'SELECT') { next[input.name] = input.value; continue; }
      if (input.name === 'perM2' && input.value.trim() === '') { next.perM2 = null; continue; }
      const value = parseFloat(String(input.value).replace(',', '.'));
      if (!Number.isFinite(value)) continue;
      next[input.name] = input.hasAttribute('data-percent') ? value / 100 : value;
    }
    // Changer de référence ou de standing efface un prix au m² saisi pour l'ancienne référence.
    if (next.profile !== s.profile || next.standing !== s.standing) next.perM2 = null;
    return C.settings(next);
  }

  function render() {
    const e = C.estimate(project(), E.S.p.estimate);
    const q = e.quantities;
    const m2 = value => `${num.format(value)} m²`;
    const range = (low, high) => `<td>${fmt(low)}</td><td>${fmt(high)}</td>`;
    const rows = e.lots.map(lot => `<tr><th scope="row">${escape(lot.label)}</th>${range(lot.low, lot.high)}</tr>`).join('');
    const annexRows = e.annexes.map(a => `<tr><th scope="row">${escape(a.label)}</th>${range(a.low, a.high)}</tr>`).join('');
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
      <h4>Estimation des travaux (${fmt(e.rate.low)} à ${fmt(e.rate.high)}/m²)</h4>
      <p class="ed-note">${escape(e.rate.label)}</p>
      <table class="ed-est-table">
        <thead><tr><th scope="col">Poste</th><th scope="col">Bas</th><th scope="col">Haut</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th scope="row">Enveloppe travaux</th>${range(e.total.low, e.total.high)}</tr></tfoot>
      </table>
      ${e.overall ? `<h4>Budget global</h4>
      <table class="ed-est-table">
        <tbody>${annexRows}</tbody>
        <tfoot><tr><th scope="row">Budget global du projet</th>${range(e.overall.low, e.overall.high)}</tr></tfoot>
      </table>` : ''}
      <h4>Bordereau d’achats (chutes comprises)</h4>
      <ul class="ed-est-materials">${e.materials.map(item => `<li><span>${escape(item.label)} : <strong>${num.format(item.quantity)} ${item.unit === 'u' ? 'u' : escape(item.unit)}</strong> × ${num.format(item.unitPrice)} FCFA <small>(${escape(item.source)})</small></span><strong>${fmt(item.cost)}</strong></li>`).join('')}</ul>
      <p class="ed-note">${escape(e.excluded)} Le bordereau est un repère d’achat déjà compris dans le gros œuvre : il ne s’ajoute pas au total.</p>
      <p class="ed-note">Sources : ${C.SOURCES.map(s => s.url ? `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>` : escape(s.label)).join(' · ')}</p>`;
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

  function downloadCSV() {
    const name = E.S.p.meta?.name || 'Projet';
    const csv = C.bordereauCSV(C.estimate(project(), E.S.p.estimate), name);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `${(E.S.p.meta?.slug || 'projet').replace(/[^a-z0-9-]/gi, '-')}-bordereau-achats.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    E.toast('Bordereau d’achats téléchargé (CSV)');
  }

  async function downloadXLSX() {
    if (typeof XlsxExport === 'undefined') { E.toast('Module Excel indisponible.', true); return; }
    const snap = { ...project(), meta: E.S.p.meta || {}, estimate: E.S.p.estimate };
    const result = C.estimate(snap, E.S.p.estimate);
    await XlsxExport.downloadXlsx(snap, result, { slug: E.S.p.meta?.slug || 'projet' });
    E.toast('Métrés et BQE téléchargés (Excel .xlsx avec formules)');
  }

  formEl.addEventListener('change', apply);
  formEl.addEventListener('submit', event => event.preventDefault());
  $('est-reset').onclick = () => { E.commit(); E.S.p.estimate = C.settings({}); E.refreshPanel(); fill(current()); render(); E.toast('Valeurs par défaut rétablies'); };
  $('est-csv').onclick = downloadCSV;
  if ($('est-xlsx')) $('est-xlsx').onclick = () => { void downloadXLSX(); };
  $('est-close').onclick = () => dialog.close();
  $('btn-estimate').onclick = () => { fill(current()); render(); dialog.showModal(); };
})();
