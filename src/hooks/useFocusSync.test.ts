/**
 * Tests for src/hooks/useFocusSync.ts — strict TDD, RED written first.
 * Covers the URL ↔ store bidirectional sync contract per ADR-1 and ADR-5.
 *
 * Mocking strategy:
 *   - next/navigation: vi.mock with factory returning controllable searchParams/router.
 *   - useWorldData: vi.mock — returns a fixed minimal world with known entities.
 *   - selectionStore: real Zustand store, reset between tests.
 *
 * F4-1-R4, F4-1-R6, F4-1-R7, F4-1-R8 / ADR-1 / ADR-5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { PipelineWorld } from "@/lib/domain";
import { useSelectionStore } from "@/store/selectionStore";
import { EntityType } from "@/store/selectionStore";

// ---------------------------------------------------------------------------
// next/navigation mock — factory pattern so each test can configure it
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();
const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    ({ get: mockSearchParamsGet }) as unknown as ReadonlyURLSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/cockpit",
}));

// ---------------------------------------------------------------------------
// useWorldData mock — provides a minimal world with known entities
// ---------------------------------------------------------------------------

const TEST_WORLD: PipelineWorld = {
  pipeline: {
    id: "PL-TEST",
    name: "Test Pipeline",
    diameterInches: 16,
    totalLengthKm: 100,
    segments: [],
  },
  stations: [
    {
      id: "STA-0001",
      name: "Station 1",
      kind: "PUMP_STATION",
      km: 10,
      pipelineId: "PL-TEST",
    },
    {
      id: "STA-0002",
      name: "Station 2",
      kind: "PUMP_STATION",
      km: 50,
      pipelineId: "PL-TEST",
    },
  ],
  tanks: [
    {
      id: "TNK-0001",
      tag: "T-001",
      stationId: "STA-0001",
      capacityM3: 5000,
      currentLevelM3: 2500,
      heightMm: 5000,
      product: "Medanito",
      apiGravity: 28,
      temperatureF: 70,
    },
  ],
  shippers: [],
  equipment: [
    {
      id: "EQP-0001",
      tag: "J-001",
      name: "Pump A",
      type: "PUMP",
      criticality: "HIGH",
      isOperational: true,
      stationId: "STA-0001",
      operatingHours: 100,
    },
  ],
  movements: [],
  volumeTargets: [],
  maintenancePlans: [],
  workOrders: [],
  cathodicReadings: [],
  telemetry: [],
};

vi.mock("@/hooks/useWorldData", () => ({
  useWorldData: () => ({ world: TEST_WORLD, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Import hook AFTER mocks are set up
// ---------------------------------------------------------------------------

import { useFocusSync } from "./useFocusSync";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the selection store to its initial state between tests. */
function resetSelectionStore() {
  useSelectionStore.setState({ selectedEntityId: null, selectedEntityType: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFocusSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
    resetSelectionStore();
  });

  // -------------------------------------------------------------------------
  // ADR-1: URL PRESENT → URL authoritative (hydrate store from URL)
  // -------------------------------------------------------------------------

  describe("URL present → URL authoritative", () => {
    it("calls selectEntity with the resolved id+type when URL has a valid ?focus= on mount", () => {
      // Arrange: URL has a known station id
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0001" : null));

      // Act
      renderHook(() => useFocusSync());

      // Assert: store reflects the URL value
      const state = useSelectionStore.getState();
      expect(state.selectedEntityId).toBe("STA-0001");
      expect(state.selectedEntityType).toBe(EntityType.STATION);
    });

    it("resolves equipment id from URL and selects it with EQUIPMENT type", () => {
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "EQP-0001" : null));

      renderHook(() => useFocusSync());

      const state = useSelectionStore.getState();
      expect(state.selectedEntityId).toBe("EQP-0001");
      expect(state.selectedEntityType).toBe(EntityType.EQUIPMENT);
    });

    it("resolves tank id from URL and selects it with TANK type", () => {
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "TNK-0001" : null));

      renderHook(() => useFocusSync());

      const state = useSelectionStore.getState();
      expect(state.selectedEntityId).toBe("TNK-0001");
      expect(state.selectedEntityType).toBe(EntityType.TANK);
    });
  });

  // -------------------------------------------------------------------------
  // ADR-1: URL ABSENT → store authoritative, reflected into URL
  // -------------------------------------------------------------------------

  describe("URL absent → store authoritative, reflected into URL", () => {
    it("calls router.replace with ?focus=<id> when URL is empty but store has a selection on mount", () => {
      // Arrange: URL empty, store pre-seeded with a selection
      mockSearchParamsGet.mockReturnValue(null);
      useSelectionStore.setState({
        selectedEntityId: "STA-0001",
        selectedEntityType: EntityType.STATION,
      });

      // Act
      renderHook(() => useFocusSync());

      // Assert: hook wrote the store selection to the URL
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("?focus=STA-0001"),
        expect.objectContaining({ scroll: false }),
      );
    });

    it("reflects store selection change into URL after mount", () => {
      // Arrange: no URL, no initial selection
      mockSearchParamsGet.mockReturnValue(null);

      renderHook(() => useFocusSync());

      // Act: change store after mount
      act(() => {
        useSelectionStore.getState().selectEntity("STA-0002", EntityType.STATION);
      });

      // Assert: new selection is written to URL
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("?focus=STA-0002"),
        expect.objectContaining({ scroll: false }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // ADR-1: URL has invalid/unknown id → clearSelection, no throw
  // -------------------------------------------------------------------------

  describe("URL has invalid/unknown id → clearSelection", () => {
    it("calls clearSelection and does not throw when ?focus= has an unknown id", () => {
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "NOTEXIST-0000" : null));

      // Should not throw
      expect(() => renderHook(() => useFocusSync())).not.toThrow();

      // Store must be cleared
      const state = useSelectionStore.getState();
      expect(state.selectedEntityId).toBeNull();
      expect(state.selectedEntityType).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Loop guard: no infinite router.replace calls
  // -------------------------------------------------------------------------

  describe("loop guard — no unbounded router.replace calls", () => {
    it("does not call router.replace more than once when URL and store are already in sync", () => {
      // URL is present with a known id — hook reads it, writes store, should NOT write URL back
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0001" : null));

      renderHook(() => useFocusSync());

      // Exact value: router.replace should NOT have been called (URL was authoritative, store was written)
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("calls router.replace at most once per distinct store value written", () => {
      // No URL — store drives
      mockSearchParamsGet.mockReturnValue(null);

      renderHook(() => useFocusSync());

      // Write same value twice
      act(() => {
        useSelectionStore.getState().selectEntity("STA-0001", EntityType.STATION);
      });
      act(() => {
        useSelectionStore.getState().selectEntity("STA-0001", EntityType.STATION);
      });

      // Should only have written once (same value, idempotent after first sync)
      const urlReplaceCount = mockReplace.mock.calls.filter((call) =>
        (call[0] as string).includes("STA-0001"),
      ).length;
      expect(urlReplaceCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // ADR-5: onFocusStation callback fires only when stationId CHANGES
  // -------------------------------------------------------------------------

  describe("onFocusStation — fires only on stationId change", () => {
    it("fires onFocusStation when a station is freshly focused", () => {
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0001" : null));
      const onFocusStation = vi.fn();

      renderHook(() => useFocusSync({ onFocusStation }));

      // STA-0001 is its own stationId — first focus fires
      expect(onFocusStation).toHaveBeenCalledTimes(1);
      expect(onFocusStation).toHaveBeenCalledWith("STA-0001");
    });

    it("does NOT fire onFocusStation when focusing a different entity in the same station", () => {
      const onFocusStation = vi.fn();

      // Focus STA-0001 first
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0001" : null));
      const { rerender } = renderHook(() => useFocusSync({ onFocusStation }));

      expect(onFocusStation).toHaveBeenCalledTimes(1); // first focus fires

      // Now focus EQP-0001 (also in STA-0001) — change params then reset store in act
      act(() => {
        mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "EQP-0001" : null));
        resetSelectionStore(); // clear so READ direction re-fires
      });

      rerender();

      // EQP-0001 belongs to STA-0001 → station didn't change → no additional fire
      expect(onFocusStation).toHaveBeenCalledTimes(1);
    });

    it("fires onFocusStation again when stationId changes (focus crosses station boundary)", () => {
      const onFocusStation = vi.fn();

      // Focus STA-0001 first
      mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0001" : null));
      const { rerender } = renderHook(() => useFocusSync({ onFocusStation }));

      expect(onFocusStation).toHaveBeenCalledTimes(1);
      expect(onFocusStation).toHaveBeenLastCalledWith("STA-0001");

      // Now focus STA-0002 (different station) — change params and reset store in act
      act(() => {
        mockSearchParamsGet.mockImplementation((key) => (key === "focus" ? "STA-0002" : null));
        resetSelectionStore();
      });

      rerender();

      // Station changed → fires again
      expect(onFocusStation).toHaveBeenCalledTimes(2);
      expect(onFocusStation).toHaveBeenLastCalledWith("STA-0002");
    });

    it("does NOT fire onFocusStation for null → null transitions", () => {
      // No URL, no selection → null stationId never set
      mockSearchParamsGet.mockReturnValue(null);
      const onFocusStation = vi.fn();

      renderHook(() => useFocusSync({ onFocusStation }));

      // Nothing was focused — no stationId transition happened
      expect(onFocusStation).not.toHaveBeenCalled();
    });
  });
});
