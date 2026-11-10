/*
 * 직장의 숲 · 하루 — app.js (the phone screen: home -> subway -> office -> subway -> home)
 *
 * The character is the one made in the workshop (localStorage 'ccws-current', or a share
 * link's #c=...). Work sessions and acorns live in localStorage 'ccws-day' (see clock.js).
 *
 * Debug query params:
 *   ?test=1            title "READY" once the first scene is up, "ERR: ..." on errors
 *   ?seed=N            a random character instead of the saved one
 *   ?now=ISO ?speed=N  fake clock (starts at ISO, runs N times faster). Uses separate
 *                      storage ('ccws-day-test') so real records are never touched.
 *   ?fresh=1           (fake clock only) start from empty test data, already set up
 *   ?in=ISO            (fake clock only) a work session that started at ISO
 *   ?onboard=1         (fake clock only) show the first-run setup
 *   ?ride=ms           cutscene length (default 5600)
 *   ?mute=1            no sound for this visit
 */
import { CC } from '../cc.js';
import { sfx } from '../sfx.js';
import * as C from './clock.js';
import { World } from './world.js';
import { buildOffice } from './office.js';
import { buildSubway } from './subway.js';
import { buildHome } from './home.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const RIDE_MS = Math.max(800, +Q.get('ride') || 5600);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (Q.get('mute') === '1') sfx.forceMute();

/* ============================================================== time */
const FAKE = Q.has('now') || Q.has('speed');
const realStart = Date.now();
const fakeStart = Q.has('now') ? new Date(Q.get('now')).getTime() || realStart : realStart;
const SPEED = Math.max(1, +Q.get('speed') || 1);
const now = () => fakeStart + (Date.now() - realStart) * SPEED;

/* ============================================================== storage (never throws) */
const KEY = FAKE ? 'ccws-day-test' : 'ccws-day';
const CHAR_KEY = 'ccws-current';
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
      return true;
    } catch (e) {
      return false;
    }
  },
};

let data = C.normalize(FAKE && Q.get('fresh') === '1' ? null : store.get(KEY));
if (FAKE && Q.get('fresh') === '1') data.configured = Q.get('onboard') !== '1';
if (FAKE && Q.has('in')) {
  const t = new Date(Q.get('in')).getTime();
  if (Number.isFinite(t)) data.session = { in: t };
}
const save = () => store.set(KEY, data);

/* ============================================================== DOM */
const el = {
  day: $('#day'),
  world: $('#world'),
  whoName: $('#whoName'),
  whoSub: $('#whoSub'),
  acornLb: $('#acornLb'),
  acornN: $('#acornN'),
  acornBox: $('.acorns-n'),
  sideLb: $('#sideLb'),
  sideV: $('#sideV'),
  gauge: $('#gauge'),
  gaugeFill: $('#gaugeFill'),
  gaugeLb: $('#gaugeLb'),
  status: $('#status'),
  plus: $('#plus'),
  barNote: $('#barNote'),
  go: $('#btnGo'),
  goIc: $('#goIc'),
  goLb: $('#goLb'),
  ride: $('#ride'),
  ledText: $('#ledText'),
  iris: $('#iris'),
  sheetWrap: $('#sheetWrap'),
  sheet: $('#sheet'),
  loading: $('#loading'),
  loadingText: $('#loadingText'),
};

let mode = 'loading';
let busy = false;
let world = null;
let look = null;
let lastToday = null;
let lastFrac = 0;

function setMode(m) {
  mode = m;
  el.day.dataset.mode = m;
  fitInsets();
}

/** keep the scene centred between the HUD and the button */
function fitInsets() {
  if (!world) return;
  const H = el.day.clientHeight;
  if (mode === 'ride') {
    const led = el.ride.querySelector('.led').getBoundingClientRect();
    world.setInsets(led.bottom + 10, 70);
    return;
  }
  // layout positions (offsetTop ignores the slide-in transforms of the HUD and the bar)
  const card = $('#hud .card');
  const top = $('#hud').offsetTop + card.offsetTop + card.offsetHeight + 10;
  const bottom = H - ($('#bar').offsetTop + el.go.offsetTop) + 30;
  world.setInsets(top, bottom);
}
window.addEventListener('resize', () => fitInsets());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitInsets());

/* ============================================================== iris wipe */
function iris(open, ms = 520) {
  const node = el.iris;
  const maxR = Math.hypot(window.innerWidth, window.innerHeight) * 0.62 + 20;
  node.classList.remove('open');
  if (REDUCED) {
    node.style.setProperty('--r', open ? `${maxR}px` : '0px');
    if (open) node.classList.add('open');
    return sleep(open ? 0 : 150);
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = open ? k * k * (3 - 2 * k) : 1 - (1 - k) * (1 - k) * (1 - k);
      const r = open ? e * maxR : (1 - e) * maxR;
      node.style.setProperty('--r', `${r.toFixed(1)}px`);
      if (k < 1) requestAnimationFrame(step);
      else {
        if (open) node.classList.add('open');
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

/* ============================================================== sheets */
function openSheet(html, bind) {
  el.sheet.innerHTML = html;
  el.sheetWrap.hidden = false;
  if (bind) bind(el.sheet);
  const first = el.sheet.querySelector('[autofocus], .btn');
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() {
  el.sheetWrap.hidden = true;
  el.sheet.innerHTML = '';
}
el.sheetWrap.addEventListener('click', (e) => {
  if (e.target === el.sheetWrap && el.sheetWrap.dataset.dismiss !== 'no') closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.sheetWrap.hidden && el.sheetWrap.dataset.dismiss !== 'no') closeSheet();
});

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function settingsForm(s) {
  const days = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => `<label><input type="checkbox" name="day" value="${d}" ${s.days.includes(d) ? 'checked' : ''}><span>${DAY_NAMES[d]}</span></label>`)
    .join('');
  return `
    <div class="form">
      <div class="row">
        <label class="field">출근 시간<input type="time" name="start" value="${esc(s.start.padStart(5, '0'))}" required></label>
        <label class="field">퇴근 시간<input type="time" name="end" value="${esc(s.end.padStart(5, '0'))}" required></label>
      </div>
      <div class="field">일하는 요일<div class="days">${days}</div></div>
      <p class="hint">일한 1분마다 도토리 1개! 퇴근 시간이 지나거나 쉬는 날에 일하면 1.5배예요.</p>
    </div>`;
}
function readSettings(root) {
  const start = root.querySelector('[name=start]').value || C.DEFAULT_SETTINGS.start;
  const end = root.querySelector('[name=end]').value || C.DEFAULT_SETTINGS.end;
  const days = Array.from(root.querySelectorAll('[name=day]:checked')).map((i) => +i.value);
  return { start, end, days };
}

function openOnboarding() {
  el.sheetWrap.dataset.dismiss = 'no';
  openSheet(
    `<h2 id="sheetTitle">🎉 ${esc(look.name)} ${esc(look.rank || '')}, 입사를 축하해요!</h2>
     <p>근무 시간을 알려주세요. 내가 <b>출근하기</b>를 누르면 분신도 같이 지하철을 타고 출근해요.</p>
     ${settingsForm(data.settings)}
     <div class="btns"><button type="button" class="btn" data-act="ok">입사하기 <i class="ac"></i></button></div>`,
    (root) => {
      root.querySelector('[data-act=ok]').addEventListener('click', () => {
        data.settings = readSettings(root);
        data.configured = true;
        save();
        sfx.unlock();
        sfx.jingle();
        el.sheetWrap.dataset.dismiss = '';
        closeSheet();
        tick();
      });
    }
  );
}

function openSettings() {
  el.sheetWrap.dataset.dismiss = '';
  openSheet(
    `<h2 id="sheetTitle">설정</h2>
     ${settingsForm(data.settings)}
     <div class="form" style="margin-top:14px">
       <label class="toggle-row">소리<input type="checkbox" name="sound" ${sfx.muted ? '' : 'checked'}></label>
     </div>
     <div class="btns">
       <button type="button" class="btn" data-act="ok">저장</button>
       <a class="btn ghost" href="index.html">🎨 캐릭터 꾸미러 가기</a>
     </div>`,
    (root) => {
      root.querySelector('[data-act=ok]').addEventListener('click', () => {
        data.settings = readSettings(root);
        data.configured = true;
        save();
        const wantSound = root.querySelector('[name=sound]').checked;
        if (wantSound === sfx.muted) sfx.toggle();
        sfx.pop();
        closeSheet();
        tick();
      });
    }
  );
}

function openClockOut() {
  const t = now();
  const p = C.progress(data.session.in, t, data.settings);
  const early = !p.overtime && C.isWorkday(data.session.in, data.settings);
  el.sheetWrap.dataset.dismiss = '';
  openSheet(
    `<h2 id="sheetTitle">${early ? '벌써 퇴근할까요? 🌤️' : '오늘도 수고했어요! 🌙'}</h2>
     <p>${early ? `퇴근 시간(${esc(data.settings.end)})까지 ${esc(C.clockLeft(p.toEndMs))} 남았어요. 그래도 괜찮아요.` : '분신도 같이 짐을 챙기고 있어요.'}</p>
     <div class="facts">
       <span>출근</span><b>${C.hm(data.session.in)}</b>
       <span>근무</span><b>${C.dur(p.minutes)}</b>
       <span>이번에 받은 도토리</span><b><i class="ac"></i> ${C.comma(p.acorns)}</b>
     </div>
     <div class="btns">
       <button type="button" class="btn warm" data-act="out">🏠 퇴근하기</button>
       <button type="button" class="btn ghost" data-act="stay">조금 더 일할래요</button>
     </div>`,
    (root) => {
      root.querySelector('[data-act=out]').addEventListener('click', () => {
        closeSheet();
        clockOut();
      });
      root.querySelector('[data-act=stay]').addEventListener('click', closeSheet);
    }
  );
}

function openReceipt() {
  const r = data.receipt;
  if (!r) return;
  const d = new Date(r.out);
  const date = `${d.getFullYear()}.${C.pad2(d.getMonth() + 1)}.${C.pad2(d.getDate())} (${DAY_NAMES[d.getDay()]})`;
  el.sheetWrap.dataset.dismiss = '';
  const done = () => {
    data.receipt = null;
    save();
    closeSheet();
  };
  openSheet(
    `<h2 id="sheetTitle" style="position:absolute;left:-9999px">퇴근 영수증</h2>
     <div class="receipt">
       <h3><i class="ac"></i> 퇴근 영수증</h3>
       <p class="date">${date} · ${esc(look.name)} ${esc(look.rank || '')}</p>
       <hr>
       <dl>
         <dt>출근</dt><dd>${C.hm(r.in)}</dd>
         <dt>퇴근</dt><dd>${C.hm(r.out)}</dd>
         <dt>근무</dt><dd>${C.dur(r.minutes)}</dd>
         ${r.overtimeMin ? `<dt>그중 야근</dt><dd>${C.dur(r.overtimeMin)}</dd>` : ''}
       </dl>
       <hr>
       <dl class="big"><dt>받은 도토리</dt><dd><i class="ac"></i> ${C.comma(r.acorns)}</dd></dl>
       <dl style="margin-top:6px"><dt>모은 도토리</dt><dd><i class="ac"></i> ${C.comma(r.bank)}</dd></dl>
       <hr>
       <p class="thanks">오늘도 수고했어요!</p>
       ${r.auto ? `<p class="auto">퇴근 버튼을 안 눌러서 ${C.hm(r.out)}에 퇴근한 걸로 했어요.</p>` : ''}
     </div>
     <div class="btns"><button type="button" class="btn" data-act="ok">집에서 쉬기 🏠</button></div>`,
    (root) => root.querySelector('[data-act=ok]').addEventListener('click', done)
  );
  sfx.jingle();
}

/* ============================================================== flow */
async function ride(dir) {
  setMode('ride');
  el.ledText.textContent = dir === 'in' ? '이번 역은 직장의숲, 직장의숲 역입니다 · 내리실 문은 오른쪽입니다' : '이번 역은 우리집, 우리집 역입니다 · 오늘도 수고하셨습니다';
  sfx.whoosh();
  await iris(false);
  world.show('subway', { dir, ride: 0 });
  el.ride.hidden = false;
  await iris(true);
  await new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.ride.removeEventListener('click', finish);
      resolve();
    };
    el.ride.addEventListener('click', finish);
    const step = (t) => {
      if (done) return;
      const k = Math.min(1, (t - t0) / RIDE_MS);
      world.ctx.ride = k;
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
  });
  sfx.whoosh();
  await iris(false);
  el.ride.hidden = true;
}

