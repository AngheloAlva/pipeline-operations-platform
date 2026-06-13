/**
 * Equipment aggregate layout — RSC shell with metadata.
 *
 * Mirrors the integrity layout convention: thin RSC with metadata export
 * so page.tsx can use "use client". No rail, no simulation clock.
 *
 * The /equipment/[id] route is reached via cross-nav only (not in NavLinks).
 * F4-2: aggregate equipment detail page, hub-and-spoke spoke route.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Equipment Detail | Pipeline Operations",
  description:
    "Aggregate equipment detail — maintenance tasks, station flow, and cathodic integrity for a pipeline equipment item.",
};

interface EquipmentLayoutProps {
  children: ReactNode;
}

/**
 * EquipmentLayout — thin RSC shell.
 *
 * No rail, no simulation clock. The equipment aggregate page is a read-only
 * detail view composed from the three module selectors keyed on stationId.
 */
export default function EquipmentLayout({ children }: EquipmentLayoutProps) {
  return (
    <main className="min-h-[calc(100vh-48px)]">
      {children}
    </main>
  );
}
