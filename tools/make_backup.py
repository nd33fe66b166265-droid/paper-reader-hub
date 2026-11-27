#!/usr/bin/env python3
"""claude.ai のハブの中身から、アプリ（PWA 版）で読み込めるバックアップを作る（段階6: 移行）。

claude.ai のハブの教材と記録は2か所にある:
  1. ハブのデータベース … ArtifactData の list に out_dir を付けて写すと、次の形でフォルダに並ぶ
       <db>/sources/<id>.json  <db>/units/<id>.json  <db>/texts/<id>.json  <db>/overviews/<id>.json
       <db>/data/users/<利用者ID>/<id>.json   （meta・srs-0〜7・time-・log-・sum-・fixes・progress・archive）
  2. ハブの Artifact に同梱したファイル（Version 14 から。新しい章はこちら）
       <content>/index.json  <content>/texts/<章>.json  <content>/overviews/<資料>.json
     （Artifact の read に paths と out_dir を付けて取り出す。<content> は content/ フォルダ。
       content/ の1つ上のフォルダを渡してもよい）

同じ ID が両方にあれば、ハブと同じくファイルの方を使う（mergeSources / mergedUnits と同じ決まり）。
出力は docs/backup-format.md の形（アプリの「保存」→「バックアップから戻す」で読み込める）。

使い方:
  python3 make_backup.py --db <写したフォルダ> [--content <content フォルダ>] [-o 出力.hubbackup.json]

誤り（読めない JSON、使えない ID、2人分の記録など）があればファイルを作らず、理由を出して 1 で終わる。
注意（本文の無い章、段落の数が合わない章など）は出すが、ファイルは作る。
出力のファイルには教材の原文と学習記録が入る。リポジトリに入れないこと（.gitignore 済み）。
"""
import argparse
import datetime
import json
import os
import re
import sys

FORMAT, VERSION = "paper-reader-hub-backup", 1
TEXT_COLS = ("sources", "overviews", "units", "texts")  # 書き出す順（アプリの書き出しと同じく教材 → 記録）
ID_RE = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")  # ハブの okId と同じ
MAX_DOC = 256 * 1024  # claude.ai のデータベースの1ドキュメントの上限（目安として注意だけ出す）


class Problems:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, m):
        self.errors.append(m)

    def warn(self, m):
        self.warnings.append(m)


def read_json(path, P):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        P.err(f"{path}: JSON として読めません（{e}）")
        return None


def bad_key(v, depth=0):
    """__proto__ という項目名はアプリが断るので、ここでも先に見つける"""
    if depth > 64:
        return True
    if isinstance(v, list):
        return any(bad_key(x, depth + 1) for x in v)
    if isinstance(v, dict):
        return any(k == "__proto__" or bad_key(x, depth + 1) for k, x in v.items())
    return False


def read_dir(d, P, where):
    """<d>/<id>.json を {id: data} にする"""
    out = {}
    if not os.path.isdir(d):
        return out
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        if not name.endswith(".json") or not os.path.isfile(p):
            continue
        did = name[:-5]
        data = read_json(p, P)
        if data is None:
            continue
        if not isinstance(data, dict):
            P.err(f"{where}/{name}: 中身がオブジェクト（{{…}}）ではありません")
            continue
        out[did] = data
    return out


def load_db(db, P):
    docs = {c: read_dir(os.path.join(db, c), P, c) for c in TEXT_COLS}
    users_dir = os.path.join(db, "data", "users")
    uids = sorted(n for n in os.listdir(users_dir) if os.path.isdir(os.path.join(users_dir, n))) if os.path.isdir(users_dir) else []
    if len(uids) > 1:
        P.err(f"data/users に {len(uids)} 人分の記録があります（{', '.join(uids)}）。移すのは1人分だけです。ほかのフォルダを消してから、もう一度動かしてください")
    user = read_dir(os.path.join(users_dir, uids[0]), P, f"data/users/{uids[0]}") if len(uids) == 1 else {}
    return docs, user


