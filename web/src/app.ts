import type { Dataset } from "../../src/core/schema.ts";
import { buildContext, type FilterContext } from "./filter.ts";
import {
  emptyFilters,
  filtersToHash,
  loadLastFilters,
  loadPresets,
  loadStars,
  parseHash,
  savePresets,
  saveLastFilters,
  saveStars,
  type AppState,
  type Filters,
  type Preset,
} from "./state.ts";
import { isoWeekday, nyNow } from "./time.ts";

/** App controller: owns state, persists what should persist, triggers re-render. */
export class App {
  state: AppState;
  ctx: FilterContext;
  presets: Preset[];
  private render: () => void;

  constructor(dataset: Dataset, render: (app: App) => void) {
    this.ctx = buildContext(dataset, loadStars() ?? new Set(dataset.starredKeys ?? []));
    this.presets = loadPresets();
    this.render = () => render(this);

    // Default view: the URL if it carries filters, else the last-used state —
    // never the unfiltered firehose (unless that's genuinely the last state).
    const fromHash = parseHash(location.hash);
    this.state = {
      route: fromHash?.route ?? "board",
      weekOffset: 0,
      day: isoWeekday(nyNow().date) - 1, // mobile day view anchors to today
      filters: fromHash?.filters ?? loadLastFilters() ?? emptyFilters(),
      detail: null,
      filtersOpen: false,
    };

    window.addEventListener("hashchange", () => {
      const parsed = parseHash(location.hash);
      if (!parsed) return;
      this.state.route = parsed.route;
      this.state.filters = parsed.filters;
      this.render();
    });
  }

  set(patch: Partial<AppState>): void {
    Object.assign(this.state, patch);
    this.render();
  }

  setFilters(patch: Partial<Filters>): void {
    this.state.filters = { ...this.state.filters, ...patch };
    saveLastFilters(this.state.filters);
    this.syncHash();
    this.render();
  }

  resetFilters(): void {
    this.state.filters = emptyFilters();
    saveLastFilters(this.state.filters);
    this.syncHash();
    this.render();
  }

  go(route: AppState["route"]): void {
    this.state.route = route;
    this.syncHash();
    this.render();
    window.scrollTo(0, 0);
  }

  private syncHash(): void {
    history.replaceState(null, "", filtersToHash(this.state.route, this.state.filters));
  }

  toggleStar(key: string): void {
    if (this.ctx.stars.has(key)) this.ctx.stars.delete(key);
    else this.ctx.stars.add(key);
    saveStars(this.ctx.stars);
    this.render();
  }

  pageDay(delta: number): void {
    let day = this.state.day + delta;
    let weekOffset = this.state.weekOffset;
    if (day < 0) (day = 6), (weekOffset -= 1);
    if (day > 6) (day = 0), (weekOffset += 1);
    this.set({ day, weekOffset });
  }

  applyPreset(p: Preset): void {
    this.state.filters = { ...emptyFilters(), ...p.filters };
    saveLastFilters(this.state.filters);
    this.syncHash();
    this.render();
  }

  savePreset(): void {
    const name = prompt("Preset name:")?.trim().toUpperCase();
    if (!name) return;
    this.presets = [...this.presets.filter((p) => p.name !== name), { name, filters: this.state.filters }];
    savePresets(this.presets);
    this.render();
  }

  deletePreset(name: string): void {
    this.presets = this.presets.filter((p) => p.name !== name);
    savePresets(this.presets);
    this.render();
  }
}
