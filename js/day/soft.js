/*
 * 직장의 숲 · 하루 — soft.js (furniture shapes with the same care as the character)
 *
 *   softBox      pillows, mattresses, cushions: a superellipsoid, fat in the middle
 *   drape        a slab of cloth laid on a rectangle that bends over its edges, hangs down
 *                in soft folds and spreads out where it reaches the floor (duvets, quilts,
 *                kotatsu blankets); bump(x, z) lifts it over whatever lies underneath
 *   curtainGeo   a pleated curtain panel, gathered at a tie-back
 *   latheMesh    turned shapes (lamp shades, bowls, pots) from a profile
 *   plant        a potted plant with real leaves
 *   limb         a capsule from one point to another (arms, legs, rods)
 *   frameGeo     a rounded rectangular frame (picture frames, window surrounds)
 *   roundRect    a rounded rectangle traced into a Shape or Path (for holes)
 *   bake         merge many still meshes into one per material (fewer draw calls)
 *   bodyField    a height map of the character's body (vertices, skinning included)
 *   textures     wood grain, quilt stitching, woven pattern, plaid, wicker, seat fabric,
 *                speckled rubber — luminance on white, so the material colour tints them
 */
import { THREE, canvasTex, shade, seg } from './kit.js';
import { sceneMat } from '../char3d.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/* ============================================================== shapes */
/**
 * Superellipsoid w × h × d centred on the origin. o.ex: squareness seen from above
 * (0.1 boxy .. 1 round), o.ey: of the thickness (small = flat top), o.puff: how much
 * thinner the rim is than the middle (0 none .. 0.7 a plump pillow).
 * UVs are a top-down projection in metres. o.segW / o.segH: segments (default: by size).
 */
export function softBoxGeo(w, h, d, o = {}) {
  // detail follows size: a phone needs far fewer segments than a mattress
  const segW = seg(o.segW || Math.round(clamp(12 + Math.max(w, h, d) * 22, 16, 56)), 10);
  const geo = new THREE.SphereGeometry(1, segW, o.segH ? seg(o.segH, 6) : Math.round(segW * 0.65));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const ex = o.ex ?? 0.3;
  const ey = o.ey ?? 0.6;
  const puff = o.puff ?? 0;
  const f = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const X = f(p.getX(i), ex);
    const Z = f(p.getZ(i), ex);
    const Y = f(p.getY(i), ey);
    const rim = Math.pow(Math.max(Math.abs(X), Math.abs(Z)), 3);
    p.setXYZ(i, (X * w) / 2, ((Y * h) / 2) * (1 - puff * rim), (Z * d) / 2);
  }
  const merged = mergeClose(geo);
  const mp = merged.attributes.position;
  const uv = new Float32Array(mp.count * 2);
  for (let i = 0; i < mp.count; i++) {
    uv[i * 2] = mp.getX(i);
    uv[i * 2 + 1] = mp.getZ(i);
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeVertexNormals();
  return merged;
}

/** weld vertices that sit on top of each other (the sphere's seam and poles) */
function mergeClose(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = verts.length / 3;
      map.set(k, j);
      verts.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    index.push(j);
  }
  // drop triangles that collapsed at the poles
  const tri = [];
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(tri);
  return out;
}

export function softBox(w, h, d, material, o) {
  return shade(new THREE.Mesh(softBoxGeo(w, h, d, o), material));
}

/**
 * Cloth draped over a rectangle.
 *   rect [x0, x1, z0, z1]   what it lies on; y = the height of that surface
 *   hang [left, right, back, front]   how much cloth runs past each edge
 *   thick, r (bend radius at the edges), floor (where it starts to spread out)
 *   flare: it swings outward as it hangs; wave [amp, freq]: folds in the hanging part
 *   hemY: if given, the hanging part always ends at this height, however high the bump
 *         lifts the edge it falls from (the cloth is stretched to fit)
 *   bump(x, z): extra height of the cloth's underside above y (a body under the duvet)
 * Returns { geometry, at(fx, fz, off) } — at() maps a point of the flat cloth to the scene.
 * UVs are the flat cloth's coordinates in metres (texture.repeat = 1 / tile size).
 */
