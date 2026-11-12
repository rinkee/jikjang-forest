/*
 * 직장의 숲 · 캐릭터 공방 — app.js (editor UI around the 3D engine)
 *
 * Debug query params:
 *   ?intro=0          skip the intro screen
 *   ?tab=<key>        initial category tab (hair, eyes, top, ...)
 *   ?modal=card|gallery  open the ID card / gallery modal once ready
 *   ?seed=N           start with a random character from seed N
 *   ?mute=1           no sound (not persisted)
 *   ?test=1           errors -> title "ERR: ..." + red box; title "READY" when ready
 * Keyboard: ←/→ option, [ / ] tab, R random, Ctrl/⌘+Z undo, Shift+Ctrl/⌘+Z redo, Esc closes modals.
 */
import { CC } from './cc.js';
import { Stage, Thumbnailer, FRAMES } from './char3d.js';
import { sfx } from './sfx.js';
import { mascotSVG, Dialogue, LINES, pick, josa } from './mascot.js';

/* ============================================================== constants */
const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const HISTORY_MAX = 50;
const GALLERY_MAX = 30;
const THUMB_SIZE = 184;
const META = CC.META_FIELDS || ['name', 'dept', 'rank'];
const FACE_TABS = new Set(['skin', 'faceShape', 'hair', 'brows', 'eyes', 'nose', 'mouth', 'cheeks', 'glasses']);
const GROUP = {
  skin: 'face', faceShape: 'face', bodyShape: 'wear', hair: 'face', brows: 'face', eyes: 'face', nose: 'face', mouth: 'face', cheeks: 'face',
  top: 'wear', bottom: 'wear', shoes: 'wear', glasses: 'item', hat: 'item', acc: 'item', bg: 'place',
};
const SKIN_NAMES = ['크림', '피치', '허니', '샌드', '캐러멜', '시나몬', '코코아', '에스프레소'];
const DEPT_QUIPS = {
  '도토리 개발팀': '버그 잡는 도토리들이 모인 곳이죠!',
  '버섯 마케팅팀': '아이디어가 비 온 뒤 버섯처럼 쑥쑥 자라요!',
  '꿀벌 인사팀': '오, 저랑 같은 인사 쪽이네요? 반가워요!',
  '나뭇잎 디자인팀': '감각적인 잎사귀들의 아지트예요~',
  '연못 재무팀': '숫자가 연못처럼 맑고 투명한 팀이에요.',
  '숲속 영업팀': '숲 구석구석 누비는 발 빠른 팀이죠!',
  '다람쥐 기획팀': '계획은 다람쥐가 최고! 도토리 숨기듯 꼼꼼하게~',
};
const KEYS = { current: 'ccws-current', gallery: 'ccws-gallery', hint: 'ccws-hint-seen' };
const FONT = (px) => `${px}px Jua, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** after the next frame is drawn (or 60 ms, when the page is hidden and draws none) */
const nextFrame = () =>
  new Promise((r) => {
    const t = setTimeout(r, 60);
    requestAnimationFrame(() => {
      clearTimeout(t);
      setTimeout(r, 0);
    });
  });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const warn = (...a) => console.warn('[공방]', ...a);
const partWarn = (cat, id, err) => console.warn('[공방] part failed:', cat, id, (err && err.message) || err);
const busy = new Set(); // re-entrancy guard for slow render actions (save / png / card)

/* ============================================================== storage (never throws) */
const store = {
  ok: (() => {
    try {
      const k = '__ccws_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })(),
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return def;
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

/* ============================================================== load parts (each isolated) */
for (const f of ['hair', 'face', 'clothes', 'extras']) {
  try {
    await import(`./parts/${f}.js`);
  } catch (e) {
    const msg = String((e && (e.stack || e.message)) || e);
    if (!/Failed to fetch|404|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
      warn(`parts/${f}.js 를 불러오지 못했어요`, e);
    }
  }
}

const TABS = CC.CATEGORIES.filter((c) => c.paletteOnly || (CC.parts[c.key] || []).length > 0);

/* ============================================================== state */
function readHash() {
  const m = location.hash.match(/[#&]c=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
function lookOf(s) {
  const o = Object.assign({}, s);
  META.forEach((k) => delete o[k]);
  return o;
}
function metaOf(s) {
  const o = {};
  META.forEach((k) => (o[k] = s[k] || ''));
  return o;
}
function sameLook(a, b) {
  const A = lookOf(a);
  const B = lookOf(b);
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) if (A[k] !== B[k]) return false;
  return true;
}
const sameMeta = (a, b) => META.every((k) => (a[k] || '') === (b[k] || ''));

let source = 'default';
let state = null;
{
  const code = readHash();
  if (code) {
    const s = CC.decodeState(code);
    if (s) {
      state = s;
      source = 'link';
    }
  }
  if (!state && Q.has('seed')) {
    state = CC.randomState(CC.rng(+Q.get('seed') || 1));
    source = 'seed';
  }
  if (!state) {
    const saved = store.get(KEYS.current, null);
    const s = typeof saved === 'string' ? CC.decodeState(saved) : null;
    if (s) {
      state = s;
      source = 'saved';
    }
  }
  if (!state) state = CC.defaultState();
}
const undoStack = [];
const redoStack = [];

/* ============================================================== DOM refs */
const el = {
  app: $('#app'),
  tabs: $('#tabs'),
  body: $('#editorBody'),
  edIcon: $('#edIcon'),
  edTitle: $('#edTitle'),
  edCount: $('#edCount'),
  palette: $('#palette'),
  grid: $('#grid'),
  gridScroll: $('#gridScroll'),
  stageSlot: $('#stageSlot'),
  stageCard: $('#stageCard'),
  stageMsg: $('#stageMsg'),
  hint: $('#stageHint'),
  sparkles: $('#sparkles'),
  inName: $('#inName'),
  inDept: $('#inDept'),
  inRank: $('#inRank'),
  intro: $('#intro'),
  btnStart: $('#btnStart'),
  toast: $('#toast'),
};

/* ============================================================== engine */
const introOn = Q.get('intro') !== '0' && !!el.intro;
let introOpen = introOn;
const stageHost = document.createElement('div');
stageHost.className = 'stage-host';
(introOn ? $('#introPreview') : el.stageSlot).append(stageHost);

let stage = null;
try {
  stage = new Stage(stageHost);
} catch (e) {
  console.error('[공방] Stage', e);
  showStageMsg('3D 화면을 띄울 수 없어요 🥲<br>WebGL을 지원하는 브라우저에서 열어주세요.');
}
let thumb = null;
try {
  thumb = new Thumbnailer({ shadowSize: 1024 });
} catch (e) {
  warn('Thumbnailer unavailable', e);
}

const S = {
  setState(s) {
    if (!stage) return Promise.resolve();
    return stage.setState(s, { onError: partWarn }).catch((e) => warn('stage.setState', e));
  },
  setFrame(f) {
    if (stage && FRAMES[f]) stage.setFrame(f);
  },
  play(a) {
    if (stage && !REDUCED) stage.play(a);
  },
};
const frameFor = (k) => (FACE_TABS.has(k) ? 'faceZoom' : k === 'hat' ? 'portrait' : 'stage');

function showStageMsg(html) {
  el.stageMsg.innerHTML = html;
  el.stageMsg.hidden = false;
  el.hint.hidden = true;
}

/* ============================================================== dialogue */
const dlgBubble = $('#dlgBubble');
const dlgPortrait = $('#dlgPortrait');
dlgPortrait.innerHTML = mascotSVG({ id: 'mdlg', crop: 'bust' });
$('#brandLogo').innerHTML = mascotSVG({ id: 'mlogo', crop: 'head' });
$('#brandLogo').dataset.mood = 'happy';
const dlg = new Dialogue({
  textEl: $('#dlgText'),
  boxEl: dlgBubble,
  portraitEl: dlgPortrait,
  onBlip: (c) => sfx.blip(c),
  reduced: REDUCED,
});
let lastTip = '';
function say(text, mood) {
  dlg.say(text, { mood: mood || 'normal' });
}
function sayTip() {
  let t = pick(LINES.tips);
  if (t === lastTip) t = pick(LINES.tips);
  lastTip = t;
  say('💡 ' + t, 'normal');
}
dlgBubble.addEventListener('click', () => {
  if (!dlg.done) dlg.finish();
  else {
    sfx.tick();
    sayTip();
  }
});
dlgBubble.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    dlgBubble.click();
  }
});
dlgPortrait.addEventListener('click', () => {
  sfx.pop(1.4);
  say(pick(['저요? 도토리 팀장이에요. 모자는 진짜 도토리 껍질이랍니다!', '넥타이 예쁘죠? 숲 공식 행사용이에요~', '간지러워요~ 히히!']), 'wink');
});

let idleTimer = 0;
function bumpIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(idleTip, 18000);
}
function idleTip() {
  if (!introOpen && !openModalEl && !document.hidden && !document.body.classList.contains('typing') && dlg.done) sayTip();
  idleTimer = setTimeout(idleTip, 26000);
}

/* ============================================================== tabs + editor */
let activeTab = (() => {
  const t = Q.get('tab');
  if (t && TABS.some((c) => c.key === t)) return t;
  return TABS.some((c) => c.key === 'hair') ? 'hair' : TABS[0] ? TABS[0].key : 'skin';
})();

function buildTabs() {
  el.tabs.innerHTML = '';
  el.tabs.style.setProperty('--tabs2', String(Math.max(1, Math.ceil(TABS.length / 2))));
  el.tabs.style.setProperty('--tabs3', String(Math.max(1, Math.ceil(TABS.length / 3))));
  TABS.forEach((cat) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tab g-${GROUP[cat.key] || 'item'}`;
    b.id = 'tab-' + cat.key;
    b.dataset.tab = cat.key;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('aria-controls', 'editorBody');
    b.title = cat.label;
    b.innerHTML = `<span class="tab-ic" aria-hidden="true">${cat.icon || '✨'}</span><span class="tab-lb">${esc(cat.label)}</span>`;
    b.addEventListener('click', () => {
      if (activeTab === cat.key) return;
      sfx.tick();
      setTab(cat.key);
    });
    el.tabs.append(b);
  });
}

