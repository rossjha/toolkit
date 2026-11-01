// Drag a block's body to move it, or its bottom handle to resize it, with a live preview and a ghost at the original spot.
// Nothing happens until the pointer has moved a few pixels, so a click (open the Meet link) and a double-click (dialog) still work.

import { dragRange, type DragMode } from "./drag-range.ts";

export interface DragOptions {
  start: number;
  end: number; // minutes
  pxPerMinute: number; // SLOT_PX / 30
  onPreview(start: number, end: number): void;
  onCommit(start: number, end: number): void;
  onCancel(): void;
}

const THRESHOLD_PX = 4;
const EDGE_PX = 40; // how close to the window's top or bottom edge the pointer must be to scroll it
const EDGE_SPEED = 12; // px per frame at the very edge

let active = false;

export function isDragging(): boolean {
  return active;
}

export function attachDrag(el: HTMLElement, handle: HTMLElement, opts: DragOptions): void {
  el.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || active || down.ctrlKey || down.metaKey) return;
    const mode: DragMode = handle.contains(down.target as Node) ? "resize" : "move";
    const pointer = down.pointerId;
    const originY = down.clientY + window.scrollY; // page coordinates, so scrolling mid-drag counts as moving
    const originX = down.clientX;
    const top = parseFloat(el.style.top) || 0;
    const height = parseFloat(el.style.height) || el.offsetHeight;
    let clientY = down.clientY;
    let started = false;
    let range = { start: opts.start, end: opts.end };
    let ghost: HTMLElement | null = null;
    let scrollFrame = 0;

    const update = (): void => {
      const delta = (clientY + window.scrollY - originY) / opts.pxPerMinute;
      const next = dragRange(mode, opts.start, opts.end, delta);
      if (next.start === range.start && next.end === range.end) return;
      range = next;
      el.style.top = `${top + (range.start - opts.start) * opts.pxPerMinute}px`;
      el.style.height = `${height + (range.end - range.start - (opts.end - opts.start)) * opts.pxPerMinute}px`;
      opts.onPreview(range.start, range.end);
    };

    const onScroll = (): void => {
      if (started) update();
    };

    const autoScroll = (): void => {
      const fromBottom = window.innerHeight - clientY;
      const step = clientY < EDGE_PX ? -(EDGE_PX - clientY) : fromBottom < EDGE_PX ? EDGE_PX - fromBottom : 0;
      if (step) window.scrollBy(0, Math.round((step / EDGE_PX) * EDGE_SPEED)); // the scroll event updates the preview
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const begin = (): void => {
      started = true;
      active = true;
      ghost = document.createElement("div");
      ghost.className = "ghost";
      ghost.style.cssText = el.style.cssText;
      el.before(ghost);
      el.classList.add("dragging");
      document.body.classList.add(mode === "move" ? "drag-move" : "drag-resize");
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    /** `released`: the button is already up (a drop); after Esc it is still down and its click is yet to come. */
    const end = (released: boolean): void => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onAbort);
      el.removeEventListener("lostpointercapture", onAbort);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKey, true);
      if (el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      if (!started) return;
      cancelAnimationFrame(scrollFrame);
      ghost?.remove();
      el.classList.remove("dragging");
      document.body.classList.remove("drag-move", "drag-resize");
      active = false;
      // The click that follows a real drag must not open the Meet link. It comes in the same task as the pointerup.
      const swallow = (e: Event): void => {
        e.stopPropagation();
        e.preventDefault();
      };
      const stopSwallowing = (): void => void setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      window.addEventListener("click", swallow, { capture: true, once: true });
      if (released) stopSwallowing();
      else {
        window.addEventListener("pointerup", stopSwallowing, { capture: true, once: true });
        // Released outside the window: no pointerup reaches us, but a fresh press's click is never the drag's.
        window.addEventListener("pointerdown", () => window.removeEventListener("click", swallow, { capture: true }), { capture: true, once: true });
      }
    };

    const cancel = (released: boolean): void => {
      const wasStarted = started;
      end(released);
      if (!wasStarted) return;
      el.style.top = `${top}px`;
      el.style.height = `${height}px`;
      opts.onCancel();
    };

    function onMove(e: PointerEvent): void {
      if (e.pointerId !== pointer) return;
      clientY = e.clientY;
      if (!started) {
        if (Math.hypot(e.clientX - originX, clientY + window.scrollY - originY) < THRESHOLD_PX) return;
        begin();
      }
      update();
    }

    function onUp(e: PointerEvent): void {
      if (e.pointerId !== pointer) return;
      if (!started) return end(true);
      const unchanged = range.start === opts.start && range.end === opts.end;
      end(true);
      if (unchanged) opts.onCancel();
      else opts.onCommit(range.start, range.end);
    }

    function onAbort(e: PointerEvent): void {
      if (e.pointerId === pointer) cancel(true); // pointercancel, or capture lost: no click follows
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape" || !started) return;
      e.preventDefault();
      e.stopPropagation();
      cancel(false);
    }

    el.setPointerCapture(pointer);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onAbort);
    el.addEventListener("lostpointercapture", onAbort);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKey, true);
  });
}
