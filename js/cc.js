/*
 * 직장의 숲 · 캐릭터 공방 — cc.js (data, state, registry, 2D face decal)
 * ---------------------------------------------------------------------------
 * No three.js dependency here. Part files import { CC } from '../cc.js' and
 * call CC.register(categoryKey, [parts]).
 *
 * PART CONTRACT
 *   { id, name, render(ctx) }
 *   - id: stable ascii id, unique in the category ('none' = nothing)
 *   - hidden: true keeps a part out of the workshop and random looks (worn only by the scenes)
 *   - name: short Korean label shown in the UI
 *   - render(ctx) returns one of
 *       * an SVG string            -> face decal (face categories only, face space 400x260)
 *       * a THREE.Object3D         -> attached to the category's default bone (cat.attach)
 *       * an object { face, head, body, armL, armR, hide } with any subset:
 *           face: SVG string in face space
 *           head: Object3D in HEAD SPACE (unit sphere head at origin, +Z = face front)
 *           body: Object3D in CHARACTER SPACE (feet on y=0, +Z toward the viewer)
 *           armL / armR: Object3D in CHARACTER SPACE at rest pose; follows that arm
 *           hide: base pieces to hide: 'legs' | 'feet' | 'arms' | 'hands' | 'ears' | 'torso'
 *   - 3D helpers are on ctx (see js/char3d.js makeCtx). Never create renderers/scenes in parts.
 *   - SVG decals: use ctx.id('name') for <defs> ids. No <text>, <image>, <script>.
 */

