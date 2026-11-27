// 読み終えた資料をしまう（第4段階）: 起動時にしまった資料の章を読まない、しまった資料の語は
// 復習には出るが新出には出ない、しまった資料の章は必要になったとき1回だけ読む、単語帳の表示切り替え、
// 戻す／確認つきでしまう／すべてしまう。fixtures に資料が2つ以上必要。
const H = require("./harness");
const fix = H.loadFixtures();
const srcs = [...fix.sources].sort((a, b) => (a[1].order ?? 999) - (b[1].order ?? 999)).map(([id]) => id)
  .filter((id) => [...fix.units.values()].some((u) => u.source === id));
if (srcs.length < 2) { console.log("資料が2つ以上ある fixtures が必要です"); process.exit(1); }
const ARCH = srcs[0], KEEP = srcs.slice(1);
const unitsOf = (pred) => [...fix.units].filter(([, u]) => pred(u.source));
const vocOf = (pred) => new Set(unitsOf(pred).flatMap(([, u]) => u.blocks.flatMap((b) => (b.voc || []).map((v) => H.vocKey(v[0])))));
const phrOf = (pred) => new Set(unitsOf(pred).flatMap(([, u]) => u.blocks.flatMap((b) => (b.phr || []).map((v) => H.phrKey(v[0])))));
const archOnly = [...vocOf((s) => s === ARCH)].filter((k) => !vocOf((s) => s !== ARCH).has(k));
const archPhrOnly = [...phrOf((s) => s === ARCH)].filter((k) => !phrOf((s) => s !== ARCH).has(k));
const dueWords = archOnly.slice(0, 3), duePhr = archPhrOnly[0];
const past = Date.now() - 3 * 86400000;
const card = { s: 2, ivl: 3, ease: 2.5, reps: 2, lapses: 0, due: past, last: past - 86400000 };
const cards = {}; [...dueWords, duePhr].forEach((k) => { cards[H.encKey(k)] = { ...card }; });
// srs はシャードに分かれているが、読み込みはどのシャードからでもよいので srs-0 にまとめて入れる
const user = new Map([
  ["meta", { newPerDay: 20, phrPerDay: 5, order: "read", rate: 1, day: "", newDone: 0, reviewsDone: 0 }],
  ["srs-0", { cards }],
  ["archive", { sources: { [ARCH]: { on: true, at: Date.now() - 86400000 } } }],
]);
const t = H.startHub({ fix, user });
const { $, w, ok, click, delay, log } = t;
const keepN = unitsOf((s) => s !== ARCH).length, archN = unitsOf((s) => s === ARCH).length;
const keepPhr = phrOf((s) => s !== ARCH).size;

