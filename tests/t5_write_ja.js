// 書くタブ：直した英文の日本語訳（ボタンで開閉）
// 新しい添削では訳もいっしょに受け取って保存する。訳の無い古い結果は、初めて開くときに作って保存する。
// 初期は閉、別の結果を開くと閉に戻る、書き直し中は出さない、訳は文字としてだけ表示する（HTML を解釈しない）。
const H = require("./harness");
const fix = H.loadFixtures();
const units = H.sortedUnits(fix);
const [UID, U] = units[0];
const OLD_ID = "old1", OLD_EN = "This chapter introduces signals and amplifiers.";
const NEW_EN = "This section explains how the sampling switch works.";
const NEW_JA = "この節は、サンプリングスイッチがどのように動作するかを説明する。<img src=x onerror=\"window.__x=1\">";
const OLD_JA = "この章は、信号と増幅器を紹介する。";
const month = new Date().toISOString().slice(0, 7);
const user = new Map([["sum-" + month, { items: {
  [OLD_ID]: { day: month + "-01", at: Date.now() - 86400000, unit: UID, unitLabel: U.label, text: "This chapter introduce signals.", ja: "",
    res: { overall: "ok", corrected: OLD_EN, items: [] }, rewrite: "" },
} }]]);
const calls = [];
let failNext = false;
const sample = Object.assign(async () => ({ text: "" }), {
  json: async (prompt) => {
    calls.push(prompt);
    await new Promise((r) => setTimeout(r, 30));
    if (/"ja": "日本語訳"/.test(prompt)) {
      if (failNext) { failNext = false; const e = new Error("x"); e.code = "rate_limited"; throw e; }
      return { ja: OLD_JA };
    }
    return { overall: "ok", corrected: NEW_EN, corrected_ja: NEW_JA, items: [] };
  },
});
const t = H.startHub({ fix, user, sample });
const { $, w, ok, click, delay, log } = t;
const btn = () => $("wrJaBtn"), box = () => $("wrJaBox");

(async () => {
  await delay(400);
  $("tab-write").click(); await delay(50);
  $("wrUnit").value = UID; $("wrUnit").dispatchEvent(new w.Event("change"));

  // --- 新しい添削：訳もいっしょに受け取る ---
  $("wrText").value = "This section explain how the sampling switch work."; $("wrText").dispatchEvent(new w.Event("input"));
  $("wrCheck").click(); await delay(300);
  ok(calls.length === 1 && calls[0].includes('"corrected_ja"'), "添削のプロンプトで訳を頼んでいない");
  ok(btn() && btn().textContent === "訳を見る" && btn().getAttribute("aria-expanded") === "false" && !box(), "初期は閉じていない");
  const sw = log.writes.filter((x) => x[1] === "data/users/u1/sum-" + month && x[2]);
  const saved = sw.length && Object.values(sw[sw.length - 1][2].items)[0];
  ok(saved && saved.res && saved.res.correctedJa === NEW_JA, "訳が要約といっしょに保存されない");
  click(btn());
  ok(box() && box().textContent === NEW_JA && btn().textContent === "訳を隠す" && btn().getAttribute("aria-expanded") === "true", "訳が開かない");
  ok(!box().querySelector("img") && w.__x === undefined, "訳の HTML が解釈されている");
  ok(calls.length === 1, "訳があるのにもう一度 Claude を呼んだ");
  click(btn());
  ok(!box() && btn().textContent === "訳を見る", "訳が閉じない");
  click(btn());
  // 書き直し中は訳を出さない
  click($("wrRedo")); await delay(20);
  ok(!box() && !btn(), "書き直し中に訳が出ている");
  click($("wrRedoCancel")); await delay(20);

  // --- 古い結果：初めて開くときに訳を作って保存する ---
  click($("wrHist").querySelector(`[data-sum="${OLD_ID}"]`)); await delay(20);
  ok(btn() && btn().textContent === "訳を見る" && !box(), "別の結果を開いたら閉に戻らない");
  failNext = true;
  click(btn()); await delay(10);
  ok(btn().disabled && btn().textContent === "訳を作っています…", "作っている間の表示");
  await delay(120);
  ok(!box() && btn().textContent === "訳を見る" && !btn().disabled && /利用が集中/.test($("toast").textContent), "訳を作れなかったときの表示");
  const n0 = calls.length;
  click(btn()); await delay(150);
  ok(calls.length === n0 + 1 && calls[calls.length - 1].includes(OLD_EN), "訳を頼むプロンプトに直した英文が入っていない");
  ok(box() && box().textContent === OLD_JA && btn().textContent === "訳を隠す", "作った訳が出ない");
  const uw = log.writes.filter((x) => x[0] === "update" && x[1] === "data/users/u1/sum-" + month && x[2].items[OLD_ID]);
  ok(uw.length && uw[uw.length - 1][2].items[OLD_ID].res.correctedJa === OLD_JA && Object.keys(uw[uw.length - 1][2].items[OLD_ID].res).length === 1, "作った訳の保存の仕方: " + JSON.stringify(uw.map((x) => x[2])));
  click(btn()); click(btn());
  ok(box() && calls.length === n0 + 1, "作った訳を開き直すとまた Claude を呼んだ");

  // 閉じるボタン → 再び開くと閉
  click($("wrClose"));
  click($("wrHist").querySelector(`[data-sum="${OLD_ID}"]`)); await delay(20);
  ok(!box(), "開き直すと訳が開いたまま");

  t.finish({ sampleCalls: calls.length });
})();