function setTab(key) {
  const cat = CC.category(key);
  if (!cat || !TABS.includes(cat)) return;
  activeTab = key;
  $$('.tab', el.tabs).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === key)));
  const tabEl = $(`#tab-${key}`);
  if (tabEl && el.tabs.scrollWidth > el.tabs.clientWidth + 4) {
    const left = tabEl.offsetLeft - el.tabs.clientWidth / 2 + tabEl.offsetWidth / 2;
    el.tabs.scrollTo({ left, behavior: REDUCED ? 'auto' : 'smooth' });
  }
  if (!introOpen) S.setFrame(frameFor(key));
  renderEditor();
}

function optionsFor(cat) {
  if (cat.paletteOnly) return cat.palette.map((c, i) => ({ value: c, name: SKIN_NAMES[i] || `톤 ${i + 1}` }));
  return (CC.parts[cat.key] || []).filter((p) => !p.hidden).map((p) => ({ value: p.id, name: p.name || p.id }));
}
const currentValue = (cat) => (cat.paletteOnly ? state[cat.colorKey] : state[cat.key]);

function renderEditor() {
  const cat = CC.category(activeTab);
  if (!cat) return;
  const opts = optionsFor(cat);
  el.edIcon.textContent = cat.icon || '';
  el.edTitle.textContent = cat.label;
  el.edCount.textContent = cat.paletteOnly ? `${opts.length}가지 톤` : `${opts.length}개`;
  el.body.setAttribute('aria-labelledby', 'tab-' + cat.key);
  el.grid.setAttribute('aria-label', `${cat.label} 고르기`);
  renderPalette(cat);

  el.grid.innerHTML = '';
  if (!opts.length) {
    el.grid.innerHTML = '<div class="grid-empty">아직 준비 중인 항목이에요. 곧 입고될 예정!</div>';
  }
  opts.forEach((o, i) => el.grid.append(makeTile(cat, o, i)));
  el.gridScroll.scrollTop = 0;
  updateSelection(false);
  requestThumbs();
  // keep the selected option visible (desktop panel scroll only)
  const sel = $('.opt[aria-checked="true"]', el.grid);
  if (sel && el.gridScroll.scrollHeight > el.gridScroll.clientHeight + 4) {
    const top = sel.offsetTop - el.grid.offsetTop;
    if (top + sel.offsetHeight > el.gridScroll.clientHeight) el.gridScroll.scrollTop = top - 12;
  }
}

function makeTile(cat, o, i) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'opt loading';
  b.dataset.value = o.value;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', 'false');
  b.title = o.name;
  b.style.setProperty('--n', String(Math.min(i, 24)));
  const isNone = !cat.paletteOnly && o.value === 'none';
  if (isNone) {
    b.dataset.static = '1';
    b.classList.remove('loading');
  }
  b.innerHTML =
    `<span class="opt-thumb"><span class="opt-img">${isNone ? '<span class="opt-none"></span>' : ''}</span>` +
    (cat.paletteOnly ? `<span class="opt-swatch" style="--c:${esc(o.value)}"></span>` : '') +
    `</span><span class="opt-check" aria-hidden="true">✓</span><span class="opt-name">${esc(o.name)}</span>`;
  b.addEventListener('click', () => choose(cat.key, o.value));
  return b;
}

function renderPalette(cat) {
  const p = el.palette;
  p.innerHTML = '';
  // some colours belong to one option only (the plain backdrop's): no palette for the others
  if (cat.paletteOnly || !cat.colorKey || !cat.palette || (cat.colorFor && !cat.colorFor.includes(state[cat.key]))) {
    p.hidden = true;
    return;
  }
  p.hidden = false;
  p.setAttribute('aria-label', `${cat.label} 색상`);
  const lb = document.createElement('span');
  lb.className = 'palette-lb';
  lb.textContent = cat.colorKey === 'hairColor' && cat.key === 'brows' ? '머리색' : '색상';
  p.append(lb);
  cat.palette.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch ' + (CC.color.luminance(c) > 0.8 ? 'light' : 'dark');
    b.dataset.color = c;
    b.style.setProperty('--c', c);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.setAttribute('aria-label', `색상 ${c}`);
    b.title = c;
    b.addEventListener('click', () => chooseColor(cat, c));
    p.append(b);
  });
  if (cat.customColor) {
    // any colour at all: the system colour picker, shown as one more swatch
    const lab = document.createElement('label');
    lab.className = 'swatch swatch-custom light';
    lab.title = '직접 고르기';
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = state[cat.colorKey] || cat.palette[0];
    inp.setAttribute('aria-label', '색 직접 고르기');
    // dragging in the picker previews the colour; letting go records it (one undo step)
    let from = null;
    inp.addEventListener('input', () => {
      if (!from) from = state;
      commit(Object.assign({}, state, { [cat.colorKey]: inp.value }), { reason: 'color', history: false, quiet: true });
    });
    inp.addEventListener('change', () => {
      if (from && !sameLook(from, state)) {
        undoStack.push(from);
        if (undoStack.length > HISTORY_MAX) undoStack.shift();
        redoStack.length = 0;
        updateHistoryButtons();
      }
      from = null;
    });
    lab.append(inp);
    p.append(lab);
  }
}

