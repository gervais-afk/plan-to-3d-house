/** Saisie explicite de l’heure civile : pas de géolocalisation ni d’appel tiers. */
class SolarOptions {
  constructor(tools) {
    this.tools = tools;
    const el = id => document.getElementById(`solar-${id}`);
    this.geoMode = el('geo');
    this.inputs = el('inputs');
    this.result = el('result');
    this.values = Object.fromEntries(['lat', 'lon', 'utc', 'date', 'north'].map(id => [id, el(id)]));
    const configured = VariantState.solar(HOUSE_DATA.config.solarStudy);
    const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    this.fill(configured || { date: localDate, north: tools.hs.northDegrees, utc: -new Date().getTimezoneOffset() / 60 });
    this.geoMode.addEventListener('change', () => this.sync());
    this.inputs.addEventListener('change', () => this.sync());
    this.configured = configured;
  }

  fill(geo) {
    Object.entries(this.values).forEach(([key, el]) => { el.value = geo[key] ?? ''; });
  }

  read() {
    return VariantState.solar(Object.fromEntries(Object.entries(this.values).map(([key, el]) =>
      [key, key === 'date' ? el.value : el.valueAsNumber])));
  }

  sync(hour = this.tools.hs.solarTarget) {
    this.inputs.hidden = !this.geoMode.checked;
    const geo = this.geoMode.checked ? this.read() : null;
    this.tools.hs.solarGeo = geo;
    const slider = this.tools.hour;
    slider.min = geo ? 0 : 7;
    slider.max = geo ? 23.75 : 20;
    document.getElementById('client-hour-scale').textContent = geo ? '00h00 — heure civile locale — 23h45' : '07h00 — simulation indicative — 20h00';
    document.querySelector('#client-compass span').style.transform = `rotate(${geo?.north ?? this.tools.hs.northDegrees}deg)`;
    this.tools.setHour(hour);
  }

  restore(solar, hour) {
    this.geoMode.checked = Boolean(solar);
    if (solar) this.fill(solar);
    this.sync(hour);
  }

  updateReading() {
    const { hs } = this.tools;
    if (!this.geoMode.checked) { this.result.textContent = ''; return; }
    if (!hs.solarGeo) { this.result.textContent = 'Complétez les coordonnées, la date et le décalage UTC.'; return; }
    const { altitude, azimuth } = SolarStudy.position(hs.solarTarget, hs.northDegrees, hs.solarGeo);
    this.result.textContent = `Hauteur ${clientNumber.format(altitude)}° · azimut ${clientNumber.format(azimuth)}°${altitude < 0 ? ' · sous l’horizon' : ''}`;
  }
}
