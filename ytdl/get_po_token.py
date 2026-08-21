import sys


def main():
    # YouTube now gates subtitles behind a web.subs PO token that the local
    # botguard tool cannot generate (its token only validates for the web client).
    # The web_embedded client serves both video and subtitles without any PO
    # token, so this script simply selects that client. The download script
    # treats this stdout line as the --extractor-args value.
    print("youtube:player_client=web_embedded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
