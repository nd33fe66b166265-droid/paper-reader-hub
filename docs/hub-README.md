# 論文リーダーと学習ハブ — 引き継ぎ資料

最終更新: 2026-11-17（学習ハブ Version 14。Artifact の版番号では 15）

このプロジェクトの仕組みを、あとから Claude が読んで編集・整理・作り直しできるようにまとめたもの。
**コードの正本は公開中の Artifact そのもの**で、このプロジェクトには写しを置かない（古い写しと食い違うのを避けるため、また、プロジェクトの資料は毎回の会話に読み込まれるので軽く保つため）。
コードを読むときは `read_file`（slug `6b77f66a-b0dc-41e1-8a7a-ef6adcc3f22a`、`paths: ["index.html"]`）でディスクに取り出す（手順は 7.2）。
プロジェクトの資料は、作業環境の `/mnt/project/` にも `claude_hub_tests_t1_review.js` のような名前（`/` を `_` にしたもの）で置かれている。`project_read` して書き出し直さず、そこからコピーすればよい。

| このプロジェクトに置いたもの | 中身 |
|---|---|
| `claude/hub/README.md` | この資料 |
| `claude/hub/tests/harness.js` ほか | ハブの自動テスト（jsdom）。教材は `gen_fixtures.py` で作る。使い方は「8. テスト」 |
| `claude/hub/plan-token-2026-11.md` | トークン削減の計画（第1段階は済み、第2段階が次） |
| `claude/hub/tools/build_unit.py` | 章のデータファイル（`<章ID>.txt`）から `content/texts/<章>.json` と `content/index.json` を作る（v7） |
| `claude/hub/tools/check_hub_data.py` | 登録前の点検スクリプト（`--content` でファイル方式、引数がフォルダだけならデータベース方式） |
| `claude/hub/prompt-v7.md` | 生成プロンプト v7 の全文（プロジェクトの指示に貼るもの。正本はプロジェクトの指示） |
| `claude/hub/tools/ov_build_example.py` | 全体図（overviews）の SVG を作ったスクリプト。新しい図を描くときの見本 |
| プロジェクトの指示（カスタム指示） | 論文リーダー生成プロンプト v6。リーダーを作ってハブに登録する手順の正本 |

---

## 1. 全体像

```
 論文PDF ──(Claude: 生成プロンプト v6)──▶ 論文リーダー（章ごとの Artifact、静的HTML）
                                       └──▶ 学習ハブのデータベースに登録（ArtifactData）
                                              sources / units / texts / overviews
                                                        │
 学習ハブ（1つの Artifact）◀── 起動時に units（目次）を読む、本文や全体図は必要なときだけ
   今日 / 復習 / 単語帳 / 読む（読む・音読） / 書く
   学習の記録は data/users/<自分>/ に保存（本人だけ読める）
```

- **論文リーダー**: 章ごとの独立したページ。データベースは使わない（capabilities なし）。一度作ったら基本は触らない。
- **学習ハブ**: リーダーの内容をデータベースから読み、単語・熟語の間隔反復、ハブ内で読む・音読、要約の添削、学習時間の記録を行う。ハブの HTML は「教材が増えても書き換えない」作り。教材の追加はデータベースへの書き込みだけで済む。
- 書き込みの分担: 共有データ（教材）は持ち主だけが書ける（= Claude が書く）。学習の記録はハブのページ自身が `data/users/<uid>/` に書く。
- **2026-11-17 から（Version 14）、教材は2か所から読む**: 既存の章はデータベース、新しい章はハブの Artifact に同梱するファイル（`content/`。Claude が `publish_files` でディスクから送るので、本文が会話の出力に乗らない）。同じ ID が両方にあればファイルを優先する（古い章をファイルで作り直せる）。今後は章ごとのリーダーページは作らない（ハブの「読む」画面で読む）。手順は生成プロンプト v7（`claude/hub/prompt-v7.md`）と作成キット（`claude/hub/tools/build_unit.py`）。上の図の「論文リーダー」と「ArtifactData」は v6 までの流れ。

## 2. Artifact の一覧

| 名前 | URL（https://claude.ai/artifact/…） |
|---|---|
| 論文リーダー学習ハブ | `EGhaBVbo4ziiJi9ds9G4xq` |

