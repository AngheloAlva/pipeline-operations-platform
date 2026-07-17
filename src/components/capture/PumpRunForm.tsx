"use client";

/**
 * PumpRunForm — capture the operating hours of a pump/agitator (MV-19).
 *
 * Replaces the Excel `HRS_BBAS_Agitadores` entry: select a rotating equipment,
 * type the hours it ran during the shift, and the value is validated AT ENTRY
 * (lib/capture/validate): impossible data (non-positive, above 24 h per shift)
 * hard-blocks the confirm button; unusual data (beyond a typical shift,
 * non-operational equipment) warns but passes. A valid commit asks for
 * operator + PIN (PinPrompt) and goes through captureStore, so the equipment's
 * accumulated hours — and every BY_HOURS maintenance selector reading them —
 * update live. No double entry: the same hour advances the maintenance plan.
 *
 * With `amendRecordId` the same form corrects an existing record with ledger
 * semantics: the commit creates a NEW record superseding the original (MV-8).
 */

import { useId, useState } from "react";
import Link from "next/link";
import type { Operator, PipelineWorld } from "@/lib/domain";
import { EquipmentType } from "@/lib/domain";
import { validatePumpRun, hasBlockingIssue } from "@/lib/capture/validate";
import type { CaptureIssue, PumpRunInput } from "@/lib/capture/validate";
import type { OperatorCredential } from "@/lib/capture/identity";
import { deriveEquipmentHoursOutlook } from "@/lib/maintenance/selectors";
import { MODULE_PATH } from "@/lib/focus/focusUrl";
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
  formatHours,
} from "./formKit";

export interface PumpRunFormProps {
  /** When set, the form amends this ledger record instead of creating a fresh one. */
  amendRecordId?: string;
  onCommitted?: (record: CaptureRecord) => void;
}

interface FeedbackMessage {
  tone: "ok" | "critical";
  text: string;
  /** Equipment whose detail page the success state links to. */
  equipmentId?: string;
}

/** Equipment types whose hours are captured per shift (bombas y agitadores). */
const ROTATING_TYPES: readonly EquipmentType[] = [
  EquipmentType.PUMP,
  EquipmentType.AGITATOR,
  EquipmentType.MOTOR,
];

function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  return Number(raw.replace(",", "."));
}