(async () => {
  await delay(400);
  // --- 起動時：しまった資料の章は読まない ---
  ok(log.unitDocs.length === keepN && log.unitDocs.every((id) => fix.units.get(id).source !== ARCH), "起動時に読んだ章: " + log.unitDocs.join(","));
  ok($("sourceList").querySelectorAll(".src-block").length === KEEP.length, "今の資料の一覧にしまった資料が出ている");
  ok(/しまった資料（1）/.test($("archList").textContent), "しまった資料の一覧がない");
  const split = $("dueSplit").textContent;
  ok(new RegExp(`復習 ${dueWords.length}`).test(split) && new RegExp(`表現 ${1 + Math.min(5, keepPhr)}`).test(split), "今日の復習の数（しまった資料の分を含む）: " + split);

  // --- 復習：しまった資料を1回だけ読み、復習の語は出す／新出には出さない ---
  $("tab-review").click(); await delay(150);
  const seen = new Map();
  for (let i = 0; i < 200; i++) {
    const area = $("reviewArea");
    if (area.querySelector(".done")) break;
    const chips = [...area.querySelectorAll(".card-meta .chip")].map((c) => c.textContent);
    const word = area.querySelector(".card-word h2") ? area.querySelector(".card-word h2").textContent.toLowerCase() : null;
    const rv = $("revealBtn"); if (rv) click(rv);
    const p = area.querySelector(".phr-p"); const key = word || (p ? H.phrKey(p.textContent) : null);
    if (key) seen.set(key, chips[0]);
    const g = $("reviewArea").querySelector('[data-g="2"]'); if (!g) break; click(g); await delay(5);
  }
  const archReads = log.unitDocs.filter((id) => fix.units.get(id).source === ARCH).length;
  ok(archReads === archN, `しまった資料の章を読んだ回数: ${archReads}（章は ${archN}）`);
  ok(dueWords.every((k) => seen.get(k) === "復習"), "しまった資料の復習の語が出ない: " + dueWords.map((k) => k + "=" + seen.get(k)));
  ok(seen.get(duePhr) === "復習", "しまった資料の復習の表現が出ない");
  const freshArch = [...seen].filter(([k, c]) => c === "新出" && (archOnly.includes(k) || archPhrOnly.includes(k)));
  ok(!freshArch.length, "しまった資料の語が新出に出た: " + freshArch.map((x) => x[0]));

  // --- 単語帳：ふだんは隠し、ボタンで表示（読み込み済みなので追加の読み込みはない） ---
  const before = log.unitDocs.length;
  $("tab-words").click(); await delay(50);
  const search = (q) => { $("wSearch").value = q; $("wSearch").dispatchEvent(new w.Event("input")); };
  const only = archOnly[Math.min(5, archOnly.length - 1)];
  search(only); await delay(250);
  ok(!$("wList").querySelector(`[data-k="${only}"]`), "しまった資料だけの語が単語帳に出ている");
  ok(!$("wArch").hidden, "「しまった資料の語も表示」ボタンがない");
  click($("wArch")); await delay(150);
  ok($("wList").querySelector(`[data-k="${only}"]`), "表示を選んでも出ない");
  ok(log.unitDocs.length === before, "読み込み済みなのにまた読んだ");
  click($("wArch")); search(""); await delay(250);

  // --- 戻す ---
  $("tab-today").click(); await delay(50);
  click($("archToggle"));
  click($("archList").querySelector(`[data-unarch="${ARCH}"]`)); await delay(200);
  ok($("sourceList").querySelectorAll(".src-block").length === srcs.length && !$("archList").textContent.trim(), "戻しても一覧に出ない");
  const aw = log.writes.filter((x) => x[1] === "data/users/u1/archive");
  ok(aw.length && aw[aw.length - 1][2].sources[ARCH].on === false, "戻した記録が保存されない");

  // --- 確認つきでしまう ---
  click($("sourceList").querySelector(`[data-arch="${ARCH}"]`));
  ok($("sourceList").querySelector(".arch-confirm"), "確認が出ない");
  click($("sourceList").querySelector("[data-arch-no]"));
  ok(!$("sourceList").querySelector(".arch-confirm"), "やめるで閉じない");
  const n0 = log.unitDocs.length;
  click($("sourceList").querySelector(`[data-arch="${ARCH}"]`));
  click($("sourceList").querySelector(`[data-arch-yes="${ARCH}"]`)); await delay(200);
  ok($("sourceList").querySelectorAll(".src-block").length === KEEP.length && /しまった資料（1）/.test($("archList").textContent), "しまえない");
  ok(log.unitDocs.slice(n0).every((id) => fix.units.get(id).source !== ARCH), "しまった後に読み直した章: " + log.unitDocs.slice(n0));
  const aw2 = log.writes.filter((x) => x[1] === "data/users/u1/archive");
  ok(aw2[aw2.length - 1][2].sources[ARCH].on === true, "しまった記録が保存されない");
  $("tab-read").click(); await delay(150);
  ok(![...$("shUnit").options].some((o) => fix.units.has(o.value) && fix.units.get(o.value).source === ARCH), "読む画面の選択肢に出ている");

  // --- すべてしまう ---
  $("tab-today").click(); await delay(30);
  for (const s of KEEP) {
    click($("sourceList").querySelector(`[data-arch="${s}"]`));
    click($("sourceList").querySelector(`[data-arch-yes="${s}"]`)); await delay(150);
  }
  ok(/すべての資料をしまっています/.test($("sourceList").textContent) && new RegExp(`しまった資料（${srcs.length}）`).test($("archList").textContent), "すべてしまったときの表示");
  t.finish({ archived: ARCH, unitReads: log.unitDocs.length });
})();
