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
    id: 'photor-sejour-veranda',
    source: 'generated/images/interieur-sejour-reference.jpg',
    label: 'Séjour cathédrale & véranda — photoréaliste',
    room: 'r12',
    aspect_ratio: '16:9',
    prompt: `Create a high-end Calm Luxury architectural interior visualization based on this exact Three.js 3D camera capture of the main living room (Séjour & grande Véranda). Strictly preserve the camera viewpoint, perspective, room dimensions, double-height ceiling volume, wall partitions, sliding glass veranda doors, and windows: do not move walls or invent openings. Upgrade only the materials and light: warm off-white mineral lime plaster on walls, honed large-format limestone flooring with subtle soft reflections, warm natural oak wall accents, and slim matte dark aluminium glazing frames. Soft daylight pouring in through the expansive veranda doors with gentle cast shadows. Refined contemporary furniture (minimalist linen sofa, travertine coffee table, discreet architectural lighting). Non-contractual illustrative render.`,
    notes: 'Rendu intérieur photoréaliste du séjour et de la véranda généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-cuisine',
    source: 'generated/renders/r2.jpg',
    label: 'Cuisine contemporaine — photoréaliste',
    room: 'r2',
    aspect_ratio: '16:9',
    prompt: `Create a prestigious Calm Luxury architectural interior photograph based on this exact 3D camera capture of the kitchen (Cuisine contemporaine). Strictly preserve the camera angle, perspective, room bounds, window positions, and kitchen island / counter layout. Upgrade materials to luxury architectural standards: honed quartzite or matte marble worktops, seamless warm oak millwork cabinetry, integrated minimalist appliances, matte black designer fixtures, and honed stone floor tiles. Soft natural daylight streaming from the window, calm refined atmosphere. No people, no branding. Non-contractual illustrative render.`,
    notes: 'Rendu intérieur de la cuisine contemporaine généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-salle-a-manger',
    source: 'generated/renders/r13.jpg',
    label: 'Salle à manger — photoréaliste',
    room: 'r13',
    aspect_ratio: '16:9',
    prompt: `Create an elite Calm Luxury architectural interior visualization based on this exact 3D camera capture of the dining room (Salle à manger). Strictly preserve the camera viewpoint, perspective, openings to the veranda, and room layout. Render materials with architectural elegance: solid natural oak dining table, sculptural contemporary dining chairs, minimalist designer pendant light, warm mineral wall plaster, and honed limestone flooring. Gentle warm daylight filtered through the veranda glazing with soft ambient reflections. Non-contractual illustrative render.`,
    notes: 'Rendu intérieur de la salle à manger généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-suite-parentale',
    source: 'generated/renders/r16.jpg',
    label: 'Suite parentale — photoréaliste',
    room: 'r16',
    aspect_ratio: '16:9',
    prompt: `Create a serene, high-end Calm Luxury architectural interior photograph based on this exact 3D camera capture of the master bedroom (Suite parentale). Strictly preserve the camera angle, room dimensions, balcony window openings, and bed position. Upgrade finishes: warm chevron natural oak parquet flooring, textured lime plaster headboard wall in soft oatmeal tone, crisp white linen bedding on a low-profile oak bed, sheer linen drapery, and matte dark aluminium balcony frames. Soft morning sunlight streaming through the windows with delicate atmospheric shadows. Non-contractual illustrative render.`,
    notes: 'Rendu intérieur de la suite parentale généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-sejour-etage',
    source: 'generated/renders/r15.jpg',
    label: 'Salon haut & galerie de l’étage — photoréaliste',
    room: 'r15',
    aspect_ratio: '16:9',
    prompt: `Create a prestigious Calm Luxury architectural interior visualization based on this exact 3D camera capture of the upper floor lounge and gallery (Séjour étage). Strictly preserve the camera position, mezzanine balustrade, ceiling slope, and terrace openings. Upgrade materials: warm continuous natural oak plank flooring, delicate glass and dark metal railing, smooth chalk-white mineral plaster, and contemporary low-profile seating. Soft ambient daylight cascading from the upper terrace doors with gentle sun patches. Non-contractual illustrative render.`,
    notes: 'Rendu intérieur du salon de l’étage généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-perspective-02',
    source: 'generated/images/perspective-02.jpg',
    label: 'Véranda arrière & terrasse jardin — photoréaliste',
    room: null,
    aspect_ratio: '16:9',
    prompt: `Create a premium Calm Luxury architectural photograph based on this exact 3D camera capture of the rear veranda and garden terrace (Véranda arrière). Strictly preserve the building geometry, columns, roof overhang, sliding glass doors, upper balcony, and perspective. Render exterior walls in authentic sage green lime plaster, columns and patio in natural warm flamed stone paving, slim dark aluminium glazing with gentle garden reflections, and lush, restrained tropical landscape (neat lawn, manicured hedges, shade trees). Warm late afternoon sunlight with soft natural shadows. Non-contractual illustrative render.`,
    notes: 'Rendu extérieur photoréaliste de la véranda arrière généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-perspective-03',
    source: 'generated/images/perspective-03.jpg',
    label: 'Portique d’entrée & perron — photoréaliste',
    room: null,
    aspect_ratio: '16:9',
    prompt: `Create a prestigious Calm Luxury architectural photograph based on this exact 3D camera capture of the entrance portico and steps (Portique d’entrée). Strictly preserve the symmetrical columns, arches, central stone-clad gable, front door, and steps. Upgrade materials: variegated natural local stone cladding on the central gable, sage green smooth mineral plaster on flanking walls, flamed stone steps with crisp bullnose edging, and elegant bronze/dark aluminium entry door. Soft morning daylight with crisp architectural shadows. Non-contractual illustrative render.`,
    notes: 'Rendu extérieur photoréaliste du portique d’entrée généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-perspective-04',
    source: 'generated/images/perspective-04.jpg',
    label: 'Jardin latéral & façade ouest — photoréaliste',
    room: null,
    aspect_ratio: '16:9',
    prompt: `Create a high-end Calm Luxury architectural photograph based on this exact 3D camera capture of the side garden and facade (Jardin latéral). Strictly preserve the building silhouette, windows, roof eaves, and garden walkway. Render materials realistically: sage green lime plaster walls, dark green standing-seam metal roofing, dark aluminium window frames with sky reflections, gravel and flagstone walkway, and neat architectural landscaping. Gentle golden hour light with soft atmospheric depth. Non-contractual illustrative render.`,
    notes: 'Rendu extérieur photoréaliste du jardin latéral généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  },
  {
    id: 'photor-perspective-05',
    source: 'generated/images/perspective-05.jpg',
    label: 'Terrasse haute de l’étage — photoréaliste',
    room: null,
    aspect_ratio: '16:9',
    prompt: `Create an elite Calm Luxury architectural photograph based on this exact 3D camera capture of the upper floor terrace (Terrasse haute). Strictly preserve the balcony railing, veranda roof below, exterior door, and wide perspective view. Render finishes with utmost precision: fine-jointed outdoor stone or composite teak deck tiles, delicate frameless glass balustrade with stainless steel hardware, sage green exterior walls, and panoramic horizon view under soft afternoon light. Clean, sophisticated architectural composition. Non-contractual illustrative render.`,
    notes: 'Rendu photoréaliste de la terrasse haute généré par IA à partir de la capture 3D ; rendu illustratif non contractuel.',
    catalog: true,
    book: true,
    cover: false
  }
];

