/**
 * Stockage sécurisé des planches PDF importées par l'architecte :
 *   projects/<slug>/planches/doc-<uuid>.pdf      (PDF d'origine)
 *   projects/<slug>/planches/page-<uuid>.jpg|png (image rendue par page)
 *   projects/<slug>/planches/manifest.json       (classement SheetClassifier, niveau, échelle, inclusion)
 *
 * Règles : PDF uniquement (signature %PDF-), taille bornée, noms générés côté serveur,
 * chemins confinés dans projects/<slug>/planches/ (safePath + vérification realpath).
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safePath } = require('./privatePortal');
const SheetClassifier = require('./js/sheetClassifier');

const SLUG_RE = /^[a-z0-9-]{1,60}$/i;
const ID_RE = /^pl-[0-9a-f-]{8,64}$/i;
const SAFE_FILE_RE = /^(?:doc|page)-[0-9a-f-]{8,64}\.(?:pdf|jpe?g|png|webp)$/i;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PAGES_PER_UPLOAD = 40;
const MAX_TOTAL_SHEETS = 120;
const VALID_TYPES = new Set(Object.keys(SheetClassifier.TYPES));
const VALID_CONFIDENCE = new Set(['title', 'likely', 'low', 'none']);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sanitizeDisplayName(value, fallback = 'planche.pdf') {
  const base = String(value || '').replace(/[\\/]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const clean = base.replace(/\s+/g, ' ').slice(0, 120);
  return clean || fallback;
}

function sanitizeScale(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^1\s*[:/]\s*(\d{1,5})$/);
  if (!match) throw httpError(400, 'Échelle invalide (format attendu : 1/100 ou 1:50).');
  return `1/${match[1]}`;
}

function sanitizeLevel(type, value) {
  if (!SheetClassifier.TYPES[type]?.levels) return null;
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < -3 || num > 20) throw httpError(400, 'Niveau invalide.');
  return num;
}

function resolvePlanchesDir(projectsRoot, slug) {
  const raw = String(slug || '').trim();
  if (!SLUG_RE.test(raw)) throw httpError(400, 'Identifiant de projet invalide.');
  const normalized = raw.toLowerCase();
  const rel = `projects/${normalized}/planches`;
  if (!safePath(rel)) throw httpError(403, 'Chemin de projet interdit.');

  const rootResolved = path.resolve(projectsRoot);
  if (!fs.existsSync(rootResolved)) throw httpError(404, 'Dossier projets introuvable.');
  const rootReal = fs.realpathSync(rootResolved);

  const projectDir = path.resolve(rootReal, normalized);
  if (!projectDir.startsWith(rootReal + path.sep)) throw httpError(403, 'Chemin hors du dossier projets.');
  if (!fs.existsSync(path.join(projectDir, 'project.json'))) throw httpError(404, 'Projet introuvable.');
  const projectReal = fs.realpathSync(projectDir);
  if (!projectReal.startsWith(rootReal + path.sep)) throw httpError(403, 'Chemin projet hors périmètre.');

  const planchesDir = path.resolve(projectReal, 'planches');
  if (!planchesDir.startsWith(projectReal + path.sep)) throw httpError(403, 'Chemin planches hors projet.');
  if (fs.existsSync(planchesDir)) {
    const planchesReal = fs.realpathSync(planchesDir);
    if (!planchesReal.startsWith(projectReal + path.sep)) throw httpError(403, 'Dossier planches hors projet.');
  }

  return {
    slug: normalized,
    projectDir: projectReal,
    planchesDir,
    manifestPath: path.join(planchesDir, 'manifest.json')
  };
}

function confineFile(planchesDir, filename) {
  const name = String(filename || '');
  if (!SAFE_FILE_RE.test(name) || name !== path.basename(name) || !safePath(name)) {
    throw httpError(400, 'Nom de fichier de planche invalide.');
  }
  const base = path.resolve(planchesDir);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) throw httpError(403, 'Chemin de fichier hors du projet.');
  return full;
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return { version: 1, items: [] };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { throw httpError(500, 'Manifeste des planches illisible.'); }
  if (!parsed || !Array.isArray(parsed.items)) throw httpError(500, 'Manifeste des planches invalide.');
  return parsed;
}

function writeManifestAtomic(planchesDir, manifestPath, manifest) {
  fs.mkdirSync(planchesDir, { recursive: true });
  const tmp = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    fs.renameSync(tmp, manifestPath);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function decodePdfBuffer(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw httpError(400, 'Fichier PDF requis.');
  const trimmed = raw.trim();
  let b64 = trimmed;
  if (trimmed.startsWith('data:')) {
    const match = /^data:application\/pdf(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
    if (!match) throw httpError(415, 'Seuls les fichiers PDF (application/pdf) sont acceptés.');
    b64 = match[1];
  } else if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    throw httpError(415, 'Seuls les fichiers PDF valides sont acceptés.');
  }
  const estimated = Math.ceil((b64.replace(/\s+/g, '').length * 3) / 4);
  if (estimated > MAX_PDF_BYTES) throw httpError(413, `PDF trop volumineux (limite ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo).`);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 8 || buf.length > MAX_PDF_BYTES) {
    throw httpError(buf.length > MAX_PDF_BYTES ? 413 : 400, 'Taille de PDF invalide.');
  }
  // Signature magique PDF obligatoire (%PDF-)
  if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw httpError(415, 'Le fichier envoyé n’est pas un PDF valide (en-tête %PDF- absent).');
  }
  return buf;
}

function decodeImageBuffer(raw) {
  if (typeof raw !== 'string') throw httpError(400, 'Image de page requise.');
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw.trim());
  if (!match) throw httpError(415, 'Image de page invalide (PNG, JPEG ou WEBP requis).');
  const declared = match[1].toLowerCase();
  const b64 = match[2];
  const estimated = Math.ceil((b64.replace(/\s+/g, '').length * 3) / 4);
  if (estimated > MAX_IMAGE_BYTES) throw httpError(413, 'Image de page trop volumineuse.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 12 || buf.length > MAX_IMAGE_BYTES) throw httpError(400, 'Image de page invalide.');

  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (declared === 'png' && isPng) return { buf, ext: 'png' };
  if ((declared === 'jpeg' || declared === 'jpg') && isJpeg) return { buf, ext: 'jpg' };
  if (declared === 'webp' && isWebp) return { buf, ext: 'webp' };
  throw httpError(415, 'Le contenu de l’image ne correspond pas à son format déclaré.');
}

function normalizeGuess(input, fallback) {
  if (!input || typeof input !== 'object') return fallback;
  const type = VALID_TYPES.has(input.type) ? input.type : fallback.type;
  const level = SheetClassifier.TYPES[type]?.levels
    ? (Number.isInteger(input.level) ? input.level : fallback.level)
    : null;
  const confidence = VALID_CONFIDENCE.has(input.confidence) ? input.confidence : fallback.confidence;
  const reasons = Array.isArray(input.reasons) ? input.reasons.slice(0, 5).map(r => String(r).slice(0, 120)) : fallback.reasons;
  let scale = fallback.scale || '';
  if (typeof input.scale === 'string' && /^1\s*[:/]\s*\d{1,5}$/.test(input.scale.trim())) {
    scale = input.scale.trim().replace(':', '/');
  }
  return {
    type,
    level,
    discipline: SheetClassifier.TYPES[type]?.discipline || 'annexe',
    confidence,
    title: String(input.title || fallback.title || '').slice(0, 80),
    scale,
    label: String(input.label || SheetClassifier.label(type, level)).slice(0, 120),
    reasons
  };
}

function decorateItem(slug, item) {
  const prefix = `projects/${slug}/planches/`;
  return {
    ...item,
    imageUrl: `${prefix}${item.image}`,
    pdfUrl: `${prefix}${item.sourcePdf}`
  };
}

function list(projectsRoot, slug) {
  const ctx = resolvePlanchesDir(projectsRoot, slug);
  const manifest = readManifest(ctx.manifestPath);
  return manifest.items
    .filter(item => item && typeof item.id === 'string' && SAFE_FILE_RE.test(item.image || ''))
    .map(item => decorateItem(ctx.slug, item));
}

function save(projectsRoot, slug, payload) {
  if (!payload || typeof payload !== 'object') throw httpError(400, 'Corps JSON requis.');
  const ctx = resolvePlanchesDir(projectsRoot, slug);
  const manifest = readManifest(ctx.manifestPath);
  const pdfBuf = decodePdfBuffer(payload.pdf);
  const pages = payload.pages;
  if (!Array.isArray(pages) || !pages.length) throw httpError(400, 'Au moins une page rendue est requise.');
  if (pages.length > MAX_PAGES_PER_UPLOAD) throw httpError(413, `Trop de pages par envoi (limite ${MAX_PAGES_PER_UPLOAD}).`);
  if (manifest.items.length + pages.length > MAX_TOTAL_SHEETS) {
    throw httpError(409, `Limite de ${MAX_TOTAL_SHEETS} planches enregistrées atteinte pour ce projet.`);
  }

  const originalName = sanitizeDisplayName(payload.name || payload.originalName, 'planche.pdf');
  const sourcePdf = `doc-${randomUUID()}.pdf`;
  const pdfTarget = confineFile(ctx.planchesDir, sourcePdf);
  const nowIso = new Date().toISOString();

  // Valider toutes les pages et images avant toute écriture sur disque.
  const prepared = pages.map((p, idx) => {
    if (!p || typeof p !== 'object') throw httpError(400, `Page ${idx + 1} invalide.`);
    const decoded = decodeImageBuffer(p.image || p.data);
    const imageFile = `page-${randomUUID()}.${decoded.ext}`;
    const imageTarget = confineFile(ctx.planchesDir, imageFile);
    const text = typeof p.text === 'string' ? p.text.slice(0, 40000) : '';
    const serverGuess = SheetClassifier.classify({ text, fileName: originalName });
    const guess = p.guess ? normalizeGuess(p.guess, serverGuess) : serverGuess;
    const type = p.type !== undefined ? String(p.type) : guess.type;
    if (!VALID_TYPES.has(type)) throw httpError(400, `Type de planche inconnu : ${type}`);
    const level = p.level !== undefined ? sanitizeLevel(type, p.level) : sanitizeLevel(type, guess.level);
    const scale = p.scale !== undefined ? sanitizeScale(p.scale) : (guess.scale || '');
    const width = Number.isFinite(Number(p.width)) && Number(p.width) > 0 ? Math.round(Number(p.width)) : 0;
    const height = Number.isFinite(Number(p.height)) && Number(p.height) > 0 ? Math.round(Number(p.height)) : 0;
    const pageNum = Number.isInteger(Number(p.page)) && Number(p.page) >= 1 ? Number(p.page) : idx + 1;
    const totalNum = Number.isInteger(Number(p.total)) && Number(p.total) >= pageNum ? Number(p.total) : pages.length;
    const paperMm = p.paperMm && Number.isFinite(Number(p.paperMm.w)) && Number.isFinite(Number(p.paperMm.h))
      ? { w: Math.round(Number(p.paperMm.w) * 10) / 10, h: Math.round(Number(p.paperMm.h) * 10) / 10 }
      : null;

    return {
      decoded,
      imageTarget,
      entry: {
        id: `pl-${randomUUID()}`,
        sourcePdf,
        originalName,
        page: pageNum,
        total: totalNum,
        image: imageFile,
        width,
        height,
        paperMm,
        type,
        level,
        scale,
        label: sanitizeDisplayName(p.label, SheetClassifier.label(type, level)),
        include: p.include !== false,
        replaceGenerated: p.replaceGenerated !== false,
        guess,
        createdAt: nowIso,
        updatedAt: nowIso
      }
    };
  });

  const writtenFiles = [];
  const created = prepared.map(item => item.entry);

  try {
    fs.mkdirSync(ctx.planchesDir, { recursive: true });
    fs.writeFileSync(pdfTarget, pdfBuf, { flag: 'wx' });
    writtenFiles.push(pdfTarget);

    for (const item of prepared) {
      fs.writeFileSync(item.imageTarget, item.decoded.buf, { flag: 'wx' });
      writtenFiles.push(item.imageTarget);
    }

    manifest.version = 1;
    manifest.items.push(...created);
    writeManifestAtomic(ctx.planchesDir, ctx.manifestPath, manifest);
  } catch (err) {
    for (const file of writtenFiles) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* nettoyage */ }
    }
    throw err;
  }

  return created.map(item => decorateItem(ctx.slug, item));
}

