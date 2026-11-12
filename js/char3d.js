/*
 * 직장의 숲 · 캐릭터 공방 — char3d.js (three.js character, stage, thumbnails)
 * ---------------------------------------------------------------------------
 * SPACES
 *   Character space: feet on y=0, +Y up, +Z toward the viewer, x>0 = viewer's right.
 *   Head space: unit sphere head centred at the origin (+Z = face front). The head
 *   group squashes it by A3.headScale and sits at A3.headCenter in character space.
 *   Spherical coords on the head: az (deg, 0 = front, + = viewer's right, 180 = back),
 *   el (deg, +90 = crown, 0 = equator/eye line, - = toward chin).
 *
 * RIG
 *   root (spin / pop / hop) > body (breathing) > { torso, legs, feet, armL, armR, headPivot > head }
 *   armL / armR sit on the shoulders and carry a chain of bones (elbow, wrist); everything attached
 *   to an arm is drawn skinned to that chain, so sleeves bend with it (see ARM_JOINTS, Character._skin).
 *   Parts return objects for 'head' (head space), 'body', 'armL', 'armR' (character space).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CC } from './cc.js';
import { TUNING } from './tuning.js';

export { THREE, CC };

const DEG = Math.PI / 180;
const V3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

/* ============================================================== anatomy */
export const A3 = {
  headPivot: [0, 1.66, 0],
  headOffset: [0, 0.9, 0],
  headCenter: [0, 2.56, 0],
  headScale: [1.0, 0.92, 0.95],
  torsoDepth: 0.8,
  torsoProfile: [
    [0.0, 0.76], [0.22, 0.765], [0.33, 0.8], [0.395, 0.87], [0.42, 0.96], [0.42, 1.06],
    [0.405, 1.18], [0.385, 1.3], [0.37, 1.4], [0.35, 1.47], [0.31, 1.53], [0.24, 1.575],
    [0.13, 1.6], [0.0, 1.605],
  ],
  torsoBottom: 0.76,
  torsoTop: 1.605,
  waistY: 0.98,
  neck: { y0: 1.48, y1: 1.86, r: 0.14 },
  shoulderL: [-0.3, 1.46, 0],
  shoulderR: [0.3, 1.46, 0],
  handL: [-0.55, 0.95, 0.05],
  handR: [0.55, 0.95, 0.05],
  armRadius: 0.1,
  handRadius: 0.13,
  hipL: [-0.19, 0.92, 0],
  hipR: [0.19, 0.92, 0],
  ankleL: [-0.19, 0.2, 0],
  ankleR: [0.19, 0.2, 0],
  legRadius: 0.15,
  footL: [-0.2, 0.1, 0.07],
  footR: [0.2, 0.1, 0.07],
  footSize: [0.14, 0.1, 0.2], // ellipsoid radii of the bare foot
  // head-space landmarks (az, el in degrees) matching the face decal (CC.FACE)
  eyeL: { az: -23, el: -3 },
  eyeR: { az: 23, el: -3 },
  browL: { az: -23, el: 12 },
  browR: { az: 23, el: 12 },
  nose: { az: 0, el: -15 },
  mouth: { az: 0, el: -25 },
  earL: { az: -88, el: -6 },
  earR: { az: 88, el: -6 },
  hairlineEl: 22, // bangs should end above this elevation across az -40..40
};

/* torso radius lookup (dense samples of a smooth spline through the profile) */
const TORSO_SAMPLES = (() => {
  const pts = A3.torsoProfile.map(([r, y]) => new THREE.Vector2(r, y));
  const curve = new THREE.SplineCurve(pts);
  return curve.getSpacedPoints(240).map((p) => [Math.max(0, p.x), p.y]).sort((a, b) => a[1] - b[1]);
})();
export function torsoRadiusAt(y) {
  const s = TORSO_SAMPLES;
  if (y <= s[0][1]) return s[0][0];
  if (y >= s[s.length - 1][1]) return s[s.length - 1][0];
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid][1] <= y) lo = mid;
    else hi = mid;
  }
  const t = (y - s[lo][1]) / (s[hi][1] - s[lo][1] || 1);
  return s[lo][0] + (s[hi][0] - s[lo][0]) * t;
}

export function headDir(az, el) {
  const a = az * DEG;
  const e = el * DEG;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
}

const armPoint = (side, t) => {
  const s = V3(side === 'R' ? A3.shoulderR : A3.shoulderL);
  return s.lerp(V3(side === 'R' ? A3.handR : A3.handL), t);
};
/* ---- arm rig
 * The arm is skinned to a short chain of joints so it bends like a soft hose: four joints
 * share the elbow (no single one folds far enough to pinch the sleeve) and one is the wrist.
 * t = position along shoulder -> hand centre, h = half width of the blend around the joint. */
const ARM_JOINTS = [
  { t: 0.38, h: 0.04 }, { t: 0.46, h: 0.04 }, { t: 0.54, h: 0.04 }, { t: 0.62, h: 0.04 },
  { t: 0.8, h: 0.06 },
];
const ELBOW_N = 4;
const ARM_LEN = Math.hypot(A3.handR[0] - A3.shoulderR[0], A3.handR[1] - A3.shoulderR[1], A3.handR[2] - A3.shoulderR[2]);
const REST_POLE = [0.25, 0.1, -1]; // where the elbow points while the arm hangs (R side)
const HAND_CLEAR = 0.17; // hand radius + air between the hand and the head / hair
/* ---- leg rig
 * Each leg turns at a pivot LEG_DROP below the hip line, so a raised thigh folds out of the
 * bottom of the torso rather than its middle. Four joints share the knee (like the elbow)
 * and the last one is the ankle. t = position along pivot -> ankle.
 * Whatever is worn on the body below the torso (bare legs, feet, trousers, skirts, shoes,
 * long hems) is skinned to these bones by height and side; the torso itself never moves.
 * Below the pivot, the first LEG_BLEND.top stays with the torso and the next LEG_BLEND.span
 * blends into the leg; across the centre line, LEG_MID blends left into right (skirts). */
const LEG_DROP = 0.1;
const LEG_JOINTS = [
  { t: 0.47, h: 0.05 }, { t: 0.52, h: 0.05 }, { t: 0.57, h: 0.05 }, { t: 0.62, h: 0.05 },
  { t: 1.0, h: 0.06 },
];
const KNEE_N = 4;
const LEG_BLEND = { top: 0.03, span: 0.09 };
const LEG_MID = 0.035;
const LEG_SKIN_CATS = new Set(['bottom', 'shoes', 'top']);
const HIDDEN_LAYER = 30; // originals of leg-skinned meshes live here (not drawn, no shadow)
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _e1 = new THREE.Euler();
const sstep = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const IDENT = new THREE.Matrix4();
const WAVE = { len: 2.05, down: 0.42 };
const HOP = { crouch: 0.13, air: 0.5, height: 0.42 };
const ARM_SPRING = { k: 300, c: 21 };
const HEAD_GRID = { na: 36, ne: 18, cap: 1.3 };
const NO_TURN = { x: 0, y: 0, z: 0 };
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();

/** swap triangle winding (geometry baked through a mirroring matrix) */
function flipWinding(geo) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const a = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) a[i] = i;
    geo.setIndex(new THREE.BufferAttribute(a, 1));
  }
  const a = geo.index.array;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  geo.index.needsUpdate = true;
}

/* bare foot: a rounded sole that sits flat, wider at the toes, with the instep sloping
 * down from the ankle (unit-sphere space, z = heel -> toe) */
const footShape = (x, y, z) => {
  const toe = sstep((z + 0.2) / 1.2);
  const yy = y > 0 ? y * (1.14 - 0.42 * toe) : (-Math.tanh(2.4 * -y) / Math.tanh(2.4)) * 0.9;
  return [x * (0.9 + 0.2 * toe), yy, z > 0 ? z * 1.05 : z * 0.94];
};

const legPoint = (side, t) => {
  const s = V3(side === 'R' ? A3.hipR : A3.hipL);
  return s.lerp(V3(side === 'R' ? A3.ankleR : A3.ankleL), t);
};

/* ============================================================== proportions
 * The whole cast shares one set of proportions (js/tuning.js, edited in the studio):
 * head = head size, torso / legs = lengths, width = body width; 1 = the original design.
 * Lengths stretch the body the same way the body shapes do (feet keep their size).
 */
const PROP_DEFAULT = { head: 1, torso: 1, legs: 1, width: 1 };
const clampProp = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1);
export function normalizeProportions(p) {
  p = p || {};
  return {
    head: clampProp(p.head, 0.5, 1.4),
    torso: clampProp(p.torso, 0.6, 1.8),
    legs: clampProp(p.legs, 0.5, 2.2),
    width: clampProp(p.width, 0.7, 1.4),
  };
}
const isPlainProp = (p) => p.head === 1 && p.torso === 1 && p.legs === 1 && p.width === 1;
/** body-shape warp (or null) followed by the proportions; null when both are standard */
function proportionWarp(body, p) {
  if (isPlainProp(p)) return body;
  const A = 0.22; // top of the feet
  const B = 0.86; // crotch
  const C = 1.62; // top of the torso
  // the body shape may already have moved the breakpoints
  const at = (y) => (body ? body(0, y, 0)[1] : y);
  const a = at(A);
  const b = at(B);
  const c = at(C);
  const mapY = (y) => {
    if (y <= a) return y;
    if (y <= b) return a + (y - a) * p.legs;
    if (y <= c) return a + (b - a) * p.legs + (y - b) * p.torso;
    return a + (b - a) * p.legs + (c - b) * p.torso + (y - c);
  };
  return (x, y, z) => {
    const q = body ? body(x, y, z) : [x, y, z];
    const w = 1 + (p.width - 1) * sstep((q[1] - a) / 0.12); // feet keep their width
    return [q[0] * w, mapY(q[1]), q[2] * w];
  };
}

/* ============================================================== resource kit */
class Kit {
  /** detail: share of the usual segments for curved shapes (1 = full; see Character({ detail })) */
  constructor(detail = 1) {
    this.detail = detail;
    this.items = new Set();
    this.mats = new Map();
    this.pending = [];
  }
  track(x) {
    if (x) this.items.add(x);
    return x;
  }
  dispose() {
    this.items.forEach((x) => x.dispose && x.dispose());
    this.items.clear();
    this.mats.clear();
    this.pending = [];
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      if (m.userData && m.userData.shared) return;
      Object.values(m).forEach((v) => v && v.isTexture && !(v.userData && v.userData.shared) && v.dispose());
      m.dispose();
    });
  });
}

/* ============================================================== shape warp
 * Runs a mesh's vertices through fn in some bone space. toSpace / fromSpace are the
 * mesh-local -> space matrices before and after (they differ when the bone pivot moves).
 * Normals are rebuilt from the warp's local derivative so hard edges stay hard.
 */
