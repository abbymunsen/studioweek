import type { ClassInstance } from "../../../src/core/schema.ts";
import type { App } from "../app.ts";
import { activeFilterCount } from "../state.ts";
import { passes } from "../filter.ts";
import { el, pad2 } from "../ui.ts";
import {
  DAY_FULL,
  DAY_LABELS,
  addDays,
  dayOfMonth,
  isoWeekNumber,
  minutesBetween,
  monthAbbr,
  nyNow,
  overlaps,
  period,
  wallDate,
  wallTime,
  weekRangeLabel,
  weekStart,
  type Period,
} from "../time.ts";
import { filterRows, presetRow } from "./filters.ts";

/** The agenda boards: week columns on desktop, day list on mobile. */

interface WeekData {
  monday: string;
  days: string[];
  todayIdx: number; // -1 if today not in this week
  weekClasses: ClassInstance[]; // all classes this week, unfiltered
  visible: ClassInstance[]; // filtered
  conflicts: Set<string>; // instance ids of starred-vs-starred overlaps
}

export function computeWeek(app: App): WeekData {
  const { date } = nyNow();
  const monday = addDays(weekStart(date), app.state.weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const todayIdx = days.indexOf(date);
  const inWeek = (c: ClassInstance) => wallDate(c.start) >= monday && wallDate(c.start) <= days[6]!;
  const weekClasses = app.ctx.dataset.classes.filter(inWeek);
  const visible = weekClasses.filter((c) => passes(c, app.state.filters, app.ctx));

  const starred = weekClasses.filter((c) => app.ctx.stars.has(c.key));
  const conflicts = new Set<string>();
  for (const a of starred)
    for (const b of starred)
      if (a.id !== b.id && overlaps(a.start, a.end, b.start, b.end)) conflicts.add(a.id);

  return { monday, days, todayIdx, weekClasses, visible, conflicts };
}

function studioOf(app: App, c: ClassInstance) {
  return app.ctx.studiosById.get(c.studio);
}

function staleBadge(app: App, c: ClassInstance): HTMLElement | null {
  const s = studioOf(app, c);
  if (!s || s.fetch.ok) return null;
  return el("span", { class: "stale", title: s.fetch.error ?? "fetch failed" }, `DATA ${s.fetch.fetchedAt.slice(5, 10)}`);
}

function starButton(app: App, c: ClassInstance, cls: string): HTMLElement {
  const on = app.ctx.stars.has(c.key);
  return el(
    "button",
    {
      class: `${cls}${on ? " on" : ""}`,
      "aria-label": on ? "unstar" : "star",
      onclick: (e: Event) => {
        e.stopPropagation();
        app.toggleStar(c.key);
      },
    },
    on ? "★" : "☆",
  );
}

function weekCard(app: App, c: ClassInstance, conflicts: Set<string>): HTMLElement {
  const s = studioOf(app, c);
  const starred = app.ctx.stars.has(c.key);
  return el(
    "div",
    {
      class: `card${starred ? " starred" : ""}`,
      role: "button",
      tabindex: "0",
      onclick: () => app.set({ detail: c.id }),
    },
    el("div", { class: "card-spine", style: `background:${s?.color ?? "#999"}` }),
    el(
      "div",
      { class: "card-body" },
      el(
        "div",
        { class: "card-timerow" },
        el("span", { class: "card-time" }, `${wallTime(c.start)}–${wallTime(c.end)}`),
        el("span", { class: "card-dur" }, `${minutesBetween(c.start, c.end)}′`),
      ),
      el("div", { class: "card-name" }, c.name),
      el(
        "div",
        { class: "card-meta" },
        c.levelRaw ? el("span", { class: "lvl" }, c.levelRaw.toUpperCase()) : null,
        el("span", {}, c.tags.filter((t) => t !== "fringe").slice(0, 2).join(" · ").toUpperCase() || "UNTAGGED"),
        conflicts.has(c.id) ? el("span", { class: "conflict" }, "⚠ OVERLAP") : null,
        staleBadge(app, c),
      ),
      c.teacher ? el("div", { class: "card-teacher" }, c.teacher) : null,
      el(
        "div",
        { class: "card-studio" },
        el("span", {}, s?.short ?? c.studio),
        el("span", { style: "color:var(--ghost)" }, "·"),
        el("span", { class: "ell" }, s?.hood ?? ""),
      ),
    ),
    starButton(app, c, "starbtn"),
  );
}

function dayColumn(app: App, day: string, idx: number, data: WeekData): HTMLElement {
  const list = data.visible
    .filter((c) => wallDate(c.start) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
  const children: HTMLElement[] = [];
  let prev: Period | null = null;
  for (const c of list) {
    const p = period(wallTime(c.start));
    if (p !== prev) {
      children.push(
        el(
          "div",
          { class: "perioddiv" },
          el("span", { class: "perioddiv-label" }, p),
          el("span", { class: "perioddiv-line" }),
          el("span", { class: "perioddiv-count" }, pad2(list.filter((x) => period(wallTime(x.start)) === p).length)),
        ),
      );
      prev = p;
    }
    children.push(weekCard(app, c, data.conflicts));
  }
  return el(
    "div",
    { class: "daycol" },
    el(
      "div",
      { class: `dayhead${idx === data.todayIdx ? " today" : ""}` },
      el(
        "div",
        { class: "dayhead-top" },
        el("span", { class: "dayhead-label" }, DAY_LABELS[idx]!),
        el("span", { class: "dayhead-date" }, dayOfMonth(day)),
      ),
      el("div", { class: "dayhead-count" }, `${pad2(list.length)} CLASSES`),
    ),
    ...children,
    list.length === 0
      ? el("div", { class: "day-empty" }, day < nyNow().date ? "PAST" : "NO CLASSES")
      : null,
    el("div", { style: "flex:1;min-height:24px" }),
  );
}

function legend(app: App): HTMLElement {
  return el(
    "div",
    { class: "legend" },
    ...app.ctx.dataset.studios.map((s) =>
      el(
        "div",
        { class: `legend-item${s.fetch.ok ? "" : " stale-item"}` },
        el("span", { class: "sw", style: `background:${s.color}` }),
        el("span", { class: "code" }, s.short),
        el("span", { class: "name" }, `${s.name.toUpperCase()} / ${s.hood}`),
      ),
    ),
  );
}

export function renderDesktopBoard(app: App): HTMLElement {
  const data = computeWeek(app);
  const { dataset } = app.ctx;
  const synced = `${wallDate(dataset.generatedAt)} ${wallTime(dataset.generatedAt)}`;
  const nav = el(
    "div",
    { class: "navseg" },
    el("button", { onclick: () => app.set({ weekOffset: app.state.weekOffset - 1 }) }, "◀ PREV"),
    el("button", { onclick: () => app.set({ weekOffset: 0 }) }, "TODAY"),
    el("button", { onclick: () => app.set({ weekOffset: app.state.weekOffset + 1 }) }, "NEXT ▶"),
  );

  return el(
    "div",
    { class: "shell" },
    el(
      "header",
      { class: "masthead" },
      el(
        "div",
        {},
        el("div", { class: "masthead-kicker" }, "STUDIOWEEK / AGGREGATED CLASS BOARD"),
        el(
          "div",
          { class: "masthead-title" },
          el("h1", { class: "masthead-date", style: "margin:0;font-size:38px" }, weekRangeLabel(data.monday)),
          el("span", { class: "masthead-wk" }, `WK ${pad2(isoWeekNumber(data.monday))}`),
        ),
      ),
      el(
        "div",
        { class: "masthead-right" },
        el(
          "div",
          { style: "display:flex;gap:6px" },
          el(
            "div",
            { class: "navseg" },
            el("a", { class: "active", href: "#/board" }, "BOARD"),
            el("a", { href: "#/directory" }, "DIRECTORY"),
          ),
          nav,
        ),
        el(
          "div",
          { class: "masthead-status" },
          `${pad2(data.visible.length)} SHOWN / ${data.weekClasses.length} THIS WEEK · ${pad2(dataset.studios.length)} STUDIOS · SYNCED ${synced}`,
        ),
      ),
    ),
    presetRow(app),
    ...filterRows(app, data.weekClasses),
    data.visible.length === 0
      ? el("div", { class: "board-empty" }, "NO CLASSES MATCH THIS FILTER")
      : el("div", { class: "weekgrid" }, ...data.days.map((d, i) => dayColumn(app, d, i, data))),
    el(
      "div",
      { class: "boardfoot" },
      legend(app),
      el("div", {}, "ALL TIMES NEW YORK · BOOKING LINK IS SOURCE OF TRUTH FOR CANCELLATIONS"),
    ),
  );
}

export function renderMobileBoard(app: App): HTMLElement {
  const data = computeWeek(app);
  const f = app.state.filters;
  const day = data.days[app.state.day] ?? data.days[0]!;
  const list = data.visible
    .filter((c) => wallDate(c.start) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
  const nActive = activeFilterCount(f);

  const strip = el(
    "div",
    { class: "mstrip" },
    ...data.days.map((d, i) => {
      const n = data.visible.filter((c) => wallDate(c.start) === d).length;
      return el(
        "button",
        {
          class: `mday${i === app.state.day ? " sel" : i === data.todayIdx ? " today" : ""}`,
          onclick: () => app.set({ day: i }),
        },
        el("span", { class: "mday-label" }, DAY_LABELS[i]!),
        el("span", { class: "mday-date" }, dayOfMonth(d)),
        el("span", { class: "mday-dot", style: `width:${Math.min(20, n * 2.5)}px` }),
      );
    }),
  );

  const rows: HTMLElement[] = [];
  let prev: Period | null = null;
  for (const c of list) {
    const p = period(wallTime(c.start));
    if (p !== prev) {
      rows.push(
        el(
          "div",
          { class: "mperioddiv" },
          el("span", { class: "perioddiv-label" }, p),
          el("span", { class: "perioddiv-line" }),
          el("span", { class: "perioddiv-count" }, pad2(list.filter((x) => period(wallTime(x.start)) === p).length)),
        ),
      );
      prev = p;
    }
    const s = studioOf(app, c);
    const starred = app.ctx.stars.has(c.key);
    rows.push(
      el(
        "div",
        {
          class: `mrow${starred ? " starred" : ""}`,
          "data-start": c.start,
          role: "button",
          onclick: () => app.set({ detail: c.id }),
        },
        el("div", { class: "mrow-spine", style: `background:${s?.color ?? "#999"}` }),
        el(
          "div",
          { class: "mrow-when" },
          el("span", { class: "mrow-start" }, wallTime(c.start)),
          el("span", { class: "mrow-end" }, wallTime(c.end)),
          el("span", { class: "mrow-dur" }, `${minutesBetween(c.start, c.end)}′`),
        ),
        el(
          "div",
          { class: "mrow-body" },
          el("div", { class: "mrow-name" }, c.name),
          el(
            "div",
            { class: "mrow-meta" },
            c.levelRaw ? el("span", { class: "lvl" }, c.levelRaw.toUpperCase()) : null,
            el("span", {}, c.tags.filter((t) => t !== "fringe").slice(0, 2).join(" · ").toUpperCase() || "UNTAGGED"),
            data.conflicts.has(c.id) ? el("span", { class: "conflict" }, "⚠") : null,
            el("span", { style: "color:var(--ghost)" }, "/"),
            el("span", { class: "t" }, c.teacher ?? "—"),
          ),
          el(
            "div",
            { class: "mrow-studio" },
            el("span", { class: "sw", style: `background:${s?.color ?? "#999"}` }),
            el("span", {}, s?.short ?? c.studio),
            el("span", { style: "color:var(--ghost)" }, "·"),
            el("span", { class: "t" }, s?.hood ?? ""),
            staleBadge(app, c),
          ),
        ),
        starButton(app, c, "mrow-star"),
      ),
    );
  }

  const hours = list.length
    ? `${wallTime(list[0]!.start)}–${wallTime(list[list.length - 1]!.end)}`
    : "—";

  return el(
    "div",
    { class: "mshell" },
    el(
      "div",
      { class: "msticky" },
      el(
        "div",
        { class: "mhead" },
        el(
          "div",
          {},
          el("div", { class: "mhead-kicker" }, "STUDIOWEEK / DAY BOARD"),
          el(
            "div",
            { class: "mhead-date" },
            `${DAY_FULL[app.state.day]!.slice(0, 3)} ${dayOfMonth(day)} ${monthAbbr(day)}`,
            el("span", { class: "mhead-wk" }, `WK ${pad2(isoWeekNumber(day))}`),
          ),
        ),
        el(
          "div",
          { class: "mpager" },
          el("button", { onclick: () => app.pageDay(-1) }, "◀"),
          el("button", { onclick: () => app.pageDay(1) }, "▶"),
        ),
      ),
      strip,
      el(
        "div",
        { class: "mfilterbar" },
        el(
          "button",
          { class: `fbtn${nActive ? " on" : ""}`, onclick: () => app.set({ filtersOpen: !app.state.filtersOpen }) },
          "FILTER",
          el("span", { class: "n" }, nActive ? `${pad2(nActive)} ACTIVE` : "ALL"),
          el("span", { class: "caret" }, app.state.filtersOpen ? "▲" : "▼"),
        ),
        el(
          "button",
          { class: `sbtn${f.starredOnly ? " on" : ""}`, onclick: () => app.setFilters({ starredOnly: !f.starredOnly }) },
          `★ ${pad2(app.ctx.stars.size)}`,
        ),
      ),
      app.state.filtersOpen
        ? el(
            "div",
            { class: "mfilterpanel" },
            presetRow(app),
            ...filterRows(app, data.weekClasses),
            el(
              "div",
              { class: "mfilterfoot" },
              el("span", { class: "status" }, `${pad2(data.visible.length)} OF ${data.weekClasses.length} THIS WEEK`),
              el("button", { class: "reset", onclick: () => app.resetFilters() }, "RESET"),
            ),
          )
        : null,
      el(
        "div",
        { class: "mstatus" },
        el("span", {}, `${pad2(list.length)} CLASSES SHOWN${app.state.day === data.todayIdx ? " · TODAY" : ""}`),
        el("span", {}, hours),
      ),
    ),
    el("div", { style: "flex:1;display:flex;flex-direction:column" }, ...rows,
      list.length === 0 ? el("div", { class: "board-empty" }, "NO CLASSES MATCH THIS FILTER") : null),
    el(
      "div",
      { class: "mfoot" },
      legend(app),
      el(
        "div",
        { style: "display:flex;gap:14px" },
        el("a", { href: "#/directory", class: "mono", style: "font-size:9.5px;letter-spacing:.15em" }, "DIRECTORY"),
      ),
      el("div", { class: "mfoot-note" }, "ALL TIMES NEW YORK · SUBJECT TO CHANGE · BOOK VIA STUDIO"),
    ),
  );
}
