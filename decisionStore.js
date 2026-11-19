/** Versions proposées par l’architecte et validations immuables, par dossier. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const schema = require('./js/variantState');
const { channelStorage, readItems, writeItems, fail } = require('./feedbackStore');

function open(projects, project, channel) {
  const scope = channelStorage(projects, project, channel);
  const storage = path.join(scope.storage, 'decisions');
  const file = path.join(storage, `${channel}.json`);
  return { ...scope, storage, file, items: readItems(file) };
}

const fingerprint = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function list(projects, project, channel) {
  const { model, items } = open(projects, project, channel);
  const currentModel = items.length ? fingerprint(model) : null;
  return items.map(item => ({ ...item, modelChanged: item.modelHash !== currentModel }));
}

function propose(projects, project, channel, input, seenModel) {
  const variant = schema.validate(input, project);
  if (!variant?.name) throw fail(400, 'Une variante nommée et valide est requise.');
  const { model, storage, file, items } = open(projects, project, channel);
  if (items.length >= 50) throw fail(409, 'Dossier plein (50 propositions).');
  const modelHash = fingerprint(model);
  if (seenModel !== modelHash) throw fail(409, 'La maquette a changé. Rechargez la visite avant de proposer une version.');
  const item = { id: randomUUID(), proposedAt: new Date().toISOString(), modelHash, variant, approval: null };
  writeItems(storage, file, [...items, item]);
  return item;
}

function approve(projects, project, channel, id, seenModel) {
  const { model, storage, file, items } = open(projects, project, channel);
  const item = items.find(entry => entry.id === id);
  if (!item) throw fail(404, 'Proposition introuvable dans ce dossier.');
  if (seenModel !== item.modelHash) throw fail(409, 'La maquette affichée ne correspond pas à cette proposition. Rechargez la visite.');
  if (item.approval) return item; // Réessayer ne modifie ni la date ni l’instantané.
  if (item.modelHash !== fingerprint(model)) throw fail(409, 'La maquette a changé. Demandez une nouvelle proposition.');
  item.approval = { approvedAt: new Date().toISOString(), snapshot: item.variant, modelHash: item.modelHash };
  writeItems(storage, file, items);
  return item;
}

module.exports = { list, propose, approve };
