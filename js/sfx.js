/*
 * 직장의 숲 · 캐릭터 공방 — sfx.js
 * Tiny synthesized sound kit (WebAudio only, no samples).
 * The AudioContext is created lazily inside unlock(), which must be called from a
 * user gesture. Before that every sound is a silent no-op. Mute is persisted.
 */
import { bgm, storedVolume, volumeGain } from './bgm.js';

const MUTE_KEY = 'ccws-muted';
const VOL_KEY = 'ccws-vol-sfx';
const SFX_LEVEL = 0.5; // the effects' gain at the default volume

let ac = null;
let out = null;
let noise = null;
let muted = false;
let persistMute = true;
let volume = storedVolume(VOL_KEY); // 0..1, see bgm.js
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
  comp.connect(ac.destination);
  // the effects and the music each have their own volume in front of the shared compressor
  out = ac.createGain();
  out.gain.value = SFX_LEVEL * volumeGain(volume);
  out.connect(comp);
  const music = ac.createGain();
  music.gain.value = SFX_LEVEL;
  music.connect(comp);
  // one second of white noise, reused by rattles / thuds
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // the background music keeps quiet while muted
  bgm.attach(ac, music, noise, () => !muted);
  ac.addEventListener('statechange', () => bgm.refresh());
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

/**
 * filtered noise. By default a burst: it starts at full and dies away (clicks, taps, knocks).
 * swell (seconds): it comes up gently over that long, holds, and goes as gently — for
 * wind, a passing car: anything that would sound like a pop if it began at full.
 */
function hiss({ at = 0, dur = 0.05, vol = 0.15, type = 'bandpass', freq = 3000, q = 1.2, f1 = null, swell = 0 }) {
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
  if (swell > 0) {
    const up = Math.min(swell, dur * 0.45);
    g.gain.linearRampToValueAtTime(vol, t + up);
    g.gain.setValueAtTime(vol, t + Math.max(up, dur - up * 1.4));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/**
 * Something with a voice: a buzzing source (pitch gliding f0 -> f1, with a share of breath
 * noise) shaped by resonances — formants, [frequency, Q, level] each. Speech, a laugh, a
 * bark, a horn; and, with a pitch of a few dozen hertz, the stick-slip of a creak.
 * attack / release in seconds; lp: an overall low-pass (heard through a wall or a speaker).
 */
function voiced({ at = 0, dur = 0.2, f0 = 150, f1 = null, formants = [[700, 5, 1]], vol = 0.1, breath = 0, attack = 0.02, release = null, lp = null, type = 'sawtooth' }) {
  const t = ac.currentTime + at;
  const src = ac.createGain();
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(5, f1), t + dur);
  o.connect(src);
  o.start(t);
  o.stop(t + dur + 0.05);
  if (breath) {
    const n = ac.createBufferSource();
    n.buffer = noise;
    const ng = ac.createGain();
    ng.gain.value = breath;
    n.connect(ng).connect(src);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.05);
  }
  const g = ac.createGain();
  formants.forEach(([f, q, level]) => {
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = ac.createGain();
    fg.gain.value = level;
    src.connect(bp).connect(fg).connect(g);
  });
  const rel = Math.min(release ?? dur * 0.4, dur - attack);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - rel));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  let node = g;
  if (lp) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  node.connect(out);
}

/* ============================================================== the office, as it sounds
 * Quiet things heard at a desk, all well under the other effects. office.tick(activity) is
 * called a few times a second while the office is on screen (null anywhere else):
 *   - a faint room tone (the air conditioning) for as long as the office is shown;
 *   - soft key presses while the character types, a sip while it drinks its coffee, the chair
 *     when it stretches, a pen tapping while it thinks;
 *   - and every so often one sound from around the room, never the same twice running:
 *     a mouse, a phone ringing far off, the printer, a stapler, someone walking past,
 *     a message arriving, a drawer.
 */
