# meet-toolkit

A narrow panel to keep next to a Google Meet tab: a countdown for the meeting at the top, and a markdown scratchpad underneath that saves to one file you choose (for example a note in your Obsidian vault), ready for other tools to pick up afterwards.

## Run

Requires Node 22.18 or newer.

```sh
npm install
npm start      # builds, starts on http://meet.localhost:4319 and opens your browser
```

Notes go to `~/meet-toolkit/meet-toolkit-scratchpad.md`. Set `MEET_SCRATCHPAD` to use another file (a leading `~` works), `PORT` to change the port, and `OPEN_BROWSER=false` to stop it opening a tab. The file and its folder are created if they don't exist.

## Run with Docker

```sh
docker compose up -d     # http://meet.localhost:4319, restarts with Docker Desktop
```

To keep the scratchpad somewhere else, put `MEET_DIR=/path/to/folder` in a `.env` file next to `compose.yaml`. That folder is mounted at the same path, and the file inside it is `meet-toolkit-scratchpad.md`. `PORT` works there too. To update: `docker compose up -d --build`. To stop: `docker compose down`.

## Using it

**Timer**
- **Click the time** to type a duration: `27` is 27 minutes, `27:30` is 27 minutes 30 seconds. Enter applies it, Esc cancels.
- **−** and **+** take away or add 5 minutes, even while the timer is running. They fold away when the panel is very narrow.
- **▶** starts the countdown and **❚❚** pauses it.
- **Double-click the time** to reset it to the last duration you set.
- At zero the bar turns red and stays at `00:00`. Pressing + starts it again from 5 minutes.
- The last duration you set is remembered, and a running countdown survives a reload.

**Notes**
- **Enter** on a `-` bullet starts the next bullet, and a `- [ ]` checkbox continues as an unticked one.
- **Enter** on an empty bullet steps out a level, or ends the list.
- **Tab** and **Shift+Tab** indent or outdent the line, or every selected line.
- It saves as you type. Changes made to the file elsewhere (Obsidian, a skill clearing it) show up straight away.
- If the file changes elsewhere while you're mid-typing, your text wins. The other version is kept next to it as `meet-toolkit-scratchpad.conflict.md`, and a notice tells you so.

**Theme:** the button at the bottom right picks one of the ten forge themes. Your browser remembers the choice.
