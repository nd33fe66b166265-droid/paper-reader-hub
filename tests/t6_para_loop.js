// 音読：段落をくり返す（プレーヤーの「範囲」）
// 「この段落をくり返す」にすると、タップした文の段落の最後まで読んだら約2秒おいて段落の頭に戻り、止めるまで続ける。
// 周回の表示、くり返し中の段落の印、別の段落をタップすると切り替わる、各文N回との組み合わせ、
// 章全体に戻すと次の段落へ進む、設定は端末に記憶（hub-sh-loop）、を確かめる。
// 読み上げは偽物：speak するとすぐ始まり 10ms で終わる。話した文は .sent.cur の data-i で記録する。
const H = require("./harness");
const fix = H.loadFixtures();
const spoken = []; // [{i, t}]
const t = H.startHub({
  fix, user: new Map(), localStorage: { "hub-rd-mode": "shadow", "hub-tab": "read" },
  beforeParse(w) {
    w.speechSynthesis = {
      getVoices: () => [], cancel() {}, addEventListener() {},
      speak(u) {
        const cur = w.document.querySelector(".sent.cur");
        spoken.push({ i: cur ? +cur.dataset.i : -1, t: Date.now() });
        setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 10); }, 0);
      },
    };
  },
});
const { $, w, ok, click, delay } = t;
const sentsOf = (k) => [...$("shBlocks").querySelectorAll(".blk")][k].querySelectorAll(".sent[data-i]");
const idxOf = (k) => [...sentsOf(k)].map((s) => +s.dataset.i);
const waitFor = async (cond, ms = 12000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await delay(20); return cond(); };

(async () => {
  await delay(400);
  ok(!$("view-read").hidden && !$("shPane").hidden, "音読モードで開いていない");
  // 文が3つ以上ある段落（最後の段落ではないもの）と、その次の段落を選ぶ
  const blks = [...$("shBlocks").querySelectorAll(".blk")];
  const K = blks.findIndex((b, k) => k < blks.length - 1 && idxOf(k).length >= 3 && idxOf(k + 1).length >= 1);
  ok(K >= 0, "文が3つ以上ある段落が見つからない");
  const A = idxOf(K), B = idxOf(K + 1);

  // --- 初期は章全体 ---
  ok($("pLoop").value === "unit" && !$("pLoop").classList.contains("on"), "初期の範囲が章全体でない");

  // --- この段落をくり返す ---
  $("pLoop").value = "para"; $("pLoop").dispatchEvent(new w.Event("change"));
  ok(w.localStorage.getItem("hub-sh-loop") === "para" && $("pLoop").classList.contains("on"), "範囲が記憶されない／強調されない");
  ok(/くり返したい段落の文をタップ/.test($("pInfo").textContent), "くり返しの案内が出ない: " + $("pInfo").textContent);
  click(sentsOf(K)[1]);                                   // 段落の2文目から
  await delay(30);
  ok(blks[K].classList.contains("looping") && blks[K].querySelector(".loop-tag") && !blks[K + 1].classList.contains("looping"), "くり返し中の段落に印がない");
  ok(/1 周目/.test($("pInfo").textContent), "1周目の表示: " + $("pInfo").textContent);
  // 2文目〜最後 → 頭に戻る（1周目は途中から、2周目は頭から）
  const lap1 = A.slice(1), lap2 = A;
  ok(await waitFor(() => spoken.length >= lap1.length + lap2.length + 1), "読み上げが進まない: " + spoken.map((x) => x.i));
  const seq = spoken.map((x) => x.i);
  ok(seq.slice(0, lap1.length).join() === lap1.join(), "1周目の順: " + seq);
  ok(seq.slice(lap1.length, lap1.length + lap2.length).join() === lap2.join(), "2周目が段落の頭から始まらない: " + seq);
  ok(seq[lap1.length + lap2.length] === A[0], "3周目に入らない: " + seq);
  ok(!seq.some((i) => B.includes(i)), "次の段落に進んでしまった: " + seq);
  const gap = spoken[lap1.length].t - spoken[lap1.length - 1].t;
  ok(gap >= 2000 && gap < 3500, "周の間が約2秒でない: " + gap + "ms");
  const inLap = spoken[1].t - spoken[0].t;
  ok(inLap < 1000, "段落の中の文の間が長すぎる: " + inLap + "ms");
  ok(/3 周目/.test($("pInfo").textContent), "周回の表示が増えない: " + $("pInfo").textContent);

  // --- 一時停止 → 止まる ---
  click($("pPlay")); const n0 = spoken.length; await delay(2600);
  ok(spoken.length === n0, "一時停止しても読み続ける");

  // --- 別の段落をタップすると、その段落のくり返しに切り替わる（周回は1から） ---
  click(sentsOf(K + 1)[0]); await delay(30);
  ok(blks[K + 1].classList.contains("looping") && !blks[K].classList.contains("looping") && !blks[K].querySelector(".loop-tag"), "くり返す段落が切り替わらない");
  ok(/1 周目/.test($("pInfo").textContent), "切り替えで周回が1に戻らない");
  click($("pPlay")); await delay(50);

  // --- 各文2回との組み合わせ：最後の文を2回読んでから頭に戻る ---
  spoken.length = 0;
  $("pRepeat").value = "2"; $("pRepeat").dispatchEvent(new w.Event("change"));
  click(sentsOf(K)[A.length - 1]);                        // 段落の最後の文から
  ok(await waitFor(() => spoken.length >= 3), "各文2回で進まない");
  const s2 = spoken.map((x) => x.i);
  ok(s2[0] === A[A.length - 1] && s2[1] === A[A.length - 1] && s2[2] === A[0], "各文2回で最後の文を2回読んでから頭に戻らない: " + s2);
  ok(spoken[2].t - spoken[1].t >= 2000, "各文2回のとき周の間が空かない");
  click($("pPlay")); await delay(50);
  $("pRepeat").value = "1"; $("pRepeat").dispatchEvent(new w.Event("change"));

  // --- 章全体に戻す：段落の最後の文のあと、次の段落へ進む ---
  $("pLoop").value = "unit"; $("pLoop").dispatchEvent(new w.Event("change"));
  ok(w.localStorage.getItem("hub-sh-loop") === "unit" && !$("shBlocks").querySelector(".blk.looping"), "章全体に戻しても印が残る");
  spoken.length = 0;
  click(sentsOf(K)[A.length - 1]);
  ok(await waitFor(() => spoken.length >= 2, 3000), "章全体で次へ進まない");
  ok(spoken[1].i === B[0] && spoken[1].t - spoken[0].t < 1000, "章全体なのに段落をくり返した: " + spoken.map((x) => x.i));
  ok(!/周目/.test($("pInfo").textContent), "章全体なのに周回が出ている");
  click($("pPlay"));

  t.finish({ para: K, sentences: A.length });
})();
