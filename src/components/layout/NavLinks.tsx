"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/cockpit", label: "Cockpit" },
  { href: "/maintenance", label: "Mantención" },
  { href: "/integrity", label: "Integridad" },
] as const;

// ============================================================================
// Inline nav (md+)
// ============================================================================

/**
 * Module selector — styled as a panel-selector row, not pill navigation.
 * Active module: bottom accent underline + bright ink. Control room aesthetic.
 * Visible only on md+ (640px+). Below md, MobileNav renders instead.
 */
function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación principal" className="hidden md:block">
      <ul className="flex items-stretch h-12">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex items-stretch">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center px-4 text-sm font-medium uppercase tracking-widest transition-colors",
                  "border-b-2",
                  isActive
                    ? "border-accent text-ink-primary"
                    : "border-transparent text-ink-tertiary hover:text-ink-secondary hover:border-border-strong",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ============================================================================
// Mobile nav (< md)
// ============================================================================

/**
 * Mobile nav — hamburger button + dropdown sheet with the 3 nav links.
 * ThemeToggle is included inside the sheet so it remains reachable on mobile.
 * Visible only below md.
 */
function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2 md:hidden">
      {/* Hamburger toggle */}
      <button
        type="button"
        aria-label="Abrir navegación"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded border transition-colors",
          "border-border-mid text-ink-secondary hover:border-border-strong hover:text-ink-primary",
          open && "border-accent text-accent",
        )}
      >
        {/* Hamburger / X icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="8" x2="21" y2="8" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="16" x2="21" y2="16" />
            </>
          )}
        </svg>
      </button>

      {/* Dropdown sheet */}
      {open && (
        <>
          {/* Invisible backdrop — closes menu on outside click */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={close}
          />

          {/* Menu panel */}
          <div
            id="mobile-nav-menu"
            role="dialog"
            aria-label="Menú de navegación"
            className={cn(
              "absolute right-4 top-12 z-50 min-w-[160px]",
              "border border-border-mid bg-surface-raised shadow-lg",
            )}
          >
            <nav aria-label="Navegación principal móvil">
              <ul className="flex flex-col">
                {NAV_ITEMS.map(({ href, label }) => {
                  const isActive =
                    pathname === href || pathname.startsWith(href + "/");
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={close}
                        className={cn(
                          "flex items-center px-4 py-3 text-sm font-medium uppercase tracking-widest transition-colors",
                          "border-l-2",
                          isActive
                            ? "border-accent bg-accent-dim text-ink-primary"
                            : "border-transparent text-ink-secondary hover:text-ink-primary hover:bg-surface-raised",
                        )}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Theme toggle inside mobile sheet */}
            <div className="border-t border-border-mid px-4 py-3">
              <ThemeToggle />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Public export — combines both nav variants
// ============================================================================

/**
 * NavLinks — exports both desktop (md+) and mobile (< md) nav variants.
 * The parent Header renders these; ThemeToggle on desktop comes from Header's right slot.
 */
export function NavLinks() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
