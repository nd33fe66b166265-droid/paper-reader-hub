// 論文の全体図と章構成（第3段階）: 必要なときだけ読む、開閉と記憶、今読んでいる章のハイライト、
// 図から章構成へ、章構成から別の章へ、SVG の無害化。overviews のある資料ごとに確かめる。
const H = require("./harness");
const fix = H.loadFixtures();
// 危険な要素を混ぜた図で無害化を確かめる（最初の資料だけ）
const firstSrc = [...fix.overviews.keys()][0];
const evil = JSON.parse(JSON.stringify(fix.overviews.get(firstSrc)));
evil.figure.svg = evil.figure.svg.replace("</svg>", '<script>window.__x=1</script><a href="javascript:alert(1)"><rect class="evil" x="1" y="1" width="2" height="2" onclick="window.__y=1"/></a><foreignObject><div>x</div></foreignObject><image href="https://evil.example/x.png"/><rect style="fill:red" x="0" y="0" width="1" height="1"/></svg>');
fix.overviews.set(firstSrc, evil);
const t = H.startHub({ fix, user: new Map() });
const { $, w, ok, click, delay, log } = t;
const units = H.sortedUnits(fix);
const idsOf = (n) => String(n.getAttribute("data-sec") || "").split(/\s+/).filter(Boolean);

(async () => {
  await delay(400);
  ok(!log.reads.some((r) => r.startsWith("overviews/")), "起動時に全体図を読んでいる");
  let first = true;
  for (const [src, ov] of fix.overviews) {
    const su = units.filter(([, u]) => u.source === src && Array.isArray(u.toc) && u.toc.length);
    if (!su.length) continue;
    // その資料で扱う節がいちばん多い章を開く
    const [UID, U] = [...su].sort((a, b) => b[1].toc.length - a[1].toc.length)[0];
    const allToc = new Set(su.flatMap(([, u]) => u.toc));
    if (first) { click($("sourceList").querySelector(`[data-read="${UID}"]`)); }
    else { $("shUnit").value = UID; $("shUnit").dispatchEvent(new w.Event("change")); }
    await delay(250);
    if (!$("ovToggle")) { ok(false, src + ": 全体図が出ない"); continue; }
    if ($("ovPanel").hidden) click($("ovToggle"));
    ok(!$("ovPanel").hidden && $("ovToggle").getAttribute("aria-expanded") === "true", src + ": 開いていない");
    ok($("rdOvWrap").textContent.includes(ov.header.title.slice(0, 20)), src + ": 論文情報がない");
    ok($("rdOvWrap").querySelectorAll(".spec-chip").length === (ov.header.specs || []).length, src + ": スペックの数");
    const svg = $("ovFig") && $("ovFig").querySelector("svg");
    ok(svg, src + ": 図がない");
    if (!svg) continue;
    if (src === firstSrc) ok(!svg.querySelector("script, a, foreignObject, image, [onclick], [style]") && w.__x === undefined, "危険な要素が残っている");
    const nodes = [...svg.querySelectorAll("[data-sec]")];
    const want = (n) => idsOf(n).some((id) => U.toc.includes(id)) ? "here" : idsOf(n).some((id) => allToc.has(id)) ? "has" : "none";
    const wrong = nodes.filter((n) => !n.classList.contains(want(n))).map((n) => n.getAttribute("data-sec") + "≠" + want(n));
    ok(!wrong.length, src + ": ブロックの色分け " + wrong);
    const items = ov.toc.items;
    ok($("rdOvWrap").querySelectorAll(".ov-toc li").length === items.length, src + ": 章構成の数");
    const cur = [...$("rdOvWrap").querySelectorAll(".ov-toc li.cur")].map((li) => li.dataset.toc);
    ok(cur.join() === items.filter((it) => U.toc.includes(it.id)).map((it) => it.id).join(), src + ": 章構成のハイライト " + cur);
    // 図のブロックを押すと章構成の該当行が光る
    const n0 = nodes[0];
    click(n0.querySelector("rect") || n0);
    ok($("rdOvWrap").querySelector(`[data-toc="${idsOf(n0)[0]}"]`).classList.contains("flash"), src + ": 図から章構成へ移らない");
    // 閉じて、章構成から別の章へ（閉じたまま引き継ぐ）
    const go = $("rdOvWrap").querySelector("[data-ovgo]");
    if (go) {
      click($("ovToggle"));
      ok($("ovPanel").hidden && /表示する/.test($("ovToggle").textContent), src + ": 閉じられない");
      const to = go.dataset.ovgo;
      click(go); await delay(250);
      ok($("shUnit").value === to && $("rdBody").querySelectorAll(".para").length === fix.units.get(to).blocks.length, src + ": 章構成から章へ移れない");
      ok($("ovPanel").hidden, src + ": 閉じた状態が引き継がれない");
      click($("ovToggle"));
      ok(!$("ovPanel").hidden, src + ": 開き直せない");
      const here = [...$("ovFig").querySelectorAll(".here")].flatMap(idsOf);
      ok(here.some((id) => fix.units.get(to).toc.includes(id)), src + ": 移動後のハイライト");
    }
    first = false;
  }
  const ovReads = log.reads.filter((r) => r.startsWith("overviews/"));
  ok(ovReads.length === new Set(ovReads).size, "全体図を2回以上読んでいる: " + ovReads);
  t.finish({ overviewReads: ovReads });
})();
