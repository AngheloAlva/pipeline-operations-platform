/**
 * Render tests for /equipment/[id] page — catches CRITICAL #1 (hooks-order violation).
 *
 * TDD: written RED against the buggy code (hooks after conditional return),
 * then GREEN after the fix moves all hooks above any conditional return.
 *
 * Covers:
 *   1. Valid EQP id → no hooks error, three section headers rendered.
 *   2. Invalid id → notFound() path triggered (spy called).
 *   3. Regression guard: null-world render → hydrated-world re-render does NOT
 *      crash with hook count mismatch (exact CRITICAL #1 scenario).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock next/navigation — hoisted factory, no top-level variable references
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  notFound: vi.fn(() => {
    // notFound() in Next.js throws internally; simulate that behaviour
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// ---------------------------------------------------------------------------
// Mock next/dynamic — return a stub component synchronously in tests
// ---------------------------------------------------------------------------
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, _opts?: unknown) => {
    const Stub = () => <div data-testid="dynamic-stub" />;
    Stub.displayName = "DynamicStub";
    return Stub;
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { useParams, notFound } from "next/navigation";
import { useWorldStore } from "@/store/worldStore";
import seedData from "@/lib/data/seed.json";
import type { PipelineWorld } from "@/lib/domain";
import EquipmentPage from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const seedWorld = seedData as unknown as PipelineWorld;
const firstEquipment = seedWorld.equipment[0];
const validId = firstEquipment?.id ?? "EQP-0001";

function setParams(id: string) {
  vi.mocked(useParams).mockReturnValue({ id } as ReturnType<typeof useParams>);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(notFound).mockClear();
  // Reset world to null to simulate pre-hydration
  useWorldStore.setState({ world: null, loaded: false });
});

afterEach(() => {
  // Restore world to seed so subsequent tests are not affected
  useWorldStore.setState({ world: seedWorld, loaded: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EquipmentPage render tests — hooks-order regression (CRITICAL #1)", () => {
  it("renders loading state when world is null — no hooks-count error", () => {
    setParams(validId);
    // world is null (pre-hydration); must NOT throw a hooks-count error
    expect(() => render(<EquipmentPage />)).not.toThrow();
    expect(screen.queryByText(/Loading pipeline data/i)).toBeTruthy();
  });

  it("does NOT crash when world transitions null → hydrated across re-renders", async () => {
    setParams(validId);

    // First render: null world (loading state)
    const { rerender } = render(<EquipmentPage />);
    expect(screen.queryByText(/Loading pipeline data/i)).toBeTruthy();

    // Hydrate the store — simulates Zustand picking up the bundled seed
    await act(async () => {
      useWorldStore.setState({ world: seedWorld, loaded: true });
    });

    // Re-render after hydration — must NOT crash with hooks mismatch
    expect(() => rerender(<EquipmentPage />)).not.toThrow();
  });

  it("renders three section headers for a valid equipment id (hydrated world)", async () => {
    setParams(validId);

    await act(async () => {
      useWorldStore.setState({ world: seedWorld, loaded: true });
    });

    render(<EquipmentPage />);

    // The three mandatory section headers per spec F4-2-R4/R5
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(screen.getByText("Station Flow")).toBeTruthy();
    expect(screen.getByText("Station Integrity")).toBeTruthy();
  });

  it("calls notFound() for an unknown equipment id", async () => {
    setParams("EQP-INVALID-9999");

    await act(async () => {
      useWorldStore.setState({ world: seedWorld, loaded: true });
    });

    // notFound() throws NEXT_NOT_FOUND in our mock — render bails
    expect(() => render(<EquipmentPage />)).toThrow("NEXT_NOT_FOUND");
    // notFound spy must have been called at least once (React may call render
    // more than once in development/strict mode)
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });
});
