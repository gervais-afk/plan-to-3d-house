/** Écran d’invitation/connexion ; aucune donnée de projet avant authentification. */
(() => {
  const el = id => document.getElementById(`portal-${id}`);
  const status = el('status');
  const hash = new URLSearchParams(location.hash.slice(1));
  const invite = hash.get('invite');
  const params = new URLSearchParams(location.search);
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
    button.disabled = true;
    try { await task(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  }

  function nextVisit(session) {
    // Uniquement des documents de cette application. Jamais d’URL externe ni de redirection de l’éditeur pour un invité.
    let url;
    try { url = new URL(params.get('next') || '', location.origin); } catch { return null; }
    if (!params.has('next') || url.origin !== location.origin) return null;
    if (session.role === 'architect' && url.pathname === '/editor.html') return url.pathname + url.search + location.hash;
    if (!['/', '/index.html'].includes(url.pathname)) return null;
    if (session.project && url.searchParams.get('project') && url.searchParams.get('project') !== session.project) return null;
    return (session.project ? visit(session.project) : url.pathname + url.search) + location.hash;
  }

  async function listInvitations() {
    const { invitations } = await api('invitations');
    const list = el('list');
    list.replaceChildren();
    if (!invitations.length) {
      const row = document.createElement('li');
      row.textContent = 'Aucune invitation créée.';
      list.append(row);
    }
    for (const item of invitations) {
      const row = document.createElement('li'), title = document.createElement('span');
      const expired = item.expiresAt <= Date.now();
      const detail = item.revokedAt ? 'Révoquée' : expired ? 'Expirée' : `Valide jusqu’au ${new Date(item.expiresAt).toLocaleString('fr-FR')}`;
      title.textContent = [item.label, item.project, roleLabel(item.role), detail].filter(Boolean).join(' · ');
      row.append(title);
      if (!expired && !item.revokedAt) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'secondary'; button.textContent = 'Révoquer';
        button.addEventListener('click', () => {
          if (!confirm('Révoquer ce lien et fermer les sessions invitées correspondantes ?')) return;
          void run(button, async () => {
            await api('revoke', { id: item.id });
            el('new-link').hidden = true;
            el('link').value = '';
            status.textContent = 'Invitation révoquée. Les sessions liées ne peuvent plus accéder au projet.';
            await listInvitations();
          });
        });
        row.append(button);
      }
      list.append(row);
    }
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
    el('active-title').textContent = architect ? 'Session architecte' : `${session.project} · ${roleLabel(session.role)}`;
    el('visit').href = visit(session.project);
    el('editor').hidden = !architect;
    status.textContent = architect ? 'Gérez les accès projet par projet.' : 'Votre accès est limité à ce projet.';
    if (architect) {
      el('manage').hidden = false;
      const projects = await request('api/projects');
      el('project').replaceChildren(...projects.map(project => new Option(project.name, project.slug)));
      if (projects[0]) el('visit').href = visit(projects[0].slug);
      await listInvitations();
    }
  }

  el('invite').hidden = !invite;
  el('accept').addEventListener('click', event => {
    void run(event.currentTarget, async () => {
      const session = await api('accept', { token: invite });
      history.replaceState(null, '', location.pathname);
      location.replace(visit(session.project));
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
      const { token } = await api('invitations', { project: el('project').value, role: el('role').value,
        validHours: el('duration').valueAsNumber, label: el('label').value });
      const href = new URL('portal.html', location.href);
      href.hash = new URLSearchParams({ invite: token }).toString();
      el('link').value = href.href;
      el('new-link').hidden = false;
      status.textContent = 'Invitation créée.';
      await listInvitations();
    });
  });
  el('copy').addEventListener('click', async () => {
    const link = el('link');
    try { await navigator.clipboard.writeText(link.value); status.textContent = 'Lien copié.'; }
    catch { link.focus(); link.select(); status.textContent = 'Copiez le lien sélectionné.'; }
  });
  api('session').then(display).catch(error => {
    status.textContent = error.message;
    if (error.status === 404) { el('demo').hidden = false; el('invite').hidden = true; }
  });
})();
