# claude.ai のハブから移す（段階6）

claude.ai の Artifact として動いている学習ハブの**教材と学習記録**を、1つのバックアップのファイルにまとめ、
アプリ（GitHub Pages の PWA）の「保存」→「バックアップから戻す」で読み込む。
**claude.ai のハブは書き換えない**（読むだけ）。移したあとも、そのまま残る。

## 中身がある場所

| 場所 | 中身 | 取り出し方 |
|---|---|---|
| ハブのデータベース | `sources` `units` `texts` `overviews`（Version 13 までに作った章）と、`data/users/me`（学習記録: `meta` `srs-0..7` `time-` `log-` `sum-` `fixes` `progress` `archive`） | `ArtifactData` の `list`（`query.limit: 1000`、`out_dir` 付き）。`<out_dir>/<コレクション>/<ID>.json` の形でフォルダに並ぶ |
| ハブの Artifact に同梱したファイル | `content/index.json`・`content/texts/<章>.json`・`content/overviews/<資料>.json`（Version 14 から作った章） | `Artifact` の `list`（`scope: "files"`）で名前を見て、`read`（`paths` と `out_dir` 付き） |

どちらも**会話に中身を流さずに**ディスクへ写せる（Claude Code からでも、claude.ai の「論文リーダー」プロジェクトからでも）。
同じ ID が両方にあれば、ハブと同じくファイルの方を使う。

## 手順（Claude がやること）

```sh
# 1. データベースを写す（コレクションごとに ArtifactData list、out_dir は同じフォルダ）
#    sources / units / texts / overviews / data/users/me  → work/db/
# 2. 同梱ファイルを写す（Artifact read、paths に content/ のファイルを全部）→ work/files/content/
# 3. まとめる
python3 tools/make_backup.py --db work/db --content work/files -o paper-reader-hub-<日付>-from-claude.hubbackup.json
# 4. 空の端末で読み込めるか確かめる（本物のファイルで）
cd tests && MIGRATE_BACKUP=<作ったファイルの絶対パス> node t19_migrate.js
```

- `make_backup.py` は誤り（読めない JSON、使えない ID、2人分の記録、`__proto__`）があればファイルを作らない。
  注意（本文の無い章、段落の数が合わない章など）は出すがファイルは作る。
- 記録は `data/users/me` にまとめて書く（claude.ai の利用者 ID はファイルに残さない）。
- できたファイルには教材の原文と学習記録が入る。**リポジトリには入れない**（`*.hubbackup.json` は `.gitignore` 済み）。
  渡すときはプロジェクトのファイル（非公開）を使う。

## 手順（ユーザーがやること）

1. スマホでアプリを開き、ファイルを端末に保存する。
2. アプリの「保存」→「バックアップから戻す」でファイルを選ぶ。
3. 確かめの表で数（章・復習カードなど）を見て、**置き換える**を選ぶ（スマホに見本しか入っていないとき）。
   スマホでもう学習を始めているなら**合わせる**（設定はスマホのままになる）。
4. 開き直すと、今のハブと同じ章・カード・学習の記録が出る。

## 切り替え日

- ファイルは作った時点の写し。それより後に claude.ai のハブで学習した分は入らない。
- 切り替える日まで claude.ai のハブを使い続けるなら、その日にもう一度写して作り直し、アプリで**合わせる**を選べばよい
  （段階5の決まりで、カードは最後に学習した方、学習時間は端末ごとに足される）。
- 切り替えた後は、新しい章もアプリの「教材を追加」で取り込む（claude.ai のハブへの登録は要らない）。
