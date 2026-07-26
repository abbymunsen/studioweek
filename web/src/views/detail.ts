import type { App } from "../app.ts";
import { el } from "../ui.ts";
import { DAY_FULL, isoWeekday, minutesBetween, wallDate, wallTime } from "../time.ts";

/**
 * Class detail overlay. The booking link is the loudest element by design:
 * booking state is not mirrored, so the studio's own page is the source of
 * truth for cancellations and subs.
 */
export function renderDetail(app: App): HTMLElement | null {
  const c = app.ctx.dataset.classes.find((x) => x.id === app.state.detail);
  if (!c) return null;
  const s = app.ctx.studiosById.get(c.studio);
  const starred = app.ctx.stars.has(c.key);
  const close = () => app.set({ detail: null });

  const row = (k: string, v: string) =>
    el("div", { class: "detail-row" }, el("span", { class: "k" }, k), el("span", {}, v));

  return el(
    "div",
    { class: "overlay", onclick: (e: Event) => e.target === e.currentTarget && close() },
    el(
      "div",
      { class: "detail" },
      el(
        "div",
        { class: "detail-head" },
        el("div", { class: "detail-name" }, c.name),
        el("button", { class: "detail-close", onclick: close }, "✕"),
      ),
      el(
        "div",
        { class: "detail-body" },
        row("WHEN", `${DAY_FULL[isoWeekday(wallDate(c.start)) - 1]} ${wallDate(c.start)} · ${wallTime(c.start)}–${wallTime(c.end)} (${minutesBetween(c.start, c.end)}′)`),
        s ? row("STUDIO", `${s.name} — ${s.hood}`) : null,
        s ? row("WHERE", s.address) : null,
        c.teacher ? row("TEACHER", c.teacher) : null,
        c.levelRaw ? row("LEVEL", c.levelRaw.toUpperCase()) : null,
        s?.arrivalBufferMins ? row("ARRIVE", `${s.arrivalBufferMins} MIN EARLY`) : null,
        !s?.fetch.ok && s ? row("NOTE", `FEED DOWN — SCHEDULE DATA FROM ${s.fetch.fetchedAt.slice(0, 10)}`) : null,
        el(
          "div",
          { class: "detail-tags" },
          ...c.tags.map((t) => el("span", { class: "chip" }, t)),
          c.untaggedName ? el("span", { class: "chip ghosted" }, "untagged") : null,
        ),
        el("a", { class: "book", href: c.bookingUrl, target: "_blank", rel: "noreferrer" }, "BOOK / CHECK STATUS ↗"),
        el("div", { class: "detail-note" }, "BOOKING PAGE IS SOURCE OF TRUTH FOR CANCELLATIONS + SUBS"),
        el(
          "div",
          { class: "detail-secondary" },
          el(
            "button",
            { class: "chip" + (starred ? " on" : ""), onclick: () => app.toggleStar(c.key) },
            starred ? "★ STARRED" : "☆ STAR THIS SLOT",
          ),
          el(
            "button",
            {
              class: "chip",
              onclick: () => {
                close();
                app.go("directory");
              },
            },
            "STUDIO PAGE",
          ),
        ),
      ),
    ),
  );
}
