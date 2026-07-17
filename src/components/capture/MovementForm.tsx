"use client";

/**
 * MovementForm — capture a crude movement between two nodes (MV-11).
 *
 * Same pattern as TankReadingForm: validation AT ENTRY via
 * lib/capture/validate (overfill / insufficient stock / same node hard-block;
 * high destination level warns), PIN on confirm, commit through captureStore
 * so the movement reaches the balance and the tanks move live.
 *
 * With `amendRecordId` the commit supersedes an existing movement record
 * (ledger semantics — the store reverts the original's effect first).
 */

import { useId, useState } from "react";
import type { Operator, PipelineWorld } from "@/lib/domain";
import { MovementType } from "@/lib/domain";
import { validateMovement, hasBlockingIssue } from "@/lib/capture/validate";
import type { CaptureIssue, MovementInput } from "@/lib/capture/validate";
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
  MOVEMENT_TYPE_LABELS,
  PRIMARY_BUTTON_CLASS,
  formatM3,
  nodeName,
} from "./formKit";

export interface MovementFormProps {
  /** When set, the form amends this ledger record instead of creating a fresh one. */
  amendRecordId?: string;
  onCommitted?: (record: CaptureRecord) => void;
}

interface FeedbackMessage {
  tone: "ok" | "critical";
  text: string;
}

interface NodeOption {
  id: string;
  label: string;
}

function buildNodeOptions(world: PipelineWorld): NodeOption[] {
  const tankOptions = world.tanks.map((t) => {
    const station = world.stations.find((s) => s.id === t.stationId);
    return { id: t.id, label: `${t.tag}${station ? ` · ${station.name}` : ""}` };
  });
  const stationOptions = world.stations.map((s) => ({ id: s.id, label: s.name }));
  return [...tankOptions, ...stationOptions];
}

function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  return Number(raw.replace(",", "."));
}

export function MovementForm({ amendRecordId, onCommitted }: MovementFormProps) {
  const world = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const original = amendRecordId ? records.find((r) => r.id === amendRecordId) : undefined;
  const originalMovement = original?.kind === CaptureRecordKind.MOVEMENT ? original : undefined;

  const [type, setType] = useState<MovementType>(
    () => originalMovement?.values.type ?? MovementType.TRANSFER,
  );
  const [fromNodeId, setFromNodeId] = useState<string>(
    () => originalMovement?.values.fromNodeId ?? world?.tanks[0]?.id ?? "",
  );
  const [toNodeId, setToNodeId] = useState<string>(
    () =>
      originalMovement?.values.toNodeId ??
      world?.tanks[1]?.id ??
      world?.stations[0]?.id ??
      "",
  );
  const [volume, setVolume] = useState<string>(() =>
    originalMovement ? String(originalMovement.values.volumeM3) : "",
  );
  const [shipperId, setShipperId] = useState<string>(
    () => originalMovement?.values.shipperId ?? "",
  );
  const [pinOpen, setPinOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [commitIssues, setCommitIssues] = useState<CaptureIssue[]>([]);

  const typeFieldId = useId();
  const fromFieldId = useId();
  const toFieldId = useId();
  const volumeFieldId = useId();
  const shipperFieldId = useId();

  const parsedVolume = parseNumber(volume);
  const input: MovementInput | null =
    parsedVolume !== null && fromNodeId !== "" && toNodeId !== ""
      ? {
          type,
          fromNodeId,
          toNodeId,
          volumeM3: parsedVolume,
          shipperId: shipperId || undefined,
        }
      : null;

  // MV-6 — validation AT ENTRY, cheap enough to run each render.
  const entryIssues: CaptureIssue[] = world && input ? validateMovement(world, input) : [];
  const blocked = hasBlockingIssue(entryIssues);
  const canConfirm = input !== null && !blocked;

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  if (amendRecordId && !originalMovement) {
    return (
      <p role="alert" className="text-[13px] text-status-critical">
        El registro a corregir no existe o no es un movimiento.
      </p>
    );
  }

  const nodeOptions = buildNodeOptions(world);

  function handleResolved(operator: Operator, credential: OperatorCredential) {
    setPinOpen(false);
    if (!input) return;
    const store = useCaptureStore.getState();
    const result = amendRecordId
      ? store.amendRecord(amendRecordId, input, credential)
      : store.commitMovement(input, credential);

    switch (result.status) {
      case CommitStatus.COMMITTED: {
        const warnCount = result.warnings.length;
        setCommitIssues([]);
        setFeedback({
          tone: "ok",
          text: `Registro ${result.record.id} confirmado por ${operator.name}${
            warnCount > 0 ? ` (${warnCount} advertencia${warnCount > 1 ? "s" : ""})` : ""
          }. El movimiento ya se refleja en el balance.`,
        });
        if (!amendRecordId) setVolume("");
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
      aria-label={amendRecordId ? "Corregir movimiento" : "Movimiento de crudo"}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canConfirm) setPinOpen(true);
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={typeFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Tipo de movimiento
        </label>
        <select
          id={typeFieldId}
          value={type}
          onChange={(e) => setType(e.target.value as MovementType)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {Object.values(MovementType).map((mt) => (
            <option key={mt} value={mt}>
              {MOVEMENT_TYPE_LABELS[mt]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={fromFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Origen
        </label>
        <select
          id={fromFieldId}
          value={fromNodeId}
          onChange={(e) => setFromNodeId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={toFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Destino
        </label>
        <select
          id={toFieldId}
          value={toNodeId}
          onChange={(e) => setToNodeId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={volumeFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Volumen (m³)
        </label>
        <input
          id={volumeFieldId}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={volume}
          onChange={(e) => {
            setVolume(e.target.value);
            setFeedback(null);
            setCommitIssues([]);
          }}
          placeholder="0"
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={shipperFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Remitente — opcional
        </label>
        <select
          id={shipperFieldId}
          value={shipperId}
          onChange={(e) => setShipperId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          <option value="">Sin remitente</option>
          {world.shippers.map((s) => (
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
        {amendRecordId ? "Corregir con PIN" : "Confirmar con PIN"}
      </button>

      <PinPrompt
        open={pinOpen}
        title={amendRecordId ? "Corregir movimiento" : "Confirmar movimiento"}
        summary={
          input
            ? `${MOVEMENT_TYPE_LABELS[input.type]}: ${nodeName(world, input.fromNodeId)} → ${nodeName(world, input.toNodeId)}, ${formatM3(input.volumeM3)}`
            : undefined
        }
        onCancel={() => setPinOpen(false)}
        onResolved={handleResolved}
      />
    </form>
  );
}
