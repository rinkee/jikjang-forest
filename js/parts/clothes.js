/* 3D clothes — tops, bottoms, shoes (CHARACTER SPACE, feet on y=0, +Z toward the viewer).
 *
 * Layering (radial inflate over the skin):
 *   bottoms   <= 0.03 on the torso, reaching up to y = 1.0..1.02 (always under the top)
 *   tops      >= 0.05 where they overlap a bottom; every hem sits at y <= 0.89
 *   outerwear ~0.08 · overall waist/bib/straps 0.09..0.105 · body accessories (extras.js) >= 0.1
 *   skirts hug the body above y ~0.9 and only flare below it (SK); apron/dress always cover SK.env
 *   overalls switch layers at runtime: over tees/knits/hoodies (0.092), but under jackets, the apron and
 *   the dress (0.056 bib / 0.058 seat) — tops flag themselves with body.userData.ccOveralls.
 * Legs: slim pant legs (incl. cuffs) stay <= 0.194 around the leg axis below y 0.5;
 *   boot / rain-boot shafts are 0.199..0.21 so trousers tuck in; wide pants swallow the shafts.
 * Sleeves end at t <= 0.86 so the hands stay visible.
 * Closed shoes hide the base feet and fully contain the ankle; sandals show the bare feet.
 */
import { CC } from '../cc.js';

const DEG = Math.PI / 180;
const C = CC.color;
const lum = C.luminance;
const CREAM = '#fbf8f1';

/* ------------------------------------------------------------------ colours */
/** a tone that reads against c: darker on light colours, lighter on dark ones */
const contrast = (c, k = 0.3) => (lum(c) > 0.4 ? C.shade(c, k) : C.light(c, k + 0.12));
/** slightly deeper tone of c (seams, ribs, inner lining) */
const deeper = (c, k = 0.14) => (lum(c) < 0.1 ? C.light(c, k * 0.9) : C.shade(c, k));
/** slightly brighter tone of c (trim) */
const brighter = (c, k = 0.18) => (lum(c) > 0.85 ? C.shade(c, k * 0.5) : C.light(c, k));
/** white-ish that still separates from c */
const whiteOn = (c) => (lum(c) > 0.78 ? C.mix(c, '#b9ab98', 0.38) : CREAM);

/* ------------------------------------------------------------------ geometry builder */
class GB {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.idx = [];
    this.avg = [];
  }
  v(p, t) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(t ? t[0] : 0, t ? t[1] : 0);
    return this.pos.length / 3 - 1;
  }
  /** (nu+1) x (nv+1) grid from f(i, j) -> { p, uv }. u x v must point outward. */
  grid(nu, nv, f, o = {}) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const r = f(i, j);
      this.v(r.p, r.uv);
    }
    const id = (i, j) => base + j * (nu + 1) + i;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
        if (o.flip) this.idx.push(a, c, b, a, d, c);
        else this.idx.push(a, b, c, a, c, d);
      }
    if (o.closedU) for (let j = 0; j <= nv; j++) this.avg.push([id(0, j), id(nu, j)]);
    if (o.pole0) this.avg.push(Array.from({ length: nu + 1 }, (_, i) => id(i, 0)));
    if (o.pole1) this.avg.push(Array.from({ length: nu + 1 }, (_, i) => id(i, nv)));
    return id;
  }
  /** quad strip between two equally long lists of { p, uv } */
  strip(A, B) {
    const base = this.pos.length / 3;
    A.forEach((a, k) => {
      this.v(a.p, a.uv);
      this.v(B[k].p, B[k].uv);
    });
    for (let k = 0; k < A.length - 1; k++) {
      const a = base + 2 * k, b = a + 1, c = a + 3, d = a + 2;
      this.idx.push(a, b, c, a, c, d);
    }
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    this.avg.forEach((list) => {
      let x = 0, y = 0, z = 0;
      list.forEach((k) => {
        x += n.getX(k);
        y += n.getY(k);
        z += n.getZ(k);
      });
      const l = Math.hypot(x, y, z) || 1;
      list.forEach((k) => n.setXYZ(k, x / l, y / l, z / l));
    });
    return g;
  }
}