const R = Math.random;
const AROUND = {
  /** one soft key: a click and the thock under it. big = the space bar / enter */
  key(at = 0, big = false) {
    hiss({ at, dur: 0.016, vol: big ? 0.1 : 0.065, freq: (big ? 1700 : 2600) + R() * 1500, q: 2.4 });
    tone({ type: 'sine', f0: (big ? 150 : 210) + R() * 50, f1: big ? 95 : 150, at, dur: 0.035, vol: big ? 0.07 : 0.036 });
  },
  mouse() {
    hiss({ dur: 0.012, vol: 0.2, freq: 3800, q: 5 });
    hiss({ at: 0.075, dur: 0.01, vol: 0.12, freq: 3200, q: 5 });
    if (R() < 0.4) {
      hiss({ at: 0.32, dur: 0.012, vol: 0.2, freq: 3800, q: 5 });
      hiss({ at: 0.39, dur: 0.01, vol: 0.12, freq: 3200, q: 5 });
    }
  },
  /** a desk phone two rooms away: two rings, muffled */
  phone() {
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 14; i++) tone({ type: 'sine', f0: i % 2 ? 1180 : 960, at: ring * 1.5 + i * 0.045, dur: 0.05, vol: 0.032, lp: 1800, attack: 0.004 });
  },
  /** the printer: rollers, the head stepping across, a sheet dropping out */
  printer() {
    hiss({ swell: 0.3, dur: 2.0, vol: 0.022, freq: 700, f1: 1100, q: 1.1 });
    for (let i = 0; i < 12; i++) hiss({ at: 0.25 + i * 0.13, dur: 0.035, vol: 0.026, freq: 2100 + (i % 2) * 300, q: 3 });
    hiss({ swell: 0.3, at: 2.0, dur: 0.22, vol: 0.03, type: 'highpass', freq: 3200 });
  },
  /** the chair taking the weight */
  chair() {
    tone({ type: 'sawtooth', f0: 150, f1: 100, dur: 0.32, vol: 0.028, lp: 520, attack: 0.03 });
    tone({ type: 'sawtooth', f0: 118, f1: 138, at: 0.4, dur: 0.24, vol: 0.02, lp: 480, attack: 0.03 });
  },
  stapler() {
    tone({ type: 'sine', f0: 170, f1: 70, dur: 0.07, vol: 0.1 });
    hiss({ dur: 0.03, vol: 0.07, freq: 3000, q: 2 });
  },
  pen() {
    [0, 0.14, 0.42, 0.56].forEach((at) => hiss({ at, dur: 0.01, vol: 0.16, freq: 4600, q: 6 }));
  },
  /** a message arriving on somebody's computer */
  ding() {
    tone({ type: 'sine', f0: 1319, dur: 0.4, vol: 0.035 });
    tone({ type: 'sine', f0: 1760, at: 0.11, dur: 0.5, vol: 0.03 });
  },
  /** someone walking past on the carpet */
  steps() {
    for (let i = 0; i < 6; i++) {
      const v = 0.05 * (1 - Math.abs(i - 2.5) / 4);
      tone({ type: 'sine', f0: 95, f1: 55, at: i * 0.52, dur: 0.09, vol: v });
      hiss({ at: i * 0.52, dur: 0.04, vol: v * 0.35, type: 'lowpass', freq: 700, q: 0.7 });
    }
  },
  /** a wooden drawer: sliding on its runners, then knocking shut */
  drawer() {
    hiss({ swell: 0.08, dur: 0.36, vol: 0.05, type: 'lowpass', freq: 520, f1: 380, q: 0.7 });
    tone({ type: 'triangle', f0: 235, f1: 170, at: 0.38, dur: 0.07, vol: 0.1 });
    tone({ type: 'sine', f0: 118, f1: 96, at: 0.38, dur: 0.11, vol: 0.07 });
    tone({ type: 'sine', f0: 540, f1: 400, at: 0.38, dur: 0.035, vol: 0.04 });
  },
  /** a sip, and the mug going back on the desk */
  sip() {
    hiss({ swell: 0.08, dur: 0.45, vol: 0.028, freq: 1700, f1: 3400, q: 2 });
    tone({ type: 'sine', f0: 2300, at: 1.1, dur: 0.12, vol: 0.022 });
    tone({ type: 'sine', f0: 190, f1: 120, at: 1.1, dur: 0.06, vol: 0.05 });
  },
};
/* what may be heard from around the room (not the character's own: keys, sip, chair, pen) */
const ROOM = ['mouse', 'phone', 'printer', 'stapler', 'ding', 'steps', 'drawer', 'mouse'];

