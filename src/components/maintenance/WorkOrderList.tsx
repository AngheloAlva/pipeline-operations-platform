"use client";

/**
 * WorkOrderList — work orders with session overrides, transitions, and progress (SR-210).
 *
 * - Effective status = override first, then seed (SR-210 §2).
 * - Progress clamped to 0 for PLANNED or CANCELLED (SR-210 §4).
 * - Status filter chips: multi-select.
 * - Transition buttons per legal WO state machine (SR-210 §6).
 * - Sorted: open first (PLANNED/IN_PROGRESS/ON_HOLD), then COMPLETED, then CANCELLED;
 *   within group by priority (URGENT > HIGH > MEDIUM > LOW).
 */

import { useCallback, useMemo, useState } from "react";
import type { PipelineWorld, WorkOrder } from "@/lib/domain";
import { WorkOrderStatus, WorkOrderPriority, MaintenanceType } from "@/lib/domain";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Status filter chip config
// ---------------------------------------------------------------------------

const STATUS_CHIP_CONFIG: Array<{
  status: string;
  label: string;
  variant: StatusBadgeVariant;
}> = [
  { status: WorkOrderStatus.PLANNED, label: "Planificada", variant: "planned" },
  { status: WorkOrderStatus.IN_PROGRESS, label: "En progreso", variant: "in_progress" },
  { status: WorkOrderStatus.ON_HOLD, label: "En espera", variant: "on_hold" },
  { status: WorkOrderStatus.COMPLETED, label: "Completada", variant: "completed" },
  { status: WorkOrderStatus.CANCELLED, label: "Cancelada", variant: "cancelled" },
];

// ---------------------------------------------------------------------------
// Transition buttons per status (SR-210 §6, SR-204 §13)
// ---------------------------------------------------------------------------

interface TransitionDef {
  to: string;
  label: string;
}

const TRANSITION_BUTTONS: Record<string, TransitionDef[]> = {
  [WorkOrderStatus.PLANNED]: [
    { to: WorkOrderStatus.IN_PROGRESS, label: "Iniciar" },
    { to: WorkOrderStatus.CANCELLED, label: "Cancelar" },
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    { to: WorkOrderStatus.COMPLETED, label: "Completar" },
    { to: WorkOrderStatus.ON_HOLD, label: "Poner en espera" },
    { to: WorkOrderStatus.CANCELLED, label: "Cancelar" },
  ],
  [WorkOrderStatus.ON_HOLD]: [
    { to: WorkOrderStatus.IN_PROGRESS, label: "Reanudar" },
  ],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

// ---------------------------------------------------------------------------
// Status → badge variant
// ---------------------------------------------------------------------------

function statusToVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case WorkOrderStatus.PLANNED:
      return "planned";
    case WorkOrderStatus.IN_PROGRESS:
      return "in_progress";
    case WorkOrderStatus.ON_HOLD:
      return "on_hold";
    case WorkOrderStatus.COMPLETED:
      return "completed";
    case WorkOrderStatus.CANCELLED:
      return "cancelled";
    default:
      return "ok";
  }
}

// ---------------------------------------------------------------------------
// Priority → badge variant + Spanish label
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Urgente",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function priorityToVariant(priority: string): StatusBadgeVariant {
  switch (priority) {
    case WorkOrderPriority.URGENT:
      return "overdue";
    case WorkOrderPriority.HIGH:
      return "upcoming";
    case WorkOrderPriority.MEDIUM:
      return "warning";
    default:
      return "ok";
  }
}

// ---------------------------------------------------------------------------
// Type display labels
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  [MaintenanceType.PREVENTIVE]: "Preventiva",
  [MaintenanceType.CORRECTIVE]: "Correctiva",
  [MaintenanceType.PREDICTIVE]: "Predictiva",
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const STATUS_GROUP: Record<string, number> = {
  [WorkOrderStatus.PLANNED]: 0,
  [WorkOrderStatus.IN_PROGRESS]: 0,
  [WorkOrderStatus.ON_HOLD]: 0,
  [WorkOrderStatus.COMPLETED]: 1,
  [WorkOrderStatus.CANCELLED]: 2,
};

