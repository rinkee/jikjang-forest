/*
 * 직장의 숲 · 하루 — kit.js (shared building blocks for the day scenes)
 * Materials, rounded boxes, painted canvas textures (sky, screens, signs) and the acorn.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE };
export const FONT = 'Jua, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const matCache = new Map();
/** soft matte material, cached by colour + options */
export function mat(color, o) {
  const key = color + JSON.stringify(o || {});
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0 }, o));
  matCache.set(key, m);
  return m;
}

export function shade(obj, cast = true, receive = true) {
  obj.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return obj;
}

/** rounded box centred at (x, y, z) */
export function box(w, h, d, material, x = 0, y = 0, z = 0, r = 0.06) {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, rr)), material);
  m.position.set(x, y, z);
  return shade(m);
}

export function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y, z);
  return shade(m);
}

export function ball(r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return shade(m);
}

/** flat plane facing +Z */
export function plane(w, h, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export function group(...kids) {
  const g = new THREE.Group();
  kids.forEach((k) => k && g.add(k));
  return g;
}

/* ============================================================== canvas textures */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}
export { canvasTex };

/** deterministic random for painted textures */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SKY = {
  morning: ['#9fd3f2', '#d9effa', '#fff3d6'],
  day: ['#6fc0ee', '#a8dbf6', '#e4f5fc'],
  dusk: ['#5b5aa8', '#e98a7a', '#ffc98a'],
  night: ['#141a3a', '#23305e', '#3a4677'],
};

