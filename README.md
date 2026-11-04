# toolkit

Portable work tools: apps and Claude Code skills that move between machines and jobs.
Nothing personal or employer-specific lives here. Machine and job settings stay in `~/.config/tools/`.

## Apps

| App | What it is |
|---|---|
| [`apps/atlassian-notes`](apps/atlassian-notes) | Local Jira refinement notes app |
| [`apps/timeblock`](apps/timeblock) | Time-blocking day sheet from a markdown file per day |
| [`apps/meet-toolkit`](apps/meet-toolkit) | Countdown timer plus markdown scratchpad to keep beside Google Meet |

Each app opens at its own `*.localhost` name (`notes.localhost:4317`, `timeblock.localhost:4318`, `meet.localhost:4319`). Chrome keeps zoom per host name, ignoring the port, so this gives each app its own zoom level. Each app keeps its own scripts. From the root, `npm test` and `npm run typecheck` run them across every app.

## Claude Code plugin

One plugin, `tools`, holds every skill:

| Skill | Use |
|---|---|
| `/tools:fortnightly-planning` | Drafts a two-week plan (Top 5, time check, meeting prep) for you to edit |
| `/tools:learn` | Learning coach: plan a topic, run sessions, grill, debrief |

Install:

```
/plugin marketplace add rossjha/toolkit
/plugin install tools@tools
```

On first run, each skill creates its settings file in `~/.config/tools/<skill>.md` from the `config.example.md` in its folder.

## Scripts

Shell scripts for macOS and Linux. `scripts/install.sh` links the folder to `~/scripts/tools`, sources `aliases.sh` from your shell rc file and sets up keyboard shortcuts. You can run it again safely.

| Script | Use | Alias | Shortcut |
|---|---|---|---|
| `monitor-switch.sh usb-c\|dp\|hdmi` | Switches the monitor input over DDC/CI | `m1` / `m2` / `m3` | macOS: Caps+8/9/0 (Karabiner, Caps as Shift+Ctrl+Opt+Cmd) · Omarchy: Caps+8/9/0 (keyd, Caps as Super+Ctrl+Alt+Shift) |

`monitor-switch.sh` needs a DDC tool: `brew install m1ddc` on macOS (it falls back to `betterdisplaycli`), and `ddcutil` on Linux (load `i2c-dev` and add yourself to the `i2c` group). On Linux, `install.sh` also installs keyd to make Caps Lock the same modifier set; this takes Caps away from Omarchy's Compose key, so set `kb_options = compose:ralt` in `~/.config/hypr/input.conf` if you use it. On macOS, turn on "Caps Lock as hyper" and "Monitor input switch" in Karabiner under Complex Modifications > Add predefined rule.

## Templates

[`templates/obsidian`](templates/obsidian) holds Obsidian templates (fortnightly plan, meeting audit, slipbox permanent and literature notes). Copy them into a vault by hand.
