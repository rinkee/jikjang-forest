/*
 * 직장의 숲 · 하루 — sky.js (the sky follows the real clock)
 *
 * sunAt(ms):  where the sun is for that local date and time: elevation in degrees, from a
 *             short solar formula (NOAA), at Seoul's latitude. The longitude comes from the
 *             time zone (Seoul's own in UTC+9), so sunrise and sunset move with the seasons.
 * skyAt(ms):  everything the scenes need, blended smoothly as the sun moves: sky colours,
 *             stars, how many city windows are lit, sun and moon positions, how dark the
 *             room is (lamps), the colour of things outside, and the room lighting.
 * SkyPainter: the views out of the windows (office: city, home: houses and trees,
 *             strip: a long band for train windows, skyline: the far city and river behind
 *             the train, with a see-through sky) repainted from skyAt as time passes.
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;
const LAT = 37.57; // Seoul
const SEOUL_LON = 126.98;
const sstep = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ============================================================== the sun */
export function sunAt(ms) {
  const d = new Date(ms);
  const tz = -d.getTimezoneOffset() / 60;
  const lon = tz === 9 ? SEOUL_LON : tz * 15;
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eq + 4 * lon - 60 * tz; // true solar time, minutes
  const ha = (tst / 4 - 180) * DEG; // hour angle: < 0 before noon
  const lat = LAT * DEG;
  const cosz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elev = 90 - Math.acos(Math.min(1, Math.max(-1, cosz))) / DEG;
  return { elev, ha: ha / DEG };
}

/** sunrise and sunset (ms) on the local day of ms, found by stepping and halving */
export function sunTimes(ms) {
  const d0 = new Date(ms);
  d0.setHours(0, 0, 0, 0);
  const t0 = d0.getTime();
  const above = (t) => sunAt(t).elev > -0.833;
  const out = { rise: null, set: null };
  let prev = above(t0);
  for (let m = 5; m <= 1440; m += 5) {
    const t = t0 + m * 60e3;
    const cur = above(t);
    if (cur !== prev) {
      let lo = t - 5 * 60e3;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (above(mid) === prev) lo = mid;
        else hi = mid;
      }
      out[cur ? 'rise' : 'set'] = Math.round(hi);
    }
    prev = cur;
  }
  return out;
}

