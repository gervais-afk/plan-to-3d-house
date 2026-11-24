/**
 * BIM EXPORT — Export vers formats BIM (IFC, gbXML)
 * 
 * Convertit le projet en formats standards BIM :
 * - IFC (Industry Foundation Classes) : format ouvert pour l'échange BIM
 * - gbXML (Green Building XML) : format pour l'analyse énergétique
 * 
 * Limites documentées :
 * - IFC simplifié (murs, dalles, ouvertures uniquement)
 * - gbXML basique (zones thermiques, surfaces)
 * - Ne gère pas les attributs avancés (phases, propriétés personnalisées)
 * 
 * Compatible navigateur et Node.js.
 */
const BIMExport = (() => {
  'use strict';

  // =====================================================================
  // EXPORT IFC
  // =====================================================================

  /**
   * Exporte le projet au format IFC (STEP Physical File).
   * @param {object} project
   * @param {object} options
   * @returns {string} — contenu IFC
   */
  function exportToIFC(project, options = {}) {
    const opts = {
      projectName: project.name || 'Projet',
      siteName: 'Site',
      buildingName: 'Bâtiment',
      ...options
    };

    const lines = [];
    let idCounter = 1;

    // En-tête IFC
    lines.push('ISO-10303-21;');
    lines.push('HEADER;');
    lines.push('FILE_DESCRIPTION((\'ViewDefinition [CoordinationView]\'), \'2;1\');');
    lines.push(`FILE_NAME('${opts.projectName}.ifc','2026-01-01',('Author'),('Organization'),'PreProcessor','PlanTo3DHouse','');`);
    lines.push("FILE_SCHEMA(('IFC2X3'));");
    lines.push('ENDSEC;');
    lines.push('DATA;');

    // Projet
    const projectId = idCounter++;
    lines.push(`#${projectId}=IFCPROJECT('${generateGUID()}',$,'${opts.projectName}',$,$,$,$,(#${idCounter}),$);`);

    // Unités
    const unitId = idCounter++;
    lines.push(`#${unitId}=IFCUNITASSIGNMENT((#${idCounter}));`);
    const lengthUnitId = idCounter++;
    lines.push(`#${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);

    // Site
    const siteId = idCounter++;
    lines.push(`#${siteId}=IFCSITE('${generateGUID()}',$,'${opts.siteName}',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);`);

    // Bâtiment
    const buildingId = idCounter++;
    lines.push(`#${buildingId}=IFCBUILDING('${generateGUID()}',$,'${opts.buildingName}',$,$,$,$,$,.ELEMENT.,$,$,$);`);

    // Étage
    const storeyId = idCounter++;
    lines.push(`#${storeyId}=IFCBUILDINGSTOREY('${generateGUID()}',$,'Niveau 0',$,$,$,$,$,.ELEMENT.,0.0);`);

    // Murs
    const walls = project.walls || [];
    const wallIds = [];
    for (const wall of walls) {
      const wallId = idCounter++;
      wallIds.push(wallId);
      
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const height = 2.5; // Hauteur standard
      const thickness = wall.thick || 0.2;
      
      // Direction du mur
      const dx = wall.to[0] - wall.from[0];
      const dy = wall.to[1] - wall.from[1];
      const angle = Math.atan2(dy, dx);
      
      const dirId = idCounter++;
      lines.push(`#${dirId}=IFCDIRECTION((${Math.cos(angle)},${Math.sin(angle)},0.0));`);
      
      const pointId = idCounter++;
      lines.push(`#${pointId}=IFCCARTESIANPOINT((${wall.from[0]},${wall.from[1]},0.0));`);
      
      const placementId = idCounter++;
      lines.push(`#${placementId}=IFCLOCALPLACEMENT($,#${pointId},#${dirId});`);
      
      // Géométrie simplifiée (boîte)
      const shapeId = idCounter++;
      lines.push(`#${shapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${idCounter}));`);
      
      const repId = idCounter++;
      lines.push(`#${repId}=IFCSHAPEREPRESENTATION('Body','Body','SweptSolid',(#${idCounter}));`);
      
      const solidId = idCounter++;
      lines.push(`#${solidId}=IFCEXTRUDEDAREASOLID(#${idCounter},#${dirId},#${pointId},${height});`);
      
      const areaId = idCounter++;
      lines.push(`#${areaId}=IFCRECTANGLEPROFILEDEF(.AREA.,${thickness},${length});`);
      
      // Mur IFC
      const wallType = wall.type === 'ext' ? 'STANDARD' : 'PARTITIONING';
      lines.push(`#${wallId}=IFCWALLSTANDARDCASE('${generateGUID()}',$,'Mur ${wallIds.length}',$,$,#${placementId},#${shapeId},$,'${wallType}');`);
    }

    // Dalles (planchers)
    const rooms = project.rooms || [];
    const slabIds = [];
    for (const room of rooms) {
      const slabId = idCounter++;
      slabIds.push(slabId);
      
      const bounds = room.bounds || { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
      const width = bounds.xMax - bounds.xMin;
      const depth = bounds.zMax - bounds.zMin;
      const thickness = 0.2;
      
      const pointId = idCounter++;
      lines.push(`#${pointId}=IFCCARTESIANPOINT((${bounds.xMin},${bounds.zMin},0.0));`);
      
      const placementId = idCounter++;
      lines.push(`#${placementId}=IFCLOCALPLACEMENT($,#${pointId});`);
      
      const shapeId = idCounter++;
      lines.push(`#${shapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${idCounter}));`);
      
      const repId = idCounter++;
      lines.push(`#${repId}=IFCSHAPEREPRESENTATION('Body','Body','SweptSolid',(#${idCounter}));`);
      
      const solidId = idCounter++;
      lines.push(`#${solidId}=IFCEXTRUDEDAREASOLID(#${idCounter},#1,#${pointId},${thickness});`);
      
      const areaId = idCounter++;
      lines.push(`#${areaId}=IFCRECTANGLEPROFILEDEF(.AREA.,${width},${depth});`);
      
      lines.push(`#${slabId}=IFCSLAB('${generateGUID()}',$,'${room.name || 'Dalle'}',$,$,#${placementId},#${shapeId},$,'FLOOR');`);
    }

    // Ouvertures (portes/fenêtres)
    const openingIds = [];
    for (const wall of walls) {
      const openings = wall.openings || [];
      for (const opening of openings) {
        const openingId = idCounter++;
        openingIds.push(openingId);
        
        const type = opening.type === 'door' ? 'IFCDOOR' : 'IFCWINDOW';
        const width = opening.w || 1.0;
        const height = opening.type === 'door' ? 2.1 : 1.2;
        
        lines.push(`#${openingId}=${type}('${generateGUID()}',$,'${opening.type}',$,$,$,$,$,${width},${height});`);
      }
    }

    // Pied de page
    lines.push('ENDSEC;');
    lines.push('END-ISO-10303-21;');

    return lines.join('\n');
  }

  /**
   * Génère un GUID pour IFC.
   */
  function generateGUID() {
    return 'xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx'.replace(/[x]/g, () => {
      return Math.floor(Math.random() * 16).toString(16).toUpperCase();
    });
  }

  // =====================================================================
  // EXPORT gbXML
  // =====================================================================

  /**
   * Exporte le projet au format gbXML (analyse énergétique).
   * @param {object} project
   * @param {object} options
   * @returns {string} — contenu gbXML
   */
  function exportToGbXML(project, options = {}) {
    const opts = {
      projectName: project.name || 'Projet',
      ...options
    };

    const lines = [];
    
    // En-tête XML
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<gbXML version="0.37" useSIUnitsForAbsorptance="true">');
    
    // Projet
    lines.push(`<Project id="${escapeXML(opts.projectName)}">`);
    lines.push(`  <Name>${escapeXML(opts.projectName)}</Name>`);
    
    // Zones thermiques (pièces)
    lines.push('  <Zone>');
    const rooms = project.rooms || [];
    for (const room of rooms) {
      lines.push(`    <Zone id="${escapeXML(room.id || room.name)}">`);
      lines.push(`      <Name>${escapeXML(room.name || 'Pièce')}</Name>`);
      
      // Volume
      const bounds = room.bounds || { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
      const area = room.area || (bounds.xMax - bounds.xMin) * (bounds.zMax - bounds.zMin);
      const volume = area * 2.5; // Hauteur standard 2.5m
      
      lines.push(`      <Area>${area.toFixed(2)}</Area>`);
      lines.push(`      <Volume>${volume.toFixed(2)}</Volume>`);
      
      // Type de zone
      const zoneType = room.type === 'sejour' ? 'LivingRoom' : 
                       room.type === 'chambre' ? 'Bedroom' :
                       room.type === 'cuisine' ? 'Kitchen' :
                       room.type === 'sdb' ? 'Bathroom' : 'Office';
      lines.push(`      <ZoneType>${zoneType}</ZoneType>`);
      
      lines.push('    </Zone>');
    }
    lines.push('  </Zone>');
    
    // Surfaces (murs)
    lines.push('  <Surface>');
    const walls = project.walls || [];
    for (const wall of walls) {
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const height = 2.5;
      const area = length * height;
      
      lines.push(`    <Surface id="Wall_${walls.indexOf(wall)}">`);
      lines.push(`      <Area>${area.toFixed(2)}</Area>`);
      
      // Type de surface
      const surfaceType = wall.type === 'ext' ? 'ExteriorWall' : 'InteriorWall';
      lines.push(`      <SurfaceType>${surfaceType}</SurfaceType>`);
      
      // Construire le polygone
      lines.push('      <PlanarGeometry>');
      lines.push('        <PolyLoop>');
      lines.push(`          <CartesianPoint>${wall.from[0]} ${wall.from[1]} 0</CartesianPoint>`);
      lines.push(`          <CartesianPoint>${wall.to[0]} ${wall.to[1]} 0</CartesianPoint>`);
      lines.push(`          <CartesianPoint>${wall.to[0]} ${wall.to[1]} ${height}</CartesianPoint>`);
      lines.push(`          <CartesianPoint>${wall.from[0]} ${wall.from[1]} ${height}</CartesianPoint>`);
      lines.push('        </PolyLoop>');
      lines.push('      </PlanarGeometry>');
      
      // Ouvertures
      const openings = wall.openings || [];
      for (const opening of openings) {
        lines.push(`      <Opening type="${opening.type}">`);
        lines.push(`        <Area>${(opening.w * 1.2).toFixed(2)}</Area>`); // Approximation
        lines.push('      </Opening>');
      }
      
      lines.push('    </Surface>');
    }
    lines.push('  </Surface>');
    
    lines.push('</Project>');
    lines.push('</gbXML>');

    return lines.join('\n');
  }

  /**
   * Échappe les caractères XML.
   */
  function escapeXML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // =====================================================================
  // PIPELINE COMPLET
  // =====================================================================

  /**
   * Exporte vers tous les formats BIM supportés.
   * @param {object} project
   * @param {object} options
   * @returns {object} — { ifc, gbxml }
   */
  function exportAll(project, options = {}) {
    return {
      ifc: exportToIFC(project, options),
      gbxml: exportToGbXML(project, options),
      stats: {
        walls: (project.walls || []).length,
        rooms: (project.rooms || []).length,
        openings: (project.walls || []).reduce((sum, w) => sum + (w.openings?.length || 0), 0)
      }
    };
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    exportToIFC,
    exportToGbXML,
    exportAll,
    generateGUID,
    escapeXML
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BIMExport;
}
