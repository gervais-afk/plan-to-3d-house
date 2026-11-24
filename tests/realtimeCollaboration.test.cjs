/**
 * TESTS UNITAIRES — realtimeCollaboration.js
 * Collaboration temps réel
 */

const { test } = require('node:test');
const assert = require('node:assert');
const RealtimeCollaboration = require('../js/realtimeCollaboration.js');

// =========================================================================
// MOCK DATA
// =========================================================================

const mockProject = {
  name: 'Test Project',
  rooms: [
    { id: 'sejour', name: 'Séjour', area: 30 }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25 }
  ]
};

// =========================================================================
// GESTION DES SESSIONS
// =========================================================================

test('RealtimeCollaboration - createSession() crée une session', () => {
  const session = RealtimeCollaboration.createSession('project-1', mockProject);
  
  assert.ok(session.id);
  assert.strictEqual(session.projectId, 'project-1');
  assert.ok(session.project);
  assert.strictEqual(session.version, 1);
  assert.strictEqual(session.users.size, 0);
});

test('RealtimeCollaboration - joinSession() rejoint une session', () => {
  const session = RealtimeCollaboration.createSession('project-2', mockProject);
  const result = RealtimeCollaboration.joinSession(session.id, {
    id: 'user-1',
    name: 'Alice',
    color: '#FF0000'
  });
  
  assert.ok(result.session);
  assert.ok(result.user);
  assert.strictEqual(result.user.id, 'user-1');
  assert.strictEqual(result.user.name, 'Alice');
  assert.strictEqual(result.session.users.length, 1);
});

test('RealtimeCollaboration - joinSession() échoue si session inexistante', () => {
  assert.throws(() => {
    RealtimeCollaboration.joinSession('invalid-session', { id: 'user-1' });
  }, /non trouvée/);
});

test('RealtimeCollaboration - leaveSession() quitte une session', () => {
  const session = RealtimeCollaboration.createSession('project-3', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1', name: 'Alice' });
  
  assert.strictEqual(session.users.size, 1);
  
  RealtimeCollaboration.leaveSession(session.id, 'user-1');
  
  assert.strictEqual(session.users.size, 0);
});

test('RealtimeCollaboration - plusieurs utilisateurs dans une session', () => {
  const session = RealtimeCollaboration.createSession('project-4', mockProject);
  
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1', name: 'Alice' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-2', name: 'Bob' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-3', name: 'Charlie' });
  
  assert.strictEqual(session.users.size, 3);
  
  const users = Array.from(session.users.values());
  assert.strictEqual(users[0].name, 'Alice');
  assert.strictEqual(users[1].name, 'Bob');
  assert.strictEqual(users[2].name, 'Charlie');
});

// =========================================================================
// APPLICATION DES MODIFICATIONS
// =========================================================================

test('RealtimeCollaboration - applyChange() applique modification set', () => {
  const session = RealtimeCollaboration.createSession('project-5', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  const result = RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified Project'
  });
  
  assert.ok(result.success);
  assert.strictEqual(session.project.name, 'Modified Project');
  assert.strictEqual(session.version, 2);
});

test('RealtimeCollaboration - applyChange() applique modification push', () => {
  const session = RealtimeCollaboration.createSession('project-6', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  const result = RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'push',
    path: 'rooms',
    value: { id: 'chambre', name: 'Chambre', area: 12 }
  });
  
  assert.ok(result.success);
  assert.strictEqual(session.project.rooms.length, 2);
  assert.strictEqual(session.project.rooms[1].name, 'Chambre');
});

test('RealtimeCollaboration - applyChange() applique modification delete', () => {
  const session = RealtimeCollaboration.createSession('project-7', { ...mockProject, extra: 'data' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  const result = RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'delete',
    path: 'extra'
  });
  
  assert.ok(result.success);
  assert.strictEqual(session.project.extra, undefined);
});

test('RealtimeCollaboration - applyChange() échoue si utilisateur non connecté', () => {
  const session = RealtimeCollaboration.createSession('project-8', mockProject);
  
  assert.throws(() => {
    RealtimeCollaboration.applyChange(session.id, 'invalid-user', {
      type: 'set',
      path: 'name',
      value: 'Test'
    });
  }, /non trouvé/);
});

test('RealtimeCollaboration - undo() annule dernière modification', () => {
  const session = RealtimeCollaboration.createSession('project-9', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  // Appliquer une modification
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified'
  });
  
  assert.strictEqual(session.project.name, 'Modified');
  
  // Annuler
  const result = RealtimeCollaboration.undo(session.id, 'user-1');
  
  assert.ok(result.success);
  assert.strictEqual(session.project.name, 'Test Project');
});

