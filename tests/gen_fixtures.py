#!/usr/bin/env python3
"""テスト用の教材（fixtures）を作る。データベースの写しを会話に流さずにテストできるよう、
本物と同じ形の小さな教材を機械的に作る（2026-11、plan-token 第1段階で追加）。

使い方: python3 gen_fixtures.py
  fixtures/        データベースにある教材（sources / units / texts / overviews。user は空＝新規ユーザー）
  fixtures_files/  ファイルで届く教材（content/index.json, content/texts/, content/overviews/）。t11 が使う

資料（データベース）: papera（論文、3章）、booka（教科書、2章）
資料（ファイル）:     filesrc（新しい資料、2章と全体図）、booka の新しい章 booka-1-3、
                     papera-2b の作り直し（同じ ID。ファイルが優先されることの確認用）
"""
import json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(HERE, "fixtures")
FF = os.path.join(HERE, "fixtures_files")

# 語尾が ing/ed/es/s にならない、重ならない語を作る
CONS, VOW = "bdfgklmnprtvz", "aiou"
def word_bank():
    out = []
    for a in CONS:
        for b in VOW:
            for c in CONS:
                for d in "aio":
                    out.append(a + b + c + d)
    return out
WORDS = iter(word_bank())

# 熟語・定型文の型（表現, 意味, 原文に入れる一致部分を含む文, 一致部分）
PHR = [
    ("the effect of A on B", "AがBに与える影響", "We examine the effect of the load on the output swing.", "effect of the load on"),
    ("It is well known that ~", "〜はよく知られている", "It is well known that the noise sets a lower limit.", "It is well known that"),
    ("as shown in Figure X", "図Xに示すように", "The response is flat as shown in Figure 3 below.", "as shown in Figure 3"),
    ("A is limited by B", "AはBによって制限される", "The speed is limited by the settling of the array.", "is limited by the settling"),
    ("In other words,", "言い換えると、", "In other words, the gain stays almost constant.", "In other words,"),
    ("be sensitive to A", "Aに敏感である", "The circuit is sensitive to small changes in supply.", "is sensitive to small changes"),
    ("This suggests that ~", "このことは〜を示唆する", "This suggests that a smaller device is better.", "This suggests that"),
    ("with respect to A", "Aに関して", "We take the derivative with respect to time here.", "with respect to time"),
    ("On the other hand,", "一方で、", "On the other hand, the power grows quickly.", "On the other hand,"),
    ("A agrees well with B", "AはBとよく一致する", "The measured value agrees well with the estimate.", "agrees well with the estimate"),
    ("It follows that ~", "〜ということになる", "It follows that the error is bounded.", "It follows that"),
    ("A is given by B", "AはBで与えられる", "The time constant is given by the product of two values.", "is given by the product"),
    ("In this article, we V", "この論文では、我々はVする", "In this article, we describe a simple method.", "In this article, we describe"),
    ("be equivalent to V-ing", "Vすることと等しい", "This step is equivalent to adding one more bit.", "is equivalent to adding"),
    ("In sum,", "まとめると、", "In sum, the design meets every target.", "In sum,"),
    ("the 比較級 A, the 比較級 B", "Aが〜なほどBは〜だ", "The larger the array, the slower the response becomes.", "The larger the array, the slower"),
    ("A is characterized by B", "AはBによって特徴づけられる", "The stage is characterized by a single pole.", "is characterized by a single pole"),
    ("where A denotes B", "ここでAはBを表す", "The gain is fixed, where k denotes the ratio.", "where k denotes"),
    ("It is normally assumed that ~", "通常〜と仮定される", "It is normally assumed that the input is slow.", "It is normally assumed that"),
    ("We attribute A to B.", "AはBが原因だと考える", "We attribute the error to the mismatch of devices.", "attribute the error to"),
    ("be of primary concern", "最も重要な関心事である", "Linearity is of primary concern in this block.", "is of primary concern"),
    ("as pointed out in Section X,", "X節で指摘したように、", "As pointed out in Section 2, the swing is small.", "As pointed out in Section 2,"),
    ("A, in turn, V", "Aは今度はVする", "The bias, in turn, sets the current of the stage.", "in turn, sets"),
    ("so that ~", "〜するように", "We add a buffer so that the load is isolated.", "so that the load"),
    ("it is worth noting that ~", "〜は注目に値する", "Here it is worth noting that the area is small.", "it is worth noting that"),
    ("be due to A", "Aによるものである", "The offset is due to the finite gain of the stage.", "is due to the finite gain"),
    ("not only A but also B", "AだけでなくBも", "The method saves not only power but also area.", "not only power but also"),
    ("compared with A", "Aと比べて", "Compared with the old design, the new one is faster.", "Compared with the old design"),
    ("A results in B", "AはBという結果になる", "A larger capacitor results in lower noise.", "results in lower noise"),
    ("in terms of A", "Aの点で", "The two designs differ in terms of power.", "in terms of power"),
    ("A plays a key role in B", "AはBで重要な役割を果たす", "The clock plays a key role in the timing.", "plays a key role in"),
    ("at the expense of A", "Aを犠牲にして", "Speed is gained at the expense of power.", "at the expense of power"),
    ("it turns out that ~", "〜だとわかる", "In practice it turns out that the loss is small.", "it turns out that"),
    ("A is proportional to B", "AはBに比例する", "The noise power is proportional to the temperature.", "is proportional to the temperature"),
]
phr_iter = iter(PHR)

