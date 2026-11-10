/* 3D hairstyles — built in HEAD SPACE (unit sphere head at origin, +Z = face).
 *
 * Two home-made primitives do most of the work:
 *   cap(ctx, mat, { edge, R, ... })  a hair "helmet": for every azimuth the mesh starts
 *       exactly on the hairline edge(az) (elevation, deg) with a rounded lip and climbs to
 *       the crown at radius R(az, el, v). Clean hairlines, no seams, no gaps.
 *       Optional offset(az, el, v, r) -> [dx, dy, dz] bends the surface (swept tufts).
 *   lock(ctx, mat, points, { w, h, ... })  a swept clump with a rounded (super-ellipse)
 *       cross-section of width w(t) and thickness h(t): fringe pieces, tails, braids.
 */
import { CC } from '../cc.js';

const PI = Math.PI;
const D2R = PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ss = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
const wrap = (az) => ((((az + 180) % 360) + 360) % 360) - 180;
const fn = (v) => (typeof v === 'function' ? v : () => v);

/** smooth (cosine) interpolation through [[x, y], ...] (sorted by x) */
function keys(list) {
  return (x) => {
    if (x <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (x <= list[i][0]) {
        const [x0, y0] = list[i - 1];
        const [x1, y1] = list[i];
        const t = (x - x0) / (x1 - x0 || 1);
        return y0 + (y1 - y0) * (1 - Math.cos(t * PI)) * 0.5;
      }
    }
    return list[list.length - 1][1];
  };
}
/** symmetric edge table on |az| (0 = front, 180 = back) */
const sym = (list) => {
  const f = keys(list);
  return (az) => f(Math.abs(wrap(az)));
};
/** rounded scallops: dips of `depth` deg centred on `centers` (half-width hw) */
const scallop = (centers, hw, depth, pow = 0.5) => (az) => {
  let d = 0;
  for (const c of centers) {
    const u = (az - c) / hw;
    if (u > -1 && u < 1) d = Math.max(d, Math.pow(1 - u * u, pow));
  }
  return -depth * d;
};
/** narrow valley profile (0..1) around 0 */
const valley = (x, w) => Math.exp(-(x * x) / (w * w));
const dirv = (az, el) => {
  const a = az * D2R;
  const e = el * D2R;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
};
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** angle (deg) between unit vectors */
const angle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1)) / D2R;

/** grooves radiating from a pole direction (unit vec) — n clumps around it */
function radialGroove(v, pole, n, width, phase = 0) {
  // basis around the pole
  const up = Math.abs(pole[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const x = norm([up[1] * pole[2] - up[2] * pole[1], up[2] * pole[0] - up[0] * pole[2], up[0] * pole[1] - up[1] * pole[0]]);
  const y = [pole[1] * x[2] - pole[2] * x[1], pole[2] * x[0] - pole[0] * x[2], pole[0] * x[1] - pole[1] * x[0]];
  const a = Math.atan2(dot(v, y), dot(v, x)) / D2R + phase;
  const step = 360 / n;
  const m = ((a % step) + step) % step;
  return valley(Math.min(m, step - m), width);
}

/* ------------------------------------------------------------------ cap */
function cap(ctx, mat, o) {
  const THREE = ctx.THREE;
  const cols = o.cols || 168;
  const lipRows = o.lipRows || 7;
  const rows = o.rows || 40;
  const lipF = fn(o.lip ?? 7);
  const inset = o.inset ?? 0.03;
  const r0 = 1 - inset;
  const L = lipRows + rows; // rows per column (pole separate)
  const pos = new Float32Array((cols * L + 1) * 3);
  let p = 0;
  const off = o.offset || null;
  const put = (az, el, r, k = 1) => {
    const d = dirv(az, el);
    let x = d[0] * r;
    let y = d[1] * r;
    let z = d[2] * r;
    if (off && k > 0) {
      const q = off(az, el, d, r);
      x += q[0] * k;
      y += q[1] * k;
      z += q[2] * k;
    }
    pos[p++] = x;
    pos[p++] = y;
    pos[p++] = z;
  };
  for (let i = 0; i < cols; i++) {
    const az = -180 + (360 * i) / cols;
    const e0 = o.edge(az);
    const lip = Math.min(lipF(az), (90 - e0) * 0.5);
    for (let k = 0; k <= lipRows; k++) {
      const th = (k / lipRows) * (PI / 2);
      const el = e0 + lip * (1 - Math.cos(th));
      const R = o.R(az, el, dirv(az, el));
      put(az, el, r0 + (R - r0) * Math.sin(th), Math.sin(th));
    }
    for (let j = 1; j < rows; j++) {
      const s = j / rows;
      const el = e0 + lip + (90 - e0 - lip) * s;
      put(az, el, o.R(az, el, dirv(az, el)));
    }
  }
  put(0, 90, o.R(0, 90, [0, 1, 0]));
  const pole = cols * L;
  const idx = [];
  const id = (i, j) => (i % cols) * L + j;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < L - 1; j++) {
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i, j + 1);
      const d = id(i + 1, j + 1);
      idx.push(a, b, d, a, d, c);
    }
    idx.push(id(i, L - 1), id(i + 1, L - 1), pole);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = ctx.mesh(geo, mat);
  if (!o.accent) m.userData.hairVolume = true; // counted by crownRadius()
  return m;
}

/* ------------------------------------------------------------------ lock */
/**
 * points: [[x,y,z],...] centre line. o.w / o.h: width / thickness (number or t => v).
 * o.out(P, t): reference "outward" vector (default: radial from the head centre).
 * o.pow: cross-section squareness (2 = ellipse, 3..4 = rounded slab).
 * o.cup: bends the cross-section edges inward (toward -out) by cup * w.
 * o.twist(t): radians around the tangent.
 * o.strands: { n, depth, w } soft grooves running along the lock (use radial >= 5 * n).
 */
