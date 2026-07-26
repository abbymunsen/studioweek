/**
 * Time helpers that never construct a Date from a dataset timestamp.
 *
 * Every instance's start/end is New-York wall time with an explicit offset
 * ("2026-07-27T19:00:00-04:00"), so display values are plain string slices —
 * correct in any viewer timezone, no conversion, no library. The only live
 * clock we need is "now in New York", which Intl provides.
 */

export const wallDate = (iso: string): string => iso.slice(0, 10);
export const wallTime = (iso: string): string => iso.slice(11, 16);

export function nyNow(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Date-string arithmetic via UTC noon, immune to viewer timezone and DST. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) … 7 (Sun). */
export function isoWeekday(date: string): number {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function isoWeekNumber(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const DAY_FULL = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export const dayOfMonth = (date: string): string => date.slice(8, 10);
export const monthAbbr = (date: string): string => MONTHS[Number(date.slice(5, 7)) - 1]!;

/** "20–26 JUL 2026" (or "27 JUL – 02 AUG 2026" across a month boundary). */
export function weekRangeLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return sameMonth
    ? `${dayOfMonth(monday)}–${dayOfMonth(sunday)} ${monthAbbr(sunday)} ${sunday.slice(0, 4)}`
    : `${dayOfMonth(monday)} ${monthAbbr(monday)} – ${dayOfMonth(sunday)} ${monthAbbr(sunday)} ${sunday.slice(0, 4)}`;
}

export function minutesBetween(startISO: string, endISO: string): number {
  // Offsets are explicit, so Date parsing is safe for durations (absolute times).
  return Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000);
}

export type Period = "MORNING" | "MIDDAY" | "EVENING";
export function period(time: string): Period {
  const h = Number(time.slice(0, 2));
  return h < 12 ? "MORNING" : h < 17 ? "MIDDAY" : "EVENING";
}

/** [startMin, endMin) overlap on the same date. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return wallDate(aStart) === wallDate(bStart) && aStart < bEnd && bStart < aEnd;
}
