/*
 * 직장의 숲 · 하루 — subway.js (the ride to work and back; a short cutscene)
 *
 * Seen from across the aisle: the character stands in front of the bench, the city slides by
 * in the windows and the hand straps swing. Going in, it reads its phone in a full car;
 * going home, the car is emptier: it sits on the bench, feet dangling, and nods off.
 * ctx.dir: 'in' | 'out', ctx.ride: 0..1 (the train slows down near the end).
 */
import { THREE, mat, box, cyl, ball, plane, group, shade, canvasTex } from './kit.js';
import { Routine } from './world.js';

const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);

/** a simple seated or standing passenger: round body, round head, dot eyes */
function passenger(color, skin, o) {
  o = o || {};
  const g = new THREE.Group();
  const seated = o.seated !== false;
  const bodyY = seated ? 1.3 : 1.05;
  g.add(box(0.95, seated ? 0.95 : 1.6, 0.7, mat(color), 0, bodyY, 0, 0.3));
  const hy = seated ? 2.2 : 2.35;
  g.add(ball(0.55, mat(skin), 0, hy, 0, 1, 0.95, 0.95));
  const eye = mat('#3a2a20');
  if (o.sleepy) {
    g.add(box(0.12, 0.03, 0.02, eye, -0.18, hy - 0.02, 0.52, 0.01), box(0.12, 0.03, 0.02, eye, 0.18, hy - 0.02, 0.52, 0.01));
  } else {
    g.add(ball(0.05, eye, -0.18, hy - 0.02, 0.5), ball(0.05, eye, 0.18, hy - 0.02, 0.5));
  }
  if (o.phone) g.add(box(0.22, 0.34, 0.04, mat('#3f4652'), 0.05, bodyY + 0.1, 0.4, 0.03));
  if (o.hair) g.add(ball(0.58, mat(o.hair), 0, hy + 0.12, -0.06, 1, 0.8, 0.95));
  return shade(g);
}

