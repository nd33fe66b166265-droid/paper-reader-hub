// 復習しなかった日をとばす ＋ 1日の復習の上限（Version 13）
// 引数なし: 3日前に最後に復習 → 一昨日・昨日の2日分、復習日がすべて2日後ろにずれる。知らせ、保存（meta を先に）、
//          もう一度開いても二重にずらさない、閉じた知らせは出ない。
// "yesterday": 昨日復習していれば、ずらさない。
// "legacy":    lastReview の無い古い記録でも、カードの last から最後に復習した日を求めてずらす。
// "midnight":  開いたまま日付が変わったときも、読み直してずらす。
// "cap":       期日の来た復習 12 枚・上限 5 → 期日の古い順に 5 枚だけ出る、残りは「明日以降」、評価で revDone と lastReview、
//              上限を変えると出る枚数が変わる、0 で上限なし。
const H = require("./harness");
const fix = H.loadFixtures();
const CUT_H = 4, DAY = 86400000;
const p2 = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const dayKey = (t) => keyOf(new Date(t - CUT_H * 3600000));
const dateOf = (k) => new Date(k + "T12:00:00");
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const startOf = (k) => new Date(k + "T04:00:00").getTime(); // その日の区切り（4:00）
const md = (k) => `${+k.slice(5, 7)}/${+k.slice(8)}`;
const T = dayKey(Date.now());
const MODE = process.argv[2] || "skip";

const units = H.sortedUnits(fix);
const vocs = [...new Set(units.flatMap(([, u]) => u.blocks.flatMap((b) => (b.voc || []).map((v) => H.vocKey(v[0])))))];
const card = (dueKey, lastKey) => ({ s: 2, ivl: 3, ease: 2.5, reps: 2, lapses: 0, due: startOf(dueKey), last: startOf(lastKey) + 3600000 });
const L = addDays(T, -3);

function skipUser(withLastReview, lastReview) {
  // c0: 最後に評価したカード（期日は先）。c1: 一昨日が期日、c2: 昨日、c3: 今日、c4: L（L にやり残した分）
  const ks = vocs.slice(0, 5);
  const cards = {
    [H.encKey(ks[0])]: card(addDays(T, 20), L),
    [H.encKey(ks[1])]: card(addDays(T, -2), addDays(L, -5)),
    [H.encKey(ks[2])]: card(addDays(T, -1), addDays(L, -5)),
    [H.encKey(ks[3])]: card(T, addDays(L, -5)),
    [H.encKey(ks[4])]: card(L, addDays(L, -5)),
  };
  const meta = { newPerDay: 0, phrPerDay: 0, order: "read", rate: 1, day: L, newDone: 0, reviewsDone: 3, phrDone: 0 };
  if (withLastReview) meta.lastReview = lastReview;
  return { ks, user: new Map([["meta", meta], ["srs-0", { cards }]]) };
}
const dueChip = (t) => (t.$("dueSplit").textContent.match(/復習 (\d+)/) || [])[1];