function updateSelection(animatePick) {
  const cat = CC.category(activeTab);
  if (!cat) return;
  const v = currentValue(cat);
  $$('.opt', el.grid).forEach((t) => {
    const on = t.dataset.value === v;
    if (t.getAttribute('aria-checked') === String(on)) return;
    t.setAttribute('aria-checked', String(on));
    if (on && animatePick && !REDUCED) {
      t.classList.remove('picked');
      void t.offsetWidth;
      t.classList.add('picked');
    }
  });
  if (cat.colorKey && !cat.paletteOnly) {
    // picking another option may bring its colours in, or take them away
    const shown = !cat.colorFor || cat.colorFor.includes(state[cat.key]);
    if (shown === el.palette.hidden) renderPalette(cat);
    const c = state[cat.colorKey];
    const listed = cat.palette.includes(c);
    $$('.swatch', el.palette).forEach((s) => {
      if (!s.classList.contains('swatch-custom')) return s.setAttribute('aria-checked', String(s.dataset.color === c));
      s.setAttribute('aria-checked', String(!listed));
      if (listed) s.style.removeProperty('--c');
      else s.style.setProperty('--c', c);
      const inp = $('input', s);
      if (inp && inp.value !== c && document.activeElement !== inp) inp.value = c;
    });
  }
}

/* ============================================================== thumbnails (progressive, stale-safe) */
const thumbMemo = new Map();
const tq = { gen: 0, jobs: [], running: false, shownSig: null };
let idleWaiters = [];

function thumbSig(cat, s) {
  if (cat.kind === 'face') {
    const ctxFaces = cat.thumbContext ? CC.FACE_CATS.filter((k) => k !== cat.key).map((k) => s[k]) : [];
    return [s.skin, s.hairColor, s.eyeColor, cat.colorKey ? s[cat.colorKey] : '', ...ctxFaces].join('|');
  }
  if (cat.kind === 'bg') return [s.skin, s.hairColor, s.eyeColor, s.bgColor].join('|');
  const o = lookOf(s);
  delete o.bg;
  delete o.v;
  if (cat.paletteOnly) delete o[cat.colorKey];
  else delete o[cat.key];
  if (cat.key === 'hair' || cat.key === 'skin' || cat.key === 'faceShape') {
    delete o.hat;
    delete o.hatColor;
  }
  if (cat.key === 'top' || cat.key === 'bottom') {
    delete o.acc;
    delete o.accColor;
  }
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function instantThumb(cat, value, snap) {
  try {
    if (cat.kind === 'face') {
      const s = Object.assign({}, snap, { [cat.key]: value });
      return { type: 'svg', svg: CC.faceThumb(s, cat.key, value, { onError: partWarn }) };
    }
    if (cat.kind === 'bg') {
      const s = Object.assign({}, snap, { bg: value });
      return { type: 'svg', svg: CC.backdropSVG(s, { par: 'xMidYMid slice', onError: partWarn }) || '' };
    }
  } catch (e) {
    partWarn(cat.key, value, e);
  }
  return null;
}

function requestThumbs() {
  const cat = CC.category(activeTab);
  if (!cat) return;
  const sig = thumbSig(cat, state);
  tq.shownSig = cat.key + '#' + sig;
  const gen = ++tq.gen;
  const snap = Object.assign({}, state);
  tq.jobs = [];
  $$('.opt', el.grid).forEach((tile) => {
    if (tile.dataset.static) return;
    const value = tile.dataset.value;
    const key = `${cat.key}|${value}|${sig}`;
    const memo = thumbMemo.get(key);
    if (memo) {
      applyThumb(tile, memo);
      return;
    }
    if (cat.kind === 'face' || cat.kind === 'bg') {
      const r = instantThumb(cat, value, snap);
      if (r) {
        remember(key, r);
        applyThumb(tile, r);
      } else markThumbError(tile);
      return;
    }
    tile.classList.add('loading');
    tq.jobs.push({ gen, cat, value, key, tile, snap });
  });
  pumpThumbs();
}

function maybeRefreshThumbs() {
  const cat = CC.category(activeTab);
  if (cat && cat.key + '#' + thumbSig(cat, state) !== tq.shownSig) requestThumbs();
}

function remember(key, r) {
  thumbMemo.set(key, r);
  if (thumbMemo.size > 520) thumbMemo.delete(thumbMemo.keys().next().value);
}

async function pumpThumbs() {
  if (tq.running) return;
  if (!thumb) {
    tq.jobs.forEach((j) => markThumbError(j.tile));
    tq.jobs = [];
    flushIdle();
    return;
  }
  tq.running = true;
  try {
    while (tq.jobs.length) {
      const job = tq.jobs.shift();
      if (job.gen !== tq.gen) continue;
      let r = null;
      try {
        r = await thumb.option(job.snap, job.cat.key, job.value, { size: THUMB_SIZE, onError: partWarn });
      } catch (e) {
        partWarn(job.cat.key, job.value, e);
      }
      if (r) remember(job.key, r);
      if (job.gen === tq.gen && job.tile.isConnected) {
        if (r) applyThumb(job.tile, r);
        else markThumbError(job.tile);
      }
      await nextFrame(); // one thumbnail a frame: the live stage keeps moving in between
    }
  } finally {
    tq.running = false;
  }
  flushIdle();
}

function flushIdle() {
  if (tq.running || tq.jobs.length) return;
  const w = idleWaiters;
  idleWaiters = [];
  w.forEach((f) => f());
}
const whenThumbsIdle = () =>
  new Promise((r) => {
    if (!tq.running && !tq.jobs.length) r();
    else idleWaiters.push(r);
  });

function applyThumb(tile, r) {
  const holder = $('.opt-img', tile);
  if (!holder) return;
  if (r.type === 'svg') {
    holder.innerHTML = r.svg || '<span class="opt-none"></span>';
  } else {
    let img = $('img', holder);
    if (!img) {
      holder.innerHTML = '';
      img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      holder.append(img);
    }
    if (img.getAttribute('src') !== r.src) img.src = r.src;
    tile.classList.add('has-img');
  }
  tile.classList.remove('loading', 'opt-error');
}
function markThumbError(tile) {
  tile.classList.remove('loading');
  tile.classList.add('opt-error');
}

/* ============================================================== change pipeline */
let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEYS.current, CC.encodeState(state)), 350);
}

function clearStaleHash() {
  const code = readHash();
  if (code && code !== CC.encodeState(state)) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      /* ignore */
    }
  }
}

/** commit a new state. o.reason: part|color|random|undo|redo|reset|load|link|api. o.history=false skips the undo stack */
function commit(next, o) {
  o = o || {};
  next = Object.assign({}, next);
  const prev = state;
  const lookChanged = !sameLook(prev, next);
  if (!lookChanged && sameMeta(prev, next)) return false;
  if (lookChanged && o.history !== false) {
    undoStack.push(prev);
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack.length = 0;
  }
  state = next;
  if (lookChanged) {
    if (!introOpen) S.setState(state);
    if (!o.quiet) sparkle();
    clearStaleHash();
  }
  syncPlate();
  updateSelection(o.reason === 'part' || o.reason === 'color');
  maybeRefreshThumbs();
  updateHistoryButtons();
  autosave();
  bumpIdle();
  return true;
}

