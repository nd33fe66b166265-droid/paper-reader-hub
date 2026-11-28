// 端末保存の部品を差し込んだハブを起動し、記録が「再読み込み」の後も残るかを確かめる（段階1の終わりの目安）。
//   1回目: 空のデータベースで起動 → 空の状態で動く → 教材を入れて開き直す → 復習を5枚・学習の記録を1件
//   2回目: 同じデータベースで起動し直す → 復習の記録と学習の記録が残っている
// 引数 empty: 1回目の空の起動だけを確かめる
"use strict";
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const I = require("../hub/import.js");
const fix = H.loadFixtures();
const idb = new IDBFactory();
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;

function start() {
  const t = H.startHub({ fix, beforeParse(w) { w.claude = L.createLocalClaude({ indexedDB: idb }); w.HubImport = I; } });
  t.w.addEventListener("error", (e) => errs.push(e.message));
  t.stop = async () => { const db = await t.w.claude.use("db"); if (db) db.close(); t.w.close(); };
  return t;
}
async function seed() {
  const db = await L.createDb({ indexedDB: idb });
  for (const c of ["units", "texts", "sources", "overviews"]) for (const [id, d] of fix[c]) await db.collection(c).doc(id).set(d);
  db.close();
}
async function userDocs() {
  const db = await L.createDb({ indexedDB: idb });
  const s = await db.collection("data/users/me").get(); db.close();
  return new Map(s.docs.map((d) => [d.id, d.data()]));
}

(async () => {
  // --- 空のデータベース ---
  let t = start();
  await delay(500);
  ok(/まだ(リーダー|教材)が登録されていません/.test(t.w.document.body.textContent), "空のとき教材が無い案内が出ない");
  ok(!/データに接続できません|データベースを使えません|保存できない状態/.test(t.$("statusNote").textContent), "空の起動で接続できない表示: " + t.$("statusNote").textContent);
  // 段階7: 端末版の案内は「教材を取り込む」の言い方。教材の作り方（prompts/）への道がある
  t.$("tab-review").click(); await delay(50);
  ok(/教材を取り込むと/.test(t.$("reviewArea").textContent), "空の復習の案内が端末版の言い方でない: " + t.$("reviewArea").textContent);
  const howto = t.$("importDlg").querySelector('a[href$="/prompts/README.md"]');
  ok(howto && howto.getAttribute("rel") === "noopener", "教材ダイアログに教材の作り方への案内が無い");
  const terms = t.$("settings").querySelector('a[href$="/docs/terms.md"]');
  ok(terms && terms.getAttribute("rel") === "noopener", "設定に利用規約への案内が無い");
  await t.stop();
  if (process.argv[2] === "empty") return done();

  // --- 教材を入れて開き直し、復習と学習の記録をする ---
  await seed();
  t = start();
  await delay(500);
  t.$("tab-review").click();
  let rated = 0;
  for (let i = 0; i < 5; i++) {
    await delay(80);
    const rv = t.$("revealBtn"); if (rv) rv.click();
    await delay(20);
    const g = t.$("reviewArea").querySelector('[data-g="2"]'); if (!g) break;
    g.click(); rated++;
  }
  ok(rated === 5, "復習カードを5枚回せない: " + rated);
  t.$("tab-today").click(); await delay(50);
  t.$("lgMin").value = "25"; t.$("lgMemo").value = "local-db test";
  t.$("logForm").dispatchEvent(new t.w.Event("submit", { bubbles: true, cancelable: true }));
  await delay(1200); // flush（600ms）と書き込みを待つ
  const docs = await userDocs();
  const cards = [...docs.keys()].filter((k) => k.startsWith("srs-")).reduce((n, k) => n + Object.keys(docs.get(k).cards || {}).length, 0);
  ok(cards >= 5, "復習カードがデータベースに書かれていない: " + cards + " / " + [...docs.keys()]);
  const logDoc = [...docs.keys()].find((k) => k.startsWith("log-"));
  ok(logDoc && JSON.stringify(docs.get(logDoc)).includes("local-db test"), "学習の記録がデータベースに書かれていない: " + [...docs.keys()]);
  await t.stop();

  // --- 再読み込み ---
  t = start();
  await delay(600);
  ok(t.$("lgToday").textContent.includes("local-db test"), "開き直すと学習の記録が出ない: " + t.$("lgToday").textContent);
  t.$("tab-review").click(); await delay(100);
  const docs2 = await userDocs();
  const cards2 = [...docs2.keys()].filter((k) => k.startsWith("srs-")).reduce((n, k) => n + Object.keys(docs2.get(k).cards || {}).length, 0);
  ok(cards2 === cards, `開き直した後にカードの数が変わった: ${cards} → ${cards2}`);
  await t.stop();
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t13_local_boot.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
