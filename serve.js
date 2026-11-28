// Serveur statique minimal (alternative à serve.py quand Python n'est pas installé) : node serve.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const feedbackStore = require('./feedbackStore');
const decisionStore = require('./decisionStore');
const presentationStore = require('./presentationStore');
const cabinetStore = require('./cabinetStore');
let planchesStore = null;
try { planchesStore = require('./planchesStore'); } catch { /* fixtures isolées sans planchesStore.js */ }
let variantsStore = null;
try { variantsStore = require('./variantsStore'); } catch { /* fixtures isolées sans variantsStore.js */ }
let revisionsStore = null;
try { revisionsStore = require('./revisionsStore'); } catch { /* fixtures isolées sans revisionsStore.js */ }
const { createPortal, safePath } = require('./privatePortal');
let DeliverableGate = null;
try { DeliverableGate = require('./js/deliverableGate'); } catch { /* fixtures isolées sans js/deliverableGate.js */ }
let PdfIdentity = null;
try { PdfIdentity = require('./js/pdfIdentity'); } catch { /* fixtures isolées sans js/pdfIdentity.js */ }
let DeliverableChecklist = null;
try { DeliverableChecklist = require('./js/deliverableChecklist'); } catch { /* fixtures isolées sans js/deliverableChecklist.js */ }
let ApdDossier = null;
try { ApdDossier = require('./js/apdDossier'); } catch { /* fixtures isolées sans js/apdDossier.js */ }
let CodeCompliance = null;
try { CodeCompliance = require('./js/codeCompliance'); } catch { /* fixtures isolées sans js/codeCompliance.js */ }
let AiPrompt = null;
try { AiPrompt = require('./js/aiPrompt'); } catch { /* fixtures isolées sans js/aiPrompt.js */ }
let BioclimaticAudit = null;
try { BioclimaticAudit = require('./js/bioclimaticAudit'); } catch { /* fixtures isolées sans js/bioclimaticAudit.js */ }
let CostEstimate = null;
try { CostEstimate = require('./js/costEstimate'); } catch { /* fixtures isolées sans js/costEstimate.js */ }
let geminiClient = null;
try { geminiClient = require('./geminiClient'); } catch { /* fixtures isolées sans geminiClient.js */ }
let aiDesignEngine = null;
try { aiDesignEngine = require('./aiDesignEngine'); } catch { /* fixtures isolées sans aiDesignEngine.js */ }

const PORT = Number(process.env.PORT) || 8000;
const ROOT = fs.realpathSync(__dirname);
const PROJECTS = path.join(ROOT, 'projects');
const portal = createPortal({ root: ROOT, projects: PROJECTS, send: sendJson, read: readBody });
const TYPES = {
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
  '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream'
};

// Médias isolés par projet : projects/<slug>/generated/{renders,images,videos,manifest.json}
function availableProjectSlugs() {
  if (!fs.existsSync(PROJECTS)) return [];
  return fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^[a-z0-9-]{1,60}$/i.test(d.name) && fs.existsSync(path.join(PROJECTS, d.name, 'project.json')))
    .map(d => ({ slug: d.name.toLowerCase(), updated: fs.statSync(path.join(PROJECTS, d.name, 'project.json')).mtimeMs }))
    .sort((a, b) => b.updated - a.updated)
    .map(item => item.slug);
}

function defaultProjectSlug() {
  const slugs = availableProjectSlugs();
  const configured = process.env.PORTAL_DEFAULT_PROJECT;
  if (configured && /^[a-z0-9-]{1,60}$/i.test(configured) && slugs.includes(configured.toLowerCase())) {
    return configured.toLowerCase();
  }
  if (slugs.length) return slugs[0];
  throw new Error('Aucun projet disponible dans le dossier projects/.');
}

function projectSlug(value) {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  const slug = raw || defaultProjectSlug();
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

// Transcode un flux WebM capturé par MediaRecorder en MP4 H.264 universel (iPhone/WhatsApp/Safari) si ffmpeg est présent.
function transcodeWebmToMp4(inputPath, outputPath) {
  return new Promise((resolve) => {
    execFile('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', outputPath
    ], { timeout: 90000 }, (err) => {
      if (err || !fs.existsSync(outputPath) || !fs.statSync(outputPath).size) {
        fs.rm(outputPath, { force: true }, () => {});
        return resolve(false);
      }
      resolve(true);
    });
  });
}

// Résout un fichier média relatif en le confinant strictement au dossier du projet demandé.
function resolveProjectAsset(slug, relPath, allowedSubdir = '') {
  const cleanRel = String(relPath || '').trim().replace(/^\/+/, '');
  if (!cleanRel || cleanRel.includes('\0')) return null;
  const projectDir = path.resolve(PROJECTS, slug);
  const baseDir = allowedSubdir ? path.resolve(projectDir, allowedSubdir) : projectDir;
  const abs = path.resolve(ROOT, cleanRel);
  if (!abs.startsWith(baseDir + path.sep)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return { abs, rel: path.relative(ROOT, abs).split(path.sep).join('/') };
}

function readOptionalJsonBody(req, maxBytes, cb) {
  let raw = '';
  let bytes = 0;
  let aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > maxBytes) { aborted = true; cb(new Error('Corps de requête trop volumineux.')); return; }
    raw += chunk.toString('utf8');
  });
  req.on('end', () => {
    if (aborted) return;
    if (!raw.trim()) return cb(null, {});
    try { cb(null, JSON.parse(raw)); } catch { cb(new Error('JSON invalide.')); }
  });
  req.on('error', err => { if (!aborted) cb(err); });
}

