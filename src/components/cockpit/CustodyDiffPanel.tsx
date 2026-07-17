"use client";

/**
 * CustodyDiffPanel — binational OTA↔OTC custody-difference panel (MV-15).
 * Per-shipper table: origin volume (Puerto Hernández / OTA, GSV 60°F) vs
 * destination (Terminal Concepción / OTC), difference in m³ and %, switchable
 * between day / month / YTD, plus a per-shipper difference waterfall.
 *
 * All aggregation lives in lib/volumetrics/custody.ts (pure); this component
 * only selects a view and renders. Anchored to the sim day like the hero
 * custody chip, with the same fallback to the latest seeded month.
 * UI copy: Spanish. Instrument aesthetic: hairline frame, mono type, no radius.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CustodyDifference, Shipper } from "@/lib/domain";
import {
  custodyViewAggregates,
  custodyToleranceBand,
  sumCustodyAggregates,
} from "@/lib/volumetrics/custody";
import { BALANCE_TOLERANCE_OK, BALANCE_TOLERANCE_WARN } from "@/lib/domain";
import type { CustodyPeriodView } from "@/lib/volumetrics/custody";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import { buildWaterfallFromDeltas } from "@/lib/charts/waterfall";
import { WaterfallChart } from "@/components/cockpit/WaterfallChart";
import { useSimulationStore } from "@/store/simulationStore";
import { ConceptInfo } from "@/components/shared/ConceptInfo";
import { cn } from "@/lib/cn";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Anchor id the hero custody chip navigates to (MV-15 cross-nav). */
export const CUSTODY_DIFF_ANCHOR = "descuadre-binacional";

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

const M3_FORMAT = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const PCT_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const TOL_FORMAT = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1 });

/** Period toggle options — UI copy in Spanish. */
const PERIOD_OPTIONS: { view: CustodyPeriodView; label: string }[] = [
  { view: "day", label: "Día" },
  { view: "month", label: "Mes" },
  { view: "ytd", label: "YTD" },
];

/** Semantic text tone per tolerance band (design tokens only). */
const BAND_TEXT: Record<ComplianceBand, string> = {
  ok: "text-status-ok",
  warning: "text-status-warning",
  critical: "text-status-critical",
};

// ============================================================================
// PROPS
// ============================================================================

export interface CustodyDiffPanelProps {
  custodyDifferences: CustodyDifference[];
  shippers: Shipper[];
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CustodyDiffPanel renders the OTA↔OTC reconciliation per shipper: a
 * tolerance-toned table (±0.5 % ok / ±1.0 % warning / beyond critical) and a
 * waterfall of the per-shipper differences for the selected period.
 */
export function CustodyDiffPanel({ custodyDifferences, shippers }: CustodyDiffPanelProps) {
  const [view, setView] = useState<CustodyPeriodView>("month");

  // Simulated day (YYYY-MM-DD) — same anchor the hero custody chip uses.
  const simDay = useSimulationStore((s) => new Date(s.simulatedTime).toISOString().slice(0, 10));

  const custodyView = useMemo(
    () => custodyViewAggregates(custodyDifferences, view, simDay),
    [custodyDifferences, view, simDay],
  );

  const shipperNameById = useMemo(
    () => new Map(shippers.map((s) => [s.id, s.name])),
    [shippers],
  );

  const total = useMemo(() => sumCustodyAggregates(custodyView.aggregates), [custodyView]);

  const waterfallEntries = useMemo(
    () =>
      buildWaterfallFromDeltas(
        custodyView.aggregates.map((aggregate) => ({
          shipperId: aggregate.shipperId,
          label: shipperNameById.get(aggregate.shipperId) ?? aggregate.shipperId,
          delta: aggregate.diffM3,
          band: custodyToleranceBand(aggregate.diffPct),
        })),
      ),
    [custodyView, shipperNameById],
  );

  const isEmpty = custodyView.aggregates.length === 0;

  // Period caption: honest about the daily-average fallback (monthly seed).
  const periodCaption =
    view === "day"
      ? custodyView.dailyAverage
        ? `Promedio diario · ${custodyView.month ?? "—"}`
        : `Día ${simDay}`
      : view === "month"
        ? `Mes ${custodyView.month ?? "—"}`
        : `YTD ${custodyView.month?.slice(0, 4) ?? "—"} → ${custodyView.month ?? "—"}`;

  return (
    <section
      className="flex flex-col gap-3 border border-border-mid bg-surface-raised p-4"
      aria-label="Descuadre Binacional OTA↔OTC"
    >
      {/* Panel header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2
            className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
            style={MONO_STYLE}
          >
            Descuadre Binacional
          </h2>
          <ConceptInfo term="cargador" label="Cargador" />
        </div>
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-ink-muted" style={MONO_STYLE}>
            Puerto Hernández (OTA) → Terminal Concepción (OTC) · GSV 60 °F
          </span>
          {/* Cross-nav to the full self-service report (MV-18) */}
          <Link
            href="/reportes/diferencias"
            className="text-[11px] uppercase tracking-[0.12em] text-ink-muted transition-colors hover:text-accent"
            style={MONO_STYLE}
          >
            Ver reporte completo →
          </Link>
        </span>
      </header>

      {/* Period toggle + caption */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted" style={MONO_STYLE}>
          {periodCaption}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex h-32 items-center justify-center">
          <p
            className="text-[12px] uppercase tracking-[0.12em] text-ink-muted"
            style={MONO_STYLE}
          >
            Sin datos de custodia
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {/* Per-shipper reconciliation table */}
          <div className="overflow-x-auto">
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
                {custodyView.aggregates.map((aggregate) => {
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
                      <td
                        className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}
                      >
                        {M3_FORMAT.format(aggregate.diffM3)}
                      </td>
                      <td
                        className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}
                      >
                        {PCT_FORMAT.format(aggregate.diffPct)}%
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                {(() => {
                  const totalBand = custodyToleranceBand(total.diffPct);
                  return (
                    <tr
                      data-band={totalBand}
                      className="border-t border-border-mid text-[13px] font-semibold"
                    >
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
                  );
                })()}
              </tbody>
            </table>
            {/* Tolerance legend */}
            <p
              className="mt-2 text-[10px] uppercase tracking-[0.08em] text-ink-muted"
              style={MONO_STYLE}
            >
              Tolerancia: ±{TOL_FORMAT.format(BALANCE_TOLERANCE_OK)} % ok · ±
              {TOL_FORMAT.format(BALANCE_TOLERANCE_WARN)} % advertencia · mayor crítico
            </p>
          </div>

          {/* Waterfall of per-shipper differences — reuses WaterfallChart (SR-010) */}
          <WaterfallChart
            entries={waterfallEntries}
            title="Descuadre por Cargador"
            unitLabel="Δ OTC − OTA · m³"
            concepts={[{ term: "cargador", label: "Cargador" }]}
          />
        </div>
      )}
    </section>
  );
}
