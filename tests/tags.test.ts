import { describe, expect, it } from "vitest";
import { applyTagCascade } from "../src/core/tags.ts";

const studio = {
  tags: ["dance"],
  tag_rules: [
    { match: "pilates", add: ["pilates"], remove: ["dance"], exclude: false },
    { match: "heels", add: ["heels"], remove: [], exclude: false },
    { match: "pro track|audition", add: [], remove: [], exclude: true },
    { match: "open jam", add: ["fringe"], remove: [], exclude: false },
  ],
};

describe("applyTagCascade", () => {
  it("passes studio defaults through when no rule fires, flagged untagged", () => {
    const r = applyTagCascade("Mystery Class", studio, undefined);
    expect(r).toEqual({ excluded: false, tags: ["dance"], untaggedName: true });
  });

  it("name rules add and remove; matching any rule clears the untagged flag", () => {
    const r = applyTagCascade("Mat Pilates", studio, undefined);
    expect(r).toEqual({ excluded: false, tags: ["pilates"], untaggedName: false });
  });

  it("matches case-insensitively", () => {
    const r = applyTagCascade("HEELS Choreography", studio, undefined);
    expect(r).toEqual({ excluded: false, tags: ["dance", "heels"], untaggedName: false });
  });

  it("rules apply in file order, cumulatively", () => {
    const r = applyTagCascade("Pilates in Heels", studio, undefined);
    expect(r).toEqual({ excluded: false, tags: ["heels", "pilates"], untaggedName: false });
  });

  it("exclusion drops the class and reports the rule", () => {
    const r = applyTagCascade("Pro Track Intensive", studio, undefined);
    expect(r).toEqual({ excluded: true, rule: "pro track|audition" });
  });

  it("fringe is an ordinary tag, not an exclusion", () => {
    const r = applyTagCascade("Open Jam Session", studio, undefined);
    expect(r).toEqual({ excluded: false, tags: ["dance", "fringe"], untaggedName: false });
  });

  it("per-key overrides run last and count as a match", () => {
    const r = applyTagCascade("Mystery Class", studio, { add: ["live-music"], remove: ["dance"] });
    expect(r).toEqual({ excluded: false, tags: ["live-music"], untaggedName: false });
  });

  it("override can undo a rule's work", () => {
    const r = applyTagCascade("Mat Pilates", studio, { add: ["dance"], remove: [] });
    expect(r).toEqual({ excluded: false, tags: ["dance", "pilates"], untaggedName: false });
  });
});
