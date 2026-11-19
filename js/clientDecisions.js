/** Propositions versionnées et validations dans le dossier de retours actif. */
class ClientDecisions {
  constructor(feedback) {
    this.feedback = feedback;
    this.variants = feedback.variants;
    this.role = window.PORTAL_CONTEXT?.role;
    this.modelHash = window.PROJECT_MODEL_HASH;
    this.section = document.getElementById('decision-section');
    this.creator = document.getElementById('decision-create');
    this.name = document.getElementById('decision-name');
    this.status = document.getElementById('decision-status');
    this.list = document.getElementById('decision-list');
    if (this.role === 'architect') {
      this.creator.hidden = false;
      this.creator.addEventListener('submit', event => { event.preventDefault(); void this.propose(event.submitter); });
    }
  }

  useChannel(channel) {
    this.section.hidden = !(channel && this.role);
    this.status.textContent = '';
    this.list.replaceChildren();
  }

  async refresh() {
    const { channel } = this.feedback;
    if (!channel || !this.role || this.pending) return;
    const generation = (this.requestNumber || 0) + 1;
    this.requestNumber = generation;
    try {
      const [{ proposals }, modelHash] = await Promise.all([this.feedback.request(null, 'GET', 'client-decisions'), this.modelHash]);
      if (channel === this.feedback.channel && generation === this.requestNumber) this.render(proposals, modelHash);
    } catch (error) {
      if (channel === this.feedback.channel && generation === this.requestNumber) this.status.textContent = error.message;
    }
  }

  async post(button, payload, success) {
    if (this.pending || !this.feedback.channel) return;
    this.pending = button.disabled = true;
    this.requestNumber = (this.requestNumber || 0) + 1;
    const { channel } = this.feedback;
    try {
      const modelHash = await this.modelHash;
      if (!modelHash) throw new Error('La maquette ne peut pas être vérifiée. Rechargez la visite en HTTPS.');
      await this.feedback.request({ ...payload, modelHash }, 'POST', 'client-decisions');
      if (channel === this.feedback.channel) this.status.textContent = success;
    } catch (error) {
      if (channel === this.feedback.channel) this.status.textContent = error.message;
    } finally {
      this.pending = button.disabled = false;
      void this.refresh();
    }
  }

  propose(button) {
    const variant = this.variants.capture();
    const name = VariantState.label(this.name.value) || variant?.name;
    if (!name || !variant) { this.status.textContent = 'Nommez d’abord la version à proposer.'; this.name.focus(); return; }
    if (variant.pose.e < 0.99) { this.status.textContent = 'Faites défiler jusqu’à l’élévation complète avant de proposer la vue.'; return; }
    return this.post(button, { action: 'propose', variant: { ...variant, name } }, `Version « ${name} » publiée dans ce dossier.`);
  }

  describe(variant) {
    const label = field => [...document.getElementById(`client-${field}`).options].find(option => option.value === variant[field])?.textContent || 'Du projet';
    return [label('floor'), label('facade'), SolarStudy.format(variant.hour), variant.solar?.date].filter(Boolean).join(' · ');
  }

  render(proposals, modelHash) {
    this.list.replaceChildren();
    if (!proposals.length) {
      const item = document.createElement('li');
      item.textContent = 'Aucune variante proposée dans ce dossier.';
      this.list.append(item);
    }
    for (const item of [...proposals].reverse()) {
      const { approval } = item, variant = approval?.snapshot || item.variant;
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const reference = item.id.slice(0, 8);
      name.textContent = `${variant.name} · ${reference}`;
      const detail = document.createElement('p');
      detail.textContent = this.describe(variant);
      const timestamp = document.createElement('p');
      timestamp.textContent = approval ? `Validée le ${new Date(approval.approvedAt).toLocaleString('fr-FR')}` :
        `Proposée le ${new Date(item.proposedAt).toLocaleString('fr-FR')}`;
      const actions = document.createElement('div');
      actions.className = 'btn-row client-actions';
      row.append(name, detail, timestamp, actions);
      const button = label => {
        const el = document.createElement('button');
        el.className = 'btn-toggle btn-small'; el.type = 'button'; el.textContent = label;
        actions.append(el);
        return el;
      };
      if (item.modelChanged) {
        const warning = document.createElement('p');
        warning.textContent = 'La maquette a changé depuis la proposition. L’instantané reste au dossier.';
        row.append(warning);
      } else if (item.modelHash !== modelHash) {
        const warning = document.createElement('p');
        warning.textContent = 'Rechargez la visite pour afficher la bonne maquette.';
        row.append(warning);
      } else {
        button('Voir cette version').addEventListener('click', () => this.variants.apply(variant));
        if (!approval && this.role === 'comment') {
          const approve = button('Valider cette version');
          approve.addEventListener('click', () => {
            const confirmed = confirm(`Valider « ${variant.name} » (${reference}) ?\n${this.describe(variant)}\nLa décision datée sera conservée dans ce dossier.`);
            if (confirmed) void this.post(approve, { action: 'approve', id: item.id }, 'Validation enregistrée. Cet instantané ne pourra plus être modifié.');
          });
        }
      }
      this.list.append(row);
    }
  }
}
