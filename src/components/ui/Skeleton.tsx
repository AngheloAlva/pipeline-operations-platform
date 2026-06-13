/**
 * Skeleton — minimal animate-pulse placeholder primitive.
 *
 * Used as Suspense fallback shells for module pages.
 * Uses Tailwind 4 surface/border tokens from globals.css.
 * No border-radius (flat instrument aesthetic).
 */

import { cn } from "@/lib/cn";

// ============================================================================
// Skeleton block
// ============================================================================

interface SkeletonProps {
  className?: string;
}

/**
 * A single grey pulse block. Compose these to build structural placeholders.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse bg-surface-raised border border-border-subtle", className)}
    />
  );
}

// ============================================================================
// Page-level skeleton shells
// ============================================================================

/**
 * CockpitSkeleton — structural placeholder for the cockpit page.
 * Mirrors a KPI row of 4 bars + a large panel block below.
 */
export function CockpitSkeleton() {
  return (
    <div className="mx-auto max-w-panel px-4 py-4 sm:px-6 flex flex-col gap-4" aria-hidden="true">
      {/* KPI row — 4 cards */}
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Main content panel */}
      <Skeleton className="h-64 w-full" />
      {/* Secondary panel */}
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * MaintenanceSkeleton — structural placeholder for the maintenance page.
 * Mirrors a KPI row + board/calendar layout.
 */
export function MaintenanceSkeleton() {
  return (
    <div className="mx-auto max-w-panel px-4 py-4 sm:px-6 flex flex-col gap-4" aria-hidden="true">
      {/* KPI row — 4 cards */}
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Board / list panel */}
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * IntegritySkeleton — structural placeholder for the integrity page.
 * Mirrors a KPI row + map + table layout.
 */
export function IntegritySkeleton() {
  return (
    <div className="mx-auto max-w-panel px-4 py-4 sm:px-6 flex flex-col gap-4" aria-hidden="true">
      {/* KPI row — 3 cards */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Map panel */}
      <Skeleton className="h-64 w-full" />
      {/* Table panel */}
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
