"use client";

import { useWorldData } from "@/hooks/useWorldData";
import { KpiCard } from "@/components/ui/KpiCard";
import { totalStock, equipmentStatusCounts, latestCathodicReading } from "@/lib/kpi/overview";
import type { AlertLevel } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Number formatters
// ---------------------------------------------------------------------------

const volumeFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatM3(value: number): string {
  return `${volumeFormatter.format(value)} m³`;
}

// ---------------------------------------------------------------------------
// Overview page component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { world } = useWorldData();

  // world is always populated synchronously from the bundled seed; this guard
  // is a safety net for environments where the module has not yet been evaluated.
  if (!world) {
    return (
      <div className="flex items-center justify-center p-16 text-text-secondary text-sm">
        Cargando datos operativos…
      </div>
    );
  }

  // Compute KPIs from pure lib functions
  const stock = totalStock(world);
  const equipment = equipmentStatusCounts(world);
  const latestReading = latestCathodicReading(world);

  const cathodicValue = latestReading ? `${latestReading.potentialV.toFixed(3)} V` : "—";
  const cathodicSecondary = latestReading
    ? `pk ${latestReading.km.toFixed(1)} · ${new Date(latestReading.takenAt).toLocaleDateString("es-CL")}`
    : undefined;
  const cathodicStatus = latestReading ? (latestReading.level as AlertLevel) : undefined;

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">Panel de Operaciones</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Resumen en tiempo real del sistema de oleoductos
        </p>
      </div>

      {/* KPI grid */}
      <section aria-label="Indicadores clave">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Stock total */}
          <KpiCard
            label="Stock Total"
            value={formatM3(stock)}
            secondary={`${world.tanks.length} tanques activos`}
          />

          {/* Equipment status */}
          <KpiCard
            label="Equipos Operativos"
            value={`${equipment.operational} / ${equipment.operational + equipment.nonOperational}`}
            secondary={
              equipment.nonOperational > 0
                ? `${equipment.nonOperational} fuera de servicio`
                : "Todos operativos"
            }
            status={equipment.nonOperational > 0 ? "WARNING" : "OK"}
          />

          {/* Latest cathodic reading */}
          <KpiCard
            label="Última Lectura Catódica"
            value={cathodicValue}
            secondary={cathodicSecondary}
            status={cathodicStatus}
          />
        </div>
      </section>

      {/* Pipeline summary */}
      <section aria-label="Resumen del oleoducto" className="mt-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-text-secondary">
          Oleoducto
        </h2>
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-text-secondary">Nombre</dt>
              <dd className="mt-1 font-medium text-text-primary">{world.pipeline.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Longitud</dt>
              <dd className="mt-1 font-medium text-text-primary">
                {world.pipeline.totalLengthKm} km
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Diámetro</dt>
              <dd className="mt-1 font-medium text-text-primary">
                {world.pipeline.diameterInches}&quot;
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Estaciones</dt>
              <dd className="mt-1 font-medium text-text-primary">{world.stations.length}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
