#!/usr/bin/env python3
"""ArtifactData で保存したデータベースの写しを、テスト用の fixtures/ に並べ直す。

前もって ArtifactData の list を out_dir 付きで呼び、次のように保存しておく
（url は学習ハブ、out_dir はどこでもよい。例: <scratchpad>/snap）:
  list units / texts / overviews / sources            → <snap>/<collection>/<id>.json
  list data/users/me（任意。自分の記録を使うとき）  → <snap>/data/users/me/<id>.json

使い方: python3 prep_fixtures.py <snap> [--with-user]
  --with-user を付けないと fixtures/user は空になる（新規ユーザーとしてテストする。既定）。
"""
import json, os, shutil, sys

def unwrap(v):
    # 古い保存形式 {"data": {...}, "version": n} にも対応する
    if isinstance(v, dict) and isinstance(v.get("data"), dict) and len(v) <= 3 and not any(k in v for k in ("blocks", "header", "cards")):
        return v["data"]
    return v

def copy(src, dst):
    os.makedirs(dst, exist_ok=True)
    n = 0
    if os.path.isdir(src):
        for f in sorted(os.listdir(src)):
            if f.endswith(".json"):
                with open(os.path.join(src, f), encoding="utf-8") as fh:
                    v = unwrap(json.load(fh))
                with open(os.path.join(dst, f), "w", encoding="utf-8") as fh:
                    json.dump(v, fh, ensure_ascii=False)
                n += 1
    return n

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    snap = sys.argv[1]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
    shutil.rmtree(out, ignore_errors=True)
    counts = {c: copy(os.path.join(snap, c), os.path.join(out, c)) for c in ("units", "texts", "overviews", "sources")}
    os.makedirs(os.path.join(out, "user"), exist_ok=True)
    if "--with-user" in sys.argv:
        counts["user"] = copy(os.path.join(snap, "data", "users", "me"), os.path.join(out, "user"))
    print(json.dumps(counts))
    # units と texts の対応を確かめる
    bad = []
    for f in os.listdir(os.path.join(out, "units")):
        u = json.load(open(os.path.join(out, "units", f), encoding="utf-8"))
        tp = os.path.join(out, "texts", f)
        if not os.path.exists(tp):
            bad.append(f + ": texts が無い"); continue
        t = json.load(open(tp, encoding="utf-8"))
        if len(u.get("blocks", [])) != len(t.get("blocks", [])):
            bad.append(f + ": blocks の数が違う")
    if bad:
        print("注意:", *bad, sep="\n  ")

if __name__ == "__main__":
    main()
