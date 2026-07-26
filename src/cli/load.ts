import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import {
  GeoCacheSchema,
  OverridesFileSchema,
  PinsFileSchema,
  StarsFileSchema,
  StudioConfigSchema,
  type GeoCache,
  type Override,
  type StudioConfig,
} from "../core/schema.ts";

/** Shared loading for the CLIs: TOML/JSON in, zod-validated objects out. */

export class ConfigError extends Error {
  constructor(file: string, cause: string) {
    super(`${file}: ${cause}`);
  }
}

function zodMessage(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

async function loadToml<S extends z.ZodTypeAny>(file: string, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = parseToml(await readFile(file, "utf8"));
  } catch (e) {
    throw new ConfigError(file, `TOML parse error: ${(e as Error).message}`);
  }
  const res = schema.safeParse(raw);
  if (!res.success) throw new ConfigError(file, zodMessage(res.error));
  return res.data;
}

async function loadJson<S extends z.ZodTypeAny>(file: string, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new ConfigError(file, `JSON parse error: ${(e as Error).message}`);
  }
  const res = schema.safeParse(raw);
  if (!res.success) throw new ConfigError(file, zodMessage(res.error));
  return res.data;
}

export async function loadStudios(dir: string): Promise<StudioConfig[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".toml")).sort();
  const studios: StudioConfig[] = [];
  const seen = new Map<string, string>();
  const errors: string[] = [];
  for (const f of files) {
    try {
      const cfg = await loadToml(join(dir, f), StudioConfigSchema);
      const dup = seen.get(cfg.id);
      if (dup) throw new ConfigError(join(dir, f), `duplicate studio id "${cfg.id}" (also in ${dup})`);
      seen.set(cfg.id, f);
      studios.push(cfg);
    } catch (e) {
      // Config mistakes cluster — collect them all instead of stopping at the first file.
      errors.push((e as Error).message);
    }
  }
  if (errors.length) throw new ConfigError(dir, errors.join("\n"));
  return studios;
}

export interface Annotations {
  starred: string[];
  overrides: Map<string, Override>;
  pins: { id: string; label: string; address?: string }[];
  tagGroups: Record<string, string[]>;
  geo: GeoCache;
}

const TagGroupsSchema = z.record(z.array(z.string()));

export async function loadAnnotations(dir: string): Promise<Annotations> {
  const opt = async <T>(file: string, fallback: T, loader: () => Promise<T>): Promise<T> =>
    existsSync(join(dir, file)) ? loader() : fallback;

  const stars = await opt("stars.json", { starred: [] }, () => loadJson(join(dir, "stars.json"), StarsFileSchema));
  const overridesFile = await opt("overrides.toml", { overrides: [] }, () =>
    loadToml(join(dir, "overrides.toml"), OverridesFileSchema),
  );
  const pinsFile = await opt("pins.toml", { pins: [] }, () => loadToml(join(dir, "pins.toml"), PinsFileSchema));
  const tagGroups = await opt("tag-groups.toml", {}, () => loadToml(join(dir, "tag-groups.toml"), TagGroupsSchema));
  const geo = await opt("geo.json", {}, () => loadJson(join(dir, "geo.json"), GeoCacheSchema));

  const overrides = new Map<string, Override>();
  for (const o of overridesFile.overrides) {
    if (overrides.has(o.key)) throw new ConfigError(join(dir, "overrides.toml"), `duplicate override key "${o.key}"`);
    overrides.set(o.key, o);
  }
  return { starred: stars.starred, overrides, pins: pinsFile.pins, tagGroups, geo };
}
