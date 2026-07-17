/**
 * Tests for generateWorld pipeline.
 * Written first (TDD RED) before implementation exists.
 * Covers REQ-011 (determinism) and REQ-012 (coherence rules).
 */
import { describe, it, expect } from "vitest";
import { generateWorld, GENERATOR_REFERENCE_DATE } from "./generate";
import { DEFAULT_CONFIG } from "./config";
import seedJson from "./seed.json";
import { detectDegradationTrend, evaluatePotential } from "@/lib/integrity/thresholds";
import {
  CANONICAL_STATIONS,
  CANONICAL_STATION_TAGS,
  CANONICAL_TANKS,
  CANONICAL_LOCKED_PUMP_TAG,
  CUSTODY_MANIFOLD_TAG,
} from "./canonical";
import { computeCustodyDiff } from "@/lib/volumetrics/custody";
import { resolveNodeStatus, NodeStatus } from "@/lib/domain/nodeStatus";
import { EmissionScope, StoppageResponsible, EquipmentType } from "@/lib/domain";

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
    // Generic stations plus the canonical hero stations (MV-2)
    expect(world.stations.length).toBe(DEFAULT_CONFIG.stationCount + CANONICAL_STATIONS.length);
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

// ---------------------------------------------------------------------------
// REQ-WO-TRACEABILITY: WorkOrder equipmentId traces back to plan's equipmentId
// ---------------------------------------------------------------------------
describe("generateWorld — WorkOrder equipment traceability", () => {
  const world = generateWorld({ seed: 100 });

  it("every WO with a taskId has equipmentId matching the parent plan's equipmentId", () => {
    // Build a map from taskId -> plan.equipmentId
    const taskToPlanEquipment = new Map<string, string>();
    for (const plan of world.maintenancePlans) {
      if (!plan.equipmentId) continue;
      for (const task of plan.tasks) {
        taskToPlanEquipment.set(task.id, plan.equipmentId);
      }
    }

    for (const wo of world.workOrders) {
      if (!wo.taskId) continue;
      const expectedEquipId = taskToPlanEquipment.get(wo.taskId);
      if (expectedEquipId === undefined) continue; // task not from a plan with equipment
      expect(wo.equipmentId).toBe(expectedEquipId);
    }
  });
});

