const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const projectFile = path.join(ROOT, 'projects', 'residence-verandas', 'project.json');

if (!fs.existsSync(projectFile)) {
  console.error('project.json introuvable');
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

// 1. Définir le plan sublimé 2D au sol par défaut dans la visite 3D
if (project.config && project.config.planImage) {
  project.config.planImage.url = 'projects/residence-verandas/generated/images/photor-plan-2d.png';
  console.log('✓ planImage.url configuré sur photor-plan-2d.png');
}

// 2. Mettre à jour les planches d'ambiance d'art par défaut dans edition.sheets
const artMapping = {
  'Plan de masse': 'projects/residence-verandas/generated/images/photor-plan-masse.png',
  'Rez-de-chaussée': 'projects/residence-verandas/generated/images/photor-plan-2d.png',
  'Étage': 'projects/residence-verandas/generated/images/photor-plan-etage.png',
  'Façade avant': 'projects/residence-verandas/generated/images/photor-facade-avant.png',
  'Coupe B–B': 'projects/residence-verandas/generated/images/photor-coupe-bb.png'
};

if (project.edition && Array.isArray(project.edition.sheets)) {
  project.edition.sheets.forEach(sheet => {
    if (artMapping[sheet.title]) {
      sheet.art = artMapping[sheet.title];
      console.log(`✓ Feuille [${sheet.title}] mise à jour avec : ${sheet.art}`);
    }
  });
}

fs.writeFileSync(projectFile, JSON.stringify(project, null, 2), 'utf8');
console.log('✓ project.json enregistré.');