| 章ID（units / texts） | ハブでの表示名 | リーダーの title | order | 段落 | 語 | 表現 | toc | リーダー URL |
|---|---|---|---|---|---|---|---|---|
| iizuka2024-excerpt | 全体の抜粋（Abstract〜V） | SAR ADC 論文リーダー | 0 | 32 | 112 | 59 | 1,2a,2b,2c,2d,3a,3b,3c,3d,4,5 | `6qRWTCe1iW5DcnHXnngu7u` |
| iizuka2024-2d | II-D DNL/INL | Iizuka 2024 II-D リーダー | 4 | 5 | 40 | 18 | 2d | `LKj3JQkfF9rGxvzoXWNsLK` |
| iizuka2024-3a | III-A Capacitor Array | Iizuka 2024 III-A リーダー | 5 | 8 | 81 | 27 | 3a | `1dkWx1EXsCaUxHQPX8rvnu` |
| iizuka2024-3bc | III-B・C Critical Path / Common Mode | Iizuka 2024 III-B・C リーダー | 6 | 7 | 63 | 22 | 3b,3c | `H3M1XhB5HYYXy28d1R6NBo` |
| sedra-ch1-1 | 1章① Intro・1.1 Signals | Sedra Smith 1章① リーダー | 1 | 16 | 148 | 53 | intro,1-1 | `L43mww627wwC6bhaDanXKR` |
| sedra-ch1-2 | 1章② 1.2 Frequency Spectrum | Sedra Smith 1章② リーダー | 2 | 12 | 102 | 41 | 1-2 | `8AoifFhzTFTpZTz8s1gzhU` |
| sedra-ch1-3 | 1章③ 1.3 Analog and Digital | Sedra Smith 1章③ リーダー | 3 | 16 | 133 | 44 | 1-3 | `SwniDubxSb47cvyjVsrCid` |
| sedra-ch1-4 | 1章④ 1.4.1–1.4.4 Amplifiers | Sedra Smith 1章④ リーダー | 4 | 13 | 109 | 31 | 1-4 | `FnYDGwaFxShBTu4E2cPsrD` |
| sedra-ch1-5 | 1章⑤ 1.4.5–1.4.8 Amplifiers | Sedra Smith 1章⑤ リーダー | 5 | 15 | 109 | 31 | 1-4 | `M98CidotqQPPdNPjRjDmSD` |
| sedra-ch1-6 | 1章⑥ 1.5 Circuit Models | Sedra Smith 1章⑥ リーダー | 6 | 13 | 90 | 36 | 1-5 | `Vj17EhV6a1tjpm93kehTAk` |

出典（sources）: `iizuka2024`（paper, order 1）、`sedra`（textbook, order 2）、`xu2019`。overviews は3つともある。
この表は 2026-10-11 時点のもの。2026-10-27 時点で units は22章（`sedra-ch1-7`〜`ch1-10`、`sedra-ch2-1`〜`ch2-4`、`xu2019-3fh` / `4a` / `4b` / `5` が増えている）。最新はデータベースを `list` して確かめる。

## 3. 論文リーダー

生成ルール（見た目・操作・品質チェック）はプロジェクトの指示（生成プロンプト v6）の 3〜5 が正本。作られた時期によって中身の組み立てが3種類ある。

| 型 | 該当 | データの置き場所 | 地図と章構成 |
|---|---|---|---|
| A. 2ファイル | iizuka2024-excerpt | `paper-data.js`（別ファイル。`SECTIONS` などの配列）を `index.html` が読む | JS で生成 |
| B. 静的HTML | iizuka2024-2d / 3a / 3bc | 段落は `<article class="para">` を HTML に直書き。用語は `<script>` の `const vocab = {語: {pos, mean}}` | SVG と `.toc-list` を直書き（今の章に `active`） |
| C. データ配列 | sedra-ch1-1〜6 | `<script id="data">` の `SECTIONS` と `BLOCKS`。数式は `{R_s}` 記法（表示時に `<var>R<sub>s</sub></var>` に展開） | ページ側 JS の `CH` / `TOC` から生成 |

- どれも 1 ページで完結し、外部に出るのは Google Fonts だけ。データベースは使わない。
- 直すときは `Artifact read`（A は `path: "paper-data.js"` も）で取り出し、直して同じ `url` に publish する。リーダーの本文を直したら、**ハブの texts / units の同じ段落も同じように直す**（ハブはリーダーではなくデータベースを表示している）。
- 今後作るリーダーは生成プロンプト v6 に従うので、型は B か C のどちらかになる（どちらでもよい）。ハブにとって大事なのはデータベースの中身だけ。

## 4. 学習ハブの機能と読み込み方

| タブ | 内容 |
|---|---|
| 今日 TODAY | 今日の復習数（単語・表現・添削カード）、「今日は新出を休む」スイッチ（その日だけ単語と熟語の新出をまとめて止める。復習と添削カードは出す。翌朝4時に自動で戻る）、今日の学習時間（自動計測＋手入力の記録、目標）、学習の記録（「週／月」の切り替え。週 = 月曜始まりの棒グラフ、‹ › でいちばん古い記録の週までさかのぼれる、その週の日ごとの一覧。月 = 1周60分のリングのカレンダー、2周目・3周目以降は色を変えて上に重ねる。日・棒にカーソルを合わせる／タップすると学習時間と内訳のツールチップ）、資料ごとの章の一覧（読む／続きを読む）、資料をしまう・戻す |
| 復習 REVIEW | 3段階評価（忘れた／あいまい／覚えた）＋「知っている」。期日の来た復習は1日の上限（設定、既定40枚）まで期日の古い順に出し、残りは明日以降。復習を1枚もしなかった日は「なかった日」として、その日から後ろの復習日をすべてずらす（起動時と、開いたまま日付が変わったとき）。単語は英→日、熟語・定型文は日→英、添削カードも混ぜる。カードの裏に元の文（texts から） |
| 単語帳 WORDS | 単語と熟語の切り替え、検索・章・並び順・状態で絞り込み、行を開くと出てくる文 |
| 読む READING | 「読む」= リーダーと同じ見た目（訳・構文解説・英単語の開閉、用語ツールチップ、全体図と章構成）。「音読」= 読み上げとシャドーイング／リピーティング。プレーヤーの「範囲」で章全体か「この段落」（タップした文の段落を、止めるまで約2秒おきにくり返す）を選ぶ。続きから読む |
| 書く WRITING | 章を選んで英語で要約 → `sample` で添削（直した英文と、その日本語訳。訳は「訳を見る／訳を隠す」で開閉、初期は閉）→ 間違いを添削カードとして復習に追加、書き直し、履歴 |

