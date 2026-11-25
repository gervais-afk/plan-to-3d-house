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
    { id: 'photor-sejour', file: `${I}photor-sejour.png`, reference: `${R}sejour.jpg`, room: 'living', catalog: true, fidelity: { version: 2, verdict: 'faithful', score: 0.78 } },
    { id: 'photor-chambre', file: `${I}photor-chambre.png`, reference: `${R}chambre.jpg`, room: 'bed1', catalog: true, fidelity: { version: 2, verdict: 'faithful', score: 0.71 } }
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
    { id: 'photor-sejour', file: `${I}photor-sejour.png`, reference: `${R}sejour.jpg`, room: 'living', catalog: true, fidelity: { version: 2, verdict: 'faithful', score: 0.74 } }
  ];
  const picked = AIEnhance.pickImages({ images });
  assert.equal(picked.facade, null, 'façade non validée : le document garde le plan');
  assert.deepEqual(picked.interiors.map(i => i.id), ['photor-sejour']);
});

test('Documents (porte E) : exclut les rendus IA non vérifiés, « À vérifier » ou infidèles, sauf dérogation tracée', () => {
  const images = [
    { id: 'photor-unverified', file: `${I}photor-unverified.png`, reference: `${R}facade.jpg`, room: null, catalog: true },
    { id: 'photor-review', file: `${I}photor-review.png`, reference: `${R}salon.jpg`, room: 'living', catalog: true, fidelity: { version: 2, verdict: 'review', score: 0.55 } },
    { id: 'photor-unfaithful', file: `${I}photor-unfaithful.png`, reference: `${R}cuisine.jpg`, room: 'kitchen', catalog: true, fidelity: { version: 2, verdict: 'unfaithful', score: 0.22 } },
    { id: 'photor-override', file: `${I}photor-override.png`, reference: `${R}chambre.jpg`, room: 'bed1', catalog: true, fidelity: { version: 2, verdict: 'review', score: 0.54 }, fidelityOverride: { reason: 'Vérifié visuellement par l’architecte', fidelityVersion: 2, verdict: 'review', acceptedAt: '2026-11-24T12:00:00.000Z' } }
  ];
  const picked = AIEnhance.pickImages({ images });
  assert.equal(picked.facade, null);
  assert.deepEqual(picked.interiors.map(i => i.id), ['photor-override']);
});

test('Dimensions : lit la taille réelle d’un JPEG/PNG et renvoie null en cas d’échec (jamais 1920×1080)', async () => {
  const fs = require('node:fs');
  const perspectiveData = `data:image/jpeg;base64,${fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg').toString('base64')}`;
  assert.deepEqual(await AIEnhance.dimensions(perspectiveData), { width: 1080, height: 720 });
  assert.deepEqual(await AIEnhance.dimensions(`data:image/png;base64,${PIXEL}`), { width: 1, height: 1 });
  assert.equal(await AIEnhance.dimensions('data:image/jpeg;base64,AAAA'), null);
  assert.equal(await AIEnhance.dimensions('not-an-image'), null);
  assert.equal(await AIEnhance.dimensions(''), null);
});

test('documentImages : mesure les vraies dimensions (1080×720) et propage la provenance sans inventer', async () => {
  const fs = require('node:fs');
  const perspectiveBuf = fs.readFileSync('projects/residence-verandas/generated/images/perspective-01.jpg');
  const refBuf = fs.readFileSync('projects/residence-verandas/generated/images/interieur-sejour-reference.jpg');
  const fetch = async url => {
    if (url.startsWith('api/gallery/media')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          images: [
            { id: 'perspective-01', file: `${I}perspective-01.jpg`, label: 'Façade et perron', source: 'architect', cover: true, catalog: true },
            { id: 'sejour-ref', file: `${I}interieur-sejour-reference.jpg`, label: 'Séjour', notes: 'Capture issue de la maquette Three.js', room: 'living', catalog: true }
          ],
          renders: []
        })
      };
    }
    if (url.endsWith('perspective-01.jpg')) return { ok: true, status: 200, blob: async () => new Blob([perspectiveBuf], { type: 'image/jpeg' }) };
    if (url.endsWith('interieur-sejour-reference.jpg')) return { ok: true, status: 200, blob: async () => new Blob([refBuf], { type: 'image/jpeg' }) };
    return { ok: false, status: 404, json: async () => ({ error: 'introuvable' }) };
  };
  const docs = await AIEnhance.documentImages('demo', { fetch });
  assert.equal(docs.facade.width, 1080);
  assert.equal(docs.facade.height, 720);
  assert.equal(docs.facade.sourceKind, 'architect');
  assert.equal(docs.interiors.length, 1);
  assert.equal(docs.interiors[0].sourceKind, 'render3d');
  assert.ok(docs.interiors[0].width > 0 && docs.interiors[0].height > 0);
});
