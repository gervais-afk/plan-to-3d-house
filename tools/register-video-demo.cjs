const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const manifestFile = path.join(ROOT, 'projects', 'residence-verandas', 'generated', 'manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

const videoItem = {
  id: 'anim-visite-demo',
  type: 'video',
  file: 'projects/residence-verandas/generated/videos/anim-test.mp4',
  poster: 'projects/residence-verandas/generated/images/photor-perspective-01.png',
  duration: 5,
  label: 'Clip cinématique IA — Animation Seedance 2.5 Flash',
  sourceLabel: '✨ Vidéo IA',
  generator: 'OpenRouter · bytedance/seedance-2.5-flash',
  notes: 'Premier clip cinématique généré par IA démontrant l’animation fluide de la scène d’architecture.',
  catalog: true,
  book: true
};

const existingIdx = manifest.items.findIndex(it => it.id === videoItem.id);
if (existingIdx >= 0) manifest.items[existingIdx] = videoItem;
else manifest.items.push(videoItem);

fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
console.log('✓ manifest.json mis à jour avec le clip vidéo anim-visite-demo.');