**読み込みの方針（重くしないため）**

- 起動時: `sources`（購読）と自分の記録（`data/users/<uid>` を1回 get）と `content/index.json`（fetch、1回）を並行で読み、しまった資料が分かってから `units` を購読する（しまった資料の章は `where("source", "in", 今の資料)` で除く。今の資料が30を超えたら全部読んで手元で除く）。資料・章はデータベースの分にファイルの分を重ねる（`mergeSources` / `mergedUnits`。同じ ID はファイル）。index.json が無い・読めない・8秒で返らないときは、データベースの分だけで動く。
- ファイルの章（`u.file`）の本文は `content/texts/<章>.json`、index の `overviews` に名前がある資料の全体図は `content/overviews/<資料>.json` を必要なときだけ fetch する（無ければデータベースを見る）。開いたままのハブには新しいファイルは届かない（開き直すと届く）。
- 自分の記録（`time-` / `log-` / `sum-` は月ごと）は、起動時の1回の get で**全部の月**が届く。学習の記録で前の週・前の月にさかのぼっても読み込みは増えない。
- `texts/<章>`: その章の本文が要るとき（復習カードの裏、読む、音読、添削、単語帳の文）に1回だけ読み、`S.texts` に持つ。復習では次のカードの分を先読みする。
- `overviews/<資料>`: 読む画面で全体図を出すときに1回だけ。
- しまった資料の章: 「しまった資料の語に今日の復習がある」とき、または単語帳で「しまった資料の語も表示」を押したときに1回だけ読む（`loadArchived`）。新出カードには出さない。
- 教材の章が作り直されたら（units の中身が変わったら）その章の本文は読み直す（`afterUnits` の `unitSigs`）。

**capabilities と runtime**

```json
{"db":{"rules":[{"path":"units","read":"view","write":"owner"},{"path":"sources","read":"view","write":"owner"},{"path":"texts","read":"view","write":"owner"},{"path":"overviews","read":"view","write":"owner"}]},"user":{},"sample":{}}
```

- 公開は `publish_files`（patch。送ったファイルだけ変わり、ほかのファイル・宣言・contract はそのまま。2026-11-17 に試験用 Artifact と本番で確認）。宣言を変えるときは `read_declaration` → `declare_capabilities`（全体を渡す）。
- publish で `capabilities` を省くと前のまま引き継がれる。**渡すときは上の全体を渡す**（一部だけ渡すと残りが消える）。新しいコレクションを足すときは rules に1行足して全体を渡す。
- contract は 0.2.67 に固定（`contract` を渡さない限り変わらない。上げるなら全テストと実機確認をしてから）。
- 使っている runtime: `claude.use("db")`（collection / doc / where / get / onSnapshot / set / update）、`claude.use("user").id()`、`claude.use("sample").json(prompt)`。
- `data/users/<uid>/` は本人だけが読み書きできる。ArtifactData では `data/users/me` で自分の分を読める（Claude はユーザーとして読める）。

## 5. データの形

### 共有（教材。Claude が書く）

生成プロンプト v6 の「6. 学習ハブへの登録」が正本。要点だけ:

| コレクション/ID | 形 |
|---|---|
| `sources/<src>` | `{title, short, authors, venue, kind: "paper"|"textbook", order}` |
| `units/<src>-<章>` | `{source, label, reader, url, order, blockCount, blocks: [{sec, voc: [[語, 品詞, 意味]], phr: [[表現, 意味, 原文中の一致部分, 注意]]}], toc: [節ID]}` |
| `texts/<src>-<章>` | `{unit, blocks: [{en, ja, note: [HTML]}]}` — units と**同じ順・同じ数** |
| `overviews/<src>` | `{source, header: {title, sub, authors, venue, doi, specs: [[値, 項目]]}, figure: {title, desc, svg}, toc: {title, items: [{id, num, en, ja}]}}` |

**ファイルで届ける教材（Version 14 から）**: ハブの Artifact の `content/` に置く。

| ファイル | 形 |
|---|---|
| `content/index.json` | `{"sources": {資料ID: sources と同じ形}, "units": {章ID: units と同じ形}, "overviews": [ファイルで持つ全体図の資料ID]}`。units の `url` / `reader` は無くてよい（無ければリーダーへのリンクを出さない） |
| `content/texts/<章ID>.json` | texts と同じ形 |
| `content/overviews/<資料ID>.json` | overviews と同じ形 |

- ID は英数字と `-` `_` `.`（先頭は `.` 以外）。それ以外の ID は無視する。
- 既存の資料（例: sedra）に章を足すときは、index の `sources` に資料を入れなくてもよい（データベースの資料に重なる）。章構成が増えるなら、その資料の全体図をファイルで作り直して `overviews` に名前を入れる。

- en / ja / note に使える HTML: `t`(`data-k`)・`var`・`sub`・`sup`・`span.eq`・`span.eq.disp`・`span.lead`・`strong`・`em`・`b`・`i`・`code`・`ol`・`ul`・`li`・`br`（`sanitize()` の `ALLOW`）。
- SVG に使える要素: `svg g defs marker polygon polyline path rect line circle ellipse text tspan title`（`sanitizeSvg()` の `SVG_TAGS`）。押せるブロックは `g.ov-node[data-sec="id id"]`。
- 1ドキュメントは 256 KiB まで。今いちばん大きい texts でも約 44 KB。