function warpGeometry(geo0, toSpace, fromSpace, fn) {
  const pos0 = geo0.attributes.position;
  if (!pos0 || pos0.isInterleavedBufferAttribute) return null;
  const geo = geo0.clone();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal && !geo.attributes.normal.isInterleavedBufferAttribute ? geo.attributes.normal : null;
  const inv = new THREE.Matrix4().copy(fromSpace).invert();
  const nIn = new THREE.Matrix3().getNormalMatrix(toSpace);
  const nOut = new THREE.Matrix3().setFromMatrix4(fromSpace).transpose();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const E = 2e-3;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(toSpace);
    const w = fn(p.x, p.y, p.z);
    q.set(w[0], w[1], w[2]);
    if (nor) {
      n.fromBufferAttribute(nor, i).applyMatrix3(nIn).normalize();
      t1.set(Math.abs(n.x) < 0.6 ? 1 : 0, Math.abs(n.x) < 0.6 ? 0 : 1, 0).cross(n).normalize();
      t2.crossVectors(n, t1); // t1 x t2 = n
      const wa = fn(p.x + t1.x * E, p.y + t1.y * E, p.z + t1.z * E);
      const wb = fn(p.x + t2.x * E, p.y + t2.y * E, p.z + t2.z * E);
      a.set(wa[0], wa[1], wa[2]).sub(q);
      b.set(wb[0], wb[1], wb[2]).sub(q);
      t1.crossVectors(a, b);
      if (t1.lengthSq() > 1e-16) n.copy(t1);
      n.applyMatrix3(nOut).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    q.applyMatrix4(inv);
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingSphere();
  if (geo.boundingBox) geo.computeBoundingBox();
  return geo;
}

/** warp every mesh under obj (inclusive). space = ancestor group whose local frame is the bone space. */
function warpTree(obj, space, fn, pre, post) {
  const meshes = [];
  obj.traverse((o) => o.geometry && meshes.push(o));
  const M = new THREE.Matrix4();
  const A = new THREE.Matrix4();
  const B = new THREE.Matrix4();
  meshes.forEach((m) => {
    const g0 = m.userData.geo0 || (m.userData.geo0 = m.geometry);
    if (m.geometry !== g0) m.geometry.dispose();
    m.geometry = g0;
    if (!fn) return;
    M.identity();
    for (let o = m; o && o !== space; o = o.parent) {
      o.updateMatrix();
      M.premultiply(o.matrix);
    }
    A.copy(M);
    B.copy(M);
    if (pre) A.premultiply(pre);
    if (post) B.premultiply(post);
    const g = warpGeometry(g0, A, B, fn);
    if (g) m.geometry = g;
  });
}

/* ============================================================== materials */
function physical(params) {
  return new THREE.MeshPhysicalMaterial(params);
}
function colorOf(c) {
  return new THREE.Color(c);
}

/* Colour shading: instead of fading to grey/black where less light arrives, a surface
 * slides toward `shade`, a warmer, more saturated, slightly deeper version of its own
 * colour. Highlights and fully lit areas are left to the normal lighting.
 * Whites, greys and blacks have no hue to push, so their shade is a soft cool lavender
 * (a grey shadow on a white shirt is exactly the flat look this is here to avoid). */
function shadeOf(c, o) {
  o = o || {};
  const base = new THREE.Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl, THREE.SRGBColorSpace);
  // pull the hue toward warm red-orange (never across the wheel), boost saturation
  const warm = 0.03;
  let dh = warm - hsl.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  const h = (hsl.h + dh * (o.hue ?? 0.28) + 1) % 1;
  // the boost shrinks as the colour gets more saturated, so mid tones do not turn neon
  const sat = Math.min(1, hsl.s + (o.sat ?? 0.24) * (1 - hsl.s));
  const dark = o.dark ?? 0.87;
  const tinted = new THREE.Color().setHSL(h, sat, hsl.l * dark, THREE.SRGBColorSpace);
  // how colourless the base is (HSL saturation lies for near-whites, so use raw chroma)
  const srgb = base.clone().convertLinearToSRGB();
  const chroma = Math.max(srgb.r, srgb.g, srgb.b) - Math.min(srgb.r, srgb.g, srgb.b);
  const neutral = 1 - Math.min(1, chroma / 0.14);
  if (neutral <= 0) return tinted;
  const cool = new THREE.Color().setHSL(0.69, 0.16 + 0.2 * hsl.l, hsl.l * (dark - 0.04), THREE.SRGBColorSpace);
  return tinted.lerp(cool, neutral);
}
/* The shader multiplies the surface's own colour (texture included, so stripes and prints
 * survive in the shade) by uShade = shade / base. */
function setShade(mat, shade) {
  const b = mat.color;
  const u = mat.userData.uShade || (mat.userData.uShade = { value: new THREE.Vector3() });
  u.value.set(Math.min(1.6, shade.r / Math.max(b.r, 0.02)), Math.min(1.6, shade.g / Math.max(b.g, 0.02)), Math.min(1.6, shade.b / Math.max(b.b, 0.02)));
  return mat;
}
/* grain: { scale, amp } adds a fine woven-cloth grain by nudging the shading normal with a
 * 3D noise sampled in the mesh's own space (so it has the same density on every part, does
 * not depend on UVs and does not swim when the character moves). It fades out by itself
 * when the grain gets smaller than a pixel, so small thumbnails stay clean. */
const GRAIN_GLSL = `
uniform vec2 uGrain;
varying vec3 vCcPos;
float ccHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float ccNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( ccHash( i ), ccHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( ccHash( i + vec3( 0, 1, 0 ) ), ccHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( ccHash( i + vec3( 0, 0, 1 ) ), ccHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( ccHash( i + vec3( 0, 1, 1 ) ), ccHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z );
}
`;
/* How deep the colour shade goes, for every shaded material at once (1 = as designed).
 * A dim room at night lowers it so unlit areas fall darker instead of staying at their
 * bright shade colour; lit areas are unaffected. */
const SHADE_DIM = { value: 1 };
export function setShadeDim(v) {
  SHADE_DIM.value = v;
}
function colorShade(mat, shade, grain) {
  setShade(mat, shade);
  if (grain) mat.userData.uGrain = { value: new THREE.Vector2(grain.scale, grain.amp) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShade = mat.userData.uShade;
    shader.uniforms.uDim = SHADE_DIM;
    let frag = shader.fragmentShader.replace('void main() {', 'uniform vec3 uShade;\nuniform float uDim;\n' + (grain ? GRAIN_GLSL : '') + 'void main() {').replace(
      '#include <opaque_fragment>',
      `{
          const vec3 W = vec3( 0.2126, 0.7152, 0.0722 );
          float lit = dot( outgoingLight, W ) / max( dot( diffuseColor.rgb, W ), 1e-3 );
          float k = smoothstep( 0.42, 1.0, lit );
          vec3 shaded = diffuseColor.rgb * uShade * ( 0.86 + 0.14 * k ) * uDim;
          outgoingLight = mix( shaded, outgoingLight, k );
        }
        #include <opaque_fragment>`
    );
    if (grain) {
      shader.uniforms.uGrain = mat.userData.uGrain;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vCcPos;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vCcPos = position * vec3( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ), length( modelMatrix[ 2 ].xyz ) );`
        );
      frag = frag.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 q = vCcPos * uGrain.x;
          float fw = max( max( fwidth( q.x ), fwidth( q.y ) ), fwidth( q.z ) );
          float fade = 1.0 - smoothstep( 0.3, 0.9, fw );
          if ( fade > 0.0 ) {
            // long threads one way, short ones across: reads as weave rather than sand
            float h = ccNoise( q * vec3( 1.0, 0.28, 1.0 ) ) + 0.6 * ccNoise( q * vec3( 0.3, 1.7, 0.3 ) + 7.3 );
            vec3 sx = dFdx( - vViewPosition );
            vec3 sy = dFdy( - vViewPosition );
            vec3 r1 = cross( sy, normal );
            vec3 r2 = cross( normal, sx );
            float det = dot( sx, r1 ) * faceDirection;
            vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
            normal = normalize( abs( det ) * normal - uGrain.y * fade * grad );
          }
        }`
      );
    }
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => (grain ? 'colorShade+grain' : 'colorShade');
  return mat;
}
/** shade tuning per kind of surface */
const SHADE = {
  cloth: { hue: 0.1, sat: 0.2, dark: 0.76 },
  hard: { hue: 0.08, sat: 0.16, dark: 0.74 },
};
/** cloth grain: threads per unit and their height. o.grain overrides (false = smooth) */
const GRAIN = { scale: 150, amp: 0.0008 };
const grainOf = (o) => (o && o.grain === false ? null : Object.assign({}, GRAIN, o && o.grain));

function makeMaterials(kit, ctx, shared) {
  const cache = (key, make) => {
    if (!kit.mats.has(key)) kit.mats.set(key, kit.track(make()));
    return kit.mats.get(key);
  };
  const o2k = (o) => JSON.stringify(o || {}, (k, v) => (v && v.isTexture ? v.uuid : v));
  return {
    /** the character's skin (shared, do not modify) */
    skin: shared.skin,
    /** glossy toy hair in ctx.hair (or o.color) */
    hair: (o) =>
      cache('hair' + o2k(o), () => {
        o = o || {};
        const c = o.color || ctx.hair;
        return colorShade(physical({
          color: colorOf(c),
          roughness: o.roughness ?? 0.48,
          sheen: 0.7,
          sheenColor: colorOf(CC.color.light(c, 0.55)),
          sheenRoughness: 0.35,
          clearcoat: 0.12,
          clearcoatRoughness: 0.5,
          side: o.side ?? THREE.DoubleSide,
          map: o.map || null,
        }), shadeOf(c, { hue: 0.12, sat: 0.3, dark: 0.74 }));
      }),
    /** skin-like surface in any colour (noses, painted-on features made 3D). gloss: shiny ball */
    tone: (c, gloss) =>
      cache('tone' + c + (gloss ? 'g' : ''), () =>
        colorShade(
          physical({
            color: colorOf(c),
            roughness: gloss ? 0.3 : 0.58,
            clearcoat: gloss ? 0.55 : 0,
            clearcoatRoughness: 0.3,
            sheen: 0.3,
            sheenColor: colorOf('#ffffff'),
            sheenRoughness: 0.7,
          }),
          shadeOf(c)
        )
      ),
    /** soft fabric */
    cloth: (c, o) =>
      cache('cloth' + c + o2k(o), () => {
        o = o || {};
        return colorShade(physical({
          color: colorOf(c),
          roughness: o.roughness ?? 0.82,
          sheen: o.sheen ?? 0.6,
          sheenColor: colorOf(CC.color.light(c, 0.6)),
          sheenRoughness: 0.55,
          map: o.map || null,
          side: o.side ?? THREE.DoubleSide,
        }), shadeOf(c, SHADE.cloth), grainOf(o));
      }),
    /** shiny vinyl / plastic */
    plastic: (c, o) =>
      cache('plastic' + c + o2k(o), () => {
        o = o || {};
        return colorShade(physical({
          color: colorOf(c),
          roughness: o.roughness ?? 0.32,
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
          map: o.map || null,
          side: o.side ?? THREE.FrontSide,
        }), shadeOf(c, SHADE.hard));
      }),
    matte: (c, o) =>
      cache('matte' + c + o2k(o), () => {
        o = o || {};
        return colorShade(
          new THREE.MeshStandardMaterial({ color: colorOf(c), roughness: 0.92, map: o.map || null, side: o.side ?? THREE.FrontSide }),
          shadeOf(c, SHADE.cloth),
          grainOf(o)
        );
      }),
    rubber: (c, o) =>
      cache('rubber' + c + o2k(o), () => {
        o = o || {};
        return colorShade(physical({ color: colorOf(c), roughness: 0.6, clearcoat: 0.25, map: o.map || null }), shadeOf(c, SHADE.hard));
      }),
    metal: (c, o) =>
      cache('metal' + c + o2k(o), () => {
        o = o || {};
        return new THREE.MeshStandardMaterial({ color: colorOf(c), metalness: 0.85, roughness: o.roughness ?? 0.28 });
      }),
    /** see-through lens / glass. opacity 0..1 */
    glass: (c, opacity, o) =>
      cache('glass' + c + opacity + o2k(o), () => {
        o = o || {};
        return physical({
          color: colorOf(c),
          roughness: 0.05,
          metalness: 0,
          clearcoat: 1,
          transparent: true,
          opacity: opacity ?? 0.3,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }),
    /** unlit flat color (tiny details, emissive dots) */
    flat: (c, o) =>
      cache('flat' + c + o2k(o), () => new THREE.MeshBasicMaterial({ color: colorOf(c), side: (o && o.side) ?? THREE.FrontSide })),
    /** anything else: MeshPhysicalMaterial(params) (not cached) */
    custom: (params) => kit.track(physical(params)),
    /** give a custom material the cloth look (colour shading + grain); base = its overall colour */
    clothify: (mat, base, o) => colorShade(mat, shadeOf(base || '#ffffff', SHADE.cloth), grainOf(o)),
  };
}

/* ============================================================== scene materials */
/* The character's surfaces for the scenes around it (furniture, rooms), so props shade the
 * same way: colour shading instead of grey shadows, sheen and a woven grain on fabric.
 * Maps are luminance patterns on white, tinted by the colour. Cached for the page's life. */
const SCENE_MATS = new Map();
const sceneKey = (o) => JSON.stringify(o || {}, (k, v) => (v && v.isTexture ? v.uuid : v));
const sceneCached = (key, make) => {
  if (!SCENE_MATS.has(key)) SCENE_MATS.set(key, make());
  return SCENE_MATS.get(key);
};
export const sceneMat = {
  /** fabric. o: map, bump (+bumpScale), roughness, sheen, side, grain (false = smooth) */
  cloth: (c, o) =>
    sceneCached('cloth' + c + sceneKey(o), () => {
      o = o || {};
      const m = physical({
        color: colorOf(c),
        roughness: o.roughness ?? 0.9,
        sheen: o.sheen ?? 0.6,
        sheenColor: colorOf(CC.color.light(c, 0.6)),
        sheenRoughness: 0.6,
        map: o.map || null,
        side: o.side ?? THREE.FrontSide,
      });
      if (o.bump) {
        m.bumpMap = o.bump;
        m.bumpScale = o.bumpScale ?? 1;
      }
      return colorShade(m, shadeOf(c, SHADE.cloth), grainOf(o));
    }),
  /** oiled or painted wood: a soft satin highlight. o: map (grain), roughness, clearcoat */
  wood: (c, o) =>
    sceneCached('wood' + c + sceneKey(o), () => {
      o = o || {};
      return colorShade(
        physical({ color: colorOf(c), roughness: o.roughness ?? 0.6, clearcoat: o.clearcoat ?? 0.2, clearcoatRoughness: 0.45, map: o.map || null, side: o.side ?? THREE.FrontSide }),
        shadeOf(c, SHADE.hard)
      );
    }),
  /** glossy ceramic / plastic / lacquer */
  glossy: (c, o) =>
    sceneCached('glossy' + c + sceneKey(o), () => {
      o = o || {};
      return colorShade(physical({ color: colorOf(c), roughness: o.roughness ?? 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, map: o.map || null }), shadeOf(c, SHADE.hard));
    }),
  /** plant leaves: waxy, a little translucent-looking sheen */
  leaf: (c) => sceneCached('leaf' + c, () => colorShade(physical({ color: colorOf(c), roughness: 0.5, sheen: 0.4, sheenColor: colorOf(CC.color.light(c, 0.5)), clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide }), shadeOf(c, SHADE.hard))),
  metal: (c, o) => sceneCached('metal' + c + sceneKey(o), () => new THREE.MeshStandardMaterial({ color: colorOf(c), metalness: 0.85, roughness: (o && o.roughness) ?? 0.3 })),
  /** an uncached physical material with the scene shading (for ones that change at run time) */
  custom: (params, base, o) => colorShade(physical(params), shadeOf(base || params.color || '#ffffff', o && o.cloth ? SHADE.cloth : SHADE.hard), o && o.cloth ? grainOf(o) : null),
};

/* ============================================================== textures */
function makeTextures(kit) {
  const finish = (tex, o) => {
    o = o || {};
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (o.repeat) tex.repeat.set(o.repeat[0], o.repeat[1]);
    tex.anisotropy = 4;
    return kit.track(tex);
  };
  const canvas = (w, h, draw, o) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return finish(new THREE.CanvasTexture(c), o);
  };
  return {
    /** CanvasTexture from a 2D drawing callback (g, w, h) */
    canvas,
    /** horizontal stripes (along v). o.vertical for vertical stripes */
    stripes: (c1, c2, count, o) =>
      canvas(256, 256, (g, w, h) => {
        g.fillStyle = c1;
        g.fillRect(0, 0, w, h);
        g.fillStyle = c2;
        const n = count || 8;
        for (let i = 0; i < n; i++) {
          if (o && o.vertical) g.fillRect((i * w) / n, 0, w / n / 2, h);
          else g.fillRect(0, (i * h) / n, w, h / n / 2);
        }
      }, o),
    checker: (c1, c2, n, o) =>
      canvas(256, 256, (g, w, h) => {
        n = n || 8;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            g.fillStyle = (x + y) % 2 ? c2 : c1;
            g.fillRect((x * w) / n, (y * h) / n, w / n + 1, h / n + 1);
          }
      }, o),
    dots: (bg, dot, n, o) =>
      canvas(256, 256, (g, w, h) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.fillStyle = dot;
        n = n || 6;
        const s = w / n;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            g.beginPath();
            g.arc(x * s + s / 2 + (y % 2 ? s / 2 : 0), y * s + s / 2, s * 0.18, 0, Math.PI * 2);
            g.fill();
          }
      }, o),
    /** texture painted from an SVG string (async; character waits for it) */
    svg: (svgString, w, h, o) => {
      const c = document.createElement('canvas');
      c.width = w || 512;
      c.height = h || 512;
      const tex = finish(new THREE.CanvasTexture(c), o);
      kit.pending.push(
        CC.rasterize(svgString, c.width, c.height)
          .then((r) => {
            c.getContext('2d').drawImage(r, 0, 0);
            tex.needsUpdate = true;
          })
          .catch((e) => console.error('[CC3] svg texture failed', e))
      );
      return tex;
    },
  };
}

