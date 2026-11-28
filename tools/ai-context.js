#!/usr/bin/env node
/*
 * Assemble un contexte unique pour un assistant IA sans accès au dépôt
 * (Google AI Studio, par exemple) : le prompt de reprise, puis le texte
 * intégral des fichiers de référence.
 *
 *   node tools/ai-context.js              → ai-studio-contexte.md
 *   node tools/ai-context.js --stdout     → sur la sortie standard
 *
 * Le fichier produit est généré, jamais édité à la main : il est ignoré par Git
 * pour ne pas dupliquer la documentation (qui resterait à maintenir en double).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = 'ai-studio-contexte.md';
const REPO = 'https://github.com/gervais-afk/plan-to-3d-house';

/** Ordre volontaire : le prompt d'abord, puis la carte du projet, puis les détails. */
const FILES = [
  ['docs/architecture.md', 'Architecture : pages, données, modules, serveur'],
  ['DESIGN.md', 'Charte : jetons, règles de composition, densité et accessibilité'],
  ['css/tokens.css', 'Source unique des couleurs, tailles, rayons et ombres'],
  ['docs/reprise-assistant.md', 'Règles de reprise (dont le prompt ci-dessus et les limites connues)'],
  ['package.json', 'Scripts et dépendances'],
  ['js/contrast.js', 'Exemple de module : style, exports, commentaires du dépôt']
];

function readFile(relative) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Fichier de référence introuvable : ${relative}`);
  }
  return fs.readFileSync(absolute, 'utf8').trimEnd();
}

/** Extrait le prompt entre les deux lignes de clôture ~~~ de docs/reprise-assistant.md. */
function extractPrompt(markdown) {
  const match = /^~~~text\n([\s\S]*?)\n~~~$/m.exec(markdown);
  if (!match) throw new Error('Bloc de prompt introuvable dans docs/reprise-assistant.md');
  return match[1].trim();
}

function fence(content) {
  // Une clôture de quatre accents graves ne peut pas être fermée par le code qu'elle encadre.
  return '````text\n' + content + '\n````';
}

function build() {
  const promptSource = readFile('docs/reprise-assistant.md');
  const prompt = extractPrompt(promptSource);
  const parts = [];

  parts.push('# ArchiCam Studio — contexte complet pour un assistant IA');
  parts.push('');
  parts.push(`Dépôt public : ${REPO} (branche \`main\`). Ce fichier est généré par \`node tools/ai-context.js\` :`);
  parts.push('il rassemble le prompt de reprise et le texte intégral des fichiers de référence,');
  parts.push('pour un assistant qui n’a pas accès au dépôt (Google AI Studio, par exemple).');
  parts.push('');
  parts.push('**Mode d’emploi.** Collez la section « Prompt de reprise » ci-dessous, puis joignez ce');
  parts.push('fichier entier comme contexte, ou collez-le à la suite. Pour une tâche précise, ajoutez');
  parts.push('le fichier concerné (`css/polish.css` pour la mise en page, `js/app.js` pour le cockpit,');
  parts.push('`privatePortal.js` pour le portail) : ils sont trop longs pour tenir ici sans noyer le reste.');
  parts.push('');
  parts.push('## Sommaire');
  parts.push('');
  parts.push('1. Prompt de reprise');
  FILES.forEach(([file, title], index) => {
    parts.push(`2.${index + 1} \`${file}\` — ${title}`);
  });
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## 1. Prompt de reprise');
  parts.push('');
  parts.push(fence(prompt));
  parts.push('');

  FILES.forEach(([file, title], index) => {
    parts.push(`## 2.${index + 1} \`${file}\` — ${title}`);
    parts.push('');
    parts.push(fence(readFile(file)));
    parts.push('');
  });

  parts.push('---');
  parts.push('');
  parts.push('## 3. Vérifier avant d’annoncer');
  parts.push('');
  parts.push('```text');
  parts.push('node --check <fichier modifié>.js');
  parts.push('node --test tests/*.test.cjs        # la suite doit rester verte');
  parts.push('node verify_all.js                  # doit afficher « PROJET VALIDÉ »');
  parts.push('```');

  return parts.join('\n') + '\n';
}

function main() {
  const content = build();
  if (process.argv.includes('--stdout')) {
    process.stdout.write(content);
    return;
  }
  const target = path.join(ROOT, OUTPUT);
  fs.writeFileSync(target, content);
  const kb = (Buffer.byteLength(content) / 1024).toFixed(1);
  console.log(`${OUTPUT} — ${kb} Ko, ${FILES.length} fichiers de référence + le prompt`);
  console.log(`Suite : collez le prompt, puis joignez ${OUTPUT} tel quel à l’assistant.`);
}

if (require.main === module) main();
module.exports = { build, extractPrompt, FILES };