export function drape(o) {
  const [x0, x1, z0, z1] = o.rect;
  const [hl, hr, hb, hf] = o.hang;
  const R = o.r ?? 0.12;
  const T = o.thick ?? 0.1;
  const arc = (Math.PI / 2) * R;
  const floorY = (o.floor ?? 0) + T / 2 + 0.004;
  const tmp = new THREE.Vector3();

  function at(fx, fz, off, out = tmp) {
    const qx = clamp(fx, x0, x1);
    const qz = clamp(fz, z0, z1);
    const dx = fx - qx;
    const dz = fz - qz;
    let s = Math.hypot(dx, dz);
    const top = o.y + T / 2 + (o.bump ? o.bump(qx, qz) : 0);
    if (s < 1e-6) return out.set(fx, top + off, fz);
    const ux = dx / s;
    const uz = dz / s;
    if (o.hemY != null) {
      // how far this row of cloth reaches past the edge, and how much it needs to reach the hem
      const lim = (u, neg, pos) => (u > 1e-6 ? pos / u : u < -1e-6 ? neg / -u : Infinity);
      const sMax = Math.min(lim(ux, hl, hr), lim(uz, hb, hf));
      if (sMax > 1e-6 && Number.isFinite(sMax)) s = (s / sMax) * (arc + Math.max(0, top - R - o.hemY));
    }
    let h;
    let v;
    let nh;
    let ny;
    if (s < arc) {
      const a = s / R;
      h = R * Math.sin(a);
      v = top - R + R * Math.cos(a);
      nh = Math.sin(a);
      ny = Math.cos(a);
    } else {
      h = R;
      v = top - R - (s - arc);
      nh = 1;
      ny = 0;
    }
    const hang = Math.max(0, s - arc);
    h += (o.flare || 0) * hang * hang;
    if (o.wave) h += o.wave[0] * Math.min(1, hang / 0.2) * Math.sin((qx + qz) * o.wave[1] + (o.wave[2] || 0));
    if (v < floorY) {
      // the rest lies on the floor
      h += floorY - v;
      v = floorY;
      nh = 0;
      ny = 1;
    }
    return out.set(qx + ux * (h + nh * off), v + ny * off, qz + uz * (h + nh * off));
  }

  const W = x1 - x0 + hl + hr;
  const D = z1 - z0 + hb + hf;
  const cell = o.cell || 0.05;
  const geo = new THREE.BoxGeometry(W, T, D, Math.max(2, Math.round(W / cell)), 1, Math.max(2, Math.round(D / cell)));
  geo.translate(x0 - hl + W / 2, 0, z0 - hb + D / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const fx = p.getX(i);
    const fz = p.getZ(i);
    uv.setXY(i, fx, fz);
    at(fx, fz, p.getY(i), v3);
    p.setXYZ(i, v3.x, v3.y, v3.z);
  }
  geo.computeVertexNormals();
  return { geometry: geo, at: (fx, fz, off, out) => at(fx, fz, off, out || new THREE.Vector3()) };
}

/**
 * A pleated curtain panel hanging from y = 0 down to -h. Its outer edge is at x = 0 and it
 * reaches toward +x (dir = -1 mirrors it). Gathered at a tie-back at tie (0..1 down the
 * panel) to `waist` of its width; folds = number of pleats, depth = how deep they are.
 */
export function curtainGeo(o) {
  const folds = o.folds || 5;
  const geo = new THREE.PlaneGeometry(1, 1, folds * seg(10, 6), seg(48, 20));
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const tie = o.tie ?? 0.58;
  const waist = o.waist ?? 0.42;
  const top = o.top ?? 0.86;
  const hem = o.hem ?? 1.06;
  const dir = o.dir ?? 1;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5; // 0 outer edge .. 1 inner edge
    const v = 0.5 - p.getY(i); // 0 top .. 1 hem
    const k = v < tie ? top + (waist - top) * sstep(v / tie) : waist + (hem - waist) * sstep((v - tie) / (1 - tie));
    const amp = o.depth * (0.5 + 0.5 / Math.sqrt(k / top)) * (1 + 0.2 * v);
    const z = Math.sin(u * folds * Math.PI * 2 + 0.6) * amp + amp * 0.6;
    // the hem swings a little and the inner edge droops past the waist
    const y = -v * o.h + (v > 0.97 ? 0.01 * Math.sin(u * folds * Math.PI * 2) : 0);
    p.setXYZ(i, u * o.w * k * dir, y, z);
    uv.setXY(i, u * o.w, v * o.h);
  }
  geo.computeVertexNormals();
  return geo;
}

/** turned shape from a profile [[radius, y], ...] (bottom to top) */
export function latheMesh(profile, material, around = 48) {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg(around, 10)
  );
  return shade(new THREE.Mesh(geo, material));
}

