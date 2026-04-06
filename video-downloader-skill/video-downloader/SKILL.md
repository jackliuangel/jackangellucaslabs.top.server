---
name: video-downloader
description: Downloads videos from YouTube and Bilibili. Use when a user provides a video URL (youtu.be, youtube.com, bilibili.com, b23.tv) and asks to download, save, or fetch the video. Supports quality selection and automatic subtitle extraction.
---

# Video Downloader

## Overview
This skill automates the process of downloading videos from YouTube and Bilibili using a local high-performance download script (`video_download_pro.sh`). It handles URL cleaning, platform detection, quality selection, and provides a direct download link once the process is complete.

## Workflow

1. **URL Identification**: Extract the video URL from the user's request.
2. **Quality Selection**: If the user specifies a quality (e.g., "1080p", "720p", "4k"), use it. Otherwise, default to the best available quality.
3. **Execution**: Run the local download script with the URL and quality parameters.
4. **Result Reporting**: Parse the JSON output from the script to provide the video title, uploader (if Bilibili), and the download HTTP link.

## Usage

### Commands
To download a video, execute the following shell command:

```bash
/Users/jackliu/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "<URL>" [quality]
```

### Parameters
- **URL**: The YouTube or Bilibili video URL.
- **Quality** (Optional): 
  - `1` or `360p`: Low quality (small file size)
  - `2` or `720p`: Balanced quality
  - `3` or `1080p`: High quality
  - `4` or `4k`: Highest quality (Bilibili only)
  - `history`: Only updates watch history without downloading.

### Example
**User**: "Download this YouTube video in 1080p: https://www.youtube.com/watch?v=example"
**Action**: Run `/Users/jackliu/Documents/github/jackangellucaslabs.top.server/ytdl/video_download_pro.sh "https://www.youtube.com/watch?v=example" 1080p`
**Response**: Provide the download link and title returned by the script.

## Notes
- The script uses `yt-dlp` and local cookies for authentication.
- Downloaded files are saved to iCloud Drive by default and served via `https://jackangellucaslabs.top/files/`.
- For Bilibili videos, the script defaults to silent mode.
