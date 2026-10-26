(function () {
  var S = window.SITE || {};

  // texty z config.js
  document.querySelectorAll("[data-site]").forEach(function (el) {
    var v = S[el.getAttribute("data-site")];
    if (v) el.textContent = v;
  });
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // odkazy: stiahnutie a e-mail
  document.querySelectorAll("[data-href]").forEach(function (a) {
    var k = a.getAttribute("data-href");
    if (k === "download" && S.download) a.href = S.download;
    if (k === "mailto" && S.email) a.href = "mailto:" + S.email;
  });

  // nákup: odkaz na platobnú stránku, inak e-mail s objednávkou
  document.querySelectorAll("[data-buy]").forEach(function (a) {
    var key = a.getAttribute("data-buy");
    var url = S[key];
    if (url) {
      a.href = url;
      if (/^https?:\/\//.test(url)) { a.target = "_blank"; a.rel = "noopener"; }   // externý obchod v novej karte
    } else if (S.email) {
      var plan = key === "buyStudent" ? "Pro Student" : "Pro";
      a.href = "mailto:" + S.email + "?subject=" + encodeURIComponent("Project Gallery " + plan + " licence");
    }
  });

  // zväčšenie screenshotov
  var box = document.querySelector(".lightbox");
  var big = box && box.querySelector("img");
  document.querySelectorAll("img[data-zoom]").forEach(function (img) {
    img.addEventListener("click", function () {
      big.src = img.src;
      big.alt = img.alt;
      box.hidden = false;
    });
  });
  if (box) {
    box.addEventListener("click", function () { box.hidden = true; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") box.hidden = true; });
  }
})();
