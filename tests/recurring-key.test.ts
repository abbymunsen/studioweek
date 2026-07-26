import { describe, expect, it } from "vitest";
import { deriveRecurringKey, slugifyClassName } from "../src/core/recurring-key.ts";

describe("slugifyClassName", () => {
  it("slugs a plain name", () => {
    expect(slugifyClassName("Contemporary Flow")).toBe("contemporary-flow");
  });

  it("is stable under substitution chatter — the common rename churn", () => {
    const base = slugifyClassName("Contemporary Flow");
    for (const renamed of [
      "Contemporary Flow w/ Sam covering",
      "Contemporary Flow (sub: Noa)",
      "Contemporary Flow [SUB]",
      "Contemporary Flow with Sam",
      "Contemporary Flow with Sam Ortiz-Lee",
      "Contemporary Flow (75 min)",
      "Contemporary Flow - NEW",
    ]) {
      expect(slugifyClassName(renamed), renamed).toBe(base);
    }
  });

  it("does not strip 'with' when it names a modality, not a person", () => {
    // lowercase continuation → not a personal name → kept
    expect(slugifyClassName("Stretch with bands")).toBe("stretch-with-bands");
  });

  it("normalizes punctuation and ampersands", () => {
    expect(slugifyClassName("Yin & Recovery")).toBe("yin-and-recovery");
    expect(slugifyClassName("Slow Flow & Breath")).toBe("slow-flow-and-breath");
  });

  it("keeps roman-numeral levels distinct", () => {
    expect(slugifyClassName("Ballet Technique I")).not.toBe(slugifyClassName("Ballet Technique III"));
  });
});

describe("deriveRecurringKey", () => {
  it("derives studio | isoWeekday | wall time | slug", () => {
    // 2026-07-27 is a Monday
    expect(deriveRecurringKey("kiln-studio", "2026-07-27T19:00:00-04:00", "Contemporary Flow")).toBe(
      "kiln-studio|1|19:00|contemporary-flow",
    );
  });

  it("is DST-proof: same wall time in July (EDT) and January (EST) → same key", () => {
    const summer = deriveRecurringKey("kiln-studio", "2026-07-27T19:00:00-04:00", "Contemporary Flow");
    const winter = deriveRecurringKey("kiln-studio", "2027-01-25T19:00:00-05:00", "Contemporary Flow");
    expect(winter).toBe(summer);
  });

  it("converts foreign-zone input to home-zone wall time first", () => {
    // 23:00 UTC on a Monday = 19:00 EDT the same Monday
    expect(deriveRecurringKey("kiln-studio", "2026-07-27T23:00:00Z", "Contemporary Flow")).toBe(
      "kiln-studio|1|19:00|contemporary-flow",
    );
    // 03:00 UTC Tuesday = Monday 23:00 EDT → weekday must be Monday
    expect(deriveRecurringKey("kiln-studio", "2026-07-28T03:00:00Z", "Late Class")).toBe(
      "kiln-studio|1|23:00|late-class",
    );
  });
});
