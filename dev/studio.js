/*
 * 직장의 숲 · 스튜디오 — tune the character's proportions and the day-scene cameras,
 * see the result everywhere at once, then save it into js/tuning.js.
 *
 * Views: the phone screen (the real World with its sets), the character from four sides
 * with a head-unit ruler, and a free orbit view of the scene with the app camera drawn in.
 * Work in progress is kept in localStorage (DRAFT_KEY), so day.html?draft=1 and
 * index.html?draft=1 can show it before it is saved.
 *
 * ?test=1 -> title READY / ERR: ... (screenshot tool), ?scene=<key>, ?seed=N
 */
import * as THREE from 'three';
import { CC } from '../js/cc.js';
import { Character, makeScene, makeRenderer, normalizeProportions } from '../js/char3d.js';
import { TUNING_BASE, mergeTuning, DRAFT_KEY } from '../js/tuning.js';
import { World } from '../js/day/world.js';
import { buildOffice } from '../js/day/office.js';
import { buildSubway } from '../js/day/subway.js';
import { buildHome } from '../js/day/home.js';
import { sunTimes } from '../js/day/sky.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String((e.reason && e.reason.stack) || e.reason)));
const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? null : JSON.parse(v);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      /* ignore */
    }
  },
};

for (const f of ['hair', 'face', 'clothes', 'extras']) {
  try {
    await import(`../js/parts/${f}.js`);
  } catch (e) {
    errors.push(`parts/${f}: ${e.message}`);
  }
}

/* ============================================================== values */
const pickValues = (t) => ({ character: clone(t.character), camera: clone(t.camera), scenes: clone(t.scenes) });
let fileValues = pickValues(TUNING_BASE); // what js/tuning.js holds
let hasServer = false;
try {
  const r = await fetch('/__studio/tuning', { cache: 'no-store' });
  if (r.ok) {
    fileValues = pickValues(await r.json());
    hasServer = true;
  }
} catch (e) {
  /* plain static server: saving falls back to copy */
}
// the live copy every view reads; edited in place so the World keeps its reference
const T = mergeTuning(fileValues, store.get(DRAFT_KEY));

function assignInPlace(dst, src) {
  Object.keys(src).forEach((k) => {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
      assignInPlace(dst[k], src[k]);
    } else if (Array.isArray(src[k]) && Array.isArray(dst[k])) {
      src[k].forEach((v, i) => (dst[k][i] = v));
    } else dst[k] = clone(src[k]);
  });
}

const SCENES = [
  // time: a typical moment for the place (minutes after midnight)
  { key: 'office', name: '회사', set: 'office', ctx: {}, time: 14 * 60 },
  { key: 'home_ready', name: '집 · 아침 (출근 준비)', set: 'home', ctx: { spot: 'ready' }, time: 7 * 60 + 40 },
  { key: 'home_table', name: '집 · 저녁 (테이블)', set: 'home', ctx: { spot: 'table' }, time: 19 * 60 + 30 },
  { key: 'home_bed', name: '집 · 밤 (침대)', set: 'home', ctx: { spot: 'bed' }, time: 23 * 60 + 30 },
  { key: 'subway_in', name: '지하철 · 출근', set: 'subway', ctx: { dir: 'in' }, time: 8 * 60 + 20 },
  { key: 'subway_out', name: '지하철 · 퇴근', set: 'subway', ctx: { dir: 'out' }, time: 17 * 60 + 40 },
];
const ACT_NAMES = {
  type: '타이핑', coffee: '커피', stretch: '기지개', think: '고민', doze: '꾸벅꾸벅', lunch: '점심 도시락',
  eat: '먹기', tv: 'TV 보기', phone: '폰 보기', relax: '쉬기', pace: '걸어 다니기', idle: '가만히',
  yawn: '하품', look: '창밖 보기', wave: '손 흔들기', sleep: '자기', nod: '졸기',
};
const PHONES = { '390x844': [390, 844], '375x667': [375, 667], '430x932': [430, 932] };
const TURN_POSES = {
  stand: { name: '서기 (비율 재기)', leg: null },
  sit: { name: '앉기', leg: () => ({ hip: [-1.5, 0, 0], knee: 1.5, ankle: 0 }), lift: 0.45 },
  walk: { name: '걷기', leg: (side) => (side === 'L' ? { hip: [-0.42, 0, 0], knee: 0.3, ankle: 0 } : { hip: [0.35, 0, 0], knee: 0.6, ankle: 0.3 }) },
};

