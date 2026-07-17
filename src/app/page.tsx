"use client";

/**
 * Overview page — Mission Control command-deck layout (calm overview variant).
 * Restyles the operations panel to the deck design language: `.mc-deck` chrome,
 * a lightweight deck header (eyebrow + title + master status lamp), and every
 * section framed as an InstrumentBezel. Unlike the cockpit, the overview is a
 * static read-only deck — NO sim transport/clock. Data wiring is unchanged.
 * "use client" required for the useWorldData hook.
 */

import { useWorldData } from "@/hooks/useWorldData";
import { InstrumentBezel } from "@/components/shared/InstrumentBezel";
import { ReadoutStat } from "@/components/shared/ReadoutStat";
import { PkRuler, StationLabelLayout } from "@/components/ui/PkRuler";
import { totalStock, equipmentStatusCounts, latestCathodicReading } from "@/lib/kpi/overview";
import type { AlertLevel } from "@/lib/domain";
import { formatPk } from "@/lib/format";

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
    <div className="mc-deck flex min-h-screen items-center justify-center p-16">
      <span
        className="text-sm uppercase tracking-[0.14em] text-ink-tertiary"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Cargando datos operativos…
      </span>
    </div>
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

  const cathodicValue = latestReading ? latestReading.potentialV.toFixed(3) : "—";
  const cathodicUnit = latestReading ? "V" : undefined;
  const cathodicSecondary = latestReading
    ? `pk ${latestReading.km.toFixed(1)} · ${new Date(latestReading.takenAt).toLocaleDateString("es-CL")}`
    : undefined;
  const cathodicStatus = latestReading ? (latestReading.level as AlertLevel) : undefined;

  // Tank utilization — sum current / sum capacity
  const totalCapacity = world.tanks.reduce((s, t) => s + t.capacityM3, 0);
  const utilizationPct = totalCapacity > 0 ? ((stock / totalCapacity) * 100).toFixed(1) : "0.0";

  // Equipment readout
  const equipmentTotal = equipment.operational + equipment.nonOperational;
  const equipmentStatus: AlertLevel = equipment.nonOperational > 0 ? "WARNING" : "OK";
  const equipmentSecondary =
    equipment.nonOperational > 0
      ? `${equipment.nonOperational} fuera de servicio`
      : "Todos operativos";

  // Work orders in progress
  const openOrders = world.workOrders.filter(
    (o) => o.status === "IN_PROGRESS" || o.status === "PLANNED",
  ).length;
  // Active work orders are an informational/attention signal, never a critical
  // alarm — a normal open-order count must not map to CRITICAL (red).
  const openOrderStatus: AlertLevel = openOrders > 0 ? "WARNING" : "OK";

  const sortedStations = [...world.stations].sort((a, b) => a.km - b.km);

  return (
    <div className="mc-deck min-h-screen">
      <div className="mx-auto max-w-panel space-y-4 px-4 py-6 sm:px-6">
        {/* ── Deck header — eyebrow + title + master status lamp ─────────── */}
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <span className="mc-rail-eyebrow">Mission Control · Overview</span>
            <h1 className="mt-1 text-sm font-medium uppercase tracking-[0.16em] text-ink-primary">
              Panel de Operaciones
            </h1>
            <p
              className="mt-0.5 text-[12px] text-ink-tertiary"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {world.pipeline.name} · {world.pipeline.totalLengthKm} km · ∅
              {world.pipeline.diameterInches}&quot;
            </p>
          </div>

          {/* System master status — semantic green lamp + status text */}
          <span className="inline-flex items-center gap-2">
            <span className="mc-lamp mc-lamp--ok" role="img" aria-label="Estado del sistema: en línea" />
            <span className="mc-status mc-status--ok text-[12px]">En línea</span>
          </span>
        </header>

        {/* ── La Progresiva — PK Ruler (signature element) ──────────────── */}
        <section aria-label="Progresiva del oleoducto">
          <InstrumentBezel
            label="LA PROGRESIVA"
            sublabel={`PK 0 → ${world.pipeline.totalLengthKm} KM`}
          >
            <div className="p-3">
              <PkRuler
                pipeline={world.pipeline}
                stations={world.stations}
                stationLabelLayout={StationLabelLayout.COLLISION_FREE}
              />
            </div>
          </InstrumentBezel>
        </section>

        {/* ── Indicadores — instrument readouts ──────────────────────────── */}
        <section aria-label="Indicadores clave">
          <InstrumentBezel label="INDICADORES">
            <div className="grid grid-cols-2 gap-px bg-border-subtle lg:grid-cols-4">
              <div className="bg-surface-raised p-4">
                <ReadoutStat
                  label="Stock Total"
                  value={formatM3(stock)}
                  secondary={`${world.tanks.length} tanques activos`}
                />
              </div>
              <div className="bg-surface-raised p-4">
                <ReadoutStat
                  label="Utilización"
                  value={utilizationPct}
                  unit="%"
                  secondary={`de ${formatM3(totalCapacity)} capacidad`}
                />
              </div>
              <div className="bg-surface-raised p-4">
                <ReadoutStat
                  label="Equipos Operativos"
                  value={`${equipment.operational} / ${equipmentTotal}`}
                  secondary={equipmentSecondary}
                  status={equipmentStatus}
                />
              </div>
              <div className="bg-surface-raised p-4">
                <ReadoutStat
                  label="Última Lectura Catódica"
                  value={cathodicValue}
                  unit={cathodicUnit}
                  secondary={cathodicSecondary}
                  status={cathodicStatus}
                />
              </div>
            </div>
          </InstrumentBezel>
        </section>

        {/* ── Sistema — three framed panels ──────────────────────────────── */}
        <section aria-label="Estado del sistema">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Pipeline summary panel */}
            <InstrumentBezel label="OLEODUCTO">
              <dl className="space-y-2 p-4">
                {[
                  { label: "Nombre", value: world.pipeline.name },
                  { label: "Longitud", value: `${world.pipeline.totalLengthKm} km` },
                  { label: "Diámetro", value: `${world.pipeline.diameterInches}"` },
                  { label: "Estaciones", value: String(world.stations.length) },
                  { label: "Segmentos", value: String(world.pipeline.segments.length) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[12px] uppercase tracking-wide text-ink-tertiary shrink-0">
                      {label}
                    </dt>
                    <dd
                      className="text-sm text-ink-primary truncate tabular-nums"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </InstrumentBezel>

            {/* Stations panel */}
            <InstrumentBezel label="ESTACIONES">
              <ul className="space-y-2 p-4">
                {sortedStations.map((station) => (
                  <li key={station.id} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-ink-primary truncate">{station.name}</span>
                    <span
                      className="text-[12px] text-ink-tertiary shrink-0 tabular-nums"
                      style={{ fontFamily: "var(--font-mono), monospace" }}
                    >
                      pk {formatPk(station.km)}
                    </span>
                  </li>
                ))}
              </ul>
            </InstrumentBezel>

            {/* Work orders panel */}
            <InstrumentBezel label="ÓRDENES DE TRABAJO" status={openOrderStatus}>
              <div className="p-4">
                <dl className="space-y-2">
                  {[
                    {
                      label: "En Progreso",
                      value: String(
                        world.workOrders.filter((o) => o.status === "IN_PROGRESS").length,
                      ),
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
                      value: String(
                        world.workOrders.filter((o) => o.status === "COMPLETED").length,
                      ),
                    },
                    {
                      label: "Total Activas",
                      value: String(openOrders),
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-wide text-ink-tertiary shrink-0">
                        {label}
                      </dt>
                      <dd
                        className="text-sm text-ink-primary tabular-nums"
                        style={{ fontFamily: "var(--font-mono), monospace" }}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
                  <span
                    className={`mc-lamp ${
                      openOrderStatus === "OK" ? "mc-lamp--ok" : "mc-lamp--warning"
                    }`}
                    role="img"
                    aria-label={`Estado de órdenes: ${openOrderStatus}`}
                  />
                  <span className="text-[12px] uppercase tracking-widest text-ink-tertiary">
                    {openOrderStatus === "OK" ? "Sin alertas" : `${openOrders} activas`}
                  </span>
                </div>
              </div>
            </InstrumentBezel>
          </div>
        </section>
      </div>
    </div>
  );
}
