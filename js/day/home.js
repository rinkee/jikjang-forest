/*
 * 직장의 숲 · 하루 — home.js (the character's room)
 *
 * Three spots, picked by the hour (ctx.spot):
 *   ready  morning, getting ready: pacing in front of the window, stretching, waving
 *   table  sitting on a floor cushion, legs stretched out under a blanket-covered low table
 *   bed    asleep on its side, facing us, knees drawn up under a puffy duvet
 * ctx.sleepWhy ('tired' | 'late') words the sleeping status for those reasons (the app no longer
 * sends it to bed by itself after work: the player does, with the bed button; dev pages may set it).
 */
import { THREE, FONT, mat, box, cyl, ball, plane, group, shade, canvasTex, glow, zzz, wallClock, sunPatch, setDetail, seg } from './kit.js';
import { Routine } from './world.js';
import { sceneMat, CC, setShadeDim } from '../char3d.js';
import { softBox, drape, curtainGeo, latheMesh, plant, bodyField, clothOver, woodTex, quiltTex, floralTex, plaidTex, rugTex } from './soft.js';

const CC_LIGHT = (c) => CC.color.light(c, 0.45);

const TABLE_X = -0.6;
const SIT = 0.57; // sitting on the floor cushion: the torso bottom rests on its top (0.16)
const TABLE_TOP = 0.65; // hands rest here; the legs (0.06..0.44) fit under it
const PACE = [0.9, 1.95]; // how far the character paces in the morning (x), between table and bed
const READY = [1.2, 0, 0.45];
const TV = [-3.55, -1.05]; // x, z: the screen turns toward the character at the table
const TV_YAW = -0.5; // the character half turns toward the TV while watching
const LAMP = [2.2, -1.0]; // x, z: clear of the bed and in front of the curtain
const MOOD_LAMP = [TABLE_X + 1.12, 0.42]; // x, z of the little mushroom lamp: the back corner of the kotatsu, beside the mug
/* Room light after dark (blended in as it gets dark; the day keeps the sky's own light).
 * cozy: evening with the lamps on — warm and low, the corners fall away.
 * sleepy: bedtime — a night light and a little moonlight. */
const NIGHT = {
  cozy: { hemi: ['#ffcf9c', '#5a3628', 0.3], key: ['#ffb877', 0.95], fill: 0.05, rim: 0.5, env: 0.17 },
  sleepy: { hemi: ['#d6bfc4', '#3d2c30', 0.25], key: ['#ffb57a', 0.34], fill: 0.1, rim: 0.25, env: 0.11 },
};
const BED = { head: [5.9, 1.82, -0.95] }; // where the head rests on the pillow (back from the edge, so the duvet can fall over the knees)
const mirror = (v, side) => (side === 'L' ? [-v[0], v[1], v[2]] : v);

/**
 * What is on TV: five channels taking turns on a small, blocky picture (a low-resolution
 * canvas shown unsmoothed), redrawn about ten times a second; the channel changes with a
 * burst of static.
 *   variety  quick cuts — the panel laughing behind the studio desk, a reaction close-up
 *            with a big caption, a clip with a panellist's face in a corner box, a quiz
 *            with a countdown — under the programme badge, with a caption bar below
 *   drama    slow cuts through black, letterboxed — two people in the rain at night, a
 *            close-up with a tear, someone walking away in the snow, and the freeze frame
 *            that ends the episode — with subtitles
 *   clips    an online video channel — a mukbang, a cat with a ball, a game stream with
 *            its chat — over a player bar and a subscribe button
 *   film     a streaming service — its logo opening out of the dark, a title card, then
 *            the big scenes: a spaceship, a desert chase, a monster in a thunderstorm
 *   news     the anchor, a reporter out in the rain, the forecast — over a ticker
 * texture.userData.paint(t) draws the frame for time t and returns the colour the screen
 * throws into the room.
 */