const ui = {
  scene: SCENES.find((s) => s.key === Q.get('scene')) || SCENES[0],
  minutes: 0, // time of day shown (minutes after midnight)
  date: null, // 'YYYY-MM-DD'
  live: false, // follow the real clock instead
  act: '',
  acorns: 230,
  phone: '390x844',
  hud: true,
  source: 'mine',
  seed: +(Q.get('seed') || 3),
  turnPose: 'stand',
};
ui.minutes = ui.scene.time;
{
  const d = new Date();
  ui.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** the moment the studio shows (local time) */
function studioNow() {
  if (ui.live) return Date.now();
  const [y, m, d] = ui.date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(ui.minutes / 60), ui.minutes % 60).getTime();
}

/* ============================================================== character look */
function savedLook() {
  const v = store.get('ccws-current');
  return typeof v === 'string' ? CC.decodeState(v) : null;
}
function currentLook() {
  let s = ui.source === 'mine' ? savedLook() : null;
  if (!s) s = CC.randomState(CC.rng(ui.seed));
  s.name = s.name || '김숲';
  s.rank = s.rank || '사원';
  s.dept = s.dept || '도토리 개발팀';
  return s;
}
if (!savedLook() || Q.has('seed')) ui.source = 'random';

/* ============================================================== phone (the real world) */
const world = new World($('#world'), { tuning: T, onStatus: (s) => ($('#phoneCap').textContent = `폰 화면 (카메라로 본 모습) · ${s}`) });
world.addSet('office', buildOffice(world));
world.addSet('subway', buildSubway(world));
world.addSet('home', buildHome(world));
Object.assign(world.ctx, { now: () => Date.now(), todayAcorns: ui.acorns, ride: 0.4, act: null, lunch: false, overtime: false });

function layoutPhone() {
  const [pw, ph] = PHONES[ui.phone];
  const maxH = Math.max(420, window.innerHeight - 120);
  const H = Math.min(maxH, 780);
  const s = H / ph;
  const W = Math.round(pw * s);
  const el = $('#phone');
  el.style.width = `${W}px`;
  el.style.height = `${Math.round(H)}px`;
  // the app's HUD (fixed pixel sizes on the phone), scaled to this preview
  const top = (165 + 10) * s;
  const bottom = (80 + 30) * s;
  world.setInsets(top, bottom);
  const hud = $('#hud');
  hud.hidden = !ui.hud;
  hud.querySelector('.who').style.cssText = `top:${10 * s}px;height:${30 * s}px`;
  hud.querySelector('.card').style.cssText = `top:${56 * s}px;height:${108 * s}px`;
  hud.querySelector('.go').style.cssText = `top:${H - 80 * s}px;height:${64 * s}px`;
  hud.querySelector('.band').style.cssText = `top:${top}px;bottom:${bottom}px`;
}

function showScene() {
  const sc = ui.scene;
  world.ctx.now = studioNow; // wall clocks show the chosen time
  world.setTime(studioNow());
  world.ctx.act = ui.act || null;
  world.ctx.todayAcorns = ui.acorns;
  world.show(sc.set, Object.assign({ spot: undefined, dir: undefined }, sc.ctx, { act: ui.act || null }));
  orbit.target.set(...T.scenes[sc.key].target);
  fillActs();
}

