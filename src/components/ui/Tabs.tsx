/**
 * Tabs — controlled WAI-ARIA tablist (SR-202).
 *
 * Stateless RSC: no "use client". Parent owns the active state.
 * ARIA: role="tablist", role="tab", aria-selected, aria-controls.
 * Keyboard: Left/Right arrow keys move focus; Enter/Space activates.
 * No border-radius on tab buttons (flat, Sala de Control aesthetic).
 * No store imports.
 */

"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabItem {
  id: string;
  /** Spanish display label. */
  label: string;
}

export interface TabsProps {
  tabs: ReadonlyArray<TabItem>;
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Additional className for the tablist container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Horizontal WAI-ARIA tab bar.
 *
 * Controlled: parent provides activeTab and onTabChange.
 * Does NOT render panel content — content is provided by the parent.
 *
 * Keyboard model (SR-202 §7):
 * - Left/Right arrows: move focus (and activate) between tabs.
 * - Enter/Space: activate the focused tab.
 * - Home/End: jump to first/last tab.
 *
 * The "use client" directive is needed because we handle keyboard events.
 * The component remains stateless — all tab state lives in the parent.
 */
export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const btn = tabRefs.current[index];
    if (btn) btn.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowRight": {
        e.preventDefault();
        const next = (index + 1) % tabs.length;
        focusTab(next);
        onTabChange(tabs[next].id);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const prev = (index - 1 + tabs.length) % tabs.length;
        focusTab(prev);
        onTabChange(tabs[prev].id);
        break;
      }
      case "Home": {
        e.preventDefault();
        focusTab(0);
        onTabChange(tabs[0].id);
        break;
      }
      case "End": {
        e.preventDefault();
        const last = tabs.length - 1;
        focusTab(last);
        onTabChange(tabs[last].id);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        onTabChange(tabs[index].id);
        break;
      }
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Navegación de secciones"
      aria-orientation="horizontal"
      className={cn(
        "flex items-end border-b border-border-mid",
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            // Roving tabindex: active tab is in tab order, others are skipped
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              // Flat buttons — no border-radius (SR-202 §9)
              "px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors",
              // Active: bottom border accent + primary ink
              isActive
                ? "border-b-2 border-status-flow text-ink-primary"
                : "border-b-2 border-transparent text-ink-secondary hover:text-ink-primary",
            )}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
