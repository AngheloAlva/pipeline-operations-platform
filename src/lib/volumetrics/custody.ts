/**
 * Custody transfer difference logic (MV-1).
 * Reconciles the origin measurement point (Puerto Hernández / OTA) against
 * the destination (Terminal Concepción / OTC) per shipper, with daily,
 * monthly, and year-to-date aggregation. Both volumes are GSV at 60°F.
 * All functions are pure — no side effects.
 */

import type { CustodyDifference } from "@/lib/domain";
import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN } from "@/lib/domain";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";

/** Derived difference figures between origin and destination volumes. */
export interface CustodyDiffResult {
  /** Difference: destVolM3 − originVolM3 (negative = transit loss). */
  diffM3: number;
  /** Difference as a percentage of originVolM3 (0 when origin is 0). */
  diffPct: number;
}

/** Aggregated custody totals for one shipper over a set of records. */
export interface CustodyAggregate {
  shipperId: string;
  originVolM3: number;
  destVolM3: number;
  diffM3: number;
  diffPct: number;
  /** Number of records included in the aggregate. */
  recordCount: number;
}

/**
 * Compute the custody difference between origin and destination volumes.
 * diffM3 = dest − origin; diffPct is relative to origin.
 * A zero origin yields diffPct 0 to avoid division by zero.
 *
 * @param originVolM3 - Volume measured at origin (OTA), GSV 60°F, in m³
 * @param destVolM3 - Volume measured at destination (OTC), GSV 60°F, in m³
 */
export function computeCustodyDiff(originVolM3: number, destVolM3: number): CustodyDiffResult {
  const diffM3 = destVolM3 - originVolM3;
  const diffPct = originVolM3 !== 0 ? (diffM3 / originVolM3) * 100 : 0;
  return { diffM3, diffPct };
}

/** Input for building a CustodyDifference record (diff fields are derived). */
export interface CustodyDifferenceInput {
  id: string;
  period: string;
  shipperId: string;
  originVolM3: number;
  destVolM3: number;
}

/**
 * Build a complete CustodyDifference record, deriving diffM3/diffPct
 * from the origin and destination volumes.
 */
export function makeCustodyDifference(input: CustodyDifferenceInput): CustodyDifference {
  const { diffM3, diffPct } = computeCustodyDiff(input.originVolM3, input.destVolM3);
  return { ...input, diffM3, diffPct };
}

/**
 * Aggregate custody records per shipper, optionally filtered by period prefix.
 * The prefix enables daily ("2026-05-10"), monthly ("2026-05"), or yearly
 * ("2026") aggregation over records with daily or monthly periods.
 * Output is sorted by shipperId for deterministic results.
 *
 * @param records - Custody difference records to aggregate
 * @param periodPrefix - Optional period prefix filter (omit for all records)
 */
export function aggregateCustodyByShipper(
  records: CustodyDifference[],
  periodPrefix?: string,
): CustodyAggregate[] {
  const filtered = periodPrefix
    ? records.filter((r) => r.period.startsWith(periodPrefix))
    : records;

  const byShipper = new Map<string, CustodyDifference[]>();
  for (const record of filtered) {
    const list = byShipper.get(record.shipperId) ?? [];
    list.push(record);
    byShipper.set(record.shipperId, list);
  }

  return [...byShipper.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shipperId, group]) => {
      const originVolM3 = group.reduce((sum, r) => sum + r.originVolM3, 0);
      const destVolM3 = group.reduce((sum, r) => sum + r.destVolM3, 0);
      const { diffM3, diffPct } = computeCustodyDiff(originVolM3, destVolM3);
      return { shipperId, originVolM3, destVolM3, diffM3, diffPct, recordCount: group.length };
    });
}

/**
 * Roll daily (or mixed-granularity) records up to one record per
 * (shipper, month). The month is the first 7 characters of the period
 * ("YYYY-MM"); records already at monthly granularity pass through summed.
 * Rollup ids are stable: "CD-{shipperId}-{YYYY-MM}".
 *
 * @param records - Custody difference records at any period granularity
 */
export function rollupCustodyMonthly(records: CustodyDifference[]): CustodyDifference[] {
  const byKey = new Map<
    string,
    { shipperId: string; period: string; records: CustodyDifference[] }
  >();

  for (const record of records) {
    const month = record.period.slice(0, 7);
    const key = `${record.shipperId}:${month}`;
    const entry = byKey.get(key) ?? { shipperId: record.shipperId, period: month, records: [] };
    entry.records.push(record);
    byKey.set(key, entry);
  }

  return [...byKey.values()].map(({ shipperId, period, records: group }) => {
    const originVolM3 = group.reduce((sum, r) => sum + r.originVolM3, 0);
    const destVolM3 = group.reduce((sum, r) => sum + r.destVolM3, 0);
    return makeCustodyDifference({
      id: `CD-${shipperId}-${period}`,
      period,
      shipperId,
      originVolM3,
      destVolM3,
    });
  });
}

/**
 * Aggregate custody records per shipper year-to-date: all records in the
 * same year as `throughPeriod` whose month is at or before it.
 *
 * @param records - Custody difference records at any period granularity
 * @param throughPeriod - Inclusive upper bound, e.g. "2026-05"
 */
