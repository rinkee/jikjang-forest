/*
 * 직장의 숲 · 하루 — world.js (one renderer, the character, and the scene sets around it)
 *
 * A set is { group, frame(aspect, ctx), enter(ctx), update(dt, t, ctx), sky?(s) }.
 * The time of day comes from setTime(ms) (the real clock): it lights the room and repaints
 * the views out of the windows (world.painter), then hands the sky state (sky.js) to the set.
 * frame() returns { target: [x, y, z], w, h, elev } — the world width/height that must stay
 * on screen; the camera backs off until both fit, and eases when the frame changes.
 * Sets get their frame from world.view(key), which reads the camera tuning (js/tuning.js):
 * the shared angle and distance, or the scene's own `elev` / `height` when it has them (the
 * subway's side view).
 */
import * as THREE from 'three';
import { Character, makeScene, makeRenderer, setShadeDim } from '../char3d.js';
import { TUNING } from '../tuning.js';
import { skyAt, sunTimes, SkyPainter } from './sky.js';

const DEG = Math.PI / 180;
/** what the character changes into at home: the basic pyjamas (sky blue check), bare feet */
const HOME_WEAR = { top: 'pajama', topColor: '#9cd3f0', bottom: 'pajama', bottomColor: '#9cd3f0', shoes: 'none' };

/* ============================================================== vignette
 * The edges of the picture, darkened (and, if asked, softened) by a layer of the page over the
 * canvas: tuning.vignette = { on, strength, size, blur } (js/tuning.js; the studio edits it live
 * and calls world.applyVignette()). The dark part is one gradient and costs nothing to speak of;
 * the blur makes the browser blur what is under it on every frame, so it is dropped first on a
 * device that cannot keep up (World._watchPace).
 */
const VIGNETTE_CSS = '.world-vignette{position:absolute;inset:0;pointer-events:none}.world-vignette i{position:absolute;inset:0}';
function vignetteLayer() {
  if (!document.getElementById('world-vignette-css')) {
    const st = document.createElement('style');
    st.id = 'world-vignette-css';
    st.textContent = VIGNETTE_CSS;
    document.head.append(st);
  }
  const el = document.createElement('div');
  el.className = 'world-vignette';
  el.innerHTML = '<i></i><i></i>'; // blur under, shade over
  return el;
}

