/*
 * 직장의 숲 · 하루 — commuters.js (the other people on the train)
 *
 * They are made exactly like the character, from the workshop's own parts and with the same
 * proportions, posed with the same rig (sitting with a phone, nodding off, looking about,
 * standing with a phone). They are a few everyday reference looks (LOOKS), not random ones:
 * plain clothes, no glasses, hats or bags, built at lower detail since they are small on screen.
 * A posed character is baked into still meshes, one per material with the head apart so it
 * can still nod, so a car full of them stays cheap to draw.
 *
 * Which of them ride changes every day (seeded by the date); where they sit or stand and what
 * they do changes with every ride, and the evening train is emptier than the morning one.
 *
 *   const crowd = makeCrowd(parent)
 *   crowd.ride(ctx, mainSeated)   who is on this ride (builds the day's people when needed)
 *   crowd.update(t, speed, brake) sway with the car, nod, glance
 *   crowd.ready                   a promise for the people of the current day (dev pages)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Character, CC, sceneMat } from '../char3d.js';
import { box, plane, group } from './kit.js';

const PEOPLE = 5; // riding each day, out of LOOKS
const DETAIL = 0.3; // share of the character's usual segments: they are small, behind glass
const SEAT = { lift: 0.31, z: -1.0 }; // on the front edge of the bench, like the character
// the seats and standing spots the windows show (the main character's own seat is 0)
const SEATS = [
  [-1.52, 3], // (beside the character's seat: a little apart, the heads are big)
  [1.52, 3],
  [-2.8, 2],
  [2.8, 2],
  [-4.2, 2],
  [4.2, 2],
];
// standing: no nearer the windows than the character stands (big heads and hats reach far),
// clear of the poles at ±3.5
const SPOTS = [
  [-2.0, 0.3],
  [2.0, 0.3],
  [-2.95, 0.3],
  [2.95, 0.3],
  [-4.4, 0.3],
  [4.4, 0.3],
];
/* everyday commuters (faces are painted, so they cost nothing; the clothes are kept light) */
const LOOKS = [
  { skin: '#f3c2a0', hair: 'sidepart', hairColor: '#2b2321', eyes: 'dot', brows: 'straight', mouth: 'flat', top: 'shirt', topColor: '#9cd3f0', bottom: 'slacks', bottomColor: '#3e3f46', shoes: 'loafers', shoesColor: '#3e3f46', acc: 'necktie', accColor: '#34497a', case: '#3f4652' },
  { skin: '#e6a983', hair: 'daily', hairColor: '#4a2f23', eyes: 'tired', brows: 'soft', mouth: 'smile', top: 'blazer', topColor: '#34497a', bottom: 'slacks', bottomColor: '#34497a', shoes: 'loafers', shoesColor: '#8a5a3c', bodyShape: 'broad', case: '#fbf7ee' },
  { skin: '#fbd5bd', hair: 'bob', hairColor: '#4a2f23', eyes: 'lashes', brows: 'soft', mouth: 'smile', cheeks: 'rosy', top: 'knit', topColor: '#f3e2b3', bottom: 'aline', bottomColor: '#8a5a3c', shoes: 'maryjanes', shoesColor: '#3e3f46', case: '#f7b2c0' },
  { skin: '#ffe6d5', hair: 'cowlick', hairColor: '#7a4a2e', eyes: 'sparkle', brows: 'raised', mouth: 'o', top: 'stripe', topColor: '#4f8fe0', bottom: 'jeans', bottomColor: '#34497a', shoes: 'slides', shoesColor: '#f7f4ee', bodyShape: 'slim', case: '#5bb36a' },
  { skin: '#cc8c64', hair: 'ponytail', hairColor: '#2b2321', eyes: 'happy', brows: 'thin', mouth: 'smile', cheeks: 'peach', top: 'tee', topColor: '#f2766b', bottom: 'wide', bottomColor: '#d8c3a5', shoes: 'loafers', shoesColor: '#f7f4ee', case: '#f6d04d' },
  { skin: '#f3c2a0', hair: 'curtain', hairColor: '#c98a4b', eyes: 'bright', brows: 'soft', mouth: 'grin', top: 'shirt', topColor: '#f7f4ee', bottom: 'slacks', bottomColor: '#9a9aa3', shoes: 'loafers', shoesColor: '#8a5a3c', case: '#5aa9e6' },
  { skin: '#a96d4a', hair: 'long', hairColor: '#4a2f23', eyes: 'cat', brows: 'soft', mouth: 'smirk', top: 'knit', topColor: '#8fdcc0', bottom: 'pleats', bottomColor: '#3e3f46', shoes: 'maryjanes', shoesColor: '#8a5a3c', case: '#b7a6d6' },
  { skin: '#e6a983', hair: 'daily', hairColor: '#a8a8b0', eyes: 'droopy', brows: 'bold', mouth: 'flat', top: 'puffer', topColor: '#8a9a4b', bottom: 'slacks', bottomColor: '#3e3f46', shoes: 'loafers', shoesColor: '#3e3f46', bodyShape: 'chubby', case: '#e5584f' },
];
const lookState = (look) => Object.assign(CC.defaultState(), look, { glasses: 'none', hat: 'none', acc: look.acc || 'none' });