function choose(catKey, value) {
  const cat = CC.category(catKey);
  const key = cat.paletteOnly ? cat.colorKey : catKey;
  if (state[key] === value) {
    sfx.tick();
    return;
  }
  commit(Object.assign({}, state, { [key]: value }), { reason: 'part' });
  sfx.pop(cat.paletteOnly ? 1.15 : 1);
  if (!cat.paletteOnly && value === 'none') say(pick(LINES.none), 'wink');
  else say(pick(LINES.cat[catKey] || LINES.color), Math.random() < 0.5 ? 'happy' : 'wow');
}

function chooseColor(cat, c) {
  if (state[cat.colorKey] === c) {
    sfx.tick();
    return;
  }
  commit(Object.assign({}, state, { [cat.colorKey]: c }), { reason: 'color' });
  sfx.pop(1.3);
  if (Math.random() < 0.7) say(pick(LINES.color), 'happy');
}

function cycle(dir) {
  const cat = CC.category(activeTab);
  const opts = optionsFor(cat);
  if (!opts.length) return;
  let i = opts.findIndex((o) => o.value === currentValue(cat));
  i = (i + dir + opts.length) % opts.length;
  choose(cat.key, opts[i].value);
  const tile = $$('.opt', el.grid).find((t) => t.dataset.value === opts[i].value);
  if (tile) tile.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
}

function tabStep(dir) {
  const i = TABS.findIndex((c) => c.key === activeTab);
  const next = TABS[(i + dir + TABS.length) % TABS.length];
  if (!next) return;
  sfx.tick();
  setTab(next.key);
}

function shake(btn) {
  if (!btn || REDUCED) return;
  btn.classList.remove('shake');
  void btn.offsetWidth;
  btn.classList.add('shake');
  setTimeout(() => btn.classList.remove('shake'), 600);
}

function randomize() {
  sfx.dice();
  $$('[data-act="random"]').forEach(shake);
  let next = CC.randomState(Math.random, state);
  for (let i = 0; i < 3 && sameLook(next, state); i++) next = CC.randomState(Math.random, state);
  commit(next, { reason: 'random' });
  S.play('hop');
  say(pick(LINES.random), 'wow');
}

function undo() {
  if (!undoStack.length) {
    sfx.nope();
    say(pick(LINES.noUndo), 'normal');
    return;
  }
  redoStack.push(state);
  const prev = undoStack.pop();
  commit(Object.assign({}, prev, metaOf(state)), { reason: 'undo', history: false });
  sfx.tick();
  say(pick(LINES.undo), 'wink');
}

function redo() {
  if (!redoStack.length) {
    sfx.nope();
    say(pick(LINES.noRedo), 'normal');
    return;
  }
  undoStack.push(state);
  const next = redoStack.pop();
  commit(Object.assign({}, next, metaOf(state)), { reason: 'redo', history: false });
  sfx.tick();
  say(pick(LINES.redo), 'happy');
}

function resetLook() {
  const next = Object.assign(CC.defaultState(), metaOf(state));
  if (sameLook(next, state)) {
    sfx.tick();
    say('이미 처음 모습 그대로예요!', 'wink');
    return;
  }
  commit(next, { reason: 'reset' });
  sfx.pop(0.8);
  say(pick(LINES.reset), 'happy');
}

function updateHistoryButtons() {
  $$('[data-act="undo"]').forEach((b) => (b.disabled = !undoStack.length));
  $$('[data-act="redo"]').forEach((b) => (b.disabled = !redoStack.length));
}

/* ============================================================== sparkles */
const SPARK_COLORS = ['#f6d04d', '#ffffff', '#f7b2c0', '#8fdcc0', '#9fd8f5', '#ffe27a', '#b9e59b'];
function sparkle() {
  if (REDUCED || introOpen) return;
  const layer = el.sparkles;
  while (layer.childElementCount > 70) layer.firstElementChild.remove();
  const f = stage ? stage.frame : 'stage';
  const x = 50;
  const y = f === 'faceZoom' ? 46 : f === 'portrait' ? 42 : 48;
  const ring = document.createElement('i');
  ring.className = 'stage-ring';
  ring.style.cssText = `--x:${x}%;--y:${y}%`;
  layer.append(ring);
  setTimeout(() => ring.remove(), 700);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const kind = i % 5 === 0 ? 'heart' : i % 2 ? 'star' : 'dot';
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = 80 + Math.random() * 120;
    const size = kind === 'heart' ? 14 : kind === 'dot' ? 7 + Math.random() * 6 : 14 + Math.random() * 12;
    s.className = 'spk ' + kind;
    s.style.cssText =
      `--x:${x}%;--y:${y}%;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d * 0.8 - 18).toFixed(1)}px;` +
      `--r:${Math.round(Math.random() * 360 - 180)}deg;--s:${size.toFixed(1)}px;--c:${pick(SPARK_COLORS)};--d:${Math.round(Math.random() * 90)}ms`;
    layer.append(s);
    setTimeout(() => s.remove(), 1200);
  }
}

/* ============================================================== name plate */
function ensureOption(select, value) {
  if (!value) return;
  if (!Array.from(select.options).some((o) => o.value === value)) {
    const o = document.createElement('option');
    o.textContent = value;
    select.append(o);
  }
}
function syncPlate() {
  if (document.activeElement !== el.inName) el.inName.value = state.name || '';
  ensureOption(el.inDept, state.dept);
  ensureOption(el.inRank, state.rank);
  el.inDept.value = state.dept || '';
  el.inRank.value = state.rank || '';
}
function setMeta(k, v) {
  state = Object.assign({}, state, { [k]: v });
  autosave();
  bumpIdle();
}
el.inName.addEventListener('input', () => setMeta('name', el.inName.value.slice(0, 12)));
el.inName.addEventListener('change', () => {
  const n = el.inName.value.trim().slice(0, 12);
  el.inName.value = n;
  setMeta('name', n);
  if (n) {
    sfx.pop(1.2);
    say(`${n} 사원님, 반가워요! 이름표 잘 어울려요~`, 'happy');
  }
});
el.inName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') el.inName.blur();
});
el.inDept.addEventListener('change', () => {
  const d = el.inDept.value;
  setMeta('dept', d);
  if (d) {
    sfx.pop(1.1);
    say(`${josa(d, '으로', '로')} 발령! ${DEPT_QUIPS[d] || '멋진 팀이에요!'}`, 'wow');
  }
});
el.inRank.addEventListener('change', () => {
  const r = el.inRank.value;
  setMeta('rank', r);
  if (!r) return;
  sfx.pop(1.1);
  if (r === '숲장') say('숲장님?! 제 상사시잖아요… 앞으로 잘 부탁드립니다! (꾸벅)', 'wow');
  else if (r === '인턴') say('인턴으로 시작! 모두 처음은 있는 법이죠. 제가 잘 챙겨줄게요~', 'happy');
  else say(`${josa(r, '으로', '로')} 임명! 축하해요~ 오늘 회식은 사원님이 쏘는 걸로?`, 'happy');
});
$('#plate').addEventListener('focusin', () => document.body.classList.add('typing'));
$('#plate').addEventListener('focusout', () => setTimeout(() => {
  if (!$('#plate').contains(document.activeElement)) document.body.classList.remove('typing');
}, 0));

/* ============================================================== toast + downloads */
let toastTimer = 0;
function toast(html, ms) {
  const t = el.toast;
  t.innerHTML = html;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms || 2400);
}