// ---------------------------------------------------------------------------
// SR-301: Seed enrichment — cathodic readings per point (6–12 per km:segmentId)
// ---------------------------------------------------------------------------
describe("generateWorld — SR-301 cathodic reading enrichment", () => {
  const world = generateWorld({ seed: 2026 });

  it("S-301-A: every km:segmentId group has between 6 and 12 readings", () => {
    // Group by km:segmentId composite key
    const groups = new Map<string, number>();
    for (const r of world.cathodicReadings) {
      const key = `${r.km}:${r.segmentId}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    expect(groups.size).toBeGreaterThan(0);
    for (const [key, count] of groups) {
      expect(count, `group ${key} has ${count} readings`).toBeGreaterThanOrEqual(6);
      expect(count, `group ${key} has ${count} readings`).toBeLessThanOrEqual(12);
    }
  });

  it("S-301-B: at least 1 km:segmentId group returns detectDegradationTrend === true", () => {
    // Group readings by composite key
    const groups = new Map<string, typeof world.cathodicReadings>();
    for (const r of world.cathodicReadings) {
      const key = `${r.km}:${r.segmentId}`;
      const existing = groups.get(key) ?? [];
      existing.push(r);
      groups.set(key, existing);
    }
    let foundDegrading = false;
    for (const readings of groups.values()) {
      if (detectDegradationTrend(readings)) {
        foundDegrading = true;
        break;
      }
    }
    expect(foundDegrading).toBe(true);
  });

  it("S-301-C: same seed produces identical cathodicReadings (determinism)", () => {
    const world2 = generateWorld({ seed: 2026 });
    expect(JSON.stringify(world.cathodicReadings)).toBe(JSON.stringify(world2.cathodicReadings));
  });

  it("S-301-D-level: every reading level === evaluatePotential(potentialV)", () => {
    for (const r of world.cathodicReadings) {
      expect(r.level, `reading ${r.id} level mismatch`).toBe(evaluatePotential(r.potentialV));
    }
  });

  it("S-301-E: a point with exactly 2 readings gets trend NEUTRAL from buildReadingTableRows", async () => {
    const { buildReadingTableRows, TrendFlag } = await import("@/lib/integrity/selectors");
    const { AlertLevel } = await import("@/lib/domain");
    const twoReadingWorld = {
      pipeline: { id: "PL-0001", name: "T", diameterInches: 16, totalLengthKm: 270, segments: [] },
      stations: [],
      tanks: [],
      shippers: [],
      equipment: [],
      movements: [],
      volumeTargets: [],
      maintenancePlans: [],
      workOrders: [],
      telemetry: [],
      cathodicReadings: [
        {
          id: "r1",
          segmentId: "SEG-0002",
          km: 1,
          potentialV: -0.9,
          takenAt: "2026-01-01T00:00:00Z",
          level: AlertLevel.OK,
          stationId: undefined,
        },
        {
          id: "r2",
          segmentId: "SEG-0002",
          km: 1,
          potentialV: -0.87,
          takenAt: "2026-01-02T00:00:00Z",
          level: AlertLevel.OK,
          stationId: undefined,
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = buildReadingTableRows(twoReadingWorld as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].trend).toBe(TrendFlag.NEUTRAL);
  });
});

// ---------------------------------------------------------------------------
// MV-2: Canonical hero topology
// ---------------------------------------------------------------------------
describe("generateWorld — canonical hero topology (MV-2)", () => {
  const world = generateWorld({ seed: 7 });

  it("contains every canonical station tag with the expected kind", () => {
    for (const spec of CANONICAL_STATIONS) {
      const station = world.stations.find((s) => s.tag === spec.tag);
      expect(station, `canonical station ${spec.tag} missing`).toBeDefined();
      expect(station!.kind).toBe(spec.kind);
      expect(station!.name).toBe(spec.name);
    }
  });

  it("contains every canonical custody tank at its canonical station with the right basis", () => {
    for (const spec of CANONICAL_TANKS) {
      const tank = world.tanks.find((t) => t.tag === spec.tag);
      expect(tank, `canonical tank ${spec.tag} missing`).toBeDefined();
      expect(tank!.volumeBasis).toBe(spec.volumeBasis);
      const station = world.stations.find((s) => s.id === tank!.stationId);
      expect(station?.tag).toBe(spec.stationTag);
    }
  });

  it("contains the custody manifold valve at Puerto Hernández", () => {
    const valve = world.equipment.find((e) => e.tag === CUSTODY_MANIFOLD_TAG);
    expect(valve).toBeDefined();
    expect(valve!.type).toBe(EquipmentType.VALVE);
    const station = world.stations.find((s) => s.id === valve!.stationId);
    expect(station?.tag).toBe(CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ);
  });

  it("keeps station km strictly increasing after canonical insertion", () => {
    for (let i = 1; i < world.stations.length; i++) {
      expect(world.stations[i].km).toBeGreaterThan(world.stations[i - 1].km);
    }
  });

  it("keeps tank tags unique", () => {
    const tags = world.tanks.map((t) => t.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

// ---------------------------------------------------------------------------
// MV-3/MV-4: Identity seed — operators, workstation, shift roster
// ---------------------------------------------------------------------------
describe("generateWorld — identity seed (MV-3/MV-4)", () => {
  const world = generateWorld({ seed: 7 });

  it("has a 5-operator crew with names and initials", () => {
    expect(world.operators).toHaveLength(5);
    for (const operator of world.operators) {
      expect(operator.name.length).toBeGreaterThan(0);
      expect(operator.initials.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("has the SALA-OPS-PC1 workstation", () => {
    expect(world.workstations.length).toBeGreaterThanOrEqual(1);
    expect(world.workstations.some((w) => w.label === "SALA-OPS-PC1")).toBe(true);
  });

  it("has an active shift roster covering the full crew on the workstation", () => {
    expect(world.shiftRosters).toHaveLength(1);
    const roster = world.shiftRosters[0];
    expect(world.workstations.some((w) => w.id === roster.workstationId)).toBe(true);
    const operatorIds = new Set(world.operators.map((o) => o.id));
    expect(roster.operatorIds.length).toBe(5);
    for (const id of roster.operatorIds) {
      expect(operatorIds.has(id)).toBe(true);
    }
  });

  it("seeds structured shift log entries authored by crew members", () => {
    expect(world.shiftLogEntries.length).toBeGreaterThanOrEqual(1);
    const operatorIds = new Set(world.operators.map((o) => o.id));
    const workstationIds = new Set(world.workstations.map((w) => w.id));
    for (const entry of world.shiftLogEntries) {
      expect(operatorIds.has(entry.authorId)).toBe(true);
      expect(workstationIds.has(entry.workstationId)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// MV-4: Report series — 12 months of targets, custody, and report entities
// ---------------------------------------------------------------------------
describe("generateWorld — report series (MV-4)", () => {
  const world = generateWorld({ seed: 7 });

  it("volume targets cover 12 distinct monthly periods", () => {
    const periods = new Set(world.volumeTargets.map((t) => t.period));
    expect(periods.size).toBeGreaterThanOrEqual(12);
  });

  it("custody differences cover 12 months for every shipper", () => {
    const periods = new Set(world.custodyDifferences.map((c) => c.period));
    expect(periods.size).toBe(12);
    for (const shipper of world.shippers) {
      const shipperRecords = world.custodyDifferences.filter((c) => c.shipperId === shipper.id);
      expect(shipperRecords, `shipper ${shipper.id} custody series`).toHaveLength(12);
    }
  });

  it("custody diff fields are consistent with computeCustodyDiff", () => {
    for (const record of world.custodyDifferences) {
      const expected = computeCustodyDiff(record.originVolM3, record.destVolM3);
      expect(record.diffM3).toBeCloseTo(expected.diffM3, 6);
      expect(record.diffPct).toBeCloseTo(expected.diffPct, 6);
    }
  });

  it("emits pipeline stoppages with valid responsible values", () => {
    expect(world.pipelineStoppages.length).toBeGreaterThan(0);
    const validResponsible = new Set<string>(Object.values(StoppageResponsible));
    for (const stoppage of world.pipelineStoppages) {
      expect(validResponsible.has(stoppage.responsible)).toBe(true);
      expect(stoppage.durationHours).toBeGreaterThan(0);
    }
  });

  it("emits emission entries for all three scopes in each of 12 months", () => {
    const periods = new Set(world.emissionEntries.map((e) => e.period));
    expect(periods.size).toBe(12);
    for (const period of periods) {
      const scopes = new Set(
        world.emissionEntries.filter((e) => e.period === period).map((e) => e.scope),
      );
      expect(scopes.size).toBe(Object.values(EmissionScope).length);
    }
  });

  it("emits closing comments per area for each of 12 months", () => {
    const periods = new Set(world.closingComments.map((c) => c.period));
    expect(periods.size).toBe(12);
    for (const comment of world.closingComments) {
      expect(comment.area.length).toBeGreaterThan(0);
      expect(comment.comment.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// MV-5: Seeded non-OK node states
// ---------------------------------------------------------------------------
describe("generateWorld — seeded non-OK node states (MV-5)", () => {
  const world = generateWorld({ ...DEFAULT_CONFIG, seed: 2026 });

  it("Terminal Concepción hosts the deliberately locked-out pump", () => {
    const pump = world.equipment.find((e) => e.tag === CANONICAL_LOCKED_PUMP_TAG);
    expect(pump).toBeDefined();
    expect(pump!.isOperational).toBe(false);
    const station = world.stations.find((s) => s.id === pump!.stationId);
    expect(station?.tag).toBe(CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION);
  });

  it("Terminal Concepción resolves to a non-OK status (LOTO or ALERT)", () => {
    const station = world.stations.find(
      (s) => s.tag === CANONICAL_STATION_TAGS.TERMINAL_CONCEPCION,
    );
    const status = resolveNodeStatus(world, station!.id, GENERATOR_REFERENCE_DATE);
    expect([NodeStatus.LOTO, NodeStatus.ALERT]).toContain(status);
  });

  it("Puerto Hernández resolves to a non-OK status (overdue permit work order)", () => {
    const station = world.stations.find((s) => s.tag === CANONICAL_STATION_TAGS.PUERTO_HERNANDEZ);
    const status = resolveNodeStatus(world, station!.id, GENERATOR_REFERENCE_DATE);
    expect(status).not.toBe(NodeStatus.OK);
  });
});

// ---------------------------------------------------------------------------
// REQ-SEED-STALENESS: committed seed.json matches generateWorld with FIXED_SEED
// ---------------------------------------------------------------------------
describe("generateWorld — seed.json staleness guard", () => {
  it("seed.json matches generateWorld({ ...DEFAULT_CONFIG, seed: 2026 })", () => {
    const generated = generateWorld({ ...DEFAULT_CONFIG, seed: 2026 });
    expect(JSON.stringify(generated)).toBe(JSON.stringify(seedJson));
  });
});
