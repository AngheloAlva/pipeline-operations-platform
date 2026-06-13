"use client";

/**
 * EquipmentTreeDrawer — mobile-only collapsible drawer for the EquipmentTree rail.
 *
 * On md+ screens this renders nothing (the static rail in the layout is used instead).
 * On < md screens this renders a toggle button ("Equipos") + a sliding overlay drawer
 * with EquipmentTree inside. The drawer closes when the user clicks the backdrop.
 *
 * Close-on-select is handled by subscribing to selectionStore via Zustand subscribe
 * (external system subscription — avoids setState-in-effect lint rule).
 */

import { useState, useEffect } from "react";
import { useSelectionStore } from "@/store/selectionStore";
import { EquipmentTree } from "./EquipmentTree";
import { cn } from "@/lib/cn";

export function EquipmentTreeDrawer() {
  const [open, setOpen] = useState(false);

  // Subscribe to selectionStore via Zustand's native subscribe (external system pattern).
  // useSelectionStore.subscribe is the store's vanilla subscribe — not a React hook,
  // so calling setOpen in the callback is safe (it's an external event handler, not render).
  useEffect(() => {
    let prevId = useSelectionStore.getState().selectedEntityId;
    const unsub = useSelectionStore.subscribe((state) => {
      const nextId = state.selectedEntityId;
      if (nextId !== null && nextId !== prevId) {
        setOpen(false);
      }
      prevId = nextId;
    });
    return unsub;
  }, []);

  function close() {
    setOpen(false);
  }

  return (
    // Only visible below md — the static aside rail handles md+ in the layout
    <div className="md:hidden">
      {/* Toggle button — positioned in the page flow, above the main content */}
      <button
        type="button"
        aria-label={open ? "Cerrar panel de equipos" : "Abrir panel de equipos"}
        aria-expanded={open}
        aria-controls="equipment-tree-drawer"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.1em]",
          "border border-border-mid bg-surface-raised text-ink-secondary transition-colors",
          "hover:border-border-strong hover:text-ink-primary",
          open && "border-accent text-accent",
        )}
      >
        {/* Equipment / menu icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        Equipos
      </button>

      {/* Overlay drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/40"
            aria-hidden="true"
            onClick={close}
          />

          {/* Drawer panel — slides in from the left */}
          <div
            id="equipment-tree-drawer"
            role="dialog"
            aria-label="Panel de equipos"
            className={cn(
              "fixed left-0 top-0 z-40 flex h-full w-64 flex-col",
              "border-r border-border-mid bg-surface-raised shadow-xl",
            )}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-border-mid px-4 py-2">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
                Equipos
              </p>
              <button
                type="button"
                aria-label="Cerrar panel de equipos"
                onClick={close}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-tertiary hover:text-ink-primary transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tree content */}
            <div className="flex-1 overflow-auto">
              <EquipmentTree />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
