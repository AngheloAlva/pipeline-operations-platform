/**
 * Integrity layout — RSC shell with metadata. SR-310.
 *
 * This is a React Server Component (no "use client" directive).
 * Exports metadata so page.tsx can use "use client".
 *
 * No equipment-tree rail (unlike maintenance) — integrity has no tree per UX_DESIGN §4.1.
 * Renders only {children} inside the root layout's inherited structure.
 *
 * Does NOT import simulationStore, maintenanceStore, or any Zustand store.
 * Architectural seam: the simulation loop is absent from the /integrity route.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Integridad | Pipeline Operations",
  description:
    "Monitoreo de protección catódica, lecturas de potencial y análisis de tendencias del oleoducto.",
};

interface IntegrityLayoutProps {
  children: ReactNode;
}

/**
 * IntegrityLayout — thin RSC shell.
 *
 * No rail, no simulation clock, no aside. The integrity module is read-only
 * over seed data (ADR-1: no integrity store). Layout stays simple: {children}
 * inside a full-height main container.
 */
export default function IntegrityLayout({ children }: IntegrityLayoutProps) {
  return (
    <main className="min-h-[calc(100vh-48px)]">
      {children}
    </main>
  );
}
