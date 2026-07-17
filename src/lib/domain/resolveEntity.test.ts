/**
 * Tests for src/lib/domain/resolveEntity.ts — strict TDD, RED written first.
 * Covers all entity types and edge cases per F4-1-R1 spec.
 * Scenarios: F4-1-S7, F4-1-S8 + full branch coverage.
 */
import { describe, it, expect } from "vitest";
import type { CathodicReading, Equipment, Tank, Station, PipelineWorld } from "@/lib/domain";
import { AlertLevel } from "@/lib/domain";

// Implementation expected at this path — will fail RED until T1-2 is done
import { resolveEntity } from "./resolveEntity";
import { EntityType } from "@/store/selectionStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorld(
  overrides: Partial<PipelineWorld> = {},
): PipelineWorld {
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

function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "EQP-0012",
    tag: "J-6010",
    name: "Test Pump",
    type: "PUMP",
    criticality: "HIGH",
    isOperational: true,
    stationId: "STA-0005",
    operatingHours: 0,
    ...overrides,
  };
}

function makeTank(overrides: Partial<Tank> = {}): Tank {
  return {
    id: "TNK-0003",
    tag: "T-6010",
    stationId: "STA-0002",
    capacityM3: 10000,
    currentLevelM3: 5000,
    heightMm: 5000,
    product: "Medanito",
    apiGravity: 28,
    temperatureF: 70,
    ...overrides,
  };
}

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: "STA-0005",
    name: "Station 5",
    kind: "PUMP_STATION",
    km: 100,
    pipelineId: "PL-0001",
    ...overrides,
  };
}

function makeCathodicReading(
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveEntity", () => {
  describe("EQUIPMENT", () => {
    it("returns EQUIPMENT entity with stationId when equipment id matches", () => {
      const equipment = makeEquipment({ id: "EQP-0012", stationId: "STA-0005" });
      const world = makeWorld({ equipment: [equipment] });

      const result = resolveEntity(world, "EQP-0012");

      expect(result).toEqual({
        id: "EQP-0012",
        type: EntityType.EQUIPMENT,
        stationId: "STA-0005",
      });
    });

    it("scenario F4-1-S8: resolveEntity returns correct stationId for equipment", () => {
      const equipment = makeEquipment({ id: "EQP-0012", stationId: "STA-0005" });
      const world = makeWorld({ equipment: [equipment] });

      const result = resolveEntity(world, "EQP-0012");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("EQP-0012");
      expect(result!.type).toBe(EntityType.EQUIPMENT);
      expect(result!.stationId).toBe("STA-0005");
    });
  });

  describe("TANK", () => {
    it("returns TANK entity with stationId when tank id matches", () => {
      const tank = makeTank({ id: "TNK-0003", stationId: "STA-0002" });
      const world = makeWorld({ tanks: [tank] });

      const result = resolveEntity(world, "TNK-0003");

      expect(result).toEqual({
        id: "TNK-0003",
        type: EntityType.TANK,
        stationId: "STA-0002",
      });
    });
  });

  describe("STATION", () => {
    it("returns STATION entity with stationId === its own id", () => {
      const station = makeStation({ id: "STA-0005" });
      const world = makeWorld({ stations: [station] });

      const result = resolveEntity(world, "STA-0005");

      expect(result).toEqual({
        id: "STA-0005",
        type: EntityType.STATION,
        stationId: "STA-0005",
      });
    });
  });

  describe("CATHODIC_POINT", () => {
    it("returns CATHODIC_POINT entity with stationId from reading when composite key matches", () => {
      // pointKey(100.0, "SEG-001") => "100:SEG-001"
      const reading = makeCathodicReading({
        km: 100.0,
        segmentId: "SEG-001",
        stationId: "STA-0007",
      });
      const world = makeWorld({ cathodicReadings: [reading] });

      const result = resolveEntity(world, "100:SEG-001");

      expect(result).toEqual({
        id: "100:SEG-001",
        type: EntityType.CATHODIC_POINT,
        stationId: "STA-0007",
      });
    });

    it("returns stationId null when cathodic reading has no stationId (undefined → null)", () => {
      const reading = makeCathodicReading({
        km: 200.5,
        segmentId: "SEG-002",
        stationId: undefined,
      });
      const world = makeWorld({ cathodicReadings: [reading] });

      const result = resolveEntity(world, "200.5:SEG-002");

      expect(result).not.toBeNull();
      expect(result!.type).toBe(EntityType.CATHODIC_POINT);
      expect(result!.stationId).toBeNull();
    });

    it("handles km rounding in composite key (1 decimal place)", () => {
      // pointKey rounds km: 100.04 => 100.0 => "100:SEG-003"
      const reading = makeCathodicReading({
        km: 100.04,
        segmentId: "SEG-003",
        stationId: "STA-0001",
      });
      const world = makeWorld({ cathodicReadings: [reading] });

      // Key built with same rounding: Math.round(100.04 * 10) / 10 = 100
      const result = resolveEntity(world, "100:SEG-003");

      expect(result).not.toBeNull();
      expect(result!.type).toBe(EntityType.CATHODIC_POINT);
    });
  });

  describe("unknown / null cases", () => {
    it("scenario F4-1-S7: returns null for an id not in any collection", () => {
      const world = makeWorld({
        equipment: [makeEquipment()],
        tanks: [makeTank()],
        stations: [makeStation()],
        cathodicReadings: [
          makeCathodicReading({ km: 100, segmentId: "SEG-001", stationId: "STA-0005" }),
        ],
      });

      const result = resolveEntity(world, "NOTEXIST-0000");

      expect(result).toBeNull();
    });

    it("returns null for an empty string id", () => {
      const world = makeWorld();

      const result = resolveEntity(world, "");

      expect(result).toBeNull();
    });

    it("returns null for a malformed id that looks like a composite key but has no match", () => {
      const world = makeWorld({
        cathodicReadings: [
          makeCathodicReading({ km: 100, segmentId: "SEG-001", stationId: "STA-0005" }),
        ],
      });

      const result = resolveEntity(world, "999:NOSEG");

      expect(result).toBeNull();
    });

    it("returns null when all collections are empty", () => {
      const world = makeWorld();

      const result = resolveEntity(world, "EQP-0001");

      expect(result).toBeNull();
    });
  });

  describe("resolution order (first match wins)", () => {
    it("equipment wins over any other collection when id matches equipment", () => {
      const equipment = makeEquipment({ id: "EQP-0012", stationId: "STA-0005" });
      const world = makeWorld({
        equipment: [equipment],
        tanks: [makeTank({ id: "EQP-0012", stationId: "STA-WRONG" })], // contrived overlap
      });

      const result = resolveEntity(world, "EQP-0012");

      expect(result!.type).toBe(EntityType.EQUIPMENT);
      expect(result!.stationId).toBe("STA-0005");
    });
  });
});
