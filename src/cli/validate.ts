import { parseArgs } from "node:util";
import { loadAdapters } from "../adapters/registry.ts";
import { loadAnnotations, loadStudios } from "./load.ts";

/**
 * CI entry point: every studio config and annotation file must parse, validate,
 * and cross-reference cleanly. Exit non-zero with all errors listed, not just
 * the first — config mistakes cluster.
 */

const KEY_SHAPE = /^[a-z0-9-]+\|[1-7]\|\d{2}:\d{2}\|[a-z0-9-]*$/;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      studios: { type: "string" },
      annotations: { type: "string" },
      adapters: { type: "string" },
    },
  });
  if (!values.studios) {
    console.error("usage: validate --studios <dir> [--annotations <dir>] [--adapters <dir>]");
    process.exit(2);
  }

  const errors: string[] = [];
  const push = (e: unknown) => errors.push(e instanceof Error ? e.message : String(e));

  let studios: Awaited<ReturnType<typeof loadStudios>> = [];
  try {
    studios = await loadStudios(values.studios);
  } catch (e) {
    push(e);
  }

  let adapterIds = new Set<string>();
  try {
    adapterIds = new Set((await loadAdapters(values.adapters)).keys());
  } catch (e) {
    push(e);
  }

  const shorts = new Map<string, string>();
  const colors = new Map<string, string>();
  for (const s of studios) {
    if (!adapterIds.has(s.platform)) errors.push(`${s.id}: unknown platform "${s.platform}"`);
    const dupShort = shorts.get(s.short);
    if (dupShort) errors.push(`${s.id}: short code "${s.short}" already used by ${dupShort}`);
    shorts.set(s.short, s.id);
    const dupColor = colors.get(s.color);
    if (dupColor) errors.push(`${s.id}: color ${s.color} already used by ${dupColor} (color encodes studio identity)`);
    colors.set(s.color, s.id);
  }

  if (values.annotations) {
    try {
      const ann = await loadAnnotations(values.annotations);
      const studioIds = new Set(studios.map((s) => s.id));
      for (const key of [...ann.starred, ...ann.overrides.keys()]) {
        if (!KEY_SHAPE.test(key)) {
          errors.push(`annotation key doesn't look like a recurring key: "${key}"`);
          continue;
        }
        const sid = key.split("|")[0]!;
        if (!studioIds.has(sid)) errors.push(`annotation key references unknown studio "${sid}": "${key}"`);
      }
      for (const [addr, entry] of Object.entries(ann.geo)) {
        for (const pinId of Object.keys(entry.minutes)) {
          if (!ann.pins.some((p) => p.id === pinId))
            errors.push(`geo.json "${addr}": minutes reference unknown pin "${pinId}"`);
        }
      }
    } catch (e) {
      push(e);
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`\n${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log(`✓ ${studios.length} studio config(s) valid`);
}

void main();
