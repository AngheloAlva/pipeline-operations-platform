"use client";

import { useId, useState } from "react";
import type { Operator } from "@/lib/domain";
import { MovementType } from "@/lib/domain";
import type { OperatorCredential } from "@/lib/capture/identity";
import { hasBlockingIssue, validateMovement } from "@/lib/capture/validate";
import type { CaptureIssue, MovementInput } from "@/lib/capture/validate";
import {
  batchVolumeM3,
  deriveMovementPreview,
  parseDecimalInput,
  parseVolumeInput,
} from "@/lib/capture/preview";
import type { BatchReadingInput } from "@/lib/capture/preview";
import { useWorldStore } from "@/store/worldStore";
import { useSimulationStore } from "@/store/simulationStore";
import { CommitStatus, useCaptureStore } from "@/store/captureStore";
import type { CaptureRecord } from "@/store/captureStore";
import { DerivedPreview } from "./DerivedPreview";
import { IssueList } from "./IssueList";
import { PinPrompt } from "./PinPrompt";
import { ValueSourceBadge, ValueSourceKind } from "./ValueSourceBadge";
import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  MONO_STYLE,
  PRIMARY_BUTTON_CLASS,
  formatM3,
} from "./formKit";

interface BatchReadingFormProps {
  onCommitted?: (record: CaptureRecord) => void;
}

interface FeedbackMessage {
  tone: "ok" | "critical";
  text: string;
}

function formatBarrels(value: number): string {
  return `${Math.round(value).toLocaleString("es-AR")} BRLS`;
}

