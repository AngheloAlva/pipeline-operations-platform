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
 */

import { useMemo } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import { useMaintenanceStore } from "@/store/maintenanceStore";
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
// Page component
// ---------------------------------------------------------------------------

/**
 * MaintenancePage — composes the CMMS dashboard.
 * "use client" — uses hooks (useWorldData, useMaintenanceStore).
 * Metadata lives in layout.tsx per SR-211.
 */
export default function MaintenancePage() {
  const { world } = useWorldData();

  const activeTab = useMaintenanceStore((s) => s.activeTab);
  const setActiveTab = useMaintenanceStore((s) => s.setActiveTab);

  // Compute today once at page level — threaded as prop (design ADR-6).
  // NOT from simulationStore — real-world date only (SR-207 §3, SR-213 §1).
  const now = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Loading state — world is bundled seed, always available
  if (!world) {
    return (
      <div className="flex items-center justify-center py-32">
        <span
          className="text-[11px] uppercase tracking-[0.12em] text-ink-muted"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          Cargando datos…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* KPI row — always visible (SR-212 §2) */}
      <section className="border-b border-border-subtle">
        <MaintenanceKpis world={world} now={now} />
      </section>

      {/* Tab bar (SR-212 §2) */}
      <Tabs
        tabs={TABS as unknown as { id: string; label: string }[]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as typeof activeTab)}
        className="px-4"
      />

      {/* Tab panel content */}
      <section
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1"
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
