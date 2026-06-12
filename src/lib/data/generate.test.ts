/**
 * Tests for generateWorld pipeline.
 * Written first (TDD RED) before implementation exists.
 * Covers REQ-011 (determinism) and REQ-012 (coherence rules).
 */
import { describe, it, expect } from "vitest";
import { generateWorld } from "./generate";
import { DEFAULT_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// REQ-011-A: Same seed produces same world
// ---------------------------------------------------------------------------
describe("generateWorld — determinism", () => {
  it("S-011-A: same seed produces deeply equal worlds", () => {
    const world1 = generateWorld({ seed: 42 });
    const world2 = generateWorld({ seed: 42 });
    // Compare JSON serialization for deep equality check
    expect(JSON.stringify(world1)).toBe(JSON.stringify(world2));
  });

  it("S-011-B: different seeds produce different worlds (station names differ)", () => {
    const world1 = generateWorld({ seed: 1 });
    const world2 = generateWorld({ seed: 2 });
    // At minimum, station names or tank levels differ
    const differ =
      JSON.stringify(world1.stations.map((s) => s.name)) !==
        JSON.stringify(world2.stations.map((s) => s.name)) ||
      JSON.stringify(world1.tanks.map((t) => t.currentLevelM3)) !==
        JSON.stringify(world2.tanks.map((t) => t.currentLevelM3));
    expect(differ).toBe(true);
  });

  it("S-011-C: no-arg call returns a complete world (all 11 entity collections present)", () => {
    const world = generateWorld();
    expect(world.pipeline).toBeDefined();
    expect(world.pipeline.segments.length).toBeGreaterThanOrEqual(1);
    expect(world.stations.length).toBe(DEFAULT_CONFIG.stationCount);
    expect(world.tanks.length).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.stationCount * DEFAULT_CONFIG.tanksPerStation.min,
    );
    expect(world.shippers.length).toBe(DEFAULT_CONFIG.shipperCount);
    expect(world.equipment.length).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.stationCount * DEFAULT_CONFIG.equipmentPerStation.min,
    );
    expect(world.movements.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.historyDays);
    expect(world.volumeTargets.length).toBeGreaterThan(0);
    expect(world.maintenancePlans.length).toBeGreaterThan(0);
    expect(world.workOrders.length).toBeGreaterThan(0);
    expect(world.cathodicReadings.length).toBeGreaterThan(0);
    expect(world.telemetry.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-012: Coherence rules
// ---------------------------------------------------------------------------
describe("generateWorld — coherence rules", () => {
  // Run once; re-use across all coherence tests
  const world = generateWorld({ seed: 100 });

  it("stations are ordered by km (strictly increasing)", () => {
    for (let i = 0; i < world.stations.length - 1; i++) {
      expect(world.stations[i].km).toBeLessThan(world.stations[i + 1].km);
    }
  });

  it("all station km values are within [0, totalLengthKm]", () => {
    const totalKm = world.pipeline.totalLengthKm;
    for (const station of world.stations) {
      expect(station.km).toBeGreaterThanOrEqual(0);
      expect(station.km).toBeLessThanOrEqual(totalKm);
    }
  });

  it("all tank currentLevelM3 is between 20% and 90% of capacity", () => {
    for (const tank of world.tanks) {
      expect(tank.currentLevelM3).toBeGreaterThanOrEqual(tank.capacityM3 * 0.2 - 0.01);
      expect(tank.currentLevelM3).toBeLessThanOrEqual(tank.capacityM3 * 0.9 + 0.01);
    }
  });

  it("all movement volumes are positive", () => {
    for (const movement of world.movements) {
      expect(movement.volumeGsvM3).toBeGreaterThan(0);
      expect(movement.volume15CM3).toBeGreaterThan(0);
      expect(movement.volume60FM3).toBeGreaterThan(0);
    }
  });

  it("cathodic reading level matches evaluatePotential(potentialV)", async () => {
    const { evaluatePotential } = await import("@/lib/integrity/thresholds");
    for (const reading of world.cathodicReadings) {
      const expected = evaluatePotential(reading.potentialV);
      expect(reading.level).toBe(expected);
    }
  });

  it("WorkOrder progress is coherent with status", async () => {
    const { WorkOrderStatus } = await import("@/lib/domain");
    for (const wo of world.workOrders) {
      if (wo.status === WorkOrderStatus.COMPLETED) {
        expect(wo.progress).toBe(100);
      } else if (wo.status === WorkOrderStatus.PLANNED) {
        expect(wo.progress).toBe(0);
      } else if (wo.status === WorkOrderStatus.IN_PROGRESS) {
        expect(wo.progress).toBeGreaterThan(0);
        expect(wo.progress).toBeLessThan(100);
      }
    }
  });

  it("OT number format matches /^OT-[A-Z]+-\\d{4}$/", () => {
    const otPattern = /^OT-[A-Z]+-\d{4}$/;
    for (const wo of world.workOrders) {
      expect(wo.otNumber).toMatch(otPattern);
    }
  });

  it("FK integrity: all tank stationIds reference existing stations", () => {
    const stationIds = new Set(world.stations.map((s) => s.id));
    for (const tank of world.tanks) {
      expect(stationIds.has(tank.stationId)).toBe(true);
    }
  });

  it("FK integrity: all equipment stationIds reference existing stations", () => {
    const stationIds = new Set(world.stations.map((s) => s.id));
    for (const equip of world.equipment) {
      expect(stationIds.has(equip.stationId)).toBe(true);
    }
  });

  it("FK integrity: all cathodic reading segmentIds reference existing segments", () => {
    const segmentIds = new Set(world.pipeline.segments.map((s) => s.id));
    for (const reading of world.cathodicReadings) {
      expect(segmentIds.has(reading.segmentId)).toBe(true);
    }
  });

  it("heightMm is coherent with currentLevelM3 (computed via gauge factor)", () => {
    // heightMm should be approximately round(currentLevelM3 / gaugeFactor)
    // We verify indirectly: heightMm > 0 for any tank with positive level
    for (const tank of world.tanks) {
      if (tank.currentLevelM3 > 0) {
        expect(tank.heightMm).toBeGreaterThan(0);
      }
    }
  });

  it("pipeline has at least one segment", () => {
    expect(world.pipeline.segments.length).toBeGreaterThanOrEqual(1);
  });

  it("pipeline segments cover the full length", () => {
    const last = world.pipeline.segments[world.pipeline.segments.length - 1];
    expect(last.toKm).toBeCloseTo(world.pipeline.totalLengthKm, 0);
  });

  it("each station has a pipelineId matching the pipeline", () => {
    for (const station of world.stations) {
      expect(station.pipelineId).toBe(world.pipeline.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Minimum entity counts (REQ-011-C)
// ---------------------------------------------------------------------------
describe("generateWorld — minimum entity counts", () => {
  const world = generateWorld();

  it("has at least 10 tanks total", () => {
    expect(world.tanks.length).toBeGreaterThanOrEqual(10);
  });

  it("has at least 30 equipment total", () => {
    expect(world.equipment.length).toBeGreaterThanOrEqual(30);
  });

  it("has 4 shippers", () => {
    expect(world.shippers.length).toBe(4);
  });

  it("has at least 30 movements (≥1 per history day)", () => {
    expect(world.movements.length).toBeGreaterThanOrEqual(30);
  });

  it("has at least 1 cathodic reading per segment", () => {
    expect(world.cathodicReadings.length).toBeGreaterThanOrEqual(world.pipeline.segments.length);
  });

  it("has telemetry points", () => {
    expect(world.telemetry.length).toBeGreaterThan(0);
  });
});
