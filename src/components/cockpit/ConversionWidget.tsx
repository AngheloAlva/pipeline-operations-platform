"use client";

/**
 * ConversionWidget — interactive volumetric conversion form.
 * SR-011: V@15C and V@60F from lib/volumetrics/conversions.ts.
 * Resets when selectedNodeId changes. Local state only (no store persistence).
 * UI copy: Spanish.
 */

import { useState, useEffect } from "react";
import { toVolume15C, toVolume60F } from "@/lib/volumetrics/conversions";

// ============================================================================
// TYPES
// ============================================================================

interface ConversionResult {
  volume15C: number;
  volume60F: number;
}

// ============================================================================
// PROPS
// ============================================================================

export interface ConversionWidgetProps {
  /** When this value changes, the form resets. SR-011 req 3. */
  selectedNodeId: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ConversionWidget renders an interactive form for volumetric corrections.
 * Inputs: observed volume (m³), observed temperature (°C), API gravity (°API).
 * On submit, displays V@15C and V@60F.
 * Resets on selectedNodeId change — local state only.
 * SR-011.
 */
export function ConversionWidget({ selectedNodeId }: ConversionWidgetProps) {
  // Local form state — SR-011 req 5 (no store persistence)
  const [volumeM3, setVolumeM3] = useState("");
  const [tempC, setTempC] = useState("");
  const [apiGravity, setApiGravity] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset all inputs when selected node changes — SR-011 req 3–4
  useEffect(() => {
    setVolumeM3("");
    setTempC("");
    setApiGravity("");
    setResult(null);
    setError(null);
  }, [selectedNodeId]);

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const v = parseFloat(volumeM3);
    const t = parseFloat(tempC);
    const api = parseFloat(apiGravity);

    if (isNaN(v) || isNaN(t) || isNaN(api)) {
      setError("Ingrese valores numéricos válidos en todos los campos.");
      return;
    }

    if (v <= 0) {
      setError("El volumen debe ser mayor que cero.");
      return;
    }

    // conversions.ts expects temperature in °F — convert from °C
    const tF = (t * 9) / 5 + 32;

    try {
      setResult({
        volume15C: toVolume15C(v, tF),
        volume60F: toVolume60F(v, tF),
      });
    } catch {
      setError("Error en el cálculo. Verifique los valores ingresados.");
    }
  }

  function handleReset() {
    setVolumeM3("");
    setTempC("");
    setApiGravity("");
    setResult(null);
    setError(null);
  }

  const labelClass = "text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary";
  const inputClass =
    "w-full border border-border-subtle bg-surface-overlay px-2 py-1.5 text-[11px] text-ink-primary tabular-nums focus:border-border-mid focus:outline-none";
  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  return (
    <section
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Conversión Volumétrica"
    >
      {/* Panel header */}
      <header>
        <h2 className={labelClass} style={monoStyle}>
          Conversión Volumétrica
        </h2>
        {selectedNodeId ? (
          <p className="mt-0.5 text-[10px] text-ink-muted" style={monoStyle}>
            Nodo: {selectedNodeId}
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] text-ink-muted" style={monoStyle}>
            Seleccione un nodo en el diagrama
          </p>
        )}
      </header>

      {/* Form — SR-011 req 1–2 */}
      <form onSubmit={handleCalculate} className="flex flex-col gap-2.5" noValidate>
        {/* Volumen observado */}
        <div className="flex flex-col gap-1">
          <label htmlFor="conv-volume" className={labelClass} style={monoStyle}>
            Volumen observado (m³)
          </label>
          <input
            id="conv-volume"
            type="number"
            min="0"
            step="any"
            value={volumeM3}
            onChange={(e) => setVolumeM3(e.target.value)}
            className={inputClass}
            style={monoStyle}
            placeholder="0.00"
            aria-label="Volumen observado en metros cúbicos"
          />
        </div>

        {/* Temperatura */}
        <div className="flex flex-col gap-1">
          <label htmlFor="conv-temp" className={labelClass} style={monoStyle}>
            Temperatura (°C)
          </label>
          <input
            id="conv-temp"
            type="number"
            step="any"
            value={tempC}
            onChange={(e) => setTempC(e.target.value)}
            className={inputClass}
            style={monoStyle}
            placeholder="15.0"
            aria-label="Temperatura en grados Celsius"
          />
        </div>

        {/* Gravedad API */}
        <div className="flex flex-col gap-1">
          <label htmlFor="conv-api" className={labelClass} style={monoStyle}>
            Gravedad API (°API)
          </label>
          <input
            id="conv-api"
            type="number"
            step="any"
            value={apiGravity}
            onChange={(e) => setApiGravity(e.target.value)}
            className={inputClass}
            style={monoStyle}
            placeholder="37.0"
            aria-label="Gravedad API"
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-[10px] text-status-critical" style={monoStyle}>
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 border border-border-mid bg-surface-interactive px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary transition-colors hover:bg-surface-overlay hover:text-ink-primary"
            style={monoStyle}
          >
            Calcular
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="border border-border-subtle px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted transition-colors hover:border-border-mid hover:text-ink-tertiary"
            style={monoStyle}
          >
            Restablecer
          </button>
        </div>
      </form>

      {/* Results — SR-011 req 2 */}
      {result && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <p className={`${labelClass} mb-0.5`} style={monoStyle}>
            Resultado
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span
                className="text-[10px] uppercase tracking-[0.12em] text-ink-muted"
                style={monoStyle}
              >
                V@15°C
              </span>
              <span className="text-sm tabular-nums text-ink-primary" style={monoStyle}>
                {result.volume15C.toFixed(2)} m³
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span
                className="text-[10px] uppercase tracking-[0.12em] text-ink-muted"
                style={monoStyle}
              >
                V@60°F
              </span>
              <span className="text-sm tabular-nums text-ink-primary" style={monoStyle}>
                {result.volume60F.toFixed(2)} m³
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
