// 書くタブの添削（段階3）。端末版では Claude を直接呼ばず、自分の Claude との「コピー＆貼り付け」で往復する。
//   1. hub/relay.js の parseReply: コードブロック・前後の文章・最後のカンマを許し、崩れた返事は理由つきで断る
//   2. 画面: 添削する → 依頼文が出てコピーできる → 崩れた返事は保存せず知らせる → 正しい返事で結果が出て保存される
//   3. 往復の途中でアプリを閉じても、開き直すと続きから貼れる
//   4. 訳の無い古い結果の「訳を見る」も同じ往復で作って保存する
"use strict";
const { IDBFactory } = require("fake-indexeddb");
const H = require("./harness");
const L = require("../hub/local-db.js");
const R = require("../hub/relay.js");
const fix = H.loadFixtures();
const idb = new IDBFactory();
const fail = [], errs = [];
const ok = (c, m) => { if (!c) fail.push(m); };
const delay = H.delay;
const [UID, U] = H.sortedUnits(fix)[0];
const month = new Date().toISOString().slice(0, 7);
const OLD_ID = "old1", OLD_EN = "This chapter introduces signals and amplifiers.";
const SUMMARY = "This section explain how the sampling switch work.";
const NEW_EN = "This section explains how the sampling switch works.";
const NEW_JA = "この節は、サンプリングスイッチの動作を説明する。<img src=x onerror=\"window.__x=1\">";
const GOOD = { overall: "よく書けています。三単現の s に気をつけましょう。", corrected: NEW_EN, corrected_ja: NEW_JA,
  items: [{ level: "grammar", original: "explain", fixed: "explains", reason: "主語が三人称単数なので s が要ります。", ja: "この節は説明する", en_card: "This section explains it." }] };

/* ---------- 1. parseReply ---------- */
function unitTests() {
  const j = JSON.stringify(GOOD);
  const yes = (txt, kind, m) => { const r = R.parseReply(txt, kind); ok(r.ok, m + ": " + r.msg); return r.data; };
  const no = (txt, kind, re, m) => { const r = R.parseReply(txt, kind); ok(!r.ok && re.test(r.msg || ""), m + ": " + JSON.stringify(r)); };
  ok(yes(j, "fix", "そのままの JSON").corrected === NEW_EN, "corrected が取り出せない");
  yes("添削しました。\n\n```json\n" + JSON.stringify(GOOD, null, 2) + "\n```\n\n頑張ってください。", "fix", "コードブロックと前後の文");
  yes("Here it is: " + j + " 以上です。", "fix", "前後に文");
  yes('{"overall": "a { b", "corrected": "x } y \\" z", "items": [],}', "fix", "文字列の中の括弧・最後のカンマ");
  ok(yes('{"ja": "訳です"}', "ja", "訳").ja === "訳です", "訳が取り出せない");
  no("", "fix", /空/, "空");
  no("   \n ", "fix", /空/, "空白だけ");
  no("ありがとうございます！", "fix", /見つかりません/, "JSON が無い");
  no(j.slice(0, 60), "fix", /途中で切れて/, "途中で切れている");
  no('{"overall": "a" "corrected": "b"}', "fix", /形が崩れて/, "崩れた JSON");
  no('[1, 2]', "fix", /見つかりません|形が違います/, "配列");
  no('{"overall": "only"}', "fix", /corrected/, "直した英文が無い");
  no('{"corrected": "x", "items": "none"}', "fix", /items/, "items が配列でない");
  no('{"ja": "訳"}', "fix", /訳/, "訳の返事を添削に貼った");
  no(j, "ja", /訳（ja）/, "添削の返事を訳に貼った");
  no("# 学習者の要約\nfoo\n# 出力\n次の形のJSONだけを返す。\n{\"overall\": \"…\"}", "fix", /依頼文/, "依頼文を貼った");
}

/* ---------- 画面 ---------- */
let copied = null;
function start(ls) {
  const t = H.startHub({ fix, localStorage: ls, beforeParse(w) {
    w.claude = L.createLocalClaude({ indexedDB: idb });
    w.HubRelay = R; // jsdom は <script src> を読まないので、relay.js をここで渡す
    Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (s) => { copied = s; } }, configurable: true });
  } });
  t.w.addEventListener("error", (e) => errs.push(e.message));
  t.stop = async () => { const db = await t.w.claude.use("db"); if (db) db.close(); t.w.close(); };
  return t;
}
async function seed() {
  const db = await L.createDb({ indexedDB: idb });
  for (const c of ["units", "texts", "sources", "overviews"]) for (const [id, d] of fix[c]) await db.collection(c).doc(id).set(d);
  await db.collection("data/users/me").doc("sum-" + month).set({ items: {
    [OLD_ID]: { day: month + "-01", at: Date.now() - 86400000, unit: UID, unitLabel: U.label, text: "This chapter introduce signals.", ja: "",
      res: { overall: "ok", corrected: OLD_EN, items: [] }, rewrite: "" } } });
  db.close();
}
async function sums() {
  const db = await L.createDb({ indexedDB: idb });
  const d = await db.collection("data/users/me").doc("sum-" + month).get(); db.close();
  return (d.exists && d.data().items) || {};
}
const paste = (t, s) => { const ta = t.$("wrRelayReply"); ta.value = s; ta.dispatchEvent(new t.w.Event("input", { bubbles: true })); t.$("wrRelayRead").click(); };

