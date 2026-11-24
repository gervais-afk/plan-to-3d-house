/**
 * EDITOR ADVANCED — Intégration des modules stratégiques dans l'éditeur
 * 
 * Connecte les modules (vectorization, structuralAnalysis, bimExport,
 * bioclimaticAnalysis, codeCompliance, variantGenerator, architectCopilot,
 * versionComparison) à l'interface de l'éditeur.
 */
(function() {
  'use strict';

  // =====================================================================
  // UTILITAIRES
  // =====================================================================

  function getProject() {
    // Récupère le projet actuel depuis l'état global de l'éditeur
    if (typeof window !== 'undefined' && window.EDITOR_STATE) {
      return window.EDITOR_STATE;
    }
    // Fallback : construire un projet minimal depuis les données disponibles
    return {
      name: document.getElementById('ed-project-name')?.textContent || 'Projet sans nom',
      rooms: (typeof getAllRooms === 'function') ? getAllRooms() : [],
      walls: (typeof getAllWalls === 'function') ? getAllWalls() : [],
      levels: (typeof window !== 'undefined' && window.LEVELS) ? window.LEVELS : []
    };
  }

  function showToast(message, duration = 3000) {
    const toast = document.getElementById('ed-toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), duration);
    }
  }

  function formatResult(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (typeof data === 'string') {
      container.innerHTML = data;
    } else if (data && data.html) {
      container.innerHTML = data.html;
    } else {
      container.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    }
    container.style.display = 'block';
  }

  // =====================================================================
  // DIALOGUE OUTILS AVANCÉS
  // =====================================================================

  const dlgAdvanced = document.getElementById('dlg-advanced');
  const btnAdvanced = document.getElementById('btn-advanced');
  const advClose = document.getElementById('adv-close');

  if (btnAdvanced && dlgAdvanced) {
    btnAdvanced.addEventListener('click', () => {
      dlgAdvanced.showModal();
    });
  }

  if (advClose && dlgAdvanced) {
    advClose.addEventListener('click', () => {
      dlgAdvanced.close();
    });
  }

  // =====================================================================
  // VECTORIZATION
  // =====================================================================

  const btnRunVectorize = document.getElementById('btn-run-vectorize');
  const btnExportDXF = document.getElementById('btn-export-dxf');
  const btnExportSVG = document.getElementById('btn-export-svg');

  let lastVectors = null;

  if (btnRunVectorize) {
    btnRunVectorize.addEventListener('click', () => {
      if (typeof Vectorization === 'undefined') {
        showToast('Module Vectorization non chargé');
        return;
      }

      const project = getProject();
      const sketchData = {
        walls: project.walls || [],
        openings: (project.rooms || []).flatMap(r => r.openings || []),
        strokes: []
      };

      try {
        const result = Vectorization.vectorize(sketchData, { tolerance: 5, simplify: true });
        lastVectors = result.vectors;
        
        formatResult('vec-result', {
          html: `<div class="ed-advanced-success">
            ✅ Vectorisation réussie !<br>
            <strong>${result.stats.wallCount}</strong> murs,
            <strong>${result.stats.openingCount}</strong> ouvertures,
            longueur totale : <strong>${result.stats.totalLength.toFixed(2)}m</strong>
          </div>`
        });

        if (btnExportDXF) btnExportDXF.disabled = false;
        if (btnExportSVG) btnExportSVG.disabled = false;
      } catch (e) {
        formatResult('vec-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  if (btnExportDXF) {
    btnExportDXF.addEventListener('click', () => {
      if (!lastVectors) { showToast('Vectorisez d\'abord le plan'); return; }
      
      try {
        const dxf = Vectorization.exportToDXF(lastVectors, { unit: 'm' });
        downloadFile(dxf, 'plan.dxf', 'application/dxf');
        showToast('DXF exporté !');
      } catch (e) {
        showToast('Erreur export DXF : ' + e.message);
      }
    });
  }

  if (btnExportSVG) {
    btnExportSVG.addEventListener('click', () => {
      if (!lastVectors) { showToast('Vectorisez d\'abord le plan'); return; }
      
      try {
        const svg = Vectorization.exportToSVG(lastVectors, { width: 1200, height: 800 });
        downloadFile(svg, 'plan.svg', 'image/svg+xml');
        showToast('SVG exporté !');
      } catch (e) {
        showToast('Erreur export SVG : ' + e.message);
      }
    });
  }

  // =====================================================================
  // ANALYSE STRUCTURELLE
  // =====================================================================

  const btnRunStructural = document.getElementById('btn-run-structural');

  if (btnRunStructural) {
    btnRunStructural.addEventListener('click', () => {
      if (typeof StructuralAnalysis === 'undefined') {
        showToast('Module StructuralAnalysis non chargé');
        return;
      }

      const project = getProject();
      try {
        const result = StructuralAnalysis.analyzeStructure(project);
        
        let html = '<div class="ed-advanced-success">';
        html += '✅ Analyse structurelle terminée<br><br>';
        html += `<strong>Murs porteurs :</strong> ${result.structure.loadBearingWalls.length}<br>`;
        html += `<strong>Chemin de charge :</strong> ${result.analysis.loadPaths?.length || 0} chemins<br>`;
        
        if (result.analysis.adequacy?.isValid) {
          html += '<br>🟢 <strong>Structure adéquate</strong>';
        } else {
          html += '<br>🔴 <strong>Problèmes détectés :</strong><br>';
          (result.analysis.adequacy?.errors || []).forEach(e => {
            html += `• ${e}<br>`;
          });
        }
        
        if (result.recommendations && result.recommendations.length > 0) {
          html += '<br><strong>Recommandations :</strong><br>';
          result.recommendations.forEach(r => {
            html += `💡 ${r}<br>`;
          });
        }
        
        html += '</div>';
        formatResult('struct-result', { html });
      } catch (e) {
        formatResult('struct-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // ANALYSE BIOCLIMATIQUE
  // =====================================================================

  const btnRunBioclimatic = document.getElementById('btn-run-bioclimatic');

  if (btnRunBioclimatic) {
    btnRunBioclimatic.addEventListener('click', () => {
      if (typeof BioclimaticAnalysis === 'undefined') {
        showToast('Module BioclimaticAnalysis non chargé');
        return;
      }

      const project = getProject();
      try {
        const result = BioclimaticAnalysis.analyzeBioclimatic(project);
        
        let html = '<div class="ed-advanced-success">';
        html += '✅ Analyse bioclimatique terminée<br><br>';
        
        if (result.orientation) {
          html += `<strong>Orientation :</strong> ${result.orientation.dominantDirection || 'N/A'} (${result.orientation.angle?.toFixed(0) || '?'}°)<br>`;
        }
        
        if (result.solar) {
          html += `<strong>Gain solaire :</strong> ${result.solar.solarGain?.toFixed(1) || '?'} kWh/m²/an<br>`;
          html += `<strong>Note exposition :</strong> ${result.solar.score?.toFixed(1) || '?'}/10<br>`;
        }
        
        if (result.ventilation) {
          html += `<strong>Ventilation naturelle :</strong> ${result.ventilation.score?.toFixed(1) || '?'}/10<br>`;
        }
        
        if (result.inertia) {
          html += `<strong>Inertie thermique :</strong> ${result.inertia.score?.toFixed(1) || '?'}/10<br>`;
        }
        
        if (result.recommendations && result.recommendations.length > 0) {
          html += '<br><strong>Recommandations :</strong><br>';
          result.recommendations.forEach(r => {
            html += `💡 ${r}<br>`;
          });
        }
        
        html += '</div>';
        formatResult('bioclim-result', { html });
      } catch (e) {
        formatResult('bioclim-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // EXPORT BIM
  // =====================================================================

  const btnExportIFC = document.getElementById('btn-export-ifc');
  const btnExportGbXML = document.getElementById('btn-export-gbxml');

  if (btnExportIFC) {
    btnExportIFC.addEventListener('click', () => {
      if (typeof BIMExport === 'undefined') {
        showToast('Module BIMExport non chargé');
        return;
      }

      const project = getProject();
      try {
        const ifc = BIMExport.exportToIFC(project, {
          projectName: project.name || 'Projet',
          siteName: 'Site',
          buildingName: 'Bâtiment'
        });
        
        downloadFile(ifc, `${project.name || 'projet'}.ifc`, 'application/step');
        
        formatResult('bim-result', {
          html: `<div class="ed-advanced-success">✅ Fichier IFC exporté (${(ifc.length / 1024).toFixed(1)} KB)</div>`
        });
      } catch (e) {
        formatResult('bim-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  if (btnExportGbXML) {
    btnExportGbXML.addEventListener('click', () => {
      if (typeof BIMExport === 'undefined') {
        showToast('Module BIMExport non chargé');
        return;
      }

      const project = getProject();
      try {
        const gbxml = BIMExport.exportToGbXML(project);
        
        downloadFile(gbxml, `${project.name || 'projet'}.gbxml`, 'application/xml');
        
        formatResult('bim-result', {
          html: `<div class="ed-advanced-success">✅ Fichier gbXML exporté (${(gbxml.length / 1024).toFixed(1)} KB)</div>`
        });
      } catch (e) {
        formatResult('bim-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // VÉRIFICATION RÉGLEMENTAIRE
  // =====================================================================

  const btnRunCompliance = document.getElementById('btn-run-compliance');

  if (btnRunCompliance) {
    btnRunCompliance.addEventListener('click', () => {
      if (typeof CodeCompliance === 'undefined') {
        showToast('Module CodeCompliance non chargé');
        return;
      }

      const project = getProject();
      try {
        const result = CodeCompliance.checkAll ? 
          CodeCompliance.checkAll(project) :
          CodeCompliance.checkCompliance(project);
        
        let html = '<div class="ed-advanced-success">';
        html += '✅ Vérification réglementaire terminée<br><br>';
        
        if (result.errors && result.errors.length > 0) {
          html += `<strong>🔴 Erreurs (${result.errors.length}) :</strong><br>`;
          result.errors.forEach(e => { html += `• ${e}<br>`; });
          html += '<br>';
        }
        
        if (result.warnings && result.warnings.length > 0) {
          html += `<strong>🟡 Avertissements (${result.warnings.length}) :</strong><br>`;
          result.warnings.forEach(w => { html += `• ${w}<br>`; });
          html += '<br>';
        }
        
        if ((!result.errors || result.errors.length === 0) && (!result.warnings || result.warnings.length === 0)) {
          html += '🟢 <strong>Aucun problème détecté</strong><br>';
        }
        
        html += '</div>';
        formatResult('compliance-result', { html });
      } catch (e) {
        formatResult('compliance-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // GÉNÉRATEUR DE VARIANTES
  // =====================================================================

  const btnGenerateVariants = document.getElementById('btn-generate-variants');

  if (btnGenerateVariants) {
    btnGenerateVariants.addEventListener('click', () => {
      if (typeof VariantGenerator === 'undefined') {
        showToast('Module VariantGenerator non chargé');
        return;
      }

      const project = getProject();
      try {
        const variants = VariantGenerator.generateVariants ? 
          VariantGenerator.generateVariants(project, { count: 3 }) :
          VariantGenerator.generate(project);
        
        let html = '<div class="ed-advanced-success">';
        html += `✅ ${variants.length || 0} variante(s) générée(s)<br><br>`;
        
        (variants || []).forEach((v, i) => {
          html += `<strong>Variante ${i + 1} : ${v.name || 'Sans nom'}</strong><br>`;
          if (v.description) html += `${v.description}<br>`;
          if (v.changes) html += `<em>${v.changes.length} modification(s)</em><br>`;
          html += '<br>';
        });
        
        html += '</div>';
        formatResult('variants-result', { html });
      } catch (e) {
        formatResult('variants-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // COPILOT IA
  // =====================================================================

  const btnRunCopilot = document.getElementById('btn-run-copilot');

  if (btnRunCopilot) {
    btnRunCopilot.addEventListener('click', () => {
      if (typeof ArchitectCopilot === 'undefined') {
        showToast('Module ArchitectCopilot non chargé');
        return;
      }

      const project = getProject();
      try {
        const suggestions = ArchitectCopilot.analyze ? 
          ArchitectCopilot.analyze(project) :
          ArchitectCopilot.suggest(project);
        
        let html = '<div class="ed-advanced-success">';
        html += '🤖 Suggestions du Copilot IA<br><br>';
        
        if (Array.isArray(suggestions)) {
          suggestions.forEach(s => {
            html += `💡 <strong>${s.title || s.type || 'Suggestion'}</strong><br>`;
            html += `${s.description || s.message || ''}<br><br>`;
          });
        } else if (suggestions && suggestions.suggestions) {
          suggestions.suggestions.forEach(s => {
            html += `💡 <strong>${s.title || s.type || 'Suggestion'}</strong><br>`;
            html += `${s.description || s.message || ''}<br><br>`;
          });
        }
        
        html += '</div>';
        formatResult('copilot-result', { html });
      } catch (e) {
        formatResult('copilot-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // COMPARAISON DE VERSIONS
  // =====================================================================

  const btnCompareVersions = document.getElementById('btn-compare-versions');

  if (btnCompareVersions) {
    btnCompareVersions.addEventListener('click', () => {
      if (typeof VersionComparison === 'undefined') {
        showToast('Module VersionComparison non chargé');
        return;
      }

      const project = getProject();
      
      // Charger la dernière version sauvegardée depuis localStorage
      const savedVersions = JSON.parse(localStorage.getItem('plan-to-3d-versions') || '[]');
      if (savedVersions.length === 0) {
        formatResult('compare-result', { 
          html: '<div class="ed-advanced-warning">Aucune version sauvegardée trouvée. Enregistrez le projet d\'abord.</div>' 
        });
        return;
      }

      const lastSaved = savedVersions[savedVersions.length - 1];
      
      try {
        const comparison = VersionComparison.compareVersions(lastSaved, project);
        const impacts = VersionComparison.computeImpacts(comparison);
        
        let html = '<div class="ed-advanced-success">';
        html += '✅ Comparaison terminée<br><br>';
        
        if (comparison.wallsDiff) {
          const wd = comparison.wallsDiff;
          html += `<strong>Murs :</strong> `;
          html += `+${wd.added?.length || 0} ajoutés, `;
          html += `-${wd.removed?.length || 0} supprimés, `;
          html += `~${wd.modified?.length || 0} modifiés<br>`;
        }
        
        if (comparison.roomsDiff) {
          const rd = comparison.roomsDiff;
          html += `<strong>Pièces :</strong> `;
          html += `+${rd.added?.length || 0} ajoutées, `;
          html += `-${rd.removed?.length || 0} supprimées, `;
          html += `~${rd.modified?.length || 0} modifiées<br>`;
        }
        
        if (impacts) {
          html += '<br><strong>Impacts :</strong><br>';
          if (impacts.areaDelta !== undefined) {
            html += `• Surface : ${impacts.areaDelta > 0 ? '+' : ''}${impacts.areaDelta.toFixed(1)} m²<br>`;
          }
        }
        
        html += '</div>';
        formatResult('compare-result', { html });
      } catch (e) {
        formatResult('compare-result', { html: `<div class="ed-advanced-error">❌ Erreur : ${e.message}</div>` });
      }
    });
  }

  // =====================================================================
  // UTILITAIRE DE TÉLÉCHARGEMENT
  // =====================================================================

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =====================================================================
  // SAUVEGARDE AUTOMATIQUE DES VERSIONS
  // =====================================================================

  // Hook sur le bouton Enregistrer pour sauvegarder une version
  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    const originalClick = btnSave.onclick;
    btnSave.addEventListener('click', () => {
      // Après un court délai (pour laisser l'éditeur sauvegarder), stocker une version
      setTimeout(() => {
        const project = getProject();
        const versions = JSON.parse(localStorage.getItem('plan-to-3d-versions') || '[]');
        versions.push({
          timestamp: Date.now(),
          data: JSON.parse(JSON.stringify(project))
        });
        // Garder seulement les 10 dernières versions
        if (versions.length > 10) versions.shift();
        localStorage.setItem('plan-to-3d-versions', JSON.stringify(versions));
      }, 500);
    });
  }

  console.log('[EditorAdvanced] Module chargé — 8 outils stratégiques disponibles');

})();
