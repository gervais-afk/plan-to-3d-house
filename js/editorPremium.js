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

  let currentStyle = 'modern';
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
    if (savedStyle && ['modern', 'luxury', 'industrial'].includes(savedStyle)) {
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

    // La sublimation retravaille des vues 3D : sans studio 3D (cas de l'éditeur), il n'y a rien
    // à sublimer. On le dit clairement plutôt que de marquer des images inexistantes comme « améliorées ».
    const studio = getStudio();
    if (!studio) {
      showToast('La sublimation IA a besoin des vues 3D de la visite, que l\'éditeur ne calcule pas. Le catalogue premium utilise le plan à la place.', 'info');
      return;
    }

    try {
      await AIEnhance.sublimateWithAI(data, studio);
      updateAIStatus();
    } catch (error) {
      console.error('Erreur sublimation:', error);
    }
  }

  /**
   * Ouvrir le dialogue d'export premium
   */
  function handleExportPremium() {
    const dlgPremium = document.getElementById('dlg-premium');
    if (dlgPremium) {
      dlgPremium.showModal();
    }
  }

  /**
   * Générer l'APS automatique
   */
  async function handleGenerateAPS() {
    if (typeof APSGenerator === 'undefined') {
      showToast('Module APSGenerator non chargé', 'error');
      return;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de générer l\'APS', 'error');
      return;
    }

    try {
      // La vue 3D de couverture est facultative : l'éditeur n'a pas toujours de studio 3D.
      await APSGenerator.generateAPS(data, window.studio || window.RENDER_STUDIO || null);
      showToast('✅ APS généré avec succès !', 'success');
    } catch (error) {
      console.error('Erreur génération APS:', error);
      showToast('Erreur lors de la génération de l\'APS : ' + error.message, 'error');
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
      return;
    }

    const data = getProjectData();
    if (!data || !data.rooms?.length) {
      showToast('Dessinez au moins une pièce avant de générer le catalogue', 'error');
      return;
    }

    // Studio 3D facultatif : sans lui, le plan du rez-de-chaussée remplace les vues 3D.
    const studio = getStudio();

    try {
      const variant = window.currentVariant ? { ...window.currentVariant } : null;
      // Le badge « sublimé » n'a de sens que si des vues 3D ont réellement été traitées.
      if (variant && studio && typeof AIEnhance !== 'undefined' && AIEnhance.isEnhanced()) {
        variant.aiEnhanced = true;
      }

      await ClientBrochurePremium.exportPDF(data, studio, variant, () => {}, {
        style: currentStyle,
        includeStats: pdfOptions.includeStats,
        includePlan: pdfOptions.includePlan,
        includeInterior: pdfOptions.includeInterior
      });

      // Sauvegarder le style
      localStorage.setItem('pdf-style', currentStyle);

      showToast('🎨 Catalogue premium généré avec succès !', 'success');

    } catch (error) {
      console.error('Erreur export premium:', error);
      showToast('Erreur lors de l\'export : ' + error.message, 'error');
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
    preview.classList.remove('modern', 'luxury', 'industrial');
    
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
      modern: {
        primary: '#1a1a2e',
        secondary: '#16213e',
        accent: '#e94560'
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

    return styles[style] || styles.modern;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
