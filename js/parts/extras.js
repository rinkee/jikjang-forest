/* Extras — glasses, hats (HEAD SPACE), body accessories (CHARACTER SPACE) and 2D backdrops.
 * Head space: unit sphere head at the origin, +Z = face. Eyes at az ±23 / el -3, ears at az ±88.
 * Character space: feet on y=0, +Z toward the viewer. Body accessories ride at torso inflate >= 0.1.
 * All designs are original (generic cozy-toy shapes), no third-party characters or emblems. */
import { CC } from '../cc.js';

const D = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ====================================================================== shared 3D helpers */

/** average normals of coincident vertices (hides UV seams on displaced spheres) */
function weldNormals(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  map.forEach((ids) => {
    if (ids.length < 2) return;
    let x = 0, y = 0, z = 0;
    ids.forEach((i) => {
      x += nor.getX(i);
      y += nor.getY(i);
      z += nor.getZ(i);
    });
    const l = Math.hypot(x, y, z) || 1;
    ids.forEach((i) => nor.setXYZ(i, x / l, y / l, z / l));
  });
  nor.needsUpdate = true;
  return geo;
}

/** soft fluffy ball (pompoms, puffs): displaced sphere */
function fluff(ctx, r, mat, o) {
  o = o || {};
  const geo = new ctx.THREE.SphereGeometry(1, o.seg || 40, Math.round((o.seg || 40) * 0.7));
  const p = geo.attributes.position;
  const amp = o.amp ?? 0.07;
  const f = o.freq ?? 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n =
      Math.sin(x * f + 1.3) * Math.sin(y * f + 0.4) * Math.sin(z * f + 2.1) +
      0.5 * Math.sin(x * f * 2.1 + 0.7) * Math.sin(y * f * 1.9 + 1.1) * Math.sin(z * f * 2.3);
    const k = r * (1 + amp * n);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  weldNormals(geo);
  return ctx.mesh(geo, mat, o);
}

/**
 * Flat strap / ribbon band along a smooth curve. Cross-section is a rounded
 * rectangle (width along the binormal, thickness along `outward`).
 * o.outward(p) -> Vector3 (default: horizontal radial from the Y axis), o.closed, o.seg
 */
function strap(ctx, pts, width, thick, mat, o) {
  o = o || {};
  const THREE = ctx.THREE;
  const vs = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
  const curve = new THREE.CatmullRomCurve3(vs, !!o.closed, 'centripetal');
  const N = o.seg || 64;
  const M = 16;
  const outward = o.outward || ((p) => new THREE.Vector3(p.x, 0, p.z));
  const pos = [];
  const uvs = [];
  const idx = [];
  const rings = o.closed ? N : N + 1;
  const prevN = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const t = i / N;
    const P = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    let Nn = outward(P, t).clone();
    if (Nn.lengthSq() < 1e-8) Nn.copy(prevN.lengthSq() ? prevN : new THREE.Vector3(0, 0, 1));
    Nn.addScaledVector(T, -Nn.dot(T)).normalize();
    prevN.copy(Nn);
    const B = new THREE.Vector3().crossVectors(T, Nn).normalize();
    const w = typeof width === 'function' ? width(t) : width;
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.45);
      const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.45);
      pos.push(P.x + B.x * sx * w * 0.5 + Nn.x * sy * thick * 0.5, P.y + B.y * sx * w * 0.5 + Nn.y * sy * thick * 0.5, P.z + B.z * sx * w * 0.5 + Nn.z * sy * thick * 0.5);
      uvs.push(t, (sx + 1) / 2);
    }
  }
  const segs = o.closed ? N : N;
  for (let i = 0; i < segs; i++) {
    const i2 = o.closed ? (i + 1) % N : i + 1;
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const a = i * M + j, b = i2 * M + j, c = i2 * M + j2, d = i * M + j2;
      idx.push(a, b, d, b, c, d);
    }
  }
  if (!o.closed && o.caps !== false) {
    [0, N].forEach((ri) => {
      const ci = pos.length / 3;
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < M; j++) {
        cx += pos[(ri * M + j) * 3];
        cy += pos[(ri * M + j) * 3 + 1];
        cz += pos[(ri * M + j) * 3 + 2];
      }
      pos.push(cx / M, cy / M, cz / M);
      uvs.push(ri / N, 0.5);
      for (let j = 0; j < M; j++) {
        const j2 = (j + 1) % M;
        if (ri === 0) idx.push(ci, ri * M + j2, ri * M + j);
        else idx.push(ci, ri * M + j, ri * M + j2);
      }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return ctx.mesh(geo, mat, o);
}

/** parametric surface fn(u, v) -> [x, y, z] (u, v in 0..1) */
function surface(ctx, nu, nv, fn, mat, o) {
  const THREE = ctx.THREE;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      pos.push(p[0], p[1], p[2]);
      uv.push(i / nu, 1 - j / nv);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return ctx.mesh(geo, mat, o);
}

/** closed polygon [[x,y]..] (+ holes) -> THREE.Shape */
function toShape(ctx, pts, holes) {
  const s = new ctx.THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  (holes || []).forEach((h) => {
    const p = new ctx.THREE.Path();
    h.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    s.holes.push(p);
  });
  return s;
}

/** CCW outline from a parametric fn(t) with t in 0..2PI */
function outline(fn, n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(fn((i / n) * Math.PI * 2));
  return pts;
}

/** offset a CCW outline outward by w along (smoothed) normals */
function offsetPts(pts, w, smoothPasses = 2) {
  const n = pts.length;
  let N = pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];
  });
  for (let s = 0; s < smoothPasses; s++) {
    N = N.map((_, i) => {
      let x = 0, y = 0;
      for (let k = -2; k <= 2; k++) {
        const q = N[(i + k + n) % n];
        x += q[0];
        y += q[1];
      }
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    });
  }
  return pts.map((p, i) => [p[0] + N[i][0] * w, p[1] + N[i][1] * w]);
}

/** smooth closed outline through CCW control points [[x,y]..] */
function splineOutline(ctx, ctrl, n = 140) {
  const c = new ctx.THREE.CatmullRomCurve3(ctrl.map(([x, y]) => new ctx.THREE.Vector3(x, y, 0)), true, 'centripetal');
  return c.getSpacedPoints(n).slice(0, n).map((v) => [v.x, v.y]);
}

/** mirror an outline horizontally (keeps CCW order) */
const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

/** rounded-rectangle profile ring in (rho, elevation) space for lathe bands (CCW) */
function bandProfile(rIn, rOut, e0, e1, n = 40, p = 0.35) {
  const rc = (rIn + rOut) / 2;
  const hr = (rOut - rIn) / 2;
  const ec = (e0 + e1) / 2;
  const he = (e1 - e0) / 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 + Math.PI * 1.5; // start at the bottom
    const c = Math.cos(t);
    const s = Math.sin(t);
    const rho = rc + hr * Math.sign(c) * Math.pow(Math.abs(c), p);
    const e = (ec + he * Math.sign(s) * Math.pow(Math.abs(s), p)) * D;
    pts.push([rho * Math.cos(e), rho * Math.sin(e)]);
  }
  return pts;
}

/** dome profile (bottom -> top) on a sphere-ish surface: r(e) radius, k stretches the crown */
function domeProfile(R, e0, n = 26, k = 0, bulge = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const e = (e0 + ((90 - e0) * i) / n) * D;
    const s = Math.sin(e);
    const rr = R * (1 + bulge * Math.sin(e * 2) * 0.5);
    pts.push([rr * Math.cos(e), rr * s * (1 + k * s * s * s)]);
  }
  pts[pts.length - 1][0] = 0;
  return pts;
}

/** bow wing: extends along +X from the knot (0) to L, H tall, T thick, with a soft fold */
function bowWing(ctx, mat, L, H, T, o) {
  const geo = new ctx.THREE.SphereGeometry(1, 36, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = (x + 1) / 2;
    const pinch = 0.32 + 0.68 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.5);
    let zz = z * (T / 2) * (0.55 + 0.45 * pinch);
    if (z > 0) zz *= 1 - 0.45 * Math.exp(-Math.pow(y / 0.32, 2)) * smoothstep(0.95, 0.35, u);
    p.setXYZ(i, u * L, y * (H / 2) * pinch + u * u * (o && o.lift ? o.lift : 0), zz);
  }
  geo.computeVertexNormals();
  weldNormals(geo);
  return ctx.mesh(geo, mat, o);
}

/** a whole bow (two wings + knot + optional tails) in local XY facing +Z */
function makeBow(ctx, mat, o) {
  o = o || {};
  const L = o.L ?? 0.36;
  const H = o.H ?? 0.3;
  const T = o.T ?? 0.13;
  const g = ctx.group();
  [-1, 1].forEach((s) => {
    const w = bowWing(ctx, mat, L, H, T, { lift: o.lift ?? 0.04 });
    w.scale.x = s;
    w.rotation.z = s * (o.spread ?? 0.12);
    g.add(w);
  });
  g.add(ctx.ellipsoid(L * 0.26, H * 0.36, T * 0.62, o.knotMat || mat, { pos: [0, 0, T * 0.12] }));
  if (o.tails) {
    const tl = o.tails;
    [-1, 1].forEach((s) => {
      const sh = [
        [-0.05, 0],
        [0.05, 0],
        [0.075, -tl * 0.7],
        [0.06, -tl],
        [0.0, -tl * 0.86],
        [-0.065, -tl * 0.96],
        [-0.075, -tl * 0.7],
      ];
      const t = ctx.extrude(toShape(ctx, sh), T * 0.22, mat, { bevel: 0.018 });
      t.position.set(s * 0.03, -H * 0.05, -T * 0.08);
      t.rotation.z = s * 0.38;
      g.add(t);
    });
  }
  return g;
}

/* ====================================================================== GLASSES (head space) */
const GL = { az: 23, el: -3, r: 1.065 };

/** superellipse point at parameter t; topW widens the top edge (trapezoid) */
const rectPt = (rx, ry, p = 4, topW = 1) => (t) => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const x = rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
  const y = ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
  return [x * (1 + (topW - 1) * (y / ry)), y];
};
const shapes = {
  circle: (rx, ry = rx) => outline((t) => [rx * Math.cos(t), ry * Math.sin(t)]),
  rect: (rx, ry, p = 4, topW = 1) => outline(rectPt(rx, ry, p, topW), 120),
  heart: (s) =>
    outline((t) => {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [x * s, (y + 2.5) * s];
    }, 160)
      .reverse(),
  /** chunky heart with a soft, rounded notch (safe to offset into a frame); about 2s wide, 1.85s tall */
  heartRound: (ctx, s) =>
    splineOutline(
      ctx,
      [
        [0, -1.0], [0.36, -0.68], [0.74, -0.26], [0.97, 0.2], [0.9, 0.62], [0.58, 0.86], [0.24, 0.8], [0, 0.56],
        [-0.24, 0.8], [-0.58, 0.86], [-0.9, 0.62], [-0.97, 0.2], [-0.74, -0.26], [-0.36, -0.68],
      ].map(([x, y]) => [x * s, (y + 0.07) * s]),
      160
    ),
  star: (rIn, rOut, n = 5) =>
    outline((t) => {
      const k = Math.pow(0.5 + 0.5 * Math.cos(n * (t - Math.PI / 2)), 1.5);
      const r = rIn + (rOut - rIn) * k;
      return [r * Math.cos(t), r * Math.sin(t)];
    }, 200),
};

/** frame ring + lens for one eye, in a local plane facing +Z */
function lensUnit(ctx, inner, o) {
  const outer = offsetPts(inner, o.w);
  const g = ctx.group();
  if (!o.noFrame) g.add(ctx.extrude(toShape(ctx, outer, [inner]), o.depth ?? 0.04, o.frameMat, { bevel: o.bevel ?? 0.016 }));
  if (o.lensMat) {
    const lens = ctx.mesh(new ctx.THREE.ShapeGeometry(toShape(ctx, offsetPts(inner, Math.min(0.02, o.w * 0.5)))), o.lensMat);
    if (o.lensMat.transparent) lens.renderOrder = 3;
    g.add(lens);
    if (o.shine) {
      // painted highlight streak (toy look)
      const xs = inner.map((p) => p[0]);
      const ys = inner.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const hl = ctx.capsule([-w * 0.24, h * 0.06, 0.012], [-w * 0.08, h * 0.26, 0.012], Math.min(w, h) * 0.05, o.shine);
      hl.scale.z = 0.25;
      if (o.shine.transparent) hl.renderOrder = 4;
      g.add(hl);
    }
  }
  return { g, outer };
}

/**
 * Two-lens glasses. o.inner(side) -> CCW outline of the lens hole for that side.
 * o: w (rim width), depth, bevel, frameMat, lensMat, shine, bridge ('arc'|'double'|false), templeR, el, r
 */
function glasses(ctx, o) {
  const THREE = ctx.THREE;
  const H = ctx.head;
  const g = ctx.group();
  const r = o.r ?? GL.r;
  const el = o.el ?? GL.el;
  const anchors = {};
  [-1, 1].forEach((side) => {
    const inner = o.inner(side);
    const { g: lg, outer } = lensUnit(ctx, inner, o);
    H.stick(lg, side * GL.az * (o.wrap ?? 0.85), el, r);
    lg.position.copy(H.at(side * GL.az, el, r));
    lg.updateMatrix();
    g.add(lg);
    // anchor points: outermost / innermost rim points near the lens's upper middle
    const band = outer.filter((p) => p[1] > (o.anchorY ?? 0.02) - 0.08 && p[1] < (o.anchorY ?? 0.02) + 0.08);
    const xs = (band.length ? band : outer).map((p) => p[0]);
    const xo = side > 0 ? Math.max(...xs) : Math.min(...xs);
    const xi = side > 0 ? Math.min(...xs) : Math.max(...xs);
    anchors[side] = {
      hinge: new THREE.Vector3(xo - side * 0.03, o.anchorY ?? 0.02, -0.012).applyMatrix4(lg.matrix),
      bridge: new THREE.Vector3(xi + side * 0.025, (o.bridgeY ?? o.anchorY ?? 0.04), 0).applyMatrix4(lg.matrix),
      matrix: lg.matrix.clone(),
      outer,
    };
  });
  const fm = o.templeMat || o.frameMat;
  const tr = o.templeR ?? 0.024;
  // bridge over the nose
  if (o.bridge !== false) {
    const a = anchors[-1].bridge;
    const b = anchors[1].bridge;
    const mid = H.at(0, el + (o.bridgeLift ?? 3), r + 0.03);
    g.add(ctx.tube([a, mid, b], o.bridgeR ?? 0.026, o.bridgeMat || o.frameMat, { caps: true, seg: 24, radial: 12 }));
    if (o.bridge === 'double') {
      const a2 = a.clone().add(new THREE.Vector3(0, 0.1, 0));
      const b2 = b.clone().add(new THREE.Vector3(0, 0.1, 0));
      g.add(ctx.tube([a2, H.at(0, el + 9, r + 0.035), b2], 0.02, o.bridgeMat || o.frameMat, { caps: true, seg: 24, radial: 10 }));
    }
  }
  // temples: hinge -> along the head side -> over the ear -> tuck behind it
  if (o.temples !== false) {
    [-1, 1].forEach((s) => {
      const h = anchors[s].hinge;
      const pts = [h, H.at(s * 50, el + 4, r - 0.01), H.at(s * 66, el + 5, r - 0.02), H.at(s * 80, el + 6, 1.05), H.at(s * 90, 9, 1.035), H.at(s * 100, 2, 0.97)];
      g.add(ctx.tube(pts, tr, fm, { caps: true, seg: 40, radial: 10 }));
      // hinge block
      const hb = ctx.box(0.06, 0.07, 0.07, fm, { radius: 0.02 });
      H.stick(hb, s * 45, el + 3, r - 0.005);
      hb.position.copy(h).lerp(H.at(s * 47, el + 3.5, r - 0.005), 0.5);
      g.add(hb);
    });
  }
  g.userData.anchors = anchors;
  return g;
}

const clearLens = (ctx, c) => ctx.mat.glass(CC.color.mix(c || '#dff2ff', '#ffffff', 0.55), 0.16);
const shineMat = (ctx) => ctx.mat.custom({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.2, depthWrite: false });
const frameMat = (ctx, c) => ctx.mat.plastic(c || ctx.color, { roughness: 0.28 });

