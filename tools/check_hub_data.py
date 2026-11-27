#!/usr/bin/env python3
"""学習ハブに登録する前の点検（生成プロンプト v7「6. 学習ハブへの登録」）。

使い方（ファイル方式。v7 から）:
  python3 check_hub_data.py --content <hub> [--only <章ID>[,<章ID>]] [--toc-ids <資料>=<節ID>,<節ID>...] [--overviews <dir2>]
    <hub>/content/index.json と content/texts/, content/overviews/ を点検する（build_unit.py のあと）
    --only     この章だけを細かく点検する（index 全体の形はいつも点検する）
    --toc-ids  全体図がデータベースにある資料の節ID（db_get overviews/<資料> の toc.items の id）。
               例: --toc-ids sedra=intro,1-1,1-2,2-1  （何回でも）

使い方（データベース方式。以前の章を直すとき）:
  python3 check_hub_data.py <dir> [--overviews <dir2>]
    <dir>/units/<unitId>.json, <dir>/texts/<unitId>.json   … これから書く（または書いた）章
    <dir>/overviews/<srcId>.json                           … これから書く全体図（あれば）
    --overviews <dir2>  既にある overviews の写し（ArtifactData get/list の out_dir）。
                        units の toc の節IDをここの toc.items と照合する。<dir>/overviews が優先。
終了コード: 誤りがあれば 1（警告だけなら 0）。
"""
import html, json, os, re, sys
from html.parser import HTMLParser

TEXT_TAGS = {"t", "var", "sub", "sup", "span", "strong", "em", "b", "i", "code", "ol", "ul", "li", "br"}
SVG_TAGS = {"svg", "g", "defs", "marker", "polygon", "polyline", "path", "rect", "line", "circle", "ellipse", "text", "tspan", "title"}
ERR, WARN = [], []

def load(d):
    out = {}
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith(".json"):
                v = json.load(open(os.path.join(d, f), encoding="utf-8"))
                if isinstance(v, dict) and isinstance(v.get("data"), dict) and len(v) <= 3 and not any(k in v for k in ("blocks", "header", "cards")):
                    v = v["data"]
                out[f[:-5]] = v
    return out

def strip(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h))).strip()

class Tags(HTMLParser):
    def __init__(self):
        super().__init__(); self.tags = []; self.attrs = []
    def handle_starttag(self, tag, attrs):
        self.tags.append(tag); self.attrs.append((tag, dict(attrs)))
    handle_startendtag = handle_starttag

def tags_of(h):
    p = Tags(); p.feed(h); return p

def check_text_html(where, h):
    p = tags_of(h)
    bad = sorted({t for t in p.tags if t not in TEXT_TAGS})
    if bad: ERR.append(f"{where}: 使えないタグ {bad}（表示時に外れる）")
    for tag, a in p.attrs:
        if tag == "span" and a.get("class") not in ("eq", "eq disp", "lead"):
            WARN.append(f"{where}: span の class={a.get('class')!r} は eq / eq disp / lead 以外")
    if "{" in h and re.search(r"\{[A-Za-z]\w*\}", h):
        ERR.append(f"{where}: {{R_s}} のような独自記法が残っている。<var>R<sub>s</sub></var> に展開する")

def t_keys(en):
    keys = []
    for m in re.finditer(r"<t(\s[^>]*)?>(.*?)</t>", en, re.S):
        km = re.search(r'data-k="([^"]*)"', m.group(1) or "")
        keys.append((km.group(1) if km else strip(m.group(2))).lower().strip())
    return keys

def stem_match(k, vocset):
    if k in vocset: return True
    s = re.sub(r"(ing|ed|es|s)$", "", k)
    return s in vocset or any(v.startswith(s) for v in vocset if len(s) >= 4)