/* torso profile arc-length table (rows of torso sheets are spaced along the surface) */
let PROF = null;
function profile(ctx) {
  if (PROF) return PROF;
  const A = ctx.A;
  const ys = [];
  const ss = [];
  let s = 0;
  let pr = 0;
  const n = 600;
  for (let i = 0; i <= n; i++) {
    const y = A.torsoBottom + ((A.torsoTop - A.torsoBottom) * i) / n;
    const r = ctx.torsoRadiusAt(y);
    if (i) s += Math.hypot(y - ys[i - 1], r - pr);
    ys.push(y);
    ss.push(s);
    pr = r;
  }
  PROF = { ys, ss };
  return PROF;
}
function table(xs, vs, x) {
  if (x <= xs[0]) return vs[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return vs[n];
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return vs[lo] + (vs[hi] - vs[lo]) * t;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fnOf = (v, d) => (typeof v === 'function' ? v : () => (v == null ? d : v));

/* ------------------------------------------------------------------ cloth folds
 * Garments are not perfect shells: cloth hangs in soft, uneven folds. Three places get them,
 * all at the helper level so every part picks them up:
 *   tops     the torso shell ripples outward below the chest, growing toward the hem
 *            (foldField; calmer at the front centre where plackets, ties and buttons sit)
 *   sleeves  long sleeves crease at the elbow and stack a little above the cuff
 *   trousers long legs break and stack above the hem
 * Torso folds only ever push OUT and sleeve / leg creases only ever pull IN, so the layering
 * rules at the top of this file still hold. */
let FOLDS = 0; // amplitude for the top that is rendering right now (0 = none)
const TOP_FOLDS = { default: 0.026, hoodie: 0.018, knit: 0.016, cardigan: 0.013, blazer: 0.011, ranger: 0.011, puffer: 0.005, dress: 0.009, apron: 0 };
/** 0..1 fold height on the torso at (y, az deg) */
function foldField(y, az) {
  const g = 1 - smooth(0.9, 1.26, y);
  if (g <= 0) return 0;
  const a = az * DEG;
  const v = y - 0.9;
  // two sets of slanted ridges; raising them to a power makes narrow folds with calm cloth between
  const w1 = (0.5 + 0.5 * Math.cos(7 * a + 0.9 + 9 * v)) ** 2.2;
  const w2 = (0.5 + 0.5 * Math.cos(12 * a - 1.1 - 13 * v)) ** 2.2;
  const front = Math.abs(((((az + 180) % 360) + 360) % 360) - 180);
  return g * (0.5 + 0.5 * smooth(6, 24, front)) * (0.62 * w1 + 0.38 * w2);
}
/** creases across a tube: 0..1 pull-in at height y (same units as `around`), angle ang (rad) */
function creases(y, ang, around, span, freq, phase) {
  const d = (y - around) / span;
  if (Math.abs(d) >= 1) return 0;
  const win = (1 - d * d) ** 2;
  // strongest on one side of the tube and nearly gone on the other, and slightly slanted
  const side = 0.5 + 0.5 * Math.cos(ang + phase);
  return win * (0.25 + 0.75 * side) * (0.5 + 0.5 * Math.cos(freq * (y - around) + 1.3 * Math.cos(ang + phase * 1.7)));
}

/* ------------------------------------------------------------------ the clothes kit */
/* texture space shared by every torso garment: u = 0.5 + az/360 (front centre at 0.5),
 * v = (y - TV0) / (TV1 - TV0). Canvas helpers K.px(az) / K.py(y) map into a W x H canvas. */
const TV0 = 0.7;
const TV1 = 1.7;

function mk(ctx) {
  const { THREE, A } = ctx;
  const Rt = ctx.torsoRadiusAt;
  const P = profile(ctx);
  const sAt = (y) => table(P.ys, P.ss, y);
  const yAt = (s) => table(P.ss, P.ys, s);
  const K = { ctx, THREE, A, Rt };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const foldAmp = FOLDS;
  /** how far the cloth of the current top stands off its shell at (y, az) */
  K.fold = foldAmp ? (y, az) => foldAmp * foldField(y, az) : () => 0;
  /**
   * Push a lathe's surface in / out: fn(y, ang) -> radial offset in the lathe's own frame
   * (y along its axis, ang around it). Normals are rebuilt and re-joined across the seam.
   */
  K.crumple = (mesh, fn) => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const k = Math.max(0.2, (r + fn(pos.getY(i), Math.atan2(x, z), r)) / r);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const seg = geo.parameters && geo.parameters.segments;
    if (seg) {
      const nor = geo.attributes.normal;
      const n = pos.count / (seg + 1);
      for (let j = 0; j < n; j++) {
        const a = j;
        const b = seg * n + j;
        const v = V(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
        nor.setXYZ(a, v.x, v.y, v.z);
        nor.setXYZ(b, v.x, v.y, v.z);
      }
    }
    geo.computeBoundingSphere();
    return mesh;
  };

  /** y values from y0 to y1 spaced evenly along the torso surface */
  K.rows = (y0, y1, n) => {
    const s0 = sAt(y0), s1 = sAt(y1);
    return Array.from({ length: n + 1 }, (_, i) => yAt(s0 + ((s1 - s0) * i) / n));
  };
  K.lin = (y0, y1, n) => Array.from({ length: n + 1 }, (_, i) => y0 + ((y1 - y0) * i) / n);

  /** torso-space uv (see TV0/TV1) */
  K.uvT = (y, az) => [0.5 + az / 360, (y - TV0) / (TV1 - TV0)];
  K.px = (az, W) => (0.5 + az / 360) * W;
  K.py = (y, H) => (1 - (y - TV0) / (TV1 - TV0)) * H;

  /**
   * Conformal sheet around the torso (or any vertical axis).
   * o: { ys | y0,y1,rows · a0,a1 (deg, number or fn(y)) · inflate · flare(y,az) · r(y,az) radius override ·
   *      dy(y,az,rowFrac) vertical offset · depth (or dz(y)) · cx,cz · thick · cols · uv(y,az) · mat }
   * Without a0/a1 the sheet is a closed loop. thick > 0 adds an inner face + side walls.
   */
  K.sheet = (o) => {
    const ys = o.ys || K.rows(o.y0, o.y1, o.rows || 30);
    const nv = ys.length - 1;
    const nu = o.cols || 64;
    const loop = o.a0 == null && o.a1 == null;
    const fA0 = fnOf(o.a0, -180);
    const fA1 = fnOf(o.a1, 180);
    const depth = o.depth ?? A.torsoDepth;
    const cx = o.cx || 0;
    const cz = o.cz || 0;
    const infl = o.inflate ?? 0.05;
    const rad = o.r || ((y, az) => Rt(y) + infl + (o.flare ? o.flare(y, az) : 0) + K.fold(y, az));
    const th = o.thick || 0;
    const uvf = o.uv || K.uvT;
    const where = (i, j) => {
      const y0 = ys[j];
      const a0 = fA0(y0), a1 = fA1(y0);
      const az = a0 + ((a1 - a0) * i) / nu;
      return [o.dy ? y0 + o.dy(y0, az, j / nv) : y0, az];
    };
    const pt = (y, az, off) => {
      const r = Math.max(0.002, rad(y, az) + off);
      const a = az * DEG;
      return [cx + r * Math.sin(a), y, cz + (o.dz ? o.dz(y) : depth) * r * Math.cos(a)];
    };
    const F = (off) => (i, j) => {
      const [y, az] = where(i, j);
      return { p: pt(y, az, off), uv: uvf(y, az) };
    };
    const g = new GB();
    g.grid(nu, nv, F(th), { closedU: loop });
    if (th > 0) {
      g.grid(nu, nv, F(0), { closedU: loop, flip: true });
      const edge = (list) => g.strip(list.map(([i, j]) => F(th)(i, j)), list.map(([i, j]) => F(0)(i, j)));
      const row = (j) => Array.from({ length: nu + 1 }, (_, i) => [i, j]);
      const col = (i) => Array.from({ length: nv + 1 }, (_, j) => [i, j]);
      edge(row(0));
      edge(row(nv));
      if (!loop) {
        edge(col(0));
        edge(col(nu));
      }
    }
    const m = ctx.mesh(g.build(THREE), o.mat);
    m.userData.pt = pt;
    return m;
  };

  /** point on the torso surface pushed out by infl (+ optional flare(y)) */
  K.tp = (y, az, infl, o) => {
    o = o || {};
    const depth = o.depth ?? A.torsoDepth;
    const r = Rt(y) + infl + (o.flare ? o.flare(y, az) : 0) + K.fold(y, az);
    return V(r * Math.sin(az * DEG), y, depth * r * Math.cos(az * DEG));
  };
  /** frame on the torso surface: { p, q } with local +Z = outward normal, +Y = up the surface */
  K.frame = (y, az, infl, o) => {
    const p = K.tp(y, az, infl, o);
    const tu = K.tp(y, az + 0.5, infl, o).sub(K.tp(y, az - 0.5, infl, o)).normalize();
    const tv = K.tp(y + 0.004, az, infl, o).sub(K.tp(y - 0.004, az, infl, o)).normalize();
    const n = V().crossVectors(tu, tv).normalize();
    const yb = V().crossVectors(n, tu).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tu, yb, n));
    return { p, q, n };
  };
  /** stick obj on the torso surface; o.spin rotates around the normal, o.tilt around local x */
  K.stick = (obj, y, az, infl, o) => {
    o = o || {};
    const f = K.frame(y, az, infl, o);
    obj.position.copy(f.p);
    obj.quaternion.copy(f.q);
    if (o.spin) obj.rotateZ(o.spin);
    if (o.tilt) obj.rotateX(o.tilt);
    return obj;
  };
  /** closed tube around the torso at height y; r(az) radius (number = inflate over the skin) */
  K.loop = (y, r, tube, mat, o) => {
    o = o || {};
    const n = o.n || 72;
    const depth = o.depth ?? A.torsoDepth;
    const rf = typeof r === 'function' ? r : (az) => Rt(y) + r + K.fold(y, az);
    const pts = [];
    for (let k = 0; k < n; k++) {
      const az = -180 + (360 * k) / n;
      const rr = rf(az);
      const yy = y + (o.dy ? o.dy(az) : 0);
      pts.push([rr * Math.sin(az * DEG), yy, rr * Math.cos(az * DEG)]);
    }
    // squash the whole ring (tube cross-section included) like the torso shells, so a hem of
    // inflate i + tube t never reaches further than a shell of inflate i + t anywhere around
    const m = ctx.tube(pts, tube, mat, { closed: true, seg: n * 2, radial: o.radial || 12 });
    m.scale.z = depth;
    return m;
  };
  /** open tube along torso-surface points [[y, az], ...] at inflate infl */
  K.path = (pts, infl, tube, mat, o) => {
    o = o || {};
    return ctx.tube(
      pts.map(([y, az, extra]) => K.tp(y, az, infl + (extra || 0), o)),
      tube,
      mat,
      { seg: o.seg || 40, radial: o.radial || 10, caps: o.caps !== false }
    );
  };

  /* ---------------- arms: lathes in the arm frame (local -Y runs from the shoulder to the hand) */
  K.armInfo = (side) => {
    const sh = ctx.arm.point(side, 0);
    const hd = ctx.arm.point(side, 1);
    const dir = hd.clone().sub(sh);
    const len = dir.length();
    dir.normalize();
    return { sh, hd, dir, len };
  };
  /** lathe profile [[r, y]] in the arm frame (y = -distance from the shoulder), ascending in y */
  K.armLathe = (side, pts, mat, o) => {
    const info = K.armInfo(side);
    // the arm bends: keep rows close enough together along it for the sleeve to follow
    const fine = [];
    pts.forEach((q, i) => {
      if (i) {
        const p0 = pts[i - 1];
        const n = Math.ceil(Math.abs(q[1] - p0[1]) / 0.03);
        for (let k = 1; k < n; k++) fine.push([p0[0] + ((q[0] - p0[0]) * k) / n, p0[1] + ((q[1] - p0[1]) * k) / n]);
      }
      fine.push(q);
    });
    const m = ctx.lathe(fine, mat, { smooth: false, seg: (o && o.seg) || 36 });
    m.quaternion.setFromUnitVectors(V(0, -1, 0), info.dir);
    m.position.copy(info.sh);
    return m;
  };
  /**
   * Sleeve from the shoulder to t1 (0 shoulder .. 1 hand centre), domed at the shoulder, with an inward lip.
   * o: { t1, inflate, flare, puff, mat, lip }
   */
  K.sleeve = (side, o) => {
    const info = K.armInfo(side);
    const L = info.len * o.t1;
    const r0 = A.armRadius + (o.inflate ?? 0.05);
    const rr = (s) => r0 + (o.flare || 0) * Math.pow(s, 1.5) + (o.puff || 0) * Math.sin(Math.PI * Math.min(1, s));
    const re = rr(1);
    const pts = [];
    if (o.lip !== false) pts.push([re - 0.03, -L + 0.05], [re - 0.022, -L - 0.002], [re - 0.008, -L - 0.008]);
    const n = 18;
    for (let k = n; k >= 1; k--) pts.push([rr(k / n), -L * (k / n)]);
    for (let k = 0; k <= 10; k++) {
      const t = (k / 10) * (Math.PI / 2);
      pts.push([r0 * Math.cos(t), r0 * Math.sin(t)]);
    }
    return K.armLathe(side, pts, o.mat);
  };
  /** rounded band (cuff) around the arm between distances d0..d1 (from the shoulder), radius r, thickness th */
  K.armBand = (side, d0, d1, r, th, mat) => K.armLathe(side, K.bandProfile(r - th, r, -d1, -d0), mat);
  /** CCW rounded-rectangle profile (ri..ro, y0..y1) for lathes: bands, cuffs, soles */
  K.bandProfile = (ri, ro, y0, y1, rad) => {
    rad = Math.min(rad ?? (ro - ri) * 0.5, (ro - ri) * 0.5, (y1 - y0) * 0.5);
    const pts = [];
    const arc = (cx, cy, a0, a1) => {
      for (let k = 0; k <= 5; k++) {
        const a = a0 + ((a1 - a0) * k) / 5;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
    };
    pts.push([ri, y0 + rad]);
    arc(ri + rad, y0 + rad, Math.PI, Math.PI * 1.5);
    arc(ro - rad, y0 + rad, -Math.PI / 2, 0);
    arc(ro - rad, y1 - rad, 0, Math.PI / 2);
    arc(ri + rad, y1 - rad, Math.PI / 2, Math.PI);
    pts.push([ri, y0 + rad]);
    return pts;
  };

  /* ---------------- legs: lathes around a vertical axis through the hip (local y relative to the hip) */
  K.legLathe = (side, pts, mat, o) => {
    o = o || {};
    const hip = side === 'L' ? A.hipL : A.hipR;
    const s = side === 'L' ? -1 : 1;
    const m = ctx.lathe(pts, mat, { smooth: false, seg: o.seg || 40 });
    m.position.set(hip[0] + s * (o.dx || 0), hip[1], hip[2]);
    m.rotation.z = s * (o.splay || 0);
    if (o.depth) m.scale.z = o.depth;
    return m;
  };
  /**
   * Pant leg from inside the seat down to yHem. r(y) radius at world height y.
   * Profile: inner lip at the hem, outer surface, closed dome at the top (hidden in the seat).
   */
  K.pantLeg = (side, o) => {
    const hipY = (side === 'L' ? A.hipL : A.hipR)[1];
    const yTop = o.yTop ?? 1.0;
    const yHem = o.yHem;
    const r = o.r;
    const pts = [];
    const rh = r(yHem);
    if (o.lip !== false) pts.push([rh - 0.03, yHem + 0.05], [rh - 0.022, yHem - 0.002], [rh - 0.008, yHem - 0.008]);
    const n = o.n || 24;
    for (let k = 0; k <= n; k++) {
      const y = yHem + ((yTop - yHem) * k) / n;
      pts.push([r(y), y]);
    }
    const rt = r(yTop);
    pts.push([rt * 0.7, yTop + rt * 0.5], [0.001, yTop + rt * 0.7]);
    return K.legLathe(side, pts.map(([rr, y]) => [rr, y - hipY]), o.mat, o);
  };

  /* ---------------- shoes: superellipsoid "blob" along +Z (heel -> toe) */
  /**
   * o: { cx, cz, len (half length), W(zn), yb(zn), yt(zn) (bottom / top heights), n (cross-section
   *      squareness, 2 = ellipse), pHeel, pToe (plan roundness), nu, nv, u0,u1 (partial ring), v0,v1 }
   * zn runs -1 (heel) .. +1 (toe). Returns a mesh; mesh.userData.P(u, zn) gives surface points.
   */
  K.blob = (o, mat) => {
    const nu = o.nu || 40;
    const nv = o.nv || 32;
    const q = 2 / (o.n ?? 3);
    const sp = (c) => Math.sign(c) * Math.pow(Math.abs(c), q);
    const env = (zn) => {
      const p = zn < 0 ? o.pHeel ?? 2.6 : o.pToe ?? 2.2;
      return Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(zn)), p)), 1 / p);
    };
    const Pt = (u, zn, grow = 0) => {
      const ph = u * Math.PI * 2;
      const e = env(zn);
      const yb = o.yb(zn);
      const yt = o.yt(zn);
      const ym = (yb + yt) / 2;
      const hh = (yt - yb) / 2;
      return [o.cx + sp(Math.cos(ph)) * (e * o.W(zn) + grow), ym + sp(Math.sin(ph)) * (e * hh + grow), o.cz + zn * (o.len + grow)];
    };
    const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1;
    const v0 = o.v0 ?? 0, v1 = o.v1 ?? 1;
    const full = u0 === 0 && u1 === 1;
    const znOf = (v) => -Math.cos(Math.PI * v);
    const g = new GB();
    g.grid(
      nu,
      nv,
      (i, j) => {
        const u = u0 + ((u1 - u0) * i) / nu;
        const v = v0 + ((v1 - v0) * j) / nv;
        return { p: Pt(u, znOf(v), o.grow || 0), uv: [u, v] };
      },
      { closedU: full, pole0: full && v0 === 0, pole1: full && v1 === 1 }
    );
    const m = ctx.mesh(g.build(THREE), mat);
    m.userData.P = Pt;
    return m;
  };

  /** canvas texture helper */
  K.canvas = (w, h, draw, o) => ctx.tex.canvas(w, h, draw, o);
  /** fabric with a full-colour map (material colour white), sheen tinted from base */
  K.fabric = (base, map, o) => {
    o = o || {};
    const p = {
      color: new THREE.Color('#ffffff'),
      map,
      roughness: o.roughness ?? 0.82,
      sheen: o.sheen ?? 0.55,
      sheenColor: new THREE.Color(C.light(base, 0.55)),
      sheenRoughness: 0.55,
      side: THREE.DoubleSide,
    };
    if (o.bump) {
      p.bumpMap = o.bump;
      p.bumpScale = o.bumpScale ?? 1;
    }
    // the map carries the colour, so the shade is the neutral one; the pattern survives in it
    return ctx.mat.clothify(ctx.mat.custom(p), '#ffffff');
  };

  /**
   * Flat strap lying on the torso along control points [[y, az], ...] (smoothly interpolated).
   * o: { inflate, w (width), thick, mat, n, flare }
   */
  K.ribbon = (ctrl, o) => {
    const curve = new THREE.SplineCurve(ctrl.map(([y, az]) => new THREE.Vector2(az, y)));
    const n = o.n || 40;
    const pts = curve.getPoints(n);
    const infl = o.inflate ?? 0.1;
    const th = o.thick ?? 0.014;
    const w = o.w ?? 0.06;
    const centers = pts.map((p) => K.frame(p.y, p.x, infl, o));
    const g = new GB();
    const side = [];
    for (let k = 0; k <= n; k++) {
      const a = centers[Math.max(0, k - 1)].p;
      const b = centers[Math.min(n, k + 1)].p;
      const t = b.clone().sub(a).normalize();
      side.push(V().crossVectors(t, centers[k].n).normalize());
    }
    // edges are projected back onto the inflated torso so the strap hugs strongly curved spots (shoulder dome)
    const depth = o.depth ?? A.torsoDepth;
    const at = (k, s, off) => {
      if (!s) return centers[k].p.clone().addScaledVector(centers[k].n, off);
      const q = centers[k].p.clone().addScaledVector(side[k], s * w * 0.5);
      const f = K.frame(q.y, Math.atan2(q.x, q.z / depth) / DEG, infl, o);
      return f.p.addScaledVector(f.n, off);
    };
    const F = (off) => (i, k) => ({ p: at(k, -1 + i, off).toArray(), uv: [i / 2, k / n] });
    g.grid(2, n, F(th));
    g.grid(2, n, F(0), { flip: true });
    const edgeA = (i) => Array.from({ length: n + 1 }, (_, k) => k).map((k) => F(th)(i, k));
    const edgeB = (i) => Array.from({ length: n + 1 }, (_, k) => k).map((k) => F(0)(i, k));
    g.strip(edgeA(0), edgeB(0));
    g.strip(edgeA(2), edgeB(2));
    g.strip([F(th)(0, 0), F(th)(1, 0), F(th)(2, 0)], [F(0)(0, 0), F(0)(1, 0), F(0)(2, 0)]);
    g.strip([F(th)(0, n), F(th)(1, n), F(th)(2, n)], [F(0)(0, n), F(0)(1, n), F(0)(2, n)]);
    return ctx.mesh(g.build(THREE), o.mat);
  };

  /** rewrite a lathe's uv.v from its local y (v = 0 at y0 .. 1 at y1) */
  K.uvByY = (mesh, y0, y1) => {
    const pos = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0));
    uv.needsUpdate = true;
    return mesh;
  };

  /** small cute bow facing +Z (size ~ width/2), knot at the origin */
  K.bow = (mat, s, o) => {
    o = o || {};
    const g = ctx.group();
    [-1, 1].forEach((k) => {
      const loop = ctx.ellipsoid(0.62 * s, 0.4 * s, 0.22 * s, mat, { seg: 24 });
      loop.position.set(k * 0.55 * s, 0.04 * s, 0);
      loop.rotation.z = k * -0.28;
      g.add(loop);
      if (o.tails !== false) {
        const tail = ctx.capsule([k * 0.12 * s, -0.1 * s, 0.02 * s], [k * 0.42 * s, -0.95 * s, -0.02 * s], 0.16 * s, mat, { seg: 12 });
        tail.scale.z = 0.6;
        g.add(tail);
      }
    });
    g.add(ctx.sphere(0.26 * s, mat, { pos: [0, 0, 0.06 * s], seg: 20 }));
    return g;
  };
  return K;
}

