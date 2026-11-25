// Serveur statique minimal (alternative à serve.py quand Python n'est pas installé) : node serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('node:crypto');
const feedbackStore = require('./feedbackStore');
const decisionStore = require('./decisionStore');
const presentationStore = require('./presentationStore');
const cabinetStore = require('./cabinetStore');
const { createPortal, safePath } = require('./privatePortal');
let DeliverableGate = null;
try { DeliverableGate = require('./js/deliverableGate'); } catch { /* fixtures isolées sans js/deliverableGate.js */ }

const PORT = Number(process.env.PORT) || 8000;
const ROOT = fs.realpathSync(__dirname);
const PROJECTS = path.join(ROOT, 'projects');
const portal = createPortal({ root: ROOT, projects: PROJECTS, send: sendJson, read: readBody });
const TYPES = {
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream'
};

// Médias isolés par projet : projects/<slug>/generated/{renders,images,videos,manifest.json}
function projectSlug(value) {
  const slug = String(value || 'residence-verandas');
  if (!/^[a-z0-9-]{1,60}$/i.test(slug)) throw new Error('projet invalide');
  return slug.toLowerCase();
}

function projectMedia(slug) {
  const generated = path.join(PROJECTS, projectSlug(slug), 'generated');
  return {
    generated,
    renders: path.join(generated, 'renders'),
    images: path.join(generated, 'images'),
    videos: path.join(generated, 'videos'),
    manifest: path.join(generated, 'manifest.json'),
    prefix: `projects/${projectSlug(slug)}/generated/`
  };
}

function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile() && !fs.existsSync(to)) fs.copyFileSync(from, to);
  }
}

function ensureProjectMedia(slug) {
  const media = projectMedia(slug);
  fs.mkdirSync(media.generated, { recursive: true });
  if (!fs.existsSync(media.manifest) && projectSlug(slug) === 'villa-serena') {
    const legacyManifest = path.join(ROOT, 'assets', 'generated', 'manifest.json');
    if (fs.existsSync(legacyManifest)) {
      copyTree(path.join(ROOT, 'assets', 'generated', 'images'), media.images);
      copyTree(path.join(ROOT, 'assets', 'generated', 'videos'), media.videos);
      copyTree(path.join(ROOT, 'assets', 'renders'), media.renders);
      const manifest = JSON.parse(fs.readFileSync(legacyManifest, 'utf8'));
      for (const item of manifest.items || []) {
        for (const key of ['file', 'reference', 'sourceImage', 'poster']) {
          if (typeof item[key] !== 'string') continue;
          item[key] = item[key].replace(/^assets\/generated\//, media.prefix).replace(/^assets\/renders\//, `${media.prefix}renders/`);
        }
      }
      fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
    }
  }
  if (!fs.existsSync(media.manifest)) fs.writeFileSync(media.manifest, JSON.stringify({ version: 1, items: [] }, null, 2));
  return media;
}

// Enregistrement des rendus HD dans le dossier du projet actif.
function saveRender(req, res, url) {
  let size = 0;
  const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > 30 * 1024 * 1024) { res.writeHead(413); res.end(); req.destroy(); }
    else chunks.push(c);
  });
  req.on('end', () => {
    try {
      const { name, data } = JSON.parse(Buffer.concat(chunks).toString());
      const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(data || '');
      if (!/^[a-z0-9_-]+\.(jpg|png)$/i.test(name || '') || !m) throw new Error('requête invalide');
      const slug = projectSlug(url.searchParams.get('project'));
      const media = ensureProjectMedia(slug);
      fs.mkdirSync(media.renders, { recursive: true });
      fs.writeFileSync(path.join(media.renders, name), Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: `${media.prefix}renders/${name}` }));
    } catch (e) {
      res.writeHead(400);
      res.end(String(e.message));
    }
  });
}

// Sélections de l’architecte sur une image publiée : catalogue des intérieurs et cahier de plans.
function galleryFlags(req, res, url, access = {}) {
  readBody(req, res, 4 * 1024, body => {
    const { id } = body || {};
    const flags = Object.fromEntries(['catalog', 'book', 'fidelityAccepted'].filter(key => typeof body?.[key] === 'boolean').map(key => [key, body[key]]));
    const hasOverride = body && Object.prototype.hasOwnProperty.call(body, 'fidelityOverride');
    let nextOverride;
    if (hasOverride) {
      if (body.fidelityOverride === null) nextOverride = null;
      else {
        const actor = String(access?.session?.label || access?.session?.role || 'architect');
        nextOverride = sanitizeFidelityOverride(body.fidelityOverride, actor);
        if (!nextOverride) {
          return sendJson(res, 422, { error: 'Le forçage de fidélité exige un motif et un verdict valides.' });
        }
      }
    }
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id) || (!Object.keys(flags).length && !hasOverride)) {
      return sendJson(res, 422, { error: 'Indiquez une image et un choix catalogue ou cahier.' });
    }
    let media;
    try { media = ensureProjectMedia(projectSlug(url.searchParams.get('project'))); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8')); }
    catch { return sendJson(res, 409, { error: 'Le manifeste du projet est illisible.' }); }
    if (!manifest || !Array.isArray(manifest.items)) return sendJson(res, 409, { error: 'Le manifeste du projet est invalide.' });
    let item = manifest.items.find(entry => entry && entry.type === 'image' && entry.id === id);
    if (!item) {
      // Les captures Three.js résident dans renders/ plutôt que images/ ; ne les inscris
      // qu’à la demande, après avoir confirmé que le fichier du projet existe.
      const renderStem = /^render-([a-z0-9_-]{1,70})$/i.exec(id);
      if (renderStem) {
        const name = ['jpg', 'png'].map(ext => `${renderStem[1]}.${ext}`).find(candidate =>
          candidate === path.basename(candidate) && fs.existsSync(path.join(media.renders, candidate)));
        if (name) {
          item = { id, type: 'image', file: `${media.prefix}renders/${name}`, label: renderStem[1].replace(/[-_]+/g, ' '), generator: 'Three.js', catalog: false, book: false };
          manifest.items.push(item);
        }
      }
    }
    if (!item) return sendJson(res, 404, { error: 'Image introuvable dans ce projet.' });
    const candidate = { ...item, ...flags };
    if (hasOverride) {
      if (nextOverride) { candidate.fidelityOverride = nextOverride; candidate.fidelityAccepted = true; }
      else { delete candidate.fidelityOverride; candidate.fidelityAccepted = false; }
    }
    if (DeliverableGate && (flags.catalog === true || flags.book === true)) {
      const verdict = DeliverableGate.evaluate(candidate);
      if (!verdict.eligible) {
        return sendJson(res, 422, { error: `Affectation refusée (Porte E) : ${verdict.reason}. Un forçage tracé avec motif est requis.` });
      }
    }
    Object.assign(item, flags);
    if (hasOverride) {
      if (nextOverride) { item.fidelityOverride = nextOverride; item.fidelityAccepted = true; }
      else { delete item.fidelityOverride; item.fidelityAccepted = false; }
    }
    atomicFile(media.manifest, JSON.stringify(manifest, null, 2));
    return sendJson(res, 200, {
      ok: true, id, catalog: item.catalog === true, book: item.book === true,
      ...(item.fidelityOverride ? { fidelityOverride: item.fidelityOverride } : {})
    });
  });
}