### 自分専用（`data/users/<uid>/`。ハブが書く）

| ID | 形 | 書き方 |
|---|---|---|
| `meta` | `{newPerDay:20, phrPerDay:5, order:"read", rate:1, day, newDone, reviewsDone, phrDone, dailyMin:60, fixPerDay:3, fixAdded, capDay, pauseDay}`（`pauseDay` = 新出を休む日の dayKey。今日と同じときだけ効く。Version 13 で `revPerDay`（既定40、0=上限なし）, `revDone`（今日やった復習 s=2 の数）, `lastReview`（最後に評価した日）, `skipThrough`（ずらし済みの最後の日）, `shiftNote: {from, to, n, day, moved, seen}`（知らせ）を追加） | `flush()` が set |
| `srs-0`〜`srs-7` | `{cards: {encKey(キー): {s, ivl, ease, reps, lapses, due, last, again}}}` | `flush()` が変わったシャードだけ set。シャードは `shardOf(キー)` |
| `time-YYYY-MM` | `{days: {日: {端末ID: {read, review, shadow, write, other}}}}`（秒） | `mergeDoc` |
| `log-YYYY-MM` | `{entries: {id: {day, cat, min, memo, at}}}`（削除は `{del:true}`） | `mergeDoc` |
| `sum-YYYY-MM` | `{items: {id: {day, at, unit, unitLabel, text, ja, res: {overall, corrected, correctedJa, items}, rewrite, rewriteAt}}}` | `mergeDoc` |
| `fixes` | `{cards: {id: {ja, en, wrong, fixed, reason, level, unit, unitLabel, at}}}` | `mergeDoc` |
| `progress` | `{units: {章ID: {bi, max, n, at}}}`（bi = 続きの段落、max = いちばん先まで読んだ段落） | `mergeDoc` |
| `archive` | `{sources: {資料ID: {on, at}}}` | `mergeDoc` |

- カードのキー: 単語 = 見出し語の小文字、熟語 = `"phr:" + 表現を小文字・空白1つに`、添削 = `"fix:<id>"`。`encKey` は英小文字・数字以外を `_<16進>_` にする。**教材を作り直しても同じ語・同じ表現の文字列なら記録は引き継がれる**。表現の文字列を変えると別カードになる。
- s: 0 未学習 / 1 学習中（当日中にもう一度）/ 2 復習 / 3 知っている。1日の区切りは 4:00（`CUT_H`）。
- `mergeDoc(id, data)` は `update` で入れ子をマージし、ドキュメントが無ければ `set`。ほかの端末の記録を消さないために、記録系は必ずこれで書く。
- `res.correctedJa`（直した英文の日本語訳）は Version 9 から。添削のときに `corrected_ja` として一緒に受け取る。それより前の結果には無いので、「訳を見る」を初めて押したときに `sample` で訳だけ作り、`{items: {id: {res: {correctedJa}}}}` を `mergeDoc` で足す（`toggleWrJa`）。

## 6. ハブのコードの地図

ハブの HTML の `<script>` 冒頭に同じ地図がコメントで入っている。ファイルは公開している `index.html` そのもの（1行目に骨組み `<!doctype html>…<body>` を含む。約 3,350 行: 骨組み → CSS → HTML → 1つの IIFE）。節は `/* ====` で検索する。

