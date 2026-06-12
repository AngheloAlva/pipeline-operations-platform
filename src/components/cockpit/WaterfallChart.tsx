"use client";

/**
 * WaterfallChart — TRUE per-shipper cumulative delta waterfall.
 * SR-010: ComposedChart + Bar + Cell (invisible base + visible delta).
 * UI copy: Spanish. Color constants from SR-015 palette (no CSS vars in Recharts props).
 */

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { buildWaterfallData } from "@/lib/charts/waterfall";
import type { WaterfallEntry, WaterfallInput } from "@/lib/charts/waterfall";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import { STATUS_OK, ALARM_RED, STATUS_WARNING, INK_TERTIARY } from "@/lib/charts/palette";

// ============================================================================
// CHART COLORS
// ============================================================================

/** Map ComplianceBand → Recharts fill color (JS value, SR-015 req 6). */
const BAND_COLOR: Record<ComplianceBand, string> = {
  ok: STATUS_OK,
  warning: STATUS_WARNING,
  critical: ALARM_RED,
};

const COLORS = {
  axis: INK_TERTIARY,
  grid: "rgba(200,208,220,0.08)",
  invisible: "transparent",
  referenceLine: "rgba(200,208,220,0.20)",
  tooltip: "#1e2229",
  tooltipBorder: "rgba(200,208,220,0.14)",
  zeroLine: "rgba(200,208,220,0.28)",
} as const;

// ============================================================================
// TOOLTIP
// ============================================================================

interface TooltipPayloadEntry {
  payload: WaterfallEntry & { displayDelta: number };
  dataKey: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function formatM3(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })} m³`;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  // Find the delta entry (not the base)
  const entry = payload.find((p) => p.dataKey === "displayDelta");
  if (!entry) return null;

  const data = entry.payload;
  const color = BAND_COLOR[data.band];

  return (
    <div
      className="border p-3 min-w-[140px]"
      style={{
        backgroundColor: COLORS.tooltip,
        borderColor: COLORS.tooltipBorder,
        borderRadius: 0,
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
      }}
    >
      <p
        className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: INK_TERTIARY }}
      >
        {label}
      </p>
      <p style={{ color }}>Delta: {formatM3(data.waterfallDelta)}</p>
    </div>
  );
}

// ============================================================================
// PROPS
// ============================================================================

export interface WaterfallChartProps {
  inputs: WaterfallInput[];
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * WaterfallChart renders a TRUE waterfall per shipper.
 * Uses ComposedChart + stacked Bars: invisible `base` + visible `displayDelta`.
 * Cell colors map compliance band to palette constants.
 * SR-010.
 */
export function WaterfallChart({ inputs }: WaterfallChartProps) {
  // Memoize waterfall data — includes cumulative bases
  const data = useMemo(() => {
    const entries = buildWaterfallData(inputs);
    // Recharts stacked Bar needs two separate dataKeys.
    // `base` = invisible stack base; `displayDelta` = visible bar.
    // For negative deltas, we need to handle them as absolute values stacked from base.
    return entries.map((e) => ({
      ...e,
      // displayDelta is always the absolute value — direction handled by base position
      // For a proper waterfall with negatives we use the signed waterfallDelta directly,
      // and set the base to the lower of (base + delta, base).
      waterfallBase: e.waterfallDelta >= 0 ? e.base : e.base + e.waterfallDelta,
      displayDelta: Math.abs(e.waterfallDelta),
    }));
  }, [inputs]);

  const isEmpty = data.length === 0;

  return (
    <section
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Cumplimiento por Cargador"
    >
      {/* Panel header */}
      <header className="flex items-center justify-between">
        <h2
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Cumplimiento por Cargador
        </h2>
        <span
          className="text-[10px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Δreal − programa · m³
        </span>
      </header>

      {/* Chart */}
      <div className="h-56 w-full">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p
              className="text-[10px] uppercase tracking-[0.12em] text-ink-muted"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Sin datos de cargadores
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{
                  fill: COLORS.axis,
                  fontSize: 10,
                  fontFamily: "var(--font-mono), monospace",
                }}
                axisLine={{ stroke: COLORS.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{
                  fill: COLORS.axis,
                  fontSize: 10,
                  fontFamily: "var(--font-mono), monospace",
                }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(200,208,220,0.04)" }} />
              {/* Zero reference line */}
              <ReferenceLine y={0} stroke={COLORS.zeroLine} strokeWidth={1} />
              {/* Invisible base bar — creates the floating effect */}
              <Bar dataKey="waterfallBase" stackId="waterfall" fill={COLORS.invisible} radius={0} />
              {/* Visible delta bar — colored per compliance band (SR-010 req 2–4) */}
              <Bar dataKey="displayDelta" stackId="waterfall" radius={0} name="Delta vs Programa">
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${entry.shipperId}-${index}`}
                    fill={BAND_COLOR[entry.band]}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
