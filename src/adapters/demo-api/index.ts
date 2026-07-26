import { DateTime } from "luxon";
import { z } from "zod";
import { HOME_ZONE } from "../../core/schema.ts";
import type { FetchContext, PlatformAdapter, RawClassInstance } from "../types.ts";
import type { StudioConfig } from "../../core/schema.ts";
import { instancesForSite } from "../synthetic.ts";

/**
 * Synthetic platform #1: a JSON-API-style booking system. Shaped like the real
 * thing — a versioned endpoint returning a typed payload with UTC timestamps —
 * except the transport is simulated: the payload is generated locally instead
 * of fetched, so the public repo runs with no network. Everything from the
 * payload boundary down (schema validation, UTC → home-zone conversion happens
 * later in normalize) is exactly what a real JSON adapter does.
 */

const PayloadSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      class_name: z.string(),
      starts_at: z.string(), // UTC ISO
      ends_at: z.string(),
      instructor: z.string().nullable(),
      difficulty: z.string().nullable(),
      booking_url: z.string(),
    }),
  ),
});

const ParamsSchema = z.object({ site: z.number().int().min(0) });

function simulateEndpoint(site: number, windowStart: string, windowEnd: string): unknown {
  // What GET /api/v2/sites/{site}/sessions?from=…&to=… would return.
  return {
    sessions: instancesForSite(site, windowStart, windowEnd).map((s) => {
      const start = DateTime.fromISO(`${s.date}T${s.time}`, { zone: HOME_ZONE });
      return {
        id: s.sourceId,
        class_name: s.name,
        starts_at: start.toUTC().toISO({ suppressMilliseconds: true }),
        ends_at: start.plus({ minutes: s.mins }).toUTC().toISO({ suppressMilliseconds: true }),
        instructor: s.teacher || null,
        difficulty: s.levelRaw,
        booking_url: `https://booking.example/demo-api/${site}/${s.sourceId}`,
      };
    }),
  };
}

const adapter: PlatformAdapter = {
  id: "demo-api",
  async fetch(studio: StudioConfig, ctx: FetchContext): Promise<RawClassInstance[]> {
    const { site } = ParamsSchema.parse(studio.platform_params);
    ctx.log(`demo-api: site ${site}, window ${ctx.window.start}..${ctx.window.end}`);
    const payload = PayloadSchema.parse(simulateEndpoint(site, ctx.window.start, ctx.window.end));
    return payload.sessions.map((s) => ({
      name: s.class_name,
      start: s.starts_at, // has offset → absolute; normalize converts to home zone
      end: s.ends_at,
      teacher: s.instructor ?? undefined,
      levelRaw: s.difficulty ?? undefined,
      bookingUrl: s.booking_url,
      sourceId: s.id,
    }));
  },
};

export default adapter;
