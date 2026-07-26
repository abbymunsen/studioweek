import { DateTime } from "luxon";
import { HOME_ZONE, type ClassInstance, type StudioDirectoryEntry } from "./schema.ts";

/**
 * Starred recurring keys × current instances → an iCalendar feed for calendar
 * subscription. Hand-rolled: the format is small, and owning TZID/VTIMEZONE
 * beats depending on a library for ~100 lines.
 *
 * UID = instance id, which is stable across runs, so calendar clients update
 * events in place instead of duplicating them.
 */

// America/New_York, current rules (2007–): EDT from 2nd Sunday of March,
// EST from 1st Sunday of November.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${HOME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:20071104T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets with CRLF + space continuation. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let buf: number[] = [];
  let limit = 75;
  for (const b of bytes) {
    buf.push(b);
    if (buf.length >= limit) {
      // don't split a UTF-8 sequence: back off to the last full character
      let cut = buf.length;
      while (cut > 0 && (buf[cut - 1]! & 0xc0) === 0x80) cut--;
      if ((buf[cut - 1]! & 0x80) !== 0 && (buf[cut - 1]! & 0xc0) !== 0xc0) cut = buf.length;
      else if ((buf[cut - 1]! & 0xc0) === 0xc0) cut--;
      parts.push(new TextDecoder().decode(new Uint8Array(buf.slice(0, cut))));
      buf = buf.slice(cut);
      limit = 74; // continuation lines start with a space
    }
  }
  if (buf.length) parts.push(new TextDecoder().decode(new Uint8Array(buf)));
  return parts.join("\r\n ");
}

function localStamp(iso: string): string {
  return DateTime.fromISO(iso, { setZone: true }).setZone(HOME_ZONE).toFormat("yyyyMMdd'T'HHmmss");
}

export interface IcsOptions {
  calendarName?: string;
  generatedAt: string;
}

export function buildIcs(
  starredKeys: Set<string>,
  classes: ClassInstance[],
  studios: Map<string, StudioDirectoryEntry>,
  opts: IcsOptions,
): { ics: string; matched: number; detachedKeys: string[] } {
  const events = classes.filter((c) => starredKeys.has(c.key));
  const matchedKeys = new Set(events.map((c) => c.key));
  const detachedKeys = [...starredKeys].filter((k) => !matchedKeys.has(k));
  const dtstamp = DateTime.fromISO(opts.generatedAt, { setZone: true })
    .toUTC()
    .toFormat("yyyyMMdd'T'HHmmss'Z'");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//studioweek//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "StudioWeek")}`,
    ...VTIMEZONE,
  ];

  for (const c of events) {
    const studio = studios.get(c.studio);
    const summary = `${c.name} — ${studio?.short ?? c.studio}`;
    const descParts = [c.teacher ? `Teacher: ${c.teacher}` : null, `Book: ${c.bookingUrl}`].filter(
      (x): x is string => x !== null,
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@studioweek`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${HOME_ZONE}:${localStamp(c.start)}`,
      `DTEND;TZID=${HOME_ZONE}:${localStamp(c.end)}`,
      `SUMMARY:${escapeText(summary)}`,
      ...(studio ? [`LOCATION:${escapeText(`${studio.name}, ${studio.address}`)}`] : []),
      `DESCRIPTION:${escapeText(descParts.join("\n"))}`,
      `URL:${c.bookingUrl}`,
    );
    if (studio && studio.arrivalBufferMins > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`Leave for ${c.name}`)}`,
        `TRIGGER:-PT${studio.arrivalBufferMins}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return { ics: lines.map(foldLine).join("\r\n") + "\r\n", matched: events.length, detachedKeys };
}
