/**
 * Shared presentation kit for the capture components (MV-10 / MV-11).
 *
 * Style constants + tiny label/format helpers reused by every capture form.
 * Design contract (PLAN_MEJORAS_VENTA §6.2): dark-first, LARGE typography,
 * semantic tokens only — never hex or var() inside className.
 * No component logic here; validation/identity/ledger live in lib/capture.
 */

import type { PipelineWorld } from "@/lib/domain";
import { MovementType } from "@/lib/domain";
import type {
  MovementInput,
  PumpRunInput,
  ShiftNoteInput,
  TankReadingInput,
} from "@/lib/capture/validate";
import { CaptureRecordKind } from "@/store/captureStore";

// ---------------------------------------------------------------------------
// Shared style tokens (Sala de Control idiom — matches ConversionWidget)
// ---------------------------------------------------------------------------

/** Monospace stack — applied via style, matching the existing panels. */
export const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

export const FIELD_LABEL_CLASS =
  "text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary";

/** Large input for 3 AM data entry — bigger type and hit area than the widgets. */
export const FIELD_INPUT_CLASS =
  "w-full border border-border-subtle bg-surface-overlay px-3 py-2.5 text-[16px] text-ink-primary tabular-nums focus:border-accent focus:outline-none disabled:text-ink-muted";

export const PRIMARY_BUTTON_CLASS =
  "w-full border border-accent bg-accent-dim px-4 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-accent transition-colors hover:bg-surface-interactive disabled:cursor-not-allowed disabled:border-border-mid disabled:bg-surface-raised disabled:text-ink-muted";

export const GHOST_BUTTON_CLASS =
  "border border-border-mid bg-surface-interactive px-3 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-ink-secondary transition-colors hover:bg-surface-overlay hover:text-ink-primary";

// ---------------------------------------------------------------------------
// Spanish labels for domain unions (UI copy)
// ---------------------------------------------------------------------------

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  [MovementType.RECEPTION]: "Recepción",
  [MovementType.TRANSFER]: "Transferencia",
  [MovementType.PIPELINE]: "Bombeo por oleoducto",
  [MovementType.VESSEL_LOAD]: "Carga a buque",
  [MovementType.VESSEL_UNLOAD]: "Descarga de buque",
  [MovementType.REFINERY_DELIVERY]: "Entrega a refinería",
};

/** Structured shift-note types (same vocabulary as the seed's shift log). */
export const SHIFT_NOTE_TYPE_OPTIONS = [
  { value: "OPERATION", label: "Operación" },
  { value: "HANDOVER", label: "Entrega de turno" },
  { value: "INCIDENT", label: "Incidente" },
] as const;

export const CAPTURE_KIND_LABELS: Record<CaptureRecordKind, string> = {
  [CaptureRecordKind.TANK_READING]: "Lectura de estanque",
  [CaptureRecordKind.MOVEMENT]: "Movimiento",
  [CaptureRecordKind.SHIFT_NOTE]: "Novedad de turno",
  [CaptureRecordKind.PUMP_RUN]: "Horas de bomba",
};

// ---------------------------------------------------------------------------
// Formatting helpers (presentational only)
// ---------------------------------------------------------------------------

export function formatM3(value: number): string {
  return `${Math.round(value).toLocaleString("es-AR")} m³`;
}

/** Operating hours with at most one decimal, e.g. "2.003 h". */
export function formatHours(value: number): string {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

/** Compact timestamp for capture stamps — fixed UTC so tests are deterministic. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const stamp = date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${stamp} UTC`;
}

/** Display name of a node (tank tag or station name), falling back to the id. */
export function nodeName(world: PipelineWorld | null, nodeId: string): string {
  if (!world) return nodeId;
  const tank = world.tanks.find((t) => t.id === nodeId);
  if (tank) return tank.tag;
  const station = world.stations.find((s) => s.id === nodeId);
  return station?.name ?? nodeId;
}

/** Display label of an equipment ("tag — name"), falling back to the id. */
export function equipmentLabel(world: PipelineWorld | null, equipmentId: string): string {
  const equipment = world?.equipment.find((e) => e.id === equipmentId);
  return equipment ? `${equipment.tag} — ${equipment.name}` : equipmentId;
}

/** Display name of an operator, falling back to the id. */
export function operatorName(world: PipelineWorld | null, operatorId: string): string {
  return world?.operators.find((o) => o.id === operatorId)?.name ?? operatorId;
}

/** Display label of a workstation, falling back to the id. */
export function workstationLabel(world: PipelineWorld | null, workstationId: string): string {
  return world?.workstations.find((w) => w.id === workstationId)?.label ?? workstationId;
}

/**
 * One-line Spanish summary of a captured record's values, per kind.
 * Used by the ledger list and the amendment trail (also to describe the
 * PREVIOUS values kept by an amendment's audit envelope).
 */
export function describeCaptureValues(
  kind: CaptureRecordKind,
  values: TankReadingInput | MovementInput | ShiftNoteInput | PumpRunInput,
  world: PipelineWorld | null,
): string {
  switch (kind) {
    case CaptureRecordKind.TANK_READING: {
      const v = values as TankReadingInput;
      return `${nodeName(world, v.tankId)}: nivel ${formatM3(v.levelM3)}`;
    }
    case CaptureRecordKind.MOVEMENT: {
      const v = values as MovementInput;
      return `${MOVEMENT_TYPE_LABELS[v.type]}: ${nodeName(world, v.fromNodeId)} → ${nodeName(world, v.toNodeId)}, ${formatM3(v.volumeM3)}`;
    }
    case CaptureRecordKind.SHIFT_NOTE: {
      const v = values as ShiftNoteInput;
      const typeLabel =
        SHIFT_NOTE_TYPE_OPTIONS.find((o) => o.value === v.type)?.label ?? v.type;
      return `${typeLabel}: ${v.description}`;
    }
    case CaptureRecordKind.PUMP_RUN: {
      const v = values as PumpRunInput;
      return `${equipmentLabel(world, v.equipmentId)}: +${formatHours(v.hoursRun)} de operación`;
    }
  }
}
