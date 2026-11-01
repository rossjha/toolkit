// The block dialog's links and notes: what it loads from a block's child lines, and which of them the user changed.
// No DOM here, so the comparison is unit-tested. Raw input values are compared with the raw loaded values, so an
// untouched hand-formatted child (an empty label, padded label, trailing spaces) never counts as an edit.

import type { BlockChild } from "../shared/day.ts";
import type { BlockEdit } from "../shared/schedule.ts";

export interface LinkInput {
  label: string;
  url: string;
}

export interface Children {
  links: LinkInput[];
  /** One note per line, two spaces for each level below the first. */
  notes: string;
}

export function loadedChildren(children: readonly BlockChild[]): Children {
  return {
    links: children.filter((c) => c.kind === "link").map((c) => ({ label: c.label ?? c.text, url: c.url ?? c.text })),
    notes: children
      .filter((c) => c.kind === "note")
      .map((c) => `${"  ".repeat(Math.max(0, c.depth - 1))}${c.text}`)
      .join("\n"),
  };
}

/** The links/notes part of the edit: each is set only if the user changed it, and then written in tidy form. */
export function childEdits(loaded: Children, current: Children): Pick<BlockEdit, "links" | "notes"> {
  const edit: Pick<BlockEdit, "links" | "notes"> = {};
  const sameLinks =
    current.links.length === loaded.links.length &&
    current.links.every((l, i) => l.label === loaded.links[i].label && l.url === loaded.links[i].url);
  if (!sameLinks) {
    edit.links = current.links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.url)
      .map((l) => ({ label: l.label || l.url, url: l.url }));
  }
  if (current.notes !== loaded.notes) edit.notes = current.notes;
  return edit;
}
