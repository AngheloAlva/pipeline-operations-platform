"use client";

/**
 * PinPrompt — per-action identity (MV-10, PLAN_MEJORAS_VENTA §6.2).
 *
 * The workstation session is permanent (never a login); every action that
 * commits data asks WHO instead: operator (from the DECLARED roster only,
 * ~5 names — not 20) + a short PIN (~2–5 s). Resolution goes through the
 * single entry point resolveActor() (mock PIN in the demo; server in prod).
 *
 * Controlled by `open`; parents should mount it per confirmation so the PIN
 * field starts empty. A wrong PIN shows the resolver's message inline; a
 * correct one hands the actor + credential back through onResolved.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Operator } from "@/lib/domain";
import { resolveActor } from "@/lib/capture/identity";
import type { OperatorCredential } from "@/lib/capture/identity";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore } from "@/store/captureStore";
import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  GHOST_BUTTON_CLASS,
  MONO_STYLE,
  PRIMARY_BUTTON_CLASS,
} from "./formKit";

export interface PinPromptProps {
  open: boolean;
  /** What the operator is about to confirm, e.g. "Confirmar lectura de estanque". */
  title: string;
  /** Optional one-line summary of the value being committed. */
  summary?: string;
  onCancel: () => void;
  /** Called on successful identity resolution with the actor + credential. */
  onResolved: (operator: Operator, credential: OperatorCredential) => void;
}

export function PinPrompt({ open, ...dialogProps }: PinPromptProps) {
  // The dialog mounts fresh on every open, so the credential state (operator,
  // PIN, error) resets naturally — a PIN is per-action, never remembered.
  if (!open) return null;
  // Portal to <body>: hosts render PinPrompt inside their own <form>, and a
  // DOM-nested <form> is invalid HTML — in real browsers React never
  // dispatched the inner onSubmit, so confirming NAVIGATED the page and wiped
  // the in-memory session (found in the MV-14 browser smoke test).
  return createPortal(<PinPromptDialog {...dialogProps} />, document.body);
}

type PinPromptDialogProps = Omit<PinPromptProps, "open">;

function PinPromptDialog({ title, summary, onCancel, onResolved }: PinPromptDialogProps) {
  const world = useWorldStore((s) => s.world);
  const workstationId = useCaptureStore((s) => s.workstationId);
  const activeRoster = useCaptureStore((s) => s.activeRoster);

  // Person selector hangs off the DECLARED roster only (§6.2).
  const rosterOperators = useMemo(() => {
    if (!world || !activeRoster) return [];
    return activeRoster.operatorIds
      .map((id) => world.operators.find((o) => o.id === id))
      .filter((o): o is Operator => o !== undefined);
  }, [world, activeRoster]);

  const [operatorId, setOperatorId] = useState<string>(() => rosterOperators[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const operatorFieldId = useId();
  const pinFieldId = useId();

  // Escape cancels — keyboard-friendly (same idiom as EquipmentTreeDrawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const missingSession = !world || !workstationId || rosterOperators.length === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // React propagates the portaled form's submit through the REACT tree, so
    // without this the HOST form's onSubmit re-opens the prompt right after
    // a successful confirm. The PIN submit is this dialog's concern only.
    e.stopPropagation();
    if (!world || !workstationId) return;
    const credential: OperatorCredential = { operatorId, pin };
    const resolution = resolveActor(world, workstationId, credential);
    if (!resolution.ok) {
      setError(resolution.message);
      return;
    }
    onResolved(resolution.operator, credential);
  }

  return (
    <>
      {/* Backdrop above the capture drawer (z-50) */}
      <div className="fixed inset-0 z-[60] bg-black/60" aria-hidden="true" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 border border-border-strong bg-surface-raised p-5 shadow-2xl"
      >
        <h2 className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          {title}
        </h2>

        {summary && (
          <p className="mt-2 text-[14px] text-ink-secondary" style={MONO_STYLE}>
            {summary}
          </p>
        )}

        {missingSession ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] leading-snug text-status-warning">
              Declare la dotación del turno antes de registrar datos.
            </p>
            <button type="button" onClick={onCancel} className={GHOST_BUTTON_CLASS} style={MONO_STYLE}>
              Cancelar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor={operatorFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
                Operador (dotación del turno)
              </label>
              <select
                id={operatorFieldId}
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className={FIELD_INPUT_CLASS}
                style={MONO_STYLE}
              >
                {rosterOperators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.initials} — {op.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={pinFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
                PIN
              </label>
              <input
                id={pinFieldId}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                placeholder="••••"
                className="w-full border border-border-subtle bg-surface-overlay px-3 py-2.5 text-center text-[24px] tracking-[0.4em] text-ink-primary focus:border-accent focus:outline-none"
                style={MONO_STYLE}
              />
            </div>

            {error && (
              <p role="alert" className="text-[13px] leading-snug text-status-critical">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onCancel} className={GHOST_BUTTON_CLASS} style={MONO_STYLE}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pin.length === 0}
                className={PRIMARY_BUTTON_CLASS}
                style={MONO_STYLE}
              >
                Confirmar
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
