"use client";

/**
 * AmendmentTrail — visible amendment chain of a captured record (MV-11).
 *
 * Ledger-book semantics (MV-8): a correction NEVER overwrites — it creates a
 * new record whose captureMeta points at the superseded one (supersedesId +
 * previousValue + author + timestamp). This component renders that chain
 * oldest → newest and offers "Corregir" on the record in force, which opens
 * the matching capture form in amend mode so the acceptance flow ("correction
 * creates a new record referencing the old one, trace visible") is
 * demonstrable end to end.
 */

import { useMemo, useState } from "react";
import { getAmendmentTrail } from "@/lib/capture/ledger";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore, CaptureRecordKind } from "@/store/captureStore";
import type { CaptureRecord } from "@/store/captureStore";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TankReadingForm } from "./TankReadingForm";
import { MovementForm } from "./MovementForm";
import { ShiftNoteForm } from "./ShiftNoteForm";
import { PumpRunForm } from "./PumpRunForm";
import {
  CAPTURE_KIND_LABELS,
  GHOST_BUTTON_CLASS,
  MONO_STYLE,
  describeCaptureValues,
  formatDateTime,
  operatorName,
  workstationLabel,
} from "./formKit";

export interface AmendmentTrailProps {
  /** Any record of the chain — the full trail is resolved from it. */
  recordId: string;
}

/** Previous values snapshotted by an amendment ({ values } envelope from the store). */
function previousValuesOf(record: CaptureRecord): CaptureRecord["values"] | null {
  const previous = record.captureMeta.previousValue;
  if (previous && typeof previous === "object" && "values" in previous) {
    return (previous as { values: CaptureRecord["values"] }).values;
  }
  return null;
}

export function AmendmentTrail({ recordId }: AmendmentTrailProps) {
  const world = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);
  const [amending, setAmending] = useState(false);

  // Memo over the stable `records` reference — selector factories returning
  // fresh arrays would loop under useSyncExternalStore.
  const trail = useMemo(() => getAmendmentTrail(records, recordId), [records, recordId]);

  if (trail.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        No hay registros en la traza.
      </p>
    );
  }

  const effective = trail[trail.length - 1];

  return (
    <section
      aria-label={`Traza de enmiendas de ${recordId}`}
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h3
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={MONO_STYLE}
        >
          Traza de enmiendas
        </h3>
        <span className="text-[12px] text-ink-muted" style={MONO_STYLE}>
          {CAPTURE_KIND_LABELS[effective.kind]}
        </span>
      </header>

      <ol className="flex flex-col gap-2">
        {trail.map((record, index) => {
          const isEffective = index === trail.length - 1;
          const previousValues = previousValuesOf(record);
          return (
            <li
              key={record.id}
              className="flex flex-col gap-1.5 border border-border-subtle bg-surface-overlay p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-primary" style={MONO_STYLE}>
                  {record.id}
                </span>
                {isEffective ? (
                  <StatusBadge variant="ok" label="VIGENTE" />
                ) : (
                  <StatusBadge variant="cancelled" label="REEMPLAZADO" />
                )}
              </div>

              <p className="text-[14px] leading-snug text-ink-secondary">
                {describeCaptureValues(record.kind, record.values, world)}
              </p>

              {record.captureMeta.supersedesId && (
                <p className="text-[12px] leading-snug text-ink-tertiary" style={MONO_STYLE}>
                  Corrige a {record.captureMeta.supersedesId}
                  {previousValues
                    ? ` · antes: ${describeCaptureValues(record.kind, previousValues, world)}`
                    : ""}
                </p>
              )}

              <p className="text-[12px] text-ink-muted" style={MONO_STYLE}>
                {operatorName(world, record.captureMeta.authorId)} ·{" "}
                {workstationLabel(world, record.captureMeta.workstationId)} ·{" "}
                {formatDateTime(record.captureMeta.enteredAt)}
              </p>
            </li>
          );
        })}
      </ol>

      {amending ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          {effective.kind === CaptureRecordKind.TANK_READING && (
            <TankReadingForm
              amendRecordId={effective.id}
              onCommitted={() => setAmending(false)}
            />
          )}
          {effective.kind === CaptureRecordKind.MOVEMENT && (
            <MovementForm amendRecordId={effective.id} onCommitted={() => setAmending(false)} />
          )}
          {effective.kind === CaptureRecordKind.SHIFT_NOTE && (
            <ShiftNoteForm amendRecordId={effective.id} onCommitted={() => setAmending(false)} />
          )}
          {effective.kind === CaptureRecordKind.PUMP_RUN && (
            <PumpRunForm amendRecordId={effective.id} onCommitted={() => setAmending(false)} />
          )}
          <button
            type="button"
            onClick={() => setAmending(false)}
            className={GHOST_BUTTON_CLASS}
            style={MONO_STYLE}
          >
            Cancelar corrección
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAmending(true)}
            className={GHOST_BUTTON_CLASS}
            style={MONO_STYLE}
          >
            Corregir registro vigente
          </button>
        </div>
      )}
    </section>
  );
}
