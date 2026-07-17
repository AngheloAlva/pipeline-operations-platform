"use client";

/**
 * Presupuesto vs Real report page (MV-17) — monthly budget vs program vs
 * actual series from the seeded 12-month VolumeTarget totals.
 *
 * All aggregation lives in lib/reports/budget.ts (pure); this page only
 * renders the series: comparative chart + monthly table with tolerance-toned
 * compliance and a closed-months total row.
 * "use client" required for the world store hook.
 */

import { useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { buildBudgetVsRealSeries, sumBudgetVsRealClosed } from "@/lib/reports/budget";
import type { ComplianceBand } from "@/lib/volumetrics/compliance";
import { BudgetVsRealChart } from "@/components/reports/BudgetVsRealChart";
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
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Semantic text tone per tolerance band (design tokens only). */
const BAND_TEXT: Record<ComplianceBand, string> = {
  ok: "text-status-ok",
  warning: "text-status-warning",
  critical: "text-status-critical",
};

/** Placeholder for months without a closed real. */
const NO_VALUE = "—";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BudgetVsRealReportPage() {
  const { world } = useWorldData();

  const rows = useMemo(
    () => (world ? buildBudgetVsRealSeries(world.volumeTargets) : []),
    [world],
  );

  const total = useMemo(() => sumBudgetVsRealClosed(rows), [rows]);

  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-[13px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
          Cargando datos…
        </span>
      </div>
    );
  }

  const isEmpty = rows.length === 0;

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
                Presupuesto vs Real
              </h1>
              <ConceptInfo term="presupuesto" label="Presupuesto" />
              <ConceptInfo term="programa" label="Programa" />
              <ConceptInfo term="cumplimiento" label="Cumplimiento" />
            </div>
            <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
              Serie mensual · volumen total transportado · m³
            </p>
          </div>
          <ConceptHintBadge />
        </header>

        {isEmpty ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin serie de presupuesto en el período
            </p>
          </div>
        ) : (
          <>
            {/* Comparative monthly chart */}
            <InstrumentBezel label="SERIE MENSUAL" sublabel="PPTO · PROGRAMA · REAL">
              <div className="p-3">
                <BudgetVsRealChart rows={rows} />
              </div>
            </InstrumentBezel>

            {/* Monthly detail table */}
            <InstrumentBezel label="DETALLE POR MES" sublabel={`${rows.length} MESES`}>
              <div className="overflow-x-auto p-3">
                <table className="w-full border-collapse text-[13px]" style={MONO_STYLE}>
                  <thead>
                    <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Mes
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Ppto (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Programa (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Real (m³)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Cumpl. Ppto
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Δ vs Ppto (m³)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.period}
                        data-band={row.band ?? "none"}
                        className="border-b border-border-subtle"
                      >
                        <td className="px-2 py-2 text-left text-ink-secondary">{row.period}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                          {M3_FORMAT.format(row.budgetM3)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                          {M3_FORMAT.format(row.programM3)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                          {row.realM3 !== null ? M3_FORMAT.format(row.realM3) : NO_VALUE}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            row.band !== null ? BAND_TEXT[row.band] : "text-ink-muted",
                          )}
                        >
                          {row.cumplimientoPresupuestoPct !== null
                            ? `${PCT_FORMAT.format(row.cumplimientoPresupuestoPct)}%`
                            : NO_VALUE}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            row.band !== null ? BAND_TEXT[row.band] : "text-ink-muted",
                          )}
                        >
                          {row.varianceM3 !== null ? M3_FORMAT.format(row.varianceM3) : NO_VALUE}
                        </td>
                      </tr>
                    ))}
                    {/* Closed-months total row */}
                    <tr
                      data-band={total.band ?? "none"}
                      className="border-t border-border-mid font-semibold"
                    >
                      <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-tertiary">
                        Total ({total.closedMonths} meses cerrados)
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(total.budgetM3)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(total.programM3)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {M3_FORMAT.format(total.realM3)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          total.band !== null ? BAND_TEXT[total.band] : "text-ink-muted",
                        )}
                      >
                        {total.closedMonths > 0
                          ? `${PCT_FORMAT.format(total.cumplimientoPresupuestoPct)}%`
                          : NO_VALUE}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          total.band !== null ? BAND_TEXT[total.band] : "text-ink-muted",
                        )}
                      >
                        {total.closedMonths > 0 ? M3_FORMAT.format(total.varianceM3) : NO_VALUE}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {/* Tolerance legend + open-months note */}
                <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-ink-muted" style={MONO_STYLE}>
                  Tolerancia de cumplimiento: 95–105 % ok · 90–110 % advertencia · fuera crítico
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-ink-muted" style={MONO_STYLE}>
                  — indica mes sin cierre operativo: cumplimiento y desviación se calculan solo
                  sobre meses cerrados
                </p>
              </div>
            </InstrumentBezel>
          </>
        )}
      </div>
    </div>
  );
}
