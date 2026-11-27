// 教材の取り込み（段階2）。hub/import.js（組み立てと点検）と、ハブの「教材」ダイアログを確かめる。
//   1. 組み立て: 見本（hub/samples/）を tools/build_unit.py と同じ形に組み立てる（Python の出力と1文字も違わない）
//   2. 点検: 誤りの種類ごとに、行番号つきで知らせ、書き込むものを作らない
//   3. 画面: 空の端末で「見本で試す」→ 取り込む → 今日・読む（全体図も）・復習に出る
//      ファイルを選ぶ・貼り付ける、誤りのあるファイルは取り込まない、差し替え（記録は残る）、削除
//   4. claude.ai 版（window.claude が本物）のときは「教材」ボタンを出さない
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const I = require("../hub/import.js");
const SAMPLES = path.join(__dirname, "..", "hub", "samples");
const UNIT_TXT = fs.readFileSync(path.join(SAMPLES, "demo-unit.txt"), "utf8");
const OV_JSON = fs.readFileSync(path.join(SAMPLES, "demo-overview.json"), "utf8");
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;
const msgs = (r) => r.items.flatMap((i) => i.errors.map((e) => (e.line ? e.line + ": " : "") + e.msg));

/* ---------- 1. 組み立てが build_unit.py と同じか ---------- */
function compareWithPython() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hubimp-"));
  // build_unit.py は order と source-order を求めるので書き足す（アプリは無ければ自分で決める）
  const txt = UNIT_TXT.replace(/^toc: (.*)$/m, "toc: $1\norder: 1\nsource-order: 1");
  fs.writeFileSync(path.join(dir, "u.txt"), txt);
  fs.mkdirSync(path.join(dir, "hub"));
  execFileSync("python3", [path.join(__dirname, "..", "tools", "build_unit.py"), path.join(dir, "hub"), path.join(dir, "u.txt"),
    "--overview", path.join(SAMPLES, "demo-overview.json")], { stdio: "pipe" });
  const idx = JSON.parse(fs.readFileSync(path.join(dir, "hub", "content", "index.json"), "utf8"));
  const r = I.analyze([{ name: "u.txt", text: txt }, { name: "o.json", text: OV_JSON }], {});
  ok(r.ok, "見本に誤りがある: " + msgs(r).join(" / "));
  ok(r.items.every((i) => !i.warnings.length), "見本に警告がある: " + JSON.stringify(r.items.map((i) => i.warnings)));
  const w = {}; r.writes.forEach(([c, id, d]) => { w[c + "/" + id] = d; });
  const same = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + " が build_unit.py と違う");
  same(w["units/demo-1"], idx.units["demo-1"], "units");
  same(w["texts/demo-1"], JSON.parse(fs.readFileSync(path.join(dir, "hub", "content", "texts", "demo-1.json"), "utf8")), "texts");
  same(w["sources/demo"], idx.sources.demo, "sources");
  same(w["overviews/demo"], JSON.parse(fs.readFileSync(path.join(dir, "hub", "content", "overviews", "demo.json"), "utf8")), "overviews");
  ok(r.writes.map((x) => x[0]).join(",") === "sources,overviews,texts,units", "書き込む順: " + r.writes.map((x) => x[0]));
  // Python の点検（check_hub_data.py）でも誤り0
  let pyOk = true; try { execFileSync("python3", [path.join(__dirname, "..", "tools", "check_hub_data.py"), "--content", path.join(dir, "hub")], { stdio: "pipe" }); } catch (e) { pyOk = false; }
  ok(pyOk, "check_hub_data.py で見本に誤りがある");
  fs.rmSync(dir, { recursive: true, force: true });
  // order を書かないとき: 新しい資料なら 1、既存の資料なら最後＋1、差し替えなら元のまま
  const ctx = { units: { "demo-0": { source: "demo", order: 4, blocks: [] } }, sources: { demo: { title: "x", order: 2 } }, overviews: {} };
  const r2 = I.analyze([{ name: "u.txt", text: UNIT_TXT }], ctx);
  ok(r2.items[0].stats.order === 5, "既存の資料に足した章の order: " + r2.items[0].stats.order);
  const r3 = I.analyze([{ name: "u.txt", text: UNIT_TXT }], { units: { "demo-1": { source: "demo", order: 7, blocks: [] } }, sources: {}, overviews: {} });
  ok(r3.items[0].replace && r3.items[0].stats.order === 7, "差し替えで order が変わった");
}

