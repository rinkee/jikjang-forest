/*
 * 직장의 숲 — bgm.js: quiet background music, made up as it goes (WebAudio only, no files).
 *
 * One easy tune in several colours, a "mood" for each place:
 *   workshop  the character workshop — bright and a little bouncy
 *   office    at the desk — sunny and light: plain major chords, plucked, hardly any pad
 *   subway    the ride — dreamy, rocking gently, over the train itself: a low rumble and
 *             the wheels going da-dum, da-dum over the rail joints, in time with the music
 *   home      the evening at home — slow and warm
 *   sleep     in bed — hardly there: a pad and a note now and then
 * Most moods are the same four chords (I · vi · IV · V) in their own key and tempo: a soft pad,
 * a round bass, an electric-piano figure and a sparse pentatonic tune over them. The tune is
 * written a four-bar phrase at a time (a two-bar idea, said again, then brought home), so it
 * sounds like a melody rather than a shuffle of notes. A change of mood cross-fades at once.
 *
 * bgm.play(mood) says what should be playing; nothing sounds until the page has had a user
 * gesture (sfx.unlock()), while the sound is muted, or while the page is hidden. The music
 * has its own on/off (bgm.setEnabled, persisted) on top of the sound mute.
 */
const KEY = 'ccws-bgm';
const VOL_KEY = 'ccws-vol-bgm';
/* The volume sliders go 0..1 and start at DEFAULT_VOLUME, which plays at the level the sound
 * was designed for; the gain follows the square of the setting (a slider that feels even),
 * so the top of the slider is about twice as loud as the default. Shared with sfx.js. */
export const DEFAULT_VOLUME = 0.7;
export const volumeGain = (v) => Math.pow(Math.max(0, Math.min(1, v)) / DEFAULT_VOLUME, 2);
export function storedVolume(key) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
  } catch (e) {
    return DEFAULT_VOLUME;
  }
}

/* chords as semitones above the key note: Imaj7 · vi7 · IVmaj7 · V6 */
const CHORDS = [
  [0, 4, 7, 11],
  [9, 12, 16, 19],
  [5, 9, 12, 16],
  [7, 11, 14, 16],
];
/* the office keeps to major chords with no sevenths (I · IV · I · V): low, slow sevenths under a
 * minor chord are what made it sound eerie */
const SUNNY = [
  [0, 4, 7, 12],
  [5, 9, 12, 17],
  [0, 4, 7, 14],
  [7, 11, 14, 19],
];
const PENTA = [0, 2, 4, 7, 9]; // the tune stays on the major pentatonic: no note can sound wrong
/* key: MIDI note of the key note (C4 = 60). swing: how late the off-beats come (0 = straight).
 * tune: chance of a melody note on each half-beat. comp: the piano figure. shaker: a soft tick.
 * chords: the four bars (default CHORDS). pad: how much pad (1 = full) and padUp: an octave
 * higher. top: the highest rung the tune climbs to. train: the train under the music. */
const MOODS = {
  workshop: { bpm: 84, key: 60, swing: 0.1, tune: 0.5, comp: 'arp', shaker: 0.5, tone: 2600, vol: 1 },
  office: { bpm: 92, key: 67, swing: 0.16, tune: 0.42, comp: 'pluck', shaker: 0.6, tone: 3200, vol: 0.9, chords: SUNNY, pad: 0.35, padUp: true, top: 8 },
  subway: { bpm: 72, key: 62, swing: 0.14, tune: 0.34, comp: 'rock', shaker: 0, tone: 2000, vol: 0.9, train: 1 },
  home: { bpm: 66, key: 63, swing: 0.12, tune: 0.3, comp: 'slow', shaker: 0, tone: 1900, vol: 0.85 },
  sleep: { bpm: 54, key: 63, swing: 0, tune: 0.1, comp: 'none', shaker: 0, tone: 1100, vol: 0.55 },
};
const LEVEL = 0.75; // at the default volume: clearly there, still under the sound effects