/* ============================================================== geometry helpers */
function place(obj, o) {
  if (!o) return obj;
  if (o.pos) obj.position.copy(V3(o.pos));
  if (o.rot) obj.rotation.set(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0, o.order || 'XYZ');
  if (o.scale != null) {
    if (typeof o.scale === 'number') obj.scale.setScalar(o.scale);
    else obj.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  if (o.name) obj.name = o.name;
  return obj;
}
function orientBetween(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 1e-6;
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return len;
}

function makeGeo(kit) {
  const T = (g) => kit.track(g);
  const mesh = (geo, mat, o) => place(new THREE.Mesh(T(geo), mat), o);
  // segments for curved shapes, scaled by the kit's detail (fewer for small, far-off characters)
  const D = kit.detail || 1;
  const S = (n, min = 6) => (D === 1 ? n : Math.max(min, Math.round(n * D)));
  const G = {
    segs: S, // (not "S": the face parts' painting helpers use that name)
    mesh,
    group(...children) {
      const g = new THREE.Group();
      children.flat().filter(Boolean).forEach((c) => g.add(c));
      return g;
    },
    place,
    sphere: (r, mat, o) => mesh(new THREE.SphereGeometry(r, S((o && o.seg) || 40, 8), S(Math.max(12, Math.round(((o && o.seg) || 40) * 0.75)), 6)), mat, o),
    /** ellipsoid with radii rx, ry, rz */
    ellipsoid: (rx, ry, rz, mat, o) => {
      const m = mesh(new THREE.SphereGeometry(1, S((o && o.seg) || 40, 8), S(30, 6)), mat, o);
      m.scale.set(rx, ry, rz);
      return m;
    },
    /** capsule between points a and b ([x,y,z]) */
    capsule(a, b, r, mat, o) {
      const A = V3(a);
      const B = V3(b);
      const len = A.distanceTo(B);
      const m = new THREE.Mesh(T(new THREE.CapsuleGeometry(r, Math.max(0.0001, len), S(10, 3), S((o && o.seg) || 24, 6))), mat);
      orientBetween(m, A, B);
      if (o && o.name) m.name = o.name;
      return m;
    },
    /** cylinder / frustum between a (radius rA) and b (radius rB). o.open: no caps */
    cylinder(a, b, rA, rB, mat, o) {
      const A = V3(a);
      const B = V3(b);
      const len = A.distanceTo(B);
      // CylinderGeometry top (+Y) = radiusTop; we orient +Y from a toward b, so top = b
      const m = new THREE.Mesh(T(new THREE.CylinderGeometry(rB, rA, len, S((o && o.seg) || 28, 6), 1, !!(o && o.open))), mat);
      orientBetween(m, A, B);
      return m;
    },
    cone: (a, b, r, mat, o) => G.cylinder(a, b, r, 0.0001, mat, o),
    /** torus in the XY plane (rotate with o.rot). o.arc = radians */
    torus: (R, tube, mat, o) =>
      mesh(new THREE.TorusGeometry(R, tube, S((o && o.radial) || 14, 4), S((o && o.tubular) || 48, 8), (o && o.arc) || Math.PI * 2), mat, o),
    /** rounded box */
    box: (w, h, d, mat, o) => mesh(new RoundedBoxGeometry(w, h, d, S(4, 1), Math.min((o && o.radius) ?? 0.03, w / 2, h / 2, d / 2)), mat, o),
    /** lathe around Y from [[r,y],...] (smoothed). u=0.5 is the front (+Z). o.depth scales z */
    lathe(profile, mat, o) {
      o = o || {};
      let pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
      if (o.smooth !== false && pts.length > 2) pts = new THREE.SplineCurve(pts).getSpacedPoints(S(o.samples || 48, 8));
      pts = pts.map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
      const m = mesh(new THREE.LatheGeometry(pts, S(o.seg || 48, 8), Math.PI, Math.PI * 2), mat, o);
      if (o.depth) m.scale.z *= o.depth;
      return m;
    },
    /**
     * tube along a smooth curve through points [[x,y,z],...]; radius is a number
     * or a function (t in 0..1) => r. o.caps adds sphere caps at both ends.
     */
    tube(points, radius, mat, o) {
      o = o || {};
      const curve = new THREE.CatmullRomCurve3(points.map(V3), !!o.closed, 'centripetal');
      const seg = S(o.seg || 48, 6);
      const radial = S(o.radial || 16, 5);
      const r0 = typeof radius === 'function' ? 1 : radius;
      const geo = new THREE.TubeGeometry(curve, seg, r0, radial, !!o.closed);
      if (typeof radius === 'function') {
        const pos = geo.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          const c = curve.getPointAt(t);
          const r = radius(t);
          for (let j = 0; j <= radial; j++) {
            const k = i * (radial + 1) + j;
            v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
            pos.setXYZ(k, v.x, v.y, v.z);
          }
        }
        geo.computeVertexNormals();
      }
      const m = mesh(geo, mat);
      if (o.caps && !o.closed) {
        const g = new THREE.Group();
        g.add(m);
        const rs = typeof radius === 'function' ? radius(0) : radius;
        const re = typeof radius === 'function' ? radius(1) : radius;
        if (rs > 0.002) g.add(G.sphere(rs, mat, { pos: curve.getPointAt(0), seg: 20 }));
        if (re > 0.002) g.add(G.sphere(re, mat, { pos: curve.getPointAt(1), seg: 20 }));
        return place(g, o);
      }
      return place(m, o);
    },
    /** flat 2D shape from [[x,y],...] (or a THREE.Shape), extruded by depth along +Z (centered) */
    extrude(shape, depth, mat, o) {
      o = o || {};
      let sh = shape;
      if (Array.isArray(shape)) {
        sh = new THREE.Shape();
        shape.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
      }
      const bevel = o.bevel ?? Math.min(0.02, depth * 0.4);
      const geo = new THREE.ExtrudeGeometry(sh, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: S(3, 1),
        curveSegments: S(o.curveSegments || 24, 6),
      });
      geo.translate(0, 0, -depth / 2);
      return mesh(geo, mat, o);
    },
    /** new THREE.Shape() for custom outlines (use moveTo/lineTo/quadraticCurveTo/bezierCurveTo) */
    shape: () => new THREE.Shape(),
    /** flat plane (w x h) facing +Z */
    plane: (w, h, mat, o) => mesh(new THREE.PlaneGeometry(w, h), mat, o),
    /** fn(sign) for sign=-1 (viewer's left) and +1 (right), grouped */
    both(fn) {
      return G.group(fn(-1, 'L'), fn(1, 'R'));
    },
  };
  return G;
}

/* head-space helpers */
function makeHeadHelpers(G) {
  const up = new THREE.Vector3(0, 1, 0);
  return {
    /** unit direction for (az, el) in degrees */
    dir: (az, el) => headDir(az, el),
    /** point on a sphere of radius r (default 1 = skin surface) */
    at: (az, el, r = 1) => headDir(az, el).multiplyScalar(r),
    /**
     * Put obj on the head at (az, el, radius r). Local +Z points outward (surface normal),
     * local +Y points up along the surface toward the crown, local +X toward the viewer's right.
     * spin rotates around the normal (radians).
     */
    stick(obj, az, el, r = 1, spin = 0) {
      const z = headDir(az, el);
      let x = new THREE.Vector3().crossVectors(up, z);
      if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
      x.normalize();
      const y = new THREE.Vector3().crossVectors(z, x).normalize();
      const m = new THREE.Matrix4().makeBasis(x, y, z);
      obj.quaternion.setFromRotationMatrix(m);
      if (spin) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
      obj.position.copy(z.multiplyScalar(r));
      return obj;
    },
    /** spherical shell patch: az [from,to], el [from,to] (from < to), radius r */
    shell({ az = [-180, 180], el = [-90, 90], r = 1.06, mat, seg = 64 } = {}) {
      const [a0, a1] = az;
      const [e0, e1] = el;
      seg = G.segs(seg, 8);
      const geo = new THREE.SphereGeometry(
        r,
        seg,
        Math.max(8, Math.round(seg * 0.6)),
        (a0 + 90) * DEG,
        (a1 - a0) * DEG,
        (90 - e1) * DEG,
        (e1 - e0) * DEG
      );
      return G.mesh(geo, mat);
    },
  };
}

