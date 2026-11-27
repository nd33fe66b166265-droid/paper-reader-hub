/* =========================================================
   教材の取り込み（段階2）: 章のデータファイルの組み立てと点検
   ---------------------------------------------------------
   tools/build_unit.py（組み立て）と tools/check_hub_data.py（点検）を JavaScript に移したもの。
   画面（index.html の「教材」ダイアログ）はこの部品に文字列を渡し、返ってきた結果を見て
   「取り込める／直す所がある」を表示する。データベースへの書き込みは画面の側で行う。

   入力は2種類（どちらも外から来たものとして扱う。形と型を確かめてから使う）:
     章のデータファイル（.txt）  … 生成プロンプト v7 の 5節の書式。1行1項目の「キー: 値」
     全体図（.json）            … overviews と同じ形 {source, header, figure, toc}

   使い方:
     const r = HubImport.analyze([{ name, text }, ...], { units, sources, overviews });
       units      … いまデータベースにある章 { 章ID: units の中身 }（しまった資料の章も含める）
       sources    … いまの資料 { 資料ID: sources の中身 }
       overviews  … いまの全体図 { 資料ID: overviews の中身 }（toc の節IDの照合に使う）
     r.items  … ファイルごとの結果 { name, kind: "unit"|"overview"|"unknown", id, errors, warnings, stats, replace, writes }
                 errors / warnings は { line, msg }（line は無いこともある）
     r.ok     … どのファイルにも誤りが無く、取り込むものが1つ以上ある
     r.writes … 書き込む順に [コレクション, ID, データ]（資料 → 全体図 → 本文 → 目次）
   ========================================================= */
