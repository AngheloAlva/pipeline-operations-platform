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
  default: () => {
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
import { useCaptureStore, INITIAL_CAPTURE_SLICE, CaptureRecordKind } from "@/store/captureStore";
import { formatHours } from "@/components/capture/formKit";
import { MaintenanceFrequency } from "@/lib/domain";
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
    expect(screen.queryByText(/Cargando datos del sistema/i)).toBeTruthy();
  });

  it("does NOT crash when world transitions null → hydrated across re-renders", async () => {
    setParams(validId);

    // First render: null world (loading state)
    const { rerender } = render(<EquipmentPage />);
    expect(screen.queryByText(/Cargando datos del sistema/i)).toBeTruthy();

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
    expect(screen.getByText("Mantención")).toBeTruthy();
    expect(screen.getByText("Flujo de la estación")).toBeTruthy();
    expect(screen.getByText("Integridad de la estación")).toBeTruthy();
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

// ---------------------------------------------------------------------------
// MV-19 — hours → maintenance exhibit + capture provenance
// ---------------------------------------------------------------------------

describe("EquipmentPage — hours → maintenance exhibit (MV-19)", () => {
  // A seed equipment carrying at least one active BY_HOURS plan task.
  const hoursPlan = seedWorld.maintenancePlans.find(
    (p) =>
      p.isActive &&
      p.equipmentId &&
      p.tasks.some(
        (t) => t.frequency === MaintenanceFrequency.BY_HOURS && t.nextDueAtHours !== undefined,
      ),
  )!;
  const hoursEquipment = seedWorld.equipment.find((e) => e.id === hoursPlan.equipmentId)!;

  beforeEach(() => {
    useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
  });

  afterEach(() => {
    useCaptureStore.setState(INITIAL_CAPTURE_SLICE);
  });

  it("exhibits the accumulated operating hours and the usage-based outlook", async () => {
    setParams(hoursEquipment.id);
    await act(async () => {
      useWorldStore.setState({ world: seedWorld, loaded: true });
    });

    render(<EquipmentPage />);

    expect(screen.getByText("Horas de operación")).toBeTruthy();
    const accumulated = screen.getByText(/acumuladas/i);
    expect(accumulated.textContent).toContain(formatHours(hoursEquipment.operatingHours));
    // At least one remaining-hours line for the BY_HOURS task(s)
    expect(screen.getAllByText(/quedan|vencida por/i).length).toBeGreaterThan(0);
  });

  it("surfaces capture provenance when hours come from a committed capture", async () => {
    setParams(hoursEquipment.id);
    await act(async () => {
      useWorldStore.setState({ world: seedWorld, loaded: true });
      useCaptureStore.setState({
        records: [
          {
            id: "CAP-0001",
            kind: CaptureRecordKind.PUMP_RUN,
            values: { equipmentId: hoursEquipment.id, hoursRun: 8 },
            warnings: [],
            captureMeta: {
              authorId: seedWorld.operators[0].id,
              workstationId: seedWorld.workstations[0].id,
              enteredAt: "2026-06-12T20:30:00.000Z",
            },
          },
        ],
      });
    });

    render(<EquipmentPage />);

    const provenance = screen.getByText(/última captura/i);
    expect(provenance.textContent).toContain("+8 h");
    expect(provenance.textContent).toContain("CAP-0001");
    expect(provenance.textContent).toContain(seedWorld.operators[0].name);
  });
});
