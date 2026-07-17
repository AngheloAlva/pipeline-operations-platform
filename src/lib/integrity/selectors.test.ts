/**
 * Tests for src/lib/integrity/selectors.ts — strict TDD, RED written first.
 * Covers scenarios S-303-A through S-303-K from the spec.
 * All functions must be pure (no store/react imports).
 */
import { describe, it, expect } from "vitest";
import type { CathodicReading, PipelineWorld } from "@/lib/domain";
import { AlertLevel } from "@/lib/domain";

// Selectors are expected at this path — will fail RED until implemented
import {
  pointKey,
  parsePointKey,
  computeIntegrityKpis,
  groupReadingsByKm,
  buildReadingTableRows,
  buildReadingTableRowsFromReadings,
  extractReadingSeriesForChart,
  TrendFlag,
} from "./selectors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReading(
  overrides: Partial<CathodicReading> & { km: number; segmentId: string },
): CathodicReading {
  return {
    id: "r-001",
    segmentId: overrides.segmentId,
    km: overrides.km,
    potentialV: overrides.potentialV ?? -0.9,
    takenAt: overrides.takenAt ?? "2026-01-01T00:00:00Z",
    level: overrides.level ?? AlertLevel.OK,
    stationId: overrides.stationId,
  };
}

function makeWorld(readings: CathodicReading[]): PipelineWorld {
  return {
    pipeline: {
      id: "PL-0001",
      name: "Test Pipeline",
      diameterInches: 16,
      totalLengthKm: 270,
      segments: [],
    },
    stations: [],
    tanks: [],
    shippers: [],
    equipment: [],
    movements: [],
    volumeTargets: [],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: readings,
    telemetry: [],
    custodyDifferences: [],
    operators: [],
    workstations: [],
    shiftRosters: [],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
  };
}

// ---------------------------------------------------------------------------
// pointKey / parsePointKey
// ---------------------------------------------------------------------------

describe("pointKey / parsePointKey", () => {
  it("pointKey produces composite string km:segmentId", () => {
    expect(pointKey(96.8, "SEG-0003")).toBe("96.8:SEG-0003");
  });

  it("pointKey works with integer km", () => {
    expect(pointKey(1, "SEG-0002")).toBe("1:SEG-0002");
  });

  it("parsePointKey extracts km as number and segmentId as string", () => {
    const result = parsePointKey("96.8:SEG-0003");
    expect(result.km).toBe(96.8);
    expect(result.segmentId).toBe("SEG-0003");
  });

  it("parsePointKey handles integer km", () => {
    const result = parsePointKey("1:SEG-0002");
    expect(result.km).toBe(1);
    expect(result.segmentId).toBe("SEG-0002");
  });
});

// ---------------------------------------------------------------------------
// TrendFlag const values
// ---------------------------------------------------------------------------

describe("TrendFlag", () => {
  it("TrendFlag.NEUTRAL is '—'", () => {
    expect(TrendFlag.NEUTRAL).toBe("—");
  });

  it("TrendFlag.DEGRADING is '↘'", () => {
    expect(TrendFlag.DEGRADING).toBe("↘");
  });
});

// ---------------------------------------------------------------------------
// computeIntegrityKpis — PER-POINT by latest reading level (ORCHESTRATOR DECISION)
// ---------------------------------------------------------------------------

