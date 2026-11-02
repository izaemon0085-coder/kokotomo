// ネットがなくても開けるように：画面のファイルと、前に見た会場メモをこの端末に保存しておく
// ・つながっているときは、いつも最新をサーバーから取る（ネットワーク優先）
// ・つながらないときは、保存しておいたものを見せる
// ※ おたすけカードの中身は localStorage にあるので、ネットがなくても見せられる
const CACHE = 'kokotomo-v1';
const SHELL = ['/', '/style.css', '/app.js', '/card.html', '/card.js', '/venues.html', '/venues.js'];
const CACHEABLE_API = /^\/api\/(topics|venues(\/[\w-]+)?)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isApi = url.pathname.startsWith('/api/');
  if (isApi && !CACHEABLE_API.test(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(request);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: !isApi });
      if (cached) return cached;
      if (isApi) {
        return new Response(JSON.stringify({ error: 'オフラインです', offline: true }), {
          status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      return new Response('オフラインです。つながったらもう一度開いてください。', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