(async () => {
  if (MODE === "skip" || MODE === "legacy") {
    const { ks, user } = skipUser(MODE === "skip", L);
    const t = H.startHub({ fix, user });
    const { $, ok, click, delay, log } = t;
    await delay(400);
    // 期日 T-2→T, T-1→T+1, T→T+2, L→T-1：今日出るのは c1 と c4 の2枚（ずらさなければ4枚）
    ok(dueChip(t) === "2", "ずらした後の今日の復習: " + $("dueSplit").textContent);
    const note = $("shiftNote").textContent;
    ok(note.includes(`${md(addDays(L, 1))}〜${md(addDays(T, -1))}`) && /2日間/.test(note) && /2日後ろ/.test(note), "知らせ: " + note);
    await delay(800);
    const ws = log.writes.filter((x) => x[0] === "set" && /data\/users\/u1\/(meta|srs-)/.test(x[1]));
    const iMeta = ws.findIndex((x) => /meta/.test(x[1])), iSrs = ws.findIndex((x) => /srs-/.test(x[1]));
    ok(iMeta >= 0 && iSrs >= 0 && iMeta < iSrs, "meta を先に書いていない: " + ws.map((x) => x[1]));
    const m = iMeta >= 0 ? ws[iMeta][2] : {};
    ok(m.skipThrough === addDays(T, -1) && m.shiftNote && m.shiftNote.n === 2, "skipThrough / shiftNote: " + JSON.stringify(m));
    const sc = Object.assign({}, ...ws.filter((x) => /srs-/.test(x[1])).map((x) => x[2].cards));
    ok(sc[H.encKey(ks[1])].due === startOf(addDays(T, -2)) + 2 * DAY && sc[H.encKey(ks[0])].due === startOf(addDays(T, 20)) + 2 * DAY, "期日が2日ずれていない");
    // 知らせを閉じる → 保存される
    click($("shiftClose")); await delay(800);
    ok(!$("shiftNote").textContent.trim(), "閉じても知らせが残る");
    const m2 = log.writes.filter((x) => x[1] === "data/users/u1/meta").pop()[2];
    ok(m2.shiftNote.seen === true, "閉じたことが保存されない");
    // 保存された記録でもう一度開く → 二重にずらさない、知らせも出ない
    const t2 = H.startHub({ fix, user: t.userStore });
    await t2.delay(400);
    ok(dueChip(t2) === "2" && !t2.$("shiftNote").textContent.trim(), "もう一度開くと二重にずれた／知らせが出た: " + t2.$("dueSplit").textContent);
    ok(!t2.log.writes.some((x) => /srs-/.test(x[1])), "もう一度開いたときにカードを書き直した");
    t.ok(!t2.fail.length && !t2.errs.length, "2回目: " + t2.fail.concat(t2.errs));
    return t.finish({ mode: MODE });
  }
  if (MODE === "yesterday") {
    const { user } = skipUser(true, addDays(T, -1));
    const t = H.startHub({ fix, user });
    await t.delay(400);
    t.ok(dueChip(t) === "4" && !t.$("shiftNote").textContent.trim(), "昨日復習したのにずれた: " + t.$("dueSplit").textContent);
    await t.delay(800);
    t.ok(!t.log.writes.some((x) => /srs-/.test(x[1])), "ずらさないのにカードを書いた");
    return t.finish({ mode: MODE });
  }
  if (MODE === "midnight") {
    // 昨日復習済みで開いたまま、2日後に日付が変わる → 開いたまま読み直して、復習しなかった今日・明日の2日分をずらす
    const { ks, user } = skipUser(true, addDays(T, -1));
    let off = 0;
    const t = H.startHub({ fix, user, beforeParse(w) { const real = w.Date.now.bind(w.Date); w.Date.now = () => real() + off; } });
    await t.delay(400);
    t.ok(!t.$("shiftNote").textContent.trim(), "最初からずれた");
    const r0 = t.log.writes.length;
    off = 2 * DAY; await t.delay(1600);
    const note = t.$("shiftNote").textContent;
    t.ok(/2日間/.test(note) && note.includes(`${md(T)}〜${md(addDays(T, 1))}`), "開いたまま日付が変わったときの知らせ: " + note);
    await t.delay(800);
    const ms = t.log.writes.slice(r0).filter((x) => x[1] === "data/users/u1/meta");
    t.ok(ms.length && ms[ms.length - 1][2].skipThrough === addDays(T, 1), "skipThrough: " + JSON.stringify(ms.map((x) => x[2].skipThrough)));
    const sc = Object.assign({}, ...t.log.writes.slice(r0).filter((x) => /srs-/.test(x[1])).map((x) => x[2].cards));
    t.ok(sc[H.encKey(ks[0])] && sc[H.encKey(ks[0])].due === startOf(addDays(T, 20)) + 2 * DAY, "開いたまま日付が変わったときに期日がずれない");
    return t.finish({ mode: MODE });
  }
  if (MODE === "cap") {
    // 期日の来た 12 枚（期日はばらばら）。昨日復習済み（ずらさない）、上限 5
    const ks = vocs.slice(0, 12), cards = {};
    ks.forEach((k, i) => { cards[H.encKey(k)] = card(addDays(T, -((i * 7) % 12)), addDays(T, -1)); });
    const order = [...ks].sort((a, b) => cards[H.encKey(a)].due - cards[H.encKey(b)].due || (a < b ? -1 : 1));
    const user = new Map([["meta", { newPerDay: 0, phrPerDay: 0, order: "read", rate: 1, day: T, newDone: 0, reviewsDone: 0, phrDone: 0, revPerDay: 5, lastReview: addDays(T, -1) }], ["srs-0", { cards }]]);
    const t = H.startHub({ fix, user });
    const { $, w, ok, click, delay, log } = t;
    await delay(400);
    ok(dueChip(t) === "5" && /明日以降 7/.test($("dueSplit").textContent), "上限の内訳: " + $("dueSplit").textContent);
    ok(/1日5枚まで/.test($("startHint").textContent) && $("dueBadge").textContent === "5", "上限の案内・バッジ: " + $("startHint").textContent);
    $("tab-review").click(); await delay(100);
    const seen = [];
    for (let i = 0; i < 20; i++) {
      const a = $("reviewArea"); if (a.querySelector(".done")) break;
      const h2 = a.querySelector(".card-word h2"); if (h2) seen.push(h2.textContent.toLowerCase());
      click($("revealBtn")); const g = $("reviewArea").querySelector('[data-g="2"]'); if (!g) break; click(g); await delay(5);
    }
    ok(seen.length === 5 && seen.join() === order.slice(0, 5).join(), "期日の古い順に5枚: " + seen + " / " + order.slice(0, 5));
    ok(/上限（5枚）/.test($("reviewArea").textContent) && /残りの7枚/.test($("reviewArea").textContent), "終わりの画面の案内: " + $("reviewArea").textContent);
    await delay(800);
    const m = log.writes.filter((x) => x[1] === "data/users/u1/meta").pop()[2];
    ok(m.revDone === 5 && m.lastReview === T, "revDone / lastReview: " + JSON.stringify(m));
    // 上限を 8 に → あと3枚
    $("tab-today").click(); await delay(20);
    click($("openSettings")); $("sRev").value = "8"; $("sSave").dispatchEvent(new w.Event("click", { bubbles: true })); await delay(20);
    ok(dueChip(t) === "3" && /明日以降 4/.test($("dueSplit").textContent), "上限を上げたとき: " + $("dueSplit").textContent);
    click($("openSettings")); ok($("sRev").value === "8", "設定の表示"); $("sRev").value = "0"; $("sSave").dispatchEvent(new w.Event("click", { bubbles: true })); await delay(20);
    ok(dueChip(t) === "7" && !/明日以降/.test($("dueSplit").textContent), "上限なし: " + $("dueSplit").textContent);
    return t.finish({ mode: MODE });
  }
})();
