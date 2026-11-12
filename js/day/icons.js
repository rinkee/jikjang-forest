/*
 * 직장의 숲 · 하루 — icons.js (the app's own little icons, instead of system emoji)
 *
 * Drawn on a 24×24 grid as rounded "stickers": warm fills from the forest palette with a
 * soft brown outline, so they read the same on the dark status bubble, the cream notes
 * and the coloured buttons, on every phone.
 *
 *   icon('house')                 -> <svg class="ic">…</svg>
 *   rich('잠자는 중 :zzz:')         -> escaped text with :name: replaced by its icon
 *   fillIcons(root)               -> fills every [data-icon] element under root
 */

const INK = '#5b3b26';
const svg = (body) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

/** a gear outline: n teeth between radii ri (valleys) and ro (tips) */
function gearPath(cx, cy, ro, ri, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = Math.PI / n;
    [
      [a - w * 0.62, ri],
      [a - w * 0.32, ro],
      [a + w * 0.32, ro],
      [a + w * 0.62, ri],
    ].forEach(([t, r]) => pts.push(`${(cx + Math.cos(t) * r).toFixed(2)} ${(cy + Math.sin(t) * r).toFixed(2)}`));
  }
  return `M${pts.join('L')}Z`;
}

/** a "Z" drawn as a thick outlined stroke */
const zee = (x, y, s) => `M${x} ${y}h${s}l${-s} ${s}h${s}`;

