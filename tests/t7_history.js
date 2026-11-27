// 学習の記録：週／月の切り替え（Version 11）
// 週 = 月曜始まりの棒グラフ（‹ › でさかのぼれる、いちばん古い記録の週まで）
// 月 = 1周60分のリングのカレンダー（2周目・3周目以降は色を変えて重ねる）
// 日にカーソルを合わせる／タップすると学習時間のツールチップ、切り替えは端末に記憶（hub-tm-view）、
// さかのぼってもデータベースを読み直さない、を確かめる。
const H = require("./harness");
const fix = H.loadFixtures();
const CUT_H = 4, DAY = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const dayKey = (t) => keyOf(new Date(t - CUT_H * 3600000));
const dateOf = (k) => new Date(k + "T12:00:00");
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const weekStart = (k) => { const d = dateOf(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return keyOf(d); };
const T = dayKey(Date.now());
const D1 = addDays(T, -1), D2 = addDays(T, -2), D3 = addDays(T, -3), OLD = addDays(T, -40);
// 記録（秒）。D1 = 129分（2周＋9分）、D2 = 45分、OLD = 70分、D3 は手入力の記録だけ 30分
const recs = { [D1]: { dA: { read: 6000, review: 1740 } }, [D2]: { dB: { review: 2700 } }, [OLD]: { dA: { shadow: 4200 } } };
const user = new Map();
Object.entries(recs).forEach(([d, v]) => {
  const id = "time-" + d.slice(0, 7), doc = user.get(id) || { days: {} };
  doc.days[d] = v; user.set(id, doc);
});
user.set("log-" + D3.slice(0, 7), { entries: { l1: { day: D3, cat: "listen", min: 30, memo: "lecture", at: Date.now() } } });
const t = H.startHub({ fix, user });
const { $, w, ok, click, delay, log } = t;
const tipShown = () => $("rdTip").classList.contains("show");
const over = (el) => el.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));

