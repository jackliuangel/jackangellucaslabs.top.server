#!/bin/bash
# Universal Video Downloader (YouTube & Bilibili)
# Save as video-download-pro.sh

# Global Configuration
URL="$1"
QUALITY="$2"
SILENT_MODE="$3"
BASE_DIR="/tmp/video_download"
BASE_LOG_DIR="/tmp/video_download"
YTDL_COOKIES_DIR="/home/ubuntu/ytdl"

# Generate timestamp for filename
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Function to get quality label for filename
get_quality_label() {
    local quality="$1"
    case "$quality" in
        1|"360p")
            echo "360p"
            ;;
        2|"720p")
            echo "720p"
            ;;
        3|"1080p")
            echo "1080p"
            ;;
        4|"4k")
            echo "4k"
            ;;
        *)
            echo "best"
            ;;
    esac
}

# Function to get YouTube format selector
get_youtube_format_selector() {
    local quality="$1"
    case "$quality" in
        1|"360p")
            echo "b[ext=mp4][height=360]/bv*[ext=mp4][height=360]+ba[ext=m4a]/bv*[height=360]+ba/b[height=360]/b"
            ;;
        2|"720p")
            echo "b[ext=mp4][height<=720]/bv*[ext=mp4][height<=720]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b"
            ;;
        3|"1080p")
            echo "bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[ext=mp4][height<=1080]"
            ;;
        *)
            echo "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b"
            ;;
    esac
}

# Function to get Bilibili format selector
get_bilibili_format_selector() {
    local quality="$1"
    case "$quality" in
        1|"360p")
            echo "bv*[height<=360]+ba/b[height<=360]/worst"
            ;;
        2|"720p")
            echo "bv*[height<=720]+ba/b[height<=720]/b"
            ;;
        3|"1080p")
            echo "bv*[height<=1080]+ba/b[height<=1080]/b"
            ;;
        4|"4k")
            echo "bv*[height<=2160]+ba/b[height<=2160]/best"
            ;;
        *)
            echo "bv*+ba/b/best"
            ;;
    esac
}

