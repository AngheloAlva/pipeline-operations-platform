"use client";

/**
 * TankGauge — SVG instrument for a single tank.
 * SR-006: animated liquid-fill rect, high-level alarm at >=95%, no store subscription.
 * SR-015: borders-only (no radius, no shadow), Geist Mono numeric readouts.
 * Driven by parent via per-tank selector output — does NOT subscribe to store directly.
 */

import { cn } from "@/lib/cn";
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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GAUGE_W = 48;
const GAUGE_H = 80;
const BORDER_W = 1.5;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * TankGauge — instrument-aesthetic SVG gauge.
 * Fill transitions smoothly via CSS transition on the rect transform.
 * Amber border + pulse at TANK_HIGH_LEVEL_ALARM (>=95%).
 */
export function TankGauge({ tankId, level, capacity, label, className }: TankGaugeProps) {
  const ratio = capacity > 0 ? Math.max(0, Math.min(1, level / capacity)) : 0;
  const fillPercent = ratio * 100;
  const isAlarm = ratio >= TANK_HIGH_LEVEL_ALARM;

  // Fill rect — grows from bottom. SVG y=0 is top.
  const fillH = (GAUGE_H - BORDER_W * 2) * ratio;
  const fillY = GAUGE_H - BORDER_W - fillH;

  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)} data-tank-id={tankId}>
      {/* Tank label */}
      <span
        className="text-[9px] font-medium uppercase tracking-[0.1em] text-ink-tertiary"
        style={monoStyle}
      >
        {label}
      </span>

      {/* SVG Gauge body */}
      <svg
        width={GAUGE_W}
        height={GAUGE_H}
        viewBox={`0 0 ${GAUGE_W} ${GAUGE_H}`}
        aria-label={`Tanque ${label}: ${fillPercent.toFixed(0)}%${isAlarm ? " — Alarma nivel alto" : ""}`}
        role="img"
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
        {(() => {
          const alarmY = GAUGE_H - BORDER_W - (GAUGE_H - BORDER_W * 2) * TANK_HIGH_LEVEL_ALARM;
          return (
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
          );
        })()}
      </svg>

      {/* Percentage readout */}
      <span
        className={cn(
          "text-[10px] tabular-nums leading-none",
          isAlarm ? "text-[var(--amber-safety)]" : "text-ink-secondary",
        )}
        style={monoStyle}
      >
        {fillPercent.toFixed(0)}%
      </span>
    </div>
  );
}