const office = {
  SOUNDS: Object.keys(AROUND),
  _hum: null,
  _keysAt: 0, // AudioContext time the typing is scheduled up to
  _nextAt: 0, // ... the next sound from around the room is due
  _last: '',
  _act: null,
  _burst: 0,
  /** play one by name (debug, and the sound test) */
  play(name) {
    if (ready() && AROUND[name]) AROUND[name]();
  },
  _room(on) {
    if (on && !this._hum) {
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.linearRampToValueAtTime(0.035, ac.currentTime + 1.5);
      src.connect(f).connect(g).connect(out);
      src.start();
      this._hum = { src, g };
    } else if (!on && this._hum) {
      const { src, g } = this._hum;
      this._hum = null;
      g.gain.cancelScheduledValues(ac.currentTime);
      g.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      src.stop(ac.currentTime + 1);
    }
  },
  /** activity: what the character is doing at the desk ('type', 'coffee', ...), or null when the office is not shown */
  tick(activity) {
    if (!ac) return;
    const on = !!activity && ready() && !document.hidden;
    this._room(on);
    if (!on) {
      this._act = null;
      this._nextAt = 0;
      return;
    }
    const now = ac.currentTime;
    if (!this._nextAt) this._nextAt = now + 4 + R() * 5;
    // the character's own sounds, once as each activity begins
    if (activity !== this._act) {
      this._act = activity;
      if (activity === 'coffee') setTimeout(() => this.play('sip'), 1200);
      else if (activity === 'stretch') this.play('chair');
      else if (activity === 'think') setTimeout(() => this.play('pen'), 1500);
      else if (activity === 'lunch') setTimeout(() => this.play('drawer'), 600);
    }
    // typing: bursts of a few keys with little pauses, scheduled half a second ahead
    if (activity === 'type') {
      if (this._keysAt < now) this._keysAt = now + 0.05;
      while (this._keysAt < now + 0.5) {
        if (this._burst <= 0) {
          this._burst = 3 + Math.floor(R() * 9);
          this._keysAt += 0.25 + R() * 0.9; // thinking of the next word
        }
        this._burst--;
        AROUND.key(this._keysAt - now, this._burst === 0 && R() < 0.6);
        this._keysAt += 0.09 + R() * 0.11;
      }
    }
    // and now and then, something from around the room
    if (now >= this._nextAt) {
      let name = this._last;
      while (name === this._last) name = ROOM[Math.floor(R() * ROOM.length)];
      this._last = name;
      AROUND[name]();
      this._nextAt = now + 7 + R() * 10;
    }
  },
};

/* ============================================================== home, as it sounds
 * The same idea as the office, for the evening at home. home.tick(activity, { night }) is
 * called a few times a second while the room is on screen (null anywhere else):
 *   - the wall clock ticking, once a second, always (softer than anything else in the room);
 *   - the character's own sounds: chopsticks and a bowl while it eats, taps on the phone,
 *     the cushion when it lies back, slippers while it paces (asleep it makes no sound);
 *   - and every so often one sound of a house, never the same twice running: the fridge
 *     starting up, a tap dripping, the floor creaking, the washing machine finishing, a car
 *     horn in the street, a dog a few doors down — birds by day, crickets after dark.
 */