async function generateTask(task) {
  const sourcePath = path.join(ROOT, 'projects', 'residence-verandas', task.source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Capture source introuvable : ${task.source}`);
  }
  const imgBuffer = fs.readFileSync(sourcePath);
  const dataUrl = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

  console.log(`\n--- Génération de [${task.id}] (${task.label})... ---`);
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
  const cost = result.usage?.cost !== undefined ? Number(result.usage.cost).toFixed(6) : '0.068';
  console.log(`✓ ${task.id}.png enregistré (${outBuffer.length} octets) en ${duration} s · coût : ${cost} $`);

  return {
    id: task.id,
    type: 'image',
    file: `projects/residence-verandas/generated/images/${task.id}.png`,
    reference: `projects/residence-verandas/${task.source}`,
    room: task.room,
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
    try {
      const item = await generateTask(task);
      const existingIdx = manifest.items.findIndex(it => it.id === item.id);
      if (existingIdx >= 0) manifest.items[existingIdx] = item;
      else manifest.items.push(item);

      // Sauvegarde progressive dans manifest.json après chaque image
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (err) {
      console.error(`✗ Erreur sur [${task.id}] :`, err.message);
    }
  }

  console.log('\n========================================');
  console.log(`Toutes les perspectives ont été traitées. manifest.json est à jour !`);
  console.log('========================================');
}

run().catch(err => {
  console.error('\n✗ Erreur fatale :', err.message);
  process.exit(1);
});