/* --------------------------------------------------------------- color utils */
const INK = '#3b2416';
function hexToRgb(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const color = {
  INK,
  hexToRgb,
  rgbToHex,
  mix,
  luminance,
  shade: (hex, t = 0.22) => mix(hex, INK, t),
  light: (hex, t = 0.35) => mix(hex, '#ffffff', t),
  line: (hex) => (luminance(hex) < 0.18 ? mix(hex, '#000000', 0.45) : mix(hex, INK, 0.58)),
  isDark: (hex) => luminance(hex) < 0.35,
};

/* --------------------------------------------------------------- palettes */
const PALETTES = {
  skin: ['#ffe6d5', '#fbd5bd', '#f3c2a0', '#e6a983', '#cc8c64', '#a96d4a', '#81513a', '#5e3b29'],
  hair: [
    '#2b2321', '#4a2f23', '#7a4a2e', '#a0522d', '#c98a4b', '#e8c170', '#f1e3b8', '#d9662b',
    '#b8323a', '#f29bb5', '#b79be0', '#5b8fd9', '#7fd1b9', '#a8a8b0', '#f3f1ec',
  ],
  eye: ['#2b211c', '#5a3a24', '#8a5a2b', '#3f7cc4', '#2f9e8f', '#4f8a3a', '#8a5ac9', '#d9475b', '#c9a227', '#7a8a99'],
  cloth: [
    '#f7f4ee', '#f3e2b3', '#f6d04d', '#f39a4a', '#f2766b', '#d94a4a', '#f4a6c0', '#9b7fd1', '#34497a',
    '#4f8fe0', '#9cd3f0', '#8fdcc0', '#5bb36a', '#8a9a4b', '#8a5a3c', '#d8c3a5', '#9a9aa3', '#3e3f46',
  ],
  // backdrops for the plain background (the first is the original cream)
  pastel: [
    '#fbeedd', '#ffe3e3', '#ffd9ec', '#f1e0ff', '#e0e4ff', '#d9ecff', '#d6f5f5', '#dcf5e3', '#eef7d2', '#fff6c9',
    '#ffe8cc', '#f1e9e2', '#e9ecef', '#ffffff',
  ],
};
const P = PALETTES;

/* --------------------------------------------------------------- face space
 * The face decal is an SVG with viewBox 0 0 400 260, wrapped onto the front of
 * the head sphere: x 0..400 <-> azimuth -70..+70 deg (viewer's left -> right),
 * y 0..260 <-> elevation +36..-54 deg (top -> bottom). Roughly 2.86 px / degree.
 */
const FACE = {
  w: 400,
  h: 260,
  azRange: [-70, 70],
  elRange: [36, -54],
  eyeL: { x: 134, y: 112 },
  eyeR: { x: 266, y: 112 },
  browL: { x: 134, y: 68 },
  browR: { x: 266, y: 68 },
  nose: { x: 200, y: 148 },
  mouth: { x: 200, y: 178 },
  cheekL: { x: 92, y: 152 },
  cheekR: { x: 308, y: 152 },
  /** face-space x,y -> [azimuthDeg, elevationDeg] */
  toAzEl: (x, y) => [-70 + (x / 400) * 140, 36 - (y / 260) * 90],
  /** [az, el] -> face-space {x, y} */
  fromAzEl: (az, el) => ({ x: ((az + 70) / 140) * 400, y: ((36 - el) / 90) * 260 }),
};

/* --------------------------------------------------------------- svg helpers */
function fmt(v) {
  return typeof v === 'number' ? +v.toFixed(2) : v;
}
function attrs(o) {
  return Object.keys(o)
    .filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== false)
    .map((k) => `${k}="${fmt(o[k])}"`)
    .join(' ');
}
function el(tag, o, inner) {
  return inner == null ? `<${tag} ${attrs(o || {})}/>` : `<${tag} ${attrs(o || {})}>${inner}</${tag}>`;
}
function strokeAttrs(fill, o) {
  o = o || {};
  if (!o.stroke || o.stroke === 'none') return Object.assign({ stroke: 'none' }, o.extra);
  return Object.assign(
    { stroke: o.stroke, 'stroke-width': o.sw != null ? o.sw : 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
    o.extra
  );
}
/** SVG helpers. Shapes have NO outline unless o.stroke is given (painted 3D-toy look). */
const svg = {
  attrs,
  el,
  path: (d, fill, o) => el('path', Object.assign({ d, fill }, strokeAttrs(fill, o))),
  circle: (cx, cy, r, fill, o) => el('circle', Object.assign({ cx, cy, r, fill }, strokeAttrs(fill, o))),
  ellipse: (cx, cy, rx, ry, fill, o) => el('ellipse', Object.assign({ cx, cy, rx, ry, fill }, strokeAttrs(fill, o))),
  rect: (x, y, w, h, rx, fill, o) => el('rect', Object.assign({ x, y, width: w, height: h, rx, fill }, strokeAttrs(fill, o))),
  line: (d, stroke, width, o) =>
    el(
      'path',
      Object.assign(
        { d, fill: 'none', stroke, 'stroke-width': width || 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        (o && o.extra) || {}
      )
    ),
  g: (inner, o) => el('g', o || {}, inner),
  /** mirror around the vertical center line of a canvas of width w (default face width 400) */
  mirror: (inner, w = 400) => `<g transform="matrix(-1 0 0 1 ${w} 0)">${inner}</g>`,
  sym: (inner, w = 400) => inner + `<g transform="matrix(-1 0 0 1 ${w} 0)">${inner}</g>`,
  /** radial gradient def; returns { def, url } */
  radial(id, stops, o) {
    o = o || {};
    const s = stops.map(([off, c, op]) => `<stop offset="${off}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
    const a = attrs({ id, cx: o.cx ?? '50%', cy: o.cy ?? '50%', r: o.r ?? '50%', fx: o.fx, fy: o.fy, gradientUnits: o.units });
    return { def: `<radialGradient ${a}>${s}</radialGradient>`, url: `url(#${id})` };
  },
  linear(id, stops, o) {
    o = o || {};
    const s = stops.map(([off, c, op]) => `<stop offset="${off}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
    const a = attrs({ id, x1: o.x1 ?? '0', y1: o.y1 ?? '0', x2: o.x2 ?? '0', y2: o.y2 ?? '1', gradientUnits: o.units });
    return { def: `<linearGradient ${a}>${s}</linearGradient>`, url: `url(#${id})` };
  },
};

/* --------------------------------------------------------------- categories
 * kind: '3d' (thumbnail rendered in 3D with cat.frame), 'face' (2D decal thumb
 * cropped to cat.view in face space), 'bg' (backdrop svg).
 * attach: default bone for a bare Object3D return.
 */
const CATEGORIES = [
  { key: 'skin', label: '피부', icon: '🎨', colorKey: 'skin', palette: P.skin, paletteOnly: true, kind: '3d', frame: 'head' },
  { key: 'faceShape', label: '얼굴', icon: '🥚', kind: '3d', frame: 'head' },
  { key: 'hair', label: '헤어', icon: '💇', colorKey: 'hairColor', palette: P.hair, kind: '3d', frame: 'hair', attach: 'head' },
  { key: 'brows', label: '눈썹', icon: '〰️', colorKey: 'hairColor', palette: P.hair, kind: 'face', view: [92, 40, 216, 64] },
  { key: 'eyes', label: '눈', icon: '👀', colorKey: 'eyeColor', palette: P.eye, kind: 'face', view: [98, 72, 204, 80] },
  { key: 'nose', label: '코', icon: '👃', kind: 'face', view: [164, 126, 72, 46] },
  { key: 'mouth', label: '입', icon: '👄', kind: 'face', view: [156, 150, 88, 58] },
  { key: 'cheeks', label: '볼', icon: '🌸', kind: 'face', view: [50, 50, 300, 196], thumbContext: true },
  { key: 'bodyShape', label: '체형', icon: '🧍', kind: '3d', frame: 'figure' },
  { key: 'top', label: '상의', icon: '👕', colorKey: 'topColor', palette: P.cloth, kind: '3d', frame: 'top', attach: 'body' },
  { key: 'bottom', label: '하의', icon: '👖', colorKey: 'bottomColor', palette: P.cloth, kind: '3d', frame: 'bottom', attach: 'body' },
  { key: 'shoes', label: '신발', icon: '👟', colorKey: 'shoesColor', palette: P.cloth, kind: '3d', frame: 'shoes', attach: 'body' },
  { key: 'glasses', label: '안경', icon: '👓', colorKey: 'glassesColor', palette: P.cloth, kind: '3d', frame: 'face', attach: 'head' },
  { key: 'hat', label: '모자', icon: '🎩', colorKey: 'hatColor', palette: P.cloth, kind: '3d', frame: 'hat', attach: 'head' },
  { key: 'acc', label: '소품', icon: '🎀', colorKey: 'accColor', palette: P.cloth, kind: '3d', frame: 'body', attach: 'body' },
  // colorFor: the options the colour applies to; customColor: any colour may be picked, not only the palette
  { key: 'bg', label: '배경', icon: '🌳', kind: 'bg', colorKey: 'bgColor', palette: P.pastel, colorFor: ['plain'], customColor: true },
];
const FACE_CATS = ['cheeks', 'mouth', 'nose', 'eyes', 'brows']; // paint order (bottom -> top)

const DEFAULT_COLORS = {
  skin: P.skin[1],
  hairColor: P.hair[2],
  eyeColor: P.eye[0],
  topColor: P.cloth[5], // red
  bottomColor: P.cloth[8],
  shoesColor: P.cloth[0],
  glassesColor: P.cloth[17],
  hatColor: P.cloth[4],
  accColor: P.cloth[5],
  bgColor: P.pastel[0],
};

/* --------------------------------------------------------------- the CC object */
export const CC = {
  version: 2,
  color,
  PALETTES,
  FACE,
  svg,
  CATEGORIES,
  FACE_CATS,
  DEFAULT_COLORS,
  META_FIELDS: ['name', 'dept', 'rank'],
  parts: {},
};

CC.category = (key) => CATEGORIES.find((c) => c.key === key);

CC.register = function (category, parts) {
  const list = (CC.parts[category] = CC.parts[category] || []);
  (Array.isArray(parts) ? parts : [parts]).forEach((p) => {
    if (!p || !p.id || typeof p.render !== 'function') {
      console.warn('[CC] invalid part in', category, p);
      return;
    }
    const i = list.findIndex((q) => q.id === p.id);
    if (i >= 0) list[i] = p;
    else list.push(p);
  });
  return list;
};
CC.getPart = (category, id) => {
  const list = CC.parts[category] || [];
  return list.find((p) => p.id === id) || list[0] || null;
};

/* --------------------------------------------------------------- state */
CC.defaultState = function () {
  const s = { v: CC.version, name: '', dept: '', rank: '' };
  Object.assign(s, DEFAULT_COLORS);
  CATEGORIES.forEach((cat) => {
    if (cat.paletteOnly) return;
    const list = CC.parts[cat.key] || [];
    s[cat.key] = list[0] ? list[0].id : 'none';
  });
  return s;
};

CC.rng = function (seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

CC.randomState = function (rng, keep) {
  rng = rng || Math.random;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const s = CC.defaultState();
  CATEGORIES.forEach((cat) => {
    if (!cat.paletteOnly) {
      const list = (CC.parts[cat.key] || []).filter((p) => !p.hidden);
      if (list.length) {
        const hasNone = list[0].id === 'none';
        if (hasNone && rng() < 0.55) s[cat.key] = 'none';
        else s[cat.key] = pick(hasNone && list.length > 1 ? list.slice(1) : list).id;
      }
    }
    if (cat.colorKey) s[cat.colorKey] = pick(cat.palette);
  });
  if (rng() < 0.7) s.hairColor = pick(P.hair.slice(0, 7));
  if (rng() < 0.6) s.eyeColor = pick(P.eye.slice(0, 3));
  if (keep) CC.META_FIELDS.forEach((k) => (s[k] = keep[k] || ''));
  return s;
};

CC.sanitize = function (input) {
  const s = CC.defaultState();
  if (!input || typeof input !== 'object') return s;
  CC.META_FIELDS.forEach((k) => {
    if (typeof input[k] === 'string') s[k] = input[k].slice(0, 24);
  });
  Object.keys(DEFAULT_COLORS).forEach((k) => {
    if (typeof input[k] === 'string' && /^#[0-9a-f]{6}$/i.test(input[k])) s[k] = input[k];
  });
  CATEGORIES.forEach((cat) => {
    if (cat.paletteOnly) return;
    const id = input[cat.key];
    if (typeof id === 'string' && (CC.parts[cat.key] || []).some((p) => p.id === id && !p.hidden)) s[cat.key] = id;
  });
  return s;
};

CC.encodeState = function (state) {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
CC.decodeState = function (str) {
  try {
    let b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return CC.sanitize(JSON.parse(decodeURIComponent(escape(atob(b64)))));
  } catch (e) {
    return null;
  }
};

/** stable short hash of any string (for cache keys / employee numbers) */
CC.hash = function (str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* --------------------------------------------------------------- 2D context */
let uidCounter = 0;
/** context passed to face (SVG) parts and also merged into the 3D ctx */
CC.makeColorCtx = function (state, uid) {
  const skin = state.skin || DEFAULT_COLORS.skin;
  const hair = state.hairColor || DEFAULT_COLORS.hairColor;
  uid = uid || 'f' + ++uidCounter;
  return {
    uid,
    id: (name) => `${uid}-${name}`,
    state,
    C: color,
    S: svg,
    F: FACE,
    ink: INK,
    skin,
    skinShade: color.shade(skin, 0.14),
    skinLight: color.light(skin, 0.3),
    skinLine: color.line(skin),
    blush: mix(skin, '#ff6f7d', 0.42),
    /** dark feature color that reads on every skin tone (mouth lines, closed eyes) */
    featureInk: luminance(skin) < 0.3 ? '#2a1712' : mix(skin, '#3b1a12', 0.82),
    mouthRed: mix(mix(skin, '#c8434d', 0.62), '#3b1a12', luminance(skin) < 0.3 ? 0.35 : 0.12),
    hair,
    hairShade: color.shade(hair, 0.22),
    hairLight: color.light(hair, 0.32),
    hairLine: color.line(hair),
    browColor: luminance(hair) > 0.6 ? mix(hair, INK, 0.45) : color.shade(hair, 0.18),
    eye: state.eyeColor || DEFAULT_COLORS.eyeColor,
  };
};
CC.withColor = function (ctx, c) {
  if (!c) return ctx;
  return Object.assign({}, ctx, {
    color: c,
    colorShade: color.shade(c, 0.2),
    colorLight: color.light(c, 0.35),
    colorLine: color.line(c),
  });
};

/* --------------------------------------------------------------- face decal */
function defaultBlink(ctx) {
  const F = FACE;
  const lid = (x, y) => svg.line(`M${x - 20} ${y + 2}Q${x} ${y + 13} ${x + 20} ${y + 2}`, ctx.featureInk, 6);
  return lid(F.eyeL.x, F.eyeL.y) + lid(F.eyeR.x, F.eyeR.y);
}

/**
 * Face decal for a state -> SVG string (viewBox 0 0 400 260, transparent bg).
 * opts.blink: closed-eye variant. opts.only: [catKeys] to include. opts.uid
 */
CC.faceSVG = function (state, opts) {
  opts = opts || {};
  const base = CC.makeColorCtx(state, opts.uid);
  const layers = [];
  FACE_CATS.forEach((key) => {
    if (opts.only && !opts.only.includes(key)) return;
    const cat = CC.category(key);
    const part = CC.getPart(key, state[key]);
    if (!part) return;
    const ctx = cat.colorKey ? CC.withColor(base, state[cat.colorKey] || DEFAULT_COLORS[cat.colorKey]) : base;
    let out = '';
    try {
      if (key === 'eyes' && opts.blink) out = part.blink ? part.blink(ctx) : defaultBlink(ctx);
      else {
        const r = part.render(ctx);
        out = typeof r === 'string' ? r : (r && r.face) || '';
      }
    } catch (err) {
      if (opts.onError) opts.onError(key, part.id, err);
      else console.error('[CC] face part failed', key, part.id, err);
    }
    if (out) layers.push(`<g class="f-${key}">${out}</g>`);
  });
  const w = opts.width ? ` width="${opts.width}" height="${opts.height}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"${w}>${layers.join('')}</svg>`;
};

/** fake-3D skin patch behind face thumbnails (covers any letterboxing) */
function skinBall(ctx, vb) {
  const [x, y, w, h] = vb;
  const g = svg.radial(
    ctx.id('skinball'),
    [
      [0, color.light(ctx.skin, 0.3)],
      [0.55, ctx.skin],
      [1, color.shade(ctx.skin, 0.22)],
    ],
    { cx: x + w * 0.4, cy: y + h * 0.3, r: Math.max(w, h) * 0.95, units: 'userSpaceOnUse' }
  );
  return `<defs>${g.def}</defs><rect x="${x - 600}" y="${y - 600}" width="${w + 1200}" height="${h + 1200}" fill="${g.url}"/>`;
}

/** 2D thumbnail for a face-category option: SVG string cropped to cat.view */
CC.faceThumb = function (state, catKey, value, opts) {
  opts = opts || {};
  const cat = CC.category(catKey);
  const s = Object.assign({}, state, { [catKey]: value });
  const uid = 't' + ++uidCounter;
  const ctx = CC.makeColorCtx(s, uid);
  const inner = CC.faceSVG(s, { only: opts.all ? null : [catKey], uid, onError: opts.onError })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  const vb = cat.view || [0, 0, 400, 260];
  // small marks (cheeks) read better with the rest of the face faintly behind them
  const context =
    cat.thumbContext && !opts.all
      ? `<g opacity="0.32">${CC.faceSVG(s, { only: FACE_CATS.filter((k) => k !== catKey), uid: uid + 'c', onError: opts.onError })
          .replace(/^<svg[^>]*>/, '')
          .replace(/<\/svg>$/, '')}</g>`
      : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet">` +
    skinBall(ctx, vb) +
    context +
    inner +
    `</svg>`
  );
};

/** backdrop SVG for a state (bg category), viewBox 0 0 600 600 */
CC.backdropSVG = function (state, opts) {
  opts = opts || {};
  const part = CC.getPart('bg', (state && state.bg) || 'none');
  if (!part) return '';
  try {
    state = state || CC.defaultState();
    const ctx = CC.withColor(CC.makeColorCtx(state, opts.uid), state.bgColor || DEFAULT_COLORS.bgColor);
    const out = part.render(ctx) || '';
    if (!out) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" preserveAspectRatio="${opts.par || 'xMidYMax slice'}"${
      opts.width ? ` width="${opts.width}" height="${opts.height}"` : ''
    }>${out}</svg>`;
  } catch (err) {
    if (opts.onError) opts.onError('bg', part.id, err);
    else console.error('[CC] bg failed', err);
    return '';
  }
};

/** rasterize an svg string to a canvas (browser only) */
CC.rasterize = function (svgString, width, height) {
  return new Promise((resolve, reject) => {
    const s = svgString.replace(
      /<svg([^>]*)>/,
      (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${width}" height="${height}">`
    );
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c);
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
};

/* --------------------------------------------------------------- face / body shapes
 * Shapes are not geometry: each one is a smooth warp of space. char3d.js runs the base
 * meshes AND every part attached to that bone through the same warp, so hair, hats,
 * glasses and clothes keep fitting whatever shape is chosen.
 *   head warp: head space (unit sphere, chin at y=-1 stays put so the neck always joins)
 *   body warp: character space (feet on y=0 stay on the ground)
 */
const bump = (v, c, s) => Math.exp(-(((v - c) / s) ** 2));
const smooth01 = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

const shapePart = (id, name, shape) => ({ id, name, shape, render: () => null });

/* A face shape only reshapes the JAW and CHEEKS of the standard head. The head's size,
 * crown and position (so also the neck) never change: everything above the eye line is
 * the plain sphere.
 *   jaw:   [angleDeg, radius] points of the lower front silhouette (-90 = chin tip,
 *          0 = eye line; 1 = the plain sphere), joined by a smooth curve
 *   ease:  degrees above the eye line where the outline is back to the sphere (default 14)
 *   cheek: { az, el, k, s } a soft puff of k (radius fraction) centred on each cheek at
 *          (+-az, el) degrees, s degrees wide
 * Keep the chin tip within 0.92..1.05 so it neither shows the neck seam nor sinks into collars. */
CC.register('faceShape', [
  shapePart('round', '기본형', null),
  // same chin, cheeks puffed out to the sides and a little forward
  shapePart('cheeks', '볼살형', { jaw: [[-90, 1.0], [-66, 0.98]], cheek: { az: 62, el: -27, k: 0.13, s: 28 } }),
  // wide soft jaw with a flat little chin, cheeks resting low
  shapePart('cute', '귀여운형', { jaw: [[-90, 0.98], [-62, 1.1], [-32, 1.12], [-4, 1.03]] }),
  // slim U: the cheeks run straight down instead of bulging, then round off into the
  // same short chin (never lengthen or taper the chin: that reads as a pointy triangle)
  shapePart('long', '세로형', { jaw: [[-90, 1.0], [-66, 1.035], [-46, 1.045], [-22, 0.975], [0, 0.94]], ease: 34 }),
  // two soft jaw corners and a flat chin
  shapePart('square', '네모형', { jaw: [[-90, 0.99], [-47, 1.16], [-14, 1.01]] }),
]);

/* Kept close to the standard build on purpose: the day scenes seat every body at the same
 * desk, table and bench, and a belly or hips much deeper than this come out through the
 * desk top; legs much longer or shorter lift or sink the body past what the scenes allow. */
CC.register('bodyShape', [
  shapePart('normal', '보통', null),
  shapePart('slim', '슬림', { w: 0.86, d: 0.88 }),
  shapePart('chubby', '통통', { w: 1.1, d: 0.94, belly: 0.1, leg: 1.06 }), // round sideways more than forwards
  shapePart('tall', '키다리', { w: 0.95, d: 0.95, kL: 1.2, kT: 1.06 }),
  shapePart('small', '아담', { kL: 0.8, kT: 0.94 }),
  shapePart('broad', '듬직', { w: 1.06, d: 1.0, shoulder: 0.22, kT: 1.04 }),
  shapePart('pear', '조롱박', { w: 0.96, d: 0.92, hip: 0.22, shoulder: -0.08, leg: 1.06 }),
]);

/** smooth outline radius lookup (deg -> r) through [[deg, r], ...]; flat at both poles */
function outlineFn(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const m = pts.map((p, i) => (i === 0 || i === n - 1 ? 0 : (pts[i + 1][1] - pts[i - 1][1]) / (pts[i + 1][0] - pts[i - 1][0])));
  const table = new Float32Array(181);
  for (let k = 0, i = 0; k <= 180; k++) {
    const a = k - 90;
    while (i < n - 2 && a > pts[i + 1][0]) i++;
    const h = pts[i + 1][0] - pts[i][0];
    const t = Math.max(0, Math.min(1, (a - pts[i][0]) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    table[k] =
      (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
  }
  return (deg) => {
    const f = Math.max(0, Math.min(179.999, deg + 90));
    const k = Math.floor(f);
    return table[k] + (table[k + 1] - table[k]) * (f - k);
  };
}

/* The base skull, shared by every face shape, is ONE smooth surface (a superellipsoid),
 * so there are no seams for the light to catch:
 *   - longer front-to-back than it is tall, and a little wider
 *   - the face side is boxier: forehead and chin are soft corners with a nearly straight
 *     face between them; the chin corner is the more defined of the two
 *   - the underside is flat-ish, the crown and the back of the head stay round
 * `n` is the roundness exponent: 2 = ball, bigger = boxier. It varies smoothly with direction. */
const SKULL = { ax: 1.04, az: 1.1, front: 0.6, low: 0.3, jaw: 0.35 };
function skullScale(dx, dy, dz) {
  const down = smooth01(-dy / 0.7);
  // side view: boxier toward the face (forehead + chin corners), most of all at the chin
  const n = 2 + SKULL.front * smooth01((dz + 0.35) / 1.0) + SKULL.low * down;
  const side = (Math.abs(dy) ** n + Math.abs(dz / SKULL.az) ** n) ** (1 / n);
  // front / top view: round, except a slightly flatter, wider jaw
  const m = 2 + SKULL.jaw * down;
  return (Math.abs(dx / SKULL.ax) ** m + side ** m) ** (-1 / m);
}

/** state -> (x, y, z) => [x, y, z] in head space (always a function: the skull is not a ball) */
CC.headWarp = function (state) {
  const part = CC.getPart('faceShape', state && state.faceShape);
  const o = (part && part.shape) || {};
  // the front outline settles back to the skull just above the eye line and stays there
  const e = o.ease || 14;
  const R = o.jaw ? outlineFn(o.jaw.concat([[e, 1], [e + 16, 1], [90, 1]])) : null;
  const ch = o.cheek;
  const RAD = Math.PI / 180;
  const cx = ch ? Math.cos(ch.el * RAD) * Math.sin(ch.az * RAD) : 0;
  const cy = ch ? Math.sin(ch.el * RAD) : 0;
  const cz = ch ? Math.cos(ch.el * RAD) * Math.cos(ch.az * RAD) : 0;
  return (x, y, z) => {
    const r = Math.hypot(x, y, z);
    if (r < 1e-6) return [x, y, z];
    const dy = y / r;
    const dz = z / r;
    let k = skullScale(x / r, dy, dz);
    // face shape: jaw outline on the front and sides only (the back of the head stays put)
    let s = 1;
    if (R) s = 1 + (R(Math.asin(Math.max(-1, Math.min(1, dy))) / RAD) - 1) * smooth01((dz + 0.8) / 0.65);
    if (ch) {
      // |x| mirrors the puff onto both cheeks
      const dot = Math.max(-1, Math.min(1, (Math.abs(x) * cx + y * cy + z * cz) / r));
      k *= 1 + ch.k * Math.exp(-((Math.acos(dot) / RAD / ch.s) ** 2));
    }
    return [x * s * k, y * s * k, z * (1 + (s - 1) * 0.45) * k];
  };
};

/** state -> (x, y, z) => [x, y, z] in character space, or null for the standard body */
CC.bodyWarp = function (state) {
  const part = CC.getPart('bodyShape', state && state.bodyShape);
  const o = part && part.shape;
  if (!o) return null;
  const w = o.w ?? 1;
  const d = o.d ?? 1;
  const belly = o.belly || 0;
  const shoulder = o.shoulder || 0;
  const hip = o.hip || 0;
  const leg = o.leg ?? 1;
  const kL = o.kL ?? 1;
  const kT = o.kT ?? 1;
  const A = 0.22; // top of the feet (shoes keep their size)
  const B = 0.86; // crotch
  const C = 1.62; // top of the torso; everything above just rides along
  const mapY = (y) => {
    if (y <= A) return y;
    if (y <= B) return A + (y - A) * kL;
    if (y <= C) return A + (B - A) * kL + (y - B) * kT;
    return A + (B - A) * kL + (C - B) * kT + (y - C);
  };
  return (x, y, z) => {
    const b = bump(y, 1.05, 0.28);
    const s = bump(y, 1.48, 0.22);
    const h = bump(y, 0.82, 0.22);
    const l = 1 + (leg - 1) * smooth01((0.9 - y) / 0.3);
    const kx = w * (1 + belly * b + shoulder * s + hip * h) * l;
    const kz = d * (1 + belly * 1.15 * b + shoulder * 0.3 * s + hip * 0.8 * h) * l;
    return [x * kx, mapY(y), z * kz];
  };
};

if (typeof window !== 'undefined') window.CC = CC;
