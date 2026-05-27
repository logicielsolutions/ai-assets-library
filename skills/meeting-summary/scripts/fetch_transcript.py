"""
Fetch the most recent meeting transcript from Fathom API and save it
to the correct meetings/ folder.

Usage:
    python skills/meeting-summary/scripts/fetch_transcript.py

Output:
    meetings/YYYY/MM/DD/[meeting-title]/transcript.md

Requires:
    FATHOM_API_KEY in .env
    FATHOM_RECORDED_BY in .env  (your email address registered with Fathom)
"""

import os
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load .env from project root (three levels up from this script)
ROOT = Path(__file__).parent.parent.parent.parent
load_dotenv(ROOT / ".env")

API_KEY = os.getenv("FATHOM_API_KEY")
if not API_KEY:
    print("Error: FATHOM_API_KEY not set in .env")
    sys.exit(1)

RECORDED_BY = os.getenv("FATHOM_RECORDED_BY")
if not RECORDED_BY:
    print("Error: FATHOM_RECORDED_BY not set in .env (set it to your Fathom account email)")
    sys.exit(1)

FATHOM_API = "https://api.fathom.ai/external/v1"
MEETINGS_DIR = ROOT / "meetings"


def fetch_latest_meeting():
    resp = requests.get(
        f"{FATHOM_API}/meetings",
        headers={"X-Api-Key": API_KEY},
        params={"include_transcript": "true", "recorded_by[]": RECORDED_BY},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    if not items:
        print("No meetings found in Fathom.")
        sys.exit(0)
    return items[0]


def parse_duration(start_str, end_str):
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    try:
        start = datetime.strptime(start_str, fmt)
        end = datetime.strptime(end_str, fmt)
        return int((end - start).total_seconds() // 60)
    except Exception:
        return None


def format_timestamp(ts):
    """Convert HH:MM:SS to M:SS (e.g. 00:05:32 → 5:32, 01:02:03 → 62:03)"""
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = int(parts[0]), int(parts[1]), parts[2]
        total_minutes = h * 60 + m
        return f"{total_minutes}:{s}"
    return ts


def format_transcript(meeting):
    title = meeting.get("title") or meeting.get("meeting_title") or "Meeting"
    share_url = meeting.get("share_url", "")
    start = meeting.get("recording_start_time", "")
    end = meeting.get("recording_end_time", "")
    transcript = meeting.get("transcript", [])

    try:
        dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ")
        date_label = dt.strftime("%B %-d")
    except Exception:
        date_label = ""

    duration = parse_duration(start, end)
    duration_str = f"{duration} mins" if duration else "? mins"

    lines = []
    lines.append(f"{title} - {date_label}")
    lines.append(f"VIEW RECORDING - {duration_str}: {share_url}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for entry in transcript:
        speaker = entry.get("speaker", {})
        name = speaker.get("display_name", "Unknown")
        text = entry.get("text", "").strip()
        ts = format_timestamp(entry.get("timestamp", "0:00"))
        lines.append(f"{ts} - {name}")
        lines.append(f"  {text}")
        lines.append("")

    return "\n".join(lines)


def folder_date(meeting):
    start = meeting.get("recording_start_time", "")
    try:
        dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ")
        return dt.strftime("%Y/%m/%d")
    except Exception:
        return datetime.now().strftime("%Y/%m/%d")


def main():
    print("Fetching latest meeting from Fathom...")
    meeting = fetch_latest_meeting()

    title = meeting.get("title") or meeting.get("meeting_title") or "Meeting"
    date_folder = folder_date(meeting)

    # Create folder: meetings/YYYY/MM/DD/[meeting-title]/
    out_dir = MEETINGS_DIR / date_folder / title
    out_dir.mkdir(parents=True, exist_ok=True)

    transcript_path = out_dir / "transcript.md"
    content = format_transcript(meeting)
    transcript_path.write_text(content, encoding="utf-8")

    print(f"Saved: {transcript_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