// keep the toast open while someone is selecting the fallback link inside it
el.toast.addEventListener('focusin', () => clearTimeout(toastTimer));
el.toast.addEventListener('focusout', () => {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 3000);
});

function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24) || '신입';
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    const go = (url, revoke) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve(true);
    };
    try {
      if (canvas.toBlob) canvas.toBlob((b) => (b ? go(URL.createObjectURL(b), true) : go(canvas.toDataURL('image/png'))), 'image/png');
      else go(canvas.toDataURL('image/png'));
    } catch (e) {
      warn('download failed', e);
      resolve(false);
    }
  });
}

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([document.fonts.ready, document.fonts.load(FONT(40), '직장의 숲')]),
      sleep(1500),
    ]);
  } catch (e) {
    /* fallback fonts are fine */
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

function setBusy(btn, on) {
  if (!btn) return;
  btn.classList.toggle('busy', !!on);
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
}

/* soft studio gradient behind renders without a backdrop part */
function paintStudio(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#cbeefc');
  grd.addColorStop(0.62, '#eef9ea');
  grd.addColorStop(1, '#dcefc9');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(159, 214, 140, 0.55)';
  g.beginPath();
  g.ellipse(w / 2, h * 0.93, w * 0.62, h * 0.1, 0, 0, Math.PI * 2);
  g.fill();
}

async function renderWithBackdrop(s, o) {
  const hasBg = !!CC.backdropSVG(s);
  const c = await thumb.render(s, Object.assign({}, o, { output: 'canvas', background: hasBg ? true : false, onError: partWarn }));
  if (hasBg) return c;
  const out = document.createElement('canvas');
  out.width = c.width;
  out.height = c.height;
  const g = out.getContext('2d');
  paintStudio(g, out.width, out.height);
  g.drawImage(c, 0, 0);
  return out;
}

/* ============================================================== PNG / share / sound */
async function savePNG(btn) {
  if (!thumb || busy.has('png')) return;
  busy.add('png');
  setBusy(btn, true);
  try {
    const W = 900;
    const H = 1200;
    const c = await renderWithBackdrop(state, { frame: 'full', width: W, height: H });
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const g = out.getContext('2d');
    g.drawImage(c, 0, 0);
    await fontsReady();
    // caption tag
    const name = state.name || '이름 없는 신입';
    const sub = [state.dept, state.rank].filter(Boolean).join(' · ') || '직장의 숲 · 캐릭터 공방';
    g.font = FONT(44);
    const tw = Math.max(g.measureText(name).width, (g.font = FONT(26), g.measureText(sub).width));
    const bw = tw + 80;
    const bx = (W - bw) / 2;
    const by = H - 150;
    g.fillStyle = 'rgba(122, 82, 50, 0.9)';
    roundRect(g, bx, by + 8, bw, 112, 30);
    g.fill();
    g.fillStyle = '#fffaf0';
    roundRect(g, bx, by, bw, 112, 30);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#4a3323';
    g.font = FONT(44);
    g.fillText(name, W / 2, by + 56);
    g.fillStyle = '#3f8f4f';
    g.font = FONT(26);
    g.fillText(sub, W / 2, by + 94);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(74, 51, 35, 0.45)';
    g.font = FONT(20);
    g.fillText('직장의 숲 · 캐릭터 공방', W - 24, 36);
    await downloadCanvas(out, `직장의숲_${safeName(state.name)}.png`);
    S.play('wave');
    sfx.jingle();
    say(pick(LINES.png), 'wink');
  } catch (e) {
    warn('png failed', e);
    sfx.nope();
    say('앗, 사진 저장에 실패했어요. 다시 한 번 눌러줄래요?', 'normal');
  } finally {
    busy.delete('png');
    setBusy(btn, false);
  }
}

async function shareLink() {
  const code = CC.encodeState(state);
  const url = location.origin + location.pathname + '#c=' + code;
  try {
    history.replaceState(null, '', location.pathname + location.search + '#c=' + code);
  } catch (e) {
    location.hash = 'c=' + code;
  }
  const ok = await copyText(url);
  if (ok) {
    sfx.twinkle();
    toast('🔗 공유 링크를 복사했어요!');
    say(pick(LINES.share), 'wink');
  } else {
    sfx.pop(0.9);
    toast(`🔗 아래 링크를 복사해 주세요<input type="text" readonly value="${esc(url)}" aria-label="공유 링크">`, 9000);
    const inp = $('input', el.toast);
    if (inp) {
      inp.addEventListener('focus', () => inp.select());
      setTimeout(() => {
        inp.focus();
        inp.select();
      }, 50);
    }
    say(pick(LINES.shareManual), 'normal');
  }
}

window.addEventListener('hashchange', () => {
  const code = readHash();
  if (!code || code === CC.encodeState(state)) return;
  const s = CC.decodeState(code);
  if (!s) return;
  commit(s, { reason: 'link' });
  S.play('wave');
  say(pick(LINES.fromLink), 'wow');
});

function updateSoundBtn() {
  $$('[data-act="sound"]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!sfx.muted));
    const ic = $('.ic', b);
    if (ic) ic.textContent = sfx.muted ? '🔇' : '🔊';
    b.title = sfx.muted ? '소리 켜기' : '소리 끄기';
  });
}
function toggleSound() {
  sfx.unlock();
  const muted = sfx.toggle();
  updateSoundBtn();
  if (!muted) sfx.pop(1.2);
  say(pick(muted ? LINES.sound.off : LINES.sound.on), muted ? 'wink' : 'happy');
}

/* ============================================================== gallery (도감) */
let galleryMem = null; // in-memory fallback when storage is blocked / full
function loadGallery() {
  if (galleryMem) return galleryMem;
  const g = store.get(KEYS.gallery, []);
  return Array.isArray(g) ? g.filter((it) => it && typeof it.code === 'string') : [];
}
function saveGallery(list) {
  if (store.set(KEYS.gallery, list)) {
    galleryMem = null;
    return true;
  }
  galleryMem = list;
  return false;
}
function updateGalleryBadge() {
  const n = loadGallery().length;
  const b = $('#galleryCount');
  b.textContent = String(n);
  b.hidden = n === 0;
}

async function saveToGallery() {
  if (busy.has('save') || !thumb) return;
  const snap = Object.assign({}, state);
  const code = CC.encodeState(snap);
  const before = loadGallery();
  if (!before.some((it) => it.code === code) && before.length >= GALLERY_MAX) {
    sfx.nope();
    say(pick(LINES.galleryFull), 'normal');
    openGallery();
    return;
  }
  busy.add('save');
  $$('[data-act="save"], #galSaveNow').forEach((b) => setBusy(b, true));
  try {
    const c = await renderWithBackdrop(snap, { frame: 'portrait', width: 168, height: 168 });
    let img;
    try {
      img = c.toDataURL('image/jpeg', 0.86);
    } catch (e) {
      img = '';
    }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: snap.name || '',
      dept: snap.dept || '',
      rank: snap.rank || '',
      code,
      img,
      t: Date.now(),
    };
    const list = loadGallery(); // re-read: the gallery may have changed while rendering
    const dup = list.findIndex((it) => it.code === code);
    if (dup >= 0) list.splice(dup, 1);
    list.unshift(entry);
    const persisted = saveGallery(list.slice(0, GALLERY_MAX));
    updateGalleryBadge();
    S.play('wave');
    sfx.jingle();
    say(pick(dup >= 0 ? LINES.savedAgain : LINES.saved), 'wow');
    toast(persisted ? '💾 도감에 저장했어요!' : '💾 저장했어요 (이번 방문 동안만 보관돼요)');
    if (openModalEl && openModalEl.id === 'galleryModal') renderGallery();
  } catch (e) {
    warn('save failed', e);
    sfx.nope();
    say('앗, 저장에 실패했어요. 잠시 후 다시 해볼까요?', 'normal');
  } finally {
    busy.delete('save');
    $$('[data-act="save"], #galSaveNow').forEach((b) => setBusy(b, false));
  }
}

