const CACHE = "warrior-lesson-v9";
const PRECACHE = [
  "./",
  "./index.html",
  "./lessons.json",
  "./lesson.js",
  "./archive.html",
  "./forge.html",
  "./privacy.html",
  "./manifest.json",
  "./icon.svg",
  "./icon.png"
];

function isLessonsRequest(url) {
  return url.pathname.endsWith("/lessons.json") || url.pathname.endsWith("lessons.json");
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const dest = req.destination;
  const url = new URL(req.url);

  if (req.mode === "navigate" || dest === "document") {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  if (isLessonsRequest(url)) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            const stable = resp.clone();
            caches.open(CACHE).then((c) => {
              c.put(req, copy);
              c.put(new Request("./lessons.json"), stable);
            });
          }
          return resp;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("./lessons.json"))
        )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
