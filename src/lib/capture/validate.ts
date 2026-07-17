/**
 * Capture validation rules (MV-6).
 * Pure functions that validate an operator capture BEFORE it is committed
 * to the in-memory world — validation at entry time, not in a later report.
 *
 * Two severities (PLAN_MEJORAS_VENTA §6.2):
 *   - "block": impossible data (level above capacity, negative volume,
 *     movement that would overfill the destination tank). The commit is rejected.
 *   - "warn":  unusual but possible data (difference beyond the warn tolerance,
 *     implausibly large level jump). The commit proceeds, flagged.
 *
 * Every issue carries a human-readable message explaining WHY (user-facing,
 * Spanish — matches the app's UI copy convention).
 * All functions are pure — no side effects.
 */

import { BALANCE_TOLERANCE_WARN, TANK_HIGH_LEVEL_ALARM } from "@/lib/domain";
import type { MovementType, PipelineWorld, Tank } from "@/lib/domain";

// ============================================================================
// CONST OBJECTS + DERIVED TYPES (ADR-3)
// ============================================================================

/** Severity of a capture validation issue. */
export const CaptureIssueSeverity = {
  /** Impossible data — the commit must be rejected. */
  BLOCK: "block",
  /** Unusual but possible data — the commit proceeds, flagged. */
  WARN: "warn",
} as const;
export type CaptureIssueSeverity = (typeof CaptureIssueSeverity)[keyof typeof CaptureIssueSeverity];

/** Stable machine-readable codes for capture validation issues. */
export const CaptureIssueCode = {
  // Tank reading
  TANK_NOT_FOUND: "TANK_NOT_FOUND",
  INVALID_NUMBER: "INVALID_NUMBER",
  NEGATIVE_LEVEL: "NEGATIVE_LEVEL",
  LEVEL_ABOVE_CAPACITY: "LEVEL_ABOVE_CAPACITY",
  HIGH_LEVEL_ALARM: "HIGH_LEVEL_ALARM",
  DIFF_BEYOND_TOLERANCE: "DIFF_BEYOND_TOLERANCE",
  IMPLAUSIBLE_LEVEL_JUMP: "IMPLAUSIBLE_LEVEL_JUMP",
  // Movement
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
  SAME_NODE: "SAME_NODE",
  NON_POSITIVE_VOLUME: "NON_POSITIVE_VOLUME",
  DEST_TANK_OVERFILL: "DEST_TANK_OVERFILL",
  ORIGIN_INSUFFICIENT_STOCK: "ORIGIN_INSUFFICIENT_STOCK",
  DEST_TANK_HIGH_LEVEL: "DEST_TANK_HIGH_LEVEL",
  // Shift note
  EMPTY_DESCRIPTION: "EMPTY_DESCRIPTION",
  EMPTY_TYPE: "EMPTY_TYPE",
  // Pump run (equipment operating hours)
  EQUIPMENT_NOT_FOUND: "EQUIPMENT_NOT_FOUND",
  NON_POSITIVE_HOURS: "NON_POSITIVE_HOURS",
  HOURS_ABOVE_SHIFT_MAX: "HOURS_ABOVE_SHIFT_MAX",
  HOURS_BEYOND_TYPICAL_SHIFT: "HOURS_BEYOND_TYPICAL_SHIFT",
  EQUIPMENT_NOT_RUNNING: "EQUIPMENT_NOT_RUNNING",
  // Ledger / amendment (issued by captureStore, vocabulary owned here)
  RECORD_NOT_FOUND: "RECORD_NOT_FOUND",
  RECORD_SUPERSEDED: "RECORD_SUPERSEDED",
} as const;
export type CaptureIssueCode = (typeof CaptureIssueCode)[keyof typeof CaptureIssueCode];

// ============================================================================
// TYPES
// ============================================================================

/** One validation finding for a capture attempt. */
export interface CaptureIssue {
  severity: CaptureIssueSeverity;
  code: CaptureIssueCode;
  /** Human-readable explanation of WHY (user-facing, Spanish). */
  message: string;
}

