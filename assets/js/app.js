/* Webová galéria projektov – app.html (dáta a prihlásenie cez window.PG z pg.js) */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var PG = window.PG;
  var STATUS = [0, 1, 2, 3];

  var st = { data: null, rev: null, list: [], filter: "all", q: "", lang: "", sort: "time" };
  var email = "";            // e-mail, na ktorý odišiel kód
  var openKey = null;        // kľúč otvoreného detailu
  var pushed = false;        // detail bol otvorený z galérie (Späť ho zavrie)
  var lastFocus = null;
  var editorOn = false;
  var remount = false;       // po ručnom Refresh znova pripoj editor s čerstvými dátami

  function esc(t) { return PG && PG.esc ? PG.esc(t == null ? "" : String(t)) : String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  // ---------- stavy stránky
  function show(id) {
    ["stBoot", "stSignin", "stGallery"].forEach(function (x) { $(x).hidden = x !== id; });
  }
  function boot(html) { $("stBoot").innerHTML = html; show("stBoot"); }

  if (!PG) {
    boot('<div class="ap-empty"><b>Couldn\'t start the web gallery.</b><p>Part of the page didn\'t load. Reload the page to try again.</p><button class="btn btn-ink btn-s" type="button" onclick="location.reload()">Reload</button></div>');
    return;
  }

  // ---------- prihlásenie
  function authMsg(t, ok) {
    var m = $("authMsg");
    m.textContent = t || "";
    m.hidden = !t;
    m.classList.toggle("ok", !!ok);
  }
  function busy(form, on) { form.querySelectorAll("button,input").forEach(function (b) { b.disabled = on; }); }
  function signinView(msg) {
    closeDetail(true);
    show("stSignin");
    $("fEmail").hidden = false;
    $("fCode").hidden = true;
    authMsg(msg);
  }
  function sendErr(e) {
    if (e === "net") return "Couldn't reach the server. Check your connection and try again.";
    if (e === "rate" || e === 429) return "Too many codes in a short time — wait a while and try again.";
    return "We couldn't send a code to that e-mail. Check it and try again.";
  }

  $("fEmail").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, v = $("email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { authMsg("Enter a valid e-mail address."); $("email").focus(); return; }
    busy(f, true); authMsg("");
    PG.sendCode(v).then(function () {
      busy(f, false);
      email = v;
      $("sentTo").textContent = v;
      $("code").value = "";
      f.hidden = true;
      $("fCode").hidden = false;
      $("code").focus();
    }, function (err) { busy(f, false); authMsg(sendErr(err)); });
  });

  $("fCode").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, code = $("code").value.replace(/\D/g, "");
    if (code.length !== 6) { authMsg("The code has 6 digits — check the e-mail and type it again."); $("code").focus(); return; }
    busy(f, true); authMsg("");
    PG.verify(email, code).then(function () {
      busy(f, false);
      loadGallery();
    }, function (err) {
      busy(f, false);
      authMsg(err === "net" ? sendErr("net") : "Wrong or expired code. Try again or send a new one.");
      $("code").select();
    });
  });
  $("code").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 6); });
  $("back").addEventListener("click", function () { signinView(""); $("email").focus(); });
  $("resend").addEventListener("click", function () {
    var b = this;
    b.disabled = true;
    PG.sendCode(email).then(function () { b.disabled = false; authMsg("A new code is on its way.", true); },
      function (err) { b.disabled = false; authMsg(sendErr(err)); });
  });

  // ---------- načítanie dát
  function loadGallery() {
    if (!st.data) boot('<p class="ap-loading">Loading your projects…</p>');
    else $("refresh").disabled = true;
    return PG.load().then(function (r) {
      $("refresh").disabled = false;
      remount = !$("detail").hidden;
      apply(r);
      show("stGallery");
      route();
    }, function (err) {
      $("refresh").disabled = false;
      fail(err);
    });
  }
  function fail(err) {
    if (err === "auth") {
      Promise.resolve(PG.signOut()).catch(function () {}).then(function () {
        st.data = null;
        signinView("Your session expired — sign in again.");
      });
      return;
    }
    var msg = err === "net" ? "Couldn't reach the server. Check your connection and try again." : "Something went wrong on the server. Try again in a moment.";
    if (st.data) { flash(msg); return; }   // dáta už máme – nechaj galériu, len oznám
    boot('<div class="ap-empty" role="alert"><b>Can\'t load your projects.</b><p>' + esc(msg) + '</p><button class="btn btn-ink btn-s" type="button" id="retry">Retry</button></div>');
    $("retry").addEventListener("click", loadGallery);
    $("retry").focus();
  }
  var flashT;
  function flash(t) {
    var el = $("flash");
    if (!el) { el = document.createElement("p"); el.id = "flash"; el.className = "ap-flash"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(flashT);
    flashT = setTimeout(function () { el.hidden = true; }, 5000);
  }

  function apply(r) {
    if (!r || !r.data) return;
    st.data = r.data; st.rev = r.rev;
    st.list = PG.projects(r.data) || [];
    header();
    langs();
    render();
    if (openKey) {
      var p = find(openKey);
      if (p) detailView(p); else closeDetail(true);
    }
  }
  // zmena z editora (PG.on aj onSaved) – len prekresli
  function saved(r) { apply(r); }
  if (PG.on) PG.on("change", saved);

  // ---------- hlavička
  function header() {
    var s = (st.data.settings && st.data.settings.data) || {};
    var prof = s.profile || {};
    var sess = PG.session() || {};
    var mail = sess.email || "";
    var name = (prof.name || "").trim();
    $("whoName").textContent = name || mail || "Your gallery";
    $("whoMail").textContent = name && mail ? mail : (PG.demo ? "Demo mode — changes aren't saved" : "");
    var av = $("avatar");
    if (s.avatarUrl && /^https:\/\//.test(s.avatarUrl)) av.innerHTML = '<img src="' + esc(s.avatarUrl) + '" alt="">';
    else av.textContent = ((name || mail || "?").charAt(0) || "?").toUpperCase();
    $("ideaBtn").href = "idea.html" + (PG.demo ? "?demo=1" : "");
  }

  $("refresh").addEventListener("click", loadGallery);
  $("signout").addEventListener("click", function () {
    var b = this;
    b.disabled = true;
    Promise.resolve(PG.signOut()).catch(function () {}).then(function () {
      b.disabled = false;
      st.data = null; st.list = [];
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      signinView("You're signed out.");
      $("email").focus();
    });
  });

  // ---------- pomocné
  function title(p) { return (p.meta && p.meta.name) || p.name || p.folder || p.key; }
  function when(p) { return (p.info && p.info.modified) || p.t || 0; }
  function lang(p) {
    var i = p.info || {};
    if (i.unity) return "Unity " + i.unity;
    return i.language || "";
  }
  function langKey(p) { var i = p.info || {}; return i.unity ? "Unity" : (i.language || ""); }
  function find(key) { for (var i = 0; i < st.list.length; i++) if (st.list[i].key === key) return st.list[i]; return null; }
  function statusOf(p) { var s = +p.meta.status; return STATUS.indexOf(s) < 0 ? 3 : s; }

  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
  function ago(sec) {
    if (!sec) return "";
    var d = sec - Date.now() / 1000, a = Math.abs(d);
    var u = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (var i = 0; i < u.length; i++) {
      if (a >= u[i][1]) {
        var n = Math.round(d / u[i][1]);
        return rtf ? rtf.format(n, u[i][0]) : Math.abs(n) + " " + u[i][0] + (Math.abs(n) > 1 ? "s" : "") + " ago";
      }
    }
    return "just now";
  }
  function fullDate(sec) { return sec ? new Date(sec * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""; }

  function banner(p, cls) {
    var m = p.meta, t = title(p);
    var txt = m.bannerText == 1 && m.bannerLabel ? m.bannerLabel : PG.initials(t);
    return '<div class="ap-cover ' + (cls || "") + '" style="background:' + esc(PG.bannerStyle(m, t)) + '" aria-hidden="true"><span>' + esc(txt) + "</span></div>";
  }
  function dot(s) { return '<i class="ap-dot" style="background:' + esc(PG.statusColor(s)) + '"></i>'; }

  // ---------- filtre
  function visible(p) { return !p.meta.hidden; }
  function inFilter(p, f) {
    if (f === "hidden") return !!p.meta.hidden;
    if (!visible(p)) return false;
    if (f === "all") return true;
    if (f === "fav") return !!p.meta.favorite;
    return statusOf(p) === +f.slice(1);
  }
  function side() {
    var items = [["all", "All"], ["fav", "★ Favorites"]];
    STATUS.forEach(function (s) { items.push(["s" + s, PG.statusLabel(s), s]); });
    items.push(["hidden", "Hidden"]);
    $("side").innerHTML = items.map(function (it) {
      var n = st.list.filter(function (p) { return inFilter(p, it[0]); }).length;
      if (it[0] === "hidden" && !n && st.filter !== "hidden") return "";
      return '<button type="button" class="ap-chip' + (st.filter === it[0] ? " on" : "") + '" data-f="' + it[0] + '" aria-pressed="' + (st.filter === it[0]) + '">' +
        (it.length > 2 ? dot(it[2]) : "") + "<span>" + esc(it[1]) + "</span><small>" + n + "</small></button>";
    }).join("");
  }
  $("side").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-f]");
    if (!b) return;
    st.filter = b.getAttribute("data-f");
    render();
  });

  function langs() {
    var sel = $("lang"), seen = {};
    st.list.forEach(function (p) { var k = langKey(p); if (k) seen[k] = (seen[k] || 0) + 1; });
    var keys = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
    if (st.lang && !seen[st.lang]) st.lang = "";
    sel.innerHTML = '<option value="">All languages</option>' + keys.map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === st.lang ? " selected" : "") + ">" + esc(k) + "</option>";
    }).join("");
    sel.hidden = !keys.length;
  }

  function matches(p) {
    if (!inFilter(p, st.filter)) return false;
    if (st.lang && langKey(p) !== st.lang) return false;
    if (!st.q) return true;
    var m = p.meta;
    var hay = [title(p), m.shortDesc, m.description, (m.tags || []).join(" ")].join("\n").toLowerCase();
    return st.q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function sorted(arr) {
    var a = arr.slice();
    if (st.sort === "name") a.sort(function (x, y) { return title(x).localeCompare(title(y), "en", { sensitivity: "base" }); });
    else if (st.sort === "status") a.sort(function (x, y) { return statusOf(x) - statusOf(y) || when(y) - when(x); });
    else a.sort(function (x, y) { return when(y) - when(x); });
    return a;
  }

  $("q").addEventListener("input", function () { st.q = this.value.trim().toLowerCase(); render(); });
  $("lang").addEventListener("change", function () { st.lang = this.value; render(); });
  $("sort").addEventListener("change", function () { st.sort = this.value; render(); });

  // ---------- mriežka
  function card(p) {
    var m = p.meta, s = statusOf(p), tasks = m.tasks || [];
    var done = tasks.filter(function (t) { return +t.state === 2; }).length;
    var l = lang(p), w = when(p);
    return '<a class="cm-card ap-pc" href="#p=' + encodeURIComponent(p.key) + '" data-key="' + esc(p.key) + '" aria-label="' + esc(title(p) + " — " + PG.statusLabel(s)) + '">' +
      banner(p) +
      '<div class="cm-body">' +
        '<b class="ap-name">' + (m.favorite ? '<span class="ap-star" title="Favorite">★</span> ' : "") + esc(title(p)) + "</b>" +
        "<p>" + esc(m.shortDesc || m.description || "") + "</p>" +
        '<div class="cm-meta ap-meta">' +
          '<span class="ap-st" title="' + esc(PG.statusLabel(s)) + '">' + dot(s) + '<span class="ap-sr">' + esc(PG.statusLabel(s)) + "</span></span>" +
          (l ? '<span class="cm-pill">' + esc(l) + "</span>" : "") +
          (tasks.length ? '<span title="Tasks done">✓ ' + done + "/" + tasks.length + "</span>" : "") +
          (w ? '<time class="ap-when" datetime="' + new Date(w * 1000).toISOString() + '" title="' + esc(fullDate(w)) + '">' + esc(ago(w)) + "</time>" : "") +
        "</div>" +
      "</div></a>";
  }

  function render() {
    if (!st.data) return;
    side();
    var grid = $("grid");
    var all = st.list.filter(function (p) { return !p.meta.hidden; });
    var res = sorted(st.list.filter(matches));
    $("count").textContent = st.list.length ? res.length + (res.length === 1 ? " project" : " projects") : "";
    if (!st.list.length) {
      grid.innerHTML = '<div class="ap-empty"><b>No projects yet.</b><p>Open Project Gallery on your computer and sign in – your projects sync here automatically.</p>' +
        '<a class="btn btn-ink btn-s" data-href="download" href="' + esc((window.SITE && window.SITE.download) || "#") + '">Download the app</a></div>';
      return;
    }
    if (!res.length) {
      var why = st.filter === "hidden" && !st.q && !st.lang ? "You have no hidden projects." :
                (!all.length && st.filter !== "hidden" ? "All your projects are hidden. Open “Hidden” to see them." : "Nothing matches your search or filters.");
      grid.innerHTML = '<div class="ap-empty"><b>No projects found.</b><p>' + esc(why) + '</p><button class="btn btn-line btn-s" type="button" id="clear">Clear filters</button></div>';
      $("clear").addEventListener("click", function () {
        st.q = ""; st.lang = ""; st.filter = "all";
        $("q").value = ""; $("lang").value = "";
        render();
      });
      return;
    }
    grid.innerHTML = res.map(card).join("");
  }

  // ---------- detail
  function githubUrl(remote) {
    var m = /github\.com[:\/]+([^\/\s:]+)\/([^\/\s]+?)(?:\.git)?\/?$/i.exec(remote || "");
    return m ? "https://github.com/" + m[1] + "/" + m[2] : "";
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function row(label, html) { return html ? "<div><dt>" + label + "</dt><dd>" + html + "</dd></div>" : ""; }
  function sec(label, html) { return html ? '<section class="ap-sec"><h3>' + label + "</h3>" + html + "</section>" : ""; }
  function list(arr) {
    arr = (arr || []).filter(function (x) { return x && String(x).trim(); });
    return arr.length ? "<ul>" + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "";
  }

  function detailView(p) {
    var m = p.meta, i = p.info || {}, s = statusOf(p), t = title(p);
    var gh = githubUrl(p.remote), url = safeUrl(m.url);
    var html = banner(p, "big") +
      '<div class="ap-dhead">' +
        '<h2 id="dTitle">' + (m.favorite ? '<span class="ap-star" title="Favorite">★</span> ' : "") + esc(t) + "</h2>" +
        (m.shortDesc ? '<p class="ap-short">' + esc(m.shortDesc) + "</p>" : "") +
        '<div class="ap-badges"><span class="ap-badge">' + dot(s) + esc(PG.statusLabel(s)) + "</span>" +
          (lang(p) ? '<span class="cm-pill">' + esc(lang(p)) + "</span>" : "") +
          (m.version ? '<span class="ap-badge">v' + esc(String(m.version).replace(/^v/i, "")) + "</span>" : "") +
          (m.hidden ? '<span class="ap-badge">Hidden</span>' : "") +
        "</div>" +
      "</div>" +
      '<dl class="ap-facts">' +
        row("Branch", i.branch ? "<code>" + esc(i.branch) + "</code>" : "") +
        row("Remote", p.remote ? (gh ? '<a href="' + esc(gh) + '" target="_blank" rel="noopener">' + esc(gh.replace(/^https:\/\//, "")) + "</a>" : "<code>" + esc(p.remote) + "</code>") : "") +
        row("Link", m.url ? (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\//, "")) + "</a>" : esc(m.url)) : "") +
        row("Collection", esc(m.collection || "")) +
        row("Last change", when(p) ? esc(ago(when(p))) + ' <small>' + esc(fullDate(when(p))) + (p.device ? " · " + esc(p.device === "web" ? "on the web" : p.device) : "") + "</small>" : "") +
        row("Added", i.added ? esc(fullDate(i.added)) : "") +
      "</dl>" +
      sec("Features", list(m.features));

    // keď je editor, upraviteľné polia ukazuje on (bez duplicít)
    if (!editorOn) {
      var tasks = m.tasks || [];
      var groups = [[0, "To do"], [1, "Doing"], [2, "Done"]].map(function (g) {
        var items = tasks.filter(function (x) { return (+x.state || 0) === g[0]; });
        if (!items.length) return "";
        return '<div class="ap-tg"><h4>' + g[1] + " <small>" + items.length + "</small></h4><ul>" +
          items.map(function (x) { return '<li class="ap-t' + g[0] + '">' + esc(x.text) + "</li>"; }).join("") + "</ul></div>";
      }).join("");
      html +=
        sec("Description", m.description ? '<p class="ap-pre">' + esc(m.description) + "</p>" : "") +
        sec("Tags", (m.tags || []).length ? '<div class="cm-tags">' + m.tags.map(function (x) { return "<span>#" + esc(x) + "</span>"; }).join("") + "</div>" : "") +
        sec("Next step", m.nextStep ? '<p class="ap-pre">' + esc(m.nextStep) + "</p>" : "") +
        sec("Notes", m.notes ? '<p class="ap-pre">' + esc(m.notes) + "</p>" : "") +
        sec("Tasks", groups ? '<div class="ap-tasks">' + groups + "</div>" : "");
    }
    $("dView").innerHTML = html;
  }

  function openDetail(p) {
    var box = $("detail"), panel = box.querySelector(".ap-panel"), ed = $("editor");
    var same = openKey === p.key && !box.hidden;
    openKey = p.key;
    if (!same || remount) {
      remount = false;
      unmountEditor();
      editorOn = false;
      if (window.PGEdit && typeof PGEdit.mount === "function") {
        try { PGEdit.mount(ed, p, saved); editorOn = true; }
        catch (e) { ed.innerHTML = ""; editorOn = false; if (window.console) console.warn("Editor failed to load", e); }
      }
    }
    detailView(p);
    if (box.hidden) {
      lastFocus = document.activeElement;
      box.hidden = false;
      document.body.classList.add("ap-lock");
      ["main", "top", "foot"].forEach(function (c) { var el = c === "main" ? $("main") : document.querySelector("." + c); if (el) el.inert = true; });
      panel.scrollTop = 0;
      box.querySelector(".ap-close").focus();
    }
    document.title = title(p) + " — Project Gallery";
  }
  function unmountEditor() {
    var ed = $("editor");
    if (editorOn && window.PGEdit && typeof PGEdit.unmount === "function") { try { PGEdit.unmount(ed); } catch (e) {} }
    ed.innerHTML = "";
    editorOn = false;
  }
  function closeDetail(silent) {
    var box = $("detail");
    if (box.hidden) { openKey = null; return; }
    unmountEditor();
    box.hidden = true;
    openKey = null;
    document.body.classList.remove("ap-lock");
    ["main", "top", "foot"].forEach(function (c) { var el = c === "main" ? $("main") : document.querySelector("." + c); if (el) el.inert = false; });
    document.title = "Your gallery — Project Gallery";
    if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else if (!silent) { var c = document.querySelector('.ap-pc[data-key="' + (window.CSS && CSS.escape ? CSS.escape(lastKey || "") : "") + '"]'); if (c) c.focus(); }
  }
  var lastKey = null;

  function hashKey() {
    var m = /^#p=(.+)$/.exec(location.hash);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  // zavretie z UI: ak sme detail otvorili z galérie, vráť sa v histórii
  function requestClose() {
    if (pushed) { pushed = false; history.back(); return; }
    history.replaceState(null, "", location.pathname + location.search);
    route();
  }
  function route() {
    if (!st.data || $("stGallery").hidden) return;
    var key = hashKey();
    var p = key && find(key);
    if (p) { lastKey = key; openDetail(p); }
    else {
      if (key && !p) { history.replaceState(null, "", location.pathname + location.search); flash("That project isn't in your gallery."); }
      closeDetail(false);
    }
  }
  window.addEventListener("hashchange", function () {
    if (hashKey() && $("detail").hidden) pushed = true;
    else if (!hashKey()) pushed = false;
    route();
  });

  $("detail").addEventListener("click", function (e) { if (e.target.closest("[data-close]")) requestClose(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("detail").hidden) {
      // Esc vnútri editovaného poľa najprv len opustí pole
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $("editor").contains(a)) { a.blur(); $("detail").querySelector(".ap-close").focus(); return; }
      e.preventDefault();
      requestClose();
    }
    // jednoduchý focus trap v detaile
    if (e.key === "Tab" && !$("detail").hidden) {
      var f = Array.prototype.filter.call($("detail").querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
        function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ---------- štart
  if (PG.session()) loadGallery();
  else signinView("");
})();
