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
  ResponsiveContainer,
} from "recharts";
import { groupBalanceByHour } from "@/lib/volumetrics/balance";
import type { HourlyBalance } from "@/lib/volumetrics/balance";
import type { Movement } from "@/lib/domain";
import {
  TELEMETRY_BLUE,
  ALARM_RED,
  INK_TERTIARY,
  STATUS_OK,
  CHART_FONT_MONO,
} from "@/lib/charts/palette";
import { ConceptInfo } from "@/components/shared/ConceptInfo";
import { useCaptureStore } from "@/store/captureStore";

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
        className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.12em]"
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
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BalancePanel renders a grouped bar chart with hourly inflow / outflow / net stock change.
 * Data is memoized on `movements` — does not recompute on every render cycle.
 * SR-009.
 */
export function BalancePanel({ movements }: BalancePanelProps) {
  const propagation = useCaptureStore((state) => state.lastPropagation);
  // Memoized hourly data — SR-009 req 3
  const hourlyData: HourlyBalance[] = useMemo(
    () => groupBalanceByHour(movements),
    [movements],
  );

  const isEmpty = hourlyData.length === 0;

  return (
    <section
      className="relative flex flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Balance Horario"
    >
      {propagation?.highlightBalance && (
        <span
          key={propagation.sequence}
          aria-hidden="true"
          className="capture-propagation-highlight pointer-events-none absolute inset-0 z-10"
        />
      )}
      {/* Panel header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2
            className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Balance Horario
          </h2>
          <ConceptInfo term="balance-volumetrico" label="Balance Horario" />
        </div>
        <span
          className="text-[12px] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          m³ · UTC
        </span>
      </header>

      {/* Chart — SR-009 req 1. flex-1 so it fills the panel height (the panel is
          grid-stretched to the taller Context column); min height guards narrow/single-col. */}
      <div className="relative min-h-48 w-full flex-1">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p
              className="text-[12px] uppercase tracking-[0.12em] text-ink-muted"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Sin datos de balance horario
            </p>
          </div>
        ) : (
          // absolute inset-0 gives ResponsiveContainer a concrete-sized parent at
          // first paint, avoiding the Recharts width/height(-1) warning that a bare
          // flex-1 child triggers before the flex layout resolves.
          <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyData}
              barCategoryGap="30%"
              barGap={2}
              margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: CHART_FONT_MONO }}
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
                tick={{ fill: COLORS.axis, fontSize: 10, fontFamily: CHART_FONT_MONO }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(200,208,220,0.04)" }} />
              {/* SR-009 req 1: grouped bars for entradas / salidas / Δstock */}
              <Bar dataKey="entradas" name="Entradas" fill={COLORS.entradas} radius={0} />
              <Bar dataKey="salidas" name="Salidas" fill={COLORS.salidas} radius={0} />
              <Bar dataKey="deltaStock" name="Stock" fill={COLORS.delta} radius={0} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Custom legend — each series carries a ConceptInfo affordance so the
          volumetric jargon (entradas / salidas / Δstock) is explainable inline. */}
      <ul className="flex flex-wrap items-center justify-center gap-4">
        {[
          { name: "Entradas", color: COLORS.entradas, term: "entradas" },
          { name: "Salidas", color: COLORS.salidas, term: "salidas" },
          { name: "Δ Stock", color: COLORS.delta, term: "delta-stock" },
        ].map((item) => (
          <li
            key={item.term}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]"
            style={{ fontFamily: "var(--font-mono), monospace", color: "var(--ink-tertiary)" }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0"
              style={{ background: item.color }}
            />
            {item.name}
            <ConceptInfo term={item.term} label={item.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