/** Operator input for a tank level reading. */
export interface TankReadingInput {
  tankId: string;
  /** Measured level in m³. */
  levelM3: number;
  /** Observed temperature in °F (optional — defaults to the tank's current). */
  temperatureF?: number;
}

/** Operator input for a crude movement between two nodes. */
export interface MovementInput {
  type: MovementType;
  /** Origin station or tank ID. */
  fromNodeId: string;
  /** Destination station or tank ID. */
  toNodeId: string;
  /** Observed volume in m³. */
  volumeM3: number;
  shipperId?: string;
  /** Observed temperature in °F (optional — defaults to 60°F). */
  temperatureF?: number;
  apiGravity?: number;
}

/** Operator input for a structured shift log note. */
export interface ShiftNoteInput {
  /** Entry type, e.g. "OPERATION", "HANDOVER", "INCIDENT". */
  type: string;
  description: string;
  stationId?: string;
}

/**
 * Operator input for the operating hours a rotating equipment (pump/agitator)
 * ran during the shift — the `HRS_BBAS_Agitadores` Excel replacement (§6).
 */
export interface PumpRunInput {
  equipmentId: string;
  /** Hours the equipment ran during the shift. */
  hoursRun: number;
}

// ============================================================================
// TUNABLES
// ============================================================================

/**
 * A level jump larger than this fraction of tank capacity in a single reading
 * is flagged as implausible (warn). Demo plausibility threshold — a real
 * deployment would derive it from historic gauge deltas.
 */
export const LEVEL_JUMP_WARN_FRACTION = 0.3;

/**
 * A single pump-run entry above this many hours is physically impossible for
 * one shift record (a day only has 24 hours) — hard block.
 */
export const PUMP_RUN_SHIFT_MAX_HOURS = 24;

/**
 * A single pump-run entry above a typical shift length is unusual but
 * possible (double shift, catch-up entry) — warn, not block.
 */
export const PUMP_RUN_TYPICAL_SHIFT_HOURS = 12;

// ============================================================================
// HELPERS
// ============================================================================

function block(code: CaptureIssueCode, message: string): CaptureIssue {
  return { severity: CaptureIssueSeverity.BLOCK, code, message };
}

function warn(code: CaptureIssueCode, message: string): CaptureIssue {
  return { severity: CaptureIssueSeverity.WARN, code, message };
}

function formatM3(value: number): string {
  return `${Math.round(value).toLocaleString("es-AR")} m³`;
}

