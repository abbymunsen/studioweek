import { DateTime } from "luxon";
import { HOME_ZONE } from "../core/schema.ts";

/**
 * Shared fake-world generator behind both demo platforms. Eight invented
 * studios with a fixed weekly roster, plus deterministic "life": a small
 * fraction of instances get renamed with substitution chatter (exercising the
 * slug normalizer) or cancelled, keyed off a hash of (date, name) so every run
 * over the same window produces identical output.
 *
 * Everything here — studios, teachers, names — is synthetic. No real vendor or
 * studio appears anywhere in this repo by design.
 */

// [isoWeekday 1–7, "HH:mm", mins, name, levelRaw, teacher, site]
type RosterRow = [number, string, number, string, string, string, number];

export const ROSTER: RosterRow[] = [
  [1, "07:00", 60, "Sunrise Vinyasa", "ALL", "R. Okonjo", 4],
  [1, "09:30", 55, "Barre Foundations", "BEG", "M. Delacroix", 2],
  [1, "12:10", 45, "Express Mat Pilates", "ALL", "J. Aaltonen", 7],
  [1, "17:30", 75, "Ballet Technique I", "BEG", "L. Barnes", 3],
  [1, "18:00", 60, "House Fundamentals", "BEG", "D. Ferreira", 0],
  [1, "19:00", 60, "Contemporary Flow", "INT", "S. Nakamura", 1],
  [1, "20:15", 60, "Salsa On2 Basics", "BEG", "C. Reyes", 6],

  [2, "06:45", 45, "Strength Circuit", "ALL", "P. Nyström", 5],
  [2, "08:00", 60, "Slow Flow & Breath", "ALL", "R. Okonjo", 4],
  [2, "10:00", 60, "Reformer Basics", "BEG", "J. Aaltonen", 7],
  [2, "12:15", 45, "Lunch Barre Express", "ALL", "M. Delacroix", 2],
  [2, "18:00", 60, "Hip Hop Grooves", "INT", "T. Whitfield", 0],
  [2, "18:00", 75, "Ballet Technique III", "ADV", "L. Barnes", 3],
  [2, "18:15", 60, "Heels Choreography", "INT", "V. Mbeki", 1],
  [2, "18:30", 45, "Conditioning for Dancers", "ALL", "P. Nyström", 5],
  [2, "19:00", 60, "Jazz Repertoire", "INT/ADV", "A. Kowalczyk", 3],
  [2, "19:15", 60, "Tango Salon", "BEG", "C. Reyes", 6],
  [2, "19:30", 60, "Contemporary Partnering", "ADV", "S. Nakamura", 1],
  [2, "20:30", 60, "Late Restorative", "ALL", "H. Lindqvist", 4],

  [3, "07:15", 45, "Mat Pilates", "ALL", "J. Aaltonen", 7],
  [3, "09:00", 60, "Barre Intermediate", "INT", "M. Delacroix", 2],
  [3, "12:00", 45, "Power Half Hour", "ALL", "P. Nyström", 5],
  [3, "13:00", 60, "Tap Fundamentals", "BEG", "G. Osei", 0],
  [3, "17:45", 60, "House Intermediate", "INT", "D. Ferreira", 0],
  [3, "18:30", 75, "Ballet Technique II", "INT", "L. Barnes", 3],
  [3, "19:00", 60, "Vinyasa Strong", "INT", "H. Lindqvist", 4],
  [3, "20:00", 60, "Salsa Partnerwork", "INT", "C. Reyes", 6],

  [4, "06:45", 45, "Strength Circuit", "ALL", "P. Nyström", 5],
  [4, "09:30", 60, "Reformer Flow", "INT", "K. Duarte", 7],
  [4, "12:10", 45, "Express Barre", "ALL", "M. Delacroix", 2],
  [4, "17:30", 60, "Jazz Technique", "BEG", "A. Kowalczyk", 3],
  [4, "18:00", 60, "Contemporary Flow", "INT", "S. Nakamura", 1],
  [4, "18:45", 60, "Heels Technique", "BEG", "V. Mbeki", 1],
  [4, "19:30", 60, "Hip Hop Choreo", "INT/ADV", "T. Whitfield", 0],
  [4, "20:30", 45, "Yin & Recovery", "ALL", "R. Okonjo", 4],

  [5, "07:00", 60, "Sunrise Vinyasa", "ALL", "R. Okonjo", 4],
  [5, "08:30", 45, "Mat Pilates", "ALL", "K. Duarte", 7],
  [5, "12:15", 45, "Lunch Conditioning", "ALL", "P. Nyström", 5],
  [5, "17:30", 60, "Friday House Session", "ALL", "D. Ferreira", 0],
  [5, "18:00", 75, "Ballet Technique II", "INT", "L. Barnes", 3],
  [5, "19:00", 60, "Tango Practica", "ALL", "C. Reyes", 6],
  [5, "19:30", 60, "Heels Performance", "ADV", "V. Mbeki", 1],

  [6, "08:30", 60, "Weekend Vinyasa", "ALL", "H. Lindqvist", 4],
  [6, "10:00", 90, "Ballet Open Level", "ALL", "L. Barnes", 3],
  [6, "10:30", 60, "Barre Burn", "INT", "M. Delacroix", 2],
  [6, "12:00", 75, "Contemporary Lab", "INT/ADV", "S. Nakamura", 1],
  [6, "14:00", 60, "Tap Intermediate", "INT", "G. Osei", 0],
  [6, "16:00", 90, "Salsa Social Prep", "ALL", "C. Reyes", 6],
  // exercises the exclusion rule in ferry-st-dance.toml — dropped at ingest, listed in summary
  [6, "11:45", 120, "Pro Track Ballet Intensive", "ADV", "L. Barnes", 3],
  // exercises the fringe rule in northline-movement.toml — hidden by default in the UI
  [6, "20:00", 120, "Open Jam Session", "ALL", "", 0],

  [7, "10:00", 75, "Slow Sunday Flow", "ALL", "R. Okonjo", 4],
  [7, "16:30", 60, "Reformer Reset", "BEG", "K. Duarte", 7],
];

