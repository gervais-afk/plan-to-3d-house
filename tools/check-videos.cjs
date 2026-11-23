const fs = require('fs');
const vDir = 'C:/Users/HP/Desktop/plan de maison animé/projects/residence-verandas/generated/videos';
if (fs.existsSync(vDir)) {
  const files = fs.readdirSync(vDir);
  console.log('Videos directory files:', files);
  files.forEach(f => {
    const stat = fs.statSync(vDir + '/' + f);
    console.log(f, (stat.size / 1024 / 1024).toFixed(2) + ' MB', stat.mtime);
  });
}
const manifest = JSON.parse(fs.readFileSync('C:/Users/HP/Desktop/plan de maison animé/projects/residence-verandas/generated/manifest.json', 'utf8'));
console.log('Manifest videos:', manifest.items.filter(x => x.type === 'video'));
