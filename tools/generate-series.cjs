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

const tasks = [
  {
    id: 'photor-plan-etage',
    source: '063245.webp',
    label: 'Plan de l’étage (R+1) — rendu d’ambiance colorisé',
    aspect_ratio: '1:1',
    prompt: `Transform this exact 2D architectural floor plan of the upper floor (Étage R+1) into an elite, magazine-quality colored presentation floor plan (strict orthogonal top-down view, plan de vente / plan commercial colorisé, Architectural Digest / Detail editorial style). Strictly preserve the 2D top-down projection and the exact geometry of all walls, partitions, doors, windows, upper balconies, verandas, terraces, and room outlines: do not rotate, shift, slant, tilt into 3D perspective, or invent new rooms or walls. Infill solid walls with deep matte charcoal poché and subtle cast contact shadows to give architectural depth. Render floor finishes according to space: warm natural oak parquet in the bedrooms, modern light stone or porcelain tiles in bathrooms and circulation, and fine-jointed outdoor stone or deck paving on the upper terrace and balconies. Add tastefully scaled minimalist top-down furniture (contemporary beds with crisp linen, wardrobes, bathroom vanity and fixtures) and subtle potted greenery on balconies. Clean linen-white background, crisp lines, refined architectural palette. Strictly 2D flat top-down view without perspective distortion.`,
    notes: 'Plan de vente 2D d’ambiance généré par IA à partir du plan d’étage source ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-plan-masse',
    source: '063243.webp',
    label: 'Plan de masse paysager — rendu d’ambiance colorisé',
    aspect_ratio: '1:1',
    prompt: `Transform this exact architectural site plan (Plan de masse) into a prestigious, high-end colored landscape presentation plan (strict 2D orthogonal aerial top-down view, plan de masse paysager colorisé, architectural competition presentation style). Strictly preserve the cadastral boundaries, building footprint, roof silhouette, verandas, access roads, pedestrian pathways, setbacks, and site layout exactly as drawn: do not alter the building geometry or move property lines. Render the building roof with realistic refined dark green metal standing-seam roofing. Render the site context with lush, realistic landscape architecture: neat lawn with subtle turf texture, warm sand-colored gravel or stone vehicular driveway, refined paved walkways, neatly trimmed tropical hedges, tastefully scattered shade trees and palm canopies casting soft, gentle sun shadows. Clean, elegant architectural presentation with off-white background and subtle north indicator. Strictly flat 2D top-down view without tilt or 3D perspective distortion.`,
    notes: 'Plan de masse paysager colorisé généré par IA à partir du plan source ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-facade-avant',
    source: '063252.webp',
    label: 'Façade avant — élévation colorisée réaliste',
    aspect_ratio: '16:9',
    prompt: `Transform this exact 2D architectural elevation drawing of the front facade (Façade avant) into a prestigious, photorealistically colored architectural elevation (strict 2D frontal elevation view, élévation colorisée réaliste, Architectural Digest / Detail style). Strictly preserve the two-storey proportions, roof profile, central stone gable, arches, columns, front veranda, upper balcony, windows, doors, and glass railings exactly as drafted: do not tilt into perspective, rotate the view, or alter the architectural silhouette. Render materials realistically in the Calm Luxury palette: physically credible sage green textured lime plaster on exterior walls, authentic variegated natural stone cladding on the central gable and porch elements, dark matte aluminium window and door frames, realistic glazing with soft subtle sky reflections, and delicate glass balustrades. Add ground line context with neat stone paving, low-rise tropical shrubs, and soft natural daylight with subtle physically plausible shadows cast by the roof overhangs and balconies. Clean pale architectural sky background. Strictly flat 2D frontal elevation without perspective vanishing points.`,
    notes: 'Élévation 2D colorisée réaliste générée par IA à partir du tracé de façade source ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  }
];

async function generateTask(task) {
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

  return {
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
}

async function run() {
  const manifestFile = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'manifest.json');
  let manifest = { version: 1, items: [] };
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  }

  let totalCost = 0;
  for (const task of tasks) {
    const item = await generateTask(task);
    const existingIdx = manifest.items.findIndex(it => it.id === item.id);
    if (existingIdx >= 0) manifest.items[existingIdx] = item;
    else manifest.items.push(item);
  }

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('\n========================================');
  console.log('Toutes les planches ont été générées et manifest.json est à jour !');
  console.log('========================================');
}

run().catch(err => {
  console.error('\n✗ Erreur lors de la génération :', err.message);
  process.exit(1);
});
