#!/bin/sh
set -eu

attempt=0
until /usr/bin/curl --silent --fail http://127.0.0.1:4000/continuous-video-folders-api >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 120 ]; then
        echo "Player server did not become ready" >&2
        exit 1
    fi
    /bin/sleep 2
done

exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --kiosk \
    --no-first-run \
    --no-default-browser-check \
    --autoplay-policy=no-user-gesture-required \
    --user-data-dir="/Users/dominikeggermann/Library/Application Support/DailydoasePlayerChrome" \
    'http://127.0.0.1:4000/continuous-player?folder=exhibition-campaign'