CC.register('glasses', [
  { id: 'none', name: '없음', render: () => null },
  {
    id: 'round',
    name: '동글 안경',
    render(ctx) {
      return glasses(ctx, {
        inner: () => shapes.circle(0.205),
        w: 0.034,
        bevel: 0.013,
        depth: 0.03,
        frameMat: frameMat(ctx),
        lensMat: clearLens(ctx),
        shine: shineMat(ctx),
        templeR: 0.02,
        bridgeR: 0.022,
      });
    },
  },
  {
    id: 'square',
    name: '사각 사무실 안경',
    render(ctx) {
      return glasses(ctx, {
        inner: () => shapes.rect(0.235, 0.165, 4.2, 1.06),
        w: 0.045,
        bevel: 0.015,
        depth: 0.04,
        frameMat: frameMat(ctx),
        lensMat: clearLens(ctx),
        shine: shineMat(ctx),
        anchorY: 0.06,
        bridgeY: 0.07,
      });
    },
  },
  {
    id: 'biground',
    name: '왕동글 안경',
    render(ctx) {
      return glasses(ctx, {
        inner: () => shapes.circle(0.262),
        w: 0.05,
        bevel: 0.018,
        depth: 0.05,
        r: 1.085,
        frameMat: frameMat(ctx),
        lensMat: ctx.mat.glass(CC.color.mix(ctx.color, '#ffffff', 0.7), 0.2),
        shine: shineMat(ctx),
        bridgeLift: 2,
        bridgeY: 0.02,
      });
    },
  },
  {
    id: 'cateye',
    name: '고양이눈 안경',
    render(ctx) {
      return glasses(ctx, {
        inner: (side) => {
          const p = splineOutline(ctx, [
            [0.3, 0.2], [0.14, 0.165], [-0.04, 0.14], [-0.19, 0.1], [-0.235, 0.01], [-0.2, -0.095],
            [-0.08, -0.145], [0.07, -0.145], [0.19, -0.095], [0.245, 0.02],
          ]);
          return side > 0 ? p : mirrorPts(p);
        },
        w: 0.05,
        bevel: 0.016,
        depth: 0.045,
        frameMat: frameMat(ctx),
        lensMat: clearLens(ctx, ctx.color),
        shine: shineMat(ctx),
        anchorY: 0.1,
        bridgeY: 0.05,
      });
    },
  },
  {
    id: 'browline',
    name: '반무테 안경',
    render(ctx) {
      const THREE = ctx.THREE;
      const top = frameMat(ctx);
      const wire = ctx.mat.metal(CC.color.mix('#d4d7de', ctx.color, 0.12), { roughness: 0.3 });
      const rp = rectPt(0.225, 0.165, 3.2, 1.04);
      const g = glasses(ctx, {
        inner: () => shapes.rect(0.225, 0.165, 3.2, 1.04),
        w: 0.03,
        noFrame: true,
        frameMat: wire,
        lensMat: clearLens(ctx),
        shine: shineMat(ctx),
        anchorY: 0.1,
        bridgeY: 0.1,
        templeMat: top,
        bridgeMat: top,
        bridgeLift: 6,
      });
      // chunky upper brow bar + thin wire lower rim on each lens
      [-1, 1].forEach((side) => {
        const a = g.userData.anchors[side];
        const inner = shapes.rect(0.225, 0.165, 3.2, 1.04);
        const upper = inner.filter((p) => p[1] > -0.005);
        upper.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
        const outerArc = offsetPts(inner, 0.075).filter((p) => p[1] > 0.0).map(([x, y]) => [x * 1.04, y + 0.012]);
        outerArc.sort((p, q) => Math.atan2(q[1], q[0]) - Math.atan2(p[1], p[0]));
        const shape = upper.concat(outerArc.map(([x, y]) => [x, y]));
        const bar = ctx.extrude(toShape(ctx, shape), 0.055, top, { bevel: 0.018 });
        bar.applyMatrix4(a.matrix);
        g.add(bar);
        // lower wire rim: the bottom half of the outline, ends tucked under the bar
        const lpts = [];
        for (let i = 0; i <= 32; i++) {
          const [x, y] = rp(Math.PI - 0.12 + ((Math.PI + 0.24) * i) / 32);
          lpts.push(new THREE.Vector3(x, y, 0).applyMatrix4(a.matrix));
        }
        g.add(ctx.tube(lpts, 0.019, wire, { caps: true, seg: 48, radial: 8 }));
      });
      return g;
    },
  },
  {
    id: 'sunglasses',
    name: '선글라스',
    render(ctx) {
      const lens = ctx.mat.custom({
        color: CC.color.mix(ctx.color, '#141420', 0.82),
        roughness: 0.08,
        metalness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      });
      return glasses(ctx, {
        inner: () => shapes.rect(0.25, 0.185, 3.6, 1.12),
        w: 0.05,
        bevel: 0.018,
        depth: 0.045,
        frameMat: frameMat(ctx),
        lensMat: lens,
        shine: ctx.mat.flat('#ffffff'),
        anchorY: 0.08,
        bridgeY: 0.08,
      });
    },
  },
  {
    id: 'heart',
    name: '하트 선글라스',
    render(ctx) {
      const tint = ctx.mat.glass(CC.color.mix(ctx.color, '#3a0d22', 0.35), 0.68);
      return glasses(ctx, {
        inner: () => shapes.heartRound(ctx, 0.25),
        w: 0.05,
        bevel: 0.018,
        depth: 0.05,
        r: 1.085,
        frameMat: frameMat(ctx),
        lensMat: tint,
        shine: shineMat(ctx),
        anchorY: 0.1,
        bridgeY: 0.1,
        bridgeLift: 6,
      });
    },
  },
  {
    id: 'star',
    name: '별 파티 안경',
    render(ctx) {
      const fm = frameMat(ctx);
      const g = glasses(ctx, {
        inner: () => shapes.star(0.14, 0.27),
        w: 0.055,
        bevel: 0.018,
        depth: 0.05,
        r: 1.09,
        frameMat: fm,
        lensMat: ctx.mat.glass(CC.color.mix(ctx.color, '#fff4c2', 0.6), 0.22),
        anchorY: 0.0,
        bridgeY: 0.02,
      });
      // glitter balls on the star tips
      const glit = ctx.mat.plastic(CC.color.isDark(ctx.color) ? '#ffd75e' : CC.color.mix(ctx.color, '#ffffff', 0.65), { roughness: 0.15 });
      [-1, 1].forEach((side) => {
        const m = g.userData.anchors[side].matrix;
        for (let k = 0; k < 5; k++) {
          const a = Math.PI / 2 + (k * Math.PI * 2) / 5;
          const p = new ctx.THREE.Vector3(Math.cos(a) * 0.335, Math.sin(a) * 0.335, 0.03).applyMatrix4(m);
          g.add(ctx.sphere(0.032, glit, { pos: p, seg: 16 }));
        }
      });
      return g;
    },
  },
  {
    id: 'monocle',
    name: '외알 안경',
    render(ctx) {
      const THREE = ctx.THREE;
      const H = ctx.head;
      const gold = ctx.mat.metal(CC.color.isDark(ctx.color) ? '#d9b45a' : CC.color.mix(ctx.color, '#e9c46a', 0.35), { roughness: 0.25 });
      const g = ctx.group();
      const inner = shapes.circle(0.215);
      const { g: lg } = lensUnit(ctx, inner, { w: 0.045, bevel: 0.016, depth: 0.04, frameMat: frameMat(ctx), lensMat: clearLens(ctx), shine: shineMat(ctx) });
      H.stick(lg, GL.az * 0.85, GL.el + 1, GL.r);
      lg.position.copy(H.at(GL.az, GL.el + 1, GL.r));
      lg.updateMatrix();
      g.add(lg);
      // little gold knob and a droopy cord hooked to the ear
      const knob = new THREE.Vector3(0.2, -0.13, 0).applyMatrix4(lg.matrix);
      g.add(ctx.sphere(0.035, gold, { pos: knob, seg: 18 }));
      g.add(
        ctx.tube([knob, H.at(38, -21, 1.035), H.at(54, -25, 1.025), H.at(70, -21, 1.025), H.at(84, -12, 1.03), H.at(94, -4, 0.99)], 0.018, gold, {
          caps: true,
          seg: 48,
          radial: 8,
        })
      );
      return g;
    },
  },
  {
    id: 'goggles',
    name: '물안경',
    render(ctx) {
      const THREE = ctx.THREE;
      const H = ctx.head;
      const c = ctx.color;
      const rub = ctx.mat.rubber(c);
      const deep = ctx.mat.rubber(CC.color.isDark(c) ? CC.color.light(c, 0.24) : CC.color.shade(c, 0.22));
      const lensM = ctx.mat.custom({
        color: CC.color.mix('#5fc6f0', c, 0.15),
        roughness: 0.04,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const shine = shineMat(ctx);
      const g = ctx.group();
      const ends = {};
      const RX = 0.205;
      const RY = 0.165;
      const inner = shapes.circle(RX, RY);
      [-1, 1].forEach((s) => {
        const cup = ctx.group();
        // soft skirt toward the face (deep tone) + chunky rounded front rim (colour)
        cup.add(ctx.extrude(toShape(ctx, offsetPts(inner, 0.045), [offsetPts(inner, -0.012)]), 0.09, deep, { bevel: 0.026, pos: [0, 0, -0.035] }));
        cup.add(ctx.extrude(toShape(ctx, offsetPts(inner, 0.066), [inner]), 0.06, rub, { bevel: 0.03, pos: [0, 0, 0.045] }));
        // bubble lens tucked under the rim
        const dome = ctx.mesh(new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, 0.9), lensM);
        const sz = 0.075 / (1 - Math.cos(0.9));
        dome.rotation.x = Math.PI / 2;
        dome.scale.set((RX + 0.012) / Math.sin(0.9), (RY + 0.012) / Math.sin(0.9), sz);
        dome.position.z = 0.05 - Math.cos(0.9) * sz;
        dome.renderOrder = 3;
        cup.add(dome);
        const hl = ctx.capsule([-0.105, 0.035, 0.112], [-0.045, 0.095, 0.112], 0.02, shine);
        hl.scale.z = 0.4;
        hl.renderOrder = 4;
        cup.add(hl);
        cup.add(ctx.sphere(0.016, shine, { pos: [0.075, -0.07, 0.11], seg: 12 }));
        // strap clip on the outer side
        cup.add(ctx.box(0.07, 0.1, 0.08, deep, { radius: 0.03, pos: [s * (RX + 0.07), 0.0, 0.02] }));
        H.stick(cup, s * GL.az * 0.8, GL.el, 0.99);
        cup.position.copy(H.at(s * GL.az, GL.el, 0.99));
        cup.updateMatrix();
        g.add(cup);
        ends[s] = {
          outer: new THREE.Vector3(s * (RX + 0.1), 0.0, 0.0).applyMatrix4(cup.matrix),
          inner: new THREE.Vector3(-s * (RX + 0.04), 0.0, 0.06).applyMatrix4(cup.matrix),
        };
      });
      // nose strap
      g.add(ctx.tube([ends[-1].inner, H.at(0, GL.el + 2, 1.1), ends[1].inner], 0.032, rub, { caps: true, seg: 20, radial: 10 }));
      // wide head strap: above the ears and around the back; rides on top of the hair (hugHair)
      const elAt = (az) => GL.el + 3 + 10 * Math.pow(Math.sin(az * D), 2) + 4 * Math.max(0, -Math.cos(az * D));
      const pts = [ends[1].outer, H.at(58, GL.el + 2, 1.035)];
      for (let az = 70; az <= 290; az += 10) pts.push(H.at(az, elAt(az), 1.03));
      pts.push(H.at(-58, GL.el + 2, 1.035), ends[-1].outer);
      const band = strap(ctx, pts, 0.115, 0.036, rub, { outward: (p) => p.clone(), seg: 120 });
      g.add(band);
      hugHair(ctx, g, [band], { r0: 1.03, half: 0.018, gap: 0.01, az0: 52, az1: 78, elAt, win: 6 });
      return g;
    },
  },
]);

/**
 * Make head-space meshes (a strap around the head) ride on top of whatever hair is worn:
 * vertices are pushed out radially to the hair surface, blended in from |az| = az0..az1 so the
 * front stays where it is. Refits whenever the hair (or its visible variant) changes.
 */
function hugHair(ctx, root, meshes, o) {
  const THREE = ctx.THREE;
  const base = meshes.map((m) => Float32Array.from(m.geometry.attributes.position.array));
  let lastKey = null;
  root.updateMatrixWorld = function (force) {
    const head = this.parent;
    if (head) {
      const hair = head.children.filter((c) => c !== this && c.userData && c.userData.cat === 'hair');
      const key = hairSignature(hair);
      if (key !== lastKey) {
        lastKey = key;
        let prof = null;
        try {
          prof = hairBand(THREE, hair, o.elAt, o.win);
        } catch (e) {
          prof = null;
        }
        meshes.forEach((m, mi) => {
          const pos = m.geometry.attributes.position;
          const b = base[mi];
          for (let i = 0; i < pos.count; i++) {
            const x = b[3 * i];
            const y = b[3 * i + 1];
            const z = b[3 * i + 2];
            const r = Math.hypot(x, y, z) || 1;
            const az = Math.atan2(x, z) / D;
            const w = smoothstep(o.az0, o.az1, Math.abs(az));
            const need = prof ? Math.max(0, prof(az) + o.gap + o.half - o.r0) : 0;
            const k = (r + w * need) / r;
            pos.setXYZ(i, x * k, y * k, z * k);
          }
          pos.needsUpdate = true;
          m.geometry.computeVertexNormals();
          m.geometry.computeBoundingSphere();
        });
      }
    }
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
  return root;
}

/** outer radius of the visible hair volume per 10-degree azimuth bin, within +-win degrees of elAt(az) */
function hairBand(THREE, roots, elAt, win) {
  const N = 36;
  const bins = new Float32Array(N).fill(1.0);
  let flagged = false;
  roots.forEach((r) => r.traverse((m) => (flagged = flagged || !!(m.isMesh && m.userData.hairVolume))));
  roots.forEach((root) =>
    walkMeshes(THREE, root, new THREE.Matrix4(), (mesh, MM) => {
      if (flagged && !mesh.userData.hairVolume) return;
      eachVert(THREE, mesh, MM, 4000, (v) => {
        const r = v.length();
        if (r < 0.8) return;
        const az = Math.atan2(v.x, v.z) / D;
        const el = Math.asin(clamp(v.y / r, -1, 1)) / D;
        if (Math.abs(el - elAt(az)) > win) return;
        const k = Math.floor((az + 180) / 10) % N;
        if (r > bins[k]) bins[k] = r;
      });
    })
  );
  const dil = Array.from(bins, (v, i) => Math.max(v, bins[(i + 1) % N], bins[(i + N - 1) % N]));
  return (az) => {
    const f = (az + 180) / 10 - 0.5;
    const i0 = Math.floor(f);
    const t = f - i0;
    const a = dil[((i0 % N) + N) % N];
    const b = dil[(((i0 + 1) % N) + N) % N];
    return a + (b - a) * t;
  };
}

/* ====================================================================== HATS (head space) */
/* hats are built in a "hat frame" (crown +Y, front +Z) around the unit head; hair reaches ~1.12-1.2 */

/**
 * Hats adapt to the hairstyle underneath. The hat measures the hair object that sits next
 * to it on the head (its visible main-volume meshes, userData.hairVolume, above the hat's
 * rim) and picks the smallest uniform scale + small forward/back shift that still encloses
 * every hair point, so quiffs / spikes never poke through and the back does not float.
 * Buns and the squashed "hat hair" variants are handled by hair.js (hideUnderHats); the hat
 * refits whenever the visible hair variant changes. Runs inside updateMatrixWorld, so it also
 * refits when only the hair changes (the hat is not rebuilt then) and works for single-frame
 * thumbnail renders.
 */
const HAIR_REF = 1.19; // hair radius the hats are modelled for (their inner surface is >= 1.235)

/** visit every visible mesh under obj with its matrix relative to obj's parent */
function walkMeshes(THREE, obj, M, fn) {
  if (obj.visible === false) return;
  if (obj.matrixAutoUpdate) obj.updateMatrix();
  const MM = M.clone().multiply(obj.matrix);
  if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) fn(obj, MM);
  obj.children.forEach((c) => walkMeshes(THREE, c, MM, fn));
}
function eachVert(THREE, mesh, MM, maxN, fn) {
  const p = mesh.geometry.attributes.position;
  const step = Math.max(1, Math.floor(p.count / maxN));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += step) fn(v.fromBufferAttribute(p, i).applyMatrix4(MM));
}
/** cheap signature of which hair variants are showing (hair.js swaps them under hats) */
function hairSignature(roots) {
  let sig = '';
  roots.forEach((r) => {
    sig += r.uuid;
    r.traverse((o) => {
      if (o.userData.hatMode || o.userData.hatDir) sig += o.visible ? '1' : '0';
    });
  });
  return sig || 'bald';
}

