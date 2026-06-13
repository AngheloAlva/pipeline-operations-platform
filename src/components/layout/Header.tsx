import type { ReactNode } from "react";
import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

// ---------------------------------------------------------------------------
// Header props
// ---------------------------------------------------------------------------

interface HeaderProps {
  /**
   * Optional slot for client-island children rendered in the right section,
   * before the theme toggle.
   *
   * The slot exists but the cockpit route does NOT use it directly — SimClock
   * is injected via cockpit/layout.tsx's sub-header, keeping route-specific
   * simulation state out of the root Header Server Component. This is a
   * deliberate architectural choice (SR-008).
   *
   * Other routes may still pass children here for non-cockpit use cases.
   */
  children?: ReactNode;
}

/**
 * Application header — RSC shell. NavLinks is "use client" (usePathname),
 * ThemeToggle is "use client" (localStorage + DOM mutation).
 * The header itself stays a Server Component.
 *
 * Accepts an optional `children` slot so client islands (e.g., SimClock)
 * can be injected without converting the Header to a client component.
 *
 * Visual direction: Sala de Control — top rail of an instrument panel.
 * Flat, no shadow. Bottom border as hairline separation.
 */
export function Header({ children }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-mid bg-surface-raised">
      <div className="mx-auto flex h-12 max-w-panel items-center justify-between px-4 sm:px-6">
        {/* System identity — pipeline icon + name, left-anchored */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-medium uppercase tracking-widest text-ink-primary"
        >
          {/* Pipe cross-section icon — simplified pipeline schematic */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
            aria-hidden="true"
          >
            <path d="M2 12h20" />
            <path d="M6 8H2v8h4" />
            <path d="M18 8h4v8h-4" />
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          <span>Pipeline Ops</span>
        </Link>

        {/* Module selector — panel-style tab row */}
        <NavLinks />

        {/* Right slot — optional client island (e.g. SimClock) + theme toggle */}
        <div className="flex items-center gap-4">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
