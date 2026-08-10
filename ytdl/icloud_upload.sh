#!/bin/bash
# iCloud Drive upload helper - companion to video_download_pro.sh
#
# Usage:
#   icloud_upload.sh login                Interactive Apple ID login with 2FA, saves session
#   icloud_upload.sh status               Check whether the saved session is still valid
#   icloud_upload.sh upload <file>        Upload one file to iCloud Drive/Downloads
#
# Configuration (config file first, then environment overrides):
#   ICID_USERNAME   Apple ID email
#   ICID_PASSWORD   Apple ID password
#   ICID_COOKIE_DIR directory storing the persistent login session
#   ICID_TARGET     target folder under iCloud Drive root (default: Downloads)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Python interpreter from the dedicated pyicloud venv, with fallbacks
ICID_PYTHON="${ICID_PYTHON:-}"
if [ -z "$ICID_PYTHON" ]; then
    for p in \
        "/home/ubuntu/.local/venvs/icloud/bin/python" \
        "$HOME/.local/venvs/icloud/bin/python" \
        "$SCRIPT_DIR/.venv-icloud/bin/python" \
        "$(command -v python3 2>/dev/null || true)"; do
        if [ -x "$p" ] && "$p" -c "import pyicloud" >/dev/null 2>&1; then
            ICID_PYTHON="$p"
            break
        fi
    done
fi

if [ -z "$ICID_PYTHON" ]; then
    echo "ERROR: pyicloud not found. Install it, e.g.:" >&2
    echo "  uv venv --python 3.11 ~/.local/venvs/icloud && uv pip install --python ~/.local/venvs/icloud/bin/python pyicloud" >&2
    exit 2
fi

# Load config file if present (credentials stay out of git)
CONF_FILE="${ICID_CONF:-$HOME/.config/icloud_upload.conf}"
if [ -f "$CONF_FILE" ]; then
    # shellcheck disable=SC1090
    . "$CONF_FILE"
fi

export ICID_USERNAME ICID_PASSWORD ICID_COOKIE_DIR ICID_TARGET ICID_CHINA ICID_2FA_MODE

exec "$ICID_PYTHON" "$SCRIPT_DIR/icloud_upload.py" "$@"
