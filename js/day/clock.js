/*
 * 직장의 숲 · 하루 — clock.js (pure day logic: work sessions, acorns and stamina)
 *
 * Acorns are paid for time worked, the same for everyone:
 *   1 per minute, 1.5 per minute after the scheduled end time (and all day on a day off).
 *
 * Stamina (0..100) keeps the character from working without end:
 *   work      -6 per hour, twice as fast in overtime (a 9-hour day uses about half)
 *   home      +6 per hour awake, +12 per hour asleep
 * When it runs out the session closes by itself and the character goes home (settle).
 * After any clock-out the character stays home for at least REST_HOURS. It goes straight
 * to bed for those hours when it came home exhausted, or after overtime late at night or
 * in the morning.
 *
 * Nothing here touches the DOM or storage, so it runs in node too.
 */

export const RATE = { perMin: 1, overtime: 1.5 };
export const STAMINA = { max: 100, work: 6, overtime: 2, awake: 6, asleep: 12 };
export const REST_HOURS = 6;
export const DEFAULT_SETTINGS = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const MIN = 60e3;
const HOUR = 3600e3;
const clampS = (s) => Math.max(0, Math.min(STAMINA.max, s));

/** 'HH:MM' -> minutes after midnight (bad input -> fallback) */
export function parseHM(s, fallback = 0) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return fallback;
  const h = +m[1];
  const mm = +m[2];
  if (h > 23 || mm > 59) return fallback;
  return h * 60 + mm;
}

