// 書くタブ：保存済みの要約（データベースから読んだ、書き換えられない記録）でも
// 「添削カードにする」「見ないで書き直す」が動く（Version 13.1）。harness は読んだデータを凍結して渡す。
const H = require("./harness");
const fix = H.loadFixtures();
const [UID, U] = H.sortedUnits(fix)[0];
const month = new Date().toISOString().slice(0, 7);
const ID = "old2";
const user = new Map([["sum-" + month, { items: {
  [ID]: { day: month + "-01", at: Date.now() - 86400000, unit: UID, unitLabel: U.label, text: "This chapter introduce signals.", ja: "",
    res: { overall: "ok", corrected: "This chapter introduces signals.", correctedJa: "この章は信号を紹介する。",
      items: [{ level: "grammar", original: "introduce", fixed: "introduces", reason: "三単現の s", ja: "この章は信号を紹介する。", en_card: "This chapter introduces signals.", card: "" }] },
    rewrite: "" },
} }]]);
const t = H.startHub({ fix, user });
const { $, w, ok, click, delay, log } = t;

(async () => {
  await delay(400);
  $("tab-write").click(); await delay(50);
  click($("wrHist").querySelector(`[data-sum="${ID}"]`)); await delay(20);
  const cb = $("wrResult").querySelector("[data-pick]");
  ok(cb, "添削の項目が出ない");
  cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true })); await delay(10);
  click($("wrAddCards")); await delay(300);
  ok(/添削カードに追加済み/.test($("wrResult").textContent), "添削カードにできない");
  const fw = log.writes.filter((x) => x[1] === "data/users/u1/fixes");
  ok(fw.length && Object.values(fw[fw.length - 1][2].cards || {}).some((c) => c.fixed === "introduces"), "添削カードが保存されない");
  click($("wrRedo")); await delay(10);
  $("wrRedoText").value = "This chapter introduces signals and amplifiers.";
  click($("wrRedoDone")); await delay(300);
  ok(/書き直した文/.test($("wrResult").textContent), "書き直しが表示されない");
  const sw = log.writes.filter((x) => x[1] === "data/users/u1/sum-" + month && x[2] && x[2].items && x[2].items[ID] && x[2].items[ID].rewrite);
  ok(sw.length, "書き直しが保存されない");
  t.finish({});
})();
