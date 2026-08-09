#!/bin/sh
set -eu

# CANK trailer operator control.
# Run on the server from the repository root, for example:
#   deploy/cank-trailer-control.sh status

ACTION=${1:-status}
LOG_TARGET=${2:-trailer}

trailer='cankTrailer'
sync='cankTrailerSync'
watchdog='cankTrailerWatchdog'

status() {
  supervisorctl status "$trailer" "$sync" "$watchdog"
}

pause_renderer() {
  # Stop watcher first. Otherwise it may restart the renderer while it is
  # intentionally paused.
  supervisorctl stop "$watchdog" || true
  supervisorctl stop "$trailer" || true
  echo 'Renderer paused. Published trailers stay online; sync remains active.'
}

resume_renderer() {
  supervisorctl start "$sync" || true
  supervisorctl start "$trailer"
  supervisorctl start "$watchdog"
  echo 'Renderer resumed. It makes one trailer, waits about 14 hours, then continues.'
}

case "$ACTION" in
  status)
    status
    ;;
  start|resume)
    resume_renderer
    status
    ;;
  pause)
    pause_renderer
    status
    ;;
  stop)
    pause_renderer
    supervisorctl stop "$sync" || true
    echo 'CANK trailer system stopped completely.'
    status
    ;;
  restart)
    pause_renderer
    resume_renderer
    status
    ;;
  logs)
    case "$LOG_TARGET" in
      trailer) tail -n 120 ~/logs/cankTrailer.out.log ~/logs/cankTrailer.err.log ;;
      sync) tail -n 120 ~/logs/cankTrailerSync.out.log ~/logs/cankTrailerSync.err.log ;;
      watchdog) tail -n 120 ~/logs/cankTrailerWatchdog.out.log ~/logs/cankTrailerWatchdog.err.log ;;
      *) echo "Unknown log target: $LOG_TARGET (trailer, sync, watchdog)" >&2; exit 2 ;;
    esac
    ;;
  follow)
    case "$LOG_TARGET" in
      trailer) tail -f ~/logs/cankTrailer.out.log ~/logs/cankTrailer.err.log ;;
      sync) tail -f ~/logs/cankTrailerSync.out.log ~/logs/cankTrailerSync.err.log ;;
      watchdog) tail -f ~/logs/cankTrailerWatchdog.out.log ~/logs/cankTrailerWatchdog.err.log ;;
      *) echo "Unknown log target: $LOG_TARGET (trailer, sync, watchdog)" >&2; exit 2 ;;
    esac
    ;;
  *)
    cat <<'USAGE'
Usage: deploy/cank-trailer-control.sh <command> [trailer|sync|watchdog]

Commands:
  status                 Show all three services.
  start | resume         Start renderer, publisher and watchdog.
  pause                  Stop new trailers. Keep already published page online.
  stop                   Stop renderer, publisher and watchdog.
  restart                Safely restart renderer and watchdog.
  logs [service]         Show recent logs.
  follow [service]       Keep showing logs; stop with Ctrl-C.
USAGE
    exit 2
    ;;
esac
