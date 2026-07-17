"use client";

/**
 * Pipeline stoppages report page (MV-18) — the seeded stoppage events with
 * per-month totals (count + hours) and a responsible-side breakdown.
 *
 * All aggregation lives in lib/reports/stoppages.ts (pure); this page only
 * renders. Months without events are omitted — the seed is sparse and the
 * report never fabricates zero months.
 * "use client" required for the world store hook.
 */

import { useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import type { StoppageResponsible } from "@/lib/domain";
import {
  buildStoppageMonthlySeries,
  summarizeStoppagesByResponsible,
  sortStoppagesByStartDesc,
  sumStoppages,
} from "@/lib/reports/stoppages";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";

// ---------------------------------------------------------------------------
// Formatting (es-CL, same discipline as the other report pages)
// ---------------------------------------------------------------------------

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

const HOURS_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const SHARE_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** UI labels per responsible side. */
const RESPONSIBLE_LABEL: Record<StoppageResponsible, string> = {
  OTA: "OTA",
  OTC: "OTC",
  BOTH: "Ambas",
};

/** "2026-05-10T08:00:00.000Z" → "2026-05-10 08:00" (UTC, deterministic). */
function formatStart(startedAt: string): string {
  return `${startedAt.slice(0, 10)} ${startedAt.slice(11, 16)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelineStoppagesReportPage() {
  const { world } = useWorldData();

  const stoppages = useMemo(() => world?.pipelineStoppages ?? [], [world]);

  const monthly = useMemo(() => buildStoppageMonthlySeries(stoppages), [stoppages]);
  const byResponsible = useMemo(
    () => summarizeStoppagesByResponsible(stoppages),
    [stoppages],
  );
  const events = useMemo(() => sortStoppagesByStartDesc(stoppages), [stoppages]);
  const total = useMemo(() => sumStoppages(stoppages), [stoppages]);

  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-[13px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
          Cargando datos…
        </span>
      </div>
    );
  }

  const isEmpty = stoppages.length === 0;

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header>
          <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
          <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
            Detenciones de Línea
          </h1>
          <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
            Eventos de detención del poliducto · horas detenidas por mes y responsable
          </p>
        </header>

        {isEmpty ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin detenciones registradas en el período
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {/* Monthly totals */}
              <InstrumentBezel label="DETENCIONES POR MES" sublabel={`${monthly.length} MESES CON EVENTOS`}>
                <div className="overflow-x-auto p-3">
                  <table
                    className="w-full border-collapse text-[13px]"
                    style={MONO_STYLE}
                    aria-label="Detenciones por mes"
                  >
                    <thead>
                      <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                        <th scope="col" className="px-2 py-2 text-left font-medium">
                          Mes
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          Eventos
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          Horas detenidas
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((row) => (
                        <tr key={row.period} className="border-b border-border-subtle">
                          <td className="px-2 py-2 text-left text-ink-secondary">{row.period}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                            {row.count}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                            {HOURS_FORMAT.format(row.totalHours)}
                          </td>
                        </tr>
                      ))}
                      {/* Overall totals row */}
                      <tr className="border-t border-border-mid font-semibold">
                        <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-tertiary">
                          Total
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                          {total.count}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                          {HOURS_FORMAT.format(total.totalHours)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {/* Sparse-months note: months without events are omitted on purpose */}
                  <p
                    className="mt-2 text-[10px] uppercase tracking-[0.08em] text-ink-muted"
                    style={MONO_STYLE}
                  >
                    Los meses sin eventos de detención no se listan
                  </p>
                </div>
              </InstrumentBezel>

              {/* Responsible-side breakdown */}
              <InstrumentBezel label="POR RESPONSABLE" sublabel="% DE HORAS DETENIDAS">
                <ul className="flex flex-col gap-2 p-3" aria-label="Horas por responsable">
                  {byResponsible.map((row) => (
                    <li key={row.responsible} className="flex items-center gap-2">
                      <span
                        className="w-16 shrink-0 text-[11px] uppercase tracking-[0.08em] text-ink-secondary"
                        style={MONO_STYLE}
                      >
                        {RESPONSIBLE_LABEL[row.responsible]}
                      </span>
                      <span className="h-3 flex-1 border border-border-subtle bg-surface-overlay">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${Math.min(100, Math.max(0, row.sharePct))}%` }}
                        />
                      </span>
                      <span
                        className="w-32 shrink-0 text-right text-[11px] tabular-nums text-ink-primary"
                        style={MONO_STYLE}
                      >
                        {HOURS_FORMAT.format(row.totalHours)} h · {SHARE_FORMAT.format(row.sharePct)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <p
                  className="px-3 pb-3 text-[10px] uppercase tracking-[0.08em] text-ink-muted"
                  style={MONO_STYLE}
                >
                  Ambas = responsabilidad compartida OTA/OTC
                </p>
              </InstrumentBezel>
            </div>

            {/* Event list */}
            <InstrumentBezel label="EVENTOS" sublabel={`${events.length} REGISTROS`}>
              <div className="overflow-x-auto p-3">
                <table
                  className="w-full border-collapse text-[13px]"
                  style={MONO_STYLE}
                  aria-label="Eventos de detención"
                >
                  <thead>
                    <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Período
                      </th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Inicio (UTC)
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Horas
                      </th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Responsable
                      </th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Causa
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id} className="border-b border-border-subtle">
                        <td className="px-2 py-2 text-left text-ink-secondary">{event.period}</td>
                        <td className="px-2 py-2 text-left tabular-nums text-ink-secondary">
                          {formatStart(event.startedAt)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                          {HOURS_FORMAT.format(event.durationHours)}
                        </td>
                        <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-secondary">
                          {RESPONSIBLE_LABEL[event.responsible]}
                        </td>
                        <td className="px-2 py-2 text-left text-ink-secondary">{event.cause}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </InstrumentBezel>
          </>
        )}
      </div>
    </div>
  );
}
