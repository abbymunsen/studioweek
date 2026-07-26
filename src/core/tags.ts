import type { Override, StudioConfig } from "./schema.ts";

/**
 * The tag cascade. Tags are flat in the data; hierarchy lives only in how they
 * are authored, in three levels:
 *
 *   1. studio defaults        — a studio tagged `dance` passes it to every class
 *   2. name-pattern rules     — regex on the class name; add/remove/exclude (the workhorse)
 *   3. per-key overrides      — exceptions pinned to a recurring key
 *
 * `exclude` drops the class at ingest — it never enters the dataset — and the
 * summary reports what was dropped and by which rule, so exclusion stays
 * auditable. Borderline classes should get a `fringe` tag instead (hidden by
 * default in the UI, one toggle to resurrect).
 *
 * A class where no rule and no override fired is `untaggedName`: it still keeps
 * its studio defaults but lands in the visible untagged bucket, and its name is
 * listed in the run summary so taxonomy upkeep is a glance.
 */

export type CascadeResult =
  | { excluded: true; rule: string }
  | { excluded: false; tags: string[]; untaggedName: boolean };

export function applyTagCascade(
  className: string,
  studio: Pick<StudioConfig, "tags" | "tag_rules">,
  override: Pick<Override, "add" | "remove"> | undefined,
): CascadeResult {
  const tags = new Set(studio.tags);
  let fired = false;

  for (const rule of studio.tag_rules) {
    // Case-insensitive by default: class names are display text, and JS has no inline (?i).
    if (!new RegExp(rule.match, "i").test(className)) continue;
    if (rule.exclude) return { excluded: true, rule: rule.match };
    fired = true;
    for (const t of rule.add) tags.add(t);
    for (const t of rule.remove) tags.delete(t);
  }

  if (override) {
    fired = true;
    for (const t of override.add) tags.add(t);
    for (const t of override.remove) tags.delete(t);
  }

  return { excluded: false, tags: [...tags].sort(), untaggedName: !fired };
}
