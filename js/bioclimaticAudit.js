/**
 * Moteur d'audit bioclimatique, d'optimisation de plan et de pré-rédaction
 * Notice Architecturale + CCTP (utilisable côté navigateur et côté serveur Node.js).
 * Calcule des grandeurs réelles à partir de la géométrie du projet (murs, baies, pièces, toiture, Nord).
 */
const BioclimaticAudit = (() => {
  const CITIES = {
    douala:  { name: 'Douala, Cameroun',  zone: 'Équatorial côtier chaud et humide', lat: 4.05,  priorities: ['Ventilation traversante naturelle', 'Débords de toiture & vérandas profondes', 'Protection façades Est/Ouest'] },
    yaounde: { name: 'Yaoundé, Cameroun', zone: 'Tropical humide d’altitude',        lat: 3.85,  priorities: ['Ventilation nocturne traversante', 'Protection solaire Est/Ouest', 'Inertie thermique modérée'] },
    abidjan: { name: 'Abidjan, Côte d’Ivoire', zone: 'Subéquatorial littoral humide', lat: 5.36, priorities: ['Brise marine traversante', 'Casquettes solaires & persiennes', 'Toiture ventilée'] },
    dakar:   { name: 'Dakar, Sénégal',    zone: 'Tropical côtier sec / alizés',      lat: 14.72, priorities: ['Alizés dominants Nord-Ouest', 'Façades claires à forte albédo', 'Brise-soleil verticaux Ouest'] },
    paris:   { name: 'Paris, France',     zone: 'Tempéré océanique',                 lat: 48.86, priorities: ['Apports solaires passifs Sud', 'Compacité thermique Nord', 'Protection surchauffe été Ouest'] }
  };

  function detectCityKey(project) {
    const raw = String(project?.meta?.location || project?.config?.city || 'douala').toLowerCase();
    if (/yaound/.test(raw)) return 'yaounde';
    if (/abidjan/.test(raw)) return 'abidjan';
    if (/dakar/.test(raw)) return 'dakar';
    if (/paris|france|lyon|bordeaux/.test(raw)) return 'paris';
    return 'douala';
  }

  function wallLength(w) {
    if (!Array.isArray(w?.from) || !Array.isArray(w?.to)) return 0;
    return Math.hypot((w.to[0] - w.from[0]) || 0, (w.to[1] - w.from[1]) || 0);
  }

  function roomArea(r) {
    if (Number.isFinite(r?.area) && r.area > 0) return r.area;
    if (r?.bounds) {
      return Math.max(0, (r.bounds.xMax - r.bounds.xMin) * (r.bounds.zMax - r.bounds.zMin));
    }
    return 0;
  }

  function outwardCardinal(w, centroid, northAngleDeg = 0) {
    const dx = w.to[0] - w.from[0];
    const dz = w.to[1] - w.from[1];
    const len = Math.hypot(dx, dz) || 1;
    // Deux normales candidates dans le plan (X Est, -Z Nord par défaut)
    const mx = (w.from[0] + w.to[0]) * 0.5;
    const mz = (w.from[1] + w.to[1]) * 0.5;
    let nx = -dz / len;
    let nz = dx / len;
    const vx = mx - centroid.x;
    const vz = mz - centroid.z;
    if (nx * vx + nz * vz < 0) { nx = -nx; nz = -nz; }
    // Azimut par rapport au Nord (-Z) corrigé de northAngleDeg
    let deg = (Math.atan2(nx, -nz) * 180 / Math.PI - (Number(northAngleDeg) || 0)) % 360;
    if (deg < 0) deg += 360;
    if (deg >= 315 || deg < 45) return 'Nord';
    if (deg >= 45 && deg < 135) return 'Est';
    if (deg >= 135 && deg < 225) return 'Sud';
    return 'Ouest';
  }

  function analyze(project, options = {}) {
    const walls = Array.isArray(project?.walls) ? project.walls : [];
    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const canopies = Array.isArray(project?.canopies) ? project.canopies : [];
    const wallHeight = Number(project?.config?.wallHeight) || 3.0;
    const overhang = Number(project?.config?.roof?.overhang) || 0;
    const northAngle = Number.isFinite(options.northAngle) ? options.northAngle : (Number(project?.config?.northAngle) || 0);
    const cityKey = options.city && CITIES[options.city] ? options.city : detectCityKey(project);
    const climate = CITIES[cityKey] || CITIES.douala;
    const isTropical = cityKey !== 'paris';

    // Centre géométrique du bâtiment
    let sx = 0, sz = 0, cnt = 0;
    for (const w of walls) {
      if (Array.isArray(w.from) && Array.isArray(w.to)) {
        sx += w.from[0] + w.to[0];
        sz += w.from[1] + w.to[1];
        cnt += 2;
      }
    }
    const centroid = cnt > 0 ? { x: sx / cnt, z: sz / cnt } : { x: 0, z: 0 };

    const facades = {
      Nord:  { wallLen: 0, wallArea: 0, glazedArea: 0, doorArea: 0, openingsCount: 0 },
      Est:   { wallLen: 0, wallArea: 0, glazedArea: 0, doorArea: 0, openingsCount: 0 },
      Sud:   { wallLen: 0, wallArea: 0, glazedArea: 0, doorArea: 0, openingsCount: 0 },
      Ouest: { wallLen: 0, wallArea: 0, glazedArea: 0, doorArea: 0, openingsCount: 0 }
    };

    const extWalls = walls.filter(w => w && w.type !== 'int');
    for (const w of extWalls) {
      const len = wallLength(w);
      if (len < 0.05) continue;
      const dir = outwardCardinal(w, centroid, northAngle);
      const bucket = facades[dir];
      bucket.wallLen += len;
      bucket.wallArea += len * wallHeight;
      for (const op of (w.openings || [])) {
        const wOp = Number(op.w) || 1.2;
        const hOp = Number(op.h) || (op.type === 'door' ? 2.1 : 1.3);
        const areaOp = wOp * hOp;
        bucket.openingsCount += 1;
        if (op.type === 'door') bucket.doorArea += areaOp;
        else bucket.glazedArea += areaOp;
      }
    }

    const facadeRows = ['Nord', 'Est', 'Sud', 'Ouest'].map(dir => {
      const b = facades[dir];
      const totalOp = b.glazedArea + b.doorArea * 0.5;
      const ratio = b.wallArea > 0 ? Math.round((totalOp / b.wallArea) * 1000) / 10 : 0;
      let risk = 'favorable';
      if (isTropical && (dir === 'Ouest' || dir === 'Est') && ratio > 22) risk = 'élevé';
      else if (isTropical && (dir === 'Ouest' || dir === 'Est') && ratio > 14) risk = 'modéré';
      else if (!isTropical && dir === 'Nord' && ratio > 18) risk = 'modéré';
      return {
        orientation: dir,
        wallLengthM: Math.round(b.wallLen * 10) / 10,
        glazedAreaM2: Math.round(b.glazedArea * 10) / 10,
        openingsCount: b.openingsCount,
        glazingRatioPct: ratio,
        exposureRisk: risk
      };
    });

    // Analyse des pièces : surface habitable, circulations, ventilation traversante
    let habitableArea = 0;
    let terraceArea = 0;
    let circulationArea = 0;
    const roomDiagnostics = [];

    for (const r of rooms) {
      const area = Math.round(roomArea(r) * 10) / 10;
      const nameLow = String(r.name || r.id || '').toLowerCase();
      const isTerrace = r.habitable === false || /v[ée]randa|terrasse|porche|balcon|garage/.test(nameLow);
      const isCirc = /couloir|d[ée]gagement|hall|entr[ée]e|escalier|palier/.test(nameLow);
      if (isTerrace) terraceArea += area;
      else habitableArea += area;
      if (isCirc) circulationArea += area;

      // Orienter les ouvertures extérieures proches de cette pièce
      const dirs = new Set();
      if (r.bounds) {
        const eps = 0.65;
        for (const w of extWalls) {
          if (!Array.isArray(w.openings) || !w.openings.length) continue;
          const mx = (w.from[0] + w.to[0]) * 0.5;
          const mz = (w.from[1] + w.to[1]) * 0.5;
          const overlapsX = Math.max(w.from[0], w.to[0]) >= r.bounds.xMin - eps && Math.min(w.from[0], w.to[0]) <= r.bounds.xMax + eps;
          const overlapsZ = Math.max(w.from[1], w.to[1]) >= r.bounds.zMin - eps && Math.min(w.from[1], w.to[1]) <= r.bounds.zMax + eps;
          if (overlapsX && overlapsZ && (w.level || 0) === (r.level || 0)) {
            dirs.add(outwardCardinal(w, centroid, northAngle));
          } else if (mx >= r.bounds.xMin - eps && mx <= r.bounds.xMax + eps && mz >= r.bounds.zMin - eps && mz <= r.bounds.zMax + eps) {
            dirs.add(outwardCardinal(w, centroid, northAngle));
          }
        }
      }
      const crossVent = dirs.size >= 2;
      if (!isTerrace && area >= 4) {
        roomDiagnostics.push({
          id: r.id || r.name,
          name: r.name || r.id || 'Pièce',
          level: Number(r.level) || 0,
          areaM2: area,
          orientations: Array.from(dirs),
          crossVentilation: crossVent,
          status: crossVent ? 'Traversante' : dirs.size === 1 ? 'Mono-orientée' : 'À ventiler (seconde cour / imposte)'
        });
      }
    }

    const totalGlazed = facadeRows.reduce((acc, f) => acc + f.glazedAreaM2, 0);
    const daylightRatioPct = habitableArea > 0 ? Math.round((totalGlazed / habitableArea) * 1000) / 10 : 0;
    const circulationRatioPct = habitableArea > 0 ? Math.round((circulationArea / habitableArea) * 1000) / 10 : 0;
    const crossVentCount = roomDiagnostics.filter(r => r.crossVentilation).length;
    const crossVentPct = roomDiagnostics.length ? Math.round((crossVentCount / roomDiagnostics.length) * 100) : 0;
    const canopyArea = canopies.reduce((acc, c) => acc + Math.max(0, (c.xMax - c.xMin) * (c.zMax - c.zMin)), 0);
    const shadingArea = Math.round((terraceArea + canopyArea) * 10) / 10;

    // Calcul du score bioclimatique pondéré /100
    let score = 58;
    if (overhang >= 0.6) score += 10;
    else if (overhang >= 0.35) score += 5;
    if (shadingArea >= 12) score += 8;
    else if (shadingArea >= 5) score += 4;
    if (crossVentPct >= 50) score += 12;
    else if (crossVentPct >= 25) score += 6;
    if (daylightRatioPct >= 12 && daylightRatioPct <= 28) score += 8;
    else if (daylightRatioPct >= 8) score += 4;
    if (circulationRatioPct <= 14) score += 4;
    const westRow = facadeRows.find(f => f.orientation === 'Ouest');
    const eastRow = facadeRows.find(f => f.orientation === 'Est');
    if (isTropical && westRow && westRow.glazingRatioPct > 22) score -= 8;
    if (isTropical && eastRow && eastRow.glazingRatioPct > 24) score -= 5;
    score = Math.max(25, Math.min(98, Math.round(score)));

    const recommendations = [];
    if (isTropical && westRow && westRow.glazingRatioPct > 14) {
      recommendations.push({
        priority: 'Haute',
        theme: 'Protection solaire Ouest',
        detail: `La façade Ouest présente ${westRow.glazingRatioPct}% de baies exposées au soleil bas d’après-midi. Ajoutez des brise-soleil verticaux bois/alu ou prolongez la casquette d’au moins 1,10 m.`
      });
    }
    if (isTropical && eastRow && eastRow.glazingRatioPct > 16) {
      recommendations.push({
        priority: 'Moyenne',
        theme: 'Ombrage matinal Est',
        detail: `La façade Est compte ${eastRow.openingsCount} ouverture(s) (${eastRow.glazingRatioPct}%). Prévoyez des persiennes orientables ou une végétation filtrante (palmiers/haies hautes).`
      });
    }
    if (overhang < 0.65 && isTropical) {
      recommendations.push({
        priority: 'Haute',
        theme: 'Débords de toiture tropicaux',
        detail: `Le débord actuel (${overhang.toFixed(2)} m) peut être porté à 0,80–1,20 m pour protéger les façades des pluies battantes et du rayonnement zénithal.`
      });
    }
    const monoRooms = roomDiagnostics.filter(r => !r.crossVentilation);
    if (monoRooms.length) {
      recommendations.push({
        priority: monoRooms.length > 2 ? 'Haute' : 'Moyenne',
        theme: 'Ventilation traversante naturelle',
        detail: `${monoRooms.length} pièce(s) (${monoRooms.slice(0, 4).map(r => r.name).join(', ')}) sont mono-orientées ou intérieures. Prévoyez des impostes ventilées, claustras hauts ou ouvertures d’angle pour activer le tirage naturel.`
      });
    }
    if (daylightRatioPct < 12) {
      recommendations.push({
        priority: 'Moyenne',
        theme: 'Éclairage naturel',
        detail: `Le ratio vitré/surface habitable est de ${daylightRatioPct}% (cible confort : 14–22%). Élargissez les baies sur les façades Nord/Sud ombragées.`
      });
    }
    if (circulationRatioPct > 15) {
      recommendations.push({
        priority: 'Info',
        theme: 'Compacité des circulations',
        detail: `Les dégagements représentent ${circulationRatioPct}% de la surface habitable ; une mutualisation entrée/séjour permettrait de gagner des m² utiles.`
      });
    }
    if (!recommendations.length) {
      recommendations.push({
        priority: 'Favorable',
        theme: 'Conception bioclimatique équilibrée',
        detail: `Excellente adéquation au climat de ${climate.name} : débords généreux, façades maîtrisées et ventilation naturelle efficace.`
      });
    }

    const levels = Array.from(new Set(rooms.map(r => Number(r.level) || 0))).sort((a, b) => a - b);

    return {
      projectName: project?.meta?.name || 'Projet architectural',
      city: climate.name,
      climateZone: climate.zone,
      priorities: climate.priorities,
      northAngle,
      score,
      grade: score >= 82 ? 'A · Excellent' : score >= 68 ? 'B · Très bon' : score >= 52 ? 'C · Perfectible' : 'D · À renforcer',
      metrics: {
        habitableAreaM2: Math.round(habitableArea * 10) / 10,
        terraceAndShadingM2: shadingArea,
        totalGlazedM2: Math.round(totalGlazed * 10) / 10,
        daylightRatioPct,
        circulationRatioPct,
        crossVentPct,
        overhangM: Math.round(overhang * 100) / 100,
        wallHeightM: wallHeight,
        levelsCount: Math.max(1, levels.length)
      },
      facades: facadeRows,
      rooms: roomDiagnostics,
      recommendations
    };
  }

  function buildLocalCctpMarkdown(project, audit) {
    const meta = project?.meta || {};
    const m = audit.metrics;
    const roomList = audit.rooms.map(r => `- **${r.name}** (R+${r.level}) : ${r.areaM2} m² — ${r.status}`).join('\n') || '- Distribution conforme aux plans joints.';
    const recList = audit.recommendations.map(r => `- **[${r.priority}] ${r.theme}** : ${r.detail}`).join('\n');
    const facadeList = audit.facades.map(f => `| ${f.orientation} | ${f.wallLengthM} m | ${f.openingsCount} | ${f.glazedAreaM2} m² | ${f.glazingRatioPct}% | ${f.exposureRisk} |`).join('\n');

    return `# Notice Architecturale, Audit Bioclimatique & Descriptif Sommaire (CCTP)

**Projet :** ${audit.projectName}
**Localisation :** ${audit.city} (${audit.climateZone})
**Phase :** ${meta.phase || 'APD'} · **Révision :** ${meta.revision || 'A'}
**Maître d’œuvre :** ${meta.architect || 'Cabinet d’architecture'}

---

## 1. Parti Architectural & Programme
Le projet développe **${m.habitableAreaM2} m² habitables** sur **${m.levelsCount} niveau(x)** (hauteur sous plafond ${m.wallHeightM.toFixed(2)} m), complétés par **${m.terraceAndShadingM2} m²** d’espaces extérieurs couverts (vérandas, terrasses et auvents). L’implantation privilégie des volumes lisibles, des circulations optimisées (${m.circulationRatioPct}% de la surface) et un éclairage naturel maîtrisé (${m.daylightRatioPct}% de surface vitrée).

### Tableau des pièces analysées
${roomList}

---

## 2. Synthèse Bioclimatique — Score : ${audit.score}/100 (${audit.grade})

| Orientation | Linéaire façade | Ouvertures | Surface vitrée | Taux vitrage | Exposition |
|---|---:|---:|---:|---:|---|
${facadeList}

### Recommandations d’optimisation
${recList}

---

## 3. Cahier des Clauses Techniques Particulières (Descriptif sommaire par lots)

### Lot 01 — Terrassements, VRD & Fondations
Implantation conforme au plan de masse, décapage de la terre végétale, fouilles en rigoles et semelles filantes/isolées en béton armé dosé à 350 kg/m³ sur béton de propreté. Drainage périphérique et raccordement eaux pluviales.

### Lot 02 — Gros Œuvre & Maçonnerie
Ossature poteaux-poutres en béton armé parasismique, murs périphériques en agglomérés creux de 20 cm et cloisons intérieures de 15 cm. Chaînages horizontaux et verticaux conformes aux règles BAEL.

### Lot 03 — Charpente, Couverture & Étanchéité
Charpente bois traité / métallique avec débords de toiture (${m.overhangM} m minimum) assurant la protection des façades. Couverture bacs acier prélaqués / tuiles avec isolation thermique sous rampants et ventilation de sous-face.

### Lot 04 — Menuiseries Extérieures & Protections Solaires
Menuiseries aluminium thermolaqué à rupture de pont thermique ou bois exotique traité, vitrage clair feuilleté/contrôle solaire sur façades exposées, complétées par des brise-soleil ou persiennes selon l’audit ci-dessus.

### Lot 05 — Revêtements de Sols, Faïences & Enduits
Enduits hydrauliques talochés fins sur façades avec peinture minérale claire à fort pouvoir réfléchissant. Carrelage grès cérame grand format dans les pièces de vie, parquet ou carrelage chaleureux dans les chambres, faïence toute hauteur en pièces d’eau.

### Lot 06 — Plomberie Sanitaire & Ventilation
Alimentation eau froide/chaude en PER/multicouche, appareillages sanitaires économes en eau, fosse septique / raccordement assainissement et ventilation haute/basse des pièces humides.

### Lot 07 — Électricité, Courants Faibles & Pré-équipement Solaire
Tableau divisionnaire conforme NFC 15-100, éclairage 100% LED basse consommation, pré-câblage climatisation inverter et attente toiture pour panneaux photovoltaïques hybrides.

### Lot 08 — Aménagements Extérieurs & Paysagisme
Vérandas abritées, cheminements piétons perméables, végétalisation locale d’ombrage (arbres à houppier filtrant à l’Est et à l’Ouest) et clôture périphérique harmonisée avec la façade.

> *Document technique indicatif généré à partir de la maquette numérique ArchiCam Studio — à valider et compléter par le maître d’œuvre et le BET avant consultation des entreprises.*
`;
  }

  function buildLocalVoiceoverScript(project, audit) {
    const m = audit.metrics;
    const rooms = audit.rooms.slice(0, 5).map(r => r.name).join(', ');
    return `Bienvenue dans la présentation de ${audit.projectName}, implantée à ${audit.city}. ` +
      `Pensée pour le confort quotidien et la lumière naturelle, cette résidence développe ${m.habitableAreaM2} mètres carrés habitables` +
      `${m.terraceAndShadingM2 > 2 ? `, prolongés par ${m.terraceAndShadingM2} mètres carrés de vérandas et d’espaces extérieurs abrités` : ''}. ` +
      `Dès l’arrivée, les volumes équilibrés, les débords de toiture protecteurs et les matières chaleureuses affirment une architecture contemporaine et apaisante. ` +
      `${rooms ? `Le parcours intérieur relie avec fluidité les principaux espaces : ${rooms}. ` : ''}` +
      `Chaque ouverture a été étudiée pour favoriser la ventilation naturelle et offrir des perspectives généreuses sur le jardin, faisant de ce projet un lieu de vie lumineux, durable et accueillant.`;
  }

  return {
    CITIES,
    detectCityKey,
    analyze,
    buildLocalCctpMarkdown,
    buildLocalVoiceoverScript
  };
})();

if (typeof module !== 'undefined') module.exports = BioclimaticAudit;
