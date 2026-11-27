/* =========================================================
   Service Worker（段階4）
   ---------------------------------------------------------
   Service Worker は、ページとネットの間に立つ小さなプログラム。ページが読み込むファイルを
   代わりに取りに行き、写しを端末に取っておく（Cache Storage）。通信できないときは写しを返すので、
   機内モードでもアプリが開ける。

   古い版が残らないための決まり:
     - アプリのファイルは「まずネット」（network-first）。通信できるときは毎回、公開されている最新の
       ファイルを使い（ブラウザの一時保存も使わずに確かめる: cache "no-cache"）、写しを新しくする。
       写しを使うのは、通信できないときと、4秒たっても返事が無いときだけ。
     - この sw.js は公開のたびに中身（BUILD）が変わる。ブラウザはそれを見つけると新しい Service Worker を
       入れ、古い版の写しを消す（activate）。開いているページには pwa.js が「新しい版があります」と知らせる。
     - 教材と学習の記録は IndexedDB にあり、ここでは一切さわらない。
   ========================================================= */
"use strict";
const BUILD = "__BUILD__"; // 公開のとき GitHub Actions がコミットの短い ID に置き換える
const APP_CACHE = "prh-app-" + BUILD;
const FONT_CACHE = "prh-fonts-v1";
const TIMEOUT = 4000;
// 初めて入れるときに写しを取るファイル（ここにあるファイルが1つでも無いと入れられないので、t16 が確かめる）
const CORE = [
  "./",
  "local-db.js",
  "import.js",
  "relay.js",
  "pwa.js",
  "merge.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "samples/demo-unit.txt",
  "samples/demo-overview.json",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(CORE.map((p) => new Request(new URL(p, self.registration.scope), { cache: "reload" })));
    await self.skipWaiting(); // 待たずに新しい版へ（ファイルは毎回ネットから取るので、古いページと混ざっても困らない）
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("prh-app-") && k !== APP_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 写しの名前: ページそのもの（"/" と "/index.html"）は "./" にまとめる。? 以下は無視する */
function cacheKey(url) {
  const scope = new URL(self.registration.scope);
  const u = new URL(url);
  u.search = ""; u.hash = "";
  if (u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html") return scope.href;
  return u.href;
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const key = cacheKey(request.url);
  const fromNet = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
    if (res && res.ok && res.type === "basic") cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  fromNet.catch(() => {}); // 写しを返した後に失敗しても、知らせは要らない
  const fromCache = () => cache.match(key).then((hit) => hit || (request.mode === "navigate" ? cache.match(cacheKey(self.registration.scope)) : undefined));
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, TIMEOUT); });
  try {
    // 4秒以内にネットから届けばそれを使う。遅いときは写しを先に返し、ネットの分は次のために写しへ入れる
    const first = await Promise.race([fromNet, slow.then(() => null)]);
    if (first) return first;
    const hit = await fromCache();
    return hit || await fromNet;
  } catch (e) {
    const hit = await fromCache();
    if (hit) return hit;
    return new Response("通信できず、端末に写しもありません。通信できるところで一度開いてください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } finally {
    clearTimeout(timer);
  }
}

/* 文字の形（Google Fonts）: 写しがあればそれを使い、裏で新しくする。無くても文字は端末の書体で出る */
async function fontCache(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) return hit;
  const res = await net;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(fontCache(req)); return; }
  if (url.origin !== self.location.origin || !req.url.startsWith(self.registration.scope)) return;
  event.respondWith(networkFirst(req));
});
