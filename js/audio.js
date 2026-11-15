// Sound effects made on the spot with the Web Audio API, so there are no sound files.
const KEY = 'picklekick.muted';
let ctx = null, master = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: stay unmuted */ }

/** Browsers only allow sound after a tap or click, so call this from one. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no sound available: the game still works */ }
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.55;
}

function tone(freq, { type = 'sine', at = 0, dur = 0.15, vol = 0.3, to = null } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function noise({ at = 0, dur = 0.3, vol = 0.3, freq = 1000, q = 0.8, type = 'bandpass', attack = 0.01 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

const notes = (list, opts, gap = 0.09) => list.forEach((f, i) => tone(f, { ...opts, at: i * gap }));

export const sfx = {
  click() { tone(660, { type: 'triangle', dur: 0.08, vol: 0.25, to: 990 }); },
  lock() { notes([523, 784], { type: 'triangle', dur: 0.1, vol: 0.25 }, 0.07); },
  whistle() {
    tone(2350, { type: 'square', dur: 0.32, vol: 0.07 });
    tone(2420, { type: 'square', dur: 0.32, vol: 0.07 });
  },
  kick() {
    tone(160, { dur: 0.16, vol: 0.7, to: 45 });
    noise({ dur: 0.08, vol: 0.4, freq: 1800, type: 'highpass' });
  },
  goal() {
    noise({ dur: 2.0, vol: 0.35, freq: 1100, q: 0.5, attack: 0.25 }); // crowd roar
    notes([523, 659, 784, 1047, 784, 1047], { type: 'square', dur: 0.16, vol: 0.12 }, 0.11);
  },
  save() {
    tone(220, { type: 'sine', dur: 0.28, vol: 0.5, to: 660 }); // boing!
    tone(330, { type: 'triangle', at: 0.06, dur: 0.25, vol: 0.2, to: 880 });
  },
  post() {
    tone(1180, { type: 'triangle', dur: 0.5, vol: 0.35 });
    tone(1770, { type: 'sine', dur: 0.4, vol: 0.2 });
    noise({ dur: 0.05, vol: 0.3, freq: 3000, type: 'highpass' });
  },
  thud() { tone(120, { dur: 0.14, vol: 0.5, to: 60 }); },
  miss() {
    notes([392, 330, 262], { type: 'triangle', dur: 0.22, vol: 0.22 }, 0.16); // wah wah wah
    noise({ dur: 0.9, vol: 0.12, freq: 500, q: 0.6, attack: 0.2 });           // "awww"
  },
  star(i = 0) { notes([784 + i * 130, 1175 + i * 130], { type: 'triangle', dur: 0.18, vol: 0.25 }, 0.08); },
  levelUp() { notes([523, 659, 784, 1047, 1319], { type: 'square', dur: 0.2, vol: 0.12 }, 0.1); },
  fail() { notes([330, 294, 262, 196], { type: 'triangle', dur: 0.28, vol: 0.22 }, 0.2); },
};