| 節 | 主な関数・変数 |
|---|---|
| Utilities | `$`, `esc`, `dayKey`/`dayStart`（4時区切り）, `lsGet`/`lsSet`, `toast`, `sanitize`, `splitSentences`, `speechText` |
| State | `S`（状態の全部。`S.dbUnits`/`S.dbSources` = データベースの分、`S.file` = index.json の中身、`S.units`/`S.sources` = 合わせたもの）, `DEFAULT_META`, `meta()`, `shardOf`/`encKey`/`decKey`, `rebuildWords`（語と表現の集約。`active` = しまっていない資料に出る）, `unitById`, `archivedIds`/`loadArchived`/`archDueCounts`, ファイル（`fetchJson`（8秒で null）, `loadFileIndex`, `mergeSources`, `mergedUnits`）, `textOf`/`loadText`/`textState`/`secOf`, `phrContext`/`contextOf` |
| SRS | `statusOf`, `nextState`, `ivlLabel`, `counts`, `flush`（`metaFirst` のときは meta を先に書く）, `mergeDoc`, `writeChain`（書き込みは1本の Promise 列で順番に）。復習の上限: `dueReviews`/`revPlan`（期日の古い順に `revPerDay - revDone` 枚が `allowed`、残りが `over`。`counts`・`buildSession`・`archDueCounts` が使う）。復習しなかった日: `lastReviewBefore`（`lastReview`、無ければカードの `last` から今日より前の最後の日）, `applySkippedDays`（`max(最後に復習した日, skipThrough)` の翌日から昨日までの日数だけ、s=2 の全カードの `due` を後ろへ。meta を先に書き、二重にずらさない）, `onNewDay`（開いたまま日付が変わったら、書き込みを済ませて記録を読み直してから判定。`tick` が呼ぶ）, `renderShiftNote` |
| Tabs | `TABS`, `showTab` |
| TODAY | `renderToday`, `newPaused()`（`meta.pauseDay === dayKey()`。`counts` と `buildSession` で新出を0にする）, `#pauseNew` のスイッチ, `setArchived`, `renderArchList`, `archConfirm` |
| REVIEW | `buildSession`（新出はしまっていない資料だけ、単語4:表現1で混ぜる）, `renderReview`, `renderPhrCard`, `renderFixCard`, `grade`, `markKnown`, `prefetchQueue`, `waitTextThenReview` |
| WORDS | `renderWords`, `wordRow`, `refreshWordRow`, `wMode`, `wInclArch` |
| Speech / SHADOWING | `say`, `stopSpeech`, `renderShadow`, `buildShadowUnit`, `playFrom`, `speakCur`, `P`（再生状態。`lap` = 段落くり返しの周回）, `shLoop`（範囲 `unit`/`para`）, `LOOP_GAP`（周の間 2000ms）, `paraFirst`/`isParaLast`, `markLoopBlk`（くり返し中の段落の印）。スマホではプレーヤーをタブの実測の高さ（`--tabs-h`、ResizeObserver）の上に置く |
| READING | `rdMode`, `fillUnitSelect`, `renderReadTab`, `renderRead`, `renderRdHead`, `setPanel`/`syncRdBar`（開閉）, `showTip`/`placeTip`/`hideTip`/`lookupRd`（`placeTip(el, html)` は学習の記録のツールチップと共通。要素 `#rdTip` を使い回す）, `rdTrack`/`saveProgress`/`restoreRead`（続きから）, `loadOverview`/`sanitizeSvg`/`renderOverview`/`ovJump` |
| STUDY TIME | `bucketNow`, `idleLimit`（読む5分・他2分で停止。再生中は止めない）, `tick`（1秒ごと）, `saveTime`, `dayAuto`/`dayTotals`, `renderTime`（今日の分）, 手入力の記録。学習の記録: `renderChart`（`tmView` = `week`/`month` で振り分け）, `renderWeek`（`tmWeekOff`、月曜始まり `weekStart`、カテゴリ別の積み上げ）, `renderMonth`（`tmMonOff`、`ringSvg`：1周 `RING_MIN`=60分、満たした周を下に敷き今の周を上に重ねる。色は `--ring-1/2/3`）, `firstRecDay`（さかのぼれる範囲）, `tmTipHtml`（ツールチップの中身。数字と決まった語だけ）。日付の計算は `dateOf`/`keyOfDate`/`addDays`（正午を基準にして日付ずれを防ぐ） |
| WRITING | `unitText`, `buildPrompt`（`corrected_ja` も頼む）, `buildJaPrompt`（古い結果の訳だけ作る）, `normalizeRes`, `renderWrite`, `renderWrResult`, `toggleWrJa`（訳の開閉。`WR.jaOpen` は初期 閉・別の結果を開くと閉、`WR.jaBusy` は作成中）, `addCards`, `renderWrHist` |
| Settings / Boot | 設定ダイアログ, `rerenderAll`, `subscribeUnits`, `afterUnits`, `boot` |

**守ること**

- **データベースから読んだ記録（`d.data()` の中身）は凍結されていて書き換えられない**。`S.srs[k].due = …` や `S.sums[id].res.x = …` のように読んだ物を直接書き換えると、本番では TypeError で止まる（jsdom の偽 db では起きなかったので Version 13 で起動が止まった）。必ず `{ ...元, 変える所 }` の写しを作って入れ替える。`harness.js` は読んだデータを凍結して渡す（`HUB_NOFREEZE=1` で無効）ので、テストで気づける。

- units と texts の blocks の対応（i 番目どうし）。ずれると復習で別の文が出る。
- 記録系は `mergeDoc`、カード（srs/meta）は `flush`。直接 `set` すると他端末の記録を消す。
- 本文の HTML は必ず `sanitize()`、図は `sanitizeSvg()` を通してから DOM に入れる（共有データも外から来たものとして扱う）。`sample` の返事（添削・訳）は `esc()` して文字として出す。手入力の記録のメモも `esc()`。
- ドキュメント全体のクリックでツールチップを閉じる処理は、`[data-tmday]`（学習の記録の日・棒）を押したときだけ閉じない（押すと出す側の処理が先に走るため）。
- localStorage は端末ごとの表示設定だけ（`hub-tab`, `hub-sh-unit`, `hub-rd-mode`, `hub-rd-terms`, `hub-rd-ov`, `hub-arch-open`, `hub-w-mode`, `hub-wr-unit`, `hub-wr-draft-<章>`, `hub-voice`, `hub-repeat`, `hub-sh-loop`, `hub-sh-mode`, `hub-sh-text`, `hub-tm-view`, `hub-dev`）。読み書きは `lsGet`/`lsSet`（例外を握りつぶす）。
- 400px 幅で横スクロールが出ないこと（図のコンテナを除く）。ライト／ダーク両方。

## 7. 作業の手順

### 7.1 新しい章を追加する（いちばん多い作業）

**v7 から**: 生成プロンプト v7 の「5. 章のデータファイル」「6. 学習ハブへの登録」のとおり。データファイル（1行1項目の `<章ID>.txt`）を書き、`build_unit.py` → `check_hub_data.py --content` → `publish_files`（`content/` のファイルだけ）→ `list_files` の sha256 で確認。リーダーページは作らない。データベースには書かない。

以前（v6、データベース方式）の点検:

```sh
# units/<id>.json と texts/<id>.json（必要なら overviews/<src>.json）を <dir> に置いて
python3 check_hub_data.py <dir> --overviews <既存 overviews を ArtifactData で保存した dir>/overviews
```

