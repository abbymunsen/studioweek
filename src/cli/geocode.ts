import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { GeoCacheSchema, type GeoCache } from "../core/schema.ts";
import { loadAnnotations, loadStudios } from "./load.ts";

/**
 * One-time setup helper, not part of the cron. Fills the geo cache:
 *
 *   - address → lat/lng via Nominatim (1 req/s, honest UA)
 *   - walking minutes per pin via the public OSRM server — a floor, not truth
 *   - transit minutes are HAND-ENTERED into geo.json and never overwritten
 *     here (OSRM/ORS don't route transit; see PLAN §9.3)
 *
 * Everything is cached by address text; re-running only fills gaps.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/foot";
const UA = "studioweek/0.1 (personal schedule aggregator; one-time setup)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const hits = (await res.json()) as { lat: string; lon: string }[];
  const hit = hits[0];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

async function walkingMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<number | null> {
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return null;
  const body = (await res.json()) as { routes?: { duration: number }[] };
  const duration = body.routes?.[0]?.duration;
  return duration === undefined ? null : Math.round(duration / 60);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { studios: { type: "string" }, annotations: { type: "string" } },
  });
  if (!values.studios || !values.annotations) {
    console.error("usage: geocode --studios <dir> --annotations <dir>");
    process.exit(2);
  }

  const studios = await loadStudios(values.studios);
  const { pins } = await loadAnnotations(values.annotations);
  const geoPath = join(values.annotations, "geo.json");
  const geo: GeoCache = existsSync(geoPath)
    ? GeoCacheSchema.parse(JSON.parse(await readFile(geoPath, "utf8")))
    : {};

  // Pins with addresses get coordinates cached under their address, like studios.
  const pinCoords = new Map<string, { lat: number; lng: number }>();
  const targets = [
    ...studios.map((s) => ({ label: s.id, address: s.address.text })),
    ...pins.flatMap((p) => (p.address ? [{ label: `pin:${p.id}`, address: p.address }] : [])),
  ];

  for (const t of targets) {
    if (!geo[t.address]) {
      console.log(`geocoding ${t.label}: ${t.address}`);
      const coords = await geocodeAddress(t.address);
      await sleep(1100);
      if (!coords) {
        console.warn(`  no result — fix the address or hand-enter lat/lng in geo.json`);
        continue;
      }
      geo[t.address] = { lat: coords.lat, lng: coords.lng, minutes: {} };
    }
    if (t.label.startsWith("pin:")) {
      const entry = geo[t.address]!;
      pinCoords.set(t.label.slice(4), { lat: entry.lat, lng: entry.lng });
    }
  }

  for (const s of studios) {
    const entry = geo[s.address.text];
    if (!entry) continue;
    for (const [pinId, coords] of pinCoords) {
      const m = (entry.minutes[pinId] ??= {});
      if (m.walk === undefined) {
        const walk = await walkingMinutes(coords, entry);
        if (walk !== null) {
          m.walk = walk;
          console.log(`${s.id} ← ${pinId}: walk ${walk} min${m.transit === undefined ? " (hand-enter transit)" : ""}`);
        }
        await sleep(500);
      }
    }
  }

  await writeFile(geoPath, JSON.stringify(geo, null, 2) + "\n");
  console.log(`wrote ${geoPath}`);
}

void main();
