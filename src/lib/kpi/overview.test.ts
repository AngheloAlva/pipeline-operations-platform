/**
 * Tests for overview KPI pure functions.
 * Strict TDD: tests written BEFORE implementation.
 */
import { describe, it, expect } from "vitest";
import type { PipelineWorld, Tank, Equipment, CathodicReading } from "@/lib/domain";
import { AlertLevel } from "@/lib/domain";
import { totalStock, equipmentStatusCounts, latestCathodicReading } from "./overview";

// ---------------------------------------------------------------------------
// Minimal world builder helpers
// ---------------------------------------------------------------------------

function makeTank(overrides: Partial<Tank>): Tank {
  return {
    id: "t-1",
    tag: "T-001",
    stationId: "s-1",
    capacityM3: 10_000,
    currentLevelM3: 5_000,
    heightMm: 5_000,
    product: "OTASA-1",
    apiGravity: 35,
    temperatureF: 75,
    ...overrides,
  };
}

function makeEquipment(overrides: Partial<Equipment>): Equipment {
  return {
    id: "e-1",
    tag: "J-001",
    name: "Pump 1",
    type: "PUMP",
    criticality: "MEDIUM",
    isOperational: true,
    stationId: "s-1",
    operatingHours: 1000,
    ...overrides,
  };
}

function makeReading(overrides: Partial<CathodicReading>): CathodicReading {
  return {
    id: "r-1",
    segmentId: "seg-1",
    km: 10,
    potentialV: -0.9,
    takenAt: "2026-01-01T00:00:00Z",
    level: "OK",
    ...overrides,
  };
}

function makeWorld(overrides: Partial<PipelineWorld>): PipelineWorld {
  return {
    pipeline: {
      id: "p-1",
      name: "Test",
      diameterInches: 16,
      totalLengthKm: 100,
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
    cathodicReadings: [],
    telemetry: [],
    custodyDifferences: [],
    operators: [],
    workstations: [],
    shiftRosters: [],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// totalStock
// ---------------------------------------------------------------------------

describe("totalStock", () => {
  it("returns 0 for an empty tank list", () => {
    const world = makeWorld({ tanks: [] });
    expect(totalStock(world)).toBe(0);
  });

  it("sums currentLevelM3 across all tanks", () => {
    const world = makeWorld({
      tanks: [
        makeTank({ id: "t-1", currentLevelM3: 3_000 }),
        makeTank({ id: "t-2", currentLevelM3: 7_000 }),
        makeTank({ id: "t-3", currentLevelM3: 500 }),
      ],
    });
    expect(totalStock(world)).toBe(10_500);
  });

  it("returns the single tank level when only one tank exists", () => {
    const world = makeWorld({ tanks: [makeTank({ currentLevelM3: 12_345 })] });
    expect(totalStock(world)).toBe(12_345);
  });
});

// ---------------------------------------------------------------------------
// equipmentStatusCounts
// ---------------------------------------------------------------------------

describe("equipmentStatusCounts", () => {
  it("returns zero counts for an empty equipment list", () => {
    const world = makeWorld({ equipment: [] });
    const counts = equipmentStatusCounts(world);
    expect(counts.operational).toBe(0);
    expect(counts.nonOperational).toBe(0);
  });

  it("counts operational and non-operational equipment correctly", () => {
    const world = makeWorld({
      equipment: [
        makeEquipment({ id: "e-1", isOperational: true }),
        makeEquipment({ id: "e-2", isOperational: true }),
        makeEquipment({ id: "e-3", isOperational: false }),
      ],
    });
    const counts = equipmentStatusCounts(world);
    expect(counts.operational).toBe(2);
    expect(counts.nonOperational).toBe(1);
  });

  it("handles all equipment non-operational", () => {
    const world = makeWorld({
      equipment: [
        makeEquipment({ id: "e-1", isOperational: false }),
        makeEquipment({ id: "e-2", isOperational: false }),
      ],
    });
    const counts = equipmentStatusCounts(world);
    expect(counts.operational).toBe(0);
    expect(counts.nonOperational).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// latestCathodicReading
// ---------------------------------------------------------------------------

describe("latestCathodicReading", () => {
  it("returns null for an empty readings list", () => {
    const world = makeWorld({ cathodicReadings: [] });
    expect(latestCathodicReading(world)).toBeNull();
  });

  it("returns the reading with the latest takenAt date", () => {
    const world = makeWorld({
      cathodicReadings: [
        makeReading({ id: "r-1", takenAt: "2026-01-01T00:00:00Z", level: "OK" }),
        makeReading({ id: "r-2", takenAt: "2026-06-10T12:00:00Z", level: "WARNING" }),
        makeReading({ id: "r-3", takenAt: "2026-03-15T08:00:00Z", level: "CRITICAL" }),
      ],
    });
    const result = latestCathodicReading(world);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("r-2");
    expect(result!.level).toBe(AlertLevel.WARNING);
  });

  it("returns the single reading when only one exists", () => {
    const reading = makeReading({ id: "r-only", level: "OK" });
    const world = makeWorld({ cathodicReadings: [reading] });
    expect(latestCathodicReading(world)!.id).toBe("r-only");
  });
});