function lock(ctx, mat, points, o) {
  o = o || {};
  const THREE = ctx.THREE;
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, o.curveType || 'centripetal');
  const seg = o.seg || 36;
  const rad = o.radial || 18;
  const pw = 2 / (o.pow || 2);
  const W = fn(o.w ?? 0.2);
  const H = fn(o.h ?? 0.12);
  const cup = fn(o.cup ?? 0);
  const twist = o.twist ? fn(o.twist) : null;
  const st = o.strands ? Object.assign({ n: 7, depth: 0.12, w: 0.16 }, o.strands) : null;
  const pos = new Float32Array(((seg + 1) * rad + 2) * 3);
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let k = 0;
  const frames = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    const out = o.out ? o.out(P.clone(), t) : P.clone();
    if (Array.isArray(out)) N.set(out[0], out[1], out[2]);
    else N.copy(out);
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-8) N.set(0, 0, 1).addScaledVector(T, -T.z);
    N.normalize();
    B.crossVectors(N, T).normalize();
    if (twist) {
      const a = twist(t);
      const c = Math.cos(a);
      const s = Math.sin(a);
      tmp.copy(B).multiplyScalar(c).addScaledVector(N, s);
      N.multiplyScalar(c).addScaledVector(B, -s);
      B.copy(tmp);
    }
    const w = W(t) / 2;
    const h = H(t) / 2;
    const cu = cup(t) * W(t);
    frames.push(P.clone());
    for (let j = 0; j < rad; j++) {
      const ph = (j / rad) * PI * 2;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      const cx = Math.sign(c) * Math.pow(Math.abs(c), pw);
      const cy = Math.sign(s) * Math.pow(Math.abs(s), pw);
      let kk = 1;
      if (st) {
        // soft strand grooves running along the lock
        const m = (((j + 0.5) / rad) * st.n + (st.phase || 0)) % 1;
        const dd = Math.min(m, 1 - m);
        kk = 1 - st.depth * Math.exp(-(dd * dd) / (st.w * st.w)) * ss(0, 0.08, t);
      }
      tmp.copy(P).addScaledVector(B, w * cx * kk).addScaledVector(N, h * cy * kk - cu * cx * cx);
      pos[k++] = tmp.x;
      pos[k++] = tmp.y;
      pos[k++] = tmp.z;
    }
  }
  const s0 = frames[0];
  const s1 = frames[seg];
  pos.set([s0.x, s0.y, s0.z, s1.x, s1.y, s1.z], k);
  const start = (seg + 1) * rad;
  const end = start + 1;
  const idx = [];
  const id = (i, j) => i * rad + (j % rad);
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rad; j++) {
      const a = id(i, j);
      const b = id(i, j + 1);
      const c = id(i + 1, j);
      const d = id(i + 1, j + 1);
      idx.push(a, c, d, a, d, b);
    }
  }
  for (let j = 0; j < rad; j++) {
    idx.push(start, id(0, j + 1), id(0, j));
    idx.push(end, id(seg, j), id(seg, j + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return ctx.mesh(geo, mat);
}

/** width/thickness profile: base value, rounded closed tip after `tip` (0..1), rounded root before `root` */
const taper = (v0, v1, tip = 0.75, root = 0, minTip = 0.0) => (t) => {
  let v = v0 + (v1 - v0) * t;
  if (t > tip) {
    const u = (t - tip) / (1 - tip);
    v *= Math.max(minTip, Math.sqrt(Math.max(0, 1 - u * u)));
  }
  if (root > 0 && t < root) {
    const u = 1 - t / root;
    v *= Math.sqrt(Math.max(0, 1 - u * u));
  }
  return v;
};

/** hair tie / accent color that contrasts with the hair (candy tones) */
function tieColor(ctx) {
  const [r, g, b] = ctx.C.hexToRgb(ctx.hair).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let hue = 0;
  if (mx - mn > 0.08) {
    if (mx === r) hue = ((g - b) / (mx - mn) + 6) % 6;
    else if (mx === g) hue = (b - r) / (mx - mn) + 2;
    else hue = (r - g) / (mx - mn) + 4;
    hue *= 60;
  }
  const sat = mx - mn > 0.08;
  // reds / pinks / oranges / browns -> blue tie, everything else -> coral red
  if (sat && (hue < 40 || hue > 300) && ctx.C.luminance(ctx.hair) > 0.12) return '#3d7fc9';
  return '#e4575f';
}

/** shared materials */
function mats(ctx) {
  return {
    hair: ctx.mat.hair(),
    deep: ctx.mat.hair({ color: ctx.C.shade(ctx.hair, 0.25) }),
    tie: ctx.mat.plastic(tieColor(ctx), { roughness: 0.35 }),
  };
}

/** wraps an edge(az) baseline: lifts a rounded arch of bare skin over each ear (|az| ~ 89) */
const ear = (f, top = 10, hw = 16.5, c = 89) => (az) => {
  const e = f(az);
  const u = (Math.abs(wrap(az)) - c) / hw;
  if (u <= -1 || u >= 1) return e;
  return e + Math.max(0, top - e) * Math.pow(1 - Math.pow(Math.abs(u), 2.4), 0.55);
};

/** pillow profile: 1 at the centre of the nearest lobe, 0 at its borders */
const lobes = (centers, hw) => (az) => {
  let d = 0;
  for (const c of centers) {
    const u = (az - c) / hw;
    if (u > -1 && u < 1) d = Math.max(d, 1 - u * u);
  }
  return d;
};

/* ------------------------------------------------------------------ more helpers */
/** points spread evenly on the unit sphere (Fibonacci lattice) */
function fib(n, seed = 0) {
  const pts = [];
  const ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i + seed;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}
/** cauliflower bumps: 0..1, 1 at a bump centre (rho = bump radius in degrees) */
function bumps(v, pts, rho) {
  const c = Math.cos(rho * D2R);
  let best = 0;
  for (const p of pts) {
    const d = dot(v, p);
    if (d > c) {
      const a = Math.acos(Math.min(1, d)) / (rho * D2R);
      const b = Math.sqrt(1 - a * a);
      if (b > best) best = b;
    }
  }
  return best;
}
/** radius that makes hair hang straight down below the equator (h = horizontal radius) */
const hangR = (h, el) => (el >= 0 ? h : h / Math.max(Math.cos(el * D2R), 0.3));
/** pointed (V) scallops */
const zig = (centers, hw, depth) => (az) => {
  let d = 0;
  for (const c of centers) {
    const u = Math.abs((az - c) / hw);
    if (u < 1) d = Math.max(d, Math.pow(1 - u, 1.15));
  }
  return -depth * d;
};
/** grooves along meridians: n per 360 deg */
const meridian = (az, n, w, phase = 0) => {
  const step = 360 / n;
  const m = ((((az + phase) % step) + step) % step);
  return valley(Math.min(m, step - m), w);
};
const scaleV = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const addV = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** common short-back rules shared by several cuts */
function shortBack(T, az, el, v) {
  const a = Math.abs(az);
  T += 0.04 * gauss(el - 28, 26) * ss(50, 80, a) * ss(150, 115, a); // temples
  T += 0.04 * gauss(angle(v, norm([0, 0.3, -0.95])), 48); // round back of the head
  T -= 0.05 * ss(-20, -50, el) * ss(100, 140, a); // tapered nape
  return T;
}
/** a tie (scrunchie) ring at point p facing direction d */
function tie(ctx, M, p, d, R = 0.16, tube = 0.07) {
  const t = ctx.torus(R, tube, M.tie, { radial: 14, tubular: 36 });
  t.position.set(p[0], p[1], p[2]);
  t.lookAt(p[0] + d[0], p[1] + d[1], p[2] + d[2]);
  return t;
}

/**
 * Soft union of rounded cone tufts on the head. list: [az, el, height, radius deg, leanDir].
 * Returns field(v) -> { p: extra radius, f: blended lean direction } (use with leanOffset).
 */
function tuftField(list, o = {}) {
  const pw = o.pw ?? 1.4;
  const round = (o.round ?? 3) * D2R;
  const tufts = list.map(([az, el, h, r, f]) => ({ v: norm(dirv(az, el)), h, c: Math.cos(r * D2R), r: r * D2R, f }));
  return (v) => {
    let sum = 0;
    const f = [0, 0, 0];
    for (const t of tufts) {
      const d = dot(v, t.v);
      if (d > t.c) {
        const a = Math.acos(Math.min(1, d));
        const u = Math.max(0, 1 - (Math.sqrt(a * a + round * round) - round) / t.r);
        const w = Math.pow(t.h * Math.pow(u, pw), 5);
        sum += w;
        f[0] += t.f[0] * w;
        f[1] += t.f[1] * w;
        f[2] += t.f[2] * w;
      }
    }
    const s = sum > 1e-12 ? 1 / sum : 0;
    return { p: Math.pow(sum, 0.2), f: [f[0] * s, f[1] * s, f[2] * s] };
  };
}
/** bend the surface along the tufts' lean (tangential part only): amount = a * p^2 + b * p */
function leanOffset(F, v, a, b = 0) {
  const k = dot(v, F.f);
  const m = F.p * F.p * a + F.p * b;
  return [(F.f[0] - v[0] * k) * m, (F.f[1] - v[1] * k) * m, (F.f[2] - v[2] * k) * m];
}
const LEAN_UP = norm([0, 0.35, -1]);
const LEAN_BACK = norm([0, -0.2, -1]);

/** a swirled bun ball sitting on the head along dir (centre at radius dist, size = ball radius) */
function bunBall(ctx, M, dir, dist, size, spin = 0) {
  const bun = cap(ctx, M.hair, {
    edge: () => -84,
    R: (az, el) => 1.03 - 0.06 * valley(Math.sin(((az + el * 2.2) * D2R) * 3) * 8, 2.6),
    lip: 3,
    cols: 120,
    rows: 40,
    accent: true,
  });
  const bc = scaleV(dir, dist);
  bun.position.set(bc[0], bc[1], bc[2]);
  bun.scale.setScalar(size);
  bun.lookAt(bc[0] + dir[0], bc[1] + dir[1], bc[2] + dir[2]);
  bun.rotateX(PI / 2);
  if (spin) bun.rotateY(spin);
  bun.userData.hatDir = dir; // hidden under crown-covering hats (see hideUnderHats)
  return bun;
}

/** full style + squashed "hat hair" variant; hideUnderHats() shows the latter under crown-covering hats */
function hatSwap(ctx, full, flat) {
  full.userData.hatMode = 'full';
  flat.userData.hatMode = 'hat';
  flat.visible = false;
  return ctx.group(full, flat);
}

/* ------------------------------------------------------------------ the styles */
const styles = [];
const add = (id, name, render) => styles.push({ id, name, render });

/* 단정 숏컷 — neat short cut, soft rounded fringe lobes */
add('daily', '단정 숏컷', (ctx) => {
  const M = mats(ctx);
  const C = [-36, -13, 10, 33];
  const base = ear(sym([[0, 30], [40, 30], [52, 14], [64, 0], [72, -7], [104, -15], [130, -34], [180, -50]]));
  const fringe = scallop(C, 12, 7.5, 0.55);
  const pill = lobes(C, 12);
  const edge = (az) => base(az) + (Math.abs(az) < 48 ? fringe(az) * ss(49, 40, Math.abs(az)) : 0);
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = shortBack(0.135 + 0.035 * ss(-10, 55, el), az, el, v);
    if (a < 56) T += 0.035 * pill(az) * ss(66, 36, el) - 0.018 * (1 - pill(az)) * ss(68, 36, el) * ss(50, 40, a);
    T -= 0.02 * meridian(az, 18, 2.4, 10) * ss(-40, -10, el) * ss(25, 0, el) * ss(100, 130, a); // nape locks
    return 1 + T;
  };
  return cap(ctx, M.hair, { edge, R, lip: 6.5 });
});

/* 2:8 가르마 — office side part with a swept fringe */
add('sidepart', '2:8 가르마', (ctx) => {
  const M = mats(ctx);
  const PX = -0.4; // part plane (viewer's left)
  const base = keys([
    [-180, -50], [-130, -34], [-104, -15], [-72, -7], [-60, 8], [-48, 32], [-36, 42],
    [-20, 37], [0, 30], [20, 25], [34, 21], [44, 16], [54, 6], [64, -2], [72, -7], [104, -15], [130, -34], [180, -50],
  ]);
  const edge = ear((az) => base(az) - 2.5 * valley(az - 36, 6));
  const R = (az, el, v) => {
    const px = v[0] - PX;
    const front = ss(-0.6, 0.05, v[2]);
    const big = ss(-0.01, 0.14, px);
    let T = shortBack(0.12 + 0.03 * ss(-10, 55, el), az, el, v);
    T += 0.075 * big * front * gauss(px - 0.28, 0.3) * ss(18, 48, el); // lifted sweep beside the part
    T -= 0.065 * valley(px, 0.04) * front * ss(28, 44, el); // part groove
    // sweep grooves running diagonally from the part down toward the right temple
    const psi = el + 0.62 * az;
    const step = 15;
    const m = (((psi % step) + step) % step);
    T -= 0.03 * valley(Math.min(m, step - m), 1.8) * big * front * ss(20, 34, el) * ss(78, 55, el) * ss(-50, -20, az);
    return 1 + T;
  };
  return cap(ctx, M.hair, { edge, R, lip: 6.5, cols: 192 });
});

/* 가르마펌 — centre-parted curtain fringe rolling out to both temples */
add('curtain', '가르마펌', (ctx) => {
  const M = mats(ctx);
  const base = ear(
    sym([[0, 43], [8, 39], [20, 30], [31, 24], [40, 21], [47, 22], [53, 25], [59, 15], [65, 3], [72, -7], [104, -15], [130, -34], [180, -50]])
  );
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = shortBack(0.12 + 0.03 * ss(-10, 55, el), az, el, v);
    const front = ss(-0.35, 0.3, v[2]);
    // the two wings: fringe volume either side of the part, rolling outward
    T += 0.08 * gauss(a - 28, 17) * ss(16, 32, el) * ss(74, 46, el) * front;
    T -= 0.07 * valley(v[0], 0.04) * front * ss(38, 48, el); // the part
    // sweep grooves curving from the part out toward the temples
    const psi = el + 0.8 * a;
    const step = 14;
    const m = ((psi % step) + step) % step;
    T -= 0.03 * valley(Math.min(m, step - m), 2.2) * front * ss(26, 36, el) * ss(76, 58, el) * ss(5, 12, a) * ss(66, 48, a);
    return 1 + T;
  };
  const lip = (az) => 6.5 + 4 * gauss(Math.abs(wrap(az)) - 36, 12);
  return cap(ctx, M.hair, { edge: base, R, lip, cols: 200, rows: 46 });
});

