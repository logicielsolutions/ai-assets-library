#!/usr/bin/env bash
# doctor.sh [workspace]  ->  prints OK / MISSING for every tool the video workspace needs.
# Read-only: it never installs anything.
WS="${1:-$PWD}"
ok=0; miss=0
pass() { printf '  OK       %s\n' "$1"; ok=$((ok+1)); }
fail() { printf '  MISSING  %s  ->  %s\n' "$1" "$2"; miss=$((miss+1)); }

echo "Tools"
if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node.split(".")[0]')
  [ "$v" -ge 22 ] && pass "node $(node -v)" || fail "node 22+ (found $(node -v))" "brew install node   (Windows: winget install OpenJS.NodeJS)"
else fail "node 22+" "brew install node   (Windows: winget install OpenJS.NodeJS)"; fi
command -v ffmpeg  >/dev/null && pass "ffmpeg"  || fail "ffmpeg"  "brew install ffmpeg   (Windows: winget install Gyan.FFmpeg)"
command -v yt-dlp  >/dev/null && pass "yt-dlp"  || fail "yt-dlp"  "brew install yt-dlp   (Windows: winget install yt-dlp.yt-dlp)"
command -v python3 >/dev/null && pass "python3" || fail "python3" "brew install python   (Windows: winget install Python.Python.3.12)"
command -v git     >/dev/null && pass "git"     || fail "git"     "xcode-select --install   (Windows: winget install Git.Git)"
if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null || command -v chrome >/dev/null \
   || [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ] || [ -f "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ] \
   || { [ -n "$LOCALAPPDATA" ] && [ -f "$(cygpath -u "$LOCALAPPDATA" 2>/dev/null)/Google/Chrome/Application/chrome.exe" ]; }; then pass "Google Chrome"
else fail "Google Chrome (only for Google Flow)" "https://www.google.com/chrome/"; fi

echo "Workspace: $WS"
[ -f "$WS/CLAUDE.md" ] && pass "CLAUDE.md" || fail "CLAUDE.md" "run /video-studio:setup"
[ -d "$WS/projects/_template" ] && pass "projects/_template" || fail "projects/_template" "run /video-studio:setup"
if [ -f "$WS/.env" ]; then
  key=$(sed -n 's/^ELEVENLABS_API_KEY=//p' "$WS/.env" | tail -1 | tr -d " \t\r\"'")
  [ -n "$key" ] && pass "ELEVENLABS_API_KEY set" || fail "ELEVENLABS_API_KEY empty" "paste your key into .env (voiceover is skipped without it)"
else fail ".env" "cp .env.example .env"; fi

echo "Claude Code"
if command -v claude >/dev/null; then
  claude plugin list 2>/dev/null | grep -qi hyperframes && pass "HyperFrames plugin" || fail "HyperFrames plugin" "claude plugin marketplace add heygen-com/hyperframes && claude plugin install hyperframes@hyperframes"
  claude mcp get flow >/dev/null 2>&1 && pass "flow MCP (Google Flow)" || fail "flow MCP (optional)" "run /video-studio:setup and choose Google Flow"
fi

echo; echo "$ok OK, $miss missing"
