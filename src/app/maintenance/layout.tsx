/**
 * Maintenance layout — RSC rail wrapper (SR-211).
 *
 * Hosts EquipmentTree rail (left, fixed width) + {children} (right).
 * Exports metadata so page.tsx can use "use client".
 * Does NOT import simulationStore or useSimulationLoop — architectural seam
 * that guarantees the simulation loop is absent from the /maintenance route.
 *
 * Responsive (F5-2):
 *   md+  — static aside rail (w-64) always visible beside the content
 *   <md  — rail hidden; EquipmentTreeDrawer provides a toggle button +
 *           fixed overlay drawer (absolute, left-slide, backdrop-dismiss)
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EquipmentTree } from "@/components/maintenance/EquipmentTree";
import { EquipmentTreeDrawer } from "@/components/maintenance/EquipmentTreeDrawer";

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
 *
 * On md+ the static aside renders. On mobile, EquipmentTreeDrawer (client
 * island) renders an inline toggle button + overlay drawer.
 */
export default function MaintenanceLayout({ children }: MaintenanceLayoutProps) {
  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-row">
      {/* Equipment tree rail — static, only visible from md up */}
      <aside
        className="hidden md:block md:w-64 md:flex-shrink-0 border-r border-border-mid bg-surface-raised overflow-hidden"
        aria-label="Panel de equipos"
      >
        <div className="border-b border-border-mid px-4 py-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
            Equipos
          </p>
        </div>
        <EquipmentTree />
      </aside>

      {/* Main page content — full width on mobile, flex-1 on md+ */}
      <main className="flex-1 min-w-0 w-full overflow-auto">
        {/* Mobile drawer toggle — visible only below md (client island) */}
        <div className="border-b border-border-subtle px-4 py-2 md:hidden">
          <EquipmentTreeDrawer />
        </div>
        {children}
      </main>
    </div>
  );
}
