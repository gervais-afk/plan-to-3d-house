const fs = require('fs');
const path = require('path');
const home = process.env.USERPROFILE || 'C:/Users/HP';
const dl = path.join(home, 'Downloads');
console.log('Checking Downloads:', dl);
if (fs.existsSync(dl)) {
  const files = fs.readdirSync(dl).filter(f => f.endsWith('.pdf'));
  console.log('PDFs in Downloads:', files);
  const match = files.find(f => f.includes('synthese') || f.includes('planche'));
  if (match) {
    const src = path.join(dl, match);
    const dest = 'C:/Users/HP/Desktop/plan de maison animé/projects/residence-verandas/generated/planche-synthese-residence-des-verandas.pdf';
    fs.copyFileSync(src, dest);
    console.log('Copied to:', dest, fs.statSync(dest).size, 'bytes');
  }
}
