/** Retours partageables : raycast, ancrage 3D et classement par pièce. */
class ClientFeedback {
  constructor(tools, variants, channel) {
    this.tools = tools;
    this.variants = variants;
    this.canComment = window.PORTAL_CONTEXT?.role !== 'read';
    const el = id => document.getElementById(`feedback-${id}`);
    this.panel = document.getElementById('client-feedback');
    this.fields = el('fields');
    this.status = el('status');
    this.prompt = el('prompt');
    this.form = el('form');
    this.text = el('text');
    this.start = el('start');
    this.list = el('list');
    this.notes = [];
    this.anchors = [];
    this.lastView = new THREE.Matrix4();
    this.lastProjection = new THREE.Matrix4();
    this.nextCheck = 0;
    this.key = `plan3d:retours:v1:${variants.project}`;
    try { channel ||= localStorage.getItem(this.key); } catch { /* lien uniquement */ }
    this.setChannel(VariantState.channelPattern.test(channel || '') ? channel : null);
    if (!this.canComment) {
      el('create').hidden = this.start.hidden = true;
      this.status.textContent = 'Lecture seule : vous pouvez consulter les dossiers dont vous avez reçu le lien.';
    }
    el('create').addEventListener('click', () => {
      if (this.posting || (this.channel && !window.confirm('Créer un nouveau dossier ? Conservez le lien précédent pour retrouver ses remarques.'))) return;
      this.cancel();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
      this.setChannel(token);
      this.status.textContent = 'Dossier prêt. Partagez le lien afin d’inviter le client.';
    });
    el('share').addEventListener('click', async () => {
      if (await variants.copy(this.channel)) this.status.textContent = variants.status.textContent;
    });
    el('refresh').addEventListener('click', () => { void this.refresh(); });
    el('cancel').addEventListener('click', () => this.cancel());
    this.start.addEventListener('click', () => this.placing ? this.cancel() : this.begin());
    this.form.addEventListener('submit', event => { event.preventDefault(); void this.post(el('submit')); });
    tools.canvas.addEventListener('click', event => this.pick(event));
    this.panel.addEventListener('toggle', () => { if (this.panel.open && this.channel) void this.refresh(false); });
    if (this.channel) void this.refresh(false);
  }

  setChannel(channel) {
    this.channel = channel;
    for (const id of ['share', 'start', 'refresh']) document.getElementById(`feedback-${id}`).disabled = !channel;
    document.getElementById('feedback-create').textContent = channel ? 'Nouveau dossier' : 'Créer un dossier';
    this.selected = null;
    this.render([]);
    if (channel) { try { localStorage.setItem(this.key, channel); } catch { /* lien uniquement */ } }
  }

