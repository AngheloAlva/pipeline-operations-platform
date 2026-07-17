"use client";

/**
 * Custody differences report page (MV-18) — binational OTA↔OTC differences
 * per shipper for a selectable month, with month and year-to-date views,
 * from the seeded 12-month custody series.
 *
 * All aggregation lives in lib/volumetrics/custody.ts (pure); this page only
 * selects a period and renders. Reuses WaterfallChart (entries mode, MV-15)
 * for the per-shipper differences — same idiom as the cockpit CustodyDiffPanel,
 * which stays as the operational at-a-glance view.
 * "use client" required for the month/view selector state + store hooks.
 */

import { useMemo, useState } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { listAllocationMonths } from "@/lib/reports/allocation";
import {
  aggregateCustodyByShipper,
  custodyYearToDate,
  custodyToleranceBand,
  sumCustodyAggregates,
} from "@/lib/volumetrics/custody";
import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN } from "@/lib/domain";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import { buildWaterfallFromDeltas } from "@/lib/charts/waterfall";
import { WaterfallChart } from "@/components/cockpit/WaterfallChart";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ConceptInfo } from "@/components/shared/ConceptInfo";
import { ConceptHintBadge } from "@/components/shared/ConceptHintBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Formatting (es-CL, same discipline as CustodyDiffPanel)
// ---------------------------------------------------------------------------

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

const M3_FORMAT = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const PCT_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const TOL_FORMAT = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1 });

/** Semantic text tone per tolerance band (design tokens only). */
const BAND_TEXT: Record<ComplianceBand, string> = {
  ok: "text-status-ok",
  warning: "text-status-warning",
  critical: "text-status-critical",
};

/** Period views for this report: single month or year-to-date. */
type ReportPeriodView = "month" | "ytd";

const PERIOD_OPTIONS: { view: ReportPeriodView; label: string }[] = [
  { view: "month", label: "Mes" },
  { view: "ytd", label: "YTD" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustodyDifferencesReportPage() {
  const { world } = useWorldData();

  const months = useMemo(
    () => (world ? listAllocationMonths(world.custodyDifferences) : []),
    [world],
  );

  // Selected month — defaults to the latest seeded month.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = selectedMonth ?? months[0] ?? null;

  const [view, setView] = useState<ReportPeriodView>("month");

  const aggregates = useMemo(() => {
    if (!world || !month) return [];
    return view === "month"
      ? aggregateCustodyByShipper(world.custodyDifferences, month)
      : custodyYearToDate(world.custodyDifferences, month);
  }, [world, month, view]);

  const total = useMemo(() => sumCustodyAggregates(aggregates), [aggregates]);

  const shipperNameById = useMemo(
    () => new Map((world?.shippers ?? []).map((s) => [s.id, s.name])),
    [world],
  );

  const waterfallEntries = useMemo(
    () =>
      buildWaterfallFromDeltas(
        aggregates.map((aggregate) => ({
          shipperId: aggregate.shipperId,
          label: shipperNameById.get(aggregate.shipperId) ?? aggregate.shipperId,
          delta: aggregate.diffM3,
          band: custodyToleranceBand(aggregate.diffPct),
        })),
      ),
    [aggregates, shipperNameById],
  );

  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-[13px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
          Cargando datos…
        </span>
      </div>
    );
  }

  const totalBand = custodyToleranceBand(total.diffPct);
  const periodCaption =
    view === "month"
      ? `MES ${month ?? "—"}`
      : `YTD ${month?.slice(0, 4) ?? "—"} → ${month ?? "—"}`;

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
                Diferencias de Custodia
              </h1>
              <ConceptInfo term="cargador" label="Cargador" />
            </div>
            <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
              Puerto Hernández (OTA) → Terminal Concepción (OTC) · GSV 60 °F
            </p>
          </div>
          <ConceptHintBadge />
        </header>

        {/* Month selector + period toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="diff-month"
              className="text-[11px] uppercase tracking-[0.12em] text-ink-tertiary"
              style={MONO_STYLE}
            >
              Mes
            </label>
            <select
              id="diff-month"
              value={month ?? ""}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-border-mid bg-surface-overlay px-2 py-1 text-[12px] text-ink-primary"
              style={MONO_STYLE}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex" role="group" aria-label="Período">
            {PERIOD_OPTIONS.map((option) => {
              const active = option.view === view;
              return (
                <button
                  key={option.view}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(option.view)}
                  className={cn(
                    "border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
                    active
                      ? "border-accent bg-accent-dim text-accent"
                      : "border-border-mid text-ink-muted hover:border-accent hover:text-accent",
                  )}
                  style={MONO_STYLE}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {aggregates.length === 0 ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin datos de custodia para el período
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {/* Per-shipper reconciliation table */}
            <InstrumentBezel label="DIFERENCIAS POR CARGADOR" sublabel={periodCaption}>
              <div className="overflow-x-auto p-3">
                <table className="w-full border-collapse text-[13px]" style={MONO_STYLE}>
                  <thead>
                    <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Cargador
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Origen OTA (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Destino OTC (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Δ m³
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Δ %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregates.map((aggregate) => {
                      const band = custodyToleranceBand(aggregate.diffPct);
                      return (
                        <tr
                          key={aggregate.shipperId}
                          data-band={band}
                          className="border-b border-border-subtle"
                        >
                          <td className="px-2 py-2 text-left text-ink-secondary">
                            {shipperNameById.get(aggregate.shipperId) ?? aggregate.shipperId}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                            {M3_FORMAT.format(aggregate.originVolM3)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                            {M3_FORMAT.format(aggregate.destVolM3)}
                          </td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}>
                            {M3_FORMAT.format(aggregate.diffM3)}
                          </td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}>
                            {PCT_FORMAT.format(aggregate.diffPct)}%
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row — difference recomputed on the totals */}
                    <tr data-band={totalBand} className="border-t border-border-mid font-semibold">
                      <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-tertiary">
                        Total
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(total.originVolM3)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(total.destVolM3)}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[totalBand])}>
                        {M3_FORMAT.format(total.diffM3)}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[totalBand])}>
                        {PCT_FORMAT.format(total.diffPct)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
                {/* Tolerance legend */}
                <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-ink-muted" style={MONO_STYLE}>
                  Tolerancia: ±{TOL_FORMAT.format(BALANCE_TOLERANCE_OK)} % ok · ±
                  {TOL_FORMAT.format(BALANCE_TOLERANCE_WARN)} % advertencia · mayor crítico
                </p>
              </div>
            </InstrumentBezel>

            {/* Reuses WaterfallChart in entries mode (MV-15 generic props) */}
            <WaterfallChart
              entries={waterfallEntries}
              title="Diferencia por Cargador"
              unitLabel="Δ OTC − OTA · m³"
              concepts={[{ term: "cargador", label: "Cargador" }]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
