// Categories: the editable list of block kinds, kept in categories.md as `- tag: Label · colour · style`.
// Parsing is forgiving: a line we can't read becomes a warning and is skipped.

export type CategoryStyle = "solid" | "hatched";

export interface Category {
  id: string;
  label: string;
  /** A palette name (e.g. "chart-2"), resolved to a theme variable by categoryColor. */
  color: string;
  style: CategoryStyle;
}

export const PALETTE: readonly string[] = ["accent", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "success", "warn", "danger", "muted", "dim"];

const STYLES: readonly string[] = ["solid", "hatched"];

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: "meeting", label: "Meeting", color: "chart-2", style: "solid" },
  { id: "focus", label: "Focus", color: "accent", style: "hatched" },
  { id: "study", label: "Study", color: "chart-3", style: "hatched" },
  { id: "personal", label: "Personal", color: "success", style: "hatched" },
  { id: "admin", label: "Admin", color: "chart-4", style: "hatched" },
  { id: "break", label: "Break", color: "muted", style: "hatched" },
];

const LIST_LINE = /^\s*[-*]\s+(.*)$/;
const ENTRY = /^([\w-]+)\s*:\s*(.*)$/;

export function parseCategories(text: string): { categories: Category[]; warnings: string[] } {
  const categories: Category[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const item = LIST_LINE.exec(raw);
    if (!item) return; // headings, blank lines and prose are ignored
    const n = i + 1;
    const entry = ENTRY.exec(item[1].trim());
    if (!entry) {
      warnings.push(`Line ${n}: can't read "${raw.trim()}" (expected "- tag: Label · colour · style")`);
      return;
    }
    const id = entry[1].toLowerCase();
    if (seen.has(id)) {
      warnings.push(`Line ${n}: duplicate category "${id}" ignored`);
      return;
    }
    seen.add(id);
    const [labelPart, colourPart, stylePart] = entry[2].split(/[·|]/).map((s) => s.trim());
    let color = "dim";
    if (colourPart) {
      if (PALETTE.includes(colourPart)) color = colourPart;
      else warnings.push(`Line ${n}: unknown colour "${colourPart}" for "${id}", using dim`);
    }
    let style: CategoryStyle = "hatched";
    if (stylePart) {
      if (STYLES.includes(stylePart)) style = stylePart as CategoryStyle;
      else warnings.push(`Line ${n}: unknown style "${stylePart}" for "${id}", using hatched`);
    }
    categories.push({ id, label: labelPart || id, color, style });
  });
  return { categories, warnings };
}

export function formatCategories(cats: readonly Category[]): string {
  return `# Categories\n\n${cats.map((c) => `- ${c.id}: ${c.label} · ${c.color} · ${c.style}\n`).join("")}`;
}

export function findCategory(cats: readonly Category[], id: string): Category | undefined {
  return cats.find((c) => c.id === id);
}

export function categoryColor(c: Category | undefined): string {
  return `var(--${c ? c.color : "dim"})`;
}
