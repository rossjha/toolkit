#!/usr/bin/env bash
# Switch the monitor's input source over DDC/CI.
#
#   monitor-switch.sh usb-c|dp|hdmi    (or 1|2|3)
#
# Backends: m1ddc or betterdisplaycli on macOS, ddcutil on Linux.
# Input codes are the VCP 0x60 values this monitor answers to; override with
# MONITOR_INPUT_USBC / MONITOR_INPUT_DP / MONITOR_INPUT_HDMI if a monitor differs.
# Set MONITOR_DISPLAY to pick a display when more than one is attached
# (m1ddc/ddcutil display number, betterdisplaycli display name).
set -euo pipefail

# Hotkey daemons (Karabiner, Hyprland) run with a bare PATH that misses Homebrew.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

USBC="${MONITOR_INPUT_USBC:-19}"
DP="${MONITOR_INPUT_DP:-15}"
HDMI="${MONITOR_INPUT_HDMI:-17}"

usage() {
  echo "usage: $(basename "$0") usb-c|dp|hdmi   (or 1|2|3)" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
case "$1" in
  1|usb-c|usbc|c) input=$USBC ;;
  2|dp|displayport) input=$DP ;;
  3|hdmi) input=$HDMI ;;
  *) usage ;;
esac

display="${MONITOR_DISPLAY:-}"

case "$(uname -s)" in
  Darwin)
    if command -v m1ddc >/dev/null; then
      m1ddc ${display:+display "$display"} set input "$input"
    elif command -v betterdisplaycli >/dev/null; then
      betterdisplaycli set ${display:+--name="$display"} --ddc --vcp=inputSelect --value="$input" >/dev/null
    else
      echo "no DDC tool found: brew install m1ddc" >&2
      exit 1
    fi
    ;;
  Linux)
    if ! command -v ddcutil >/dev/null; then
      echo "ddcutil not found: sudo pacman -S ddcutil (then load i2c-dev, join the i2c group)" >&2
      exit 1
    fi
    ddcutil ${display:+--display "$display"} --noverify setvcp 60 "$input"
    ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac
