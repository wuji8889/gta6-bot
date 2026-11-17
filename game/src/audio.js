// Synthesised sound, no audio files: an engine hum that follows the car's speed, a two-tone
// police siren, and short blips for pickups, punches, crashes and finished jobs. The audio
// context only starts on the first user gesture, and M mutes everything.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;
  let engineOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      engineOn = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* sound is decoration, never a crash */ }
  }

  function noise(dur, vol) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* sound is decoration, never a crash */ }
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows the car's speed (0..1); 0 silences it. */
    setEngine(speed01, before) {
      if (!engineOn) return;
      if (!ctx || muted) return;
      try {
        const target = speed01 > 0.02 ? 0.05 + speed01 * 0.09 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.1);
        engineOsc2.frequency.setTargetAtTime(28 + speed01 * 60, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
      void before;
    },
    /** The siren wails while the police are on Rico; call every frame with wanted > 0. */
    siren(dt, on) {
      if (!engineOn || !ctx || muted) return;
      try {
        if (!on) {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          return;
        }
        sirenTimer -= dt;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.05);
        }
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    blip() {
      blip(660, 0.12, 'sine', 0.25);
      setTimeout(() => blip(880, 0.14, 'sine', 0.22), 90);
    },
    punch() {
      noise(0.12, 0.35);
      blip(120, 0.1, 'sine', 0.3);
    },
    crash() {
      noise(0.25, 0.5);
    },
    mission() {
      blip(523, 0.14, 'sine', 0.28);
      setTimeout(() => blip(659, 0.14, 'sine', 0.28), 120);
      setTimeout(() => blip(784, 0.22, 'sine', 0.3), 240);
    },
  };
}
