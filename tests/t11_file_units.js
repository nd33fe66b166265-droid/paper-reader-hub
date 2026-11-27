// ファイルで届く章（plan-token 第1段階、2026-11）
// content/index.json を起動時に1回だけ読み、データベースの章と合わせる（同じ ID はファイルを優先）。
// 本文・全体図はファイルの分をファイルから、必要なときだけ読む。fixtures_files/ を偽の fetch で配る。
// 引数なし:   一覧・読む・全体図・単語帳・復習・リーダーへのリンク
// "archived": ファイルだけの資料をしまった状態で起動 → 読まない・復習には出る・戻すと出る
// "nofile":   content/index.json が無い（404）→ データベースの章だけでふだんどおり動く
const H = require("./harness");
const fs = require("fs"), path = require("path");
const fix = H.loadFixtures();
const MODE = process.argv[2] || "files";
const FF = path.join(__dirname, "fixtures_files");
const idx = JSON.parse(fs.readFileSync(path.join(FF, "content", "index.json"), "utf8"));
const fetches = [];
const fileText = (id) => JSON.parse(fs.readFileSync(path.join(FF, "content", "texts", id + ".json"), "utf8"));

// 期待値：データベースの章にファイルの章を重ねる
const merged = new Map([...fix.units]);
if (MODE !== "nofile") Object.entries(idx.units).forEach(([id, u]) => merged.set(id, { ...u, file: true }));
const FILE_SRC = Object.keys(idx.sources)[0];               // ファイルだけの資料
const OVER = Object.keys(idx.units).find((id) => fix.units.has(id)); // 作り直した章（同じ ID）
const ADDED = Object.keys(idx.units).find((id) => !fix.units.has(id) && idx.units[id].source !== FILE_SRC); // 既存の資料に足した章
const ARCH_ONLY_WORD = H.vocKey(idx.units[Object.keys(idx.units).find((id) => idx.units[id].source === FILE_SRC)].blocks[0].voc[0][0]);

let user = new Map();
if (MODE === "archived") {
  const past = Date.now() - 3 * 86400000;
  user = new Map([
    ["srs-0", { cards: { [H.encKey(ARCH_ONLY_WORD)]: { s: 2, ivl: 3, ease: 2.5, reps: 2, lapses: 0, due: past, last: past - 86400000 } } }],
    ["archive", { sources: { [FILE_SRC]: { on: true, at: Date.now() - 86400000 } } }],
  ]);
}
const t = H.startHub({
  fix, user,
  beforeParse(w) {
    w.fetch = async (url) => {
      const p = new URL(url, w.location.href).pathname.replace(/^\//, "");
      fetches.push(p);
      await new Promise((r) => setTimeout(r, 15));
      const f = path.join(FF, decodeURIComponent(p));
      const there = MODE !== "nofile" && p.startsWith("content/") && fs.existsSync(f);
      return there ? { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, "utf8")) }
        : { ok: false, status: 404, json: async () => { throw new Error("not json"); } };
    };
  },
});
const { $, w, ok, click, delay, log } = t;
const srcBlocks = () => [...$("sourceList").querySelectorAll(".src-block")];
const readUnit = async (id) => { $("tab-read").click(); await delay(50); $("shUnit").value = id; $("shUnit").dispatchEvent(new w.Event("change")); await delay(250); };

