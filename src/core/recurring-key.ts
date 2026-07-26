import { DateTime } from "luxon";
import { HOME_ZONE } from "./schema.ts";

/**
 * Recurring identity is derived, not stored: studio | isoWeekday | NY wall time | slug(name).
 * It is the hook that lets annotations (stars, tag overrides, notes) stick to "the Monday
 * 18:30 class" across weeks without modeling recurrence as an entity.
 *
 * Wall time makes keys DST-proof: an 18:30 class is `18:30` in March and in November.
 *
 * The slug is where feeds fidget, so normalization is deliberately aggressive: a studio
 * renaming "Contemporary Flow" to "Contemporary Flow w/ Sam covering" must not detach a
 * star. False merges (two genuinely different classes slugging identically in the same
 * slot) are the accepted, milder failure mode.
 */

const SUBSTITUTION_NOISE =
  /\b(sub(bed|bing|stitute[ds]?)?|cover(ing|ed)?|cancell?ed|canceled|no class|holiday schedule)\b/gi;

export function slugifyClassName(name: string): string {
  let s = name;
  // Parentheticals and brackets are always annotations: "(75 min)", "[sub]", "(All Levels)".
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  // "w/ Whoever" and everything after it.
  s = s.replace(/\s+w\/.*$/i, " ");
  // "with <Name>" — strip when what follows looks like a short personal name
  // ("with Sam", "with Sam Ortiz-Lee"), not a modality ("with live drumming").
  s = s.replace(/\s+with\s+[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)?\s*$/, " ");
  // Sub/cover/cancellation chatter anywhere in the name.
  s = s.replace(SUBSTITUTION_NOISE, " ");
  // Trailing markers: "*", "- NEW", "!".
  s = s.replace(/[-–—:]\s*(new|updated)\s*$/i, " ");
  s = s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s;
}

export function deriveRecurringKey(studioId: string, startISO: string, name: string): string {
  const dt = DateTime.fromISO(startISO, { setZone: true }).setZone(HOME_ZONE);
  if (!dt.isValid) throw new Error(`invalid start for recurring key: ${startISO}`);
  return [studioId, dt.weekday, dt.toFormat("HH:mm"), slugifyClassName(name)].join("|");
}