/** smallest uniform scale k (and z shift) so the hat encloses the hair volume above its rim */
function fitHat(THREE, roots, o) {
  const t = (o.tilt || 0) * D;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const sr = Math.sin((o.rim ?? 6) * D);
  let flagged = false;
  roots.forEach((r) => r.traverse((m) => (flagged = flagged || !!(m.isMesh && m.userData.hairVolume))));
  const P = [];
  roots.forEach((root) =>
    walkMeshes(THREE, root, new THREE.Matrix4(), (mesh, MM) => {
      if (flagged && !mesh.userData.hairVolume) return; // buns / tails / ties do not size the hat
      eachVert(THREE, mesh, MM, 2500, (v) => {
        const r = v.length();
        if (r < 0.85) return;
        if ((v.y * ct - v.z * st) / r < sr) return; // below the hat's rim (hat frame)
        P.push(v.x, v.y, v.z);
      });
    })
  );
  let best = { k: 1.04 / HAIR_REF, oz: 0, score: 9 };
  for (let oz = -0.06; oz <= 0.2201; oz += 0.02) {
    let m = 1.04 + Math.abs(oz); // never smaller than the bare skull
    for (let i = 0; i < P.length; i += 3) {
      const dz = P[i + 2] - oz;
      const d = P[i] * P[i] + P[i + 1] * P[i + 1] + dz * dz;
      if (d > m * m) m = Math.sqrt(d);
    }
    const k = m / HAIR_REF;
    const score = k + 0.08 * Math.abs(oz);
    if (score < best.score) best = { k, oz, score };
  }
  best.k = clamp(best.k, 0.9, 1.45);
  return best;
}

function fitToHair(ctx, outer, inner, base, o) {
  const THREE = ctx.THREE;
  let lastKey = null;
  const home = outer.position.clone();
  inner.scale.setScalar(base);
  outer.updateMatrixWorld = function (force) {
    const head = this.parent;
    if (head) {
      const hair = head.children.filter((c) => c !== this && c.userData && c.userData.cat === 'hair');
      const key = hairSignature(hair);
      if (key !== lastKey) {
        lastKey = key;
        let f = { k: 1, oz: 0 };
        try {
          f = fitHat(THREE, hair, o);
        } catch (e) {
          f = { k: 1, oz: 0 };
        }
        inner.scale.setScalar(base * f.k);
        this.position.set(home.x, home.y, home.z + f.oz);
        this.userData.hairFit = f.k;
        if (o.adjust) {
          try {
            o.adjust(hair);
          } catch (e) {
            /* keep the default placement */
          }
        }
      }
    }
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
  return outer;
}

/**
 * put a hat-frame object on the head: tilt back (deg), roll (deg), small offsets; fits the hair.
 * o.rim: hat-frame elevation (deg) of the lowest edge that has to clear the hair.
 * o.adjust(hairRoots): optional re-placement hook, called whenever the hair changes.
 */
function wear(ctx, inner, o) {
  o = o || {};
  const g = ctx.group(inner);
  g.rotation.set(-(o.tilt ?? 10) * D, (o.yaw ?? 0) * D, (o.roll ?? 0) * D, 'YXZ');
  g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? -0.01);
  return o.fit === false ? g : fitToHair(ctx, g, inner, o.scale ?? 1, { tilt: o.tilt ?? 10, rim: o.rim ?? 6, adjust: o.adjust });
}

/** polygon with rounded corners -> outline points (CCW in, CCW out) */
function roundedPoly(pts, r, seg = 8) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    const A = pts[(i - 1 + n) % n];
    const B = pts[(i + 1) % n];
    const rr = Array.isArray(r) ? r[i] : r;
    const da = Math.hypot(A[0] - P[0], A[1] - P[1]);
    const db = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const k = Math.min(rr, da * 0.48, db * 0.48);
    const p0 = [P[0] + ((A[0] - P[0]) / da) * k, P[1] + ((A[1] - P[1]) / da) * k];
    const p1 = [P[0] + ((B[0] - P[0]) / db) * k, P[1] + ((B[1] - P[1]) / db) * k];
    for (let j = 0; j <= seg; j++) {
      const t = j / seg;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * P[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * P[1] + t * t * p1[1]]);
    }
  }
  return out;
}

/** a leaf outline (base at 0,0, tip at 0,L) */
function leafPts(ctx, L, W, o) {
  o = o || {};
  const tip = o.tip ?? 0.0;
  return splineOutline(
    ctx,
    [
      [0, 0],
      [W * 0.42, L * 0.18],
      [W * 0.5, L * 0.48],
      [W * 0.3, L * 0.8],
      [tip, L],
      [-W * 0.3, L * 0.8],
      [-W * 0.5, L * 0.48],
      [-W * 0.42, L * 0.18],
    ].reverse(),
    96
  );
}

/** bend extruded/flat geometry: dz(x, y) added along local z */
function bendGeo(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + fn(p.getX(i), p.getY(i)));
  geo.computeVertexNormals();
  return geo;
}

const pale = (c, t) => CC.color.mix(c, '#ffffff', t);
const accentOn = (c) => (CC.color.luminance(c) > 0.62 ? CC.color.shade(c, 0.35) : pale(c, 0.72));

