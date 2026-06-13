"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/cockpit", label: "Cockpit" },
  { href: "/maintenance", label: "Mantención" },
  { href: "/integrity", label: "Integridad" },
] as const;

/**
 * Module selector — styled as a panel-selector row, not pill navigation.
 * Active module: bottom accent underline + bright ink. Control room aesthetic.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación principal">
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
