const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { build, extractPrompt, FILES } = require('../tools/ai-context.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ============================================================================
// Le contexte assemblé pour un assistant IA reproduit le dépôt, sans le réécrire
// ============================================================================
test('Contexte IA : prompt de reprise extrait tel quel, sans reformulation', () => {
  const rules = read('docs/reprise-assistant.md');
  const prompt = extractPrompt(rules);

  // Le prompt vient du document de reprise : c'est la même source, pas une copie à maintenir.
  assert.ok(rules.includes(prompt), 'le prompt doit exister mot pour mot dans docs/reprise-assistant.md');
  assert.match(prompt, /Réponds toujours en français/);

  // Les règles qui coûtent cher quand elles sont oubliées sont dans le prompt.
  for (const rule of [
    /isClientPortalMode\(\)/,          // portail client : 403
    /Porte E/,                          // aucun cartouche inventé
    /ordre de grandeur en FCFA/,        // montant non contractuel
    /Aucun faux asset/,                 // pas de données fabriquées
    /4,5:1/,                            // seuil de contraste AA
    /data-scheme="auto"/,               // mode sombre préservé
    /PROJET VALIDÉ/                     // la vérification à lancer
  ]) {
    assert.match(prompt, rule, `règle absente du prompt de reprise : ${rule}`);
  }

  assert.throws(() => extractPrompt('aucun bloc ici'), /Bloc de prompt introuvable/);
});

test('Contexte IA : chaque fichier de référence est repris en entier', () => {
  const context = build();

  assert.equal(FILES.length >= 5, true, 'le contexte doit couvrir la carte, la charte et les jetons');

  for (const [file] of FILES) {
    const source = read(file).trimEnd();
    assert.ok(context.includes(source), `${file} doit être repris intégralement`);
    assert.ok(context.includes(`## `) && context.includes(`\`${file}\``), `${file} doit être annoncé`);
  }

  // Une clôture de quatre accents graves ne peut pas être fermée par le code qu'elle encadre :
  // chaque fichier et le prompt ouvrent donc un bloc, et chacun est refermé une seule fois.
  const openings = (context.match(/^````text$/gm) || []).length;
  const closings = (context.match(/^````$/gm) || []).length;
  assert.equal(openings, FILES.length + 1, 'un bloc pour le prompt, un par fichier');
  assert.equal(closings, openings, 'autant de fermetures que d’ouvertures');

  // Les commandes de vérification terminent le contexte : l'assistant sait quoi lancer.
  assert.match(context, /node --test tests\/\*\.test\.cjs/);
  assert.match(context, /node verify_all\.js/);
});
