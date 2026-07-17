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

import { useEffect, useMemo, useRef, useState } from "react";
import { getEffectiveRecords } from "@/lib/capture/ledger";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore, CaptureRecordKind } from "@/store/captureStore";
import { Tabs } from "@/components/ui/Tabs";
import { ShiftRosterBar } from "./ShiftRosterBar";
import { TankReadingForm } from "./TankReadingForm";
import { MovementForm } from "./MovementForm";
import { ShiftNoteForm } from "./ShiftNoteForm";
import { PumpRunForm } from "./PumpRunForm";
import { BatchReadingForm } from "./BatchReadingForm";
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

const CaptureFormKind = {
  ...CaptureRecordKind,
  BATCH_READING: "BATCH_READING",
} as const;
type CaptureFormKind = (typeof CaptureFormKind)[keyof typeof CaptureFormKind];

const CAPTURE_FORM_LABELS: Record<CaptureFormKind, string> = {
  ...CAPTURE_KIND_LABELS,
  [CaptureFormKind.BATCH_READING]: "Batch horario",
};

const CAPTURE_KINDS: CaptureFormKind[] = [
  CaptureRecordKind.TANK_READING,
  CaptureRecordKind.MOVEMENT,
  CaptureFormKind.BATCH_READING,
  CaptureRecordKind.PUMP_RUN,
  CaptureRecordKind.SHIFT_NOTE,
];

const CAPTURE_TABS = CAPTURE_KINDS.map((kind) => ({
  id: kind,
  label: CAPTURE_FORM_LABELS[kind],
}));

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function CaptureDrawer({ open, onClose }: CaptureDrawerProps) {
  const world = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const [activeKind, setActiveKind] = useState<CaptureFormKind>(CaptureRecordKind.TANK_READING);
  /** Record whose amendment trail is expanded in the ledger section. */
  const [trailRecordId, setTrailRecordId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Records currently in force — superseded originals stay reachable through
  // the trail, not the list.
  const effectiveRecords = useMemo(() => getEffectiveRecords(records), [records]);

  useEffect(() => {
    if (!open) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-capture-close]")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.contains(event.target as Node)) return;

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={onClose} />

      {/* Wide workbench on desktop; full-width, single-column sheet on mobile. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-drawer-title"
        onKeyDown={handleDialogKeyDown}
        className="fixed right-0 top-0 z-50 flex h-dvh max-h-dvh w-full max-w-none flex-col border-l border-border-mid bg-surface-base shadow-xl md:w-[94dvw] xl:w-[90dvw] xl:max-w-[90rem]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-mid px-4 py-2 sm:px-6">
          <h2
            id="capture-drawer-title"
            className="text-[14px] font-semibold uppercase tracking-[0.12em] text-ink-primary"
            style={MONO_STYLE}
          >
            Captura de datos
          </h2>
          <button
            type="button"
            aria-label="Cerrar captura de datos"
            onClick={onClose}
            data-capture-close
            className="inline-flex h-10 w-10 items-center justify-center text-ink-tertiary transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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

        <div className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-cols-[18rem_minmax(0,1fr)] xl:overflow-hidden">
          <aside className="border-b border-border-mid bg-surface-raised p-4 sm:p-6 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:p-4">
            <ShiftRosterBar />
          </aside>

          <main className="min-w-0 xl:flex xl:min-h-0 xl:flex-col">
            <div className="sticky top-0 z-10 border-b border-border-mid bg-surface-base px-4 pt-4 sm:px-6 sm:pt-5 xl:shrink-0">
              <p className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
                Tipo de ingreso
              </p>
              <Tabs
                tabs={CAPTURE_TABS}
                activeTab={activeKind}
                onTabChange={(kind) => setActiveKind(kind as CaptureFormKind)}
                ariaLabel="Tipo de ingreso"
                className="mt-1.5 w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [&>button]:shrink-0 [&>button]:whitespace-nowrap sm:[&>button]:flex-1 sm:[&>button]:px-3"
              />
            </div>

            <div className="flex flex-col gap-6 p-4 sm:p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {/* Active form — keyed so switching resets local field state. */}
              <div
                role="tabpanel"
                id={`tabpanel-${activeKind}`}
                aria-labelledby={`tab-${activeKind}`}
                className="w-full max-w-[64rem] border border-border-mid bg-surface-raised p-4 sm:p-5"
              >
                {activeKind === CaptureRecordKind.TANK_READING && (
                  <TankReadingForm key="tank-reading" />
                )}
                {activeKind === CaptureRecordKind.MOVEMENT && <MovementForm key="movement" />}
                {activeKind === CaptureFormKind.BATCH_READING && <BatchReadingForm key="batch" />}
                {activeKind === CaptureRecordKind.PUMP_RUN && <PumpRunForm key="pump-run" />}
                {activeKind === CaptureRecordKind.SHIFT_NOTE && <ShiftNoteForm key="shift-note" />}
              </div>

              {/* Records in force + amendment trail stay secondary to the active form. */}
              <section
                aria-label="Registros del turno"
                className="flex w-full max-w-[64rem] flex-col gap-2"
              >
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
          </main>
        </div>
      </div>
    </>
  );
}
