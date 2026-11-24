/**
 * REALTIME COLLABORATION — Collaboration temps réel
 * 
 * Permet à plusieurs utilisateurs de travailler simultanément sur un projet :
 * - Synchronisation des modifications en temps réel
 * - Gestion des conflits
 * - Présence et cursors des collaborateurs
 * - Historique des modifications
 * 
 * Architecture :
 * - Client : détecte les modifications et les envoie au serveur
 * - Serveur : propage les modifications à tous les clients connectés
 * - Résolution de conflits : last-write-wins avec historique
 * 
 * Compatible navigateur et Node.js.
 */
const RealtimeCollaboration = (() => {
  'use strict';

  // =====================================================================
  // ÉTAT DE LA SESSION
  // =====================================================================

  const sessions = new Map(); // sessionId → session state

  /**
   * Crée une nouvelle session de collaboration.
   * @param {string} projectId
   * @param {object} initialProject
   * @returns {object} — session
   */
  function createSession(projectId, initialProject) {
    const sessionId = generateSessionId();
    
    const session = {
      id: sessionId,
      projectId,
      project: JSON.parse(JSON.stringify(initialProject)),
      initialProject: JSON.parse(JSON.stringify(initialProject)), // Copie de sauvegarde
      users: new Map(), // userId → user info
      history: [],
      version: 1,
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    sessions.set(sessionId, session);
    return session;
  }

  /**
   * Rejoint une session existante.
   * @param {string} sessionId
   * @param {object} userInfo — { id, name, color }
   * @returns {object} — session state
   */
  function joinSession(sessionId, userInfo) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} non trouvée`);
    }
    
    const user = {
      id: userInfo.id || generateUserId(),
      name: userInfo.name || 'Utilisateur',
      color: userInfo.color || generateColor(),
      cursor: null,
      selection: null,
      joinedAt: Date.now()
    };
    
    session.users.set(user.id, user);
    
    return {
      session: {
        id: session.id,
        projectId: session.projectId,
        project: session.project,
        version: session.version,
        users: Array.from(session.users.values())
      },
      user
    };
  }

  /**
   * Quitte une session.
   * @param {string} sessionId
   * @param {string} userId
   */
  function leaveSession(sessionId, userId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    session.users.delete(userId);
    
    // Si plus personne, nettoyer la session après 5 minutes
    if (session.users.size === 0) {
      const cleanupTimer = setTimeout(() => {
        if (sessions.has(sessionId) && sessions.get(sessionId).users.size === 0) {
          sessions.delete(sessionId);
        }
      }, 5 * 60 * 1000);
      // Sous Node.js, ce minuteur ne doit pas empêcher le processus de se terminer.
      if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
    }
  }

  // =====================================================================
  // SYNCHRONISATION DES MODIFICATIONS
  // =====================================================================

  /**
   * Applique une modification au projet.
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} change — { type, path, value, oldValue }
   * @returns {object} — résultat
   */
  function applyChange(sessionId, userId, change) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} non trouvée`);
    }
    
    const user = session.users.get(userId);
    if (!user) {
      throw new Error(`Utilisateur ${userId} non trouvé dans la session`);
    }
    
    // Appliquer la modification
    const oldValue = applyChangeToProject(session.project, change);
    
    // Incrémenter la version
    session.version++;
    
    // Enregistrer dans l'historique avec la NOUVELLE version
    session.history.push({
      id: generateChangeId(),
      userId,
      userName: user.name,
      change: { ...change, oldValue },
      timestamp: Date.now(),
      version: session.version
    });
    
    // Limiter l'historique à 1000 entrées
    if (session.history.length > 1000) {
      session.history = session.history.slice(-1000);
    }
    
    session.lastModified = Date.now();
    
    return {
      success: true,
      version: session.version,
      changeId: session.history[session.history.length - 1].id
    };
  }

  /**
   * Applique une modification au projet.
   */
  function applyChangeToProject(project, change) {
    const { type, path, value } = change;
    
    // Naviguer vers le chemin
    const parts = path.split('.');
    let current = project;
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
      if (!current) return null;
    }
    
    const key = parts[parts.length - 1];
    const oldValue = current[key];
    
    switch (type) {
      case 'set':
        current[key] = value;
        break;
      case 'delete':
        delete current[key];
        break;
      case 'push':
        if (Array.isArray(current[key])) {
          current[key].push(value);
        }
        break;
      case 'splice':
        if (Array.isArray(current[key]) && value.index !== undefined) {
          current[key].splice(value.index, value.deleteCount || 0, ...(value.items || []));
        }
        break;
    }
    
    return oldValue;
  }

  /**
   * Annule la dernière modification d'un utilisateur.
   * @param {string} sessionId
   * @param {string} userId
   * @returns {object} — résultat
   */
  function undo(sessionId, userId) {
    const session = sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session non trouvée' };
    
    // Trouver la dernière modification de cet utilisateur
    const userChanges = session.history.filter(h => h.userId === userId);
    if (userChanges.length === 0) {
      return { success: false, error: 'Aucune modification à annuler' };
    }
    
    const lastChange = userChanges[userChanges.length - 1];
    
    // Appliquer l'inverse
    const inverseChange = {
      type: 'set',
      path: lastChange.change.path,
      value: lastChange.change.oldValue
    };
    
    applyChangeToProject(session.project, inverseChange);
    
    // Retirer de l'historique
    const index = session.history.indexOf(lastChange);
    if (index !== -1) {
      session.history.splice(index, 1);
    }
    
    session.version++;
    session.lastModified = Date.now();
    
    return { success: true, version: session.version };
  }

  // =====================================================================
  // PRÉSENCE ET CURSORS
  // =====================================================================

  /**
   * Met à jour la position du cursor d'un utilisateur.
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} cursor — { x, y }
   */
  function updateCursor(sessionId, userId, cursor) {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    const user = session.users.get(userId);
    if (user) {
      user.cursor = cursor;
      user.lastActivity = Date.now();
    }
  }

  /**
   * Met à jour la sélection d'un utilisateur.
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} selection — { type, id }
   */
  function updateSelection(sessionId, userId, selection) {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    const user = session.users.get(userId);
    if (user) {
      user.selection = selection;
      user.lastActivity = Date.now();
    }
  }

  /**
   * Récupère les positions des autres utilisateurs.
   * @param {string} sessionId
   * @param {string} userId
   * @returns {Array} — liste des autres utilisateurs
   */
  function getOtherUsers(sessionId, userId) {
    const session = sessions.get(sessionId);
    if (!session) return [];
    
    return Array.from(session.users.values())
      .filter(u => u.id !== userId)
      .map(u => ({
        id: u.id,
        name: u.name,
        color: u.color,
        cursor: u.cursor,
        selection: u.selection
      }));
  }

  // =====================================================================
  // GESTION DES CONFLITS
  // =====================================================================

  /**
   * Vérifie les conflits de modification.
   * @param {string} sessionId
   * @param {number} clientVersion
   * @returns {object} — { hasConflict, changes }
   */
  function checkConflicts(sessionId, clientVersion) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { hasConflict: false, changes: [] };
    }
    
    if (clientVersion >= session.version) {
      return { hasConflict: false, changes: [] };
    }
    
    // Récupérer les modifications depuis la version du client
    const changes = session.history
      .filter(h => h.version > clientVersion)
      .map(h => h.change);
    
    return {
      hasConflict: changes.length > 0,
      changes
    };
  }

  /**
   * Résout un conflit (last-write-wins).
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} clientChange
   * @returns {object} — résultat
   */
  function resolveConflict(sessionId, userId, clientChange) {
    // Stratégie simple : le dernier changement gagne
    return applyChange(sessionId, userId, clientChange);
  }

  // =====================================================================
  // HISTORIQUE ET VERSIONING
  // =====================================================================

  /**
   * Récupère l'historique des modifications.
   * @param {string} sessionId
   * @param {object} options — { limit, offset }
   * @returns {Array} — historique
   */
  function getHistory(sessionId, options = {}) {
    const session = sessions.get(sessionId);
    if (!session) return [];
    
    const { limit = 100, offset = 0 } = options;
    
    return session.history
      .slice(offset, offset + limit)
      .map(h => ({
        id: h.id,
        userId: h.userId,
        userName: h.userName,
        change: h.change,
        timestamp: h.timestamp,
        version: h.version
      }));
  }

  /**
   * Restaure une version précédente.
   * @param {string} sessionId
   * @param {number} version
   * @returns {object} — résultat
   */
  function restoreVersion(sessionId, version) {
    const session = sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session non trouvée' };
    
    if (version < 1 || version > session.version) {
      return { success: false, error: 'Version invalide' };
    }
    
    // Reconstruire le projet depuis l'état initial
    let restoredProject = JSON.parse(JSON.stringify(session.initialProject));
    
    // Appliquer les modifications jusqu'à la version cible
    const changes = session.history.filter(h => h.version <= version);
    
    for (const change of changes) {
      applyChangeToProject(restoredProject, change.change);
    }
    
    session.project = restoredProject;
    session.version++;
    session.lastModified = Date.now();
    
    return { success: true, version: session.version };
  }

  // =====================================================================
  // UTILITAIRES
  // =====================================================================

  function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function generateChangeId() {
    return 'change_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function generateColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Sessions
    createSession,
    joinSession,
    leaveSession,
    
    // Modifications
    applyChange,
    undo,
    
    // Présence
    updateCursor,
    updateSelection,
    getOtherUsers,
    
    // Conflits
    checkConflicts,
    resolveConflict,
    
    // Historique
    getHistory,
    restoreVersion,
    
    // État
    sessions
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealtimeCollaboration;
}
