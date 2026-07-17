"use client";

/**
 * ShiftNoteForm — structured shift note (MV-11, PLAN_MEJORAS_VENTA §6.1 #2).
 *
 * Replaces the free-text daily report: type + description (+ optional
 * station), stamped by the store with actor + workstation + timestamp on
 * commit (identity per action). Structural validation only (a note has no
 * volumetric plausibility rules).
 *
 * With `amendRecordId` the commit supersedes an existing note record
 * (ledger semantics — the trail keeps the original text visible).
 */

import { useId, useState } from "react";
import type { Operator } from "@/lib/domain";
import { validateShiftNote, hasBlockingIssue } from "@/lib/capture/validate";
import type { CaptureIssue, ShiftNoteInput } from "@/lib/capture/validate";
import type { OperatorCredential } from "@/lib/capture/identity";
import { useWorldStore } from "@/store/worldStore";
import { useCaptureStore, CommitStatus, CaptureRecordKind } from "@/store/captureStore";
import type { CaptureRecord } from "@/store/captureStore";
import { PinPrompt } from "./PinPrompt";
import { IssueList } from "./IssueList";
import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  MONO_STYLE,
  PRIMARY_BUTTON_CLASS,
  SHIFT_NOTE_TYPE_OPTIONS,
  formatDateTime,
  workstationLabel,
} from "./formKit";

export interface ShiftNoteFormProps {
  /** When set, the form amends this ledger record instead of creating a fresh one. */
  amendRecordId?: string;
  onCommitted?: (record: CaptureRecord) => void;
}

interface FeedbackMessage {
  tone: "ok" | "critical";
  text: string;
}

export function ShiftNoteForm({ amendRecordId, onCommitted }: ShiftNoteFormProps) {
  const world = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const original = amendRecordId ? records.find((r) => r.id === amendRecordId) : undefined;
  const originalNote = original?.kind === CaptureRecordKind.SHIFT_NOTE ? original : undefined;

  const [type, setType] = useState<string>(
    () => originalNote?.values.type ?? SHIFT_NOTE_TYPE_OPTIONS[0].value,
  );
  const [description, setDescription] = useState<string>(
    () => originalNote?.values.description ?? "",
  );
  const [stationId, setStationId] = useState<string>(
    () => originalNote?.values.stationId ?? "",
  );
  const [pinOpen, setPinOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [commitIssues, setCommitIssues] = useState<CaptureIssue[]>([]);

  const typeFieldId = useId();
  const descriptionFieldId = useId();
  const stationFieldId = useId();

  const input: ShiftNoteInput = {
    type,
    description,
    stationId: stationId || undefined,
  };

  // MV-6 — structural validation at entry. Blocks only surface once the
  // operator started typing, so an untouched form is not shouting in red.
  const entryIssues: CaptureIssue[] =
    description.length > 0 || type === "" ? validateShiftNote(input) : [];
  const blocked = hasBlockingIssue(entryIssues);
  const canConfirm = description.trim().length > 0 && type.trim().length > 0 && !blocked;

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  if (amendRecordId && !originalNote) {
    return (
      <p role="alert" className="text-[13px] text-status-critical">
        El registro a corregir no existe o no es una novedad de turno.
      </p>
    );
  }

  function handleResolved(operator: Operator, credential: OperatorCredential) {
    setPinOpen(false);
    const store = useCaptureStore.getState();
    const result = amendRecordId
      ? store.amendRecord(amendRecordId, input, credential)
      : store.commitShiftNote(input, credential);

    switch (result.status) {
      case CommitStatus.COMMITTED: {
        const meta = result.record.captureMeta;
        setCommitIssues([]);
        setFeedback({
          tone: "ok",
          text: `Novedad ${result.record.id} registrada por ${operator.name} · ${workstationLabel(
            world,
            meta.workstationId,
          )} · ${formatDateTime(meta.enteredAt)}.`,
        });
        if (!amendRecordId) setDescription("");
        onCommitted?.(result.record);
        break;
      }
      case CommitStatus.BLOCKED:
        setFeedback(null);
        setCommitIssues(result.issues);
        break;
      case CommitStatus.REJECTED:
        setCommitIssues([]);
        setFeedback({ tone: "critical", text: result.message });
        break;
    }
  }

  return (
    <form
      aria-label={amendRecordId ? "Corregir novedad de turno" : "Novedad de turno"}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canConfirm) setPinOpen(true);
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={typeFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Tipo de novedad
        </label>
        <select
          id={typeFieldId}
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {SHIFT_NOTE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Descripción
        </label>
        <textarea
          id={descriptionFieldId}
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setFeedback(null);
            setCommitIssues([]);
          }}
          placeholder="Qué ocurrió, en qué equipo o tramo, y qué acción se tomó."
          className="w-full resize-y border border-border-subtle bg-surface-overlay px-3 py-2.5 text-[15px] leading-relaxed text-ink-primary focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={stationFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Estación asociada — opcional
        </label>
        <select
          id={stationFieldId}
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          <option value="">Sin estación asociada</option>
          {world.stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <IssueList issues={[...entryIssues, ...commitIssues]} />

      {feedback && (
        <p
          role={feedback.tone === "critical" ? "alert" : "status"}
          className={
            feedback.tone === "ok"
              ? "border-l-2 border-status-ok bg-status-ok-bg px-3 py-2 text-[13px] leading-snug text-status-ok"
              : "text-[13px] leading-snug text-status-critical"
          }
        >
          {feedback.text}
        </p>
      )}

      <button type="submit" disabled={!canConfirm} className={PRIMARY_BUTTON_CLASS} style={MONO_STYLE}>
        {amendRecordId ? "Corregir con PIN" : "Registrar con PIN"}
      </button>

      <PinPrompt
        open={pinOpen}
        title={amendRecordId ? "Corregir novedad de turno" : "Registrar novedad de turno"}
        summary={
          SHIFT_NOTE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
        }
        onCancel={() => setPinOpen(false)}
        onResolved={handleResolved}
      />
    </form>
  );
}
