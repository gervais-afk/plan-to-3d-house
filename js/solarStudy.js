/** Trajectoire solaire indicative (heure solaire, sans date ni géolocalisation). */
const SolarStudy = (() => {
  // Heure, azimut depuis le nord, hauteur du soleil, chaleur, niveau du soir.
  const keys = [
    [7, 87, 8, 0.9, 0], [9, 108, 31, 0.36, 0], [12, 155, 73, 0, 0],
    [13, 180, 79, 0, 0], [14, 213, 69, 0, 0], [18, 263, 14, 0.84, 0.12],
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
  function format(hour) {
    const minutes = Math.round(hour * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
  }
  return { min, max, day, evening, clamp, sample, format };
})();
