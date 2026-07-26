import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "../src/core/ics.ts";
import type { ClassInstance, StudioDirectoryEntry } from "../src/core/schema.ts";

const studio: StudioDirectoryEntry = {
  id: "kiln-studio",
  name: "Kiln Studio",
  short: "KLN",
  color: "#a5701c",
  hood: "GOWANUS",
  address: "98 9th St, Brooklyn, NY",
  geo: null,
  minutesFrom: {},
  pricing: { packs: [] },
  arrivalBufferMins: 15,
  tags: ["dance"],
  notes: "",
  links: {},
  teachers: [],
  fetch: { ok: true, fetchedAt: "2026-07-26T06:00:00-04:00", error: null },
};

const instance: ClassInstance = {
  id: "kiln-studio-abc12345",
  key: "kiln-studio|1|19:00|contemporary-flow",
  studio: "kiln-studio",
  name: "Contemporary Flow",
  teacher: "S. Nakamura",
  start: "2026-07-27T19:00:00-04:00",
  end: "2026-07-27T20:00:00-04:00",
  level: "int",
  levelRaw: "INT",
  tags: ["contemporary", "dance"],
  untaggedName: false,
  bookingUrl: "https://booking.example/x/1",
};

const opts = { generatedAt: "2026-07-26T06:00:00-04:00" };

describe("buildIcs", () => {
  it("emits a valid skeleton with VTIMEZONE and TZID-anchored local times", () => {
    const { ics, matched } = buildIcs(
      new Set([instance.key]),
      [instance],
      new Map([[studio.id, studio]]),
      opts,
    );
    expect(matched).toBe(1);
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/New_York");
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260727T190000");
    expect(ics).toContain("UID:kiln-studio-abc12345@studioweek");
    expect(ics).toContain("SUMMARY:Contemporary Flow — KLN");
    // arrival buffer → VALARM
    expect(ics).toContain("TRIGGER:-PT15M");
    // CRLF line endings throughout
    expect(ics.includes("\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });

  it("reports starred keys that matched nothing as detached", () => {
    const { matched, detachedKeys } = buildIcs(
      new Set(["kiln-studio|2|09:00|gone-class"]),
      [instance],
      new Map([[studio.id, studio]]),
      opts,
    );
    expect(matched).toBe(0);
    expect(detachedKeys).toEqual(["kiln-studio|2|09:00|gone-class"]);
  });

  it("escapes commas and semicolons in text fields", () => {
    expect(escapeText("a, b; c\nd")).toBe("a\\, b\\; c\\nd");
  });

  it("folds long lines at 75 octets with continuation", () => {
    const folded = foldLine("DESCRIPTION:" + "x".repeat(200));
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + "x".repeat(200));
  });

  it("folds without splitting multi-byte characters", () => {
    const folded = foldLine("SUMMARY:" + "é".repeat(100));
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(100));
  });
});