  async request(note) {
    const options = { cache: 'no-store', headers: { 'X-Feedback-Channel': this.channel } };
    if (note) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(note);
    }
    const response = await fetch(`api/client-feedback?project=${encodeURIComponent(this.variants.project)}`, options);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.error || 'Retours indisponibles sur ce serveur.');
    return body;
  }

  async refresh(announce = true) {
    if (this.loading || this.posting) return;
    this.loading = true;
    const channel = this.channel;
    try {
      const { notes } = await this.request();
      if (channel !== this.channel) return;
      this.render(notes);
      if (announce) this.status.textContent = `${notes.length} remarque${notes.length === 1 ? '' : 's'} dans ce dossier.`;
    } catch (error) { if (channel === this.channel) this.status.textContent = error.message; }
    finally { this.loading = false; }
  }

  begin() {
    if (!this.canComment) return;
    if (!this.tools.ready()) { this.status.textContent = 'Attendez la fin de l’élévation et quittez la vue éclatée.'; return; }
    this.tools.toggleMeasure(false);
    this.placing = this.tools.hs.feedbackActive = true;
    this.tools.layer.classList.add('is-annotating');
    this.tools.hs.container.classList.add('is-annotating');
    this.start.setAttribute('aria-pressed', 'true');
    this.tools.onLiveView();
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.prompt.hidden = false;
    this.prompt.textContent = 'Cliquez sur un mur ou un sol pour placer le repère. Échap pour annuler.';
    this.panel.open = false;
  }

  cancel(reset = true) {
    this.placing = this.tools.hs.feedbackActive = false;
    this.tools.layer.classList.remove('is-annotating');
    this.tools.hs.container.classList.remove('is-annotating');
    this.start.setAttribute('aria-pressed', 'false');
    this.prompt.hidden = true;
    if (!reset) return;
    this.draft = null;
    this.form.hidden = true;
    this.text.value = '';
    this.draftAnchor?.remove();
    this.draftAnchor = this.draftVisual = null;
  }

  pick(event) {
    if (!this.placing || event.button !== 0 || !this.tools.ready() || this.fields.disabled) return;
    const hit = this.tools.pickSurface(event);
    if (!hit) { this.prompt.textContent = 'Aucun mur ni sol visible à cet endroit. Réessayez.'; return; }
    const { hs } = this.tools;
    const { x, y, z } = hit.point;
    const level = Math.max(0, Math.floor((y + 0.025) / HOUSE_DATA.config.floorHeight));
    const sameLevel = HOUSE_DATA.rooms.filter(room => room.level === level);
    const offsets = [[0, 0], [0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26], [0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]];
    const room = hit.object.userData.room || offsets.map(([dx, dz]) => sameLevel.find(r => roomContains(r, x + dx, z + dz))).find(Boolean);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const point = hit.point.clone().addScaledVector(normal, 0.025);
    this.draft = { point: point.toArray(), pose: this.variants.capturePose(), room: room?.id || '' };
    this.cancel(false);
    this.draftAnchor?.remove();
    const draft = this.tools.makeAnchor();
    const dot = document.createElement('div');
    dot.className = 'client-measure-point feedback-draft';
    draft.append(dot);
    this.draftVisual = { point, el: draft };
    draft.hidden = !this.tools.project(this.draftVisual, true);
    this.draftAnchor = draft;
    this.panel.open = true;
    this.form.hidden = false;
    document.getElementById('feedback-anchor').textContent = room ? `Remarque · ${room.name}` : 'Remarque · Hors pièce';
    this.text.focus();
  }

  async post(button) {
    if (!this.canComment || !this.draft || this.posting) return;
    const text = this.text.value.trim();
    if (!text) return;
    this.posting = button.disabled = true;
    try {
      const { item } = await this.request({ ...this.draft, text });
      this.cancel();
      this.status.textContent = 'Remarque publiée dans ce dossier.';
      this.render([...this.notes, item]);
      this.posting = false;
      void this.refresh(false);
    } catch (error) { this.status.textContent = error.message; }
    finally { this.posting = button.disabled = false; }
  }

  render(notes) {
    this.notes = notes;
    this.anchors.forEach(anchor => anchor.el.remove());
    this.anchors = [];
    this.list.replaceChildren();
    this.nextCheck = 0;
    const groups = new Map();
    for (const note of notes) {
      const group = groups.get(note.room) || [];
      group.push(note);
      groups.set(note.room, group);
    }
    for (const [roomId, group] of groups) {
      const room = HOUSE_DATA.rooms.find(r => r.id === roomId);
      const title = document.createElement('h4');
      title.textContent = room ? `${room.name} · ${clientLevel(room.level)}` : 'Hors pièce';
      const block = document.createElement('ul');
      for (const note of group) {
        const row = document.createElement('li');
        const message = document.createElement('p');
        message.textContent = note.text;
        const view = document.createElement('button');
        view.type = 'button';
        view.className = 'btn-toggle btn-small';
        view.textContent = 'Voir le repère';
        view.addEventListener('click', () => {
          this.variants.pin(note.pose);
          this.selected = note.id;
          this.rebuildAnchors();
        });
        row.append(message, view);
        block.append(row);
      }
      this.list.append(title, block);
    }
    this.rebuildAnchors();
  }

  rebuildAnchors() {
    this.anchors.forEach(anchor => anchor.el.remove());
    this.anchors = [];
    this.nextCheck = 0;
    const notes = this.notes.filter(n => n.id !== this.selected).slice(-19);
    const selected = this.notes.find(n => n.id === this.selected);
    if (selected) notes.push(selected);
    for (const note of notes) {
      const el = this.tools.makeAnchor();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'client-hotspot feedback-pin';
      button.textContent = '●';
      button.setAttribute('aria-label', `Remarque : ${note.text.slice(0, 70)}`);
      const card = document.createElement('div');
      card.className = 'client-room-card';
      card.textContent = note.text;
      el.classList.toggle('is-open', note.id === this.selected);
      button.setAttribute('aria-expanded', String(note.id === this.selected));
      button.addEventListener('click', () => {
        const open = el.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(open));
        if (!open) button.blur();
      });
      el.append(button, card);
      this.anchors.push({ el, point: new THREE.Vector3().fromArray(note.point), occluded: true });
    }
  }

  update(now, suppressed) {
    const { tools } = this;
    const show = tools.ready() && !suppressed && !tools.measuring && !this.placing && !document.pointerLockElement;
    const { camera, sectionEnabled } = tools.hs;
    if (this.draftVisual) this.draftVisual.el.hidden = !show || !tools.project(this.draftVisual, true);
    const refresh = show && now >= this.nextCheck && (!this.nextCheck || this.lastSection !== sectionEnabled ||
      !this.lastView.equals(camera.matrixWorld) || !this.lastProjection.equals(camera.projectionMatrix));
    if (refresh) {
      this.nextCheck = now + 180;
      this.lastSection = sectionEnabled;
      this.lastView.copy(camera.matrixWorld);
      this.lastProjection.copy(camera.projectionMatrix);
    } else if (!show) this.nextCheck = 0;
    let blockers;
    for (const anchor of this.anchors) {
      const onScreen = show && tools.project(anchor, true);
      if (onScreen && refresh) {
        blockers ||= tools.blockers();
        tools.direction.copy(anchor.point).sub(camera.position);
        tools.ray.far = tools.direction.length() - 0.04;
        tools.ray.set(camera.position, tools.direction.normalize());
        anchor.occluded = tools.ray.intersectObjects(blockers).some(hit => !tools.clipped(hit.point));
      }
      const hidden = !onScreen || anchor.occluded;
      if (anchor.el.hidden !== hidden) anchor.el.hidden = hidden;
    }
  }
}
