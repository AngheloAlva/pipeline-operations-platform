"use client";

import { useWorldData } from "@/hooks/useWorldData";
import { KpiCard } from "@/components/ui/KpiCard";
import { PkRuler } from "@/components/ui/PkRuler";
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
// Loading state
// ---------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center p-16">
      <span
        className="text-xs uppercase tracking-[0.14em] text-ink-tertiary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Cargando datos operativos…
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading — reusable
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  label: string;
}

function SectionHeading({ label }: SectionHeadingProps) {
  return (
    <h2 className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
      {label}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Overview page component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { world } = useWorldData();

  if (!world) return <LoadingScreen />;

  // Compute KPIs from pure lib functions
  const stock = totalStock(world);
  const equipment = equipmentStatusCounts(world);
  const latestReading = latestCathodicReading(world);

  const cathodicValue = latestReading ? `${latestReading.potentialV.toFixed(3)} V` : "—";
  const cathodicSecondary = latestReading
    ? `pk ${latestReading.km.toFixed(1)} · ${new Date(latestReading.takenAt).toLocaleDateString("es-CL")}`
    : undefined;
  const cathodicStatus = latestReading ? (latestReading.level as AlertLevel) : undefined;

  // Tank utilization — sum current / sum capacity
  const totalCapacity = world.tanks.reduce((s, t) => s + t.capacityM3, 0);
  const utilizationPct = totalCapacity > 0 ? ((stock / totalCapacity) * 100).toFixed(1) : "0.0";

  // Work orders in progress
  const openOrders = world.workOrders.filter(
    (o) => o.status === "IN_PROGRESS" || o.status === "PLANNED",
  ).length;
  const openOrderStatus: AlertLevel =
    openOrders > 5 ? "WARNING" : openOrders > 0 ? "WARNING" : "OK";

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
      {/* ── Page heading ───────────────────────────────────────────────── */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-primary">
            Panel de Operaciones
          </h1>
          <p
            className="mt-0.5 text-[10px] text-ink-tertiary"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {world.pipeline.name} · {world.pipeline.totalLengthKm} km · ∅
            {world.pipeline.diameterInches}&quot;
          </p>
        </div>

        {/* Live indicator — phosphor pulse */}
        <span className="inline-flex items-center gap-1.5">
          <span className="relative inline-flex h-2 w-2">
            {/* Pulsing ring */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-ok" />
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.12em] text-ink-tertiary"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            En línea
          </span>
        </span>
      </div>

      {/* ── La Progresiva — PK Ruler (signature element) ──────────────── */}
      <section aria-label="Progresiva del oleoducto" className="mb-6">
        <SectionHeading label="Progresiva" />
        <PkRuler pipeline={world.pipeline} stations={world.stations} />
      </section>

      {/* ── KPI instrument grid ────────────────────────────────────────── */}
      <section aria-label="Indicadores clave" className="mb-6">
        <SectionHeading label="Indicadores" />
        <div className="grid grid-cols-2 gap-px bg-border-subtle lg:grid-cols-4">
          {/* Stock total */}
          <KpiCard
            label="Stock Total"
            value={formatM3(stock)}
            secondary={`${world.tanks.length} tanques activos`}
            className="bg-surface-raised"
          />

          {/* Tank utilization */}
          <KpiCard
            label="Utilización"
            value={`${utilizationPct}%`}
            secondary={`de ${formatM3(totalCapacity)} capacidad`}
            className="bg-surface-raised"
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
            className="bg-surface-raised"
          />

          {/* Latest cathodic reading */}
          <KpiCard
            label="Última Lectura Catódica"
            value={cathodicValue}
            secondary={cathodicSecondary}
            status={cathodicStatus}
            className="bg-surface-raised"
          />
        </div>
      </section>

      {/* ── System panels grid ─────────────────────────────────────────── */}
      <section aria-label="Estado del sistema" className="mb-6">
        <SectionHeading label="Sistema" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Pipeline summary panel */}
          <div className="border border-border-mid bg-surface-raised p-5">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
              Oleoducto
            </p>
            <dl className="space-y-2">
              {[
                { label: "Nombre", value: world.pipeline.name },
                { label: "Longitud", value: `${world.pipeline.totalLengthKm} km` },
                { label: "Diámetro", value: `${world.pipeline.diameterInches}"` },
                { label: "Estaciones", value: String(world.stations.length) },
                { label: "Segmentos", value: String(world.pipeline.segments.length) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] uppercase tracking-wide text-ink-tertiary shrink-0">
                    {label}
                  </dt>
                  <dd
                    className="text-xs text-ink-primary truncate"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Stations panel */}
          <div className="border border-border-mid bg-surface-raised p-5">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
              Estaciones
            </p>
            <ul className="space-y-2">
              {[...world.stations]
                .sort((a, b) => a.km - b.km)
                .map((station) => (
                  <li key={station.id} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-ink-primary truncate">{station.name}</span>
                    <span
                      className="text-[10px] text-ink-tertiary shrink-0 tabular-nums"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      pk {station.km.toFixed(1)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          {/* Work orders panel */}
          <div className="border border-border-mid bg-surface-raised p-5">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
              Órdenes de Trabajo
            </p>
            <dl className="space-y-2">
              {[
                {
                  label: "En Progreso",
                  value: String(world.workOrders.filter((o) => o.status === "IN_PROGRESS").length),
                },
                {
                  label: "Planificadas",
                  value: String(world.workOrders.filter((o) => o.status === "PLANNED").length),
                },
                {
                  label: "En Espera",
                  value: String(world.workOrders.filter((o) => o.status === "ON_HOLD").length),
                },
                {
                  label: "Completadas",
                  value: String(world.workOrders.filter((o) => o.status === "COMPLETED").length),
                },
                {
                  label: "Total Activas",
                  value: String(openOrders),
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] uppercase tracking-wide text-ink-tertiary shrink-0">
                    {label}
                  </dt>
                  <dd
                    className="text-xs text-ink-primary tabular-nums"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 pt-3 border-t border-border-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    openOrderStatus === "OK"
                      ? "bg-status-ok shadow-[0_0_6px_2px_var(--status-ok-bg)]"
                      : "bg-status-warning shadow-[0_0_6px_2px_var(--status-warning-bg)]"
                  }`}
                />
                <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  {openOrderStatus === "OK" ? "Sin alertas" : `${openOrders} activas`}
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
