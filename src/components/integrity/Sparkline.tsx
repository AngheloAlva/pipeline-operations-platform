/**
 * Sparkline — inline SVG polyline micro-trend component.
 * SR-304: stateless, no "use client", no Recharts (ADR-3).
 * Per-group y-normalization from own series min/max.
 * Flat center line when min===max (all readings at same potential).
 * <2 points renders empty polyline without throwing.
 */

import { STATUS_CRITICAL, TELEMETRY_BLUE } from "@/lib/charts/palette";
import type { ReadingSeriesPoint } from "@/lib/integrity/selectors";

// ============================================================================
// Props (flat interface — TypeScript SKILL)
// ============================================================================

export interface SparklineProps {
  /** Sorted ascending reading series. May be empty or length 1. */
  series: ReadingSeriesPoint[];
  /** SVG width in px. Default 48. */
  width?: number;
  /** SVG height in px. Default 16. */
  height?: number;
  /** When true, render in STATUS_CRITICAL color; default is TELEMETRY_BLUE. */
  degrading?: boolean;
  /** Accessible label for the <svg> element. */
  label?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Inline SVG sparkline for the cathodic readings trend column.
 * Pure presentational — no state, no client APIs (no "use client").
 * Y-normalization is per-instance: maps this series' min/max to [0, height].
 * Lower (more negative) potentialV → higher SVG y-coordinate (visual bottom).
 */
export function Sparkline({
  series,
  width = 48,
  height = 16,
  degrading = false,
  label,
}: SparklineProps) {
  const stroke = degrading ? STATUS_CRITICAL : TELEMETRY_BLUE;
  const ariaLabel = label ?? "Potential reading sparkline";

  // <2 points → empty polyline (no throw per SR-304 §5)
  let points = "";

  if (series.length >= 2) {
    const potentials = series.map((pt) => pt.potentialV);
    const minY = Math.min(...potentials);
    const maxY = Math.max(...potentials);
    const range = maxY - minY;

    points = series
      .map((pt, i) => {
        const x = (i / (series.length - 1)) * width;
        // When min===max, render a flat center line (height / 2)
        const y =
          range === 0
            ? height / 2
            : // Map potentialV to SVG y: lower potential (more negative) → larger y (visual bottom)
              // minY maps to height (bottom), maxY maps to 0 (top)
              height - ((pt.potentialV - minY) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", overflow: "visible" }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