async function clockIn() {
  if (busy || data.session) return;
  busy = true;
  sfx.unlock();
  sfx.pop();
  C.clockIn(data, now());
  save();
  await ride('in');
  enter('office');
  await iris(true);
  busy = false;
}

async function clockOut() {
  if (busy || !data.session) return;
  busy = true;
  sfx.unlock();
  C.clockOut(data, now());
  save();
  await ride('out');
  enter('home');
  await iris(true);
  busy = false;
  openReceipt();
}

/** show office or home and set the HUD for it */
function enter(where) {
  lastToday = null;
  tick(true);
  world.show(where, world.ctx);
  setMode(where);
  tick();
}

function onGo() {
  if (busy) return;
  sfx.unlock();
  if (data.session) openClockOut();
  else clockIn();
}

/* ============================================================== HUD */
function isLunch(t) {
  if (!data.session || !C.isWorkday(t, data.settings)) return false;
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  const s = C.parseHM(data.settings.start, 540);
  const e = C.parseHM(data.settings.end, 1080);
  return s < e && s <= 12 * 60 && e >= 13 * 60 && m >= 12 * 60 && m < 13 * 60;
}

function tick(quiet) {
  const t = now();
  // a session left running past its cap closes by itself
  if (C.settle(data, t)) {
    save();
    if (mode === 'office') {
      world.show('home', world.ctx);
      setMode('home');
      openReceipt();
    }
  }
  const mood = C.moodAt(t);
  if (world && mood !== world.mood) world.setMood(mood);
  const ctx = world.ctx;
  ctx.now = now;
  ctx.todayAcorns = C.today(data, t);
  ctx.spot = C.homeSpotAt(t);
  ctx.lunch = isLunch(t);
  ctx.overtime = !!data.session && C.progress(data.session.in, t, data.settings).overtime;
  if (quiet === true) return;
  renderHud(t);
}