function presentationApi(req, res, url, pathname) {
  let project;
  try { project = projectSlug(url.searchParams.get('project')); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  try {
    if (req.method === 'GET' && pathname === '/api/presentation/settings') return sendJson(res, 200, presentationStore.get(PROJECTS, project));
    if (req.method === 'GET' && pathname === '/api/presentation/drafts') return sendJson(res, 200, { drafts: presentationStore.listDrafts(PROJECTS, project) });
    if (req.method === 'GET' && pathname === '/api/presentation/draft-image') {
      const image = presentationStore.draftImage(PROJECTS, project, url.searchParams.get('id'));
      const ext = image.ext === 'jpg' ? '.jpg' : `.${image.ext}`;
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(image.file).on('error', () => res.destroy()).pipe(res);
    }
    if (req.method === 'POST' && pathname.startsWith('/api/presentation/')) {
      const limit = pathname.endsWith('/settings') ? 16 * 1024 : 8 * 1024;
      return readBody(req, res, limit, body => {
        try {
          if (pathname === '/api/presentation/settings') return sendJson(res, 200, presentationStore.save(PROJECTS, project, body));
          if (pathname === '/api/presentation/drafts') return sendJson(res, 201, { draft: presentationStore.createDraft(PROJECTS, project, body) });
          if (pathname === '/api/presentation/publish-draft') return sendJson(res, 200, { item: presentationStore.publishDraft(PROJECTS, project, body) });
          return sendJson(res, 404, { error: 'Route introuvable.' });
        } catch (error) { return sendJson(res, error.status || 500, { error: error.status ? error.message : 'Opération de présentation impossible.' }); }
      });
    }
    return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  } catch (error) { return sendJson(res, error.status || 500, { error: error.status ? error.message : 'Opération de présentation impossible.' }); }
}

// Modèles de photoréalisation autorisés (identifiants vérifiés sur l'API publique OpenRouter, novembre 2026).
// Garder aligné avec IMAGE_MODELS dans js/app.js.
const IMAGE_MODELS = ['google/gemini-3.1-flash-image', 'microsoft/mai-image-2.7-flash', 'bytedance-seed/seedream-5-0-flash'];

// Enregistre une photoréalisation en ajoutant/remplaçant uniquement son entrée dans le manifeste.
// Étiquettes du prompt piloté par le projet (js/aiPrompt.js) : clés connues, valeurs courtes, rien d'autre.
const PROMPT_TAG_KEYS = ['kind', 'room', 'use', 'floor', 'facade', 'hour', 'sun', 'city', 'planVersion'];
function promptTags(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const clean = {};
  for (const key of PROMPT_TAG_KEYS) {
    const value = tags[key];
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'string' && value) clean[key] = value.slice(0, 40);
    else clean[key] = null;
  }
  return clean;
}

// Contrôle géométrique calculé dans le navigateur (js/fidelityCheck.js) : nombres bornés, verdict connu.
function fidelityTile(tile) {
  if (!tile || typeof tile !== 'object') return null;
  const row = Number(tile.row), col = Number(tile.col), score = Number(tile.score);
  if (!Number.isInteger(row) || row < 0 || row > 2 || !Number.isInteger(col) || col < 0 || col > 2 || !Number.isFinite(score)) return null;
  return { row, col, score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)) };
}

function fidelityResult(value) {
  if (!value || typeof value !== 'object' || !['faithful', 'review', 'unfaithful'].includes(value.verdict)) return null;
  const unit = n => Number.isFinite(Number(n)) ? Math.max(0, Math.min(1, Math.round(Number(n) * 1000) / 1000)) : 0;
  const offset = n => Number.isFinite(Number(n)) ? Math.max(-1, Math.min(1, Math.round(Number(n) * 1000) / 1000)) : 0;
  const worstTile = fidelityTile(value.worstTile);
  const addedTile = fidelityTile(value.addedTile);
  const result = {
    version: Number.isInteger(value.version) ? value.version : 0,
    verdict: value.verdict, score: unit(value.score), recall: unit(value.recall), chance: unit(value.chance),
    shift: { x: offset(value.shift?.x), y: offset(value.shift?.y) },
    aspect: Number.isFinite(Number(value.aspect)) ? Math.round(Number(value.aspect) * 1000) / 1000 : null
  };
  if (worstTile) result.worstTile = worstTile;
  if (addedTile) result.addedTile = addedTile;
  return result;
}

function sanitizeFidelityOverride(value, actor = 'architect') {
  if (DeliverableGate) return DeliverableGate.sanitizeOverride(value, { actor });
  if (!value || typeof value !== 'object') return null;
  const reason = String(value.reason || '').trim().slice(0, 300);
  if (!reason || !['faithful', 'review', 'unfaithful', 'missing'].includes(value.verdict)) return null;
  const fidelityVersion = Number.isInteger(value.fidelityVersion) && value.fidelityVersion >= 0 ? value.fidelityVersion : 0;
  const acceptedAt = typeof value.acceptedAt === 'string' && Number.isFinite(Date.parse(value.acceptedAt))
    ? new Date(value.acceptedAt).toISOString() : new Date().toISOString();
  const acceptedBy = String(value.acceptedBy || actor || 'architect').trim().slice(0, 80) || 'architect';
  return { acceptedAt, acceptedBy, reason, fidelityVersion, verdict: value.verdict };
}

function isAiItem(item) {
  if (DeliverableGate) return DeliverableGate.isAiRender(item);
  return Boolean(item && (item.ai === true || /^photor-/i.test(String(item.id || '')) || /openrouter/i.test(String(item.generator || ''))));
}

function isDeliverableEligible(item) {
  if (DeliverableGate) return DeliverableGate.isEligible(item);
  if (!isAiItem(item)) return true;
  return item.fidelity?.version >= 2 && item.fidelity?.verdict === 'faithful';
}

function imageDimensionsFromBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // PNG : signature 8 octets + IHDR (width @16, height @20)
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // JPEG : marqueurs SOF0..SOF15 (hors C4, C8, CC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= buf.length) {
      while (offset < buf.length && buf[offset] !== 0xff) offset++;
      while (offset < buf.length && buf[offset] === 0xff) offset++;
      if (offset >= buf.length) break;
      const marker = buf[offset++];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > buf.length) break;
      const length = buf.readUInt16BE(offset);
      if (length < 2 || offset + length > buf.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (offset + 7 <= buf.length) {
          const height = buf.readUInt16BE(offset + 3), width = buf.readUInt16BE(offset + 5);
          return width > 0 && height > 0 ? { width, height } : null;
        }
        break;
      }
      offset += length;
    }
    return null;
  }
  // WebP : RIFF....WEBP (VP8X / VP8L / VP8 )
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunk === 'VP8L' && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }
  return null;
}

