// ═══════════════════════════════════════════════════ DAY/NIGHT CYCLE ENGINE
const DayNightCycle = {
  // One simulation second is one world-clock second. Time compression and the
  // event-driven transit loop already provide acceleration; compressing the
  // calendar a second time made an eight-hour navigation run span four dates.
  CYCLE_SECONDS: 86400,

  getDaylight(elapsedSeconds, timeScale) {
    // In-game time of day (0-1, 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk)
    const dayFraction = (elapsedSeconds % this.CYCLE_SECONDS) / this.CYCLE_SECONDS;
    // Start at 0.25 (dawn) so action begins at a reasonable time
    const tod = (dayFraction + 0.25) % 1;
    // Smooth daylight curve: 0=night, 1=noon
    const angle = tod * Math.PI * 2;
    const raw = Math.sin(angle - Math.PI/2); // -1 at midnight, +1 at noon
    return clamp((raw + 1) / 2, 0, 1); // 0-1
  },

  getTimeString(elapsedSeconds) {
    const totalMinutes = Math.floor((((elapsedSeconds % this.CYCLE_SECONDS)+6*3600)%this.CYCLE_SECONDS)/60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2,'0');
    const m = (totalMinutes % 60).toString().padStart(2,'0');
    return `${h}:${m}`;
  },

  update(state) {
    const dl = this.getDaylight(state.time.elapsedSeconds, state.time.timeScale);
    // Only update if significant change (avoid constant log spam)
    const prev = state.world.environment.daylight;
    if (Math.abs(dl - prev) > 0.01) {
      state.world.environment.daylight = dl;
      // Weather owns the final local visibility; retain the old fallback for
      // saves/builds that do not yet carry the weather system.
      const baseVis = state.world.environment._baseVisibilityNm ?? state.world.environment.visibilityNm;
      if (!state.world.environment._baseVisibilityNm) state.world.environment._baseVisibilityNm = baseVis;
      if(typeof weatherAtPosition==='function'&&state.world.weatherSystem){
        const q=weatherAtPosition(state,state.playerSub.position);
        state.world.environment.visibilityNm=q.visibilityNm;
        state.world.environment.moonIllumination=weatherMoonIllumination(state);
      }else state.world.environment.visibilityNm = baseVis * (0.3 + dl * 0.7);
    }
    return { daylight: dl, timeStr: this.getTimeString(state.time.elapsedSeconds) };
  },

  renderBar(daylight, timeStr) {
    const fill = document.getElementById('dayNightFill');
    const label = document.getElementById('dayNightLabel');
    if (!fill || !label) return;
    const pct = daylight * 100;
    const col = daylight > 0.7 ? '#f0c35a' : daylight > 0.3 ? '#f0a84a' : '#4a6a8a';
    fill.style.width = `${pct}%`;
    fill.style.background = col;
    const icon = daylight > 0.6 ? '☀' : daylight > 0.25 ? '🌅' : '🌙';
    label.textContent = `${icon} ${timeStr}`;
  }
};
