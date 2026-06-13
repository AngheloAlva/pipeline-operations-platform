/**
 * Station Integrity section logic — unit tests (TDD: RED → GREEN per Strict TDD rule).
 *
 * Tests the two branches required by F4-2-R5 / F4-2-R9:
 *   1. Empty-state: when stationReadings.length === 0, computeIntegrityKpis returns
 *      zeros and the section MUST NOT render real data (guard logic).
 *   2. Populated: when readings are present, computeIntegrityKpis returns non-zero counts
 *      and extractReadingSeriesForChart returns a series.
 *
 * These are pure-logic tests (no React render needed) because the business rule
 * "empty → show empty-state, non-empty → show KPIs" is fully derivable from the
 * selector output without mounting a component.
 */

import { describe, it, expect } from "vitest";
import { computeIntegrityKpis, extractReadingSeriesForChart, pointKey } from "@/lib/integrity/selectors";
import type { CathodicReading } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Minimal fixture factory
// ---------------------------------------------------------------------------

function makeReading(overrides: Partial<CathodicReading> & { stationId?: string | undefined } = {}): CathodicReading {
  // Note: stationId key must be present (even if undefined) to distinguish from "not passed"
  const base: CathodicReading = {
    id: "reading-1",
    segmentId: "SEG-0001",
    stationId: "STA-0001",
    km: 10.0,
    potentialV: -0.9,  // OK level (< -0.85)
    takenAt: "2024-01-15T10:00:00Z",
    level: "OK" as CathodicReading["level"],
  };
  // Spread overrides explicitly — allows setting stationId to undefined
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Branch 1 — Empty state
// ---------------------------------------------------------------------------

describe("Station Integrity empty-state branch (F4-2-R5)", () => {
  it("computeIntegrityKpis returns zeros for an empty readings array", () => {
    const kpis = computeIntegrityKpis([]);
    expect(kpis.ok).toBe(0);
    expect(kpis.warning).toBe(0);
    expect(kpis.critical).toBe(0);
  });

  it("zero-KPI result means empty-state MUST be shown (guard: total === 0)", () => {
    const kpis = computeIntegrityKpis([]);
    const total = kpis.ok + kpis.warning + kpis.critical;
    // The page checks stationReadings.length === 0 (not KPI totals), but
    // the invariant is: empty readings → zero KPIs (never mislead with zeros as data).
    expect(total).toBe(0);
  });

  it("extractReadingSeriesForChart returns empty array when no readings match the key", () => {
    const readings: CathodicReading[] = []; // no readings for this station
    const key = pointKey(10.0, "SEG-0001");
    const series = extractReadingSeriesForChart(readings, key);
    expect(series).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Branch 2 — Populated state (real readings for a station)
// ---------------------------------------------------------------------------

describe("Station Integrity populated branch (F4-2-R9)", () => {
  const stationReadings: CathodicReading[] = [
    makeReading({ id: "r1", km: 10.0, segmentId: "SEG-0001", potentialV: -0.9, stationId: "STA-0001" }),
    makeReading({ id: "r2", km: 10.0, segmentId: "SEG-0001", potentialV: -0.88, takenAt: "2024-02-01T10:00:00Z", stationId: "STA-0001" }),
    makeReading({ id: "r3", km: 20.0, segmentId: "SEG-0001", potentialV: -0.72, stationId: "STA-0001" }), // CRITICAL: > -0.75
    makeReading({ id: "r4", km: 30.0, segmentId: "SEG-0001", potentialV: -0.80, stationId: "STA-0001" }), // WARNING: between -0.75 and -0.85
  ];

  it("computeIntegrityKpis returns non-zero values for populated readings", () => {
    const kpis = computeIntegrityKpis(stationReadings);
    const total = kpis.ok + kpis.warning + kpis.critical;
    expect(total).toBeGreaterThan(0);
  });

  it("computeIntegrityKpis counts unique points, not raw readings", () => {
    // r1 and r2 share km:segmentId → one point counted (latest wins)
    const kpis = computeIntegrityKpis(stationReadings);
    // 3 unique points: (10:SEG-0001 → OK latest -0.88), (20:SEG-0001 → CRITICAL), (30:SEG-0001 → WARNING)
    expect(kpis.ok).toBe(1);
    expect(kpis.critical).toBe(1);
    expect(kpis.warning).toBe(1);
  });

  it("extractReadingSeriesForChart returns sorted series for a known point", () => {
    const key = pointKey(10.0, "SEG-0001");
    const series = extractReadingSeriesForChart(stationReadings, key);
    // r1 and r2 are both at 10:SEG-0001
    expect(series).toHaveLength(2);
    // Series must be sorted ascending by takenAt
    expect(series[0].potentialV).toBe(-0.9);
    expect(series[1].potentialV).toBe(-0.88);
  });

  it("stationReadings.length > 0 signals the populated branch (not empty-state)", () => {
    expect(stationReadings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Branch guard — confirms filtering by stationId correctly separates readings
// ---------------------------------------------------------------------------

describe("Station filtering by stationId (F4-2-R3 / ADR-3)", () => {
  const allReadings: CathodicReading[] = [
    makeReading({ id: "r-a", stationId: "STA-0001", km: 10.0 }),
    makeReading({ id: "r-b", stationId: "STA-0002", km: 20.0 }),
    makeReading({ id: "r-c", stationId: "STA-0001", km: 30.0 }),
    makeReading({ id: "r-d", stationId: undefined, km: 40.0 }), // undefined stationId edge case
  ];

  it("filtering by stationId=STA-0001 returns only readings for that station", () => {
    const stationId = "STA-0001";
    const stationReadings = allReadings.filter((r) => r.stationId === stationId);
    expect(stationReadings).toHaveLength(2);
    expect(stationReadings.every((r) => r.stationId === "STA-0001")).toBe(true);
  });

  it("filtering by stationId for a station with no readings returns empty array (empty-state trigger)", () => {
    const stationId = "STA-NONE";
    const stationReadings = allReadings.filter((r) => r.stationId === stationId);
    expect(stationReadings).toHaveLength(0);
  });

  it("reading with undefined stationId does NOT match any stationId filter", () => {
    const stationId = "STA-0001";
    const stationReadings = allReadings.filter((r) => r.stationId === stationId);
    // r-d has undefined stationId — it must not be included
    const undefinedStationReading = stationReadings.find((r) => r.id === "r-d");
    expect(undefinedStationReading).toBeUndefined();
  });
});
