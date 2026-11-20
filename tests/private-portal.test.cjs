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
  const expiredDecisionToken = randomBytes(32).toString('base64url');
  const store = path.join(root, '.private-portal');
  fs.mkdirSync(store);
  fs.writeFileSync(path.join(store, 'invitations.json'), JSON.stringify([
    { id: 'expired', project: 'plan-a', role: 'read', expiresAt: Date.now() - 5000,
      secretHash: createHash('sha256').update(expiredToken).digest('hex') },
    { id: 'expired-decision', project: 'plan-a', role: 'comment', kind: 'decision', target: { channel: 'a'.repeat(32), proposalId: '00000000-0000-4000-8000-000000000000' },
      expiresAt: Date.now() - 5000, secretHash: createHash('sha256').update(expiredDecisionToken).digest('hex') }
  ]));
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
  assert.equal((await guest.api('accept', { token: expiredDecisionToken })).status, 403, 'un lien de validation expiré est refusé à l’acceptation');
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

test('Lien de validation ciblé : accès direct à V2, décision immuable et V3 indépendante', async t => {
  const { root, track } = workspace(t);
  fixture(root);
  const password = randomBytes(24).toString('hex');
  const server = track(await serve(root, { PRIVATE_PORTAL: '1', PORTAL_INSECURE_LOCAL: '1', PORTAL_PASSWORD: password }));
  const architect = actor(server.origin), clientV2 = actor(server.origin), clientV3 = actor(server.origin), clientStale = actor(server.origin);
  assert.equal((await architect.api('login', { password })).status, 200);
  const project = 'plan-a', otherProject = 'plan-b', channel = 'e'.repeat(32);
  const headers = { 'X-Feedback-Channel': channel };
  const modelFile = path.join(root, 'projects', project, 'project.json');
  const hash = () => createHash('sha256').update(fs.readFileSync(modelFile)).digest('hex');
  const variant = name => ({ v: 1, project, name, floor: 'oak', facade: 'timber', hour: 13,
    pose: { p: [0, 8, 0.01], q: [0, 0, 0, 1], f: 42, e: 1 } });
  const publish = async name => {
    const response = await architect.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'propose', variant: variant(name), modelHash: hash() } });
    const result = await response.json();
    assert.equal(response.status, 201, result.error);
    assert.ok(result.item?.id, JSON.stringify(result));
    return result.item;
  };
  const createLink = async item => {
    const response = await architect.api('decision-links', { project, channel, proposalId: item.id, validHours: 72 });
    const result = await response.json();
    assert.equal(response.status, 201, result.error);
    return result;
  };
  const v2 = await publish('V2 · Bois');
  const linkV2 = await createLink(v2);
  assert.equal((await clientV2.api('accept', { token: linkV2.token })).status, 200);
  assert.deepEqual((await (await clientV2.request('/api/portal/session')).json()).decision, { channel, proposalId: v2.id });
  const direct = `/index.html?project=${project}&decision=${v2.id}`;
  assert.equal((await clientV2.request(direct)).status, 200);
  const altered = await clientV2.request(`/index.html?project=${project}&decision=00000000-0000-4000-8000-000000000000`);
  assert.equal(altered.status, 302);
  assert.equal(altered.headers.get('location'), direct);
  assert.equal((await clientV2.request(`/index.html?project=${otherProject}&decision=${v2.id}`)).status, 403);
  assert.deepEqual((await (await clientV2.request(`/api/client-decisions?project=${project}`, { headers })).json()).proposals.map(item => item.id), [v2.id]);
  assert.equal((await clientV2.request(`/api/client-decisions?project=${project}`, { headers: { 'X-Feedback-Channel': 'f'.repeat(32) } })).status, 403);
  assert.equal((await clientV2.request(`/api/client-feedback?project=${project}`, { headers })).status, 403);
  assert.equal((await clientV2.request(`/api/client-decisions?project=${otherProject}`, { headers })).status, 403);
  assert.equal((await clientV2.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'approve', id: '00000000-0000-4000-8000-000000000000', modelHash: hash() } })).status, 403);
  assert.equal((await clientV2.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'request-changes', id: v2.id, modelHash: hash(), comment: '' } })).status, 400);

  const decisionResponse = await clientV2.request(`/api/client-decisions?project=${project}`, { headers, body: {
    action: 'request-changes', id: v2.id, modelHash: hash(), comment: 'Merci de revoir la façade.'
  } });
  assert.equal(decisionResponse.status, 200);
  const v2Decision = (await decisionResponse.json()).item.decision;
  assert.equal(v2Decision.type, 'changes-requested');
  assert.equal(v2Decision.comment, 'Merci de revoir la façade.');
  assert.ok(Number.isFinite(Date.parse(v2Decision.decidedAt)));
  const duplicate = await clientV2.request(`/api/client-decisions?project=${project}`, { headers, body: {
    action: 'request-changes', id: v2.id, modelHash: hash(), comment: 'Tentative de remplacement.'
  } });
  assert.deepEqual((await duplicate.json()).item.decision, v2Decision);
  assert.equal((await clientV2.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'approve', id: v2.id, modelHash: hash() } })).status, 409);

  const v3 = await publish('V3 · Pierre');
  const linkV3 = await createLink(v3);
  assert.equal((await clientV3.api('accept', { token: linkV3.token })).status, 200);
  assert.deepEqual((await (await clientV3.request(`/api/client-decisions?project=${project}`, { headers })).json()).proposals.map(item => item.id), [v3.id]);
  const approved = await clientV3.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'approve', id: v3.id, modelHash: hash() } });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).item.decision.type, 'approved');
  assert.deepEqual((await (await architect.request(`/api/client-decisions?project=${project}`, { headers })).json()).proposals.find(item => item.id === v2.id).decision, v2Decision);
  assert.equal((await architect.api('revoke', { id: linkV3.invitation.id })).status, 200);
  assert.equal((await clientV3.request(`/api/client-decisions?project=${project}`, { headers })).status, 401);

  const staleProposal = await publish('V4 · Empreinte');
  const staleLink = await createLink(staleProposal);
  assert.equal((await clientStale.api('accept', { token: staleLink.token })).status, 200);
  fs.appendFileSync(modelFile, '\n');
  assert.equal((await (await clientStale.request(`/api/client-decisions?project=${project}`, { headers })).json()).proposals[0].modelChanged, true);
  assert.equal((await clientStale.request(`/api/client-decisions?project=${project}`, { headers, body: { action: 'approve', id: staleProposal.id, modelHash: hash() } })).status, 409);
  assert.equal((await (await architect.request(`/api/client-decisions?project=${project}`, { headers })).json()).proposals.find(item => item.id === staleProposal.id).decision, undefined);
});
