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
 *   ?home=ISO          (fake clock only) came home at ISO (the 6-hour rest starts then)
 *   ?sleep=tired|late  (with ?home) went straight to bed on coming home
 *   ?hp=N              (fake clock only) stamina at the start of ?in, or on arrival at ?home
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
import { icon, setRich, setIcon, fillIcons } from './icons.js';

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
const HP = FAKE && Q.has('hp') ? Math.max(0, Math.min(C.STAMINA.max, +Q.get('hp') || 0)) : null;
if (FAKE && Q.has('in')) {
  const t = new Date(Q.get('in')).getTime();
  if (Number.isFinite(t)) data.session = { in: t, s0: HP ?? C.STAMINA.max };
}
if (FAKE && Q.has('home')) {
  const t = new Date(Q.get('home')).getTime();
  const sleep = ['tired', 'late'].includes(Q.get('sleep')) ? Q.get('sleep') : null;
  if (Number.isFinite(t)) {
    data.session = null;
    data.home = { from: t, s0: HP ?? 50, t0: t, sleepFrom: sleep ? t : 0, sleepUntil: sleep ? t + C.REST_HOURS * 3600e3 : 0, sleep };
  }
}
const save = () => store.set(KEY, data);
fillIcons();

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
  hp: $('#hp'),
  hpBar: $('#hpBar'),
  hpFill: $('#hpFill'),
  hpLb: $('#hpLb'),
  hpV: $('#hpV'),
  status: $('#status'),
  plus: $('#plus'),
  barNote: $('#barNote'),
  go: $('#btnGo'),
  nap: $('#btnNap'),
  napIc: $('#napIc'),
  napLb: $('#napLb'),
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
let lastCardH = 0;

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
      <p class="hint">일한 1분마다 도토리 1개! 퇴근 시간이 지나거나 쉬는 날에 일하면 1.5배예요. 대신 체력이 2배로 닳아요. 체력이 바닥나면 분신은 집에 가요.</p>
      <p class="hint">${icon('bolt')} 퇴근하면 집에서 ${C.REST_HOURS}시간은 쉬어야 다시 출근할 수 있어요.</p>
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
    `<h2 id="sheetTitle">${icon('party')} ${esc(look.name)} ${esc(look.rank || '')}, 입사를 축하해요!</h2>
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
       <label class="vol-row">${icon('music')}<span>배경음악</span><input type="range" name="volBgm" min="0" max="100" step="5" value="${Math.round(sfx.bgm.volume * 100)}"><output>${Math.round(sfx.bgm.volume * 100)}</output></label>
       <label class="vol-row">${icon('bell')}<span>효과음</span><input type="range" name="volSfx" min="0" max="100" step="5" value="${Math.round(sfx.volume * 100)}"><output>${Math.round(sfx.volume * 100)}</output></label>
     </div>
     <div class="btns">
       <button type="button" class="btn" data-act="ok">저장</button>
       <a class="btn ghost" href="index.html">${icon('palette')} 캐릭터 꾸미러 가기</a>
     </div>`,
    (root) => {
      // the volumes and the sound switch act at once, so they can be set by ear
      const sound = root.querySelector('[name=sound]');
      sound.addEventListener('change', () => {
        sfx.unlock();
        if (sound.checked === sfx.muted) sfx.toggle();
        if (sound.checked) sfx.pop();
      });
      const slide = (name, set, heard) => {
        const inp = root.querySelector(`[name=${name}]`);
        const shown = inp.parentElement.querySelector('output');
        inp.addEventListener('input', () => {
          sfx.unlock();
          set(inp.value / 100);
          shown.textContent = inp.value;
        });
        if (heard) inp.addEventListener('change', heard);
      };
      slide('volBgm', (v) => {
        sfx.bgm.setEnabled(true);
        sfx.bgm.setVolume(v);
      });
      slide('volSfx', (v) => sfx.setVolume(v), () => sfx.pop()); // a pop at the new level when the slider is let go
      root.querySelector('[data-act=ok]').addEventListener('click', () => {
        data.settings = readSettings(root);
        data.configured = true;
        save();
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
  const back = t + C.REST_HOURS * 3600e3;
  el.sheetWrap.dataset.dismiss = '';
  openSheet(
    `<h2 id="sheetTitle">${early ? `벌써 퇴근할까요? ${icon('sun')}` : `오늘도 수고했어요! ${icon('moon')}`}</h2>
     <p>${early ? `퇴근 시간(${esc(data.settings.end)})까지 ${esc(C.clockLeft(p.toEndMs))} 남았어요. 그래도 괜찮아요.` : '분신도 같이 짐을 챙기고 있어요.'}
        퇴근하면 집에서 ${C.REST_HOURS}시간은 쉬어서, ${C.hm(back)}부터 다시 출근할 수 있어요.</p>
     <div class="facts">
       <span>출근</span><b>${C.hm(data.session.in)}</b>
       <span>근무</span><b>${C.dur(p.minutes)}</b>
       <span>남은 체력</span><b>${icon('bolt')} ${Math.ceil(C.staminaAt(data, t))}</b>
       <span>이번에 받은 도토리</span><b><i class="ac"></i> ${C.comma(p.acorns)}</b>
     </div>
     <div class="btns">
       <button type="button" class="btn warm" data-act="out">${icon('house')} 퇴근하기</button>
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
         ${Number.isFinite(r.stamina) ? `<dt>남은 체력</dt><dd>${icon('bolt')} ${r.stamina}</dd>` : ''}
       </dl>
       <hr>
       <dl class="big"><dt>받은 도토리</dt><dd><i class="ac"></i> ${C.comma(r.acorns)}</dd></dl>
       <dl style="margin-top:6px"><dt>모은 도토리</dt><dd><i class="ac"></i> ${C.comma(r.bank)}</dd></dl>
       <hr>
       <p class="thanks">오늘도 수고했어요!</p>
       ${r.tired ? `<p class="auto">체력이 다 떨어져서 ${C.hm(r.out)}에 집으로 돌아왔어요.</p>` : r.auto ? `<p class="auto">퇴근 버튼을 안 눌러서 ${C.hm(r.out)}에 퇴근한 걸로 했어요.</p>` : ''}
       ${r.restUntil > now() ? `<p class="auto">${C.hm(r.restUntil)}까지는 집에서 푹 쉬어요.</p>` : ''}
     </div>
     <div class="btns"><button type="button" class="btn" data-act="ok">집에서 쉬기 ${icon('house')}</button></div>`,
    (root) => root.querySelector('[data-act=ok]').addEventListener('click', done)
  );
  sfx.jingle();
}

/* ============================================================== flow */
async function ride(dir, tired) {
  setMode('ride');
  const clockNow = C.hm(now());
  el.ledText.textContent =
    dir === 'in'
      ? `${clockNow} · 이번 역은 직장의숲, 직장의숲 역입니다 · 내리실 문은 오른쪽입니다`
      : tired
        ? `${clockNow} · 체력이 바닥나서 집으로 갑니다 · 이번 역은 우리집, 우리집 역입니다 · 푹 쉬세요`
        : `${clockNow} · 이번 역은 우리집, 우리집 역입니다 · 오늘도 수고하셨습니다`;
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
  if (busy || !C.canClockIn(data, now())) return;
  busy = true;
  sfx.unlock();
  sfx.pop();
  C.clockIn(data, now());
  save();
  await ride('in');
  enter(data.session ? 'office' : 'home');
  await iris(true);
  busy = false;
  if (!data.session) openReceipt();
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

/** stamina ran out at work: the character goes home by itself */
async function goHomeTired() {
  busy = true;
  el.sheetWrap.dataset.dismiss = '';
  closeSheet();
  if (data.receipt && now() - data.receipt.out < 60e3) {
    // it just happened: ride home
    await ride('out', true);
  } else {
    // it happened while nobody was looking: it is already home
    await iris(false);
  }
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

/** the bed button at home: to bed, or up again */
function onNap() {
  if (busy || mode !== 'home') return;
  sfx.unlock();
  const t = now();
  if (C.sentToBed(data, t)) C.wake(data, t);
  else C.goSleep(data, t);
  save();
  sfx.pop(C.sentToBed(data, t) ? 0.8 : 1.2);
  tick();
}

function onGo() {
  if (busy) return;
  sfx.unlock();
  if (data.session) openClockOut();
  else if (!C.canClockIn(data, now())) {
    // still resting: say when it can go again
    sfx.nope();
    el.barNote.classList.remove('nudge');
    void el.barNote.offsetWidth;
    el.barNote.classList.add('nudge');
  } else clockIn();
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
  // out of stamina: the session closes by itself and the character goes home
  if (C.settle(data, t)) {
    save();
    if (mode === 'office' && !busy) goHomeTired();
  }
  // the sky, the window views and the room light follow the real clock
  if (world) world.setTime(t);
  // the place's music, and the office or the house going on around the character
  {
    const doing = world && world.active && world.active.routine && world.active.routine.cur;
    sfx.scene(mode === 'ride' || mode === 'office' || mode === 'home' ? mode : null, doing && doing.id, {
      night: !!(world && world.sky && world.sky.dark > 0.5),
      asleep: C.homeSpot(data, t) === 'bed',
      hour: new Date(t).getHours(),
    });
  }
  el.world.style.setProperty('--vignette', mode === 'home' ? (world.ctx.vignette || 0).toFixed(2) : '0');
  const ctx = world.ctx;
  ctx.now = now;
  ctx.todayAcorns = C.today(data, t);
  ctx.spot = C.homeSpot(data, t);
  ctx.sleepWhy = C.sleepReason(data, t);
  ctx.stamina = C.staminaAt(data, t);
  ctx.lunch = isLunch(t);
  const p = data.session && C.progress(data.session.in, t, data.settings);
  ctx.overtime = !!p && p.overtime;
  // to-dos on the whiteboard get ticked off through the scheduled workday
  ctx.todoDone = p ? Math.min(3, Math.floor((p.minutes / C.shiftMinutes(data.settings)) * 3 + 1e-9)) : 0;
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
    const frac = p.frac;
    el.gaugeFill.classList.toggle('reset', frac < lastFrac);
    el.gaugeFill.style.width = `${(frac * 100).toFixed(1)}%`;
    lastFrac = frac;
    setRich(el.gaugeLb, p.overtime ? '1.5배 적립 중 :moon:' : '다음 도토리까지');
    const hp = C.staminaAt(data, t);
    setRich(
      el.barNote,
      hp < 25
        ? `:yawn: 체력이 얼마 안 남았어요 · ${C.clockLeft(C.exhaustAt(data.session, s) - t)} 뒤 집으로`
        : `출근 ${C.hm(data.session.in)} · 근무 ${C.dur(p.minutes)}`
    );
    el.go.removeAttribute('aria-disabled');
    el.go.dataset.kind = 'out';
    setIcon(el.goIc, 'house');
    el.goLb.textContent = '퇴근하기';
    el.nap.hidden = true;
    if (lastToday !== null && today > lastToday) celebrate();
  } else {
    el.sideLb.textContent = '모은 도토리';
    el.sideV.textContent = C.comma(data.bank);
    el.sideV.classList.remove('ot');
    el.gauge.hidden = true;
    const spot = world.ctx.spot;
    const until = C.restUntil(data);
    // to bed and up again: the player's call (not shown once it is in bed for the night anyway)
    const napping = C.sentToBed(data, t);
    el.nap.hidden = !(napping || C.canSleep(data, t));
    el.nap.dataset.kind = napping ? 'wake' : 'sleep';
    setIcon(el.napIc, napping ? 'sun' : 'zzz');
    el.napLb.textContent = napping ? '일어나기' : '잠자기';
    if (t < until) {
      // the 6-hour rest at home
      setRich(el.barNote, `${spot === 'bed' ? '쉿, 자는 중이에요 :moon:' : `${C.REST_HOURS}시간은 푹 쉬어요`} · ${C.hm(until)}부터 출근할 수 있어요`);
      el.go.dataset.kind = 'rest';
      el.go.setAttribute('aria-disabled', 'true');
      setIcon(el.goIc, spot === 'bed' ? 'zzz' : 'sofa');
      el.goLb.textContent = `쉬는 중 · ${C.clockLeft(until - t)}`;
    } else {
      setRich(el.barNote, spot === 'bed' ? '쉿, 자는 중이에요 :moon:' : C.isWorkday(t, s) ? `오늘 출근 시간 ${s.start}` : '오늘은 쉬는 날이에요 :sprout:');
      el.go.removeAttribute('aria-disabled');
      el.go.dataset.kind = 'in';
      setIcon(el.goIc, 'train');
      el.goLb.textContent = '출근하기';
    }
  }
  renderHp(t);
  lastToday = today;
  // the card grows with the acorn gauge: keep the scene clear of it
  const ch = el.gauge.parentElement.offsetHeight;
  if (ch !== lastCardH) {
    lastCardH = ch;
    fitInsets();
  }
}

/** the stamina bar: draining at work (striped in overtime), refilling at home */
function renderHp(t) {
  const hp = C.staminaAt(data, t);
  const max = C.STAMINA.max;
  let trend = 'full';
  let lb = '체력';
  if (data.session) {
    trend = world.ctx.overtime ? 'fast' : 'down';
    if (world.ctx.overtime) lb = '야근 2배 소모';
  } else if (hp < max - 1e-6) {
    trend = 'up';
    lb = world.ctx.spot === 'bed' ? '자면서 회복' : '회복 중';
  }
  const v = data.session ? Math.ceil(hp - 1e-9) : Math.floor(hp + 1e-9);
  el.hp.dataset.level = hp >= 50 ? 'high' : hp >= 20 ? 'mid' : 'low';
  el.hp.dataset.trend = trend;
  // half-percent steps: rewriting the width every tick would keep restarting its transition
  const width = `${(Math.round((hp / max) * 200) / 2).toFixed(1)}%`;
  if (el.hpFill.style.width !== width) el.hpFill.style.width = width;
  el.hpLb.textContent = lb;
  el.hpV.textContent = String(v);
  el.hpBar.setAttribute('aria-valuenow', String(v));
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
    <a class="btn" href="index.html" style="padding:0 26px">${icon('palette')} 캐릭터 만들러 가기</a>
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

  world = new World(el.world, { onStatus: (s) => setRich(el.status, s || '') });
  world.addSet('office', buildOffice(world));
  world.addSet('subway', buildSubway(world));
  world.addSet('home', buildHome(world));
  Object.assign(world.ctx, { name: look.name, rank: look.rank, dept: look.dept, now });
  await world.setLook(look);

  if (C.settle(data, now())) save();
  world.setTime(now());
  tick(true);
  enter(data.session ? 'office' : 'home');
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => !document.hidden && tick());

  el.go.addEventListener('click', onGo);
  el.nap.addEventListener('click', onNap);
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
