const fs = require('fs');
const path = require('path');

// Test synthesis board data resolution
const projectJson = JSON.parse(fs.readFileSync('C:/Users/HP/Desktop/plan de maison animé/projects/residence-verandas/project.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('C:/Users/HP/Desktop/plan de maison animé/projects/residence-verandas/generated/manifest.json', 'utf8'));

console.log('Project name:', projectJson.meta?.name);
console.log('Habitable:', projectJson.totals?.habitable);
console.log('Rooms:', projectJson.rooms.length);
console.log('Manifest items:', manifest.items.length);