function tvShow() {
  const SHOT = 3; // seconds a shot stays on
  const GLOW = ['#ffc7e0', '#ffe08a', '#a9d4ff', '#c9b0ff'];
  const SKIN = ['#f2c29b', '#e8a877', '#f6d2b0', '#d99a6c'];
  const HAIR = ['#3a2a20', '#6b4226', '#22242c', '#b5651d'];
  const TOP = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c'];
  const tex = canvasTex(128, 72, () => {});
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const c = tex.userData.canvas;
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  const R = Math.round;
  const rect = (x, y, rw, rh, col) => {
    g.fillStyle = col;
    g.fillRect(R(x), R(y), R(rw), R(rh));
  };
  const disc = (x, y, r, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(R(x), R(y), r, 0, Math.PI * 2);
    g.fill();
  };
  /** a person from the chest up: r = head radius, laugh 0..1 opens the mouth and shuts the eyes */
  const person = (x, y, r, i, laugh, top) => {
    rect(x - r * 1.5, y + r * 0.9, r * 3, h, top || TOP[i % 4]); // shoulders
    rect(x - r * 0.35, y + r * 0.6, r * 0.7, r * 0.5, SKIN[i % 4]); // neck
    disc(x, y, r, SKIN[i % 4]);
    g.fillStyle = HAIR[i % 4];
    g.beginPath();
    g.arc(R(x), R(y - r * 0.15), r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();
    const e = Math.max(1, R(r * 0.2));
    if (laugh < 0) {
      // sad: lowered eyes, a small tight mouth
      rect(x - r * 0.55, y - r * 0.05, e + 1, Math.max(1, e - 1), '#3a2a20');
      rect(x + r * 0.2, y - r * 0.05, e + 1, Math.max(1, e - 1), '#3a2a20');
      rect(x - r * 0.15, y + r * 0.45, r * 0.3, 1, '#7a3a3a');
    } else if (laugh > 0.5) {
      rect(x - r * 0.5, y - r * 0.05, e + 1, 1, '#3a2a20');
      rect(x + r * 0.2, y - r * 0.05, e + 1, 1, '#3a2a20');
      rect(x - r * 0.3, y + r * 0.3, r * 0.6, Math.max(1, r * 0.35), '#8a2f2f');
    } else {
      rect(x - r * 0.5, y - r * 0.15, e, e, '#3a2a20');
      rect(x + r * 0.25, y - r * 0.15, e, e, '#3a2a20');
      rect(x - r * 0.2, y + r * 0.4, r * 0.4, 1, '#8a2f2f');
    }
  };
  /** a caption: big outlined letters, the way variety shows shout on screen */
  const caption = (text, x, y, size, fill, edge) => {
    g.font = `${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = edge;
    g.strokeText(text, R(x), R(y));
    g.fillStyle = fill;
    g.fillText(text, R(x), R(y));
  };
  /** the bar along the bottom: a coloured tab and lines of "text" */
  const lower = (col, n) => {
    rect(4, h - 15, w - 8, 11, 'rgba(255,255,255,0.92)');
    rect(4, h - 15, 16, 11, col);
    for (let k = 0, x = 24; k < n && x < w - 12; k++) {
      const len = 8 + ((k * 7) % 3) * 5;
      rect(x, h - 11, len, 3, '#3a3f4a');
      x += len + 3;
    }
  };
  /** what never leaves the screen: the programme badge and the channel logo */
  const furniture = () => {
    rect(3, 3, 26, 9, '#ff4d6d');
    rect(5, 6, 14, 3, '#ffffff');
    rect(21, 6, 5, 3, '#ffe066');
    disc(w - 9, 8, 4, 'rgba(255,255,255,0.85)');
    rect(w - 11, 7, 4, 2, '#4dabf7');
  };
  const studio = (a, b, t) => {
    rect(0, 0, w, h, a);
    for (let i = 0; i < 7; i++) rect(i * 20 - 4, 0, 10, h, b); // panelled backdrop
    for (let i = 0; i < 9; i++) disc(8 + i * 14, 16 + (i % 2) * 4, 2, (i + Math.floor(t * 3)) % 3 ? '#fff6c8' : '#ffb3d1'); // chasing bulbs
  };
  const shots = [
    (t) => {
      // the panel behind the desk, cracking up one after another
      studio('#ff8fb3', '#ff7aa5', t);
      for (let i = 0; i < 4; i++) {
        const laugh = Math.sin(t * 5 + i * 1.7) > -0.2 ? 1 : 0;
        person(20 + i * 29, 36 - laugh * Math.abs(Math.sin(t * 11 + i)) * 2, 7, i, laugh);
      }
      rect(0, 50, w, h, '#5f3dc4');
      rect(0, 50, w, 2, '#b197fc');
      lower('#ff4d6d', 5);
    },
    (t) => {
      // reaction close-up: a burst behind the face, and the caption jumps
      rect(0, 0, w, h, '#ffd43b');
      g.fillStyle = '#ffec99';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.8;
        g.beginPath();
        g.moveTo(w * 0.42, h * 0.5);
        g.lineTo(w * 0.42 + Math.cos(a) * 120, h * 0.5 + Math.sin(a) * 120);
        g.lineTo(w * 0.42 + Math.cos(a + 0.13) * 120, h * 0.5 + Math.sin(a + 0.13) * 120);
        g.fill();
      }
      person(w * 0.4 + Math.sin(t * 13) * 1.2, h * 0.5, 19, 1, 1);
      const pop = 1 + 0.18 * Math.abs(Math.sin(t * 7));
      caption('ㅋㅋㅋ', w * 0.76, h * 0.34, 17 * pop, '#ff4d6d', '#ffffff');
      lower('#ffd43b', 4);
    },
    (t) => {
      // a clip from outside, with a panellist watching in the corner box
      rect(0, 0, w, h, '#8fd3ff');
      rect(0, 44, w, h, '#7cc47f');
      for (let i = 0; i < 5; i++) rect(((((i * 37 - t * 30) % (w + 30)) + w + 30) % (w + 30)) - 20, 26 - (i % 3) * 6, 16, 20 + (i % 3) * 6, i % 2 ? '#e9ecef' : '#ced4da');
      const run = Math.abs(Math.sin(t * 9));
      person(46, 40 - run * 3, 8, 2, 0);
      person(76, 41 - Math.abs(Math.cos(t * 9)) * 3, 7, 3, 1);
      rect(w - 39, h - 43, 36, 26, '#ffffff');
      rect(w - 38, h - 42, 34, 24, '#ffa8c5');
      g.save();
      g.beginPath();
      g.rect(w - 38, h - 42, 34, 24);
      g.clip();
      person(w - 21, h - 31, 7, 0, Math.sin(t * 4) > 0 ? 1 : 0);
      g.restore();
      lower('#4dabf7', 6);
    },
    (t, into) => {
      // quiz: two sides, a countdown bar, lights flashing
      rect(0, 0, w / 2, h, '#845ef7');
      rect(w / 2, 0, w / 2, h, '#20c997');
      if (Math.floor(t * 4) % 2) rect(0, 0, w, 14, 'rgba(255,255,255,0.18)');
      person(w * 0.24, 34, 10, 3, into > 2.2 ? 1 : 0);
      person(w * 0.76, 34, 10, 0, 0);
      disc(w / 2, 32, 11, '#ffffff');
      caption('VS', w / 2, 33, 11, '#ff4d6d', '#ffffff');
      rect(10, 14, w - 20, 4, 'rgba(0,0,0,0.3)');
      rect(10, 14, (w - 20) * Math.max(0, 1 - into / SHOT), 4, '#ffe066');
      lower('#845ef7', 5);
    },
  ];
  /* ---- the drama ---- */
  const COAT = ['#5c6b8a', '#8a5a5a', '#4f6f64', '#6b5a7a'];
  const DGLOW = ['#8ea2d8', '#d8a880', '#ffc59a', '#d9b98c'];
  /** someone seen from behind */
  const back = (x, y, r, i) => {
    rect(x - r * 1.5, y + r * 0.9, r * 3, h, COAT[i % 4]);
    disc(x, y, r, HAIR[i % 4]);
  };
  /** out-of-focus lights in the background */
  const bokeh = (t, cols, n) => {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.9 + i * 2.1);
      disc(((i * 53 + t * 2) % (w + 20)) - 10, 12 + ((i * 29) % 36), 4 + (i % 3) * 2, cols[i % cols.length]);
    }
    g.globalAlpha = 1;
  };
  const falling = (t, n, len, speed, col) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) g.fillRect((i * 37 + Math.floor(i / 3) * 11) % w, R((i * 23 + t * speed) % h), 1, len);
  };
  /** subtitles: one or two lines of "text", centred */
  const subs = (lines) => {
    lines.forEach((len, k) => {
      const y = h - 16 - (lines.length - 1 - k) * 5;
      rect((w - len) / 2 - 1, y - 1, len + 2, 5, 'rgba(0,0,0,0.35)');
      rect((w - len) / 2, y, len, 3, '#ffffff');
    });
  };
  const letterbox = () => {
    rect(0, 0, w, 7, '#0b0b0e');
    rect(0, h - 7, w, 7, '#0b0b0e');
    disc(w - 9, 13, 3, 'rgba(255,255,255,0.6)'); // the channel logo
    g.strokeStyle = '#ffe066'; // the age rating, in its ring
    g.lineWidth = 1;
    g.beginPath();
    g.arc(9, 14, 4, 0, Math.PI * 2);
    g.stroke();
    rect(7, 13, 4, 2, '#ffe066');
  };
  const drama = [
    (t, into) => {
      // two people in the rain at night, the camera creeping in
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#141a33');
      grd.addColorStop(1, '#2c355c');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      bokeh(t, ['#ffd58a', '#ff9d7a', '#9ec5ff'], 9);
      const z = 1 + into * 0.03;
      person(w / 2 - 27 * z, 40, 11 * z, 2, 0, COAT[0]);
      person(w / 2 + 27 * z, 42, 11 * z, 1, -1, COAT[1]);
      falling(t, 34, 4, 70, 'rgba(200,220,255,0.45)');
      if (into % 2.2 > 0.5) subs(into % 4.4 < 2.2 ? [46] : [58, 30]);
    },
    (t, into) => {
      // the close-up: a tear, slowly
      rect(0, 0, w, h, '#3a2a26');
      bokeh(t, ['#ffb86b', '#ffe0a3', '#d98a5a'], 8);
      const r = 21 + into * 0.5;
      const x = w * 0.44;
      const y = h * 0.56;
      person(x, y, r, 1, -1, COAT[1]);
      const fall = Math.min(1, Math.max(0, (into - 0.8) / 2.6));
      if (fall > 0) rect(x + r * 0.32, y + r * 0.08 + fall * r * 0.75, 2, 3, '#bfe3ff');
      if (into > 1.6) subs([40]);
    },
    (t, into) => {
      // walking away in the snow at dusk, watched from behind
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#5a5f9a');
      grd.addColorStop(0.7, '#f2a27a');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      rect(0, 46, w, h, '#cfd6e6');
      for (let i = 0; i < 4; i++) {
        const k = 1 - i * 0.2;
        rect(20 + i * 13, 46 - 26 * k, 1 + k, 26 * k, '#3b3f55'); // street lamps going into the distance
        disc(20 + i * 13 + 1, 46 - 26 * k, 1.5 + k, '#ffe7a8');
      }
      const far = Math.min(1, into / 4.5);
      const fx = 58 + far * 8;
      const fr = 4.5 - far * 2;
      rect(fx - fr, 44 - fr * 2.2, fr * 2, fr * 2.6, COAT[0]);
      disc(fx, 44 - fr * 2.8, fr * 0.8, HAIR[2]);
      g.fillStyle = '#e03131'; // the umbrella
      g.beginPath();
      g.arc(R(fx), R(44 - fr * 3.4), fr * 1.9, Math.PI, Math.PI * 2);
      g.fill();
      back(98, 44, 13, 1);
      falling(t, 30, 1, 14, 'rgba(255,255,255,0.9)');
    },
    (t, into) => {
      // the last shot freezes and fades to sepia: to be continued
      rect(0, 0, w, h, '#26303f');
      bokeh(into < 1.4 ? t : 0, ['#9ec5ff', '#ffd58a'], 7);
      person(w * 0.42, h * 0.56, 22, 2, 0, COAT[2]);
      disc(w * 0.42 - 10, h * 0.56 - 4, 2.5, '#ffffff'); // wide eyes
      disc(w * 0.42 + 8, h * 0.56 - 4, 2.5, '#ffffff');
      disc(w * 0.42 - 10, h * 0.56 - 4, 1.2, '#3a2a20');
      disc(w * 0.42 + 8, h * 0.56 - 4, 1.2, '#3a2a20');
      const sep = Math.min(1, Math.max(0, (into - 1.4) / 1.2));
      if (sep > 0) {
        g.globalCompositeOperation = 'color';
        rect(0, 0, w, h, `rgba(150,105,60,${sep.toFixed(2)})`);
        g.globalCompositeOperation = 'source-over';
        rect(0, 0, w, h, `rgba(255,230,190,${(sep * 0.15).toFixed(2)})`);
      }
      if (into > 2.4) caption('다음 이야기', w * 0.74, h * 0.72, 11, '#ffffff', '#2a2018');
    },
  ];

  /* ---- an online video channel: a mukbang, a cat clip, a game stream ---- */
  const tri = (x1, y1, x2, y2, x3, y3, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(R(x1), R(y1));
    g.lineTo(R(x2), R(y2));
    g.lineTo(R(x3), R(y3));
    g.fill();
  };
  const oval = (x, y, rx, ry, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(R(x), R(y), rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const clips = [
    (t) => {
      // mukbang: a table full of food, chewing
      rect(0, 0, w, h, '#ffe8cc');
      rect(0, 0, w, 20, '#ffd8a8');
      const chew = Math.sin(t * 9) > 0 ? 1 : 0;
      person(w / 2, 26, 12, 0, chew, '#74c0fc');
      rect(0, 46, w, h, '#f1f3f5');
      oval(26, 52, 15, 6, '#ffffff');
      oval(26, 51, 12, 4, '#e03131'); // tteokbokki
      oval(64, 54, 17, 6, '#ffffff');
      oval(64, 53, 14, 4, '#f59f00'); // fried chicken
      oval(102, 52, 14, 6, '#ffffff');
      oval(102, 51, 11, 4, '#fff3bf'); // noodles
      const lift = Math.abs(Math.sin(t * 2.2));
      rect(w / 2 + 14, 50 - lift * 20, 2, 12, '#868e96'); // chopsticks going up
      disc(w / 2 + 14, 50 - lift * 20, 3, '#f59f00');
      caption('먹방', 20, 14, 11, '#ffffff', '#e03131');
    },
    (t) => {
      // a phone clip of a cat and a ball, blurred bars at the sides
      rect(0, 0, w, h, '#495057');
      rect(36, 0, 56, h, '#ffe3e3');
      rect(36, 48, 56, h, '#e9bc8b');
      const bat = Math.sin(t * 6);
      const cx = 58;
      g.strokeStyle = '#f08c3a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - 9, 46);
      g.quadraticCurveTo(cx - 22, 40 + Math.sin(t * 4) * 6, cx - 18, 28 + Math.sin(t * 4) * 3); // the tail
      g.stroke();
      oval(cx, 44, 11, 9, '#f08c3a');
      disc(cx + 6, 31, 7, '#f6a04d');
      tri(cx, 28, cx + 2, 20, cx + 6, 26, '#f08c3a');
      tri(cx + 7, 26, cx + 11, 20, cx + 13, 28, '#f08c3a');
      rect(cx + 3, 30, 2, 2, '#2b2b2b');
      rect(cx + 9, 30, 2, 2, '#2b2b2b');
      rect(cx + 8, 42 - Math.max(0, bat) * 6, 9, 3, '#f6a04d'); // the paw
      disc(cx + 22 + Math.max(0, bat) * 6, 48 - Math.abs(Math.sin(t * 6)) * 8, 3, '#4dabf7');
      for (let i = 0; i < 3; i++) {
        const up = (t * 14 + i * 13) % 40;
        g.globalAlpha = 1 - up / 40;
        disc(86 + Math.sin(t * 3 + i) * 2, 50 - up, 2, '#ff6b6b'); // hearts floating up
        g.globalAlpha = 1;
      }
    },
    (t) => {
      // a game stream: a little platformer, the streamer in a corner, chat scrolling by
      rect(0, 0, w, h, '#1b1e3a');
      for (let i = 0; i < 12; i++) rect((i * 31) % 96, (i * 17) % 30, 1, 1, '#ffffff');
      const sc = t * 22;
      for (let i = 0; i < 8; i++) {
        const x = ((((i * 24 - sc) % 192) + 192) % 192) - 24;
        if (x < 96) rect(x, 48 - (i % 3) * 8, 16, 4, '#51cf66');
        if (x < 92 && i % 2) rect(x + 6, 43 - (i % 3) * 8, 3, 3, '#ffd43b'); // coins
      }
      rect(0, 56, 96, h, '#2f9e44');
      const jump = Math.abs(Math.sin(t * 5)) * 14;
      rect(30, 48 - jump, 6, 8, '#ff6b6b');
      rect(31, 50 - jump, 2, 2, '#ffffff');
      rect(96, 0, 32, h, '#25262b');
      for (let i = 0; i < 9; i++) {
        const y = ((((i * 7 - t * 9) % 63) + 63) % 63) + 2;
        rect(98, y, 3, 3, ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c'][i % 4]);
        rect(103, y, 8 + ((i * 5) % 14), 2, '#ced4da');
      }
      rect(2, 2, 26, 20, '#ffffff');
      rect(3, 3, 24, 18, '#364fc7');
      g.save();
      g.beginPath();
      g.rect(3, 3, 24, 18);
      g.clip();
      person(15, 12, 5, 3, Math.sin(t * 3) > 0.3 ? 1 : 0);
      g.restore();
    },
  ];
  /** the player: a progress bar creeping along, and a subscribe button that pulses */
  const player = (t, n, into) => {
    rect(0, h - 4, w, 4, 'rgba(0,0,0,0.55)');
    const k = (n + into / 3.5) / clips.length;
    rect(0, h - 3, w * k, 2, '#ff3b3b');
    disc(w * k, h - 2, 2, '#ff3b3b');
    const on = Math.sin(t * 2.4) > 0;
    rect(w - 30, h - 17, 27, 10, on ? '#ff3b3b' : '#ffffff');
    rect(w - 26, h - 14, 13, 4, on ? '#ffffff' : '#ff3b3b');
    tri(w - 11, h - 15, w - 11, h - 9, w - 6, h - 12, on ? '#ffffff' : '#ff3b3b');
  };

  /* ---- a film on a streaming service: the logo, then the big scenes ---- */
  const film = [
    (t, into) => {
      // the service's logo opens up out of the dark, then the title card
      rect(0, 0, w, h, '#050508');
      if (into < 1.8) {
        const k = Math.min(1, into / 1.1);
        for (let i = 0; i < 7; i++) rect(w / 2 - 14 + i * 4, h / 2 - 14 * k, 3, 28 * k, ['#7048e8', '#845ef7', '#9775fa', '#b197fc'][i % 4]);
        if (into > 1.2) rect(0, 0, w, h, `rgba(151,117,250,${((into - 1.2) * 1.2).toFixed(2)})`);
      } else {
        g.globalAlpha = Math.min(1, (into - 1.8) / 0.8);
        caption('한밤의 추격', w / 2, h / 2 - 3, 15, '#f8f9fa', '#050508');
        rect(w / 2 - 22, h / 2 + 9, 44, 1, '#9775fa');
        g.globalAlpha = 1;
      }
    },
    (t, into) => {
      // space: a ship crossing in front of a planet
      rect(0, 0, w, h, '#060814');
      for (let i = 0; i < 40; i++) rect((i * 47 + R(t * (1 + (i % 3)))) % w, (i * 29) % h, 1, 1, i % 4 ? '#ffffff' : '#9ec5ff');
      disc(96, 50, 30, '#3b5bdb');
      disc(90, 44, 30, '#4c6ef5');
      oval(92, 46, 44, 5, 'rgba(255,255,255,0.25)');
      const x = -20 + into * 34;
      const y = 28 + Math.sin(t * 2) * 2;
      tri(x - 12, y, x + 10, y - 5, x + 10, y + 5, '#dee2e6');
      rect(x - 4, y - 2, 16, 4, '#adb5bd');
      tri(x + 16, y, x + 10, y - 3, x + 10, y + 3, '#f8f9fa');
      rect(x - 22 - Math.random() * 6, y - 1, 12, 2, '#ffd43b'); // the engine
      rect(x - 14, y - 2, 6, 4, '#ff922b');
    },
    (t, into) => {
      // a chase through the desert, and something blows up
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#ff922b');
      grd.addColorStop(1, '#ffe066');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      disc(100, 30, 9, '#fff3bf');
      for (let i = 0; i < 4; i++) tri(((((i * 50 - t * 12) % 200) + 200) % 200) - 40, 46, ((((i * 50 - t * 12) % 200) + 200) % 200) - 15, 28 - (i % 2) * 6, ((((i * 50 - t * 12) % 200) + 200) % 200) + 10, 46, '#c9773a');
      rect(0, 46, w, h, '#b9632f');
      for (let i = 0; i < 6; i++) rect(((((i * 26 - t * 90) % 150) + 150) % 150) - 10, 54 + (i % 2) * 6, 10, 1, '#8f4a22');
      const car = (x, col) => {
        const b = Math.sin(t * 20 + x) > 0 ? 1 : 0;
        rect(x, 44 - b, 20, 6, col);
        rect(x + 4, 40 - b, 10, 4, col);
        rect(x + 6, 41 - b, 6, 2, '#a5d8ff');
        disc(x + 4, 51, 2.5, '#212529');
        disc(x + 16, 51, 2.5, '#212529');
        rect(x - 8 - Math.random() * 4, 47, 8, 3, 'rgba(255,255,255,0.4)'); // dust
      };
      car(70 + Math.sin(t * 1.3) * 5, '#212529');
      car(24 + Math.sin(t * 1.7) * 6, '#c92a2a');
      const boom = into - 2.2;
      if (boom > 0 && boom < 1.4) {
        const r = 6 + boom * 22;
        disc(8, 44, r, '#ff6b00');
        disc(8, 44, r * 0.65, '#ffd43b');
        disc(8, 44, r * 0.3, '#ffffff');
        if (boom < 0.15) rect(0, 0, w, h, 'rgba(255,255,255,0.7)');
      }
    },
    (t, into) => {
      // night, lightning, something huge behind the trees
      const flash = Math.sin(t * 3.1) * Math.sin(t * 7.3) > 0.55;
      rect(0, 0, w, h, flash ? '#8fa3d9' : '#0d1326');
      if (flash) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(96, 0);
        g.lineTo(90, 14);
        g.lineTo(98, 20);
        g.lineTo(92, 36);
        g.stroke();
      }
      const dark = flash ? '#0d1326' : '#050810';
      const by = 30 + Math.sin(t * 1.5) * 2;
      oval(58, by + 14, 24, 16, dark); // the body
      rect(66, by - 12, 10, 22, dark); // the neck
      oval(80, by - 12, 13, 7, dark); // the head
      tri(86, by - 8, 93, by - 6 + (Math.sin(t * 5) > 0 ? 4 : 1), 80, by - 5, dark); // the jaw
      rect(83, by - 14, 2, 2, '#ffd43b');
      tri(34, by + 20, 16, by + 36, 44, by + 24, dark); // the tail
      for (let i = 0; i < 9; i++) tri(i * 16 - 6, h, i * 16 + 2, 44 - (i % 3) * 5, i * 16 + 10, h, dark); // trees
      rect(100, 56, 14, 5, '#e03131'); // the jeep
      rect(103, 53, 7, 3, '#e03131');
      rect(114, 57, 12 + Math.random() * 3, 2, 'rgba(255,240,170,0.8)'); // headlights
      falling(t, 30, 4, 80, 'rgba(200,220,255,0.35)');
      if (into > 2.4) {
        // the next episode is about to start
        rect(w - 42, h - 21, 38, 11, 'rgba(20,20,24,0.85)');
        tri(w - 39, h - 19, w - 39, h - 13, w - 34, h - 16, '#ffffff');
        rect(w - 31, h - 17, 14, 3, '#ffffff');
        rect(w - 42, h - 11, 38 * Math.min(1, (into - 2.4) / 2.1), 1, '#9775fa');
      }
    },
  ];
  const cinema = () => {
    rect(0, 0, w, 6, '#050508');
    rect(0, h - 6, w, 6, '#050508');
  };

  /* ---- the news: the anchor, a reporter out in the weather, the forecast ---- */
  const news = [
    (t) => {
      rect(0, 0, w, h, '#1c3f8f');
      for (let i = 0; i < 14; i++) rect((i * 19) % w, 6 + ((i * 13) % 30), 9 + (i % 3) * 4, 4, '#2f5fc4'); // a world map, more or less
      rect(78, 10, 42, 30, '#ffffff');
      rect(79, 11, 40, 28, '#ffa94d');
      tri(84, 36, 96, 18, 108, 36, '#e8590c');
      disc(110, 18, 4, '#fff3bf');
      person(38, 30, 10, 2, Math.sin(t * 8) > 0.2 ? 0.4 : 0, '#343a40');
      rect(36, 41, 4, 12, '#e03131'); // the tie
      rect(0, 50, w, h, '#0b2a6b');
      rect(0, 50, w, 2, '#74c0fc');
    },
    (t) => {
      // live from outside: wind, rain, a microphone
      rect(0, 0, w, h, '#748ca6');
      rect(0, 44, w, h, '#4c5f73');
      for (let i = 0; i < 3; i++) rect(8 + i * 44, 20 - (i % 2) * 8, 26, 30 + (i % 2) * 8, '#5d7389');
      const sway = Math.sin(t * 3) * 2;
      person(60 + sway, 32, 11, 3, Math.sin(t * 7) > 0 ? 0.4 : 0, '#ffd43b');
      rect(72 + sway, 44, 3, 10, '#212529');
      disc(73 + sway, 43, 3, '#e03131');
      g.strokeStyle = 'rgba(220,235,255,0.6)';
      g.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const x = ((((i * 23 - t * 120) % (w + 20)) + w + 20) % (w + 20)) - 10;
        const y = (i * 17 + t * 60) % h;
        g.beginPath();
        g.moveTo(R(x), R(y));
        g.lineTo(R(x) - 5, R(y) + 3);
        g.stroke();
      }
      rect(w - 30, 4, 26, 9, '#e03131');
      rect(w - 27, 7, 3, 3, Math.sin(t * 6) > 0 ? '#ffffff' : '#e03131');
      rect(w - 22, 7, 15, 3, '#ffffff');
    },
    (t) => {
      // the forecast: a map, suns and clouds, the presenter pointing
      rect(0, 0, w, h, '#a5d8ff');
      g.fillStyle = '#8ce99a';
      g.beginPath();
      g.moveTo(52, 8);
      g.lineTo(84, 10);
      g.lineTo(92, 30);
      g.lineTo(84, 54);
      g.lineTo(62, 58);
      g.lineTo(50, 40);
      g.lineTo(56, 24);
      g.fill();
      const icon = (x, y, kind, ph) => {
        const b = Math.sin(t * 3 + ph) * 1.5;
        if (kind === 0) disc(x, y + b, 4, '#ffd43b');
        else {
          oval(x, y + b, 6, 3, '#ffffff');
          disc(x - 2, y - 2 + b, 3, '#ffffff');
          if (kind === 2) for (let k = 0; k < 3; k++) rect(x - 4 + k * 4, y + 4 + ((t * 10 + k * 3) % 5), 1, 2, '#1c7ed6');
        }
      };
      icon(62, 18, 0, 0);
      icon(80, 24, 1, 1);
      icon(60, 36, 2, 2);
      icon(76, 46, 0, 3);
      person(24, 34, 9, 0, 0.4, '#f783ac');
      rect(34, 44 - Math.sin(t * 2) * 6, 14, 2, SKIN[0]); // pointing at the map
      rect(98, 10, 26, 40, 'rgba(255,255,255,0.7)');
      for (let k = 0; k < 4; k++) {
        disc(104, 16 + k * 9, 2.5, k % 2 ? '#74c0fc' : '#ffd43b');
        rect(110, 15 + k * 9, 10, 3, '#495057');
      }
    },
  ];
  /** the headline bar with its red tab, and the ticker running underneath */
  const ticker = (t) => {
    rect(0, h - 18, w, 9, '#ffffff');
    rect(0, h - 18, 20, 9, '#e03131');
    rect(3, h - 15, 14, 3, '#ffffff');
    rect(24, h - 15, 52, 3, '#212529');
    rect(80, h - 15, 22, 3, '#212529');
    rect(0, h - 9, w, 9, '#0b2a6b');
    for (let i = 0; i < 8; i++) rect(((((i * 34 - t * 26) % 272) + 272) % 272) - 30, h - 6, 22 + (i % 3) * 5, 3, i % 3 ? '#ffffff' : '#ffd43b');
    rect(w - 26, 3, 23, 8, 'rgba(255,255,255,0.9)'); // the clock
    rect(w - 23, 5, 6, 4, '#0b2a6b');
    rect(w - 15, 5, 9, 4, '#0b2a6b');
  };

  const grain = (t) => {
    // a worn picture: grain, faint scan lines, a band rolling down
    for (let i = 0; i < 140; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
      g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(0, R((t * 17) % (h + 10)) - 10, w, 7);
  };
  const snow = (n) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#f4f4f4' : '#2a2a2a';
      g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 2, 1);
    }
  };
  /* The channels, in the order they come on. len: seconds a shot stays on; cut: how one
   * shot gives way to the next ('static' a flash of snow, 'black' a dip to black, or none). */
  const CHANNELS = [
    { shots, len: SHOT, over: () => furniture(), cut: 'static', glow: GLOW },
    { shots: drama, len: 4.5, over: letterbox, cut: 'black', glow: DGLOW },
    { shots: clips, len: 3.5, over: player, glow: ['#ffd8a8', '#ffc9c9', '#8c9eff'] },
    { shots: film, len: 4.5, over: cinema, cut: 'black', glow: ['#9775fa', '#5c7cfa', '#ffb347', '#6f86c9'] },
    { shots: news, len: 3.5, over: ticker, glow: ['#6f9bff', '#a9bccf', '#b8e0ff'] },
  ];
  const TOTAL = CHANNELS.reduce((sum, ch) => sum + ch.shots.length * ch.len, 0);
  tex.userData.paint = (t) => {
    let local = t % TOTAL;
    let ch = CHANNELS[0];
    for (const c2 of CHANNELS) {
      ch = c2;
      if (local < c2.shots.length * c2.len) break;
      local -= c2.shots.length * c2.len;
    }
    const n = Math.min(ch.shots.length - 1, Math.floor(local / ch.len));
    const into = local - n * ch.len;
    ch.shots[n](t, into);
    if (ch.cut === 'black') {
      const dip = n > 0 && into < 0.3 ? 1 - into / 0.3 : into > ch.len - 0.3 ? (into - (ch.len - 0.3)) / 0.3 : 0;
      if (dip > 0) rect(0, 0, w, h, `rgba(8,8,12,${dip.toFixed(2)})`);
    }
    ch.over(t, n, into);
    if (ch.cut === 'static' && n > 0 && into < 0.12) snow(900);
    if (local < 0.4) snow(2600); // the channel changes
    grain(t);
    tex.needsUpdate = true;
    return ch.glow[n];
  };
  tex.userData.paint(0);
  return tex;
}

function floorTex() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d7b088';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = (y / 64) % 2 ? 'rgba(120,70,30,0.06)' : 'rgba(255,255,255,0.05)';
      g.fillRect(0, y, w, 64);
      g.fillStyle = 'rgba(110,70,40,0.25)';
      g.fillRect(0, y, w, 2);
      const off = ((y / 64) * 173) % w;
      g.fillRect(off, y, 2, 64);
      g.fillRect((off + 256) % w, y, 2, 64);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

export function buildHome(world) {
  const g = new THREE.Group();
  g.name = 'home';

  /* ---- room */
  const floor = plane(32, 32, new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  g.add(plane(32, 16, mat('#f8ead6'), 0, 8, -2.05), plane(32, 1.3, mat('#ead2b2'), 0, 0.65, -2.03), box(32, 0.1, 0.08, mat('#d1b08a'), 0, 1.32, -2.0, 0.02));

  // shared surfaces: oiled wood with grain, painted trim
  const grain = woodTex(3);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const wood = sceneMat.wood('#c8935e', { map: grain });
  const woodLight = sceneMat.wood('#dcb88e', { map: grain });
  const woodDark = sceneMat.wood('#9c6a42', { map: grain });
  const paint = sceneMat.wood('#fbf8f2', { roughness: 0.45, clearcoat: 0.3 });
  const brass = sceneMat.metal('#d2ad6e', { roughness: 0.35 });
  g.add(box(32, 0.15, 0.05, paint, 0, 0.075, -2.02, 0.015)); // baseboard

  /* the window, the shelf and the clock hang on the back wall: far from the camera, always */
  setDetail(0.4);
  /* ---- window: a deep painted frame and a sill with two little pots */
  // the view outside is painted from the real time of day (sky.js)
  const glassMat = new THREE.MeshBasicMaterial({ map: world.painter.texture('home'), toneMapped: false });
  const win = group(
    plane(2.1, 1.9, glassMat),
    box(2.36, 0.15, 0.18, paint, 0, 1.02, 0.05, 0.05),
    box(0.15, 2.18, 0.18, paint, -1.11, 0, 0.05, 0.05),
    box(0.15, 2.18, 0.18, paint, 1.11, 0, 0.05, 0.05),
    box(2.1, 0.06, 0.07, paint, 0, 0, 0.03, 0.025),
    box(0.06, 1.9, 0.07, paint, 0, 0, 0.03, 0.025),
    box(2.62, 0.09, 0.36, paint, 0, -1.07, 0.15, 0.035)
  );
  const sillPlant = plant({ r: 0.1, h: 0.15, leaves: 8, len: 0.22, pot: '#e9a98f' });
  sillPlant.position.set(0.66, -1.025, 0.16);
  const cactus = group(
    latheMesh([[0, 0], [0.07, 0], [0.085, 0.11], [0.06, 0.11], [0, 0.1]], sceneMat.glossy('#f6efe2'), 24),
    ball(0.055, sceneMat.leaf('#7cbd86'), 0, 0.2, 0, 1, 1.7, 1),
    ball(0.03, sceneMat.leaf('#7cbd86'), 0.055, 0.2, 0, 1, 1.4, 1),
    ball(0.018, sceneMat.cloth('#f7b2c0'), 0, 0.31, 0)
  );
  cactus.position.set(-0.7, -1.025, 0.16);
  win.add(sillPlant, cactus);

  // curtain rod with finials and brackets; pleated curtains on rings, tied back
  const ROD = { y: 1.38, z: 0.44 };
  const rod = cyl(0.03, 0.03, 3.86, woodDark, 0, ROD.y, ROD.z, 16);
  rod.rotation.z = Math.PI / 2;
  win.add(rod);
  [-1, 1].forEach((s) => {
    win.add(ball(0.065, woodDark, s * 1.97, ROD.y, ROD.z), box(0.06, 0.12, ROD.z, woodDark, s * 1.58, ROD.y, ROD.z / 2, 0.02));
  });
  const floral = floralTex();
  floral.repeat.set(1 / 0.55, 1 / 0.55);
  const curtainM = sceneMat.cloth('#f4a9b8', { map: floral, side: THREE.DoubleSide });
  const sashM = sceneMat.cloth('#e98aa0');
  const CUR = { w: 0.86, h: 2.78, folds: 5, tie: 0.57, waist: 0.4, top: 0.86 };
  [-1, 1].forEach((s) => {
    const outer = s * 1.74;
    const dir = -s;
    const panel = new THREE.Mesh(curtainGeo({ ...CUR, depth: 0.05, dir }), curtainM);
    panel.position.set(outer, ROD.y - 0.07, ROD.z - 0.07);
    shade(panel);
    win.add(panel);
    for (let k = 0; k <= CUR.folds; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.01, seg(8, 5), seg(20, 10)), brass);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(outer + dir * (k / CUR.folds) * CUR.w * CUR.top, ROD.y, ROD.z);
      win.add(ring);
    }
    // the tie-back: a soft band round the gathered curtain, with a tassel
    const tieY = ROD.y - 0.07 - CUR.tie * CUR.h;
    const bw = CUR.w * CUR.waist;
    const band = softBox(bw + 0.08, 0.09, 0.2, sashM, { ex: 0.4, ey: 0.6 });
    band.position.set(outer + (dir * bw) / 2, tieY, ROD.z - 0.02);
    const tassel = group(ball(0.035, sashM, 0, 0, 0), cyl(0.012, 0.04, 0.12, sashM, 0, -0.09, 0, 12));
    tassel.position.set(outer + dir * 0.02, tieY - 0.07, ROD.z + 0.08);
    win.add(band, tassel);
  });
  // warm fairy lights draped in loops along the rod (glow after dark)
  const fairy = [];
  {
    const hooks = [-1.93, -0.64, 0.64, 1.93];
    const pts = [];
    for (let h = 0; h < hooks.length - 1; h++)
      for (let k = 0; k < 24; k++) {
        const u = k / 24;
        pts.push(new THREE.Vector3(hooks[h] + (hooks[h + 1] - hooks[h]) * u, ROD.y - 0.02 - 0.2 * Math.sin(Math.PI * u), ROD.z + 0.06));
      }
    pts.push(new THREE.Vector3(hooks[hooks.length - 1], ROD.y - 0.02, ROD.z + 0.06));
    const curve = new THREE.CatmullRomCurve3(pts);
    win.add(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(160, 60), 0.007, seg(5, 3), false), sceneMat.glossy('#6b5a48')));
    const tones = ['#ffd27a', '#ffe6b0', '#ffb86b'];
    const N = 19;
    for (let k = 0; k < N; k++) {
      const p = curve.getPointAt((k + 0.5) / N);
      const c = tones[k % tones.length];
      const bulbM = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: c, emissiveIntensity: 0, roughness: 0.3 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, seg(12, 6), seg(8, 4)), bulbM);
      bulb.scale.y = 1.35;
      bulb.position.set(p.x, p.y - 0.035, p.z);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      halo.scale.set(0.32, 0.32, 1);
      halo.position.copy(bulb.position);
      win.add(bulb, halo);
      fairy.push({ mat: bulbM, halo, phase: k * 1.7 });
    }
  }
  win.position.set(1.45, 3.55, -2.0);
  g.add(win);

  /* ---- wall shelf on brackets: books (one leaning), a potted plant */
  const shelf = group(box(2.0, 0.08, 0.42, wood, 0, 0, 0, 0.025));
  [-0.72, 0.72].forEach((x) => {
    const brace = box(0.05, 0.36, 0.05, woodDark, x, -0.15, -0.16, 0.015);
    const arm = box(0.05, 0.05, 0.36, woodDark, x, -0.06, -0.02, 0.015);
    const strut = box(0.04, 0.34, 0.04, woodDark, x, -0.15, -0.06, 0.012);
    strut.rotation.x = -0.75;
    shelf.add(brace, arm, strut);
  });
  let bx = -0.88;
  [
    [0.12, 0.46, '#5aa9e6'],
    [0.09, 0.4, '#f6d04d'],
    [0.14, 0.5, '#e5584f'],
    [0.1, 0.43, '#5bb36a'],
    [0.12, 0.38, '#b7a6d6'],
  ].forEach(([bw, bh, c], i) => {
    const bk = group(box(bw, bh, 0.31, sceneMat.wood(c, { roughness: 0.75, clearcoat: 0.05 }), 0, bh / 2, 0, 0.015));
    // pages at the top and a band on the spine
    bk.add(box(bw - 0.025, 0.012, 0.28, sceneMat.cloth('#fbf5e6', { grain: false }), 0, bh + 0.002, -0.01, 0.004));
    bk.add(box(bw + 0.004, 0.035, 0.012, sceneMat.wood(CC_LIGHT(c)), 0, bh * 0.78, 0.156, 0.004));
    bk.add(box(bw + 0.004, 0.02, 0.012, sceneMat.wood(CC_LIGHT(c)), 0, bh * 0.2, 0.156, 0.004));
    if (i === 4) {
      // the last one leans on its neighbour
      bk.rotation.z = -0.38;
      bk.position.set(bx + 0.1, 0.04, 0);
    } else bk.position.set(bx + bw / 2, 0.04, 0);
    bx += bw + 0.012;
    shelf.add(bk);
  });
  const shelfPlant = plant({ r: 0.13, h: 0.2, leaves: 11, len: 0.3, pot: '#fffaf0' });
  shelfPlant.position.set(0.6, 0.04, 0);
  shelf.add(shelfPlant);
  shelf.position.set(-2.0, 3.4, -1.8);
  g.add(shelf);

  // a clock on the wall (real time) and sunlight through the window
  const clock = wallClock();
  clock.group.scale.setScalar(0.85);
  clock.group.position.set(-0.78, 4.15, -2.0);
  const patch = sunPatch(2.0, 1.5);
  g.add(clock.group, patch);
  setDetail(1);

  /* ---- kotatsu: a quilted plaid blanket draped from under the table top, pooling on the
   * floor; a plump floor cushion with corner tassels; a patterned round rug */
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.0, 72), sceneMat.cloth('#f0d4ae', { map: rugTex() }));
  rug.rotation.x = -Math.PI / 2;
  rug.scale.y = 0.62;
  rug.position.set(TABLE_X, 0.022, 0.45);
  rug.receiveShadow = true;
  const rugBase = cyl(2.0, 2.0, 0.02, sceneMat.cloth('#e3c49d'), TABLE_X, 0.01, 0.45, 72);
  rugBase.scale.z = 0.62;
  g.add(rugBase, rug);
  const cushionM = sceneMat.cloth('#9fc8e8');
  const cushion = softBox(1.35, 0.22, 1.05, cushionM, { ex: 0.22, ey: 0.7, puff: 0.42 });
  cushion.position.set(TABLE_X, 0.11, -0.12);
  g.add(cushion);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      const t = group(ball(0.03, sceneMat.cloth('#6f9fc6'), 0, 0, 0), cyl(0.01, 0.035, 0.09, sceneMat.cloth('#6f9fc6'), 0, -0.05, 0, 10));
      t.position.set(TABLE_X + sx * 0.66, 0.12, -0.12 + sz * 0.51);
      t.rotation.set(sz * 0.6, 0, -sx * 0.6);
      g.add(t);
    })
  );
  const plaid = plaidTex();
  plaid.repeat.set(1 / 0.95, 1 / 0.95);
  const blanket = new THREE.Mesh(
    drape({ rect: [TABLE_X - 1.26, TABLE_X + 1.26, 0.28, 1.48], y: TABLE_TOP - 0.11, hang: [0.82, 0.82, 0.82, 0.82], thick: 0.07, r: 0.07, flare: 0.12, wave: [0.035, 7.5], cell: 0.065 }).geometry,
    sceneMat.cloth('#f2a7a0', { map: plaid })
  );
  shade(blanket);
  const top = box(2.8, 0.09, 1.42, wood, TABLE_X, TABLE_TOP - 0.045, 0.88, 0.035);
  g.add(blanket, top);

  // tangerines in a ceramic bowl (always), a mug and the TV remote; dinner while eating
  const bowl = group(
    latheMesh([[0, 0], [0.12, 0], [0.14, 0.015], [0.27, 0.12], [0.31, 0.17], [0.3, 0.185], [0.26, 0.14], [0.13, 0.04], [0, 0.04]], sceneMat.glossy('#fffaf0'), 40)
  );
  const orange = sceneMat.glossy('#f39a2e', { roughness: 0.55 });
  [[-0.1, 0.16, 0, 0], [0.12, 0.16, 0.05, 1.2], [0.0, 0.18, -0.12, 2.4], [0.02, 0.3, 0.0, 3.1]].forEach(([x, y, z, r]) => {
    const t = group(ball(0.12, orange, 0, 0, 0, 1, 0.86, 1), ball(0.018, sceneMat.leaf('#6b8f3a'), 0, 0.1, 0));
    const leaf = ball(0.05, sceneMat.leaf('#5ea56b'), 0.04, 0.105, 0, 1, 0.18, 0.5);
    leaf.rotation.z = -0.4;
    t.add(leaf);
    t.position.set(x, y, z);
    t.rotation.y = r;
    bowl.add(t);
  });
  bowl.position.set(TABLE_X - 0.95, TABLE_TOP, 0.95);
  const mug = group(
    latheMesh([[0, 0], [0.1, 0], [0.11, 0.02], [0.11, 0.22], [0.095, 0.22], [0.095, 0.04], [0, 0.04]], sceneMat.glossy('#f7d36b'), 32),
    cyl(0.094, 0.094, 0.01, sceneMat.glossy('#7a4a2a', { roughness: 0.2 }), 0, 0.18, 0)
  );
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 10, 20, Math.PI * 1.3), sceneMat.glossy('#f7d36b'));
  mugHandle.position.set(0.11, 0.11, 0);
  mugHandle.rotation.z = -Math.PI * 0.65;
  mug.add(shade(mugHandle));
  mug.position.set(TABLE_X + 0.82, TABLE_TOP, 1.12);
  const remote = group(softBox(0.11, 0.045, 0.34, sceneMat.glossy('#3f4652', { roughness: 0.4 }), { ex: 0.3, ey: 0.6 }));
  [[0, 0.1, '#e5584f'], [-0.025, 0.02, '#dfe6ee'], [0.025, 0.02, '#dfe6ee'], [0, -0.04, '#dfe6ee']].forEach(([x, z, c]) => remote.add(cyl(0.012, 0.012, 0.012, sceneMat.glossy(c), x, 0.024, z, 12)));
  remote.position.set(TABLE_X + 0.3, TABLE_TOP + 0.022, 1.34);
  remote.rotation.y = 0.35;
  // dinner: a bowl of rice and two side dishes on glazed plates
  const plateM = sceneMat.glossy('#f4efe6');
  const dish = (x, z, food) => {
    const d = group(latheMesh([[0, 0], [0.11, 0], [0.12, 0.012], [0.2, 0.035], [0.195, 0.046], [0.11, 0.022], [0, 0.022]], plateM, 32));
    for (let k = 0; k < 5; k++) d.add(ball(0.05, sceneMat.glossy(food, { roughness: 0.6 }), Math.cos(k * 2.4) * 0.05, 0.045, Math.sin(k * 2.4) * 0.05, 1, 0.55, 1));
    d.position.set(x, 0, z);
    return d;
  };
  const dinner = group(
    latheMesh([[0, 0], [0.08, 0], [0.09, 0.015], [0.16, 0.1], [0.17, 0.145], [0.155, 0.15], [0.08, 0.07], [0, 0.07]], sceneMat.glossy('#fffaf0'), 36),
    ball(0.15, sceneMat.cloth('#ffffff', { grain: false }), 0, 0.13, 0, 1, 0.42, 1),
    dish(0.42, 0.15, '#e5584f'),
    dish(-0.38, 0.2, '#5bb36a')
  );
  dinner.position.set(TABLE_X - 0.15, TABLE_TOP, 0.72);
  dinner.visible = false;
  g.add(bowl, mug, remote, dinner);
  // a little mushroom mood lamp on the corner of the kotatsu
  const capMat = sceneMat.custom({ color: '#e9784f', emissive: '#ff8f52', emissiveIntensity: 0, roughness: 0.45, clearcoat: 0.4 }, '#e9784f');
  const capGeo = new THREE.SphereGeometry(0.16, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = shade(new THREE.Mesh(capGeo, capMat));
  cap.scale.y = 0.72;
  cap.position.y = 0.16;
  const capUnder = new THREE.Mesh(new THREE.CircleGeometry(0.16, 28), sceneMat.custom({ color: '#fff1d6', emissive: '#ffd59a', emissiveIntensity: 0, roughness: 0.7, side: THREE.DoubleSide }, '#fff1d6'));
  capUnder.rotation.x = Math.PI / 2;
  capUnder.position.y = 0.161;
  const moodLamp = group(
    latheMesh([[0, 0], [0.075, 0], [0.08, 0.015], [0.055, 0.05], [0.048, 0.16], [0, 0.16]], sceneMat.glossy('#fbf3e4'), 24),
    cap,
    capUnder
  );
  [[0.06, 0.06, 0.2], [-0.07, 0.04, 1.6], [0.0, 0.09, 3.3], [0.08, 0.03, 4.4], [-0.03, 0.05, 5.4]].forEach(([r, y, a]) => {
    const dot = ball(0.022, sceneMat.glossy('#fff8ec'), Math.cos(a) * r * 1.6, 0.16 + y, Math.sin(a) * r * 1.6, 1, 0.5, 1);
    moodLamp.add(dot);
  });
  moodLamp.position.set(MOOD_LAMP[0], TABLE_TOP, MOOD_LAMP[1]);
  moodLamp.scale.setScalar(1.3);
  // the bulb sits inside the cap: it lights the table and the room, not the cap's outside
  const moodLight = new THREE.PointLight('#ffae62', 0, 3.5, 2);
  moodLight.position.set(MOOD_LAMP[0], TABLE_TOP + 0.26, MOOD_LAMP[1]);
  g.add(moodLamp, moodLight);

  setDetail(0.4); // (at the far left, turned away)
  /* ---- TV on a media cabinet; the screen faces the character at the table, not us */
  const tvScreen = new THREE.MeshPhysicalMaterial({ map: tvShow(), emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  tvScreen.emissiveMap = tvScreen.map;
  let tvDrawn = -1;
  const bezel = sceneMat.glossy('#2b3039', { roughness: 0.35 });
  const tv = group(
    // cabinet: two doors with brass knobs, on splayed legs
    box(1.9, 0.46, 0.58, wood, 0, 0.43, 0, 0.04),
    box(0.86, 0.36, 0.03, woodLight, -0.46, 0.43, 0.295, 0.02),
    box(0.86, 0.36, 0.03, woodLight, 0.46, 0.43, 0.295, 0.02),
    ball(0.03, brass, -0.1, 0.43, 0.325),
    ball(0.03, brass, 0.1, 0.43, 0.325),
    // TV: slim panel with a deeper back, on a pedestal
    box(0.52, 0.025, 0.26, bezel, 0, 0.672, 0, 0.012),
    box(0.08, 0.2, 0.05, bezel, 0, 0.77, -0.03, 0.02),
    box(1.92, 1.1, 0.05, bezel, 0, 1.38, 0, 0.025),
    box(1.3, 0.72, 0.08, bezel, 0, 1.34, -0.055, 0.035),
    plane(1.84, 1.02, tvScreen, 0, 1.38, 0.026),
    box(0.05, 0.012, 0.01, new THREE.MeshBasicMaterial({ color: '#ff6a5a' }), 0.86, 0.845, 0.027, 0.003)
  );
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      const leg = cyl(0.035, 0.022, 0.21, woodDark, sx * 0.82, 0.1, sz * 0.21, 12);
      leg.rotation.set(sz * 0.12, 0, -sx * 0.12);
      tv.add(leg);
    })
  );
  const tvPlant = plant({ r: 0.085, h: 0.13, leaves: 7, len: 0.2, pot: '#d9e6f2' });
  tvPlant.position.set(-0.74, 0.66, 0.12);
  const consoleBox = group(box(0.3, 0.07, 0.2, sceneMat.glossy('#f4f1ea'), 0, 0.035, 0, 0.02), cyl(0.012, 0.012, 0.01, sceneMat.glossy('#5aa9e6'), 0.1, 0.072, 0.06, 10));
  consoleBox.position.set(0.72, 0.66, 0.12);
  tv.add(tvPlant, consoleBox);
  tv.position.set(TV[0], 0, TV[1]);
  tv.rotation.y = Math.atan2(TABLE_X - TV[0], -TV[1]);
  g.add(tv);
  setDetail(1);
  // the screen's flickering glow on whatever is in front of it (only while it is on)
  const tvLight = new THREE.PointLight('#a9c8ff', 0, 4.5, 1.8);
  tvLight.position.set(TV[0] + 0.55, 1.4, TV[1] + 0.25);
  g.add(tvLight);

  /* ---- floor lamp: turned base, brass pole, a fabric drum shade with piped rims (lit in the evening) */
  const shadeMat = sceneMat.custom({ color: '#fff3da', emissive: '#ffcf86', emissiveIntensity: 0, roughness: 0.85, sheen: 0.5, sheenColor: '#ffffff', side: THREE.DoubleSide }, '#fff3da', { cloth: true });
  const lamp = group(
    latheMesh([[0, 0], [0.27, 0], [0.29, 0.025], [0.27, 0.06], [0.16, 0.09], [0.05, 0.12], [0, 0.12]], woodDark, 40),
    cyl(0.022, 0.022, 2.2, brass, 0, 1.2, 0, 12),
    ball(0.04, brass, 0, 2.3, 0),
    latheMesh([[0.4, 2.26], [0.37, 2.5], [0.33, 2.7], [0.27, 2.86]], shadeMat, 48)
  );
  [[0.4, 2.26], [0.27, 2.86]].forEach(([r, y]) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 48), sceneMat.cloth('#e8c99a'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    lamp.add(rim);
  });
  lamp.position.set(LAMP[0], 0, LAMP[1]);
  const lampLight = new THREE.PointLight('#ffd49a', 0, 9, 1.6);
  lampLight.position.set(LAMP[0], 2.3, LAMP[1] + 0.3);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, depthWrite: false, opacity: 0 }));
  lampGlow.scale.set(2.4, 2.4, 1);
  lampGlow.position.set(LAMP[0], 2.55, LAMP[1] + 0.2);
  g.add(lamp, lampLight, lampGlow);

  /* ---- bed: a low platform on legs, an arched headboard with a tufted panel, a mattress
   * with piping, a plump pillow; a quilted duvet folded at the foot, or draped over the
   * sleeping character (built from its body when it goes to bed) */
  g.add(box(4.35, 0.2, 2.15, wood, 4.75, 0.27, -0.95, 0.04));
  [2.72, 6.78].forEach((x) => [-1.94, 0.04].forEach((z) => g.add(cyl(0.065, 0.045, 0.18, woodDark, x, 0.09, z, 14))));
  {
    const s = new THREE.Shape();
    s.moveTo(-1.06, 0);
    s.lineTo(1.06, 0);
    s.lineTo(1.06, 1.22);
    s.quadraticCurveTo(1.06, 1.5, 0.78, 1.5);
    s.quadraticCurveTo(0, 1.78, -0.78, 1.5);
    s.quadraticCurveTo(-1.06, 1.5, -1.06, 1.22);
    s.closePath();
    const hb = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 24 }), wood);
    hb.rotation.y = Math.PI / 2;
    hb.position.set(6.8, 0.17, -0.95);
    g.add(shade(hb));
    const tuftM = sceneMat.cloth('#b7cdb0');
    const tufted = softBox(0.92, 0.14, 1.82, tuftM, { ex: 0.25, ey: 0.6, puff: 0.3 });
    tufted.rotation.z = Math.PI / 2;
    tufted.position.set(6.74, 1.16, -0.95);
    g.add(tufted);
    [0.98, 1.34].forEach((y) => [-1.6, -1.15, -0.75, -0.3].forEach((z) => g.add(ball(0.022, sceneMat.cloth('#93ae8b'), 6.665, y, z + (y > 1.2 ? 0.2 : 0)))));
  }
  const sheet = sceneMat.cloth('#fbf7ef');
  const mattress = softBox(4.1, 0.34, 1.95, sheet, { ex: 0.1, ey: 0.32, puff: 0.06 });
  mattress.position.set(4.7, 0.52, -0.95);
  g.add(mattress);
  {
    // piping round the top edge of the mattress
    const pts = [];
    const [ax, bx2, az, bz, rr] = [2.7, 6.7, -1.9, 0.0, 0.14];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const cx = Math.cos(a) > 0 ? bx2 - rr : ax + rr;
      const cz = Math.sin(a) > 0 ? bz - rr : az + rr;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, 0.66, cz + Math.sin(a) * rr));
    }
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.016, 6, true), sceneMat.cloth('#e6d7c2'));
    g.add(shade(pipe));
  }
  const pillow = softBox(1.0, 0.38, 1.3, sceneMat.cloth('#ffffff', { sheen: 0.8 }), { ex: 0.38, ey: 0.95, puff: 0.6 });
  pillow.position.set(6.1, 0.86, -0.9);
  pillow.rotation.y = 0.04;
  g.add(pillow);
  const quilt = quiltTex(4);
  quilt.repeat.set(1 / 0.5, 1 / 0.5);
  const duvetM = sceneMat.cloth('#a9c7ef', { map: quilt, bump: quilt, bumpScale: 1.6 });
  const folded = new THREE.Mesh(drape({ rect: [2.8, 3.98, -1.92, 0.02], y: 0.69, hang: [0, 0, 0.3, 0.3], thick: 0.17, r: 0.1, hemY: 0.47, wave: [0.018, 9] }).geometry, duvetM);
  g.add(shade(folded));
  // the duvet over the sleeper (geometry made in tuckIn) and its turned-down edge
  const sleeper = new THREE.Group();
  sleeper.name = 'duvet';
  const duvetMesh = shade(new THREE.Mesh(new THREE.BufferGeometry(), duvetM));
  const duvetEdge = shade(new THREE.Mesh(new THREE.BufferGeometry(), sceneMat.cloth('#fffaf0')));
  sleeper.add(duvetMesh, duvetEdge);
  sleeper.visible = false;
  g.add(sleeper);
  const zs = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zzz(), transparent: true, depthWrite: false }));
    s.userData.phase = i / 3;
    g.add(s);
    return s;
  });

  /** shape the duvet over the character as it lies now (pose settled first) */
  function tuckIn(w) {
    for (let k = 0; k < 45; k++) w.character.tick(1 / 30);
    w.holder.updateWorldMatrix(true, true);
    const neck = w.character.headPivot.getWorldPosition(new THREE.Vector3());
    const x0 = 2.66;
    const x1 = Math.max(4.4, Math.min(5.6, neck.x - 0.06));
    const [z0, z1] = [-1.92, 0.02];
    const base = 0.69;
    const field = bodyField(w.character.root, [x0, x1, z0, z1], 0.05);
    const over = clothOver(field, base, { lift: 0.06, r: 6, broad: 11 });
    // it falls over the sides of the mattress to just above the bed frame (top 0.37)
    const d = drape({ rect: [x0, x1, z0, z1], y: base, hang: [0.3, 0, 0.3, 0.34], thick: 0.1, r: 0.13, hemY: 0.47, wave: [0.035, 7], cell: 0.045, bump: (x, z) => over(x, z) - base });
    duvetMesh.geometry.dispose();
    duvetMesh.geometry = d.geometry;
    const pts = [];
    for (let k = 0; k <= 40; k++) pts.push(d.at(x1, z0 - 0.3 + (k / 40) * (z1 - z0 + 0.66), 0.05).add(new THREE.Vector3(0.02, 0, 0)));
    duvetEdge.geometry.dispose();
    duvetEdge.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.075, 12, false);
    sleeper.visible = true;
  }

  /* ---- routines */
  // under the table the legs stretch out forward, a little apart
  const legsOut = (side) => ({ hip: [-1.5, 0, side === 'L' ? -0.08 : 0.08], knee: 0.15, ankle: 0.6 });
  // how far below the shoulder the table top is (-0.12 with the original proportions)
  const reach = { y: -0.12 };
  const onTable = (side) => ({ hand: mirror([-0.1, reach.y, 0.46], side), pole: [side === 'L' ? -1 : 1, -0.6, -0.4], flex: -0.1 });
  const PHONE = [-0.1, 0.06, 0.44]; // y: above the table hands
  // the same coral-cased phone as on the subway (we see its back while the character reads)
  const phone = group(box(0.3, 0.46, 0.05, sceneMat.glossy('#f59a8b', { roughness: 0.35 }), 0, 0, 0, 0.04), plane(0.25, 0.38, new THREE.MeshBasicMaterial({ color: '#ffe3ea' }), 0, 0, 0.03), box(0.09, 0.12, 0.02, sceneMat.glossy('#2b3039', { roughness: 0.3 }), 0.07, 0.13, -0.03, 0.02));
  g.add(phone);
  const head = { x: 0, y: 0, z: 0 };
  const hour = () => new Date(world.ctx.now ? world.ctx.now() : Date.now()).getHours();
  const dinnerTime = () => {
    const h = hour();
    return h >= 18 && h < 21;
  };
  const tableActs = new Routine(world, [
    {
      id: 'eat',
      w: 2,
      dur: [8, 14],
      status: () => (dinnerTime() ? '저녁 먹는 중 :rice:' : '귤 까먹는 중 :tangerine:'),
      pose: {
        arm: (side, t) =>
          side === 'R' ? { hand: [-0.12, reach.y + 0.04 + Math.max(0, Math.sin(t * 3)) * 0.1, 0.45], pole: [1, -0.5, -0.5], flex: 0.2 } : onTable(side),
        leg: legsOut,
        head: { x: 0.12, y: 0, z: 0 },
      },
    },
    { id: 'tv', w: 3, dur: [10, 18], status: 'TV 보는 중 :tv:', pose: { arm: onTable, leg: legsOut, head: { x: 0.02, y: -0.45, z: -0.04 } } },
    {
      id: 'phone',
      w: 2,
      dur: [8, 14],
      status: '폰 보는 중 :phone:',
      pose: { arm: (side) => ({ hand: mirror([PHONE[0], reach.y + PHONE[1], PHONE[2]], side), pole: [side === 'L' ? -1 : 1, -0.7, -0.3], flex: 0.3 }), leg: legsOut, head: { x: 0.14, y: 0, z: 0 } },
    },
    { id: 'relax', w: 1.5, dur: [6, 10], status: '뒹굴뒹굴 쉬는 중 :sofa:', pose: { arm: onTable, leg: legsOut, head: { x: -0.05, y: 0.15, z: 0.1 } } },
    {
      id: 'doze',
      w: 1,
      dur: [6, 10],
      status: '꾸벅꾸벅… :zzz:',
      pose: { arm: onTable, leg: legsOut, head, eyes: 'closed' },
      update: (dt, t) => {
        head.x = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.14;
        head.z = 0.08 * Math.sin(t * 0.4);
      },
    },
  ]);
  /* morning pacing: a walk cycle while the holder slides toward a spot, then stand facing us.
   * One cycle (two steps) covers about STRIDE, so the feet do not skate. */
  const STRIDE = 0.95;
  const SPEED = 0.7;
  const walk = { x: READY[0], to: READY[0], phase: 0, moving: false, wait: 0 };
  const nextStop = () => {
    let to = walk.x;
    for (let i = 0; i < 6 && Math.abs(to - walk.x) < 0.5; i++) to = PACE[0] + Math.random() * (PACE[1] - PACE[0]);
    walk.to = to;
    walk.moving = true;
  };
  const walkLegs = (side) => {
    if (!walk.moving) return null;
    const p = walk.phase + (side === 'L' ? 0 : Math.PI);
    return { hip: [-0.42 * Math.sin(p), 0, 0], knee: 0.1 + 0.8 * Math.max(0, Math.cos(p)), ankle: 0.2 * Math.sin(p) };
  };
  const walkArms = (side) => {
    if (!walk.moving) return null;
    // each arm swings with the opposite leg
    const p = walk.phase + (side === 'L' ? Math.PI : 0);
    return { hand: mirror([0.24, -0.5, 0.05 + 0.15 * Math.sin(p)], side), pole: [side === 'L' ? -0.25 : 0.25, 0.1, -1] };
  };
  const readyActs = new Routine(world, [
    {
      id: 'pace',
      w: 3,
      dur: [6, 10],
      status: '왔다 갔다 출근 준비 중 :socks:',
      pose: { arm: walkArms, leg: walkLegs },
      enter: () => {
        walk.wait = 0;
        nextStop();
      },
      update: (dt) => {
        const d = walk.to - walk.x;
        if (Math.abs(d) < 0.02) {
          // stop for a moment (facing us), then head somewhere else
          walk.moving = false;
          walk.wait += dt;
          if (walk.wait > 1.2) {
            walk.wait = 0;
            nextStop();
          }
          return;
        }
        const step = Math.sign(d) * Math.min(Math.abs(d), SPEED * dt);
        walk.x += step;
        walk.phase += (Math.abs(step) / STRIDE) * Math.PI * 2;
      },
    },
    { id: 'idle', w: 2, dur: [4, 7], status: '출근 준비 중 :tie:', pose: null },
    { id: 'stretch', w: 1.5, dur: [3, 5], status: '기지개 쭈욱~', pose: { arm: (side) => ({ hand: mirror([0.44, 0.24, 0.12], side), pole: [side === 'L' ? -1 : 1, -1, -0.2] }), head: { x: -0.14, y: 0, z: 0 }, eyes: 'closed' } },
    { id: 'yawn', w: 1, dur: [2.5, 4], status: '하암~ 졸려', pose: { arm: null, head: { x: -0.18, y: 0, z: 0.06 }, eyes: 'closed' } },
    { id: 'look', w: 1.5, dur: [4, 6], status: '오늘 날씨 어떨까? :sun:', pose: { arm: null, head: { x: -0.06, y: -0.5, z: 0 } } },
    { id: 'wave', w: 1, dur: [2.5, 3], status: '오늘도 화이팅! :fist:', pose: null, enter: () => world.character.play('wave') },
  ]);
  // hands tucked in front of the belly so they stay under the duvet
  const tucked = (side) => ({ hand: mirror([-0.12, -0.4, 0.25], side), pole: [side === 'L' ? -1 : 1, -0.4, -0.6] });
  const curled = (side) => ({ hip: [-0.6, 0, 0], knee: side === 'L' ? 1.1 : 0.9, ankle: 0.3 });
  const sleepStatus = () => ({ tired: '지쳐서 곯아떨어졌어요 :zzz:', late: '야근하고 와서 꿀잠 자는 중 :zzz:' })[world.ctx.sleepWhy] || '쿨쿨 자는 중 :zzz:';
  const bedActs = new Routine(world, [{ id: 'sleep', w: 1, dur: [999, 999], status: sleepStatus, pose: { arm: tucked, leg: curled, head: { x: 0, y: 0, z: 0.05 }, eyes: 'closed' } }]);
  const routines = { table: tableActs, ready: readyActs, bed: bedActs };

  /* ---- lighting after dark: warm lamps on in the evening, a night light at bedtime */
  let awake = 1; // 1 lights on .. 0 asleep (eases between)
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const mixC = (target, from, a, b, t) => target.copy(cA.set(from)).lerp(cB.copy(cA.set(a)).lerp(cA.set(b), awake), t);
  function lightRoom(w, t) {
    const s = w.sky;
    if (!s) return;
    const k = s.dark; // 0 daylight .. 1 night
    const L = s.light;
    const { hemi, key, fill, rim } = w.lights;
    const A = NIGHT.sleepy;
    const B = NIGHT.cozy;
    const lerpN = (a, b) => a + (b - a) * awake;
    mixC(hemi.color, L.hemi[0], A.hemi[0], B.hemi[0], k);
    mixC(hemi.groundColor, L.hemi[1], A.hemi[1], B.hemi[1], k);
    hemi.intensity = L.hemi[2] + (lerpN(A.hemi[2], B.hemi[2]) - L.hemi[2]) * k;
    mixC(key.color, L.key[0], A.key[0], B.key[0], k);
    key.intensity = L.key[1] + (lerpN(A.key[1], B.key[1]) - L.key[1]) * k;
    fill.intensity = L.fill + (lerpN(A.fill, B.fill) - L.fill) * k;
    rim.intensity = L.rim + (lerpN(A.rim, B.rim) - L.rim) * k;
    w.scene.environmentIntensity = L.env + (lerpN(A.env, B.env) - L.env) * k;
    // what the lamps do not reach falls into a soft dusk (deeper at bedtime)
    setShadeDim(1 - k * (0.12 + 0.36 * (1 - awake)));
    // the floor lamp is the main light; at bedtime it stays on very low
    lampLight.intensity = k * (3.6 + 7.6 * awake);
    shadeMat.emissiveIntensity = k * (0.55 + 0.7 * awake);
    lampGlow.material.opacity = k * (0.5 + 0.4 * awake);
    // the mushroom lamp: a soft pool on the table, still glowing a little through the night
    moodLight.intensity = k * (0.25 + 0.75 * awake);
    capMat.emissiveIntensity = k * (0.2 + 0.4 * awake);
    capUnder.material.emissiveIntensity = k * (0.4 + 0.6 * awake);
    // fairy lights twinkle gently
    fairy.forEach((f) => {
      const tw = 0.85 + 0.15 * Math.sin(t * 1.3 + f.phase);
      f.mat.emissiveIntensity = k * (0.6 + 1.6 * awake) * tw;
      f.halo.material.opacity = k * (0.25 + 0.45 * awake) * tw;
    });
    // the TV is off at bedtime
    const tvOn = awake > 0.5;
    tvScreen.color.set(tvOn ? '#ffffff' : '#1f232b');
    tvScreen.emissiveIntensity = tvOn ? 0.25 + k * 0.55 : 0;
    tvLight.intensity = tvOn ? k * 1.6 * (0.8 + 0.2 * Math.sin(t * 7.1) * Math.sin(t * 2.3)) : 0;
    // the programme plays at about ten frames a second, and tints the light it throws
    if (tvOn && Math.abs(t - tvDrawn) >= 0.1) {
      tvDrawn = t;
      tvLight.color.set(tvScreen.map.userData.paint(t));
    }
    // darker corners (drawn by the page over the scene)
    w.ctx.vignette = k * (0.5 + 0.22 * (1 - awake));
  }

  let spot = null;
  const tmp = new THREE.Vector3();

  function place(w, s) {
    spot = s;
    w.holder.rotation.set(0, 0, 0);
    w.character.anim.yaw = 0;
    if (s === 'bed') {
      // on its side facing us, head on the pillow (char +Y -> world +X)
      w.holder.rotation.z = -Math.PI / 2;
      // a smaller head lies lower on the pillow
      w.holder.position.set(BED.head[0] - 2.56 - w.character.lift, BED.head[1] - (1 - w.character.headSize), BED.head[2]);
      w.lightAt(4.4, -0.6);
    } else if (s === 'ready') {
      w.holder.position.set(...READY);
      walk.x = walk.to = READY[0];
      walk.moving = false;
      w.lightAt(0.8, 0);
    } else {
      w.holder.position.set(TABLE_X, -SIT + w.seatShift(), 0);
      reach.y = TABLE_TOP + 0.12 - (w.holder.position.y + w.shoulderY());
      w.lightAt(0, 0);
    }
    folded.visible = s !== 'bed';
    sleeper.visible = false;
    zs.forEach((z) => (z.visible = s === 'bed'));
    const r = routines[s];
    r.cur = null;
    r.forced = null;
    r.start();
    if (s === 'bed') tuckIn(w);
  }

  return {
    group: g,
    get routine() {
      return routines[spot];
    },
    frame(aspect, ctx) {
      // the same high, pulled-back view everywhere; the camera pans between the spots
      return world.view('home_' + (ctx.spot || 'table'), aspect);
    },
    enter(ctx, w) {
      place(w, ctx.spot || 'table');
      awake = spot === 'bed' ? 0 : 1;
    },
    sky(s) {
      patch.userData.update(s, 1.45, -2.0);
      lightRoom(world, 0);
    },
    update(dt, t, ctx, w) {
      clock.set(new Date(ctx.now ? ctx.now() : Date.now()));
      const want = ctx.spot || 'table';
      if (want !== spot) place(w, want);
      // lights dim over a few seconds when it goes to bed, come back up when it gets up
      awake += ((spot === 'bed' ? 0 : 1) - awake) * Math.min(1, dt * 0.8);
      lightRoom(w, t);
      const r = routines[spot];
      r.force(ctx.act && r.list.some((a) => a.id === ctx.act) ? ctx.act : spot === 'bed' ? 'sleep' : null);
      r.update(dt, t);
      const cur = r.cur && r.cur.id;
      if (spot === 'ready') {
        // pacing: slide along, bob with the steps, turn to face the way we walk
        if (cur !== 'pace') walk.moving = false;
        const bob = walk.moving ? 0.03 * Math.abs(Math.cos(walk.phase)) : 0;
        w.holder.position.set(walk.x, bob, READY[2]);
        const face = walk.moving ? (Math.sign(walk.to - walk.x) * Math.PI) / 2 : 0;
        const a = w.character.anim;
        a.yaw += (face - a.yaw) * Math.min(1, dt * 7);
      } else if (spot === 'table') {
        // turn toward the TV while watching it
        const a = w.character.anim;
        a.yaw += ((cur === 'tv' ? TV_YAW : 0) - a.yaw) * Math.min(1, dt * 2.5);
      }
      dinner.visible = spot === 'table' && cur === 'eat' && dinnerTime();
      phone.visible = spot === 'table' && cur === 'phone';
      if (phone.visible) {
        w.handWorld('L', tmp);
        const a = tmp.clone();
        w.handWorld('R', tmp);
        // the screen turned up toward the face (we see the back), like on the subway
        phone.position.set((a.x + tmp.x) / 2, (a.y + tmp.y) / 2 + 0.2, (a.z + tmp.z) / 2 + 0.02);
        phone.rotation.set(0.45, Math.PI, 0);
      }
      if (spot === 'bed') {
        world.status(sleepStatus());
        zs.forEach((z) => {
          const u = (t * 0.28 + z.userData.phase) % 1;
          z.position.set(BED.head[0] - 0.7 - u * 0.5, BED.head[1] + 1.0 + u * 1.3, BED.head[2] + 0.6);
          const s = 0.25 + u * 0.3;
          z.scale.set(s, s, 1);
          z.material.opacity = Math.sin(u * Math.PI);
        });
      }
    },
  };
}