def block(sec, nvoc=5, with_phr=True):
    vocs = [next(WORDS) for _ in range(nvoc)]
    s1 = f"The <t data-k=\"{vocs[0]}\">{vocs[0]}</t> and the <t>{vocs[1]}</t> are described in this part of the text."
    s2 = f"Each <t>{vocs[2]}</t> is connected to a <t>{vocs[3]}</t> through a short path."
    s3 = f"A careful <t>{vocs[4]}</t> keeps the result stable over a wide range."
    sents = [s1, s2, s3]
    phr = []
    if with_phr:
        p = next(phr_iter, None)
        if p:
            sents.insert(1, p[2])
            phr.append([p[0], p[1], p[3], "前置詞に注意" if " on " in p[0] or " to " in p[0] else ""])
    en = " ".join(sents)
    unit_b = {"sec": sec, "voc": [[v, "名", f"{v} の意味（この文脈で）"] for v in vocs], "phr": phr}
    text_b = {"en": en, "ja": "これはこの段落の直訳寄りの訳です。2文目の訳。3文目の訳。",
              "note": [f"<strong>{vocs[0]}</strong> が主語で、動詞は <code>are described</code>。", "受け身の文。"]}
    return unit_b, text_b

def make_unit(uid, src, label, order, secs, toc):
    ub, tb = [], []
    for sec, n in secs:
        for _ in range(n):
            u, t = block(sec)
            ub.append(u); tb.append(t)
    unit = {"source": src, "label": label, "reader": label + " リーダー", "order": order,
            "blockCount": len(ub), "blocks": ub, "toc": toc}
    text = {"unit": uid, "blocks": tb}
    return unit, text

def overview(src, title, items, nodes):
    g = []
    x = 20
    for sec_ids, t1, t2 in nodes:
        g.append(f'<g class="ov-node" data-sec="{sec_ids}"><rect x="{x}" y="40" width="120" height="50" rx="6" fill="var(--surface)" stroke="var(--rule)"/>'
                 f'<text class="ov-t1" x="{x + 60}" y="62" text-anchor="middle">{t1}</text><text class="ov-t3" x="{x + 60}" y="78" text-anchor="middle">{t2}</text></g>')
        x += 150
    svg = f'<svg viewBox="0 0 {x + 20} 130" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon class="ov-head" points="0 0, 8 4, 0 8"/></marker></defs>{"".join(g)}<line class="ov-line" x1="140" y1="65" x2="170" y2="65" marker-end="url(#ah)"/></svg>'
    return {"source": src,
            "header": {"title": title, "sub": "", "authors": "A. Author, B. Writer", "venue": "Test Journal, vol. 1, 2024", "doi": "10.1000/test." + src,
                       "specs": [["10 bit", "Resolution"], ["500 MS/s", "Sample Rate"]]},
            "figure": {"title": "全体図", "desc": "ブロックを押すと、下の章構成のその節に移ります。", "svg": svg},
            "toc": {"title": "セクション構成", "items": [{"id": i, "num": n, "en": e, "ja": e + " の案内"} for i, n, e in items]}}

def dump(base, coll, id_, obj):
    d = os.path.join(base, coll); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, id_ + ".json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)