/* ---------- 2. 点検: 誤りを行番号つきで知らせる ---------- */
function lineOf(txt, re) { return txt.split("\n").findIndex((l) => re.test(l)) + 1; }
function checkErrors() {
  const ov = { units: {}, sources: {}, overviews: {} };
  const cases = [
    ["voc の品詞", UNIT_TXT.replace("voc: efficient | 形 |", "voc: efficient | 形容詞 |"), /^voc: efficient/, /品詞「形容詞」/],
    ["phr の一致部分", UNIT_TXT.replace("| is worth reading |", "| is worthy of reading |"), /^phr: be worth/, /原文中の一致部分/],
    ["ブロックの en が無い", UNIT_TXT.replace(/^en: Figures? .*$|^en: After the abstract.*$/m, "# (en を消した)"), /^sec: 2 Look/, /ブロック2: en:/, -1], // ブロックの頭（---）の行
    ["知らないキー", UNIT_TXT.replace("note: セミコロン", "nots: セミコロン"), /^nots:/, /使えないキー「nots:」/],
    ["--- を忘れた", UNIT_TXT.replace("---\nsec: 3 Read the Body\n", "sec: 3 Read the Body\n"), /^sec: 3 Read/, /2回あります/],
    ["使えないタグ", UNIT_TXT.replace("<t>map</t>", "<a href='x'>map</a>"), /^en: Only after/, /使えないタグ <a>/],
    ["語尾の分断", UNIT_TXT.replace("<t>quantity</t> changes", "<t>quantity</t>-ing changes"), /^en: After the abstract/, /語尾が分かれて/],
    ["toc が全体図に無い", UNIT_TXT.replace("toc: 1, 2, 3", "toc: 1, 2, 9"), /^toc:/, /toc の「9」/],
    ["章ID の文字", UNIT_TXT.replace("id: demo-1", "id: デモ1"), /^id:/, /id（章ID）に使えない文字/],
  ];
  for (const [name, txt, lineRe, msgRe, off = 0] of cases) {
    const r = I.analyze([{ name: "u.txt", text: txt }, { name: "o.json", text: OV_JSON }], ov);
    const u = r.items.find((i) => i.kind === "unit");
    ok(!r.ok && !r.writes.length && u.errors.length && !u.writes.length, name + ": 誤りにならない");
    const hit = u.errors.find((e) => msgRe.test(e.msg));
    ok(hit, name + ": 知らせの文が違う: " + msgs(r).join(" / "));
    const want = lineOf(txt, lineRe) + off;
    ok(hit && hit.line === want, `${name}: 行番号 ${hit && hit.line}（${want} のはず）`);
  }
  // 全体図の誤り
  const bad = JSON.parse(OV_JSON);
  bad.figure.svg = bad.figure.svg.replace("<svg ", "<svg onload=\"x()\" ").replace("</svg>", "<script>x()</script><image href=\"http://e/x.png\"/></svg>");
  bad.toc.items.push({ id: "1", num: "1b", en: "dup", ja: "重複" });
  const rb = I.analyze([{ name: "o.json", text: JSON.stringify(bad) }], ov);
  const em = msgs(rb).join(" / ");
  ok(!rb.ok && /onload/.test(em) && /script/.test(em) && /href/.test(em) && /重複/.test(em), "全体図の誤りを見つけない: " + em);
  ok(!I.analyze([{ name: "o.json", text: "{ broken" }], ov).ok, "壊れた JSON が通る");
  ok(!I.analyze([{ name: "o.json", text: JSON.stringify({ source: "demo" }) }], ov).ok, "toc の無い全体図が通る");
  // 同じ章を2つ
  ok(!I.analyze([{ name: "a.txt", text: UNIT_TXT }, { name: "b.txt", text: UNIT_TXT }], ov).ok, "同じ章ID を2つ選んでも通る");
  // 資料の情報が無い新しい資料は、全体図の見出しで登録して警告
  const noSrc = UNIT_TXT.replace(/^source-.*\n/gm, "");
  const rn = I.analyze([{ name: "u.txt", text: noSrc }, { name: "o.json", text: OV_JSON }], ov);
  const sw = rn.writes.find((x) => x[0] === "sources");
  ok(rn.ok && sw && sw[2].title === JSON.parse(OV_JSON).header.title, "資料の情報が無いとき全体図の見出しを使わない");
  ok(rn.items.some((i) => i.warnings.some((w) => /source-title/.test(w.msg))), "資料の情報が無い警告が出ない");
}

