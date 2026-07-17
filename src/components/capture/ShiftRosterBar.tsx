"use client";

/**
 * ShiftRosterBar — declare the shift crew (MV-10, PLAN_MEJORAS_VENTA §6.3).
 *
 * Declaring the roster is the foundation of per-action identity: the person
 * selector of every PinPrompt hangs off THIS crew (~5 names, not 20 users).
 * When no roster is declared it shows the declaration form (workstation +
 * operators on duty, all pre-checked as the sensible default); once declared
 * it shows the current crew with the option to re-declare.
 */

import { useId, useState } from "react";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore } from "@/store/captureStore";
import { cn } from "@/lib/cn";
import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  GHOST_BUTTON_CLASS,
  MONO_STYLE,
  PRIMARY_BUTTON_CLASS,
  formatDateTime,
  operatorName,
  workstationLabel,
} from "./formKit";

export function ShiftRosterBar() {
  const world = useWorldStore((s) => s.world);
  const activeRoster = useCaptureStore((s) => s.activeRoster);
  const declareRoster = useCaptureStore((s) => s.declareRoster);

  const [editing, setEditing] = useState(false);
  // null → default: every seed operator on duty (the crew IS ~5 people).
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [workstationId, setWorkstationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const workstationFieldId = useId();

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  const effectiveWorkstationId = workstationId || (world.workstations[0]?.id ?? "");
  const effectiveSelection = selectedIds ?? world.operators.map((o) => o.id);

  function toggleOperator(id: string) {
    setSelectedIds((current) => {
      const base = current ?? world!.operators.map((o) => o.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    const result = declareRoster({
      workstationId: effectiveWorkstationId,
      operatorIds: effectiveSelection,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setEditing(false);
  }

  // ------------------------------------------------------------------
  // Declared view — the current crew
  // ------------------------------------------------------------------
  if (activeRoster && !editing) {
    return (
      <section
        aria-label="Dotación del turno"
        className="flex flex-col gap-2 border border-border-mid bg-surface-raised p-3"
      >
        <header className="flex items-center justify-between gap-2">
          <h3 className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Dotación del turno
          </h3>
          <span className="text-[12px] text-ink-muted" style={MONO_STYLE}>
            {workstationLabel(world, activeRoster.workstationId)} · desde{" "}
            {formatDateTime(activeRoster.startedAt)}
          </span>
        </header>

        <ul className="flex flex-wrap gap-1.5">
          {activeRoster.operatorIds.map((id) => {
            const op = world.operators.find((o) => o.id === id);
            return (
              <li
                key={id}
                className="flex items-center gap-1.5 border border-border-subtle bg-surface-overlay px-2 py-1 text-[13px] text-ink-secondary"
              >
                <span
                  className="inline-flex h-5 w-5 items-center justify-center bg-accent-dim text-[10px] font-medium text-accent"
                  aria-hidden="true"
                  style={MONO_STYLE}
                >
                  {op?.initials ?? "?"}
                </span>
                {operatorName(world, id)}
              </li>
            );
          })}
        </ul>

        <div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={GHOST_BUTTON_CLASS}
            style={MONO_STYLE}
          >
            Cambiar dotación
          </button>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Declaration form
  // ------------------------------------------------------------------
  return (
    <section
      aria-label="Declarar dotación del turno"
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-3"
    >
      <header>
        <h3 className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Declarar dotación del turno
        </h3>
        <p className="mt-1 text-[12px] leading-snug text-ink-muted">
          La dotación declarada habilita la identidad por acción: cada confirmación pedirá
          operador + PIN sobre esta lista.
        </p>
      </header>

      <form onSubmit={handleDeclare} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor={workstationFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Estación de trabajo
          </label>
          <select
            id={workstationFieldId}
            value={effectiveWorkstationId}
            onChange={(e) => setWorkstationId(e.target.value)}
            className={FIELD_INPUT_CLASS}
            style={MONO_STYLE}
          >
            {world.workstations.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Operadores en turno
          </legend>
          <ul className="mt-1 flex flex-col gap-1">
            {world.operators.map((op) => {
              const checked = effectiveSelection.includes(op.id);
              return (
                <li key={op.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 border px-3 py-2 text-[14px] transition-colors",
                      checked
                        ? "border-border-strong bg-surface-overlay text-ink-primary"
                        : "border-border-subtle bg-surface-raised text-ink-tertiary hover:text-ink-secondary",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOperator(op.id)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span style={MONO_STYLE} className="text-[12px] text-ink-muted">
                      {op.initials}
                    </span>
                    {op.name}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {error && (
          <p role="alert" className="text-[13px] leading-snug text-status-critical">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {activeRoster && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className={GHOST_BUTTON_CLASS}
              style={MONO_STYLE}
            >
              Cancelar
            </button>
          )}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} style={MONO_STYLE}>
            Declarar turno
          </button>
        </div>
      </form>
    </section>
  );
}
