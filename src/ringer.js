// Ringtone and ringback, made with the Web Audio API so there are no sound files to ship.
let ctx;
let timer = null;

const tone = (freq, start, length, volume) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.03);
  gain.gain.setValueAtTime(Math.max(0.0002, volume), t + length - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
};

// 'in' = someone is calling you (a double ring), 'out' = you are calling (a softer, slower ringback)
export function startRing(kind, volume = 60) {
  stopRing();
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
  } catch {
    return;
  }
  const v = (Math.max(0, Math.min(100, volume)) / 100) * (kind === 'in' ? 0.3 : 0.14);
  const play = () => {
    try {
      if (kind === 'in') {
        for (const at of [0, 0.5]) {
          tone(440, at, 0.36, v);
          tone(554, at, 0.36, v * 0.7);
        }
      } else {
        tone(425, 0, 1.1, v);
      }
    } catch {}
  };
  play();
  timer = setInterval(play, kind === 'in' ? 2600 : 3200);
}

export function stopRing() {
  clearInterval(timer);
  timer = null;
}

// short blips for "connected" and "call ended"
export function blip(kind) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
    if (kind === 'up') {
      tone(660, 0, 0.12, 0.08);
      tone(880, 0.13, 0.16, 0.08);
    } else {
      tone(520, 0, 0.14, 0.08);
      tone(390, 0.15, 0.2, 0.08);
    }
  } catch {}
}