/* ============================================================== turnaround (4 sides + ruler) */
const turn = (() => {
  const box = $('#turn');
  const canvas = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  box.append(canvas, overlay);
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const s = makeScene(renderer, { shadowSize: 1024 });
  const ch = new Character();
  s.scene.add(ch.root);
  const cams = [0, 1, 2, 3].map(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60));
  // front, the character's left side (+x), back, its right side (-x)
  const DIRS = [
    [0, 0, 1, '정면'],
    [1, 0, 0, '왼쪽'],
    [0, 0, -1, '뒷면'],
    [-1, 0, 0, '오른쪽'],
  ];
  let m = null;

  function measure() {
    ch.root.updateMatrixWorld(true);
    // precise: every vertex, so warped and skinned shapes are measured as drawn
    const skull = new THREE.Box3().setFromObject(ch.base.headMesh, true);
    const all = new THREE.Box3();
    ch.head.traverse((o) => o.isMesh && o.visible && o !== ch.faceMesh && all.expandByObject(o, true));
    const body = new THREE.Box3().setFromObject(ch.body, true);
    return { chin: skull.min.y, top: skull.max.y, hair: all.max.y, feet: Math.min(0, body.min.y), width: Math.max(all.max.x - all.min.x, body.max.x - body.min.x) };
  }

  function render() {
    const w = box.clientWidth;
    const h = box.clientHeight;
    renderer.setSize(w, h, false);
    const dpr = renderer.getPixelRatio();
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    const pw = w / 4;
    const aspect = pw / h;
    m = measure();
    const span = Math.max(m.hair + 0.75, (m.width + 0.6) / aspect);
    const top = span - 0.25;
    const bottom = -0.25;
    renderer.setScissorTest(true);
    cams.forEach((cam, i) => {
      const [dx, , dz] = DIRS[i];
      cam.left = (-span * aspect) / 2;
      cam.right = (span * aspect) / 2;
      cam.top = top - span / 2;
      cam.bottom = bottom - span / 2;
      cam.position.set(dx * 20, span / 2, dz * 20);
      cam.lookAt(0, span / 2, 0);
      cam.updateProjectionMatrix();
      renderer.setViewport(i * pw, 0, pw, h);
      renderer.setScissor(i * pw, 0, pw, h);
      renderer.render(s.scene, cam);
    });
    renderer.setScissorTest(false);
    // ruler
    const g = overlay.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const Y = (y) => ((top - y) / (top - bottom)) * h;
    const headH = m.top - m.chin;
    const line = (y, color, dash) => {
      g.strokeStyle = color;
      g.setLineDash(dash || []);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, Math.round(Y(y)) + 0.5);
      g.lineTo(w, Math.round(Y(y)) + 0.5);
      g.stroke();
    };
    line(m.feet, 'rgba(74,51,35,0.5)');
    line(m.chin, 'rgba(229,88,79,0.8)', [5, 4]);
    line(m.top, 'rgba(229,88,79,0.8)', [5, 4]);
    if (m.hair > m.top + 0.02) line(m.hair, 'rgba(90,169,230,0.7)', [2, 4]);
    g.setLineDash([]);
    // head units counted down from the top of the skull
    g.font = '12px system-ui, sans-serif';
    g.fillStyle = 'rgba(229,88,79,0.9)';
    for (let k = 0; m.top - k * headH > m.feet - 1e-3 && k < 8; k++) {
      const y = Y(m.top - k * headH);
      g.fillRect(0, y - 1, 10, 2);
      if (k) g.fillText(String(k), 13, y + 4);
    }
    g.fillStyle = 'rgba(74,51,35,0.75)';
    DIRS.forEach((d, i) => g.fillText(d[3], i * pw + pw / 2 - 12, h - 10));
    for (let i = 1; i < 4; i++) {
      g.fillStyle = 'rgba(122,93,69,0.15)';
      g.fillRect(i * pw, 0, 1, h);
    }
    showRatio();
  }

  async function setLook(look, prop) {
    ch.prop = normalizeProportions(prop);
    await ch.setState(look, { animate: false });
    pose();
  }
  function pose() {
    const p = TURN_POSES[ui.turnPose];
    ch.restPose();
    ch.pose = p.leg ? { leg: p.leg } : null;
    for (let i = 0; i < 60; i++) ch.tick(1 / 60);
    if (!p.leg) ch.restPose();
    ch.root.position.y = p.lift || 0;
    ch.root.rotation.y = 0;
    render();
  }
  new ResizeObserver(() => render()).observe(box);
  return { ch, render, setLook, pose, get m() { return m; } };
})();

