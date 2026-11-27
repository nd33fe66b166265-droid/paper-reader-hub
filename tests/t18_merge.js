// 段階5: 2台の記録を合わせる（hub/merge.js と「保存」ダイアログの「合わせる」）。
//   1. 部品: カード（新しい方・片方だけ）、meta、学習時間（端末ごと）、手入力の記録（消した方）、要約（訳を足す）、
//      添削カード、読んだ位置、しまった資料、教材（章と本文は組で、今の端末を残す）、入力を書き換えない、
//      同じものどうしを合わせても変わらない
//   2. 「復習しなかった日」のずらし過ぎを、もう片方で復習した日の分だけ戻す。二度合わせても二重に戻さない
//   3. 画面: 端末A と 端末B で別々に学習 → A で書き出す → B で読み込んで「合わせる」→ 両方の記録が残る
"use strict";
const fs = require("fs"), path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const M = require("../hub/merge.js");
const PWA_SRC = fs.readFileSync(path.join(__dirname, "..", "hub", "pwa.js"), "utf8");
const MERGE_SRC = fs.readFileSync(path.join(__dirname, "..", "hub", "merge.js"), "utf8");
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;
const DAY = 86400000;
const U = "data/users/me";
const deepFreeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };
const doc = (rows, col, id) => (rows.find((r) => r.col === col && r.id === id) || {}).data;
const allCards = (rows) => Object.assign({}, ...rows.filter((r) => r.col === U && /^srs-/.test(r.id)).map((r) => r.data.cards));
// 日付（4時区切り）を作る: その日の正午
const at = (day) => new Date(day + "T12:00:00").getTime();