function paintSky(g, w, h, mood, R) {
  const [a, b, c] = SKY[mood] || SKY.day;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, a);
  grd.addColorStop(0.6, b);
  grd.addColorStop(1, c);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  if (mood === 'night') {
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,250,220,${0.4 + R() * 0.6})`;
      const s = R() < 0.15 ? 2.4 : 1.4;
      g.fillRect(R() * w, R() * h * 0.6, s, s);
    }
  } else {
    // puffy clouds
    const cl = mood === 'dusk' ? 'rgba(255,214,190,0.8)' : 'rgba(255,255,255,0.9)';
    g.fillStyle = cl;
    for (let i = 0; i < 5; i++) {
      const x = R() * w;
      const y = h * (0.12 + R() * 0.3);
      const s = h * (0.05 + R() * 0.05);
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(x + (k - 1.5) * s * 0.9, y + (k % 2 ? -s * 0.35 : 0), s * (k % 2 ? 0.95 : 0.75), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

/** low city + forest skyline along the bottom of a canvas */
function paintSkyline(g, w, h, mood, R, o) {
  o = o || {};
  const lit = mood === 'night' || mood === 'dusk';
  const far = { morning: '#b7d6e0', day: '#9cc7d4', dusk: '#8b6f99', night: '#2c355e' }[mood];
  const near = { morning: '#8fbf9a', day: '#78b487', dusk: '#6b5a7e', night: '#1f2747' }[mood];
  const bld = { morning: '#e9dcc8', day: '#efe2cc', dusk: '#a98c99', night: '#2a3157' }[mood];
  const base = h * (o.base ?? 1);
  // far hills
  g.fillStyle = far;
  g.beginPath();
  g.moveTo(0, base);
  for (let x = 0; x <= w; x += w / 16) g.lineTo(x, base - h * (0.28 + 0.08 * Math.sin(x * 0.013 + 1) + 0.05 * Math.sin(x * 0.041)));
  g.lineTo(w, base);
  g.fill();
  // buildings
  let x = -10;
  while (x < w) {
    const bw = w * (0.05 + R() * 0.06);
    const bh = h * (0.16 + R() * 0.28);
    g.fillStyle = bld;
    const r = Math.min(bw, 12) * 0.4;
    g.beginPath();
    g.roundRect(x, base - bh, bw, bh + 4, [r, r, 0, 0]);
    g.fill();
    // windows
    const cols = Math.max(1, Math.floor(bw / 14));
    const rows = Math.max(1, Math.floor(bh / 16));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const on = lit ? R() < 0.55 : R() < 0.9;
        g.fillStyle = lit ? (on ? '#ffd98a' : 'rgba(0,0,0,0.18)') : on ? 'rgba(120,170,200,0.45)' : 'rgba(255,255,255,0.4)';
        g.fillRect(x + 5 + i * ((bw - 8) / cols), base - bh + 8 + j * 16, Math.max(3, (bw - 8) / cols - 5), 8);
      }
    }
    x += bw + w * (0.005 + R() * 0.03);
  }
  // round trees in front
  g.fillStyle = near;
  for (let tx = 0; tx < w + 40; tx += w * (0.03 + R() * 0.04)) {
    const r = h * (0.06 + R() * 0.07);
    g.beginPath();
    g.arc(tx, base - r * 0.6, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(0, base - h * 0.04, w, h * 0.04 + 2);
}

const skyCache = new Map();
/** the view out of a window: 'office' (city) | 'home' (trees + houses) */
export function windowTex(kind, mood) {
  const key = kind + ':' + mood;
  if (skyCache.has(key)) return skyCache.get(key);
  const t = canvasTex(512, 384, (g, w, h) => {
    const R = rng(kind === 'office' ? 7 : 19);
    paintSky(g, w, h, mood, R);
    if (mood === 'night') {
      g.fillStyle = '#fff6cf';
      g.beginPath();
      g.arc(w * 0.78, h * 0.2, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = SKY.night[0];
      g.beginPath();
      g.arc(w * 0.78 + 9, h * 0.2 - 6, 19, 0, Math.PI * 2);
      g.fill();
    } else if (mood === 'dusk') {
      g.fillStyle = 'rgba(255,190,120,0.95)';
      g.beginPath();
      g.arc(w * 0.3, h * 0.66, 34, 0, Math.PI * 2);
      g.fill();
    }
    paintSkyline(g, w, h, mood, R, { base: 1 });
  });
  skyCache.set(key, t);
  return t;
}

/** a long strip for the subway windows; scrolled with texture.offset.x */
export function scrollTex(mood) {
  const key = 'strip:' + mood;
  if (skyCache.has(key)) return skyCache.get(key);
  const t = canvasTex(2048, 320, (g, w, h) => {
    const R = rng(31);
    paintSky(g, w, h, mood, R);
    // river glint band near the bottom, then the skyline sits above it
    paintSkyline(g, w, h, mood, R, { base: 0.86 });
    const water = { morning: '#7fc1d8', day: '#5fb0d0', dusk: '#a0719a', night: '#1b2244' }[mood];
    g.fillStyle = water;
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) g.fillRect(R() * w, h * (0.88 + R() * 0.1), 18 + R() * 30, 2);
    // bridge rail posts flicking past
    g.fillStyle = 'rgba(60,60,70,0.55)';
    for (let x = 0; x < w; x += 256) g.fillRect(x, 0, 10, h);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(0.5, 1);
  skyCache.set(key, t);
  return t;
}

/** text sign (name plate, posters) */
export function signTex(lines, o) {
  o = o || {};
  const w = o.w || 512;
  const h = o.h || 192;
  return canvasTex(w, h, (g) => {
    g.fillStyle = o.bg || '#fffaf0';
    g.beginPath();
    g.roundRect(0, 0, w, h, o.r ?? 28);
    g.fill();
    if (o.border) {
      g.strokeStyle = o.border;
      g.lineWidth = 10;
      g.beginPath();
      g.roundRect(5, 5, w - 10, h - 10, (o.r ?? 28) - 4);
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const size = ln.size || o.size || 72;
      g.font = `${size}px ${FONT}`;
      g.fillStyle = ln.color || o.color || '#4a3323';
      g.fillText(ln.text, w / 2, h * ((i + 0.5) / n) + (ln.dy || 0));
    });
  });
}

/** monitor screen: a spreadsheet with a little chart */
export function screenTex() {
  return canvasTex(512, 320, (g, w, h) => {
    const R = rng(5);
    g.fillStyle = '#eef7ff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#5aa9e6';
    g.fillRect(0, 0, w, 34);
    g.fillStyle = '#ffffff';
    g.font = `22px ${FONT}`;
    g.fillText('도토리 보고서.xls', 14, 24);
    g.strokeStyle = '#c9dceb';
    g.lineWidth = 2;
    for (let y = 60; y < h; y += 28) {
      g.beginPath();
      g.moveTo(10, y);
      g.lineTo(w * 0.56, y);
      g.stroke();
      g.fillStyle = '#9db6c9';
      g.fillRect(16, y - 18, 40 + R() * 90, 10);
    }
    // bar chart
    const cols = ['#5bb36a', '#f6d04d', '#f7b2c0', '#9fd8f5', '#a8754a'];
    for (let i = 0; i < 5; i++) {
      const bh = 40 + R() * 150;
      g.fillStyle = cols[i];
      g.fillRect(w * 0.62 + i * 36, h - 30 - bh, 26, bh);
    }
  });
}

/** soft round glow sprite texture */
let glowTex = null;
export function glow() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,236,190,0.9)');
    grd.addColorStop(0.4, 'rgba(255,220,160,0.35)');
    grd.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}

/** a "Z" for sleeping */
let zTex = null;
export function zzz() {
  if (zTex) return zTex;
  zTex = canvasTex(96, 96, (g) => {
    g.font = `80px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#ffffff';
    g.strokeText('Z', 48, 52);
    g.fillStyle = '#7d8fd8';
    g.fillText('Z', 48, 52);
  });
  return zTex;
}

