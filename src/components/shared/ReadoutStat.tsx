/**
 * ReadoutStat — instrument-grade numeric readout.
 * Pure presentational. No hooks. Renders label + value + optional unit + optional status lamp.
 */

import type { AlertLevel } from "@/lib/domain";

// ============================================================================
// TYPES
// ============================================================================

interface ReadoutStatProps {
  label: string;
  value: string | number;
  unit?: string;
  secondary?: string;
  status?: AlertLevel;
}

// ============================================================================
// LAMP VARIANT MAP
// ============================================================================

const LAMP_CLASS: Record<AlertLevel, string> = {
  OK: "mc-lamp mc-lamp--ok",
  WARNING: "mc-lamp mc-lamp--warning",
  CRITICAL: "mc-lamp mc-lamp--critical",
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ReadoutStat renders an instrument readout: uppercase micro-label,
 * mono tabular value, optional unit suffix, optional status lamp,
 * and an optional secondary / setpoint line.
 */
export function ReadoutStat({ label, value, unit, secondary, status }: ReadoutStatProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {/* Micro-label */}
      <div className="mc-readout__label">{label}</div>

      {/* Value row */}
      <div className="flex items-baseline gap-1.5">
        {status && (
          <span
            className={LAMP_CLASS[status]}
            role="img"
            aria-label={`Estado: ${status}`}
          />
        )}
        <span className="mc-readout__value mc-readout__value--sm tabular-nums">{value}</span>
        {unit && <span className="mc-readout__unit">{unit}</span>}
      </div>

      {/* Secondary / setpoint */}
      {secondary && <div className="mc-readout__secondary">{secondary}</div>}
    </div>
  );
}
