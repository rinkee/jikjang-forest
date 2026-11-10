/*
 * 직장의 숲 · 하루 — office.js (the character's desk)
 *
 * The character sits on a low office chair (thighs forward, shins down, feet swinging a
 * little above the floor) behind an open desk, so its legs show underneath.
 * A basket on the desk fills with acorns as the day goes on.
 */
import { THREE, mat, box, cyl, ball, plane, group, shade, signTex, screenTex, acorn, acornPile, canvasTex, wallClock, sunPatch, FONT } from './kit.js';
import { Routine } from './world.js';
import { todosFor } from './todo.js';

const WALL_Z = -2.6;
const SINK = 0.26; // the leg pivot ends up at 0.56: thighs rest on a seat at 0.37
const SEAT_Y = 0.37;
const DESK_Y = 0.9; // top surface; the knees (0.75) clear its underside
const BASKET = new THREE.Vector3(-1.72, DESK_Y, 0.84);
const MUG_SPOT = new THREE.Vector3(0.66, DESK_Y, 1.02);
const PER_ACORN_IN_PILE = 10; // one acorn in the basket for every 10 earned
const PILE_MAX = 64; // the basket holds fewer (see acornPile); it is full at about 500 acorns

/* hand targets, relative to the shoulder (R side; L mirrors x) */
const TYPE = [-0.08, -0.18, 0.46]; // y is replaced by the desk height below the shoulder (see reach)
const POLE_OUT = (sx) => [sx * 1, -0.6, -0.4];
const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);
const MONITOR = [1.3, 0.95]; // x, z on the desk; the screen turns toward the character

/** whiteboard: today's to-do list, the first `done` items ticked off */
function drawBoard(c, w, h, items, done) {
  c.fillStyle = '#fbfbf7';
  c.fillRect(0, 0, w, h);
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = '#5aa9e6';
  c.font = `58px ${FONT}`;
  c.fillText('오늘의 할 일', w / 2, 50);
  c.fillRect(w / 2 - 150, 86, 300, 5);
  c.textAlign = 'left';
  const x0 = 96;
  items.forEach((text, i) => {
    const y = 136 + i * 66;
    const ok = i < done;
    // box, ticked in green when done
    c.lineWidth = 6;
    c.strokeStyle = ok ? '#5bb36a' : '#7a5d45';
    c.strokeRect(36, y - 21, 42, 42);
    if (ok) {
      c.strokeStyle = '#3f8f4f';
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(42, y - 2);
      c.lineTo(56, y + 14);
      c.lineTo(84, y - 26);
      c.stroke();
    }
    let size = 48;
    c.font = `${size}px ${FONT}`;
    while (size > 30 && c.measureText(text).width > w - x0 - 18) c.font = `${(size -= 2)}px ${FONT}`;
    c.fillStyle = ok ? '#a99c8d' : '#4a3323';
    c.fillText(text, x0, y + 3);
    if (ok) {
      c.fillStyle = '#a99c8d';
      c.fillRect(x0 - 4, y + 2, c.measureText(text).width + 8, 4);
    }
  });
}
/* sitting legs: thighs forward and a little apart, shins down; swing > 0 kicks the feet */
const sitLegs = (swing = 0, rate = 2.6) => (side, t) => ({
  hip: [-1.5, 0, side === 'L' ? -0.07 : 0.07],
  knee: 1.45 + swing * Math.sin(t * rate + (side === 'L' ? Math.PI : 0)),
  ankle: 0.1,
});

