"use client";

/**
 * TankReadingForm — flagship capture flow (MV-11, PLAN_MEJORAS_VENTA §6.1 #1).
 *
 * Replaces the Excel `Mov_tk` / `Cont_vol_diario` entry: select a tank, type
 * the gauged level, and the value is validated AT ENTRY (lib/capture/validate):
 * impossible data (above capacityM3, negative) hard-blocks the confirm button;
 * unusual data (diff beyond tolerance, implausible jump) warns but passes.
 * A valid commit asks for operator + PIN (PinPrompt) and then goes through
 * captureStore, so the hero / balance / descuadre update live.
 *
 * With `amendRecordId` the same form corrects an existing record with ledger
 * semantics: the commit creates a NEW record superseding the original (MV-8).
 */

import { useId, useState } from "react";
import type { Operator, PipelineWorld } from "@/lib/domain";
import { validateTankReading, hasBlockingIssue } from "@/lib/capture/validate";
import type { CaptureIssue, TankReadingInput } from "@/lib/capture/validate";
import type { OperatorCredential } from "@/lib/capture/identity";
import {
  deriveTankReadingPreview,
  parseDecimalInput,
  parseVolumeInput,
} from "@/lib/capture/preview";
import { useWorldStore } from "@/store/worldStore";
import { useSimulationStore } from "@/store/simulationStore";
import { useCaptureStore, CommitStatus, CaptureRecordKind } from "@/store/captureStore";
import type { CaptureRecord } from "@/store/captureStore";
import { PinPrompt } from "./PinPrompt";
import { IssueList } from "./IssueList";
import { DerivedPreview } from "./DerivedPreview";
import { ValueSourceBadge, ValueSourceKind } from "./ValueSourceBadge";
import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  MONO_STYLE,
  PRIMARY_BUTTON_CLASS,
  formatM3,
} from "./formKit";

export interface TankReadingFormProps {
  /** When set, the form amends this ledger record instead of creating a fresh one. */
  amendRecordId?: string;
  onCommitted?: (record: CaptureRecord) => void;
}

interface FeedbackMessage {
  tone: "ok" | "critical";
  text: string;
}

