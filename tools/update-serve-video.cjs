const fs = require('fs');
const path = require('path');

const servePath = path.join(__dirname, '..', 'serve.js');
let code = fs.readFileSync(servePath, 'utf8');

const oldClips = `const VIDEO_MODEL = 'bytedance/seedance-2.5-flash';
const VIDEO_COST_PER_SECOND_ESTIMATE = 0.06726;
const VIDEO_CLIPS = {
  'anim-arrivee': { sourceName: 'facade-sud.jpg', label: 'Arrivée porche & façade', movement: 'Travelling avant lent vers le porche' },
  'anim-sejour': { sourceName: 'sejour.jpg', label: 'Visite panoramique du séjour', movement: 'Panoramique horizontal lent de gauche à droite' }
};`;

const newClips = `const VIDEO_MODEL = 'bytedance/seedance-2.5-flash';
const VIDEO_COST_PER_SECOND_ESTIMATE = 0.06726;
const VIDEO_CLIPS = {
  'anim-arrivee': {
    candidates: ['photor-perspective-01.png', 'perspective-01.jpg', 'facade-sud.jpg', 'facade.jpg'],
    label: 'Arrivée porche & façade',
    movement: 'Travelling avant fluide et lent vers le porche et la façade principale'
  },
  'anim-sejour': {
    candidates: ['photor-sejour-veranda.png', 'interieur-sejour-reference.jpg', 'sejour.jpg', 'r12.jpg'],
    label: 'Visite panoramique du séjour',
    movement: 'Panoramique horizontal fluide du grand séjour et de la véranda'
  },
  'anim-veranda': {
    candidates: ['photor-perspective-02.png', 'perspective-02.jpg'],
    label: 'Véranda arrière & terrasse',
    movement: 'Travelling latéral le long de la terrasse arrière ouverte sur le jardin'
  }
};

function resolveClipSource(clip, media) {
  if (!clip) return null;
  const candidates = clip.candidates || (clip.sourceName ? [clip.sourceName] : []);
  for (const name of candidates) {
    if (fs.existsSync(path.join(media.images, name))) return name;
  }
  return clip.sourceName || candidates[0] || null;
}`;

// Normalize CRLF
const normalize = s => s.replace(/\r\n/g, '\n');

if (normalize(code).includes(normalize(oldClips))) {
  code = normalize(code).replace(normalize(oldClips), normalize(newClips));
  console.log('✓ VIDEO_CLIPS mis à jour');
} else {
  console.warn('! oldClips non trouvé');
}

// 2. updateVideoManifest
const oldUpdateManifest = `  const clip = VIDEO_CLIPS[clipId];
  const sourceImage = \`\${media.prefix}images/\${clip.sourceName}\`;`;

const newUpdateManifest = `  const clip = VIDEO_CLIPS[clipId];
  const sourceName = resolveClipSource(clip, media) || 'source.jpg';
  const sourceImage = \`\${media.prefix}images/\${sourceName}\`;`;

if (normalize(code).includes(normalize(oldUpdateManifest))) {
  code = normalize(code).replace(normalize(oldUpdateManifest), normalize(newUpdateManifest));
  console.log('✓ updateVideoManifest mis à jour');
} else {
  console.warn('! oldUpdateManifest non trouvé');
}

// 3. submitVideo
const oldSubmitSearch = `  const clip = VIDEO_CLIPS[clipId];
  let slug, media;
  try { slug = projectSlug(body && body.project); media = ensureProjectMedia(slug); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (!clip) return sendJson(res, 400, { error: 'Clip vidéo non autorisé.' });
  const sourceImage = \`\${media.prefix}images/\${clip.sourceName}\`;
  const sourcePath = path.join(media.images, clip.sourceName);
  const jobKey = videoJobKey(slug, clipId);
  const active = videoJobs.get(jobKey);
  if (active && !['failed', 'cancelled', 'expired', 'completed'].includes(active.status)) {
    return sendJson(res, 409, { error: 'Une génération est déjà en cours pour ce clip.', status: active.status });
  }
  const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
  const metadata = manifest.items.find(item => item && item.id === clipId && item.type === 'video');
  if (!metadata || metadata.sourceImage !== sourceImage || !fs.existsSync(sourcePath)) {
    return sendJson(res, 400, { error: 'Image de première image ou métadonnées manquantes.' });
  }`;

const newSubmitSearch = `  const clip = VIDEO_CLIPS[clipId];
  let slug, media;
  try { slug = projectSlug(body && body.project); media = ensureProjectMedia(slug); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (!clip) return sendJson(res, 400, { error: 'Clip vidéo non autorisé.' });
  const sourceName = resolveClipSource(clip, media);
  if (!sourceName) return sendJson(res, 400, { error: 'Image source introuvable pour ce clip.' });
  const sourceImage = \`\${media.prefix}images/\${sourceName}\`;
  const sourcePath = path.join(media.images, sourceName);
  if (!fs.existsSync(sourcePath)) return sendJson(res, 400, { error: \`Fichier source introuvable : \${sourcePath}\` });

  const jobKey = videoJobKey(slug, clipId);
  const active = videoJobs.get(jobKey);
  if (active && !['failed', 'cancelled', 'expired', 'completed'].includes(active.status)) {
    return sendJson(res, 409, { error: 'Une génération est déjà en cours pour ce clip.', status: active.status });
  }
  const manifest = JSON.parse(fs.readFileSync(media.manifest, 'utf8'));
  let metadata = manifest.items.find(item => item && item.id === clipId && item.type === 'video');
  if (!metadata) {
    metadata = {
      id: clipId, type: 'video', file: \`\${media.prefix}videos/\${clipId}.mp4\`, mimeType: 'video/mp4',
      sourceImage, poster: sourceImage, duration: 5, durationIsEstimated: true,
      label: clip.label, sourceLabel: '✨ Rendu IA', generator: \`OpenRouter · \${VIDEO_MODEL}\`,
      movement: clip.movement, catalog: true, book: true, generationStatus: 'pending'
    };
    manifest.items.push(metadata);
    fs.writeFileSync(media.manifest, JSON.stringify(manifest, null, 2));
  }`;

if (normalize(code).includes(normalize(oldSubmitSearch))) {
  code = normalize(code).replace(normalize(oldSubmitSearch), normalize(newSubmitSearch));
  console.log('✓ submitVideo mis à jour avec initialisation automatique');
} else {
  console.warn('! oldSubmitSearch non trouvé');
}

fs.writeFileSync(servePath, code, 'utf8');
console.log('✓ serve.js mis à jour avec succès.');