### 7.2 ハブのコードを直す

1. `read_file`（slug、`paths: ["index.html"]`）でディスクに保存する（会話には流れない）。公開する前に、直す所の前後は必ず Read で読む（自分で読んでいないファイルは公開しない）。版は `list_files` の `version`。
2. 直す。仕様が決まっていないときは、作る前にユーザーと相談する（ユーザーの希望:「段階に分けて、少しずつ正確に」。見た目の案は、実際の記録を使った試作を会話の中で見せてから決めてもらうと早い）。変更は「置き換え前の文字列が1か所だけ一致することを確かめて置き換える」スクリプトにしておくと、やり直しが楽。
3. テスト（8.）を通す。見た目の変更は Playwright（Chromium。`python3 -m playwright install chromium`）で 400px と 780px、ライト／ダークのスクリーンショットを見る（`window.claude` と `speechSynthesis` を偽物にした確認用ページを作って開く。自分の記録は `ArtifactData list data/users/me` で取れる）。
4. `publish_files`（slug、`base_version` = 1. の版、files に `{"as": "index.html", "path": 手元のファイル}`、`label` に変更点を短く）。教材のファイルを一緒に送ってもよい。結果の `capabilities` と `contract`（0.2.67）が変わっていないことを見る。
5. `list_files` の sha256 と手元の `sha256sum` が同じか確かめる（全文を読み戻さない）。

### 7.3 教材データを一括で直す・移行する

- ArtifactData の `list`（`out_dir` 付き）で写しを取り、スクリプトで直し、`batch`（50件・1 MiB まで、`if_version` 付き）で書き戻す。書いたら `get` で確かめる。
- 自分専用の記録（`data/users/me`）は読めるが、書き換えはユーザーに確認してから。カードのキーを変える移行は記録が失われるので避ける。

### 7.4 新しいハブを作る（分けたくなったとき）

1つのハブで資料が増えても、しまう機能と遅延読み込みで重くならない作りにしてある。分けるのは、用途がまったく違う教材（例: 英会話用）を別に管理したいときなど。

1. 今のハブの HTML を取り出し、新しいファイル名で publish（`url` なし）→ 新しい URL。`capabilities` は 4. の全体を渡す。
2. 必要な教材（sources / units / texts / overviews）を旧ハブから `list` して新ハブに `batch` で書く。
3. 学習記録を移すなら、旧ハブの `data/users/me` を `list` し、ユーザーの了承を得て新ハブの `data/users/me` に書く（同じ持ち主の Artifact どうしなら uid は同じ）。
4. 生成プロンプトの「学習ハブのURL」と、この README の URL を書き換える。

## 8. テスト（`claude/hub/tests/`）

jsdom でハブを動かし、`window.claude.use` を偽のデータベースに差し替える。期待値は教材（fixtures）から計算する。2026-11-17 から、教材は本物の写しではなく `gen_fixtures.py` が作る本物と同じ形の小さな教材を使う（データベースの中身を会話に流さずに済む。資料2つ・5章、ファイルの章4つと全体図2つ）。

| ファイル | 確かめること |
|---|---|
| `harness.js` | 共通部品（fixtures の読み込み、偽 db（読んだデータは本番と同じく凍結）・user・sample、スクロール位置の模擬、`ok`/`finish`）。`opts.beforeParse(w)` で読み上げなどを差し替えられる |
| `t1_review.js` | 起動時に本文・全体図を読まない、復習カードの文脈、熟語カードの印、単語帳の表現数と文脈、音読、添削プロンプト |
| `t2_read.js` | 読む画面（開閉・一括開閉・ツールチップ）、続きから読む、読む時間の記録、要約を書く／次の章へ。引数 `oldtab` で旧「音読」タブからの移行 |
| `t3_overview.js` | 全体図の遅延読み込み・開閉と記憶・色分け・章構成から移動・SVG の無害化（資料ごと） |
| `t4_archive.js` | しまう／戻す、起動時に読まない、しまった資料の語は復習に出て新出に出ない、1回だけ読む |
| `t5_write_ja.js` | 直した英文の訳: 添削で一緒に受け取り保存、初期は閉・開閉・別の結果で閉に戻る、書き直し中は出さない、HTML を解釈しない、訳の無い古い結果は初回だけ作って `res.correctedJa` を保存（失敗時の表示も） |
| `t6_para_loop.js` | 音読の段落くり返し: 範囲の記憶と強調、途中の文から始めて段落の最後→約2秒→段落の頭へ、次の段落に進まない、周回の表示、くり返し中の段落の印、別の段落をタップで切り替え、各文2回との組み合わせ、章全体に戻すと次の段落へ（読み上げは 10ms で終わる偽物。約15秒） |
| `t7_history.js` | 学習の記録（今日から相対の日付で記録を作る）: 既定は週、月曜始まりの7日、‹ › と「今週に戻る」、いちばん古い記録の週まで（それより前は押せない）、棒の値とカテゴリ・手入力の記録、棒のツールチップとほかを押すと消える、月に切り替えて記憶、日数と月曜始まりの空き、今日の印、リングの周（129分 = 2周目を満たし3周目が9分ぶん重なる、45分 = 1周目だけ、70分 = 1周目＋2周目）とリングの中の日付、カレンダーのツールチップ（タップでも消えない）、記録の無い日、未来の日は押せない、さかのぼってもデータベースを読まない |
| `t8_pause_new.js` | 今日は新出を休む: スイッチの状態、休むと単語・熟語の新出が0（期日の来た復習と添削カードは出る）、内訳・合計・バッジ・案内、`pauseDay` が今日の日付で保存、終わりの画面の案内、再開で新出が戻る。引数 `yesterday` で前日に休んだ記録が今日は効かないこと |
| `t9_skip_cap.js` | 復習しなかった日をとばす・1日の復習の上限。引数: `skip`（2日分ずれる・知らせ・meta を先に保存・閉じる・開き直しても二重にずれない）, `legacy`（lastReview の無い古い記録でもカードの last から判定）, `yesterday`（昨日復習していればずらさない）, `midnight`（開いたまま日付が変わったとき）, `cap`（上限5で期日の古い順に5枚、明日以降の数、revDone と lastReview の保存、設定で上限を変える・0 で上限なし） |
| `t10_frozen_write.js` | 書くタブ: 保存済み（凍結された）要約でも「添削カードにする」「見ないで書き直す」が動いて保存される |
| `t11_file_units.js` | ファイルで届く章（偽の fetch で `fixtures_files/` を配る）: index.json は起動時に1回、本文・全体図は必要なときだけファイルから、同じ ID はファイルを優先（データベースの本文は読まない）、既存の資料に足した章の並び、ファイルの全体図と章構成、単語帳・単語数、url の無い章にリンクを出さない。引数 `archived`（ファイルだけの資料をしまって起動 → 読まない・復習には出る・戻すと出る）, `nofile`（index.json が 404 → データベースだけで動く） |
| `gen_fixtures.py` | テスト用の教材を作る（`fixtures/` と `fixtures_files/`） |
| `prep_fixtures.py` | 本物のデータベースの写しを fixtures/ に並べる（以前の方法。今は使わない） |
| `run_all.sh` | 全部まとめて実行（19本） |

