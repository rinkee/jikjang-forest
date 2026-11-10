/*
 * 직장의 숲 · 하루 — home.js (the character's room)
 *
 * Three spots, picked by the hour (ctx.spot):
 *   ready  morning, getting ready: pacing in front of the window, stretching, waving
 *   table  sitting on a floor cushion, legs stretched out under a blanket-covered low table
 *   bed    asleep on its side, facing us, knees drawn up under a puffy duvet
 */
import { THREE, mat, box, cyl, ball, plane, group, shade, canvasTex, glow, zzz, wallClock, sunPatch } from './kit.js';
import { Routine } from './world.js';

const TABLE_X = -0.6;
const SIT = 0.57; // sitting on the floor cushion: the torso bottom rests on its top (0.16)
const TABLE_TOP = 0.65; // hands rest here; the legs (0.06..0.44) fit under it
const PACE = [0.9, 1.95]; // how far the character paces in the morning (x), between table and bed
const READY = [1.2, 0, 0.45];
const BED = { head: [5.9, 1.82, -0.75] }; // where the head rests on the pillow
const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);

function plaid() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2a7a0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 64 + 20, 0, 18, h);
      g.fillRect(0, i * 64 + 20, w, 18);
    }
    g.fillStyle = 'rgba(160,70,70,0.25)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 64 + 50, 0, 6, h);
      g.fillRect(0, i * 64 + 50, w, 6);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function cartoon() {
  return canvasTex(384, 224, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8fd3ff');
    grd.addColorStop(1, '#e6f7ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.arc(w * 0.82, h * 0.22, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7cc47f';
    g.beginPath();
    g.ellipse(w * 0.3, h * 1.05, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5bb36a';
    g.beginPath();
    g.ellipse(w * 0.85, h * 1.1, w * 0.45, h * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    // a round little hero
    g.fillStyle = '#e8975a';
    g.beginPath();
    g.arc(w * 0.45, h * 0.58, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a2a20';
    g.beginPath();
    g.arc(w * 0.45 - 10, h * 0.56, 4, 0, Math.PI * 2);
    g.arc(w * 0.45 + 10, h * 0.56, 4, 0, Math.PI * 2);
    g.fill();
  });
}

function floorTex() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d7b088';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = (y / 64) % 2 ? 'rgba(120,70,30,0.06)' : 'rgba(255,255,255,0.05)';
      g.fillRect(0, y, w, 64);
      g.fillStyle = 'rgba(110,70,40,0.25)';
      g.fillRect(0, y, w, 2);
      const off = ((y / 64) * 173) % w;
      g.fillRect(off, y, 2, 64);
      g.fillRect((off + 256) % w, y, 2, 64);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

export function buildHome(world) {
  const g = new THREE.Group();
  g.name = 'home';

  /* ---- room */
  const floor = plane(32, 32, new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  g.add(plane(32, 16, mat('#f8ead6'), 0, 8, -2.05), plane(32, 1.3, mat('#ead2b2'), 0, 0.65, -2.03), box(32, 0.1, 0.08, mat('#d1b08a'), 0, 1.32, -2.0, 0.02));

  // window with curtains
  // the view outside is painted from the real time of day (sky.js)
  const glassMat = new THREE.MeshBasicMaterial({ map: world.painter.texture('home'), toneMapped: false });
  const win = group(
    plane(2.1, 1.9, glassMat),
    box(2.3, 0.13, 0.12, mat('#ffffff'), 0, 1.0, 0.03, 0.04),
    box(2.3, 0.13, 0.12, mat('#ffffff'), 0, -1.0, 0.03, 0.04),
    box(0.13, 2.1, 0.12, mat('#ffffff'), -1.1, 0, 0.03, 0.04),
    box(0.13, 2.1, 0.12, mat('#ffffff'), 1.1, 0, 0.03, 0.04),
    box(2.1, 0.07, 0.07, mat('#ffffff'), 0, 0, 0.03, 0.02),
    box(0.6, 2.5, 0.14, mat('#f7b2c0'), -1.35, -0.1, 0.12, 0.07),
    box(0.6, 2.5, 0.14, mat('#f7b2c0'), 1.35, -0.1, 0.12, 0.07),
    cyl(0.03, 0.03, 3.4, mat('#a8754a'), 0, 1.3, 0.14)
  );
  win.children[win.children.length - 1].rotation.z = Math.PI / 2;
  win.position.set(1.45, 3.55, -2.0);
  g.add(win);

  // shelf with books and a plant
  const shelf = group(box(2.0, 0.1, 0.45, mat('#c8935e'), 0, 0, 0, 0.03));
  ['#5aa9e6', '#f6d04d', '#e5584f', '#5bb36a', '#b7a6d6'].forEach((c, i) => shelf.add(box(0.16, 0.5 - (i % 2) * 0.08, 0.34, mat(c), -0.8 + i * 0.19, 0.3 - (i % 2) * 0.04, 0, 0.02)));
  shelf.add(cyl(0.16, 0.13, 0.26, mat('#fffaf0'), 0.6, 0.18, 0), ball(0.24, mat('#6fb27a'), 0.6, 0.45, 0));
  shelf.position.set(-2.0, 3.4, -1.8);
  g.add(shelf);

  // a clock on the wall (real time) and sunlight through the window
  const clock = wallClock();
  clock.group.scale.setScalar(0.85);
  clock.group.position.set(-0.45, 4.15, -2.0);
  const patch = sunPatch(2.0, 1.5);
  g.add(clock.group, patch);

  // rug, cushion, low table with a blanket (kotatsu style)
  const rug = cyl(2.0, 2.0, 0.02, mat('#f3d9b6'), TABLE_X, 0.01, 0.45, 40);
  rug.scale.z = 0.62;
  const cushion = box(1.35, 0.16, 1.05, mat('#9fc8e8'), TABLE_X, 0.08, -0.12, 0.08);
  const blanket = box(2.62, TABLE_TOP - 0.08, 1.28, new THREE.MeshStandardMaterial({ map: plaid(), roughness: 0.95 }), TABLE_X, (TABLE_TOP - 0.08) / 2, 0.88, 0.12);
  const top = box(2.8, 0.08, 1.42, mat('#c8935e'), TABLE_X, TABLE_TOP - 0.04, 0.88, 0.04);
  g.add(rug, cushion, blanket, top);
  // tangerines (always) and dinner (while eating)
  const bowl = group(cyl(0.3, 0.2, 0.16, mat('#fffaf0'), 0, 0.08, 0));
  [[-0.1, 0.18, 0], [0.12, 0.18, 0.05], [0.0, 0.2, -0.12], [0.02, 0.32, 0.0]].forEach(([x, y, z]) => bowl.add(ball(0.12, mat('#f39a2e'), x, y, z, 1, 0.85, 1)));
  bowl.position.set(TABLE_X - 0.95, TABLE_TOP, 0.95);
  const dinner = group(
    cyl(0.17, 0.12, 0.14, mat('#fffaf0'), 0, 0.07, 0),
    ball(0.15, mat('#ffffff'), 0, 0.14, 0, 1, 0.5, 1),
    cyl(0.2, 0.2, 0.04, mat('#e9e4da'), 0.45, 0.02, 0.15),
    ball(0.1, mat('#e5584f'), 0.45, 0.06, 0.15, 1, 0.5, 1),
    cyl(0.2, 0.2, 0.04, mat('#e9e4da'), -0.45, 0.02, 0.2),
    ball(0.11, mat('#5bb36a'), -0.45, 0.06, 0.2, 1, 0.5, 1)
  );
  dinner.position.set(TABLE_X - 0.15, TABLE_TOP, 0.72);
  dinner.visible = false;
  g.add(bowl, dinner);

  // TV on a low stand, turned toward the table
  const tvScreen = new THREE.MeshStandardMaterial({ map: cartoon(), emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.5 });
  tvScreen.emissiveMap = tvScreen.map;
  const tv = group(
    box(1.8, 0.55, 0.62, mat('#c8935e'), 0, 0.275, 0, 0.05),
    box(1.95, 1.15, 0.12, mat('#3f4652'), 0, 1.2, 0, 0.06),
    plane(1.8, 1.0, tvScreen, 0, 1.2, 0.065),
    cyl(0.08, 0.1, 0.1, mat('#3f4652'), 0, 0.6, 0)
  );
  tv.position.set(-3.55, 0, -1.05);
  tv.rotation.y = 0.55;
  g.add(tv);

  // floor lamp (lit in the evening)
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#fff3da', emissive: '#ffcf86', emissiveIntensity: 0, roughness: 0.7 });
  const lamp = group(cyl(0.3, 0.34, 0.06, mat('#7a5232'), 0, 0.03, 0), cyl(0.035, 0.035, 2.5, mat('#7a5232'), 0, 1.28, 0), cyl(0.28, 0.48, 0.55, shadeMat, 0, 2.6, 0));
  lamp.position.set(2.85, 0, -1.55);
  const lampLight = new THREE.PointLight('#ffd49a', 0, 9, 1.6);
  lampLight.position.set(2.85, 2.3, -1.2);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, depthWrite: false, opacity: 0 }));
  lampGlow.scale.set(2.4, 2.4, 1);
  lampGlow.position.set(2.85, 2.55, -1.3);
  g.add(lamp, lampLight, lampGlow);

  // bed
  const bedWood = mat('#c8935e');
  g.add(
    box(4.3, 0.36, 2.1, bedWood, 4.75, 0.18, -0.95, 0.06),
    box(4.1, 0.32, 1.95, mat('#fffaf0'), 4.7, 0.52, -0.95, 0.12),
    box(0.18, 1.6, 2.1, bedWood, 6.9, 0.8, -0.95, 0.08),
    box(1.05, 0.42, 1.3, mat('#ffffff'), 6.1, 0.86, -0.9, 0.18)
  );
  const duvetMat = mat('#a9c7ef');
  const folded = box(1.3, 0.34, 1.95, duvetMat, 3.4, 0.85, -0.95, 0.14);
  const duvet = box(2.3, 1.85, 2.0, duvetMat, 3.95, 1.57, -0.85, 0.55);
  const duvetFold = box(0.5, 1.75, 2.04, mat('#ffffff'), 5.0, 1.55, -0.85, 0.24);
  g.add(folded, duvet, duvetFold);
  const zs = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zzz(), transparent: true, depthWrite: false }));
    s.userData.phase = i / 3;
    g.add(s);
    return s;
  });

  /* ---- routines */
  // under the table the legs stretch out forward, a little apart
  const legsOut = (side) => ({ hip: [-1.5, 0, side === 'L' ? -0.08 : 0.08], knee: 0.15, ankle: 0.6 });
  // how far below the shoulder the table top is (-0.12 with the original proportions)
  const reach = { y: -0.12 };
  const onTable = (side) => ({ hand: mirror([-0.1, reach.y, 0.46], side), pole: [side === 'L' ? -1 : 1, -0.6, -0.4], flex: -0.1 });
  const PHONE = [-0.1, 0.06, 0.44]; // y: above the table hands
  const phone = group(box(0.3, 0.46, 0.05, mat('#3f4652'), 0, 0, 0, 0.04), plane(0.25, 0.38, new THREE.MeshBasicMaterial({ color: '#ffe3ea' }), 0, 0, 0.03));
  g.add(phone);
  const head = { x: 0, y: 0, z: 0 };
  const hour = () => new Date(world.ctx.now ? world.ctx.now() : Date.now()).getHours();
  const dinnerTime = () => {
    const h = hour();
    return h >= 18 && h < 21;
  };
  const tableActs = new Routine(world, [
    {
      id: 'eat',
      w: 2,
      dur: [8, 14],
      status: () => (dinnerTime() ? '저녁 먹는 중 🍚' : '귤 까먹는 중 🍊'),
      pose: {
        arm: (side, t) =>
          side === 'R' ? { hand: [-0.12, reach.y + 0.04 + Math.max(0, Math.sin(t * 3)) * 0.1, 0.45], pole: [1, -0.5, -0.5], flex: 0.2 } : onTable(side),
        leg: legsOut,
        head: { x: 0.12, y: 0, z: 0 },
      },
    },
    { id: 'tv', w: 3, dur: [10, 18], status: 'TV 보는 중 📺', pose: { arm: onTable, leg: legsOut, head: { x: 0.02, y: -0.42, z: -0.04 } } },
    {
      id: 'phone',
      w: 2,
      dur: [8, 14],
      status: '폰 보는 중 📱',
      pose: { arm: (side) => ({ hand: mirror([PHONE[0], reach.y + PHONE[1], PHONE[2]], side), pole: [side === 'L' ? -1 : 1, -0.7, -0.3], flex: 0.3 }), leg: legsOut, head: { x: 0.14, y: 0, z: 0 } },
    },
    { id: 'relax', w: 1.5, dur: [6, 10], status: '뒹굴뒹굴 쉬는 중 🛋️', pose: { arm: onTable, leg: legsOut, head: { x: -0.05, y: 0.15, z: 0.1 } } },
    {
      id: 'doze',
      w: 1,
      dur: [6, 10],
      status: '꾸벅꾸벅… 💤',
      pose: { arm: onTable, leg: legsOut, head, eyes: 'closed' },
      update: (dt, t) => {
        head.x = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.14;
        head.z = 0.08 * Math.sin(t * 0.4);
      },
    },
  ]);
  /* morning pacing: a walk cycle while the holder slides toward a spot, then stand facing us.
   * One cycle (two steps) covers about STRIDE, so the feet do not skate. */
  const STRIDE = 0.95;
  const SPEED = 0.7;
  const walk = { x: READY[0], to: READY[0], phase: 0, moving: false, wait: 0 };
  const nextStop = () => {
    let to = walk.x;
    for (let i = 0; i < 6 && Math.abs(to - walk.x) < 0.5; i++) to = PACE[0] + Math.random() * (PACE[1] - PACE[0]);
    walk.to = to;
    walk.moving = true;
  };
  const walkLegs = (side) => {
    if (!walk.moving) return null;
    const p = walk.phase + (side === 'L' ? 0 : Math.PI);
    return { hip: [-0.42 * Math.sin(p), 0, 0], knee: 0.1 + 0.8 * Math.max(0, Math.cos(p)), ankle: 0.2 * Math.sin(p) };
  };
  const walkArms = (side) => {
    if (!walk.moving) return null;
    // each arm swings with the opposite leg
    const p = walk.phase + (side === 'L' ? Math.PI : 0);
    return { hand: mirror([0.24, -0.5, 0.05 + 0.15 * Math.sin(p)], side), pole: [side === 'L' ? -0.25 : 0.25, 0.1, -1] };
  };
  const readyActs = new Routine(world, [
    {
      id: 'pace',
      w: 3,
      dur: [6, 10],
      status: '왔다 갔다 출근 준비 중 🧦',
      pose: { arm: walkArms, leg: walkLegs },
      enter: () => {
        walk.wait = 0;
        nextStop();
      },
      update: (dt) => {
        const d = walk.to - walk.x;
        if (Math.abs(d) < 0.02) {
          // stop for a moment (facing us), then head somewhere else
          walk.moving = false;
          walk.wait += dt;
          if (walk.wait > 1.2) {
            walk.wait = 0;
            nextStop();
          }
          return;
        }
        const step = Math.sign(d) * Math.min(Math.abs(d), SPEED * dt);
        walk.x += step;
        walk.phase += (Math.abs(step) / STRIDE) * Math.PI * 2;
      },
    },
    { id: 'idle', w: 2, dur: [4, 7], status: '출근 준비 중 👔', pose: null },
    { id: 'stretch', w: 1.5, dur: [3, 5], status: '기지개 쭈욱~', pose: { arm: (side) => ({ hand: mirror([0.44, 0.24, 0.12], side), pole: [side === 'L' ? -1 : 1, -1, -0.2] }), head: { x: -0.14, y: 0, z: 0 }, eyes: 'closed' } },
    { id: 'yawn', w: 1, dur: [2.5, 4], status: '하암~ 졸려', pose: { arm: null, head: { x: -0.18, y: 0, z: 0.06 }, eyes: 'closed' } },
    { id: 'look', w: 1.5, dur: [4, 6], status: '오늘 날씨 어떨까? 🌤️', pose: { arm: null, head: { x: -0.06, y: -0.5, z: 0 } } },
    { id: 'wave', w: 1, dur: [2.5, 3], status: '오늘도 화이팅! 💪', pose: null, enter: () => world.character.play('wave') },
  ]);
  // hands tucked in front of the belly so they stay under the duvet
  const tucked = (side) => ({ hand: mirror([-0.12, -0.4, 0.25], side), pole: [side === 'L' ? -1 : 1, -0.4, -0.6] });
  const curled = (side) => ({ hip: [-0.6, 0, 0], knee: side === 'L' ? 1.1 : 0.9, ankle: 0.3 });
  const bedActs = new Routine(world, [{ id: 'sleep', w: 1, dur: [999, 999], status: '쿨쿨 자는 중 💤', pose: { arm: tucked, leg: curled, head: { x: 0, y: 0, z: 0.05 }, eyes: 'closed' } }]);
  const routines = { table: tableActs, ready: readyActs, bed: bedActs };

  let spot = null;
  const tmp = new THREE.Vector3();

  function place(w, s) {
    spot = s;
    w.holder.rotation.set(0, 0, 0);
    w.character.anim.yaw = 0;
    if (s === 'bed') {
      // on its side facing us, head on the pillow (char +Y -> world +X)
      w.holder.rotation.z = -Math.PI / 2;
      // a smaller head lies lower on the pillow
      w.holder.position.set(BED.head[0] - 2.56 - w.character.lift, BED.head[1] - (1 - w.character.headSize), BED.head[2]);
      w.lightAt(4.4, -0.6);
    } else if (s === 'ready') {
      w.holder.position.set(...READY);
      walk.x = walk.to = READY[0];
      walk.moving = false;
      w.lightAt(0.8, 0);
    } else {
      w.holder.position.set(TABLE_X, -SIT + w.seatShift(), 0);
      reach.y = TABLE_TOP + 0.12 - (w.holder.position.y + w.shoulderY());
      w.lightAt(0, 0);
    }
    folded.visible = s !== 'bed';
    duvet.visible = duvetFold.visible = s === 'bed';
    zs.forEach((z) => (z.visible = s === 'bed'));
    const r = routines[s];
    r.cur = null;
    r.forced = null;
    r.start();
  }

  return {
    group: g,
    get routine() {
      return routines[spot];
    },
    frame(aspect, ctx) {
      // the same high, pulled-back view everywhere; the camera pans between the spots
      return world.view('home_' + (ctx.spot || 'table'), aspect);
    },
    enter(ctx, w) {
      place(w, ctx.spot || 'table');
    },
    sky(s) {
      // the lamp comes on gradually as it gets dark
      const dark = s.dark;
      patch.userData.update(s, 1.45, -2.0);
      lampLight.intensity = dark * 7;
      shadeMat.emissiveIntensity = dark * 0.9;
      lampGlow.material.opacity = dark * 0.8;
      tvScreen.emissiveIntensity = 0.25 + dark * 0.35;
    },
    update(dt, t, ctx, w) {
      clock.set(new Date(ctx.now ? ctx.now() : Date.now()));
      const want = ctx.spot || 'table';
      if (want !== spot) place(w, want);
      const r = routines[spot];
      r.force(ctx.act && r.list.some((a) => a.id === ctx.act) ? ctx.act : spot === 'bed' ? 'sleep' : null);
      r.update(dt, t);
      const cur = r.cur && r.cur.id;
      if (spot === 'ready') {
        // pacing: slide along, bob with the steps, turn to face the way we walk
        if (cur !== 'pace') walk.moving = false;
        const bob = walk.moving ? 0.03 * Math.abs(Math.cos(walk.phase)) : 0;
        w.holder.position.set(walk.x, bob, READY[2]);
        const face = walk.moving ? (Math.sign(walk.to - walk.x) * Math.PI) / 2 : 0;
        const a = w.character.anim;
        a.yaw += (face - a.yaw) * Math.min(1, dt * 7);
      }
      dinner.visible = spot === 'table' && cur === 'eat' && dinnerTime();
      phone.visible = spot === 'table' && cur === 'phone';
      if (phone.visible) {
        w.handWorld('L', tmp);
        const a = tmp.clone();
        w.handWorld('R', tmp);
        phone.position.set((a.x + tmp.x) / 2, (a.y + tmp.y) / 2 + 0.12, (a.z + tmp.z) / 2 + 0.06);
        phone.rotation.set(-0.5, 0, 0);
      }
      if (spot === 'bed') {
        zs.forEach((z) => {
          const u = (t * 0.28 + z.userData.phase) % 1;
          z.position.set(BED.head[0] - 0.7 - u * 0.5, BED.head[1] + 1.0 + u * 1.3, BED.head[2] + 0.6);
          const s = 0.25 + u * 0.3;
          z.scale.set(s, s, 1);
          z.material.opacity = Math.sin(u * Math.PI);
        });
      }
    },
  };
}
