<?php
// Hlavička a pätička stránok obchodu – rovnaký vzhľad ako index.html.

function page_head(string $title): void
{
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= h($title) ?> — Project Gallery</title>
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/style.css">
<link rel="stylesheet" href="assets/css/shop.css">
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="index.html">
      <img class="logo" src="assets/img/logo.svg" width="26" height="26" alt="">
      Project Gallery
    </a>
    <nav><a href="index.html#pricing">Pricing</a><a href="index.html#faq">FAQ</a></nav>
  </div>
</header>
<main class="wrap shop">
<?php
}

function page_foot(): void
{
    ?>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <p>© <?= date('Y') ?> <span data-site="author">the author</span>.</p>
    <p class="foot-links"><a href="index.html">Home</a><a href="terms.html">Terms &amp; refunds</a><a href="privacy.html">Privacy</a><a href="recover.php">Lost your key?</a></p>
  </div>
</footer>
<script src="assets/js/config.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>
<?php
}
