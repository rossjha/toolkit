import { clockIn, dayShift, gmtOffset, zonedInstant, type Zone } from "../shared/settings.ts";
import { h } from "./dom.ts";

const BUTTON = "[aria-label='Check time']";

/** The browser's own zone, e.g. "Europe/London". */
function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * "Check time": pick a time in one of your zones and see it in all of them, on the day you're viewing.
 * Built once and kept outside the page's redraws, so typing into it is never interrupted.
 */
export function checkTimePanel(): {
  el: HTMLElement;
  isOpen: () => boolean;
  toggle: (anchor: HTMLElement | null) => void;
  update: (zones: Zone[], date: string) => void;
  rows: (ms: number, date: string) => HTMLElement[];
} {
  let zones: Zone[] = [];
  let date = "";
  const time = h("input", { type: "time", class: "check-time-input", "aria-label": "Time" }) as HTMLInputElement;
  const from = h("select", { class: "check-time-select", "aria-label": "In time zone" }) as HTMLSelectElement;
  const list = h("div", { class: "zone-rows" });
  const now = h("button", { class: "link-btn", title: "Fill in the time now" }, "now") as HTMLButtonElement;
  const el = h(
    "div",
    { class: "check-time", role: "dialog", "aria-label": "Check time", hidden: true },
    h("div", { class: "check-time-head" }, time, h("span", { class: "text-muted" }, "in"), from, now),
    list,
  );

  const isOpen = (): boolean => el.hidden === false;

  const rows = (ms: number, day: string): HTMLElement[] =>
    zones.map((z) => {
      const shift = dayShift(ms, z.tz, day);
      return h(
        "div",
        { class: `zone-row${z.ic ? " ic" : ""}` },
        h("span", { class: "zone-name" }, z.name),
        h("span", { class: "zone-time" }, clockIn(ms, z.tz)),
        h("span", { class: "zone-offset" }, gmtOffset(ms, z.tz)),
        h("span", { class: "zone-shift" }, shift),
      );
    });

  const draw = (): void => {
    if (!isOpen() || !zones.length) return;
    const [hh, mm] = (time.value || "00:00").split(":").map(Number);
    list.replaceChildren(...rows(zonedInstant(date, hh * 60 + mm, from.value), date));
  };

  const setNow = (): void => {
    time.value = clockIn(Date.now(), from.value);
    draw();
  };

  const place = (): void => {
    const anchor = document.querySelector<HTMLElement>(BUTTON);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + window.scrollY + 6}px`;
    el.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
  };

  const setOpen = (open: boolean): void => {
    el.hidden = !open;
    const btn = document.querySelector<HTMLElement>(BUTTON);
    btn?.setAttribute("aria-expanded", String(open));
    btn?.classList.toggle("on", open);
    if (!open) return;
    if (!time.value) setNow();
    place();
    draw();
    time.focus();
  };

  time.addEventListener("input", draw);
  from.addEventListener("change", draw);
  now.addEventListener("click", setNow);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      document.querySelector<HTMLElement>(BUTTON)?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (isOpen() && !el.contains(e.target as Node)) setOpen(false);
  });
  window.addEventListener("resize", () => isOpen() && place());

  return {
    el,
    rows,
    isOpen,
    toggle: () => setOpen(!isOpen()),
    update: (z, d) => {
      const changed = JSON.stringify(z) !== JSON.stringify(zones);
      zones = z;
      date = d;
      if (changed) {
        const keep = from.value;
        from.replaceChildren(...zones.map((zone) => h("option", { value: zone.tz }, zone.name)));
        // Start in the zone you're in, if it's one of yours.
        const pick = zones.find((zone) => zone.tz === keep) ?? zones.find((zone) => zone.tz === localZone()) ?? zones[0];
        if (pick) from.value = pick.tz;
      }
      if (!zones.length) setOpen(false);
      else if (isOpen()) {
        place();
        draw();
      }
    },
  };
}
