"use client";

/**
 * Allocation report page (MV-17) — per-shipper allocation of received (OTA)
 * and delivered (OTC) volumes for a selectable month, from the seeded
 * 12-month custody series.
 *
 * All aggregation lives in lib/reports/allocation.ts (pure); this page only
 * selects a month and renders. Reuses WaterfallChart (entries mode, MV-15)
 * for the per-shipper transit difference.
 * "use client" required for the month selector state + store hooks.
 */

import { useMemo, useState } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { listAllocationMonths, buildAllocationView } from "@/lib/reports/allocation";
import { custodyToleranceBand } from "@/lib/volumetrics/custody";
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
const SHARE_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Semantic text tone per tolerance band (design tokens only). */
const BAND_TEXT: Record<ComplianceBand, string> = {
  ok: "text-status-ok",
  warning: "text-status-warning",
  critical: "text-status-critical",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AllocationReportPage() {
  const { world } = useWorldData();

  const months = useMemo(
    () => (world ? listAllocationMonths(world.custodyDifferences) : []),
    [world],
  );

  // Selected month — defaults to the latest seeded month.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = selectedMonth ?? months[0] ?? null;

  const view = useMemo(
    () => (world && month ? buildAllocationView(world.custodyDifferences, month) : null),
    [world, month],
  );

  const shipperNameById = useMemo(
    () => new Map((world?.shippers ?? []).map((s) => [s.id, s.name])),
    [world],
  );

  const waterfallEntries = useMemo(
    () =>
      buildWaterfallFromDeltas(
        (view?.rows ?? []).map((row) => ({
          shipperId: row.shipperId,
          label: shipperNameById.get(row.shipperId) ?? row.shipperId,
          delta: row.diffM3,
          band: custodyToleranceBand(row.diffPct),
        })),
      ),
    [view, shipperNameById],
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

  const totalBand = view ? custodyToleranceBand(view.totalDiffPct) : "ok";

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
                Allocation por Cargador
              </h1>
              <ConceptInfo term="cargador" label="Cargador" />
            </div>
            <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
              Puerto Hernández (OTA) → Terminal Concepción (OTC) · GSV 60 °F
            </p>
          </div>
          <ConceptHintBadge />
        </header>

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="allocation-month"
            className="text-[11px] uppercase tracking-[0.12em] text-ink-tertiary"
            style={MONO_STYLE}
          >
            Mes
          </label>
          <select
            id="allocation-month"
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

        {!view || view.rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin datos de allocation para el período
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {/* Per-shipper allocation table */}
            <InstrumentBezel label="ALLOCATION MENSUAL" sublabel={`MES ${view.month}`}>
              <div className="overflow-x-auto p-3">
                <table className="w-full border-collapse text-[13px]" style={MONO_STYLE}>
                  <thead>
                    <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Cargador
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Recibido OTA (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Entregado OTC (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Participación
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
                    {view.rows.map((row) => {
                      const band = custodyToleranceBand(row.diffPct);
                      return (
                        <tr key={row.shipperId} data-band={band} className="border-b border-border-subtle">
                          <td className="px-2 py-2 text-left text-ink-secondary">
                            {shipperNameById.get(row.shipperId) ?? row.shipperId}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                            {M3_FORMAT.format(row.originVolM3)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                            {M3_FORMAT.format(row.destVolM3)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                            {SHARE_FORMAT.format(row.sharePct)}%
                          </td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}>
                            {M3_FORMAT.format(row.diffM3)}
                          </td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[band])}>
                            {PCT_FORMAT.format(row.diffPct)}%
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr data-band={totalBand} className="border-t border-border-mid font-semibold">
                      <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-tertiary">
                        Total
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(view.totalOriginM3)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(view.totalDestM3)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {SHARE_FORMAT.format(100)}%
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[totalBand])}>
                        {M3_FORMAT.format(view.totalDiffM3)}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", BAND_TEXT[totalBand])}>
                        {PCT_FORMAT.format(view.totalDiffPct)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </InstrumentBezel>

            {/* Right column — delivered share bars + transit-difference waterfall */}
            <div className="flex flex-col gap-3">
              <InstrumentBezel label="PARTICIPACIÓN ENTREGADA" sublabel="% DEL TOTAL OTC">
                <ul className="flex flex-col gap-2 p-3" aria-label="Participación entregada por cargador">
                  {view.rows.map((row) => (
                    <li key={row.shipperId} className="flex items-center gap-2">
                      <span
                        className="w-40 shrink-0 truncate text-[11px] uppercase tracking-[0.08em] text-ink-secondary"
                        style={MONO_STYLE}
                      >
                        {shipperNameById.get(row.shipperId) ?? row.shipperId}
                      </span>
                      <span className="h-3 flex-1 border border-border-subtle bg-surface-overlay">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${Math.min(100, Math.max(0, row.sharePct))}%` }}
                        />
                      </span>
                      <span
                        className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-primary"
                        style={MONO_STYLE}
                      >
                        {SHARE_FORMAT.format(row.sharePct)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </InstrumentBezel>

              {/* Reuses WaterfallChart in entries mode (MV-15 generic props) */}
              <WaterfallChart
                entries={waterfallEntries}
                title="Diferencia en tránsito"
                unitLabel="Δ OTC − OTA · m³"
                concepts={[{ term: "cargador", label: "Cargador" }]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