let ac = null;
let bus = null; // everything the music plays goes through here
let take = null; // ... by way of this: the notes of the mood playing now (faded out as one when it changes)
let tone = null; // one low-pass over the lot: the "warmth"
let noise = null;
let allowed = () => true; // false while the sound is muted (set by sfx)
let volume = storedVolume(VOL_KEY);
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== '0';
} catch (e) {
  /* storage blocked: music on */
}

let want = null; // the mood asked for
let mood = null; // the mood playing
let timer = 0;
let nextBar = 0; // AudioContext time the next bar starts at
let bar = 0;
let phrase = null; // the tune for the four bars being played
let seed = 1;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** a note: kind 'pad' | 'bass' | 'keys' | 'lead' */
function note(kind, midi, at, dur, vol) {
  const f = hz(midi);
  const g = ac.createGain();
  g.connect(take);
  const osc = (type, freq, level, detune = 0) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const og = ac.createGain();
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + dur + 1.2);
  };
  const env = g.gain;
  env.setValueAtTime(0.0001, at);
  if (kind === 'pad') {
    // slow to come and slow to go
    osc('triangle', f, 0.5, -3);
    osc('sine', f, 0.5, 3);
    env.linearRampToValueAtTime(vol, at + Math.min(0.9, dur * 0.4));
    env.setValueAtTime(vol, at + dur * 0.75);
    env.linearRampToValueAtTime(0.0001, at + dur + 1.0);
  } else if (kind === 'bass') {
    osc('sine', f, 1);
    osc('triangle', f, 0.18);
    env.linearRampToValueAtTime(vol, at + 0.03);
    env.exponentialRampToValueAtTime(vol * 0.5, at + dur * 0.6);
    env.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
  } else {
    // an electric piano: a round note with a little bell on top that dies away first
    osc('sine', f, 1);
    osc('sine', f * 2, kind === 'lead' ? 0.22 : 0.12);
    osc('triangle', f, 0.12, kind === 'lead' ? 4 : 0);
    env.linearRampToValueAtTime(vol, at + 0.012);
    env.exponentialRampToValueAtTime(vol * 0.35, at + Math.min(0.35, dur * 0.5));
    env.exponentialRampToValueAtTime(0.0001, at + dur + 0.5);
  }
}

/** a soft shaker tick */
function tick(at, vol) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(f).connect(g).connect(take);
  src.start(at, rnd() * 0.5);
  src.stop(at + 0.08);
}

/**
 * The train, for one bar: a low rumble that swells and settles as the car sways, and the
 * wheels crossing a rail joint twice a bar — da-dum (one axle, then the next), on the beat.
 */
function train(at, beat, vol) {
  const len = beat * 4;
  // rumble: noise with everything but the bottom taken off, rocking once a bar
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const low = ac.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(150, at);
  low.frequency.linearRampToValueAtTime(230, at + len * 0.5);
  low.frequency.linearRampToValueAtTime(150, at + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.5 * vol, at + 0.25);
  g.gain.linearRampToValueAtTime(0.7 * vol, at + len * 0.5);
  g.gain.linearRampToValueAtTime(0.5 * vol, at + len - 0.05);
  g.gain.linearRampToValueAtTime(0.0001, at + len + 0.3); // overlaps the next bar's fade-in
  src.connect(low).connect(g).connect(take);
  src.start(at, rnd() * 0.5);
  src.stop(at + len + 0.35);
  // a wheel on a rail joint: a dull knock with a bit of metal in it
  const knock = (t, v) => {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(og).connect(take);
    o.start(t);
    o.stop(t + 0.2);
    const n = ac.createBufferSource();
    n.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.4;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(bp).connect(ng).connect(take);
    n.start(t, rnd() * 0.5);
    n.stop(t + 0.1);
  };
  [0, 2].forEach((b) => {
    const t = at + b * beat;
    knock(t, vol);
    knock(t + beat * 0.22, vol * 0.8);
    // the other end of the car, further off
    knock(t + beat, vol * 0.4);
    knock(t + beat * 1.22, vol * 0.32);
  });
}

