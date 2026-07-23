"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REPORT_CARDS } from "@/app/reportes/reportCatalog";

const MONO_STYLE = { fontFamily: "var(--font-mono), monospace" } as const;

const STEP_LINK_CLASS =
  "inline-flex items-center gap-1.5 border border-border-mid px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-secondary transition-colors hover:border-accent hover:text-accent";

/**
 * Reports module toolbar (MV-33). Two controls sit above every report page:
 *   - a back link to the /reportes index, and
 *   - previous/next steppers that walk the report catalog in order.
 *
 * The steppers wrap around at both ends, so a demo walkthrough can keep
 * advancing (◀ / ▶) without returning to the index. Renders nothing on the
 * /reportes index itself — there is no report to step from there.
 */
export function ReportNav() {
  const pathname = usePathname();
  const index = REPORT_CARDS.findIndex(
    (card) => pathname === card.href || pathname.startsWith(card.href + "/"),
  );

  // Not on a report page (e.g. the /reportes index) — nothing to step through.
  if (index === -1) return null;

  const total = REPORT_CARDS.length;
  const current = REPORT_CARDS[index];
  const prev = REPORT_CARDS[(index - 1 + total) % total];
  const next = REPORT_CARDS[(index + 1) % total];

  return (
    <div className="border-b border-border-subtle bg-surface-raised">
      <nav
        aria-label="Navegación entre reportes"
        className="mx-auto flex max-w-panel flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
      >
        {/* Back to the report index */}
        <Link
          href="/reportes"
          className="inline-flex items-center gap-1.5 border border-border-mid px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-secondary transition-colors hover:border-accent hover:text-accent"
          style={MONO_STYLE}
        >
          <span aria-hidden="true">←</span> Volver a Reportes
        </Link>

        {/* Previous · position · next */}
        <div className="flex items-center gap-2">
          <Link
            href={prev.href}
            aria-label={`Reporte anterior: ${prev.title}`}
            className={STEP_LINK_CLASS}
            style={MONO_STYLE}
          >
            <span aria-hidden="true">◀</span>
            <span className="hidden sm:inline">{prev.title}</span>
          </Link>

          <span
            className="text-[11px] uppercase tracking-[0.12em] tabular-nums text-ink-tertiary"
            style={MONO_STYLE}
          >
            {current.title} · {index + 1}/{total}
          </span>

          <Link
            href={next.href}
            aria-label={`Reporte siguiente: ${next.title}`}
            className={STEP_LINK_CLASS}
            style={MONO_STYLE}
          >
            <span className="hidden sm:inline">{next.title}</span>
            <span aria-hidden="true">▶</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
