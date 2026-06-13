/**
 * Not-found fallback for /equipment/[id].
 *
 * Rendered by Next.js when notFound() is called in the page
 * (e.g., when resolveEntity returns null or type !== EQUIPMENT).
 * F4-2-R3: must not crash; must render a graceful message + back link.
 */

import Link from "next/link";

/**
 * EquipmentNotFound — graceful not-found message with a back link.
 * Matches the minimal control-room aesthetic used across all modules.
 */
export default function EquipmentNotFound() {
  return (
    <div className="mx-auto max-w-panel px-4 py-16 sm:px-6 flex flex-col items-center gap-6">
      {/* Monospace ID label */}
      <p
        className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-muted"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        404 — Equipment not found
      </p>

      {/* Human-readable message */}
      <p className="text-[15px] text-ink-secondary text-center max-w-sm">
        The equipment ID you requested could not be found in the pipeline world.
        It may not exist or the ID format may be incorrect.
      </p>

      {/* Back navigation */}
      <Link
        href="/maintenance"
        className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-secondary border border-border-mid px-4 py-2 hover:bg-surface-raised transition-colors"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        Back to Maintenance
      </Link>
    </div>
  );
}
