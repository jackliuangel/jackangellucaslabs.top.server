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
5. **Result Reporting**: Parse script output and provide the video title, uploader (when available), and a **clickable「下载」hyperlink** (format below).

## 输出格式：可点击的「下载」链接

报告下载结果时，把「下载」二字渲染为**终端可点击的超链接**（OSC 8 转义序列），不要直接贴一长串 URL。

转义序列：`ESC]8;;<URL>ESC\下载ESC]8;;ESC\`

> `ESC` 指实际的转义控制字符（0x1B）。输出时必须写出**真实的 ESC 字节**，不能写 "ESC" 或 "\\e" 字面文本。

### 单个视频

```
<视频标题>（<大小>）
ESC]8;;https://jackangellucaslabs.top/files/<文件名>.mp4ESC\下载ESC]8;;ESC\
```

### 多个视频（一次请求多个 URL）

逐个下载完成后，用列表汇总，每项一行标题 + 一行可点击「下载」链接：

```
✅ 全部下载完成：

1. <视频标题>（<大小>）
   ESC]8;;<下载链接>ESC\下载ESC]8;;ESC\
2. <视频标题>（<大小>）
   ESC]8;;<下载链接>ESC\下载ESC]8;;ESC\
```

### 示例（多视频输出）

```
✅ 全部下载完成：

1. 香港國安法5週年（57M）
   ESC]8;;https://jackangellucaslabs.top/files/video1_best_20260813_041322.mp4ESC\下载ESC]8;;ESC\
2. 朱鎔基逝世（74M）
   ESC]8;;https://jackangellucaslabs.top/files/video2_best_20260813_041439.mp4ESC\下载ESC]8;;ESC\
```

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