// Moteur de rendu vidéo FFmpeg côté serveur : assemble un film réaliste d'architecture HD (MP4 H.264 1280×720)
// avec mouvements caméra lents, fondus enchaînés, mode transition Début→Fin et mixage optionnel voix off + ambiance sonore.
function renderProjectVideo(req, res, url) {
  readOptionalJsonBody(req, 256 * 1024, (parseErr, opts = {}) => {
    if (parseErr) return sendJson(res, 400, { error: parseErr.message });
    let slug;
    let media;
    try { slug = projectSlug(url.searchParams.get('project') || opts?.project); media = ensureProjectMedia(slug); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    let projectTitle = slug.replace(/-/g, ' ').toUpperCase();
    const projectJsonPath = path.join(PROJECTS, slug, 'project.json');
    try {
      if (fs.existsSync(projectJsonPath)) {
        const pj = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        if (pj?.meta?.name) projectTitle = String(pj.meta.name).trim();
      }
    } catch { /* titre par défaut */ }

    let existingManifest = { version: 1, items: [] };
    try {
      if (fs.existsSync(media.manifest)) {
        const parsed = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
        if (parsed && Array.isArray(parsed.items)) existingManifest = parsed;
      }
    } catch { /* manifeste neuf */ }

    const isTransitionMode = opts && opts.mode === 'transition' && opts.startImage && opts.endImage;
    let scenes = [];

    if (isTransitionMode) {
      const startAsset = resolveProjectAsset(slug, opts.startImage);
      const endAsset = resolveProjectAsset(slug, opts.endImage);
      if (!startAsset || !endAsset) {
        return sendJson(res, 400, { error: 'Images de départ ou d’arrivée introuvables dans ce projet.' });
      }
      scenes = [
        { absPath: startAsset.abs, relFile: startAsset.rel, label: String(opts.startLabel || 'Vue de départ').slice(0, 80) },
        { absPath: endAsset.abs, relFile: endAsset.rel, label: String(opts.endLabel || 'Vue d’arrivée').slice(0, 80) }
      ];
    } else {
      const isExcludedName = (name) => {
        const low = String(name || '').toLowerCase();
        return /apercu|thumb|plan-|plan_|coupe-|coupe_|toiture|facade-avant|photor-cuisine|photor-sejour-etage|photor-perspective-05/.test(low);
      };
      const narrativeRank = (idOrFile) => {
        const s = String(idOrFile || '').toLowerCase();
        if (/photor-perspective-01/.test(s)) return 10;
        if (/photor-perspective-03/.test(s)) return 20;
        if (/photor-sejour-veranda/.test(s)) return 30;
        if (/photor-salle-a-manger/.test(s)) return 40;
        if (/photor-suite-parentale/.test(s)) return 50;
        if (/photor-perspective-04/.test(s)) return 60;
        if (/photor-perspective-02/.test(s)) return 70;
        if (/photor-/.test(s)) return 80;
        if (/perspective-01/.test(s)) return 110;
        if (/perspective-03/.test(s)) return 120;
        if (/interieur-sejour/.test(s)) return 130;
        if (/perspective-02/.test(s)) return 140;
        if (/perspective-04/.test(s)) return 150;
        if (/perspective-05/.test(s)) return 160;
        return 200;
      };
      const cleanCaption = (rawLabel, filename) => {
        let text = String(rawLabel || '').trim();
        if (!text) {
          text = path.basename(filename, path.extname(filename))
            .replace(/^photor-/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        }
        return text.replace(/\s*[—-]\s*photor[ée]aliste.*$/i, '').replace(/\s*\(maquette 3D\)\s*/i, '').trim();
      };

      const seenPaths = new Set();
      const picked = [];
      const addScene = (absPath, relFile, label, priority) => {
        if (!absPath || seenPaths.has(absPath) || !fs.existsSync(absPath)) return;
        if (isExcludedName(path.basename(absPath))) return;
        seenPaths.add(absPath);
        picked.push({ absPath, relFile, label: cleanCaption(label, absPath), priority });
      };

      const photorItems = existingManifest.items.filter(it =>
        it && it.type === 'image' && typeof it.file === 'string' && !isExcludedName(it.file) && /^photor-/.test(it.id || '')
      );
      for (const it of photorItems) addScene(path.join(ROOT, it.file), it.file, it.label, narrativeRank(it.id || it.file));

      if (picked.length < 6) {
        for (const it of existingManifest.items) {
          if (!it || it.type !== 'image' || typeof it.file !== 'string' || isExcludedName(it.file)) continue;
          addScene(path.join(ROOT, it.file), it.file, it.label, narrativeRank(it.id || it.file));
        }
      }
      if (picked.length < 4) {
        const collectDir = (dir, baseRel, baseRank) => {
          if (!fs.existsSync(dir)) return;
          for (const name of fs.readdirSync(dir).sort()) {
            if (!/\.(?:jpe?g|png|webp)$/i.test(name) || isExcludedName(name)) continue;
            addScene(path.join(dir, name), `${baseRel}${name}`, '', baseRank + narrativeRank(name));
          }
        };
        collectDir(media.images, `${media.prefix}images/`, 100);
        collectDir(media.renders, `${media.prefix}renders/`, 300);
        collectDir(path.join(PROJECTS, slug, 'planches', 'edition-art'), `projects/${slug}/planches/edition-art/`, 400);
      }
      picked.sort((a, b) => a.priority - b.priority);
      scenes = picked.slice(0, 6);
    }

    if (!scenes.length) return sendJson(res, 400, { error: 'Aucune image disponible dans ce projet pour générer une vidéo.' });

    const voiceAsset = opts && opts.voiceoverFile
      ? resolveProjectAsset(slug, opts.voiceoverFile, path.join('generated', 'audio'))
      : null;
    const withAmbient = Boolean(opts && opts.ambientSound);

    const id = `${isTransitionMode ? 'transition-cinema' : (voiceAsset ? 'film-narre' : 'film-realiste')}-${new Date().toISOString().replace(/[-:.]/g, '')}`;
    const dir = media.videos;
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${id}.mp4`);
    const tmpCaptionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archicam-film-'));

    const fps = 25;
    const clipSec = isTransitionMode ? 4.4 : 6.2;
    const xfadeSec = isTransitionMode ? 1.5 : 1.1;
    const clipFrames = Math.round(clipSec * fps);
    const fontSerif = fs.existsSync('/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf')
      ? '/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
    const fontSans = fs.existsSync('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf')
      ? '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    const hasFonts = fs.existsSync(fontSerif) && fs.existsSync(fontSans);

    const motions = [
      `z='1.00+0.075*(on/${clipFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
      `z='1.02+0.06*(on/${clipFrames})':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(0.62-0.24*(on/${clipFrames}))'`,
      `z='1.08':x='(iw-iw/zoom)*(0.15+0.70*(on/${clipFrames}))':y='ih/2-(ih/zoom/2)'`,
      `z='1.08':x='(iw-iw/zoom)*(0.85-0.70*(on/${clipFrames}))':y='ih/2-(ih/zoom/2)'`,
      `z='1.00+0.07*(on/${clipFrames})':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*0.48'`,
      `z='1.08-0.075*(on/${clipFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
    ];

    const args = ['-y', '-loglevel', 'error'];
    scenes.forEach(sc => args.push('-i', sc.absPath));
    const voiceInputIdx = voiceAsset ? scenes.length : -1;
    if (voiceAsset) args.push('-i', voiceAsset.abs);

    const filterParts = [];
    scenes.forEach((sc, i) => {
      const motion = motions[i % motions.length];
      const titleFile = path.join(tmpCaptionsDir, `title-${i}.txt`);
      const subFile = path.join(tmpCaptionsDir, `sub-${i}.txt`);
      fs.writeFileSync(titleFile, sc.label, 'utf8');
      fs.writeFileSync(subFile, `${projectTitle.toUpperCase()}  ·  RENDU D’AMBIANCE NON CONTRACTUEL`, 'utf8');

      let chain = `[${i}:v]crop=iw:ih*0.955:0:0,scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,setsar=1,`
        + `zoompan=${motion}:d=${clipFrames}:s=1280x720:fps=${fps},`
        + `eq=contrast=1.03:saturation=1.05:brightness=0.005,format=yuv420p`;

      if (hasFonts) {
        const escPath = p => p.replace(/\\/g, '/').replace(/:/g, '\\:');
        chain += `,drawbox=x=0:y=ih-78:w=iw:h=78:color=#141d17@0.72:t=fill`
          + `,drawbox=x=42:y=ih-62:w=3:h=44:color=#c5a065@0.95:t=fill`
          + `,drawtext=fontfile='${escPath(fontSerif)}':textfile='${escPath(titleFile)}':fontsize=24:fontcolor=#f6f2ea:x=58:y=h-63`
          + `,drawtext=fontfile='${escPath(fontSans)}':textfile='${escPath(subFile)}':fontsize=12:fontcolor=#d6cbb8:x=58:y=h-31`;
      }
      chain += `[v${i}]`;
      filterParts.push(chain);
    });

    let lastStream = 'v0';
    for (let i = 1; i < scenes.length; i++) {
      const offset = Number((i * (clipSec - xfadeSec)).toFixed(3));
      const outStream = i === scenes.length - 1 ? 'vxf' : `vx${i}`;
      const xfadeType = isTransitionMode ? 'dissolve' : 'fade';
      filterParts.push(`[${lastStream}][v${i}]xfade=transition=${xfadeType}:duration=${xfadeSec}:offset=${offset}[${outStream}]`);
      lastStream = outStream;
    }

    const totalDuration = Number((scenes.length * clipSec - Math.max(0, scenes.length - 1) * xfadeSec).toFixed(2));
    const fadeOutStart = Math.max(0.5, totalDuration - 0.9).toFixed(2);
    filterParts.push(`[${lastStream}]fade=t=in:st=0:d=0.7,fade=t=out:st=${fadeOutStart}:d=0.9[vout]`);

    // Mixage audio optionnel : voix off d'architecte (Gemini TTS WAV) + lit sonore doux (brise naturelle filtrée)
    let hasAudioTrack = false;
    if (voiceAsset && withAmbient) {
      hasAudioTrack = true;
      filterParts.push(
        `anoisesrc=color=pink:duration=${totalDuration}:sample_rate=44100,lowpass=f=480,highpass=f=90,volume=0.045,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=0.9[amb]`,
        `[${voiceInputIdx}:a]aresample=44100,apad=whole_dur=${totalDuration},atrim=0:${totalDuration},volume=1.15[vox]`,
        `[vox][amb]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else if (voiceAsset) {
      hasAudioTrack = true;
      filterParts.push(`[${voiceInputIdx}:a]aresample=44100,apad=whole_dur=${totalDuration},atrim=0:${totalDuration},volume=1.15[aout]`);
    } else if (withAmbient) {
      hasAudioTrack = true;
      filterParts.push(`anoisesrc=color=pink:duration=${totalDuration}:sample_rate=44100,lowpass=f=480,highpass=f=90,volume=0.055,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=0.9[aout]`);
    }

    args.push('-filter_complex', filterParts.join(';'), '-map', '[vout]');
    if (hasAudioTrack) {
      args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', '-shortest');
    }
    args.push(
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      target
    );

    execFile('ffmpeg', args, { timeout: 180000 }, (err) => {
      fs.rm(tmpCaptionsDir, { recursive: true, force: true }, () => {});
      if (err || !fs.existsSync(target) || !fs.statSync(target).size) {
        fs.rm(target, { force: true }, () => {});
        return sendJson(res, 500, { error: `Moteur FFmpeg indisponible ou erreur de rendu (${err?.message || 'échec'}).` });
      }
      try {
        const size = fs.statSync(target).size;
        const file = `${media.prefix}videos/${id}.mp4`;
        const manifestPath = media.manifest;
        let manifest = { version: 1, items: [] };
        if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest || !Array.isArray(manifest.items)) manifest = { version: 1, items: [] };
        const poster = scenes[0]?.relFile || undefined;
        const label = isTransitionMode
          ? `Transition cinéma : ${scenes[0].label} → ${scenes[1].label}`
          : (voiceAsset ? `Film narré d’architecture — ${projectTitle}` : `Film réaliste d’architecture — ${projectTitle}`);
        const item = {
          id, type: 'video', file, poster, mimeType: 'video/mp4', format: 'mp4',
          label,
          duration: Math.round(totalDuration),
          audio: hasAudioTrack,
          generator: voiceAsset ? 'FFmpeg H.264 + Gemini TTS' : 'FFmpeg H.264',
          sourceLabel: isTransitionMode ? 'Transition Début → Fin' : (voiceAsset ? 'Film narré MP4' : 'Film réaliste MP4'),
          notes: isTransitionMode
            ? `Transition fluide HD 1280×720 entre « ${scenes[0].label} » et « ${scenes[1].label} ».`
            : `Film HD 1280×720 (${scenes.length} scènes réalistes${voiceAsset ? ' avec voix off architecte' : ''}${withAmbient ? ' et ambiance sonore douce' : ''}).`,
          createdAt: new Date().toISOString(), size,
          catalog: true, book: true
        };
        manifest.items.push(item);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        return sendJson(res, 200, { ok: true, item, framesUsed: scenes.length, scenes: scenes.map(s => s.label), audio: hasAudioTrack });
      } catch (error) {
        return sendJson(res, 500, { error: error.message });
      }
    });
  });
}

// Enregistre une vidéo capturée localement par MediaRecorder (sans appel IA) et la transcode en MP4 H.264 si possible.
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
  output.on('finish', async () => {
    if (rejected) return;
    if (!size) return reject(400, 'Vidéo vide.');
    try {
      const manifestPath = media.manifest;
      let manifest = { version: 1, items: [] };
      if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest || !Array.isArray(manifest.items)) throw new Error('Manifeste invalide.');
      fs.renameSync(temp, target);

      let finalExt = ext;
      let finalMime = mime;
      let finalSize = size;
      let transcoded = false;
      if (ext === 'webm') {
        const mp4Target = path.join(dir, `${id}.mp4`);
        if (await transcodeWebmToMp4(target, mp4Target)) {
          fs.rm(target, { force: true }, () => {});
          finalExt = 'mp4';
          finalMime = 'video/mp4';
          finalSize = fs.statSync(mp4Target).size;
          transcoded = true;
        }
      }

      const file = `${media.prefix}videos/${id}.${finalExt}`;
      const duration = Math.max(0, Math.min(3600, Number(req.headers['x-video-duration']) || 0));
      const item = {
        id, type: 'video', file, mimeType: finalMime, format: finalExt, label: 'Visite cinématique',
        duration: Math.round(duration),
        generator: transcoded ? 'MediaRecorder + FFmpeg H.264' : 'MediaRecorder local',
        createdAt: new Date().toISOString(), size: finalSize
      };
      const index = manifest.items.findIndex(existing => existing && existing.id === id);
      if (index >= 0) manifest.items[index] = item;
      else manifest.items.push(item);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, item, transcoded }));
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
  const fallback = ['generated/renders/facade.jpg', 'generated/renders/vue-aerienne.jpg', 'plan.jpg', 'plan.png']
    .find(file => fs.existsSync(path.join(base, file)));
  if (fallback) return prefix + fallback;
  try {
    const project = JSON.parse(fs.readFileSync(path.join(base, 'project.json'), 'utf8'));
    const planUrl = project?.config?.planImage?.url;
    if (validFile(planUrl)) return planUrl;
  } catch { /* project.json illisible */ }
  return null;
}

function listProjects(res, only) {
  fs.mkdirSync(PROJECTS, { recursive: true });
  const items = fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter(d => (!only || d.name === only) && d.isDirectory() && /^[a-z0-9-]{1,60}$/i.test(d.name) && fs.existsSync(path.join(PROJECTS, d.name, 'project.json')))
    .map(d => {
      let name = d.name, subtitle = '';
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(PROJECTS, d.name, 'project.json'), 'utf8')).meta || {};
        name = meta.name || d.name;
        subtitle = typeof meta.subtitle === 'string' ? meta.subtitle.slice(0, 120) : '';
      } catch (e) { /* nom par défaut */ }
      return { slug: d.name, name, subtitle, cover: projectCover(d.name), default: false, updated: fs.statSync(path.join(PROJECTS, d.name, 'project.json')).mtimeMs };
    })
    .sort((a, b) => b.updated - a.updated);
  const configured = portal.enabled && process.env.PORTAL_DEFAULT_PROJECT ? process.env.PORTAL_DEFAULT_PROJECT.toLowerCase() : null;
  const defaultSlug = (configured && items.some(item => item.slug.toLowerCase() === configured))
    ? configured
    : (items[0]?.slug.toLowerCase() || null);
  items.forEach(item => { item.default = item.slug.toLowerCase() === defaultSlug; });
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
      (project.meta.budgetShared !== undefined && typeof project.meta.budgetShared !== 'boolean') ||
      !cabinetStore.projectSheetsValid(project.meta.sheets)) return 'Vérifiez la visibilité client, le partage du budget et les métadonnées des feuilles.';
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

function cabinetLogoApi(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  const logo = typeof cabinetStore.readLogo === 'function' ? cabinetStore.readLogo(ROOT) : null;
  if (!logo) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' });
    return res.end('Logo absent');
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': logo.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  return res.end(req.method === 'HEAD' ? undefined : logo);
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
    // Un enregistrement officiel purge le brouillon automatique éventuel
    const draftPath = path.join(dir, '.draft.json');
    try { if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath); } catch { /* ignore */ }
    return sendJson(res, 200, { ok: true, slug, planImage: project.config.planImage });
  });
}

// --- BROUILLONS AUTOMATIQUES (AUTO-SAVE SERVEUR CONFINÉ AU DOSSIER PROJET) ---
function projectDraftApi(req, res, urlPath) {
  if (portal.enabled && portal.roleForProject(req) !== 'architect') {
    return sendJson(res, 403, { error: 'Accès réservé à l’architecte.' });
  }
  const m = /^\/api\/projects\/([a-z0-9-]{1,60})\/draft$/.exec(urlPath);
  if (!m) return sendJson(res, 400, { error: 'Identifiant de projet invalide.' });
  const slug = m[1];
  const dir = path.resolve(PROJECTS, slug);
  if (!dir.startsWith(PROJECTS + path.sep)) return sendJson(res, 403, { error: 'Chemin refusé.' });
  const draftPath = path.join(dir, '.draft.json');

  if (req.method === 'GET') {
    if (!fs.existsSync(draftPath)) return sendJson(res, 200, { ok: true, draft: null });
    try {
      const data = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
      return sendJson(res, 200, { ok: true, draft: data });
    } catch {
      return sendJson(res, 200, { ok: true, draft: null });
    }
  }
  if (req.method === 'DELETE') {
    try { if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath); } catch { /* ignore */ }
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST') {
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return sendJson(res, 415, { error: 'JSON requis.' });
    }
    return readBody(req, res, 5 * 1024 * 1024, body => {
      if (!body || typeof body.project !== 'object' || !Array.isArray(body.project.walls)) {
        return sendJson(res, 422, { error: 'Brouillon de projet invalide.' });
      }
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        slug,
        savedAt: new Date().toISOString(),
        wallCount: body.project.walls.length,
        roomCount: Array.isArray(body.project.rooms) ? body.project.rooms.length : 0,
        furnitureCount: Array.isArray(body.project.furniture) ? body.project.furniture.length : 0,
        project: body.project
      };
      atomicFile(draftPath, JSON.stringify(payload));
      return sendJson(res, 200, { ok: true, savedAt: payload.savedAt });
    });
  }
  return sendJson(res, 405, { error: 'Méthode non autorisée.' });
}

// --- MEUBLAGE AUTOMATIQUE INTELLIGENT (RÈGLES ARCHITECTURALES + CONSEIL GEMINI OPTIONNEL) ---
function computeSmartRoomFurniture(room, allWalls) {
  const b = room?.bounds;
  if (!b || !Number.isFinite(b.xMin) || !Number.isFinite(b.xMax)) return [];
  const w = b.xMax - b.xMin, d = b.zMax - b.zMin;
  if (w < 1.3 || d < 1.3) return [];
  const cx = (b.xMin + b.xMax) / 2;
  const cz = (b.zMin + b.zMax) / 2;
  const lvl = Math.max(0, Number(room.level) || 0);
  const name = String(room.name || '').toLowerCase();
  const r2 = v => Math.round(v * 100) / 100;
  const clampIn = (item) => {
    const halfX = (Math.abs(Math.cos(item.rotY || 0)) * item.w + Math.abs(Math.sin(item.rotY || 0)) * item.d) / 2 + 0.14;
    const halfZ = (Math.abs(Math.sin(item.rotY || 0)) * item.w + Math.abs(Math.cos(item.rotY || 0)) * item.d) / 2 + 0.14;
    item.x = r2(Math.max(b.xMin + halfX, Math.min(b.xMax - halfX, item.x)));
    item.z = r2(Math.max(b.zMin + halfZ, Math.min(b.zMax - halfZ, item.z)));
    return item;
  };
  const mk = (spec, x, z, rotY = 0) => clampIn({
    ...spec,
    level: lvl,
    room: room.id,
    x: r2(x),
    z: r2(z),
    elev: spec.elev || 0,
    rotY: Math.round(rotY * 10000) / 10000,
    dims: 'local'
  });

  // Repère les portes proches de la pièce pour éviter de bloquer un débattement
  const doors = [];
  for (const wall of (allWalls || [])) {
    if ((Number(wall.level) || 0) !== lvl) continue;
    const L = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) || 1;
    for (const op of (wall.openings || [])) {
      if (op.type !== 'door' && op.type !== 'open') continue;
      const t = (op.at || L / 2) / L;
      const dx = wall.from[0] + (wall.to[0] - wall.from[0]) * t;
      const dz = wall.from[1] + (wall.to[1] - wall.from[1]) * t;
      if (dx >= b.xMin - 0.5 && dx <= b.xMax + 0.5 && dz >= b.zMin - 0.5 && dz <= b.zMax + 0.5) {
        doors.push({ x: dx, z: dz });
      }
    }
  }
  const nearDoor = (x, z, pad = 0.95) => doors.some(dr => Math.hypot(dr.x - x, dr.z - z) < pad);

  const items = [];
  if (/chambre|suite|bedroom|parent/.test(name)) {
    const isBig = w >= 3.2 && d >= 3.2;
    const bedW = isBig ? 1.85 : (w >= 2.5 ? 1.65 : 0.95);
    const bedSpec = { name: bedW >= 1.8 ? 'Lit king 180' : (bedW >= 1.5 ? 'Lit double 160' : 'Lit simple 90'), symbol: bedW < 1.2 ? 'bedSingle' : 'bed', model: 'bed', w: bedW, d: 2.05, h: 0.52, color: '#dcd6cd' };
    // Préfère adosser la tête de lit au mur nord (-Z), sinon sud (+Z) si porte au nord
    const northBlocked = nearDoor(cx, b.zMin + 0.3, 1.1);
    const rotY = northBlocked ? Math.PI : 0;
    const bedZ = northBlocked ? b.zMax - 1.22 : b.zMin + 1.22;
    items.push(mk(bedSpec, cx, bedZ, rotY));
    if (w >= bedW + 1.1) {
      const ns = { name: 'Chevet', symbol: 'nightstand', model: 'nightstand', w: 0.45, d: 0.42, h: 0.52, color: '#8d6d4d' };
      const nsZ = northBlocked ? b.zMax - 0.38 : b.zMin + 0.38;
      items.push(mk(ns, cx - bedW / 2 - 0.32, nsZ, rotY));
      items.push(mk(ns, cx + bedW / 2 + 0.32, nsZ, rotY));
    }
    if (w >= 3.0 && d >= 3.0) {
      const wardX = !nearDoor(b.xMin + 0.45, cz, 1.0) ? b.xMin + 0.45 : b.xMax - 0.45;
      const wardRot = wardX < cx ? Math.PI / 2 : -Math.PI / 2;
      if (!nearDoor(wardX, cz, 0.95)) {
        items.push(mk({ name: 'Armoire / Dressing', symbol: 'wardrobe', model: 'wardrobe', w: Math.min(1.8, d - 1.1), d: 0.6, h: 2.2, color: '#ece7df' }, wardX, cz, wardRot));
      }
    }
  } else if (/séjour|sejour|salon|living/.test(name)) {
    const wide = w >= d;
    if (w >= 4.2 && d >= 3.6) {
      items.push(mk({ name: 'Canapé d’angle', symbol: 'sofaCorner', model: 'sofaCorner', w: 2.55, d: 1.75, h: 0.82, color: '#6b6560' }, cx - (wide ? 0.5 : 0), b.zMin + 1.15, 0));
    } else {
      items.push(mk({ name: 'Canapé 3 places', symbol: 'sofa', model: 'sofa', w: Math.min(2.1, w - 0.8), d: 0.92, h: 0.82, color: '#78716a' }, cx, b.zMin + 0.75, 0));
    }
    items.push(mk({ name: 'Tapis', symbol: 'rug', model: 'rug', w: Math.min(2.4, w * 0.55), d: Math.min(1.6, d * 0.42), h: 0.02, color: '#e4dac9' }, cx, cz, 0));
    items.push(mk({ name: 'Table basse', symbol: 'coffeeTable', model: 'coffeeTable', w: 1.2, d: 0.65, h: 0.4, color: '#9c7d5a' }, cx, cz, 0));
    if (!nearDoor(cx, b.zMax - 0.4, 1.0)) {
      items.push(mk({ name: 'Meuble TV', symbol: 'tvUnit', model: 'tvUnit', w: Math.min(1.85, w - 1.0), d: 0.46, h: 0.52, color: '#35383c' }, cx, b.zMax - 0.42, Math.PI));
    }
    items.push(mk({ name: 'Plante haute', symbol: 'plantTall', model: 'plantTall', w: 0.55, d: 0.55, h: 1.35, color: '#4c6b39' }, b.xMax - 0.48, b.zMin + 0.48, 0));
  } else if (/manger|repas|dining/.test(name)) {
    items.push(mk({ name: 'Table à manger 6p', symbol: 'diningTable', model: 'diningTable', w: Math.min(1.8, w - 1.2), d: 0.95, h: 0.76, color: '#8c6b4a' }, cx, cz, 0));
    [-0.55, 0, 0.55].forEach(dx => {
      items.push(mk({ name: 'Chaise', symbol: 'chair', model: 'chair', w: 0.46, d: 0.48, h: 0.88, color: '#3b3d40' }, cx + dx, cz - 0.72, 0));
      items.push(mk({ name: 'Chaise', symbol: 'chair', model: 'chair', w: 0.46, d: 0.48, h: 0.88, color: '#3b3d40' }, cx + dx, cz + 0.72, Math.PI));
    });
  } else if (/cuisine|kitchen/.test(name)) {
    const cw = Math.max(1.4, Math.min(2.8, w - 1.1));
    items.push(mk({ name: 'Plan de travail', symbol: 'kitchenCounter', model: 'kitchenCounter', w: cw, d: 0.62, h: 0.9, color: '#45494e' }, b.xMin + cw / 2 + 0.22, b.zMin + 0.48, 0));
    items.push(mk({ name: 'Évier inox', symbol: 'sink', model: 'sink', w: 0.85, d: 0.5, h: 0.04, elev: 0.9, color: '#b4b9be' }, b.xMin + cw * 0.35 + 0.22, b.zMin + 0.48, 0));
    items.push(mk({ name: 'Plaque cuisson', symbol: 'cooktop', model: 'cooktop', w: 0.65, d: 0.52, h: 0.05, elev: 0.9, color: '#1f2226' }, b.xMin + cw * 0.78 + 0.22, b.zMin + 0.48, 0));
    items.push(mk({ name: 'Réfrigérateur', symbol: 'fridge', model: 'fridge', w: 0.7, d: 0.68, h: 1.9, color: '#d6d9dc' }, b.xMax - 0.52, b.zMin + 0.52, 0));
    if (w >= 3.4 && d >= 3.2) {
      items.push(mk({ name: 'Îlot central', symbol: 'kitchenIsland', model: 'kitchenIsland', w: Math.min(2.0, w - 1.8), d: 0.9, h: 0.9, color: '#51565c' }, cx, cz + 0.25, 0));
    }
  } else if (/sdb|bain|douche|eau|bath/.test(name)) {
    items.push(mk({ name: 'Douche italienne', symbol: 'shower', model: 'shower', w: Math.min(1.15, w * 0.48), d: 0.9, h: 2.1, color: '#e6ecef' }, b.xMin + 0.68, b.zMin + 0.6, 0));
    items.push(mk({ name: 'Meuble vasque', symbol: 'vanity', model: 'vanity', w: Math.min(0.95, w * 0.45), d: 0.48, h: 0.85, color: '#f3f1ec' }, b.xMax - 0.62, b.zMin + 0.42, 0));
    if (!nearDoor(b.xMax - 0.45, cz + 0.4, 0.8)) {
      items.push(mk({ name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', w: 0.4, d: 0.66, h: 0.78, color: '#f6f6f4' }, b.xMax - 0.45, cz + 0.45, -Math.PI / 2));
    }
  } else if (/\bwc\b|toilet/.test(name)) {
    items.push(mk({ name: 'Cuvette WC', symbol: 'toilet', model: 'toilet', w: 0.4, d: 0.66, h: 0.78, color: '#f6f6f4' }, cx, b.zMin + 0.48, 0));
  } else if (/bureau|office|travail/.test(name)) {
    items.push(mk({ name: 'Bureau', symbol: 'desk', model: 'desk', w: Math.min(1.4, w - 0.7), d: 0.68, h: 0.75, color: '#8f6f4f' }, cx, b.zMin + 0.56, 0));
    items.push(mk({ name: 'Chaise', symbol: 'chair', model: 'chair', w: 0.46, d: 0.48, h: 0.88, color: '#3b3d40' }, cx, b.zMin + 1.25, Math.PI));
    items.push(mk({ name: 'Bibliothèque', symbol: 'shelf', model: 'shelf', w: Math.min(1.2, d - 0.8), d: 0.38, h: 1.95, color: '#7c654d' }, b.xMin + 0.35, cz, Math.PI / 2));
  } else if (/terrasse|veranda|véranda|patio/.test(name)) {
    items.push(mk({ name: 'Salon terrasse', symbol: 'terraceSet', model: 'diningTable', w: Math.min(1.5, w - 0.8), d: 0.9, h: 0.74, color: '#9c7c58' }, cx, cz, 0));
    items.push(mk({ name: 'Plante haute', symbol: 'plantTall', model: 'plantTall', w: 0.55, d: 0.55, h: 1.35, color: '#4c6b39' }, b.xMin + 0.45, b.zMin + 0.45, 0));
  } else if (/garage|parking/.test(name) && w >= 2.6 && d >= 4.8) {
    items.push(mk({ name: 'Voiture (garage)', symbol: 'car', model: 'car', w: 1.85, d: 4.4, h: 1.48, color: '#5f6b74' }, cx, cz, 0));
  }

  return items;
}

function aiAutoFurnish(req, res) {
  if (portal.enabled && portal.roleForProject(req) !== 'architect') {
    return sendJson(res, 403, { error: 'Accès réservé à l’architecte.' });
  }
  readBody(req, res, 4 * 1024 * 1024, async body => {
    try {
      let project = body?.project;
      if (typeof project === 'string') {
        const slug = projectSlug(project);
        const pPath = path.join(PROJECTS, slug, 'project.json');
        if (!fs.existsSync(pPath)) return sendJson(res, 404, { error: 'Projet introuvable.' });
        project = JSON.parse(fs.readFileSync(pPath, 'utf8'));
      }
      if (!project || !Array.isArray(project.rooms)) {
        return sendJson(res, 422, { error: 'Fournissez un projet contenant des pièces.' });
      }
      const targetRoomId = typeof body?.roomId === 'string' && body.roomId ? body.roomId : null;
      const targetLevel = Number.isInteger(body?.level) ? body.level : null;
      const rooms = project.rooms.filter(r => {
        if (targetRoomId) return r.id === targetRoomId;
        if (targetLevel !== null) return (Number(r.level) || 0) === targetLevel;
        return true;
      });
      const furniture = [];
      for (const room of rooms) {
        furniture.push(...computeSmartRoomFurniture(room, project.walls || []));
      }

      let note = `${furniture.length} élément${furniture.length > 1 ? 's' : ''} placé${furniture.length > 1 ? 's' : ''} selon les normes de circulation (90 cm devant portes).`;
      let source = 'local';
      if (body?.useAi && furniture.length && geminiClient && geminiClient.isConfigured(ROOT)) {
        try {
          const summary = rooms.map(r => `${r.name} (${((r.bounds.xMax - r.bounds.xMin) * (r.bounds.zMax - r.bounds.zMin)).toFixed(1)} m²)`).join(', ');
          const out = await geminiClient.generateText({
            prompt: `En 2 phrases concises d'architecte d'intérieur, commente et conseille l'aménagement pour : ${summary}. Mentionne la fluidité de circulation et la lumière naturelle.`,
            systemInstruction: 'Tu es un architecte d’intérieur pragmatique. Réponse courte en français (2 phrases max, sans markdown).',
            maxOutputTokens: 200
          });
          if (out?.text) {
            note = out.text.trim();
            source = `Gemini (${out.model})`;
          }
        } catch { /* fallback local note */ }
      }
      return sendJson(res, 200, { ok: true, source, furniture, count: furniture.length, note });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Erreur lors du meublage automatique.' });
    }
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
  const openRouter = Boolean(openRouterKey());
  const gemini = Boolean(geminiClient && geminiClient.isConfigured(ROOT));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ configured: openRouter || gemini, openRouter, gemini }));
}

