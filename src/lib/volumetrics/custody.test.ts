/**
 * Tests for custody transfer difference logic (MV-1).
 * Written first (TDD RED) before implementation exists.
 * Covers the OTA (Puerto Hernández) ↔ OTC (Terminal Concepción) reconciliation.
 */
import { describe, it, expect } from "vitest";
import {
  computeCustodyDiff,
  makeCustodyDifference,
  aggregateCustodyByShipper,
  rollupCustodyMonthly,
  custodyYearToDate,
  custodyToleranceBand,
  latestCustodyMonth,
  custodyDailyAverage,
  custodyViewAggregates,
  sumCustodyAggregates,
} from "./custody";
import type { CustodyDifference } from "@/lib/domain";
import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function record(
  id: string,
  period: string,
  shipperId: string,
  originVolM3: number,
  destVolM3: number,
): CustodyDifference {
  return makeCustodyDifference({ id, period, shipperId, originVolM3, destVolM3 });
}

const DAILY_RECORDS: CustodyDifference[] = [
  record("CD-1", "2026-05-10", "SHP-A", 1000, 998),
  record("CD-2", "2026-05-10", "SHP-B", 2000, 2004),
  record("CD-3", "2026-05-11", "SHP-A", 1500, 1500),
  record("CD-4", "2026-06-01", "SHP-A", 3000, 2985),
  record("CD-5", "2025-12-31", "SHP-A", 500, 499),
];

// ---------------------------------------------------------------------------
// computeCustodyDiff
// ---------------------------------------------------------------------------

