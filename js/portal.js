/** Écran d’invitation/connexion ; aucune donnée de projet avant authentification. */
(() => {
  const el = id => document.getElementById(`portal-${id}`);
  const status = el('status');
  const hash = new URLSearchParams(location.hash.slice(1));
  const invite = hash.get('invite');
  const params = new URLSearchParams(location.search);
  let currentLinkId;
  let listRequest = 0;
  const roleLabel = role => role === 'comment' ? 'Lecture et commentaires' : 'Lecture seule';
  const visit = project => project ? `index.html?project=${encodeURIComponent(project)}` : 'index.html';

  async function request(endpoint, body) {
    const options = { cache: 'no-store' };
    if (body !== undefined) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await fetch(endpoint, options);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw Object.assign(new Error(data?.error || 'Le portail privé n’est pas activé sur ce serveur.'), { status: res.status });
    return data;
  }

  const api = (endpoint, body) => request(`api/portal/${endpoint}`, body);
  async function run(button, task) {
    if (!button || button.disabled) return;
    button.disabled = true;
    status.classList.remove('is-error');
    try { await task(); }
    catch (error) { status.classList.add('is-error'); status.textContent = error.message; }
    finally { button.disabled = false; }
  }

  function nextVisit(session) {
    // Uniquement des documents de cette application. Jamais d’URL externe ni de redirection de l’éditeur pour un invité.
    let url;
    try { url = new URL(params.get('next') || '', location.origin); } catch { return null; }
    if (!params.has('next') || url.origin !== location.origin) return null;
    if (session.role === 'architect' && url.pathname === '/editor.html') return url.pathname + url.search + location.hash;
    if (!['/', '/index.html', '/accueil.html'].includes(url.pathname)) return null;
    if (session.project && url.searchParams.get('project') && url.searchParams.get('project') !== session.project) return null;
    if (session.project && url.pathname === '/accueil.html') return `/accueil.html?project=${encodeURIComponent(session.project)}`;
    return (session.project ? visit(session.project) : url.pathname + url.search) + location.hash;
  }

  async function listInvitations() {
    const requestId = ++listRequest;
    const list = el('list');
    list.setAttribute('aria-busy', 'true');
    try {
      const { invitations } = await api('invitations');
      if (requestId !== listRequest) return;
      const now = Date.now();
      const count = invitations.filter(item => !item.revokedAt && item.expiresAt > now).length;
      el('count').textContent = `${count} accès actif${count > 1 ? 's' : ''} · ${invitations.length} au total`;
      list.replaceChildren();
      if (!invitations.length) {
        const row = document.createElement('li');
        row.textContent = 'Aucune invitation créée. Créez votre premier lien pour partager une visite.';
        list.append(row);
      }
      for (const item of invitations) {
        const row = document.createElement('li');
        const details = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = item.label || item.project;
        const project = document.createElement('div');
        project.className = 'muted';
        project.textContent = [item.label && item.project, item.kind === 'decision' ? 'Lien de validation · proposition ciblée' : roleLabel(item.role)].filter(Boolean).join(' · ');
        const date = document.createElement('span');
        date.className = 'muted';
        const format = timestamp => new Date(timestamp).toLocaleString('fr-FR');
        date.textContent = item.revokedAt ? `Révoquée le ${format(item.revokedAt)}` : `Expire le ${format(item.expiresAt)}`;
        details.append(title, project, date);
        const actions = document.createElement('div');
        actions.className = 'invite-actions';
        const badge = document.createElement('span');
        const active = !item.revokedAt && item.expiresAt > now;
        badge.className = `invite-status ${active ? 'is-active' : ''}`;
        badge.textContent = item.revokedAt ? 'Révoquée' : active ? 'Active' : 'Expirée';
        actions.append(badge);
        if (active) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'secondary danger'; button.textContent = 'Révoquer';
          button.setAttribute('aria-label', `Révoquer : ${title.textContent}`);
          button.addEventListener('click', () => {
            if (!confirm('Révoquer ce lien et fermer les sessions invitées correspondantes ?')) return;
            void run(button, async () => {
              await api('revoke', { id: item.id });
              if (currentLinkId === item.id) {
                el('new-link').hidden = true;
                el('link').value = '';
                currentLinkId = null;
              }
              status.textContent = 'Invitation révoquée. Les sessions liées ne peuvent plus accéder au projet.';
              await listInvitations();
              el('refresh').focus();
            });
          });
          actions.append(button);
        }
        row.append(details, actions);
        list.append(row);
      }
    } finally { if (requestId === listRequest) list.removeAttribute('aria-busy'); }
  }

  async function display(session) {
    if (!session.role) {
      el('login').hidden = Boolean(invite);
      status.textContent = params.has('session') ? 'Session terminée ou projet inaccessible.' : 'Utilisez votre invitation ou connectez-vous comme architecte.';
      return;
    }
    const next = nextVisit(session);
    if (next && !invite) { location.replace(next); return; }
    const architect = session.role === 'architect';
    el('login').hidden = true;
    el('active').hidden = false;
    el('heading').textContent = architect ? 'Gestion des accès' : 'Votre visite privée';
    el('active-title').textContent = architect ? 'Session architecte' : `${session.project} · ${roleLabel(session.role)}`;
    const roleBanner = el('role-banner');
    const roleTag = el('role-tag');
    const roleScope = el('role-scope');
    if (roleBanner) roleBanner.dataset.role = architect ? 'architect' : 'guest';
    if (roleTag) roleTag.textContent = architect ? 'Mode Architecte' : 'Mode Invité · Client';
    if (roleScope) {
      roleScope.textContent = architect
        ? 'Édition de plans, validation Porte E, planches PDF et gestion des invitations'
        : `Accès restreint à ce projet (${roleLabel(session.role).toLowerCase()})`;
    }
    el('visit').href = visit(session.project);
    el('editor').hidden = !architect;
    status.textContent = architect ? 'Gérez les accès projet par projet.' : 'Votre accès est limité à ce projet.';
    if (architect) {
      el('manage').hidden = false;
      const submit = el('create').querySelector('button[type=submit]');
      submit.disabled = true;
      const projects = await request('api/projects');
      el('project').replaceChildren(...projects.map(project => new Option(project.name, project.slug)));
      const selected = projects.find(project => project.default) || projects[0];
      if (selected) { el('project').value = selected.slug; el('visit').href = visit(selected.slug); submit.disabled = false; }
      else status.textContent = 'Aucun projet disponible. Créez d’abord un projet dans l’éditeur.';
      await listInvitations();
    }
  }

  el('invite').hidden = !invite;
  el('accept').addEventListener('click', event => {
    void run(event.currentTarget, async () => {
      const session = await api('accept', { token: invite });
      history.replaceState(null, '', location.pathname);
      const destination = new URL(visit(session.project), location.href);
      if (session.decision?.proposalId) destination.searchParams.set('decision', session.decision.proposalId);
      location.replace(destination.pathname + destination.search);
    });
  });
  el('login').addEventListener('submit', event => {
    event.preventDefault();
    void run(event.submitter, async () => {
      const password = el('password').value;
      el('password').value = '';
      await display(await api('login', { password }));
    });
  });
  el('logout').addEventListener('click', event => {
    void run(event.currentTarget, async () => { await api('logout', {}); location.replace('portal.html'); });
  });
  el('create').addEventListener('submit', event => {
    event.preventDefault();
    void run(event.submitter, async () => {
      const { token, invitation } = await api('invitations', { project: el('project').value, role: el('role').value,
        validHours: el('duration').valueAsNumber, label: el('label').value });
      const href = new URL('portal.html', location.href);
      href.hash = new URLSearchParams({ invite: token }).toString();
      currentLinkId = invitation.id;
      el('link').value = href.href;
      el('new-link').hidden = false;
      status.textContent = 'Invitation créée. Vous pouvez copier le lien.';
      el('copy').focus();
      await listInvitations();
    });
  });
  el('refresh').addEventListener('click', event => {
    void run(event.currentTarget, async () => { await listInvitations(); status.textContent = 'Invitations actualisées.'; });
  });
  el('copy').addEventListener('click', async () => {
    const link = el('link');
    const btn = el('copy');
    try {
      await navigator.clipboard.writeText(link.value);
      status.textContent = 'Lien copié dans le presse-papiers.';
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Lien copié ✓';
        setTimeout(() => { btn.textContent = prev; }, 2200);
      }
    } catch {
      link.focus(); link.select(); status.textContent = 'Copiez le lien sélectionné.';
    }
  });
  api('session').then(display).catch(error => {
    status.classList.add('is-error');
    status.textContent = error.message;
    if (error.status === 404) { el('demo').hidden = false; el('invite').hidden = true; }
  });
})();