export class World {
  constructor(container, o) {
    o = o || {};
    this.container = container;
    this.onStatus = o.onStatus || (() => {});
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world-canvas';
    container.append(this.canvas);
    this.renderer = makeRenderer(this.canvas);
    // sharpness: starts at the screen's own (2 at most) and steps down if frames run late (_pace)
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    // the shadow maps are redrawn about 30 times a second, not on every frame (_loop)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this._shadowAge = 0;
    this._shadowN = 0;
    this._pace = { t: 0, n: 0, hold: 2 };
    const s = makeScene(this.renderer, { shadowSize: 2048 });
    this.scene = s.scene;
    s.ground.visible = false;
    s.blob.visible = false;
    this.lights = s.lights;
    // the wide view shows whole rooms: let the shadow-casting lights cover them
    Object.assign(this.lights.key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -5, far: 40 });
    this.lights.key.shadow.camera.updateProjectionMatrix();
    Object.assign(this.lights.sky.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, far: 30 });
    this.lights.sky.shadow.camera.updateProjectionMatrix();
    // the soft light from above only darkens what sits under something else (a blurred,
    // slow-changing shade): its shadow map is redrawn on every third turn, ten times a second
    this.lights.sky.shadow.autoUpdate = false;
    this.lights.sky.shadow.needsUpdate = true;
    this.keyBase = this.lights.key.position.clone();
    this.skyBase = this.lights.sky.position.clone();
    // a high, pulled-back view of a little room (the character is about a third of the visible height)
    this.tuning = o.tuning || TUNING; // the studio swaps in its own live copy
    this.container = container;
    this.vignette = null;
    this._noBlur = false; // set when the device could not keep up with it
    this.applyVignette();
    this.camera = new THREE.PerspectiveCamera(this.tuning.camera.fov, 1, 0.5, 300);

    // the character is about a third of the screen's height: it needs far fewer triangles
    // than in the workshop's close-ups (and it is drawn three times, shadows included)
    // (its shoes and trousers are a few pixels each: coarser still)
    this.character = new Character({ detail: o.detail || 0.5, partDetail: { shoes: 0.55, bottom: 0.8 } });
    this.holder = new THREE.Group();
    this.holder.add(this.character.root);
    this.scene.add(this.holder);

    this.sets = {};
    this.active = null;
    this.activeName = null;
    this.mood = 'day';
    this.painter = new SkyPainter();
    this.timeMs = Date.now();
    this.sky = null;
    this.ctx = {}; // shared info for sets (now, today acorns, ...)
    this._cam = null; // eased frame
    this._status = '';
    this.insets = { top: 0, bottom: 0 }; // px covered by UI; the frame centres in what is left

    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(container);
    this._resize();
    this.clock = new THREE.Clock();
    this.t = 0;
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  addSet(name, set) {
    set.group.visible = false;
    this.scene.add(set.group);
    this.sets[name] = set;
  }

  /** load a look. Things carried in the hands are left out: the scenes use the hands. */
  async setLook(state) {
    this.look = state;
    await this.character.setState(state, { animate: false });
    if (this.character.held.L || this.character.held.R) {
      this.look = Object.assign({}, state, { acc: 'none' });
      await this.character.setState(this.look, { animate: false });
    }
  }

  /** the look as worn in a set: pyjamas and bare feet at home */
  _dress(name) {
    if (!this.look) return;
    const want = name === 'home' ? Object.assign({}, this.look, HOME_WEAR) : this.look;
    const cur = this.character.state;
    if (cur && Object.keys(HOME_WEAR).every((k) => cur[k] === want[k])) return;
    this.character.setState(want, { animate: false }).catch((e) => console.warn("[하루] dress", e));
  }

  status(text) {
    if (text === this._status) return;
    this._status = text;
    this.onStatus(text);
  }

  /** switch to a set; resets the character's placement and pose */
  show(name, ctx) {
    const set = this.sets[name];
    if (!set) return;
    Object.values(this.sets).forEach((s) => (s.group.visible = s === set));
    this.active = set;
    this.activeName = name;
    this.holder.position.set(0, 0, 0);
    this.holder.rotation.set(0, 0, 0);
    this.character.pose = null;
    this.character.anim.yaw = 0;
    this._dress(name);
    Object.assign(this.ctx, ctx || {});
    set.enter(this.ctx, this);
    this.setTime(this.timeMs); // relights for the new set and hands it the sky
    this._cam = null; // jump, don't ease, into a new set
    this.renderer.shadowMap.needsUpdate = true;
    this.lights.sky.shadow.needsUpdate = true;
    this._pace.hold = 2; // the first frames of a set compile its shaders: don't count them
  }

  /** the time of day (ms since epoch, local clock): sky, window views, room light */
  setTime(ms) {
    this.timeMs = ms;
    setShadeDim(1); // a set may deepen the shade for its own night lighting (sky())
    const s = skyAt(ms);
    this.sky = s;
    this.mood = s.mood;
    const L = s.light;
    const { hemi, key, fill, rim } = this.lights;
    hemi.color.setHex(L.hemi[0]);
    hemi.groundColor.setHex(L.hemi[1]);
    hemi.intensity = L.hemi[2];
    key.color.setHex(L.key[0]);
    key.intensity = L.key[1];
    fill.intensity = L.fill;
    rim.intensity = L.rim;
    this.scene.environmentIntensity = L.env;
    this.painter.paint(s, this.t);
    if (this.active && this.active.sky) this.active.sky(s);
  }

  /** a typical moment of today for 'morning' | 'day' | 'dusk' | 'night' (dev pages) */
  setMood(m) {
    const d = new Date(this.timeMs);
    const st = sunTimes(d.getTime());
    const at = (h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(h), Math.round((h % 1) * 60)).getTime();
    const t = { morning: (st.rise || at(7)) + 50 * 60e3, day: at(13), dusk: (st.set || at(18)) + 4 * 60e3, night: at(22) }[m];
    if (t) this.setTime(t);
  }

  /** move the shadow-casting lights so their shadow box follows the action */
  lightAt(x, z = 0) {
    const { key, sky } = this.lights;
    key.position.copy(this.keyBase).add(new THREE.Vector3(x, 0, z));
    key.target.position.set(x, 1.6, z);
    sky.position.copy(this.skyBase).add(new THREE.Vector3(x, 0, z));
    sky.target.position.set(x, 1.6, z);
    key.target.updateMatrixWorld();
    sky.target.updateMatrixWorld();
  }

  /**
   * How much higher the character must sit than with the original proportions so its thighs
   * stay on the same seat (0 with the original legs). Scenes add it to their seated height.
   */
  seatShift() {
    const lr = this.character.legRig;
    return 0.82 - (lr.L.pivot.y + lr.R.pivot.y) / 2;
  }

  /** shoulder height above the holder (for hand targets on desks and tables) */
  shoulderY() {
    return this.character.armR.position.y;
  }

  /** world position of a hand (centre), for props held in the hand */
  handWorld(side, out) {
    const ch = this.character;
    const rig = ch.rig[side];
    out = out || new THREE.Vector3();
    out.copy(rig.g.position).add(rig.pos);
    ch.body.updateWorldMatrix(true, false);
    return ch.body.localToWorld(out);
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.needsUpdate = true;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** show the vignette as the tuning says (call again after changing tuning.vignette) */
  applyVignette() {
    const v = this.tuning.vignette || {};
    const blur = this._noBlur ? 0 : +v.blur || 0;
    const strength = +v.strength || 0;
    if (!v.on || (strength <= 0 && blur <= 0)) {
      if (this.vignette) this.vignette.hidden = true;
      return;
    }
    if (!this.vignette) {
      this.vignette = vignetteLayer();
      this.container.append(this.vignette);
    }
    this.vignette.hidden = false;
    const [soft, shade] = this.vignette.children;
    const from = `${Math.round(Math.min(0.98, Math.max(0, +v.size || 0)) * 100)}%`;
    const shape = 'ellipse farthest-corner at 50% 52%';
    shade.style.background = `radial-gradient(${shape}, rgba(46,26,14,0) ${from}, rgba(46,26,14,${strength.toFixed(3)}) 100%)`;
    soft.hidden = blur <= 0;
    if (blur > 0) {
      const mask = `radial-gradient(${shape}, transparent ${from}, #000 100%)`;
      soft.style.backdropFilter = soft.style.webkitBackdropFilter = `blur(${blur}px)`;
      soft.style.maskImage = soft.style.webkitMaskImage = mask;
    }
  }

  /** the camera frame for a scene key (office, home_table, subway_in, ...) from the tuning */
  view(key, aspect) {
    const T = this.tuning;
    const s = (T.scenes && T.scenes[key]) || { target: [0, 1.6, 0] };
    const h = s.height ?? T.camera.height; // a scene may keep its own distance and angle
    const tall = aspect < 0.8;
    return { target: s.target, w: h * (tall ? 0.82 : 1.58), h, elev: s.elev ?? T.camera.elev };
  }

  /** pixels of the screen covered by UI at the top and bottom */
  setInsets(top, bottom) {
    this.insets = { top: Math.max(0, top || 0), bottom: Math.max(0, bottom || 0) };
  }

  _frame(dt) {
    if (!this.active) return;
    const aspect = this.camera.aspect;
    const f = this.active.frame(aspect, this.ctx);
    const want = { x: f.target[0], y: f.target[1], z: f.target[2], w: f.w, h: f.h, elev: f.elev ?? 8, top: this.insets.top, bottom: this.insets.bottom };
    if (!this._cam) this._cam = Object.assign({}, want);
    else {
      const k = Math.min(1, dt * 2.2);
      Object.keys(want).forEach((key) => (this._cam[key] += (want[key] - this._cam[key]) * k));
    }
    const c = this._cam;
    if (this.camera.fov !== this.tuning.camera.fov) {
      this.camera.fov = this.tuning.camera.fov;
      this.camera.updateProjectionMatrix();
    }
    const fov = this.camera.fov * DEG;
    const vh = Math.tan(fov / 2);
    const { w: W, h: H } = this.size;
    const band = Math.max(0.35, (H - c.top - c.bottom) / H); // share of the height left for the scene
    const dist = Math.max(c.h / 2 / (vh * band), c.w / 2 / (vh * aspect));
    // shift the picture so the target sits in the middle of the uncovered band
    this.camera.setViewOffset(W, H, 0, -(c.top - c.bottom) / 2, W, H);
    const e = c.elev * DEG;
    this.camera.position.set(c.x, c.y + Math.sin(e) * dist, c.z + Math.cos(e) * dist);
    this.camera.lookAt(c.x, c.y, c.z);
  }

  /**
   * Frames that keep arriving late (under about 45 a second for a second and a half) mean the
   * screen has more pixels than this device can fill: render a step less sharp, down to 1.
   */
  _watchPace(raw) {
    const p = this._pace;
    if (p.hold > 0 || raw > 0.25) {
      p.hold = Math.max(0, p.hold - raw); // a new set, or back from another tab
      p.t = p.n = 0;
      return;
    }
    p.t += raw;
    p.n++;
    if (p.t < 1.5) return;
    const late = p.t / p.n > 1 / 45;
    p.t = p.n = 0;
    if (!late) return;
    const vg = this.tuning.vignette;
    if (vg && vg.on && vg.blur > 0 && !this._noBlur) {
      // the first thing to go on a slow device: the blurred edges
      this._noBlur = true;
      this.applyVignette();
      p.hold = 0.5;
      return;
    }
    if (this.pixelRatio <= 1) return;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    p.hold = 0.5;
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden) {
      this.clock.getDelta();
      return;
    }
    const raw = this.clock.getDelta();
    this._watchPace(raw);
    const dt = Math.min(0.05, raw);
    this.t += dt;
    this._shadowAge += dt;
    if (this._shadowAge >= 0.03) {
      this._shadowAge = 0;
      this.renderer.shadowMap.needsUpdate = true;
      if (this._shadowN++ % 3 === 0) this.lights.sky.shadow.needsUpdate = true;
    }
    if (this.active) this.active.update(dt, this.t, this.ctx, this);
    if (this.sky) this.painter.paint(this.sky, this.t); // clouds drift
    this.character.tick(dt);
    this._frame(dt);
    this.renderer.render(this.scene, this.camera);
    this.character.rendered();
  }

  /** render one frame now (tests / screenshots) */
  renderNow() {
    this.renderer.shadowMap.needsUpdate = true;
    this.lights.sky.shadow.needsUpdate = true;
    this._frame(1);
    this.renderer.render(this.scene, this.camera);
    this.character.rendered();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.character.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    if (this.vignette) this.vignette.remove();
  }
}