/* clothing shells that hug the base body (character space) */
function makeShellHelpers(G) {
  return {
    /**
     * Lathe following the torso profile between y=from (hem) and y=to (top), pushed out
     * by inflate; flare widens toward the hem. Closed at the very bottom/top of the torso.
     * o.depth overrides the z squash (default A3.torsoDepth). u=0.5 = front center.
     */
    torso({ from = A3.torsoBottom, to = A3.torsoTop, inflate = 0.035, flare = 0, flarePow = 2, mat, seg = 56, depth } = {}) {
      const n = G.segs(40, 12);
      const pts = [];
      const closeBottom = from <= A3.torsoBottom + 0.005;
      const closeTop = to >= A3.torsoTop - 0.005;
      if (closeBottom) pts.push([0, A3.torsoBottom - inflate * 0.6]);
      for (let i = 0; i <= n; i++) {
        const y = from + ((to - from) * i) / n;
        const k = Math.pow(1 - i / n, flarePow);
        pts.push([torsoRadiusAt(y) + inflate + flare * k, y]);
      }
      if (closeTop) pts.push([0, A3.torsoTop + inflate * 0.6]);
      const m = G.lathe(pts, mat, { smooth: false, seg });
      m.scale.z = depth ?? A3.torsoDepth;
      return m;
    },
    /** horizontal ring (hem / waistband / collar) hugging the torso at height y */
    ring(y, inflate, tube, mat, o) {
      const R = torsoRadiusAt(y) + (inflate ?? 0.04);
      const m = G.torus(R, tube || 0.03, mat, { radial: 12, tubular: 56 });
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      m.scale.set(1, 1, 1);
      const g = new THREE.Group();
      g.add(m);
      g.scale.z = (o && o.depth) ?? A3.torsoDepth;
      return g;
    },
    /** sleeve along the arm from t0 to t1 (0 shoulder, 1 hand center). Attach to armL/armR. */
    sleeve(side, t0, t1, inflate, mat, o) {
      o = o || {};
      const a = armPoint(side, t0);
      const b = armPoint(side, t1);
      const r0 = A3.armRadius + (inflate ?? 0.04);
      const r1 = r0 + (o.flare || 0);
      const g = new THREE.Group();
      g.add(G.cylinder(a, b, r0, r1, mat, { open: true, seg: 28 }));
      if (o.cap !== false) g.add(G.sphere(r0, mat, { pos: a, seg: 28 }));
      if (o.cuff) {
        const cuff = G.torus(r1, o.cuff, o.cuffMat || mat, { radial: 10, tubular: 32 });
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        cuff.position.copy(b);
        g.add(cuff);
      }
      return g;
    },
    /** pant leg from t0 to t1 (0 hip, 1 ankle). */
    leg(side, t0, t1, inflate, mat, o) {
      o = o || {};
      const a = legPoint(side, t0);
      const b = legPoint(side, t1);
      const r0 = A3.legRadius + (inflate ?? 0.035);
      const r1 = r0 + (o.flare || 0);
      const g = new THREE.Group();
      g.add(G.cylinder(a, b, r0, r1, mat, { open: true, seg: 28 }));
      if (o.cap !== false) g.add(G.sphere(r0, mat, { pos: a, seg: 28 }));
      if (o.cuff) {
        const cuff = G.torus(r1, o.cuff, o.cuffMat || mat, { radial: 10, tubular: 32 });
        cuff.rotation.x = Math.PI / 2;
        cuff.position.copy(b);
        g.add(cuff);
      }
      return g;
    },
  };
}

/* ============================================================== ctx */
/* which state field each shared colour of the context comes from */
const COLOR_SOURCE = {
  skin: 'skin', skinShade: 'skin', skinLight: 'skin', skinLine: 'skin', blush: 'skin', featureInk: 'skin', mouthRed: 'skin',
  hair: 'hairColor', hairShade: 'hairColor', hairLight: 'hairColor', hairLine: 'hairColor', browColor: 'hairColor',
  eye: 'eyeColor',
};
/**
 * reads(key), when given, is told every state field the part looks at — the shared colours
 * (skin, hair, eyes) and anything it takes from ctx.state — so the character knows which
 * changes mean the part must be built again, and leaves it alone for the others.
 */
function makeCtx(state, cat, kit, shared, reads) {
  let ctx = CC.makeColorCtx(state);
  if (cat && cat.colorKey) ctx = CC.withColor(ctx, state[cat.colorKey] || CC.DEFAULT_COLORS[cat.colorKey]);
  if (reads) {
    Object.keys(COLOR_SOURCE).forEach((k) => {
      const v = ctx[k];
      Object.defineProperty(ctx, k, {
        enumerable: true,
        get() {
          reads(COLOR_SOURCE[k]);
          return v;
        },
      });
    });
    ctx.state = new Proxy(state, {
      get(t, k) {
        if (typeof k === 'string') reads(k);
        return t[k];
      },
    });
  }
  const G = makeGeo(kit);
  Object.assign(ctx, G, {
    THREE,
    A: A3,
    DEG,
    v3: V3,
    mat: makeMaterials(kit, ctx, shared),
    tex: makeTextures(kit),
    head: makeHeadHelpers(G),
    shell: makeShellHelpers(G),
    arm: { point: armPoint },
    leg: { point: legPoint },
    torsoRadiusAt,
    is3D: true,
  });
  return ctx;
}

/* ============================================================== face texture cache */
const FACE_W = 1024;
const FACE_H = 666;
const faceCache = new Map(); // key -> Promise<{open, blink}>
function faceKey(state) {
  return JSON.stringify([CC.FACE_CATS.map((k) => state[k]), state.eyeColor, state.hairColor, state.skin]);
}
function getFaceCanvases(state) {
  const key = faceKey(state);
  if (faceCache.has(key)) return faceCache.get(key);
  const p = Promise.all([
    CC.rasterize(CC.faceSVG(state), FACE_W, FACE_H),
    CC.rasterize(CC.faceSVG(state, { blink: true }), FACE_W, FACE_H),
  ]).then(([open, blink]) => ({ open, blink }));
  faceCache.set(key, p);
  if (faceCache.size > 80) faceCache.delete(faceCache.keys().next().value);
  p.catch(() => faceCache.delete(key));
  return p;
}

/* ============================================================== Character */
const BONES = ['head', 'body', 'armL', 'armR'];

export class Character {
  /**
   * o.detail: share of the usual segments (1 = full; ~0.5 for small figures in a crowd).
   * o.partDetail: a further share for some parts, by category ({ shoes: 0.6 }): what is
   * smallest on screen can be coarser than the rest.
   */
  constructor(o) {
    this.detail = (o && o.detail) || 1;
    this.partDetail = (o && o.partDetail) || {};
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.armL = new THREE.Group();
    this.armL.position.copy(V3(A3.shoulderL));
    this.armR = new THREE.Group();
    this.armR.position.copy(V3(A3.shoulderR));
    this.headPivot = new THREE.Group();
    this.headPivot.position.copy(V3(A3.headPivot));
    this.head = new THREE.Group();
    this.head.position.copy(V3(A3.headOffset));
    this.head.scale.set(...A3.headScale);
    this.headPivot.add(this.head);
    this.body.add(this.armL, this.armR, this.headPivot);

    this.shared = {
      skin: physical({ color: colorOf(CC.DEFAULT_COLORS.skin), roughness: 0.62, sheen: 0.35, sheenColor: colorOf('#ffffff'), sheenRoughness: 0.7 }),
    };
    this.shared.skin.userData.shared = true;
    colorShade(this.shared.skin, shadeOf(CC.DEFAULT_COLORS.skin));
    this.baseKit = new Kit(this.detail);
    this._retired = []; // replaced parts, freed after the next frame (rendered())
    this.base = {};
    this._buildBase();

    // face decal
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = FACE_W;
    this.faceCanvas.height = FACE_H;
    this.blinkCanvas = document.createElement('canvas');
    this.blinkCanvas.width = FACE_W;
    this.blinkCanvas.height = FACE_H;
    this.faceTex = this._faceTexture(this.faceCanvas);
    this.blinkTex = this._faceTexture(this.blinkCanvas);
    const fd = this.detail;
    const faceGeo = new THREE.SphereGeometry(1.004, Math.max(24, Math.round(96 * fd)), Math.max(16, Math.round(64 * fd)), 20 * DEG, 140 * DEG, 54 * DEG, 90 * DEG);
    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTex,
      transparent: true,
      roughness: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.faceMesh = new THREE.Mesh(faceGeo, this.faceMat);
    this.faceMesh.renderOrder = 2;
    this.faceMesh.receiveShadow = true;
    this.head.add(this.faceMesh);

    this.warp = { head: null, body: null, key: '[null,null]' };
    this.lift = 0; // how far the head centre sits above its standard height (body shapes, proportions)
    this.prop = normalizeProportions(Object.assign({}, PROP_DEFAULT, TUNING.character));
    this.headSize = this.prop.head;
    this.parts = {}; // catKey -> { key, kit, objs: [], hide: [] }
    this.state = null;
    this._faceKey = null;
    this.held = { L: false, R: false }; // an accessory is carried in that hand
    this._grid = null; // how far the head + hair reach in each direction (see _headGrid)
    /*
     * Scene pose layer, read every tick (the workshop leaves it null):
     *   arm(side, t) -> null | { hand: [x, y, z] relative to the shoulder in body space,
     *                            pole?: [x, y, z] where the elbow leans, flex?, dev? }
     *   head: { x, y, z } radians added on top of the idle head sway
     *   eyes: 'closed' holds the blink frame
     *   leg(side, t) -> null | { hip: [x, y, z] radians (x < 0 swings the thigh forward),
     *                            knee: radians (> 0 bends the shin back), ankle: radians (> 0 points the toes) }
     */
    this.pose = null;

    // animation state
    this.anim = {
      t: 0, pop: 9, hop: 9, wave: 9, spin: 9, nextBlink: 2, blinkUntil: 0, yaw: 0,
      waveSide: 'R', glance: 0, glanceTo: 0, glanceUntil: 0, nextGlance: 4, lastYaw: 0, flare: 0,
    };
    this.rig = { L: this._makeRig('L'), R: this._makeRig('R') };
    this.legRig = this._makeLegRig();
    this._applyShape({});
    this.restPose();
  }