test('RealtimeCollaboration - undo() échoue si aucune modification', () => {
  const session = RealtimeCollaboration.createSession('project-10', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  const result = RealtimeCollaboration.undo(session.id, 'user-1');
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

// =========================================================================
// PRÉSENCE ET CURSORS
// =========================================================================

test('RealtimeCollaboration - updateCursor() met à jour position', () => {
  const session = RealtimeCollaboration.createSession('project-11', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  RealtimeCollaboration.updateCursor(session.id, 'user-1', { x: 10, y: 20 });
  
  const user = session.users.get('user-1');
  assert.deepStrictEqual(user.cursor, { x: 10, y: 20 });
});

test('RealtimeCollaboration - updateSelection() met à jour sélection', () => {
  const session = RealtimeCollaboration.createSession('project-12', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  RealtimeCollaboration.updateSelection(session.id, 'user-1', { type: 'wall', id: 'wall-1' });
  
  const user = session.users.get('user-1');
  assert.deepStrictEqual(user.selection, { type: 'wall', id: 'wall-1' });
});

test('RealtimeCollaboration - getOtherUsers() retourne autres utilisateurs', () => {
  const session = RealtimeCollaboration.createSession('project-13', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1', name: 'Alice' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-2', name: 'Bob' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-3', name: 'Charlie' });
  
  const others = RealtimeCollaboration.getOtherUsers(session.id, 'user-1');
  
  assert.strictEqual(others.length, 2);
  assert.strictEqual(others[0].name, 'Bob');
  assert.strictEqual(others[1].name, 'Charlie');
});

// =========================================================================
// GESTION DES CONFLITS
// =========================================================================

test('RealtimeCollaboration - checkConflicts() détecte conflits', () => {
  const session = RealtimeCollaboration.createSession('project-14', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  // Client à version 1
  let conflicts = RealtimeCollaboration.checkConflicts(session.id, 1);
  assert.strictEqual(conflicts.hasConflict, false);
  
  // Appliquer une modification (version passe à 2)
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified'
  });
  
  // Client toujours à version 1
  conflicts = RealtimeCollaboration.checkConflicts(session.id, 1);
  assert.strictEqual(conflicts.hasConflict, true);
  assert.strictEqual(conflicts.changes.length, 1);
});

test('RealtimeCollaboration - resolveConflict() applique last-write-wins', () => {
  const session = RealtimeCollaboration.createSession('project-15', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  RealtimeCollaboration.joinSession(session.id, { id: 'user-2' });
  
  // User-1 modifie
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Alice Version'
  });
  
  // User-2 résout le conflit avec sa propre version
  const result = RealtimeCollaboration.resolveConflict(session.id, 'user-2', {
    type: 'set',
    path: 'name',
    value: 'Bob Version'
  });
  
  assert.ok(result.success);
  assert.strictEqual(session.project.name, 'Bob Version');
});

// =========================================================================
// HISTORIQUE ET VERSIONING
// =========================================================================

test('RealtimeCollaboration - getHistory() retourne historique', () => {
  const session = RealtimeCollaboration.createSession('project-16', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1', name: 'Alice' });
  
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified 1'
  });
  
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified 2'
  });
  
  const history = RealtimeCollaboration.getHistory(session.id);
  
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].userName, 'Alice');
  assert.strictEqual(history[0].change.value, 'Modified 1');
  assert.strictEqual(history[1].change.value, 'Modified 2');
});

test('RealtimeCollaboration - getHistory() respecte limit et offset', () => {
  const session = RealtimeCollaboration.createSession('project-17', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  for (let i = 0; i < 10; i++) {
    RealtimeCollaboration.applyChange(session.id, 'user-1', {
      type: 'set',
      path: 'name',
      value: `Modified ${i}`
    });
  }
  
  const history = RealtimeCollaboration.getHistory(session.id, { limit: 5, offset: 2 });
  
  assert.strictEqual(history.length, 5);
});

test('RealtimeCollaboration - restoreVersion() restaure version', () => {
  const session = RealtimeCollaboration.createSession('project-18', mockProject);
  RealtimeCollaboration.joinSession(session.id, { id: 'user-1' });
  
  // Version 1 : Test Project
  assert.strictEqual(session.project.name, 'Test Project');
  
  // Version 2 : Modified 1
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified 1'
  });
  
  // Version 3 : Modified 2
  RealtimeCollaboration.applyChange(session.id, 'user-1', {
    type: 'set',
    path: 'name',
    value: 'Modified 2'
  });
  
  // Restaurer version 2
  const result = RealtimeCollaboration.restoreVersion(session.id, 2);
  
  assert.ok(result.success);
  assert.strictEqual(session.project.name, 'Modified 1');
});

test('RealtimeCollaboration - restoreVersion() échoue si version invalide', () => {
  const session = RealtimeCollaboration.createSession('project-19', mockProject);
  
  const result = RealtimeCollaboration.restoreVersion(session.id, 999);
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

// =========================================================================
// INTÉGRATION
// =========================================================================

test('RealtimeCollaboration - workflow complet collaboration', () => {
  // 1. Créer session
  const session = RealtimeCollaboration.createSession('project-20', mockProject);
  
  // 2. Deux utilisateurs rejoignent
  RealtimeCollaboration.joinSession(session.id, { id: 'alice', name: 'Alice' });
  RealtimeCollaboration.joinSession(session.id, { id: 'bob', name: 'Bob' });
  
  assert.strictEqual(session.users.size, 2);
  
  // 3. Alice modifie
  RealtimeCollaboration.applyChange(session.id, 'alice', {
    type: 'set',
    path: 'name',
    value: 'Alice Project'
  });
  
  // 4. Bob voit les changements
  const others = RealtimeCollaboration.getOtherUsers(session.id, 'bob');
  assert.strictEqual(others.length, 1);
  
  // 5. Bob vérifie les conflits
  const conflicts = RealtimeCollaboration.checkConflicts(session.id, 1);
  assert.strictEqual(conflicts.hasConflict, true);
  
  // 6. Bob annule sa propre modification (s'il y en avait une)
  // 7. Historique disponible
  const history = RealtimeCollaboration.getHistory(session.id);
  assert.ok(history.length > 0);
  
  // 8. Alice quitte
  RealtimeCollaboration.leaveSession(session.id, 'alice');
  assert.strictEqual(session.users.size, 1);
});
