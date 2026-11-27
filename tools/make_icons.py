"""アプリのアイコン（hub/icons/*.png）を作る。開いた本と、しおり。
python3 tools/make_icons.py で作り直せる（Pillow が必要）。
全面を背景色で塗り、絵は中央 60% に収める（Android の丸や角丸に切り抜かれても欠けない = maskable）。"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "hub" / "icons"
BG, PAGE, LINE, MARK = (65, 71, 133), (255, 255, 255), (169, 174, 214), (217, 160, 92)
N = 1024  # 大きく描いて縮める（ふちを滑らかにする）


def draw():
    im = Image.new("RGB", (N, N), BG)
    d = ImageDraw.Draw(im)
    cx, top, bot, w = N / 2, 300, 720, 250   # 中央の綴じ目、ページの上下、片側の幅
    sag = 34                                  # ページの上下のたわみ
    for side in (-1, 1):
        outer = cx + side * w
        pts = [(cx, top + sag), (cx + side * w * 0.5, top - 6), (outer, top + 10),
               (outer, bot + 10), (cx + side * w * 0.5, bot - 16), (cx, bot + sag)]
        d.polygon(pts, fill=PAGE)
        for i in range(5):                    # 文の行
            y = top + 80 + i * 62
            x0, x1 = cx + side * 48, cx + side * (w - 48)
            if i == 4:
                x1 = cx + side * (w * 0.55)
            d.line([(min(x0, x1), y), (max(x0, x1), y)], fill=LINE, width=18)
    d.line([(cx, top + sag), (cx, bot + sag)], fill=BG, width=10)  # 綴じ目
    bx = cx + 140                                                    # しおり
    d.polygon([(bx, top - 10), (bx + 62, top - 10), (bx + 62, top + 170), (bx + 31, top + 138), (bx, top + 170)], fill=MARK)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    big = draw()
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
        big.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