const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);
const PHONE = [-0.1, -0.3, 0.58];
const holdPhone = (side) => ({ hand: mirror(PHONE, side), pole: [side === 'L' ? -1 : 1, -0.8, -0.2], flex: 0.35 });
const lap = (side) => ({ hand: mirror([-0.1, -0.33, 0.38], side), pole: [side === 'L' ? -1 : 1, -0.5, -0.4], flex: -0.1 });
const sitLegs = (k) => (side) => ({ hip: [-1.45, 0, side === 'L' ? -0.06 : 0.06], knee: 1.35 + k * (side === 'L' ? 1 : -1), ankle: 0.35 });
/** what a commuter can be doing; r = a random source */
const POSES = {
  sitPhone: (r) => ({ seated: true, phone: true, pose: { arm: holdPhone, leg: sitLegs((r() - 0.5) * 0.3), head: { x: 0.3, y: 0, z: 0 } } }),
  sitDoze: (r) => ({ seated: true, doze: true, pose: { arm: lap, leg: sitLegs((r() - 0.5) * 0.3), head: { x: 0.22, y: 0, z: r() < 0.5 ? 0.16 : -0.16 }, eyes: 'closed' } }),
  sitIdle: (r) => ({ seated: true, pose: { arm: lap, leg: sitLegs((r() - 0.5) * 0.4), head: { x: 0.03, y: (r() - 0.5) * 0.8, z: 0 } } }),
  standPhone: () => ({ phone: true, pose: { arm: holdPhone, head: { x: 0.3, y: 0, z: 0 } } }),
  standIdle: (r) => ({ pose: { head: { x: 0.02, y: (r() - 0.5) * 0.9, z: 0 } } }),
};

/** small stable hash of a string (seeds) */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
/** pick from [[value, weight], ...] without putting it back */
function draw(list, r) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (let i = 0; i < list.length; i++) {
    x -= list[i][1];
    if (x <= 0) return list.splice(i, 1)[0][0];
  }
  return list.pop()[0];
}

/* ============================================================== baking a posed character */
const _v = new THREE.Vector3();
/**
 * Freeze a posed character into still meshes, one per material (skinned arms and legs keep
 * their pose). Returns { body, head }: the head group's origin is the neck, so it can nod.
 */
function bakeCharacter(ch) {
  ch.root.updateMatrixWorld(true);
  const neck = ch.headPivot.getWorldPosition(new THREE.Vector3());
  const buckets = { body: new Map(), head: new Map() };
  const under = (o, a) => {
    for (let q = o; q; q = q.parent) if (q === a) return true;
    return false;
  };
  const shown = (o) => {
    for (let q = o; q; q = q.parent) if (!q.visible) return false;
    return true;
  };
  ch.root.traverse((m) => {
    // (meshes off layer 0 are the hidden originals of skinned legs)
    if (!m.isMesh || Array.isArray(m.material) || !(m.layers.mask & 1) || !shown(m)) return;
    const src = m.geometry;
    const n = src.attributes.position.count;
    const geo = new THREE.BufferGeometry();
    if (m.isSkinnedMesh || (m.morphTargetInfluences && m.morphTargetInfluences.length)) {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, _v);
        arr[i * 3] = _v.x;
        arr[i * 3 + 1] = _v.y;
        arr[i * 3 + 2] = _v.z;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    } else geo.setAttribute('position', src.attributes.position.clone());
    if (src.index) geo.setIndex(src.index.clone());
    if (src.attributes.normal && !m.isSkinnedMesh) geo.setAttribute('normal', src.attributes.normal.clone());
    else geo.computeVertexNormals(); // (on the indexed mesh, so it stays smooth)
    geo.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    geo.applyMatrix4(m.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    const b = buckets[under(m, ch.headPivot) ? 'head' : 'body'];
    if (!b.has(m.material)) b.set(m.material, { geos: [], order: 0 });
    const e = b.get(m.material);
    e.geos.push(flat);
    e.order = Math.max(e.order, m.renderOrder);
  });
  const make = (b, shift) => {
    const g = new THREE.Group();
    b.forEach(({ geos, order }, material) => {
      const merged = mergeGeometries(geos);
      geos.forEach((x) => x.dispose());
      if (shift) merged.translate(-shift.x, -shift.y, -shift.z);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.renderOrder = order;
      mesh.receiveShadow = true; // (no shadows cast: a car full of people would double the cost)
      g.add(mesh);
    });
    return g;
  };
  const head = make(buckets.head, neck);
  head.position.copy(neck);
  return { body: make(buckets.body), head };
}

