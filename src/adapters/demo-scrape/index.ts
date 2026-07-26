import { z } from "zod";
import type { FetchContext, PlatformAdapter, RawClassInstance } from "../types.ts";
import type { StudioConfig } from "../../core/schema.ts";
import { instancesForSite } from "../synthetic.ts";

/**
 * Synthetic platform #2: a booking site with no API — the schedule only exists
 * as rendered HTML. The generated markup mimics the shape scrapers actually
 * face (day sections, 12-hour times, data attributes), and the adapter parses
 * it back out. Times are naive locals, exercising the naive+timezone path
 * through normalize. A real scrape adapter would get the HTML via ctx.page()
 * (Playwright) or ctx.http.text(); the parsing below is the part that carries.
 */

const ParamsSchema = z.object({ site: z.number().int().min(0) });

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function renderSchedulePage(site: number, windowStart: string, windowEnd: string): string {
  const byDate = new Map<string, string[]>();
  for (const s of instancesForSite(site, windowStart, windowEnd)) {
    const rows = byDate.get(s.date) ?? [];
    rows.push(
      `<tr class="session" data-sid="${s.sourceId}">` +
        `<td class="when">${to12h(s.time)}</td><td class="len">${s.mins} min</td>` +
        `<td class="what">${s.name}</td><td class="who">${s.teacher}</td>` +
        `<td class="lvl">${s.levelRaw}</td>` +
        `<td><a class="book" href="https://booking.example/demo-scrape/${site}/${s.sourceId}">Book</a></td></tr>`,
    );
    byDate.set(s.date, rows);
  }
  const sections = [...byDate.entries()].map(
    ([date, rows]) => `<section class="day" data-date="${date}"><h2>${date}</h2><table>${rows.join("")}</table></section>`,
  );
  return `<html><body><main id="schedule">${sections.join("\n")}</main></body></html>`;
}

function parse12h(s: string): string {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(s);
  if (!m) throw new Error(`unparseable time: "${s}"`);
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function parseSchedulePage(html: string): RawClassInstance[] {
  const out: RawClassInstance[] = [];
  for (const day of html.matchAll(/<section class="day" data-date="([\d-]+)">([\s\S]*?)<\/section>/g)) {
    const [, date, body] = day as unknown as [string, string, string];
    for (const row of body.matchAll(
      /<tr class="session" data-sid="([^"]+)"><td class="when">([^<]+)<\/td><td class="len">(\d+) min<\/td><td class="what">([^<]*)<\/td><td class="who">([^<]*)<\/td><td class="lvl">([^<]*)<\/td><td><a class="book" href="([^"]+)"/g,
    )) {
      const [, sid, when, len, what, who, lvl, href] = row;
      out.push({
        name: what!,
        start: `${date}T${parse12h(when!)}`, // naive local; timezone left to the default home zone
        durationMins: Number(len),
        teacher: who || undefined,
        levelRaw: lvl || undefined,
        bookingUrl: href!,
        sourceId: sid!,
      });
    }
  }
  return out;
}

const adapter: PlatformAdapter = {
  id: "demo-scrape",
  async fetch(studio: StudioConfig, ctx: FetchContext): Promise<RawClassInstance[]> {
    const { site } = ParamsSchema.parse(studio.platform_params);
    ctx.log(`demo-scrape: site ${site}, window ${ctx.window.start}..${ctx.window.end}`);
    const html = renderSchedulePage(site, ctx.window.start, ctx.window.end);
    return parseSchedulePage(html);
  },
};

export default adapter;
