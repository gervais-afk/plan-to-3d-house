/** Schéma versionné d’un instantané partageable, utilisable aussi par le serveur. */
const VariantState = (() => {
  const floors = ['', 'oak', 'tile', 'concrete'];
  const facades = ['', 'plaster', 'timber', 'stone'];
  const projectPattern = /^[a-z0-9-]{1,60}$/;
  const channelPattern = /^[a-f0-9]{32}$/;
  const bounded = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
  const vector = (arr, size, limit) => Array.isArray(arr) && arr.length === size && arr.every(n => bounded(n, -limit, limit));
  const point = p => vector(p, 3, 10000);
  const label = (value, length = 60) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, length).trim() : '';

  function solar(input) {
    if (!input || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
    const { date, lat, lon, utc, north } = input;
    const parsed = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date ||
        !bounded(lat, -90, 90) || !bounded(lon, -180, 180) || !bounded(utc, -12, 14) || !bounded(north, 0, 360)) return null;
    return { date, lat, lon, utc, north: north % 360 };
  }

  function pose(input) {
    if (!input || !point(input.p) || !vector(input.q, 4, 1.001) || !bounded(input.f, 5, 120) || !bounded(input.e, 0, 1)) return null;
    const norm = Math.hypot(...input.q);
    if (!bounded(norm, 0.95, 1.05)) return null;
    return { p: input.p.slice(), q: input.q.map(n => n / norm), f: input.f, e: input.e, cut: input.cut === true, exploded: input.exploded === true,
      ceilings: input.ceilings === true, overlay: typeof input.overlay === 'boolean' ? input.overlay : null };
  }

  function validate(input, project) {
    if (!input || input.v !== 1 || input.project !== project || !projectPattern.test(project) ||
        !floors.includes(input.floor) || !facades.includes(input.facade)) return null;
    const view = pose(input.pose), geo = input.solar ? solar(input.solar) : null;
    if (!view || (input.solar && !geo) || !bounded(input.hour, geo ? 0 : 7, geo ? 23.75 : 20)) return null;
    return { v: 1, project, name: label(input.name), floor: input.floor, facade: input.facade, hour: input.hour, solar: geo, pose: view };
  }

  function readLink(hash, project) {
    // Conserve les liens existants #wp=… ; les paramètres partagés restent dans le fragment.
    if (hash.length > 4096) return { variant: null, channel: null, invalid: true };
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const state = params.get('variant'), token = params.get('retours');
    let variant = null;
    try { if (state) variant = validate(JSON.parse(state), project); } catch { /* lien incomplet */ }
    const channel = channelPattern.test(token || '') ? token : null;
    return { variant, channel, invalid: Boolean((state && !variant) || (token && !channel)) };
  }

  function link(href, state, channel) {
    const url = new URL(href);
    const params = new URLSearchParams();
    url.searchParams.set('project', state.project);
    params.set('variant', JSON.stringify(state));
    if (channel) params.set('retours', channel);
    url.hash = params.toString();
    return url.href;
  }
  return { validate, solar, pose, point, label, projectPattern, channelPattern, readLink, link };
})();
if (typeof module === 'object' && module.exports) module.exports = VariantState;
