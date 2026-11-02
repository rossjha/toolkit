#!/usr/bin/env bash
# Add a blank spacer tile to the end of the Dock's apps section.
# Drag it into place afterwards; drag it off the Dock to remove it.
set -euo pipefail

defaults write com.apple.dock persistent-apps -array-add '{"tile-type"="spacer-tile";}'
killall Dock
