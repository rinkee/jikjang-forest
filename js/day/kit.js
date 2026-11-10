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

/**
 * Wall clock that shows a given time: { group, set(date) }. Faces +Z; hang it on a wall.
 */
export function wallClock() {
  const clock = new THREE.Group();
  const face = cyl(0.44, 0.44, 0.06, mat('#fffaf0'), 0, 0, 0, 40);
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 10, 40), mat('#a8754a'));
  clock.add(face, shade(rim));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    clock.add(ball(i % 3 ? 0.018 : 0.03, mat('#7a5d45'), Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0.04));
  }
  const hand = (len, w) => {
    const p = new THREE.Group();
    p.add(box(w, len, 0.02, mat('#4a3323'), 0, len / 2 - 0.04, 0, 0.008));
    p.position.z = 0.05;
    clock.add(p);
    return p;
  };
  const hourHand = hand(0.22, 0.045);
  const minHand = hand(0.32, 0.03);
  clock.add(ball(0.035, mat('#e5584f'), 0, 0, 0.07));
  return {
    group: clock,
    set(d) {
      const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      minHand.rotation.z = -((mins % 60) / 60) * Math.PI * 2;
      hourHand.rotation.z = -(((mins / 60) % 12) / 12) * Math.PI * 2;
    },
  };
}

/**
 * Sunlight through a window, as a soft bright patch on the floor in front of it (with the
 * shadow of the window cross). update(sky, x, z): x = window centre, z = foot of the wall.
 * Longer when the sun is low; slides sideways with the sun (morning one way, evening the other).
 */
let patchTex = null;
export function sunPatch(width, depth) {
  if (!patchTex) {
    patchTex = canvasTex(256, 256, (g, w, h) => {
      g.filter = 'blur(10px)';
      g.fillStyle = '#ffffff';
      g.fillRect(28, 20, w - 56, h - 40);
      g.filter = 'none';
      g.globalCompositeOperation = 'destination-out';
      g.filter = 'blur(3px)';
      g.fillRect(w / 2 - 5, 0, 10, h);
      g.fillRect(0, h / 2 - 5, w, 10);
      g.filter = 'none';
      g.globalCompositeOperation = 'source-over';
    });
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.userData.update = (s, x, z) => {
    const a = s.patch.amount;
    m.visible = a > 0.01;
    m.material.opacity = a;
    m.material.color.set(s.patch.color);
    const low = 1 - Math.min(1, Math.max(0, s.elev / 35));
    const len = depth * (1.2 + 2.0 * low);
    m.scale.set(width, len, 1);
    m.rotation.z = s.patch.side * 0.45;
    m.position.set(x - s.patch.side * len * 0.45, 0.014, z + len / 2);
  };
  return m;
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
