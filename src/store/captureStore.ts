/**
 * Capture store (MV-9) — the write path of the demo.
 *
 * Responsibilities (PLAN_MEJORAS_VENTA §6):
 *   - Hold the capture session: the workstation and the roster declared for
 *     the current shift (declareRoster).
 *   - Commit operator captures (tank reading / movement / shift note):
 *     each commit runs MV-6 validation (blocks reject, warns pass flagged),
 *     resolves identity via MV-7 (workstation + PIN), stamps CaptureMeta
 *     (actor + workstation + timestamp), appends to the ledger, and APPLIES
 *     the effect to the in-memory world.
 *   - Amend committed records with ledger semantics (MV-8): a correction is
 *     a NEW record superseding the original; the world is re-applied.
 *
 * World-propagation design (integration choice, documented):
 *   captureStore owns the write path, so it is the one store allowed to push
 *   into the world stores — a one-way dependency (captureStore → worldStore /
 *   simulationStore) with no cycles:
 *     1. It derives the next PipelineWorld immutably and publishes it through
 *        worldStore's existing loadWorld() action. Everything that reads the
 *        world (balance selectors, hero, reports) sees the commit at once.
 *     2. It nudges the LIVE tank levels through simulationStore's
 *        applyCapturedLevels() action so the running simulation reflects the
 *        capture immediately without a disruptive re-init.
 *   (maintenanceStore's "no cross-store imports" rule is scoped to SR-205's
 *   overrides slice; the capture store's entire purpose is propagation.)
 */

import { create } from "zustand";
import type { CaptureMeta, Equipment, Movement, PipelineWorld, ShiftLogEntry, ShiftRoster, Tank } from "@/lib/domain";
import {
  validateMovement,
  validatePumpRun,
  validateShiftNote,
  validateTankReading,
  hasBlockingIssue,
  CaptureIssueSeverity,
  CaptureIssueCode,
} from "@/lib/capture/validate";
import type {
  CaptureIssue,
  MovementInput,
  PumpRunInput,
  ShiftNoteInput,
  TankReadingInput,
} from "@/lib/capture/validate";
import { resolveActor, ActorRejectionCode } from "@/lib/capture/identity";
import type { OperatorCredential } from "@/lib/capture/identity";
import {
  amendRecord as ledgerAmend,
  getAmendmentTrail,
  getEffectiveRecords,
  isSuperseded,
} from "@/lib/capture/ledger";
import { toGsv, toVolume15C, toVolume60F } from "@/lib/volumetrics/conversions";
import { useWorldStore } from "./worldStore";
import { useSimulationStore } from "./simulationStore";

// ---------------------------------------------------------------------------
// Const objects + derived types (ADR-3)
// ---------------------------------------------------------------------------

/** Kind of a captured record in the ledger. */
export const CaptureRecordKind = {
  TANK_READING: "TANK_READING",
  MOVEMENT: "MOVEMENT",
  SHIFT_NOTE: "SHIFT_NOTE",
  PUMP_RUN: "PUMP_RUN",
} as const;
export type CaptureRecordKind = (typeof CaptureRecordKind)[keyof typeof CaptureRecordKind];

/** Outcome of a commit attempt. */
export const CommitStatus = {
  COMMITTED: "committed",
  BLOCKED: "blocked",
  REJECTED: "rejected",
} as const;
export type CommitStatus = (typeof CommitStatus)[keyof typeof CommitStatus];

/** Why a commit was rejected (identity/session — validation issues use BLOCKED). */
export const CaptureRejectionCode = {
  ...ActorRejectionCode,
  NO_ACTIVE_SESSION: "NO_ACTIVE_SESSION",
  WORLD_NOT_LOADED: "WORLD_NOT_LOADED",
} as const;
export type CaptureRejectionCode =
  (typeof CaptureRejectionCode)[keyof typeof CaptureRejectionCode];

