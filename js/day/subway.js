/*
 * 직장의 숲 · 하루 — subway.js (the ride to work and back; a short cutscene)
 *
 * Seen from beside the bridge: the train crosses the river and the character shows through the
 * middle window, standing with its phone or sitting on the bench. Going in the car is full;
 * going home it is quieter and the character nods off. The other passengers are made like the
 * character (commuters.js): new faces every day, new seats every ride.
 * ctx.dir: 'in' | 'out', ctx.ride: 0..1 (the train slows down near the end), ctx.seat (optional).
 */
import { THREE, mat, box, cyl, ball, plane, group, shade, canvasTex, FONT, setDetail, seg } from './kit.js';
import { Routine } from './world.js';
import { sceneMat } from '../char3d.js';
import { makeCrowd } from './commuters.js';
import { softBox, softBoxGeo, latheMesh, limb, frameGeo, roundRect, bake, moquetteTex, speckleTex } from './soft.js';

const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ============================================================== the train, seen from outside */
const CAR = { half: 12, gap: 1.9, bottom: -0.6, eave: 4.85, roof: 5.45, zIn: 1.45, zOut: 1.6, zBack: -2.0 };
// our side: windows [x, width] and sliding doors (x of the middle), all windows at one height
// (low and big: the character is small, and a standing one should show from the chest up)
const NEAR = { y: 2.3, h: 2.4, r: 0.26, wins: [[0, 3.6], [-7.05, 3.2], [7.05, 3.2]], doors: [-10.3, -3.8, 3.8, 10.3], doorW: 2.0, doorH: 4.1 };
const SOLID = [[-12, -11.3], [-9.3, -4.8], [-2.8, 2.8], [4.8, 9.3], [11.3, 12]]; // wall between the doors
const BAND = { y: 0.86, line: 0.68 }; // the green band under the windows and its dark edge
// the far side, seen through the car: windows over the bench
const BACK = { y: 2.45, w: 3.5, h: 2.0, r: 0.28, xs: [-8.8, -4.4, 0, 4.4, 8.8] };
const RAIL_Y = 4.2; // grab rail (the hand straps hang just into the top of the windows)
const SPEED = 6; // how fast the world slides past at full speed (units / s)
const NIGHT_TINT = new THREE.Color('#a3abc0');
const sstep = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** uv = position on one plane, in metres (for maps that repeat by size) */
function planarUV(mesh, a = 'x', b = 'y') {
  const p = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p['get' + a.toUpperCase()](i), p['get' + b.toUpperCase()](i));
  return mesh;
}
/** move n instances along x so they slide past without end */
function slideAlong(mesh, n, gap, shift, place) {
  const span = n * gap;
  for (let i = 0; i < n; i++) {
    const x = ((((i * gap - shift) % span) + span) % span) - span / 2;
    mesh.setMatrixAt(i, place(x, i));
  }
  mesh.instanceMatrix.needsUpdate = true;
}
const M4 = new THREE.Matrix4();
const at = (x, y, z) => M4.makeTranslation(x, y, z);