/* 스포츠 머리 — flat-top crew cut: a brushed-up front ridge over short clipped (darker) sides */
add('crew', '스포츠 머리', (ctx) => {
  const M = mats(ctx);
  const base = ear(sym([[0, 37], [26, 37], [42, 32], [52, 22], [62, 8], [72, -6], [104, -14], [130, -30], [180, -46]]));
  // clipped sides + back (hidden under the top at the front)
  const sides = cap(ctx, M.deep, {
    edge: (az) => 52 + (base(az) - 52) * ss(30, 58, Math.abs(wrap(az))),
    R: (az, el) => 1.042 + 0.012 * ss(-10, 40, el),
    lip: 4,
    cols: 168,
    rows: 34,
  });
  const topEdge = sym([[0, 37], [26, 37], [42, 32], [54, 26], [80, 24], [120, 18], [180, 12]]);
  const R = (az, el, v) => {
    let T = 0.095 + 0.02 * ss(20, 60, el);
    T += 0.03 * gauss(angle(v, norm([0, 0.3, -0.95])), 45);
    T += 0.03 * gauss(el - 43, 9) * gauss(az, 38); // brushed-up front ridge
    const r = 1 + T;
    const top = 1.09 / Math.max(Math.sin(el * D2R), 0.01); // soft flat top
    return el > 30 ? -Math.log(Math.exp(-r * 24) + Math.exp(-top * 24)) / 24 : r;
  };
  return ctx.group(sides, cap(ctx, M.hair, { edge: topEdge, R, lip: 6, cols: 200, rows: 50 }));
});

