// Sound audit: renders every office / home sound (and a few of the app's own) offline, one
// after another, and reports for each: peak level, RMS, how long it sounds, and whether the
// output ever went bad (NaN). Independent of timers and of whether the page is visible.
//   in the console of any page of the site:  await (await import('/dev/sound-audit.js')).audit()
export async function audit(only) {
  const SLOT = 5; // seconds given to each sound
  const RealAC = window.AudioContext;
  let ctx = null;
  let fakeNow = 0;
  // the sound kit asks for an AudioContext: hand it an offline one that says it is running
  window.AudioContext = function () {
    ctx = new OfflineAudioContext(1, 48000 * SLOT * 40, 48000);
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    Object.defineProperty(ctx, 'currentTime', { get: () => fakeNow });
    ctx.resume = () => Promise.resolve();
    return ctx;
  };
  const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  const names = [];
  try {
    const { sfx } = await import('/js/sfx.js?audit=' + Date.now());
    sfx.bgm.stop();
    sfx.setVolume(0.7);
    sfx.setMuted(false);
    sfx.unlock();
    const list = [
      ...sfx.office.SOUNDS.map((n) => ['office', n]),
      ...sfx.home.SOUNDS.map((n) => ['home', n]),
      ['', 'pop'],
    ].filter(([, n]) => !only || only.includes(n));
    list.forEach(([kit, name], i) => {
      fakeNow = i * SLOT + 0.05;
      if (kit) sfx[kit].play(name);
      else sfx[name]();
      names.push(name);
    });
    sfx.forceMute();
  } finally {
    window.AudioContext = RealAC;
    if (hidden) Object.defineProperty(document, 'hidden', hidden);
    else delete document.hidden;
  }
  const buf = (await ctx.startRendering()).getChannelData(0);
  const out = {};
  names.forEach((name, i) => {
    const a = i * SLOT * 48000;
    let peak = 0;
    let sum = 0;
    let bad = false;
    let first = -1;
    let last = -1;
    for (let k = 0; k < SLOT * 48000; k++) {
      const x = buf[a + k];
      if (x !== x || !Number.isFinite(x)) bad = true;
      const m = Math.abs(x);
      if (m > peak) peak = m;
      sum += x * x;
      if (m > 0.0015) {
        if (first < 0) first = k;
        last = k;
      }
    }
    // how quickly it starts: the level 10 ms in, as a share of the peak (1 = starts at full: a click or a pop)
    let early = 0;
    if (first >= 0) for (let k = first; k < first + 480; k++) early = Math.max(early, Math.abs(buf[a + k]));
    out[name] = {
      peak: +peak.toFixed(3),
      rms: +Math.sqrt(sum / (SLOT * 48000)).toFixed(4),
      seconds: first < 0 ? 0 : +((last - first) / 48000).toFixed(2),
      onset: peak ? +(early / peak).toFixed(2) : 0,
      ...(bad ? { bad: true } : {}),
    };
  });
  return out;
}
