/**
 * Stockage serveur sécurisé des variantes A / B d'un projet dans projects/<slug>/.variants/{A,B}.json.
 * - Confinement strict des chemins (path.resolve + vérif path.sep)
 * - Seuls les emplacements 'A' et 'B' sont autorisés
 * - Écriture atomique (fichier temporaire + rename)
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const SLOTS = new Set(['A', 'B']);
const DIR_NAME = '.variants';
const fail = (status, message) => Object.assign(new Error(message), { status });

function cleanText(value, maxLen = 120) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, maxLen)
    : '';
}

function projectVariantsDir(projectsRoot, slug) {
  const normalized = String(slug || '').toLowerCase();
  if (!SLUG_RE.test(normalized)) throw fail(400, 'Identifiant de projet invalide.');
  const base = path.resolve(projectsRoot);
  const projectDir = path.resolve(base, normalized);
  if (!projectDir.startsWith(base + path.sep)) throw fail(403, 'Chemin projet hors limite.');
  if (!fs.existsSync(path.join(projectDir, 'project.json'))) throw fail(404, 'Projet introuvable.');
  const variantsDir = path.resolve(projectDir, DIR_NAME);
  if (!variantsDir.startsWith(projectDir + path.sep)) throw fail(403, 'Chemin variantes hors limite.');
  return variantsDir;
}

function slotFile(projectsRoot, slug, slot) {
  const key = String(slot || '').toUpperCase();
  if (!SLOTS.has(key)) throw fail(400, 'Emplacement de variante invalide (attendu : A ou B).');
  const dir = projectVariantsDir(projectsRoot, slug);
  const file = path.resolve(dir, `${key}.json`);
  if (!file.startsWith(dir + path.sep)) throw fail(403, 'Chemin variante hors limite.');
  return { dir, file, slot: key };
}

function readVariantFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function list(projectsRoot, slug) {
  const dir = projectVariantsDir(projectsRoot, slug);
  const out = { A: null, B: null };
  for (const key of ['A', 'B']) {
    const file = path.resolve(dir, `${key}.json`);
    if (file.startsWith(dir + path.sep)) out[key] = readVariantFile(file);
  }
  return out;
}

function get(projectsRoot, slug, slot) {
  const { file } = slotFile(projectsRoot, slug, slot);
  const item = readVariantFile(file);
  if (!item) throw fail(404, `Variante ${String(slot).toUpperCase()} introuvable.`);
  return item;
}

function save(projectsRoot, slug, slot, payload) {
  const { dir, file, slot: key } = slotFile(projectsRoot, slug, slot);
  if (!payload || typeof payload !== 'object' || !payload.snapshot || typeof payload.snapshot !== 'object') {
    throw fail(400, 'Instantané de variante (snapshot) manquant ou invalide.');
  }
  const snap = payload.snapshot;
  if (!Array.isArray(snap.walls) || !Array.isArray(snap.rooms)) {
    throw fail(400, 'La variante doit contenir walls et rooms.');
  }
  const materials = payload.materials && typeof payload.materials === 'object' ? {
    floor: cleanText(payload.materials.floor, 40),
    facade: cleanText(payload.materials.facade, 40),
    roofType: cleanText(payload.materials.roofType, 40)
  } : { floor: '', facade: '', roofType: '' };

  const normalizedSlug = String(slug || '').toLowerCase();
  const previewImage = typeof payload.previewImage === 'string' &&
    payload.previewImage.startsWith(`projects/${normalizedSlug}/`) &&
    /^projects\/[a-z0-9-]{1,60}\/(?:generated|planches)\/[a-zA-Z0-9/_.-]+\.(?:jpg|jpeg|png|webp)$/i.test(payload.previewImage) &&
    !payload.previewImage.includes('..')
    ? payload.previewImage
    : '';

  const record = {
    slot: key,
    label: cleanText(payload.label, 80) || `Variante ${key}`,
    notes: cleanText(payload.notes, 400),
    savedAt: new Date().toISOString(),
    materials,
    previewImage,
    snapshot: snap
  };

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
  return record;
}

function remove(projectsRoot, slug, slot) {
  const { file, slot: key } = slotFile(projectsRoot, slug, slot);
  if (!fs.existsSync(file)) return { removed: false, slot: key };
  fs.unlinkSync(file);
  return { removed: true, slot: key };
}

module.exports = { DIR_NAME, list, get, save, remove, fail };
