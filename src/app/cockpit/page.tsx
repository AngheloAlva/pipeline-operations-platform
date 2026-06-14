"use client";

/**
 * Cockpit page — Mission Control command-deck layout.
 * Composition: CommandRail → AnnunciatorPanel → schematic deck → analytics deck.
 * The CommandRail carries the sim clock + transport (play/pause/speed), replacing
 * the former SimControls bottom bar and the SimClock sub-header.
 *
 * Data wiring (unchanged):
 *   - useSimulationLoop mounted once here (SR-004).
 *   - useFocusSync syncs ?focus= ↔ selectionStore (F4-1, ADR-1) — requires Suspense
 *     because it uses useSearchParams (CSR bailout without a boundary).
 *   - store.init(world) once world is ready (SR-003).
 * "use client" required for hooks. Metadata lives in cockpit/layout.tsx (SR-008 req 7).
 */

import { Suspense, useEffect, useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { useSimulationStore } from "@/store/simulationStore";
import { useSimulationLoop } from "@/hooks/useSimulationLoop";
import { useSelectionStore } from "@/store/selectionStore";
import { useFocusSync } from "@/hooks/useFocusSync";
import { CockpitSkeleton } from "@/components/ui/Skeleton";

import { CommandRail } from "@/components/cockpit/CommandRail";
import { AnnunciatorPanel } from "@/components/cockpit/AnnunciatorPanel";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";

import { PkRuler } from "@/components/ui/PkRuler";
import { FlowDiagram } from "@/components/cockpit/FlowDiagram";
import { BalancePanel } from "@/components/cockpit/BalancePanel";
import { ContextPanel } from "@/components/cockpit/ContextPanel";
import { WaterfallChart } from "@/components/cockpit/WaterfallChart";
import { ConversionWidget } from "@/components/cockpit/ConversionWidget";

// ============================================================================
// PAGE BODY (inside Suspense — useFocusSync uses useSearchParams)
// ============================================================================

/**
 * CockpitPageBody — inner body requiring Suspense for useSearchParams.
 * Mounts the simulation loop and the ?focus= ↔ selectionStore sync, then renders
 * the command-deck composition wrapped in the `.mc-deck` chrome.
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
      <div className="flex min-h-screen items-center justify-center">
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
    <div className="mc-deck min-h-screen">
      {/* Row 1 — CommandRail (sticky under header) */}
      <div className="sticky top-0 z-30">
        <CommandRail world={world} />
      </div>

      <div className="mx-auto max-w-panel space-y-1.5 px-4 py-2 sm:px-6">
        {/* PRIMARY DECK — annunciator + schematic + telemetry read as one viewport */}
        <div className="space-y-1.5">
          {/* Row 2 — Annunciator matrix (own zone, full width) */}
          <AnnunciatorPanel world={world} />

          {/* Row 3 — Schematic (wide) + Telemetry rail (narrow) */}
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[1fr_336px]">
            {/* LEFT — Flow schematic */}
            <InstrumentBezel
              label="ESQUEMÁTICO DE FLUJO"
              sublabel="LA PROGRESIVA · PK 0 → TERMINAL"
              scanlines
            >
              <div className="p-2 space-y-1">
                <PkRuler pipeline={world.pipeline} stations={world.stations} />
                <FlowDiagram world={world} />
              </div>
            </InstrumentBezel>

            {/* RIGHT — Telemetry / detail rail */}
            <div className="flex flex-col gap-1.5">
              <InstrumentBezel label="DETALLE">
                <ContextPanel world={world} />
              </InstrumentBezel>
              <InstrumentBezel label="CONVERSIÓN">
                <ConversionWidget selectedNodeId={selectedEntityId} />
              </InstrumentBezel>
            </div>
          </div>
        </div>

        {/* Row 4 — Analytics (below the primary deck) */}
        <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
          <InstrumentBezel label="BALANCE HORARIO">
            <BalancePanel movements={world.movements} />
          </InstrumentBezel>
          <InstrumentBezel label="CUMPLIMIENTO POR SHIPPER">
            <WaterfallChart inputs={waterfallInputs} />
          </InstrumentBezel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE EXPORT (thin Suspense shell — F4-1-R5, ADR-1)
// ============================================================================

/**
 * CockpitPage — Suspense shell required for useSearchParams in useFocusSync.
 */
export default function CockpitPage() {
  return (
    <Suspense fallback={<CockpitSkeleton />}>
      <CockpitPageBody />
    </Suspense>
  );
}
