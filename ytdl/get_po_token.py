
import subprocess
import sys
import re
import urllib.parse
import json

def get_visitor_data(video_url="https://www.youtube.com"):
    try:
        # Use curl to fetch the page content
        # We target a video page to get fresher visitor data context
        if "watch?v=" not in video_url:
             video_url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ" # Default to a safe video

        cmd = [
            "curl", "-s", "-A", 
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            video_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return None
        
        # Look for "visitorData":"..."
        match = re.search(r'"visitorData":"([^"]+)"', result.stdout)
        if match:
            raw_data = match.group(1)
            # It might be URL encoded (e.g. contains %3D) or pure Base64
            # We unquote just in case
            return urllib.parse.unquote(raw_data)
        
        return None
    except Exception as e:
        print(f"Error fetching visitor data: {e}", file=sys.stderr)
        return None

def get_po_token(visitor_data=None):
    try:
        scanner_bin = "/home/ubuntu/.local/bin/rustypipe-botguard"
        
        cmd = [scanner_bin, "--no-snapshot"]
        if visitor_data:
            cmd.append(visitor_data)
        else:
            # Fallback to generic if no visitor data
            # Or pass "GetPOT" as placeholder?
            # But rustypipe handles empty args too (generates generic)
            pass

        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=10
        )
        
        if result.returncode != 0:
            print(f"Error running rustypipe-botguard: {result.stderr}", file=sys.stderr)
            return None

        output = result.stdout.strip()
        # Output format: TOKEN valid_until=...
        match = re.match(r'^(\S+)', output)
        if match:
            return match.group(1)
        else:
            return None

    except Exception as e:
        print(f"Exception: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    # 1. Try to fetch legitimate visitor data
    visitor_data = get_visitor_data()
    
    # 2. Generate token (bound to visitor data if found)
    token = get_po_token(visitor_data)
    
    if token:
        # Construct args
        # Note: If we have visitor_data, we MUST pass it to yt-dlp too
        args = f"youtube:player_client=web;po_token=web+{token}"
        if visitor_data:
            args += f"+visitor_data={visitor_data}"
            
        print(args)
    else:
        sys.exit(1)
