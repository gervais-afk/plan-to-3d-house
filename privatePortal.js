/** Portail mono-architecte. Jetons d’invitation hachés sur disque ; sessions opaques en mémoire. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { projectPattern, label, channelPattern } = require('./js/variantState');
const decisionStore = require('./decisionStore');

const directory = '.private-portal';
const hours = 3600000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const matches = (a, b) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const token = () => randomBytes(32).toString('base64url');
const isClient = session => session && session.role !== 'architect';

// Seuls les éléments génériques du viewer sont partagés. Les fichiers d’un projet passent
// tous par la même règle, y compris les requêtes HEAD et Range sur les rendus et les vidéos.
const viewerFiles = new Set(['js/portal-context.js', 'js/houseDataCore.js', 'js/data.js', 'js/projectLoader.js',
  'js/scene.js', 'js/variantState.js', 'js/solarStudy.js', 'js/realism.js', 'js/assets.js', 'js/presentationPlan.js',
  'js/renderStudio.js', 'js/scrollTour.js', 'js/walkController.js', 'js/minimap.js', 'js/solarOptions.js',
  'js/clientFinishes.js', 'js/clientTools.js', 'js/clientVariants.js', 'js/clientFeedback.js', 'js/clientBrochure.js',
  'js/app.js', 'js/workspace.js', 'css/workspace.css', 'js/clientDecisions.js', 'css/style.css', 'css/clientTools.css',
  'css/tokens.css', 'css/motion.css', 'js/icons.js', 'js/motion.js', 'js/presentMode.js', 'js/viewOrder.js', 'js/costEstimate.js', 'js/planBook.js', 'assets/vendor/jspdf-4.2.1.umd.min.js', 'js/home.js', 'js/coverImage.js', 'css/accueil.css', 'css/presentation.css', 'assets/fonts/manrope.woff2', 'assets/fonts/source-serif-4.woff2']);
const publicFiles = new Set(['portal.html', 'js/portal.js', 'css/portal.css', 'css/tokens.css', 'assets/fonts/manrope.woff2', 'assets/fonts/source-serif-4.woff2']);

function safePath(relative) {
  // Bloque aussi les dossiers cachés, secrets et liens symboliques (contrôlés avant l’envoi).
  return !relative.split('/').some(part => part.startsWith('.') || /^(?:openrouter\.key|.*\.key)$/i.test(part));
}

function allowClientFile(relative, session) {
  if (viewerFiles.has(relative)) return true;
  if (/^assets\/models\/[\w./-]+\.(?:gltf|glb|bin|jpe?g|png|webp)$/i.test(relative)) return true; // bibliothèque CC0 uniquement
  const parts = relative.split('/');
  if (relative === 'assets/cabinet/logo.png') return true;
  if (session.project === 'residence-verandas' && relative === 'projects/residence-verandas/planches/cahier.pdf') return true;
  return parts[0] === 'projects' && parts[1] === session.project && safePath(relative) &&
    (/^projects\/[^/]+\/project\.json$/.test(relative) || /\.(?:jpe?g|png|webp|hdr|glb|gltf|bin|mp4|webm)$/i.test(relative));
}

function createPortal({ root, projects, send, read, env = process.env, now = Date.now }) {
  const storage = path.join(root, directory);
  const enabled = env.PRIVATE_PORTAL === '1' || Boolean(env.PORTAL_PASSWORD) || fs.existsSync(storage);
  if (!enabled) return { enabled, directory };
  const password = env.PORTAL_PASSWORD || '';
  if (password.length < 16 || password.length > 1024) throw new Error('PORTAL_PASSWORD doit contenir entre 16 et 1024 caractères.');
  const origin = new URL(env.PORTAL_ORIGIN || 'http://127.0.0.1:' + (Number(env.PORT) || 8000));
  const secure = origin.protocol === 'https:';
  const local = ['127.0.0.1', '::1', 'localhost'].includes(env.HOST || '127.0.0.1');
  if (!secure && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && local && env.PORTAL_INSECURE_LOCAL === '1')) {
    throw new Error('Le portail exige PORTAL_ORIGIN en HTTPS (HTTP autorisé explicitement sur boucle locale uniquement).');
  }
  if (origin.href !== origin.origin + '/') throw new Error('PORTAL_ORIGIN doit être une origine sans chemin ni identifiants.');
  const passwordHash = digest(password);
  const defaultProject = projectPattern.test(env.PORTAL_DEFAULT_PROJECT || '') ? env.PORTAL_DEFAULT_PROJECT : null;
  const cookieName = secure ? '__Host-plan3d' : 'plan3d-local';
  // Un redémarrage sans configuration ne doit pas republier une installation privée.
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  const file = path.join(storage, 'invitations.json');
  let invitations = [];
  try { invitations = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(invitations)) throw new Error('Stockage des invitations invalide.');
  let byHash = new Map(invitations.map(invite => [invite.secretHash, invite]));
  let byId = new Map(invitations.map(invite => [invite.id, invite]));
  const sessions = new Map();
  let failureWindow = null;

  function persist(next) {
    fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
    const tmp = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(tmp, file);
    } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    invitations = next;
    byHash = new Map(next.map(invite => [invite.secretHash, invite]));
    byId = new Map(next.map(invite => [invite.id, invite]));
  }

  function cookie(req) {
    const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='));
    const value = raw?.slice(cookieName.length + 1);
    return tokenPattern.test(value || '') ? digest(value) : null;
  }

  function setCookie(res, value, millis) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.ceil(millis / 1000))}${secure ? '; Secure' : ''}`);
  }

  const active = invite => invite && !invite.revokedAt && invite.expiresAt > now();
  function sessionFor(key) {
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= now() || (session.inviteId && !active(byId.get(session.inviteId)))) {
      sessions.delete(key);
      return null;
    }
    return session;
  }

  function signIn(req, res, role, invite = null) {
    sessions.delete(cookie(req));
    for (const key of sessions.keys()) sessionFor(key);
    if (sessions.size >= 1000) return send(res, 503, { error: 'Trop de sessions actives. Réessayez plus tard.' });
    const value = token();
    const expiresAt = Math.min(now() + 12 * hours, invite?.expiresAt ?? Infinity);
    const session = { role, project: invite?.project || null, expiresAt, inviteId: invite?.id,
      decision: invite?.target ? { channel: invite.target.channel, proposalId: invite.target.proposalId } : null };
    sessions.set(digest(value), session);
    setCookie(res, value, expiresAt - now());
    return send(res, 200, describe(session));
  }

  const describe = s => s ? { role: s.role, project: s.project, expiresAt: s.expiresAt,
    decision: s.decision ? { ...s.decision } : null } : { role: null };
  const deny = (res, session) => send(res, session ? 403 : 401, { error: session ? 'Accès non autorisé.' : 'Invitation ou connexion requise.' });
  const inviteInfo = ({ secretHash, ...info }) => info;

  function authApi(req, res, urlPath, session) {
    if (req.method === 'GET' && urlPath === '/api/portal/session') return send(res, 200, describe(session));
    if (req.method === 'GET' && urlPath === '/api/portal/invitations') {
      return session?.role === 'architect' ? send(res, 200, { invitations: invitations.map(inviteInfo).reverse() }) : deny(res, session);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(res, 415, { error: 'JSON requis.' });
    if (!['/api/portal/login', '/api/portal/accept', '/api/portal/logout'].includes(urlPath) && session?.role !== 'architect') return deny(res, session);
    return read(req, res, 4096, body => {
      switch (urlPath) {
        case '/api/portal/login': {
          const time = now();
          if (!failureWindow || failureWindow.until <= time) failureWindow = { until: time + 60000, attempts: 0 };
          if (failureWindow.attempts >= 8) {
            res.setHeader('Retry-After', Math.ceil((failureWindow.until - time) / 1000));
            return send(res, 429, { error: 'Trop de tentatives. Réessayez dans une minute.' });
          }
          if (typeof body?.password !== 'string' || !matches(digest(body.password), passwordHash)) {
            failureWindow.attempts++;
            return send(res, 401, { error: 'Connexion invalide.' });
          }
          failureWindow = null;
          return signIn(req, res, 'architect');
        }
        case '/api/portal/accept': {
          const invite = typeof body?.token === 'string' && tokenPattern.test(body.token) ? byHash.get(digest(body.token)) : null;
          if (!active(invite)) return send(res, 403, { error: 'Invitation invalide, expirée ou révoquée.' });
          return signIn(req, res, invite.role, invite);
        }
        case '/api/portal/logout':
          sessions.delete(cookie(req));
          setCookie(res, '', 0);
          return send(res, 200, { ok: true });
        case '/api/portal/decision-links': {
          if (sessionFor(cookie(req))?.role !== 'architect') return deny(res, null);
          const { project, channel, proposalId, validHours } = body || {};
          if (typeof project !== 'string' || !projectPattern.test(project) || !channelPattern.test(channel || '') ||
              typeof proposalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proposalId) ||
              !Number.isInteger(validHours) || validHours < 1 || validHours > 720) {
            return send(res, 400, { error: 'Projet, dossier, proposition ou durée invalide (1 à 720 heures).' });
          }
          let proposal;
          try { proposal = decisionStore.get(projects, project, channel, proposalId); }
          catch (error) { return send(res, error.status || 500, { error: error.status ? error.message : 'Proposition indisponible.' }); }
          if (proposal.modelChanged) return send(res, 409, { error: 'La maquette a changé. Publiez une nouvelle proposition avant de créer un lien.' });
          if (proposal.decision || proposal.approval) return send(res, 409, { error: 'Cette proposition a déjà reçu une décision.' });
          const retained = invitations.filter(invite => active(invite) || invite.expiresAt > now() - 30 * 24 * hours);
          if (retained.length >= 1000) return send(res, 409, { error: 'Limite d’invitations atteinte.' });
          const secret = token();
          const invite = { id: randomUUID(), project, role: 'comment', label: `${label(proposal.variant.name)} · ${proposal.id.slice(0, 8)}`,
            target: { channel, proposalId }, kind: 'decision', secretHash: digest(secret), createdAt: now(),
            expiresAt: now() + validHours * hours, revokedAt: null };
          persist([...retained, invite]);
          return send(res, 201, { invitation: inviteInfo(invite), token: secret });
        }
        case '/api/portal/invitations': {
          // Réévalue la session après lecture du corps : elle a pu être fermée entre-temps.
          if (sessionFor(cookie(req))?.role !== 'architect') return deny(res, null);
          const { project, role, validHours } = body || {};
          if (typeof project !== 'string' || !projectPattern.test(project) || !fs.existsSync(path.join(projects, project, 'project.json')) ||
              !['read', 'comment'].includes(role) || !Number.isInteger(validHours) || validHours < 1 || validHours > 720) {
            return send(res, 400, { error: 'Projet, accès ou durée invalide (1 à 720 heures).'});
          }
          const retained = invitations.filter(invite => active(invite) || invite.expiresAt > now() - 30 * 24 * hours);
          if (retained.length >= 1000) return send(res, 409, { error: 'Limite d’invitations atteinte.' });
          const secret = token();
          const invite = { id: randomUUID(), project, role, label: label(body.label), secretHash: digest(secret),
            createdAt: now(), expiresAt: now() + validHours * hours, revokedAt: null };
          persist([...retained, invite]);
          return send(res, 201, { invitation: inviteInfo(invite), token: secret });
        }
        case '/api/portal/revoke': {
          if (sessionFor(cookie(req))?.role !== 'architect') return deny(res, null);
          const invite = byId.get(body?.id);
          if (!invite) return send(res, 404, { error: 'Invitation introuvable.' });
          if (!invite.revokedAt) persist(invitations.map(item => item === invite ? { ...item, revokedAt: now() } : item));
          for (const [key, login] of sessions) if (login.inviteId === invite.id) sessions.delete(key);
          return send(res, 200, { ok: true });
        }
        default: return send(res, 404, { error: 'Route introuvable.' });
      }
    });
  }

  function canReadPublishedMedia(relative, project) {
    const match = /^projects\/([^/]+)\/generated\/(images|videos|renders)(?:\/(.*))?$/i.exec(relative);
    if (!match) return true;
    const bucket = match[2].toLowerCase(), filename = match[3] || '';
    if (match[1] !== project || !filename || filename !== path.basename(filename)) return false;
    const manifestFile = path.join(projects, project, 'generated', 'manifest.json');
    let items;
    try { items = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).items; } catch { return false; }
    if (!Array.isArray(items)) return false;
    const published = item => item && item.status !== 'draft' && item.published !== false;
    if (bucket === 'videos') return items.some(item => published(item) && item.type === 'video' && item.file === relative);
    if (bucket === 'renders') return items.some(item => published(item) && item.type === 'image' && item.file === relative &&
      (item.catalog === true || item.book === true));
    const publicImage = items.some(item => published(item) && item.type === 'image' && typeof item.file === 'string' &&
      (item.file === relative || (item.file.startsWith(`projects/${project}/generated/images/`) &&
        path.basename(item.file) === item.file.slice(`projects/${project}/generated/images/`.length) &&
        path.parse(item.file).name + '-apercu.webp' === filename)));
    const publicPoster = items.some(item => published(item) && item.type === 'video' && item.poster === relative);
    return publicImage || publicPoster;
  }

  function guard(req, res, url, relative) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const reading = req.method === 'GET' || req.method === 'HEAD';
    const session = sessionFor(cookie(req));
    const urlPath = '/' + relative;
    if (!reading && req.headers.origin !== origin.origin) { send(res, 403, { error: 'Origine de la requête non autorisée.' }); return false; }
    if (urlPath.startsWith('/api/portal/')) { authApi(req, res, urlPath, session); return false; }
    if (reading && publicFiles.has(relative)) {
      if (relative === 'portal.html') res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
      return { session };
    }
    if (reading && ['index.html', 'accueil.html', 'editor.html'].includes(relative)) {
      if (!session) {
        res.writeHead(302, { Location: '/portal.html?next=' + encodeURIComponent(urlPath + url.search) }); res.end(); return false;
      }
      if (isClient(session)) {
        const project = url.searchParams.get('project');
        if (relative === 'editor.html' || (project && project !== session.project)) { deny(res, session); return false; }
        if (session.decision) {
          const expected = `/index.html?project=${encodeURIComponent(session.project)}&decision=${encodeURIComponent(session.decision.proposalId)}`;
          if (relative !== 'index.html' || project !== session.project || url.searchParams.get('decision') !== session.decision.proposalId) {
            res.writeHead(302, { Location: expected }); res.end(); return false;
          }
        } else if (!project) { res.writeHead(302, { Location: `/${relative}?project=${session.project}` }); res.end(); return false; }
      }
      if (session.role === 'architect' && relative === 'index.html' && defaultProject && !url.searchParams.has('project')) {
        res.writeHead(302, { Location: `/index.html?project=${defaultProject}` }); res.end(); return false;
      }
      return { session };
    }
    if (!session) { deny(res, null); return false; }
    if (relative === 'js/portal-context.js' && reading) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return void res.end('window.PORTAL_CONTEXT = ' + JSON.stringify(describe(session)) + ';');
    }
    if (!isClient(session)) return { session };
    if (/^projects\/[^/]+\/generated\/drafts(?:\/|\.json$)/i.test(relative)) { deny(res, session); return false; }
    if (relative.startsWith(`projects/${session.project}/generated/`) && !canReadPublishedMedia(relative, session.project)) { deny(res, session); return false; }
    if (urlPath === '/api/cabinet/profile' && req.method === 'GET') return { session };
    if (urlPath.startsWith('/api/presentation/')) {
      if (relative === 'api/presentation/settings' && req.method === 'GET' && url.searchParams.get('project') === session.project) return { session };
      deny(res, session);
      return false;
    }
    if (relative === 'js/data.js' && reading) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return void res.end('const HOUSE_DATA = { config: { ...HOUSE_DEFAULT_CONFIG }, assets: HOUSE_DEFAULT_ASSETS }; window.HOUSE_DATA = HOUSE_DATA;');
    }
    if (session.decision) {
      const project = url.searchParams.get('project');
      const channel = req.headers['x-feedback-channel'];
      if (relative === 'api/client-decisions' && project === session.project && channel === session.decision.channel &&
          ['GET', 'POST'].includes(req.method)) return { session, decision: session.decision };
      if (relative === 'api/client-feedback') { deny(res, session); return false; }
    }
    if (relative === 'api/projects' && req.method === 'GET') return { session, only: session.project };
    if (url.searchParams.get('project') === session.project &&
      ((relative === 'api/gallery/media' && req.method === 'GET') || (['api/client-feedback', 'api/client-decisions'].includes(relative) &&
        (req.method === 'GET' || (req.method === 'POST' && session.role === 'comment'))))) return { session };
    if (reading && allowClientFile(relative, session)) return { session };
    deny(res, session);
    return false;
  }

  return { enabled, guard, roleForProject(req, project) {
    const current = sessionFor(cookie(req));
    return current?.role === 'architect' || current?.project === project ? current?.role : null;
  }, decisionTargetFor(req, project) {
    const current = sessionFor(cookie(req));
    return current?.project === project ? current.decision : null;
  } };
}

module.exports = { createPortal, safePath };
