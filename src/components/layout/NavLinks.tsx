"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/cockpit", label: "Cockpit" },
  { href: "/maintenance", label: "Mantención" },
  { href: "/integrity", label: "Integridad" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación principal">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-surface-overlay text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-overlay",
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