/** a flower pot with a rolled rim, soil and leaves fanning out of it (o.wide: leaf width, 1 = broad) */
export function plant(o = {}) {
  const g = new THREE.Group();
  const r = o.r ?? 0.16;
  const h = o.h ?? 0.24;
  const potM = sceneMat.glossy(o.pot || '#f3e7d3', { roughness: 0.45 });
  g.add(
    latheMesh(
      [
        [0, 0],
        [r * 0.72, 0],
        [r * 0.8, 0.02],
        [r * 0.95, h * 0.82],
        [r * 1.06, h * 0.84],
        [r * 1.08, h],
        [r * 0.9, h],
        [r * 0.88, h * 0.9],
        [0, h * 0.9],
      ],
      potM,
      32
    )
  );
  const soil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, seg(24, 10)), sceneMat.cloth('#6b4a33', { grain: false }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h * 0.9;
  g.add(soil);
  const n = o.leaves ?? 9;
  const len = o.len ?? 0.32;
  const greens = o.greens || ['#5ea56b', '#6fb27a', '#4f9a60'];
  const leafGeo = new THREE.SphereGeometry(1, seg(12, 8), seg(6, 4));
  // a leaf: flat, pointed at the tip, starting at the origin and running along +z
  {
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const z = lp.getZ(i);
      const t = (z + 1) / 2; // 0 base .. 1 tip
      const wdt = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.9 + 0.05;
      lp.setXYZ(i, lp.getX(i) * 0.42 * wdt, lp.getY(i) * 0.05 + Math.sin(t * Math.PI) * 0.08 - t * t * 0.12, t);
    }
    leafGeo.computeVertexNormals();
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + (o.turn || 0);
    const up = (o.tilt ?? 0.95) - (i / n) * 0.55;
    const s = len * (0.75 + 0.25 * ((i * 7) % 5) / 4) * (1 - (i / n) * 0.25);
    const leaf = new THREE.Mesh(leafGeo, sceneMat.leaf(greens[i % greens.length]));
    leaf.scale.set(s * (o.wide ?? 1), s, s);
    leaf.position.set(Math.cos(a) * r * 0.25, h * 0.92, Math.sin(a) * r * 0.25);
    leaf.rotation.set(0, Math.PI / 2 - a, 0, 'YXZ');
    leaf.rotateX(-up);
    g.add(shade(leaf));
  }
  return g;
}

/** a capsule of radius r from a to b ([x, y, z]) */
export function limb(a, b, r, material, around = 14) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, A.distanceTo(B)), seg(6, 3), seg(around, 6)), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return shade(m);
}

/** trace a w × h rectangle with corner radius r, centred on (cx, cy), into a Shape or Path */
export function roundRect(path, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/**
 * A rounded frame facing +z: outer w × h (corner radius r), bars `bar` wide, `depth` deep,
 * with soft bevelled edges. Its back is at z = 0.
 */
export function frameGeo(w, h, r, bar, depth, bevel = 0.012) {
  bevel = Math.min(bevel, bar / 4, depth / 3); // thin bars: a smaller bevel, or the hole outgrows the frame
  const s = roundRect(new THREE.Shape(), w - bevel * 2, h - bevel * 2, Math.max(0.005, r - bevel));
  s.holes.push(roundRect(new THREE.Path(), w - bar * 2 + bevel * 2, h - bar * 2 + bevel * 2, Math.max(0.005, r - bar + bevel)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg(3, 1), curveSegments: seg(10, 4) });
  geo.translate(0, 0, bevel);
  return geo;
}

/**
 * Merge still meshes into one mesh per material: far fewer draw calls for furniture made of
 * many little parts. Each object's own transform (and its children's) is kept; pass objects
 * that are not in the scene yet. Returns a Group (shadows on).
 */
export function bake(...objs) {
  const buckets = new Map();
  objs.flat().forEach((o) => {
    if (!o) return;
    o.updateMatrixWorld(true);
    o.traverse((m) => {
      if (!m.isMesh) return;
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', geo.attributes.position);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      out.setAttribute('normal', geo.attributes.normal);
      out.setAttribute('uv', geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!buckets.has(m.material)) buckets.set(m.material, []);
      buckets.get(m.material).push(out);
    });
  });
  const g = new THREE.Group();
  buckets.forEach((geos, material) => g.add(shade(new THREE.Mesh(mergeGeometries(geos), material))));
  return g;
}

/* ============================================================== the body under a duvet */
/**
 * Height map of everything of the character inside [x0, x1] × [z0, z1] (scene units,
 * after skinning): heights[j * nx + i] = highest point over that cell, or -Infinity.
 */
export function bodyField(root, area, cell = 0.05) {
  const [x0, x1, z0, z1] = area;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const H = new Float32Array(nx * nz).fill(-Infinity);
  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  root.traverse((m) => {
    if (!m.isMesh || !m.visible || !m.geometry || !m.geometry.attributes.position) return;
    let vis = true;
    for (let q = m; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) return;
    const n = m.geometry.attributes.position.count;
    const step = n > 20000 ? 2 : 1;
    for (let i = 0; i < n; i += step) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld);
      if (v.x < x0 || v.x >= x1 || v.z < z0 || v.z >= z1) continue;
      const k = Math.floor((v.z - z0) / cell) * nx + Math.floor((v.x - x0) / cell);
      if (v.y > H[k]) H[k] = v.y;
    }
  });
  return { H, nx, nz, x0, z0, cell };
}