  /** bones + spring state of one arm. The arm group sits on the shoulder and is the root. */
  _makeRig(side) {
    const g = side === 'L' ? this.armL : this.armR;
    const bones = [new THREE.Bone()];
    ARM_JOINTS.forEach(() => {
      const b = new THREE.Bone();
      bones[bones.length - 1].add(b);
      bones.push(b);
    });
    const skin = new THREE.Group(); // the skinned copies that are actually drawn
    g.add(bones[0], skin);
    return {
      side,
      sx: side === 'L' ? -1 : 1,
      g,
      bones,
      skin,
      skeleton: new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())),
      rest: new THREE.Vector3(), // shoulder -> hand centre in the modelled (straight) pose
      axis: new THREE.Vector3(),
      hinge: new THREE.Vector3(),
      side2: new THREE.Vector3(),
      len: ARM_LEN,
      qRestInv: new THREE.Quaternion(),
      pos: new THREE.Vector3(), // spring: where the hand is heading
      vel: new THREE.Vector3(),
    };
  }

  /** place the joints along the (possibly body-shaped) arm */
  _layoutRig(rig, sh, hd) {
    rig.rest.subVectors(hd, sh);
    rig.len = rig.rest.length();
    rig.axis.copy(rig.rest).normalize();
    const pole = new THREE.Vector3(REST_POLE[0] * rig.sx, REST_POLE[1], REST_POLE[2]);
    const perp = pole.addScaledVector(rig.axis, -pole.dot(rig.axis)).normalize();
    rig.hinge.crossVectors(perp, rig.axis).normalize();
    rig.side2.crossVectors(rig.axis, rig.hinge);
    rig.qRestInv.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rig.axis, rig.hinge, rig.side2)).invert();
    let prev = 0;
    rig.skeleton.boneInverses[0].identity();
    ARM_JOINTS.forEach((j, k) => {
      rig.bones[k + 1].position.copy(rig.axis).multiplyScalar((j.t - prev) * rig.len);
      const at = rig.axis.clone().multiplyScalar(-j.t * rig.len);
      rig.skeleton.boneInverses[k + 1].makeTranslation(at.x, at.y, at.z);
      prev = j.t;
    });
  }

  /**
   * Draw an arm attachment through the arm's bones. The original meshes stay (hidden) as
   * the source for shape warps; what is rendered is a copy baked into the arm's space and
   * skinned. rigid: the whole thing rides the hand (a cup, a laptop) instead of bending.
   */
  _skin(boneName, wrap, rigid) {
    const rig = this.rig[boneName === 'armL' ? 'L' : 'R'];
    this._unskin(wrap);
    const list = (wrap.userData.skins = []);
    wrap.visible = false;
    const last = rig.bones.length - 1;
    const M = new THREE.Matrix4();
    wrap.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
      let shown = true;
      M.identity();
      for (let o = m; o && o !== rig.g; o = o.parent) {
        if (o !== wrap && !o.visible) shown = false;
        o.updateMatrix();
        M.premultiply(o.matrix);
      }
      const geo = m.geometry.clone().applyMatrix4(M);
      if (M.determinant() < 0) flipWinding(geo);
      const pos = geo.attributes.position;
      const n = pos.count;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        let b = last;
        let u = 0;
        if (!rigid) {
          const t = (pos.getX(i) * rig.axis.x + pos.getY(i) * rig.axis.y + pos.getZ(i) * rig.axis.z) / rig.len;
          b = 0;
          for (let k = 0; k < ARM_JOINTS.length; k++) {
            const j = ARM_JOINTS[k];
            if (t >= j.t + j.h) b = k + 1;
            else {
              if (t > j.t - j.h) u = sstep((t - (j.t - j.h)) / (2 * j.h));
              break;
            }
          }
        }
        si[i * 4] = b;
        sw[i * 4] = 1 - u;
        si[i * 4 + 1] = Math.min(last, b + 1);
        sw[i * 4 + 1] = u;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      const sm = new THREE.SkinnedMesh(geo, m.material);
      sm.castShadow = m.castShadow;
      sm.receiveShadow = m.receiveShadow;
      sm.renderOrder = m.renderOrder;
      sm.frustumCulled = false;
      sm.visible = shown;
      sm.userData.src = m;
      sm.bind(rig.skeleton, IDENT);
      rig.skin.add(sm);
      list.push(sm);
    });
  }

  _unskin(wrap) {
    (wrap.userData.skins || []).forEach((sm) => {
      if (sm.parent) sm.parent.remove(sm);
      sm.geometry.dispose();
    });
    wrap.userData.skins = null;
  }

  /** one skeleton for both legs: [root, L pivot, L joints..., R pivot, R joints...], in body space */
  _makeLegRig() {
    const group = new THREE.Group();
    group.name = 'legRig';
    const root = new THREE.Bone();
    group.add(root);
    const bones = [root];
    const sides = {};
    ['L', 'R'].forEach((side) => {
      const chain = [new THREE.Bone()];
      root.add(chain[0]);
      LEG_JOINTS.forEach(() => {
        const b = new THREE.Bone();
        chain[chain.length - 1].add(b);
        chain.push(b);
      });
      sides[side] = {
        side,
        base: bones.length, // index of the pivot bone in the skeleton
        bones: chain,
        pivot: new THREE.Vector3(),
        axis: new THREE.Vector3(0, -1, 0),
        len: 0.62,
        cur: { x: 0, y: 0, z: 0, knee: 0, ankle: 0 },
      };
      bones.push(...chain);
    });
    this.body.add(group);
    return { group, root, bones, L: sides.L, R: sides.R, skeleton: new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())) };
  }

  /** place the leg joints for the current body shape (move: rest point -> shaped point) */
  _layoutLegs(move) {
    const lr = this.legRig;
    lr.skeleton.boneInverses[0].identity();
    ['L', 'R'].forEach((side) => {
      const rig = lr[side];
      const hip = move(side === 'L' ? A3.hipL : A3.hipR);
      const ankle = move(side === 'L' ? A3.ankleL : A3.ankleR);
      rig.pivot.copy(hip);
      rig.pivot.y -= LEG_DROP;
      rig.axis.subVectors(ankle, rig.pivot);
      rig.len = rig.axis.length();
      rig.axis.normalize();
      rig.bones[0].position.copy(rig.pivot);
      lr.skeleton.boneInverses[rig.base].makeTranslation(-rig.pivot.x, -rig.pivot.y, -rig.pivot.z);
      let prev = 0;
      LEG_JOINTS.forEach((j, k) => {
        rig.bones[k + 1].position.copy(rig.axis).multiplyScalar((j.t - prev) * rig.len);
        const at = rig.axis.clone().multiplyScalar(j.t * rig.len).add(rig.pivot);
        lr.skeleton.boneInverses[rig.base + k + 1].makeTranslation(-at.x, -at.y, -at.z);
        prev = j.t;
      });
    });
  }

  /** skeleton weights for a body-space point: up to 4 [bone, weight] pairs */
  _legWeights(x, y, z, out) {
    const lr = this.legRig;
    const wR = sstep((x + LEG_MID) / (2 * LEG_MID));
    const acc = out || new Map();
    acc.clear();
    const add = (i, w) => w > 1e-4 && acc.set(i, (acc.get(i) || 0) + w);
    let root = 0;
    [
      [lr.L, 1 - wR],
      [lr.R, wR],
    ].forEach(([rig, sw]) => {
      if (sw <= 0) return;
      const below = rig.pivot.y - y;
      const legW = sstep((below - LEG_BLEND.top) / LEG_BLEND.span);
      root += sw * (1 - legW);
      if (legW <= 0) return;
      const t = ((x - rig.pivot.x) * rig.axis.x + (y - rig.pivot.y) * rig.axis.y + (z - rig.pivot.z) * rig.axis.z) / rig.len;
      let b = 0;
      let u = 0;
      for (let k = 0; k < LEG_JOINTS.length; k++) {
        const j = LEG_JOINTS[k];
        if (t >= j.t + j.h) b = k + 1;
        else {
          if (t > j.t - j.h) u = sstep((t - (j.t - j.h)) / (2 * j.h));
          break;
        }
      }
      const last = LEG_JOINTS.length;
      add(rig.base + b, sw * legW * (1 - u));
      add(rig.base + Math.min(last, b + 1), sw * legW * u);
    });
    add(0, root);
    return acc;
  }

  /**
   * Draw the meshes under obj (attached to the body) through the leg bones. Each mesh that
   * reaches below the torso gets a skinned copy as its child, so the original's visibility
   * (and any part logic that toggles it) still applies; the original moves to a hidden layer.
   */
  _skinLegs(obj) {
    this._unskinLegs(obj);
    const lr = this.legRig;
    const limit = Math.max(lr.L.pivot.y, lr.R.pivot.y) - LEG_BLEND.top;
    const M = new THREE.Matrix4();
    const acc = new Map();
    const meshes = [];
    obj.traverse((m) => m.isMesh && !m.isSkinnedMesh && !m.isInstancedMesh && m.geometry && m.geometry.attributes.position && meshes.push(m));
    meshes.forEach((m) => {
      M.identity();
      for (let o = m; o && o !== this.body; o = o.parent) {
        o.updateMatrix();
        M.premultiply(o.matrix);
      }
      const geo = m.geometry.clone().applyMatrix4(M);
      geo.computeBoundingBox();
      if (geo.boundingBox.min.y > limit) {
        geo.dispose();
        return;
      }
      if (M.determinant() < 0) flipWinding(geo);
      const pos = geo.attributes.position;
      const n = pos.count;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        this._legWeights(pos.getX(i), pos.getY(i), pos.getZ(i), acc);
        const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = top.reduce((s, e) => s + e[1], 0) || 1;
        top.forEach(([bi, w], k) => {
          si[i * 4 + k] = bi;
          sw[i * 4 + k] = w / sum;
        });
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      const sm = new THREE.SkinnedMesh(geo, m.material);
      sm.castShadow = m.castShadow;
      sm.receiveShadow = m.receiveShadow;
      sm.renderOrder = m.renderOrder;
      sm.frustumCulled = false;
      sm.userData.legSkinOf = m;
      sm.bind(lr.skeleton, IDENT);
      m.add(sm);
      m.userData.legSkin = sm;
      m.layers.set(HIDDEN_LAYER);
    });
  }

  _unskinLegs(obj) {
    const found = [];
    obj.traverse((m) => m.userData && m.userData.legSkin && found.push(m));
    found.forEach((m) => {
      const sm = m.userData.legSkin;
      m.remove(sm);
      sm.geometry.dispose();
      m.userData.legSkin = null;
      m.layers.set(0);
    });
  }

  _faceTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData.shared = true;
    return t;
  }

  _buildBase() {
    const kit = this.baseKit;
    const G = makeGeo(kit);
    const skin = this.shared.skin;
    const b = this.base;
    // torso
    const torsoPts = A3.torsoProfile.map(([r, y]) => [r, y]);
    b.torso = G.lathe(torsoPts, skin, { samples: 64, depth: A3.torsoDepth });
    // neck
    b.neck = G.cylinder([0, A3.neck.y0, 0], [0, A3.neck.y1, 0], A3.neck.r, A3.neck.r * 0.95, skin);
    // legs + feet. The legs are lathes with many rows (a capsule has none along its length)
    // so they can bend at the knee.
    const leg = (hip, ankle) => {
      const r = A3.legRadius;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const a = -Math.PI / 2 + (k / 8) * (Math.PI / 2);
        pts.push([r * Math.cos(a), ankle[1] + r * Math.sin(a)]);
      }
      for (let k = 1; k <= 30; k++) pts.push([r, ankle[1] + ((hip[1] - ankle[1]) * k) / 30]);
      for (let k = 1; k <= 8; k++) {
        const a = (k / 8) * (Math.PI / 2);
        pts.push([r * Math.cos(a), hip[1] + r * Math.sin(a)]);
      }
      const m = G.lathe(pts, skin, { smooth: false, seg: 28 });
      m.position.set(hip[0], 0, hip[2]);
      return m;
    };
    b.legs = G.group(leg(A3.hipL, A3.ankleL), leg(A3.hipR, A3.ankleR));
    const foot = (pos) => {
      const m = G.mesh(warpGeometry(new THREE.SphereGeometry(1, G.segs(40, 10), G.segs(30, 8)), IDENT, IDENT, footShape), skin, { pos });
      m.scale.set(...A3.footSize);
      return m;
    };
    b.feet = G.group(foot(A3.footL), foot(A3.footR));
    this.body.add(b.torso, b.neck, b.legs, b.feet);
    // arms (built in character space, re-based to the shoulder pivots)
    const arm = (side) => {
      const sh = V3(side === 'L' ? A3.shoulderL : A3.shoulderR);
      const hd = V3(side === 'L' ? A3.handL : A3.handR);
      const dir = hd.clone().sub(sh);
      const len = dir.length();
      dir.normalize();
      // arm: tapers toward the wrist, with enough rows along it to bend smoothly
      const pts = [];
      for (let k = 30; k >= 1; k--) {
        const u = (k / 30) * 0.95;
        pts.push([A3.armRadius - 0.017 * Math.pow(u, 1.4), -len * u]);
      }
      for (let k = 0; k <= 8; k++) {
        const t = (k / 8) * (Math.PI / 2);
        pts.push([A3.armRadius * Math.cos(t), A3.armRadius * Math.sin(t)]);
      }
      const armMesh = G.lathe(pts, skin, { smooth: false, seg: 28 });
      armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      armMesh.position.copy(sh);
      // hand: a mitten. The palm faces the thigh, the thumb sits on the front edge.
      const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
      const up = dir.clone().negate();
      const palm = G.ellipsoid(0.1, 0.143, 0.127, skin);
      palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fwd), up, fwd));
      palm.position.copy(hd).addScaledVector(dir, 0.014);
      const thumb = G.ellipsoid(0.044, 0.074, 0.046, skin, { seg: 24 });
      const along = dir.clone().multiplyScalar(0.78).addScaledVector(fwd, 0.62).normalize();
      thumb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
      thumb.position.copy(hd).addScaledVector(fwd, 0.1).addScaledVector(dir, -0.012);
      const hand = G.group(palm, thumb);
      const wrap = new THREE.Group();
      wrap.position.copy(sh).multiplyScalar(-1);
      wrap.add(armMesh, hand);
      return { wrap, armMesh, hand };
    };
    const L = arm('L');
    const R = arm('R');
    this.armL.add(L.wrap);
    this.armR.add(R.wrap);
    b.armWraps = [L.wrap, R.wrap];
    b.arms = [L.armMesh, R.armMesh];
    b.hands = [L.hand, R.hand];
    // head + ears
    b.headMesh = G.sphere(1, skin, { seg: 72 });
    b.headMesh.name = 'skull'; // the hats and the hair measure themselves against it
    const ear = (az) => {
      const e = G.ellipsoid(0.18, 0.255, 0.16, skin);
      const p = headDir(az, -7).multiplyScalar(0.96);
      e.position.copy(p);
      e.rotation.y = az * DEG;
      return e;
    };
    b.ears = [ear(-88), ear(88)];
    this.head.add(b.headMesh, ...b.ears);
    this._shadowize(this.root);
  }

  _shadowize(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const transparent = mats.some((m) => m && m.transparent);
      if (o === this.faceMesh) return;
      o.castShadow = !transparent && !o.userData.noShadow;
      o.receiveShadow = true;
    });
  }

  /** warp an object already attached to a bone with the current face / body shape */
  _warpBone(bone, obj) {
    const w = this.warp;
    if (bone === 'head') {
      if (w.head) warpTree(obj, this.head, w.head);
      else warpTree(obj, this.head, null);
      return;
    }
    if (bone === 'armL' || bone === 'armR') {
      const g = bone === 'armL' ? this.armL : this.armR;
      const sh = V3(bone === 'armL' ? A3.shoulderL : A3.shoulderR);
      const pre = new THREE.Matrix4().makeTranslation(sh.x, sh.y, sh.z);
      const post = new THREE.Matrix4().makeTranslation(g.position.x, g.position.y, g.position.z);
      warpTree(obj, g, w.body, pre, post);
      return;
    }
    warpTree(obj, this.body, w.body);
  }

  /** face / body shape: move the pivots and re-warp the base meshes when the shape changes */
  _applyShape(state) {
    const p = this.prop;
    const key = JSON.stringify([state.faceShape || null, state.bodyShape || null, isPlainProp(p) ? null : p]);
    if (key === this.warp.key && this._shaped) return;
    this._shaped = true;
    const head = CC.headWarp ? CC.headWarp(state) : null;
    const body = proportionWarp(CC.bodyWarp ? CC.bodyWarp(state) : null, p);
    this.warp = { head, body, key };
    const move = (q) => (body ? V3(body(q[0], q[1], q[2])) : V3(q));
    this.armL.position.copy(move(A3.shoulderL));
    this.armR.position.copy(move(A3.shoulderR));
    this.headPivot.position.copy(move(A3.headPivot));
    // the head (and everything on it) scales about the top of the neck
    this.headSize = p.head;
    this.headPivot.scale.setScalar(p.head);
    this.lift = this.headPivot.position.y + A3.headOffset[1] * p.head - A3.headCenter[1];
    const b = this.base;
    [b.headMesh, ...b.ears, this.faceMesh].forEach((m) => this._warpBone('head', m));
    [b.legs, b.feet].forEach((m) => this._unskinLegs(m));
    [b.torso, b.neck, b.legs, b.feet].forEach((m) => this._warpBone('body', m));
    this._layoutLegs(move);
    [b.legs, b.feet].forEach((m) => this._skinLegs(m));
    this._layoutRig(this.rig.L, this.armL.position, move(A3.handL));
    this._layoutRig(this.rig.R, this.armR.position, move(A3.handR));
    ['armL', 'armR'].forEach((bone, i) => {
      this._warpBone(bone, b.armWraps[i]);
      this._skin(bone, b.armWraps[i]);
    });
    this._grid = null;
  }

  /** change the cast's proportions (rebuilds the parts); resolves like setState */
  setProportions(p) {
    this.prop = normalizeProportions(Object.assign({}, this.prop, p));
    return this.state ? this.setState(this.state, { animate: false }) : Promise.resolve(false);
  }

  /** how the camera frames should follow this character's size (see setCamera) */
  frameFit() {
    const top = this.headPivot.position.y + (A3.headOffset[1] + A3.headScale[1]) * this.headSize;
    const top0 = A3.headPivot[1] + A3.headOffset[1] + A3.headScale[1];
    return { head: this.headSize, height: top / top0 };
  }

  _boneFor(name) {
    return name === 'head' ? this.head : name === 'armL' ? this.armL : name === 'armR' ? this.armR : this.body;
  }

  _attach(boneName, obj) {
    const bone = this._boneFor(boneName);
    if (boneName === 'armL' || boneName === 'armR') {
      const wrap = new THREE.Group();
      wrap.position.copy(V3(boneName === 'armL' ? A3.shoulderL : A3.shoulderR)).multiplyScalar(-1);
      wrap.add(obj);
      bone.add(wrap);
      return wrap;
    }
    bone.add(obj);
    return obj;
  }

  /** what a part was built from: its own choice and colour, the shape, and the state fields it read */
  _catKey(cat, state, reads) {
    const deps = (CAT_DEPS[cat.key] || []).map((k) => state[k]);
    deps.push(this.warp.key);
    return JSON.stringify([state[cat.key], cat.colorKey ? state[cat.colorKey] : null, [...reads].sort().map((k) => [k, state[k]]), deps]);
  }

  /** apply a state; resolves when textures (face decal, svg textures) are ready */
  async setState(state, opts) {
    opts = opts || {};
    const prev = this.state;
    this.state = Object.assign({}, state);
    this.shared.skin.color.set(state.skin || CC.DEFAULT_COLORS.skin);
    setShade(this.shared.skin, shadeOf(state.skin || CC.DEFAULT_COLORS.skin));
    const pending = [];
    let changed = !prev;
    this._applyShape(state);

    CC.CATEGORIES.forEach((cat) => {
      if (cat.paletteOnly || cat.kind === 'bg') return;
      const cur = this.parts[cat.key];
      if (cur && cur.key === this._catKey(cat, state, cur.reads)) return;
      changed = true;
      if (cur) this._removePart(cat.key);
      // 'none' is nothing, even in a category with no 'none' item (bare feet at home)
      const part = CC.getPart(cat.key, state[cat.key]);
      if (!part || (state[cat.key] === 'none' && part.id !== 'none')) return;
      const kit = new Kit(this.detail * (this.partDetail[cat.key] || 1));
      // the same part built again starts from what it read last time (late reads included)
      const entry = { key: null, id: part.id, kit, objs: [], hide: [], reads: new Set(cur && cur.id === part.id ? cur.reads : []) };
      // a field first read after the part is built (in a texture callback, say): build again next time
      const reads = (k) => {
        if (entry.reads.has(k)) return;
        entry.reads.add(k);
        if (entry.key !== null) entry.key = '';
      };
      this.parts[cat.key] = entry;
      if (cat.kind === 'face') {
        // face parts may add optional 3D bits through { head: obj }
        let out = null;
        try {
          out = part.render(makeCtx(state, cat, kit, this.shared, reads));
        } catch (err) {
          (opts.onError || console.error)(cat.key, part.id, err);
        }
        if (out && typeof out === 'object' && !out.isObject3D) this._collect(entry, out, cat);
        entry.key = this._catKey(cat, state, entry.reads);
        return;
      }
      let out = null;
      try {
        out = part.render(makeCtx(state, cat, kit, this.shared, reads));
      } catch (err) {
        if (opts.onError) opts.onError(cat.key, part.id, err);
        else console.error('[CC3] part failed', cat.key, part.id, err);
      }
      entry.key = this._catKey(cat, state, entry.reads);
      if (!out) return;
      if (out.isObject3D) this._collect(entry, { [cat.attach || 'body']: out }, cat);
      else if (typeof out === 'object') this._collect(entry, out, cat);
      pending.push(...kit.pending);
    });

    // base visibility
    const hide = new Set();
    Object.values(this.parts).forEach((p) => p.hide.forEach((h) => hide.add(h)));
    const b = this.base;
    b.legs.visible = !hide.has('legs');
    b.feet.visible = !hide.has('feet');
    b.arms.forEach((m) => (m.visible = !hide.has('arms')));
    b.hands.forEach((m) => (m.visible = !hide.has('hands')));
    b.armWraps.forEach((w) =>
      (w.userData.skins || []).forEach((sm) => {
        const src = sm.userData.src;
        sm.visible = src.visible && (src.parent === w || src.parent.visible);
      })
    );
    this.held = { L: false, R: false };
    Object.values(this.parts).forEach((p) => p.held && p.held.forEach((k) => (this.held[k] = true)));
    b.ears.forEach((m) => (m.visible = !hide.has('ears')));
    b.torso.visible = !hide.has('torso');

    // face decal
    const fk = faceKey(state);
    if (fk !== this._faceKey) {
      changed = true;
      this._faceKey = fk;
      pending.push(
        getFaceCanvases(state).then(({ open, blink }) => {
          if (this._faceKey !== fk) return;
          const g1 = this.faceCanvas.getContext('2d');
          g1.clearRect(0, 0, FACE_W, FACE_H);
          g1.drawImage(open, 0, 0);
          const g2 = this.blinkCanvas.getContext('2d');
          g2.clearRect(0, 0, FACE_W, FACE_H);
          g2.drawImage(blink, 0, 0);
          this.faceTex.needsUpdate = true;
          this.blinkTex.needsUpdate = true;
        })
      );
    }
    if (changed) this._grid = null;
    if (changed && prev && opts.animate !== false) this.anim.pop = 0;
    await Promise.all(pending.map((p) => p.catch((e) => console.error(e))));
    return changed;
  }

  _collect(entry, out, cat) {
    BONES.forEach((bone) => {
      const obj = out[bone];
      if (!obj || !obj.isObject3D) return;
      obj.userData.cat = cat.key;
      this._shadowize(obj);
      const at = this._attach(bone, obj);
      this._warpBone(bone, at);
      if (bone === 'body' && LEG_SKIN_CATS.has(cat.key)) this._skinLegs(at);
      if (bone === 'armL' || bone === 'armR') {
        // sleeves bend with the arm; anything else on an arm is carried in the hand
        const carried = cat.key !== 'top';
        this._skin(bone, at, carried);
        if (carried) (entry.held || (entry.held = [])).push(bone === 'armL' ? 'L' : 'R');
      }
      entry.objs.push(at);
    });
    if (Array.isArray(out.hide)) entry.hide = out.hide.slice();
  }

  _removePart(catKey) {
    const e = this.parts[catKey];
    if (!e) return;
    e.objs.forEach((o) => {
      this._unskin(o);
      if (o.parent) o.parent.remove(o);
    });
    // Freeing the materials now would drop their shader programs, and the part that replaces
    // this one would have to compile the same programs again on its first frame (tens of
    // milliseconds, the hitch on every colour change). Keep them until that frame is drawn.
    this._retired.push(e);
    if (this._retired.length > 48) this.rendered(); // nobody is drawing this character
    delete this.parts[catKey];
  }

  /** call after drawing a frame: frees the parts replaced before it (see _removePart) */
  rendered() {
    if (!this._retired.length) return;
    this._retired.forEach((e) => {
      e.objs.forEach(disposeTree);
      e.kit.dispose();
    });
    this._retired = [];
  }

  /** trigger an animation: 'pop' | 'hop' | 'wave' | 'spin' */
  play(name) {
    const a = this.anim;
    if (!(name in a)) return;
    if (name === 'wave') {
      // wave with the free hand; keep waving if the arm is already up
      const side = this.held.R && !this.held.L ? 'L' : 'R';
      const up = a.wave > 0.3 && a.wave < WAVE.len - WAVE.down && side === a.waveSide;
      a.waveSide = side;
      a.wave = up ? 0.3 : 0;
      return;
    }
    a[name] = 0;
  }

  /**
   * How far the head and whatever is on it (hair, hat, ears) reach from the head centre,
   * per direction, in head space. Built lazily after the look changes; the hands use it
   * to stay outside. Capped so that big hair still leaves the arm somewhere to go.
   */
  _headGrid() {
    if (this._grid) return this._grid;
    const NA = HEAD_GRID.na;
    const NE = HEAD_GRID.ne;
    const raw = new Float32Array(NA * NE).fill(1);
    const M = new THREE.Matrix4();
    const v = new THREE.Vector3();
    this.head.traverse((m) => {
      if (!m.isMesh || m === this.faceMesh || !m.visible) return;
      const pos = m.geometry && m.geometry.attributes.position;
      if (!pos || pos.isInterleavedBufferAttribute) return;
      M.identity();
      for (let o = m; o && o !== this.head; o = o.parent) {
        o.updateMatrix();
        M.premultiply(o.matrix);
      }
      const step = Math.max(1, Math.floor(pos.count / 8000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        const r = v.length();
        if (r < 0.6) continue;
        const ia = Math.min(NA - 1, Math.floor(((Math.atan2(v.x, v.z) / Math.PI + 1) / 2) * NA));
        const ie = Math.min(NE - 1, Math.floor((Math.asin(v.y / r) / Math.PI + 0.5) * NE));
        const k = ie * NA + ia;
        if (r > raw[k]) raw[k] = r;
      }
    });
    // widen by one cell so thin strands and sparse sampling still count
    const grid = new Float32Array(NA * NE);
    for (let e = 0; e < NE; e++) {
      for (let a = 0; a < NA; a++) {
        let r = 1;
        for (let de = -1; de <= 1; de++) {
          const ee = e + de;
          if (ee < 0 || ee >= NE) continue;
          for (let da = -1; da <= 1; da++) r = Math.max(r, raw[ee * NA + ((a + da + NA) % NA)]);
        }
        grid[e * NA + a] = Math.min(HEAD_GRID.cap, r);
      }
    }
    return (this._grid = grid);
  }

  /** head + hair radius toward a head-space direction (bilinear over the grid) */
  _headReach(x, y, z) {
    const g = this._headGrid();
    const NA = HEAD_GRID.na;
    const NE = HEAD_GRID.ne;
    const r = Math.hypot(x, y, z) || 1;
    const fa = ((Math.atan2(x, z) / Math.PI + 1) / 2) * NA - 0.5;
    const fe = Math.min(NE - 1, Math.max(0, (Math.asin(y / r) / Math.PI + 0.5) * NE - 0.5));
    const a0 = Math.floor(fa);
    const e0 = Math.min(NE - 2, Math.floor(fe));
    const ta = fa - a0;
    const te = fe - e0;
    const at = (e, a) => g[e * NA + ((a + NA) % NA)];
    return (at(e0, a0) * (1 - ta) + at(e0, a0 + 1) * ta) * (1 - te) + (at(e0 + 1, a0) * (1 - ta) + at(e0 + 1, a0 + 1) * ta) * te;
  }

  /** keep a hand target (relative to the shoulder, body space) within reach and outside the head */
  _reach(rig, h) {
    const max = rig.len * 0.9995;
    const min = rig.len * 0.3;
    const k = this.headSize; // the head pivot is scaled by this
    const S = A3.headScale;
    const O = A3.headOffset;
    const c = this.headPivot.position;
    const sh = rig.g.position;
    const q = _v1;
    const clear = HAND_CLEAR / k; // the gap stays the same in the world
    for (let it = 0; it < 4; it++) {
      const d = h.length();
      if (d > max) h.multiplyScalar(max / d);
      else if (d < min) h.multiplyScalar(min / Math.max(d, 1e-4));
      q.set((sh.x + h.x - c.x - O[0] * k) / (S[0] * k), (sh.y + h.y - c.y - O[1] * k) / (S[1] * k), (sh.z + h.z - c.z - O[2] * k) / (S[2] * k));
      const r = q.length();
      const need = this._headReach(q.x, q.y, q.z) + clear;
      if (r >= need) break;
      q.multiplyScalar(need / Math.max(r, 1e-4));
      h.set(q.x * S[0] * k + c.x + O[0] * k - sh.x, q.y * S[1] * k + c.y + O[1] * k - sh.y, q.z * S[2] * k + c.z + O[2] * k - sh.z);
    }
    const d = h.length();
    if (d > max) h.multiplyScalar(max / d);
    return h;
  }

  /**
   * Two-bone solve: put the hand at h (relative to the shoulder, body space) with the elbow
   * leaning toward pole. dev / flex turn the wrist in the palm's plane / toward the palm.
   */
  _poseArm(rig, h, pole, dev, flex) {
    const d = h.length();
    const hn = _v2.copy(h).multiplyScalar(1 / d);
    const perp = _v3.copy(pole).addScaledVector(hn, -pole.dot(hn));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1).addScaledVector(hn, hn.z);
    perp.normalize();
    const hw = _v4.crossVectors(perp, hn);
    const alpha = Math.acos(Math.min(1, d / rig.len));
    const u = _v5.copy(hn).multiplyScalar(Math.cos(alpha)).addScaledVector(perp, Math.sin(alpha));
    _m1.makeBasis(u, hw, _v1.crossVectors(u, hw));
    rig.g.quaternion.setFromRotationMatrix(_m1).multiply(rig.qRestInv);
    _q1.setFromAxisAngle(rig.hinge, (2 * alpha) / ELBOW_N);
    for (let k = 1; k <= ELBOW_N; k++) rig.bones[k].quaternion.copy(_q1);
    rig.bones[ELBOW_N + 1].quaternion.setFromAxisAngle(rig.hinge, dev || 0).multiply(_q1.setFromAxisAngle(rig.side2, flex || 0));
  }

  /** apply a leg's current angles to its bones */
  _poseLeg(rig) {
    const c = rig.cur;
    rig.bones[0].quaternion.setFromEuler(_e1.set(c.x, c.y, c.z));
    for (let k = 1; k <= KNEE_N; k++) rig.bones[k].quaternion.setFromAxisAngle(X_AXIS, c.knee / KNEE_N);
    rig.bones[KNEE_N + 1].quaternion.setFromAxisAngle(X_AXIS, c.ankle);
  }

  /** where the hand hangs when nothing is happening (relative to the shoulder) */
  _restHand(rig, out) {
    return out.copy(rig.rest).multiplyScalar(0.985).add(_v1.set(-0.004 * rig.sx, 0.004, 0.034).multiplyScalar(rig.len / ARM_LEN));
  }

  /** advance animations (seconds) */
  tick(dt) {
    const a = this.anim;
    a.t += dt;
    const t = a.t;
    ['pop', 'hop', 'wave', 'spin'].forEach((k) => (a[k] += dt));

    // ---- body: breathing and a slow shift of weight from one foot to the other
    const br = Math.sin(t * 2.1);
    const shift = Math.sin(t * 0.85) * 0.75 + Math.sin(t * 0.47 + 1.3) * 0.25;
    this.body.scale.set(1 - br * 0.006, 1 + br * 0.012, 1 - br * 0.006);

    // ---- wave envelope (0 hanging .. 1 hand up)
    const w = a.wave;
    const up = w < WAVE.len ? sstep(w / 0.3) * (1 - sstep((w - (WAVE.len - WAVE.down)) / WAVE.down)) : 0;
    const wsx = a.waveSide === 'L' ? -1 : 1;
    const beat = (w - 0.3) * 11.5;

    // ---- hop: crouch, leave the ground, land and settle
    const h = a.hop;
    let hy = 0;
    let sq = 0; // + stretch, - squash
    let air = 0;
    if (h < HOP.crouch) sq = -0.1 * Math.sin((h / HOP.crouch) * (Math.PI / 2));
    else if (h < HOP.crouch + HOP.air) {
      const u = (h - HOP.crouch) / HOP.air;
      hy = HOP.height * 4 * u * (1 - u);
      sq = -0.1 * (1 - sstep(u / 0.22)) + 0.06 * Math.sin(Math.PI * u);
      air = Math.pow(Math.sin(Math.PI * u), 0.7);
    } else if (h < HOP.crouch + HOP.air + 0.6) {
      const v = h - HOP.crouch - HOP.air;
      sq = -0.13 * Math.exp(-8 * v) * Math.sin(v * 18);
    }

    // ---- head: slow sway, now and then a glance to one side, a tilt when waving
    if (t > a.nextGlance) {
      a.glanceTo = (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.14);
      a.glanceUntil = t + 0.9 + Math.random() * 1.1;
      a.nextGlance = a.glanceUntil + 3.5 + Math.random() * 5.5;
    }
    a.glance += ((t < a.glanceUntil && up < 0.2 ? a.glanceTo : 0) - a.glance) * Math.min(1, dt * 4.5);
    this.body.rotation.z = shift * 0.013 + up * 0.012 * wsx;
    const ph = (this.pose && this.pose.head) || NO_TURN;
    this.headPivot.rotation.set(
      Math.sin(t * 0.55 + 1) * 0.025 - sq * 0.5 - air * 0.05 + (ph.x || 0),
      a.glance + Math.sin(t * 0.4) * 0.03 + (ph.y || 0),
      Math.sin(t * 0.8) * 0.03 - shift * 0.009 + up * (0.085 + Math.sin(beat) * 0.012) * wsx + (ph.z || 0)
    );

    // ---- root: pop (squash & stretch on a change), hop, spin
    const p = a.pop;
    const s = (p < 0.8 ? Math.sin(p * 18) * Math.exp(-p * 6) * 0.07 : 0) + sq;
    this.root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    this.root.position.y = hy;
    const sp = a.spin;
    const spinAngle = sp < 0.9 ? (1 - Math.pow(1 - sp / 0.9, 3)) * Math.PI * 2 : 0;
    this.root.rotation.y = a.yaw + spinAngle;
    // turning quickly (a spin, a drag) swings the arms outward
    const turn = dt > 0 ? Math.abs(this.root.rotation.y - a.lastYaw) / dt : 0;
    a.lastYaw = this.root.rotation.y;
    a.flare += (sstep(turn / 9) - a.flare) * Math.min(1, dt * 8);

    // ---- arms: loose swing while idle, opposite phase left and right
    this.body.updateMatrix();
    ['L', 'R'].forEach((side) => {
      const rig = this.rig[side];
      const sx = rig.sx;
      const k = rig.len / ARM_LEN;
      const calm = this.held[side] ? 0.35 : 1;
      const ph = t * 2.3 + (side === 'L' ? Math.PI : 0);
      const swing = (Math.sin(ph) * 0.8 + Math.sin(ph * 0.5 + 0.7) * 0.2) * calm;
      const des = this._restHand(rig, _d);
      des.x += sx * (0.012 - 0.01 * Math.cos(ph)) * calm * k;
      des.y += (0.008 * br + 0.012 * Math.abs(swing)) * k;
      des.z += 0.1 * swing * k;
      const pole = _p.set(REST_POLE[0] * sx, REST_POLE[1], REST_POLE[2]);
      let flex = -0.2 * Math.cos(ph) * calm; // the hand trails the forearm
      let dev = 0;
      // arms fly up and out in the air, and out when turning fast
      const lift = this.held[side] ? 0.3 : 1;
      des.x += sx * (0.26 * air * lift + 0.13 * a.flare * lift) * k;
      des.y += (0.52 * air * lift + 0.1 * a.flare * lift) * k;
      des.z += 0.05 * air * lift * k;
      if (air > 0) pole.lerp(_v1.set(sx * 0.6, -1, -0.35), air * lift);
      const posed = this.pose && this.pose.arm ? this.pose.arm(side, t) : null;
      if (posed) {
        des.set(posed.hand[0], posed.hand[1], posed.hand[2]).multiplyScalar(k);
        if (posed.pole) pole.set(posed.pole[0], posed.pole[1], posed.pole[2]);
        flex = posed.flex || 0;
        dev = posed.dev || 0;
      }
      if (up > 0 && side === a.waveSide) {
        // the upper arm stays down; only the forearm comes up from the elbow and rocks
        // from side to side (lean = how far it tips outward from straight up)
        const lean = 0.4 + 0.36 * Math.sin(beat);
        const elbow = _v2.copy(rig.rest).multiplyScalar(0.5);
        _v1.set(sx * Math.sin(lean), Math.cos(lean) * 0.9, 0.5).normalize().multiplyScalar(rig.len * 0.5).add(elbow);
        des.lerp(_v1, up);
        pole.lerp(elbow, up);
        flex *= 1 - up;
        dev = up * 0.42 * Math.cos(beat);
      } else if (up > 0) {
        des.x -= sx * 0.02 * up * k; // the other arm tucks in a little
      }
      // spring toward the target, so every start and stop overshoots a little
      const n = dt > 0.02 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const e = dt / n;
        rig.vel.addScaledVector(_v1.subVectors(des, rig.pos), ARM_SPRING.k * e).multiplyScalar(Math.max(0, 1 - ARM_SPRING.c * e));
        rig.pos.addScaledVector(rig.vel, e);
      }
      this._poseArm(rig, this._reach(rig, _d.copy(rig.pos)), pole, dev, flex);
    });

    // ---- legs: straight unless a scene pose bends them; angles ease toward the target
    const ease = Math.min(1, dt * 10);
    ['L', 'R'].forEach((side) => {
      const rig = this.legRig[side];
      const want = this.pose && this.pose.leg ? this.pose.leg(side, t) : null;
      const c = rig.cur;
      const h = want && want.hip;
      c.x += ((h ? h[0] : 0) - c.x) * ease;
      c.y += ((h ? h[1] : 0) - c.y) * ease;
      c.z += ((h ? h[2] : 0) - c.z) * ease;
      c.knee += ((want ? want.knee || 0 : 0) - c.knee) * ease;
      c.ankle += ((want ? want.ankle || 0 : 0) - c.ankle) * ease;
      this._poseLeg(rig);
    });

    // blink
    if (t > a.nextBlink) {
      a.blinkUntil = t + 0.13;
      a.nextBlink = t + 2.2 + Math.random() * 3.2;
      if (Math.random() < 0.18) a.nextBlink = t + 0.28; // double blink
    }
    const blinking = t < a.blinkUntil || !!(this.pose && this.pose.eyes === 'closed');
    const want = blinking ? this.blinkTex : this.faceTex;
    if (this.faceMat.map !== want) this.faceMat.map = want;
  }

  /** reset to rest pose (for thumbnails) */
  restPose() {
    this.body.scale.set(1, 1, 1);
    this.body.rotation.set(0, 0, 0);
    this.headPivot.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    ['L', 'R'].forEach((side) => {
      const rig = this.rig[side];
      this._restHand(rig, rig.pos);
      rig.vel.set(0, 0, 0);
      this._poseArm(rig, _d.copy(rig.pos), _p.set(REST_POLE[0] * rig.sx, REST_POLE[1], REST_POLE[2]), 0, 0);
    });
    ['L', 'R'].forEach((side) => {
      const rig = this.legRig[side];
      Object.assign(rig.cur, { x: 0, y: 0, z: 0, knee: 0, ankle: 0 });
      this._poseLeg(rig);
    });
    this.anim.flare = 0;
    this.anim.lastYaw = 0;
    this.faceMat.map = this.faceTex;
  }

  dispose() {
    Object.keys(this.parts).forEach((k) => this._removePart(k));
    this.rendered();
    this.root.traverse((o) => o.geometry && o.geometry.dispose());
    this.baseKit.dispose();
    this.rig.L.skeleton.dispose();
    this.rig.R.skeleton.dispose();
    this.legRig.skeleton.dispose();
    this.shared.skin.dispose();
    this.faceTex.dispose();
    this.blinkTex.dispose();
    this.faceMesh.geometry.dispose();
    this.faceMat.dispose();
  }
}

