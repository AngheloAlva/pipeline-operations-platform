"use client";

/**
 * SimClock — client island for the cockpit simulation clock.
 * SR-008: reads simulatedTime via fine-grained selector, format "DD MMM YYYY · HH:mm:ss",
 *          Spanish locale month abbreviations, Geist Mono + tabular-nums.
 * The Header itself remains a Server Component — this is the ONLY client island inside it.
 */

import { useSimulatedTimeSeconds } from "@/store/simulationStore";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Spanish month abbreviations (all uppercase).
 * Index 0 = January.
 */
const MONTHS_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

/**
 * Format an epoch timestamp as "DD MMM YYYY · HH:mm:ss" in Spanish.
 * SR-008 req 4.
 */
function formatSimTime(epochMs: number): string {
  if (epochMs === 0) return "-- --- ---- · --:--:--";

  const d = new Date(epochMs);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = MONTHS_ES[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");

  return `${dd} ${mmm} ${yyyy} · ${hh}:${mm}:${ss}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SimClock renders the live simulated date/time in the Header.
 * Uses useSimulatedTimeSeconds() to floor simulatedTime to whole seconds before
 * subscribing — Object.is on the integer suppresses ~59 of 60 rAF re-renders
 * (the component only updates once per simulated second, not at 60fps).
 * SR-008.
 */
export function SimClock() {
  // useSimulatedTimeSeconds floors to seconds; sub-second ticks are invisible
  // to this component so it never re-renders within the same second.
  const simulatedTimeSeconds = useSimulatedTimeSeconds();
  // Convert back to ms for formatSimTime (which uses fractional ms for UTC parts)
  const simulatedTime = simulatedTimeSeconds * 1000;
  const display = formatSimTime(simulatedTime);

  return (
    <time
      dateTime={simulatedTime > 0 ? new Date(simulatedTime).toISOString() : undefined}
      className="text-[13px] tabular-nums text-ink-secondary"
      style={{ fontFamily: "var(--font-mono), monospace" }}
      aria-label={`Tiempo simulado: ${display}`}
    >
      {display}
    </time>
  );
}
