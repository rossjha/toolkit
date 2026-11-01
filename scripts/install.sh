#!/usr/bin/env bash
# Links this folder to ~/scripts/tools, sources aliases.sh from the shell rc
# file and installs keyboard shortcuts (Karabiner on macOS; Hyprland plus a
# keyd Caps Lock mapping on Linux).
# Safe to run again.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
link="$HOME/scripts/tools"
marker="# tools-scripts"

mkdir -p "$HOME/scripts"
if [[ -L "$link" ]]; then
  ln -sfn "$here" "$link"
elif [[ -e "$link" ]]; then
  echo "$link exists and is not a symlink; move it and rerun" >&2
  exit 1
else
  ln -s "$here" "$link"
fi
echo "linked $link -> $here"

case "$(basename "${SHELL:-}")" in
  zsh) rc="$HOME/.zshrc" ;;
  *) rc="$HOME/.bashrc" ;;
esac
if ! grep -qF "$marker" "$rc" 2>/dev/null; then
  printf '\n%s\n[ -f ~/scripts/tools/aliases.sh ] && source ~/scripts/tools/aliases.sh\n' "$marker" >> "$rc"
  echo "added aliases to $rc (open a new shell)"
fi

case "$(uname -s)" in
  Darwin)
    dir="$HOME/.config/karabiner/assets/complex_modifications"
    if [[ -d "$HOME/.config/karabiner" ]]; then
      mkdir -p "$dir"
      for rule in "$here"/karabiner/*.json; do
        ln -sfn "$rule" "$dir/$(basename "$rule")"
      done
      echo "Karabiner rules linked: enable them under Complex Modifications > Add predefined rule"
    else
      echo "Karabiner not found; skipping shortcuts"
    fi
    command -v m1ddc >/dev/null || command -v betterdisplaycli >/dev/null \
      || echo "no DDC tool found: brew install m1ddc"
    ;;
  Linux)
    bindings="$HOME/.config/hypr/bindings.conf"
    if [[ -f "$bindings" ]] && ! grep -qF "$marker" "$bindings"; then
      cat >> "$bindings" <<BINDS

$marker
bindd = SUPER CTRL ALT SHIFT, 8, Monitor input USB-C, exec, ~/scripts/tools/monitor-switch.sh usb-c
bindd = SUPER CTRL ALT SHIFT, 9, Monitor input DisplayPort, exec, ~/scripts/tools/monitor-switch.sh dp
bindd = SUPER CTRL ALT SHIFT, 0, Monitor input HDMI, exec, ~/scripts/tools/monitor-switch.sh hdmi
BINDS
      echo "added Hyprland bindings to $bindings"
    fi
    command -v ddcutil >/dev/null || echo "ddcutil not found: sudo pacman -S ddcutil"

    # Caps Lock as Super+Ctrl+Alt+Shift, so the Caps shortcuts match macOS.
    command -v keyd >/dev/null || sudo pacman -S --needed --noconfirm keyd
    if [[ ! -e /etc/keyd/default.conf ]]; then
      sudo install -Dm644 "$here/keyd/default.conf" /etc/keyd/default.conf
      sudo systemctl enable --now keyd
      echo "keyd installed: Caps Lock is now Super+Ctrl+Alt+Shift"
    elif ! cmp -s "$here/keyd/default.conf" /etc/keyd/default.conf; then
      echo "/etc/keyd/default.conf differs from $here/keyd/default.conf; merge by hand, then: sudo keyd reload"
    fi
    ;;
esac
