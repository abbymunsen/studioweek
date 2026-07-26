import type { ClassInstance, Level } from "../../../src/core/schema.ts";
import type { App } from "../app.ts";
import { allTeachers, groupedTags } from "../filter.ts";
import { el, pad2 } from "../ui.ts";
import { period, wallTime, type Period } from "../time.ts";

/** Filter chip rows, shared between the desktop board and the mobile panel. */

const PERIODS: Period[] = ["MORNING", "MIDDAY", "EVENING"];
// Local copy (type-checked against the schema) so the engine's zod schemas stay out of the bundle.
const LEVEL_OPTIONS: { id: Level; label: string }[] = [
  { id: "beg", label: "BEG" },
  { id: "int", label: "INT" },
  { id: "adv", label: "ADV" },
  { id: "open", label: "OPEN" },
];

function chip(
  label: string,
  on: boolean,
  onclick: () => void,
  opts: { count?: number; swatch?: string; ghosted?: boolean } = {},
): HTMLElement {
  return el(
    "button",
    { class: `chip${on ? " on" : ""}${opts.ghosted ? " ghosted" : ""}`, onclick },
    opts.swatch ? el("span", { class: "sw", style: `background:${opts.swatch}` }) : null,
    label,
    opts.count !== undefined ? el("span", { class: "n" }, pad2(opts.count)) : null,
  );
}

function row(label: string, chips: (HTMLElement | null)[], side: HTMLElement[] = []): HTMLElement {
  return el(
    "div",
    { class: "frow" },
    el("div", { class: "frow-label" }, label),
    el("div", { class: "frow-chips" }, ...chips),
    side.length ? el("div", { class: "frow-side" }, ...side) : null,
  );
}

/** Counts are over the visible week's classes, unfiltered — orientation, not results. */
export function filterRows(app: App, weekClasses: ClassInstance[]): HTMLElement[] {
  const f = app.state.filters;
  const { dataset } = app.ctx;
  const rows: HTMLElement[] = [];

  const countBy = (pred: (c: ClassInstance) => boolean) => weekClasses.filter(pred).length;
  const toggle = <K extends "tags" | "studios" | "teachers" | "levels" | "times">(key: K, v: string) => {
    const list = f[key] as string[];
    app.setFilters({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  };

  for (const [group, tags] of groupedTags(dataset)) {
    rows.push(
      row(
        group,
        tags.map((t) =>
          chip(t, f.tags.includes(t), () => toggle("tags", t), {
            count: countBy((c) => c.tags.includes(t)),
            ghosted: t === "fringe",
          }),
        ),
      ),
    );
  }

  rows.push(
    row(
      "studios",
      dataset.studios.map((s) =>
        chip(s.short, f.studios.includes(s.id), () => toggle("studios", s.id), {
          count: countBy((c) => c.studio === s.id),
          swatch: s.color,
        }),
      ),
    ),
  );

  const followed = new Set([...app.ctx.followedTeachers].map((k) => k.split("|")[1]!));
  rows.push(
    row("teachers", [
      chip("★ FOLLOWED", f.followedOnly, () => app.setFilters({ followedOnly: !f.followedOnly })),
      ...allTeachers(dataset).map((t) =>
        chip(followed.has(t) ? `★ ${t}` : t, f.teachers.includes(t), () => toggle("teachers", t), {
          count: countBy((c) => c.teacher === t),
        }),
      ),
    ]),
  );

  rows.push(
    row("level", [
      ...LEVEL_OPTIONS.map(({ id, label }) =>
        chip(label, f.levels.includes(id), () => toggle("levels", id), {
          count: countBy((c) => c.level === id),
        }),
      ),
    ]),
  );

  rows.push(
    row("time", [
      ...PERIODS.map((p) =>
        chip(p, f.times.includes(p), () => toggle("times", p), {
          count: countBy((c) => period(wallTime(c.start)) === p),
        }),
      ),
    ]),
  );

  if (dataset.pins.length) {
    const val = f.maxMins ?? 45;
    rows.push(
      row("distance", [
        ...dataset.pins.map((p) =>
          chip(p.label, f.pin === p.id, () =>
            app.setFilters(f.pin === p.id ? { pin: null, maxMins: null } : { pin: p.id, maxMins: val }),
          ),
        ),
        el(
          "span",
          { class: "distance-slider" },
          el("input", {
            type: "range",
            min: "10",
            max: "90",
            step: "5",
            value: String(val),
            disabled: !f.pin,
            oninput: (e: Event) => app.setFilters({ maxMins: Number((e.target as HTMLInputElement).value) }),
          }),
          el("span", { class: "distance-val" }, f.pin ? `≤ ${val} MIN` : "— MIN"),
        ),
      ]),
    );
  }

  rows.push(
    row("show", [
      chip("★ STARRED", f.starredOnly, () => app.setFilters({ starredOnly: !f.starredOnly }), {
        count: app.ctx.stars.size,
      }),
      chip("UNTAGGED", f.untagged, () => app.setFilters({ untagged: !f.untagged }), {
        count: countBy((c) => c.untaggedName),
      }),
      chip("SHOW FRINGE", f.fringe, () => app.setFilters({ fringe: !f.fringe }), {
        count: countBy((c) => c.tags.includes("fringe")),
        ghosted: true,
      }),
    ]),
  );

  return rows;
}

export function presetRow(app: App): HTMLElement {
  const chips: HTMLElement[] = app.presets.map((p) => {
    const on = JSON.stringify(p.filters) === JSON.stringify(app.state.filters);
    const c = chip(p.name, on, () => app.applyPreset(p));
    c.append(
      el("span", {
        class: "n",
        title: "delete preset",
        onclick: (e: Event) => {
          e.stopPropagation();
          app.deletePreset(p.name);
        },
      }, "×"),
    );
    return c;
  });
  return row("presets", chips, [
    chip("+ SAVE", false, () => app.savePreset()),
    chip("RESET", false, () => app.resetFilters()),
  ]);
}