function showRatio() {
  const m = turn.m;
  const el = $('#ratio');
  if (!m || !el) return;
  const head = m.top - m.chin;
  const body = m.chin - m.feet;
  const total = m.top - m.feet;
  const withHair = m.hair - m.feet;
  el.innerHTML =
    `머리 : 몸 = <b>${(head / body).toFixed(2)} : 1</b><br>` +
    `<b>${(total / head).toFixed(1)}등신</b> · 머리가 키의 ${Math.round((head / total) * 100)}%<br>` +
    `<span style="color:var(--ink-3)">머리카락까지 키 ${withHair.toFixed(2)} (머리카락을 머리로 치면 ${(withHair / (m.hair - m.chin)).toFixed(1)}등신)</span>`;
}

/* ============================================================== orbit view */
const orbit = (() => {
  const box = $('#orbit');
  const canvas = document.createElement('canvas');
  box.prepend(canvas);
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  cam.layers.enable(2);
  // a short stand-in for the app camera, so the frustum drawn stays small
  const proxy = new THREE.PerspectiveCamera();
  const helper = new THREE.CameraHelper(proxy);
  helper.setColors(new THREE.Color('#f6b400'), new THREE.Color('#f6b400'), new THREE.Color('#e5584f'), new THREE.Color('#f6b400'), new THREE.Color('#e5584f'));
  helper.layers.set(2);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: '#e5584f' }));
  dot.layers.set(2);
  world.scene.add(helper, dot);
  // start from the side, far enough out to see both the room and the app camera above it
  const st = { yaw: 1.25, pitch: 0.28, dist: 52, target: new THREE.Vector3(0, 1.5, 0), pan: new THREE.Vector3(0, 6, 9) };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const k = st.dist * 0.0015;
      st.pan.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else {
      st.yaw -= dx * 0.008;
      st.pitch = Math.min(1.5, Math.max(-0.2, st.pitch + dy * 0.008));
    }
  });
  const up = () => {
    drag = null;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      st.dist = Math.min(150, Math.max(4, st.dist * (1 + e.deltaY * 0.001)));
    },
    { passive: false }
  );
  function frame() {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.updateProjectionMatrix();
    }
    const c = world.camera;
    const tgt = st.target.clone().add(st.pan);
    cam.position.set(tgt.x + Math.sin(st.yaw) * Math.cos(st.pitch) * st.dist, tgt.y + Math.sin(st.pitch) * st.dist, tgt.z + Math.cos(st.yaw) * Math.cos(st.pitch) * st.dist);
    cam.lookAt(tgt);
    // stand-in camera: same pose and lens as the app camera, cut short at the scene
    proxy.position.copy(c.position);
    proxy.quaternion.copy(c.quaternion);
    proxy.fov = c.fov;
    proxy.aspect = c.aspect;
    proxy.near = 0.5;
    proxy.far = Math.max(2, c.position.distanceTo(st.target) * 1.05);
    proxy.view = c.view ? Object.assign({}, c.view) : null;
    proxy.updateProjectionMatrix();
    proxy.updateMatrixWorld(true);
    helper.update();
    const sc = T.scenes[ui.scene.key];
    dot.position.set(...sc.target);
    renderer.render(world.scene, cam);
  }
  return { frame, target: st.target, st };
})();

/* ============================================================== controls */
const controls = $('#controls');
const rows = []; // { refresh() }
let propTimer = 0;