const INDOORS = {
  /** the wall clock: tick, then tock a little lower */
  clock(at = 0, tock = false) {
    hiss({ at, dur: 0.012, vol: 0.05, freq: tock ? 2100 : 2700, q: 7 });
    tone({ type: 'sine', f0: tock ? 620 : 760, at, dur: 0.02, vol: 0.012 });
  },
  /** chopsticks on a bowl, and a bite */
  eat() {
    tone({ type: 'sine', f0: 2500 + R() * 400, dur: 0.09, vol: 0.035 });
    tone({ type: 'sine', f0: 3300 + R() * 300, at: 0.16, dur: 0.07, vol: 0.025 });
    [0.7, 1.0, 1.3].forEach((at) => hiss({ at, dur: 0.07, vol: 0.05, type: 'lowpass', freq: 650, q: 1 }));
  },
  /** thumbs on a phone screen, and a message buzzing in */
  taps() {
    let at = 0;
    for (let i = 0; i < 5 + Math.floor(R() * 4); i++) {
      hiss({ at, dur: 0.012, vol: 0.09, type: 'lowpass', freq: 1400, q: 1 });
      at += 0.11 + R() * 0.12;
    }
  },
  buzz() {
    [0, 0.34].forEach((at) => tone({ type: 'sawtooth', f0: 160, at, dur: 0.22, vol: 0.05, lp: 420, attack: 0.02 }));
  },
  /** sinking into the cushion: the stuffing giving way, low and soft */
  cushion() {
    hiss({ swell: 0.16, dur: 0.6, vol: 0.07, type: 'lowpass', freq: 360, f1: 230, q: 0.6 });
    tone({ type: 'sine', f0: 92, f1: 62, dur: 0.28, vol: 0.035, attack: 0.07 });
  },
  /** a slipper dragged across the floor: shh */
  slipper(at = 0) {
    hiss({ at, swell: 0.05, dur: 0.17, vol: 0.05, freq: 3000 + R() * 500, f1: 2100, q: 0.8 });
  },

  /* ---- the house and the street */
  /** the fridge's compressor cutting in, humming a while, and off */
  fridge() {
    tone({ type: 'sine', f0: 70, f1: 50, dur: 0.08, vol: 0.12 });
    tone({ type: 'sawtooth', f0: 58, dur: 4.2, vol: 0.05, lp: 220, attack: 0.5 });
    tone({ type: 'sine', f0: 116, dur: 4.2, vol: 0.02, attack: 0.5 });
  },
  drip() {
    [0, 1.3, 2.4].forEach((at) => tone({ type: 'sine', f0: 900, f1: 1700, at, dur: 0.06, vol: 0.06 }));
  },
  /** a floorboard: the wood sticking and slipping, slow, then letting go */
  creak() {
    const wood = [[850, 9, 1], [1750, 11, 0.6], [2900, 9, 0.3]];
    voiced({ dur: 0.5, f0: 20, f1: 52, formants: wood, vol: 0.2, attack: 0.04, release: 0.1 });
    voiced({ at: 0.62, dur: 0.34, f0: 46, f1: 19, formants: wood, vol: 0.16, attack: 0.03, release: 0.12 });
  },
  /** the washing machine: done */
  washer() {
    [988, 1175, 1319, 1175, 1568].forEach((f, i) => tone({ type: 'square', f0: f, at: i * 0.2, dur: 0.16, vol: 0.02, lp: 2400 }));
  },
  /** a car horn out in the street: a tap, then a longer one */
  car() {
    const horn = (at, dur) =>
      [392, 494].forEach((f) => voiced({ at, dur, f0: f, type: 'square', formants: [[900, 2, 1], [1900, 3, 0.5]], vol: 0.03, attack: 0.012, release: 0.06, lp: 2000 }));
    horn(0, 0.15);
    horn(0.3, 0.5);
  },
  /** a dog a few doors down: woof woof — and one more */
  dog() {
    const bark = (at, pitch) => {
      const mouth = [[620, 3, 1], [1250, 4, 0.8], [2500, 5, 0.3]];
      voiced({ at, dur: 0.15, f0: pitch, f1: pitch * 0.55, formants: mouth, vol: 0.1, breath: 0.6, attack: 0.008, release: 0.09, lp: 2800 });
      voiced({ at, dur: 0.13, f0: pitch * 0.5, f1: pitch * 0.3, formants: mouth, vol: 0.05, attack: 0.008, release: 0.08, lp: 2000 }); // the chest under it
    };
    const p = 400 + R() * 90;
    bark(0, p);
    bark(0.3, p * 1.06);
    bark(1.1 + R() * 0.3, p * 0.95);
  },
  /** small birds outside, by day */
  birds() {
    let at = 0;
    for (let i = 0; i < 7; i++) {
      const f = 2600 + R() * 1400;
      tone({ type: 'sine', f0: f, f1: f * (R() < 0.5 ? 1.25 : 0.8), at, dur: 0.07, vol: 0.03 });
      at += i === 3 ? 0.7 : 0.1 + R() * 0.08;
    }
  },
  /** crickets, after dark */
  crickets() {
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) tone({ type: 'sine', f0: 4300, at: k * 0.75 + i * 0.045, dur: 0.03, vol: 0.022, attack: 0.004 });
  },
};
const HOUSE = ['fridge', 'drip', 'creak', 'washer', 'car', 'dog', 'creak'];
const SMALL_HOURS = ['fridge', 'creak', 'drip', 'crickets']; // all there is to hear between midnight and six

