#!/bin/sh
# 学習ハブのテストをまとめて動かす。前もって fixtures/ を作り（python3 gen_fixtures.py、README「テスト」）、
# ../hub.html に今のハブの HTML を置くか、HUB=<path> で場所を渡す。
# 必要なもの: node と jsdom（npm i jsdom@24）
cd "$(dirname "$0")" || exit 1
st=0
for t in t1_review.js t2_read.js "t2_read.js oldtab" t3_overview.js t4_archive.js t5_write_ja.js t6_para_loop.js t7_history.js t8_pause_new.js "t8_pause_new.js yesterday" "t9_skip_cap.js skip" "t9_skip_cap.js legacy" "t9_skip_cap.js yesterday" "t9_skip_cap.js midnight" "t9_skip_cap.js cap" t10_frozen_write.js t11_file_units.js "t11_file_units.js archived" "t11_file_units.js nofile" t12_local_db.js t13_local_boot.js "t13_local_boot.js empty"; do
  node $t > /tmp/hubtest.out 2>&1
  if [ $? -eq 0 ]; then echo "OK   $t"; else echo "FAIL $t"; cat /tmp/hubtest.out; st=1; fi
done
exit $st
