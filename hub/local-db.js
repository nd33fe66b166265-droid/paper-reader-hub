/* =========================================================
   端末保存の部品（段階1）
   ---------------------------------------------------------
   claude.ai の Artifact では window.claude.use("db" | "user" | "sample") が
   データベース・ユーザー・Claude 呼び出しを用意してくれる。GitHub Pages ではそれが無いので、
   同じ使い方の部品をブラウザの IndexedDB（端末の中のデータベース）で作って差し込む。
   ハブ本体（index.html）はほとんど変えずに動く。

   使える操作（ハブが使う範囲だけ。tests/harness.js の makeDb と同じ）:
     db.collection(p).where(f, "in" | "not-in" | "==", v)   … 何回でも重ねられる
     db.collection(p).get()                 → { docs: [{ id, exists, data() }] }
     db.collection(p).onSnapshot(fn, err)   → 今の中身をすぐ1回、書き込みのたびにもう1回 fn を呼ぶ。戻り値で購読をやめる
     db.collection(p).doc(id).get()         → { exists, data() }
     db.collection(p).doc(id).set(d)        … まるごと置き換え
     db.collection(p).doc(id).update(d)     … 入れ子のオブジェクトを結合（配列とそれ以外の値は置き換え）。
                                               無いドキュメントには code = "invalid_argument" で失敗（claude.ai と同じ）
     db.collection(p).doc(id).delete()
   読んだデータは凍結した写し（書き換えると TypeError）。claude.ai と同じで、ハブは {...元, 変える所} で写しを作る。

   user.id() は固定の "me"（ログインが無いので、この端末の利用者は1人）。
   sample（添削で Claude を呼ぶ部品）は null。端末版の添削は relay.js の「コピー＆貼り付け」の往復を使う（段階3）。

   保存の形: データベース "paper-reader-hub"、入れ物 "docs"、1件 = { col: コレクション, id, data }。

   バックアップ用（段階4。ハブ本体の claude.ai 版には無い操作）:
     db.dumpAll()          → [{ col, id, data }]  … 全部を1つの読み取りで取り出す（col, id の順）
     db.replaceAll(rows)   … 全部を消して rows に置き換える。1つの書き込みの中で行うので、途中で失敗したら元のまま
     db.freeze()           … 以後の set / update / delete を何もせずに成功扱いにする（戻す直前に、
                              画面に残った古い記録が戻した記録を上書きしないため。開き直すまで続く）
   replaceAll が終わると、同じ端末の他のタブにも知らせる（他のタブは freeze して開き直す）。
   ========================================================= */
