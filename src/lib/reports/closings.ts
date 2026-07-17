/**
 * Monthly closing comments grouping (MV-18).
 * Absorbs the "Cierres del mes" section of the monthly BI report: per-area
 * closing comments grouped by period, most recent month first.
 *
 * Pure functions — no side effects, no store imports, no React dependencies.
 */

import type { ClosingComment } from "@/lib/domain";

// ============================================================================
// TYPES
// ============================================================================

/** Closing comments of one period. */
export interface ClosingPeriodGroup {
  /** Period, "YYYY-MM". */
  period: string;
  /** Comments of the period, sorted by area (deterministic). */
  comments: ClosingComment[];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Group closing comments by period, most recent month first. Inside each
 * group the comments are sorted by area name for a deterministic layout.
 */
export function groupClosingsByPeriod(comments: ClosingComment[]): ClosingPeriodGroup[] {
  const byPeriod = new Map<string, ClosingComment[]>();
  for (const comment of comments) {
    const list = byPeriod.get(comment.period) ?? [];
    list.push(comment);
    byPeriod.set(comment.period, list);
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, group]) => ({
      period,
      comments: [...group].sort((a, b) => a.area.localeCompare(b.area)),
    }));
}