/* Categories that look at a neighbour while building (hats fit the hair, hair tucks under
 * hats, tops and bottoms layer against each other). Changing a dependency rebuilds the part. */
const CAT_DEPS = { hair: ['hat'], hat: ['hair'], glasses: ['hair', 'hat'], top: ['bottom'], bottom: ['top'], shoes: ['bottom'] };

/* ============================================================== scene + frames */
export const FRAMES = {
  full: { target: [0, 2.15, 0], dist: 11.4, elev: 6, whole: true },
  stage: { target: [0, 2.05, 0], dist: 11.6, elev: 7, whole: true },
  portrait: { target: [0, 2.62, 0], dist: 8.4, elev: 5 },
  head: { target: [0, 2.6, 0], dist: 5.8, elev: 5 },
  figure: { target: [0, 1.95, 0], dist: 9.4, elev: 6, whole: true },
  hair: { target: [0, 2.72, 0], dist: 7.0, elev: 9, rotY: 0.5 },
  face: { target: [0, 2.5, 0], dist: 4.4, elev: 3 },
  faceZoom: { target: [0, 2.64, 0], dist: 7.2, elev: 4 },
  top: { target: [0, 1.3, 0], dist: 4.6, elev: 6 },
  bottom: { target: [0, 0.62, 0], dist: 4.0, elev: 8 },
  shoes: { target: [0, 0.18, 0.08], dist: 2.7, elev: 13, rotY: 0.35 },
  hat: { target: [0, 3.22, 0], dist: 6.4, elev: 10 },
  body: { target: [0, 1.55, 0], dist: 6.6, elev: 5, rotY: 0.4 },
};
const FOV = 26;