function fmtDate(t) {
  const d = new Date(t || Date.now());
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function renderGallery() {
  const list = loadGallery();
  const grid = $('#galGrid');
  $('#galCount').textContent = `${list.length} / ${GALLERY_MAX}`;
  $('#galEmpty').hidden = list.length > 0;
  grid.hidden = list.length === 0;
  const note = $('#galNote');
  if (!store.ok || galleryMem) {
    note.hidden = false;
    note.textContent = '브라우저 저장소를 쓸 수 없어서, 도감은 이번 방문 동안만 보관돼요.';
  } else note.hidden = true;
  grid.innerHTML = '';
  list.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'gal-item';
    card.style.setProperty('--n', String(Math.min(i, 20)));
    const meta = [it.dept, it.rank].filter(Boolean).join(' · ') || fmtDate(it.t);
    card.innerHTML =
      `<button type="button" class="gal-load" title="불러오기">` +
      (it.img ? `<img src="${esc(it.img)}" alt="">` : `<img alt="">`) +
      `<span class="gal-name">${esc(it.name || '이름 없는 신입')}</span><span class="gal-meta">${esc(meta)}</span></button>` +
      `<button type="button" class="gal-del" aria-label="${esc(it.name || '캐릭터')} 삭제">✕</button>`;
    $('.gal-load', card).addEventListener('click', () => loadEntry(it));
    const del = $('.gal-del', card);
    let armT = 0;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!del.classList.contains('confirm')) {
        sfx.tick();
        del.classList.add('confirm');
        del.textContent = '삭제할까요?';
        clearTimeout(armT);
        armT = setTimeout(() => {
          del.classList.remove('confirm');
          del.textContent = '✕';
        }, 2600);
        return;
      }
      clearTimeout(armT);
      saveGallery(loadGallery().filter((x) => x.id !== it.id));
      sfx.pop(0.7);
      say(pick(LINES.deleted), 'wink');
      updateGalleryBadge();
      renderGallery();
    });
    grid.append(card);
  });
}

function loadEntry(it) {
  const s = CC.decodeState(it.code);
  if (!s) {
    sfx.nope();
    say('앗, 이 캐릭터는 불러올 수 없어요. 파일이 낡았나 봐요.', 'normal');
    return;
  }
  commit(s, { reason: 'load' });
  closeModal();
  sfx.pop(1.1);
  S.play('wave');
  say(pick(LINES.loaded), 'happy');
}

function openGallery() {
  renderGallery();
  openModal('galleryModal');
}

/* ============================================================== modals */
let openModalEl = null;
let lastFocus = null;
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  if (openModalEl && openModalEl !== m) closeModal(true);
  lastFocus = document.activeElement;
  m.hidden = false;
  void m.offsetWidth;
  m.classList.add('open');
  openModalEl = m;
  sfx.whoosh();
  const f = $('.modal-x', m);
  if (f) f.focus({ preventScroll: true });
}
function closeModal(silent) {
  const m = openModalEl;
  if (!m) return;
  m.classList.remove('open');
  openModalEl = null;
  setTimeout(() => {
    if (!m.classList.contains('open')) m.hidden = true;
  }, REDUCED ? 0 : 280);
  if (!silent) sfx.tick();
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') && openModalEl) closeModal();
});
function trapFocus(e) {
  if (!openModalEl || e.key !== 'Tab') return;
  const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', openModalEl).filter(
    (x) => !x.disabled && x.offsetParent !== null && !x.closest('.modal-backdrop')
  );
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ============================================================== employee ID card */
const DEFAULT_NAME = '이름 없는 신입';
let cardGen = 0;
let cardPhoto = null; // canvas
let cardReady = Promise.resolve();
$('#cardLogo').innerHTML = mascotSVG({ id: 'mcard', crop: 'head' });
$('#cardLogo').dataset.mood = 'happy';

function employeeNo(s) {
  const h = CC.hash(CC.encodeState(s));
  const a = String(h % 10000).padStart(4, '0');
  const b = String(Math.floor(h / 10000) % 10000).padStart(4, '0');
  return `${a}-${b}`;
}
function barcodeBars(s) {
  const rng = CC.rng(CC.hash('bar' + CC.encodeState(s)));
  const bars = [];
  for (let i = 0; i < 30; i++) bars.push({ w: 1 + Math.floor(rng() * 3), gap: 1 + Math.floor(rng() * 2) });
  return bars;
}
function cardInfo() {
  return {
    name: state.name || DEFAULT_NAME,
    dept: state.dept || '발령 대기',
    rank: state.rank || '신입',
    no: employeeNo(state),
    date: fmtDate(Date.now()),
    bars: barcodeBars(state),
  };
}

