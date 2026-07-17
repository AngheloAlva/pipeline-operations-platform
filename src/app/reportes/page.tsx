/**
 * Reports landing — section index (MV-16/MV-18).
 * Orients the user across the self-service report pages fed by the seeded
 * 12-month series. Only built pages render as links; MV-18 added the four
 * monthly BI pages (Diferencias, Detenciones, Medio Ambiente, Cierres).
 * RSC — no client hooks needed here.
 */

import Link from "next/link";

// ---------------------------------------------------------------------------
// Report catalog — only built pages are listed (MV-17/MV-18)
// ---------------------------------------------------------------------------

interface ReportCard {
  href: string;
  title: string;
  description: string;
  scope: string;
}

const REPORT_CARDS: ReportCard[] = [
  {
    href: "/reportes/allocation",
    title: "Allocation",
    description:
      "Volúmenes recibidos (OTA) y entregados (OTC) por cargador, con participación sobre el total y diferencia en tránsito.",
    scope: "Mensual · por cargador",
  },
  {
    href: "/reportes/presupuesto",
    title: "Presupuesto vs Real",
    description:
      "Serie mensual de presupuesto, programa y volumen real con cumplimiento y desviación por mes.",
    scope: "Serie 12 meses",
  },
  {
    href: "/reportes/diferencias",
    title: "Diferencias",
    description:
      "Diferencias de custodia OTA vs OTC por cargador: volumen en origen y destino, diferencia en m³ y %, con vista mensual y acumulado del año.",
    scope: "Mensual · YTD",
  },
  {
    href: "/reportes/detenciones",
    title: "Detenciones de Línea",
    description:
      "Eventos de detención del poliducto con horas detenidas por mes y desglose por responsable (OTA, OTC o compartida).",
    scope: "Eventos · por mes",
  },
  {
    href: "/reportes/medio-ambiente",
    title: "Medio Ambiente",
    description:
      "Emisiones de gases de efecto invernadero en tCO₂e: serie mensual y desglose por alcance del Protocolo GHG y por fuente.",
    scope: "Serie 12 meses",
  },
  {
    href: "/reportes/cierres",
    title: "Cierres del Mes",
    description:
      "Comentarios de cierre mensual de cada área operativa, agrupados por período y con el autor responsable cuando existe.",
    scope: "Mensual · por área",
  },
];

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  return (
    <div className="mc-deck min-h-full">
      <div className="mx-auto flex max-w-panel flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Module header */}
        <header>
          <span className="mc-rail-eyebrow">Mission Control · Reportes</span>
          <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
            Reportes
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
            Los reportes del cierre mensual, en vivo y self-service: cada página se
            alimenta de la serie mensual del sistema, sin esperar la consolidación
            de fin de mes.
          </p>
        </header>

        {/* Report cards */}
        <nav aria-label="Páginas de reporte">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REPORT_CARDS.map((card) => (
              <li key={card.href}>
                <Link
                  href={card.href}
                  className="group flex h-full flex-col gap-2 border border-border-mid bg-surface-raised p-4 transition-colors hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-primary transition-colors group-hover:text-accent"
                      style={MONO_STYLE}
                    >
                      {card.title}
                    </h2>
                    <span
                      className="border border-border-mid px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-tertiary"
                      style={MONO_STYLE}
                    >
                      {card.scope}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-ink-secondary">
                    {card.description}
                  </p>
                  <span
                    className="mt-auto text-[11px] uppercase tracking-[0.12em] text-ink-muted transition-colors group-hover:text-accent"
                    style={MONO_STYLE}
                  >
                    Abrir reporte →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
