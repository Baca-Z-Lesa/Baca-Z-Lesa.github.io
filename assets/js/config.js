// ----------------------------------------------------------------
//  Nastavenia stránky – toto je jediný súbor, ktorý treba upraviť.
// ----------------------------------------------------------------
window.SITE = {
  author: "Bananisko_",                 // tvoje meno (pätička, podpis pod „Why this exists“)
  email: "ProjectGallery@info.com",          // kontaktný e-mail (podpora, refundácie, stratené kľúče)

  // Odkazy na nákup – vlastné PHP stránky so Stripe (app/config.php). Ak ich vyprázdniš,
  // tlačidlá „Buy“ otvoria e-mail s objednávkou.
  buyPro: "pro.html#beta",
  buyStudent: "pro.html#beta",

  pricePro: "4.99 €",
  priceStudent: "2.49 €",

  version: "2.2.1",
  // inštalátor z GitHub Releases (downloads/*.exe nie je v gite, na GitHub Pages by nefungoval)
  download: "https://github.com/Baca-Z-Lesa/ProjectGallery-releases/releases/download/v2.2.1/ProjectGallery-Setup-2.2.1.exe",
  github: "https://github.com/Baca-Z-Lesa",

  // účty (Supabase) – rovnaké ako APP_SUPABASE_URL / APP_SUPABASE_KEY v aplikácii; kľúč je verejný (publishable)
  supabaseUrl: "https://vpiyjeptkihgzphsmdqb.supabase.co",
  supabaseKey: "sb_publishable_l5byKlT0sNV88fVcRRKPIw_kfvMVSji",

  // Citáty používateľov na hlavnej stránke. Kým je zoznam prázdny, sekcia sa nezobrazí.
  // { quote: "…", name: "Meno", role: "študent, Bratislava", photo: "assets/img/voices/meno.jpg" }  (photo je nepovinné)
  testimonials: []
};
