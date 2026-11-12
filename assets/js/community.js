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
  function hex(c, fb) { if (!c) return fb; c = c >>> 0; return "#" + [c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF].map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");  }  // appka ukladá ImU32 = 0xAABBGGRR
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
  var all = [], tag = new URLSearchParams(location.search).get("tag") || "";
  function renderTags() {
    var n = {};
    all.forEach(function (p) { (p.tags || []).forEach(function (t) { n[t] = (n[t] || 0) + 1; }); });
    var top = Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).slice(0, 14);
    if (tag && top.indexOf(tag) < 0) top.unshift(tag);
    $("tags").innerHTML = top.map(function (t) { return '<button type="button" data-tag="' + esc(t) + '"' + (t === tag ? ' class="on"' : "") + ">#" + esc(t) + "</button>"; }).join("");
    $("tags").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        tag = tag === b.getAttribute("data-tag") ? "" : b.getAttribute("data-tag");
        history.replaceState(null, "", tag ? "?tag=" + encodeURIComponent(tag) : location.pathname);
        renderTags(); renderList();
      });
    });
  }
  function renderList() {
    var q = ($("q").value || "").toLowerCase().trim(), lang = $("lang").value, sort = $("sort").value;
    var weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    var list = all.filter(function (p) {
      if (lang && (p.unity_version ? "Unity" : p.language) !== lang) return false;
      if (tag && (p.tags || []).indexOf(tag) < 0) return false;
      if (sort === "week" && (p.created_at || "") < weekAgo) return false;
      if (!q) return true;
      var hay = [p.name, p.short_desc, p.language, (p.author || {}).name].concat(p.tags || []).join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (sort !== "new") list.sort(function (a, b) { return b.likes - a.likes; });
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
      renderTags();
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
        '<a class="cm-author" href="u.html?id=' + encodeURIComponent(p.owner) + '">' + (safeUrl(a.avatar_url) ? '<img src="' + esc(a.avatar_url) + '" alt="">' : "<i>" + esc((a.name || "?")[0]) + "</i>") +
        "<span><b>" + esc(a.name || "Unknown author") + "</b><small>" + esc(a.role || "") + "</small></span></a>" +
        '<p class="cm-coauth" id="coauth"></p>' +
        (p.short_desc ? '<p class="lede">' + esc(p.short_desc) + "</p>" : "") +
        '<div class="cm-actions">' + links + '<span class="cm-like big">♥ ' + (p.likes || 0) + '</span></div>' +
        (tech(p) || (p.tags || []).length ? '<p class="cm-tags">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
          (p.tags || []).map(function (t) { return '<a href="explore.html?tag=' + encodeURIComponent(t) + '">#' + esc(t) + "</a>"; }).join("") + "</p>" : "") +
        (p.description ? '<div class="cm-desc">' + esc(p.description).replace(/\n/g, "<br>") + "</div>" : "") +
        (shots ? '<div class="cm-shots">' + shots + "</div>" : "") +
        '<div class="cm-comments" id="comments"></div>' +
        '<p class="fine">Like it? Give it a ♥ or leave a comment in the app (Community). Something wrong? Report it there too.</p>';
      loadExtras(p.id);
      document.querySelectorAll("img[data-zoom]").forEach(function (img) {
        img.addEventListener("click", function () { var b = document.querySelector(".lightbox"); b.querySelector("img").src = img.src; b.hidden = false; });
      });
    }).catch(function () { $("detail").innerHTML = '<p class="cm-empty">Couldn\'t load the project. Try again later.</p>'; });
  }

  // profily k zoznamu uid → {uid: profil}
  function people(ids) {
    ids = ids.filter(function (u, i) { return /^[0-9a-f-]{36}$/i.test(u) && ids.indexOf(u) === i; });
    if (!ids.length) return Promise.resolve({});
    return api("/rest/v1/public_profiles?select=user_id,name,avatar_url,role&user_id=in.(" + ids.join(",") + ")").then(function (rows) {
      var m = {};
      rows.forEach(function (r) { m[r.user_id] = r; });
      return m;
    });
  }
  function avatar(pr) { return safeUrl(pr.avatar_url) ? '<img src="' + esc(pr.avatar_url) + '" alt="">' : "<i>" + esc((pr.name || "?")[0]) + "</i>"; }

  // spoluautori a komentáre (supabase/006_social.sql; bez neho sa nič neukáže)
  function loadExtras(pid) {
    Promise.all([
      api("/rest/v1/project_collaborators?select=user_id&status=eq.accepted&project_id=eq." + pid).catch(function () { return []; }),
      api("/rest/v1/comments?select=user_id,body,created_at&project_id=eq." + pid + "&order=created_at&limit=300").catch(function () { return []; })
    ]).then(function (r) {
      var co = r[0], cm = r[1];
      return people(co.map(function (x) { return x.user_id; }).concat(cm.map(function (x) { return x.user_id; }))).then(function (pp) {
        if (co.length) $("coauth").innerHTML = "with " + co.map(function (x) {
          return '<a href="u.html?id=' + encodeURIComponent(x.user_id) + '">' + esc((pp[x.user_id] || {}).name || "co-author") + "</a>";
        }).join(", ");
        $("comments").innerHTML = "<h3>Comments" + (cm.length ? " (" + cm.length + ")" : "") + "</h3>" + (cm.length ? cm.map(function (c) {
          var pr = pp[c.user_id] || {};
          return '<div class="cm-comment">' + avatar(pr) + "<div><b>" + esc(pr.name || "Someone") + "</b><small>" + esc((c.created_at || "").slice(0, 10)) +
            "</small><p>" + esc(c.body) + "</p></div></div>";
        }).join("") : '<p class="cm-empty">No comments yet – be the first in the app.</p>');
      });
    }).catch(function () {});
  }

  // profil autora (u.html?id=…): projekty, sledovatelia, úroveň a odznaky (rovnaký výpočet ako v appke)
  function initProfile() {
    var id = new URLSearchParams(location.search).get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) { $("profile").innerHTML = '<p class="cm-empty">Creator not found.</p>'; return; }
    Promise.all([
      api("/rest/v1/public_profiles?select=user_id,name,role,bio,avatar_url,github,website&user_id=eq." + id),
      api("/rest/v1/public_projects?select=" + SELECT + "&hidden=eq.false&owner=eq." + id + "&order=created_at.desc"),
      api("/rest/v1/project_collaborators?select=project_id&status=eq.accepted&user_id=eq." + id).catch(function () { return []; }),
      api("/rest/v1/follows?select=follower&followee=eq." + id).catch(function () { return []; })
    ]).then(function (r) {
      var pr = r[0][0], own = r[1], co = r[2], followers = r[3].length;
      if (!pr) { $("profile").innerHTML = '<p class="cm-empty">Creator not found.</p>'; return; }
      var ids = co.map(function (x) { return x.project_id; });
      var more = ids.length ? api("/rest/v1/public_projects?select=" + SELECT + "&hidden=eq.false&id=in.(" + ids.join(",") + ")") : Promise.resolve([]);
      return more.then(function (cop) {
        var list = own.concat(cop), likes = 0, unity = false;
        list.forEach(function (p) { likes += p.likes || 0; unity = unity || !!p.unity_version; });
        var xp = list.length * 20 + likes * 5 + followers * 10, lvl = 1 + Math.floor(Math.sqrt(xp / 25));
        var badges = ["Level " + lvl];
        if (list.length >= 1) badges.push("First project");
        if (list.length >= 5) badges.push("Creator");
        if (likes >= 10) badges.push("Popular");
        if (likes >= 100) badges.push("Star");
        if (followers >= 10) badges.push("Followed");
        if (unity) badges.push("Unity creator");
        if (cop.length) badges.push("Team player");
        document.title = (pr.name || "Creator") + " — Project Gallery Community";
        var links = (safeUrl(pr.github) ? '<a href="' + esc(pr.github) + '" target="_blank" rel="noopener">GitHub ↗</a> ' : "") +
                    (safeUrl(pr.website) ? '<a href="' + esc(pr.website) + '" target="_blank" rel="noopener">Website ↗</a>' : "");
        $("profile").innerHTML = '<div class="cm-profile">' + (safeUrl(pr.avatar_url) ? '<img class="av" src="' + esc(pr.avatar_url) + '" alt="">' : '<i class="av">' + esc((pr.name || "?")[0]) + "</i>") +
          "<div><h1>" + esc(pr.name || "Unknown creator") + "</h1>" + (pr.role ? "<p>" + esc(pr.role) + "</p>" : "") +
          '<p class="stats">' + list.length + " projects · ♥ " + likes + " · " + followers + " followers</p>" +
          '<div class="cm-badges">' + badges.map(function (b, i) { return "<span" + (i ? "" : ' class="lvl"') + ">" + esc(b) + "</span>"; }).join("") + "</div>" +
          (links ? "<p>" + links + "</p>" : "") + "</div></div>" + (pr.bio ? '<p class="cm-desc">' + esc(pr.bio).replace(/\n/g, "<br>") + "</p>" : "");
        $("ugrid").innerHTML = list.length ? list.map(function (p) {
          return '<a class="cm-card" href="p.html?id=' + encodeURIComponent(p.id) + '">' + cover(p) +
            '<div class="cm-body"><b>' + esc(p.name) + "</b><p>" + esc(p.short_desc) + "</p>" +
            '<div class="cm-meta">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
            '<span class="cm-like">♥ ' + (p.likes || 0) + "</span></div></div></a>";
        }).join("") : '<p class="cm-empty">No public projects yet.</p>';
      });
    }).catch(function () { $("profile").innerHTML = "<p class='cm-empty'>Couldn&#39;t load this creator. Try again later.</p>"; });
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

  // trendy (trends.html): hot tento týždeň, populárne štítky, top autori
  function card(p) {
    return '<a class="cm-card" href="p.html?id=' + encodeURIComponent(p.id) + '">' + cover(p) +
      '<div class="cm-body"><b>' + esc(p.name) + "</b><p>" + esc(p.short_desc) + "</p>" +
      '<div class="cm-meta">' + (tech(p) ? '<span class="cm-pill">' + esc(tech(p)) + "</span>" : "") +
      "<span>" + esc((p.author || {}).name || "") + '</span><span class="cm-like">♥ ' + (p.likes || 0) + "</span></div></div></a>";
  }
  function initTrends() {
    api("/rest/v1/public_projects?select=" + SELECT + "&hidden=eq.false&order=created_at.desc&limit=300").then(function (rows) {
      var byLikes = function (a, b) { return (b.likes || 0) - (a.likes || 0); };
      var weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      var hot = rows.filter(function (p) { return (p.created_at || "") >= weekAgo; }).sort(byLikes).slice(0, 12);
      if (hot.length < 3) { hot = rows.slice().sort(byLikes).slice(0, 12); $("hotTitle").textContent = "Most liked all time"; }
      $("hot").innerHTML = hot.length ? hot.map(card).join("") : '<p class="cm-empty">No public projects yet – be the first: publish yours from the app.</p>';

      var n = {};
      rows.forEach(function (p) { (p.tags || []).forEach(function (t) { n[t] = (n[t] || 0) + 1; }); });
      var tags = Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).slice(0, 20);
      $("ttags").innerHTML = tags.length ? tags.map(function (t) {
        return '<a href="explore.html?tag=' + encodeURIComponent(t) + '">#' + esc(t) + " <small>" + n[t] + "</small></a>";
      }).join("") : '<p class="cm-empty">No tags yet.</p>';

      var by = {};
      rows.forEach(function (p) {
        if (!p.owner) return;
        var c = by[p.owner] || (by[p.owner] = { id: p.owner, a: p.author || {}, n: 0, likes: 0 });
        c.n++; c.likes += p.likes || 0;
      });
      var top = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.likes - a.likes || b.n - a.n; }).slice(0, 8);
      $("creators").innerHTML = top.length ? top.map(function (c, i) {
        return '<a class="tr-creator" href="u.html?id=' + encodeURIComponent(c.id) + '"><span class="tr-rank">' + (i + 1) + "</span>" + avatar(c.a) +
          "<span><b>" + esc(c.a.name || "Unknown creator") + "</b><small>" + c.n + (c.n === 1 ? " project" : " projects") +
          '</small></span><span class="cm-like">♥ ' + c.likes + "</span></a>";
      }).join("") : '<p class="cm-empty">No creators yet.</p>';
    }).catch(function () {
      ["hot", "ttags", "creators"].forEach(function (id) { $(id).innerHTML = "<p class='cm-empty'>Couldn&#39;t load trends. Try again later.</p>"; });
    });
  }

  if ($("cmLive")) initLive();
  if ($("trends")) initTrends();
  if ($("grid")) initList();
  if ($("detail")) initDetail();
  if ($("profile")) initProfile();
})();