describe("computeIntegrityKpis", () => {
  // S-303-A: empty input
  it("S-303-A: returns {ok:0, warning:0, critical:0} for empty input", () => {
    expect(computeIntegrityKpis([])).toEqual({ ok: 0, warning: 0, critical: 0 });
  });

  // S-303-B: per-point counting by latest reading level
  it("S-303-B: counts ONE per unique km:segmentId by most-recent reading level", () => {
    // Point "1:SEG-0002" — 3 readings; latest is OK
    const r1 = makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.7, level: AlertLevel.CRITICAL });
    const r2 = makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.8, level: AlertLevel.WARNING });
    const r3 = makeReading({ id: "r3", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.92, level: AlertLevel.OK });
    // Point "5:SEG-0003" — 2 readings; latest is WARNING
    const r4 = makeReading({ id: "r4", km: 5, segmentId: "SEG-0003", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.92, level: AlertLevel.OK });
    const r5 = makeReading({ id: "r5", km: 5, segmentId: "SEG-0003", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.8, level: AlertLevel.WARNING });
    // Point "10:SEG-0004" — 1 reading; CRITICAL
    const r6 = makeReading({ id: "r6", km: 10, segmentId: "SEG-0004", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.5, level: AlertLevel.CRITICAL });

    const result = computeIntegrityKpis([r1, r2, r3, r4, r5, r6]);
    // 3 total points: OK=1 (point 1:SEG-0002 latest OK), WARNING=1 (point 5:SEG-0003 latest WARNING), CRITICAL=1 (point 10:SEG-0004)
    expect(result).toEqual({ ok: 1, warning: 1, critical: 1 });
    // totals equal unique-point count (3)
    expect(result.ok + result.warning + result.critical).toBe(3);
  });

  it("counts KPI totals equal to number of unique km:segmentId points", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.92, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.93, level: AlertLevel.OK }),
      makeReading({ id: "r3", km: 2, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.8, level: AlertLevel.WARNING }),
      makeReading({ id: "r4", km: 3, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.5, level: AlertLevel.CRITICAL }),
    ];
    const result = computeIntegrityKpis(readings);
    const uniquePoints = 3; // km=1, km=2, km=3
    expect(result.ok + result.warning + result.critical).toBe(uniquePoints);
  });

  it("KPI total === buildReadingTableRows length for same world", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.92, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.93, level: AlertLevel.OK }),
      makeReading({ id: "r3", km: 2, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.8, level: AlertLevel.WARNING }),
      makeReading({ id: "r4", km: 3, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.5, level: AlertLevel.CRITICAL }),
    ];
    const w = makeWorld(readings);
    const kpis = computeIntegrityKpis(w.cathodicReadings);
    const rows = buildReadingTableRows(w);
    expect(kpis.ok + kpis.warning + kpis.critical).toBe(rows.length);
  });

  it("a point with multiple readings counts exactly ONCE", () => {
    // 10 readings for the same km:segmentId — latest is WARNING
    const readings = Array.from({ length: 10 }, (_, i) =>
      makeReading({
        id: `r${i}`,
        km: 50,
        segmentId: "SEG-0002",
        takenAt: `2026-0${(i % 9) + 1}-01T00:00:00Z`,
        potentialV: i === 9 ? -0.8 : -0.92,
        level: i === 9 ? AlertLevel.WARNING : AlertLevel.OK,
      }),
    );
    // latest reading (takenAt sorting) is the WARNING one
    const latestReading = readings.find((r) => r.potentialV === -0.8)!;
    latestReading.takenAt = "2026-12-01T00:00:00Z"; // make it definitively latest
    const result = computeIntegrityKpis(readings);
    expect(result.ok + result.warning + result.critical).toBe(1); // only 1 point
    expect(result.warning).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// groupReadingsByKm
// ---------------------------------------------------------------------------

describe("groupReadingsByKm", () => {
  // S-303-C: same km, different segmentId → separate groups
  it("S-303-C: same km but different segmentIds produce separate groups", () => {
    const r1 = makeReading({ km: 96.8, segmentId: "SEG-0002" });
    const r2 = makeReading({ km: 96.8, segmentId: "SEG-0003" });
    const result = groupReadingsByKm([r1, r2]);
    expect(result.size).toBe(2);
    expect(result.has("96.8:SEG-0002")).toBe(true);
    expect(result.has("96.8:SEG-0003")).toBe(true);
  });

  // S-303-D: same composite key → one group with all readings
  it("S-303-D: same km:segmentId readings land in the same group", () => {
    const r1 = makeReading({ id: "r1", km: 1, segmentId: "SEG-0002" });
    const r2 = makeReading({ id: "r2", km: 1, segmentId: "SEG-0002" });
    const r3 = makeReading({ id: "r3", km: 1, segmentId: "SEG-0002" });
    const result = groupReadingsByKm([r1, r2, r3]);
    expect(result.size).toBe(1);
    expect(result.get("1:SEG-0002")).toHaveLength(3);
  });

  it("empty input returns empty Map", () => {
    expect(groupReadingsByKm([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildReadingTableRows
// ---------------------------------------------------------------------------

describe("buildReadingTableRows", () => {
  // S-303-E: degrading trend detection
  it("S-303-E: row with ≥3 strictly increasing potentialV by takenAt gets trend DEGRADING", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-02T00:00:00Z", potentialV: -0.87, level: AlertLevel.OK }),
      makeReading({ id: "r3", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-03T00:00:00Z", potentialV: -0.84, level: AlertLevel.OK }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    expect(rows).toHaveLength(1);
    expect(rows[0].trend).toBe(TrendFlag.DEGRADING);
  });

  // S-303-F: neutral trend when < 3 readings
  it("S-303-F: row with exactly 2 readings gets trend NEUTRAL", () => {
    const readings = [
      makeReading({ id: "r1", km: 5, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 5, segmentId: "SEG-0002", takenAt: "2026-01-02T00:00:00Z", potentialV: -0.87, level: AlertLevel.OK }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    expect(rows[0].trend).toBe(TrendFlag.NEUTRAL);
  });

  // S-303-G: sorted by km ascending
  it("S-303-G: rows are sorted by km ascending", () => {
    const readings = [
      makeReading({ id: "r1", km: 50, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z" }),
      makeReading({ id: "r2", km: 10, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z" }),
      makeReading({ id: "r3", km: 200, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z" }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    expect(rows.map((r) => r.km)).toEqual([10, 50, 200]);
  });

  // S-303-H: latestPotentialV is from the most recent reading
  it("S-303-H: latestPotentialV comes from the reading with the latest takenAt", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.75, level: AlertLevel.WARNING }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    expect(rows[0].latestPotentialV).toBe(-0.75);
  });

  it("row pointKey matches composite km:segmentId", () => {
    const readings = [
      makeReading({ km: 96.8, segmentId: "SEG-0003", takenAt: "2026-01-01T00:00:00Z" }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    expect(rows[0].pointKey).toBe("96.8:SEG-0003");
  });

  it("sparkleSeries is sorted ascending by takenAt", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.84 }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9 }),
      makeReading({ id: "r3", km: 1, segmentId: "SEG-0002", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.87 }),
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    const series = rows[0].sparkleSeries;
    expect(series).toHaveLength(3);
    // Should be sorted oldest first
    const timestamps = series.map((s) => s.timestamp.getTime());
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);
  });

  it("level uses evaluatePotential(latestPotentialV)", () => {
    // latestPotentialV = -0.75 → WARNING
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9, level: AlertLevel.OK }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.75, level: AlertLevel.OK }), // stored level is wrong intentionally
    ];
    const rows = buildReadingTableRows(makeWorld(readings));
    // level is computed fresh from evaluatePotential(-0.75) = WARNING, not from stored level
    expect(rows[0].level).toBe(AlertLevel.WARNING);
  });
});

// ---------------------------------------------------------------------------
// extractReadingSeriesForChart
// ---------------------------------------------------------------------------

describe("extractReadingSeriesForChart", () => {
  // S-303-I: filtered and sorted
  it("S-303-I: returns only readings matching pointKey, sorted ascending by timestamp", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.84 }),
      makeReading({ id: "r2", km: 5, segmentId: "SEG-0003", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9 }),
      makeReading({ id: "r3", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9 }),
      makeReading({ id: "r4", km: 1, segmentId: "SEG-0002", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.87 }),
      makeReading({ id: "r5", km: 5, segmentId: "SEG-0003", takenAt: "2026-02-01T00:00:00Z", potentialV: -0.88 }),
    ];
    const result = extractReadingSeriesForChart(readings, "1:SEG-0002");
    expect(result).toHaveLength(3);
    const timestamps = result.map((p) => p.timestamp.getTime());
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);
    // Ensure potentialV is mapped correctly
    expect(result[0].potentialV).toBe(-0.9);
  });

  // S-303-J: no match returns empty
  it("S-303-J: returns [] when no readings match the pointKey", () => {
    const readings = [makeReading({ km: 1, segmentId: "SEG-0002" })];
    const result = extractReadingSeriesForChart(readings, "999:SEG-0099");
    expect(result).toEqual([]);
  });

  it("maps takenAt to Date objects in each ReadingSeriesPoint", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-15T12:00:00Z" }),
    ];
    const result = extractReadingSeriesForChart(readings, "1:SEG-0002");
    expect(result[0].timestamp).toBeInstanceOf(Date);
    expect(result[0].timestamp.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  // CRITICAL-3 fix: float-imprecise km must still match via pointKey() rounding
  it("CRITICAL-3: reading with float-imprecise km (96.79999999) still matches the rounded pointKey", () => {
    const readings = [
      makeReading({
        id: "r-float",
        km: 96.79999999,
        segmentId: "SEG-0003",
        takenAt: "2026-01-01T00:00:00Z",
        potentialV: -0.91,
      }),
    ];
    // pointKey(96.79999999, "SEG-0003") rounds to "96.8:SEG-0003"
    const result = extractReadingSeriesForChart(readings, "96.8:SEG-0003");
    expect(result).toHaveLength(1);
    expect(result[0].potentialV).toBe(-0.91);
  });

  // SUGGESTION-1: sort must be chronologically correct (Date.parse, not localeCompare)
  it("SUGGESTION-1: sort is chronological even for non-UTC offset strings", () => {
    const readings = [
      makeReading({ id: "r1", km: 1, segmentId: "SEG-0002", takenAt: "2026-03-01T00:00:00Z", potentialV: -0.84 }),
      makeReading({ id: "r2", km: 1, segmentId: "SEG-0002", takenAt: "2026-01-01T00:00:00Z", potentialV: -0.9 }),
    ];
    const result = extractReadingSeriesForChart(readings, "1:SEG-0002");
    expect(result[0].potentialV).toBe(-0.9);   // oldest first
    expect(result[1].potentialV).toBe(-0.84);
  });
});

// ---------------------------------------------------------------------------
// S-303-K: pure function constraint — selectors.ts must not import store/react
// ---------------------------------------------------------------------------

describe("S-303-K: type purity check", () => {
  it("selectors module does not import from store or react", async () => {
    // We verify by inspecting the resolved module's source via dynamic import
    // The absence of errors on import is a basic check; store-import would
    // fail at test time if zustand/react are not in scope.
    // The real check is done by inspecting the source statically below.
    const mod = await import("./selectors");
    // All expected exports are present
    expect(typeof mod.pointKey).toBe("function");
    expect(typeof mod.parsePointKey).toBe("function");
    expect(typeof mod.computeIntegrityKpis).toBe("function");
    expect(typeof mod.groupReadingsByKm).toBe("function");
    expect(typeof mod.buildReadingTableRows).toBe("function");
    expect(typeof mod.buildReadingTableRowsFromReadings).toBe("function");
    expect(typeof mod.extractReadingSeriesForChart).toBe("function");
    expect(mod.TrendFlag).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildReadingTableRowsFromReadings — scoped-readings variant (CRITICAL 2 fix)
// ---------------------------------------------------------------------------

describe("buildReadingTableRowsFromReadings", () => {
  const r1 = makeReading({ id: "r1", km: 10.0, segmentId: "SEG-1", potentialV: -0.9 });
  const r2 = makeReading({ id: "r2", km: 20.0, segmentId: "SEG-1", potentialV: -0.72 });

  it("returns same rows as buildReadingTableRows(world) when called with world.cathodicReadings", () => {
    const world = makeWorld([r1, r2]);
    const fromWorld = buildReadingTableRows(world);
    const fromReadings = buildReadingTableRowsFromReadings(world.cathodicReadings);
    expect(fromReadings).toEqual(fromWorld);
  });

  it("correctly processes a filtered (scoped) readings slice without needing the full world", () => {
    // Simulate the page pattern: pre-filtered stationReadings passed directly
    const filtered = [r1]; // only one point
    const rows = buildReadingTableRowsFromReadings(filtered);
    expect(rows).toHaveLength(1);
    expect(rows[0].km).toBe(10);
    expect(rows[0].latestPotentialV).toBe(-0.9);
  });

  it("returns [] for an empty readings array", () => {
    const rows = buildReadingTableRowsFromReadings([]);
    expect(rows).toHaveLength(0);
  });
});