const home = {
  SOUNDS: Object.keys(INDOORS),
  _clockAt: 0, // AudioContext time the clock is scheduled up to
  _ticks: 0,
  _selfAt: 0, // ... the character next makes a sound of its own
  _nextAt: 0, // ... the next sound of the house is due
  _last: '',
  _act: null,
  play(name) {
    if (ready() && INDOORS[name]) INDOORS[name]();
  },
  /** activity: what the character is doing ('tv', 'eat', 'sleep', ...), or null when home is not shown. o.night: after dark; o.small: the small hours */
  tick(activity, o) {
    if (!ac) return;
    const on = !!activity && ready() && !document.hidden;
    if (!on) {
      this._act = null;
      this._nextAt = this._clockAt = 0;
      return;
    }
    const now = ac.currentTime;
    const night = !!(o && o.night);
    const asleep = activity === 'sleep';
    // the small hours: the house is asleep, whatever the character is doing — only the clock,
    // and now and then the fridge, a floorboard, the tap or the crickets
    const small = !!(o && o.small);
    if (!this._nextAt) this._nextAt = now + 5 + R() * 6;

    // the clock, a second at a time, scheduled a little ahead
    if (this._clockAt < now) this._clockAt = now + 0.1;
    while (this._clockAt < now + 0.6) {
      INDOORS.clock(this._clockAt - now, this._ticks++ % 2 === 1);
      this._clockAt += 1;
    }

    // the character's own sounds
    if (activity !== this._act) {
      this._act = activity;
      this._selfAt = now + 0.8;
      if (activity === 'relax' && !small) this.play('cushion');
    }
    if (now >= this._selfAt && !small) {
      let wait = 0;
      if (activity === 'eat') {
        INDOORS.eat();
        wait = 2.2 + R() * 2.5;
      } else if (activity === 'phone') {
        INDOORS[R() < 0.2 ? 'buzz' : 'taps']();
        wait = 2.5 + R() * 3.5;
      } else if (activity === 'pace') {
        INDOORS.slipper();
        wait = 0.5 + R() * 0.08;
      }
      this._selfAt = wait ? now + wait : now + 1;
    }

    // and now and then, the house or the street
    if (now >= this._nextAt) {
      const pool = small ? SMALL_HOURS : HOUSE.concat(night ? ['crickets', 'crickets'] : ['birds', 'birds']);
      let name = this._last;
      while (name === this._last) name = pool[Math.floor(R() * pool.length)];
      this._last = name;
      INDOORS[name]();
      this._nextAt = now + (asleep ? 14 : 8) + R() * 11;
    }
  },
};

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
    bgm.refresh();
  },
  /** the background music (js/bgm.js): sfx.bgm.play('workshop' | 'office' | 'subway' | 'home' | 'sleep') */
  bgm,
  setMuted(v) {
    muted = !!v;
    bgm.refresh();
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
  /** the effects' volume, 0..1 (0.7 = as designed); persisted. The music has its own: sfx.bgm.volume */
  get volume() {
    return volume;
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, +v || 0));
    if (out) out.gain.setTargetAtTime(SFX_LEVEL * volumeGain(volume), ac.currentTime, 0.02);
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch (e) {
      /* ignore */
    }
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
  /**
   * Everything a place sounds like, in one call (the app's tick and the studio both use it):
   * its music, and the office or the house around the character. Call it a few times a
   * second. place: 'office' | 'home' | 'ride' | 'workshop' | null (nowhere: silence);
   * activity: what the character is doing there; o.night: after dark; o.asleep: in bed;
   * o.hour: the hour on the clock (0..23) — from midnight to six the house keeps quiet.
   */
  scene(place, activity, o) {
    o = o || {};
    bgm.play(place === 'ride' ? 'subway' : place === 'office' ? 'office' : place === 'home' ? (o.asleep ? 'sleep' : 'home') : place === 'workshop' ? 'workshop' : null);
    office.tick(place === 'office' ? activity || 'idle' : null);
    home.tick(place === 'home' ? activity || 'idle' : null, { night: !!o.night, small: o.hour != null && o.hour < 6 });
  },
  /** the sounds of the office around the desk: sfx.office.tick(activity | null) */
  office,
  /** the sounds of the evening at home: sfx.home.tick(activity | null, { night }) */
  home,
};
