const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const state = require('../js/variantState');
const feedback = require('../feedbackStore');
const solar = runInNewContext(fs.readFileSync(path.join(__dirname, '../js/solarStudy.js'), 'utf8') + '\nSolarStudy;');
const pose = { p: [0, 8, 2], q: [0, 0, 0, 1], f: 42, e: 1, cut: true };
const geo = { date: '2026-06-21', lat: 45, lon: 0, utc: 0, north: 90 };
const wooden = { v: 1, project: 'test-l', name: 'Étude « bois »', floor: 'oak', facade: 'timber', hour: 19, pose, solar: geo };

test('Le lien rétablit le projet, les accents, le cadrage et l’heure sans état local', () => {
  const channel = 'a'.repeat(32);
  const href = new URL(state.link('https://exemple.test/visite/index.html?project=autre#wp=4', wooden, channel));
  assert.equal(href.searchParams.get('project'), 'test-l');
  assert(!href.search.includes(channel));
  const parsed = state.readLink(href.hash, 'test-l');
  assert.equal(parsed.variant.name, wooden.name);
  assert.deepEqual(parsed.variant.solar, geo);
  assert.deepEqual(parsed.variant.pose.p, pose.p);
  assert.equal(parsed.variant.pose.cut, true);
  assert.equal(parsed.variant.hour, wooden.hour);
  assert.equal(parsed.channel, channel);
  assert.equal(state.readLink(href.hash, 'autre').variant, null);
  assert.equal(state.readLink('#wp=4', 'test-l').invalid, false);
});

test('Les versions, matériaux, angles, quaternions et dates invalides sont rejetés', () => {
  for (const mod of [{ v: 2 }, { facade: 'inconnu' }, { solar: { ...geo, date: '2026-02-31' } },
    { solar: { ...geo, utc: 17 } }, { hour: 24 }, { pose: { ...pose, f: 181 } }, { pose: { ...pose, q: [0, 0, 0, 0] } }]) {
    assert.equal(state.validate({ ...wooden, ...mod }, 'test-l'), null);
  }
  assert.equal(state.readLink('#variant=' + 'a'.repeat(4500), 'test-l').invalid, true);
});

test('La trajectoire géolocalisée répond à la saison, au fuseau et au nord', () => {
  const june = solar.position(12, 0, geo), dec = solar.position(12, 0, { ...geo, date: '2026-12-21' });
  assert(june.altitude - dec.altitude > 40);
  assert(june.altitude > 65 && june.altitude < 71);
  const shifted = solar.position(14, 0, { ...geo, utc: 2 });
  assert(Math.abs(shifted.altitude - june.altitude) < 0.02);
  const unrotated = solar.position(12, 0, { ...geo, north: 0 });
  assert(Math.abs(june.x + unrotated.z) < 1e-9);
  const midnight = solar.position(0, 0, geo);
  assert(midnight.altitude < 0 && midnight.light === 0 && midnight.dusk === 1);
});

test('Le stockage des remarques isole les projets et les dossiers, et valide les entrées', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retours-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const project of ['test-l', 'autre']) {
    fs.mkdirSync(path.join(root, project));
    fs.writeFileSync(path.join(root, project, 'project.json'), '{}');
  }
  const channel = 'a'.repeat(32), other = 'b'.repeat(32);
  const comment = { text: ' Vérifier la baie ', room: 'salon', point: [1, 1.5, 0], pose };
  const item = feedback.append(root, 'test-l', channel, comment);
  assert.equal(item.text, 'Vérifier la baie');
  assert.deepEqual(feedback.open(root, 'test-l', channel).notes, [item]);
  assert.deepEqual(feedback.open(root, 'autre', channel).notes, []);
  assert.deepEqual(feedback.open(root, 'test-l', other).notes, []);
  assert.throws(() => feedback.open(root, '../ailleurs', channel), { status: 400 });
  assert.throws(() => feedback.open(root, 'test-l', '../sortie'), { status: 400 });
  assert.throws(() => feedback.append(root, 'test-l', channel, { ...comment, point: [0, NaN, 0] }), { status: 400 });
});
