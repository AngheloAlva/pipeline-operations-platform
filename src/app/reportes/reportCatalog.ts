/**
 * Report catalog — the single ordered source of truth for the report pages
 * (MV-16/MV-18). Both the /reportes landing index and the ReportNav stepper
 * (MV-33) read from this list so their order and metadata never drift apart.
 * Only built pages are listed.
 */

export interface ReportCard {
  href: string;
  title: string;
  description: string;
  scope: string;
}

export const REPORT_CARDS: ReportCard[] = [
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
