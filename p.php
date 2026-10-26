<?php
// Verejná stránka zdieľaného projektu: p.php?id=<slug>  (obsah nahráva aplikácia cez project.php)
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/shared.php';

header("Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$slug = (string)($_GET['id'] ?? '');
$row = null;
if (shared_slug_ok($slug)) {
    $q = shared_db()->prepare('SELECT * FROM shared_projects WHERE slug = ? AND hidden = 0');
    $q->execute([$slug]);
    $row = $q->fetch(PDO::FETCH_ASSOC) ?: null;
}
if (!$row) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found — Project Gallery</title><link rel="stylesheet" href="assets/css/style.css"><link rel="stylesheet" href="assets/css/shared.css"></head>
<body><main class="wrap sp-missing"><p class="kicker">404</p><h1>This project isn't shared any more.</h1>
<p class="lede">The link may be mistyped, or the author has taken the page down.</p><a class="btn btn-line" href="index.html">Project Gallery</a></main></body></html><?php
    exit;
}
shared_db()->prepare('UPDATE shared_projects SET views = views + 1 WHERE id = ?')->execute([$row['id']]);

$d = json_decode((string)$row['data'], true) ?: [];
$title = (string)$row['title'];
$short = (string)($d['short'] ?? '');
$desc = (string)($d['description'] ?? '');
$features = is_array($d['features'] ?? null) ? $d['features'] : [];
$tags = is_array($d['tags'] ?? null) ? $d['tags'] : [];
$lang = (string)($d['language'] ?? '');
$release = (string)($d['release_url'] ?? '');
$repo = (string)($d['repo_url'] ?? '');
$author = (string)($d['author'] ?? '');
$ver = rawurlencode(substr(preg_replace('/\D/', '', (string)$row['updated_at']), 0, 14));
$base = 'shared/' . rawurlencode($row['slug']) . '/';
$hasBanner = (int)$row['banner'] && is_file(shared_dir($row['slug']) . '/banner.png');
$shots = [];
for ($i = 1; $i <= (int)$row['shots']; $i++)
    if (is_file(shared_dir($row['slug']) . "/$i.jpg")) $shots[] = $base . $i . '.jpg?v=' . $ver;
$ogImage = $hasBanner ? site_base() . '/' . $base . 'banner.png?v=' . $ver : '';
$paras = array_filter(array_map('trim', preg_split('/\n\s*\n/', $desc)), 'strlen');

header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= h($title) ?> — Project Gallery</title>
<meta name="description" content="<?= h($short !== '' ? $short : mb_substr($desc, 0, 160)) ?>">
<meta property="og:type" content="website">
<meta property="og:title" content="<?= h($title) ?>">
<meta property="og:description" content="<?= h($short) ?>">
<meta property="og:url" content="<?= h(shared_url($row['slug'])) ?>">
<?php if ($ogImage): ?><meta property="og:image" content="<?= h($ogImage) ?>">
<meta name="twitter:card" content="summary_large_image"><?php endif; ?>

<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/style.css">
<link rel="stylesheet" href="assets/css/shared.css">
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="index.html">
      <img class="logo" src="assets/img/logo.svg" width="26" height="26" alt="">
      Project Gallery
    </a>
    <nav><a href="index.html">Get the app</a></nav>
  </div>
</header>

<main class="wrap sp">
  <section class="sp-head">
    <p class="kicker"><?= h(implode(' · ', array_filter([$lang, $author !== '' ? 'by ' . $author : '']))) ?: 'Project' ?></p>
    <h1><?= h($title) ?></h1>
    <?php if ($short !== ''): ?><p class="lede"><?= h($short) ?></p><?php endif; ?>
    <?php if ($release || $repo): ?>
    <p class="cta">
      <?php if ($release): ?><a class="btn btn-ink" href="<?= h($release) ?>" rel="nofollow noopener" target="_blank">Download</a><?php endif; ?>
      <?php if ($repo): ?><a class="btn btn-line" href="<?= h($repo) ?>" rel="nofollow noopener" target="_blank">Source code</a><?php endif; ?>
    </p>
    <?php endif; ?>
  </section>

  <?php if ($hasBanner): ?>
  <figure class="sp-banner"><img src="<?= h($base . 'banner.png?v=' . $ver) ?>" width="1200" height="630" alt="<?= h($title) ?>"></figure>
  <?php endif; ?>

  <div class="sp-body">
    <?php if ($paras): ?>
    <section class="sp-about">
      <h2>About</h2>
      <?php foreach ($paras as $para): ?><p><?= nl2br(h($para)) ?></p><?php endforeach; ?>
    </section>
    <?php endif; ?>
    <?php if ($features): ?>
    <section class="sp-feats">
      <h2>Features</h2>
      <ul><?php foreach ($features as $f): ?><li><?= h((string)$f) ?></li><?php endforeach; ?></ul>
    </section>
    <?php endif; ?>
  </div>

  <?php if ($shots): ?>
  <section class="sp-shots">
    <h2>Screenshots</h2>
    <div class="sp-grid">
      <?php foreach ($shots as $i => $s): ?><a href="<?= h($s) ?>" target="_blank" rel="noopener"><img src="<?= h($s) ?>" loading="lazy" alt="<?= h($title . ' — screenshot ' . ($i + 1)) ?>"></a><?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if ($tags): ?>
  <p class="sp-tags"><?php foreach ($tags as $t): ?><span>#<?= h((string)$t) ?></span><?php endforeach; ?></p>
  <?php endif; ?>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p>Shared with <a href="index.html">Project Gallery</a> · updated <?= h(substr((string)$row['updated_at'], 0, 10)) ?></p>
  </div>
</footer>
</body>
</html>