export function BatchReadingForm({ onCommitted }: BatchReadingFormProps) {
  const world = useWorldStore((state) => state.world);
  const [fromTankId, setFromTankId] = useState(() => world?.tanks[0]?.id ?? "");
  const [toTankId, setToTankId] = useState(() => world?.tanks[1]?.id ?? "");
  const [meterStart, setMeterStart] = useState("");
  const [meterEnd, setMeterEnd] = useState("");
  const [temperature, setTemperature] = useState("");
  const [apiGravity, setApiGravity] = useState("");
  const [shipperId, setShipperId] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [commitIssues, setCommitIssues] = useState<CaptureIssue[]>([]);

  const fromFieldId = useId();
  const toFieldId = useId();
  const meterStartFieldId = useId();
  const meterEndFieldId = useId();
  const temperatureFieldId = useId();
  const apiFieldId = useId();
  const shipperFieldId = useId();

  const originTank = world?.tanks.find((tank) => tank.id === fromTankId);
  const destinationTank = world?.tanks.find((tank) => tank.id === toTankId);
  const originLiveLevel = useSimulationStore((state) => state.tankLevels[fromTankId]);
  const destinationLiveLevel = useSimulationStore((state) => state.tankLevels[toTankId]);
  const parsedMeterStart = parseVolumeInput(meterStart);
  const parsedMeterEnd = parseVolumeInput(meterEnd);
  const parsedTemperature = parseDecimalInput(temperature);
  const parsedApi = parseDecimalInput(apiGravity);

  const batchInput: BatchReadingInput | null =
    parsedMeterStart !== null &&
    parsedMeterEnd !== null &&
    parsedTemperature !== null &&
    parsedApi !== null &&
    fromTankId !== "" &&
    toTankId !== ""
      ? {
          fromTankId,
          toTankId,
          meterStartM3: parsedMeterStart,
          meterEndM3: parsedMeterEnd,
          temperatureF: parsedTemperature,
          apiGravity: parsedApi,
          shipperId: shipperId || undefined,
        }
      : null;

  const movementInput: MovementInput | null = batchInput
    ? {
        type: MovementType.TRANSFER,
        fromNodeId: batchInput.fromTankId,
        toNodeId: batchInput.toTankId,
        volumeM3: batchVolumeM3(batchInput),
        temperatureF: batchInput.temperatureF,
        apiGravity: batchInput.apiGravity,
        shipperId: batchInput.shipperId,
      }
    : null;
  const liveLevels: Readonly<Record<string, number>> = {
    ...(originLiveLevel !== undefined ? { [fromTankId]: originLiveLevel } : {}),
    ...(destinationLiveLevel !== undefined ? { [toTankId]: destinationLiveLevel } : {}),
  };
  const entryIssues =
    world && movementInput ? validateMovement(world, movementInput, liveLevels) : [];
  const preview =
    world && movementInput
      ? deriveMovementPreview(world, movementInput, originLiveLevel, destinationLiveLevel)
      : null;
  const canConfirm = movementInput !== null && !hasBlockingIssue(entryIssues);

  if (!world) {
    return (
      <p className="text-[13px] text-ink-muted">
        Los datos del oleoducto aún no están disponibles.
      </p>
    );
  }

  function clearFeedback(): void {
    setFeedback(null);
    setCommitIssues([]);
  }

  function handleResolved(operator: Operator, credential: OperatorCredential): void {
    setPinOpen(false);
    if (!movementInput) return;
    const result = useCaptureStore.getState().commitMovement(movementInput, credential);
    if (result.status === CommitStatus.COMMITTED) {
      setCommitIssues([]);
      setFeedback({
        tone: "ok",
        text: `Batch ${result.record.id} confirmado por ${operator.name}. El movimiento y los stocks ya se propagaron.`,
      });
      setMeterStart("");
      setMeterEnd("");
      onCommitted?.(result.record);
      return;
    }
    if (result.status === CommitStatus.BLOCKED) {
      setFeedback(null);
      setCommitIssues(result.issues);
      return;
    }
    setCommitIssues([]);
    setFeedback({ tone: "critical", text: result.message });
  }

  const enteredBadge = <ValueSourceBadge kind={ValueSourceKind.ENTERED} />;
  const tankOptions = world.tanks.map((tank) => (
    <option key={tank.id} value={tank.id}>
      {tank.tag} · {tank.product}
    </option>
  ));

  return (
    <form
      aria-label="Lectura profunda de batch"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canConfirm) setPinOpen(true);
      }}
      noValidate
    >
      <p className="border-l-2 border-accent pl-3 text-[12px] leading-snug text-ink-secondary">
        Dos lecturas de flujómetro y condiciones observadas generan automáticamente las bases de
        custodia y los nuevos stocks.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={fromFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
              Estanque origen
            </label>
            {enteredBadge}
          </div>
          <select
            id={fromFieldId}
            value={fromTankId}
            onChange={(event) => {
              setFromTankId(event.target.value);
              clearFeedback();
            }}
            className={FIELD_INPUT_CLASS}
            style={MONO_STYLE}
          >
            {tankOptions}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={toFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
              Estanque destino
            </label>
            {enteredBadge}
          </div>
          <select
            id={toFieldId}
            value={toTankId}
            onChange={(event) => {
              setToTankId(event.target.value);
              clearFeedback();
            }}
            className={FIELD_INPUT_CLASS}
            style={MONO_STYLE}
          >
            {tankOptions}
          </select>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 border border-border-subtle bg-surface-overlay p-2 text-[12px] text-ink-tertiary"
        style={MONO_STYLE}
      >
        <span>
          Producto detectado: <span className="text-ink-primary">{originTank?.product ?? "—"}</span>{" "}
          · destino {destinationTank?.tag ?? "—"}
        </span>
        <ValueSourceBadge kind={ValueSourceKind.CALCULATED} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            id: meterStartFieldId,
            label: "Flujómetro inicial (m³)",
            value: meterStart,
            setter: setMeterStart,
            placeholder: "120.000",
          },
          {
            id: meterEndFieldId,
            label: "Flujómetro final (m³)",
            value: meterEnd,
            setter: setMeterEnd,
            placeholder: "121.250",
          },
          {
            id: temperatureFieldId,
            label: "Temperatura (°F)",
            value: temperature,
            setter: setTemperature,
            placeholder: originTank?.temperatureF.toFixed(0) ?? "60",
          },
          {
            id: apiFieldId,
            label: "Gravedad API (°API)",
            value: apiGravity,
            setter: setApiGravity,
            placeholder: originTank?.apiGravity.toFixed(1) ?? "34",
          },
        ].map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={field.id} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
                {field.label}
              </label>
              {enteredBadge}
            </div>
            <input
              id={field.id}
              type="text"
              inputMode="decimal"
              value={field.value}
              onChange={(event) => {
                field.setter(event.target.value);
                clearFeedback();
              }}
              placeholder={field.placeholder}
              className={FIELD_INPUT_CLASS}
              style={MONO_STYLE}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={shipperFieldId} className={FIELD_LABEL_CLASS} style={MONO_STYLE}>
          Remitente — opcional
        </label>
        <select
          id={shipperFieldId}
          value={shipperId}
          onChange={(event) => setShipperId(event.target.value)}
          className={FIELD_INPUT_CLASS}
          style={MONO_STYLE}
        >
          <option value="">Sin remitente</option>
          {world.shippers.map((shipper) => (
            <option key={shipper.id} value={shipper.id}>
              {shipper.name}
            </option>
          ))}
        </select>
      </div>

      {preview && (
        <DerivedPreview
          title="Cálculo automático del batch"
          rows={[
            { label: "Volumen observado", value: formatM3(preview.volumes.observedM3) },
            { label: "GSV a 15 °C", value: formatM3(preview.volumes.volume15CM3) },
            { label: "GSV a 60 °F", value: formatM3(preview.volumes.volume60FM3) },
            { label: "Barriles estándar", value: formatBarrels(preview.volumes.barrels) },
            {
              label: "Nuevo stock origen",
              value: preview.originNewStockM3 === null ? "—" : formatM3(preview.originNewStockM3),
            },
            {
              label: "Nuevo stock destino",
              value:
                preview.destinationNewStockM3 === null
                  ? "—"
                  : formatM3(preview.destinationNewStockM3),
            },
            {
              label: "Descuadre estimado",
              value: `${formatM3(preview.mismatch.afterM3)} (${preview.mismatch.afterPct.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`,
            },
          ]}
        />
      )}

      <IssueList issues={[...entryIssues, ...commitIssues]} />
      {feedback && (
        <p
          role={feedback.tone === "critical" ? "alert" : "status"}
          className={
            feedback.tone === "ok"
              ? "border-l-2 border-status-ok bg-status-ok-bg px-3 py-2 text-[13px] text-status-ok"
              : "text-[13px] text-status-critical"
          }
        >
          {feedback.text}
        </p>
      )}
      <button
        type="submit"
        disabled={!canConfirm}
        className={PRIMARY_BUTTON_CLASS}
        style={MONO_STYLE}
      >
        Confirmar batch con PIN
      </button>
      <PinPrompt
        open={pinOpen}
        title="Confirmar lectura de batch"
        summary={
          preview
            ? `${originTank?.tag} → ${destinationTank?.tag} · ${formatM3(preview.volumes.observedM3)} · ${formatBarrels(preview.volumes.barrels)}`
            : undefined
        }
        onCancel={() => setPinOpen(false)}
        onResolved={handleResolved}
      />
    </form>
  );
}
