# overviews（論文の全体図と章構成）を作ったときのスクリプト（2026-10、第3段階）。
# 新しい論文の図を描くときの見本: node() で押せるブロック（g.ov-node + rect + text）を作り、
# 線は class="ov-line"/"ov-dash"、矢じりは marker の polygon.ov-head、注記は ov-note を使う。
# 出力: ov/iizuka2024.json, ov/sedra.json（overviews の中身）と ov/unit_toc.json（各章の toc）。
# 書き出した JSON は tools/check_hub_data.py で点検してから ArtifactData で書き込む。

import json, re
# ---------- Iizuka 2024 ----------
def node(sec, x, y, w, h, t1, t2=None, t3=None, small=False):
    cx = x + w/2
    out = [f'<g class="ov-node" data-sec="{sec}">',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="var(--surface)" stroke="var(--rule)" stroke-width="1.2"/>']
    if small:
        out.append(f'<text x="{cx:g}" y="{y+17}" text-anchor="middle" class="ov-t1">{t1}</text>')
        if t2: out.append(f'<text x="{cx:g}" y="{y+29}" text-anchor="middle" class="ov-t2">{t2}</text>')
        if t3: out.append(f'<text x="{cx:g}" y="{y+40}" text-anchor="middle" class="ov-t3">{t3}</text>')
    else:
        out.append(f'<text x="{cx:g}" y="{y+19}" text-anchor="middle" class="ov-t1">{t1}</text>')
        if t2: out.append(f'<text x="{cx:g}" y="{y+32}" text-anchor="middle" class="ov-t2">{t2}</text>')
        if t3: out.append(f'<text x="{cx:g}" y="{y+46}" text-anchor="middle" class="ov-t3">{t3}</text>')
    out.append('</g>')
    return "".join(out)
MARK = '<defs><marker id="ovah" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0, 7 2.5, 0 5" class="ov-head" fill="var(--ink-3)"/></marker></defs>'
LINE = 'stroke="var(--ink-3)" stroke-width="1.2"'
DASH = 'stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="4 3" fill="none"'
iz_svg = ''.join([
 '<svg viewBox="0 0 720 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SAR ADC の信号の流れと、各ブロックを扱う節">', MARK,
 f'<path d="M 525 58 L 525 35 L 241 35 L 241 56" class="ov-dash" {DASH} marker-end="url(#ovah)"/>',
 '<text x="383" y="29" text-anchor="middle" class="ov-note">SAR feedback loop</text>',
 '<text x="4" y="91" class="ov-var">v<tspan font-size="8" dy="2">in</tspan></text>',
 f'<line x1="28" y1="87" x2="42" y2="87" class="ov-line" {LINE} marker-end="url(#ovah)"/>',
 node("2a", 44, 60, 110, 54, "S/H", "Sampling Switch", "II-A"),
 node("3a", 186, 60, 110, 54, "CDAC", "Capacitor Array", "III-A"),
 node("2b", 328, 60, 110, 54, "Comparator", "StrongArm", "II-B"),
 node("3b 3d", 470, 60, 110, 54, "SAR Logic", "Self-Timed", "III-B / III-D"),
 *[f'<line x1="{a}" y1="87" x2="{b}" y2="87" class="ov-line" {LINE} marker-end="url(#ovah)"/>' for a, b in [(154,184),(296,326),(438,468),(580,608)]],
 '<text x="614" y="83" class="ov-mono">Digital</text><text x="614" y="96" class="ov-mono">Output</text>',
 node("2c", 44, 158, 110, 46, "Clock Gen.", "Low Jitter", "II-C", small=True),
 f'<line x1="99" y1="156" x2="99" y2="118" class="ov-dash" {DASH} marker-end="url(#ovah)"/>',
 node("3e", 186, 158, 110, 46, 'V<tspan font-size="7" dy="2">ref</tspan><tspan dy="-2"> Gen.</tspan>', "Reference", "III-E", small=True),
 f'<line x1="241" y1="156" x2="241" y2="118" class="ov-dash" {DASH} marker-end="url(#ovah)"/>',
 node("2d", 328, 158, 110, 46, "DNL / INL", "CDAC mismatch", "II-D", small=True),
 node("3c", 470, 158, 110, 46, "Common Mode", "CDAC → Comparator", "III-C", small=True),
 '</svg>'])
iz_toc = [
 ("1","I","Introduction","方程式ベース設計の動機と、本論文の位置付け"),
 ("2a","II-A","Design of the Sampling Switch and Its Clock","サンプリングスイッチの帯域幅・歪み・アパーチャの解析とFETサイジング"),
 ("2b","II-B","Regenerative Comparator: Fast and Low Noise","StrongArmコンパレータの雑音・速度トレードオフと設計指針"),
 ("2c","II-C","Low-Jitter Clock Generation","クロックジッタの解析式による論理ゲートサイジングと65 fs rmsの達成"),
 ("2d","II-D","DNL/INL Contribution to SNDR","容量ミスマッチに起因するDNL/INLがSNDRに与える影響のモデル化"),
 ("3a","III-A","Capacitor Array","試作ADCの全体構成、トッププレート・サンプリングの選択理由、単位容量のレイアウトと1ビット冗長性"),
 ("3b","III-B","Critical Path","非同期フィードバックループの遅延最適化と変換アルゴリズムの選択"),
 ("3c","III-C","Stable Common Mode","差動CDAC構成によるコモンモード安定化"),
 ("3d","III-D","Self-Timed Operation","コンパレータ完了検出と調整可能遅延によるセルフタイミング動作"),
 ("3e","III-E","Reference Voltage Generation","外部供給基準電圧とオンチップ・デカップリング"),
 ("4","IV","Measurement Results and Discussion","DNL/INL実測、スペクトル、SNDR/SFDR対周波数、雑音寄与の分析"),
 ("5","V","Conclusion","方程式ベース設計手法の総括とファースト・シリコン成果"),
]
iz = {
 "source": "iizuka2024",
 "header": {
  "title": "Systematic Equation-Based Design of a 10-Bit, 500-MS/s Single-Channel SAR A/D Converter With 2-GHz Resolution Bandwidth",
  "sub": "",
  "authors": "T. Iizuka, R. Takenaka, H. Xu, and A. A. Abidi",
  "venue": "IEEE Open Journal of the Solid-State Circuits Society, vol. 4, 2024",
  "doi": "10.1109/OJSSCS.2024.3469109",
  "specs": [["10 bit","Resolution"],["500 MS/s","Sample Rate"],["2 GHz","Bandwidth"],["28 nm","FDSOI CMOS"],["5.78 mW","Power"],["163.1 dB","FoM (S,hf)"]],
 },
 "figure": {"title": "信号の流れとセクション対応", "desc": "ブロックを押すと、下の章構成のその節に移ります。", "svg": iz_svg},
 "toc": {"title": "セクション構成", "items": [{"id": a, "num": b, "en": c, "ja": d} for a, b, c, d in iz_toc]},
}
# ---------- Sedra & Smith ----------
CH = [
 ("intro","Intro","Introduction","本書と本章の目的"),
 ("1-1","1.1","Signals","Thévenin / Norton"),
 ("1-2","1.2","Frequency Spectrum","sum of sinusoids"),
 ("1-3","1.3","Analog & Digital","sampling, ADC"),
 ("1-4","1.4","Amplifiers","gain, dB, saturation"),
 ("1-5","1.5","Circuit Models","voltage amplifier"),
 ("1-6","1.6","Frequency Response","STC response"),
]
W, H, GAP, X0, Y0 = 100, 74, 18, 4, 8
parts = ['<svg viewBox="0 0 820 90" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="第1章の節の流れ：Introduction、1.1 から 1.6">', MARK]
for i, (cid, num, ttl, sub) in enumerate(CH):
    x = X0 + i * (W + GAP)
    if i > 0:
        parts.append(f'<line x1="{x-GAP+2}" y1="{Y0+H//2}" x2="{x-3}" y2="{Y0+H//2}" class="ov-line" {LINE} marker-end="url(#ovah)"/>')
    g = [f'<g class="ov-node" data-sec="{cid}">', f'<rect x="{x}" y="{Y0}" width="{W}" height="{H}" rx="7" fill="var(--surface)" stroke="var(--rule)" stroke-width="1.2"/>',
         f'<text x="{x+10}" y="{Y0+20}" class="ov-num">{num}</text>']
    words = ttl.split(" ")
    if len(ttl) > 13 and len(words) > 1:
        g.append(f'<text x="{x+10}" y="{Y0+38}" class="ov-t1">{words[0]}</text>')
        g.append(f'<text x="{x+10}" y="{Y0+53}" class="ov-t1">{" ".join(words[1:])}</text>')
    else:
        g.append(f'<text x="{x+10}" y="{Y0+42}" class="ov-t1">{ttl}</text>')
    g.append(f'<text x="{x+10}" y="{Y0+67}" class="ov-t2">{sub}</text></g>')
    parts.append("".join(g))
parts.append('</svg>')
se_toc = [
 ("intro","—","Introduction","本書が扱う分野（マイクロエレクトロニクス）と、第1章の目的・位置づけを述べる。"),
 ("1-1","1.1","Signals","信号とトランスデューサの話から入り、信号源の2つの表し方（テブナン形式・ノートン形式）を示す。例題 1.1 を含む。"),
 ("1-2","1.2","Frequency Spectrum of Signals","信号を正弦波の和として表すという見方と、周波数スペクトル・オーディオ帯域などの用語を紹介する。"),
 ("1-3","1.3","Analog and Digital Signals","アナログ信号とディジタル信号の違い、サンプリングと量子化、A/D 変換器を紹介する。"),
 ("1-4","1.4","Amplifiers","信号増幅と線形性、電圧・電流・電力利得、デシベル表示、電源、飽和、記号の約束を扱う。"),
 ("1-5","1.5","Circuit Models for Amplifiers","内部回路によらない増幅器のモデル（電圧増幅器）と、増幅器の縦続接続を扱う。"),
 ("1-6","1.6","Frequency Response of Amplifiers","増幅器の周波数応答の測定と計算、単一時定数（STC）型の応答を扱う。"),
]
se = {
 "source": "sedra",
 "header": {"title": "Microelectronic Circuits", "sub": "Chapter 1 — Signals and Amplifiers", "authors": "Adel S. Sedra, Kenneth C. Smith", "venue": "Oxford University Press", "doi": "", "specs": []},
 "figure": {"title": "第1章の地図", "desc": "章の節の並びです。押すと、下の節構成のその節に移ります。", "svg": "".join(parts)},
 "toc": {"title": "第1章の節構成", "items": [{"id": a, "num": b, "en": c, "ja": d} for a, b, c, d in se_toc]},
}
json.dump(iz, open("ov/iizuka2024.json", "w"), ensure_ascii=False)
json.dump(se, open("ov/sedra.json", "w"), ensure_ascii=False)
TOC = {
 "iizuka2024-2d": ["2d"], "iizuka2024-3a": ["3a"], "iizuka2024-3bc": ["3b", "3c"],
 "iizuka2024-excerpt": ["1", "2a", "2b", "2c", "2d", "3a", "3b", "3c", "3d", "4", "5"],
 "sedra-ch1-1": ["intro", "1-1"], "sedra-ch1-2": ["1-2"], "sedra-ch1-3": ["1-3"],
 "sedra-ch1-4": ["1-4"], "sedra-ch1-5": ["1-4"], "sedra-ch1-6": ["1-5"],
}
json.dump(TOC, open("ov/unit_toc.json", "w"), ensure_ascii=False)
# 整合チェック：units の toc が overviews の章構成にある
for src, ov in (("iizuka2024", iz), ("sedra", se)):
    ids = {i["id"] for i in ov["toc"]["items"]}
    secs = set(" ".join(re.findall(r'data-sec="([^"]+)"', ov["figure"]["svg"])).split())
    assert secs <= ids, (src, secs - ids)
    for u, t in TOC.items():
        if u.startswith(src): assert set(t) <= ids, (u, set(t) - ids)
print("ok", len(iz["figure"]["svg"]), len(se["figure"]["svg"]))
