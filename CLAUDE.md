# CLAUDE.md — 論文リーダー学習ハブ（スマホ用 PWA 版）

このリポジトリは、claude.ai の Artifact として動いている「論文リーダー学習ハブ」を、
**GitHub Pages で配る、スマホ向けの PWA** に作り替えるためのもの。
最初に `docs/PLAN.md`（計画と段階）を読み、今どの段階かを確かめてから作業すること。

## ユーザーについて・進め方

- ユーザーは電気電子工学の学部4年生（まいとな）。英語論文を英語のまま読めるようになるための道具として、このハブを毎日使っている。
- 会話は**日本語**。説明はやさしく、短く。
- コードは**ほとんど Claude が書いてよい**とユーザーが決めた。ただし Web 開発の勉強とポートフォリオも目的なので、
  各段階の終わりに「何を作ったか・どういうしくみか」を数行で説明する（専門用語には一言の説明を添える）。
- ユーザーの希望: **段階に分けて、少しずつ正確に**。仕様が決まっていない所は作る前に相談する。
  見た目の案は、実際に動く試作を見せてから決めてもらうと早い。
- スマホでの見え方は Claude には確かめられない。各段階の終わりに GitHub Pages の公開版をスマホで開いてもらい、感想をもらう。

## ユーザーが決めた仕様（変えるときは必ず相談）

| 項目 | 決定 |
|---|---|
| 使う端末 | 主にスマホ（PWA としてホーム画面に追加）。パソコンのブラウザでも使える |
| 保存 | **端末の中だけ**（IndexedDB）。サーバー・ログイン・端末間の同期は無し |
| 教材 | **アプリには入れない**。ユーザーが自分の Claude で作った「章のデータファイル」を、アプリの「教材を追加」で取り込む |
| 書くタブの添削 | API は使わない。「依頼文をコピー → 自分の Claude に貼る → 返事を貼り戻す」形にする |
| 公開 | public リポジトリ ＋ GitHub Pages。ポートフォリオとして見せられる README を用意する |
| 他の人 | 誰でも使える汎用の道具にする（生成プロンプトも公開する） |

## 絶対に守ること

- **教材（論文・教科書の原文や訳）をリポジトリに入れない**。原文は著作物。`content/`、章のデータファイル（`*.txt` の章ファイル）、
  バックアップ（`*.hubbackup.json` など）は `.gitignore` 済み。画面例やデモ用の見本は、自作の英文か、
  再利用が許されたライセンス（CC BY など、ライセンスを確かめて表記する）の文だけにする。テスト用の教材は `tests/gen_fixtures.py` が作る無意味な語なので問題ない。
- ユーザーの学習記録（復習カードなど）を消す・壊す変更をしない。保存の形を変えるときは、古い形からの移し替えを必ず用意する。
- 読んだ記録は凍結されたものとして扱う（直接書き換えず `{...元, 変える所}` の写しを作る）。理由は `docs/hub-README.md` の「守ること」。
- 本文の HTML は必ず `sanitize()`、図は `sanitizeSvg()` を通す。取り込むファイルも外から来たものとして扱う。
- API キーや秘密の値をコードに書かない（そもそも使わない設計）。

## リポジトリの中身（段階1の時点）

| 場所 | 中身 |
|---|---|
| `hub/index.html` | 現在の claude.ai 版ハブそのもの（Version 14、約 3,365 行。骨組み → CSS → HTML → 1つの IIFE）。ここから作り替える。段階1で `<script src="local-db.js">` を1行足した |
| `hub/local-db.js` | 段階1: `window.claude.use("db" \| "user" \| "sample")` と同じ使い方の部品を IndexedDB で作ったもの。本物の `window.claude` があるとき（claude.ai の中）は何もしない。`user.id()` は `"me"`、`sample` は段階3まで `null` |
| `.github/workflows/pages.yml` | push / PR でテスト、main なら `hub/` を GitHub Pages に公開 |
| `tests/` | jsdom の自動テスト 22 本（`run_all.sh`。t12/t13 が端末保存の部品）。`harness.js` の `makeDb` が `window.claude.use("db")` の偽物で、**端末保存の部品を作るときの手本になる** |
| `tools/` | claude.ai 側で章を組み立てる Python（`build_unit.py`）と点検（`check_hub_data.py`）、全体図の見本（`ov_build_example.py`）。段階2で JavaScript に移す |
| `docs/hub-README.md` | 現在のハブの引き継ぎ資料（機能・データの形・コードの地図・守ること）。**4〜6節は必読** |
| `docs/prompt-v7.md` | 現在の生成プロンプト（教材の作り方。章のデータファイルの書式は 5節） |
| `docs/PLAN.md` | 作り替えの計画と段階 |

## テストの動かし方

```sh
cd tests
npm ci                                       # jsdom と fake-indexeddb
python3 gen_fixtures.py
HUB=$PWD/../hub/index.html sh run_all.sh    # 22本すべて OK（約70〜90秒）
```

2026-11-27 時点で、段階1の `hub/index.html` で 22 本すべて OK を確認済み（`HUB` を省くと `../hub/index.html` を使う）。
`HUB` は絶対パスで渡す。機能を足したら、そのテストも足す（直す前の版で失敗することも確かめる）。

## 現在のハブが claude.ai に頼っている所（置き換える対象）

`boot()`（`hub/index.html` の末尾近く）で `window.claude.use("db" | "user" | "sample")` を呼んでいる。

- **db**: `collection` / `doc` / `where` / `get` / `onSnapshot` / `set` / `update` / `delete` を使う。
  コレクションは `sources` `units` `texts` `overviews`（教材）と `data/users/<uid>/`（記録: `meta` `srs-0..7` `time-YYYY-MM` `log-YYYY-MM` `sum-YYYY-MM` `fixes` `progress` `archive`）。
  形は `docs/hub-README.md` の 5節。
- **user**: `id()` だけ。端末版では固定の ID でよい。
- **sample**: 書くタブの添削（`json(prompt)`）。段階3でコピー＆貼り付けに置き換える。
- `fetch("content/…")`: ファイルで届く教材。端末版では使わない（無ければデータベースだけで動くことは `t11 nofile` で確認済み）。

方針: **`window.claude.use` と同じ使い方の部品を IndexedDB で作って差し込み、ハブ本体の変更を最小にする**（段階1）。
取り込んだ教材も同じ `units` / `texts` / `sources` / `overviews` に入れれば、読む・復習などの画面はそのまま動く。