/* 삐죽 머리 — messy spiky tufts swept back */
add('spiky', '삐죽 머리', (ctx) => {
  const M = mats(ctx);
  const C = [-40, -22, -4, 14, 32];
  const BC = [-158, -134, -110, 110, 134, 158, 180, -180]; // pointed panels around the back hem
  const base = ear(sym([[0, 31], [42, 30], [54, 14], [64, 0], [72, -7], [104, -14], [130, -30], [180, -40]]));
  const zz = zig(C, 9.5, 9);
  const zb = zig(BC, 12, 12);
  const pb = lobes(BC, 12);
  const edge = (az) => {
    const a = Math.abs(az);
    return base(az) + (a < 50 ? zz(az) * ss(52, 42, a) : 0) + zb(az) * ss(100, 112, a);
  };
  // tufts on the crown only: front ones swept up and back, the ones above the ears flick backwards
  const U = LEAN_UP;
  const K = LEAN_BACK;
  const TUFTS = [
    [-18, 46, 0.26, 24, U], [16, 48, 0.28, 24, U], [0, 70, 0.3, 26, U], [-55, 50, 0.26, 25, U], [55, 50, 0.26, 25, U],
    [-112, 58, 0.24, 28, K], [112, 58, 0.24, 28, K], [180, 60, 0.24, 28, K], [-86, 26, 0.16, 20, K], [86, 26, 0.16, 20, K],
  ];
  // k scales the tufts: 1 = the style, ~0.3 = squashed "hat hair" shown under crown-covering hats
  const make = (k, cols, rows) => {
    const field = tuftField(TUFTS.map(([az, el, h, r, f]) => [az, el, h * k, r, f]));
    const R = (az, el, v) => {
      const a = Math.abs(az);
      let T = 0.1 + 0.02 * ss(-10, 55, el);
      T += 0.035 * gauss(angle(v, norm([0, 0.3, -0.95])), 48); // round back of the head
      if (a < 52) {
        let g = 0;
        for (const c of [-31, -13, 5, 23, 41]) g = Math.max(g, valley(az - c, 2.4));
        T -= 0.035 * g * ss(56, 36, el);
      }
      // layered back panels: puffed centres, grooves between them fading toward the crown
      const back = ss(96, 116, a) * ss(44, 10, el);
      T += 0.035 * pb(az) * back;
      let g = 0;
      for (const c of [-146, -122, 122, 146, 170, -170]) g = Math.max(g, valley(az - c, 2.6));
      T -= 0.04 * g * back;
      return 1 + T + field(v).p;
    };
    const offset = (az, el, v) => leanOffset(field(v), v, 2.3);
    return cap(ctx, M.hair, { edge, R, offset, lip: 6, cols, rows });
  };
  return hatSwap(ctx, make(1, 240, 64), make(0.3, 180, 48));
});

/* 몽글 곱슬 — soft short curls */
add('curly', '몽글 곱슬', (ctx) => {
  const M = mats(ctx);
  const P = fib(150, 0.6);
  const base = ear(sym([[0, 33], [40, 31], [54, 16], [66, 4], [74, -4], [104, -15], [130, -32], [180, -46]]), 16, 17);
  const edge = (az) => {
    const e = base(az);
    return e - 6 * bumps(norm(dirv(az, e - 2)), P, 12);
  };
  const R = (az, el, v) => {
    let T = 0.105 + 0.035 * ss(-10, 55, el);
    T += 0.025 * gauss(el - 28, 26) * ss(50, 80, Math.abs(az));
    T -= 0.035 * ss(-20, -46, el) * ss(100, 140, Math.abs(az));
    T += 0.07 * bumps(v, P, 12);
    return 1 + T;
  };
  return cap(ctx, M.hair, { edge, R, lip: 6, cols: 220, rows: 56 });
});