export const ICONS = {
  // stamina
  bolt: svg(`<path d="M13.6 2.4 5.4 13.4h5.5l-1.3 8.2 8.6-11.6h-5.6z" fill="#ffd54f"/><path d="M12 6.4 9.2 10.3" stroke="#fff6cf" stroke-width="1.3"/>`),
  // going home
  house: svg(
    `<rect x="15.3" y="3.8" width="2.8" height="4.8" rx=".6" fill="#c97b58"/>` +
      `<rect x="5" y="10.4" width="14" height="10.6" rx="1.6" fill="#fff3da"/>` +
      `<path d="M2.4 11.8 12 3.2l9.6 8.6z" fill="#ef8a6b"/>` +
      `<rect x="9.8" y="14.2" width="4.4" height="6.8" rx="2.2" fill="#7cbd86"/>` +
      `<rect x="15.4" y="13.2" width="2.6" height="2.6" rx=".5" fill="#9fd3f2"/>`
  ),
  // going to work: a little green subway car
  train: svg(
    `<path d="M7.6 18.4 5.8 21.2M16.4 18.4l1.8 2.8M4.6 21.2h14.8"/>` +
      `<rect x="4.8" y="2.6" width="14.4" height="16" rx="4.2" fill="#6cc07c"/>` +
      `<rect x="7" y="5" width="10" height="6" rx="1.8" fill="#c7ebfc"/>` +
      `<path d="M7.8 6.6 10 9.2" stroke="#ffffff" stroke-width="1.1"/>` +
      `<circle cx="8.4" cy="15.2" r="1.3" fill="#ffe27a"/><circle cx="15.6" cy="15.2" r="1.3" fill="#ffe27a"/>`
  ),
  zzz: svg(
    `<g stroke-width="4">` +
      `<path d="${zee(11.5, 3.2, 7.5)}"/><path d="${zee(4, 10.6, 5.2)}"/><path d="${zee(11.6, 17, 3.6)}"/></g>` +
      `<g stroke="#b3c0f4" stroke-width="2">` +
      `<path d="${zee(11.5, 3.2, 7.5)}"/><path d="${zee(4, 10.6, 5.2)}"/><path d="${zee(11.6, 17, 3.6)}"/></g>`
  ),
  moon: svg(
    `<path d="M9.95 5.07A8 8 0 1 0 18.76 14.97 6.8 6.8 0 0 1 9.95 5.07z" fill="#ffd96b"/>` +
      `<circle cx="7.6" cy="15.4" r="1.1" fill="#f0bd45" stroke="none"/><circle cx="10.6" cy="18.4" r=".7" fill="#f0bd45" stroke="none"/>` +
      `<path d="M18 2.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="#fff1b8" stroke-width="1"/>`
  ),
  sun: svg(
    `<path d="M9 1.9v1.8M2.4 8.8h1.8M4.3 4.1l1.3 1.3M13.7 4.1l-1.3 1.3" stroke="#f0a83a" stroke-width="1.6"/>` +
      `<circle cx="9" cy="9.2" r="4.4" fill="#ffcf4a"/>` +
      `<path d="M8.2 20.6h10.2a3.4 3.4 0 0 0 .4-6.8 4.8 4.8 0 0 0-9.2-.9 3.9 3.9 0 0 0-1.4 7.7z" fill="#fffaf0"/>`
  ),
  // a day off
  sprout: svg(
    `<ellipse cx="12" cy="20.4" rx="6" ry="1.6" fill="#c69a6a"/>` +
      `<path d="M12 20.2v-7.6"/>` +
      `<path d="M12 15.4C8 15.6 5.4 13.3 5 9.2c4-.2 6.7 2 7 6.2z" fill="#9ad68a"/>` +
      `<path d="M12 12.8c.2-4.8 3-7.7 7.6-7.9.1 4.8-2.8 7.6-7.6 7.9z" fill="#5bb36a"/>` +
      `<path d="M7.6 11.2l3 2.4M17.2 7.4l-3.4 3.4" stroke="#3f8f4f" stroke-width="1"/>`
  ),
  yawn: svg(
    `<circle cx="12" cy="12.6" r="8.8" fill="#ffd9a8"/>` +
      `<path d="M6.9 10.4q1.5 1.1 3 0M14.1 10.4q1.5 1.1 3 0"/>` +
      `<circle cx="6.8" cy="14" r="1.3" fill="#f7a8a8" stroke="none"/><circle cx="17.2" cy="14" r="1.3" fill="#f7a8a8" stroke="none"/>` +
      `<ellipse cx="12" cy="16.2" rx="2.3" ry="2.8" fill="#a5523f"/>` +
      `<path d="M10.7 17.6q1.3-1 2.6 0" stroke="#f08d8d" stroke-width="1.2"/>` +
      `<path d="M19.8 2.8c.9 1.2 1.3 2 1.3 2.6a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.4 1.3-2.6z" fill="#9fd3f2" stroke-width="1"/>`
  ),
  sofa: svg(
    `<path d="M5.8 18.2v2.2M18.2 18.2v2.2"/>` +
      `<rect x="4.6" y="6.4" width="14.8" height="8.4" rx="2.8" fill="#f2a7a0"/>` +
      `<rect x="6.4" y="12" width="11.2" height="5.4" rx="1.8" fill="#f9cbc5"/>` +
      `<rect x="2.4" y="10.2" width="4.4" height="8.2" rx="2.2" fill="#e88f86"/>` +
      `<rect x="17.2" y="10.2" width="4.4" height="8.2" rx="2.2" fill="#e88f86"/>`
  ),
  rice: svg(
    `<path d="M5 12.6c0-1.9 1.4-3.4 3.1-3.4.6-1.5 2.1-2.5 3.9-2.5s3.3 1 3.9 2.5c1.7 0 3.1 1.5 3.1 3.4z" fill="#ffffff"/>` +
      `<path d="M3.2 12.6h17.6a8.8 7.6 0 0 1-17.6 0z" fill="#8cc8ef"/>` +
      `<path d="M6.4 15.6h11.2" stroke="#ffffff" stroke-width="1.1"/>` +
      `<path d="M9 20.4h6"/>` +
      `<path d="M15.4 2.6 10.8 9.6M18.6 3.4l-5.2 6.6" stroke="#b98a5c" stroke-width="1.5"/>`
  ),
  tangerine: svg(
    `<circle cx="12" cy="13.4" r="8" fill="#f9a03c"/>` +
      `<path d="M12 5.6c.2-1.6 1.1-2.6 2.6-3"/>` +
      `<path d="M12.6 5.4c1.2-2.2 3.6-2.8 5.6-2-1 2.2-3.2 3-5.6 2z" fill="#6fb36a"/>` +
      `<path d="M7.4 11a5 5 0 0 1 2.6-2.6" stroke="#ffe7b0" stroke-width="1.5"/>` +
      `<g fill="#e2852a" stroke="none"><circle cx="15.6" cy="15.4" r=".6"/><circle cx="9.2" cy="16.6" r=".6"/><circle cx="13.2" cy="18.2" r=".6"/></g>`
  ),
  tv: svg(
    `<path d="M9 2.6l3 3.2 3-3.2"/>` +
      `<path d="M6.4 21.2l1.2-2.2M17.6 21.2l-1.2-2.2"/>` +
      `<rect x="2.8" y="6" width="18.4" height="13" rx="3" fill="#d9b48a"/>` +
      `<rect x="5" y="8.2" width="11" height="8.6" rx="1.8" fill="#bfe6fb"/>` +
      `<path d="M5.6 16.2c2-2 4.4-2.4 7-1.2 1.2.6 2.2.8 3 .6" stroke="#6fb36a" stroke-width="1.3"/>` +
      `<circle cx="18.5" cy="10.2" r=".9" fill="${INK}" stroke="none"/><circle cx="18.5" cy="13.2" r=".9" fill="${INK}" stroke="none"/>`
  ),
  phone: svg(
    `<rect x="6.2" y="2.4" width="11.6" height="19.2" rx="2.8" fill="#4a5160"/>` +
      `<rect x="7.9" y="4.6" width="8.2" height="13.4" rx="1.2" fill="#ffe3ea" stroke="none"/>` +
      `<rect x="9" y="6.4" width="5" height="2.3" rx="1.15" fill="#ffffff" stroke="none"/>` +
      `<rect x="10.2" y="9.8" width="4.8" height="2.3" rx="1.15" fill="#7cbd86" stroke="none"/>` +
      `<path d="M12 16.4l-1.7-1.6a1 1 0 0 1 1.7-1.2 1 1 0 0 1 1.7 1.2z" fill="#e07d93" stroke="none"/>` +
      `<circle cx="12" cy="19.9" r=".7" fill="#cfd5de" stroke="none"/>`
  ),
  socks: svg(
    `<path d="M7.8 3h6.8v9.4l3.8 3.1a3.1 3.1 0 0 1-3.9 4.8L8.9 15.7a3 3 0 0 1-1.1-2.3z" fill="#f7b2c0"/>` +
      `<path d="M8.4 8.2h5.6M8.4 10.8h5.6" stroke="#e07d93" stroke-width="1.5"/>` +
      `<path d="M7.8 3h6.8v2.6H7.8z" fill="#ffffff"/>` +
      `<path d="M15.4 17.2a2.6 2.6 0 0 0 2.6 2.2" stroke="#e07d93" stroke-width="1.3"/>`
  ),
  // getting dressed for work: a tie under a white collar
  tie: svg(
    `<path d="M10.6 6.2h2.8l2.6 10.4-4 4.6-4-4.6z" fill="#78bbef"/>` +
      `<path d="M11 9.6l3 2.4M10.1 13.2l4.3 3.2" stroke="#3f88c7" stroke-width="1.1"/>` +
      `<path d="M9.9 3.2h4.2l-.7 3H10.6z" fill="#5aa9e6"/>` +
      `<path d="M5.8 4.6 9.9 3.2 8.6 7.6 5.6 6.4zM18.2 4.6l-4.1-1.4 1.3 4.4 3-1.2z" fill="#ffffff"/>`
  ),
  // "fighting!": a raised fist with a little burst
  fist: svg(
    `<path d="M4.2 4.4 5.8 6.2M12 2.4v2.2M19.8 4.4l-1.6 1.8" stroke="#f0a83a" stroke-width="1.6"/>` +
      `<rect x="8.4" y="16" width="7.2" height="5.4" rx="1.2" fill="#9fd3f2"/>` +
      `<rect x="6.4" y="7.2" width="11.4" height="9.6" rx="3.4" fill="#ffd9a8"/>` +
      `<path d="M10.2 7.4v3.6M13.8 7.4v3.6"/>` +
      `<path d="M6.6 11.6c2.4-.5 4.4.5 5 2.6"/>`
  ),
  keyboard: svg(
    `<rect x="2.4" y="6.4" width="19.2" height="11.6" rx="2.6" fill="#f4f1ea"/>` +
      `<g fill="#d6cab6" stroke="none">` +
      [4.8, 7.8, 10.8, 13.8, 16.8].map((x) => `<rect x="${x}" y="8.6" width="2.4" height="2" rx=".5"/><rect x="${x}" y="11.4" width="2.4" height="2" rx=".5"/>`).join('') +
      `</g><rect x="7.6" y="14.4" width="8.8" height="1.8" rx=".9" fill="#d6cab6" stroke="none"/>`
  ),
  coffee: svg(
    `<path d="M8.2 2.8c-.9 1 .9 1.7 0 2.8M11.8 2.4c-.9 1 .9 1.7 0 2.8" stroke="#c9b8a6"/>` +
      `<path d="M16.4 10.4h1.4a2.6 2.6 0 0 1 0 5.2h-1.6"/>` +
      `<path d="M4.4 8.4h12.2v6.6a5 5 0 0 1-5 5h-2.2a5 5 0 0 1-5-5z" fill="#f7b2c0"/>` +
      `<ellipse cx="10.5" cy="8.4" rx="6.1" ry="1.3" fill="#8a5630"/>` +
      `<path d="M10.5 15.8l-1.5-1.4a.9.9 0 0 1 1.5-1.1.9.9 0 0 1 1.5 1.1z" fill="#ffffff" stroke="none"/>`
  ),
  // "hmm…": a thought bubble
  think: svg(
    `<path d="M6.6 15.2a3.6 3.6 0 0 1-.4-7.1 4.6 4.6 0 0 1 8.6-2.2 3.9 3.9 0 0 1 5 3.7 3 3 0 0 1-1.3 5.6z" fill="#fffaf0"/>` +
      `<g fill="#a68b70" stroke="none"><circle cx="9.2" cy="10.8" r="1"/><circle cx="12.6" cy="10.8" r="1"/><circle cx="16" cy="10.8" r="1"/></g>` +
      `<circle cx="6.2" cy="18.4" r="1.6" fill="#fffaf0"/><circle cx="3.6" cy="21" r=".9" fill="#fffaf0"/>`
  ),
  lunchbox: svg(
    `<rect x="2.6" y="5.6" width="18.8" height="14" rx="2.6" fill="#e5584f"/>` +
      `<rect x="4.4" y="7.4" width="15.2" height="10.4" rx="1.4" fill="#fffaf0"/>` +
      `<path d="M12 7.4v10.4M12 12.6h7.6"/>` +
      `<circle cx="8.2" cy="12.6" r="1.5" fill="#e07d93" stroke="none"/>` +
      `<rect x="13.3" y="8.8" width="5" height="2.6" rx="1" fill="#ffd54f" stroke="none"/>` +
      `<circle cx="14.6" cy="15.2" r="1.4" fill="#5bb36a" stroke="none"/><circle cx="17.3" cy="15.2" r="1.3" fill="#f39a2e" stroke="none"/>`
  ),
  // looking out of the window at the city at dusk
  city: svg(
    `<rect x="2.6" y="3.4" width="18.8" height="17.2" rx="3" fill="#ffbf91" stroke="none"/>` +
      `<circle cx="16.2" cy="9" r="2.6" fill="#ffe27a" stroke="none"/>` +
      `<path d="M2.6 13.2h3.6v-3h3.6v4.4h2.8V8.4h3.8v4.4h2.4v-1.6h2.6v6.8a3 3 0 0 1-3 3H5.6a3 3 0 0 1-3-3z" fill="#8d6aa8" stroke="none"/>` +
      `<g fill="#ffe27a" stroke="none"><rect x="6.8" y="12.2" width="1.4" height="1.4" rx=".3"/><rect x="13.6" y="10.4" width="1.4" height="1.4" rx=".3"/><rect x="13.6" y="13.4" width="1.4" height="1.4" rx=".3"/><rect x="4" y="15.4" width="1.4" height="1.4" rx=".3"/></g>` +
      `<rect x="2.6" y="3.4" width="18.8" height="17.2" rx="3"/>`
  ),
  gear: svg(`<path d="${gearPath(12, 12, 10, 7.6, 8)}" fill="#d9b48a"/><circle cx="12" cy="12" r="3.2" fill="#fff3da"/>`),
  // the volumes: music (two joined notes) and sound effects (a bell)
  music: svg(
    `<path d="M9 17V6.4l10-2.2v10.6" /><path d="M9 9.6l10-2.2" />` +
      `<ellipse cx="6.4" cy="17.2" rx="2.9" ry="2.3" fill="#5aa9e6"/><ellipse cx="16.4" cy="15" rx="2.9" ry="2.3" fill="#5aa9e6"/>`
  ),
  bell: svg(
    `<path d="M12 3.4c3.6 0 5.8 2.6 5.8 6.2 0 3.4 1 5 2.4 6.4H3.8c1.4-1.4 2.4-3 2.4-6.4 0-3.6 2.2-6.2 5.8-6.2z" fill="#ffd54f"/>` +
      `<path d="M9.8 18.6a2.3 2.3 0 0 0 4.4 0" fill="#f39a2e"/><path d="M12 2.2v1.2"/>`
  ),
  party: svg(
    `<path d="M3.6 20.4 8.6 7.4l8 8z" fill="#ffd54f"/>` +
      `<path d="M5.9 14.4l3.7 3.7M7.4 10.8l5.8 5.8" stroke="#e5584f" stroke-width="1.2"/>` +
      `<path d="M12.6 4.2c1.4.4 1.8 1.8 1 3" stroke="#5aa9e6" stroke-width="1.5"/>` +
      `<path d="M20 11.4c-1.4-.4-2.8 0-3 1.4" stroke="#e07d93" stroke-width="1.5"/>` +
      `<circle cx="17.4" cy="4.6" r="1.1" fill="#5bb36a" stroke="none"/><circle cx="20.2" cy="7.8" r=".9" fill="#f39a2e" stroke="none"/>` +
      `<rect x="14.8" y="8.2" width="1.8" height="1.8" rx=".3" fill="#b7a6d6" stroke="none" transform="rotate(20 15.7 9.1)"/>`
  ),
  palette: svg(
    `<path d="M12 3c5.2 0 9.2 3.6 9.2 7.8 0 2.6-1.8 3.8-3.8 3.8h-1.6c-1.2 0-2 1-1.6 2.1.5 1.6-.4 3.5-2.4 3.5C6.6 20.2 2.8 16.4 2.8 11.6 2.8 6.8 7 3 12 3z" fill="#e8c193"/>` +
      `<g stroke="none"><circle cx="7.4" cy="10.6" r="1.6" fill="#e5584f"/><circle cx="10.2" cy="6.8" r="1.6" fill="#ffd54f"/><circle cx="14.6" cy="6.8" r="1.6" fill="#5aa9e6"/><circle cx="17.6" cy="10" r="1.6" fill="#5bb36a"/></g>` +
      `<circle cx="8.6" cy="15.4" r="1.6" fill="#fffaf0"/>`
  ),
};

export function icon(name) {
  return ICONS[name] || '';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** text with :name: tokens -> HTML: the text is escaped, known tokens become icons */
export function rich(text) {
  return String(text ?? '')
    .split(/(:[a-z]+:)/)
    .map((part) => {
      const m = /^:([a-z]+):$/.exec(part);
      return m && ICONS[m[1]] ? ICONS[m[1]] : esc(part);
    })
    .join('');
}

/** the same text without its icons (for places that only take plain text) */
export function plain(text) {
  return String(text ?? '')
    .replace(/\s*:[a-z]+:\s*/g, ' ')
    .trim();
}

/** set el's content to rich(text); skips the work when the text has not changed */
export function setRich(el, text) {
  const t = String(text ?? '');
  if (el.__rich === t) return;
  el.__rich = t;
  el.innerHTML = rich(t);
}

/** put one icon in el (no work if it is already that icon) */
export function setIcon(el, name) {
  setRich(el, `:${name}:`);
}

/** fill every [data-icon] element under root with its icon */
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
}
