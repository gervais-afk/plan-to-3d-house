const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const PAGES = ['accueil.html', 'index.html', 'studio.html', 'editor.html', 'portal.html'];

// ============================================================================
// 1. LA COUCHE DE FINITIONS EST CHARGÉE EN DERNIER SUR TOUTES LES VUES
// ============================================================================
test('Design : css/polish.css chargé en dernier sur les cinq vues, invités compris', () => {
  for (const page of PAGES) {
    const html = read(page);
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
    assert.ok(links.length > 1, `${page} doit déclarer ses feuilles`);
    assert.equal(links.at(-1), 'css/polish.css', `${page} : la couche de finitions passe en dernier`);
    for (const href of links) {
      assert.ok(fs.existsSync(path.join(ROOT, href)), `${page} référence une feuille absente : ${href}`);
    }
  }

  // Le portail fermé ne doit pas servir une page à moitié stylée.
  const portal = read('privatePortal.js');
  const viewerFiles = /const viewerFiles = new Set\(\[([\s\S]*?)\]\);/.exec(portal)?.[1] || '';
  const publicFiles = /const publicFiles = new Set\(\[([\s\S]*?)\]\);/.exec(portal)?.[1] || '';
  assert.match(viewerFiles, /css\/polish\.css/, 'les invités reçoivent la couche de finitions');
  assert.match(publicFiles, /css\/polish\.css/, 'la page de connexion du portail aussi');
  assert.doesNotMatch(portal, /'design\.html'/, 'la charte interne reste réservée à l’atelier');
});