/* 포마드 — glossy pompadour quiff with short two-tone sides */
add('pompadour', '포마드', (ctx) => {
  const M = mats(ctx);
  const sides = cap(ctx, M.deep, {
    edge: ear(sym([[0, 34], [44, 30], [56, 14], [64, 0], [72, -7], [104, -15], [130, -32], [180, -46]])),
    R: (az, el) => 1.045 + 0.01 * ss(0, 40, el),
    lip: 4,
  });
  const topEdge = sym([[0, 36], [30, 36], [48, 28], [70, 22], [100, 16], [140, -12], [180, -24]]);
  // q scales the quiff: 1 = the style, small = flattened "hat hair" under crown-covering hats
  const make = (q, cols, rows) => {
    const R = (az, el, v) => {
      const a = Math.abs(az);
      let T = 0.075 + 0.045 * ss(-20, 30, el) + 0.04 * ss(20, 60, el);
      T += q * (0.28 * gauss(az + 4, 44) * gauss(el - 50, 16) + 0.12 * gauss(az + 4, 50) * gauss(el - 64, 20)); // quiff
      T -= 0.035 * meridian(az, 30, 2.2, 3) * ss(40, 50, el) * ss(85, 60, el) * ss(60, 30, a); // comb lines
      T -= 0.02 * meridian(az, 26, 2.2) * ss(70, 40, el) * ss(40, 70, a);
      return 1 + T;
    };
    return cap(ctx, M.hair, { edge: topEdge, R, lip: 9, cols, rows });
  };
  return ctx.group(sides, hatSwap(ctx, make(1, 200, 46), make(0.12, 160, 36)));
});

/* 보브 단발 — blunt fringe, chin-length bob tucked under */
add('bob', '보브 단발', (ctx) => {
  const M = mats(ctx);
  const base = sym([[0, 23], [30, 23], [40, 18], [47, -10], [56, -36], [110, -40], [180, -40]]);
  const edge = (az) => base(az) + scallop([-24, -8, 8, 24], 8, 2.2, 0.5)(az) * ss(36, 28, Math.abs(az));
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = 0.15 + 0.03 * ss(0, 60, el);
    if (a > 28) {
      const k = ss(28, 48, a);
      const e = Math.min(el, 12);
      const hang = (1 + T + 0.04 * gauss(e + 8, 22) + 0.03 * ss(60, 150, a)) / Math.max(Math.cos(e * D2R), 0.3);
      return 1 + T + (hang - 1 - T) * k * ss(16, 4, el) - 0.022 * meridian(az, 24, 2.2, 7.5) * ss(10, -15, el) * k;
    }
    let g = 0;
    for (const c of [-16, 0, 16]) g = Math.max(g, valley(az - c, 2.4));
    T -= 0.03 * g * ss(55, 35, el);
    return 1 + T;
  };
  return cap(ctx, M.hair, { edge, R, lip: 8, cols: 192 });
});

/* 버섯 머리 — round mushroom bowl cut */
add('bowl', '버섯 머리', (ctx) => {
  const M = mats(ctx);
  const edge = sym([[0, 22], [36, 21], [60, 8], [80, 0], [110, -4], [180, -8]]);
  const R = (az, el) => {
    let T = 0.17 + 0.02 * ss(10, 60, el);
    T += 0.04 * gauss(el - 16, 16);
    T -= 0.022 * meridian(az, 20, 2.6, 9) * ss(70, 40, el);
    return 1 + T;
  };
  // short darker under-layer (two-block) so the nape is not bare under the bowl
  const under = cap(ctx, M.deep, {
    edge: ear(sym([[0, 30], [44, 26], [56, 12], [64, 0], [72, -7], [104, -15], [130, -32], [180, -46]])),
    R: (az, el) => 1.04 + 0.01 * ss(-30, 0, el),
    lip: 4,
    cols: 140,
    rows: 30,
  });
  return ctx.group(under, cap(ctx, M.hair, { edge, R, lip: 11, lipRows: 9 }));
});

/* 긴 생머리 — long straight hair with a centre part */
function longCap(ctx, mat, o) {
  const base = sym([[0, 38], [16, 31], [30, 21], [40, 6], [47, -18], [54, -40], [82, -42], [96, -55], [180, -60]]);
  const tips = o.tips || ((az) => 0);
  const edge = (az) => base(az) + tips(az) * ss(84, 100, Math.abs(az));
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = 0.13 + 0.03 * ss(0, 60, el);
    T -= 0.06 * valley(v[0], 0.035) * ss(-0.2, 0.4, v[2]) * ss(20, 50, el); // centre part
    T += 0.02 * gauss(el - 30, 25) * ss(40, 80, a);
    let h = 1 + T;
    if (el < 0) {
      const back = ss(60, 140, a);
      h += (o.bulge ?? 0.04) * Math.sin(clamp(-el / 60, 0, 1) * PI) - 0.26 * back * ss(-20, -60, el) - 0.08 * ss(-30, -58, el);
      if (o.wave) h += o.wave * Math.sin((-el / 60) * PI * 2.5 + a * 0.02) * ss(0, -20, el);
    }
    let r = hangR(h, el);
    r -= (o.groove ?? 0.025) * meridian(az, o.n || 26, 2.2, 7) * ss(20, -10, el) * ss(40, 60, a);
    return r;
  };
  return cap(ctx, mat, { edge, R, lip: 8, cols: 216, rows: 50 });
}
add('long', '긴 생머리', (ctx) => {
  const M = mats(ctx);
  return longCap(ctx, M.hair, { tips: scallop([-170, -150, -130, -110, 110, 130, 150, 170, 180, -180], 10, 3, 0.6) });
});

/* 긴 웨이브 — long wavy hair */
add('wavy', '긴 웨이브', (ctx) => {
  const M = mats(ctx);
  return longCap(ctx, M.hair, {
    tips: scallop([-168, -144, -120, -96, 96, 120, 144, 168, 180, -180], 12, 6, 0.6),
    wave: 0.07,
    bulge: 0.08,
    groove: 0.04,
    n: 20,
  });
});

/** a plump hanging tail: radius ramps from the tie (r0) to a round belly (r1), round tip */
const tailW = (r0, r1, tip = 0.8) => (t) => {
  const belly = Math.sin(clamp((t - 0.06) / (tip + 0.08), 0, 1) * PI * 0.92);
  let v = r0 + (r1 - r0) * belly;
  if (t > tip) v *= Math.sqrt(Math.max(0, 1 - Math.pow((t - tip) / (1 - tip), 2)));
  if (t < 0.05) v *= 0.75 + 5 * t; // tucked into the tie
  return v;
};