function saveGenerated(req, res, url) {
  readBody(req, res, 30 * 1024 * 1024, body => {
    try {
      const { id, data, metadata = {} } = body || {};
      if (!/^photor-[a-z0-9_-]{1,70}$/i.test(id || '')) throw new Error('identifiant invalide');
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data || '');
      if (!match) throw new Error('image invalide');
      const slug = projectSlug(url.searchParams.get('project'));
      const media = ensureProjectMedia(slug);
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const file = `${media.prefix}images/${id}.${ext}`;
      const imageBuffer = Buffer.from(match[2], 'base64');
      fs.mkdirSync(media.images, { recursive: true });
      fs.writeFileSync(path.join(media.images, `${id}.${ext}`), imageBuffer);
      const measuredSize = imageDimensionsFromBuffer(imageBuffer);
      const validDim = value => {
        const n = Number(value);
        return Number.isFinite(n) && n >= 1 && n <= 8192 ? Math.round(n) : null;
      };

      const manifestPath = media.manifest;
      let manifest = { version: 1, items: [] };
      if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest || !Array.isArray(manifest.items)) throw new Error('manifeste invalide');
      const referencePrefix = `${media.prefix}renders/`;
      const reference = typeof metadata.reference === 'string' && metadata.reference.startsWith(referencePrefix)
        && /^[a-z0-9_-]+\.(?:jpg|png)$/i.test(metadata.reference.slice(referencePrefix.length)) ? metadata.reference : null;
      const item = {
        id, type: 'image', file, reference,
        room: typeof metadata.room === 'string' ? metadata.room.slice(0, 80) : null,
        label: String(metadata.label || id).slice(0, 120),
        width: measuredSize?.width ?? validDim(metadata.width),
        height: measuredSize?.height ?? validDim(metadata.height),
        generator: IMAGE_MODELS.includes(metadata.model)
          ? `OpenRouter · ${metadata.model}` : 'OpenRouter · google/gemini-3.1-flash-image',
        prompt: String(metadata.prompt || '').slice(0, 6000),
        tags: promptTags(metadata.tags),
        fidelity: fidelityResult(metadata.fidelity),
        notes: 'Image issue du rendu Three.js ; géométrie à vérifier visuellement.',
        catalog: false,
        book: false
      };
      const index = manifest.items.findIndex(existing => existing.id === id);
      if (index >= 0) {
        const previous = manifest.items[index];
        // Régénération : tout ancien forçage expire ; on ne conserve la publication que si le nouveau rendu est fidèle.
        const eligible = isDeliverableEligible(item);
        item.catalog = eligible && typeof previous.catalog === 'boolean' ? previous.catalog : false;
        item.book = eligible && previous.book === true;
        manifest.items[index] = item;
      } else manifest.items.push(item);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// Enregistre une vidéo capturée localement par MediaRecorder (sans appel IA).
function saveVideo(req, res, url) {
  let slug;
  let media;
  try { slug = projectSlug(url.searchParams.get('project')); media = ensureProjectMedia(slug); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  const id = String(req.headers['x-video-id'] || '').trim();
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = mime === 'video/mp4' ? 'mp4' : mime === 'video/webm' ? 'webm' : null;
  if (!/^[a-z0-9_-]{1,80}$/i.test(id) || !ext) {
    res.writeHead(ext ? 400 : 415, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Identifiant ou type vidéo invalide (formats acceptés : MP4, WebM).' }));
  }

  const dir = media.videos;
  const file = `${media.prefix}videos/${id}.${ext}`;
  const target = path.join(dir, `${id}.${ext}`);
  const temp = target + '.tmp';
  const maxBytes = 250 * 1024 * 1024;
  fs.mkdirSync(dir, { recursive: true });
  let size = 0;
  let rejected = false;
  const output = fs.createWriteStream(temp, { flags: 'w' });
  const reject = (status, message) => {
    if (rejected) return;
    rejected = true;
    output.destroy();
    req.resume();
    fs.rm(temp, { force: true }, () => {});
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  };

  req.on('data', chunk => {
    size += chunk.length;
    if (size > maxBytes) return reject(413, 'Vidéo trop volumineuse (limite 250 Mo).');
    if (!rejected && !output.write(chunk)) req.pause();
  });
  output.on('drain', () => req.resume());
  req.on('end', () => { if (!rejected) output.end(); });
  req.on('error', error => reject(400, error.message));
  output.on('error', error => reject(500, error.message));
  output.on('finish', () => {
    if (rejected) return;
    if (!size) return reject(400, 'Vidéo vide.');
    try {
      const manifestPath = media.manifest;
      let manifest = { version: 1, items: [] };
      if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest || !Array.isArray(manifest.items)) throw new Error('Manifeste invalide.');
      fs.renameSync(temp, target);
      const duration = Math.max(0, Math.min(3600, Number(req.headers['x-video-duration']) || 0));
      const item = {
        id, type: 'video', file, mimeType: mime, label: 'Visite cinématique',
        duration: Math.round(duration), generator: 'MediaRecorder local', createdAt: new Date().toISOString(), size
      };
      const index = manifest.items.findIndex(existing => existing && existing.id === id);
      if (index >= 0) manifest.items[index] = item;
      else manifest.items.push(item);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (error) {
      reject(500, error.message);
    }
  });
}

// Galerie : ne renvoyer que les médias réellement présents dans le projet actif.
function galleryMedia(res, url, access = {}) {
  let media;
  try { media = ensureProjectMedia(projectSlug(url.searchParams.get('project'))); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  const imagePrefix = `${media.prefix}images/`;
  const videoPrefix = `${media.prefix}videos/`;
  const renderPrefix = `${media.prefix}renders/`;
  const planchesPrefix = `projects/${projectSlug(url.searchParams.get('project'))}/planches/`;
  let manifestItems = [];
  try {
    const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
    if (Array.isArray(manifest.items)) manifestItems = manifest.items;
  } catch (e) { /* galerie vide si le manifeste est absent ou invalide */ }

  const images = manifestItems.filter(item => item && item.type === 'image' && item.status !== 'draft' && item.published !== false && typeof item.file === 'string')
    .filter(item => {
      const isImage = item.file.startsWith(imagePrefix), isRender = item.file.startsWith(renderPrefix);
      const name = item.file.slice(isImage ? imagePrefix.length : isRender ? renderPrefix.length : 0);
      const dir = isImage ? media.images : isRender ? media.renders : null;
      return !!dir && name === path.basename(name) && /^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(name)
        && fs.existsSync(path.join(dir, name)) && fs.statSync(path.join(dir, name)).isFile();
    }).map(item => {
      const imageName = item.file.startsWith(imagePrefix) ? item.file.slice(imagePrefix.length) : null;
      const preview = imageName && path.parse(imageName).name + '-apercu.webp';
      return {
        id: String(item.id || ''), type: 'image', file: item.file,
        preview: preview && fs.statSync(path.join(media.images, preview), { throwIfNoEntry: false })?.isFile() ? imagePrefix + preview : null,
        reference: typeof item.reference === 'string' && [renderPrefix, imagePrefix, planchesPrefix].some(prefix => item.reference.startsWith(prefix)
          && /^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(item.reference.slice(prefix.length))) ? item.reference : null,
        ai: isAiItem(item),
        source: typeof item.source === 'string' ? item.source : null,
        sourceKind: DeliverableGate ? DeliverableGate.imageSourceKind(item) : null,
        fidelity: fidelityResult(item.fidelity),
        fidelityOverride: sanitizeFidelityOverride(item.fidelityOverride) || null,
        fidelityAccepted: item.fidelityAccepted === true,
        room: item.room || null, label: item.label || item.id || 'Image générée', cover: item.cover === true,
        // Les anciennes images publiées restent visibles si le choix catalogue n’existait pas encore.
        catalog: item.catalog === true || item.catalog === undefined, book: item.book === true,
        ...(access.session?.role && access.session.role !== 'architect' ? {} : { generator: item.generator || '', prompt: item.prompt || '', notes: item.notes || '' }),
        width: item.width || null, height: item.height || null
      };
    });

  const videos = manifestItems.filter(item => item && item.type === 'video' && item.status !== 'draft' && item.published !== false && typeof item.file === 'string')
    .filter(item => item.file.startsWith(videoPrefix) && path.basename(item.file) === item.file.slice(videoPrefix.length) &&
      /\.(?:mp4|webm)$/i.test(item.file) && fs.existsSync(path.join(media.videos, path.basename(item.file))))
    .map(item => {
    const file = item.file;
    const entry = { name: path.basename(file) };
    const posterName = typeof item.poster === 'string' && item.poster.startsWith(imagePrefix) ? item.poster.slice(imagePrefix.length) : '';
    const poster = posterName && posterName === path.basename(posterName) && fs.existsSync(path.join(media.images, posterName))
      ? imagePrefix + posterName : null;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    return { id: String(item.id || path.parse(entry.name).name), type: 'video', file, poster, format: ext,
      duration: Number(item.duration) || null, label: item.label || path.parse(entry.name).name,
      ...(access.session?.role && access.session.role !== 'architect' ? {} : { generator: String(item.generator || ''), sourceLabel: String(item.sourceLabel || ''), movement: item.movement || '' }) };
  });

  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  let renders = [];
  if (!access.session?.role || access.session.role === 'architect') {
    try { renders = fs.readdirSync(media.renders, { withFileTypes: true }).filter(entry => entry.isFile() && /^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(entry.name)).map(entry => renderPrefix + entry.name); } catch { /* pas encore de dossier rendu */ }
  }
  let presentation = { slots: [null, null, null], focal: { x: 50, y: 50 }, orphanedSlots: 0 };
  try { presentation = presentationStore.get(PROJECTS, projectSlug(url.searchParams.get('project'))); } catch { /* réglages absents : comportement historique */ }
  res.end(JSON.stringify({ images, videos, renders, presentation }));
}

// --- Projets de l'éditeur de plan : projects/<slug>/project.json (+ plan.jpg|png) ---

function readBody(req, res, limit, cb) {
  let size = 0;
  let overloaded = false;
  const chunks = [];
  function rejectSize() {
    overloaded = true;
    chunks.length = 0;
    res.setHeader('Connection', 'close');
    sendJson(res, 413, { error: 'Le contenu envoyé dépasse la taille autorisée.' });
  }
  if (Number(req.headers['content-length']) > limit) rejectSize();
  req.on('data', chunk => {
    if (overloaded) return;
    size += chunk.length;
    if (size > limit) rejectSize();
    else chunks.push(chunk);
  });
  req.on('end', async () => {
    if (overloaded) return;
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return sendJson(res, 400, { error: 'Le corps de la requête doit être un JSON valide.' }); }
    try { await cb(value); }
    catch (error) {
      console.error('Erreur de traitement de la requête', error);
      sendJson(res, 500, { error: 'Le serveur n’a pas pu terminer la demande.' });
    }
  });
}

/** Vignette d'un projet pour l'index de l'atelier : couverture éligible, sinon façade, vue aérienne ou plan. */
function projectCover(slug) {
  const base = path.join(PROJECTS, slug);
  const prefix = `projects/${slug}/`;
  const validFile = file => typeof file === 'string' && file.startsWith(prefix)
    && /\.(?:jpe?g|png|webp)$/i.test(file) && !file.includes('..') && fs.existsSync(path.join(ROOT, file));
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'generated', 'manifest.json'), 'utf8'));
    const items = (manifest.items || []).filter(item => item && item.type === 'image' && item.status !== 'draft'
      && item.published !== false && validFile(item.file) && isDeliverableEligible(item));
    const chosen = DeliverableGate ? DeliverableGate.pickCover({ images: items, renders: [] }) : null;
    if (chosen?.file && validFile(chosen.file)) return chosen.file;
    const explicit = items.find(item => item.cover === true) || items.find(item => item.catalog !== false);
    if (explicit) return explicit.file;
  } catch { /* pas de manifeste : on cherche une capture */ }
  const fallback = ['generated/renders/facade.jpg', 'generated/renders/vue-aerienne.jpg', 'plan.jpg']
    .find(file => fs.existsSync(path.join(base, file)));
  return fallback ? prefix + fallback : null;
}

