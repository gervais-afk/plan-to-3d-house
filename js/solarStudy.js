/** Trajectoire indicative et approximation solaire NOAA (heure civile avec décalage UTC). */
const SolarStudy = (() => {
  // Heure, azimut depuis le nord, hauteur du soleil, chaleur, niveau du soir.
  const keys = [
    [7, 87, 8, 0.9, 0], [9, 108, 31, 0.36, 0], [12, 155, 73, 0, 0],
    [13, 180, 79, 0, 0], [14, 213, 69, 0, 0], [16, 244, 45, 0.82, 0.02], [18, 263, 14, 0.9, 0.12],
    [19, 273, 4, 1, 0.54], [20, 283, -5, 1, 1]
  ];
  const min = 7, max = 20, day = 13, evening = 20;
  const rad = Math.PI / 180;
  const clamp = hour => Math.max(min, Math.min(max, hour));
  function sample(hour, north = 0) {
    hour = clamp(hour);
    const i = keys.findIndex(k => k[0] >= hour);
    const b = keys[i], a = keys[Math.max(0, i - 1)];
    const t = (hour - a[0]) / (b[0] - a[0] || 1);
    const [, azimuth, altitude, warmth, dusk] = a.map((value, j) => value + t * (b[j] - value));
    const az = (azimuth + north) * rad, alt = Math.max(2, altitude) * rad;
    return { x: Math.sin(az) * Math.cos(alt), y: Math.sin(alt), z: -Math.cos(az) * Math.cos(alt), warmth, dusk,
      light: Math.max(0, Math.min(1, (altitude + 2) / 14)) };
  }
  const clampHour = (hour, geo) => geo ? Math.max(0, Math.min(23.75, hour)) : clamp(hour);
  function position(hour, north, geo) {
    if (!geo) return sample(hour, north);
    const year = Number(geo.date.slice(0, 4));
    const days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
    const date = Date.parse(geo.date + 'T00:00:00Z');
    const start = Date.parse(geo.date.slice(0, 4) + '-01-01T00:00:00Z');
    const gamma = 2 * Math.PI / days * ((date - start) / 86400000 + (hour - 12) / 24);
    const c = Math.cos, s = Math.sin;
    const eq = 229.18 * (0.000075 + 0.001868 * c(gamma) - 0.032077 * s(gamma) - 0.014615 * c(2 * gamma) - 0.040849 * s(2 * gamma));
    const decl = 0.006918 - 0.399912 * c(gamma) + 0.070257 * s(gamma) - 0.006758 * c(2 * gamma) +
      0.000907 * s(2 * gamma) - 0.002697 * c(3 * gamma) + 0.00148 * s(3 * gamma);
    const latitude = geo.lat * rad;
    const ha = ((hour - geo.utc - 12) * 15 + geo.lon + eq / 4) * rad;
    const east = -c(decl) * s(ha);
    const geographicNorth = c(latitude) * s(decl) - s(latitude) * c(decl) * c(ha);
    const up = s(latitude) * s(decl) + c(latitude) * c(decl) * c(ha);
    const alt = Math.asin(Math.max(-1, Math.min(1, up)));
    const azimuth = Math.atan2(east, geographicNorth);
    const az = azimuth + geo.north * rad, visualAlt = Math.max(1.5 * rad, alt);
    const unit = n => Math.max(0, Math.min(1, n));
    const deg = alt / rad;
    return { x: s(az) * c(visualAlt), y: s(visualAlt), z: -c(az) * c(visualAlt),
      altitude: deg, azimuth: (azimuth / rad + 360) % 360,
      warmth: unit((21 - deg) / 21), dusk: unit((5 - deg) / 13), light: unit(deg / 16) };
  }
  function format(hour) {
    const minutes = Math.round(hour * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
  }
  return { min, max, day, evening, clamp, clampHour, sample, position, format };
})();
