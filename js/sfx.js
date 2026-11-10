/*
 * 직장의 숲 · 캐릭터 공방 — sfx.js
 * Tiny synthesized sound kit (WebAudio only, no samples).
 * The AudioContext is created lazily inside unlock(), which must be called from a
 * user gesture. Before that every sound is a silent no-op. Mute is persisted.
 */
const MUTE_KEY = 'ccws-muted';

let ac = null;
let out = null;
let noise = null;
let muted = false;
let persistMute = true;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch (e) {
  /* storage blocked: default unmuted */
}

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ac = new AC();
  } catch (e) {
    ac = null;
    return null;
  }
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  out = ac.createGain();
  out.gain.value = 0.5;
  out.connect(comp).connect(ac.destination);
  // one second of white noise, reused by rattles / thuds
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

function ready() {
  return !muted && ac && ac.state === 'running';
}

/** one enveloped oscillator note */
function tone({ type = 'sine', f0 = 440, f1 = null, at = 0, dur = 0.12, vol = 0.2, attack = 0.006, lp = null, detune = 0 }) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** filtered noise burst */
function hiss({ at = 0, dur = 0.05, vol = 0.15, type = 'bandpass', freq = 3000, q = 1.2, f1 = null }) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** call from a user gesture (click / key). Safe to call repeatedly. */
  unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  },
  get muted() {
    return muted;
  },
  /** 'none' before unlock, else the AudioContext state (debug) */
  get state() {
    return ac ? ac.state : 'none';
  },
  /** force mute for this session without persisting (debug ?mute=1) */
  forceMute() {
    muted = true;
    persistMute = false;
  },
  setMuted(v) {
    muted = !!v;
    if (!persistMute) return;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  },
  toggle() {
    persistMute = true;
    this.setMuted(!muted);
    return muted;
  },

  /** bubbly select pop */
  pop(pitch = 1) {
    if (!ready()) return;
    tone({ type: 'sine', f0: 480 * pitch, f1: 1050 * pitch, dur: 0.11, vol: 0.32 });
    tone({ type: 'triangle', f0: 960 * pitch, f1: 1500 * pitch, at: 0.02, dur: 0.08, vol: 0.08 });
  },
  /** soft wooden tick (tabs, arrows) */
  tick() {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 1250, f1: 900, dur: 0.045, vol: 0.13 });
    hiss({ dur: 0.02, vol: 0.05, freq: 4200, q: 3 });
  },
  /** dice rattle then a landing bloop */
  dice() {
    if (!ready()) return;
    let at = 0;
    for (let i = 0; i < 7; i++) {
      at += 0.035 + Math.random() * 0.045;
      hiss({ at, dur: 0.035, vol: 0.16, freq: 1800 + Math.random() * 2200, q: 4 });
      tone({ type: 'square', f0: 900 + Math.random() * 900, at, dur: 0.025, vol: 0.025, lp: 2400 });
    }
    tone({ type: 'sine', f0: 380, f1: 760, at: at + 0.06, dur: 0.14, vol: 0.26 });
    tone({ type: 'sine', f0: 760, f1: 1140, at: at + 0.13, dur: 0.14, vol: 0.18 });
  },
  /** success jingle (bright arpeggio) */
  jingle() {
    if (!ready()) return;
    const notes = [784, 988, 1175, 1568];
    notes.forEach((f, i) => {
      tone({ type: 'triangle', f0: f, at: i * 0.085, dur: 0.28, vol: 0.16 });
      tone({ type: 'sine', f0: f * 2, at: i * 0.085, dur: 0.16, vol: 0.05 });
    });
    tone({ type: 'sine', f0: 2093, at: 0.36, dur: 0.5, vol: 0.09 });
  },
  /** typewriter blip; seed varies the pitch */
  blip(seed = 0) {
    if (!ready()) return;
    const k = ((seed * 7919) % 13) / 13;
    tone({ type: 'square', f0: 420 + k * 260, f1: 380 + k * 220, dur: 0.045, vol: 0.045, lp: 1800, attack: 0.004 });
  },
  /** rubber stamp thud */
  stamp() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 170, f1: 52, dur: 0.24, vol: 0.5 });
    hiss({ dur: 0.12, vol: 0.22, type: 'lowpass', freq: 900, q: 0.7 });
  },
  /** whoosh (intro curtain, modal open) */
  whoosh() {
    if (!ready()) return;
    hiss({ dur: 0.38, vol: 0.12, freq: 500, f1: 3200, q: 0.9 });
  },
  /** tiny twinkle (sparkles, copy ok) */
  twinkle() {
    if (!ready()) return;
    [1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', f0: f, at: i * 0.05, dur: 0.18, vol: 0.07 }));
  },
  /** gentle "nope" */
  nope() {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 330, f1: 250, dur: 0.12, vol: 0.16 });
    tone({ type: 'triangle', f0: 262, f1: 200, at: 0.11, dur: 0.16, vol: 0.14 });
  },
};
