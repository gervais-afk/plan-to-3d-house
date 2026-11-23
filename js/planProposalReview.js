(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PlanProposalReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assessProposal(ai, out, opts) {
    const warnings = [];
    const sourceOpenings = Array.isArray(ai.openings) ? ai.openings.length : 0;
    const mappedOpenings = out.walls.reduce((sum, wall) => sum + wall.openings.length, 0);
    const unmatchedOpenings = Math.max(0, sourceOpenings - mappedOpenings);
    if (opts.scale === 'ai') warnings.push(`Échelle estimée par IA${out.reference ? ` à partir de « ${out.reference} »` : ''} : vérifiez-la avec une cote connue.`);
    if (!out.walls.some(wall => wall.type === 'ext')) warnings.push('Aucun mur extérieur reconnu avec certitude : contrôlez le périmètre.');
    if (unmatchedOpenings) warnings.push(`${unmatchedOpenings} ouverture(s) n’ont pas été rattachées à un mur.`);
    if (out.rooms.length < 2) warnings.push('Peu de pièces ont été détectées ; comparez-les aux libellés du document.');
    if (out.columns.length) warnings.push(`${out.columns.length} poteau(x)/colonne(s) détecté(s) : leur position doit être vérifiée sur le document source.`);
    warnings.push('Le modèle ne fournit pas de score de confiance par élément. Tous les traits proposés doivent être relus avant application.');
    return { warnings, unmatchedOpenings, mappedOpenings };
  }

  return { assessProposal };
});
