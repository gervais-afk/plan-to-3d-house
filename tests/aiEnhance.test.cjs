const assert = require('node:assert/strict');
const { test } = require('node:test');
const AIEnhance = require('../js/aiEnhance.js');

const R = 'projects/demo/generated/renders/';
const I = 'projects/demo/generated/images/';
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Faux serveur local : enregistre chaque requête, ne contacte jamais OpenRouter. */
function fakeServer({ configured = true, images = [], renders = [] } = {}) {
  const calls = [];
  const media = { images: [...images], renders: [...renders] };
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url === 'api/ai/status') return json({ configured });
    if (url.startsWith('api/gallery/media')) return json(media);
    if (url === 'api/ai/images') return json({ data: [{ b64_json: PIXEL, media_type: 'image/png' }] });
    if (url.startsWith('api/save-generated')) {
      const item = { id: body.id, type: 'image', file: `${I}${body.id}.png`, reference: body.metadata.reference, room: body.metadata.room, label: body.metadata.label };
      media.images.push(item);
      return json({ ok: true, item });
    }
    if (url.startsWith(R)) return { ok: true, status: 200, blob: async () => new Blob([Buffer.from('jpeg')], { type: 'image/jpeg' }) };
    return json({ error: 'inconnu' }, 404);
  };
  return { fetch, calls, media };
}

test('Sublimation : choisit 1 vue extérieure et 2 intérieures, sans plan ni vue de nuit', () => {
  const plan = AIEnhance.planSublimation({ images: [], renders: [`${R}plan-2d.png`, `${R}soir-sejour.jpg`, `${R}sejour.jpg`, `${R}facade-sud.jpg`, `${R}cuisine.jpg`, `${R}chambre-1.jpg`] });
  assert.deepEqual(plan.map(p => p.name), ['facade-sud', 'sejour', 'cuisine']);
  assert.equal(plan[0].id, 'photor-facade-sud');
  assert.ok(plan[0].exterior);
});

test('Sublimation : ne refait pas ce qui existe déjà (aucun coût inutile)', () => {
  const images = [
    { file: `${I}facade.jpg`, reference: `${R}facade-sud.jpg`, room: null },
    { file: `${I}photor-sejour.png`, reference: `${R}sejour.jpg`, room: 'living' },
    { file: `${I}sejour.jpg`, reference: `${R}sejour.jpg`, room: 'living' }
  ];
  const plan = AIEnhance.planSublimation({ images, renders: [`${R}facade-sud.jpg`, `${R}sejour.jpg`, `${R}cuisine.jpg`, `${R}chambre-1.jpg`] });
  assert.deepEqual(plan.map(p => p.name), ['cuisine']);
});

test('Documents : façade et intérieurs distincts, la sublimation la plus récente prime', () => {
  const picked = AIEnhance.pickImages({ images: [
    { id: 'plan', file: `${I}plan.png`, reference: `${R}plan-2d.png`, room: null, catalog: true },
    { id: 'facade', file: `${I}facade.jpg`, reference: `${R}facade-sud.jpg`, room: null, catalog: true },
    { id: 'sejour', file: `${I}sejour.jpg`, reference: `${R}sejour.jpg`, room: 'living', catalog: true },
    { id: 'photor-sejour', file: `${I}photor-sejour.png`, reference: `${R}sejour.jpg`, room: 'living', catalog: true },
    { id: 'photor-chambre', file: `${I}photor-chambre.png`, reference: `${R}chambre.jpg`, room: 'bed1', catalog: true }
  ] });
  assert.equal(picked.facade.id, 'facade');
  assert.deepEqual(picked.interiors.map(i => i.id), ['photor-sejour', 'photor-chambre']);
});