export function makeScene(renderer, o) {
  o = o || {};
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.55;
  env.dispose && env.dispose();
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff4e6, 0xc9b8a0, 0.62);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  // the key light comes down diagonally from the upper left, in front of the character,
  // so the lit side / shaded side split runs across the face instead of top to bottom
  key.position.set(-5.0, 7.4, 5.2);
  key.target.position.set(0, 1.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(o.shadowSize || 2048, o.shadowSize || 2048);
  const sc = key.shadow.camera;
  sc.left = -3;
  sc.right = 3;
  sc.top = 3.4;
  sc.bottom = -2.6;
  sc.near = 2;
  sc.far = 22;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  // soft light from above and a little in front that only exists to be blocked: whatever
  // sits under something else (neck under the chin, legs under a hem, face under a brim)
  // loses it and slides into its shade colour, which reads as contact shadow
  const sky = new THREE.DirectionalLight(0xfff6ea, 0.8);
  sky.position.set(0.5, 9, 3.4);
  sky.target.position.set(0, 1.6, 0);
  sky.castShadow = true;
  sky.shadow.mapSize.set(1024, 1024);
  Object.assign(sky.shadow.camera, { left: -2.4, right: 2.4, top: 3, bottom: -3, near: 2, far: 16 });
  sky.shadow.bias = -0.0005;
  sky.shadow.normalBias = 0.035;
  sky.shadow.radius = 6;
  scene.add(sky, sky.target);
  const fill = new THREE.DirectionalLight(0xe2ecff, 0.35);
  fill.position.set(5, 2.5, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.3);
  rim.position.set(1.5, 5, -6);
  scene.add(rim);

  // ground: shadow catcher + soft contact blob
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.12, color: 0x6b4a3a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const blobCanvas = document.createElement('canvas');
  blobCanvas.width = blobCanvas.height = 128;
  const g = blobCanvas.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(59,36,22,0.55)');
  grd.addColorStop(0.55, 'rgba(59,36,22,0.22)');
  grd.addColorStop(1, 'rgba(59,36,22,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const blobTex = new THREE.CanvasTexture(blobCanvas);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.25),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, 0.003, 0.04);
  scene.add(blob);
  return { scene, ground, blob, lights: { hemi, key, sky, fill, rim } };
}

/* lift: how much taller/shorter the character stands (Character.lift). Whole-body frames
 * follow half of it, head-and-shoulders frames all of it, lower-body frames none. */
const liftShare = (f) => (typeof f.whole === 'number' ? f.whole : f.whole ? 0.5 : f.target[1] > 2 ? 1 : f.target[1] > 1 ? 0.5 : 0);
/* fit (Character.frameFit): with other proportions, head frames follow the head (its centre
 * and size) and the other frames scale with the character's overall height. */
/** where a named frame puts the camera for this character: { target, dist, elev (deg), fov } */
function resolveFrame(frameName, lift, fit) {
  const f = FRAMES[frameName] || FRAMES.full;
  const t = V3(f.target);
  let dist = f.dist;
  if (fit && (fit.head !== 1 || Math.abs(fit.height - 1) > 1e-3)) {
    if (!f.whole && f.target[1] > 2) {
      t.y = A3.headCenter[1] + (lift || 0) + (f.target[1] - A3.headCenter[1]) * fit.head;
      dist *= fit.head;
    } else {
      t.y = f.target[1] * fit.height;
      dist *= fit.height;
    }
  } else if (lift) t.y += lift * liftShare(f);
  return { target: t, dist, elev: f.elev || 0, fov: f.fov || FOV };
}
function placeCamera(camera, r, aspect) {
  const e = r.elev * DEG;
  camera.fov = r.fov;
  camera.aspect = aspect;
  camera.position.set(r.target.x, r.target.y + Math.sin(e) * r.dist, r.target.z + Math.cos(e) * r.dist);
  camera.lookAt(r.target);
  camera.updateProjectionMatrix();
}
function setCamera(camera, frameName, aspect, lift, fit) {
  placeCamera(camera, resolveFrame(frameName, lift, fit), aspect);
  return FRAMES[frameName] || FRAMES.full;
}

export function makeRenderer(canvas, o) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!(o && o.preserve) });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setClearColor(0x000000, 0);
  return r;
}

