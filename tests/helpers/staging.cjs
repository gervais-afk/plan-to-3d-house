/** Recette TLS locale : copie isolée des mêmes maquettes que l’image de préproduction. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');

const source = path.resolve(__dirname, '../..');
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const close = server => new Promise(resolve => server.close(resolve));

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function start() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan3d-tls-'));
  let backend, edge;
  const stop = async () => {
    if (backend && backend.exitCode === null && !backend.signalCode) { backend.kill(); await once(backend, 'exit'); }
    if (edge?.listening) await close(edge);
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    for (const name of ['serve.js', 'privatePortal.js', 'feedbackStore.js', 'decisionStore.js', 'presentationStore.js', 'cabinetStore.js', 'accueil.html', 'index.html', 'editor.html', 'portal.html', 'js', 'css']) {
      copy(path.join(source, name), path.join(root, name));
    }
    copy(path.join(source, 'assets/fonts'), path.join(root, 'assets/fonts'));
    copy(path.join(source, 'assets/vendor'), path.join(root, 'assets/vendor'));
    copy(path.join(source, 'deploy/staging/projects'), path.join(root, 'projects'));
    fs.copyFileSync(path.join(source, 'deploy/staging/data.js'), path.join(root, 'js/data.js'));
    const keyFile = path.join(root, 'edge.key'), certFile = path.join(root, 'edge.crt');
    const opensslConf = process.env.OPENSSL_CONF || (fs.existsSync('C:\\Users\\HP\\anaconda3\\Library\\openssl.cnf') ? 'C:\\Users\\HP\\anaconda3\\Library\\openssl.cnf' : undefined);
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore', env: { ...process.env, ...(opensslConf ? { OPENSSL_CONF: opensslConf } : {}) } });
    const cert = fs.readFileSync(certFile);
    const reservation = net.createServer();
    const upstream = await listen(reservation);
    await close(reservation);
    edge = https.createServer({ key: fs.readFileSync(keyFile), cert }, (request, response) => {
      const proxy = http.request({ host: '127.0.0.1', port: upstream, path: request.url, method: request.method,
        headers: { ...request.headers, 'x-forwarded-proto': 'https' } }, from => {
        response.writeHead(from.statusCode, { ...from.headers, 'cache-control': 'private, no-store', 'strict-transport-security': 'max-age=86400' });
        from.pipe(response);
      });
      proxy.on('error', () => { response.writeHead(502); response.end(); });
      request.pipe(proxy);
    });
    const origin = `https://127.0.0.1:${await listen(edge)}`;
    const password = randomBytes(24).toString('hex');
    backend = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(upstream),
      PRIVATE_PORTAL: '1', PORTAL_ORIGIN: origin, PORTAL_INSECURE_LOCAL: '', PORTAL_PASSWORD: password, PORTAL_DEFAULT_PROJECT: 'atelier-temoin' } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Démarrage Node trop long')), 5000);
      backend.once('exit', code => { clearTimeout(timer); reject(new Error(`Node arrêté (${code})`)); });
      backend.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    return { root, origin, password, cert, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

function actor({ origin, cert }) {
  let cookie;
  const request = (route, { method, body, headers } = {}) => new Promise((resolve, reject) => {
    const outgoing = { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers };
    for (const name of Object.keys(outgoing)) if (outgoing[name] === undefined) delete outgoing[name];
    const req = https.request(origin + route, { ca: cert, method: method || (body ? 'POST' : 'GET'), headers: outgoing }, response => {
      const chunks = [];
      const issued = response.headers['set-cookie']?.[0];
      if (issued) cookie = issued.split(';')[0];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ status: response.statusCode, headers: response.headers, body: buffer, json: () => JSON.parse(buffer.toString()) });
      });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
  return { request, api: (route, body) => request(`/api/portal/${route}`, { body }) };
}

module.exports = { start, actor };