export function buildSubway(world) {
  const g = new THREE.Group();
  g.name = 'subway';
  const train = new THREE.Group(); // the car and everything in it: bobs a little on the track
  const land = new THREE.Group(); // the bridge, the river, the city: slides past
  g.add(train, land);

  const chrome = sceneMat.metal('#d3d8dd', { roughness: 0.22 });
  const steel = sceneMat.metal('#c3cbd1', { roughness: 0.4 });
  const alu = sceneMat.glossy('#cdd4da', { roughness: 0.3 });
  const rubber = sceneMat.glossy('#3d4248', { roughness: 0.7 });
  // stainless shades plainly (the warm shade colour of the cloth and wood would turn it violet)
  const stainless = new THREE.MeshPhysicalMaterial({ color: '#e2e5e8', metalness: 0.25, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const aluPlain = new THREE.MeshPhysicalMaterial({ color: '#cfd5da', metalness: 0.35, roughness: 0.3, clearcoat: 0.3 });
  const green = sceneMat.glossy('#3fae5a', { roughness: 0.3 });
  const greenDark = sceneMat.glossy('#2a7d40', { roughness: 0.3 });
  const roofM = sceneMat.glossy('#bfc6cc', { roughness: 0.5 });
  const underM = sceneMat.glossy('#4a5058', { roughness: 0.6 });
  const sheenTex = canvasTex(256, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    [[0.18, 26], [0.34, 10], [0.66, 18]].forEach(([u, bw]) => {
      const x = u * w;
      const grd = c.createLinearGradient(x - bw, 0, x + bw, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(x - bw + 40, 0);
      c.lineTo(x + bw + 40, 0);
      c.lineTo(x + bw - 40, h);
      c.lineTo(x - bw - 40, h);
      c.fill();
    });
  });
  const sheenM = new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const sheen = (w, h, x, y, z) => {
    const m = plane(w, h, sheenM, x, y, z);
    m.receiveShadow = false;
    return m;
  };

  /* ---- inside: floor, the far wall with its windows, the long bench, rail, straps, poles */
  const speck = speckleTex(6);
  speck.repeat.set(8.4, 1.6);
  const floor = plane(CAR.half * 2, CAR.zIn - CAR.zBack, sceneMat.custom({ color: '#a9b2b8', map: speck, roughness: 0.75 }, '#a9b2b8'), 0, 0, (CAR.zIn + CAR.zBack) / 2);
  floor.rotation.x = -Math.PI / 2;
  train.add(floor);
  {
    const shape = new THREE.Shape();
    shape.moveTo(-CAR.half, 0);
    shape.lineTo(CAR.half, 0);
    shape.lineTo(CAR.half, CAR.roof - 0.05);
    shape.lineTo(-CAR.half, CAR.roof - 0.05);
    shape.closePath();
    BACK.xs.forEach((x) => shape.holes.push(roundRect(new THREE.Path(), BACK.w, BACK.h, BACK.r, x, BACK.y)));
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 }), sceneMat.glossy('#eef1f2', { roughness: 0.5 }));
    wall.position.z = -1.99;
    const parts = [wall, box(CAR.half * 2, 1.5, 0.03, sceneMat.glossy('#d9e0e4', { roughness: 0.5 }), 0, 0.75, -1.85, 0.01)];
    [-1, 1].forEach((s) => parts.push(box(0.1, CAR.roof, CAR.zIn - CAR.zBack, sceneMat.glossy('#e4e8ea', { roughness: 0.5 }), s * (CAR.half - 0.2), CAR.roof / 2, (CAR.zIn + CAR.zBack) / 2, 0.02)));
    BACK.xs.forEach((x) => {
      const f = new THREE.Mesh(frameGeo(BACK.w - 0.03, BACK.h - 0.03, BACK.r - 0.02, 0.1, 0.07), alu);
      f.position.set(x, BACK.y, -2.04);
      const seal = new THREE.Mesh(frameGeo(BACK.w - 0.2, BACK.h - 0.2, BACK.r - 0.1, 0.035, 0.035), rubber);
      seal.position.set(x, BACK.y, -2.045);
      parts.push(f, seal, box(BACK.w - 0.16, 0.07, 0.05, alu, x, BACK.y + 0.42, -2.02, 0.02));
    });
    train.add(bake(parts));
    BACK.xs.forEach((x) => train.add(sheen(BACK.w - 0.2, BACK.h - 0.2, x, BACK.y, -2.03)));
  }
  {
    // the long bench: a contoured moquette cushion and back for each seat on a stainless base
    const moq = moquetteTex();
    moq.repeat.set(1 / 0.45, 1 / 0.45);
    const seatM = sceneMat.cloth('#4fa392', { map: moq });
    const slot = sceneMat.glossy('#7f8990', { roughness: 0.5 });
    const parts = [box(15.6, 0.8, 0.6, steel, 0, 0.42, -1.5, 0.04), box(15.6, 0.07, 0.86, steel, 0, 0.84, -1.42, 0.03)];
    for (let i = -5; i <= 5; i++) {
      const x = i * 1.4;
      const s = softBox(1.34, 0.2, 0.82, seatM, { ex: 0.28, ey: 0.55, puff: 0.35, segW: 20, segH: 10 });
      s.position.set(x, 0.93, -1.42);
      const bg = softBoxGeo(1.34, 0.18, 0.98, { ex: 0.3, ey: 0.55, puff: 0.35, segW: 20, segH: 10 });
      bg.rotateX(-Math.PI / 2);
      const b = new THREE.Mesh(bg, seatM);
      b.position.set(x, 1.56, -1.8);
      b.rotation.x = -0.08;
      parts.push(s, b);
      for (let k = 0; k < 3; k++) parts.push(box(1.0, 0.035, 0.02, slot, x, 0.2 + k * 0.09, -1.195, 0.012));
    }
    train.add(bake(parts));
  }
  const rail = cyl(0.045, 0.045, CAR.half * 2 - 0.6, chrome, 0, RAIL_Y, -0.7, 16);
  rail.rotation.z = Math.PI / 2;
  const fixings = [rail];
  [-6.3, -2.1, 2.1, 6.3].forEach((x) => {
    const plate = cyl(0.07, 0.07, 0.02, chrome, x, RAIL_Y + 0.27, -1.85, 16);
    plate.rotation.x = Math.PI / 2;
    const collar = cyl(0.065, 0.065, 0.1, chrome, x, RAIL_Y, -0.7, 16);
    collar.rotation.z = Math.PI / 2;
    fixings.push(limb([x, RAIL_Y + 0.27, -1.84], [x, RAIL_Y + 0.02, -0.74], 0.025, chrome), plate, collar);
  });
  [-3.5, 3.5].forEach((x) => {
    const pts = [];
    for (let k = 0; k <= 10; k++) pts.push(V3(x, 0.05 + ((RAIL_Y - 0.5) * k) / 10, -0.25));
    const bend = new THREE.QuadraticBezierCurve3(V3(x, RAIL_Y - 0.45, -0.25), V3(x, RAIL_Y, -0.25), V3(x, RAIL_Y, -0.66));
    for (let k = 1; k <= 10; k++) pts.push(bend.getPoint(k / 10));
    fixings.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.05, 8), chrome));
    const foot = latheMesh([[0, 0], [0.11, 0], [0.1, 0.03], [0.06, 0.06], [0.052, 0.11], [0, 0.11]], chrome, 24);
    foot.position.set(x, 0, -0.25);
    const joint = cyl(0.07, 0.07, 0.14, chrome, x, RAIL_Y, -0.7, 16);
    joint.rotation.z = Math.PI / 2;
    fixings.push(foot, joint);
  });
  train.add(bake(fixings));
  const strap = (() => {
    const handleM = sceneMat.glossy('#f6d04d', { roughness: 0.35 });
    const pts = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = 0.125 * (1 + 0.12 * Math.cos(3 * (a - Math.PI / 2)));
      pts.push(V3(Math.cos(a) * r, -0.67 + Math.sin(a) * r, 0));
    }
    return bake(
      box(0.11, 0.09, 0.13, handleM, 0, -0.005, 0, 0.03),
      box(0.07, 0.42, 0.018, sceneMat.cloth('#f4f1ea'), 0, -0.27, 0, 0.008),
      box(0.078, 0.03, 0.028, handleM, 0, -0.08, 0, 0.01),
      box(0.09, 0.07, 0.04, handleM, 0, -0.5, 0, 0.015),
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 30, 0.024, 6, true), handleM)
    );
  })();
  const straps = [];
  for (let x = -7; x <= 7; x += 1.05) {
    const p = strap.clone();
    p.position.set(x, RAIL_Y, -0.7);
    straps.push(p);
    train.add(p);
  }
  // ceiling lights (the roof hides the panels): the car glows from inside after dark
  const cabinLight = new THREE.PointLight('#fff1dc', 0, 14, 1.4);
  cabinLight.position.set(0, RAIL_Y + 0.4, -0.3);
  train.add(cabinLight);

  /* ---- outside: the car body (built once, copied for the cars in front and behind) */
  const ribs = canvasTex(64, 8, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#000000');
    grd.addColorStop(0.5, '#ffffff');
    grd.addColorStop(1, '#000000');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
  });
  ribs.wrapS = ribs.wrapT = THREE.RepeatWrapping;
  ribs.repeat.set(5, 1);
  const ribM = new THREE.MeshPhysicalMaterial({ color: '#dcdfe2', metalness: 0.25, roughness: 0.4, bumpMap: ribs, bumpScale: 2.5 });
  const lineTex = canvasTex(128, 128, (c, w) => {
    c.clearRect(0, 0, w, w);
    c.fillStyle = '#3fae5a';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `78px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('2', w / 2, w / 2 + 4);
  });
  const lineM = new THREE.MeshStandardMaterial({ map: lineTex, transparent: true, roughness: 0.4 });
  /* d: detail (kit.js setDetail). The roof gear and what hangs under the floor are at the
   * top and bottom edges of the picture at best: never more than half. */
  const makeShell = (d) => {
    setDetail(d);
    const parts = [];
    // the side wall, with the window and door openings cut out
    const shape = new THREE.Shape();
    shape.moveTo(-CAR.half, CAR.bottom);
    shape.lineTo(CAR.half, CAR.bottom);
    shape.lineTo(CAR.half, CAR.eave);
    shape.lineTo(-CAR.half, CAR.eave);
    shape.closePath();
    NEAR.wins.forEach(([x, w]) => shape.holes.push(roundRect(new THREE.Path(), w, NEAR.h, NEAR.r, x, NEAR.y)));
    NEAR.doors.forEach((x) => shape.holes.push(roundRect(new THREE.Path(), NEAR.doorW, NEAR.doorH, 0.12, x, NEAR.doorH / 2)));
    const side = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: seg(2, 1), curveSegments: seg(8, 4) }), stainless);
    side.position.z = CAR.zIn + 0.025;
    parts.push(side);
    // ribbed lower panels and the line colour: a green band under the windows, a pinstripe over them
    SOLID.forEach(([a, b]) => {
      const w = b - a;
      const x = (a + b) / 2;
      parts.push(planarUV(box(w, 1.15, 0.02, ribM, x, 0.03, CAR.zOut + 0.005, 0.005)), box(w, 0.26, 0.025, green, x, BAND.y, CAR.zOut + 0.012, 0.008), box(w, 0.045, 0.02, greenDark, x, BAND.line, CAR.zOut + 0.012, 0.006));
    });
    parts.push(box(CAR.half * 2, 0.09, 0.025, green, 0, 4.42, CAR.zOut + 0.012, 0.008));
    // windows: a rubber seal, the upper vent sash
    NEAR.wins.forEach(([x, w]) => {
      const seal = new THREE.Mesh(frameGeo(w - 0.02, NEAR.h - 0.02, NEAR.r - 0.01, 0.07, 0.05), rubber);
      seal.position.set(x, NEAR.y, CAR.zIn + 0.05);
      parts.push(seal, box(w - 0.12, 0.06, 0.04, aluPlain, x, NEAR.y + 0.48, CAR.zIn + 0.06, 0.015));
    });
    // sliding doors: two leaves with tall windows, rubber where they meet, a lamp above
    NEAR.doors.forEach((dx) => {
      const frame = new THREE.Mesh(frameGeo(NEAR.doorW + 0.12, NEAR.doorH + 0.1, 0.16, 0.07, 0.035), aluPlain);
      frame.position.set(dx, NEAR.doorH / 2, CAR.zOut - 0.01);
      parts.push(frame, box(NEAR.doorW, 0.05, 0.24, aluPlain, dx, 0.0, CAR.zIn + 0.02, 0.01), box(0.05, NEAR.doorH - 0.06, 0.07, rubber, dx, NEAR.doorH / 2, CAR.zIn + 0.04, 0.02));
      [-1, 1].forEach((s) => {
        const lx = dx + s * 0.5;
        const ls = roundRect(new THREE.Shape(), 0.97, NEAR.doorH - 0.04, 0.04, 0, (NEAR.doorH - 0.04) / 2);
        ls.holes.push(roundRect(new THREE.Path(), 0.6, NEAR.h, 0.12, 0, NEAR.y - 0.02));
        const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(ls, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: seg(2, 1), curveSegments: seg(6, 3) }), stainless);
        leaf.position.set(lx, 0.02, CAR.zIn + 0.01);
        const seal = new THREE.Mesh(frameGeo(0.64, NEAR.h + 0.04, 0.14, 0.045, 0.03), rubber);
        seal.position.set(lx, NEAR.y, CAR.zIn + 0.045);
        parts.push(leaf, seal, box(0.97, 0.26, 0.02, green, lx, BAND.y, CAR.zIn + 0.065, 0.006), box(0.97, 0.045, 0.02, greenDark, lx, BAND.line, CAR.zIn + 0.065, 0.005));
      });
      const sticker = plane(0.32, 0.32, lineM, dx - 0.5, 3.78, CAR.zIn + 0.072);
      const lamp = softBox(0.22, 0.1, 0.08, sceneMat.glossy('#f2a94a', { roughness: 0.25 }), { ex: 0.3, ey: 0.5 });
      lamp.position.set(dx, 4.62, CAR.zOut + 0.03);
      parts.push(sticker, lamp);
    });
    // the roof: rounded over both eaves, with a drip rail, two air-conditioning units and a pantograph
    setDetail(Math.min(d, 0.5));
    const rs = new THREE.Shape();
    rs.moveTo(CAR.zOut, CAR.eave);
    rs.quadraticCurveTo(CAR.zOut, CAR.roof, CAR.zOut - 0.6, CAR.roof);
    rs.lineTo(CAR.zBack + 0.6, CAR.roof);
    rs.quadraticCurveTo(CAR.zBack, CAR.roof, CAR.zBack, CAR.eave);
    rs.lineTo(CAR.zBack + 0.1, CAR.eave);
    rs.quadraticCurveTo(CAR.zBack + 0.1, CAR.roof - 0.1, CAR.zBack + 0.6, CAR.roof - 0.1);
    rs.lineTo(CAR.zOut - 0.6, CAR.roof - 0.1);
    rs.quadraticCurveTo(CAR.zOut - 0.1, CAR.roof - 0.1, CAR.zOut - 0.1, CAR.eave);
    rs.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(rs, { depth: CAR.half * 2, bevelEnabled: false, curveSegments: seg(10, 5) });
    roofGeo.translate(0, 0, -CAR.half);
    roofGeo.rotateY(-Math.PI / 2);
    parts.push(new THREE.Mesh(roofGeo, roofM), box(CAR.half * 2, 0.05, 0.07, stainless, 0, CAR.eave + 0.01, CAR.zOut + 0.02, 0.015));
    [-5, 5].forEach((x) => {
      const ac = softBox(3.4, 0.42, 1.8, sceneMat.glossy('#d3d8dc', { roughness: 0.45 }), { ex: 0.15, ey: 0.45 });
      ac.position.set(x, CAR.roof + 0.14, -0.2);
      parts.push(ac);
      for (let k = 0; k < 6; k++) parts.push(box(0.05, 0.03, 1.2, underM, x - 1.2 + k * 0.48, CAR.roof + 0.36, -0.2, 0.01));
    });
    {
      const px = -8.4;
      const insul = sceneMat.glossy('#8a5a3c', { roughness: 0.35 });
      parts.push(box(1.0, 0.1, 1.0, underM, px, CAR.roof + 0.05, -0.25, 0.03));
      [-0.35, 0.35].forEach((dz) => parts.push(cyl(0.05, 0.06, 0.14, insul, px - 0.35, CAR.roof + 0.15, -0.25 + dz, 10), cyl(0.05, 0.06, 0.14, insul, px + 0.35, CAR.roof + 0.15, -0.25 + dz, 10)));
      parts.push(limb([px - 0.35, CAR.roof + 0.24, -0.25], [px + 0.3, 5.95, -0.25], 0.035, underM), limb([px + 0.3, 5.95, -0.25], [px - 0.05, 6.26, -0.25], 0.025, underM));
      parts.push(box(0.1, 0.05, 1.3, sceneMat.metal('#9aa0a6', { roughness: 0.4 }), px - 0.05, 6.28, -0.25, 0.02));
    }
    // the end walls, and the floor pan, equipment boxes and bogie frames under the car
    [-1, 1].forEach((s) => parts.push(box(0.14, CAR.eave - CAR.bottom, CAR.zOut - CAR.zBack, stainless, s * (CAR.half - 0.07), (CAR.eave + CAR.bottom) / 2, (CAR.zOut + CAR.zBack) / 2, 0.04)));
    parts.push(box(CAR.half * 2 - 0.4, 0.12, CAR.zOut - CAR.zBack - 0.3, underM, 0, CAR.bottom - 0.06, -0.2, 0.03));
    [[-5.4, 1.8, 0.42], [-3.2, 1.4, 0.34], [-1.0, 2.1, 0.46], [1.5, 1.2, 0.32], [3.5, 1.8, 0.4], [5.6, 1.4, 0.36]].forEach(([x, w, h]) =>
      parts.push(box(w, h, 0.5, underM, x, CAR.bottom - 0.1 - h / 2, CAR.zOut - 0.5, 0.04))
    );
    const bogieM = sceneMat.glossy('#3a3f46', { roughness: 0.55 });
    [-8.6, 8.6].forEach((bx) => {
      parts.push(box(3.0, 0.3, 0.16, bogieM, bx, -1.12, CAR.zOut - 0.2, 0.05), box(1.2, 0.22, 0.4, bogieM, bx, -0.86, CAR.zOut - 0.4, 0.04));
      [-0.75, 0.75].forEach((dx) => parts.push(box(0.28, 0.24, 0.18, bogieM, bx + dx, -1.25, CAR.zOut - 0.12, 0.04), cyl(0.09, 0.09, 0.28, steel, bx + dx, -0.92, CAR.zOut - 0.2, 12)));
    });
    setDetail(1);
    const body = bake(parts);
    body.traverse((m) => (m.castShadow = false)); // the inside stays in daylight
    const glass = new THREE.Group();
    NEAR.wins.forEach(([x, w]) => glass.add(sheen(w - 0.12, NEAR.h - 0.12, x, NEAR.y, CAR.zIn + 0.075)));
    NEAR.doors.forEach((dx) => [-1, 1].forEach((s) => glass.add(sheen(0.56, NEAR.h - 0.06, dx + s * 0.5, NEAR.y, CAR.zIn + 0.07))));
    return group(body, glass);
  };
  const shell = makeShell(1);
  train.add(shell);
  // wheels: a spoked disc, so you can see them turn
  const wheelTex = canvasTex(128, 128, (c, w) => {
    const r = w / 2;
    c.fillStyle = '#9aa0a6';
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#5d636b';
    c.beginPath();
    c.arc(r, r, r * 0.82, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3a3f46';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.beginPath();
      c.arc(r + Math.cos(a) * r * 0.5, r + Math.sin(a) * r * 0.5, r * 0.14, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#b8bec4';
    c.beginPath();
    c.arc(r, r, r * 0.2, 0, Math.PI * 2);
    c.fill();
  });
  const wheelM = new THREE.MeshStandardMaterial({ map: wheelTex, metalness: 0.5, roughness: 0.45 });
  const wheels = [];
  [-8.6, 8.6].forEach((bx) =>
    [-0.75, 0.75].forEach((dx) => {
      const wheel = cyl(0.42, 0.42, 0.12, wheelM, bx + dx, -1.25, CAR.zOut - 0.25, 28);
      wheel.rotation.x = Math.PI / 2;
      wheels.push(wheel);
      train.add(wheel);
    })
  );
  // the cars in front and behind (seen on wide screens and in the opening shot), joined by bellows
  {
    const inside = new THREE.MeshStandardMaterial({ color: '#c9d2d7', roughness: 0.8, side: THREE.BackSide });
    const bellows = sceneMat.glossy('#3d4248', { roughness: 0.8 });
    const farShell = makeShell(0.4); // (at the edges of a wide screen, or far off in the opening shot)
    [-1, 1].forEach((s) => {
      const car = group(farShell.clone(), box(CAR.half * 2 - 0.4, CAR.roof - 0.2, CAR.zIn - CAR.zBack - 0.1, inside, 0, CAR.roof / 2 - 0.1, (CAR.zIn + CAR.zBack) / 2, 0.02));
      car.position.x = s * (CAR.half * 2 + CAR.gap);
      train.add(car, box(CAR.gap + 0.2, 4.4, 2.9, bellows, s * (CAR.half + CAR.gap / 2), 2.1, -0.2, 0.15));
      wheels.slice(0, 4).forEach((w) => {
        const c = w.clone();
        c.position.x += car.position.x;
        train.add(c);
        wheels.push(c);
      });
    });
  }

  /* ---- the bridge: a concrete girder with a railing in front hides the track; piers in the
   * river; catenary masts and wires behind and over the train */
  const concreteTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 1800; k++) {
      c.fillStyle = k % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.6)';
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, 3, h); // a joint between girder sections
    c.fillStyle = 'rgba(0,0,0,0.08)';
    c.fillRect(0, h * 0.12, w, 3);
  });
  concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
  concreteTex.repeat.set(1 / 6, 1 / 2.2);
  const concrete = sceneMat.custom({ color: '#b9b2a8', map: concreteTex, roughness: 0.95 }, '#b9b2a8');
  setDetail(0.4); // the bridge is under and behind the train
  const girder = planarUV(box(160, 2.1, 0.5, concrete, 0, -2.1, 2.6, 0.04));
  const deckTex = speckleTex(9);
  deckTex.repeat.set(1 / 3, 1 / 3);
  const deck = planarUV(box(160, 0.1, 5.6, sceneMat.custom({ color: '#6b6560', map: deckTex, roughness: 1 }, '#6b6560'), 0, -1.8, -0.2, 0.02), 'x', 'z');
  const cornice = box(160, 0.16, 0.72, sceneMat.custom({ color: '#cfc8bd', roughness: 0.9 }, '#cfc8bd'), 0, -1.0, 2.6, 0.04);
  const railM = sceneMat.metal('#9aa3ab', { roughness: 0.35 });
  const topRail = cyl(0.04, 0.04, 160, railM, 0, -0.1, 2.75, 10);
  const midRail = cyl(0.03, 0.03, 160, railM, 0, -0.52, 2.75, 10);
  topRail.rotation.z = midRail.rotation.z = Math.PI / 2;
  land.add(girder, deck, cornice, topRail, midRail);
  const POSTS = { n: 64, gap: 1.5 };
  // (sixty-four of them, each a few pixels wide: a plain box)
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.86, 0.07), railM, POSTS.n);
  const PIERS = { n: 8, gap: 20 };
  const pierGeo = bake(cyl(0.9, 1.0, 2.6, concrete, 0, -4.4, 0, 28), box(3.2, 0.4, 4.2, concrete, 0, -3.25, 0, 0.06)).children[0].geometry;
  const piers = new THREE.InstancedMesh(pierGeo, concrete, PIERS.n);
  const MASTS = { n: 6, gap: 16 };
  const mastParts = bake(
    box(0.24, 9.4, 0.24, sceneMat.glossy('#7d8a86', { roughness: 0.5 }), 0, 3.65, -3.25, 0.03),
    limb([0, 7.55, -3.2], [0, 7.25, 0.5], 0.045, railM),
    limb([0, 6.85, -3.2], [0, 7.25, -0.6], 0.035, railM),
    limb([0, 7.25, -0.25], [0, 6.33, -0.25], 0.02, railM),
    cyl(0.07, 0.07, 0.3, sceneMat.glossy('#8a5a3c', { roughness: 0.35 }), 0, 7.45, -2.9, 10)
  );
  const masts = mastParts.children.map((m) => new THREE.InstancedMesh(m.geometry, m.material, MASTS.n));
  setDetail(1);
  [posts, piers, ...masts].forEach((m) => {
    // (the railing and the piers are below the deck: their shadows fall where nobody looks)
    m.castShadow = m !== posts && m !== piers;
    m.receiveShadow = true;
    m.frustumCulled = false;
    land.add(m);
  });
  const wireM = sceneMat.glossy('#3a3f46', { roughness: 0.5 });
  const contact = cyl(0.018, 0.018, 160, wireM, 0, 6.3, -0.25, 6);
  const messenger = cyl(0.015, 0.015, 160, wireM, 0, 7.25, -0.25, 6);
  contact.rotation.z = messenger.rotation.z = Math.PI / 2;
  land.add(contact, messenger);
  let slide = 0;
  const placeLand = () => {
    slideAlong(posts, POSTS.n, POSTS.gap, slide, (x) => at(x, -0.53, 2.75));
    slideAlong(piers, PIERS.n, PIERS.gap, slide, (x) => at(x, 0, -0.2));
    masts.forEach((m) => slideAlong(m, MASTS.n, MASTS.gap, slide, (x) => at(x + 3, 0, 0)));
    concreteTex.offset.x = slide / 6;
    deckTex.offset.x = slide / 3;
  };
  placeLand();

  /* ---- the river, the far city and the sky */
  const waterTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(0,0,0,0.07)';
      c.fillRect((i * 67) % w, (i * 41) % h, 30 + (i % 4) * 12, 3);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect((i * 89 + 30) % w, (i * 57 + 9) % h, 14 + (i % 3) * 8, 2);
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(260 / 8, 130 / 8);
  const waterMat = new THREE.MeshStandardMaterial({ color: '#6fb6d3', map: waterTex, roughness: 0.35, metalness: 0.1 });
  const water = plane(260, 130, waterMat, 0, -5.5, -20);
  water.rotation.x = -Math.PI / 2;
  // the far bank: city, hills and trees painted from the real time of day (sky.js), over a sky
  const skylineTex = world.painter.texture('skyline');
  // (tall enough that its towers peek over the roof in the opening shot)
  const skyline = plane(256, 40, new THREE.MeshBasicMaterial({ map: skylineTex, transparent: true, depthWrite: false, toneMapped: false }), 0, -5.5 + 20, -60);
  skyline.receiveShadow = false;
  const domeTex = canvasTex(4, 256, () => {});
  const dome = plane(700, 200, new THREE.MeshBasicMaterial({ map: domeTex, toneMapped: false }), 0, 94, -95);
  dome.receiveShadow = false;
  const paintDome = (s) => {
    const c = domeTex.userData.canvas.getContext('2d');
    const grd = c.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, s.top);
    grd.addColorStop(0.45, s.top);
    grd.addColorStop(0.78, s.mid);
    grd.addColorStop(0.955, s.horizon);
    grd.addColorStop(1, s.horizon);
    c.fillStyle = grd;
    c.fillRect(0, 0, 4, 256);
    domeTex.needsUpdate = true;
  };
  g.add(water, skyline, dome);

  /* ---- the other passengers: made like the character, new faces every day (commuters.js) */
  const crowd = makeCrowd(train);
  let rides = 0;
  // start making today's people once the first scene is up, so the first ride is ready
  setTimeout(() => crowd.prepare(world.ctx.now ? world.ctx.now() : Date.now(), Object.assign({}, world.character.prop)), 2500);

  /* ---- the character's phone (its screen faces +z here; turned toward the face when held) */
  const phone = group(
    box(0.3, 0.46, 0.05, sceneMat.glossy('#f59a8b', { roughness: 0.35 }), 0, 0, 0, 0.04), // a coral case: we see the back
    plane(0.25, 0.38, new THREE.MeshBasicMaterial({ color: '#cfe9ff' }), 0, 0, 0.03),
    box(0.09, 0.12, 0.02, sceneMat.glossy('#2b3039', { roughness: 0.3 }), 0.07, 0.13, -0.03, 0.02) // camera bump on the back
  );
  train.add(phone);

  /* ---- routine: standing in the aisle (phone, a look out of the window) or sitting on the
   * bench (phone, nodding off). An activity marked seated puts the character on its seat. */
  const head = { x: 0, y: 0, z: 0 };
  // both hands well below the chin and out in front, so the big head can look down at the screen
  const PHONE = [-0.1, -0.3, 0.58];
  const holdPhone = (side) => ({ hand: mirror(PHONE, side), pole: [side === 'L' ? -1 : 1, -0.8, -0.2], flex: 0.35 });
  // seated: thighs on the cushion, feet swinging slowly above the floor
  const sitLegs = (side, t) => ({ hip: [-1.45, 0, side === 'L' ? -0.06 : 0.06], knee: 1.35 + 0.16 * Math.sin(t * 1.3 + (side === 'L' ? Math.PI : 0)), ankle: 0.35 });
  const ctxRef = { dir: 'in' };
  const routine = new Routine(world, [
    { id: 'phone', w: 3, dur: [3, 6], status: () => (ctxRef.dir === 'out' ? '퇴근길, 폰 보는 중 :phone:' : '출근길, 폰 보는 중 :phone:'), pose: { arm: holdPhone, head: { x: 0.32, y: 0, z: 0 } } },
    { id: 'look', w: 1, dur: [2, 3], status: '창밖 구경 중 :city:', pose: { arm: holdPhone, head: { x: -0.02, y: -0.35, z: 0 } } },
    {
      id: 'seatPhone',
      w: 0,
      dur: [4, 8],
      seated: true,
      status: () => (ctxRef.dir === 'out' ? '앉아서 폰 보며 집에 가는 중 :phone:' : '자리에 앉아 폰 보는 중 :phone:'),
      pose: { arm: holdPhone, leg: sitLegs, head: { x: 0.3, y: 0, z: 0 } },
    },
    {
      id: 'nod',
      w: 0,
      dur: [4, 8],
      seated: true,
      status: () => (ctxRef.dir === 'out' ? '꾸벅꾸벅 집에 가는 중 :zzz:' : '꾸벅꾸벅 조는 중 :zzz:'),
      pose: {
        // hands in the lap
        arm: (side) => ({ hand: mirror([-0.1, -0.33, 0.38], side), pole: [side === 'L' ? -1 : 1, -0.5, -0.4], flex: -0.1 }),
        leg: sitLegs,
        head,
        eyes: 'closed',
      },
      update: (dt, t) => {
        head.x = 0.06 + Math.max(0, Math.sin(t * 1.1)) * 0.12;
        head.z = 0.1 * Math.sin(t * 0.6);
      },
    },
  ]);
  const act = (id) => routine.list.find((a) => a.id === id);

  let speed = 0;
  const tmp = new THREE.Vector3();
  const base = new THREE.Vector3();
  // seated: the torso bottom (0.73 with trousers) rests on the seat top (1.03)
  const SEAT_LIFT = 0.31;
  let seatedNow = null;
  let lastDayCheck = 0;
  /** sit on the front edge of the bench between two passengers, or stand in the aisle */
  const place = (w, sit) => {
    seatedNow = sit;
    base.set(0, sit ? SEAT_LIFT + w.seatShift() : 0, sit ? -1.0 : 0.35);
    w.holder.position.copy(base);
    w.lightAt(0, sit ? -0.8 : 0);
  };

  return {
    group: g,
    routine,
    /** the day's passengers are made in the background; dev pages wait for them */
    get ready() {
      return crowd.ready;
    },
    frame(aspect, ctx) {
      // seen from beside the bridge, nearly level (the scene's own angle in js/tuning.js), looking in
      // through the middle window. The ride
      // opens a little wider on the train crossing the river, then moves in to the window.
      const f = world.view(ctx.dir === 'out' ? 'subway_out' : 'subway_in', aspect);
      const k = 1.2 * (1 + 0.5 * (1 - sstep(((ctx.ride ?? 1) - 0.06) / 0.4)));
      return { target: [f.target[0], f.target[1] + (k - 1.2) * 0.8, f.target[2]], w: f.w * k, h: f.h * k, elev: f.elev };
    },
    enter(ctx, w) {
      const home = ctx.dir === 'out';
      ctxRef.dir = ctx.dir;
      // going home it always sits and nods off; going in it gets a seat about half the time
      // (ctx.seat: true / false to choose)
      const sit = home || (ctx.seat ?? Math.random() < 0.5);
      act('phone').w = sit ? 0 : 3;
      act('look').w = sit ? 0 : 1;
      act('seatPhone').w = sit ? 3 : 0;
      act('nod').w = sit ? 1 : 0;
      crowd.ride(Object.assign({}, ctx, { rideNo: ++rides }), sit, Object.assign({}, w.character.prop));
      routine.cur = null;
      routine.forced = null;
      if (!home) routine.start(sit ? 'seatPhone' : 'phone');
      place(w, sit);
      speed = 1;
    },
    sky(s) {
      waterMat.color.set(s.outside.water);
      waterMat.roughness = 0.35 + 0.45 * s.dark; // no glare off a dark river
      paintDome(s);
      // after dark the night outside is dim and cool, and the car glows from inside
      const k = s.dark;
      const { hemi, key, fill, rim } = world.lights;
      hemi.intensity *= 1 - 0.45 * k;
      hemi.color.lerp(NIGHT_TINT, 0.35 * k);
      key.intensity *= 1 - 0.55 * k;
      fill.intensity *= 1 - 0.5 * k;
      rim.intensity *= 1 - 0.4 * k;
      world.scene.environmentIntensity *= 1 - 0.5 * k;
      cabinLight.intensity = 1.5 + 14 * k;
      sheenM.opacity = 0.35 * (1 - 0.6 * s.night);
    },
    update(dt, t, ctx, w) {
      // the studio (or a test) may pick the activity; going home it nods off
      routine.force(ctx.act || (ctx.dir === 'out' ? 'nod' : null));
      routine.update(dt, t);
      const sit = !!(routine.cur && routine.cur.seated);
      if (sit !== seatedNow) place(w, sit);
      // slows down over the last part of the ride
      const r = ctx.ride || 0;
      const target = r > 0.78 ? Math.max(0.05, 1 - (r - 0.78) / 0.2) : 1;
      speed += (target - speed) * Math.min(1, dt * 3);
      // the world slides past: the bridge, masts and river at the train's speed, the far city slowly
      const step = dt * SPEED * speed;
      slide = (slide + step) % 960;
      placeLand();
      waterTex.offset.x = (waterTex.offset.x + step / 8) % 1;
      skylineTex.offset.x = (skylineTex.offset.x + (dt * 0.9 * speed) / 256) % 1;
      wheels.forEach((wh) => (wh.rotation.y -= step / 0.42));
      // the car bobs on the rail joints
      const bob = (Math.max(0, Math.sin(t * 7.5)) * 0.012 + Math.sin(t * 2.3) * 0.006) * speed;
      train.position.y = bob;
      w.holder.position.y = base.y + bob;
      // the car rocks; braking leans everyone forward along the track
      const brake = r > 0.78 ? 1 - speed : 0;
      w.holder.rotation.z = (Math.sin(t * 1.9) * 0.012 + Math.sin(t * 0.73) * 0.01) * speed - brake * 0.05;
      w.holder.position.x = base.x + Math.sin(t * 1.3) * 0.03 * speed;
      straps.forEach((p, i) => (p.rotation.z = (Math.sin(t * 1.7 + i * 0.35) * 0.1 + 0.05) * speed + brake * 0.35));
      // the other passengers sway too: sleepers nod, readers glance up now and then
      crowd.update(t, speed, brake);
      // a new day (past midnight, or another date in the studio): other people
      if (t - lastDayCheck > 1) {
        lastDayCheck = t;
        crowd.sync(ctx, seatedNow, Object.assign({}, w.character.prop), ++rides);
      }
      // phone sits between the hands
      const usingPhone = routine.cur && routine.cur.id !== 'nod';
      phone.visible = usingPhone;
      if (usingPhone) {
        w.handWorld('L', tmp);
        const lx = tmp.x;
        const ly = tmp.y;
        const lz = tmp.z;
        w.handWorld('R', tmp);
        // held upright in both hands, the screen turned up toward the face (we see its back)
        phone.position.set((lx + tmp.x) / 2, (ly + tmp.y) / 2 + 0.1, (lz + tmp.z) / 2 + 0.04);
        phone.rotation.set(0.55, Math.PI, -w.holder.rotation.z);
      }
    },
  };
}
