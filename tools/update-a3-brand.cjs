const fs = require('fs');
const file = 'C:/Users/HP/Desktop/plan de maison animé/js/planBook.js';
let content = fs.readFileSync(file, 'utf8');
const target = "text(doc, 'ARCHICAM STUDIO', x, M + 10, 9.5, { bold: true, color: C.white, space: 0.8 });";
const replacement = "text(doc, 'ARCHICAM STUDIO', x, M + 10, 9.5, { bold: true, color: C.gold, space: 1.6 });";
if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated A3 cover brand to C.gold and space: 1.6');
} else {
  console.log('Target not found in planBook.js');
}
