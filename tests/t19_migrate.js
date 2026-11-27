// 段階6: claude.ai のハブから移す（tools/make_backup.py）
//   1. データベースの写し（ArtifactData の out_dir の形）＋同梱ファイル（content/）からバックアップを作る
//      → アプリの parseBackup が通す。同じ ID はファイルを優先。記録は data/users/me にまとめる
//   2. 誤り（2人分の記録・壊れた JSON・使えない ID）があればファイルを作らない
//   3. 空の端末で「保存」→ 読み込む → 置き換える → 開き直すと、全部の章・本文・カード・設定が出る
// 環境変数 MIGRATE_BACKUP=<作ったファイル> を渡すと、3. をそのファイルでも確かめる（本物の写しの確認用。リポジトリには入れない）
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const PWA = require("../hub/pwa.js");
const PWA_SRC = fs.readFileSync(path.join(__dirname, "..", "hub", "pwa.js"), "utf8");
const MERGE_SRC = fs.readFileSync(path.join(__dirname, "..", "hub", "merge.js"), "utf8");
const TOOL = path.join(__dirname, "..", "tools", "make_backup.py");
const FX = path.join(__dirname, "fixtures"), FF = path.join(__dirname, "fixtures_files");
const fix = H.loadFixtures();
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;
const readJ = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJ = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)); };

