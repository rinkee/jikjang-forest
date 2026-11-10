/*
 * 직장의 숲 · 하루 — clock.js (pure day logic: work sessions and acorns)
 *
 * Acorns are paid for time worked, the same for everyone:
 *   1 per minute, 1.5 per minute after the scheduled end time (and all day on a day off),
 *   counted for at most CAP_HOURS from clock-in.
 * A session that was never clocked out is closed for the user once the cap has passed:
 * at the scheduled end time if that came after clock-in, otherwise at the cap.
 *
 * Nothing here touches the DOM or storage, so it runs in node too.
 */

export const RATE = { perMin: 1, overtime: 1.5 };
export const CAP_HOURS = 14;
export const DEFAULT_SETTINGS = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const MIN = 60e3;
const HOUR = 3600e3;

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

/** the moment counting stops for a session (cap) */
export function capOf(inMs) {
  return inMs + CAP_HOURS * HOUR;
}

/**
 * Work done in [inMs, atMs]: { acorns (float), minutes, overtimeMin, capped }.
 */
export function tally(inMs, atMs, settings) {
  const end = Math.min(atMs, capOf(inMs));
  if (!(end > inMs)) return { acorns: 0, minutes: 0, overtimeMin: 0, capped: false };
  const ot = Math.max(inMs, overtimeFrom(inMs, settings));
  const normal = Math.max(0, Math.min(end, ot) - inMs) / MIN;
  const over = Math.max(0, end - ot) / MIN;
  return {
    acorns: normal * RATE.perMin + over * RATE.perMin * RATE.overtime,
    minutes: normal + over,
    overtimeMin: over,
    capped: atMs > end,
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
    capped: t.capped,
    rate: (nowMs >= ot ? RATE.overtime : 1) * RATE.perMin,
  };
}

/** when a forgotten session gets closed for the user */
export function autoOutAt(inMs, settings) {
  const ot = overtimeFrom(inMs, settings);
  return ot > inMs ? Math.min(ot, capOf(inMs)) : capOf(inMs);
}

/* ------------------------------------------------------------------ data */
export function emptyData() {
  return { v: 1, settings: { ...DEFAULT_SETTINGS }, configured: false, session: null, log: [], bank: 0, receipt: null };
}

export function normalize(d) {
  const e = emptyData();
  if (!d || typeof d !== 'object') return e;
  const s = d.settings || {};
  return {
    v: 1,
    settings: {
      start: /^\d{1,2}:\d{2}$/.test(s.start) ? s.start : e.settings.start,
      end: /^\d{1,2}:\d{2}$/.test(s.end) ? s.end : e.settings.end,
      days: Array.isArray(s.days) ? s.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : e.settings.days,
    },
    configured: !!d.configured,
    session: d.session && Number.isFinite(d.session.in) ? { in: d.session.in } : null,
    log: Array.isArray(d.log) ? d.log.filter((r) => r && Number.isFinite(r.in) && Number.isFinite(r.out)).slice(-120) : [],
    bank: Number.isFinite(d.bank) ? Math.max(0, Math.floor(d.bank)) : 0,
    receipt: d.receipt && Number.isFinite(d.receipt.in) ? d.receipt : null,
  };
}

/** start a session (no-op if one is running). Returns the data object. */
export function clockIn(d, nowMs) {
  if (!d.session) d.session = { in: nowMs };
  return d;
}

/** close the running session at outMs; banks the acorns and leaves a receipt to show */
export function clockOut(d, outMs, auto = false) {
  if (!d.session) return d;
  const inMs = d.session.in;
  const out = Math.max(inMs, Math.min(outMs, capOf(inMs)));
  const t = tally(inMs, out, d.settings);
  const acorns = Math.floor(t.acorns + 1e-9);
  const rec = { in: inMs, out, acorns, minutes: Math.round(t.minutes), overtimeMin: Math.round(t.overtimeMin), auto };
  d.log.push(rec);
  if (d.log.length > 120) d.log.splice(0, d.log.length - 120);
  d.bank += acorns;
  d.session = null;
  d.receipt = { ...rec, bank: d.bank };
  return d;
}

/** close a forgotten session if its cap has passed. Returns true if it did. */
export function settle(d, nowMs) {
  if (!d.session) return false;
  if (nowMs < capOf(d.session.in)) return false;
  clockOut(d, autoOutAt(d.session.in, d.settings), true);
  return true;
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
