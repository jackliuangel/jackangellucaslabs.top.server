#!/bin/bash
# Unit tests for video_download_pro.sh pure functions.
#
# Extracts the script's config + function definitions (everything before
# main()) and asserts behavior of the A1/B3/B4 additions:
#   - B3  json_escape(): valid JSON string, lossless round-trip
#   - B4  url_encode():  matches urllib.parse.quote
#   - A1  get_po_token_args(): cache miss -> generate & write cache;
#                              cache hit  -> reuse, script not re-run;
#                              failure    -> non-zero (fallback path)
#
# No network access or real downloads. Requires bash, python3, timeout.
#
# Usage:  bash tests/test_video_download_pro.sh
# Exit:   0 = all pass, 1 = at least one failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRO_SCRIPT="$(dirname "$SCRIPT_DIR")/video_download_pro.sh"

if [ ! -f "$PRO_SCRIPT" ]; then
    echo "ERROR: video_download_pro.sh not found at $PRO_SCRIPT"
    exit 1
fi

PASS=0
FAIL=0
assert_eq() { # <label> <expected> <actual>
    if [ "$2" = "$3" ]; then
        PASS=$((PASS + 1)); echo "  ✓ $1"
    else
        FAIL=$((FAIL + 1)); echo "  ✗ $1 (expected [$2], got [$3])"
    fi
}
assert_true() { # <label> <0|1>
    if [ "$2" = "0" ]; then
        PASS=$((PASS + 1)); echo "  ✓ $1"
    else
        FAIL=$((FAIL + 1)); echo "  ✗ $1"
    fi
}

echo "== 提取 $PRO_SCRIPT 的函数定义（跳过 main）=="
EXTRACTED=$(awk '/^# Main function/{exit} {print}' "$PRO_SCRIPT")
if [ -z "$EXTRACTED" ]; then
    echo "ERROR: 未能从脚本中提取函数定义"
    exit 1
fi

# 直接 source 到当前 shell（脚本内无 set -e，且函数名不与测试辅助函数冲突）
# shellcheck disable=SC1090
source <(printf '%s\n' "$EXTRACTED")

# 测试环境隔离
TESTDIR=$(mktemp -d)
trap 'rm -rf "$TESTDIR"' EXIT
LOG_FILE="$TESTDIR/test.log"
BASE_LOG_DIR="$TESTDIR"
YTDL_COOKIES_DIR="$TESTDIR"
PYTHON_CMD="$(command -v python3)"

# ---- B3: json_escape ----
echo "== B3: json_escape =="
TITLE='波斯"帝国"開創者 含空格'
ESC=$(json_escape "$TITLE")
assert_true "json_escape 产出合法 JSON 字符串且往返一致" "$(
    python3 -c "
import json, sys
esc, orig = sys.argv[1], sys.argv[2]
try:
    assert json.loads(esc) == orig, 'round-trip mismatch'
    print(0)
except Exception:
    print(1)
" "$ESC" "$TITLE")"

# ---- B4: url_encode ----
echo "== B4: url_encode =="
FN='波斯"帝国" file 測試.mp4'
ENC=$(url_encode "$FN")
EXPECTED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$FN")
assert_eq "url_encode 与 urllib.parse.quote 一致" "$EXPECTED" "$ENC"
if [[ "$ENC" == *' '* || "$ENC" == *'"'* ]]; then
    assert_true "url_encode 不含未编码字符" 1
else
    assert_true "url_encode 不含未编码字符" 0
fi

# ---- A1: get_po_token_args ----
echo "== A1: get_po_token_args =="
cat > "$TESTDIR/get_po_token.py" << 'PYEOF'
#!/usr/bin/env python3
import os
with open(os.environ["COUNTER"], "a") as f:
    f.write("x")
print("youtube:player_client=web;po_token=web+TESTTOKEN;visitor_data=abc")
PYEOF
COUNTER="$TESTDIR/calls"
export COUNTER

# 1) 缓存未命中：应生成并写入缓存
rm -f "$TESTDIR/po_token_cache" "$COUNTER"
OUT=$({ read -r f1; read -r v1; } < <(get_po_token_args); printf '%s|%s' "$f1" "$v1")
assert_eq "缓存未命中时返回 --extractor-args + token" \
    "--extractor-args|youtube:player_client=web;po_token=web+TESTTOKEN;visitor_data=abc" "$OUT"
assert_eq "生成成功后写入缓存文件" "1" "$( [ -f "$TESTDIR/po_token_cache" ] && echo 1 || echo 0 )"

# 2) 缓存命中：复用缓存，不再次调用 python 脚本
rm -f "$COUNTER"
OUT2=$({ read -r f2; read -r v2; } < <(get_po_token_args); printf '%s|%s' "$f2" "$v2")
assert_eq "缓存命中时复用同一 token" \
    "--extractor-args|youtube:player_client=web;po_token=web+TESTTOKEN;visitor_data=abc" "$OUT2"
CALLS=0
[ -f "$COUNTER" ] && CALLS=$(wc -c < "$COUNTER" | tr -d ' ')
assert_eq "缓存命中时脚本未被再次调用（调用次数=0）" "0" "$CALLS"

# 3) 生成失败：应返回非零（下载流程据此走 player_client 降级）
cat > "$TESTDIR/get_po_token.py" << 'PYEOF'
#!/usr/bin/env python3
import sys
sys.exit(1)
PYEOF
rm -f "$TESTDIR/po_token_cache"
get_po_token_args > /dev/null 2>&1
RC=$?
assert_eq "生成失败时返回非零退出码" "1" "$RC"

echo ""
echo "----------------------------------------"
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
