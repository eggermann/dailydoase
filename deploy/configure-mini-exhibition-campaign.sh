#!/bin/sh
set -eu

ROOT=/Users/dominikeggermann/Projekte/dailydoase-eu-reski
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/dominikeggermann/Projekte/dailydoase-eu-reski')
kiosk = root / 'start-kiosk.sh'
old = 'http://127.0.0.1:4000/continuous-player?folder=all-generations'
new = 'http://127.0.0.1:4000/continuous-player?folder=exhibition-campaign'
text = kiosk.read_text()
if text.count(old) != 1:
    raise SystemExit('Expected exactly one kiosk URL to update')
kiosk.write_text(text.replace(old, new))
scenes = root / 'eu-reski-news/scenes'
for name in (
    'gpt-4o-mini-6iter-reference.Xscene.json',
    'off-expression.Xscene.json',
    'on-expression.Xscene.json',
    'redo-run-004-settings.Xscene.json',
):
    (scenes / name).unlink(missing_ok=True)
PY

mkdir -p /Users/dominikeggermann/Library/LaunchAgents
cat > /Users/dominikeggermann/Library/LaunchAgents/com.dailydoase.eu-reski-exhibition-campaign.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dailydoase.eu-reski-exhibition-campaign</string>
  <key>ProgramArguments</key>
  <array><string>$ROOT/deploy/start-exhibition-campaign.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>CAMPAIGN_CONTINUOUS</key><string>1</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key>
  <string>/Users/dominikeggermann/Library/Logs/DailydoasePlayer/exhibition-campaign.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/dominikeggermann/Library/Logs/DailydoasePlayer/exhibition-campaign-error.log</string>
</dict>
</plist>
PLIST
plutil -lint /Users/dominikeggermann/Library/LaunchAgents/com.dailydoase.eu-reski-exhibition-campaign.plist
