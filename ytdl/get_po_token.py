
import sys
import os

# Add correct path for user installed packages
sys.path.append('/home/ubuntu/.local/lib/python3.10/site-packages')

try:
    from yt_dlp_get_pot import get_pot
    pot = get_pot()
    # Output format compatible with --extractor-args
    print(f"youtube:player_client=web,default;po_token=web+{pot['po_token']}+visitor_data={pot['visitor_data']}") 
except Exception as e:
    # If po_token key is missing, maybe it returns just string or different structure
    # Fallback or error logging
    print(f"Error: {e}", file=sys.stderr)
    try:
        # Fallback: maybe get_pot returns a string directly?
        # But based on documentation it returns a dict-like object or tuple usually?
        # Let's print the raw object if it fails key access to debug
        # But we need meaningful output
        pass
    except:
        pass
    sys.exit(1)