export function buildOffice(world) {
  const g = new THREE.Group();
  g.name = 'office';

  /* ---- room: carpet tiles, a wainscoted back wall, a rug under the desk */
  const tiles = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#98aaa2';
    c.fillRect(0, 0, w, h);
    [[0, 0], [1, 1]].forEach(([i, j]) => {
      c.fillStyle = '#8fa199';
      c.fillRect(i * 128, j * 128, 128, 128);
    });
    c.strokeStyle = 'rgba(80,100,95,0.18)';
    c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
    c.beginPath();
    c.moveTo(128, 0);
    c.lineTo(128, h);
    c.moveTo(0, 128);
    c.lineTo(w, 128);
    c.stroke();
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(15, 15);
  const floor = plane(30, 30, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  const wall = plane(30, 16, mat('#f6eedb'), 0, 8, WALL_Z);
  const wainscot = box(30, 1.25, 0.1, mat('#d9c39b'), 0, 0.625, WALL_Z + 0.05, 0.02);
  const rail = box(30, 0.08, 0.16, mat('#bf9f72'), 0, 1.27, WALL_Z + 0.08, 0.02);
  const rug = box(6.0, 0.02, 3.4, mat('#a7c79a'), 0, 0.01, 0.35, 0.01);
  const rugEdge = box(6.3, 0.015, 3.7, mat('#f4ecd8'), 0, 0.005, 0.35, 0.01);
  g.add(floor, wall, wainscot, rail, rugEdge, rug);

  // window (sky follows the time of day)
  // the view outside is painted from the real time of day (sky.js)
  const glassMat = new THREE.MeshBasicMaterial({ map: world.painter.texture('office'), toneMapped: false });
  const win = group(
    plane(2.5, 1.8, glassMat, 0, 0, 0),
    box(2.7, 0.14, 0.12, mat('#ffffff'), 0, 0.97, 0.03, 0.04),
    box(2.7, 0.14, 0.12, mat('#ffffff'), 0, -0.97, 0.03, 0.04),
    box(0.14, 2.08, 0.12, mat('#ffffff'), -1.32, 0, 0.03, 0.04),
    box(0.14, 2.08, 0.12, mat('#ffffff'), 1.32, 0, 0.03, 0.04),
    box(0.08, 1.8, 0.08, mat('#ffffff'), 0, 0, 0.03, 0.02),
    box(2.9, 0.12, 0.34, mat('#f3ead6'), 0, -1.05, 0.12, 0.04)
  );
  win.position.set(-1.7, 3.0, WALL_Z + 0.04);
  g.add(win);

  // wall clock showing the real time
  const clock = wallClock();
  clock.group.position.set(0.6, 3.45, WALL_Z + 0.07);
  g.add(clock.group);

  // sunlight through the window onto the floor
  const patch = sunPatch(2.2, 1.6);
  g.add(patch);

  // whiteboard with today's to-do list (by department, new every day), sticky notes around it
  const boardTex = canvasTex(520, 312, (c, w, h) => drawBoard(c, w, h, [], 0));
  const board = group(
    box(1.9, 1.2, 0.06, mat('#fbfbf7'), 0, 0, 0, 0.04),
    plane(1.75, 1.05, new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5 }), 0, 0, 0.035),
    box(2.0, 0.07, 0.12, mat('#9aa3ad'), 0, -0.64, 0.04, 0.02)
  );
  board.position.set(2.45, 3.05, WALL_Z + 0.05);
  g.add(board);
  let boardKey = null;
  const setBoard = (dept, ms, done) => {
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${dept || ''}|${done}`;
    if (key === boardKey) return;
    boardKey = key;
    const c = boardTex.userData.canvas;
    drawBoard(c.getContext('2d'), c.width, c.height, todosFor(dept, ms), done);
    boardTex.needsUpdate = true;
  };
  // repaint once the web font has loaded
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => (boardKey = null));
  [
    ['#fdf0b8', 1.3, 2.62, 0.1],
    ['#ffe3ea', 3.72, 3.38, -0.12],
    ['#dff2d8', 4.12, 2.92, -0.06],
  ].forEach(([c, x, y, r]) => {
    const n = plane(0.34, 0.34, mat(c), x, y, WALL_Z + 0.04);
    n.rotation.z = r;
    g.add(n);
  });

  // round potted plants
  const pottedPlant = (x, z, k = 1, pot = '#e8d9bf') => {
    const p = group(
      cyl(0.32, 0.25, 0.6, mat(pot), 0, 0.3, 0),
      ball(0.42, mat('#6fb27a'), 0, 1.0, 0),
      ball(0.34, mat('#5ea56b'), -0.25, 1.35, 0.05),
      ball(0.3, mat('#7cbd86'), 0.22, 1.45, -0.05),
      ball(0.26, mat('#5ea56b'), 0.0, 1.75, 0.0)
    );
    p.position.set(x, 0, z);
    p.scale.setScalar(k);
    g.add(p);
    return p;
  };
  pottedPlant(-3.95, -2.05, 1.15);
  pottedPlant(3.85, 1.7, 0.9, '#f3d9b6');

  // bookshelf with binders against the back wall
  const shelf = group(box(1.9, 2.0, 0.62, mat('#c99f6e'), 0, 1.0, 0, 0.04));
  [0.35, 1.1].forEach((y) => {
    shelf.add(box(1.75, 0.66, 0.5, mat('#a87c4f'), 0, y + 0.33, 0.07, 0.02));
    ['#5aa9e6', '#f6d04d', '#e5584f', '#5bb36a', '#b7a6d6', '#f7b2c0', '#5aa9e6'].forEach((c, i) => {
      if ((i + y * 3) % 5 > 3.6) return;
      shelf.add(box(0.17, 0.56 - (i % 3) * 0.05, 0.42, mat(c), -0.68 + i * 0.22, y + 0.3 - (i % 3) * 0.025, 0.09, 0.02));
    });
  });
  shelf.add(cyl(0.16, 0.13, 0.26, mat('#fffaf0'), 0.55, 2.13, 0), ball(0.24, mat('#6fb27a'), 0.55, 2.4, 0));
  shelf.position.set(3.0, 0, WALL_Z + 0.35);
  g.add(shelf);

  // water cooler
  const cooler = group(
    box(0.7, 1.15, 0.6, mat('#f4f1ea'), 0, 0.575, 0, 0.06),
    cyl(0.27, 0.27, 0.62, new THREE.MeshStandardMaterial({ color: '#9fd3f2', roughness: 0.15, transparent: true, opacity: 0.75 }), 0, 1.47, 0),
    box(0.14, 0.08, 0.06, mat('#5aa9e6'), -0.14, 0.82, 0.32, 0.02),
    box(0.14, 0.08, 0.06, mat('#e5584f'), 0.14, 0.82, 0.32, 0.02)
  );
  cooler.position.set(-2.95, 0, WALL_Z + 0.4);
  g.add(cooler);

  // waste bin by the desk
  g.add(cyl(0.26, 0.21, 0.5, mat('#9aa3ad'), -3.0, 0.25, 0.9), cyl(0.22, 0.22, 0.02, mat('#6d747c'), -3.0, 0.49, 0.9));

  /* ---- chair: seat, back, gas lift and a five-spoke base on little wheels */
  const chairM = mat('#5f9fb8');
  const steel = mat('#8a8f99');
  const chair = group(
    box(1.05, 0.12, 0.92, chairM, 0, SEAT_Y - 0.06, -0.08, 0.06),
    box(1.3, 1.05, 0.18, chairM, 0, SEAT_Y + 0.6, -0.62, 0.12),
    box(0.16, 0.5, 0.08, steel, 0, SEAT_Y + 0.08, -0.56, 0.03),
    cyl(0.05, 0.05, SEAT_Y - 0.12, steel, 0, (SEAT_Y - 0.12) / 2 + 0.05, -0.08)
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const spoke = box(0.42, 0.04, 0.07, steel, Math.cos(a) * 0.2, 0.07, -0.08 + Math.sin(a) * 0.2, 0.02);
    spoke.rotation.y = -a;
    chair.add(spoke, ball(0.045, mat('#3f4652'), Math.cos(a) * 0.4, 0.045, -0.08 + Math.sin(a) * 0.4));
  }
  g.add(chair);

  /* ---- desk */
  const wood = mat('#d9b48a');
  const woodD = mat('#b98d5f');
  g.add(
    box(5.3, 0.09, 1.02, wood, 0, DESK_Y - 0.045, 0.87, 0.03),
    box(5.1, 0.07, 0.05, woodD, 0, DESK_Y - 0.12, 1.34, 0.02), // apron under the front edge (the front is open)
    box(0.08, DESK_Y - 0.06, 0.9, woodD, -2.55, (DESK_Y - 0.06) / 2, 0.87, 0.02),
    box(0.08, DESK_Y - 0.06, 0.9, woodD, 2.55, (DESK_Y - 0.06) / 2, 0.87, 0.02)
  );

  // keyboard + mouse
  const keyboard = group(box(1.12, 0.05, 0.36, mat('#f4f1ea'), 0, 0, 0, 0.02));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) keyboard.add(box(0.09, 0.03, 0.08, mat('#dcd6c8'), -0.44 + c * 0.11, 0.035, -0.1 + r * 0.1, 0.012));
  keyboard.position.set(0, DESK_Y + 0.025, 0.58);
  g.add(keyboard, ball(0.08, mat('#f4f1ea'), 0.9, DESK_Y + 0.03, 0.6, 1, 0.45, 1.3));

  // monitor: the screen faces the character, so from here we see its back (with an acorn logo)
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex(), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.4 });
  const logo = acorn(1.5);
  logo.position.set(0, 0.9, -0.07);
  const monitor = group(
    box(0.5, 0.04, 0.34, mat('#8a8f99'), 0, 0.02, 0, 0.02),
    cyl(0.05, 0.05, 0.42, mat('#8a8f99'), 0, 0.25, -0.06),
    box(0.36, 0.26, 0.06, mat('#5d6470'), 0, 0.62, -0.06, 0.03), // stand bracket on the back
    box(1.2, 0.78, 0.08, mat('#3f4652'), 0, 0.86, 0, 0.05),
    plane(1.08, 0.66, screenMat, 0, 0.86, 0.045),
    logo
  );
  monitor.position.set(MONITOR[0], DESK_Y, MONITOR[1]);
  monitor.rotation.y = Math.atan2(-MONITOR[0], -MONITOR[1]);
  g.add(monitor);

  // name plate on the front edge
  const plateMat = new THREE.MeshStandardMaterial({ map: null, roughness: 0.6 });
  const plate = group(box(0.98, 0.26, 0.06, mat('#7a5232'), 0, 0, -0.01, 0.03), plane(0.9, 0.2, plateMat, 0, 0, 0.025));
  plate.position.set(-0.75, DESK_Y + 0.14, 1.2);
  plate.rotation.x = -0.25;
  g.add(plate);
  let plateKey = null;

  // mug (moves to the hand when the character takes a sip)
  const mug = group(cyl(0.12, 0.11, 0.22, mat('#f7b2c0'), 0, 0.11, 0), cyl(0.1, 0.1, 0.01, mat('#6b4632'), 0, 0.215, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.022, 8, 16), mat('#f7b2c0'));
  handle.position.set(0.13, 0.11, 0);
  mug.add(shade(handle));
  mug.position.copy(MUG_SPOT);
  g.add(mug);

  // lunch box (only at lunch time)
  const lunch = group(
    box(0.7, 0.14, 0.42, mat('#e5584f'), 0, 0.07, 0, 0.05),
    box(0.62, 0.04, 0.34, mat('#fffaf0'), 0, 0.14, 0, 0.03),
    ball(0.07, mat('#f6d04d'), -0.15, 0.17, 0, 1, 0.6, 1),
    ball(0.06, mat('#5bb36a'), 0.05, 0.17, 0.05, 1, 0.6, 1),
    ball(0.06, mat('#e07d93'), 0.18, 0.17, -0.05, 1, 0.6, 1)
  );
  lunch.position.set(0, DESK_Y, 0.6);
  lunch.visible = false;
  g.add(lunch);

  // the acorn basket
  const basketMat = mat('#c9955f', { side: THREE.DoubleSide });
  const basketRim = shade(new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 8, 32), mat('#a8754a')));
  basketRim.rotation.x = Math.PI / 2;
  basketRim.position.y = 0.16;
  const basket = group(
    shade(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 0.32, 28, 1, true), basketMat)),
    cyl(0.42, 0.42, 0.02, basketMat, 0, -0.15, 0),
    basketRim
  );
  basket.position.set(BASKET.x, BASKET.y + 0.16, BASKET.z);
  const pile = acornPile(PILE_MAX, 0.4, 1.25);
  pile.position.set(BASKET.x, BASKET.y + 0.01, BASKET.z);
  g.add(basket, pile);
  const falling = []; // acorns dropping into the basket

  /* ---- routine */
  // how far below the shoulder the desk top is (hands rest just above it): -0.18 with the original proportions
  const reach = { y: -0.18 };
  const typing = (side, t) => {
    const ph = side === 'L' ? 0 : 1.7;
    const tap = Math.max(0, Math.sin(t * 13 + ph)) * Math.max(0, Math.sin(t * 2.3 + ph));
    const v = mirror([TYPE[0], reach.y, TYPE[2]], side);
    return { hand: [v[0], v[1] + tap * 0.035, v[2]], pole: POLE_OUT(side === 'L' ? -1 : 1), flex: -0.2 };
  };
  const resting = (side) => ({ hand: mirror([-0.1, reach.y - 0.02, 0.44], side), pole: POLE_OUT(side === 'L' ? -1 : 1), flex: -0.1 });
  const ctxRef = { ctx: world.ctx };
  const late = () => !!ctxRef.ctx.overtime;
  const weary = () => (ctxRef.ctx.stamina ?? 100) < 25;

  const head = { x: 0, y: 0, z: 0 };
  const act = (id, w, dur, status, pose, extra) => Object.assign({ id, w, dur, status, pose }, extra);
  const routine = new Routine(world, [
    act('type', 6, [10, 24], () => (weary() ? '기운 없이 일하는 중… 🥱' : late() ? '야근 중… 🌙' : '열심히 일하는 중 ⌨️'), { arm: typing, leg: sitLegs(0.18), head: { x: 0.05, y: 0.34, z: 0 } }),
    act('coffee', 1.4, [6, 9], '커피 한 모금 ☕', {
      arm: (side, t) => (side === 'R' ? { hand: [-0.02, reach.y + 0.15, 0.44], pole: [1, -0.5, -0.5], flex: 0.3 } : typing(side, t)),
      leg: sitLegs(0.08, 1.6),
      head: { x: 0.12, y: 0, z: 0 },
    }),
    act('stretch', 1, [4, 6], '기지개 쭈욱~', {
      arm: (side) => ({ hand: mirror([0.42, 0.26, 0.12], side), pole: [side === 'L' ? -1 : 1, -1, -0.2] }),
      // legs stretch straight out under the desk, toes pointed
      leg: (side) => ({ hip: [-1.42, 0, side === 'L' ? -0.1 : 0.1], knee: 0.15, ankle: 0.5 }),
      head: { x: -0.14, y: 0, z: 0 },
      eyes: 'closed',
    }),
    act('think', 1.4, [6, 10], '음… 고민 중 🤔', {
      arm: (side, t) =>
        side === 'R' ? { hand: [-0.16, reach.y - 0.01 + Math.max(0, Math.sin(t * 9)) * 0.03, 0.42], pole: [1, -0.6, -0.4] } : resting(side),
      // one ankle tucked behind the other
      leg: (side) => ({ hip: [-1.5, 0, side === 'L' ? 0.02 : 0.1], knee: side === 'L' ? 1.9 : 1.3, ankle: 0.2 }),
      head: { x: 0.02, y: 0.28, z: 0.12 },
    }),
    act('doze', 1, [6, 12], '꾸벅꾸벅… 💤', { arm: resting, leg: sitLegs(0), head, eyes: 'closed' }, {
      update: (dt, t) => {
        head.x = 0.12 + Math.max(0, Math.sin(t * 0.9)) * 0.14;
        head.z = 0.08 * Math.sin(t * 0.45);
      },
    }),
    act('lunch', 0, [3600, 3600], '점심 먹는 중 🍱', {
      arm: (side, t) =>
        side === 'R' ? { hand: [-0.12, reach.y + 0.05 + Math.max(0, Math.sin(t * 3.2)) * 0.12, 0.44], pole: [1, -0.5, -0.5], flex: 0.2 } : resting(side),
      leg: sitLegs(0.12, 2),
      head: { x: 0.12, y: 0, z: 0 },
    }),
  ]);
  // dozing gets likelier in the mid-afternoon slump and at night
  const dozeAct = routine.list.find((a) => a.id === 'doze');

  let shown = -1;
  const tmp = new THREE.Vector3();

  function setPile(n, animate) {
    const k = Math.min(pile.userData.max, Math.ceil(n / PER_ACORN_IN_PILE));
    if (k === shown) return;
    shown = k;
    pile.userData.set(k);
    if (animate) world.character.play('pop');
  }

  function drop() {
    const a = acorn(1.25);
    a.position.set(BASKET.x + (Math.random() - 0.5) * 0.3, 2.6, BASKET.z + (Math.random() - 0.5) * 0.2);
    a.rotation.set(Math.random(), Math.random() * 6, Math.random());
    a.userData = { vy: 0, spin: (Math.random() - 0.5) * 8, bounces: 0 };
    g.add(a);
    falling.push(a);
  }

  let lastAcorns = null;

  return {
    group: g,
    routine,
    frame(aspect) {
      return world.view('office', aspect);
    },
    enter(ctx, w) {
      ctxRef.ctx = ctx;
      w.holder.position.set(0, -SINK + w.seatShift(), 0);
      reach.y = DESK_Y + 0.12 - (w.holder.position.y + w.shoulderY());
      w.lightAt(0, 0);
      const key = `${ctx.name}|${ctx.rank}`;
      if (key !== plateKey) {
        plateKey = key;
        if (plateMat.map) plateMat.map.dispose();
        plateMat.map = signTex([{ text: ctx.name || '새내기', size: 78 }, { text: [ctx.rank, ctx.dept].filter(Boolean).join(' · ') || '직장의 숲', size: 46, color: '#7a5d45' }], { w: 512, h: 112, bg: '#fff3da', r: 12 });
        plateMat.needsUpdate = true;
      }
      lastAcorns = ctx.todayAcorns || 0;
      boardKey = null;
      shown = -1;
      setPile(lastAcorns, false);
      falling.splice(0).forEach((a) => g.remove(a));
      routine.cur = null;
      routine.forced = null;
      routine.start('type');
    },
    sky(s) {
      // the monitor glows more as the room gets dark
      screenMat.emissiveIntensity = 0.35 * s.dark;
      if (screenMat.emissiveMap !== screenMat.map) {
        screenMat.emissiveMap = screenMat.map;
        screenMat.needsUpdate = true;
      }
      patch.userData.update(s, -1.7, WALL_Z);
    },
    update(dt, t, ctx, w) {
      // the real time on the wall clock
      const d = new Date(ctx.now ? ctx.now() : Date.now());
      clock.set(d);
      setBoard(ctx.dept, d.getTime(), ctx.todoDone ?? 1);

      // lunch hour and how sleepy the character is
      const h = d.getHours() + d.getMinutes() / 60;
      routine.force(ctx.lunch ? 'lunch' : ctx.act || null);
      // and when it is running out of stamina
      const st = ctx.stamina ?? 100;
      dozeAct.w = st < 10 ? 6 : st < 25 ? 3.5 : ctx.overtime ? 2.5 : h >= 14 && h < 16 ? 2 : 0.7;
      routine.update(dt, t);
      const cur = routine.cur && routine.cur.id;
      lunch.visible = cur === 'lunch';
      keyboard.visible = cur !== 'lunch';

      // mug follows the hand while sipping
      if (cur === 'coffee') {
        w.handWorld('R', tmp);
        tmp.y -= 0.08;
        tmp.z += 0.1;
      } else tmp.copy(MUG_SPOT);
      mug.position.lerp(tmp, Math.min(1, dt * 7));

      // acorns
      const n = ctx.todayAcorns || 0;
      if (lastAcorns !== null && n > lastAcorns) {
        for (let i = 0; i < Math.min(3, n - lastAcorns); i++) drop();
      }
      lastAcorns = n;
      for (let i = falling.length - 1; i >= 0; i--) {
        const a = falling[i];
        const u = a.userData;
        u.vy -= 9.8 * dt;
        a.position.y += u.vy * dt;
        a.rotation.y += u.spin * dt;
        const floorY = BASKET.y + 0.12 + (shown / pile.userData.max) * 0.62;
        if (a.position.y < floorY) {
          a.position.y = floorY;
          u.vy = -u.vy * 0.35;
          u.bounces++;
          if (u.bounces > 2) {
            g.remove(a);
            falling.splice(i, 1);
            setPile(n, false);
          }
        }
      }
      if (!falling.length) setPile(n, false);
    },
  };
}