function renderHud(t) {
  const today = C.today(data, t);
  el.acornN.textContent = C.comma(today);
  const s = data.settings;
  if (mode === 'office' && data.session) {
    const p = C.progress(data.session.in, t, s);
    if (p.overtime) {
      const workday = C.isWorkday(data.session.in, s);
      el.sideLb.textContent = workday ? '야근' : '휴일 근무';
      el.sideV.textContent = workday ? `${C.dur(p.overtimeMin)}째` : C.dur(p.minutes);
      el.sideV.classList.add('ot');
    } else {
      el.sideLb.textContent = '퇴근까지';
      el.sideV.textContent = C.clockLeft(p.toEndMs);
      el.sideV.classList.remove('ot');
    }
    el.gauge.hidden = false;
    const frac = p.capped ? 1 : p.frac;
    el.gaugeFill.classList.toggle('reset', frac < lastFrac);
    el.gaugeFill.style.width = `${(frac * 100).toFixed(1)}%`;
    lastFrac = frac;
    el.gaugeLb.textContent = p.capped ? '오늘은 여기까지! 퇴근하세요' : p.overtime ? '1.5배 적립 중 🌙' : '다음 도토리까지';
    el.barNote.textContent = `출근 ${C.hm(data.session.in)} · 근무 ${C.dur(p.minutes)}`;
    el.go.dataset.kind = 'out';
    el.goIc.textContent = '🏠';
    el.goLb.textContent = '퇴근하기';
    if (lastToday !== null && today > lastToday) celebrate();
  } else {
    el.sideLb.textContent = '모은 도토리';
    el.sideV.textContent = C.comma(data.bank);
    el.sideV.classList.remove('ot');
    el.gauge.hidden = true;
    const spot = world.ctx.spot;
    el.barNote.textContent = spot === 'bed' ? '쉿, 자는 중이에요 🌙' : C.isWorkday(t, s) ? `오늘 출근 시간 ${s.start}` : '오늘은 쉬는 날이에요 🌿';
    el.go.dataset.kind = 'in';
    el.goIc.textContent = '🚇';
    el.goLb.textContent = '출근하기';
  }
  lastToday = today;
}

