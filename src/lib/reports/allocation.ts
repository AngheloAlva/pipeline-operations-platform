/**
 * Allocation report aggregation (MV-17).
 * Distributes the received (Puerto Hernández / OTA) and delivered
 * (Terminal Concepción / OTC) volumes across shippers for one month,
 * with each shipper's share of the total delivered volume.
 *
 * Pure functions — no side effects, no store imports, no React dependencies.
 * Reuses the custody aggregation primitives (lib/volumetrics/custody).
 */

import type { CustodyDifference } from "@/lib/domain";
import {
  aggregateCustodyByShipper,
  sumCustodyAggregates,
} from "@/lib/volumetrics/custody";

// ============================================================================
// TYPES
// ============================================================================

/** One shipper's allocation for the selected month. */
export interface AllocationRow {
  shipperId: string;
  /** Volume received at origin (OTA), GSV 60°F, in m³. */
  originVolM3: number;
  /** Volume delivered at destination (OTC), GSV 60°F, in m³. */
  destVolM3: number;
  /** Difference: dest − origin (negative = transit loss). */
  diffM3: number;
  /** Difference as a percentage of the origin volume. */
  diffPct: number;
  /** Share of the TOTAL delivered volume for the month (%; 0 when total is 0). */
  sharePct: number;
}

/** Allocation view for one month: per-shipper rows + totals. */
export interface AllocationView {
  /** Month the view was built for ("YYYY-MM"). */
  month: string;
  /** Per-shipper rows, sorted by shipperId (deterministic). */
  rows: AllocationRow[];
  totalOriginM3: number;
  totalDestM3: number;
  /** Difference recomputed on the totals. */
  totalDiffM3: number;
  totalDiffPct: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Distinct months ("YYYY-MM") present in the records, most recent first.
 * Daily periods are normalized to their month.
 */
export function listAllocationMonths(records: CustodyDifference[]): string[] {
  const months = new Set<string>();
  for (const record of records) {
    months.add(record.period.slice(0, 7));
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

/**
 * Build the allocation view for one month: per-shipper received/delivered
 * volumes with each shipper's share of the total delivered volume.
 *
 * @param records - Custody difference records at any period granularity
 * @param month - Target month, "YYYY-MM"
 */
export function buildAllocationView(
  records: CustodyDifference[],
  month: string,
): AllocationView {
  const aggregates = aggregateCustodyByShipper(records, month);
  const totals = sumCustodyAggregates(aggregates);

  const rows: AllocationRow[] = aggregates.map((aggregate) => ({
    shipperId: aggregate.shipperId,
    originVolM3: aggregate.originVolM3,
    destVolM3: aggregate.destVolM3,
    diffM3: aggregate.diffM3,
    diffPct: aggregate.diffPct,
    sharePct:
      totals.destVolM3 !== 0 ? (aggregate.destVolM3 / totals.destVolM3) * 100 : 0,
  }));

  return {
    month,
    rows,
    totalOriginM3: totals.originVolM3,
    totalDestM3: totals.destVolM3,
    totalDiffM3: totals.diffM3,
    totalDiffPct: totals.diffPct,
  };
}
