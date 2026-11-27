/* =========================================================
   書くタブの添削（段階3）: 自分の Claude との「コピー＆貼り付け」
   ---------------------------------------------------------
   claude.ai の中ではハブが Claude を直接呼べた（window.claude.use("sample")）。
   端末版では API を使わないので、
     1. ハブが作った依頼文をコピーする
     2. 自分の Claude（アプリや claude.ai）に貼って送る
     3. Claude の返事を全部コピーして、ハブに貼り戻す
   という往復にする。この部品は 3 の「貼り戻された返事」を読み取り、
   結果（JSON）を取り出して形を確かめる。画面と保存は index.html の側で行う。

   使い方:
     const r = HubRelay.parseReply(text, "fix" | "ja");
       r.ok   … 読み取れた
       r.data … 取り出した結果（JSON をそのまま解釈したもの。形の整理は index.html の normalizeRes）
       r.msg  … 読み取れないときの、やさしい説明（日本語。HTML ではない文字列）
   貼られた文字は外から来たものとして扱う（JSON.parse だけを使い、画面に出すときは index.html が esc する）。
   ========================================================= */
(function (root) {
  "use strict";

  // 返事の中から、いちばん外側の { … } を取り出す。文字列の中の { } は数えない
  // 返り値: { json } | { cut: true }（{ で始まるが閉じていない） | null（{ が無い）
  function findObject(s) {
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== "{") continue;
      start = i;
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) return { json: s.slice(i, j + 1), start: i }; }
      }
      return { cut: true };
    }
    return start < 0 ? null : { cut: true };
  }

  // よくある崩れ（最後の要素の後ろのカンマ）を直してから解釈する
  function looseParse(s) {
    try { return { v: JSON.parse(s) }; } catch (e) { /* 次を試す */ }
    const t = s.replace(/,\s*([}\]])/g, "$1");
    try { return { v: JSON.parse(t) }; } catch (e) { return { err: e }; }
  }

  function parseReply(text, kind) {
    const raw = String(text == null ? "" : text).replace(/^﻿/, "").trim();
    if (!raw) return { ok: false, msg: "返事が空です。Claude の返事を全部コピーして、ここに貼ってください。" };
    // 依頼文そのものを貼ってしまった
    if (/# 出力\s*\n次の形のJSON/.test(raw) || /# 学習者の要約/.test(raw)) {
      return { ok: false, msg: "貼ったのは依頼文のようです。依頼文を Claude に送ったあと、Claude の「返事」のほうをコピーして貼ってください。" };
    }
    // ```json … ``` で囲まれていれば、その中を使う
    let body = raw;
    const fence = raw.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
    if (fence && fence[1].includes("{")) body = fence[1];
    const found = findObject(body);
    if (!found) return { ok: false, msg: "返事の中に結果（{ で始まる部分）が見つかりません。Claude の返事を最初から最後まで全部コピーして貼ってください。" };
    if (found.cut) return { ok: false, msg: "結果が途中で切れています（最後の } がありません）。返事を最後まで全部コピーしたか確かめてください。Claude の返事が途中で止まっていたら、Claude に「続けて」と送るか、もう一度依頼してください。" };
    const p = looseParse(found.json);
    if (p.err) {
      return { ok: false, msg: "結果の形が崩れていて読み取れません。返事を全部そのままコピーしたか確かめてください。直らないときは、Claude に「JSONの形が崩れています。同じ内容を、指定の形のJSONだけでもう一度出してください」と送り、新しい返事を貼ってください。" };
    }
    const v = p.v;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, msg: "結果の形が違います（{ … } の形ではありません）。返事を全部コピーして貼ってください。" };
    if (kind === "ja") {
      if (typeof v.ja !== "string" || !v.ja.trim()) return { ok: false, msg: "訳（ja）が見つかりません。訳を頼んだ依頼文への返事を貼っているか確かめてください。" };
      return { ok: true, data: v };
    }
    if (typeof v.ja === "string" && !("corrected" in v) && !("items" in v)) {
      return { ok: false, msg: "貼ったのは「訳」の返事のようです。添削の依頼文への返事を貼ってください。" };
    }
    if (v.items != null && !Array.isArray(v.items)) return { ok: false, msg: "直したところ（items）の形が違います。Claude にもう一度依頼してください。" };
    const hasCorr = typeof v.corrected === "string" && v.corrected.trim();
    const hasItems = Array.isArray(v.items) && v.items.length;
    if (!hasCorr && !hasItems) return { ok: false, msg: "直した英文（corrected）が見つかりません。添削の依頼文への返事を貼っているか確かめてください。" };
    return { ok: true, data: v };
  }

  const api = { parseReply: parseReply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) root.HubRelay = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