function listProjects(res, only) {
  fs.mkdirSync(PROJECTS, { recursive: true });
  const defaultSlug = portal.enabled ? process.env.PORTAL_DEFAULT_PROJECT || projectSlug() : projectSlug();
  const items = fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter(d => (!only || d.name === only) && d.isDirectory() && /^[a-z0-9-]{1,60}$/i.test(d.name) && fs.existsSync(path.join(PROJECTS, d.name, 'project.json')))
    .map(d => {
      let name = d.name, subtitle = '';
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(PROJECTS, d.name, 'project.json'), 'utf8')).meta || {};
        name = meta.name || d.name;
        subtitle = typeof meta.subtitle === 'string' ? meta.subtitle.slice(0, 120) : '';
      } catch (e) { /* nom par défaut */ }
      return { slug: d.name, name, subtitle, cover: projectCover(d.name), default: d.name === defaultSlug, updated: fs.statSync(path.join(PROJECTS, d.name, 'project.json')).mtimeMs };
    })
    .sort((a, b) => b.updated - a.updated);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(items));
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const coordinate = value => Number.isFinite(value) && Math.abs(value) <= 10000;
const point2D = p => Array.isArray(p) && p.length === 2 && p.every(coordinate);

function projectProblem(project) {
  if (!isRecord(project) || !isRecord(project.meta) || typeof project.meta.name !== 'string' || !project.meta.name.trim() || !isRecord(project.config)) {
    return 'Le projet doit avoir un nom et une configuration.';
  }
  if ((project.meta.clientVisible !== undefined && typeof project.meta.clientVisible !== 'boolean') ||
      !cabinetStore.projectSheetsValid(project.meta.sheets)) return 'Vérifiez la visibilité client et les métadonnées des feuilles.';
  const { elevationEnd, wallHeight, floorHeight } = project.config;
  if ((elevationEnd !== undefined && (!Number.isFinite(elevationEnd) || elevationEnd <= 0 || elevationEnd > 1)) ||
      [wallHeight, floorHeight].some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))) {
    return 'Vérifiez les hauteurs et le seuil d’élévation du projet.';
  }
  if (project.tourWaypoints !== undefined && (!Array.isArray(project.tourWaypoints) || project.tourWaypoints.length < 2 ||
    !project.tourWaypoints.every(waypoint => isRecord(waypoint) && [waypoint.pos, waypoint.look].every(v => Array.isArray(v) && v.length === 3 && v.every(coordinate)) &&
      Number.isFinite(waypoint.fov) && waypoint.fov > 0 && waypoint.fov < 180))) return 'Vérifiez les étapes de caméra du projet.';
  if (!Array.isArray(project.walls) || !project.walls.length || !project.walls.every(w => isRecord(w) && point2D(w.from) && point2D(w.to) &&
      (w.from[0] !== w.to[0] || w.from[1] !== w.to[1]) && (w.openings === undefined || (Array.isArray(w.openings) && w.openings.every(isRecord))))) {
    return 'Tracez au moins un mur et vérifiez les extrémités de chaque mur.';
  }
  if (!Array.isArray(project.rooms) || !project.rooms.every(room => {
    if (!isRecord(room)) return false;
    if (Array.isArray(room.poly) && room.poly.length >= 3) return room.poly.every(point2D);
    const bounds = room.bounds;
    return isRecord(bounds) && [bounds.xMin, bounds.xMax, bounds.zMin, bounds.zMax].every(coordinate) && bounds.xMin < bounds.xMax && bounds.zMin < bounds.zMax;
  })) return 'Vérifiez les contours des pièces du projet.';
  for (const key of ['furniture', 'columns', 'canopies', 'stairwells']) {
    if (project[key] !== undefined && (!Array.isArray(project[key]) || !project[key].every(isRecord))) return `La liste « ${key} » est invalide.`;
  }
  if (project.estimate !== undefined && !estimateSettingsValid(project.estimate)) return 'Les réglages de l’estimation sont invalides.';
  return null;
}

