/**
 * InstrumentBezel — instrument frame with corner ticks and a header strip.
 * Pure presentational. No hooks. Wraps any content in a bezel chrome.
 */

import type { ReactNode } from "react";
import type { AlertLevel } from "@/lib/domain";
import { cn } from "@/lib/cn";

// ============================================================================
// TYPES
// ============================================================================

interface InstrumentBezelProps {
  label: string;
  sublabel?: string;
  status?: AlertLevel;
  children: ReactNode;
  className?: string;
  scanlines?: boolean;
}

// ============================================================================
// LAMP VARIANT MAP
// ============================================================================

const LAMP_CLASS: Record<AlertLevel, string> = {
  OK: "mc-lamp mc-lamp--ok",
  WARNING: "mc-lamp mc-lamp--warning",
  CRITICAL: "mc-lamp mc-lamp--critical",
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * InstrumentBezel renders the chrome frame: corner ticks (4 absolutely-positioned
 * spans), a header strip (label + optional sublabel + status lamp), optional
 * scanlines overlay, and the body slot.
 */
export function InstrumentBezel({
  label,
  sublabel,
  status,
  children,
  className,
  scanlines = false,
}: InstrumentBezelProps) {
  return (
    <div className={cn("mc-bezel", className)}>
      {/* Corner ticks — 4 real spans for crispness */}
      <span className="mc-bezel__corner mc-bezel__corner--tl" aria-hidden="true" />
      <span className="mc-bezel__corner mc-bezel__corner--tr" aria-hidden="true" />
      <span className="mc-bezel__corner mc-bezel__corner--bl" aria-hidden="true" />
      <span className="mc-bezel__corner mc-bezel__corner--br" aria-hidden="true" />

      {/* Header strip */}
      <div className="mc-bezel__header">
        <span>{label}</span>
        {(sublabel ?? status) && (
          <span className="flex items-center gap-2">
            {sublabel && <span className="mc-bezel__header-sub">{sublabel}</span>}
            {status && (
              <span
                className={LAMP_CLASS[status]}
                role="img"
                aria-label={`Estado: ${status}`}
              />
            )}
          </span>
        )}
      </div>

      {/* Body */}
      <div className={cn("mc-bezel__body", scanlines && "mc-scanlines")}>
        {children}
      </div>
    </div>
  );
}
