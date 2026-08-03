import type { StudioDirectoryEntry } from "../../../src/core/schema.ts";
import type { App } from "../app.ts";
import { el, pad2 } from "../ui.ts";
import { wallDate, wallTime } from "../time.ts";
import { themeButton } from "./board.ts";

/** The studio directory: one card per studio — the human-authored record, rendered. */

function pricingLine(s: StudioDirectoryEntry): string {
  const parts: string[] = [];
  if (s.pricing.drop_in !== undefined) parts.push(`DROP-IN $${s.pricing.drop_in}`);
  for (const p of s.pricing.packs) parts.push(`${p.classes}-PACK $${p.price} ($${(p.price / p.classes).toFixed(0)}/CL)`);
  return parts.join(" · ") || "—";
}

function card(app: App, s: StudioDirectoryEntry): HTMLElement {
  const minutes = app.ctx.dataset.pins
    .map((p) => (s.minutesFrom[p.id] !== undefined ? `${p.label} ${s.minutesFrom[p.id]}′` : null))
    .filter(Boolean)
    .join(" · ");
  const classCount = app.ctx.dataset.classes.filter((c) => c.studio === s.id).length;

  return el(
    "div",
    { class: "dircard" },
    el("div", { class: "dircard-spine", style: `background:${s.color}` }),
    el(
      "div",
      { class: "dircard-body" },
      el(
        "div",
        { class: "dircard-head" },
        el("span", { class: "dircard-name" }, s.name),
        el("span", { class: "dircard-code" }, `${s.short} / ${s.hood}`),
      ),
      !s.fetch.ok
        ? el("span", { class: "stale" }, `FEED DOWN — DATA FROM ${s.fetch.fetchedAt.slice(5, 10)}`)
        : null,
      el("div", { class: "dircard-row" }, el("span", { class: "k" }, "WHERE"), el("span", {}, s.address)),
      minutes ? el("div", { class: "dircard-row" }, el("span", { class: "k" }, "MINUTES"), el("span", {}, minutes)) : null,
      el("div", { class: "dircard-row" }, el("span", { class: "k" }, "PRICING"), el("span", {}, pricingLine(s))),
      s.arrivalBufferMins
        ? el("div", { class: "dircard-row" }, el("span", { class: "k" }, "ARRIVE"), el("span", {}, `${s.arrivalBufferMins} MIN EARLY`))
        : null,
      s.teachers.length
        ? el(
            "div",
            { class: "dircard-teachers" },
            el("div", { class: "dircard-row" }, el("span", { class: "k" }, "TEACHERS")),
            ...s.teachers.map((t) =>
              el(
                "div",
                { class: "dircard-teacher" },
                el("span", {}, t.name),
                t.follow ? el("span", { class: "follow" }, "FOLLOWED") : null,
                t.notes ? el("span", { class: "tnotes" }, t.notes) : null,
              ),
            ),
          )
        : null,
      s.notes ? el("div", { class: "dircard-notes" }, s.notes) : null,
      el(
        "div",
        { class: "dircard-actions" },
        el(
          "button",
          {
            class: "chip",
            onclick: () => {
              app.setFilters({ studios: [s.id] });
              app.go("board");
            },
          },
          `VIEW ${pad2(classCount)} CLASSES`,
        ),
        s.links.site
          ? el("a", { class: "chip", href: s.links.site, target: "_blank", rel: "noreferrer", style: "border-bottom:1px solid var(--line)" }, "SITE ↗")
          : null,
      ),
    ),
  );
}

export function renderDirectory(app: App): HTMLElement {
  const { dataset } = app.ctx;
  const synced = `${wallDate(dataset.generatedAt)} ${wallTime(dataset.generatedAt)}`;
  return el(
    "div",
    { class: "shell", style: "display:block" },
    el(
      "header",
      { class: "masthead" },
      el(
        "div",
        {},
        el(
          "div",
          { class: "masthead-title", style: "margin-top:0" },
          el("h1", { class: "masthead-date", style: "margin:0" }, `${pad2(dataset.studios.length)} STUDIOS`),
        ),
      ),
      el(
        "div",
        { class: "masthead-right" },
        el(
          "div",
          { class: "navseg" },
          el("a", { href: "#/board" }, "BOARD"),
          el("a", { class: "active", href: "#/directory" }, "DIRECTORY"),
          themeButton(app),
        ),
        el("div", { class: "masthead-status" }, `SYNCED ${synced}`),
      ),
    ),
    el("div", { style: "height:14px" }),
    el("div", { class: "dirgrid" }, ...dataset.studios.map((s) => card(app, s))),
  );
}