/* ============================================================== acorn */
const ACORN = {
  nut: new THREE.SphereGeometry(1, 18, 14).scale(0.085, 0.1, 0.085).translate(0, -0.02, 0),
  cap: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.095, 0.07, 0.095).translate(0, 0.035, 0),
  stem: new THREE.CylinderGeometry(0.012, 0.016, 0.05, 8).translate(0, 0.12, 0),
};
export const ACORN_MAT = {
  nut: new THREE.MeshStandardMaterial({ color: '#d4914f', roughness: 0.45 }),
  cap: new THREE.MeshStandardMaterial({ color: '#7a5232', roughness: 0.9 }),
};

/** one acorn mesh (for the falling one) */
export function acorn(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ACORN.nut, ACORN_MAT.nut), new THREE.Mesh(ACORN.cap, ACORN_MAT.cap), new THREE.Mesh(ACORN.stem, ACORN_MAT.cap));
  g.scale.setScalar(scale);
  return shade(g);
}

/**
 * A heap of acorns that can show 0..max of them (instanced). Positions are a mound inside
 * a circle of radius r, filled bottom-up so the pile grows.
 */
export function acornPile(max, r, scale = 1) {
  const g = new THREE.Group();
  const parts = ['nut', 'cap', 'stem'].map((k) => {
    const im = new THREE.InstancedMesh(ACORN[k], ACORN_MAT[k === 'nut' ? 'nut' : 'cap'], max);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    g.add(im);
    return im;
  });
  const R = rng(3);
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(scale, scale, scale);
  const step = 0.15 * scale;
  // full layers inside the basket, then a mound that narrows toward the top
  const radii = [1, 1, 0.92, 0.74, 0.55, 0.36, 0.18].map((k) => Math.max(step * 0.4, r * k));
  let i = 0;
  for (let layer = 0; layer < radii.length && i < max; layer++) {
    const lr = radii[layer];
    const n = Math.max(1, Math.floor((Math.PI * lr * lr) / (step * step)));
    for (let k = 0; k < n && i < max; k++, i++) {
      const a = k * 2.39996 + layer * 0.7 + R() * 0.3;
      const d = Math.sqrt((k + 0.5) / n) * lr;
      e.set((R() - 0.5) * 1.6, R() * 6.28, (R() - 0.5) * 1.6);
      q.setFromEuler(e);
      M.compose(new THREE.Vector3(Math.cos(a) * d, layer * step * 0.6 + 0.08 * scale, Math.sin(a) * d), q, s);
      parts.forEach((im) => im.setMatrixAt(i, M));
    }
  }
  max = i; // what actually fits
  g.userData.max = max;
  g.userData.set = (n) => {
    n = Math.max(0, Math.min(max, Math.round(n)));
    parts.forEach((im) => {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    });
  };
  return g;
}
