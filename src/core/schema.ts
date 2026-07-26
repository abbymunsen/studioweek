import { z } from "zod";

/**
 * All schedule data is normalized to one timezone at ingest. Everything
 * downstream — recurring keys, the frontend, the ics feed — assumes it.
 */
export const HOME_ZONE = "America/New_York";

// ---------------------------------------------------------------------------
// Studio config (one TOML file per studio; doubles as the human-authored record)
// ---------------------------------------------------------------------------

export const TagRuleSchema = z
  .object({
    /** Regex tested against the class name, always case-insensitive. */
    match: z.string().min(1),
    add: z.array(z.string()).default([]),
    remove: z.array(z.string()).default([]),
    /** Ingest-time drop: the class never enters the dataset. Reported in the run summary. */
    exclude: z.boolean().default(false),
  })
  .strict()
  .refine((r) => r.exclude || r.add.length > 0 || r.remove.length > 0, {
    message: "tag rule must add, remove, or exclude",
  })
  .refine(
    (r) => {
      try {
        new RegExp(r.match, "i");
        return true;
      } catch {
        return false;
      }
    },
    { message: "match is not a valid regex" },
  );

export const TeacherSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]+$/, "teacher key must be a slug"),
  name: z.string().min(1),
  /** Teachers I follow — surfaced as a first-class filter. */
  follow: z.boolean().default(false),
  notes: z.string().default(""),
});

export const PricingSchema = z.strictObject({
  drop_in: z.number().positive().optional(),
  packs: z
    .array(z.object({ classes: z.number().int().positive(), price: z.number().positive() }))
    .default([]),
});

export const StudioConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "studio id must be a slug"),
  name: z.string().min(1),
  /** Short board/legend code, e.g. "KLN". */
  short: z.string().min(2).max(4),
  /** Adapter id this studio's feed is fetched with. */
  platform: z.string().min(1),
  /** Card spine color. Encodes studio identity and nothing else. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Studio-level default tags — cascade level 1. */
  tags: z.array(z.string()).default([]),
  /** Opaque to the engine; passed through to the adapter. */
  platform_params: z.record(z.unknown()).default({}),
  address: z.strictObject({
    text: z.string().min(1),
    hood: z.string().min(1),
  }),
  links: z.object({ site: z.string().url().optional(), booking: z.string().url().optional() }).default({}),
  pricing: PricingSchema.default({}),
  arrival_buffer_mins: z.number().int().nonnegative().default(0),
  /** Escape hatch for everything unstructured. The moment a feature reads this, promote a field. */
  notes: z.string().default(""),
  teachers: z.array(TeacherSchema).default([]),
  /** Cascade level 2 — name-pattern rules, evaluated in file order. */
  tag_rules: z.array(TagRuleSchema).default([]),
});

export type TagRule = z.infer<typeof TagRuleSchema>;
export type Teacher = z.infer<typeof TeacherSchema>;
export type StudioConfig = z.infer<typeof StudioConfigSchema>;

// ---------------------------------------------------------------------------
// Annotations (stars + per-key overrides; cascade level 3)
// ---------------------------------------------------------------------------

export const OverrideSchema = z.strictObject({
  /** Recurring key the override sticks to. */
  key: z.string().min(1),
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export const OverridesFileSchema = z.strictObject({
  overrides: z.array(OverrideSchema).default([]),
});

export const StarsFileSchema = z.strictObject({
  /** Recurring keys of starred classes. */
  starred: z.array(z.string()).default([]),
});

export type Override = z.infer<typeof OverrideSchema>;

// ---------------------------------------------------------------------------
// Pins (named locations for the distance filter)
// ---------------------------------------------------------------------------

export const PinsFileSchema = z.strictObject({
  pins: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9-]+$/),
        label: z.string().min(1),
        /** Only needed by the geocode CLI; demo pins ship with minutes pre-filled. */
        address: z.string().optional(),
      }),
    )
    .default([]),
});

// ---------------------------------------------------------------------------
// Geo cache (written by the geocode CLI, hand-correctable — especially
// transit minutes, which are entered by hand; see PLAN §9.3)
// ---------------------------------------------------------------------------

export const GeoCacheSchema = z.record(
  // keyed by address text
  z.object({
    lat: z.number(),
    lng: z.number(),
    /** minutes[pinId] = { walk?: n, transit?: n } — walk computed, transit hand-entered */
    minutes: z.record(z.object({ walk: z.number().optional(), transit: z.number().optional() })).default({}),
  }),
);

export type GeoCache = z.infer<typeof GeoCacheSchema>;

// ---------------------------------------------------------------------------
// Normalized class instance — the only stored schedule record
// ---------------------------------------------------------------------------

export const LEVELS = ["beg", "int", "adv", "open"] as const;
export type Level = (typeof LEVELS)[number];

export const ClassInstanceSchema = z.object({
  /** Stable across runs: hash of studio + (sourceId ?? start+name). */
  id: z.string(),
  /** Recurring key: studio | isoWeekday | NY wall time | slug(name). Annotations attach here. */
  key: z.string(),
  studio: z.string(),
  name: z.string(),
  teacher: z.string().nullable(),
  /** ISO 8601 with offset, always America/New_York. */
  start: z.string(),
  end: z.string(),
  level: z.enum(LEVELS).nullable(),
  levelRaw: z.string().nullable(),
  tags: z.array(z.string()),
  /** True when no name rule or override fired — feeds the visible "untagged" bucket. */
  untaggedName: z.boolean(),
  bookingUrl: z.string(),
});

export type ClassInstance = z.infer<typeof ClassInstanceSchema>;

// ---------------------------------------------------------------------------
// Dataset — the single JSON file the frontend loads
// ---------------------------------------------------------------------------

export interface StudioDirectoryEntry {
  id: string;
  name: string;
  short: string;
  color: string;
  hood: string;
  address: string;
  geo: { lat: number; lng: number } | null;
  /** minutesFrom[pinId] = best-known minutes (transit if hand-entered, else walk). */
  minutesFrom: Record<string, number>;
  pricing: z.infer<typeof PricingSchema>;
  arrivalBufferMins: number;
  tags: string[];
  notes: string;
  links: { site?: string; booking?: string };
  teachers: Teacher[];
  fetch: { ok: boolean; fetchedAt: string; error: string | null };
}

export interface Dataset {
  generatedAt: string;
  window: { start: string; end: string };
  studios: StudioDirectoryEntry[];
  classes: ClassInstance[];
  /** Display-only grouping of flat tags into filter rows. Unknown tags render in "other". */
  tagGroups: Record<string, string[]>;
  pins: { id: string; label: string }[];
  /**
   * Mirror of the annotation store's starred keys at generation time. A fresh
   * browser seeds its local stars from this; after that, local state (and the
   * sync backend, when wired) wins.
   */
  starredKeys: string[];
}