def main():
    for d in (FX, FF):
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(FX, "user"), exist_ok=True)
    # ---- データベースの教材 ----
    dump(FX, "sources", "papera", {"title": "A Test Paper on Sampling Circuits", "short": "Paper A", "authors": "A. Author", "venue": "Test Journal 2024", "kind": "paper", "order": 1})
    dump(FX, "sources", "booka", {"title": "A Test Textbook of Circuits", "short": "Book A", "authors": "B. Writer", "venue": "Test Press", "kind": "textbook", "order": 2})
    db_units = [
        ("papera-2a", "papera", "II-A Sampling", 1, [("A. Sampling Switch", 5), ("A. Sampling Switch · Example", 4)], ["2a"]),
        ("papera-2b", "papera", "II-B Comparator", 2, [("B. Comparator", 4)], ["2b"]),
        ("papera-3a", "papera", "III-A Array", 3, [("A. Capacitor Array", 4)], ["3a"]),
        ("booka-1-1", "booka", "1章① 1.1 Signals", 1, [("1.1 Signals", 5)], ["intro", "1-1"]),
        ("booka-1-2", "booka", "1章② 1.2 Spectrum", 2, [("1.2 Spectrum", 4)], ["1-2"]),
    ]
    for uid, src, label, order, secs, toc in db_units:
        u, t = make_unit(uid, src, label, order, secs, toc)
        dump(FX, "units", uid, u); dump(FX, "texts", uid, t)
    dump(FX, "overviews", "papera", overview("papera", "A Test Paper on Sampling Circuits",
         [("1", "I", "Introduction"), ("2a", "II-A", "Sampling Switch"), ("2b", "II-B", "Comparator"), ("3a", "III-A", "Capacitor Array"), ("3b", "III-B", "Logic")],
         [("2a", "Switch", "II-A"), ("2b", "Comparator", "II-B"), ("3a", "CDAC", "III-A"), ("3b", "Logic", "III-B")]))
    dump(FX, "overviews", "booka", overview("booka", "A Test Textbook of Circuits",
         [("intro", "", "Introduction"), ("1-1", "1.1", "Signals"), ("1-2", "1.2", "Spectrum"), ("1-3", "1.3", "Analog and Digital")],
         [("intro 1-1", "Signals", "1.1"), ("1-2", "Spectrum", "1.2"), ("1-3", "Analog/Digital", "1.3")]))
    # ---- ファイルで届く教材 ----
    idx = {"sources": {}, "units": {}, "overviews": []}
    C = os.path.join(FF, "content")
    idx["sources"]["filesrc"] = {"title": "A New Paper Delivered as Files", "short": "File Paper", "authors": "C. Filer", "venue": "File Letters 2025", "kind": "paper", "order": 3}
    file_units = [
        ("filesrc-1", "filesrc", "F-1 Introduction", 1, [("I. Introduction", 4)], ["f1"]),
        ("filesrc-2", "filesrc", "F-2 Method", 2, [("II. Method", 3)], ["f2"]),
        ("booka-1-3", "booka", "1章③ 1.3 Analog and Digital", 3, [("1.3 Analog and Digital", 3)], ["1-3"]),
        ("papera-2b", "papera", "II-B Comparator（作り直し）", 2, [("B. Comparator", 3)], ["2b"]),
    ]
    for uid, src, label, order, secs, toc in file_units:
        u, t = make_unit(uid, src, label, order, secs, toc)
        u.pop("reader", None)  # ファイルの章は reader / url を持たない
        idx["units"][uid] = u
        dump(C, "texts", uid, t)
    dump(C, "overviews", "filesrc", overview("filesrc", "A New Paper Delivered as Files",
         [("f1", "I", "Introduction"), ("f2", "II", "Method"), ("f3", "III", "Results")],
         [("f1", "Intro", "I"), ("f2", "Method", "II"), ("f3", "Results", "III")]))
    # booka の全体図もファイルで作り直す（1.3 を足した版。ファイルが優先されることの確認用）
    ovb = overview("booka", "A Test Textbook of Circuits (file)",
         [("intro", "", "Introduction"), ("1-1", "1.1", "Signals"), ("1-2", "1.2", "Spectrum"), ("1-3", "1.3", "Analog and Digital")],
         [("intro 1-1", "Signals", "1.1"), ("1-2", "Spectrum", "1.2"), ("1-3", "Analog/Digital", "1.3")])
    dump(C, "overviews", "booka", ovb)
    idx["overviews"] = ["filesrc", "booka"]
    os.makedirs(C, exist_ok=True)
    with open(os.path.join(C, "index.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False)
    print("ok", {"phrases_left": len(list(phr_iter))})

if __name__ == "__main__":
    main()