function openCard() {
  const info = cardInfo();
  $('#cardName').textContent = info.name;
  $('#cardDept').textContent = info.dept;
  $('#cardRank').textContent = info.rank;
  $('#cardNo').textContent = info.no;
  $('#cardDate').textContent = info.date;
  const bc = $('#cardBarcode');
  bc.innerHTML = info.bars.map((b) => `<i style="width:${(b.w * 0.34).toFixed(2)}cqw;margin-right:${(b.gap * 0.3).toFixed(2)}cqw"></i>`).join('');
  const box = $('#cardPhotoBox');
  const img = $('#cardPhoto');
  const stamp = $('#cardStamp');
  const card = $('#idcard');
  box.classList.add('loading');
  stamp.classList.remove('on');
  card.classList.remove('thud');
  img.removeAttribute('src');
  cardPhoto = null;
  openModal('cardModal');
  S.play('wave');
  const gen = ++cardGen;
  const snap = Object.assign({}, state);
  cardReady = (async () => {
    try {
      if (thumb) cardPhoto = await renderWithBackdrop(snap, { frame: 'portrait', width: 300, height: 360 });
    } catch (e) {
      warn('card photo failed', e);
    }
    if (gen !== cardGen) return;
    if (cardPhoto) img.src = cardPhoto.toDataURL('image/png');
    box.classList.remove('loading');
    await sleep(REDUCED ? 0 : 260);
    if (gen !== cardGen || !openModalEl || openModalEl.id !== 'cardModal') return;
    stamp.classList.add('on');
    sfx.stamp();
    if (!REDUCED) {
      void card.offsetWidth;
      card.classList.add('thud');
    }
    setTimeout(() => sfx.jingle(), 240);
    say(pick(LINES.card), 'wow');
  })();
  return cardReady;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function fitText(g, text, maxW, px, minPx) {
  let size = px;
  g.font = FONT(size);
  while (g.measureText(text).width > maxW && size > minPx) {
    size -= 2;
    g.font = FONT(size);
  }
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

async function exportCard(btn) {
  if (busy.has('card')) return;
  busy.add('card');
  setBusy(btn, true);
  try {
    await cardReady;
    const info = cardInfo();
    const u = 10.8; // 1cqw at 1080px card width
    const M = 30; // outer margin for the border ring + shadow
    const CW = 1080;
    const CH = 675;
    const cv = document.createElement('canvas');
    cv.width = CW + M * 2;
    cv.height = CH + M * 2 + 18;
    const g = cv.getContext('2d');
    await fontsReady();
    const R = 6 * u;
    // ring + base shadow
    g.fillStyle = '#d4bc8c';
    roundRect(g, M - 1.6 * u, M - 1.6 * u + 2.4 * u, CW + 3.2 * u, CH + 3.2 * u, R + 1.6 * u);
    g.fill();
    g.fillStyle = '#e6d3ab';
    roundRect(g, M - 1.6 * u, M - 1.6 * u, CW + 3.2 * u, CH + 3.2 * u, R + 1.6 * u);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(g, M - u, M - u, CW + 2 * u, CH + 2 * u, R + u);
    g.fill();
    // card body
    g.save();
    roundRect(g, M, M, CW, CH, R);
    g.clip();
    let grd = g.createLinearGradient(0, M, 0, M + CH);
    grd.addColorStop(0, '#fffefa');
    grd.addColorStop(1, '#fff7e6');
    g.fillStyle = grd;
    g.fillRect(M, M, CW, CH);
    g.fillStyle = 'rgba(91, 179, 106, 0.12)';
    g.beginPath();
    g.arc(M + CW * 0.92, M + CH * 0.88, 18 * u, 0, Math.PI * 2);
    g.fill();
    // header band
    const HH = CH * 0.2;
    grd = g.createLinearGradient(0, M, 0, M + HH);
    grd.addColorStop(0, '#66c076');
    grd.addColorStop(1, '#3f8f4f');
    g.fillStyle = grd;
    g.fillRect(M, M, CW, HH);
    g.restore();
    // lanyard hole
    g.fillStyle = '#2f6e3c';
    roundRect(g, M + CW / 2 - 6.5 * u, M + 2 * u, 13 * u, 2.6 * u, 2 * u);
    g.fill();
    // logo
    const lx = M + 5 * u;
    const ly = M + 2.2 * u + (HH - 2.2 * u) / 2 - 4.5 * u;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(lx + 4.5 * u, ly + 4.5 * u, 4.5 * u, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f3fbe9';
    g.beginPath();
    g.arc(lx + 4.5 * u, ly + 4.5 * u, 3.8 * u, 0, Math.PI * 2);
    g.fill();
    try {
      const logo = await CC.rasterize(mascotSVG({ id: 'mexp', crop: 'head', mood: 'happy' }), Math.round(7.6 * u), Math.round(7.6 * u));
      g.save();
      g.beginPath();
      g.arc(lx + 4.5 * u, ly + 4.5 * u, 3.8 * u, 0, Math.PI * 2);
      g.clip();
      g.drawImage(logo, lx + 0.7 * u, ly + 0.7 * u);
      g.restore();
    } catch (e) {
      /* logo is optional */
    }
    const midY = ly + 4.5 * u;
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.font = FONT(4.2 * u);
    g.fillText('직장의 숲 주식회사', lx + 11 * u, midY + 0.4 * u);
    g.fillStyle = '#ffffff';
    g.fillText('직장의 숲 주식회사', lx + 11 * u, midY);
    g.textAlign = 'right';
    g.font = `800 ${2.4 * u}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('E M P L O Y E E   I D', M + CW - 5 * u, midY);
    g.textAlign = 'left';
    // photo
    const px = M + 5 * u;
    const py = M + HH + 4.4 * u;
    const pw = 29 * u;
    const ph = pw * 1.2;
    g.fillStyle = '#e6d3ab';
    roundRect(g, px - 1.4 * u, py - 1.4 * u, pw + 2.8 * u, ph + 2.8 * u, 5.4 * u);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(g, px - 0.9 * u, py - 0.9 * u, pw + 1.8 * u, ph + 1.8 * u, 4.9 * u);
    g.fill();
    g.save();
    roundRect(g, px, py, pw, ph, 4 * u);
    g.clip();
    if (cardPhoto) g.drawImage(cardPhoto, px, py, pw, ph);
    else paintStudio(g, pw, ph);
    g.restore();
    // info
    const ix = px + pw + 5 * u;
    const iw = M + CW - 5 * u - ix;
    let iy = py + 0.6 * u;
    g.textBaseline = 'top';
    g.fillStyle = '#4a3323';
    const nm = fitText(g, info.name, iw, 7.4 * u, 4 * u);
    g.fillText(nm, ix, iy);
    iy += 7.4 * u * 1.1 + 1.6 * u;
    g.strokeStyle = '#e6d3ab';
    g.lineWidth = 0.6 * u;
    g.setLineDash([1.6 * u, 1.2 * u]);
    g.beginPath();
    g.moveTo(ix, iy);
    g.lineTo(ix + iw, iy);
    g.stroke();
    g.setLineDash([]);
    iy += 2.6 * u;
    const rows = [
      ['부서', info.dept],
      ['직급', info.rank],
      ['사번', info.no],
      ['발급일', info.date],
    ];
    g.font = FONT(3.5 * u);
    const labW = Math.max(...rows.map((r) => g.measureText(r[0]).width));
    rows.forEach(([k, v]) => {
      g.font = FONT(3.5 * u);
      g.fillStyle = '#a68b70';
      g.fillText(k, ix, iy);
      g.fillStyle = '#4a3323';
      g.fillText(fitText(g, v, iw - labW - 3 * u, 3.5 * u, 2.4 * u), ix + labW + 3 * u, iy);
      iy += 3.5 * u * 1.4 + 1.3 * u;
    });
    // barcode (under the info column)
    let bx = M + 39 * u;
    const bh = 6.4 * u;
    const by = M + CH - 3.6 * u - bh;
    g.fillStyle = '#3b2416';
    info.bars.forEach((b) => {
      const w = b.w * 0.34 * u;
      roundRect(g, bx, by, w, bh, 0.2 * u);
      g.fill();
      bx += w + b.gap * 0.3 * u;
    });
    // motto under the photo
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = FONT(2.6 * u);
    g.fillStyle = '#3f8f4f';
    g.fillText('오늘도 숲처럼 푸르게 🌿', M + 19.5 * u, M + CH - 3.3 * u - 0.5 * u);
    g.textAlign = 'left';
    // stamp (lower right)
    const sr = 9.5 * u;
    const sx = M + CW - 5.5 * u - sr;
    const sy = M + CH - 10.5 * u - sr;
    g.save();
    g.translate(sx, sy);
    g.rotate((-14 * Math.PI) / 180);
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = 'rgba(229, 88, 79, 0.88)';
    g.lineWidth = u;
    g.beginPath();
    g.arc(0, 0, sr - 0.5 * u, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.6 * u;
    g.beginPath();
    g.arc(0, 0, sr - 2.2 * u, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(229, 88, 79, 0.92)';
    g.font = FONT(4.3 * u);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('발급', 0, -2.4 * u);
    g.fillText('완료', 0, 2.6 * u);
    g.restore();
    await downloadCanvas(cv, `직장의숲_사원증_${safeName(state.name)}.png`);
    sfx.jingle();
    toast('🪪 사원증 이미지를 저장했어요!');
    say('사원증 이미지 저장 완료! 프로필에 걸어두면 딱이에요~', 'happy');
  } catch (e) {
    warn('card export failed', e);
    sfx.nope();
    say('앗, 사원증 저장에 실패했어요. 다시 해볼까요?', 'normal');
  } finally {
    busy.delete('card');
    setBusy(btn, false);
  }
}

/* ============================================================== toolbar + global input */
function act(name, btn) {
  switch (name) {
    case 'random':
      return randomize();
    case 'undo':
      return undo();
    case 'redo':
      return redo();
    case 'reset':
      return resetLook();
    case 'save':
      return saveToGallery(btn);
    case 'gallery':
      sfx.tick();
      return openGallery();
    case 'png':
      return savePNG(btn);
    case 'share':
      return shareLink();
    case 'sound':
      return toggleSound();
    default:
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) act(b.dataset.act, b);
  const a = e.target.closest('[data-anim]');
  if (a) {
    sfx.pop(a.dataset.anim === 'spin' ? 0.8 : 1.2);
    S.play(a.dataset.anim);
  }
});
$('#btnCard').addEventListener('click', () => {
  sfx.pop(1.1);
  openCard();
});
$('#cardSave').addEventListener('click', (e) => exportCard(e.currentTarget));
$('#galSaveNow').addEventListener('click', (e) => saveToGallery(e.currentTarget));
$('#btnPrev').addEventListener('click', () => cycle(-1));
$('#btnNext').addEventListener('click', () => cycle(1));

// audio unlock on the first gesture anywhere
const unlockOnce = () => sfx.unlock();
document.addEventListener('pointerdown', unlockOnce, { capture: true });
document.addEventListener('keydown', unlockOnce, { capture: true });

document.addEventListener('keydown', (e) => {
  trapFocus(e);
  const t = e.target;
  const typing = t && t.closest && t.closest('input, select, textarea, [contenteditable="true"]');
  if (introOpen) {
    if ((e.key === 'Enter' || e.key === ' ') && !typing && !el.btnStart.disabled) {
      e.preventDefault();
      startGame();
    }
    return;
  }
  if (openModalEl) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
    return;
  }
  if (typing || e.isComposing) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.code === 'KeyY') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod || e.altKey) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    cycle(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    cycle(1);
  } else if (e.code === 'BracketLeft' || e.key === '[') {
    e.preventDefault();
    tabStep(-1);
  } else if (e.code === 'BracketRight' || e.key === ']') {
    e.preventDefault();
    tabStep(1);
  } else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    randomize();
  }
});

/* drag hint */
let hintSeen = !!store.get(KEYS.hint, false);
if (hintSeen) el.hint.classList.add('gone');
if (stage) {
  stage.canvas.addEventListener('pointerdown', () => {
    if (hintSeen || introOpen) return;
    hintSeen = true;
    store.set(KEYS.hint, true);
    el.hint.classList.add('gone');
  });
}

/* ============================================================== intro */
let introTimer = 0;
const introFixed = source !== 'default';

function setupIntro() {
  $('#introMascot').innerHTML = mascotSVG({ id: 'mintro', prop: 'clipboard' });
  const leaves = $('#introLeaves');
  if (!REDUCED) {
    const cols = ['#7cc46f', '#5bb36a', '#f6d04d', '#e8975a', '#9fd68c'];
    for (let i = 0; i < 12; i++) {
      const f = document.createElement('span');
      f.className = 'fleaf';
      f.style.cssText = `--x:${Math.round(Math.random() * 100)}%;--s:${12 + Math.round(Math.random() * 14)}px;--c:${pick(cols)};--t:${(9 + Math.random() * 9).toFixed(1)}s;--d:${(-Math.random() * 18).toFixed(1)}s`;
      leaves.append(f);
    }
  }
  const chip = $('#introChip');
  const bubble = $('#introBubble');
  const foot = $('.intro-foot');
  if (foot && sfx.muted) foot.textContent = 'Enter 키로도 시작할 수 있어요 · 소리는 꺼져 있어요 🔇';
  if (source === 'link') {
    chip.textContent = '💌 친구가 보낸 캐릭터';
    bubble.innerHTML = '친구가 보낸 동료가 기다려요!<br>입사해서 인사해볼까요?';
  } else if (source === 'saved') {
    chip.textContent = '🌰 지난번 내 모습';
    bubble.innerHTML = '다시 왔군요, 사원님!<br>오늘도 힘차게 출근해봐요~';
  } else if (source === 'seed') {
    chip.textContent = '🎲 오늘의 신입';
  }
}

async function introCycle() {
  if (!introOpen) return;
  const s = introFixed ? state : CC.randomState(Math.random);
  await S.setState(s);
  if (!introOpen) return;
  S.play('wave');
  introTimer = setTimeout(introCycle, introFixed ? 4600 : 3900);
}

function startGame() {
  if (!introOpen) return;
  introOpen = false;
  clearTimeout(introTimer);
  sfx.unlock();
  sfx.whoosh();
  setTimeout(() => sfx.jingle(), 260);
  const intro = el.intro;
  intro.classList.add('leaving');
  const finish = () => {
    el.stageSlot.append(stageHost);
    S.setState(state).then(() => {
      S.setFrame(frameFor(activeTab));
      S.play('wave');
    });
    intro.hidden = true;
    greet();
    bumpIdle();
    const t = $(`#tab-${activeTab}`);
    if (t) t.focus({ preventScroll: true });
  };
  setTimeout(finish, REDUCED ? 0 : 680);
}
el.btnStart.addEventListener('click', () => startGame());

function greet() {
  if (source === 'link') say(pick(LINES.fromLink), 'wow');
  else if (source === 'saved') say(pick(LINES.welcomeBack), 'happy');
  else say(pick(LINES.greet), 'happy');
}

/* ============================================================== boot */
async function boot() {
  if (Q.get('mute') === '1') sfx.forceMute();
  sfx.bgm.play('workshop'); // starts with the first click or key (sound needs a gesture)
  updateSoundBtn();
  buildTabs();
  syncPlate();
  updateHistoryButtons();
  updateGalleryBadge();
  $('#galEmptyMascot').innerHTML = mascotSVG({ id: 'mgal' });

  if (introOn) {
    setupIntro();
    el.intro.hidden = false;
  } else {
    el.intro.hidden = true;
  }
  setTab(activeTab); // renders the grid + requests thumbnails

  if (introOn) {
    await Promise.race([introCycle(), sleep(8000)]);
  } else {
    await S.setState(state);
    S.setFrame(frameFor(activeTab));
    greet();
    bumpIdle();
  }

  window.app = {
    get state() {
      return Object.assign({}, state);
    },
    setState: (patch, o) => commit(Object.assign({}, state, patch || {}), Object.assign({ reason: 'api' }, o)),
    stage,
    thumb,
    setTab,
    randomize,
    undo,
    redo,
    openCard,
    openGallery,
    startGame,
  };
  document.body.dataset.ready = '1';
  document.title = '직장의 숲 · 캐릭터 공방';
  el.btnStart.disabled = false;
  $('.btn-start-lb', el.btnStart).textContent = '입사하기';
  if (introOn) el.btnStart.focus({ preventScroll: true });

  const modal = Q.get('modal');
  let modalDone = Promise.resolve();
  if (!introOn && modal === 'card') modalDone = openCard();
  else if (!introOn && modal === 'gallery') openGallery();

  if (TEST) {
    await Promise.race([Promise.all([whenThumbsIdle(), modalDone]), sleep(45000)]);
    await sleep(500);
    const errs = (window.__cc && window.__cc.errors) || [];
    if (!errs.length) document.title = 'READY';
  }
}

boot().catch((e) => {
  console.error('[공방] boot failed', e);
  if (window.__cc && window.__cc.report) window.__cc.report('boot: ' + ((e && e.message) || e));
  showStageMsg('앗, 공방 문을 여는 데 문제가 생겼어요. 새로고침해 주세요 🙏');
});
