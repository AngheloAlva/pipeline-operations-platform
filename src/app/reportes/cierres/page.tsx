"use client";

/**
 * Monthly closings report page (MV-18) — per-area closing comments grouped
 * by period, most recent month first, from the seeded 12-month series.
 *
 * All grouping lives in lib/reports/closings.ts (pure); this page only
 * resolves author names and renders. Comments without an author render
 * without one — nothing is fabricated.
 * "use client" required for the world store hook.
 */

import { useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { groupClosingsByPeriod } from "@/lib/reports/closings";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";

// ---------------------------------------------------------------------------
// Formatting (same discipline as the other report pages)
// ---------------------------------------------------------------------------

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClosingCommentsReportPage() {
  const { world } = useWorldData();

  const groups = useMemo(
    () => groupClosingsByPeriod(world?.closingComments ?? []),
    [world],
  );

  const operatorNameById = useMemo(
    () => new Map((world?.operators ?? []).map((o) => [o.id, o.name])),
    [world],
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

  const isEmpty = groups.length === 0;

  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header>
          <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
          <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
            Cierres del Mes
          </h1>
          <p className="mt-1 text-[12px] text-ink-muted" style={MONO_STYLE}>
            Comentarios de cierre mensual por área · más reciente primero
          </p>
        </header>

        {isEmpty ? (
          <div className="flex h-40 items-center justify-center border border-border-mid bg-surface-raised">
            <p className="text-[12px] uppercase tracking-[0.12em] text-ink-muted" style={MONO_STYLE}>
              Sin comentarios de cierre en el período
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <InstrumentBezel
              key={group.period}
              label={`CIERRE ${group.period}`}
              sublabel={`${group.comments.length} ÁREAS`}
            >
              <div className="p-3">
                <h2 className="sr-only">Cierre {group.period}</h2>
                <ul
                  className="flex flex-col divide-y divide-border-subtle"
                  aria-label={`Cierre ${group.period}`}
                >
                  {group.comments.map((comment) => (
                    <li key={comment.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span
                          className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
                          style={MONO_STYLE}
                        >
                          {comment.area}
                        </span>
                        {comment.authorId !== undefined && (
                          <span className="text-[11px] text-ink-muted" style={MONO_STYLE}>
                            {operatorNameById.get(comment.authorId) ?? comment.authorId}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink-secondary">
                        {comment.comment}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </InstrumentBezel>
          ))
        )}
      </div>
    </div>
  );
}
