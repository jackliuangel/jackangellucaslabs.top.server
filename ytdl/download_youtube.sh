#!/bin/bash
# Save as youtube-download-sync.sh

# Configuration
URL="$1"
COOKIES_FILE="/home/ubuntu/ytdl/cookies-youtube.txt"
DOWNLOAD_DIR="/tmp/video_download/congliulyc@gmail.com"
LOG_FILE="/tmp/youtube_download/youtube_download.log"

# Generate timestamp for filename
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check if URL parameter is provided
if [ $# -eq 0 ]; then
    URL="https://www.youtube.com/watch?v=Z99Njl3Fra0"
fi


# Log start
log "=== DOWNLOAD STARTED ==="
log "URL: $URL"
log "Timestamp: $TIMESTAMP"


# Check if yt-dlp is installed
YTDLP_PATH="$HOME/.local/bin/yt-dlp"
if [ ! -f "$YTDLP_PATH" ]; then
    log "ERROR: yt-dlp not found"
    echo "ERROR: yt-dlp not found"
    exit 1
fi

# Check if cookies file exists and fix permissions
if [ ! -f "$COOKIES_FILE" ]; then
    log "ERROR: Cookies file does not exist"
    echo "ERROR: Cookies file does not exist"
    exit 1
fi


log "Starting download with subtitles..."

#     -f "best[ext=mp4]/best" \
# Execute download with subtitle options

    # Try to generate PO Token
    PO_TOKEN_ARGS=""
    if [ -f "/home/ubuntu/ytdl/get_po_token.py" ]; then
        log "Generating PO Token..."
        PO_TOKEN=$(python3 /home/ubuntu/ytdl/get_po_token.py 2>>"$LOG_FILE")
        if [ $? -eq 0 ] && [ -n "$PO_TOKEN" ]; then
            log "PO Token generated successfully"
            PO_TOKEN_ARGS="--extractor-args \"$PO_TOKEN\""
        else
            log "WARNING: Failed to generate PO Token"
        fi
    fi

    CMD_ARGS=(
        "$YTDLP_PATH"
        --cookies "$COOKIES_FILE"
        --js-runtimes node
        --remote-components ejs:github
        -f "best[ext=mp4]/best"
        --write-sub
        --write-auto-sub
        --sub-lang "zh,zh-Hans,zh-CN,en"
        --sub-format "srt"
        --embed-subs
        --no-progress
        --mark-watched
        --embed-thumbnail
        -o "$DOWNLOAD_DIR/${TIMESTAMP}.%(ext)s"
        "$URL"
    )

    if [ -n "$PO_TOKEN_ARGS" ]; then
        # We need to eval or use array properly if args contain spaces/quotes
        # But extractor args string is simple enough to pass directly if constructed carefully
        # However, passing quoted string inside array expansion is tricky
        # So lets just construct the command string for logging and execution via eval if needed
        # Or simpler: just append the arg
        "$YTDLP_PATH" \
        --cookies "$COOKIES_FILE" \
        --js-runtimes node \
        --remote-components ejs:github \
        --extractor-args "$PO_TOKEN" \
        -f "best[ext=mp4]/best" \
        --write-sub \
        --write-auto-sub \
        --sub-lang "zh,zh-Hans,zh-CN,en" \
        --sub-format "srt" \
        --embed-subs \
        --no-progress \
        --mark-watched \
        --embed-thumbnail \
        -o "$DOWNLOAD_DIR/${TIMESTAMP}.%(ext)s" \
        "$URL" >> "$LOG_FILE" 2>&1
    else
        "$YTDLP_PATH" \
        --cookies "$COOKIES_FILE" \
        --js-runtimes node \
        --remote-components ejs:github \
        -f "best[ext=mp4]/best" \
        --write-sub \
        --write-auto-sub \
        --sub-lang "zh,zh-Hans,zh-CN,en" \
        --sub-format "srt" \
        --embed-subs \
        --no-progress \
        --mark-watched \
        --embed-thumbnail \
        -o "$DOWNLOAD_DIR/${TIMESTAMP}.%(ext)s" \
        "$URL" >> "$LOG_FILE" 2>&1
    fi

# Capture exit code
DOWNLOAD_EXIT_CODE=$?

# Log result
if [ $DOWNLOAD_EXIT_CODE -eq 0 ]; then
    log "=== DOWNLOAD WITH SUBTITLES COMPLETED ==="
    log "SUCCESS: Download with subtitles completed"
    
    # Find the downloaded files
    DOWNLOADED_VIDEO=$(find "$DOWNLOAD_DIR" -name "${TIMESTAMP}.*" -type f | grep -E '\.(mp4|mkv|avi)$' | head -1)
    DOWNLOADED_SUBTITLES=$(find "$DOWNLOAD_DIR" -name "${TIMESTAMP}.*" -type f | grep -E '\.(srt|vtt)$')
    
    if [ -n "$DOWNLOADED_VIDEO" ] && [ -f "$DOWNLOADED_VIDEO" ]; then
        # Get file information
        FILE_SIZE=$(du -h "$DOWNLOADED_VIDEO" | cut -f1)
        FILE_NAME=$(basename "$DOWNLOADED_VIDEO")
        FILE_PATH="$DOWNLOADED_VIDEO"
        
        log "Downloaded video: $FILE_NAME"
        log "Video size: $FILE_SIZE"
        log "Video path: $FILE_PATH"
        
        # Check for subtitles
        if [ -n "$DOWNLOADED_SUBTITLES" ]; then
            log "Subtitles found:"
            for sub in $DOWNLOADED_SUBTITLES; do
                SUB_NAME=$(basename "$sub")
                SUB_SIZE=$(du -h "$sub" | cut -f1)
                log "  - $SUB_NAME ($SUB_SIZE)"
            done
        else
            log "No separate subtitle files found (may be embedded)"
        fi
        
        # Return file information
        log "SUCCESS: Download with subtitles completed"
        log "Video: $FILE_NAME"
        log "Size: $FILE_SIZE"
        log "Path: $FILE_PATH"
        log "HTTP URL: http://47.128.3.198/files/$FILE_NAME"
        log "SMB Path: //47.128.3.198/YoutubeDownload/$FILE_NAME"
        
        # List subtitle files if any
        if [ -n "$DOWNLOADED_SUBTITLES" ]; then
            log "Subtitles:"
            for sub in $DOWNLOADED_SUBTITLES; do
                SUB_NAME=$(basename "$sub")
                log "  - $SUB_NAME"
            done
        else
            log "Subtitles: Embedded in video file"
        fi
        
        echo "http://47.128.3.198/files/$FILE_NAME"
        
        exit 0
    else
        log "ERROR: Downloaded video file not found"
        echo "ERROR: Downloaded video file not found"
        exit 1
    fi
else
    log "=== DOWNLOAD WITH SUBTITLES FAILED ==="
    log "ERROR: Download with subtitles failed (exit code: $DOWNLOAD_EXIT_CODE)"
    echo "ERROR: Download with subtitles failed (exit code: $DOWNLOAD_EXIT_CODE)"
    exit 1
fi