test('Sublimation : appelle le relais OpenRouter puis enregistre dans le projet', async () => {
  const server = fakeServer({ renders: [`${R}facade-sud.jpg`, `${R}sejour.jpg`] });
  let question = '';
  const result = await AIEnhance.sublimateWithAI('demo', { fetch: server.fetch, confirm: q => { question = q; return true; } });
  assert.equal(result.created.length, 2);
  assert.match(question, /2 vue\(s\).*Gemini/s);
  assert.match(question, /0,136 \$/);
  const generations = server.calls.filter(c => c.url === 'api/ai/images');
  assert.equal(generations.length, 2);
  // Prompts pilotés par le projet (js/aiPrompt.js) : extérieur pour la façade, intérieur pour le séjour.
  assert.match(generations[0].body.prompt, /exterior visualization/);
  assert.match(generations[1].body.prompt, /interior visualization/);
  for (const { body } of generations) {
    assert.equal(body.model, AIEnhance.DEFAULT_MODEL);
    assert.match(body.input_references[0].image_url.url, /^data:image\/jpeg;base64,/);
  }
  const saves = server.calls.filter(c => c.url.startsWith('api/save-generated'));
  assert.deepEqual(saves.map(s => s.url), ['api/save-generated?project=demo', 'api/save-generated?project=demo']);
  assert.deepEqual(saves.map(s => s.body.id), ['photor-facade-sud', 'photor-sejour']);
  assert.equal(saves[0].body.metadata.reference, `${R}facade-sud.jpg`);
  assert.equal(saves[0].body.metadata.room, null);
  assert.equal(saves[1].body.metadata.room, 'sejour');
  // Une image tout juste générée n'est pas validée : elle n'entre dans aucun document avant la case « Catalogue ».
  assert.equal(AIEnhance.isEnhanced(), false);
});

test('Sublimation : refus de la confirmation = aucun appel facturé', async () => {
  const server = fakeServer({ renders: [`${R}facade-sud.jpg`] });
  const result = await AIEnhance.sublimateWithAI('demo', { fetch: server.fetch, confirm: () => false });
  assert.match(result.skipped, /annulée/);
  assert.equal(server.calls.filter(c => c.url === 'api/ai/images').length, 0);
});

test('Sublimation : messages clairs sans clé, sans capture 3D ou sans projet enregistré', async () => {
  await assert.rejects(AIEnhance.sublimateWithAI('demo', { fetch: fakeServer({ configured: false }).fetch, confirm: () => true }), /Clé OpenRouter absente/);
  const empty = await AIEnhance.sublimateWithAI('demo', { fetch: fakeServer().fetch, confirm: () => true });
  assert.match(empty.skipped, /Aucune capture 3D/);
  await assert.rejects(AIEnhance.sublimateWithAI('', { fetch: fakeServer().fetch }), /Enregistrez le projet/);
});

test('Prompt extérieur : aucun mobilier ni décor intérieur (essai réel : un lit était apparu sur la pelouse)', () => {
  const project = require('../projects/maison-croquis/project.json');
  const exterior = AIEnhance.promptFor({ name: 'facade', exterior: true }, project);
  assert.match(exterior.prompt, /exterior visualization/);
  // Aucune déco intérieure demandée ; l'interdiction explicite est attendue.
  assert.doesNotMatch(exterior.prompt, /linen curtains|rug beneath|bedside lamps|cushions|soft throw/i);
  assert.match(exterior.prompt, /Do not place furniture, beds, rugs, lamps or curtains outdoors/);
  assert.equal(exterior.tags.kind, 'exterior');
  const interior = AIEnhance.promptFor({ name: 'chambre-1', exterior: false }, project);
  assert.equal(interior.room.name, 'CHAMBRE 1');
  assert.equal(interior.tags.use, 'bedroom');
});

test('Libellés lisibles : accents rétablis à partir des noms de fichiers', () => {
  const [facade, sejour] = AIEnhance.planSublimation({ images: [], renders: [`${R}facade-sud.jpg`, `${R}sejour.jpg`] });
  assert.equal(facade.label, 'Façade sud');
  assert.equal(sejour.label, 'Séjour');
});

test('Documents : seules les images validées « Catalogue » par l’architecte sont utilisées', () => {
  const images = [
    { id: 'photor-facade', file: `${I}photor-facade.png`, reference: `${R}facade.jpg`, room: null },
    { id: 'photor-cuisine', file: `${I}photor-cuisine.png`, reference: `${R}cuisine.jpg`, room: 'kitchen', catalog: false },
    { id: 'photor-sejour', file: `${I}photor-sejour.png`, reference: `${R}sejour.jpg`, room: 'living', catalog: true }
  ];
  const picked = AIEnhance.pickImages({ images });
  assert.equal(picked.facade, null, 'façade non validée : le document garde le plan');
  assert.deepEqual(picked.interiors.map(i => i.id), ['photor-sejour']);
});
