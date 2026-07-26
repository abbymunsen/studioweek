import { describe, expect, it } from "vitest";
import { mapLevel, normalizeInstance, NormalizeError } from "../src/core/normalize.ts";

const base = { name: "Test Class", bookingUrl: "https://example.test/book/1" };

describe("normalizeInstance timezone handling", () => {
  it("converts UTC input to home-zone wall time (EDT, summer)", () => {
    const n = normalizeInstance({ ...base, start: "2026-07-27T23:00:00Z", durationMins: 60 }, "s");
    expect(n.start).toBe("2026-07-27T19:00:00-04:00");
    expect(n.end).toBe("2026-07-27T20:00:00-04:00");
  });

  it("converts UTC input to home-zone wall time (EST, winter)", () => {
    const n = normalizeInstance({ ...base, start: "2027-01-26T00:00:00Z", durationMins: 60 }, "s");
    expect(n.start).toBe("2027-01-25T19:00:00-05:00");
  });

  it("treats naive input as home-zone wall time by default", () => {
    const n = normalizeInstance({ ...base, start: "2026-07-27T19:00:00", durationMins: 45 }, "s");
    expect(n.start).toBe("2026-07-27T19:00:00-04:00");
  });

  it("treats naive input as adapter-declared zone when given", () => {
    const n = normalizeInstance(
      { ...base, start: "2026-07-27T16:00:00", timezone: "America/Los_Angeles", durationMins: 60 },
      "s",
    );
    expect(n.start).toBe("2026-07-27T19:00:00-04:00");
  });

  it("crosses the spring-forward DST gap correctly", () => {
    // In 2026, US DST starts Sun Mar 8 at 02:00 → offset flips -05:00 → -04:00.
    const before = normalizeInstance({ ...base, start: "2026-03-07T19:00:00", durationMins: 60 }, "s");
    const after = normalizeInstance({ ...base, start: "2026-03-08T19:00:00", durationMins: 60 }, "s");
    expect(before.start).toBe("2026-03-07T19:00:00-05:00");
    expect(after.start).toBe("2026-03-08T19:00:00-04:00");
    // Wall time — and therefore the recurring-key time segment — is unchanged.
    expect(before.key.split("|")[2]).toBe("19:00");
    expect(after.key.split("|")[2]).toBe("19:00");
  });

  it("a class spanning fall-back lasts its real duration", () => {
    // 2026-11-01 01:30 EDT + 60min crosses the repeated hour.
    const n = normalizeInstance({ ...base, start: "2026-11-01T01:30:00-04:00", durationMins: 60 }, "s");
    expect(n.start).toBe("2026-11-01T01:30:00-04:00");
    expect(n.end).toBe("2026-11-01T01:30:00-05:00"); // same wall time, next offset — 60 real minutes
  });

  it("rejects records with no way to compute an end", () => {
    expect(() => normalizeInstance({ ...base, start: "2026-07-27T19:00:00" }, "s")).toThrow(NormalizeError);
  });

  it("collapses whitespace in names", () => {
    const n = normalizeInstance({ ...base, name: "  Test   Class ", start: "2026-07-27T19:00:00", durationMins: 5 }, "s");
    expect(n.name).toBe("Test Class");
  });

  it("ids are stable and studio-prefixed", () => {
    const a = normalizeInstance({ ...base, start: "2026-07-27T19:00:00", durationMins: 60, sourceId: "x1" }, "kiln");
    const b = normalizeInstance({ ...base, start: "2026-07-27T19:00:00", durationMins: 60, sourceId: "x1" }, "kiln");
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^kiln-[0-9a-f]{8}$/);
  });
});

describe("mapLevel", () => {
  it.each([
    ["BEG", "beg"],
    ["Beginner Friendly", "beg"],
    ["Fundamentals", "beg"],
    ["INT", "int"],
    ["Level 2", "int"],
    ["ADV", "adv"],
    ["Int/Adv", "adv"], // mixed ranges map high so an "advanced" filter includes them
    ["All Levels", "open"],
    ["Open", "open"],
  ])("%s → %s", (raw, expected) => {
    expect(mapLevel(raw)).toBe(expected);
  });

  it("unknown strings map to null, raw is preserved by the caller", () => {
    expect(mapLevel("Tier 9")).toBeNull();
    expect(mapLevel(undefined)).toBeNull();
  });
});
