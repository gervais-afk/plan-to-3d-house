/** Saisie explicite de l’heure civile, orientation Nord en direct, villes/saisons rapides et animation solaire. */
class SolarOptions {
  constructor(tools) {
    this.tools = tools;
    const el = id => document.getElementById(`solar-${id}`);
    this.geoMode = el('geo');
    this.inputs = el('inputs');
    this.result = el('result');
    this.citySelect = el('city');
    this.seasonSelect = el('season');
    this.playBtn = el('play');
    this.northRange = document.getElementById('client-north');
    this.northOut = document.getElementById('client-north-value');
    this.sweepTimer = null;
    this.values = Object.fromEntries(['lat', 'lon', 'utc', 'date', 'north'].map(id => [id, el(id)]));
    const configured = VariantState.solar(HOUSE_DATA.config.solarStudy);
    const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const startNorth = configured?.north ?? tools.hs.northDegrees ?? 0;
    this.fill(configured || { date: localDate, north: startNorth, utc: -new Date().getTimezoneOffset() / 60 });
    this.syncNorthUI(startNorth);

    this.geoMode.addEventListener('change', () => this.sync());
    this.inputs.addEventListener('change', () => this.sync());
    this.citySelect?.addEventListener('change', () => {
      if (!this.citySelect.value) return;
      const [lat, lon, utc] = this.citySelect.value.split(',').map(Number);
      this.values.lat.value = String(lat);
      this.values.lon.value = String(lon);
      this.values.utc.value = String(utc);
      if (!this.geoMode.checked) this.geoMode.checked = true;
      this.sync();
    });
    this.seasonSelect?.addEventListener('change', () => {
      if (!this.seasonSelect.value) return;
      const year = (this.values.date.value || localDate).slice(0, 4) || String(new Date().getFullYear());
      this.values.date.value = `${year}-${this.seasonSelect.value}`;
      if (!this.geoMode.checked) this.geoMode.checked = true;
      this.sync();
    });
    this.northRange?.addEventListener('input', () => {
      const deg = ((Number(this.northRange.value) % 360) + 360) % 360;
      this.tools.hs.northDegrees = deg;
      if (this.values.north) this.values.north.value = String(deg);
      this.syncNorthUI(deg);
      this.sync();
    });
    this.playBtn?.addEventListener('click', () => this.toggleSweep());
    this.configured = configured;
  }

  syncNorthUI(deg) {
    const clean = Math.round(((Number(deg) || 0) % 360 + 360) % 360);
    if (this.northRange) this.northRange.value = String(clean);
    if (this.northOut) this.northOut.value = `${clean}°`;
    const arrow = document.querySelector('#client-compass span');
    if (arrow) arrow.style.transform = `rotate(${clean}deg)`;
  }

  toggleSweep(forceState) {
    const active = typeof forceState === 'boolean' ? forceState : !this.sweepTimer;
    if (!active) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
      if (this.playBtn) {
        this.playBtn.setAttribute('aria-pressed', 'false');
        this.playBtn.textContent = '▶ Jour';
      }
      return;
    }
    if (this.playBtn) {
      this.playBtn.setAttribute('aria-pressed', 'true');
      this.playBtn.textContent = '❚❚ Stop';
    }
    let h = Number(this.tools.hs.solarTarget) || 7;
    if (h >= 19.5 || h < 6.5) h = 7;
    this.tools.setHour(h);
    this.sweepTimer = setInterval(() => {
      h += 0.25;
      if (h > 19.75) {
        this.toggleSweep(false);
        return;
      }
      this.tools.setHour(h);
    }, 180);
  }

  fill(geo) {
    Object.entries(this.values).forEach(([key, el]) => { if (el) el.value = geo[key] ?? ''; });
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
    this.syncNorthUI(geo?.north ?? this.tools.hs.northDegrees);
    this.tools.setHour(hour);
  }

  restore(solar, hour) {
    this.geoMode.checked = Boolean(solar);
    if (solar) this.fill(solar);
    this.sync(hour);
  }

  updateReading() {
    const { hs } = this.tools;
    if (!this.geoMode.checked) {
      this.result.textContent = `Nord orienté à ${Math.round(hs.northDegrees || 0)}°`;
      return;
    }
    if (!hs.solarGeo) { this.result.textContent = 'Sélectionnez une ville ou complétez latitude, longitude, date et UTC.'; return; }
    const { altitude, azimuth } = SolarStudy.position(hs.solarTarget, hs.northDegrees, hs.solarGeo);
    this.result.textContent = `Hauteur ${clientNumber.format(altitude)}° · azimut ${clientNumber.format(azimuth)}° · Nord ${Math.round(hs.solarGeo.north)}°${altitude < 0 ? ' · sous l’horizon' : ''}`;
  }
}
