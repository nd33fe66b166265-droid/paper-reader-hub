// 段階4の画面: 「保存」ダイアログのバックアップの書き出し・戻す・戻す前に戻す、今日の画面の知らせ。
//   1. 端末A: 教材を入れて復習を5枚・学習の記録 → 「保存」→ 書き出す → ファイルの中身に記録がある
//   2. 端末B（空）: 壊れたファイルは読まない → 書き出したファイルで戻す → 確かめの表 → 置き換える
//      → 開き直すと、教材と記録が端末Aと同じ。置き換えた直後の画面の書き込み（pagehide）は記録を上書きしない
//   3. 端末B: 「戻す前の状態に戻す」→ 戻す前（記録の無い状態）に戻る
//   4. 今日の画面の知らせ（ホーム画面への追加 → 今はしない → バックアップのすすめ → 書き出すと消える）
//   5. claude.ai 版（window.claude が本物）のときは「保存」ボタンを出さない
"use strict";
const fs = require("fs"), path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const PWA_SRC = fs.readFileSync(path.join(__dirname, "..", "hub", "pwa.js"), "utf8");
const fix = H.loadFixtures();
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;

function start(idb, opts = {}) {
  const out = { blobs: [], reloads: 0 };
  const t = H.startHub({
    fix, localStorage: opts.ls || {},
    beforeParse(w) {
      w.claude = L.createLocalClaude({ indexedDB: idb });
      w.eval(PWA_SRC); // jsdom は <script src> を読まないので、pwa.js をここで動かす
      w.URL.createObjectURL = (b) => { out.blobs.push(b); return "blob:test"; };
      w.URL.revokeObjectURL = () => {};
      if (opts.standalone) w.matchMedia = (q) => ({ matches: /standalone/.test(q), addEventListener() {} });
    },
  });
  t.w.addEventListener("error", (e) => errs.push(e.message));
  t.out = out;
  t.stop = async () => { const db = await t.w.claude.use("db"); if (db) db.close(); t.w.close(); };
  t.blobText = (b) => new Promise((res) => { const r = new t.w.FileReader(); r.onload = () => res(r.result); r.readAsText(b); });
  t.pick = async (name, text) => {
    const inp = t.$("apFile");
    Object.defineProperty(inp, "files", { value: [new t.w.File([text], name, { type: "application/json" })], configurable: true });
    inp.dispatchEvent(new t.w.Event("change", { bubbles: true }));
    await delay(200);
  };
  return t;
}
async function seed(idb) {
  const db = await L.createDb({ indexedDB: idb });
  for (const c of ["units", "texts", "sources", "overviews"]) for (const [id, d] of fix[c]) await db.collection(c).doc(id).set(d);
  db.close();
}
async function dump(idb, name) { const db = await L.createDb({ indexedDB: idb, name }); const r = await db.dumpAll(); db.close(); return r; }
// 学習時間（time-）は画面を開いている間に増えるので、比べるときは除く
const noTime = (rows) => JSON.stringify(rows.filter((r) => !r.id.startsWith("time-")));
const cardsOf = (rows) => rows.filter((r) => r.col === "data/users/me" && r.id.startsWith("srs-")).reduce((n, r) => n + Object.keys(r.data.cards || {}).length, 0);