/** local midnight of the day that contains ms */
function midnight(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** local time ms on the day of `dayMs` at `minutes` after midnight (DST-safe) */
function atMinutes(dayMs, minutes) {
  const d = new Date(dayMs);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.getTime();
}

export function isWorkday(ms, settings) {
  return (settings.days || DEFAULT_SETTINGS.days).includes(new Date(ms).getDay());
}

/**
 * When overtime begins for a session that started at inMs: the scheduled end on the
 * clock-in day (the next day for a shift that ends after midnight). On a day off it is
 * the clock-in itself, so the whole session counts as overtime.
 */
export function overtimeFrom(inMs, settings) {
  if (!isWorkday(inMs, settings)) return inMs;
  const start = parseHM(settings.start, 540);
  const end = parseHM(settings.end, 1080);
  let t = atMinutes(inMs, end);
  if (end <= start) {
    // overnight shift: clocking in late in the evening ends tomorrow morning
    const startToday = atMinutes(inMs, start);
    if (inMs >= startToday - 3 * HOUR) t = atMinutes(midnight(inMs) + 26 * HOUR, end);
  }
  return t;
}

/**
 * Work done in [inMs, atMs]: { acorns (float), minutes, overtimeMin }.
 */
export function tally(inMs, atMs, settings) {
  const end = atMs;
  if (!(end > inMs)) return { acorns: 0, minutes: 0, overtimeMin: 0 };
  const ot = Math.max(inMs, overtimeFrom(inMs, settings));
  const normal = Math.max(0, Math.min(end, ot) - inMs) / MIN;
  const over = Math.max(0, end - ot) / MIN;
  return {
    acorns: normal * RATE.perMin + over * RATE.perMin * RATE.overtime,
    minutes: normal + over,
    overtimeMin: over,
  };
}

/** progress of the session for the HUD */
export function progress(inMs, nowMs, settings) {
  const t = tally(inMs, nowMs, settings);
  const ot = overtimeFrom(inMs, settings);
  return {
    acorns: Math.floor(t.acorns + 1e-9),
    frac: t.acorns - Math.floor(t.acorns + 1e-9),
    minutes: t.minutes,
    overtimeMin: t.overtimeMin,
    overtime: nowMs >= ot,
    toEndMs: Math.max(0, ot - nowMs),
    rate: (nowMs >= ot ? RATE.overtime : 1) * RATE.perMin,
  };
}

/** length of the scheduled workday in minutes (overnight shifts wrap past midnight) */
export function shiftMinutes(settings) {
  const s = parseHM(settings.start, 540);
  const e = parseHM(settings.end, 1080);
  return e > s ? e - s : e + 1440 - s;
}

/* ------------------------------------------------------------------ stamina */
/** stamina left at atMs of a session ({ in, s0 }: s0 = stamina at clock-in) */
export function workStamina(sess, atMs, settings) {
  const W = STAMINA.work;
  const end = Math.max(sess.in, atMs);
  const ot = Math.max(sess.in, overtimeFrom(sess.in, settings));
  const normalH = Math.max(0, Math.min(end, ot) - sess.in) / HOUR;
  const overH = Math.max(0, end - ot) / HOUR;
  return clampS(sess.s0 - normalH * W - overH * W * STAMINA.overtime);
}

/** the moment a session's stamina runs out */
export function exhaustAt(sess, settings) {
  const W = STAMINA.work;
  const ot = Math.max(sess.in, overtimeFrom(sess.in, settings));
  const normalUse = ((ot - sess.in) / HOUR) * W;
  if (sess.s0 <= normalUse) return sess.in + (sess.s0 / W) * HOUR;
  return ot + ((sess.s0 - normalUse) / (W * STAMINA.overtime)) * HOUR;
}

/** is the character asleep at t while home ({ from, sleepUntil })? */
function asleepAt(h, t) {
  return (h.sleepUntil > h.from && t >= h.from && t < h.sleepUntil) || homeSpotAt(t) === 'bed';
}

/** stamina at atMs while home since h.from (h.s0 = stamina on arrival) */
export function homeStamina(h, atMs) {
  let s = h.s0;
  let t = h.from;
  // walk hour by hour (bedtime changes on the hour); it is full again within a day
  for (let i = 0; i < 60 && t < atMs && s < STAMINA.max; i++) {
    const d = new Date(t);
    d.setMinutes(60, 0, 0);
    let next = Math.min(d.getTime(), atMs);
    if (h.sleepUntil > t && h.sleepUntil < next) next = h.sleepUntil;
    s += ((next - t) / HOUR) * (asleepAt(h, t) ? STAMINA.asleep : STAMINA.awake);
    t = next;
  }
  return clampS(s);
}

/** current stamina (0..100) */
export function staminaAt(d, nowMs) {
  if (d.session) return workStamina(d.session, nowMs, d.settings);
  if (d.home) return homeStamina(d.home, nowMs);
  return STAMINA.max;
}

/** the earliest time the character can leave home again (0 = any time) */
export function restUntil(d) {
  return d.home ? d.home.from + REST_HOURS * HOUR : 0;
}

export function canClockIn(d, nowMs) {
  return !d.session && nowMs >= restUntil(d);
}

/** late at night or in the morning: coming home from overtime then means going to bed */
function lateHour(ms) {
  const h = new Date(ms).getHours();
  return h >= 22 || h < 12;
}

/* ------------------------------------------------------------------ data */
export function emptyData() {
  return { v: 2, settings: { ...DEFAULT_SETTINGS }, configured: false, session: null, home: null, log: [], bank: 0, receipt: null };
}

export function normalize(d) {
  const e = emptyData();
  if (!d || typeof d !== 'object') return e;
  const s = d.settings || {};
  const num = (v, def) => (Number.isFinite(v) ? v : def);
  const h = d.home;
  return {
    v: 2,
    settings: {
      start: /^\d{1,2}:\d{2}$/.test(s.start) ? s.start : e.settings.start,
      end: /^\d{1,2}:\d{2}$/.test(s.end) ? s.end : e.settings.end,
      days: Array.isArray(s.days) ? s.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : e.settings.days,
    },
    configured: !!d.configured,
    session: d.session && Number.isFinite(d.session.in) ? { in: d.session.in, s0: clampS(num(d.session.s0, STAMINA.max)) } : null,
    home:
      h && Number.isFinite(h.from)
        ? { from: h.from, s0: clampS(num(h.s0, STAMINA.max)), sleepUntil: num(h.sleepUntil, 0), sleep: h.sleep === 'tired' || h.sleep === 'late' ? h.sleep : null }
        : null,
    log: Array.isArray(d.log) ? d.log.filter((r) => r && Number.isFinite(r.in) && Number.isFinite(r.out)).slice(-120) : [],
    bank: Number.isFinite(d.bank) ? Math.max(0, Math.floor(d.bank)) : 0,
    receipt: d.receipt && Number.isFinite(d.receipt.in) ? d.receipt : null,
  };
}

/** start a session with the stamina the character has now (no-op if one is running or it must still rest) */
export function clockIn(d, nowMs) {
  if (canClockIn(d, nowMs)) d.session = { in: nowMs, s0: staminaAt(d, nowMs) };
  return d;
}

/**
 * Close the running session at outMs (never later than its stamina lasts); banks the acorns,
 * sends the character home to rest and leaves a receipt to show.
 */
export function clockOut(d, outMs) {
  if (!d.session) return d;
  const sess = d.session;
  const ex = exhaustAt(sess, d.settings);
  const out = Math.max(sess.in, Math.min(outMs, ex));
  const t = tally(sess.in, out, d.settings);
  const acorns = Math.floor(t.acorns + 1e-9);
  const left = workStamina(sess, out, d.settings);
  const tired = out >= ex - 1000;
  const overtimeMin = Math.round(t.overtimeMin);
  const sleep = tired ? 'tired' : overtimeMin > 0 && lateHour(out) ? 'late' : null;
  const rec = { in: sess.in, out, acorns, minutes: Math.round(t.minutes), overtimeMin, tired, stamina: Math.round(left) };
  d.log.push(rec);
  if (d.log.length > 120) d.log.splice(0, d.log.length - 120);
  d.bank += acorns;
  d.session = null;
  d.home = { from: out, s0: left, sleepUntil: sleep ? out + REST_HOURS * HOUR : 0, sleep };
  d.receipt = { ...rec, bank: d.bank, sleep, restUntil: restUntil(d) };
  return d;
}

/** send the character home once its stamina has run out. Returns true if it did. */
export function settle(d, nowMs) {
  if (!d.session) return false;
  const ex = exhaustAt(d.session, d.settings);
  if (nowMs < ex) return false;
  clockOut(d, ex);
  return true;
}

/** where the character is at home: in bed while catching up on sleep, otherwise by the hour */
export function homeSpot(d, nowMs) {
  const h = d.home;
  if (h && h.sleepUntil && nowMs >= h.from && nowMs < h.sleepUntil) return 'bed';
  return homeSpotAt(nowMs);
}

/** why it is in bed right now: 'tired' | 'late' (after overtime) | null (just bedtime) */
export function sleepReason(d, nowMs) {
  const h = d.home;
  return h && h.sleep && nowMs >= h.from && nowMs < h.sleepUntil ? h.sleep : null;
}

/** acorns banked today (local day of nowMs) including the running session */
export function today(d, nowMs) {
  const m0 = midnight(nowMs);
  let n = 0;
  d.log.forEach((r) => {
    if (r.out >= m0) n += r.acorns;
  });
  if (d.session) n += progress(d.session.in, nowMs, d.settings).acorns;
  return n;
}

/* ------------------------------------------------------------------ time of day */
/** 'morning' | 'day' | 'dusk' | 'night' from the local clock */
export function moodAt(ms) {
  const d = new Date(ms);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 19.5) return 'dusk';
  return 'night';
}

/** what the character does at home at this hour */
export function homeSpotAt(ms) {
  const h = new Date(ms).getHours();
  if (h >= 23 || h < 5) return 'bed';
  if (h < 11) return 'ready';
  return 'table';
}

/* ------------------------------------------------------------------ formatting */
export const pad2 = (n) => String(n).padStart(2, '0');
export function hm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function dur(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
export function clockLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(ss)}` : `${m}:${pad2(ss)}`;
}
export const comma = (n) => Math.floor(n).toLocaleString('ko-KR');