def find_content(content):
    """content/ そのものでも、その1つ上でもよい"""
    if os.path.isfile(os.path.join(content, "index.json")):
        return content
    sub = os.path.join(content, "content")
    if os.path.isfile(os.path.join(sub, "index.json")):
        return sub
    return None


def load_content(content, docs, P):
    """同梱ファイルの教材を docs に重ねる（同じ ID はファイルを優先）。重ねた数を返す"""
    root = find_content(content)
    if root is None:
        P.err(f"{content}: index.json が見つかりません（content/ フォルダか、その1つ上を渡してください）")
        return {}
    idx = read_json(os.path.join(root, "index.json"), P)
    if not isinstance(idx, dict):
        if idx is not None:
            P.err("index.json の中身がオブジェクトではありません")
        return {}
    n = {"sources": 0, "units": 0, "texts": 0, "overviews": 0}
    srcs = idx.get("sources") if isinstance(idx.get("sources"), dict) else {}
    for sid, s in srcs.items():
        if isinstance(s, dict):
            docs["sources"][sid] = s
            n["sources"] += 1
    units = idx.get("units") if isinstance(idx.get("units"), dict) else {}
    for uid, u in units.items():
        if not isinstance(u, dict) or not isinstance(u.get("blocks"), list):
            P.warn(f"index.json の章 {uid} に blocks がないので移しません（ハブでも表示されていない章です）")
            continue
        docs["units"][uid] = u
        n["units"] += 1
        t = os.path.join(root, "texts", uid + ".json")
        if os.path.isfile(t):
            data = read_json(t, P)
            if isinstance(data, dict):
                docs["texts"][uid] = data
                n["texts"] += 1
        elif uid in docs["texts"]:
            P.warn(f"ファイルの章 {uid} の本文ファイルが無いので、データベースの本文を使います")
    ovs = idx.get("overviews") if isinstance(idx.get("overviews"), list) else []
    for sid in ovs:
        if not isinstance(sid, str):
            continue
        p = os.path.join(root, "overviews", sid + ".json")
        if os.path.isfile(p):
            data = read_json(p, P)
            if isinstance(data, dict):
                docs["overviews"][sid] = data
                n["overviews"] += 1
        else:
            P.warn(f"index.json に全体図 {sid} の名前がありますが、ファイル overviews/{sid}.json がありません")
    return n


def check(docs, user, P):
    for col in TEXT_COLS:
        for did in docs[col]:
            if not ID_RE.match(did):
                P.err(f"{col}/{did}: ID に使えない文字があります（英数字と - _ . だけ）")
    for did in user:
        if not ID_RE.match(did):
            P.err(f"記録 {did}: ID に使えない文字があります")
    for col in TEXT_COLS:
        for did, d in docs[col].items():
            if bad_key(d):
                P.err(f"{col}/{did}: 使えない項目名（__proto__）があります")
            size = len(json.dumps(d, ensure_ascii=False).encode("utf-8"))
            if size > MAX_DOC:
                P.warn(f"{col}/{did} が {size // 1024} KiB あります（大きすぎないか確かめてください）")
    for did, d in user.items():
        if bad_key(d):
            P.err(f"記録 {did}: 使えない項目名（__proto__）があります")
    # 章と本文の組（ずれると復習で別の文が出る）
    for uid, u in docs["units"].items():
        blocks = u.get("blocks")
        if not isinstance(blocks, list):
            P.warn(f"章 {uid} に blocks がありません（ハブでも表示されない章です）")
            continue
        legacy = any(isinstance(b, dict) and isinstance(b.get("en"), str) for b in blocks)
        t = docs["texts"].get(uid)
        if t is None:
            if not legacy:
                P.warn(f"章 {uid} の本文（texts）がありません。読む画面で「見つからない」になります")
            continue
        tb = t.get("blocks")
        if not isinstance(tb, list) or len(tb) != len(blocks):
            P.warn(f"章 {uid}: 目次の段落 {len(blocks)} と本文の段落 {len(tb) if isinstance(tb, list) else '?'} の数が違います")
        src = u.get("source")
        if src not in docs["sources"]:
            P.warn(f"章 {uid} の資料 {src} が sources にありません")
    for tid in docs["texts"]:
        if tid not in docs["units"]:
            P.warn(f"本文 {tid} に対応する章（units）がありません（使われません）")
    if not user:
        P.warn("学習の記録（data/users/…）がありません。教材だけを移します")
    elif "meta" not in user:
        P.warn("記録に meta（設定と今日の数）がありません")


