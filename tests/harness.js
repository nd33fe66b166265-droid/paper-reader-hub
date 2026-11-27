// 学習ハブのテスト用ハーネス（jsdom + 偽のデータベース）
//
// ハブの HTML（本体だけ。<!doctype> や <head> の無い、Artifact に publish するのと同じファイル）を
// jsdom で動かし、window.claude.use("db" | "user" | "sample") を偽物に差し替える。
// 教材は fixtures/ の JSON から読む（作り方は README の「テスト」を参照）。
//
//   fixtures/units/<unitId>.json      units コレクション（目次）
//   fixtures/texts/<unitId>.json      texts コレクション（本文）
//   fixtures/overviews/<srcId>.json   overviews コレクション
//   fixtures/sources/<srcId>.json     sources コレクション
//   fixtures/user/<docId>.json        自分の記録（data/users/<uid>/）。無くてもよい（新規ユーザー扱い）
//
// 使い方:
//   const H = require("./harness");
//   const fix = H.loadFixtures();                       // 既定: tests/fixtures
//   const t = H.startHub({ fix, user: new Map(), scrollModel: false });
//   await t.delay(400); t.ok(cond, "msg"); ... ; t.finish({ extra });
//
// 環境変数 HUB で HTML の場所を変えられる（既定: ../hub.html → ../hub/index.html → ./hub.html）。
"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const unwrap = (v) => (v && v.data && typeof v.data === "object" && Object.keys(v).length <= 3 && !v.blocks && !v.header && !v.cards ? v.data : v);

function readDir(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(/\.json$/, ""), unwrap(JSON.parse(fs.readFileSync(path.join(d, f), "utf8")))]);
}

function loadFixtures(dir = path.join(__dirname, "fixtures")) {
  const fix = {
    units: new Map(readDir(path.join(dir, "units"))),
    texts: new Map(readDir(path.join(dir, "texts"))),
    overviews: new Map(readDir(path.join(dir, "overviews"))),
    sources: new Map(readDir(path.join(dir, "sources"))),
    user: new Map(readDir(path.join(dir, "user"))),
  };
  if (!fix.units.size) throw new Error("fixtures/units が空です。README の手順で fixtures を作ってください: " + dir);
  return fix;
}

function hubPath() {
  if (process.env.HUB) return path.resolve(process.env.HUB);
  const a = path.resolve(__dirname, "..", "hub.html");
  if (fs.existsSync(a)) return a;
  const b = path.resolve(__dirname, "..", "hub", "index.html"); // このリポジトリの置き場所
  return fs.existsSync(b) ? b : path.resolve(__dirname, "hub.html");
}

/* ---------- 偽のデータベース ----------
   ハブが使う範囲だけを実装する:
   collection(p).where(f, "in"|"not-in"|"==", v) / .get() / .onSnapshot(fn, err)
   collection(p).doc(id).get() / .set(d) / .update(d)
   update は data/users/ の無いドキュメントには code="invalid_argument" で失敗する（本物と同じ）。 */
function makeDb(fix, userStore, log, latency) {
  // 本物のデータベースと同じく、読んだデータは書き換えられない（凍結した写し）にする。HUB_NOFREEZE=1 で無効
  const freeze = (v) => { if (process.env.HUB_NOFREEZE || !v || typeof v !== "object") return v; const c = Array.isArray(v) ? v.map(freeze) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freeze(x)])); return Object.freeze(c); };
  const snap = (docs) => ({ docs: docs.map(([id, d]) => ({ id, data: () => freeze(d), exists: true })) });
  const all = (p) => p === "units" ? [...fix.units] : p === "sources" ? [...fix.sources]
    : p === "texts" ? [...fix.texts] : p === "overviews" ? [...fix.overviews]
    : p.startsWith("data/users/") ? [...userStore] : [];
  const mapOf = (p) => p === "texts" ? fix.texts : p === "overviews" ? fix.overviews : p === "units" ? fix.units
    : p === "sources" ? fix.sources : p.startsWith("data/users/") ? userStore : new Map();
  function query(p, filters) {
    const pick = () => all(p).filter(([, d]) => filters.every(([f, op, v]) =>
      op === "in" ? v.includes(d[f]) : op === "not-in" ? !v.includes(d[f]) : d[f] === v));
    const note = (r) => { if (p === "units") log.unitDocs.push(...r.map((x) => x[0])); };
    return {
      where: (f, op, v) => query(p, [...filters, [f, op, v]]),
      get: async () => { const r = pick(); note(r); return snap(r); },
      onSnapshot: (fn) => {
        let live = true;
        setTimeout(() => { if (!live) return; const r = pick(); note(r); fn(snap(r)); }, p === "sources" ? 1 : 5);
        return () => { live = false; };
      },
      doc: (id) => ({
        get: async () => {
          log.reads.push(p + "/" + id);
          if (p === "texts" || p === "overviews") await delay(latency);
          const d = mapOf(p).get(id);
          return d ? { exists: true, data: () => freeze(d) } : { exists: false, data: () => null };
        },
        set: async (d) => { log.writes.push(["set", p + "/" + id, d]); if (p.startsWith("data/users/")) userStore.set(id, d); },
        update: async (d) => {
          if (p.startsWith("data/users/") && !userStore.has(id)) {
            log.writes.push(["update-miss", p + "/" + id]);
            const e = new Error("no doc"); e.code = "invalid_argument"; throw e;
          }
          log.writes.push(["update", p + "/" + id, d]);
        },
      }),
    };
  }
  return { collection: (p) => query(p, []) };
}