/* ============================================================== one commuter */
class Commuter {
  constructor(state, prop, caseColor) {
    this.ch = new Character({ detail: DETAIL });
    this.ch.prop = Object.assign({}, prop); // the same build as the character
    this.caseColor = caseColor;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.baked = null;
    this.head = null;
    this.doing = null;
    this.phase = 0;
    this.ready = this.ch.setState(state, { animate: false }).then(() =>
      // things carried in the hands would fight with the poses
      this.ch.held.L || this.ch.held.R ? this.ch.setState(Object.assign({}, state, { acc: 'none' }), { animate: false }) : null
    );
  }

  /** pose for this ride, bake, and place at (x, z) */
  place(doing, x, z, yaw, phase) {
    const ch = this.ch;
    this.doing = doing;
    this.phase = phase;
    ch.pose = doing.pose;
    ch.root.position.set(0, 0, 0);
    ch.root.rotation.set(0, 0, 0);
    for (let k = 0; k < 50; k++) ch.tick(1 / 30); // springs and arms settle into the pose
    ch.faceMat.map = doing.pose.eyes === 'closed' ? ch.blinkTex : ch.faceTex; // not caught mid-blink
    let phone = null;
    if (doing.phone) {
      const hand = (side) => {
        const rig = ch.rig[side];
        return ch.body.localToWorld(rig.g.position.clone().add(rig.pos));
      };
      ch.body.updateWorldMatrix(true, false);
      const a = hand('L');
      const b = hand('R');
      phone = group(box(0.3, 0.46, 0.05, sceneMat.glossy(this.caseColor, { roughness: 0.35 }), 0, 0, 0, 0.04), plane(0.25, 0.38, SCREEN, 0, 0, 0.03));
      phone.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.1, (a.z + b.z) / 2 + 0.04);
      phone.rotation.set(0.55, Math.PI, 0);
      ch.root.add(phone);
    }
    const baked = bakeCharacter(ch);
    if (phone) ch.root.remove(phone);
    this.clear();
    this.baked = baked;
    this.head = baked.head;
    this.group.add(baked.body, baked.head);
    // seated: lifted like the character, so its thighs rest on the cushion
    const lr = ch.legRig;
    const shift = 0.82 - (lr.L.pivot.y + lr.R.pivot.y) / 2;
    this.group.position.set(x, doing.seated ? SEAT.lift + shift : 0, z);
    this.group.rotation.set(0, yaw, 0);
    this.group.visible = true;
  }

  clear() {
    if (!this.baked) return;
    [this.baked.body, this.baked.head].forEach((g) => {
      this.group.remove(g);
      g.traverse((m) => m.geometry && m.geometry.dispose());
    });
    this.baked = null;
    this.head = null;
  }

  dispose() {
    this.clear();
    this.ch.dispose();
  }
}
const SCREEN = new THREE.MeshBasicMaterial({ color: '#cfe9ff' });

