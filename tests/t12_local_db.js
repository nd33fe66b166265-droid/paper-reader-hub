// 端末保存の部品（hub/local-db.js）そのもののテスト。fake-indexeddb（node で動く IndexedDB の偽物）の上で動かす。
// claude.ai のデータベース（tests/harness.js の makeDb）と同じふるまいかを確かめる。
"use strict";
const { IDBFactory } = require("fake-indexeddb");
const L = require("../hub/local-db.js");
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const idb = new IDBFactory();
  const db = await L.createDb({ indexedDB: idb });

  // set / get
  await db.collection("units").doc("u1").set({ source: "a", order: 1 });
  await db.collection("units").doc("u2").set({ source: "b", order: 2 });
  await db.collection("units").doc("u3").set({ source: "c", order: 3 });
  const g = await db.collection("units").doc("u1").get();
  ok(g.exists && g.data().source === "a", "doc.get で書いた値が読めない");
  const miss = await db.collection("units").doc("nope").get();
  ok(!miss.exists && miss.data() === null, "無いドキュメントが exists になっている");

  // 読んだ値は凍結されている
  let threw = false; try { "use strict"; g.data().source = "x"; } catch (e) { threw = true; }
  ok(threw || g.data().source === "a", "読んだ値を書き換えられる");
  ok(Object.isFrozen(g.data()), "読んだ値が凍結されていない");

  // where
  const ids = async (q) => (await q.get()).docs.map((d) => d.id).join(",");
  ok(await ids(db.collection("units").where("source", "in", ["a", "c"])) === "u1,u3", "where in");
  ok(await ids(db.collection("units").where("source", "not-in", ["a"])) === "u2,u3", "where not-in");
  ok(await ids(db.collection("units").where("source", "==", "b")) === "u2", "where ==");
  ok(await ids(db.collection("units").where("source", "in", ["a", "b"]).where("order", "==", 2)) === "u2", "where を重ねる");
  ok(await ids(db.collection("units")) === "u1,u2,u3", "コレクションの get");
  ok(await ids(db.collection("sources")) === "", "別のコレクションが混ざる");

  // update は入れ子を結合する（mergeDoc の使い方）。無いドキュメントには invalid_argument
  const col = db.collection("data/users/me");
  let code = null; try { await col.doc("log-2026-11").update({ entries: { a: { min: 1 } } }); } catch (e) { code = e.code; }
  ok(code === "invalid_argument", "無いドキュメントの update が invalid_argument にならない: " + code);
  await col.doc("sum-2026-11").set({ items: { s1: { text: "t", res: { overall: "ok", items: [1, 2] } } } });
  await col.doc("sum-2026-11").update({ items: { s1: { res: { correctedJa: "訳" } }, s2: { text: "u" } } });
  const sum = (await col.doc("sum-2026-11").get()).data();
  ok(sum.items.s1.text === "t" && sum.items.s1.res.overall === "ok" && sum.items.s1.res.correctedJa === "訳", "update の入れ子の結合: " + JSON.stringify(sum));
  ok(sum.items.s2.text === "u" && sum.items.s1.res.items.length === 2, "update で別の項目・配列が壊れた");
  await col.doc("sum-2026-11").update({ items: { s1: { res: { items: [9] } } } });
  ok(JSON.stringify((await col.doc("sum-2026-11").get()).data().items.s1.res.items) === "[9]", "update で配列は置き換え");

  // onSnapshot: すぐ1回、書くたびにもう1回。やめたら呼ばれない
  const seen = [];
  const un = db.collection("sources").onSnapshot((s) => seen.push(s.docs.map((d) => d.id).join(",")));
  await delay(30);
  await db.collection("sources").doc("a").set({ title: "A" });
  await delay(30);
  await db.collection("units").doc("u9").set({ source: "z" }); // 別のコレクションでは呼ばれない
  await delay(30);
  un();
  await db.collection("sources").doc("b").set({ title: "B" });
  await delay(30);
  ok(JSON.stringify(seen) === JSON.stringify(["", "a"]), "onSnapshot の呼ばれ方: " + JSON.stringify(seen));

  // delete
  await db.collection("units").doc("u9").delete();
  ok(!(await db.collection("units").doc("u9").get()).exists, "delete で消えない");

  // 開き直しても残る（再読み込みと同じ）
  db.close();
  const db2 = await L.createDb({ indexedDB: idb });
  ok((await db2.collection("data/users/me").doc("sum-2026-11").get()).data().items.s1.res.correctedJa === "訳", "開き直すと記録が消えている");
  ok(await ids(db2.collection("units")) === "u1,u2,u3", "開き直すと章が変わっている");

  // window.claude と同じ入口
  const c = L.createLocalClaude({ indexedDB: idb, name: "other" });
  ok((await (await c.use("user")).id()) === "me", "user.id() が me でない");
  ok((await c.use("sample")) === null, "sample は段階3まで null");
  const db3 = await c.use("db");
  ok(db3 && (await ids(db3.collection("units"))) === "", "名前の違うデータベースが混ざる");
  ok((await L.createLocalClaude({ indexedDB: null }).use("db")) === null || typeof indexedDB !== "undefined", "IndexedDB が無いとき db が null でない");

  console.log(JSON.stringify({ test: "t12_local_db.js", ok: !fail.length, fail }, null, 1));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ test: "t12_local_db.js", ok: false, errors: [String(e && e.stack || e)] })); process.exit(1); });