CC.register('hat', [
  { id: 'none', name: '없음', render: () => null },
  {
    id: 'beanie',
    name: '방울 비니',
    render(ctx) {
      const c = ctx.color;
      const rib = ctx.tex.stripes(c, CC.color.shade(c, 0.1), 56, { vertical: true });
      const knit = ctx.mat.cloth('#ffffff', { map: rib, roughness: 0.9 });
      const cuffRib = ctx.tex.stripes(CC.color.shade(c, 0.04), CC.color.shade(c, 0.16), 64, { vertical: true });
      const cuffM = ctx.mat.cloth('#ffffff', { map: cuffRib, roughness: 0.9 });
      const R = 1.235;
      const g = ctx.group(
        ctx.lathe(domeProfile(R, 6, 28, 0.1), knit, { smooth: false, seg: 64 }),
        ctx.lathe(bandProfile(1.205, 1.3, 2, 22), cuffM, { smooth: false, seg: 64 }),
        fluff(ctx, 0.23, ctx.mat.cloth(pale(c, 0.45), { roughness: 1 }), { pos: [0, R * 1.1 + 0.13, -0.02], amp: 0.09, freq: 7 })
      );
      return wear(ctx, g, { tilt: 14, z: -0.01, rim: 4 });
    },
  },
  {
    id: 'cap',
    name: '야구모자',
    render(ctx) {
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.72 });
      const R = 1.235;
      const e0 = 5;
      const k = 0.08;
      const g = ctx.group(ctx.lathe(domeProfile(R, e0, 28, k), m, { smooth: false, seg: 72 }));
      const domeAt = (az, e, lift = 0) => {
        const s = Math.sin(e * D);
        const y = R * s * (1 + k * s * s * s);
        const h = R * Math.cos(e * D);
        const v = new ctx.THREE.Vector3(h * Math.sin(az * D), y, h * Math.cos(az * D));
        return v.multiplyScalar(1 + lift);
      };
      // six panel seams (soft raised piping)
      const seamM = ctx.mat.cloth(CC.color.shade(c, 0.12), { roughness: 0.75 });
      for (let i = 0; i < 6; i++) {
        const az = 30 + i * 60;
        const pts = [];
        for (let e = e0 + 4; e <= 86; e += 6) pts.push(domeAt(az, e, 0.004));
        g.add(ctx.tube(pts, 0.016, seamM, { seg: 30, radial: 8 }));
      }
      // bill: curved down and across, meets the crown at the rim height
      const rho = R * Math.cos(e0 * D) - 0.03;
      const yRim = R * Math.sin(e0 * D);
      // a rounded "D" bill over the front only (ends meet the crown tangentially)
      const pts = [];
      const A = 66;
      for (let i = 0; i <= 48; i++) {
        const ad = -A + (2 * A * i) / 48;
        const a = ad * D;
        const L = 0.66 * Math.pow(Math.max(0, 1 - (ad / A) * (ad / A)), 0.55) + 0.012;
        pts.push([Math.sin(a) * (rho + L), Math.cos(a) * (rho + L)]);
      }
      for (let i = 48; i >= 0; i--) {
        const a = (-A + (2 * A * i) / 48) * D;
        pts.push([Math.sin(a) * rho, Math.cos(a) * rho]);
      }
      const bill = ctx.extrude(toShape(ctx, pts.reverse()), 0.04, ctx.mat.cloth(CC.color.shade(c, 0.06), { roughness: 0.7 }), { bevel: 0.02 });
      bendGeo(bill.geometry, (x, y) => {
        const d = Math.max(0, Math.hypot(x, y) - rho);
        return 0.16 * d + 0.3 * d * d + 0.12 * d * x * x; // gentle downward curve, sides a touch lower
      });
      bill.rotation.x = Math.PI / 2;
      bill.position.y = yRim - 0.01;
      g.add(bill);
      // button + front badge (little star)
      g.add(ctx.ellipsoid(0.08, 0.045, 0.08, seamM, { pos: [0, R * (1 + k) + 0.005, 0] }));
      const badgeC = accentOn(c);
      const badge = ctx.group(
        ctx.cylinder([0, 0, -0.02], [0, 0, 0.022], 0.17, 0.17, ctx.mat.cloth(badgeC, { roughness: 0.8 }), { seg: 40 }),
        ctx.extrude(
          toShape(ctx, outline((t) => {
            const kk = Math.pow(0.5 + 0.5 * Math.cos(5 * (t - Math.PI / 2)), 1.4);
            const r = 0.05 + 0.075 * kk;
            return [r * Math.cos(t), r * Math.sin(t)];
          }, 120)),
          0.016,
          ctx.mat.plastic(c),
          { bevel: 0.01, pos: [0, 0, 0.034] }
        )
      );
      badge.position.copy(domeAt(0, 30, 0.0));
      ctx.head.stick(badge, 0, 30, badge.position.length());
      g.add(badge);
      // back strap + slider
      const strapPts = [];
      for (let az = 148; az <= 212; az += 8) strapPts.push(domeAt(az, e0 + 6, 0.012));
      g.add(strap(ctx, strapPts, 0.075, 0.03, seamM, { outward: (p) => p.clone(), seg: 20 }));
      const buckle = ctx.box(0.11, 0.08, 0.04, ctx.mat.metal('#d8d2c4'), { radius: 0.015 });
      ctx.head.stick(buckle, 180, e0 + 6, R + 0.03);
      g.add(buckle);
      return wear(ctx, g, { tilt: 13, z: -0.01, rim: 5 });
    },
  },
  {
    id: 'bucket',
    name: '벙거지',
    render(ctx) {
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.85 });
      const prof = [
        [1.15, 0.1], [1.3, 0.04], [1.48, -0.06], [1.6, -0.12], [1.645, -0.095], [1.62, -0.06],
        [1.5, -0.015], [1.32, 0.09], [1.205, 0.17], [1.19, 0.35], [1.165, 0.62], [1.12, 0.88],
        [1.03, 1.08], [0.85, 1.21], [0.5, 1.27], [0, 1.28],
      ];
      const g = ctx.group(ctx.lathe(prof, m, { samples: 90, seg: 64 }));
      const band = ctx.torus(1.2, 0.05, ctx.mat.cloth(accentOn(c), { roughness: 0.85 }), { radial: 12, tubular: 72 });
      band.rotation.x = Math.PI / 2;
      band.scale.z = 1.9;
      band.position.y = 0.28;
      g.add(band);
      return wear(ctx, g, { tilt: 13, z: -0.04, rim: 6 });
    },
  },
  {
    id: 'straw',
    name: '밀짚모자',
    render(ctx) {
      const c = ctx.color;
      const straw = CC.color.mix('#efd49a', c, 0.06);
      const weave = ctx.tex.canvas(256, 256, (g2, w, h) => {
        g2.fillStyle = straw;
        g2.fillRect(0, 0, w, h);
        const rows = 8;
        for (let r = 0; r < rows; r++) {
          const y = (r * h) / rows;
          g2.fillStyle = CC.color.shade(straw, 0.12);
          g2.fillRect(0, y, w, 3);
          for (let k = 0; k < 12; k++) {
            const x = ((k + (r % 2) * 0.5) * w) / 12;
            g2.fillStyle = CC.color.light(straw, 0.25);
            g2.beginPath();
            g2.ellipse(x + w / 24, y + h / rows / 2 + 1, w / 30, h / rows / 3.2, 0, 0, Math.PI * 2);
            g2.fill();
          }
        }
      }, { repeat: [10, 5] });
      const m = ctx.mat.cloth('#ffffff', { map: weave, roughness: 0.95, sheen: 0.2 });
      const prof = [
        [1.15, 0.13], [1.4, 0.1], [1.62, 0.04], [1.76, 0.03], [1.8, 0.06], [1.76, 0.09],
        [1.6, 0.09], [1.38, 0.15], [1.205, 0.21], [1.2, 0.42], [1.16, 0.7], [1.08, 0.94],
        [0.95, 1.08], [0.6, 1.17], [0, 1.2],
      ];
      const g = ctx.group(ctx.lathe(prof, m, { samples: 90, seg: 72 }));
      const rib = ctx.mat.cloth(c, { roughness: 0.6, sheen: 0.8 });
      const band = ctx.torus(1.205, 0.045, rib, { radial: 12, tubular: 72 });
      band.rotation.x = Math.PI / 2;
      band.scale.z = 2.3;
      band.position.y = 0.33;
      g.add(band);
      const bow = makeBow(ctx, rib, { L: 0.2, H: 0.17, T: 0.08, tails: 0.2 });
      ctx.head.stick(bow, -62, 0, 1.0);
      bow.position.set(...ctx.head.at(-62, 0, 1.25).toArray());
      bow.position.y = 0.34;
      g.add(bow);
      return wear(ctx, g, { tilt: 12, z: -0.04, rim: 8 });
    },
  },
  {
    id: 'beret',
    name: '베레모',
    render(ctx) {
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.9, sheen: 0.7 });
      const prof = [
        [1.16, 0.4], [1.24, 0.45], [1.33, 0.58], [1.36, 0.72], [1.3, 0.86], [1.12, 1.0], [0.76, 1.12], [0.36, 1.17], [0, 1.18],
      ];
      const g = ctx.group(ctx.lathe(prof, m, { samples: 70, seg: 64 }));
      const rim = ctx.torus(1.175, 0.05, ctx.mat.cloth(CC.color.shade(c, 0.14)), { radial: 12, tubular: 64 });
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.4;
      g.add(rim);
      g.add(ctx.tube([[0, 1.15, 0], [0.02, 1.24, 0.01], [0.06, 1.29, 0.02]], 0.03, m, { caps: true, seg: 12, radial: 10 }));
      return wear(ctx, g, { tilt: 10, roll: 14, z: -0.04, y: -0.02, rim: 16 });
    },
  },
  {
    id: 'helmet',
    name: '안전모',
    render(ctx) {
      const c = ctx.color;
      const shell = ctx.mat.plastic(c, { roughness: 0.25 });
      const R = 1.25;
      const e0 = 4;
      const k = 0.06;
      const g = ctx.group(ctx.lathe(domeProfile(R, e0, 30, k), shell, { smooth: false, seg: 72 }));
      const domeAt = (az, e, lift = 0) => {
        const s = Math.sin(e * D);
        const y = R * s * (1 + k * s * s * s);
        const h = R * Math.cos(e * D);
        return new ctx.THREE.Vector3(h * Math.sin(az * D), y, h * Math.cos(az * D)).multiplyScalar(1 + lift);
      };
      // one smooth raised rib from above the badge, over the crown, down the back (rounded ends)
      const rib = [];
      for (let e = 58; e <= 152; e += 4) rib.push(e <= 90 ? domeAt(0, e) : domeAt(180, 180 - e));
      g.add(ctx.tube(rib, 0.052, shell, { caps: true, seg: 64, radial: 16 }));
      // brim: one closed surface all around, short at the back and sides, a longer peak in front
      const yRim = R * Math.sin(e0 * D);
      const rIn = R * Math.cos(e0 * D) - 0.06;
      const brim = surface(
        ctx,
        112,
        18,
        (u, v) => {
          const az = u * Math.PI * 2;
          const front = Math.pow(Math.max(0, Math.cos(az)), 1.6);
          const w = 0.15 + 0.2 * front;
          const th = -v * Math.PI * 2;
          const c = Math.cos(th);
          const s = Math.sin(th);
          const f = (Math.sign(c) * Math.pow(Math.abs(c), 0.6) + 1) / 2; // 0 root .. 1 tip
          const rho = rIn + (w + 0.06) * f;
          const y = yRim + 0.012 + Math.sign(s) * Math.pow(Math.abs(s), 0.6) * 0.026 - f * f * (0.02 + 0.07 * front);
          return [rho * Math.sin(az), y, rho * Math.cos(az)];
        },
        ctx.mat.plastic(c, { roughness: 0.25, side: ctx.THREE.DoubleSide })
      );
      weldNormals(brim.geometry);
      g.add(brim);
      // safety sticker: white badge with a green cross
      const badge = ctx.group(
        ctx.cylinder([0, 0, -0.02], [0, 0, 0.018], 0.17, 0.17, ctx.mat.plastic('#fbfaf5'), { seg: 40 }),
        ctx.extrude(toShape(ctx, roundedPoly([[-0.035, 0.11], [0.035, 0.11], [0.035, 0.035], [0.11, 0.035], [0.11, -0.035], [0.035, -0.035], [0.035, -0.11], [-0.035, -0.11], [-0.035, -0.035], [-0.11, -0.035], [-0.11, 0.035], [-0.035, 0.035]].reverse(), 0.012, 3)), 0.01, ctx.mat.plastic('#3fa65b'), { bevel: 0.006, pos: [0, 0, 0.025] })
      );
      ctx.head.stick(badge, 0, 33, R * 1.012);
      g.add(badge);
      return wear(ctx, g, { tilt: 11, z: -0.015, rim: 4 });
    },
  },
  {
    id: 'catears',
    name: '고양이 머리띠',
    render(ctx) {
      const c = ctx.color;
      const bandM = ctx.mat.plastic(c, { roughness: 0.3 });
      const earM = ctx.mat.cloth(c, { roughness: 0.85, sheen: 0.9 });
      const innerM = ctx.mat.cloth(CC.color.mix(c, '#ffb7c5', CC.color.isDark(c) ? 0.55 : 0.65), { roughness: 0.9 });
      const g = ctx.group();
      const tilt = 14 * D;
      const bandPt = (deg) => {
        const a = deg * D;
        const R = 1.16 + 0.095 * Math.cos(a);
        const x = R * Math.sin(a);
        const y = R * Math.cos(a);
        return [x, y * Math.cos(tilt), y * Math.sin(tilt)];
      };
      const pts = [];
      for (let d = -86; d <= 86; d += 6) pts.push(bandPt(d));
      g.add(strap(ctx, pts, 0.085, 0.05, bandM, { outward: (p) => p.clone(), seg: 80 }));
      const earShape = roundedPoly([[-0.22, 0], [0.2, 0], [0.04, 0.38]].reverse(), [0.06, 0.06, 0.07], 8);
      const innerShape = roundedPoly([[-0.13, 0.03], [0.11, 0.03], [0.025, 0.25]].reverse(), [0.04, 0.04, 0.05], 8);
      [-1, 1].forEach((s) => {
        const ear = ctx.group(
          ctx.extrude(toShape(ctx, earShape), 0.07, earM, { bevel: 0.035 }),
          ctx.extrude(toShape(ctx, innerShape), 0.02, innerM, { bevel: 0.02, pos: [0, 0.01, 0.06] })
        );
        ear.scale.x = s;
        const p = bandPt(s * 40);
        const holder = ctx.group(ear);
        holder.position.set(p[0], p[1] - 0.04, p[2]);
        holder.rotation.set(-tilt - 0.15, 0, -s * 0.62, 'YXZ');
        g.add(holder);
      });
      return wear(ctx, g, { tilt: 0, z: -0.02, rim: 30 });
    },
  },
  {
    id: 'ribbon',
    name: '왕리본',
    render(ctx) {
      const c = ctx.color;
      const m = ctx.mat.cloth(c, { roughness: 0.55, sheen: 1 });
      const bow = makeBow(ctx, m, { L: 0.5, H: 0.44, T: 0.2, lift: 0.07, spread: 0.18, tails: 0.4, knotMat: ctx.mat.cloth(CC.color.shade(c, 0.08), { roughness: 0.55, sheen: 1 }) });
      const holder = ctx.group(bow);
      const d0 = ctx.head.dir(-30, 54);
      const home = () => {
        holder.scale.setScalar(1);
        holder.position.copy(ctx.head.at(-30, 54, 1.24));
        holder.rotation.set(-0.5, -0.32, 0.28, 'YXZ');
      };
      home();
      // a bun right where the bow sits (twin buns ...): tie a smaller bow at the bun's front base instead
      const adjust = (hair) => {
        let best = null;
        let bestDot = Math.cos(40 * D);
        hair.forEach((h) =>
          h.traverse((o) => {
            const d = o.userData && o.userData.hatDir;
            if (!d || o.visible === false) return;
            const dot = d0.x * d[0] + d0.y * d[1] + d0.z * d[2];
            if (dot > bestDot) {
              bestDot = dot;
              best = d;
            }
          })
        );
        if (!best) return home();
        const n = new ctx.THREE.Vector3(best[0], best[1] - 0.11, best[2] + 0.55).normalize();
        const az = Math.atan2(n.x, n.z) / D;
        const el = Math.asin(clamp(n.y, -1, 1)) / D;
        ctx.head.stick(holder, az, el, 1.2, 0.25 * Math.sign(-n.x || 1));
        holder.scale.setScalar(0.62);
      };
      return wear(ctx, ctx.group(holder), { tilt: 0, z: -0.02, rim: 25, adjust });
    },
  },
  {
    id: 'flowerpin',
    name: '꽃 머리핀',
    render(ctx) {
      const c = ctx.color;
      const petalM = ctx.mat.plastic(c, { roughness: 0.4 });
      const centerC = CC.color.luminance(c) > 0.62 ? '#f1a43a' : '#ffd65a';
      const flower = ctx.group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        const pet = ctx.ellipsoid(0.105, 0.078, 0.045, petalM, { seg: 24 });
        const holder = ctx.group(pet);
        pet.position.x = 0.1;
        pet.rotation.y = -0.22;
        holder.rotation.z = a;
        flower.add(holder);
      }
      flower.add(ctx.sphere(0.065, ctx.mat.plastic(centerC, { roughness: 0.5 }), { pos: [0, 0, 0.035], scale: [1, 1, 0.6], seg: 24 }));
      const leafM = ctx.mat.plastic(CC.color.mix('#6dbb6a', c, 0.12), { roughness: 0.45 });
      [-1, 1].forEach((s) => {
        const lf = ctx.extrude(toShape(ctx, leafPts(ctx, 0.17, 0.1)), 0.012, leafM, { bevel: 0.012 });
        lf.position.set(s * 0.06, -0.05, -0.03);
        lf.rotation.z = Math.PI + s * 0.75;
        flower.add(lf);
      });
      const g = ctx.group(flower);
      flower.scale.setScalar(1.3);
      ctx.head.stick(flower, 56, 30, 1.22, -0.3);
      return wear(ctx, g, { tilt: 0, z: -0.02, rim: 12 });
    },
  },
  {
    id: 'sprout',
    name: '새싹 두 잎',
    render(ctx) {
      const c = ctx.color;
      const leafM = ctx.mat.plastic(c, { roughness: 0.38 });
      const stemM = ctx.mat.plastic(CC.color.shade(c, 0.18), { roughness: 0.45 });
      const g = ctx.group();
      const top = [0.02, 1.42, 0.02];
      g.add(ctx.tube([[0, 1.0, -0.04], [0.0, 1.2, -0.03], [0.03, 1.33, 0.0], top], (t) => 0.042 - 0.012 * t, stemM, { caps: true, seg: 24, radial: 12 }));
      [-1, 1].forEach((s) => {
        const geo = new ctx.THREE.ExtrudeGeometry(toShape(ctx, leafPts(ctx, 0.36, 0.26, { tip: s * 0.03 })), {
          depth: 0.03,
          bevelEnabled: true,
          bevelThickness: 0.018,
          bevelSize: 0.018,
          bevelSegments: 3,
          curveSegments: 12,
        });
        geo.translate(0, 0, -0.015);
        bendGeo(geo, (x, y) => -0.5 * x * x + 0.18 * y * y);
        const leaf = ctx.mesh(geo, leafM);
        const holder = ctx.group(leaf);
        holder.position.set(top[0], top[1] - 0.01, top[2]);
        holder.rotation.set(0.15, s * 0.25, -s * 0.95, 'YXZ');
        g.add(holder);
      });
      return wear(ctx, g, { tilt: 4, z: -0.02, rim: 30 });
    },
  },
  {
    id: 'headphones',
    name: '헤드폰',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const shellM = ctx.mat.plastic(c, { roughness: 0.3 });
      const padC = CC.color.isDark(c) ? CC.color.light(c, 0.2) : CC.color.mix(c, '#3a3540', 0.55);
      const padM = ctx.mat.cloth(padC, { roughness: 0.75 });
      const accent = ctx.mat.plastic(accentOn(c), { roughness: 0.3 });
      const g = ctx.group();
      const cupR = 1.13;
      const cupEl = -4;
      const bandPt = (deg, R0 = 1.24) => {
        const a = deg * D;
        const R = R0 - 0.08 * (1 - Math.cos(a));
        return new THREE.Vector3(R * Math.sin(a), R * Math.cos(a), 0);
      };
      const pts = [];
      for (let d = -72; d <= 72; d += 6) pts.push(bandPt(d));
      g.add(strap(ctx, pts, 0.14, 0.06, shellM, { outward: (p) => p.clone(), seg: 70 }));
      // soft pad under the top of the band
      const pad = [];
      for (let d = -34; d <= 34; d += 6) pad.push(bandPt(d, 1.2));
      g.add(strap(ctx, pad, 0.11, 0.05, padM, { outward: (p) => p.clone(), seg: 40 }));
      [-1, 1].forEach((s) => {
        const cup = ctx.group();
        cup.add(ctx.torus(0.2, 0.075, padM, { radial: 14, tubular: 40, pos: [0, 0, 0.05] }));
        const shell = ctx.lathe([[0.27, 0], [0.285, 0.06], [0.27, 0.13], [0.2, 0.17], [0.0, 0.18]], shellM, { seg: 48, samples: 30 });
        shell.rotation.x = Math.PI / 2;
        shell.position.z = 0.08;
        cup.add(shell);
        cup.add(ctx.torus(0.17, 0.022, accent, { radial: 10, tubular: 40, pos: [0, 0, 0.24] }));
        cup.add(ctx.sphere(0.12, accent, { pos: [0, 0, 0.22], scale: [1, 1, 0.3], seg: 32 }));
        ctx.head.stick(cup, s * 90, cupEl, cupR);
        g.add(cup);
        // yoke: band end -> cup top
        const e = bandPt(s * 72);
        const top = ctx.head.at(s * 90, cupEl + 16, cupR + 0.12);
        g.add(ctx.tube([e, e.clone().lerp(top, 0.5).add(new THREE.Vector3(s * 0.03, 0, 0)), top], 0.045, shellM, { caps: true, seg: 16, radial: 12 }));
      });
      return Object.assign({ head: wear(ctx, g, { tilt: 4, z: -0.02, rim: 12 }) }, { hide: ['ears'] });
    },
  },
  {
    id: 'party',
    name: '고깔모자',
    render(ctx) {
      const c = ctx.color;
      const c2 = CC.color.isDark(c) ? pale(c, 0.55) : pale(c, 0.7);
      const tex = ctx.tex.canvas(256, 256, (g2, w, h) => {
        g2.fillStyle = c;
        g2.fillRect(0, 0, w, h);
        g2.fillStyle = c2;
        const n = 4;
        for (let i = -n; i < n * 2; i++) {
          g2.beginPath();
          const x = (i * w) / n;
          g2.moveTo(x, 0);
          g2.lineTo(x + w / n / 2, 0);
          g2.lineTo(x + w / n / 2 + w * 0.6, h);
          g2.lineTo(x + w * 0.6, h);
          g2.closePath();
          g2.fill();
        }
      }, { repeat: [2, 1] });
      const coneM = ctx.mat.plastic('#ffffff', { map: tex, roughness: 0.4 });
      const fluffM = ctx.mat.cloth(CC.color.isDark(c) ? '#fbf6ec' : pale(c, 0.85), { roughness: 1 });
      const cone = ctx.lathe([[0.5, 0], [0.43, 0.22], [0.31, 0.48], [0.17, 0.74], [0.05, 0.96], [0, 1.0]], coneM, { seg: 48, samples: 40 });
      const g = ctx.group(cone);
      const rim = ctx.torus(0.49, 0.07, fluffM, { radial: 14, tubular: 48 });
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      g.add(rim);
      g.add(fluff(ctx, 0.12, fluffM, { pos: [0, 1.03, 0], amp: 0.1, freq: 8 }));
      const holder = ctx.group(g);
      holder.rotation.x = Math.PI / 2;
      const mount = ctx.group(holder);
      ctx.head.stick(mount, 14, 62, 1.05);
      return wear(ctx, ctx.group(mount), { tilt: 0, z: -0.03, rim: 30 });
    },
  },
  {
    id: 'chef',
    name: '요리사 모자',
    render(ctx) {
      const c = ctx.color;
      const top = CC.color.mix('#fffdf8', c, 0.1);
      const bandC = CC.color.luminance(c) > 0.8 ? CC.color.shade(c, 0.12) : c;
      const band = ctx.lathe([[1.22, 0.08], [1.265, 0.1], [1.275, 0.3], [1.265, 0.52], [1.22, 0.54]], ctx.mat.cloth(bandC, { roughness: 0.8 }), { seg: 64, samples: 30 });
      const prof = new ctx.THREE.SplineCurve(
        [[1.21, 0.5], [1.27, 0.68], [1.37, 0.94], [1.39, 1.18], [1.22, 1.42], [0.72, 1.57], [0.0, 1.6]].map(([x, y]) => new ctx.THREE.Vector2(x, y))
      );
      const puff = surface(
        ctx,
        96,
        40,
        (u, v) => {
          const p = prof.getPoint(v);
          const th = u * Math.PI * 2;
          const pleat = 1 + 0.04 * Math.cos(th * 14) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.25)), 0.6);
          const r = p.x * pleat;
          return [r * Math.sin(th), p.y, r * Math.cos(th)];
        },
        ctx.mat.cloth(top, { roughness: 0.85, sheen: 0.5 })
      );
      return wear(ctx, ctx.group(band, puff), { tilt: 8, z: -0.04, rim: 4 });
    },
  },
]);

