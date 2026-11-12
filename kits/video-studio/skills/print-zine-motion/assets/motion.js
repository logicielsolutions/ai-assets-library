// print-zine-motion: helpers bound to one paused GSAP timeline.
// usage: const Z = zine(tl, { seed: 7 }); Z.boil(T); Z.kick(2.4); ...
function zine(tl, opts = {}) {
  let seed = opts.seed ?? 20261021;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // seeded: frame-exact renders
  const R = (a, b) => a + rnd() * (b - a);
  const cam = opts.cam ?? "#cam";
  const Z = { rnd, R };

  // paper grain jumps to a new offset every 2 frames ("boil on twos")
  Z.boil = (T, sel = "#grain") => {
    const offs = [[0, 0], [-26, 14], [18, -32], [-8, -12], [34, 24], [-40, 6]];
    for (let f = 0, i = 0; f < T; f += 2 / 30, i++) { const [x, y] = offs[i % offs.length]; tl.set(sel, { x, y }, f); }
  };
  // 4-frame camera hit on an action word
  Z.kick = (t, a = 14) => [[a, -a * 0.6], [-a * 0.7, a * 0.5], [a * 0.4, a * 0.3], [0, 0]].forEach(([x, y], i) => tl.set(cam, { x, y }, t + i / 30));
  // 2-frame paper flash
  Z.flash = (t, o = 0.85, sel = "#flash") => { tl.set(sel, { opacity: o }, t); tl.set(sel, { opacity: 0 }, t + 2 / 30); };
  // reset and slowly push the camera through a scene
  Z.camReset = (t) => tl.set(cam, { x: 0, y: 0, rotation: 0, scale: 1 }, t);
  Z.push = (t, d, s = 1.06) => tl.to(cam, { scale: s, duration: d, ease: "none" }, t);
  // transitions
  Z.whipIn = (sel, t, dir = 1) => tl.fromTo(sel, { x: dir * 2100, filter: "blur(24px)" }, { x: 0, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, t);
  Z.whipOut = (sel, t, dir = 1) => tl.to(sel, { x: -dir * 2100, filter: "blur(24px)", duration: 0.2, ease: "expo.in" }, t);
  Z.wipeUp = (sel, t) => tl.fromTo(sel, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.25, ease: "expo.out" }, t);
  Z.wipeDown = (sel, t) => tl.fromTo(sel, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.22, ease: "expo.out" }, t);
  Z.circleIn = (sel, t) => tl.fromTo(sel, { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(80% at 50% 50%)", duration: 0.3, ease: "expo.out" }, t);
  // giant word slam
  Z.slam = (sel, t, from = 1.9) => {
    tl.fromTo(sel, { scale: from, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.14, ease: "expo.out" }, t);
    tl.to(sel, { scale: 1.05, duration: 0.6, ease: "none" }, t + 0.14);
  };
  // a word falling in from above with a blur trail (kickers, subtitle words)
  Z.drop = (sel, t) => tl.fromTo(sel, { y: -36, opacity: 0, filter: "blur(10px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.18, ease: "expo.out" }, t - 0.02);
  // subtitle strip: words = [[time, "word", emphasis?], ...]; strip enters at `start`
  Z.sub = (sel, start, words) => {
    const box = document.querySelector(sel);
    words.forEach(([t, w, em]) => {
      const s = document.createElement("span");
      s.className = "w" + (em ? " em" : "");
      s.textContent = w;
      box.appendChild(s);
      Z.drop(s, Math.max(start + 0.02, t));
    });
    tl.fromTo(sel, { x: -60, rotation: -2 }, { x: 0, rotation: -1, duration: 0.25, ease: "expo.out" }, start);
  };
  // paper confetti burst from a container at (0,0)
  Z.confetti = (boxSel, t, n = 90) => {
    const box = document.querySelector(boxSel);
    const cols = ["#0f0f10", "#cfc2ab", "#444545", "#e3d9c8"];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.style.position = "absolute";
      const k = rnd(), col = cols[Math.floor(rnd() * cols.length)];
      if (k < 0.45) { el.style.width = R(18, 46) + "px"; el.style.height = R(10, 26) + "px"; }
      else if (k < 0.75) { const d = R(14, 30); el.style.width = d + "px"; el.style.height = d + "px"; el.style.borderRadius = "50%"; }
      else { el.style.width = R(60, 130) + "px"; el.style.height = "9px"; el.style.borderRadius = "5px"; }
      el.style.background = col;
      if (col !== "#0f0f10" && col !== "#444545") el.style.outline = "3px solid #0f0f10";
      box.appendChild(el);
      const a = rnd() * Math.PI * 2, d = R(380, 1150);
      tl.fromTo(el, { x: 0, y: 0, rotation: 0, scale: 0.2 }, { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.62 - R(40, 220), rotation: R(-540, 540), scale: 1, duration: 2.2, ease: "expo.out" }, t + (i % 6) * 0.012);
    }
  };
  // a counter (meter, stat) that shows the right value from frame 0
  // pass init=false on the 2nd+ count of the same element so frame 0 keeps the first value
  Z.count = (sel, from, to, t, d, suffix = "", init = true) => {
    const o = { v: from };
    if (init) tl.set(sel, { textContent: Math.round(from) + suffix }, 0);
    tl.fromTo(o, { v: from }, { v: to, duration: d, ease: "power2.out", immediateRender: false, onUpdate: () => { document.querySelector(sel).textContent = Math.round(o.v) + suffix; } }, t);
  };
  return Z;
}
