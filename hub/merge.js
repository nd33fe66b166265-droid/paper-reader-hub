/* =========================================================
   2台の記録を合わせる（段階5）
   ---------------------------------------------------------
   バックアップを読み込むとき、今の端末の中身を「置き換える」のでなく「合わせる」ための部品。
   画面には依らない関数だけ（tests/t18 が確かめる）。画面は index.html の「保存」ダイアログ（/* ==== App の節）。

   HubMerge.merge(cur, inc) … cur = 今の端末の中身、inc = バックアップの中身（どちらも [{ col, id, data }]）
     → { rows: 合わせた中身, report: { … 何をどう合わせたかの数 } }
   どちらの入力も書き換えない（読んだ記録は凍結されていることがあるので、いつも新しい物を作る）。

   合わせ方（どれも「記録を失わない」ことを先にする）:
     教材（sources / units / texts / overviews）… 片方にしか無い物は足す。両方にある物は今の端末の方を残す
                                               （章は units と texts を組で決める。中身が違う章の数は report に出す）
     復習カード（srs-0〜7）… カードごとに「最後に学習した時刻（last）」が新しい方
     設定と今日の数（meta）… 設定は今の端末のまま。今日の数は同じ日なら大きい方、日が違えば新しい日の方。
                            最後に復習した日・ずらし済みの日などは新しい方。「とばした」の知らせは今の端末の分
     学習時間（time-）… 日ごと・端末ごと（端末 ID）に足し合わせる。同じ端末の同じ日が両方にあれば、項目ごとに大きい方
     手入力の記録（log-）… 1件ずつ足す。両方にあれば、消した方（del）を先に、次に新しい方（at）
     要約と添削（sum-）… 1件ずつ足す。両方にあれば書き直しまで含めて新しい方。直した英文の訳が片方だけにあれば足す
     添削カード（fixes）… 1枚ずつ足す。両方にあれば今の端末の方
     読んだ位置（progress）… 章ごとに新しい方（at）。いちばん先まで読んだ段落（max）は大きい方
     しまった資料（archive）… 資料ごとに新しい方（at）
     知らない記録 … 片方にしか無ければ足す。両方にあれば今の端末の方

   「復習しなかった日をとばす」の直し:
     ハブは、開いたときに「前に復習した日の翌日から昨日まで」を復習しなかった日として、期日をまとめて後ろへずらす
     （applySkippedDays。ずらした範囲は meta.shiftNote = { from, to, n, day }）。
     2台で使うと、片方では復習しなかった日でも、もう片方では復習していることがある。合わせるとき、
     ずらした範囲のうち「もう片方で復習した日」の分だけ、ずらし過ぎを戻す。
     もう片方で復習した日 = 学習時間の「復習」がある日・カードを最後に学習した日・meta.lastReview。
     合わせた後は shiftNote に fixed: true を付け、次に合わせるとき二重に戻さない。
   ========================================================= */
