/**
 * Tests for resolveNodeStatus (MV-5).
 * Written first (TDD RED) before implementation exists.
 * Covers each status branch and the severity precedence
 * ALERT > LOTO > PERMIT > OK.
 */
import { describe, it, expect } from "vitest";
import { resolveNodeStatus, NodeStatus } from "./nodeStatus";
import {
  AlertLevel,
  Criticality,
  EquipmentType,
  MaintenanceType,
  NodeKind,
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/lib/domain";
import type { CathodicReading, Equipment, PipelineWorld, Tank, WorkOrder } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-06-12";
const STATION_ID = "STA-0001";
const OTHER_STATION_ID = "STA-0002";

function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "EQP-0001",
    tag: "J-1000",
    name: "Bomba Principal",
    type: EquipmentType.PUMP,
    criticality: Criticality.HIGH,
    isOperational: true,
    stationId: STATION_ID,
    operatingHours: 1000,
    ...overrides,
  };
}

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "WO-0001",
    otNumber: "OT-TST-0001",
    type: MaintenanceType.PREVENTIVE,
    status: WorkOrderStatus.PLANNED,
    priority: WorkOrderPriority.MEDIUM,
    progress: 0,
    description: "Test WO",
    equipmentId: "EQP-0001",
    stationId: STATION_ID,
    programDate: "2026-06-01",
    estimatedHours: 4,
    ...overrides,
  };
}

function makeReading(overrides: Partial<CathodicReading> = {}): CathodicReading {
  return {
    id: "CAT-0001",
    segmentId: "SEG-0001",
    stationId: STATION_ID,
    km: 10,
    potentialV: -0.9,
    takenAt: "2026-06-10T12:00:00.000Z",
    level: AlertLevel.OK,
    ...overrides,
  };
}

function makeTank(overrides: Partial<Tank> = {}): Tank {
  return {
    id: "TNK-0001",
    tag: "T-101",
    stationId: STATION_ID,
    capacityM3: 10000,
    currentLevelM3: 5000,
    heightMm: 10000,
    product: "Medanito",
    apiGravity: 34,
    temperatureF: 75,
    ...overrides,
  };
}