/* ====================================================================== BODY ACCESSORIES */
/* character space; anything on the torso rides at inflate >= 0.1 (outside tops and outerwear) */
const TD = 0.8; // torso depth (A3.torsoDepth)
/** point on the (inflated) torso surface at height y, azimuth th (deg, 0 = front, 90 = viewer's right) */
function tp(ctx, y, th, infl) {
  const r = ctx.torsoRadiusAt(y) + infl;
  return new ctx.THREE.Vector3(r * Math.sin(th * D), y, r * Math.cos(th * D) * TD);
}
/** approximate outward normal of the torso at point p */
function tnormal(ctx, p) {
  const y = Math.min(p.y, 1.58);
  const th = Math.atan2(p.x, p.z / TD);
  const dr = (ctx.torsoRadiusAt(y + 0.015) - ctx.torsoRadiusAt(y - 0.015)) / 0.03;
  const phi = Math.atan(-dr);
  return new ctx.THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.sin(phi), (Math.cos(th) * Math.cos(phi)) / TD).normalize();
}
const onTorso = (ctx, list, infl) => list.map(([y, th, extra]) => tp(ctx, y, th, infl + (extra || 0)));

/** employee ID card face (no readable text): colour header, mini portrait, placeholder lines */
function idCardTexture(ctx, c) {
  const st = ctx.state || {};
  const skin = ctx.skin;
  const hair = ctx.hair;
  const top = st.topColor || '#8fdcc0';
  return ctx.tex.canvas(256, 352, (g, w, h) => {
    const rr = (x, y, ww, hh, r, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + ww, y, x + ww, y + hh, r);
      g.arcTo(x + ww, y + hh, x, y + hh, r);
      g.arcTo(x, y + hh, x, y, r);
      g.arcTo(x, y, x + ww, y, r);
      g.closePath();
      g.fill();
    };
    g.fillStyle = '#fffdf8';
    g.fillRect(0, 0, w, h);
    rr(0, 0, w, 84, 0, c);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(40, 42, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(40, 46, 9, 12, 0, 0, Math.PI * 2);
    g.fill();
    rr(74, 30, 120, 13, 6, 'rgba(255,255,255,0.85)');
    rr(74, 52, 76, 10, 5, 'rgba(255,255,255,0.6)');
    // photo
    rr(26, 110, 96, 116, 10, '#dcebf6');
    g.save();
    g.beginPath();
    g.rect(26, 110, 96, 116);
    g.clip();
    g.fillStyle = top;
    g.beginPath();
    g.ellipse(74, 238, 44, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skin;
    g.beginPath();
    g.arc(74, 166, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hair;
    g.beginPath();
    g.arc(74, 160, 32, Math.PI * 1.02, Math.PI * 1.98);
    g.fill();
    g.fillStyle = '#3b2416';
    g.beginPath();
    g.arc(64, 170, 3.2, 0, Math.PI * 2);
    g.arc(84, 170, 3.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // placeholder lines
    rr(138, 120, 92, 14, 7, '#5b4a3f');
    rr(138, 148, 72, 11, 5.5, '#b9aea4');
    rr(138, 170, 84, 11, 5.5, '#b9aea4');
    rr(138, 200, 60, 18, 9, c);
    // barcode-ish strip
    for (let i = 0; i < 26; i++) {
      g.fillStyle = i % 3 === 0 ? '#6b5b50' : '#a99c90';
      g.fillRect(30 + i * 7.6, 262, i % 4 === 0 ? 4 : 2.5, 40);
    }
    rr(0, h - 22, w, 22, 0, CC.color.light(c, 0.35));
  });
}

/** a takeaway cup (paper cup + lid + sleeve) standing at the origin, height ~0.33 */
function coffeeCup(ctx, c) {
  const paper = ctx.mat.matte('#f7f2e8');
  const lidM = ctx.mat.plastic(CC.color.isDark(c) ? '#f4efe6' : '#4a3a33', { roughness: 0.35 });
  const sleeve = ctx.mat.cloth(c, { roughness: 0.85, sheen: 0.3 });
  const g = ctx.group(
    ctx.lathe([[0, 0], [0.08, 0], [0.086, 0.01], [0.105, 0.28], [0.112, 0.29]], paper, { smooth: false, seg: 40 }),
    ctx.lathe([[0.112, 0.28], [0.122, 0.292], [0.122, 0.31], [0.11, 0.33], [0.085, 0.345], [0.03, 0.35], [0, 0.35]], lidM, { samples: 30, seg: 40 }),
    ctx.lathe([[0.091, 0.07], [0.099, 0.075], [0.106, 0.22], [0.1, 0.225]], sleeve, { smooth: false, seg: 40 }),
    ctx.capsule([0.05, 0.35, 0.0], [0.05, 0.362, 0.0], 0.022, lidM)
  );
  // little heart on the sleeve
  const heart = ctx.extrude(toShape(ctx, shapes.heart(0.0024)), 0.006, ctx.mat.plastic(accentOn(c)), { bevel: 0.004 });
  const hz = ctx.group(heart);
  heart.position.z = 0.104;
  hz.position.y = 0.15;
  g.add(hz);
  return g;
}

CC.register('acc', [
  { id: 'none', name: '없음', render: () => null },
  {
    id: 'lanyard',
    name: '사원증 목걸이',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const strapM = ctx.mat.cloth(c, { roughness: 0.7, sheen: 0.4 });
      const g = ctx.group();
      // strap: clip -> left chest -> around the back of the neck -> right chest -> clip
      const half = [
        [1.31, 6],
        [1.42, 18],
        [1.53, 34],
        [1.585, 62],
        [1.595, 95],
        [1.59, 130],
        [1.585, 165],
      ];
      const back = tp(ctx, 1.585, 180, 0.105);
      const clipTop = tp(ctx, 1.28, 0, 0.12);
      const loop = [clipTop.clone().add(new THREE.Vector3(-0.02, 0.0, 0))]
        .concat(onTorso(ctx, half.map(([y, th]) => [y, -th]), 0.105))
        .concat([back])
        .concat(onTorso(ctx, half.slice().reverse(), 0.105))
        .concat([clipTop.clone().add(new THREE.Vector3(0.02, 0.0, 0))]);
      g.add(strap(ctx, loop, 0.075, 0.024, strapM, { outward: (p) => tnormal(ctx, p), seg: 110 }));
      // clip + ring
      const metal = ctx.mat.metal('#cfd2d8', { roughness: 0.3 });
      const cardTopY = 1.24;
      const zc = tp(ctx, 1.12, 0, 0.125).z + 0.016;
      g.add(ctx.box(0.06, 0.06, 0.03, metal, { radius: 0.012, pos: [0, 1.275, clipTop.z + 0.005] }));
      const ring = ctx.torus(0.028, 0.012, metal, { radial: 8, tubular: 20, pos: [0, cardTopY + 0.02, zc - 0.006] });
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      // card in a soft holder
      const card = ctx.group();
      card.add(ctx.box(0.3, 0.4, 0.028, ctx.mat.plastic(CC.color.mix(c, '#ffffff', 0.82), { roughness: 0.3 }), { radius: 0.026 }));
      const face = ctx.plane(0.264, 0.358, ctx.mat.matte('#ffffff', { map: idCardTexture(ctx, c) }), { pos: [0, -0.006, 0.0168] });
      card.add(face);
      card.position.set(0, cardTopY - 0.2, zc + 0.005);
      card.rotation.x = -0.1;
      g.add(card);
      return g;
    },
  },
  {
    id: 'scarf',
    name: '줄무늬 목도리',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const c2 = CC.color.isDark(c) ? pale(c, 0.6) : pale(c, 0.72);
      const ringTex = ctx.tex.stripes(c, c2, 14, { vertical: true });
      const knit = ctx.mat.cloth('#ffffff', { map: ringTex, roughness: 0.95, sheen: 0.8 });
      const tailTex = ctx.tex.stripes(c, c2, 6, { vertical: true });
      const tailM = ctx.mat.cloth('#ffffff', { map: tailTex, roughness: 0.95, sheen: 0.8 });
      const g = ctx.group();
      const wrap = ctx.torus(0.31, 0.118, knit, { radial: 18, tubular: 64 });
      wrap.rotation.x = Math.PI / 2;
      wrap.scale.set(1, 1, 0.8);
      const wg = ctx.group(wrap);
      wg.position.y = 1.535;
      wg.scale.z = 0.86;
      g.add(wg);
      // knot + two hanging ends in front
      const kn = tp(ctx, 1.47, -16, 0.2);
      g.add(ctx.ellipsoid(0.12, 0.1, 0.09, knit, { pos: kn, seg: 28 }));
      const tail = (th0, th1, y1, extra) => {
        const pts = [kn.clone().add(new THREE.Vector3(0, -0.03, -0.02))];
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const y = 1.44 + (y1 - 1.44) * t;
          pts.push(tp(ctx, y, th0 + (th1 - th0) * t, 0.13 + extra));
        }
        return strap(ctx, pts, (t) => 0.17 + 0.02 * t, 0.055, tailM, { outward: (p) => tnormal(ctx, p), seg: 40 });
      };
      g.add(tail(-14, -20, 1.0, 0.0));
      g.add(tail(-6, 4, 1.12, 0.05));
      // fringe
      const fr = ctx.mat.cloth(c2, { roughness: 1 });
      [[-20, 1.0, 0.0], [4, 1.12, 0.05]].forEach(([th, y, ex]) => {
        const end = tp(ctx, y, th, 0.13 + ex);
        const n = tnormal(ctx, end);
        const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
        for (let k = -2; k <= 2; k++) {
          const a = end.clone().addScaledVector(side, k * 0.034).add(new THREE.Vector3(0, -0.005, 0));
          g.add(ctx.capsule(a, a.clone().add(new THREE.Vector3(0, -0.06, 0.01)), 0.016, fr));
        }
      });
      return g;
    },
  },
  {
    id: 'bowtie',
    name: '나비넥타이',
    render(ctx) {
      const c = ctx.color;
      const dots = ctx.tex.dots(c, CC.color.isDark(c) ? pale(c, 0.7) : pale(c, 0.8), 5, { repeat: [3, 2] });
      const m = ctx.mat.cloth('#ffffff', { map: dots, roughness: 0.6, sheen: 0.7 });
      const bow = makeBow(ctx, m, { L: 0.25, H: 0.235, T: 0.12, lift: 0.015, spread: 0.06, knotMat: ctx.mat.cloth(CC.color.shade(c, 0.1), { roughness: 0.6 }) });
      const p = tp(ctx, 1.5, 0, 0.1);
      bow.position.set(0, 1.485, p.z + 0.045);
      bow.rotation.x = -0.25;
      return ctx.group(bow);
    },
  },
  {
    id: 'necktie',
    name: '넥타이',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const c2 = CC.color.isDark(c) ? pale(c, 0.42) : CC.color.luminance(c) > 0.7 ? CC.color.shade(c, 0.28) : pale(c, 0.55);
      // bold diagonal stripes (one per tile so they stay readable at thumbnail size)
      const tex = ctx.tex.canvas(128, 128, (g2, w, h) => {
        g2.fillStyle = c;
        g2.fillRect(0, 0, w, h);
        g2.strokeStyle = c2;
        g2.lineWidth = 30;
        for (let i = -1; i <= 1; i++) {
          g2.beginPath();
          g2.moveTo(i * w - 10, h + 10);
          g2.lineTo(i * w + w + 10, -10);
          g2.stroke();
        }
      }, { repeat: [3.2, 1] });
      const m = ctx.mat.cloth('#ffffff', { map: tex, roughness: 0.55, sheen: 0.8 });
      const knotM = ctx.mat.cloth(c, { roughness: 0.55, sheen: 0.8 });
      const g = ctx.group();
      // blade: follows the chest and tummy, widens, then ends in a soft point
      const ys = [1.47, 1.38, 1.28, 1.18, 1.08, 1.0, 0.95];
      const pts = ys.map((y) => tp(ctx, y, 0, 0.105));
      const width = (t) => (t < 0.84 ? 0.105 + 0.085 * smoothstep(0, 0.84, t) : 0.19 * (1 - 0.86 * smoothstep(0.84, 1, t)));
      g.add(strap(ctx, pts, width, 0.034, m, { outward: (p) => tnormal(ctx, p), seg: 60 }));
      // chunky knot
      const kp = tp(ctx, 1.49, 0, 0.13);
      const knot = ctx.group(ctx.sphere(1, knotM, { scale: [0.085, 0.07, 0.052], seg: 28 }));
      knot.position.copy(kp);
      knot.lookAt(kp.clone().add(tnormal(ctx, kp)));
      g.add(knot);
      // tie bar
      const bp = tp(ctx, 1.2, 0, 0.135);
      const bar = ctx.box(0.19, 0.03, 0.02, ctx.mat.metal('#e3c46c', { roughness: 0.25 }), { radius: 0.009, pos: bp });
      bar.lookAt(bp.clone().add(tnormal(ctx, bp)));
      g.add(bar);
      return g;
    },
  },
  {
    id: 'backpack',
    name: '백팩',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const bagM = ctx.mat.cloth(c, { roughness: 0.75, sheen: 0.4 });
      const deep = ctx.mat.cloth(CC.color.isDark(c) ? CC.color.light(c, 0.15) : CC.color.shade(c, 0.16), { roughness: 0.75 });
      const trim = ctx.mat.cloth(accentOn(c), { roughness: 0.8 });
      const g = ctx.group();
      const zb = -(ctx.torsoRadiusAt(1.1) + 0.1) * TD - 0.15;
      // a big, soft school-style pack: wider than the torso so it peeks out from the front
      // (tall enough that its top peeks over the shoulders from the front)
      g.add(ctx.box(0.96, 0.88, 0.32, bagM, { radius: 0.16, pos: [0, 1.22, zb - 0.01] }));
      // lid over the top
      g.add(ctx.box(0.9, 0.22, 0.36, deep, { radius: 0.1, pos: [0, 1.6, zb - 0.02] }));
      // front pocket with a zipper line + pull
      g.add(ctx.box(0.62, 0.36, 0.13, bagM, { radius: 0.065, pos: [0, 1.02, zb - 0.19] }));
      g.add(ctx.box(0.52, 0.04, 0.03, trim, { radius: 0.015, pos: [0, 1.17, zb - 0.25] }));
      g.add(ctx.box(0.05, 0.08, 0.035, ctx.mat.metal('#dcd6ca'), { radius: 0.015, pos: [0.18, 1.13, zb - 0.262] }));
      // side pockets
      [-1, 1].forEach((s) => g.add(ctx.box(0.1, 0.32, 0.22, deep, { radius: 0.05, pos: [s * 0.48, 1.02, zb] })));
      // carry handle
      const h = ctx.torus(0.09, 0.028, deep, { radial: 10, tubular: 24, arc: Math.PI });
      h.position.set(0, 1.7, zb - 0.02);
      g.add(h);
      // shoulder straps: bag top -> over the shoulder -> down the chest -> under the arm -> bag side
      const sm = deep;
      [-1, 1].forEach((s) => {
        const pts = onTorso(ctx, [[1.4, 172], [1.5, 150], [1.575, 118], [1.58, 84], [1.52, 50], [1.4, 34], [1.24, 32], [1.12, 42], [1.08, 72], [1.08, 100], [1.06, 130]], 0.115).map((p) => new THREE.Vector3(p.x * s, p.y, p.z));
        pts.push(new THREE.Vector3(s * 0.3, 0.98, zb + 0.05));
        g.add(strap(ctx, pts, 0.085, 0.03, sm, { outward: (p) => tnormal(ctx, p), seg: 110 }));
        // slider on the chest
        const sp = tp(ctx, 1.3, s * 32, 0.14);
        const sl = ctx.box(0.1, 0.05, 0.03, trim, { radius: 0.012, pos: sp });
        sl.lookAt(sp.clone().add(tnormal(ctx, sp)));
        g.add(sl);
      });
      return g;
    },
  },
  {
    id: 'coffee',
    name: '테이크아웃 커피',
    render(ctx) {
      const cup = coffeeCup(ctx, ctx.color);
      cup.scale.setScalar(1.42);
      const hd = ctx.A.handR;
      cup.position.set(hd[0] + 0.06, hd[1] - 0.25, hd[2] + 0.15);
      cup.rotation.y = -0.4;
      return { armR: ctx.group(cup) };
    },
  },
  {
    id: 'crossbag',
    name: '크로스백',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const bagM = ctx.mat.cloth(c, { roughness: 0.6, sheen: 0.4 });
      const flapM = ctx.mat.cloth(CC.color.isDark(c) ? CC.color.light(c, 0.14) : CC.color.shade(c, 0.12), { roughness: 0.6 });
      const strapM = ctx.mat.cloth(CC.color.isDark(c) ? CC.color.light(c, 0.22) : CC.color.shade(c, 0.22), { roughness: 0.7 });
      const g = ctx.group();
      // diagonal strap loop: high over the viewer-right shoulder, low at the front-left hip
      const hi = 112;
      const lo = hi - 180;
      const pts = [];
      for (let th = -180; th < 180; th += 10) {
        const k = Math.cos((th - hi) * D);
        const y = 1.3 + 0.29 * k;
        pts.push(tp(ctx, y, th, 0.11 + 0.02 * Math.max(0, -k)));
      }
      g.add(strap(ctx, pts, 0.06, 0.024, strapM, { outward: (p) => tnormal(ctx, p), closed: true, seg: 120 }));
      // the bag hangs at the low point
      const anchor = tp(ctx, 1.01, lo, 0.13);
      const n = tnormal(ctx, anchor);
      const bag = ctx.group();
      bag.add(ctx.box(0.38, 0.3, 0.13, bagM, { radius: 0.06 }));
      const flap = ctx.extrude(toShape(ctx, roundedPoly([[-0.195, 0.155], [0.195, 0.155], [0.195, 0.0], [0.0, -0.095], [-0.195, 0.0]].reverse(), [0.05, 0.05, 0.06, 0.07, 0.06], 6)), 0.014, flapM, { bevel: 0.01, pos: [0, 0.0, 0.075] });
      bag.add(flap);
      bag.add(ctx.sphere(0.032, ctx.mat.metal('#e2c56e'), { pos: [0, -0.07, 0.092], scale: [1, 1, 0.5], seg: 16 }));
      bag.position.copy(anchor).addScaledVector(n, 0.065).add(new THREE.Vector3(0, -0.15, 0));
      bag.rotation.set(-0.12, Math.atan2(n.x, n.z), 0.06, 'YXZ');
      g.add(bag);
      return g;
    },
  },
  {
    id: 'plant',
    name: '작은 화분',
    render(ctx) {
      const c = ctx.color;
      const potM = ctx.mat.plastic(c, { roughness: 0.55 });
      const rimM = ctx.mat.plastic(CC.color.isDark(c) ? CC.color.light(c, 0.2) : CC.color.shade(c, 0.12), { roughness: 0.55 });
      const g = ctx.group();
      g.add(ctx.lathe([[0, 0], [0.095, 0], [0.105, 0.01], [0.125, 0.19], [0.12, 0.2]], potM, { smooth: false, seg: 40 }));
      g.add(ctx.lathe([[0.112, 0.18], [0.14, 0.185], [0.148, 0.205], [0.145, 0.245], [0.135, 0.255], [0.115, 0.25]], rimM, { samples: 24, seg: 40 }));
      g.add(ctx.mesh(new ctx.THREE.CircleGeometry(0.118, 32), ctx.mat.matte('#6b4a35'), { pos: [0, 0.235, 0], rot: [-Math.PI / 2, 0, 0] }));
      const greens = ['#5fae5b', '#78c06b', '#4f9d55'];
      const leaves = [
        [0, 0.3, 0.0, 0.0],
        [-0.55, 0.26, 0.1, 0.25],
        [0.55, 0.26, -0.1, -0.25],
        [-1.0, 0.2, 0.25, 0.5],
        [1.0, 0.21, -0.2, -0.5],
        [0.25, 0.24, 0.6, 0.0],
        [-0.25, 0.23, -0.6, 0.0],
      ];
      leaves.forEach(([rz, L, ry, rx], i) => {
        const geo = new ctx.THREE.ExtrudeGeometry(toShape(ctx, leafPts(ctx, L, L * 0.62)), {
          depth: 0.02,
          bevelEnabled: true,
          bevelThickness: 0.014,
          bevelSize: 0.014,
          bevelSegments: 2,
          curveSegments: 8,
        });
        geo.translate(0, 0, -0.01);
        bendGeo(geo, (x, y) => -1.1 * x * x + 0.25 * y * y);
        const leaf = ctx.mesh(geo, ctx.mat.plastic(greens[i % 3], { roughness: 0.4 }));
        const hold = ctx.group(leaf);
        hold.position.y = 0.23;
        hold.rotation.set(rx, ry, rz, 'YXZ');
        g.add(hold);
      });
      const hd = ctx.A.handL;
      g.scale.setScalar(1.32);
      g.position.set(hd[0] - 0.06, hd[1] - 0.21, hd[2] + 0.17);
      return { armL: ctx.group(g) };
    },
  },
  {
    id: 'laptop',
    name: '노트북',
    render(ctx) {
      const c = ctx.color;
      const lidM = ctx.mat.plastic(c, { roughness: 0.3 });
      const baseM = ctx.mat.metal('#d9dce3', { roughness: 0.3 });
      const darkM = ctx.mat.plastic('#55535d', { roughness: 0.5 });
      const W = 0.66;
      const Hh = 0.46;
      const lap = ctx.group();
      // closed laptop in local XY (lid faces +Z): coloured lid, silver base, dark seam, hinge along the top
      lap.add(ctx.box(W - 0.045, Hh - 0.045, 0.034, lidM, { radius: 0.03, pos: [0, 0, 0.022] }));
      lap.add(ctx.box(W, Hh, 0.03, baseM, { radius: 0.028, pos: [0, 0, 0.012] }));
      lap.add(ctx.box(W - 0.03, Hh - 0.03, 0.016, darkM, { radius: 0.006, pos: [0, 0, 0.0] }));
      lap.add(ctx.box(W, Hh, 0.04, baseM, { radius: 0.03, pos: [0, 0, -0.024] }));
      lap.add(ctx.cylinder([-0.25, Hh / 2 - 0.005, -0.004], [0.25, Hh / 2 - 0.005, -0.004], 0.026, 0.026, darkM, { seg: 16 }));
      // soft round logo + a few stickers
      const disc = (r, col, x, y) => {
        const d = ctx.cylinder([0, 0, 0], [0, 0.008, 0], r, r, ctx.mat.plastic(col, { roughness: 0.4 }), { seg: 32 });
        d.rotation.set(Math.PI / 2, 0, 0);
        d.position.set(x, y, 0.039);
        return d;
      };
      lap.add(disc(0.062, pale(c, CC.color.isDark(c) ? 0.45 : 0.6), 0, 0.01));
      const stickA = CC.color.luminance(c) > 0.62 ? CC.color.shade(c, 0.4) : '#fff3c4';
      lap.add(ctx.extrude(toShape(ctx, shapes.heartRound(ctx, 0.055)), 0.01, ctx.mat.plastic(accentOn(c)), { bevel: 0.006, pos: [0.2, -0.12, 0.042], rot: [0, 0, -0.3] }));
      lap.add(ctx.extrude(toShape(ctx, shapes.star(0.03, 0.065)), 0.01, ctx.mat.plastic(stickA), { bevel: 0.006, pos: [-0.21, 0.11, 0.042], rot: [0, 0, 0.2] }));
      lap.add(disc(0.034, '#9fe0c9', 0.17, 0.13));
      const holder = ctx.group(lap);
      const hd = ctx.A.handL;
      holder.position.set(hd[0] - 0.13, hd[1] - 0.2, hd[2] + 0.0);
      holder.rotation.set(0, -0.75, 0.04, 'YXZ');
      return { armL: ctx.group(holder) };
    },
  },
  {
    id: 'pearls',
    name: '진주 목걸이',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      const pearlC = CC.color.mix(c, '#fffaf1', 0.6);
      const m = ctx.mat.custom({ color: pearlC, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.6, sheenColor: '#ffffff' });
      // closed loop starting at the front centre (th 0), dipping onto the chest
      const pts = [];
      for (let th = 0; th < 360; th += 10) {
        const k = Math.pow((1 + Math.cos(th * D)) / 2, 1.3);
        pts.push(tp(ctx, 1.585 - 0.24 * k, th, 0.13));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const R = 0.046;
      const n = Math.floor(curve.getLength() / (R * 2.02));
      const g = ctx.group();
      curve.getSpacedPoints(n).slice(0, n).forEach((p, i) => {
        if (i === 0) return; // the pendant hangs here
        g.add(ctx.sphere(R, m, { pos: p, seg: 18 }));
      });
      // pendant: a small bail pearl + a glossy coloured drop in front of the chest
      const front = curve.getPointAt(0);
      const nf = tnormal(ctx, front);
      g.add(ctx.sphere(R * 0.85, m, { pos: front.clone().addScaledVector(nf, 0.01), seg: 16 }));
      const dropY = front.y - 0.12;
      const dp = tp(ctx, dropY, 0, 0.13 + 0.045);
      const drop = ctx.sphere(0.066, ctx.mat.custom({ color: c, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 }), { pos: dp, scale: [1, 1.18, 0.78], seg: 24 });
      g.add(drop);
      g.add(ctx.capsule(front.clone().addScaledVector(nf, 0.02), dp.clone().add(new THREE.Vector3(0, 0.07, 0)), 0.012, ctx.mat.metal('#e3c46c', { roughness: 0.3 })));
      return g;
    },
  },
  {
    id: 'cape',
    name: '히어로 망토',
    render(ctx) {
      const THREE = ctx.THREE;
      const c = ctx.color;
      // tonal lining (reads as the same garment from the front) + warm gold trim
      const lining = CC.color.isDark(c) ? CC.color.light(c, 0.26) : CC.color.mix(CC.color.shade(c, 0.06), '#fff6e6', 0.24);
      const trimM = ctx.mat.cloth(CC.color.mix('#ecc35c', c, 0.12), { roughness: 0.5, sheen: 0.9 });
      const outerM = ctx.mat.cloth(c, { roughness: 0.6, sheen: 0.7, side: THREE.FrontSide });
      const innerM = ctx.mat.cloth(lining, { roughness: 0.7, sheen: 0.5, side: THREE.BackSide });
      const yTop = 1.56;
      const yBot = 0.36;
      const capeFn = (u, v) => {
        const y = yTop + (yBot - yTop) * v;
        const spread = 90 + 30 * smoothstep(0.06, 0.32, v);
        const th = (spread + (360 - 2 * spread) * u) * D;
        // drapes from the collar over the shoulders, then hangs and flares toward the hem
        const shoulder = 0.3 + 0.24 * smoothstep(0, 0.14, v);
        let r = shoulder + 0.44 * Math.pow(v, 1.5);
        r += 0.028 * Math.sin(u * Math.PI * 8) * smoothstep(0.15, 1, v);
        const hemDip = -0.06 * Math.sin(Math.PI * u) * v * v;
        return [r * Math.sin(th), y + hemDip, r * Math.cos(th) * 0.84];
      };
      const g = ctx.group(surface(ctx, 72, 40, capeFn, outerM), surface(ctx, 72, 40, capeFn, innerM));
      // hem piping along the bottom and the two front edges
      const hem = [];
      for (let i = 0; i <= 36; i++) hem.push(capeFn(i / 36, 1));
      g.add(ctx.tube(hem, 0.026, trimM, { seg: 120, radial: 8, caps: true }));
      [0, 1].forEach((u) => {
        const e = [];
        for (let i = 0; i <= 16; i++) e.push(capeFn(u, i / 16));
        g.add(ctx.tube(e, 0.024, trimM, { seg: 50, radial: 8, caps: true }));
      });
      // collar ring + round clasp
      const collar = ctx.torus(0.305, 0.06, ctx.mat.cloth(c, { roughness: 0.6, sheen: 0.7 }), { radial: 14, tubular: 56 });
      collar.rotation.x = Math.PI / 2;
      const cg = ctx.group(collar);
      cg.position.y = yTop - 0.01;
      cg.scale.z = 0.86;
      g.add(cg);
      // stand-up collar, open at the front
      const collarFn = (u, v) => {
        const th = (48 + 264 * u) * D;
        const back = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
        const r = 0.31 + 0.09 * v;
        return [r * Math.sin(th), yTop - 0.02 + (0.07 + 0.05 * back) * v, r * Math.cos(th) * 0.86];
      };
      g.add(surface(ctx, 48, 6, collarFn, outerM), surface(ctx, 48, 6, collarFn, innerM));
      const lip = [];
      for (let i = 0; i <= 24; i++) lip.push(collarFn(i / 24, 1));
      g.add(ctx.tube(lip, 0.022, trimM, { seg: 60, radial: 8, caps: true }));
      // big round clasp: gold ring + glossy gem, facing out from the chest
      const gold = ctx.mat.metal('#e3c46c', { roughness: 0.25 });
      const cp = tp(ctx, 1.5, 0, 0.12);
      const clasp = ctx.group(
        ctx.cylinder([0, 0, -0.025], [0, 0, 0.02], 0.082, 0.082, gold, { seg: 32 }),
        ctx.torus(0.075, 0.016, gold, { radial: 10, tubular: 40, pos: [0, 0, 0.022] }),
        ctx.sphere(0.052, ctx.mat.custom({ color: accentOn(c), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }), { pos: [0, 0, 0.022], scale: [1, 1, 0.55], seg: 24 })
      );
      clasp.position.copy(cp);
      clasp.lookAt(cp.clone().add(tnormal(ctx, cp)));
      g.add(clasp);
      return g;
    },
  },
]);

