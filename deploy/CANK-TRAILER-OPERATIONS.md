# CANK trailer: operator guide

Run these commands on the server:

```sh
ssh eggman@volans.uberspace.de
cd /home/eggman/Projekte/dailyDoase
deploy/cank-trailer-control.sh status
```

## The three processes

| Service | Job |
| --- | --- |
| `cankTrailer` | Creates one new mobile trailer, then waits about 24 hours. |
| `cankTrailerSync` | Copies finished trailers to live folder `lib/GENERATIONS/CANK-TRAILER-GOOD-1`. |
| `cankTrailerWatchdog` | Restarts `cankTrailer` only when no progress appears for 30 hours. |

Only `cankTrailer` spends generation credits. The other two are local server processes.

## Everyday commands

```sh
# Is everything alive?
deploy/cank-trailer-control.sh status

# Start or continue the 24-hour loop.
deploy/cank-trailer-control.sh start

# Pause generation. The already published live page remains online.
deploy/cank-trailer-control.sh pause

# Start it again after a pause.
deploy/cank-trailer-control.sh resume

# Stop the complete CANK system, including publishing.
deploy/cank-trailer-control.sh stop

# Fresh restart when the renderer is stuck.
deploy/cank-trailer-control.sh restart
```

`pause` first stops the watchdog. This matters: otherwise the watchdog could mistake an intentional pause for a failure and restart the renderer.

## Wait, observe, and exit

```sh
# Follow renderer progress. Exit this view with Ctrl-C; the renderer continues.
deploy/cank-trailer-control.sh follow trailer

# Check last messages without waiting.
deploy/cank-trailer-control.sh logs trailer

# Publisher or watchdog logs.
deploy/cank-trailer-control.sh logs sync
deploy/cank-trailer-control.sh logs watchdog
```

After one finished trailer the renderer intentionally sleeps for about 24 hours. During that wait it still shows as `RUNNING`; this is normal. No human action is required.

## When something fails

1. Read recent renderer messages: `deploy/cank-trailer-control.sh logs trailer`.
2. If it is actively retrying, leave it alone. Each WAN clip is retried three times; after a failed trailer, two new semantic iterations are attempted.
3. If status is not `RUNNING`, run `deploy/cank-trailer-control.sh restart`.
4. If restart fails, leave it paused and share the last 120 log lines. Do not run several launcher scripts manually: there must be only one `cankTrailer` renderer.

The live URL is `https://dailydoase.de/v/CANK-TRAILER-GOOD-1`.