/* 하이 포니테일 — pulled back into a high, bouncy ponytail */
add('ponytail', '하이 포니테일', (ctx) => {
  const M = mats(ctx);
  const tieDir = norm(dirv(180, 60));
  const base = ear(sym([[0, 34], [24, 32], [44, 22], [60, 6], [72, -7], [104, -15], [130, -34], [180, -48]]));
  const edge = (az) => base(az) + scallop([-12, 12], 13, 5, 0.6)(az) * ss(34, 22, Math.abs(az));
  const R = (az, el, v) => {
    let T = 0.1 + 0.03 * ss(10, 60, el);
    T += 0.04 * gauss(angle(v, norm([0, 0.55, 0.85])), 35);
    T -= 0.028 * radialGroove(v, tieDir, 16, 3.5) * ss(0.12, 0.5, 1 - dot(v, tieDir));
    T -= 0.04 * ss(-20, -50, el);
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6 }));
  const bp = scaleV(tieDir, 1.12);
  g.add(tie(ctx, M, bp, tieDir, 0.2, 0.085));
  // springs up out of the tie, arcs back and falls behind the head with a little outward flick
  const P = [
    addV(bp, scaleV(tieDir, -0.24)),
    addV(bp, scaleV(tieDir, 0.06)),
    [0, 1.22, -0.84],
    [0, 1.16, -1.2],
    [0, 0.84, -1.42],
    [0, 0.38, -1.48],
    [0, -0.02, -1.42],
    [0, -0.3, -1.5],
  ];
  g.add(lock(ctx, M.hair, P, { w: tailW(0.36, 0.58, 0.84), h: tailW(0.3, 0.44, 0.84), seg: 64, radial: 48, pow: 2.3, strands: { n: 8, depth: 0.12 } }));
  return g;
});

/* 양갈래 — twin tails tied high behind the ears */
add('twintails', '양갈래', (ctx) => {
  const M = mats(ctx);
  const C = [-30, -10, 10, 30];
  const base = ear(sym([[0, 30], [40, 28], [52, 12], [64, 0], [72, -7], [104, -15], [130, -34], [180, -46]]));
  const edge = (az) => base(az) + scallop(C, 10.5, 6, 0.55)(az) * ss(44, 38, Math.abs(az)) + 3 * valley(az, 4);
  const tieL = norm(dirv(-106, 24));
  const tieR = norm(dirv(106, 24));
  const R = (az, el, v) => {
    let T = 0.12 + 0.03 * ss(-10, 55, el);
    T -= 0.04 * ss(-20, -46, el) * ss(100, 140, Math.abs(az));
    T -= 0.035 * valley(v[0], 0.04) * ss(0.1, 0.5, v[1]) * ss(-0.3, 0.2, -v[2] + 0.4); // part line front-to-back
    const pole = az < 0 ? tieL : tieR;
    T -= 0.025 * radialGroove(v, pole, 14, 3.5) * ss(0.12, 0.45, 1 - dot(v, pole));
    if (Math.abs(az) < 50) T += 0.03 * lobes(C, 10.5)(az) * ss(66, 36, el);
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6.5 }));
  g.add(
    ctx.both((s) => {
      const d = s < 0 ? tieL : tieR;
      const bp = scaleV(d, 1.11);
      // out and down in a soft S, ending in a plump outward flick
      const pts = [
        addV(bp, scaleV(d, -0.26)),
        addV(bp, scaleV(d, 0.05)),
        [s * 1.27, bp[1] + 0.02, bp[2] - 0.1],
        [s * 1.34, bp[1] - 0.3, bp[2] - 0.13],
        [s * 1.27, bp[1] - 0.76, bp[2] - 0.1],
        [s * 1.16, bp[1] - 1.12, bp[2] - 0.02],
        [s * 1.25, bp[1] - 1.36, bp[2] + 0.0],
      ];
      return ctx.group(
        tie(ctx, M, bp, d, 0.17, 0.075),
        lock(ctx, M.hair, pts, { w: tailW(0.3, 0.48, 0.82), h: tailW(0.26, 0.38, 0.82), out: () => [0, 0, 1], seg: 56, radial: 42, pow: 2.3, strands: { n: 7, depth: 0.1 } })
      );
    })
  );
  return g;
});

/* 똥머리 — top knot bun */
add('topbun', '똥머리', (ctx) => {
  const M = mats(ctx);
  const bunDir = norm(dirv(180, 70));
  const base = ear(sym([[0, 36], [22, 33], [42, 22], [58, 6], [72, -7], [104, -15], [130, -34], [180, -46]]));
  const edge = (az) => base(az) + scallop([-20, 20], 12, 5, 0.6)(az) * ss(36, 24, Math.abs(az));
  const R = (az, el, v) => {
    let T = 0.095 + 0.03 * ss(10, 60, el);
    T += 0.035 * gauss(angle(v, norm([0, 0.55, 0.85])), 35);
    T -= 0.025 * radialGroove(v, bunDir, 18, 3.2) * ss(0.12, 0.45, 1 - dot(v, bunDir));
    T -= 0.035 * ss(-20, -46, el);
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6 }));
  const t0 = tie(ctx, M, scaleV(bunDir, 1.1), bunDir, 0.2, 0.07);
  t0.userData.hatDir = bunDir;
  g.add(bunBall(ctx, M, bunDir, 1.32, 0.4), t0);
  return g;
});

/* 양쪽 똥머리 — two round buns up on the crown, centre part, soft fringe */
add('twinbuns', '양쪽 똥머리', (ctx) => {
  const M = mats(ctx);
  const dL = norm(dirv(-50, 50));
  const dR = norm(dirv(50, 50));
  const C = [-30, -10, 10, 30];
  const base = ear(sym([[0, 31], [40, 28], [52, 12], [64, 0], [72, -7], [104, -15], [130, -34], [180, -46]]));
  const edge = (az) => base(az) + scallop(C, 10.5, 6, 0.55)(az) * ss(44, 38, Math.abs(az)) + 3 * valley(az, 4);
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = 0.11 + 0.03 * ss(-10, 55, el);
    T -= 0.04 * ss(-20, -46, el) * ss(100, 140, a);
    T -= 0.035 * valley(v[0], 0.04) * ss(0.2, 0.55, v[1]); // centre part over the crown
    const pole = v[0] < 0 ? dL : dR;
    T -= 0.025 * radialGroove(v, pole, 16, 3.4) * ss(0.12, 0.5, 1 - dot(v, pole)) * ss(0.02, 0.1, Math.abs(v[0]));
    if (a < 50) T += 0.03 * lobes(C, 10.5)(az) * ss(66, 36, el);
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6.5 }));
  g.add(
    ctx.both((s) => {
      const d = s < 0 ? dL : dR;
      const t0 = tie(ctx, M, scaleV(d, 1.1), d, 0.19, 0.06);
      t0.userData.hatDir = d;
      return ctx.group(bunBall(ctx, M, d, 1.28, 0.34, s * 0.6), t0);
    })
  );
  return g;
});

