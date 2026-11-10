/* Face decal parts (eyes, brows, nose, mouth, cheeks) — painted onto the 3D head.
 * Face space: viewBox 0 0 400 260 (see CC.FACE for landmarks).
 * Look: soft painted vinyl-toy face — gradients + white glints, no hard outlines.
 * Every design here is original to this project.
 *
 * Conventions in this file
 *   s     outward sign of a pair: -1 for the viewer-left feature (its outer side is -x), +1 for the right one
 *   ids   ctx.id('<cat>-<name>') with prefixes e- (eyes) b- (brows) n- (nose) m- (mouth) c- (cheeks)
 *   light comes from the upper left (key light), so glints are NOT mirrored between the eyes
 */
import { CC } from '../cc.js';

/* =================================================================== helpers */
const N = (v) => Math.round(v * 10) / 10;
const P = (x, y) => `${N(x)} ${N(y)}`;
const WHITE = '#ffffff';

/** point on a bezier of any degree (de Casteljau) */
function bez(pts, t) {
  let p = pts;
  while (p.length > 1) {
    const q = [];
    for (let i = 0; i < p.length - 1; i++) q.push([p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]);
    p = q;
  }
  return p[0];
}

/** closed outline of a variable-width stroke through samples [[x, y, width], ...] with round ends */
function ribbon(sm) {
  const n = sm.length;
  const L = [];
  const R = [];
  for (let i = 0; i < n; i++) {
    const a = sm[Math.max(0, i - 1)];
    const b = sm[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const h = Math.max(0.05, sm[i][2] / 2);
    L.push([sm[i][0] - ty * h, sm[i][1] + tx * h]);
    R.push([sm[i][0] + ty * h, sm[i][1] - tx * h]);
  }
  const re = Math.max(0.05, sm[n - 1][2] / 2);
  const rs = Math.max(0.05, sm[0][2] / 2);
  let d = `M${P(L[0][0], L[0][1])}`;
  for (let i = 1; i < n; i++) d += `L${P(L[i][0], L[i][1])}`;
  d += `A${N(re)} ${N(re)} 0 0 0 ${P(R[n - 1][0], R[n - 1][1])}`;
  for (let i = n - 2; i >= 0; i--) d += `L${P(R[i][0], R[i][1])}`;
  d += `A${N(rs)} ${N(rs)} 0 0 0 ${P(L[0][0], L[0][1])}Z`;
  return d;
}

/** width profile through w0 (start), wm (middle), w1 (end) */
const W3 = (w0, wm, w1) => (t) => Math.max(0.1, w0 + (w1 - w0) * t + (wm - (w0 + w1) / 2) * 4 * t * (1 - t));

/** tapered stroke outline along bezier control points pts (3 = quadratic, 4 = cubic) */
function taper(pts, w0, wm, w1, n = 22) {
  const w = W3(w0, wm, w1);
  const sm = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = bez(pts, t);
    sm.push([x, y, w(t)]);
  }
  return ribbon(sm);
}

/** tapered stroke along chained bezier segments [[p0, c.., p1], [p1, c.., p2], ...] */
function taperChain(segs, w0, wm, w1, n = 18) {
  const w = W3(w0, wm, w1);
  const sm = [];
  const N = segs.length * n;
  segs.forEach((seg, k) => {
    for (let i = k ? 1 : 0; i <= n; i++) {
      const [x, y] = bez(seg, i / n);
      sm.push([x, y, w((k * n + i) / N)]);
    }
  });
  return ribbon(sm);
}

/** tapered stroke along a parametric curve fn(t) -> [x, y] */
function taperFn(fn, w, n = 40) {
  const sm = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = fn(t);
    sm.push([x, y, w(t)]);
  }
  return ribbon(sm);
}

/** ellipse as a path (for clip paths) */
const ellD = (x, y, rx, ry) => `M${P(x - rx, y)}A${N(rx)} ${N(ry)} 0 1 0 ${P(x + rx, y)}A${N(rx)} ${N(ry)} 0 1 0 ${P(x - rx, y)}Z`;

/** concave 4-point sparkle */
const star4 = (x, y, r, k = 0.22) =>
  `M${P(x, y - r)}Q${P(x + r * k, y - r * k)} ${P(x + r, y)}Q${P(x + r * k, y + r * k)} ${P(x, y + r)}` +
  `Q${P(x - r * k, y + r * k)} ${P(x - r, y)}Q${P(x - r * k, y - r * k)} ${P(x, y - r)}Z`;

/** heart centered on (x, y), overall width w */
const heartD = (x, y, w) =>
  `M${P(x, y + w * 0.4)}C${P(x - w * 0.18, y + w * 0.26)} ${P(x - w * 0.52, y + w * 0.06)} ${P(x - w * 0.5, y - w * 0.16)}` +
  `C${P(x - w * 0.48, y - w * 0.42)} ${P(x - w * 0.12, y - w * 0.46)} ${P(x, y - w * 0.2)}` +
  `C${P(x + w * 0.12, y - w * 0.46)} ${P(x + w * 0.48, y - w * 0.42)} ${P(x + w * 0.5, y - w * 0.16)}` +
  `C${P(x + w * 0.52, y + w * 0.06)} ${P(x + w * 0.18, y + w * 0.26)} ${P(x, y + w * 0.4)}Z`;

/** water drop: round bottom of radius r centered on (x, y), tip pointing up */
const dropD = (x, y, r, tip = 2.3) =>
  `M${P(x, y - r * tip)}C${P(x + r * 0.3, y - r * (tip - 0.75))} ${P(x + r, y - r * 0.95)} ${P(x + r, y)}` +
  `A${N(r)} ${N(r)} 0 0 1 ${P(x - r, y)}C${P(x - r, y - r * 0.95)} ${P(x - r * 0.3, y - r * (tip - 0.75))} ${P(x, y - r * tip)}Z`;

/** clip path def + group wrapper */
function clipper(ctx, name, d) {
  const id = ctx.id(name);
  return { def: `<clipPath id="${id}"><path d="${d}"/></clipPath>`, wrap: (inner) => `<g clip-path="url(#${id})">${inner}</g>` };
}

/** run fn for a left/right pair of anchors: fn(x, y, s, side) with s = -1 left, +1 right */
const pair = (a, b, fn) => fn(a.x, a.y, -1, 'L') + fn(b.x, b.y, 1, 'R');
const op = (o) => ({ extra: { opacity: o } });

/* =================================================================== eyes */
/**
 * hue-preserving brighten: mix toward a full-brightness version of the same hue
 * (so dark brown eyes glow amber instead of turning grey like a plain white mix)
 */
function lift(C, hex, t) {
  const rgb = C.hexToRgb(hex);
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1);
  const k = Math.min(255 / m, 4.2);
  const bright = C.mix(C.rgbToHex(rgb.map((v) => v * k)), '#ffffff', 0.22);
  return C.mix(hex, bright, t);
}

/** shared eye colors + gradients for the chosen eye color */
function eyeKit(ctx) {
  const { S, C } = ctx;
  const e = ctx.eye;
  const dark = C.mix(e, '#160c08', 0.8);
  const deep = C.mix(e, '#0b0504', 0.9);
  const iris = S.radial(
    ctx.id('e-iris'),
    [
      [0, lift(C, e, 0.62)],
      [0.42, lift(C, e, 0.2)],
      [0.78, e],
      [1, C.shade(e, 0.38)],
    ],
    { cx: '50%', cy: '82%', r: '82%' }
  );
  const lid = S.linear(ctx.id('e-lid'), [
    [0, dark, 0.9],
    [0.46, dark, 0],
  ]);
  const sclera = S.radial(
    ctx.id('e-sclera'),
    [
      [0, '#ffffff'],
      [0.6, '#fbf8f6'],
      [1, C.mix('#e8e0dc', ctx.skin, 0.25)],
    ],
    { cx: '50%', cy: '62%', r: '62%' }
  );
  const scleraTop = S.linear(ctx.id('e-sctop'), [
    [0, C.mix(ctx.skin, '#5a3a33', 0.45), 0.55],
    [0.4, C.mix(ctx.skin, '#5a3a33', 0.45), 0],
  ]);
  return {
    S,
    C,
    ctx,
    dark,
    deep,
    iris,
    lid,
    sclera,
    scleraTop,
    glow: C.mix(lift(C, e, 1), '#ffffff', 0.38),
    defs: iris.def + lid.def + sclera.def + scleraTop.def,
  };
}

/**
 * glossy painted eye: dark rim, gradient iris, pupil, lid shade, lower glow, glints.
 * o: rim, pupil(false|scale), hl: [[dx, dy, rx, ry, opacity], ...] relative to the center, glow(false)
 */
