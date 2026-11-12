/*
 * 직장의 숲 · 하루 — office.js (the character's desk)
 *
 * The character sits on a low office chair (thighs forward, shins down, feet swinging a
 * little above the floor) behind an open desk, so its legs show underneath.
 * A basket on the desk fills with acorns as the day goes on.
 */
import { THREE, mat, box, cyl, ball, plane, group, shade, signTex, screenTex, acorn, acornPile, canvasTex, wallClock, sunPatch, FONT, setDetail } from './kit.js';
import { sceneMat } from '../char3d.js';
import { softBox, softBoxGeo, latheMesh, plant, limb, frameGeo, roundRect, bake, woodTex, weaveTex } from './soft.js';
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

  // shared surfaces: oiled oak with grain, painted trim, powder-coated steel, plastics
  const grain = woodTex(5);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const oak = sceneMat.wood('#dcb68a', { map: grain });
  const oakDark = sceneMat.wood('#b98d5f', { map: grain });
  const walnut = sceneMat.wood('#8a5a38', { map: grain });
  const paint = sceneMat.wood('#fbf8f2', { roughness: 0.45, clearcoat: 0.3 });
  const trim = sceneMat.wood('#d9c39b', { roughness: 0.55, clearcoat: 0.2 });
  const trimLight = sceneMat.wood('#e6d4b0', { roughness: 0.55, clearcoat: 0.2 });
  const trimDark = sceneMat.wood('#bf9f72', { roughness: 0.5, clearcoat: 0.25 });
  const powder = sceneMat.glossy('#ece6dc', { roughness: 0.38 });
  const alu = sceneMat.glossy('#dfe3e8', { roughness: 0.28 });
  const greyPlastic = sceneMat.glossy('#5d6470', { roughness: 0.45 });
  const darkPlastic = sceneMat.glossy('#3f4652', { roughness: 0.45 });
  const whitePlastic = sceneMat.glossy('#f6f3ec', { roughness: 0.35 });
  const brass = sceneMat.metal('#d2ad6e', { roughness: 0.35 });

  /* ---- room: carpet tiles laid in alternating directions, a wainscoted back wall with
   * raised panels, a bordered rug under the desk */
  const tiles = canvasTex(256, 256, (c) => {
    [[0, 0, '#98aaa2', 0], [1, 0, '#93a59d', 1], [0, 1, '#93a59d', 1], [1, 1, '#98aaa2', 0]].forEach(([i, j, col, dir]) => {
      const x = i * 128;
      const y = j * 128;
      c.fillStyle = col;
      c.fillRect(x, y, 128, 128);
      // the pile runs one way on each tile
      for (let k = 0; k < 520; k++) {
        c.fillStyle = k % 2 ? 'rgba(60,80,75,0.09)' : 'rgba(255,255,255,0.09)';
        const px = x + Math.random() * 128;
        const py = y + Math.random() * 128;
        if (dir) c.fillRect(px, py, 1.2, 5);
        else c.fillRect(px, py, 5, 1.2);
      }
    });
    c.strokeStyle = 'rgba(70,90,85,0.22)';
    c.lineWidth = 2;
    c.strokeRect(1, 1, 254, 254);
    c.beginPath();
    c.moveTo(128, 0);
    c.lineTo(128, 256);
    c.moveTo(0, 128);
    c.lineTo(256, 128);
    c.stroke();
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(15, 15);
  const floor = plane(30, 30, new THREE.MeshStandardMaterial({ map: tiles, bumpMap: tiles, bumpScale: 0.6, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor, plane(30, 16, mat('#f6eedb'), 0, 8, WALL_Z));
  setDetail(0.4); // the back wall: far from the camera, always
  {
    const parts = [
      box(30, 1.25, 0.1, trim, 0, 0.625, WALL_Z + 0.05, 0.02),
      box(30, 0.07, 0.16, trimDark, 0, 1.285, WALL_Z + 0.08, 0.025), // chair rail
      box(30, 0.035, 0.12, trimDark, 0, 1.225, WALL_Z + 0.07, 0.012),
      box(30, 0.16, 0.06, paint, 0, 0.08, WALL_Z + 0.13, 0.02), // baseboard
    ];
    for (let x = -9; x <= 9.01; x += 1.8) {
      const [W, H, y, z] = [1.42, 0.7, 0.69, WALL_Z + 0.112];
      parts.push(
        box(W, 0.05, 0.03, trimLight, x, y + H / 2, z, 0.012),
        box(W, 0.05, 0.03, trimLight, x, y - H / 2, z, 0.012),
        box(0.05, H, 0.03, trimLight, x - W / 2, y, z, 0.012),
        box(0.05, H, 0.03, trimLight, x + W / 2, y, z, 0.012)
      );
    }
    g.add(bake(parts));
  }
  setDetail(1);
  {
    const [W, D] = [6.0, 3.4];
    const rugTexture = canvasTex(600, 340, (c, w, h) => {
      c.fillStyle = '#f4ecd8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#a7c79a';
      c.beginPath();
      c.roundRect(26, 26, w - 52, h - 52, 18);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 4;
      c.beginPath();
      c.roundRect(40, 40, w - 80, h - 80, 12);
      c.stroke();
      // little leaves scattered over the field
      for (let k = 0; k < 46; k++) {
        const x = 60 + ((k * 97) % (w - 120));
        const y = 60 + ((k * 61 + (k % 3) * 17) % (h - 120));
        c.save();
        c.translate(x, y);
        c.rotate(k * 1.7);
        c.fillStyle = k % 3 ? 'rgba(80,130,80,0.28)' : 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.fillStyle = 'rgba(0,0,0,0.04)';
      for (let k = 0; k < 5000; k++) c.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    });
    rugTexture.repeat.set(1 / W, 1 / D);
    rugTexture.offset.set(0.5, 0.5);
    const geo = new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), W, D, 0.22), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 });
    const rug = new THREE.Mesh(geo, sceneMat.custom({ color: '#ffffff', map: rugTexture, roughness: 0.95, sheen: 0.5, sheenColor: '#ffffff', sheenRoughness: 0.6 }, '#a7c79a', { cloth: true }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.006, 0.35);
    rug.receiveShadow = true;
    g.add(rug);
  }

  /* everything from here to the water cooler stands along the back wall */
  setDetail(0.4);
  /* ---- window: a deep painted frame, two sliding sashes with a latch, a sill, and a roller
   * blind pulled a little way down */
  // the view outside is painted from the real time of day (sky.js)
  const glassMat = new THREE.MeshBasicMaterial({ map: world.painter.texture('office'), toneMapped: false });
  {
    const parts = [
      box(2.8, 0.15, 0.2, paint, 0, 0.975, 0.06, 0.05),
      box(0.15, 2.1, 0.2, paint, -1.325, 0, 0.06, 0.05),
      box(0.15, 2.1, 0.2, paint, 1.325, 0, 0.06, 0.05),
      box(2.96, 0.09, 0.36, paint, 0, -1.07, 0.15, 0.035), // sill
      box(2.7, 0.12, 0.05, paint, 0, -1.17, 0.05, 0.02), // apron under the sill
    ];
    [[-0.62, 0.02], [0.62, 0.05]].forEach(([x, z]) => {
      const sash = new THREE.Mesh(frameGeo(1.3, 1.82, 0.03, 0.07, 0.035), paint);
      sash.position.set(x, 0, z);
      parts.push(sash);
    });
    parts.push(box(0.05, 0.1, 0.03, brass, -0.05, 0.02, 0.09, 0.012), box(0.07, 0.03, 0.04, brass, -0.02, 0.06, 0.1, 0.01));
    // roller blind
    const blindM = sceneMat.cloth('#efe4cf');
    const roll = cyl(0.065, 0.065, 2.46, blindM, 0, 0.83, 0.13, 20);
    roll.rotation.z = Math.PI / 2;
    parts.push(
      roll,
      cyl(0.07, 0.07, 0.03, whitePlastic, -1.235, 0.83, 0.13, 20),
      cyl(0.07, 0.07, 0.03, whitePlastic, 1.235, 0.83, 0.13, 20),
      box(2.4, 0.36, 0.012, blindM, 0, 0.6, 0.18, 0.005),
      box(2.44, 0.04, 0.04, trimDark, 0, 0.42, 0.18, 0.015),
      limb([0.95, 0.42, 0.2], [0.95, 0.06, 0.2], 0.006, sceneMat.cloth('#d8c8aa')),
      ball(0.026, trimDark, 0.95, 0.04, 0.2)
    );
    parts[parts.length - 5].rotation.z = parts[parts.length - 6].rotation.z = Math.PI / 2; // the roller's end caps
    const win = group(bake(parts), plane(2.5, 1.8, glassMat));
    win.position.set(-1.7, 3.0, WALL_Z + 0.04);
    g.add(win);
  }

  // wall clock showing the real time
  const clock = wallClock();
  clock.group.position.set(0.6, 3.45, WALL_Z + 0.07);
  g.add(clock.group);

  // sunlight through the window onto the floor
  const patch = sunPatch(2.2, 1.6);
  g.add(patch);

  /* ---- whiteboard with today's to-do list (by department, new every day): an aluminium
   * frame with corner caps, a pen tray with markers and an eraser; sticky notes around it */
  const boardTex = canvasTex(520, 312, (c, w, h) => drawBoard(c, w, h, [], 0));
  {
    const frame = new THREE.Mesh(frameGeo(1.96, 1.24, 0.05, 0.075, 0.06), alu);
    frame.position.z = -0.02;
    const parts = [frame, box(1.84, 1.12, 0.03, paint, 0, 0, -0.005, 0.01)];
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => parts.push(box(0.11, 0.11, 0.075, greyPlastic, sx * 0.95, sy * 0.59, 0.01, 0.03))));
    parts.push(
      box(1.72, 0.035, 0.15, alu, 0, -0.66, 0.07, 0.012),
      box(1.72, 0.055, 0.018, alu, 0, -0.635, 0.14, 0.008),
      box(0.05, 0.07, 0.17, greyPlastic, -0.88, -0.645, 0.07, 0.015),
      box(0.05, 0.07, 0.17, greyPlastic, 0.88, -0.645, 0.07, 0.015)
    );
    // markers lying in the tray, an eraser with a felt pad
    [['#3c6fd1', -0.55], ['#e5584f', -0.33], ['#3f4652', -0.12]].forEach(([c, x], i) => {
      const mk = group(cyl(0.022, 0.022, 0.15, whitePlastic, 0, 0, 0, 14), cyl(0.024, 0.024, 0.055, sceneMat.glossy(c), 0, 0.1, 0, 14), cyl(0.012, 0.02, 0.025, sceneMat.glossy(c), 0, -0.088, 0, 12));
      mk.rotation.set(0, i * 0.15 - 0.15, Math.PI / 2);
      mk.position.set(x, -0.615, 0.08 + (i % 2) * 0.02);
      parts.push(mk);
    });
    const eraser = softBox(0.22, 0.07, 0.09, sceneMat.glossy('#5aa9e6', { roughness: 0.4 }), { ex: 0.2, ey: 0.5 });
    eraser.position.set(0.45, -0.58, 0.075);
    parts.push(eraser, box(0.21, 0.025, 0.085, sceneMat.cloth('#4a4f5a'), 0.45, -0.628, 0.075, 0.008));
    const surf = new THREE.MeshPhysicalMaterial({ map: boardTex, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const board = group(bake(parts), plane(1.8, 1.08, surf, 0, 0, 0.012));
    board.position.set(2.45, 3.05, WALL_Z + 0.05);
    g.add(board);
  }
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
  {
    // paper that curls away from the wall toward its free bottom edge, with a few scribbles
    const noteGeo = new THREE.PlaneGeometry(0.34, 0.34, 1, 10);
    const np = noteGeo.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const t = (0.17 - np.getY(i)) / 0.34;
      np.setZ(i, 0.07 * t * t * t);
    }
    noteGeo.computeVertexNormals();
    const scribble = canvasTex(128, 128, (c, w) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, w);
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(0, 0, w, 14);
      c.strokeStyle = 'rgba(60,40,30,0.5)';
      c.lineWidth = 4;
      c.lineCap = 'round';
      [34, 58, 82].forEach((y, k) => {
        c.beginPath();
        c.moveTo(18, y);
        for (let x = 18; x < 104 - k * 18; x += 6) c.lineTo(x, y + Math.sin(x * 0.35 + k) * 2.2);
        c.stroke();
      });
    });
    [
      ['#fdf0b8', 1.3, 2.62, 0.1],
      ['#ffe3ea', 3.72, 3.38, -0.12],
      ['#dff2d8', 4.12, 2.92, -0.06],
    ].forEach(([c, x, y, r]) => {
      const n = shade(new THREE.Mesh(noteGeo, sceneMat.custom({ color: c, map: scribble, roughness: 0.85, side: THREE.DoubleSide }, c)), true, true);
      n.position.set(x, y, WALL_Z + 0.015);
      n.rotation.z = r;
      g.add(n);
    });
  }

  // tall leafy plants in glazed pots
  const pottedPlant = (x, z, k, pot) => {
    const p = plant({ r: 0.3, h: 0.56, leaves: 24, len: 0.88, wide: 0.55, pot, tilt: 1.3, greens: ['#4f9a60', '#5ea56b', '#3f8a52', '#6fb27a'] });
    p.position.set(x, 0, z);
    p.scale.setScalar(k);
    g.add(bake(p));
  };
  pottedPlant(-3.95, -2.05, 1.15, '#e8d9bf');
  setDetail(1); // (this one stands by the desk)
  pottedPlant(3.85, 1.7, 0.9, '#f3d9b6');
  setDetail(0.4);

  /* ---- open bookcase: binders with spine labels and finger holes, one leaning, a stack of
   * papers, a plant on top */
  {
    const [W, H, D] = [1.9, 2.0, 0.6];
    const parts = [
      box(0.07, H, D, oakDark, -W / 2 + 0.035, H / 2, 0, 0.02),
      box(0.07, H, D, oakDark, W / 2 - 0.035, H / 2, 0, 0.02),
      box(W, 0.07, D + 0.02, oakDark, 0, H - 0.035, 0.01, 0.02),
      box(W - 0.14, 0.05, D - 0.04, oak, 0, 0.17, 0, 0.012),
      box(W - 0.14, 0.05, D - 0.04, oak, 0, 1.0, 0, 0.012),
      box(W - 0.14, 0.14, 0.04, oakDark, 0, 0.07, D / 2 - 0.05, 0.012),
      box(W - 0.1, H - 0.1, 0.03, sceneMat.wood('#e7cfa9', { map: grain }), 0, H / 2, -D / 2 + 0.03, 0.01),
    ];
    const labelM = sceneMat.cloth('#fbf7ee', { grain: false });
    const holeM = sceneMat.glossy('#3a3f48');
    const binder = (x, y, w, h, c, lean = 0) => {
      const b = group(
        box(w, h, 0.44, sceneMat.glossy(c, { roughness: 0.5 }), 0, h / 2, 0, 0.018),
        box(w * 0.62, 0.16, 0.008, labelM, 0, h * 0.68, 0.222, 0.004),
        box(w * 0.62, 0.012, 0.009, sceneMat.glossy(c), 0, h * 0.68 + 0.03, 0.223, 0.003)
      );
      const hole = cyl(0.026, 0.026, 0.012, holeM, 0, h * 0.24, 0.219, 16);
      hole.rotation.x = Math.PI / 2;
      b.add(hole);
      b.position.set(x, y, 0);
      b.rotation.z = lean;
      parts.push(b);
    };
    let x = -0.86;
    [[0.16, '#5aa9e6'], [0.15, '#f6d04d'], [0.17, '#e5584f'], [0.15, '#5bb36a'], [0.16, '#b7a6d6']].forEach(([w, c]) => {
      binder(x + w / 2, 0.195, w, 0.6, c);
      x += w + 0.012;
    });
    // a stack of papers and a folder lying flat
    [['#fbf7ee', 0.04], ['#f7b2c0', 0.03], ['#fbf7ee', 0.035], ['#dff2d8', 0.03]].forEach(([c, h], i, a) => {
      const y = 0.195 + a.slice(0, i).reduce((s, v) => s + v[1], 0) + h / 2;
      const sheet = box(0.5, h, 0.4, sceneMat.cloth(c, { grain: false }), 0.5 + (i % 2) * 0.02, y, 0.02, 0.01);
      sheet.rotation.y = (i - 1.5) * 0.05;
      parts.push(sheet);
    });
    x = -0.86;
    [[0.15, '#f7b2c0'], [0.16, '#5aa9e6'], [0.15, '#f6d04d'], [0.17, '#5bb36a'], [0.15, '#e5584f']].forEach(([w, c], i) => {
      if (i === 4) binder(x + 0.12, 1.025, w, 0.64, c, -0.36);
      else binder(x + w / 2, 1.025, w, 0.64, c);
      x += w + 0.012;
    });
    const top = plant({ r: 0.13, h: 0.22, leaves: 10, len: 0.3, pot: '#fffaf0' });
    top.position.set(0.55, H, 0);
    parts.push(top);
    const shelf = bake(parts);
    shelf.position.set(3.0, 0, WALL_Z + 0.35);
    g.add(shelf);
  }

  /* ---- water cooler: cabinet with a cupboard, a dispensing recess with hot/cold taps and a
   * drip tray, and a ridged bottle of water upside down on top */
  {
    const parts = [
      box(0.7, 1.12, 0.6, whitePlastic, 0, 0.56, 0, 0.09),
      box(0.52, 0.5, 0.02, sceneMat.glossy('#ece7dc', { roughness: 0.4 }), 0, 0.33, 0.3, 0.02),
      box(0.16, 0.025, 0.03, greyPlastic, 0, 0.53, 0.315, 0.01),
      box(0.5, 0.32, 0.04, sceneMat.glossy('#d4dbe1', { roughness: 0.5 }), 0, 0.84, 0.285, 0.03),
      box(0.46, 0.035, 0.17, greyPlastic, 0, 0.695, 0.33, 0.012),
      cyl(0.2, 0.22, 0.05, whitePlastic, 0, 1.145, 0, 32),
    ];
    for (let k = 0; k < 5; k++) parts.push(box(0.38, 0.01, 0.014, darkPlastic, 0, 0.716, 0.27 + k * 0.028, 0.004));
    [[-1, '#5aa9e6'], [1, '#e5584f']].forEach(([sx, c]) => {
      const spout = latheMesh([[0, 0], [0.028, 0], [0.032, 0.02], [0.02, 0.065], [0, 0.065]], whitePlastic, 16);
      spout.rotation.x = Math.PI;
      spout.position.set(sx * 0.12, 0.96, 0.3);
      parts.push(spout, box(0.08, 0.05, 0.05, sceneMat.glossy(c, { roughness: 0.35 }), sx * 0.12, 0.985, 0.33, 0.015));
    });
    const cooler = bake(parts);
    const bottleProfile = [[0, 1.12], [0.075, 1.12], [0.075, 1.22], [0.12, 1.27], [0.24, 1.33], [0.275, 1.4], [0.28, 1.46], [0.27, 1.5], [0.28, 1.54], [0.28, 1.6], [0.27, 1.64], [0.28, 1.68], [0.28, 1.74], [0.27, 1.78], [0.28, 1.82], [0.27, 1.88], [0.22, 1.94], [0.12, 1.97], [0, 1.975]];
    const water = new THREE.Mesh(
      new THREE.LatheGeometry([[0, 1.13], [0.065, 1.13], [0.065, 1.22], [0.11, 1.27], [0.225, 1.33], [0.262, 1.4], [0.262, 1.8], [0, 1.8]].map(([r, y]) => new THREE.Vector2(r, y)), 40),
      new THREE.MeshPhysicalMaterial({ color: '#7fc6ee', roughness: 0.2, clearcoat: 0.6, transparent: true, opacity: 0.55, depthWrite: false })
    );
    const bottle = new THREE.Mesh(
      new THREE.LatheGeometry(bottleProfile.map(([r, y]) => new THREE.Vector2(r, y)), 40),
      new THREE.MeshPhysicalMaterial({ color: '#cdeefe', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false })
    );
    water.renderOrder = 1;
    bottle.renderOrder = 2;
    cooler.add(water, bottle);
    cooler.position.set(-2.95, 0, WALL_Z + 0.4);
    g.add(cooler);
  }
  setDetail(1);

  // a wire-mesh waste bin with a crumpled sheet of paper in it
  {
    const holes = canvasTex(64, 64, (c, w) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, w);
      c.fillStyle = '#000000';
      c.beginPath();
      c.roundRect(9, 9, 46, 46, 8);
      c.fill();
    });
    holes.wrapS = holes.wrapT = THREE.RepeatWrapping;
    holes.repeat.set(30, 7);
    const meshM = new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.55, roughness: 0.4, alphaMap: holes, alphaTest: 0.5, side: THREE.DoubleSide });
    const rimM = sceneMat.metal('#a9b0b8', { roughness: 0.35 });
    const ring = (r, y) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 40), rimM);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      return m;
    };
    const paperGeo = new THREE.IcosahedronGeometry(0.11, 2);
    {
      const p = paperGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 1 + 0.2 * Math.sin(v.x * 61 + v.y * 37) * Math.cos(v.z * 53 - v.y * 29);
        p.setXYZ(i, v.x * k, v.y * k, v.z * k);
      }
      paperGeo.computeVertexNormals();
    }
    const paper = new THREE.Mesh(paperGeo, sceneMat.cloth('#fbf7ee', { grain: false }));
    paper.position.set(0.03, 0.13, -0.02);
    const bin = group(bake(ring(0.26, 0.5), ring(0.21, 0.025), cyl(0.21, 0.21, 0.015, rimM, 0, 0.012, 0, 32), paper), shade(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.21, 0.02), new THREE.Vector2(0.26, 0.5)], 40), meshM)));
    bin.position.set(-3.0, 0, 0.9);
    g.add(bin);
  }

  /* ---- chair: an upholstered seat and a curved backrest on plastic shells, a spine, the
   * gas lift and a five-star base on twin-wheel casters */
  {
    const cloth = sceneMat.cloth('#5f9fb8');
    const parts = [];
    const seat = softBox(1.0, 0.17, 0.88, cloth, { ex: 0.22, ey: 0.5, puff: 0.35 });
    seat.position.set(0, SEAT_Y - 0.085, -0.08);
    const seatShell = softBox(1.04, 0.08, 0.9, darkPlastic, { ex: 0.2, ey: 0.4 });
    seatShell.position.set(0, SEAT_Y - 0.17, -0.08);
    // the backrest wraps a little round the sitter and leans back
    const curved = (w, t, h, o) => {
      const geo = softBoxGeo(w, t, h, o);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.2 * p.getX(i) * p.getX(i));
      geo.computeVertexNormals();
      return geo;
    };
    const back = new THREE.Mesh(curved(1.22, 0.17, 0.94, { ex: 0.25, ey: 0.55, puff: 0.3 }), cloth);
    const backShell = new THREE.Mesh(curved(1.26, 0.07, 0.98, { ex: 0.22, ey: 0.5 }), darkPlastic);
    back.position.set(0, SEAT_Y + 0.6, -0.62);
    backShell.position.set(0, SEAT_Y + 0.6, -0.72);
    back.rotation.x = backShell.rotation.x = -0.1;
    const spine = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, SEAT_Y - 0.2, -0.3), new THREE.Vector3(0, SEAT_Y - 0.2, -0.8), new THREE.Vector3(0, SEAT_Y + 0.35, -0.78)), 20, 0.045, 10),
      darkPlastic
    );
    parts.push(seat, seatShell, back, backShell, spine, box(0.34, 0.06, 0.34, darkPlastic, 0, SEAT_Y - 0.24, -0.08, 0.02));
    parts.push(cyl(0.04, 0.04, 0.14, sceneMat.metal('#c9ced3', { roughness: 0.25 }), 0, 0.15, -0.08, 16), cyl(0.085, 0.1, 0.07, darkPlastic, 0, 0.085, -0.08, 20));
    const rubber = sceneMat.glossy('#2f343c', { roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const spoke = box(0.4, 0.045, 0.075, darkPlastic, Math.cos(a) * 0.22, 0.08, -0.08 + Math.sin(a) * 0.22, 0.02);
      spoke.rotation.set(0, -a, -0.08);
      const cx = Math.cos(a) * 0.41;
      const cz = -0.08 + Math.sin(a) * 0.41;
      const fork = box(0.06, 0.05, 0.05, darkPlastic, cx, 0.075, cz, 0.015);
      const wheel = cyl(0.04, 0.04, 0.06, rubber, cx, 0.04, cz, 16);
      wheel.rotation.set(0, -a, Math.PI / 2);
      parts.push(spoke, fork, wheel);
    }
    g.add(bake(parts));
  }

  /* ---- desk: a thick oak top on powder-coated steel legs (the front stays open) */
  {
    const parts = [box(5.3, 0.1, 1.02, oak, 0, DESK_Y - 0.05, 0.87, 0.04), box(4.84, 0.05, 0.05, powder, 0, DESK_Y - 0.125, 1.27, 0.02)];
    [-1, 1].forEach((sx) => {
      const x = sx * 2.42;
      const legH = DESK_Y - 0.15;
      parts.push(
        box(0.07, legH, 0.07, powder, x, 0.05 + legH / 2, 0.47, 0.02),
        box(0.07, legH, 0.07, powder, x, 0.05 + legH / 2, 1.27, 0.02),
        box(0.08, 0.05, 1.02, powder, x, 0.04, 0.87, 0.02),
        box(0.07, 0.05, 0.92, powder, x, DESK_Y - 0.125, 0.87, 0.02),
        cyl(0.04, 0.045, 0.02, greyPlastic, x, 0.01, 0.42, 16),
        cyl(0.04, 0.045, 0.02, greyPlastic, x, 0.01, 1.32, 16)
      );
    });
    g.add(bake(parts));
  }

  // keyboard (keycaps in rows, a space bar, a couple of coloured keys) and a mouse
  const keyboard = (() => {
    const keyM = sceneMat.glossy('#fbf8f2', { roughness: 0.5 });
    const modM = sceneMat.glossy('#dcd6c8', { roughness: 0.5 });
    const parts = [box(1.14, 0.04, 0.38, sceneMat.glossy('#f4f1ea', { roughness: 0.4 }), 0, 0, 0, 0.02)];
    const cap = (w, x, z, m) => parts.push(box(w, 0.032, 0.056, m, x, 0.034, z, 0.013));
    for (let r = 1; r <= 4; r++)
      for (let c = 0; c < 12; c++) {
        let m = c === 0 || c === 11 ? modM : keyM;
        if (r === 4 && c === 0) m = sceneMat.glossy('#f7b2c0', { roughness: 0.45 });
        if (r === 2 && c === 11) m = sceneMat.glossy('#f2c14e', { roughness: 0.45 });
        cap(0.07, -0.4675 + c * 0.085, -0.135 + r * 0.068, m);
      }
    [[-0.44, 0.11], [-0.32, 0.1], [-0.2, 0.1], [0.32, 0.1], [0.44, 0.11]].forEach(([x, w]) => cap(w, x, -0.135, modM));
    cap(0.43, 0.06, -0.135, keyM);
    return bake(parts);
  })();
  keyboard.position.set(0, DESK_Y + 0.032, 0.58);
  keyboard.rotation.x = -0.05;
  const mouse = (() => {
    const body = softBox(0.14, 0.08, 0.21, whitePlastic, { ex: 0.6, ey: 0.75 });
    body.position.y = 0.04;
    const wheel = cyl(0.016, 0.016, 0.02, greyPlastic, 0, 0.076, 0.045, 14);
    wheel.rotation.z = Math.PI / 2;
    return bake(body, wheel, box(0.004, 0.014, 0.075, greyPlastic, 0, 0.074, 0.06, 0.002));
  })();
  mouse.position.set(0.9, DESK_Y, 0.6);
  mouse.rotation.y = -0.15;
  g.add(keyboard, mouse);

  // monitor: the screen faces the character, so from here we see its soft back shell (with an
  // acorn logo), the stand and its oval foot
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTex(), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.4 });
  {
    const shellM = sceneMat.glossy('#f4f0e8', { roughness: 0.35 });
    const standM = sceneMat.glossy('#c9cdd3', { roughness: 0.3 });
    const foot = latheMesh([[0, 0], [0.25, 0], [0.27, 0.012], [0.25, 0.028], [0, 0.032]], standM, 40);
    foot.scale.z = 0.7;
    const hinge = cyl(0.045, 0.045, 0.2, standM, 0, 0.66, -0.11, 16);
    hinge.rotation.z = Math.PI / 2;
    const backShell = softBox(1.18, 0.06, 0.76, shellM, { ex: 0.12, ey: 0.5 });
    backShell.rotation.x = Math.PI / 2;
    backShell.position.set(0, 0.88, -0.035);
    const hump = softBox(0.72, 0.1, 0.5, shellM, { ex: 0.3, ey: 0.6, puff: 0.2 });
    hump.rotation.x = Math.PI / 2;
    hump.position.set(0, 0.84, -0.075);
    const logo = acorn(1.5);
    logo.position.set(0, 0.86, -0.13);
    const monitor = group(
      bake(foot, box(0.13, 0.62, 0.045, standM, 0, 0.34, -0.12, 0.02), hinge, backShell, hump, box(1.2, 0.78, 0.03, sceneMat.glossy('#2b3039', { roughness: 0.35 }), 0, 0.88, 0.005, 0.03)),
      plane(1.1, 0.68, screenMat, 0, 0.88, 0.022),
      logo
    );
    monitor.position.set(MONITOR[0], DESK_Y, MONITOR[1]);
    monitor.rotation.y = Math.atan2(-MONITOR[0], -MONITOR[1]);
    g.add(monitor);
  }

  // name plate on the front edge: a walnut stand with a brass-framed card
  const plateMat = new THREE.MeshStandardMaterial({ map: null, roughness: 0.6 });
  {
    const trimFrame = new THREE.Mesh(frameGeo(0.94, 0.22, 0.02, 0.02, 0.012), brass);
    trimFrame.position.z = 0.018;
    const plate = group(bake(box(1.0, 0.27, 0.06, walnut, 0, 0, -0.012, 0.025), trimFrame), plane(0.9, 0.2, plateMat, 0, 0, 0.026));
    plate.position.set(-0.75, DESK_Y + 0.14, 1.2);
    plate.rotation.x = -0.25;
    const foot = box(1.02, 0.04, 0.16, walnut, -0.75, DESK_Y + 0.02, 1.15, 0.015);
    g.add(plate, foot);
  }
  let plateKey = null;

  // mug (moves to the hand when the character takes a sip)
  const mug = group(
    latheMesh([[0, 0], [0.1, 0], [0.115, 0.02], [0.12, 0.22], [0.105, 0.22], [0.1, 0.04], [0, 0.04]], sceneMat.glossy('#f7b2c0'), 32),
    cyl(0.103, 0.103, 0.01, sceneMat.glossy('#6b4632', { roughness: 0.2 }), 0, 0.185, 0, 24)
  );
  {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 10, 20, Math.PI * 1.3), sceneMat.glossy('#f7b2c0'));
    handle.position.set(0.12, 0.11, 0);
    handle.rotation.z = -Math.PI * 0.65;
    mug.add(shade(handle));
  }
  mug.position.copy(MUG_SPOT);
  g.add(mug);

  // lunch (only at lunch time): a lacquered bento — rice with sesame and a pickled plum,
  // rolled omelette, broccoli, a sausage, a cherry tomato — and chopsticks
  const lunch = (() => {
    const parts = [
      box(0.72, 0.12, 0.44, sceneMat.glossy('#d9473f', { roughness: 0.25 }), 0, 0.06, 0, 0.05),
      box(0.66, 0.02, 0.38, sceneMat.glossy('#2b2522', { roughness: 0.3 }), 0, 0.112, 0, 0.01),
      box(0.02, 0.05, 0.38, sceneMat.glossy('#2b2522', { roughness: 0.3 }), -0.06, 0.13, 0, 0.008),
    ];
    const rice = softBox(0.4, 0.09, 0.36, sceneMat.cloth('#ffffff', { grain: false, sheen: 0.8 }), { ex: 0.2, ey: 0.5, puff: 0.3 });
    rice.position.set(-0.27, 0.15, 0);
    parts.push(rice, ball(0.035, sceneMat.glossy('#c9364a', { roughness: 0.4 }), -0.27, 0.2, 0));
    for (let k = 0; k < 10; k++) parts.push(ball(0.008, sceneMat.glossy('#2b2522'), -0.27 + Math.cos(k * 2.4) * (0.06 + (k % 3) * 0.035), 0.193, Math.sin(k * 2.4) * (0.05 + (k % 3) * 0.03), 1.6, 0.6, 1));
    [-0.09, 0.03].forEach((z) => {
      const egg = softBox(0.11, 0.075, 0.11, sceneMat.glossy('#f6cf4a', { roughness: 0.6 }), { ex: 0.25, ey: 0.4 });
      egg.position.set(0.03, 0.155, z);
      parts.push(egg);
    });
    const green = sceneMat.leaf('#4f9a60');
    parts.push(cyl(0.02, 0.025, 0.06, sceneMat.leaf('#8cc084'), 0.2, 0.15, -0.09, 10));
    [[0, 0.2, 0], [0.04, 0.19, 0.02], [-0.04, 0.19, 0.02], [0.02, 0.19, -0.04], [-0.02, 0.195, -0.03]].forEach(([x, y, z]) => parts.push(ball(0.04, green, 0.2 + x, y, -0.09 + z)));
    parts.push(limb([0.12, 0.155, 0.1], [0.27, 0.155, 0.1], 0.032, sceneMat.glossy('#e06a4f', { roughness: 0.45 })));
    parts.push(ball(0.045, sceneMat.glossy('#e5402f', { roughness: 0.2 }), 0.24, 0.165, -0.0), ball(0.018, green, 0.24, 0.21, 0, 1.4, 0.4, 1.4));
    const sticks = sceneMat.wood('#c28a5a', { map: grain });
    parts.push(limb([-0.32, 0.012, 0.3], [0.3, 0.012, 0.31], 0.009, sticks), limb([-0.32, 0.012, 0.34], [0.3, 0.012, 0.33], 0.009, sticks));
    return bake(parts);
  })();
  lunch.position.set(0, DESK_Y, 0.6);
  lunch.visible = false;
  g.add(lunch);

  // the acorn basket: woven wicker with a braided rim and two little ear handles
  {
    const weave = weaveTex();
    weave.repeat.set(26, 3);
    const wicker = sceneMat.custom({ color: '#c9955f', map: weave, bumpMap: weave, bumpScale: 2, roughness: 0.8, side: THREE.DoubleSide }, '#c9955f');
    const braid = sceneMat.wood('#a8754a', { roughness: 0.7, clearcoat: 0.05 });
    const parts = [latheMesh([[0, -0.16], [0.4, -0.16], [0.44, -0.13], [0.5, 0.1], [0.515, 0.15], [0.495, 0.15], [0.48, 0.1], [0.42, -0.12], [0, -0.14]], wicker, 48)];
    [0, Math.PI].forEach((ph) => {
      const pts = [];
      for (let k = 0; k <= 240; k++) {
        const t = (k / 240) * Math.PI * 2;
        const r = 0.51 + 0.022 * Math.cos(t * 30 + ph);
        pts.push(new THREE.Vector3(Math.cos(t) * r, 0.155 + 0.02 * Math.sin(t * 30 + ph), Math.sin(t) * r));
      }
      parts.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.02, 6, true), braid));
    });
    [-1, 1].forEach((sx) => {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 8, 18, Math.PI), braid);
      h.rotation.set(Math.PI / 2, 0, -sx * (Math.PI / 2));
      h.position.set(sx * 0.49, 0.1, 0);
      parts.push(h);
    });
    const basket = bake(parts);
    basket.position.set(BASKET.x, BASKET.y + 0.16, BASKET.z);
    g.add(basket);
  }
  const pile = acornPile(PILE_MAX, 0.4, 1.25);
  pile.position.set(BASKET.x, BASKET.y + 0.01, BASKET.z);
  g.add(pile);
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
    act('type', 6, [10, 24], () => (weary() ? '기운 없이 일하는 중… :yawn:' : late() ? '야근 중… :moon:' : '열심히 일하는 중 :keyboard:'), { arm: typing, leg: sitLegs(0.18), head: { x: 0.05, y: 0.34, z: 0 } }),
    act('coffee', 1.4, [6, 9], '커피 한 모금 :coffee:', {
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
    act('think', 1.4, [6, 10], '음… 고민 중 :think:', {
      arm: (side, t) =>
        side === 'R' ? { hand: [-0.16, reach.y - 0.01 + Math.max(0, Math.sin(t * 9)) * 0.03, 0.42], pole: [1, -0.6, -0.4] } : resting(side),
      // one ankle tucked behind the other
      leg: (side) => ({ hip: [-1.5, 0, side === 'L' ? 0.02 : 0.1], knee: side === 'L' ? 1.9 : 1.3, ankle: 0.2 }),
      head: { x: 0.02, y: 0.28, z: 0.12 },
    }),
    act('doze', 1, [6, 12], '꾸벅꾸벅… :zzz:', { arm: resting, leg: sitLegs(0), head, eyes: 'closed' }, {
      update: (dt, t) => {
        head.x = 0.12 + Math.max(0, Math.sin(t * 0.9)) * 0.14;
        head.z = 0.08 * Math.sin(t * 0.45);
      },
    }),
    act('lunch', 0, [3600, 3600], '점심 먹는 중 :lunchbox:', {
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
