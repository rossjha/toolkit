// Keeps the notes editor and the scratchpad file in step: debounced saves, our own echoes ignored,
// external changes pulled in when nothing is unsaved, and typing kept (as a server-side conflict) when it is.

export const SAVE_MS = 500;
export const MAX_WAIT_MS = 1000;
export const RETRY_MS = 3000;

export type SaveState = "saving" | "saved" | "failed";

export interface SyncDeps {
  getText(): string;
  /** Replace the editor's content with a newer version of the file. */
  setText(text: string): void;
  request(method: "GET" | "PUT", body?: string): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  onSaveState(state: SaveState): void;
  onConflict(conflictFile: string): void;
}

export interface Sync {
  load(): Promise<{ text: string; path: string }>;
  /** Call on every edit. */
  edited(): void;
  /** Save now (blur). */
  save(): Promise<void>;
  /** The file changed on disk. */
  pull(): Promise<void>;
  dirty(): boolean;
  /** What a last-chance save on tab close should send, or null. */
  unsaved(): { text: string; base: string } | null;
}

export function createSync(deps: SyncDeps): Sync {
  let synced = ""; // the text we know the file holds
  let inFlight: string | null = null; // the text being saved
  let repull = false; // a file change arrived mid-save; look again afterwards
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsavedSince: number | null = null; // first edit not yet sent


  const dirty = (): boolean => deps.getText() !== synced;

  /** Debounced, but never later than MAX_WAIT_MS after the first unsent edit, so steady typing still saves. */
  function schedule(ms = SAVE_MS): void {
    const now = Date.now();
    unsavedSince ??= now;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), Math.min(ms, Math.max(0, unsavedSince + MAX_WAIT_MS - now)));
  }

  async function save(): Promise<void> {
    clearTimeout(timer);
    if (inFlight !== null || !dirty()) return;
    const text = deps.getText();
    inFlight = text;
    unsavedSince = null;
    deps.onSaveState("saving");
    let ok = false;
    try {
      const res = await deps.request("PUT", JSON.stringify({ text, base: synced }));
      if (!res.ok) throw new Error("save failed");
      const body = (await res.json()) as { conflictFile: string | null };
      synced = text;
      ok = true;
      deps.onSaveState("saved");
      if (body.conflictFile) deps.onConflict(body.conflictFile);
    } catch {
      deps.onSaveState("failed");
    } finally {
      inFlight = null;
    }
    if (repull) {
      repull = false;
      void pull();
    } else if (dirty()) {
      clearTimeout(timer);
      timer = setTimeout(() => void save(), ok ? 0 : RETRY_MS); // a failed save waits; it isn't new typing
    }
  }

  async function pull(): Promise<void> {
    if (inFlight !== null) {
      repull = true;
      return;
    }
    const res = await deps.request("GET").catch(() => null);
    if (!res?.ok) return;
    const { text } = (await res.json()) as { text: string };
    if (text === synced) {
      if (dirty()) schedule(); // our own echo; anything typed since still needs saving
      return;
    }
    if (dirty()) {
      void save(); // typing wins; the server keeps their version as a conflict file
      return;
    }
    synced = text;
    deps.setText(text);
  }

  return {
    async load() {
      const res = await deps.request("GET");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { text: string; path: string };
      synced = data.text;
      deps.setText(data.text);
      deps.onSaveState("saved");
      return data;
    },
    edited: () => schedule(),
    save,
    pull,
    dirty,
    unsaved: () => (dirty() ? { text: deps.getText(), base: synced } : null),
  };
}
