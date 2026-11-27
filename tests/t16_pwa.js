// アプリにする部品（段階4）のテスト。画面を使わない所を確かめる。
//   1. ファイル: manifest の中身、アイコンの大きさ、sw.js が最初に写すファイルがすべてあるか、
//      index.html が読むファイルがすべて写す一覧にあるか（無いと Service Worker が入らない・機内モードで欠ける）
//   2. sw.js: 偽物の Service Worker の環境で動かす。入れる・通信できるとき（最新を使い写しを新しくする）・
//      通信できないとき（写しを返す）・遅いとき（4秒で写しに切り替える）・古い版の写しを消す・文字の形
//   3. pwa.js のバックアップの読み取りと点検
//   4. local-db.js の dumpAll / replaceAll / freeze と、他のタブへの知らせ
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { IDBFactory } = require("fake-indexeddb");
const L = require("../hub/local-db.js");
const P = require("../hub/pwa.js");
const HUB = path.join(__dirname, "..", "hub");
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. ファイル ---------- */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function swCore() {
  const src = fs.readFileSync(path.join(HUB, "sw.js"), "utf8");
  const m = /const CORE = (\[[\s\S]*?\]);/.exec(src);
  return m ? vm.runInNewContext(m[1]) : [];
}
function files() {
  const man = JSON.parse(fs.readFileSync(path.join(HUB, "manifest.webmanifest"), "utf8"));
  ok(man.name && man.short_name && man.start_url === "./" && man.scope === "./" && man.display === "standalone", "manifest の基本の項目: " + JSON.stringify(man));
  ok(man.short_name.length <= 12, "short_name が長い（ホーム画面で切れる）: " + man.short_name);
  const sizes = new Set();
  man.icons.forEach((ic) => {
    const f = path.join(HUB, ic.src);
    ok(fs.existsSync(f), "manifest のアイコンが無い: " + ic.src);
    if (!fs.existsSync(f)) return;
    const s = pngSize(f);
    ok(s && ic.sizes === s[0] + "x" + s[1], `アイコンの大きさが manifest と違う: ${ic.src} ${ic.sizes} / ${s}`);
    sizes.add(ic.sizes + ":" + ic.purpose);
  });
  ["192x192:any", "512x512:any", "512x512:maskable"].forEach((k) => ok(sizes.has(k), "manifest にアイコンが足りない: " + k));
  ok(String(pngSize(path.join(HUB, "icons", "apple-touch-icon.png"))) === "180,180", "apple-touch-icon が 180×180 でない");

  const core = swCore();
  ok(core.length > 5 && core.includes("./"), "sw.js の CORE が読めない");
  core.filter((p) => p !== "./").forEach((p) => ok(fs.existsSync(path.join(HUB, p)), "sw.js の CORE にあるファイルが無い（Service Worker が入らなくなる）: " + p));
  // index.html が読む同じ場所のファイルは、すべて CORE にある（機内モードで欠けない）
  const html = fs.readFileSync(path.join(HUB, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#)/.test(u));
  ok(refs.length >= 7, "index.html の読み込みが見つからない: " + refs);
  refs.forEach((u) => ok(core.includes(u), "index.html が読むファイルが sw.js の CORE に無い: " + u));
  ["sw.js", "pwa.js"].forEach((f) => ok(/"__BUILD__"/.test(fs.readFileSync(path.join(HUB, f), "utf8")), f + " に版の印 __BUILD__ が無い"));
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "pages.yml"), "utf8");
  ok(/__BUILD__.*hub\/sw\.js.*hub\/pwa\.js/.test(wf), "公開のときに版の印を入れていない（pages.yml）");
  ok(/register\("sw\.js", \{ updateViaCache: "none" \}\)/.test(fs.readFileSync(path.join(HUB, "pwa.js"), "utf8")), "sw.js を毎回確かめる設定（updateViaCache）が無い");
}

