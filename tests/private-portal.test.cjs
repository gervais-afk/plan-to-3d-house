const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const { createPortal } = require('../privatePortal');

const source = path.resolve(__dirname, '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'portail-test-'));

// Windows verrouille le dossier courant d’un processus : on arrête les serveurs avant d’effacer leur racine.
function workspace(t) {
  const root = temp();
  const servers = [];
  t.after(async () => {
    try {
      for (const server of servers.reverse()) await server.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
  return { root, track: server => (servers.push(server), server) };
}

async function port() {
  const sock = net.createServer();
  await new Promise(resolve => sock.listen(0, '127.0.0.1', resolve));
  const assigned = sock.address().port;
  await new Promise(resolve => sock.close(resolve));
  return assigned;
}

async function serve(root, variables = {}) {
  const n = await port();
  const origin = `http://127.0.0.1:${n}`;
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(n), PORTAL_ORIGIN: origin,
    PRIVATE_PORTAL: '', PORTAL_PASSWORD: '', PORTAL_INSECURE_LOCAL: '', ...variables };
  const processHandle = spawn(process.execPath, ['serve.js'], { cwd: root, env });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { processHandle.kill(); reject(new Error('Le serveur ne démarre pas.')); }, 5000);
    processHandle.once('exit', code => { clearTimeout(timer); reject(new Error(`Sortie du serveur : ${code}`)); });
    processHandle.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  const done = new Promise(resolve => processHandle.once('exit', resolve));
  return { origin, request: route => fetch(origin + route, { redirect: 'manual' }), async close() { processHandle.kill(); await done; } };
}

function fixture(root) {
  for (const file of ['serve.js', 'privatePortal.js', 'feedbackStore.js', 'decisionStore.js', 'portal.html', 'accueil.html', 'index.html', 'editor.html']) fs.copyFileSync(path.join(source, file), path.join(root, file));
  fs.mkdirSync(path.join(root, 'js'));
  for (const file of ['variantState.js', 'data.js']) fs.copyFileSync(path.join(source, 'js', file), path.join(root, 'js', file));
  for (const project of ['plan-a', 'plan-b']) {
    const dir = path.join(root, 'projects', project);
    fs.mkdirSync(path.join(dir, 'generated', 'renders'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ meta: { name: project } }));
    fs.writeFileSync(path.join(dir, 'generated', 'renders', 'facade.jpg'), 'Média de ' + project);
    fs.writeFileSync(path.join(dir, 'plan.jpg'), 'Plan de ' + project);
  }
  fs.mkdirSync(path.join(root, 'assets', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'plans', 'historique.jpg'), 'Plan ancien hors projet');
}

function actor(origin) {
  let cookie = '';
  const request = async (route, { method, body, headers = {} } = {}) => {
    const response = await fetch(origin + route, { redirect: 'manual', method: method || (body ? 'POST' : 'GET'),
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined });
    const issued = response.headers.get('set-cookie');
    if (issued) cookie = issued.split(';')[0];
    return response;
  };
  return { request, api: (route, body, headers) => request('/api/portal/' + route, { body, headers }) };
}

test('Mode démo conservé sans exposer les fichiers cachés', async t => {
  const { root, track } = workspace(t);
  fixture(root);
  fs.writeFileSync(path.join(root, '.env'), 'TEST=NON_PUBLIC');
  const server = track(await serve(root));
  assert.match(await (await server.request('/')).text(), /id="home-cover"/);
  assert.match(await (await server.request('/?project=plan-a')).text(), /id="webgl-container"/);
  assert.equal((await server.request('/index.html')).status, 200);
  assert.equal((await server.request('/projects/plan-a/project.json')).status, 200);
  assert.equal((await server.request('/api/portal/session')).status, 404);
  assert.equal((await server.request('/.env')).status, 404);
  assert.equal((await server.request('/%00')).status, 400);
});

test('Une installation privée ne revient pas en démo et refuse HTTP hors boucle locale', t => {
  const root = temp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projects = path.join(root, 'projects');
  const secret = randomBytes(24).toString('hex');
  assert.throws(() => createPortal({ root, projects, env: { PORTAL_PASSWORD: secret, HOST: '0.0.0.0', PORTAL_INSECURE_LOCAL: '1' } }), /HTTPS/);
  const secure = createPortal({ root, projects, env: { PORTAL_ORIGIN: 'https://visite.exemple.test', PORTAL_PASSWORD: secret } });
  assert.equal(secure.enabled, true);
  assert.throws(() => createPortal({ root, projects, env: {} }), /PORTAL_PASSWORD/);
});

test('Invitations : portée projet, rôles, accès direct, expiration et révocation active', async t => {
  const { root, track } = workspace(t);
  fixture(root);
  const password = randomBytes(24).toString('hex');
  const expiredToken = randomBytes(32).toString('base64url');
  const store = path.join(root, '.private-portal');
  fs.mkdirSync(store);
  fs.writeFileSync(path.join(store, 'invitations.json'), JSON.stringify([{ id: 'expired', project: 'plan-a', role: 'read',
    expiresAt: Date.now() - 5000, secretHash: createHash('sha256').update(expiredToken).digest('hex') }]));
  const server = track(await serve(root, { PRIVATE_PORTAL: '1', PORTAL_INSECURE_LOCAL: '1', PORTAL_PASSWORD: password }));
  const guest = actor(server.origin), architect = actor(server.origin), reader = actor(server.origin), commenter = actor(server.origin);
  const a = '/projects/plan-a', b = '/projects/plan-b';
  const render = '/generated/renders/facade.jpg';
  const protectedPaths = [b + '/project.json', b + '/plan.jpg', b + render, '/projects/plan-a/%2e%2e%2fplan-b/plan.jpg',
    '/index.html?project=plan-b', '/accueil.html?project=plan-b', '/editor.html', '/js/editor.js', '/api/gallery/media?project=plan-b', '/api/ai/status', '/assets/plans/historique.jpg'];
  assert.match((await guest.request('/index.html')).headers.get('location'), /^\/portal\.html\?next=/);
  assert.equal((await guest.request('/accueil.html?project=plan-a')).status, 302);
  assert.equal((await guest.request(a + render)).status, 401);
  assert.equal((await guest.request('/js/data.js')).status, 401);
  assert.equal((await guest.api('accept', { token: expiredToken })).status, 403);
  assert.equal((await guest.api('login', { password }, { Origin: 'https://autre.test' })).status, 403);
  const login = await architect.api('login', { password });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const invite = async (role) => {
    const response = await architect.api('invitations', { project: 'plan-a', role, validHours: 24 });
    assert.equal(response.status, 201);
    return response.json();
  };
  const read = await invite('read'), comment = await invite('comment');
  assert(!fs.readFileSync(path.join(store, 'invitations.json'), 'utf8').includes(read.token));
  assert.equal((await architect.request('/.private-portal/invitations.json')).status, 404);
  assert.equal((await architect.request(b + render)).status, 200);
  assert.equal((await reader.api('accept', { token: read.token })).status, 200);
  const accepted = await commenter.api('accept', { token: comment.token });
  assert.equal((await accepted.json()).role, 'comment');
  assert.equal((await reader.request('/index.html?project=plan-a')).status, 200);
  const cover = await reader.request('/accueil.html?project=plan-a');
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get('cache-control'), 'private, no-store');
  assert.equal((await reader.request(a + '/project.json')).status, 200);
  const range = await reader.request(a + render, { headers: { Range: 'bytes=0-4' } });
  assert.equal(range.status, 206);
  assert.match(range.headers.get('cache-control'), /no-store/);
  const head = await reader.request(a + render, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const route of protectedPaths) assert.equal((await reader.request(route)).status, 403, route);
  assert.equal((await reader.request(b + render, { headers: { Range: 'bytes=0-4' } })).status, 403);
  assert.equal((await reader.request(b + render, { method: 'HEAD' })).status, 403);
  const data = await (await reader.request('/js/data.js')).text();
  assert.match(data, /HOUSE_DEFAULT_CONFIG/);
  assert.doesNotMatch(data, /PORCHE|dimensionLines|wallHeight:|Engineer/);
  assert.deepEqual((await (await reader.request('/api/projects')).json()).map(p => p.slug), ['plan-a']);
  assert.equal((await reader.api('invitations')).status, 403);
  assert.equal((await reader.request('/api/save-render?project=plan-a', { body: { name: 'x.jpg', data: '' } })).status, 403);
  const note = { text: 'Retour test', point: [0, 0, 0], pose: { p: [0, 8, 1], q: [0, 0, 0, 1], f: 35, e: 1 } };
  const headers = { 'X-Feedback-Channel': 'a'.repeat(32) };
  assert.equal((await reader.request('/api/client-feedback?project=plan-a', { body: note, headers })).status, 403);
  assert.equal((await commenter.request('/api/client-feedback?project=plan-b', { body: note, headers })).status, 403);
  assert.equal((await commenter.request('/api/client-feedback?project=plan-a', { body: note, headers })).status, 201);
  assert.equal((await (await reader.request('/api/client-feedback?project=plan-a', { headers })).json()).notes.length, 1);
  assert.equal((await architect.api('revoke', { id: read.invitation.id })).status, 200);
  assert.equal((await reader.request(a + render)).status, 401);
  assert.equal((await reader.request(a + '/project.json')).status, 401);
  assert.equal((await reader.api('accept', { token: read.token })).status, 403);
  assert.equal((await commenter.request(a + render)).status, 200, 'une autre invitation reste valide');
});
