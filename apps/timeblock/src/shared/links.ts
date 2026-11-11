// Links inside a line of text: `[label](url)` shows as just the label, and a bare URL shows as itself.

export type TextPart = { text: string } | { label: string; url: string };

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<>]+/g;
/** Punctuation that ends a sentence rather than the URL ("see https://x.com/a."). */
const TRAILING = /[.,;:!?'")\]]+$/;

export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    let start = m.index, end = start + m[0].length;
    let part: TextPart;
    if (m[1] !== undefined) part = { label: m[1], url: m[2] };
    else {
      const url = m[0].replace(TRAILING, "");
      end = start + url.length;
      part = { label: url, url };
    }
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push(part);
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