/* ---------- 3. 画面 ---------- */
const idb = new IDBFactory();
function start() {
  const fetches = [];
  const t = H.startHub({
    fix: H.loadFixtures(),
    beforeParse(w) {
      w.claude = L.createLocalClaude({ indexedDB: idb });
      w.HubImport = I; // jsdom は <script src> を読まないので、import.js をここで渡す
      w.fetch = async (url) => {
        const p = new URL(url, w.location.href).pathname.replace(/^\//, "");
        fetches.push(p);
        const f = path.join(__dirname, "..", "hub", p);
        const there = p.startsWith("samples/") && fs.existsSync(f);
        return there ? { ok: true, status: 200, text: async () => fs.readFileSync(f, "utf8"), json: async () => JSON.parse(fs.readFileSync(f, "utf8")) }
          : { ok: false, status: 404, text: async () => "", json: async () => { throw new Error("404"); } };
      };
    },
  });
  t.w.addEventListener("error", (e) => errs.push(e.message));
  t.fetches = fetches;
  t.stop = async () => { const db = await t.w.claude.use("db"); if (db) db.close(); t.w.close(); };
  return t;
}
async function dbDocs(col) {
  const db = await L.createDb({ indexedDB: idb });
  const s = await db.collection(col).get(); db.close();
  return new Map(s.docs.map((d) => [d.id, d.data()]));
}
async function ui() {
  let t = start();
  const { $, w } = t;
  await delay(500);
  ok(!$("openImport").hidden, "端末保存のとき「教材」ボタンが出ない");
  ok(/まだ教材が登録されていません/.test($("sourceList").textContent), "空のときの案内: " + $("sourceList").textContent);
  // 空の案内のボタンから開く
  $("sourceList").querySelector("[data-open-import]").click();
  await delay(100);
  ok($("importDlg").open, "「教材を追加」でダイアログが開かない");
  ok(/まだありません/.test($("imList").textContent), "取り込んだ教材の一覧が空と出ない");

  // --- 見本で試す → 取り込む ---
  $("imSample").click(); await delay(300);
  ok(t.fetches.includes("samples/demo-unit.txt") && t.fetches.includes("samples/demo-overview.json"), "見本を読まない: " + t.fetches);
  ok($("imResult").querySelectorAll(".im-item").length === 2, "点検の結果が2つ出ない");
  ok(/新しく追加/.test($("imResult").textContent) && /3 段落 · 16 語 · 表現 9/.test($("imResult").textContent), "点検の結果: " + $("imResult").textContent);
  ok((await dbDocs("units")).size === 0, "取り込む前に書いた");
  $("imGo").click(); await delay(500);
  const units = await dbDocs("units"), texts = await dbDocs("texts"), srcs = await dbDocs("sources"), ovs = await dbDocs("overviews");
  ok(units.has("demo-1") && texts.has("demo-1") && srcs.has("demo") && ovs.has("demo"), "書き込まれていない: " + [...units.keys(), ...srcs.keys()]);
  ok(/取り込みました/.test($("imResult").textContent), "取り込んだ知らせが出ない");
  ok(/How to Read a Research Paper/.test($("imList").textContent) && /demo-1/.test($("imList").textContent), "一覧に出ない: " + $("imList").textContent);
  ok(/見本① How to Read a Research Paper/.test($("sourceList").textContent), "今日タブの教材に出ない: " + $("sourceList").textContent);

  // --- 読む（全体図も） ---
  $("imResult").querySelector("[data-im-read]").click(); await delay(400);
  ok(!$("importDlg").open, "「読む」でダイアログが閉じない");
  ok($("rdBody").querySelectorAll(".para").length === 3, "読む画面の段落の数: " + $("rdBody").querySelectorAll(".para").length);
  ok(/Only after these two steps/.test($("rdBody").textContent), "本文が出ない");
  const ovBtn = $("rdOvWrap").querySelector("button"); if (ovBtn && !$("rdOvWrap").querySelector("svg")) { ovBtn.click(); await delay(200); }
  ok($("rdOvWrap").querySelectorAll(".ov-node").length === 3, "全体図が出ない: " + $("rdOvWrap").innerHTML.slice(0, 200));

  // --- 復習に出る。1枚評価する ---
  t.$("tab-review").click(); await delay(200);
  const rv = $("revealBtn"); if (rv) rv.click(); await delay(30);
  const g = $("reviewArea").querySelector('[data-g="2"]');
  ok(g, "復習カードが出ない: " + $("reviewArea").textContent.slice(0, 200));
  if (g) g.click();
  await delay(1200);
  const cardsOf = async () => { const d = await dbDocs("data/users/me"); return [...d.keys()].filter((k) => k.startsWith("srs-")).reduce((n, k) => n + Object.keys(d.get(k).cards || {}).length, 0); };
  const nCards = await cardsOf();
  ok(nCards >= 1, "評価した記録が保存されない");

  // --- 誤りのあるファイル（貼り付け）: 取り込まない ---
  $("tab-today").click(); $("openImport").click(); await delay(150);
  $("imPaste").value = UNIT_TXT.replace("voc: efficient | 形 |", "voc: efficient | 形容詞 |").replace("id: demo-1", "id: demo-2");
  $("imPasteGo").click(); await delay(300);
  ok(/直す所 1/.test($("imResult").textContent) && !$("imGo") && /まだ取り込んでいません/.test($("imResult").textContent), "誤りのある貼り付けの表示: " + $("imResult").textContent.slice(0, 300));
  ok(/\d+行目/.test($("imResult").textContent), "行番号が出ない");
  ok(!(await dbDocs("units")).has("demo-2"), "誤りのある章を書いた");
  ok($("imCopy"), "直す所をコピーするボタンが無い");

  // --- 差し替え（ファイルを選ぶ）: 訳を変える。記録は残る ---
  const changed = UNIT_TXT.replace("ja: 研究論文を初めて読むことは、", "ja: 【改訂】研究論文を初めて読むことは、");
  const file = new w.File([changed], "demo-1.txt", { type: "text/plain" });
  Object.defineProperty($("imFile"), "files", { value: [file], configurable: true });
  $("imFile").dispatchEvent(new w.Event("change")); await delay(400);
  ok(/差し替え/.test($("imResult").textContent) && $("imGo") && /差し替えて取り込む/.test($("imGo").textContent), "差し替えの表示: " + $("imResult").textContent.slice(0, 300));
  $("imGo").click(); await delay(500);
  ok(/【改訂】/.test(JSON.stringify((await dbDocs("texts")).get("demo-1"))), "差し替えた本文が保存されない");
  ok(await cardsOf() === nCards, "差し替えで記録が変わった");
  $("imResult").querySelector("[data-im-read]").click(); await delay(400);
  ok(/【改訂】/.test($("rdBody").textContent), "差し替えた本文が読む画面に出ない（古い本文のまま）");

  // --- 削除 ---
  $("openImport").click(); await delay(150);
  $("imList").querySelector('[data-im-del="demo-1"]').click(); await delay(100);
  ok(/資料の情報と全体図も消します/.test($("imList").textContent), "最後の章を消すときの確認: " + $("imList").textContent);
  $("imList").querySelector('[data-im-del-yes="demo-1"]').click(); await delay(500);
  ok(!(await dbDocs("units")).size && !(await dbDocs("texts")).size && !(await dbDocs("sources")).size && !(await dbDocs("overviews")).size, "削除で消えていない");
  ok(await cardsOf() === nCards, "削除で記録が消えた");
  $("imClose").click(); $("tab-today").click(); await delay(150);
  ok(/まだ教材が登録されていません/.test($("sourceList").textContent), "削除のあと今日タブに残っている");
  await t.stop();

  // --- 4. claude.ai 版では出さない ---
  const c = H.startHub({ fix: H.loadFixtures() });
  await delay(400);
  ok(c.$("openImport").hidden && c.$("importLinkRow").hidden, "claude.ai 版で「教材」ボタンが出る");
  c.w.close();
}

(async () => {
  compareWithPython();
  checkErrors();
  await ui();
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t14_import.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
