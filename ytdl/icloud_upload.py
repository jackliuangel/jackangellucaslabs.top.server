#!/usr/bin/env python3
"""iCloud Drive upload helper (companion to video_download_pro.sh).

Modes:
  login                 Interactive login with 2FA; saves a persistent session.
  status                Report whether the saved session is still valid.
  upload <file>         Upload one file to iCloud Drive/Downloads (non-interactive).

Configuration comes from environment variables (or the config file sourced by
icloud_upload.sh):
  ICID_USERNAME    Apple ID email
  ICID_PASSWORD    Apple ID password
  ICID_COOKIE_DIR  directory that stores the persistent login session
  ICID_TARGET      target folder name under iCloud Drive root (default: Downloads)
  ICID_CHINA       1 for mainland-China iCloud accounts (uses .com.cn endpoints)
  ICID_2FA_MODE    sms (default) | push | both - which 2FA channel to request

Notes:
- China-region accounts MUST set ICID_CHINA=1 or the service login never
  completes (setup.icloud.com redirects with {"domainToUse":"iCloud.com.cn"}).
- Initializing the service during a pending 2FA login sends a fresh
  verification code, so validation happens in the same process that triggered
  the code; `login` reads the code from stdin (or an optional <code> argument).
"""

import io
import logging
import os
import sys

import pyicloud.base as pb
from pyicloud import PyiCloudService
from pyicloud.exceptions import PyiCloudFailedLoginException

LOGGER = logging.getLogger("pyicloud")


class SmsOnlyPyiCloudService(PyiCloudService):
    """PyiCloudService that requests the 2FA code on ONE channel only.

    Stock pyicloud always requests both trusted-device push AND SMS; this
    override sends just the channel the captain chose (SMS by default).
    """

    def _request_2fa_code(self) -> None:
        mode = os.environ.get("ICID_2FA_MODE", "sms").lower()
        headers = self._get_auth_headers({"Accept": pb.CONTENT_TYPE_JSON})
        trusted_phone_number = self._trusted_phone_number()

        if mode in ("sms", "both") and trusted_phone_number is not None:
            try:
                self.session.put(
                    f"{self._auth_endpoint}/verify/phone",
                    json={
                        "phoneNumber": trusted_phone_number.as_phone_number_payload(),
                        "mode": "sms",
                    },
                    headers=headers,
                )
                LOGGER.debug(
                    "Requested 2FA code via SMS (phone id %s)",
                    trusted_phone_number.device_id,
                )
            except Exception:  # noqa: BLE001
                LOGGER.debug("Could not request 2FA SMS code")
        elif mode == "sms":
            LOGGER.debug("No trusted phone number for SMS; skipping 2FA request")

        if mode in ("push", "both"):
            try:
                self.session.get(
                    f"{self._auth_endpoint}/verify/trusteddevice",
                    headers=headers,
                )
                LOGGER.debug("Requested 2FA code via trusted device push")
            except Exception:  # noqa: BLE001
                LOGGER.debug("Could not request 2FA device push")


class NamedFile(io.BytesIO):
    """BytesIO that carries a remote filename for pyicloud's upload."""

    def __init__(self, data: bytes, name: str):
        super().__init__(data)
        self.name = name


def config():
    return {
        "username": os.environ.get("ICID_USERNAME", ""),
        "password": os.environ.get("ICID_PASSWORD", ""),
        "cookie_dir": os.environ.get("ICID_COOKIE_DIR", ""),
        "target": os.environ.get("ICID_TARGET", "Downloads"),
        "china": os.environ.get("ICID_CHINA", "0") == "1",
    }


def load_service(cfg):
    if not cfg["username"] or not cfg["password"]:
        print("ERROR: ICID_USERNAME / ICID_PASSWORD are not set.", file=sys.stderr)
        print("Set them in the config file or environment, then run 'icloud_upload.sh login'.", file=sys.stderr)
        sys.exit(2)
    cookie_dir = cfg["cookie_dir"] or os.path.expanduser("~/.config/icloud_upload_session")
    os.makedirs(cookie_dir, exist_ok=True)
    try:
        return SmsOnlyPyiCloudService(
            cfg["username"],
            cfg["password"],
            cookie_directory=cookie_dir,
            china_mainland=cfg["china"],
        )
    except PyiCloudFailedLoginException as e:
        print(f"ERROR: Apple ID login failed: {e}", file=sys.stderr)
        sys.exit(1)


def is_authenticated(api):
    try:
        return bool(api.get_auth_status().get("authenticated"))
    except Exception:
        return bool(getattr(api, "is_trusted_session", False))


def cmd_login(cfg, code=None):
    api = load_service(cfg)
    if is_authenticated(api):
        print("Login OK; iCloud session is already valid.")
        return
    print("A verification code was sent to your phone (SMS).", file=sys.stderr)
    if code is None:
        code = input("Enter the 6-digit verification code: ").strip()
    ok = api.validate_2fa_code(code)
    if not ok and api.two_factor_delivery_method != "sms":
        print("Retrying validation via the SMS endpoint...", file=sys.stderr)
        try:
            api._validate_sms_code(code)
            ok = True
        except Exception as e:
            print(f"SMS endpoint validation also failed: {e}", file=sys.stderr)
    if not ok:
        print("ERROR: invalid or expired verification code.", file=sys.stderr)
        sys.exit(1)
    print("Two-factor authentication succeeded; session saved.")
    if not is_authenticated(api):
        print("WARNING: session does not yet report authenticated; check 'status' later.", file=sys.stderr)
        sys.exit(1)
    print("Login OK; iCloud session is valid.")


def cmd_status(cfg):
    api = load_service(cfg)
    if is_authenticated(api):
        print("status: valid")
    else:
        print("status: invalid-or-expired")
        print("Run 'icloud_upload.sh login' to refresh the session with 2FA.", file=sys.stderr)
        sys.exit(1)


def cmd_upload(cfg, filepath):
    if not filepath or not os.path.isfile(filepath):
        print(f"ERROR: file not found: {filepath}", file=sys.stderr)
        sys.exit(2)
    api = load_service(cfg)
    if not is_authenticated(api):
        print("ERROR: iCloud session is invalid or expired.", file=sys.stderr)
        print("Run 'icloud_upload.sh login' to refresh the session with 2FA.", file=sys.stderr)
        sys.exit(1)
    if api.requires_2fa:
        print("ERROR: iCloud session requires 2FA; run 'icloud_upload.sh login'.", file=sys.stderr)
        sys.exit(1)

    drive = api.drive
    target = cfg["target"] or "Downloads"
    names = drive.dir()
    if target not in names:
        print(f"Creating iCloud Drive folder: {target}")
        drive.mkdir(target)
    folder = drive[target]

    filename = os.path.basename(filepath)
    size = os.path.getsize(filepath)
    print(f"Uploading {filename} ({size} bytes) to iCloud Drive/{target} ...", flush=True)
    with open(filepath, "rb") as f:
        data = f.read()
    folder.upload(NamedFile(data, filename))
    print(f"Upload finished: iCloud Drive/{target}/{filename}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cfg = config()
    mode = sys.argv[1]
    if mode == "login":
        cmd_login(cfg, code=sys.argv[2] if len(sys.argv) > 2 else None)
    elif mode == "status":
        cmd_status(cfg)
    elif mode == "upload":
        if len(sys.argv) < 3:
            print("ERROR: upload requires a file path.", file=sys.stderr)
            sys.exit(2)
        cmd_upload(cfg, sys.argv[2])
    else:
        print(f"ERROR: unknown mode '{mode}'", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
