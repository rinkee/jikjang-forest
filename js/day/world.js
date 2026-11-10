/*
 * 직장의 숲 · 하루 — world.js (one renderer, the character, and the scene sets around it)
 *
 * A set is { group, frame(aspect, ctx), enter(ctx), update(dt, t, ctx), sky?(s) }.
 * The time of day comes from setTime(ms) (the real clock): it lights the room and repaints
 * the views out of the windows (world.painter), then hands the sky state (sky.js) to the set.
 * frame() returns { target: [x, y, z], w, h, elev } — the world width/height that must stay
 * on screen; the camera backs off until both fit, and eases when the frame changes.
 * Sets get their frame from world.view(key), which reads the camera tuning (js/tuning.js).
 */
import * as THREE from 'three';
import { Character, makeScene, makeRenderer } from '../char3d.js';
import { TUNING } from '../tuning.js';
import { skyAt, sunTimes, SkyPainter } from './sky.js';

const DEG = Math.PI / 180;

export class World {
  constructor(container, o) {
    o = o || {};
    this.container = container;
    this.onStatus = o.onStatus || (() => {});
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world-canvas';
    container.append(this.canvas);
    this.renderer = makeRenderer(this.canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    this.keyBase = this.lights.key.position.clone();
    this.skyBase = this.lights.sky.position.clone();
    // a high, pulled-back view of a little room (the character is about a third of the visible height)
    this.tuning = o.tuning || TUNING; // the studio swaps in its own live copy
    this.camera = new THREE.PerspectiveCamera(this.tuning.camera.fov, 1, 0.5, 300);

    this.character = new Character();
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
    await this.character.setState(state, { animate: false });
    if (this.character.held.L || this.character.held.R) await this.character.setState(Object.assign({}, state, { acc: 'none' }), { animate: false });
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
    Object.assign(this.ctx, ctx || {});
    set.enter(this.ctx, this);
    this.setTime(this.timeMs); // relights for the new set and hands it the sky
    this._cam = null; // jump, don't ease, into a new set
  }

  /** the time of day (ms since epoch, local clock): sky, window views, room light */
  setTime(ms) {
    this.timeMs = ms;
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
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** the camera frame for a scene key (office, home_table, subway_in, ...) from the tuning */
  view(key, aspect) {
    const T = this.tuning;
    const s = (T.scenes && T.scenes[key]) || { target: [0, 1.6, 0] };
    const h = T.camera.height;
    const tall = aspect < 0.8;
    return { target: s.target, w: h * (tall ? 0.82 : 1.58), h, elev: T.camera.elev };
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
    const W = Math.max(1, this.container.clientWidth);
    const H = Math.max(1, this.container.clientHeight);
    const band = Math.max(0.35, (H - c.top - c.bottom) / H); // share of the height left for the scene
    const dist = Math.max(c.h / 2 / (vh * band), c.w / 2 / (vh * aspect));
    // shift the picture so the target sits in the middle of the uncovered band
    this.camera.setViewOffset(W, H, 0, -(c.top - c.bottom) / 2, W, H);
    const e = c.elev * DEG;
    this.camera.position.set(c.x, c.y + Math.sin(e) * dist, c.z + Math.cos(e) * dist);
    this.camera.lookAt(c.x, c.y, c.z);
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden) {
      this.clock.getDelta();
      return;
    }
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    if (this.active) this.active.update(dt, this.t, this.ctx, this);
    if (this.sky) this.painter.paint(this.sky, this.t); // clouds drift
    this.character.tick(dt);
    this._frame(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** render one frame now (tests / screenshots) */
  renderNow() {
    this._frame(1);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.character.dispose();
    this.renderer.dispose();
    this.canvas.remove();
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