// --- AUDIT BIOCLIMATIQUE, NOTICE ARCHITECTURALE & CCTP (Gemini 4 Hydrogen + physique locale) ---
function aiBioclimaticCctp(req, res) {
  readBody(req, res, 2 * 1024 * 1024, async body => {
    try {
      const slug = projectSlug(body?.project);
      const projectPath = path.join(PROJECTS, slug, 'project.json');
      if (!fs.existsSync(projectPath)) return sendJson(res, 404, { error: 'Projet introuvable.' });
      const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
      const audit = BioclimaticAudit
        ? BioclimaticAudit.analyze(project, { city: body?.city, northAngle: Number.isFinite(Number(body?.northAngle)) ? Number(body.northAngle) : undefined })
        : null;
      if (!audit) return sendJson(res, 500, { error: 'Module BioclimaticAudit indisponible.' });

      if (body?.localOnly) {
        return sendJson(res, 200, {
          ok: true, source: 'local', audit,
          markdown: BioclimaticAudit.buildLocalCctpMarkdown(project, audit)
        });
      }

      const systemInstruction = 'Tu es un architecte DPLG expert en conception bioclimatique tropicale et tempérée, et en rédaction de notices architecturales et CCTP (Cahier des Clauses Techniques Particulières). Tu rédiges en français professionnel, précis, clair et directement utilisable dans un dossier APD ou Permis de Construire. Ne jamais inventer de surface ou de pièce absente des mesures fournies.';
      const prompt = `À partir de ces mesures réelles issues de la maquette 3D, rédige en Markdown structuré :
1) Une **Notice Architecturale & Bioclimatique** synthétique (parti architectural, adaptation au climat de ${audit.city}, orientation solaire, ventilation traversante).
2) Un plan d'**Optimisations Bioclimatiques Prioritaires** concrètes (brise-soleil, débords, matériaux, ventilation naturelle) chiffrées/localisées selon les façades ci-dessous.
3) Un **Descriptif Technique Sommaire par Lots (CCTP — Lots 01 à 08)** adapté au standing et au climat local.

DONNÉES RÉELLES DE LA MAQUETTE :
${JSON.stringify(audit, null, 2)}`;

      if (geminiClient && geminiClient.isConfigured(ROOT)) {
        const out = await geminiClient.generateText({ prompt, systemInstruction });
        return sendJson(res, 200, { ok: true, source: `Gemini (${out.model})`, audit, markdown: out.text });
      }
      const orKey = openRouterKey();
      if (orKey) {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json', 'X-Title': 'ArchiCam Studio' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }],
            max_tokens: 4000
          })
        });
        const data = await r.json().catch(() => ({}));
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (r.ok && text) return sendJson(res, 200, { ok: true, source: 'OpenRouter', audit, markdown: text });
      }
      return sendJson(res, 401, {
        error: 'Clé GEMINI_API_KEY ou OPENROUTER_API_KEY absente pour l’enrichissement IA. L’audit physique local reste disponible immédiatement.',
        audit
      });
    } catch (err) {
      return sendJson(res, err.statusCode || 502, { error: err.message || 'Erreur lors de la rédaction IA.' });
    }
  });
}

