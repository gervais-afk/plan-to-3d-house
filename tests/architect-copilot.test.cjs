/**
 * TESTS UNITAIRES — Architect Copilot
 * 
 * Teste les fonctionnalités du module copilot :
 * - Gestion de conversation
 * - Suggestions contextuelles
 * - Calculs de métriques
 * - Actions rapides
 * - Historique
 */

const { test } = require('node:test');
const assert = require('node:assert');
const ArchitectCopilot = require('../js/architectCopilot.js');

// =========================================================================
// DONNÉES DE TEST
// =========================================================================

const mockProject = {
  name: 'Test Project',
  rooms: [
    { name: 'Séjour', area: 30, type: 'sejour', width: 6, depth: 5, habitable: true },
    { name: 'Chambre', area: 12, type: 'chambre', width: 4, depth: 3, habitable: true },
    { name: 'Cuisine', area: 10, type: 'cuisine', width: 4, depth: 2.5, habitable: true },
    { name: 'SDB', area: 6, type: 'sdb', width: 3, depth: 2, habitable: true }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], openings: [] },
    { from: [10, 0], to: [10, 8], openings: [] },
    { from: [10, 8], to: [0, 8], openings: [] },
    { from: [0, 8], to: [0, 0], openings: [] }
  ],
  totalArea: 58
};

// =========================================================================
// TESTS : GESTION DE CONVERSATION
// =========================================================================

test('Copilot - addMessage() devrait ajouter un message à l\'historique', () => {
  ArchitectCopilot.clearConversation();
  
  const message = ArchitectCopilot.addMessage('user', 'Test message');
  
  assert.strictEqual(message.role, 'user');
  assert.strictEqual(message.content, 'Test message');
  assert.ok(message.id > 0);
  assert.ok(message.timestamp instanceof Date);
});

test('Copilot - addMessage() devrait limiter l\'historique à 50 messages', () => {
  ArchitectCopilot.clearConversation();
  
  // Ajouter 60 messages
  for (let i = 0; i < 60; i++) {
    ArchitectCopilot.addMessage('user', `Message ${i}`);
  }
  
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 50);
});

test('Copilot - clearConversation() devrait effacer tous les messages', () => {
  ArchitectCopilot.addMessage('user', 'Test 1');
  ArchitectCopilot.addMessage('assistant', 'Test 2');
  
  ArchitectCopilot.clearConversation();
  
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 0);
});

test('Copilot - sendMessage() devrait simuler une réponse IA', async () => {
  ArchitectCopilot.clearConversation();
  
  const response = await ArchitectCopilot.sendMessage('Test question');
  
  assert.ok(typeof response === 'string');
  assert.ok(response.length > 0);
  
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 2); // user + assistant
  assert.strictEqual(state.messages[0].role, 'user');
  assert.strictEqual(state.messages[1].role, 'assistant');
});

// =========================================================================
// TESTS : SUGGESTIONS CONTEXTUELLES
// =========================================================================

test('Copilot - generateSuggestions() devrait suggérer des astuces pour outil mur', () => {
  const context = {
    currentTool: 'wall-ext',
    wallCount: 5
  };
  
  const suggestions = ArchitectCopilot.generateSuggestions(context);
  
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.some(s => s.type === 'tip'));
  assert.ok(suggestions.some(s => s.title.includes('Astuce')));
});

test('Copilot - generateSuggestions() devrait détecter une pièce trop petite', () => {
  const context = {
    selectedElement: {
      type: 'room',
      name: 'Petite chambre',
      area: 7,
      roomType: 'chambre'
    }
  };
  
  const suggestions = ArchitectCopilot.generateSuggestions(context);
  
  assert.ok(suggestions.some(s => s.type === 'warning'));
  assert.ok(suggestions.some(s => s.content.includes('9 m²')));
});

test('Copilot - generateSuggestions() devrait suggérer vérification conformité', () => {
  const context = {
    project: mockProject,
    rooms: mockProject.rooms,
    hasCheckedCompliance: false
  };
  
  const suggestions = ArchitectCopilot.generateSuggestions(context);
  
  assert.ok(suggestions.some(s => s.action === 'check-compliance'));
});

test('Copilot - generateSuggestions() devrait limiter à 3 suggestions', () => {
  const context = {
    currentTool: 'wall-ext',
    wallCount: 10,
    project: mockProject,
    rooms: mockProject.rooms,
    showEstimate: true,
    habitableArea: 58
  };
  
  const suggestions = ArchitectCopilot.generateSuggestions(context);
  
  assert.ok(suggestions.length <= 3);
});

test('Copilot - generateSuggestions() devrait suggérer calibration', () => {
  const context = {
    currentTool: 'calibrate'
  };
  
  const suggestions = ArchitectCopilot.generateSuggestions(context);
  
  assert.ok(suggestions.some(s => s.title.includes('Calibration')));
});

