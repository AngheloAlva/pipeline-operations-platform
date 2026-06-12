import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Application header — RSC shell. NavLinks is "use client" (usePathname),
 * ThemeToggle is "use client" (localStorage + DOM mutation).
 * The header itself stays a Server Component.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-raised">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
        {/* Logo / app title */}
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {/* Pipeline icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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

        {/* Navigation */}
        <NavLinks />

        {/* Right slot — theme toggle */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