手順（作業ディレクトリは scratchpad の下に作る）:

```sh
mkdir -p work/tests && cd work
for f in /mnt/project/claude_hub_tests_*; do cp "$f" "tests/${f#/mnt/project/claude_hub_tests_}"; done
(cd tests && npm i jsdom@24)
python3 tests/gen_fixtures.py
HUB=$PWD/hub.html sh tests/run_all.sh     # 全部 OK になること（約90秒）
```

- `HUB` は公開している index.html そのもの（骨組み付き）でも、`<body>` の中身だけでもよい。**絶対パス**で渡す（`run_all.sh` は tests/ に移動してから動く）。直す前の版で新しいテストが失敗することも確かめておくと、テストが本当に変更を見ているか分かる。

## 9. 制約と既知の限界

- データベース: 1ドキュメント 256 KiB、Artifact あたり 25,000 ドキュメント、`in` は30件まで、batch は50件・1 MiB。
- カードは8シャードに分けているので、1カード約130バイトとして 1シャード 256 KiB ≒ 約1,900カード、全体で約15,000カードが目安の上限（2026-10-11 時点で記録のあるカードは48枚）。超えそうならシャード数を増やす移行が要る（`SHARDS` を変えるとキーの割り振りが変わるので、全カードを読み直して書き直す）。
- 学習時間・記録・要約は月ごとのドキュメントで、古い月も消さずに残る（記録は 2026-10-08 から）。学習時間は1か月で約 6 KB（端末が増えると少し増える）なので、何年分でも起動時に読む量は小さい。要約は1件約 6.5 KB なので、1か月に約 40 件を超えると `sum-YYYY-MM` が上限に近づく。そこまで書くようになったら、月を前半・後半に分けるなどの保存の分け方の変更が要る。
- 添削と訳は `sample` が使えるときだけ（使えないときは書く画面に案内が出る）。
- 読み上げはブラウザの音声（端末によって声や速さが違う）。スマホで画面を消したりアプリを切り替えたりすると、ブラウザが読み上げを止めることがある（段落くり返しも止まる）。
- jsdom のテストは見た目（レイアウト・色）を見ない。見た目はスクリーンショットで確かめる。
- 続きの位置・計測は端末ごと（localStorage の端末ID `hub-dev`）に記録し、表示では合算する。
- 復習しなかった日のずらしは、srs のシャードを丸ごと書き直す。Version 12 以前のハブを開いたままの端末で評価すると、その端末の古いカードでシャードを上書きしてずらしが一部消え、meta の `skipThrough` も消える（次に開いたとき残りが二重にずれうる）。更新後はほかの端末のハブを一度開き直す。
- 月のカレンダーのリングは1周60分で固定（設定の「1日の目安」とは別。目安はツールチップと「目安達成」の数に使う）。3周目以降は同じ色なので、何周したかはツールチップ（「リング ◯周＋◯分」）で見る。

## 10. これまでの経緯