/* ============================================================== Stage (live view) */
export class Stage {
  /**
   * container: element that will hold the backdrop + canvas (position:relative recommended)
   * o.interactive: drag to rotate (default true)
   */
  constructor(container, o) {
    o = o || {};
    this.container = container;
    this.bgLayer = document.createElement('div');
    this.bgLayer.className = 'cc-backdrop';
    Object.assign(this.bgLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cc-canvas';
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'pan-y', cursor: 'grab' });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(this.bgLayer, this.canvas);

    this.renderer = makeRenderer(this.canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const s = makeScene(this.renderer);
    this.scene = s.scene;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.character = new Character();
    this.scene.add(this.character.root);
    this.frame = 'stage';
    this._camFrom = null;
    this._camT = 1;
    this._bgId = null;

    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(container);
    this._resize();
    if (o.interactive !== false) this._bindDrag();

    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this._applyFrame(1);
  }

  _applyFrame(k) {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) || 1;
    // both ends of a move are the frames as fitted to this character, so the camera goes
    // straight from one to the other (not out to the unfitted frame and back in at the end)
    const to = resolveFrame(this.frame, this._lift || 0, this.character.frameFit());
    const from = this._camFrom;
    let now = to;
    if (from && k < 1) {
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const lerp = (a, b) => a + (b - a) * e;
      now = { target: from.target.clone().lerp(to.target, e), dist: lerp(from.dist, to.dist), elev: lerp(from.elev, to.elev), fov: lerp(from.fov, to.fov) };
    }
    this._camNow = now;
    placeCamera(this.camera, now, aspect);
  }

  /** move the camera to a named frame ('stage', 'faceZoom', 'top', ...) */
  setFrame(name) {
    if (!FRAMES[name] || name === this.frame) return;
    // start from wherever the camera is right now (mid-move included)
    const c = this._camNow || resolveFrame(this.frame, this._lift || 0, this.character.frameFit());
    this._camFrom = { target: c.target.clone(), dist: c.dist, elev: c.elev, fov: c.fov };
    this.frame = name;
    this._camT = 0;
  }

  _bindDrag() {
    const c = this.canvas;
    let down = false;
    let lastX = 0;
    let vel = 0;
    this._yawVel = 0;
    this._lastInteract = -10;
    c.addEventListener('pointerdown', (e) => {
      down = true;
      lastX = e.clientX;
      vel = 0;
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.character.anim.yaw += dx * 0.012;
      vel = dx * 0.012;
      this._lastInteract = this._clock.elapsedTime;
    });
    const up = () => {
      if (!down) return;
      down = false;
      this._yawVel = vel;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', () => {
      this._lastInteract = -10;
      this.character.play('spin');
    });
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, this._clock.getDelta());
    const now = this._clock.elapsedTime;
    const ch = this.character;
    // inertia, then ease back to facing front after a while
    if (this._yawVel) {
      ch.anim.yaw += this._yawVel;
      this._yawVel *= 0.92;
      if (Math.abs(this._yawVel) < 0.0005) this._yawVel = 0;
    } else if (now - (this._lastInteract || -10) > 2.5) {
      const y = ch.anim.yaw;
      const target = Math.round(y / (Math.PI * 2)) * Math.PI * 2;
      ch.anim.yaw += (target - y) * Math.min(1, dt * 2.5);
    }
    ch.tick(dt);
    // the camera eases after the character when a body shape makes it taller or shorter
    const lift0 = this._lift || 0;
    this._lift = Math.abs(ch.lift - lift0) < 0.002 ? ch.lift : lift0 + (ch.lift - lift0) * Math.min(1, dt * 7);
    if (this._camT < 1) {
      this._camT = Math.min(1, this._camT + dt / 0.55);
      this._applyFrame(this._camT);
    } else if (this._lift !== lift0) this._applyFrame(1);
    this.renderer.render(this.scene, this.camera);
    ch.rendered();
  }

  /** apply a state (re-renders backdrop when bg changes). Returns setState promise. */
  setState(state, o) {
    const bgId = `${state.bg}|${state.bgColor}`;
    if (bgId !== this._bgId) {
      this._bgId = bgId;
      this.bgLayer.innerHTML = CC.backdropSVG(state);
      const svgEl = this.bgLayer.querySelector('svg');
      if (svgEl) Object.assign(svgEl.style, { width: '100%', height: '100%', display: 'block' });
    }
    return this.character.setState(state, o);
  }

  play(name) {
    this.character.play(name);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.character.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.bgLayer.remove();
  }
}

/* ============================================================== Thumbnailer (offscreen) */
export class Thumbnailer {
  constructor(o) {
    o = o || {};
    this.canvas = document.createElement('canvas');
    this.renderer = makeRenderer(this.canvas, { preserve: true });
    this.renderer.setPixelRatio(1);
    const s = makeScene(this.renderer, { shadowSize: o.shadowSize || 1024 });
    this.scene = s.scene;
    this.blob = s.blob;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.character = new Character();
    this.scene.add(this.character.root);
    this._queue = Promise.resolve();
    this.cache = new Map();
  }

  /**
   * Render a state. o: { frame, width, height, rotY, background (draw bg svg), output: 'dataURL'|'canvas', onError }
   * Calls are serialized; returns a Promise.
   */
  render(state, o) {
    o = o || {};
    const job = this._queue.then(() => this._render(state, o));
    this._queue = job.catch(() => {});
    return job;
  }

  async _render(state, o) {
    const w = o.width || 256;
    const h = o.height || w;
    // supersample then downscale for smooth edges
    const ss = o.ss ?? (w * h <= 420 * 420 ? 2 : 1.5);
    this.renderer.setSize(Math.round(w * ss), Math.round(h * ss), false);
    await this.character.setState(state, { animate: false, onError: o.onError });
    this.character.restPose();
    const f = setCamera(this.camera, o.frame || 'full', w / h, this.character.lift, this.character.frameFit());
    this.character.root.rotation.y = o.rotY ?? f.rotY ?? 0;
    this.blob.visible = (o.frame || 'full') !== 'face';
    // hair and hat fit themselves to each other as their matrices update: settle that first
    this.scene.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    this.character.rendered();
    let out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    {
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(this.canvas, 0, 0, w, h);
    }
    if (o.background) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      const bg = CC.backdropSVG(state, { par: 'xMidYMax slice' });
      if (bg) {
        try {
          g.drawImage(await CC.rasterize(bg, w, h), 0, 0);
        } catch (e) {
          /* ignore */
        }
      } else if (typeof o.background === 'string') {
        g.fillStyle = o.background;
        g.fillRect(0, 0, w, h);
      }
      g.drawImage(out, 0, 0);
      out = c;
    }
    return o.output === 'canvas' ? out : out.toDataURL('image/png');
  }

  /**
   * Thumbnail for one option of a category on top of `state`.
   * Resolves { type: 'svg', svg } for face/bg categories or { type: 'img', src } for 3D ones.
   */
  async option(state, catKey, value, o) {
    o = o || {};
    const cat = CC.category(catKey);
    const s = Object.assign({}, state);
    if (cat.paletteOnly) s[cat.colorKey] = value;
    else s[catKey] = value;
    if (cat.kind === 'face') return { type: 'svg', svg: CC.faceThumb(s, catKey, value) };
    if (cat.kind === 'bg') {
      const svg = CC.backdropSVG(s, { par: 'xMidYMid slice' });
      return { type: 'svg', svg: svg || '' };
    }
    // only fields that affect this thumbnail go into the cache key
    const key = JSON.stringify([catKey, value, o.size, s.faceShape, s.bodyShape, s.skin, s.hairColor, s.eyeColor, s.hair, s.top, s.topColor, s.bottom, s.bottomColor, s.shoes, s.shoesColor, s.glasses, s.glassesColor, s.hat, s.hatColor, s.acc, s.accColor, CC.FACE_CATS.map((k) => s[k])]);
    if (this.cache.has(key)) return { type: 'img', src: this.cache.get(key) };
    const thumbState = Object.assign({}, s);
    // keep thumbnails focused: hide hats on hair thumbs, etc.
    if (catKey === 'hair' || catKey === 'skin' || catKey === 'faceShape') thumbState.hat = 'none';
    if (catKey === 'top' || catKey === 'bottom') thumbState.acc = 'none';
    // long trousers hide most of a shoe — show shoes under shorts
    if (catKey === 'shoes' && CC.getPart('bottom', 'shorts')) thumbState.bottom = 'shorts';
    const src = await this.render(thumbState, { frame: cat.frame || 'full', width: o.size || 192, height: o.size || 192, onError: o.onError });
    this.cache.set(key, src);
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    return { type: 'img', src };
  }

  dispose() {
    this.character.dispose();
    this.renderer.dispose();
  }
}

if (typeof window !== 'undefined') window.CC3 = { THREE, A3, FRAMES, Character, Stage, Thumbnailer, headDir, torsoRadiusAt, normalizeProportions };
