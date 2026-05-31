#!/bin/bash
# Manage the Social Cards Ghost webhook background service (launchd).
# Usage: ./service.sh [install|uninstall|start|stop|restart|status|logs]

LABEL="com.davidimel.socialcards-ghost"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"
LOG="$(cd "$(dirname "$0")" && pwd)/logs/server.log"

case "$1" in
  install|start)
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null
    sleep 2
    launchctl bootstrap "gui/$UID_NUM" "$PLIST" && echo "✓ service started"
    ;;
  uninstall|stop)
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null && echo "✓ service stopped"
    ;;
  restart)
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null
    sleep 2
    launchctl bootstrap "gui/$UID_NUM" "$PLIST" && echo "✓ service restarted"
    ;;
  status)
    if launchctl list | grep -q "$LABEL"; then
      PID=$(launchctl list | awk -v l="$LABEL" '$0 ~ l {print $1}')
      echo "● running (PID $PID) on http://localhost:4747"
    else
      echo "○ not running"
    fi
    ;;
  logs)
    tail -f "$LOG"
    ;;
  url)
    ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"
    SECRET=$(grep -E '^WEBHOOK_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
    BASE=$(grep -E '^PUBLIC_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
    [ -z "$BASE" ] && BASE="http://localhost:4747"
    echo "Your webhook URL (paste into Ghost):"
    echo "  ${BASE}/webhook?secret=${SECRET}"
    ;;
  *)
    echo "Usage: ./service.sh [install|uninstall|start|stop|restart|status|logs|url]"
    ;;
esac
