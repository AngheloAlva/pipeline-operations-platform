/**
 * Reports layout — RSC shell with metadata (MV-16).
 * Renders {children} inside the root layout's inherited structure.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reportes | Pipeline Operations",
  description:
    "Reportes self-service del oleoducto: allocation por cargador y presupuesto vs real, alimentados por la serie mensual del sistema.",
};

interface ReportsLayoutProps {
  children: ReactNode;
}

export default function ReportsLayout({ children }: ReportsLayoutProps) {
  return <main className="min-h-[calc(100vh-48px)]">{children}</main>;
}
