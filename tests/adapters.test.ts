import { describe, expect, it } from "vitest";
import demoApi from "../src/adapters/demo-api/index.ts";
import demoScrape from "../src/adapters/demo-scrape/index.ts";
import { parseSchedulePage, renderSchedulePage } from "../src/adapters/demo-scrape/index.ts";
import { instancesForSite } from "../src/adapters/synthetic.ts";
import type { FetchContext } from "../src/adapters/types.ts";
import type { StudioConfig } from "../src/core/schema.ts";

const ctx: FetchContext = {
  window: { start: "2026-07-27", end: "2026-08-03" },
  http: {
    json: () => Promise.reject(new Error("no network in tests")),
    text: () => Promise.reject(new Error("no network in tests")),
  },
  log: () => {},
};

function studioFor(platform: string, site: number): StudioConfig {
  return {
    id: "test-studio",
    name: "Test Studio",
    short: "TST",
    platform,
    color: "#123456",
    tags: [],
    platform_params: { site },
    address: { text: "x", hood: "X" },
    links: {},
    pricing: { packs: [] },
    arrival_buffer_mins: 0,
    notes: "",
    teachers: [],
    tag_rules: [],
  };
}

describe("synthetic generator", () => {
  it("is deterministic for a fixed window", () => {
    const a = instancesForSite(1, "2026-07-27", "2026-08-03");
    const b = instancesForSite(1, "2026-07-27", "2026-08-03");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("stays inside the window", () => {
    const a = instancesForSite(1, "2026-07-27", "2026-08-03");
    for (const s of a) {
      expect(s.date >= "2026-07-27").toBe(true);
      expect(s.date < "2026-08-03").toBe(true);
    }
  });
});

describe("demo-api adapter", () => {
  it("returns raw instances with absolute UTC starts", async () => {
    const raws = await demoApi.fetch(studioFor("demo-api", 1), ctx);
    expect(raws.length).toBeGreaterThan(0);
    for (const r of raws) {
      expect(r.start).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
      expect(r.bookingUrl).toContain("booking.example");
      expect(r.sourceId).toBeTruthy();
    }
  });
});

describe("demo-scrape adapter", () => {
  it("round-trips: render page → parse page → same classes", async () => {
    const truth = instancesForSite(0, ctx.window.start, ctx.window.end);
    const parsed = parseSchedulePage(renderSchedulePage(0, ctx.window.start, ctx.window.end));
    expect(parsed.length).toBe(truth.length);
    expect(parsed.map((p) => p.name)).toEqual(truth.map((t) => t.name));
    // naive local times, zone left to the engine default
    for (const p of parsed) expect(p.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("fetch() produces the same shape through the adapter interface", async () => {
    const raws = await demoScrape.fetch(studioFor("demo-scrape", 0), ctx);
    expect(raws.length).toBeGreaterThan(0);
    expect(raws[0]!.durationMins).toBeGreaterThan(0);
  });
});