function celebrate() {
  el.acornBox.classList.remove('bump');
  void el.acornBox.offsetWidth;
  el.acornBox.classList.add('bump');
  el.plus.classList.remove('show');
  void el.plus.offsetWidth;
  el.plus.classList.add('show');
  if (!document.hidden) sfx.tick();
}

/* ============================================================== start */
function loadLook() {
  const m = location.hash.match(/[#&]c=([A-Za-z0-9_-]+)/);
  if (m) {
    const s = CC.decodeState(m[1]);
    if (s) {
      store.set(CHAR_KEY, CC.encodeState(s));
      history.replaceState(null, '', location.pathname + location.search);
      return s;
    }
  }
  if (Q.has('seed')) {
    const s = CC.randomState(CC.rng(+Q.get('seed') || 1));
    s.name = s.name || '김숲';
    s.rank = s.rank || '사원';
    s.dept = s.dept || '도토리 개발팀';
    return s;
  }
  const saved = store.get(CHAR_KEY);
  return typeof saved === 'string' ? CC.decodeState(saved) : null;
}

function noCharacter() {
  el.loading.innerHTML = `
    <div class="loading-acorn" aria-hidden="true"></div>
    <p style="text-align:center;line-height:1.6;margin:0 24px">아직 분신이 없어요.<br>캐릭터 공방에서 먼저 만들어 주세요!</p>
    <a class="btn" href="index.html" style="padding:0 26px">🎨 캐릭터 만들러 가기</a>
    <p style="font-size:13px;opacity:.7;margin:0 24px;text-align:center">다른 기기에서 만들었다면 공방의 '공유 링크'를 이 폰에서 열어 주세요.</p>`;
  if (TEST) document.title = 'READY';
}

async function start() {
  for (const f of ['hair', 'face', 'clothes', 'extras']) {
    try {
      await import(`../parts/${f}.js`);
    } catch (e) {
      console.warn('[하루] parts failed', f, e);
    }
  }
  look = loadLook();
  if (!look) return noCharacter();
  look.name = (look.name || '').trim() || '새내기';

  el.whoName.textContent = look.name;
  el.whoSub.textContent = [look.rank, look.dept].filter(Boolean).join(' · ');

  world = new World(el.world, { onStatus: (s) => (el.status.textContent = s || '') });
  world.addSet('office', buildOffice(world));
  world.addSet('subway', buildSubway(world));
  world.addSet('home', buildHome(world));
  Object.assign(world.ctx, { name: look.name, rank: look.rank, dept: look.dept, now });
  await world.setLook(look);

  if (C.settle(data, now())) save();
  world.setMood(C.moodAt(now()));
  tick(true);
  enter(data.session ? 'office' : 'home');
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => !document.hidden && tick());

  el.go.addEventListener('click', onGo);
  $('#btnSettings').addEventListener('click', () => {
    sfx.unlock();
    openSettings();
  });
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  el.loading.classList.add('done');
  setTimeout(() => (el.loading.hidden = true), 450);
  await iris(true);
  if (!data.configured) openOnboarding();
  else if (data.receipt) openReceipt();
  window.dayApp = { world, data: () => data, now, clockIn, clockOut, tick };
  if (TEST && !window.__day.errors.length) document.title = 'READY';
}

start().catch((e) => {
  console.error(e);
  el.loadingText.textContent = '앗, 불러오지 못했어요. 새로고침해 주세요.';
  if (window.__day) window.__day.errors.push(String(e && e.message));
  if (TEST) document.title = 'ERR: ' + String(e && e.message);
});
