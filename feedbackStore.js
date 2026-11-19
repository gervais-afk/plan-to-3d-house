/** Stockage local des dossiers de retours. Un lien est une capacité de lecture/ajout. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const schema = require('./js/variantState');

const directoryName = '.client-feedback';
const maxNotes = 100;
const maxChannels = 100;
const fail = (status, message) => Object.assign(new Error(message), { status });

function open(projects, project, channel) {
  if (typeof project !== 'string' || !schema.projectPattern.test(project) || typeof channel !== 'string' || !schema.channelPattern.test(channel)) {
    throw fail(400, 'Projet ou lien de retours invalide.');
  }
  const dir = path.join(projects, project);
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw fail(404, 'Projet introuvable.');
  const storage = path.join(dir, directoryName);
  const file = path.join(storage, `${channel}.json`);
  let notes = [];
  try { notes = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { storage, file, notes };
}

function append(projects, project, channel, data) {
  const { storage, file, notes } = open(projects, project, channel);
  const text = schema.label(data?.text, 700);
  const pose = schema.pose(data?.pose);
  if (!text || !pose || !schema.point(data?.point)) throw fail(400, 'Texte ou point invalide.');
  if (notes.length >= maxNotes) throw fail(409, 'Dossier plein (100 remarques).');
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file) && fs.readdirSync(storage).length >= maxChannels) throw fail(409, 'Nombre de dossiers de retours atteint.');
  const item = { id: randomUUID(), text, pose, point: data.point, room: schema.label(data.room, 120), date: new Date().toISOString() };
  // Séquence synchrone et renommage atomique : pas de réécriture partielle ni de concurrence dans le processus Node.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify([...notes, item]), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return item;
}

module.exports = { directoryName, open, append };