- 準備: リーダーを章ごとに作成（Iizuka 2024 は 2026-09、Sedra 第1章は 2026-10 初め）。ハブを作成し、学習時間の自動計測・学習記録・要約の添削を追加。熟語・定型文のカード（日→英、1日5個、読んだ教材から）を追加。
- 第1段階: データを units（目次）と texts（本文）に分け、本文は必要なときだけ読むようにした（既存データを移行）。
- 第2段階: 音読タブを「読む」タブにまとめ、ハブの中でリーダーと同じように読めるようにした。5分無操作で計測停止、続きから読む。
- 第3段階: 論文の全体図と章構成（overviews）を読む画面に表示（ボタンで開閉、状態を記憶）。生成プロンプトを v5 に（overviews と toc の登録手順を追加）。
- 第4段階: 読み終えた資料をしまう機能（資料ごと、しまった資料の語は復習には出すが新出には出さない、必要なときだけ読む）。ハブ Version 7。
- 整理: この資料・テスト・点検スクリプトをプロジェクトに保存。ハブの `<script>` 冒頭にコードの地図を追記（動作は同じ）。ハブ Version 8。
- 生成プロンプト v6: 書き込み前の点検に `check_hub_data.py` を使うよう1行追加。
- 2026-10-12: 書くタブの添削結果に、直した英文の日本語訳を追加（「訳を見る／訳を隠す」で開閉、初期は閉）。新しい添削では一緒に受け取り、以前の結果は初めて開くときに作って保存。テスト `t5_write_ja.js` を追加。ハブ Version 9。
- 2026-10-13: 音読モードのプレーヤーに「範囲」（章全体／この段落）を追加。「この段落」ではタップした文の段落を、止めるまで約2秒おきにくり返す（ユーザーが選んだ仕様: プレーヤーで切り替え、回数は止めるまで、周の間は2秒）。周回の表示と、くり返し中の段落の印。あわせて、スマホでプレーヤーの設定の行が下のタブに隠れていたのを直した（タブの高さを実測）。テスト `t6_para_loop.js` を追加、`harness.js` に `beforeParse` を追加。ハブ Version 10。
- 2026-10-27: 今日タブの「学習の記録」（それまでは直近2週間の棒グラフ）を「週／月」の切り替えにした。ユーザーが選んだ仕様: 置き場所は今日タブの学習の記録の欄で切り替え、週は月曜始まり（‹ › でさかのぼれる）、月はカレンダーの各日にリング（1周60分、2周目以降は色を変えて重ねる、中に日付）、日付にカーソルを合わせる（スマホはタップ）と学習時間が出る（論文リーダーの用語ツールチップと同じ見た目）。週の棒はカテゴリ別の積み上げに変え、その週の日ごとの一覧を下に出す。テスト `t7_history.js` を追加。ハブ Version 11。
- 2026-11-01: 今日タブに「今日は新出を休む」スイッチを追加。ユーザーが選んだ仕様: その日だけのボタン（翌朝4時に自動で戻る）、単語と熟語をまとめて止める。復習（期日の来た単語・熟語）と添削カードはふだんどおり出す。`meta.pauseDay` に保存するので、ほかの端末にも同じ設定が届く。テスト `t8_pause_new.js` を追加。ハブ Version 12。
- 2026-11-09: 復習しなかった日をとばす仕組みと、1日の復習の上限を追加。ユーザーが選んだ仕様: 復習を1枚もしなかった日は、その日から後ろの復習日をすべて1日ずつずらす（次の日が2日分にならない）。途中までやった日の残りはずらさず、代わりに「1日の復習の上限」（設定、既定40枚、期日の古い順、残りは明日以降）で平らにする。ずらした日は今日タブに知らせ（閉じられる）。11/1〜11/8 の8日分は、更新後に最初に開いたときに自動でずらす（225枚、今日の復習は上限40枚＋明日以降60枚）。テスト `t9_skip_cap.js` を追加。ハブ Version 13。
- 2026-11-10: Version 13 を開くと起動が途中で止まり、復習タブが「読み込んでいます…」のまま、今日の枚数が「–」になっていた。原因は、本番のデータベースが渡す記録は凍結されているのに、`applySkippedDays` がカードの `due` を直接書き換えていたこと（偽 db では再現しなかった）。写しを作って入れ替えるよう直し、起動時の呼び出しを try/catch で囲んだ。同じ原因で、書くタブの古い要約での「訳を見る（訳の作成）」「添削カードにする」「見ないで書き直す」も止まっていたので直した。テストの偽 db を凍結する形に変え、`t10_frozen_write.js` を追加。Version 13.1（Artifact の版番号 14）。11/1〜11/8 のずらしは保存されていなかったので、直した版を最初に開いたときにかかる。
- 2026-11-17: トークン削減の計画（plan-token）の第1段階。ハブがファイルで届く章（`content/`）も読めるようにした。先に試験用 Artifact で、`publish_files` で公開し直しても宣言・contract が残ること、公開したページから `fetch("content/…json")` で自分のファイルを読めること、データベースと user が使えることを実機で確認した。テストの教材を `gen_fixtures.py` で作るように変え、`t11_file_units.js` を追加（19本すべて OK）。`publish_files` で公開（index.html と空の `content/index.json`）。Version 14（Artifact の版番号 15）。
- 2026-11-17: plan-token の第2段階。作成キット `build_unit.py`（1行1項目のデータファイル → ハブのファイル。JSON の引用符を書かずに済み、出力が短い）と、`check_hub_data.py` の `--content`（ファイル方式の点検）を作り、試験データで「組み立て → 点検 → ハブで表示」を通して確かめた。キットは当初ハブの Artifact の `tools/` に置く計画だったが、Artifact は `.py` を配れないのでプロジェクトの `claude/hub/tools/` に置いた（`/mnt/project/` からコピーできるので会話には流れない）。生成プロンプト v7（リーダーページの仕様を外し、登録をファイル方式に、1会話1〜2章、ページ画像は必要な所だけ）。
