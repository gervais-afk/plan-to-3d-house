const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const keyFile = path.join(ROOT, 'openrouter.key');
if (!fs.existsSync(keyFile)) {
  console.error('Erreur : openrouter.key introuvable.');
  process.exit(1);
}
const key = fs.readFileSync(keyFile, 'utf8').trim();

const model = 'google/gemini-3.1-flash-image';
const outDir = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'images');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const task = {
  id: 'photor-coupe-bb',
  source: '063240.webp',
  label: 'Coupe transversale B–B — perspective en coupe habitée',
  aspect_ratio: '16:9',
  prompt: `Transform this exact 2D architectural section drawing (Coupe transversale B–B) into a prestigious, high-end inhabited section perspective (strict architectural section view, coupe transversale habitée, Architectural Digest / El Croquis editorial monograph style). Strictly preserve the exact architectural geometry, floor-to-ceiling heights (2.80 m), floor slab thicknesses, roof pitch, veranda profiles, stair position, and room volumes: do not alter the structural levels or proportions. Render structural elements (slabs, footings, exterior and interior wall cross-sections) in refined matte charcoal architectural concrete poché with crisp cut outlines. Inside the cut volumes, reveal warm, realistic interior spaces: warm natural oak parquet on the upper floor, honed warm natural stone flooring on the ground floor, soft ambient interior lighting, tasteful minimalist designer furniture in elevation/profile, and 1-2 subtle monochrome scale figures to convey human scale. Render soft natural daylight streaming through the exterior veranda openings, casting gentle diagonal light beams and soft shadows. Elegant unbleached warm linen museum paper background (#F7F5F0) without digital glare. Strictly retain the flat orthogonal section plane without perspective vanishing distortion.`,
  notes: 'Coupe transversale B–B d’ambiance habitée générée par IA à partir de la coupe technique source ; rendu illustratif non contractuel.',
  catalog: true,
  book: true,
  cover: false
};

async function run() {
  const sourcePath = path.join(ROOT, 'projects', 'residence-verandas', 'planches', task.source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Plan source introuvable : ${task.source}`);
  }
  const imgBuffer = fs.readFileSync(sourcePath);
  const dataUrl = `data:image/webp;base64,${imgBuffer.toString('base64')}`;

  console.log(`\n--- Génération de [${task.id}] à partir de ${task.source}... ---`);
  const t0 = Date.now();

  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'ArchiCam Studio'
    },
    body: JSON.stringify({
      model,
      prompt: task.prompt,
      aspect_ratio: task.aspect_ratio,
      n: 1,
      output_format: 'png',
      response_format: 'b64_json',
      input_references: [
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    })
  });

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(`Réponse non-JSON d'OpenRouter : ${text.slice(0, 300)}`);
  }

  if (!response.ok || result.error) {
    throw new Error(`Erreur OpenRouter (${response.status}) : ${JSON.stringify(result.error || result)}`);
  }

  const generated = result.data?.[0];
  let outBuffer;
  if (generated?.b64_json) {
    outBuffer = Buffer.from(generated.b64_json, 'base64');
  } else if (generated?.url) {
    console.log(`Téléchargement de l'image : ${generated.url}`);
    const dl = await fetch(generated.url);
    outBuffer = Buffer.from(await dl.arrayBuffer());
  } else {
    throw new Error(`Aucune donnée image dans le retour : ${JSON.stringify(result)}`);
  }

  const outFile = path.join(outDir, `${task.id}.png`);
  fs.writeFileSync(outFile, outBuffer);
  const cost = result.usage?.cost !== undefined ? Number(result.usage.cost).toFixed(6) : 'inconnu';
  console.log(`✓ ${task.id}.png enregistré (${outBuffer.length} octets) en ${duration} s · coût : ${cost} $`);

  const manifestFile = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'manifest.json');
  let manifest = { version: 1, items: [] };
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  }

  const item = {
    id: task.id,
    type: 'image',
    file: `projects/residence-verandas/generated/images/${task.id}.png`,
    reference: `projects/residence-verandas/planches/${task.source}`,
    room: null,
    label: task.label,
    generator: `OpenRouter · ${model}`,
    prompt: task.prompt,
    notes: task.notes,
    catalog: task.catalog,
    book: task.book,
    cover: task.cover
  };

  const existingIdx = manifest.items.findIndex(it => it.id === item.id);
  if (existingIdx >= 0) manifest.items[existingIdx] = item;
  else manifest.items.push(item);

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('✓ manifest.json mis à jour avec succès.');
}

run().catch(err => {
  console.error('\n✗ Erreur :', err.message);
  process.exit(1);
});