export function buildSubway(world) {
  const g = new THREE.Group();
  g.name = 'subway';

  const wallMat = mat('#e9edf0');
  const panel = mat('#d3dbe0');
  /* ---- car shell */
  // the car is cut away along its near side: the aisle floor ends at FLOOR_EDGE, below it the
  // car body (silver with a green stripe) and the track bed sliding past
  const FLOOR_EDGE = 1.45;
  const floor = plane(40, FLOOR_EDGE + 1.95, mat('#a9b2b8'), 0, 0, (FLOOR_EDGE - 1.95) / 2);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor, box(40, 0.012, 0.12, mat('#f6d04d'), 0, 0.006, FLOOR_EDGE - 0.45, 0.004));
  g.add(
    box(40, 0.1, 0.26, mat('#e3e7ea'), 0, -0.04, FLOOR_EDGE + 0.05, 0.03),
    box(40, 1.7, 0.2, mat('#d5dadd', { metalness: 0.3, roughness: 0.45 }), 0, -0.9, FLOOR_EDGE + 0.05, 0.03),
    box(40, 0.24, 0.03, mat('#3fae5a'), 0, -0.45, FLOOR_EDGE + 0.16, 0.01)
  );
  // one track (sleepers + rails) scrolling past on gravel that runs on to the bottom of the screen
  const ballastTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#76706a';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
      c.fillRect((i * 131) % w, (i * 71 + ((i * i) % 23)) % h, 3, 3);
    }
    c.fillStyle = '#8a6a4f';
    for (let x = 0; x < w; x += 64) c.fillRect(x + 18, 8, 28, h - 16);
    c.fillStyle = '#c3c7cb';
    c.fillRect(0, h * 0.25 - 4, w, 8);
    c.fillRect(0, h * 0.75 - 4, w, 8);
  });
  ballastTex.wrapS = THREE.RepeatWrapping;
  ballastTex.repeat.set(26, 1);
  const ballast = plane(40, 1.6, new THREE.MeshStandardMaterial({ map: ballastTex, roughness: 1 }), 0, -1.73, FLOOR_EDGE + 1.5);
  ballast.rotation.x = -Math.PI / 2;
  // the line crosses the river on a bridge: a concrete girder under the track, water below
  const girder = box(40, 0.7, 0.4, mat('#8f887e'), 0, -2.1, FLOOR_EDGE + 2.5, 0.04);
  const under = plane(40, 1.4, mat('#6f6963', { roughness: 1 }), 0, -1.745, FLOOR_EDGE + 0.4); // gravel under the car body
  under.rotation.x = -Math.PI / 2;
  g.add(under);
  const waterTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0)';
    for (let i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(0,0,0,0.07)';
      c.fillRect((i * 67) % w, (i * 41) % h, 30 + (i % 4) * 12, 3);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect((i * 89 + 30) % w, (i * 57 + 9) % h, 14 + (i % 3) * 8, 2);
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(8, 6);
  const waterMat = new THREE.MeshStandardMaterial({ color: '#6fb6d3', map: waterTex, roughness: 0.35, metalness: 0.1 });
  const water = plane(60, 40, waterMat, 0, -4.2, FLOOR_EDGE + 18);
  water.rotation.x = -Math.PI / 2;
  g.add(ballast, girder, water);
  // windows: one long glass strip behind wall panels
  // the city outside is painted from the real time of day (sky.js); it scrolls past
  const glassMat = new THREE.MeshBasicMaterial({ map: world.painter.texture('strip'), toneMapped: false });
  const glass = plane(16, 1.9, glassMat, 0, 3.55, -2.05);
  g.add(glass);
  g.add(
    box(18, 2.6, 0.12, panel, 0, 1.3, -1.95, 0.02), // below the windows
    box(18, 8, 0.12, wallMat, 0, 4.5 + 4, -1.95, 0.02) // above
  );
  [-6.6, -2.2, 2.2, 6.6].forEach((x) => g.add(box(0.9, 1.95, 0.14, wallMat, x, 3.55, -1.95, 0.06)));
  // window frames
  [
    [-4.4, 3.5],
    [0, 3.5],
    [4.4, 3.5],
  ].forEach(([x, w]) => {
    g.add(box(w, 0.1, 0.18, mat('#c3ccd2'), x, 2.62, -1.88, 0.03), box(w, 0.1, 0.18, mat('#c3ccd2'), x, 4.5, -1.88, 0.03));
  });
  // ad posters above the windows
  [
    ['#fdf0b8', -4.4],
    ['#dff2d8', 0],
    ['#ffe3ea', 4.4],
  ].forEach(([c, x]) => g.add(box(2.6, 0.7, 0.04, mat(c), x, 5.15, -1.86, 0.06)));
  // long bench
  const seat = mat('#4fa392');
  g.add(box(16, 0.22, 0.85, seat, 0, 0.92, -1.42, 0.1), box(16, 1.0, 0.2, seat, 0, 1.45, -1.78, 0.1), box(16, 0.82, 0.7, mat('#b9c3c9'), 0, 0.41, -1.45, 0.05));
  // rail with swinging straps
  const rail = cyl(0.045, 0.045, 18, mat('#c9ced3', { metalness: 0.6, roughness: 0.35 }), 0, 5.05, -0.7);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  const straps = [];
  for (let x = -7; x <= 7; x += 1.05) {
    const p = new THREE.Group();
    p.position.set(x, 5.05, -0.7);
    p.add(box(0.07, 0.5, 0.02, mat('#f4f1ea'), 0, -0.26, 0, 0.01));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 20), mat('#f6d04d'));
    ring.position.y = -0.62;
    p.add(shade(ring));
    straps.push(p);
    g.add(p);
  }
  // poles at the ends of the bench
  [-3.9, 3.9].forEach((x) => g.add(cyl(0.05, 0.05, 5.0, mat('#c9ced3', { metalness: 0.6, roughness: 0.35 }), x, 2.5, -0.25)));
  // (no ceiling: the camera looks in from above)

  /* ---- passengers */
  const crowd = [
    passenger('#8fb3d9', '#f1c7a0', { phone: true, hair: '#4a3323' }),
    passenger('#d99a8f', '#e0b48c', { sleepy: true, hair: '#2f2a28' }),
    passenger('#b7a6d6', '#f3d2b4', { phone: true, hair: '#7a5232' }),
  ];
  crowd[0].position.set(-2.85, 0, -1.3);
  crowd[1].position.set(2.75, 0, -1.3);
  crowd[2].position.set(-4.9, 0, -1.3);
  crowd.forEach((p) => g.add(p));
  const standing = passenger('#9ccf9f', '#efc49c', { seated: false, phone: true, hair: '#3a2a20' });
  standing.position.set(4.9, 0, 0.1);
  standing.scale.setScalar(1.05);
  g.add(standing);

  /* ---- the character's phone */
  const phone = group(box(0.3, 0.46, 0.05, mat('#3f4652'), 0, 0, 0, 0.04), plane(0.25, 0.38, new THREE.MeshBasicMaterial({ color: '#cfe9ff' }), 0, 0, 0.03));
  g.add(phone);

  /* ---- routine */
  const head = { x: 0, y: 0, z: 0 };
  const PHONE = [-0.1, -0.16, 0.42];
  const holdPhone = (side) => ({ hand: mirror(PHONE, side), pole: [side === 'L' ? -1 : 1, -0.7, -0.3], flex: 0.3 });
  const routine = new Routine(world, [
    { id: 'phone', w: 3, dur: [3, 6], status: '출근길, 폰 보는 중 📱', pose: { arm: holdPhone, head: { x: 0.14, y: 0, z: 0 } } },
    { id: 'look', w: 1, dur: [2, 3], status: '창밖 구경 중 🌇', pose: { arm: holdPhone, head: { x: -0.02, y: -0.35, z: 0 } } },
    {
      id: 'nod',
      w: 0,
      dur: [99, 99],
      status: '꾸벅꾸벅 집에 가는 중 💤',
      pose: {
        // hands in the lap, feet swinging slowly above the floor
        arm: (side) => ({ hand: mirror([-0.1, -0.33, 0.38], side), pole: [side === 'L' ? -1 : 1, -0.5, -0.4], flex: -0.1 }),
        leg: (side, t) => ({ hip: [-1.45, 0, side === 'L' ? -0.06 : 0.06], knee: 1.35 + 0.16 * Math.sin(t * 1.3 + (side === 'L' ? Math.PI : 0)), ankle: 0.35 }),
        head,
        eyes: 'closed',
      },
      update: (dt, t) => {
        head.x = 0.06 + Math.max(0, Math.sin(t * 1.1)) * 0.12;
        head.z = 0.1 * Math.sin(t * 0.6);
      },
    },
  ]);

  let speed = 0;
  const tmp = new THREE.Vector3();
  const base = new THREE.Vector3();
  // seated: the torso bottom (0.73 with trousers) rests on the seat top (1.03)
  const SEAT_LIFT = 0.31;

  return {
    group: g,
    routine,
    frame(aspect, ctx) {
      // a cut-away car seen from high up in front (no ceiling, no near wall)
      return world.view(ctx.dir === 'out' ? 'subway_out' : 'subway_in', aspect);
    },
    enter(ctx, w) {
      const home = ctx.dir === 'out';
      // standing in the aisle, or sitting on the front edge of the bench (the big head clears the wall)
      base.set(0, home ? SEAT_LIFT + w.seatShift() : 0, home ? -1.0 : 0.35);
      w.holder.position.copy(base);
      w.lightAt(0, home ? -0.8 : 0);
      crowd[2].visible = !home;
      standing.visible = !home;
      crowd[0].visible = true;
      routine.cur = null;
      routine.forced = null;
      if (home) routine.force('nod');
      else routine.start('phone');
      speed = 1;
    },
    sky(s) {
      waterMat.color.set(s.outside.water);
    },
    update(dt, t, ctx, w) {
      routine.update(dt, t);
      // slows down over the last part of the ride
      const r = ctx.ride || 0;
      const target = r > 0.78 ? Math.max(0.05, 1 - (r - 0.78) / 0.2) : 1;
      speed += (target - speed) * Math.min(1, dt * 3);
      glassMat.map.offset.x = (glassMat.map.offset.x + dt * 0.16 * speed) % 1;
      ballastTex.offset.x = (ballastTex.offset.x + dt * 2.2 * speed) % 1;
      waterTex.offset.x = (waterTex.offset.x + dt * 0.12 * speed) % 1;
      // the car rocks; braking leans everyone forward along the track
      const brake = r > 0.78 ? 1 - speed : 0;
      w.holder.rotation.z = (Math.sin(t * 1.9) * 0.012 + Math.sin(t * 0.73) * 0.01) * speed - brake * 0.05;
      w.holder.position.x = base.x + Math.sin(t * 1.3) * 0.03 * speed;
      straps.forEach((p, i) => (p.rotation.z = (Math.sin(t * 1.7 + i * 0.35) * 0.1 + 0.05) * speed + brake * 0.35));
      // phone sits between the hands
      const usingPhone = routine.cur && routine.cur.id !== 'nod';
      phone.visible = usingPhone;
      if (usingPhone) {
        w.handWorld('L', tmp);
        const lx = tmp.x;
        const ly = tmp.y;
        const lz = tmp.z;
        w.handWorld('R', tmp);
        phone.position.set((lx + tmp.x) / 2, (ly + tmp.y) / 2 + 0.12, (lz + tmp.z) / 2 + 0.06);
        phone.rotation.set(-0.5, 0, w.holder.rotation.z);
      }
    },
  };
}
