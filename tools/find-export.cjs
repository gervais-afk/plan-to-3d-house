const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/HP/Desktop/plan de maison animé/js';
fs.readdirSync(dir).forEach(f => {
  if (f.endsWith('.js')) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    if (s.includes('book-export')) console.log(f);
  }
});