// Réglages d’estimation (js/costEstimate.js) : clés connues, nombres finis positifs ou libellés courts.
const ESTIMATE_TEXT = new Set(['standing', 'city', 'currency', 'profile', 'tileFormat', 'roofType', 'landZone']);
const ESTIMATE_BOOLEANS = new Set(['vat', 'studies', 'exterior', 'land']);
const ESTIMATE_NUMBERS = new Set(['version', 'perM2', 'annexWeight', 'grossShare', 'contingency', 'rangeLow', 'rangeHigh',
  'permitOther', 'blockPrice15', 'blockPrice20', 'blocksPerM2', 'blockWaste', 'tileWaste',
  'studiesLow', 'studiesHigh', 'exteriorLow', 'exteriorHigh', 'plotArea']);
function estimateSettingsValid(value) {
  return isRecord(value) && Object.entries(value).every(([key, item]) =>
    (ESTIMATE_TEXT.has(key) && typeof item === 'string' && /^[a-zA-Z0-9-]{1,20}$/.test(item)) ||
    (ESTIMATE_BOOLEANS.has(key) && typeof item === 'boolean') ||
    (ESTIMATE_NUMBERS.has(key) && ((key === 'perM2' && item === null) || (Number.isFinite(item) && item >= 0 && item <= 1e9))));
}

function atomicFile(file, data) {
  const temp = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, data, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function cabinetApi(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, cabinetStore.read(ROOT));
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  if (portal.enabled && portal.roleForProject(req) !== 'architect') return sendJson(res, 403, { error: 'Seul le cabinet peut modifier ce profil.' });
  return readBody(req, res, 3 * 1024 * 1024, body => {
    try { return sendJson(res, 200, cabinetStore.save(ROOT, body)); }
    catch (error) { return sendJson(res, error.status || 500, { error: error.status ? error.message : 'Enregistrement du profil impossible.' }); }
  });
}

function saveProject(req, res) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return sendJson(res, 415, { error: 'Envoyez le projet au format JSON.' });
  }
  return readBody(req, res, 40 * 1024 * 1024, data => {
    if (portal.enabled && portal.roleForProject(req) !== 'architect') return sendJson(res, 403, { error: 'Votre session architecte n’est plus active.' });
    const { slug, project, planImage } = data || {};
    if (typeof slug !== 'string' || !/^[a-z0-9-]{1,60}$/.test(slug)) return sendJson(res, 422, { error: 'Choisissez un identifiant de projet valide.' });
    const problem = projectProblem(project);
    if (problem) return sendJson(res, 422, { error: problem });
    const dir = path.join(PROJECTS, slug);
    let imageFile, image;
    if (planImage != null) {
      const match = typeof planImage === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(planImage);
      if (match) {
        image = Buffer.from(match[2], 'base64');
        const png = match[1] === 'png';
        const signature = png ? '89504e470d0a1a0a' : 'ffd8ff';
        if (!image.toString('hex', 0, signature.length / 2).startsWith(signature)) image = null;
        imageFile = png ? 'plan.png' : 'plan.jpg';
      }
      if (!image) return sendJson(res, 422, { error: 'Importez une image de plan PNG ou JPEG valide.' });
      project.config.planImage = { ...project.config.planImage, url: `projects/${slug}/${imageFile}` };
    }
    fs.mkdirSync(dir, { recursive: true });
    ensureProjectMedia(slug);
    if (image) atomicFile(path.join(dir, imageFile), image);
    atomicFile(path.join(dir, 'project.json'), JSON.stringify(project, null, 2));
    return sendJson(res, 200, { ok: true, slug, planImage: project.config.planImage });
  });
}

// --- IA via OpenRouter : la clé reste côté serveur (variable, fichier .env externe ou
// fichier local openrouter.key à la racine — ne jamais l'inclure dans le projet partagé) ---
function openRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  const f = path.join(ROOT, 'openrouter.key');
  if (fs.existsSync(f)) {
    const val = fs.readFileSync(f, 'utf8').trim();
    if (val) return val;
  }
  const localEnv = path.join(ROOT, '.env');
  if (fs.existsSync(localEnv)) {
    try {
      const raw = fs.readFileSync(localEnv, 'utf8');
      const match = raw.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/m);
      const value = match && (match[1] ?? match[2] ?? match[3]);
      if (value && value.trim()) return value.trim();
    } catch (e) { /* fichier local illisible */ }
  }
  // Optional pointer to a private .env outside this project; the secret is never copied here.
  const envFile = process.env.OPENROUTER_ENV_FILE;
  if (envFile) {
    try {
      const raw = fs.readFileSync(envFile, 'utf8');
      const match = raw.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/m);
      const value = match && (match[1] ?? match[2] ?? match[3]);
      if (value && value.trim()) return value.trim();
    } catch (e) { /* fichier externe absent ou illisible : essayer les autres sources */ }
  }
  return '';
}

function aiStatus(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ configured: !!openRouterKey() }));
}

// Relais vers https://openrouter.ai/api/v1/chat/completions (modèle, messages, format, modalités)
function aiChat(req, res) {
  readBody(req, res, 25 * 1024 * 1024, async body => {
    const key = openRouterKey();
    if (!key) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Clé OpenRouter absente : configurez une source locale puis relancez start.bat' })); }
    const payload = {
      model: String(body.model || 'anthropic/claude-sonnet-5.5'),
      messages: body.messages,
      max_tokens: Math.min(+body.max_tokens || 8000, 16000)
    };
    if (body.response_format) payload.response_format = body.response_format;
    if (body.modalities) payload.modalities = body.modalities;
    if (body.temperature !== undefined) payload.temperature = body.temperature;
    payload.usage = { include: true }; // coût réel renvoyé par OpenRouter
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'ArchiCam Studio' },
        body: JSON.stringify(payload)
      });
      const text = await r.text();
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenRouter injoignable : ' + e.message }));
    }
  });
}

// Relais de génération d'image OpenRouter dédié : seuls les deux modèles autorisés passent.
function aiImage(req, res) {
  readBody(req, res, 25 * 1024 * 1024, body => {
    (async () => {
      const key = openRouterKey();
      const allowedModels = IMAGE_MODELS;
      if (!key) return sendJson(res, 401, { error: 'Clé OpenRouter absente.' });
      if (!allowedModels.includes(body.model) || typeof body.prompt !== 'string' || body.prompt.length > 6000
        || !Array.isArray(body.input_references) || body.input_references.length < 1 || body.input_references.length > 5
        || body.input_references.some(reference => reference?.type !== 'image_url'
          || typeof reference.image_url?.url !== 'string'
          || !/^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(reference.image_url.url))) {
        return sendJson(res, 400, { error: 'Modèle, prompt ou références d’image invalides.' });
      }
      const r = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'ArchiCam Studio' },
        body: JSON.stringify({
          model: body.model, prompt: body.prompt, input_references: body.input_references,
          aspect_ratio: body.aspect_ratio || '16:9', n: 1, output_format: 'png', response_format: 'b64_json'
        })
      });
      const text = await r.text();
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(text);
    })().catch(error => sendJson(res, 502, { error: 'OpenRouter image indisponible : ' + error.message }));
  });
}

