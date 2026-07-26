/**
 * Per-run report. Written as summary.json next to the dataset and rendered as
 * markdown into the GitHub Actions job summary, so taxonomy upkeep (new
 * untagged names), exclusion auditing (what got dropped and by which rule),
 * and adapter health are all visible at a glance.
 */

export interface StudioRunReport {
  studio: string;
  ok: boolean;
  fetchedAt: string;
  /** True when this run failed and instances were carried forward from the previous dataset. */
  carriedForward: boolean;
  classCount: number;
  error: string | null;
  /** Distinct class names where no tag rule or override fired. */
  untaggedNames: string[];
  /** Ingest-time exclusions: rule pattern → distinct class names it dropped. */
  dropped: Record<string, string[]>;
}

export interface RunSummary {
  generatedAt: string;
  window: { start: string; end: string };
  studios: StudioRunReport[];
  /** Starred keys that matched no instance this run (annotation detached or class gone). */
  detachedStars: string[];
  totalClasses: number;
  /** Studios whose freshest data is older than the staleness threshold — these fail the run. */
  staleStudios: string[];
}

export function renderSummaryMarkdown(s: RunSummary): string {
  const lines: string[] = [
    `# StudioWeek fetch — ${s.generatedAt}`,
    "",
    `Window ${s.window.start} → ${s.window.end} · ${s.totalClasses} classes`,
    "",
    "| studio | status | classes | fetched |",
    "|---|---|---|---|",
  ];
  for (const r of s.studios) {
    const status = r.ok ? "ok" : r.carriedForward ? `FAILED (carried forward): ${r.error}` : `FAILED: ${r.error}`;
    lines.push(`| ${r.studio} | ${status} | ${r.classCount} | ${r.fetchedAt} |`);
  }
  const untagged = s.studios.filter((r) => r.untaggedNames.length > 0);
  if (untagged.length) {
    lines.push("", "## New/untagged class names");
    for (const r of untagged) lines.push(`- **${r.studio}**: ${r.untaggedNames.join(" · ")}`);
  }
  const dropped = s.studios.filter((r) => Object.keys(r.dropped).length > 0);
  if (dropped.length) {
    lines.push("", "## Dropped by exclusion rules");
    for (const r of dropped)
      for (const [rule, names] of Object.entries(r.dropped))
        lines.push(`- **${r.studio}** \`${rule}\`: ${names.join(" · ")}`);
  }
  if (s.detachedStars.length) {
    lines.push("", "## Detached stars (key matched no class this run)");
    for (const k of s.detachedStars) lines.push(`- \`${k}\``);
  }
  if (s.staleStudios.length) {
    lines.push("", `## STALE >24h — run failed`, ...s.staleStudios.map((x) => `- ${x}`));
  }
  return lines.join("\n") + "\n";
}
