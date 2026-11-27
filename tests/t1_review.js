// 復習・単語帳・音読・添削（第1段階: 本文は必要なときだけ読む）
// 新規ユーザーとして起動し、復習を回して文脈の表示、単語帳の熟語の印、音読、添削のプロンプトを確かめる。
const H = require("./harness");
const fix = H.loadFixtures();
const t = H.startHub({ fix, user: new Map() });
const { $, w, ok, click, delay, log } = t;

// 期待値を教材から作る
const units = H.sortedUnits(fix);
const phrKeys = new Set(), phrOcc = [];
units.forEach(([id, u]) => u.blocks.forEach((b) => (b.phr || []).forEach((p) => { phrKeys.add(H.phrKey(p[0])); phrOcc.push(id); })));

(async () => {
  await delay(400);
  ok(!log.reads.some((r) => r.startsWith("texts/") || r.startsWith("overviews/")), "起動時に本文か全体図を読んでいる: " + log.reads);
  ok(/表現/.test($("dueSplit").textContent), "今日の内訳に表現がない: " + $("dueSplit").textContent);

  // --- 復習を最大30枚回す ---
  $("tab-review").click();
  let shown = 0, badCtx = 0, phr = 0;
  for (let i = 0; i < 30; i++) {
    await delay(80);
    if ($("reviewArea").querySelector(".done")) break;
    if ($("reviewArea").textContent.includes("読み込んでいます")) await delay(150);
    const a = $("reviewArea");
    if (a.textContent.includes("文脈を取り出せませんでした")) badCtx++;
    if (a.textContent.includes("熟語・定型文")) phr++;
    shown++;
    const rv = $("revealBtn"); if (rv) rv.click();
    await delay(20);
    const b = $("reviewArea");
    if (b.textContent.includes("熟語・定型文")) ok(b.querySelector(".ctx mark.hit"), "熟語カードの裏に元の文の印がない");
    const g = b.querySelector('[data-g="2"]'); if (!g) break; g.click();
  }
  ok(shown >= 20, "復習カードが少ない: " + shown);
  ok(badCtx === 0, "文脈が取れないカード: " + badCtx);
  ok(phrKeys.size === 0 || phr >= 1, "熟語カードが出なかった");
  const textReadsInReview = new Set(log.reads.filter((r) => r.startsWith("texts/"))).size;

  // --- 単語帳：熟語モードで全行を開き、文脈の印を数える ---
  $("tab-words").click();
  w.document.querySelector('#segWMode [data-v="phr"]').click();
  let mb; while ((mb = $("wMoreBtn"))) mb.click();
  const keys = [...$("wList").querySelectorAll(".wrow")].map((r) => r.dataset.k).filter(Boolean);
  for (const k of keys) [...$("wList").querySelectorAll(".wrow")].find((x) => x.dataset.k === k).querySelector(".wrow-main").click();
  await delay(800);
  let occ = 0, marked = 0;
  $("wList").querySelectorAll(".wrow").forEach((r) => { occ += r.querySelectorAll(".occ").length; marked += r.querySelectorAll(".occ mark.hit").length; });
  ok(keys.length === phrKeys.size, `表現の数: 表示 ${keys.length} / 教材 ${phrKeys.size}`);
  ok(occ === phrOcc.length && marked === occ, `熟語の文脈: 印 ${marked} / 表示 ${occ} / 教材 ${phrOcc.length}`);
  w.document.querySelector('#segWMode [data-v="word"]').click();
  $("wList").querySelector(".wrow-main").click(); await delay(200);
  ok($("wList").querySelector(".occ-ctx mark.hit"), "単語の文脈に印がない");

  // --- 音読（読むタブの音読モード） ---
  $("tab-read").click(); await delay(100);
  click($("segRead").querySelector('[data-v="shadow"]')); await delay(300);
  ok($("shBlocks").querySelectorAll(".sent").length > 3, "音読の文が出ない");
  const other = units[units.length - 1][0];
  $("shUnit").value = other; $("shUnit").dispatchEvent(new w.Event("change")); await delay(300);
  ok($("shBlocks").querySelectorAll(".sent").length > 3 && !$("shBlocks").textContent.includes("見つかりませんでした"), "音読: 章を切り替えると文が出ない");
  click($("segRead").querySelector('[data-v="read"]')); await delay(100);

  // --- 書く：添削のプロンプトに原文が入る ---
  const [wid] = units[0];
  $("tab-write").click(); await delay(50);
  $("wrUnit").value = wid; $("wrUnit").dispatchEvent(new w.Event("change"));
  $("wrText").value = "This section describes the main idea of the chapter and its key points."; $("wrText").dispatchEvent(new w.Event("input"));
  $("wrCheck").click(); await delay(500);
  const head = H.stripTags(fix.texts.get(wid).blocks[0].en).replace(/\s+/g, " ").trim().slice(0, 20);
  ok(log.prompts.length === 1 && log.prompts[0].includes(head), "添削のプロンプトに原文が入っていない: " + head);

  t.finish({ reviewCards: shown, phraseCards: phr, textDocsReadDuringReview: textReadsInReview, phrases: phrKeys.size });
})();
