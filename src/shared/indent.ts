/** Indents (or outdents) by two spaces every line the selection touches, and keeps the selection on the same text. */
export function indentLines(value: string, selStart: number, selEnd: number, outdent: boolean): { value: string; selStart: number; selEnd: number } {
  const from = selStart === 0 ? 0 : value.lastIndexOf("\n", selStart - 1) + 1;
  // A selection that ends at the start of a line doesn't touch that line.
  const last = selEnd > selStart ? selEnd - 1 : selEnd;
  const nl = value.indexOf("\n", last);
  const to = nl === -1 ? value.length : nl;
  let start = selStart;
  let end = selEnd;
  let pos = from;
  const lines = value.slice(from, to).split("\n").map((line) => {
    const removed = outdent ? Math.min(2, line.length - line.trimStart().length) : 0;
    const shift = (p: number): number => (p < pos ? 0 : outdent ? Math.max(-removed, pos - p) : 2);
    start += shift(selStart);
    end += shift(selEnd);
    pos += line.length + 1;
    return outdent ? line.slice(removed) : "  " + line;
  });
  return { value: value.slice(0, from) + lines.join("\n") + value.slice(to), selStart: start, selEnd: end };
}
