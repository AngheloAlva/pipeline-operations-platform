/**
 * Chart color palette for the Pipeline Operations Cockpit.
 * Mirrors the Sala de Control design tokens as JS hex/rgb strings.
 * Used in Recharts props — CSS var() is NOT usable there.
 * SR-009, SR-010, SR-015.
 *
 * IMPORTANT: No var(--...) strings in this file. All values are hex or rgb.
 */

// ============================================================================
// STATUS COLORS
// ============================================================================

/** Green — within compliance band or acceptable level. */
export const STATUS_OK = "#22c55e";

/** Amber — near the compliance boundary. */
export const STATUS_WARNING = "#f59e0b";

/** Red — outside compliance band or critical level. */
export const STATUS_CRITICAL = "#ef4444";

/** Blue — active flow telemetry. */
export const STATUS_FLOW = "#3b82f6";

// ============================================================================
// ALARM AND SAFETY
// ============================================================================

/** Alarm red — used for bars/elements representing danger or deficit. */
export const ALARM_RED = "#dc2626";

/** Amber safety — high-level tank warning, near-miss state. */
export const AMBER_SAFETY = "#d97706";

// ============================================================================
// DATA / TELEMETRY
// ============================================================================

/** Telemetry blue — liquid fill, flow rate, measured values. */
export const TELEMETRY_BLUE = "#60a5fa";

// ============================================================================
// TEXT / CHART AXES
// ============================================================================

/** Tertiary ink — used for axis labels and secondary annotations. */
export const INK_TERTIARY = "#6b7280";
