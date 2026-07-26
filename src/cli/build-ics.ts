import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Dataset, StudioDirectoryEntry } from "../core/schema.ts";
import { buildIcs } from "../core/ics.ts";
import { loadAnnotations } from "./load.ts";

/** stars.json × dataset.json → studioweek.ics (calendar-subscription feed). */

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      data: { type: "string" },
      annotations: { type: "string" },
      out: { type: "string" },
      name: { type: "string", default: "StudioWeek" },
    },
  });
  if (!values.data || !values.annotations || !values.out) {
    console.error("usage: build-ics --data <dir> --annotations <dir> --out <dir> [--name StudioWeek]");
    process.exit(2);
  }

  const dataset = JSON.parse(await readFile(join(values.data, "dataset.json"), "utf8")) as Dataset;
  const { starred } = await loadAnnotations(values.annotations);
  const studios = new Map<string, StudioDirectoryEntry>(dataset.studios.map((s) => [s.id, s]));

  const { ics, matched, detachedKeys } = buildIcs(new Set(starred), dataset.classes, studios, {
    calendarName: values.name,
    generatedAt: dataset.generatedAt,
  });

  await mkdir(values.out, { recursive: true });
  const outFile = join(values.out, "studioweek.ics");
  await writeFile(outFile, ics);
  console.log(`${outFile}: ${matched} events from ${starred.length} starred keys`);
  for (const k of detachedKeys) console.warn(`detached star (no matching class this window): ${k}`);
}

void main();
