# トークン削減の計画（2026-11-17 決定）

## 原因（2026-11-12 の Sedra 2章⑤〜⑧ の作業記録より）

- ハブへの書き込みが ArtifactData（`file_path` で渡せた）から MCP の `db_write`（中身を引数に直接書くしかない）に変わった。そのため1章ごとに、本文を「データファイルに書く（出力）→ JSON を cat で表示（入力）→ db_write に全文を書き直す（出力）→ db_get で全文を読み戻す（入力）」と、2回書いて2回読んでいる。これが増えた分のほとんど。
- 1つの会話で4章続けて作るので、上の全文が会話にたまり、ツールを呼ぶたびに読み直される。
- 毎回の準備：前回のリーダーの HTML を読んでビルドスクリプトを書き直す、`check_hub_data.py` を project_read してから Write で書き出す、ページ画像を約10枚読む、スクリーンショットを2〜3枚読む。
- 生成プロンプト v6 は ArtifactData を前提にしていて、今のツールと合っていない。

## ユーザーが選んだ方針

- 新しい章は、データベースではなく**ハブの Artifact のファイル**として届ける（`publish_files` はディスクから直接送るので、本文が Claude の出力に乗らない）。既存の章はデータベースのまま残し、ハブが両方を読む。
- **章ごとのリーダーページは今後作らない**（ハブの「読む」画面で読んでいる）。ハブに登録するだけにする。
- 段階に分けて、1つずつ確かめながら進める。

## 第1段階：ハブがファイルの章を読めるようにする — 済み（2026-11-17、ハブ Version 14）

結果:
- 確かめること1・2はどちらも OK（試験用 Artifact「ハブ試験 fetch」 slug `1e9ac00f-ceee-4179-a46c-8ad8a7fbc4be` で、ユーザーの実機で3項目とも OK）。本番のハブも `publish_files` で公開し、宣言・contract 0.2.67 がそのまま残ることを確認した。
- index.json には案の2つに加えて `"overviews": [資料ID]`（ファイルで持つ全体図の資料）を入れる形にした。詳しくは README の 5.。
- いまのハブには空の `content/index.json` が入っている。
- テストは `gen_fixtures.py` の小さな教材で動くようにした（データベースの写しが要らない）。t11 を足して19本。

第2段階に向けて分かったこと:
- プロジェクトの資料は作業環境の `/mnt/project/claude_hub_…` にある。`check_hub_data.py` などは project_read せずコピーする。
- 公開の確認は `list_files` の sha256 と手元の `sha256sum` の比較で足りた（全文を読み戻さない）。
- ハブの HTML を直すときは `read_file` の `paths` でディスクに取り出せる（会話に流れない）。
- 新しい章を足すだけなら index.html は送らず、`content/` のファイルだけを `publish_files`（patch）で送る。index.json は全体を作り直して送る（patch はファイル単位の置き換え）。

先に確かめること（小さな試験用 Artifact で）:
1. `publish_files`（patch）で再公開しても、宣言（db・user・sample、contract 0.2.67）が残ること（ハブの slug `6b77f66a-b0dc-41e1-8a7a-ef6adcc3f22a`、現在は index.html だけの1ファイル）
2. 公開されたページから `fetch("content/…json")` で自分のファイルが読めること（実機で確認）

ファイルの形（案）:
- `content/index.json` = `{ "sources": {id: sourceDoc}, "units": {id: unitsDoc} }`（起動時に1回だけ fetch。units の形は今の `units` コレクションと同じ。`url` / `reader` は任意にする）
- `content/texts/<章>.json`（今の `texts` と同じ形。必要なときだけ fetch）
- `content/overviews/<出典>.json`（今の `overviews` と同じ形。必要なときだけ fetch）
- 同じ ID がデータベースとファイルの両方にあればファイルを優先する（古い章をファイルで作り直せるように）

ハブの直す所: `subscribeUnits` / `afterUnits`（db の units にファイルの units を合わせる。しまった資料は手元で除く）、`loadText`、`loadOverview`、sources の読み込み、リーダーへのリンク（`url` が無ければ出さない）。テスト t1〜t10 を通し、ファイルの章を含む t11 を足す。

## 第2段階：作成キットとプロンプト v7 — 済み（2026-11-17）

結果:
- データファイルは JSON ではなく1行1項目のテキスト（`voc: 単語 | 品詞 | 意味` など）にした。引用符やエスケープを書かずに済み、出力が短くなる。`build_unit.py` が JSON に直す（属性の `'` → `"`、`\|` → `|`）。
- キットは Artifact が `.py` を配れなかったので、プロジェクトの `claude/hub/tools/` に置いた（`/mnt/project/` からコピー）。
- `check_hub_data.py --content` を追加（index の形、texts の有無、全体図ファイル、`--toc-ids` でデータベースの全体図の節IDとも照合）。
- 試験データで「データファイル → build → check → ハブで表示（jsdom）」を通した。本番のハブから `read_file` で index.json を取り出せることも確かめた（結果に version と sha256 が付くので list_files は確認のときだけ）。
- 生成プロンプト v7 は `claude/hub/prompt-v7.md`。プロジェクトの指示に貼るのはユーザー。
- まだ本番で章を作っていない。最初の章を v7 で作るときに、出力の量と手順のつまずきを見て直す。

当初の案:

- キット（ハブの Artifact の `tools/` に置き、`read_file` の `paths` でディスクに取り出す。会話に中身を流さない）:
  - `build_unit.py`: 1つのデータファイル（ブロックごとに en / ja / note / voc / phr）から `content/texts/<章>.json` を作り、`content/index.json` の units と sources を更新する
  - `check_hub_data.py`: 今の点検に、ファイル方式用の確認を足す
  - 公開後は `list_files` の sha256 と手元のファイルを照合して確認する（全文を読み戻さない）
- 原文: テキストがあるページは `pdftotext`、画像は式・図の確認が要る所だけ。
- プロンプト v7: 訳・構文解説・単語・熟語の書き方のルールは v6 のまま。リーダー HTML の実装仕様（4・5章）を外し、6章の書き込み手順をファイル方式に書き換える。全文を示す。
- 会話の区切り: 1つの会話で作るのは1〜2章まで。
