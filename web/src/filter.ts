import type { ClassInstance, Dataset, StudioDirectoryEntry } from "../../src/core/schema.ts";
import type { Filters } from "./state.ts";
import { period, wallTime } from "./time.ts";

/** Client-side filtering over the full dataset — a few hundred rows, trivial. */

export interface FilterContext {
  dataset: Dataset;
  studiosById: Map<string, StudioDirectoryEntry>;
  followedTeachers: Set<string>; // "studioId|teacherName"
  stars: Set<string>;
}

export function buildContext(dataset: Dataset, stars: Set<string>): FilterContext {
  const studiosById = new Map(dataset.studios.map((s) => [s.id, s]));
  const followedTeachers = new Set<string>();
  for (const s of dataset.studios)
    for (const t of s.teachers) if (t.follow) followedTeachers.add(`${s.id}|${t.name}`);
  return { dataset, studiosById, followedTeachers, stars };
}

export function passes(c: ClassInstance, f: Filters, ctx: FilterContext): boolean {
  // fringe: hidden unless shown explicitly or the fringe tag itself is selected
  if (c.tags.includes("fringe") && !f.fringe && !f.tags.includes("fringe")) return false;
  if (f.untagged && !c.untaggedName) return false;
  if (f.starredOnly && !ctx.stars.has(c.key)) return false;
  if (f.followedOnly && !(c.teacher && ctx.followedTeachers.has(`${c.studio}|${c.teacher}`))) return false;
  if (f.tags.length && !f.tags.some((t) => c.tags.includes(t))) return false;
  if (f.studios.length && !f.studios.includes(c.studio)) return false;
  if (f.teachers.length && !(c.teacher && f.teachers.includes(c.teacher))) return false;
  if (f.levels.length && !(c.level && f.levels.includes(c.level))) return false;
  if (f.times.length && !f.times.includes(period(wallTime(c.start)))) return false;
  if (f.pin && f.maxMins !== null) {
    const mins = ctx.studiosById.get(c.studio)?.minutesFrom[f.pin];
    if (mins === undefined || mins > f.maxMins) return false;
  }
  return true;
}

/** Distinct teacher names across the dataset, for the teacher filter row. */
export function allTeachers(dataset: Dataset): string[] {
  return [...new Set(dataset.classes.flatMap((c) => (c.teacher ? [c.teacher] : [])))].sort();
}

/** Tags actually present, grouped per tagGroups, with leftovers in "other". */
export function groupedTags(dataset: Dataset): [string, string[]][] {
  const present = new Set(dataset.classes.flatMap((c) => c.tags));
  const grouped: [string, string[]][] = [];
  const claimed = new Set<string>();
  for (const [group, tags] of Object.entries(dataset.tagGroups)) {
    const here = tags.filter((t) => present.has(t));
    for (const t of here) claimed.add(t);
    if (here.length) grouped.push([group, here]);
  }
  const other = [...present].filter((t) => !claimed.has(t)).sort();
  if (other.length) grouped.push(["other", other]);
  return grouped;
}