function run(args) {
  const r = cp.spawnSync("python3", ["-I", TOOL, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
/* fixtures/ を ArtifactData の out_dir と同じ並びに写し、記録を足す */
function makeDbDir(uids = ["u_TestUser0000000000000"]) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hubmig-"));
  for (const c of ["sources", "units", "texts", "overviews"]) {
    fs.mkdirSync(path.join(d, c), { recursive: true });
    for (const f of fs.readdirSync(path.join(FX, c))) fs.copyFileSync(path.join(FX, c, f), path.join(d, c, f));
  }
  const now = Date.now();
  for (const uid of uids) {
    const u = path.join(d, "data", "users", uid);
    writeJ(path.join(u, "meta.json"), { newPerDay: 7, phrPerDay: 2, order: "read", rate: 0.8, dailyMin: 45, revPerDay: 30, fixPerDay: 3 });
    writeJ(path.join(u, "srs-0.json"), { cards: { baba: { s: 2, ivl: 3, ease: 2.5, reps: 2, lapses: 0, due: now + 86400000, last: now - 86400000 }, babi: { s: 3 } } });
    writeJ(path.join(u, "progress.json"), { units: { "filesrc-1": { bi: 1, max: 1, n: 3, at: now - 3600000 } } });
    writeJ(path.join(u, "time-2026-11.json"), { days: { "2026-11-20": { "dev-old": { read: 600, review: 300 } } } });
  }
  return d;
}

function start(idb) {
  const out = { blobs: [] };
  const t = H.startHub({
    fix, localStorage: {},
    beforeParse(w) {
      w.claude = L.createLocalClaude({ indexedDB: idb });
      w.eval(PWA_SRC); w.eval(MERGE_SRC);
      w.URL.createObjectURL = (b) => { out.blobs.push(b); return "blob:test"; };
      w.URL.revokeObjectURL = () => {};
      w.fetch = async () => ({ ok: false, status: 404, json: async () => null }); // GitHub Pages には content/ が無い
    },
  });
  t.w.addEventListener("error", (e) => errs.push(e.message));
  t.stop = async () => { const db = await t.w.claude.use("db"); if (db) db.close(); t.w.close(); };
  t.pick = async (name, text) => {
    const inp = t.$("apFile");
    Object.defineProperty(inp, "files", { value: [new t.w.File([text], name, { type: "application/json" })], configurable: true });
    inp.dispatchEvent(new t.w.Event("change", { bubbles: true }));
    await delay(300);
  };
  return t;
}
async function dump(idb) { const db = await L.createDb({ indexedDB: idb }); const r = await db.dumpAll(); db.close(); return r; }

/* 空の端末に読み込んで（置き換える）、開き直して確かめる */
async function importAndCheck(text, label) {
  const bk = JSON.parse(text);
  const units = bk.docs.filter((r) => r.col === "units");
  const idb = new IDBFactory();
  let t = start(idb);
  await delay(400);
  t.click(t.$("openApp"));
  await t.pick("migrate.hubbackup.json", text);
  ok(t.$("apGo"), label + ": 読み込みの確かめが出ない: " + t.$("apResult").textContent);
  if (!t.$("apGo")) { await t.stop(); return; }
  t.click(t.$("apGo"));
  await delay(600);
  const rows = await dump(idb);
  ok(rows.filter((r) => r.col === "units").length === units.length, label + ": 置き換えた後の章の数");
  ok(rows.filter((r) => r.col === "texts").length === bk.docs.filter((r) => r.col === "texts").length, label + ": 置き換えた後の本文の数");
  const cards = (rs) => rs.filter((r) => r.col === "data/users/me" && r.id.startsWith("srs-")).reduce((n, r) => n + Object.keys(r.data.cards || {}).length, 0);
  ok(cards(rows) === cards(bk.docs), label + ": 復習カードの数が違う " + cards(rows) + " / " + cards(bk.docs));
  await t.stop();
  // 開き直す
  t = start(idb);
  await delay(800);
  t.$("tab-read").click(); await delay(300);
  const opts = [...t.$("shUnit").querySelectorAll("option")].map((o) => o.value).filter(Boolean);
  const archived = new Set();
  const arch = bk.docs.find((r) => r.col === "data/users/me" && r.id === "archive");
  if (arch && arch.data.sources) Object.entries(arch.data.sources).forEach(([s, v]) => { if (v && v.on) archived.add(s); });
  const visible = units.filter((r) => !archived.has(r.data.source) && Array.isArray(r.data.blocks));
  ok(opts.length === visible.length, label + ": 読む画面の章の数 " + opts.length + " / " + visible.length);
  // どの章も本文が出る（本文の無い章が無い）
  let missing = [];
  for (const id of opts) {
    t.$("shUnit").value = id; t.$("shUnit").dispatchEvent(new t.w.Event("change", { bubbles: true }));
    await delay(120);
    if (!(t.$("rdBody").textContent.length > 50) || /見つかりません/.test(t.$("rdBody").textContent)) missing.push(id);
  }
  ok(!missing.length, label + ": 本文が出ない章: " + missing.join(","));
  t.$("tab-today").click(); await delay(100);
  errs.push(...(t.errs || []));
  await t.stop();
  return { rows, opts };
}

(async () => {
  /* ---------- 1. 作る ---------- */
  const dbDir = makeDbDir();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hubmig-out-"));
  const out = path.join(outDir, "a.hubbackup.json");
  let r = run(["--db", dbDir, "--content", FF, "-o", out]);
  ok(r.code === 0 && fs.existsSync(out), "バックアップを作れない: " + r.out);
  ok(/復習カード 2/.test(r.out) && /章 8/.test(r.out), "数え上げの表示: " + r.out);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "{}";
  const p = PWA.parseBackup(text);
  ok(p.ok, "アプリが読めない: " + p.error);
  const bk = JSON.parse(text);
  const get = (col, id) => (bk.docs || []).find((x) => x.col === col && x.id === id);
  const idx = readJ(path.join(FF, "content", "index.json"));
  ok((bk.docs || []).filter((x) => x.col === "units").length === 8, "章の数（データベース5＋ファイルだけの章3）");
  ok(get("units", "filesrc-1") && get("texts", "filesrc-1") && get("sources", "filesrc") && get("overviews", "filesrc"), "ファイルだけの資料・章・全体図が入っていない");
  ok(JSON.stringify(get("units", "papera-2b").data) === JSON.stringify(idx.units["papera-2b"]), "同じ ID の章がファイルの方になっていない");
  ok(JSON.stringify(get("texts", "papera-2b").data) === JSON.stringify(readJ(path.join(FF, "content", "texts", "papera-2b.json"))), "同じ ID の本文がファイルの方になっていない");
  ok(JSON.stringify(get("overviews", "booka").data) === JSON.stringify(readJ(path.join(FF, "content", "overviews", "booka.json"))), "同じ ID の全体図がファイルの方になっていない");
  ok(JSON.stringify(get("units", "papera-2a").data) === JSON.stringify(readJ(path.join(FX, "units", "papera-2a.json"))), "データベースだけの章が変わった");
  ok((bk.docs || []).filter((x) => /^data\/users\//.test(x.col)).every((x) => x.col === "data/users/me"), "記録が data/users/me になっていない");
  ok(get("data/users/me", "meta") && get("data/users/me", "meta").data.newPerDay === 7, "設定（meta）が入っていない");
  ok(!text.includes("u_TestUser"), "利用者 ID がファイルに残っている");
  // content/ の1つ上を渡しても、content/ そのものを渡しても同じ。同梱ファイルなしならデータベースだけ
  const out2 = path.join(outDir, "b.hubbackup.json");
  r = run(["--db", dbDir, "--content", path.join(FF, "content"), "-o", out2]);
  ok(r.code === 0 && JSON.stringify(readJ(out2).docs) === JSON.stringify(bk.docs), "content/ を直接渡したときの結果が違う: " + r.out);
  r = run(["--db", dbDir, "-o", out2]);
  ok(r.code === 0 && readJ(out2).docs.filter((x) => x.col === "units").length === 5, "同梱ファイルなしで作れない: " + r.out);

  /* ---------- 2. 誤り ---------- */
  const bad = (dir, why, re) => {
    const o = path.join(outDir, "bad.hubbackup.json");
    if (fs.existsSync(o)) fs.unlinkSync(o);
    const x = run(["--db", dir, "--content", FF, "-o", o]);
    ok(x.code === 1 && !fs.existsSync(o) && re.test(x.out), why + ": " + x.code + " " + x.out);
  };
  bad(makeDbDir(["u_A", "u_B"]), "2人分の記録で止まらない", /2 人分/);
  { const d = makeDbDir(); fs.writeFileSync(path.join(d, "units", "papera-2a.json"), "{ broken"); bad(d, "壊れた JSON で止まらない", /JSON として読めません/); }
  { const d = makeDbDir(); fs.copyFileSync(path.join(FX, "units", "papera-2a.json"), path.join(d, "units", "bad id.json")); bad(d, "使えない ID で止まらない", /使えない文字/); }
  { const d = makeDbDir(); writeJ(path.join(d, "data", "users", "u_TestUser0000000000000", "fixes.json"), JSON.parse('{"cards":{"__proto__":{"x":1}}}')); bad(d, "__proto__ で止まらない", /__proto__/); }
  bad(path.join(outDir, "nothing"), "無いフォルダで止まらない", /フォルダがありません/);
  // 注意（ファイルは作る）: 本文の無い章
  { const d = makeDbDir(); fs.unlinkSync(path.join(d, "texts", "papera-2a.json"));
    const o = path.join(outDir, "warn.hubbackup.json"); const x = run(["--db", d, "-o", o]);
    ok(x.code === 0 && fs.existsSync(o) && /papera-2a の本文/.test(x.out), "本文の無い章の注意: " + x.out); }

  /* ---------- 3. 空の端末に読み込む ---------- */
  const res = await importAndCheck(text, "見本");
  if (res) {
    const meta = res.rows.find((x) => x.col === "data/users/me" && x.id === "meta");
    ok(meta && meta.data.newPerDay === 7 && meta.data.revPerDay === 30, "設定が移っていない: " + JSON.stringify(meta && meta.data));
    ok(res.opts.includes("filesrc-1") && res.opts.includes("booka-1-3"), "ファイルの章が読む画面に出ない");
  }
  if (process.env.MIGRATE_BACKUP) await importAndCheck(fs.readFileSync(process.env.MIGRATE_BACKUP, "utf8"), "本物");
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t19_migrate.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