// --- ANALYSE MULTIMODALE D'UNE PHOTO DE TERRAIN POUR INSERTION PAYSAGÈRE (Gemini 4 Hydrogen) ---
function aiSiteInsertionAdvice(req, res) {
  readBody(req, res, 14 * 1024 * 1024, async body => {
    try {
      const siteImage = String(body?.siteImage || '');
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(siteImage)) {
        return sendJson(res, 400, { error: 'Importez une photo de terrain valide (JPEG, PNG ou WebP).' });
      }
      const projectName = String(body?.projectName || 'la villa').slice(0, 120);
      const city = String(body?.city || 'Douala, Cameroun').slice(0, 80);
      if (!geminiClient || !geminiClient.isConfigured(ROOT)) {
        return sendJson(res, 401, { error: 'Clé GEMINI_API_KEY non configurée sur le serveur pour analyser la photo du terrain.' });
      }
      const prompt = `Analyse cette photo réelle du terrain d’implantation pour intégrer le projet architectural « ${projectName} » (${city}).
Réponds en JSON strict avec les clés :
- "sunDirection": direction estimée du soleil et des ombres sur la photo (français, 1 phrase)
- "terrainAdvice": conseils pratiques d’implantation, ligne d’horizon et mise à l’échelle de la maquette 3D sur cette parcelle (français, 2 phrases)
- "insertionPrompt": prompt en anglais ultra-précis pour un modèle image-vers-image chargé d’incruster la maquette 3D sur ce terrain réel en harmonisant ciel, ombres au sol, végétation existante et voisinage sans modifier les volumes du bâtiment.`;
      const out = await geminiClient.generateText({
        prompt,
        imageDataUrl: siteImage,
        responseMimeType: 'application/json'
      });
      let parsed = null;
      try { parsed = JSON.parse(out.text); } catch { parsed = { sunDirection: '', terrainAdvice: out.text, insertionPrompt: '' }; }
      return sendJson(res, 200, { ok: true, model: out.model, analysis: parsed });
    } catch (err) {
      return sendJson(res, err.statusCode || 502, { error: err.message || 'Analyse du terrain indisponible.' });
    }
  });
}

// --- SCRIPT ARCHITECTURAL & VOIX OFF IA (Gemini 4 Hydrogen + Gemini 3.8 Flash Lite TTS WAV) ---
function aiVoiceover(req, res) {
  readBody(req, res, 2 * 1024 * 1024, async body => {
    try {
      const slug = projectSlug(body?.project);
      const media = ensureProjectMedia(slug);
      const projectPath = path.join(PROJECTS, slug, 'project.json');
      if (!fs.existsSync(projectPath)) return sendJson(res, 404, { error: 'Projet introuvable.' });
      const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
      const audit = BioclimaticAudit ? BioclimaticAudit.analyze(project, { city: body?.city }) : null;

      let script = String(body?.script || '').trim();
      const action = String(body?.action || 'synthesize');

      if (!script || action === 'script') {
        const fallbackScript = audit ? BioclimaticAudit.buildLocalVoiceoverScript(project, audit) : `Bienvenue dans la découverte de ${project?.meta?.name || slug}.`;
        if (geminiClient && geminiClient.isConfigured(ROOT)) {
          const out = await geminiClient.generateText({
            systemInstruction: 'Tu es un architecte présentant chaleureusement son projet à un client lors d’un film cinématographique lent de 35 à 45 secondes. Rédige uniquement le texte à lire à voix haute en français fluide, naturel, sans didascalies ni titres, entre 85 et 120 mots.',
            prompt: `Rédige la narration du film architectural pour « ${project?.meta?.name || slug} » à ${audit?.city || 'Douala'}. Données réelles : ${JSON.stringify(audit?.metrics || {})}. Pièces : ${(audit?.rooms || []).map(r => `${r.name} (${r.areaM2} m²)`).join(', ')}.`
          });
          script = out.text;
        } else {
          script = fallbackScript;
        }
        if (action === 'script') {
          return sendJson(res, 200, { ok: true, script, source: geminiClient?.isConfigured(ROOT) ? 'Gemini' : 'local' });
        }
      }

      if (!geminiClient || !geminiClient.isConfigured(ROOT)) {
        return sendJson(res, 401, { error: 'Clé GEMINI_API_KEY requise pour synthétiser la voix off audio WAV (Gemini TTS).', script });
      }
      const voiceName = String(body?.voiceName || 'Charon');
      const { wavBuffer, voiceName: usedVoice, model } = await geminiClient.generateSpeechWav({ text: script, voiceName });
      const audioDir = path.join(media.generated, 'audio');
      fs.mkdirSync(audioDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:.]/g, '');
      const filename = `voiceover-${stamp}.wav`;
      const absTarget = path.join(audioDir, filename);
      atomicFile(absTarget, wavBuffer);
      const relFile = `${media.prefix}audio/${filename}`;
      return sendJson(res, 200, {
        ok: true,
        script,
        voiceName: usedVoice,
        model,
        file: relFile,
        audioUrl: relFile,
        size: wavBuffer.length
      });
    } catch (err) {
      return sendJson(res, err.statusCode || 502, { error: err.message || 'Erreur lors de la synthèse vocale.' });
    }
  });
}

// --- ASSISTANT CHAT IA ARCHITECTURAL (STREAMING SSE + CONTEXTE PROJET + RBAC) ---
function buildAssistantProjectContext(slug, liveContext, isClientMode) {
  const lines = [];
  let projectName = '';
  let stats = null;

  // Live Sync : si l'architecte travaille dans l'éditeur, on priorise l'état temps réel (non encore sauvegardé)
  const rawLive = (!isClientMode && liveContext && liveContext.liveProject && typeof liveContext.liveProject === 'object'
    && (Array.isArray(liveContext.liveProject.walls) || Array.isArray(liveContext.liveProject.rooms)))
    ? liveContext.liveProject
    : null;

  let diskProj = null;
  if (slug) {
    const projectFile = path.resolve(PROJECTS, slug, 'project.json');
    if (projectFile.startsWith(path.resolve(PROJECTS) + path.sep) && fs.existsSync(projectFile)) {
      try { diskProj = JSON.parse(fs.readFileSync(projectFile, 'utf8')); } catch { /* fichier projet illisible */ }
    }
  }

  const proj = rawLive
    ? {
        ...(diskProj || {}),
        ...rawLive,
        meta: { ...((diskProj && diskProj.meta) || {}), ...((rawLive && rawLive.meta) || {}) },
        config: { ...((diskProj && diskProj.config) || {}), ...((rawLive && rawLive.config) || {}) }
      }
    : diskProj;

  if (proj && typeof proj === 'object') {
    try {
      const meta = proj.meta && typeof proj.meta === 'object' ? proj.meta : {};
      projectName = String(meta.name || slug || 'Tracé en cours').slice(0, 120);
      if (rawLive) {
        lines.push('Synchronisation en direct (Live Sync) : les mesures, murs et pièces ci-dessous reflètent le tracé actif dans l’éditeur (y compris les éléments non encore enregistrés).');
      }
      lines.push(`Projet actif : ${projectName}${slug ? ` (slug: ${slug})` : ' (brouillon libre non encore enregistré)'}`);
      if (meta.subtitle) lines.push(`Sous-titre : ${String(meta.subtitle).slice(0, 180)}`);
      if (meta.location) lines.push(`Localisation : ${String(meta.location).slice(0, 140)}`);
      if (meta.phase) lines.push(`Phase : ${String(meta.phase).slice(0, 80)}`);
      if (meta.architect) lines.push(`Architecte : ${String(meta.architect).slice(0, 120)}`);
      if (!isClientMode || meta.clientVisible === true) {
        if (meta.client) lines.push(`Maître d’ouvrage : ${String(meta.client).slice(0, 120)}`);
      }
      if (meta.parti) lines.push(`Parti architectural : ${String(meta.parti).slice(0, 400)}`);
      if (meta.description) lines.push(`Description : ${String(meta.description).slice(0, 400)}`);

      const rooms = Array.isArray(proj.rooms) ? proj.rooms : [];
      const walls = Array.isArray(proj.walls) ? proj.walls : [];
      const openings = Array.isArray(proj.openings) && proj.openings.length
        ? proj.openings
        : walls.flatMap(w => (Array.isArray(w?.openings) ? w.openings : []));
      const furniture = Array.isArray(proj.furniture) ? proj.furniture : [];
      const wallHeight = Number(proj.config?.wallHeight || 2.8);
      const audit = BioclimaticAudit ? BioclimaticAudit.analyze(proj, { city: meta.location || undefined }) : null;
      const areaM2 = audit?.metrics?.habitableM2 ?? null;
      stats = {
        walls: walls.length,
        openings: openings.length,
        rooms: rooms.length,
        furniture: furniture.length,
        areaM2,
        liveSync: Boolean(rawLive)
      };
      lines.push(`${rawLive ? 'Maquette en direct' : 'Maquette enregistrée'} : ${walls.length} murs (HSP ${wallHeight} m), ${openings.length} ouvertures, ${rooms.length} pièces, ${furniture.length} éléments de mobilier${areaM2 ? `, ~${areaM2} m² habitables` : ''}.`);
      if (audit?.rooms?.length) {
        const roomSummary = audit.rooms.slice(0, 16).map(r => `${r.name}${r.areaM2 ? ` (${r.areaM2} m²)` : ''}`).join(', ');
        lines.push(`Pièces : ${roomSummary}.`);
      } else if (rooms.length) {
        const roomSummary = rooms.slice(0, 16).map(r => String(r?.name || 'Pièce').slice(0, 40)).join(', ');
        lines.push(`Pièces : ${roomSummary}.`);
      }
      if (audit && !isClientMode) {
        lines.push(`Audit bioclimatique (${audit.city || 'climat local'}) : score ${audit.score}/100, ratio vitrage ${audit.metrics?.glazingRatioPct ?? '—'} %, ventilation traversante : ${audit.metrics?.crossVentilation ? 'oui' : 'à renforcer'}.`);
      }
      if (CostEstimate && typeof CostEstimate.estimate === 'function' && !isClientMode) {
        try {
          const est = CostEstimate.estimate(proj);
          if (est && Number.isFinite(est.total)) {
            const unit = est.currency || 'FCFA';
            const topLots = Array.isArray(est.lots)
              ? est.lots.slice(0, 5).map(l => `${l.name || l.label}: ${Math.round(l.total || l.amount || 0).toLocaleString('fr-FR')} ${unit}`).join(', ')
              : '';
            lines.push(`Estimation budgétaire indicative actuelle : ~${Math.round(est.total).toLocaleString('fr-FR')} ${unit}${est.perM2 ? ` (${Math.round(est.perM2).toLocaleString('fr-FR')} ${unit}/m²)` : ''}${topLots ? ` — Principaux lots : ${topLots}` : ''}.`);
          }
        } catch { /* estimation non calculable sur ce brouillon */ }
      }
      if (slug && !isClientMode) {
        try {
          const safety = evaluateAndResolveDocumentSafety(slug, { mode: 'audit' });
          if (safety && safety.ok) {
            const bits = [];
            if (safety.missingCartouche.length) bits.push(`cartouche à compléter (${safety.missingCartouche.join(', ')})`);
            else bits.push('cartouche complet');
            if (safety.porteE.blockedAi > 0) bits.push(`Porte E : ${safety.porteE.blockedAi}/${safety.porteE.totalAi} rendu(s) IA non conforme(s)${safety.porteE.exposedBlockedAi ? ` dont ${safety.porteE.exposedBlockedAi} encore exposé(s) dans le catalogue/cahier` : ' (déjà mis en quarantaine)'}`);
            if (safety.apd) bits.push(`APD/Permis : ${safety.apd.readyCount}/${safety.apd.totalCount} pièces prêtes (${safety.apd.completeness}%)`);
            if (safety.compliance?.totalViolations || safety.compliance?.totalWarnings) {
              bits.push(`conformité PMR/RE2020/habitabilité : ${safety.compliance.totalViolations} écart(s), ${safety.compliance.totalWarnings} vigilance(s)`);
            }
            if (bits.length) lines.push(`Sécurité & préparation des documents PDF : ${bits.join(' · ')}.`);
          }
        } catch { /* audit sécurité non bloquant */ }
      }
    } catch { /* contexte projet partiel */ }
  }

  if (liveContext && typeof liveContext === 'object') {
    const safePage = String(liveContext.page || '').slice(0, 32);
    if (safePage) lines.push(`Vue active de l’utilisateur : ${safePage}`);
    if (liveContext.floor) lines.push(`Niveau affiché : ${String(liveContext.floor).slice(0, 40)}`);
    if (liveContext.tool) lines.push(`Outil actif : ${String(liveContext.tool).slice(0, 40)}`);
    if (liveContext.liveStats && typeof liveContext.liveStats === 'object') {
      const ls = liveContext.liveStats;
      const bits = [];
      if (ls.walls) bits.push(`${String(ls.walls).slice(0, 12)} murs`);
      if (ls.openings) bits.push(`${String(ls.openings).slice(0, 12)} ouvertures`);
      if (ls.rooms) bits.push(`${String(ls.rooms).slice(0, 12)} pièces`);
      if (ls.area) bits.push(`${String(ls.area).slice(0, 20)} habitables`);
      if (bits.length) lines.push(`État temps réel de l’éditeur : ${bits.join(', ')}.`);
    }
  }

  return { text: lines.join('\n'), projectName, stats };
}

