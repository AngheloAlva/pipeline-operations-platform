"use client";

/**
 * Integrity page — cathodic protection dashboard. SR-311.
 *
 * Composes four panels in a responsive grid:
 *   Row 1 (full-width): PipelineMap (F3-1)
 *   Row 2 (3-col): IntegrityKpis (1 col) | ReadingsTable (2 cols)
 *   Row 3 (full-width): ReadingDetail (F3-4)
 *
 * World data via useWorldData(). Selection via useSelection().
 * No metadata export — lives in layout.tsx per SR-310.
 * No simulationStore / maintenanceStore / useSimulationLoop imports (SR-312 §3).
 * No Tabs component (SR-312 §5).
 * F4-1: IntegrityPageBody wrapped in <Suspense> — required because useFocusSync uses
 *        useSearchParams which triggers CSR bailout without a Suspense boundary.
 */

import { Suspense } from "react";
import { IntegritySkeleton } from "@/components/ui/Skeleton";
import { useWorldData } from "@/hooks/useWorldData";
import { useSelection, EntityType } from "@/store/selectionStore";
import { useFocusSync } from "@/hooks/useFocusSync";
import { PipelineMap } from "@/components/integrity/PipelineMap";
import { IntegrityKpis } from "@/components/integrity/IntegrityKpis";
import { ReadingsTable } from "@/components/integrity/ReadingsTable";
import { ReadingDetail } from "@/components/integrity/ReadingDetail";

// ---------------------------------------------------------------------------
// Page body (inside Suspense boundary — useFocusSync uses useSearchParams)
// ---------------------------------------------------------------------------

/**
 * IntegrityPageBody — inner body requiring Suspense for useSearchParams.
 * Mounts useFocusSync to synchronize ?focus= URL param with selectionStore.
 */
function IntegrityPageBody() {
  const { world } = useWorldData();
  const { selectedEntityId, selectedEntityType } = useSelection();

  // F4-1: bidirectional ?focus= ↔ selectionStore sync — ADR-1
  useFocusSync();

  // Derive selectedPointKey from selection store (pass-down pattern per SR-311 §4)
  const selectedPointKey =
    selectedEntityType === EntityType.CATHODIC_POINT ? selectedEntityId : null;

  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span
          className="text-[13px] uppercase tracking-[0.12em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Cargando datos…
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-panel px-4 py-4 sm:px-6 flex flex-col gap-4">
      {/* Row 1: PipelineMap — full width (F3-1) */}
      <section>
        <PipelineMap world={world} selectedPointKey={selectedPointKey} />
      </section>

      {/* Row 2: IntegrityKpis (1 col) + ReadingsTable (2 cols) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* KPI panel — 1 column */}
        <div className="lg:col-span-1">
          <IntegrityKpis world={world} />
        </div>

        {/* Readings table — 2 columns */}
        <div className="lg:col-span-2">
          <ReadingsTable world={world} />
        </div>
      </section>

      {/* Row 3: ReadingDetail — full width (F3-4) */}
      <section>
        <ReadingDetail world={world} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (thin Suspense shell — F4-1-R5, ADR-1)
// ---------------------------------------------------------------------------

/**
 * IntegrityPage — Suspense shell required for useSearchParams in useFocusSync.
 * fallback={null} so there is no layout shift while params hydrate.
 */
export default function IntegrityPage() {
  return (
    <Suspense fallback={<IntegritySkeleton />}>
      <IntegrityPageBody />
    </Suspense>
  );
}
