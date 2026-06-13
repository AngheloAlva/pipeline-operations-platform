"use client";

/**
 * CrossNavLinks — shared presentational cross-module navigation component.
 *
 * F4-3-R1: renders next/link elements (NEVER useRouter) for cross-module navigation.
 * F4-3-R2: reused in Cockpit ContextPanel, Maintenance board, Integrity ReadingDetail,
 *          and /equipment/[id] aggregate page.
 *
 * Link decision rules (ADR-4):
 * - Equipment hub link (/equipment/<id>): ONLY when entity.type === EQUIPMENT.
 * - Direct module links (cockpit/maintenance/integrity): rendered for non-excluded modules
 *   EXCEPT when buildFocusHref returns null (no bridge, e.g. CATHODIC_POINT with null stationId).
 * - Returns null for a null entity — no crash (F4-3-R8).
 *
 * Props:
 *   entity  — resolved entity (id, type, stationId)
 *   exclude — modules to omit from the rendered links (current module)
 */

import Link from "next/link";
import { EntityType } from "@/store/selectionStore";
import type { ResolvedEntity } from "@/lib/domain/resolveEntity";
import { buildFocusHref } from "@/lib/focus/focusUrl";
import type { ModuleKey } from "@/lib/focus/focusUrl";
import { cn } from "@/lib/cn";

// ============================================================================
// Types
// ============================================================================

export type CrossNavModule = "cockpit" | "maintenance" | "integrity" | "equipment";

export interface CrossNavLinksProps {
  entity: ResolvedEntity | null;
  /** Modules to omit — typically the one the user is currently in. */
  exclude?: CrossNavModule[];
}

// ============================================================================
// Link metadata
// ============================================================================

const MODULE_LABELS: Record<CrossNavModule, string> = {
  cockpit: "Ver en Cockpit",
  maintenance: "Ver en Mantención",
  integrity: "Ver en Integridad",
  equipment: "Ver detalle de equipo",
};

const DIRECT_MODULES: CrossNavModule[] = ["cockpit", "maintenance", "integrity"];

// ============================================================================
// Component
// ============================================================================

/**
 * CrossNavLinks renders "View in X" next/link elements for the resolved entity.
 *
 * - Equipment hub link only when entity.type === EQUIPMENT.
 * - Module links omitted when their href is null (null stationId bridge case).
 * - Returns null (no DOM) when entity is null.
 */
export function CrossNavLinks({ entity, exclude = [] }: CrossNavLinksProps) {
  if (!entity) return null;

  const links: Array<{ module: CrossNavModule; href: string }> = [];

  // Equipment hub link — ONLY for EQUIPMENT entities (ADR-4)
  if (entity.type === EntityType.EQUIPMENT && !exclude.includes("equipment")) {
    const href = buildFocusHref(entity, "equipment" as ModuleKey);
    if (href) {
      links.push({ module: "equipment", href });
    }
  }

  // Direct module links (cockpit, maintenance, integrity)
  for (const mod of DIRECT_MODULES) {
    if (exclude.includes(mod)) continue;
    const href = buildFocusHref(entity, mod as ModuleKey);
    // CRITICAL: omit links where buildFocusHref returns null — never render ?focus=null
    if (!href) continue;
    links.push({ module: mod, href });
  }

  if (links.length === 0) return null;

  return (
    <nav
      aria-label="Cross-module navigation"
      className="flex flex-wrap gap-2 border-t border-border-subtle pt-3 mt-3"
    >
      {links.map(({ module, href }) => (
        <Link
          key={module}
          href={href}
          className={cn(
            "inline-flex items-center gap-1.5",
            "border border-border-mid bg-surface-base px-3 py-1.5",
            "text-[11px] font-medium uppercase tracking-[0.1em] text-ink-secondary",
            "transition-colors hover:border-accent hover:text-ink-primary",
          )}
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {MODULE_LABELS[module]}
        </Link>
      ))}
    </nav>
  );
}