export function TankReadingForm({ amendRecordId, onCommitted }: TankReadingFormProps) {
  const world: PipelineWorld | null = useWorldStore((s) => s.world);
  const records = useCaptureStore((s) => s.records);

  const original = amendRecordId ? records.find((r) => r.id === amendRecordId) : undefined;
  const originalReading =
    original?.kind === CaptureRecordKind.TANK_READING ? original : undefined;

  const [tankId, setTankId] = useState<string>(
    () => originalReading?.values.tankId ?? world?.tanks[0]?.id ?? "",
  );
  const [level, setLevel] = useState<string>(() =>
    originalReading ? String(originalReading.values.levelM3) : "",
  );
  const [temperature, setTemperature] = useState<string>("");
  const [pinOpen, setPinOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [commitIssues, setCommitIssues] = useState<CaptureIssue[]>([]);

  const tankFieldId = useId();
  const levelFieldId = useId();
  const tempFieldId = useId();

  const tank = world?.tanks.find((t) => t.id === tankId);
  const liveLevel = useSimulationStore((state) => state.tankLevels[tankId]);
  const parsedLevel = parseVolumeInput(level);
  const parsedTemp = parseDecimalInput(temperature);

  const input: TankReadingInput | null =
    parsedLevel !== null && tankId !== ""
      ? { tankId, levelM3: parsedLevel, temperatureF: parsedTemp ?? undefined }
      : null;

  // MV-6 — validation AT ENTRY, not in a later report. Cheap enough to run
  // on every render (array lookups over the world), so no memo bookkeeping.
  const entryIssues: CaptureIssue[] =
    world && input ? validateTankReading(world, input, liveLevel) : [];
  const preview =
    world && input
      ? deriveTankReadingPreview(world, input.tankId, input.levelM3, input.temperatureF, liveLevel)
      : null;

  const blocked = hasBlockingIssue(entryIssues);
  const canConfirm = input !== null && !blocked;

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted" style={MONO_STYLE}>
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  if (amendRecordId && !originalReading) {
    return (
      <p role="alert" className="text-[13px] text-status-critical">
        El registro a corregir no existe o no es una lectura de estanque.
      </p>
    );
  }

  function handleResolved(operator: Operator, credential: OperatorCredential) {
    setPinOpen(false);
    if (!input) return;
    const store = useCaptureStore.getState();
    const result = amendRecordId
      ? store.amendRecord(amendRecordId, input, credential)
      : store.commitTankReading(input, credential);

    switch (result.status) {
      case CommitStatus.COMMITTED: {
        const warnCount = result.warnings.length;
        setCommitIssues([]);
        setFeedback({
          tone: "ok",
          text: `Registro ${result.record.id} confirmado por ${operator.name}${
            warnCount > 0 ? ` (${warnCount} advertencia${warnCount > 1 ? "s" : ""})` : ""
          }. El nivel ya se refleja en el diagrama y el balance.`,
        });
        if (!amendRecordId) {
          setLevel("");
          setTemperature("");
        }
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
      aria-label={amendRecordId ? "Corregir lectura de estanque" : "Lectura de estanque"}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canConfirm) setPinOpen(true);
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={tankFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Estanque
          </label>
          <ValueSourceBadge kind={ValueSourceKind.ENTERED} />
        </div>
        <select
          id={tankFieldId}
          value={tankId}
          onChange={(e) => setTankId(e.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          {world.tanks.map((t) => {
            const station = world.stations.find((s) => s.id === t.stationId);
            return (
              <option key={t.id} value={t.id}>
                {t.tag}
                {station ? ` · ${station.name}` : ""}
              </option>
            );
          })}
        </select>
        {tank && (
          <p className="text-[12px] text-ink-muted" style={MONO_STYLE}>
            Stock vivo: {formatM3(liveLevel ?? tank.currentLevelM3)} · Capacidad:{" "}
            {formatM3(tank.capacityM3)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={levelFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Nivel medido (m³)
          </label>
          <ValueSourceBadge kind={ValueSourceKind.ENTERED} />
        </div>
        <input
          id={levelFieldId}
          type="text"
          inputMode="decimal"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setFeedback(null);
            setCommitIssues([]);
          }}
          placeholder={tank ? String(Math.round(tank.currentLevelM3)) : "0"}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={tempFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
            Temperatura (°F) — opcional
          </label>
          <ValueSourceBadge kind={ValueSourceKind.ENTERED} />
        </div>
        <input
          id={tempFieldId}
          type="number"
          inputMode="decimal"
          step="any"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder={tank ? tank.temperatureF.toFixed(0) : "60"}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        />
      </div>

      {preview && (
        <DerivedPreview
          rows={[
            { label: "Δ vs anterior", value: `${preview.deltaM3 >= 0 ? "+" : ""}${formatM3(preview.deltaM3)}` },
            { label: "Volumen a 15 °C", value: formatM3(preview.volumes.volume15CM3) },
            { label: "Volumen a 60 °F", value: formatM3(preview.volumes.volume60FM3) },
            { label: "Nuevo stock", value: formatM3(preview.newStockM3) },
            { label: "Descuadre estimado", value: `${formatM3(preview.mismatch.afterM3)} (${preview.mismatch.afterPct.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)` },
            { label: "Base térmica", value: `${preview.temperatureF.toLocaleString("es-AR")} °F` },
          ]}
        />
      )}

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
        title={amendRecordId ? "Corregir lectura de estanque" : "Confirmar lectura de estanque"}
        summary={
          input && tank ? `${tank.tag} → nivel ${formatM3(input.levelM3)}` : undefined
        }
        onCancel={() => setPinOpen(false)}
        onResolved={handleResolved}
      />
    </form>
  );
}
