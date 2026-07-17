"use client";

/**
 * CaptureDrawer — the capture surface of the demo (MV-10, PLAN_MEJORAS_VENTA §6.3).
 *
 * A right-side drawer (recommended over a route so the live effect on the
 * hero/balance stays visible) hosting the whole Frente B flow:
 *   1. Shift roster declaration (ShiftRosterBar) — the identity foundation.
 *   2. Capture-type selector: tank reading / movement / shift note.
 *   3. The active capture form (validation at entry + PIN on confirm).
 *   4. The shift's capture ledger, with the amendment trail per record.
 *
 * Controlled via `open` / `onClose` props — mounting it somewhere (the
 * cockpit) is MV-14, out of this component's scope.
 */

import { useEffect, useMemo, useState } from "react";
import { getEffectiveRecords } from "@/lib/capture/ledger";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore, CaptureRecordKind } from "@/store/captureStore";
import { cn } from "@/lib/cn";
import { ShiftRosterBar } from "./ShiftRosterBar";
import { TankReadingForm } from "./TankReadingForm";
import { MovementForm } from "./MovementForm";
import { ShiftNoteForm } from "./ShiftNoteForm";
import { PumpRunForm } from "./PumpRunForm";
import { AmendmentTrail } from "./AmendmentTrail";
import {
  CAPTURE_KIND_LABELS,
  FIELD_LABEL_CLASS,
  MONO_STYLE,
  describeCaptureValues,
  formatDateTime,
  operatorName,
} from "./formKit";

export interface CaptureDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CAPTURE_KINDS: CaptureRecordKind[] = [
  CaptureRecordKind.TANK_READING,
  CaptureRecordKind.MOVEMENT,
  CaptureRecordKind.PUMP_RUN,
  CaptureRecordKind.SHIFT_NOTE,
];

export function CaptureDrawer({ open, onClose }: CaptureDrawerProps) {
  const world = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const [activeKind, setActiveKind] = useState<CaptureRecordKind>(
    CaptureRecordKind.TANK_READING,
  );
  /** Record whose amendment trail is expanded in the ledger section. */
  const [trailRecordId, setTrailRecordId] = useState<string | null>(null);

  // Records currently in force — superseded originals stay reachable through
  // the trail, not the list.
  const effectiveRecords = useMemo(() => getEffectiveRecords(records), [records]);

  // Close on Escape while open — keyboard accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={onClose} />

      {/* Drawer panel — right side so the hero stays visible on wide screens */}
      <div
        role="dialog"
        aria-label="Captura de datos"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border-mid bg-surface-base shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-mid px-4 py-3">
          <h2
            className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-secondary"
            style={MONO_STYLE}
          >
            Captura de datos
          </h2>
          <button
            type="button"
            aria-label="Cerrar captura de datos"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center text-ink-tertiary transition-colors hover:text-ink-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* 1. Roster — the identity foundation */}
          <ShiftRosterBar />

          {/* 2. Capture-type selector */}
          <div className="flex flex-col gap-1.5">
            <p className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
              Tipo de ingreso
            </p>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipo de ingreso">
              {CAPTURE_KINDS.map((kind) => {
                const active = kind === activeKind;
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveKind(kind)}
                    className={cn(
                      "border px-2 py-2.5 text-[12px] font-medium uppercase leading-tight tracking-[0.08em] transition-colors",
                      active
                        ? "border-accent bg-accent-dim text-accent"
                        : "border-border-mid bg-surface-raised text-ink-tertiary hover:text-ink-secondary",
                    )}
                    style={MONO_STYLE}
                  >
                    {CAPTURE_KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Active form — keyed so switching resets local field state */}
          <div className="border border-border-mid bg-surface-raised p-3">
            {activeKind === CaptureRecordKind.TANK_READING && (
              <TankReadingForm key="tank-reading" />
            )}
            {activeKind === CaptureRecordKind.MOVEMENT && <MovementForm key="movement" />}
            {activeKind === CaptureRecordKind.PUMP_RUN && <PumpRunForm key="pump-run" />}
            {activeKind === CaptureRecordKind.SHIFT_NOTE && <ShiftNoteForm key="shift-note" />}
          </div>

          {/* 4. Ledger — records in force + amendment trail */}
          <section aria-label="Registros del turno" className="flex flex-col gap-2">
            <h3 className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
              Registros del turno
            </h3>

            {effectiveRecords.length === 0 ? (
              <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
                Sin registros capturados en esta sesión.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {effectiveRecords.map((record) => {
                  const expanded = trailRecordId === record.id;
                  return (
                    <li
                      key={record.id}
                      className="flex flex-col gap-1.5 border border-border-subtle bg-surface-raised p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className="text-[12px] font-medium text-ink-primary"
                          style={MONO_STYLE}
                        >
                          {record.id} · {CAPTURE_KIND_LABELS[record.kind]}
                        </span>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setTrailRecordId(expanded ? null : record.id)}
                          className="border border-border-mid px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary transition-colors hover:text-ink-primary"
                          style={MONO_STYLE}
                        >
                          {expanded ? "Ocultar traza" : "Traza / Corregir"}
                        </button>
                      </div>

                      <p className="text-[13px] leading-snug text-ink-secondary">
                        {describeCaptureValues(record.kind, record.values, world)}
                      </p>

                      <p className="text-[12px] text-ink-muted" style={MONO_STYLE}>
                        {operatorName(world, record.captureMeta.authorId)} ·{" "}
                        {formatDateTime(record.captureMeta.enteredAt)}
                        {record.warnings.length > 0 && (
                          <span className="ml-2 text-status-warning">
                            {record.warnings.length} advertencia
                            {record.warnings.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </p>

                      {expanded && <AmendmentTrail recordId={record.id} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