/* ---------- 1. 部品 ---------- */
{
  const t0 = at("2026-11-20");
  const cur = [
    { col: "sources", id: "s1", data: { title: "S1" } },
    { col: "units", id: "s1-a", data: { source: "s1", label: "A", v: 1 } },
    { col: "texts", id: "s1-a", data: { unit: "s1-a", blocks: [1] } },
    { col: U, id: "srs-0", data: { cards: { apple: { s: 2, last: t0, due: t0 + 3 * DAY, ivl: 3 }, both: { s: 2, last: t0 + DAY, due: t0 + 5 * DAY }, onlyA: { s: 1, last: t0 } } } },
    { col: U, id: "meta", data: { newPerDay: 15, day: "2026-11-21", newDone: 4, reviewsDone: 10, lastReview: "2026-11-21", skipThrough: "", revPerDay: 30 } },
    { col: U, id: "time-2026-11", data: { days: { "2026-11-21": { dA: { read: 100, review: 50 } }, "2026-11-20": { dA: { read: 10 } } } } },
    { col: U, id: "log-2026-11", data: { entries: { l1: { day: "2026-11-20", min: 10, at: 5 }, l2: { day: "2026-11-20", min: 20, at: 5 } } } },
    { col: U, id: "sum-2026-11", data: { items: { w1: { at: 10, text: "old", res: { overall: "x", correctedJa: "訳" } } } } },
    { col: U, id: "fixes", data: { cards: { f1: { ja: "A", at: 1 } } } },
    { col: U, id: "progress", data: { units: { "s1-a": { bi: 3, max: 9, n: 10, at: 100 } } } },
    { col: U, id: "archive", data: { sources: { s1: { on: true, at: 50 } } } },
  ];
  const inc = [
    { col: "sources", id: "s1", data: { title: "S1 (B)" } },
    { col: "sources", id: "s2", data: { title: "S2" } },
    { col: "units", id: "s1-a", data: { source: "s1", label: "A", v: 2 } },
    { col: "texts", id: "s1-a", data: { unit: "s1-a", blocks: [2] } },
    { col: "units", id: "s2-a", data: { source: "s2", label: "B" } },
    { col: "texts", id: "s2-a", data: { unit: "s2-a", blocks: [3] } },
    { col: "overviews", id: "s2", data: { source: "s2" } },
    { col: "data/users/u-claude", id: "srs-0", data: { cards: { apple: { s: 2, last: t0 + 2 * DAY, due: t0 + 9 * DAY, ivl: 7 }, both: { s: 2, last: t0 + DAY, due: t0 + 5 * DAY } } } },
    { col: "data/users/u-claude", id: "srs-3", data: { cards: { onlyB: { s: 2, last: t0, due: t0 + DAY } } } },
    { col: "data/users/u-claude", id: "meta", data: { newPerDay: 40, day: "2026-11-21", newDone: 7, reviewsDone: 3, lastReview: "2026-11-22", revPerDay: 99 } },
    { col: "data/users/u-claude", id: "time-2026-11", data: { days: { "2026-11-21": { dB: { review: 30 }, dA: { read: 80, review: 70 } } } } },
    { col: "data/users/u-claude", id: "log-2026-11", data: { entries: { l2: { del: true }, l3: { day: "2026-11-21", min: 5, at: 9 }, l4: { del: true } } } },
    { col: "data/users/u-claude", id: "sum-2026-11", data: { items: { w1: { at: 10, rewriteAt: 20, text: "new", res: { overall: "y" } }, w2: { at: 30 } } } },
    { col: "data/users/u-claude", id: "fixes", data: { cards: { f1: { ja: "B", at: 2 }, f2: { ja: "C" } } } },
    { col: "data/users/u-claude", id: "progress", data: { units: { "s1-a": { bi: 1, max: 4, n: 10, at: 200 }, "s2-a": { bi: 2, max: 2, at: 1 } } } },
    { col: "data/users/u-claude", id: "archive", data: { sources: { s1: { on: false, at: 60 } } } },
    { col: "data/users/u-claude", id: "future", data: { x: 1 } },
  ];
  const P = require("../hub/pwa.js");
  // バックアップの読み込み（parseBackup）は data/users/<だれか> を me に読み替える
  const parsed = P.parseBackup(JSON.stringify(P.makeBackup(inc)));
  ok(parsed.ok, "見本のバックアップが読めない: " + parsed.error);
  const incRows = parsed.ok ? parsed.rows : [];
  const curStr = JSON.stringify(cur), incStr = JSON.stringify(incRows);
  deepFreeze(cur); deepFreeze(incRows);
  let r;
  try { r = M.merge(cur, incRows); } catch (e) { errs.push("凍結した入力で merge が止まる: " + e.message); r = { rows: [], report: {} }; }
  ok(JSON.stringify(cur) === curStr && JSON.stringify(incRows) === incStr, "merge が入力を書き換えた");
  const rows = r.rows, rp = r.report;
  // カード
  const cards = allCards(rows);
  ok(cards.apple && cards.apple.ivl === 7, "後に学習した方のカードにならない: " + JSON.stringify(cards.apple));
  ok(cards.onlyA && cards.onlyB, "片方にしか無いカードが消えた");
  ok(doc(rows, U, "srs-3") && doc(rows, U, "srs-3").cards.onlyB, "カードが元のシャードに入らない");
  ok(Object.keys(cards).length === 4, "カードの数: " + Object.keys(cards));
  ok(rp.cardsAdded === 1 && rp.cardsNewer === 1, "カードの数え方: " + JSON.stringify(rp));
  // meta
  const m = doc(rows, U, "meta");
  ok(m.newPerDay === 15 && m.revPerDay === 30, "設定が今の端末のままでない: " + JSON.stringify(m));
  ok(m.newDone === 7 && m.reviewsDone === 10 && m.day === "2026-11-21", "同じ日の今日の数が大きい方でない: " + JSON.stringify(m));
  ok(m.lastReview === "2026-11-22", "最後に復習した日が新しい方でない: " + m.lastReview);
  {
    const r2 = M.merge(cur, [{ col: U, id: "meta", data: { day: "2026-11-22", newDone: 1, reviewsDone: 2 } }]);
    const m2 = doc(r2.rows, U, "meta");
    ok(m2.day === "2026-11-22" && m2.newDone === 1 && m2.reviewsDone === 2 && m2.newPerDay === 15, "日が違うとき、新しい日の数にならない: " + JSON.stringify(m2));
  }
  // 学習時間: 端末ごとに足し、同じ端末・同じ日は項目ごとに大きい方
  const tm = doc(rows, U, "time-2026-11").days;
  ok(JSON.stringify(tm["2026-11-21"]) === JSON.stringify({ dA: { read: 100, review: 70 }, dB: { review: 30 } }), "学習時間の合わせ方: " + JSON.stringify(tm["2026-11-21"]));
  ok(tm["2026-11-20"] && tm["2026-11-20"].dA.read === 10, "片方だけの日の学習時間が消えた");
  // 手入力の記録
  const lg = doc(rows, U, "log-2026-11").entries;
  ok(lg.l1 && lg.l2 && lg.l2.del && lg.l3 && lg.l4 && lg.l4.del, "手入力の記録の合わせ方: " + JSON.stringify(lg));
  ok(rp.logsAdded === 1, "足した手入力の記録の数（消した記録は数えない）: " + rp.logsAdded);
  // 要約
  const sm = doc(rows, U, "sum-2026-11").items;
  ok(sm.w1.text === "new" && sm.w1.res.correctedJa === "訳" && sm.w2, "要約の合わせ方: " + JSON.stringify(sm));
  // 添削カード・読んだ位置・しまった資料・知らない記録
  const fx = doc(rows, U, "fixes").cards;
  ok(fx.f1.ja === "A" && fx.f2, "添削カードの合わせ方: " + JSON.stringify(fx));
  const pg = doc(rows, U, "progress").units;
  ok(pg["s1-a"].bi === 1 && pg["s1-a"].max === 9 && pg["s2-a"], "読んだ位置の合わせ方: " + JSON.stringify(pg));
  ok(doc(rows, U, "archive").sources.s1.on === false, "しまった資料が新しい方でない");
  ok(doc(rows, U, "future") && doc(rows, U, "future").x === 1, "知らない記録が消えた");
  ok(!rows.some((r) => r.col !== U && /^data\//.test(r.col)), "記録が me 以外に入った");
  // 教材
  ok(doc(rows, "units", "s1-a").v === 1 && JSON.stringify(doc(rows, "texts", "s1-a").blocks) === "[1]", "両方にある章が今の端末の方でない（本文と組で）");
  ok(doc(rows, "sources", "s1").title === "S1", "両方にある資料が今の端末の方でない");
  ok(doc(rows, "units", "s2-a") && doc(rows, "texts", "s2-a") && doc(rows, "sources", "s2") && doc(rows, "overviews", "s2"), "片方にしか無い教材が足されない");
  ok(rp.unitsAdded === 1 && rp.unitsDiffer === 1 && rp.sourcesAdded === 1, "教材の数え方: " + JSON.stringify(rp));
  // 並び（dumpAll と同じ col, id の順）と、同じものどうし
  const sorted = [...rows].sort((a, b) => (a.col + "\n" + a.id < b.col + "\n" + b.id ? -1 : 1));
  ok(JSON.stringify(sorted.map((x) => x.col + "/" + x.id)) === JSON.stringify(rows.map((x) => x.col + "/" + x.id)), "並びが col, id の順でない");
  const same = M.merge(rows, rows);
  ok(JSON.stringify(same.rows) === JSON.stringify(rows), "同じものどうしを合わせると変わる");
  ok(same.report.cardsAdded === 0 && same.report.cardsNewer === 0 && same.report.unitsDiffer === 0, "同じものどうしの数え方: " + JSON.stringify(same.report));
  // 片方が空（新しい端末）なら、もう片方そのまま
  ok(JSON.stringify(M.merge([], rows).rows) === JSON.stringify(rows), "空の端末に合わせると中身が変わる");
}

/* ---------- 2. 復習しなかった日のずらし過ぎを戻す ---------- */
{
  // パソコン（A）: 11/20 に復習して、11/25 に開いた。11/21〜11/24 を「復習しなかった日」として4日ずらした
  // スマホ（B）: 11/21 と 11/22 に復習した（11/23・24 は本当にどこでも復習していない）
  const last = at("2026-11-20"), base = at("2026-11-26");
  const curA = [
    { col: U, id: "srs-0", data: { cards: { k1: { s: 2, last, due: base + 4 * DAY }, k2: { s: 2, last, due: base + 4 * DAY }, k9: { s: 3, last, due: 0 } } } },
    { col: U, id: "meta", data: { lastReview: "2026-11-20", skipThrough: "2026-11-24", shiftNote: { from: "2026-11-21", to: "2026-11-24", n: 4, day: "2026-11-25", moved: 2, seen: false } } },
  ];
  const incB = [
    // k1 はスマホでも同じ状態（スマホではずらしていない）。k2 はスマホで 11/22 に学習した
    { col: U, id: "srs-0", data: { cards: { k1: { s: 2, last, due: base }, k2: { s: 2, last: at("2026-11-22"), due: base + 10 * DAY }, k3: { s: 1, last: at("2026-11-21") } } } },
    { col: U, id: "meta", data: { lastReview: "2026-11-22" } },
    { col: U, id: "time-2026-11", data: { days: { "2026-11-21": { dB: { review: 300 } } } } },
  ];
  const r = M.merge(curA, incB), cards = allCards(r.rows);
  // ずらし過ぎ = 11/21・11/22 の2日。本当に復習しなかった 11/23・24 の2日分は残す
  ok(cards.k1.due === base + 2 * DAY, "ずらし過ぎを戻さない: " + (cards.k1.due - base) / DAY + " 日");
  ok(cards.k2.due === base + 10 * DAY, "後に学習したカードの期日が変わった");
  ok(cards.k9.due === 0 && cards.k3, "ずらしていないカードが変わった");
  ok(r.report.shiftFixed === 1, "戻したカードの数: " + r.report.shiftFixed);
  const m = doc(r.rows, U, "meta");
  ok(m.shiftNote && m.shiftNote.fixed === true && m.skipThrough === "2026-11-24" && m.lastReview === "2026-11-22", "合わせた後の meta: " + JSON.stringify(m));
  // 合わせた後に、もう一度同じスマホのバックアップを合わせても、二重に戻さない
  const r2 = M.merge(r.rows, incB);
  ok(allCards(r2.rows).k1.due === base + 2 * DAY, "二度合わせると二重に戻す: " + (allCards(r2.rows).k1.due - base) / DAY);
  // 逆向き（スマホで、パソコンのバックアップを合わせる）でも同じ期日になる
  const r3 = M.merge(incB, curA);
  ok(allCards(r3.rows).k1.due === base + 2 * DAY, "逆向きに合わせたときの期日: " + (allCards(r3.rows).k1.due - base) / DAY);
  // スマホでも復習していなかったなら、ずらしたまま
  const r4 = M.merge(curA, [{ col: U, id: "srs-0", data: { cards: { k1: { s: 2, last, due: base } } } }, { col: U, id: "meta", data: { lastReview: "2026-11-20" } }]);
  ok(allCards(r4.rows).k1.due === base + 4 * DAY, "本当に復習しなかった日のずれまで戻した: " + (allCards(r4.rows).k1.due - base) / DAY);
}

/* ---------- 3. 画面 ---------- */
const fix = H.loadFixtures();
function start(idb, opts = {}) {
  const out = { blobs: [] };
  const t = H.startHub({
    fix, localStorage: opts.ls || {},
    beforeParse(w) {
      w.claude = L.createLocalClaude({ indexedDB: idb });
      w.eval(PWA_SRC); w.eval(MERGE_SRC);
      w.URL.createObjectURL = (b) => { out.blobs.push(b); return "blob:test"; };
      w.URL.revokeObjectURL = () => {};
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
    await delay(250);
  };
  return t;
}
async function seed(idb) {
  const db = await L.createDb({ indexedDB: idb });
  for (const c of ["units", "texts", "sources", "overviews"]) for (const [id, d] of fix[c]) await db.collection(c).doc(id).set(d);
  db.close();
}
async function dump(idb, name) { const db = await L.createDb({ indexedDB: idb, name }); const r = await db.dumpAll(); db.close(); return r; }
async function study(t, n, g, memo) {
  t.$("tab-review").click();
  let rated = 0;
  for (let i = 0; i < n; i++) {
    await delay(80);
    const rv = t.$("revealBtn"); if (rv) rv.click();
    await delay(20);
    const b = t.$("reviewArea").querySelector(`[data-g="${g}"]`); if (!b) break;
    b.click(); rated++;
  }
  t.$("tab-today").click(); await delay(50);
  t.$("lgMin").value = "15"; t.$("lgMemo").value = memo;
  t.$("logForm").dispatchEvent(new t.w.Event("submit", { bubbles: true, cancelable: true }));
  await delay(100);
  return rated;
}

(async () => {
  // 端末A: 8枚「覚えた」→ 書き出す
  const idbA = new IDBFactory(); await seed(idbA);
  let t = start(idbA, { ls: { "hub-dev": "dPC" } });
  await delay(500);
  ok(await study(t, 8, 2, "studied on PC") === 8, "端末Aで8枚回せない");
  t.click(t.$("openApp")); t.click(t.$("apExport")); await delay(300);
  const text = t.out.blobs[0] ? await t.blobText(t.out.blobs[0]) : "{}";
  await t.stop();
  const cardsA = allCards(JSON.parse(text).docs || []);

  // 端末B: 3枚「忘れた」→ A のバックアップを合わせる
  const idbB = new IDBFactory(); await seed(idbB);
  t = start(idbB, { ls: { "hub-dev": "dPhone" } });
  await delay(500);
  ok(await study(t, 3, 0, "studied on phone") === 3, "端末Bで3枚回せない");
  t.click(t.$("openApp"));
  await t.pick("paper-reader-hub-2026-11-27.hubbackup.json", text);
  const conf = t.$("apResult").textContent;
  ok(t.$("apMerge") && /合わせますか/.test(conf) && /合わせた後/.test(conf), "合わせるの確かめが出ない: " + conf);
  const beforeB = await dump(idbB);
  const cardsB = allCards(beforeB);
  t.click(t.$("apMerge"));
  await delay(400);
  const rowsB = await dump(idbB);
  const cards = allCards(rowsB);
  const want = new Set([...Object.keys(cardsA), ...Object.keys(cardsB)]);
  ok(Object.keys(cards).length === want.size && Object.keys(cardsB).length === 3 && want.size === 8, `合わせた後のカードの数: ${Object.keys(cards).length}（A ${Object.keys(cardsA).length}・B ${Object.keys(cardsB).length}）`);
  // B で後に「忘れた」にしたカードは B の方（学習中 s=1）
  Object.keys(cardsB).forEach((k) => ok(cards[k] && cards[k].s === 1 && cards[k].last === cardsB[k].last, "後に学習した方のカードでない: " + k));
  const logs = rowsB.filter((r) => r.col === U && r.id.startsWith("log-")).map((r) => JSON.stringify(r.data)).join();
  ok(/studied on PC/.test(logs) && /studied on phone/.test(logs), "合わせた後に両方の手入力の記録が無い");
  const days = rowsB.filter((r) => r.col === U && r.id.startsWith("time-")).map((r) => JSON.stringify(r.data)).join();
  ok(/dPC/.test(days) && /dPhone/.test(days), "合わせた後に両方の端末の学習時間が無い: " + days.slice(0, 200));
  ok(JSON.stringify(await dump(idbB, "paper-reader-hub-undo")).includes("studied on phone") && !JSON.stringify(await dump(idbB, "paper-reader-hub-undo")).includes("studied on PC"), "合わせる前の状態を取っておいていない");
  ok(/記録を合わせました/.test(t.w.localStorage.getItem("hub-restored") || ""), "合わせた知らせ: " + t.w.localStorage.getItem("hub-restored"));
  // 合わせた後の画面は記録を書かない（開き直す前に、古い記録で上書きしない）
  t.w.dispatchEvent(new t.w.Event("pagehide")); await delay(200);
  ok(JSON.stringify(await dump(idbB)) === JSON.stringify(rowsB), "合わせた後の画面が記録を書いた");
  await t.stop();
  // 開き直すと両方の記録が出る
  t = start(idbB, { ls: { "hub-dev": "dPhone", "hub-restored": "記録を合わせました（テスト）。" } });
  await delay(600);
  ok(/studied on PC/.test(t.$("lgToday").textContent) && /studied on phone/.test(t.$("lgToday").textContent), "開き直した後に両方の記録が出ない: " + t.$("lgToday").textContent);
  await t.stop();
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t18_merge.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
