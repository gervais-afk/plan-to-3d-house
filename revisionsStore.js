/**
 * Journal des révisions (V1, V2, V3…) stocké dans projects/<slug>/.revisions/journal.json.
 * - Confinement strict des chemins (path.resolve + vérif path.sep)
 * - Numérotation automatique V1, V2, V3…
 * - Calcul automatique des écarts (surfaces, pièces, budget FCFA, remarques) entre deux révisions
 * - Écriture atomique (.tmp + rename)
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const DIR_NAME = '.revisions';
const JOURNAL_FILE = 'journal.json';
const MAX_REVISIONS = 40;
const fail = (status, message) => Object.assign(new Error(message), { status });

function cleanText(value, maxLen = 280) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, maxLen)
    : '';
}

function numOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function projectRevisionsDir(projectsRoot, slug) {
  const normalized = String(slug || '').toLowerCase();
  if (!SLUG_RE.test(normalized)) throw fail(400, 'Identifiant de projet invalide.');
  const base = path.resolve(projectsRoot);
  const projectDir = path.resolve(base, normalized);
  if (!projectDir.startsWith(base + path.sep)) throw fail(403, 'Chemin projet hors limite.');
  if (!fs.existsSync(path.join(projectDir, 'project.json'))) throw fail(404, 'Projet introuvable.');
  const revDir = path.resolve(projectDir, DIR_NAME);
  if (!revDir.startsWith(projectDir + path.sep)) throw fail(403, 'Chemin révisions hors limite.');
  return revDir;
}

function journalPath(projectsRoot, slug) {
  const dir = projectRevisionsDir(projectsRoot, slug);
  const file = path.resolve(dir, JOURNAL_FILE);
  if (!file.startsWith(dir + path.sep)) throw fail(403, 'Chemin journal hors limite.');
  return { dir, file };
}

function readJournal(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeJournalAtomic(dir, file, items) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function computeMetrics(snapshot, feedbackSummary = null) {
  const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
  const walls = Array.isArray(snapshot?.walls) ? snapshot.walls : [];
  const habitable = rooms.filter(r => r && r.habitable !== false).reduce((s, r) => s + (Number(r.area) || 0), 0);
  const annexes = rooms.filter(r => r && r.habitable === false).reduce((s, r) => s + (Number(r.area) || 0), 0);
  const estimate = snapshot?.estimate || {};
  return {
    habitable: numOr(habitable),
    annexes: numOr(annexes),
    roomsCount: rooms.length,
    wallsCount: walls.length,
    budgetLow: Math.round(Number(estimate.low) || 0),
    budgetHigh: Math.round(Number(estimate.high) || 0),
    feedbackOpen: Math.max(0, Math.round(Number(feedbackSummary?.open) || 0)),
    feedbackResolved: Math.max(0, Math.round(Number(feedbackSummary?.resolved) || 0))
  };
}

function computeDiff(prev, curr) {
  if (!prev || !curr) return null;
  const a = prev.metrics || {};
  const b = curr.metrics || {};
  return {
    habitableDelta: numOr((b.habitable || 0) - (a.habitable || 0)),
    annexesDelta: numOr((b.annexes || 0) - (a.annexes || 0)),
    roomsDelta: (b.roomsCount || 0) - (a.roomsCount || 0),
    wallsDelta: (b.wallsCount || 0) - (a.wallsCount || 0),
    budgetLowDelta: Math.round((b.budgetLow || 0) - (a.budgetLow || 0)),
    budgetHighDelta: Math.round((b.budgetHigh || 0) - (a.budgetHigh || 0)),
    feedbackDelta: (b.feedbackOpen || 0) - (a.feedbackOpen || 0),
    feedbackResolvedDelta: (b.feedbackResolved || 0) - (a.feedbackResolved || 0)
  };
}

function attachDiffs(items) {
  return items.map((item, idx) => ({
    ...item,
    tag: item.tag || item.version || `V${item.number || idx + 1}`,
    diff: idx > 0 ? computeDiff(items[idx - 1], item) : null
  }));
}

function list(projectsRoot, slug) {
  const { file } = journalPath(projectsRoot, slug);
  return attachDiffs(readJournal(file));
}

function create(projectsRoot, slug, payload = {}) {
  const { dir, file } = journalPath(projectsRoot, slug);
  const items = readJournal(file);
  const nextNum = items.reduce((m, it) => Math.max(m, Number(it.number) || 0), 0) + 1;
  const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : null;
  if (!snapshot || !Array.isArray(snapshot.rooms)) {
    throw fail(400, 'Instantané de projet requis pour enregistrer une révision.');
  }
  const metrics = payload.metrics && typeof payload.metrics === 'object'
    ? {
        habitable: numOr(payload.metrics.habitable),
        annexes: numOr(payload.metrics.annexes),
        roomsCount: Math.max(0, Math.round(Number(payload.metrics.roomsCount) || snapshot.rooms.length)),
        wallsCount: Math.max(0, Math.round(Number(payload.metrics.wallsCount) || (snapshot.walls?.length || 0))),
        budgetLow: Math.round(Number(payload.metrics.budgetLow) || 0),
        budgetHigh: Math.round(Number(payload.metrics.budgetHigh) || 0),
        feedbackOpen: Math.max(0, Math.round(Number(payload.metrics.feedbackOpen) || 0)),
        feedbackResolved: Math.max(0, Math.round(Number(payload.metrics.feedbackResolved) || 0))
      }
    : computeMetrics(snapshot, payload.feedbackSummary);

  const entry = {
    id: `v${nextNum}-${randomUUID().slice(0, 8)}`,
    number: nextNum,
    tag: `V${nextNum}`,
    version: `V${nextNum}`,
    label: cleanText(payload.label || `Révision V${nextNum}`, 90),
    phase: cleanText(payload.phase || snapshot?.meta?.phase || 'APS', 40),
    author: cleanText(payload.author || snapshot?.meta?.agency || '', 80),
    note: cleanText(payload.note || '', 420),
    createdAt: new Date().toISOString(),
    metrics,
    snapshot
  };

  const next = [...items, entry].slice(-MAX_REVISIONS);
  writeJournalAtomic(dir, file, next);
  const withDiffs = attachDiffs(next);
  return withDiffs[withDiffs.length - 1];
}

function remove(projectsRoot, slug, id) {
  const { dir, file } = journalPath(projectsRoot, slug);
  const items = readJournal(file);
  const filtered = items.filter(it => it.id !== String(id || ''));
  if (filtered.length === items.length) throw fail(404, 'Révision introuvable.');
  writeJournalAtomic(dir, file, filtered);
  return { ok: true, remaining: filtered.length };
}

module.exports = { list, create, remove, computeMetrics, computeDiff };