// ============================================================================
// 2. LES JETONS MANQUANTS SONT DÉFINIS (PAS DE REPLI GRIS DANS L'ÉDITEUR)
// ============================================================================
test('Design : jetons d’échelle et pont de compatibilité définis dans tokens.css', () => {
  const tokens = read('css/tokens.css');
  const required = [
    '--surface-2', '--surface-3', '--glass', '--overlay', '--ring',
    '--hairline-strong', '--grid-line', '--radius-xs', '--radius-xl',
    '--text-3xl', '--leading-tight', '--leading-body',
    '--space-7', '--space-12', '--space-14', '--header-h', '--measure', '--shadow-3',
    // Pont historique encore lu par les modules de l'éditeur.
    '--border', '--text-primary', '--text-secondary', '--accent-hover', '--surface-2-dark'
  ];
  for (const token of required) {
    assert.match(tokens, new RegExp(`${token}\\s*:`), `tokens.css doit définir ${token}`);
  }

  // Toute variable utilisée par les nouvelles feuilles doit exister quelque part.
  const defined = new Set();
  for (const file of fs.readdirSync(path.join(ROOT, 'css'))) {
    if (!file.endsWith('.css')) continue;
    for (const m of read(`css/${file}`).matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
  }
  for (const file of ['css/polish.css', 'css/designSystem.css']) {
    for (const m of read(file).matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      assert.ok(defined.has(m[1]), `${file} utilise ${m[1]} sans le définir`);
    }
  }
});

// ============================================================================
// 3. LA COUCHE DE FINITIONS RESTE DANS LE SYSTÈME
// ============================================================================
test('Design : polish.css sans couleur en dur, avec focus, squelettes et mouvement réduit', () => {
  const css = read('css/polish.css');

  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'aucune couleur hexadécimale en dur');
  assert.doesNotMatch(css, /rgba?\(\s*\d/, 'aucune couleur opaque en dur : color-mix depuis les jetons');

  assert.match(css, /:focus-visible[\s\S]{0,200}box-shadow: 0 0 0 5px var\(--ring\)/, 'anneau de focus double');
  assert.match(css, /\.skeleton::after/, 'squelette de chargement');
  assert.match(css, /prefers-reduced-motion: reduce/, 'mouvement réduit respecté');
  assert.match(css, /accent-color: var\(--accent\)/, 'cases et boutons radio à l’accent du projet');
  assert.match(css, /\.sheet-subnav button:first-of-type/, 'les actions de la fiche projet sont séparées de la navigation');
  assert.ok(
    css.split('\n').filter(line => /!important/.test(line)).length <= 1,
    'la couche ne doit pas lutter contre le reste par !important'
  );
});

// ============================================================================
// 4. L'ÉDITEUR EST REVENU DANS LA PALETTE ÉDITORIALE
// ============================================================================
test('Design : éditeur premium et outils avancés sans violet ni gris Tailwind', () => {
  const premium = read('css/editorPremium.css');
  const advanced = read('css/editorAdvanced.css');

  for (const [file, css] of [['editorPremium.css', premium], ['editorAdvanced.css', advanced]]) {
    assert.doesNotMatch(css, /#667eea|#764ba2|#1a1a2e|#16213e|#2a2a2a|#f0f0f0|#444\b|#ddd\b|#666\b|#555\b/,
      `${file} ne doit plus contenir de couleur hors charte`);
    assert.doesNotMatch(css, /prefers-color-scheme: dark/,
      `${file} : l’éditeur est clair par conception, plus de bloc sombre isolé`);
  }

  assert.match(premium, /#btn-sublimate[\s\S]{0,220}background: var\(--ink\)/, 'le bouton IA prend l’encre');
  assert.match(premium, /#btn-export-premium[\s\S]{0,260}background: var\(--accent\)/, 'le catalogue prend l’accent sable');
  assert.match(premium, /\.ed-style-option:has\(input:checked\)[\s\S]{0,200}var\(--accent-wash\)/, 'la sélection de style est sable');
  assert.match(advanced, /background: var\(--surface-2\);/, 'les cartes avancées reprennent le papier étagé');
});

// ============================================================================
// 5. LA CHARTE VIVANTE EXISTE ET SE TIENT
// ============================================================================
test('Design : design.html présente la charte et se relie au reste de l’atelier', () => {
  const html = read('design.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'css', 'designSystem.css')), 'la feuille de la charte existe');

  for (const href of ['css/tokens.css', 'css/polish.css', 'css/designSystem.css', 'DESIGN.md']) {
    assert.ok(html.includes(href), `design.html doit référencer ${href}`);
    assert.ok(fs.existsSync(path.join(ROOT, href)), `cible absente : ${href}`);
  }

  // Chaque entrée du sommaire pointe une section réelle.
  const navTargets = [...html.matchAll(/class="ds-nav"[\s\S]*?<\/nav>/g)]
    .flatMap(block => [...block[0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]));
  assert.ok(navTargets.length >= 6, 'sommaire complet');
  for (const id of navTargets) assert.ok(html.includes(`id="${id}"`), `section manquante : ${id}`);

  // Charte maison : pas d'emoji dans l'interface.
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'aucun emoji dans la charte');

  // Tous les fichiers locaux cités par la page existent (images, feuilles, liens).
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `ressource absente : ${m[1]}`);
  }

  // La charte est accessible depuis l'atelier, pas depuis une page client.
  assert.match(read('studio.html'), /href="design\.html"/, 'l’atelier mène à la charte');
  for (const page of ['accueil.html', 'index.html', 'portal.html']) {
    assert.doesNotMatch(read(page), /href="design\.html"/, `${page} reste une vue client`);
  }
});

// ============================================================================
// 6. COMPOSITION DU DOSSIER : INDICES ROMAINS, REPÈRES GROUPÉS, JOURNAL
// ============================================================================
test('Dossier : sections indicées I→IV, repères en deux familles et journal typé', () => {
  const accueil = read('accueil.html');
  const indices = [...accueil.matchAll(/<span class="sheet-index" aria-hidden="true">([IVX]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(indices, ['I', 'II', 'III', 'IV'], 'les quatre sections de la fiche portent leur indice, dans l’ordre');

  const labels = [...accueil.matchAll(/<p class="welcome-section-label">[\s\S]*?<\/p>/g)].map(m => m[0]);
  assert.equal(labels.length, 4, 'une seule forme d’en-tête pour les quatre sections');
  for (const [label, text] of [['I', 'PRÉSENTATION DU PROJET'], ['II', 'TABLEAU DES SURFACES'], ['III', 'LE PROJET EN IMAGES'], ['IV', 'JOURNAL DES RÉVISIONS']]) {
    assert.ok(labels.some(block => block.includes(`>${label}</span>`) && block.includes(text)), `en-tête ${label} / ${text}`);
  }

  // Les repères se lisent en deux familles, construites par js/home.js.
  const home = read('js/home.js');
  assert.match(home, /\['Le dossier', \[/, 'première famille de repères : le dossier');
  assert.match(home, /\['Les chiffres', \[/, 'seconde famille : les chiffres');
  assert.match(home, /heading\.className = 'sheet-facts-title'/, 'les familles sont séparées par un vrai intertitre');
  assert.match(home, /\.filter\(\(\[, rows\]\) => rows\.length\)/, 'une famille vide ne laisse pas d’intertitre orphelin');

  // Styles de la composition, dans la couche de finitions (donc aussi sur la charte).
  const polish = read('css/polish.css');
  assert.match(polish, /\.welcome-section-label:has\(\.sheet-index\)::after/, 'filet de conduite de l’en-tête');
  assert.match(polish, /\.sheet-facts dt\.sheet-facts-title/, 'intertitre de famille de repères');
  assert.match(polish, /\.sheet-rev-tag \{[\s\S]{0,320}var\(--serif\)/, 'l’indice de révision devient une figure serif');

  // La charte montre ces composants, et son sommaire pointe la section.
  const design = read('design.html');
  assert.match(design, /id="dossier"/, 'la charte présente la composition du dossier');
  assert.match(design, /class="sheet-revisions-list"/, 'aperçu du journal des révisions');
  assert.match(design, /class="sheet-index" aria-hidden="true">II</, 'aperçu de l’en-tête indicé');
});
