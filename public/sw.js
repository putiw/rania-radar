const CACHE_PREFIX = "rania-radar-";
const CACHE_NAME = `${CACHE_PREFIX}v21`;
const FACE_ASSET_VERSION = "photos-6";
const APP_ROOT = new URL("./", self.registration.scope);
const appUrl = (path = "") => new URL(path, APP_ROOT).href;
const FACE_GROUPS = [
  ["rania", 16, true],
  ["aysha", 2],
  ["birol", 7],
  ["dana", 2],
  ["gaya", 4],
  ["hadi", 8],
  ["haidee", 7],
  ["hamster", 1],
  ["hannah", 5],
  ["hilton", 3],
  ["jenna", 2],
  ["karima", 4],
  ["lexi", 3],
  ["maitha", 3],
  ["michele", 1],
  ["noha", 2],
  ["puti", 7, false, [1, 2, 3, 4, 6, 8, 9]],
  ["raphael", 4],
  ["shanshan", 3],
  ["soumen", 7],
  ["steve", 4],
  ["teo", 9],
  ["toni", 3],
  ["victor", 2],
  ["zinong", 2],
];
const FACE_ASSETS = FACE_GROUPS.flatMap(
  ([slug, count, numberFirst = false, explicitPhotoNumbers]) =>
    (explicitPhotoNumbers ?? Array.from({ length: count }, (_, index) => index + 1)).map(
      (photoNumber) => {
        const fileSuffix = photoNumber === 1 && !numberFirst ? "" : photoNumber;
        return `faces/${slug}${fileSuffix}.webp`;
      },
    ),
);
const APP_SHELL = [
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png?v=rania-face-2",
  "icons/icon-512.png?v=rania-face-2",
  "icons/icon-maskable-512.png?v=rania-face-2",
  "noise-1f-full.png",
  "sounds/exercise-complete-day.wav",
  ...FACE_ASSETS.map((path) => `${path}?v=${FACE_ASSET_VERSION}`),
].map(appUrl);

function findBuiltAssets(html) {
  const attributePattern = /\b(?:src|href)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/gi;
  const assets = [];

  for (const [, value] of html.matchAll(attributePattern)) {
    const url = new URL(value, APP_ROOT);
    if (url.origin === self.location.origin && url.href.startsWith(APP_ROOT.href)) {
      assets.push(url.href);
    }
  }

  return [...new Set(assets)];
}

async function installApp() {
  const response = await fetch(new Request(APP_ROOT.href, { cache: "reload" }));
  if (!response.ok) throw new Error(`Could not cache app shell: ${response.status}`);

  const builtAssets = findBuiltAssets(await response.clone().text());
  const cache = await caches.open(CACHE_NAME);
  await cache.put(APP_ROOT.href, response);
  await cache.addAll([...APP_SHELL, ...builtAssets]);
  await self.skipWaiting();
}

self.addEventListener("install", (event) => {
  event.waitUntil(installApp());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (
    request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    !requestUrl.href.startsWith(APP_ROOT.href)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT.href, copy));
          }
          return response;
        })
        .catch(() => caches.match(APP_ROOT.href)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