function update(projectsRoot, slug, id, patch) {
  if (!ID_RE.test(String(id || ''))) throw httpError(400, 'Identifiant de planche invalide.');
  if (!patch || typeof patch !== 'object') throw httpError(400, 'Modifications JSON requises.');
  const ctx = resolvePlanchesDir(projectsRoot, slug);
  const manifest = readManifest(ctx.manifestPath);
  const index = manifest.items.findIndex(item => item && item.id === id);
  if (index < 0) throw httpError(404, 'Planche introuvable.');

  const current = manifest.items[index];
  const next = { ...current };
  if (patch.type !== undefined) {
    const type = String(patch.type);
    if (!VALID_TYPES.has(type)) throw httpError(400, `Type de planche inconnu : ${type}`);
    next.type = type;
    if (!SheetClassifier.TYPES[type]?.levels) next.level = null;
  }
  if (patch.level !== undefined) next.level = sanitizeLevel(next.type, patch.level);
  if (patch.scale !== undefined) next.scale = sanitizeScale(patch.scale);
  if (patch.include !== undefined) {
    if (typeof patch.include !== 'boolean') throw httpError(400, 'Le champ include doit être booléen.');
    next.include = patch.include;
  }
  if (patch.replaceGenerated !== undefined) {
    if (typeof patch.replaceGenerated !== 'boolean') throw httpError(400, 'Le champ replaceGenerated doit être booléen.');
    next.replaceGenerated = patch.replaceGenerated;
  }
  if (patch.label !== undefined) next.label = sanitizeDisplayName(patch.label, SheetClassifier.label(next.type, next.level));
  next.updatedAt = new Date().toISOString();

  manifest.items[index] = next;
  writeManifestAtomic(ctx.planchesDir, ctx.manifestPath, manifest);
  return decorateItem(ctx.slug, next);
}

