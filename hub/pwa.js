/* =========================================================
   アプリにする部品（段階4: PWA）
   ---------------------------------------------------------
   PWA（Progressive Web App）は、Web ページをホーム画面に置いてアプリのように使えるようにするしくみ。
   この部品が受け持つこと:
     1. Service Worker（sw.js）を登録する … 通信できないときも、前に開いた版でアプリを開けるようにする
        sw.js が新しくなったら（新しい版を公開したら）onUpdate で知らせる
     2. ホーム画面に追加できるか・すでにホーム画面から開いているかを調べる
     3. 端末の保存を「消されにくく」する（navigator.storage.persist）・使っている容量を調べる
     4. バックアップのファイルを作る・読み取って点検する（ここは画面に依らない関数。tests/t16 が確かめる）

   claude.ai の中（本物の window.claude があるとき）では 1〜3 を何もしない。

   バックアップの形（1つの JSON。docs/backup-format.md にも書いた）:
     { "format": "paper-reader-hub-backup", "version": 1, "app": "<版>", "exportedAt": "2026-11-27T10:00:00.000Z",
       "docs": [ { "col": "units", "id": "xu2019-2a", "data": { … } }, { "col": "data/users/me", "id": "srs-0", "data": { … } }, … ] }
   docs は端末のデータベースの中身そのもの（local-db.js の 1件 = { col, id, data }）。
   ========================================================= */