const COVER_TEACHERS = ["Sam", "Noa", "Ira", "Kit"];

/** FNV-1a — tiny deterministic hash for stable pseudo-randomness. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SyntheticInstance {
  /** naive local date "yyyy-MM-dd" in HOME_ZONE */
  date: string;
  time: string;
  mins: number;
  name: string;
  levelRaw: string;
  teacher: string;
  sourceId: string;
}

/** All instances for one site inside [start, end) — dates are HOME_ZONE-local. */
export function instancesForSite(site: number, windowStart: string, windowEnd: string): SyntheticInstance[] {
  const out: SyntheticInstance[] = [];
  let day = DateTime.fromISO(windowStart, { zone: HOME_ZONE }).startOf("day");
  const end = DateTime.fromISO(windowEnd, { zone: HOME_ZONE }).startOf("day");
  for (; day < end; day = day.plus({ days: 1 })) {
    const date = day.toISODate()!;
    for (const [wd, time, mins, name, levelRaw, teacher, s] of ROSTER) {
      if (s !== site || wd !== day.weekday) continue;
      const h = hash32(`${date}|${name}|${s}`);
      if (h % 100 < 3) continue; // ~3%: cancelled, silently absent from the feed
      let displayName = name;
      if (h % 100 >= 3 && h % 100 < 10) {
        // ~7%: substitution chatter in the name — the slug normalizer must see through this
        const cover = COVER_TEACHERS[h % COVER_TEACHERS.length]!;
        displayName = h % 2 === 0 ? `${name} w/ ${cover} covering` : `${name} (sub: ${cover})`;
      }
      out.push({ date, time, mins, name: displayName, levelRaw, teacher, sourceId: `${date}-${h.toString(16)}` });
    }
  }
  return out;
}
