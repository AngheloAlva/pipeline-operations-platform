"use client";

/**
 * Cockpit page — full SR-013 layout.
 * SR-013: CockpitKPIs → PkRuler → FlowDiagram → (BalancePanel + ContextPanel) → WaterfallChart.
 *         SimControls in sticky bottom bar.
 * SR-014: useSimulationLoop mounted once here; per-tank selectors in TankNode (inside FlowDiagram).
 * "use client" required for hooks (useWorldData, useSimulationStore).
 * Metadata is in cockpit/layout.tsx — NOT here (SR-008 req 7, SR-013 req 6).
 * F4-1: CockpitPageBody wrapped in <Suspense> — required because useFocusSync uses
 *        useSearchParams which triggers CSR bailout without a Suspense boundary.
 */

import { Suspense, useEffect, useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { useSimulationStore } from "@/store/simulationStore";
import { useSimulationLoop } from "@/hooks/useSimulationLoop";
import { useSelectionStore } from "@/store/selectionStore";
import { useFocusSync } from "@/hooks/useFocusSync";

import { CockpitKPIs } from "@/components/cockpit/CockpitKPIs";
import { PkRuler } from "@/components/ui/PkRuler";
import { FlowDiagram } from "@/components/cockpit/FlowDiagram";
import { BalancePanel } from "@/components/cockpit/BalancePanel";
import { ContextPanel } from "@/components/cockpit/ContextPanel";
import { WaterfallChart } from "@/components/cockpit/WaterfallChart";
import { ConversionWidget } from "@/components/cockpit/ConversionWidget";
import { SimControls } from "@/components/cockpit/SimControls";

// ============================================================================
// PAGE BODY (inside Suspense boundary — useFocusSync uses useSearchParams)
// ============================================================================

/**
 * CockpitPageBody — inner body requiring Suspense for useSearchParams.
 * Mounts useFocusSync to synchronize ?focus= URL param with selectionStore.
 */
function CockpitPageBody() {
  const { world } = useWorldData();
  const init = useSimulationStore((state) => state.init);
  const selectedEntityId = useSelectionStore((state) => state.selectedEntityId);

  // F4-1: bidirectional ?focus= ↔ selectionStore sync — ADR-1
  useFocusSync();

  // Mount rAF simulation loop once at page level — SR-004
  useSimulationLoop();

  // Initialize store from world seed once world is ready — SR-003
  useEffect(() => {
    if (world) init(world);
  }, [world, init]);

  // Derive WaterfallChart inputs from volumeTargets + shippers
  const waterfallInputs = useMemo(() => {
    if (!world) return [];
    return world.shippers.map((shipper) => {
      const targets = world.volumeTargets.filter((vt) => vt.shipperId === shipper.id);
      const real = targets.reduce((sum, t) => sum + (t.realM3 ?? 0), 0);
      const programa = targets.reduce((sum, t) => sum + t.programM3, 0);
      const presupuesto = targets.reduce((sum, t) => sum + t.budgetM3, 0);
      return { shipperId: shipper.id, name: shipper.name, real, programa, presupuesto };
    });
  }, [world]);

  // Loading state — world is always ready (bundled seed), but guard for type safety
  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span
          className="text-[13px] uppercase tracking-[0.12em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Cargando datos del oleoducto…
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col">
      {/* Main content — scrollable */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-panel space-y-2 px-4 py-4 sm:px-6">
          {/* 1. KPI row — SR-013 req 1 */}
          <CockpitKPIs world={world} />

          {/* 2. PkRuler — SR-013 req 4 */}
          <PkRuler pipeline={world.pipeline} stations={world.stations} />

          {/* 3. FlowDiagram — SR-013 req 1 */}
          <FlowDiagram world={world} />

          {/* 4. Side-by-side: BalancePanel + (ContextPanel + ConversionWidget) — SR-013 req 1 */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_320px]">
            <BalancePanel movements={world.movements} />
            <div className="flex flex-col gap-2">
              <ContextPanel world={world} />
              <ConversionWidget selectedNodeId={selectedEntityId} />
            </div>
          </div>

          {/* 5. WaterfallChart — SR-013 req 1 */}
          <WaterfallChart inputs={waterfallInputs} />
        </div>
      </div>

      {/* Sticky bottom bar — SimControls — SR-013 req 2 */}
      <div className="sticky bottom-0 z-30">
        <SimControls />
      </div>
    </div>
  );
}

// ============================================================================
// PAGE EXPORT (thin Suspense shell — F4-1-R5, ADR-1)
// ============================================================================

/**
 * CockpitPage — Suspense shell required for useSearchParams in useFocusSync.
 * fallback={null} so there is no layout shift while params hydrate.
 */
export default function CockpitPage() {
  return (
    <Suspense fallback={null}>
      <CockpitPageBody />
    </Suspense>
  );
}