/* ------------------------------------------------------------------ shared garment pieces */
const NECK_Y = 1.598;
const TOP = 0.05; // top shell inflate
const OUTER = 0.08; // outerwear shell inflate
const wrapAz = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** thread colour for seams on a garment made of `mat`: a touch deeper; patterned cloth keeps its own */
function seamMat(K, mat) {
  if (!mat || !mat.color || mat.map) return mat;
  return K.ctx.mat.cloth(deeper('#' + mat.color.getHexString(), 0.17), { grain: false });
}
/** standard torso shell for tops: hem at y0, closes into the neck. A stitch line runs above the hem. */
function topShell(K, o) {
  const shell = topSheet(K, o);
  if (o.seams === false || !K.ctx.is3D) return shell;
  const infl = o.inflate ?? TOP;
  const ys = o.y0 + 0.042;
  const stitch = K.loop(ys, (az) => K.Rt(ys) + infl + (o.flare ? o.flare(ys, az) : 0) + K.fold(ys, az) + 0.0015, 0.0034, seamMat(K, o.mat), { radial: 8 });
  return K.ctx.group(shell, stitch);
}
function topSheet(K, o) {
  return K.sheet({
    y0: o.y0,
    y1: o.y1 ?? K.A.torsoTop,
    rows: o.rows || 34,
    cols: o.cols || 64,
    inflate: o.inflate ?? TOP,
    flare: o.flare,
    dy: o.dy,
    mat: o.mat,
    uv: o.uv,
    a0: o.a0,
    a1: o.a1,
  });
}
/** soft roll around the neck (crew neck / mock neck) */
function crewNeck(K, mat, o) {
  o = o || {};
  const t = K.ctx.torus(o.R ?? 0.176, o.tube ?? 0.034, mat, { radial: 12, tubular: 48 });
  t.rotation.x = Math.PI / 2;
  t.position.y = o.y ?? NECK_Y - 0.004;
  return t;
}
/** both sleeves: o = { t1, inflate, flare, puff, mat, cuff: { len, th, grow, mat }, extra(side) } */
function sleeves(K, o) {
  const one = (side) => {
    const sl = K.sleeve(side, o);
    const L = K.armInfo(side).len * o.t1;
    // long sleeves: creases at the elbow, a little stacking above the cuff
    if (L > 0.3 && o.folds !== false) {
      const ph = side === 'L' ? 0.6 : 2.3;
      const elbow = -K.armInfo(side).len * 0.5;
      K.crumple(sl, (y, ang) => -0.02 * creases(y, ang, elbow, 0.1, 62, ph) - 0.014 * creases(y, ang, -L + 0.085, 0.07, 80, ph + 2));
    }
    const g = K.ctx.group(sl);
    // armhole seam: a fine raised ring where the sleeve is set into the body
    if (o.seams !== false) {
      const r0 = K.A.armRadius + (o.inflate ?? 0.05);
      g.add(K.armBand(side, 0.052, 0.063, r0 + 0.0045 + (o.puff || 0) * 0.25, 0.009, seamMat(K, o.mat)));
    }
    const rEnd = K.A.armRadius + (o.inflate ?? TOP) + (o.flare || 0);
    if (o.cuff) {
      const cu = o.cuff;
      g.add(K.armBand(side, L - (cu.len ?? 0.07), L + 0.006, rEnd + (cu.grow ?? 0.008), cu.th ?? 0.03, cu.mat || o.mat));
    }
    if (o.extra) g.add(o.extra(side, L, rEnd));
    return g;
  };
  return { armL: one('L'), armR: one('R') };
}
/** ribbed band (hem) between y0..y1 hugging the torso, with a rounded lower edge */
function ribHem(K, y0, y1, infl, mat) {
  return K.ctx.group(K.sheet({ y0, y1, rows: 6, inflate: infl, thick: 0.012, mat }), K.loop(y0 + 0.004, infl + 0.006, 0.0125, mat));
}
/** vertical rib texture (grey levels, multiplies the material colour) */
function ribTex(K, n, dark) {
  const d = Math.round(255 * (dark ?? 0.8));
  return K.canvas(512, 16, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(i * s, 0, (i + 1) * s, 0);
      grd.addColorStop(0, `rgb(${d},${d},${d})`);
      grd.addColorStop(0.5, '#ffffff');
      grd.addColorStop(1, `rgb(${d},${d},${d})`);
      g.fillStyle = grd;
      g.fillRect(i * s, 0, s + 0.5, h);
    }
  });
}
/** chunky knit with cables on the front and back (grey levels) */
function cableTex(K) {
  return K.canvas(1024, 512, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 11) {
      g.fillStyle = 'rgba(0,0,0,0.09)';
      g.fillRect(x, 0, 3, h);
    }
    const cable = (cx) => {
      const cw = 30;
      const per = 22;
      g.fillStyle = 'rgb(120,120,120)';
      g.fillRect(cx - cw / 2 - 3, 0, cw + 6, h);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(cx - cw / 2 - 9, 0, 4, h);
      g.fillRect(cx + cw / 2 + 5, 0, 4, h);
      for (let y = -per; y < h + per; y += per) {
        g.save();
        g.translate(cx, y);
        g.rotate(-0.62);
        const grd = g.createLinearGradient(0, -10, 0, 10);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.55, 'rgb(236,236,236)');
        grd.addColorStop(1, 'rgb(150,150,150)');
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(0, 0, cw * 0.66, 10, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    };
    [-32, 0, 32, 148, 180, 212].forEach((az) => {
      const x = K.px(az, w);
      cable(x);
      if (x > w - 40) cable(x - w);
    });
  });
}
/** shirt collar: a band around the neck + two pointed flaps on the chest */
function shirtCollar(K, mat, o) {
  o = o || {};
  const ctx = K.ctx;
  const g = ctx.group();
  g.add(ctx.lathe(K.bandProfile(0.142, 0.172, 1.565, 1.634, 0.012), mat, { smooth: false, seg: 40 }));
  const infl = (o.inflate ?? TOP) + 0.008;
  const k = o.scale ?? 1;
  [-1, 1].forEach((s) => {
    const sh = ctx.shape();
    if (o.round) {
      // peter-pan: rounded lobe
      sh.moveTo(0.006 * s * k, 0.055 * k);
      sh.lineTo(0.11 * s * k, 0.05 * k);
      sh.bezierCurveTo(0.15 * s * k, -0.01 * k, 0.1 * s * k, -0.09 * k, 0.034 * s * k, -0.068 * k);
      sh.bezierCurveTo(0.006 * s * k, -0.056 * k, 0.0, -0.02 * k, 0.006 * s * k, 0.055 * k);
    } else {
      const P = [[0.006, 0.062], [0.118, 0.058], [0.106, -0.002], [0.026, -0.086]];
      P.forEach(([x, y], i) => (i ? sh.lineTo(x * s * k, y * k) : sh.moveTo(x * s * k, y * k)));
      sh.lineTo(P[0][0] * s * k, P[0][1] * k);
    }
    const flap = ctx.extrude(sh, 0.014, mat, { bevel: 0.009, curveSegments: 16 });
    g.add(K.stick(ctx.group(flap), o.y ?? 1.52, 0, infl, { tilt: o.tilt ?? -0.12 }));
  });
  return g;
}
function tieColors(c) {
  const tie = lum(c) > 0.5 ? C.mix('#2c3b6a', c, 0.18) : C.mix('#cf4b4f', c, 0.22);
  return { tie, stripe: C.mix(tie, '#f6e7bd', 0.62) };
}
/** small pine tree emblem (extruded), centred at the origin facing +Z */
function pineEmblem(ctx, mat, s) {
  const sh = ctx.shape();
  const P = [
    [0, 1], [0.45, 0.35], [0.22, 0.38], [0.6, -0.2], [0.12, -0.2], [0.12, -0.55],
    [-0.12, -0.55], [-0.12, -0.2], [-0.6, -0.2], [-0.22, 0.38], [-0.45, 0.35],
  ];
  P.forEach(([x, y], i) => (i ? sh.lineTo(x * s, y * s) : sh.moveTo(x * s, y * s)));
  sh.lineTo(0, s);
  return ctx.extrude(sh, 0.006, mat, { bevel: 0.004, curveSegments: 4 });
}
/** open-front outer shell; gap(y) = half-angle of the front opening; armhole(y) = half-angle of side holes */
function openShell(K, o) {
  const ys = o.ys || K.rows(o.y0, o.y1 ?? K.A.torsoTop, o.rows || 34);
  const base = { ys, inflate: o.inflate, flare: o.flare, mat: o.mat, dy: o.dy };
  const gap = o.gap;
  if (!o.armhole) return [K.sheet({ ...base, cols: 72, a0: gap, a1: (y) => 360 - gap(y) })];
  const ah = o.armhole;
  return [
    K.sheet({ ...base, cols: 22, a0: gap, a1: (y) => 90 - ah(y) }),
    K.sheet({ ...base, cols: 36, a0: (y) => 90 + ah(y), a1: (y) => 270 - ah(y) }),
    K.sheet({ ...base, cols: 22, a0: (y) => 270 + ah(y), a1: (y) => 360 - gap(y) }),
  ];
}

/* skirt shapes (bottoms) — shared so the apron and the dress always cover them.
 * Skirts hug the body (under every top) down to y ~0.9 and only then flare out. */
const SK = {
  depth: 0.86,
  pleatsH: 0.57,
  pleatsN: 26,
  pleats(K, y, az) {
    const base = Math.max(K.Rt(y) + 0.028, 0.43 + 0.36 * Math.max(0, 0.9 - y));
    return base + 0.022 * smooth(0.84, 0.66, y) * tri01((az / 360) * SK.pleatsN + 0.25);
  },
  alineH: 0.27,
  aline(K, y, az) {
    const base = Math.max(K.Rt(y) + 0.028, 0.43 + 0.2 * Math.pow(Math.max(0, 0.9 - y), 1.05));
    return base + 0.011 * Math.cos(az * DEG * 7) * smooth(0.86, 0.4, y);
  },
  /** largest radius any skirt reaches at height y */
  env(K, y) {
    let r = 0;
    if (y >= SK.pleatsH - 0.01) r = Math.max(r, SK.pleats(K, y, 0) + 0.024);
    if (y >= SK.alineH - 0.01) r = Math.max(r, SK.aline(K, y, 0) + 0.012);
    return r;
  },
};