function sortWorkOrders(
  wos: WorkOrder[],
  effectiveStatuses: Record<string, string>,
): WorkOrder[] {
  return [...wos].sort((a, b) => {
    const aStatus = effectiveStatuses[a.id] ?? a.status;
    const bStatus = effectiveStatuses[b.id] ?? b.status;
    const groupDiff = (STATUS_GROUP[aStatus] ?? 3) - (STATUS_GROUP[bStatus] ?? 3);
    if (groupDiff !== 0) return groupDiff;
    return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkOrderListProps {
  world: PipelineWorld;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Work order list with session override display and transition buttons.
 */
export function WorkOrderList({ world }: WorkOrderListProps) {
  const overrides = useMaintenanceStore((s) => s.overrides);
  const transitionWorkOrder = useMaintenanceStore((s) => s.transitionWorkOrder);

  // Status filter chips (local state — ephemeral, not in store)
  const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>([]);

  function toggleStatusFilter(status: string) {
    setActiveStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  // Build effective status map
  const effectiveStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    for (const wo of world.workOrders) {
      map[wo.id] = overrides.workOrderStatuses[wo.id] ?? wo.status;
    }
    return map;
  }, [world.workOrders, overrides.workOrderStatuses]);

  // Sort
  const sortedWorkOrders = useMemo(
    () => sortWorkOrders(world.workOrders, effectiveStatuses),
    [world.workOrders, effectiveStatuses],
  );

  // Filter by active status chips
  const filteredWorkOrders = useMemo(() => {
    if (activeStatusFilters.length === 0) return sortedWorkOrders;
    return sortedWorkOrders.filter((wo) =>
      activeStatusFilters.includes(effectiveStatuses[wo.id] ?? wo.status),
    );
  }, [sortedWorkOrders, activeStatusFilters, effectiveStatuses]);

  // Handle transition
  const handleTransition = useCallback(
    (wo: WorkOrder, toStatus: string) => {
      transitionWorkOrder(world.workOrders, wo.id, toStatus as WorkOrder["status"]);
    },
    [transitionWorkOrder, world.workOrders],
  );

  return (
    <div className="flex flex-col">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-border-subtle bg-surface-raised px-4 py-3">
        {STATUS_CHIP_CONFIG.map(({ status, label, variant }) => (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatusFilter(status)}
            aria-pressed={activeStatusFilters.includes(status)}
            className={cn(
              "transition-opacity",
              activeStatusFilters.includes(status) ? "opacity-100" : "opacity-40",
            )}
          >
            <StatusBadge variant={variant} label={label} />
          </button>
        ))}
        {activeStatusFilters.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveStatusFilters([])}
            className="text-[12px] uppercase tracking-[0.1em] text-ink-muted hover:text-ink-primary"
          >
            Todos
          </button>
        )}
      </div>

      {/* Work order list */}
      <div className="flex flex-col divide-y divide-border-subtle">
        {filteredWorkOrders.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-ink-muted">
            Sin órdenes de trabajo para los filtros seleccionados
          </div>
        )}
        {filteredWorkOrders.map((wo) => {
          const effectiveStatus = effectiveStatuses[wo.id] ?? wo.status;
          const badgeVariant = statusToVariant(effectiveStatus);
          const transitions = TRANSITION_BUTTONS[effectiveStatus] ?? [];

          // Progress clamping: PLANNED or CANCELLED → 0 (SR-210 §4)
          const displayProgress =
            effectiveStatus === WorkOrderStatus.PLANNED ||
            effectiveStatus === WorkOrderStatus.CANCELLED
              ? 0
              : effectiveStatus === WorkOrderStatus.COMPLETED
                ? 100
                : wo.progress;

          return (
            <div
              key={wo.id}
              className="flex flex-col gap-3 bg-surface-raised px-4 py-4 hover:bg-surface-interactive"
            >
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span
                    className="font-mono text-[13px] font-medium tracking-[0.08em] text-ink-muted tabular-nums"
                    style={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {wo.otNumber}
                  </span>
                  <span className="text-[15px] font-medium text-ink-primary">
                    {wo.description}
                  </span>
                  <span className="text-[13px] text-ink-secondary">
                    {TYPE_LABELS[wo.type] ?? wo.type}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={badgeVariant} />
                  <StatusBadge
                    variant={priorityToVariant(wo.priority)}
                    label={PRIORITY_LABELS[wo.priority] ?? wo.priority}
                  />
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden bg-surface-base">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      displayProgress >= 100
                        ? "bg-status-ok"
                        : displayProgress > 0
                          ? "bg-status-flow"
                          : "bg-ink-muted/30",
                    )}
                    style={{ width: `${displayProgress}%` }}
                    role="progressbar"
                    aria-valuenow={displayProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progreso: ${displayProgress}%`}
                  />
                </div>
                <span
                  className="w-10 text-right font-mono text-[13px] tabular-nums text-ink-tertiary"
                  style={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {displayProgress}%
                </span>
              </div>

              {/* Transition buttons */}
              {transitions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {transitions.map((t) => (
                    <button
                      key={t.to}
                      type="button"
                      onClick={() => handleTransition(wo, t.to)}
                      className={cn(
                        "border border-border-mid bg-surface-base px-3 py-1",
                        "text-[12px] font-medium uppercase tracking-[0.1em] text-ink-secondary",
                        "hover:border-border-strong hover:text-ink-primary",
                        "focus:outline-none focus:ring-1 focus:ring-accent",
                        "transition-colors",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
