#!/usr/bin/env node

/**
 * SCRIPT DE VÉRIFICATION AUTOMATIQUE
 * 
 * Vérifie que tout ce qui a été implémenté fonctionne correctement.
 * Génère un rapport de validation complet.
 * 
 * Usage : node verify_all.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =====================================================================
// CONFIGURATION
// =====================================================================

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

// =====================================================================
// UTILITAIRES
// =====================================================================

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bold');
  console.log('='.repeat(70));
}

function section(title) {
  console.log('');
  log(`▶ ${title}`, 'cyan');
  console.log('-'.repeat(70));
}

function pass(message) {
  log(`  ✅ ${message}`, 'green');
  results.passed++;
  results.details.push({ status: 'PASS', message });
}

function fail(message) {
  log(`  ❌ ${message}`, 'red');
  results.failed++;
  results.details.push({ status: 'FAIL', message });
}

function warn(message) {
  log(`  ⚠️  ${message}`, 'yellow');
  results.warnings++;
  results.details.push({ status: 'WARN', message });
}

function fileExists(filepath) {
  return fs.existsSync(filepath);
}

function fileContains(filepath, text) {
  if (!fileExists(filepath)) return false;
  const content = fs.readFileSync(filepath, 'utf8');
  return content.includes(text);
}

function countLines(filepath) {
  if (!fileExists(filepath)) return 0;
  const content = fs.readFileSync(filepath, 'utf8');
  return content.split('\n').length;
}

// =====================================================================
// VÉRIFICATIONS
// =====================================================================

function verifyStructure() {
  section('1. VÉRIFICATION DE LA STRUCTURE');

  const requiredFiles = [
    // Modules stratégiques
    'js/vectorization.js',
    'js/structuralAnalysis.js',
    'js/bimExport.js',
    'js/bioclimaticAnalysis.js',
    'js/smartAnnotations.js',
    'js/realtimeCollaboration.js',
    'js/versionComparison.js',
    'js/sketchRecognition.js',
    'js/variantGenerator.js',
    'js/codeCompliance.js',
    'js/architectCopilot.js',
    
    // Modules PDF Premium
    'js/clientBrochurePremium.js',
    'js/aiEnhance.js',
    'js/apsGenerator.js',
    'js/editorPremium.js',
    
    // Tests
    'tests/integration.test.cjs',
    
    // Documentation
    'API_DOCUMENTATION.md',
    'GUIDE_DESIGN_PDF.md',
    'PDF_MODULE_README.md',
    'GUIDE_COUVERTURE_PREMIUM.md',
    'INTEGRATION_PREMIUM.md',
    'INTEGRATION_COMPLETE.md',
    'RECAPITULATIF_PDF_WAOUH.md',
    'APS_PLAN_TO_3D_HOUSE.md',
    'GUIDE_DOCUMENTS_MANQUANTS.md',
    'RECAPITULATIF_APS_COMPLET.md',
    'PROMPT_ASSISTANT_LOCAL.md',
    'PROMPT_GITHUB_CLONE.md',
    'PROMPT_VERIFICATION_COMPLETE.md',
    
    // UI
    'editor.html',
    'index.html',
    'demo.html',
    'aps-template.html'
  ];

  let allPresent = true;
  requiredFiles.forEach(file => {
    if (fileExists(file)) {
      pass(`${file} (${countLines(file)} lignes)`);
    } else {
      fail(`${file} MANQUANT`);
      allPresent = false;
    }
  });

  return allPresent;
}

function verifyModules() {
  section('2. VÉRIFICATION DES MODULES');

  const modules = [
    { name: 'Vectorization', file: './js/vectorization.js', functions: ['vectorize', 'exportToDXF', 'exportToSVG'] },
    { name: 'StructuralAnalysis', file: './js/structuralAnalysis.js', functions: ['analyzeStructure', 'detectLoadBearingWalls'] },
    { name: 'BIMExport', file: './js/bimExport.js', functions: ['exportToIFC', 'exportToGbXML'] },
    { name: 'BioclimaticAnalysis', file: './js/bioclimaticAnalysis.js', functions: ['analyzeBioclimatic', 'analyzeSolarExposure'] },
    { name: 'SmartAnnotations', file: './js/smartAnnotations.js', functions: ['analyzeAnnotations', 'detectDimensions'] },
    { name: 'RealtimeCollaboration', file: './js/realtimeCollaboration.js', functions: ['createSession', 'joinSession'] },
    { name: 'VersionComparison', file: './js/versionComparison.js', functions: ['compareVersions', 'compareWalls'] },
    { name: 'SketchRecognition', file: './js/sketchRecognition.js', functions: ['recognizeSketch', 'segmentsToWalls'] },
    { name: 'VariantGenerator', file: './js/variantGenerator.js', functions: ['generateVariants', 'evaluateFitness'] },
    { name: 'CodeCompliance', file: './js/codeCompliance.js', functions: ['generateComplianceReport', 'checkPLU', 'checkRE2020'] },
    { name: 'ArchitectCopilot', file: './js/architectCopilot.js', functions: ['generateSuggestions', 'calculateMetrics'] },
    { name: 'ClientBrochurePremium', file: './js/clientBrochurePremium.js', functions: ['exportPDF', 'setStyle', 'getStyle'] },
    { name: 'APSGenerator', file: './js/apsGenerator.js', functions: ['generateAPS', 'buildContent'] }
  ];

  // Modules spéciaux qui nécessitent un environnement navigateur
  const browserModules = [
    { name: 'AIEnhance', file: './js/aiEnhance.js', note: 'Sublimation via le relais OpenRouter (api/ai/images)' }
  ];

  let allLoaded = true;

  // Vérifier les modules Node.js
  modules.forEach(mod => {
    try {
      const module = require(mod.file);
      // Chaque fonction annoncée doit réellement exister.
      const missing = mod.functions.filter(fn => typeof module?.[fn] !== 'function');
      if (missing.length === 0) {
        pass(`${mod.name} chargé - ${mod.functions.join(', ')}`);
      } else {
        fail(`${mod.name} - fonction(s) absente(s) : ${missing.join(', ')}`);
        allLoaded = false;
      }
    } catch (error) {
      fail(`${mod.name} - Erreur de chargement: ${error.message}`);
      allLoaded = false;
    }
  });

  // Vérifier les modules navigateur
  browserModules.forEach(mod => {
    if (fileExists(mod.file)) {
      const content = fs.readFileSync(mod.file, 'utf8');
      // Sublimation réelle : relais OpenRouter du serveur local, plus de simulation.
      if (content.includes('sublimateWithAI') && content.includes('api/ai/images') && !/simulateAIEnhancement|Améliorations simulées/.test(content)) {
        pass(`${mod.name} - ${mod.note}`);
      } else {
        fail(`${mod.name} - Contenu invalide`);
        allLoaded = false;
      }
    } else {
      fail(`${mod.name} - Fichier manquant`);
      allLoaded = false;
    }
  });

  return allLoaded;
}

function verifyTests() {
  section('3. VÉRIFICATION DES TESTS');

  try {
    log('  Exécution des tests unitaires...', 'blue');
    // Format TAP imposé : le rapporteur par défaut change selon la version de Node et le terminal.
    // La liste des fichiers est construite ici pour ne pas dépendre de l'expansion du shell (Windows).
    const files = fs.readdirSync('tests').filter(f => f.endsWith('.test.cjs')).map(f => `"tests/${f}"`).join(' ');
    let output;
    try {
      output = execSync(`node --test --test-reporter=tap ${files}`, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      // Code de sortie non nul quand un test échoue : on lit quand même le résumé.
      output = `${error.stdout || ''}${error.stderr || ''}`;
      if (!/# tests \d+/.test(output)) throw error;
    }

    const testMatch = output.match(/# tests (\d+)/);
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    
    const totalTests = testMatch ? parseInt(testMatch[1]) : 0;
    const passedTests = passMatch ? parseInt(passMatch[1]) : 0;
    const failedTests = failMatch ? parseInt(failMatch[1]) : 0;
    
    log(`  Tests exécutés: ${totalTests}`, 'blue');
    log(`  Tests réussis: ${passedTests}`, 'green');
    log(`  Tests échoués: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    
    if (failedTests === 0 && totalTests > 0) {
      pass(`Tous les tests passent (${passedTests}/${totalTests})`);
      return true;
    } else {
      fail(`${failedTests} test(s) échoué(s) sur ${totalTests}`);
      return false;
    }
  } catch (error) {
    fail(`Erreur lors de l'exécution des tests: ${error.message}`);
    return false;
  }
}

function verifyIntegration() {
  section('4. VÉRIFICATION DE L\'INTÉGRATION UI');

  const checks = [
    { file: 'editor.html', text: 'btn-sublimate', desc: 'Bouton "Sublimer avec l\'IA"' },
    { file: 'editor.html', text: 'btn-export-premium', desc: 'Bouton "Catalogue Premium"' },
    { file: 'editor.html', text: 'btn-aps', desc: 'Bouton "APS Auto"' },
    { file: 'editor.html', text: 'clientBrochurePremium.js', desc: 'Script clientBrochurePremium.js' },
    { file: 'editor.html', text: 'aiEnhance.js', desc: 'Script aiEnhance.js' },
    { file: 'editor.html', text: 'apsGenerator.js', desc: 'Script apsGenerator.js' },
    { file: 'editor.html', text: 'editorPremium.js', desc: 'Script editorPremium.js' },
    { file: 'editor.html', text: 'editorPremium.css', desc: 'CSS editorPremium.css' },
    { file: 'editor.html', text: 'dlg-premium', desc: 'Dialogue premium' },
    { file: 'editor.html', text: 'name="pdf-style"', desc: 'Sélecteur de style' },
    { file: 'js/editorPremium.js', text: 'handleGenerateAPS', desc: 'Fonction handleGenerateAPS' }
  ];

  let allPresent = true;
  checks.forEach(check => {
    if (fileContains(check.file, check.text)) {
      pass(`${check.desc} présent`);
    } else {
      fail(`${check.desc} MANQUANT dans ${check.file}`);
      allPresent = false;
    }
  });

  return allPresent;
}

function verifyDocumentation() {
  section('5. VÉRIFICATION DE LA DOCUMENTATION');

  const docs = [
    { file: 'API_DOCUMENTATION.md', minLines: 400, desc: 'Documentation API' },
    { file: 'GUIDE_DESIGN_PDF.md', minLines: 500, desc: 'Guide design PDF' },
    { file: 'PDF_MODULE_README.md', minLines: 400, desc: 'Documentation PDF' },
    { file: 'GUIDE_COUVERTURE_PREMIUM.md', minLines: 400, desc: 'Guide couverture' },
    { file: 'INTEGRATION_PREMIUM.md', minLines: 400, desc: 'Guide intégration' },
    { file: 'INTEGRATION_COMPLETE.md', minLines: 300, desc: 'Récapitulatif intégration' },
    { file: 'RECAPITULATIF_PDF_WAOUH.md', minLines: 400, desc: 'Récapitulatif PDF' },
    { file: 'APS_PLAN_TO_3D_HOUSE.md', minLines: 500, desc: 'APS du projet' },
    { file: 'GUIDE_DOCUMENTS_MANQUANTS.md', minLines: 250, desc: 'Guide documents manquants' },
    { file: 'RECAPITULATIF_APS_COMPLET.md', minLines: 400, desc: 'Récapitulatif APS' },
    { file: 'PROMPT_ASSISTANT_LOCAL.md', minLines: 600, desc: 'Prompt assistant local' },
    { file: 'PROMPT_GITHUB_CLONE.md', minLines: 400, desc: 'Prompt GitHub clone' },
    { file: 'PROMPT_VERIFICATION_COMPLETE.md', minLines: 400, desc: 'Prompt vérification' }
  ];

  let allValid = true;
  docs.forEach(doc => {
    const lines = countLines(doc.file);
    if (fileExists(doc.file)) {
      if (lines >= doc.minLines) {
        pass(`${doc.desc} - ${lines} lignes (min: ${doc.minLines})`);
      } else {
        warn(`${doc.desc} - ${lines} lignes (min recommandé: ${doc.minLines})`);
      }
    } else {
      fail(`${doc.desc} MANQUANT`);
      allValid = false;
    }
  });

  return allValid;
}

function verifyStyles() {
  section('6. VÉRIFICATION DES STYLES PDF');

  // Le style doit être réellement appliqué par le module du catalogue, pas seulement cité.
  const styles = ['modern', 'luxury', 'industrial'];
  let ok = true;
  try {
    const Premium = require('./js/clientBrochurePremium.js');
    const primaries = new Set();
    styles.forEach(style => {
      const palette = Premium.STYLES?.[style];
      if (palette && Premium.setStyle(style) === style && Premium.getStyle() === style) {
        primaries.add(palette.primary);
        pass(`Style "${style}" (${palette.label}) appliqué par ClientBrochurePremium`);
      } else {
        fail(`Style "${style}" non appliqué par ClientBrochurePremium.setStyle`);
        ok = false;
      }
    });
    if (primaries.size !== styles.length) {
      fail('Les styles partagent la même couleur principale');
      ok = false;
    }
    Premium.setStyle('modern');
  } catch (error) {
    fail(`Styles PDF - ${error.message}`);
    ok = false;
  }
  return ok;
}

function verifyTemplates() {
  section('7. VÉRIFICATION DES TEMPLATES');

  if (fileExists('aps-template.html')) {
    const content = fs.readFileSync('aps-template.html', 'utf8');
    
    const fields = ['projectName', 'clientName', 'totalArea', 'budget', 'timeline'];
    let allFields = true;
    
    fields.forEach(field => {
      if (content.includes(field)) {
        pass(`Champ "${field}" présent dans le template`);
      } else {
        fail(`Champ "${field}" MANQUANT dans le template`);
        allFields = false;
      }
    });

    // Chercher les pages avec une regex plus flexible
    const pageCount = (content.match(/class="page/g) || []).length;
    if (pageCount >= 6) {
      pass(`Template contient ${pageCount} pages (attendu: 6)`);
    } else {
      // Essayer une autre approche
      const sectionCount = (content.match(/<section/g) || []).length;
      if (sectionCount >= 6) {
        pass(`Template contient ${sectionCount} sections (structure alternative)`);
      } else {
        warn(`Template contient ${pageCount} pages explicites (recommandé: 6)`);
      }
    }

    // Vérifier les sections principales
    // Le modèle est en français : on accepte les deux langues pour chaque section.
    const sections = [['cover', 'couverture'], ['presentation', 'présentation'], ['program', 'programme'],
      ['estimation'], ['calendar', 'calendrier'], ['conclusion']];
    const lower = content.toLowerCase();
    const sectionsFound = sections.filter(names => names.some(name => lower.includes(name))).length;
    
    if (sectionsFound >= 5) {
      pass(`Template contient ${sectionsFound}/6 sections principales`);
    } else {
      warn(`Template contient seulement ${sectionsFound}/6 sections principales`);
    }

    return allFields;
  } else {
    fail('aps-template.html MANQUANT');
    return false;
  }
}

async function verifyGeneratedPDFs() {
  section('8. GÉNÉRATION RÉELLE DES PDF (Villa Serena)');

  let ok = true;
  try {
    const { jsPDF } = require('./assets/vendor/jspdf-4.2.1.umd.min.js');
    const project = require('./projects/villa-serena/project.json');
    const APSGenerator = require('./js/apsGenerator.js');
    const Premium = require('./js/clientBrochurePremium.js');

    // Collecte du texte réellement écrit dans le PDF.
    const recorder = () => {
      const written = [];
      class Recorder extends jsPDF {
        constructor(...args) {
          super(...args);
          const text = this.text.bind(this);
          this.text = (value, ...rest) => { written.push(...[].concat(value)); return text(value, ...rest); };
        }
      }
      return { Recorder, written };
    };

    const aps = recorder();
    const apsDoc = await APSGenerator.generateAPS(project, null, null, { JsPDF: aps.Recorder, save: false });
    const apsText = aps.written.join('\n');
    if (apsDoc.getNumberOfPages() >= 6 && apsText.includes('VILLA SERENA') && apsText.includes('FCFA')) {
      pass(`APS généré : ${apsDoc.getNumberOfPages()} pages, pièces et estimation en FCFA`);
    } else {
      fail('APS incomplet (pages, nom du projet ou estimation FCFA manquants)');
      ok = false;
    }
    if (/tests? unitaires|Vectorization|Modules? stratégiques|€/.test(apsText)) {
      fail('L\'APS contient du texte sur le logiciel au lieu de la maison');
      ok = false;
    } else {
      pass('APS sans contenu sur le logiciel');
    }

    for (const style of ['modern', 'luxury', 'industrial']) {
      const cat = recorder();
      const doc = await Premium.exportPDF(project, null, null, () => {}, { JsPDF: cat.Recorder, save: false, style });
      const label = Premium.STYLES[style].label;
      if (doc.getNumberOfPages() === 2 && cat.written.join('\n').includes(`Style ${label}`)) {
        pass(`Catalogue premium « ${label} » généré sans studio 3D (2 pages)`);
      } else {
        fail(`Catalogue premium « ${label} » incomplet`);
        ok = false;
      }
    }
    Premium.setStyle('modern');
  } catch (error) {
    fail(`Génération des PDF - ${error.message}`);
    ok = false;
  }
  return ok;
}

// =====================================================================
// RAPPORT FINAL
// =====================================================================

function generateReport() {
  header('📊 RAPPORT DE VALIDATION FINAL');

  const total = results.passed + results.failed;
  const successRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log('');
  log(`  Total des vérifications: ${total}`, 'bold');
  log(`  ✅ Réussies: ${results.passed}`, 'green');
  log(`  ❌ Échouées: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`  ⚠️  Avertissements: ${results.warnings}`, results.warnings > 0 ? 'yellow' : 'green');
  log(`  📈 Taux de succès: ${successRate}%`, 'cyan');
  console.log('');

  if (results.failed === 0) {
    log('  🎉 TOUS LES TESTS PASSENT !', 'green');
    log('  ✅ PROJET VALIDÉ', 'green');
    console.log('');
    log('  Toutes les vérifications automatiques passent.', 'green');
    log('  Non couvert ici : l\'affichage dans le navigateur (à tester dans l\'éditeur)', 'yellow');
    log('  et un appel OpenRouter réel (facturé), testé avec un faux serveur.', 'yellow');
  } else {
    log('  ⚠️  DES PROBLÈMES ONT ÉTÉ DÉTECTÉS', 'red');
    log('  ❌ PROJET NON VALIDÉ', 'red');
    console.log('');
    log('  Actions correctives nécessaires :', 'yellow');
    results.details.filter(d => d.status === 'FAIL').forEach(d => {
      log(`    - ${d.message}`, 'red');
    });
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('');

  // Sauvegarder le rapport
  const report = {
    timestamp: new Date().toISOString(),
    branch: 'arena/1d9c67e2-plan-to-3d-house',
    results: {
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      total: total,
      successRate: parseFloat(successRate)
    },
    details: results.details,
    status: results.failed === 0 ? 'VALIDATED' : 'NOT_VALIDATED'
  };

  fs.writeFileSync('verification_report.json', JSON.stringify(report, null, 2));
  log('  📄 Rapport sauvegardé dans verification_report.json', 'blue');

  return results.failed === 0;
}

// =====================================================================
// EXÉCUTION PRINCIPALE
// =====================================================================

async function main() {
  header('🔍 VÉRIFICATION COMPLÈTE DU PROJET');
  log('  Projet: Plan to 3D House', 'blue');
  log('  Branche: arena/1d9c67e2-plan-to-3d-house', 'blue');
  log('  Date: ' + new Date().toLocaleString('fr-FR'), 'blue');

  // Exécuter toutes les vérifications
  verifyStructure();
  verifyModules();
  verifyTests();
  verifyIntegration();
  verifyDocumentation();
  verifyStyles();
  verifyTemplates();
  await verifyGeneratedPDFs();

  // Générer le rapport
  const isValid = generateReport();

  // Code de sortie
  process.exit(isValid ? 0 : 1);
}

// Lancer la vérification
main().catch(error => {
  console.error(error);
  process.exit(1);
});