# Function to clean and extract valid URL
clean_url() {
    local input="$1"
    # Extract URL starting with http:// or https://
    if [[ "$input" =~ (https?://[^[:space:]]*) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "$input"
    fi
}

# Function to detect platform from URL
detect_platform() {
    local url="$1"
    if [[ "$url" =~ youtu ]]; then
        echo "youtube"
    elif [[ "$url" =~ bilibili\.com ]] || [[ "$url" =~ b23\.tv ]]; then
        echo "bilibili"
    else
        echo "unknown"
    fi
}

# Function to setup platform-specific configurations
setup_platform_config() {
    local platform="$1"
    
    case "$platform" in
        "youtube")
            COOKIES_FILE="$YTDL_COOKIES_DIR/cookies-youtube.txt"
            DOWNLOAD_DIR="$BASE_DIR/congliulyc@gmail.com"
            LOG_FILE="$BASE_LOG_DIR/youtube_download.log"
            FORMAT_SELECTOR=$(get_youtube_format_selector "$QUALITY")
            ;;
        "bilibili")
            COOKIES_FILE="$YTDL_COOKIES_DIR/cookies-bilibili.txt"
            DOWNLOAD_DIR="$BASE_DIR/congliulyc@gmail.com"
            LOG_FILE="$BASE_LOG_DIR/bilibili_download.log"
            FORMAT_SELECTOR=$(get_bilibili_format_selector "$QUALITY")
            ;;
    esac
    
    # Create directories
    mkdir -p "$DOWNLOAD_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
}

# Function to check prerequisites
check_prerequisites() {
    local platform="$1"
    
    # Check if yt-dlp is installed
    YTDLP_PATH="$HOME/.local/bin/yt-dlp"
    if [ ! -f "$YTDLP_PATH" ]; then
        # Try system installation
        if command -v yt-dlp >/dev/null 2>&1; then
            YTDLP_PATH=$(which yt-dlp)
            log "Using system yt-dlp at: $YTDLP_PATH"
        else
            log "ERROR: yt-dlp not found"
            echo "ERROR: yt-dlp not found. Please install it first:"
            echo "pip install --user yt-dlp"
            exit 1
        fi
    fi
    
    # Check cookies file based on platform
    if [ ! -f "$COOKIES_FILE" ]; then
        if [ "$platform" = "youtube" ]; then
            log "ERROR: YouTube cookies file does not exist at $COOKIES_FILE"
            echo "ERROR: YouTube cookies file not found at $COOKIES_FILE"
            exit 1
        else
            # For Bilibili, warn but continue
            log "WARNING: Bilibili cookies file does not exist at $COOKIES_FILE"
            echo "WARNING: Cookies file not found at $COOKIES_FILE"
            echo "Some bilibili videos may not be accessible without cookies."
            echo "Please export your bilibili cookies and save to: $COOKIES_FILE"
            echo ""
            echo "Continuing without cookies..."
            COOKIES_OPTION=""
            return 0
        fi
    fi
    
    log "Using cookies file: $COOKIES_FILE"
    COOKIES_OPTION="--cookies $COOKIES_FILE"
}

# Function to download YouTube video
download_youtube() {
    # Check for history-only mode
    if [ "$QUALITY" = "history" ]; then
        log "=== YOUTUBE HISTORY UPDATE ONLY ==="
        log "URL: $URL"
        
        # Get title first for the output
        VIDEO_TITLE=$("$YTDLP_PATH" --cookies "$COOKIES_FILE" --get-title "$URL" 2>/dev/null)
        
        log "Updating watch history for: $VIDEO_TITLE"
        
        "$YTDLP_PATH" \
            --cookies "$COOKIES_FILE" \
            --mark-watched \
            --simulate \
            "$URL" >> "$LOG_FILE" 2>&1
            
        local ret=$?
        if [ $ret -eq 0 ]; then
            log "SUCCESS: Watch history updated"
            echo "{\"title\": \"$VIDEO_TITLE\", \"status\": \"success\", \"action\": \"history_update\", \"video_source_url\": \"$URL\", \"platform\": \"youtube\"}"
            exit 0
        else
            log "ERROR: Failed to update watch history"
            echo "{\"status\": \"error\", \"message\": \"Failed to update watch history\", \"video_source_url\": \"$URL\", \"platform\": \"youtube\"}"
            exit 1
        fi
    fi

    log "=== YOUTUBE DOWNLOAD STARTED ==="
    log "URL: $URL"
    log "Quality: ${QUALITY:-best} ($(get_quality_label "$QUALITY"))"
    log "Format selector: $FORMAT_SELECTOR"
    log "download dir: $DOWNLOAD_DIR"    
    # Execute download
    "$YTDLP_PATH" \
        --cookies "$COOKIES_FILE" \
        -f "$FORMAT_SELECTOR" \
        --write-sub \
        --write-auto-sub \
        --sub-lang "zh,zh-Hans,zh-CN,en" \
        --sub-format "srt" \
        --embed-subs \
        --embed-metadata \
        --add-metadata \
        --replace-in-metadata title "\\s+$" "" \
        --replace-in-metadata title "\\s+" "_" \
        --replace-in-metadata title "[,!，！]+" "" \
        --replace-in-metadata title "[|｜]+" "" \
        --replace-in-metadata title "[;]+" "" \
        --replace-in-metadata title "[?]+" "" \
        --replace-in-metadata title "[.]+" "" \
        --replace-in-metadata title "[#]+" "" \
        --replace-in-metadata title '[<>]+' "" \
        --replace-in-metadata title '[:]+' "" \
        --replace-in-metadata title '["]+' "" \
        --replace-in-metadata title '[/]+' "" \
        --replace-in-metadata title '[\\]+' "" \
        --replace-in-metadata title '[*]+' "" \
        --replace-in-metadata title "[\x00-\x1F]+" "" \
        --replace-in-metadata title "[\\u3001-\\u303F\\uFF01-\\uFF60\\uFFE0-\\uFFEE]+" "" \
        --no-progress \
        --mark-watched \
        -o "$DOWNLOAD_DIR/%(title).120B_$(get_quality_label "$QUALITY")_${TIMESTAMP}.%(ext)s" \
	"$URL" >> "$LOG_FILE" 2>&1
    log "=== YOUTUBE DOWNLOAD DONE" 

}

# Function to download Bilibili video
download_bilibili() {
    log "=== BILIBILI DOWNLOAD STARTED ==="
    log "URL: $URL"
    log "Quality: ${QUALITY:-best} ($(get_quality_label "$QUALITY"))"
    log "Format selector: $FORMAT_SELECTOR"
    
    # Determine progress and output options based on silent mode
    if [ "$SILENT_MODE" = "progress" ]; then
        PROGRESS_OPTION="--progress"
        log "Running in interactive mode - showing progress"
        log "📺 开始下载 Bilibili 视频..."
    else
        # Default to silent mode for Bilibili
        PROGRESS_OPTION="--no-progress"
        log "Running in silent mode - no progress display"
        log "🔇 运行在静默模式 - 查看日志: tail -f $LOG_FILE"
    fi
    
    # Build base command
    YTDLP_CMD="$YTDLP_PATH"
    if [ -n "$COOKIES_OPTION" ]; then
        YTDLP_CMD="$YTDLP_CMD $COOKIES_OPTION"
    fi
    
    # Execute download
    if [ "$SILENT_MODE" != "progress" ]; then
        $YTDLP_CMD \
            -f "$FORMAT_SELECTOR" \
            --write-sub \
            --write-auto-sub \
            --sub-lang "zh-Hans,zh-Hant,zh,en" \
            --sub-format "srt" \
            --embed-subs \
            --embed-metadata \
            --add-metadata \
            --replace-in-metadata title "\\s+$" "" \
            --replace-in-metadata title "\\s+" "_" \
            --replace-in-metadata title "[,!，！]+" "" \
            --replace-in-metadata title "[|｜]+" "" \
            --replace-in-metadata title "[;；]+" "" \
            --replace-in-metadata title "[?？]+" "" \
            --replace-in-metadata title "[.。]+" "" \
            --replace-in-metadata title "[#]+" "" \
            --replace-in-metadata title '[<>《》]+' "" \
            --replace-in-metadata title '[:：]+' "" \
            --replace-in-metadata title '["「」"]+' "" \
            --replace-in-metadata title '[/／]+' "" \
            --replace-in-metadata title '[\\]+' "" \
            --replace-in-metadata title '[*]+' "" \
            --replace-in-metadata title "[\x00-\x1F]+" "" \
            --replace-in-metadata title "[\\u3001-\\u303F\\uFF01-\\uFF60\\uFFE0-\\uFFEE]+" "" \
            --no-progress \
            --extractor-args "bilibili:sessdata=" \
            -o "$DOWNLOAD_DIR/%(title).120B_$(get_quality_label "$QUALITY")_${TIMESTAMP}.%(ext)s" \
            "$URL" >> "$LOG_FILE" 2>&1
    else
        $YTDLP_CMD \
            -f "$FORMAT_SELECTOR" \
            --write-sub \
            --write-auto-sub \
            --sub-lang "zh-Hans,zh-Hant,zh,en" \
            --sub-format "srt" \
            --embed-subs \
            --embed-metadata \
            --add-metadata \
            --replace-in-metadata title "\\s+$" "" \
            --replace-in-metadata title "\\s+" "_" \
            --replace-in-metadata title "[,!，！]+" "" \
            --replace-in-metadata title "[|｜]+" "" \
            --replace-in-metadata title "[;；]+" "" \
            --replace-in-metadata title "[?？]+" "" \
            --replace-in-metadata title "[.。]+" "" \
            --replace-in-metadata title "[#]+" "" \
            --replace-in-metadata title '[<>《》]+' "" \
            --replace-in-metadata title '[:：]+' "" \
            --replace-in-metadata title '["「」"]+' "" \
            --replace-in-metadata title '[/／]+' "" \
            --replace-in-metadata title '[\\]+' "" \
            --replace-in-metadata title '[*]+' "" \
            --replace-in-metadata title "[\x00-\x1F]+" "" \
            --replace-in-metadata title "[\\u3001-\\u303F\\uFF01-\\uFF60\\uFFE0-\\uFFEE]+" "" \
            --progress \
            --extractor-args "bilibili:sessdata=" \
            -o "$DOWNLOAD_DIR/%(title).120B_$(get_quality_label "$QUALITY")_${TIMESTAMP}.%(ext)s" \
            "$URL" 2>&1 | tee -a "$LOG_FILE"
    fi
    log "=== BILIBILI DOWNLOAD DONE===" 
}

# Function to process download results
process_download_result() {
    local platform="$1"
    local exit_code="$2"
    local quality_label=$(get_quality_label "$QUALITY")
    
    if [ $exit_code -eq 0 ]; then
        log "=== DOWNLOAD COMPLETED ==="
        log "SUCCESS: $platform download completed"
        
        # Find the downloaded files
        log "Searching for downloaded files with quality: ${quality_label}, timestamp: ${TIMESTAMP}"
        log "Search directory: $DOWNLOAD_DIR"
        log "Search pattern: *_${quality_label}_${TIMESTAMP}.*"
        
        # List all files in download directory for debugging
        log "All files in download directory:"
        find "$DOWNLOAD_DIR" -type f -name "*${TIMESTAMP}*" | while read file; do
            log "Found file: $file"
        done
        
        DOWNLOADED_VIDEO=$(find "$DOWNLOAD_DIR" -name "*_${quality_label}_${TIMESTAMP}.*" -type f | grep -E '\.(mp4|mkv|avi|flv|webm)$' | head -1)
        DOWNLOADED_SUBTITLES=$(find "$DOWNLOAD_DIR" -name "*_${quality_label}_${TIMESTAMP}.*" -type f | grep -E '\.(srt|vtt)$')
        
        log "Found video file: $DOWNLOADED_VIDEO"
        log "Found subtitle files: $DOWNLOADED_SUBTITLES"
        
        if [ -n "$DOWNLOADED_VIDEO" ] && [ -f "$DOWNLOADED_VIDEO" ]; then
            # Extract video information
            VIDEO_TITLE=$("$YTDLP_PATH" $COOKIES_OPTION --get-title "$URL" 2>/dev/null)
            
            # Get additional info for Bilibili
            if [ "$platform" = "bilibili" ]; then
                VIDEO_UPLOADER=$("$YTDLP_PATH" $COOKIES_OPTION --get-uploader "$URL" 2>/dev/null)
                log "Video uploader: $VIDEO_UPLOADER"
            fi
            
            log "Video title: $VIDEO_TITLE"
            
            # Get file information
            FILE_SIZE=$(du -h "$DOWNLOADED_VIDEO" | cut -f1)
            FILE_NAME=$(basename "$DOWNLOADED_VIDEO")
            FILE_PATH="$DOWNLOADED_VIDEO"
            
            log "Downloaded video: $FILE_NAME (Quality: $quality_label)"
            log "Video size: $FILE_SIZE"
            log "Video path: $FILE_PATH"
            
            # Overwrite Title metadata with the video URL using exiftool if available
            if command -v exiftool >/dev/null 2>&1; then
                log "Retagging title metadata with URL via exiftool..."
                exiftool -overwrite_original -Title="$URL" "$FILE_PATH" >> "$LOG_FILE" 2>&1 && log "exiftool retagging succeeded"
            else
                log "exiftool not available; skipping metadata overwrite"
            fi
            
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
            
            # Zip the file to save space and hide filename
            ZIP_FILE_NAME="${TIMESTAMP}.zip"
            ZIP_FILE_PATH="$DOWNLOAD_DIR/$ZIP_FILE_NAME"
            
            log "Zipping files to $ZIP_FILE_PATH..."
            
            # Use zip -j to not store paths, and -m to move (delete source)
            if [ -n "$DOWNLOADED_SUBTITLES" ]; then
                zip -j -m "$ZIP_FILE_PATH" "$FILE_PATH" $DOWNLOADED_SUBTITLES >> "$LOG_FILE" 2>&1
            else
                zip -j -m "$ZIP_FILE_PATH" "$FILE_PATH" >> "$LOG_FILE" 2>&1
            fi
            
            if [ $? -eq 0 ] && [ -f "$ZIP_FILE_PATH" ]; then
                log "Zip encoding successful"
                FILE_PATH="$ZIP_FILE_PATH"
                FILE_NAME="$ZIP_FILE_NAME"
                FILE_SIZE=$(du -h "$FILE_PATH" | cut -f1)
            else
                log "Zip encoding failed, using original file"
            fi

            DOWNLOAD_HTTP_URL="https://jackangellucaslabs.top/files/$FILE_NAME"
            
            # Return file information
            log "SUCCESS: Download completed"
            log "Video: $FILE_NAME"
            log "Size: $FILE_SIZE"
            log "Path: $FILE_PATH"
            log "Title: $VIDEO_TITLE"
            log "DOWNLOAD HTTP URL: $DOWNLOAD_HTTP_URL"
            # log "SMB Path: //47.128.3.198/YoutubeDownload/$FILE_NAME"
            
            # Generate platform-specific JSON output
            if [ "$platform" = "bilibili" ]; then
                echo "{\"title\": \"$VIDEO_TITLE\", \"uploader\": \"$VIDEO_UPLOADER\", \"download_link\": \"$DOWNLOAD_HTTP_URL\", \"video_source_url\": \"$URL\", \"platform\": \"bilibili\"}"
            else
                echo "{\"title\": \"$VIDEO_TITLE\", \"download_link\": \"$DOWNLOAD_HTTP_URL\", \"video_source_url\": \"$URL\", \"platform\": \"youtube\"}"
            fi
            exit 0
        else
            log "ERROR: Downloaded video file not found with pattern *_${quality_label}_${TIMESTAMP}.*"
            log "Trying alternative search patterns..."
            
            # Try broader search patterns
            DOWNLOADED_VIDEO=$(find "$DOWNLOAD_DIR" -name "*${TIMESTAMP}*" -type f | grep -E '\.(mp4|mkv|avi|webm|flv)$' | head -1)
            
            if [ -n "$DOWNLOADED_VIDEO" ] && [ -f "$DOWNLOADED_VIDEO" ]; then
                log "Found video with broader search: $DOWNLOADED_VIDEO"
                # Continue with the same processing logic
                VIDEO_TITLE=$("$YTDLP_PATH" $COOKIES_OPTION --get-title "$URL" 2>/dev/null)
                if [ "$platform" = "bilibili" ]; then
                    VIDEO_UPLOADER=$("$YTDLP_PATH" $COOKIES_OPTION --get-uploader "$URL" 2>/dev/null)
                fi
                FILE_SIZE=$(du -h "$DOWNLOADED_VIDEO" | cut -f1)
                FILE_NAME=$(basename "$DOWNLOADED_VIDEO")
                FILE_PATH="$DOWNLOADED_VIDEO"
                
                log "Downloaded video: $FILE_NAME (Quality: $quality_label)"
                log "Video size: $FILE_SIZE"
                log "Video path: $FILE_PATH"
                
                # Zip the file in fallback block too
                ZIP_FILE_NAME="${TIMESTAMP}.zip"
                ZIP_FILE_PATH="$DOWNLOAD_DIR/$ZIP_FILE_NAME"
                
                log "Zipping files to $ZIP_FILE_PATH..."
                zip -j -m "$ZIP_FILE_PATH" "$FILE_PATH" >> "$LOG_FILE" 2>&1
                
                if [ $? -eq 0 ] && [ -f "$ZIP_FILE_PATH" ]; then
                    log "Zip encoding successful"
                    FILE_PATH="$ZIP_FILE_PATH"
                    FILE_NAME="$ZIP_FILE_NAME"
                    FILE_SIZE=$(du -h "$FILE_PATH" | cut -f1)
                fi
                
                DOWNLOAD_HTTP_URL="https://jackangellucaslabs.top/files/$FILE_NAME"
                
                if [ "$platform" = "bilibili" ]; then
                    echo "{\"title\": \"$VIDEO_TITLE\", \"uploader\": \"$VIDEO_UPLOADER\", \"download_link\": \"$DOWNLOAD_HTTP_URL\", \"video_source_url\": \"$URL\", \"platform\": \"bilibili\"}"
                else
                    echo "{\"title\": \"$VIDEO_TITLE\", \"download_link\": \"$DOWNLOAD_HTTP_URL\", \"video_source_url\": \"$URL\", \"platform\": \"youtube\"}"
                fi
                exit 0
            else
                log "ERROR: Downloaded video file not found even with broader search"
                log "All files in download directory:"
                ls -la "$DOWNLOAD_DIR" | while read line; do
                    log "$line"
                done
                echo "ERROR: Downloaded video file not found"
                exit 1
            fi
        fi
    else
        log "=== DOWNLOAD FAILED ==="
        log "ERROR: $platform download failed (exit code: $exit_code)"
        echo "ERROR: $platform download failed (exit code: $exit_code)"
        if [ "$platform" = "bilibili" ]; then
            echo "This might be due to:"
            echo "1. Missing or invalid cookies file"
            echo "2. Private or restricted video"
            echo "3. Network connectivity issues"
            echo "4. Invalid video URL"
        fi
        exit 1
    fi
}

# Main function
main() {
    # Check if parameters are provided
    if [ $# -eq 0 ]; then
        echo "Universal Video Downloader (YouTube & Bilibili)"
        echo "Usage: $0 <Video_URL> [quality] [mode]"
        echo ""
        echo "Quality options:"
        echo "  1 or 360p - Up to 360p quality (small file size)"
        echo "  2 or 720p - Up to 720p quality (balanced)"
        echo "  3 or 1080p - Up to 1080p quality (high quality)"
        echo "  4 or 4k - Up to 4K quality (highest quality) - Bilibili only"
        echo "  history - 仅更新播放历史，不下载 (Update watch history only)"
        echo "  (no parameter) - Best available quality"
        echo ""
        echo "Mode options (Bilibili only):"
        echo "  silent - 静默模式 (无进度显示，默认模式)"
        echo "  progress - 前台模式 (显示下载进度)"
        echo "  注意: Bilibili默认使用静默模式，如需显示进度请使用 'progress'"
        echo ""
        echo "Examples:"
        echo "  $0 https://www.youtube.com/watch?v=Z99Njl3Fra0 720p"
        echo "  $0 https://www.bilibili.com/video/BV1xx411c7mD 2 silent"
        echo "  $0 https://youtu.be/Z99Njl3Fra0"
        echo "  $0 https://www.bilibili.com/video/BV1xx411c7mD"
        echo "  $0 https://b23.tv/abc123"
        echo ""
        echo "Supported platforms: YouTube (youtu), Bilibili (bilibili.com, b23.tv)"
        exit 1
    elif [ $# -eq 1 ]; then
        QUALITY=""
        SILENT_MODE=""
    elif [ $# -eq 2 ]; then
        SILENT_MODE=""
    fi
    
    # Clean and extract valid URL
    ORIGINAL_URL="$URL"
    URL=$(clean_url "$URL")
    
    # Log URL cleaning if changed
    if [ "$ORIGINAL_URL" != "$URL" ]; then
        log "🧹 Cleaned URL: $ORIGINAL_URL -> $URL"
    fi
    
    # Detect platform from URL
    PLATFORM=$(detect_platform "$URL")
    
    if [ "$PLATFORM" = "unknown" ]; then
        echo "ERROR: Unsupported platform. Please provide a YouTube or Bilibili URL."
        echo "Supported platforms:"
        echo "  - YouTube: URLs containing 'youtu'"
        echo "  - Bilibili: URLs containing 'bilibili.com' or 'b23.tv'"
        exit 1
    fi
    
    
    # Setup platform-specific configurations
    setup_platform_config "$PLATFORM"
    
    # Force silent mode for Bilibili if not explicitly set
    if [ "$PLATFORM" = "bilibili" ] && [ "$SILENT_MODE" != "silent" ] && [ -z "$SILENT_MODE" ]; then
        SILENT_MODE="silent"
        log "🔇 Bilibili下载使用静默模式（无进度显示）"
    fi
    
    # Check prerequisites
    check_prerequisites "$PLATFORM"
    
    # Download based on platform
    case "$PLATFORM" in
        "youtube")
            download_youtube
            DOWNLOAD_EXIT_CODE=$?
            ;;
        "bilibili")
            download_bilibili
            DOWNLOAD_EXIT_CODE=$?
            ;;
    esac
    
    # Process results
    process_download_result "$PLATFORM" "$DOWNLOAD_EXIT_CODE"
}

# Run main function with all arguments
main "$@"
