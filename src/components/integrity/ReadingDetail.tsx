"use client";

/**
 * ReadingDetail — TimeSeriesChart panel for the selected cathodic point. SR-309.
 *
 * Reads selectedEntityId + selectedEntityType from useSelection().
 * Only renders chart when selectedEntityType === EntityType.CATHODIC_POINT.
 * Threshold lines: CATHODIC_OK (-0.85 V) and CATHODIC_WARN (-0.75 V) from constants.
 * Placeholder text when no CATHODIC_POINT is selected.
 */

import dynamic from "next/dynamic";
import { useSelection, EntityType } from "@/store/selectionStore";
import { CrossNavLinks } from "@/components/shared/CrossNavLinks";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import type { ResolvedEntity } from "@/lib/domain/resolveEntity";
// CRITICAL-4: TimeSeriesChart uses ResponsiveContainer which measures a DOM
// element during SSR and gets width=-1 → hydration flash. Import dynamically
// with ssr:false since the chart is client-only interactive content.
const TimeSeriesChart = dynamic(
  () =>
    import("@/components/charts/TimeSeriesChart").then(
      (m) => m.TimeSeriesChart,
    ),
  {
    ssr: false,
    loading: () => <div style={{ height: 220 }} className="w-full" aria-hidden="true" />,
  },
);
import type { ThresholdLine } from "@/components/charts/TimeSeriesChart";
import { extractReadingSeriesForChart, pointKey } from "@/lib/integrity/selectors";
import { CATHODIC_OK, CATHODIC_WARN } from "@/lib/domain/constants";
import { STATUS_OK, STATUS_WARNING } from "@/lib/charts/palette";
import type { PipelineWorld } from "@/lib/domain";

// ============================================================================
// Constants
// ============================================================================

/** Threshold lines always passed to TimeSeriesChart for integrity context. */
const INTEGRITY_THRESHOLDS: ThresholdLine[] = [
  { value: CATHODIC_OK, label: `Protected (${CATHODIC_OK}V)`, color: STATUS_OK },
  { value: CATHODIC_WARN, label: `Marginal (${CATHODIC_WARN}V)`, color: STATUS_WARNING },
];

// ============================================================================
// Props
// ============================================================================

export interface ReadingDetailProps {
  world: PipelineWorld;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Detail panel showing the potential history for the selected cathodic point.
 *
 * Selection is read directly from useSelection() — not from props — so this
 * panel stays in sync with PipelineMap and ReadingsTable automatically.
 * When no CATHODIC_POINT is selected, a placeholder is shown.
 */
export function ReadingDetail({ world }: ReadingDetailProps) {
  const { selectedEntityId, selectedEntityType } = useSelection();

  // Derive active point key only for CATHODIC_POINT selections
  const selectedPointKey =
    selectedEntityType === EntityType.CATHODIC_POINT && selectedEntityId
      ? selectedEntityId
      : null;

  if (!selectedPointKey) {
    return (
      <InstrumentBezel label="HISTORIAL DE POTENCIAL">
        <div
          className="flex items-center justify-center px-4"
          style={{ height: 220 }}
          aria-label="Cathodic point detail"
        >
          <p
            className="text-[12px] uppercase tracking-[0.12em] text-ink-muted"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Seleccione un punto en el mapa o la tabla para ver su historial
          </p>
        </div>
      </InstrumentBezel>
    );
  }

  const series = extractReadingSeriesForChart(
    world.cathodicReadings,
    selectedPointKey,
  );

  // Build ResolvedEntity for CrossNavLinks — find the matching reading to get stationId.
  // The cathodic point's stationId may be undefined; coerce to null per spec (ADR-4).
  // CRITICAL-3 guard: use pointKey() helper (rounds km via Math.round(km*10)/10)
  // so float drift on r.km never silently fails the match.
  // selectedPointKey itself is produced via pointKey() upstream (selection store),
  // so both sides are guaranteed to use the same rounding.
  const matchedReading = world.cathodicReadings.find(
    (r) => pointKey(r.km, r.segmentId) === selectedPointKey,
  );
  const cathodicEntity: ResolvedEntity = {
    id: selectedPointKey,
    type: EntityType.CATHODIC_POINT,
    stationId: matchedReading?.stationId ?? null,
  };

  return (
    <InstrumentBezel
      label="HISTORIAL DE POTENCIAL"
      sublabel={`PUNTO ${selectedPointKey}`}
    >
      <div aria-label={`Cathodic point detail — ${selectedPointKey}`}>
        <div className="p-4">
          <TimeSeriesChart
            series={series}
            thresholds={INTEGRITY_THRESHOLDS}
            height={220}
            emptyLabel="Sin lecturas para este punto"
          />
        </div>

        {/* F4-3-R5: cross-module navigation — exclude integrity (current module).
            CrossNavLinks auto-omits cockpit/maintenance links when stationId is null. */}
        <div className="px-4 pb-4">
          <CrossNavLinks entity={cathodicEntity} exclude={["integrity"]} />
        </div>
      </div>
    </InstrumentBezel>
  );
}
