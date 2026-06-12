"use client";

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const EntityType = {
  STATION: "station",
  TANK: "tank",
  EQUIPMENT: "equipment",
  SEGMENT: "segment",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

interface SelectionState {
  selectedEntityId: string | null;
  selectedEntityType: EntityType | null;
}

interface SelectionActions {
  selectEntity: (id: string, type: EntityType) => void;
  clearSelection: () => void;
}

type SelectionStore = SelectionState & SelectionActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedEntityId: null,
  selectedEntityType: null,

  selectEntity: (id, type) => set({ selectedEntityId: id, selectedEntityType: type }),
  clearSelection: () => set({ selectedEntityId: null, selectedEntityType: null }),
}));

// ---------------------------------------------------------------------------
// Typed selector
// ---------------------------------------------------------------------------

export interface Selection {
  selectedEntityId: string | null;
  selectedEntityType: EntityType | null;
}

/** Returns the current selection state. */
export function useSelection(): Selection {
  return useSelectionStore((state) => ({
    selectedEntityId: state.selectedEntityId,
    selectedEntityType: state.selectedEntityType,
  }));
}
