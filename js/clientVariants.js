/** Variantes locales par projet et liens autonomes, sans serveur ni compte. */
class ClientVariants {
  constructor(tools, project, pin, exportPDF) {
    this.tools = tools;
    this.project = project;
    this.pin = pin;
    const el = id => document.getElementById(`variant-${id}`);
    this.name = el('name');
    this.fields = el('fields');
    this.a = el('a');
    this.b = el('b');
    this.linkInput = el('url');
    this.status = el('status');
    this.compare = el('compare');
    this.key = `plan3d:variantes:v1:${project}`;
    this.variants = this.load();
    this.refresh();
    for (const select of [this.a, this.b]) select.addEventListener('change', () => this.resetComparison());
    for (const id of ['client-floor', 'client-facade']) document.getElementById(id).addEventListener('change', () => this.resetComparison());
    el('save').addEventListener('click', () => this.save());
    el('link').addEventListener('click', () => this.copy());
    el('delete').addEventListener('click', () => this.remove());
    el('load').addEventListener('click', () => { if (this.selected(this.a)) this.apply(this.selected(this.a)); });
    el('pdf').addEventListener('click', () => { void exportPDF(this.capture(true)); });
    this.compare.addEventListener('click', () => this.compareNext());
  }

  capturePose(compress = true) {
    const hs = this.tools.hs;
    const round = n => compress ? Math.round(n * 1e6) / 1e6 : n;
    return { p: hs.camera.position.toArray().map(round), q: hs.camera.quaternion.toArray().map(round),
      f: round(hs.camera.fov), e: round(hs.elevationProgress), cut: Boolean(hs.sectionEnabled), exploded: Boolean(hs.explodedTarget),
      ceilings: hs.ceilingsVisible, overlay: hs.planOverlayManualVisible };
  }

  capture(defaultName = false) {
    const { hs } = this.tools;
    return VariantState.validate({ v: 1, project: this.project, name: VariantState.label(this.name.value) || (defaultName ? 'Variante actuelle' : ''),
      floor: document.getElementById('client-floor').value, facade: document.getElementById('client-facade').value,
      hour: hs.solarTarget, solar: hs.solarGeo, pose: this.capturePose() }, this.project);
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || '[]');
      return saved.slice(0, 24).map(v => VariantState.validate(v, this.project)).filter(v => v?.name);
    } catch { return []; }
  }

  persist(next) {
    try { localStorage.setItem(this.key, JSON.stringify(next)); }
    catch { this.status.textContent = 'Stockage local indisponible. Le lien reste partageable.'; return false; }
    this.variants = next;
    return true;
  }

  save() {
    const v = this.capture();
    if (!v?.name) { this.status.textContent = 'Saisissez un nom de variante.'; this.name.focus(); return; }
    const next = [v, ...this.variants.filter(item => item.name !== v.name)].slice(0, 24);
    if (!this.persist(next)) return;
    this.name.value = v.name;
    this.refresh(v.name, this.a.value === v.name ? this.b.value : this.a.value);
    this.status.textContent = `« ${v.name} » est enregistrée dans ce navigateur.`;
  }

  remove() {
    const v = this.selected(this.a);
    if (!v || !this.persist(this.variants.filter(item => item.name !== v.name))) return;
    this.refresh();
    this.status.textContent = `« ${v.name} » supprimée du navigateur.`;
  }

  refresh(a, b) {
    for (const [select, selected] of [[this.a, a], [this.b, b]]) {
      select.replaceChildren(...this.variants.map(v => new Option(v.name, v.name)));
      select.disabled = this.variants.length === 0;
      if (this.variants.some(v => v.name === selected)) select.value = selected;
    }
    if (this.a.value === this.b.value && this.variants.length > 1) this.b.value = this.variants.find(v => v.name !== this.a.value).name;
    this.resetComparison();
  }

  selected(select) { return this.variants.find(v => v.name === select.value); }

  resetComparison() {
    this.side = null;
    this.compare.textContent = 'Comparer A/B';
    this.compare.setAttribute('aria-pressed', 'false');
    this.compare.disabled = !this.a.value || !this.b.value || this.a.value === this.b.value;
    for (const id of ['variant-load', 'variant-delete']) document.getElementById(id).disabled = !this.a.value;
  }

  finishes(v) {
    for (const [id, setter] of [['floor', 'setFloor'], ['facade', 'setFacade']]) {
      document.getElementById(`client-${id}`).value = v[id];
      this.tools.finishes[setter](v[id]);
    }
    this.tools.onLiveView();
  }

  apply(v) {
    this.finishes(v);
    this.tools.solarOptions.restore(v.solar, v.hour);
    this.name.value = v.name;
    this.pin(v.pose);
    this.resetComparison();
    this.status.textContent = v.name ? `Variante « ${v.name} » affichée.` : 'Vue partagée affichée.';
  }

  compareNext() {
    if (this.tools.hs.elevationProgress < 0.99) { this.status.textContent = 'Faites défiler la visite jusqu’à l’élévation complète avant de comparer.'; return; }
    const next = this.side === 'A' ? 'B' : 'A';
    const v = this.selected(next === 'A' ? this.a : this.b);
    if (!v) return;
    if (!this.side) this.pin(this.capturePose(false));
    this.finishes(v);
    this.name.value = v.name;
    this.side = next;
    this.compare.textContent = `${next} affichée · Voir ${next === 'A' ? 'B' : 'A'}`;
    this.compare.setAttribute('aria-pressed', String(next === 'B'));
    this.status.textContent = `${next} · ${v.name} — cadrage et heure inchangés.`;
  }

  async copy(channel = null) {
    const state = this.capture();
    if (!state) return;
    const href = VariantState.link(location.href, state, channel);
    this.linkInput.value = href;
    try {
      await navigator.clipboard.writeText(href);
      this.linkInput.hidden = true;
      this.status.textContent = 'Lien copié. Le destinataire retrouve cette vue.';
    } catch {
      this.linkInput.hidden = false;
      document.getElementById('client-variants').open = true;
      this.linkInput.focus();
      this.linkInput.select();
      this.status.textContent = 'Copiez le lien sélectionné.';
    }
    return href;
  }
}
