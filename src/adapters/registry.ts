import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { PlatformAdapter } from "./types.ts";
import demoApi from "./demo-api/index.ts";
import demoScrape from "./demo-scrape/index.ts";

/**
 * Adapter discovery. Built-in adapters (the synthetic demo platforms) ship with
 * the engine; real platform adapters live in a private repo and are loaded from
 * a directory passed via --adapters: each file default-exports a PlatformAdapter.
 */

const BUILTIN: PlatformAdapter[] = [demoApi, demoScrape];

function isAdapter(x: unknown): x is PlatformAdapter {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as PlatformAdapter).id === "string" &&
    typeof (x as PlatformAdapter).fetch === "function"
  );
}

export async function loadAdapters(externalDir?: string): Promise<Map<string, PlatformAdapter>> {
  const registry = new Map<string, PlatformAdapter>();
  for (const a of BUILTIN) registry.set(a.id, a);

  if (externalDir) {
    const files = (await readdir(externalDir)).filter((f) => /\.(ts|mts|js|mjs)$/.test(f));
    for (const file of files) {
      const mod = await import(pathToFileURL(join(externalDir, file)).href);
      const adapter: unknown = mod.default;
      if (!isAdapter(adapter)) throw new Error(`${file}: default export is not a PlatformAdapter`);
      if (registry.has(adapter.id)) throw new Error(`duplicate adapter id "${adapter.id}" (${file})`);
      registry.set(adapter.id, adapter);
    }
  }
  return registry;
}
