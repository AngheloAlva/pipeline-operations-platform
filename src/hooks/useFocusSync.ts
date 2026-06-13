"use client";

/**
 * useFocusSync — bidirectional URL ↔ selectionStore synchronization.
 * ADR-1: ?focus= param is authoritative ON MOUNT; store is authoritative AFTER.
 * Uses useSearchParams (read) and useRouter().replace (write) from next/navigation.
 * Loop guard: lastSyncedRef holds the last-synced id VALUE (not a boolean).
 * Safe to mount once per module page inside a <Suspense> boundary.
 *
 * ADR-5: optional onFocusStation callback fires when resolved stationId CHANGES.
 * Used by Maintenance to sync activeBoardFilter without cross-store imports.
 *
 * F4-1-R4, F4-1-R6, F4-1-R7, F4-1-R8
 */
import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSelectionStore } from "@/store/selectionStore";
import { useWorldData } from "@/hooks/useWorldData";
import { resolveEntity } from "@/lib/domain/resolveEntity";
import { parseFocusParam, serializeFocusParam } from "@/lib/focus/focusUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseFocusSyncOptions {
  /**
   * Called when the resolved stationId changes (ADR-5 Maintenance specialization).
   * Fires only when the stationId CHANGES — gated by lastStationRef.
   * Receives null when the resolved entity has no stationId or selection is cleared.
   */
  onFocusStation?: (stationId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mount once inside a <Suspense> boundary in each module page.
 * The <Suspense> wrapper is required because useSearchParams triggers CSR bailout otherwise.
 */
export function useFocusSync(options: UseFocusSyncOptions = {}): void {
  const { onFocusStation } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { world } = useWorldData();

  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);
  const selectEntity = useSelectionStore((s) => s.selectEntity);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  // Loop guard: holds the last id this hook synced in EITHER direction.
  // Comparing the actual value prevents both directions from re-triggering each other.
  const lastSyncedRef = useRef<string | null>(null);

  // Maintenance specialization guard: only fire onFocusStation when stationId changes.
  const lastStationRef = useRef<string | null>(undefined as unknown as null);

  // ---------------------------------------------------------------------------
  // READ direction: URL → store (mount + param change)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const urlFocus = parseFocusParam(searchParams.get("focus"));

    // Short-circuit: nothing in URL or already matches store
    if (!urlFocus) return;
    if (urlFocus === selectedEntityId) return;
    // Short-circuit: we just wrote this value ourselves
    if (urlFocus === lastSyncedRef.current) return;

    // Need world to resolve
    if (!world) return;

    const resolved = resolveEntity(world, urlFocus);
    if (resolved) {
      lastSyncedRef.current = urlFocus;
      selectEntity(resolved.id, resolved.type);

      // ADR-5: fire stationId callback on change
      if (onFocusStation) {
        const newStationId = resolved.stationId;
        if (newStationId !== lastStationRef.current) {
          lastStationRef.current = newStationId;
          onFocusStation(newStationId);
        }
      }
    } else {
      // Unknown/invalid id — F4-1-R7: clear selection, no crash
      clearSelection();

      // ADR-5: station cleared
      if (onFocusStation && lastStationRef.current !== null) {
        lastStationRef.current = null;
        onFocusStation(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, world]);

  // ---------------------------------------------------------------------------
  // WRITE direction: store → URL (after mount)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedEntityId) return;

    const urlFocus = parseFocusParam(searchParams.get("focus"));

    // Already in sync with URL
    if (selectedEntityId === urlFocus) return;
    // We just synced this value from the URL — don't write it back (loop guard)
    if (selectedEntityId === lastSyncedRef.current) return;

    lastSyncedRef.current = selectedEntityId;
    const param = serializeFocusParam(selectedEntityId);
    router.replace(`${pathname}?focus=${param}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityId]);
}
