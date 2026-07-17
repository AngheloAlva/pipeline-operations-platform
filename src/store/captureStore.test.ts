/**
 * Unit tests for captureStore (MV-9).
 * Store logic tested via the store API (getState), no React setup — same
 * idiom as simulationStore.test.ts.
 *
 * Integration under test: a committed capture must reach the in-memory world
 * (worldStore) AND the live simulation levels (simulationStore) so the
 * existing selectors (hero, balance) see it immediately.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useCaptureStore,
  INITIAL_CAPTURE_SLICE,
  CommitStatus,
  CaptureRecordKind,
  CaptureRejectionCode,
  selectEffectiveRecords,
  selectAmendmentTrail,
} from "./captureStore";
import { useWorldStore } from "./worldStore";
import { useSimulationStore, INITIAL_SLICE } from "./simulationStore";
import { CaptureIssueCode, CaptureIssueSeverity } from "@/lib/capture/validate";
import { mockPinFor } from "@/lib/capture/identity";
import { groupBalanceByHour } from "@/lib/volumetrics/balance";
import { deriveEquipmentHoursOutlook } from "@/lib/maintenance/selectors";
import { TaskStatus } from "@/lib/maintenance/scheduling";
import {
  Criticality,
  EquipmentType,
  MaintenanceFrequency,
  MaintenanceType,
  MovementType,
  NodeKind,
  VolumeBasis,
} from "@/lib/domain";
import type { PipelineWorld } from "@/lib/domain";

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
    shippers: [{ id: "SHP-1", name: "OldelVal" }],
    equipment: [
      {
        id: "EQP-1",
        tag: "J-100",
        name: "Bomba de Despacho PH",
        type: EquipmentType.PUMP,
        criticality: Criticality.HIGH,
        isOperational: true,
        stationId: "STA-1",
        operatingHours: 1995,
      },
    ],
    movements: [],
    volumeTargets: [],
    custodyDifferences: [],
    maintenancePlans: [
      {
        id: "PLN-1",
        name: "Plan Bomba de Despacho",
        description: "Usage-based plan for the fixture pump",
        isActive: true,
        equipmentId: "EQP-1",
        tasks: [
          {
            id: "TSK-1",
            planId: "PLN-1",
            name: "Cambio de aceite",
            type: MaintenanceType.PREVENTIVE,
            frequency: MaintenanceFrequency.BY_HOURS,
            intervalHours: 2000,
            nextDueAtHours: 2000,
            nextDueDate: "2027-01-01", // far future — hours drive the status
          },
        ],
      },
    ],
    workOrders: [],
    cathodicReadings: [],
    telemetry: [],
    operators: [
      { id: "OPR-0580", name: "María Soto", initials: "MS" },
      { id: "OPR-0581", name: "Juan Pérez", initials: "JP" },
      { id: "OPR-0599", name: "Rosa Fuentes", initials: "RF" },
    ],
    workstations: [{ id: "WST-0585", label: "SALA-OPS-PC1" }],
    shiftRosters: [
      {
        id: "ROS-1",
        workstationId: "WST-0585",
        operatorIds: ["OPR-0580", "OPR-0581"],
        startedAt: "2026-06-12T08:00:00.000Z",
      },
    ],
    shiftLogEntries: [],
    pipelineStoppages: [],
    emissionEntries: [],
    closingComments: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T_DECLARE = "2026-06-12T20:00:00.000Z";
const T_COMMIT = "2026-06-12T20:30:00.000Z";
const T_AMEND = "2026-06-12T21:00:00.000Z";

function getStore() {
  return useCaptureStore.getState();
}

function getWorld(): PipelineWorld {
  const world = useWorldStore.getState().world;
  if (!world) throw new Error("fixture world missing");
  return world;
}

/** Declare the standard test roster and return the credential of María (0580). */
function declareStandardRoster() {
  const result = getStore().declareRoster({
    workstationId: "WST-0585",
    operatorIds: ["OPR-0580", "OPR-0581"],
    startedAt: T_DECLARE,
  });
  expect(result.ok).toBe(true);
  return { operatorId: "OPR-0580", pin: mockPinFor("OPR-0580") };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("captureStore", () => {
  beforeEach(() => {
    useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
    const world = makeWorld();
    useWorldStore.setState({ world, loaded: true });
    useSimulationStore.setState(INITIAL_SLICE);
    useSimulationStore.getState().init(world);
  });

  // -------------------------------------------------------------------
  // declareRoster
  // -------------------------------------------------------------------

  it("declareRoster sets the session and appends the roster to the world (becomes active)", () => {
    const result = getStore().declareRoster({
      workstationId: "WST-0585",
      operatorIds: ["OPR-0580", "OPR-0581"],
      startedAt: T_DECLARE,
    });
    expect(result.ok).toBe(true);
    const state = getStore();
    expect(state.workstationId).toBe("WST-0585");
    expect(state.activeRoster?.operatorIds).toEqual(["OPR-0580", "OPR-0581"]);
    // Appended to the world so identity resolution sees it as the ACTIVE roster
    const rosters = getWorld().shiftRosters;
    expect(rosters).toHaveLength(2);
    expect(rosters[rosters.length - 1].id).toBe(state.activeRoster?.id);
  });

  it("declareRoster rejects unknown operators and an unknown workstation", () => {
    const badOperator = getStore().declareRoster({
      workstationId: "WST-0585",
      operatorIds: ["OPR-XXXX"],
      startedAt: T_DECLARE,
    });
    expect(badOperator.ok).toBe(false);

    const badWorkstation = getStore().declareRoster({
      workstationId: "WST-9999",
      operatorIds: ["OPR-0580"],
      startedAt: T_DECLARE,
    });
    expect(badWorkstation.ok).toBe(false);

    expect(getStore().workstationId).toBeNull();
    expect(getWorld().shiftRosters).toHaveLength(1);
  });

  // -------------------------------------------------------------------
  // commitTankReading
  // -------------------------------------------------------------------

  it("rejects any commit before a roster is declared for the session", () => {
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      { operatorId: "OPR-0580", pin: mockPinFor("OPR-0580") },
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.REJECTED);
    if (result.status === CommitStatus.REJECTED) {
      expect(result.code).toBe(CaptureRejectionCode.NO_ACTIVE_SESSION);
    }
  });

  it("valid tank reading commits: stamps CaptureMeta and applies to world + live simulation", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      credential,
      { enteredAt: T_COMMIT },
    );

    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;

    // CaptureMeta: actor + workstation + timestamp
    expect(result.record.kind).toBe(CaptureRecordKind.TANK_READING);
    expect(result.record.captureMeta.authorId).toBe("OPR-0580");
    expect(result.record.captureMeta.workstationId).toBe("WST-0585");
    expect(result.record.captureMeta.enteredAt).toBe(T_COMMIT);
    expect(result.warnings).toEqual([]);

    // Ledger holds the record
    expect(getStore().records).toHaveLength(1);

    // World: the tank's current level changed (immutably — new world object)
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_100);

    // Live simulation: selectors see the new level immediately
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBe(18_100);
    expect(getStore().lastPropagation).toMatchObject({
      sequence: 1,
      recordId: "CAP-0001",
      tankIds: ["TNK-1"],
      highlightBalance: true,
      highlightCustody: true,
    });
  });

  it("validates and applies a reading from the live simulation stock, not stale world stock", () => {
    const credential = declareStandardRoster();
    useSimulationStore.getState().applyCapturedLevels({ "TNK-1": 24_421 });
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 24_421, temperatureF: 32 },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;
    expect(result.warnings).toEqual([]);
    expect(getWorld().tanks.find((tank) => tank.id === "TNK-1")?.currentLevelM3).toBe(24_421);
  });

  it("a reading with warnings commits flagged (warns pass through)", () => {
    const credential = declareStandardRoster();
    // 18 400 vs 18 000 book = 2.2% > warn tolerance (1%) — unusual but possible
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_400 },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].severity).toBe(CaptureIssueSeverity.WARN);
    expect(result.record.warnings).toEqual(result.warnings);
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_400);
  });

  it("a blocked reading (impossible data) does NOT apply and appends no record", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 31_000 }, // above 30 000 m³ capacity
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.BLOCKED);
    if (result.status === CommitStatus.BLOCKED) {
      expect(result.issues.some((i) => i.code === CaptureIssueCode.LEVEL_ABOVE_CAPACITY)).toBe(
        true,
      );
    }
    expect(getStore().records).toHaveLength(0);
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_000);
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBe(18_000);
  });

  it("a wrong PIN rejects the commit and nothing is applied", () => {
    declareStandardRoster();
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      { operatorId: "OPR-0580", pin: "9999" },
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.REJECTED);
    if (result.status === CommitStatus.REJECTED) {
      expect(result.code).toBe(CaptureRejectionCode.INVALID_PIN);
    }
    expect(getStore().records).toHaveLength(0);
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_000);
  });

  it("an operator outside the DECLARED roster is rejected even if on an older roster", () => {
    // Declare only María — Juan (OPR-0581) remains on the older seed roster
    getStore().declareRoster({
      workstationId: "WST-0585",
      operatorIds: ["OPR-0580"],
      startedAt: T_DECLARE,
    });
    const result = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      { operatorId: "OPR-0581", pin: mockPinFor("OPR-0581") },
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.REJECTED);
    if (result.status === CommitStatus.REJECTED) {
      expect(result.code).toBe(CaptureRejectionCode.OPERATOR_NOT_IN_ROSTER);
    }
  });

  // -------------------------------------------------------------------
  // commitMovement
  // -------------------------------------------------------------------

  it("valid movement commits: appended to world.movements and visible to balance selectors", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitMovement(
      {
        type: MovementType.TRANSFER,
        fromNodeId: "STA-1",
        toNodeId: "TNK-2",
        volumeM3: 1000,
        shipperId: "SHP-1",
        temperatureF: 60,
      },
      credential,
      { enteredAt: "2026-06-12T14:30:00.000Z" },
    );

    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;

    const world = getWorld();
    expect(world.movements).toHaveLength(1);
    const movement = world.movements[0];
    expect(movement.id).toBe(result.record.id);
    expect(movement.captureMeta?.authorId).toBe("OPR-0580");
    expect(movement.volumeGsvM3).toBeCloseTo(1000, 6);

    // Balance selector sees it: hour 14 bucket carries the volume
    const hourly = groupBalanceByHour(world.movements);
    const bucket = hourly.find((h) => h.hour === 14);
    expect(bucket).toBeDefined();
    expect(bucket?.salidas).toBeCloseTo(1000, 6);
    expect(bucket?.entradas).toBeCloseTo(1000, 6);

    // Destination tank level rises in world + live simulation
    expect(world.tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBeCloseTo(28_500, 6);
    expect(useSimulationStore.getState().tankLevels["TNK-2"]).toBeCloseTo(28_500, 6);
  });

  it("a tank-to-tank movement adjusts both tank levels", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitMovement(
      {
        type: MovementType.TRANSFER,
        fromNodeId: "TNK-1",
        toNodeId: "TNK-2",
        volumeM3: 2000,
      },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);
    const world = getWorld();
    expect(world.tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBeCloseTo(16_000, 6);
    expect(world.tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBeCloseTo(29_500, 6);
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBeCloseTo(16_000, 6);
    expect(useSimulationStore.getState().tankLevels["TNK-2"]).toBeCloseTo(29_500, 6);
  });

  it("a movement that would overfill the destination tank is blocked and not applied", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitMovement(
      {
        type: MovementType.TRANSFER,
        fromNodeId: "STA-1",
        toNodeId: "TNK-2",
        volumeM3: 23_000, // 27 500 + 23 000 > 50 000 capacity
      },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.BLOCKED);
    if (result.status === CommitStatus.BLOCKED) {
      expect(result.issues.some((i) => i.code === CaptureIssueCode.DEST_TANK_OVERFILL)).toBe(true);
    }
    expect(getWorld().movements).toHaveLength(0);
    expect(getWorld().tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBe(27_500);
  });

  // -------------------------------------------------------------------
  // commitShiftNote
  // -------------------------------------------------------------------

  it("valid shift note commits into world.shiftLogEntries with author + workstation", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitShiftNote(
      { type: "OPERATION", description: "Alineación de múltiple para despacho desde T-101." },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;

    const entries = getWorld().shiftLogEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(result.record.id);
    expect(entries[0].authorId).toBe("OPR-0580");
    expect(entries[0].workstationId).toBe("WST-0585");
    expect(entries[0].timestamp).toBe(T_COMMIT);
  });

  it("a shift note with an empty description is blocked", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitShiftNote(
      { type: "OPERATION", description: "  " },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.BLOCKED);
    expect(getWorld().shiftLogEntries).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // commitPumpRun (MV-19 — the hour that advances the maintenance plan)
  // -------------------------------------------------------------------

  it("valid pump run commits: accumulates hours on the equipment in the world", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitPumpRun(
      { equipmentId: "EQP-1", hoursRun: 8 },
      credential,
      { enteredAt: T_COMMIT },
    );

    expect(result.status).toBe(CommitStatus.COMMITTED);
    if (result.status !== CommitStatus.COMMITTED) return;

    expect(result.record.kind).toBe(CaptureRecordKind.PUMP_RUN);
    expect(result.record.captureMeta.authorId).toBe("OPR-0580");
    expect(result.record.captureMeta.workstationId).toBe("WST-0585");
    expect(getStore().records).toHaveLength(1);

    // World: 1995 + 8 = 2003 accumulated hours (immutably — new world object)
    expect(getWorld().equipment.find((e) => e.id === "EQP-1")?.operatingHours).toBe(2003);
  });

  it("the committed hours advance the maintenance outlook in the same session", () => {
    const credential = declareStandardRoster();

    // Before: 5 h remaining to the 2000 h threshold → UPCOMING (≤10% of interval)
    const before = deriveEquipmentHoursOutlook(getWorld(), "EQP-1", "2026-06-12");
    expect(before?.tasks[0].remainingHours).toBe(5);
    expect(before?.tasks[0].taskStatus).toBe(TaskStatus.UPCOMING);

    const result = getStore().commitPumpRun(
      { equipmentId: "EQP-1", hoursRun: 8 },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.COMMITTED);

    // After: −3 h remaining → the plan's task is now OVERDUE — no double entry
    const after = deriveEquipmentHoursOutlook(getWorld(), "EQP-1", "2026-06-12");
    expect(after?.operatingHours).toBe(2003);
    expect(after?.tasks[0].remainingHours).toBe(-3);
    expect(after?.tasks[0].taskStatus).toBe(TaskStatus.OVERDUE);
  });

  it("a blocked pump run (non-positive hours) does NOT apply and appends no record", () => {
    const credential = declareStandardRoster();
    const result = getStore().commitPumpRun(
      { equipmentId: "EQP-1", hoursRun: -4 },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(result.status).toBe(CommitStatus.BLOCKED);
    if (result.status === CommitStatus.BLOCKED) {
      expect(result.issues.some((i) => i.code === CaptureIssueCode.NON_POSITIVE_HOURS)).toBe(true);
    }
    expect(getStore().records).toHaveLength(0);
    expect(getWorld().equipment.find((e) => e.id === "EQP-1")?.operatingHours).toBe(1995);
  });

  it("amending a pump run replaces its hour delta instead of stacking it", () => {
    const credential = declareStandardRoster();
    const first = getStore().commitPumpRun(
      { equipmentId: "EQP-1", hoursRun: 8 },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (first.status !== CommitStatus.COMMITTED) throw new Error("setup failed");
    expect(getWorld().equipment.find((e) => e.id === "EQP-1")?.operatingHours).toBe(2003);

    const amended = getStore().amendRecord(
      first.record.id,
      { hoursRun: 6 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(amended.status).toBe(CommitStatus.COMMITTED);
    if (amended.status !== CommitStatus.COMMITTED) return;

    // 1995 + 6 = 2001 — the original +8 was reverted, not stacked
    expect(getWorld().equipment.find((e) => e.id === "EQP-1")?.operatingHours).toBe(2001);
    expect(amended.record.captureMeta.supersedesId).toBe(first.record.id);
    expect(selectEffectiveRecords(getStore()).map((r) => r.id)).toEqual([amended.record.id]);
  });

  // -------------------------------------------------------------------
  // amendRecord
  // -------------------------------------------------------------------

  it("amendment creates a NEW record with a visible trail and re-applies to the world", () => {
    const credential = declareStandardRoster();
    const first = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      credential,
      { enteredAt: T_COMMIT },
    );
    expect(first.status).toBe(CommitStatus.COMMITTED);
    if (first.status !== CommitStatus.COMMITTED) return;
    const originalId = first.record.id;

    const amendCredential = { operatorId: "OPR-0581", pin: mockPinFor("OPR-0581") };
    const amended = getStore().amendRecord(
      originalId,
      { levelM3: 18_200 },
      amendCredential,
      { enteredAt: T_AMEND },
    );
    expect(amended.status).toBe(CommitStatus.COMMITTED);
    if (amended.status !== CommitStatus.COMMITTED) return;

    // New record — the original is preserved untouched
    expect(amended.record.id).not.toBe(originalId);
    expect(amended.record.captureMeta.supersedesId).toBe(originalId);
    expect(amended.record.captureMeta.authorId).toBe("OPR-0581");
    expect(amended.record.captureMeta.previousValue).toBeDefined();
    expect(getStore().records).toHaveLength(2);
    const original = getStore().records.find((r) => r.id === originalId);
    expect(original?.captureMeta.supersedesId).toBeUndefined();
    if (original?.kind === CaptureRecordKind.TANK_READING) {
      expect(original.values.levelM3).toBe(18_100);
    }

    // Trail: oldest → newest; effective set excludes the superseded original
    const trail = selectAmendmentTrail(amended.record.id)(getStore());
    expect(trail.map((r) => r.id)).toEqual([originalId, amended.record.id]);
    const effective = selectEffectiveRecords(getStore());
    expect(effective.map((r) => r.id)).toEqual([amended.record.id]);

    // World reflects the amended value
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_200);
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBe(18_200);
  });

  it("an amendment with a wrong PIN is rejected and creates no record", () => {
    const credential = declareStandardRoster();
    const first = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (first.status !== CommitStatus.COMMITTED) throw new Error("setup failed");

    const result = getStore().amendRecord(
      first.record.id,
      { levelM3: 18_200 },
      { operatorId: "OPR-0580", pin: "0000" },
      { enteredAt: T_AMEND },
    );
    expect(result.status).toBe(CommitStatus.REJECTED);
    expect(getStore().records).toHaveLength(1);
    expect(getWorld().tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBe(18_100);
  });

  it("preserves later stock movements when amending a historical tank reading", () => {
    const credential = declareStandardRoster();
    const reading = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_000 },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (reading.status !== CommitStatus.COMMITTED) throw new Error("setup failed");
    getStore().commitMovement(
      { type: MovementType.TRANSFER, fromNodeId: "TNK-1", toNodeId: "STA-2", volumeM3: 100 },
      credential,
      { enteredAt: "2026-06-12T20:45:00.000Z" },
    );
    expect(getWorld().tanks.find((tank) => tank.id === "TNK-1")?.currentLevelM3).toBe(17_900);

    const amended = getStore().amendRecord(
      reading.record.id,
      { levelM3: 19_000 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(amended.status).toBe(CommitStatus.COMMITTED);
    expect(getWorld().tanks.find((tank) => tank.id === "TNK-1")?.currentLevelM3).toBe(18_900);
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBe(18_900);
  });

  it("amending an unknown or already-superseded record is blocked", () => {
    const credential = declareStandardRoster();

    const unknown = getStore().amendRecord(
      "CAP-0404",
      { levelM3: 18_200 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(unknown.status).toBe(CommitStatus.BLOCKED);
    if (unknown.status === CommitStatus.BLOCKED) {
      expect(unknown.issues[0].code).toBe(CaptureIssueCode.RECORD_NOT_FOUND);
    }

    const first = getStore().commitTankReading(
      { tankId: "TNK-1", levelM3: 18_100 },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (first.status !== CommitStatus.COMMITTED) throw new Error("setup failed");
    const second = getStore().amendRecord(
      first.record.id,
      { levelM3: 18_150 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(second.status).toBe(CommitStatus.COMMITTED);

    // The original is superseded now — amending it again must be blocked
    const stale = getStore().amendRecord(
      first.record.id,
      { levelM3: 18_300 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(stale.status).toBe(CommitStatus.BLOCKED);
    if (stale.status === CommitStatus.BLOCKED) {
      expect(stale.issues[0].code).toBe(CaptureIssueCode.RECORD_SUPERSEDED);
    }
  });

  it("amending a movement replaces it in the world and re-applies tank deltas", () => {
    const credential = declareStandardRoster();
    const first = getStore().commitMovement(
      {
        type: MovementType.TRANSFER,
        fromNodeId: "TNK-1",
        toNodeId: "TNK-2",
        volumeM3: 2000,
      },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (first.status !== CommitStatus.COMMITTED) throw new Error("setup failed");

    const amended = getStore().amendRecord(
      first.record.id,
      { volumeM3: 1500 },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(amended.status).toBe(CommitStatus.COMMITTED);
    if (amended.status !== CommitStatus.COMMITTED) return;

    const world = getWorld();
    // Only the amended movement remains in the world
    expect(world.movements).toHaveLength(1);
    expect(world.movements[0].id).toBe(amended.record.id);
    // Tank levels reflect 1500 m³, not 2000 m³
    expect(world.tanks.find((t) => t.id === "TNK-1")?.currentLevelM3).toBeCloseTo(16_500, 6);
    expect(world.tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBeCloseTo(29_000, 6);
    expect(useSimulationStore.getState().tankLevels["TNK-1"]).toBeCloseTo(16_500, 6);
    expect(useSimulationStore.getState().tankLevels["TNK-2"]).toBeCloseTo(29_000, 6);
  });

  it("amending a movement's endpoint refreshes the abandoned tank's live level", () => {
    const credential = declareStandardRoster();
    const first = getStore().commitMovement(
      {
        type: MovementType.TRANSFER,
        fromNodeId: "TNK-1",
        toNodeId: "TNK-2",
        volumeM3: 2000,
      },
      credential,
      { enteredAt: T_COMMIT },
    );
    if (first.status !== CommitStatus.COMMITTED) throw new Error("setup failed");
    expect(useSimulationStore.getState().tankLevels["TNK-2"]).toBeCloseTo(29_500, 6);

    // Redirect the destination away from TNK-2 — the reverted level must
    // reach the live simulation, not only the world.
    const amended = getStore().amendRecord(
      first.record.id,
      { toNodeId: "STA-2" },
      credential,
      { enteredAt: T_AMEND },
    );
    expect(amended.status).toBe(CommitStatus.COMMITTED);

    // World reverted the abandoned endpoint (TNK-2)...
    expect(getWorld().tanks.find((t) => t.id === "TNK-2")?.currentLevelM3).toBeCloseTo(27_500, 6);
    // ...and the live simulation level must match it (not the stale 29,500).
    expect(useSimulationStore.getState().tankLevels["TNK-2"]).toBeCloseTo(27_500, 6);
  });
});