/* ====================================================================== BACKDROPS (2D SVG 600x600) */
/* Shown behind the 3D canvas, bottom-anchored (xMidYMax slice). The character stands at x≈300,
 * feet y≈500-530, head top y≈90: horizon ~y 390-420, centre kept soft and low-contrast. */
const f2 = (v) => +v.toFixed(1);
const B = {
  rect: (x, y, w, h, fill, o = '') => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}" ${o}/>`,
  circle: (x, y, r, fill, o = '') => `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="${fill}" ${o}/>`,
  ellipse: (x, y, rx, ry, fill, o = '') => `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${fill}" ${o}/>`,
  path: (d, fill, o = '') => `<path d="${d}" fill="${fill}" ${o}/>`,
  g: (inner, o = '') => `<g ${o}>${inner}</g>`,
  lin: (id, stops, x2 = 0, y2 = 1) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`,
  rad: (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`,
};
/** fluffy cloud with a flat-ish bottom */
const cloud = (x, y, s, fill = '#ffffff', op = 0.9) =>
  B.g(B.circle(0, 0, 22, fill) + B.circle(26, -12, 29, fill) + B.circle(56, -2, 21, fill) + B.rect(-2, -4, 62, 24, fill, 'rx="12"'), `transform="translate(${x} ${y}) scale(${s})" opacity="${op}"`);
/** round lollipop tree standing on groundY */
const roundTree = (x, gy, s, c1, c2, c3, trunk = '#a77b5a') =>
  B.g(
    B.rect(-7, -46, 14, 50, trunk, 'rx="7"') +
      B.circle(-20, -62, 26, c2) +
      B.circle(20, -64, 24, c2) +
      B.circle(0, -84, 34, c1) +
      B.circle(-10, -94, 12, c3, 'opacity="0.55"'),
    `transform="translate(${x} ${gy}) scale(${s})"`
  );
