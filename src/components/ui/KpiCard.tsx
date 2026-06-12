import { cn } from "@/lib/cn";
import type { AlertLevel } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<AlertLevel, string> = {
  OK: "Normal",
  WARNING: "Advertencia",
  CRITICAL: "Crítico",
};

const STATUS_CLASSES: Record<AlertLevel, string> = {
  OK: "bg-status-ok-bg text-status-ok",
  WARNING: "bg-status-warning-bg text-status-warning",
  CRITICAL: "bg-status-critical-bg text-status-critical",
};

interface StatusBadgeProps {
  level: AlertLevel;
}

function StatusBadge({ level }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[level],
      )}
    >
      {STATUS_LABEL[level]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  /** Spanish label shown above the value */
  label: string;
  /** Formatted value string (number + units) */
  value: string;
  /** Optional secondary line below the value */
  secondary?: string;
  /** If provided, renders a status badge */
  status?: AlertLevel;
  /** Additional className for the card wrapper */
  className?: string;
}

/**
 * Reusable KPI display card.
 * Value: large monospace number for fast scanning.
 * Status: color-coded badge aligned with AlertLevel domain values.
 */
export function KpiCard({ label, value, secondary, status, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-raised p-5",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="font-mono text-2xl font-semibold leading-none text-text-primary">{value}</p>
      {secondary && <p className="text-sm text-text-secondary">{secondary}</p>}
      {status && <StatusBadge level={status} />}
    </div>
  );
}
