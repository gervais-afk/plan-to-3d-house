/**
 * ArchiCam Studio — Palette de commandes universelle (⌘K / Ctrl+K) & Guide raccourcis (?)
 * Partagée par studio.html, accueil.html, editor.html et index.html.
 * Zéro dépendance externe, DOM sûr (textContent uniquement), navigation clavier intégrale.
 */
(() => {
  if (window.__archicamIHM) return;

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  const MOD_KEY = isMac ? '⌘' : 'Ctrl';

  function currentPage() {
    const p = (location.pathname || '').toLowerCase();
    if (p.endsWith('editor.html')) return 'editor';
    if (p.endsWith('accueil.html')) return 'accueil';
    if (p.endsWith('index.html')) return 'viewer';
    if (p.endsWith('portal.html')) return 'portal';
    return 'studio';
  }

  function activeProjectSlug() {
    try {
      const qs = new URLSearchParams(location.search).get('project');
      if (qs) return qs;
      return localStorage.getItem('lastProject') || '';
    } catch {
      return '';
    }
  }

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  function makeKbd(label) {
    const k = document.createElement('kbd');
    k.className = 'ihm-kbd';
    k.textContent = label;
    return k;
  }

  function makeSearchIcon(className) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    if (className) svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', '16.65'); l.setAttribute('y1', '16.65');
    l.setAttribute('x2', '21'); l.setAttribute('y2', '21');
    svg.append(c, l);
    return svg;
  }

  // --- Cache projets partagé ---
  let cachedProjects = null;
  async function loadProjects() {
    if (cachedProjects) return cachedProjects;
    try {
      const res = await fetch('api/projects', { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      cachedProjects = Array.isArray(data) ? data : [];
      return cachedProjects;
    } catch {
      return [];
    }
  }

  // --- Construction des commandes contextuelles ---
  function buildContextCommands(page) {
    const slug = activeProjectSlug();
    const q = slug ? `?project=${encodeURIComponent(slug)}` : '';
    const cmds = [];

    const clickIf = (id) => {
      const el = document.getElementById(id);
      if (el && !el.disabled && !el.hidden) { el.click(); return true; }
      return false;
    };

    if (page === 'studio') {
      cmds.push(
        { group: 'Actions de l’atelier', icon: '01', title: 'Ouvrir l’index des dossiers', sub: 'Parcourir tous les projets enregistrés', shortcut: 'O', run: () => clickIf('door-open') },
        { group: 'Actions de l’atelier', icon: '02', title: 'Nouveau projet (Éditeur 2D)', sub: 'Importer un plan PDF/image ou dessiner', shortcut: 'N', run: () => { location.href = 'editor.html'; } },
        { group: 'Actions de l’atelier', icon: 'CB', title: 'Profil de mon cabinet', sub: 'Logo, architecte responsable et cartouche PDF', run: () => clickIf('btn-studio-cabinet') },
        { group: 'Actions de l’atelier', icon: '⤢', title: 'Agrandir la planche active', sub: 'Afficher le tirage ou le film HD en plein écran', shortcut: 'F', run: () => clickIf('print-expand') },
        { group: 'Actions de l’atelier', icon: '❚❚', title: 'Pause / Lecture du carrousel', sub: 'Contrôler le défilement des planches', shortcut: 'Espace', run: () => clickIf('print-toggle') }
      );
    } else if (page === 'editor') {
      cmds.push(
        { group: 'Éditeur 2D & 3D', icon: 'S', title: 'Enregistrer le dossier', sub: 'Sauvegarder le plan et la maquette dans projects/', shortcut: `${MOD_KEY}+S`, run: () => clickIf('btn-save') },
        { group: 'Éditeur 2D & 3D', icon: '3D', title: 'Ouvrir la visite 3D plein écran', sub: 'Passer dans le cockpit architectural immersif', run: () => { if (!clickIf('btn-visit')) location.href = `index.html${q}`; } },
        { group: 'Éditeur 2D & 3D', icon: '2/3', title: 'Vue partagée 2D + 3D temps réel', sub: 'Afficher le plan 2D et la maquette 3D côte à côte', run: () => { document.querySelector('[data-view-mode="split"]')?.click(); } },
        { group: 'Éditeur 2D & 3D', icon: '2D', title: 'Vue plan 2D uniquement', sub: 'Maximiser l’espace de dessin coté', run: () => { document.querySelector('[data-view-mode="2d"]')?.click(); } },
        { group: 'Éditeur 2D & 3D', icon: 'IA', title: 'Lecture IA du plan importé', sub: 'Détecter murs, portes et pièces automatiquement', run: () => clickIf('btn-ai-read') },
        { group: 'Éditeur 2D & 3D', icon: 'PDF', title: 'Importer un plan PDF ou image', sub: 'Charger un fond de plan à tracer ou vectoriser', run: () => clickIf('file-plan') },
        { group: 'Éditeur 2D & 3D', icon: 'MB', title: 'Meubler automatiquement les pièces', sub: 'Disposition réaliste du mobilier par typologie', run: () => clickIf('btn-auto-furnish') }
      );
    } else if (page === 'viewer' || page === 'accueil') {
      cmds.push(
        { group: 'Espace projet', icon: '2D', title: 'Modifier le plan dans l’éditeur 2D', sub: 'Ouvrir l’éditeur pour ajuster murs, ouvertures et mobilier', run: () => { location.href = `editor.html${q}`; } },
        { group: 'Espace projet', icon: '3D', title: 'Visite 3D immersive', sub: 'Explorer la maquette 3D et les ambiances lumineuses', run: () => { location.href = `index.html${q}`; } },
        { group: 'Espace projet', icon: 'RC', title: 'Mode réunion client', sub: 'Présentation épurée, commentaires et décisions', run: () => { location.href = `accueil.html${q}#meeting`; } }
      );
      if (document.getElementById('btn-ai-studio')) {
        cmds.push({ group: 'Espace projet', icon: 'IA', title: 'Ouvrir le Studio IA', sub: 'Sublimation photo, cinéma IA et catalogue', run: () => clickIf('btn-ai-studio') });
      }
    }

    // Navigation transversale & Assistant IA
    cmds.push(
      { group: 'Assistant IA', icon: '✦', title: 'Ouvrir l’Assistant IA', sub: 'Discuter en direct avec l’IA connectée au dossier actif', shortcut: `${MOD_KEY}+J`, run: () => window.__archicamAssistant?.open?.() },
      { group: 'Navigation', icon: '⌂', title: 'Entrée de l’atelier', sub: 'Revenir à la planche d’accueil ArchiCam Studio', run: () => { location.href = './'; } },
      { group: 'Navigation', icon: 'PC', title: 'Portail client', sub: 'Gérer les accès privés et partages clients', run: () => { location.href = 'portal.html'; } },
      { group: 'Navigation', icon: '?', title: 'Afficher les raccourcis clavier', sub: 'Vue rapide des commandes de cet écran', shortcut: '?', run: () => openShortcuts() }
    );

    return cmds;
  }

  function buildProjectCommands(projects) {
    const out = [];
    for (const p of projects) {
      const q = encodeURIComponent(p.slug);
      const subParts = [p.phase, p.subtitle].filter(Boolean);
      out.push({
        group: 'Dossiers de l’atelier',
        thumb: p.cover || '',
        icon: String(p.name || 'P').trim().charAt(0).toUpperCase(),
        title: p.name,
        sub: subParts.join(' · ') || 'Ouvrir la présentation du projet',
        meta: 'Fiche',
        keywords: `${p.slug} ${p.name} ${p.subtitle || ''} ${p.phase || ''}`,
        run: () => {
          try { localStorage.setItem('lastProject', p.slug); } catch { /* ignore */ }
          location.href = `accueil.html?project=${q}`;
        }
      });
      out.push({
        group: 'Accès directs 2D / 3D',
        icon: '2D',
        title: `${p.name} — Éditeur 2D`,
        sub: 'Ouvrir directement dans l’éditeur de plan',
        keywords: `editeur 2d plan ${p.slug} ${p.name}`,
        run: () => {
          try { localStorage.setItem('lastProject', p.slug); } catch { /* ignore */ }
          location.href = `editor.html?project=${q}`;
        }
      });
      out.push({
        group: 'Accès directs 2D / 3D',
        icon: '3D',
        title: `${p.name} — Visite 3D`,
        sub: 'Lancer la visite architecturale 3D',
        keywords: `visite 3d maquette ${p.slug} ${p.name}`,
        run: () => {
          try { localStorage.setItem('lastProject', p.slug); } catch { /* ignore */ }
          location.href = `index.html?project=${q}`;
        }
      });
    }
    return out;
  }

  // --- Construction paresseuse du DOM de la palette ---
  let paletteDlg = null;
  let inputEl = null;
  let listEl = null;
  let allCommands = [];
  let visibleCommands = [];
  let selectedIdx = 0;
  let lastFocused = null;

  function ensurePalette() {
    if (paletteDlg) return paletteDlg;
    const dlg = document.createElement('dialog');
    dlg.className = 'ihm-palette';
    dlg.id = 'ihm-command-palette';
    dlg.setAttribute('aria-label', 'Palette de commandes ArchiCam Studio');

    const head = document.createElement('div');
    head.className = 'ihm-palette-head';
    head.append(makeSearchIcon('ihm-palette-icon'));

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'ihm-palette-input';
    input.placeholder = 'Rechercher un dossier, une vue 2D/3D ou une action…';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'ihm-palette-list');

    const escBtn = document.createElement('button');
    escBtn.type = 'button';
    escBtn.className = 'ihm-palette-esc';
    escBtn.setAttribute('aria-label', 'Fermer la palette');
    escBtn.append(makeKbd('Échap'));
    escBtn.addEventListener('click', () => dlg.close());

    head.append(input, escBtn);

    const list = document.createElement('div');
    list.className = 'ihm-palette-list';
    list.id = 'ihm-palette-list';
    list.setAttribute('role', 'listbox');

    const foot = document.createElement('div');
    foot.className = 'ihm-palette-foot';
    const hints = document.createElement('div');
    hints.className = 'ihm-palette-hints';
    const hNav = document.createElement('span');
    hNav.append(makeKbd('↑'), makeKbd('↓'), document.createTextNode(' naviguer'));
    const hEnter = document.createElement('span');
    hEnter.append(makeKbd('↵'), document.createTextNode(' ouvrir'));
    const hHelp = document.createElement('span');
    hHelp.append(makeKbd('?'), document.createTextNode(' raccourcis'));
    hints.append(hNav, hEnter, hHelp);
    const brandFoot = document.createElement('span');
    brandFoot.textContent = 'ArchiCam Studio';
    foot.append(hints, brandFoot);

    dlg.append(head, list, foot);
    document.body.append(dlg);

    input.addEventListener('input', () => {
      selectedIdx = 0;
      renderCommands(input.value);
    });

    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (visibleCommands.length) {
          selectedIdx = (selectedIdx + 1) % visibleCommands.length;
          updateSelection();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (visibleCommands.length) {
          selectedIdx = (selectedIdx - 1 + visibleCommands.length) % visibleCommands.length;
          updateSelection();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(visibleCommands[selectedIdx]);
      }
    });

    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });

    dlg.addEventListener('close', () => {
      if (lastFocused && typeof lastFocused.focus === 'function') {
        try { lastFocused.focus(); } catch { /* ignore */ }
      }
      lastFocused = null;
    });

    paletteDlg = dlg;
    inputEl = input;
    listEl = list;
    return dlg;
  }

  function updateSelection() {
    if (!listEl) return;
    const buttons = listEl.querySelectorAll('.ihm-palette-item');
    buttons.forEach((btn, idx) => {
      const active = idx === selectedIdx;
      btn.setAttribute('aria-selected', String(active));
      if (active) btn.scrollIntoView({ block: 'nearest' });
    });
  }

  function executeCommand(cmd) {
    if (!cmd) return;
    paletteDlg?.close();
    setTimeout(() => { try { cmd.run(); } catch { /* ignore */ } }, 10);
  }

  function renderCommands(rawQuery) {
    if (!listEl) return;
    const q = String(rawQuery || '').trim().toLocaleLowerCase('fr');
    const filtered = allCommands.filter((cmd) => {
      if (!q) {
        // Sans filtre : on montre actions + dossiers principaux (pas les sous-actions 2D/3D redondantes)
        return cmd.group !== 'Accès directs 2D / 3D';
      }
      const hay = `${cmd.title} ${cmd.sub || ''} ${cmd.group || ''} ${cmd.keywords || ''}`.toLocaleLowerCase('fr');
      return q.split(/\s+/).every(tok => hay.includes(tok));
    });

    visibleCommands = filtered.slice(0, 18);
    if (selectedIdx >= visibleCommands.length) selectedIdx = 0;

    listEl.replaceChildren();
    if (!visibleCommands.length) {
      const empty = document.createElement('p');
      empty.className = 'ihm-palette-empty';
      empty.textContent = 'Aucune action ou dossier ne correspond à votre recherche.';
      listEl.append(empty);
      return;
    }

    let lastGroup = null;
    visibleCommands.forEach((cmd, idx) => {
      if (cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        const g = document.createElement('div');
        g.className = 'ihm-palette-group';
        g.textContent = cmd.group;
        listEl.append(g);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ihm-palette-item';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(idx === selectedIdx));

      const badge = document.createElement('span');
      badge.className = 'ihm-palette-badge';
      if (cmd.thumb) {
        const img = document.createElement('img');
        img.src = cmd.thumb;
        img.alt = '';
        img.onerror = () => { badge.textContent = cmd.icon || 'P'; };
        badge.append(img);
      } else {
        badge.textContent = cmd.icon || '→';
      }

      const text = document.createElement('span');
      text.className = 'ihm-palette-text';
      const title = document.createElement('span');
      title.className = 'ihm-palette-title';
      title.textContent = cmd.title;
      text.append(title);
      if (cmd.sub) {
        const sub = document.createElement('span');
        sub.className = 'ihm-palette-sub';
        sub.textContent = cmd.sub;
        text.append(sub);
      }

      const meta = document.createElement('span');
      meta.className = 'ihm-palette-meta';
      if (cmd.meta) meta.append(document.createTextNode(cmd.meta));
      if (cmd.shortcut) meta.append(makeKbd(cmd.shortcut));

      btn.append(badge, text, meta);
      btn.addEventListener('mouseenter', () => {
        selectedIdx = idx;
        updateSelection();
      });
      btn.addEventListener('click', () => executeCommand(cmd));
      listEl.append(btn);
    });
  }

  async function openPalette() {
    const dlg = ensurePalette();
    if (dlg.open) { dlg.close(); return; }
    lastFocused = document.activeElement;
    const page = currentPage();
    allCommands = buildContextCommands(page);
    inputEl.value = '';
    selectedIdx = 0;
    renderCommands('');
    dlg.showModal();
    inputEl.focus();

    const projects = await loadProjects();
    if (projects.length && dlg.open) {
      allCommands = [...buildProjectCommands(projects), ...buildContextCommands(page)];
      renderCommands(inputEl.value);
    }
  }

  // --- Guide des raccourcis clavier (?) ---
  let shortcutsDlg = null;
  function openShortcuts() {
    const page = currentPage();
    if (!shortcutsDlg) {
      const dlg = document.createElement('dialog');
      dlg.className = 'ihm-shortcuts-dlg';
      dlg.id = 'ihm-shortcuts-dlg';
      dlg.setAttribute('aria-label', 'Raccourcis clavier');
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      document.body.append(dlg);
      shortcutsDlg = dlg;
    }

    const common = [
      ['Ouvrir la palette de commandes', [MOD_KEY, 'K']],
      ['Ouvrir l’Assistant IA (streaming)', [MOD_KEY, 'J']],
      ['Afficher ce guide des raccourcis', ['?']],
      ['Fermer la fenêtre active', ['Échap']]
    ];
    const perPage = {
      studio: [
        ['Planche précédente / suivante', ['←', '→']],
        ['Mettre en pause / reprendre le défilement', ['Espace']],
        ['Agrandir la planche en plein écran', ['F']],
        ['Ouvrir l’index des dossiers', ['O']],
        ['Démarrer un nouveau projet', ['N']]
      ],
      editor: [
        ['Sélection / Mur ext. / Cloison', ['V', 'M', 'C']],
        ['Porte / Fenêtre / Passage / Pièce auto', ['D', 'F', 'B', 'W']],
        ['Calibrer l’échelle / Mobilier / Mesurer', ['K', 'E']],
        ['Annuler / Rétablir / Enregistrer', [`${MOD_KEY}+Z`, `${MOD_KEY}+Y`, `${MOD_KEY}+S`]],
        ['Pivoter un meuble (+15° / −15°)', ['R', 'Maj+R']]
      ],
      viewer: [
        ['Déplacement / Visite guidée', ['↑', '↓', 'Espace']],
        ['Ouvrir la palette rapide de navigation', [MOD_KEY, 'K']]
      ],
      accueil: [
        ['Naviguer rapidement vers l’éditeur ou la 3D', [MOD_KEY, 'K']]
      ]
    };

    const rows = [...(perPage[page] || []), ...common];
    shortcutsDlg.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ihm-shortcuts-head';
    const titles = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = 'Raccourcis clavier';
    const p = document.createElement('p');
    p.textContent = 'Pilotez l’atelier et vos dossiers sans quitter le clavier.';
    titles.append(h2, p);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ihm-shortcuts-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => shortcutsDlg.close());
    head.append(titles, closeBtn);

    const ul = document.createElement('ul');
    ul.className = 'ihm-shortcuts-grid';
    for (const [label, keys] of rows) {
      const li = document.createElement('li');
      const txt = document.createElement('span');
      txt.textContent = label;
      const kwrap = document.createElement('span');
      kwrap.className = 'ihm-shortcuts-keys';
      keys.forEach(k => kwrap.append(makeKbd(k)));
      li.append(txt, kwrap);
      ul.append(li);
    }

    shortcutsDlg.append(head, ul);
    if (!shortcutsDlg.open) shortcutsDlg.showModal();
  }

  // --- Liaison des boutons déclencheurs et injection non intrusive sur les autres vues ---
  function mountTriggers() {
    const existing = document.querySelectorAll('[data-cmd-trigger]');
    existing.forEach((btn) => {
      if (btn.dataset.cmdBound) return;
      btn.dataset.cmdBound = '1';
      btn.addEventListener('click', openPalette);
      const kbd = btn.querySelector('.ihm-kbd');
      if (kbd) kbd.textContent = `${MOD_KEY}K`;
    });

    if (existing.length) return;

    // Injection harmonieuse dans les barres existantes (editor.html, accueil.html)
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ihm-cmd-trigger ihm-cmd-trigger--compact';
    btn.setAttribute('data-cmd-trigger', '1');
    btn.setAttribute('aria-label', `Ouvrir la palette de commandes (${MOD_KEY}+K)`);
    btn.title = `Palette de commandes (${MOD_KEY}+K)`;
    btn.append(makeSearchIcon(''), document.createTextNode('Aller à…'), makeKbd(`${MOD_KEY}K`));
    btn.addEventListener('click', openPalette);

    const editorBar = document.querySelector('.ed-actions');
    const mastheadLinks = document.querySelector('.masthead-links');
    if (editorBar) {
      editorBar.append(btn);
    } else if (mastheadLinks) {
      mastheadLinks.append(btn);
    }
  }

  // --- Raccourcis globaux ---
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      void openPalette();
      return;
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openShortcuts();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountTriggers, { once: true });
  } else {
    mountTriggers();
  }

  window.__archicamIHM = { openPalette, openShortcuts };
})();
