#!/usr/bin/env python3
"""ElevenLabs voiceover with word timings. Python standard library only.

usage: python3 -I vo.py "text" out/name [--voice VOICE_ID] [--model MODEL]
writes out/name.mp3 and out/name_words.json ([{"word", "start", "end"}], seconds)

Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL) from the
environment or from the nearest .env file above the current folder. Never prints the key.
eleven_v3 understands audio tags in the text, e.g. "[warmly] Hi there. [excited] It works!"
"""
import argparse, base64, json, os, pathlib, sys, urllib.error, urllib.request

API = "https://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_VOICE = "XrExE9yKIg1WjnnlVkGX"  # Matilda
DEFAULT_MODEL = "eleven_v3"


def load_env():
    for d in [pathlib.Path.cwd(), *pathlib.Path.cwd().parents]:
        f = d / ".env"
        if f.is_file():
            for line in f.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            return


def post(url, key, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def words_from_alignment(al):
    words, cur, start, end = [], "", None, None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                words.append({"word": cur, "start": round(start, 3), "end": round(end, 3)})
            cur, start = "", None
            continue
        if start is None:
            start = s
        cur += ch
        end = e
    if cur:
        words.append({"word": cur, "start": round(start, 3), "end": round(end, 3)})
    return words


def main():
    p = argparse.ArgumentParser()
    p.add_argument("text")
    p.add_argument("out", help="output path without extension, e.g. 02_script/vo/line01")
    p.add_argument("--voice")
    p.add_argument("--model")
    a = p.parse_args()
    load_env()
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is empty. Add it to the workspace .env file.")
    voice = a.voice or os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    model = a.model or os.environ.get("ELEVENLABS_MODEL") or DEFAULT_MODEL
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = {"text": a.text, "model_id": model}
    try:
        data = json.loads(post(f"{API}/{voice}/with-timestamps?output_format=mp3_44100_128", key, body))
        out.with_suffix(".mp3").write_bytes(base64.b64decode(data["audio_base64"]))
        al = data.get("alignment") or data.get("normalized_alignment")
        if al:
            out.with_name(out.name + "_words.json").write_text(json.dumps(words_from_alignment(al), indent=1))
        print(f"saved {out.with_suffix('.mp3')}" + (" + word timings" if al else ""))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            try:
                msg = json.loads(e.read())["detail"]["message"]
            except Exception:
                msg = "check ELEVENLABS_API_KEY in .env"
            sys.exit(f"ElevenLabs refused the request (HTTP {e.code}): {msg}")
        # some models have no timestamp endpoint: fall back to plain audio
        try:
            out.with_suffix(".mp3").write_bytes(post(f"{API}/{voice}?output_format=mp3_44100_128", key, body))
        except urllib.error.HTTPError as e2:
            sys.exit(f"ElevenLabs error HTTP {e2.code}: {e2.read()[:300].decode(errors='replace')}")
        print(f"saved {out.with_suffix('.mp3')} (no word timings: transcribe it if scenes need them)")


if __name__ == "__main__":
    main()
