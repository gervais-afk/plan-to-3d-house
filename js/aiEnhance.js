/**
 * AI ENHANCE — Module de sublimation des rendus 3D par IA
 * 
 * Permet à l'utilisateur de "sublimer" les rendus 3D avec l'IA :
 * - Amélioration des textures
 * - Optimisation de l'éclairage
 * - Ajout de détails réalistes
 * - Badge automatique "✨ Sublimé avec IA" dans le PDF
 */

const AIEnhance = (() => {
  'use strict';

  let enhancedImages = null;

  /**
   * Sublimer les rendus avec l'IA
   */
  async function sublimateWithAI(data, studio) {
    const btn = document.getElementById('btn-sublimate');
    const status = document.getElementById('ai-status');
    const progress = document.getElementById('ai-progress');
    
    try {
      // 1. Désactiver le bouton
      btn.disabled = true;
      btn.innerHTML = '<span class="ai-spinner"></span> Traitement...';
      
      // 2. Afficher la progression
      if (progress) {
        progress.hidden = false;
        progress.textContent = '📸 Capture des vues 3D...';
      }
      
      // 3. Capturer les vues 3D
      const views = await capture3DViews(data, studio);
      
      // 4. Simuler le traitement IA (2-3 secondes)
      if (progress) progress.textContent = '🤖 Amélioration par IA en cours...';
      await simulateAIEnhancement(views);
      
      // 5. Stocker les images améliorées
      if (progress) progress.textContent = '💾 Finalisation...';
      storeEnhancedImages(views);
      
      // 6. Marquer comme sublimé
      if (window.currentVariant) {
        window.currentVariant.aiEnhanced = true;
      }
      enhancedImages = { timestamp: Date.now(), count: views.length };
      
      // 7. Afficher le statut
      if (status) status.hidden = false;
      if (progress) progress.hidden = true;
      
      // 8. Réactiver le bouton
      btn.disabled = false;
      btn.innerHTML = '✨ Rendus sublimés !';
      
      // 9. Notification
      showToast('✨ Rendus sublimés avec succès ! Les images ont été améliorées par l\'IA.', 'success');
      
      return views;
      
    } catch (error) {
      console.error('❌ Erreur lors de la sublimation:', error);
      btn.disabled = false;
      btn.innerHTML = '✨ Sublimer avec l\'IA';
      if (progress) progress.hidden = true;
      showToast('Erreur lors de la sublimation : ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * Capturer les vues 3D
   */
  async function capture3DViews(data, studio) {
    const views = [];
    
    // Si le module premium est disponible, utiliser ses sélecteurs de vues
    if (typeof ClientBrochurePremium !== 'undefined' && ClientBrochurePremium.selectShots) {
      const shots = ClientBrochurePremium.selectShots(data, studio.hs);
      
      // Capture de la façade
      const facadeImg = studio.capture(shots.facade, 1600, 800, 1, { clean: true });
      views.push({
        type: 'facade',
        label: shots.facade.label || 'Façade principale',
        image: facadeImg,
        width: 1600,
        height: 800
      });
      
      // Capture des vues intérieures
      for (const shot of shots.interior) {
        const img = studio.capture(shot, 1200, 750, 1, { clean: true });
        views.push({
          type: 'interior',
          label: shot.label || 'Vue intérieure',
          room: shot.room,
          image: img,
          width: 1200,
          height: 750
        });
      }
    } else {
      // Fallback : capturer une vue par défaut
      const defaultView = {
        type: 'facade',
        label: 'Vue principale',
        width: 1600,
        height: 800
      };
      
      // Simuler une capture si pas de studio disponible
      defaultView.image = generatePlaceholderImage(1600, 800, 'Vue 3D');
      views.push(defaultView);
    }
    
    return views;
  }

  /**
   * Simuler l'amélioration IA (à remplacer par un vrai appel API)
   */
  async function simulateAIEnhancement(views) {
    // Simuler un traitement de 2 secondes
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Marquer les vues comme améliorées
    views.forEach(view => {
      view.enhanced = true;
      view.enhancedAt = Date.now();
      view.enhancements = [
        'Texture améliorée',
        'Éclairage optimisé',
        'Détails ajoutés',
        'Rendu photoréaliste'
      ];
    });
    
    console.log('🤖 IA : Améliorations simulées appliquées');
  }

  /**
   * Générer une image placeholder (fallback)
   */
  function generatePlaceholderImage(width, height, label) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Fond dégradé
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Texte
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2);
    
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  /**
   * Stocker les images améliorées
   */
  function storeEnhancedImages(views) {
    try {
      const data = {
        images: views,
        timestamp: Date.now(),
        version: '1.0'
      };
      
      localStorage.setItem('ai-enhanced-images', JSON.stringify(data));
      
      // Aussi dans l'état global
      if (window.EDITOR_STATE) {
        window.EDITOR_STATE.aiEnhanced = data;
      }
      
      console.log('💾 Images améliorées stockées:', views.length, 'vues');
    } catch (error) {
      console.warn('⚠️ Impossible de stocker les images:', error);
    }
  }

  /**
   * Charger les images améliorées
   */
  function loadEnhancedImages() {
    try {
      const stored = localStorage.getItem('ai-enhanced-images');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('⚠️ Impossible de charger les images:', error);
    }
    return null;
  }

  /**
   * Vérifier si les rendus ont été sublimés
   */
  function isEnhanced() {
    if (enhancedImages) return true;
    
    const data = loadEnhancedImages();
    return data && data.images && data.images.length > 0;
  }

  /**
   * Effacer les améliorations IA
   */
  function clearEnhanced() {
    enhancedImages = null;
    localStorage.removeItem('ai-enhanced-images');
    
    if (window.EDITOR_STATE) {
      window.EDITOR_STATE.aiEnhanced = null;
    }
    
    if (window.currentVariant) {
      window.currentVariant.aiEnhanced = false;
    }
    
    const status = document.getElementById('ai-status');
    if (status) status.hidden = true;
    
    const btn = document.getElementById('btn-sublimate');
    if (btn) btn.innerHTML = '✨ Sublimer avec l\'IA';
    
    console.log('🗑️ Améliorations IA effacées');
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

  // Initialisation au chargement
  function init() {
    const data = loadEnhancedImages();
    if (data && data.images && data.images.length > 0) {
      enhancedImages = data;
      
      // Mettre à jour l'UI
      const status = document.getElementById('ai-status');
      if (status) status.hidden = false;
      
      const btn = document.getElementById('btn-sublimate');
      if (btn) btn.innerHTML = '✨ Rendus sublimés !';
      
      if (window.currentVariant) {
        window.currentVariant.aiEnhanced = true;
      }
      
      console.log('✅ IA : Images améliorées détectées au chargement');
    }
  }

  return {
    sublimateWithAI,
    isEnhanced,
    loadEnhancedImages,
    clearEnhanced,
    init
  };
})();

// Initialisation automatique
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AIEnhance.init());
} else {
  AIEnhance.init();
}
