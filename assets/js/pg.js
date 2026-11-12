// Project Gallery – dáta účtu a prihlásenie pre webovú galériu (window.PG). Bez knižníc.
// Relácia je zdieľaná s account.html (localStorage["pg.session"]). ?demo=1 = bez siete, dáta z pg-demo.json.
(function () {
  var S = window.SITE || {}, URL_ = S.supabaseUrl, KEY = S.supabaseKey;
  var DEMO = /[?&]demo=1(&|$)/.test(location.search);
  var SKEY = "pg.session", DKEY = "pg.demo.doc";
  var me = document.currentScript && document.currentScript.src;
  var DEMO_URL = me ? me.replace(/pg\.js(\?.*)?$/, "pg-demo.json") : "assets/js/pg-demo.json";

  var memSess = null, demoDoc = null, refreshing = null, listeners = {};

  function now() { return Math.floor(Date.now() / 1000); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  // ---------------------------------------------------------------- relácia (rovnako ako account.html)
  function readSess() {
    try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return memSess; }
  }
  function saveSess(s) {
    memSess = s;
    try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) {}
  }
  function keep(j) {
    var old = readSess();
    saveSess({
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || (Date.now() / 1000 + (j.expires_in || 3600)),
      email: (j.user && j.user.email) || (old && old.email) || ""
    });
  }

  function call(method, path, body, auth) {
    if (!URL_ || !KEY) return Promise.reject("server");
    var h = { "apikey": KEY, "Content-Type": "application/json" }, s = readSess();
    if (auth && s) h.Authorization = "Bearer " + s.access_token;
    return fetch(URL_ + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { ok: r.ok, status: r.status, j: j }; });
      }, function () { throw "net"; });
  }

  // obnova tokenu; súbežné volania zdieľajú jednu požiadavku (refresh token sa pri obnove mení)
  function refresh() {
    if (refreshing) return refreshing;
    var s = readSess();
    if (!s || !s.refresh_token) return Promise.reject("auth");
    refreshing = call("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token })
      .then(function (r) {
        refreshing = null;
        if (r.ok && r.j && r.j.access_token) { keep(r.j); return; }
        if (r.status >= 500) throw "server";
        saveSess(null);
        throw "auth";
      }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }

  function authed(method, path, body, retried) {
    if (DEMO) return Promise.reject("net");
    var s = readSess();
    if (!s || !s.refresh_token) return Promise.reject("auth");
    var fresh = s.access_token && s.expires_at - Date.now() / 1000 > 60 ? Promise.resolve() : refresh();
    return fresh.then(function () { return call(method, path, body, true); }).then(function (r) {
      if (r.status !== 401) return r;
      if (retried) { saveSess(null); throw "auth"; }
      return refresh().then(function () { return authed(method, path, body, true); });
    });
  }

  function session() {
    if (DEMO) return { email: "demo@example.com" };
    var s = readSess();
    return s && s.refresh_token ? { email: s.email || "" } : null;
  }

  function sendCode(email) {
    if (DEMO) return Promise.resolve();
    return call("POST", "/auth/v1/otp", { email: String(email || "").trim().toLowerCase(), create_user: true })
      .then(function (r) { if (!r.ok) throw "server"; });
  }

  function verify(email, code) {
    if (DEMO) return Promise.resolve(session());
    return call("POST", "/auth/v1/verify", { type: "email", email: String(email || "").trim().toLowerCase(), token: String(code || "").replace(/\D/g, "") })
      .then(function (r) {
        if (!r.ok || !r.j || !r.j.access_token) throw r.status >= 500 ? "server" : "auth";
        keep(r.j);
        return session();
      });
  }

  function signOut() {
    if (DEMO) return Promise.resolve();
    var s = readSess();
    saveSess(null);
    if (s && s.access_token && URL_) fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }).catch(function () {});
    return Promise.resolve();
  }

  // ---------------------------------------------------------------- dokument účtu
  function norm(d) {
    d = isObj(d) ? d : {};
    if (!d.v) d.v = 1;
    if (!isObj(d.projects)) d.projects = {};
    return d;
  }

  function demoLoad() {
    if (demoDoc) return Promise.resolve(clone(demoDoc));
    try {
      var saved = JSON.parse(sessionStorage.getItem(DKEY) || "null");
      if (saved && isObj(saved.data)) { demoDoc = { data: norm(saved.data), rev: +saved.rev || 0 }; return Promise.resolve(clone(demoDoc)); }
    } catch (e) {}
    return fetch(DEMO_URL).then(function (r) {
      if (!r.ok) throw "server";
      return r.json();
    }, function () { throw "net"; }).then(function (j) {
      demoDoc = { data: norm(j), rev: 1 };
      return clone(demoDoc);
    }, function (e) { throw typeof e === "string" ? e : "server"; });
  }

  function load() {
    if (DEMO) return demoLoad();
    return authed("GET", "/rest/v1/account_docs?select=data,rev").then(function (r) {
      if (!r.ok) throw "server";
      var row = Array.isArray(r.j) ? r.j[0] : null;
      return { data: norm(row ? row.data : null), rev: row ? +row.rev || 0 : 0 };
    });
  }

  function emit(ev, arg) {
    (listeners[ev] || []).slice().forEach(function (cb) { try { cb(arg); } catch (e) { setTimeout(function () { throw e; }); } });
  }

  function put(doc) {
    if (DEMO) {
      demoDoc = { data: clone(doc.data), rev: doc.rev + 1 };
      try { sessionStorage.setItem(DKEY, JSON.stringify(demoDoc)); } catch (e) {}
      return Promise.resolve({ ok: true, doc: clone(demoDoc) });
    }
    return authed("POST", "/rest/v1/rpc/put_account_doc", { p_data: doc.data, p_base_rev: doc.rev }).then(function (r) {
      if (r.ok) return { ok: true, doc: { data: doc.data, rev: +r.j || doc.rev + 1 } };
      var msg = r.j ? (r.j.message || "") + " " + (r.j.details || "") + " " + (r.j.hint || "") : "";
      if (/conflict/i.test(msg)) return { ok: false };
      if (/\bauth\b/.test(msg)) throw "auth";
      throw "server";
    });
  }

  // load → fn(data) → zápis; pri konflikte znova (spolu max 3 pokusy)
  function mutate(fn, attempt) {
    attempt = attempt || 1;
    return load().then(function (doc) {
      fn(doc.data);
      return put(doc);
    }).then(function (res) {
      if (res.ok) { emit("change", res.doc); return res.doc; }
      if (attempt >= 3) throw "conflict";
      return mutate(fn, attempt + 1);
    });
  }

  // ---------------------------------------------------------------- projekty
  var DEF = {
    name: "", shortDesc: "", description: "", features: [], tags: [], status: 0, collection: "",
    favorite: false, hidden: false, nextStep: "", version: "", notes: "", url: "", tasks: [],
    bannerMode: 0, bannerStyle: -1, bannerSeed: 0, colorA: 0, colorB: 0, bannerText: 0, bannerLabel: ""
  };
  var TASK = { text: "", state: 0, created: 0, doneAt: 0, commit: "" };

  function fallbackName(p, key) { return p.name || p.folder || String(key || "").replace(/^[a-z]+:/, "").split("/").pop() || "Untitled"; }

  // kópia meta s doplnenými predvolenými hodnotami
  function fullMeta(meta, p, key) {
    var m = isObj(meta) ? clone(meta) : {};
    Object.keys(DEF).forEach(function (k) { if (m[k] == null) m[k] = clone(DEF[k]); });
    if (!m.name) m.name = fallbackName(p, key);
    ["features", "tags", "tasks"].forEach(function (k) { if (!Array.isArray(m[k])) m[k] = []; });
    m.tasks = m.tasks.filter(isObj).map(function (t) {
      Object.keys(TASK).forEach(function (k) { if (t[k] == null) t[k] = TASK[k]; });
      return t;
    });
    return m;
  }

  // do dokumentu nezapisuj doplnené predvolené hodnoty, ktoré tam predtým neboli
  function stripDefaults(m, orig, p, key) {
    Object.keys(DEF).forEach(function (k) {
      if (orig && k in orig) return;
      var def = k === "name" ? fallbackName(p, key) : DEF[k];
      if (JSON.stringify(m[k]) === JSON.stringify(def)) delete m[k];
    });
    return m;
  }

  function projects(data) {
    var pr = (data && isObj(data.projects)) ? data.projects : {};
    return Object.keys(pr).filter(function (k) { return isObj(pr[k]); }).map(function (key) {
      var p = pr[key];
      return {
        key: key, folder: p.folder || "", remote: p.remote || "", name: p.name || "",
        t: +p.t || 0, device: p.device || "", meta: fullMeta(p.meta, p, key), info: isObj(p.info) ? clone(p.info) : {}
      };
    }).sort(function (a, b) {
      var ta = +a.info.modified || a.t, tb = +b.info.modified || b.t;
      return tb - ta || a.meta.name.localeCompare(b.meta.name);
    });
  }

  function updateProject(key, fn) {
    return mutate(function (data) {
      var p = data.projects[key];
      if (!isObj(p)) throw "server";
      var orig = isObj(p.meta) ? p.meta : null;
      var m = fullMeta(orig, p, key);
      fn(m);
      p.meta = stripDefaults(m, orig, p, key);
      p.t = now();
      p.device = "web";
    });
  }

  function randomId() {
    var a = new Uint8Array(8), s = "";
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 8; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < 8; j++) s += ("0" + a[j].toString(16)).slice(-2);
    return "web-" + s;
  }

  function addIdea(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return Promise.reject("server");
    var idea = { id: randomId(), text: text, created: now() };
    return mutate(function (data) {
      if (!Array.isArray(data.inbox)) data.inbox = [];
      data.inbox.push(idea);
    });
  }

  // ---------------------------------------------------------------- vzhľad
  // farby v appke sú ImU32 (0xAABBGGRR) – rovnako ako ColorHex() v model.cpp
  function hex(c) {
    c = c >>> 0;
    return "#" + [c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF].map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").toUpperCase();
  }
  function hsv(h, s, v) {
    h = ((h % 1) + 1) % 1;
    var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return "#" + rgb.map(function (x) { return ("0" + Math.round(x * 255).toString(16)).slice(-2); }).join("").toUpperCase();
  }
  // FNV-1a nad UTF-8 bajtmi názvu (NameHash v banner.cpp)
  function nameHash(s) {
    var b; try { b = unescape(encodeURIComponent(s || "")); } catch (e) { b = s || ""; }
    var h = 2166136261;
    for (var i = 0; i < b.length; i++) { h ^= b.charCodeAt(i) & 0xFF; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function bannerStyle(meta, name) {
    meta = meta || {};
    var a = +meta.colorA || 0, b = +meta.colorB || 0;
    if (a && b) return "linear-gradient(135deg," + hex(a) + "," + hex(b) + ")";
    var base = (+meta.bannerSeed >>> 0) || nameHash(meta.name || name || "");
    var hue = (base % 1000) / 1000;
    return "linear-gradient(135deg," + hsv(hue, 0.62, 0.92) + "," + hsv(hue + 0.09, 0.72, 0.48) + ")";
  }

  function initials(name) {
    var s = String(name || "").split(/[\s_\-.]+/).filter(Boolean).map(function (w) { return Array.from ? Array.from(w)[0] : w[0]; }).join("");
    s = (Array.from ? Array.from(s) : s.split("")).slice(0, 3).join("").toUpperCase();
    return s || "?";
  }

  var LABELS = ["Done", "In progress", "Planned", "Idea"], COLORS = ["#5FAF7A", "#D9A441", "#6B93D6", "#B57BB0"];
  function statusLabel(n) { return LABELS[n] || LABELS[0]; }
  function statusColor(n) { return COLORS[n] || "#9A9A9A"; }

  function esc(t) {
    return (t == null ? "" : String(t)).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function on(ev, cb) {
    if (typeof cb !== "function") return function () {};
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function () { var l = listeners[ev] || [], i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); };
  }

  window.PG = {
    demo: DEMO,
    session: session, sendCode: sendCode, verify: verify, signOut: signOut,
    authed: function (method, path, body) { return authed(method, path, body); },
    load: load, projects: projects, updateProject: updateProject, addIdea: addIdea,
    bannerStyle: bannerStyle, initials: initials, statusLabel: statusLabel, statusColor: statusColor,
    esc: esc, on: on
  };
})();
