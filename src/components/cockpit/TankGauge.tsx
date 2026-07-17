"use client";

/**
 * TankGauge — horizontal card instrument for a single tank.
 * SR-006: animated liquid-fill rect, high-level alarm at >=95%.
 * SR-015: borders-only (no radius, no shadow), Geist Mono numeric readouts.
 * Driven by parent via per-tank selector output — does NOT subscribe to store directly.
 */

import { cn } from "@/lib/cn";
import { ValueSourceBadge, ValueSourceKind } from "@/components/capture/ValueSourceBadge";
import { TANK_HIGH_LEVEL_ALARM } from "@/lib/simulation/types";

// ============================================================================
// TYPES
// ============================================================================

export interface TankGaugeProps {
  tankId: string;
  level: number;
  capacity: number;
  label: string;
  className?: string;
  temperatureF?: number;
  apiGravity?: number;
  /** Receiving fuel this tick (simulation running) — shows ▲ IN indicator. */
  inflow?: boolean;
  /** Discharging fuel this tick (simulation running) — shows ▼ OUT indicator. */
  outflow?: boolean;
}

/**
 * FlowIndicator — small steady in/out chip shown on a tank card while the
 * simulation is moving fuel. ▲ IN = receiving (telemetry blue), ▼ OUT =
 * discharging (phosphor green). Steady (no pulse); the parent throttles the
 * in/out signal to ~700ms so it stays calm even at high sim speed.
 */
function FlowIndicator({ dir }: { dir: "in" | "out" }) {
  const isIn = dir === "in";
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium tabular-nums leading-none"
      style={{
        fontFamily: "var(--font-mono), monospace",
        color: isIn ? "var(--status-flow)" : "var(--accent)",
      }}
      aria-label={isIn ? "Recibiendo combustible" : "Descargando combustible"}
    >
      {isIn ? "▲ IN" : "▼ OUT"}
    </span>
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GAUGE_W = 26;
const GAUGE_H = 58;
const BORDER_W = 1.5;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * TankGauge — horizontal card: small vertical SVG gauge on the left,
 * tag / fill% / temp·API metadata on the right.
 * Fill transitions smoothly via CSS transition on the rect transform.
 * Amber border + pulse at TANK_HIGH_LEVEL_ALARM (>=95%).
 */
export function TankGauge({
  tankId,
  level,
  capacity,
  label,
  className,
  temperatureF,
  apiGravity,
  inflow,
  outflow,
}: TankGaugeProps) {
  const ratio = capacity > 0 ? Math.max(0, Math.min(1, level / capacity)) : 0;
  const fillPercent = ratio * 100;
  const isAlarm = ratio >= TANK_HIGH_LEVEL_ALARM;

  // Fill rect — grows from bottom. SVG y=0 is top.
  const fillH = (GAUGE_H - BORDER_W * 2) * ratio;
  const fillY = GAUGE_H - BORDER_W - fillH;

  // High-level alarm stripe y position
  const alarmY = GAUGE_H - BORDER_W - (GAUGE_H - BORDER_W * 2) * TANK_HIGH_LEVEL_ALARM;

  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  // Temp·API line — build only if at least one value is present
  const tempApiParts: string[] = [];
  if (temperatureF !== undefined) tempApiParts.push(`${temperatureF.toFixed(0)}°F`);
  if (apiGravity !== undefined) tempApiParts.push(`${apiGravity.toFixed(0)}°API`);
  const tempApiLine = tempApiParts.length > 0 ? tempApiParts.join(" · ") : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border border-border-subtle bg-surface-overlay px-2.5 py-2",
        className,
      )}
      data-tank-id={tankId}
    >
      {/* LEFT: vertical SVG gauge — smaller than original */}
      <svg
        width={GAUGE_W}
        height={GAUGE_H}
        viewBox={`0 0 ${GAUGE_W} ${GAUGE_H}`}
        aria-label={`Tanque ${label}: ${fillPercent.toFixed(0)}%${isAlarm ? " — Alarma nivel alto" : ""}`}
        role="img"
        style={{ flexShrink: 0 }}
      >
        {/* Background (empty tank) */}
        <rect
          x={BORDER_W / 2}
          y={BORDER_W / 2}
          width={GAUGE_W - BORDER_W}
          height={GAUGE_H - BORDER_W}
          fill="var(--surface-base)"
          stroke={isAlarm ? "var(--amber-safety)" : "var(--border-mid)"}
          strokeWidth={isAlarm ? BORDER_W * 1.5 : BORDER_W}
          className={cn(isAlarm && "animate-[pulse-border_1.5s_ease-in-out_infinite]")}
        />

        {/* Liquid fill — animates via CSS transition on height/y */}
        <rect
          x={BORDER_W}
          y={fillY}
          width={GAUGE_W - BORDER_W * 2}
          height={fillH}
          fill="var(--status-flow)"
          style={{ transition: "y 0.2s ease, height 0.2s ease" }}
        />

        {/* High-level alarm stripe at 95% mark */}
        <line
          x1={BORDER_W}
          y1={alarmY}
          x2={GAUGE_W - BORDER_W}
          y2={alarmY}
          stroke="var(--amber-safety)"
          strokeWidth="0.75"
          strokeDasharray="2 2"
          opacity="0.6"
        />
      </svg>

      {/* RIGHT: metadata column */}
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* Tag / label */}
        <span
          className="truncate text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary"
          style={monoStyle}
        >
          {label}
        </span>

        {/* Fill percentage + live flow indicator */}
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[15px] font-medium tabular-nums leading-none",
              isAlarm ? "text-[var(--amber-safety)]" : "text-ink-primary",
            )}
            style={monoStyle}
          >
            {fillPercent.toFixed(0)}%
          </span>
          {outflow && <FlowIndicator dir="out" />}
          {inflow && <FlowIndicator dir="in" />}
          <ValueSourceBadge kind={ValueSourceKind.CALCULATED} compact />
        </span>

        <span className="text-[12px] font-medium tabular-nums text-ink-secondary" style={monoStyle}>
          {Math.round(level).toLocaleString("es-AR")} m³
        </span>

        {/* Temp · API line */}
        {tempApiLine !== null && (
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-ink-tertiary" style={monoStyle}>
            {tempApiLine}
            <ValueSourceBadge kind={ValueSourceKind.ENTERED} compact />
          </span>
        )}
      </div>
    </div>
  );
}