/**
 * The tune for four bars: for each bar, a list of [half-beat 0..7, scale step, length in
 * half-beats]. Bars 1-2 are the idea; bar 3 says bar 1 again; bar 4 comes home on a long note.
 */
function writePhrase(m) {
  let step = 5 + Math.floor(rnd() * 3); // where on the two-octave pentatonic ladder the tune is
  const idea = () => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const strong = i % 2 === 0;
      if (rnd() > m.tune * (strong ? 1.25 : 0.7)) continue;
      step = Math.max(2, Math.min(m.top || 11, step + Math.round((rnd() - 0.5) * 4)));
      const len = rnd() < 0.3 ? 3 : rnd() < 0.5 ? 2 : 1;
      out.push([i, step, len]);
      if (len > 1) i += len - 1;
    }
    return out;
  };
  const a = idea();
  const b = idea();
  const home = [[0, [5, 7, 9][Math.floor(rnd() * 3)], 6]]; // the key note, its third or its fifth, held
  return [a, b, a, rnd() < 0.5 ? home : b.slice(0, 2).concat([[4, 7, 4]])];
}
const ladder = (step) => PENTA[step % 5] + 12 * Math.floor(step / 5);

function playBar(m, at) {
  const beat = 60 / m.bpm;
  const half = beat / 2;
  const when = (i) => at + i * half + (i % 2 ? half * m.swing : 0);
  const n = bar % 4;
  if (n === 0) phrase = writePhrase(m);
  const chord = (m.chords || CHORDS)[n];
  const root = m.key + chord[0];
  const len = beat * 4;
  const v = m.vol;

  // pad: the chord, low, for the whole bar
  const padVol = 0.055 * v * (m.pad ?? 1);
  chord.forEach((s, i) => note('pad', m.key - (m.padUp ? 0 : 12) + s, at, len, padVol * (i === 0 ? 1.2 : 1)));
  // bass: the root, then a lighter fifth half-way (not at bedtime)
  note('bass', root - 24, at, beat * 1.8, 0.2 * v);
  if (m.comp !== 'none') note('bass', root - 24 + 7, when(4), beat * 1.4, 0.12 * v);

  // the piano figure
  if (m.comp === 'arp') {
    [0, 2, 3, 5, 6].forEach((i, k) => note('keys', m.key + chord[[0, 1, 2, 3, 1][k]], when(i), half * 1.6, 0.075 * v));
  } else if (m.comp === 'rock') {
    // two notes rocking back and forth, like the train
    for (let i = 0; i < 8; i += 2) note('keys', m.key + chord[i % 4 ? 2 : 0], when(i), beat * 0.9, 0.07 * v);
    note('keys', m.key + chord[3], when(3), half * 1.5, 0.05 * v);
  } else if (m.comp === 'pluck') {
    // short, bright notes skipping up and down the chord
    [0, 1, 3, 4, 6, 7].forEach((i, k) => note('keys', m.key + chord[[0, 2, 1, 3, 2, 1][k]] + (k === 2 || k === 5 ? 12 : 0), when(i), half * 0.9, 0.08 * v));
  } else if (m.comp === 'slow') {
    [0, 3, 6].forEach((i, k) => note('keys', m.key + chord[[0, 2, 1][k]], when(i), beat * 1.3, 0.07 * v));
  }

  // the tune, about an octave above the chords
  phrase[n].forEach(([i, step, l]) => note('lead', m.key + ladder(step), when(i), half * l * 0.95, 0.11 * v));

  if (m.shaker) for (let i = 0; i < 8; i++) tick(when(i), (i % 2 ? 0.02 : 0.012) * m.shaker);
  if (m.train) train(at, beat, m.train);
  bar++;
}

