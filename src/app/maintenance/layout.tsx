/**
 * Maintenance layout — RSC rail wrapper (SR-211).
 *
 * Hosts EquipmentTree rail (left, fixed width) + {children} (right).
 * Exports metadata so page.tsx can use "use client".
 * Does NOT import simulationStore or useSimulationLoop — architectural seam
 * that guarantees the simulation loop is absent from the /maintenance route.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EquipmentTree } from "@/components/maintenance/EquipmentTree";

export const metadata: Metadata = {
  title: "Mantención | Pipeline Operations",
  description:
    "Gestión de planes preventivos, órdenes de trabajo y programación de mantenimiento del oleoducto.",
};

interface MaintenanceLayoutProps {
  children: ReactNode;
}

/**
 * MaintenanceLayout — flex-row with EquipmentTree rail on the left.
 *
 * The rail persists across tab switches (lives outside the page tab content).
 * EquipmentTree is a "use client" island — the layout itself stays RSC.
 */
export default function MaintenanceLayout({ children }: MaintenanceLayoutProps) {
  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-row">
      {/* Equipment tree rail — fixed width, hairline right border (SR-211 §5) */}
      <aside
        className="w-64 flex-shrink-0 border-r border-border-mid bg-surface-raised overflow-hidden"
        aria-label="Panel de equipos"
      >
        <div className="border-b border-border-mid px-4 py-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
            Equipos
          </p>
        </div>
        <EquipmentTree />
      </aside>

      {/* Main page content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
