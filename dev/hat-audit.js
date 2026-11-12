// Hat audit: every hat on every hairstyle. In head space, in 3-degree cells:
//   float  = the smallest gap between the hat and what is under it (hair or skin); > 0.04 = it hovers
//   poke   = hair standing out beyond the hat's outer surface in a direction the hat covers
//   bald   = share of the hair's own directions where the hair is below the skin (skin shows through)
window.__audit = async (hats, hairs) => {
  const st = window.app.state;
  const T = CC3.THREE;
  const ch = new CC3.Character({ detail: window.__auditDetail || 0.6 });
  const sc = new T.Scene();
  sc.add(ch.root);
  const v = new T.Vector3();
  const inv = new T.Matrix4();
  const N = 3;
  const cell = (q) => {
    const r = q.length();
    const el = Math.asin(Math.max(-1, Math.min(1, q.y / r))) * 57.2958;
    const az = Math.atan2(q.x, q.z) * 57.2958;
    return Math.floor((el + 90) / N) * 1000 + Math.floor((az + 180) / N);
  };
  const grid = (objs, fn) =>
    objs.forEach((o) =>
      o.traverse((x) => {
        if (!x.isMesh || !x.geometry.attributes.position) return;
        for (let p = x; p && p !== ch.head; p = p.parent) if (!p.visible) return;
        const pos = x.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(x.matrixWorld).applyMatrix4(inv);
          const r = v.length();
          if (r < 0.5) continue;
          fn(cell(v), r, x);
        }
      })
    );
  hats = hats || CC.parts.hat.map((p) => p.id).filter((h) => h !== 'none');
  hairs = hairs || CC.parts.hair.map((p) => p.id);
  const rows = [];
  for (const hat of hats) {
    for (const hair of hairs) {
      await ch.setState({ ...st, hat, hair }, { animate: false });
      for (let i = 0; i < 3; i++) sc.updateMatrixWorld(true);
      inv.copy(ch.head.matrixWorld).invert();
      const skin = new Map();
      const hairMax = new Map();
      const volMax = new Map();
      const skull = ch.head.children.filter((c) => c.name === 'skull');
      grid(skull, (c, r) => r > (skin.get(c) || 0) && skin.set(c, r));
      let flagged = false;
      ch.parts.hair.objs.forEach((o) => o.traverse((m) => (flagged = flagged || !!(m.isMesh && m.userData.hairVolume))));
      grid(ch.parts.hair.objs, (c, r, m) => {
        if (r > (hairMax.get(c) || 0)) hairMax.set(c, r);
        if ((!flagged || m.userData.hairVolume) && r > (volMax.get(c) || 0)) volMax.set(c, r);
      });
      const hmin = new Map();
      const hmax = new Map();
      grid(ch.parts.hat.objs, (c, r) => {
        if (r < (hmin.get(c) || 9)) hmin.set(c, r);
        if (r > (hmax.get(c) || 0)) hmax.set(c, r);
      });
      let fl = 9;
      let poke = 0;
      let n = 0;
      let pokeCells = 0;
      const gaps = [];
      hmin.forEach((r, c) => {
        const s = Math.max(skin.get(c) || 0, volMax.get(c) || 0);
        if (!s) return;
        n++;
        fl = Math.min(fl, r - s);
        gaps.push(r - s);
        const d = (volMax.get(c) || 0) - hmax.get(c);
        if (d > 0.015) {
          pokeCells++;
          poke = Math.max(poke, d);
        }
      });
      let bald = 0;
      let hc = 0;
      volMax.forEach((r, c) => {
        const s = skin.get(c);
        if (!s) return;
        hc++;
        if (r < s - 0.004) bald++;
      });
      let k = null;
      ch.parts.hat.objs.forEach((o) => o.traverse((x) => x.userData && x.userData.hairFit != null && (k = x.userData.hairFit)));
      rows.push({
        hat,
        hair,
        float: +fl.toFixed(3),
        // a tenth of the hat's directions are at least this close to the head
        near: +(gaps.sort((x, y) => x - y)[Math.floor(gaps.length * 0.1)] || 0).toFixed(3),
        poke: +poke.toFixed(3),
        pokeShare: +(pokeCells / Math.max(1, n)).toFixed(2),
        bald: +(bald / Math.max(1, hc)).toFixed(3),
        k: k == null ? null : +k.toFixed(2),
        pressed: !!ch.parts.hair.objs[0].userData.pressed,
      });
    }
  }
  ch.dispose();
  window.__rows = rows;
  const by = {};
  rows.forEach((r) => {
    const b = by[r.hat] || (by[r.hat] = { k: [9, 0], float: [9, -9], near: [9, -9], floaters: [], pokers: [], bald: [] });
    b.near = [Math.min(b.near[0], r.near), Math.max(b.near[1], r.near)];
    b.k = [Math.min(b.k[0], r.k), Math.max(b.k[1], r.k)];
    b.float = [Math.min(b.float[0], r.float), Math.max(b.float[1], r.float)];
    b.pressed = r.pressed;
    if (r.float > 0.04) b.floaters.push(r.hair + ':' + r.float);
    if (r.pressed && r.poke > 0.02) b.pokers.push(r.hair + ':' + r.poke + '/' + r.pokeShare);
    if (r.bald > 0.01) b.bald.push(r.hair + ':' + r.bald);
  });
  return by;
};
'ready';