/* ================================================================== TOPS */
CC.register('top', [
  /* ---------------------------------------------------------------- basic tee */
  {
    id: 'tee',
    name: '기본 티셔츠',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c);
      const rib = ctx.mat.cloth(deeper(c, 0.07), { map: ribTex(K, 64, 0.8) });
      const y0 = 0.89;
      const flare = (y) => 0.012 * (1 - smooth(y0, 1.12, y));
      const body = ctx.group(topShell(K, { y0, mat: m, flare }), K.loop(y0, TOP + 0.012, 0.022, m), crewNeck(K, rib));
      return { body, ...sleeves(K, { t1: 0.4, flare: 0.022, mat: m, cuff: { len: 0.045, th: 0.022, grow: 0.006, mat: rib } }) };
    },
  },
  /* ---------------------------------------------------------------- office shirt + tie */
  {
    id: 'shirt',
    name: '셔츠 & 넥타이',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.7, sheen: 0.4 });
      const trim = ctx.mat.cloth(brighter(c, 0.1), { roughness: 0.7, sheen: 0.4 });
      const y0 = 0.89;
      const flare = (y) => 0.01 * (1 - smooth(y0, 1.06, y));
      const body = ctx.group(topShell(K, { y0, mat: m, flare }), K.loop(y0, TOP + 0.01, 0.02, m));
      // placket + buttons
      body.add(K.sheet({ y0: y0 + 0.004, y1: 1.5, rows: 24, cols: 4, a0: -3.4, a1: 3.4, inflate: TOP + 0.001, flare, thick: 0.008, mat: trim }));
      const btn = ctx.mat.plastic(contrast(c, 0.12), { roughness: 0.3 });
      [0.94, 1.02].forEach((y) => body.add(K.stick(ctx.ellipsoid(0.019, 0.019, 0.009, btn, { seg: 16 }), y, 0, TOP + 0.01, { flare })));
      body.add(shirtCollar(K, trim));
      // necktie
      const { tie, stripe } = tieColors(c);
      const tb = 1.075;
      const tt = 1.49;
      const tw = (y) => (7.6 - 2.6 * ((y - tb) / (tt - tb))) * Math.min(1, (y - tb) / 0.05 + 0.03);
      const map = K.canvas(128, 448, (g, w, h) => {
        g.fillStyle = tie;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = stripe;
        g.lineWidth = 13;
        for (let k = -12; k < 16; k++) {
          g.beginPath();
          g.moveTo(k * 46, 0);
          g.lineTo(k * 46 + h, h);
          g.stroke();
        }
      });
      const tieMat = K.fabric(tie, map, { roughness: 0.5, sheen: 0.3 });
      body.add(
        K.sheet({ y0: tb, y1: tt, rows: 28, cols: 6, a0: (y) => -tw(y), a1: tw, inflate: TOP + 0.009, flare, thick: 0.016, mat: tieMat, uv: (y, az) => [0.5 + az / 16, (y - tb) / (tt - tb)] })
      );
      const ks = ctx.shape();
      [[-0.042, 0.03], [0.042, 0.03], [0.026, -0.03], [-0.026, -0.03]].forEach(([x, y], i) => (i ? ks.lineTo(x, y) : ks.moveTo(x, y)));
      ks.lineTo(-0.042, 0.03);
      const knot = ctx.extrude(ks, 0.03, ctx.mat.cloth(tie, { roughness: 0.5, sheen: 0.3 }), { bevel: 0.012, curveSegments: 4 });
      body.add(K.stick(knot, 1.5, 0, TOP + 0.03, { tilt: 0.1 }));
      // chest pocket with a pen (wearer's left = viewer's right)
      body.add(K.sheet({ y0: 1.17, y1: 1.31, rows: 6, cols: 6, a0: 18, a1: 36, inflate: TOP + 0.001, thick: 0.009, mat: m }));
      body.add(K.path([[1.31, 17.6], [1.31, 36.4]], TOP + 0.006, 0.006, trim, { seg: 8 }));
      const pen = ctx.mat.plastic('#3d5fa8');
      // pen tucked in the pocket (stays under 0.09 so overall bibs cover it)
      body.add(ctx.capsule(K.tp(1.24, 24, TOP + 0.016), K.tp(1.36, 23, TOP + 0.021), 0.015, pen, { seg: 12 }));
      body.add(ctx.sphere(0.016, ctx.mat.plastic('#f4f1ea'), { pos: K.tp(1.37, 23, TOP + 0.022), seg: 12 }));
      return { body, ...sleeves(K, { t1: 0.8, flare: 0.006, mat: m, cuff: { len: 0.085, th: 0.026, grow: 0.006, mat: trim } }) };
    },
  },
  /* ---------------------------------------------------------------- hoodie */
  {
    id: 'hoodie',
    name: '후드티',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.88 });
      const rib = ctx.mat.cloth(deeper(c, 0.05), { map: ribTex(K, 80, 0.82), roughness: 0.9 });
      const lining = ctx.mat.cloth(deeper(c, 0.2));
      const cord = ctx.mat.cloth(whiteOn(c), { roughness: 0.6 });
      const tip = ctx.mat.plastic(contrast(c, 0.35));
      const IN = 0.052;
      const flare = (y) => 0.004 + 0.02 * (1 - smooth(0.86, 1.15, y));
      const body = ctx.group(topShell(K, { y0: 0.86, inflate: IN, flare, mat: m }), ribHem(K, 0.8, 0.874, IN + 0.01, rib));
      // hood lying on the upper back: a soft U-shaped pouch that tucks under the neck roll
      const hY0 = 1.17;
      const hY1 = 1.585;
      const hw = (y) => 2 + 70 * Math.pow(Math.max(0, 1 - Math.pow((hY1 - y) / (hY1 - hY0), 2.4)), 0.55);
      const bulge = (y, az) => {
        const u = Math.min(1, Math.abs(wrapAz(az - 180)) / hw(y));
        const v = (y - hY0) / (hY1 - hY0);
        const along = Math.sin((Math.PI / 2) * Math.min(1, v / 0.5)) * (1 - 0.22 * smooth(0.55, 1, v));
        return 0.004 + 0.085 * Math.pow(1 - u * u, 0.6) * along;
      };
      const hoodR = (y, az) => K.Rt(y) + IN + flare(y) + bulge(y, az);
      body.add(K.sheet({ ys: K.rows(hY0, hY1, 22), cols: 30, a0: (y) => 180 - hw(y), a1: (y) => 180 + hw(y), r: hoodR, thick: 0.012, mat: m }));
      // centre seam down the hood
      const seamPts = K.lin(hY0 + 0.05, hY1 - 0.02, 10).map((y) => {
        const r = hoodR(y, 180) + 0.012;
        return [0, y, -K.A.torsoDepth * r];
      });
      body.add(ctx.tube(seamPts, 0.0075, lining, { seg: 24, radial: 8, caps: true }));
      // thick rolled hood edge around the neck (fuller at the back where the hood gathers)
      const rimPts = [[1.47, 13], [1.54, 34], [1.578, 70], [1.587, 115], [1.582, 155], [1.58, 180], [1.582, 205], [1.587, 245], [1.578, 290], [1.54, 326], [1.47, 347]];
      body.add(K.path(rimPts, IN + 0.05, (t) => 0.024 + 0.034 * Math.pow(Math.sin(Math.PI * t), 0.7), m, { seg: 64, radial: 14 }));
      // drawstrings
      [-1, 1].forEach((s) => {
        body.add(K.path([[1.5, s * 8.5], [1.41, s * 10], [1.3, s * 11]], IN + 0.012, 0.011, cord, { seg: 16 }));
        body.add(ctx.capsule(K.tp(1.3, s * 11, IN + 0.012), K.tp(1.255, s * 11.3, IN + 0.012), 0.017, tip, { seg: 12 }));
      });
      // kangaroo pocket
      // (kept within 0.09 of the skin so overalls, at 0.092, cover it)
      const pa = (y) => 33 - 10 * smooth(0.9, 1.13, y);
      body.add(K.sheet({ y0: 0.895, y1: 1.13, rows: 10, cols: 16, a0: (y) => -pa(y), a1: pa, inflate: IN + 0.002, flare, thick: 0.011, mat: m }));
      [-1, 1].forEach((s) => body.add(K.path([[0.9, s * 33.2], [1.0, s * 29.5], [1.126, s * 23.2]], IN + 0.006, 0.0065, lining, { flare, seg: 12 })));
      return { body, ...sleeves(K, { t1: 0.79, inflate: IN, puff: 0.012, flare: 0.004, mat: m, cuff: { len: 0.08, th: 0.028, grow: 0.002, mat: rib } }) };
    },
  },
  /* ---------------------------------------------------------------- chunky cable knit */
  {
    id: 'knit',
    name: '꽈배기 니트',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const tex = cableTex(K);
      const knit = (map, bump) =>
        ctx.mat.custom({
          color: new ctx.THREE.Color(c),
          map,
          bumpMap: map,
          bumpScale: bump,
          roughness: 0.95,
          sheen: 0.8,
          sheenColor: new ctx.THREE.Color(C.light(c, 0.55)),
          sheenRoughness: 0.6,
          side: ctx.THREE.DoubleSide,
        });
      const m = knit(tex, 2.2);
      const rt = ribTex(K, 96, 0.76);
      const rib = knit(rt, 1.5);
      const sl = knit(ribTex(K, 40, 0.84), 1.2);
      const IN = 0.056;
      const flare = (y) => 0.006 + 0.016 * (1 - smooth(0.86, 1.2, y));
      const body = ctx.group(
        topShell(K, { y0: 0.86, inflate: IN, flare, mat: m }),
        ribHem(K, 0.79, 0.872, IN + 0.012, rib),
        crewNeck(K, rib, { R: 0.172, tube: 0.046, y: 1.587 })
      );
      return { body, ...sleeves(K, { t1: 0.78, inflate: IN + 0.004, puff: 0.02, mat: sl, cuff: { len: 0.1, th: 0.03, grow: 0.0, mat: rib } }) };
    },
  },
  /* ---------------------------------------------------------------- cardigan over a white tee */
  {
    id: 'cardigan',
    name: '가디건',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      // cream tee under everything but near-white / cream knits, which get a soft slate tee
      const teeC = lum(c) > 0.86 ? '#66708a' : CREAM;
      const tee = ctx.mat.cloth(teeC);
      const knit = ctx.mat.cloth(c, { map: ribTex(K, 150, 0.88), roughness: 0.9, sheen: 0.75 });
      const trim = ctx.mat.cloth(deeper(c, 0.08), { map: ribTex(K, 60, 0.8), roughness: 0.9 });
      const btn = ctx.mat.plastic(contrast(c, 0.32), { roughness: 0.28 });
      const IN = 0.078;
      const y0 = 0.835;
      const flare = (y) => (y < 0.96 ? 0.55 * (K.Rt(0.96) - K.Rt(y)) : 0) + 0.006 * (1 - smooth(0.84, 1.1, y));
      const gap = (y) => 24 * Math.pow(smooth(1.16, 1.6, y), 0.8);
      const body = ctx.group(topShell(K, { y0: 0.88, mat: tee }), crewNeck(K, tee, { tube: 0.03 }));
      openShell(K, { y0, gap, inflate: IN, flare, mat: knit }).forEach((s) => body.add(s));
      // front bands running up and around the back of the neck
      const ys = K.lin(y0 + 0.004, 1.59, 16);
      const edge = (s) => ys.map((y) => [y, s * (gap(y) + 1.6)]);
      const band = [...edge(1), [1.598, 60], [1.6, 120], [1.6, 180], [1.6, 240], [1.598, 300], ...edge(-1).reverse()];
      body.add(K.path(band, IN + 0.01, 0.02, trim, { seg: 120, radial: 10, flare }));
      body.add(K.loop(y0 + 0.004, IN + flare(y0) + 0.006, 0.02, trim));
      [0.93, 1.02, 1.11].forEach((y) => body.add(K.stick(ctx.ellipsoid(0.024, 0.024, 0.012, btn, { seg: 16 }), y, 0, IN + 0.03, { flare })));
      // patch pockets
      [-1, 1].forEach((s) => {
        const a0 = s > 0 ? 17 : -38;
        body.add(K.sheet({ y0: 0.875, y1: 0.99, rows: 6, cols: 8, a0, a1: a0 + 21, inflate: IN + 0.002, flare, thick: 0.012, mat: knit }));
        body.add(K.path([[0.99, a0 - 0.4], [0.99, a0 + 21.4]], IN + 0.012, 0.012, trim, { flare, seg: 10 }));
      });
      body.userData.ccOveralls = 'jacket'; // overalls go under this top
      return { body, ...sleeves(K, { t1: 0.79, inflate: 0.074, puff: 0.01, flare: 0.004, mat: knit, cuff: { len: 0.075, th: 0.03, grow: 0.002, mat: trim } }) };
    },
  },
  /* ---------------------------------------------------------------- blazer / suit jacket */
  {
    id: 'blazer',
    name: '정장 재킷',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.62, sheen: 0.35 });
      const lapM = ctx.mat.cloth(lum(c) < 0.12 ? C.light(c, 0.1) : C.shade(c, 0.1), { roughness: 0.5, sheen: 0.45 });
      const shirtC = lum(c) > 0.8 ? '#dfe8f3' : CREAM;
      const shirt = ctx.mat.cloth(shirtC, { roughness: 0.7 });
      const btn = ctx.mat.plastic(lum(c) > 0.3 ? C.shade(c, 0.6) : C.light(c, 0.35), { roughness: 0.25 });
      const IN = OUTER;
      const y0 = 0.8;
      // hangs straight from the waist like a tailored jacket
      const flare = (y) => (y < 0.97 ? 0.85 * (K.Rt(0.97) - K.Rt(y)) : 0) + 0.006 * (1 - smooth(0.8, 1.02, y));
      const gap = (y) => (y < 1.04 ? 0 : 23 * Math.pow(smooth(1.04, 1.58, y), 0.75));
      const dy = (y, az, f) => {
        const a = Math.abs(wrapAz(az));
        return a < 34 ? 0.06 * Math.pow(1 - a / 34, 1.6) * Math.pow(1 - f, 4) : 0;
      };
      const body = ctx.group(topShell(K, { y0: 0.9, mat: shirt }), shirtCollar(K, shirt, { y: 1.525 }));
      openShell(K, { y0, gap, inflate: IN, flare, mat: m, dy, rows: 36 }).forEach((s) => body.add(s));
      // lapels
      const lw = (y) => {
        const up = smooth(1.04, 1.36, y) * 17;
        const notch = 1 - 0.55 * Math.exp(-Math.pow((y - 1.425) / 0.018, 2));
        return Math.max(0.6, up * notch * (1 - 0.3 * smooth(1.46, 1.58, y)));
      };
      [-1, 1].forEach((s) => {
        const a0 = (y) => (s > 0 ? gap(y) : -(gap(y) + lw(y)));
        const a1 = (y) => (s > 0 ? gap(y) + lw(y) : -gap(y));
        body.add(K.sheet({ y0: 1.04, y1: 1.585, rows: 30, cols: 6, a0, a1, inflate: IN + 0.002, flare, thick: 0.021, mat: lapM }));
      });
      body.add(K.path([[1.57, 33], [1.598, 70], [1.603, 120], [1.603, 180], [1.603, 240], [1.598, 290], [1.57, 327]], IN + 0.006, 0.028, lapM, { seg: 48 }));
      // buttons
      [0.95, 1.025].forEach((y) => body.add(K.stick(ctx.ellipsoid(0.026, 0.026, 0.012, btn, { seg: 16 }), y, 0, IN + 0.012, { flare })));
      // pocket flaps + breast welt with a pocket square
      [-1, 1].forEach((s) => {
        const a0 = s > 0 ? 19 : -42;
        body.add(K.sheet({ y0: 0.905, y1: 0.95, rows: 3, cols: 8, a0, a1: a0 + 23, inflate: IN + 0.002, flare, thick: 0.016, mat: m }));
      });
      body.add(K.sheet({ y0: 1.235, y1: 1.262, rows: 2, cols: 6, a0: 19, a1: 35, inflate: IN + 0.001, thick: 0.012, mat: lapM }));
      const sq = ctx.mat.cloth(lum(c) > 0.55 ? C.mix('#d94a4a', c, 0.2) : C.mix('#f3e2b3', c, 0.15), { roughness: 0.6 });
      [[21.5, 0.014], [25.5, 0.026], [29.5, 0.012]].forEach(([az, h]) => {
        const p = ctx.cone(K.tp(1.255, az, IN + 0.008), K.tp(1.255 + 0.03 + h, az + 0.5, IN + 0.008), 0.016, sq, { seg: 10 });
        p.scale.set(1, 1, 0.5);
        body.add(p);
      });
      const extra = (side, L) => K.armBand(side, L - 0.04, L + 0.03, 0.158, 0.022, shirt);
      body.userData.ccOveralls = 'jacket'; // overalls go under this top
      return { body, ...sleeves(K, { t1: 0.78, inflate: IN, flare: 0.006, mat: m, extra }) };
    },
  },
  /* ---------------------------------------------------------------- marine stripes */
  {
    id: 'stripe',
    name: '마린 줄무늬 티',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const lightBase = lum(c) > 0.72;
      const base = lightBase ? c : CREAM;
      const ink = lightBase ? C.mix(c, '#2a3c70', 0.78) : c;
      const y0 = 0.89;
      const yEnd = 1.38;
      const per = 0.064;
      const tex = K.canvas(16, 1024, (g, w, h) => {
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        g.fillStyle = ink;
        for (let y = y0 + per * 0.55; y < yEnd; y += per) {
          const a = K.py(y + per * 0.22, h);
          const b = K.py(y - per * 0.22, h);
          g.fillRect(0, a, w, b - a);
        }
      });
      const m = K.fabric(base, tex);
      const plain = ctx.mat.cloth(base);
      const flare = (y) => 0.012 * (1 - smooth(y0, 1.12, y));
      const body = ctx.group(topShell(K, { y0, mat: m, flare }), K.loop(y0, TOP + 0.012, 0.021, plain), crewNeck(K, plain, { R: 0.19, tube: 0.026 }));
      const t1 = 0.62;
      const L = K.armInfo('R').len * t1;
      const n = Math.round(L / per);
      const stex = K.canvas(16, 512, (g, w, h) => {
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        g.fillStyle = ink;
        for (let k = 0; k < n - 1; k++) {
          const v = (k + 0.75) / n;
          g.fillRect(0, (1 - v - 0.22 / n) * h, w, (0.44 / n) * h);
        }
      });
      const sm = K.fabric(base, stex);
      const one = (side) => {
        const s = K.sleeve(side, { t1, flare: 0.012, mat: sm });
        K.uvByY(s, -L, 0);
        return ctx.group(s, K.armBand(side, L - 0.03, L + 0.006, 0.1 + TOP + 0.012 + 0.006, 0.02, plain));
      };
      return { body, armL: one('L'), armR: one('R') };
    },
  },
  /* ---------------------------------------------------------------- polo (collar tee) */
  {
    id: 'polo',
    name: '카라 티셔츠',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.78 });
      const rib = ctx.mat.cloth(c, { map: ribTex(K, 70, 0.84) });
      const tipC = ctx.mat.cloth(contrast(c, 0.4));
      const y0 = 0.89;
      const flare = (y) => 0.012 * (1 - smooth(y0, 1.12, y));
      const body = ctx.group(topShell(K, { y0, mat: m, flare }), K.loop(y0, TOP + 0.012, 0.022, m));
      // fold-down collar: a soft leaf draped over the shoulder dome (deeper points in front) + a rolled fold
      const colM = ctx.mat.cloth(lum(c) > 0.8 ? C.shade(c, 0.03) : C.light(c, 0.12), { roughness: 0.78 });
      const cB = 1.475;
      const cT = 1.598;
      const drop = (az) => 0.07 * Math.pow(Math.max(0, 1 - Math.abs(wrapAz(az)) / 48), 1.5);
      const lift = (y) => 0.012 + 0.03 * smooth(1.55, 1.598, y);
      const leafR = (y) => K.Rt(y) + TOP + lift(y);
      const leafDy = (y, az, f) => -(1 - f) * drop(az);
      body.add(K.sheet({ ys: K.lin(cB, cT, 12), cols: 80, a0: 8, a1: 352, r: leafR, dy: leafDy, thick: 0.014, mat: colM }));
      // the rolled fold around the neck
      const fold = [];
      for (let az = 9; az <= 351; az += 6) fold.push([0.213 * Math.sin(az * DEG), 1.598, 0.82 * 0.213 * Math.cos(az * DEG)]);
      body.add(ctx.tube(fold, 0.025, colM, { seg: 100, radial: 12, caps: true }));
      // contrast tipping along the lower edge of the collar
      const tipPts = [];
      for (let az = 8; az <= 352; az += 4) {
        const y = cB - drop(az) + 0.006;
        const r = leafR(y) + 0.014;
        tipPts.push([r * Math.sin(az * DEG), y, K.A.torsoDepth * r * Math.cos(az * DEG)]);
      }
      body.add(ctx.tube(tipPts, 0.0095, tipC, { seg: 140, radial: 8, caps: true }));
      // placket
      body.add(K.sheet({ y0: 1.36, y1: 1.6, rows: 10, cols: 4, a0: -4, a1: 4, inflate: TOP + 0.001, thick: 0.009, mat: m }));
      const btn = ctx.mat.plastic(whiteOn(c), { roughness: 0.3 });
      [1.41, 1.49].forEach((y) => body.add(K.stick(ctx.ellipsoid(0.018, 0.018, 0.008, btn, { seg: 14 }), y, 0, TOP + 0.011)));
      body.add(K.stick(pineEmblem(ctx, ctx.mat.cloth(contrast(c, 0.45)), 0.04), 1.3, 26, TOP + 0.004));
      const extra = (side, L, rEnd) => K.armBand(side, L - 0.006, L + 0.008, rEnd + 0.012, 0.022, tipC);
      return { body, ...sleeves(K, { t1: 0.38, flare: 0.016, mat: m, cuff: { len: 0.05, th: 0.022, grow: 0.006, mat: rib }, extra }) };
    },
  },
  /* ---------------------------------------------------------------- sleeveless tank */
  {
    id: 'tank',
    name: '민소매 티',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { map: ribTex(K, 220, 0.93) });
      const pipe = ctx.mat.cloth(deeper(c, 0.08));
      const y0 = 0.89;
      const yA = 1.32;
      const yT = 1.5;
      const flare = (y) => 0.01 * (1 - smooth(y0, 1.1, y));
      const body = ctx.group(topShell(K, { y0, y1: yA, mat: m, flare }), K.loop(y0, TOP + 0.01, 0.02, pipe));
      const hw = (y) => 90 - 56 * Math.pow(smooth(yA, yT, y), 0.55);
      const panel = (center, scoop) =>
        K.sheet({
          y0: yA,
          y1: yT,
          rows: 14,
          cols: 28,
          a0: (y) => center - hw(y),
          a1: (y) => center + hw(y),
          inflate: TOP,
          dy: (y, az, f) => -scoop * f * Math.max(0, 1 - Math.pow((az - center) / hw(y), 2)),
          mat: m,
        });
      body.add(panel(0, 0.075), panel(180, 0.03));
      [-1, 1].forEach((s) => {
        body.add(
          K.ribbon(
            [[yT - 0.012, s * 30], [1.55, s * 38], [1.585, s * 60], [1.597, s * 90], [1.585, s * 120], [1.55, s * 142], [yT - 0.012, s * 150]],
            { inflate: TOP - 0.002, w: 0.072, thick: 0.014, mat: m }
          )
        );
        // armhole piping
        const ah = [];
        for (let k = 0; k <= 8; k++) {
          const y = yT - ((yT - yA) * k) / 8;
          ah.push([y, s * (hw(y) + 0.5)]);
        }
        for (let k = 8; k >= 0; k--) {
          const y = yT - ((yT - yA) * k) / 8;
          ah.push([y, s * (180 - hw(y) - 0.5)]);
        }
        body.add(K.path(ah, TOP, 0.012, pipe, { seg: 40 }));
      });
      // neckline piping
      const neck = (center, scoop) => {
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const az = center - (hw(yT) - 4) + (2 * (hw(yT) - 4) * k) / 12;
          const f = Math.max(0, 1 - Math.pow((az - center) / hw(yT), 2));
          pts.push([yT - scoop * f, az]);
        }
        return K.path(pts, TOP + 0.002, 0.012, pipe, { seg: 30 });
      };
      body.add(neck(0, 0.075), neck(180, 0.03));
      return { body };
    },
  },
  /* ---------------------------------------------------------------- cafe apron over a tee */
  {
    id: 'apron',
    name: '카페 앞치마',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const teeC = lum(c) > 0.62 ? '#4a4b53' : CREAM;
      const tee = ctx.mat.cloth(teeC);
      const ap = ctx.mat.cloth(c, { roughness: 0.8 });
      const edge = ctx.mat.cloth(deeper(c, 0.12));
      const tieM = ctx.mat.cloth(contrast(c, 0.22));
      // slim rolled tee hem (stays inside overalls worn under the apron, which start at 0.058)
      const body = ctx.group(topShell(K, { y0: 0.89, mat: tee }), K.loop(0.892, TOP - 0.001, 0.0075, tee), crewNeck(K, tee, { tube: 0.03 }));
      const IN = 0.076;
      const yB = 0.44;
      const yT = 1.44;
      // hugs the chest, then hangs from the waist in front of any skirt (SK.env)
      const rA = (y) =>
        y >= 0.99 ? K.Rt(y) + IN : Math.max(K.Rt(0.99) + IN + 0.12 * (0.99 - y), (SK.depth * SK.env(K, y)) / 0.8 + 0.022);
      const aw = (y) => (y < 1.0 ? 38 + 7 * ((1.0 - y) / (1.0 - yB)) : 38 - 15 * smooth(1.0, yT, y));
      const ys = [...K.lin(yB, 0.99, 18), ...K.rows(0.99, yT, 16).slice(1)];
      body.add(K.sheet({ ys, a0: (y) => -aw(y), a1: aw, r: rA, thick: 0.014, cols: 30, mat: ap }));
      // trim along the edges
      const outline = [];
      for (let k = ys.length - 1; k >= 0; k -= 2) outline.push([ys[k], -aw(ys[k]) - 0.6]);
      for (let k = 0; k <= 10; k++) outline.push([yB + 0.004, -aw(yB) + (2 * aw(yB) * k) / 10]);
      for (let k = 0; k < ys.length; k += 2) outline.push([ys[k], aw(ys[k]) + 0.6]);
      outline.push([yT, aw(yT) + 0.6]);
      body.add(ctx.tube(outline.map(([y, az]) => {
        const r = rA(y) + 0.007;
        return [r * Math.sin(az * DEG), y, 0.8 * r * Math.cos(az * DEG)];
      }), 0.011, edge, { seg: 140, radial: 8 }));
      body.add(K.path([[yT + 0.002, -aw(yT)], [yT + 0.006, 0], [yT + 0.002, aw(yT)]], IN + 0.012, 0.011, edge, { seg: 16 }));
      // waist ties + bow at the back, neck strap
      // the tie leaves the apron edge and then hugs the tee all the way round
      const tieIn = (az) => TOP + 0.021 + (IN + 0.008 - TOP - 0.021) * smooth(62, 40, Math.abs(wrapAz(az)));
      const tieAz = [38.5, 46, 56, 70, 90, 110, 130, 150, 165, 180, 195, 210, 230, 250, 270, 290, 304, 314, 321.5];
      body.add(K.path(tieAz.map((az) => [1.0, az, tieIn(az) - TOP]), TOP, 0.019, tieM, { seg: 72 }));
      const bow = K.bow(tieM, 0.1);
      body.add(K.stick(bow, 1.0, 180, TOP + 0.045));
      body.add(K.path([[yT, -21], [1.52, -29], [1.585, -60], [1.602, -110], [1.6, -150], [1.598, 180], [1.6, 150], [1.602, 110], [1.585, 60], [1.52, 29], [yT, 21]], IN - 0.004, 0.017, tieM, { seg: 60 }));
      // big front pocket with two stitched dividers
      const pr = (y) => rA(y) + 0.014;
      body.add(K.sheet({ ys: K.lin(0.62, 0.79, 6), a0: -27, a1: 27, r: pr, thick: 0.012, cols: 20, mat: ap }));
      [-9, 9].forEach((az) => body.add(ctx.tube([0.63, 0.71, 0.785].map((y) => {
        const r = pr(y) + 0.013;
        return [r * Math.sin(az * DEG), y, 0.8 * r * Math.cos(az * DEG)];
      }), 0.005, edge, { seg: 8, radial: 6 })));
      body.add(K.path([[0.79, -27.4], [0.79, 27.4]], 0, 0.009, edge, { seg: 12 }));
      // name tag on the bib
      const tag = ctx.box(0.12, 0.055, 0.014, ctx.mat.plastic('#fbf8f1'), { radius: 0.01 });
      body.add(K.stick(tag, 1.3, -16, IN + 0.024));
      const tagLine = ctx.box(0.12, 0.016, 0.016, ctx.mat.plastic(contrast(c, 0.3)), { radius: 0.006 });
      body.add(K.stick(tagLine, 1.322, -16, IN + 0.025));
      body.userData.ccOveralls = 'apron'; // overalls go under this top
      return { body, ...sleeves(K, { t1: 0.4, flare: 0.02, mat: tee, cuff: { len: 0.04, th: 0.02, grow: 0.006, mat: tee } }) };
    },
  },
  /* ---------------------------------------------------------------- one-piece dress */
  {
    id: 'dress',
    name: '원피스',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.78 });
      const lace = ctx.mat.cloth(whiteOn(c), { roughness: 0.7 });
      const sash = ctx.mat.cloth(contrast(c, 0.25), { roughness: 0.6 });
      const yH = 0.47;
      const IN = TOP;
      const skirt = (y) => (y >= 1.0 ? 0 : 0.155 * Math.pow((1.0 - y) / (1.0 - yH), 1.05));
      const wave = (y, az) => (y < 0.95 ? 0.016 * Math.sin(az * DEG * 9) * Math.pow((1.0 - y) / (1.0 - yH), 2) : 0);
      // A-line skirt that always stays outside any skirt bottom (SK.env), a little deeper front-to-back
      const own = (y) => Math.max(K.Rt(y), y < 1.0 ? K.Rt(1.0) : 0) + IN + skirt(y);
      const rD = (y, az) => Math.max(own(y), y < 0.95 ? SK.env(K, y) + 0.03 : 0) + wave(y, az);
      const dz = (y) => 0.8 + 0.06 * smooth(1.0, 0.86, y);
      const ys = [...K.lin(yH, 0.99, 20), ...K.rows(0.99, K.A.torsoTop, 26).slice(1)];
      const body = ctx.group(K.sheet({ ys, r: rD, dz, cols: 72, mat: m }));
      body.add(K.loop(yH + 0.004, (az) => rD(yH, az) + 0.004, 0.02, lace, { depth: dz(yH), n: 96 }));
      body.add(K.loop(1.0, (az) => rD(1.0, az) + 0.006, 0.024, sash, { depth: 0.8 }));
      body.add(K.stick(K.bow(sash, 0.07), 1.0, 0, IN + 0.03, { depth: 0.8 }));
      // big sash bow at the back
      body.add(K.stick(K.bow(sash, 0.115), 1.0, 180, IN + 0.042, { depth: 0.8 }));
      body.add(shirtCollar(K, lace, { round: true, y: 1.525, tilt: -0.06 }));
      body.userData.ccOveralls = 'dress'; // overalls go under this top
      return { body, ...sleeves(K, { t1: 0.3, puff: 0.04, flare: 0.006, mat: m, cuff: { len: 0.035, th: 0.018, grow: 0.004, mat: lace } }) };
    },
  },
  /* ---------------------------------------------------------------- forest ranger vest */
  {
    id: 'ranger',
    name: '숲 레인저 조끼',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      // khaki-cream field shirt; a sage one under very light vests so the vest still reads
      const shirtC = lum(c) > 0.8 ? '#93a26c' : C.mix('#efe5c8', c, 0.08);
      const shirt = ctx.mat.cloth(shirtC, { roughness: 0.75 });
      const v = ctx.mat.cloth(c, { roughness: 0.84 });
      const trim = ctx.mat.cloth(deeper(c, 0.16));
      const btn = ctx.mat.plastic(contrast(c, 0.4), { roughness: 0.3 });
      const IN = OUTER;
      const y0 = 0.84;
      const flare = (y) => (y < 0.96 ? 0.6 * (K.Rt(0.96) - K.Rt(y)) : 0) + 0.008 * (1 - smooth(0.84, 1.05, y));
      const gap = (y) => 22 * Math.pow(smooth(1.24, 1.6, y), 0.8) + 1.0;
      const ah = (y) => 30 * Math.pow(Math.max(0, Math.sin(Math.PI * smooth(1.28, 1.585, y))), 0.7);
      const body = ctx.group(topShell(K, { y0: 0.89, mat: shirt }), shirtCollar(K, shirt, { y: 1.525 }));
      openShell(K, { y0, gap, armhole: ah, inflate: IN, flare, mat: v }).forEach((s) => body.add(s));
      // front edges, armholes, hem
      [-1, 1].forEach((s) => {
        const e = K.lin(y0 + 0.004, 1.592, 14).map((y) => [y, s * gap(y)]);
        body.add(K.path(e, IN + 0.004, 0.016, trim, { flare, seg: 40 }));
        const a = [];
        for (let k = 0; k <= 10; k++) {
          const y = 1.28 + (0.31 * k) / 10;
          a.push([y, s * (90 - ah(y))]);
        }
        for (let k = 10; k >= 0; k--) {
          const y = 1.28 + (0.31 * k) / 10;
          a.push([y, s * (90 + ah(y))]);
        }
        body.add(K.path(a, IN + 0.002, 0.016, trim, { seg: 50 }));
      });
      body.add(K.path([[1.592, gap(1.592)], [1.6, 70], [1.603, 120], [1.603, 180], [1.603, 240], [1.6, 290], [1.592, 360 - gap(1.592)]], IN + 0.004, 0.016, trim, { seg: 40 }));
      body.add(K.loop(y0 + 0.004, IN + flare(y0) + 0.004, 0.017, trim));
      // pockets with flaps + buttons
      const pocket = (y0p, y1p, a0, a1) => {
        body.add(K.sheet({ y0: y0p, y1: y1p, rows: 6, cols: 8, a0, a1, inflate: IN + 0.001, flare, thick: 0.014, mat: v }));
        body.add(K.sheet({ y0: y1p - 0.035, y1: y1p + 0.012, rows: 3, cols: 8, a0: a0 - 0.8, a1: a1 + 0.8, inflate: IN + 0.016, flare, thick: 0.012, mat: trim }));
        if (y0p < 1.0) body.add(K.stick(ctx.ellipsoid(0.016, 0.016, 0.008, btn, { seg: 12 }), y1p - 0.02, (a0 + a1) / 2, IN + 0.03, { flare }));
      };
      pocket(0.9, 1.04, 8, 32);
      pocket(0.9, 1.04, -32, -8);
      pocket(1.2, 1.3, 12, 30);
      pocket(1.2, 1.3, -30, -12);
      // ranger badge: a small shield with a pine tree
      const shield = ctx.shape();
      shield.moveTo(-0.04, 0.045);
      shield.lineTo(0.04, 0.045);
      shield.lineTo(0.04, -0.005);
      shield.quadraticCurveTo(0.035, -0.04, 0, -0.055);
      shield.quadraticCurveTo(-0.035, -0.04, -0.04, -0.005);
      shield.lineTo(-0.04, 0.045);
      const gold = ctx.mat.plastic('#e2b54e', { roughness: 0.3 });
      body.add(K.stick(ctx.extrude(shield, 0.01, gold, { bevel: 0.006 }), 1.39, -21, IN + 0.012));
      body.add(K.stick(pineEmblem(ctx, ctx.mat.plastic('#3f6b3a'), 0.03), 1.392, -21, IN + 0.026));
      // rolled-up shirt sleeves
      const extra = (side, L, rEnd) => K.armBand(side, L - 0.06, L + 0.012, rEnd + 0.03, 0.04, shirt);
      body.userData.ccOveralls = 'jacket'; // overalls go under this top
      return { body, ...sleeves(K, { t1: 0.52, flare: 0.01, mat: shirt, extra }) };
    },
  },
  /* ---------------------------------------------------------------- quilted puffer jacket */
  {
    id: 'puffer',
    name: '패딩 점퍼',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.46, sheen: 0.35 });
      const rib = ctx.mat.cloth(deeper(c, 0.12), { map: ribTex(K, 90, 0.8), roughness: 0.9 });
      const zipM = ctx.mat.plastic(contrast(c, 0.38), { roughness: 0.35 });
      const metal = ctx.mat.metal(lum(c) > 0.45 ? '#8f8f98' : '#e3dccb', { roughness: 0.3 });
      const IN = 0.078;
      const yH = 0.82; // bottom of the elastic hem
      const yQ = 0.866; // quilting starts here
      const flare = (y) => (y < 0.96 ? 0.55 * (K.Rt(0.96) - K.Rt(y)) : 0);
      // soft horizontal quilting (stays below 0.1 so body accessories still sit on top)
      const BH = (1.58 - yQ) / 6;
      const quilt = (y) => {
        if (y <= yQ) return 0;
        const f = ((y - yQ) / BH) % 1;
        return 0.017 * Math.pow(Math.sin(Math.PI * f), 0.65) * (1 - smooth(1.53, 1.6, y));
      };
      const rQ = (y) => K.Rt(y) + IN + flare(y) + quilt(y);
      const body = ctx.group(K.sheet({ ys: K.rows(yQ, K.A.torsoTop, 72), r: rQ, cols: 64, mat: m }));
      body.add(K.sheet({ y0: yH, y1: yQ + 0.006, rows: 5, inflate: IN + 0.002, flare, thick: 0.012, mat: rib }));
      body.add(K.loop(yH + 0.004, (az) => K.Rt(yH + 0.004) + IN + 0.008 + flare(yH + 0.004), 0.012, rib));
      // puffy stand collar
      body.add(ctx.lathe(K.bandProfile(0.15, 0.215, 1.55, 1.636, 0.03), m, { smooth: false, seg: 44 }));
      // zip up the front, onto the collar, with a pull tab
      const zip = K.lin(yH + 0.006, 1.57, 34).map((y) => [0, y, K.A.torsoDepth * (rQ(y) + 0.004)]);
      zip.push([0, 1.6, 0.218], [0, 1.628, 0.216]);
      body.add(ctx.tube(zip, 0.0085, zipM, { seg: 90, radial: 8, caps: true }));
      const pull = ctx.group(ctx.box(0.042, 0.078, 0.014, metal, { radius: 0.008, pos: [0, -0.036, 0.005] }));
      pull.add(ctx.sphere(0.014, metal, { seg: 12 }));
      body.add(K.stick(pull, 1.5, 0, IN + quilt(1.5) + 0.012, { tilt: 0.2 }));
      // quilted sleeves (three puffs) with elastic cuffs
      const sleeve = (side) => {
        const L = K.armInfo(side).len * 0.78;
        const r0 = K.A.armRadius + 0.07;
        const rr = (d) => r0 + 0.016 * Math.pow(Math.abs(Math.sin((Math.PI * d * 3) / L)), 0.65) * smooth(0, 0.04, d);
        const pts = [[r0 - 0.03, -L + 0.05], [r0 - 0.022, -L - 0.002], [r0 - 0.008, -L - 0.008]];
        for (let k = 40; k >= 1; k--) pts.push([rr((L * k) / 40), (-L * k) / 40]);
        for (let k = 0; k <= 10; k++) {
          const t = (k / 10) * (Math.PI / 2);
          pts.push([r0 * Math.cos(t), r0 * Math.sin(t)]);
        }
        return ctx.group(K.armLathe(side, pts, m), K.armBand(side, L - 0.06, L + 0.006, r0 + 0.012, 0.03, rib));
      };
      body.userData.ccOveralls = 'jacket'; // overalls go under this top
      return { body, armL: sleeve('L'), armR: sleeve('R') };
    },
  },
]);

