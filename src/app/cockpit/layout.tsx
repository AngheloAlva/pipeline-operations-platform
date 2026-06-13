/**
 * Cockpit layout — carries route metadata so cockpit/page.tsx can use "use client".
 * SR-008 req 7, SR-013 req 6.
 * Metadata MUST live here, NOT in page.tsx (which has "use client").
 *
 * Design note: The root layout renders <Header /> (RSC, no client islands).
 * SimClock is a "use client" island that the design places "in the header area".
 * Since the Next.js root layout's Header is shared across all routes, SimClock
 * is rendered here in the cockpit-specific instrument bar (immediately below the
 * main nav header) — keeping Header.tsx free of "use client" per SR-008 req 2.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SimClock } from "@/components/layout/SimClock";

export const metadata: Metadata = {
  title: "Cockpit — Pipeline Ops",
  description:
    "Panel de control operativo del oleoducto — diagrama de flujo en tiempo real, balance volumétrico y control de simulación.",
};

interface CockpitLayoutProps {
  children: ReactNode;
}

/**
 * CockpitLayout wraps the cockpit page.
 * Renders SimClock in the cockpit instrument sub-header (top of route content),
 * adjacent to the main nav header, without converting Header.tsx to a client component.
 */
export default function CockpitLayout({ children }: CockpitLayoutProps) {
  return (
    <>
      {/* Cockpit instrument sub-header — cockpit-specific toolbar with SimClock */}
      <div className="border-b border-border-subtle bg-surface-raised px-4 py-1.5 sm:px-6">
        <div className="mx-auto flex max-w-panel items-center justify-end">
          <SimClock />
        </div>
      </div>
      {children}
    </>
  );
}