export function custodyYearToDate(
  records: CustodyDifference[],
  throughPeriod: string,
): CustodyAggregate[] {
  const year = throughPeriod.slice(0, 4);
  const throughMonth = throughPeriod.slice(0, 7);
  const inRange = records.filter(
    (r) => r.period.slice(0, 4) === year && r.period.slice(0, 7) <= throughMonth,
  );
  return aggregateCustodyByShipper(inRange);
}

// ============================================================================
// MV-15 — panel helpers (tolerance band + period views)
// ============================================================================

/**
 * Classify a custody difference percentage against the balance tolerances:
 * |diffPct| ≤ BALANCE_TOLERANCE_OK (±0.5 %) → "ok",
 * |diffPct| ≤ BALANCE_TOLERANCE_WARN (±1.0 %) → "warning", beyond → "critical".
 * Bounds are inclusive.
 */
export function custodyToleranceBand(diffPct: number): ComplianceBand {
  const abs = Math.abs(diffPct);
  if (abs <= BALANCE_TOLERANCE_OK) return "ok";
  if (abs <= BALANCE_TOLERANCE_WARN) return "warning";
  return "critical";
}

/** Most recent month ("YYYY-MM") present in the records, or null when empty. */
export function latestCustodyMonth(records: CustodyDifference[]): string | null {
  let latest: string | null = null;
  for (const record of records) {
    const month = record.period.slice(0, 7);
    if (latest === null || month > latest) latest = month;
  }
  return latest;
}

/** Number of calendar days in a "YYYY-MM" month. */
function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

/**
 * Per-shipper daily average for one month: the month aggregate divided by the
 * calendar days of that month. diffPct is scale-invariant, so it matches the
 * monthly aggregate. Used as the "day" view when only monthly records exist.
 *
 * @param records - Custody difference records at any period granularity
 * @param month - Target month, "YYYY-MM"
 */
export function custodyDailyAverage(
  records: CustodyDifference[],
  month: string,
): CustodyAggregate[] {
  const days = daysInMonth(month);
  return aggregateCustodyByShipper(records, month).map((aggregate) => {
    const originVolM3 = aggregate.originVolM3 / days;
    const destVolM3 = aggregate.destVolM3 / days;
    const { diffM3, diffPct } = computeCustodyDiff(originVolM3, destVolM3);
    return { ...aggregate, originVolM3, destVolM3, diffM3, diffPct };
  });
}

/** Period views supported by the custody difference panel (MV-15). */
export type CustodyPeriodView = "day" | "month" | "ytd";

/** Result of custodyViewAggregates: the resolved anchor month + aggregates. */
export interface CustodyView {
  view: CustodyPeriodView;
  /** Anchor month ("YYYY-MM") the view resolved to; null when no records. */
  month: string | null;
  /** True when the "day" view fell back to the monthly daily average. */
  dailyAverage: boolean;
  aggregates: CustodyAggregate[];
}

/**
 * Resolve the per-shipper aggregates for one panel view, anchored to the
 * reference day. The anchor month is the reference day's month when records
 * for it exist, otherwise the latest month available (seed fallback — same
 * rule the hero custody chip uses).
 *
 * Views:
 * - "day": exact records for the reference day when present; otherwise the
 *   anchor month's daily average (monthly seeds have no daily granularity).
 * - "month": the anchor month aggregate.
 * - "ytd": the anchor month's year, up to and including that month.
 *
 * @param records - Custody difference records
 * @param view - Panel period view
 * @param referenceDay - Reference day, "YYYY-MM-DD" (typically the sim day)
 */
export function custodyViewAggregates(
  records: CustodyDifference[],
  view: CustodyPeriodView,
  referenceDay: string,
): CustodyView {
  const referenceMonth = referenceDay.slice(0, 7);
  const hasReferenceMonth = records.some((r) => r.period.slice(0, 7) === referenceMonth);
  const month = hasReferenceMonth ? referenceMonth : latestCustodyMonth(records);
  if (month === null) return { view, month: null, dailyAverage: false, aggregates: [] };

  if (view === "day") {
    const daily = aggregateCustodyByShipper(records, referenceDay);
    const dailyAverage = daily.length === 0;
    const aggregates = dailyAverage ? custodyDailyAverage(records, month) : daily;
    return { view, month, dailyAverage, aggregates };
  }

  if (view === "month") {
    return {
      view,
      month,
      dailyAverage: false,
      aggregates: aggregateCustodyByShipper(records, month),
    };
  }

  return { view, month, dailyAverage: false, aggregates: custodyYearToDate(records, month) };
}

/**
 * Total origin/destination volumes across a set of per-shipper aggregates,
 * with the difference recomputed on the totals (panel total row, MV-15).
 */
export function sumCustodyAggregates(aggregates: CustodyAggregate[]): CustodyDiffResult & {
  originVolM3: number;
  destVolM3: number;
} {
  const originVolM3 = aggregates.reduce((sum, a) => sum + a.originVolM3, 0);
  const destVolM3 = aggregates.reduce((sum, a) => sum + a.destVolM3, 0);
  const { diffM3, diffPct } = computeCustodyDiff(originVolM3, destVolM3);
  return { originVolM3, destVolM3, diffM3, diffPct };
}