function glossy(k, x, y, rx, ry, o = {}) {
  const { S } = k;
  const t = o.rim ?? 3.4;
  const irx = rx - t;
  const iry = ry - t * 1.1;
  const iy = y + t * 0.45;
  let s = S.ellipse(x, y, rx, ry, k.dark);
  s += S.ellipse(x, iy, irx, iry, k.iris.url);
  if (o.pupil !== false) {
    const pr = o.pupil || 0.44;
    s += S.ellipse(x, iy + iry * 0.08, irx * pr, iry * pr, k.deep, op(0.92));
  }
  if (o.glow !== false) {
    s += S.path(
      `M${P(x - irx * 0.66, iy + iry * 0.36)}Q${P(x, iy + iry * 1.02)} ${P(x + irx * 0.66, iy + iry * 0.36)}Q${P(x, iy + iry * 0.7)} ${P(x - irx * 0.66, iy + iry * 0.36)}Z`,
      k.glow,
      op(0.42)
    );
  }
  s += S.ellipse(x, iy, irx, iry, k.lid.url);
  const hl = o.hl || [
    [-rx * 0.3, -ry * 0.31, rx * 0.34, ry * 0.3, 1],
    [rx * 0.34, ry * 0.36, rx * 0.15, rx * 0.15, 0.9],
  ];
  hl.forEach(([dx, dy, hx, hy, a]) => (s += S.ellipse(x + dx, y + dy, hx, hy, WHITE, a < 1 ? op(a) : undefined)));
  return s;
}

/** white-eyed (sclera) eye with a round iris; o.ix/o.iy iris offset, o.ir iris radius */
function whiteEye(k, x, y, rx, ry, o = {}) {
  const { S, C, ctx } = k;
  const ir = o.ir ?? rx * 0.62;
  const ix = x + (o.ix || 0);
  const iy = y + (o.iy || 0);
  const c = clipper(ctx, 'e-wclip' + (o.side || ''), ellD(x, y, rx, ry));
  let inner = S.ellipse(x, y, rx, ry, k.sclera.url);
  inner += S.circle(ix, iy, ir, k.iris.url);
  inner += S.circle(ix, iy + ir * 0.06, ir * (o.pr ?? 0.48), k.deep, op(0.92));
  inner += S.path(
    `M${P(ix - ir * 0.62, iy + ir * 0.38)}Q${P(ix, iy + ir * 1.0)} ${P(ix + ir * 0.62, iy + ir * 0.38)}Q${P(ix, iy + ir * 0.7)} ${P(ix - ir * 0.62, iy + ir * 0.38)}Z`,
    k.glow,
    op(0.4)
  );
  inner += S.ellipse(x, y, rx, ry, k.scleraTop.url);
  let s = c.def + c.wrap(inner);
  // soft rim so the white reads on pale skin
  s += S.ellipse(x, y, rx, ry, 'none', { stroke: C.mix(ctx.skin, ctx.featureInk, 0.45), sw: 2.2, extra: { opacity: 0.55 } });
  const hl = o.hl || [
    [-ir * 0.38, -ir * 0.4, ir * 0.36, ir * 0.36, 1],
    [ir * 0.42, ir * 0.4, ir * 0.16, ir * 0.16, 0.9],
  ];
  hl.forEach(([dx, dy, hx, hy, a]) => (s += S.ellipse(ix + dx, iy + dy, hx, hy, WHITE, a < 1 ? op(a) : undefined)));
  return s;
}

/** point on an eye ellipse: deg 180 = inner corner (toward the nose), 90 = top, 0 = outer corner */
const rimPt = (cx, cy, rx, ry, s, deg) => [cx + s * rx * Math.cos((deg * Math.PI) / 180), cy - ry * Math.sin((deg * Math.PI) / 180)];

/** lash line hugging the top of an eye ellipse from deg a0 (inner) to a1 (outer), plus an outward flick */
function lashLine(cx, cy, rx, ry, s, a0, a1, w, flick) {
  let d = taperFn((t) => rimPt(cx, cy, rx, ry, s, a0 + (a1 - a0) * t), W3(w[0], w[1], w[2]), 32);
  if (flick) {
    const e = rimPt(cx, cy, rx, ry, s, a1);
    d += taper([[e[0] - s * 1, e[1] + 0.5], [e[0] + s * flick[0] * 0.55, e[1] - flick[1] * 0.3], [e[0] + s * flick[0], e[1] - flick[1]]], w[2], w[2] * 0.8, 1.6, 12);
  }
  return d;
}

/** closed-eye lid (gentle ∪) */
const closedLid = (ctx, x, y, w = 19, dy = 2, sag = 11, th = 6) =>
  ctx.S.path(taper([[x - w, y + dy], [x, y + dy + sag], [x + w, y + dy]], th * 0.62, th, th * 0.62), ctx.featureInk);
const defaultBlink = (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => closedLid(ctx, x, y));

/** happy ^ arc */
const happyArc = (ctx, x, y, w = 17, h = 13, th = 7) =>
  ctx.S.path(taper([[x - w, y + 7], [x, y + 7 - h * 2], [x + w, y + 7]], th * 0.6, th, th * 0.6), ctx.featureInk);

/** glossy little tear drop */
function tearKit(ctx, name) {
  const { S } = ctx;
  const g = S.radial(ctx.id(name), [[0, '#ffffff'], [0.45, '#dcf3ff'], [1, '#86cbf2']], { cx: '40%', cy: '68%', r: '68%' });
  return { def: g.def, draw: (x, y, r = 4.8) => S.path(dropD(x, y, r, 2.2), g.url) + S.circle(x - r * 0.3, y - r * 0.15, r * 0.3, WHITE) };
}

/** office-worker dark circles: purple-grey crescent + bag crease under each eye */
function underEyes(ctx, name) {
  const { S, C } = ctx;
  const dark = C.isDark(ctx.skin);
  const bag = C.mix(ctx.skin, dark ? '#24162e' : '#5a3d78', dark ? 0.42 : 0.4);
  const g = S.linear(ctx.id(name), [
    [0, bag, 0.95],
    [1, bag, 0],
  ]);
  const crease = C.mix(bag, ctx.featureInk, 0.3);
  return {
    def: g.def,
    draw: (x, y, s) =>
      S.path(`M${P(x - s * 21, y + 9)}C${P(x - s * 16, y + 30)} ${P(x + s * 18, y + 30)} ${P(x + s * 23, y + 9)}C${P(x + s * 12, y + 19)} ${P(x - s * 10, y + 19)} ${P(x - s * 21, y + 9)}Z`, g.url) +
      S.path(taper([[x - s * 13, y + 25], [x + s * 2, y + 30], [x + s * 16, y + 23.5]], 1.8, 3.4, 1.8), crease, op(0.7)),
  };
}