function group(title, note) {
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<h2>${title}${note ? `<small>${note}</small>` : ''}</h2>`;
  controls.append(g);
  return g;
}

/** slider bound to obj[key] (or arr index); onChange after each input */
function slider(parent, { label, get, set, min, max, step, fileValue, onChange, hint }) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label><span>${label}</span><span class="reset" title="저장된 값으로">↺</span></label><input type="range"><input type="number">`;
  const [range, numIn] = row.querySelectorAll('input');
  [range, numIn].forEach((i) => Object.assign(i, { min, max, step }));
  const show = () => {
    const v = get();
    range.value = v;
    numIn.value = Math.round(v * 1000) / 1000;
  };
  const apply = (v) => {
    v = Math.min(max, Math.max(min, +v));
    if (!Number.isFinite(v)) return;
    set(v);
    show();
    onChange && onChange();
    changed();
  };
  range.addEventListener('input', () => apply(range.value));
  numIn.addEventListener('change', () => apply(numIn.value));
  row.querySelector('.reset').addEventListener('click', () => apply(fileValue()));
  show();
  parent.append(row);
  if (hint) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = hint;
    parent.append(p);
  }
  rows.push({ refresh: show });
  return row;
}

function select(parent, label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'pick';
  row.innerHTML = `<span>${label}</span><select></select>`;
  const sel = row.querySelector('select');
  const fill = (opts, v) => {
    sel.innerHTML = opts.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
    sel.value = v;
  };
  fill(options, value);
  sel.addEventListener('change', () => onChange(sel.value));
  parent.append(row);
  return { row, sel, fill };
}

// ---- character
const gChar = group('캐릭터', '모든 캐릭터에 같이 적용돼요');
const srcRow = select(gChar, '보기', [['mine', '내 캐릭터 (공방)'], ['random', '랜덤 캐릭터']], ui.source, (v) => {
  ui.source = v;
  reloadLook();
});
const dice = document.createElement('button');
dice.className = 'btn';
dice.textContent = '🎲';
dice.title = '다른 랜덤 캐릭터';
dice.addEventListener('click', () => {
  ui.seed += 1;
  ui.source = 'random';
  srcRow.sel.value = 'random';
  reloadLook();
});
srcRow.row.append(dice);
const PROP_ROWS = [
  ['head', '머리 크기', 0.5, 1.4, '머리카락, 모자, 얼굴도 같이 커지고 작아져요'],
  ['torso', '몸통 길이', 0.6, 1.8],
  ['legs', '다리 길이', 0.5, 2.2],
  ['width', '몸 너비', 0.7, 1.4],
];
PROP_ROWS.forEach(([k, label, min, max, hint]) =>
  slider(gChar, {
    label,
    min,
    max,
    step: 0.01,
    get: () => T.character[k],
    set: (v) => (T.character[k] = v),
    fileValue: () => fileValues.character[k],
    onChange: queueProportions,
    hint,
  })
);
const ratio = document.createElement('div');
ratio.className = 'ratio';
ratio.id = 'ratio';
gChar.append(ratio);
select(gChar, '옆 화면 자세', Object.entries(TURN_POSES).map(([k, p]) => [k, p.name]), ui.turnPose, (v) => {
  ui.turnPose = v;
  turn.pose();
});

// ---- place
const gPlace = group('장소');
select(gPlace, '장소', SCENES.map((s) => [s.key, s.name]), ui.scene.key, (v) => {
  ui.scene = SCENES.find((s) => s.key === v);
  ui.minutes = ui.scene.time;
  ui.act = '';
  showTime();
  showScene();
  targetRows.forEach((r) => r.refresh());
  $('#targetTitle').textContent = `카메라 중심 · ${ui.scene.name}`;
});
// ---- time of day: a date and a time (or the real clock); the sky is worked out from the sun
const timeBox = document.createElement('div');
timeBox.innerHTML = `
  <div class="pick"><span>날짜</span><input type="date" id="tDate" style="flex:1;padding:3px 6px;border-radius:8px;border:1px solid var(--line)"></div>
  <div class="row"><label><span>시각</span><b id="tLabel" style="font-weight:normal;color:var(--warm-d)"></b></label><input type="range" id="tRange" min="0" max="1435" step="5" style="grid-column:1/-1"></div>
  <p class="hint" id="tSun"></p>
  <label class="pick"><input type="checkbox" id="tLive"><span>실제 시간 따라가기</span></label>`;