// ---------------------------------------------------------------------------
// Séquences pour l'IA (js/aiSequence.js) : images du parcours rendues une à une, par segment et par passe.
// projects/<slug>/generated/sequences/<séquence>/seg-01/{color,depth,edges}/0001.jpg|png
// ---------------------------------------------------------------------------
const SEQUENCE_PASSES = { color: 'jpg', depth: 'png', edges: 'png' };
function sequenceDir(url, sequence) {
  if (!/^seq-[0-9]{8}t[0-9]{6}$/i.test(String(sequence || ''))) throw new Error('identifiant de séquence invalide');
  const media = ensureProjectMedia(projectSlug(url.searchParams.get('project')));
  return { dir: path.join(media.generated, 'sequences', sequence), prefix: `${media.prefix}sequences/${sequence}/` };
}
function saveSequenceFrame(req, res, url) {
  readBody(req, res, 12 * 1024 * 1024, body => {
    try {
      const { sequence, segment, pass, frame, data } = body || {};
      const ext = SEQUENCE_PASSES[pass];
      if (!ext || !Number.isInteger(segment) || segment < 1 || segment > 99 || !Number.isInteger(frame) || frame < 1 || frame > 9999) throw new Error('image de séquence invalide');
      const mime = ext === 'jpg' ? 'jpeg' : 'png';
      const match = new RegExp(`^data:image/${mime};base64,([A-Za-z0-9+/=]+)$`).exec(data || '');
      if (!match) throw new Error('format d’image inattendu');
      const { dir } = sequenceDir(url, sequence);
      const folder = path.join(dir, `seg-${String(segment).padStart(2, '0')}`, pass);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, `${String(frame).padStart(4, '0')}.${ext}`), Buffer.from(match[1], 'base64'));
      sendJson(res, 200, { ok: true });
    } catch (error) { sendJson(res, 400, { error: error.message }); }
  });
}
function saveSequenceManifest(req, res, url) {
  readBody(req, res, 256 * 1024, body => {
    try {
      const { sequence, manifest } = body || {};
      const { dir, prefix } = sequenceDir(url, sequence);
      if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.segments)) throw new Error('manifeste de séquence invalide');
      fs.mkdirSync(dir, { recursive: true });
      const clean = {
        sequence, project: projectSlug(url.searchParams.get('project')), created: new Date().toISOString(),
        fps: Number(manifest.fps) || 24, width: Number(manifest.width) || 1280, height: Number(manifest.height) || 720,
        passes: (manifest.passes || []).filter(p => SEQUENCE_PASSES[p]),
        segments: manifest.segments.slice(0, 99).map(s => ({ index: Number(s.index), label: String(s.label || '').slice(0, 120), frames: Number(s.frames), seconds: Number(s.seconds), start: Number(s.start), end: Number(s.end) })),
        notice: 'Rendu d’ambiance illustratif non contractuel : l’IA ne doit modifier que les matières et la lumière.'
      };
      fs.writeFileSync(path.join(dir, 'sequence.json'), JSON.stringify(clean, null, 2));
      const lines = [
        'SÉQUENCE POUR L’IA — ArchiCam Studio',
        `Projet : ${clean.project} · ${clean.fps} images/s · ${clean.width}×${clean.height}`,
        '',
        'Dossiers : seg-XX/color (rendu de la maquette), seg-XX/depth (profondeur, proche = blanc), seg-XX/edges (contours).',
        '',
        'Utilisation :',
        ' - Runway (Aleph / Gen-4, vidéo vers vidéo) ou Luma (Modify) : importer la vidéo color d’un segment, structure élevée.',
        ' - ComfyUI + Wan VACE : séquence color en entrée, depth et/ou edges en contrôle (la géométrie reste verrouillée).',
        '',
        'Assembler un segment en vidéo (ffmpeg) :',
        ...clean.segments.map(s => `  ffmpeg -framerate ${clean.fps} -i seg-${String(s.index).padStart(2, '0')}/color/%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 16 seg-${String(s.index).padStart(2, '0')}-color.mp4   # ${s.label} (${s.seconds} s)`),
        '',
        clean.notice
      ];
      fs.writeFileSync(path.join(dir, 'LISEZMOI.txt'), lines.join('\n'));
      sendJson(res, 200, { ok: true, folder: prefix });
    } catch (error) { sendJson(res, 400, { error: error.message }); }
  });
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const VIDEO_MODEL = 'bytedance/seedance-2.5-flash';
const VIDEO_COST_PER_SECOND_ESTIMATE = 0.06726;
const VIDEO_CLIPS = {
  'anim-arrivee': {
    candidates: ['photor-perspective-01.png', 'perspective-01.jpg', 'facade-sud.jpg', 'facade.jpg'],
    label: 'Arrivée porche & façade',
    movement: 'Travelling avant fluide et lent vers le porche et la façade principale'
  },
  'anim-sejour': {
    candidates: ['photor-sejour-veranda.png', 'interieur-sejour-reference.jpg', 'sejour.jpg', 'r12.jpg'],
    label: 'Visite panoramique du séjour',
    movement: 'Panoramique horizontal fluide du grand séjour et de la véranda'
  },
  'anim-veranda': {
    candidates: ['photor-perspective-02.png', 'perspective-02.jpg'],
    label: 'Véranda arrière & terrasse',
    movement: 'Travelling latéral le long de la terrasse arrière ouverte sur le jardin'
  }
};

function resolveClipSource(clip, media) {
  if (!clip) return null;
  const candidates = clip.candidates || (clip.sourceName ? [clip.sourceName] : []);
  for (const name of candidates) {
    if (fs.existsSync(path.join(media.images, name))) return name;
  }
  return clip.sourceName || candidates[0] || null;
}
const videoJobs = new Map();
const videoJobKey = (slug, clipId) => `${slug}:${clipId}`;

function videoQuote(res) {
  const perClip = VIDEO_COST_PER_SECOND_ESTIMATE * 5;
  sendJson(res, 200, { model: VIDEO_MODEL, duration: 5, resolution: '720p', audio: false,
    estimatedPerClip: perClip, estimatedTotal: perClip * 2, currency: 'USD', note: 'Estimation basée sur le tarif Seed annoncé à 0,06726 $/s ; le fournisseur et le coût réel peuvent varier.' });
}

function updateVideoManifest(slug, clipId, details) {
  const media = ensureProjectMedia(slug);
  const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
  if (!manifest || !Array.isArray(manifest.items)) throw new Error('Manifeste invalide.');
  const clip = VIDEO_CLIPS[clipId];
  const sourceName = resolveClipSource(clip, media) || 'source.jpg';
  const sourceImage = `${media.prefix}images/${sourceName}`;
  const index = manifest.items.findIndex(item => item && item.id === clipId);
  const previous = index >= 0 ? manifest.items[index] : {};
  const item = {
    ...previous, id: clipId, type: 'video', file: `${media.prefix}videos/${clipId}.mp4`, mimeType: 'video/mp4',
    sourceImage, poster: sourceImage, duration: 5, durationIsEstimated: false,
    label: clip.label, sourceLabel: '✨ Rendu IA', generator: `OpenRouter · ${VIDEO_MODEL}`,
    resolution: '1280x720', frameRate: null, audio: false, movement: clip.movement,
    createdAt: new Date().toISOString(), size: details.size, jobId: details.jobId, generationStatus: 'completed',
    estimatedCost: details.estimatedCost, actualCost: Number.isFinite(details.actualCost) ? details.actualCost : null
  };
  if (index >= 0) manifest.items[index] = item;
  else manifest.items.push(item);
  fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
  return item;
}

function persistVideoJob(slug, clipId, job) {
  const media = ensureProjectMedia(slug);
  const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
  const index = manifest.items.findIndex(item => item && item.id === clipId);
  if (index < 0) throw new Error(`Entrée manifeste absente : ${clipId}`);
  manifest.items[index] = { ...manifest.items[index], jobId: job.id, generationStatus: job.status,
    estimatedCost: job.estimatedCost, actualCost: Number.isFinite(job.actualCost) ? job.actualCost : null };
  fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
}

