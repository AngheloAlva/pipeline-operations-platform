"use client";

/**
 * Environment (GHG emissions) report page (MV-18) — per-month tCO₂e series
 * with breakdowns by GHG Protocol scope and by emission source, from the
 * seeded 12-month emission entries.
 *
 * All aggregation lives in lib/reports/emissions.ts (pure); this page only
 * renders. Scopes without entries in a month show the placeholder — sparse
 * seed months are never fabricated.
 * "use client" required for the world store hook.
 */

import { useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { EmissionScope } from "@/lib/domain";
import {
  buildEmissionMonthlySeries,
  summarizeEmissionsByScope,
  summarizeEmissionsBySource,
} from "@/lib/reports/emissions";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";

// ---------------------------------------------------------------------------
// Formatting (es-CL, same discipline as the other report pages)
// ---------------------------------------------------------------------------

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

const TONS_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const SHARE_FORMAT = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Placeholder for scopes without entries in a month. */
const NO_VALUE = "—";

/** UI labels per GHG Protocol scope. */
const SCOPE_LABEL: Record<EmissionScope, string> = {
  [EmissionScope.SCOPE_1]: "Alcance 1",
  [EmissionScope.SCOPE_2]: "Alcance 2",
  [EmissionScope.SCOPE_3]: "Alcance 3",
};

const SCOPE_COLUMNS: EmissionScope[] = [
  EmissionScope.SCOPE_1,
  EmissionScope.SCOPE_2,
  EmissionScope.SCOPE_3,
];

// ---------------------------------------------------------------------------
// Breakdown list (scope / source share bars — same idiom as allocation)
// ---------------------------------------------------------------------------

interface BreakdownListProps {
  ariaLabel: string;
  rows: { key: string; label: string; totalTons: number; sharePct: number }[];
}

function BreakdownList({ ariaLabel, rows }: BreakdownListProps) {
  return (
    <ul className="flex flex-col gap-2 p-3" aria-label={ariaLabel}>
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-2">
          <span
            className="w-44 shrink-0 truncate text-[11px] uppercase tracking-[0.08em] text-ink-secondary"
            style={MONO_STYLE}
            title={row.label}
          >
            {row.label}
          </span>
          <span className="h-3 flex-1 border border-border-subtle bg-surface-overlay">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, row.sharePct))}%` }}
            />
          </span>
          <span
            className="w-40 shrink-0 text-right text-[11px] tabular-nums text-ink-primary"
            style={MONO_STYLE}
          >
            {TONS_FORMAT.format(row.totalTons)} tCO₂e · {SHARE_FORMAT.format(row.sharePct)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EnvironmentReportPage() {
  const { world } = useWorldData();

  const entries = useMemo(() => world?.emissionEntries ?? [], [world]);

  const monthly = useMemo(() => buildEmissionMonthlySeries(entries), [entries]);
  const byScope = useMemo(() => summarizeEmissionsByScope(entries), [entries]);
  const bySource = useMemo(() => summarizeEmissionsBySource(entries), [entries]);

  const totals = useMemo(() => {
    const byScopeTotals = new Map(byScope.map((row) => [row.key, row.totalTons]));
    return {
      byScope: byScopeTotals,
      grandTotal: byScope.reduce((sum, row) => sum + row.totalTons, 0),
    };
  }, [byScope]);

  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-[13px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
          Cargando datos…
        </span>
      </div>
    );
  }

  const isEmpty = entries.length === 0;

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header>
          <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
          <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
            Medio Ambiente
          </h1>
          <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
            Emisiones de gases de efecto invernadero · tCO₂e · Protocolo GHG
          </p>
        </header>

        {isEmpty ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin registros de emisiones en el período
            </p>
          </div>
        ) : (
          <>
            {/* Monthly series with per-scope columns */}
            <InstrumentBezel label="EMISIONES POR MES" sublabel={`${monthly.length} MESES`}>
              <div className="overflow-x-auto p-3">
                <table
                  className="w-full border-collapse text-[13px]"
                  style={MONO_STYLE}
                  aria-label="Emisiones por mes"
                >
                  <thead>
                    <tr className="border-b border-border-mid text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
                      <th scope="col" className="px-2 py-2 text-left font-medium">
                        Mes
                      </th>
                      {SCOPE_COLUMNS.map((scope) => (
                        <th key={scope} scope="col" className="px-2 py-2 text-right font-medium">
                          {SCOPE_LABEL[scope]} (tCO₂e)
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Total (tCO₂e)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr key={row.period} className="border-b border-border-subtle">
                        <td className="px-2 py-2 text-left text-ink-secondary">{row.period}</td>
                        {SCOPE_COLUMNS.map((scope) => (
                          <td
                            key={scope}
                            className="px-2 py-2 text-right tabular-nums text-ink-secondary"
                          >
                            {row.byScope[scope] !== 0
                              ? TONS_FORMAT.format(row.byScope[scope])
                              : NO_VALUE}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                          {TONS_FORMAT.format(row.totalTons)}
                        </td>
                      </tr>
                    ))}
                    {/* Overall totals row */}
                    <tr className="border-t border-border-mid font-semibold">
                      <td className="px-2 py-2 text-left uppercase tracking-[0.08em] text-ink-tertiary">
                        Total
                      </td>
                      {SCOPE_COLUMNS.map((scope) => {
                        const scopeTotal = totals.byScope.get(scope);
                        return (
                          <td
                            key={scope}
                            className="px-2 py-2 text-right tabular-nums text-ink-primary"
                          >
                            {scopeTotal !== undefined ? TONS_FORMAT.format(scopeTotal) : NO_VALUE}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right tabular-nums text-ink-primary">
                        {TONS_FORMAT.format(totals.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </InstrumentBezel>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {/* Scope breakdown */}
              <InstrumentBezel label="POR ALCANCE" sublabel="% DEL TOTAL">
                <BreakdownList
                  ariaLabel="Emisiones por alcance"
                  rows={byScope.map((row) => ({
                    ...row,
                    label: SCOPE_LABEL[row.key as EmissionScope] ?? row.key,
                  }))}
                />
              </InstrumentBezel>

              {/* Source breakdown */}
              <InstrumentBezel label="POR FUENTE" sublabel="% DEL TOTAL">
                <BreakdownList
                  ariaLabel="Emisiones por fuente"
                  rows={bySource.map((row) => ({ ...row, label: row.key }))}
                />
              </InstrumentBezel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
