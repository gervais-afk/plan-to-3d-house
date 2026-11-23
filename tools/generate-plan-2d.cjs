const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const keyFile = path.join(ROOT, 'openrouter.key');
if (!fs.existsSync(keyFile)) {
  console.error('Erreur : openrouter.key introuvable.');
  process.exit(1);
}
const key = fs.readFileSync(keyFile, 'utf8').trim();

const sourcePath = path.join(ROOT, 'projects', 'residence-verandas', 'planches', '063306.webp');
if (!fs.existsSync(sourcePath)) {
  console.error('Erreur : plan source 063306.webp introuvable.');
  process.exit(1);
}

const imgBuffer = fs.readFileSync(sourcePath);
const dataUrl = `data:image/webp;base64,${imgBuffer.toString('base64')}`;

const PLAN_2D_PROMPT = `Transform this exact 2D architectural floor plan drawing into an elite, magazine-quality colored presentation floor plan (strict top-down view, plan de vente / plan commercial colorisé, Architectural Digest / Detail editorial style). Preserve the strict 2D orthogonal top-down projection and the exact geometry of all walls, partitions, doors, windows, verandas, and room boundaries: do not rotate, shift, slant, tilt into 3D perspective, or invent new rooms or walls. Infill solid walls with deep matte charcoal poché and subtle cast shadows to give architectural depth. Render floor finishes according to space: warm natural oak parquet in bedrooms, polished light stone or porcelain tiles in living spaces and kitchen, fine-jointed outdoor stone paving on verandas and porches. Add tastefully scaled minimalist top-down furniture (contemporary sofa, dining table, beds, bathroom fixtures) and subtle potted plants. Keep all spaces clearly readable, with clean linen-white background, crisp lines, and refined architectural palette. No perspective distortion, no tilt, strictly 2D flat top-down.`;

const model = 'google/gemini-3.1-flash-image';

async function run() {
  console.log(`Envoi de la requête à OpenRouter (${model}) pour le plan 2D source...`);
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
      prompt: PLAN_2D_PROMPT,
      aspect_ratio: '1:1',
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
    console.error('Réponse non JSON reçue :', text.slice(0, 500));
    process.exit(1);
  }

  if (!response.ok || result.error) {
    console.error('Erreur API OpenRouter :', result.error || `HTTP ${response.status}`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const generated = result.data?.[0];
  let outBuffer;
  if (generated?.b64_json) {
    outBuffer = Buffer.from(generated.b64_json, 'base64');
  } else if (generated?.url) {
    console.log('Téléchargement de l’image depuis URL :', generated.url);
    const dl = await fetch(generated.url);
    outBuffer = Buffer.from(await dl.arrayBuffer());
  } else {
    console.error('Aucune donnée d’image trouvée dans le retour :', result);
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'images');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'photor-plan-2d.png');
  fs.writeFileSync(outFile, outBuffer);
  console.log(`Image enregistrée : ${outFile} (${outBuffer.length} octets) en ${duration} s`);

  // Mise à jour du manifest.json
  const manifestFile = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'manifest.json');
  let manifest = { version: 1, items: [] };
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  }

  const existingIdx = manifest.items.findIndex(it => it.id === 'photor-plan-2d');
  const manifestItem = {
    id: 'photor-plan-2d',
    type: 'image',
    file: 'projects/residence-verandas/generated/images/photor-plan-2d.png',
    reference: 'projects/residence-verandas/planches/063306.webp',
    room: null,
    label: 'Plan du rez-de-chaussée — rendu d’ambiance colorisé',
    generator: `OpenRouter · ${model}`,
    prompt: PLAN_2D_PROMPT,
    notes: 'Plan de vente 2D d’ambiance généré par IA à partir du plan source ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  };

  if (existingIdx >= 0) manifest.items[existingIdx] = manifestItem;
  else manifest.items.push(manifestItem);

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Manifeste mis à jour avec photor-plan-2d !');
  if (result.usage?.cost !== undefined) {
    console.log(`Coût réel de l'appel : ${Number(result.usage.cost).toFixed(6)} $`);
  }
}

run().catch(err => {
  console.error('Exception non gérée :', err);
  process.exit(1);
});
