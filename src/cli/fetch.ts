import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DateTime } from "luxon";
import {
  HOME_ZONE,
  type ClassInstance,
  type Dataset,
  type StudioConfig,
  type StudioDirectoryEntry,
} from "../core/schema.ts";
import { normalizeInstance, NormalizeError } from "../core/normalize.ts";
import { applyTagCascade } from "../core/tags.ts";
import { renderSummaryMarkdown, type RunSummary, type StudioRunReport } from "../core/summary.ts";
import { loadAdapters } from "../adapters/registry.ts";
import type { FetchContext, HttpClient } from "../adapters/types.ts";
import { loadAnnotations, loadStudios, type Annotations } from "./load.ts";

/**
 * The pipeline: fetch → normalize → tag → merge → dataset.json + summary.json.
 *
 * Failure policy (PLAN §6): a studio whose adapter throws keeps its previous
 * instances (carried forward) and is badged stale in the frontend; a single
 * failed run is a warning, but once a studio's freshest data is >24h old the
 * whole run exits non-zero. Red means "go fix an adapter."
 */

const STALE_HOURS = 24;
const USER_AGENT = "studioweek/0.1 (personal schedule aggregator)";

function makeHttp(log: (m: string) => void): HttpClient {
  async function request(url: string, init?: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res;
      } catch (e) {
        if (attempt >= 3) throw e;
        log(`retry ${attempt} after error: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return {
    json: async <T>(url: string, init?: RequestInit) => (await request(url, init)).json() as Promise<T>,
    text: async (url: string, init?: RequestInit) => (await request(url, init)).text(),
  };
}

/** Playwright is an optional dependency: loaded lazily, only when some adapter declares needsBrowser. */
function makePageProvider(log: (m: string) => void): () => Promise<unknown> {
  let browserPromise: Promise<{ newPage(): Promise<unknown>; close(): Promise<void> }> | null = null;
  return async () => {
    if (!browserPromise) {
      log("launching headless browser");
      browserPromise = import("playwright" as string).then((pw) => pw.chromium.launch());
    }
    return (await browserPromise).newPage();
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      studios: { type: "string" },
      annotations: { type: "string" },
      adapters: { type: "string" },
      out: { type: "string" },
      "window-days": { type: "string", default: "21" },
    },
  });
  if (!values.studios || !values.out) {
    console.error("usage: fetch --studios <dir> --out <dir> [--annotations <dir>] [--adapters <dir>] [--window-days 21]");
    process.exit(2);
  }

  const now = DateTime.now().setZone(HOME_ZONE);
  const window = {
    start: now.toISODate()!,
    end: now.plus({ days: Number(values["window-days"]) }).toISODate()!,
  };

  const studios = await loadStudios(values.studios);
  const annotations: Annotations = values.annotations
    ? await loadAnnotations(values.annotations)
    : { starred: [], overrides: new Map(), pins: [], tagGroups: {}, geo: {} };
  const adapters = await loadAdapters(values.adapters);

  // Previous dataset feeds carry-forward and the staleness clock.
  const datasetPath = join(values.out, "dataset.json");
  const prior: Dataset | null = existsSync(datasetPath)
    ? (JSON.parse(await readFile(datasetPath, "utf8")) as Dataset)
    : null;

  const reports: StudioRunReport[] = [];
  const allClasses: ClassInstance[] = [];
  const directory: StudioDirectoryEntry[] = [];

  for (const studio of studios) {
    const adapter = adapters.get(studio.platform);
    const log = (m: string) => console.log(`[${studio.id}] ${m}`);
    const report: StudioRunReport = {
      studio: studio.id,
      ok: false,
      fetchedAt: now.toISO()!,
      carriedForward: false,
      classCount: 0,
      error: null,
      untaggedNames: [],
      dropped: {},
    };
    let classes: ClassInstance[] = [];

    try {
      if (!adapter) throw new Error(`unknown platform "${studio.platform}"`);
      const ctx: FetchContext = {
        window,
        http: makeHttp(log),
        ...(adapter.needsBrowser ? { page: makePageProvider(log) } : {}),
        log,
      };
      const raws = await adapter.fetch(studio, ctx);

      const untagged = new Set<string>();
      let skipped = 0;
      for (const raw of raws) {
        let normalized;
        try {
          normalized = normalizeInstance(raw, studio.id);
        } catch (e) {
          if (e instanceof NormalizeError) {
            skipped++;
            log(`skipping record: ${e.message}`);
            continue;
          }
          throw e;
        }
        const cascade = applyTagCascade(normalized.name, studio, annotations.overrides.get(normalized.key));
        if (cascade.excluded) {
          const droppedNames = (report.dropped[cascade.rule] ??= []);
          if (!droppedNames.includes(normalized.name)) droppedNames.push(normalized.name);
          continue;
        }
        if (cascade.untaggedName) untagged.add(normalized.name);
        classes.push({ ...normalized, tags: cascade.tags, untaggedName: cascade.untaggedName });
      }
      if (skipped > 0) log(`WARNING: skipped ${skipped} unparseable records`);
      report.ok = true;
      report.untaggedNames = [...untagged].sort();
    } catch (e) {
      report.error = (e as Error).message;
      log(`FAILED: ${report.error}`);
      const priorStudio = prior?.studios.find((s) => s.id === studio.id);
      if (priorStudio && prior) {
        report.carriedForward = true;
        report.fetchedAt = priorStudio.fetch.fetchedAt;
        classes = prior.classes.filter((c) => c.studio === studio.id);
      }
    }

    report.classCount = classes.length;
    reports.push(report);
    allClasses.push(...classes);

    const geo = annotations.geo[studio.address.text];
    const minutesFrom: Record<string, number> = {};
    for (const pin of annotations.pins) {
      const m = geo?.minutes[pin.id];
      const best = m?.transit ?? m?.walk;
      if (best !== undefined) minutesFrom[pin.id] = best;
    }
    directory.push({
      id: studio.id,
      name: studio.name,
      short: studio.short,
      color: studio.color,
      hood: studio.address.hood,
      address: studio.address.text,
      geo: geo ? { lat: geo.lat, lng: geo.lng } : null,
      minutesFrom,
      pricing: studio.pricing,
      arrivalBufferMins: studio.arrival_buffer_mins,
      tags: studio.tags,
      notes: studio.notes,
      links: studio.links,
      teachers: studio.teachers,
      fetch: { ok: report.ok, fetchedAt: report.fetchedAt, error: report.error },
    });
  }

  allClasses.sort((a, b) => a.start.localeCompare(b.start) || a.studio.localeCompare(b.studio));

  const presentKeys = new Set(allClasses.map((c) => c.key));
  const detachedStars = annotations.starred.filter((k) => !presentKeys.has(k));
  const staleStudios = reports
    .filter((r) => DateTime.fromISO(r.fetchedAt) < now.minus({ hours: STALE_HOURS }))
    .map((r) => `${r.studio} (last good fetch ${r.fetchedAt})`);

  const dataset: Dataset = {
    generatedAt: now.toISO({ suppressMilliseconds: true })!,
    window,
    studios: directory,
    classes: allClasses,
    tagGroups: annotations.tagGroups,
    pins: annotations.pins.map(({ id, label }) => ({ id, label })),
    starredKeys: annotations.starred,
  };
  const summary: RunSummary = {
    generatedAt: dataset.generatedAt,
    window,
    studios: reports,
    detachedStars,
    totalClasses: allClasses.length,
    staleStudios,
  };

  await mkdir(values.out, { recursive: true });
  await writeFile(datasetPath, JSON.stringify(dataset, null, 2) + "\n");
  await writeFile(join(values.out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const md = renderSummaryMarkdown(summary);
  console.log("\n" + md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);

  if (staleStudios.length > 0) {
    console.error(`STALE: ${staleStudios.length} studio(s) older than ${STALE_HOURS}h — failing the run`);
    process.exit(1);
  }
}

void main();
