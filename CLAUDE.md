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

## リポジトリの中身（段階6の時点）

| 場所 | 中身 |
|---|---|
| `hub/index.html` | 現在の claude.ai 版ハブそのもの（Version 14、約 3,365 行。骨組み → CSS → HTML → 1つの IIFE）。ここから作り替える。段階1で `<script src="local-db.js">` を1行足した。段階2で `import.js` の読み込みと「教材」ダイアログ（`/* ==== Import` の節）を足した。段階3で `relay.js` の読み込みと、書くタブの「自分の Claude との往復」（`startRelay` / `renderRelay` / `readRelay`、待っている依頼は localStorage の `hub-wr-pending`。頼む先は Claude・Gemini・ChatGPT から選べ、`hub-wr-ai` に覚える）を足した。段階4で manifest・アイコンの `<link>`、`pwa.js` の読み込み、ヘッダーの「保存」ボタンと「保存とバックアップ」ダイアログ（`/* ==== App` の節）、今日の画面の知らせ（`#appNote`）を足した。段階5で `merge.js` の読み込みと、読み込むときの「合わせる／置き換える」の選択（`renderApResult`・`apApply(mode)`）を足した |
| `hub/local-db.js` | 段階1: `window.claude.use("db" \| "user" \| "sample")` と同じ使い方の部品を IndexedDB で作ったもの。本物の `window.claude` があるとき（claude.ai の中）は何もしない。`user.id()` は `"me"`、`sample` は `null`（端末版の添削は `relay.js` の往復を使う） |
| `hub/import.js` | 段階2: 章のデータファイル（.txt）と全体図（.json）の組み立て・点検（`tools/build_unit.py` と `check_hub_data.py` を JS に移したもの。出力は Python 版と同じであることを t14 が確かめる）。画面はハブの「教材」ダイアログ（`IM`、`imCheck` / `imApply` / `renderImList`。端末保存のときだけ出す） |
| `hub/relay.js` | 段階3: 書くタブの添削で、自分の Claude から貼り戻された返事を読み取る（`HubRelay.parseReply(text, "fix"\|"ja")`。コードブロック・前後の文を許し、崩れた返事はやさしい説明を返す）。t15 が確かめる |
| `hub/pwa.js` | 段階4: Service Worker の登録と新しい版の知らせ、ホーム画面に追加できるか、`storage.persist()`、バックアップの作成と点検（`HubPWA.parseBackup`）。画面はハブの「保存」ダイアログ（`/* ==== App` の節。`apExport` / `apCheck` / `apApply`、今日の画面の知らせ `renderAppNote`） |
| `hub/merge.js` | 段階5: バックアップを読み込むときに、今の端末の中身と「合わせる」（`HubMerge.merge(cur, inc)`。カードは新しい方、学習時間は端末ごと、復習しなかった日のずらし過ぎを戻す）。画面は「保存」ダイアログの「合わせる」（`apApply("merge")`）。決まりは `docs/backup-format.md`。t18 が確かめる |
| `hub/sw.js` | 段階4: Service Worker。アプリのファイルは**まずネット**（`cache: "no-cache"`、4秒で写しへ）、通信できないときだけ写しを返す。公開のたびに `__BUILD__` が置き換わり、古い版の写しを消す。**写すファイルを足したら `CORE` に足す**（t16 が確かめる） |
| `hub/manifest.webmanifest`・`hub/icons/` | 段階4: ホーム画面のアプリの名前とアイコン（`tools/make_icons.py` で作る） |
| `hub/samples/` | 「見本で試す」の章ファイルと全体図。**自作の英文**（論文の引用ではない） |
| `.github/workflows/pages.yml` | push / PR でテスト、main なら `hub/` を GitHub Pages に公開 |
| `tests/` | jsdom の自動テスト 28 本（`run_all.sh`。t12/t13 が端末保存の部品、t14 が教材の取り込み、t15 が書くタブの往復、t16 が PWA の部品と sw.js、t17 がバックアップの画面、t18 が2台の記録を合わせる、t19 が claude.ai からの移行）。`harness.js` の `makeDb` が `window.claude.use("db")` の偽物で、**端末保存の部品を作るときの手本になる** |
| `tools/` | claude.ai 側で章を組み立てる Python（`build_unit.py`）と点検（`check_hub_data.py`）、全体図の見本（`ov_build_example.py`）。段階2で `hub/import.js` に移した（Python 版は比較用に残す）。段階6の `make_backup.py` は claude.ai のハブの写し（データベース＋同梱ファイル）からバックアップを作る（手順は `docs/migrate.md`、t19 が確かめる） |
| `docs/hub-README.md` | 現在のハブの引き継ぎ資料（機能・データの形・コードの地図・守ること）。**4〜6節は必読** |
| `docs/prompt-v7.md` | 現在の生成プロンプト（教材の作り方。章のデータファイルの書式は 5節） |
| `docs/PLAN.md` | 作り替えの計画と段階 |
| `docs/backup-format.md` | 段階4: バックアップのファイルの形（段階6の移行でも使う）。段階5の「合わせる」の決まり |
| `docs/migrate.md` | 段階6: claude.ai のハブから教材と記録を移す手順と切り替え日の考え方 |

## テストの動かし方

```sh
cd tests
npm ci                                       # jsdom と fake-indexeddb
python3 gen_fixtures.py
HUB=$PWD/../hub/index.html sh run_all.sh    # 28本すべて OK（約90〜120秒）
```

2026-11-28 時点で、段階6の `hub/index.html` で 28 本すべて OK を確認済み（`HUB` を省くと `../hub/index.html` を使う）。
`HUB` は絶対パスで渡す。機能を足したら、そのテストも足す（直す前の版で失敗することも確かめる）。

## 現在のハブが claude.ai に頼っている所（置き換える対象）

`boot()`（`hub/index.html` の末尾近く）で `window.claude.use("db" | "user" | "sample")` を呼んでいる。

- **db**: `collection` / `doc` / `where` / `get` / `onSnapshot` / `set` / `update` / `delete` を使う。
  コレクションは `sources` `units` `texts` `overviews`（教材）と `data/users/<uid>/`（記録: `meta` `srs-0..7` `time-YYYY-MM` `log-YYYY-MM` `sum-YYYY-MM` `fixes` `progress` `archive`）。
  形は `docs/hub-README.md` の 5節。
- **user**: `id()` だけ。端末版では固定の ID でよい。
- **sample**: 書くタブの添削（`json(prompt)`）。端末版では使わず、段階3の「依頼文をコピー → 返事を貼り戻す」（`relay.js`）に置き換えた。claude.ai の中では今までどおり `sample` を使う。
- `fetch("content/…")`: ファイルで届く教材。端末版では使わない（無ければデータベースだけで動くことは `t11 nofile` で確認済み）。

方針: **`window.claude.use` と同じ使い方の部品を IndexedDB で作って差し込み、ハブ本体の変更を最小にする**（段階1）。
取り込んだ教材も同じ `units` / `texts` / `sources` / `overviews` に入れれば、読む・復習などの画面はそのまま動く。