/* ---------- ハブを起動する ----------
   opts.user        自分の記録の Map（既定: fixtures/user のコピー。空 Map なら新規ユーザー）
   opts.scrollModel true にすると、段落 .para が縦に 300px ずつ並んでいるとみなす（読む位置のテスト用）
   opts.localStorage 起動前に入れておく localStorage の値 {key: value}
   opts.sample      添削（claude.use("sample")）の偽物。既定は空の添削結果を返す
   opts.latency     本文・全体図を読むときの遅延 ms（既定 20） */
function startHub(opts = {}) {
  const fix = opts.fix || loadFixtures();
  const userStore = opts.user || new Map(fix.user);
  const log = { reads: [], unitDocs: [], writes: [], prompts: [] };
  const db = makeDb(fix, userStore, log, opts.latency ?? 20);
  const sample = opts.sample || Object.assign(async () => ({ text: "" }), {
    json: async (prompt) => { log.prompts.push(prompt); return { overall: "ok", corrected: "This section explains it.", items: [] }; },
  });
  const html = fs.readFileSync(hubPath(), "utf8");
  const scroll = { y: 0, PH: 300 };
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/",
    beforeParse(w) {
      Object.entries(opts.localStorage || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.claude = { use: async (n) => n === "db" ? db : n === "user" ? { id: async () => "u1" } : n === "sample" ? sample : null };
      w.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {}, addEventListener() {} };
      w.SpeechSynthesisUtterance = function (t) { this.text = t; };
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      if (w.HTMLDialogElement) w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      if (opts.scrollModel) {
        Object.defineProperty(w, "scrollY", { get: () => scroll.y, configurable: true });
        w.scrollTo = (x, y) => { scroll.y = typeof x === "object" ? (x.top || 0) : (y || 0); };
        w.Element.prototype.getBoundingClientRect = function () {
          if (this.id === "rdBar") return { top: 0, bottom: 60, left: 0, right: 800, width: 800, height: 60 };
          if (this.classList && this.classList.contains("para")) {
            const top = 100 + (+this.dataset.bi) * scroll.PH - scroll.y;
            return { top, bottom: top + scroll.PH - 20, left: 0, right: 800, width: 800, height: scroll.PH - 20 };
          }
          return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        };
        w.Element.prototype.scrollIntoView = function () { if (this.classList.contains("para")) scroll.y = 100 + (+this.dataset.bi) * scroll.PH - 60; };
        Object.defineProperty(w.Element.prototype, "scrollHeight", { get() { return this.tagName === "HTML" ? 100000 : 0; }, configurable: true });
      } else {
        w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
      }
      if (opts.beforeParse) opts.beforeParse(w);
    },
  });
  const w = dom.window;
  const errs = []; w.addEventListener("error", (e) => errs.push(e.message));
  const fail = [];
  const t = {
    w, fix, log, userStore, scroll, errs, fail, delay,
    $: (id) => w.document.getElementById(id),
    click: (el) => { if (!el) throw new Error("click: 要素がありません"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); },
    ok: (c, m) => { if (!c) fail.push(m); },
    finish(extra = {}) {
      console.log(JSON.stringify({ test: path.basename(require.main.filename), ok: !fail.length && !errs.length, errors: errs, fail, ...extra }, null, 1));
      process.exit(fail.length || errs.length ? 1 : 0);
    },
  };
  return t;
}

/* ---------- 教材から期待値を作るための小道具 ---------- */
const phrKey = (s) => "phr:" + String(s).replace(/\s+/g, " ").trim().toLowerCase();
const vocKey = (s) => String(s).toLowerCase().trim();
const stripTags = (h) => String(h).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function sortedUnits(fix, pred = () => true) {
  const so = (s) => (fix.sources.get(s) || {}).order ?? 999;
  return [...fix.units].filter(([, u]) => pred(u)).sort((a, b) => (so(a[1].source) - so(b[1].source)) || (a[1].order - b[1].order));
}
const encKey = (k) => k.replace(/[^a-z0-9]/g, (c) => "_" + c.charCodeAt(0).toString(16) + "_");

module.exports = { loadFixtures, startHub, delay, phrKey, vocKey, stripTags, sortedUnits, encKey, readDir };
