/**
 * Per-action identity resolution (MV-7).
 *
 * The workstation session is permanent (e.g. "SALA-OPS-PC1") — there is never
 * a login. Every action that commits data asks for a short PIN instead, and
 * the person selector hangs off the crew declared for the shift (the roster).
 *
 * resolveActor() is the SINGLE entry point (PLAN_MEJORAS_VENTA §6.2): in the
 * demo it checks a mock, deterministic PIN; in production it resolves on the
 * server. Swapping the implementation requires touching nothing else.
 *
 * Rejections are returned as a typed discriminated union (never thrown, never
 * null) so callers can surface the reason to the operator.
 * All functions are pure — no side effects.
 */

import type { Operator, PipelineWorld, ShiftRoster } from "@/lib/domain";

// ============================================================================
// CONST OBJECTS + DERIVED TYPES (ADR-3)
// ============================================================================

/** Why an actor resolution was rejected. */
export const ActorRejectionCode = {
  WORKSTATION_NOT_FOUND: "WORKSTATION_NOT_FOUND",
  NO_ACTIVE_ROSTER: "NO_ACTIVE_ROSTER",
  OPERATOR_NOT_IN_ROSTER: "OPERATOR_NOT_IN_ROSTER",
  OPERATOR_NOT_FOUND: "OPERATOR_NOT_FOUND",
  INVALID_PIN: "INVALID_PIN",
} as const;
export type ActorRejectionCode = (typeof ActorRejectionCode)[keyof typeof ActorRejectionCode];

// ============================================================================
// TYPES
// ============================================================================

/** Credential presented by the operator for one committing action. */
export interface OperatorCredential {
  operatorId: string;
  /** Short PIN typed at commit time (~2–5 s). Mock in the demo. */
  pin: string;
}

/** Successful resolution. */
export interface ActorResolved {
  ok: true;
  operator: Operator;
}

/** Rejected resolution with a user-facing reason (Spanish, matches UI copy). */
export interface ActorRejected {
  ok: false;
  code: ActorRejectionCode;
  message: string;
}

export type ActorResolution = ActorResolved | ActorRejected;

// ============================================================================
// MOCK PIN SCHEME (demo-only)
// ============================================================================

/**
 * DEMO-ONLY deterministic PIN: the last 4 digits of the operator id,
 * left-padded with zeros (e.g. "OPR-0580" → "0580").
 *
 * This exists so the demo can be driven without a credentials table; in
 * production the PIN check moves behind a server call and this function
 * disappears. Never use this scheme with real data.
 */
export function mockPinFor(operatorId: string): string {
  const digits = operatorId.replace(/\D/g, "");
  return digits.slice(-4).padStart(4, "0");
}

// ============================================================================
// ROSTER RESOLUTION
// ============================================================================

/**
 * The ACTIVE roster of a workstation: the one with the latest startedAt.
 * Returns null when the workstation has no declared roster.
 */
export function getActiveRoster(world: PipelineWorld, workstationId: string): ShiftRoster | null {
  let active: ShiftRoster | null = null;
  for (const roster of world.shiftRosters) {
    if (roster.workstationId !== workstationId) continue;
    if (!active || new Date(roster.startedAt).getTime() > new Date(active.startedAt).getTime()) {
      active = roster;
    }
  }
  return active;
}

// ============================================================================
// resolveActor — single entry point
// ============================================================================

function reject(code: ActorRejectionCode, message: string): ActorRejected {
  return { ok: false, code, message };
}

/**
 * Resolve the actor behind one committing action against the ACTIVE shift
 * roster of the given workstation.
 *
 * Checks, in order: workstation exists → the workstation has an active
 * roster → the operator is on that roster → the operator entity exists →
 * the PIN matches (mock scheme in the demo).
 */
export function resolveActor(
  world: PipelineWorld,
  workstationId: string,
  credential: OperatorCredential,
): ActorResolution {
  const workstation = world.workstations.find((w) => w.id === workstationId);
  if (!workstation) {
    return reject(
      ActorRejectionCode.WORKSTATION_NOT_FOUND,
      `La estación "${workstationId}" no está registrada.`,
    );
  }

  const roster = getActiveRoster(world, workstationId);
  if (!roster) {
    return reject(
      ActorRejectionCode.NO_ACTIVE_ROSTER,
      `No hay dotación declarada para ${workstation.label}. Declare el turno antes de registrar datos.`,
    );
  }

  if (!roster.operatorIds.includes(credential.operatorId)) {
    return reject(
      ActorRejectionCode.OPERATOR_NOT_IN_ROSTER,
      "El operador no forma parte de la dotación declarada para este turno.",
    );
  }

  const operator = world.operators.find((o) => o.id === credential.operatorId);
  if (!operator) {
    return reject(
      ActorRejectionCode.OPERATOR_NOT_FOUND,
      "El operador seleccionado no existe en el registro de personal.",
    );
  }

  if (credential.pin !== mockPinFor(operator.id)) {
    return reject(
      ActorRejectionCode.INVALID_PIN,
      "PIN incorrecto. Verifique e intente nuevamente.",
    );
  }

  return { ok: true, operator };
}