(async () => {
  await delay(400);
  // --- 週（既定） ---
  ok(w.document.querySelector('#segTmView [data-v="week"]').getAttribute("aria-pressed") === "true" && !$("tmWeek").hidden && $("tmMonth").hidden, "既定が週でない");
  const cols = [...$("tmChart").querySelectorAll(".ccol")];
  const ws = weekStart(T);
  ok(cols.length === 7 && cols[0].dataset.tmday === ws && cols[6].dataset.tmday === addDays(ws, 6), "週が月曜始まりの7日でない: " + cols.map((c) => c.dataset.tmday));
  ok(/月/.test($("tmChartX").querySelector("span").textContent), "週の最初が月曜でない: " + $("tmChartX").textContent);
  ok($("tmNext").disabled && !$("tmPrev").disabled && $("tmNow").hidden, "今週のときのボタンの状態");
  const reads0 = log.reads.length;
  // D1 の週まで戻って、棒の内訳とツールチップ
  const goWeekOf = async (k) => { for (let i = 0; i < 10 && !$("tmChart").querySelector(`[data-tmday="${k}"]`); i++) { click($("tmPrev")); await delay(5); } };
  await goWeekOf(D1);
  const c1 = $("tmChart").querySelector(`[data-tmday="${D1}"]`);
  ok(c1 && c1.querySelector(".cval").textContent === "129" && c1.querySelector(".c-read") && c1.querySelector(".c-review"), "棒の値と内訳");
  over(c1);
  ok(tipShown() && /2時間9分/.test($("rdTip").textContent) && /読む 100分/.test($("rdTip").textContent) && /目安の60分を達成/.test($("rdTip").textContent), "棒のツールチップ: " + $("rdTip").textContent);
  click($("tmSum"));
  ok(!tipShown(), "ほかを押してもツールチップが消えない");
  // 手入力の記録も入る
  await goWeekOf(D3);
  const c3 = $("tmChart").querySelector(`[data-tmday="${D3}"]`);
  ok(c3 && c3.querySelector(".c-manual") && c3.querySelector(".cval").textContent === "30", "手入力の記録が棒に入らない");
  ok(/lecture/.test($("recList").textContent), "その週の記録の一覧に手入力のメモがない");
  // いちばん古い週までさかのぼれて、それより前には行けない
  let n = 0; while (!$("tmPrev").disabled && n < 30) { click($("tmPrev")); n++; await delay(2); }
  ok($("tmChart").querySelector(`[data-tmday="${OLD}"]`), "いちばん古い記録の週まで戻れない");
  const wantWeeks = Math.round((dateOf(weekStart(T)) - dateOf(weekStart(OLD))) / (7 * DAY));
  ok(!$("tmNow").hidden && /今週/.test($("tmNow").textContent), "「今週に戻る」が出ない");
  click($("tmNow")); await delay(5);
  ok($("tmChart").querySelector(`[data-tmday="${T}"]`) && $("tmNext").disabled, "今週に戻らない");

  // --- 月 ---
  click(w.document.querySelector('#segTmView [data-v="month"]')); await delay(5);
  ok(w.localStorage.getItem("hub-tm-view") === "month" && $("tmWeek").hidden && !$("tmMonth").hidden, "月に切り替わらない／記憶されない");
  const tm = dateOf(T), nDays = new Date(tm.getFullYear(), tm.getMonth() + 1, 0).getDate();
  const lead = (new Date(tm.getFullYear(), tm.getMonth(), 1, 12).getDay() + 6) % 7;
  ok($("tmCal").querySelectorAll("button.tm-day").length === nDays && $("tmCal").querySelectorAll(".tm-day.blank").length === lead, "カレンダーの日数・月曜始まり");
  ok($("tmRange").textContent === `${tm.getFullYear()}年${tm.getMonth() + 1}月`, "月の見出し: " + $("tmRange").textContent);
  const cell = (k) => $("tmCal").querySelector(`[data-tmday="${k}"]`);
  const goMonthOf = async (k) => { for (let i = 0; i < 4 && !cell(k); i++) { click($("tmPrev")); await delay(5); } };
  ok(cell(T).classList.contains("today"), "今日の印がない");
  await goMonthOf(D1);
  const r1 = cell(D1);
  ok(r1.querySelector(".rg2") && r1.querySelector(".rg3") && !r1.querySelector(".rg1") && r1.querySelector(".tm-min").textContent === "129", "129分のリング（2周目を満たし3周目が重なる）");
  const arc3 = +r1.querySelector(".rg3").getAttribute("stroke-dasharray").split(" ")[0], C = 2 * Math.PI * 14;
  ok(Math.abs(arc3 - C * 9 / 60) < 0.05, "3周目の長さが9分ぶんでない: " + arc3);
  ok(r1.querySelector(".rg-num").textContent === String(+D1.slice(8)), "リングの中に日付がない");
  await goMonthOf(D2);
  const r2 = cell(D2);
  ok(r2.querySelector(".rg1") && !r2.querySelector(".rg2"), "45分のリングは1周目だけ");
  over(r2);
  ok(tipShown() && /45分/.test($("rdTip").textContent) && !/達成/.test($("rdTip").textContent), "カレンダーのツールチップ: " + $("rdTip").textContent);
  click(cell(D2)); // タップ（スマホ）でも出たまま
  ok(tipShown(), "日付をタップするとツールチップが消える");
  // 記録の無い日
  await goMonthOf(T);
  const empty = [...$("tmCal").querySelectorAll("button.tm-day.none:not(.future)")][0];
  if (empty) { ok(!empty.querySelector(".rg1, .rg2, .rg3"), "記録の無い日にリングがある"); over(empty); ok(/記録なし/.test($("rdTip").textContent), "記録の無い日のツールチップ"); }
  // 未来の日は押せない
  const fut = $("tmCal").querySelector(".tm-day.future");
  if (fut) ok(fut.disabled, "未来の日が押せる");
  // いちばん古い月まで
  n = 0; while (!$("tmPrev").disabled && n < 12) { click($("tmPrev")); n++; await delay(2); }
  ok(cell(OLD) && cell(OLD).querySelector(".rg1") && cell(OLD).querySelector(".rg2") && !cell(OLD).querySelector(".rg3"), "いちばん古い月に戻れない／70分のリング");
  ok(/今月/.test($("tmNow").textContent) && !$("tmNow").hidden, "「今月に戻る」が出ない");
  ok(log.reads.length === reads0, "さかのぼるとデータベースを読んだ: " + log.reads.slice(reads0));
  t.finish({ weeksBack: wantWeeks });
})();
