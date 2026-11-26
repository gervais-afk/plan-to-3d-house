/** Dossiers de retours isolés par projet et par lien. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const schema = require('./js/variantState');

const directoryName = '.client-feedback';
const maxNotes = 100;
const maxChannels = 100;
const fail = (status, message) => Object.assign(new Error(message), { status });

function channelStorage(projects, project, channel) {
  if (typeof project !== 'string' || !schema.projectPattern.test(project) || typeof channel !== 'string' || !schema.channelPattern.test(channel)) {
    throw fail(400, 'Projet ou lien de retours invalide.');
  }
  const dir = path.join(projects, project);
  const model = path.join(dir, 'project.json');
  if (!fs.existsSync(model)) throw fail(404, 'Projet introuvable.');
  return { model, storage: path.join(dir, directoryName) };
}

function readItems(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function writeItems(storage, file, items) {
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file) && fs.readdirSync(storage).filter(name => /^[0-9a-f]{32}\.json$/.test(name)).length >= maxChannels) {
    throw fail(409, 'Nombre de dossiers atteint.');
  }
  // Une seule instance Node : séquence synchrone et sauvegarde atomique.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(items), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function open(projects, project, channel) {
  const { storage } = channelStorage(projects, project, channel);
  const file = path.join(storage, `${channel}.json`);
  return { storage, file, notes: readItems(file) };
}

const wallIdPattern = /^[a-zA-Z0-9_:-]{1,64}$/;

function listChannels(projects, project) {
  if (typeof project !== 'string' || !schema.projectPattern.test(project)) {
    throw fail(400, 'Projet invalide.');
  }
  const dir = path.join(projects, project);
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw fail(404, 'Projet introuvable.');
  const storage = path.join(dir, directoryName);
  if (!fs.existsSync(storage)) return [];
  const files = fs.readdirSync(storage).filter(name => /^[0-9a-f]{32}\.json$/.test(name));
  const out = [];
  for (const name of files) {
    const channel = name.slice(0, 32);
    const notes = readItems(path.join(storage, name));
    let openCount = 0, answeredCount = 0, closedCount = 0;
    let lastDate = '';
    for (const n of notes) {
      if (n.status === 'answered') answeredCount++;
      else if (n.status === 'closed') closedCount++;
      else openCount++;
      if (n.date && n.date > lastDate) lastDate = n.date;
    }
    out.push({ channel, total: notes.length, open: openCount, answered: answeredCount, closed: closedCount, lastDate });
  }
  return out.sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)));
}

function append(projects, project, channel, data) {
  const { storage, file, notes } = open(projects, project, channel);
  const text = schema.label(data?.text, 700);
  const pose = schema.pose(data?.pose);
  if (!text || !pose || !schema.point(data?.point)) throw fail(400, 'Texte ou point invalide.');
  if (notes.length >= maxNotes) throw fail(409, 'Dossier plein (100 remarques).');
  const wallId = typeof data?.wallId === 'string' && wallIdPattern.test(data.wallId) ? data.wallId : '';
  const wallLabel = schema.label(data?.wallLabel, 120);
  const rawLevel = Number(data?.level);
  const level = Number.isInteger(rawLevel) && rawLevel >= 0 && rawLevel <= 10 ? rawLevel : 0;
  const source = data?.source === '2d' ? '2d' : '3d';
  const item = {
    id: randomUUID(),
    text,
    pose,
    point: data.point,
    room: schema.label(data.room, 120),
    ...(wallId ? { wallId } : {}),
    ...(wallLabel ? { wallLabel } : {}),
    level,
    source,
    date: new Date().toISOString(),
    status: 'open',
    revision: 0
  };
  writeItems(storage, file, [...notes, item]);
  return item;
}

function review(projects, project, channel, data) {
  const { storage, file, notes } = open(projects, project, channel);
  const index = notes.findIndex(item => item.id === data?.id);
  if (index < 0) throw fail(404, 'Remarque introuvable dans ce dossier.');
  const item = notes[index];
  if (data.revision !== (item.revision ?? 0)) throw fail(409, 'La remarque a changé. Actualisez le dossier avant de réessayer.');
  const { status } = data;
  const reply = schema.label(data.reply, 1000);
  if (!['open', 'answered', 'closed'].includes(status) || typeof data.reply !== 'string' || (status === 'answered' && !reply)) {
    throw fail(400, 'Statut invalide ou réponse manquante pour le statut Répondu.');
  }
  const updated = { ...item, status, reply, reviewedAt: new Date().toISOString(), revision: (item.revision ?? 0) + 1 };
  notes[index] = updated;
  writeItems(storage, file, notes);
  return updated;
}

module.exports = { directoryName, open, append, review, listChannels, channelStorage, readItems, writeItems, fail };
