import type { Dataset } from "../../src/core/schema.ts";
import { App } from "./app.ts";
import { el } from "./ui.ts";
import { nyNow, wallDate } from "./time.ts";
import { computeWeek, renderDesktopBoard, renderMobileBoard } from "./views/board.ts";
import { renderDirectory } from "./views/directory.ts";
import { renderDetail } from "./views/detail.ts";

const root = document.getElementById("app")!;
const mobileQuery = window.matchMedia("(max-width: 760px)");

function render(app: App): void {
  root.replaceChildren();
  if (app.state.route === "directory") {
    root.append(renderDirectory(app));
  } else if (mobileQuery.matches) {
    root.append(renderMobileBoard(app));
    scrollToNow(app);
  } else {
    root.append(renderDesktopBoard(app));
  }
  const detail = renderDetail(app);
  if (detail) root.append(detail);
}

/** Mobile day view anchors to now: viewing today auto-scrolls to the next class. */
function scrollToNow(app: App): void {
  const { date, time } = nyNow();
  const data = computeWeek(app);
  if (data.days[app.state.day] !== date) return;
  const rows = root.querySelectorAll<HTMLElement>(".mrow[data-start]");
  for (const row of rows) {
    const start = row.dataset.start!;
    if (wallDate(start) === date && start.slice(11, 16) >= time) {
      row.scrollIntoView({ block: "center" });
      return;
    }
  }
}

async function boot(): Promise<void> {
  let dataset: Dataset;
  try {
    const res = await fetch("./dataset.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dataset = (await res.json()) as Dataset;
  } catch (e) {
    root.append(
      el(
        "div",
        { class: "board-empty", style: "border-top:0;padding:40px 26px" },
        `COULD NOT LOAD DATASET — ${(e as Error).message}`,
      ),
    );
    return;
  }
  const app = new App(dataset, render);
  // Some embedders resize the viewport without firing matchMedia "change";
  // watching resize for breakpoint crossings covers both.
  let wasMobile = mobileQuery.matches;
  window.addEventListener("resize", () => {
    if (mobileQuery.matches !== wasMobile) {
      wasMobile = mobileQuery.matches;
      render(app);
    }
  });
  render(app);
}

void boot();
