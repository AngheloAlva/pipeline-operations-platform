/**
 * Tests for lib/reports/allocation — per-shipper allocation view (MV-17).
 * The allocation report distributes the received (OTA) and delivered (OTC)
 * volumes across shippers for one month, with each shipper's share of the
 * total delivered volume.
 */

import { describe, it, expect } from "vitest";
import type { CustodyDifference } from "@/lib/domain";
import { makeCustodyDifference } from "@/lib/volumetrics/custody";
import { listAllocationMonths, buildAllocationView } from "./allocation";

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

const RECORDS: CustodyDifference[] = [
  record("CD-1", "2026-05", "SHP-A", 40_000, 39_800),
  record("CD-2", "2026-05", "SHP-B", 60_000, 60_200),
  record("CD-3", "2026-04", "SHP-A", 30_000, 30_000),
  record("CD-4", "2026-06", "SHP-B", 50_000, 49_500),
];

// ---------------------------------------------------------------------------
// listAllocationMonths
// ---------------------------------------------------------------------------

describe("listAllocationMonths", () => {
  it("returns distinct months sorted descending (most recent first)", () => {
    expect(listAllocationMonths(RECORDS)).toEqual(["2026-06", "2026-05", "2026-04"]);
  });

  it("deduplicates months across shippers", () => {
    const months = listAllocationMonths([
      record("CD-a", "2026-05", "SHP-A", 1000, 1000),
      record("CD-b", "2026-05", "SHP-B", 2000, 2000),
    ]);
    expect(months).toEqual(["2026-05"]);
  });

  it("normalizes daily periods to their month", () => {
    const months = listAllocationMonths([
      record("CD-a", "2026-05-10", "SHP-A", 1000, 1000),
      record("CD-b", "2026-05", "SHP-B", 2000, 2000),
    ]);
    expect(months).toEqual(["2026-05"]);
  });

  it("returns an empty list for no records", () => {
    expect(listAllocationMonths([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildAllocationView
// ---------------------------------------------------------------------------

describe("buildAllocationView", () => {
  it("aggregates the selected month per shipper with delivered share", () => {
    const view = buildAllocationView(RECORDS, "2026-05");

    expect(view.month).toBe("2026-05");
    expect(view.rows).toHaveLength(2);

    const [a, b] = view.rows;
    expect(a.shipperId).toBe("SHP-A");
    expect(a.originVolM3).toBe(40_000);
    expect(a.destVolM3).toBe(39_800);
    expect(a.diffM3).toBeCloseTo(-200);
    expect(a.diffPct).toBeCloseTo(-0.5);
    // Share of TOTAL DELIVERED volume: 39 800 / 100 000 = 39.8 %
    expect(a.sharePct).toBeCloseTo(39.8);

    expect(b.shipperId).toBe("SHP-B");
    expect(b.sharePct).toBeCloseTo(60.2);
  });

  it("shares across rows sum to 100 %", () => {
    const view = buildAllocationView(RECORDS, "2026-05");
    const sum = view.rows.reduce((acc, r) => acc + r.sharePct, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("computes totals with the difference recomputed on the totals", () => {
    const view = buildAllocationView(RECORDS, "2026-05");
    expect(view.totalOriginM3).toBe(100_000);
    expect(view.totalDestM3).toBe(100_000);
    expect(view.totalDiffM3).toBeCloseTo(0);
    expect(view.totalDiffPct).toBeCloseTo(0);
  });

  it("only includes records of the selected month", () => {
    const view = buildAllocationView(RECORDS, "2026-06");
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].shipperId).toBe("SHP-B");
    expect(view.rows[0].sharePct).toBeCloseTo(100);
  });

  it("returns an empty view for a month with no records", () => {
    const view = buildAllocationView(RECORDS, "2025-01");
    expect(view.rows).toEqual([]);
    expect(view.totalOriginM3).toBe(0);
    expect(view.totalDestM3).toBe(0);
  });

  it("yields 0 % shares when the total delivered volume is 0 (no division by zero)", () => {
    const view = buildAllocationView(
      [record("CD-z", "2026-05", "SHP-A", 0, 0)],
      "2026-05",
    );
    expect(view.rows[0].sharePct).toBe(0);
  });
});