CC.register('eyes', [
  {
    id: 'twinkle',
    name: '반짝 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      return `<defs>${k.defs}</defs>` + pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => glossy(k, x, y, 22, 27));
    },
    blink: defaultBlink,
  },
  {
    id: 'dot',
    name: '콩알 눈',
    render(ctx) {
      const { S, C } = ctx;
      const base = C.mix(ctx.eye, '#160c08', 0.42);
      const g = S.radial(ctx.id('e-dot'), [[0, C.light(base, 0.32)], [0.55, base], [1, C.shade(base, 0.45)]], { cx: '50%', cy: '78%', r: '72%' });
      return (
        `<defs>${g.def}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => S.ellipse(x, y + 4, 11.5, 14, g.url) + S.ellipse(x - 3.6, y - 1.5, 3.9, 4.3, WHITE) + S.circle(x + 4, y + 10, 1.7, WHITE, op(0.8)))
      );
    },
    blink: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => closedLid(ctx, x, y + 2, 11, 2, 6, 5.5)),
  },
  {
    id: 'sparkle',
    name: '별빛 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      return (
        `<defs>${k.defs}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => {
          let s = glossy(k, x, y, 22.5, 27.5, { pupil: 0.36, hl: [] });
          s += S.path(star4(x - 6, y - 7, 11.5), WHITE);
          s += S.path(star4(x + 8.5, y + 10, 5.2), WHITE, op(0.95));
          s += S.circle(x + 8, y - 11, 2.4, WHITE, op(0.9));
          s += S.circle(x - 9, y + 12, 1.8, WHITE, op(0.75));
          return s;
        })
      );
    },
    blink: defaultBlink,
  },
  {
    id: 'bright',
    name: '또랑 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      return (
        `<defs>${k.defs}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
          let o = whiteEye(k, x, y + 2, 20, 23, { ir: 14.5, iy: 2, side });
          // lash line hugging the top of the eye, flicking out at the outer corner
          o += S.path(lashLine(x, y + 2, 20.5, 23.5, s, 158, 18, [2.4, 5.6, 5], [6, 5]), ctx.featureInk);
          return o;
        })
      );
    },
    blink: defaultBlink,
  },
  {
    id: 'lashes',
    name: '속눈썹 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      return (
        `<defs>${k.defs}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => {
          const cy = y + 1;
          let o = glossy(k, x, cy, 21, 26);
          o += S.path(lashLine(x, cy, 21.2, 26.2, s, 150, 14, [2, 5.4, 5.6]), k.dark);
          // three short curled lashes on the outer upper rim
          [
            [56, 8.5],
            [33, 9.5],
            [12, 8.5],
          ].forEach(([deg, len]) => {
            const a = (deg * Math.PI) / 180;
            const p0 = rimPt(x, cy, 21, 26, s, deg);
            const nx = s * Math.cos(a);
            const ny = -Math.sin(a);
            const p1 = [p0[0] + nx * len * 0.6, p0[1] + ny * len * 0.6];
            const p2 = [p0[0] + nx * len + s * 2.5, p0[1] + ny * len - 3.5];
            o += S.path(taper([p0, p1, p2], 4.6, 3.4, 1.6, 12), k.dark);
          });
          return o;
        })
      );
    },
    blink(ctx) {
      const { S } = ctx;
      return pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => {
        let o = closedLid(ctx, x, y + 1);
        [
          [11, 10, 16, 18, 19, 22],
          [17, 6, 23, 12, 28, 14],
        ].forEach(([ax, ay, bx, by, cx, cy]) => {
          o += S.path(taper([[x + s * ax, y + ay], [x + s * bx, y + by], [x + s * cx, y + cy]], 4.6, 3.4, 1.6, 12), ctx.featureInk);
        });
        return o;
      });
    },
  },
  {
    id: 'beam',
    name: '눈웃음',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      const band = S.linear(ctx.id('e-beamg'), [
        [0.25, k.dark],
        [0.62, ctx.C.shade(ctx.eye, 0.12)],
        [1, lift(ctx.C, ctx.eye, 0.6)],
      ]);
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => {
        // smiling crescent: a soft rainbow arch whose tips taper to points; the top of the
        // iris peeks out under the closed, smiling lid
        const b = y + 5; // corners
        const top = [[x - 23, b], [x - 17, y - 24], [x + 17, y - 24], [x + 23, b]];
        const d =
          `M${P(x - 23, b)}C${P(x - 17, y - 24)} ${P(x + 17, y - 24)} ${P(x + 23, b)}` +
          `C${P(x + 12, y - 9)} ${P(x - 12, y - 9)} ${P(x - 23, b)}Z`;
        let o = S.path(d, band.url);
        o += S.path(taper(top, 2.2, 6.6, 2.2, 30), ctx.featureInk);
        o += S.ellipse(x - 7, y - 8.5, 3.6, 2.1, WHITE, { extra: { opacity: 0.95, transform: `rotate(-14 ${N(x - 7)} ${N(y - 8.5)})` } });
        o += S.circle(x + 6.5, y - 9, 1.5, WHITE, op(0.8));
        return o;
      });
      return `<defs>${k.defs}${band.def}</defs>` + out;
    },
    blink: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => happyArc(ctx, x, y + 2)),
  },
  {
    id: 'happy',
    name: '웃는 눈',
    render: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => happyArc(ctx, x, y + 2)),
    blink: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => happyArc(ctx, x, y + 2)),
  },
  {
    id: 'wink',
    name: '윙크',
    render(ctx) {
      const k = eyeKit(ctx);
      const { F, S } = ctx;
      const x = F.eyeR.x;
      const y = F.eyeR.y;
      return (
        `<defs>${k.defs}</defs>` +
        glossy(k, F.eyeL.x, F.eyeL.y, 22, 27) +
        S.path(taper([[x + 17, y - 9], [x - 4, y - 2], [x - 18, y + 3]], 4.2, 7, 4.8), ctx.featureInk) +
        S.path(taper([[x + 17, y + 13], [x - 2, y + 9], [x - 17, y + 4]], 4.2, 6.6, 4.4), ctx.featureInk)
      );
    },
    blink(ctx) {
      const { F, S } = ctx;
      const x = F.eyeR.x;
      const y = F.eyeR.y;
      return (
        closedLid(ctx, F.eyeL.x, F.eyeL.y) +
        S.path(taper([[x + 17, y - 9], [x - 4, y - 2], [x - 18, y + 3]], 4.2, 7, 4.8), ctx.featureInk) +
        S.path(taper([[x + 17, y + 13], [x - 2, y + 9], [x - 17, y + 4]], 4.2, 6.6, 4.4), ctx.featureInk)
      );
    },
  },
  {
    id: 'sleepy',
    name: '졸린 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      let defs = k.defs;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        const ly = y + 1;
        const c = clipper(ctx, 'e-sl' + side, `M${P(x - 34, ly + 3)}Q${P(x, ly - 5)} ${P(x + 34, ly + 3)}L${P(x + 34, y + 50)}L${P(x - 34, y + 50)}Z`);
        defs += c.def;
        let o = c.wrap(glossy(k, x, y + 3, 21, 24, { pupil: 0.46, hl: [[-7, 3.5, 5.2, 3.6, 1], [8, 14, 2.4, 2.4, 0.85]] }));
        o += S.path(taper([[x - 24, ly + 4.5], [x, ly - 4.5], [x + 24, ly + 4.5]], 3.6, 6.4, 3.6), ctx.featureInk);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => closedLid(ctx, x, y + 6, 21, 2, 5, 6)),
  },
  {
    id: 'droopy',
    name: '순한 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      let defs = k.defs;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        // gentle lid: starts on the inner rim, arcs over, then slopes down onto the outer rim
        // (the SAME curve clips the eye and draws the lid line, so they always meet)
        const cy = y + 1;
        const U = (u, v) => [x + s * u, cy + v]; // u: outward from the eye center
        const p0 = rimPt(x, cy, 21, 25, s, 142);
        const top = U(-4, -25.5);
        const p2 = rimPt(x, cy, 21, 25, s, -6);
        const segs = [
          [p0, U(-12.5, -26.5), top],
          [top, U(12, -19), p2],
        ];
        const c = clipper(
          ctx,
          'e-dr' + side,
          `M${P(p0[0] - s * 14, p0[1] - 1)}L${P(...p0)}Q${P(...segs[0][1])} ${P(...top)}Q${P(...segs[1][1])} ${P(...p2)}` +
            `L${P(p2[0] + s * 14, p2[1])}L${P(x + s * 40, y + 50)}L${P(x - s * 40, y + 50)}Z`
        );
        defs += c.def;
        let o = c.wrap(glossy(k, x, cy, 21, 25, { hl: [[-7.5, -8.5, 5.8, 5, 1], [7, 10, 2.8, 2.8, 0.85]] }));
        o += S.path(taperChain(segs, 2.6, 6.2, 3.6), ctx.featureInk);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink: (ctx) =>
      pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => ctx.S.path(taper([[x - s * 19, y + 1], [x + s * 4, y + 13], [x + s * 22, y + 8]], 3.6, 6, 3.6), ctx.featureInk)),
  },
  {
    id: 'cool',
    name: '시크한 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      let defs = k.defs;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        // calm, nearly flat lid over the top third + winged outer corner
        const c = clipper(ctx, 'e-co' + side, `M${P(x - s * 30, y - 8)}Q${P(x, y - 13)} ${P(x + s * 30, y - 12)}L${P(x + s * 40, y + 50)}L${P(x - s * 40, y + 50)}Z`);
        defs += c.def;
        let o = c.wrap(glossy(k, x, y + 4, 20, 22, { pupil: 0.38, hl: [[-7, -2, 4.8, 3.4, 1], [7, 12, 2.2, 2.2, 0.8]] }));
        o += S.path(taper([[x - s * 21, y - 6.5], [x - s * 2, y - 12.5], [x + s * 18, y - 11.5], [x + s * 23, y - 9.5]], 3.6, 6.6, 5.6), ctx.featureInk);
        o += S.path(taper([[x + s * 21, y - 10], [x + s * 27, y - 12.5], [x + s * 31, y - 17]], 5, 3.8, 1.6, 12), ctx.featureInk);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink: (ctx) =>
      pair(
        ctx.F.eyeL,
        ctx.F.eyeR,
        (x, y, s) =>
          ctx.S.path(taper([[x - s * 20, y + 5], [x, y + 11], [x + s * 19, y + 6], [x + s * 24, y + 3]], 3.6, 6.2, 5), ctx.featureInk) +
          ctx.S.path(taper([[x + s * 22, y + 4], [x + s * 27, y + 1], [x + s * 31, y - 4]], 4.6, 3.6, 1.6, 12), ctx.featureInk)
      ),
  },
  {
    id: 'cat',
    name: '고양이 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      return (
        `<defs>${k.defs}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => {
          const ix = x - s * 21;
          const iy = y + 7;
          const ox = x + s * 23;
          const oy = y - 8;
          const almond = (sc) => {
            const cx = x;
            const cy = y;
            const T = (px, py) => P(cx + (px - cx) * sc, cy + (py - cy) * sc);
            return (
              `M${T(ix, iy)}C${T(x - s * 16, y - 20)} ${T(x + s * 12, y - 28)} ${T(ox, oy)}` +
              `C${T(x + s * 18, y + 20)} ${T(x - s * 12, y + 24)} ${T(ix, iy)}Z`
            );
          };
          let o = S.path(almond(1), k.dark);
          o += S.path(almond(0.84), k.iris.url);
          o += S.ellipse(x + s * 1, y + 1, 3.6, 13, k.deep);
          o += S.path(almond(0.84), k.lid.url);
          o += S.ellipse(x - 6.5, y - 6, 4.8, 4.2, WHITE);
          o += S.circle(x + 6, y + 8, 1.9, WHITE, op(0.85));
          o += S.path(taper([[ox - s * 2, oy + 1], [ox + s * 5, oy - 4], [ox + s * 8, oy - 9]], 4, 3, 1.4, 10), k.dark);
          return o;
        })
      );
    },
    blink: (ctx) =>
      pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => ctx.S.path(taper([[x - s * 20, y + 6], [x + s * 2, y + 10], [x + s * 22, y - 2], [x + s * 29, y - 9]], 4, 6.2, 2), ctx.featureInk)),
  },
  {
    id: 'wide',
    name: '깜짝 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      return (
        `<defs>${k.defs}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) =>
          // big whites + a small (but not pin-prick) iris: startled, still friendly
          whiteEye(k, x, y, 21, 26, { ir: 10.2, iy: 2, pr: 0.5, side, hl: [[-3.6, -4, 3.1, 3.1, 1], [3.6, 4.2, 1.4, 1.4, 0.8]] })
        )
      );
    },
    blink: defaultBlink,
  },
  {
    id: 'sideeye',
    name: '눈치 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      let defs = k.defs;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        const ly = y - 6;
        const c = clipper(ctx, 'e-se' + side, `M${P(x - 34, ly + 1)}Q${P(x, ly - 2)} ${P(x + 34, ly + 1)}L${P(x + 34, y + 50)}L${P(x - 34, y + 50)}Z`);
        defs += c.def;
        let o = c.wrap(whiteEye(k, x, y + 1, 21, 19, { ir: 12, ix: 8, iy: 3, side, hl: [[-4.5, -2, 3.4, 2.6, 1], [5, 5, 1.6, 1.6, 0.8]] }));
        o += S.path(taper([[x - 24, ly + 3], [x, ly - 2], [x + 24, ly + 3]], 4, 6.6, 4), ctx.featureInk);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink: (ctx) => pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => closedLid(ctx, x, y + 4, 21, 0, 4, 6)),
  },
  {
    id: 'tired',
    name: '다크서클 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S } = ctx;
      const u = underEyes(ctx, 'e-bag');
      let defs = k.defs + u.def;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        const ly = y + 1;
        let o = u.draw(x, y, s);
        const c = clipper(ctx, 'e-ti' + side, `M${P(x - s * 34, ly - 4)}Q${P(x, ly - 6)} ${P(x + s * 34, ly + 5)}L${P(x + s * 34, y + 50)}L${P(x - s * 34, y + 50)}Z`);
        defs += c.def;
        o += c.wrap(glossy(k, x, y + 2, 19, 20, { pupil: 0.3, glow: false, hl: [[-6, 3.5, 3.2, 2.4, 0.9]] }));
        o += S.path(taper([[x - s * 22, ly - 4.5], [x, ly - 6.5], [x + s * 23, ly + 4.5]], 4, 6.4, 3.4), ctx.featureInk);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink(ctx) {
      const u = underEyes(ctx, 'e-bagb');
      return (
        `<defs>${u.def}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => u.draw(x, y, s) + ctx.S.path(taper([[x - s * 21, y + 6], [x, y + 11], [x + s * 22, y + 9]], 3.6, 6, 3.6), ctx.featureInk))
      );
    },
  },
  {
    id: 'heart',
    name: '하트 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S, C } = ctx;
      const pink = C.mix('#ff4f86', ctx.eye, 0.12);
      const hg = S.radial(ctx.id('e-heart'), [[0, C.light(pink, 0.45)], [0.6, pink], [1, C.shade(pink, 0.25)]], { cx: '45%', cy: '70%', r: '70%' });
      return (
        `<defs>${k.defs}${hg.def}</defs>` +
        pair(ctx.F.eyeL, ctx.F.eyeR, (x, y) => {
          let o = glossy(k, x, y, 22, 27, { pupil: false, hl: [] });
          o += S.path(heartD(x, y + 3.5, 29), hg.url);
          o += S.ellipse(x - 6.5, y - 4, 4.2, 3, WHITE, { extra: { transform: `rotate(-30 ${N(x - 6.5)} ${N(y - 4)})` } });
          o += S.circle(x + 7, y - 13, 2.6, WHITE, op(0.9));
          return o;
        })
      );
    },
    blink: defaultBlink,
  },
  {
    id: 'swirl',
    name: '빙글빙글',
    render(ctx) {
      const { S, C } = ctx;
      const ink = C.mix(ctx.eye, ctx.featureInk, 0.55);
      const spiral = (x, y, dir) =>
        taperFn(
          (t) => {
            const a = t * Math.PI * 2 * 2.25 * dir - Math.PI / 2;
            const r = 2 + t * 17;
            return [x + Math.cos(a) * r, y + 3 + Math.sin(a) * r * 1.08];
          },
          (t) => 3.4 + t * 1.6,
          64
        );
      return pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => S.path(spiral(x, y, -s), ink));
    },
    blink(ctx) {
      return this.render(ctx);
    },
  },
  {
    id: 'teary',
    name: '글썽 눈',
    render(ctx) {
      const k = eyeKit(ctx);
      const { S, C } = ctx;
      const wc = C.mix(lift(C, ctx.eye, 0.9), '#d8f2ff', 0.55);
      // water softly fills the lower iris (no hard line across the eye)
      const water = S.linear(ctx.id('e-water'), [[0, wc, 0], [0.32, wc, 0.32], [1, wc, 0.72]]);
      const pool = S.linear(ctx.id('e-pool'), [[0, '#ffffff', 0.95], [1, '#8fd0f4', 0.95]]);
      const t = tearKit(ctx, 'e-tear');
      let defs = k.defs + water.def + pool.def + t.def;
      const out = pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s, side) => {
        const c = clipper(ctx, 'e-te' + side, ellD(x, y + 1.6, 19.6, 24.3));
        defs += c.def;
        let o = glossy(k, x, y, 23, 28, { pupil: 0.36, glow: false, hl: [] });
        o += c.wrap(
          S.rect(x - 26, y - 4, 52, 40, 0, water.url) +
            // little glints wobbling on the water surface
            S.ellipse(x - 7, y + 8.5, 6.4, 2.1, WHITE, op(0.85)) +
            S.ellipse(x + 6.5, y + 10.5, 4, 1.6, WHITE, op(0.75)) +
            S.ellipse(x + 0.5, y + 19, 7.5, 2.6, WHITE, op(0.5))
        );
        // big wet glints
        o += S.ellipse(x - 7.5, y - 10, 7.4, 6.6, WHITE);
        o += S.circle(x + 8.5, y - 10, 3, WHITE);
        o += S.path(star4(x + 9.5, y + 2, 4.2), WHITE, op(0.9));
        // tear welling along the lower lid, spilling into a drop at the outer corner
        o += S.path(`M${P(x - 18, y + 19)}Q${P(x, y + 43)} ${P(x + 18, y + 19)}Q${P(x, y + 35)} ${P(x - 18, y + 19)}Z`, pool.url);
        o += S.path(taper([[x - 10, y + 27.5], [x - 3, y + 29.5], [x + 4, y + 29.5]], 1.4, 2.2, 1.4, 10), WHITE, op(0.9));
        o += t.draw(x + s * 20, y + 27, 4.6);
        return o;
      });
      return `<defs>${defs}</defs>` + out;
    },
    blink(ctx) {
      const t = tearKit(ctx, 'e-tearb');
      return `<defs>${t.def}</defs>` + pair(ctx.F.eyeL, ctx.F.eyeR, (x, y, s) => closedLid(ctx, x, y) + t.draw(x + s * 21, y + 22));
    },
  },
]);

/* =================================================================== brows */
function browPaint(ctx) {
  const { S, C } = ctx;
  const g = S.linear(ctx.id('b-fill'), [
    [0, C.light(ctx.browColor, 0.14)],
    [1, C.shade(ctx.browColor, 0.12)],
  ]);
  return { def: g.def, fill: g.url };
}
/** register a symmetric tapered brow: shape(x, y, s) -> [points, wOuter, wMid, wInner] (points from outer to inner) */
function brow(id, name, shape) {
  return {
    id,
    name,
    render(ctx) {
      const b = browPaint(ctx);
      return (
        `<defs>${b.def}</defs>` +
        pair(ctx.F.browL, ctx.F.browR, (x, y, s, side) => {
          const [pts, w0, wm, w1] = shape(x, y, s, side);
          return ctx.S.path(taper(pts, w0, wm, w1), b.fill);
        })
      );
    },
  };
}

CC.register('brows', [
  brow('soft', '부드러운 눈썹', (x, y, s) => [[[x + s * 18, y + 5], [x - s * 1, y - 8], [x - s * 17, y + 1]], 4.6, 8, 7.6]),
  brow('straight', '일자 눈썹', (x, y, s) => [[[x + s * 18, y + 2.5], [x, y - 0.5], [x - s * 17, y + 1]], 5.6, 7.6, 8]),
  brow('bold', '진한 눈썹', (x, y, s) => [[[x + s * 19, y + 5], [x - s * 1, y - 7], [x - s * 17, y + 1]], 8, 12.5, 12.5]),
  brow('thin', '가는 눈썹', (x, y, s) => [[[x + s * 20, y + 6], [x + s * 2, y - 10], [x - s * 16, y + 1]], 2.8, 4.6, 4.2]),
  brow('worried', '걱정 눈썹', (x, y, s) => [[[x + s * 18, y + 6], [x - s * 2, y + 2], [x - s * 16, y - 8]], 4.6, 7.6, 7.6]),
  brow('fierce', '결연 눈썹', (x, y, s) => [[[x + s * 19, y - 5], [x + s * 1, y - 1], [x - s * 15, y + 8]], 5.2, 9, 10]),
  {
    id: 'dots',
    name: '동글 눈썹',
    render(ctx) {
      const b = browPaint(ctx);
      return (
        `<defs>${b.def}</defs>` +
        pair(ctx.F.browL, ctx.F.browR, (x, y, s) =>
          ctx.S.ellipse(x - s * 5, y + 1, 10.5, 7.2, b.fill, { extra: { transform: `rotate(${s * -12} ${N(x - s * 5)} ${N(y + 1)})` } })
        )
      );
    },
  },
  brow('raised', '깜짝 눈썹', (x, y, s) => [[[x + s * 18, y - 1], [x, y - 22], [x - s * 17, y - 5]], 4.4, 7.4, 7]),
  brow('wavy', '물결 눈썹', (x, y, s) => [[[x + s * 20, y + 3], [x + s * 8, y - 10], [x - s * 5, y + 9], [x - s * 18, y - 3]], 4.4, 7.2, 6.8]),
  {
    id: 'quirky',
    name: '갸우뚱 눈썹',
    render(ctx) {
      const b = browPaint(ctx);
      const { F, S } = ctx;
      const L = F.browL;
      const R = F.browR;
      return (
        `<defs>${b.def}</defs>` +
        S.path(taper([[L.x - 18, L.y - 1], [L.x, L.y - 22], [L.x + 17, L.y - 6]], 4.4, 7.6, 7.2), b.fill) +
        S.path(taper([[R.x + 19, R.y + 1], [R.x + 1, R.y + 3], [R.x - 16, R.y + 7]], 5.2, 7.8, 8.2), b.fill)
      );
    },
  },
  {
    id: 'fluffy',
    name: '보송 눈썹',
    render(ctx) {
      const b = browPaint(ctx);
      const { S } = ctx;
      return (
        `<defs>${b.def}</defs>` +
        pair(ctx.F.browL, ctx.F.browR, (x, y, s) => {
          // one soft cloud-edged shape: three bumps along the top, gently curved base
          const sw = (1 - s) / 2;
          const X = (dx) => x + s * dx;
          const d =
            `M${P(X(17), y + 4)}` +
            `A5 5 0 0 ${sw} ${P(X(10), y - 2.5)}` +
            `A6.4 6.4 0 0 ${sw} ${P(X(-1), y - 5.5)}` +
            `A6.8 6.8 0 0 ${sw} ${P(X(-13), y - 1)}` +
            `A5.2 5.2 0 0 ${sw} ${P(X(-15), y + 7.5)}` +
            `Q${P(X(0), y + 10)} ${P(X(17), y + 4)}Z`;
          return S.path(d, b.fill);
        })
      );
    },
  },
]);

/* =================================================================== nose */
const noseShade = (ctx, t = 0.3) => ctx.C.mix(ctx.skin, ctx.featureInk, t);
/** warm rosy-brown shade of the skin for painted noses (a plain INK mix turns pale skin grey) */
function noseTone(ctx, t = 0.3) {
  const { C } = ctx;
  const w = Math.max(0, Math.min(1, (C.luminance(ctx.skin) - 0.3) / 0.45));
  return C.mix(C.shade(ctx.skin, t), C.mix(ctx.skin, '#b65a45', t * 1.25), w);
}

CC.register('nose', [
  {
    id: 'bean',
    name: '콩 코',
    render(ctx) {
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      const base = noseTone(ctx, 0.3);
      const g = S.radial(ctx.id('n-bean'), [[0, C.mix(base, ctx.skin, 0.45)], [0.6, base], [1, C.shade(base, 0.15)]], { cx: '42%', cy: '30%', r: '75%' });
      const face = `<defs>${g.def}</defs>` + S.ellipse(x, y, 9, 6, g.url, op(0.92)) + S.ellipse(x - 2.8, y - 2.2, 3, 1.7, WHITE, op(0.6));
      return face;
    },
  },
  {
    id: 'dot',
    name: '점 코',
    render(ctx) {
      const { S, F } = ctx;
      const { x, y } = F.nose;
      const face = S.ellipse(x, y + 1, 4.8, 3.8, noseShade(ctx, 0.55)) + S.circle(x - 1.5, y - 0.2, 1.4, WHITE, op(0.55));
      return face;
    },
  },
  {
    id: 'curve',
    name: '선 코',
    render(ctx) {
      const { S, F } = ctx;
      const { x, y } = F.nose;
      const pts = [[1, -11], [9, -3], [8, 5], [-3, 4]];
      const face = S.path(taper(pts.map(([a, b]) => [x + a, y + b]), 2, 4.6, 3.6), noseShade(ctx, 0.5));
      return face;
    },
  },
  {
    id: 'button',
    name: '단추 코',
    render(ctx) {
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      // small, perfectly round, slightly rosy ball (vs. the taller sculpted 'bump')
      const tint = C.mix(ctx.skin, ctx.blush, 0.32);
      const g = S.radial(ctx.id('n-btn'), [[0, C.light(tint, 0.34)], [0.5, tint], [1, C.shade(tint, 0.26)]], { cx: '36%', cy: '30%', r: '78%' });
      const sh = S.radial(ctx.id('n-btnsh'), [[0, C.shade(ctx.skin, 0.5), 0.55], [1, C.shade(ctx.skin, 0.5), 0]]);
      const face =
        `<defs>${g.def}${sh.def}</defs>` +
        S.ellipse(x + 1.5, y + 6.5, 12, 5.5, sh.url) +
        S.circle(x, y, 9.5, g.url) +
        S.ellipse(x - 3.4, y - 3.6, 3.2, 2.3, WHITE, op(0.8)) +
        S.circle(x + 3.6, y + 3.4, 1.1, WHITE, op(0.55));
      return face;
    },
  },
  {
    id: 'rosy',
    name: '딸기 코',
    render(ctx) {
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      const red = C.mix('#ff6b6b', ctx.skin, 0.18);
      const g = S.radial(ctx.id('n-rosy'), [[0, C.light(red, 0.4)], [0.6, red], [1, C.shade(red, 0.22)]], { cx: '38%', cy: '32%', r: '75%' });
      const sh = S.radial(ctx.id('n-rosysh'), [[0, C.shade(ctx.skin, 0.5), 0.45], [1, C.shade(ctx.skin, 0.5), 0]]);
      const face =
        `<defs>${g.def}${sh.def}</defs>` +
        S.ellipse(x + 1.5, y + 6.5, 13, 6, sh.url) +
        S.circle(x, y, 10.5, g.url) +
        S.ellipse(x - 3.6, y - 4, 3.6, 2.6, WHITE, op(0.85)) +
        S.circle(x + 4.5, y + 3.5, 1.3, WHITE, op(0.6));
      return face;
    },
  },
  {
    id: 'nostril',
    name: '콧구멍 코',
    render(ctx) {
      const { S, F } = ctx;
      const { x, y } = F.nose;
      const c = noseShade(ctx, 0.62);
      const face =
        S.path(`M${P(x - 9, y - 2)}Q${P(x, y - 9)} ${P(x + 9, y - 2)}`, 'none', { stroke: noseShade(ctx, 0.25), sw: 3.4, extra: { opacity: 0.6, fill: 'none' } }) +
        S.ellipse(x - 5.2, y + 2, 2.8, 3.7, c, { extra: { transform: `rotate(18 ${N(x - 5.2)} ${N(y + 2)})` } }) +
        S.ellipse(x + 5.2, y + 2, 2.8, 3.7, c, { extra: { transform: `rotate(-18 ${N(x + 5.2)} ${N(y + 2)})` } });
      return face;
    },
  },
  {
    id: 'bump',
    name: '오똑 코',
    render(ctx) {
      // sculpted nose: a short bridge running down into a rounded tip.
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      const sk = ctx.skin;
      const sh = S.radial(ctx.id('n-bumpsh'), [[0, C.shade(sk, 0.5), 0.75], [0.6, C.shade(sk, 0.5), 0.3], [1, C.shade(sk, 0.5), 0]]);
      const side = S.radial(ctx.id('n-bumpside'), [[0, C.shade(sk, 0.36), 0.6], [1, C.shade(sk, 0.36), 0]]);
      const ridge = S.radial(ctx.id('n-bumpridge'), [[0, C.light(sk, 0.5), 0.75], [1, C.light(sk, 0.5), 0]]);
      // the drop fades in from the top so the bridge melts into the face
      const g = S.linear(ctx.id('n-bump2d'), [[0.02, C.light(sk, 0.22), 0], [0.42, C.light(sk, 0.22), 0.95], [0.74, sk, 1], [1, C.shade(sk, 0.28), 1]]);
      const gl = S.radial(ctx.id('n-bumpgl'), [[0, C.light(sk, 0.45), 0.9], [1, C.light(sk, 0.45), 0]]);
      const face =
        `<defs>${sh.def}${side.def}${ridge.def}${g.def}${gl.def}</defs>` +
        S.ellipse(x + 1, y + 6.5, 12.5, 6, sh.url) +
        // bridge: soft shade on the side away from the light + a soft lit ridge
        S.ellipse(x + 5, y - 6, 5, 10, side.url) +
        S.path(dropD(x, y + 1, 9.5, 2.05), g.url) +
        S.ellipse(x - 2.5, y - 1, 6, 5, gl.url) +
        S.ellipse(x - 1.6, y - 8, 2.6, 7, ridge.url) +
        S.ellipse(x - 3.4, y - 1.8, 3.2, 2.1, WHITE, op(0.65));
      return face;
    },
  },
  {
    id: 'freckle',
    name: '주근깨 코',
    render(ctx) {
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      const fc = C.mix(ctx.skin, '#8a4a2a', C.isDark(ctx.skin) ? 0.4 : 0.48);
      const base = noseTone(ctx, 0.28);
      let o = S.ellipse(x, y + 1, 6.6, 4.6, base, op(0.9)) + S.ellipse(x - 2, y - 0.6, 2.2, 1.3, WHITE, op(0.55));
      [
        [13, -5, 2.1],
        [20, -1, 1.8],
        [15, 3, 1.6],
        [25, -6, 1.6],
      ].forEach(([dx, dy, r]) => (o += S.circle(x - dx, y + dy, r, fc, op(0.85)) + S.circle(x + dx + 0.6, y + dy - 0.5, r, fc, op(0.85))));
      return o;
    },
  },
  {
    id: 'triangle',
    name: '세모 코',
    render(ctx) {
      const { S, C, F } = ctx;
      const { x, y } = F.nose;
      const base = noseTone(ctx, 0.3);
      const g = S.linear(ctx.id('n-tri'), [[0, C.mix(base, ctx.skin, 0.4)], [1, base]]);
      const d = `M${P(x - 9, y - 4)}Q${P(x, y - 6.5)} ${P(x + 9, y - 4)}Q${P(x + 11, y - 2.5)} ${P(x + 8.5, y + 0.5)}L${P(x + 2.2, y + 6)}Q${P(x, y + 7.8)} ${P(x - 2.2, y + 6)}L${P(x - 8.5, y + 0.5)}Q${P(x - 11, y - 2.5)} ${P(x - 9, y - 4)}Z`;
      const face = `<defs>${g.def}</defs>` + S.path(d, g.url, op(0.92)) + S.ellipse(x - 3.2, y - 2.6, 2.8, 1.4, WHITE, op(0.55));
      return face;
    },
  },
  { id: 'none', name: '없음', render: () => '' },
]);

/* =================================================================== mouth */
function mouthKit(ctx) {
  const { S, C } = ctx;
  const inside = S.linear(ctx.id('m-in'), [
    [0, C.mix(ctx.mouthRed, '#1e0806', 0.62)],
    [1, C.mix(ctx.mouthRed, '#1e0806', 0.25)],
  ]);
  const tongueC = C.mix('#ff8794', ctx.skin, 0.12);
  const tongue = S.radial(ctx.id('m-tongue'), [[0, C.light(tongueC, 0.3)], [0.65, tongueC], [1, C.shade(tongueC, 0.18)]], { cx: '45%', cy: '35%', r: '70%' });
  const teeth = S.linear(ctx.id('m-teeth'), [
    [0, '#ffffff'],
    [1, '#f1e8e2'],
  ]);
  return { S, C, inside, tongue, tongueC, teeth, defs: inside.def + tongue.def + teeth.def, ink: ctx.featureInk };
}

CC.register('mouth', [
  {
    id: 'smile',
    name: '방긋',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      return ctx.S.path(taper([[x - 16, y - 4], [x, y + 11], [x + 16, y - 4]], 3.8, 6, 3.8), ctx.featureInk);
    },
  },
  {
    id: 'laugh',
    name: '활짝',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S } = ctx;
      const { x, y } = ctx.F.mouth;
      // open "D" smile with softly rounded upper corners
      const d =
        `M${P(x - 21, y - 8)}Q${P(x, y - 3)} ${P(x + 21, y - 8)}C${P(x + 25.5, y - 8.8)} ${P(x + 26.5, y - 3.5)} ${P(x + 24, y + 2)}` +
        `C${P(x + 19.5, y + 19.5)} ${P(x + 9, y + 25.5)} ${P(x, y + 25.5)}C${P(x - 9, y + 25.5)} ${P(x - 19.5, y + 19.5)} ${P(x - 24, y + 2)}` +
        `C${P(x - 26.5, y - 3.5)} ${P(x - 25.5, y - 8.8)} ${P(x - 21, y - 8)}Z`;
      const c = clipper(ctx, 'm-laugh', d);
      return (
        `<defs>${k.defs}${c.def}</defs>` +
        S.path(d, k.inside.url) +
        c.wrap(
          S.ellipse(x + 1, y + 25, 17, 12.5, k.tongue.url) +
            S.path(`M${P(x - 27, y - 10)}Q${P(x, y - 4)} ${P(x + 27, y - 10)}L${P(x + 27, y - 1.5)}Q${P(x, y + 3.5)} ${P(x - 27, y - 1.5)}Z`, k.teeth.url)
        ) +
        S.path(taper([[x - 22, y - 7.8], [x, y - 3.2], [x + 22, y - 7.8]], 2.6, 3.4, 2.6), k.ink) +
        S.ellipse(x - 6.5, y + 19.5, 3.8, 2, WHITE, op(0.45))
      );
    },
  },
  {
    id: 'cat',
    name: '냥 입',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      const S = ctx.S;
      return (
        S.path(taper([[x - 16, y - 5], [x - 9, y + 9], [x, y - 1]], 3.8, 5.6, 4), ctx.featureInk) +
        S.path(taper([[x, y - 1], [x + 9, y + 9], [x + 16, y - 5]], 4, 5.6, 3.8), ctx.featureInk)
      );
    },
  },
  {
    id: 'o',
    name: '오 입',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S, C } = ctx;
      const { x, y } = ctx.F.mouth;
      const lip = S.radial(ctx.id('m-olip'), [[0, C.light(ctx.mouthRed, 0.2)], [1, ctx.mouthRed]], { cx: '40%', cy: '35%', r: '70%' });
      return (
        `<defs>${k.defs}${lip.def}</defs>` +
        S.ellipse(x, y + 3, 10.5, 11.5, lip.url) +
        S.ellipse(x, y + 3.8, 5.6, 6.4, k.inside.url) +
        S.ellipse(x - 3.8, y - 2.6, 2.8, 1.7, WHITE, op(0.6))
      );
    },
  },
  {
    id: 'flat',
    name: '무표정',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      return ctx.S.path(taper([[x - 14, y + 1], [x, y + 1.5], [x + 14, y + 1]], 4.4, 5.6, 4.4), ctx.featureInk);
    },
  },
  {
    id: 'grin',
    name: '이 드러낸 웃음',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S, C } = ctx;
      const { x, y } = ctx.F.mouth;
      const d = `M${P(x - 27, y - 8)}Q${P(x, y - 1)} ${P(x + 27, y - 8)}Q${P(x + 22, y + 19)} ${P(x, y + 19)}Q${P(x - 22, y + 19)} ${P(x - 27, y - 8)}Z`;
      const c = clipper(ctx, 'm-grin', d);
      return (
        `<defs>${k.defs}${c.def}</defs>` +
        S.path(d, k.inside.url) +
        c.wrap(
          // upper + lower rows of teeth, a dark smile-shaped gap between them
          S.path(`M${P(x - 29, y - 10)}Q${P(x, y - 3)} ${P(x + 29, y - 10)}L${P(x + 29, y + 2)}Q${P(x, y + 8.5)} ${P(x - 29, y + 2)}Z`, k.teeth.url) +
            S.path(`M${P(x - 29, y + 12.5)}Q${P(x, y + 17)} ${P(x + 29, y + 12.5)}L${P(x + 29, y + 32)}L${P(x - 29, y + 32)}Z`, k.teeth.url)
        ) +
        S.path(d, 'none', { stroke: C.mix(k.ink, ctx.skin, 0.2), sw: 2, extra: { opacity: 0.75 } }) +
        S.path(taper([[x - 27.5, y - 8.5], [x, y - 1.5], [x + 27.5, y - 8.5]], 4, 3.2, 4), k.ink) +
        S.ellipse(x - 10, y - 0.5, 5, 1.6, WHITE, op(0.8))
      );
    },
  },
  {
    id: 'smirk',
    name: '씨익',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      const S = ctx.S;
      return (
        S.path(taper([[x - 14, y + 1], [x - 2, y + 10], [x + 12, y + 4], [x + 17, y - 6]], 3.6, 6, 4.6), ctx.featureInk) +
        S.path(taper([[x + 21, y - 9], [x + 23.5, y - 5], [x + 22, y - 1]], 2.6, 3.4, 2.2, 10), ctx.featureInk, op(0.8))
      );
    },
  },
  {
    id: 'tongue',
    name: '메롱',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S, C } = ctx;
      const { x, y } = ctx.F.mouth;
      const tx = x + 4;
      const td = `M${P(tx - 9, y + 1)}L${P(tx - 9, y + 10)}Q${P(tx - 9, y + 20)} ${P(tx, y + 20)}Q${P(tx + 9, y + 20)} ${P(tx + 9, y + 10)}L${P(tx + 9, y + 1)}Z`;
      return (
        `<defs>${k.defs}</defs>` +
        S.path(td, k.tongue.url) +
        S.path(taper([[tx, y + 5], [tx + 0.4, y + 10], [tx, y + 14]], 2.6, 2.4, 1.2, 8), C.shade(k.tongueC, 0.3), op(0.6)) +
        S.ellipse(tx - 4.4, y + 12, 2, 3, WHITE, op(0.5)) +
        S.path(taper([[x - 17, y - 5], [x, y + 8], [x + 17, y - 5]], 3.8, 5.6, 3.8), ctx.featureInk)
      );
    },
  },
  {
    id: 'surprised',
    name: '깜짝 입',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S } = ctx;
      const { x, y } = ctx.F.mouth;
      const c = clipper(ctx, 'm-surp', ellD(x, y + 6, 11, 14));
      return (
        `<defs>${k.defs}${c.def}</defs>` +
        S.ellipse(x, y + 6, 11, 14, k.inside.url) +
        c.wrap(S.ellipse(x + 1, y + 21, 10, 8, k.tongue.url)) +
        S.ellipse(x, y + 6, 11, 14, 'none', { stroke: k.ink, sw: 2.6, extra: { opacity: 0.55 } }) +
        S.ellipse(x - 4.5, y - 1.5, 2.6, 1.6, WHITE, op(0.45))
      );
    },
  },
  {
    id: 'pout',
    name: '쭉 내민 입',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      const { S, C } = ctx;
      // kissy "3": the line plus a hint of rosy lip color inside each lobe
      const lip = C.mix(ctx.mouthRed, '#ff8a9a', 0.3);
      return (
        S.ellipse(x + 3.4, y - 3.2, 3.8, 3.4, lip, op(0.55)) +
        S.ellipse(x + 3.4, y + 9.2, 3.8, 3.4, lip, op(0.55)) +
        S.path(
          taper([[x - 5, y - 8], [x + 9, y - 10], [x + 8, y + 2.5], [x - 1, y + 3]], 3.4, 5.4, 4) + taper([[x - 1, y + 3], [x + 9, y + 3.5], [x + 9, y + 15], [x - 5, y + 14]], 4, 5.4, 3.4),
          ctx.featureInk
        )
      );
    },
  },
  {
    id: 'wobbly',
    name: '불안 입',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      return ctx.S.path(
        taperFn(
          (t) => [x - 20 + t * 40, y + 2 + Math.sin(t * Math.PI * 4) * 4],
          (t) => 3.6 + Math.sin(t * Math.PI) * 1.4,
          56
        ),
        ctx.featureInk
      );
    },
  },
  {
    id: 'drool',
    name: '쿨쿨 침',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S } = ctx;
      const { x, y } = ctx.F.mouth;
      const drop = S.radial(ctx.id('m-drop'), [[0, '#ffffff'], [0.5, '#e3f5ff'], [1, '#9fd6f5']], { cx: '40%', cy: '65%', r: '65%' });
      const d = `M${P(x - 9, y - 1)}Q${P(x, y - 4)} ${P(x + 9, y - 1)}Q${P(x + 8, y + 9)} ${P(x, y + 9)}Q${P(x - 8, y + 9)} ${P(x - 9, y - 1)}Z`;
      const c = clipper(ctx, 'm-drool', d);
      return (
        `<defs>${k.defs}${drop.def}${c.def}</defs>` +
        S.path(d, k.inside.url) +
        c.wrap(S.ellipse(x, y + 9, 7, 4.5, k.tongue.url)) +
        S.path(taper([[x - 9.5, y - 1], [x, y - 4.2], [x + 9.5, y - 1]], 3.2, 3, 3.2), k.ink) +
        S.path(dropD(x + 9, y + 12.5, 3.7, 2.5), drop.url) +
        S.circle(x + 7.9, y + 11.9, 1.2, WHITE)
      );
    },
  },
  {
    id: 'bucktooth',
    name: '앞니 입',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S, C } = ctx;
      const { x, y } = ctx.F.mouth;
      const rim = C.mix(ctx.skin, ctx.featureInk, 0.42);
      const tooth = (tx) => S.rect(tx - 4.6, y - 1, 9.2, 11, 3.2, k.teeth.url, { stroke: rim, sw: 1.8 });
      return (
        `<defs>${k.defs}</defs>` +
        tooth(x - 4.8) +
        tooth(x + 4.8) +
        S.path(taper([[x - 18, y - 6], [x, y + 6], [x + 18, y - 6]], 3.8, 5.6, 3.8), ctx.featureInk)
      );
    },
  },
  {
    id: 'fang',
    name: '덧니',
    render(ctx) {
      const k = mouthKit(ctx);
      const { S, C } = ctx;
      const { x, y } = ctx.F.mouth;
      const rim = C.mix(ctx.skin, ctx.featureInk, 0.5);
      // one little pointed tooth peeking out under a happy smile; its top follows the
      // smile line so no corner pokes out above it
      const smile = [[x - 17, y - 4], [x, y + 11], [x + 17, y - 4]];
      const lineAt = (px) => bez(smile, (px - (x - 17)) / 34);
      const a = lineAt(x + 1.5);
      const b = lineAt(x + 14);
      const tip = [x + 7.4, (a[1] + b[1]) / 2 + 12.5];
      const tooth =
        `M${P(a[0], a[1] - 1)}Q${P(a[0] + 0.6, tip[1] - 3.5)} ${P(tip[0], tip[1])}Q${P(b[0] - 0.4, tip[1] - 4)} ${P(b[0], b[1] - 1)}Z`;
      return (
        `<defs>${k.defs}</defs>` +
        S.path(tooth, k.teeth.url, { stroke: rim, sw: 1.7 }) +
        S.path(taper(smile, 3.8, 6, 3.8), ctx.featureInk)
      );
    },
  },
  {
    id: 'frown',
    name: '시무룩',
    render(ctx) {
      const { x, y } = ctx.F.mouth;
      return ctx.S.path(taper([[x - 13, y + 8], [x, y - 4], [x + 13, y + 8]], 3.8, 5.8, 3.8), ctx.featureInk);
    },
  },
]);

/* =================================================================== cheeks */
/** blush that still reads on the deepest skin tones (ctx.blush is a fixed 42% mix) */
function blushOf(ctx) {
  const { C } = ctx;
  const L = C.luminance(ctx.skin);
  return C.mix(ctx.skin, '#ff7383', 0.42 + Math.max(0, Math.min(0.16, (0.5 - L) * 0.6)));
}
const deepSkin = (ctx) => ctx.C.luminance(ctx.skin) < 0.4;

function blushGrad(ctx, name, color, a = 0.85) {
  return ctx.S.radial(ctx.id(name), [
    [0, color, a],
    [0.55, color, a * 0.55],
    [1, color, 0],
  ]);
}

CC.register('cheeks', [
  {
    id: 'rosy',
    name: '발그레',
    render(ctx) {
      const g = blushGrad(ctx, 'c-rosy', blushOf(ctx));
      return `<defs>${g.def}</defs>` + pair(ctx.F.cheekL, ctx.F.cheekR, (x, y) => ctx.S.ellipse(x, y, 28, 17, g.url));
    },
  },
  {
    id: 'peach',
    name: '반질 볼',
    render(ctx) {
      const { S, C } = ctx;
      const col = C.mix(blushOf(ctx), '#ff8f78', 0.35);
      const g = blushGrad(ctx, 'c-peach', col, 0.7);
      const core = S.radial(ctx.id('c-peach2'), [[0, col, 0.55], [0.6, col, 0.32], [1, col, 0]]);
      return (
        `<defs>${g.def}${core.def}</defs>` +
        pair(ctx.F.cheekL, ctx.F.cheekR, (x, y) =>
          S.ellipse(x, y + 2, 34, 22, g.url) +
          S.ellipse(x, y + 1, 20, 14, core.url) +
          S.ellipse(x - 7, y - 5, 8.5, 4.4, WHITE, { extra: { opacity: 0.75, transform: `rotate(-14 ${N(x - 7)} ${N(y - 5)})` } }) +
          S.circle(x + 6, y - 8, 2.2, WHITE, op(0.7))
        )
      );
    },
  },
  {
    id: 'lines',
    name: '부끄 볼',
    render(ctx) {
      const { S, C } = ctx;
      const bl = blushOf(ctx);
      const g = blushGrad(ctx, 'c-lines', bl, 0.6);
      // on deep skin a darker red line disappears, so go lighter/pinker instead
      const ink = deepSkin(ctx) ? C.mix(bl, '#ffa3b1', 0.5) : C.mix(bl, ctx.mouthRed, 0.55);
      return (
        `<defs>${g.def}</defs>` +
        pair(ctx.F.cheekL, ctx.F.cheekR, (x, y) => {
          let o = S.ellipse(x, y, 28, 16, g.url);
          [-10, 0, 10].forEach((dx) => (o += S.path(taper([[x + dx + 4, y - 7], [x + dx, y], [x + dx - 4, y + 7]], 3.6, 4, 3.4, 8), ink)));
          return o;
        })
      );
    },
  },
  {
    id: 'freckles',
    name: '주근깨',
    render(ctx) {
      const { S, C } = ctx;
      const fc = deepSkin(ctx) ? C.mix(ctx.skin, '#1e0e07', 0.5) : C.mix(ctx.skin, '#7a3c1e', 0.58);
      const pts = [
        [-14, -7, 2.9],
        [-3, -10, 2.5],
        [9, -6, 2.8],
        [-8, 2, 2.6],
        [4, 2, 3],
        [16, 1, 2.3],
        [-1, 11, 2.4],
        [-17, 6, 2],
      ];
      return pair(ctx.F.cheekL, ctx.F.cheekR, (x, y, s) => pts.map(([dx, dy, r]) => S.circle(x - s * dx + s * 4, y + dy, r, fc, op(0.82))).join(''));
    },
  },
  {
    id: 'double',
    name: '동글동글 볼',
    render(ctx) {
      // crisp, round painted blush disc (a sticker-like vinyl-toy blush) with a glossy rim light
      const { S, C } = ctx;
      const col = C.mix(blushOf(ctx), '#ff8297', 0.4);
      const g = S.radial(ctx.id('c-dbl'), [[0, C.light(col, 0.16)], [0.7, col], [0.93, C.shade(col, 0.06)], [1, C.shade(col, 0.06), 0.5]], { cx: '45%', cy: '42%', r: '58%' });
      const halo = blushGrad(ctx, 'c-dblh', col, 0.38);
      return (
        `<defs>${g.def}${halo.def}</defs>` +
        pair(ctx.F.cheekL, ctx.F.cheekR, (x, y) => {
          const cy = y + 1;
          return (
            S.ellipse(x, cy + 1, 27, 18, halo.url) +
            S.ellipse(x, cy, 16.5, 14, g.url) +
            S.path(`M${P(x - 12, cy - 2)}Q${P(x - 10.5, cy - 11)} ${P(x - 1, cy - 12)}Q${P(x - 7.5, cy - 8.5)} ${P(x - 12, cy - 2)}Z`, WHITE, op(0.7)) +
            S.circle(x + 8.5, cy + 6.5, 1.6, WHITE, op(0.6))
          );
        })
      );
    },
  },
  {
    id: 'sparkle',
    name: '반짝 볼',
    render(ctx) {
      const { S, C } = ctx;
      const bl = blushOf(ctx);
      const g = blushGrad(ctx, 'c-spk', bl, 0.7);
      const edge = C.mix(bl, '#e8507a', 0.45);
      const star = (sx, sy, r) => S.path(star4(sx, sy, r * 1.32, 0.3), edge, op(0.55)) + S.path(star4(sx, sy, r), WHITE);
      return (
        `<defs>${g.def}</defs>` +
        pair(ctx.F.cheekL, ctx.F.cheekR, (x, y, s) =>
          S.ellipse(x, y + 2, 26, 15, g.url) + star(x + s * 8, y - 10, 8) + star(x - s * 9, y + 4, 4.6) + S.circle(x + s * 17, y + 4, 2, WHITE, { stroke: edge, sw: 1.4, extra: { 'stroke-opacity': 0.55 } })
        )
      );
    },
  },
  {
    id: 'sweat',
    name: '식은땀',
    render(ctx) {
      const { S, F } = ctx;
      const g = S.radial(ctx.id('c-sweat'), [[0, '#ffffff'], [0.45, '#dff4ff'], [1, '#7cc5ef']], { cx: '38%', cy: '68%', r: '70%' });
      const x = F.cheekR.x + 8;
      const y = F.cheekR.y - 15;
      return (
        `<defs>${g.def}</defs>` +
        S.path(dropD(x, y, 11, 2.4), g.url) +
        S.ellipse(x - 4, y + 1, 3, 4.2, WHITE, op(0.9)) +
        S.circle(x + 3.5, y + 6, 1.4, WHITE, op(0.7)) +
        S.path(dropD(x + 17, y + 25, 5.6, 2.2), g.url) +
        S.circle(x + 15.4, y + 25.4, 1.6, WHITE, op(0.9))
      );
    },
  },
  {
    id: 'bandaid',
    name: '반창고',
    render(ctx) {
      const { S, C, F } = ctx;
      const g = blushGrad(ctx, 'c-band', blushOf(ctx), 0.6);
      // sits low on the outer cheek: clear of every eye style (incl. dark circles / tears)
      const x = F.cheekL.x;
      const y = F.cheekL.y + 9;
      const tape = '#fff4e6';
      const edge = C.mix('#e2c19c', ctx.skin, 0.15);
      const pad = '#ffc4cd';
      const rot = `rotate(-20 ${x} ${y})`;
      const holes = [-19, -14, 14, 19].map((dx) => [-3.2, 3.2].map((dy) => S.circle(x + dx, y + dy, 1.4, edge)).join('')).join('');
      return (
        `<defs>${g.def}</defs>` +
        pair(F.cheekL, F.cheekR, (cx, cy) => S.ellipse(cx, cy, 27, 16, g.url)) +
        `<g transform="${rot}">` +
        S.rect(x - 27, y - 10, 54, 20, 10, tape, { stroke: edge, sw: 2 }) +
        S.rect(x - 9, y - 7.6, 18, 15.2, 3.6, pad) +
        holes +
        S.rect(x - 22, y - 7.4, 42, 3.4, 1.7, WHITE, op(0.75)) +
        `</g>`
      );
    },
  },
  {
    id: 'heart',
    name: '하트 볼',
    render(ctx) {
      const { S, C } = ctx;
      const g = blushGrad(ctx, 'c-heartb', blushOf(ctx), 0.45);
      const pink = C.mix(blushOf(ctx), '#ff6d8f', 0.5);
      return (
        `<defs>${g.def}</defs>` +
        pair(ctx.F.cheekL, ctx.F.cheekR, (x, y, s) =>
          S.ellipse(x, y, 28, 17, g.url) + S.path(heartD(x, y + 1, 27), pink, op(0.92)) + S.ellipse(x - 5.5, y - 4.5, 3.2, 2.2, WHITE, op(0.75))
        )
      );
    },
  },
  { id: 'none', name: '없음', render: () => '' },
]);
