// Stránka Pro: prepínač tém (aj so zvukmi z aplikácie), rolovanie portfólia, PDF vejár,
// build, automatické screenshoty, farby a aktivita. GSAP + ScrollTrigger + Lenis (assets/vendor).
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  // ------------------------------------------------------------ témy
  var THEMES = {
    studio: { bg: "#111015", text: "#EEEBF2", dim: "#A4A0AE", acc: "#7C6CFF", font: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
      spec: { font: "Segoe UI with Palatino headings", bg: "Soft lights that slowly breathe", motion: "Smooth, unhurried", sound: "Soft pops and glassy chimes" } },
    minimal: { bg: "#0E0E0E", text: "#F2F2F2", dim: "#A6A6A6", acc: "#EDEDED", font: '"Segoe UI Light", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      spec: { font: "Segoe UI Light everywhere", bg: "Nothing. Flat and quiet", motion: "Quick and short", sound: "Barely-there ticks" } },
    terminal: { bg: "#050A06", text: "#B9FFC9", dim: "#66C27F", acc: "#33FF66", font: '"Cascadia Mono", Consolas, "Courier New", monospace',
      spec: { font: "Cascadia Mono, every single letter", bg: "CRT scanlines, vignette, a slow rolling band", motion: "Snappy, no easing", sound: "Mechanical keyboard and old-PC beeps" } },
    paper: { bg: "#F3EEE2", text: "#24211C", dim: "#5A5346", acc: "#2B54C9", font: '"Segoe Print", "Bradley Hand", "Comic Neue", cursive',
      spec: { font: "Georgia text, handwritten headings", bg: "A ruled notebook page with a red margin", motion: "Gentle, a bit slower", sound: "Pencil taps and turning pages" } },
    synthwave: { bg: "#12062A", text: "#FDEBFF", dim: "#CBA6EC", acc: "#FF3CAC", font: 'Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif',
      spec: { font: "Bahnschrift, a little bit retro-future", bg: "A setting sun and a neon grid that moves", motion: "Bouncy, everything overshoots a little", sound: "Synth arpeggios and chords" } }
  };
  var sec = $("#themes"), soundOn = $("#soundToggle"), userPicked = false, current = "studio";
  var audio = {};
  function play(t, kind) {
    if (!soundOn || !soundOn.checked) return;
    var key = t + "-" + kind;
    if (!audio[key]) { audio[key] = new Audio("assets/audio/" + key + ".wav"); audio[key].volume = 0.8; }
    try { audio[key].currentTime = 0; audio[key].play(); } catch (e) {}
  }
  function setTheme(t, withSound) {
    var d = THEMES[t];
    if (!d || !sec) return;
    current = t;
    sec.setAttribute("data-theme", t);
    sec.style.setProperty("--t-bg", d.bg);
    sec.style.setProperty("--t-text", d.text);
    sec.style.setProperty("--t-dim", d.dim);
    sec.style.setProperty("--t-acc", d.acc);
    sec.style.setProperty("--t-font", d.font);
    $$(".p-switch button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === t); });
    $$(".p-theme-shot img").forEach(function (i) { i.classList.toggle("on", i.getAttribute("data-t") === t); });
    $$("#themeSpec dd").forEach(function (dd) { dd.textContent = d.spec[dd.getAttribute("data-k")]; });
    if (withSound) play(t, "success");
    if (hasGsap && !reduce) gsap.fromTo("#themeSpec dd", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .45, stagger: .06, ease: "power2.out" });
  }
  $$(".p-switch button").forEach(function (b) {
    b.addEventListener("click", function () { userPicked = true; setTheme(b.getAttribute("data-t"), true); });
    b.addEventListener("mouseenter", function () { if (b.getAttribute("data-t") !== current) play(b.getAttribute("data-t"), "click"); });
  });
  // kým si nikto nevybral, témy sa samé striedajú (bez zvuku), keď je sekcia na obrazovke
  if (!reduce && "IntersectionObserver" in window && sec) {
    var order = ["studio", "minimal", "terminal", "paper", "synthwave"], timer = null;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !timer) timer = setInterval(function () {
          if (userPicked) { clearInterval(timer); return; }
          setTheme(order[(order.indexOf(current) + 1) % order.length], false);
        }, 3200);
        if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
      });
    }, { threshold: .45 }).observe(sec);
  }

  // ------------------------------------------------------------ farby (živý náhľad)
  $$("#swatches button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("#swatches button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("#colours").style.setProperty("--pa", getComputedStyle(b).getPropertyValue("--c"));
    });
  });
  $$("#bgs button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("#bgs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("#miniUi").setAttribute("data-bg", b.getAttribute("data-bg"));
    });
  });

  // ------------------------------------------------------------ aktivita (skutočné commity)
  var A = window.ACTIVITY, stats = { total: 0, longest: 0, week: 0, days: 0 };
  (function heat() {
    var box = $("#heat"), tip = $("#heatTip");
    if (!box || !A) return;
    var max = Math.max.apply(null, A.days.concat([1])), first = new Date(A.first + "T00:00:00"), run = 0, html = "";
    var today = Math.min(A.days.length - 1, Math.floor((Date.now() - first.getTime()) / 86400000));
    A.days.forEach(function (v, i) {
      stats.total += v;
      if (v) stats.days++;
      run = v ? run + 1 : 0;
      stats.longest = Math.max(stats.longest, run);
      if (i > today - 7 && i <= today) stats.week += v;
      var lvl = v === 0 ? 0 : Math.min(4, 1 + Math.floor(3.999 * Math.sqrt(v / max)));
      html += '<i class="l' + lvl + '" data-i="' + i + '"></i>';
    });
    box.innerHTML = html;
    box.addEventListener("mouseover", function (e) {
      var c = e.target.closest("i");
      if (!c) return;
      var i = +c.getAttribute("data-i"), v = A.days[i], d = new Date(first.getTime() + i * 86400000);
      tip.textContent = (v ? v + (v === 1 ? " commit" : " commits") : "No commits") + " · " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      var r = c.getBoundingClientRect(), pr = box.parentNode.getBoundingClientRect();
      tip.style.left = (r.left - pr.left + r.width / 2) + "px";
      tip.style.top = (r.top - pr.top) + "px";
      tip.hidden = false;
    });
    box.addEventListener("mouseleave", function () { tip.hidden = true; });
  })();
  // úspechy z galérie autora (stav ako v aplikácii)
  var ACH = [
    ["✦", "First Step", "Add your first project", 1], ["◆", "Collector", "Have 10 projects in the gallery", .8],
    ["✓", "Finisher", "Finish 5 projects", 1], ["⌘", "100K Club", "Write 100,000 lines of code", 1],
    ["❖", "Polyglot", "Code in 3 different languages", 1], ["⏱", "Marathoner", "Spend 10 hours in your programs", .02],
    ["▶", "Tester", "Launch your projects 50 times", .02], ["✪", "Showman", "Every project has a description and a screenshot", 1],
    ["⚡︎", "On a Roll", "Commit 7 days in a row", 1], ["♛", "Committer", "Make 500 commits in a year", Math.min(1, stats.total / 500)],
    ["☰", "Organizer", "Create 3 collections", 0], ["★", "Superfan", "Mark 3 favourite projects", 0]
  ];
  (function ach() {
    var box = $("#ach");
    if (!box) return;
    box.innerHTML = ACH.map(function (a) {
      var ok = a[3] >= 1;
      return '<div class="badge' + (ok ? "" : " locked") + '"><i>' + a[0] + "</i><b>" + a[1] + "</b><span>" + a[2] + "</span>" +
        (ok ? "" : '<em style="--p:' + a[3].toFixed(2) + '"></em>') + "</div>";
    }).join("");
  })();

  // ------------------------------------------------------------ build (ukážka priebehu)
  var buildLines = [
    ["", "> msbuild MazeGen.sln /p:Configuration=Release"],
    ["", "  main.cpp"],
    ["", "  MazeGen.cpp"],
    ["", "  Generating code…"],
    ["", "  Linking…"],
    ["ok", "  MazeGen.vcxproj -> x64\\Release\\MazeGen.exe"]
  ];
  function runBuild() {
    var box = $("#buildBox"), log = $("#bbLog"), bar = $("#bbBar");
    if (!box) return;
    box.classList.remove("done");
    $(".bb-state", box).textContent = "running";
    log.innerHTML = "";
    bar.style.transition = "none"; bar.style.width = "0";
    var i = 0;
    (function next() {
      if (i >= buildLines.length) {
        box.classList.add("done");
        $(".bb-state", box).textContent = "done";
        return;
      }
      var l = buildLines[i++];
      log.innerHTML += '<span class="' + l[0] + '">' + l[1].replace(/</g, "&lt;") + "</span>\n";
      bar.style.transition = "width .5s ease"; bar.style.width = (i / buildLines.length * 100) + "%";
      setTimeout(next, i === 1 ? 500 : 420);
    })();
  }

  // ------------------------------------------------------------ automatické screenshoty
  var shotTimer = null;
  function startShots() {
    var imgs = $$(".p-cam-frame img"), strip = $("#strip"), flash = $(".p-flash"), k = 0;
    if (!imgs.length || shotTimer) return;
    strip.innerHTML = "";
    function snap() {
      imgs.forEach(function (im, j) { im.classList.toggle("on", j === k); });
      if (hasGsap && !reduce) gsap.fromTo(flash, { opacity: .85 }, { opacity: 0, duration: .6, ease: "power2.out" });
      var t = document.createElement("img");
      t.src = imgs[k].src; t.alt = "";
      strip.appendChild(t);
      if (strip.children.length > 5) strip.removeChild(strip.firstChild);
      if (hasGsap && !reduce) gsap.from(t, { y: -30, opacity: 0, scale: .6, duration: .5, ease: "back.out(2)" });
      k = (k + 1) % imgs.length;
    }
    snap();
    shotTimer = setInterval(snap, 1800);
  }
  function stopShots() { if (shotTimer) { clearInterval(shotTimer); shotTimer = null; } }

  // ------------------------------------------------------------ bez animácií
  if (reduce || !hasGsap) {
    document.documentElement.classList.remove("js-anim");
    $("#actTotal").textContent = fmt(stats.total);
    $("#stLongest").textContent = stats.longest; $("#stWeek").textContent = stats.week; $("#stDays").textContent = stats.days;
    runBuild();
    var imgs = $$(".p-cam-frame img"), strip = $("#strip");
    imgs.forEach(function (im) { var t = document.createElement("img"); t.src = im.src; t.alt = ""; strip.appendChild(t); });
    return;
  }
  window.__proReady = true;
  gsap.registerPlugin(ScrollTrigger);

  var lenis = new Lenis({ lerp: 0.1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length < 2 || !$(id)) return;
      e.preventDefault();
      lenis.scrollTo($(id), { offset: -64, duration: 1.4 });
    });
  });
  gsap.to(".progress span", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: .3 } });

  // úvod: nadpis a vejár tém
  var fan = $$(".p-fan img");
  var fanPos = [
    { x: -100, y: -60, r: -12 }, { x: -45, y: -30, r: -6 }, { x: 10, y: 0, r: 0 }, { x: 65, y: 30, r: 6 }, { x: 120, y: 60, r: 12 }
  ];
  gsap.set(fan, { xPercent: -50, yPercent: -50, x: 0, y: 40, rotation: 0, opacity: 0, scale: .9 });
  var intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro.from(".p-title .line > span", { yPercent: 110, duration: 1.05, stagger: .12 })
       .fromTo(".p-title .mark", { backgroundSize: "0% 30%" }, { backgroundSize: "100% 30%", duration: .7, ease: "power2.inOut" }, "-=.35")
       .to(".reveal-up", { opacity: 1, y: 0, duration: .8, stagger: .08 }, "-=.9")
       .to(fan, {
         opacity: 1, scale: 1, duration: 1.1, stagger: .07, ease: "back.out(1.4)",
         x: function (i) { return fanPos[i].x; }, y: function (i) { return fanPos[i].y; }, rotation: function (i) { return fanPos[i].r; }
       }, "-=1.1")
       .from(".p-chips a", { y: 16, opacity: 0, duration: .5, stagger: .04 }, "-=.6");
  // vejár sa pri posune rozostúpi
  gsap.to(fan, {
    x: function (i) { return fanPos[i].x * 1.5 + 40; }, y: function (i) { return fanPos[i].y * 1.6 - 40; }, rotation: function (i) { return fanPos[i].r * 1.5; },
    ease: "none", scrollTrigger: { trigger: ".p-hero", start: "top top", end: "bottom top", scrub: true }
  });
  if (fine) {
    var hero = $(".p-hero"), fx = gsap.quickTo(".p-fan", "rotationY", { duration: .8 }), fy = gsap.quickTo(".p-fan", "rotationX", { duration: .8 });
    hero.addEventListener("mousemove", function (e) {
      fx((e.clientX / innerWidth - .5) * 14);
      fy(-(e.clientY / innerHeight - .5) * 10);
    });
  }

  // aktívny čip podľa sekcie
  var chips = $$(".p-chips a");
  chips.forEach(function (c) {
    var s = $(c.getAttribute("href"));
    if (s) ScrollTrigger.create({ trigger: s, start: "top 55%", end: "bottom 55%", onToggle: function (st) { c.classList.toggle("on", st.isActive); } });
  });

  // nadpisy a texty sekcií
  $$(".p-h").forEach(function (h) {
    if (h.closest(".p-hero")) return;
    gsap.from(h, { y: 40, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: { trigger: h, start: "top 85%" } });
  });
  gsap.from(".p-switch button", { y: 30, opacity: 0, duration: .6, stagger: .07, ease: "back.out(1.7)", scrollTrigger: { trigger: ".p-switch", start: "top 85%" } });

  // portfólio: stránka sa roluje v okne prehliadača
  var mm = gsap.matchMedia();
  mm.add("(min-width: 961px)", function () {
    var img = $("#portfolioImg"), view = $(".p-browser-view");
    gsap.to(img, {
      y: function () { return -(img.offsetHeight - view.clientHeight); }, ease: "none",
      scrollTrigger: { trigger: ".p-portfolio", start: "top top", end: "+=160%", pin: ".p-pin", scrub: .6, invalidateOnRefresh: true }
    });
  });
  mm.add("(max-width: 960px)", function () {
    var img = $("#portfolioImg"), view = $(".p-browser-view");
    gsap.to(img, { y: function () { return -(img.offsetHeight - view.clientHeight); }, ease: "none",
      scrollTrigger: { trigger: view, start: "top 80%", end: "bottom 20%", scrub: .6, invalidateOnRefresh: true } });
  });

  // PDF: strany sa vejárovito rozložia
  var pages = $$(".p-deck img");
  gsap.fromTo(pages, { x: 0, y: 0, rotation: 0 }, {
    x: function (i) { return (i - 1.5) * 46; }, y: function (i) { return (1.5 - i) * 26; }, rotation: function (i) { return (i - 1.5) * 5; },
    ease: "power2.out", scrollTrigger: { trigger: ".p-pdf", start: "top 75%", end: "center 50%", scrub: .8 }
  });
  gsap.from(".p-pdf-tag", { scale: 0, rotation: -20, duration: .6, ease: "back.out(2.5)", scrollTrigger: { trigger: ".p-deck", start: "top 60%" } });

  // build a screenshoty bežia, keď sú na obrazovke
  ScrollTrigger.create({ trigger: "#buildBox", start: "top 80%", onEnter: runBuild, onEnterBack: runBuild });
  ScrollTrigger.create({ trigger: ".p-camera", start: "top 85%", end: "bottom 15%", onToggle: function (s) { if (s.isActive) startShots(); else stopShots(); } });

  // GitHub odznaky
  $$(".p-gh-vis").forEach(function (v) {
    gsap.from(v.querySelectorAll(".gh-badge"), { scale: 0, opacity: 0, duration: .6, stagger: .15, ease: "back.out(2.2)", scrollTrigger: { trigger: v, start: "top 70%" } });
  });

  // farby: mini UI nabehne
  gsap.from(".mini-card", { y: 60, rotation: -3, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".p-mini", start: "top 80%" } });

  // aktivita
  gsap.from(".heat i", { scale: 0, opacity: 0, duration: .35, ease: "back.out(2)", stagger: { each: .0025 }, scrollTrigger: { trigger: ".heat", start: "top 82%" } });
  [["#actTotal", stats.total], ["#stLongest", stats.longest], ["#stWeek", stats.week], ["#stDays", stats.days]].forEach(function (p) {
    var el = $(p[0]), o = { v: 0 };
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: function () {
      gsap.to(o, { v: p[1], duration: 1.4, ease: "power2.out", onUpdate: function () { el.textContent = fmt(Math.round(o.v)); } });
    } });
  });
  gsap.from(".p-ach .badge", { y: 30, opacity: 0, scale: .94, duration: .5, stagger: .05, ease: "back.out(1.6)", scrollTrigger: { trigger: ".p-ach", start: "top 88%" } });

  // nákup
  gsap.from(".p-buy-card", { y: 50, opacity: 0, duration: .8, stagger: .12, ease: "power3.out", scrollTrigger: { trigger: ".p-buy-cards", start: "top 85%" } });

  // magnetické tlačidlá
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
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
})();
