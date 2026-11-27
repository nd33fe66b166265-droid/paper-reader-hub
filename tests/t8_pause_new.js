// 今日は新出を休む（Version 12）
// 今日タブのスイッチで、その日だけ単語と熟語の新出をまとめて止める。復習（期日の来た単語・熟語）と添削カードは出す。
// meta.pauseDay に今日の日付を保存（ほかの端末にも届く）、日付が変われば自動で戻る（前日の pauseDay は効かない）、
// 再開すると新出が戻る、を確かめる。
const H = require("./harness");
const fix = H.loadFixtures();
const CUT_H = 4, DAY = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const dayKey = (t) => keyOf(new Date(t - CUT_H * 3600000));
const T = dayKey(Date.now()), Y = dayKey(Date.now() - DAY);
const MODE = process.argv[2] || "today"; // "yesterday": 昨日休んだ記録が残っている状態で開く

// 今の資料の語・表現から、期日の来た復習を2語・1表現つくる
const units = H.sortedUnits(fix);
const vocs = [...new Set(units.flatMap(([, u]) => u.blocks.flatMap((b) => (b.voc || []).map((v) => H.vocKey(v[0])))))];
const phrs = [...new Set(units.flatMap(([, u]) => u.blocks.flatMap((b) => (b.phr || []).map((v) => H.phrKey(v[0])))))];
const dueW = vocs.slice(0, 2), dueP = phrs[0];
const past = Date.now() - 3 * DAY;
const card = { s: 2, ivl: 3, ease: 2.5, reps: 2, lapses: 0, due: past, last: past - DAY };
const cards = {}; [...dueW, dueP].forEach((k) => { cards[H.encKey(k)] = { ...card }; });
const user = new Map([
  ["meta", { newPerDay: 20, phrPerDay: 5, order: "read", rate: 1, day: T, newDone: 0, reviewsDone: 0, phrDone: 0, pauseDay: MODE === "yesterday" ? Y : "" }],
  ["srs-0", { cards }],
  ["fixes", { cards: { f1: { ja: "この節はサンプリングを説明する。", en: "This section explains sampling.", wrong: "explain", fixed: "explains", reason: "三単現", level: "grammar", unit: units[0][0], unitLabel: "x", at: Date.now() } } }],
]);
const t = H.startHub({ fix, user });
const { $, w, ok, click, delay, log } = t;
const sw = () => $("pauseNew");
const chips = () => $("dueSplit").textContent;

async function runReview() {
  $("tab-review").click(); await delay(100);
  const seen = [];
  for (let i = 0; i < 80; i++) {
    const area = $("reviewArea");
    if (area.querySelector(".done")) break;
    const kind = (area.querySelector(".card-meta .chip") || {}).textContent;
    const isFix = !!area.querySelector(".chip.plum");
    const rv = $("revealBtn"); if (rv) click(rv);
    const h2 = area.querySelector(".card-word h2"), p = area.querySelector(".phr-p");
    seen.push({ kind, key: h2 ? h2.textContent.toLowerCase() : p ? H.phrKey(p.textContent) : isFix ? "fix" : "?" });
    const g = $("reviewArea").querySelector('[data-g="2"]'); if (!g) break; click(g); await delay(5);
  }
  return seen;
}

(async () => {
  await delay(400);
  if (MODE === "yesterday") {
    ok(sw().getAttribute("aria-checked") === "false", "昨日休んだ設定が今日も効いている");
    ok(/新出 20/.test(chips()), "昨日休んだあと、今日の新出が戻らない: " + chips());
    return t.finish({ mode: MODE });
  }
  // --- 初期：休んでいない ---
  ok(sw() && sw().getAttribute("role") === "switch" && sw().getAttribute("aria-checked") === "false" && !sw().disabled, "スイッチの初期状態");
  ok(/新出 20/.test(chips()) && /表現 6/.test(chips()), "初期の内訳: " + chips());
  const total0 = +$("dueTotal").firstChild.textContent;

  // --- 休む ---
  click(sw()); await delay(20);
  ok(sw().getAttribute("aria-checked") === "true", "スイッチが入らない");
  ok(/新出 休み/.test(chips()) && /表現 1/.test(chips()) && /復習 2/.test(chips()) && /添削 1/.test(chips()), "休んだときの内訳: " + chips());
  ok(+$("dueTotal").firstChild.textContent === 2 + 1 + 1, "休んだときの合計: " + $("dueTotal").textContent + "（前 " + total0 + "）");
  ok(/復習だけ/.test($("startHint").textContent) && /自動で戻ります/.test($("pauseHint").textContent), "休んだときの案内: " + $("startHint").textContent + " / " + $("pauseHint").textContent);
  ok($("dueBadge").textContent === "4", "タブのバッジ: " + $("dueBadge").textContent);
  ok(/休みます/.test($("toast").textContent), "休んだときの知らせ");
  await delay(800); // flush
  const mw = log.writes.filter((x) => x[1] === "data/users/u1/meta");
  ok(mw.length && mw[mw.length - 1][2].pauseDay === T, "pauseDay が今日の日付で保存されない: " + JSON.stringify(mw.map((x) => x[2].pauseDay)));

  // --- 復習：新出は出ない。期日の来た単語・表現と添削カードは出る ---
  const seen = await runReview();
  ok(!seen.some((x) => x.kind === "新出" && x.key !== "fix"), "休んだのに単語・熟語の新出が出た: " + seen.filter((x) => x.kind === "新出").map((x) => x.key));
  ok(dueW.every((k) => seen.some((x) => x.key === k && x.kind === "復習")) && seen.some((x) => x.key === dueP), "期日の来た復習が出ない: " + JSON.stringify(seen));
  ok(seen.some((x) => x.key === "fix"), "添削カードが出ない");
  ok(/新出を休んでいます/.test($("reviewArea").textContent), "終わりの画面にお休みの案内がない");

  // --- 再開：新出が戻る ---
  $("tab-today").click(); await delay(30);
  click(sw()); await delay(20);
  ok(sw().getAttribute("aria-checked") === "false" && /新出 20/.test(chips()) && /表現 5/.test(chips()), "再開しても新出が戻らない: " + chips());
  await delay(800);
  const mw2 = log.writes.filter((x) => x[1] === "data/users/u1/meta");
  ok(mw2[mw2.length - 1][2].pauseDay === "", "再開が保存されない");
  const seen2 = await runReview();
  ok(seen2.some((x) => x.kind === "新出"), "再開後の復習に新出が出ない");
  t.finish({ pausedCards: seen.length, resumedCards: seen2.length });
})();
