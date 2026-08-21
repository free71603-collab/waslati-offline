/* تطبيق وصلاتي: تخزين ملفات الواجهة محلياً، بينما تبقى البيانات في IndexedDB. */
const CACHE_NAME = "waslati-shell-v1";
const CORE_FILES = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => typeof url === "string" && url.startsWith(self.location.origin));
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        urls.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // قد تتضمن قائمة الأداء مورد تحليلات أو استجابة لا يمكن تخزينها؛ نتجاوزها بأمان.
          }
        }),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        if (event.request.mode === "navigate") return (await caches.match("/")) ?? Response.error();
        return Response.error();
      }
    }),
  );
});