/** stacked rounded pine; snow caps optional */
const pine = (x, gy, s, c, snow) => {
  const tier = (w, y, h) =>
    B.path(`M${-w} ${y} Q0 ${y - h * 1.25} ${w} ${y} Q0 ${y + 10} ${-w} ${y}Z`, c, 'stroke-linejoin="round"') +
    (snow ? B.path(`M${-w * 0.55} ${y - h * 0.45} Q0 ${y - h * 1.2} ${w * 0.55} ${y - h * 0.45} Q${w * 0.2} ${y - h * 0.32} 0 ${y - h * 0.4} Q${-w * 0.2} ${y - h * 0.3} ${-w * 0.55} ${y - h * 0.45}Z`, snow) : '');
  return B.g(B.rect(-6, -18, 12, 20, '#8a6248', 'rx="5"') + tier(40, -14, 46) + tier(32, -46, 42) + tier(23, -76, 38), `transform="translate(${x} ${gy}) scale(${s})"`);
};
const bush = (x, y, s, c1, c2) => B.g(B.circle(-24, 0, 22, c2) + B.circle(22, 2, 20, c2) + B.circle(0, -10, 28, c1) + B.rect(-44, 0, 86, 20, c2, 'rx="10"'), `transform="translate(${x} ${y}) scale(${s})"`);
const flower = (x, y, s, petal, center = '#ffd36b') => {
  let p = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    p += B.circle(Math.cos(a) * 6, Math.sin(a) * 6, 5, petal);
  }
  return B.g(B.path('M0 4 Q1 14 0 22', 'none', 'stroke="#7cb867" stroke-width="3" stroke-linecap="round"') + p + B.circle(0, 0, 3.6, center), `transform="translate(${x} ${y}) scale(${s})"`);
};
const tuft = (x, y, s, c) => B.path('M-9 0 Q-8 -12 -12 -18 Q-3 -10 -2 0 M-3 0 Q0 -16 2 -24 Q4 -14 4 0 M3 0 Q8 -10 13 -15 Q10 -6 9 0Z', c, `transform="translate(${x} ${y}) scale(${s})"`);
/** four-point sparkle */
const sparkle = (x, y, r, c, op = 1) =>
  B.path(`M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`, c, `opacity="${op}"`);
/** deterministic scatter (no Math.random so thumbnails stay stable) */
function scatter(n, seed, fn) {
  const r = CC.rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) out += fn(r(), r(), r(), i);
  return out;
}
/** keep scattered things out of the character's column */
const outsideCenter = (x, y) => Math.abs(x - 300) > 130 || y < 70 || y > 545;
const leafShape = (x, y, s, rot, c) => B.path('M0 -9 Q7 -3 0 9 Q-7 -3 0 -9Z', c, `transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)}) scale(${s})"`);
const petal = (x, y, s, rot, c) => B.path('M0 -6 Q6 -6 4 2 Q2 6 0 4 Q-2 6 -4 2 Q-6 -6 0 -6Z', c, `transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)}) scale(${s})"`);