function aiAssistant(req, res, access) {
  readBody(req, res, 8 * 1024 * 1024, async body => {
    const isClientMode = Boolean(portal.enabled && access?.session?.role !== 'architect');
    const requestedRaw = String(body?.project || '').trim();
    let slug = '';

    if (isClientMode) {
      const allowedSlug = String(access?.session?.project || '').trim();
      if (requestedRaw && requestedRaw.toLowerCase() !== allowedSlug.toLowerCase()) {
        return sendJson(res, 403, { error: 'Accès non autorisé à ce projet.' });
      }
      slug = allowedSlug;
    } else if (requestedRaw) {
      try { slug = projectSlug(requestedRaw); }
      catch { return sendJson(res, 400, { error: 'Identifiant de projet invalide.' }); }
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const cleanedMessages = messages
      .slice(-24)
      .map(m => ({
        role: m && m.role === 'model' ? 'model' : 'user',
        text: String(m && (m.text ?? m.content) || '').trim().slice(0, 4000)
      }))
      .filter(m => m.text.length > 0);

    if (!cleanedMessages.length) {
      return sendJson(res, 400, { error: 'Veuillez saisir un message.' });
    }

    let imageDataUrl = '';
    if (body && typeof body.imageDataUrl === 'string' && body.imageDataUrl.trim()) {
      const candidate = body.imageDataUrl.trim();
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(candidate)) {
        return sendJson(res, 400, { error: 'Capture visuelle invalide (PNG, JPEG ou WebP requis).' });
      }
      imageDataUrl = candidate;
    }

    if (!geminiClient || !geminiClient.isConfigured(ROOT)) {
      return sendJson(res, 401, {
        error: 'Assistant IA indisponible : configurez GEMINI_API_KEY dans les secrets du serveur pour activer les réponses Gemini.'
      });
    }

    const ctx = buildAssistantProjectContext(slug, body?.liveContext, isClientMode);
    const rolePrompt = isClientMode
      ? [
          'Tu es l’assistant architectural d’ArchiCam Studio en mode Portail Client (lecture seule).',
          'Tu réponds avec clarté, chaleur et précision en français aux questions du maître d’ouvrage sur son projet (pièces, surfaces, matériaux, confort, lumière, étapes).',
          'Ne révèle aucune donnée interne confidentielle et précise toujours que les chiffres ou suggestions restent indicatifs et soumis à validation de l’architecte.',
          'Le budget n’est communiqué que si le partage est activé sur le dossier ; sinon, indique simplement que l’enveloppe est tenue par l’architecte et reste disponible sur demande.'
        ].join(' ')
      : [
          'Tu es l’assistant architectural expert d’ArchiCam Studio, copilote d’un cabinet d’architecture contemporaine.',
          'Tu réponds en français clair, structuré et concis (listes courtes, chiffres précis, recommandations concrètes et immédiatement exploitables).',
          'Tu t’appuies toujours sur les données réelles du projet transmises ci-dessous (surfaces, pièces, audit bioclimatique, estimation budgétaire) sans inventer de mesures absentes. Pour les simulations « Et si… » (budget, surfaces, matériaux), donne une fourchette réaliste argumentée par poste.',
          'Si une capture du plan 2D, de la vue 3D ou une photo d’inspiration/croquis est jointe, analyse-la visuellement et propose des adaptations concrètes au projet.',
          'Sur une consigne de sécurité, conformité ou contrôle avant export PDF : propose immédiatement l’action resolve_document_safety qui sécurise tout ce que le dispositif autorise (synchronisation réelle du profil cabinet, assainissement des métadonnées et confidentialité client, mise en quarantaine automatique Porte E des rendus IA non conformes) SANS jamais inventer de champs légaux (client, localisation, phase, indice, date) ni contourner le verrou Porte E. Si l’architecte demande explicitement une phase, un indice, la date du jour ou le masquage client, propose set_cartouche avec les paramètres exacts (ex. [[ACTION:set_cartouche:phase=APD,revision=B,issueDate=today|Appliquer APD · Indice B]]). Signale clairement ce qui reste à valider par l’architecte.',
          'Quand une ou plusieurs actions directes dans l’application aident immédiatement l’architecte, propose 1 à 4 boutons en toute fin de réponse avec la syntaxe STRICTE [[ACTION:id|Libellé court]] ou [[ACTION:id:param|Libellé court]] uniquement parmi ces identifiants autorisés :',
          '- Conception générative & chaîne complète (sans plan importé) : run_studio_pipeline (orchestrateur complet : conception directe dans l’éditeur 2D/3D → meublage auto → conformité PMR/RE2020 & notice → enregistrement → contrôle sécurité & cartouche → APS Auto PDF + Devis estimatif FCFA (PDF cartouché + classeur Excel) + Cahier de plans A3 + Catalogue Premium PDF + Dossier APD/Permis ; param optionnel: brief court), generate_plan_brief (param: brief court, ex. Villa 140 m2 3 chambres veranda), apply_plan_patch (param: modification concrète, ex. Passe la hauteur sous plafond à 3.10 m ou Ajoute une pergola 4x3 m), autofix_compliance (correction automatique PMR 0.90m / HSP 2.50m / RE2020 1/6 vitrage), inject_editorial_brief (rédaction et injection du sous-titre, parti architectural et description dans le dossier), create_ab_variants (création automatique de Variantes A et B chiffrées en FCFA).',
          '- Documents, BIM & conformité : resolve_document_safety, set_cartouche (param: phase=ESQ|APS|APD|PC|DCE|EXE, revision=A, issueDate=today|YYYY-MM-DD, clientVisible=true|false, budgetShared=true|false), generate_aps, generate_apd, generate_catalog, generate_tech_drawings, generate_estimate, export_ifc, export_gbxml, run_compliance, run_bioclimatic, run_structural, compose_planbook, print_planbook, export_json, open_project_info, open_deliverables.',
          '- Dossier, variantes & collaboration : open_revisions, save_revision (param optionnel: libellé court), compare_versions, open_variants, generate_variants, open_annotations, open_cabinet, open_meeting, save_project, open_index.',
          '- Visite 3D, ambiances & cinéma : set_ambiance (param: origin|pierre-chaux|beton-bois|villa-tropicale), set_finish (param: floor=oak|tile|concrete, facade=plaster|timber|stone), set_solar_hour (param: 7..20 ex. 8, 13, 17, 20), toggle_solar_play, toggle_night, toggle_section_3d, toggle_explode_3d, toggle_timelapse_4d, toggle_clearances, toggle_plan_compare, toggle_present_mode, open_gallery, open_sublimate, export_video, export_ai_sequence, open_bioclimatic, view_3d.',
          '- Éditeur 2D/3D : set_floor (param: 0 ou 1), select_tool (param: select|calibrate|wall-ext|wall-int|door|window|open|room-auto|room|room-poly|column|slab|stairwell|pergola|furniture|camera|annotate|measure), editor_undo, editor_redo, load_template (param: villa-f4|studio|villa-serena), open_ai_read, open_vector_pdf, open_plan_cleanup, auto_furnish, view_split, view_2d.'
        ].join(' ');

    const systemInstruction = ctx.text
      ? `${rolePrompt}\n\nContexte réel de l’atelier :\n${ctx.text}`
      : rolePrompt;

    const wantsStream = body?.stream !== false;
    if (!wantsStream) {
      try {
        const result = await geminiClient.streamAssistantChat({
          messages: cleanedMessages,
          systemInstruction,
          imageDataUrl,
          rootDir: ROOT
        });
        return sendJson(res, 200, {
          ok: true,
          text: result.text,
          model: result.model,
          project: slug || null,
          projectName: ctx.projectName || null,
          mode: isClientMode ? 'client' : 'architect',
          stats: ctx.stats
        });
      } catch (err) {
        return sendJson(res, err.statusCode || 502, { error: err.message || 'Erreur de l’assistant IA.' });
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const sendEvent = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('meta', {
      model: geminiClient.TEXT_MODEL,
      project: slug || null,
      projectName: ctx.projectName || null,
      mode: isClientMode ? 'client' : 'architect',
      stats: ctx.stats
    });

    try {
      const result = await geminiClient.streamAssistantChat({
        messages: cleanedMessages,
        systemInstruction,
        imageDataUrl,
        rootDir: ROOT,
        onChunk: piece => sendEvent('chunk', { text: piece })
      });
      sendEvent('done', { ok: true, model: result.model });
    } catch (err) {
      sendEvent('error', {
        error: err.message || 'Erreur lors de la génération de la réponse.',
        status: err.statusCode || 502
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });
}

// --- LECTURE VOCALE D'UNE RÉPONSE ASSISTANT (GEMINI TTS WAV) ---
function aiAssistantTts(req, res) {
  readBody(req, res, 32 * 1024, async body => {
    const rawText = String(body?.text || '')
      .replace(/\[\[ACTION:[^\]]+\]\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/[#`_*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2200);
    if (!rawText) return sendJson(res, 400, { error: 'Texte requis pour la lecture vocale.' });
    if (!geminiClient || !geminiClient.isConfigured(ROOT)) {
      return sendJson(res, 401, { error: 'Clé GEMINI_API_KEY requise sur le serveur pour la voix Gemini.' });
    }
    try {
      const voiceName = String(body?.voiceName || 'Charon');
      const { wavBuffer } = await geminiClient.generateSpeechWav({
        text: rawText,
        voiceName,
        style: 'Voix d’architecte française posée, claire, précise et chaleureuse.'
      });
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wavBuffer.length),
        'Cache-Control': 'no-store'
      });
      res.end(wavBuffer);
    } catch (err) {
      return sendJson(res, err.statusCode || 502, { error: err.message || 'Lecture vocale indisponible.' });
    }
  });
}

// --- SÉCURISATION & AUDIT DES GÉNÉRATEURS DE DOCUMENTS (ARCHITECTE UNIQUEMENT) ---
const ALLOWED_SAFETY_PHASES = new Set(['ESQ', 'APS', 'APD', 'PC', 'DCE', 'EXE']);

function isAiManifestImage(item) {
  if (!item || item.type !== 'image') return false;
  if (DeliverableGate && typeof DeliverableGate.isAiRender === 'function') return DeliverableGate.isAiRender(item);
  return Boolean(item.ai || item.model || /photor/i.test(String(item.id || '')));
}

function evaluateManifestGate(item) {
  if (DeliverableGate && typeof DeliverableGate.evaluate === 'function') return DeliverableGate.evaluate(item);
  if (!isAiManifestImage(item)) return { eligible: true, status: 'non-ai', reason: 'Image non générée par IA.' };
  const verdict = String(item?.fidelity?.verdict || '').toLowerCase();
  const v = Number(item?.fidelity?.version || 1);
  if (verdict === 'faithful' && v >= 2) return { eligible: true, status: 'faithful', reason: 'Rendu IA vérifié fidèle.' };
  if (item?.fidelityOverride && item.fidelityOverride.reason) return { eligible: true, status: 'override', reason: 'Forçage tracé par l’architecte.' };
  return { eligible: false, status: 'blocked', reason: 'Contrôle géométrique Porte E non validé.' };
}

function fallbackMissingCartouche(proj, cabinet) {
  const m = proj?.meta && typeof proj.meta === 'object' ? proj.meta : {};
  const has = v => {
    const s = String(v || '').trim();
    return Boolean(s && s !== '—' && s !== '-');
  };
  const missing = [];
  if (!has(m.client)) missing.push("Maître d'ouvrage");
  if (!has(m.location || m.address)) missing.push('Localisation');
  if (!has(m.architect) && !has(m.agency) && !has(cabinet?.name) && !has(cabinet?.architect)) missing.push("Agence / maître d'œuvre");
  if (!has(m.phase)) missing.push('Phase');
  if (!has(m.revision)) missing.push('Indice');
  if (!has(m.issueDate || m.date)) missing.push("Date d'émission");
  return missing;
}

function evaluateAndResolveDocumentSafety(rawSlug, opts = {}) {
  const slug = projectSlug(rawSlug);
  const projectFile = path.resolve(PROJECTS, slug, 'project.json');
  if (!projectFile.startsWith(path.resolve(PROJECTS) + path.sep) || !fs.existsSync(projectFile)) {
    throw Object.assign(new Error('Projet introuvable.'), { status: 404 });
  }

  const mode = opts.mode === 'audit' ? 'audit' : 'resolve';
  const applyCartouche = opts.applyCartouche !== false;
  const enforceDeliverableGate = opts.enforceDeliverableGate !== false;
  const proj = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  if (!proj || typeof proj !== 'object') throw Object.assign(new Error('Dossier projet illisible.'), { status: 409 });
  if (!proj.meta || typeof proj.meta !== 'object') proj.meta = {};

  const cabinet = cabinetStore.read(ROOT);
  const resolved = [];
  let projectDirty = false;

  // 1. Résolutions sûres sur project.meta (sans JAMAIS inventer client, lieu, phase, indice ou date)
  if (mode === 'resolve' && applyCartouche) {
    const cleanField = (key) => {
      if (typeof proj.meta[key] !== 'string') return;
      const trimmed = proj.meta[key].trim();
      if (trimmed === '—' || trimmed === '-') {
        proj.meta[key] = '';
        projectDirty = true;
        resolved.push(`Valeur fictive « ${trimmed} » retirée du champ ${key} (masqué proprement dans le cartouche PDF).`);
      } else if (trimmed !== proj.meta[key]) {
        proj.meta[key] = trimmed;
        projectDirty = true;
      }
    };
    for (const key of ['client', 'location', 'address', 'architect', 'agency', 'phase', 'revision', 'issueDate', 'date']) {
      cleanField(key);
    }

    // Synchronisation réelle du profil cabinet déjà configuré (jamais de valeur fabriquée)
    if (cabinet.name && !String(proj.meta.agency || '').trim()) {
      proj.meta.agency = cabinet.name;
      projectDirty = true;
      resolved.push(`Agence synchronisée depuis le profil cabinet : ${cabinet.name}.`);
    }
    if (cabinet.architect && !String(proj.meta.architect || '').trim()) {
      proj.meta.architect = cabinet.architect;
      projectDirty = true;
      resolved.push(`Architecte responsable synchronisé depuis le profil cabinet : ${cabinet.architect}.`);
    }

    // Confidentialité client : jamais exposé sur les couvertures partagées si client vide ou flag non booléen
    if (!String(proj.meta.client || '').trim() && proj.meta.clientVisible === true) {
      proj.meta.clientVisible = false;
      projectDirty = true;
      resolved.push('Option d’exposition du client désactivée (aucun maître d’ouvrage renseigné).');
    }

    // Partage du budget : jamais activé sans pièce à chiffrer (le client ne verrait qu’un écran vide)
    if (proj.meta.budgetShared === true && !(Array.isArray(proj.rooms) && proj.rooms.length)) {
      proj.meta.budgetShared = false;
      projectDirty = true;
      resolved.push('Partage du budget désactivé (aucune pièce à chiffrer dans le plan).');
    }

    // Mises à jour explicites uniquement si transmises volontairement par l'architecte
    const explicit = opts.metaUpdates && typeof opts.metaUpdates === 'object' ? opts.metaUpdates : null;
    const isPlaceholderVal = (val) => /^[-—–._/]+$|^(?:n\/a|na|tbd|todo|inconnu|non\s*renseign[ée])$/i.test(String(val || '').trim());
    if (explicit) {
      if (typeof explicit.client === 'string') {
        const cl = explicit.client.trim().slice(0, 120);
        if (cl && !isPlaceholderVal(cl) && proj.meta.client !== cl) {
          proj.meta.client = cl;
          projectDirty = true;
          resolved.push('Maître d’ouvrage renseigné explicitement par l’architecte.');
        }
      }
      if (typeof explicit.location === 'string') {
        const loc = explicit.location.trim().slice(0, 140);
        if (loc && !isPlaceholderVal(loc) && proj.meta.location !== loc) {
          proj.meta.location = loc;
          projectDirty = true;
          resolved.push(`Localisation renseignée explicitement : ${loc}.`);
        }
      }
      if (typeof explicit.phase === 'string') {
        const ph = explicit.phase.trim().toUpperCase();
        if (ALLOWED_SAFETY_PHASES.has(ph) && proj.meta.phase !== ph) {
          proj.meta.phase = ph;
          projectDirty = true;
          resolved.push(`Phase du dossier définie explicitement : ${ph}.`);
        }
      }
      if (typeof explicit.revision === 'string') {
        const rev = explicit.revision.trim().slice(0, 16);
        if (/^[A-Z0-9._-]+$/i.test(rev) && proj.meta.revision !== rev) {
          proj.meta.revision = rev;
          projectDirty = true;
          resolved.push(`Indice du dossier défini explicitement : ${rev}.`);
        }
      }
      if (typeof explicit.issueDate === 'string') {
        const dt = explicit.issueDate.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dt) && proj.meta.issueDate !== dt) {
          proj.meta.issueDate = dt;
          projectDirty = true;
          resolved.push(`Date d’émission définie explicitement : ${dt}.`);
        }
      }
      if (typeof explicit.clientVisible === 'boolean' && proj.meta.clientVisible !== explicit.clientVisible) {
        proj.meta.clientVisible = explicit.clientVisible;
        projectDirty = true;
        resolved.push(explicit.clientVisible
          ? 'Affichage du maître d’ouvrage activé sur les couvertures partagées.'
          : 'Confidentialité renforcée : maître d’ouvrage masqué sur les couvertures partagées.');
      }
      if (typeof explicit.budgetShared === 'boolean' && proj.meta.budgetShared !== explicit.budgetShared) {
        proj.meta.budgetShared = explicit.budgetShared;
        projectDirty = true;
        resolved.push(explicit.budgetShared
          ? 'Partage de l’enveloppe budgétaire activé pour le client invité.'
          : 'Enveloppe budgétaire réservée à l’agence : masquée au client invité.');
      }
    }

    if (projectDirty) {
      atomicFile(projectFile, JSON.stringify(proj, null, 2));
    }
  }

  // 2. Verrouillage Porte E (DeliverableGate) : quarantaine automatique des rendus IA non conformes
  const mediaPaths = projectMedia(slug);
  let manifest = { version: 1, items: [] };
  let hasManifestFile = false;
  if (fs.existsSync(mediaPaths.manifest)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mediaPaths.manifest, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) {
        manifest = parsed;
        hasManifestFile = true;
      }
    } catch { /* manifeste illisible */ }
  }
  const renders = fs.existsSync(mediaPaths.renders)
    ? fs.readdirSync(mediaPaths.renders).filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    : [];

  const images = manifest.items.filter(it => it && it.type === 'image');
  let totalAi = 0;
  let eligibleAi = 0;
  let blockedAi = 0;
  let exposedBlockedAi = 0;
  const quarantinedNow = [];
  const blockedItems = [];
  let manifestDirty = false;

  for (const item of images) {
    if (!isAiManifestImage(item)) continue;
    totalAi += 1;
    const verdict = evaluateManifestGate(item);
    if (verdict.eligible) {
      eligibleAi += 1;
    } else {
      blockedAi += 1;
      const wasExposed = item.catalog === true || item.book === true || item.published === true;
      if (mode === 'resolve' && enforceDeliverableGate && wasExposed) {
        item.catalog = false;
        item.book = false;
        if (item.published === true) item.published = false;
        manifestDirty = true;
        quarantinedNow.push(item.label || item.id);
      } else if (wasExposed) {
        exposedBlockedAi += 1;
      }
      blockedItems.push({ id: item.id, label: item.label || item.id, reason: verdict.reason });
    }
  }

  if (manifestDirty && hasManifestFile) {
    atomicFile(mediaPaths.manifest, JSON.stringify(manifest, null, 2));
    resolved.push(`Porte E appliquée : ${quarantinedNow.length} rendu(s) IA non conforme(s) retiré(s) du catalogue et du cahier client (${quarantinedNow.join(', ')}).`);
  }

  // 3. Diagnostics complets post-résolution (Cartouche, Checklist, APD, Conformité PMR/RE2020/Habitabilité)
  const missingCartouche = PdfIdentity && typeof PdfIdentity.missingFields === 'function'
    ? (PdfIdentity.missingFields(proj, { cabinet }).missing || [])
    : fallbackMissingCartouche(proj, cabinet);

  const savedPlanches = planchesStore && typeof planchesStore.list === 'function'
    ? (() => { try { return planchesStore.list(PROJECTS, slug) || []; } catch { return []; } })()
    : [];

  let checklist = null;
  if (DeliverableChecklist && typeof DeliverableChecklist.evaluate === 'function') {
    try {
      checklist = DeliverableChecklist.evaluate({
        project: proj,
        cabinet,
        media: { images, renders },
        planches: savedPlanches
      });
    } catch { checklist = null; }
  }

  let apd = null;
  if (ApdDossier && typeof ApdDossier.evaluate === 'function') {
    try {
      const ev = ApdDossier.evaluate({
        project: proj,
        cabinet,
        media: { images, renders },
        planches: savedPlanches
      });
      apd = {
        readyCount: ev.readyCount,
        partialCount: ev.partialCount,
        totalCount: ev.totalCount,
        completeness: ev.completeness,
        canExport: ev.canExport,
        missingPieces: (ev.pieces || []).filter(p => p.status !== 'ready').map(p => `${p.code} ${p.title} (${p.status === 'partial' ? 'partiel' : 'manquant'})`)
      };
    } catch { apd = null; }
  }

  let compliance = null;
  if (CodeCompliance && typeof CodeCompliance.generateComplianceReport === 'function') {
    try {
      const rep = CodeCompliance.generateComplianceReport(proj, { checkPMR: true });
      compliance = {
        compliant: Boolean(rep?.summary?.compliant),
        totalViolations: Number(rep?.summary?.totalViolations || 0),
        totalWarnings: Number(rep?.summary?.totalWarnings || 0),
        violations: (rep?.summary?.violations || []).slice(0, 8).map(v => v.message || `${v.rule}`),
        warnings: (rep?.summary?.warnings || []).slice(0, 6).map(w => w.message || `${w.rule}`)
      };
    } catch { compliance = null; }
  }

  const remaining = [];
  if (missingCartouche.length) {
    remaining.push(`Cartouche PDF à renseigner manuellement (jamais inventé) : ${missingCartouche.join(', ')}.`);
  }
  if (blockedItems.length) {
    remaining.push(`Porte E : ${blockedItems.length} rendu(s) IA exclu(s) des PDF client — régénérez-les ou enregistrez un forçage tracé par l’architecte si besoin.`);
  }
  if (compliance && compliance.violations.length) {
    for (const v of compliance.violations.slice(0, 4)) remaining.push(`Conformité géométrique (à ajuster en 2D) : ${v}`);
  }
  if (apd && apd.missingPieces.length) {
    remaining.push(`Pièces APD / Permis à compléter : ${apd.missingPieces.slice(0, 4).join(' · ')}.`);
  }

  const walls = Array.isArray(proj.walls) ? proj.walls : [];
  const rooms = Array.isArray(proj.rooms) ? proj.rooms : [];
  const modelReady = walls.length > 0 && rooms.length > 0;
  const safeVisualCount = renders.length + eligibleAi;

  const readyGenerators = [
    {
      id: 'generate_aps',
      label: 'APS Auto PDF',
      ready: modelReady,
      note: modelReady
        ? (missingCartouche.length ? 'Prêt (champs vides masqués dans le cartouche)' : 'Prêt avec cartouche complet')
        : 'Tracez murs et pièces dans l’éditeur 2D'
    },
    {
      id: 'generate_apd',
      label: 'Dossier APD / Permis PDF',
      ready: modelReady,
      note: apd ? `${apd.readyCount}/${apd.totalCount} pièces prêtes (${apd.completeness}%)` : (modelReady ? 'Prêt' : 'Maquette requise')
    },
    {
      id: 'generate_catalog',
      label: 'Catalogue Premium PDF',
      ready: safeVisualCount > 0,
      note: safeVisualCount > 0
        ? `${safeVisualCount} visuel(s) sûr(s) (vues 3D + rendus IA Porte E)`
        : 'Aucune vue 3D ni rendu IA conforme Porte E'
    },
    {
      id: 'generate_tech_drawings',
      label: 'Coupes 2D & Toiture',
      ready: modelReady,
      note: modelReady ? 'Génération vectorielle exacte prête' : 'Maquette requise'
    },
    {
      id: 'generate_estimate',
      label: 'Métré & Estimation FCFA / Excel',
      ready: rooms.length > 0,
      note: rooms.length > 0 ? 'Calcul des quantités prêt' : 'Définissez au moins une pièce'
    }
  ];

  return {
    ok: true,
    slug,
    projectName: String(proj.meta?.name || slug),
    mode,
    meta: {
      agency: String(proj.meta?.agency || ''),
      architect: String(proj.meta?.architect || ''),
      client: String(proj.meta?.client || ''),
      clientVisible: proj.meta?.clientVisible === true,
      budgetShared: proj.meta?.budgetShared === true,
      location: String(proj.meta?.location || ''),
      phase: String(proj.meta?.phase || ''),
      revision: String(proj.meta?.revision || ''),
      issueDate: String(proj.meta?.issueDate || proj.meta?.date || '')
    },
    resolved,
    remaining,
    missingCartouche,
    porteE: { totalAi, eligibleAi, blockedAi, exposedBlockedAi, quarantinedNow, blockedItems },
    checklist: checklist ? { doneCount: checklist.doneCount, totalSteps: checklist.totalSteps, ready: checklist.ready } : null,
    apd,
    compliance,
    readyGenerators
  };
}