function makeWorld(overrides: Partial<PipelineWorld> = {}): PipelineWorld {
  return {
    pipeline: {
      id: "PL-0001",
      name: "Test Pipeline",
      diameterInches: 16,
      totalLengthKm: 270,
      segments: [],
    },
    stations: [
      {
        id: STATION_ID,
        name: "Estación Uno",
        kind: NodeKind.PUMP_STATION,
        km: 10,
        pipelineId: "PL-0001",
      },
      {
        id: OTHER_STATION_ID,
        name: "Estación Dos",
        kind: NodeKind.TERMINAL,
        km: 270,
        pipelineId: "PL-0001",
      },
    ],
    tanks: [],
    shippers: [],
    equipment: [],
    movements: [],
    volumeTargets: [],
    custodyDifferences: [],
    maintenancePlans: [],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
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
// OK branch
// ---------------------------------------------------------------------------

describe("resolveNodeStatus — OK", () => {
  it("returns OK for a station with operational equipment, no overdue WOs, and OK readings", () => {
    const world = makeWorld({
      equipment: [makeEquipment()],
      workOrders: [makeWorkOrder({ programDate: "2026-07-01" })],
      cathodicReadings: [makeReading()],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });

  it("returns OK for a station with no equipment, work orders, or readings", () => {
    expect(resolveNodeStatus(makeWorld(), STATION_ID, NOW)).toBe(NodeStatus.OK);
  });

  it("returns OK for an unknown node id", () => {
    expect(resolveNodeStatus(makeWorld(), "does-not-exist", NOW)).toBe(NodeStatus.OK);
  });
});

// ---------------------------------------------------------------------------
// LOTO branch — non-operational equipment
// ---------------------------------------------------------------------------

describe("resolveNodeStatus — LOTO", () => {
  it("returns LOTO when the station has non-operational equipment", () => {
    const world = makeWorld({
      equipment: [makeEquipment({ isOperational: false })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.LOTO);
  });

  it("ignores non-operational equipment at other stations", () => {
    const world = makeWorld({
      equipment: [makeEquipment({ isOperational: false, stationId: OTHER_STATION_ID })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });
});

// ---------------------------------------------------------------------------
// PERMIT branch — overdue open work orders
// ---------------------------------------------------------------------------

describe("resolveNodeStatus — PERMIT", () => {
  it("returns PERMIT when the station has an open work order past its program date", () => {
    const world = makeWorld({
      workOrders: [makeWorkOrder({ status: WorkOrderStatus.PLANNED, programDate: "2026-06-01" })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.PERMIT);
  });

  it("does not flag completed work orders past their program date", () => {
    const world = makeWorld({
      workOrders: [
        makeWorkOrder({
          status: WorkOrderStatus.COMPLETED,
          progress: 100,
          programDate: "2026-06-01",
        }),
      ],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });

  it("does not flag open work orders scheduled in the future", () => {
    const world = makeWorld({
      workOrders: [
        makeWorkOrder({
          status: WorkOrderStatus.IN_PROGRESS,
          progress: 50,
          programDate: "2026-07-01",
        }),
      ],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });
});

// ---------------------------------------------------------------------------
// ALERT branch — critical cathodic protection
// ---------------------------------------------------------------------------

describe("resolveNodeStatus — ALERT", () => {
  it("returns ALERT when the latest cathodic reading at the station is CRITICAL", () => {
    const world = makeWorld({
      cathodicReadings: [
        makeReading({
          id: "CAT-1",
          takenAt: "2026-06-01T12:00:00.000Z",
          potentialV: -0.9,
          level: AlertLevel.OK,
        }),
        makeReading({
          id: "CAT-2",
          takenAt: "2026-06-10T12:00:00.000Z",
          potentialV: -0.6,
          level: AlertLevel.CRITICAL,
        }),
      ],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.ALERT);
  });

  it("does not alert when a newer reading at the same point recovered to OK", () => {
    const world = makeWorld({
      cathodicReadings: [
        makeReading({
          id: "CAT-1",
          takenAt: "2026-06-01T12:00:00.000Z",
          potentialV: -0.6,
          level: AlertLevel.CRITICAL,
        }),
        makeReading({
          id: "CAT-2",
          takenAt: "2026-06-10T12:00:00.000Z",
          potentialV: -0.9,
          level: AlertLevel.OK,
        }),
      ],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });

  it("evaluates each km point independently (one critical point alerts)", () => {
    const world = makeWorld({
      cathodicReadings: [
        makeReading({ id: "CAT-1", km: 10, level: AlertLevel.OK }),
        makeReading({ id: "CAT-2", km: 12, potentialV: -0.6, level: AlertLevel.CRITICAL }),
      ],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.ALERT);
  });

  it("does not alert on WARNING readings", () => {
    const world = makeWorld({
      cathodicReadings: [makeReading({ potentialV: -0.8, level: AlertLevel.WARNING })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.OK);
  });
});

// ---------------------------------------------------------------------------
// Precedence and node resolution
// ---------------------------------------------------------------------------

describe("resolveNodeStatus — precedence", () => {
  it("prefers ALERT over LOTO and PERMIT", () => {
    const world = makeWorld({
      equipment: [makeEquipment({ isOperational: false })],
      workOrders: [makeWorkOrder({ programDate: "2026-06-01" })],
      cathodicReadings: [makeReading({ potentialV: -0.6, level: AlertLevel.CRITICAL })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.ALERT);
  });

  it("prefers LOTO over PERMIT", () => {
    const world = makeWorld({
      equipment: [makeEquipment({ isOperational: false })],
      workOrders: [makeWorkOrder({ programDate: "2026-06-01" })],
    });
    expect(resolveNodeStatus(world, STATION_ID, NOW)).toBe(NodeStatus.LOTO);
  });
});

describe("resolveNodeStatus — tank node resolution", () => {
  it("resolves a tank id to its station status", () => {
    const world = makeWorld({
      tanks: [makeTank()],
      equipment: [makeEquipment({ isOperational: false })],
    });
    expect(resolveNodeStatus(world, "TNK-0001", NOW)).toBe(NodeStatus.LOTO);
  });
});
