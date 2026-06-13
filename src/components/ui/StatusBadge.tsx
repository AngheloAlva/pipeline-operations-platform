/**
 * StatusBadge — semantic pill indicator (SR-201).
 *
 * Pure RSC: no store imports, no side effects, no "use client".
 * Uses const-object + typeof pattern for variant union (TypeScript SKILL).
 * Color tokens from globals.css (Sala de Control palette).
 * Typography: uppercase, 10–11px, pill shape (rounded-full on badge itself).
 */

import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Variant union (const-object + typeof — TypeScript SKILL, SR-201 §2)
// ---------------------------------------------------------------------------

export const STATUS_BADGE_VARIANT = {
  OK: "ok",
  WARNING: "warning",
  CRITICAL: "critical",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  PLANNED: "planned",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type StatusBadgeVariant =
  (typeof STATUS_BADGE_VARIANT)[keyof typeof STATUS_BADGE_VARIANT];

// ---------------------------------------------------------------------------
// Default Spanish labels (SR-201 §4)
// ---------------------------------------------------------------------------

const DEFAULT_LABELS: Record<StatusBadgeVariant, string> = {
  ok: "OK",
  warning: "ADVERTENCIA",
  critical: "CRÍTICO",
  overdue: "VENCIDA",
  upcoming: "PRÓXIMA",
  planned: "PLANIFICADA",
  in_progress: "EN PROGRESO",
  on_hold: "EN ESPERA",
  completed: "COMPLETADA",
  cancelled: "CANCELADA",
};

// ---------------------------------------------------------------------------
// Color mapping — dot and background (SR-201 §3)
// Uses Tailwind semantic utility classes derived from globals.css @theme inline.
// No var() in className (tailwind-4 SKILL).
// ---------------------------------------------------------------------------

/**
 * Dot class: the small filled circle inside the pill.
 * Maps to Tailwind color utilities backed by CSS custom properties.
 */
const DOT_CLASSES: Record<StatusBadgeVariant, string> = {
  ok: "bg-status-ok",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  overdue: "bg-status-critical",
  upcoming: "bg-status-warning",
  planned: "bg-status-flow",
  in_progress: "bg-accent",          // --phosphor (system alive)
  on_hold: "bg-ink-tertiary",
  completed: "bg-status-ok",
  cancelled: "bg-ink-muted",
};

/**
 * Badge wrapper class: pill background + text color.
 */
const BADGE_CLASSES: Record<StatusBadgeVariant, string> = {
  ok: "bg-status-ok-bg text-status-ok",
  warning: "bg-status-warning-bg text-status-warning",
  critical: "bg-status-critical-bg text-status-critical",
  overdue: "bg-status-critical-bg text-status-critical",
  upcoming: "bg-status-warning-bg text-status-warning",
  planned: "bg-status-flow-bg text-status-flow",
  in_progress: "bg-accent-dim text-accent",
  on_hold: "bg-surface-raised text-ink-tertiary border border-border-mid",
  completed: "bg-status-ok-bg text-status-ok",
  cancelled: "bg-surface-raised text-ink-muted border border-border-mid",
};

// ---------------------------------------------------------------------------
// Props and component
// ---------------------------------------------------------------------------

export interface StatusBadgeProps {
  /** Semantic variant — controls color and default label. */
  variant: StatusBadgeVariant;
  /** Override the default Spanish label. */
  label?: string;
  /** Additional className for the pill wrapper. */
  className?: string;
}

/**
 * Pill-shaped semantic badge.
 *
 * Renders a colored dot + text label. Pure RSC — no state, no store.
 * No rounded softness beyond full pill (rounded-full on the badge itself).
 *
 * Accessible: uses semantic color + text (not color alone).
 *
 * @example
 *   <StatusBadge variant="overdue" />
 *   <StatusBadge variant="ok" label="AL DÍA" />
 */
export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? DEFAULT_LABELS[variant];

  return (
    <span
      className={cn(
        // Pill shape — full rounding on the badge itself (SR-201 §6)
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        BADGE_CLASSES[variant],
        className,
      )}
    >
      {/* Colored dot indicator */}
      <span
        className={cn("inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full", DOT_CLASSES[variant])}
        aria-hidden="true"
      />
      {/* Text label — uppercase, 10px, letter-spacing (SR-201 §5) */}
      <span className="text-[12px] font-medium uppercase leading-none tracking-[0.1em]">
        {displayLabel}
      </span>
    </span>
  );
}
