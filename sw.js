const CACHE_NAME = "able-iassess-v1.0.0";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./student.js",
  "./storage.js",
  "./Logo.png",
  "./Favicon.png",
  "./manifest.json",
  "./assessments/index.json"
];

// Install
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys.map(key => {

          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }

        })

      );

    }).then(() => self.clients.claim())

  );

});

// Fetch
self.addEventListener("fetch", event => {

  if (event.request.method !== "GET") return;

  event.respondWith(

    caches.match(event.request)

      .then(response => {

        if (response) {
          return response;
        }

        return fetch(event.request)

          .then(networkResponse => {

            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseClone = networkResponse.clone();

            caches.open(CACHE_NAME)

              .then(cache => {

                cache.put(event.request, responseClone);

              });

            return networkResponse;

          })

          .catch(() => {

            // Optional fallback
            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }

          });

      })

  );

});
