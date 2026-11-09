// Dynamická úvodná stránka: GSAP + ScrollTrigger + Lenis (všetko je v assets/vendor, nič sa nesťahuje z cudzích serverov).
(function () {
  var S = window.SITE || {};
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  // ------------------------------------------------------------ pevné časti (fungujú aj bez animácií)

  // bežiace pásy potrebujú obsah dvakrát za sebou
  if (!reduce) $$(".mq-track").forEach(function (t) { t.innerHTML += t.innerHTML; });

  // heatmapa zo skutočných commitov (activity.js)
  (function heatmap() {
    var box = $("#heat"), tip = $("#heatTip");
    var A = window.ACTIVITY;
    if (!box || !A) return;
    var max = Math.max.apply(null, A.days.concat([1]));
    var first = new Date(A.first + "T00:00:00");
    var html = "";
    A.days.forEach(function (v, i) {
      var lvl = v === 0 ? 0 : Math.min(4, 1 + Math.floor(3.999 * Math.sqrt(v / max)));
      html += '<i class="l' + lvl + '" data-i="' + i + '"></i>';
    });
    box.innerHTML = html;
    box.addEventListener("mouseover", function (e) {
      var c = e.target.closest("i");
      if (!c) return;
      var i = +c.getAttribute("data-i"), v = A.days[i];
      var d = new Date(first.getTime() + i * 86400000);
      tip.textContent = (v ? v + (v === 1 ? " commit" : " commits") : "No commits") + " · " +
        d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      var r = c.getBoundingClientRect(), pr = box.parentNode.getBoundingClientRect();
      tip.style.left = (r.left - pr.left + r.width / 2) + "px";
      tip.style.top = (r.top - pr.top) + "px";
      tip.hidden = false;
    });
    box.addEventListener("mouseleave", function () { tip.hidden = true; });
  })();

  // terminál v úvode: čo sa deje pri prvom spustení
  var termLines = [
    ["dim", "Project Gallery — first start"],
    ["", "scanning Documents\\Project Gallery …"],
    ["ok", "✓ Asteroid Drift        C++"],
    ["ok", "✓ Pathfinder Lab        C++"],
    ["ok", "✓ Weather CLI           Python"],
    ["ok", "✓ Portfolio Site        Web"],
    ["dim", "  … and 3 more"],
    ["y", "8 projects · 285 423 lines of code"],
    ["", "banners generated · ready"]
  ];
  function termFinal() {
    var t = $("#term");
    if (!t) return;
    t.innerHTML = termLines.map(function (l) { return '<span class="' + l[0] + '">' + l[1] + "</span>"; }).join("\n") + '\n<span class="cur"></span>';
  }
  function termType() {
    var t = $("#term");
    if (!t) return;
    var i = 0, out = "";
    (function next() {
      if (i >= termLines.length) { t.innerHTML = out + '<span class="cur"></span>'; return; }
      var l = termLines[i++], k = 0;
      var slow = l[0] === "" || l[0] === "dim";
      (function ch() {
        k += slow ? 2 : 4;
        t.innerHTML = out + '<span class="' + l[0] + '">' + l[1].slice(0, k) + '</span><span class="cur"></span>';
        if (k < l[1].length) setTimeout(ch, 16);
        else { out += '<span class="' + l[0] + '">' + l[1] + "</span>\n"; setTimeout(next, l[0] === "ok" ? 110 : 320); }
      })();
    })();
  }

  // funkcie: aktívny krok ↔ obrázok vpravo
  (function steps() {
    var steps = $$(".d-step"), shots = $$(".d-shots img"), dots = $$(".d-dots i");
    if (!steps.length || !("IntersectionObserver" in window)) { steps.forEach(function (s) { s.classList.add("on"); }); return; }
    function show(n) {
      steps.forEach(function (s, i) { s.classList.toggle("on", i === n); });
      shots.forEach(function (s, i) { s.classList.toggle("on", i === n); });
      dots.forEach(function (s, i) { s.classList.toggle("on", i === n); });
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) show(+e.target.getAttribute("data-shot")); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { io.observe(s); });
    show(0);
  })();

  // cenník: prepínač študent
  (function pricing() {
    var tg = $("#studentToggle"), price = $("#proPrice"), btn = $("#buyBtn"), desc = $("#proDesc");
    if (!tg) return;
    var proDesc = desc.textContent;
    tg.addEventListener("change", function () {
      var st = tg.checked;
      price.textContent = st ? (S.priceStudent || "2.49 €") : (S.pricePro || "4.99 €");
      btn.textContent = st ? "Buy Pro Student" : "Buy Pro";
      var url = st ? S.buyStudent : S.buyPro;
      if (url) btn.href = url;
      desc.textContent = st ? "Exactly the same Pro, half price, while you're studying (ISIC or school ID)." : proDesc;
      if (hasGsap && !reduce) gsap.fromTo(price, { yPercent: st ? 100 : -100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .45, ease: "back.out(2)" });
    });
  })();

  // bez animácií: všetko hneď v konečnom stave
  if (reduce || !hasGsap) {
    document.documentElement.classList.remove("js-anim");
    if (reduce) $$("video.d-video").forEach(function (v) { v.removeAttribute("autoplay"); v.pause(); v.controls = true; });
    $$("[data-count]").forEach(function (el) { el.textContent = fmt(+el.getAttribute("data-count")); });
    termFinal();
    return;
  }
  window.__dynReady = true;

  // ------------------------------------------------------------ animácie

  gsap.registerPlugin(ScrollTrigger);

  // plynulý scroll
  var lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var el = $(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: id === "#top" ? 0 : -70, duration: 1.4 });
    });
  });

  // ukazovateľ posunu
  gsap.to(".progress span", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: .3 } });

  // úvod
  var intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro.from(".d-title .line > span", { yPercent: 110, duration: 1.05, stagger: .12 })
       .fromTo(".mark", { backgroundSize: "0% 30%" }, { backgroundSize: "100% 30%", duration: .7, ease: "power2.inOut" }, "-=.35")
       .to(".reveal-up", { opacity: 1, y: 0, duration: .8, stagger: .08 }, "-=.95")
       .add(termType, "-=.6")
       .from(".d-frame", { y: 90, opacity: 0, duration: 1.1 }, "-=.9")
       .from(".float", { opacity: 0, scale: .85, duration: .8, stagger: .08 }, "-=.7");

  // rám s videom sa pri posune narovná
  gsap.fromTo(".d-frame", { rotateX: 20, scale: .9 }, {
    rotateX: 0, scale: 1, ease: "none",
    scrollTrigger: { trigger: ".d-stage", start: "top 90%", end: "top 10%", scrub: true }
  });
  // plávajúce karty: hĺbka pri posune + pohyb myšou
  var floats = $$(".float");
  floats.forEach(function (f, i) {
    var depth = [1.3, .8, 1.1, .6][i] || 1;
    gsap.to(f, { yPercent: -60 * depth, ease: "none", scrollTrigger: { trigger: ".d-stage", start: "top bottom", end: "bottom top", scrub: true } });
  });
  if (fine) {
    var movers = floats.map(function (f, i) {
      var d = [26, -18, 20, -14][i] || 16;
      return { x: gsap.quickTo(f, "x", { duration: .9, ease: "power3" }), y: gsap.quickTo(f, "y", { duration: .9, ease: "power3" }), d: d };
    });
    var stage = $(".d-stage");
    stage.addEventListener("mousemove", function (e) {
      var nx = e.clientX / window.innerWidth - .5, ny = e.clientY / window.innerHeight - .5;
      movers.forEach(function (m) { m.x(nx * m.d); m.y(ny * m.d); });
    });
  }

  // pred / po: neporiadok v priečinkoch sa poskladá do galérie
  var mm = gsap.matchMedia();
  mm.add("(min-width: 961px)", function () {
    var board = $(".d-board"), chips = $$(".chip", board), cards = $$(".neat .card");
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    // rozhádzanie v pevnom (opakovateľnom) poradí
    function scatter() {
      seed = 7;
      var W = board.clientWidth, H = board.clientHeight;
      chips.forEach(function (c, i) {
        var cols = 3, row = Math.floor(i / cols), col = i % cols;
        var cellW = W / cols, cellH = H / Math.ceil(chips.length / cols);
        var x = col * cellW + rnd() * Math.max(0, cellW - c.offsetWidth * .8) - 10;
        var y = row * cellH + rnd() * Math.max(0, cellH - c.offsetHeight);
        c.style.left = Math.max(-20, Math.min(W - c.offsetWidth + 20, x)) + "px";
        c.style.top = Math.max(0, Math.min(H - c.offsetHeight, y)) + "px";
        c.dataset.rot = ((rnd() - .5) * 16).toFixed(1);
      });
    }
    scatter();
    chips.forEach(function (c) { gsap.set(c, { rotation: +c.dataset.rot }); });

    function center(el) { return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 }; }

    gsap.from(".mess", { opacity: 0, y: 40, duration: .9, ease: "power3.out", scrollTrigger: { trigger: ".d-board", start: "top 80%" } });

    var tl = gsap.timeline({
      scrollTrigger: { trigger: ".d-story", start: "top top", end: "+=170%", pin: ".d-story-pin", scrub: .7, invalidateOnRefresh: true,
        onRefreshInit: scatter }
    });
    var junk = chips.filter(function (c) { return c.classList.contains("junk"); });
    tl.to(junk, {
      y: function () { return board.clientHeight * .9; },
      rotation: function (i) { return (i % 2 ? 1 : -1) * (25 + i * 7); },
      opacity: 0, duration: .45, stagger: .03, ease: "power1.in"
    }, 0);
    chips.forEach(function (c) {
      if (!c.classList.contains("real")) return;
      var card = cards[+c.getAttribute("data-card")], k = +c.getAttribute("data-card");
      var at = .32 + k * .05;
      tl.to(c, {
        x: function () { return center(card).x - center(c).x; },
        y: function () { return center(card).y - center(c).y; },
        rotation: 0, scale: function () { return card.offsetWidth / c.offsetWidth; },
        duration: .55, ease: "power2.inOut"
      }, at);
      tl.to(c, { opacity: 0, duration: .25 }, at + .25);
      tl.fromTo(card, {
        x: function () { return center(c).x - center(card).x; },
        y: function () { return center(c).y - center(card).y; },
        scale: function () { return c.offsetWidth / card.offsetWidth; },
        rotation: +c.dataset.rot, opacity: 0
      }, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, duration: .55, ease: "power2.inOut", immediateRender: true }, at);
    });
    tl.to(".swap .s1", { opacity: 0, y: -24, duration: .25 }, .55)
      .fromTo(".swap .s2", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .25 }, .62)
      .to(".d-story-p.p1", { opacity: .25, duration: .25 }, .55)
      .to(".d-story-p.p2", { opacity: 1, duration: .25 }, .62)
      .to({}, { duration: .35 });
  });

  // čísla nabehnú od nuly
  $$("[data-count]").forEach(function (el) {
    var target = +el.getAttribute("data-count"), o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: "top 88%", once: true,
      onEnter: function () {
        gsap.to(o, { v: target, duration: target > 1000 ? 2 : 1.3, ease: "power2.out", onUpdate: function () { el.textContent = fmt(Math.round(o.v)); } });
      }
    });
  });

  // nadpisy sekcií a kroky
  $$(".section-h").forEach(function (h) {
    if (h.closest(".d-story")) return;
    gsap.from(h, { y: 40, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: { trigger: h, start: "top 85%" } });
  });
  gsap.from(".nums > div", { y: 30, opacity: 0, duration: .7, stagger: .1, ease: "power3.out", scrollTrigger: { trigger: ".nums", start: "top 85%" } });

  // pro
  gsap.from(".pro-list li", { x: -24, opacity: 0, duration: .6, stagger: .07, ease: "power2.out", scrollTrigger: { trigger: ".pro-list", start: "top 80%" } });
  gsap.from(".heat i", { scale: 0, opacity: 0, duration: .35, ease: "back.out(2)", stagger: { each: .0025 }, scrollTrigger: { trigger: ".heat", start: "top 82%" } });
  gsap.from(".badge", { y: 30, opacity: 0, scale: .94, duration: .6, stagger: .1, ease: "back.out(1.6)", scrollTrigger: { trigger: ".badges", start: "top 88%" } });

  // cenník a záver
  gsap.from(".d-plan", { y: 50, opacity: 0, duration: .8, stagger: .12, ease: "power3.out", scrollTrigger: { trigger: ".d-plans", start: "top 85%" } });
  gsap.from(".steps li", { y: 30, opacity: 0, duration: .6, stagger: .1, ease: "power2.out", scrollTrigger: { trigger: ".steps", start: "top 88%" } });
  gsap.to(".d-last .underline", { backgroundSize: "100% 28%", duration: .9, ease: "power2.inOut", scrollTrigger: { trigger: ".d-last", start: "top 70%" } });

  // ako to funguje: čiara sa nakreslí, kroky naskočia
  var howPath = $(".how-line path");
  if (howPath) {
    var len = howPath.getTotalLength();
    gsap.fromTo(howPath, { strokeDasharray: len, strokeDashoffset: len }, {
      strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".how-grid", start: "top 85%", end: "top 40%", scrub: .6 }
    });
  }
  gsap.from(".how-step", { y: 50, opacity: 0, duration: .8, stagger: .15, ease: "power3.out", scrollTrigger: { trigger: ".how-grid", start: "top 82%" } });
  gsap.from(".how-n", { scale: 0, rotation: -90, duration: .7, stagger: .15, delay: .25, ease: "back.out(2)", scrollTrigger: { trigger: ".how-grid", start: "top 82%" } });

  // otázky, projekty, bezpečnosť, autor, citáty
  gsap.from(".ask-card", { y: 40, opacity: 0, duration: .8, stagger: .12, ease: "power3.out", scrollTrigger: { trigger: ".ask-grid", start: "top 85%" } });
  gsap.from(".shw-card", {
    y: 60, opacity: 0, rotation: function (i) { return i % 2 ? 3 : -3; }, duration: .8, stagger: .08, ease: "power3.out",
    scrollTrigger: { trigger: ".shw-grid", start: "top 85%" }
  });
  gsap.from(".safe-list li", { x: -24, opacity: 0, duration: .6, stagger: .08, ease: "power2.out", scrollTrigger: { trigger: ".safe-list", start: "top 85%" } });
  gsap.from(".ss-win", { y: 30, opacity: 0, rotation: 2, duration: .7, stagger: .2, ease: "back.out(1.6)", scrollTrigger: { trigger: ".ss", start: "top 82%" } });
  gsap.from(".maker-card", { y: 50, opacity: 0, rotation: -4, duration: .9, ease: "power3.out", scrollTrigger: { trigger: ".maker", start: "top 80%" } });
  if (!$("#voices").hidden) gsap.from(".v-card", { y: 40, opacity: 0, duration: .8, stagger: .12, ease: "power3.out", scrollTrigger: { trigger: ".v-grid", start: "top 85%" } });

  // „magnetické“ tlačidlá
  if (fine) {
    $$(".magnet").forEach(function (b) {
      var x = gsap.quickTo(b, "x", { duration: .5, ease: "power3" }), y = gsap.quickTo(b, "y", { duration: .5, ease: "power3" });
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * .25);
        y((e.clientY - r.top - r.height / 2) * .35);
      });
      b.addEventListener("mouseleave", function () { x(0); y(0); });
    });
  }

  // po načítaní obrázkov prepočítať pozície
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
})();
