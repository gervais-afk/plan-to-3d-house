/** Propositions versionnées, liens de validation et décisions immuables. */
class ClientDecisions {
  constructor(feedback) {
    this.feedback = feedback;
    this.variants = feedback.variants;
    this.role = window.PORTAL_CONTEXT?.role;
    this.target = window.PORTAL_CONTEXT?.decision || null;
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
    if (this.target && this.role === 'comment') this.setupApprovalCard();
  }

  useChannel(channel) {
    this.section.hidden = !(channel && this.role) || Boolean(this.target);
    this.status.textContent = '';
    this.list.replaceChildren();
  }

  setupApprovalCard() {
    this.card = document.getElementById('approval-card');
    this.cardProject = document.getElementById('approval-project');
    this.cardVersion = document.getElementById('approval-version');
    this.cardStatus = document.getElementById('approval-status');
    this.cardActions = document.getElementById('approval-actions');
    this.approveButton = document.getElementById('approval-approve');
    this.requestToggle = document.getElementById('approval-request-toggle');
    this.requestForm = document.getElementById('approval-request-form');
    this.comment = document.getElementById('approval-comment');
    this.returnButton = document.getElementById('approval-return');
    this.card.hidden = false;
    this.cardProject.textContent = HOUSE_DATA.meta?.name || this.variants.project;
    this.approveButton.addEventListener('click', () => {
      if (!this.item || !confirm(`Valider « ${this.item.variant.name} » (${this.item.id.slice(0, 8)}) ?\nCette décision datée sera conservée dans le dossier.`)) return;
      void this.post(this.approveButton, { action: 'approve', id: this.target.proposalId }, 'Validation enregistrée. Merci, votre décision a été transmise à l’architecte.');
    });
    this.requestToggle.addEventListener('click', () => {
      this.requestForm.hidden = false;
      this.requestToggle.hidden = true;
      this.comment.focus();
    });
    this.requestForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!this.comment.value.trim()) { this.comment.setCustomValidity('Un commentaire est nécessaire pour demander une modification.'); this.comment.reportValidity(); return; }
      this.comment.setCustomValidity('');
      void this.post(document.getElementById('approval-submit'), {
        action: 'request-changes', id: this.target.proposalId, comment: this.comment.value.trim()
      }, 'Votre demande de modification a été transmise à l’architecte.');
    });
    this.comment.addEventListener('input', () => this.comment.setCustomValidity(''));
    this.returnButton.addEventListener('click', () => {
      if (this.item && !this.item.modelChanged) this.variants.apply(this.item.variant);
    });
  }

  async portalRequest(endpoint, body) {
    const response = await fetch(`api/portal/${endpoint}`, { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'Impossible de créer le lien de validation.');
    return data;
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
      if (channel === this.feedback.channel && generation === this.requestNumber) {
        this.status.textContent = error.message;
        if (this.cardStatus) this.cardStatus.textContent = error.message;
      }
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
      if (channel === this.feedback.channel) {
        if (this.cardStatus) this.cardStatus.textContent = success;
        else this.status.textContent = success;
      }
    } catch (error) {
      if (channel === this.feedback.channel) {
        if (this.cardStatus) this.cardStatus.textContent = error.message;
        else this.status.textContent = error.message;
      }
    } finally {
      this.pending = button.disabled = false;
      if (channel === this.feedback.channel) void this.refresh();
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

  decisionOf(item) {
    return item.decision || (item.approval ? { type: 'approved', decidedAt: item.approval.approvedAt, comment: '' } : null);
  }

  async createLink(item, button, hoursSelect, result) {
    if (button.disabled) return;
    button.disabled = true;
    result.textContent = 'Création du lien…';
    try {
      const { token, invitation } = await this.portalRequest('decision-links', {
        project: this.variants.project, channel: this.feedback.channel, proposalId: item.id, validHours: Number(hoursSelect.value)
      });
      const url = new URL('portal.html', location.href);
      url.hash = new URLSearchParams({ invite: token }).toString();
      const field = document.createElement('input');
      field.type = 'url'; field.readOnly = true; field.value = url.href;
      field.setAttribute('aria-label', `Lien de validation pour ${item.variant.name}, expire le ${new Date(invitation.expiresAt).toLocaleString('fr-FR')}`);
      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'btn-toggle btn-small'; copy.textContent = 'Copier le lien';
      const status = document.createElement('span');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(field.value);
          status.textContent = 'Lien copié. Envoyez-le vous-même au client ; il expire et peut être révoqué dans le portail.';
        } catch {
          field.focus(); field.select();
          status.textContent = 'Copiez le lien sélectionné. Il expire et peut être révoqué dans le portail.';
        }
      });
      result.replaceChildren(field, copy);
      result.setAttribute('role', 'group');
      result.setAttribute('aria-label', `Lien de validation ${item.variant.name}`);
      const note = document.createElement('span');
      note.textContent = `Expire le ${new Date(invitation.expiresAt).toLocaleString('fr-FR')} · révocation dans le portail.`;
      result.append(note, status);
    } catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; }
  }

  render(proposals, modelHash) {
    if (this.target && this.role === 'comment') return this.renderApproval(proposals, modelHash);
    this.list.replaceChildren();
    if (!proposals.length) {
      const item = document.createElement('li');
      item.textContent = 'Aucune variante proposée dans ce dossier.';
      this.list.append(item);
    }
    for (const item of [...proposals].reverse()) {
      const decision = this.decisionOf(item), variant = decision?.snapshot || item.variant;
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const reference = item.id.slice(0, 8);
      name.textContent = `${variant.name} · ${reference}`;
      const detail = document.createElement('p');
      detail.textContent = this.describe(variant);
      const timestamp = document.createElement('p');
      timestamp.textContent = decision ? `${decision.type === 'approved' ? 'Validée' : 'Modification demandée'} le ${new Date(decision.decidedAt).toLocaleString('fr-FR')}` :
        `En attente · proposée le ${new Date(item.proposedAt).toLocaleString('fr-FR')}`;
      row.append(name, detail, timestamp);
      if (decision?.comment) {
        const comment = document.createElement('p');
        comment.textContent = `Commentaire du client : ${decision.comment}`;
        row.append(comment);
      }
      const actions = document.createElement('div');
      actions.className = 'btn-row client-actions';
      row.append(actions);
      const button = label => {
        const el = document.createElement('button');
        el.className = 'btn-toggle btn-small'; el.type = 'button'; el.textContent = label;
        actions.append(el);
        return el;
      };
      if (item.modelChanged) {
        const warning = document.createElement('p');
        warning.textContent = 'La maquette a changé depuis la proposition. L’instantané reste conservé ; publiez une nouvelle version pour reprendre la validation.';
        row.append(warning);
      } else if (item.modelHash !== modelHash) {
        const warning = document.createElement('p');
        warning.textContent = 'Rechargez la visite pour afficher la bonne maquette.';
        row.append(warning);
      } else {
        button('Voir cette version').addEventListener('click', () => this.variants.apply(variant));
        if (this.role === 'architect') {
          if (!decision) {
            const linkTools = document.createElement('div');
            linkTools.className = 'btn-row client-actions';
            const duration = document.createElement('select');
            duration.setAttribute('aria-label', `Durée du lien de validation ${variant.name}`);
            duration.append(new Option('24 heures', '24'), new Option('7 jours', '168'), new Option('30 jours', '720'));
            duration.value = '168';
            const create = document.createElement('button');
            create.type = 'button'; create.className = 'btn-toggle btn-small'; create.textContent = 'Créer un lien de validation';
            const result = document.createElement('div');
            result.className = 'decision-link-result';
            create.addEventListener('click', () => { void this.createLink(item, create, duration, result); });
            linkTools.append(duration, create);
            row.append(linkTools, result);
          }
        } else if (this.role === 'comment' && !decision) {
          const approve = button('Valider cette version');
          approve.addEventListener('click', () => {
            if (confirm(`Valider « ${variant.name} » (${reference}) ?\n${this.describe(variant)}\nLa décision datée sera conservée dans ce dossier.`)) {
              void this.post(approve, { action: 'approve', id: item.id }, 'Validation enregistrée.');
            }
          });
          const changes = button('Demander une modification');
          changes.addEventListener('click', () => this.addChangeForm(row, item, changes));
        }
      }
      this.list.append(row);
    }
  }

  addChangeForm(row, item, trigger) {
    if (row.querySelector('form')) return;
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Commentaire obligatoire';
    const text = document.createElement('textarea');
    text.maxLength = 700; text.rows = 3; text.required = true;
    label.append(text);
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.className = 'btn-toggle btn-small'; submit.textContent = 'Envoyer la demande';
    form.append(label, submit);
    row.append(form);
    trigger.hidden = true;
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!text.value.trim()) { text.reportValidity(); return; }
      void this.post(submit, { action: 'request-changes', id: item.id, comment: text.value.trim() }, 'Demande de modification enregistrée.');
    });
  }

  renderApproval(proposals, modelHash) {
    const item = proposals.find(proposal => proposal.id === this.target.proposalId);
    if (!item) {
      this.cardStatus.textContent = 'Cette proposition est introuvable dans son dossier. Demandez à votre architecte un nouveau lien.';
      this.cardActions.hidden = true;
      return;
    }
    this.item = item;
    const variant = item.decision?.snapshot || item.approval?.snapshot || item.variant;
    const ref = item.id.slice(0, 8);
    this.cardVersion.textContent = `${variant.name} · Réf. ${ref} · ${this.describe(variant)}`;
    this.returnButton.hidden = false;
    if (item.modelChanged || !modelHash || item.modelHash !== modelHash) {
      this.cardStatus.textContent = 'La maquette a changé depuis cette proposition. Aucune autre version ne sera substituée. Demandez à votre architecte de publier une nouvelle proposition.';
      this.cardActions.hidden = true;
      this.returnButton.hidden = true;
      return;
    }
    if (this.loadedId !== item.id) {
      this.variants.apply(variant);
      this.loadedId = item.id;
    }
    const decision = this.decisionOf(item);
    if (decision) {
      this.cardActions.hidden = true;
      this.requestForm.hidden = true;
      this.requestToggle.hidden = false;
      this.cardStatus.textContent = decision.type === 'approved'
        ? `Vous avez validé cette version le ${new Date(decision.decidedAt).toLocaleString('fr-FR')}. Votre réponse a été transmise à l’architecte.`
        : `Votre demande de modification a été transmise le ${new Date(decision.decidedAt).toLocaleString('fr-FR')}. L’architecte la retrouvera dans le dossier.`;
    } else {
      this.cardActions.hidden = false;
      this.cardStatus.textContent = '';
    }
  }
}
