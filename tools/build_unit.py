#!/usr/bin/env python3
"""学習ハブの章を、1つのデータファイルからハブのファイル（content/）に組み立てる。
（plan-token 第2段階、2026-11。生成プロンプト v7 の「6. 学習ハブへの登録」で使う）

使い方:
  python3 build_unit.py <hub> <章のデータ.txt> [--overview <全体図.json>] [--replace]
    <hub>        ハブのファイルの写しを置いたフォルダ。<hub>/content/index.json が要る
                 （read_file でハブから取った最新のもの。無ければ空から作る）
    --overview   全体図（overviews と同じ形の JSON）。content/overviews/<資料>.json に置き、index の overviews に足す
    --replace    同じ章IDが index にあっても置き換える（無いと誤りで止まる）

書き出すもの:
  <hub>/content/texts/<章ID>.json   本文（en / ja / note）
  <hub>/content/index.json          units[章ID]（sec / voc / phr）、必要なら sources・overviews を更新
  最後に、公開するファイルと sha256 を表示する（publish_files のあと list_files の sha256 と照らす）

データファイルの書き方（1行1項目。「キー: 値」。# で始まる行は注釈）:

  id: sedra-ch2-9
  source: sedra
  label: 2章⑨ 2.7 Integrators
  order: 13                  # 省略可。ファイルにその資料の章があれば、その最大＋1
  toc: 2-7, 2-8              # overviews の章構成の節ID（カンマ区切り）
  # 新しい資料のときだけ（sources に登録する）:
  source-title: 論文タイトル（原文のまま）
  source-short: Xu 2019
  source-authors: H. Xu, A. A. Abidi
  source-venue: IEEE TCAS-I, vol. 66, 2019
  source-kind: paper         # paper / textbook
  source-order: 4

  ---                        # ここから1ブロック。ブロックごとに --- を置く
  sec: 2.7 Integrators       # 省略すると前のブロックの sec を引き継ぐ
  en: 英文（HTML。<t data-k='integrate'>integrating</t> のように属性は ' でよい）
  ja: 直訳寄りの訳（HTML）
  note: 構文解説の1項目（HTML。何回でも）
  voc: integrate | 動 | 積分する          （何回でも。単語 | 品詞 | その文での意味）
  phr: the effect of A on B | AがBに与える影響 | effect of the load on | 前置詞は on
                                          （何回でも。表現 | 意味 | 原文中の一致部分 | 注意。注意は省略可）

  - 値の中に | を書くときは \\| と書く
  - 行頭に空白2つ以上を置いた行は、前の項目の続きとして（空白1つでつないで）足される
  - 属性の ' は書き出すときに " に直す
"""
import hashlib, json, os, re, sys

ID_RE = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")
HEAD_KEYS = {"id", "source", "label", "order", "toc", "source-title", "source-short", "source-authors",
             "source-venue", "source-kind", "source-order"}
BLOCK_KEYS = {"sec", "en", "ja", "note", "voc", "phr"}
POS = {"動", "名", "形", "副", "熟"}


def die(msg):
    print("誤り:", msg)
    sys.exit(1)


def split_bar(v):
    return [x.replace("\x00", "|").strip() for x in v.replace("\\|", "\x00").split("|")]


def fix_attrs(h):
    # 属性の '…' を "…" に直し（中に " を含むものは触らない）、\| を | に戻す
    return re.sub(r"(\s[\w:-]+)='([^'\"]*)'", r'\1="\2"', h).replace("\\|", "|")


def parse(path):
    head, blocks, cur = {}, [], None
    last = None  # (dict, key) — 続きの行を足す先
    for n, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.strip() == "---":
            cur = {"note": [], "voc": [], "phr": []}
            blocks.append(cur)
            last = None
            continue
        if re.match(r"^\s{2,}\S", line) and last:
            d, k = last
            if isinstance(d[k], list):
                d[k][-1] = d[k][-1] + " " + line.strip()
            else:
                d[k] = d[k] + " " + line.strip()
            continue
        m = re.match(r"^([a-z-]+):\s?(.*)$", line)
        if not m:
            die(f"{path}:{n}: 「キー: 値」の形になっていない: {line[:60]!r}")
        k, v = m.group(1), m.group(2).strip()
        if cur is None:
            if k not in HEAD_KEYS:
                die(f"{path}:{n}: 先頭で使えないキー {k!r}（ブロックの前に --- が要る？）")
            head[k] = v
            last = (head, k)
        else:
            if k not in BLOCK_KEYS:
                die(f"{path}:{n}: ブロックで使えないキー {k!r}")
            if k in ("note", "voc", "phr"):
                cur[k].append(v)
            else:
                if k in cur:
                    die(f"{path}:{n}: {k} がこのブロックに2回ある（--- を忘れた？）")
                cur[k] = v
            last = (cur, k)
    return head, blocks


