/**
 * Chart color palette for the Pipeline Operations Cockpit.
 * Mirrors the Sala de Control design tokens for Recharts props.
 * Semantic data colors stay as JS values; theme-aware chart surfaces use CSS variables.
 * SR-009, SR-010, SR-015.
 *
 * Theme-aware surface and typography exports use CSS variables because Recharts
 * resolves them in SVG props; semantic data colors remain stable JS values.
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

/** Tertiary ink — legacy fixed color for charts without theme-aware surfaces. */
export const INK_TERTIARY = "#6b7280";

/** Theme-aware chart text, grid, neutral bar, tooltip, and cursor surfaces. */
export const CHART_AXIS = "var(--ink-tertiary)";
export const CHART_GRID = "var(--border-mid)";
export const CHART_BUDGET_BAR = "var(--ink-secondary)";
export const CHART_TOOLTIP = "var(--surface-overlay)";
export const CHART_TOOLTIP_BORDER = "var(--border-mid)";
export const CHART_CURSOR = "var(--accent-dim)";
export const CHART_FLOW = "var(--status-flow)";

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Resolved monospace font stack for Recharts tick/axis props.
 * Do NOT use var(--font-mono) here — SVG attribute context does not resolve CSS vars.
 */
export const CHART_FONT_MONO = "'Geist Mono', monospace";
