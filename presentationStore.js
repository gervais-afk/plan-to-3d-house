/** Réglages d’accueil et brouillons privés, isolés par projet. Les vues restent des références. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { projectPattern } = require('./js/variantState');

const fail = (status, message) => Object.assign(new Error(message), { status });
const mediaPattern = /^projects\/([a-z0-9-]{1,60})\/generated\/(images|renders)\/([a-z0-9_-]+\.(?:jpe?g|png|webp))$/i;
const imagePattern = /^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i;
const empty = () => ({ version: 1, slots: [null, null, null], focal: { x: 50, y: 50 } });

function projectPaths(projects, project) {
  if (typeof project !== 'string' || !projectPattern.test(project)) throw fail(400, 'Projet invalide.');
  const root = path.join(projects, project);
  if (!fs.existsSync(path.join(root, 'project.json'))) throw fail(404, 'Projet introuvable.');
  const generated = path.join(root, 'generated');
  return { root, generated, images: path.join(generated, 'images'), renders: path.join(generated, 'renders'),
    manifest: path.join(generated, 'manifest.json'), file: path.join(generated, 'presentation.json'), drafts: path.join(generated, 'drafts'), draftManifest: path.join(generated, 'drafts.json') };
}
function readJson(file, fallback, message) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw fail(409, message); }
}
function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2), { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function readManifest(file) {
  const value = readJson(file, { items: [] }, 'Le manifeste du projet est illisible.');
  if (!Array.isArray(value?.items)) throw fail(409, 'Le manifeste du projet est illisible.');
  return value.items;
}
function readSettings(file) {
  const value = readJson(file, empty(), 'Les réglages de présentation du projet sont illisibles.');
  return { slots: Array.isArray(value?.slots) ? value.slots.slice(0, 3) : [null, null, null], focal: { x: Number(value?.focal?.x), y: Number(value?.focal?.y) } };
}
function availableReference(paths, project, reference, manifest) {
  const match = typeof reference === 'string' && mediaPattern.exec(reference);
  if (!match || match[1] !== project) return false;
  const [, , kind, name] = match;
  if (kind === 'images') {
    const item = manifest.find(entry => entry?.type === 'image' && entry.file === reference);
    if (!item || item.status === 'draft') return false;
  }
  try { return fs.statSync(path.join(paths[kind], name)).isFile(); } catch { return false; }
}
function get(projects, project) {
  const paths = projectPaths(projects, project), manifest = readManifest(paths.manifest), saved = readSettings(paths.file);
  const slots = Array.from({ length: 3 }, (_, i) => typeof saved.slots[i] === 'string' ? saved.slots[i] : null);
  const validSlots = slots.map(reference => reference && availableReference(paths, project, reference, manifest) ? reference : null);
  const focal = { x: Number.isFinite(saved.focal.x) ? Math.max(0, Math.min(100, saved.focal.x)) : 50,
    y: Number.isFinite(saved.focal.y) ? Math.max(0, Math.min(100, saved.focal.y)) : 50 };
  return { slots: validSlots, focal, orphanedSlots: slots.filter((reference, i) => reference && !validSlots[i]).length };
}
function save(projects, project, input) {
  const paths = projectPaths(projects, project);
  if (!Array.isArray(input?.slots) || input.slots.length !== 3) throw fail(400, 'Choisissez exactement trois emplacements, même si certains restent en automatique.');
  if (input.slots.some(value => value !== null && (typeof value !== 'string' || value.length > 240))) throw fail(400, 'Sélection de vue invalide.');
  const selected = input.slots.filter(Boolean);
  if (new Set(selected).size !== selected.length) throw fail(400, 'Une même image ne peut occuper plusieurs emplacements.');
  const focal = input.focal;
  if (!focal || !Number.isFinite(focal.x) || !Number.isFinite(focal.y) || focal.x < 0 || focal.x > 100 || focal.y < 0 || focal.y > 100) throw fail(400, 'Le point focal doit être compris entre 0 et 100 %.');
  const manifest = readManifest(paths.manifest);
  for (const reference of selected) if (!availableReference(paths, project, reference, manifest)) throw fail(409, 'Une vue sélectionnée n’est plus disponible ou n’est pas publiée.');
  writeAtomic(paths.file, { version: 1, slots: input.slots, focal: { x: focal.x, y: focal.y } });
  return get(projects, project);
}
function readDrafts(paths) {
  const value = readJson(paths.draftManifest, { version: 1, items: [] }, 'Les brouillons sont illisibles.');
  if (!Array.isArray(value?.items)) throw fail(409, 'Les brouillons sont illisibles.');
  return value;
}
function listDrafts(projects, project) {
  const paths = projectPaths(projects, project), store = readDrafts(paths);
  return store.items.filter(item => item?.status === 'draft' && imagePattern.test(item.resultName || '') && fs.existsSync(path.join(paths.drafts, item.resultName)))
    .map(({ resultName, ...item }) => ({ ...item, imageUrl: `/api/presentation/draft-image?project=${encodeURIComponent(project)}&id=${encodeURIComponent(item.id)}` }));
}
function createDraft(projects, project, input) {
  const paths = projectPaths(projects, project);
  const source = typeof input?.source === 'string' && mediaPattern.exec(input.source);
  if (!source || source[1] !== project || source[2] !== 'renders' || !imagePattern.test(source[3])) throw fail(400, 'Choisissez une capture de maquette de ce projet.');
  const sourcePath = path.join(paths.renders, source[3]);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw fail(404, 'Capture source indisponible.');
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 1000) : '';
  if (!prompt) throw fail(400, 'Décrivez les ajustements de lumière, textures, reflets ou végétation.');
  const id = randomUUID();
  const ext = path.extname(source[3]).toLowerCase();
  const resultName = `${id}${ext}`;
  fs.mkdirSync(paths.drafts, { recursive: true });
  // Sans autorisation explicite, aucune image privée n’est envoyée : le brouillon simulé reste pixel-identique.
  fs.copyFileSync(sourcePath, path.join(paths.drafts, resultName), fs.constants.COPYFILE_EXCL);
  const store = readDrafts(paths);
  const item = { id, status: 'draft', source: input.source, resultName, prompt, model: 'Simulation locale (aucun appel fournisseur)', simulated: true,
    geometryReviewed: false, geometryPass: false, createdAt: new Date().toISOString() };
  store.items.push(item); writeAtomic(paths.draftManifest, store);
  return { ...item, imageUrl: `/api/presentation/draft-image?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}` };
}
function draftImage(projects, project, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw fail(404, 'Brouillon introuvable.');
  const paths = projectPaths(projects, project), store = readDrafts(paths);
  const item = store.items.find(entry => entry?.id === id && entry.status === 'draft' && imagePattern.test(entry.resultName || ''));
  if (!item) throw fail(404, 'Brouillon introuvable.');
  const file = path.join(paths.drafts, item.resultName);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw fail(404, 'Brouillon introuvable.');
  return { file, ext: path.extname(file).slice(1).toLowerCase() };
}
function publishDraft(projects, project, input) {
  if (input?.geometryReviewed !== true || input?.geometryPass !== true) throw fail(422, 'La vérification géométrique est obligatoire et doit confirmer une géométrie inchangée.');
  const paths = projectPaths(projects, project), store = readDrafts(paths);
  const item = store.items.find(entry => entry?.id === input.id && entry.status === 'draft');
  if (!item) throw fail(404, 'Brouillon introuvable.');
  const source = draftImage(projects, project, item.id), filename = `retouche-${item.id}.${source.ext}`;
  fs.mkdirSync(paths.images, { recursive: true });
  fs.copyFileSync(source.file, path.join(paths.images, filename), fs.constants.COPYFILE_EXCL);
  const manifest = { version: 1, items: readManifest(paths.manifest) };
  const published = { id: `retouche-${item.id}`, type: 'image', file: `projects/${project}/generated/images/${filename}`, reference: item.source,
    room: null, label: `Retouche vérifiée · ${path.basename(item.source, path.extname(item.source))}`, width: null, height: null,
    generator: item.model, prompt: item.prompt, notes: 'Géométrie vérifiée par l’architecte avant publication.', createdAt: item.createdAt };
  manifest.items.push(published); writeAtomic(paths.manifest, manifest);
  store.items = store.items.filter(entry => entry.id !== item.id); writeAtomic(paths.draftManifest, store);
  fs.unlinkSync(source.file);
  return published;
}
module.exports = { get, save, availableReference, listDrafts, createDraft, draftImage, publishDraft, fail };
