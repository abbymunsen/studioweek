import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { HOME_ZONE, type ClassInstance, type Level } from "./schema.ts";
import { deriveRecurringKey } from "./recurring-key.ts";
import type { RawClassInstance } from "../adapters/types.ts";

/**
 * Raw feed record → normalized instance (minus tags, which the cascade adds next).
 * This is the only place timezone math happens: whatever zone a platform speaks,
 * instances leave here as America/New_York wall time with the correct offset —
 * including across DST transitions.
 */

export class NormalizeError extends Error {}

function parseToHomeZone(value: string, timezone: string | undefined, what: string): DateTime {
  // ISO strings with an explicit offset are absolute; naive strings are wall time
  // in the adapter-declared zone (default: home zone).
  const zone = timezone ?? HOME_ZONE;
  const dt = DateTime.fromISO(value, { zone, setZone: false });
  if (!dt.isValid) throw new NormalizeError(`unparseable ${what}: "${value}" (${dt.invalidReason})`);
  return dt.setZone(HOME_ZONE);
}

/** Best-effort level mapping for filtering; the raw string is kept alongside. */
export function mapLevel(raw: string | undefined): Level | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  // Mixed ranges ("Int/Adv") map to the higher level so an "advanced" filter includes them.
  if (/adv/.test(s)) return "adv";
  if (/int|level\s*2|ii\b/.test(s)) return "int";
  if (/beg|basic|intro|fund|level\s*1|\bi\b/.test(s)) return "beg";
  if (/all|open|every/.test(s)) return "open";
  return null;
}

export type Normalized = Omit<ClassInstance, "tags" | "untaggedName">;

export function normalizeInstance(raw: RawClassInstance, studioId: string): Normalized {
  const name = raw.name.replace(/\s+/g, " ").trim();
  if (!name) throw new NormalizeError("class has no name");

  const start = parseToHomeZone(raw.start, raw.timezone, "start");
  let end: DateTime;
  if (raw.end) {
    end = parseToHomeZone(raw.end, raw.timezone, "end");
  } else if (raw.durationMins) {
    end = start.plus({ minutes: raw.durationMins });
  } else {
    throw new NormalizeError(`"${name}": neither end nor durationMins provided`);
  }
  if (end <= start) throw new NormalizeError(`"${name}": end is not after start`);

  const startISO = start.toISO({ suppressMilliseconds: true })!;
  const idSource = raw.sourceId ?? `${startISO}|${name}`;
  const id = `${studioId}-${createHash("sha256").update(`${studioId}|${idSource}`).digest("hex").slice(0, 8)}`;

  return {
    id,
    key: deriveRecurringKey(studioId, startISO, name),
    studio: studioId,
    name,
    teacher: raw.teacher?.trim() || null,
    start: startISO,
    end: end.toISO({ suppressMilliseconds: true })!,
    level: mapLevel(raw.levelRaw),
    levelRaw: raw.levelRaw ?? null,
    bookingUrl: raw.bookingUrl,
  };
}