(function (root) {
  "use strict";
  var DAY = 86400000, CUT_H = 4; // ハブと同じ: 1日の区切りは 4:00
  var REC = /^data\/users\//;
  var TEXT_COLS = { sources: 1, units: 1, texts: 1, overviews: 1 };
  var METER = ["newDone", "reviewsDone", "phrDone", "fixAdded", "revDone"]; // 今日の数（meta.day の日の分）
  var LATEST = ["lastReview", "skipThrough", "capDay", "pauseDay"]; // 日付の文字列。新しい方

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function copy(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(t) { var d = new Date(t - CUT_H * 3600000); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function addDays(key, n) { var d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function maxStr(a, b) { a = typeof a === "string" ? a : ""; b = typeof b === "string" ? b : ""; return a > b ? a : b; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

  /* 1つの中身を、入れ物ごと・ID ごとに引けるようにする */
  function index(rows) {
    var by = {};
    (rows || []).forEach(function (r) {
      var col = REC.test(r.col) ? "rec" : r.col;
      (by[col] || (by[col] = {}))[r.id] = r.data;
    });
    by.rec = by.rec || {};
    return by;
  }
  /* 復習カードを全部のシャードから集める → { 暗号化したキー: { card, shard } } */
  function cardsOf(rec) {
    var out = {};
    Object.keys(rec).forEach(function (id) {
      if (!/^srs-\d+$/.test(id) || !isObj(rec[id].cards)) return;
      var cs = rec[id].cards;
      Object.keys(cs).forEach(function (k) { if (isObj(cs[k])) out[k] = { card: cs[k], shard: id }; });
    });
    return out;
  }
  /* その中身で「復習した日」の集まり */
  function reviewDays(rec, cards) {
    var days = {};
    Object.keys(rec).forEach(function (id) {
      if (!/^time-/.test(id) || !isObj(rec[id].days)) return;
      var ds = rec[id].days;
      Object.keys(ds).forEach(function (day) {
        if (!isObj(ds[day])) return;
        Object.keys(ds[day]).forEach(function (dev) { var o = ds[day][dev]; if (isObj(o) && num(o.review) > 0) days[day] = 1; });
      });
    });
    Object.keys(cards).forEach(function (k) { var c = cards[k].card; if (num(c.last) > 0 && (c.s === 1 || c.s === 2)) days[dayKey(c.last)] = 1; });
    var m = rec.meta;
    if (m && typeof m.lastReview === "string" && m.lastReview) days[m.lastReview] = 1;
    return days;
  }
  /* ずらし過ぎの日数: こちらがずらした範囲のうち、もう片方で復習した日の数 */
  function overShift(meta, otherDays) {
    var sn = meta && meta.shiftNote;
    if (!isObj(sn) || sn.fixed || !DAY_RE.test(sn.from || "") || !DAY_RE.test(sn.to || "") || !DAY_RE.test(sn.day || "")) return null;
    var n = 0, d = sn.from;
    for (var i = 0; d <= sn.to && i < 400; i++, d = addDays(d, 1)) if (otherDays[d]) n++;
    return n ? { n: n, day: sn.day } : null;
  }
  /* カードの期日から、ずらし過ぎを戻す（ずらした日より前に学習したカードだけが、ずらされている） */
  function unshift(card, os) {
    if (!os || card.s !== 2 || !num(card.due) || !num(card.last) || dayKey(card.last) >= os.day) return card;
    var c = copy(card); c.due = card.due - os.n * DAY; return c;
  }

  function mergeCards(cur, inc, rep) {
    var a = cardsOf(cur.rec), b = cardsOf(inc.rec);
    var osA = overShift(cur.rec.meta, reviewDays(inc.rec, b)), osB = overShift(inc.rec.meta, reviewDays(cur.rec, a));
    var shards = {};
    function put(k, x) { (shards[x.shard] || (shards[x.shard] = {}))[k] = x.card; }
    function fixed(card, os) { var c = unshift(card, os); if (c !== card) rep.shiftFixed++; return c; }
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var x = a[k], y = b[k];
      if (!y) { put(k, { card: fixed(x.card, osA), shard: x.shard }); return; }
      if (!x) { rep.cardsAdded++; put(k, { card: fixed(y.card, osB), shard: y.shard }); return; }
      var la = num(x.card.last), lb = num(y.card.last);
      if (lb > la) { rep.cardsNewer++; put(k, { card: fixed(y.card, osB), shard: y.shard }); return; }
      if (la > lb) { put(k, { card: fixed(x.card, osA), shard: x.shard }); return; }
      // 同じ時刻に学習した同じカード: 片方だけが「復習しなかった日」でずらしていることがある。
      // ずらし過ぎを戻してから、遅い方の期日にする（本当に復習しなかった日のずれは残す）
      var ca = unshift(x.card, osA), cb = unshift(y.card, osB), card = ca;
      if (ca.s === 2 && cb.s === 2 && num(cb.due) > num(ca.due)) card = cb;
      if (card !== x.card && (card === ca || cb !== y.card)) rep.shiftFixed++;
      put(k, { card: card, shard: x.shard });
    });
    var out = {};
    Object.keys(shards).forEach(function (id) { out[id] = { cards: shards[id] }; });
    // 中身が空になったシャードも、片方にあれば残す（ハブは無いシャードを作るだけなので困らないが、形をそろえる）
    [cur.rec, inc.rec].forEach(function (rec) { Object.keys(rec).forEach(function (id) { if (/^srs-\d+$/.test(id) && !out[id]) out[id] = { cards: {} }; }); });
    return out;
  }

  function mergeMeta(a, b) {
    if (!a && !b) return null;
    var m = copy(a || b);
    if (a && b) {
      var da = typeof a.day === "string" ? a.day : "", db = typeof b.day === "string" ? b.day : "";
      if (db > da) { m.day = db; METER.forEach(function (k) { if (own(b, k)) m[k] = b[k]; else delete m[k]; }); }
      else if (db === da) METER.forEach(function (k) { if (own(a, k) || own(b, k)) m[k] = Math.max(num(a[k]), num(b[k])); });
      LATEST.forEach(function (k) { var v = maxStr(a[k], b[k]); if (v || own(a, k)) m[k] = v; });
    }
    // 「とばした」の知らせは今の端末の分を残す。合わせた後のカードは、もうこの範囲のずらし方とは合わないので、
    // 次に合わせるとき二重に戻さないよう fixed を付ける
    if (a && b && isObj(m.shiftNote)) m.shiftNote = Object.assign({}, m.shiftNote, { fixed: true });
    return m;
  }

  /* 記録の入れ子を1件ずつ合わせる。pick(x, y) → 両方にあるときに残す物 */
  function mergeItems(a, b, field, pick, rep, repKey) {
    var out = {}, xa = (a && isObj(a[field])) ? a[field] : {}, xb = (b && isObj(b[field])) ? b[field] : {};
    Object.keys(xa).forEach(function (k) { out[k] = copy(xa[k]); });
    Object.keys(xb).forEach(function (k) {
      if (!own(out, k)) { out[k] = copy(xb[k]); if (repKey && !(isObj(xb[k]) && xb[k].del)) rep[repKey]++; }
      else out[k] = copy(pick(xa[k], xb[k]));
    });
    var r = copy(a || b) || {}; r[field] = out; return r;
  }
  function newer(x, y) { return num(y && y.at) > num(x && x.at) ? y : x; }
  function pickLog(x, y) { if (isObj(x) && x.del) return x; if (isObj(y) && y.del) return y; return newer(x, y); }
  function pickSum(x, y) {
    var t = function (v) { return Math.max(num(v && v.at), num(v && v.rewriteAt)); };
    var w = t(y) > t(x) ? y : x, o = w === x ? y : x;
    if (isObj(w) && isObj(w.res) && !w.res.correctedJa && isObj(o) && isObj(o.res) && o.res.correctedJa) {
      w = copy(w); w.res.correctedJa = o.res.correctedJa;
    }
    return w;
  }
  function pickProgress(x, y) {
    var w = copy(newer(x, y));
    if (isObj(w) && (own(x || {}, "max") || own(y || {}, "max"))) w.max = Math.max(num(x && x.max), num(y && y.max));
    return w;
  }
  function keepCur(x) { return x; }
  function mergeTime(a, b) {
    var r = copy(a || b) || {}, out = {}, da = (a && isObj(a.days)) ? a.days : {}, dbs = (b && isObj(b.days)) ? b.days : {};
    [da, dbs].forEach(function (days) {
      Object.keys(days).forEach(function (day) {
        if (!isObj(days[day])) return;
        var o = out[day] || (out[day] = {});
        Object.keys(days[day]).forEach(function (dev) {
          var v = days[day][dev];
          if (!isObj(v)) return;
          if (!o[dev]) { o[dev] = copy(v); return; }
          Object.keys(v).forEach(function (k) { o[dev][k] = Math.max(num(o[dev][k]), num(v[k])); });
        });
      });
    });
    r.days = out; return r;
  }

  function same(x, y) { return JSON.stringify(x) === JSON.stringify(y); }

  function merge(curRows, incRows) {
    var cur = index(curRows), inc = index(incRows);
    var rep = { cardsAdded: 0, cardsNewer: 0, shiftFixed: 0, unitsAdded: 0, unitsDiffer: 0, sourcesAdded: 0, logsAdded: 0, sumsAdded: 0, fixesAdded: 0 };
    var rows = [];
    function add(col, id, data) { if (data) rows.push({ col: col, id: id, data: data }); }

    /* 教材: 章は units と texts を組で決める */
    Object.keys(TEXT_COLS).forEach(function (col) {
      var A = cur[col] || {}, B = inc[col] || {};
      Object.keys(A).forEach(function (id) { add(col, id, copy(A[id])); });
      Object.keys(B).forEach(function (id) {
        if (own(A, id)) { if (col === "units" && !same(A[id], B[id])) rep.unitsDiffer++; return; }
        if (col === "texts" && own(cur.units || {}, id)) return; // 章は今の端末の方を残したので、本文も今の端末の方
        if (col === "units") rep.unitsAdded++;
        if (col === "sources") rep.sourcesAdded++;
        add(col, id, copy(B[id]));
      });
    });

    /* 記録 */
    var A = cur.rec, B = inc.rec, R = "data/users/me";
    var cards = mergeCards(cur, inc, rep);
    Object.keys(cards).forEach(function (id) { add(R, id, cards[id]); });
    add(R, "meta", mergeMeta(A.meta, B.meta));
    var ids = {};
    Object.keys(A).forEach(function (id) { ids[id] = 1; });
    Object.keys(B).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).sort().forEach(function (id) {
      if (id === "meta" || /^srs-\d+$/.test(id)) return;
      var a = own(A, id) ? A[id] : null, b = own(B, id) ? B[id] : null, d;
      if (/^time-/.test(id)) d = mergeTime(a, b);
      else if (/^log-/.test(id)) d = mergeItems(a, b, "entries", pickLog, rep, "logsAdded");
      else if (/^sum-/.test(id)) d = mergeItems(a, b, "items", pickSum, rep, "sumsAdded");
      else if (id === "fixes") d = mergeItems(a, b, "cards", keepCur, rep, "fixesAdded");
      else if (id === "progress") d = mergeItems(a, b, "units", pickProgress, rep, "");
      else if (id === "archive") d = mergeItems(a, b, "sources", newer, rep, "");
      else d = copy(a || b);
      add(R, id, d);
    });
    rows.sort(function (x, y) { return x.col < y.col ? -1 : x.col > y.col ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    return { rows: rows, report: rep };
  }

  var api = { merge: merge, dayKey: dayKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) root.HubMerge = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