(async () => {
  /* ---------- 1. 端末A: 記録を作って書き出す ---------- */
  const idbA = new IDBFactory();
  await seed(idbA);
  let t = start(idbA);
  await delay(500);
  ok(!t.$("openApp").hidden, "端末版で「保存」ボタンが出ない");
  ok(/ホーム画面に追加できます/.test(t.$("appNote").textContent), "ホーム画面への追加の知らせが出ない: " + t.$("appNote").textContent);
  ok(/この端末の中だけ/.test(t.$("sPrivNote").textContent), "設定の説明が端末版になっていない");
  // 色のモード: 選ぶとすぐ変わり、上の帯の色（theme-color）も背景に合わせる。端末に覚える
  ok(!t.$("sThemeRow").hidden, "端末版で色のモードの設定が出ない");
  t.click(t.$("openSettings"));
  ok(t.$("sTheme").value === "system", "色のモードの初めが「端末に合わせる」でない");
  t.$("sTheme").value = "dark"; t.$("sTheme").dispatchEvent(new t.w.Event("change"));
  const metas = () => [...t.w.document.querySelectorAll('meta[name="theme-color"]')].map((m) => (m.getAttribute("media") || "") + m.getAttribute("content"));
  ok(t.w.document.documentElement.getAttribute("data-theme") === "dark" && t.w.localStorage.getItem("hub-theme") === "dark", "ダークを選んでも変わらない");
  ok(JSON.stringify(metas()) === '["#131419"]', "ダークのときの theme-color: " + metas());
  t.$("sTheme").value = "light"; t.$("sTheme").dispatchEvent(new t.w.Event("change"));
  ok(t.w.document.documentElement.getAttribute("data-theme") === "light" && JSON.stringify(metas()) === '["#F3F4F7"]', "ライトのときの theme-color: " + metas());
  t.$("sTheme").value = "system"; t.$("sTheme").dispatchEvent(new t.w.Event("change"));
  ok(!t.w.document.documentElement.hasAttribute("data-theme"), "「端末に合わせる」で data-theme が残る");
  t.w.document.getElementById("settings").open = false;
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
  t.$("lgMin").value = "25"; t.$("lgMemo").value = "backup test";
  t.$("logForm").dispatchEvent(new t.w.Event("submit", { bubbles: true, cancelable: true }));
  await delay(100);
  // 「今はしない」で追加の知らせを消すと、バックアップのすすめが出る
  t.click(t.$("appNote").querySelector("[data-ap-later]"));
  ok(/まだバックアップを書き出していません/.test(t.$("appNote").textContent), "バックアップのすすめが出ない: " + t.$("appNote").textContent);
  // 「保存」を開いて書き出す（600ms の書き込み待ちを待たずに書き出しても、最新の記録が入る）
  t.click(t.$("openApp"));
  ok(t.$("appDlg").open, "「保存」のダイアログが開かない");
  ok(/まだ書き出していません/.test(t.$("apLast").textContent), "最後に書き出した時刻の表示: " + t.$("apLast").textContent);
  ok(/ホーム画面に追加/.test(t.$("apInstall").textContent), "ホーム画面に追加の案内が無い");
  ok(/開発版/.test(t.$("apBuild").textContent), "版の表示: " + t.$("apBuild").textContent);
  t.click(t.$("apExport"));
  await delay(300);
  ok(t.out.blobs.length === 1, "書き出しでファイルを作らない: " + t.out.blobs.length);
  const text = t.out.blobs[0] ? await t.blobText(t.out.blobs[0]) : "{}";
  const bk = JSON.parse(text);
  ok(bk.format === "paper-reader-hub-backup" && Array.isArray(bk.docs), "書き出したファイルの形: " + text.slice(0, 100));
  const cardsA = cardsOf(bk.docs || []);
  ok(cardsA >= 5, "書き出したファイルに復習カードが無い: " + cardsA);
  ok(text.includes("backup test"), "書き出したファイルに学習の記録が無い（書き込み待ちの記録が入っていない）");
  ok((bk.docs || []).filter((r) => r.col === "units").length === fix.units.size, "書き出したファイルの章の数");
  ok(/書き出しました/.test(t.$("toast").textContent), "書き出した知らせ: " + t.$("toast").textContent);
  ok(!/バックアップ/.test(t.$("appNote").textContent), "書き出したのにバックアップのすすめが残る: " + t.$("appNote").textContent);
  ok(!/まだ書き出していません/.test(t.$("apLast").textContent), "書き出した時刻が出ない");
  await t.stop();

  /* ---------- 2. 端末B: 戻す ---------- */
  const idbB = new IDBFactory();
  t = start(idbB, { standalone: true });
  await delay(400);
  ok(/ホーム画面から開いています/.test((t.click(t.$("openApp")), t.$("apInstall").textContent)), "ホーム画面から開いたときの表示: " + t.$("apInstall").textContent);
  ok(!/ホーム画面に追加できます/.test(t.$("appNote").textContent), "ホーム画面から開いているのに追加の知らせが出る");
  // 壊れたファイル・ほかのファイルは読まず、何も変えない
  await t.pick("notes.json", '{"hello": 1}');
  ok(/バックアップではありません/.test(t.$("apResult").textContent), "ほかのファイルを知らせない: " + t.$("apResult").textContent);
  await t.pick("broken.hubbackup.json", text.slice(0, 200));
  ok(/JSON/.test(t.$("apResult").textContent), "壊れたファイルを知らせない: " + t.$("apResult").textContent);
  ok(!t.$("apGo"), "壊れたファイルで「置き換える」が出る");
  ok((await dump(idbB)).length === 0, "壊れたファイルで中身が変わった");
  // 書き出したファイルで戻す
  const beforeB = await dump(idbB); // 起動しただけでも設定（meta）などは書かれる
  ok(cardsOf(beforeB) === 0, "端末B に初めから復習カードがある");
  await t.pick("paper-reader-hub-2026-11-27.hubbackup.json", text);
  const conf = t.$("apResult").textContent;
  ok(t.$("apGo") && /置き換えますか/.test(conf) && conf.includes(cardsA + " 枚") && conf.includes("0 枚"), "確かめの表が出ない: " + conf);
  t.click(t.$("apGo"));
  await delay(400);
  const rowsB = await dump(idbB);
  ok(JSON.stringify(rowsB) === JSON.stringify(bk.docs), "戻した中身が書き出したものと違う");
  { const u = await dump(idbB, "paper-reader-hub-undo"); ok(noTime(u) === noTime(beforeB), "戻す前の状態を取っておいていない: " + JSON.stringify(u).slice(0, 300) + " / " + JSON.stringify(beforeB).slice(0, 300)); }
  // 置き換えた後の画面は記録を書かない（開き直す前に、古い記録で上書きしない）
  t.w.dispatchEvent(new t.w.Event("pagehide"));
  await delay(200);
  ok(JSON.stringify(await dump(idbB)) === JSON.stringify(bk.docs), "置き換えた後の画面が記録を書いた");
  await t.stop();
  // 開き直す
  t = start(idbB, { standalone: true, ls: { "hub-restored": "バックアップから戻しました（テスト）。" } });
  await delay(600);
  ok(t.$("lgToday").textContent.includes("backup test"), "戻した後に学習の記録が出ない: " + t.$("lgToday").textContent);
  ok(/バックアップから戻しました/.test(t.$("toast").textContent), "戻した知らせが出ない: " + t.$("toast").textContent);
  ok(t.w.localStorage.getItem("hub-restored") === null, "戻した知らせを消していない");
  t.$("tab-read").click(); await delay(200);
  ok(t.$("view-read").textContent.length > 200, "戻した後に読む画面に教材が出ない");

  /* ---------- 3. 戻す前の状態に戻す ---------- */
  t.w.localStorage.setItem("hub-undo-at", String(Date.now()));
  t.click(t.$("openApp"));
  ok(!t.$("apUndoRow").hidden, "「戻す前の状態に戻す」が出ない");
  t.click(t.$("apUndo")); await delay(200);
  ok(t.$("apGo") && /戻す前の状態で/.test(t.$("apResult").textContent), "戻す前の状態の確かめが出ない: " + t.$("apResult").textContent);
  t.click(t.$("apGo")); await delay(400);
  ok(noTime(await dump(idbB)) === noTime(beforeB), "戻す前の状態に戻らない");
  ok(noTime(await dump(idbB, "paper-reader-hub-undo")) === noTime(bk.docs), "戻す前に戻すと、その前の中身を取っておかない");
  await t.stop();

  /* ---------- 5. claude.ai 版 ---------- */
  const c = H.startHub({ fix, beforeParse(w) { w.eval(PWA_SRC); } });
  await delay(400);
  ok(c.$("openApp").hidden && !c.$("appNote").textContent, "claude.ai 版で「保存」や知らせが出る");
  ok(c.$("sThemeRow").hidden, "claude.ai 版で色のモードの設定が出る");
  ok(/アカウント/.test(c.$("sPrivNote").textContent), "claude.ai 版の設定の説明が変わった");
  errs.push(...c.errs);
  c.w.close();
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t17_backup.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
