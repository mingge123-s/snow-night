// Procedural wind: filtered noise whose level and pitch follow the wind speed.
export function createWind() {
  let ctx = null, master, low, lowGain, whistle, whistleGain;
  function start() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b = 0;
      for (let i = 0; i < len; i++) { b = b * 0.985 + (Math.random() * 2 - 1) * 0.15; d[i] = b + (Math.random() * 2 - 1) * 0.08; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    low = ctx.createBiquadFilter(); low.type = 'bandpass'; low.frequency.value = 320; low.Q.value = 0.6;
    lowGain = ctx.createGain(); lowGain.gain.value = 0;
    whistle = ctx.createBiquadFilter(); whistle.type = 'bandpass'; whistle.frequency.value = 900; whistle.Q.value = 6;
    whistleGain = ctx.createGain(); whistleGain.gain.value = 0;
    master = ctx.createGain(); master.gain.value = 0;
    src.connect(low).connect(lowGain).connect(master);
    src.connect(whistle).connect(whistleGain).connect(master);
    master.connect(ctx.destination);
    src.start();
  }
  return {
    setEnabled(on) {
      if (on && !ctx) start();
      if (!ctx) return;
      if (on) ctx.resume();
      master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.2);
    },
    update(wind) {
      if (!ctx) return;
      const k = Math.min(1, wind / 22), t = ctx.currentTime;
      lowGain.gain.setTargetAtTime(0.05 + 1.6 * Math.pow(k, 1.3), t, 0.25);
      low.frequency.setTargetAtTime(220 + 520 * k, t, 0.3);
      whistleGain.gain.setTargetAtTime(0.5 * Math.pow(k, 2.4), t, 0.3);
      whistle.frequency.setTargetAtTime(650 + 900 * k, t, 0.4);
    },
  };
}