/* ============================================================== sky colours */
// elevation, top of the sky, horizon in the evening, horizon in the morning
const SKY_KEYS = [
  [-18, '#0b1029', '#141c3f', '#141c3f'],
  [-10, '#151c44', '#2b3566', '#2b3566'],
  [-5, '#2d3a78', '#b8697a', '#a982ab'],
  [-1, '#4e64a8', '#ee8a5f', '#f0a08c'],
  [3, '#6f93d2', '#ffb36b', '#ffc59a'],
  [10, '#7dbdeb', '#ffe0b4', '#ffeacf'],
  [22, '#66b8ec', '#d8f0fb', '#e3f4fb'],
  [60, '#56aeea', '#cdeefc', '#cdeefc'],
];
const C1 = new THREE.Color();
const C2 = new THREE.Color();
function keyed(keys, e, pick) {
  if (e <= keys[0][0]) return C1.set(pick(keys[0])).clone();
  for (let i = 1; i < keys.length; i++) {
    if (e <= keys[i][0]) {
      const t = (e - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
      return C1.set(pick(keys[i - 1])).lerp(C2.set(pick(keys[i])), t).clone();
    }
  }
  return C1.set(pick(keys[keys.length - 1])).clone();
}

/* things outside: [day, night, warm tint near the horizon] */
const OUTSIDE = {
  hill: ['#9cc7d4', '#2c355e', '#8b6f99'],
  trees: ['#78b487', '#1f2747', '#6b5a7e'],
  building: ['#efe2cc', '#2a3157', '#c99a96'],
  roof: ['#d98c6a', '#33284a', '#b0687a'],
  water: ['#5fb0d0', '#1b2244', '#a0719a'],
};

/* ============================================================== room lighting */
// night: the lamps are on; day: daylight through the windows. Golden has an evening and a morning version.
const LIGHTS = {
  night: { hemi: ['#c4ccf2', '#8a7f90', 0.42], key: ['#ffd7a4', 1.55], fill: 0.22, rim: 0.9, env: 0.36 },
  twilight: { hemi: ['#d6cdee', '#9d8b96', 0.48], key: ['#ffcf9e', 1.65], fill: 0.26, rim: 1.1, env: 0.42 },
  dusk: { hemi: ['#ffdcc2', '#b89a90', 0.56], key: ['#ffc28e', 1.85], fill: 0.3, rim: 1.4, env: 0.48 },
  dawn: { hemi: ['#fff2e2', '#cdbda6', 0.66], key: ['#ffe6c8', 2.0], fill: 0.36, rim: 1.2, env: 0.52 },
  day: { hemi: ['#fff4e6', '#c9b8a0', 0.66], key: ['#fff0dc', 2.2], fill: 0.35, rim: 1.3, env: 0.55 },
};
function mixLight(a, b, t) {
  return {
    hemi: [C1.set(a.hemi[0]).lerp(C2.set(b.hemi[0]), t).getHex(), C1.set(a.hemi[1]).lerp(C2.set(b.hemi[1]), t).getHex(), lerp(a.hemi[2], b.hemi[2], t)],
    key: [C1.set(a.key[0]).lerp(C2.set(b.key[0]), t).getHex(), lerp(a.key[1], b.key[1], t)],
    fill: lerp(a.fill, b.fill, t),
    rim: lerp(a.rim, b.rim, t),
    env: lerp(a.env, b.env, t),
  };
}
function lightFor(e, morning) {
  const golden = morning ? LIGHTS.dawn : LIGHTS.dusk;
  if (e <= -9) return mixLight(LIGHTS.night, LIGHTS.night, 0);
  if (e <= -2) return mixLight(LIGHTS.night, LIGHTS.twilight, (e + 9) / 7);
  if (e <= 5) return mixLight(LIGHTS.twilight, golden, (e + 2) / 7);
  if (e <= 18) return mixLight(golden, LIGHTS.day, (e - 5) / 13);
  return mixLight(LIGHTS.day, LIGHTS.day, 0);
}

/* ============================================================== the whole sky state */
export function skyAt(ms) {
  const { elev: e, ha } = sunAt(ms);
  const morning = ha < 0;
  const top = keyed(SKY_KEYS, e, (k) => k[1]);
  const horizon = keyed(SKY_KEYS, e, (k) => (morning ? k[3] : k[2]));
  const night = sstep((6 - e) / 16); // 0 in daylight .. 1 deep night
  const warm = Math.exp(-Math.pow(e / 7, 2)) * 0.75; // sunrise / sunset glow
  const outside = {};
  Object.entries(OUTSIDE).forEach(([k, [day, dark, tint]]) => {
    outside[k] = C1.set(day).lerp(C2.set(dark), night).lerp(C2.set(tint), warm * (1 - night * 0.6)).getStyle();
  });
  const hour = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
  const s = {
    ms,
    elev: e,
    morning,
    top: top.getStyle(),
    horizon: horizon.getStyle(),
    mid: top.clone().lerp(horizon, 0.55).getStyle(),
    stars: sstep((-4 - e) / 8),
    lights: sstep((4 - e) / 12), // share of city windows lit
    dark: sstep((6 - e) / 14), // how much the lamps are needed indoors
    warm,
    night,
    // sun across the window: rises on the left, sets on the right
    sun: { vis: sstep((e + 3) / 3), x: 0.5 + Math.max(-0.48, Math.min(0.48, ha / 200)), alt: Math.max(-0.1, e / 50), low: 1 - sstep(e / 25) },
    moon: { vis: sstep((-2 - e) / 6), x: 0.2 + (((hour + 6) % 24) / 24) * 0.6, alt: 0.25 + 0.35 * Math.sin(((hour - 18) / 12) * Math.PI) },
    outside,
    light: lightFor(e, morning),
    // sunlight on the floor (stronger when the sun is low and shining in)
    patch: { amount: sstep(e / 3) * (0.45 + 0.3 * (1 - sstep((e - 8) / 30))), side: Math.max(-1, Math.min(1, ha / 90)), color: C1.set('#ffe7b0').lerp(C2.set('#ff9f5a'), 1 - sstep(e / 20)).getStyle() },
  };
  // the word for it, for routines and tests
  s.mood = e < -6 ? 'night' : e < 10 ? (morning ? 'morning' : 'dusk') : morning && hour < 10 ? 'morning' : 'day';
  return s;
}

/* ============================================================== painting the views */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the fixed parts of a view: where buildings, windows, trees, stars and clouds are */
function layout(kind, w, h) {
  const R = rng({ office: 7, home: 19, strip: 31, skyline: 43 }[kind]);
  const long = kind === 'strip' || kind === 'skyline';
  const base = long ? h * 0.86 : h;
  const L = { base, hills: [], buildings: [], trees: [], stars: [], clouds: [], houses: [] };
  for (let i = 0; i < (long ? 160 : 70); i++) L.stars.push([R() * w, R() * base * 0.6, R() < 0.15 ? 2.4 : 1.4, 0.4 + R() * 0.6]);
  for (let i = 0; i < (long ? 14 : 5); i++) L.clouds.push({ x: R() * w, y: h * (0.08 + R() * 0.28), s: h * (0.045 + R() * 0.05), v: 4 + R() * 6 });
  if (kind === 'home') {
    // a few houses with pitched roofs between the trees
    let x = 10;
    while (x < w) {
      const bw = w * (0.12 + R() * 0.08);
      const bh = h * (0.14 + R() * 0.1);
      L.houses.push({ x, bw, bh, win: [R(), R()] });
      x += bw + w * (0.08 + R() * 0.1);
    }
  } else {
    let x = -10;
    while (x < w) {
      const bw = w * (long ? 0.02 + R() * 0.025 : 0.05 + R() * 0.06);
      const bh = h * (0.16 + R() * 0.28);
      const cols = Math.max(1, Math.floor(bw / 14));
      const rows = Math.max(1, Math.floor(bh / 16));
      const wins = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows - 1; j++) wins.push([i, j, R()]);
      L.buildings.push({ x, bw, bh, cols, wins });
      x += bw + w * (long ? 0.002 + R() * 0.012 : 0.005 + R() * 0.03);
    }
  }
  for (let tx = 0; tx < w + 40; tx += w * (long ? 0.012 + R() * 0.016 : 0.03 + R() * 0.04)) L.trees.push([tx, h * (0.06 + R() * 0.07)]);
  for (let i = 0; i < 40; i++) L.hills.push(R());
  return L;
}