gPlace.append(timeBox);
const tDate = timeBox.querySelector('#tDate');
const tRange = timeBox.querySelector('#tRange');
const tLive = timeBox.querySelector('#tLive');
function showTime() {
  const t = studioNow();
  const d = new Date(t);
  tDate.value = ui.date;
  tRange.value = ui.live ? d.getHours() * 60 + d.getMinutes() : ui.minutes;
  [tDate, tRange].forEach((i) => (i.disabled = ui.live));
  const hm = (ms) => (ms ? new Date(ms).toTimeString().slice(0, 5) : '--:--');
  $('#tLabel').textContent = `${hm(t)} · ${{ morning: '아침', day: '낮', dusk: '저녁노을', night: '밤' }[world.mood] || ''}`;
  const st = sunTimes(t);
  $('#tSun').textContent = `해 뜨는 시각 ${hm(st.rise)} · 해 지는 시각 ${hm(st.set)} (서울 기준)`;
}
tDate.addEventListener('change', () => {
  if (!tDate.value) return;
  ui.date = tDate.value;
  world.setTime(studioNow());
  showTime();
});
tRange.addEventListener('input', () => {
  ui.minutes = +tRange.value;
  world.setTime(studioNow());
  showTime();
});
tLive.addEventListener('change', () => {
  ui.live = tLive.checked;
  world.setTime(studioNow());
  showTime();
});
setInterval(() => {
  if (!ui.live) return;
  world.setTime(studioNow());
  showTime();
}, 1000);
const actRow = select(gPlace, '동작', [['', '자동']], '', (v) => {
  ui.act = v;
  world.ctx.act = v || null;
});
function fillActs() {
  const r = world.active && world.active.routine;
  const ids = r ? r.list.map((a) => a.id) : [];
  actRow.fill([['', '자동'], ...ids.map((id) => [id, ACT_NAMES[id] || id])], ids.includes(ui.act) ? ui.act : '');
}
slider(gPlace, {
  label: '바구니 도토리 (회사)',
  min: 0,
  max: 640,
  step: 10,
  get: () => ui.acorns,
  set: (v) => {
    ui.acorns = v;
    world.ctx.todayAcorns = v;
  },
  fileValue: () => 230,
});

// ---- camera (shared)
const gCam = group('카메라', '모든 장소 공통');
slider(gCam, { label: '내려다보는 각도 (°)', min: 0, max: 85, step: 1, get: () => T.camera.elev, set: (v) => (T.camera.elev = v), fileValue: () => fileValues.camera.elev, hint: '0이면 정면, 클수록 위에서 내려다봐요' });
slider(gCam, { label: '거리 (화면에 담는 높이)', min: 3, max: 24, step: 0.1, get: () => T.camera.height, set: (v) => (T.camera.height = v), fileValue: () => fileValues.camera.height, hint: '클수록 멀리서 봐요 → 캐릭터가 작아져요' });
slider(gCam, { label: '화각 (°)', min: 10, max: 75, step: 1, get: () => T.camera.fov, set: (v) => (T.camera.fov = v), fileValue: () => fileValues.camera.fov, hint: '작을수록 평평하게, 클수록 원근감이 세져요' });

// ---- camera target for this place
const gTarget = group('카메라 중심');
gTarget.querySelector('h2').innerHTML = `<span id="targetTitle">카메라 중심 · ${ui.scene.name}</span>`;
['x (좌우)', 'y (높이)', 'z (앞뒤)'].forEach((label, i) =>
  slider(gTarget, {
    label,
    min: i === 1 ? -1 : -8,
    max: i === 1 ? 5 : 8,
    step: 0.05,
    get: () => T.scenes[ui.scene.key].target[i],
    set: (v) => (T.scenes[ui.scene.key].target[i] = v),
    fileValue: () => fileValues.scenes[ui.scene.key].target[i],
  })
);
const targetRows = rows.slice(-3); // refreshed when the place changes