/**
 * A smooth surface that stays above a height map: max filter, then blurs no wider than
 * the max filter (so it never dips below the body), then a broad blur for the soft slopes
 * of a duvet. Returns sample(x, z) -> height (base where nothing is under it).
 */
export function clothOver(field, base, o = {}) {
  const { nx, nz } = field;
  const lift = o.lift ?? 0.05;
  const src = Float32Array.from(field.H, (h) => (h === -Infinity ? base : Math.max(base, h + lift)));
  const maxf = (a, r) => {
    const out = new Float32Array(a.length);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        let m = -Infinity;
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            if (di * di + dj * dj > r * r) continue;
            const ii = clamp(i + di, 0, nx - 1);
            const jj = clamp(j + dj, 0, nz - 1);
            m = Math.max(m, a[jj * nx + ii]);
          }
        out[j * nx + i] = m;
      }
    return out;
  };
  const blur = (a, r) => {
    const t = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += a[j * nx + clamp(i + d, 0, nx - 1)];
        t[j * nx + i] = s / (2 * r + 1);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += t[clamp(j + d, 0, nz - 1) * nx + i];
        out[j * nx + i] = s / (2 * r + 1);
      }
    return out;
  };
  const r = o.r ?? 4;
  const tight = blur(blur(maxf(src, r), r >> 1), r >> 1);
  const wide = o.broad ?? r + 2;
  const broad = blur(blur(tight, wide), wide);
  const F = tight.map((h, k) => Math.max(h, broad[k]));
  const { x0, z0, cell } = field;
  return (x, z) => {
    const fx = clamp((x - x0) / cell - 0.5, 0, nx - 1);
    const fz = clamp((z - z0) / cell - 0.5, 0, nz - 1);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const i2 = Math.min(nx - 1, i + 1);
    const j2 = Math.min(nz - 1, j + 1);
    const a = fx - i;
    const b = fz - j;
    const top = F[j * nx + i] * (1 - a) + F[j * nx + i2] * a;
    const bot = F[j2 * nx + i] * (1 - a) + F[j2 * nx + i2] * a;
    return top * (1 - b) + bot * b;
  };
}

/* ============================================================== textures */
const R = (seed) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const wrap = (t, rx = 1, ry = 1) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
};

