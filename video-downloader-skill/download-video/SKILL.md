---
name: download-video
description: Downloads YouTube and Bilibili videos using a local download script. Use when a user provides a video URL and asks to download or save the video.
---

# Download Video

## Overview

This skill automates downloading YouTube and Bilibili videos with a local high-performance script (`video_download_pro.sh`). It identifies the video URL, selects the requested or best available quality, runs the downloader, and returns a user-facing download link plus metadata.

## Workflow

1. **URL Identification**: Extract the video URL from the user's request.
2. **Platform Detection**: Detect whether the URL is YouTube or Bilibili.
3. **Quality Selection**: Use the user-provided quality if present; otherwise default to the best available quality.
4. **Execution**: Run the local download script as the next step:
   - `/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "<URL>" [quality] [silent|progress] local`
5. **Result Reporting**: Parse script output and provide the video title, uploader (when available), and download HTTP link.

## Usage

### Command

```bash
/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "<URL>" [quality] [silent|progress] local
```

### Parameters

- **URL** (required): The YouTube or Bilibili video URL.
- **Quality** (optional):
  - `1` or `360p`: Low quality, smaller file size.
  - `2` or `720p`: Balanced quality.
  - `3` or `1080p`: High quality.
  - `4` or `4k`: Highest quality (Bilibili only).
  - `history`: Update watch history without downloading.
  - (omitted): Best available quality.
- **Silent Mode** (optional, Bilibili only):
  - `silent`: No progress display (default for Bilibili).
  - `progress`: Show download progress in terminal.
- **Local Mode** (optional):
  - `local`: Use local paths — workdir under script directory, cookies from script directory, downloads to iCloud Drive or `~/Downloads`. Use this when running on your own machine.
  - (omitted): Server mode — uses `/tmp/video_download` for work/log dirs and `/home/ubuntu/ytdl` for cookies.

### Example

**User**: "Download this YouTube video in 1080p: https://www.youtube.com/watch?v=example"

**Action**: Run `/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "https://www.youtube.com/watch?v=example" 1080p "" local`

**Response**: Provide the download link and title returned by the script.

## Notes

- The script uses `yt-dlp` and local cookies for authenticated downloads.
- In local mode, downloaded files are saved to iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/Downloads`) with fallback to `~/Downloads`, and served via `https://jackangellucaslabs.top/files/`.
- In server mode, paths default to `/tmp/video_download` and `/home/ubuntu/ytdl`.
- For Bilibili videos, the script defaults to silent mode (no progress display).
- Download and error logs are written to `workdir/youtube_download.log` or `workdir/bilibili_download.log` (relative to script directory in local mode, `/tmp/video_download` in server mode).
