# tools monorepo: design

**Date:** 2026-11-01 · **Status:** approved in chat

## Intent

One repo of work tools that goes from job to job: clone it, install the plugin, done.
It's private for now and may go public later, so nothing personal or employer-specific gets committed.
Personal tools stay elsewhere (claude-config).

## Shape

- `apps/<name>`: standalone Node apps under npm workspaces. No Turborepo or Nx. Each app keeps its own scripts.
- `plugins/tools`: a single Claude Code plugin holding every skill (`/tools:<skill>`). The repo root is the marketplace.
- Skill settings live in `~/.config/tools/<skill>.md`, created from each skill's `config.example.md`. A plugin update replaces the plugin's own files, so settings can't live inside it.

## Contents and order

1. Skeleton, marketplace and plugin with `fortnightly-planning` and `learn` (the consolidated learn/plan/grill skill).
2. `apps/atlassian-notes`, imported from `main` with its history kept via `git subtree`. `feat/docker` follows later.
3. `apps/timeblock`, once its in-flight `ui-editing` work lands.
4. `apps/meet-toolkit`: built 2026-11-01 (see `2026-11-01-meet-toolkit-design.md`).

## Before going public

Check every app and all history for personal or employer data.
