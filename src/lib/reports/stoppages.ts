/**
 * Pipeline stoppage report aggregation (MV-18).
 * Absorbs the "Detenciones de línea" section of the monthly BI report:
 * per-month totals (count + hours), a responsible-side breakdown, and the
 * event list sorted for display.
 *
 * Pure functions — no side effects, no store imports, no React dependencies.
 */

import type { PipelineStoppage } from "@/lib/domain";
import { StoppageResponsible } from "@/lib/domain";

// ============================================================================
// TYPES
// ============================================================================

/** One month of the stoppage series. */
export interface StoppageMonthRow {
  /** Period, "YYYY-MM". */
  period: string;
  /** Number of stoppage events in the month. */
  count: number;
  /** Total stopped hours in the month. */
  totalHours: number;
}

/** Aggregated stoppages for one responsible side. */
export interface StoppageResponsibleRow {
  responsible: StoppageResponsible;
  count: number;
  totalHours: number;
  /** Share of the total stopped hours (%; 0 when the total is 0). */
  sharePct: number;
}

/** Overall stoppage totals. */
export interface StoppageTotals {
  count: number;
  totalHours: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Deterministic display order for responsible sides. */
const RESPONSIBLE_ORDER: StoppageResponsible[] = [
  StoppageResponsible.OTA,
  StoppageResponsible.OTC,
  StoppageResponsible.BOTH,
];

/**
 * Total stoppage count and hours per month, sorted ascending by period.
 * Only months with events appear — the seed is sparse and no month is
 * fabricated with zeros.
 */
export function buildStoppageMonthlySeries(
  stoppages: PipelineStoppage[],
): StoppageMonthRow[] {
  const byPeriod = new Map<string, PipelineStoppage[]>();
  for (const stoppage of stoppages) {
    const list = byPeriod.get(stoppage.period) ?? [];
    list.push(stoppage);
    byPeriod.set(stoppage.period, list);
  }

  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, group]) => ({
      period,
      count: group.length,
      totalHours: group.reduce((sum, s) => sum + s.durationHours, 0),
    }));
}

/**
 * Breakdown per responsible side (OTA, OTC, BOTH order), with each side's
 * share of the total stopped hours. Sides without events are omitted.
 */
export function summarizeStoppagesByResponsible(
  stoppages: PipelineStoppage[],
): StoppageResponsibleRow[] {
  const totalHours = stoppages.reduce((sum, s) => sum + s.durationHours, 0);

  return RESPONSIBLE_ORDER.flatMap((responsible) => {
    const group = stoppages.filter((s) => s.responsible === responsible);
    if (group.length === 0) return [];
    const hours = group.reduce((sum, s) => sum + s.durationHours, 0);
    return [
      {
        responsible,
        count: group.length,
        totalHours: hours,
        sharePct: totalHours !== 0 ? (hours / totalHours) * 100 : 0,
      },
    ];
  });
}

/** Events sorted by start time, most recent first. Does not mutate the input. */
export function sortStoppagesByStartDesc(
  stoppages: PipelineStoppage[],
): PipelineStoppage[] {
  return [...stoppages].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Overall event count and stopped hours across all events. */
export function sumStoppages(stoppages: PipelineStoppage[]): StoppageTotals {
  return {
    count: stoppages.length,
    totalHours: stoppages.reduce((sum, s) => sum + s.durationHours, 0),
  };
}
