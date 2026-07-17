/**
 * Tests for lib/reports/budget — Ppto vs Real 12-month series (MV-17).
 * Built from VolumeTarget TOTAL rows (shipperId undefined) of the seed.
 */

import { describe, it, expect } from "vitest";
import type { VolumeTarget } from "@/lib/domain";
import { buildBudgetVsRealSeries, sumBudgetVsRealClosed } from "./budget";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;

function target(
  period: string,
  budgetM3: number,
  programM3: number,
  realM3?: number,
  shipperId?: string,
): VolumeTarget {
  seq += 1;
  return { id: `VTG-${seq}`, period, shipperId, budgetM3, programM3, realM3 };
}

const TARGETS: VolumeTarget[] = [
  // Totals (shipperId undefined) — unsorted on purpose
  target("2026-05", 100_000, 102_000, 101_000),
  target("2026-03", 90_000, 91_000, 80_000),
  target("2026-04", 95_000, 96_000, 94_000),
  target("2026-06", 110_000, 108_000, undefined), // future month, no real yet
  // Per-shipper rows — must be EXCLUDED from the total series
  target("2026-05", 40_000, 41_000, 40_500, "SHP-A"),
  target("2026-04", 30_000, 31_000, 29_000, "SHP-B"),
];

// ---------------------------------------------------------------------------
// buildBudgetVsRealSeries
// ---------------------------------------------------------------------------

describe("buildBudgetVsRealSeries", () => {
  it("keeps only TOTAL targets (shipperId undefined), sorted ascending by period", () => {
    const rows = buildBudgetVsRealSeries(TARGETS);
    expect(rows.map((r) => r.period)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  it("computes compliance percentages and variance against budget", () => {
    const rows = buildBudgetVsRealSeries(TARGETS);
    const may = rows.find((r) => r.period === "2026-05");
    expect(may).toBeTruthy();
    expect(may!.budgetM3).toBe(100_000);
    expect(may!.programM3).toBe(102_000);
    expect(may!.realM3).toBe(101_000);
    // real / budget × 100
    expect(may!.cumplimientoPresupuestoPct).toBeCloseTo(101);
    // real / program × 100
    expect(may!.cumplimientoProgramaPct).toBeCloseTo(99.0196, 3);
    // real − budget
    expect(may!.varianceM3).toBe(1_000);
    expect(may!.band).toBe("ok");
  });

  it("classifies an out-of-tolerance month as critical", () => {
    const rows = buildBudgetVsRealSeries(TARGETS);
    const march = rows.find((r) => r.period === "2026-03");
    // 80 000 / 90 000 = 88.9 % → below the ±10 % warning band → critical
    expect(march!.band).toBe("critical");
  });

  it("marks future months (no real yet) with null derived fields", () => {
    const rows = buildBudgetVsRealSeries(TARGETS);
    const june = rows.find((r) => r.period === "2026-06");
    expect(june!.realM3).toBeNull();
    expect(june!.cumplimientoPresupuestoPct).toBeNull();
    expect(june!.cumplimientoProgramaPct).toBeNull();
    expect(june!.varianceM3).toBeNull();
    expect(june!.band).toBeNull();
  });

  it("limits the series to the most recent N months (keeping ascending order)", () => {
    const rows = buildBudgetVsRealSeries(TARGETS, 2);
    expect(rows.map((r) => r.period)).toEqual(["2026-05", "2026-06"]);
  });

  it("defaults the limit to 12 months", () => {
    const many: VolumeTarget[] = [];
    for (let m = 1; m <= 14; m++) {
      many.push(target(`2025-${String(m).padStart(2, "0")}`, 1000, 1000, 1000));
    }
    // 14 fabricated months (13/14 overflow into invalid-but-sortable strings is
    // avoided by capping at 12 real months below)
    const rows = buildBudgetVsRealSeries(many.slice(0, 12).concat(
      [target("2026-01", 1000, 1000, 1000), target("2026-02", 1000, 1000, 1000)],
    ));
    expect(rows).toHaveLength(12);
    expect(rows[0].period).toBe("2025-03");
    expect(rows[11].period).toBe("2026-02");
  });

  it("handles a zero budget without division by zero", () => {
    const rows = buildBudgetVsRealSeries([target("2026-01", 0, 0, 500)]);
    expect(rows[0].cumplimientoPresupuestoPct).toBe(0);
    expect(rows[0].cumplimientoProgramaPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sumBudgetVsRealClosed
// ---------------------------------------------------------------------------

describe("sumBudgetVsRealClosed", () => {
  it("totals only closed months (realM3 present) and recomputes percentages", () => {
    const rows = buildBudgetVsRealSeries(TARGETS);
    const total = sumBudgetVsRealClosed(rows);

    // 2026-03 + 2026-04 + 2026-05 (2026-06 excluded — no real)
    expect(total.budgetM3).toBe(90_000 + 95_000 + 100_000);
    expect(total.programM3).toBe(91_000 + 96_000 + 102_000);
    expect(total.realM3).toBe(80_000 + 94_000 + 101_000);
    expect(total.varianceM3).toBe(total.realM3 - total.budgetM3);
    expect(total.cumplimientoPresupuestoPct).toBeCloseTo(
      (total.realM3 / total.budgetM3) * 100,
    );
    expect(total.closedMonths).toBe(3);
  });

  it("returns a zeroed total when no month is closed", () => {
    const rows = buildBudgetVsRealSeries([target("2026-06", 1000, 1000, undefined)]);
    const total = sumBudgetVsRealClosed(rows);
    expect(total.closedMonths).toBe(0);
    expect(total.budgetM3).toBe(0);
    expect(total.realM3).toBe(0);
    expect(total.cumplimientoPresupuestoPct).toBe(0);
  });
});
