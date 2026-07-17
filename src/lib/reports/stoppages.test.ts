/**
 * Tests for lib/reports/stoppages — pipeline stoppage aggregation (MV-18).
 * The stoppages report lists the seeded events with per-month totals
 * (count + hours) and a responsible-side breakdown.
 */

import { describe, it, expect } from "vitest";
import type { PipelineStoppage } from "@/lib/domain";
import { StoppageResponsible } from "@/lib/domain";
import {
  buildStoppageMonthlySeries,
  summarizeStoppagesByResponsible,
  sortStoppagesByStartDesc,
  sumStoppages,
} from "./stoppages";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function stoppage(
  id: string,
  period: string,
  startedAt: string,
  durationHours: number,
  responsible: StoppageResponsible,
  cause = "Corte de energía",
): PipelineStoppage {
  return { id, period, startedAt, durationHours, responsible, cause };
}

const STOPPAGES: PipelineStoppage[] = [
  stoppage("STP-1", "2026-05", "2026-05-10T08:00:00.000Z", 12.5, StoppageResponsible.OTA),
  stoppage("STP-2", "2026-05", "2026-05-20T19:00:00.000Z", 4.5, StoppageResponsible.OTC),
  stoppage("STP-3", "2026-03", "2026-03-02T01:00:00.000Z", 8, StoppageResponsible.OTA),
  stoppage("STP-4", "2026-06", "2026-06-01T04:00:00.000Z", 3, StoppageResponsible.BOTH),
];

// ---------------------------------------------------------------------------
// buildStoppageMonthlySeries
// ---------------------------------------------------------------------------

describe("buildStoppageMonthlySeries", () => {
  it("totals count and hours per month, sorted ascending by period", () => {
    const rows = buildStoppageMonthlySeries(STOPPAGES);
    expect(rows).toEqual([
      { period: "2026-03", count: 1, totalHours: 8 },
      { period: "2026-05", count: 2, totalHours: 17 },
      { period: "2026-06", count: 1, totalHours: 3 },
    ]);
  });

  it("only includes months that have events (sparse seed months are omitted)", () => {
    const rows = buildStoppageMonthlySeries(STOPPAGES);
    expect(rows.map((r) => r.period)).not.toContain("2026-04");
  });

  it("returns an empty series for no events", () => {
    expect(buildStoppageMonthlySeries([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeStoppagesByResponsible
// ---------------------------------------------------------------------------

describe("summarizeStoppagesByResponsible", () => {
  it("totals count, hours, and hour share per responsible side (OTA, OTC, BOTH order)", () => {
    const rows = summarizeStoppagesByResponsible(STOPPAGES);
    expect(rows.map((r) => r.responsible)).toEqual([
      StoppageResponsible.OTA,
      StoppageResponsible.OTC,
      StoppageResponsible.BOTH,
    ]);

    const [ota, otc, both] = rows;
    expect(ota.count).toBe(2);
    expect(ota.totalHours).toBeCloseTo(20.5);
    // 20.5 / 28 total hours = 73.21 %
    expect(ota.sharePct).toBeCloseTo((20.5 / 28) * 100);
    expect(otc.count).toBe(1);
    expect(otc.totalHours).toBeCloseTo(4.5);
    expect(both.totalHours).toBeCloseTo(3);
  });

  it("omits responsible sides without events", () => {
    const rows = summarizeStoppagesByResponsible([STOPPAGES[0]]);
    expect(rows.map((r) => r.responsible)).toEqual([StoppageResponsible.OTA]);
  });

  it("yields 0 % shares when total hours are 0 (no division by zero)", () => {
    const rows = summarizeStoppagesByResponsible([
      stoppage("STP-z", "2026-05", "2026-05-01T00:00:00.000Z", 0, StoppageResponsible.OTC),
    ]);
    expect(rows[0].sharePct).toBe(0);
  });

  it("returns an empty breakdown for no events", () => {
    expect(summarizeStoppagesByResponsible([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sortStoppagesByStartDesc
// ---------------------------------------------------------------------------

describe("sortStoppagesByStartDesc", () => {
  it("sorts events by start time, most recent first, without mutating the input", () => {
    const input = [...STOPPAGES];
    const sorted = sortStoppagesByStartDesc(input);
    expect(sorted.map((s) => s.id)).toEqual(["STP-4", "STP-2", "STP-1", "STP-3"]);
    expect(input.map((s) => s.id)).toEqual(["STP-1", "STP-2", "STP-3", "STP-4"]);
  });
});

// ---------------------------------------------------------------------------
// sumStoppages
// ---------------------------------------------------------------------------

describe("sumStoppages", () => {
  it("totals event count and hours across all events", () => {
    const total = sumStoppages(STOPPAGES);
    expect(total.count).toBe(4);
    expect(total.totalHours).toBeCloseTo(28);
  });

  it("returns zeros for no events", () => {
    expect(sumStoppages([])).toEqual({ count: 0, totalHours: 0 });
  });
});