describe("computeCustodyDiff", () => {
  it("computes a negative diff when destination receives less than origin (transit loss)", () => {
    const result = computeCustodyDiff(1000, 995);
    expect(result.diffM3).toBe(-5);
    expect(result.diffPct).toBeCloseTo(-0.5, 10);
  });

  it("computes a positive diff when destination measures more than origin", () => {
    const result = computeCustodyDiff(1000, 1002);
    expect(result.diffM3).toBe(2);
    expect(result.diffPct).toBeCloseTo(0.2, 10);
  });

  it("returns zero diff and zero pct for identical volumes", () => {
    const result = computeCustodyDiff(1234.5, 1234.5);
    expect(result.diffM3).toBe(0);
    expect(result.diffPct).toBe(0);
  });

  it("guards division by zero: origin 0 yields diffPct 0", () => {
    const result = computeCustodyDiff(0, 10);
    expect(result.diffM3).toBe(10);
    expect(result.diffPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// makeCustodyDifference
// ---------------------------------------------------------------------------

describe("makeCustodyDifference", () => {
  it("builds a full CustodyDifference with derived diff fields", () => {
    const cd = makeCustodyDifference({
      id: "CDF-0001",
      period: "2026-05",
      shipperId: "SHP-0001",
      originVolM3: 40000,
      destVolM3: 39900,
    });
    expect(cd).toEqual({
      id: "CDF-0001",
      period: "2026-05",
      shipperId: "SHP-0001",
      originVolM3: 40000,
      destVolM3: 39900,
      diffM3: -100,
      diffPct: -0.25,
    });
  });
});

// ---------------------------------------------------------------------------
// aggregateCustodyByShipper
// ---------------------------------------------------------------------------

describe("aggregateCustodyByShipper", () => {
  it("groups all records per shipper and recomputes totals", () => {
    const aggregates = aggregateCustodyByShipper(DAILY_RECORDS);
    expect(aggregates).toHaveLength(2);

    const shipperA = aggregates.find((a) => a.shipperId === "SHP-A");
    expect(shipperA).toBeDefined();
    expect(shipperA!.originVolM3).toBe(1000 + 1500 + 3000 + 500);
    expect(shipperA!.destVolM3).toBe(998 + 1500 + 2985 + 499);
    expect(shipperA!.diffM3).toBeCloseTo(-18, 10);
    expect(shipperA!.recordCount).toBe(4);
  });

  it("filters by period prefix for a single day (daily aggregation)", () => {
    const aggregates = aggregateCustodyByShipper(DAILY_RECORDS, "2026-05-10");
    expect(aggregates).toHaveLength(2);
    const shipperA = aggregates.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(1000);
    expect(shipperA!.diffM3).toBe(-2);
  });

  it("filters by period prefix for a month (monthly aggregation)", () => {
    const aggregates = aggregateCustodyByShipper(DAILY_RECORDS, "2026-05");
    const shipperA = aggregates.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(2500);
    expect(shipperA!.recordCount).toBe(2);
  });

  it("returns an empty array when no record matches the prefix", () => {
    expect(aggregateCustodyByShipper(DAILY_RECORDS, "2030-01")).toEqual([]);
  });

  it("sorts aggregates by shipperId for deterministic output", () => {
    const aggregates = aggregateCustodyByShipper(DAILY_RECORDS);
    expect(aggregates.map((a) => a.shipperId)).toEqual(["SHP-A", "SHP-B"]);
  });
});

// ---------------------------------------------------------------------------
// rollupCustodyMonthly
// ---------------------------------------------------------------------------

describe("rollupCustodyMonthly", () => {
  it("rolls daily records up to one record per (shipper, month)", () => {
    const monthly = rollupCustodyMonthly(DAILY_RECORDS);
    // (SHP-A, 2026-05), (SHP-B, 2026-05), (SHP-A, 2026-06), (SHP-A, 2025-12)
    expect(monthly).toHaveLength(4);

    const mayA = monthly.find((m) => m.shipperId === "SHP-A" && m.period === "2026-05");
    expect(mayA).toBeDefined();
    expect(mayA!.originVolM3).toBe(2500);
    expect(mayA!.destVolM3).toBe(2498);
    expect(mayA!.diffM3).toBeCloseTo(-2, 10);
  });

  it("derives a stable id from shipper and month", () => {
    const monthly = rollupCustodyMonthly(DAILY_RECORDS);
    const mayA = monthly.find((m) => m.shipperId === "SHP-A" && m.period === "2026-05");
    expect(mayA!.id).toBe("CD-SHP-A-2026-05");
  });

  it("keeps monthly input records intact (already YYYY-MM periods)", () => {
    const input = [record("CD-M", "2026-04", "SHP-A", 100, 99)];
    const monthly = rollupCustodyMonthly(input);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].period).toBe("2026-04");
    expect(monthly[0].originVolM3).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// custodyYearToDate
// ---------------------------------------------------------------------------

describe("custodyYearToDate", () => {
  it("aggregates only records of the same year up to the given period", () => {
    const ytd = custodyYearToDate(DAILY_RECORDS, "2026-05");
    const shipperA = ytd.find((a) => a.shipperId === "SHP-A");
    // Includes 2026-05 records; excludes 2026-06 and 2025-12
    expect(shipperA!.originVolM3).toBe(2500);
    expect(shipperA!.recordCount).toBe(2);
  });

  it("includes all months up to and including the through period", () => {
    const ytd = custodyYearToDate(DAILY_RECORDS, "2026-06");
    const shipperA = ytd.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(2500 + 3000);
    expect(shipperA!.recordCount).toBe(3);
  });

  it("excludes records from previous years", () => {
    const ytd = custodyYearToDate(DAILY_RECORDS, "2026-12");
    const shipperA = ytd.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(2500 + 3000);
  });
});

// ---------------------------------------------------------------------------
// custodyToleranceBand (MV-15)
// ---------------------------------------------------------------------------

describe("custodyToleranceBand", () => {
  it("classifies differences within ±BALANCE_TOLERANCE_OK as ok (inclusive)", () => {
    expect(custodyToleranceBand(0)).toBe("ok");
    expect(custodyToleranceBand(BALANCE_TOLERANCE_OK)).toBe("ok");
    expect(custodyToleranceBand(-BALANCE_TOLERANCE_OK)).toBe("ok");
  });

  it("classifies differences beyond ok but within ±BALANCE_TOLERANCE_WARN as warning", () => {
    expect(custodyToleranceBand(0.51)).toBe("warning");
    expect(custodyToleranceBand(-0.75)).toBe("warning");
    expect(custodyToleranceBand(BALANCE_TOLERANCE_WARN)).toBe("warning");
    expect(custodyToleranceBand(-BALANCE_TOLERANCE_WARN)).toBe("warning");
  });

  it("classifies differences beyond ±BALANCE_TOLERANCE_WARN as critical", () => {
    expect(custodyToleranceBand(1.01)).toBe("critical");
    expect(custodyToleranceBand(-2.4)).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// latestCustodyMonth (MV-15)
// ---------------------------------------------------------------------------

describe("latestCustodyMonth", () => {
  it("returns the most recent month present in the records", () => {
    expect(latestCustodyMonth(DAILY_RECORDS)).toBe("2026-06");
  });

  it("works with monthly-granularity periods", () => {
    const records = [
      record("CD-M1", "2026-03", "SHP-A", 100, 99),
      record("CD-M2", "2026-01", "SHP-A", 100, 99),
    ];
    expect(latestCustodyMonth(records)).toBe("2026-03");
  });

  it("returns null for an empty record set", () => {
    expect(latestCustodyMonth([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// custodyDailyAverage (MV-15)
// ---------------------------------------------------------------------------

describe("custodyDailyAverage", () => {
  it("divides the month aggregate by the days in that month per shipper", () => {
    // June 2026 has 30 days; SHP-A has one June record: 3000 → 2985
    const daily = custodyDailyAverage(DAILY_RECORDS, "2026-06");
    expect(daily).toHaveLength(1);
    expect(daily[0].shipperId).toBe("SHP-A");
    expect(daily[0].originVolM3).toBeCloseTo(3000 / 30, 10);
    expect(daily[0].destVolM3).toBeCloseTo(2985 / 30, 10);
    expect(daily[0].diffM3).toBeCloseTo(-15 / 30, 10);
  });

  it("keeps diffPct identical to the monthly aggregate (scale-invariant)", () => {
    const daily = custodyDailyAverage(DAILY_RECORDS, "2026-06");
    const monthly = aggregateCustodyByShipper(DAILY_RECORDS, "2026-06");
    expect(daily[0].diffPct).toBeCloseTo(monthly[0].diffPct, 10);
  });

  it("uses the correct day count for 31-day months", () => {
    const records = [record("CD-J", "2026-05", "SHP-A", 3100, 3100)];
    const daily = custodyDailyAverage(records, "2026-05");
    expect(daily[0].originVolM3).toBeCloseTo(100, 10);
  });

  it("returns an empty array when the month has no records", () => {
    expect(custodyDailyAverage(DAILY_RECORDS, "2030-01")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// custodyViewAggregates (MV-15)
// ---------------------------------------------------------------------------

describe("custodyViewAggregates", () => {
  it("anchors to the reference month when records for it exist", () => {
    const view = custodyViewAggregates(DAILY_RECORDS, "month", "2026-05-15");
    expect(view.month).toBe("2026-05");
    const shipperA = view.aggregates.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(2500);
  });

  it("falls back to the latest available month when the reference month is absent", () => {
    const view = custodyViewAggregates(DAILY_RECORDS, "month", "1970-01-01");
    expect(view.month).toBe("2026-06");
    expect(view.aggregates[0].originVolM3).toBe(3000);
  });

  it("day view prefers exact daily records for the reference day", () => {
    const view = custodyViewAggregates(DAILY_RECORDS, "day", "2026-05-10");
    expect(view.aggregates).toHaveLength(2);
    expect(view.dailyAverage).toBe(false);
    const shipperA = view.aggregates.find((a) => a.shipperId === "SHP-A");
    expect(shipperA!.originVolM3).toBe(1000);
  });

  it("day view falls back to the anchor month's daily average when no daily records exist", () => {
    const monthlyOnly = [record("CD-M", "2026-06", "SHP-A", 3000, 2985)];
    const view = custodyViewAggregates(monthlyOnly, "day", "2026-06-12");
    expect(view.month).toBe("2026-06");
    expect(view.dailyAverage).toBe(true);
    expect(view.aggregates[0].originVolM3).toBeCloseTo(100, 10);
    expect(view.aggregates[0].diffM3).toBeCloseTo(-0.5, 10);
  });

  it("ytd view aggregates the anchor month's year up to that month", () => {
    const view = custodyViewAggregates(DAILY_RECORDS, "ytd", "2026-06-12");
    const shipperA = view.aggregates.find((a) => a.shipperId === "SHP-A");
    // 2026-05 (2500) + 2026-06 (3000); excludes 2025-12
    expect(shipperA!.originVolM3).toBe(5500);
  });

  it("returns month null and no aggregates for an empty record set", () => {
    const view = custodyViewAggregates([], "month", "2026-06-12");
    expect(view.month).toBeNull();
    expect(view.aggregates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sumCustodyAggregates (MV-15)
// ---------------------------------------------------------------------------

describe("sumCustodyAggregates", () => {
  it("totals origin/destination across shippers and recomputes the diff", () => {
    const aggregates = aggregateCustodyByShipper(DAILY_RECORDS, "2026-05-10");
    // SHP-A 1000→998, SHP-B 2000→2004 → total 3000→3002
    const total = sumCustodyAggregates(aggregates);
    expect(total.originVolM3).toBe(3000);
    expect(total.destVolM3).toBe(3002);
    expect(total.diffM3).toBeCloseTo(2, 10);
    expect(total.diffPct).toBeCloseTo((2 / 3000) * 100, 10);
  });

  it("returns zeros for an empty aggregate list", () => {
    expect(sumCustodyAggregates([])).toEqual({
      originVolM3: 0,
      destVolM3: 0,
      diffM3: 0,
      diffPct: 0,
    });
  });
});