(function (root) {
  "use strict";

  var ID_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
  var HEAD_KEYS = ["id", "source", "label", "order", "toc", "source-title", "source-short", "source-authors",
    "source-venue", "source-kind", "source-order"];
  var BLOCK_KEYS = ["sec", "en", "ja", "note", "voc", "phr"];
  var POS = ["動", "名", "形", "副", "熟"];
  var TEXT_TAGS = ["t", "var", "sub", "sup", "span", "strong", "em", "b", "i", "code", "ol", "ul", "li", "br"];
  var SVG_TAGS = ["svg", "g", "defs", "marker", "polygon", "polyline", "path", "rect", "line", "circle", "ellipse", "text", "tspan", "title"];
  var MAX_CHARS = 3 * 1024 * 1024; // 1ファイル 3MB まで（今いちばん大きい本文でも約 44KB）

  function has(arr, x) { return arr.indexOf(x) >= 0; }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  /* ---------- 文字の小道具 ---------- */
  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
  function unescapeHtml(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") {
        var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(n); } catch (x) { return m; }
      }
      var k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : m;
    });
  }
  // タグを外して空白を1つにした文字列（phr の一致部分を探すのに使う）
  function plainText(h) { return unescapeHtml(String(h).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(); }
  // 開始タグ（と自己終了タグ）を順に取り出す。名前と属性名は小文字にする（Python の HTMLParser と同じ）
  function startTags(h) {
    var out = [], re = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?)\/?>/g, m;
    while ((m = re.exec(String(h)))) {
      var attrs = {}, ar = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, a;
      var body = m[2] || "";
      while ((a = ar.exec(body))) {
        var v = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : "";
        attrs[a[1].toLowerCase()] = unescapeHtml(v);
      }
      out.push({ tag: m[1].toLowerCase(), attrs: attrs });
    }
    return out;
  }
  // 値の中の \| は区切りではない
  function splitBar(v) { return v.replace(/\\\|/g, "\u0000").split("|").map(function (x) { return x.replace(/\u0000/g, "|").trim(); }); }
  // 属性の '…' を "…" に直し（中に " を含むものは触らない）、\| を | に戻す（build_unit.py の fix_attrs）
  function fixAttrs(h) { return String(h).replace(/(\s[\w:-]+)='([^'"]*)'/g, '$1="$2"').replace(/\\\|/g, "|"); }

  /* ---------- 章のデータファイルを読む（build_unit.py の parse） ---------- */
  function parseUnitText(text) {
    var head = {}, headLine = {}, blocks = [], cur = null, last = null, errors = [];
    var lines = String(text).replace(/^﻿/, "").split(/\r\n|\r|\n/);
    lines.forEach(function (line, i) {
      var n = i + 1;
      if (!line.trim() || /^\s*#/.test(line)) return;
      if (line.trim() === "---") {
        cur = { line: n, note: [], voc: [], phr: [], lines: {} };
        blocks.push(cur); last = null; return;
      }
      if (/^\s{2,}\S/.test(line) && last) {
        var d = last[0], k = last[1], add = " " + line.trim();
        if (Array.isArray(d[k])) d[k][d[k].length - 1].v += add; else d[k] += add;
        return;
      }
      var m = /^([a-z-]+):\s?(.*)$/.exec(line);
      if (!m) {
        errors.push({ line: n, msg: "「キー: 値」の形になっていません: " + clip(line) + "（行の頭は en: や voc: などのキー。前の行の続きなら、行頭に空白を2つ以上入れます）" });
        last = null; return;
      }
      var key = m[1], val = m[2].trim();
      if (!cur) {
        if (!has(HEAD_KEYS, key)) {
          errors.push({ line: n, msg: (has(BLOCK_KEYS, key) ? "「" + key + ":」はブロックの中で使うキーです。この行の前に --- の行を入れます" : "先頭で使えないキー「" + key + ":」です（使えるのは " + HEAD_KEYS.join(" / ") + "）") });
          last = null; return;
        }
        if (key in head) errors.push({ line: n, msg: "「" + key + ":」が2回あります（" + headLine[key] + "行目にもあります）" });
        head[key] = val; headLine[key] = n; last = [head, key];
      } else {
        if (!has(BLOCK_KEYS, key)) {
          errors.push({ line: n, msg: "ブロックで使えないキー「" + key + ":」です（使えるのは " + BLOCK_KEYS.join(" / ") + "）" });
          last = null; return;
        }
        if (key === "note" || key === "voc" || key === "phr") { cur[key].push({ v: val, line: n }); last = [cur, key]; }
        else {
          if (key in cur.lines) errors.push({ line: n, msg: "「" + key + ":」がこのブロックに2回あります（" + cur.lines[key] + "行目にもあります）。ブロックの区切りの --- を忘れていませんか" });
          cur[key] = val; cur.lines[key] = n; last = [cur, key];
        }
      }
    });
    return { head: head, headLine: headLine, blocks: blocks, errors: errors };
  }
  function clip(s) { s = String(s); return "「" + (s.length > 50 ? s.slice(0, 50) + "…" : s) + "」"; }

  /* ---------- 本文の HTML の点検（check_hub_data.py の check_text_html） ---------- */
  function checkTextHtml(where, h, line, E, W) {
    var tags = startTags(h);
    var bad = [];
    tags.forEach(function (t) { if (!has(TEXT_TAGS, t.tag) && !has(bad, t.tag)) bad.push(t.tag); });
    if (bad.length) E.push({ line: line, msg: where + ": 使えないタグ <" + bad.sort().join("> <") + "> があります（表示のときに外れます。使えるのは " + TEXT_TAGS.join(" ") + "）" });
    tags.forEach(function (t) {
      if (t.tag === "span" && !has(["eq", "eq disp", "lead"], t.attrs["class"])) W.push({ line: line, msg: where + ": span の class が eq / eq disp / lead 以外です（" + (t.attrs["class"] || "なし") + "）" });
    });
    if (/\{[A-Za-z]\w*\}/.test(h)) E.push({ line: line, msg: where + ": {R_s} のような独自の書き方が残っています。<var>R<sub>s</sub></var> のように書きます" });
  }
  // <t> で囲んだ語の見出し語（data-k があればそれ）
  function tKeys(en) {
    var out = [], re = /<t(\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(en))) {
      var km = /data-k="([^"]*)"/.exec(m[1] || "");
      out.push((km ? km[1] : plainText(m[2])).toLowerCase().trim());
    }
    return out;
  }
  function stemMatch(k, vocset) {
    if (vocset.has(k)) return true;
    var s = k.replace(/(ing|ed|es|s)$/, "");
    if (vocset.has(s)) return true;
    if (s.length < 4) return false;
    var hit = false; vocset.forEach(function (v) { if (v.indexOf(s) === 0) hit = true; });
    return hit;
  }

  /* ---------- 全体図の点検（check_hub_data.py の check_overviews / check_svg ＋ 形の確認） ---------- */
  function checkOverview(ov) {
    var E = [], W = [];
    if (!isObj(ov)) { E.push({ msg: "全体図の JSON は { で始まるオブジェクトにします" }); return { errors: E, warnings: W, ids: [] }; }
    var src = ov.source;
    if (typeof src !== "string" || !ID_RE.test(src)) E.push({ msg: "source（資料ID）がありません、または使えない文字があります（英数字と - だけにします）: " + JSON.stringify(src === undefined ? null : src) });
    var h = ov.header;
    if (!isObj(h)) E.push({ msg: "header がありません（title・authors などを入れるオブジェクト）" });
    else {
      ["title", "sub", "authors", "venue", "doi", "specs"].forEach(function (k) { if (!(k in h)) W.push({ msg: "header." + k + " がありません" }); });
      ["title", "sub", "authors", "venue", "doi"].forEach(function (k) { if (k in h && typeof h[k] !== "string") E.push({ msg: "header." + k + " は文字列にします" }); });
      if (typeof h.doi === "string" && h.doi && h.doi.indexOf("10.") !== 0) E.push({ msg: "header.doi は 10. から始まる番号だけを書きます（無ければ空文字）" });
      if ("specs" in h && !(Array.isArray(h.specs) && h.specs.every(function (x) { return Array.isArray(x) && x.length === 2 && x.every(function (y) { return typeof y === "string"; }); })))
        E.push({ msg: "header.specs は [[値, 項目名], …] の形にします（無ければ []）" });
    }
    var toc = ov.toc, items = isObj(toc) && Array.isArray(toc.items) ? toc.items : null, ids = [];
    if (!items) E.push({ msg: "toc.items（章構成の節の一覧）がありません" });
    else {
      items.forEach(function (it, i) {
        if (!isObj(it)) { E.push({ msg: "toc.items の " + (i + 1) + " 番目がオブジェクトではありません" }); return; }
        ["id", "num", "en", "ja"].forEach(function (k) { if (typeof it[k] !== "string") E.push({ msg: "toc.items の " + (i + 1) + " 番目に " + k + "（文字列）がありません" }); });
        if (typeof it.id === "string") {
          if (!/^[a-z0-9-]+$/.test(it.id)) E.push({ msg: "toc.items の id " + JSON.stringify(it.id) + " は英小文字・数字・- だけにします" });
          if (has(ids, it.id)) E.push({ msg: "toc.items の id " + JSON.stringify(it.id) + " が重複しています" });
          ids.push(it.id);
        }
      });
    }
    var fig = ov.figure;
    if (fig !== undefined && !isObj(fig)) E.push({ msg: "figure は {title, desc, svg} のオブジェクトにします" });
    if (isObj(fig)) {
      ["title", "desc", "svg"].forEach(function (k) { if (k in fig && typeof fig[k] !== "string") E.push({ msg: "figure." + k + " は文字列にします" }); });
      if (typeof fig.svg === "string" && fig.svg) checkSvg(fig.svg, ids, E, W);
    }
    return { errors: E, warnings: W, ids: ids };
  }
  function checkSvg(svg, ids, E, W) {
    var tags = startTags(svg), bad = [];
    tags.forEach(function (t) { if (!has(SVG_TAGS, t.tag) && !has(bad, t.tag)) bad.push(t.tag); });
    if (bad.length) E.push({ msg: "図の SVG に使えない要素 <" + bad.sort().join("> <") + "> があります（使えるのは " + SVG_TAGS.join(" ") + "）" });
    if (!/<svg[^>]*viewBox=/.test(svg)) E.push({ msg: "図の svg に viewBox がありません" });
    tags.forEach(function (t) {
      Object.keys(t.attrs).forEach(function (k) {
        var v = t.attrs[k];
        if (k === "style" || k.indexOf("on") === 0) E.push({ msg: "図の " + t.tag + " の " + k + " 属性は使えません" });
        if (v && v.indexOf("url(") >= 0 && !/^url\(#[\w-]+\)$/.test(v.trim())) E.push({ msg: "図の中から外への url() は使えません: " + clip(v) });
        if (k === "href" || k === "xlink:href") E.push({ msg: "図の " + t.tag + " の " + k + " は使えません（リンクは張れません）" });
      });
      if ("data-sec" in t.attrs) {
        t.attrs["data-sec"].split(/\s+/).filter(Boolean).forEach(function (i) {
          if (!has(ids, i)) E.push({ msg: "図の data-sec=\"" + i + "\" が toc.items の id にありません" });
        });
        if ((t.attrs["class"] || "").split(/\s+/).indexOf("ov-node") < 0) W.push({ msg: "図の data-sec のある " + t.tag + " に class=\"ov-node\" がありません（押しても移動しません）" });
      }
    });
  }

  /* ---------- 章を組み立てて点検する ---------- */
  function analyzeUnit(name, text, ctx, batchOv, batchUnitIds) {
    var r = { name: name, kind: "unit", id: "", errors: [], warnings: [], stats: null, replace: false, writes: [] };
    var E = r.errors, W = r.warnings;
    var p = parseUnitText(text);
    p.errors.forEach(function (e) { E.push(e); });
    var head = p.head, hl = p.headLine;
    var uid = head.id || "", src = head.source || "";
    r.id = uid; r.source = src; r.label = head.label || "";
    ["id", "source", "label", "toc"].forEach(function (k) { if (!head[k]) E.push({ line: 1, msg: "先頭（最初の --- より前）に「" + k + ":」がありません" }); });
    if (uid && !ID_RE.test(uid)) E.push({ line: hl.id, msg: "id（章ID）に使えない文字があります: " + clip(uid) + "（英数字と - だけにします。例: iizuka2024-2a）" });
    if (src && !ID_RE.test(src)) E.push({ line: hl.source, msg: "source（資料ID）に使えない文字があります: " + clip(src) + "（英数字と - だけにします。例: iizuka2024）" });
    if (uid && batchUnitIds[uid] > 1) E.push({ line: hl.id, msg: "同じ章ID「" + uid + "」のファイルを2つ選んでいます。どちらか1つにします" });
    if (!p.blocks.length) E.push({ msg: "ブロックが1つもありません（本文の前に --- の行を置きます）" });

    var old = uid && ctx.units[uid];
    r.replace = !!old;
    if (old && old.source !== src && src) W.push({ line: hl.source, msg: "この章ID はいま資料「" + old.source + "」の章です。差し替えると資料「" + src + "」に移ります" });

    // order: 書いてあればそれ。無ければ差し替えは元のまま、新しい章はその資料の最後＋1
    var order;
    if (head.order) {
      if (!/^-?\d+$/.test(head.order)) E.push({ line: hl.order, msg: "order は数にします: " + clip(head.order) });
      order = parseInt(head.order, 10);
    } else if (old && old.source === src && typeof old.order === "number") order = old.order;
    else {
      var mx = 0, any = false;
      Object.keys(ctx.units).forEach(function (id) { var u = ctx.units[id]; if (u && u.source === src && id !== uid) { any = true; mx = Math.max(mx, +u.order || 0); } });
      order = any ? mx + 1 : 1;
    }

    var ublocks = [], tblocks = [], sec = "", nvoc = 0, nphr = 0, words = new Set();
    p.blocks.forEach(function (b, i) {
      var w = "ブロック" + (i + 1);
      if (b.sec != null) sec = b.sec.replace(/\\\|/g, "|");
      if (!sec) E.push({ line: b.line, msg: w + ": sec（節の見出し）がありません。最初のブロックには必ず書きます" });
      ["en", "ja"].forEach(function (k) { if (!b[k]) E.push({ line: b.line, msg: w + ": " + k + ":（" + (k === "en" ? "英文" : "訳") + "）がありません" }); });
      var voc = [];
      b.voc.forEach(function (x) {
        var q = splitBar(x.v);
        if (q.length !== 3) { E.push({ line: x.line, msg: w + ": voc は「単語 | 品詞 | 意味」の3つに分けます（いま " + q.length + " つ）。意味の中の | は \\| と書きます" }); return; }
        if (!has(POS, q[1])) { E.push({ line: x.line, msg: w + ": voc の品詞「" + q[1] + "」は 動 / 名 / 形 / 副 / 熟 のどれかにします" }); return; }
        if (!q[0]) { E.push({ line: x.line, msg: w + ": voc の単語が空です" }); return; }
        voc.push(q); words.add(q[0].toLowerCase());
      });
      var phr = [];
      b.phr.forEach(function (x) {
        var q = splitBar(x.v);
        if (q.length === 3) q.push("");
        if (q.length !== 4) { E.push({ line: x.line, msg: w + ": phr は「表現 | 意味 | 原文中の一致部分 | 注意」に分けます（注意は省けます。いま " + q.length + " つ）" }); return; }
        if (!q[0] || !q[1] || !q[2]) { E.push({ line: x.line, msg: w + ": phr の表現・意味・原文中の一致部分は空にできません" }); return; }
        q.line = x.line; phr.push(q);
      });
      nvoc += voc.length; nphr += phr.length;
      var en = fixAttrs(b.en || ""), ja = fixAttrs(b.ja || ""), notes = b.note.map(function (x) { return fixAttrs(x.v); });
      // 点検（check_hub_data.py の check_units と同じ）
      var enLine = b.lines.en || b.line, jaLine = b.lines.ja || b.line;
      checkTextHtml(w + " の en", en, enLine, E, W);
      checkTextHtml(w + " の ja", ja, jaLine, E, W);
      notes.forEach(function (x, j) { checkTextHtml(w + " の note " + (j + 1) + "つ目", x, b.note[j].line, E, W); });
      var plain = plainText(en).toLowerCase();
      phr.forEach(function (q) {
        var hit = q[2].replace(/\s+/g, " ").trim().toLowerCase();
        if (plain.indexOf(hit) < 0) E.push({ line: q.line, msg: w + ": phr の「原文中の一致部分」" + clip(q[2]) + " が、このブロックの英文にそのまま含まれていません（英文から連続した部分を写します。大文字小文字と空白の違いは無視します）" });
      });
      var vocset = new Set(voc.map(function (v) { return v[0].toLowerCase().trim(); }));
      tKeys(en).forEach(function (k) {
        if (!stemMatch(k, vocset)) W.push({ line: enLine, msg: w + ": <t> で囲んだ「" + k + "」がこのブロックの voc にありません（タップしても意味が出ません）" });
      });
      if (/<\/t>-[a-z]/.test(en)) E.push({ line: enLine, msg: w + ": <t>…</t>-ing のように語尾が分かれています。<t data-k='見出し語'>語形全体</t> にします" });
      ublocks.push({ sec: sec, voc: voc, phr: phr.map(function (q) { return [q[0], q[1], q[2], q[3]]; }) });
      tblocks.push({ en: en, ja: ja, note: notes });
    });

    // toc（全体図の節ID）
    var toc = String(head.toc || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    var ov = batchOv[src] || ctx.overviews[src];
    if (ov) {
      var ids = ((ov.toc || {}).items || []).map(function (it) { return it && it.id; });
      toc.forEach(function (i) {
        if (!has(ids, i)) E.push({ line: hl.toc, msg: "toc の「" + i + "」が、資料「" + src + "」の全体図の章構成（toc.items の id）にありません。全体図の id: " + (ids.join(", ") || "なし") });
      });
    } else if (src) W.push({ line: hl.toc, msg: "資料「" + src + "」の全体図がまだ無いので、toc を照合していません（全体図の .json を一緒に選ぶと照合します）" });

    // 資料（sources）
    var srcDoc = null;
    if (head["source-title"]) {
      var kind = head["source-kind"] || "paper";
      if (kind !== "paper" && kind !== "textbook") E.push({ line: hl["source-kind"], msg: "source-kind は paper か textbook にします" });
      var so;
      if (head["source-order"]) {
        if (!/^-?\d+$/.test(head["source-order"])) E.push({ line: hl["source-order"], msg: "source-order は数にします" });
        so = parseInt(head["source-order"], 10);
      } else so = ctx.sources[src] && typeof ctx.sources[src].order === "number" ? ctx.sources[src].order : maxSourceOrder(ctx) + 1;
      srcDoc = { title: head["source-title"], short: head["source-short"] || "", authors: head["source-authors"] || "", venue: head["source-venue"] || "", kind: kind, order: so };
    } else if (src && !ctx.sources[src]) {
      // 資料の情報が無い新しい資料: 全体図の header から作る（無ければ資料IDを名前にする）
      var hd = ov && isObj(ov.header) ? ov.header : {};
      srcDoc = { title: typeof hd.title === "string" && hd.title ? hd.title : src, short: src, authors: typeof hd.authors === "string" ? hd.authors : "", venue: typeof hd.venue === "string" ? hd.venue : "", kind: "paper", order: maxSourceOrder(ctx) + 1 };
      W.push({ line: 1, msg: "資料「" + src + "」は初めての資料ですが、source-title: などの資料の情報がありません。" + (hd.title ? "全体図の見出しから" : "資料IDを名前にして") + "登録します（ファイルの先頭に source-title: などを書くと、その名前になります）" });
    }

    r.stats = { blocks: ublocks.length, voc: nvoc, words: words.size, phr: nphr, order: order };
    if (!E.length) {
      if (srcDoc) r.writes.push(["sources", src, srcDoc]);
      r.writes.push(["texts", uid, { unit: uid, blocks: tblocks }]);
      r.writes.push(["units", uid, { source: src, label: head.label, order: order, blockCount: ublocks.length, blocks: ublocks, toc: toc }]);
    }
    return r;
  }
  function maxSourceOrder(ctx) {
    var mx = 0; Object.keys(ctx.sources).forEach(function (k) { var o = ctx.sources[k] && ctx.sources[k].order; if (typeof o === "number") mx = Math.max(mx, o); });
    return mx;
  }

  function analyzeOverview(name, obj, ctx) {
    var r = { name: name, kind: "overview", id: "", errors: [], warnings: [], stats: null, replace: false, writes: [] };
    var c = checkOverview(obj);
    r.errors = c.errors; r.warnings = c.warnings;
    var src = isObj(obj) && typeof obj.source === "string" ? obj.source : "";
    r.id = src; r.source = src;
    r.label = isObj(obj) && isObj(obj.header) && typeof obj.header.title === "string" ? obj.header.title : src;
    r.replace = !!(src && ctx.overviews[src]);
    r.stats = { sections: c.ids.length };
    // いまある章の toc が、新しい全体図の節にあるか
    if (src) Object.keys(ctx.units).forEach(function (id) {
      var u = ctx.units[id];
      if (!u || u.source !== src || !Array.isArray(u.toc)) return;
      u.toc.forEach(function (t) { if (!has(c.ids, t)) r.warnings.push({ msg: "取り込み済みの章「" + id + "」の toc「" + t + "」が、この全体図の章構成にありません（その章を読むとき、図の色が付きません）" }); });
    });
    if (!r.errors.length) r.writes.push(["overviews", src, JSON.parse(JSON.stringify(obj))]);
    return r;
  }

  /* 入力が全体図（JSON）か章のデータファイルかを見分ける */
  function looksJson(name, text) { return /\.json$/i.test(name || "") || /^\s*[{[]/.test(String(text).replace(/^﻿/, "")); }

  function analyze(inputs, ctx) {
    ctx = { units: (ctx && ctx.units) || {}, sources: (ctx && ctx.sources) || {}, overviews: (ctx && ctx.overviews) || {} };
    var items = [], batchOv = {}, ovItems = [], unitInputs = [];
    inputs.forEach(function (inp) {
      var name = inp.name || "貼り付けた文字", text = String(inp.text == null ? "" : inp.text);
      if (text.length > MAX_CHARS) { items.push({ name: name, kind: "unknown", id: "", errors: [{ msg: "ファイルが大きすぎます（3MB まで）。章のデータファイルか全体図の JSON を選んでいるか確かめます" }], warnings: [], writes: [] }); return; }
      if (!text.trim()) { items.push({ name: name, kind: "unknown", id: "", errors: [{ msg: "中身が空です" }], warnings: [], writes: [] }); return; }
      if (looksJson(name, text)) {
        var obj;
        try { obj = JSON.parse(text.replace(/^﻿/, "")); }
        catch (e) { items.push({ name: name, kind: "overview", id: "", errors: [{ msg: "JSON として読めません（" + String(e && e.message || e).slice(0, 120) + "）。全体図のファイルを丸ごと写しているか確かめます" }], warnings: [], writes: [] }); return; }
        var r = analyzeOverview(name, obj, ctx);
        if (r.id && batchOv[r.id]) r.errors.push({ msg: "資料「" + r.id + "」の全体図を2つ選んでいます。どちらか1つにします" });
        if (!r.errors.length) batchOv[r.id] = obj;
        ovItems.push(r);
      } else unitInputs.push({ name: name, text: text });
    });
    var batchUnitIds = {};
    unitInputs.forEach(function (u) { var id = parseUnitText(u.text).head.id; if (id) batchUnitIds[id] = (batchUnitIds[id] || 0) + 1; });
    var unitItems = unitInputs.map(function (u) { return analyzeUnit(u.name, u.text, ctx, batchOv, batchUnitIds); });
    // 新しい資料を2つの章ファイルが別々に登録しようとしたら、先の方だけにする
    var seenSrc = {};
    unitItems.forEach(function (r) {
      r.writes = r.writes.filter(function (w) { if (w[0] !== "sources") return true; if (seenSrc[w[1]]) return false; seenSrc[w[1]] = true; return true; });
    });
    items = items.concat(ovItems, unitItems);
    var all = [];
    ["sources", "overviews", "texts", "units"].forEach(function (col) {
      items.forEach(function (r) { r.writes.forEach(function (w) { if (w[0] === col) all.push(w); }); });
    });
    var ok = items.length > 0 && items.every(function (r) { return !r.errors.length; });
    return { items: items, ok: ok, writes: ok ? all : [] };
  }

  var api = { analyze: analyze, parseUnitText: parseUnitText, checkOverview: checkOverview, fixAttrs: fixAttrs, plainText: plainText, startTags: startTags };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HubImport = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
