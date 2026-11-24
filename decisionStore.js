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

function get(projects, project, channel, id) {
  const item = list(projects, project, channel).find(entry => entry.id === id);
  if (!item) throw fail(404, 'Proposition introuvable dans ce dossier.');
  return item;
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

function decide(projects, project, channel, id, seenModel, action, comment = '') {
  const { model, storage, file, items } = open(projects, project, channel);
  const item = items.find(entry => entry.id === id);
  if (!item) throw fail(404, 'Proposition introuvable dans ce dossier.');
  if (seenModel !== item.modelHash) throw fail(409, 'La maquette affichée ne correspond pas à cette proposition. Rechargez la visite.');
  if (!['approve', 'request-changes'].includes(action)) throw fail(400, 'Décision invalide.');
  const text = typeof comment === 'string' ? comment.trim().replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 700) : '';
  if (action === 'request-changes' && !text) throw fail(400, 'Un commentaire est requis pour demander une modification.');
  const prior = item.decision || (item.approval ? { type: 'approved', decidedAt: item.approval.approvedAt,
    snapshot: item.approval.snapshot, modelHash: item.approval.modelHash } : null);
  const type = action === 'approve' ? 'approved' : 'changes-requested';
  if (prior) {
    if (prior.type !== type) throw fail(409, 'Une décision a déjà été enregistrée pour cette proposition. Publiez une nouvelle version pour décider à nouveau.');
    return item; // Les répétitions idempotentes ne changent ni l’heure, ni le commentaire, ni l’instantané.
  }
  if (item.modelHash !== fingerprint(model)) throw fail(409, 'La maquette a changé. Demandez une nouvelle proposition.');
  const decidedAt = new Date().toISOString();
  item.decision = { type, decidedAt, comment: action === 'request-changes' ? text : '', snapshot: item.variant, modelHash: item.modelHash };
  if (action === 'approve') item.approval = { approvedAt: decidedAt, snapshot: item.variant, modelHash: item.modelHash };
  writeItems(storage, file, items);
  return item;
}

function approve(projects, project, channel, id, seenModel) {
  return decide(projects, project, channel, id, seenModel, 'approve');
}

module.exports = { list, get, propose, decide, approve };