// =========================================================================
// TESTS : CALCULS DE MÉTRIQUES
// =========================================================================

test('Copilot - calculateMetrics() devrait calculer les surfaces correctement', () => {
  const metrics = ArchitectCopilot.calculateMetrics(mockProject);
  
  assert.strictEqual(metrics.totalArea, 58);
  assert.strictEqual(metrics.habitableArea, 58);
  assert.strictEqual(metrics.rooms, 4);
});

test('Copilot - calculateMetrics() devrait calculer la longueur des murs', () => {
  const metrics = ArchitectCopilot.calculateMetrics(mockProject);
  
  // Périmètre : 10 + 8 + 10 + 8 = 36m
  assert.strictEqual(metrics.wallLength, 36);
});

test('Copilot - calculateMetrics() devrait compter les ouvertures', () => {
  const projectWithOpenings = {
    ...mockProject,
    walls: mockProject.walls.map(w => ({
      ...w,
      openings: [{ type: 'window', at: 2, w: 1.2 }]
    }))
  };
  
  const metrics = ArchitectCopilot.calculateMetrics(projectWithOpenings);
  
  assert.strictEqual(metrics.openings, 4); // 4 murs × 1 ouverture
});

test('Copilot - calculateMetrics() devrait exclure les pièces non habitables', () => {
  const projectWithNonHabitable = {
    rooms: [
      { area: 30, habitable: true },
      { area: 10, habitable: true },
      { area: 5, habitable: false } // Garage
    ],
    walls: []
  };
  
  const metrics = ArchitectCopilot.calculateMetrics(projectWithNonHabitable);
  
  assert.strictEqual(metrics.totalArea, 45);
  assert.strictEqual(metrics.habitableArea, 40);
});

// =========================================================================
// TESTS : ACTIONS RAPIDES
// =========================================================================

test('Copilot - checkCompliance() devrait retourner une analyse', async () => {
  const response = await ArchitectCopilot.checkCompliance(mockProject);
  
  assert.ok(typeof response === 'string');
  assert.ok(response.length > 0);
});

test('Copilot - generateRoomVariants() devrait générer des variantes', async () => {
  const room = {
    type: 'sejour',
    area: 30,
    width: 6,
    depth: 5
  };
  
  const response = await ArchitectCopilot.generateRoomVariants(room);
  
  assert.ok(typeof response === 'string');
  assert.ok(response.length > 0);
});

test('Copilot - suggestImprovements() devrait proposer des améliorations', async () => {
  const response = await ArchitectCopilot.suggestImprovements(mockProject);
  
  assert.ok(typeof response === 'string');
  assert.ok(response.length > 0);
});

// =========================================================================
// TESTS : HISTORIQUE ET FAVORIS
// =========================================================================

test('Copilot - saveConversation() devrait sauvegarder une conversation', () => {
  ArchitectCopilot.clearConversation();
  ArchitectCopilot.addMessage('user', 'Test 1');
  ArchitectCopilot.addMessage('assistant', 'Réponse 1');
  
  const saved = ArchitectCopilot.saveConversation('Conversation test');
  
  assert.ok(saved.id > 0);
  assert.strictEqual(saved.name, 'Conversation test');
  assert.strictEqual(saved.messages.length, 2);
});

test('Copilot - loadConversation() devrait charger une conversation sauvegardée', () => {
  ArchitectCopilot.clearHistory(); // Nettoyer l'historique avant le test
  ArchitectCopilot.clearConversation();
  ArchitectCopilot.addMessage('user', 'Message original');
  
  const saved = ArchitectCopilot.saveConversation('Test load');
  const conversationId = saved.id;
  
  // Vérifier que la conversation a été sauvegardée
  assert.ok(saved !== null);
  assert.strictEqual(saved.messages.length, 1);
  
  ArchitectCopilot.clearConversation();
  const loaded = ArchitectCopilot.loadConversation(conversationId);
  
  assert.ok(loaded !== null);
  assert.strictEqual(loaded.messages.length, 1);
  assert.strictEqual(loaded.messages[0].content, 'Message original');
});

test('Copilot - clearHistory() devrait effacer tout l\'historique', () => {
  ArchitectCopilot.clearHistory(); // Nettoyer avant le test
  ArchitectCopilot.addMessage('user', 'Test');
  ArchitectCopilot.saveConversation('Conv 1');
  ArchitectCopilot.saveConversation('Conv 2');
  
  // Vérifier que les conversations ont été sauvegardées
  const stateBefore = ArchitectCopilot.getState();
  assert.strictEqual(stateBefore.history.length, 2);
  
  ArchitectCopilot.clearHistory();
  
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 0);
  assert.strictEqual(state.history.length, 0);
});