/* 땋은 머리 — side-swept fringe and a chunky braid over the shoulder */
add('braid', '땋은 머리', (ctx) => {
  const M = mats(ctx);
  const base = keys([
    [-180, -48], [-130, -32], [-104, -15], [-72, -7], [-62, 4], [-50, 22], [-38, 30],
    [-20, 33], [0, 33], [20, 31], [36, 28], [48, 14], [62, 0], [72, -7], [104, -15], [130, -32], [180, -48],
  ]);
  const C = [-38, -18, 2, 22];
  const edge = ear((az) => base(az) + scallop(C, 11, 6.5, 0.6)(az) * ss(48, 40, Math.abs(az)));
  const tieDir = norm(dirv(-112, -18));
  const R = (az, el, v) => {
    let T = 0.125 + 0.03 * ss(-10, 55, el);
    T += 0.03 * gauss(el - 28, 26) * ss(50, 80, Math.abs(az));
    T -= 0.025 * radialGroove(v, tieDir, 16, 3.4) * ss(0.25, 0.7, 1 - dot(v, tieDir)) * ss(20, -10, v[0] * 40);
    if (Math.abs(az) < 50) T += 0.03 * lobes(C, 11)(az) * ss(66, 36, el);
    T -= 0.035 * ss(-20, -46, el) * ss(100, 140, Math.abs(az));
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6.5 }));
  // plaited braid: from behind the left ear, past the jaw, hanging in front of the shoulder
  const THREE = ctx.THREE;
  const path = new THREE.CatmullRomCurve3(
    [[-0.8, -0.18, -0.46], [-1.04, -0.5, -0.24], [-1.0, -0.84, 0.02], [-0.8, -1.16, 0.26], [-0.6, -1.42, 0.38], [-0.52, -1.62, 0.42]].map(
      (q) => new THREE.Vector3(q[0], q[1], q[2])
    ),
    false,
    'centripetal'
  );
  const face = new THREE.Vector3(-0.45, 0, 1).normalize(); // the side of the braid we look at
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const L = new THREE.Vector3();
  const Wd = new THREE.Vector3();
  const core = [];
  for (let i = 0; i <= 12; i++) {
    const q = path.getPointAt((i / 12) * 0.9);
    core.push([q.x, q.y, q.z]);
  }
  g.add(ctx.tube(core, (t) => 0.11 - 0.025 * t, M.deep, { seg: 40, radial: 14 }));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = 0.04 + (i / (n - 1)) * 0.8;
    const P = path.getPointAt(t);
    path.getTangentAt(t, T);
    N.copy(face).addScaledVector(T, -face.dot(T)).normalize();
    B.crossVectors(N, T).normalize();
    const sgn = i % 2 ? 1 : -1;
    const a = 0.6 * sgn;
    L.copy(T).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
    Wd.crossVectors(N, L).normalize();
    const k = 1 - 0.2 * (i / (n - 1));
    const lobe = ctx.ellipsoid(0.2 * k, 0.135 * k, 0.12 * k, M.hair, { seg: 24 });
    lobe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(L, Wd, N));
    lobe.position.copy(P).addScaledVector(B, -0.06 * sgn * k);
    g.add(lobe);
  }
  // tie + fluffy end
  const tEnd = 0.9;
  const end = path.getPointAt(tEnd);
  const tan = path.getTangentAt(tEnd);
  g.add(tie(ctx, M, [end.x, end.y, end.z], [tan.x, tan.y, tan.z], 0.11, 0.065));
  const tuft = [end.clone().addScaledVector(tan, -0.06), end.clone().addScaledVector(tan, 0.12), end.clone().addScaledVector(tan, 0.3)].map((q) => [q.x, q.y, q.z]);
  g.add(lock(ctx, M.hair, tuft, { w: taper(0.2, 0.36, 0.55, 0, 0.05), h: taper(0.17, 0.24, 0.55, 0, 0.05), out: () => [face.x, face.y, face.z], seg: 20, radial: 30, strands: { n: 5, depth: 0.14 } }));
  return g;
});

/* 뽀글 아프로 — big round fluffy curls */
add('afro', '뽀글 아프로', (ctx) => {
  const M = mats(ctx);
  const P = fib(120, 1.3);
  const base = sym([[0, 30], [36, 28], [54, 10], [70, -18], [110, -30], [180, -42]]);
  const edge = (az) => {
    const e = base(az);
    return e - 7 * bumps(norm(dirv(az, e - 3)), P, 15);
  };
  const R = (az, el, v) => {
    let T = 0.26 + 0.2 * ss(-20, 60, el);
    T += 0.06 * gauss(el - 20, 30) * ss(30, 80, Math.abs(az));
    T += 0.1 * bumps(v, P, 15);
    return hangR(1 + T, el * 0.6);
  };
  return { head: cap(ctx, M.hair, { edge, R, lip: 9, cols: 230, rows: 60 }), hide: ['ears'] };
});

/* 반묶음 — half-up: shoulder-length hair with a little top knot */
add('halfup', '반묶음', (ctx) => {
  const M = mats(ctx);
  const C = [-34, -14, 6, 26];
  const base = sym([[0, 28], [38, 26], [46, 6], [53, -28], [82, -32], [96, -45], [180, -47]]);
  const edge = (az) => base(az) + scallop(C, 10.5, 6, 0.55)(az) * ss(44, 36, Math.abs(az)) + scallop([-150, -120, 120, 150, 180, -180], 15, 4, 0.6)(az) * ss(90, 100, Math.abs(az));
  const knotDir = norm(dirv(180, 50));
  const R = (az, el, v) => {
    const a = Math.abs(az);
    let T = 0.13 + 0.03 * ss(0, 60, el);
    T -= 0.025 * radialGroove(v, knotDir, 16, 3.4) * ss(0.1, 0.4, 1 - dot(v, knotDir)) * ss(-5, 15, el);
    if (a < 48) T += 0.03 * lobes(C, 10.5)(az) * ss(66, 36, el);
    let h = 1 + T;
    if (el < 0) h += 0.05 * Math.sin(clamp(-el / 50, 0, 1) * PI) - 0.1 * ss(60, 140, a) * ss(-25, -50, el);
    return hangR(h, el) - 0.025 * meridian(az, 24, 2.2, 7.5) * ss(5, -15, el) * ss(44, 60, a);
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 8, cols: 200 }));
  const bp = scaleV(knotDir, 1.14);
  g.add(tie(ctx, M, bp, knotDir, 0.17, 0.075));
  g.add(
    lock(ctx, M.hair, [addV(bp, scaleV(knotDir, -0.22)), addV(bp, scaleV(knotDir, 0.05)), addV(bp, [0, 0.22, -0.14]), addV(bp, [0, 0.2, -0.36]), addV(bp, [0, 0.02, -0.5])], {
      w: tailW(0.3, 0.48, 0.74),
      h: tailW(0.26, 0.38, 0.74),
      out: () => [0, 1, 0],
      seg: 40,
      radial: 36,
      pow: 2.3,
      strands: { n: 6, depth: 0.12 },
    })
  );
  return g;
});

