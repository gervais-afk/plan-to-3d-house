/**
 * ArchiCam Studio — Assistant Chat IA Flottant & Copilote Agent (js/aiAssistant.js)
 * - Mode flottant déplaçable + bascule Ancré/Flottant + bulle flottante toujours accessible (⌘J / Ctrl+J)
 * - Streaming SSE temps réel via /api/ai/assistant avec contexte projet, surfaces, bioclimatique & budget
 * - Actions agent exécutables (liste blanche stricte) dans l’application
 * - Dictée vocale (Web Speech API) + Lecture vocale Gemini TTS (/api/ai/assistant-tts)
 * - Capture 2D/3D en 1 clic + glisser-déposer / import d’images d’inspiration et croquis
 * - Copie & export livrable (.md) sur chaque réponse — DOM natif 100 % sécurisé
 */
(() => {
  if (window.__archicamAssistant) return;

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  const MOD_KEY = isMac ? '⌘' : 'Ctrl';
  const MODE_KEY = 'archicam_ai_mode_v1';
  const POS_KEY = 'archicam_ai_pos_v1';
  const PIPELINE_KEY = 'archicam_ai_pending_pipeline_v1';

  function detectPage() {
    const p = (location.pathname || '').toLowerCase();
    if (p.endsWith('editor.html')) return 'editor';
    if (p.endsWith('accueil.html')) return 'accueil';
    if (p.endsWith('index.html')) return 'viewer';
    if (p.endsWith('portal.html')) return 'portal';
    return 'studio';
  }

  function detectProjectSlug() {
    try {
      const qs = new URLSearchParams(location.search).get('project');
      if (qs) return qs.trim();
      if (window.PORTAL_CONTEXT?.project) return String(window.PORTAL_CONTEXT.project).trim();
      return (localStorage.getItem('lastProject') || '').trim();
    } catch {
      return '';
    }
  }

  function isClientPortalMode() {
    return Boolean(window.PORTAL_CONTEXT && window.PORTAL_CONTEXT.role && window.PORTAL_CONTEXT.role !== 'architect');
  }

  function getCompactLiveProject() {
    if (isClientPortalMode() || detectPage() !== 'editor') return null;
    const api = window.EditorAPI;
    if (!api || typeof api.toProjectJson !== 'function') return null;
    try {
      const raw = api.toProjectJson();
      if (!raw || typeof raw !== 'object') return null;
      const cfg = raw.config && typeof raw.config === 'object' ? { ...raw.config } : {};
      if (cfg.planImage && typeof cfg.planImage === 'object') {
        const pi = { ...cfg.planImage };
        if (typeof pi.url === 'string' && pi.url.startsWith('data:')) delete pi.url;
        cfg.planImage = pi;
      }
      if (cfg.planImages && typeof cfg.planImages === 'object') {
        const cleanedMap = {};
        for (const [k, v] of Object.entries(cfg.planImages)) {
          if (v && typeof v === 'object') {
            const cp = { ...v };
            if (typeof cp.url === 'string' && cp.url.startsWith('data:')) delete cp.url;
            cleanedMap[k] = cp;
          }
        }
        cfg.planImages = cleanedMap;
      }
      return {
        meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
        config: cfg,
        walls: Array.isArray(raw.walls) ? raw.walls.slice(0, 300) : [],
        rooms: Array.isArray(raw.rooms) ? raw.rooms.slice(0, 80) : [],
        canopies: Array.isArray(raw.canopies) ? raw.canopies.slice(0, 40) : [],
        columns: Array.isArray(raw.columns) ? raw.columns.slice(0, 80) : [],
        furniture: Array.isArray(raw.furniture) ? raw.furniture.slice(0, 200) : []
      };
    } catch {
      return null;
    }
  }

  function collectLiveContext() {
    const page = detectPage();
    const ctx = { page };
    if (page === 'editor') {
      const txt = id => (document.getElementById(id)?.textContent || '').trim();
      const activeTool = document.querySelector('[data-tool].is-active, [data-tool][aria-pressed="true"]');
      const activeFloor = document.querySelector('[data-floor].is-active, [data-floor][aria-pressed="true"]');
      if (activeTool) ctx.tool = (activeTool.textContent || activeTool.getAttribute('data-tool') || '').trim().slice(0, 40);
      if (activeFloor) ctx.floor = (activeFloor.textContent || '').trim().slice(0, 40);
      const walls = txt('stat-walls');
      const openings = txt('stat-openings');
      const rooms = txt('stat-rooms');
      const area = txt('stat-area');
      if (walls || openings || rooms || area) ctx.liveStats = { walls, openings, rooms, area };
      const liveProject = getCompactLiveProject();
      if (liveProject && (liveProject.walls.length || liveProject.rooms.length)) {
        ctx.liveProject = liveProject;
      }
    }
    return ctx;
  }

  function storageKey(slug) {
    return `archicam_ai_chat_v1:${slug || 'atelier'}`;
  }

  function loadHistory(slug) {
    try {
      const raw = sessionStorage.getItem(storageKey(slug));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-24) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(slug, msgs) {
    try {
      const light = msgs.slice(-24).map(m => ({ role: m.role, text: m.text }));
      sessionStorage.setItem(storageKey(slug), JSON.stringify(light));
    } catch { /* quota */ }
  }

  // --- Listes blanches strictes des paramètres autorisés ---
  const ALLOWED_AMBIANCES = new Set(['origin', 'pierre-chaux', 'beton-bois', 'villa-tropicale']);
  const ALLOWED_FLOOR_FINISHES = new Set(['', 'oak', 'tile', 'concrete']);
  const ALLOWED_FACADE_FINISHES = new Set(['', 'plaster', 'timber', 'stone']);
  const ALLOWED_TOOLS = new Set([
    'select', 'calibrate', 'wall-ext', 'wall-int', 'door', 'window', 'open',
    'room-auto', 'room', 'room-poly', 'column', 'slab', 'stairwell', 'pergola',
    'furniture', 'camera', 'annotate', 'measure'
  ]);
  const ALLOWED_TEMPLATES = new Set(['villa-f4', 'studio', 'villa-serena']);
  const ALLOWED_PHASES = new Set(['ESQ', 'APS', 'APD', 'PC', 'DCE', 'EXE']);

  function buildCrossPageUrl(pageFile, slug, actionId, param) {
    const targetSlug = slug || detectProjectSlug();
    const qs = new URLSearchParams();
    if (targetSlug) qs.set('project', targetSlug);
    if (actionId) qs.set('autoAction', actionId);
    if (param) qs.set('autoParam', String(param).slice(0, 80));
    const q = qs.toString();
    return q ? `${pageFile}?${q}` : pageFile;
  }

  // --- Helpers d'exécution sûre sur Éditeur 2D/3D, Visite 3D & Fiche Projet ---
  function triggerEditorButton(btnId, actionId, slug, param) {
    const btn = document.getElementById(btnId);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    if (detectPage() !== 'editor') {
      location.href = buildCrossPageUrl('editor.html', slug, actionId, param);
      return true;
    }
    return false;
  }

  function triggerEditorAdvancedButton(btnId, actionId, slug) {
    if (detectPage() !== 'editor') {
      location.href = buildCrossPageUrl('editor.html', slug, actionId);
      return true;
    }
    const dlg = document.getElementById('dlg-advanced');
    const openBtn = document.getElementById('btn-advanced');
    if (dlg && !dlg.open && openBtn) openBtn.click();
    const target = document.getElementById(btnId);
    if (target && !target.disabled) {
      setTimeout(() => target.click(), 60);
      return true;
    }
    return Boolean(openBtn);
  }

  function triggerAccueilButton(selector, actionId, slug) {
    if (detectPage() !== 'accueil') {
      location.href = buildCrossPageUrl('accueil.html', slug, actionId);
      return true;
    }
    const el = document.querySelector(selector);
    if (el && !el.disabled) {
      el.click();
      return true;
    }
    return false;
  }

  function ensureViewerEntered() {
    const visit = document.getElementById('visit-workspace');
    if (visit && !visit.hidden) return true;
    const enter = document.getElementById('cover-enter');
    if (enter) {
      enter.click();
      return true;
    }
    return Boolean(visit);
  }

  function triggerViewerControl(applyFn, actionId, slug, param) {
    if (detectPage() !== 'viewer') {
      location.href = buildCrossPageUrl('index.html', slug, actionId, param);
      return true;
    }
    ensureViewerEntered();
    if (applyFn()) return true;
    let tries = 0;
    const retry = () => {
      if (applyFn()) return;
      if (++tries < 20) setTimeout(retry, 250);
    };
    setTimeout(retry, 250);
    return true;
  }

  function clickViewerButton(btnId, actionId, slug) {
    return triggerViewerControl(() => {
      const btn = document.getElementById(btnId);
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    }, actionId, slug);
  }

  // --- Exécution de la passe de sécurité documentaire & cartouche explicite (architecte) ---
  async function runDocumentSafetyPass(rawSlug, extraOpts = null) {
    if (isClientPortalMode()) return false;
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    if (!slug) {
      pushSystemAssistantMessage(
        'Aucun dossier projet n’est actuellement ouvert. Ouvrez d’abord un projet pour lancer la sécurisation des documents PDF.\n\n[[ACTION:open_index|Ouvrir un dossier]]'
      );
      return false;
    }

    try {
      const payload = {
        mode: 'resolve',
        applyCartouche: true,
        enforceDeliverableGate: true,
        ...(extraOpts && typeof extraOpts === 'object' ? extraOpts : {})
      };
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/document-safety`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        pushSystemAssistantMessage(`Sécurisation interrompue : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }

      window.dispatchEvent(new CustomEvent('archicam:document-safety-resolved', { detail: data }));

      const lines = [`**Contrôle & sécurisation des documents — ${data.projectName || slug}**`];
      if (Array.isArray(data.resolved) && data.resolved.length) {
        lines.push('\n**Résolu automatiquement par le dispositif :**');
        for (const item of data.resolved) lines.push(`- ${item}`);
      } else {
        lines.push('\n- Aucune correction automatique supplémentaire n’était nécessaire : le profil cabinet, les métadonnées et le verrou Porte E sont déjà propres.');
      }

      if (Array.isArray(data.remaining) && data.remaining.length) {
        lines.push('\n**Reste sous validation explicite de l’architecte (non inventé / non contourné) :**');
        for (const item of data.remaining) lines.push(`- ${item}`);
      } else {
        lines.push('\n- Tous les contrôles cartouche, Porte E et conformité vérifiés sont au vert.');
      }

      if (Array.isArray(data.readyGenerators) && data.readyGenerators.length) {
        lines.push('\n**État des générateurs de documents :**');
        for (const gen of data.readyGenerators) {
          lines.push(`- **${gen.label}** : ${gen.ready ? 'Prêt' : 'En attente'} — ${gen.note}`);
        }
      }

      const actionTags = [];
      if (data.missingCartouche?.length) actionTags.push('[[ACTION:open_project_info|Compléter le cartouche PDF]]');
      const readyIds = new Set((data.readyGenerators || []).filter(g => g.ready).map(g => g.id));
      if (readyIds.has('generate_aps')) actionTags.push('[[ACTION:generate_aps|Générer APS Auto PDF]]');
      if (readyIds.has('generate_apd')) actionTags.push('[[ACTION:generate_apd|Ouvrir Dossier APD / Permis]]');
      if (readyIds.has('generate_catalog')) actionTags.push('[[ACTION:generate_catalog|Catalogue Premium PDF]]');
      if (actionTags.length) lines.push('\n' + actionTags.slice(0, 3).join('\n'));

      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Impossible d’exécuter le contrôle sécurité serveur : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  function parseCartoucheParam(paramStr) {
    const out = {};
    const pairs = String(paramStr || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx <= 0) continue;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k === 'phase' && ALLOWED_PHASES.has(v.toUpperCase())) {
        out.phase = v.toUpperCase();
      } else if (k === 'revision' && /^[A-Z0-9._-]{1,16}$/i.test(v)) {
        out.revision = v;
      } else if (k === 'issueDate') {
        if (v.toLowerCase() === 'today') out.issueDate = new Date().toISOString().slice(0, 10);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out.issueDate = v;
      } else if (k === 'clientVisible' && (v === 'true' || v === 'false')) {
        out.clientVisible = v === 'true';
      }
    }
    return out;
  }

  async function saveRevisionSnapshot(rawSlug, customLabel) {
    if (isClientPortalMode()) return false;
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    if (!slug) {
      pushSystemAssistantMessage('Ouvrez un dossier projet avant d’enregistrer une révision datée.');
      return false;
    }
    try {
      const projRes = await fetch(`projects/${encodeURIComponent(slug)}/project.json`, { cache: 'no-store' });
      if (!projRes.ok) throw new Error(`Impossible de lire le dossier (${projRes.status})`);
      const snapshot = await projRes.json();
      const label = String(customLabel || '').trim().slice(0, 80) || 'Instantané enregistré via Assistant IA';
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          note: 'Enregistrement déclenché depuis l’Assistant IA',
          snapshot
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) throw new Error(data.error || `Erreur HTTP ${res.status}`);
      const tag = data.item.tag || data.item.version || 'V?';
      pushSystemAssistantMessage(
        `**Révision ${tag} enregistrée** pour **${slug}** (${data.item.label || label}).\n\n[[ACTION:open_revisions|Ouvrir le journal des révisions]]`
      );
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Échec de l’enregistrement de révision : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  // --- Conception générative, Patch naturel, Auto-fix PMR/RE2020, Éditorial & Variantes A/B ---
  let pendingGeneratedPlan = null;
  let pendingPlanPatch = null;
  let pendingComplianceFix = null;
  let pendingEditorialDraft = null;

  function applyProjectToEditorWithUndo(nextProject, toastText) {
    const api = window.EditorAPI;
    if (!api || !api.S || typeof api.loadProject !== 'function') return false;
    const prevUndo = Array.isArray(api.S.undo) ? api.S.undo.slice() : [];
    const prevSnap = api.S.p ? JSON.stringify(api.S.p) : null;
    api.loadProject(nextProject, { keepExtras: true });
    if (prevSnap) {
      prevUndo.push(prevSnap);
      if (prevUndo.length > 120) prevUndo.shift();
    }
    api.S.undo = prevUndo;
    api.S.redo = [];
    api.S.dirty = true;
    if (typeof api.fitView === 'function') api.fitView();
    if (typeof api.toast === 'function') api.toast(toastText || 'Plan mis à jour par ArchiCam AI (Ctrl+Z pour annuler)');
    window.dispatchEvent(new CustomEvent('archicam:ai-plan-applied', { detail: { project: nextProject } }));
    return true;
  }

  async function runGeneratePlanBriefFlow(briefParam) {
    if (isClientPortalMode()) return false;
    const brief = String(briefParam || '').trim();
    if (!brief) {
      if (textareaEl) {
        textareaEl.value = 'Génère un plan : Villa plain-pied 140 m² à Douala, 3 chambres, séjour-cuisine, bureau et véranda';
        textareaEl.style.height = 'auto';
        textareaEl.style.height = `${Math.min(126, textareaEl.scrollHeight)}px`;
        textareaEl.focus();
      }
      pushSystemAssistantMessage(
        'Décrivez votre programme dans la zone de saisie (surface, nombre de chambres, véranda, bureau, ville…) ou lancez directement un premier modèle de test :\n\n[[ACTION:generate_plan_brief:Villa plain-pied 140 m2 a Douala 3 chambres bureau veranda|Générer Villa 140 m² (3 ch. + véranda)]]'
      );
      return true;
    }
    try {
      const res = await fetch('api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.project) {
        pushSystemAssistantMessage(`Génération de plan impossible : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }
      pendingGeneratedPlan = { brief, project: data.project, summary: data.summary };
      const sum = data.summary || {};
      const roomList = (data.project.rooms || [])
        .map(r => `${r.name}${r.area ? ` (${r.area} m²)` : ''}`)
        .slice(0, 12)
        .join(', ');
      const lines = [
        `**Avant-projet généré — ${data.project.meta?.name || 'Nouveau projet'}**`,
        `- **Emprise** : ${sum.width || '—'} × ${sum.depth || '—'} m · **${sum.habitableM2 || '—'} m² habitables**${sum.annexM2 ? ` + ${sum.annexM2} m² annexes` : ''}`,
        `- **Structure** : ${sum.walls || 0} murs (HSP ${data.project.config?.wallHeight || 2.8} m), ${sum.openings || 0} ouvertures (portes PMR ≥ 0,90 m & baies RE2020)`,
        roomList ? `- **Pièces** : ${roomList}` : '',
        '\nValidez pour charger cette esquisse 2D + 3D directement dans l’éditeur (annulable avec **Ctrl+Z**) :',
        '[[ACTION:confirm_load_generated_plan|Charger ce plan dans l’éditeur 2D/3D]]'
      ].filter(Boolean);
      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Erreur lors de la génération du plan : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function confirmLoadGeneratedPlan() {
    if (isClientPortalMode() || !pendingGeneratedPlan?.project) {
      pushSystemAssistantMessage('Aucun plan généré en attente. Décrivez d’abord un programme pour générer un avant-projet.');
      return false;
    }
    const { brief, project } = pendingGeneratedPlan;
    if (detectPage() === 'editor' && window.EditorAPI) {
      const ok = applyProjectToEditorWithUndo(project, 'Avant-projet chargé dans l’éditeur (Ctrl+Z pour annuler)');
      if (ok) {
        pendingGeneratedPlan = null;
        pushSystemAssistantMessage(
          '**Plan 2D + maquette 3D chargés dans l’éditeur.** Utilisez **Ctrl+Z** à tout moment pour revenir au tracé précédent.\n\n[[ACTION:auto_furnish|Meubler automatiquement]]\n[[ACTION:view_split|Passer en vue 2D + 3D]]'
        );
      }
      return ok;
    }
    // Hors éditeur (accueil / studio / visite 3D) : crée le dossier sur le serveur et ouvre l'éditeur
    try {
      const res = await fetch('api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, saveAsNew: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.savedSlug) {
        throw new Error(data.error || `Erreur HTTP ${res.status}`);
      }
      pendingGeneratedPlan = null;
      location.href = `editor.html?project=${encodeURIComponent(data.savedSlug)}`;
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Impossible de créer le nouveau dossier : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function runPlanPatchFlow(rawSlug, instructionParam) {
    if (isClientPortalMode()) return false;
    const instruction = String(instructionParam || '').trim();
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    const liveProject = getCompactLiveProject();
    if (!instruction) {
      pushSystemAssistantMessage('Précisez la modification souhaitée (ex. « Passe la hauteur sous plafond à 3,10 m », « Ajoute une pergola 4×3 m », « Agrandis les fenêtres de 25 % »).');
      return false;
    }
    if (!liveProject && !slug) {
      pushSystemAssistantMessage('Ouvrez un dossier ou tracez un plan dans l’éditeur avant d’appliquer une modification géométrique.');
      return false;
    }
    try {
      const res = await fetch('api/ai/plan-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: liveProject || undefined, slug: slug || undefined, instruction })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        pushSystemAssistantMessage(`Modification non préparée : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }
      if (data.noOp || !Array.isArray(data.changes) || !data.changes.length) {
        pushSystemAssistantMessage(`Aucune modification géométrique directe détectée pour « ${instruction} ». Essayez une valeur précise (hauteur sous plafond, pergola L×P, élargir portes PMR, agrandir fenêtres, renommer une pièce ou style de toiture).`);
        return false;
      }
      pendingPlanPatch = { slug, patchedProject: data.patchedProject, changes: data.changes };
      const lines = [
        '**Aperçu de la modification du plan**',
        ...data.changes.map(c => `- ${c}`),
        '\nConfirmez pour appliquer directement sur la maquette 2D/3D (**Ctrl+Z** conservé) :',
        '[[ACTION:confirm_apply_plan_patch|Appliquer sur le plan (Ctrl+Z)]]'
      ];
      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Impossible de calculer la modification : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function confirmApplyPlanPatch() {
    if (isClientPortalMode() || !pendingPlanPatch?.patchedProject) {
      pushSystemAssistantMessage('Aucune modification de plan en attente de confirmation.');
      return false;
    }
    const { slug, patchedProject } = pendingPlanPatch;
    if (detectPage() === 'editor' && window.EditorAPI) {
      const ok = applyProjectToEditorWithUndo(patchedProject, 'Modification appliquée par ArchiCam AI (Ctrl+Z pour annuler)');
      if (ok) {
        pendingPlanPatch = null;
        pushSystemAssistantMessage('**Modification appliquée dans l’éditeur 2D/3D.** Utilisez **Ctrl+Z** pour annuler ou enregistrez le dossier.\n\n[[ACTION:save_project|Enregistrer le dossier]]');
      }
      return ok;
    }
    if (!slug) {
      pushSystemAssistantMessage('Ouvrez l’éditeur 2D/3D pour appliquer cette modification sur un brouillon.');
      return false;
    }
    try {
      const res = await fetch('api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, project: patchedProject })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
      pendingPlanPatch = null;
      pushSystemAssistantMessage(
        `**Modification enregistrée sur le dossier ${slug}.**\n\n[[ACTION:view_2d|Ouvrir dans l’éditeur 2D/3D]]\n[[ACTION:view_3d|Voir la visite 3D]]`
      );
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Échec de l’application sur le dossier : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function runComplianceAutoFixFlow(rawSlug) {
    if (isClientPortalMode()) return false;
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    if (!slug) {
      pushSystemAssistantMessage('Ouvrez un dossier projet avant de lancer la correction automatique PMR / RE2020.');
      return false;
    }
    try {
      const liveProject = getCompactLiveProject();
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/compliance-autofix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: liveProject || undefined, apply: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        pushSystemAssistantMessage(`Analyse PMR / RE2020 impossible : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }
      if (!data.fixedCount) {
        const m = data.after || {};
        pushSystemAssistantMessage(
          `**Conformité PMR / RE2020 — ${slug} : aucune correction géométrique requise.**\n- Hauteur sous plafond : **${m.wallHeight ?? '—'} m** (min. 2,20 m)\n- Portes < 0,90 m : **${m.narrowDoors ?? 0}**\n- Ratio vitrage RE2020 : **${m.glazingRatioPct ?? '—'} %** (cible ≥ 16,7 %)`
        );
        return true;
      }
      pendingComplianceFix = { slug, patchedProject: data.patchedProject, fixes: data.fixes, before: data.before, after: data.after };
      const lines = [
        `**Correction automatique PMR / RE2020 prête — ${slug}**`,
        `- **Avant** : HSP ${data.before?.wallHeight ?? '—'} m · ${data.before?.narrowDoors ?? 0} porte(s) < 0,90 m · vitrage ${data.before?.glazingRatioPct ?? '—'} %`,
        `- **Après** : HSP ${data.after?.wallHeight ?? '—'} m · ${data.after?.narrowDoors ?? 0} porte(s) < 0,90 m · vitrage ${data.after?.glazingRatioPct ?? '—'} %`,
        '\n**Corrections proposées :**',
        ...(data.fixes || []).map(f => `- ${f}`),
        '\n[[ACTION:confirm_apply_compliance_fix|Appliquer les corrections PMR / RE2020]]'
      ];
      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Impossible d’analyser la conformité : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function confirmApplyComplianceFix() {
    if (isClientPortalMode() || !pendingComplianceFix?.patchedProject) {
      pushSystemAssistantMessage('Aucune correction PMR / RE2020 en attente.');
      return false;
    }
    const { slug, patchedProject } = pendingComplianceFix;
    if (detectPage() === 'editor' && window.EditorAPI) {
      const ok = applyProjectToEditorWithUndo(patchedProject, 'Corrections PMR / RE2020 appliquées (Ctrl+Z pour annuler)');
      if (ok) {
        pendingComplianceFix = null;
        pushSystemAssistantMessage('**Corrections PMR & RE2020 appliquées sur le plan actif** (annulables avec **Ctrl+Z**).\n\n[[ACTION:save_project|Enregistrer le dossier]]\n[[ACTION:run_compliance|Relancer le contrôle complet]]');
      }
      return ok;
    }
    try {
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/compliance-autofix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
      pendingComplianceFix = null;
      pushSystemAssistantMessage(`**Corrections PMR / RE2020 enregistrées dans ${slug}.**\n\n[[ACTION:view_2d|Vérifier dans l’éditeur 2D/3D]]`);
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Échec de l’enregistrement des corrections : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function runEditorialBriefFlow(rawSlug) {
    if (isClientPortalMode()) return false;
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    if (!slug) {
      pushSystemAssistantMessage('Ouvrez un dossier projet pour rédiger et injecter son sous-titre, son parti architectural et sa description.');
      return false;
    }
    try {
      const liveProject = getCompactLiveProject();
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/editorial-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', project: liveProject || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.draft) {
        pushSystemAssistantMessage(`Rédaction éditoriale impossible : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }
      pendingEditorialDraft = { slug, draft: data.draft };
      const lines = [
        `**Proposition éditoriale prête pour ${slug}**`,
        `- **Sous-titre** : ${data.draft.subtitle || '—'}`,
        `- **Parti architectural** : ${data.draft.parti || '—'}`,
        `- **Description** : ${data.draft.description || '—'}`,
        '\n*Les mentions légales du cartouche (maître d’ouvrage, localisation, phase, indice, date) ne sont jamais modifiées.*',
        '\n[[ACTION:confirm_inject_editorial_brief|Injecter dans le dossier & les PDF]]'
      ];
      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Impossible de préparer la notice éditoriale : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function confirmInjectEditorialBrief() {
    if (isClientPortalMode() || !pendingEditorialDraft?.draft) {
      pushSystemAssistantMessage('Aucun texte éditorial en attente d’injection.');
      return false;
    }
    const { slug, draft } = pendingEditorialDraft;
    try {
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/editorial-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', draft })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);

      // Synchronise immédiatement l'éditeur en mémoire si ouvert sur ce dossier
      const api = window.EditorAPI;
      if (detectPage() === 'editor' && api?.S?.p) {
        if (typeof api.commit === 'function') api.commit();
        if (!api.S.p.meta || typeof api.S.p.meta !== 'object') api.S.p.meta = {};
        if (draft.subtitle) api.S.p.meta.subtitle = draft.subtitle;
        if (draft.parti) api.S.p.meta.parti = draft.parti;
        if (draft.description) api.S.p.meta.description = draft.description;
        if (typeof api.refreshPanel === 'function') api.refreshPanel();
        if (typeof api.draw === 'function') api.draw();
        if (typeof api.toast === 'function') api.toast('Sous-titre, parti architectural et description injectés');
      }

      pendingEditorialDraft = null;
      pushSystemAssistantMessage(
        `**Textes éditoriaux injectés dans ${slug}.** Ils alimenteront immédiatement la page de couverture, l’APS Auto PDF et le dossier APD.\n\n[[ACTION:generate_aps|Générer APS Auto PDF]]\n[[ACTION:generate_catalog|Catalogue Premium PDF]]`
      );
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Échec de l’injection éditoriale : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  async function runCreateAbVariantsFlow(rawSlug) {
    if (isClientPortalMode()) return false;
    const slug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    if (!slug) {
      pushSystemAssistantMessage('Ouvrez un dossier projet avant de créer automatiquement les Variantes A et B.');
      return false;
    }
    try {
      const liveProject = getCompactLiveProject();
      const res = await fetch(`api/projects/${encodeURIComponent(slug)}/generate-ab-variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: liveProject || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        pushSystemAssistantMessage(`Création des variantes A/B impossible : ${data.error || `erreur HTTP ${res.status}`}.`, true);
        return false;
      }
      const mA = data.variantA?.metrics || {};
      const mB = data.variantB?.metrics || {};
      const delta = data.delta || {};
      const sign = (delta.budgetFCFA || 0) >= 0 ? '+' : '';
      const lines = [
        `**Variantes A & B créées et enregistrées — ${slug}**`,
        `- **${data.variantA?.label || 'Variante A'}** : ${mA.habitableM2 ?? '—'} m² hab., HSP ${mA.wallHeight ?? '—'} m · **~${Math.round(mA.budgetFCFA || 0).toLocaleString('fr-FR')} FCFA**`,
        `- **${data.variantB?.label || 'Variante B'}** : ${mB.habitableM2 ?? '—'} m² hab.${mB.annexM2 ? ` + ${mB.annexM2} m² annexes` : ''}, HSP ${mB.wallHeight ?? '—'} m · **~${Math.round(mB.budgetFCFA || 0).toLocaleString('fr-FR')} FCFA**`,
        `- **Écart B vs A** : **${sign}${Math.round(delta.budgetFCFA || 0).toLocaleString('fr-FR')} FCFA** (${sign}${delta.budgetPct ?? 0} %)${delta.wallHeightDeltaM ? ` · HSP +${delta.wallHeightDeltaM} m` : ''}`,
        '\n[[ACTION:open_variants|Ouvrir le Comparateur A / B]]\n[[ACTION:open_meeting|Présenter en mode Réunion]]'
      ];
      pushSystemAssistantMessage(lines.join('\n'));
      return true;
    } catch (err) {
      pushSystemAssistantMessage(`Erreur lors de la création des variantes A/B : ${err.message || 'erreur réseau'}.`, true);
      return false;
    }
  }

  // --- Orchestrateur Chaîne Complète : Conception 2D/3D → Meublage → Conformité/Notice → Enregistrement → Sécurité/Cartouche → APS + Devis + Cahier A3 + Catalogue ---
  function sleepMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Les modules d'export (costEstimate.js, xlsxExport.js, planBook.js) déclarent leur API en `const`
  // de portée globale : la liaison est lexicale et ne crée aucune propriété sur `window`.
  // On résout donc d'abord l'identifiant global, puis, à défaut, la propriété de `window`.
  const GLOBAL_LIB_RESOLVERS = {
    CostEstimate: () => (typeof CostEstimate !== 'undefined' ? CostEstimate : null),
    XlsxExport: () => (typeof XlsxExport !== 'undefined' ? XlsxExport : null),
    PlanBook: () => (typeof PlanBook !== 'undefined' ? PlanBook : null)
  };

  function resolveGlobalLib(name) {
    const resolver = GLOBAL_LIB_RESOLVERS[name];
    if (resolver) {
      try {
        const lexical = resolver();
        if (lexical) return lexical;
      } catch { /* liaison globale non déclarée sur cette page */ }
    }
    try {
      return (typeof window !== 'undefined' && window[name]) || null;
    } catch {
      return null;
    }
  }

  function makePipelineSlug(project, fallbackSlug) {
    const raw = String(fallbackSlug || project?.meta?.slug || project?.meta?.name || 'projet-atelier')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return raw || `projet-${Date.now().toString(36).slice(-5)}`;
  }

  function openStudioPipelineCard(rawSlug, briefParam = '', opts = {}) {
    if (isClientPortalMode()) return false;
    const initialSlug = (rawSlug || activeSlug || detectProjectSlug() || '').trim();
    const initialBrief = String(briefParam || '').trim();
    const defaultOutputs = {
      aps: opts.outputs?.aps !== false,
      estimate: opts.outputs?.estimate !== false,
      planbook: opts.outputs?.planbook !== false,
      catalog: opts.outputs?.catalog !== false,
      // Le dossier APD / Permis reste décoché par défaut : il suppose toutes les pièces PC-01 → PC-08 réunies.
      apd: opts.outputs?.apd === true
    };

    // Si hors éditeur 2D/3D : bascule directement vers l'onglet Conception avec reprise automatique
    if (detectPage() !== 'editor') {
      try {
        sessionStorage.setItem(PIPELINE_KEY, JSON.stringify({
          brief: initialBrief,
          outputs: defaultOutputs,
          autoStart: Boolean(opts.autoStart || initialBrief)
        }));
      } catch { /* ignore */ }
      location.href = buildCrossPageUrl('editor.html', initialSlug, 'run_studio_pipeline');
      return true;
    }

    ensureDrawer();
    if (!isOpen) openDrawer();

    // Si le fil est encore sur l'écran d'accueil, on garde un espace propre au-dessus de la carte
    const existingWelcome = messagesEl?.querySelector('.ai-chat-welcome');
    if (existingWelcome) existingWelcome.remove();

    const card = document.createElement('section');
    card.className = 'ai-pipeline-card';
    card.setAttribute('aria-label', 'Chaîne complète ArchiCam AI');

    const head = document.createElement('div');
    head.className = 'ai-pipeline-head';
    const titleWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Chaîne complète — Conception → Dossier';
    const sub = document.createElement('span');
    sub.className = 'ai-pipeline-sub';
    sub.textContent = 'Trace dans l’éditeur, meuble, sécurise puis génère APS, Devis (PDF + Excel), Cahier A3, Catalogue et Dossier APD.';
    titleWrap.append(title, sub);
    const undoBadge = document.createElement('span');
    undoBadge.className = 'ai-pipeline-badge';
    undoBadge.textContent = 'Ctrl+Z';
    head.append(titleWrap, undoBadge);

    const briefInput = document.createElement('textarea');
    briefInput.className = 'ai-pipeline-brief';
    briefInput.rows = 2;
    briefInput.value = initialBrief;
    briefInput.placeholder = 'Brief programme (ex. Villa plain-pied 140 m² à Douala, 3 chambres, bureau et véranda) — laissez vide pour traiter le plan actif';

    const outputsRow = document.createElement('div');
    outputsRow.className = 'ai-pipeline-outputs';
    const outputDefs = [
      { key: 'aps', label: 'APS Auto PDF' },
      { key: 'estimate', label: 'Devis & Métré (PDF + .xlsx)' },
      { key: 'planbook', label: 'Cahier A3 PDF' },
      { key: 'catalog', label: 'Catalogue PDF' },
      { key: 'apd', label: 'Dossier APD / Permis PDF' }
    ];
    const outputChecks = {};
    for (const def of outputDefs) {
      const lbl = document.createElement('label');
      lbl.className = 'ai-pipeline-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = Boolean(defaultOutputs[def.key]);
      outputChecks[def.key] = cb;
      const txt = document.createElement('span');
      txt.textContent = def.label;
      lbl.append(cb, txt);
      outputsRow.append(lbl);
    }

    const controls = document.createElement('div');
    controls.className = 'ai-pipeline-controls';
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'ai-pipeline-btn ai-pipeline-btn--primary';
    startBtn.textContent = '▶ Lancer dans l’éditeur';

    const stopPipeBtn = document.createElement('button');
    stopPipeBtn.type = 'button';
    stopPipeBtn.className = 'ai-pipeline-btn ai-pipeline-btn--danger';
    stopPipeBtn.textContent = '■ Stopper';
    stopPipeBtn.hidden = true;

    const undoPipeBtn = document.createElement('button');
    undoPipeBtn.type = 'button';
    undoPipeBtn.className = 'ai-pipeline-btn';
    undoPipeBtn.textContent = '↩ Annuler (Ctrl+Z)';
    undoPipeBtn.hidden = true;

    controls.append(startBtn, stopPipeBtn, undoPipeBtn);

    const stepDefs = [
      { id: 'design', label: '1. Conception 2D/3D dans l’éditeur' },
      { id: 'furnish', label: '2. Meublage automatique des pièces' },
      { id: 'polish', label: '3. Conformité PMR/RE2020 & notice' },
      { id: 'save', label: '4. Enregistrement dossier & révision' },
      { id: 'safety', label: '5. Sécurité Porte E & jalon cartouche' },
      { id: 'deliverables', label: '6. Production APS · Devis · Cahier · Catalogue · APD' }
    ];
    const stepList = document.createElement('ol');
    stepList.className = 'ai-pipeline-steps';
    const stepEls = {};
    for (const st of stepDefs) {
      const li = document.createElement('li');
      li.className = 'ai-pipeline-step is-idle';
      const icon = document.createElement('span');
      icon.className = 'ai-pipeline-step-icon';
      icon.textContent = '○';
      const body = document.createElement('div');
      body.className = 'ai-pipeline-step-body';
      const stTitle = document.createElement('strong');
      stTitle.textContent = st.label;
      const stNote = document.createElement('span');
      stNote.className = 'ai-pipeline-step-note';
      body.append(stTitle, stNote);
      li.append(icon, body);
      stepList.append(li);
      stepEls[st.id] = { li, icon, note: stNote };
    }

    const gateHost = document.createElement('div');
    gateHost.className = 'ai-pipeline-gate';
    gateHost.hidden = true;

    const footerHost = document.createElement('div');
    footerHost.className = 'ai-pipeline-footer';
    footerHost.hidden = true;

    card.append(head, briefInput, outputsRow, controls, stepList, gateHost, footerHost);
    messagesEl.append(card);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    let running = false;
    let cancelled = false;
    let pipelineSlug = initialSlug;
    let undoSnapshotBeforeRun = null;

    function setStep(id, state, noteText = '') {
      const row = stepEls[id];
      if (!row) return;
      row.li.className = `ai-pipeline-step is-${state}`;
      const glyphs = { idle: '○', running: '⏳', done: '✓', warn: '⚠', error: '✕', skipped: '–' };
      row.icon.textContent = glyphs[state] || '○';
      row.note.textContent = noteText;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setRunningUi(active) {
      running = active;
      startBtn.disabled = active;
      briefInput.disabled = active;
      for (const cb of Object.values(outputChecks)) cb.disabled = active;
      stopPipeBtn.hidden = !active;
    }

    undoPipeBtn.addEventListener('click', () => {
      const api = window.EditorAPI;
      if (undoSnapshotBeforeRun && api && typeof api.loadProject === 'function') {
        try {
          api.loadProject(JSON.parse(undoSnapshotBeforeRun), { keepExtras: true });
          api.S.dirty = true;
          api.toast?.('Chaîne complète annulée — plan précédent restauré');
          undoPipeBtn.hidden = true;
          return;
        } catch { /* fallback bouton undo */ }
      }
      document.getElementById('btn-undo')?.click();
    });

    stopPipeBtn.addEventListener('click', () => {
      cancelled = true;
      stopPipeBtn.disabled = true;
      stopPipeBtn.textContent = 'Arrêt…';
    });

    async function persistCurrentEditorProject(slugCandidate) {
      const api = window.EditorAPI;
      if (!api || typeof api.toProjectJson !== 'function') throw new Error('Éditeur 2D/3D indisponible.');
      const snapshot = api.toProjectJson();
      const targetSlug = makePipelineSlug(snapshot, slugCandidate);
      if (!snapshot.meta || typeof snapshot.meta !== 'object') snapshot.meta = {};
      snapshot.meta.slug = targetSlug;
      if (api.S?.p) {
        if (!api.S.p.meta || typeof api.S.p.meta !== 'object') api.S.p.meta = {};
        api.S.p.meta.slug = targetSlug;
      }
      const res = await fetch('api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: targetSlug, project: snapshot })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Enregistrement refusé (${res.status})`);
      api.S.dirty = false;
      activeSlug = targetSlug;
      pipelineSlug = targetSlug;
      try {
        localStorage.setItem('lastProject', targetSlug);
        const qs = new URLSearchParams(location.search);
        if (qs.get('project') !== targetSlug) {
          qs.set('project', targetSlug);
          history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
        }
      } catch { /* ignore */ }
      return { slug: targetSlug, snapshot };
    }

    async function runDeliverablesStep() {
      if (cancelled) return;
      setRunningUi(true);
      gateHost.hidden = true;
      gateHost.replaceChildren();
      footerHost.hidden = true;
      footerHost.replaceChildren();

      const selected = {
        aps: outputChecks.aps.checked,
        estimate: outputChecks.estimate.checked,
        planbook: outputChecks.planbook.checked,
        catalog: outputChecks.catalog.checked,
        apd: outputChecks.apd.checked
      };
      const chosenList = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
      if (!chosenList.length) {
        setStep('deliverables', 'skipped', 'Aucun livrable coché.');
        setRunningUi(false);
        return;
      }

      setStep('deliverables', 'running', 'Préparation des documents sélectionnés…');
      const produced = [];
      const errors = [];
      const api = window.EditorAPI;
      const snap = api?.toProjectJson ? api.toProjectJson() : null;
      if (snap) {
        snap.meta = { ...(snap.meta || {}), slug: pipelineSlug };
      }

      // 1) APS Auto PDF
      if (selected.aps && !cancelled) {
        setStep('deliverables', 'running', 'Génération de l’APS Auto PDF…');
        try {
          const premium = window.EditorPremiumAPI;
          if (premium && typeof premium.generateAPS === 'function') {
            // generateAPS renvoie false si le PDF n'a pas pu être composé (plan vide, module absent).
            const ok = await premium.generateAPS();
            if (ok === false) throw new Error('composition impossible (plan vide ou module APS absent)');
            produced.push('APS Auto PDF');
          } else if (document.getElementById('btn-aps')) {
            document.getElementById('btn-aps').click();
            produced.push('APS Auto PDF');
          } else {
            throw new Error('module APS indisponible dans l’éditeur');
          }
        } catch (err) {
          errors.push(`APS PDF : ${err.message || 'échec'}`);
        }
        await sleepMs(450);
      }

      // 2) Devis & Métré complet FCFA (Excel .xlsx avec formules)
      let estimateSummaryText = '';
      if (selected.estimate && !cancelled) {
        setStep('deliverables', 'running', 'Calcul du devis FCFA et export Excel (.xlsx)…');
        try {
          const CostEstimateLib = resolveGlobalLib('CostEstimate');
          const XlsxExportLib = resolveGlobalLib('XlsxExport');
          if (snap && CostEstimateLib && XlsxExportLib) {
            const est = CostEstimateLib.estimate(snap, snap.estimate);
            if (est?.total) {
              const low = Math.round(est.total.low || 0).toLocaleString('fr-FR');
              const high = Math.round(est.total.high || 0).toLocaleString('fr-FR');
              estimateSummaryText = `Enveloppe travaux : ${low} – ${high} FCFA`;
            }
            await XlsxExportLib.downloadXlsx(snap, est, { slug: pipelineSlug });
            produced.push('Devis & Métré (.xlsx)');
          } else {
            document.getElementById('btn-estimate')?.click();
            produced.push('Fenêtre Devis & Métré');
          }

          // Devis estimatif PDF (BQE cartouché), même estimation que le classeur.
          const premium = window.EditorPremiumAPI;
          if (premium && typeof premium.exportDevisPdf === 'function') {
            const ok = await premium.exportDevisPdf();
            if (ok === false) errors.push('Devis PDF : composition refusée');
            else produced.push('Devis estimatif PDF');
          }
        } catch (err) {
          errors.push(`Devis & Métré : ${err.message || 'échec'}`);
        }
        await sleepMs(450);
      }

      // 3) Cahier de plans A3 PDF (avec coupes, toiture et page estimation)
      if (selected.planbook && !cancelled) {
        setStep('deliverables', 'running', 'Composition du Cahier de plans A3 PDF…');
        try {
          const PlanBookLib = resolveGlobalLib('PlanBook');
          if (snap && PlanBookLib && typeof PlanBookLib.exportBook === 'function') {
            await PlanBookLib.exportBook({
              data: snap,
              studio: window.studio || window.RENDER_STUDIO || null,
              includeEstimate: true
            });
            produced.push('Cahier de plans A3 PDF');
          } else {
            errors.push('Cahier A3 : ouvrez la fiche projet pour le composer');
          }
        } catch (err) {
          errors.push(`Cahier A3 : ${err.message || 'échec'}`);
        }
        await sleepMs(450);
      }

      // 4) Catalogue Premium PDF
      if (selected.catalog && !cancelled) {
        setStep('deliverables', 'running', 'Export du Catalogue Premium PDF…');
        try {
          const premium = window.EditorPremiumAPI;
          if (premium && typeof premium.exportCatalog === 'function') {
            const ok = await premium.exportCatalog();
            if (ok === false) throw new Error('composition impossible (plan vide ou module catalogue absent)');
            produced.push('Catalogue Premium PDF');
          } else if (document.getElementById('btn-export-premium')) {
            document.getElementById('btn-export-premium').click();
            produced.push('Catalogue Premium PDF');
          } else {
            throw new Error('module catalogue indisponible dans l’éditeur');
          }
        } catch (err) {
          errors.push(`Catalogue PDF : ${err.message || 'échec'}`);
        }
        await sleepMs(450);
      }

      // 5) Dossier APD / Permis de construire (pièces PC-01 → PC-08 reliées)
      if (selected.apd && !cancelled) {
        setStep('deliverables', 'running', 'Assemblage du Dossier APD / Permis de construire…');
        try {
          const premium = window.EditorPremiumAPI;
          if (premium && typeof premium.exportApdDossier === 'function') {
            const ok = await premium.exportApdDossier();
            if (ok === false) throw new Error('pièces réglementaires incomplètes pour l’export');
            produced.push('Dossier APD / Permis PDF');
          } else if (document.getElementById('btn-apd-dossier')) {
            document.getElementById('btn-apd-dossier').click();
            produced.push('Dossier APD / Permis (fenêtre)');
          } else {
            throw new Error('module APD indisponible dans l’éditeur');
          }
        } catch (err) {
          errors.push(`Dossier APD : ${err.message || 'échec'}`);
        }
      }

      if (cancelled) {
        setStep('deliverables', 'warn', `Interrompu (${produced.length} livrable(s) déjà produit(s)).`);
      } else if (errors.length && !produced.length) {
        setStep('deliverables', 'error', errors.join(' · '));
      } else {
        const summaryParts = [];
        if (produced.length) summaryParts.push(`Téléchargés : ${produced.join(', ')}`);
        if (estimateSummaryText) summaryParts.push(estimateSummaryText);
        if (errors.length) summaryParts.push(`Alertes : ${errors.join(' · ')}`);
        setStep('deliverables', errors.length ? 'warn' : 'done', summaryParts.join(' · '));
      }

      // Actions rapides post-chaîne
      const postActions = [
        { label: '💰 Ouvrir Devis détaillé', onClick: () => AGENT_ACTIONS.generate_estimate.run(pipelineSlug) },
        { label: '📑 Dossier APD / Permis', onClick: () => AGENT_ACTIONS.generate_apd.run(pipelineSlug) },
        { label: '🏛 Visite 3D', onClick: () => AGENT_ACTIONS.view_3d.run(pipelineSlug) },
        { label: '🤝 Mode Réunion', onClick: () => AGENT_ACTIONS.open_meeting.run(pipelineSlug) }
      ];
      for (const pa of postActions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ai-chat-agent-btn';
        b.textContent = pa.label;
        b.addEventListener('click', pa.onClick);
        footerHost.append(b);
      }
      footerHost.hidden = false;
      setRunningUi(false);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderCartoucheValidationGate(safetyData) {
      gateHost.replaceChildren();
      const missingList = Array.isArray(safetyData?.missingCartouche) ? safetyData.missingCartouche : [];
      const curMeta = { ...(window.EditorAPI?.S?.p?.meta || {}), ...(safetyData?.meta || {}) };

      const titleEl = document.createElement('strong');
      titleEl.className = 'ai-pipeline-gate-title';
      titleEl.textContent = 'Jalon cartouche requis avant export PDF';
      const descEl = document.createElement('p');
      descEl.className = 'ai-pipeline-gate-desc';
      descEl.textContent = `Mentions légales absentes (${missingList.join(', ')}). Renseignez-les ci-dessous (jamais inventées automatiquement) puis poursuivez :`;

      const form = document.createElement('form');
      form.className = 'ai-pipeline-gate-form';

      function addField(labelTxt, inputEl) {
        const wrap = document.createElement('label');
        wrap.className = 'ai-pipeline-field';
        const span = document.createElement('span');
        span.textContent = labelTxt;
        wrap.append(span, inputEl);
        form.append(wrap);
      }

      const clientIn = document.createElement('input');
      clientIn.type = 'text';
      clientIn.maxLength = 120;
      clientIn.placeholder = 'Ex. M. & Mme Ndongo';
      clientIn.value = String(curMeta.client || '');
      addField('Maître d’ouvrage', clientIn);

      const locIn = document.createElement('input');
      locIn.type = 'text';
      locIn.maxLength = 140;
      locIn.placeholder = 'Ex. Douala — Bonapriso';
      locIn.value = String(curMeta.location || '');
      addField('Localisation', locIn);

      const phaseSel = document.createElement('select');
      for (const ph of ['', 'ESQ', 'APS', 'APD', 'PC', 'DCE', 'EXE']) {
        const opt = document.createElement('option');
        opt.value = ph;
        opt.textContent = ph || '— Choisir phase —';
        if (String(curMeta.phase || '').toUpperCase() === ph) opt.selected = true;
        phaseSel.append(opt);
      }
      addField('Phase', phaseSel);

      const revIn = document.createElement('input');
      revIn.type = 'text';
      revIn.maxLength = 16;
      revIn.placeholder = 'Ex. A ou V1';
      revIn.value = String(curMeta.revision || '');
      addField('Indice', revIn);

      const dateWrap = document.createElement('div');
      dateWrap.className = 'ai-pipeline-date-row';
      const dateIn = document.createElement('input');
      dateIn.type = 'date';
      dateIn.value = String(curMeta.issueDate || '');
      const todayBtn = document.createElement('button');
      todayBtn.type = 'button';
      todayBtn.className = 'ai-pipeline-btn';
      todayBtn.textContent = 'Aujourd’hui';
      todayBtn.addEventListener('click', () => { dateIn.value = new Date().toISOString().slice(0, 10); });
      dateWrap.append(dateIn, todayBtn);
      addField('Date d’émission', dateWrap);

      const visLbl = document.createElement('label');
      visLbl.className = 'ai-pipeline-check ai-pipeline-check--full';
      const visCb = document.createElement('input');
      visCb.type = 'checkbox';
      visCb.checked = curMeta.clientVisible === true;
      const visTxt = document.createElement('span');
      visTxt.textContent = 'Afficher le maître d’ouvrage sur les couvertures partagées';
      visLbl.append(visCb, visTxt);
      form.append(visLbl);

      const gateBtns = document.createElement('div');
      gateBtns.className = 'ai-pipeline-gate-actions';
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'submit';
      confirmBtn.className = 'ai-pipeline-btn ai-pipeline-btn--primary';
      confirmBtn.textContent = '✓ Valider le cartouche & produire les livrables';

      const skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'ai-pipeline-btn';
      skipBtn.textContent = 'Continuer sans compléter';
      skipBtn.addEventListener('click', () => {
        setStep('safety', 'done', 'Porte E appliquée · mentions manquantes masquées sur les PDF.');
        void runDeliverablesStep();
      });

      gateBtns.append(confirmBtn, skipBtn);
      form.append(gateBtns);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Validation…';
        try {
          const metaUpdates = { clientVisible: visCb.checked };
          if (clientIn.value.trim()) metaUpdates.client = clientIn.value.trim();
          if (locIn.value.trim()) metaUpdates.location = locIn.value.trim();
          if (phaseSel.value) metaUpdates.phase = phaseSel.value;
          if (revIn.value.trim()) metaUpdates.revision = revIn.value.trim();
          if (dateIn.value) metaUpdates.issueDate = dateIn.value;

          const res = await fetch(`api/projects/${encodeURIComponent(pipelineSlug)}/document-safety`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'resolve', applyCartouche: true, enforceDeliverableGate: true, metaUpdates })
          });
          const updated = await res.json().catch(() => ({}));
          if (!res.ok || !updated.ok) throw new Error(updated.error || `Erreur HTTP ${res.status}`);

          // Synchronise le cartouche validé dans l'éditeur en mémoire
          const api = window.EditorAPI;
          if (api?.S?.p) {
            api.S.p.meta = { ...(api.S.p.meta || {}), ...(updated.meta || {}), ...metaUpdates };
            api.refreshPanel?.();
            api.draw?.();
          }
          const rem = updated.missingCartouche?.length ? ` (${updated.missingCartouche.length} champ(s) masqué(s))` : ' (cartouche 100 % complet)';
          setStep('safety', 'done', `Profil cabinet & Porte E vérifiés${rem}.`);
          await runDeliverablesStep();
        } catch (err) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = '✓ Valider le cartouche & produire les livrables';
          setStep('safety', 'error', err.message || 'Validation cartouche impossible.');
        }
      });

      gateHost.append(titleEl, descEl, form);
      gateHost.hidden = false;
      setRunningUi(false);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function executePipeline() {
      if (running) return;
      const api = window.EditorAPI;
      if (!api || !api.S) {
        setStep('design', 'error', 'Éditeur 2D/3D non prêt. Réessayez dans un instant.');
        return;
      }
      cancelled = false;
      stopPipeBtn.disabled = false;
      stopPipeBtn.textContent = '■ Stopper';
      gateHost.hidden = true;
      gateHost.replaceChildren();
      footerHost.hidden = true;
      footerHost.replaceChildren();
      for (const st of stepDefs) setStep(st.id, 'idle', '');
      setRunningUi(true);

      // Mémorise l'état exact avant chaîne pour un retour arrière 1 clic / Ctrl+Z
      try {
        undoSnapshotBeforeRun = api.S.p ? JSON.stringify(api.S.p) : null;
      } catch {
        undoSnapshotBeforeRun = null;
      }

      try {
        // ÉTAPE 1 : Conception directe dans l'éditeur 2D/3D
        const brief = briefInput.value.trim();
        if (brief) {
          setStep('design', 'running', 'Génération du plan 2D + 3D depuis votre brief…');
          const res = await fetch('api/ai/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brief })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok || !data.project) throw new Error(data.error || `Génération refusée (${res.status})`);
          applyProjectToEditorWithUndo(data.project, 'Plan 2D/3D conçu dans l’éditeur (Ctrl+Z pour annuler)');
          undoPipeBtn.hidden = false;
          pipelineSlug = makePipelineSlug(data.project, '');
          // Active la vue partagée 2D + 3D pour voir la maquette se construire en direct
          document.querySelector('[data-view-mode="split"]')?.click();
          const s = data.summary || {};
          setStep('design', 'done', `${data.project.meta?.name || 'Avant-projet'} · ${s.habitableM2 || '—'} m² hab. · ${s.roomsCount || 0} pièces.`);
        } else {
          const cur = api.toProjectJson();
          if (!cur?.rooms?.length && !cur?.walls?.length) {
            throw new Error('Le plan est vide : saisissez un brief programme ci-dessus ou tracez d’abord des pièces.');
          }
          pipelineSlug = makePipelineSlug(cur, pipelineSlug);
          document.querySelector('[data-view-mode="split"]')?.click();
          setStep('design', 'done', `Plan actif conservé (${cur.rooms?.length || 0} pièces, ${cur.walls?.length || 0} murs).`);
        }
        if (cancelled) { setRunningUi(false); return; }

        // ÉTAPE 2 : Meublage automatique
        setStep('furnish', 'running', 'Aménagement automatique des pièces…');
        if (typeof api.autoFurnishRooms === 'function') {
          await Promise.resolve(api.autoFurnishRooms());
          const count = Array.isArray(api.S.p?.furniture) ? api.S.p.furniture.length : 0;
          setStep('furnish', 'done', `${count} élément(s) de mobilier implanté(s).`);
        } else {
          setStep('furnish', 'skipped', 'Module de meublage indisponible.');
        }
        if (cancelled) { setRunningUi(false); return; }

        // ÉTAPE 4-pré : Enregistrement initial nécessaire pour les routes /api/projects/:slug/*
        setStep('polish', 'running', 'Contrôle PMR / RE2020 & rédaction du parti architectural…');
        await persistCurrentEditorProject(pipelineSlug);

        // ÉTAPE 3 : Auto-fix PMR/RE2020 + Notice éditoriale
        const liveSnap = getCompactLiveProject();
        const [fixRes, edRes] = await Promise.all([
          fetch(`api/projects/${encodeURIComponent(pipelineSlug)}/compliance-autofix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: liveSnap || undefined, apply: false })
          }),
          fetch(`api/projects/${encodeURIComponent(pipelineSlug)}/editorial-brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'preview', project: liveSnap || undefined })
          })
        ]);
        const fixData = await fixRes.json().catch(() => ({}));
        const edData = await edRes.json().catch(() => ({}));
        const polishNotes = [];
        if (fixRes.ok && fixData.ok && fixData.fixedCount > 0 && fixData.patchedProject) {
          applyProjectToEditorWithUndo(fixData.patchedProject, 'Conformité PMR / RE2020 appliquée');
          undoPipeBtn.hidden = false;
          polishNotes.push(`${fixData.fixedCount} correction(s) PMR/RE2020`);
        } else {
          polishNotes.push('PMR/RE2020 conforme');
        }
        if (edRes.ok && edData.ok && edData.draft && api.S?.p) {
          if (!api.S.p.meta || typeof api.S.p.meta !== 'object') api.S.p.meta = {};
          if (!api.S.p.meta.subtitle && edData.draft.subtitle) api.S.p.meta.subtitle = edData.draft.subtitle;
          if (!api.S.p.meta.parti && edData.draft.parti) api.S.p.meta.parti = edData.draft.parti;
          if (!api.S.p.meta.description && edData.draft.description) api.S.p.meta.description = edData.draft.description;
          api.refreshPanel?.();
          api.draw?.();
          polishNotes.push('sous-titre & parti architectural prêts');
        }
        setStep('polish', 'done', polishNotes.join(' · '));
        if (cancelled) { setRunningUi(false); return; }

        // ÉTAPE 4 : Enregistrement final + Révision datée
        setStep('save', 'running', 'Enregistrement du dossier et création d’une révision datée…');
        const { slug: savedSlug, snapshot: savedSnap } = await persistCurrentEditorProject(pipelineSlug);
        let revLabel = '';
        try {
          const revRes = await fetch(`api/projects/${encodeURIComponent(savedSlug)}/revisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: 'Chaîne complète ArchiCam AI',
              note: 'Conception 2D/3D, meublage et mise en conformité avant livrables',
              snapshot: savedSnap
            })
          });
          const revData = await revRes.json().catch(() => ({}));
          if (revRes.ok && revData.item) revLabel = ` · Révision ${revData.item.tag || revData.item.version || 'V1'}`;
        } catch { /* révision non bloquante */ }
        setStep('save', 'done', `Dossier « ${savedSlug} » enregistré${revLabel}.`);
        if (cancelled) { setRunningUi(false); return; }

        // ÉTAPE 5 : Passe sécurité Porte E & contrôle du cartouche
        setStep('safety', 'running', 'Synchronisation profil cabinet & contrôle Porte E…');
        const safeRes = await fetch(`api/projects/${encodeURIComponent(savedSlug)}/document-safety`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'resolve', applyCartouche: true, enforceDeliverableGate: true })
        });
        const safeData = await safeRes.json().catch(() => ({}));
        if (!safeRes.ok || !safeData.ok) throw new Error(safeData.error || `Contrôle sécurité refusé (${safeRes.status})`);
        if (api.S?.p && safeData.meta) {
          api.S.p.meta = { ...(api.S.p.meta || {}), ...safeData.meta };
          api.refreshPanel?.();
        }
        window.dispatchEvent(new CustomEvent('archicam:document-safety-resolved', { detail: safeData }));

        if (Array.isArray(safeData.missingCartouche) && safeData.missingCartouche.length > 0) {
          setStep('safety', 'warn', `Mentions à valider : ${safeData.missingCartouche.join(', ')}.`);
          renderCartoucheValidationGate(safeData);
          return;
        }
        setStep('safety', 'done', 'Profil cabinet, cartouche légal et verrou Porte E validés.');

        // ÉTAPE 6 : Production directe des livrables sélectionnés
        await runDeliverablesStep();
      } catch (err) {
        const currentRunning = stepDefs.find(st => stepEls[st.id].li.classList.contains('is-running')) || stepDefs[0];
        setStep(currentRunning.id, 'error', err.message || 'Erreur pendant la chaîne complète.');
        setRunningUi(false);
      }
    }

    startBtn.addEventListener('click', () => { void executePipeline(); });
    if (opts.autoStart) {
      setTimeout(() => { void executePipeline(); }, 250);
    }
    return true;
  }

  // --- Liste blanche stricte de TOUTES les actions agent exécutables ---
  const AGENT_ACTIONS = {
    // 0. Chaîne complète, Conception générative, Patch naturel, Auto-fix PMR/RE2020, Éditorial & Variantes A/B
    run_studio_pipeline: {
      defaultLabel: 'Lancer la chaîne complète (Plan → Meublage → APS · Devis · Cahier · Catalogue)',
      run: (slug, param) => openStudioPipelineCard(slug, param, { autoStart: Boolean(String(param || '').trim()) })
    },
    generate_plan_brief: {
      defaultLabel: 'Générer un plan 2D/3D depuis un brief',
      run: (_slug, param) => runGeneratePlanBriefFlow(param)
    },
    confirm_load_generated_plan: {
      defaultLabel: 'Charger le plan généré dans l’éditeur',
      run: () => confirmLoadGeneratedPlan()
    },
    apply_plan_patch: {
      defaultLabel: 'Préparer une modification du plan',
      run: (slug, param) => runPlanPatchFlow(slug, param)
    },
    confirm_apply_plan_patch: {
      defaultLabel: 'Appliquer la modification sur le plan (Ctrl+Z)',
      run: () => confirmApplyPlanPatch()
    },
    autofix_compliance: {
      defaultLabel: 'Corriger automatiquement PMR & RE2020',
      run: (slug) => runComplianceAutoFixFlow(slug)
    },
    confirm_apply_compliance_fix: {
      defaultLabel: 'Appliquer les corrections PMR / RE2020',
      run: () => confirmApplyComplianceFix()
    },
    inject_editorial_brief: {
      defaultLabel: 'Rédiger Parti architectural & Description',
      run: (slug) => runEditorialBriefFlow(slug)
    },
    confirm_inject_editorial_brief: {
      defaultLabel: 'Injecter dans le dossier & les PDF',
      run: () => confirmInjectEditorialBrief()
    },
    create_ab_variants: {
      defaultLabel: 'Créer Variantes A / B chiffrées',
      run: (slug) => runCreateAbVariantsFlow(slug)
    },
    // 1. Documents, BIM & conformité avancée
    resolve_document_safety: {
      defaultLabel: 'Sécuriser les documents PDF (Porte E & cartouche)',
      run: (slug) => runDocumentSafetyPass(slug)
    },
    set_cartouche: {
      defaultLabel: 'Mettre à jour le cartouche PDF',
      run: (slug, param) => {
        const metaUpdates = parseCartoucheParam(param);
        if (!Object.keys(metaUpdates).length) return triggerEditorButton('btn-project-info', 'open_project_info', slug);
        return runDocumentSafetyPass(slug, { metaUpdates });
      }
    },
    generate_aps: {
      defaultLabel: 'Générer l’APS Auto PDF',
      run: (slug) => triggerEditorButton('btn-aps', 'generate_aps', slug)
    },
    generate_apd: {
      defaultLabel: 'Ouvrir le Dossier APD / Permis PDF',
      run: (slug) => triggerEditorButton('btn-apd-dossier', 'generate_apd', slug)
    },
    generate_catalog: {
      defaultLabel: 'Générer le Catalogue Premium PDF',
      run: (slug) => triggerEditorButton('btn-export-premium', 'generate_catalog', slug)
    },
    generate_tech_drawings: {
      defaultLabel: 'Ouvrir Coupes 2D & Toiture',
      run: (slug) => triggerEditorButton('btn-tech-drawings', 'generate_tech_drawings', slug)
    },
    generate_estimate: {
      defaultLabel: 'Ouvrir Métré & Estimation FCFA / Excel',
      run: (slug) => triggerEditorButton('btn-estimate', 'generate_estimate', slug)
    },
    export_ifc: {
      defaultLabel: 'Exporter la maquette en IFC (BIM)',
      run: (slug) => triggerEditorAdvancedButton('btn-export-ifc', 'export_ifc', slug)
    },
    export_gbxml: {
      defaultLabel: 'Exporter en gbXML (thermique)',
      run: (slug) => triggerEditorAdvancedButton('btn-export-gbxml', 'export_gbxml', slug)
    },
    run_compliance: {
      defaultLabel: 'Vérifier la conformité PLU / RE2020 / PMR',
      run: (slug) => triggerEditorAdvancedButton('btn-run-compliance', 'run_compliance', slug)
    },
    run_bioclimatic: {
      defaultLabel: 'Lancer l’analyse bioclimatique',
      run: (slug) => triggerEditorAdvancedButton('btn-run-bioclimatic', 'run_bioclimatic', slug)
    },
    run_structural: {
      defaultLabel: 'Lancer l’analyse structurelle',
      run: (slug) => triggerEditorAdvancedButton('btn-run-structural', 'run_structural', slug)
    },
    compose_planbook: {
      defaultLabel: 'Composer le Cahier de plans A3',
      run: (slug) => triggerAccueilButton('#workspace-book', 'compose_planbook', slug)
    },
    print_planbook: {
      defaultLabel: 'Imprimer l’aperçu A4 du cahier',
      run: (slug) => triggerAccueilButton('[data-print="planbook"]', 'print_planbook', slug)
    },
    export_json: {
      defaultLabel: 'Exporter le project.json',
      run: (slug) => triggerEditorButton('btn-export-json', 'export_json', slug)
    },
    open_project_info: {
      defaultLabel: 'Compléter le cartouche PDF',
      run: (slug) => triggerEditorButton('btn-project-info', 'open_project_info', slug)
    },
    open_deliverables: {
      defaultLabel: 'Ouvrir les livrables APS / APD',
      run: (slug) => {
        const btn = document.getElementById('btn-deliverables') || document.getElementById('home-deliverables');
        if (btn && !btn.hidden) { btn.click(); return true; }
        return triggerEditorButton('btn-deliverables', 'open_deliverables', slug);
      }
    },

    // 2. Gestion du dossier, variantes & collaboration client
    open_revisions: {
      defaultLabel: 'Ouvrir le journal des révisions (V1, V2…)',
      run: (slug) => triggerEditorButton('btn-revisions', 'open_revisions', slug)
    },
    save_revision: {
      defaultLabel: 'Enregistrer une révision datée',
      run: (slug, param) => saveRevisionSnapshot(slug, param)
    },
    compare_versions: {
      defaultLabel: 'Comparer avec la dernière sauvegarde',
      run: (slug) => triggerEditorAdvancedButton('btn-compare-versions', 'compare_versions', slug)
    },
    open_variants: {
      defaultLabel: 'Comparer Variantes A / B',
      run: (slug) => triggerEditorButton('btn-variants', 'open_variants', slug)
    },
    generate_variants: {
      defaultLabel: 'Générer des variantes d’aménagement',
      run: (slug) => triggerEditorAdvancedButton('btn-generate-variants', 'generate_variants', slug)
    },
    open_annotations: {
      defaultLabel: 'Ouvrir les annotations client 2D / 3D',
      run: (slug) => triggerEditorButton('btn-annotations', 'open_annotations', slug)
    },
    open_cabinet: {
      defaultLabel: 'Ouvrir le Profil Cabinet',
      run: (slug) => triggerEditorButton('btn-cabinet', 'open_cabinet', slug)
    },
    save_project: {
      defaultLabel: 'Enregistrer le dossier',
      run: (slug) => triggerEditorButton('btn-save', 'save_project', slug)
    },
    open_meeting: {
      defaultLabel: 'Passer en mode Réunion client',
      run: (slug) => {
        const target = slug || detectProjectSlug();
        if (!target) return false;
        location.href = `accueil.html?project=${encodeURIComponent(target)}#meeting`;
        return true;
      }
    },
    open_index: {
      defaultLabel: 'Ouvrir l’index des dossiers',
      run: () => {
        const btn = document.getElementById('door-open');
        if (btn) { btn.click(); return true; }
        location.href = './';
        return true;
      }
    },

    // 3. Visite 3D, ambiances matériaux, course solaire & cinéma
    set_ambiance: {
      defaultLabel: 'Changer l’ambiance matériaux 3D',
      run: (slug, param) => {
        const preset = ALLOWED_AMBIANCES.has(String(param || '').trim()) ? String(param).trim() : 'villa-tropicale';
        return triggerViewerControl(() => {
          const btn = document.querySelector(`[data-ambiance="${preset}"]`);
          if (!btn) return false;
          btn.click();
          return true;
        }, 'set_ambiance', slug, preset);
      }
    },
    set_finish: {
      defaultLabel: 'Appliquer les finitions sols / façades',
      run: (slug, param) => {
        const parts = String(param || '').split(',').map(s => s.trim()).filter(Boolean);
        let floorVal = null;
        let facadeVal = null;
        for (const p of parts) {
          const [k, v = ''] = p.split('=');
          if (k === 'floor' && ALLOWED_FLOOR_FINISHES.has(v)) floorVal = v;
          if (k === 'facade' && ALLOWED_FACADE_FINISHES.has(v)) facadeVal = v;
        }
        if (floorVal === null && facadeVal === null) return false;
        return triggerViewerControl(() => {
          let applied = false;
          if (floorVal !== null) {
            const sel = document.getElementById('client-floor');
            if (sel) { sel.value = floorVal; sel.dispatchEvent(new Event('change', { bubbles: true })); applied = true; }
          }
          if (facadeVal !== null) {
            const sel = document.getElementById('client-facade');
            if (sel) { sel.value = facadeVal; sel.dispatchEvent(new Event('change', { bubbles: true })); applied = true; }
          }
          return applied;
        }, 'set_finish', slug, param);
      }
    },
    set_solar_hour: {
      defaultLabel: 'Régler l’heure de course solaire',
      run: (slug, param) => {
        const num = Number(param);
        const hour = Number.isFinite(num) ? Math.max(7, Math.min(20, Math.round(num * 4) / 4)) : 17;
        return triggerViewerControl(() => {
          const presetBtn = document.querySelector(`[data-solar-hour="${hour}"]`);
          if (presetBtn) { presetBtn.click(); return true; }
          const range = document.getElementById('client-hour');
          if (!range) return false;
          range.value = String(hour);
          range.dispatchEvent(new Event('input', { bubbles: true }));
          range.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, 'set_solar_hour', slug, String(hour));
      }
    },
    toggle_solar_play: {
      defaultLabel: 'Animer la course du soleil',
      run: (slug) => clickViewerButton('solar-play', 'toggle_solar_play', slug)
    },
    toggle_night: {
      defaultLabel: 'Basculer Jour / Nuit',
      run: (slug) => clickViewerButton('btn-night', 'toggle_night', slug)
    },
    toggle_section_3d: {
      defaultLabel: 'Activer / désactiver la Coupe 3D',
      run: (slug) => clickViewerButton('btn-section', 'toggle_section_3d', slug)
    },
    toggle_explode_3d: {
      defaultLabel: 'Activer / désactiver la Vue éclatée',
      run: (slug) => clickViewerButton('btn-explode', 'toggle_explode_3d', slug)
    },
    toggle_timelapse_4d: {
      defaultLabel: 'Lancer le Chantier 4D',
      run: (slug) => clickViewerButton('btn-timelapse', 'toggle_timelapse_4d', slug)
    },
    toggle_clearances: {
      defaultLabel: 'Afficher / masquer les Gabarits indicatifs',
      run: (slug) => clickViewerButton('btn-clearance-guides', 'toggle_clearances', slug)
    },
    toggle_plan_compare: {
      defaultLabel: 'Comparer Plan 2D / Maquette 3D',
      run: (slug) => clickViewerButton('btn-plan-compare', 'toggle_plan_compare', slug)
    },
    toggle_present_mode: {
      defaultLabel: 'Passer en mode Présentation plein écran',
      run: (slug) => clickViewerButton('btn-present', 'toggle_present_mode', slug)
    },
    open_gallery: {
      defaultLabel: 'Ouvrir la Galerie de vues',
      run: (slug) => clickViewerButton('btn-renders', 'open_gallery', slug)
    },
    open_sublimate: {
      defaultLabel: 'Sublimer les vues avec l’IA',
      run: (slug) => triggerEditorButton('btn-sublimate', 'open_sublimate', slug)
    },
    export_video: {
      defaultLabel: 'Exporter l’animation vidéo',
      run: (slug) => clickViewerButton('btn-export-video', 'export_video', slug)
    },
    export_ai_sequence: {
      defaultLabel: 'Exporter la Séquence pour l’IA',
      run: (slug) => clickViewerButton('btn-ai-sequence', 'export_ai_sequence', slug)
    },
    open_bioclimatic: {
      defaultLabel: 'Ouvrir le Studio IA & Bioclimatique',
      run: (slug) => clickViewerButton('btn-ai-studio', 'open_bioclimatic', slug)
    },
    view_3d: {
      defaultLabel: 'Ouvrir la visite 3D immersive',
      run: (slug) => {
        const btn = document.getElementById('btn-preview') || document.getElementById('btn-visit');
        if (btn) { btn.click(); return true; }
        location.href = slug ? `index.html?project=${encodeURIComponent(slug)}` : 'index.html';
        return true;
      }
    },

    // 4. Éditeur 2D/3D (modélisation, niveaux, import & modèles)
    set_floor: {
      defaultLabel: 'Changer de niveau (RDC / Étage 1)',
      run: (slug, param) => {
        const lvl = String(param || '').trim() === '1' ? '1' : '0';
        if (detectPage() !== 'editor') {
          location.href = buildCrossPageUrl('editor.html', slug, 'set_floor', lvl);
          return true;
        }
        const btn = document.querySelector(`[data-level="${lvl}"]`);
        if (btn) { btn.click(); return true; }
        return false;
      }
    },
    select_tool: {
      defaultLabel: 'Activer un outil de dessin 2D',
      run: (slug, param) => {
        const tool = ALLOWED_TOOLS.has(String(param || '').trim()) ? String(param).trim() : 'select';
        if (detectPage() !== 'editor') {
          location.href = buildCrossPageUrl('editor.html', slug, 'select_tool', tool);
          return true;
        }
        const btn = document.querySelector(`[data-tool="${tool}"]`);
        if (btn) { btn.click(); return true; }
        return false;
      }
    },
    editor_undo: {
      defaultLabel: 'Annuler la dernière action (Ctrl+Z)',
      run: (slug) => triggerEditorButton('btn-undo', 'editor_undo', slug)
    },
    editor_redo: {
      defaultLabel: 'Rétablir l’action (Ctrl+Y)',
      run: (slug) => triggerEditorButton('btn-redo', 'editor_redo', slug)
    },
    load_template: {
      defaultLabel: 'Charger un modèle de départ',
      run: (slug, param) => {
        const tpl = ALLOWED_TEMPLATES.has(String(param || '').trim()) ? String(param).trim() : 'villa-f4';
        if (detectPage() !== 'editor') {
          location.href = buildCrossPageUrl('editor.html', slug, 'load_template', tpl);
          return true;
        }
        if (tpl === 'villa-serena') {
          const vBtn = document.getElementById('btn-import-villa') || document.getElementById('empty-start-villa');
          if (vBtn) { vBtn.click(); return true; }
        }
        const btn = document.querySelector(`[data-starter-template="${tpl}"]`);
        if (btn) { btn.click(); return true; }
        return false;
      }
    },
    open_ai_read: {
      defaultLabel: 'Ouvrir la Lecture IA du plan',
      run: (slug) => triggerEditorButton('btn-ai-read', 'open_ai_read', slug)
    },
    open_vector_pdf: {
      defaultLabel: 'Extraction Vectoriel PDF (0 $)',
      run: (slug) => triggerEditorButton('btn-vector-pdf', 'open_vector_pdf', slug)
    },
    open_plan_cleanup: {
      defaultLabel: 'Ouvrir le Nettoyage de plan',
      run: (slug) => triggerEditorButton('btn-plan-cleanup', 'open_plan_cleanup', slug)
    },
    auto_furnish: {
      defaultLabel: 'Meubler automatiquement les pièces',
      run: (slug) => triggerEditorButton('btn-auto-furnish', 'auto_furnish', slug)
    },
    view_split: {
      defaultLabel: 'Basculer en vue partagée 2D + 3D',
      run: (slug) => {
        if (detectPage() !== 'editor') {
          location.href = buildCrossPageUrl('editor.html', slug, 'view_split');
          return true;
        }
        const btn = document.querySelector('[data-view-mode="split"]');
        if (btn) { btn.click(); return true; }
        return false;
      }
    },
    view_2d: {
      defaultLabel: 'Ouvrir l’éditeur de plan 2D',
      run: (slug) => {
        location.href = slug ? `editor.html?project=${encodeURIComponent(slug)}` : 'editor.html';
        return true;
      }
    }
  };

  function parseMessageActions(rawText) {
    const actions = [];
    const allowActions = !isClientPortalMode();
    const cleaned = String(rawText || '').replace(/\[\[ACTION:([a-z0-9_]+)(?::([^|\]]{1,80}))?\|([^\]]{1,80})\]\]/gi, (_, idRaw, paramRaw, labelRaw) => {
      const id = String(idRaw || '').toLowerCase();
      const param = String(paramRaw || '').trim();
      const dedupeKey = `${id}:${param}`;
      if (allowActions && AGENT_ACTIONS[id] && !actions.some(a => `${a.id}:${a.param}` === dedupeKey)) {
        actions.push({ id, param, label: String(labelRaw || AGENT_ACTIONS[id].defaultLabel).trim() });
      }
      return '';
    }).trim();
    return { cleaned, actions };
  }

  // --- Capture visuelle de la vue active & compression d'images importées ---
  function compressImageElement(sourceEl, maxW = 1024) {
    const sw = sourceEl.naturalWidth || sourceEl.width || 0;
    const sh = sourceEl.naturalHeight || sourceEl.height || 0;
    if (!sw || !sh) return null;
    const ratio = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * ratio));
    const h = Math.max(1, Math.round(sh * ratio));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sourceEl, 0, 0, w, h);
    return off.toDataURL('image/jpeg', 0.84);
  }

  function captureCurrentView() {
    const page = detectPage();
    try {
      if (page === 'editor') {
        const canvas = document.querySelector('#ed-canvas, #plan-canvas, canvas.ed-canvas, #ed-live3d-wrap canvas, canvas');
        if (canvas) return { dataUrl: compressImageElement(canvas, 960), label: 'Capture du plan 2D / 3D' };
      } else if (page === 'viewer') {
        const canvas = document.querySelector('#webgl-container canvas, canvas');
        if (canvas) return { dataUrl: compressImageElement(canvas, 960), label: 'Capture de la visite 3D' };
      } else if (page === 'studio') {
        const img = document.querySelector('.print-img.is-active');
        if (img && img.complete) return { dataUrl: compressImageElement(img, 960), label: img.dataset.title || 'Planche active' };
      } else if (page === 'accueil') {
        const img = document.querySelector('#cover-image:not([hidden])');
        if (img && img.complete) return { dataUrl: compressImageElement(img, 960), label: 'Couverture du projet' };
      }
    } catch { /* canvas protégé */ }
    return null;
  }

  function loadDroppedOrPickedImage(file) {
    return new Promise((resolve) => {
      if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type || '')) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const dataUrl = compressImageElement(img, 1024);
          resolve(dataUrl ? { dataUrl, label: `Image : ${file.name.slice(0, 36)}` } : null);
        };
        img.onerror = () => resolve(null);
        img.src = String(reader.result || '');
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // --- Export d'une réponse en livrable d'agence (.md) ---
  function exportMessageDeliverable(text, projectSlug) {
    const clean = parseMessageActions(text).cleaned;
    const stamp = new Date().toISOString().slice(0, 10);
    const title = projectSlug ? `Note architecturale — ${projectSlug}` : 'Note architecturale — ArchiCam Studio';
    const content = `# ${title}\nDate : ${stamp}\n\n${clean}\n\n---\nGénéré avec l’Assistant ArchiCam Studio (document indicatif à valider par l’architecte).\n`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `note-archicam-${(projectSlug || 'atelier').replace(/[^a-z0-9-]/gi, '-')}-${stamp}.md`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Rendu Markdown léger 100 % sûr (DOM natif uniquement) ---
  function appendFormattedInline(parent, text) {
    const regex = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
      const strong = document.createElement('strong');
      strong.textContent = m[1];
      parent.append(strong);
      last = regex.lastIndex;
    }
    if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
  }

  function renderRichText(container, text, streaming = false) {
    container.replaceChildren();
    const { cleaned } = parseMessageActions(text);
    const lines = cleaned.replace(/\r\n/g, '\n').split('\n');
    let currentList = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentList = null;
        continue;
      }
      const bulletMatch = /^(?:[-•*]|\d+\.)\s+(.*)$/.exec(line);
      if (bulletMatch) {
        if (!currentList) {
          currentList = document.createElement('ul');
          container.append(currentList);
        }
        const li = document.createElement('li');
        appendFormattedInline(li, bulletMatch[1]);
        currentList.append(li);
      } else {
        currentList = null;
        const p = document.createElement('p');
        const headingClean = line.replace(/^#{1,4}\s+/, '');
        if (headingClean !== line) {
          const strong = document.createElement('strong');
          strong.textContent = headingClean;
          p.append(strong);
        } else {
          appendFormattedInline(p, line);
        }
        container.append(p);
      }
    }

    if (streaming) {
      const cursor = document.createElement('span');
      cursor.className = 'ai-chat-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      const target = container.lastElementChild || container;
      target.append(cursor);
    }
  }

  const AI_LOGO_SRC = 'assets/archicam-ai-logo.svg';

  function makeLogoMark(className, size = 22) {
    const img = document.createElement('img');
    img.src = AI_LOGO_SRC;
    img.alt = '';
    img.width = size;
    img.height = size;
    img.decoding = 'async';
    img.className = className;
    img.setAttribute('aria-hidden', 'true');
    return img;
  }

  function makeKbd(label) {
    const k = document.createElement('kbd');
    k.className = 'ihm-kbd';
    k.textContent = label;
    return k;
  }

  function suggestionsForPage(page) {
    const safetyPrompt = !isClientPortalMode()
      ? ['Applique la consigne de sécurité sur les documents : résous tout ce que le dispositif permet avant export PDF.']
      : [];
    if (page === 'editor') {
      return [
        ...safetyPrompt,
        'Analyse la circulation, les surfaces et propose des actions d’optimisation.',
        'Simulation budget : quel impact si j’agrandis la terrasse de 15 m² ?',
        'Vérifie la ventilation traversante et propose des améliorations bioclimatiques.'
      ];
    }
    if (page === 'viewer' || page === 'accueil') {
      return [
        ...safetyPrompt,
        'Présente les points forts architecturaux de ce projet au maître d’ouvrage.',
        'Simulation budget & variantes : compare finitions standard vs haut de gamme.',
        'Quelles améliorations bioclimatiques et matériaux recommandes-tu ?'
      ];
    }
    return [
      'Comment démarrer un nouveau dossier à partir d’un plan PDF ou d’un croquis ?',
      'Prépare une trame de notice architecturale APS / APD pour mon cabinet.',
      'Comment obtenir un rendu photo et film HD fidèle à la maquette 3D ?'
    ];
  }

  // --- Lecture vocale (Gemini TTS serveur + repli speechSynthesis navigateur) ---
  let activeAudio = null;
  let activeSpeakBtn = null;

  function stopSpeaking() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    if (activeSpeakBtn) {
      activeSpeakBtn.classList.remove('is-speaking');
      activeSpeakBtn.textContent = '♪ Écouter';
      activeSpeakBtn = null;
    }
  }

  async function speakText(text, btn) {
    if (activeSpeakBtn === btn) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    const clean = parseMessageActions(text).cleaned;
    if (!clean) return;

    activeSpeakBtn = btn;
    btn.classList.add('is-speaking');
    btn.textContent = '■ Arrêter';

    try {
      const res = await fetch('api/ai/assistant-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean.slice(0, 1800) })
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('audio/')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeAudio = audio;
        audio.onended = () => { URL.revokeObjectURL(url); stopSpeaking(); };
        audio.onerror = () => { URL.revokeObjectURL(url); stopSpeaking(); };
        await audio.play();
        return;
      }
    } catch { /* fallback navigateur ci-dessous */ }

    if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      const utt = new SpeechSynthesisUtterance(clean.slice(0, 1600));
      utt.lang = 'fr-FR';
      utt.rate = 1.02;
      utt.onend = stopSpeaking;
      utt.onerror = stopSpeaking;
      window.speechSynthesis.speak(utt);
    } else {
      stopSpeaking();
    }
  }

  // --- État & DOM ---
  let drawer = null;
  let backdrop = null;
  let fabBtn = null;
  let messagesEl = null;
  let contextLineEl = null;
  let dockToggleBtn = null;
  let textareaEl = null;
  let sendBtn = null;
  let stopBtn = null;
  let attachBar = null;
  let attachImg = null;
  let attachLabel = null;
  let captureBtn = null;
  let uploadInput = null;
  let micBtn = null;

  let isOpen = false;
  let isStreaming = false;
  let activeController = null;
  let pendingImage = null;
  let history = [];
  let activeSlug = '';
  let lastFocused = null;
  let mode = (() => {
    try { return sessionStorage.getItem(MODE_KEY) === 'docked' ? 'docked' : 'floating'; }
    catch { return 'floating'; }
  })();
  let dragOffset = (() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch { /* ignore */ }
    return { x: 0, y: 0 };
  })();

  function applyLayoutMode() {
    if (!drawer) return;
    const isFloat = mode === 'floating';
    drawer.classList.toggle('is-floating', isFloat);
    drawer.classList.toggle('is-docked', !isFloat);
    if (isFloat) {
      drawer.style.setProperty('--drag-x', `${dragOffset.x}px`);
      drawer.style.setProperty('--drag-y', `${dragOffset.y}px`);
    }
    if (backdrop) backdrop.classList.toggle('is-open', isOpen && !isFloat);
    if (dockToggleBtn) {
      dockToggleBtn.textContent = isFloat ? '◫' : '❐';
      dockToggleBtn.title = isFloat ? 'Ancrer sur le côté' : 'Passer en fenêtre flottante déplaçable';
      dockToggleBtn.setAttribute('aria-label', dockToggleBtn.title);
    }
    try { sessionStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }

  function updateContextBadge(extra) {
    if (!contextLineEl) return;
    const page = detectPage();
    const pageLabel = { studio: 'Entrée atelier', editor: 'Éditeur 2D/3D', viewer: 'Visite 3D', accueil: 'Fiche projet', portal: 'Portail client' }[page] || 'Atelier';
    const projName = extra?.projectName
      || (page === 'editor' ? (document.getElementById('ed-project-name')?.textContent || '').trim() : '')
      || activeSlug;
    const parts = [pageLabel];
    if (projName && projName !== 'Nouveau projet') parts.push(projName);
    if (extra?.stats?.areaM2) parts.push(`${extra.stats.areaM2} m²`);
    if (!isClientPortalMode() && (extra?.stats?.liveSync || (page === 'editor' && window.EditorAPI?.toProjectJson))) {
      parts.push('Live Sync');
    }
    if (extra?.mode === 'client' || isClientPortalMode()) parts.push('Mode client');
    contextLineEl.textContent = parts.join(' · ');
  }

  function populateMessageFooter(wrap, msg) {
    if (msg.role !== 'model' || msg.streaming || msg.error) return;

    // 1. Boutons d'actions agent exécutables
    const { actions } = parseMessageActions(msg.text);
    if (actions.length && !wrap._actionsEl) {
      const box = document.createElement('div');
      box.className = 'ai-chat-agent-actions';
      for (const act of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-agent-btn';
        btn.textContent = act.id === 'resolve_document_safety' ? `🛡 ${act.label}` : `⚡ ${act.label}`;
        btn.addEventListener('click', async () => {
          const def = AGENT_ACTIONS[act.id];
          if (!def) return;
          btn.disabled = true;
          const prev = btn.textContent;
          btn.textContent = '⏳ Exécution…';
          try {
            const ok = await Promise.resolve(def.run(activeSlug, act.param));
            if (ok) {
              btn.classList.add('is-done');
              btn.textContent = `✓ ${act.label}`;
            } else {
              btn.disabled = false;
              btn.textContent = prev;
            }
          } catch {
            btn.disabled = false;
            btn.textContent = prev;
          }
        });
        box.append(btn);
      }
      wrap.append(box);
      wrap._actionsEl = box;
    }

    // 2. Outils de livrable (Copier / Exporter .md / Écouter)
    if (!wrap._toolsEl) {
      const tools = document.createElement('div');
      tools.className = 'ai-chat-msg-tools';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'ai-chat-tool-btn';
      copyBtn.textContent = 'Copier';
      copyBtn.addEventListener('click', () => {
        const clean = parseMessageActions(msg.text).cleaned;
        navigator.clipboard?.writeText(clean).then(() => {
          copyBtn.textContent = '✓ Copié';
          setTimeout(() => { copyBtn.textContent = 'Copier'; }, 1600);
        }).catch(() => {});
      });

      const expBtn = document.createElement('button');
      expBtn.type = 'button';
      expBtn.className = 'ai-chat-tool-btn';
      expBtn.textContent = 'Exporter .md';
      expBtn.title = 'Télécharger cette réponse en note livrable';
      expBtn.addEventListener('click', () => exportMessageDeliverable(msg.text, activeSlug));

      const listenBtn = document.createElement('button');
      listenBtn.type = 'button';
      listenBtn.className = 'ai-chat-tool-btn';
      listenBtn.textContent = '♪ Écouter';
      listenBtn.addEventListener('click', () => void speakText(msg.text, listenBtn));

      tools.append(copyBtn, expBtn, listenBtn);
      wrap.append(tools);
      wrap._toolsEl = tools;
    }
  }

  function createMessageNode(msg) {
    const wrap = document.createElement('div');
    wrap.className = `ai-chat-msg ai-chat-msg--${msg.error ? 'error' : (msg.role === 'user' ? 'user' : 'model')}`;

    const label = document.createElement('span');
    label.className = 'ai-chat-msg-label';
    if (msg.role === 'user') {
      label.textContent = 'Vous';
    } else {
      label.append(makeLogoMark('ai-chat-msg-avatar', 16), document.createTextNode('ArchiCam AI'));
    }

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';

    if (msg.imagePreview) {
      const img = document.createElement('img');
      img.className = 'ai-chat-msg-img';
      img.src = msg.imagePreview;
      img.alt = 'Image jointe';
      bubble.append(img);
    }

    const body = document.createElement('div');
    renderRichText(body, msg.text, Boolean(msg.streaming));
    bubble.append(body);

    wrap.append(label, bubble);
    wrap._bodyEl = body;
    populateMessageFooter(wrap, msg);
    return wrap;
  }

  function renderThread() {
    if (!messagesEl) return;
    messagesEl.replaceChildren();
    const page = detectPage();

    if (!history.length) {
      const box = document.createElement('div');
      box.className = 'ai-chat-welcome';
      const welcomeHead = document.createElement('div');
      welcomeHead.className = 'ai-chat-welcome-head';
      welcomeHead.append(makeLogoMark('ai-chat-welcome-logo', 40));
      const welcomeBrand = document.createElement('div');
      welcomeBrand.className = 'ai-chat-welcome-brand';
      const welcomeTitle = document.createElement('strong');
      welcomeTitle.textContent = 'ArchiCam AI';
      const welcomeSub = document.createElement('span');
      welcomeSub.textContent = 'Copilote architectural & documents';
      welcomeBrand.append(welcomeTitle, welcomeSub);
      welcomeHead.append(welcomeBrand);
      box.append(welcomeHead);

      const p = document.createElement('p');
      p.textContent = activeSlug
        ? 'Je lis votre tracé en direct (Live Sync), les surfaces, le bioclimatique et le budget. Posez une question, modifiez le plan en langage naturel ou lancez un raccourci ci-dessous.'
        : 'Sans plan PDF ni image ? Décrivez un programme pour générer un avant-projet 2D + 3D complet, ou posez vos questions d’atelier.';
      box.append(p);

      if (!isClientPortalMode()) {
        const heroPipeBtn = document.createElement('button');
        heroPipeBtn.type = 'button';
        heroPipeBtn.className = 'ai-chat-pipeline-cta';
        heroPipeBtn.textContent = '🚀 Chaîne complète : Conception → Meublage → APS · Devis · Cahier A3 · Catalogue · APD';
        heroPipeBtn.title = 'Conçoit dans l’éditeur 2D/3D, meuble, sécurise puis génère le dossier complet';
        heroPipeBtn.addEventListener('click', () => {
          const typed = (textareaEl?.value || '').trim();
          if (textareaEl && typed) textareaEl.value = '';
          openStudioPipelineCard(activeSlug, typed, { autoStart: false });
        });
        box.append(heroPipeBtn);

        const quickGrid = document.createElement('div');
        quickGrid.className = 'ai-chat-quick-grid';
        const quickActions = [
          {
            label: '📐 Plan depuis brief',
            title: 'Générer une esquisse 2D + 3D complète à partir d’un brief texte',
            onClick: () => {
              const typed = (textareaEl?.value || '').trim();
              if (typed) {
                if (textareaEl) textareaEl.value = '';
                void runGeneratePlanBriefFlow(typed);
              } else {
                void runGeneratePlanBriefFlow('');
              }
            }
          },
          {
            label: '✅ Auto-fix PMR / RE2020',
            title: 'Corriger automatiquement les portes < 0,90 m, HSP < 2,20 m et le vitrage 1/6',
            onClick: () => void runComplianceAutoFixFlow(activeSlug)
          },
          {
            label: '✍️ Parti & Notice',
            title: 'Rédiger et injecter sous-titre, parti architectural et description dans le dossier',
            onClick: () => void runEditorialBriefFlow(activeSlug)
          },
          {
            label: '⚖️ Variantes A / B',
            title: 'Créer et chiffrer automatiquement deux variantes comparables en FCFA',
            onClick: () => void runCreateAbVariantsFlow(activeSlug)
          }
        ];
        for (const qa of quickActions) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'ai-chat-quick-chip';
          chip.textContent = qa.label;
          chip.title = qa.title;
          chip.addEventListener('click', qa.onClick);
          quickGrid.append(chip);
        }
        box.append(quickGrid);
      }

      const list = document.createElement('div');
      list.className = 'ai-chat-suggestions';
      for (const prompt of suggestionsForPage(page)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-suggestion';
        const txt = document.createElement('span');
        txt.textContent = prompt;
        const arr = document.createElement('span');
        arr.setAttribute('aria-hidden', 'true');
        arr.textContent = '→';
        btn.append(txt, arr);
        btn.addEventListener('click', () => void sendMessage(prompt));
        list.append(btn);
      }
      box.append(list);
      messagesEl.append(box);
      return;
    }

    for (const msg of history) messagesEl.append(createMessageNode(msg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function pushSystemAssistantMessage(text, isError = false) {
    ensureDrawer();
    const msg = { role: 'model', text: String(text || ''), error: Boolean(isError) };
    history.push(msg);
    renderThread();
    if (!isError) saveHistory(activeSlug, history);
  }

  function setAttachment(item) {
    pendingImage = item || null;
    if (!attachBar) return;
    if (!pendingImage) {
      attachBar.hidden = true;
      return;
    }
    attachImg.src = pendingImage.dataUrl;
    attachLabel.textContent = pendingImage.label || 'Image jointe';
    attachBar.hidden = false;
  }

  function setStreamingUi(active) {
    isStreaming = active;
    if (sendBtn) sendBtn.disabled = active;
    if (stopBtn) stopBtn.hidden = !active;
  }

  async function sendMessage(rawText) {
    const text = String(rawText ?? textareaEl?.value ?? '').trim();
    if (!text || isStreaming) return;

    stopSpeaking();
    activeSlug = detectProjectSlug();
    const attached = pendingImage;
    setAttachment(null);
    if (textareaEl) {
      textareaEl.value = '';
      textareaEl.style.height = 'auto';
    }

    const userMsg = { role: 'user', text, imagePreview: attached?.dataUrl || '' };
    const assistantMsg = { role: 'model', text: '', streaming: true };
    history.push(userMsg, assistantMsg);
    renderThread();

    const assistantNode = messagesEl.lastElementChild;
    const bodyEl = assistantNode?._bodyEl;

    setStreamingUi(true);
    activeController = new AbortController();

    try {
      const payloadMessages = history
        .filter(m => !m.error && (m.text || m === userMsg))
        .slice(-20)
        .map(m => ({ role: m.role, text: m.text }));

      const res = await fetch('api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: activeController.signal,
        body: JSON.stringify({
          project: activeSlug,
          messages: payloadMessages,
          liveContext: collectLiveContext(),
          imageDataUrl: attached?.dataUrl || '',
          stream: true
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('text/event-stream')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          let evtName = 'message';
          let dataStr = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let parsed = null;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          if (evtName === 'meta') {
            updateContextBadge(parsed);
          } else if (evtName === 'chunk' && typeof parsed.text === 'string') {
            assistantMsg.text += parsed.text;
            if (bodyEl) renderRichText(bodyEl, assistantMsg.text, true);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else if (evtName === 'error') {
            throw new Error(parsed.error || 'Erreur de génération IA.');
          }
        }
      }

      assistantMsg.streaming = false;
      if (!assistantMsg.text.trim()) throw new Error('Réponse vide reçue du serveur.');
      if (bodyEl) renderRichText(bodyEl, assistantMsg.text, false);
      if (assistantNode) populateMessageFooter(assistantNode, assistantMsg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      saveHistory(activeSlug, history);
    } catch (err) {
      assistantMsg.streaming = false;
      if (err.name === 'AbortError') {
        if (!assistantMsg.text.trim()) assistantMsg.text = 'Génération interrompue.';
        if (bodyEl) renderRichText(bodyEl, assistantMsg.text, false);
        if (assistantNode) populateMessageFooter(assistantNode, assistantMsg);
        saveHistory(activeSlug, history);
      } else {
        assistantMsg.error = true;
        assistantMsg.text = err.message || 'Impossible de contacter l’assistant IA.';
        if (assistantNode) assistantNode.className = 'ai-chat-msg ai-chat-msg--error';
        if (bodyEl) renderRichText(bodyEl, assistantMsg.text, false);
      }
    } finally {
      activeController = null;
      setStreamingUi(false);
    }
  }

  // --- Dictée vocale Web Speech API ---
  let speechRec = null;
  let isListening = false;

  function setupVoiceInput(btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.hidden = true;
      return;
    }
    btn.addEventListener('click', () => {
      if (isListening && speechRec) {
        try { speechRec.stop(); } catch { /* ignore */ }
        return;
      }
      const rec = new SR();
      rec.lang = 'fr-FR';
      rec.interimResults = true;
      rec.continuous = false;
      const baseText = textareaEl.value ? `${textareaEl.value.trim()} ` : '';

      rec.onstart = () => {
        isListening = true;
        btn.classList.add('is-listening');
        btn.textContent = '● Écoute…';
      };
      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        textareaEl.value = baseText + transcript;
        textareaEl.style.height = 'auto';
        textareaEl.style.height = `${Math.min(126, textareaEl.scrollHeight)}px`;
      };
      rec.onerror = () => {
        isListening = false;
        btn.classList.remove('is-listening');
        btn.textContent = '🎙';
      };
      rec.onend = () => {
        isListening = false;
        btn.classList.remove('is-listening');
        btn.textContent = '🎙';
        textareaEl?.focus();
      };
      speechRec = rec;
      try { rec.start(); } catch { /* ignore */ }
    });
  }

  // --- Déplacement tactile/souris de la fenêtre flottante ---
  function bindDragging(head) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    head.addEventListener('pointerdown', (e) => {
      if (mode !== 'floating') return;
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originX = dragOffset.x;
      originY = dragOffset.y;
      drawer.classList.add('is-dragging');
      head.setPointerCapture?.(e.pointerId);
    });

    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = drawer.getBoundingClientRect();
      const maxLeft = -(window.innerWidth - rect.width - 28);
      const maxTop = -(window.innerHeight - rect.height - 28);
      const nextX = Math.max(Math.min(0, maxLeft), Math.min(10, originX + (e.clientX - startX)));
      const nextY = Math.max(Math.min(0, maxTop), Math.min(10, originY + (e.clientY - startY)));
      dragOffset = { x: Math.round(nextX), y: Math.round(nextY) };
      drawer.style.setProperty('--drag-x', `${dragOffset.x}px`);
      drawer.style.setProperty('--drag-y', `${dragOffset.y}px`);
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      drawer.classList.remove('is-dragging');
      try { sessionStorage.setItem(POS_KEY, JSON.stringify(dragOffset)); } catch { /* ignore */ }
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
  }

  function ensureDrawer() {
    if (drawer) return drawer;

    backdrop = document.createElement('div');
    backdrop.className = 'ai-chat-backdrop';
    backdrop.addEventListener('click', closeDrawer);

    drawer = document.createElement('aside');
    drawer.className = 'ai-chat-drawer';
    drawer.id = 'ai-chat-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Assistant architectural IA');
    drawer.setAttribute('aria-hidden', 'true');

    // Glisser-déposer d'images d'inspiration / croquis sur toute la fenêtre
    drawer.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        drawer.classList.add('is-drop-active');
      }
    });
    drawer.addEventListener('dragleave', (e) => {
      if (!drawer.contains(e.relatedTarget)) drawer.classList.remove('is-drop-active');
    });
    drawer.addEventListener('drop', async (e) => {
      e.preventDefault();
      drawer.classList.remove('is-drop-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        const img = await loadDroppedOrPickedImage(file);
        if (img) setAttachment(img);
      }
    });

    // En-tête déplaçable avec logo ArchiCam AI
    const head = document.createElement('div');
    head.className = 'ai-chat-head';
    const headBrand = document.createElement('div');
    headBrand.className = 'ai-chat-head-brand';
    headBrand.append(makeLogoMark('ai-chat-head-logo', 38));
    const titleWrap = document.createElement('div');
    titleWrap.className = 'ai-chat-title-wrap';
    const kicker = document.createElement('p');
    kicker.className = 'ai-chat-kicker';
    const grip = document.createElement('span');
    grip.className = 'ai-chat-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.textContent = '⋮⋮';
    kicker.append(grip, document.createTextNode('Copilote d’atelier'));
    const title = document.createElement('h2');
    title.className = 'ai-chat-title';
    title.textContent = 'ArchiCam AI';
    contextLineEl = document.createElement('p');
    contextLineEl.className = 'ai-chat-context-line';
    titleWrap.append(kicker, title, contextLineEl);
    headBrand.append(titleWrap);

    const headActions = document.createElement('div');
    headActions.className = 'ai-chat-head-actions';

    dockToggleBtn = document.createElement('button');
    dockToggleBtn.type = 'button';
    dockToggleBtn.className = 'ai-chat-icon-btn';
    dockToggleBtn.addEventListener('click', () => {
      mode = mode === 'floating' ? 'docked' : 'floating';
      applyLayoutMode();
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ai-chat-icon-btn';
    clearBtn.title = 'Nouvelle conversation';
    clearBtn.setAttribute('aria-label', 'Effacer la conversation');
    clearBtn.textContent = '↺';
    clearBtn.addEventListener('click', () => {
      stopSpeaking();
      if (activeController) activeController.abort();
      history = [];
      saveHistory(activeSlug, []);
      setAttachment(null);
      renderThread();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ai-chat-icon-btn';
    closeBtn.title = 'Réduire (Échap)';
    closeBtn.setAttribute('aria-label', 'Réduire l’assistant IA');
    closeBtn.textContent = '—';
    closeBtn.addEventListener('click', closeDrawer);

    headActions.append(dockToggleBtn, clearBtn, closeBtn);
    head.append(headBrand, headActions);
    bindDragging(head);

    // Fil de conversation
    messagesEl = document.createElement('div');
    messagesEl.className = 'ai-chat-messages';
    messagesEl.setAttribute('aria-live', 'polite');

    // Barre aperçu pièce jointe
    attachBar = document.createElement('div');
    attachBar.className = 'ai-chat-attach-bar';
    attachBar.hidden = true;
    const attachPreview = document.createElement('div');
    attachPreview.className = 'ai-chat-attach-preview';
    attachImg = document.createElement('img');
    attachImg.alt = 'Aperçu de l’image jointe';
    attachLabel = document.createElement('span');
    attachPreview.append(attachImg, attachLabel);
    const attachRemove = document.createElement('button');
    attachRemove.type = 'button';
    attachRemove.className = 'ai-chat-attach-remove';
    attachRemove.setAttribute('aria-label', 'Retirer l’image');
    attachRemove.textContent = '×';
    attachRemove.addEventListener('click', () => setAttachment(null));
    attachBar.append(attachPreview, attachRemove);

    // Compositeur
    const composer = document.createElement('form');
    composer.className = 'ai-chat-composer';
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      void sendMessage();
    });

    textareaEl = document.createElement('textarea');
    textareaEl.className = 'ai-chat-textarea';
    textareaEl.rows = 2;
    textareaEl.placeholder = 'Posez une question, simulez un budget ou déposez un croquis…';
    textareaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    });
    textareaEl.addEventListener('input', () => {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = `${Math.min(126, textareaEl.scrollHeight)}px`;
    });

    const bar = document.createElement('div');
    bar.className = 'ai-chat-composer-bar';

    const mediaTools = document.createElement('div');
    mediaTools.className = 'ai-chat-media-tools';

    captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.className = 'ai-chat-capture-btn';
    captureBtn.textContent = '◎ Vue';
    captureBtn.title = 'Capturer le plan 2D, la visite 3D ou la planche active';
    captureBtn.addEventListener('click', () => {
      const cap = captureCurrentView();
      if (cap && cap.dataUrl) {
        setAttachment(cap);
      } else {
        captureBtn.textContent = 'Indisponible';
        setTimeout(() => { captureBtn.textContent = '◎ Vue'; }, 1600);
      }
    });

    uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/png,image/jpeg,image/webp';
    uploadInput.hidden = true;
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      uploadInput.value = '';
      if (file) {
        const img = await loadDroppedOrPickedImage(file);
        if (img) setAttachment(img);
      }
    });

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'ai-chat-capture-btn';
    uploadBtn.textContent = '⊕ Image';
    uploadBtn.title = 'Joindre une photo d’inspiration, matériau ou croquis (glisser-déposer aussi supporté)';
    uploadBtn.addEventListener('click', () => uploadInput.click());

    micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'ai-chat-capture-btn';
    micBtn.textContent = '🎙';
    micBtn.title = 'Dictée vocale (français)';
    micBtn.setAttribute('aria-label', 'Dicter un message au micro');
    setupVoiceInput(micBtn);

    mediaTools.append(captureBtn, uploadBtn, uploadInput, micBtn);

    if (!isClientPortalMode()) {
      const safetyBtn = document.createElement('button');
      safetyBtn.type = 'button';
      safetyBtn.className = 'ai-chat-capture-btn ai-chat-safety-btn';
      safetyBtn.textContent = '🛡 Sécuriser PDF';
      safetyBtn.title = 'Appliquer toutes les résolutions de sécurité autorisées sur les générateurs PDF (Porte E, cartouche cabinet, conformité)';
      safetyBtn.addEventListener('click', async () => {
        if (safetyBtn.disabled) return;
        safetyBtn.disabled = true;
        safetyBtn.textContent = '⏳ Contrôle…';
        try {
          await runDocumentSafetyPass(activeSlug || detectProjectSlug());
        } finally {
          safetyBtn.disabled = false;
          safetyBtn.textContent = '🛡 Sécuriser PDF';
        }
      });
      mediaTools.append(safetyBtn);
    }

    const sendGroup = document.createElement('div');
    sendGroup.className = 'ai-chat-send-group';

    stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'ai-chat-stop-btn';
    stopBtn.textContent = 'Arrêter';
    stopBtn.hidden = true;
    stopBtn.addEventListener('click', () => activeController?.abort());

    sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'ai-chat-send-btn';
    sendBtn.textContent = 'Envoyer';

    sendGroup.append(stopBtn, sendBtn);
    bar.append(mediaTools, sendGroup);
    composer.append(textareaEl, bar);

    drawer.append(head, messagesEl, attachBar, composer);
    document.body.append(backdrop, drawer);
    applyLayoutMode();
    return drawer;
  }

  function openDrawer(prefillPrompt) {
    ensureDrawer();
    activeSlug = detectProjectSlug();
    history = loadHistory(activeSlug);
    updateContextBadge();
    renderThread();

    if (!isOpen) {
      lastFocused = document.activeElement;
      isOpen = true;
      applyLayoutMode();
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      if (fabBtn) fabBtn.classList.add('is-hidden');
    }

    if (typeof prefillPrompt === 'string' && prefillPrompt.trim()) {
      void sendMessage(prefillPrompt.trim());
    } else {
      setTimeout(() => textareaEl?.focus(), 60);
    }
  }

  function closeDrawer() {
    if (!isOpen || !drawer) return;
    isOpen = false;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('is-open');
    if (fabBtn) fabBtn.classList.remove('is-hidden');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch { /* ignore */ }
    }
    lastFocused = null;
  }

  function toggleDrawer() {
    if (isOpen) closeDrawer();
    else openDrawer();
  }

  function mountLauncher() {
    // 1. Bouton dans la barre d'en-tête si disponible
    const existing = document.querySelectorAll('[data-ai-assistant-trigger]');
    existing.forEach((btn) => {
      if (btn.dataset.aiBound) return;
      btn.dataset.aiBound = '1';
      btn.addEventListener('click', toggleDrawer);
      const kbd = btn.querySelector('.ihm-kbd');
      if (kbd) kbd.textContent = `${MOD_KEY}J`;
    });

    if (!existing.length) {
      const studioActions = document.querySelector('.studio-head-actions');
      const editorActions = document.querySelector('.ed-actions');
      const mastheadLinks = document.querySelector('.masthead-links');
      if (studioActions || editorActions || mastheadLinks) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-launcher';
        btn.setAttribute('data-ai-assistant-trigger', '1');
        btn.setAttribute('aria-label', `Ouvrir ArchiCam AI (${MOD_KEY}+J)`);
        btn.title = `ArchiCam AI — Copilote d’atelier (${MOD_KEY}+J)`;
        btn.append(makeLogoMark('ai-chat-launcher-logo', 20), document.createTextNode('ArchiCam AI'), makeKbd(`${MOD_KEY}J`));
        btn.addEventListener('click', toggleDrawer);
        if (studioActions) {
          studioActions.append(btn);
        } else if (editorActions) {
          btn.classList.add('ai-chat-launcher--compact');
          editorActions.append(btn);
        } else if (mastheadLinks) {
          btn.classList.add('ai-chat-launcher--compact');
          mastheadLinks.append(btn);
        }
      }
    }

    // 2. Bulle flottante toujours accessible en bas à droite
    if (!fabBtn) {
      fabBtn = document.createElement('button');
      fabBtn.type = 'button';
      fabBtn.className = 'ai-chat-fab';
      fabBtn.id = 'ai-chat-fab';
      fabBtn.setAttribute('aria-label', `Ouvrir ArchiCam AI flottant (${MOD_KEY}+J)`);
      fabBtn.title = `ArchiCam AI flottant (${MOD_KEY}+J)`;
      fabBtn.append(makeLogoMark('ai-chat-fab-logo', 24), document.createTextNode('ArchiCam AI'), makeKbd(`${MOD_KEY}J`));
      fabBtn.addEventListener('click', toggleDrawer);
      document.body.append(fabBtn);
    }
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      toggleDrawer();
      return;
    }
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      closeDrawer();
    }
  });

  // --- Déclenchement sûr inter-vues via ?autoAction=&autoParam= (liste blanche stricte) ---
  function runPendingAutoAction() {
    if (isClientPortalMode()) return;
    const page = detectPage();
    if (!['editor', 'viewer', 'accueil'].includes(page)) return;
    try {
      const qs = new URLSearchParams(location.search);
      const act = String(qs.get('autoAction') || '').trim().toLowerCase();
      const param = String(qs.get('autoParam') || '').trim().slice(0, 80);
      const def = AGENT_ACTIONS[act];
      if (!def) return;
      qs.delete('autoAction');
      qs.delete('autoParam');
      const cleanSearch = qs.toString();
      history.replaceState(null, '', `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${location.hash || ''}`);
      let tries = 0;
      const attempt = () => {
        if (act === 'run_studio_pipeline') {
          if (page === 'editor' && !window.EditorAPI) {
            if (++tries < 25) setTimeout(attempt, 250);
            return;
          }
          let pendingCfg = null;
          try {
            const raw = sessionStorage.getItem(PIPELINE_KEY);
            if (raw) {
              pendingCfg = JSON.parse(raw);
              sessionStorage.removeItem(PIPELINE_KEY);
            }
          } catch { /* ignore */ }
          openStudioPipelineCard(
            detectProjectSlug(),
            pendingCfg?.brief || param,
            { outputs: pendingCfg?.outputs, autoStart: Boolean(pendingCfg?.autoStart || param) }
          );
          return;
        }
        const ok = def.run(detectProjectSlug(), param);
        if (ok) return;
        if (++tries < 20) setTimeout(attempt, 250);
      };
      setTimeout(attempt, 500);
    } catch { /* ignore */ }
  }

  function initAssistant() {
    mountLauncher();
    runPendingAutoAction();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAssistant, { once: true });
  } else {
    initAssistant();
  }

  window.__archicamAssistant = {
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    ask: (prompt) => openDrawer(prompt),
    runAction: (id, param = '') => {
      if (isClientPortalMode()) return false;
      const def = AGENT_ACTIONS[String(id || '').toLowerCase()];
      if (!def) return false;
      return def.run(activeSlug || detectProjectSlug(), String(param || ''));
    },
    listActions: () => (isClientPortalMode() ? [] : Object.keys(AGENT_ACTIONS)),
    runStudioPipeline: (brief = '', opts = {}) => {
      if (isClientPortalMode()) return false;
      return openStudioPipelineCard(activeSlug || detectProjectSlug(), brief, opts);
    },
    resolveDocumentSafety: (slug) => {
      openDrawer();
      return runDocumentSafetyPass(slug);
    },
    setMode: (nextMode) => {
      mode = nextMode === 'docked' ? 'docked' : 'floating';
      applyLayoutMode();
    }
  };
})();