/** a fresh take for the mood starting now; the old one (notes already scheduled) fades away */
function newTake(at) {
  const old = take;
  if (old) {
    old.gain.cancelScheduledValues(at);
    old.gain.setTargetAtTime(0, at, 0.12);
    setTimeout(() => old.disconnect(), 1500);
  }
  take = ac.createGain();
  take.gain.setValueAtTime(0.0001, at);
  take.gain.linearRampToValueAtTime(1, at + 0.25);
  take.connect(bus);
}

function audible() {
  return enabled && volume > 0 && want && allowed() && ac && ac.state === 'running' && !document.hidden;
}

/** keep the next bar or two scheduled (called a few times a second) */
function pump() {
  if (!ac || !bus) return;
  if (!audible()) {
    if (mood) {
      // fade out and forget where we were: the next start begins a fresh phrase
      bus.gain.cancelScheduledValues(ac.currentTime);
      bus.gain.setTargetAtTime(0, ac.currentTime, 0.25);
      mood = null;
    }
    return;
  }
  const now = ac.currentTime;
  if (!mood || nextBar < now - 0.5) {
    // starting, or back after a pause
    mood = want;
    bar = 0;
    nextBar = now + 0.15;
    seed = (Date.now() & 0xffff) | 1;
    newTake(now);
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(LEVEL * volumeGain(volume), now, 0.6);
    tone.frequency.setTargetAtTime(MOODS[mood].tone, now, 0.5);
  } else if (want !== mood) {
    // the place changed: the old mood fades out now and the new one starts at once, at the
    // top of a phrase (the ride on the subway lasts a few seconds: it cannot wait for a bar)
    mood = want;
    bar = 0;
    nextBar = now + 0.12;
    newTake(now);
    tone.frequency.setTargetAtTime(MOODS[mood].tone, now, 0.3);
  }
  while (nextBar < now + 0.6) {
    const m = MOODS[mood];
    playBar(m, nextBar);
    nextBar += (60 / m.bpm) * 4;
  }
}

export const bgm = {
  MOODS: Object.keys(MOODS),
  /** called by sfx once the AudioContext exists: where the music goes, and when it may sound */
  attach(context, destination, noiseBuffer, isAllowed) {
    if (ac) return;
    ac = context;
    noise = noiseBuffer;
    allowed = isAllowed || allowed;
    bus = ac.createGain();
    bus.gain.value = 0;
    tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    tone.Q.value = 0.3;
    // a little echo for room
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.36;
    const back = ac.createGain();
    back.gain.value = 0.28;
    const wet = ac.createGain();
    wet.gain.value = 0.22;
    bus.connect(tone);
    tone.connect(destination);
    tone.connect(delay);
    delay.connect(back).connect(delay);
    delay.connect(wet).connect(destination);
    clearInterval(timer);
    timer = setInterval(pump, 120);
    document.addEventListener('visibilitychange', pump);
    pump();
  },
  /** what should be playing: 'workshop' | 'office' | 'subway' | 'home' | 'sleep', or null for nothing */
  play(name) {
    want = MOODS[name] ? name : null;
    pump();
  },
  stop() {
    want = null;
    pump();
  },
  /** 0..1 (DEFAULT_VOLUME = as designed, 0 = no music); persisted */
  get volume() {
    return volume;
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, +v || 0));
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch (e) {
      /* ignore */
    }
    if (mood && ac && volume > 0) {
      bus.gain.cancelScheduledValues(ac.currentTime);
      bus.gain.setTargetAtTime(LEVEL * volumeGain(volume), ac.currentTime, 0.08);
    }
    pump();
  },
  get enabled() {
    return enabled;
  },
  setEnabled(v) {
    enabled = !!v;
    try {
      localStorage.setItem(KEY, enabled ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
    pump();
  },
  /** re-check right away (after a mute change or an unlock) */
  refresh: pump,
  /** what is sounding now (debug) */
  get playing() {
    return mood;
  },
};
