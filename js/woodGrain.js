/**
 * FIL DE BOIS — motif vectoriel de la charte ArchiCam (libre de droits, généré, déterministe)
 *
 * Des veines verticales ondulantes, souvent doublées (double trait fin), qui s'écartent autour de
 * quelques nœuds ; chaque nœud est cerné de cernes ovales. Une même graine donne toujours le même dessin.
 *  - WoodGrain.lines(options) → polylignes [[x, y], …] dans un repère width × height
 *  - WoodGrain.svg(options)   → chaîne SVG (accueil)
 * Utilisé en filet très pâle : il réchauffe le papier sans jamais concurrencer un dessin technique.
 */
const WoodGrain = (() => {
  // Générateur pseudo-aléatoire à graine (mulberry32).
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * @param {object} o
   * @param {number} o.width, o.height  dimensions du repère
   * @param {number} [o.spacing]        écart moyen entre veines
   * @param {number} [o.knots]          nombre de nœuds
   * @param {number} [o.seed]
   * @param {number} [o.step]           pas vertical d'échantillonnage
   */
  function lines({ width, height, spacing = width / 34, knots = 3, seed = 7, step = height / 90 } = {}) {
    const rnd = random(seed);
    const knotList = Array.from({ length: knots }, () => ({
      x: width * (0.12 + rnd() * 0.76), y: height * (0.18 + rnd() * 0.64),
      rx: spacing * (0.9 + rnd() * 0.9), ry: height * (0.07 + rnd() * 0.07)
    }));
    const out = [];
    // Veines : un tracé de base ondulant, dévié autour des nœuds ; une sur deux est doublée.
    for (let x0 = -spacing; x0 < width + spacing; x0 += spacing * (0.6 + rnd() * 0.8)) {
      const a1 = spacing * (0.15 + rnd() * 0.35), f1 = (1.2 + rnd() * 1.8) * Math.PI / height, p1 = rnd() * 6.28;
      const a2 = spacing * (0.05 + rnd() * 0.12), f2 = (4 + rnd() * 5) * Math.PI / height, p2 = rnd() * 6.28;
      const drift = (rnd() - 0.5) * spacing * 0.8;
      const vein = [];
      for (let y = -step; y <= height + step; y += step) {
        let x = x0 + a1 * Math.sin(y * f1 + p1) + a2 * Math.sin(y * f2 + p2) + drift * (y / height);
        // Écart autour des nœuds : la veine contourne le nœud du côté où elle se trouve.
        for (const k of knotList) {
          const dy = (y - k.y) / (k.ry * 1.9), dx = x - k.x;
          const push = Math.exp(-dy * dy) * Math.exp(-(dx * dx) / (k.rx * k.rx * 6));
          x += Math.sign(dx || 1) * k.rx * 1.1 * push;
        }
        vein.push([x, y]);
      }
      out.push(vein);
      if (rnd() < 0.55) {
        const gap = spacing * (0.06 + rnd() * 0.08);
        out.push(vein.map(([x, y]) => [x + gap, y]));
      }
    }
    // Nœuds : cernes ovales concentriques, légèrement en amande.
    for (const k of knotList) {
      const rings = 2 + Math.floor(rnd() * 2);
      for (let r = 1; r <= rings; r++) {
        const s = 0.35 + r * 0.28, ring = [];
        for (let t = 0; t <= 48; t++) {
          const a = t / 48 * Math.PI * 2;
          const pinch = 1 - 0.35 * Math.pow(Math.abs(Math.sin(a)), 3); // pointes en haut et en bas
          ring.push([k.x + Math.cos(a) * k.rx * s * pinch, k.y + Math.sin(a) * k.ry * s]);
        }
        out.push(ring);
      }
    }
    return out;
  }

  const round = n => Math.round(n * 10) / 10;

  /** SVG autonome : filet `stroke`, épaisseur `strokeWidth`, recadré en « slice » pour couvrir l'écran. */
  function svg({ width = 1600, height = 1000, stroke = '#B38646', strokeWidth = 1.1, opacity = 0.16, ...rest } = {}) {
    const paths = lines({ width, height, ...rest })
      .map(line => 'M' + line.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">`
      + `<path d="${paths}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /**
   * Trace le motif dans un PDF jsPDF (vectoriel), limité au rectangle (x, y, w, h).
   * `color` doit être une teinte déjà mêlée au fond (impression sans transparence).
   */
  function drawPdf(doc, { x, y, w, h, color, lineWidth = 0.12, seed = 7, knots = 3, spacing }) {
    doc.setDrawColor(color).setLineWidth(lineWidth);
    const clip = ([px, py]) => [Math.max(0, Math.min(w, px)), Math.max(0, Math.min(h, py))];
    for (const line of lines({ width: w, height: h, seed, knots, spacing: spacing || w / 30 })) {
      const pts = line.map(clip);
      const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      if (deltas.length) doc.lines(deltas, x + pts[0][0], y + pts[0][1], [1, 1], 'S', false);
    }
  }

  return { lines, svg, drawPdf, random };
})();

if (typeof module !== 'undefined') module.exports = WoodGrain;