def main():
    args = [a for a in sys.argv[1:]]
    if len(args) < 2:
        print(__doc__)
        sys.exit(2)
    replace = "--replace" in args
    ov_path = None
    if "--overview" in args:
        ov_path = args[args.index("--overview") + 1]
    hub, data = args[0], args[1]
    head, raw_blocks = parse(data)

    uid, src = head.get("id", ""), head.get("source", "")
    for k in ("id", "source", "label", "toc"):
        if not head.get(k):
            die(f"先頭に {k}: が無い")
    if not ID_RE.match(uid) or not ID_RE.match(src):
        die(f"id / source に使えない文字がある: {uid!r} {src!r}")
    if not raw_blocks:
        die("ブロックが1つも無い（--- で始める）")

    idx_path = os.path.join(hub, "content", "index.json")
    if os.path.exists(idx_path):
        idx = json.load(open(idx_path, encoding="utf-8"))
    else:
        print("注意: content/index.json が無いので空から作る")
        idx = {}
    idx.setdefault("sources", {})
    idx.setdefault("units", {})
    idx.setdefault("overviews", [])
    if uid in idx["units"] and not replace:
        die(f"{uid} は既に index にある。作り直すなら --replace を付ける")

    # order
    if head.get("order"):
        try:
            order = int(head["order"])
        except ValueError:
            die(f"order が数でない: {head['order']!r}")
    else:
        same = [u.get("order", 0) for i, u in idx["units"].items() if u.get("source") == src and i != uid]
        if not same:
            die(f"order: が無く、ファイルに {src} の章も無い。データベースの最後の章の order＋1 を書く")
        order = max(same) + 1

    ublocks, tblocks, sec = [], [], ""
    nvoc = nphr = 0
    for i, b in enumerate(raw_blocks):
        w = f"ブロック{i + 1}"
        sec = b.get("sec", sec).replace("\\|", "|")
        if not sec:
            die(f"{w}: sec が無い（最初のブロックには必ず書く）")
        for k in ("en", "ja"):
            if not b.get(k):
                die(f"{w}: {k} が無い")
        voc = []
        for v in b["voc"]:
            p = split_bar(v)
            if len(p) != 3:
                die(f"{w}: voc は「単語 | 品詞 | 意味」の3つ: {v!r}")
            if p[1] not in POS:
                die(f"{w}: voc の品詞 {p[1]!r} は 動/名/形/副/熟 のどれか")
            voc.append(p)
        phr = []
        for v in b["phr"]:
            p = split_bar(v)
            if len(p) == 3:
                p.append("")
            if len(p) != 4:
                die(f"{w}: phr は「表現 | 意味 | 原文中の一致部分 | 注意」: {v!r}")
            phr.append(p)
        nvoc += len(voc)
        nphr += len(phr)
        ublocks.append({"sec": sec, "voc": voc, "phr": phr})
        tblocks.append({"en": fix_attrs(b["en"]), "ja": fix_attrs(b["ja"]), "note": [fix_attrs(x) for x in b["note"]]})

    unit = {"source": src, "label": head["label"], "order": order, "blockCount": len(ublocks),
            "blocks": ublocks, "toc": [x.strip() for x in head["toc"].split(",") if x.strip()]}
    text = {"unit": uid, "blocks": tblocks}

    # 新しい資料
    if head.get("source-title"):
        sd = {"title": head["source-title"], "short": head.get("source-short", ""), "authors": head.get("source-authors", ""),
              "venue": head.get("source-venue", ""), "kind": head.get("source-kind", "paper")}
        if sd["kind"] not in ("paper", "textbook"):
            die("source-kind は paper か textbook")
        try:
            sd["order"] = int(head.get("source-order", ""))
        except ValueError:
            die("新しい資料には source-order: に数を書く（既存の資料の最大＋1）")
        idx["sources"][src] = sd

    out = []
    os.makedirs(os.path.join(hub, "content", "texts"), exist_ok=True)
    tp = os.path.join("content", "texts", uid + ".json")
    with open(os.path.join(hub, tp), "w", encoding="utf-8") as f:
        json.dump(text, f, ensure_ascii=False)
    out.append(tp)

    if ov_path:
        ov = json.load(open(ov_path, encoding="utf-8"))
        if ov.get("source") != src:
            die(f"全体図の source が {ov.get('source')!r}（{src} のはず）")
        os.makedirs(os.path.join(hub, "content", "overviews"), exist_ok=True)
        op = os.path.join("content", "overviews", src + ".json")
        with open(os.path.join(hub, op), "w", encoding="utf-8") as f:
            json.dump(ov, f, ensure_ascii=False)
        if src not in idx["overviews"]:
            idx["overviews"].append(src)
        out.append(op)

    idx["units"][uid] = unit
    os.makedirs(os.path.dirname(idx_path), exist_ok=True)
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    out.append(os.path.join("content", "index.json"))

    print(json.dumps({"unit": uid, "blocks": len(ublocks), "voc": nvoc, "phr": nphr, "order": order,
                      "index_units": len(idx["units"]), "index_kb": round(os.path.getsize(idx_path) / 1024, 1)},
                     ensure_ascii=False))
    print("公開するファイル（publish_files の as / path と、照合用の sha256）:")
    for p in out:
        full = os.path.abspath(os.path.join(hub, p))
        h = hashlib.sha256(open(full, "rb").read()).hexdigest()
        print(f"  {p}  {full}  {h}")


if __name__ == "__main__":
    main()
