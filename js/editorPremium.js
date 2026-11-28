/**
 * EDITOR PREMIUM — Intégration du catalogue PDF premium dans l'éditeur
 * 
 * Gère :
 * - Bouton "✨ Sublimer avec l'IA"
 * - Bouton "🎨 Catalogue Premium"
 * - Sélecteur de style (Moderne/Luxe/Industriel)
 * - Aperçu en temps réel
 * - Export PDF premium
 */

(function() {
  'use strict';

  // =====================================================================
  // ÉTAT
  // =====================================================================

  let currentStyle = 'agence';
  let pdfOptions = {
    includeCover: true,
    includeStats: true,
    includePlan: true,
    includeInterior: true
  };

  // =====================================================================
  // INITIALISATION
  // =====================================================================

  function init() {
    console.log('[EditorPremium] Initialisation...');
    
    // Bouton Sublimer avec l'IA
    const btnSublimate = document.getElementById('btn-sublimate');
    if (btnSublimate) {
      btnSublimate.addEventListener('click', handleSublimate);
    }

  // Bouton Catalogue Premium
  const btnExportPremium = document.getElementById('btn-export-premium');
  if (btnExportPremium) {
    btnExportPremium.addEventListener('click', handleExportPremium);
  }

  // Bouton APS Auto
  const btnAPS = document.getElementById('btn-aps');
  if (btnAPS) {
    btnAPS.addEventListener('click', handleGenerateAPS);
  }

    // Dialogue premium
    const dlgPremium = document.getElementById('dlg-premium');
    const premiumCancel = document.getElementById('premium-cancel');
    const premiumExport = document.getElementById('premium-export');

    if (premiumCancel && dlgPremium) {
      premiumCancel.addEventListener('click', () => dlgPremium.close());
    }

    if (premiumExport && dlgPremium) {
      premiumExport.addEventListener('click', () => {
        exportPremiumPDF();
        dlgPremium.close();
      });
    }

    // Sélecteur de style
    document.querySelectorAll('input[name="pdf-style"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        currentStyle = e.target.value;
        updatePreview();
        updateAIStatus();
      });
    });

    // Options
    const checkboxes = ['cover', 'stats', 'plan', 'interior'];
    checkboxes.forEach(opt => {
      const checkbox = document.getElementById(`premium-include-${opt}`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          pdfOptions[`include${opt.charAt(0).toUpperCase() + opt.slice(1)}`] = e.target.checked;
        });
      }
    });

    // Charger le style sauvegardé
    const savedStyle = localStorage.getItem('pdf-style');
    if (savedStyle && ['agence', 'luxury', 'industrial'].includes(savedStyle)) {
      currentStyle = savedStyle;
      const radio = document.querySelector(`input[name="pdf-style"][value="${savedStyle}"]`);
      if (radio) radio.checked = true;
    }

    updatePreview();
    updateAIStatus();
    
    console.log('[EditorPremium] ✅ Initialisé');
  }

  // =====================================================================
  // GESTIONNAIRES D'ÉVÉNEMENTS
  // =====================================================================

  /**
   * Sublimer avec l'IA
   */
  async function handleSublimate() {
    if (typeof AIEnhance === 'undefined') {
      showToast('Module AIEnhance non chargé', 'error');
      return;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de sublimer les rendus', 'error');
      return;
    }

    const slug = await savedSlug(data);
    if (!slug) {
      showToast('Enregistrez le projet, puis enregistrez des vues dans la visite 3D avant de les sublimer.', 'error');
      return;
    }

    // Photoréalisation des captures 3D enregistrées par la visite, via OpenRouter (serveur local).
    const btn = document.getElementById('btn-sublimate');
    const status = document.getElementById('ai-status');
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sublimation…'; }
    try {
      const result = await AIEnhance.sublimateWithAI(slug, {
        project: data, // pièces et ville : prompt intérieur ou extérieur piloté par le projet
        onProgress: message => { if (status) status.textContent = message; }
      });
      if (result.skipped) {
        showToast(result.skipped, 'info');
        if (status) status.textContent = result.skipped;
      } else {
        // L'IA peut inventer ou retirer des éléments : rien n'entre dans un document client sans validation.
        const message = `${result.created.length} vue(s) sublimée(s), enregistrée(s) dans la galerie du projet. Comparez-les à la vue 3D dans la galerie de la visite, puis cochez « Catalogue » pour les utiliser dans le catalogue et l'APS.`;
        showToast(message, 'success');
        if (status) status.textContent = message;
      }
      updateAIStatus();
    } catch (error) {
      console.error('Erreur sublimation:', error);
      showToast('Sublimation interrompue : ' + error.message, 'error');
      if (status) status.textContent = '✗ ' + error.message;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  /**
   * Slug du projet s'il est enregistré sur le serveur local (sinon null : rien à lire ni à créer).
   */
  async function savedSlug(data) {
    // Projet ouvert dans l'éditeur. Surtout pas window.ACTIVE_PROJECT_SLUG : projectLoader.js le fixe
    // au projet par défaut au chargement de la page, quel que soit le projet ouvert ensuite.
    const slug = (data?.meta?.slug || '').toLowerCase();
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
    try {
      const response = await fetch('api/projects', { cache: 'no-store' });
      const projects = response.ok ? await response.json() : [];
      return projects.some(project => project.slug === slug) ? slug : null;
    } catch (_) {
      return null;
    }
  }

  /** Images IA du projet (façade + intérieurs) ; documents sans images si rien n'est disponible. */
  async function projectImages(data) {
    if (typeof AIEnhance === 'undefined') return { facade: null, interiors: [] };
    const slug = await savedSlug(data);
    if (!slug) return { facade: null, interiors: [] };
    try {
      return await AIEnhance.documentImages(slug, { project: data });
    } catch (error) {
      console.warn('[EditorPremium] Images IA indisponibles :', error);
      return { facade: null, interiors: [] };
    }
  }

  async function loadCabinet() {
    if (typeof PdfIdentity === 'undefined' || typeof PdfIdentity.loadCabinetProfile !== 'function') return null;
    try { return await PdfIdentity.loadCabinetProfile(); } catch (_) { return null; }
  }

  function missingNotice(data, cabinet) {
    if (typeof PdfIdentity === 'undefined' || typeof PdfIdentity.missingFields !== 'function') return { missing: [], message: '' };
    return PdfIdentity.missingFields(data, { cabinet });
  }

  function updateMetaWarning(data, cabinet) {
    const el = document.getElementById('premium-meta-warning');
    if (!el) return;
    const { message } = missingNotice(data, cabinet);
    el.hidden = !message;
    el.textContent = message ? `Champs non renseignés (${message}) : ces lignes seront masquées du cartouche.` : '';
  }

  /**
   * Ouvrir le dialogue d'export premium
   */
  function handleExportPremium() {
    const dlgPremium = document.getElementById('dlg-premium');
    if (dlgPremium) {
      dlgPremium.showModal();
    }
    const data = getProjectData();
    updateMetaWarning(data, null);
    loadCabinet().then(cabinet => updateMetaWarning(data, cabinet)).catch(() => null);
    // Statut IA à jour pour le projet ouvert (images réellement présentes dans le projet).
    savedSlug(data).then(slug => slug && typeof AIEnhance !== 'undefined' ? AIEnhance.loadMedia(slug) : null)
      .catch(() => null)
      .finally(updateAIStatus);
  }

  /**
   * Générer l'APS automatique
   */
  async function handleGenerateAPS() {
    if (typeof APSGenerator === 'undefined') {
      showToast('Module APSGenerator non chargé', 'error');
      return false;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de générer l\'APS', 'error');
      return false;
    }

    try {
      // Couverture : façade photoréaliste du projet si elle existe, sinon vue 3D du studio, sinon rien.
      const [images, cabinet] = await Promise.all([projectImages(data), loadCabinet()]);
      const missing = missingNotice(data, cabinet);
      await APSGenerator.generateAPS(data, window.studio || window.RENDER_STUDIO || null, null, { coverImage: images.facade, cabinet });
      showToast(missing.message
        ? `✅ APS généré — ${missing.message} (masqués du cartouche).`
        : '✅ APS généré avec succès !', 'success');
      // `true` = PDF réellement composé : la chaîne complète s'appuie sur ce retour pour son rapport d'étape.
      return true;
    } catch (error) {
      console.error('Erreur génération APS:', error);
      showToast('Erreur lors de la génération de l\'APS : ' + error.message, 'error');
      return false;
    }
  }

  /**
   * Exporter le devis estimatif PDF (BQE en FCFA), complément du classeur .xlsx
   */
  async function exportDevisPdf() {
    const DevisPdfLib = (typeof window !== 'undefined' && window.DevisPdf) || null;
    if (!DevisPdfLib || typeof DevisPdfLib.exportPDF !== 'function') {
      showToast('Module Devis PDF non chargé', 'error');
      return false;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de générer le devis', 'error');
      return false;
    }

    try {
      const cabinet = await loadCabinet();
      const out = await DevisPdfLib.exportPDF(data, null, { cabinet });
      showToast(`💰 Devis estimatif PDF exporté (${out.pages} page${out.pages > 1 ? 's' : ''}).`, 'success');
      return true;
    } catch (error) {
      console.error('Erreur export devis PDF:', error);
      showToast('Erreur lors de l’export du devis PDF : ' + error.message, 'error');
      return false;
    }
  }

  /**
   * Exporter le dossier APD / Permis de construire (pièces PC-01 à PC-08 reliées en PDF)
   */
  async function exportApdDossier() {
    if (typeof ApdDossier === 'undefined' || !ApdDossier || typeof ApdDossier.exportPDF !== 'function') {
      showToast('Module Dossier APD non chargé', 'error');
      return false;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant d’exporter le dossier APD / Permis', 'error');
      return false;
    }

    try {
      const slug = await savedSlug(data);
      const [cabinet, media, planches] = await Promise.all([
        loadCabinet(),
        slug ? fetch(`api/gallery/media?project=${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
        slug ? fetch(`api/projects/${encodeURIComponent(slug)}/planches`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)
      ]);
      const planchesItems = Array.isArray(planches?.items) ? planches.items : [];
      const evaluation = ApdDossier.evaluate({ project: data, cabinet, media, planches: planchesItems });
      if (!evaluation.canExport) {
        showToast('Dossier APD / Permis : le plan ne contient pas encore de pièce exploitable', 'error');
        return false;
      }
      const out = await ApdDossier.exportPDF({ project: data, cabinet, media, planches: planchesItems, evaluation });
      showToast(`📑 Dossier APD / Permis exporté (${out.pages} pages, complétude ${evaluation.completeness} %).`, 'success');
      return true;
    } catch (error) {
      console.error('Erreur export dossier APD:', error);
      showToast('Erreur lors de l’export APD : ' + error.message, 'error');
      return false;
    }
  }

  // =====================================================================
  // EXPORT PDF PREMIUM
  // =====================================================================

  /**
   * Exporter le PDF premium
   */
  async function exportPremiumPDF() {
    if (typeof ClientBrochurePremium === 'undefined') {
      showToast('Module ClientBrochurePremium non chargé', 'error');
      return false;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de générer le catalogue', 'error');
      return false;
    }

    // Studio 3D facultatif : sans lui, le plan du rez-de-chaussée remplace les vues 3D.
    const studio = getStudio();

    try {
      const variant = window.currentVariant ? { ...window.currentVariant } : null;
      // Images photoréalistes du projet : elles priment sur le studio 3D et sur le plan.
      const [images, cabinet] = await Promise.all([projectImages(data), loadCabinet()]);
      const missing = missingNotice(data, cabinet);

      await ClientBrochurePremium.exportPDF(data, studio, variant, () => {}, {
        images,
        cabinet,
        style: currentStyle,
        includeStats: pdfOptions.includeStats,
        includePlan: pdfOptions.includePlan,
        includeInterior: pdfOptions.includeInterior
      });

      // Sauvegarder le style
      localStorage.setItem('pdf-style', currentStyle);

      showToast(missing.message
        ? `🎨 Catalogue premium généré — ${missing.message} (masqués du cartouche).`
        : '🎨 Catalogue premium généré avec succès !', 'success');
      // `true` = PDF réellement composé : la chaîne complète s'appuie sur ce retour pour son rapport d'étape.
      return true;
    } catch (error) {
      console.error('Erreur export premium:', error);
      showToast('Erreur lors de l\'export : ' + error.message, 'error');
      return false;
    }
  }

  // =====================================================================
  // APERÇU ET STATUT
  // =====================================================================

  /**
   * Mettre à jour l'aperçu
   */
  function updatePreview() {
    const preview = document.getElementById('premium-preview');
    if (!preview) return;

    // Retirer toutes les classes de style
    preview.classList.remove('agence', 'modern', 'luxury', 'industrial');
    
    // Ajouter la classe du style actuel
    preview.classList.add(currentStyle);

    // Mettre à jour les couleurs de l'aperçu
    const colors = getStyleColors(currentStyle);
    preview.style.background = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
  }

  /**
   * Mettre à jour le statut IA
   */
  function updateAIStatus() {
    const aiInfo = document.getElementById('premium-ai-info');
    const aiNone = document.getElementById('premium-ai-none');

    if (!aiInfo || !aiNone) return;

    const isEnhanced = typeof AIEnhance !== 'undefined' && AIEnhance.isEnhanced();

    if (isEnhanced) {
      aiInfo.hidden = false;
      aiNone.hidden = true;
    } else {
      aiInfo.hidden = true;
      aiNone.hidden = false;
    }
  }

  // =====================================================================
  // UTILITAIRES
  // =====================================================================

  /**
   * Obtenir les couleurs d'un style
   */
  function getStyleColors(style) {
    const styles = {
      agence: {
        primary: '#1d2620',
        secondary: '#202a23',
        accent: '#b78a3c'
      },
      luxury: {
        primary: '#064e3b',
        secondary: '#065f46',
        accent: '#d4af37'
      },
      industrial: {
        primary: '#1e293b',
        secondary: '#334155',
        accent: '#b87333'
      }
    };

    return styles[style] || styles.agence;
  }

  /**
   * Obtenir les données du projet
   */
  function getProjectData() {
    // Source principale : le projet complet tel que l'éditeur l'enregistre (tous niveaux).
    if (window.EditorAPI?.toProjectJson) return window.EditorAPI.toProjectJson();
    if (window.EDITOR_STATE) return window.EDITOR_STATE;
    if (window.projectData) return window.projectData;
    if (typeof getProject === 'function') return getProject();
    
    console.warn('[EditorPremium] Aucune donnée de projet trouvée');
    return null;
  }

  /**
   * Obtenir le studio 3D
   */
  function getStudio() {
    if (window.studio) return window.studio;
    if (window.RENDER_STUDIO) return window.RENDER_STUDIO;
    
    return null; // pas de studio 3D dans l'éditeur : cas normal
  }

  /**
   * Afficher une notification
   */
  function showToast(message, type = 'info') {
    const toast = document.getElementById('ed-toast');
    if (toast) {
      toast.textContent = message;
      toast.className = `ed-toast show ${type}`;
      setTimeout(() => {
        toast.classList.remove('show');
      }, 4000);
    }
  }

  // =====================================================================
  // DÉMARRAGE
  // =====================================================================

  window.EditorPremiumAPI = {
    generateAPS: handleGenerateAPS,
    exportCatalog: exportPremiumPDF,
    exportDevisPdf,
    exportApdDossier
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