function formatHours(value: number): string {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

/** Percentage with one es-AR decimal ("7,3%") — same locale as m³/hours copy. */
function formatPct(value: number): string {
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function findTank(world: PipelineWorld, nodeId: string): Tank | undefined {
  return world.tanks.find((t) => t.id === nodeId);
}

function nodeExists(world: PipelineWorld, nodeId: string): boolean {
  return (
    world.tanks.some((t) => t.id === nodeId) || world.stations.some((s) => s.id === nodeId)
  );
}

/** True when at least one issue has BLOCK severity (the commit must be rejected). */
export function hasBlockingIssue(issues: CaptureIssue[]): boolean {
  return issues.some((i) => i.severity === CaptureIssueSeverity.BLOCK);
}

// ============================================================================
// validateTankReading
// ============================================================================

/**
 * Validate a tank level reading against the current world.
 * Returns an empty array when the reading is plausible.
 */
export function validateTankReading(
  world: PipelineWorld,
  input: TankReadingInput,
): CaptureIssue[] {
  const tank = findTank(world, input.tankId);
  if (!tank) {
    return [
      block(
        CaptureIssueCode.TANK_NOT_FOUND,
        `El estanque "${input.tankId}" no existe en la topología. Verifique el estanque seleccionado.`,
      ),
    ];
  }

  if (!Number.isFinite(input.levelM3)) {
    return [
      block(
        CaptureIssueCode.INVALID_NUMBER,
        `El nivel ingresado para ${tank.tag} no es un número válido.`,
      ),
    ];
  }

  const issues: CaptureIssue[] = [];

  if (input.levelM3 < 0) {
    issues.push(
      block(
        CaptureIssueCode.NEGATIVE_LEVEL,
        `El nivel de ${tank.tag} no puede ser negativo (${formatM3(input.levelM3)}).`,
      ),
    );
  }

  if (input.levelM3 > tank.capacityM3) {
    issues.push(
      block(
        CaptureIssueCode.LEVEL_ABOVE_CAPACITY,
        `El nivel informado (${formatM3(input.levelM3)}) supera la capacidad de ${tank.tag} (${formatM3(tank.capacityM3)}). Dato físicamente imposible.`,
      ),
    );
  }

  // Warn rules only make sense over a physically possible value.
  if (hasBlockingIssue(issues)) return issues;

  if (input.levelM3 >= tank.capacityM3 * TANK_HIGH_LEVEL_ALARM) {
    const pct = (input.levelM3 / tank.capacityM3) * 100;
    issues.push(
      warn(
        CaptureIssueCode.HIGH_LEVEL_ALARM,
        `El nivel queda en ${formatPct(pct)} de la capacidad de ${tank.tag}, dentro de la banda de alarma de nivel alto (≥ ${TANK_HIGH_LEVEL_ALARM * 100}%).`,
      ),
    );
  }

  const bookLevel = tank.currentLevelM3;
  const delta = Math.abs(input.levelM3 - bookLevel);

  if (bookLevel > 0) {
    const diffPct = (delta / bookLevel) * 100;
    if (diffPct > BALANCE_TOLERANCE_WARN) {
      issues.push(
        warn(
          CaptureIssueCode.DIFF_BEYOND_TOLERANCE,
          `La lectura difiere ${formatPct(diffPct)} del stock registrado de ${tank.tag} (${formatM3(bookLevel)}); supera la tolerancia de ${BALANCE_TOLERANCE_WARN}%. Verifique antes de confirmar.`,
        ),
      );
    }
  }

  if (delta > tank.capacityM3 * LEVEL_JUMP_WARN_FRACTION) {
    issues.push(
      warn(
        CaptureIssueCode.IMPLAUSIBLE_LEVEL_JUMP,
        `Salto de nivel de ${formatM3(delta)} respecto de la última lectura de ${tank.tag} — inusualmente grande para un solo registro.`,
      ),
    );
  }

  return issues;
}

// ============================================================================
// validateMovement
// ============================================================================

/**
 * Validate a crude movement against the current world.
 * Returns an empty array when the movement is plausible.
 */
export function validateMovement(world: PipelineWorld, input: MovementInput): CaptureIssue[] {
  const issues: CaptureIssue[] = [];

  if (!Number.isFinite(input.volumeM3)) {
    issues.push(
      block(CaptureIssueCode.INVALID_NUMBER, "El volumen ingresado no es un número válido."),
    );
  } else if (input.volumeM3 <= 0) {
    issues.push(
      block(
        CaptureIssueCode.NON_POSITIVE_VOLUME,
        `El volumen del movimiento debe ser mayor que cero (${formatM3(input.volumeM3)}).`,
      ),
    );
  }

  for (const [label, nodeId] of [
    ["origen", input.fromNodeId],
    ["destino", input.toNodeId],
  ] as const) {
    if (!nodeExists(world, nodeId)) {
      issues.push(
        block(
          CaptureIssueCode.NODE_NOT_FOUND,
          `El nodo de ${label} "${nodeId}" no existe en la topología.`,
        ),
      );
    }
  }

  if (input.fromNodeId === input.toNodeId) {
    issues.push(
      block(
        CaptureIssueCode.SAME_NODE,
        "El origen y el destino del movimiento no pueden ser el mismo nodo.",
      ),
    );
  }

  // Stock rules require a valid volume and resolvable nodes.
  if (hasBlockingIssue(issues)) return issues;

  const originTank = findTank(world, input.fromNodeId);
  if (originTank && input.volumeM3 > originTank.currentLevelM3) {
    issues.push(
      block(
        CaptureIssueCode.ORIGIN_INSUFFICIENT_STOCK,
        `${originTank.tag} tiene ${formatM3(originTank.currentLevelM3)} disponibles; no puede despachar ${formatM3(input.volumeM3)}.`,
      ),
    );
  }

  const destTank = findTank(world, input.toNodeId);
  if (destTank) {
    const finalLevel = destTank.currentLevelM3 + input.volumeM3;
    if (finalLevel > destTank.capacityM3) {
      issues.push(
        block(
          CaptureIssueCode.DEST_TANK_OVERFILL,
          `El movimiento dejaría ${destTank.tag} en ${formatM3(finalLevel)}, sobre su capacidad de ${formatM3(destTank.capacityM3)}. Sobrellenaría el estanque.`,
        ),
      );
    } else if (finalLevel >= destTank.capacityM3 * TANK_HIGH_LEVEL_ALARM) {
      const pct = (finalLevel / destTank.capacityM3) * 100;
      issues.push(
        warn(
          CaptureIssueCode.DEST_TANK_HIGH_LEVEL,
          `El movimiento deja ${destTank.tag} en ${formatPct(pct)} de su capacidad, dentro de la banda de alarma de nivel alto (≥ ${TANK_HIGH_LEVEL_ALARM * 100}%).`,
        ),
      );
    }
  }

  return issues;
}

// ============================================================================
// validatePumpRun
// ============================================================================

/**
 * Validate a pump-run (operating hours) entry against the current world.
 * Returns an empty array when the entry is plausible.
 */
export function validatePumpRun(world: PipelineWorld, input: PumpRunInput): CaptureIssue[] {
  const equipment = world.equipment.find((e) => e.id === input.equipmentId);
  if (!equipment) {
    return [
      block(
        CaptureIssueCode.EQUIPMENT_NOT_FOUND,
        `El equipo "${input.equipmentId}" no existe en el registro de equipos. Verifique el equipo seleccionado.`,
      ),
    ];
  }

  if (!Number.isFinite(input.hoursRun)) {
    return [
      block(
        CaptureIssueCode.INVALID_NUMBER,
        `Las horas ingresadas para ${equipment.tag} no son un número válido.`,
      ),
    ];
  }

  const issues: CaptureIssue[] = [];

  if (input.hoursRun <= 0) {
    issues.push(
      block(
        CaptureIssueCode.NON_POSITIVE_HOURS,
        `Las horas de operación de ${equipment.tag} deben ser mayores que cero (${formatHours(input.hoursRun)}).`,
      ),
    );
  }

  if (input.hoursRun > PUMP_RUN_SHIFT_MAX_HOURS) {
    issues.push(
      block(
        CaptureIssueCode.HOURS_ABOVE_SHIFT_MAX,
        `Un registro de turno no puede superar ${PUMP_RUN_SHIFT_MAX_HOURS} h (${formatHours(input.hoursRun)} ingresadas). Dato físicamente imposible.`,
      ),
    );
  }

  // Warn rules only make sense over a physically possible value.
  if (hasBlockingIssue(issues)) return issues;

  if (input.hoursRun > PUMP_RUN_TYPICAL_SHIFT_HOURS) {
    issues.push(
      warn(
        CaptureIssueCode.HOURS_BEYOND_TYPICAL_SHIFT,
        `${formatHours(input.hoursRun)} superan un turno típico de ${PUMP_RUN_TYPICAL_SHIFT_HOURS} h. Verifique antes de confirmar.`,
      ),
    );
  }

  if (!equipment.isOperational) {
    issues.push(
      warn(
        CaptureIssueCode.EQUIPMENT_NOT_RUNNING,
        `${equipment.tag} figura fuera de servicio; registrar horas de operación es inusual. Verifique el estado del equipo.`,
      ),
    );
  }

  return issues;
}

// ============================================================================
// validateShiftNote
// ============================================================================

/**
 * Validate a structured shift note. Purely structural — a note has no
 * volumetric plausibility rules.
 */
export function validateShiftNote(input: ShiftNoteInput): CaptureIssue[] {
  const issues: CaptureIssue[] = [];

  if (input.type.trim().length === 0) {
    issues.push(
      block(CaptureIssueCode.EMPTY_TYPE, "Seleccione el tipo de novedad antes de confirmar."),
    );
  }

  if (input.description.trim().length === 0) {
    issues.push(
      block(
        CaptureIssueCode.EMPTY_DESCRIPTION,
        "La descripción de la novedad no puede quedar vacía.",
      ),
    );
  }

  return issues;
}