function paintView(view, s, t) {
  const { g, w, h, L, kind } = view;
  const base = L.base;
  // sky (the skyline is drawn over a separate sky, so its own stays clear)
  const clear = kind === 'skyline';
  if (clear) g.clearRect(0, 0, w, h);
  else {
    const grd = g.createLinearGradient(0, 0, 0, base);
    grd.addColorStop(0, s.top);
    grd.addColorStop(0.55, s.mid);
    grd.addColorStop(1, s.horizon);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  // stars
  if (s.stars > 0.01) {
    L.stars.forEach(([x, y, size, a]) => {
      g.fillStyle = `rgba(255,250,220,${(a * s.stars).toFixed(3)})`;
      g.fillRect(x, y, size, size);
    });
  }
  // the sun (a soft glow around a disc) and the moon (a crescent)
  const sunR = h * 0.075;
  if (s.sun.vis > 0.01) {
    const sx = s.sun.x * w;
    const sy = base - s.sun.alt * base * 1.3;
    const col = s.sun.low > 0.5 ? '255,190,120' : '255,246,216';
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, sunR * 3.2);
    glow.addColorStop(0, `rgba(${col},${(0.55 * s.sun.vis).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = glow;
    g.fillRect(sx - sunR * 3.2, sy - sunR * 3.2, sunR * 6.4, sunR * 6.4);
    g.fillStyle = `rgba(${col},${s.sun.vis.toFixed(3)})`;
    g.beginPath();
    g.arc(sx, sy, sunR, 0, Math.PI * 2);
    g.fill();
  }
  if (s.moon.vis > 0.01) {
    const mx = s.moon.x * w;
    const my = base * (1 - s.moon.alt);
    const r = h * 0.06;
    g.fillStyle = `rgba(255,246,207,${s.moon.vis.toFixed(3)})`;
    g.beginPath();
    g.arc(mx, my, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = s.top;
    g.globalAlpha = s.moon.vis;
    if (clear) g.globalCompositeOperation = 'destination-out'; // cut the crescent out of a clear sky
    g.beginPath();
    g.arc(mx + r * 0.42, my - r * 0.28, r * 0.88, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  // clouds drift; lit warm at sunrise and sunset, grey-blue at night
  const cl = new THREE.Color('#ffffff').lerp(new THREE.Color(s.horizon), Math.min(0.85, s.warm * 1.1)).lerp(new THREE.Color('#3a4677'), s.night * 0.8);
  g.fillStyle = `rgba(${Math.round(cl.r * 255)},${Math.round(cl.g * 255)},${Math.round(cl.b * 255)},${(0.92 - s.night * 0.55).toFixed(3)})`;
  L.clouds.forEach((c) => {
    const x = ((((c.x + t * c.v) % (w + 160)) + w + 160) % (w + 160)) - 80;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + (k - 1.5) * c.s * 0.9, c.y + (k % 2 ? -c.s * 0.35 : 0), c.s * (k % 2 ? 0.95 : 0.75), 0, Math.PI * 2);
      g.fill();
    }
  });
  const O = s.outside;
  // far hills
  g.fillStyle = O.hill;
  g.beginPath();
  g.moveTo(0, base);
  for (let x = 0; x <= w; x += w / (kind === 'strip' || kind === 'skyline' ? 48 : 16)) g.lineTo(x, base - h * (0.28 + 0.08 * Math.sin(x * 0.013 + 1) + 0.05 * Math.sin(x * 0.041)));
  g.lineTo(w, base);
  g.fill();
  // buildings, their windows lighting up one by one as it gets dark
  const litC = '#ffd98a';
  const dayGlass = `rgba(120,170,200,${(0.45 * (1 - s.night)).toFixed(3)})`;
  const darkGlass = `rgba(0,0,0,${(0.12 + 0.1 * s.night).toFixed(3)})`;
  L.buildings.forEach((b) => {
    g.fillStyle = O.building;
    const r = Math.min(b.bw, 12) * 0.4;
    g.beginPath();
    g.roundRect(b.x, base - b.bh, b.bw, b.bh + 4, [r, r, 0, 0]);
    g.fill();
    b.wins.forEach(([i, j, k]) => {
      const lit = k < s.lights * 0.8;
      g.fillStyle = lit ? litC : s.night > 0.5 ? darkGlass : dayGlass;
      g.fillRect(b.x + 5 + i * ((b.bw - 8) / b.cols), base - b.bh + 8 + j * 16, Math.max(3, (b.bw - 8) / b.cols - 5), 8);
    });
  });
  L.houses.forEach((hs) => {
    const y0 = base - hs.bh;
    g.fillStyle = O.building;
    g.fillRect(hs.x, y0, hs.bw, hs.bh + 4);
    g.fillStyle = O.roof;
    g.beginPath();
    g.moveTo(hs.x - 8, y0 + 2);
    g.lineTo(hs.x + hs.bw / 2, y0 - hs.bh * 0.55);
    g.lineTo(hs.x + hs.bw + 8, y0 + 2);
    g.fill();
    hs.win.forEach((k, i) => {
      g.fillStyle = k < s.lights * 0.9 ? litC : s.night > 0.5 ? darkGlass : dayGlass;
      g.fillRect(hs.x + hs.bw * (0.18 + i * 0.44), y0 + hs.bh * 0.25, hs.bw * 0.2, hs.bh * 0.28);
    });
  });
  // round trees in front
  g.fillStyle = O.trees;
  L.trees.forEach(([x, r]) => {
    g.beginPath();
    g.arc(x, base - r * 0.6, r, 0, Math.PI * 2);
    g.fill();
  });
  g.fillRect(0, base - h * 0.04, w, h * 0.04 + 2);
  if (kind === 'strip') {
    // the river below the skyline, and bridge posts flicking past
    g.fillStyle = O.water;
    g.fillRect(0, base, w, h - base);
    g.fillStyle = `rgba(255,255,255,${(0.35 - s.night * 0.2).toFixed(3)})`;
    for (let i = 0; i < 40; i++) g.fillRect((i * 211) % w, base + ((i * 37) % (h - base - 6)) + 3, 18 + (i % 4) * 8, 2);
    g.fillStyle = 'rgba(60,60,70,0.55)';
    for (let x = 0; x < w; x += 256) g.fillRect(x, 0, 10, h);
  } else if (kind === 'skyline') {
    // the river this side of the far bank
    g.fillStyle = O.water;
    g.fillRect(0, base, w, h - base);
    g.fillStyle = `rgba(255,255,255,${(0.3 - s.night * 0.18).toFixed(3)})`;
    for (let i = 0; i < 40; i++) g.fillRect((i * 211) % w, base + ((i * 37) % (h - base - 6)) + 3, 18 + (i % 4) * 8, 2);
  }
}

export class SkyPainter {
  constructor() {
    this.views = {};
    this._key = null;
  }

  /** the texture for 'office' | 'home' | 'strip' | 'skyline' (made once, repainted in place) */
  texture(kind) {
    if (this.views[kind]) return this.views[kind].tex;
    const long = kind === 'strip' || kind === 'skyline';
    const [w, h] = long ? [2048, 320] : [512, 384];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (long) {
      tex.wrapS = THREE.RepeatWrapping;
      if (kind === 'strip') tex.repeat.set(1.3, 1);
    }
    const view = { kind, w, h, g: c.getContext('2d'), tex, L: layout(kind, w, h), drawn: -1, key: null };
    this.views[kind] = view;
    if (this.sky) this._paint(view, this.sky, this.t || 0);
    return tex;
  }

  /** repaint what changed: a new sky, or (for the windows) clouds that have drifted */
  paint(sky, t) {
    this.sky = sky;
    this.t = t;
    const key = `${sky.elev.toFixed(1)}|${sky.morning}`;
    Object.values(this.views).forEach((v) => {
      const stale = v.key !== key;
      const drift = v.kind !== 'strip' && v.kind !== 'skyline' && t - v.drawn > 1.5; // the long ones scroll instead
      if (stale || drift) this._paint(v, sky, t, key);
    });
  }

  _paint(v, sky, t, key) {
    paintView(v, sky, t);
    v.tex.needsUpdate = true;
    v.drawn = t;
    v.key = key || `${sky.elev.toFixed(1)}|${sky.morning}`;
  }
}
