/*
 * 직장의 숲 — tuning.js: character proportions and the day-scene cameras.
 * Edit these in the studio (dev/studio.html); its "코드에 저장" button rewrites this file.
 *
 * character: head = head size (hair, hats and the face scale with it), torso / legs = lengths,
 *            width = body width. 1 = the original design.
 * camera:    fov (deg), elev = how far the camera looks down (deg),
 *            height = world height kept on screen between the HUD and the button (bigger = smaller character).
 * scenes:    the point each scene's camera centres on, [x, y, z]; elev / height (optional) = the
 *            scene's own angle and distance instead of the shared ones (the subway is seen from
 *            beside the bridge, nearly level).
 * vignette:  the edges of the day scenes. on = 1 / 0, strength = how dark the corners get (0..1),
 *            size = how far from the middle the picture stays untouched (0..1), blur = how soft
 *            the edges are drawn, px (0 = sharp; blurring costs frames on a slow phone).
 *
 * With ?draft=1 in the URL, a draft saved by the studio (localStorage 'ccws-tuning-draft')
 * replaces these values, so the app and the workshop can be tried before saving.
 */
const BASE = {
  "character": { "head": 0.66, "torso": 0.88, "legs": 0.77, "width": 1 },
  "camera": { "fov": 75, "elev": 24, "height": 7.5 },
  "vignette": { "on": 0, "strength": 0.35, "size": 0.45, "blur": 0 },
  "scenes": {
    "office": { "target": [0, 1.25, 0] },
    "home_ready": { "target": [1.1, 1.7, 0.2] },
    "home_table": { "target": [-0.4, 1.5, 0.1] },
    "home_bed": { "target": [3.9, 1.3, -0.6] },
    "subway_in": { "target": [0, 2.1, 0.6], "elev": 15, "height": 10.5 },
    "subway_out": { "target": [0, 2, 0.4], "elev": 7, "height": 7.5 }
  }
};

export const DRAFT_KEY = 'ccws-tuning-draft';

function draft() {
  try {
    if (typeof location === 'undefined' || !/[?&]draft=1\b/.test(location.search)) return null;
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return d && typeof d === 'object' ? d : null;
  } catch (e) {
    return null;
  }
}

/** deep merge of plain objects (arrays and numbers replace) */
export function mergeTuning(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  if (!over) return out;
  (function walk(dst, src) {
    Object.keys(src).forEach((k) => {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) walk(dst[k], v);
      else if (typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) && v.every(Number.isFinite)) dst[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) dst[k] = JSON.parse(JSON.stringify(v));
    });
  })(out, over);
  return out;
}

export const TUNING_BASE = BASE;
export const TUNING = mergeTuning(BASE, draft());
