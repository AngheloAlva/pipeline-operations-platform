"use client";

/**
 * BudgetVsRealChart — monthly comparative bars: presupuesto (neutral) vs real
 * (colored per tolerance band), with the programa series as a dashed line.
 * MV-17. Same Recharts recipe as WaterfallChart: ResponsiveContainer inside a
 * fixed-height parent, palette constants only (no CSS var() in Recharts props).
 */

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BudgetVsRealRow } from "@/lib/reports/budget";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import {
  STATUS_OK,
  STATUS_WARNING,
  ALARM_RED,
  TELEMETRY_BLUE,
  INK_TERTIARY,
  CHART_FONT_MONO,
} from "@/lib/charts/palette";

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
  budgetBar: "rgba(139,139,145,0.35)",
  tooltip: "#1e2229",
  tooltipBorder: "rgba(200,208,220,0.14)",
} as const;

// ============================================================================
// HELPERS
// ============================================================================

const MONTH_FMT = new Intl.DateTimeFormat("es-CL", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "2026-05" → "may 26" (es-CL short month). */
function formatPeriod(period: string): string {
  return MONTH_FMT.format(new Date(`${period}-01T00:00:00Z`));
}

const M3_FORMAT = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

// ============================================================================
// TOOLTIP
// ============================================================================

interface ChartDatum extends BudgetVsRealRow {
  label: string;
}

interface TooltipPayloadEntry {
  payload: ChartDatum;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div
      className="border p-3 min-w-[160px]"
      style={{
        backgroundColor: COLORS.tooltip,
        borderColor: COLORS.tooltipBorder,
        borderRadius: 0,
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
      }}
    >
      <p
        className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.12em]"
        style={{ color: INK_TERTIARY }}
      >
        {label}
      </p>
      <p style={{ color: INK_TERTIARY }}>Ppto: {M3_FORMAT.format(data.budgetM3)} m³</p>
      <p style={{ color: TELEMETRY_BLUE }}>Programa: {M3_FORMAT.format(data.programM3)} m³</p>
      {data.realM3 !== null && data.band !== null ? (
        <p style={{ color: BAND_COLOR[data.band] }}>
          Real: {M3_FORMAT.format(data.realM3)} m³
        </p>
      ) : (
        <p style={{ color: INK_TERTIARY }}>Real: sin cierre</p>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export interface BudgetVsRealChartProps {
  /** Monthly series, ascending by period (buildBudgetVsRealSeries output). */
  rows: BudgetVsRealRow[];
}

/**
 * Comparative monthly chart: budget bar (neutral) + real bar (band-toned) +
 * program dashed line. Months without a closed real render only budget/program.
 */
export function BudgetVsRealChart({ rows }: BudgetVsRealChartProps) {
  const data = useMemo<ChartDatum[]>(
    () => rows.map((row) => ({ ...row, label: formatPeriod(row.period) })),
    [rows],
  );

  const isEmpty = data.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Series legend */}
      <div
        className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-ink-muted"
        style={{ fontFamily: "var(--font-mono), monospace" }}
        aria-hidden="true"
      >
        <span>■ Presupuesto</span>
        <span className="text-accent">— Programa</span>
        <span>■ Real (tono según tolerancia)</span>
      </div>

      <div className="h-64 w-full">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p
              className="text-[12px] uppercase tracking-[0.12em] text-ink-muted"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Sin serie de presupuesto
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: CHART_FONT_MONO }}
                axisLine={{ stroke: COLORS.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: CHART_FONT_MONO }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(200,208,220,0.04)" }} />
              {/* Budget — neutral reference bar */}
              <Bar dataKey="budgetM3" name="Presupuesto" fill={COLORS.budgetBar} radius={0} />
              {/* Real — band-toned bar (null months skipped by Recharts) */}
              <Bar dataKey="realM3" name="Real" radius={0}>
                {data.map((entry, index) => (
                  <Cell
                    key={`real-${entry.period}-${index}`}
                    fill={entry.band ? BAND_COLOR[entry.band] : "transparent"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
              {/* Program — dashed telemetry line */}
              <Line
                type="monotone"
                dataKey="programM3"
                name="Programa"
                stroke={TELEMETRY_BLUE}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
