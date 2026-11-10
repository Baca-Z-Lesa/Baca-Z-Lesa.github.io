// Komunita – verejné projekty zo Supabase (rovnaké dáta ako okno Komunita v appke). Bez knižníc.
(function () {
  var S = window.SITE || {};
  var $ = function (id) { return document.getElementById(id); };
  var SELECT = "id,owner,name,short_desc,description,tags,language,unity_version,status,repo_url,download_url,banner,screenshots,likes,created_at," +
               "author:public_profiles(name,avatar_url,role,github,website)";

  function api(path) {
    return fetch(S.supabaseUrl + path, { headers: { apikey: S.supabaseKey } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function hex(c, fb) { return c ? "#" + ("000000" + (c & 0xFFFFFF).toString(16)).slice(-6) : fb; }
  function tech(p) { return p.unity_version ? "Unity " + p.unity_version : (p.language || ""); }

  // banner: prvý screenshot, inak farby a text bannera z appky
  function cover(p, big) {
    var b = p.banner || {}, shot = (p.screenshots || [])[0];
    if (safeUrl(shot)) return '<div class="cm-cover' + (big ? " big" : "") + '"><img src="' + esc(shot) + '" alt="" loading="lazy"></div>';
    var a = hex(b.colorA, "#5847D9"), c = hex(b.colorB, "#16151A");
    var label = b.text === 1 && b.label ? b.label : (p.name || "").split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 3).toUpperCase();
    return '<div class="cm-cover gen' + (big ? " big" : "") + '" style="background:linear-gradient(135deg,' + a + "," + c + ')"><span>' + esc(label) + "</span></div>";
  }

  // ---------------------------------------------------------------- zoznam (explore.html)
  var all = [];
  function renderList() {
    var q = ($("q").value || "").toLowerCase().trim(), lang = $("lang").value, sort = $("sort").value;
    var list = all.filter(function (p) {
      if (lang && (p.unity_version ? "Unity" : p.language) !== lang) return false;
      if (!q) return true;
      var hay = [p.name, p.short_desc, p.language, (p.author || {}).name].concat(p.tags || []).join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (sort === "likes") list.sort(function (a, b) { return b.likes - a.likes; });
    $("count").textContent = list.length + (list.length === 1 ? " project" : " projects");
    $("grid").innerHTML = list.length ? list.map(function (p) {
      return '<a class="cm-card" href="p.html?id=' + encodeURIComponent(p.id) + '">' + cover(p) +
        '<div class="cm-body"><b>' + esc(p.name) + "</b><p>" + esc(p.short_desc) + "</p>" +
        '<div class="cm-meta">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
        "<span>" + esc((p.author || {}).name || "") + '</span><span class="cm-like">♥ ' + (p.likes || 0) + "</span></div></div></a>";
    }).join("") : '<p class="cm-empty">' + (all.length ? "Nothing found." : "No public projects yet – be the first: publish yours from the app (project ⋯ → Publish to Community).") + "</p>";
  }

  function initList() {
    ["q", "lang", "sort"].forEach(function (id) { $(id).addEventListener(id === "q" ? "input" : "change", renderList); });
    api("/rest/v1/public_projects?select=" + SELECT + "&hidden=eq.false&order=created_at.desc&limit=300").then(function (rows) {
      all = rows;
      var langs = {};
      rows.forEach(function (p) { var l = p.unity_version ? "Unity" : p.language; if (l) langs[l] = 1; });
      Object.keys(langs).sort().forEach(function (l) { var o = document.createElement("option"); o.value = l; o.textContent = l; $("lang").appendChild(o); });
      renderList();
    }).catch(function () { $("grid").innerHTML = '<p class="cm-empty">Couldn\'t load projects. Try again later.</p>'; });
  }

  // ---------------------------------------------------------------- detail (p.html)
  function initDetail() {
    var id = new URLSearchParams(location.search).get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) { $("detail").innerHTML = '<p class="cm-empty">Project not found.</p>'; return; }
    api("/rest/v1/public_projects?select=" + SELECT + "&id=eq." + id).then(function (rows) {
      var p = rows[0];
      if (!p) { $("detail").innerHTML = '<p class="cm-empty">This project isn\'t public (anymore).</p>'; return; }
      document.title = p.name + " — Project Gallery Community";
      var a = p.author || {};
      var links = "";
      if (safeUrl(p.repo_url)) links += '<a class="btn btn-ink" href="' + esc(p.repo_url) + '" target="_blank" rel="noopener">View the code ↗</a>';
      if (safeUrl(p.download_url)) links += '<a class="btn btn-line" href="' + esc(p.download_url) + '" target="_blank" rel="noopener">Download ↓</a>';
      var shots = (p.screenshots || []).filter(safeUrl).map(function (s) { return '<img src="' + esc(s) + '" alt="Screenshot" loading="lazy" data-zoom>'; }).join("");
      $("detail").innerHTML = cover(p, true) +
        '<h1 class="cm-title">' + esc(p.name) + "</h1>" +
        '<div class="cm-author">' + (safeUrl(a.avatar_url) ? '<img src="' + esc(a.avatar_url) + '" alt="">' : "<i>" + esc((a.name || "?")[0]) + "</i>") +
        "<span><b>" + esc(a.name || "Unknown author") + "</b><small>" + esc(a.role || "") + "</small></span></div>" +
        (p.short_desc ? '<p class="lede">' + esc(p.short_desc) + "</p>" : "") +
        '<div class="cm-actions">' + links + '<span class="cm-like big">♥ ' + (p.likes || 0) + '</span></div>' +
        (tech(p) || (p.tags || []).length ? '<p class="cm-tags">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
          (p.tags || []).map(function (t) { return "<span>#" + esc(t) + "</span>"; }).join("") + "</p>" : "") +
        (p.description ? '<div class="cm-desc">' + esc(p.description).replace(/\n/g, "<br>") + "</div>" : "") +
        (shots ? '<div class="cm-shots">' + shots + "</div>" : "") +
        '<p class="fine">Like it? Give it a ♥ in the app (Community). Something wrong? Report it there too.</p>';
      document.querySelectorAll("img[data-zoom]").forEach(function (img) {
        img.addEventListener("click", function () { var b = document.querySelector(".lightbox"); b.querySelector("img").src = img.src; b.hidden = false; });
      });
    }).catch(function () { $("detail").innerHTML = '<p class="cm-empty">Couldn\'t load the project. Try again later.</p>'; });
  }

  // hlavná stránka: 6 najnovších projektov, obnova každú minútu
  function initLive() {
    var load = function () {
      api("/rest/v1/public_projects?select=" + SELECT + "&hidden=eq.false&order=created_at.desc&limit=6").then(function (rows) {
        $("cmLive").innerHTML = rows.length ? rows.map(function (p) {
          return '<a class="cm-card" href="p.html?id=' + encodeURIComponent(p.id) + '">' + cover(p) +
            '<div class="cm-body"><b>' + esc(p.name) + "</b><p>" + esc(p.short_desc) + "</p>" +
            '<div class="cm-meta">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
            "<span>" + esc((p.author || {}).name || "") + '</span><span class="cm-like">♥ ' + (p.likes || 0) + "</span></div></div></a>";
        }).join("") : '<p class="cm-empty">No public projects yet – be the first.</p>';
      }).catch(function () { $("cmLive").innerHTML = "<p class='cm-empty'>Couldn&#39;t load the Community right now.</p>"; });
    };
    load();
    setInterval(load, 60000);
  }

  if ($("cmLive")) initLive();
  if ($("grid")) initList();
  if ($("detail")) initDetail();
})();