function documentSafetyApi(req, res, urlPath, access = {}) {
  if (portal.enabled && access?.session?.role !== 'architect') {
    return sendJson(res, 403, { error: 'La sécurisation des générateurs de documents est réservée à l’architecte.' });
  }
  const match = /^\/api\/projects\/([^/]+)\/document-safety$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route introuvable.' });
  const rawSlug = match[1];

  if (req.method === 'GET') {
    try {
      return sendJson(res, 200, evaluateAndResolveDocumentSafety(rawSlug, { mode: 'audit' }));
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Audit sécurité impossible.' });
    }
  }
  if (req.method === 'POST') {
    return readBody(req, res, 16 * 1024, body => {
      try {
        const result = evaluateAndResolveDocumentSafety(rawSlug, {
          mode: body?.mode === 'audit' ? 'audit' : 'resolve',
          applyCartouche: body?.applyCartouche !== false,
          enforceDeliverableGate: body?.enforceDeliverableGate !== false,
          metaUpdates: body?.metaUpdates
        });
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.status || 400, { error: err.message || 'Sécurisation impossible.' });
      }
    });
  }
  return sendJson(res, 405, { error: 'Méthode non autorisée.' });
}

// --- CONCEPTION GÉNÉRATIVE SANS PLAN, PATCH NATUREL, AUTO-FIX PMR/RE2020, ÉDITORIAL & VARIANTES A/B ---
function requireArchitectDesignEngine(res, access) {
  if (portal.enabled && access?.session?.role !== 'architect') {
    sendJson(res, 403, { error: 'Cette action de conception est réservée à l’architecte.' });
    return false;
  }
  if (!aiDesignEngine) {
    sendJson(res, 503, { error: 'Moteur de conception IA indisponible.' });
    return false;
  }
  return true;
}

function readProjectJsonSafe(rawSlug) {
  const slug = projectSlug(rawSlug);
  const projectFile = path.resolve(PROJECTS, slug, 'project.json');
  if (!projectFile.startsWith(path.resolve(PROJECTS) + path.sep) || !fs.existsSync(projectFile)) {
    throw Object.assign(new Error('Dossier projet introuvable.'), { status: 404 });
  }
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  return { slug, projectFile, project };
}

function aiGeneratePlan(req, res, access = {}) {
  if (!requireArchitectDesignEngine(res, access)) return;
  return readBody(req, res, 64 * 1024, async body => {
    try {
      const brief = String(body?.brief || '').trim();
      const result = await aiDesignEngine.generatePlanFromBrief(brief, { geminiClient, rootDir: ROOT });
      let savedSlug = null;
      if (body?.saveAsNew === true) {
        const rawCandidate = String(body?.slug || result.project?.meta?.slug || 'projet-ia')
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'projet-ia';
        let finalSlug = rawCandidate;
        let idx = 2;
        while (fs.existsSync(path.join(PROJECTS, finalSlug, 'project.json')) && idx < 99) {
          finalSlug = `${rawCandidate.slice(0, 44)}-${idx++}`;
        }
        const dir = path.resolve(PROJECTS, finalSlug);
        if (!dir.startsWith(path.resolve(PROJECTS) + path.sep)) {
          return sendJson(res, 400, { error: 'Identifiant de dossier invalide.' });
        }
        result.project.meta = { ...(result.project.meta || {}), slug: finalSlug };
        fs.mkdirSync(dir, { recursive: true });
        ensureProjectMedia(finalSlug);
        atomicFile(path.join(dir, 'project.json'), JSON.stringify(result.project, null, 2));
        savedSlug = finalSlug;
      }
      return sendJson(res, 200, { ...result, savedSlug });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Génération de plan impossible.' });
    }
  });
}

