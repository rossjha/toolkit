// Outliner keys for a plain textarea: Enter continues bullets, Tab / Shift+Tab indent and outdent.
// Pure text-in, text-out so the browser code only applies the result.

export interface EditResult {
  text: string;
  selStart: number;
  selEnd: number;
}

const INDENT = "  ";
const BULLET = /^(\s*)([-*+]) (\[[ xX]\] )?(.*)$/;

const lineStart = (text: string, i: number): number => text.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (text: string, i: number): number => {
  const n = text.indexOf("\n", i);
  return n === -1 ? text.length : n;
};

/** The edit for Enter, or null to let the browser insert a plain newline. */
export function onEnter(text: string, selStart: number, selEnd: number): EditResult | null {
  if (selStart !== selEnd) return null;
  const start = lineStart(text, selStart);
  const end = lineEnd(text, selStart);
  const m = BULLET.exec(text.slice(start, end));
  if (!m) return null;
  const [, indent, marker, box] = m;
  const prefix = (ind: string): string => `${ind}${marker} ${box ? "[ ] " : ""}`;

  if (!m[4].trim()) {
    // Empty bullet: step out a level, or end the list at the top level.
    const replacement = indent.length ? prefix(indent.slice(INDENT.length)) : "";
    const out = text.slice(0, start) + replacement + text.slice(end);
    const caret = start + replacement.length;
    return { text: out, selStart: caret, selEnd: caret };
  }
  // At or before the end of the marker, Enter just opens a line above: no new marker.
  if (selStart <= start + indent.length + marker.length + 1 + (box?.length ?? 0)) return null;
  const insert = `\n${prefix(indent)}`;
  const caret = selStart + insert.length;
  return { text: text.slice(0, selStart) + insert + text.slice(selStart), selStart: caret, selEnd: caret };
}

/** Indents (or outdents) every line the selection touches by one level. */
export function onTab(text: string, selStart: number, selEnd: number, outdent: boolean): EditResult {
  const start = lineStart(text, selStart);
  const end = lineEnd(text, selEnd);
  const lines = text.slice(start, end).split("\n");
  const changed = lines.map((l) => (outdent ? l.replace(/^ {1,2}/, "") : INDENT + l));

  // Map an old position to the new text: earlier lines' changes plus its own line's, never before its line start.
  const move = (pos: number): number => {
    let oldLine = start;
    let newLine = start;
    for (let i = 0; i < lines.length; i++) {
      if (pos <= oldLine + lines[i].length) {
        return Math.max(newLine, pos + (newLine - oldLine) + changed[i].length - lines[i].length);
      }
      oldLine += lines[i].length + 1;
      newLine += changed[i].length + 1;
    }
    return pos;
  };
  return { text: text.slice(0, start) + changed.join("\n") + text.slice(end), selStart: move(selStart), selEnd: move(selEnd) };
}