/* every top renders with its cloth-fold amplitude switched on (see FOLDS) */
CC.parts.top.forEach((p) => {
  const render = p.render;
  p.render = (ctx) => {
    // overalls sit right on top of the shirt from the waist down: no folds to poke through them
    const covered = ctx.state && ctx.state.bottom === 'overalls';
    FOLDS = ctx.is3D && !covered ? TOP_FOLDS[p.id] ?? TOP_FOLDS.default : 0;
    try {
      return render(ctx);
    } finally {
      FOLDS = 0;
    }
  };
});

/* ================================================================== BOTTOMS */
const B_IN = 0.026; // bottom torso inflate

function seatShell(K, mat, o) {
  o = o || {};
  const s = K.ctx.shell.torso({ from: K.A.torsoBottom, to: o.y1 ?? 1.02, inflate: o.inflate ?? B_IN, flare: o.flare || 0, mat, seg: 56 });
  return K.uvByY(s, TV0, TV1);
}
/** grey-level map with soft pressed creases at the front and back of a leg */
function creaseTex(K) {
  return K.canvas(256, 16, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    [0.5, 0, 1].forEach((u) => {
      const x = u * w;
      const grd = g.createLinearGradient(x - 7, 0, x + 7, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.42, 'rgba(0,0,0,0.13)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - 7, 0, 14, h);
    });
  });
}
/** both pant legs; o: { yHem, r(y), mat (or matL/matR), splay, n, lip } */
function pantLegs(K, o) {
  const one = (side) => {
    const m = K.pantLeg(side, Object.assign({}, o, { mat: (side === 'L' ? o.matL : o.matR) || o.mat }));
    if (o.uvY) K.uvByY(m, TV0 - K.A.hipL[1], TV1 - K.A.hipL[1]);
    // long legs: a soft break behind the knee and stacking above the hem
    if (o.yHem < 0.45 && o.folds !== false) {
      const hipY = K.A.hipL[1];
      const ph = side === 'L' ? 1.1 : 2.9;
      const hem = o.yHem - hipY;
      K.crumple(m, (y, ang) => -0.017 * creases(y, ang, hem + 0.1, 0.09, 70, ph) - 0.012 * creases(y, ang, 0.56 - hipY, 0.08, 60, ph + Math.PI));
    }
    // seams: one down the outside of the leg and a stitch line above the hem
    if (o.seams !== false) {
      const hipY = K.A.hipL[1];
      const sg = side === 'L' ? -1 : 1;
      const sm = seamMat(K, m.material);
      const yTop = Math.min(o.yTop ?? 1.0, 0.8);
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const y = o.yHem + 0.03 + ((yTop - o.yHem - 0.03) * k) / 14;
        pts.push([sg * (o.r(y) + 0.0005), y - hipY, 0]);
      }
      m.add(K.ctx.tube(pts, 0.0036, sm, { seg: 28, radial: 8 }));
      const ys = o.yHem + 0.04;
      const ring = K.ctx.lathe(K.bandProfile(o.r(ys) - 0.006, o.r(ys) + 0.0028, ys - hipY - 0.004, ys - hipY + 0.004), sm, { smooth: false, seg: 36 });
      m.add(ring);
    }
    return m;
  };
  return [one('L'), one('R')];
}
/** turned-up cuff band at the hem of both legs */
function legCuffs(K, o) {
  const hipY = K.A.hipL[1];
  return ['L', 'R'].map((side) =>
    K.legLathe(side, K.bandProfile(o.ri, o.ro, o.y0 - hipY, o.y1 - hipY, o.rad), o.mat, { splay: o.splay || 0, seg: 40 })
  );
}
/** belt ring buckle (rounded frame) facing +Z */
function buckle(ctx, mat, w, h) {
  const r = 0.012;
  const rr = (s, x, y, W, H, R) => {
    s.moveTo(x + R, y);
    s.lineTo(x + W - R, y);
    s.quadraticCurveTo(x + W, y, x + W, y + R);
    s.lineTo(x + W, y + H - R);
    s.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
    s.lineTo(x + R, y + H);
    s.quadraticCurveTo(x, y + H, x, y + H - R);
    s.lineTo(x, y + R);
    s.quadraticCurveTo(x, y, x + R, y);
  };
  const sh = ctx.shape();
  rr(sh, -w / 2, -h / 2, w, h, r);
  const hole = new ctx.THREE.Path();
  rr(hole, -w / 2 + 0.013, -h / 2 + 0.012, w - 0.026, h - 0.024, 0.005);
  sh.holes.push(hole);
  return ctx.extrude(sh, 0.006, mat, { bevel: 0.004, curveSegments: 6 });
}
/** frac-based triangle wave in [0, 1] */
const tri01 = (x) => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1);

