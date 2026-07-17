/**
 * Unit tests for capture validation rules (MV-6).
 * Pure rule functions — one test per rule, plus severity semantics.
 */

import { describe, it, expect } from "vitest";
import {
  validateTankReading,
  validateMovement,
  validateShiftNote,
  validatePumpRun,
  hasBlockingIssue,
  CaptureIssueSeverity,
  CaptureIssueCode,
  LEVEL_JUMP_WARN_FRACTION,
  PUMP_RUN_SHIFT_MAX_HOURS,
  PUMP_RUN_TYPICAL_SHIFT_HOURS,
} from "./validate";
import type { CaptureIssue } from "./validate";
import { Criticality, EquipmentType, MovementType, NodeKind, VolumeBasis } from "@/lib/domain";
import type { Equipment, PipelineWorld } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Fixture world
// ---------------------------------------------------------------------------

function makeWorld(): PipelineWorld {
  return {
    pipeline: { id: "p1", name: "Test", diameterInches: 16, totalLengthKm: 100, segments: [] },
    stations: [
      { id: "STA-1", name: "Puerto Hernández", kind: NodeKind.SOURCE, km: 0, pipelineId: "p1" },
      { id: "STA-2", name: "Terminal Concepción", kind: NodeKind.TERMINAL, km: 100, pipelineId: "p1" },
    ],
    tanks: [
      {
        id: "TNK-1",
        tag: "T-101",
        stationId: "STA-1",
        capacityM3: 30_000,
        currentLevelM3: 18_000,
        heightMm: 9000,
        product: "Medanito",
        apiGravity: 35,
        temperatureF: 59,
        volumeBasis: VolumeBasis.C15,
      },
      {
        id: "TNK-2",
        tag: "T-6010",
        stationId: "STA-2",
        capacityM3: 50_000,
        currentLevelM3: 27_500,
        heightMm: 8250,
        product: "OTASA-2",
        apiGravity: 33,
        temperatureF: 60,
        volumeBasis: VolumeBasis.F60,
      },
    ],
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
  };
}

function codes(issues: CaptureIssue[]): string[] {
  return issues.map((i) => i.code);
}

// ---------------------------------------------------------------------------
// validateTankReading
// ---------------------------------------------------------------------------