/* ============================================================== routines */
/**
 * Picks activities in turn. Each activity: { id, w (weight), dur: [min, max] seconds,
 * status, pose (Character.pose), enter?(), update?(dt, t) }.
 */
export class Routine {
  constructor(world, list) {
    this.world = world;
    this.list = list;
    this.cur = null;
    this.left = 0;
    this.forced = null;
  }

  start(id) {
    const next = id ? this.list.find((a) => a.id === id) : this._pick();
    if (!next) return;
    this.cur = next;
    this.left = next.dur[0] + Math.random() * (next.dur[1] - next.dur[0]);
    this.world.character.pose = next.pose || null;
    if (next.enter) next.enter();
    this.world.status(typeof next.status === 'function' ? next.status() : next.status);
  }

  _pick() {
    const pool = this.list.filter((a) => a !== this.cur && (a.when ? a.when() : true) && a.w > 0);
    if (!pool.length) return this.cur;
    let r = Math.random() * pool.reduce((s, a) => s + a.w, 0);
    for (const a of pool) {
      r -= a.w;
      if (r <= 0) return a;
    }
    return pool[pool.length - 1];
  }

  update(dt, t) {
    if (this.forced) {
      if (this.cur !== this.forced) this.start(this.forced.id);
    } else {
      this.left -= dt;
      if (!this.cur || this.left <= 0) this.start();
    }
    if (this.cur && this.cur.update) this.cur.update(dt, t);
  }

  /** hold one activity (lunch, sleep) until cleared with force(null) */
  force(id) {
    const a = id ? this.list.find((x) => x.id === id) : null;
    if (a === this.forced) return;
    this.forced = a || null;
    if (!a) this.start();
  }
}
