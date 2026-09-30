// オフラインでも開けるようにするための Service Worker。
// ネットから最新版を取りに行くが、3秒で返事がなければ保存済みの版で開く（電波が弱い場所で白い画面のまま待たないため）。
// 間に合わなかった通信も裏で続け、取れたら保存し直すので、次に開いたときは最新版になる。
// カードや写真のデータは IndexedDB にあり、ここでは扱わない。
const CACHE = 'manabi-card-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const TIMEOUT = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const fromCache = req => caches.match(req, { ignoreSearch: true })
  .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // 正常に取れたものだけ保存する（エラーページを保存すると、オフライン時に壊れた画面が出るため）
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  e.waitUntil(net.catch(() => {}));

  const timeout = new Promise(res => setTimeout(res, TIMEOUT));
  e.respondWith((async () => {
    try {
      const res = await Promise.race([net, timeout.then(() => null)]);
      if (res) return res;
    } catch (_) { /* 圏外など。保存済みの版を使う */ }
    const cached = await fromCache(req);
    if (cached) return cached;
    return net;   // 保存済みの版がなければ、遅くてもネットの返事を待つ
  })());
});