/* ============================================================== the crowd */
export function makeCrowd(parent) {
  const root = new THREE.Group();
  parent.add(root);
  let people = [];
  let builtKey = null;
  let building = null;
  let pending = null; // the last ride asked for while the people were still being made
  const api = { ready: Promise.resolve() };

  const made = new Map(); // look index -> Commuter, kept from day to day
  let madeProp = null;
  /** today's riders, out of LOOKS (seeded by the date) */
  const todays = (day) => {
    const r = CC.rng(hash(day));
    return LOOKS.map((_, i) => [i, r()])
      .sort((a, b) => a[1] - b[1])
      .slice(0, PEOPLE)
      .map((a) => a[0]);
  };
  /** make whichever of today's people are not made yet (one by one, letting the page breathe) */
  function build(key, prop) {
    if (builtKey === key) return building || Promise.resolve();
    builtKey = key;
    const [day, pk] = key.split('|');
    if (pk !== madeProp) {
      // the proportions changed (studio): everyone is made again
      made.forEach((p) => {
        root.remove(p.group);
        p.dispose();
      });
      made.clear();
      madeProp = pk;
    }
    people.forEach((p) => (p.group.visible = false));
    people = [];
    const want = todays(day);
    building = (async () => {
      for (const i of want) {
        if (builtKey !== key) return;
        if (made.has(i)) continue;
        const look = LOOKS[i];
        const p = new Commuter(lookState(look), prop, look.case);
        await p.ready;
        if (madeProp !== pk) return p.dispose();
        made.set(i, p);
        root.add(p.group);
        await new Promise((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(res, { timeout: 120 }) : setTimeout(res, 0)));
      }
      if (builtKey !== key) return;
      people = want.map((i) => made.get(i));
      building = null;
      if (pending) arrange(...pending);
    })();
    api.ready = building;
    return building;
  }

  /** who rides this time, where, doing what */
  function arrange(ctx, mainSeated) {
    pending = [ctx, mainSeated];
    if (building) return;
    pending = null;
    const home = ctx.dir === 'out';
    const r = CC.rng(hash(`${builtKey}|${ctx.dir}|${mainSeated ? 's' : 'a'}|${ctx.rideNo || 0}`));
    // the morning train is full, the evening one quieter
    const riding = home ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
    const seats = SEATS.map((s) => s.slice());
    const spots = SPOTS.map((s) => [s, 1]);
    const order = people.map((p, i) => [p, r()]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
    order.forEach((p, i) => {
      if (i >= riding) {
        p.group.visible = false;
        return;
      }
      const sit = seats.length && (r() < (home ? 0.85 : 0.6) || !spots.length);
      const x0 = sit ? draw(seats, r) : null;
      const spot = sit ? null : draw(spots, r);
      let kind;
      const k = r();
      if (sit) kind = home ? (k < 0.45 ? 'sitDoze' : k < 0.8 ? 'sitPhone' : 'sitIdle') : k < 0.5 ? 'sitPhone' : k < 0.75 ? 'sitDoze' : 'sitIdle';
      else kind = k < 0.6 ? 'standPhone' : 'standIdle';
      const doing = POSES[kind](r);
      if (sit) p.place(doing, x0, SEAT.z, 0, r() * 6);
      else p.place(doing, spot[0], spot[1], (r() - 0.5) * 0.5 - Math.sign(spot[0]) * 0.12, r() * 6);
    });
  }

  const keyOf = (ctx, prop) => `${dayKey(ctx.now ? ctx.now() : Date.now())}|${JSON.stringify(prop)}`; // (no '|' in either part)
  api.ride = (ctx, mainSeated, prop) => {
    build(keyOf(ctx, prop), prop);
    arrange(ctx, mainSeated);
  };
  /** if the day (or the proportions) changed since the people were made, make new ones */
  api.sync = (ctx, mainSeated, prop, rideNo) => {
    if (keyOf(ctx, prop) !== builtKey) api.ride(Object.assign({}, ctx, { rideNo }), mainSeated, prop);
  };
  /** start making today's people before the first ride (call when the page is idle) */
  api.prepare = (ms, prop) => build(`${dayKey(ms)}|${JSON.stringify(prop)}`, prop);

  api.update = (t, speed, brake) => {
    people.forEach((p, i) => {
      if (!p.group.visible || !p.head) return;
      const ph = p.phase;
      p.group.rotation.z = (Math.sin(t * 1.9 + ph) * 0.01 + Math.sin(t * 0.73 + ph * 2) * 0.008) * speed - brake * 0.04;
      if (p.doing.doze) p.head.rotation.set(Math.max(0, Math.sin(t * 0.9 + ph)) * 0.14, 0, 0.04 * Math.sin(t * 0.5 + ph));
      else if (p.doing.phone) p.head.rotation.set(0.03 * Math.sin(t * 0.7 + ph), 0.04 * Math.sin(t * 0.33 + ph), 0);
      else p.head.rotation.set(0, 0.25 * Math.sin(t * 0.21 + ph), 0);
    });
  };
  return api;
}
