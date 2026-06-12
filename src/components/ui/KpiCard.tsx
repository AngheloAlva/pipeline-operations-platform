import { cn } from "@/lib/cn";
import type { AlertLevel } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Panel lamp — status indicator (replaces badge)
// Small circular lamp with phosphor/amber/alarm glow for OK/WARNING/CRITICAL.
// ---------------------------------------------------------------------------

const LAMP_CLASSES: Record<AlertLevel, string> = {
  OK: "bg-status-ok shadow-[0_0_6px_2px_var(--status-ok-bg)]",
  WARNING: "bg-status-warning shadow-[0_0_6px_2px_var(--status-warning-bg)]",
  CRITICAL: "bg-status-critical shadow-[0_0_6px_2px_var(--status-critical-bg)]",
};

const LAMP_LABEL: Record<AlertLevel, string> = {
  OK: "Normal",
  WARNING: "Advertencia",
  CRITICAL: "Crítico",
};

interface PanelLampProps {
  level: AlertLevel;
}

function PanelLamp({ level }: PanelLampProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* Circular lamp element */}
      <span
        className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", LAMP_CLASSES[level])}
        aria-hidden="true"
      />
      {/* Level label — uppercase, wide tracking, tertiary ink */}
      <span className="text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
        {LAMP_LABEL[level]}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card — instrument readout
// Hairline frame, no rounded softness. Mono value. Uppercase label.
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  /** Spanish label — uppercase, tight tracking */
  label: string;
  /** Formatted value string (number + units) — displayed in Geist Mono */
  value: string;
  /** Optional secondary line — smaller, tertiary ink */
  secondary?: string;
  /** If provided, renders a panel lamp status indicator */
  status?: AlertLevel;
  /** Additional className for the card wrapper */
  className?: string;
}

/**
 * Instrument readout card.
 * Hairline border frame, no shadow. Mono value with tabular-nums.
 * Panel lamp replaces color badge. Pure control room aesthetic.
 */
export function KpiCard({ label, value, secondary, status, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        // Hairline frame — no radius softness, no shadow
        "flex flex-col gap-2.5 border border-border-mid bg-surface-raised p-5",
        // Thin left accent bar for visual grounding
        "border-l border-l-border-strong",
        className,
      )}
    >
      {/* Label — uppercase, wide tracking, secondary ink */}
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
        {label}
      </p>

      {/* Value — large mono readout, tabular numbers */}
      <p
        className="font-mono text-2xl font-medium leading-none text-ink-primary tabular-nums"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {value}
      </p>

      {/* Secondary line — metadata */}
      {secondary && (
        <p
          className="text-xs text-ink-tertiary"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {secondary}
        </p>
      )}

      {/* Panel lamp — status */}
      {status && <PanelLamp level={status} />}
    </div>
  );
}
