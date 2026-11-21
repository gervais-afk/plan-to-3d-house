/** One project document; the legacy HTML entries supply inert markup, not a second application. */
(() => {
  const el = id => document.getElementById(id);
  const url = new URL(location.href);
  const context = window.PORTAL_CONTEXT;
  const targeted = Boolean(context?.decision);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const legacyGallery = url.searchParams.get('galerie') === '1';
  const cockpitEntry = !legacyGallery && !targeted && !url.hash && !url.searchParams.has('decision') && (context?.project || url.searchParams.get('project') || 'residence-verandas') === 'residence-verandas';
  const directVisit = cockpitEntry || targeted || url.pathname.endsWith('/index.html') || url.searchParams.has('decision') ||
    ['wp', 'variant', 'retours'].some(key => fragment.has(key));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const knownViews = ['cover', 'visit', 'dossier', 'estimate', 'gallery'];
  const common = ['motion', 'houseDataCore', 'viewOrder', 'costEstimate'];
  const viewer = ['icons', 'data', 'projectLoader', 'scene', 'variantState', 'solarStudy', 'realism', 'assets', 'presentationPlan',
    'renderStudio', 'scrollTour', 'walkController', 'minimap', 'clientFinishes', 'solarOptions', 'clientTools', 'clientVariants',
    'clientDecisions', 'clientFeedback', 'clientBrochure', 'planBook', 'app', 'presentMode'];
  const scripts = new Map();
  const status = el('workspace-status');
  let active = 'cover';
  let requestedView = directVisit ? 'visit' : legacyGallery ? 'gallery' : 'cover';
  let project = context?.project || url.searchParams.get('project') || '';
  let boot, markup;
  let viewerReady = false;
  let revision = 0;
  let scrollEntryEnabled = !directVisit && !legacyGallery;
  let visitPosition = 0;
  let openedFromGallery = false;
  history.scrollRestoration = 'manual';

  function script(src) {
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = src;
      node.onload = resolve;
      node.onerror = () => { node.remove(); reject(new Error(`Script indisponible : ${src}`)); };
      document.head.append(node);
    }).catch(error => { scripts.delete(src); throw error; }));
    return scripts.get(src);
  }
  async function load(names) {
    for (const name of names) await script(`js/${name}.js`);
  }
  async function documentAt(path) {
    const address = new URL(path, url);
    if (project) address.searchParams.set('project', project);
    const response = await fetch(address, { cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }
  function message(text) { status.textContent = text; status.hidden = !text; }

  async function mountCover() {
    if (targeted) return;
    if (!el('home-cover')) {
      const source = await documentAt('accueil.html');
      const content = source.getElementById('editorial-workspace');
      if (!content) throw new Error('Couverture indisponible');
      el('editorial-workspace').replaceChildren(...Array.from(content.children, node => document.importNode(node, true)));
    }
    // Start loading the project data after the static editorial content has appeared.
    if (active !== 'visit') message('');
    await load([...common, 'coverImage', 'home']);
    await window.ProjectCoverReady;
  }

  async function mountViewer() {
    if (!markup) {
      let template = el('viewer-template');
      if (!template) template = (await documentAt('index.html')).getElementById('viewer-template');
      if (!template) throw new Error('Interface de visite indisponible');
      const content = document.importNode(template.content, true);
      document.body.append(content);
      document.body.append(el('book-dialog')); // L’export peut s’ouvrir depuis le dossier, indépendamment du canvas.
      markup = el('visit-workspace');
      markup.hidden = active !== 'visit';
    }
    await load(common);
    const core = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const cdn = 'https://cdn.jsdelivr.net/npm/three@0.128.0/';
    await script(core).catch(() => script(`${cdn}build/three.min.js`));
    const extras = ['loaders/GLTFLoader.js', 'loaders/RGBELoader.js', 'environments/RoomEnvironment.js'];
    // Le plan et la scène de base restent utilisables si un module de réalisme est indisponible.
    await Promise.allSettled(extras.map(path => script(`${cdn}examples/js/${path}`)));
    await load(viewer);
    if (!window.startProjectViewer?.()) throw new Error('Le moteur 3D n’a pas démarré');
    viewerReady = true;
    document.body.dataset.viewerReady = '';
  }
  function ensureViewer() {
    if (!boot) boot = mountViewer().catch(error => { boot = null; throw error; });
    return boot;
  }
  function updateNav(view) {
    document.querySelectorAll('.workspace-nav [data-view]').forEach(link => {
      if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  function activate(view) {
    if (active === 'visit' && view !== 'visit') {
      document.dispatchEvent(new Event('workspace:leave-visit'));
      visitPosition = window.scrollY;
    }
    const lightbox = el('workspace-image-dialog');
    if (view !== 'gallery' && lightbox?.open) lightbox.close();
    active = view;
    document.body.dataset.workspaceView = view;
    if (markup) markup.hidden = view !== 'visit';
    updateNav(view);
    window.scrollTo({ top: view === 'visit' ? visitPosition : 0, behavior: 'instant' });
    if (view === 'cover') scrollEntryEnabled = true;
    if (view === 'visit' && viewerReady) document.dispatchEvent(new Event('workspace:enter-visit'));
  }
  async function open(view, { record = true, focus = true, animate = false, studio = false, reveal = false } = {}) {
    if (!knownViews.includes(view) || (targeted && view !== 'visit')) return;
    requestedView = view;
    const token = ++revision;
    if (record && view !== active) history.pushState({ projectView: view }, '');
    if (animate && active === 'cover' && view === 'visit' && !motion.matches) {
      // Use the project cover as the exit frame, before revealing the plan at progress zero.
      document.body.classList.add('workspace-leaving-cover');
      await new Promise(resolve => setTimeout(resolve, 170));
      document.body.classList.remove('workspace-leaving-cover');
      if (token !== revision) return;
    }
    if (view !== active) activate(view);
    else updateNav(view);
    message(view === 'visit' && !viewerReady ? 'Préparation de la maquette…' : '');
    if (view === 'visit') {
      try {
        await ensureViewer();
        if (token !== revision) return;
        // The lengthy first boot must not steal focus after a user switches tabs.
        message('');
        if (focus) el('webgl-container').focus({ preventScroll: true });
        if (studio) el('btn-renders').click();
        if (reveal) document.dispatchEvent(new Event('workspace:reveal-visit'));
      } catch (error) {
        if (token !== revision) return;
        if (studio) openedFromGallery = false;
        message('La maquette 3D ne peut pas démarrer. Le dossier et les plans restent accessibles.');
        console.error(error);
      }
    } else if (focus) {
      const heading = el({ cover: 'home-cover', dossier: 'dossier-title', estimate: 'estimate-title', gallery: 'gallery-title' }[view]);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }

  window.ProjectWorkspace = {
    setProject(slug) {
      project = slug;
      if (url.pathname === '/' && new URL(location.href).searchParams.get('project') !== slug && !directVisit) {
        const target = new URL(location.href);
        target.searchParams.set('project', slug);
        history.replaceState(history.state, '', target);
      }
    },
    isVisit: () => active === 'visit',
    open
  };

  document.addEventListener('click', event => {
    const link = event.target.closest?.('[data-view]');
    if (link && !targeted && !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      scrollEntryEnabled = false;
      void open(link.dataset.view, { animate: true, reveal: link.id === 'cover-enter' || Boolean(link.closest('#workspace-scroll-entry')) });
    }
    if (event.target.closest?.('#workspace-studio')) {
      openedFromGallery = true;
      void open('visit', { studio: true });
    }
    if (event.target.closest?.('#workspace-book')) {
      const button = el('workspace-book');
      button.disabled = true;
      message('Préparation du cahier de plans…');
      const preparedFor = revision;
      ensureViewer().then(() => { if (preparedFor === revision) { message(''); el('book-open').click(); } }).catch(error => {
        message('Impossible de préparer le cahier A3. L’aperçu A4 reste disponible.');
        console.error(error);
      }).finally(() => { button.disabled = false; });
    }
  });
  window.addEventListener('popstate', event => {
    scrollEntryEnabled = false;
    void open(event.state?.projectView || (directVisit ? 'visit' : 'cover'), { record: false });
  });
  window.addEventListener('scroll', () => {
    const entry = el('workspace-scroll-entry');
    if (!scrollEntryEnabled || requestedView !== 'cover' || window.scrollY < 16 || !entry) return;
    if (entry.getBoundingClientRect().top > innerHeight - 70) return;
    scrollEntryEnabled = false;
    void open('visit', { animate: true, focus: false, reveal: true });
  }, { passive: true });
  document.addEventListener('workspace:close-studio', event => {
    if (!openedFromGallery) return;
    openedFromGallery = false;
    if (event.detail?.backToGallery && active === 'visit') history.back();
  });

  history.replaceState({ projectView: requestedView }, '');
  if (directVisit) void open('visit', { record: false, focus: false, studio: legacyGallery, reveal: cockpitEntry });
  mountCover().then(() => {
    if (!targeted && !directVisit && requestedView !== 'visit' && legacyGallery) return open('gallery', { record: false, focus: false });
    if (!targeted && !el('home-cover')) return;
    updateNav(active);
  }).catch(error => {
    message('Le dossier n’a pas pu être chargé. Réessayez ou ouvrez la maquette directement.');
    console.error(error);
  });
})();