describe("validateTankReading", () => {
  it("blocks a reading for an unknown tank", () => {
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-999", levelM3: 100 });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe(CaptureIssueSeverity.BLOCK);
    expect(issues[0].code).toBe(CaptureIssueCode.TANK_NOT_FOUND);
    expect(issues[0].message.length).toBeGreaterThan(0);
  });

  it("blocks a non-finite level value", () => {
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: Number.NaN });
    expect(codes(issues)).toContain(CaptureIssueCode.INVALID_NUMBER);
    expect(issues.every((i) => i.severity === CaptureIssueSeverity.BLOCK)).toBe(true);
  });

  it("blocks a negative level", () => {
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: -50 });
    expect(codes(issues)).toContain(CaptureIssueCode.NEGATIVE_LEVEL);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a level above tank capacity (impossible data)", () => {
    // TNK-1 capacity = 30 000 m³
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: 30_001 });
    expect(codes(issues)).toContain(CaptureIssueCode.LEVEL_ABOVE_CAPACITY);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("warns when the level lands in the high-level alarm band (>= 95% of capacity)", () => {
    // 29 000 / 30 000 = 96.7% — possible but unusual
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: 29_000 });
    expect(codes(issues)).toContain(CaptureIssueCode.HIGH_LEVEL_ALARM);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("warns when the reading differs from the recorded stock beyond the warn tolerance", () => {
    // Book stock 18 000, reading 18 300 → 1.67% > BALANCE_TOLERANCE_WARN (1%)
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: 18_300 });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe(CaptureIssueSeverity.WARN);
    expect(issues[0].code).toBe(CaptureIssueCode.DIFF_BEYOND_TOLERANCE);
  });

  it("warns on an implausibly large level jump vs the previous reading", () => {
    // Jump of 13 000 m³ > LEVEL_JUMP_WARN_FRACTION (30%) of 30 000 m³ capacity
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: 5000 });
    expect(codes(issues)).toContain(CaptureIssueCode.IMPLAUSIBLE_LEVEL_JUMP);
    expect(hasBlockingIssue(issues)).toBe(false);
    expect(LEVEL_JUMP_WARN_FRACTION).toBeGreaterThan(0);
    expect(LEVEL_JUMP_WARN_FRACTION).toBeLessThan(1);
  });

  it("accepts a plausible reading with no issues", () => {
    // 18 100 vs 18 000 book = 0.56% — inside the warn tolerance
    const issues = validateTankReading(makeWorld(), { tankId: "TNK-1", levelM3: 18_100 });
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateMovement
// ---------------------------------------------------------------------------

describe("validateMovement", () => {
  it("blocks a movement with an unknown node", () => {
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "NODE-X",
      toNodeId: "TNK-2",
      volumeM3: 100,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.NODE_NOT_FOUND);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a movement whose origin equals its destination", () => {
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "TNK-1",
      toNodeId: "TNK-1",
      volumeM3: 100,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.SAME_NODE);
  });

  it("blocks a non-positive volume", () => {
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "STA-1",
      toNodeId: "TNK-2",
      volumeM3: -10,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.NON_POSITIVE_VOLUME);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a non-finite volume", () => {
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "STA-1",
      toNodeId: "TNK-2",
      volumeM3: Number.POSITIVE_INFINITY,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.INVALID_NUMBER);
  });

  it("blocks a movement that would overfill the destination tank", () => {
    // TNK-2: 27 500 + 23 000 = 50 500 > 50 000 capacity
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "STA-1",
      toNodeId: "TNK-2",
      volumeM3: 23_000,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.DEST_TANK_OVERFILL);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a movement larger than the origin tank stock", () => {
    // TNK-1 holds 18 000 m³ — cannot move 19 000 m³ out of it
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "TNK-1",
      toNodeId: "STA-2",
      volumeM3: 19_000,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.ORIGIN_INSUFFICIENT_STOCK);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("warns when the destination tank ends inside the high-level alarm band", () => {
    // TNK-2: 27 500 + 20 500 = 48 000 = 96% of 50 000 — possible but unusual
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "STA-1",
      toNodeId: "TNK-2",
      volumeM3: 20_500,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.DEST_TANK_HIGH_LEVEL);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("accepts a plausible movement with no issues", () => {
    const issues = validateMovement(makeWorld(), {
      type: MovementType.TRANSFER,
      fromNodeId: "STA-1",
      toNodeId: "TNK-2",
      volumeM3: 1000,
    });
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateShiftNote
// ---------------------------------------------------------------------------

describe("validateShiftNote", () => {
  it("blocks a note with an empty description", () => {
    const issues = validateShiftNote({ type: "OPERATION", description: "   " });
    expect(codes(issues)).toContain(CaptureIssueCode.EMPTY_DESCRIPTION);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a note with an empty type", () => {
    const issues = validateShiftNote({ type: "", description: "Alineación de múltiple." });
    expect(codes(issues)).toContain(CaptureIssueCode.EMPTY_TYPE);
  });

  it("accepts a well-formed note", () => {
    const issues = validateShiftNote({
      type: "OPERATION",
      description: "Alineación de múltiple para despacho desde T-101.",
    });
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasBlockingIssue
// ---------------------------------------------------------------------------

describe("hasBlockingIssue", () => {
  it("returns false for an empty list and for warn-only lists", () => {
    expect(hasBlockingIssue([])).toBe(false);
    expect(
      hasBlockingIssue([
        { severity: CaptureIssueSeverity.WARN, code: CaptureIssueCode.HIGH_LEVEL_ALARM, message: "x" },
      ]),
    ).toBe(false);
  });

  it("returns true when at least one issue blocks", () => {
    expect(
      hasBlockingIssue([
        { severity: CaptureIssueSeverity.WARN, code: CaptureIssueCode.HIGH_LEVEL_ALARM, message: "x" },
        { severity: CaptureIssueSeverity.BLOCK, code: CaptureIssueCode.NEGATIVE_LEVEL, message: "y" },
      ]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePumpRun
// ---------------------------------------------------------------------------

function makePump(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "EQP-1",
    tag: "J-100",
    name: "Bomba de Despacho",
    type: EquipmentType.PUMP,
    criticality: Criticality.HIGH,
    isOperational: true,
    stationId: "STA-1",
    operatingHours: 1995,
    ...overrides,
  };
}

function makePumpWorld(equipment: Equipment[] = [makePump()]): PipelineWorld {
  return { ...makeWorld(), equipment };
}

describe("validatePumpRun", () => {
  it("blocks a run for an unknown equipment", () => {
    const issues = validatePumpRun(makePumpWorld(), { equipmentId: "EQP-999", hoursRun: 8 });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe(CaptureIssueSeverity.BLOCK);
    expect(issues[0].code).toBe(CaptureIssueCode.EQUIPMENT_NOT_FOUND);
    expect(issues[0].message.length).toBeGreaterThan(0);
  });

  it("blocks a non-numeric hours value", () => {
    const issues = validatePumpRun(makePumpWorld(), { equipmentId: "EQP-1", hoursRun: Number.NaN });
    expect(codes(issues)).toContain(CaptureIssueCode.INVALID_NUMBER);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks zero or negative hours (nothing to accumulate)", () => {
    for (const hoursRun of [0, -3]) {
      const issues = validatePumpRun(makePumpWorld(), { equipmentId: "EQP-1", hoursRun });
      expect(codes(issues)).toContain(CaptureIssueCode.NON_POSITIVE_HOURS);
      expect(hasBlockingIssue(issues)).toBe(true);
    }
  });

  it(`blocks hours above the physical shift maximum (${PUMP_RUN_SHIFT_MAX_HOURS} h)`, () => {
    const issues = validatePumpRun(makePumpWorld(), {
      equipmentId: "EQP-1",
      hoursRun: PUMP_RUN_SHIFT_MAX_HOURS + 1,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.HOURS_ABOVE_SHIFT_MAX);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it(`warns (not blocks) hours beyond a typical shift (${PUMP_RUN_TYPICAL_SHIFT_HOURS} h)`, () => {
    const issues = validatePumpRun(makePumpWorld(), {
      equipmentId: "EQP-1",
      hoursRun: PUMP_RUN_TYPICAL_SHIFT_HOURS + 2,
    });
    expect(codes(issues)).toContain(CaptureIssueCode.HOURS_BEYOND_TYPICAL_SHIFT);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("warns when the equipment is flagged non-operational (unusual but possible)", () => {
    const world = makePumpWorld([makePump({ isOperational: false })]);
    const issues = validatePumpRun(world, { equipmentId: "EQP-1", hoursRun: 8 });
    expect(codes(issues)).toContain(CaptureIssueCode.EQUIPMENT_NOT_RUNNING);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("accepts a plausible shift run with no issues", () => {
    const issues = validatePumpRun(makePumpWorld(), { equipmentId: "EQP-1", hoursRun: 8 });
    expect(issues).toEqual([]);
  });
});