// ---------------------------------------------------------------------------
// Record types (discriminated by kind)
// ---------------------------------------------------------------------------

interface CaptureRecordBase {
  id: string;
  /** Non-blocking validation issues accepted at commit time (flagged warns). */
  warnings: CaptureIssue[];
  /** Provenance: actor + workstation + timestamp (+ amendment envelope). */
  captureMeta: CaptureMeta;
}

export interface TankReadingRecord extends CaptureRecordBase {
  kind: typeof CaptureRecordKind.TANK_READING;
  values: TankReadingInput;
}

export interface MovementRecord extends CaptureRecordBase {
  kind: typeof CaptureRecordKind.MOVEMENT;
  values: MovementInput;
}

export interface ShiftNoteRecord extends CaptureRecordBase {
  kind: typeof CaptureRecordKind.SHIFT_NOTE;
  values: ShiftNoteInput;
}

export interface PumpRunRecord extends CaptureRecordBase {
  kind: typeof CaptureRecordKind.PUMP_RUN;
  values: PumpRunInput;
}

export type CaptureRecord = TankReadingRecord | MovementRecord | ShiftNoteRecord | PumpRunRecord;

/** Values an amendment may change, depending on the record kind. */
export type AmendableValues = Partial<
  TankReadingInput | MovementInput | ShiftNoteInput | PumpRunInput
>;

// ---------------------------------------------------------------------------
// Action results
// ---------------------------------------------------------------------------

export type DeclareRosterResult =
  | { ok: true; roster: ShiftRoster }
  | { ok: false; message: string };

export type CommitResult =
  | { status: typeof CommitStatus.COMMITTED; record: CaptureRecord; warnings: CaptureIssue[] }
  | { status: typeof CommitStatus.BLOCKED; issues: CaptureIssue[] }
  | { status: typeof CommitStatus.REJECTED; code: CaptureRejectionCode; message: string };

