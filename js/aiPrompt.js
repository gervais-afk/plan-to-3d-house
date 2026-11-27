/**
 * PROMPTS IA PILOTÉS PAR LE PROJET
 * Le rendu IA n'est plus une illustration générique : son prompt est déduit du modèle (pièce, finitions
 * réellement affichées, soleil calculé par SolarStudy, ville du métré). Le socle de fidélité géométrique reste
 * toujours en tête et n'est jamais modifié par les données.
 * Les `tags` renvoyés sont enregistrés dans le manifeste pour savoir, plus tard, de quel état du projet
 * provient chaque image (pièce, finitions, heure, version du plan).
 */
const AiPrompt = (() => {
  const FIDELITY = {
    interior: 'Create a high-end Calm Luxury architectural interior visualization based on the attached Three.js reference. Preserve the original camera viewpoint, crop, perspective, room dimensions, structural geometry, wall and ceiling outlines, doors, windows, glazing, and the position and scale of all architectural elements. Do not invent rooms, openings, structural components, or alter the silhouette. Upgrade materials and light only.',
    exterior: 'Create a high-end Calm Luxury architectural exterior visualization based on the attached Three.js reference. Preserve the original camera viewpoint, crop, perspective, building volumes, roof lines, facade geometry, doors, windows, glazing, terraces, and the position and scale of all architectural elements. Do not invent storeys, wings, openings, structural components, or alter the silhouette. Upgrade materials, landscape and light only.',
    plan2d: 'Transform this exact 2D architectural floor plan drawing into an elite, magazine-quality colored presentation floor plan (strict top-down view, plan de vente / plan commercial colorisé, Architectural Digest / Detail editorial style). Preserve the strict 2D orthogonal top-down projection and the exact geometry of all walls, partitions, doors, windows, verandas, and room boundaries: do not rotate, shift, slant, tilt into 3D perspective, or invent new rooms or walls.'
  };

  const CLOSING = {
    interior: 'Keep the existing furniture layout and circulation clear; add only sparse, correctly scaled styling where it cannot conceal or alter the architecture. Avoid people, vehicles, neighboring buildings, text, captions, logos, watermarks, and decorative elements that are not supported by the reference.',
    exterior: 'Keep every existing tree, hedge, fence, path and terrace exactly where the reference shows it, translating simplified 3D trees and hedges into authentic local tropical species (mango trees, palms, bougainvillea, broad-leaf shrubs): do not remove, add or move trees, and every shadow must be cast by an object visible in the image. Keep each opening as it is: an open bay stays open, a door stays a door, a window stays a window; do not turn openings into sliding glass doors. Do not place furniture, beds, rugs, lamps or curtains outdoors. Keep planting low and away from openings so it never hides or alters the architecture. Avoid people, vehicles, neighboring buildings, text, captions, logos, watermarks, and elements not supported by the reference.',
    plan2d: 'Infill solid walls with deep matte charcoal poché and subtle cast shadows. Add tastefully scaled minimalist top-down furniture and subtle potted plants. Keep all spaces clearly readable, with clean linen-white background, crisp lines, and refined architectural palette. No perspective distortion, no tilt, strictly 2D flat top-down. No text, logos or watermarks added.'
  };

  // Identifiants des finitions (sélecteurs client, ClientFinishes) et des sols du modèle (room.floorType).
  const FLOORS = {
    oak: 'light natural oak parquet with fine matte oil finish',
    parquet: 'warm natural oak parquet with fine matte oil finish',
    tile: 'large-format anthracite grey porcelain tiles with tight joints',
    tiles: 'large-format light porcelain tiles with tight joints',
    concrete: 'seamless polished waxed concrete (béton ciré) floor',
    stone: 'honed natural limestone slabs'
  };
  const FACADES = {
    plaster: 'smooth white mineral render (crépi blanc)',
    timber: 'contemporary vertical timber cladding',
    stone: 'natural stone facade cladding'
  };

  // Usage déduit du nom de la pièce : règles ordonnées, la première qui correspond l'emporte.
  const ROOM_USES = [
    [/cuisine|kitchen/, 'kitchen', 'a calm contemporary kitchen with clean worktops'],
    [/s(é|e)jour|salon|living|v(é|e)randa/, 'living', 'an airy living room open to its glazing'],
    [/suite|parental/, 'suite', 'a serene master suite'],
    [/chambre|bedroom/, 'bedroom', 'a quiet, restful bedroom'],
    [/salle d.?eau|salle de bain|bain|douche|wc|toilette/, 'bathroom', 'a refined bathroom with water-resistant finishes'],
    [/bureau|office/, 'office', 'a focused home office'],
    [/hall|entr(é|e)e|d(é|e)gagement|couloir|circulation/, 'circulation', 'an entrance and circulation space'],
    [/salle (à|a) manger|dining/, 'dining', 'a dining room']
  ];

  const CLIMATES = {
    douala: 'humid coastal tropical climate of Douala, Cameroon: warm luminous equatorial daylight, soft hazy tropical sky, lush broad-leaf plants, palms and mango foliage',
    'buea-kribi': 'coastal tropical climate of Cameroon: warm equatorial daylight, soft hazy sky, lush palms and broad-leaf vegetation',
    yaounde: 'green hilly equatorial climate of Yaoundé: clear tropical sky, dense green vegetation',
    ebolowa: 'equatorial forest climate: humid sky, dense green vegetation',
    bafoussam: 'cool western highlands climate: clear sky, green terraced vegetation',
    bamenda: 'cool western highlands climate: clear sky, green terraced vegetation',
    ngaoundere: 'Adamawa plateau climate: open sky, savanna grasses and scattered trees',
    garoua: 'dry Sudanian climate: bright sky, savanna trees, dry grasses',
    maroua: 'Sahelian climate: bright dry sky, sparse acacias and dry grasses'
  };

  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const compass = azimuth => COMPASS[Math.round(((azimuth % 360) + 360) % 360 / 45) % 8];

  /**
   * Soleil géographique (indépendant de l'orientation du modèle) : azimut depuis le nord et hauteur en degrés.
   * Sans géolocalisation, on reprend la trajectoire indicative de SolarStudy avec un nord à 0°.
   */
  function sunAt(hour, geo, solar) {
    if (!solar || !Number.isFinite(hour)) return null;
    if (geo) {
      const p = solar.position(hour, 0, { ...geo, north: 0 });
      return { hour, azimuth: p.azimuth, altitude: p.altitude };
    }
    const p = solar.sample(hour, 0);
    const azimuth = (Math.atan2(p.x, -p.z) * 180 / Math.PI + 360) % 360;
    return { hour, azimuth, altitude: Math.asin(Math.max(-1, Math.min(1, p.y))) * 180 / Math.PI };
  }

  function lightPhrase(sun, night, kind) {
    const inside = kind === 'interior';
    if (night || (sun && sun.altitude < 0)) {
      return inside
        ? 'Blue-hour evening: deep blue dusk sky beyond the glazing, warm 2700 K lamps, soft pools of light, no harsh light.'
        : 'Blue-hour evening: deep blue dusk sky, warm 2700 K interior lamps glowing through the existing glazing, discreet garden lighting.';
    }
    if (!sun) return inside ? 'Soft natural daylight filtered through the existing glazing.' : 'Soft natural daylight under a luminous sky.';
    const from = compass(sun.azimuth), alt = sun.altitude;
    if (alt < 15) return `Low golden-hour sun from the ${from}: long warm raking light and soft long shadows${inside ? ' through the existing openings' : ' across the facades'}.`;
    if (alt < 40) return `Warm directional sunlight from the ${from} at mid height: crisp but gentle shadows${inside ? ', light filtered through the existing glazing' : ' on the facades and terraces'}.`;
    return `High tropical midday sun from the ${from}: bright, softened by roof overhangs and verandas, short shadows${inside ? ', diffuse luminous interior light' : ''}.`;
  }

  function roomUse(room) {
    const name = String(room?.name || '').toLowerCase();
    const rule = ROOM_USES.find(([pattern]) => pattern.test(name));
    return rule ? { use: rule[1], phrase: rule[2] } : null;
  }

  /** Empreinte courte et stable de la géométrie (murs + pièces) : change dès que le plan change. */
  function planVersion(data) {
    const source = JSON.stringify({ walls: data?.walls || [], rooms: (data?.rooms || []).map(r => [r.id, r.bounds, r.level]) });
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * @param {object} o
   * @param {'interior'|'exterior'|'plan2d'} o.kind
   * @param {object} [o.room]      pièce du modèle ({ name, floorType })
   * @param {object} [o.finishes]  { floor, facade } : identifiants choisis ('' ou absent = finition du projet)
   * @param {object} [o.sun]       { hour, azimuth, altitude } (voir sunAt)
   * @param {boolean} [o.night]
   * @param {string} [o.city]      clé de ville du métré (douala, yaounde…)
   * @param {string} [o.planVersion]
   */
  function build(o = {}) {
    const kind = FIDELITY[o.kind] ? o.kind : 'interior';
    const finishes = o.finishes || {};
    const floorId = FLOORS[finishes.floor] ? finishes.floor : (FLOORS[o.room?.floorType] ? o.room.floorType : null);
    const facadeId = FACADES[finishes.facade] ? finishes.facade : null;
    const use = kind === 'interior' ? roomUse(o.room) : null;
    const climate = CLIMATES[o.city] || null;
    const parts = [FIDELITY[kind]];

    if (kind === 'plan2d') {
      parts.push(floorId && FLOORS[finishes.floor]
        ? `Render all habitable floors in ${FLOORS[floorId]}; wet rooms in matching light porcelain tiles; verandas and porches in fine-jointed outdoor stone paving.`
        : 'Render floor finishes according to space: warm natural oak parquet in bedrooms, polished light stone or porcelain tiles in living spaces and kitchen, fine-jointed outdoor stone paving on verandas and porches.');
    } else {
      if (use) parts.push(`The space is ${use.phrase}${o.room?.name ? ` (« ${o.room.name} »)` : ''}.`);
      // Sans finition choisie, la façade garde sa couleur : un essai réel avait viré un enduit blanc au beige.
      const materials = kind === 'interior'
        ? [floorId ? `floor in ${FLOORS[floorId]}` : null, 'walls in light warm mineral lime plaster', 'clean flat matte off-white ceiling', 'matte black aluminium window frames']
        : [facadeId ? `facade in ${FACADES[facadeId]}` : 'facade colour and finish exactly as in the reference', 'matte black aluminium window frames', 'restrained natural stone details'];
      parts.push(`Materials, exactly as specified by the project: ${materials.filter(Boolean).join(', ')}.`);
      parts.push(lightPhrase(o.sun, o.night, kind));
      if (climate) parts.push(kind === 'exterior' ? `Site context: ${climate}.` : `Views through the glazing show a ${climate.split(':')[0]} with soft green vegetation.`);
    }
    parts.push(CLOSING[kind]);

    const tags = {
      kind,
      room: o.room?.id || null,
      use: use?.use || null,
      floor: floorId,
      facade: facadeId,
      hour: o.sun && Number.isFinite(o.sun.hour) ? Math.round(o.sun.hour * 100) / 100 : null,
      sun: o.sun && !o.night ? `${compass(o.sun.azimuth)} ${Math.round(o.sun.altitude)}°` : (o.night ? 'night' : null),
      city: climate ? o.city : null,
      planVersion: o.planVersion || null
    };
    return { prompt: parts.join(' '), tags };
  }

  const FLOOR_LABELS_FR = {
    oak: 'parquet chêne naturel',
    parquet: 'parquet bois chaleureux',
    wood: 'parquet bois',
    tile: 'carrelage grand format',
    tiles: 'carrelage clair',
    concrete: 'béton ciré',
    stone: 'pierre naturelle',
    marble: 'marbre clair'
  };

  const WARM_COPY = {
    living: 'Un espace de vie accueillant et lumineux, pensé pour les moments partagés et la douceur du quotidien.',
    dining: 'Un lieu convivial et baigné de lumière naturelle, conçu pour réunir famille et invités dans le calme.',
    kitchen: 'Une cuisine contemporaine fonctionnelle et chaleureuse, aux lignes sobres et aux circulations fluides.',
    suite: 'Un refuge apaisant et élégant, dédié au repos, à l’intimité et à la lumière douce.',
    bedroom: 'Une chambre sereine et confortable, imaginée comme un cocon reposant aux proportions équilibrées.',
    bathroom: 'Une pièce d’eau soignée aux finitions minérales, pensée comme une parenthèse de bien-être.',
    office: 'Un espace de travail calme et inspirant, propice à la concentration dans une atmosphère chaleureuse.',
    circulation: 'Un seuil lumineux qui distribue naturellement les espaces et accompagne le regard vers les pièces de vie.'
  };

  /**
   * Génère un descriptif court, chaleureux et strictement fidèle aux données réelles de la pièce
   * (nom, surface mesurée, niveau, revêtement de sol) — sans jamais inventer d’équipement inexistant.
   */
  function warmRoomCaption(room, options = {}) {
    const rawName = String(room?.name || options.label || '').trim();
    const displayName = rawName.replace(/\s*—\s*Rendu IA$/i, '').replace(/^Vue\s+—\s+/i, '').trim() || 'Espace intérieur';
    const match = roomUse({ name: displayName });
    const baseSentence = match ? WARM_COPY[match.use] : 'Un volume harmonieux pensé pour le confort, la lumière naturelle et la qualité des matières.';
    const areaVal = Number.isFinite(room?.area) && room.area > 0
      ? room.area
      : (room?.bounds ? Math.max(0, room.bounds.xMax - room.bounds.xMin) * Math.max(0, room.bounds.zMax - room.bounds.zMin) : 0);
    const details = [];
    if (areaVal >= 1) details.push(`${Math.round(areaVal * 10) / 10} m²`.replace('.', ','));
    if (Number(room?.level) > 0) details.push(`à l’étage R+${Number(room.level)}`);
    const floorKey = options.floor || room?.floorType;
    if (floorKey && FLOOR_LABELS_FR[floorKey]) details.push(`sol en ${FLOOR_LABELS_FR[floorKey]}`);
    const qualifier = details.length ? ` (${details.join(' · ')})` : '';
    return `${displayName}${qualifier} — ${baseSentence}`;
  }

  /**
   * Construit un prompt vidéo réaliste (Seedance / Runway Gen-4 / Luma / Veo / Wan VACE)
   * combinant fidélité architecturale stricte, cinématographie très lente et vie naturelle
   * (personnages en mouvement doux + végétation/ciel/lumière extérieure vivants).
   */
  function buildVideoPrompt({ kind = 'exterior', movement = '', room = null, city = 'douala', livingPeople = true, livingEnvironment = true, pace = 'slow' } = {}) {
    const inside = kind === 'interior';
    const climate = CLIMATES[city] || CLIMATES.douala;
    const isContemplative = pace === 'contemplative' || pace === 'contemplatif';
    const roomName = typeof room === 'string' ? room : room?.name;
    const paceCue = isContemplative
      ? 'Ultra-slow, meditative architectural cinema gimbal glide (24 fps, 35mm prime lens, buttery stabilization, lingering smoothly so every volume and material breathes).'
      : 'Very slow, fluid architectural steadicam glide (24 fps, natural depth of field, zero abrupt camera cuts or rapid turns).';
    const lock = inside
      ? 'Strictly preserve the exact architecture, walls, floor plan, ceiling lines, doors, windows, columns, and furniture proportions from the reference frame. Do not alter or invent structural geometry.'
      : 'Strictly preserve the exact building volumes, rooflines, facades, verandas, columns, doors, windows, and garden layout from the reference frame. Do not alter or invent storeys or openings.';
    const parts = [lock, paceCue];
    if (movement) parts.push(`Camera motion: ${movement}.`);
    if (roomName && inside) parts.push(`Interior setting: « ${roomName} » bathed in soft natural light.`);
    if (livingEnvironment) {
      parts.push(inside
        ? `Living environment: warm daylight and dappled sunbeams drift subtly across the floor and lime-plaster walls; sheer linen curtains breathe gently in a soft breeze; through the glazing, tropical garden trees and palms sway naturally in the wind (${climate.split(':')[0]}).`
        : `Living environment (${climate}): a gentle tropical breeze smoothly sways palm fronds, mango leaves, hedges, and grass; soft high clouds drift across the warm sky, creating subtle shifting dappled shadows across the facade, veranda, and lawn; distant birds glide across the upper sky.`);
    }
    if (livingPeople) {
      parts.push(inside
        ? 'Natural human presence: one or two stylishly dressed residents appear naturally in the background — relaxing calmly in the seating area or strolling unhurriedly toward the veranda with subtle, lifelike posture and head movement, never obstructing the architecture.'
        : 'Natural human presence: two or three residents dressed in understated contemporary attire bring authentic human scale — strolling calmly along the garden path, stepping onto the shaded veranda, or conversing softly on the terrace with fluid, realistic motion.');
    }
    parts.push('Photorealistic architectural film color grading, natural filmic dynamic range, crisp textures, no text, no watermarks, no morphing walls.');
    return parts.join(' ');
  }

  return { build, buildVideoPrompt, sunAt, planVersion, compass, warmRoomCaption, FLOORS, FACADES };
})();

if (typeof module !== 'undefined') module.exports = AiPrompt;