(async () => {
  unitTests();
  await seed();

  // --- 2. 添削の往復 ---
  let t = start();
  await delay(500);
  t.$("tab-write").click(); await delay(50);
  ok(!/Claudeを呼べない/.test(t.$("wrNote").textContent), "端末版で「Claudeを呼べない」と出ている");
  t.$("wrUnit").value = UID; t.$("wrUnit").dispatchEvent(new t.w.Event("change"));
  t.$("wrText").value = SUMMARY; t.$("wrText").dispatchEvent(new t.w.Event("input"));
  ok(!t.$("wrCheck").disabled, "端末版で添削するボタンが押せない");
  ok(t.$("wrRelay").hidden, "最初から往復の欄が出ている");
  t.$("wrCheck").click(); await delay(150);
  ok(!t.$("wrRelay").hidden, "添削するを押しても往復の欄が出ない");
  const prompt = t.$("wrRelayPrompt") && t.$("wrRelayPrompt").value;
  ok(prompt && prompt.includes(SUMMARY) && prompt.includes('"corrected_ja"') && prompt.includes(U.label), "依頼文に要約・章・訳の依頼が無い");
  ok(prompt.includes("```json で始まるコードブロック1つに入れて返す") && !prompt.includes("次の形のJSONだけを返す"), "依頼文でコードブロックを頼んでいない");
  t.$("wrRelayCopy").click(); await delay(20);
  ok(copied === prompt, "依頼文をコピーできない");
  ok(/コピーしました/.test(t.$("wrRelayCopied").textContent), "コピーしたと出ない");
  // 頼む AI を選べる（Claude・Gemini・ChatGPT）。貼りかけの返事は残り、選んだものは端末に覚える
  const aiLink = () => [...t.$("wrRelay").querySelectorAll("a.link")].map((a) => a.href + " " + a.textContent).join();
  ok(/claude\.ai\/new .*Claude を開く/.test(aiLink()), "最初の頼む先が Claude でない: " + aiLink());
  t.$("wrRelayReply").value = "draft"; t.$("wrRelayReply").dispatchEvent(new t.w.Event("input", { bubbles: true }));
  t.click(t.$("wrRelay").querySelector('[data-relay-ai="gemini"]'));
  ok(/gemini\.google\.com.*Gemini を開く/.test(aiLink()) && /Gemini の返事/.test(t.$("wrRelay").textContent), "Gemini を選んでも変わらない: " + aiLink());
  ok(t.$("wrRelay").querySelector('[data-relay-ai="gemini"]').getAttribute("aria-checked") === "true", "選んだ AI に印が付かない");
  ok(t.$("wrRelayReply").value === "draft" && t.$("wrRelayPrompt").value === prompt, "AI を選び直すと貼りかけの返事か依頼文が消える");
  t.click(t.$("wrRelay").querySelector('[data-relay-ai="chatgpt"]'));
  ok(/chatgpt\.com.*ChatGPT を開く/.test(aiLink()), "ChatGPT を選んでも変わらない: " + aiLink());
  ok(t.w.localStorage.getItem("hub-wr-ai") === "chatgpt", "選んだ AI を覚えない");
  // 崩れた返事は保存しない
  const before = Object.keys(await sums()).length;
  paste(t, JSON.stringify(GOOD).slice(0, 80)); await delay(50);
  ok(/途中で切れて/.test(t.$("wrRelayErr").textContent), "途中で切れた返事を知らせない: " + t.$("wrRelayErr").textContent);
  paste(t, prompt); await delay(50);
  ok(/依頼文/.test(t.$("wrRelayErr").textContent), "依頼文を貼ったことを知らせない");
  ok(!t.$("wrRelay").hidden && !t.$("wrResult").textContent.trim(), "崩れた返事で結果が出た");
  // 貼り直すと知らせが消える
  t.$("wrRelayReply").value = "x"; t.$("wrRelayReply").dispatchEvent(new t.w.Event("input", { bubbles: true }));
  ok(!t.$("wrRelayErr").textContent, "貼り直しても知らせが残る");
  await delay(700);
  ok(Object.keys(await sums()).length === before, "崩れた返事で要約が保存された");
  // 正しい返事
  paste(t, "添削しました。\n```json\n" + JSON.stringify(GOOD, null, 2) + "\n```"); await delay(100);
  ok(t.$("wrRelay").hidden, "読み込んだ後も往復の欄が残る");
  ok(t.$("wrResult").textContent.includes(NEW_EN) && t.$("wrResult").textContent.includes("explains"), "添削結果が出ない");
  ok(t.$("wrText").value === "", "送った要約が書き欄に残っている");
  ok(t.w.localStorage.getItem("hub-wr-pending") === "null", "待っている依頼が消えない");
  t.click(t.$("wrJaBtn"));
  ok(t.$("wrJaBox") && t.$("wrJaBox").textContent === NEW_JA && !t.$("wrJaBox").querySelector("img") && t.w.__x === undefined, "訳が文字として出ない");
  ok(t.$("wrAddCards"), "添削カードにするボタンが無い");
  await delay(800);
  const s1 = Object.values(await sums()).find((e) => e.text === SUMMARY);
  ok(s1 && s1.res.corrected === NEW_EN && s1.res.correctedJa === NEW_JA && s1.res.items.length === 1 && s1.unit === UID, "添削結果が端末に保存されない: " + JSON.stringify(s1));
  await t.stop();

  // --- 3. 途中で閉じても続きから ---
  t = start();
  await delay(500);
  t.$("tab-write").click(); await delay(50);
  t.$("wrText").value = "Another summary for the test of relay."; t.$("wrText").dispatchEvent(new t.w.Event("input"));
  t.$("wrCheck").click(); await delay(150);
  const p2 = t.$("wrRelayPrompt").value;
  const ls = Object.fromEntries(Object.keys(t.w.localStorage).map((k) => [k, t.w.localStorage.getItem(k)])); // 同じ端末の localStorage を引き継ぐ
  await t.stop();
  t = start(ls);
  await delay(500);
  t.$("tab-write").click(); await delay(50);
  ok(!t.$("wrRelay").hidden && t.$("wrRelayPrompt").value === p2, "開き直すと待っている依頼が消える");
  paste(t, JSON.stringify({ overall: "ok", corrected: "Another summary for the relay test.", items: [] })); await delay(100);
  ok(t.$("wrRelay").hidden && t.$("wrResult").textContent.includes("Another summary for the relay test."), "開き直した後の返事を読み込めない");
  // やめる
  t.$("wrText").value = "One more summary to cancel later."; t.$("wrText").dispatchEvent(new t.w.Event("input"));
  t.$("wrCheck").click(); await delay(150);
  t.$("wrRelayCancel").click(); await delay(20);
  ok(t.$("wrRelay").hidden && t.w.localStorage.getItem("hub-wr-pending") === "null", "やめるで往復の欄が閉じない");
  ok(t.$("wrText").value === "One more summary to cancel later.", "やめると書いた要約が消える");

  // --- 4. 訳の無い古い結果 ---
  t.click(t.$("wrHist").querySelector(`[data-sum="${OLD_ID}"]`)); await delay(30);
  t.click(t.$("wrJaBtn")); await delay(50);
  ok(!t.$("wrRelay").hidden && t.$("wrRelayPrompt").value.includes(OLD_EN) && t.$("wrRelayPrompt").value.includes('"ja": "日本語訳"'), "訳の依頼文が出ない");
  ok(t.$("wrRelayPrompt").value.includes("コードブロック1つに入れて返す"), "訳の依頼文でコードブロックを頼んでいない");
  paste(t, t.$("wrRelayPrompt").value); await delay(30);
  ok(/依頼文/.test(t.$("wrRelayErr").textContent), "訳の依頼文を貼ったことを知らせない");
  paste(t, JSON.stringify(GOOD)); await delay(50);
  ok(/訳（ja）/.test(t.$("wrRelayErr").textContent), "添削の返事を訳に貼ったことを知らせない");
  paste(t, '```json\n{"ja": "この章は信号と増幅器を紹介する。"}\n```'); await delay(100);
  ok(t.$("wrRelay").hidden && t.$("wrJaBox") && t.$("wrJaBox").textContent === "この章は信号と増幅器を紹介する。", "訳が出ない");
  await delay(800);
  const old = (await sums())[OLD_ID];
  ok(old && old.res.correctedJa === "この章は信号と増幅器を紹介する。" && old.res.corrected === OLD_EN && old.text === "This chapter introduce signals.", "古い結果に訳が保存されない（ほかの値が壊れた）: " + JSON.stringify(old));
  await t.stop();
  done();
})().catch((e) => { errs.push(String(e && e.stack || e)); done(); });

function done() {
  console.log(JSON.stringify({ test: "t15_write_relay.js", ok: !fail.length && !errs.length, errors: errs, fail }, null, 1));
  process.exit(fail.length || errs.length ? 1 : 0);
}
