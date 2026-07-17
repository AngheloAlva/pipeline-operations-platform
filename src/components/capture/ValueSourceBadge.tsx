import { cn } from "@/lib/cn";
import { MONO_STYLE } from "./formKit";

export const ValueSourceKind = {
  ENTERED: "entered",
  CALCULATED: "calculated",
} as const;
export type ValueSourceKind = (typeof ValueSourceKind)[keyof typeof ValueSourceKind];

interface ValueSourceBadgeProps {
  kind: ValueSourceKind;
  compact?: boolean;
}

export function ValueSourceBadge({ kind, compact = false }: ValueSourceBadgeProps) {
  const calculated = kind === ValueSourceKind.CALCULATED;
  const label = calculated ? "Calculado por el sistema" : "Dato ingresado";
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center border uppercase tracking-[0.08em]",
        compact ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[9px]",
        calculated
          ? "border-accent bg-accent-dim text-accent"
          : "border-border-mid bg-surface-overlay text-ink-tertiary",
      )}
      style={MONO_STYLE}
    >
      {calculated ? "ƒ calc" : "ingresado"}
    </span>
  );
}