// =========================================================================
// TESTS : INTERFACE
// =========================================================================

test('Copilot - toggle() devrait basculer l\'état ouvert/fermé', () => {
  const initialState = ArchitectCopilot.getState().isOpen;
  
  ArchitectCopilot.toggle();
  assert.strictEqual(ArchitectCopilot.getState().isOpen, !initialState);
  
  ArchitectCopilot.toggle();
  assert.strictEqual(ArchitectCopilot.getState().isOpen, initialState);
});

test('Copilot - setTheme() devrait changer le thème', () => {
  ArchitectCopilot.setTheme('dark');
  assert.strictEqual(ArchitectCopilot.getState().theme, 'dark');
  
  ArchitectCopilot.setTheme('light');
  assert.strictEqual(ArchitectCopilot.getState().theme, 'light');
});

test('Copilot - getState() devrait retourner l\'état complet', () => {
  const state = ArchitectCopilot.getState();
  
  assert.ok('isOpen' in state);
  assert.ok('messages' in state);
  assert.ok('suggestions' in state);
  assert.ok('isListening' in state);
  assert.ok('theme' in state);
});

test('Copilot - handleKeyboard() devrait gérer Ctrl+K', () => {
  const initialOpen = ArchitectCopilot.getState().isOpen;
  
  const event = {
    ctrlKey: true,
    key: 'k',
    preventDefault: () => {}
  };
  
  const handled = ArchitectCopilot.handleKeyboard(event);
  
  assert.strictEqual(handled, true);
  assert.strictEqual(ArchitectCopilot.getState().isOpen, !initialOpen);
});

test('Copilot - handleKeyboard() devrait ignorer les touches non gérées', () => {
  const event = {
    ctrlKey: false,
    key: 'a',
    preventDefault: () => {}
  };
  
  const handled = ArchitectCopilot.handleKeyboard(event);
  
  assert.strictEqual(handled, false);
});

// =========================================================================
// TESTS : CONFIGURATION
// =========================================================================

test('Copilot - CONFIG devrait contenir les modèles IA', () => {
  assert.ok(ArchitectCopilot.CONFIG.models.conversation);
  assert.ok(ArchitectCopilot.CONFIG.models.quick);
  assert.ok(ArchitectCopilot.CONFIG.models.vision);
});

test('Copilot - CONFIG devrait contenir les paramètres de comportement', () => {
  assert.ok(typeof ArchitectCopilot.CONFIG.behavior.proactiveSuggestions === 'boolean');
  assert.ok(typeof ArchitectCopilot.CONFIG.behavior.voiceInput === 'boolean');
  assert.ok(ArchitectCopilot.CONFIG.behavior.maxSuggestions > 0);
});

test('Copilot - CONFIG devrait contenir les thèmes', () => {
  assert.ok(ArchitectCopilot.CONFIG.themes.light);
  assert.ok(ArchitectCopilot.CONFIG.themes.dark);
});

// =========================================================================
// TESTS : INTÉGRATION
// =========================================================================

test('Copilot - workflow complet : conversation + suggestions + métriques', async () => {
  ArchitectCopilot.clearConversation();
  
  // 1. Mise à jour du contexte
  const context = {
    project: mockProject,
    rooms: mockProject.rooms,
    currentTool: null,
    selectedElement: null
  };
  
  ArchitectCopilot.updateSuggestions(context);
  
  // 2. Vérifier les suggestions
  const suggestions = ArchitectCopilot.state.suggestions;
  assert.ok(suggestions.length > 0);
  
  // 3. Calculer les métriques
  const metrics = ArchitectCopilot.calculateMetrics(mockProject);
  assert.strictEqual(metrics.totalArea, 58);
  
  // 4. Envoyer un message
  const response = await ArchitectCopilot.sendMessage('Quelle est la surface totale ?');
  assert.ok(response.length > 0);
  
  // 5. Vérifier l'état final
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 2);
});

test('Copilot - gestion d\'erreur : réponse IA simulée en cas d\'erreur', async () => {
  // Simuler une erreur en passant un contexte invalide
  const response = await ArchitectCopilot.sendMessage('Test', { invalid: true });
  
  // Devrait retourner une réponse même en cas d'erreur
  assert.ok(typeof response === 'string');
  assert.ok(response.length > 0);
});

test('Copilot - persistance : messages conservés après toggle', () => {
  ArchitectCopilot.clearConversation();
  ArchitectCopilot.addMessage('user', 'Message persistant');
  
  ArchitectCopilot.toggle(); // Fermer
  ArchitectCopilot.toggle(); // Rouvrir
  
  const state = ArchitectCopilot.getState();
  assert.strictEqual(state.messages.length, 1);
  assert.strictEqual(state.messages[0].content, 'Message persistant');
});