/** wood grain: long wavy streaks (map) */
export function woodTex(seed = 2) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = R(seed);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) {
      const y0 = r() * h;
      const amp = 2 + r() * 6;
      const fr = 0.004 + r() * 0.01;
      const ph = r() * 6;
      g.strokeStyle = `rgba(120,70,30,${0.04 + r() * 0.1})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * fr + ph) * amp;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    // a couple of knots
    for (let k = 0; k < 2; k++) {
      const cx = r() * w;
      const cy = r() * h;
      for (let s = 1; s < 5; s++) {
        g.strokeStyle = 'rgba(110,60,25,0.12)';
        g.beginPath();
        g.ellipse(cx, cy, 5 + s * 5, 2 + s * 2, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

/** quilted squares: puffy centres, stitched seams. Use as map and as bumpMap. */
export function quiltTex(n = 4) {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      const s = w / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * s;
          const cy = (j + 0.5) * s;
          const grd = g.createRadialGradient(cx - s * 0.12, cy - s * 0.12, 2, cx, cy, s * 0.72);
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.7, '#eef0f2');
          grd.addColorStop(1, '#c9ccd2');
          g.fillStyle = grd;
          g.fillRect(i * s, j * s, s, s);
        }
      // dashed stitches along the seams
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      for (let k = 0; k <= n; k++) {
        g.beginPath();
        g.moveTo(k * s, 0);
        g.lineTo(k * s, h);
        g.moveTo(0, k * s);
        g.lineTo(w, k * s);
        g.stroke();
      }
    })
  );
}

/** small scattered flowers on a woven ground, a hem band along v = 1 */
export function floralTex() {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.035)';
      for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
      const r = R(9);
      for (let k = 0; k < 14; k++) {
        const x = ((k % 4) + 0.25 + (Math.floor(k / 4) % 2) * 0.5) * (w / 4);
        const y = (Math.floor(k / 4) + 0.5) * (h / 4) + (r() - 0.5) * 10;
        g.fillStyle = 'rgba(255,255,255,0.95)';
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(214,160,60,0.55)';
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    })
  );
}

/** two-tone plaid (tinted by the material colour) */
export function plaidTex() {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fillStyle = 'rgba(120,40,40,0.16)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64 + 18, 0, 22, h);
        g.fillRect(0, i * 64 + 18, w, 22);
      }
      g.fillStyle = 'rgba(110,30,30,0.22)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64 + 52, 0, 4, h);
        g.fillRect(0, i * 64 + 52, w, 4);
      }
      g.fillStyle = 'rgba(0,0,0,0.03)';
      for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
    })
  );
}

/** round rug: rings and a border of little diamonds */
export function rugTex() {
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    const ring = (r, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
    };
    ring(256, '#ffffff');
    ring(232, '#e7d3b5');
    ring(220, '#ffffff');
    ring(160, '#f4ead9');
    ring(120, '#ffffff');
    ring(40, '#ead8bb');
    g.fillStyle = '#d9bf98';
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      g.save();
      g.translate(c + Math.cos(a) * 190, c + Math.sin(a) * 190);
      g.rotate(a);
      g.fillRect(-7, -7, 14, 14);
      g.restore();
    }
    g.fillStyle = 'rgba(0,0,0,0.035)';
    for (let k = 0; k < 4000; k++) g.fillRect(Math.random() * w, Math.random() * w, 1.5, 1.5);
  });
}

/** wicker: over-and-under strands with shading at the crossings. Use as map and bumpMap. */
export function weaveTex() {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      const n = 8;
      const s = w / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          // horizontal strand on top in a checkerboard, vertical stakes between
          const over = (i + j) % 2 === 0;
          const x = i * s;
          const y = j * s;
          const grd = over ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
          grd.addColorStop(0, 'rgba(90,50,20,0.55)');
          grd.addColorStop(0.25, 'rgba(255,255,255,0)');
          grd.addColorStop(0.6, 'rgba(255,255,255,0)');
          grd.addColorStop(1, 'rgba(90,50,20,0.6)');
          g.fillStyle = grd;
          g.fillRect(x, y, s, s);
          g.fillStyle = 'rgba(120,70,30,0.12)';
          for (let k = 0; k < 3; k++) (over ? g.fillRect(x, y + s * (0.3 + k * 0.17), s, 1) : g.fillRect(x + s * (0.3 + k * 0.17), y, 1, s));
        }
    })
  );
}

/** subway seat moquette: a small woven repeat of leaves and dots (tinted by the colour) */
export function moquetteTex() {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      // woven ground
      g.fillStyle = 'rgba(0,0,0,0.07)';
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      g.fillStyle = 'rgba(0,0,0,0.04)';
      for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
      // a half-drop repeat of small leaves and dots
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const x = (i + (j % 2) * 0.5) * (w / 4) + w / 8;
          const y = j * (h / 4) + h / 8;
          g.save();
          g.translate(x % w, y);
          g.rotate(((i + j) % 2 ? 1 : -1) * 0.6);
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.beginPath();
          g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(-7, -0.6, 14, 1.2);
          g.restore();
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.beginPath();
          g.arc((x + w / 8) % w, y + h / 8, 2.6, 0, Math.PI * 2);
          g.fill();
        }
    })
  );
}

/** speckled rubber / terrazzo flecks on a fine noise (tinted by the colour) */
export function speckleTex(seed = 4) {
  return wrap(
    canvasTex(256, 256, (g, w, h) => {
      const r = R(seed);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.5)';
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      for (let k = 0; k < 220; k++) {
        const c = r();
        g.fillStyle = c < 0.45 ? 'rgba(40,40,40,0.35)' : c < 0.8 ? 'rgba(255,255,255,0.95)' : 'rgba(120,150,190,0.6)';
        g.beginPath();
        g.ellipse(r() * w, r() * h, 1 + r() * 2.2, 0.8 + r() * 1.6, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    })
  );
}