CC.register('bg', [
  {
    id: 'forest',
    name: '숲속 빈터',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('sky'), [[0, '#bfe4f6'], [0.55, '#dcf1f0'], [1, '#f2f8e2']]) +
        B.lin(id('grd'), [[0, '#bfe399'], [1, '#9fd07c']]) +
        B.rad(id('sun'), [[0, '#fff8d6', 0.95], [0.5, '#fff3c0', 0.45], [1, '#fff3c0', 0]]) +
        B.rad(id('clr'), [[0, '#e4f5c4', 0.95], [0.7, '#d6efb4', 0.7], [1, '#d6efb4', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += B.circle(470, 100, 150, `url(#${id('sun')})`);
      o += B.circle(470, 100, 34, '#fff7d2', 'opacity="0.9"');
      o += cloud(40, 120, 1.1) + cloud(360, 64, 0.75, '#ffffff', 0.75) + cloud(510, 190, 0.6, '#ffffff', 0.7);
      o += B.path('M0 372 Q80 330 170 356 Q250 378 320 352 Q420 318 500 346 Q560 362 600 340 L600 420 L0 420Z', '#cfe8b7');
      // distant tree line (soft, low contrast in the middle)
      [[20, 0.62], [74, 0.7], [128, 0.58], [470, 0.6], [522, 0.72], [580, 0.62]].forEach(([x, s2]) => (o += roundTree(x, 396, s2, '#9ccd85', '#8cc277', '#c4e6a8', '#9a7a5c')));
      [[200, 0.42], [250, 0.36], [352, 0.38], [404, 0.44]].forEach(([x, s2]) => (o += roundTree(x, 394, s2, '#b9dd9f', '#addb95', '#d4ecbe', '#b19378')));
      o += B.rect(0, 390, 600, 210, `url(#${id('grd')})`);
      o += B.path('M0 396 Q150 384 300 392 Q450 400 600 388 L600 404 L0 404Z', '#c9e8a6', 'opacity="0.7"');
      o += B.ellipse(300, 520, 270, 80, `url(#${id('clr')})`);
      // big foreground trees cropped at the edges
      o += roundTree(18, 520, 2.0, '#86c06f', '#74b462', '#b6df98', '#94694a');
      o += roundTree(590, 512, 1.8, '#8cc673', '#79b965', '#bde3a0', '#94694a');
      o += bush(80, 560, 1.2, '#7dbd69', '#6aaf5a') + bush(530, 575, 1.3, '#82c06c', '#6cb15c');
      o += scatter(26, 7, (a, b, c2, i) => {
        const x = a * 600;
        const y = 420 + b * 170;
        if (!outsideCenter(x, y) && y < 560) return '';
        const cols = ['#ffffff', '#ffd1dc', '#fff0a8', '#e7d4ff'];
        return i % 3 === 0 ? tuft(x, y, 0.9 + c2 * 0.6, '#8fca72') : flower(x, y, 0.75 + c2 * 0.5, cols[i % 4]);
      });
      // a tiny red mushroom by the right tree
      o += B.g(B.rect(-5, -12, 10, 14, '#fbf3e4', 'rx="4"') + B.path('M-15 -10 Q0 -30 15 -10Z', '#ef7b6b') + B.circle(-5, -16, 2.6, '#fff') + B.circle(5, -18, 2, '#fff'), 'transform="translate(520 470) scale(1.3)"');
      return o;
    },
  },
  {
    id: 'office',
    name: '숲속 사무실',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('wall'), [[0, '#f8eedc'], [1, '#f1e1c4']]) +
        B.lin(id('floor'), [[0, '#dfbd93'], [1, '#cfa77a']]) +
        B.lin(id('out'), [[0, '#c6e8f7'], [1, '#e9f6e6']]) +
        B.rad(id('lamp'), [[0, '#fff1c8', 0.8], [1, '#fff1c8', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('wall')})`);
      // windows onto the forest
      const win = (x) => {
        let w = B.path(`M${x} 300 L${x} 150 Q${x} 86 ${x + 75} 86 Q${x + 150} 86 ${x + 150} 150 L${x + 150} 300Z`, '#b98d66');
        w += B.path(`M${x + 12} 290 L${x + 12} 152 Q${x + 12} 98 ${x + 75} 98 Q${x + 138} 98 ${x + 138} 152 L${x + 138} 290Z`, `url(#${id('out')})`);
        w += B.circle(x + 40, 262, 34, '#a6d68c') + B.circle(x + 104, 268, 30, '#94cb7d') + B.circle(x + 72, 236, 30, '#b6df9e') + B.rect(x + 12, 262, 126, 28, '#9fd184');
        w += B.circle(x + 50, 140, 12, '#ffffff', 'opacity="0.8"') + B.circle(x + 64, 134, 15, '#ffffff', 'opacity="0.8"');
        w += B.rect(x + 71, 98, 8, 192, '#c79c74') + B.rect(x + 12, 196, 126, 8, '#c79c74');
        w += B.rect(x - 8, 296, 166, 16, '#c99e76', 'rx="6"');
        return w;
      };
      o += win(22) + win(428);
      // pennant garland
      let gar = B.path('M-10 26 Q300 92 610 26', 'none', 'stroke="#c9a37f" stroke-width="3"');
      const cols = ['#f4a6b6', '#f6d36b', '#9fd3c7', '#b7a6e8', '#f5b57e'];
      for (let i = 0; i < 13; i++) {
        const t = (i + 0.5) / 13;
        const x = -10 + 620 * t;
        const y = 26 + 66 * 4 * t * (1 - t) * 0.5 * 2 * 0.5;
        gar += B.path(`M${f2(x - 13)} ${f2(y)} L${f2(x + 13)} ${f2(y)} L${f2(x)} ${f2(y + 26)}Z`, cols[i % 5], 'stroke-linejoin="round" stroke-width="4" stroke="' + cols[i % 5] + '"');
      }
      o += gar;
      // wainscot + skirting
      o += B.rect(0, 330, 600, 82, '#ead6b4') + B.rect(0, 326, 600, 9, '#dcc29b', 'rx="4"');
      for (let x = 30; x < 600; x += 60) o += B.rect(x, 346, 40, 50, '#e3cba5', 'rx="6"');
      o += B.rect(0, 404, 600, 196, `url(#${id('floor')})`);
      for (let y = 436; y < 600; y += 38) o += B.rect(0, y, 600, 3, '#c49a6e', 'opacity="0.45"');
      o += scatter(14, 3, (a, b) => B.rect(a * 600, 406 + Math.floor(b * 5) * 38, 3, 32, '#c49a6e', 'opacity="0.4"'));
      // rug
      o += B.ellipse(300, 528, 230, 60, '#f2dccb') + B.ellipse(300, 528, 205, 48, 'none', 'stroke="#e6c3a6" stroke-width="5" stroke-dasharray="2 10" stroke-linecap="round"');
      // desk on the right with a monitor, mug and a little plant
      let desk = B.rect(440, 428, 200, 18, '#c08f62', 'rx="8"') + B.rect(456, 444, 14, 110, '#ad7d53', 'rx="6"') + B.rect(610, 444, 14, 110, '#ad7d53', 'rx="6"');
      desk += B.rect(476, 352, 104, 66, '#5d5a66', 'rx="10"') + B.rect(483, 359, 90, 52, '#bfe6f0', 'rx="6"') + B.rect(490, 368, 40, 8, '#ffffff', 'rx="4" opacity="0.9"') + B.rect(490, 382, 60, 6, '#ffffff', 'rx="3" opacity="0.7"') + B.rect(490, 394, 30, 6, '#f6c1cf', 'rx="3"');
      desk += B.rect(520, 416, 16, 14, '#5d5a66', 'rx="3"') + B.rect(505, 426, 46, 6, '#5d5a66', 'rx="3"');
      desk += B.rect(592, 398, 22, 30, '#f7f2e8', 'rx="6"') + B.path('M614 406 Q626 412 614 420', 'none', 'stroke="#f7f2e8" stroke-width="5"');
      desk += B.rect(452, 404, 22, 24, '#e98f6e', 'rx="5"') + B.ellipse(456, 396, 9, 14, '#6fb86a', 'transform="rotate(-20 456 396)"') + B.ellipse(470, 394, 9, 15, '#82c574', 'transform="rotate(18 470 394)"');
      o += desk;
      // big potted plant on the left
      let pl = '';
      [[-40, -120, -35], [-6, -150, -8], [30, -128, 28], [-56, -82, -60], [48, -88, 52]].forEach(([x, y, r], i) => {
        pl += B.ellipse(x, y, 26, 44, i % 2 ? '#6fb466' : '#5ea85a', `transform="rotate(${r} ${x} ${y})"`);
        pl += B.path(`M0 -20 Q${x * 0.4} ${y * 0.5} ${x} ${y + 30}`, 'none', 'stroke="#4f9550" stroke-width="5" stroke-linecap="round"');
      });
      pl += B.path('M-40 -24 L40 -24 L32 30 Q0 38 -32 30Z', '#e9dccb') + B.rect(-44, -30, 88, 14, '#f3e9da', 'rx="7"');
      o += B.g(pl, 'transform="translate(78 530) scale(1.05)"');
      return o;
    },
  },
  {
    id: 'cafe',
    name: '골목 카페',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('wall'), [[0, '#fbefe1'], [1, '#f6e4cf']]) +
        B.rad(id('glow'), [[0, '#ffe7a8', 0.75], [1, '#ffe7a8', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('wall')})`);
      for (let x = 0; x < 600; x += 46) o += B.rect(x, 0, 18, 320, '#f8e8d4', 'opacity="0.8"');
      // pendant lamps (sides)
      [[86, 150], [514, 130]].forEach(([x, len]) => {
        o += B.rect(x - 1.5, 0, 3, len, '#7a5a46');
        o += B.circle(x, len + 30, 70, `url(#${id('glow')})`);
        o += B.path(`M${x - 34} ${len + 26} Q${x - 30} ${len - 4} ${x} ${len - 4} Q${x + 30} ${len - 4} ${x + 34} ${len + 26}Z`, '#e9a46b');
        o += B.ellipse(x, len + 27, 13, 6, '#fff3cc');
      });
      // shelf with cups and jars (left)
      let sh = B.rect(18, 236, 150, 10, '#b5845c', 'rx="4"');
      [[34, '#f7f2e8'], [62, '#f4b8b0'], [90, '#bfe0d2'], [118, '#f7f2e8']].forEach(([x, c]) => {
        sh += B.path(`M${x - 10} 212 L${x + 10} 212 L${x + 8} 236 L${x - 8} 236Z`, c) + B.path(`M${x + 9} 218 Q${x + 18} 224 ${x + 8} 230`, 'none', `stroke="${c}" stroke-width="4"`);
      });
      sh += B.rect(136, 200, 22, 36, '#cfe6ef', 'rx="6" opacity="0.9"') + B.rect(136, 196, 22, 8, '#b5845c', 'rx="3"');
      o += sh;
      // chalk menu board (right) — squiggles, no text
      let mb = B.rect(420, 170, 156, 150, '#a87a52', 'rx="12"') + B.rect(430, 180, 136, 130, '#3f4b46', 'rx="8"');
      mb += B.path('M448 206 q10 -8 20 0 t20 0 t20 0', 'none', 'stroke="#f3eee2" stroke-width="4" stroke-linecap="round"');
      [234, 256, 278].forEach((y, i) => {
        mb += B.rect(448, y, 54 + i * 8, 5, '#f3eee2', 'rx="2.5" opacity="0.85"') + B.circle(540, y + 2.5, 4, ['#f4b8b0', '#bfe0d2', '#f6d36b'][i]);
      });
      mb += B.path('M520 196 h22 v14 q0 10 -11 10 q-11 0 -11 -10Z', '#f3eee2') + B.path('M543 200 q8 2 0 8', 'none', 'stroke="#f3eee2" stroke-width="3"');
      o += mb;
      // wainscot + floor tiles
      o += B.rect(0, 320, 600, 92, '#cfe7dc') + B.rect(0, 316, 600, 8, '#b6d8c9', 'rx="4"');
      for (let x = 12; x < 600; x += 24) o += B.rect(x, 328, 3, 78, '#bcdcce', 'opacity="0.8"');
      o += B.rect(0, 408, 600, 192, '#efe1cd');
      for (let r = 0; r < 6; r++)
        for (let k = 0; k < 12; k++) if ((r + k) % 2 === 0) o += B.rect(k * 50, 408 + r * 34, 50, 34, '#e9d9c3');
      o += B.ellipse(300, 528, 240, 58, '#f1e4d1', 'opacity="0.85"');
      // counter on the left with a coffee machine
      let ct = B.rect(-20, 372, 190, 22, '#9b6c4a', 'rx="8"') + B.rect(-10, 392, 168, 120, '#b5845c', 'rx="6"') + B.rect(6, 408, 136, 88, '#c79a72', 'rx="8"');
      ct += B.rect(30, 300, 70, 74, '#e9e4dc', 'rx="14"') + B.rect(40, 312, 50, 20, '#cfc8bd', 'rx="6"') + B.rect(54, 342, 22, 16, '#7a5a46', 'rx="4"') + B.rect(54, 362, 22, 10, '#f7f2e8', 'rx="3"');
      ct += B.path('M118 372 L150 372 L146 348 L122 348Z', '#f4b8b0') + B.ellipse(134, 346, 16, 5, '#fff3e6');
      o += ct;
      // round table with cake (right)
      let tb = B.ellipse(520, 452, 74, 16, '#c08f62') + B.rect(512, 458, 16, 92, '#ad7d53', 'rx="6"') + B.ellipse(520, 552, 40, 8, '#ad7d53');
      tb += B.rect(490, 424, 30, 26, '#f7f2e8', 'rx="6"') + B.rect(496, 418, 18, 8, '#fff') + B.path('M530 446 L566 446 L560 426 L536 426Z', '#fbe1e6') + B.circle(548, 421, 6, '#e8606a');
      o += tb;
      return o;
    },
  },
  {
    id: 'blossom',
    name: '벚꽃 공원',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('sky'), [[0, '#cfe8f8'], [0.6, '#f4ecf4'], [1, '#fbe9ef']]) +
        B.lin(id('grd'), [[0, '#cde9ad'], [1, '#b6dc94']]) +
        B.lin(id('path'), [[0, '#f6ead6'], [1, '#efdcbd']]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += cloud(250, 70, 0.7, '#ffffff', 0.7) + cloud(470, 120, 0.5, '#ffffff', 0.6);
      o += B.path('M0 380 Q120 340 240 370 Q360 396 470 352 Q540 330 600 352 L600 420 L0 420Z', '#dcecd0');
      // distant blossom puffs
      [[150, 380, 30], [196, 386, 22], [420, 378, 26], [462, 384, 20], [96, 384, 24]].forEach(([x, y, r]) => (o += B.circle(x, y, r, '#f7d6e2') + B.circle(x - r * 0.4, y + 4, r * 0.7, '#f3c9d8')));
      o += B.rect(0, 392, 600, 208, `url(#${id('grd')})`);
      // winding path toward the horizon (character stands on it)
      o += B.path('M290 396 C280 440 256 492 150 600 L452 600 C372 520 334 452 312 396 Q301 392 290 396Z', `url(#${id('path')})`);
      o += B.path('M296 404 C290 440 272 490 214 560', 'none', 'stroke="#fbf3e6" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 22" opacity="0.9"');
      o += B.ellipse(300, 525, 170, 46, '#f3e3c9', 'opacity="0.8"');
      // cherry trees on both sides
      const blossomTree = (x, gy, s, flip) => {
        let t = B.path('M-10 0 Q-14 -60 -4 -110 Q8 -150 -20 -190 L-6 -196 Q20 -160 12 -112 Q30 -150 56 -168 L62 -158 Q30 -128 18 -60 Q14 -24 14 0Z', '#9b6b52');
        [[-60, -220, 64, '#f6c3d4'], [20, -250, 70, '#f9d3e0'], [80, -200, 54, '#f4b6cb'], [-20, -170, 54, '#f9cfdd'], [40, -180, 50, '#fbe0ea'], [-80, -160, 40, '#f4bacd']].forEach(([cx, cy, r, c]) => (t += B.circle(cx, cy, r, c)));
        t += B.circle(10, -262, 20, '#fde9f0', 'opacity="0.8"') + B.circle(-62, -232, 16, '#fde9f0', 'opacity="0.7"');
        return B.g(t, `transform="translate(${x} ${gy}) scale(${flip ? -s : s} ${s})"`);
      };
      o += blossomTree(40, 470, 1.25, false) + blossomTree(566, 460, 1.15, true);
      o += scatter(50, 11, (a, b, c2, i) => {
        const x = a * 600;
        const y = b * 600;
        if (!outsideCenter(x, y)) return '';
        return petal(x, y, 0.8 + c2 * 0.8, c2 * 360, i % 2 ? '#f6b9cc' : '#fbd3df');
      });
      o += bush(90, 572, 1.2, '#8ccc72', '#79bd63') + bush(520, 580, 1.2, '#8ccc72', '#79bd63');
      return o;
    },
  },
  {
    id: 'night',
    name: '별밤 언덕',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('sky'), [[0, '#262d63'], [0.45, '#3d4385'], [0.8, '#7a70b0'], [1, '#b6a3cf']]) +
        B.lin(id('grd'), [[0, '#4f6f8f'], [1, '#3c5674']]) +
        B.rad(id('moon'), [[0, '#fff6cf', 0.8], [1, '#fff6cf', 0]]) +
        B.rad(id('ff'), [[0, '#fff3a6', 1], [1, '#fff3a6', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += scatter(70, 21, (a, b, c2, i) => {
        const x = a * 600;
        const y = b * 360;
        const op = Math.abs(x - 300) < 120 ? 0.45 : 0.95;
        return i % 7 === 0 ? sparkle(x, y, 5 + c2 * 6, '#fff4c9', op) : B.circle(x, y, 1 + c2 * 1.8, '#ffffff', `opacity="${op}"`);
      });
      o += B.circle(470, 110, 90, `url(#${id('moon')})`);
      o += B.path('M470 70 A40 40 0 1 0 506 132 A34 34 0 1 1 470 70Z', '#fff2c2');
      o += B.path('M40 60 L120 100', 'none', 'stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.7"') + sparkle(40, 60, 8, '#ffffff');
      o += B.path('M0 380 Q110 320 230 360 Q330 392 430 340 Q520 300 600 336 L600 430 L0 430Z', '#3f4f80');
      o += B.path('M0 404 Q160 372 300 396 Q450 420 600 384 L600 440 L0 440Z', '#46628a');
      // a tiny cottage with warm windows (left)
      let h = B.rect(-34, -40, 68, 40, '#f2e2c6', 'rx="4"') + B.path('M-44 -38 L0 -76 L44 -38Z', '#c9707a', 'stroke="#c9707a" stroke-width="6" stroke-linejoin="round"');
      h += B.rect(-22, -28, 16, 14, '#ffd77e', 'rx="3"') + B.rect(8, -28, 14, 28, '#a66b55', 'rx="3"');
      o += B.g(h, 'transform="translate(92 392) scale(0.9)"');
      o += B.rect(0, 410, 600, 190, `url(#${id('grd')})`);
      o += B.ellipse(300, 525, 250, 66, '#5a7b9c', 'opacity="0.55"');
      o += scatter(16, 5, (a, b, c2) => {
        const x = a * 600;
        const y = 300 + b * 260;
        if (!outsideCenter(x, y)) return '';
        return B.circle(x, y, 10 + c2 * 8, `url(#${id('ff')})`, 'opacity="0.75"') + B.circle(x, y, 2.4, '#fffbe0');
      });
      o += scatter(16, 9, (a, b, c2) => {
        const x = a * 600;
        const y = 430 + b * 160;
        if (!outsideCenter(x, y)) return '';
        return tuft(x, y, 1 + c2 * 0.5, '#33506c');
      });
      return o;
    },
  },
  {
    id: 'snow',
    name: '눈 오는 들판',
    render(ctx) {
      const id = ctx.id;
      const defs = B.lin(id('sky'), [[0, '#b4cfeb'], [0.6, '#dbe8f5'], [1, '#eef4fa']]) + B.lin(id('grd'), [[0, '#fbfdff'], [1, '#eaf1f9']]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += B.path('M-20 380 L80 290 Q92 280 104 290 L180 352 L260 300 Q272 292 284 300 L380 372 L460 310 Q472 302 484 310 L620 400 L620 420 L-20 420Z', '#e3ecf6');
      o += B.path('M70 300 L80 290 Q92 280 104 290 L114 298 L100 306 L88 298Z M250 308 L260 300 Q272 292 284 300 L292 306 L276 312Z', '#ffffff');
      o += B.path('M0 396 Q150 372 300 390 Q450 408 600 380 L600 600 L0 600Z', `url(#${id('grd')})`);
      [[30, 430, 1.25], [96, 418, 0.95], [150, 406, 0.62], [470, 404, 0.66], [520, 420, 1.0], [586, 436, 1.3]].forEach(([x, y, s2]) => (o += pine(x, y, s2, '#5f9389', '#ffffff')));
      o += B.ellipse(300, 525, 250, 60, '#e1eaf6', 'opacity="0.8"');
      o += B.path('M0 520 Q70 490 150 520 Q90 540 0 540Z', '#e4edf7') + B.path('M600 506 Q520 486 450 516 Q520 536 600 534Z', '#e4edf7');
      // snowman (right)
      let sm = B.circle(0, -30, 32, '#ffffff') + B.circle(0, -84, 24, '#ffffff') + B.ellipse(0, -2, 34, 6, '#d9e4f2');
      sm += B.circle(-8, -88, 3, '#3b3540') + B.circle(8, -88, 3, '#3b3540') + B.path('M0 -82 L18 -78 L0 -76Z', '#f39a4a');
      sm += B.path('M-24 -64 Q0 -54 24 -64 L24 -56 Q0 -46 -24 -56Z', '#e8606a') + B.rect(10, -60, 10, 26, '#e8606a', 'rx="4"');
      sm += B.path('M-30 -42 L-56 -60 M-46 -52 L-54 -44 M30 -42 L56 -62', 'none', 'stroke="#8a6248" stroke-width="4" stroke-linecap="round"');
      sm += B.path('M-18 -104 Q0 -116 18 -104 L16 -98 L-16 -98Z', '#5b7fc4');
      o += B.g(sm, 'transform="translate(500 520) scale(0.95)"');
      o += scatter(70, 17, (a, b, c2) => {
        const x = a * 600;
        const y = b * 580;
        const op = Math.abs(x - 300) < 120 && y > 70 ? 0.5 : 0.95;
        return B.circle(x, y, 2 + c2 * 3.5, '#ffffff', `opacity="${op}"`);
      });
      return o;
    },
  },
  {
    id: 'beach',
    name: '노을 해변',
    render(ctx) {
      const id = ctx.id;
      const defs =
        B.lin(id('sky'), [[0, '#f4a9a8'], [0.45, '#fbc9a6'], [1, '#ffe6b6']]) +
        B.lin(id('sea'), [[0, '#83bccb'], [1, '#b7dfda']]) +
        B.lin(id('sand'), [[0, '#f7e2bb'], [1, '#efcf9b']]) +
        B.rad(id('sun'), [[0, '#fff3c9', 0.95], [0.4, '#ffe6a6', 0.55], [1, '#ffe6a6', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += B.circle(150, 372, 170, `url(#${id('sun')})`);
      o += B.circle(150, 372, 62, '#fff1c4');
      o += B.rect(30, 140, 200, 14, '#fbd6c6', 'rx="7" opacity="0.8"') + B.rect(90, 166, 140, 10, '#fbd6c6', 'rx="5" opacity="0.7"') + B.rect(380, 96, 190, 14, '#f9c4bc', 'rx="7" opacity="0.7"') + B.rect(430, 122, 120, 10, '#f9c4bc', 'rx="5" opacity="0.6"');
      o += B.rect(0, 372, 600, 70, `url(#${id('sea')})`);
      [[118, 386, 64], [132, 400, 40], [142, 414, 24]].forEach(([x, y, w]) => (o += B.rect(x, y, w, 4, '#fff3cf', 'rx="2" opacity="0.85"')));
      o += B.rect(380, 392, 40, 3, '#e8f6f4', 'rx="1.5" opacity="0.8"') + B.rect(480, 410, 56, 3, '#e8f6f4', 'rx="1.5" opacity="0.8"');
      o += B.rect(0, 432, 600, 168, `url(#${id('sand')})`);
      let foam = 'M0 436';
      for (let x = 0; x <= 600; x += 40) foam += ` Q${x + 20} ${x % 80 ? 446 : 442} ${x + 40} 436`;
      o += B.path(foam + ' L600 430 L0 430Z', '#fdf8ee', 'opacity="0.9"');
      o += B.ellipse(300, 525, 250, 56, '#fbeacb', 'opacity="0.8"');
      // palm tree (right)
      let palm = B.path('M0 0 Q-6 -80 18 -170 L32 -166 Q12 -80 22 0Z', '#a8774f');
      for (let k = 0; k < 6; k++) palm += B.rect(-2 + k * 3, -24 - k * 26, 24, 5, '#8f6340', `rx="2.5" transform="rotate(${-8 - k * 2} ${10 + k * 3} ${-22 - k * 26})"`);
      [[-70, -150, -30], [-40, -190, -70], [10, -205, -100], [60, -195, -130], [80, -150, -165]].forEach(([x, y, r], i) => {
        palm += B.path(`M25 -170 Q${(25 + x) / 2} ${y - 20} ${x} ${y} Q${(25 + x) / 2 + 6} ${y + 6} 25 -164Z`, i % 2 ? '#5aa463' : '#4b955a');
      });
      palm += B.circle(20, -160, 8, '#7a5236') + B.circle(32, -156, 8, '#7a5236');
      o += B.g(palm, 'transform="translate(520 520) scale(1.05)"');
      // parasol + towel (left)
      let par = B.rect(-2, -150, 5, 150, '#f3efe6', 'rx="2"') + B.path('M-90 -140 Q0 -210 90 -140Z', '#ef7f78');
      par += B.path('M-30 -140 Q-20 -196 0 -176 Q20 -196 30 -140Z', '#fff3e4') + B.circle(0, -178, 5, '#f3efe6');
      o += B.g(par, 'transform="translate(78 548) rotate(-8)"');
      o += B.rect(18, 548, 130, 30, '#7fc0d6', 'rx="8" transform="rotate(-6 80 560)"');
      o += B.path('M0 -10 L3 -3 L10 -3 L4 2 L6 9 L0 5 L-6 9 L-4 2 L-10 -3 L-3 -3Z', '#f39a7a', 'transform="translate(470 560) scale(1.6)" stroke="#f39a7a" stroke-width="3" stroke-linejoin="round"');
      o += B.path('M-10 0 Q0 -16 10 0Z', '#fde3ef', 'transform="translate(560 580) scale(1.4)"');
      return o;
    },
  },
  {
    id: 'autumn',
    name: '단풍 산책길',
    render(ctx) {
      const id = ctx.id;
      const defs = B.lin(id('sky'), [[0, '#f9dcb8'], [0.6, '#fcebd4'], [1, '#fdf2e1']]) + B.lin(id('grd'), [[0, '#ecc98e'], [1, '#e0b677']]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('sky')})`);
      o += cloud(60, 90, 0.9, '#fff8ee', 0.85) + cloud(420, 60, 0.7, '#fff8ee', 0.75);
      [[30, 0.6, '#f0b25a'], [86, 0.66, '#e98f4a'], [140, 0.5, '#f3c46b'], [196, 0.38, '#f2c88a'], [404, 0.4, '#f2c88a'], [462, 0.56, '#f0a35a'], [520, 0.68, '#e8844c'], [578, 0.6, '#f3be62']].forEach(([x, s2, c]) => (o += roundTree(x, 398, s2, c, CC.color.shade(c, 0.1), CC.color.light(c, 0.4), '#9b7258')));
      o += B.rect(0, 392, 600, 208, `url(#${id('grd')})`);
      o += B.path('M286 394 Q250 470 200 600 L400 600 Q350 470 314 394Z', '#f4ddb3', 'opacity="0.9"');
      o += B.ellipse(300, 525, 230, 54, '#f3d9a8', 'opacity="0.8"');
      o += roundTree(14, 520, 1.95, '#e8743f', '#d9603a', '#f6a873', '#8c624a');
      o += roundTree(594, 514, 1.8, '#f2b44f', '#e69a3e', '#f9d488', '#8c624a');
      const leafCols = ['#e8743f', '#d9583b', '#f2b648', '#e99a46'];
      o += scatter(46, 13, (a, b, c2, i) => {
        const x = a * 600;
        const y = b * 600;
        if (!outsideCenter(x, y)) return '';
        return leafShape(x, y, 0.9 + c2 * 0.7, c2 * 360, leafCols[i % 4]);
      });
      o += B.g(scatter(14, 4, (a, b, c2, i) => leafShape(a * 120 - 60, b * 30 - 15, 1.3, c2 * 360, leafCols[i % 4])), 'transform="translate(90 572)"');
      o += B.g(scatter(14, 8, (a, b, c2, i) => leafShape(a * 120 - 60, b * 30 - 15, 1.3, c2 * 360, leafCols[(i + 1) % 4])), 'transform="translate(520 580)"');
      return o;
    },
  },
  {
    id: 'plain',
    name: '단색 파스텔',
    render(ctx) {
      const id = ctx.id;
      const defs = B.rad(id('bg'), [[0, '#fffaf0'], [0.65, '#fbeedd'], [1, '#f3dfc5']], 0.5, 0.45, 0.75) + B.rad(id('fl'), [[0, '#efd9bc', 0.9], [1, '#efd9bc', 0]]);
      let o = `<defs>${defs}</defs>`;
      o += B.rect(0, 0, 600, 600, `url(#${id('bg')})`);
      o += B.ellipse(300, 528, 230, 54, `url(#${id('fl')})`);
      o += scatter(18, 2, (a, b, c2) => {
        const x = a * 600;
        const y = b * 600;
        if (!outsideCenter(x, y)) return '';
        return B.circle(x, y, 3 + c2 * 5, '#f6e2c6', 'opacity="0.9"');
      });
      return o;
    },
  },
  { id: 'none', name: '투명', render: () => '' },
]);