def check_svg(src, svg, ids):
    p = tags_of(svg)
    bad = sorted({t for t in p.tags if t not in SVG_TAGS})
    if bad: ERR.append(f"overviews/{src}: SVG に使えない要素 {bad}")
    if not re.search(r"<svg[^>]*viewBox=", svg): ERR.append(f"overviews/{src}: svg に viewBox が無い")
    for tag, a in p.attrs:
        for k, v in a.items():
            if k == "style" or k.startswith("on"): ERR.append(f"overviews/{src}: {tag} の {k} 属性は使えない")
            if v and "url(" in v and not re.fullmatch(r"url\(#[\w-]+\)", v.strip()): ERR.append(f"overviews/{src}: 外部 url() {v}")
            if k in ("href", "xlink:href"): ERR.append(f"overviews/{src}: {tag} の {k} は使えない")
        if "data-sec" in a:
            for i in a["data-sec"].split():
                if i not in ids: ERR.append(f"overviews/{src}: data-sec={i} が toc.items に無い")
            if "ov-node" not in (a.get("class") or ""): WARN.append(f"overviews/{src}: data-sec のある {tag} に class=ov-node が無い")

ID_RE = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")

def opt(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None

def check_overviews(new_ovs):
    for src, ov in new_ovs.items():
        items = (ov.get("toc") or {}).get("items") or []
        ids = [it.get("id") for it in items]
        if len(set(ids)) != len(ids): ERR.append(f"overviews/{src}: toc.items の id が重複")
        for i in ids:
            if not re.fullmatch(r"[a-z0-9-]+", i or ""): ERR.append(f"overviews/{src}: id {i!r} は英小文字・数字・- だけにする")
        h = ov.get("header") or {}
        for k in ("title", "sub", "authors", "venue", "doi", "specs"):
            if k not in h: WARN.append(f"overviews/{src}: header.{k} が無い")
        if h.get("doi") and not str(h["doi"]).startswith("10."): ERR.append(f"overviews/{src}: doi は 10. から始まる番号だけ")
        svg = (ov.get("figure") or {}).get("svg")
        if svg: check_svg(src, svg, set(ids))

def check_units(units, texts, ovs, need, tocids):
    for uid, u in units.items():
        t = texts.get(uid)
        if t is None: ERR.append(f"{uid}: texts が無い"); continue
        ub, tb = u.get("blocks", []), t.get("blocks", [])
        if len(ub) != len(tb): ERR.append(f"{uid}: blocks の数が違う units={len(ub)} texts={len(tb)}")
        if u.get("blockCount") != len(ub): ERR.append(f"{uid}: blockCount={u.get('blockCount')} と blocks の数 {len(ub)} が違う")
        if t.get("unit") != uid: ERR.append(f"{uid}: texts.unit={t.get('unit')!r}")
        for k in need:
            if k not in u: ERR.append(f"{uid}: units.{k} が無い")
        ov = ovs.get(u.get("source"))
        ids = {it.get("id") for it in (ov.get("toc") or {}).get("items") or []} if ov else tocids.get(u.get("source"))
        if ids:
            for i in u.get("toc") or []:
                if i not in ids: ERR.append(f"{uid}: toc の {i} が overviews/{u.get('source')} の toc.items に無い")
        else:
            WARN.append(f"{uid}: overviews/{u.get('source')} が手元に無いので toc を照合していない（--toc-ids か --overviews で渡す）")
        for i, (b, x) in enumerate(zip(ub, tb)):
            w = f"{uid}#{i}"
            for k in ("en", "ja", "note"):
                if k in b: ERR.append(f"{w}: units の block に {k} が入っている（texts に入れる）")
            en = x.get("en", "")
            check_text_html(w + ".en", en); check_text_html(w + ".ja", x.get("ja", ""))
            for j, n in enumerate(x.get("note") or []): check_text_html(f"{w}.note[{j}]", n)
            plain = strip(en).lower()
            for p in b.get("phr") or []:
                if len(p) != 4: ERR.append(f"{w}: phr は [表現, 意味, 原文中の一致部分, 注意] の4つ: {p}"); continue
                hit = re.sub(r"\s+", " ", p[2]).strip().lower()
                if hit not in plain: ERR.append(f"{w}: phr の一致部分が英文に無い: {p[2]!r}")
            vocset = {str(v[0]).lower().strip() for v in b.get("voc") or []}
            for v in b.get("voc") or []:
                if len(v) != 3 or v[1] not in ("動", "名", "形", "副", "熟"): WARN.append(f"{w}: voc の形 {v}")
            for k in t_keys(en):
                if not stem_match(k, vocset): WARN.append(f"{w}: <t> の {k!r} がこの段落の voc に無い（ツールチップが出ない）")
            if re.search(r"</t>-[a-z]", en): ERR.append(f"{w}: <t>…</t>-ing のように語尾が分断されている")
            if re.search(r"""=\'""", en + x.get("ja", "")): WARN.append(f"{w}: 属性が ' のまま（build_unit.py を通したか）")

def parse_tocids():
    out = {}
    for i, a in enumerate(sys.argv):
        if a == "--toc-ids" and i + 1 < len(sys.argv):
            src, _, ids = sys.argv[i + 1].partition("=")
            out[src.strip()] = {x.strip() for x in ids.split(",") if x.strip()}
    return out

def main_content(hub):
    ip = os.path.join(hub, "content", "index.json")
    if not os.path.exists(ip): print("誤り: " + ip + " が無い"); sys.exit(1)
    idx = json.load(open(ip, encoding="utf-8"))
    for k in ("sources", "units", "overviews"):
        if k not in idx: ERR.append(f"index.json に {k} が無い")
    srcs, units, ovl = idx.get("sources") or {}, idx.get("units") or {}, idx.get("overviews") or []
    for i in list(srcs) + list(units) + list(ovl):
        if not ID_RE.match(i): ERR.append(f"index.json: ID {i!r} に使えない文字がある（ハブが無視する）")
    for sid, sd in srcs.items():
        for k in ("title", "short", "authors", "venue", "kind", "order"):
            if k not in sd: ERR.append(f"sources/{sid}: {k} が無い")
    kb = os.path.getsize(ip) / 1024
    if kb > 1500: WARN.append(f"index.json が {kb:.0f} KB。起動のたびに読むので、しまった資料の章を別のファイルに分けることを考える")
    ovs = {}
    if "--overviews" in sys.argv: ovs.update(load(opt("--overviews")))
    file_ovs = {}
    for src in ovl:
        p = os.path.join(hub, "content", "overviews", src + ".json")
        if not os.path.exists(p): ERR.append(f"index の overviews に {src} があるのに {p} が無い"); continue
        file_ovs[src] = json.load(open(p, encoding="utf-8"))
        if file_ovs[src].get("source") != src: ERR.append(f"overviews/{src}: source が {file_ovs[src].get('source')!r}")
    ovs.update(file_ovs)
    only = set((opt("--only") or "").split(",")) - {""}
    for o in only:
        if o not in units: ERR.append(f"--only の {o} が index に無い")
    texts = {}
    for uid in units:
        p = os.path.join(hub, "content", "texts", uid + ".json")
        if os.path.exists(p): texts[uid] = json.load(open(p, encoding="utf-8"))
        elif not only or uid in only: ERR.append(f"{uid}: content/texts/{uid}.json が手元に無い")
    pick = {k: v for k, v in units.items() if not only or k in only}
    check_overviews(file_ovs)
    check_units(pick, texts, ovs, ("source", "label", "order", "blockCount", "toc"), parse_tocids())
    for uid, u in pick.items():
        if u.get("source") not in srcs and not u.get("source") in parse_tocids() and u.get("source") not in ovs:
            WARN.append(f"{uid}: 資料 {u.get('source')!r} が index の sources に無い（データベースにある資料なら問題ない）")
    return {"units": len(pick), "index_units": len(units), "index_kb": round(kb, 1), "overviews": len(file_ovs)}

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    if "--content" in sys.argv:
        info = main_content(opt("--content"))
    else:
        d = sys.argv[1]
        units, texts = load(os.path.join(d, "units")), load(os.path.join(d, "texts"))
        ovs = {}
        if "--overviews" in sys.argv: ovs.update(load(opt("--overviews")))
        ovs.update(load(os.path.join(d, "overviews")))
        check_overviews(load(os.path.join(d, "overviews")))
        check_units(units, texts, ovs, ("source", "label", "reader", "url", "order", "toc"), parse_tocids())
        info = {"units": len(units), "texts": len(texts), "overviews": len(ovs)}
    for x in ERR: print("誤り:", x)
    for x in WARN: print("警告:", x)
    print(json.dumps({**info, "errors": len(ERR), "warnings": len(WARN)}, ensure_ascii=False))
    sys.exit(1 if ERR else 0)

if __name__ == "__main__":
    main()
