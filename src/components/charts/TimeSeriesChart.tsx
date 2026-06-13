"use client";

/**
 * TimeSeriesChart — generic Recharts LineChart for time-based reading series.
 * SR-305: ResponsiveContainer inside a fixed-height parent div.
 * Y-axis: standard ascending, NO inversion (ADR-8).
 * Font: CHART_FONT_MONO resolved string — never CSS var() (phase-1 gotcha).
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TELEMETRY_BLUE,
  INK_TERTIARY,
  CHART_FONT_MONO,
} from "@/lib/charts/palette";
import type { ReadingSeriesPoint } from "@/lib/integrity/selectors";

// ============================================================================
// Types
// ============================================================================

/** A threshold reference line to render on the chart. */
export interface ThresholdLine {
  value: number;
  label: string;
  color: string;
}

export interface TimeSeriesChartProps {
  /** Sorted ascending time series. May be empty. */
  series: ReadingSeriesPoint[];
  /** Reference lines (cathodic thresholds etc.). */
  thresholds?: ThresholdLine[];
  /** Container height in px. Default 220. */
  height?: number;
  /** Text shown when series is empty. Default "No readings for this point". */
  emptyLabel?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function formatDate(value: unknown): string {
  if (value instanceof Date) return DATE_FMT.format(value);
  if (typeof value === "number") return DATE_FMT.format(new Date(value));
  return String(value);
}

// ============================================================================
// Component
// ============================================================================

/**
 * Generic Recharts time-series line chart.
 *
 * Uses ResponsiveContainer inside an explicit-height parent div (same pattern
 * as WaterfallChart). The SVG aspect-ratio recipe is for hand-rolled SVG only
 * (ADR-7). Recharts requires this wrapper.
 *
 * CHART_FONT_MONO is the resolved string value — not a CSS var() — because SVG
 * attribute context does not resolve CSS variables (phase-1 gotcha, SR-305 §7).
 */
export function TimeSeriesChart({
  series,
  thresholds = [],
  height = 220,
  emptyLabel = "No readings for this point",
}: TimeSeriesChartProps) {
  const isEmpty = series.length === 0;

  // Build chart data from ReadingSeriesPoint (Date → epoch ms for Recharts numeric axis)
  const data = series.map((pt) => ({
    timestamp: pt.timestamp instanceof Date ? pt.timestamp.getTime() : Number(pt.timestamp),
    potentialV: pt.potentialV,
  }));

  // Y-axis domain: min-0.05 to max+0.05 (standard ascending, no inversion)
  const potentials = data.map((d) => d.potentialV);
  const yMin = potentials.length > 0 ? Math.min(...potentials) - 0.05 : -1.2;
  const yMax = potentials.length > 0 ? Math.max(...potentials) + 0.05 : -0.7;

  return (
    <div style={{ height }} className="w-full">
      {isEmpty ? (
        <div
          className="flex h-full items-center justify-center"
          style={{ height }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.12em] text-ink-muted"
            style={{ fontFamily: CHART_FONT_MONO }}
          >
            {emptyLabel}
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="rgba(200,208,220,0.08)"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDate}
              tick={{
                fill: INK_TERTIARY,
                fontSize: 10,
                fontFamily: CHART_FONT_MONO,
              }}
              axisLine={{ stroke: "rgba(200,208,220,0.10)" }}
              tickLine={false}
            />
            <YAxis
              dataKey="potentialV"
              domain={[yMin, yMax]}
              tick={{
                fill: INK_TERTIARY,
                fontSize: 10,
                fontFamily: CHART_FONT_MONO,
              }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            {thresholds.map((t) => (
              <ReferenceLine
                key={`threshold-${t.value}`}
                y={t.value}
                stroke={t.color}
                strokeDasharray="4 2"
                label={{
                  value: t.label,
                  fill: t.color,
                  fontSize: 9,
                  fontFamily: CHART_FONT_MONO,
                  position: "insideTopRight",
                }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="potentialV"
              stroke={TELEMETRY_BLUE}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
