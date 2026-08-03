import type { Level } from "../../src/core/schema.ts";
import type { Period } from "./time.ts";

/**
 * App state. Filters serialize into the URL hash (a preset is just a named
 * URL); stars and presets persist in localStorage. The default view is the
 * last-used filter state — never the unfiltered firehose.
 */

export interface Filters {
  tags: string[];
  studios: string[];
  teachers: string[];
  levels: Level[];
  times: Period[];
  starredOnly: boolean;
  followedOnly: boolean;
  /** Show classes tagged `fringe` (hidden by default). */
  fringe: boolean;
  /** Show only untagged-name classes (taxonomy triage view). */
  untagged: boolean;
  pin: string | null;
  maxMins: number | null;
}

export interface AppState {
  route: "board" | "directory";
  weekOffset: number;
  /** Selected day 0–6 (mobile day view). */
  day: number;
  filters: Filters;
  /** Open class id, if a detail panel is showing. */
  detail: string | null;
  filtersOpen: boolean;
}

export const emptyFilters = (): Filters => ({
  tags: [],
  studios: [],
  teachers: [],
  levels: [],
  times: [],
  starredOnly: false,
  followedOnly: false,
  fringe: false,
  untagged: false,
  pin: null,
  maxMins: null,
});

export function activeFilterCount(f: Filters): number {
  return (
    f.tags.length +
    f.studios.length +
    f.teachers.length +
    f.levels.length +
    f.times.length +
    (f.starredOnly ? 1 : 0) +
    (f.followedOnly ? 1 : 0) +
    (f.untagged ? 1 : 0) +
    (f.pin && f.maxMins ? 1 : 0)
  );
}

// --- URL hash <-> filters ---------------------------------------------------

export function filtersToHash(route: AppState["route"], f: Filters): string {
  const p = new URLSearchParams();
  const list = (k: string, v: string[]) => v.length && p.set(k, v.join("~"));
  list("t", f.tags);
  list("s", f.studios);
  list("tc", f.teachers);
  list("l", f.levels);
  list("p", f.times);
  if (f.starredOnly) p.set("star", "1");
  if (f.followedOnly) p.set("fol", "1");
  if (f.fringe) p.set("fr", "1");
  if (f.untagged) p.set("un", "1");
  if (f.pin && f.maxMins !== null) {
    p.set("pin", f.pin);
    p.set("min", String(f.maxMins));
  }
  const q = p.toString();
  return `#/${route}${q ? "?" + q : ""}`;
}

export function parseHash(hash: string): { route: AppState["route"]; filters: Filters } | null {
  const m = /^#\/(board|directory)(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const p = new URLSearchParams(m[2] ?? "");
  const list = (k: string) => p.get(k)?.split("~").filter(Boolean) ?? [];
  const f = emptyFilters();
  f.tags = list("t");
  f.studios = list("s");
  f.teachers = list("tc");
  f.levels = list("l") as Level[];
  f.times = list("p") as Period[];
  f.starredOnly = p.get("star") === "1";
  f.followedOnly = p.get("fol") === "1";
  f.fringe = p.get("fr") === "1";
  f.untagged = p.get("un") === "1";
  f.pin = p.get("pin");
  f.maxMins = p.get("min") ? Number(p.get("min")) : null;
  return { route: m[1] as AppState["route"], filters: f };
}

// --- localStorage -----------------------------------------------------------

const LS = {
  stars: "studioweek.stars",
  presets: "studioweek.presets",
  lastFilters: "studioweek.lastFilters",
  filtersOpen: "studioweek.filtersOpen",
  theme: "studioweek.theme",
};

// --- UI preferences ---------------------------------------------------------

export type Theme = "auto" | "light" | "dark";

export function loadTheme(): Theme {
  const t = localStorage.getItem(LS.theme);
  return t === "light" || t === "dark" ? t : "auto";
}

export function saveTheme(t: Theme): void {
  localStorage.setItem(LS.theme, t);
}

export function loadFiltersOpen(defaultOpen: boolean): boolean {
  const v = localStorage.getItem(LS.filtersOpen);
  return v === null ? defaultOpen : v === "1";
}

export function saveFiltersOpen(open: boolean): void {
  localStorage.setItem(LS.filtersOpen, open ? "1" : "0");
}

/** Null means "never starred anything here" — caller seeds from the dataset mirror. */
export function loadStars(): Set<string> | null {
  try {
    const raw = localStorage.getItem(LS.stars);
    return raw === null ? null : new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

export function saveStars(stars: Set<string>): void {
  localStorage.setItem(LS.stars, JSON.stringify([...stars]));
}

export interface Preset {
  name: string;
  filters: Filters;
}

export function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(LS.presets) ?? "[]") as Preset[];
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  localStorage.setItem(LS.presets, JSON.stringify(presets));
}

export function loadLastFilters(): Filters | null {
  try {
    const raw = localStorage.getItem(LS.lastFilters);
    return raw ? { ...emptyFilters(), ...(JSON.parse(raw) as Filters) } : null;
  } catch {
    return null;
  }
}

export function saveLastFilters(f: Filters): void {
  localStorage.setItem(LS.lastFilters, JSON.stringify(f));
}
