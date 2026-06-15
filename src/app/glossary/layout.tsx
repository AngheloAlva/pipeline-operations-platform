/**
 * Glossary layout — RSC shell with metadata.
 * Renders {children} inside the root layout's inherited structure.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Glosario | Pipeline Operations",
  description:
    "Glosario de términos técnicos del sistema de operaciones de oleoductos: integridad, volumetría, mantención y equipos.",
};

interface GlossaryLayoutProps {
  children: ReactNode;
}

export default function GlossaryLayout({ children }: GlossaryLayoutProps) {
  return (
    <main className="min-h-[calc(100vh-48px)]">
      {children}
    </main>
  );
}