async function submitVideo(req, res, body) {
  const key = openRouterKey();
  if (!key) return sendJson(res, 401, { error: 'Clé OpenRouter absente.' });
  const clipId = String(body && body.clipId || '');
  const clip = VIDEO_CLIPS[clipId];
  let slug, media;
  try { slug = projectSlug(body && body.project); media = ensureProjectMedia(slug); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (!clip) return sendJson(res, 400, { error: 'Clip vidéo non autorisé.' });
  const sourceName = resolveClipSource(clip, media);
  if (!sourceName) return sendJson(res, 400, { error: 'Image source introuvable pour ce clip.' });
  const sourceImage = `${media.prefix}images/${sourceName}`;
  const sourcePath = path.join(media.images, sourceName);
  if (!fs.existsSync(sourcePath)) return sendJson(res, 400, { error: `Fichier source introuvable : ${sourcePath}` });

  const jobKey = videoJobKey(slug, clipId);
  const active = videoJobs.get(jobKey);
  if (active && !['failed', 'cancelled', 'expired', 'completed'].includes(active.status)) {
    return sendJson(res, 409, { error: 'Une génération est déjà en cours pour ce clip.', status: active.status });
  }
  const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
  let metadata = manifest.items.find(item => item && item.id === clipId && item.type === 'video');
  if (!metadata) {
    metadata = {
      id: clipId, type: 'video', file: `${media.prefix}videos/${clipId}.mp4`, mimeType: 'video/mp4',
      sourceImage, poster: sourceImage, duration: 5, durationIsEstimated: true,
      label: clip.label, sourceLabel: '✨ Rendu IA', generator: `OpenRouter · ${VIDEO_MODEL}`,
      movement: clip.movement, catalog: true, book: true, generationStatus: 'pending'
    };
    manifest.items.push(metadata);
    fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
  }
  if (metadata.jobId && ['pending', 'in_progress', 'completed'].includes(metadata.generationStatus)
    && !fs.existsSync(path.join(media.videos, `${clipId}.mp4`))) {
    const resumed = { id: metadata.jobId, status: metadata.generationStatus, estimatedCost: metadata.estimatedCost || VIDEO_COST_PER_SECOND_ESTIMATE * 5,
      actualCost: metadata.actualCost, clipId };
    resumed.project = slug;
    videoJobs.set(jobKey, resumed);
    return sendJson(res, 202, { clipId, project: slug, jobId: resumed.id, status: resumed.status, estimatedCost: resumed.estimatedCost, model: VIDEO_MODEL, resolution: '720p', resumed: true });
  }
  const image = fs.readFileSync(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  // OpenRouter/Seedance requiert idéalement une URL HTTPS accessible publiquement.
  // OPENROUTER_PUBLIC_BASE_URL permet d’utiliser une copie publique du projet ; sinon on transmet le frame en data URL.
  let firstFrameUrl = `data:${mime};base64,${image.toString('base64')}`;
  const publicBase = process.env.OPENROUTER_PUBLIC_BASE_URL;
  if (publicBase) {
    const parsed = new URL(publicBase);
    if (parsed.protocol !== 'https:') throw new Error('OPENROUTER_PUBLIC_BASE_URL doit utiliser HTTPS.');
    firstFrameUrl = new URL(sourceImage, publicBase.endsWith('/') ? publicBase : publicBase + '/').toString();
  }
  const estimatedCost = VIDEO_COST_PER_SECOND_ESTIMATE * 5;
  const payload = {
    model: VIDEO_MODEL, prompt: String(metadata.prompt || ''), duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: false,
    provider: { only: ['seed'] },
    frame_images: [{ type: 'image_url', image_url: { url: firstFrameUrl }, frame_type: 'first_frame' }]
  };
  const upstream = await fetch('https://openrouter.ai/api/v1/videos', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'ArchiCam Studio' },
    body: JSON.stringify(payload)
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return sendJson(res, upstream.status, { error: result.error?.message || result.error || `OpenRouter HTTP ${upstream.status}` });
  if (!result.id || !result.polling_url) return sendJson(res, 502, { error: 'Réponse OpenRouter sans identifiant de suivi.' });
  const job = { id: result.id, status: result.status || 'pending', pollingUrl: result.polling_url, estimatedCost, actualCost: null, clipId, project: slug };
  videoJobs.set(jobKey, job);
  try { persistVideoJob(slug, clipId, job); } catch (error) { console.error('Impossible de persister la tâche vidéo :', error.message); }
  sendJson(res, 202, { clipId, project: slug, jobId: result.id, status: job.status, estimatedCost, model: VIDEO_MODEL, resolution: '720p' });
}

async function refreshVideoJob(slug, clipId, apiKey) {
  const job = videoJobs.get(videoJobKey(slug, clipId));
  if (!job) throw new Error('Aucune tâche de génération locale ne correspond à ce clip.');
  if (['failed', 'cancelled', 'expired'].includes(job.status) || (job.status === 'completed' && job.item)) return job;
  const pollUrl = new URL(`/api/v1/videos/${encodeURIComponent(job.id)}`, 'https://openrouter.ai');
  const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  const state = await poll.json().catch(() => ({}));
  if (!poll.ok) throw new Error(state.error?.message || `Suivi OpenRouter HTTP ${poll.status}`);
  job.status = state.status || job.status;
  job.actualCost = Number.isFinite(Number(state.usage?.cost)) ? Number(state.usage.cost) : job.actualCost;
  job.error = state.error || null;
  try { persistVideoJob(slug, clipId, job); } catch (error) { console.error('Impossible de persister le statut vidéo :', error.message); }
  if (job.status === 'completed') {
    const outputUrl = state.unsigned_urls?.[0] || state.urls?.[0] || `https://openrouter.ai/api/v1/videos/${encodeURIComponent(job.id)}/content?index=0`;
    const download = await fetch(outputUrl, { headers: outputUrl.startsWith('https://openrouter.ai/api/') ? { Authorization: `Bearer ${apiKey}` } : {} });
    if (!download.ok) throw new Error(`Téléchargement vidéo HTTP ${download.status}`);
    const contentType = (download.headers.get('content-type') || '').toLowerCase();
    const buffer = Buffer.from(await download.arrayBuffer());
    if (!buffer.length || buffer.length > 250 * 1024 * 1024 || (contentType && !contentType.includes('video') && !contentType.includes('octet-stream'))) {
      throw new Error('Le fichier retourné n’est pas une vidéo valide (ou dépasse 250 Mo).');
    }
    const media = ensureProjectMedia(slug);
    const dir = media.videos;
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${clipId}.mp4`);
    const temp = target + '.tmp';
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, target);
    const item = updateVideoManifest(slug, clipId, { size: buffer.length, jobId: job.id, estimatedCost: job.estimatedCost, actualCost: job.actualCost });
    job.size = buffer.length;
    job.item = item;
  }
  return job;
}

function videoStatus(req, res, url) {
  (async () => {
    const key = openRouterKey();
    if (!key) return sendJson(res, 401, { error: 'Clé OpenRouter absente.' });
    const clipId = url.searchParams.get('clipId') || '';
    if (!VIDEO_CLIPS[clipId]) return sendJson(res, 400, { error: 'Clip vidéo non autorisé.' });
    const slug = projectSlug(url.searchParams.get('project'));
    const media = ensureProjectMedia(slug);
    const keyForJob = videoJobKey(slug, clipId);
    if (!videoJobs.has(keyForJob)) {
      const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
      const item = manifest.items.find(candidate => candidate && candidate.id === clipId);
      if (item && item.jobId && item.generationStatus) {
        const recovered = { id: item.jobId, status: item.generationStatus, estimatedCost: item.estimatedCost,
          actualCost: item.actualCost, clipId, project: slug,
          item: item.generationStatus === 'completed' && fs.existsSync(path.join(ROOT, item.file)) ? item : undefined, size: item.size };
        videoJobs.set(keyForJob, recovered);
      }
    }
    const job = await refreshVideoJob(slug, clipId, key);
    sendJson(res, 200, { clipId, project: slug, jobId: job.id, status: job.status, estimatedCost: job.estimatedCost,
      actualCost: job.actualCost, size: job.size || null, error: job.error, item: job.item || null });
  })().catch(error => sendJson(res, 502, { error: error.message }));
}

function clientFeedback(req, res, url) {
  const project = url.searchParams.get('project');
  const channel = req.headers['x-feedback-channel'];
  const respondError = error => sendJson(res, error.status || 500, { error: error.status ? error.message : 'Stockage des retours indisponible.' });
  if (req.method === 'GET') {
    try { return sendJson(res, 200, { notes: feedbackStore.open(PROJECTS, project, channel).notes }); }
    catch (error) { return respondError(error); }
  }
  const review = req.method === 'PATCH';
  if (!review && req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  if (review && !portal.enabled) return sendJson(res, 403, { error: 'Le suivi des décisions requiert le portail privé.' });
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return sendJson(res, 415, { error: 'JSON requis.' });
  return readBody(req, res, 8192, data => {
    const role = portal.enabled ? portal.roleForProject(req, project) : null;
    if (portal.enabled && !(role === 'architect' || (!review && role === 'comment'))) return sendJson(res, 403, { error: 'Accès non autorisé.' });
    try {
      const item = (review ? feedbackStore.review : feedbackStore.append)(PROJECTS, project, channel, data);
      return sendJson(res, review ? 200 : 201, { item });
    } catch (error) { return respondError(error); }
  });
}

function clientDecisions(req, res, url) {
  if (!portal.enabled) return sendJson(res, 403, { error: 'Le suivi des décisions requiert le portail privé.' });
  const project = url.searchParams.get('project'), channel = req.headers['x-feedback-channel'];
  const respondError = error => sendJson(res, error.status || 500, { error: error.status ? error.message : 'Stockage des décisions indisponible.' });
  const target = portal.decisionTargetFor(req, project);
  if (target && channel !== target.channel) return sendJson(res, 403, { error: 'Ce lien est limité à une proposition précise.' });
  if (req.method === 'GET') {
    try {
      const proposals = decisionStore.list(PROJECTS, project, channel);
      return sendJson(res, 200, { proposals: target ? proposals.filter(item => item.id === target.proposalId) : proposals });
    } catch (error) { return respondError(error); }
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return sendJson(res, 415, { error: 'JSON requis.' });
  return readBody(req, res, 8192, data => {
    const role = portal.roleForProject(req, project);
    try {
      if (data?.action === 'propose' && role === 'architect') {
        return sendJson(res, 201, { item: decisionStore.propose(PROJECTS, project, channel, data.variant, data.modelHash) });
      }
      if (['approve', 'request-changes'].includes(data?.action) && role === 'comment') {
        if (target && data.id !== target.proposalId) return sendJson(res, 403, { error: 'Ce lien ne permet de décider que sur sa proposition.' });
        return sendJson(res, 200, { item: decisionStore.decide(PROJECTS, project, channel, data.id, data.modelHash, data.action, data.comment) });
      }
      return sendJson(res, 403, { error: 'Ce rôle ne peut pas effectuer cette action.' });
    } catch (error) { return respondError(error); }
  });
}

http.createServer((req, res) => {
  let requestUrl, requestedPath;
  try {
    requestUrl = new URL(req.url, 'http://localhost');
    requestedPath = decodeURIComponent(requestUrl.pathname);
    if (/[\u0000-\u001f\u007f]/.test(requestedPath)) throw new Error('Chemin invalide');
  } catch { res.writeHead(400); return res.end('URL invalide'); }
  // Les anciens liens racine avec ?project= et l’entrée privée restent des liens de visite.
  // Sans projet désigné, l'atelier s'ouvre sur son entrée de marque (studio.html), sans aucun projet affiché.
  const entry = portal.enabled || requestUrl.searchParams.has('project') ? '/index.html' : '/studio.html';
  const file = path.resolve(ROOT, '.' + (requestedPath === '/' ? entry : requestedPath));
  const nativeRelative = path.relative(ROOT, file);
  if (!nativeRelative || nativeRelative.startsWith('..' + path.sep) || nativeRelative === '..' || path.isAbsolute(nativeRelative)) { res.writeHead(403); return res.end(); }
  const relative = nativeRelative.split(path.sep).join('/');
  if (!safePath(relative)) { res.writeHead(404); return res.end(); }
  const urlPath = '/' + relative;
  const access = portal.enabled ? portal.guard(req, res, requestUrl, relative) : {};
  if (!access) return;
  if (urlPath === '/api/client-feedback') return clientFeedback(req, res, requestUrl);
  if (urlPath === '/api/client-decisions') return clientDecisions(req, res, requestUrl);
  if (urlPath === '/api/cabinet/profile') return cabinetApi(req, res);
  if (urlPath.startsWith('/api/presentation/')) return presentationApi(req, res, requestUrl, urlPath);
  if (req.method === 'GET' && urlPath === '/api/ai/status') return aiStatus(res);
  if (req.method === 'POST' && urlPath === '/api/ai/chat') return aiChat(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/images') return aiImage(req, res);
  if (req.method === 'GET' && urlPath === '/api/ai/video-quote') return videoQuote(res);
  if (req.method === 'POST' && urlPath === '/api/ai/videos') return readBody(req, res, 64 * 1024, body => {
    submitVideo(req, res, body).catch(error => sendJson(res, 502, { error: error.message }));
  });
  if (req.method === 'GET' && urlPath === '/api/ai/videos/status') return videoStatus(req, res, new URL(req.url, 'http://localhost'));
  if (req.method === 'POST' && urlPath === '/api/save-render') return saveRender(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-generated') return saveGenerated(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/gallery/flags') return galleryFlags(req, res, requestUrl, access);
  if (req.method === 'POST' && urlPath === '/api/save-video') return saveVideo(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-sequence-frame') return saveSequenceFrame(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-sequence-manifest') return saveSequenceManifest(req, res, requestUrl);
  if (req.method === 'GET' && urlPath === '/api/gallery/media') return galleryMedia(res, requestUrl, access);
  if (req.method === 'GET' && urlPath === '/api/projects') return listProjects(res, access.only);
  if (req.method === 'POST' && urlPath === '/api/save-project') return saveProject(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  fs.realpath(file, (realErr, realFile) => {
    if (realErr || realFile !== file) { res.writeHead(404); return res.end('Not found'); }
    if (/^projects\/[^/]+\/project\.json$/.test(relative) && access.session?.role !== 'architect') {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const project = JSON.parse(raw);
        if (project.meta && project.meta.clientVisible !== true) delete project.meta.client;
        const body = Buffer.from(JSON.stringify(project));
        const headers = { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'private, no-store' };
        if (access.session?.role) headers['X-Project-Model-Hash'] = createHash('sha256').update(raw).digest('hex');
        res.writeHead(200, headers);
        return req.method === 'HEAD' ? res.end() : res.end(body);
      } catch { res.writeHead(500); return res.end('Project data unavailable'); }
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file).toLowerCase();
      const mime = TYPES[ext] || 'application/octet-stream';
      const range = req.headers.range;
      if (range && stat.size > 0) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': mime
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          'Content-Type': mime
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      }
    });
  });
}).listen(PORT, process.env.HOST || '127.0.0.1', () => console.log("ArchiCam Studio : http://localhost:" + PORT + "/"));