function remove(projectsRoot, slug, id) {
  if (!ID_RE.test(String(id || ''))) throw httpError(400, 'Identifiant de planche invalide.');
  const ctx = resolvePlanchesDir(projectsRoot, slug);
  const manifest = readManifest(ctx.manifestPath);
  const index = manifest.items.findIndex(item => item && item.id === id);
  if (index < 0) throw httpError(404, 'Planche introuvable.');

  const [removed] = manifest.items.splice(index, 1);
  writeManifestAtomic(ctx.planchesDir, ctx.manifestPath, manifest);

  // Supprime l'image de la page et, si plus aucune planche ne le référence, le PDF d'origine.
  try {
    const imgPath = confineFile(ctx.planchesDir, removed.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  } catch { /* fichier déjà absent */ }
  const pdfStillReferenced = manifest.items.some(item => item && item.sourcePdf === removed.sourcePdf);
  if (!pdfStillReferenced && removed.sourcePdf) {
    try {
      const pdfPath = confineFile(ctx.planchesDir, removed.sourcePdf);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    } catch { /* fichier déjà absent */ }
  }
  return { ok: true, id: removed.id };
}

module.exports = {
  MAX_PDF_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PAGES_PER_UPLOAD,
  MAX_TOTAL_SHEETS,
  resolvePlanchesDir,
  confineFile,
  list,
  save,
  update,
  remove
};