/* ---------- 2. sw.js を偽物の環境で動かす ---------- */
function makeSw(build) {
  const SCOPE = "https://u.github.io/app/";
  const stores = new Map(); // 名前 → Map(key → Response)
  const keyOf = (r) => (typeof r === "string" ? r : r.url);
  const caches = {
    open: async (n) => {
      if (!stores.has(n)) stores.set(n, new Map());
      const m = stores.get(n);
      return {
        put: async (k, res) => { m.set(keyOf(k), res); },
        match: async (k) => { const r = m.get(keyOf(k)); return r ? r.clone() : undefined; },
        addAll: async (reqs) => {
          for (const r of reqs) {
            const res = await net.fetch(r.url, { cache: r.cache });
            if (!res.ok) throw new TypeError("addAll: " + r.url);
            m.set(r.url, res);
          }
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
  };
  const net = {
    online: true, slow: 0, version: "v1", calls: [],
    async fetch(url, init) {
      url = typeof url === "string" ? url : url.url;
      net.calls.push({ url, cache: init && init.cache });
      if (net.slow) await delay(net.slow);
      if (!net.online) throw new TypeError("Failed to fetch");
      if (/missing/.test(url)) return new Response("nf", { status: 404 });
      const res = new Response(net.version + " " + url, { status: 200 });
      Object.defineProperty(res, "type", { value: /fonts\.g/.test(url) ? "cors" : "basic" });
      return res;
    },
  };
  const handlers = {};
  const self = {
    registration: { scope: SCOPE }, location: { origin: "https://u.github.io" },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: async () => { self.skipped = true; }, clients: { claim: async () => { self.claimed = true; } },
  };
  const src = fs.readFileSync(path.join(HUB, "sw.js"), "utf8").replace(/__BUILD__/g, build);
  vm.runInNewContext(src, { self, caches, fetch: (...a) => net.fetch(...a), Request, Response, URL, setTimeout, clearTimeout, Promise, console });
  const life = async (t) => { let p; handlers[t]({ waitUntil: (x) => { p = x; } }); await p; };
  const get = async (url, mode = "no-cors") => {
    let p = null;
    handlers.fetch({ request: { url, method: "GET", mode }, respondWith: (x) => { p = x; } });
    if (!p) return null; // Service Worker は手を出さない
    const r = await p; return { status: r.status, text: await r.text() };
  };
  return { SCOPE, stores, net, self, life, get, handlers };
}
async function serviceWorker() {
  const s = makeSw("aaa111");
  await s.life("install");
  const app = s.stores.get("prh-app-aaa111");
  ok(app && app.size === swCore().length, "入れたときに CORE を全部写していない: " + (app && app.size));
  ok(app && app.has(s.SCOPE) && app.has(s.SCOPE + "local-db.js"), "写しの名前が違う: " + (app && [...app.keys()]));
  ok(s.net.calls.every((c) => c.cache === "reload"), "入れるときにブラウザの一時保存を使っている");
  ok(s.self.skipped, "skipWaiting していない");
  s.stores.set("prh-app-old000", new Map([["x", new Response("old")]]));
  s.stores.set("prh-fonts-v1", new Map());
  await s.life("activate");
  ok(!s.stores.has("prh-app-old000") && s.stores.has("prh-app-aaa111") && s.stores.has("prh-fonts-v1"), "古い版の写しだけを消していない: " + [...s.stores.keys()]);
  ok(s.self.claimed, "clients.claim していない");

  // 通信できるとき: 最新を返し、写しも新しくする。一時保存を使わずに確かめる（no-cache）
  s.net.version = "v2"; s.net.calls = [];
  let r = await s.get(s.SCOPE + "?from=home", "navigate");
  ok(r && r.text.startsWith("v2"), "通信できるのに最新を返さない: " + (r && r.text));
  ok(s.net.calls[0] && s.net.calls[0].cache === "no-cache", "ネットに取りに行くときに no-cache でない: " + JSON.stringify(s.net.calls));
  await delay(10);
  ok((await (await s.stores.get("prh-app-aaa111").get(s.SCOPE).clone()).text()).startsWith("v2"), "通信できたのにページの写しを新しくしない");
  r = await s.get(s.SCOPE + "relay.js");
  ok(r.text.startsWith("v2"), "ファイルも最新を返さない");

  // 通信できないとき: 写しを返す。/index.html と ? 付きのページも "./" の写しで開く
  s.net.online = false;
  r = await s.get(s.SCOPE + "index.html?x=1", "navigate");
  ok(r && r.status === 200 && r.text.startsWith("v2 " + s.SCOPE + "?from"), "機内モードでページが開かない: " + (r && r.text));
  r = await s.get(s.SCOPE + "some/page", "navigate");
  ok(r && r.status === 200 && r.text.startsWith("v2"), "機内モードで知らないページのときにアプリを返さない: " + (r && r.text));
  r = await s.get(s.SCOPE + "import.js");
  ok(r && r.text.startsWith("v1"), "機内モードでファイルの写しを返さない: " + (r && r.text));
  r = await s.get(s.SCOPE + "content/index.json");
  ok(r && r.status === 503, "写しの無いファイルで 503 にならない: " + (r && r.status));

  // 遅いとき: 4秒で写しを返し、届いた分で写しを新しくする
  s.net.online = true; s.net.slow = 4600; s.net.version = "v3";
  const t0 = Date.now();
  r = await s.get(s.SCOPE + "pwa.js");
  const took = Date.now() - t0;
  ok(r.text.startsWith("v1") && took >= 3900 && took < 4500, `遅いときに4秒で写しに切り替えない: ${r.text.slice(0, 3)} ${took}ms`);
  await delay(800);
  r = await (await s.stores.get("prh-app-aaa111").get(s.SCOPE + "pwa.js").clone()).text();
  ok(r.startsWith("v3"), "遅れて届いた最新で写しを新しくしない: " + r.slice(0, 3));
  s.net.slow = 0;

  // 404 は写さない
  s.net.calls = [];
  r = await s.get(s.SCOPE + "missing.js");
  ok(r.status === 404 && !s.stores.get("prh-app-aaa111").has(s.SCOPE + "missing.js"), "404 を写している");

  // ほかのサイト（Google Fonts 以外）と POST には手を出さない。文字の形は写しを先に使う
  ok((await s.get("https://example.com/x.js")) === null, "ほかのサイトの読み込みに手を出している");
  ok((await s.get("https://u.github.io/other/x.js")) === null, "範囲（scope）の外に手を出している");
  let posted = false;
  s.handlers.fetch({ request: { url: s.SCOPE + "x", method: "POST", mode: "cors" }, respondWith: () => { posted = true; } });
  ok(!posted, "POST に手を出している");
  s.net.version = "f1";
  r = await s.get("https://fonts.gstatic.com/s/a.woff2");
  ok(r.text.startsWith("f1"), "文字の形を取れない");
  s.net.version = "f2"; s.net.online = false;
  r = await s.get("https://fonts.gstatic.com/s/a.woff2");
  ok(r && r.text.startsWith("f1"), "機内モードで文字の形の写しを返さない: " + (r && r.text));
}

/* ---------- 3. バックアップの読み取り ---------- */
function backupParse() {
  const rows = [
    { col: "units", id: "a-1", data: { source: "a", order: 1, blocks: [] } },
    { col: "sources", id: "a", data: { title: "A" } },
    { col: "data/users/me", id: "srs-0", data: { cards: { x: { due: 1 }, y: { due: 2 } } } },
    { col: "data/users/me", id: "srs-3", data: { cards: { z: {} } } },
    { col: "data/users/me", id: "log-2026-11", data: { entries: { e1: { day: "2026-11-01" }, e2: { del: true } } } },
    { col: "data/users/me", id: "time-2026-11", data: { days: { "2026-11-01": {}, "2026-11-02": {} } } },
  ];
  const bk = P.makeBackup(rows, Date.UTC(2026, 10, 27, 3));
  ok(bk.format === "paper-reader-hub-backup" && bk.version === 1 && bk.exportedAt === "2026-11-27T03:00:00.000Z", "makeBackup の形: " + JSON.stringify(bk).slice(0, 120));
  ok(/^paper-reader-hub-\d{4}-\d\d-\d\d\.hubbackup\.json$/.test(P.backupFileName()), "ファイル名が .gitignore の形でない: " + P.backupFileName());
  let r = P.parseBackup(JSON.stringify(bk));
  ok(r.ok && r.rows.length === 6, "書き出したものを読めない: " + r.error);
  const c = r.ok && r.info.counts;
  ok(c && c.units === 1 && c.cards === 3 && c.logs === 1 && c.days === 2 && c.sources === 1, "数え上げ: " + JSON.stringify(c));
  // BOM 付き、前後の空白も読める
  ok(P.parseBackup("﻿ " + JSON.stringify(bk) + "\n").ok, "BOM 付きを読めない");
  // claude.ai のハブの利用者 ID は me に読み替える
  r = P.parseBackup(JSON.stringify({ ...bk, docs: [{ col: "data/users/user_abc", id: "meta", data: { a: 1 } }] }));
  ok(r.ok && r.rows[0].col === "data/users/me", "ほかの利用者 ID を me に読み替えない: " + JSON.stringify(r.rows || r.error));
  const bad = (docs, re, m) => { const x = P.parseBackup(typeof docs === "string" ? docs : JSON.stringify({ ...bk, docs })); ok(!x.ok && re.test(x.error), m + ": " + JSON.stringify(x).slice(0, 160)); };
  bad("{oops", /JSON/, "壊れた JSON");
  bad("", /空/, "空のファイル");
  bad(JSON.stringify({ hello: 1 }), /バックアップではありません/, "ほかの JSON");
  bad(JSON.stringify({ ...bk, version: 2 }), /新しい版/, "新しい版の形");
  bad([], /空/, "中身が空");
  bad([{ col: "units", id: "", data: {} }], /壊れて.*1 件目/, "id が空");
  bad([{ col: "units", id: "a", data: [] }], /壊れて/, "data が配列");
  bad([{ col: "secrets", id: "a", data: {} }], /知らない入れ物/, "知らないコレクション");
  bad([{ col: "data/users/me/x", id: "a", data: {} }], /知らない入れ物/, "深すぎるコレクション");
  bad([{ col: "units", id: "a", data: {} }, { col: "units", id: "a", data: {} }], /2つ/, "同じものが2つ");
  bad([{ col: "data/users/a", id: "m", data: {} }, { col: "data/users/b", id: "m", data: {} }], /複数の利用者/, "2人分");
  bad('{"format":"paper-reader-hub-backup","version":1,"docs":[{"col":"units","id":"a","data":{"x":{"__proto__":{"p":1}}}}]}', /使えない項目名/, "__proto__");
}

/* ---------- 4. local-db.js の dumpAll / replaceAll / freeze ---------- */
async function localDb() {
  const idb = new IDBFactory();
  let replaced = 0;
  const a = await L.createDb({ indexedDB: idb, name: "t16" });
  const b = await L.createDb({ indexedDB: idb, name: "t16", onReplaced: () => { replaced++; } }); // 同じ端末の別のタブ
  await a.collection("units").doc("u1").set({ order: 1 });
  await a.collection("data/users/me").doc("srs-0").set({ cards: { k: { due: 3 } } });
  let rows = await a.dumpAll();
  ok(JSON.stringify(rows) === JSON.stringify([{ col: "data/users/me", id: "srs-0", data: { cards: { k: { due: 3 } } } }, { col: "units", id: "u1", data: { order: 1 } }]), "dumpAll: " + JSON.stringify(rows));
  rows[0].data.cards.k.due = 99; // 取り出したものは写し
  ok((await a.collection("data/users/me").doc("srs-0").get()).data().cards.k.due === 3, "dumpAll の結果を書き換えると中身が変わる");

  // 購読している画面にも知らせる
  let snaps = 0; const un = a.collection("units").onSnapshot(() => { snaps++; });
  await delay(30); const s0 = snaps;
  // 形の違う中身は受け付けず、元のまま
  let threw = false;
  try { await a.replaceAll([{ col: "units", id: "x", data: {} }, { col: "units", id: 5, data: {} }]); } catch (e) { threw = e.code === "invalid_argument"; }
  ok(threw && (await a.dumpAll()).length === 2, "形の違う中身で replaceAll が失敗しない／中身が変わった");
  await a.replaceAll([{ col: "units", id: "u9", data: { order: 9 } }, { col: "sources", id: "s", data: { title: "S" } }]);
  rows = await a.dumpAll();
  ok(rows.length === 2 && rows.some((r) => r.id === "u9") && !rows.some((r) => r.id === "u1" || r.id === "srs-0"), "replaceAll で置き換わらない: " + JSON.stringify(rows));
  await delay(60);
  ok(snaps > s0, "replaceAll の後に購読している画面へ知らせない");
  ok(replaced === 1, "replaceAll を同じ端末の別のタブに知らせない: " + replaced);
  // 知らせを受けたタブは書き込まない（開き直す前に古い記録で上書きしないため）
  await b.collection("units").doc("u9").set({ order: 0 });
  await b.collection("units").doc("u9").update({ order: 0 });
  await b.collection("sources").doc("s").delete();
  rows = await a.dumpAll();
  ok(rows.find((r) => r.id === "u9").data.order === 9 && rows.some((r) => r.id === "s"), "知らせを受けたタブが書き込んだ");
  // freeze: 自分のタブの書き込みも止まる
  a.freeze();
  ok(a.isFrozen(), "isFrozen が true にならない");
  await a.collection("units").doc("u9").set({ order: 1 });
  ok((await a.collection("units").doc("u9").get()).data().order === 9, "freeze の後に書き込んだ");
  // freeze の後でも replaceAll はできる（戻すときの順番: freeze → replaceAll）
  await a.replaceAll([{ col: "units", id: "z", data: {} }]);
  ok((await a.dumpAll()).length === 1, "freeze の後に replaceAll できない");
  un(); a.close(); b.close();
}

(async () => {
  files();
  backupParse();
  await localDb();
  await serviceWorker();
  console.log(JSON.stringify({ test: "t16_pwa.js", ok: !fail.length, fail }, null, 1));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ test: "t16_pwa.js", ok: false, errors: [String(e && e.stack || e)], fail })); process.exit(1); });
