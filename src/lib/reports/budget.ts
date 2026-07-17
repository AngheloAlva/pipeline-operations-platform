/**
 * Ppto vs Real report aggregation (MV-17).
 * Builds the monthly budget-vs-actual series from VolumeTarget TOTAL rows
 * (shipperId undefined) of the seeded 12-month series.
 *
 * Pure functions — no side effects, no store imports, no React dependencies.
 * Band classification reuses computeCompliance (lib/volumetrics/compliance).
 */

import type { VolumeTarget } from "@/lib/domain";
import { computeCompliance } from "@/lib/volumetrics/compliance";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";

// ============================================================================
// TYPES
// ============================================================================

/** One month of the Ppto vs Real series. Derived fields are null for future months. */
export interface BudgetVsRealRow {
  /** Period, "YYYY-MM". */
  period: string;
  budgetM3: number;
  programM3: number;
  /** Actual executed volume (null when the month is not closed yet). */
  realM3: number | null;
  /** real / budget × 100 (null without real; 0 when budget is 0). */
  cumplimientoPresupuestoPct: number | null;
  /** real / program × 100 (null without real; 0 when program is 0). */
  cumplimientoProgramaPct: number | null;
  /** real − budget (null without real). */
  varianceM3: number | null;
  /** Tolerance band vs program AND budget (null without real). */
  band: ComplianceBand | null;
}

/** Totals across closed months (realM3 present). */
export interface BudgetVsRealTotal {
  budgetM3: number;
  programM3: number;
  realM3: number;
  varianceM3: number;
  /** Recomputed on the totals (0 when no closed months / zero budget). */
  cumplimientoPresupuestoPct: number;
  cumplimientoProgramaPct: number;
  /** Band recomputed on the totals; null when no month is closed. */
  band: ComplianceBand | null;
  /** Number of months included in the total. */
  closedMonths: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Default window: the seeded 12-month report series (MV-4). */
const DEFAULT_MONTHS = 12;

/**
 * Build the monthly Ppto vs Real series from VolumeTarget records.
 * Only TOTAL targets (shipperId undefined) participate; per-shipper targets
 * are excluded. The series is sorted ascending by period and limited to the
 * most recent `limit` months (default 12).
 */
export function buildBudgetVsRealSeries(
  targets: VolumeTarget[],
  limit: number = DEFAULT_MONTHS,
): BudgetVsRealRow[] {
  const totals = targets
    .filter((t) => t.shipperId === undefined)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-limit);

  return totals.map((t) => {
    if (t.realM3 === undefined) {
      return {
        period: t.period,
        budgetM3: t.budgetM3,
        programM3: t.programM3,
        realM3: null,
        cumplimientoPresupuestoPct: null,
        cumplimientoProgramaPct: null,
        varianceM3: null,
        band: null,
      };
    }

    const compliance = computeCompliance({
      shipperId: t.period,
      real: t.realM3,
      programa: t.programM3,
      presupuesto: t.budgetM3,
    });

    return {
      period: t.period,
      budgetM3: t.budgetM3,
      programM3: t.programM3,
      realM3: t.realM3,
      cumplimientoPresupuestoPct: compliance.cumplimientoPresupuesto,
      cumplimientoProgramaPct: compliance.cumplimientoPrograma,
      varianceM3: t.realM3 - t.budgetM3,
      band: compliance.band,
    };
  });
}

/**
 * Total the series over CLOSED months only (realM3 present), recomputing
 * the percentages and the tolerance band on the totals.
 */
export function sumBudgetVsRealClosed(rows: BudgetVsRealRow[]): BudgetVsRealTotal {
  const closed = rows.filter(
    (r): r is BudgetVsRealRow & { realM3: number } => r.realM3 !== null,
  );

  if (closed.length === 0) {
    return {
      budgetM3: 0,
      programM3: 0,
      realM3: 0,
      varianceM3: 0,
      cumplimientoPresupuestoPct: 0,
      cumplimientoProgramaPct: 0,
      band: null,
      closedMonths: 0,
    };
  }

  const budgetM3 = closed.reduce((sum, r) => sum + r.budgetM3, 0);
  const programM3 = closed.reduce((sum, r) => sum + r.programM3, 0);
  const realM3 = closed.reduce((sum, r) => sum + r.realM3, 0);

  const compliance = computeCompliance({
    shipperId: "total",
    real: realM3,
    programa: programM3,
    presupuesto: budgetM3,
  });

  return {
    budgetM3,
    programM3,
    realM3,
    varianceM3: realM3 - budgetM3,
    cumplimientoPresupuestoPct: compliance.cumplimientoPresupuesto,
    cumplimientoProgramaPct: compliance.cumplimientoPrograma,
    band: compliance.band,
    closedMonths: closed.length,
  };
}
