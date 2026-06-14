"use client";

/**
 * Maintenance page — tab composition (SR-212).
 *
 * Renders: MaintenanceKpis (always visible) → Tabs (Tablero/Calendario/Órdenes)
 *          → active tab panel (MaintenanceBoard / MaintenanceCalendar / WorkOrderList).
 * Tab state from maintenanceStore.activeTab (SR-212 §4).
 * now = real-world date (NOT simulatedTime) — threaded from page (design ADR-6).
 * No metadata export — lives in layout.tsx (SR-212 §5 / SR-211 §3).
 * No simulationStore import (SR-212 §6 / SR-213 §1).
 * F4-1: MaintenancePageBody wrapped in <Suspense> — required because useFocusSync uses
 *        useSearchParams which triggers CSR bailout without a Suspense boundary.
 *        onFocusStation syncs activeBoardFilter when the arriving entity's station changes
 *        without cross-store imports (ADR-5, ADR-7).
 */

import { Suspense, useCallback, useMemo } from "react";
import { MaintenanceSkeleton } from "@/components/ui/Skeleton";
import { useWorldData } from "@/hooks/useWorldData";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { useFocusSync } from "@/hooks/useFocusSync";
import { Tabs } from "@/components/ui/Tabs";
import { MaintenanceKpis } from "@/components/maintenance/MaintenanceKpis";
import { MaintenanceBoard } from "@/components/maintenance/MaintenanceBoard";
import { MaintenanceCalendar } from "@/components/maintenance/MaintenanceCalendar";
import { WorkOrderList } from "@/components/maintenance/WorkOrderList";

// ---------------------------------------------------------------------------
// Tab definitions (Spanish labels, SR-212 §3)
// ---------------------------------------------------------------------------

const TABS = [
  { id: "tablero", label: "Tablero" },
  { id: "calendario", label: "Calendario" },
  { id: "ordenes", label: "Órdenes" },
] as const;

// ---------------------------------------------------------------------------
// Page body (inside Suspense boundary — useFocusSync uses useSearchParams)
// ---------------------------------------------------------------------------

/**
 * MaintenancePageBody — inner body requiring Suspense for useSearchParams.
 * Mounts useFocusSync with onFocusStation to sync activeBoardFilter on arrival.
 * F4-1-R6: board filter sync fires once per stationId change, not every render.
 * ADR-5: coupling lives here (component layer), not inside stores.
 */
function MaintenancePageBody() {
  const { world } = useWorldData();

  const activeTab = useMaintenanceStore((s) => s.activeTab);
  const setActiveTab = useMaintenanceStore((s) => s.setActiveTab);
  const setBoardFilter = useMaintenanceStore((s) => s.setBoardFilter);

  // Compute today once at page level — threaded as prop (design ADR-6).
  // NOT from simulationStore — real-world date only (SR-207 §3, SR-213 §1).
  const now = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // F4-1-R6 / ADR-5: sync activeBoardFilter when arriving focus resolves to a new station.
  // This callback fires ONLY when the stationId changes (gated in useFocusSync).
  // It does NOT clobber a user-applied filter — the stationId gate ensures it only runs on
  // the initial arrival focus, not on every render or on user-initiated filter changes.
  const onFocusStation = useCallback(
    (stationId: string | null) => {
      if (stationId) {
        setBoardFilter({
          selectionId: stationId,
          selectionLevel: "station",
          stationId,
        });
      }
    },
    [setBoardFilter],
  );

  // F4-1: bidirectional ?focus= ↔ selectionStore sync, with Maintenance board filter sync — ADR-1/5
  useFocusSync({ onFocusStation });

  // Loading state — world is bundled seed, always available
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
    <div className="flex flex-col">
      {/* KPI row — always visible (SR-212 §2). Owns the deck module header. */}
      <section>
        <MaintenanceKpis world={world} now={now} />
      </section>

      {/* Tab bar (SR-212 §2) — deck-styled tablist, centered in the panel column */}
      <div className="mx-auto w-full max-w-panel px-4 sm:px-6">
        <Tabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as typeof activeTab)}
        />
      </div>

      {/* Tab panel content */}
      <section
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mx-auto w-full max-w-panel flex-1 px-4 pb-8 pt-4 sm:px-6"
      >
        {activeTab === "tablero" && (
          <MaintenanceBoard world={world} now={now} />
        )}
        {activeTab === "calendario" && (
          <MaintenanceCalendar world={world} now={now} />
        )}
        {activeTab === "ordenes" && (
          <WorkOrderList world={world} />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (thin Suspense shell — F4-1-R5, ADR-1)
// ---------------------------------------------------------------------------

/**
 * MaintenancePage — Suspense shell required for useSearchParams in useFocusSync.
 * fallback={null} so there is no layout shift while params hydrate.
 */
export default function MaintenancePage() {
  return (
    <Suspense fallback={<MaintenanceSkeleton />}>
      <MaintenancePageBody />
    </Suspense>
  );
}
