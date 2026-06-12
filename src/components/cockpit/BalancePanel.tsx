"use client";

/**
 * BalancePanel — Recharts BarChart showing hourly entradas / salidas / Δstock.
 * SR-009: grouped bars, memoized data, Sala de Control palette (no CSS vars in props).
 * UI copy: Spanish. Instrument aesthetic: hairline frame, no radius.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { groupBalanceByHour } from "@/lib/volumetrics/balance";
import type { HourlyBalance } from "@/lib/volumetrics/balance";
import type { Movement } from "@/lib/domain";
import {
  TELEMETRY_BLUE,
  ALARM_RED,
  STATUS_WARNING,
  INK_TERTIARY,
  STATUS_OK,
} from "@/lib/charts/palette";

// ============================================================================
// CHART COLORS (JS values — Recharts ignores CSS var() in inline styles)
// ============================================================================

const COLORS = {
  entradas: TELEMETRY_BLUE,
  salidas: ALARM_RED,
  delta: STATUS_OK,
  axis: INK_TERTIARY,
  grid: "rgba(200,208,220,0.08)",
  tooltip: "#1e2229",
  tooltipBorder: "rgba(200,208,220,0.14)",
  legendText: INK_TERTIARY,
} as const;

// ============================================================================
// LABEL FORMATTER
// ============================================================================

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

function formatM3(value: number): string {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })} m³`;
}

// ============================================================================
// TOOLTIP CONTENT
// ============================================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="border p-3"
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
        Hora {String(label).padStart(2, "0")}:00
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.name}: {formatM3(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ============================================================================
// PROPS
// ============================================================================

export interface BalancePanelProps {
  movements: Movement[];
  tankIds: ReadonlySet<string>;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BalancePanel renders a grouped bar chart with hourly inflow / outflow / net stock change.
 * Data is memoized on `movements` and `tankIds` — does not recompute on every render cycle.
 * SR-009.
 */
export function BalancePanel({ movements, tankIds }: BalancePanelProps) {
  // Memoized hourly data — SR-009 req 3
  const hourlyData: HourlyBalance[] = useMemo(
    () => groupBalanceByHour(movements, tankIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movements, tankIds],
  );

  return (
    <section
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Balance Horario"
    >
      {/* Panel header */}
      <header className="flex items-center justify-between">
        <h2
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Balance Horario
        </h2>
        <span
          className="text-[10px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          m³ · UTC
        </span>
      </header>

      {/* Chart — SR-009 req 1 */}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={hourlyData}
            barCategoryGap="30%"
            barGap={2}
            margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke={COLORS.grid}
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: "var(--font-mono), monospace" }}
              axisLine={{ stroke: COLORS.grid }}
              tickLine={false}
              label={{
                value: "Hora",
                position: "insideBottom",
                offset: -2,
                fill: COLORS.axis,
                fontSize: 10,
              }}
            />
            <YAxis
              tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: "var(--font-mono), monospace" }}
              axisLine={false}
              tickLine={false}
              width={60}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(200,208,220,0.04)" }}
            />
            <Legend
              wrapperStyle={{
                fontSize: 10,
                fontFamily: "var(--font-mono), monospace",
                color: COLORS.legendText,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                paddingTop: 4,
              }}
            />
            {/* SR-009 req 1: grouped bars for entradas / salidas / Δstock */}
            <Bar dataKey="entradas" name="Entradas" fill={COLORS.entradas} radius={0} />
            <Bar dataKey="salidas" name="Salidas" fill={COLORS.salidas} radius={0} />
            <Bar dataKey="deltaStock" name="Δ Stock" fill={COLORS.delta} radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