(function (root) {
  "use strict";
  var DB_NAME = "paper-reader-hub", STORE = "docs", VERSION = 1;

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function freeze(v) {
    if (!v || typeof v !== "object") return v;
    Object.keys(v).forEach(function (k) { freeze(v[k]); });
    return Object.freeze(v);
  }
  // update の結合: 両方がオブジェクトなら中へ進み、それ以外は新しい値で置き換える
  function deepMerge(base, patch) {
    var out = isObj(base) ? Object.assign({}, base) : {};
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
    });
    return out;
  }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

  function openDb(idb, name) {
    return new Promise(function (res, rej) {
      var r = idb.open(name, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: ["col", "id"] }).createIndex("col", "col");
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(err("unavailable", "IndexedDB が他のタブで使われています")); };
    });
  }

  /* opts.indexedDB: 使う IndexedDB（既定: ブラウザのもの。テストでは fake-indexeddb を渡す）
     opts.name: データベースの名前（既定 "paper-reader-hub"） */
  function createDb(opts) {
    opts = opts || {};
    var idb = opts.indexedDB || (root && root.indexedDB);
    if (!idb) return Promise.resolve(null);
    return openDb(idb, opts.name || DB_NAME).then(function (d) {
      var listeners = new Map(); // コレクション → Set(再読込の関数)
      var chan = null;
      try { if (root && root.BroadcastChannel) chan = new root.BroadcastChannel("prh-db:" + (opts.name || DB_NAME)); } catch (e) { chan = null; }
      function notify(col, remote) {
        var set = listeners.get(col);
        if (set) set.forEach(function (fn) { fn(); });
        if (!remote && chan) try { chan.postMessage(col); } catch (e) { /* 他のタブへは届かなくてよい */ }
      }
      var frozen = false;
      if (chan) chan.onmessage = function (ev) {
        if (typeof ev.data === "string") notify(ev.data, true);
        else if (ev.data && ev.data.t === "replaced") { frozen = true; if (opts.onReplaced) opts.onReplaced(); else if (root && root.location && root.document) root.location.reload(); }
      };

      function tx(mode, fn) {
        return new Promise(function (res, rej) {
          var t = d.transaction(STORE, mode), out;
          Promise.resolve(fn(t.objectStore(STORE))).then(function (v) { out = v; }, function (e) { try { t.abort(); } catch (x) {} rej(e); });
          t.oncomplete = function () { res(out); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error || err("aborted", "書き込みを取り消しました")); };
        });
      }
      function readDoc(col, id) { return tx("readonly", function (s) { return reqP(s.get([col, id])); }); }
      function readCol(col) { return tx("readonly", function (s) { return reqP(s.index("col").getAll(col)); }); }
      function docSnap(id, data) { var f = freeze(clone(data)); return { id: id, exists: true, data: function () { return f; } }; }

      function query(col, filters) {
        function pick(rows) {
          return rows.filter(function (r) {
            return filters.every(function (f) {
              var x = r.data ? r.data[f[0]] : undefined;
              return f[1] === "in" ? f[2].indexOf(x) >= 0 : f[1] === "not-in" ? f[2].indexOf(x) < 0 : x === f[2];
            });
          }).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
        }
        function get() { return readCol(col).then(function (rows) { return { docs: pick(rows).map(function (r) { return docSnap(r.id, r.data); }) }; }); }
        return {
          where: function (f, op, v) {
            if (op !== "in" && op !== "not-in" && op !== "==") throw err("invalid_argument", "使えない条件です: " + op);
            return query(col, filters.concat([[f, op, v]]));
          },
          get: get,
          onSnapshot: function (fn, onErr) {
            var live = true, seq = 0;
            var run = function () {
              var my = ++seq;
              get().then(function (s) { if (live && my === seq) fn(s); }, function (e) { if (live && onErr) onErr(e); });
            };
            if (!listeners.has(col)) listeners.set(col, new Set());
            listeners.get(col).add(run);
            run();
            return function () { live = false; var s = listeners.get(col); if (s) s.delete(run); };
          },
          doc: function (id) {
            id = String(id);
            return {
              get: function () {
                return readDoc(col, id).then(function (r) { return r ? docSnap(id, r.data) : { id: id, exists: false, data: function () { return null; } }; });
              },
              set: function (data) {
                if (frozen) return Promise.resolve();
                if (!isObj(data)) return Promise.reject(err("invalid_argument", "オブジェクトを渡してください"));
                return tx("readwrite", function (s) { return reqP(s.put({ col: col, id: id, data: clone(data) })); }).then(function () { notify(col); });
              },
              update: function (data) {
                if (frozen) return Promise.resolve();
                if (!isObj(data)) return Promise.reject(err("invalid_argument", "オブジェクトを渡してください"));
                return tx("readwrite", function (s) {
                  return reqP(s.get([col, id])).then(function (r) {
                    if (!r) throw err("invalid_argument", "ドキュメントがありません: " + col + "/" + id);
                    return reqP(s.put({ col: col, id: id, data: deepMerge(r.data, data) }));
                  });
                }).then(function () { notify(col); });
              },
              delete: function () {
                if (frozen) return Promise.resolve();
                return tx("readwrite", function (s) { return reqP(s.delete([col, id])); }).then(function () { notify(col); });
              },
            };
          },
        };
      }
      function dumpAll() {
        return tx("readonly", function (s) { return reqP(s.getAll()); }).then(function (rows) {
          return rows.map(function (r) { return { col: r.col, id: r.id, data: clone(r.data) }; })
            .sort(function (a, b) { return a.col < b.col ? -1 : a.col > b.col ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
        });
      }
      function replaceAll(rows) {
        if (!Array.isArray(rows) || !rows.every(function (r) { return r && typeof r.col === "string" && typeof r.id === "string" && isObj(r.data); }))
          return Promise.reject(err("invalid_argument", "置き換える中身の形が違います"));
        return tx("readwrite", function (s) {
          return reqP(s.clear()).then(function () {
            return Promise.all(rows.map(function (r) { return reqP(s.put({ col: r.col, id: r.id, data: clone(r.data) })); }));
          });
        }).then(function () {
          if (chan) try { chan.postMessage({ t: "replaced" }); } catch (e) { /* 他のタブへは届かなくてよい */ }
          var cols = {}; rows.forEach(function (r) { cols[r.col] = 1; }); listeners.forEach(function (_, c) { cols[c] = 1; });
          Object.keys(cols).forEach(function (c) { notify(c, true); });
        });
      }
      return {
        collection: function (p) { return query(String(p), []); },
        dumpAll: dumpAll, replaceAll: replaceAll,
        freeze: function () { frozen = true; }, isFrozen: function () { return frozen; },
        close: function () { listeners.clear(); d.close(); if (chan) chan.close(); },
      };
    });
  }

  /* window.claude と同じ形の入口を作る */
  function createLocalClaude(opts) {
    var dbP = null;
    var getDb = function () { if (!dbP) dbP = createDb(opts).catch(function (e) { console.warn("IndexedDB を開けません", e); return null; }); return dbP; };
    return {
      local: true,
      // バックアップを戻すとき、「戻す前の状態」を別のデータベースに取っておくために使う（段階4）
      openDb: function (name) { return createDb(Object.assign({}, opts, { name: name })); },
      use: function (name) {
        if (name === "db") return getDb();
        if (name === "user") return Promise.resolve({ id: function () { return Promise.resolve("me"); } });
        return Promise.resolve(null); // sample など: 端末版では無し（添削は relay.js）
      },
    };
  }

  var api = { createDb: createDb, createLocalClaude: createLocalClaude, deepMerge: deepMerge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  // claude.ai の中で開いたとき（本物の window.claude があるとき）は何もしない
  if (root && root.document && !root.claude) root.claude = createLocalClaude();
  if (root && root.document) root.HubLocalDb = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