/** Per-commit options. enteredAt is injectable for deterministic tests. */
export interface CommitOptions {
  /** ISO 8601 timestamp — defaults to the current time. */
  enteredAt?: string;
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

interface CaptureSlice {
  /** Workstation of the current capture session (null until declareRoster). */
  workstationId: string | null;
  /** Roster declared for the current shift (null until declareRoster). */
  activeRoster: ShiftRoster | null;
  /** The capture ledger: every committed record, amendments included. */
  records: CaptureRecord[];
  // Internal sequence counters for deterministic IDs
  _recordSeq: number;
  _rosterSeq: number;
}

export interface DeclareRosterInput {
  workstationId: string;
  operatorIds: string[];
  /** ISO 8601 shift start — defaults to the current time. */
  startedAt?: string;
}

interface CaptureActions {
  declareRoster: (input: DeclareRosterInput) => DeclareRosterResult;
  commitTankReading: (
    input: TankReadingInput,
    credential: OperatorCredential,
    opts?: CommitOptions,
  ) => CommitResult;
  commitMovement: (
    input: MovementInput,
    credential: OperatorCredential,
    opts?: CommitOptions,
  ) => CommitResult;
  commitShiftNote: (
    input: ShiftNoteInput,
    credential: OperatorCredential,
    opts?: CommitOptions,
  ) => CommitResult;
  commitPumpRun: (
    input: PumpRunInput,
    credential: OperatorCredential,
    opts?: CommitOptions,
  ) => CommitResult;
  /** Ledger amendment: creates a NEW record superseding recordId (MV-8). */
  amendRecord: (
    recordId: string,
    newValues: AmendableValues,
    credential: OperatorCredential,
    opts?: CommitOptions,
  ) => CommitResult;
}

export type CaptureStore = CaptureSlice & CaptureActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_CAPTURE_SLICE: CaptureSlice = {
  workstationId: null,
  activeRoster: null,
  records: [],
  _recordSeq: 1,
  _rosterSeq: 1,
};

// ---------------------------------------------------------------------------
// Pure world-application helpers (internal)
// ---------------------------------------------------------------------------

function padSeq(seq: number): string {
  return String(seq).padStart(4, "0");
}

/** Immutably set a tank's level (and optionally temperature) in a tank list. */
function withTankLevel(
  tanks: Tank[],
  tankId: string,
  levelM3: number,
  temperatureF?: number,
): Tank[] {
  return tanks.map((tank) =>
    tank.id === tankId
      ? { ...tank, currentLevelM3: levelM3, temperatureF: temperatureF ?? tank.temperatureF }
      : tank,
  );
}

/**
 * Immutably apply a movement's volume delta to any tank endpoints.
 * direction +1 applies the movement; −1 reverts it (used by amendments).
 * Levels are clamped to [0, capacity].
 */
function withMovementDeltas(tanks: Tank[], input: MovementInput, direction: 1 | -1): Tank[] {
  return tanks.map((tank) => {
    let delta = 0;
    if (tank.id === input.fromNodeId) delta -= input.volumeM3 * direction;
    if (tank.id === input.toNodeId) delta += input.volumeM3 * direction;
    if (delta === 0) return tank;
    const level = Math.min(Math.max(tank.currentLevelM3 + delta, 0), tank.capacityM3);
    return { ...tank, currentLevelM3: level };
  });
}

/**
 * Immutably shift an equipment's accumulated operating hours (MV-19).
 * direction +1 applies the run; −1 reverts it (used by amendments).
 * Hours are clamped to ≥ 0.
 */
function withEquipmentHours(
  equipment: Equipment[],
  equipmentId: string,
  hoursRun: number,
  direction: 1 | -1,
): Equipment[] {
  return equipment.map((item) =>
    item.id === equipmentId
      ? { ...item, operatingHours: Math.max(0, item.operatingHours + hoursRun * direction) }
      : item,
  );
}

/** Build the domain Movement for a committed movement capture. */
function buildMovement(
  world: PipelineWorld,
  id: string,
  input: MovementInput,
  captureMeta: CaptureMeta,
): Movement {
  const temperatureF = input.temperatureF ?? 60;
  const originTank = world.tanks.find((t) => t.id === input.fromNodeId);
  return {
    id,
    type: input.type,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    shipperId: input.shipperId,
    volumeGsvM3: toGsv(input.volumeM3, temperatureF),
    volume15CM3: toVolume15C(input.volumeM3, temperatureF),
    volume60FM3: toVolume60F(input.volumeM3, temperatureF),
    temperatureF,
    apiGravity: input.apiGravity ?? originTank?.apiGravity ?? 30,
    // Captured as an executed operation: visible to both the dispatch (salida)
    // and receipt (entrada) buckets of the hourly balance.
    startedAt: captureMeta.enteredAt,
    endedAt: captureMeta.enteredAt,
    captureMeta,
  };
}

/** Build the domain ShiftLogEntry for a committed shift note. */
function buildShiftLogEntry(
  id: string,
  input: ShiftNoteInput,
  captureMeta: CaptureMeta,
): ShiftLogEntry {
  return {
    id,
    timestamp: captureMeta.enteredAt,
    type: input.type,
    description: input.description,
    stationId: input.stationId,
    authorId: captureMeta.authorId,
    workstationId: captureMeta.workstationId,
  };
}

/** Push the next world + the touched live tank levels to the world stores. */
function propagate(nextWorld: PipelineWorld, touchedTankIds: string[]): void {
  useWorldStore.getState().loadWorld(nextWorld);
  if (touchedTankIds.length === 0) return;
  const levels: Record<string, number> = {};
  for (const tankId of touchedTankIds) {
    const tank = nextWorld.tanks.find((t) => t.id === tankId);
    if (tank) levels[tankId] = tank.currentLevelM3;
  }
  useSimulationStore.getState().applyCapturedLevels(levels);
}

function blockedIssue(code: CaptureIssueCode, message: string): CaptureIssue {
  return { severity: CaptureIssueSeverity.BLOCK, code, message };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCaptureStore = create<CaptureStore>((set, get) => {
  /**
   * Shared commit pipeline: session check → MV-6 validation → MV-7 identity
   * → CaptureMeta stamp → ledger append → world application.
   */
  function runCommit(
    kind: CaptureRecordKind,
    values: TankReadingInput | MovementInput | ShiftNoteInput | PumpRunInput,
    credential: OperatorCredential,
    opts: CommitOptions | undefined,
    supersedes?: { originalId: string },
  ): CommitResult {
    const world = useWorldStore.getState().world;
    if (!world) {
      return {
        status: CommitStatus.REJECTED,
        code: CaptureRejectionCode.WORLD_NOT_LOADED,
        message: "Los datos del oleoducto aún no están disponibles.",
      };
    }

    const { workstationId } = get();
    if (!workstationId) {
      return {
        status: CommitStatus.REJECTED,
        code: CaptureRejectionCode.NO_ACTIVE_SESSION,
        message: "Declare la dotación del turno antes de registrar datos.",
      };
    }

    // For a movement or pump-run amendment, validate against the world WITHOUT
    // the original record's effect (it is being replaced, not stacked).
    let baseWorld = world;
    if (supersedes && kind === CaptureRecordKind.MOVEMENT) {
      const originalRecord = get().records.find((r) => r.id === supersedes.originalId);
      if (originalRecord?.kind === CaptureRecordKind.MOVEMENT) {
        baseWorld = {
          ...world,
          tanks: withMovementDeltas(world.tanks, originalRecord.values, -1),
          movements: world.movements.filter((m) => m.id !== originalRecord.id),
        };
      }
    }
    if (supersedes && kind === CaptureRecordKind.PUMP_RUN) {
      const originalRecord = get().records.find((r) => r.id === supersedes.originalId);
      if (originalRecord?.kind === CaptureRecordKind.PUMP_RUN) {
        baseWorld = {
          ...world,
          equipment: withEquipmentHours(
            world.equipment,
            originalRecord.values.equipmentId,
            originalRecord.values.hoursRun,
            -1,
          ),
        };
      }
    }

    // MV-6 — validation at entry
    let issues: CaptureIssue[];
    switch (kind) {
      case CaptureRecordKind.TANK_READING:
        issues = validateTankReading(baseWorld, values as TankReadingInput);
        break;
      case CaptureRecordKind.MOVEMENT:
        issues = validateMovement(baseWorld, values as MovementInput);
        break;
      case CaptureRecordKind.SHIFT_NOTE:
        issues = validateShiftNote(values as ShiftNoteInput);
        break;
      case CaptureRecordKind.PUMP_RUN:
        issues = validatePumpRun(baseWorld, values as PumpRunInput);
        break;
    }
    if (hasBlockingIssue(issues)) {
      return { status: CommitStatus.BLOCKED, issues };
    }
    const warnings = issues.filter((i) => i.severity === CaptureIssueSeverity.WARN);

    // MV-7 — identity per action (workstation + PIN)
    const resolution = resolveActor(world, workstationId, credential);
    if (!resolution.ok) {
      return { status: CommitStatus.REJECTED, code: resolution.code, message: resolution.message };
    }

    // CaptureMeta stamp: actor + workstation + timestamp
    const enteredAt = opts?.enteredAt ?? new Date().toISOString();
    const recordId = `CAP-${padSeq(get()._recordSeq)}`;

    let record: CaptureRecord;
    if (supersedes) {
      // MV-8 — ledger amendment: NEW record pointing at the superseded one
      const original = get().records.find((r) => r.id === supersedes.originalId);
      if (!original) {
        return {
          status: CommitStatus.BLOCKED,
          issues: [
            blockedIssue(
              CaptureIssueCode.RECORD_NOT_FOUND,
              `El registro "${supersedes.originalId}" no existe en el libro de capturas.`,
            ),
          ],
        };
      }
      record = {
        ...ledgerAmend(
          original,
          { values } as Partial<CaptureRecord>,
          {
            newRecordId: recordId,
            authorId: resolution.operator.id,
            workstationId,
            enteredAt,
          },
        ),
        warnings,
      } as CaptureRecord;
    } else {
      record = {
        id: recordId,
        kind,
        values,
        warnings,
        captureMeta: { authorId: resolution.operator.id, enteredAt, workstationId },
      } as CaptureRecord;
    }

    // Apply the effect to the in-memory world (immutably), then propagate.
    let nextWorld: PipelineWorld;
    const touchedTankIds: string[] = [];
    switch (record.kind) {
      case CaptureRecordKind.TANK_READING: {
        const reading = record.values;
        nextWorld = {
          ...baseWorld,
          tanks: withTankLevel(
            baseWorld.tanks,
            reading.tankId,
            reading.levelM3,
            reading.temperatureF,
          ),
        };
        touchedTankIds.push(reading.tankId);
        break;
      }
      case CaptureRecordKind.MOVEMENT: {
        const movement = buildMovement(baseWorld, record.id, record.values, record.captureMeta);
        nextWorld = {
          ...baseWorld,
          tanks: withMovementDeltas(baseWorld.tanks, record.values, 1),
          movements: [...baseWorld.movements, movement],
        };
        touchedTankIds.push(record.values.fromNodeId, record.values.toNodeId);
        // An amendment also reverted the ORIGINAL endpoints — their levels
        // must reach the live simulation too (propagate skips non-tank ids).
        if (supersedes) {
          const originalRecord = get().records.find((r) => r.id === supersedes.originalId);
          if (originalRecord?.kind === CaptureRecordKind.MOVEMENT) {
            touchedTankIds.push(
              originalRecord.values.fromNodeId,
              originalRecord.values.toNodeId,
            );
          }
        }
        break;
      }
      case CaptureRecordKind.SHIFT_NOTE: {
        const supersededEntryId = supersedes?.originalId;
        const entries = supersededEntryId
          ? baseWorld.shiftLogEntries.filter((e) => e.id !== supersededEntryId)
          : baseWorld.shiftLogEntries;
        nextWorld = {
          ...baseWorld,
          shiftLogEntries: [
            ...entries,
            buildShiftLogEntry(record.id, record.values, record.captureMeta),
          ],
        };
        break;
      }
      case CaptureRecordKind.PUMP_RUN: {
        // MV-19 — the hour that advances the maintenance plan: accumulated
        // operating hours move, so the BY_HOURS selectors reflect the capture
        // immediately. No tank is touched.
        const run = record.values;
        nextWorld = {
          ...baseWorld,
          equipment: withEquipmentHours(baseWorld.equipment, run.equipmentId, run.hoursRun, 1),
        };
        break;
      }
    }

    propagate(nextWorld, touchedTankIds);
    set((state) => ({
      records: [...state.records, record],
      _recordSeq: state._recordSeq + 1,
    }));

    return { status: CommitStatus.COMMITTED, record, warnings };
  }

  return {
    ...INITIAL_CAPTURE_SLICE,

    // -------------------------------------------------------------------
    // declareRoster — foundation of per-action identity (§6.3)
    // -------------------------------------------------------------------
    declareRoster: (input) => {
      const world = useWorldStore.getState().world;
      if (!world) {
        return { ok: false, message: "Los datos del oleoducto aún no están disponibles." };
      }

      const workstation = world.workstations.find((w) => w.id === input.workstationId);
      if (!workstation) {
        return { ok: false, message: `La estación "${input.workstationId}" no está registrada.` };
      }

      if (input.operatorIds.length === 0) {
        return { ok: false, message: "Declare al menos un operador para el turno." };
      }

      const unknown = input.operatorIds.filter(
        (id) => !world.operators.some((o) => o.id === id),
      );
      if (unknown.length > 0) {
        return {
          ok: false,
          message: `Los siguientes operadores no existen en el registro de personal: ${unknown.join(", ")}.`,
        };
      }

      const roster: ShiftRoster = {
        id: `ROS-CAP-${padSeq(get()._rosterSeq)}`,
        workstationId: input.workstationId,
        operatorIds: [...input.operatorIds],
        startedAt: input.startedAt ?? new Date().toISOString(),
      };

      // Publish into the world so identity resolution (MV-7) sees this roster
      // as the ACTIVE one for the workstation.
      useWorldStore.getState().loadWorld({
        ...world,
        shiftRosters: [...world.shiftRosters, roster],
      });

      set((state) => ({
        workstationId: input.workstationId,
        activeRoster: roster,
        _rosterSeq: state._rosterSeq + 1,
      }));

      return { ok: true, roster };
    },

    // -------------------------------------------------------------------
    // Commits
    // -------------------------------------------------------------------
    commitTankReading: (input, credential, opts) =>
      runCommit(CaptureRecordKind.TANK_READING, input, credential, opts),

    commitMovement: (input, credential, opts) =>
      runCommit(CaptureRecordKind.MOVEMENT, input, credential, opts),

    commitShiftNote: (input, credential, opts) =>
      runCommit(CaptureRecordKind.SHIFT_NOTE, input, credential, opts),

    commitPumpRun: (input, credential, opts) =>
      runCommit(CaptureRecordKind.PUMP_RUN, input, credential, opts),

    // -------------------------------------------------------------------
    // amendRecord — ledger semantics (MV-8): never overwrite
    // -------------------------------------------------------------------
    amendRecord: (recordId, newValues, credential, opts) => {
      const { records } = get();
      const original = records.find((r) => r.id === recordId);
      if (!original) {
        return {
          status: CommitStatus.BLOCKED,
          issues: [
            blockedIssue(
              CaptureIssueCode.RECORD_NOT_FOUND,
              `El registro "${recordId}" no existe en el libro de capturas.`,
            ),
          ],
        };
      }
      if (isSuperseded(records, recordId)) {
        return {
          status: CommitStatus.BLOCKED,
          issues: [
            blockedIssue(
              CaptureIssueCode.RECORD_SUPERSEDED,
              `El registro "${recordId}" ya fue corregido. Enmiende la versión vigente de la traza.`,
            ),
          ],
        };
      }

      // Merge per kind so the spread stays a single input type, not a
      // cross-product union.
      let mergedValues: TankReadingInput | MovementInput | ShiftNoteInput | PumpRunInput;
      switch (original.kind) {
        case CaptureRecordKind.TANK_READING:
          mergedValues = { ...original.values, ...(newValues as Partial<TankReadingInput>) };
          break;
        case CaptureRecordKind.MOVEMENT:
          mergedValues = { ...original.values, ...(newValues as Partial<MovementInput>) };
          break;
        case CaptureRecordKind.SHIFT_NOTE:
          mergedValues = { ...original.values, ...(newValues as Partial<ShiftNoteInput>) };
          break;
        case CaptureRecordKind.PUMP_RUN:
          mergedValues = { ...original.values, ...(newValues as Partial<PumpRunInput>) };
          break;
      }
      return runCommit(original.kind, mergedValues, credential, opts, {
        originalId: recordId,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Selectors — expose the ledger trail (MV-9 acceptance)
// ---------------------------------------------------------------------------

/** Records currently in force (superseded ones excluded). */
export function selectEffectiveRecords(state: CaptureStore): CaptureRecord[] {
  return getEffectiveRecords(state.records);
}

/**
 * Selector factory: full amendment trail (oldest → newest) of the chain
 * containing recordId.
 */
export function selectAmendmentTrail(
  recordId: string,
): (state: CaptureStore) => CaptureRecord[] {
  return (state) => getAmendmentTrail(state.records, recordId);
}