def summarize(docs, user):
    cards = sum(len(d.get("cards") or {}) for k, d in user.items() if k.startswith("srs-") and isinstance(d.get("cards"), dict))
    fixes = len((user.get("fixes") or {}).get("cards") or {})
    days = set()
    for k, d in user.items():
        if k.startswith("time-") and isinstance(d.get("days"), dict):
            days.update(d["days"].keys())
    sums = sum(len(d.get("items") or {}) for k, d in user.items() if k.startswith("sum-") and isinstance(d.get("items"), dict))
    logs = sum(1 for k, d in user.items() if k.startswith("log-") and isinstance(d.get("entries"), dict) for e in d["entries"].values() if isinstance(e, dict) and not e.get("del"))
    return {"資料": len(docs["sources"]), "章": len(docs["units"]), "全体図": len(docs["overviews"]),
            "復習カード": cards, "添削カード": fixes, "要約": sums, "手入力の記録": logs, "学習した日": len(days)}


def build(db, content=None, now=None):
    """→ (バックアップの dict か None, Problems, 数え上げ, ファイルから重ねた数)"""
    P = Problems()
    if not os.path.isdir(db):
        P.err(f"{db}: フォルダがありません")
        return None, P, {}, {}
    docs, user = load_db(db, P)
    over = load_content(content, docs, P) if content else {}
    check(docs, user, P)
    if P.errors:
        return None, P, {}, over
    rows = []
    for col in TEXT_COLS:
        for did in sorted(docs[col]):
            rows.append({"col": col, "id": did, "data": docs[col][did]})
    for did in sorted(user):
        rows.append({"col": "data/users/me", "id": did, "data": user[did]})
    if not rows:
        P.err("移すものがありません（フォルダの場所を確かめてください）")
        return None, P, {}, over
    now = now or datetime.datetime.now(datetime.timezone.utc)
    bk = {"format": FORMAT, "version": VERSION, "app": "claude.ai から移行",
          "exportedAt": now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z", "docs": rows}
    return bk, P, summarize(docs, user), over


def main(argv=None):
    ap = argparse.ArgumentParser(description="claude.ai のハブの写しから、アプリで読み込めるバックアップを作る")
    ap.add_argument("--db", required=True, help="ArtifactData の list（out_dir 付き）で写したフォルダ")
    ap.add_argument("--content", help="ハブの Artifact から取り出した content/ フォルダ（無ければデータベースの分だけ）")
    ap.add_argument("-o", "--out", help="出力ファイル（既定: paper-reader-hub-<今日>-from-claude.hubbackup.json）")
    a = ap.parse_args(argv)
    bk, P, counts, over = build(a.db, a.content)
    for w in P.warnings:
        print("注意: " + w)
    if P.errors:
        for e in P.errors:
            print("誤り: " + e)
        print("バックアップは作りませんでした。")
        return 1
    out = a.out or f"paper-reader-hub-{datetime.date.today().isoformat()}-from-claude.hubbackup.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bk, f, ensure_ascii=False, separators=(",", ":"))
    print(f"作りました: {out}（{os.path.getsize(out) // 1024} KiB）")
    print("中身: " + "、".join(f"{k} {v}" for k, v in counts.items()))
    if over:
        print("同梱ファイルから: " + "、".join(f"{k} {v}" for k, v in over.items() if v))
    return 0


if __name__ == "__main__":
    sys.exit(main())