export function PumpRunForm({ amendRecordId, onCommitted }: PumpRunFormProps) {
  const world: PipelineWorld | null = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const original = amendRecordId ? records.find((r) => r.id === amendRecordId) : undefined;
  const originalRun = original?.kind === CaptureRecordKind.PUMP_RUN ? original : undefined;

  const rotating = world?.equipment.filter((e) => ROTATING_TYPES.includes(e.type)) ?? [];

  const [equipmentId, setEquipmentId] = useState<string>(
    () => originalRun?.values.equipmentId ?? rotating[0]?.id ?? "",
  );
  const [hours, setHours] = useState<string>(() =>
    originalRun ? String(originalRun.values.hoursRun) : "",
  );
  const [pinOpen, setPinOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [commitIssues, setCommitIssues] = useState<CaptureIssue[]>([]);

  const equipmentFieldId = useId();
  const hoursFieldId = useId();

  const parsedHours = parseNumber(hours);
  const input: PumpRunInput | null =
    parsedHours !== null && equipmentId !== ""
      ? { equipmentId, hoursRun: parsedHours }
      : null;

  // MV-6 idiom — validation AT ENTRY, cheap enough to run each render.
  const entryIssues: CaptureIssue[] = world && input ? validatePumpRun(world, input) : [];
  const blocked = hasBlockingIssue(entryIssues);
  const canConfirm = input !== null && !blocked;

  // Hours→maintenance exhibit: accumulated hours + BY_HOURS outlook of the
  // selected equipment, straight from the maintenance selectors.
  const today = new Date().toISOString().slice(0, 10);
  const outlook =
    world && equipmentId ? deriveEquipmentHoursOutlook(world, equipmentId, today) : null;

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  if (amendRecordId && !originalRun) {
    return (
      <p role="alert" className="text-[13px] text-status-critical">
        El registro a corregir no existe o no es un registro de horas.
      </p>
    );
  }

  if (rotating.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        No hay bombas ni agitadores registrados en la topología.
      </p>
    );
  }

  const equipment = world.equipment.find((e) => e.id === equipmentId);

  function handleResolved(operator: Operator, credential: OperatorCredential) {
    setPinOpen(false);
    if (!input) return;
    const store = useCaptureStore.getState();
    const result = amendRecordId
      ? store.amendRecord(amendRecordId, input, credential)
      : store.commitPumpRun(input, credential);

    switch (result.status) {
      case CommitStatus.COMMITTED: {
        const warnCount = result.warnings.length;
        setCommitIssues([]);
        setFeedback({
          tone: "ok",
          text: `Registro ${result.record.id} confirmado por ${operator.name}${
            warnCount > 0 ? ` (${warnCount} advertencia${warnCount > 1 ? "s" : ""})` : ""
          }. Las horas ya avanzan el plan de mantención del equipo.`,
          equipmentId: input.equipmentId,
        });
        if (!amendRecordId) setHours("");
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
      aria-label={amendRecordId ? "Corregir horas de bomba" : "Horas de bomba"}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canConfirm) setPinOpen(true);
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={equipmentFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Equipo
        </label>
        <select
          id={equipmentFieldId}
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {rotating.map((item) => {
            const station = world.stations.find((s) => s.id === item.stationId);
            return (
              <option key={item.id} value={item.id}>
                {item.tag} — {item.name}
                {station ? ` · ${station.name}` : ""}
              </option>
            );
          })}
        </select>
        {equipment && outlook && (
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-ink-muted" style={MONO_STYLE}>
              Horas acumuladas: {formatHours(outlook.operatingHours)}
            </p>
            {outlook.tasks.map((task) => (
              <p
                key={`${task.planId}:${task.taskId}`}
                className="text-[12px] text-ink-muted"
                style={MONO_STYLE}
              >
                Próxima mantención por horas a las {formatHours(task.nextDueAtHours)} ·{" "}
                {task.remainingHours >= 0
                  ? `quedan ${formatHours(task.remainingHours)}`
                  : `vencida por ${formatHours(-task.remainingHours)}`}{" "}
                ({task.taskName})
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={hoursFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Horas de operación del turno
        </label>
        <input
          id={hoursFieldId}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            setFeedback(null);
            setCommitIssues([]);
          }}
          placeholder="8"
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        />
      </div>

      <IssueList issues={[...entryIssues, ...commitIssues]} />

      {feedback && (
        <div
          role={feedback.tone === "critical" ? "alert" : "status"}
          className={
            feedback.tone === "ok"
              ? "flex flex-col gap-1 border-l-2 border-status-ok bg-status-ok-bg px-3 py-2 text-[13px] leading-snug text-status-ok"
              : "text-[13px] leading-snug text-status-critical"
          }
        >
          {feedback.text}
          {feedback.tone === "ok" && feedback.equipmentId && (
            <Link
              href={`${MODULE_PATH.equipment}/${feedback.equipmentId}`}
              className="self-start text-[12px] font-medium uppercase tracking-[0.08em] text-accent transition-colors hover:text-ink-primary"
              style={MONO_STYLE}
            >
              Ver equipo →
            </Link>
          )}
        </div>
      )}

      <button type="submit" disabled={!canConfirm} className={PRIMARY_BUTTON_CLASS} style={MONO_STYLE}>
        {amendRecordId ? "Corregir con PIN" : "Confirmar con PIN"}
      </button>

      <PinPrompt
        open={pinOpen}
        title={amendRecordId ? "Corregir horas de bomba" : "Confirmar horas de bomba"}
        summary={
          input && equipment
            ? `${equipment.tag} → +${formatHours(input.hoursRun)} de operación`
            : undefined
        }
        onCancel={() => setPinOpen(false)}
        onResolved={handleResolved}
      />
    </form>
  );
}