(function (root) {
  "use strict";
  var BUILD = "__BUILD__"; // 公開のとき GitHub Actions がコミットの短い ID に置き換える
  var FORMAT = "paper-reader-hub-backup", FORMAT_VERSION = 1;
  var MAX_TEXT = 200 * 1024 * 1024; // これより大きいファイルは読まない（取り違え防止）
  var TEXT_COLS = { sources: 1, units: 1, texts: 1, overviews: 1 };

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function build() { return /^__/.test(BUILD) ? "開発版" : BUILD; }

  /* ---------- バックアップ ---------- */
  function makeBackup(rows, now) {
    return { format: FORMAT, version: FORMAT_VERSION, app: build(), exportedAt: new Date(now || Date.now()).toISOString(), docs: rows };
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function backupFileName(now) {
    var d = new Date(now || Date.now());
    return "paper-reader-hub-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".hubbackup.json";
  }
  /* 中身の数え上げ（読み込む前の確認と、書き出した後の表示に使う） */
  function summarize(rows) {
    var out = { units: 0, sources: 0, overviews: 0, cards: 0, fixes: 0, logs: 0, days: 0, records: 0 };
    var days = {};
    rows.forEach(function (r) {
      var d = r.data || {};
      if (r.col === "units") out.units++;
      else if (r.col === "sources") out.sources++;
      else if (r.col === "overviews") out.overviews++;
      else if (/^data\/users\//.test(r.col)) {
        out.records++;
        if (/^srs-/.test(r.id) && isObj(d.cards)) out.cards += Object.keys(d.cards).length;
        else if (r.id === "fixes" && isObj(d.cards)) out.fixes += Object.keys(d.cards).length;
        else if (/^log-/.test(r.id) && isObj(d.entries)) out.logs += Object.keys(d.entries).filter(function (k) { return d.entries[k] && !d.entries[k].del; }).length;
        else if (/^time-/.test(r.id) && isObj(d.days)) Object.keys(d.days).forEach(function (k) { days[k] = 1; });
      }
    });
    out.days = Object.keys(days).length;
    return out;
  }
  /* "__proto__" という名前の項目は、Object.assign などで思わぬ形に化けるので受け付けない */
  function hasBadKey(v, depth) {
    if (depth > 64) return true;
    if (Array.isArray(v)) return v.some(function (x) { return hasBadKey(x, depth + 1); });
    if (!isObj(v)) return false;
    return Object.keys(v).some(function (k) { return k === "__proto__" || hasBadKey(v[k], depth + 1); });
  }
  /* バックアップのファイルを読んで点検する。
     → { ok: true, rows, info: { exportedAt, app, counts } } か { ok: false, error: "やさしい説明" }
     記録のコレクション data/users/<だれか> は、この端末の利用者 data/users/me に読み替える
     （claude.ai のハブから移すとき（段階6）は、そちらの利用者 ID が入っているため） */
  function parseBackup(text) {
    var fail = function (m) { return { ok: false, error: m }; };
    if (typeof text !== "string" || !text.trim()) return fail("ファイルが空です。");
    if (text.length > MAX_TEXT) return fail("ファイルが大きすぎます。バックアップのファイルか確かめてください。");
    var o;
    try { o = JSON.parse(text.replace(/^﻿/, "")); } catch (e) { return fail("バックアップのファイルとして読めません（JSON の形ではありません）。書き出したファイルをそのまま選んでください。"); }
    if (!isObj(o) || o.format !== FORMAT) return fail("論文リーダー学習ハブのバックアップではありません。「バックアップを書き出す」で作ったファイル（名前が .hubbackup.json で終わるもの）を選んでください。");
    if (typeof o.version !== "number" || o.version > FORMAT_VERSION) return fail("このアプリより新しい版で書き出したバックアップです。アプリを開き直して最新にしてから、もう一度読み込んでください。");
    if (!Array.isArray(o.docs)) return fail("バックアップの中身が壊れています（docs がありません）。");
    var rows = [], seen = {}, uids = {};
    for (var i = 0; i < o.docs.length; i++) {
      var r = o.docs[i], where = "（" + (i + 1) + " 件目）";
      if (!isObj(r) || typeof r.col !== "string" || typeof r.id !== "string" || !r.id || r.id.length > 300 || !isObj(r.data))
        return fail("バックアップの中身が壊れています" + where + "。");
      var col = r.col, m = /^data\/users\/([^/]+)$/.exec(col);
      if (m) {
        uids[m[1]] = 1; col = "data/users/me";
        if (Object.keys(uids).length > 1) return fail("バックアップに複数の利用者の記録が入っています。1人分ずつ書き出してください。");
      }
      else if (!TEXT_COLS[col]) return fail("バックアップに、このアプリが知らない入れ物（" + String(col).slice(0, 40) + "）が入っています" + where + "。");
      if (hasBadKey(r.data, 0)) return fail("バックアップの中身に使えない項目名があります" + where + "。");
      var key = col + "\n" + r.id;
      if (seen[key]) return fail("バックアップの中に同じもの（" + col + "/" + r.id + "）が2つあります。");
      seen[key] = 1;
      rows.push({ col: col, id: r.id, data: r.data });
    }
    if (!rows.length) return fail("中身が空のバックアップです。");
    return { ok: true, rows: rows, info: { exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : "", app: typeof o.app === "string" ? o.app : "", counts: summarize(rows) } };
  }

  /* ---------- 端末と開き方 ---------- */
  function nav() { return (root && root.navigator) || {}; }
  /* ホーム画面から開いているか */
  function isStandalone() {
    try { if (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) return true; } catch (e) { /* 古いブラウザ */ }
    return nav().standalone === true; // iPhone の Safari
  }
  /* 追加の手順を選ぶための大まかな種類: "ios" | "android" | "desktop" */
  function platform() {
    var ua = nav().userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav().maxTouchPoints || 0) > 1)) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  /* Chrome などの「インストール」の申し出を取っておき、自分のボタンから出す */
  var deferred = null, installListeners = [];
  function fireInstall() { installListeners.forEach(function (fn) { try { fn(); } catch (e) { /* 画面の都合 */ } }); }
  function canPromptInstall() { return !!deferred; }
  function promptInstall() {
    if (!deferred) return Promise.resolve("unavailable");
    var ev = deferred; deferred = null; fireInstall();
    try { ev.prompt(); } catch (e) { return Promise.resolve("unavailable"); }
    return Promise.resolve(ev.userChoice).then(function (c) { return (c && c.outcome) || "dismissed"; }, function () { return "dismissed"; });
  }
  function onInstallChange(fn) { installListeners.push(fn); }

  /* ---------- 端末の保存 ---------- */
  function storageApi() { return nav().storage; }
  function persisted() {
    var s = storageApi();
    if (!s || !s.persisted) return Promise.resolve(null); // 調べられない
    return s.persisted().catch(function () { return null; });
  }
  function persist() {
    var s = storageApi();
    if (!s || !s.persist) return Promise.resolve(null);
    return s.persist().catch(function () { return null; });
  }
  function estimate() {
    var s = storageApi();
    if (!s || !s.estimate) return Promise.resolve(null);
    return s.estimate().catch(function () { return null; });
  }

  /* ---------- Service Worker ---------- */
  var updateListeners = [], swReg = null, lastCheck = 0;
  function onUpdate(fn) { updateListeners.push(fn); }
  function secure() { return !!(root.isSecureContext || /^localhost$|^127\./.test((root.location || {}).hostname || "")); }
  function registerSW() {
    var sw = nav().serviceWorker;
    if (!sw || !secure()) return Promise.resolve(null);
    // 最初の登録（まだ Service Worker が無いとき）は「新しい版」ではないので知らせない
    var had = !!sw.controller;
    sw.addEventListener("controllerchange", function () {
      if (had) updateListeners.forEach(function (fn) { try { fn(); } catch (e) { /* 画面の都合 */ } });
      had = true;
    });
    // updateViaCache: "none" … sw.js そのものはブラウザの一時保存を使わずに毎回確かめる（古い版が残らないように）
    return sw.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      swReg = reg; lastCheck = Date.now();
      // 開いたままのアプリに戻ってきたときも、30分おきに新しい版を確かめる
      root.document.addEventListener("visibilitychange", function () {
        if (root.document.visibilityState === "visible" && Date.now() - lastCheck > 30 * 60 * 1000) checkUpdate();
      });
      return reg;
    }, function (e) { console.warn("Service Worker を登録できません", e); return null; });
  }
  function checkUpdate() {
    lastCheck = Date.now();
    return swReg ? Promise.resolve(swReg.update()).catch(function () {}) : Promise.resolve();
  }

  /* claude.ai の外（端末版）のときだけ動かす */
  function isLocal() { return !!(root.claude && root.claude.local); }
  if (root && root.document && root.addEventListener) {
    root.addEventListener("beforeinstallprompt", function (e) { if (!isLocal()) return; e.preventDefault(); deferred = e; fireInstall(); });
    root.addEventListener("appinstalled", function () { deferred = null; fireInstall(); });
    if (isLocal()) {
      if (root.document.readyState === "complete") registerSW();
      else root.addEventListener("load", function () { registerSW(); });
    }
  }

  var api = {
    build: build, FORMAT: FORMAT, FORMAT_VERSION: FORMAT_VERSION,
    makeBackup: makeBackup, backupFileName: backupFileName, parseBackup: parseBackup, summarize: summarize,
    isStandalone: isStandalone, platform: platform,
    canPromptInstall: canPromptInstall, promptInstall: promptInstall, onInstallChange: onInstallChange,
    persisted: persisted, persist: persist, estimate: estimate,
    onUpdate: onUpdate, checkUpdate: checkUpdate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) root.HubPWA = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
