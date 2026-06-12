import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Application header — RSC shell. NavLinks is "use client" (usePathname),
 * ThemeToggle is "use client" (localStorage + DOM mutation).
 * The header itself stays a Server Component.
 *
 * Visual direction: Sala de Control — top rail of an instrument panel.
 * Flat, no shadow. Bottom border as hairline separation.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-mid bg-surface-raised">
      <div className="mx-auto flex h-12 max-w-screen-xl items-center justify-between px-4 sm:px-6">
        {/* System identity — pipeline icon + name, left-anchored */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest text-ink-primary"
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

        {/* Right slot — theme toggle */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
