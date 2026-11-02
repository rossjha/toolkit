#!/usr/bin/env bash
# Toggle the Dock's auto-hide animation between instant and the macOS default.
set -euo pipefail

if [[ "$(defaults read com.apple.dock autohide-time-modifier 2>/dev/null || true)" == "0" ]]; then
  defaults delete com.apple.dock autohide-time-modifier
  echo "Dock auto-hide animation: default"
else
  defaults write com.apple.dock autohide-time-modifier -int 0
  echo "Dock auto-hide animation: instant"
fi
killall Dock
