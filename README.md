# tools

Portable work tools: apps and Claude Code skills that move between machines and jobs.
Nothing personal or employer-specific lives here. Machine and job settings stay in `~/.config/tools/`.

## Apps

| App | What it is |
|---|---|
| [`apps/atlassian-notes`](apps/atlassian-notes) | Local Jira refinement notes app |
| [`apps/meet-toolkit`](apps/meet-toolkit) | Countdown timer plus markdown scratchpad to keep beside Google Meet |

Each app keeps its own scripts. From the root, `npm test` and `npm run typecheck` run them across every app.

## Claude Code plugin

One plugin, `tools`, holds every skill:

| Skill | Use |
|---|---|
| `/tools:fortnightly-planning` | Drafts a two-week plan (Top 5, time check, meeting prep) for you to edit |
| `/tools:learn` | Learning coach: plan a topic, run sessions, grill, debrief |

Install:

```
/plugin marketplace add rossjha/tools
/plugin install tools@tools
```

On first run, each skill creates its settings file in `~/.config/tools/<skill>.md` from the `config.example.md` in its folder.
