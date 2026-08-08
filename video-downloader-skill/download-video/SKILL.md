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
   - `/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "<URL>" [quality]`
5. **Result Reporting**: Parse script output and provide the video title, uploader (when available), and download HTTP link.

## Usage

### Command

```bash
/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "<URL>" [quality]
```

### Parameters

- **URL**: The YouTube or Bilibili video URL.
- **Quality** (Optional):
  - `1` or `360p`: Low quality, smaller file size.
  - `2` or `720p`: Balanced quality.
  - `3` or `1080p`: High quality.
  - `4` or `4k`: Highest quality (Bilibili only).
  - `history`: Update watch history without downloading.

### Example

**User**: "Download this YouTube video in 1080p: https://www.youtube.com/watch?v=example"

**Action**: Run `/Users/jack/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "https://www.youtube.com/watch?v=example" 1080p`

**Response**: Provide the download link and title returned by the script.

## Notes

- The script uses `yt-dlp` and local cookies for authenticated downloads.
- Downloaded files are saved to iCloud Drive by default and served via `https://jackangellucaslabs.top/files/`.
- For Bilibili videos, the script defaults to silent mode.
- Download and error logs are written to `ytdl/workdir/youtube_download.log` for YouTube downloads.
