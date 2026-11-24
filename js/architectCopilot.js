/**
 * ARCHITECT COPILOT — Assistant IA intelligent pour architectes
 * 
 * Copilot flottant qui guide l'architecte dans ses missions :
 * - Suggestions contextuelles (basées sur l'action en cours)
 * - Vérification conformité en temps réel
 * - Aide au dessin intelligent
 * - Calculs instantanés (métrés, surfaces, conformité)
 * - Réponses aux questions techniques
 * - Propositions d'optimisation
 * 
 * Compatible navigateur et Node.js
 */

const ArchitectCopilot = (() => {
  // =========================================================================
  // CONFIGURATION
  // =========================================================================
  
  const CONFIG = {
    // Modèles IA recommandés
    models: {
      conversation: 'anthropic/claude-sonnet-5.5', // Dialogue principal
      quick: 'anthropic/claude-haiku',             // Réponses rapides
      vision: 'anthropic/claude-sonnet-5.5'        // Analyse visuelle
    },
    
    // Comportement
    behavior: {
      proactiveSuggestions: true,    // Suggestions automatiques
      voiceInput: true,              // Reconnaissance vocale
      contextualAwareness: true,     // Conscient du contexte
      maxSuggestions: 3,             // Nombre max de suggestions affichées
      suggestionDelay: 1500,         // Délai avant suggestion (ms)
      cacheHistory: true             // Historique des conversations
    },
    
    // Thèmes UI
    themes: {
      light: {
        background: '#FFFFFF',
        text: '#1a1a1a',
        accent: '#b78a3c',
        border: '#e5e5e5'
      },
      dark: {
        background: '#1a1a1a',
        text: '#f5f5f5',
        accent: '#d4a574',
        border: '#333333'
      }
    }
  };
  
  // =========================================================================
  // ÉTAT GLOBAL
  // =========================================================================
  
  const state = {
    isOpen: false,
    messages: [],
    currentContext: null,
    suggestions: [],
    isListening: false,
    theme: 'light',
    history: []
  };
  
  // =========================================================================
  // GESTIONNAIRE DE CONVERSATION
  // =========================================================================
  
  /**
   * Ajoute un message à l'historique
   */
  function addMessage(role, content, metadata = {}) {
    const message = {
      id: Date.now(),
      role,
      content,
      timestamp: new Date(),
      metadata
    };
    
    state.messages.push(message);
    
    // Limiter l'historique à 50 messages
    if (state.messages.length > 50) {
      state.messages = state.messages.slice(-50);
    }
    
    return message;
  }
  
  /**
   * Envoie un message à l'IA et reçoit une réponse
   */
  async function sendMessage(userMessage, context = {}) {
    addMessage('user', userMessage, context);
    
    try {
      // Construction du prompt avec contexte
      const prompt = buildPrompt(userMessage, context);
      
      // Appel à l'API IA (via le relais serveur)
      const response = await callAI(prompt, context.model || CONFIG.models.conversation);
      
      addMessage('assistant', response, { context });
      
      return response;
    } catch (error) {
      const errorMsg = `Désolé, une erreur s'est produite : ${error.message}`;
      addMessage('assistant', errorMsg, { error: true });
      return errorMsg;
    }
  }
  
  /**
   * Construit le prompt avec contexte architectural
   */
  function buildPrompt(userMessage, context) {
    const systemContext = `Tu es un assistant IA expert en architecture, spécialisé dans :
- Conception de bâtiments résidentiels
- Normes françaises (PLU, RE2020, accessibilité PMR)
- Métrés et estimation des coûts
- Dessin technique et plans 2D
- Vérification de conformité
- Optimisation spatiale

Contexte actuel :
${context.project ? `- Projet : ${context.project.name || 'Sans nom'}` : ''}
${context.surface ? `- Surface totale : ${context.surface} m²` : ''}
${context.rooms ? `- Pièces : ${context.rooms.length}` : ''}
${context.currentTool ? `- Outil actif : ${context.currentTool}` : ''}
${context.selectedElement ? `- Élément sélectionné : ${context.selectedElement.type}` : ''}

Sois concis, précis et pratique. Utilise le vocabulaire architectural professionnel.
Propose des solutions concrètes avec des valeurs chiffrées quand possible.`;
    
    return `${systemContext}\n\nQuestion : ${userMessage}`;
  }
  
  /**
   * Appelle l'API IA
   */
  async function callAI(prompt, model) {
    // Simulation pour Node.js (tests)
    if (typeof window === 'undefined') {
      return simulateAIResponse(prompt);
    }
    
    // Appel réel via le relais serveur
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.split('\n\n')[0] },
          { role: 'user', content: prompt.split('\n\n').slice(1).join('\n\n') }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API : ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  /**
   * Simule une réponse IA (pour tests)
   */
  function simulateAIResponse(prompt) {
    if (prompt.includes('conformité')) {
      return "D'après mon analyse, votre plan respecte les normes PMR : largeur de circulation 1,40m (> 1,20m requis), porte d'entrée 0,90m (conforme). Cependant, la salle de bain du RDC ne dispose pas d'espace de rotation suffisant (Ø 1,30m au lieu de 1,50m requis).";
    }
    if (prompt.includes('optimis')) {
      return "Je suggère 3 optimisations :\n1. Déplacer la cuisine contre le mur nord pour créer une ouverture vers le séjour (gain de 4m²)\n2. Réduire le couloir de 0,20m (passage de 1,40m à 1,20m, conforme PMR)\n3. Ajouter une fenêtre au sud dans le séjour (+15% luminosité)";
    }
    return "Je comprends votre question. Pour vous répondre précisément, j'ai besoin de plus de contexte sur votre projet. Pouvez-vous me préciser les dimensions ou les contraintes spécifiques ?";
  }
  
  // =========================================================================
  // SUGGESTIONS CONTEXTUELLES
  // =========================================================================
  
  /**
   * Génère des suggestions basées sur le contexte actuel
   */
  function generateSuggestions(context) {
    const suggestions = [];
    
    // Contexte : dessin de murs
    if (context.currentTool === 'wall-ext' || context.currentTool === 'wall-int') {
      suggestions.push({
        type: 'tip',
        icon: '💡',
        title: 'Astuce de dessin',
        content: 'Cliquez point par point pour tracer vos murs. Appuyez sur Échap pour terminer.',
        action: null
      });
      
      if (context.wallCount > 0) {
        suggestions.push({
          type: 'check',
          icon: '✓',
          title: 'Vérification automatique',
          content: `Vous avez tracé ${context.wallCount} murs. Voulez-vous vérifier la fermeture du contour ?`,
          action: 'check-closure'
        });
      }
    }
    
    // Contexte : pièce sélectionnée
    if (context.selectedElement?.type === 'room') {
      const room = context.selectedElement;
      suggestions.push({
        type: 'info',
        icon: '📐',
        title: 'Surface de la pièce',
        content: `${room.name} : ${room.area.toFixed(1)} m²`,
        action: null
      });
      
      if (room.area < 9 && room.roomType === 'chambre') {
        suggestions.push({
          type: 'warning',
          icon: '⚠️',
          title: 'Non-conformité détectée',
          content: 'Chambre < 9 m² (minimum réglementaire). Agrandir ou changer la destination.',
          action: 'suggest-enlarge'
        });
      }
      
      if (room.area >= 9) {
        suggestions.push({
          type: 'action',
          icon: '✨',
          title: 'Optimiser cette pièce',
          content: 'Générer 3 variantes d\'agencement pour cette pièce',
          action: 'generate-variants'
        });
      }
    }
    
    // Contexte : projet complet
    if (context.project && context.rooms) {
      const totalArea = context.rooms.reduce((sum, r) => sum + r.area, 0);
      
      if (totalArea > 0 && !context.hasCheckedCompliance) {
        suggestions.push({
          type: 'action',
          icon: '🔍',
          title: 'Vérifier la conformité',
          content: 'Analyser le plan selon PLU, RE2020 et PMR',
          action: 'check-compliance'
        });
      }
      
      const bedrooms = context.rooms.filter(r => r.type === 'chambre');
      if (bedrooms.length === 0 && context.rooms.length > 2) {
        suggestions.push({
          type: 'tip',
          icon: '💡',
          title: 'Suggestion',
          content: 'Vous n\'avez pas défini de chambres. Voulez-vous en ajouter ?',
          action: 'add-bedroom'
        });
      }
    }
    
    // Contexte : calibration
    if (context.currentTool === 'calibrate') {
      suggestions.push({
        type: 'tip',
        icon: '📏',
        title: 'Calibration',
        content: 'Cliquez sur les deux extrémités d\'une cote connue, puis entrez sa longueur réelle.',
        action: null
      });
    }
    
    // Contexte : métrés
    if (context.showEstimate) {
      suggestions.push({
        type: 'info',
        icon: '💰',
        title: 'Estimation rapide',
        content: `Surface habitable : ${context.habitableArea?.toFixed(0) || 0} m²`,
        action: 'show-full-estimate'
      });
    }
    
    // Limiter le nombre de suggestions
    return suggestions.slice(0, CONFIG.behavior.maxSuggestions);
  }
  
  /**
   * Met à jour les suggestions (appelé à chaque changement de contexte)
   */
  function updateSuggestions(context) {
    if (!CONFIG.behavior.proactiveSuggestions) return;
    
    state.currentContext = context;
    state.suggestions = generateSuggestions(context);
    
    // Déclencher un événement UI
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('copilot-suggestions-updated', {
        detail: { suggestions: state.suggestions }
      }));
    }
  }
  
  // =========================================================================
  // ACTIONS RAPIDES
  // =========================================================================
  
  /**
   * Vérifie la conformité du projet
   */
  async function checkCompliance(project) {
    const prompt = `Analyse ce projet architectural et vérifie la conformité :
    
Surface totale : ${project.totalArea} m²
Pièces : ${project.rooms.map(r => `${r.name} (${r.area}m²)`).join(', ')}

Vérifie :
1. Normes d'habitabilité (surfaces minimales, éclairage)
2. Accessibilité PMR (largeurs, circulations)
3. RE2020 (isolation, baies vitrées)

Retourne un rapport concis avec conformités ✓ et non-conformités ✗.`;
    
    return await sendMessage(prompt, { project });
  }
  
  /**
   * Génère des variantes pour une pièce
   */
  async function generateRoomVariants(room) {
    const prompt = `Propose 3 variantes d'agencement pour cette pièce :
    
Type : ${room.type}
Surface : ${room.area} m²
Dimensions : ${room.width}m × ${room.depth}m

Pour chaque variante :
- Décris l'agencement
- Avantages/inconvénients
- Gain spatial si applicable

Sois concret et pratique.`;
    
    return await sendMessage(prompt, { room });
  }
  
  /**
   * Calcule les métrés instantanément
   */
  function calculateMetrics(project) {
    const metrics = {
      totalArea: 0,
      habitableArea: 0,
      wallLength: 0,
      openings: 0,
      rooms: project.rooms.length
    };
    
    project.rooms.forEach(room => {
      metrics.totalArea += room.area;
      if (room.habitable !== false) {
        metrics.habitableArea += room.area;
      }
    });
    
    project.walls.forEach(wall => {
      const length = Math.hypot(
        wall.to[0] - wall.from[0],
        wall.to[1] - wall.from[1]
      );
      metrics.wallLength += length;
      metrics.openings += (wall.openings || []).length;
    });
    
    return metrics;
  }
  
  /**
   * Suggère des améliorations
   */
  async function suggestImprovements(project) {
    const prompt = `Analyse ce plan et propose 3 améliorations concrètes :
    
${project.rooms.length} pièces, ${project.totalArea} m² total

Considère :
- Optimisation spatiale (réduction circulations)
- Confort (éclairage naturel, ventilation)
- Conformité (normes en vigueur)
- Esthétique (proportions, vues)

Pour chaque amélioration :
- Description
- Gain estimé
- Complexité de mise en œuvre`;
    
    return await sendMessage(prompt, { project });
  }
  
  // =========================================================================
  // RECONNAISSANCE VOCALE
  // =========================================================================
  
  /**
   * Active/désactive la reconnaissance vocale
   */
  function toggleVoiceInput() {
    if (typeof window === 'undefined' || !window.SpeechRecognition) {
      return { error: 'Reconnaissance vocale non supportée par ce navigateur' };
    }
    
    if (state.isListening) {
      stopVoiceInput();
      return { listening: false };
    }
    
    startVoiceInput();
    return { listening: true };
  }
  
  /**
   * Démarre la reconnaissance vocale
   */
  function startVoiceInput() {
    if (typeof window === 'undefined') return;
    
    const recognition = new window.SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      addMessage('user', transcript, { voice: true });
      
      // Déclencher un événement UI
      window.dispatchEvent(new CustomEvent('copilot-voice-result', {
        detail: { transcript }
      }));
    };
    
    recognition.onerror = (event) => {
      console.error('Erreur reconnaissance vocale:', event.error);
      state.isListening = false;
    };
    
    recognition.onend = () => {
      state.isListening = false;
    };
    
    recognition.start();
    state.isListening = true;
  }
  
  /**
   * Arrête la reconnaissance vocale
   */
  function stopVoiceInput() {
    // La reconnaissance s'arrête automatiquement après onresult
    state.isListening = false;
  }
  
  // =========================================================================
  // HISTORIQUE ET FAVORIS
  // =========================================================================
  
  /**
   * Sauvegarde une conversation en favori
   */
  function saveConversation(name) {
    const messagesCopy = [];
    for (let i = 0; i < state.messages.length; i++) {
      const m = state.messages[i];
      messagesCopy.push({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        metadata: m.metadata ? {...m.metadata} : {}
      });
    }
    
    const conversation = {
      id: Date.now(),
      name,
      messages: messagesCopy,
      timestamp: new Date()
    };
    
    state.history.push(conversation);
    
    // Persistance localStorage
    if (typeof localStorage !== 'undefined') {
      const saved = JSON.parse(localStorage.getItem('copilot-history') || '[]');
      saved.push(conversation);
      localStorage.setItem('copilot-history', JSON.stringify(saved));
    }
    
    return conversation;
  }
  
  /**
   * Charge une conversation sauvegardée
   */
  function loadConversation(id) {
    const conversation = state.history.find(c => c.id === id);
    if (conversation && Array.isArray(conversation.messages)) {
      const messagesCopy = [];
      for (let i = 0; i < conversation.messages.length; i++) {
        const m = conversation.messages[i];
        messagesCopy.push({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata ? {...m.metadata} : {}
        });
      }
      state.messages = messagesCopy;
      return conversation;
    }
    return null;
  }
  
  /**
   * Efface l'historique
   */
  function clearHistory() {
    state.messages = [];
    state.history.splice(0, state.history.length); // Vider le tableau
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('copilot-history');
    }
  }
  
  // =========================================================================
  // RACCOURCIS CLAVIER
  // =========================================================================
  
  /**
   * Gère les raccourcis clavier
   */
  function handleKeyboard(event) {
    // Ctrl+K : Ouvrir/fermer le copilot
    if (event.ctrlKey && event.key === 'k') {
      event.preventDefault();
      toggle();
      return true;
    }
    
    // Ctrl+L : Effacer la conversation
    if (event.ctrlKey && event.key === 'l') {
      event.preventDefault();
      clearConversation();
      return true;
    }
    
    // Ctrl+M : Activer/désactiver le micro
    if (event.ctrlKey && event.key === 'm') {
      event.preventDefault();
      toggleVoiceInput();
      return true;
    }
    
    return false;
  }
  
  /**
   * Efface la conversation actuelle
   */
  function clearConversation() {
    state.messages = [];
    state.suggestions = [];
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('copilot-conversation-cleared'));
    }
  }
  
  // =========================================================================
  // INTERFACE UI
  // =========================================================================
  
  /**
   * Ouvre/ferme le panneau du copilot
   */
  function toggle() {
    state.isOpen = !state.isOpen;
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('copilot-toggled', {
        detail: { isOpen: state.isOpen }
      }));
    }
    
    return state.isOpen;
  }
  
  /**
   * Retourne l'état actuel
   */
  function getState() {
    return {
      isOpen: state.isOpen,
      messages: state.messages,
      suggestions: state.suggestions,
      isListening: state.isListening,
      theme: state.theme,
      history: state.history
    };
  }
  
  /**
   * Change le thème
   */
  function setTheme(theme) {
    if (CONFIG.themes[theme]) {
      state.theme = theme;
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('copilot-theme-changed', {
          detail: { theme }
        }));
      }
    }
  }
  
  // =========================================================================
  // EXPORT API
  // =========================================================================
  
  return {
    // Configuration
    CONFIG,
    
    // Conversation
    sendMessage,
    addMessage,
    clearConversation,
    
    // Suggestions
    updateSuggestions,
    generateSuggestions,
    
    // Actions rapides
    checkCompliance,
    generateRoomVariants,
    calculateMetrics,
    suggestImprovements,
    
    // Voix
    toggleVoiceInput,
    
    // Historique
    saveConversation,
    loadConversation,
    clearHistory,
    
    // UI
    toggle,
    getState,
    setTheme,
    handleKeyboard,
    
    // État
    state
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArchitectCopilot;
}
