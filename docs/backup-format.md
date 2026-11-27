# バックアップの形（段階4）

アプリの「保存」→「バックアップを書き出す」で作る 1 つの JSON ファイル（`paper-reader-hub-YYYY-MM-DD.hubbackup.json`）。
**個人の記録と教材が入るので、リポジトリには入れない**（`.gitignore` 済み）。

```json
{
  "format": "paper-reader-hub-backup",
  "version": 1,
  "app": "abc1234",
  "exportedAt": "2026-11-27T10:00:00.000Z",
  "docs": [
    { "col": "sources",       "id": "xu2019",      "data": { "...": "..." } },
    { "col": "units",         "id": "xu2019-2a",   "data": { "...": "..." } },
    { "col": "texts",         "id": "xu2019-2a",   "data": { "...": "..." } },
    { "col": "overviews",     "id": "xu2019",      "data": { "...": "..." } },
    { "col": "data/users/me", "id": "srs-0",       "data": { "cards": { "...": "..." } } }
  ]
}
```

- `docs` は端末のデータベース（`hub/local-db.js`）の中身そのもの。1件 = `{ col, id, data }`。`data` の形は `docs/hub-README.md` の 5節と同じ。
- 使える `col` は `sources` `units` `texts` `overviews` と `data/users/<利用者>`。`data/users/<だれか>` は読み込むときに `data/users/me` に読み替える
  （段階6で claude.ai のハブから移すときは、そちらの利用者 ID のまま書き出してよい。ただし 1 人分だけ）。
- 読み込みの点検は `hub/pwa.js` の `parseBackup`（形・知らない入れ物・重複・`__proto__` という項目名を断る）。
- 読み込みは今のところ「置き換え」。置き換える前の中身は端末の別のデータベース `paper-reader-hub-undo` に取っておき、「戻す前の状態に戻す」で戻せる。
  2台の記録を合わせる読み込みは段階5。
- `version` を上げるときは、古い版を読めるようにしておくこと（学習記録を失わないため）。