// ---- phone
const gPhone = group('폰 화면');
select(gPhone, '크기', Object.keys(PHONES).map((k) => [k, k.replace('x', ' × ')]), ui.phone, (v) => {
  ui.phone = v;
  layoutPhone();
});
const hudRow = document.createElement('label');
hudRow.className = 'pick';
hudRow.innerHTML = '<span>앱 화면 가림막 (상단 카드 · 버튼) 표시</span><input type="checkbox" checked>';
hudRow.querySelector('input').addEventListener('change', (e) => {
  ui.hud = e.target.checked;
  layoutPhone();
});
gPhone.append(hudRow);
const note = document.createElement('p');
note.className = 'hint';
note.textContent = '빨간 점선 사이가 앱에서 장면이 보이는 영역이에요. 카메라 중심이 이 영역 가운데에 와요.';
gPhone.append(note);

/* ============================================================== apply / save */
async function applyProportions() {
  const look = currentLook();
  Object.assign(world.ctx, { name: look.name, rank: look.rank, dept: look.dept });
  world.character.prop = normalizeProportions(T.character);
  await world.setLook(look);
  showScene();
  await turn.setLook(look, T.character);
}
function queueProportions() {
  clearTimeout(propTimer);
  propTimer = setTimeout(applyProportions, 160);
}
async function reloadLook() {
  await applyProportions();
}

let draftTimer = 0;
function changed() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => store.set(DRAFT_KEY, pickValues(T)), 150);
  updateBadge();
}
function dirty() {
  return JSON.stringify(pickValues(T)) !== JSON.stringify(fileValues);
}
function updateBadge() {
  const b = $('#badge');
  const d = dirty();
  b.textContent = d ? '저장 안 된 변경이 있어요' : hasServer ? '저장된 값 (js/tuning.js)' : '저장된 값';
  b.classList.toggle('dirty', d);
}

$('#btnRevert').addEventListener('click', async () => {
  assignInPlace(T, fileValues);
  store.del(DRAFT_KEY);
  rows.forEach((r) => r.refresh());
  updateBadge();
  await applyProportions();
});
$('#btnApp').addEventListener('click', () => {
  store.set(DRAFT_KEY, pickValues(T));
  window.open('../day.html?draft=1', '_blank');
});
$('#btnWorkshop').addEventListener('click', () => {
  store.set(DRAFT_KEY, pickValues(T));
  window.open('../index.html?draft=1', '_blank');
});
$('#btnSave').addEventListener('click', async () => {
  const values = pickValues(T);
  try {
    if (!hasServer) throw new Error('no server');
    const r = await fetch('/__studio/tuning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    if (!r.ok) throw new Error(await r.text());
    fileValues = pickValues((await r.json()).values);
    assignInPlace(T, fileValues);
    store.del(DRAFT_KEY);
    rows.forEach((row) => row.refresh());
    updateBadge();
    const b = $('#badge');
    b.textContent = '저장했어요 ✓ js/tuning.js';
  } catch (e) {
    $('#saveJson').textContent = JSON.stringify(values, null, 2);
    $('#saveModal').hidden = false;
  }
});
$('#btnCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#saveJson').textContent);
    $('#btnCopy').textContent = '복사했어요 ✓';
  } catch (e) {
    $('#btnCopy').textContent = '직접 선택해서 복사해 주세요';
  }
});
$('#btnCloseModal').addEventListener('click', () => ($('#saveModal').hidden = true));

/* ============================================================== start */
layoutPhone();
window.addEventListener('resize', layoutPhone);
await applyProportions();
showTime();
updateBadge();
(function loop() {
  requestAnimationFrame(loop);
  if (!document.hidden) orbit.frame();
})();
window.studio = {
  world,
  turn,
  orbit,
  T,
  ui,
  /** for tests and the console: studio.setTime('17:20') or studio.setTime('12:00', '2026-06-21') */
  setTime(hhmm, date) {
    const [h, m] = hhmm.split(':').map(Number);
    ui.minutes = h * 60 + m;
    if (date) ui.date = date;
    world.setTime(studioNow());
    showTime();
  },
  /** for tests and the console: studio.setProp('head', 0.85) */
  async setProp(k, v) {
    T.character[k] = v;
    rows.forEach((r) => r.refresh());
    changed();
    await applyProportions();
  },
};
await sleep(300);
if (TEST) document.title = errors.length ? `ERR: ${errors[0].slice(0, 120)}` : 'READY';
