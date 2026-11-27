// 読むタブ（第2段階）: 読む／音読の切り替え、3つの開閉と一括開閉、用語ツールチップ、
// 続きから読む（進み具合の保存と復元）、読む時間の記録、章の終わりの「要約を書く」「次の章へ」
// 引数 oldtab: 以前の「音読」タブを覚えている状態で開くと、読むタブの音読モードになるか
const H = require("./harness");
const fix = H.loadFixtures();
const OLD_TAB = process.argv[2] === "oldtab";
const t = H.startHub({ fix, user: new Map(), scrollModel: true, localStorage: OLD_TAB ? { "hub-tab": "shadow" } : {} });
const { $, w, ok, click, delay, log, scroll } = t;

// 段落が8つ以上あり、同じ資料に次の章がある章を選ぶ
const units = H.sortedUnits(fix);
const idx = units.findIndex(([, u], i) => u.blocks.length >= 8 && units[i + 1] && units[i + 1][1].source === u.source);
if (idx < 0) { console.log("段落8つ以上で次の章がある章が fixtures にありません"); process.exit(1); }
const [UID, U] = units[idx], [NEXT, NU] = units[idx + 1], N = U.blocks.length, PH = scroll.PH;

(async () => {
  await delay(400);
  if (OLD_TAB) {
    ok(!$("view-read").hidden && !$("shPane").hidden && $("rdPane").hidden, "以前の音読タブから開くと音読モードにならない");
    return t.finish({ oldtab: true });
  }
  ok(!$("tab-shadow") && $("tab-read") && w.document.querySelectorAll(".tab").length === 5, "タブの構成が違う");

  // --- 今日 → 読む ---
  const readBtn = $("sourceList").querySelector(`[data-read="${UID}"]`);
  ok(readBtn && readBtn.textContent === "読む", "今日の一覧に「読む」ボタンがない");
  click(readBtn); await delay(200);
  ok(!$("view-read").hidden && !$("rdPane").hidden && $("shPane").hidden, "読むモードで開いていない");
  const paras = $("rdBody").querySelectorAll(".para");
  ok(paras.length === N, `段落数: ${paras.length} / ${N}`);
  ok($("rdCount").textContent === N + " blocks", "ブロック数表示: " + $("rdCount").textContent);
  ok($("rdBody").querySelectorAll(".rd-sec").length >= 1, "節見出しがない");
  ok($("rdBody").querySelector(".para-en t"), "英文に用語の印がない");

  // --- 個別の開閉（3つは独立） ---
  const p0 = paras[0], jb = p0.querySelector(".ja-btn");
  click(jb);
  ok(p0.querySelector(".para-ja").classList.contains("open") && jb.textContent === "訳を隠す" && jb.getAttribute("aria-expanded") === "true", "訳の個別開閉");
  ok(!p0.querySelector(".para-note").classList.contains("open"), "訳を開いたら解説まで開いた");
  click(p0.querySelector(".note-btn"));
  ok(p0.querySelector(".para-note li"), "構文解説の項目がない");
  click(p0.querySelector(".voc-btn"));
  ok(p0.querySelectorAll(".voc-row").length === (U.blocks[0].voc || []).length, "英単語の行数が違う");

  // --- 一括開閉（個別ボタンのラベルも変わる） ---
  const bj = $("rdBar").querySelector('[data-target="ja"]');
  click(bj);
  ok([...paras].every((p) => p.querySelector(".para-ja").classList.contains("open")), "訳をすべて開くが効かない");
  ok(bj.textContent === "訳をすべて閉じる" && [...paras].every((p) => p.querySelector(".ja-btn").textContent === "訳を隠す"), "一括で開いたときのラベル");
  click(bj);
  ok([...paras].every((p) => !p.querySelector(".para-ja").classList.contains("open")) && bj.textContent === "訳をすべて開く" && paras[0].querySelector(".ja-btn").textContent === "訳を見る", "一括で閉じたとき");

  // --- ツールチップ ---
  const tt = $("rdBody").querySelector(".para-en t");
  click(tt);
  ok($("rdTip").classList.contains("show") && $("rdTip").querySelector(".tt-mean").textContent.length > 0, "ツールチップが出ない");
  click($("rdHead"));
  ok(!$("rdTip").classList.contains("show"), "ほかを押してもツールチップが消えない");
  click($("rdBar").querySelector('[data-target="term"]'));
  click(tt);
  ok(!$("rdTip").classList.contains("show") && $("rdBody").classList.contains("terms-off"), "用語ハイライトを切っても出る");
  click($("rdBar").querySelector('[data-target="term"]'));

  // --- 段落6まで読み進める → 進み具合が保存される ---
  scroll.y = 100 + 5 * PH - 60 + 10; w.dispatchEvent(new w.Event("scroll"));
  await delay(600);
  ok(new RegExp(`読んだところ 6/${N}`).test($("rdHead").textContent), "読んだところの表示: " + $("rdHead").textContent.replace(/\s+/g, " "));
  await delay(2700);
  const pw = log.writes.filter((x) => x[1] === "data/users/u1/progress" && x[2]);
  ok(pw.length >= 1 && pw[pw.length - 1][2].units[UID].bi === 5, "進み具合が保存されない");

  // --- 読む時間が read として記録される ---
  w.document.dispatchEvent(new w.Event("pointerdown"));
  await delay(2200);
  Object.defineProperty(w.document, "visibilityState", { value: "hidden", configurable: true });
  w.document.dispatchEvent(new w.Event("visibilitychange"));
  await delay(200);
  Object.defineProperty(w.document, "visibilityState", { value: "visible", configurable: true });
  const tw = log.writes.filter((x) => /data\/users\/u1\/time-/.test(x[1]) && x[2]);
  const rec = tw.length ? JSON.stringify(tw[tw.length - 1][2]) : "";
  ok(/"read":\d/.test(rec), "読む時間が read として記録されない: " + rec);

  // --- 今日に戻って「続きを読む」 ---
  $("tab-today").click(); await delay(100);
  const cont = $("sourceList").querySelector(`[data-read="${UID}"]`);
  ok(cont && cont.textContent === "続きを読む", "「続きを読む」にならない");
  scroll.y = 0; click(cont); await delay(200);
  ok(scroll.y === 100 + 5 * PH - 8, "続きの段落に移動しない: y=" + scroll.y);
  ok(new RegExp(`段落 6 / ${N}`).test($("toast").textContent), "続きの案内が出ない: " + $("toast").textContent);

  // --- 音読へ切り替えて戻る ---
  click($("segRead").querySelector('[data-v="shadow"]')); await delay(200);
  ok($("rdPane").hidden && !$("shPane").hidden && !$("player").hidden, "音読に切り替わらない");
  ok($("shBlocks").querySelectorAll(".sent").length > 3, "音読の文が出ない");
  click($("segRead").querySelector('[data-v="read"]')); await delay(200);
  ok(!$("rdPane").hidden && $("player").hidden, "読むに戻らない");

  // --- 章の終わり → 要約を書く／次の章へ ---
  click($("rdBody").querySelector('[data-rdend="write"]')); await delay(100);
  ok(!$("view-write").hidden && $("wrUnit").value === UID, "要約を書くで章が引き継がれない");
  $("tab-read").click(); await delay(150);
  click($("rdBody").querySelector('[data-rdend="next"]')); await delay(250);
  ok($("shUnit").value === NEXT && $("rdBody").querySelectorAll(".para").length === NU.blocks.length, "次の章へ進まない");

  t.finish({ unit: UID, next: NEXT });
})();
