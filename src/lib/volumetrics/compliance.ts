/**
 * Per-shipper compliance computation.
 * SR-002 — No side effects, no store imports, no React dependencies.
 */

// ============================================================================
// COMPLIANCE BAND THRESHOLDS (SR-002 req 3)
// ============================================================================

/** Inclusive lower bound of the "ok" compliance band (%). */
const BAND_OK_MIN = 95;
/** Inclusive upper bound of the "ok" compliance band (%). */
const BAND_OK_MAX = 105;
/** Inclusive lower bound of the "warning" compliance band (%). */
const BAND_WARN_MIN = 90;
/** Inclusive upper bound of the "warning" compliance band (%). */
const BAND_WARN_MAX = 110;

// ============================================================================
// TYPES
// ============================================================================

/** Compliance band category. */
export type ComplianceBand = "ok" | "warning" | "critical";

/** Input for computeCompliance. */
export interface ComplianceInput {
  shipperId: string;
  /** Real executed volume in m³. */
  real: number;
  /** Programmed (latest revision) volume in m³. */
  programa: number;
  /** Budget volume in m³. */
  presupuesto: number;
}

/** Output of computeCompliance. SR-002 req 2. */
export interface ComplianceRow {
  shipperId: string;
  real: number;
  programa: number;
  presupuesto: number;
  /** real / programa × 100 */
  cumplimientoPrograma: number;
  /** real / presupuesto × 100 */
  cumplimientoPresupuesto: number;
  band: ComplianceBand;
  /** real − programa (signed; negative = behind program). SR-002 req 4. */
  waterfallDelta: number;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function safePercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

function classifyBand(
  cumplimientoPrograma: number,
  cumplimientoPresupuesto: number
): ComplianceBand {
  const inOk =
    cumplimientoPrograma >= BAND_OK_MIN &&
    cumplimientoPrograma <= BAND_OK_MAX &&
    cumplimientoPresupuesto >= BAND_OK_MIN &&
    cumplimientoPresupuesto <= BAND_OK_MAX;

  if (inOk) return "ok";

  const inWarn =
    cumplimientoPrograma >= BAND_WARN_MIN &&
    cumplimientoPrograma <= BAND_WARN_MAX &&
    cumplimientoPresupuesto >= BAND_WARN_MIN &&
    cumplimientoPresupuesto <= BAND_WARN_MAX;

  if (inWarn) return "warning";

  return "critical";
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute compliance row for a single shipper.
 * SR-002.
 */
export function computeCompliance(input: ComplianceInput): ComplianceRow {
  const { shipperId, real, programa, presupuesto } = input;

  const cumplimientoPrograma = safePercent(real, programa);
  const cumplimientoPresupuesto = safePercent(real, presupuesto);
  const band = classifyBand(cumplimientoPrograma, cumplimientoPresupuesto);
  const waterfallDelta = real - programa;

  return {
    shipperId,
    real,
    programa,
    presupuesto,
    cumplimientoPrograma,
    cumplimientoPresupuesto,
    band,
    waterfallDelta,
  };
}