function aiPlanPatch(req, res, access = {}) {
  if (!requireArchitectDesignEngine(res, access)) return;
  return readBody(req, res, 4 * 1024 * 1024, async body => {
    try {
      const instruction = String(body?.instruction || '').trim();
      let baseProject = (body?.project && typeof body.project === 'object' && Array.isArray(body.project.walls))
        ? body.project
        : null;
      if (!baseProject && body?.slug) {
        baseProject = readProjectJsonSafe(body.slug).project;
      }
      if (!baseProject) {
        return sendJson(res, 400, { error: 'Aucun plan actif trouvé pour appliquer cette modification.' });
      }
      const result = await aiDesignEngine.computeNaturalLanguagePatch(baseProject, instruction, { geminiClient, rootDir: ROOT });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Modification du plan impossible.' });
    }
  });
}

function complianceAutofixApi(req, res, urlPath, access = {}) {
  if (!requireArchitectDesignEngine(res, access)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  const match = /^\/api\/projects\/([^/]+)\/compliance-autofix$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route introuvable.' });
  return readBody(req, res, 4 * 1024 * 1024, body => {
    try {
      const { slug, projectFile, project: diskProject } = readProjectJsonSafe(match[1]);
      const baseProject = (body?.project && typeof body.project === 'object' && Array.isArray(body.project.walls))
        ? body.project
        : diskProject;
      const result = aiDesignEngine.computeComplianceAutoFix(baseProject);
      let persisted = false;
      if (body?.apply === true && result.fixedCount > 0) {
        atomicFile(projectFile, JSON.stringify(result.patchedProject, null, 2));
        persisted = true;
      }
      return sendJson(res, 200, { ...result, slug, persisted });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Correction PMR/RE2020 impossible.' });
    }
  });
}

function editorialBriefApi(req, res, urlPath, access = {}) {
  if (!requireArchitectDesignEngine(res, access)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  const match = /^\/api\/projects\/([^/]+)\/editorial-brief$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route introuvable.' });
  return readBody(req, res, 2 * 1024 * 1024, async body => {
    try {
      const { slug, projectFile, project: diskProject } = readProjectJsonSafe(match[1]);
      const sourceProject = (body?.project && typeof body.project === 'object' && Array.isArray(body.project.rooms))
        ? { ...diskProject, ...body.project, meta: { ...(diskProject.meta || {}), ...(body.project.meta || {}) } }
        : diskProject;
      const mode = body?.mode === 'apply' ? 'apply' : 'preview';
      let draft;
      let source = 'user-confirmed';
      if (mode === 'apply' && body?.draft && typeof body.draft === 'object') {
        draft = {
          subtitle: String(body.draft.subtitle || '').trim().slice(0, 180),
          parti: String(body.draft.parti || '').trim().slice(0, 900),
          description: String(body.draft.description || '').trim().slice(0, 1400)
        };
      } else {
        const gen = await aiDesignEngine.generateEditorialBrief(sourceProject, {
          geminiClient,
          rootDir: ROOT,
          tone: String(body?.tone || 'architectural').slice(0, 40)
        });
        draft = gen.draft;
        source = gen.source;
      }
      if (!draft.subtitle && !draft.parti && !draft.description) {
        return sendJson(res, 400, { error: 'Brouillon éditorial vide.' });
      }
      let applied = false;
      if (mode === 'apply') {
        // N'injecte QUE les champs éditoriaux (jamais client, localisation, phase, indice ou date)
        if (!diskProject.meta || typeof diskProject.meta !== 'object') diskProject.meta = {};
        if (draft.subtitle) diskProject.meta.subtitle = draft.subtitle;
        if (draft.parti) diskProject.meta.parti = draft.parti;
        if (draft.description) diskProject.meta.description = draft.description;
        atomicFile(projectFile, JSON.stringify(diskProject, null, 2));
        applied = true;
      }
      return sendJson(res, 200, { ok: true, slug, mode, applied, source, draft });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Rédaction éditoriale impossible.' });
    }
  });
}

function generateAbVariantsApi(req, res, urlPath, access = {}) {
  if (!requireArchitectDesignEngine(res, access)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  const match = /^\/api\/projects\/([^/]+)\/generate-ab-variants$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route introuvable.' });
  if (!variantsStore || typeof variantsStore.save !== 'function') {
    return sendJson(res, 503, { error: 'Gestionnaire de variantes indisponible.' });
  }
  return readBody(req, res, 4 * 1024 * 1024, body => {
    try {
      const { slug, project: diskProject } = readProjectJsonSafe(match[1]);
      const baseProject = (body?.project && typeof body.project === 'object' && Array.isArray(body.project.walls))
        ? body.project
        : diskProject;
      const built = aiDesignEngine.buildABVariants(baseProject, { costEstimate: CostEstimate });
      const savedA = variantsStore.save(PROJECTS, slug, 'A', {
        label: built.variantA.label,
        notes: built.variantA.notes,
        materials: built.variantA.materials,
        snapshot: built.variantA.snapshot
      });
      const savedB = variantsStore.save(PROJECTS, slug, 'B', {
        label: built.variantB.label,
        notes: built.variantB.notes,
        materials: built.variantB.materials,
        snapshot: built.variantB.snapshot
      });
      return sendJson(res, 200, {
        ok: true,
        slug,
        variantA: { ...savedA, metrics: built.variantA.metrics },
        variantB: { ...savedB, metrics: built.variantB.metrics },
        delta: built.delta
      });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message || 'Création des variantes A/B impossible.' });
    }
  });
}

// --- PANORAMAS 360° ÉQUIRECTANGULAIRES PAR PIÈCE ---
function listPanoramas(res, url) {
  try {
    const slug = projectSlug(url.searchParams.get('project'));
    const media = ensureProjectMedia(slug);
    const dir = path.join(media.generated, 'panoramas');
    const indexFile = path.join(dir, 'panoramas.json');
    let items = [];
    if (fs.existsSync(indexFile)) {
      const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      if (Array.isArray(parsed)) items = parsed.filter(it => it && typeof it.file === 'string' && fs.existsSync(path.join(ROOT, it.file)));
    }
    return sendJson(res, 200, { project: slug, items });
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
}

function savePanorama(req, res, url) {
  readBody(req, res, 16 * 1024 * 1024, body => {
    try {
      const slug = projectSlug(url.searchParams.get('project') || body?.project);
      const media = ensureProjectMedia(slug);
      const rawId = String(body?.id || `pano-${Date.now()}`).trim().replace(/[^a-z0-9_-]/gi, '-').slice(0, 72);
      const label = String(body?.label || 'Panorama 360°').trim().slice(0, 120);
      const roomId = String(body?.roomId || '').trim().slice(0, 60);
      const source = String(body?.source || '3d') === 'ai' ? 'ai' : '3d';
      const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/i.exec(String(body?.dataUrl || ''));
      if (!rawId || !match) return sendJson(res, 400, { error: 'Image équirectangulaire 360° invalide (JPEG/PNG requis).' });
      const ext = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
      const dir = path.join(media.generated, 'panoramas');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${rawId}.${ext}`;
      const absTarget = path.resolve(dir, filename);
      if (!absTarget.startsWith(path.resolve(dir) + path.sep)) return sendJson(res, 400, { error: 'Nom de panorama invalide.' });
      const buf = Buffer.from(match[2], 'base64');
      atomicFile(absTarget, buf);
      const relFile = `${media.prefix}panoramas/${filename}`;

      const indexFile = path.join(dir, 'panoramas.json');
      let items = [];
      if (fs.existsSync(indexFile)) {
        try { items = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { items = []; }
        if (!Array.isArray(items)) items = [];
      }
      const entry = { id: rawId, label, roomId, source, file: relFile, createdAt: new Date().toISOString(), size: buf.length };
      const idx = items.findIndex(it => it && it.id === rawId);
      if (idx >= 0) items[idx] = entry;
      else items.unshift(entry);
      atomicFile(indexFile, JSON.stringify(items, null, 2));
      return sendJson(res, 200, { ok: true, item: entry });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });
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
      const allowedRatios = new Set(['16:9', '4:3', '1:1', '3:2', '2:1', '9:16']);
      const aspectRatio = allowedRatios.has(String(body.aspect_ratio || '')) ? String(body.aspect_ratio) : '16:9';
      const r = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'ArchiCam Studio' },
        body: JSON.stringify({
          model: body.model, prompt: body.prompt, input_references: body.input_references,
          aspect_ratio: aspectRatio, n: 1, output_format: 'png', response_format: 'b64_json'
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
      const livingPeople = manifest.livingPeople !== false;
      const livingEnvironment = manifest.livingEnvironment !== false;
      const pace = manifest.pace === 'contemplatif' ? 'contemplative' : 'slow';
      const segsWithPrompts = manifest.segments.slice(0, 99).map(s => {
        const label = String(s.label || '').slice(0, 120);
        const kind = s.aerial || /façade|facade|arrivée|arrivee|extérieur|exterieur|jardin|véranda|veranda|ensemble|envol/i.test(label) ? 'exterior' : 'interior';
        const prompt = AiPrompt && typeof AiPrompt.buildVideoPrompt === 'function'
          ? AiPrompt.buildVideoPrompt({ kind, movement: `Slow continuous architectural camera glide across ${label}`, livingPeople, livingEnvironment, pace })
          : `Ultra-slow architectural gimbal glide across ${label}, strictly preserving walls and geometry, gentle tropical wind swaying foliage, natural shifting light and calm realistic residents moving softly.`;
        return {
          index: Number(s.index), label, frames: Number(s.frames), seconds: Number(s.seconds),
          start: Number(s.start), end: Number(s.end), aerial: Boolean(s.aerial), kind, prompt
        };
      });
      const clean = {
        sequence, project: projectSlug(url.searchParams.get('project')), created: new Date().toISOString(),
        fps: Number(manifest.fps) || 24, width: Number(manifest.width) || 1280, height: Number(manifest.height) || 720,
        passes: (manifest.passes || []).filter(p => SEQUENCE_PASSES[p]),
        pace, livingPeople, livingEnvironment,
        segments: segsWithPrompts,
        notice: 'Rendu d’ambiance illustratif non contractuel : la géométrie reste verrouillée par depth + edges ; l’IA sublime matières, lumière, végétation au vent et vie humaine naturelle.'
      };
      fs.writeFileSync(path.join(dir, 'sequence.json'), JSON.stringify(clean, null, 2));
      const lines = [
        'SÉQUENCE CINÉMATOGRAPHIQUE POUR L’IA — ArchiCam Studio',
        `Projet : ${clean.project} · ${clean.fps} images/s · ${clean.width}×${clean.height} · Rythme : ${pace}`,
        `Vie animée : personnages=${livingPeople ? 'oui' : 'non'} · environnement extérieur au vent=${livingEnvironment ? 'oui' : 'non'}`,
        '',
        'Dossiers : seg-XX/color (rendu de la maquette), seg-XX/depth (profondeur, proche = blanc), seg-XX/edges (contours).',
        '',
        'Utilisation :',
        ' - Runway (Aleph / Gen-4, vidéo vers vidéo) ou Luma (Modify) : importer la vidéo color d’un segment, structure élevée (0.85+), coller le prompt du segment ci-dessous.',
        ' - ComfyUI + Wan VACE / ControlNet Depth + Canny : séquence color en entrée, depth et/ou edges en contrôle pour verrouiller murs et ouvertures.',
        '',
        'Assembler un segment en vidéo (ffmpeg) :',
        ...clean.segments.map(s => `  ffmpeg -framerate ${clean.fps} -i seg-${String(s.index).padStart(2, '0')}/color/%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 16 seg-${String(s.index).padStart(2, '0')}-color.mp4   # ${s.label} (${s.seconds} s)`),
        '',
        'Prompts cinéma IA recommandés par segment (cinématographie lente + personnages + environnement vivant) :',
        ...clean.segments.map(s => `\n[Segment ${String(s.index).padStart(2, '0')} — ${s.label} (${s.seconds} s)]\n${s.prompt}`),
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
    kind: 'exterior',
    label: 'Arrivée porche & façade',
    movement: 'Ultra-slow stabilized forward dolly push toward the shaded porch and main facade'
  },
  'anim-sejour': {
    candidates: ['photor-sejour-veranda.png', 'interieur-sejour-reference.jpg', 'sejour.jpg', 'r12.jpg'],
    kind: 'interior',
    label: 'Visite panoramique du séjour',
    movement: 'Ultra-slow smooth horizontal architectural gimbal pan across the living room opening onto the veranda'
  },
  'anim-veranda': {
    candidates: ['photor-perspective-02.png', 'perspective-02.jpg'],
    kind: 'exterior',
    label: 'Véranda arrière & terrasse',
    movement: 'Ultra-slow lateral steadicam glide along the rear veranda overlooking the lush tropical garden'
  },
  'anim-transition': {
    candidates: ['photor-perspective-01.png', 'perspective-01.jpg'],
    kind: 'interior',
    label: 'Transition cinéma Début → Fin',
    movement: 'Ultra-slow seamless architectural steadicam transition gliding smoothly from the starting viewpoint to the ending room while strictly preserving materials, light, and architectural proportions'
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
  let sourceName = resolveClipSource(clip, media);
  let sourceImage = sourceName ? `${media.prefix}images/${sourceName}` : '';
  let sourcePath = sourceName ? path.join(media.images, sourceName) : '';
  let endImageRel = '';
  let endImageAbs = '';

  if (body && body.startImage) {
    const startAsset = resolveProjectAsset(slug, body.startImage);
    if (!startAsset) return sendJson(res, 400, { error: 'Image de départ introuvable dans ce projet.' });
    sourceImage = startAsset.rel;
    sourcePath = startAsset.abs;
    sourceName = path.basename(startAsset.abs);
  }
  if (body && body.endImage) {
    const endAsset = resolveProjectAsset(slug, body.endImage);
    if (!endAsset) return sendJson(res, 400, { error: 'Image d’arrivée introuvable dans ce projet.' });
    endImageRel = endAsset.rel;
    endImageAbs = endAsset.abs;
  }
  if (!sourcePath || !fs.existsSync(sourcePath)) return sendJson(res, 400, { error: 'Image source introuvable pour ce clip.' });

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
      label: String(body?.label || clip.label).slice(0, 120), sourceLabel: endImageAbs ? '✨ Transition IA Début→Fin' : '✨ Rendu IA',
      generator: `OpenRouter · ${VIDEO_MODEL}`,
      movement: clip.movement, catalog: true, book: true, generationStatus: 'pending'
    };
    manifest.items.push(metadata);
    fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
  }
  if (!endImageAbs && metadata.jobId && ['pending', 'in_progress', 'completed'].includes(metadata.generationStatus)
    && !fs.existsSync(path.join(media.videos, `${clipId}.mp4`))) {
    const resumed = { id: metadata.jobId, status: metadata.generationStatus, estimatedCost: metadata.estimatedCost || VIDEO_COST_PER_SECOND_ESTIMATE * 5,
      actualCost: metadata.actualCost, clipId };
    resumed.project = slug;
    videoJobs.set(jobKey, resumed);
    return sendJson(res, 202, { clipId, project: slug, jobId: resumed.id, status: resumed.status, estimatedCost: resumed.estimatedCost, model: VIDEO_MODEL, resolution: '720p', resumed: true });
  }
  const toFrameUrl = (absPath, relPath) => {
    const publicBase = process.env.OPENROUTER_PUBLIC_BASE_URL;
    if (publicBase) {
      const parsed = new URL(publicBase);
      if (parsed.protocol !== 'https:') throw new Error('OPENROUTER_PUBLIC_BASE_URL doit utiliser HTTPS.');
      return new URL(relPath, publicBase.endsWith('/') ? publicBase : publicBase + '/').toString();
    }
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  };
  const firstFrameUrl = toFrameUrl(sourcePath, sourceImage);
  const frameImages = [{ type: 'image_url', image_url: { url: firstFrameUrl }, frame_type: 'first_frame' }];
  if (endImageAbs) {
    frameImages.push({ type: 'image_url', image_url: { url: toFrameUrl(endImageAbs, endImageRel) }, frame_type: 'last_frame' });
  }
  const estimatedCost = VIDEO_COST_PER_SECOND_ESTIMATE * 5;
  const defaultVideoPrompt = AiPrompt && typeof AiPrompt.buildVideoPrompt === 'function'
    ? AiPrompt.buildVideoPrompt({
        kind: clip.kind || 'exterior',
        movement: endImageAbs
          ? 'Ultra-slow continuous architectural gimbal glide transitioning seamlessly from the first frame to the final frame with consistent materials, lighting, and natural life'
          : clip.movement,
        livingPeople: body?.livingPeople !== false,
        livingEnvironment: body?.livingEnvironment !== false,
        pace: body?.pace === 'contemplatif' ? 'contemplative' : 'slow'
      })
    : `${clip.movement}. Strictly preserve building architecture. Gentle tropical breeze moving foliage and clouds, natural residents walking calmly in the scene.`;
  const effectivePrompt = String((body && body.prompt) || metadata.prompt || defaultVideoPrompt).trim();
  const payload = {
    model: VIDEO_MODEL, prompt: effectivePrompt, duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: false,
    provider: { only: ['seed'] },
    frame_images: frameImages
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

function clientFeedback(req, res, url, access) {
  const project = url.searchParams.get('project');
  const channel = req.headers['x-feedback-channel'];
  const respondError = error => sendJson(res, error.status || 500, { error: error.status ? error.message : 'Stockage des retours indisponible.' });
  if (req.method === 'GET' && url.searchParams.get('list') === '1') {
    if (portal.enabled && access?.session?.role !== 'architect') {
      return sendJson(res, 403, { error: 'Liste des dossiers réservée à l’architecte.' });
    }
    try { return sendJson(res, 200, { channels: feedbackStore.listChannels(PROJECTS, project) }); }
    catch (error) { return respondError(error); }
  }
  if (req.method === 'GET') {
    try { return sendJson(res, 200, { notes: feedbackStore.open(PROJECTS, project, channel).notes }); }
    catch (error) { return respondError(error); }
  }
  const review = req.method === 'PATCH';
  if (!review && req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return sendJson(res, 415, { error: 'JSON requis.' });
  return readBody(req, res, 8192, data => {
    const role = portal.enabled ? portal.roleForProject(req, project) : 'architect';
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

function planchesApi(req, res, url, urlPath, access) {
  if (!planchesStore) return sendJson(res, 501, { error: 'Module planches indisponible.' });
  if (portal.enabled && access?.session?.role !== 'architect') {
    return sendJson(res, 403, { error: 'Accès réservé à l’architecte.' });
  }
  const match = /^\/api\/projects\/([^/]+)\/planches(?:\/([^/]+))?$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route planches introuvable.' });
  const slug = match[1];
  const idFromPath = match[2] || '';
  const respondError = error => sendJson(res, error.status || 500, {
    error: error.status ? error.message : 'Stockage des planches indisponible.'
  });

  if (req.method === 'GET') {
    if (idFromPath) return sendJson(res, 404, { error: 'Route planches introuvable.' });
    try { return sendJson(res, 200, { slug: slug.toLowerCase(), items: planchesStore.list(PROJECTS, slug) }); }
    catch (error) { return respondError(error); }
  }
  if (req.method === 'POST') {
    if (idFromPath) return sendJson(res, 405, { error: 'Méthode non autorisée sur cette ressource.' });
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return sendJson(res, 415, { error: 'JSON requis.' });
    }
    return readBody(req, res, 60 * 1024 * 1024, body => {
      try {
        const items = planchesStore.save(PROJECTS, slug, body);
        return sendJson(res, 201, { slug: slug.toLowerCase(), items });
      } catch (error) { return respondError(error); }
    });
  }
  if (req.method === 'PATCH') {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return sendJson(res, 415, { error: 'JSON requis.' });
    }
    return readBody(req, res, 32 * 1024, body => {
      const id = idFromPath || body?.id || '';
      try {
        const item = planchesStore.update(PROJECTS, slug, id, body);
        return sendJson(res, 200, { slug: slug.toLowerCase(), item });
      } catch (error) { return respondError(error); }
    });
  }
  if (req.method === 'DELETE') {
    const id = idFromPath || url.searchParams.get('id') || '';
    try { return sendJson(res, 200, planchesStore.remove(PROJECTS, slug, id)); }
    catch (error) { return respondError(error); }
  }
  return sendJson(res, 405, { error: 'Méthode non autorisée.' });
}

function revisionsApi(req, res, url, urlPath, access) {
  if (!revisionsStore) return sendJson(res, 501, { error: 'Module journal des révisions indisponible.' });
  const match = /^\/api\/projects\/([^/]+)\/revisions(?:\/([^/]+))?$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route révisions introuvable.' });
  const slug = match[1];
  const idFromPath = match[2] || '';
  const respondError = error => sendJson(res, error.status || 500, {
    error: error.status ? error.message : 'Stockage des révisions indisponible.'
  });

  if (req.method === 'GET') {
    if (portal.enabled && access?.session?.role !== 'architect' && access?.session?.project !== slug.toLowerCase()) {
      return sendJson(res, 403, { error: 'Accès non autorisé à ce projet.' });
    }
    try { return sendJson(res, 200, { slug: slug.toLowerCase(), items: revisionsStore.list(PROJECTS, slug) }); }
    catch (error) { return respondError(error); }
  }

  if (portal.enabled && access?.session?.role !== 'architect') {
    return sendJson(res, 403, { error: 'Gestion des révisions réservée à l’architecte.' });
  }
  if (req.method === 'POST') {
    if (idFromPath) return sendJson(res, 405, { error: 'Méthode non autorisée sur cette ressource.' });
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return sendJson(res, 415, { error: 'JSON requis.' });
    }
    return readBody(req, res, 2 * 1024 * 1024, body => {
      try {
        const item = revisionsStore.create(PROJECTS, slug, body);
        return sendJson(res, 201, { slug: slug.toLowerCase(), item });
      } catch (error) { return respondError(error); }
    });
  }
  if (req.method === 'DELETE') {
    const id = idFromPath || url.searchParams.get('id') || '';
    try { return sendJson(res, 200, revisionsStore.remove(PROJECTS, slug, id)); }
    catch (error) { return respondError(error); }
  }
  return sendJson(res, 405, { error: 'Méthode non autorisée.' });
}

function variantsApi(req, res, url, urlPath, access) {
  if (!variantsStore) return sendJson(res, 501, { error: 'Module variantes indisponible.' });
  const match = /^\/api\/projects\/([^/]+)\/variants(?:\/([^/]+))?$/.exec(urlPath);
  if (!match) return sendJson(res, 404, { error: 'Route variantes introuvable.' });
  const slug = match[1];
  const slotFromPath = match[2] || '';
  const respondError = error => sendJson(res, error.status || 500, {
    error: error.status ? error.message : 'Stockage des variantes indisponible.'
  });

  if (req.method === 'GET') {
    if (portal.enabled && access?.session?.role !== 'architect' && access?.session?.project !== slug.toLowerCase()) {
      return sendJson(res, 403, { error: 'Accès non autorisé à ce projet.' });
    }
    try {
      if (slotFromPath) return sendJson(res, 200, { slug: slug.toLowerCase(), item: variantsStore.get(PROJECTS, slug, slotFromPath) });
      return sendJson(res, 200, { slug: slug.toLowerCase(), variants: variantsStore.list(PROJECTS, slug) });
    } catch (error) { return respondError(error); }
  }

  if (portal.enabled && access?.session?.role !== 'architect') {
    return sendJson(res, 403, { error: 'Modification des variantes réservée à l’architecte.' });
  }
  if (req.method === 'POST') {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return sendJson(res, 415, { error: 'JSON requis.' });
    }
    return readBody(req, res, 2 * 1024 * 1024, body => {
      const slot = slotFromPath || body?.slot || '';
      try {
        const item = variantsStore.save(PROJECTS, slug, slot, body);
        return sendJson(res, 201, { slug: slug.toLowerCase(), item });
      } catch (error) { return respondError(error); }
    });
  }
  if (req.method === 'DELETE') {
    const slot = slotFromPath || url.searchParams.get('slot') || '';
    try { return sendJson(res, 200, variantsStore.remove(PROJECTS, slug, slot)); }
    catch (error) { return respondError(error); }
  }
  return sendJson(res, 405, { error: 'Méthode non autorisée.' });
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
  if (urlPath === '/api/client-feedback') return clientFeedback(req, res, requestUrl, access);
  if (urlPath === '/api/client-decisions') return clientDecisions(req, res, requestUrl);
  if (urlPath === '/api/cabinet/profile') return cabinetApi(req, res);
  if (urlPath === '/api/cabinet/logo') return cabinetLogoApi(req, res);
  if (urlPath.startsWith('/api/presentation/')) return presentationApi(req, res, requestUrl, urlPath);
  if (req.method === 'GET' && urlPath === '/api/ai/status') return aiStatus(res);
  if (req.method === 'POST' && urlPath === '/api/ai/chat') return aiChat(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/assistant') return aiAssistant(req, res, access);
  if (req.method === 'POST' && urlPath === '/api/ai/assistant-tts') return aiAssistantTts(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/generate-plan') return aiGeneratePlan(req, res, access);
  if (req.method === 'POST' && urlPath === '/api/ai/plan-patch') return aiPlanPatch(req, res, access);
  if (req.method === 'POST' && urlPath === '/api/ai/images') return aiImage(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/bioclimatic-cctp') return aiBioclimaticCctp(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/site-insertion-advice') return aiSiteInsertionAdvice(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/voiceover') return aiVoiceover(req, res);
  if (req.method === 'POST' && urlPath === '/api/ai/auto-furnish') return aiAutoFurnish(req, res);
  if (req.method === 'GET' && urlPath === '/api/ai/video-quote') return videoQuote(res);
  if (req.method === 'POST' && urlPath === '/api/ai/videos') return readBody(req, res, 64 * 1024, body => {
    submitVideo(req, res, body).catch(error => sendJson(res, 502, { error: error.message }));
  });
  if (req.method === 'GET' && urlPath === '/api/ai/videos/status') return videoStatus(req, res, new URL(req.url, 'http://localhost'));
  if (req.method === 'POST' && urlPath === '/api/save-render') return saveRender(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-generated') return saveGenerated(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-panorama') return savePanorama(req, res, requestUrl);
  if (req.method === 'GET' && urlPath === '/api/panoramas') return listPanoramas(res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/gallery/flags') return galleryFlags(req, res, requestUrl, access);
  if (req.method === 'POST' && urlPath === '/api/save-video') return saveVideo(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/render-video') return renderProjectVideo(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-sequence-frame') return saveSequenceFrame(req, res, requestUrl);
  if (req.method === 'POST' && urlPath === '/api/save-sequence-manifest') return saveSequenceManifest(req, res, requestUrl);
  if (req.method === 'GET' && urlPath === '/api/gallery/media') return galleryMedia(res, requestUrl, access);
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/draft$/.test(urlPath)) {
    return projectDraftApi(req, res, urlPath);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/planches(?:\/[^/]+)?$/.test(urlPath)) {
    return planchesApi(req, res, requestUrl, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/variants(?:\/[^/]+)?$/.test(urlPath)) {
    return variantsApi(req, res, requestUrl, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/revisions(?:\/[^/]+)?$/.test(urlPath)) {
    return revisionsApi(req, res, requestUrl, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/document-safety$/.test(urlPath)) {
    return documentSafetyApi(req, res, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/compliance-autofix$/.test(urlPath)) {
    return complianceAutofixApi(req, res, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/editorial-brief$/.test(urlPath)) {
    return editorialBriefApi(req, res, urlPath, access);
  }
  if (urlPath.startsWith('/api/projects/') && /^\/api\/projects\/[^/]+\/generate-ab-variants$/.test(urlPath)) {
    return generateAbVariantsApi(req, res, urlPath, access);
  }
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
        // Budget : les réglages de prix de l'agence ne quittent le serveur que si le partage est explicitement activé.
        if (project.meta && project.meta.budgetShared !== true) delete project.estimate;
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