(async () => {
  await delay(450);
  ok(fetches.filter((p) => p === "content/index.json").length === 1, "index.json を読んだ回数: " + fetches);
  ok(!fetches.some((p) => /content\/(texts|overviews)\//.test(p)), "起動時に本文か全体図のファイルを読んだ: " + fetches);
  ok(!log.reads.some((r) => r.startsWith("texts/") || r.startsWith("overviews/")), "起動時にデータベースの本文を読んだ");

  if (MODE === "nofile") {
    ok(srcBlocks().length === fix.sources.size, "資料の数: " + srcBlocks().length);
    ok($("sourceList").querySelectorAll(".unit").length === fix.units.size, "章の数（データベースだけ）");
    ok(!$("statusNote").textContent.trim(), "知らせが出た: " + $("statusNote").textContent);
    const [uid, u] = H.sortedUnits(fix)[0];
    await readUnit(uid);
    ok($("rdBody").querySelectorAll(".para").length === u.blocks.length, "データベースの章が読めない");
    ok(log.reads.includes("texts/" + uid) && !fetches.some((p) => p.startsWith("content/texts/")), "本文をデータベースから読んでいない");
    return t.finish({ mode: MODE, fetches });
  }

  if (MODE === "archived") {
    ok(srcBlocks().length === fix.sources.size, "しまった資料が一覧に出ている");
    ok(/しまった資料（1）/.test($("archList").textContent), "しまった資料の一覧に出ない");
    ok(![...$("sourceList").querySelectorAll("[data-read]")].some((b) => merged.get(b.dataset.read).source === FILE_SRC), "しまった資料の章が出ている");
    ok(/復習 1/.test($("dueSplit").textContent), "しまった資料の復習が数えられていない: " + $("dueSplit").textContent);
    $("tab-review").click(); await delay(200);
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      const a = $("reviewArea"); if (a.querySelector(".done")) break;
      const h2 = a.querySelector(".card-word h2");
      if (h2 && h2.textContent.toLowerCase() === ARCH_ONLY_WORD) {
        seen = /復習/.test(a.querySelector(".card-meta .chip").textContent);
        await delay(120);
        ok(!/文脈を取り出せませんでした/.test($("reviewArea").textContent), "しまったファイルの章の文脈が取れない");
        ok(fetches.some((p) => p.startsWith("content/texts/" + FILE_SRC)), "しまったファイルの章の本文をファイルから読んでいない");
      }
      const rv = $("revealBtn"); if (rv) click(rv);
      const g = $("reviewArea").querySelector('[data-g="2"]'); if (!g) break; click(g); await delay(5);
    }
    ok(seen, "しまったファイルの資料の語が復習に出ない");
    $("tab-today").click(); await delay(50);
    click($("archToggle")); click($("archList").querySelector(`[data-unarch="${FILE_SRC}"]`)); await delay(250);
    ok(srcBlocks().length === fix.sources.size + 1, "戻しても出ない");
    ok([...$("sourceList").querySelectorAll("[data-read]")].filter((b) => merged.get(b.dataset.read).source === FILE_SRC).length === Object.values(idx.units).filter((u) => u.source === FILE_SRC).length, "戻したファイルの章の数");
    return t.finish({ mode: MODE });
  }

  // ---- 一覧：ファイルの資料と章が加わり、同じ ID はファイルの版 ----
  ok(srcBlocks().length === fix.sources.size + 1, "資料の数: " + srcBlocks().length);
  ok($("sourceList").textContent.includes(idx.sources[FILE_SRC].title), "ファイルの資料の名前が出ない");
  ok($("sourceList").querySelectorAll(".unit").length === merged.size, `章の数: ${$("sourceList").querySelectorAll(".unit").length} / ${merged.size}`);
  const overRow = $("sourceList").querySelector(`[data-read="${OVER}"]`).closest(".unit");
  ok(overRow.textContent.includes(idx.units[OVER].label) && overRow.textContent.includes(idx.units[OVER].blocks.length + " 段落"), "作り直した章がファイルの版になっていない");
  ok(!$("sourceList").querySelector(".unit a.link"), "url の無い章にリーダーへのリンクが出ている");
  // 既存の資料の中で、ファイルで足した章も order の順に並ぶ
  const bookIds = [...$("sourceList").querySelectorAll("[data-read]")].map((b) => b.dataset.read).filter((id) => merged.get(id).source === idx.units[ADDED].source);
  ok(bookIds[bookIds.length - 1] === ADDED, "足した章の並び: " + bookIds);

  // ---- 読む：ファイルの章はファイルから、必要なときだけ ----
  const FIRST = Object.keys(idx.units).find((id) => idx.units[id].source === FILE_SRC);
  await readUnit(FIRST);
  ok($("rdBody").querySelectorAll(".para").length === idx.units[FIRST].blocks.length, "ファイルの章の段落数");
  ok(fetches.includes("content/texts/" + FIRST + ".json") && !log.reads.includes("texts/" + FIRST), "本文をファイルから読んでいない");
  ok($("rdBody").querySelector(".para-en t") && $("rdBody").textContent.includes(H.stripTags(fileText(FIRST).blocks[0].en).slice(0, 30)), "ファイルの本文が出ない");
  ok(!/元のリーダー/.test($("rdHead").textContent), "url の無い章に「元のリーダー」が出ている");
  // 全体図：ファイルの資料
  ok($("ovToggle") && $("rdOvWrap").textContent.includes("A New Paper Delivered as Files"), "ファイルの資料の全体図が出ない");
  ok(fetches.includes("content/overviews/" + FILE_SRC + ".json") && !log.reads.includes("overviews/" + FILE_SRC), "全体図をファイルから読んでいない");
  const hereF = [...$("ovFig").querySelectorAll(".here")].map((n) => n.getAttribute("data-sec"));
  ok(hereF.join() === idx.units[FIRST].toc.join(), "全体図の今の章: " + hereF);

  // 作り直した章：データベースの本文は読まない
  await readUnit(OVER);
  ok($("rdBody").querySelectorAll(".para").length === idx.units[OVER].blocks.length, "作り直した章の段落数");
  ok(!log.reads.includes("texts/" + OVER), "作り直した章でデータベースの本文を読んだ");
  // 作り直した章の資料（全体図はデータベースのまま）
  ok(log.reads.includes("overviews/" + merged.get(OVER).source) && !fetches.includes("content/overviews/" + merged.get(OVER).source + ".json"), "index に無い全体図をファイルから読もうとした");

  // 既存の資料に足した章：全体図はファイルの版、章構成から移れる
  await readUnit(ADDED);
  ok($("rdOvWrap").textContent.includes("(file)") && !log.reads.includes("overviews/" + idx.units[ADDED].source), "全体図がファイルの版になっていない");
  const cur = [...$("rdOvWrap").querySelectorAll(".ov-toc li.cur")].map((li) => li.dataset.toc);
  ok(cur.join() === idx.units[ADDED].toc.join(), "章構成の今の章: " + cur);
  const go = $("rdOvWrap").querySelector("[data-ovgo]");
  ok(go && merged.has(go.dataset.ovgo), "章構成から移るボタンがない");
  click(go); await delay(250);
  ok($("rdBody").querySelectorAll(".para").length === merged.get(go.dataset.ovgo).blocks.length, "章構成から移れない");

  // ---- 単語帳：ファイルの章の語も入る ----
  $("tab-words").click(); await delay(50);
  const fw = H.vocKey(idx.units[FIRST].blocks[0].voc[1][0]);
  $("wSearch").value = fw; $("wSearch").dispatchEvent(new w.Event("input")); await delay(250);
  const row = $("wList").querySelector(`[data-k="${fw}"]`);
  ok(row, "ファイルの章の語が単語帳にない");
  if (row) { click(row.querySelector(".wrow-main")); await delay(150); ok($("wList").querySelector(".occ-ctx mark.hit"), "ファイルの章の語の文脈に印がない"); }
  const fp = idx.units[FIRST].blocks.flatMap((b) => b.phr || [])[0];
  if (fp) {
    $("wSearch").value = ""; w.document.querySelector('#segWMode [data-v="phr"]').click();
    $("wSearch").value = fp[0].slice(0, 12); $("wSearch").dispatchEvent(new w.Event("input")); await delay(250);
    const pr = $("wList").querySelector(`[data-k="${H.phrKey(fp[0])}"]`);
    ok(pr, "ファイルの章の表現が単語帳にない");
    if (pr) { click(pr.querySelector(".wrow-main")); await delay(150); ok($("wList").querySelector(".occ-ctx mark.hit"), "ファイルの章の表現の文脈に印がない"); }
    w.document.querySelector('#segWMode [data-v="word"]').click();
  }
  // 単語の総数（データベース＋ファイル、作り直した章はファイルの版）
  const allVoc = new Set([...merged.values()].flatMap((u) => u.blocks.flatMap((b) => (b.voc || []).map((v) => H.vocKey(v[0])))));
  $("tab-today").click(); await delay(50);
  ok(new RegExp(`登録されている単語${allVoc.size}`).test($("statList").textContent.replace(/\s+/g, "")), "単語の数: " + $("statList").textContent.replace(/\s+/g, " ") + " / " + allVoc.size);

  // ---- 本文は1回だけ読む ----
  const tf = fetches.filter((p) => p.startsWith("content/texts/"));
  ok(tf.length === new Set(tf).size, "同じ本文を2回読んだ: " + tf);
  ok(fetches.filter((p) => p === "content/index.json").length === 1, "index.json を2回以上読んだ");
  t.finish({ mode: MODE, fetches: fetches.length });
})();
