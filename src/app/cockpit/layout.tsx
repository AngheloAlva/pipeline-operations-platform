/**
 * Cockpit layout — carries route metadata so cockpit/page.tsx can use "use client".
 * SR-008 req 7, SR-013 req 6. Metadata MUST live here, NOT in page.tsx.
 *
 * The deck CommandRail now renders the simulated clock + transport, so the former
 * SimClock instrument sub-header is no longer rendered here. This layout is a pure
 * pass-through whose only responsibility is exporting route metadata.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cockpit — Pipeline Ops",
  description:
    "Panel de control operativo del oleoducto — diagrama de flujo en tiempo real, balance volumétrico y control de simulación.",
};

interface CockpitLayoutProps {
  children: ReactNode;
}

export default function CockpitLayout({ children }: CockpitLayoutProps) {
  return <>{children}</>;
}
