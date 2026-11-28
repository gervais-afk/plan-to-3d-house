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

// ============================================================================
// 7. COCKPIT : COMMANDES GROUPÉES PAR TÂCHES, HUD BAS APAISÉ
// ============================================================================
test('Cockpit : quatre grappes de commandes nommées, aucun identifiant perdu', () => {
  const html = read('index.html');
  const primary = /<div class="btn-row viewer-primary">([\s\S]*?)\n        <\/div>\n        <div class="btn-row client-panel-tabs">/.exec(html);
  assert.ok(primary, 'la rangée de commandes principales doit être isolable');

  const clusters = [...primary[1].matchAll(/<div class="tool-cluster[^"]*" role="group" aria-label="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(clusters, ['Mode de visite', 'Explorer la maquette', 'Produire les documents', 'Présenter et partager']);

  // Regrouper ne doit rien perdre : chaque commande reste accessible par son identifiant.
  const ids = ['mode-badge', 'btn-renders', 'btn-plan-compare', 'btn-clearance-guides', 'btn-ai-studio',
    'btn-deliverables', 'btn-present', 'portal-account', 'clearance-note'];
  for (const id of ids) {
    assert.ok(primary[1].includes(`id="${id}"`), `commande perdue au regroupement : #${id}`);
  }
  assert.ok(primary[1].includes('aria-describedby="clearance-note"'), 'la note de repères reste liée au bouton');

  const polish = read('css/polish.css');
  assert.match(polish, /\.tool-cluster \{[\s\S]{0,200}border-left: 1px solid var\(--hairline\)/, 'séparateur de grappe');
  assert.match(polish, /\.tool-cluster--end \{\s*margin-left: auto;/, 'le partage est poussé à droite');
  assert.match(polish, /\.guided-controls \.dock-shortcuts \.btn-toggle \{[\s\S]{0,160}background: transparent/, 'les raccourcis du HUD passent au second plan');
  assert.match(polish, /@media \(max-width: 430px\)/, 'passe de densité tactile');
  assert.match(read('design.html'), /class="tool-cluster tool-cluster--state"/, 'la charte montre la barre groupée');
});

// ============================================================================
// 8. PORTAIL : CONNEXION SOIGNÉE ET INVITATIONS EN TABLEAU
// ============================================================================
test('Portail : carte de connexion explicite et invitations en quatre colonnes', () => {
  const html = read('portal.html');
  assert.match(html, /class="panel portal-login"/, 'la connexion a sa propre carte');
  assert.match(html, /class="eyebrow-label">Accès réservé</, 'l’accès est annoncé sans ambiguïté');
  assert.match(html, /class="btn btn--primary btn--block">Se connecter/, 'un seul bouton, pleine largeur');
  assert.match(html, /class="invite-table-head"[\s\S]{0,220}Invité \/ dossier[\s\S]{0,60}Accès[\s\S]{0,60}Validité[\s\S]{0,40}État/,
    'en-tête de colonnes des invitations : qui, accès, validité, état');

  const js = read('js/portal.js');
  assert.match(js, /row\.className = 'invite-row'/, 'chaque invitation est une ligne de tableau');
  assert.match(js, /row\.append\(details, access, date, actions\)/, 'quatre cellules : qui, accès, validité, état');
  assert.match(js, /row\.className = 'invite-empty'/, 'l’état vide reste lisible hors grille');
  assert.match(js, /invite-status/, 'le badge d’état est conservé');

  const css = read('css/portal.css');
  assert.match(css, /@media \(min-width: 760px\)[\s\S]{0,400}grid-template-columns: minmax\(0, 1\.5fr\)/, 'la grille du tableau des invitations');
  assert.match(css, /\.portal-login-help/, 'la carte de connexion garde son aide');
});

// ============================================================================
// 9. TABLETTE : LE DOCK PASSE SUR DEUX LIGNES, SANS COLLISION
// ============================================================================
test('Tablette (601–860 px) : dock sur deux lignes, raccourcis tactiles, pas de collision', () => {
  const polish = read('css/polish.css');
  const tablet = /@media \(min-width: 601px\) and \(max-width: 860px\) \{([\s\S]*?)\n\}\n/.exec(polish)?.[1] || '';
  assert.ok(tablet, 'la plage tablette doit exister');

  // Lecture pleine largeur au-dessus, transport en dessous.
  assert.match(tablet, /'reading reading reading'/, 'la lecture occupe la première ligne');
  assert.match(tablet, /'arrows action keys'/, 'le transport reste groupé sous la lecture');
  assert.match(tablet, /grid-template-columns: auto minmax\(0, 1fr\) auto;/, 'trois colonnes pour les commandes');
  assert.match(tablet, /width: min\(100%, 660px\)/, 'largeur bornée du dock tablette');

  // Sur tablette on touche l'écran : les touches clavier s'effacent.
  assert.match(tablet, /\.dock-shortcuts kbd,[\s\S]{0,80}display: none;/, 'les raccourcis clavier sont masqués');

  // Rien ne se superpose : le radar et la carte de validation sont bornés.
  assert.match(tablet, /#visit-workspace \.minimap-card \{[\s\S]{0,160}max-height/, 'le radar reste dans la fenêtre');
  assert.match(tablet, /#visit-workspace \.approval-card \{[\s\S]{0,160}max-height/, 'la validation ne passe pas sous le dock');
  assert.match(tablet, /\.tool-cluster--end \{\s*margin-left: 0;/, 'pas de trou dans la barre quand les grappes se replient');

  // Petits portables : une ligne, touches retirées.
  assert.match(polish, /@media \(min-width: 861px\) and \(max-width: 1080px\)[\s\S]{0,220}min\(100%, 720px\)/,
    'le dock reste sur une ligne en 861–1080 px');

  // La variante « dock libre » n'est pas écrasée par la mise en page tablette.
  assert.match(tablet, /\.tour-dock\.guided-controls:not\(\.dock-free\)/, 'le dock libre garde sa disposition');
  assert.match(tablet, /max-width: 660px/, 'largeur maximale du dock tablette');
});

// ============================================================================
// 10. BANC D'ESSAI ET CONTRASTE RÉEL DE LA PALETTE
// ============================================================================
test('Banc d’essai : cadre à largeur choisie et contrastes WCAG calculés', () => {
  const Contrast = require('../js/contrast.js');

  // Module de calcul : valeurs de référence connues.
  assert.deepEqual(Contrast.parseColor('#F7F5F0'), [247, 245, 240]);
  assert.deepEqual(Contrast.parseColor('#abc'), [170, 187, 204]);
  assert.deepEqual(Contrast.parseColor('rgb(22, 28, 25)'), [22, 28, 25]);
  assert.equal(Contrast.parseColor('var(--ink)'), null, 'une indirection de jeton n’est pas une couleur');
  assert.equal(Contrast.ratio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00', 'noir sur blanc = 21:1');
  assert.equal(Contrast.ratio([255, 255, 255], [0, 0, 0]).toFixed(2), '21.00', 'le ratio est insensible à l’ordre');
  assert.equal(Contrast.verdict(7).code, 'AAA');
  assert.equal(Contrast.verdict(4.6).code, 'AA');
  assert.equal(Contrast.verdict(3.2).code, 'AA grand texte');
  assert.equal(Contrast.verdict(3.2, true).code, 'AA', 'un grand texte se contente de 3:1');
  assert.equal(Contrast.verdict(2.1).code, 'Échec');

  // La palette réelle tient les seuils annoncés dans DESIGN.md, en clair comme en sombre.
  const tokens = read('css/tokens.css');
  const darkBlock = /@media \(prefers-color-scheme: dark\)[\s\S]*?:root\[data-scheme="auto"\] \{([\s\S]*?)\n  \}/.exec(tokens)?.[1] || '';
  const hex = (block, name) => Contrast.parseColor(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1] || '');
  /** Couleur claire, ou surcharge sombre si elle existe. */
  const inScheme = (name, dark) => (dark ? hex(darkBlock, name) || hex(tokens, name) : hex(tokens, name));

  const lightPairs = [
    ['ink', 'paper', 7, false],
    ['ink-2', 'paper', 4.5, false],
    ['muted', 'paper', 4.5, false],
    ['accent-ink', 'paper', 4.5, false],
    ['accent-ink', 'accent-wash', 4.5, false],
    ['paper', 'ink', 7, false],
    ['danger', 'paper', 4.5, false],
    ['success', 'paper', 4.5, false],
    ['warning', 'paper', 4.5, false],
    // Surfaces étagées : un texte secondaire doit rester lisible sur la surface la plus claire.
    ['ink-2', 'surface', 4.5, false],
    ['muted', 'surface', 4.5, false]
  ];
  const darkPairs = [
    ['ink', 'paper', 7, false],
    ['ink-2', 'paper', 4.5, false],
    ['muted', 'paper', 4.5, false],
    ['accent-ink', 'paper', 4.5, false],
    ['accent-ink', 'accent-wash', 4.5, false],
    ['on-night', 'night', 7, false],
    ['on-night-2', 'night', 4.5, false],
    ['on-night-muted', 'night', 4.5, false],
    ['accent-soft', 'night', 3, true],
    ['danger', 'paper', 4.5, false],
    ['success', 'paper', 4.5, false],
    ['warning', 'paper', 4.5, false]
  ];

  for (const [scheme, pairs] of [['clair', lightPairs], ['sombre', darkPairs]]) {
    for (const [fg, bg, min, large] of pairs) {
      const value = Contrast.ratio(inScheme(fg, scheme === 'sombre'), inScheme(bg, scheme === 'sombre'));
      assert.ok(value >= min, `${scheme} · ${fg} sur ${bg} : ${value.toFixed(2)} < ${min}`);
      assert.notEqual(Contrast.verdict(value, large).code, 'Échec', `${scheme} · ${fg} sur ${bg} en échec`);
    }
  }

  // Les états sont explicitement éclaircis, faute de quoi le verdict d’alerte serait illisible.
  assert.ok(darkBlock, 'le mode sombre doit être isolable pour l’audit');
  for (const [name, value] of [['success', '#7fc096'], ['warning', '#e0a45e'], ['danger', '#ef9a8e']]) {
    assert.match(darkBlock, new RegExp(`--${name}: ${value}`), `état ${name} éclairci en mode sombre`);
    assert.ok(Contrast.ratio(Contrast.parseColor(value), Contrast.parseColor('#1f2822')) >= 4.5, `${name} lisible sur la surface sombre`);
  }

  // La page elle-même.
  const html = read('qa.html');
  assert.match(html, /js\/contrast\.js[\s\S]{0,80}js\/qa\.js/, 'le module de contraste précède le banc');
  assert.match(html, /<iframe id="qa-frame" title="[^"]+"/, 'le cadre porte un titre accessible');
  for (const width of ['375', '430', '768', '834', '1024', '1280']) {
    assert.ok(html.includes(`data-width="${width}"`), `préréglage de largeur manquant : ${width}`);
  }
  assert.match(html, /id="qa-contrast-body"/, 'le tableau d’audit a son corps de lignes');
  assert.doesNotMatch(read('css/qa.css'), /#[0-9a-fA-F]{3,8}\b/, 'qa.css sans couleur en dur');

  // Réservé à l'atelier : ni invité, ni page publique du portail.
  const portal = read('privatePortal.js');
  assert.doesNotMatch(portal, /'qa\.html'/, 'le banc d’essai n’est pas servi aux invités');
  assert.match(read('design.html'), /href="qa\.html"/, 'la charte mène au banc d’essai');
});
