"use client";

/**
 * SimControls — simulation play/pause/reset + speed selector.
 * SR-007: Spanish labels, instrument styling, accessible (aria-pressed, labels).
 * SR-015: borders-only aesthetic (no radius, no shadow).
 */

import { cn } from "@/lib/cn";
import { SIM_SPEEDS } from "@/lib/domain";
import { useSimulationStore, useIsRunning, useSpeedMultiplier } from "@/store/simulationStore";

// ============================================================================
// TYPES
// ============================================================================

type SimSpeed = (typeof SIM_SPEEDS)[number];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SimControls — bottom bar instrument panel.
 * Iniciar/Pausar, Restablecer, speed selector (1× 10× 60× 600×).
 */
export function SimControls() {
  const isRunning = useIsRunning();
  const speedMultiplier = useSpeedMultiplier();
  const start = useSimulationStore((state) => state.start);
  const pause = useSimulationStore((state) => state.pause);
  const reset = useSimulationStore((state) => state.reset);
  const setSpeed = useSimulationStore((state) => state.setSpeed);

  const monoStyle = { fontFamily: "var(--font-mono), monospace" };

  return (
    <div
      className="flex items-center gap-3 border-t border-border-mid bg-surface-raised px-6 py-3"
      role="toolbar"
      aria-label="Controles de simulación"
    >
      {/* Panel label */}
      <span
        className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary"
        style={monoStyle}
      >
        Simulación
      </span>

      {/* Separator */}
      <div className="h-5 w-px bg-border-mid" aria-hidden="true" />

      {/* Play / Pause toggle */}
      <button
        type="button"
        onClick={isRunning ? pause : start}
        aria-pressed={isRunning}
        aria-label={isRunning ? "Pausar simulación" : "Iniciar simulación"}
        className={cn(
          "flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest transition-colors",
          isRunning
            ? "border-status-warning bg-surface-interactive text-status-warning"
            : "border-status-flow bg-surface-interactive text-status-flow hover:bg-surface-overlay",
        )}
        style={monoStyle}
      >
        {isRunning ? (
          <>
            <PauseIcon />
            Pausar
          </>
        ) : (
          <>
            <PlayIcon />
            Iniciar
          </>
        )}
      </button>

      {/* Reset button */}
      <button
        type="button"
        onClick={reset}
        aria-label="Restablecer simulación"
        className="flex items-center gap-1.5 border border-border-mid px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
        style={monoStyle}
      >
        <ResetIcon />
        Restablecer
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-border-mid" aria-hidden="true" />

      {/* Speed selector */}
      <div className="flex items-center gap-1" role="group" aria-label="Velocidad de simulación">
        <span
          className="mr-1 text-[9px] uppercase tracking-[0.12em] text-ink-muted"
          style={monoStyle}
        >
          Vel.
        </span>
        {(SIM_SPEEDS as readonly SimSpeed[]).map((speed) => {
          const isActive = speedMultiplier === speed;
          return (
            <button
              key={speed}
              type="button"
              onClick={() => setSpeed(speed)}
              aria-pressed={isActive}
              aria-label={`Velocidad ${speed}×`}
              className={cn(
                "min-w-[36px] border px-2 py-1 text-[11px] tabular-nums transition-colors",
                isActive
                  ? "border-accent bg-surface-interactive text-accent"
                  : "border-border-mid text-ink-secondary hover:border-border-strong hover:text-ink-primary",
              )}
              style={monoStyle}
            >
              {speed}×
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// ICONS (inline SVG — no dependency)
// ============================================================================

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