/* 더듬이 머리 — neat crop with a curly cowlick on top */
add('cowlick', '더듬이 머리', (ctx) => {
  const M = mats(ctx);
  const C = [-30, -10, 10, 30];
  const base = ear(sym([[0, 31], [38, 30], [50, 14], [64, 0], [72, -7], [104, -15], [130, -34], [180, -50]]));
  const edge = (az) => base(az) + scallop(C, 10.5, 5, 0.55)(az) * ss(44, 38, Math.abs(az));
  const R = (az, el, v) => {
    let T = shortBack(0.13 + 0.03 * ss(-10, 55, el), az, el, v);
    T -= 0.025 * radialGroove(v, norm([0, 0.96, -0.28]), 14, 3.4) * ss(0.04, 0.25, 1 - dot(v, norm([0, 0.96, -0.28])));
    if (Math.abs(az) < 48) T += 0.025 * lobes(C, 10.5)(az) * ss(66, 36, el);
    return 1 + T;
  };
  const g = ctx.group(cap(ctx, M.hair, { edge, R, lip: 6.5 }));
  const curl = [
    [-0.04, 1.0, -0.12], [-0.05, 1.22, -0.08], [0.0, 1.42, -0.04], [0.16, 1.54, -0.02], [0.32, 1.48, 0], [0.34, 1.34, 0.02], [0.22, 1.27, 0.03], [0.13, 1.35, 0.04], [0.19, 1.43, 0.04],
  ];
  const c = lock(ctx, M.hair, curl, { w: taper(0.28, 0.14, 0.86, 0, 0.5), h: taper(0.21, 0.12, 0.86, 0, 0.5), out: () => [0, 0, 1], seg: 64, radial: 18, curveType: 'catmullrom' });
  c.userData.hatDir = norm([0.1, 1, -0.1]);
  g.add(c);
  return g;
});

/* Hint for hats: the furthest point of the main hair volume (caps, not tails / buns /
 * curls) above the ears, in head space, so a hat could scale itself over big styles.
 * Stored as userData.crownRadius on the returned head object. */
function crownRadius(obj, THREE) {
  let best = 1;
  const v = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || !m.userData.hairVolume) return;
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 3) {
      v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
      if (v.y > 0.25) best = Math.max(best, v.length());
    }
  });
  return +best.toFixed(3);
}
/* Hats vs. hair. The hair is not rebuilt when only the hat changes, so the hair root watches its
 * sibling hat on the head (the same way the hats watch the hair) and, whenever the hat object
 * changes, re-checks it in head space:
 *   - meshes tagged userData.hatDir (buns, the cowlick curl) hide when the hat reaches over the
 *     crown and has geometry right where they sit;
 *   - hatSwap() pairs (userData.hatMode 'full' / 'hat') switch to the squashed variant when the
 *     hat covers most of the crown (beanie, cap, bucket, beret, helmet, ...). */
function hideUnderHats(root, THREE) {
  const items = [];
  const modes = [];
  root.traverse((o) => {
    if (o.userData.hatDir) items.push(o);
    if (o.userData.hatMode) modes.push(o);
  });
  if (!items.length && !modes.length) return;
  let lastKey = null;
  const v = new THREE.Vector3();
  root.updateMatrixWorld = function (force) {
    const head = this.parent;
    if (head) {
      const hats = head.children.filter((c) => c !== this && c.userData && c.userData.cat === 'hat');
      const key = hats.map((h) => h.uuid).join(',');
      if (key !== lastKey) {
        lastKey = key;
        let up = 0;
        const hits = items.map(() => 0);
        const crown = new Set(); // which crown cells (el >= 45, 8 x 3) the hat passes over
        const walk = (o, M) => {
          if (o.visible === false) return;
          if (o.matrixAutoUpdate) o.updateMatrix();
          const MM = M.clone().multiply(o.matrix);
          const p = o.isMesh && o.geometry && o.geometry.attributes.position;
          if (p) {
            const step = Math.max(1, Math.floor(p.count / 3000));
            for (let i = 0; i < p.count; i += step) {
              v.fromBufferAttribute(p, i).applyMatrix4(MM);
              const r = v.length();
              if (r < 0.9) continue;
              v.divideScalar(r);
              if (v.y > 0.93) up++;
              const el = Math.asin(clamp(v.y, -1, 1)) / D2R;
              if (el >= 45) crown.add(Math.min(2, Math.floor((el - 45) / 15)) * 8 + (Math.floor((Math.atan2(v.x, v.z) / D2R + 180) / 45) % 8));
              for (let k = 0; k < items.length; k++) {
                const d = items[k].userData.hatDir;
                if (v.x * d[0] + v.y * d[1] + v.z * d[2] > 0.95) hits[k]++;
              }
            }
          }
          o.children.forEach((c) => walk(c, MM));
        };
        try {
          hats.forEach((h) => walk(h, new THREE.Matrix4()));
        } catch (e) {
          up = 0;
          crown.clear();
        }
        const covered = crown.size >= 15;
        items.forEach((it, k) => (it.visible = !(up >= 3 && hits[k] >= 3)));
        modes.forEach((m) => (m.visible = (m.userData.hatMode === 'hat') === covered));
      }
    }
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
}

styles.forEach((st) => {
  const render = st.render;
  st.render = (ctx) => {
    const out = render(ctx);
    const head = out && (out.isObject3D ? out : out.head);
    if (head) {
      head.userData.crownRadius = crownRadius(head, ctx.THREE);
      hideUnderHats(head, ctx.THREE);
    }
    return out;
  };
});

CC.register('hair', styles);