CC.register('bottom', [
  /* ---------------------------------------------------------------- slacks */
  {
    id: 'slacks',
    name: '슬랙스',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.7, sheen: 0.4, map: creaseTex(K) });
      const seatM = ctx.mat.cloth(c, { roughness: 0.7, sheen: 0.4 });
      const beltC = lum(c) > 0.28 ? C.mix(c, '#2b2321', 0.75) : C.mix(c, '#9a6a45', 0.7);
      const belt = ctx.mat.plastic(beltC, { roughness: 0.4 });
      const metal = ctx.mat.metal('#e2c878', { roughness: 0.3 });
      const g = ctx.group(seatShell(K, seatM));
      g.add(K.sheet({ y0: 0.828, y1: 0.872, rows: 4, inflate: B_IN + 0.002, thick: 0.01, mat: belt }));
      g.add(K.stick(buckle(ctx, metal, 0.074, 0.052), 0.85, 0, B_IN + 0.018));
      g.add(...pantLegs(K, { yHem: 0.27, r: (y) => 0.178 + 0.007 * (0.92 - y), mat: m }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- jeans */
  {
    id: 'jeans',
    name: '청바지',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const stitch = C.mix('#eaa94a', c, lum(c) > 0.6 ? 0.45 : 0.18);
      const twill = (g, w, h) => {
        g.fillStyle = c;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = lum(c) > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
        g.lineWidth = 2;
        for (let k = -h; k < w; k += 6) {
          g.beginPath();
          g.moveTo(k, h);
          g.lineTo(k + h, 0);
          g.stroke();
        }
      };
      const dash = (g, pts, lw) => {
        g.save();
        g.strokeStyle = stitch;
        g.lineWidth = lw || 3.4;
        g.setLineDash([9, 5]);
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
        g.restore();
      };
      const legTex = K.canvas(512, 512, (g, w, h) => {
        twill(g, w, h);
        [0.25, 0.75].forEach((u) => {
          dash(g, [[u * w - 6, 0], [u * w - 6, h]]);
          dash(g, [[u * w + 6, 0], [u * w + 6, h]]);
        });
      });
      const seatTex = K.canvas(1024, 512, (g, w, h) => {
        twill(g, w, h);
        const X = (a) => K.px(wrapAz(a), w);
        const Y = (y) => K.py(y, h);
        dash(g, [[X(5), Y(0.95)], [X(5), Y(0.8)], [X(2), Y(0.775)], [X(0), Y(0.77)]]);
        [-1, 1].forEach((s) => {
          const a = 180 + s * 21;
          dash(g, [[X(a - 10), Y(0.9)], [X(a - 10), Y(0.8)], [X(a), Y(0.77)], [X(a + 10), Y(0.8)], [X(a + 10), Y(0.9)]]);
          dash(g, [[X(90 * s) - 5, 0], [X(90 * s) - 5, h]]);
        });
      });
      const m = K.fabric(c, legTex, { roughness: 0.86, sheen: 0.4 });
      const seat = K.fabric(c, seatTex, { roughness: 0.86, sheen: 0.4 });
      const cuff = ctx.mat.cloth(C.light(c, 0.28), { roughness: 0.86 });
      const r = (y) => 0.178 + 0.005 * (0.92 - y);
      const yHem = 0.27;
      const splay = 0; // concentric with boot shafts
      const g = ctx.group(seatShell(K, seat));
      g.add(...pantLegs(K, { yHem, r, mat: m, splay, uvY: true }));
      g.add(...legCuffs(K, { ri: r(yHem) - 0.006, ro: 0.193, y0: yHem - 0.006, y1: yHem + 0.064, mat: cuff, splay }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- shorts */
  {
    id: 'shorts',
    name: '반바지',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.78 });
      const trim = ctx.mat.cloth(deeper(c, 0.08), { roughness: 0.78 });
      const btn = ctx.mat.plastic(contrast(c, 0.35));
      const yHem = 0.6;
      const splay = 0.035;
      const r = (y) => 0.196 + 0.014 * ((0.92 - y) / 0.32);
      const g = ctx.group(seatShell(K, m));
      g.add(...pantLegs(K, { yHem, r, mat: m, splay }));
      // turned-up cuffs in a deeper tone
      g.add(...legCuffs(K, { ri: r(yHem) - 0.004, ro: r(yHem) + 0.022, y0: yHem - 0.004, y1: yHem + 0.056, mat: trim, splay }));
      // patch pockets with button flaps, curved onto the outer thighs (built in the leg frame)
      const hipY = K.A.hipL[1];
      [-1, 1].forEach((s) => {
        const hip = s < 0 ? K.A.hipL : K.A.hipR;
        const frame = ctx.group();
        frame.position.set(hip[0], hip[1], hip[2]);
        frame.rotation.z = s * splay;
        const ac = s * 90;
        const rl = (yl) => r(yl + hipY);
        const uv = (y, az) => [az / 360, y];
        const yP0 = 0.665 - hipY;
        const yP1 = 0.79 - hipY;
        frame.add(K.sheet({ ys: K.lin(yP0, yP1, 6), cols: 10, a0: ac - 27, a1: ac + 27, r: (y) => rl(y) + 0.003, depth: 1, thick: 0.012, mat: m, uv }));
        frame.add(K.sheet({ ys: K.lin(yP1 - 0.045, yP1 + 0.008, 4), cols: 10, a0: ac - 30, a1: ac + 30, r: (y) => rl(y) + 0.015, depth: 1, thick: 0.012, mat: trim, uv }));
        const bR = rl(yP1 - 0.03) + 0.03;
        frame.add(ctx.ellipsoid(0.017, 0.017, 0.009, btn, { pos: [bR * Math.sin(ac * DEG), yP1 - 0.026, 0], rot: [0, s * Math.PI / 2, 0], seg: 14 }));
        g.add(frame);
      });
      return g;
    },
  },
  /* ---------------------------------------------------------------- pleated skirt (soft check) */
  {
    id: 'pleats',
    name: '플리츠 스커트',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const yH = SK.pleatsH;
      const N = SK.pleatsN;
      const rS = (y, az) => SK.pleats(K, y, az);
      const dz = (y) => 0.8 + (SK.depth - 0.8) * smooth(0.9, 0.72, y);
      const dark = deeper(c, 0.22);
      const lite = lum(c) > 0.7 ? C.shade(c, 0.12) : C.light(c, 0.42);
      const tex = K.canvas(1024, 512, (g, w, h) => {
        g.fillStyle = c;
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.55;
        g.fillStyle = dark;
        for (let k = 0; k < 13; k++) g.fillRect((k / 13) * w, 0, w / 13 / 3.2, h);
        for (let y = yH; y < 1.02; y += 0.115) g.fillRect(0, K.py(y + 0.04, h), w, K.py(y, h) - K.py(y + 0.04, h));
        g.globalAlpha = 0.85;
        g.fillStyle = lite;
        for (let k = 0; k < 13; k++) g.fillRect(((k + 0.62) / 13) * w, 0, 3, h);
        for (let y = yH + 0.075; y < 1.02; y += 0.115) g.fillRect(0, K.py(y, h) - 1.5, w, 3);
        g.globalAlpha = 1;
      });
      const m = K.fabric(c, tex, { roughness: 0.8 });
      const band = ctx.mat.cloth(dark, { roughness: 0.8 });
      const g = ctx.group(K.sheet({ ys: [...K.lin(yH, 0.9, 20), ...K.lin(0.9, 1.022, 6).slice(1)], r: rS, dz, cols: N * 4, mat: m }));
      g.add(K.loop(yH + 0.004, (az) => rS(yH, az) + 0.002, 0.011, m, { depth: dz(yH), n: N * 6 }));
      g.add(K.sheet({ y0: 0.95, y1: 1.022, rows: 5, inflate: B_IN + 0.004, thick: 0.01, mat: band }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- long A-line skirt with buttons */
  {
    id: 'aline',
    name: '롱 A라인 스커트',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const yH = SK.alineH;
      const rS = (y, az) => SK.aline(K, y, az);
      const dz = (y) => 0.8 + (SK.depth - 0.8) * smooth(0.9, 0.72, y);
      const m = ctx.mat.cloth(c, { roughness: 0.82 });
      const trim = ctx.mat.cloth(deeper(c, 0.12));
      const btn = ctx.mat.plastic(contrast(c, 0.35), { roughness: 0.3 });
      const g = ctx.group(K.sheet({ ys: [...K.lin(yH, 0.9, 26), ...K.lin(0.9, 1.022, 6).slice(1)], r: rS, dz, cols: 84, mat: m }));
      g.add(K.loop(yH + 0.006, (az) => rS(yH, az) + 0.003, 0.014, trim, { depth: dz(yH), n: 112 }));
      [0.82, 0.69, 0.56, 0.43].forEach((y) => {
        const r = rS(y, 0) + 0.006;
        g.add(ctx.ellipsoid(0.023, 0.023, 0.011, btn, { pos: [0, y, dz(y) * r], seg: 16 }));
      });
      g.add(ctx.tube(K.lin(yH + 0.01, 0.86, 12).map((y) => { const r = rS(y, 5.2) + 0.002; return [r * Math.sin(5.2 * DEG), y, dz(y) * r * Math.cos(5.2 * DEG)]; }), 0.005, trim, { seg: 24, radial: 6 }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- joggers */
  {
    id: 'joggers',
    name: '조거 팬츠',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const stripeC = whiteOn(c);
      const legTex = (outerU) =>
        K.canvas(512, 16, (g, w, h) => {
          g.fillStyle = c;
          g.fillRect(0, 0, w, h);
          g.fillStyle = stripeC;
          [-12, 5].forEach((dx) => g.fillRect(outerU * w + dx, 0, 7, h));
        });
      // stripes sit on the outer side, turned a little toward the front so they read in the thumbnail
      const mL = K.fabric(c, legTex(0.3), { roughness: 0.88 });
      const mR = K.fabric(c, legTex(0.7), { roughness: 0.88 });
      const seat = ctx.mat.cloth(c, { roughness: 0.88 });
      const rib = ctx.mat.cloth(deeper(c, 0.05), { map: ribTex(K, 44, 0.8), roughness: 0.9 });
      const r = (y) => 0.2 - 0.03 * smooth(0.86, 0.4, y) + 0.012 * Math.exp(-Math.pow((y - 0.4) / 0.045, 2));
      const g = ctx.group(seatShell(K, seat));
      g.add(...pantLegs(K, { yHem: 0.33, r, matL: mL, matR: mR, lip: false }));
      g.add(...legCuffs(K, { ri: 0.152, ro: 0.181, y0: 0.27, y1: 0.355, rad: 0.012, mat: rib }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- overalls */
  {
    id: 'overalls',
    name: '멜빵바지',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.84 });
      const stitchM = ctx.mat.cloth(C.mix('#eaa94a', c, lum(c) > 0.6 ? 0.45 : 0.2), { roughness: 0.7 });
      const cuffM = ctx.mat.cloth(C.light(c, 0.26), { roughness: 0.84 });
      const metal = ctx.mat.metal('#e2c878', { roughness: 0.28 });
      const bw = (y) => 29 - 5 * smooth(0.98, 1.36, y);
      /* bib + pocket + straps at bib inflate OV (bib thickness TH); k scales the raised details */
      const upper = (OV, TH, k, yB, straps) => {
        const u = ctx.group();
        straps = straps || u;
        u.add(K.sheet({ y0: yB, y1: 1.36, rows: 18, cols: 12, a0: (y) => -bw(y), a1: bw, inflate: OV, thick: TH, mat: m }));
        u.add(K.sheet({ y0: 1.12, y1: 1.27, rows: 6, cols: 8, a0: -13, a1: 13, inflate: OV + TH, thick: 0.012 * k, mat: m }));
        u.add(K.path([[1.27, -13.5], [1.27, 13.5]], OV + TH + 0.01 * k, 0.007 * k, stitchM, { seg: 10, caps: false }));
        u.add(K.path([[1.36, -bw(1.36)], [1.362, 0], [1.36, bw(1.36)]], OV + TH, 0.009 * k, m, { seg: 12 }));
        // contrast top-stitching down both sides of the bib
        [-1, 1].forEach((s) => u.add(K.path(K.lin(yB + 0.02, 1.34, 6).map((y) => [y, s * (bw(y) - 2.2)]), OV + TH + 0.001, 0.0045 * Math.max(0.7, k), stitchM, { seg: 16, caps: false })));
        // straps over the shoulders, buttons
        [-1, 1].forEach((s) => {
          const ctrl = [[1.345, s * 20], [1.45, s * 26], [1.535, s * 38], [1.585, s * 60], [1.603, s * 90], [1.585, s * 120], [1.5, s * 146], [1.3, s * 158], [1.1, s * 162], [Math.max(yB, 0.99), s * 163]];
          straps.add(K.ribbon(ctrl, { inflate: OV + 0.002, w: 0.066, thick: 0.011 * k, mat: m }));
          // (wrapped: K.stick replaces the transform, and the cylinder carries its own orientation)
          const stud = ctx.group(ctx.cylinder([0, 0, 0], [0, 0, 0.014 * k], 0.026, 0.023, metal, { seg: 20 }));
          stud.add(ctx.ellipsoid(0.011, 0.011, 0.005 * k, metal, { pos: [0, 0, 0.014 * k], seg: 14 }));
          u.add(K.stick(stud, 1.33, s * 20, OV + TH * 0.8));
        });
        return u;
      };
      /* seat with a height-dependent inflate (lathe, closed at the crotch) */
      const seat = (infl) => {
        const pts = [[0, K.A.torsoBottom - 0.04]];
        K.lin(K.A.torsoBottom, 1.0, 40).forEach((y) => pts.push([K.Rt(y) + infl(y), y]));
        const s = ctx.lathe(pts, m, { smooth: false, seg: 56 });
        s.scale.z = K.A.torsoDepth;
        return K.uvByY(s, TV0, TV1);
      };
      // OVER: worn over tees / knits / hoodies (covers their hems)
      const over = ctx.group(seat(() => 0.092), upper(0.092, 0.016, 1, 0.97));
      // UNDER: worn under jackets / the apron (whose shells start at 0.076) and under the dress skirt.
      // Straps are left out under closed-back jackets: on the flat shoulder crown there is no room between layers.
      const straps = ctx.group();
      const under = ctx.group(upper(0.056, 0.008, 0.55, 0.985, straps), straps);
      const seatJacket = seat(() => 0.058);
      const seatDress = seat((y) => 0.05 - 0.012 * smooth(0.9, 0.965, y));
      under.add(seatJacket, seatDress);
      under.visible = false;
      const g = ctx.group(over, under);
      // the overalls are the only garment that sits between a top's layers: follow the top worn right now.
      // Tops mark themselves with userData.ccOveralls = 'jacket' | 'apron' | 'dress' (see the tops above).
      const THREE = ctx.THREE;
      g.updateMatrixWorld = function (force) {
        const top = this.parent && this.parent.children.find((o) => o.userData && o.userData.cat === 'top');
        const mode = (top && top.userData.ccOveralls) || 'over';
        over.visible = mode === 'over';
        under.visible = !over.visible;
        straps.visible = mode !== 'jacket';
        seatJacket.visible = mode !== 'dress';
        seatDress.visible = mode === 'dress';
        return THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
      };
      const r = (y) => 0.18 + 0.006 * (0.92 - y);
      const yHem = 0.27;
      g.add(...pantLegs(K, { yHem, r, mat: m }));
      g.add(...legCuffs(K, { ri: r(yHem) - 0.006, ro: 0.194, y0: yHem - 0.006, y1: yHem + 0.06, mat: cuffM }));
      return g;
    },
  },
  /* ---------------------------------------------------------------- wide pants */
  {
    id: 'wide',
    name: '와이드 팬츠',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.74, sheen: 0.5, map: creaseTex(K) });
      const seat = ctx.mat.cloth(c, { roughness: 0.74, sheen: 0.5 });
      // wide enough to swallow any boot shaft (r <= 0.212 around the leg axis)
      const r = (y) => 0.205 + 0.034 * smooth(0.9, 0.12, y);
      const g = ctx.group(seatShell(K, seat));
      g.add(...pantLegs(K, { yHem: 0.07, r, mat: m, splay: 0.03, n: 30, depth: 1.06 }));
      return g;
    },
  },
]);

/* ================================================================== SHOES */
const FX = 0.2; // foot x
const LX = 0.19; // leg axis x

/** shoe upper: superellipsoid around the foot. o: { W, yt(zn), n, pToe, len, cz, yb } */
function upperBlob(K, s, o, mat) {
  return K.blob(
    {
      cx: s * FX,
      cz: o.cz ?? 0.07,
      len: o.len ?? 0.262,
      W: () => o.W ?? 0.17,
      yb: () => o.yb ?? 0.035,
      yt: o.yt,
      n: o.n ?? 3.2,
      pHeel: o.pHeel ?? 2.6,
      pToe: o.pToe ?? 2.1,
      nu: 44,
      nv: 34,
      grow: o.grow,
      u0: o.u0,
      u1: o.u1,
      v0: o.v0,
      v1: o.v1,
    },
    mat
  );
}
/** flat sole slab under the shoe */
function soleBlob(K, s, o, mat) {
  return K.blob(
    {
      cx: s * FX,
      cz: o.cz ?? 0.073,
      len: o.len ?? 0.28,
      W: () => o.W ?? 0.184,
      yb: () => o.yb ?? 0,
      yt: o.yt || (() => o.h ?? 0.06),
      n: o.n ?? 5,
      pHeel: 2.4,
      pToe: o.pToe ?? 2.2,
      nu: 44,
      nv: 26,
    },
    mat
  );
}
/** horizontal torus around the leg axis (shoe collar, boot rim, sock top) */
function legRing(K, s, y, R, tube, mat) {
  return K.ctx.torus(R, tube, mat, { radial: 12, tubular: 44, rot: [Math.PI / 2, 0, 0], pos: [s * LX, y, 0] });
}
/** vertical lathe around the leg axis (boot shafts, socks) from profile [[r, y]] */
function legShaft(K, s, pts, mat) {
  const m = K.ctx.lathe(pts, mat, { smooth: false, seg: 44 });
  m.position.set(s * LX, 0, 0);
  return m;
}
/** a point on a blob surface pushed out by d along the outward direction from its axis */
function onBlob(mesh, u, zn, d) {
  const p = mesh.userData.P(u, zn, d || 0);
  return p;
}
/** sock: foot cover + cuff around the ankle (hides the bare foot) */
function sock(K, s, mat, yTop) {
  const ctx = K.ctx;
  const f = ctx.ellipsoid(0.149, 0.107, 0.21, mat, { pos: [s * FX, 0.1, 0.07], seg: 32 });
  const cuff = legShaft(K, s, [[0.154, 0.12], [0.157, yTop - 0.02], [0.163, yTop - 0.012], [0.163, yTop], [0.15, yTop + 0.006]], mat);
  return ctx.group(f, cuff);
}

CC.register('shoes', [
  /* ---------------------------------------------------------------- sneakers */
  {
    id: 'sneakers',
    name: '운동화',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const up = ctx.mat.cloth(c, { roughness: 0.68 });
      const accC = lum(c) > 0.75 ? C.mix(c, '#4a6aa8', 0.42) : lum(c) < 0.2 ? C.light(c, 0.32) : C.shade(c, 0.28);
      const acc = ctx.mat.cloth(accC, { roughness: 0.6 });
      const soleC = lum(c) > 0.75 ? '#efe8da' : '#f7f3ea';
      const soleTex = K.canvas(256, 32, (g, w, h) => {
        g.fillStyle = soleC;
        g.fillRect(0, 0, w, h);
        g.fillStyle = accC;
        [0.035, 0.465].forEach((u) => g.fillRect(u * w - 3, 0, 6, h));
      });
      const sole = ctx.mat.custom({ color: new ctx.THREE.Color('#ffffff'), map: soleTex, roughness: 0.6, clearcoat: 0.25 });
      const lace = ctx.mat.cloth(lum(c) > 0.75 ? C.mix(c, '#2c3b6a', 0.85) : whiteOn(c), { roughness: 0.6 });
      const body = ctx.both((s) => {
        const cx = s * FX;
        const shape = { yt: (zn) => 0.255 - 0.085 * smooth(-0.1, 0.9, zn) };
        const upper = upperBlob(K, s, shape, up);
        const so = soleBlob(K, s, { yt: (zn) => 0.066 + 0.07 * smooth(0.5, 1, zn) }, sole);
        const g = ctx.group(upper, so, legRing(K, s, 0.25, 0.155, 0.026, acc));
        // lace panel and heel counter in the accent colour
        g.add(upperBlob(K, s, Object.assign({ u0: 0.165, u1: 0.335, v0: 0.46, v1: 0.8, grow: 0.007 }, shape), acc));
        g.add(upperBlob(K, s, Object.assign({ v0: 0, v1: 0.2, grow: 0.006 }, shape), acc));
        [-0.0, 0.18, 0.36].forEach((zn) => {
          const p = onBlob(upper, 0.25, zn);
          g.add(ctx.capsule([cx - 0.07, p[1] + 0.016, p[2]], [cx + 0.07, p[1] + 0.016, p[2]], 0.019, lace, { seg: 10 }));
        });
        const tongue = ctx.box(0.1, 0.075, 0.03, up, { radius: 0.014, pos: [cx, 0.272, 0.12], rot: [-0.55, 0, 0] });
        g.add(tongue);
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- penny loafers */
  {
    id: 'loafers',
    name: '로퍼',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const leather = ctx.mat.plastic(c, { roughness: 0.36 });
      const dark = lum(c) > 0.25 ? C.mix(c, '#2b2321', 0.7) : C.mix(c, '#000000', 0.35);
      const soleM = ctx.mat.rubber(dark);
      const seamM = ctx.mat.plastic(deeper(c, 0.22), { roughness: 0.5 });
      const body = ctx.both((s) => {
        const cx = s * FX;
        const upper = upperBlob(K, s, { yt: (zn) => 0.222 - 0.075 * smooth(-0.3, 0.95, zn), W: 0.164, n: 3.0, pToe: 2.0, len: 0.266 }, leather);
        const g = ctx.group(upper, soleBlob(K, s, { h: 0.04, W: 0.176, len: 0.276 }, soleM));
        g.add(ctx.box(0.15, 0.03, 0.1, soleM, { radius: 0.012, pos: [cx, 0.012, -0.12] }));
        g.add(legRing(K, s, 0.214, 0.157, 0.02, seamM));
        // saddle strap with the penny slot
        const zn = 0.16;
        const strap = [];
        for (let k = 0; k <= 10; k++) strap.push(onBlob(upper, 0.035 + (0.43 * k) / 10, zn, 0.008));
        g.add(ctx.tube(strap, 0.017, leather, { seg: 24, radial: 8 }));
        const top = onBlob(upper, 0.25, zn, 0.02);
        g.add(ctx.box(0.05, 0.014, 0.02, ctx.mat.plastic(C.shade(dark, 0.2)), { radius: 0.006, pos: top, rot: [-0.25, 0, 0] }));
        // moc-toe seam
        const seam = [];
        [[0.13, 0.22], [0.13, 0.55], [0.17, 0.8], [0.25, 0.9], [0.33, 0.8], [0.37, 0.55], [0.37, 0.22]].forEach(([u, z]) => seam.push(onBlob(upper, u, z, 0.003)));
        g.add(ctx.tube(seam, 0.0065, seamM, { seg: 40, radial: 6 }));
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- lace-up boots */
  {
    id: 'boots',
    name: '워커 부츠',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const leather = ctx.mat.plastic(c, { roughness: 0.55 });
      const soleC = lum(c) > 0.22 ? '#3a302b' : '#b98a52';
      const soleM = ctx.mat.rubber(soleC);
      const pad = ctx.mat.cloth(lum(c) > 0.5 ? C.shade(c, 0.3) : C.light(c, 0.3), { roughness: 0.8 });
      const lace = ctx.mat.cloth(lum(c) > 0.6 ? '#4a3a30' : '#efe6d4', { roughness: 0.6 });
      const metal = ctx.mat.metal('#d8c27c');
      const top = 0.43;
      // shaft just wider than any slim pant leg (<= 0.194) so trousers tuck in; wide pants still cover it
      const rS = (y) => 0.199 + 0.005 * smooth(0.15, top, y);
      const body = ctx.both((s) => {
        const upper = upperBlob(K, s, { yt: (zn) => 0.255 - 0.06 * smooth(0.05, 0.95, zn), W: 0.18, n: 3.0, pToe: 2.0, len: 0.27, yb: 0.05 }, leather);
        const g = ctx.group(upper, soleBlob(K, s, { h: 0.075, W: 0.196, len: 0.292, n: 6 }, soleM));
        g.add(ctx.box(0.17, 0.03, 0.12, soleM, { radius: 0.012, pos: [s * FX, 0.018, -0.13] }));
        const prof = [[0.001, 0.08], [0.15, 0.09]];
        for (let k = 0; k <= 12; k++) {
          const y = 0.12 + ((top - 0.04 - 0.12) * k) / 12;
          prof.push([rS(y), y]);
        }
        g.add(legShaft(K, s, prof, leather));
        g.add(legShaft(K, s, K.bandProfile(0.17, 0.21, top - 0.045, top + 0.012, 0.016), pad));
        // criss-cross laces with eyelets up the front
        const at = (y, az, d) => [s * LX + (rS(y) + d) * Math.sin(az * DEG), y, (rS(y) + d) * Math.cos(az * DEG)];
        for (let y = 0.17; y < top - 0.06; y += 0.052) {
          g.add(ctx.capsule(at(y, -22, 0.004), at(y + 0.04, 22, 0.004), 0.0095, lace, { seg: 8 }));
          g.add(ctx.capsule(at(y, 22, 0.004), at(y + 0.04, -22, 0.004), 0.0095, lace, { seg: 8 }));
        }
        // eyelet rails on both sides of the lacing
        [-25, 25].forEach((az) => g.add(ctx.tube(K.lin(0.17, top - 0.07, 6).map((y) => at(y, az, 0.0)), 0.009, metal, { seg: 12, radial: 6, caps: true })));
        // laces continue down the instep
        const P = upper.userData.P;
        [0.0, 0.2].forEach((zn) => {
          const p = P(0.25, zn);
          g.add(ctx.capsule([s * FX - 0.055, p[1] + 0.008, p[2]], [s * FX + 0.055, p[1] + 0.008, p[2]], 0.0095, lace, { seg: 8 }));
        });
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- sandals (bare feet) */
  {
    id: 'sandals',
    name: '샌들',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const strapM = ctx.mat.plastic(c, { roughness: 0.45 });
      const bed = ctx.mat.cloth(lum(c) > 0.7 ? '#c9a77a' : '#e3c79c', { roughness: 0.9 });
      const soleM = ctx.mat.rubber(deeper(c, 0.25));
      const metal = ctx.mat.metal('#e2c878');
      const body = ctx.both((s) => {
        const cx = s * FX;
        const g = ctx.group(soleBlob(K, s, { h: 0.03, W: 0.172, len: 0.262, cz: 0.07 }, soleM), soleBlob(K, s, { yb: 0.026, h: 0.046, W: 0.166, len: 0.256, cz: 0.07, n: 4 }, bed));
        // straps that hug the bare foot (foot ellipsoid 0.14 x 0.1 x 0.2 at y 0.1, z 0.07)
        const cross = (zc, tube) => {
          const k = Math.sqrt(Math.max(0, 1 - Math.pow((zc - 0.07) / 0.2, 2)));
          const rx = 0.14 * k + tube * 0.7;
          const ry = 0.1 * k + tube * 0.7;
          const pts = [];
          for (let i = 0; i <= 14; i++) {
            const th = -0.55 + ((Math.PI + 1.1) * i) / 14;
            pts.push([cx + rx * Math.cos(th), 0.1 + ry * Math.sin(th), zc]);
          }
          return ctx.tube(pts, tube, strapM, { seg: 30, radial: 8 });
        };
        g.add(cross(0.2, 0.022), cross(0.07, 0.024));
        // ankle strap + heel strap + buckle
        g.add(legRing(K, s, 0.24, 0.158, 0.018, strapM));
        g.add(ctx.tube([[s * LX, 0.05, -0.14], [s * LX, 0.15, -0.165], [s * LX, 0.24, -0.165]], 0.019, strapM, { seg: 12, radial: 8 }));
        g.add(ctx.box(0.012, 0.04, 0.036, metal, { radius: 0.005, pos: [s * (LX + 0.176), 0.24, 0.02] }));
        return g;
      });
      return { body };
    },
  },
  /* ---------------------------------------------------------------- rain boots */
  {
    id: 'rainboots',
    name: '장화',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const rub = ctx.mat.plastic(c, { roughness: 0.16 });
      const soleM = ctx.mat.plastic(deeper(c, 0.3), { roughness: 0.4 });
      const rimM = ctx.mat.plastic(lum(c) > 0.8 ? C.shade(c, 0.2) : C.light(c, 0.45), { roughness: 0.2 });
      const top = 0.5;
      const rS = (y) => 0.199 + 0.006 * smooth(0.2, top, y);
      const body = ctx.both((s) => {
        const upper = upperBlob(K, s, { yt: (zn) => 0.25 - 0.05 * smooth(0.1, 1, zn), W: 0.186, n: 2.7, pToe: 2.0, len: 0.272, yb: 0.05 }, rub);
        const g = ctx.group(upper, soleBlob(K, s, { h: 0.062, W: 0.198, len: 0.292, n: 5 }, soleM));
        const prof = [[0.001, 0.08], [0.15, 0.09]];
        for (let k = 0; k <= 14; k++) {
          const y = 0.12 + ((top - 0.03 - 0.12) * k) / 14;
          prof.push([rS(y), y]);
        }
        g.add(legShaft(K, s, prof, rub));
        g.add(legShaft(K, s, K.bandProfile(0.176, 0.21, top - 0.04, top + 0.006, 0.014), rimM));
        // little raindrop badge on the outer side
        const d = ctx.shape();
        d.moveTo(0, 0.045);
        d.quadraticCurveTo(0.03, 0.005, 0.026, -0.012);
        d.bezierCurveTo(0.022, -0.04, -0.022, -0.04, -0.026, -0.012);
        d.quadraticCurveTo(-0.03, 0.005, 0, 0.045);
        const drop = ctx.extrude(d, 0.006, rimM, { bevel: 0.004, curveSegments: 12 });
        const y = 0.34;
        drop.position.set(s * (LX + rS(y) + 0.003), y, 0);
        drop.rotation.y = s * Math.PI * 0.5;
        g.add(drop);
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- office slides with three stripes + socks */
  {
    id: 'slides',
    name: '삼선 슬리퍼',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const stripe = lum(c) > 0.72 ? C.mix(c, '#2c3b6a', 0.78) : CREAM;
      const sockC = lum(c) < 0.5 || lum(c) > 0.8 ? '#e6e2da' : '#f6f3ee';
      const sockM = ctx.mat.cloth(lum(c) > 0.8 ? '#a9adb6' : sockC, { roughness: 0.95 });
      const soleM = ctx.mat.rubber(deeper(c, 0.18));
      const tex = K.canvas(64, 256, (g, w, h) => {
        g.fillStyle = c;
        g.fillRect(0, 0, w, h);
        g.fillStyle = stripe;
        [0.3, 0.5, 0.7].forEach((v) => g.fillRect(0, (1 - v) * h - 9, w, 18));
      });
      const bandM = ctx.mat.custom({ color: new ctx.THREE.Color('#ffffff'), map: tex, roughness: 0.45, clearcoat: 0.3, side: ctx.THREE.DoubleSide });
      const edgeM = ctx.mat.plastic(c, { roughness: 0.45 });
      const body = ctx.both((s) => {
        const g = ctx.group(sock(K, s, sockM, 0.3));
        g.add(soleBlob(K, s, { h: 0.06, W: 0.176, len: 0.28, cz: 0.075, n: 4.5 }, soleM));
        const bo = { cz: 0.07, len: 0.226, W: 0.162, yb: 0.04, yt: () => 0.222, n: 2.6, pToe: 2.2, u0: -0.06, u1: 0.56, v0: 0.42, v1: 0.83 };
        const band = upperBlob(K, s, bo, bandM);
        g.add(band);
        const edge = (v) => {
          const pts = [];
          for (let k = 0; k <= 16; k++) pts.push(onBlob(band, -0.06 + (0.62 * k) / 16, -Math.cos(Math.PI * v), 0.002));
          return ctx.tube(pts, 0.012, edgeM, { seg: 30, radial: 8 });
        };
        g.add(edge(0.42), edge(0.83));
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- mary janes + frilly socks */
  {
    id: 'maryjanes',
    name: '메리제인',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      const pat = ctx.mat.plastic(c, { roughness: 0.18 });
      const soleM = ctx.mat.rubber(lum(c) > 0.25 ? C.mix(c, '#2b2321', 0.6) : '#5a4a40');
      const sockM = ctx.mat.cloth(lum(c) > 0.82 ? '#f4c9d4' : '#fbf8f2', { roughness: 0.9 });
      const btn = ctx.mat.plastic(lum(c) > 0.5 ? C.shade(c, 0.45) : C.light(c, 0.5), { roughness: 0.25 });
      const body = ctx.both((s) => {
        const cx = s * FX;
        const upper = upperBlob(K, s, { yt: (zn) => 0.21 - 0.045 * smooth(-0.2, 1, zn), W: 0.17, n: 2.6, pToe: 1.9, len: 0.258 }, pat);
        const g = ctx.group(sock(K, s, sockM, 0.248), upper, soleBlob(K, s, { h: 0.038, W: 0.178, len: 0.27 }, soleM));
        g.add(ctx.box(0.14, 0.04, 0.09, soleM, { radius: 0.014, pos: [cx, 0.018, -0.12] }));
        g.add(legRing(K, s, 0.205, 0.157, 0.016, pat));
        // instep strap with a button on the outer side
        const pts = [];
        for (let k = 0; k <= 10; k++) {
          const th = -0.15 + ((Math.PI + 0.3) * k) / 10;
          pts.push([s * LX + 0.168 * Math.cos(th), 0.2 + 0.035 * Math.sin(th), 0.03 + 0.03 * Math.sin(th)]);
        }
        g.add(ctx.tube(pts, 0.019, pat, { seg: 24, radial: 8 }));
        g.add(ctx.sphere(0.02, btn, { pos: [s * (LX + 0.18), 0.198, 0.03], seg: 14 }));
        // frill on the sock top
        g.add(
          K.sheet({
            ys: K.lin(0.228, 0.256, 3),
            cols: 96,
            cx: s * LX,
            depth: 1,
            r: (y, az) => 0.158 + (y - 0.228) * 0.85 + 0.006 * Math.sin(az * DEG * 16) * ((y - 0.228) / 0.028),
            uv: (y, az) => [az / 360, y],
            mat: sockM,
          })
        );
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
  /* ---------------------------------------------------------------- fluffy house slippers with pom-poms */
  {
    id: 'fluffy',
    name: '털 슬리퍼',
    render(ctx) {
      const K = mk(ctx);
      const c = ctx.color;
      // fuzzy pile: soft speckles in the bump map (deterministic)
      const rnd = CC.rng(11);
      const fuzz = K.canvas(256, 256, (g, w, h) => {
        g.fillStyle = '#c8c8c8';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
          const v = Math.round(150 + rnd() * 105);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, 1.2 + rnd() * 2.2, 0, Math.PI * 2);
          g.fill();
        }
      }, { repeat: [3, 3] });
      const fluffMat = (col) =>
        ctx.mat.custom({
          color: new ctx.THREE.Color(col),
          roughness: 1,
          sheen: 1,
          sheenColor: new ctx.THREE.Color(C.light(col, 0.6)),
          sheenRoughness: 0.8,
          bumpMap: fuzz,
          bumpScale: 2.2,
        });
      const pile = fluffMat(c);
      const cuffC = lum(c) > 0.8 ? C.shade(c, 0.12) : C.light(c, 0.5);
      const cuff = fluffMat(cuffC);
      const pomC = lum(c) > 0.8 ? C.mix(c, '#f2766b', 0.35) : whiteOn(c);
      const pom = fluffMat(pomC);
      const soleM = ctx.mat.rubber(lum(c) > 0.4 ? C.mix(c, '#3b2416', 0.55) : C.light(c, 0.25));
      const body = ctx.both((s) => {
        const shape = { yt: (zn) => 0.262 - 0.07 * smooth(-0.2, 0.95, zn), W: 0.18, n: 2.8, pToe: 1.8, len: 0.27 };
        const upper = upperBlob(K, s, shape, pile);
        const g = ctx.group(upper, soleBlob(K, s, { h: 0.045, W: 0.19, len: 0.284, n: 4 }, soleM));
        // chunky fluffy rim around the ankle opening
        g.add(legRing(K, s, 0.252, 0.163, 0.036, cuff));
        // pom-pom on the instep
        const p = onBlob(upper, 0.25, 0.56, 0.0);
        g.add(ctx.sphere(0.058, pom, { pos: [p[0], p[1] + 0.03, p[2] + 0.006], seg: 24 }));
        return g;
      });
      return { body, hide: ['feet'] };
    },
  },
]);
