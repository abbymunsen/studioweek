import type { StudioConfig } from "../core/schema.ts";

/**
 * The adapter contract. One adapter per booking platform; one config per studio.
 * A new studio on a known platform is a config entry, not code.
 *
 * Adapters do exactly one thing: translate a platform's feed into
 * RawClassInstance[] for one studio inside the fetch window. They never see
 * tags, recurring keys, or timezone math — all of that is engine code
 * downstream — and they never import fetch or a browser directly; the runner
 * hands them an instrumented http client and (only when declared) a lazy
 * headless page. A JSON-endpoint platform and a rendered-page platform differ
 * only in which of those two they call.
 */
export interface PlatformAdapter {
  /** Unique id; studio configs reference this in their `platform` field. */
  id: string;
  /** Platform needs a rendered page rather than an HTTP endpoint. */
  needsBrowser?: boolean;
  /** Return every class instance inside ctx.window for one studio. Throw on failure. */
  fetch(studio: StudioConfig, ctx: FetchContext): Promise<RawClassInstance[]>;
}

export interface FetchContext {
  /** Home-zone local dates (inclusive start, exclusive end), e.g. today .. +21d. */
  window: { start: string; end: string };
  /** Wrapped fetch: UA, timeout, retries, per-host throttle. */
  http: HttpClient;
  /**
   * Lazy headless page (Playwright), provisioned at most once per run and only
   * when the adapter declares needsBrowser. Absent otherwise.
   */
  page?: () => Promise<unknown>;
  log: (msg: string) => void;
}

export interface HttpClient {
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  text(url: string, init?: RequestInit): Promise<string>;
}

export interface RawClassInstance {
  name: string;
  /** ISO 8601. With offset = absolute; naive = wall time in `timezone`. */
  start: string;
  end?: string;
  durationMins?: number;
  /** IANA zone for naive times. Defaults to America/New_York. */
  timezone?: string;
  teacher?: string;
  levelRaw?: string;
  bookingUrl: string;
  /** The platform's own id for this instance, if it has one — keeps ids stable. */
  sourceId?: string;
}
