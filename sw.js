// Project Gallery – service worker
// Statické súbory: cache-first (na pozadí sa obnovia pre ďalšie načítanie).
// Všetko ostatné z tohto webu: network-first, pri výpadku siete z cache.
// Supabase (a iné cudzie domény) sa nikdy necachujú.
// Pri zmene zoznamu alebo správania zvýš verziu.
var VERSION = "pg-v1";

var PRECACHE = [
  "app.html",
  "idea.html",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/css/community.css",
  "assets/css/app.css",
  "assets/js/config.js",
  "assets/js/main.js",
  "assets/js/pg.js",
  "assets/js/app.js",
  "assets/js/app-edit.js",
  "assets/img/logo.svg",
  "assets/img/favicon.svg",
  "assets/img/app-icon-192.png",
  "assets/img/app-icon-512.png",
  "assets/img/app-icon-maskable-512.png",
  "assets/img/app-icon-180.png"
];

var STATIC = /\/(app\.html|idea\.html|manifest\.webmanifest|assets\/css\/[^/]+\.css|assets\/js\/[^/]+\.js|assets\/img\/(app-icon-[^/]+\.png|logo\.svg|favicon\.svg))$/;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // po jednom – chýbajúci súbor nesmie zhodiť inštaláciu
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keyOf(url) { return url.origin + url.pathname; }   // ?demo=1 a pod. → rovnaký záznam

function store(key, res) {
  if (res && res.ok && res.status === 200 && res.type === "basic") {
    var copy = res.clone();
    caches.open(VERSION).then(function (c) { return c.put(key, copy); }).catch(function () {});
  }
  return res;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/(^|\.)supabase\.co$/.test(url.hostname)) return;   // nikdy necachovať
  if (url.origin !== self.location.origin) return;          // cudzie domény rieši prehliadač
  if (req.headers.has("range")) return;                     // video/audio
  if (STATIC.test(url.pathname)) {
    var key = keyOf(url);
    var net = fetch(req).then(function (res) { return store(key, res); });
    e.waitUntil(net.catch(function () {}));                 // obnova cache na pozadí
    e.respondWith(caches.match(key).then(function (hit) { return hit || net; }));
    return;
  }

  var full = req.url.split("#")[0];
  e.respondWith(fetch(req).then(function (res) { return store(full, res); }, function (err) {
    return caches.match(full).then(function (hit) { if (hit) return hit; throw err; });
  }));
});
